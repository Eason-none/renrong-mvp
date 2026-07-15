<template>
  <view class="daily-card__overlay">
    <scroll-view class="daily-card__scroll" scroll-y>
      <view class="daily-card__body">

        <!-- 玩家信息区 -->
        <view class="daily-card__header">
          <text class="daily-card__greeting">尊敬的地球online玩家：{{ displayPlayerId }}，您好。</text>
          <text v-if="survivalDays !== null" class="daily-card__info-line">
            当前累计生存时长为 {{ survivalDays }} 天！
          </text>
          <text class="daily-card__info-line">今日编号为：{{ todayStr }}。</text>
          <text class="daily-card__info-line">{{ cityLine }}</text>
          <text class="daily-card__info-line">区域环境情况：{{ envDesc }}</text>
        </view>

        <!-- 昨日已完成任务 -->
        <view v-if="completedYesterday.length" class="daily-card__prev-completed">
          <view class="daily-card__prev-completed__msg">
            做过的就算数了，不必留着它们证明什么。
          </view>
          <view
            v-for="task in completedYesterday"
            :key="task.id"
            class="daily-card__prev-completed__item"
          >
            <text class="daily-card__prev-completed__title">{{ task.title }}</text>
            <view class="daily-card__prev-completed__btn" hover-class="u-press" @tap="$emit('chat-completed', task)">聊聊</view>
          </view>
          <view class="daily-card__prev-completed__clear" hover-class="u-press" @tap="$emit('clear-completed')">全部清掉</view>
        </view>

        <!-- 固定提醒文案 -->
        <view class="daily-card__notice">
          <text class="daily-card__notice-line">请重视自己的感受而非必须有产出的绩效。</text>
          <text class="daily-card__notice-line">请尝试在固有的工作和生活节奏之余做一些没意义但有意思的事。</text>
          <text class="daily-card__notice-line">请记住人生是一场体验。</text>
        </view>

        <!-- 候选任务 -->
        <view class="daily-card__tasks-title">今日任务候选</view>
        <view
          v-for="task in localCandidates"
          :key="task.id"
          class="daily-card__task"
        >
          <view class="daily-card__task-info">
            <text class="daily-card__task-title">{{ task.title }}</text>
            <text class="daily-card__task-hook">{{ task.hook }}</text>
          </view>
          <view
            class="daily-card__task-btn"
            :class="{ 'daily-card__task-btn--claimed': claimedIds.includes(task.id) }"
            hover-class="u-press"
            @tap="claim(task)"
          >
            {{ claimedIds.includes(task.id) ? '已领取' : '领取' }}
          </view>
        </view>

        <!-- 换一批 -->
        <view v-if="refreshCount < 3" class="daily-card__refresh" hover-class="u-press" @tap="doRefresh">
          换一批
        </view>
        <view v-else class="daily-card__refresh-exhausted">
          换了好几批了，没找到今天想做的也没关系，关掉就好，下次再看。
        </view>

        <!-- BasicInfo 不完整时的引导 -->
        <view v-if="!isInfoComplete" class="daily-card__guide" @tap="$emit('go-basic-info')">
          去完善你的信息 →
        </view>

        <!-- 关闭 -->
        <view class="daily-card__close" hover-class="u-press" @tap="$emit('close')">关闭</view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { claimTask, getUncompletedTasks } from '@/state/dailyTaskPool.js'
import { getDailyTaskCandidates } from '@/content/library.js'

function calcSurvivalDays(birthDate) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const today = new Date()
  const diff = Math.floor((today - birth) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : null
}

function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

export default {
  name: 'DailyCard',
  emits: ['claim', 'close', 'go-basic-info', 'clear-completed', 'chat-completed'],
  props: {
    playerInfo: { type: Object, default: () => ({}) },
    city: { type: String, default: null },
    weatherText: { type: String, default: null },
    temp: { type: String, default: null },
    airQuality: { type: String, default: null },
    warning: { type: String, default: null },
    candidates: { type: Array, default: () => [] },
    completedYesterday: { type: Array, default: () => [] },
  },
  data() {
    const pool = getUncompletedTasks()
    return {
      claimedIds: pool.map((t) => t.id),
      todayStr: getTodayStr(),
      localCandidates: [...(this.candidates || [])],
      refreshCount: 0,
    }
  },
  computed: {
    displayPlayerId() {
      return this.playerInfo?.player_id || '旅行者'
    },
    survivalDays() {
      return calcSurvivalDays(this.playerInfo?.birth_date)
    },
    isInfoComplete() {
      // 出生日期是纯可选彩蛋（只喂存活天数一行），不计入完整性——否则不想填生日的用户
      // 会被"去完善你的信息"永远追着跑（内测反馈：被感知为必填）
      const p = this.playerInfo
      return !!(p?.player_id && p?.scene_tags?.length)
    },
    // 定位/天气取不到时收起感叹号——失败态不该带上播报的兴奋语气
    cityLine() {
      return this.city ? `您当前登陆的城市为：${this.city}！` : '您当前登陆的城市为：未知。'
    },
    envDesc() {
      const parts = []
      if (this.weatherText) parts.push(this.weatherText)
      if (this.temp) parts.push(`气温 ${this.temp}°C`)
      if (this.airQuality) parts.push(`空气${this.airQuality}`)
      if (this.warning) parts.push(`⚠️ ${this.warning}`)
      return parts.length ? parts.join('，') + '！' : '未知。'
    },
  },
  methods: {
    claim(task) {
      if (this.claimedIds.includes(task.id)) return
      claimTask(task)
      this.claimedIds.push(task.id)
      this.$emit('claim', task)
    },
    doRefresh() {
      if (this.refreshCount >= 3) return
      const sceneTags = this.playerInfo?.scene_tags || []
      // 排除当前正在展示的候选：保证"换一批"换出来的都是刚才没见过的条目
      // （小场景匹配池下不排除很容易抽回同一条——真机验收反馈）。
      // 新批不足3条就少展示几条；一条新的都抽不出时保留当前批（池子见底，换无可换）。
      const excludeIds = [...this.claimedIds, ...this.localCandidates.map((t) => t.id)]
      const next = getDailyTaskCandidates(sceneTags, excludeIds)
      if (next.length > 0) this.localCandidates = next
      this.refreshCount++
    },
  },
}
</script>

