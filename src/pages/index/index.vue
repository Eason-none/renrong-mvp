<template>
  <view class="page">
    <NavBar />
    <BreathingGuide v-if="!breathingDone" @done="onBreathingDone" />
    <template v-else>
      <!-- 主区域（remove-pushflow：场景三选已移除，场景信息来自档案 scene_tags） -->
      <template v-if="!dailyTaskStep && !instantStep">
        <view class="home-header">
          <view class="home-header__title">让我们做点什么有意思的小事</view>
          <view class="home-header__subtitle">希望你好好生活，别太焦虑</view>
        </view>

        <!-- 即时入口：零决策抽一条，承接旧推送层"焦虑那一刻立刻做一件小事"的职责 -->
        <view class="instant-entry" @tap="startInstant">现在就来一件</view>

        <!-- 每日任务入口（常驻，可随时重新打开日推卡片） -->
        <view class="daily-card-entry" @tap="reopenDailyCard">今日任务候选</view>
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
          <view class="completed-task-item__btn" @tap="chatCompletedTask(task)">聊聊</view>
        </view>
      </view>

      <!-- 每日任务：详情卡片 -->
      <view v-if="dailyTaskStep === 'detail'" class="push-flow">
        <view class="push-flow__card">
          <view class="push-flow__card-title">{{ activeTask.title }}</view>
          <view class="push-flow__card-time">{{ activeTask.time }}</view>
          <view class="push-flow__card-instructions">{{ activeTask.instructions }}</view>
        </view>
        <view class="push-flow__done-btn" @tap="markDailyTaskDone">做完啦</view>
        <view class="push-flow__back-link" @tap="exitDailyTask">← 返回</view>
        <view class="push-flow__remove-link" @tap="removeTask">不想做了，移除</view>
      </view>

      <!-- 每日任务：聊聊邀请 -->
      <view v-if="dailyTaskStep === 'invite'" class="push-flow">
        <view class="push-flow__invite-text">{{ inviteText }}</view>
        <view class="push-flow__actions">
          <view class="push-flow__btn push-flow__btn--primary" @tap="startDailyTaskChat">聊聊</view>
          <view class="push-flow__btn" @tap="exitDailyTask">跳过</view>
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

      <!-- 现在就来一件：任务卡 -->
      <view v-if="instantStep === 'card'" class="push-flow">
        <view v-if="instantTask" class="push-flow__card">
          <view class="push-flow__card-title">{{ instantTask.title }}</view>
          <view class="push-flow__card-time">{{ instantTask.time }}</view>
          <view class="push-flow__card-instructions">{{ instantTask.instructions }}</view>
        </view>
        <view v-else class="push-flow__card-empty">今天的都做过了，歇一歇也很好。</view>

        <view class="push-flow__hint" v-if="instantExhausted">如果没有想做的可以深呼吸，喝点水，发发呆</view>

        <view class="push-flow__actions" v-if="instantTask">
          <view
            class="push-flow__btn"
            :class="{ 'push-flow__btn--disabled': instantExhausted }"
            @tap="refreshInstant"
          >
            换一个
          </view>
        </view>

        <view v-if="instantTask" class="push-flow__done-btn" @tap="markInstantDone">做完啦</view>
        <view class="push-flow__back-link" @tap="exitInstant">← 返回</view>
      </view>

      <!-- 现在就来一件：聊聊邀请 -->
      <view v-if="instantStep === 'invite'" class="push-flow">
        <view class="push-flow__invite-text">{{ inviteText }}</view>
        <view class="push-flow__actions">
          <view class="push-flow__btn push-flow__btn--primary" @tap="startInstantChat">聊聊</view>
          <view class="push-flow__btn" @tap="exitInstant">跳过</view>
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
      instantCompletionEventId: null,
      instantConversationId: null,
      // 从日推卡片跳转的基本信息设置
      showBasicInfoOverlay: false,
    }
  },
  onShow() {
    this.refreshMyTasks()
    this.refreshCompleted()
    this.checkAndShowDailyCard()
  },
  methods: {
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
    async triggerDailyCard() {
      const info = getBasicInfo()
      const isBlank = !info.player_id && !info.birth_date && !info.scene_tags?.length
      if (isBlank) {
        // 首次使用：先引导填基本信息，保存后再弹卡片
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
        this.triggerDailyCard()
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
    // "换一个"最多3次；第4次点击不再换，露出关怀小字——沿用旧推送层"把限制说成关心"的立场
    refreshInstant() {
      if (!this.instantTask || this.instantExhausted) return
      if (this.instantRefreshCount >= 3) {
        this.instantExhausted = true
        return
      }
      this.instantRefreshCount += 1
      this.instantTask = this.pickInstantTask(this.instantTask.id) ?? this.instantTask
    },
    // 无"领取"概念：做完啦直接计入今日已完成（不经过 DailyTaskPool）
    markInstantDone() {
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
  padding-top: 200rpx;
}

.daily-tasks-block {
  width: 100%;
  padding: 0 60rpx;
  margin-top: 48rpx;
}

.daily-tasks-block__title {
  font-size: 26rpx;
  color: var(--c-subtle);
  letter-spacing: 0.08em;
  margin-bottom: 16rpx;
}

.home-header {
  text-align: center;
  padding: 0 60rpx;
}

.home-header__title {
  font-size: 34rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
}

.home-header__subtitle {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--c-subtle);
}

.instant-entry {
  margin-top: 56rpx;
  width: calc(100% - 120rpx);
  padding: 28rpx 0;
  text-align: center;
  font-size: 30rpx;
  letter-spacing: 0.02em;
  color: #fff;
  background: var(--c-ink);
  border-radius: 999rpx;
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
  margin-top: 48rpx;
  width: calc(100% - 120rpx);
  padding: 20rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--c-muted);
  border: 1rpx solid var(--c-border);
  border-radius: 999rpx;
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
  font-size: 24rpx;
  color: var(--c-muted);
  border: 1rpx solid var(--c-border);
  border-radius: 999rpx;
  padding: 8rpx 24rpx;
}

.push-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 60rpx;
  width: 100%;
  box-sizing: border-box;
}

.push-flow__card {
  width: 100%;
  padding: 40rpx;
  border-radius: 44rpx;
  background: var(--c-surface);
  border: 1rpx solid var(--c-border);
  box-shadow: var(--sh-card);
}

.push-flow__card-title {
  font-size: 34rpx;
  color: var(--c-ink);
  font-weight: 500;
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
  line-height: 2;
}

.push-flow__done-btn {
  margin-top: 40rpx;
  padding: 30rpx 60rpx;
  border-radius: 999rpx;
  background: var(--c-ink);
  color: #fff;
  font-size: 30rpx;
  letter-spacing: 0.02em;
}

.push-flow__back-link {
  margin-top: 24rpx;
  font-size: 26rpx;
  color: var(--c-subtle);
}

.push-flow__remove-link {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
}

.push-flow__invite-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.85;
  text-align: center;
  padding: 0 20rpx;
}

.push-flow__actions {
  margin-top: 40rpx;
  display: flex;
  gap: 24rpx;
}

.push-flow__btn {
  padding: 22rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border);
  color: var(--c-muted);
  font-size: 28rpx;
}

.push-flow__btn--primary {
  background: var(--c-primary-soft);
  color: var(--c-primary);
  border-color: transparent;
}

.basic-info-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 110;
  display: flex;
  align-items: flex-end;
}

.basic-info-overlay__sheet {
  width: 100%;
  background: var(--c-bg);
  border-radius: 48rpx 48rpx 0 0;
  padding: 40rpx;
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
