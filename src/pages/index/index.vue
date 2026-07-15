<template>
  <view class="page">
    <NavBar />

    <!-- 手记册入口：有页才出现，线条小册子图标，与 ⚙ 同尺寸并排其左侧；无红点无 badge（记忆不追人）。
         第一页诞生前整个入口不渲染（无空册子状态）。 -->
    <view
      v-if="hasDiaryPages"
      class="diary-entry"
      :class="{ 'diary-entry--wiggling': guideWiggling }"
      hover-class="u-press"
      @tap="openDiaryNotebook"
    >
      <!-- 注意力交接涟漪（引导关闭后一次性播放，之后永远安静） -->
      <view v-if="guideRippling" class="dn-ripple dn-ripple--1"></view>
      <view v-if="guideRippling" class="dn-ripple dn-ripple--2"></view>
      <!-- 线条小册子：纯 CSS 绘制（mp-weixin 的 <image> 不渲染 SVG data-URI，改用 view+border 保证真机可见）。
           单色走 --c-subtle，与 ⚙ 同色；封面 + 书脊 + 两道书写横线。 -->
      <view class="dn-book">
        <view class="dn-book__spine"></view>
        <view class="dn-book__line dn-book__line--1"></view>
        <view class="dn-book__line dn-book__line--2"></view>
      </view>
    </view>

    <!-- 手记册首启引导（2026-07-13 用户定稿 A+B，动效样机 artifact dab883db）：
         挖孔聚光蒙层锚定右上角入口 + 指向式引导卡；关闭后涟漪+摇曳把注意力交回图标。
         一次性（onboardingHintsSeen: diary-notebook-entry-v2），点亮孔里的图标=关闭并直接进册子。 -->
    <view
      v-if="showNotebookGuide"
      class="nb-guide"
      :class="{ 'nb-guide--leaving': guideLeaving, 'nb-guide--measuring': !guideReady }"
    >
      <view class="nb-guide__mask" :style="guideMaskStyle"></view>
      <view v-if="guideHole" class="nb-guide__ring" :style="guideRingStyle"></view>
      <view v-if="guideHole" class="nb-guide__hit" :style="guideRingStyle" @tap="dismissNotebookGuide(true)"></view>
      <view class="nb-guide__callout" :style="guideCalloutStyle">
        <view v-if="guideHole" class="nb-guide__arrow" :style="guideArrowStyle"></view>
        <view class="nb-guide__text">你的手记册长出了第一页，就收在这里，想它了随时翻回来看看。册子里的每一页和图鉴的回顾，点开都有「保存这一页」，能做成带照片的图文卡片；做完但没聊、没留下内容的，不会成页，也就做不成卡片——想留卡片的话，聊一句或发张照片就够了。</view>
        <view class="nb-guide__btn" hover-class="u-press" @tap="dismissNotebookGuide(false)">知道了</view>
      </view>
    </view>

    <DiaryNotebook v-if="showDiaryNotebook" @close="showDiaryNotebook = false" />

    <BreathingGuide v-if="!breathingDone" @done="onBreathingDone" />
    <template v-else>
      <!-- 主区域（remove-pushflow：场景三选已移除，场景信息来自档案 scene_tags） -->
      <template v-if="!flowActive">
        <!-- 没有任务区块时整组居中（与脚注的 margin-top:auto 平分空间）；有任务后回到顶部布局 -->
        <view class="home-header" :class="{ 'home-header--centered': !myTasks.length && !todayCompleted.length }">
          <view class="home-header__title">让我们做点什么有意思的小事</view>
          <view class="home-header__subtitle">希望你好好生活，和日子常见常新</view>
        </view>

        <!-- 即时入口：零决策抽一条，承接旧推送层"焦虑那一刻立刻做一件小事"的职责 -->
        <view class="instant-entry" hover-class="u-press" @tap="startInstant">现在就来一件</view>

        <!-- 每日任务入口（常驻，可随时重新打开日推卡片） -->
        <view class="daily-card-entry" hover-class="u-press" @tap="reopenDailyCard">今日任务候选</view>

        <!-- 三件幸福小事：常驻轻入口，聊即是做，无完成态无角标（three-good-things） -->
        <view class="daily-card-entry" hover-class="u-press" @tap="openThreeGoodThings">今天有什么让你觉得幸福的小事</view>

        <!-- 静一下：呼吸引导退成主动入口（breathing-entry），无角标无记录，点了才展开 -->
        <view class="quiet-entry" hover-class="u-press" @tap="showBreathingOverlay = true">
          <text class="quiet-entry__icon">◡</text>
          <text class="quiet-entry__label">静一下</text>
        </view>
        <FirstTimeHint
          v-if="!showBasicInfoOverlay && !showDailyCard"
          hint-key="quiet-entry"
          text="“静一下”是一段跟着呼吸慢下来的小引导，想歇一会儿的时候可以点开。"
        />
      </template>

      <!-- 已领取任务区块 -->
      <view v-if="!flowActive && myTasks.length" class="daily-tasks-block">
        <FirstTimeHint hint-key="claimed-tasks" text="选择了就去做吧，请体验这个过程。做完可以回来点击“做完啦”。" />
        <view class="daily-tasks-block__title">我的日常任务</view>
        <DailyTaskItem
          v-for="task in myTasks"
          :key="task.id"
          :task="task"
          @select="enterDailyTask"
        />
      </view>

      <!-- 今日已完成区块 -->
      <view v-if="!flowActive && todayCompleted.length" class="daily-tasks-block">
        <view class="daily-tasks-block__title">今日已完成</view>
        <view
          v-for="task in todayCompleted"
          :key="task.id"
          class="completed-task-item"
        >
          <text class="completed-task-item__title">{{ task.title }}</text>
          <view class="completed-task-item__btn" hover-class="u-press" @tap="chatCompletedTask(task)">聊聊</view>
        </view>
      </view>

      <!-- 册页脚注：压花标本 + 采集标注。margin-top:auto 钉在页底，
           有任务区块时自然跟在其后——空白从"没做完"变成"册页的留白"。
           点一下植物：一阵风刮过，叶片逐片摇曳，标语随风换一句。
           （压花内联绘制而非独立组件：小程序端自定义组件样式隔离会让它整个不渲染） -->
      <view v-if="!flowActive" class="home-footer">
        <view class="home-footer__art" @tap="blowWind">
          <view class="sprig" :class="{ 'sprig--wind': windActive }">
            <view class="sprig__gust sprig__gust--1"></view>
            <view class="sprig__gust sprig__gust--2"></view>
            <view class="sprig__stem"></view>
            <view class="sprig__leaf sprig__leaf--1"><view class="sprig__blade"></view></view>
            <view class="sprig__leaf sprig__leaf--2"><view class="sprig__blade"></view></view>
            <view class="sprig__leaf sprig__leaf--3"><view class="sprig__blade"></view></view>
            <view class="sprig__leaf sprig__leaf--4"><view class="sprig__blade"></view></view>
            <view class="sprig__leaf sprig__leaf--5"><view class="sprig__blade"></view></view>
            <view class="sprig__leaf sprig__leaf--6"><view class="sprig__blade"></view></view>
            <view class="sprig__bud"></view>
          </view>
        </view>
        <view class="home-footer__line" :class="{ 'home-footer__line--fading': lineFading }">{{ currentLine }}</view>
      </view>

      <!-- 每日任务完成流程 / 已完成条目补聊（DailyTaskFlow：detail → invite → chat；
           拆分自本页面，push-flow 样式随组件走，见 styles/push-flow.css） -->
      <DailyTaskFlow
        v-if="dailyFlow"
        :task="dailyFlow.task"
        :initial-completion-event-id="dailyFlow.completionEventId"
        :entry="dailyFlow.entry"
        @completed="onFlowCompleted"
        @close="onDailyFlowClose"
      />

      <!-- 现在就来一件（InstantFlow：card → invite → chat，同上拆分） -->
      <InstantFlow
        v-if="instantActive"
        :weather-text="cardWeatherText"
        @completed="onFlowCompleted"
        @close="onInstantClose"
      />

      <!-- 三件幸福小事：聊即是做，专用开场白+system prompt（three-good-things） -->
      <ChatView
        v-if="threeGoodThingsStep === 'chat'"
        :conversation-id="threeGoodThingsConversationId"
        :content-title="threeGoodThingsTitle"
        :instructions="threeGoodThingsInstructions"
        :previous-summary="null"
        :opening-text-override="threeGoodThingsOpeningText"
        :system-prompt-override="threeGoodThingsSystemPrompt"
        @close="exitThreeGoodThings"
      />
    </template>

    <!-- 日推卡片（全屏遮罩，overlay 所有内容） -->
    <DailyCard
      v-if="showDailyCard"
      :player-info="playerInfo"
      :city="cardCity"
      :weather-text="cardWeatherText"
      :temp="cardTemp"
      :air-quality="cardAirQuality"
      :warning="cardWarning"
      :candidates="cardCandidates"
      :completed-yesterday="completedYesterday"
      @claim="onCardClaim"
      @close="closeDailyCard"
      @go-basic-info="openBasicInfoFromCard"
      @clear-completed="onClearCompleted"
      @chat-completed="chatCompletedTask"
    />

    <!-- 静一下：覆盖层复用呼吸引导，用完即走，不留任何状态/记录/埋点 -->
    <view v-if="showBreathingOverlay" class="breathing-overlay">
      <BreathingGuide @done="showBreathingOverlay = false" />
    </view>

    <TracePage
      v-if="tracePage"
      :title="tracePage.title"
      :completed-at="tracePage.completedAt"
      :summary-text="tracePage.summaryText"
      :photo-thumb="tracePage.photoThumb"
      :photos="tracePage.photos"
      @close="tracePage = null"
    />

    <!-- 从日推卡片跳转的基本信息设置（独立遮罩，已拆为组件） -->
    <BasicInfoOverlay v-if="showBasicInfoOverlay" @close="closeBasicInfoOverlay" />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import BreathingGuide from '@/components/BreathingGuide.vue'