<style>
.daily-card__overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.65);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fade-in 0.2s ease both;
}

.daily-card__scroll {
  width: 90%;
  max-height: 85vh;
  background: var(--c-card);
  border-radius: 32rpx;
  box-shadow: var(--sh-float);
  animation: rise-in 0.32s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .daily-card__overlay,
  .daily-card__scroll {
    animation: fade-in 0.2s ease both;
  }
}

.daily-card__body {
  padding: 48rpx 40rpx 40rpx;
}

/* 信笺式抬头：一条压印分隔线，让"地球online公函"有个落款结构 */
.daily-card__header {
  margin-bottom: 36rpx;
  padding-bottom: 28rpx;
  border-bottom: 2rpx solid var(--c-border-s);
}

.daily-card__greeting {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  line-height: 1.8;
  color: var(--c-ink);
  margin-bottom: 8rpx;
}

.daily-card__info-line {
  display: block;
  font-size: 28rpx;
  line-height: 1.85;
  color: var(--c-muted);
}

.daily-card__prev-completed {
  background: var(--c-surface);
  border-radius: 28rpx;
  padding: 28rpx;
  margin-bottom: 40rpx;
}

.daily-card__prev-completed__msg {
  font-size: 26rpx;
  color: var(--c-muted);
  line-height: 1.7;
  margin-bottom: 24rpx;
}

.daily-card__prev-completed__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--c-border);
}

.daily-card__prev-completed__title {
  font-size: 28rpx;
  color: var(--c-subtle);
  flex: 1;
  padding-right: 16rpx;
}

.daily-card__prev-completed__btn {
  font-size: 26rpx;
  color: var(--c-primary);
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  border-radius: 999rpx;
  padding: 14rpx 30rpx;
  flex-shrink: 0;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.daily-card__prev-completed__clear {
  margin-top: 20rpx;
  text-align: right;
  font-size: 24rpx;
  color: var(--c-subtle);
}

.daily-card__notice {
  background: var(--c-primary-soft);
  border-radius: 28rpx;
  padding: 28rpx 32rpx;
  font-size: 26rpx;
  line-height: 2;
  color: #1f3819;
  margin-bottom: 48rpx;
}

.daily-card__notice-line {
  display: block;
}

.daily-card__notice-line:not(:last-child) {
  margin-bottom: 20rpx;
}

.daily-card__tasks-title {
  font-size: 26rpx;
  color: var(--c-muted);
  letter-spacing: 0.08em;
  margin-bottom: 20rpx;
}

.daily-card__task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--c-border);
}

.daily-card__task-info {
  flex: 1;
  padding-right: 24rpx;
}

.daily-card__task-title {
  display: block;
  font-size: 30rpx;
  color: var(--c-ink);
  line-height: 1.45;
  margin-bottom: 8rpx;
}

.daily-card__task-hook {
  display: block;
  font-size: 24rpx;
  color: var(--c-muted);
  line-height: 1.5;
}

.daily-card__task-btn {
  flex-shrink: 0;
  padding: 18rpx 36rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  font-size: 26rpx;
  color: var(--c-primary);
  transition: transform 0.12s ease, opacity 0.12s ease, background 0.15s ease;
}

.daily-card__task-btn--claimed {
  background: var(--c-primary);
  border-color: transparent;
  color: #f0f5ef;
}

.daily-card__refresh {
  margin-top: 32rpx;
  text-align: center;
  font-size: 26rpx;
  color: var(--c-muted);
  padding: 20rpx 0;
  border: 1rpx solid var(--c-border-s);
  border-radius: 999rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.daily-card__refresh-exhausted {
  margin-top: 32rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
  line-height: 1.7;
  text-align: center;
  padding: 0 8rpx;
}

.daily-card__guide {
  margin-top: 40rpx;
  text-align: center;
  font-size: 26rpx;
  color: var(--c-primary);
}

.daily-card__close {
  margin-top: 32rpx;
  text-align: center;
  font-size: 28rpx;
  color: var(--c-subtle);
  padding: 16rpx 0;
}
</style>
