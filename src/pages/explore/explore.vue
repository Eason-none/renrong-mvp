<template>
  <view class="page">
    <template v-if="view === 'grid'">
      <NavBar />
      <view class="page__header">
        <view class="page__title">丰荣探索</view>
        <view v-if="totalReviewCount > 1" class="page__all-reviews-icon" hover-class="u-press" @tap="view = 'all-reviews'">回顾</view>
      </view>
      <view class="page__subtitle">你当然可以对每个探索的内容按自己的喜好调整，这些不是任务，去尝试去体验最重要</view>
      <CollectionGrid ref="grid" @select="onSelect" @review-tap="onReviewTap" />
      <FirstTimeHint hint-key="explore-intro" text="这里是不同主题下的丰荣活动合集，挑感兴趣的自由探索。" />
      <CollectionUnlockModal
        v-if="selectedId"
        :collection-id="selectedId"
        @close="selectedId = null"
        @changed="onChanged"
        @enter="onEnter"
      />
    </template>
    <CollectionDetail
      v-else-if="view === 'detail'"
      :collection-id="activeCollectionId"
      @close="onLeaveDetail"
    />
    <ReviewView v-else-if="view === 'review'" :collection-id="activeCollectionId" @close="backToGrid" />
    <AllReviewsView v-else-if="view === 'all-reviews'" @close="backToGrid" />
  </view>
</template>

<script>
import NavBar from '@/components/NavBar.vue'
import CollectionGrid from '@/components/CollectionGrid.vue'
import CollectionUnlockModal from '@/components/CollectionUnlockModal.vue'
import CollectionDetail from '@/components/CollectionDetail.vue'
import ReviewView from '@/components/ReviewView.vue'
import AllReviewsView from '@/components/AllReviewsView.vue'
import FirstTimeHint from '@/components/FirstTimeHint.vue'
import { getAllCollections } from '@/content/library.js'
import { getReviewSnapshots } from '@/state/reviewOrchestration.js'

function countAllReviews() {
  return getAllCollections().reduce((sum, c) => sum + getReviewSnapshots(c.id).length, 0)
}

export default {
  components: { NavBar, CollectionGrid, CollectionUnlockModal, CollectionDetail, ReviewView, AllReviewsView, FirstTimeHint },
  data() {
    return { selectedId: null, view: 'grid', activeCollectionId: null, totalReviewCount: countAllReviews() }
  },
  methods: {
    onSelect(collectionId) {
      this.selectedId = collectionId
    },
    onChanged() {
      this.$refs.grid.refresh()
    },
    onEnter(collectionId) {
      this.selectedId = null
      this.activeCollectionId = collectionId
      this.view = 'detail'
    },
    onReviewTap(collectionId) {
      this.activeCollectionId = collectionId
      this.view = 'review'
    },
    onLeaveDetail() {
      this.backToGrid()
    },
    backToGrid() {
      // CollectionGrid挂在view==='grid'分支上，切回去时v-if重新挂载，data()天然重跑一次，
      // 拿到离开期间变化的最新状态（完成度/棘轮/新回顾）——不需要手动调用refresh()。
      this.totalReviewCount = countAllReviews()
      this.view = 'grid'
      this.activeCollectionId = null
    },
  },
}
</script>

<style>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 128rpx;
  padding-bottom: 48rpx;
  /* H5 端 --window-top/--window-bottom 是导航栏/tabbar 高度，小程序端为 0 */
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  box-sizing: border-box;
}

.page__header {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 12rpx;
  animation: rise-in 0.32s var(--ease-out) both;
}

.page__subtitle {
  width: 100%;
  padding: 0 70rpx;
  box-sizing: border-box;
  text-align: center;
  font-size: 24rpx;
  color: var(--c-subtle);
  line-height: 1.7;
  margin-bottom: 36rpx;
  animation: rise-in 0.32s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .page__header,
  .page__subtitle {
    animation: fade-in 0.2s ease both;
  }
}

.page__title {
  font-size: 44rpx;
  color: var(--c-ink);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.page__all-reviews-icon {
  position: absolute;
  right: 40rpx;
  font-size: 26rpx;
  color: var(--c-primary);
  padding: 14rpx 28rpx;
  background: var(--c-card);
  border: 1rpx solid var(--c-border-s);
  border-radius: 999rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
</style>