import DailyCard from '@/components/DailyCard.vue'
import DailyTaskItem from '@/components/DailyTaskItem.vue'
import ChatView from '@/components/ChatView.vue'
import FirstTimeHint from '@/components/FirstTimeHint.vue'
import { hasSeenHint, markHintSeen } from '@/state/onboardingHints.js'
import TracePage from '@/components/TracePage.vue'
import DiaryNotebook from '@/components/DiaryNotebook.vue'
import DailyTaskFlow from '@/components/DailyTaskFlow.vue'
import InstantFlow from '@/components/InstantFlow.vue'
import BasicInfoOverlay from '@/components/BasicInfoOverlay.vue'
import { hasAnyDiaryPage } from '@/state/diaryNotebook.js'
import { get, set, KEYS } from '@/state/storage.js'
import { getBasicInfo } from '@/state/basicInfo.js'
import { getUncompletedTasks, getTodayCompleted, getPrevDayCompleted, clearPrevDayCompleted } from '@/state/dailyTaskPool.js'
import { getDailyTaskCandidates } from '@/content/library.js'
import { getCity } from '@/api/location.js'
import { getEnvironmentInfo } from '@/api/weather.js'
import { getCompletionEvent } from '@/state/completionEvent.js'
import { getDiaryPageForEvent, getSummaryPhotos } from '@/state/conversation.js'
import { archiveChatOnExit } from '@/utils/archiveChatOnExit.js'
import { resolveTodayEntry, THREE_GOOD_THINGS_TITLE, THREE_GOOD_THINGS_SUMMARY_CONTEXT } from '@/state/threeGoodThings.js'
import { buildThreeGoodThingsSystemPrompt } from '@/api/qwen.js'

function getTodayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// breathing-entry 5.2：存量用户推断——已经有基本信息或完成记录的，视为已经过了"第一次"，
// 不用等一个新字段慢慢补数据。只在这个字段还没写过的时候用到（见 data() 里的调用点）。
function hasPriorUsage() {
  const info = getBasicInfo()
  const hasBasicInfo = !!(info.player_id || info.birth_date || info.scene_tags?.length)
  const hasCompletionEvents = get(KEYS.COMPLETION_EVENTS, []).length > 0
  return hasBasicInfo || hasCompletionEvents
}

// 扉页标注语料（首页底部压花下的每日一句，"采集标注"叙事）。
// 正式语料 25 句（2026-07-13 产品定稿，点叶子刮风轮换）。每日固定一句，不随进入次数变化。
const FLYLEAF_LINES = [
  '你的存在即是意义',
  '忧虑就像为自己不想要的东西祈祷',
  '要么成功，要么学到经验',
  '允许任何感受流经我，接受它，然后放下',
  '你是树上最甜的苹果，但有的人只是不喜欢苹果',
  '向外求求而不得，向内求生生不息',
  '你无法说服别人爱上你，真正的爱是双向流动的',
  '生活10%是发生在你身上的事，90%是你如何应对它',
  '我愿意把每件发生在我身上的事看作生命赋予的礼物',
  '凭风指引，且听风吟',
  '用宏大世界来稀释痛苦，在微小事件中感受幸福',
  '那些以为走不出来的雨季，成为滋养生命的河流',
  '心平能愈三千疾',
  '有了目的地才会迷路，我来地球只是散步',
  '首先是自己，其次才是谁的谁',
  '我的勇气永远是可再生资源',
  '不做退缩的涟漪，不当徘徊的浮萍',
  '不要相信手掌的纹路，要相信十指攥成拳的力量',
  '我会成为潺潺的溪水，\n有一往无前的自信和绝不回头的勇气',
  '别人的偏见和浮躁是他的课题，\n我的从容与成长是脚下的路',
  '我睁开眼睛的那天，我就是世界的主角',
  '快乐的意思是，你要赶快出发，去寻找生活的乐子',
  '我不再需要答案，因为我决定做回自己',
  '不要为任何人牺牲内心的宁静',
  '人生难免会有下雨的日子，但终究会放晴',
]

