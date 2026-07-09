<template>
  <view class="collection-detail" :class="{ 'collection-detail--fill': step === 'card' }">
    <view class="collection-detail__page-nav" hover-class="u-press" @tap="back">
      <view class="collection-detail__back-arrow">‹</view>
      <view class="collection-detail__back-label">图鉴</view>
    </view>

    <template v-if="step === 'list'">
      <view class="collection-detail__header">
        <view class="collection-detail__type-tag">{{ typeLabel }}</view>
        <view class="collection-detail__title">{{ collection.name }}</view>
        <view class="collection-detail__intro">{{ collection.intro }}</view>
      </view>

      <view
        v-for="item in collection.items"
        :key="item.id"
        class="collection-detail__item-row"
        :class="{ 'collection-detail__item-row--done': doneItemIds.includes(item.id) }"
        hover-class="u-press"
        @tap="onRowTap(item)"
      >
        <view class="collection-detail__item-dot"></view>
        <view class="collection-detail__item-body">
          <view class="collection-detail__item-title">{{ item.title }}</view>
          <view class="collection-detail__item-meta">{{ item.time }}</view>
        </view>
        <view v-if="!doneItemIds.includes(item.id)" class="collection-detail__item-arrow">›</view>
        <view v-else-if="canChat(item)" class="collection-detail__item-chat">聊聊 ›</view>
      </view>
    </template>

    <!-- 手贴卡（与即时小事同一套词汇）：居中微旋 + 纸胶带，"做完啦"沉底 -->
    <template v-else-if="step === 'card'">
      <view class="collection-detail__stage">
        <view class="collection-detail__card collection-detail__card--pinned">
          <view class="collection-detail__tape"></view>
          <view class="collection-detail__card-badge">{{ selectedItem.time }}</view>
          <view class="collection-detail__card-title">{{ selectedItem.title }}</view>
          <view v-if="selectedItem.condition" class="collection-detail__card-condition">{{ selectedItem.condition }}</view>
          <view class="collection-detail__card-hr"></view>
          <view class="collection-detail__card-instructions">{{ selectedItem.instructions }}</view>
        </view>
      </view>
      <view class="collection-detail__done-btn" hover-class="u-press" @tap="markDone">做完啦</view>
    </template>

    <template v-else-if="step === 'invite'">
      <view class="collection-detail__invite">
        <view class="ritual-seal">✦</view>
        <view class="collection-detail__invite-text">{{ inviteText }}</view>
        <view class="collection-detail__actions">
          <view class="collection-detail__btn collection-detail__btn--primary" hover-class="u-press" @tap="startChat">聊聊</view>
          <view class="collection-detail__btn" hover-class="u-press" @tap="backToList">跳过</view>
        </view>
      </view>
    </template>

    <ChatView
      v-else-if="step === 'chat'"
      :conversation-id="conversationId"
      :content-title="selectedItem.title"
      :instructions="selectedItem.instructions"
      :previous-summary="previousSummary"
      layer="collection"
      @close="onChatClose"
    />
  </view>
</template>

<script>
import { getCollectionById } from '@/content/library.js'
import { createCompletionEvent, COMPLETION_INVITE_TEXT } from '@/state/completionEvent.js'
import { get, KEYS } from '@/state/storage.js'
import { createConversation, getLatestSummaryForContent, getConversationByCompletionEventId, archiveConversation } from '@/state/conversation.js'
import { generateSummaryText } from '@/api/deepseek.js'
import ChatView from '@/components/ChatView.vue'

const TYPE_LABELS = { perception: '感知', event: '事件' }

// 条目是否已锁定（列表里不再显示"聊聊"、不可再进）：真正聊过（发过用户消息）或对话已归档，都算锁定。
// 不能只看消息数——图鉴到100%时会把该图鉴下所有未归档对话（含"点了聊聊没说话"的空对话）批量归档，
// 那些空对话消息数仍是0，若只按消息数判定就会被当成"没聊过"而可再进，进而对已归档对话发消息触发"已归档"报错。
// 也不能只看归档——归档依赖摘要API可能失败。两者取或，才既挡住已归档、又保住"进了没说话就退"的补聊入口。
function isItemLocked(completionEventId) {
  const conv = getConversationByCompletionEventId(completionEventId)
  return !!conv && (conv.archived || conv.user_message_count > 0)
}

