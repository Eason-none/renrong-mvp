<template>
  <view class="chat">
    <view class="chat__header">
      <view class="chat__back" @tap="$emit('close')">‹ 返回</view>
      <view class="chat__title">聊聊</view>
    </view>

    <scroll-view class="chat__messages" scroll-y scroll-with-animation :scroll-into-view="bottomAnchor">
      <!-- 开场邀请：本地模板、纯UI展示（不入库、不进历史、不参与摘要），提醒用户刚做的是哪条并给出话头 -->
      <view class="chat__bubble chat__bubble--assistant">
        <text user-select selectable class="chat__bubble-text">{{ openingText }}</text>
      </view>

      <view
        v-for="(m, i) in messages"
        :key="i"
        class="chat__bubble"
        :class="m.role === 'user' ? 'chat__bubble--user' : 'chat__bubble--assistant'"
      >
        <image v-if="m.image" class="chat__bubble-image" :src="m.image" mode="widthFix"></image>
        <text v-if="m.content" user-select selectable class="chat__bubble-text">{{ m.content }}</text>
      </view>

      <view v-if="sending && !streamingText" class="chat__bubble chat__bubble--assistant">
        <text class="chat__thinking-dots">···</text>
      </view>

      <view v-if="streamingText" class="chat__bubble chat__bubble--assistant">
        <text user-select selectable class="chat__bubble-text">{{ streamingText }}</text>
      </view>

      <view v-if="errorText" class="chat__error">{{ errorText }}</view>
      <view id="chat-bottom-anchor"></view>
    </scroll-view>

    <view v-if="pendingImage" class="chat__pending-image">
      <image :src="pendingImage" mode="aspectFit" class="chat__pending-image-preview"></image>
      <view class="chat__pending-image-remove" @tap="pendingImage = null">移除图片</view>
    </view>

    <view
      v-if="finishing"
      class="chat__closing-overlay"
      :class="{ 'chat__closing-overlay--leaving': closingLeaving }"
    >
      <text class="chat__closing-text">这次说的，都在了</text>
    </view>

    <view class="chat__input-row">
      <view class="chat__image-btn" @tap="chooseImage">📷</view>
      <input
        class="chat__input"
        v-model="inputText"
        placeholder="说说看，不说也可以"
        :disabled="sending || finishing"
      />
      <view class="chat__send-btn" @tap="send">发送</view>
      <view class="chat__done-btn" @tap="done">说完了</view>
    </view>
  </view>
</template>

<script>
import { addUserMessage, addAssistantMessage, archiveConversation, getConversation } from '@/state/conversation.js'
import { buildMainChatSystemPrompt, toApiMessages, streamMainChat } from '@/api/qwen.js'
import { generateSummaryText } from '@/api/deepseek.js'

export default {
  name: 'ChatView',
  props: {
    conversationId: { type: String, required: true },
    contentTitle: { type: String, required: true },
    instructions: { type: String, required: true },
    previousSummary: { type: String, default: null },
    layer: { type: String, default: 'push' }, // 'collection' | 'push'
  },
  emits: ['close'],
  data() {
    return {
      messages: [],
      inputText: '',
      pendingImage: null,
      streamingText: '',
      sending: false,
      errorText: '',
      bottomAnchor: 'chat-bottom-anchor',
      finishing: false,
      closingLeaving: false,
    }
  },
  created() {
    const conversation = getConversation(this.conversationId)
    this.messages = conversation ? conversation.messages : []
  },
  computed: {
    // 本地模板开场邀请：回指具体条目（让用户想起刚做的是什么）+ 一个开放的话头。不调API、永远可用。
    openingText() {
      return `你刚才「${this.contentTitle}」，这件事给你带来了什么感受吗？想到什么都可以聊聊。`
    },
  },
  methods: {
    chooseImage() {
      uni.chooseImage({
        count: 1,
        success: (res) => {
          const path = res.tempFilePaths[0]
          uni.getFileSystemManager().readFile({
            filePath: path,
            encoding: 'base64',
            success: (fileRes) => {
              this.pendingImage = `data:image/png;base64,${fileRes.data}`
            },
          })
        },
      })
    },
    async send() {
      const content = this.inputText.trim()
      const image = this.pendingImage
      if (!content && !image) return
      if (this.finishing || this.sending) return

      this.errorText = ''
      this.sending = true

      // 乐观展示这条消息，但先不落库：发送成功后再一并提交「用户消息 + 助手回复」；
      // 任何一步失败就回滚这条乐观消息、并把内容/图片还回输入框，用户可原样再发一次——
      // 既不会丢字，也不会因为提前入库而在重发时重复插入同一条消息。
      const baseMessages = this.messages
      this.messages = [...baseMessages, { role: 'user', content, image: image ?? null }]
      this.inputText = ''
      this.pendingImage = null

      try {
        const systemPrompt = buildMainChatSystemPrompt({
          contentTitle: this.contentTitle,
          instructions: this.instructions,
          previousSummary: this.previousSummary,
        })
        const history = toApiMessages(this.messages)

        this.streamingText = ''
        const fullText = await streamMainChat({ systemPrompt, history }, (delta) => {
          this.streamingText += delta
        })

        // 成功后才真正落库：先提交用户消息，再提交助手回复
        addUserMessage(this.conversationId, content, image)
        const updated = addAssistantMessage(this.conversationId, fullText)
        this.messages = updated.messages
        this.streamingText = ''
      } catch (err) {
        // 回滚 + 把输入还给用户
        this.messages = baseMessages
        this.inputText = content
        this.pendingImage = image
        this.streamingText = ''
        // 技术细节只进console；给用户看的必须是温婉语气（§十：不制造焦虑），不带原始报错字样
        console.error('streamMainChat failed:', err)
        this.errorText = '刚才这句好像没送出去，你的话都还在，缓一缓再发一次就好'
      } finally {
        this.sending = false
      }
    },
    // 用户主动结束对话：显示收尾文案，图鉴层触发归档，推送层直接关闭。
    // 归档失败时静默继续关闭——归档是后台数据操作，不阻断用户离开。
    async done() {
      if (this.finishing) return
      this.finishing = true
      // 收尾文案至少停留1.2s（图鉴层归档可能很快返回，不设下限会一闪而过），
      // 之后渐淡0.6s再关闭——离开的节奏和这句话的语气一致，不能"啪"地消失。
      const minDisplay = new Promise((r) => setTimeout(r, 1200))
      if (this.layer === 'collection') {
        try {
          await archiveConversation(this.conversationId, (conversation) =>
            generateSummaryText({ contentTitle: this.contentTitle, instructions: this.instructions, conversation })
          )
        } catch (err) {
          console.error('archiveConversation failed:', err)
        }
      }
      await minDisplay
      this.closingLeaving = true
      await new Promise((r) => setTimeout(r, 600))
      this.$emit('close')
    },
  },
}
</script>