export default {
  name: 'IndexPage',
  components: { NavBar, BreathingGuide, DailyCard, DailyTaskItem, ChatView, FirstTimeHint, TracePage, DiaryNotebook, DailyTaskFlow, InstantFlow, BasicInfoOverlay },
  data() {
    // breathing-entry：呼吸引导只在真正的第一次启动强制出现。已持久化标记为true、或存量用户
    // 推断命中时，直接跳过——推断命中的情况顺手把标记也落盘，往后不用再推断。
    const introAlreadyDone = get(KEYS.BREATHING_INTRO_DONE, false)
    const breathingDone = introAlreadyDone || hasPriorUsage()
    if (breathingDone && !introAlreadyDone) {
      set(KEYS.BREATHING_INTRO_DONE, true)
    }
    return {
      breathingDone,
      showBreathingOverlay: false, // "静一下"主动入口：覆盖层展示呼吸引导，跟首次启动的强制引导是两回事
      dailyCardPending: false, // 日推卡片待显示（等呼吸完成）
      dailyCardScheduled: false, // 本次会话已调度（防止 onShow 多次触发）
      basicInfoBeforeCard: false, // 需要先填基本信息再弹卡片
      // 日推卡片
      showDailyCard: false,
      playerInfo: {},
      cardCity: null,
      cardWeatherText: null,
      cardTemp: null,
      cardAirQuality: null,
      cardWarning: null,
      cardCandidates: [],
      // 已领取任务区块
      myTasks: [],
      todayCompleted: [],
      completedYesterday: [],
      // 每日任务完成流程 / 补聊（状态机在 DailyTaskFlow 组件内）：
      // null | { task, completionEventId: string|null, entry: 'detail'|'chat' }
      dailyFlow: null,
      // 现在就来一件（状态机在 InstantFlow 组件内）
      instantActive: false,
      // 三件幸福小事（three-good-things）：聊即是做，一天至多一页
      threeGoodThingsStep: null, // null | 'chat'
      threeGoodThingsConversationId: null,
      threeGoodThingsTitle: THREE_GOOD_THINGS_TITLE,
      threeGoodThingsInstructions: THREE_GOOD_THINGS_SUMMARY_CONTEXT,
      threeGoodThingsOpeningText: '今天有没有什么让你觉得幸福的小事？吃到的一口好东西、赶上的一趟车、一句让你愣了一下的话——想到几件说几件，想到一件也算数。',
      threeGoodThingsSystemPrompt: buildThreeGoodThingsSystemPrompt(),
      // 重逢弹层（trace-reencounter）：今日/昨日完成条目里有日记页的，点开展示这一页
      tracePage: null,
      // 手记册（diary-notebook）：有页才出现入口，点开全屏 overlay 翻阅
      hasDiaryPages: hasAnyDiaryPage(),
      showDiaryNotebook: false,
      // 手记册首启引导（A 挖孔聚光 + B 注意力交接）
      showNotebookGuide: false,
      guideReady: false, // 挂载后先量测再显形，避免定位前闪现
      guideLeaving: false,
      guideHole: null, // { x, y, winW }：图标中心相对引导层原点的坐标（运行时量测，双端一致）
      guideWiggling: false,
      guideRippling: false,
      // 从日推卡片跳转的基本信息设置
      showBasicInfoOverlay: false,
      // 压花的风：点植物 → 叶片摇曳 + 标语随风换句
      windActive: false,
      lineFading: false,
      lineIndex: null, // null = 用当日种子句；点过之后按序轮换（仅会话内，不持久化）
    }
  },
  computed: {
    // 任一任务流（每日/即时/三件幸福小事）进行中时，主页内容整体隐藏
    flowActive() {
      return !!this.dailyFlow || this.instantActive || !!this.threeGoodThingsStep
    },
    // 当日一句：日期确定性取模，同一天进多少次都是同一句；刮过风后从它开始轮换
    currentLine() {
      const seedIndex = Number(getTodayDateStr().replace(/-/g, '')) % FLYLEAF_LINES.length
      return FLYLEAF_LINES[this.lineIndex ?? seedIndex]
    },
    // ---- 手记册首启引导的定位样式（图标位置运行时量测，量测失败退化为无孔纯蒙层+居中卡） ----
    guideMaskStyle() {
      if (!this.guideHole) return 'background: rgba(8, 16, 6, 0.55);'
      const { x, y } = this.guideHole
      return `background: radial-gradient(circle 30px at ${x}px ${y}px, rgba(8,16,6,0) 0px, rgba(8,16,6,0) 27px, rgba(8,16,6,0.55) 30px);`
    },
    // 注意：mp 端 uni 的 render 对 v-if 分支里的绑定也会求值，下面三个都必须自己兜住
    // guideHole 为 null 的情况（只靠模板 v-if 保护在 H5 够用、在 mp 会整页渲染崩掉）。
    guideRingStyle() {
      if (!this.guideHole) return ''
      const { x, y } = this.guideHole
      return `left: ${x - 30}px; top: ${y - 30}px;`
    },
    guideCalloutStyle() {
      if (!this.guideHole) return 'top: 40%; left: 32rpx; right: 32rpx;'
      return `top: ${this.guideHole.y + 38}px; right: 32rpx;`
    },
    guideArrowStyle() {
      if (!this.guideHole) return ''
      // 箭头对准图标中心：距卡片右缘 = 层宽右缘到图标中心 - 卡片右边距(16px) - 箭头半宽(7px)
      const { x, winW } = this.guideHole
      return `right: ${winW - x - 16 - 7}px;`
    },
  },
  onShow() {
    this.refreshMyTasks()
    this.refreshCompleted()
    this.refreshDiaryEntry()
    this.checkAndShowDailyCard()
  },
  watch: {
    // 任务流收起时（此刻新页可能刚归档出来）看一眼要不要放首启引导
    flowActive(active) {
      if (!active) this.maybeShowNotebookGuide()
    },
  },
  methods: {
    // 归档出新页后入口才该出现——回到首页/退出各聊天流程时重算一次（纯读取，不写任何键）
    refreshDiaryEntry() {
      this.hasDiaryPages = hasAnyDiaryPage()
      this.maybeShowNotebookGuide()
    },
    // 手记册首启引导：条件满足时延迟 400ms 出现（让首页先站稳）。
    // 定位：先以 opacity:0 挂载引导层，再同一坐标系量测图标与引导层两者的 rect 取相对坐标——
    // 绝对坐标在 H5 会差一个 uni 导航栏高度（选择器量测不含导航栏、fixed 层却含），相对坐标双端一致。
    maybeShowNotebookGuide() {
      if (this.showNotebookGuide || this.guideLeaving) return
      if (!this.hasDiaryPages || this.flowActive || this.showDiaryNotebook) return
      if (hasSeenHint('diary-notebook-entry-v2')) return
      setTimeout(() => {
        if (this.flowActive || this.showDiaryNotebook || this.showNotebookGuide) return
        this.guideReady = false
        this.showNotebookGuide = true
        this.$nextTick(() => {
          uni
            .createSelectorQuery()
            .in(this)
            .select('.diary-entry')
            .boundingClientRect()
            .select('.nb-guide')
            .boundingClientRect()
            .exec((res) => {
              const [icon, guide] = res || []
              if (icon && guide) {
                this.guideHole = {
                  x: icon.left + icon.width / 2 - guide.left,
                  y: icon.top + icon.height / 2 - guide.top,
                  winW: guide.width,
                }
              }
              this.guideReady = true
            })
        })
      }, 400)
    },
    // 关闭引导：知道了 → B 接力（涟漪+摇曳一次）；点亮孔里的图标 → 直接进册子（引导即入口）
    dismissNotebookGuide(openBook) {
      if (this.guideLeaving) return
      markHintSeen('diary-notebook-entry-v2')
      this.guideLeaving = true
      setTimeout(() => {
        this.showNotebookGuide = false
        this.guideLeaving = false
        if (openBook) {
          this.showDiaryNotebook = true
          return
        }
        setTimeout(() => {
          this.guideRippling = true
          this.guideWiggling = true
          setTimeout(() => {
            this.guideRippling = false
            this.guideWiggling = false
          }, 1400)
        }, 120)
      }, 220)
    },
    openDiaryNotebook() {
      this.showDiaryNotebook = true
    },
    // 刮一阵风：叶片逐片摇曳（CSS 负责），标语在风经过时淡出→换句→淡入。
    // 风还没停时不再起风（windActive 兼作节流）。
    blowWind() {
      if (this.windActive) return
      this.windActive = true
      this.lineFading = true
      const seedIndex = Number(getTodayDateStr().replace(/-/g, '')) % FLYLEAF_LINES.length
      setTimeout(() => {
        this.lineIndex = ((this.lineIndex ?? seedIndex) + 1) % FLYLEAF_LINES.length
        this.lineFading = false
      }, 300)
      setTimeout(() => {
        this.windActive = false
      }, 1200)
    },
    refreshMyTasks() {
      this.myTasks = getUncompletedTasks()
    },
    refreshCompleted() {
      this.todayCompleted = getTodayCompleted()
      this.completedYesterday = getPrevDayCompleted()
    },
    checkAndShowDailyCard() {
      const today = getTodayDateStr()
      const shown = get(KEYS.DAILY_CARD_SHOWN_DATE, '')
      if (shown === today) return
      // 会话级去重（防止同一次冷启动内 onShow 多次触发）
      if (this.dailyCardScheduled) return
      this.dailyCardScheduled = true

      if (!this.breathingDone) {
        // 呼吸还没做完，挂起——等 onBreathingDone 时再展示
        this.dailyCardPending = true
        return
      }
      this.triggerDailyCard()
    },
    onBreathingDone() {
      this.breathingDone = true
      set(KEYS.BREATHING_INTRO_DONE, true)
      if (this.dailyCardPending) {
        this.dailyCardPending = false
        this.triggerDailyCard()
      }
    },
    async triggerDailyCard(skipInfoGate = false) {
      const info = getBasicInfo()
      const isBlank = !info.player_id && !info.birth_date && !info.scene_tags?.length
      if (isBlank && !skipInfoGate) {
        // 首次使用：先引导填基本信息，保存后再弹卡片。
        // 只引导一次——用户点"返回"跳过时走 skipInfoGate，用通用候选出卡，
        // 绝不循环重弹（"不催促"是承诺，不是文案）。
        this.basicInfoBeforeCard = true
        this.showBasicInfoOverlay = true
        return
      }

      this.playerInfo = info
      const pool = getUncompletedTasks()
      const excludeIds = pool.map((t) => t.id)
      this.cardCandidates = getDailyTaskCandidates(this.playerInfo.scene_tags || [], excludeIds)
      this.completedYesterday = getPrevDayCompleted()

      set(KEYS.DAILY_CARD_SHOWN_DATE, getTodayDateStr())
      this.showDailyCard = true
      this.cardCity = null
      this.cardWeatherText = null
      this.cardTemp = null
      this.cardAirQuality = null
      this.cardWarning = null

      try {
        const coords = await getCity()
        if (coords) {
          const env = await getEnvironmentInfo(coords)
          this.cardCity = env.city
          this.cardWeatherText = env.weatherText
          this.cardTemp = env.temp
          this.cardAirQuality = env.airQuality
          this.cardWarning = env.warning
        }
      } catch (e) {
        console.error('[daily-card] location/weather error:', e)
      }
    },
    onCardClaim() {
      this.refreshMyTasks()
    },
    reopenDailyCard() {
      if (this.cardCandidates.length) {
        // 当天已初始化过，直接复用数据重新显示
        this.showDailyCard = true
      } else {
        // 尚未触发过（理论上不常见），走完整流程
        this.triggerDailyCard()
      }
    },
    closeDailyCard() {
      this.showDailyCard = false
    },
    onClearCompleted() {
      clearPrevDayCompleted()
      this.completedYesterday = []
    },
    // 今日/昨日已完成条目的"聊聊"入口：有日记页 -> 重逢弹层；没有 -> 走正常聊聊流程
    // （trace-reencounter：同一入口，按有没有页分支，不新增按钮）。
    chatCompletedTask(task) {
      const event = getCompletionEvent(task.completionEventId)
      const page = getDiaryPageForEvent(event)
      if (page) {
        this.tracePage = {
          title: task.title,
          completedAt: page.completed_at,
          summaryText: page.summary_text,
          photoThumb: page.photo_thumb ?? null,
          photos: getSummaryPhotos(page),
        }
        return
      }
      this.showDailyCard = false
      // 补聊：复用既有完成事件，直接进对话（不新建完成事件、不走完成一拍）
      this.dailyFlow = { task, completionEventId: task.completionEventId, entry: 'chat' }
    },
    openBasicInfoFromCard() {
      this.showDailyCard = false
      this.showBasicInfoOverlay = true
    },
    closeBasicInfoOverlay() {
      this.showBasicInfoOverlay = false
      if (this.basicInfoBeforeCard) {
        this.basicInfoBeforeCard = false
        // skipInfoGate：没填就返回也直接出卡（scene_tags 为空时命中通用候选），
        // 卡片里已有"去完善你的信息"入口兜底，不在这里把人锁住
        this.triggerDailyCard(true)
      }
    },
    // 每日任务完成流程：进入 = 挂载 DailyTaskFlow 组件（状态机在组件内）
    enterDailyTask(task) {
      this.dailyFlow = { task, completionEventId: null, entry: 'detail' }
    },
    startInstant() {
      this.instantActive = true
    },
    // 流程内产生完成事件（做完啦/移除）时刷新列表区块
    onFlowCompleted() {
      this.refreshMyTasks()
      this.refreshCompleted()
    },
    // 流程退出：先收起 UI，再后台补归档（"聊过就顺手归档"）+ 刷新手记入口。
    // 归档上下文由组件在 close 事件里带出——组件卸载后自身状态已不可用。
    async onInstantClose(payload) {
      this.instantActive = false
      await archiveChatOnExit(payload.conversationId, payload.title, payload.instructions)
      this.refreshDiaryEntry()
    },
    async onDailyFlowClose(payload) {
      this.dailyFlow = null
      await archiveChatOnExit(payload.conversationId, payload.title, payload.instructions)
      this.refreshDiaryEntry()
    },
    // 三件幸福小事：随时可记——点入口总是进对话（今天有未归档会话就续、否则开新的一段）。
    // 回看历史交给手记册，这里不再有"已归档只读重逢"分支（three-good-things）。
    openThreeGoodThings() {
      const { conversationId } = resolveTodayEntry()
      this.threeGoodThingsConversationId = conversationId
      this.threeGoodThingsStep = 'chat'
    },
    async exitThreeGoodThings() {
      const convId = this.threeGoodThingsConversationId
      this.threeGoodThingsStep = null
      this.threeGoodThingsConversationId = null
      await archiveChatOnExit(convId, this.threeGoodThingsTitle, this.threeGoodThingsInstructions)
      this.refreshDiaryEntry()
    },
  },
}
</script>

