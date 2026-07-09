<template>
  <view class="collection-grid">
    <view
      v-for="(entry, index) in collections"
      :key="entry.collection.id"
      class="collection-grid__card"
      :class="`collection-grid__card--${entry.state.status}`"
      :style="{ animationDelay: Math.min(index, 7) * 45 + 'ms' }"
      hover-class="u-press"
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
          hover-class="u-press"
          @tap.stop="$emit('reviewTap', entry.collection.id)"
        >
          ✦ 已点亮  回顾 →
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

const TYPE_LABELS = { perception: '感知', event: '事件' }

// defer-review-to-first-view：completed 即有回顾入口（快照在首次点开时才生成），
// 卡片不再需要区分"快照是否已存在"。
function loadCollections() {
  return getAllCollections().map((collection) => ({
    collection,
    state: getCollectionState(collection.id),
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
  padding: 0 24rpx;
  width: 100%;
  box-sizing: border-box;
}

/* 状态权重与产品意图一致：
   locked   = 还没贴进册子的空位，退回纸面（无卡无影）
   active   = 贴上去的标本卡，绿色标记
   completed= 烫金的一页，全 app 唯一的金色时刻 */
.collection-grid__card {
  width: calc(50% - 10rpx);
  min-height: 276rpx;
  padding: 28rpx;
  border-radius: 28rpx;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  box-shadow: var(--sh-card);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  animation: rise-in 0.32s var(--ease-out) both;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

@media (prefers-reduced-motion: reduce) {
  .collection-grid__card {
    animation: fade-in 0.2s ease both;
  }
}

.collection-grid__card--locked {
  background: transparent;
  box-shadow: none;
  border: 1rpx solid var(--c-border);
}

.collection-grid__card--completed {
  border: 2rpx solid rgba(205, 145, 48, 0.45);
  background: var(--c-accent-soft);
}

.collection-grid__card--active {
  border: 1rpx solid rgba(18, 71, 3, 0.3);
}

.collection-grid__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.collection-grid__type {
  font-size: 22rpx;
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

/* 烫金底上的灰绿小字会发灰，换更深的中性色保证对比 */
.collection-grid__card--completed .collection-grid__intro,
.collection-grid__card--completed .collection-grid__type {
  color: var(--c-muted);
}

.collection-grid__status {
  font-size: 24rpx;
  color: var(--c-subtle);
  margin-top: 20rpx;
}

.collection-grid__status--active {
  color: var(--c-primary);
  font-weight: 500;
}

.collection-grid__status--done {
  color: var(--c-accent-ink);
  font-weight: 500;
}
</style>
