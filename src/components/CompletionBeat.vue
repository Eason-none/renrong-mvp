<template>
  <view class="completion-beat" hover-class="u-press" @tap="skip">
    <view class="completion-beat__mark">
      <view class="seal-leaf"></view>
    </view>
    <text class="completion-beat__text">这几分钟，是你自己的</text>
  </view>
</template>

<script>
// 完成一拍（completion-beat）：点"做完啦"后先接住这一刻，再邀请聊聊——不是下一步任务，
// 是对刚发生的事的一句确认。≤1.2s自动继续，随时可点击跳过。
export default {
  name: 'CompletionBeat',
  emits: ['done'],
  mounted() {
    this.timer = setTimeout(() => this.$emit('done'), 1200)
  },
  beforeUnmount() {
    clearTimeout(this.timer)
  },
  methods: {
    skip() {
      clearTimeout(this.timer)
      this.$emit('done')
    },
  },
}
</script>

<style>
.completion-beat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 40rpx;
  /* page-settle 关键帧定义在 ChatView.vue（全局样式，同一落册节奏在归档收尾时再出现一次） */
  animation: page-settle 1.2s var(--ease-out) both;
}

.completion-beat__mark {
  margin-bottom: 20rpx;
}

/* 压花叶印记（与 ChatView 收尾同款：SVG 走 background-image，双端可渲染；小程序样式隔离，各组件自带一份） */
.seal-leaf {
  width: 30rpx;
  height: 75rpx;
  background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNDAgMTAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCwxMCBDMzUsMjUgMzUsNjIuNSAyMCw3MCBDNSw2Mi41IDUsMjUgMjAsMTAgWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2Q5MTMwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxsaW5lIHgxPSIyMCIgeTE9IjEwIiB4Mj0iMjAiIHkyPSI4NSIgc3Ryb2tlPSIjY2Q5MTMwIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGcgc3Ryb2tlPSIjY2Q5MTMwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PGxpbmUgeDE9IjIwIiB5MT0iMzAuNiIgeDI9IjI2LjQiIHkyPSIxOSIvPjxsaW5lIHgxPSIyMCIgeTE9IjQzLjgiIHgyPSIxMC42IiB5Mj0iMjYuOSIvPjxsaW5lIHgxPSIyMCIgeTE9IjQ5LjQiIHgyPSIzMC41IiB5Mj0iMzEiLz48bGluZSB4MT0iMjAiIHkxPSI2MC42IiB4Mj0iOC44IiB5Mj0iNDAuOCIvPjwvZz48L3N2Zz4=");
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

.completion-beat__text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.85;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .completion-beat {
    animation: fade-in 0.3s ease both;
  }
}
</style>