<style>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 88rpx;
  padding-bottom: 32rpx;
  /* H5 端 --window-top/--window-bottom 是导航栏/tabbar 高度，小程序端为 0 */
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
}

/* 手记册入口：与 NavBar 的 ⚙ 角标（right:20rpx，宽 64rpx）同尺寸，并排其左侧。
   right = 20 + 64 + 12(间隙) = 96rpx。无红点无 badge。 */
.diary-entry {
  position: fixed;
  top: 20rpx;
  right: 96rpx;
  z-index: 10;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 线条小册子（纯 CSS，双端可见）：封面 + 靠左书脊 + 两道书写横线，单色 --c-subtle */
.dn-book {
  position: relative;
  width: 34rpx;
  height: 42rpx;
  border: 2rpx solid var(--c-subtle);
  border-radius: 4rpx 7rpx 7rpx 4rpx;
  box-sizing: border-box;
}

.dn-book__spine {
  position: absolute;
  left: 8rpx;
  top: 0;
  bottom: 0;
  width: 2rpx;
  background: var(--c-subtle);
}

.dn-book__line {
  position: absolute;
  left: 14rpx;
  right: 6rpx;
  height: 2rpx;
  background: var(--c-subtle);
  opacity: 0.75;
}

.dn-book__line--1 {
  top: 14rpx;
}

.dn-book__line--2 {
  top: 24rpx;
}

/* ---- 手记册首启引导（A 挖孔聚光 + B 注意力交接）---- */
.nb-guide {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  transition: opacity 0.22s ease;
}

.nb-guide--leaving {
  opacity: 0;
}

.nb-guide--measuring {
  opacity: 0;
}

.nb-guide__mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  animation: fade-in 0.24s ease both;
}