export default {
  name: 'CollectionDetail',
  components: { ChatView },
  props: {
    collectionId: { type: String, required: true },
  },
  emits: ['close', 'changed'],
  data() {
    const events = get(KEYS.COMPLETION_EVENTS, [])
      .filter((e) => e.content_type === 'collection_item' && e.collection_id === this.collectionId)
    const itemEventMap = {}
    for (const e of events) itemEventMap[e.content_id] = e.id // 同一条做过多次时取最后写入（时间最新）的事件
    return {
      collection: getCollectionById(this.collectionId),
      step: 'list',
      selectedItem: null,
      doneItemIds: events.map((e) => e.content_id),
      // itemId -> 该条对应的 completionEventId：补聊时复用同一事件，不重复计完成度、不重复触发回顾
      itemEventMap,
      // 已锁定（不显示"聊聊"）的条目，判据见 isItemLocked。仅"进了没说话就退"的空对话保留补聊入口。
      lockedItemIds: events.filter((e) => isItemLocked(e.id)).map((e) => e.content_id),
      inviteText: COMPLETION_INVITE_TEXT,
      completionEventId: null,
      conversationId: null,
      previousSummary: null,
    }
  },
  computed: {
    typeLabel() {
      return TYPE_LABELS[this.collection.collection_type] ?? this.collection.collection_type
    },
  },
  methods: {
    // 未完成 -> 进内容卡走完整流程；做完啦但还没真正聊过 -> 补聊；已经聊过 -> 锁定不响应
    onRowTap(item) {
      if (!this.doneItemIds.includes(item.id)) {
        this.chooseItem(item)
        return
      }
      if (this.lockedItemIds.includes(item.id)) return
      this.reChat(item)
    },
    canChat(item) {
      return this.doneItemIds.includes(item.id) && !this.lockedItemIds.includes(item.id)
    },
    // 补聊：复用该条已有的 completionEventId，不新建完成事件（否则会重复计完成度/重复触发回顾）
    reChat(item) {
      this.selectedItem = item
      this.completionEventId = this.itemEventMap[item.id]
      this.previousSummary = getLatestSummaryForContent(item.id)?.summary_text ?? null
      this.step = 'invite'
    },
    refreshLocked() {
      this.lockedItemIds = get(KEYS.COMPLETION_EVENTS, [])
        .filter((e) => e.content_type === 'collection_item' && e.collection_id === this.collectionId)
        .filter((e) => isItemLocked(e.id))
        .map((e) => e.content_id)
    },
    chooseItem(item) {
      this.selectedItem = item
      this.step = 'card'
    },
    markDone() {
      // previous_summary要在创建本次CompletionEvent之前取——否则查到的是"本次"而不是"上次"。
      this.previousSummary = getLatestSummaryForContent(this.selectedItem.id)?.summary_text ?? null
      this.completionEventId = createCompletionEvent({
        contentId: this.selectedItem.id,
        contentType: 'collection_item',
        collectionId: this.collectionId,
      }).id
      this.doneItemIds = [...this.doneItemIds, this.selectedItem.id]
      // 记下事件id：若这条随后跳过了聊聊，之后仍能凭它补聊（不新建完成事件）
      this.itemEventMap = { ...this.itemEventMap, [this.selectedItem.id]: this.completionEventId }

      // 回顾不在这里触发（defer-review-to-first-view）：快照在用户首次点开回顾时
      // 由 ReviewView 惰性生成，这样最后这条的聊聊也来得及进入素材。这里只需通知刷新。
      this.$emit('changed')
      this.step = 'invite'
    },
    startChat() {
      // 补聊时该条可能已有一个未归档的对话（上次"返回"退出留下的）——续用它，不能再新建（1:1绑定会抛错）
      const existing = getConversationByCompletionEventId(this.completionEventId)
      this.conversationId = existing ? existing.id : createConversation(this.completionEventId).id
      this.step = 'chat'
    },
    // 聊天退出（无论"说完了"还是"‹ 返回"）都走这里：聊过就顺手归档，让它和"说完了"一样封存、不再显示"聊聊"。
    async onChatClose() {
      const conv = this.completionEventId ? getConversationByCompletionEventId(this.completionEventId) : null
      if (conv && !conv.archived && conv.messages.length > 0) {
        // "说完了"退出的已在 ChatView 内归档，这里 !conv.archived 会自然跳过；此处专为"返回"退出的补归档。
        try {
          await archiveConversation(conv.id, (c) =>
            generateSummaryText({ contentTitle: this.selectedItem.title, instructions: this.selectedItem.instructions, conversation: c })
          )
        } catch (err) {
          console.error('archiveConversation on close failed', err)
        }
      }
      this.backToList()
    },
    backToList() {
      this.step = 'list'
      this.selectedItem = null
      this.conversationId = null
      this.previousSummary = null
      this.refreshLocked() // 刚聊过/刚归档的条目此时应变为锁定，不再显示"聊聊"
    },
    back() {
      if (this.step === 'list') {
        this.$emit('close')
      } else {
        this.backToList()
      }
    },
  },
}
</script>

<style>
.collection-detail {
  display: flex;
  flex-direction: column;
  padding: 0 40rpx;
  width: 100%;
  box-sizing: border-box;
}

/* 条目卡步骤：撑满可视高度，让"做完啦"沉到拇指区。
   176rpx = explore 页 .page 的上(128)下(48)内边距，改那边时同步这里 */
.collection-detail--fill {
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px) - 176rpx);
}

/* 手贴卡的"桌面"（与 index 的 push-flow__stage 同一词汇） */
.collection-detail__stage {
  flex: 1;
  min-height: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 20rpx;
}

