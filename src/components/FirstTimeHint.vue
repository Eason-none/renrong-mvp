<template>
  <!-- @tap.stop：这是全屏模态，点击不能漏给底下的界面——否则在 TracePage 这类
       "根节点点击即关闭"的弹层里，点「知道了」会连带把弹层一起关掉 -->
  <view v-if="visible" class="first-hint" @tap.stop>
    <view class="first-hint__sheet">
      <view class="first-hint__text">{{ text }}</view>
      <view class="first-hint__btn" hover-class="u-press" @tap="dismiss">知道了</view>
    </view>
  </view>
</template>

<script>
import { hasSeenHint, markHintSeen } from '@/state/onboardingHints.js'

// 首次引导气泡：挂在任意界面上，同一 hintKey 全生命周期只弹一次。
// 展示时机由父组件的渲染条件控制（比如"已领取列表非空时"），本组件只管已读判定和关闭。
// 关闭时发 dismiss 事件——需要"一个气泡看完再出下一个"的排队场景（如聊天里的照片说明）用它接力。
export default {
  name: 'FirstTimeHint',
  props: {
    hintKey: { type: String, required: true },
    text: { type: String, required: true },
  },
  emits: ['dismiss'],
  data() {
    return {
      visible: !hasSeenHint(this.hintKey),
    }
  },
  methods: {
    dismiss() {
      markHintSeen(this.hintKey)
      this.visible = false
      this.$emit('dismiss')
    },
  },
}
</script>

<style>
.first-hint {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: fade-in 0.2s ease both;
}

.first-hint__sheet {
  width: 72%;
  background: var(--c-card);
  border-radius: 32rpx;
  padding: 48rpx 44rpx 40rpx;
  box-shadow: var(--sh-float);
  animation: rise-in 0.3s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .first-hint,
  .first-hint__sheet {
    animation: fade-in 0.2s ease both;
  }
}

.first-hint__text {
  font-size: 28rpx;
  color: var(--c-ink);
  line-height: 1.85;
  margin-bottom: 36rpx;
}

.first-hint__btn {
  align-self: center;
  text-align: center;
  padding: 22rpx 0;
  border-radius: 999rpx;
  background: var(--c-primary);
  color: #f0f5ef;
  font-size: 28rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
</style>