/* 亮孔描边：一圈细纸色光边，标明"这里被点亮" */
.nb-guide__ring {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 1.5px solid rgba(243, 247, 240, 0.9);
  box-shadow: 0 0 0 1px rgba(8, 16, 6, 0.2);
  box-sizing: border-box;
  animation: fade-in 0.24s ease both;
}

/* 洞内点击热区（透明）：点亮孔里的图标=关闭引导并直接进册子 */
.nb-guide__hit {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
}

.nb-guide__callout {
  position: absolute;
  width: 592rpx;
  max-width: calc(100vw - 64rpx);
  background: var(--c-card);
  border-radius: 32rpx;
  padding: 40rpx 44rpx 36rpx;
  box-shadow: var(--sh-float);
  box-sizing: border-box;
  animation: rise-in 0.28s var(--ease-out) 0.12s both;
}

.nb-guide__arrow {
  position: absolute;
  top: -14rpx;
  width: 28rpx;
  height: 28rpx;
  background: var(--c-card);
  transform: rotate(45deg);
  border-radius: 4rpx 0 0 0;
}

.nb-guide__text {
  font-size: 28rpx;
  color: var(--c-ink);
  line-height: 1.85;
}

.nb-guide__btn {
  margin-top: 32rpx;
  text-align: center;
  padding: 22rpx 0;
  border-radius: 999rpx;
  background: var(--c-primary);
  color: #f0f5ef;
  font-size: 28rpx;
}

/* B：涟漪（引导关闭后从图标漾出两圈，一次性） */
@keyframes dn-ripple {
  0% {
    transform: scale(0.35);
    opacity: 0.55;
  }
  100% {
    transform: scale(2.3);
    opacity: 0;
  }
}

.dn-ripple {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border-radius: 50%;
  border: 1.5px solid var(--c-primary);
  box-sizing: border-box;
  pointer-events: none;
}

.dn-ripple--1 {
  animation: dn-ripple 0.9s var(--ease-out) both;
}

.dn-ripple--2 {
  animation: dn-ripple 1.05s var(--ease-out) 0.16s both;
}

