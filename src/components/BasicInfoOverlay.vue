<template>
  <!-- 从日推卡片跳转的基本信息设置（独立遮罩）。原内联在 index.vue（god component 拆分）。 -->
  <view class="basic-info-overlay">
    <view class="basic-info-overlay__sheet">
      <view class="basic-info-overlay__back" @tap="$emit('close')">← 返回</view>
      <scroll-view class="basic-info-overlay__scroll" scroll-y>
        <BasicInfoSettings @close="$emit('close')" />
      </scroll-view>
    </view>
  </view>
</template>

<script>
import BasicInfoSettings from '@/components/BasicInfoSettings.vue'

export default {
  name: 'BasicInfoOverlay',
  components: { BasicInfoSettings },
  emits: ['close'],
}
</script>

<style>
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
  font-size: 28rpx;
  color: var(--c-primary);
  padding: 12rpx 24rpx 12rpx 0;
  margin: -12rpx 0 4rpx;
}
</style>
