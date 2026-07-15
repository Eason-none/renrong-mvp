<template>
  <view class="nav-badge" @tap="open">
    <text class="nav-badge__icon">⚙</text>
  </view>

  <view v-if="visible" class="nav-badge__overlay" @tap="close">
    <view class="nav-badge__sheet" @tap.stop>
      <template v-if="!showPrivacy && !showBasicInfo">
        <view class="nav-badge__item" hover-class="u-press" @tap="openBasicInfo">基本信息</view>
        <view class="nav-badge__item" hover-class="u-press" @tap="openPrivacy">隐私政策</view>
        <view class="nav-badge__close" hover-class="u-press" @tap="close">关闭</view>
      </template>
      <template v-else-if="showBasicInfo">
        <view class="nav-badge__privacy-back" hover-class="u-press" @tap="closeBasicInfo">‹ 返回</view>
        <scroll-view class="nav-badge__basic-info-scroll" scroll-y>
          <BasicInfoSettings @close="closeBasicInfo" />
        </scroll-view>
      </template>
      <template v-else>
        <view class="nav-badge__privacy-back" @tap="closePrivacy">‹ 返回</view>
        <scroll-view class="nav-badge__privacy-text" scroll-y>{{ PRIVACY_POLICY_TEXT }}</scroll-view>
        <view class="nav-badge__close" @tap="close">关闭</view>
      </template>
    </view>
  </view>
</template>

<script>
import BasicInfoSettings from '@/components/BasicInfoSettings.vue'

// product_handoff.md §6.2.1：如实披露版（非律师审定，但需与真实数据流一致）。覆盖四条数据流：
// ①本地存储 ②对话→第三方大模型 ③位置→第三方天气服务 ④匿名统计。联系方式已填真实邮箱；
// 微信小程序后台"用户隐私保护指引"已另行配置（内容需与本文案保持一致）。
const PRIVACY_POLICY_TEXT = `隐私政策

感谢你使用本产品。这里用直白的话，说明我们如何处理你的信息。

一、保存在你设备本地的信息
你的图鉴解锁状态、完成记录、对话内容、日记与回顾等，默认只保存在你当前设备的本地存储中，不会同步到云端账号。更换设备或清除小程序数据后，这些内容会一并丢失。

二、生成对话与文字时用到的第三方大模型
当你与"见证者"聊天、归档生成日记摘要、或生成图鉴回顾时，你在对话中输入的文字与图片，会经由我们的服务器转发给第三方大模型服务（阿里云通义千问、DeepSeek）用于即时生成回应。这些内容仅用于本次生成，不会被用于训练模型或其他用途。请不要在对话中填写身份证号、银行卡号等敏感个人信息。

三、位置与天气
如果你授权位置权限，我们会把你的大致经纬度发送给第三方天气服务（和风天气）以获取所在城市与天气，用于在首页展示天气、并让每日推荐更贴合当天情境。你可以拒绝授权，拒绝后仅影响天气展示，不影响其他功能；我们不会保存或上传你的位置轨迹。

四、匿名使用统计
为了了解功能是否被使用，我们会收集少量匿名统计：一个与你身份无关的本地随机标识、发生的事件类型、涉及的内容编号和时间。其中不包含你的昵称、生日、对话文字，也不含任何微信身份信息，我们无法凭这些数据识别到你本人。

五、我们不会做的事
不收集你的通讯录、不追踪你的位置轨迹、不将你的信息出售给第三方。

六、政策更新与联系方式
本政策可能随功能调整而更新。如对隐私有疑问，可发送邮件至 yixin20011010@163.com 与我们联系。`

export default {
  name: 'NavBar',
  components: { BasicInfoSettings },
  data() {
    return {
      visible: false,
      showPrivacy: false,
      showBasicInfo: false,
      PRIVACY_POLICY_TEXT,
    }
  },
  methods: {
    open() {
      this.visible = true
    },
    close() {
      this.visible = false
      this.showPrivacy = false
      this.showBasicInfo = false
    },
    openPrivacy() {
      this.showPrivacy = true
    },
    closePrivacy() {
      this.showPrivacy = false
    },
    openBasicInfo() {
      this.showBasicInfo = true
    },
    closeBasicInfo() {
      this.showBasicInfo = false
      this.visible = false
    },
  },
}
</script>

<style>
.nav-badge {
  position: fixed;
  top: 20rpx;
  right: 20rpx;
  z-index: 10;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-badge__icon {
  font-size: 36rpx;
  color: var(--c-subtle);
}

.nav-badge__overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.4);
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fade-in 0.2s ease both;
}

.nav-badge__sheet {
  width: 100%;
  background: var(--c-card);
  border-radius: 36rpx 36rpx 0 0;
  padding: 40rpx 40rpx 60rpx;
  animation: sheet-up 0.3s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .nav-badge__overlay,
  .nav-badge__sheet {
    animation: fade-in 0.2s ease both;
  }
}

.nav-badge__item {
  padding: 30rpx 0;
  border-bottom: 1rpx solid var(--c-border);
  font-size: 30rpx;
  color: var(--c-ink);
}

.nav-badge__close {
  padding: 30rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--c-subtle);
}

.nav-badge__privacy-back {
  font-size: 30rpx;
  color: var(--c-primary);
  padding: 12rpx 24rpx 12rpx 0;
  margin: -12rpx 0 12rpx;
}

.nav-badge__privacy-text {
  height: 600rpx;
  font-size: 26rpx;
  color: var(--c-muted);
  line-height: 1.8;
  white-space: pre-wrap;
}

.nav-badge__basic-info-scroll {
  height: 700rpx;
}
</style>
