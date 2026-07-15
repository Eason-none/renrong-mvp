<template>
  <view v-if="step !== 'chat'" class="push-flow" :class="step === 'detail' ? 'push-flow--fill' : 'push-flow--center'">
    <!-- 详情卡片（与即时小事同款手贴卡：胶带+微旋+居中，操作沉到拇指区） -->
    <template v-if="step === 'detail'">
      <view class="push-flow__stage">
        <view class="push-flow__cardwrap">
          <view class="push-flow__card push-flow__card--pinned">
            <view class="push-flow__card-title">{{ task.title }}</view>
            <view class="push-flow__card-time">{{ task.time }}</view>
            <view class="push-flow__card-instructions">{{ task.instructions }}</view>
          </view>
          <view class="push-flow__tape"></view>
        </view>
      </view>
      <view class="push-flow__done-btn" hover-class="u-press" @tap="markDone">做完啦</view>
      <view class="push-flow__back-link" hover-class="u-press" @tap="close">← 返回</view>
      <view class="push-flow__remove-link" hover-class="u-press" @tap="removeTask">不想做了，移除</view>
    </template>

    <!-- 完成一拍先接住，再邀请聊聊（completion-beat：不是下一步任务，是对刚发生的事的确认） -->
    <template v-else>
      <CompletionBeat v-if="!beatDone" @done="beatDone = true" />
      <template v-else>
        <!-- 首次遇到聊聊/跳过时把"记录的回报"讲清楚（2026-07-12 用户决策：信息前置且因果明确，
             不模糊；FirstTimeHint 全生命周期只出现一次，与"入口不主动弹出"红线不冲突） -->
        <FirstTimeHint
          hint-key="chat-invite"
          text="这里聊到的话、拍下的照片，都会留进你的手记。说得越具体、带上照片，之后的回忆和图鉴回顾就越详实。跳过也没关系，之后点开这件完成的小事还能补聊。"
        />
        <view class="ritual-seal">✦</view>
        <view class="push-flow__invite-text">{{ inviteText }}</view>
        <view class="push-flow__actions">
          <view class="push-flow__btn push-flow__btn--primary" hover-class="u-press" @tap="startChat">聊聊</view>
          <view class="push-flow__btn" hover-class="u-press" @tap="close">跳过</view>
        </view>
      </template>
    </template>
  </view>

  <ChatView
    v-else
    :conversation-id="conversationId"
    :content-title="task.title"
    :instructions="task.instructions"
    :previous-summary="null"
    @close="close"
  />
</template>

<script>
// 每日任务完成流程（detail → invite → chat），兼任已完成条目的补聊入口（entry='chat'）。
// 原内联在 index.vue（god component 拆分，2026-07-12）；状态机与数据层调用整体搬入，
// 页面只负责挂载/卸载与收尾（归档、刷新列表与手记入口）。
import ChatView from '@/components/ChatView.vue'
import CompletionBeat from '@/components/CompletionBeat.vue'
import FirstTimeHint from '@/components/FirstTimeHint.vue'
import { completeTask, saveCompletedTask } from '@/state/dailyTaskPool.js'
import { createCompletionEvent, COMPLETION_INVITE_TEXT } from '@/state/completionEvent.js'
import { createConversation, getConversationByCompletionEventId } from '@/state/conversation.js'

export default {
  name: 'DailyTaskFlow',
  components: { ChatView, CompletionBeat, FirstTimeHint },
  // mp-weixin：去掉组件包裹节点，让 .push-flow--fill/--center 的 flex:1 直接相对页面容器生效
  options: { virtualHost: true },
  props: {
    task: { type: Object, required: true },
    // 补聊场景传入既有完成事件id（不新建完成事件）；正常流程为 null，做完啦时创建
    initialCompletionEventId: { type: String, default: null },
    // 'detail' = 从已领取列表进入完整流程；'chat' = 已完成条目补聊，直接进对话
    entry: { type: String, default: 'detail' },
  },
  emits: ['completed', 'close'],
  data() {
    return {
      step: this.entry === 'chat' ? 'chat' : 'detail',
      completionEventId: this.initialCompletionEventId,
      conversationId: null,
      beatDone: false,
      inviteText: COMPLETION_INVITE_TEXT,
    }
  },
  created() {
    // 补聊直入对话：渲染前先把会话备好（续用已有对话，同 startChat）
    if (this.step === 'chat') {
      this.resolveConversation()
    }
  },
  methods: {
    markDone() {
      completeTask(this.task.id)
      const event = createCompletionEvent({
        contentId: this.task.id,
        contentType: 'daily_task',
        collectionId: null,
      })
      this.completionEventId = event.id
      saveCompletedTask(this.task, event.id)
      this.$emit('completed')
      this.beatDone = false
      this.step = 'invite'
    },
    removeTask() {
      completeTask(this.task.id)
      this.$emit('completed')
      this.close()
    },
    resolveConversation() {
      // 续用已有对话（比如上次"‹ 返回"退出、还没归档）而不是每次都新建——
      // 同一个 completionEventId 只能绑定一个 Conversation，重复 createConversation 会抛错。
      const existing = getConversationByCompletionEventId(this.completionEventId)
      const conv = existing ?? createConversation(this.completionEventId)
      this.conversationId = conv.id
    },
    startChat() {
      this.resolveConversation()
      this.step = 'chat'
    },
    // 退出（返回/跳过/移除/聊天关闭都走这里）：把归档所需上下文交给页面，收尾由页面负责
    close() {
      this.$emit('close', {
        conversationId: this.conversationId,
        title: this.task?.title ?? '',
        instructions: this.task?.instructions ?? '',
      })
    },
  },
}
</script>

<style>
@import '../styles/push-flow.css';
</style>
