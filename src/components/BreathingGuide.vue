<template>
  <view class="breathing" :class="{ 'breathing--leaving': leaving }">
    <view class="breathing__intro">这里每天有一些小事，去做做看，感受一下就够了。</view>

    <view class="breathing__stage">
      <view class="breathing__glow"></view>
      <view class="breathing__ring"></view>
      <view
        class="breathing__circle"
        :style="{ transform: 'scale(' + circleScale + ')', transition: circleTransition }"
      ></view>
    </view>

    <view class="breathing__phase" :class="{ 'breathing__phase--visible': phaseVisible }">{{ phase }}</view>

    <view
      v-if="hintVisible"
      class="breathing__hint"
      :class="{ 'breathing__hint--active': hintActive }"
    >{{ hint }}</view>

    <view v-if="!started" class="breathing__actions">
      <view class="breathing__btn breathing__btn--primary" hover-class="u-press" @tap="start">我准备好了</view>
      <view class="breathing__btn" hover-class="u-press" @tap="skip">跳过</view>
    </view>
  </view>
</template>

<script>
// 呼吸引导服务体验、不是流程门槛：「跳过」随时立即离开。「我准备好了」按 ui-flow.html 的
// 4-7-8 引导跑两轮（吸气4s / 屏息7s / 呼气8s）后自动进入下一步——用 :style 绑定 + 定时器链
// 复刻原型的圆圈缩放与阶段文字（小程序端不能像原型那样直接操作 DOM）。
export default {
  name: 'BreathingGuide',
  emits: ['done'],
  data() {
    return {
      started: false,
      hintVisible: true,
      hintActive: false,
      hint: '跟着圆圈呼吸，或者直接跳过都可以',
      phase: '',
      phaseVisible: false,
      circleScale: 0.82,
      circleTransition: 'transform 4s ease-in-out',
      leaving: false,
    }
  },
  created() {
    this.timers = []
  },
  beforeUnmount() {
    this.clearTimers()
  },
  methods: {
    later(fn, ms) {
      const id = setTimeout(fn, ms)
      this.timers.push(id)
      return id
    },
    clearTimers() {
      this.timers.forEach(clearTimeout)
      this.timers = []
    },
    skip() {
      this.clearTimers()
      this.finish()
    },
    // 整体渐淡0.6s后再真正离场——呼吸引导的收束不该是硬切
    finish() {
      if (this.leaving) return
      this.leaving = true
      this.later(() => this.$emit('done'), 600)
    },
    start() {
      if (this.started) return
      this.started = true
      this.hintActive = true
      this.hint = '使用能缓解焦虑的 4-7-8 呼吸法，准备好深呼吸了吗？'
      this.later(() => {
        this.hintVisible = false
        this.later(() => this.runCycle(0), 700)
      }, 3000)
    },
    setPhase(t) {
      this.phase = t
      this.phaseVisible = true
    },
    runCycle(count) {
      // 吸气 4s：圆圈放大
      this.setPhase('吸气')
      this.circleTransition = 'transform 4s ease-in-out'
      this.circleScale = 1.1
      this.later(() => {
        // 屏息 7s：定格，不变化
        this.circleTransition = 'none'
        this.setPhase('屏住呼吸，坚持住')
        this.later(() => {
          // 呼气 8s：圆圈缩回
          this.setPhase('慢慢呼气')
          this.circleTransition = 'transform 8s ease-in-out'
          this.circleScale = 0.82
          this.later(() => {
            const next = count + 1
            if (next >= 2) {
              this.finish()
            } else {
              this.runCycle(next)
            }
          }, 8000)
        }, 7000)
      }, 4000)
    },
  },
}
</script>

<style>
.breathing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 60rpx;
  opacity: 1;
  transition: opacity 0.6s ease;
}

.breathing--leaving {
  opacity: 0;
}

.breathing__intro {
  font-size: 30rpx;
  color: var(--c-muted);
  line-height: 2;
  text-align: center;
  padding: 0 16rpx;
  margin-bottom: 96rpx;
}

.breathing__stage {
  position: relative;
  width: 320rpx;
  height: 320rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.breathing__glow {
  position: absolute;
  top: -64rpx;
  left: -64rpx;
  right: -64rpx;
  bottom: -64rpx;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(18, 71, 3, 0.12) 0%, transparent 65%);
  animation: breathing-glow 4s ease-in-out infinite;
}

@keyframes breathing-glow {
  0%, 100% { transform: scale(0.72); opacity: 0.5; }
  50%      { transform: scale(1.18); opacity: 1; }
}

.breathing__ring {
  position: absolute;
  top: -16rpx;
  left: -16rpx;
  right: -16rpx;
  bottom: -16rpx;
  border-radius: 50%;
  border: 2rpx solid var(--c-primary);
  opacity: 0;
  animation: breathing-ring 4s ease-in-out infinite;
}

@keyframes breathing-ring {
  0%   { transform: scale(0.82); opacity: 0; }
  30%  { opacity: 0.2; }
  50%  { transform: scale(1.1); opacity: 0.1; }
  100% { transform: scale(0.82); opacity: 0; }
}

.breathing__circle {
  width: 296rpx;
  height: 296rpx;
  border-radius: 50%;
  background: var(--c-primary-soft);
  position: relative;
  z-index: 1;
}

.breathing__phase {
  margin-top: 52rpx;
  min-height: 44rpx;
  font-size: 28rpx;
  color: var(--c-primary);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-align: center;
  opacity: 0;
  transition: opacity 0.5s ease;
}

.breathing__phase--visible {
  opacity: 1;
}

.breathing__hint {
  margin-top: 44rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
  text-align: center;
  line-height: 1.75;
}

.breathing__hint--active {
  font-size: 28rpx;
  color: var(--c-ink);
  line-height: 1.85;
  max-width: 520rpx;
}

.breathing__actions {
  margin-top: 88rpx;
  display: flex;
  gap: 24rpx;
}

.breathing__btn {
  padding: 26rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  color: var(--c-muted);
  font-size: 28rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.breathing__btn--primary {
  background: var(--c-primary);
  color: #f0f5ef;
  border-color: transparent;
  box-shadow: var(--sh-card);
}

/* 减少动态：光晕/圆环停止循环，圆圈缩放由 JS 内联 transition 驱动，
   静止大圆 + 阶段文字仍完整传达 4-7-8 节奏 */
@media (prefers-reduced-motion: reduce) {
  .breathing__glow,
  .breathing__ring {
    animation: none;
    opacity: 0.35;
    transform: none;
  }
}
</style>