/* B：册子摇曳（以底边为轴，一次即止） */
@keyframes dn-wiggle {
  0% {
    transform: rotate(0);
  }
  18% {
    transform: rotate(-8deg);
  }
  38% {
    transform: rotate(6deg);
  }
  58% {
    transform: rotate(-3.5deg);
  }
  78% {
    transform: rotate(1.5deg);
  }
  100% {
    transform: rotate(0);
  }
}

.diary-entry--wiggling .dn-book {
  animation: dn-wiggle 1.05s var(--ease-out) both;
  transform-origin: 50% 88%;
}

@media (prefers-reduced-motion: reduce) {
  .dn-ripple--1,
  .dn-ripple--2,
  .diary-entry--wiggling .dn-book {
    animation: none;
  }
  .nb-guide__callout {
    animation: fade-in 0.2s ease both;
  }
}

/* 任务区块 = 标本卡：贴在纸面底色上的白色卡片 */
.daily-tasks-block {
  width: calc(100% - 96rpx);
  margin: 40rpx 48rpx 0;
  padding: 32rpx 36rpx;
  background: var(--c-card);
  border: 1rpx solid var(--c-border);
  border-radius: 28rpx;
  box-shadow: var(--sh-card);
  box-sizing: border-box;
  animation: rise-in 0.32s var(--ease-out) both;
}

.daily-tasks-block__title {
  font-size: 26rpx;
  color: var(--c-muted);
  letter-spacing: 0.08em;
  margin-bottom: 8rpx;
}

.home-header {
  text-align: center;
  padding: 0 60rpx;
  animation: rise-in 0.32s var(--ease-out) both;
}

/* 空状态：标题组与脚注各带一个 auto 外边距，平分剩余空间 = 整组垂直居中 */
.home-header--centered {
  margin-top: auto;
}

.home-header__title {
  font-size: 40rpx;
  color: var(--c-ink);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.4;
}

.home-header__subtitle {
  margin-top: 14rpx;
  font-size: 26rpx;
  color: var(--c-subtle);
}

.instant-entry {
  margin-top: 44rpx;
  width: calc(100% - 120rpx);
  padding: 30rpx 0;
  text-align: center;
  font-size: 30rpx;
  letter-spacing: 0.02em;
  color: #f0f5ef;
  background: var(--c-primary);
  border-radius: 999rpx;
  box-shadow: var(--sh-card);
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.daily-card-entry {
  margin-top: 32rpx;
  width: calc(100% - 120rpx);
  padding: 22rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--c-muted);
  background: var(--c-card);
  border: 1rpx solid var(--c-border-s);
  border-radius: 999rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

/* 静一下：安静的主动入口，无角标无未读态——用不用都一个样子（breathing-entry） */
.quiet-entry {
  margin-top: 28rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 8rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.quiet-entry__icon {
  font-size: 26rpx;
  color: var(--c-subtle);
}

.quiet-entry__label {
  font-size: 24rpx;
  color: var(--c-subtle);
}

/* 静一下覆盖层：盖住整页，呼吸引导用完即走，不留状态 */
.breathing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--c-bg);
  z-index: 130;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-top: 88rpx;
  padding-bottom: 32rpx;
  box-sizing: border-box;
  animation: fade-in 0.2s ease both;
}

.completed-task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--c-border);
}

.completed-task-item__title {
  font-size: 28rpx;
  color: var(--c-subtle);
  flex: 1;
  padding-right: 20rpx;
}