.collection-detail__card--pinned {
  position: relative;
  transform: rotate(0.4deg);
  margin-top: 0;
}

/* 纸胶带（小程序组件样式隔离，需在本组件内自带一份） */
.collection-detail__tape {
  position: absolute;
  top: -16rpx;
  left: 50%;
  width: 128rpx;
  height: 36rpx;
  transform: translateX(-50%) rotate(-2.5deg);
  background: rgba(197, 219, 189, 0.68);
  border: 1rpx solid rgba(18, 71, 3, 0.07);
  border-radius: 2rpx;
}

.collection-detail__page-nav {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 32rpx 0 8rpx;
  margin-bottom: 4rpx;
}

.collection-detail__back-arrow {
  font-size: 32rpx;
  color: var(--c-primary);
  line-height: 1;
}

.collection-detail__back-label {
  font-size: 28rpx;
  color: var(--c-primary);
}

.collection-detail__header {
  margin-bottom: 32rpx;
  align-items: flex-start;
}

.collection-detail__type-tag {
  font-size: 22rpx;
  color: var(--c-subtle);
  letter-spacing: 0.12em;
  margin-bottom: 12rpx;
}

.collection-detail__title {
  font-size: 48rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.02em;
  margin-bottom: 16rpx;
  line-height: 1.25;
}

.collection-detail__intro {
  font-size: 26rpx;
  color: var(--c-muted);
  line-height: 1.85;
}

/* Item rows */
.collection-detail__item-row {
  display: flex;
  align-items: center;
  gap: 28rpx;
  padding: 32rpx 0;
  border-bottom: 1rpx solid var(--c-border);
}

.collection-detail__item-row:last-child {
  border-bottom: none;
}

.collection-detail__item-row--done {
  opacity: 0.7;
}

.collection-detail__item-dot {
  flex-shrink: 0;
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  border: 3rpx solid var(--c-border-s);
  background: transparent;
}

.collection-detail__item-row--done .collection-detail__item-dot {
  background: var(--c-accent);
  border-color: var(--c-accent);
}

.collection-detail__item-body {
  flex: 1;
  min-width: 0;
}

.collection-detail__item-title {
  font-size: 28rpx;
  color: var(--c-ink);
  line-height: 1.45;
  margin-bottom: 6rpx;
}

.collection-detail__item-row--done .collection-detail__item-title {
  color: var(--c-subtle);
}

.collection-detail__item-meta {
  font-size: 22rpx;
  color: var(--c-subtle);
  line-height: 1.4;
}

.collection-detail__item-arrow {
  flex-shrink: 0;
  font-size: 32rpx;
  color: var(--c-border-s);
}

.collection-detail__item-chat {
  flex-shrink: 0;
  font-size: 26rpx;
  color: var(--c-primary);
  padding: 12rpx 0 12rpx 20rpx;
}

/* Card step */
.collection-detail__card {
  width: 100%;
  padding: 44rpx 40rpx;
  border-radius: 28rpx;
  background: var(--c-card);
  border: 1rpx solid var(--c-border-s);
  box-shadow: var(--sh-card);
  margin-top: 12rpx;
  box-sizing: border-box;
  animation: rise-in 0.28s var(--ease-out) both;
}

.collection-detail__card-badge {
  display: inline-flex;
  font-size: 22rpx;
  color: var(--c-subtle);
  background: var(--c-bg);
  border: 1rpx solid var(--c-border);
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  margin-bottom: 28rpx;
}

.collection-detail__card-title {
  font-size: 40rpx;
  color: var(--c-ink);
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 16rpx;
  letter-spacing: -0.01em;
}

.collection-detail__card-condition {
  font-size: 22rpx;
  color: var(--c-subtle);
  margin-bottom: 8rpx;
}

.collection-detail__card-hr {
  height: 1rpx;
  background: var(--c-border);
  margin: 28rpx 0;
}

.collection-detail__card-instructions {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 2;
}

.collection-detail__done-btn {
  margin-top: 40rpx;
  width: 100%;
  padding: 30rpx;
  border-radius: 999rpx;
  background: var(--c-primary);
  color: #f0f5ef;
  font-size: 30rpx;
  text-align: center;
  letter-spacing: 0.02em;
  box-sizing: border-box;
  box-shadow: var(--sh-card);
  transition: transform 0.12s ease, opacity 0.12s ease;
}

/* Invite step（完成时刻：金色印记 + 邀请） */
.collection-detail__invite {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 48rpx;
  animation: rise-in 0.28s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .collection-detail__card,
  .collection-detail__invite {
    animation: fade-in 0.2s ease both;
  }
}

.collection-detail__invite-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.85;
  text-align: center;
  padding: 0 20rpx;
}

.collection-detail__actions {
  margin-top: 40rpx;
  display: flex;
  gap: 24rpx;
  justify-content: center;
}

.collection-detail__btn {
  padding: 24rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  color: var(--c-muted);
  font-size: 28rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.collection-detail__btn--primary {
  background: var(--c-primary);
  color: #f0f5ef;
  border-color: transparent;
}
</style>
