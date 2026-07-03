<template>
  <view class="nav-badge" @tap="open">
    <text class="nav-badge__icon">⚙</text>
  </view>

  <view v-if="visible" class="nav-badge__overlay" @tap="close">
    <view class="nav-badge__sheet" @tap.stop>
      <template v-if="!showPrivacy && !showBasicInfo">
        <view class="nav-badge__item" @tap="openBasicInfo">基本信息</view>
        <view class="nav-badge__item" @tap="requestReminder">主动提醒（去开启提醒）</view>
        <view class="nav-badge__item" @tap="openPrivacy">隐私政策</view>
        <view class="nav-badge__close" @tap="close">关闭</view>
      </template>
      <template v-else-if="showBasicInfo">
        <view class="nav-badge__privacy-back" @tap="closeBasicInfo">‹ 返回</view>
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

// product_handoff.md §6.2.1：MVP阶段占位文本，不是律师审定的正式条款——微信小程序上架要求
// 必须有这个入口（平台合规底线），但条款内容本身在MVP验证使用流程阶段不是重点。
const PRIVACY_POLICY_TEXT = `隐私政策（占位）

本产品目前为开发验证阶段的最小可用版本，尚未正式上线。

当前版本的全部数据（图鉴解锁状态、完成度、对话记录、回顾内容等）只保存在你当前设备的本地存储里，不会上传到任何服务器，开发者也无法看到。

正式上线后，本政策会替换为完整版本，说明届时会收集哪些信息、如何使用、如何保护，以及你可以如何管理自己的数据。`

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
    // product_handoff.md §6.2.1：订阅状态的开关由用户在微信"服务通知"里管理，小程序这边
    // 只能发起一次性订阅消息授权请求，做不到产品自己可控的开关——这里只负责发起请求。
    // tmplId是微信小程序后台注册订阅消息模板后才会拿到的真实ID，当前没有已注册的模板，
    // 留空时直接提示"还没配置"，不拿假ID去调用线上接口制造一个一定失败的网络请求。
    requestReminder() {
      // #ifdef MP-WEIXIN
      const tmplId = import.meta.env.VITE_WX_SUBSCRIBE_TEMPLATE_ID
      if (!tmplId) {
        uni.showToast({ title: '提醒功能还没配置好，敬请期待', icon: 'none' })
        return
      }
      uni.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: () => uni.showToast({ title: '已开启提醒', icon: 'none' }),
        fail: () => uni.showToast({ title: '没能开启，可以去微信"服务通知"里看看', icon: 'none' }),
      })
      // #endif
      // #ifndef MP-WEIXIN
      uni.showToast({ title: '提醒功能目前只在微信小程序内可用', icon: 'none' })
      // #endif
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
  background: rgba(0, 0, 0, 0.35);
  z-index: 20;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.nav-badge__sheet {
  width: 100%;
  background: var(--c-bg);
  border-radius: 48rpx 48rpx 0 0;
  padding: 40rpx 40rpx 60rpx;
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
  font-size: 28rpx;
  color: var(--c-primary);
  margin-bottom: 24rpx;
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
