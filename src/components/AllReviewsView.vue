<template>
  <view class="all-reviews">
    <view class="all-reviews__page-nav" hover-class="u-press" @tap="$emit('close')">
      <view class="all-reviews__back-arrow">‹</view>
      <view class="all-reviews__back-label">图鉴</view>
    </view>
    <view class="all-reviews__title">所有回顾</view>
    <view v-for="group in groups" :key="group.collectionId" class="all-reviews__group">
      <view class="all-reviews__group-name">{{ group.name }}</view>
      <view v-for="snapshot in group.snapshots" :key="snapshot.id" class="all-reviews__entry">
        <view class="all-reviews__entry-text">{{ snapshot.text }}</view>
      </view>
    </view>
  </view>
</template>

<script>
import { getAllCollections } from '@/content/library.js'
import { getReviewSnapshots } from '@/state/reviewOrchestration.js'

export default {
  name: 'AllReviewsView',
  emits: ['close'],
  data() {
    return {
      groups: getAllCollections()
        .map((c) => ({ collectionId: c.id, name: c.name, snapshots: getReviewSnapshots(c.id) }))
        .filter((g) => g.snapshots.length > 0),
    }
  },
}
</script>

<style>
.all-reviews {
  display: flex;
  flex-direction: column;
  padding: 0 40rpx;
  width: 100%;
  box-sizing: border-box;
}

.all-reviews__page-nav {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 32rpx 0 8rpx;
  margin-bottom: 4rpx;
}

.all-reviews__back-arrow {
  font-size: 32rpx;
  color: var(--c-primary);
  line-height: 1;
}

.all-reviews__back-label {
  font-size: 28rpx;
  color: var(--c-primary);
}

.all-reviews__title {
  font-size: 40rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin-bottom: 56rpx;
}

.all-reviews__group {
  width: 100%;
  margin-bottom: 72rpx;
}

.all-reviews__group-name {
  font-size: 24rpx;
  color: var(--c-subtle);
  letter-spacing: 0.10em;
  margin-bottom: 24rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid var(--c-border);
}

.all-reviews__entry {
  margin-bottom: 40rpx;
}

.all-reviews__entry-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 2;
  white-space: pre-wrap;
}
</style>
