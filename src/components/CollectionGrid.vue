<template>
  <view class="collection-grid">
    <view
      v-for="entry in collections"
      :key="entry.collection.id"
      class="collection-grid__card"
      :class="`collection-grid__card--${entry.state.status}`"
      @tap="$emit('select', entry.collection.id)"
    >
      <view>
        <view class="collection-grid__top">
          <view class="collection-grid__type">{{ typeLabel(entry.collection.collection_type) }}</view>
          <view class="collection-grid__pip" :class="`collection-grid__pip--${entry.state.status}`"></view>
        </view>
        <view class="collection-grid__name">{{ entry.collection.name }}</view>
        <view v-if="entry.state.status !== 'locked'" class="collection-grid__intro">{{ entry.collection.intro }}</view>
      </view>
      <view>
        <view
          v-if="entry.state.status === 'completed'"
          class="collection-grid__status collection-grid__status--done"
          @tap.stop="$emit('reviewTap', entry.collection.id)"
        >
          {{ entry.hasReview ? '✦ 已点亮  回顾 →' : '✦ 已点亮' }}
        </view>
        <view v-else-if="entry.state.status === 'active'" class="collection-grid__status collection-grid__status--active">进行中</view>
        <view v-else class="collection-grid__status">未激活</view>
      </view>
    </view>
  </view>
</template>

<script>
import { getAllCollections } from '@/content/library.js'
import { getCollectionState } from '@/state/collectionMachine.js'
import { getReviewSnapshots } from '@/state/reviewOrchestration.js'

const TYPE_LABELS = { perception: '感知', event: '事件' }

function loadCollections() {
  return getAllCollections().map((collection) => ({
    collection,
    state: getCollectionState(collection.id),
    hasReview: getReviewSnapshots(collection.id).length > 0,
  }))
}

export default {
  name: 'CollectionGrid',
  emits: ['select', 'reviewTap'],
  data() {
    return {
      collections: loadCollections(),
    }
  },
  methods: {
    typeLabel(type) {
      return TYPE_LABELS[type] ?? type
    },
    refresh() {
      this.collections = loadCollections()
    },
  },
}
</script>

<style>
.collection-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
  padding: 0 20rpx;
  width: 100%;
}

.collection-grid__card {
  width: calc(50% - 10rpx);
  min-height: 276rpx;
  padding: 28rpx;
  border-radius: 36rpx;
  border: 1rpx solid var(--c-border);
  background: var(--c-bg);
  box-shadow: var(--sh-card);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.collection-grid__card--locked {
  background: var(--c-surface-alt);
  box-shadow: none;
  border-color: var(--c-border);
}

.collection-grid__card--completed {
  border-color: rgba(205, 145, 48, 0.25);
  background: rgba(205, 145, 48, 0.03);
}

.collection-grid__card--active {
  border-color: rgba(18, 71, 3, 0.22);
  background: rgba(18, 71, 3, 0.03);
}

.collection-grid__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.collection-grid__type {
  font-size: 20rpx;
  color: var(--c-subtle);
  letter-spacing: 0.12em;
}

.collection-grid__pip {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--c-border-s);
}

.collection-grid__pip--active {
  background: var(--c-primary);
}

.collection-grid__pip--completed {
  background: var(--c-accent);
}

.collection-grid__name {
  font-size: 30rpx;
  color: var(--c-ink);
  font-weight: 500;
  line-height: 1.3;
  margin-bottom: 12rpx;
}

.collection-grid__card--locked .collection-grid__name {
  color: var(--c-subtle);
  font-weight: 400;
}

.collection-grid__intro {
  font-size: 22rpx;
  color: var(--c-subtle);
  line-height: 1.65;
}

.collection-grid__status {
  font-size: 22rpx;
  color: var(--c-subtle);
  margin-top: 20rpx;
}

.collection-grid__status--active {
  color: var(--c-primary);
}

.collection-grid__status--done {
  color: var(--c-accent);
  font-weight: 500;
}
</style>
