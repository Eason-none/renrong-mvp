<template>
  <view class="chat">
    <view class="chat__header">
      <view class="chat__back" hover-class="u-press" @tap="$emit('close')">‹ 返回</view>
      <view class="chat__title">聊聊</view>
    </view>

    <!-- 首次进聊天的两个气泡按顺序出：先讲"这里可以聊什么"，看完再讲照片会怎么用
         （2026-07-13 用户定稿的告知时机：聊聊引导之后、动手之前） -->
    <FirstTimeHint hint-key="chat-done" text="可以和AI聊聊过程中的感受，或想说什么都可以。" @dismiss="chatHintDone = true" />
    <FirstTimeHint
      v-if="chatHintDone"
      hint-key="chat-photo-collage"
      text="拍下的照片会原样竖着拼进这一页手记和它的分享卡片（最多三张），想先修好图再传也来得及。"
    />

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
        <image v-for="(img, j) in bubbleImages(m)" :key="j" class="chat__bubble-image" :src="img" mode="widthFix"></image>
        <text v-if="m.content" user-select selectable class="chat__bubble-text">{{ m.content }}</text>
      </view>

      <view v-if="sending && !streamingText" class="chat__bubble chat__bubble--assistant">
        <text class="chat__thinking-dots">···</text>
        <!-- 长等待补充语：小程序端无流式，前几轮长回答只有三个点撑十几秒（内测反馈：
             不知道要等多久）。3s 淡入首条、每 5s 轮换一条，回复一到即撤。
             :key 让换文案时节点重建，fade-in 每条都重新播一次。 -->
        <view v-if="waitingHint" :key="waitingHint" class="chat__waiting-hint">{{ waitingHint }}</view>
      </view>

      <view v-if="streamingText" class="chat__bubble chat__bubble--assistant">
        <text user-select selectable class="chat__bubble-text">{{ streamingText }}</text>
      </view>

      <view v-if="errorText" class="chat__error">{{ errorText }}</view>
      <view id="chat-bottom-anchor"></view>
    </scroll-view>

    <view v-if="pendingImages.length || compressingCount > 0" class="chat__pending-image">
      <view v-for="(p, i) in pendingImages" :key="i" class="chat__pending-image-item">
        <image :src="p.thumb" mode="aspectFill" class="chat__pending-image-preview"></image>
        <view class="chat__pending-image-remove" hover-class="u-press" @tap="removePendingImage(i)">✕</view>
      </view>
      <view v-if="compressingCount > 0" class="chat__pending-image-loading">…</view>
    </view>

    <view
      v-if="finishing"
      class="chat__closing-overlay"
      :class="{ 'chat__closing-overlay--leaving': closingLeaving }"
    >
      <view class="chat__closing-seal">
        <view class="seal-leaf"></view>
      </view>
      <text class="chat__closing-text">祝你内心轻盈，祝你生活丰盈</text>
    </view>

    <view class="chat__input-row">
      <view class="chat__image-btn" hover-class="u-press" @tap="chooseImage">📷</view>
      <input
        class="chat__input"
        v-model="inputText"
        placeholder="说说看，不说也可以"
        :disabled="sending || finishing"
      />
      <view class="chat__send-btn" hover-class="u-press" @tap="send">发送</view>
      <view class="chat__done-btn" hover-class="u-press" @tap="done">说完了</view>
    </view>
  </view>
</template>

<script>
import { addUserMessage, addAssistantMessage, archiveConversation, getConversation, getMessageImages } from '@/state/conversation.js'
import { buildMainChatSystemPrompt, toApiMessages, streamMainChat } from '@/api/qwen.js'
import { generateSummaryText } from '@/api/deepseek.js'
import { compressImageFile } from '@/utils/imageCompress.js'
import FirstTimeHint from '@/components/FirstTimeHint.vue'
import { hasSeenHint } from '@/state/onboardingHints.js'

// 一条消息最多带几张图：与 uni.chooseImage 单次选择上限一致（微信端上限 9）
const MAX_IMAGES = 9

// 等待文案池：3s 淡入第一条，此后每 5s 轮换一条直到回复到达。
// 语气是"它在想"的轻语气，不是"请稍候"的系统语气（§十：不制造焦虑）。
const WAITING_HINTS = [
  '在想怎么回你，稍等它一下',
  '你说的它都收到了，在慢慢想',
  '还在组织语言，不急',
  '在回味你刚说的那句',
  '想认真回你，就是慢了点',
]

