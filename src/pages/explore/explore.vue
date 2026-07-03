<template>
  <view class="page">
    <template v-if="view === 'grid'">
      <NavBar />
      <view class="page__header">
        <view class="page__title">丰荣探索</view>
        <view v-if="totalReviewCount > 1" class="page__all-reviews-icon" @tap="view = 'all-reviews'">回顾</view>
      </view>
      <CollectionGrid ref="grid" @select="onSelect" @review-tap="onReviewTap" />
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
import { getAllCollections } from '@/content/library.js'
import { getReviewSnapshots } from '@/state/reviewOrchestration.js'

function countAllReviews() {
  return getAllCollections().reduce((sum, c) => sum + getReviewSnapshots(c.id).length, 0)
}

export default {
  components: { NavBar, CollectionGrid, CollectionUnlockModal, CollectionDetail, ReviewView, AllReviewsView },
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
  padding-top: 200rpx;
}

.page__header {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 32rpx;
}

.page__title {
  font-size: 40rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
}

.page__all-reviews-icon {
  position: absolute;
  right: 40rpx;
  font-size: 24rpx;
  color: var(--c-primary);
  padding: 10rpx 22rpx;
  border: 1rpx solid rgba(18, 71, 3, 0.35);
  border-radius: 999rpx;
}
</style>
