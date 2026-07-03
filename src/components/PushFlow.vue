<template>
  <view class="push-flow">
    <template v-if="step === 'scene'">
      <view class="push-flow__title">让我们做点什么有意思的小事</view>
      <view class="push-flow__subtitle">根据你现在的条件选一个</view>
      <view
        v-for="opt in sceneOptions"
        :key="opt.key"
        class="push-flow__scene-btn"
        @tap="chooseScene(opt.key)"
      >
        <view class="push-flow__scene-label">
          <text class="push-flow__scene-name">{{ opt.label }}</text>
          <text class="push-flow__scene-desc">{{ opt.desc }}</text>
        </view>
        <text class="push-flow__scene-arrow">›</text>
      </view>
    </template>

    <template v-else-if="step === 'card'">
      <view v-if="session.item" class="push-flow__card">
        <view class="push-flow__card-title">{{ session.item.title }}</view>
        <view class="push-flow__card-time">{{ session.item.time }}</view>
        <view class="push-flow__card-instructions">{{ session.item.instructions }}</view>
      </view>
      <view v-else class="push-flow__card-empty">这个场景暂时没有内容了</view>

      <view class="push-flow__hint" v-if="session.exhausted">换满3次啦，做歪了也算数，这次就这个吧</view>

      <view class="push-flow__actions">
        <view
          class="push-flow__btn"
          :class="{ 'push-flow__btn--disabled': session.exhausted }"
          @tap="refresh"
        >
          换一个
        </view>
        <view class="push-flow__btn" @tap="backToScene">换个场景</view>
      </view>

      <view v-if="session.item" class="push-flow__done-btn" @tap="markDone">做完啦</view>
    </template>

    <template v-else-if="step === 'invite'">
      <view class="push-flow__invite-text">{{ inviteText }}</view>
      <view class="push-flow__actions">
        <view class="push-flow__btn push-flow__btn--primary" @tap="startChat">聊聊</view>
        <view class="push-flow__btn" @tap="backToScene">跳过</view>
      </view>
    </template>

    <ChatView
      v-else-if="step === 'chat'"
      :conversation-id="conversationId"
      :content-title="session.item.title"
      :instructions="session.item.instructions"
      :previous-summary="previousSummary"
      @close="backToScene"
    />
  </view>
</template>

<script>
import { createPushSession, refreshPushSession } from '@/state/pushPool.js'
import { createCompletionEvent, COMPLETION_INVITE_TEXT } from '@/state/completionEvent.js'
import { createConversation, getLatestSummaryForContent } from '@/state/conversation.js'
import ChatView from '@/components/ChatView.vue'

const SCENE_OPTIONS = [
  { key: '室内短', label: '室内 · 5 分钟内', desc: '待在原地，随时可以开始' },
  { key: '室内久', label: '室内 · 可以久一点', desc: '不赶时间，可以慢慢来' },
  { key: '室外', label: '室外 · 可以走动', desc: '在外面，可以活动' },
]

export default {
  name: 'PushFlow',
  components: { ChatView },
  data() {
    return {
      sceneOptions: SCENE_OPTIONS,
      step: 'scene',
      session: null,
      inviteText: COMPLETION_INVITE_TEXT,
      completionEventId: null,
      conversationId: null,
      previousSummary: null,
    }
  },
  methods: {
    chooseScene(scene) {
      this.session = createPushSession(scene)
      this.step = 'card'
    },
    refresh() {
      if (this.session.exhausted) return
      this.session = refreshPushSession(this.session)
    },
    markDone() {
      // previous_summary要在创建本次CompletionEvent之前取——否则查到的会是"本次"而不是"上次"。
      this.previousSummary = getLatestSummaryForContent(this.session.item.id)?.summary_text ?? null
      this.completionEventId = createCompletionEvent({ contentId: this.session.item.id, contentType: 'push' }).id
      this.step = 'invite'
    },
    startChat() {
      this.conversationId = createConversation(this.completionEventId).id
      this.step = 'chat'
    },
    backToScene() {
      this.step = 'scene'
      this.session = null
      this.conversationId = null
      this.previousSummary = null
    },
  },
}
</script>

<style>
.push-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 60rpx;
  width: 100%;
  box-sizing: border-box;
}

.push-flow__title {
  font-size: 34rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
  text-align: center;
  margin-bottom: 12rpx;
}

.push-flow__subtitle {
  font-size: 26rpx;
  color: var(--c-subtle);
  text-align: center;
  margin-bottom: 40rpx;
}

.push-flow__scene-btn {
  width: 100%;
  padding: 32rpx 36rpx;
  margin-bottom: 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--c-bg);
  border: 1rpx solid var(--c-border);
  border-radius: 36rpx;
  box-shadow: var(--sh-card);
}

.push-flow__scene-label {
  display: flex;
  flex-direction: column;
}

.push-flow__scene-name {
  font-size: 30rpx;
  color: var(--c-ink);
  line-height: 1.4;
}

.push-flow__scene-desc {
  font-size: 24rpx;
  color: var(--c-subtle);
  margin-top: 6rpx;
}

.push-flow__scene-arrow {
  font-size: 40rpx;
  color: var(--c-subtle);
  line-height: 1;
}

.push-flow__card {
  width: 100%;
  padding: 40rpx;
  border-radius: 44rpx;
  background: var(--c-surface);
  border: 1rpx solid var(--c-border);
  box-shadow: var(--sh-card);
}

.push-flow__card-title {
  font-size: 34rpx;
  color: var(--c-ink);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.01em;
  margin-bottom: 12rpx;
}

.push-flow__card-time {
  font-size: 24rpx;
  color: var(--c-subtle);
  margin-bottom: 28rpx;
}

.push-flow__card-instructions {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 2;
}

.push-flow__card-empty {
  font-size: 28rpx;
  color: var(--c-subtle);
  padding: 60rpx 0;
}

.push-flow__hint {
  margin-top: 20rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
}

.push-flow__actions {
  margin-top: 40rpx;
  display: flex;
  gap: 24rpx;
}

.push-flow__btn {
  padding: 22rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border);
  color: var(--c-muted);
  font-size: 28rpx;
}

.push-flow__btn--disabled {
  opacity: 0.4;
}

.push-flow__btn--primary {
  background: var(--c-primary-soft);
  color: var(--c-primary);
  border-color: transparent;
}

.push-flow__done-btn {
  margin-top: 40rpx;
  padding: 30rpx 60rpx;
  border-radius: 999rpx;
  background: var(--c-ink);
  color: #fff;
  font-size: 30rpx;
  letter-spacing: 0.02em;
}

.push-flow__invite-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.85;
  text-align: center;
  padding: 0 20rpx;
}
</style>
