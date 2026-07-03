<template>
  <view class="unlock-modal">
    <view class="unlock-modal__sheet">
      <view class="unlock-modal__name">{{ collection.name }}</view>
      <view class="unlock-modal__intro">{{ collection.intro }}</view>

      <template v-if="state.status === 'locked'">
        <view v-if="atLimit" class="unlock-modal__blocked">进行中的图鉴已有3个，先放下一个再来</view>
        <view class="unlock-modal__actions">
          <view v-if="!atLimit" class="unlock-modal__btn unlock-modal__btn--primary" @tap="startExploring">
            开始探索
          </view>
          <view class="unlock-modal__btn" @tap="$emit('close')">{{ atLimit ? '知道了' : '算了' }}</view>
        </view>
      </template>

      <template v-else-if="state.status === 'active'">
        <view class="unlock-modal__actions">
          <view class="unlock-modal__btn unlock-modal__btn--primary" @tap="$emit('enter', collectionId)">进入图鉴</view>
          <view class="unlock-modal__btn" @tap="putDownAction">放下</view>
        </view>
      </template>

      <template v-else>
        <view class="unlock-modal__actions">
          <view class="unlock-modal__btn unlock-modal__btn--primary" @tap="$emit('enter', collectionId)">进入图鉴</view>
          <view class="unlock-modal__btn" @tap="$emit('close')">关闭</view>
        </view>
      </template>
    </view>
  </view>
</template>

<script>
import { getCollectionById } from '@/content/library.js'
import { getCollectionState, countActiveCollections, activate, putDown } from '@/state/collectionMachine.js'

export default {
  name: 'CollectionUnlockModal',
  props: {
    collectionId: { type: String, required: true },
  },
  emits: ['close', 'changed', 'enter'],
  data() {
    return {
      collection: getCollectionById(this.collectionId),
      state: getCollectionState(this.collectionId),
    }
  },
  computed: {
    atLimit() {
      return countActiveCollections() >= 3
    },
  },
  methods: {
    startExploring() {
      // 激活后直接进图鉴：和原型"点图鉴即进详情"一致，避免"激活→回网格→再点一次"的空反馈。
      // onEnter 会清空 selectedId 关闭本弹窗，无需再单独 emit close；返回网格时 grid 重新挂载天然刷新。
      activate(this.collectionId)
      this.$emit('enter', this.collectionId)
    },
    putDownAction() {
      putDown(this.collectionId)
      this.$emit('changed')
      this.$emit('close')
    },
  },
}
</script>

<style>
.unlock-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.unlock-modal__sheet {
  width: 80%;
  background: var(--c-bg);
  border-radius: 44rpx;
  padding: 48rpx 40rpx;
  box-shadow: var(--sh-float);
}

.unlock-modal__name {
  font-size: 36rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin-bottom: 16rpx;
}

.unlock-modal__intro {
  font-size: 26rpx;
  color: var(--c-muted);
  line-height: 1.85;
  margin-bottom: 32rpx;
}

.unlock-modal__blocked {
  font-size: 26rpx;
  color: var(--c-subtle);
  margin-bottom: 24rpx;
}

.unlock-modal__actions {
  display: flex;
  justify-content: center;
  gap: 24rpx;
}

.unlock-modal__btn {
  padding: 22rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border);
  color: var(--c-muted);
  font-size: 28rpx;
}

.unlock-modal__btn--primary {
  background: var(--c-primary);
  color: #f0f5ef;
  border-color: transparent;
}
</style>
