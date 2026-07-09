<template>
  <view class="page">
    <NavBar />
    <BreathingGuide v-if="!breathingDone" @done="onBreathingDone" />
    <template v-else>
      <!-- 主区域（remove-pushflow：场景三选已移除，场景信息来自档案 scene_tags） -->
      <template v-if="!dailyTaskStep && !instantStep">
        <!-- 没有任务区块时整组居中（与脚注的 margin-top:auto 平分空间）；有任务后回到顶部布局 -->
        <view class="home-header" :class="{ 'home-header--centered': !myTasks.length && !todayCompleted.length }">
          <view class="home-header__title">让我们做点什么有意思的小事</view>
          <view class="home-header__subtitle">希望你好好生活，别太焦虑</view>
        </view>

        <!-- 即时入口：零决策抽一条，承接旧推送层"焦虑那一刻立刻做一件小事"的职责 -->
        <view class="instant-entry" hover-class="u-press" @tap="startInstant">现在就来一件</view>

        <!-- 每日任务入口（常驻，可随时重新打开日推卡片） -->
        <view class="daily-card-entry" hover-class="u-press" @tap="reopenDailyCard">今日任务候选</view>
      </template>

      <!-- 已领取任务区块 -->
      <view v-if="!dailyTaskStep && !instantStep && myTasks.length" class="daily-tasks-block">
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
      <view v-if="!dailyTaskStep && !instantStep && todayCompleted.length" class="daily-tasks-block">
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
      <view v-if="!dailyTaskStep && !instantStep" class="home-footer">
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
        <view class="home-footer__num">采集编号 {{ flyleafNum }}</view>
        <view class="home-footer__line" :class="{ 'home-footer__line--fading': lineFading }">{{ currentLine }}</view>
      </view>

      <!-- 每日任务：详情卡片（与即时小事同款手贴卡：胶带+微旋+居中，操作沉到拇指区） -->
      <view v-if="dailyTaskStep === 'detail'" class="push-flow push-flow--fill">
        <view class="push-flow__stage">
          <view class="push-flow__cardwrap">
            <view class="push-flow__card push-flow__card--pinned">
              <view class="push-flow__card-title">{{ activeTask.title }}</view>
              <view class="push-flow__card-time">{{ activeTask.time }}</view>
              <view class="push-flow__card-instructions">{{ activeTask.instructions }}</view>
            </view>
            <view class="push-flow__tape"></view>
          </view>
        </view>
        <view class="push-flow__done-btn" hover-class="u-press" @tap="markDailyTaskDone">做完啦</view>
        <view class="push-flow__back-link" hover-class="u-press" @tap="exitDailyTask">← 返回</view>
        <view class="push-flow__remove-link" hover-class="u-press" @tap="removeTask">不想做了，移除</view>
      </view>

      <!-- 每日任务：聊聊邀请（完成时刻 = 情绪峰值，金色印记先落，再邀请） -->
      <view v-if="dailyTaskStep === 'invite'" class="push-flow push-flow--center">
        <view class="ritual-seal">✦</view>
        <view class="push-flow__invite-text">{{ inviteText }}</view>
        <view class="push-flow__actions">
          <view class="push-flow__btn push-flow__btn--primary" hover-class="u-press" @tap="startDailyTaskChat">聊聊</view>
          <view class="push-flow__btn" hover-class="u-press" @tap="exitDailyTask">跳过</view>
        </view>
      </view>

      <!-- 每日任务：聊天 -->
      <ChatView
        v-if="dailyTaskStep === 'chat'"
        :conversation-id="dailyTaskConversationId"
        :content-title="activeTask.title"
        :instructions="activeTask.instructions"
        :previous-summary="null"
        @close="exitDailyTask"
      />

      <!-- 现在就来一件：手贴卡（居中微旋 + 纸胶带 = 刚贴进册子的一页；
           操作沉在拇指区，中间空白是卡片四周的"桌面"，不再垫压花） -->
      <view v-if="instantStep === 'card'" class="push-flow push-flow--fill">
        <view class="push-flow__stage">
          <!-- 胶带与卡片是兄弟节点：换卡时胶带先撕、卡片跟着翻走，各自独立动 -->
          <view
            v-if="instantTask"
            class="push-flow__cardwrap"
            :class="{
              'push-flow__cardwrap--leaving': swapPhase === 'leaving',
              'push-flow__cardwrap--entering': swapPhase === 'entering',
            }"
          >
            <view class="push-flow__card push-flow__card--pinned">
              <view class="push-flow__card-title">{{ instantTask.title }}</view>
              <view class="push-flow__card-time">{{ instantTask.time }}</view>
              <view class="push-flow__card-instructions">{{ instantTask.instructions }}</view>
            </view>
            <view class="push-flow__tape"></view>
          </view>
          <view v-else class="push-flow__card-empty">今天的都做过了，歇一歇也很好。</view>
        </view>

        <view class="push-flow__hint" v-if="instantExhausted">如果没有想做的可以深呼吸，喝点水，发发呆</view>

        <view class="push-flow__actions" v-if="instantTask">
          <view
            class="push-flow__btn"
            :class="{ 'push-flow__btn--disabled': instantExhausted }"
            hover-class="u-press"
            @tap="refreshInstant"
          >
            换一个
          </view>
        </view>

        <view v-if="instantTask" class="push-flow__done-btn" hover-class="u-press" @tap="markInstantDone">做完啦</view>
        <view class="push-flow__back-link" hover-class="u-press" @tap="exitInstant">← 返回</view>
      </view>

      <!-- 现在就来一件：聊聊邀请（同上，完成印记） -->
      <view v-if="instantStep === 'invite'" class="push-flow push-flow--center">
        <view class="ritual-seal">✦</view>
        <view class="push-flow__invite-text">{{ inviteText }}</view>
        <view class="push-flow__actions">
          <view class="push-flow__btn push-flow__btn--primary" hover-class="u-press" @tap="startInstantChat">聊聊</view>
          <view class="push-flow__btn" hover-class="u-press" @tap="exitInstant">跳过</view>
        </view>
      </view>

      <!-- 现在就来一件：聊天（推送层语义：退出不生成摘要） -->
      <ChatView
        v-if="instantStep === 'chat'"
        :conversation-id="instantConversationId"
        :content-title="instantTask.title"
        :instructions="instantTask.instructions"
        :previous-summary="null"
        @close="exitInstant"
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

    <!-- 从日推卡片跳转的基本信息设置（独立遮罩） -->
    <view v-if="showBasicInfoOverlay" class="basic-info-overlay">
      <view class="basic-info-overlay__sheet">
        <view class="basic-info-overlay__back" @tap="closeBasicInfoOverlay">← 返回</view>
        <scroll-view class="basic-info-overlay__scroll" scroll-y>
          <BasicInfoSettings @close="closeBasicInfoOverlay" />
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import BreathingGuide from '@/components/BreathingGuide.vue'
import DailyCard from '@/components/DailyCard.vue'
import DailyTaskItem from '@/components/DailyTaskItem.vue'
import ChatView from '@/components/ChatView.vue'
import BasicInfoSettings from '@/components/BasicInfoSettings.vue'
import FirstTimeHint from '@/components/FirstTimeHint.vue'
import { get, set, KEYS } from '@/state/storage.js'
import { getBasicInfo } from '@/state/basicInfo.js'
import { getUncompletedTasks, completeTask, saveCompletedTask, getTodayCompleted, getPrevDayCompleted, clearPrevDayCompleted } from '@/state/dailyTaskPool.js'
import { getDailyTaskCandidates } from '@/content/library.js'
import { getCity } from '@/api/location.js'
import { getEnvironmentInfo } from '@/api/weather.js'
import { createCompletionEvent, COMPLETION_INVITE_TEXT } from '@/state/completionEvent.js'
import { createConversation } from '@/state/conversation.js'

function getTodayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 扉页标注语料（首页底部压花下的每日一句，"采集标注"叙事）。
// 【占位】暂借日推卡的三句公函提醒轮换；正式语料由产品侧撰写后整组替换/扩充，
// 语气须过 content_principles.md（公函式俏皮，不励志不鸡汤）。每日固定一句，不随进入次数变化。
const FLYLEAF_LINES = [
  '请重视自己的感受而非必须有产出的绩效。',
  '请尝试在固有的工作和生活节奏之余做一些没意义但有意思的事。',
  '请记住人生是一场体验。',
]

export default {
  name: 'IndexPage',
  components: { NavBar, BreathingGuide, DailyCard, DailyTaskItem, ChatView, BasicInfoSettings, FirstTimeHint },
  data() {
    return {
      breathingDone: false,
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
      // 每日任务完成流程
      dailyTaskStep: null, // null | 'detail' | 'invite' | 'chat'
      activeTask: null,
      dailyTaskCompletionEventId: null,
      dailyTaskConversationId: null,
      inviteText: COMPLETION_INVITE_TEXT,
      // 现在就来一件（instant-task）：零决策即时抽取流程
      instantStep: null, // null | 'card' | 'invite' | 'chat'
      instantTask: null,
      instantRefreshCount: 0,
      instantExhausted: false,
      swapPhase: null, // null | 'leaving'(撕胶带+卡片翻走) | 'entering'(新胶带按上+新卡落定)
      instantCompletionEventId: null,
      instantConversationId: null,
      // 从日推卡片跳转的基本信息设置
      showBasicInfoOverlay: false,
      // 压花的风：点植物 → 叶片摇曳 + 标语随风换句
      windActive: false,
      lineFading: false,
      lineIndex: null, // null = 用当日种子句；点过之后按序轮换（仅会话内，不持久化）
    }
  },
  computed: {
    // 采集编号：与日推卡"今日编号"同一格式（YYYY/MM/DD），共享世界观
    flyleafNum() {
      return getTodayDateStr().replace(/-/g, '/')
    },
    // 当日一句：日期确定性取模，同一天进多少次都是同一句；刮过风后从它开始轮换
    currentLine() {
      const seedIndex = Number(getTodayDateStr().replace(/-/g, '')) % FLYLEAF_LINES.length
      return FLYLEAF_LINES[this.lineIndex ?? seedIndex]
    },
  },
  onShow() {
    this.refreshMyTasks()
    this.refreshCompleted()
    this.checkAndShowDailyCard()
  },
  methods: {
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
    chatCompletedTask(task) {
      this.showDailyCard = false
      this.activeTask = task
      this.dailyTaskCompletionEventId = task.completionEventId
      this.startDailyTaskChat()
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
    // 每日任务完成流程
    enterDailyTask(task) {
      this.activeTask = task
      this.dailyTaskStep = 'detail'
    },
    markDailyTaskDone() {
      completeTask(this.activeTask.id)
      this.refreshMyTasks()
      const event = createCompletionEvent({
        contentId: this.activeTask.id,
        contentType: 'daily_task',
        collectionId: null,
      })
      this.dailyTaskCompletionEventId = event.id
      saveCompletedTask(this.activeTask, event.id)
      this.refreshCompleted()
      this.dailyTaskStep = 'invite'
    },
    startDailyTaskChat() {
      const conv = createConversation(this.dailyTaskCompletionEventId)
      this.dailyTaskConversationId = conv.id
      this.dailyTaskStep = 'chat'
    },
    removeTask() {
      completeTask(this.activeTask.id)
      this.refreshMyTasks()
      this.exitDailyTask()
    },
    // 现在就来一件：按档案 scene_tags 零决策抽一条，排除已领取和今日已完成的
    pickInstantTask(extraExcludeId) {
      const excludeIds = [
        ...getUncompletedTasks().map((t) => t.id),
        ...getTodayCompleted().map((t) => t.id),
      ]
      if (extraExcludeId) excludeIds.push(extraExcludeId)
      const candidates = getDailyTaskCandidates(getBasicInfo().scene_tags || [], excludeIds)
      return candidates.length ? candidates[0] : null
    },
    startInstant() {
      this.instantRefreshCount = 0
      this.instantExhausted = false
      this.instantTask = this.pickInstantTask()
      this.instantStep = 'card'
    },
    // "换一个"最多3次；第4次点击不再换，露出关怀小字——沿用旧推送层"把限制说成关心"的立场。
    // 换卡 = 撕胶带四拍编排：撕胶带(0-420ms) → 卡片翻走(100-620ms) → 620ms 换数据 →
    // 新胶带按上(620-940ms) → 新卡落定(780-1260ms)。时长刻意从容，贴合"不催促"。
    refreshInstant() {
      if (!this.instantTask || this.instantExhausted || this.swapPhase) return
      if (this.instantRefreshCount >= 3) {
        this.instantExhausted = true
        return
      }
      this.instantRefreshCount += 1
      this.swapPhase = 'leaving'
      setTimeout(() => {
        // 撕的途中用户可能已"← 返回"退出流程，退了就不再动数据
        if (this.instantStep !== 'card' || !this.instantTask) {
          this.swapPhase = null
          return
        }
        // 池子见底抽不出新卡时保留当前卡——视觉上等于"撕下来又贴了回去"
        this.instantTask = this.pickInstantTask(this.instantTask.id) ?? this.instantTask
        this.swapPhase = 'entering'
        setTimeout(() => {
          this.swapPhase = null
        }, 700)
      }, 620)
    },
    // 无"领取"概念：做完啦直接计入今日已完成（不经过 DailyTaskPool）
    // 撕卡动画进行中不响应——正在飞走的卡不该被"做完"
    markInstantDone() {
      if (this.swapPhase) return
      const event = createCompletionEvent({
        contentId: this.instantTask.id,
        contentType: 'daily_task',
        collectionId: null,
      })
      this.instantCompletionEventId = event.id
      saveCompletedTask(this.instantTask, event.id)
      this.refreshCompleted()
      this.instantStep = 'invite'
    },
    startInstantChat() {
      const conv = createConversation(this.instantCompletionEventId)
      this.instantConversationId = conv.id
      this.instantStep = 'chat'
    },
    exitInstant() {
      this.instantStep = null
      this.instantTask = null
      this.instantRefreshCount = 0
      this.instantExhausted = false
      this.swapPhase = null
      this.instantCompletionEventId = null
      this.instantConversationId = null
    },
    exitDailyTask() {
      this.dailyTaskStep = null
      this.activeTask = null
      this.dailyTaskCompletionEventId = null
      this.dailyTaskConversationId = null
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

.push-flow__card-empty {
  padding: 60rpx 20rpx;
  font-size: 28rpx;
  color: var(--c-subtle);
  text-align: center;
  line-height: 1.85;
}

.push-flow__hint {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
  text-align: center;
  line-height: 1.75;
}

.push-flow__btn--disabled {
  opacity: 0.4;
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

.push-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 60rpx;
  width: 100%;
  box-sizing: border-box;
  animation: rise-in 0.28s var(--ease-out) both;
}

/* 单任务流程：占满剩余高度，卡片在上、操作沉到拇指区 */
.push-flow--fill {
  flex: 1;
  min-height: 0;
}

/* 邀请步骤：内容整体在屏幕中部偏上，仪式印记居于视线焦点 */
.push-flow--center {
  flex: 1;
  justify-content: center;
  padding-bottom: 18vh;
}

/* 手贴卡的"桌面"：占满卡与操作区之间的空间，卡片垂直居中微偏上 */
.push-flow__stage {
  flex: 1;
  min-height: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 胶带在卡顶外 16rpx，居中裕量给足避免被裁 */
  padding-top: 20rpx;
}

/* 胶带与卡片的共同容器：两者是兄弟节点，换卡时各自独立动 */
.push-flow__cardwrap {
  position: relative;
  width: 100%;
}

/* 手贴的卡：0.4° 的歪——人手贴的东西从来不是绝对水平的 */
.push-flow__card--pinned {
  transform: rotate(0.4deg);
  transform-origin: top center;
}

/* 纸胶带：把卡固定在册页上的那截。撕的时候右端还粘着、左端先起 */
.push-flow__tape {
  position: absolute;
  top: -16rpx;
  left: 50%;
  width: 128rpx;
  height: 36rpx;
  transform: translateX(-50%) rotate(-2.5deg);
  transform-origin: 88% 60%;
  background: rgba(197, 219, 189, 0.68);
  border: 1rpx solid rgba(18, 71, 3, 0.07);
  border-radius: 2rpx;
}

/* ===== 换一个：撕胶带四拍 =====
   撕（leaving）：胶带左端揭起脱离 → 卡片失去固定，绕顶边向后上方翻走（ease-in，外力越拉越快）
   贴（entering）：新胶带从上方按下贴住 → 新卡在胶带下落定，回弹到 0.4°（ease-out，自然静止） */
.push-flow__cardwrap--leaving .push-flow__tape {
  animation: tape-peel 0.42s cubic-bezier(0.5, 0.1, 0.7, 0.4) both;
}

@keyframes tape-peel {
  0%   { transform: translateX(-50%) rotate(-2.5deg); opacity: 1; }
  45%  { transform: translateX(-48%) translateY(-14rpx) rotate(16deg); opacity: 1; }
  100% { transform: translateX(-38%) translateY(-60rpx) rotate(46deg); opacity: 0; }
}

.push-flow__cardwrap--leaving .push-flow__card {
  animation: card-tear 0.52s cubic-bezier(0.45, 0.05, 0.85, 0.4) 0.1s both;
}

@keyframes card-tear {
  0%   { transform: perspective(900px) rotateX(0deg) translateY(0) rotate(0.4deg); opacity: 1; }
  40%  { transform: perspective(900px) rotateX(26deg) translateY(-44rpx) rotate(-2.5deg); opacity: 1; }
  100% { transform: perspective(900px) rotateX(62deg) translateY(-220rpx) rotate(-6deg); opacity: 0; }
}

.push-flow__cardwrap--entering .push-flow__tape {
  animation: tape-press 0.32s var(--ease-out) both;
}

@keyframes tape-press {
  0%   { transform: translateX(-50%) translateY(-24rpx) rotate(-6deg) scale(1.25); opacity: 0; }
  60%  { transform: translateX(-50%) translateY(2rpx) rotate(-2deg) scale(0.97); opacity: 1; }
  100% { transform: translateX(-50%) rotate(-2.5deg) scale(1); opacity: 1; }
}

.push-flow__cardwrap--entering .push-flow__card {
  animation: card-settle 0.48s var(--ease-out) 0.16s both;
}

@keyframes card-settle {
  0%   { transform: translateY(-32rpx) rotate(1.8deg); opacity: 0; }
  55%  { transform: translateY(4rpx) rotate(-0.1deg); opacity: 1; }
  100% { transform: translateY(0) rotate(0.4deg); opacity: 1; }
}

/* 减少动态：撕/贴退化为卡片交叉淡换，胶带不动 */
@media (prefers-reduced-motion: reduce) {
  .push-flow__cardwrap--leaving .push-flow__tape,
  .push-flow__cardwrap--entering .push-flow__tape {
    animation: none;
  }

  .push-flow__cardwrap--leaving .push-flow__card {
    animation: reduced-card-out 0.3s ease both;
  }

  .push-flow__cardwrap--entering .push-flow__card {
    animation: reduced-card-in 0.3s ease both;
  }
}

@keyframes reduced-card-out {
  from { opacity: 1; transform: rotate(0.4deg); }
  to   { opacity: 0; transform: rotate(0.4deg); }
}

@keyframes reduced-card-in {
  from { opacity: 0; transform: rotate(0.4deg); }
  to   { opacity: 1; transform: rotate(0.4deg); }
}

@media (prefers-reduced-motion: reduce) {
  .push-flow,
  .home-header,
  .daily-tasks-block {
    animation: fade-in 0.2s ease both;
  }
}

.push-flow__card {
  width: 100%;
  padding: 40rpx 36rpx;
  border-radius: 28rpx;
  background: var(--c-card);
  border: 1rpx solid var(--c-border-s);
  box-shadow: var(--sh-card);
  box-sizing: border-box;
}

.push-flow__card-title {
  font-size: 38rpx;
  color: var(--c-ink);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.01em;
  margin-bottom: 12rpx;
}

.push-flow__card-time {
  font-size: 24rpx;
  color: var(--c-subtle);
  margin-bottom: 28rpx;
}

.push-flow__card-instructions {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.9;
}

.push-flow__done-btn {
  margin-top: 28rpx;
  padding: 30rpx 88rpx;
  border-radius: 999rpx;
  background: var(--c-primary);
  color: #f0f5ef;
  font-size: 30rpx;
  letter-spacing: 0.02em;
  box-shadow: var(--sh-card);
  transition: transform 0.12s ease, opacity 0.12s ease;
}

/* 两个轻链接：视觉保持轻，但触点给足（内边距撑出 ≥88rpx 高的可点区） */
.push-flow__back-link {
  margin-top: 4rpx;
  padding: 22rpx 48rpx;
  font-size: 28rpx;
  color: var(--c-subtle);
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.push-flow__remove-link {
  padding: 22rpx 48rpx;
  font-size: 26rpx;
  color: var(--c-subtle);
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.push-flow__invite-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.85;
  text-align: center;
  padding: 0 20rpx;
}

.push-flow__actions {
  margin-top: 28rpx;
  display: flex;
  gap: 24rpx;
}

.push-flow__btn {
  padding: 24rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  color: var(--c-muted);
  font-size: 28rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.push-flow__btn--primary {
  background: var(--c-primary);
  color: #f0f5ef;
  border-color: transparent;
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

/* 右侧叶：根部贴茎（茎在 x≈120rpx），尖端朝右上 */
.sprig__leaf--1,
.sprig__leaf--3,
.sprig__leaf--5 {
  left: 122rpx;
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
  left: 68rpx;
  transform-origin: 100% 50%;
}

.sprig__leaf--2 .sprig__blade,
.sprig__leaf--4 .sprig__blade,
.sprig__leaf--6 .sprig__blade {
  border-radius: 100% 2rpx 100% 2rpx;
  transform-origin: 100% 50%;
}

/* 沿茎交替生长，越靠顶越小 */
.sprig__leaf--1 { bottom: 28rpx;  transform: rotate(-26deg); }
.sprig__leaf--2 { bottom: 60rpx;  transform: rotate(26deg) scale(0.95); }
.sprig__leaf--3 { bottom: 94rpx;  transform: rotate(-30deg) scale(0.84); }
.sprig__leaf--4 { bottom: 124rpx; transform: rotate(30deg) scale(0.76); }
.sprig__leaf--5 { bottom: 152rpx; transform: rotate(-34deg) scale(0.64); }
.sprig__leaf--6 { bottom: 172rpx; transform: rotate(34deg) scale(0.55); }

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

.home-footer__num {
  margin-top: 14rpx;
  font-size: 20rpx;
  color: var(--c-subtle);
  letter-spacing: 0.14em;
}

.home-footer__line {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--c-muted);
  line-height: 1.7;
  text-align: center;
  padding: 0 80rpx;
  min-height: 66rpx;
  opacity: 1;
  transition: opacity 0.3s ease;
}

/* 风经过时旧句子随风散去，新句子落下来 */
.home-footer__line--fading {
  opacity: 0;
}

.basic-info-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.5);
  z-index: 110;
  display: flex;
  align-items: flex-end;
  animation: fade-in 0.2s ease both;
}

.basic-info-overlay__sheet {
  width: 100%;
  background: var(--c-card);
  border-radius: 36rpx 36rpx 0 0;
  padding: 40rpx;
  animation: sheet-up 0.3s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .basic-info-overlay,
  .basic-info-overlay__sheet {
    animation: fade-in 0.2s ease both;
  }
}

.basic-info-overlay__back {
  font-size: 26rpx;
  color: var(--c-primary);
  margin-bottom: 16rpx;
}

.basic-info-overlay__scroll {
  height: 700rpx;
}
</style>