<style>
.chat {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  position: relative;
}

.chat__header {
  display: flex;
  align-items: center;
  padding: 20rpx;
}

.chat__back {
  margin-right: 20rpx;
  color: var(--c-primary);
}

.chat__title {
  font-size: 28rpx;
  color: var(--c-ink);
}

.chat__messages {
  height: 800rpx;
  padding: 0 20rpx;
}

.chat__bubble {
  max-width: 80%;
  padding: 16rpx 24rpx;
  margin-bottom: 16rpx;
  border-radius: 16rpx;
  font-size: 28rpx;
  line-height: 1.5;
}

.chat__bubble--user {
  margin-left: auto;
  background: var(--c-primary-soft);
  color: var(--c-ink);
}

.chat__bubble--assistant {
  margin-right: auto;
  background: var(--c-surface);
  color: var(--c-ink);
}

.chat__bubble-image {
  width: 200rpx;
  margin-bottom: 8rpx;
}

/* H5 端兜底：mp-weixin 靠 <text user-select> 属性长按选中，H5 需要这条 CSS */
.chat__bubble-text {
  user-select: text;
  -webkit-user-select: text;
}

.chat__thinking-dots {
  letter-spacing: 4rpx;
  color: var(--c-subtle);
  animation: thinking-pulse 1.4s ease-in-out infinite;
}

@keyframes thinking-pulse {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

.chat__error {
  color: var(--c-accent);
  font-size: 24rpx;
  padding: 12rpx 0;
}

.chat__pending-image {
  display: flex;
  align-items: center;
  padding: 0 20rpx;
}

.chat__pending-image-preview {
  width: 100rpx;
  height: 100rpx;
  margin-right: 16rpx;
}

.chat__pending-image-remove {
  color: var(--c-subtle);
  font-size: 24rpx;
}

.chat__closing-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 1;
  transition: opacity 0.6s ease;
  animation: chat-closing-in 0.45s ease;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.chat__closing-text {
  font-size: 32rpx;
  color: var(--c-ink);
  letter-spacing: 2rpx;
}

.chat__closing-overlay--leaving {
  opacity: 0;
}

@keyframes chat-closing-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.chat__input-row {
  display: flex;
  align-items: center;
  padding: 20rpx;
  border-top: 1rpx solid var(--c-border);
}

.chat__image-btn {
  margin-right: 16rpx;
  font-size: 32rpx;
}

.chat__input {
  flex: 1;
  border: 1rpx solid var(--c-border);
  border-radius: 999rpx;
  padding: 12rpx 24rpx;
  margin-right: 16rpx;
  color: var(--c-ink);
}

.chat__send-btn {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: var(--c-primary-soft);
  color: var(--c-primary);
  margin-right: 16rpx;
}

.chat__done-btn {
  font-size: 24rpx;
  color: var(--c-subtle);
  white-space: nowrap;
}
</style>