.completed-task-item__btn {
  font-size: 26rpx;
  color: var(--c-primary);
  border: 1rpx solid var(--c-border-s);
  border-radius: 999rpx;
  padding: 16rpx 32rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

/* push-flow（手贴卡/邀请/撕胶带）样式已随 DailyTaskFlow / InstantFlow 组件
   迁至 styles/push-flow.css——mp-weixin 样式隔离下组件不吃页面样式 */
@media (prefers-reduced-motion: reduce) {
  .home-header,
  .daily-tasks-block {
    animation: fade-in 0.2s ease both;
  }
}

/* ===== 压花标本（页面内联绘制） =====
   叶片 = 对角圆角椭圆（blade）套在定位壳（leaf）里：壳管位置和生长角度（静态），
   blade 管形状和风中摆动（动态）——两层分离让所有叶子共用同一套摇曳关键帧。
   标本平时是压平的静物；只有风来时才短暂活过来。 */
.sprig {
  position: relative;
  width: 240rpx;
  height: 220rpx;
  opacity: 0.85;
}

.sprig--faint {
  opacity: 0.45;
  transform: scale(0.85);
}

.sprig__stem {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 3rpx;
  height: 196rpx;
  background: rgba(18, 71, 3, 0.4);
  border-radius: 3rpx;
  transform: rotate(4deg);
  transform-origin: bottom center;
}

.sprig__leaf {
  position: absolute;
  width: 54rpx;
  height: 24rpx;
}

.sprig__blade {
  width: 100%;
  height: 100%;
  background: rgba(18, 71, 3, 0.26);
}

/* 右侧叶：根部贴茎，尖端朝右上 */
.sprig__leaf--1,
.sprig__leaf--3,
.sprig__leaf--5 {
  transform-origin: 0 50%;
}

.sprig__leaf--1 .sprig__blade,
.sprig__leaf--3 .sprig__blade,
.sprig__leaf--5 .sprig__blade {
  border-radius: 2rpx 100% 2rpx 100%;
  transform-origin: 0 50%;
}

/* 左侧叶：镜像，右缘贴茎 */
.sprig__leaf--2,
.sprig__leaf--4,
.sprig__leaf--6 {
  transform-origin: 100% 50%;
}

.sprig__leaf--2 .sprig__blade,
.sprig__leaf--4 .sprig__blade,
.sprig__leaf--6 .sprig__blade {
  border-radius: 100% 2rpx 100% 2rpx;
  transform-origin: 100% 50%;
}

/* 沿茎交替生长，越靠顶越小。left 在基准122/68rpx上叠加了茎4deg倾斜在该高度上的水平偏移
   （bottom * sin(4deg) ≈ bottom * 0.07），否则越靠近顶端的叶子会离倾斜的茎越来越远。 */
.sprig__leaf--1 { left: 124rpx; bottom: 28rpx;  transform: rotate(-26deg); }
.sprig__leaf--2 { left: 72rpx;  bottom: 60rpx;  transform: rotate(26deg) scale(0.95); }
.sprig__leaf--3 { left: 129rpx; bottom: 94rpx;  transform: rotate(-30deg) scale(0.84); }
.sprig__leaf--4 { left: 77rpx;  bottom: 124rpx; transform: rotate(30deg) scale(0.76); }
.sprig__leaf--5 { left: 133rpx; bottom: 152rpx; transform: rotate(-34deg) scale(0.64); }
.sprig__leaf--6 { left: 80rpx;  bottom: 172rpx; transform: rotate(34deg) scale(0.55); }

.sprig__bud {
  position: absolute;
  left: 128rpx;
  top: 4rpx;
  width: 12rpx;
  height: 22rpx;
  border-radius: 100% 100% 40% 40%;
  background: rgba(18, 71, 3, 0.32);
  transform: rotate(6deg);
}

/* ===== 风 =====
   风从左刮向右：风痕先掠过，叶片自下而上逐片顺风倾倒再弹回，茎和芽同步轻摆 */
.sprig--wind .sprig__blade {
  animation: leaf-sway 0.8s var(--ease-out) both;
}

.sprig--wind .sprig__leaf--1 .sprig__blade { animation-delay: 0.05s; }
.sprig--wind .sprig__leaf--2 .sprig__blade { animation-delay: 0.1s; }
.sprig--wind .sprig__leaf--3 .sprig__blade { animation-delay: 0.15s; }
.sprig--wind .sprig__leaf--4 .sprig__blade { animation-delay: 0.2s; }
.sprig--wind .sprig__leaf--5 .sprig__blade { animation-delay: 0.25s; }
.sprig--wind .sprig__leaf--6 .sprig__blade { animation-delay: 0.3s; }

.sprig--wind .sprig__stem {
  animation: stem-sway 0.9s var(--ease-out) both;
}

.sprig--wind .sprig__bud {
  animation: bud-sway 0.9s var(--ease-out) 0.2s both;
}

@keyframes leaf-sway {
  0%   { transform: rotate(0deg); }
  35%  { transform: rotate(15deg); }
  65%  { transform: rotate(-5deg); }
  100% { transform: rotate(0deg); }
}

@keyframes stem-sway {
  0%   { transform: rotate(4deg); }
  35%  { transform: rotate(9deg); }
  65%  { transform: rotate(2deg); }
  100% { transform: rotate(4deg); }
}

@keyframes bud-sway {
  0%   { transform: rotate(6deg); }
  35%  { transform: rotate(20deg); }
  65%  { transform: rotate(0deg); }
  100% { transform: rotate(6deg); }
}

/* 风痕：两道细线从植物左侧掠过 */
.sprig__gust {
  position: absolute;
  height: 4rpx;
  border-radius: 4rpx;
  background: rgba(18, 71, 3, 0.22);
  opacity: 0;
}

.sprig__gust--1 { width: 80rpx; top: 70rpx;  left: -36rpx; }
.sprig__gust--2 { width: 56rpx; top: 122rpx; left: -56rpx; }

.sprig--wind .sprig__gust--1 { animation: gust-pass 0.7s ease-out both; }
.sprig--wind .sprig__gust--2 { animation: gust-pass 0.7s ease-out 0.12s both; }

@keyframes gust-pass {
  0%   { opacity: 0; transform: translateX(0); }
  25%  { opacity: 0.55; }
  100% { opacity: 0; transform: translateX(280rpx); }
}

@media (prefers-reduced-motion: reduce) {
  .sprig--wind .sprig__blade,
  .sprig--wind .sprig__stem,
  .sprig--wind .sprig__bud,
  .sprig--wind .sprig__gust--1,
  .sprig--wind .sprig__gust--2 {
    animation: none;
  }
}

/* 册页脚注：压花 + 采集标注 */
.home-footer {
  margin-top: auto;
  padding-top: 24rpx;
  padding-bottom: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: rise-in 0.4s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .home-footer {
    animation: fade-in 0.2s ease both;
  }
}

/* 压花按脚注比例缩小，用定高盒裁掉缩放留出的上方空隙 */
.home-footer__art {
  height: 136rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: visible;
}

.home-footer__art .sprig {
  transform: scale(0.68);
  transform-origin: bottom center;
}

.home-footer__line {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--c-muted);
  line-height: 1.7;
  text-align: center;
  padding: 0 80rpx;
  min-height: 66rpx;
  white-space: pre-line;
  opacity: 1;
  transition: opacity 0.3s ease;
}

/* 风经过时旧句子随风散去，新句子落下来 */
.home-footer__line--fading {
  opacity: 0;
}

/* basic-info-overlay 样式已随 BasicInfoOverlay 组件迁走 */

.basic-info-overlay__scroll {
  height: 700rpx;
}
</style>
