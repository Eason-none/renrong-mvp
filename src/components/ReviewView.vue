<template>
  <view class="review-view">
    <view class="review-view__page-nav" @tap="$emit('close')">
      <view class="review-view__back-arrow">‹</view>
      <view class="review-view__back-label">图鉴</view>
    </view>
    <view class="review-view__title">{{ collection.name }}的回顾</view>

    <view v-if="snapshots.length === 0" class="review-view__loading">{{ loadingText }}</view>

    <view v-else class="review-view__list">
      <view v-for="snapshot in snapshots" :key="snapshot.id" class="review-view__entry">
        <view class="review-view__entry-text">{{ snapshot.text }}</view>
      </view>
    </view>
  </view>
</template>

<script>
import { getCollectionById } from '@/content/library.js'
import { getReviewSnapshots } from '@/state/reviewOrchestration.js'

// product_handoff.md §5.4.1 定稿措辞：点进提示但回顾还在生成中时，用邀请式加载文案，
// 不用系统进度提示的语气。
const LOADING_TEXT = '一起回顾你为生活带来的新内容吧'

export default {
  name: 'ReviewView',
  props: {
    collectionId: { type: String, required: true },
  },
  emits: ['close'],
  data() {
    return {
      collection: getCollectionById(this.collectionId),
      snapshots: getReviewSnapshots(this.collectionId),
      loadingText: LOADING_TEXT,
    }
  },
}
</script>

<style>
.review-view {
  display: flex;
  flex-direction: column;
  padding: 0 40rpx;
  width: 100%;
  box-sizing: border-box;
}

.review-view__page-nav {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 32rpx 0 8rpx;
  margin-bottom: 4rpx;
}

.review-view__back-arrow {
  font-size: 32rpx;
  color: var(--c-primary);
  line-height: 1;
}

.review-view__back-label {
  font-size: 28rpx;
  color: var(--c-primary);
}

.review-view__title {
  font-size: 40rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin-bottom: 48rpx;
}

.review-view__loading {
  font-size: 28rpx;
  color: var(--c-subtle);
  line-height: 1.85;
  text-align: center;
  padding: 120rpx 0;
}

.review-view__list {
  width: 100%;
}

.review-view__entry {
  margin-bottom: 80rpx;
}

.review-view__entry-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 2;
  white-space: pre-wrap;
}
</style>
