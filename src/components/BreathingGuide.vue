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

    <!-- 节奏点：每秒柔和点亮一颗（数量=阶段秒数），给"这个阶段走到哪了"的进度感。
         刻意不用数字倒计时——数字给的是精度，带来的是紧张感（内测反馈：第一遍跟不上，
         但平时的倒计时又让人紧张）。屏息7s原本完全静止，是最容易失去节奏感的一段。 -->
    <view class="breathing__beats" :class="{ 'breathing__beats--visible': beats > 0 }">
      <view
        v-for="k in beats"
        :key="k"
        class="breathing__beat"
        :class="{ 'breathing__beat--lit': k <= beatsLit }"
      ></view>
    </view>

    <view
      v-if="hintVisible"
      class="breathing__hint"
      :class="{ 'breathing__hint--active': hintActive }"
    >{{ hint }}</view>

    <view v-if="!started" class="breathing__actions">
      <view class="breathing__btn breathing__btn--primary" hover-class="u-press" @tap="start">我准备好了</view>
      <view class="breathing__btn" hover-class="u-press" @tap="skip">跳过</view>
    </view>

    <!-- 环境音开关：默认开、不持久化不上报（breathing-entry 的无痕原则）。
         只在引导进行中出现——没开始就没有声音，无需开关。 -->
    <view v-if="started && !leaving" class="breathing__sound" hover-class="u-press" @tap="toggleSound">
      {{ soundOn ? '海浪声 开' : '海浪声 关' }}
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
      beats: 0, // 当前阶段节奏点总数（=阶段秒数），0=未开始不显示
      beatsLit: 0, // 已点亮颗数
      soundOn: true, // 环境音开关（会话内有效，不持久化）
    }
  },
  created() {
    this.timers = []
    this.audio = null // InnerAudioContext 原生对象，不进响应式
    this.fadeTimer = null
  },
  beforeUnmount() {
    this.clearTimers()
    this.stopAudio()
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
    // 整体渐淡0.6s后再真正离场——呼吸引导的收束不该是硬切；声音跟着画面一起淡出
    finish() {
      if (this.leaving) return
      this.leaving = true
      this.fadeAudioTo(0, 600)
      this.later(() => {
        this.stopAudio()
        this.$emit('done')
      }, 600)
    },
    // 环境音：起播挂在"我准备好了"这个用户手势上（自动播放策略要求），
    // 2s 淡入到 0.5——海浪不该"啪"地出现。iOS 静音键保持默认跟随（静音场景合理）。
    startAudio() {
      const ctx = uni.createInnerAudioContext()
      ctx.src = '/static/audio/breathing-sea.mp3'
      ctx.loop = true
      ctx.volume = 0
      ctx.onError((err) => {
        // 音频失败静默降级为无声引导——声音是氛围不是机制，绝不报错打扰
        console.error('breathing audio failed:', err)
      })
      ctx.play()
      this.audio = ctx
      if (this.soundOn) this.fadeAudioTo(0.5, 2000)
    },
    fadeAudioTo(target, ms) {
      clearInterval(this.fadeTimer)
      const ctx = this.audio
      if (!ctx) return
      const stepMs = 100
      const step = (target - ctx.volume) / Math.max(1, ms / stepMs)
      this.fadeTimer = setInterval(() => {
        const next = ctx.volume + step
        const done = step >= 0 ? next >= target : next <= target
        ctx.volume = Math.min(1, Math.max(0, done ? target : next))
        if (done) clearInterval(this.fadeTimer)
      }, stepMs)
    },
    stopAudio() {
      clearInterval(this.fadeTimer)
      if (this.audio) {
        this.audio.stop()
        this.audio.destroy()
        this.audio = null
      }
    },
    toggleSound() {
      this.soundOn = !this.soundOn
      this.fadeAudioTo(this.soundOn ? 0.5 : 0, 400)
    },
    start() {
      if (this.started) return
      this.started = true
      this.startAudio()
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
    // 节奏点：第1颗随阶段开始即亮，之后每秒亮一颗，阶段结束时恰好全亮。
    // 定时器走 later()，与阶段定时器同一清理通道（跳过时 clearTimers 一并带走）。
    startBeats(n) {
      this.beats = n
      this.beatsLit = 1
      for (let k = 2; k <= n; k++) {
        this.later(() => {
          this.beatsLit = k
        }, (k - 1) * 1000)
      }
    },
    runCycle(count) {
      // 吸气 4s：圆圈放大
      this.setPhase('吸气')
      this.startBeats(4)
      this.circleTransition = 'transform 4s ease-in-out'
      this.circleScale = 1.1
      this.later(() => {
        // 屏息 7s：定格，不变化
        this.circleTransition = 'none'
        this.setPhase('屏住呼吸，坚持住')
        this.startBeats(7)
        this.later(() => {
          // 呼气 8s：圆圈缩回
          this.setPhase('慢慢呼气')
          this.startBeats(8)
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

.breathing__beats {
  margin-top: 24rpx;
  min-height: 12rpx;
  display: flex;
  justify-content: center;
  gap: 14rpx;
  opacity: 0;
  transition: opacity 0.5s ease;
}

.breathing__beats--visible {
  opacity: 1;
}

.breathing__beat {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--c-border-s);
  opacity: 0.5;
  transition: background 0.4s ease, opacity 0.4s ease;
}

/* 点亮是柔和的透明度/颜色缓变，不是"滴答"跳变——节奏可感但不催促 */
.breathing__beat--lit {
  background: var(--c-primary);
  opacity: 0.55;
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

.breathing__sound {
  margin-top: 56rpx;
  font-size: 22rpx;
  color: var(--c-subtle);
  padding: 12rpx 24rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
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