export default {
  name: 'ChatView',
  components: { FirstTimeHint },
  props: {
    conversationId: { type: String, required: true },
    contentTitle: { type: String, required: true },
    instructions: { type: String, required: true },
    previousSummary: { type: String, default: null },
    // 三件幸福小事等非"见证一件丰容小事"框架的对话用这两个覆盖默认的开场白/system prompt
    // （见 threeGoodThings.js + qwen.js buildThreeGoodThingsSystemPrompt）。
    openingTextOverride: { type: String, default: null },
    systemPromptOverride: { type: String, default: null },
  },
  emits: ['close'],
  data() {
    return {
      // 照片说明气泡的接力开关：聊天引导气泡（chat-done）看完才轮到它；
      // 老用户 chat-done 早已读过，进来直接轮到照片说明
      chatHintDone: hasSeenHint('chat-done'),
      messages: [],
      inputText: '',
      // 待发送图片（一次可选多张，上限 MAX_IMAGES）：thumb=压缩缩略图（预览+落库），
      // original=原图（只用于当次模型调用，从不落库）
      pendingImages: [],
      compressingCount: 0,
      streamingText: '',
      sending: false,
      waitingHint: '', // 长等待补充语（8s/20s 两级），回复到达/失败即清
      errorText: '',
      bottomAnchor: 'chat-bottom-anchor',
      finishing: false,
      closingLeaving: false,
    }
  },
  created() {
    const conversation = getConversation(this.conversationId)
    this.messages = conversation ? conversation.messages : []
    this.waitTimers = [] // 原生定时器 id，不进响应式
  },
  beforeUnmount() {
    this.clearWaitingHints()
  },
  computed: {
    // 本地模板开场邀请：回指具体条目（让用户想起刚做的是什么）+ 一个问具体细节的话头
    // （diary-conversation：问细节而非问感受——细节才是未来能唤起记忆的钩子）。不调API、永远可用。
    openingText() {
      if (this.openingTextOverride) return this.openingTextOverride
      return `你刚才「${this.contentTitle}」——有没有什么瞬间、颜色、声音，或者哪个细节，让你多看了一眼？想到什么都可以聊聊。`
    },
  },
  methods: {
    // 气泡里的图片列表：新消息是 images 数组，旧数据是单图 image 字段，统一归一
    bubbleImages(m) {
      return getMessageImages(m)
    },
    // 等待补充语：3s 首条起（快回复不闪现），之后每 5s 轮换池内下一条，回复到达即撤
    startWaitingHints() {
      this.clearWaitingHints()
      let i = 0
      this.waitTimers.push(setTimeout(() => {
        this.waitingHint = WAITING_HINTS[0]
        this.waitTimers.push(setInterval(() => {
          i = (i + 1) % WAITING_HINTS.length
          this.waitingHint = WAITING_HINTS[i]
        }, 5000))
      }, 3000))
    },
    clearWaitingHints() {
      // 池里混着 timeout 和 interval 的 id，两个 clear 都过一遍（对不匹配的 id 无害）
      this.waitTimers.forEach((id) => {
        clearTimeout(id)
        clearInterval(id)
      })
      this.waitTimers = []
      this.waitingHint = ''
    },
    // 读原图（喂模型用）：H5 的 tempFilePath 是 blob: URL，且 H5 没有
    // getFileSystemManager（小程序专属 API，H5 上调用会直接抛错），
    // 所以和 imageCompress.js 一样按端分支。读不到原图不算失败（发送时退化用缩略图）。
    readOriginal(path) {
      // #ifdef H5
      return fetch(path)
        .then((r) => r.blob())
        .then(
          (blob) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result)
              reader.onerror = () => reject(new Error('FileReader 读取失败'))
              reader.readAsDataURL(blob)
            })
        )
        .catch((err) => {
          console.error('读取原图失败:', err)
          return null
        })
      // #endif
      // #ifndef H5
      return new Promise((resolve) => {
        uni.getFileSystemManager().readFile({
          filePath: path,
          encoding: 'base64',
          success: (fileRes) => resolve(`data:image/png;base64,${fileRes.data}`),
          fail: (err) => {
            console.error('读取原图失败:', err)
            resolve(null)
          },
        })
      })
      // #endif
    },
    chooseImage() {
      const remain = MAX_IMAGES - this.pendingImages.length
      if (remain <= 0 || this.compressingCount > 0) return
      uni.chooseImage({
        count: remain,
        success: (res) => {
          for (const path of res.tempFilePaths.slice(0, remain)) {
            this.compressingCount++
            Promise.all([compressImageFile(path), this.readOriginal(path)])
              .then(([thumb, original]) => {
                if (this.pendingImages.length < MAX_IMAGES) {
                  this.pendingImages.push({ thumb, original: original ?? thumb })
                }
              })
              .catch((err) => {
                // 压缩失败静默裁掉这张图（diary-trace 1.3：丢照片不丢功能）——原图即使读到了
                // 也一并丢弃，避免"模型看见了但用户自己的聊天记录里从没出现过"这种不一致
                console.error('compressImage failed:', err)
              })
              .finally(() => {
                this.compressingCount--
              })
          }
        },
      })
    },
    removePendingImage(index) {
      this.pendingImages.splice(index, 1)
    },
    async send() {
      const content = this.inputText.trim()
      const pending = this.pendingImages
      const thumbImages = pending.map((p) => p.thumb) // 落库、展示用
      const apiImages = pending.map((p) => p.original) // 喂模型用：原图（读原图失败的已在入队时退化为缩略图）
      if (!content && !thumbImages.length) return
      if (this.finishing || this.sending || this.compressingCount > 0) return

      this.errorText = ''
      this.sending = true
      this.startWaitingHints()

      // 乐观展示这条消息，但先不落库：发送成功后再一并提交「用户消息 + 助手回复」；
      // 任何一步失败就回滚这条乐观消息、并把内容/图片还回输入框，用户可原样再发一次——
      // 既不会丢字，也不会因为提前入库而在重发时重复插入同一条消息。
      const baseMessages = this.messages
      this.messages = [...baseMessages, { role: 'user', content, images: thumbImages }]
      this.inputText = ''
      this.pendingImages = []

      try {
        const systemPrompt = this.systemPromptOverride ?? buildMainChatSystemPrompt({
          contentTitle: this.contentTitle,
          instructions: this.instructions,
          previousSummary: this.previousSummary,
        })
        // 历史消息沿用它们落库时的缩略图（对模型来说只是补充上下文，够用）；
        // 只有这条刚发的消息用原图喂模型，避免模型看不清刚拍的这几张。
        const history = toApiMessages([...baseMessages, { role: 'user', content, images: apiImages }])

        this.streamingText = ''
        const fullText = await streamMainChat({ systemPrompt, history }, (delta) => {
          // 首字到达即撤等待语（H5 流式）；mp 端一次性回调，效果等同"完整回复到达即撤"
          this.clearWaitingHints()
          this.streamingText += delta
        })

        // 成功后才真正落库：先提交用户消息（缩略图），再提交助手回复
        addUserMessage(this.conversationId, content, thumbImages)
        const updated = addAssistantMessage(this.conversationId, fullText)
        this.messages = updated.messages
        this.streamingText = ''
      } catch (err) {
        // 回滚 + 把输入还给用户
        this.messages = baseMessages
        this.inputText = content
        this.pendingImages = pending
        this.streamingText = ''
        // 技术细节只进console；给用户看的必须是温婉语气（§十：不制造焦虑），不带原始报错字样
        console.error('streamMainChat failed:', err)
        this.errorText = '刚才这句好像没送出去，你的话都还在，缓一缓再发一次就好'
      } finally {
        this.clearWaitingHints()
        this.sending = false
      }
    },
    // 用户主动结束对话：显示收尾文案，所有层统一触发归档生成日记页（diary-trace：
    // 聊聊=代笔日记，不再按layer区分——旧的"推送层不留痕"语义已随本变更翻转）。
    // 归档失败时静默继续关闭——归档是后台数据操作，不阻断用户离开。
    async done() {
      if (this.finishing) return
      this.finishing = true
      // 收尾文案至少停留1.2s（归档可能很快返回，不设下限会一闪而过），
      // 之后渐淡0.6s再关闭——离开的节奏和这句话的语气一致，不能"啪"地消失。
      const minDisplay = new Promise((r) => setTimeout(r, 1200))
      try {
        await archiveConversation(this.conversationId, (conversation) =>
          generateSummaryText({ contentTitle: this.contentTitle, instructions: this.instructions, conversation })
        )
      } catch (err) {
        console.error('archiveConversation failed:', err)
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

/* 返回标：字大一号 + 内边距撑出热区（内测反馈：返回标偏小），下同各返回/回去标 */
.chat__back {
  margin-right: 20rpx;
  color: var(--c-primary);
  font-size: 30rpx;
  padding: 12rpx 24rpx 12rpx 4rpx;
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
  padding: 20rpx 28rpx;
  margin-bottom: 16rpx;
  border-radius: 24rpx;
  font-size: 28rpx;
  line-height: 1.6;
  animation: rise-in 0.24s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .chat__bubble {
    animation: fade-in 0.15s ease both;
  }
}

/* 小圆角指向说话的一侧，气泡有了朝向 */
.chat__bubble--user {
  margin-left: auto;
  background: var(--c-primary-soft);
  color: var(--c-ink);
  border-bottom-right-radius: 8rpx;
}

.chat__bubble--assistant {
  margin-right: auto;
  background: var(--c-card);
  border: 1rpx solid var(--c-border);
  color: var(--c-ink);
  border-bottom-left-radius: 8rpx;
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

@media (prefers-reduced-motion: reduce) {
  .chat__thinking-dots {
    animation: none;
    opacity: 0.6;
  }
}

.chat__waiting-hint {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: var(--c-subtle);
  animation: fade-in 0.5s ease both;
}

.chat__error {
  color: var(--c-accent-ink);
  font-size: 24rpx;
  padding: 12rpx 0;
}

.chat__pending-image {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 8rpx 20rpx;
}

.chat__pending-image-item {
  position: relative;
}

.chat__pending-image-preview {
  width: 100rpx;
  height: 100rpx;
  border-radius: 8rpx;
  display: block;
}

.chat__pending-image-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(8, 16, 6, 0.6);
  color: #f0f5ef;
  font-size: 20rpx;
}

.chat__pending-image-loading {
  color: var(--c-subtle);
  font-size: 28rpx;
  padding: 0 8rpx;
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
  background: rgba(243, 247, 240, 0.94);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

/* 这段对话"凝成一页落进册子"：叶形标记先落定再显文案，与整个收尾窗口（1.2s显示+0.6s渐出）同步——
   完成一拍/completion-beat 的落册视觉语汇在这里以"归档"的身份再出现一次 */
.chat__closing-seal {
  margin-bottom: 20rpx;
  opacity: 0;
  transform: scale(1.3) translateY(-12rpx);
  animation: page-settle 1.2s var(--ease-out) both;
}

/* 压花叶印记：对称叶轮廓 + 贯穿顶尖到叶柄的中轴（叶脉与叶柄同一条线）+ 左右各两条镜像错落侧脉。
   贝塞尔叶形无法用 border 精确画，故用 SVG 走 CSS background-image——mp-weixin 的 <image> 不渲染
   SVG，但 background-image 的 base64 SVG 双端可渲染；描边色烧死为 --c-accent 的取值 #cd9130。
   viewBox 40×100（比例 0.4）；小程序组件样式隔离，需各组件自带一份（CompletionBeat 同款）。 */
.seal-leaf {
  width: 30rpx;
  height: 75rpx;
  background-image: url("data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNDAgMTAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCwxMCBDMzUsMjUgMzUsNjIuNSAyMCw3MCBDNSw2Mi41IDUsMjUgMjAsMTAgWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2Q5MTMwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxsaW5lIHgxPSIyMCIgeTE9IjEwIiB4Mj0iMjAiIHkyPSI4NSIgc3Ryb2tlPSIjY2Q5MTMwIiBzdHJva2Utd2lkdGg9IjEuMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGcgc3Ryb2tlPSIjY2Q5MTMwIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PGxpbmUgeDE9IjIwIiB5MT0iMzAuNiIgeDI9IjI2LjQiIHkyPSIxOSIvPjxsaW5lIHgxPSIyMCIgeTE9IjQzLjgiIHgyPSIxMC42IiB5Mj0iMjYuOSIvPjxsaW5lIHgxPSIyMCIgeTE9IjQ5LjQiIHgyPSIzMC41IiB5Mj0iMzEiLz48bGluZSB4MT0iMjAiIHkxPSI2MC42IiB4Mj0iOC44IiB5Mj0iNDAuOCIvPjwvZz48L3N2Zz4=");
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

@keyframes page-settle {
  0%   { opacity: 0; transform: scale(1.3) translateY(-12rpx); }
  40%  { opacity: 1; transform: scale(0.94) translateY(2rpx); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .chat__closing-seal {
    animation: fade-in 0.3s ease both;
  }
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
  padding: 20rpx 20rpx 32rpx;
  border-top: 1rpx solid var(--c-border);
  /* 键盘弹起顶页时，底部这段留白就是输入行与键盘的分离带——内测截图里输入行底边
     贴死键盘顶（零间距），"对齐或分离"里选分离。全面屏底部再叠加安全区。 */
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.chat__image-btn {
  margin-right: 16rpx;
  font-size: 32rpx;
}

.chat__input {
  flex: 1;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  border-radius: 999rpx;
  padding: 16rpx 28rpx;
  margin-right: 16rpx;
  color: var(--c-ink);
}

.chat__send-btn {
  padding: 16rpx 30rpx;
  border-radius: 999rpx;
  background: var(--c-primary);
  color: #f0f5ef;
  margin-right: 16rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.chat__done-btn {
  font-size: 26rpx;
  color: var(--c-muted);
  white-space: nowrap;
  padding: 16rpx 0;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
</style>
