<template>
  <!-- 卡片/邀请两步共用一个根节点（virtualHost 让它在 mp 端直接作为 .page 的 flex 子项，
       与原先内联在页面里的布局行为一致）；聊天步是全屏 ChatView -->
  <view v-if="step !== 'chat'" class="push-flow" :class="step === 'card' ? 'push-flow--fill' : 'push-flow--center'">
    <template v-if="step === 'card'">
      <view class="push-flow__stage">
        <!-- 胶带与卡片是兄弟节点：换卡时胶带先撕、卡片跟着翻走，各自独立动 -->
        <view
          v-if="task"
          class="push-flow__cardwrap"
          :class="{
            'push-flow__cardwrap--leaving': swapPhase === 'leaving',
            'push-flow__cardwrap--entering': swapPhase === 'entering',
          }"
        >
          <view class="push-flow__card push-flow__card--pinned">
            <view class="push-flow__card-title">{{ task.title }}</view>
            <view class="push-flow__card-time">{{ task.time }}</view>
            <view class="push-flow__card-instructions">{{ task.instructions }}</view>
          </view>
          <view class="push-flow__tape"></view>
        </view>
        <view v-else class="push-flow__card-empty">今天的都做过了，歇一歇也很好。</view>
      </view>

      <view class="push-flow__hint" v-if="exhausted">如果没有想做的可以深呼吸，喝点水，发发呆</view>

      <view class="push-flow__actions" v-if="task">
        <view
          class="push-flow__btn"
          :class="{ 'push-flow__btn--disabled': exhausted }"
          hover-class="u-press"
          @tap="refresh"
        >
          换一个
        </view>
      </view>

      <view v-if="task" class="push-flow__done-btn" hover-class="u-press" @tap="markDone">做完啦</view>
      <view class="push-flow__back-link" hover-class="u-press" @tap="close">← 返回</view>
    </template>

    <template v-else>
      <CompletionBeat v-if="!beatDone" @done="beatDone = true" />
      <template v-else>
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
// 现在就来一件（instant-task）：零决策即时抽取流程，card → invite → chat 三步。
// 原内联在 index.vue（god component 拆分，2026-07-12）；状态机与数据层调用整体搬入，
// 页面只负责挂载/卸载与收尾（归档、刷新入口）。
import ChatView from '@/components/ChatView.vue'
import CompletionBeat from '@/components/CompletionBeat.vue'
import FirstTimeHint from '@/components/FirstTimeHint.vue'
import { getUncompletedTasks, saveCompletedTask, getTodayCompleted } from '@/state/dailyTaskPool.js'
import { getDailyTaskCandidates } from '@/content/library.js'
import { getBasicInfo } from '@/state/basicInfo.js'
import { inferMomentScenes, preferMomentCandidates } from '@/state/momentInference.js'
import { createCompletionEvent, COMPLETION_INVITE_TEXT } from '@/state/completionEvent.js'
import { createConversation, getConversationByCompletionEventId } from '@/state/conversation.js'

export default {
  name: 'InstantFlow',
  components: { ChatView, CompletionBeat, FirstTimeHint },
  // mp-weixin：去掉组件自身的包裹节点，让 .push-flow--fill/--center 的 flex:1
  // 直接相对页面容器生效（与拆分前内联时的布局完全一致）
  options: { virtualHost: true },
  props: {
    // 当日卡片已取的天气文本（软优先的天气亲和用），没有就整层跳过，不发请求
    weatherText: { type: String, default: null },
  },
  emits: ['completed', 'close'],
  data() {
    return {
      step: 'card', // 'card' | 'invite' | 'chat'
      task: null,
      refreshCount: 0,
      exhausted: false,
      swapPhase: null, // null | 'leaving'(撕胶带+卡片翻走) | 'entering'(新胶带按上+新卡落定)
      completionEventId: null,
      conversationId: null,
      beatDone: false, // completion-beat：invite步骤里，先落一拍确认再露出聊聊邀请
      inviteText: COMPLETION_INVITE_TEXT,
    }
  },
  created() {
    this.task = this.pickTask()
  },
  methods: {
    // 零决策抽一条，排除已领取和今日已完成的（add-instant-moment-fit）：
    // 时刻推断先缩小场景（深夜只出 home 等），交集/候选为空即回落档案标签，永不因推断空手；
    // 再在候选里软优先命中此刻的打标条目。
    pickTask(extraExcludeId) {
      const excludeIds = [
        ...getUncompletedTasks().map((t) => t.id),
        ...getTodayCompleted().map((t) => t.id),
      ]
      if (extraExcludeId) excludeIds.push(extraExcludeId)
      const profileTags = getBasicInfo().scene_tags || []
      const now = new Date()
      const momentTags = inferMomentScenes(now, profileTags)
      let candidates = getDailyTaskCandidates(momentTags ?? profileTags, excludeIds, 12)
      if (!candidates.length && momentTags) {
        candidates = getDailyTaskCandidates(profileTags, excludeIds, 12)
      }
      if (!candidates.length) return null
      return preferMomentCandidates(candidates, now, this.weatherText)[0]
    },
    // "换一个"最多3次；第4次点击不再换，露出关怀小字——沿用旧推送层"把限制说成关心"的立场。
    // 换卡 = 撕胶带四拍编排：撕胶带(0-420ms) → 卡片翻走(100-620ms) → 620ms 换数据 →
    // 新胶带按上(620-940ms) → 新卡落定(780-1260ms)。时长刻意从容，贴合"不催促"。
    refresh() {
      if (!this.task || this.exhausted || this.swapPhase) return
      if (this.refreshCount >= 3) {
        this.exhausted = true
        return
      }
      this.refreshCount += 1
      this.swapPhase = 'leaving'
      setTimeout(() => {
        // 撕的途中用户可能已"← 返回"退出流程，退了就不再动数据
        if (this.step !== 'card' || !this.task) {
          this.swapPhase = null
          return
        }
        // 池子见底抽不出新卡时保留当前卡——视觉上等于"撕下来又贴了回去"
        this.task = this.pickTask(this.task.id) ?? this.task
        this.swapPhase = 'entering'
        setTimeout(() => {
          this.swapPhase = null
        }, 700)
      }, 620)
    },
    // 无"领取"概念：做完啦直接计入今日已完成（不经过 DailyTaskPool）
    // 撕卡动画进行中不响应——正在飞走的卡不该被"做完"
    markDone() {
      if (this.swapPhase) return
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
    startChat() {
      // 续用已有对话（比如上次"‹ 返回"退出、还没归档）而不是每次都新建——
      // 同一个 completionEventId 只能绑定一个 Conversation，重复 createConversation 会抛错。
      const existing = getConversationByCompletionEventId(this.completionEventId)
      const conv = existing ?? createConversation(this.completionEventId)
      this.conversationId = conv.id
      this.step = 'chat'
    },
    // 退出（返回/跳过/聊天关闭都走这里）：把归档所需上下文交给页面，收尾由页面负责
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
