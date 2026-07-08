<template>
  <view class="review-view">
    <view class="review-view__page-nav" @tap="$emit('close')">
      <view class="review-view__back-arrow">‹</view>
      <view class="review-view__back-label">图鉴</view>
    </view>
    <view class="review-view__title">{{ collection.name }}的回顾</view>

    <view v-if="snapshots.length === 0" class="review-view__loading">
      <view class="review-view__loading-text">{{ failed ? failedText : loadingText }}</view>
      <template v-if="!failed">
        <view class="review-view__loading-dots">
          <view class="review-view__dot"></view>
          <view class="review-view__dot review-view__dot--2"></view>
          <view class="review-view__dot review-view__dot--3"></view>
        </view>
        <view class="review-view__loading-sub">大概需要十几秒，也可以先回去逛逛，回来它就在了。</view>
      </template>
    </view>

    <view v-else class="review-view__list">
      <view v-for="snapshot in snapshots" :key="snapshot.id" class="review-view__entry">
        <view class="review-view__entry-text">{{ snapshot.text }}</view>
      </view>
    </view>
  </view>
</template>

<script>
import { getCollectionById, getCollectionItemById } from '@/content/library.js'
import { getReviewSnapshots, ensureFirstReviewSnapshot } from '@/state/reviewOrchestration.js'
import { getCompletionEvent } from '@/state/completionEvent.js'
import { track } from '@/state/analytics.js'
import { generateReviewText } from '@/api/review.js'
import { generateSummaryText } from '@/api/deepseek.js'

// product_handoff.md §5.4.1 定稿措辞：点进提示但回顾还在生成中时，用邀请式加载文案，
// 不用系统进度提示的语气。
const LOADING_TEXT = '一起回顾你为生活带来的新内容吧'
// 生成失败（多半是网络）：不出现技术字样，重试方式就是再进来一次，语气只负责把门留着。
const FAILED_TEXT = '回顾还在路上，这次没能取回来。过一会儿再进来看看就好。'

// 被动归档的摘要函数：从对话反查它对应的完成事件与图鉴条目，取该条目自己的标题/做法
//（旧实现统一用触发时"最后一条"的标题喂所有被动归档的对话，摘要素材是错位的）。
function summaryFnForConversation(conv) {
  const event = getCompletionEvent(conv.completion_event_id)
  const item = event ? getCollectionItemById(event.content_id) : null
  return generateSummaryText({
    contentTitle: item ? item.title : '',
    instructions: item ? item.instructions : '',
    conversation: conv,
  })
}

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
      failedText: FAILED_TEXT,
      failed: false,
    }
  },
  created() {
    // 埋点在 generate 之前：口径是"打开"，生成失败也算已打开（specs/analytics-events）。
    // 挂在组件而非入口点击处，未来任何新入口自动覆盖。
    track('review_opened', { collection_id: this.collectionId })
    // defer-review-to-first-view：快照在首次点开时才生成，最后一条目的聊聊因此来得及
    // 进入素材。失败不落半成品，下次进来这段逻辑自然重试——不需要任何后台补偿。
    if (this.snapshots.length === 0) {
      this.generate()
    }
  },
  methods: {
    async generate() {
      this.failed = false
      try {
        await ensureFirstReviewSnapshot(this.collectionId, generateReviewText, summaryFnForConversation)
        this.snapshots = getReviewSnapshots(this.collectionId)
      } catch (err) {
        console.error('ensureFirstReviewSnapshot failed:', err)
        this.failed = true
      }
    },
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
  text-align: center;
  padding: 120rpx 0;
}

.review-view__loading-text {
  font-size: 28rpx;
  color: var(--c-subtle);
  line-height: 1.85;
}

/* 呼吸闪烁的三个点：告诉用户"正在进行中"，节奏沿用 ChatView 思考指示器（1.4s） */
.review-view__loading-dots {
  margin-top: 36rpx;
  display: flex;
  justify-content: center;
  gap: 14rpx;
}

.review-view__dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--c-subtle);
  animation: review-dot-breathe 1.4s ease-in-out infinite;
}

.review-view__dot--2 {
  animation-delay: 0.2s;
}

.review-view__dot--3 {
  animation-delay: 0.4s;
}

@keyframes review-dot-breathe {
  0%, 100% { opacity: 0.25; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.05); }
}

.review-view__loading-sub {
  margin-top: 32rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
  line-height: 1.75;
  padding: 0 40rpx;
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
