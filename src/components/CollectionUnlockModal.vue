<template>
  <view class="unlock-modal">
    <view class="unlock-modal__sheet">
      <view class="unlock-modal__name">{{ collection.name }}</view>
      <view class="unlock-modal__intro">{{ collection.intro }}</view>

      <template v-if="state.status === 'locked'">
        <view v-if="exampleItem" class="unlock-modal__example">
          <view class="unlock-modal__example-label">比如</view>
          <view class="unlock-modal__example-title">{{ exampleItem.title }}</view>
          <view v-if="exampleItem.hook" class="unlock-modal__example-hook">{{ exampleItem.hook }}</view>
        </view>
        <template v-if="atLimit">
          <view class="unlock-modal__blocked">过多的选择可能分散对过程感受的注意力。你随时可以开启新的图鉴，不过需要先把一个暂时放下。</view>
          <view v-for="c in activeCollections" :key="c.id" class="unlock-modal__active-row">
            <view class="unlock-modal__active-name">{{ c.name }}</view>
            <view class="unlock-modal__btn unlock-modal__btn--small" hover-class="u-press" @tap="putDownFromLimit(c.id)">放下</view>
          </view>
        </template>
        <view class="unlock-modal__actions">
          <view v-if="!atLimit" class="unlock-modal__btn unlock-modal__btn--primary" hover-class="u-press" @tap="startExploring">
            开始探索
          </view>
          <view class="unlock-modal__btn" hover-class="u-press" @tap="$emit('close')">{{ atLimit ? '再逛逛' : '算了' }}</view>
        </view>
      </template>

      <template v-else-if="state.status === 'active'">
        <view class="unlock-modal__actions">
          <view class="unlock-modal__btn unlock-modal__btn--primary" hover-class="u-press" @tap="$emit('enter', collectionId)">进入图鉴</view>
          <view class="unlock-modal__btn" hover-class="u-press" @tap="putDownAction">放下</view>
        </view>
      </template>

      <template v-else>
        <view class="unlock-modal__actions">
          <view class="unlock-modal__btn unlock-modal__btn--primary" hover-class="u-press" @tap="$emit('enter', collectionId)">进入图鉴</view>
          <view class="unlock-modal__btn" hover-class="u-press" @tap="$emit('close')">关闭</view>
        </view>
      </template>
    </view>
  </view>
</template>

<script>
import { getCollectionById, getAllCollections } from '@/content/library.js'
import { getCollectionState, getAllCollectionStates, countActiveCollections, activate, putDown } from '@/state/collectionMachine.js'

function listActiveCollections() {
  const states = getAllCollectionStates()
  return getAllCollections().filter((c) => states[c.id]?.status === 'active')
}

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
      // storage 不是响应式的，激活数/激活列表存成 data，内联"放下"后手动刷新
      activeCount: countActiveCollections(),
      activeCollections: listActiveCollections(),
    }
  },
  computed: {
    atLimit() {
      return this.activeCount >= 3
    },
    // 示例条目取第一条，锁定态预览用；内容库暂未回填 hook 字段，模板里 hook 为空时省略该行
    exampleItem() {
      return this.collection.items[0]
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
    // 上限提示内联放下（§5.3）：放下后弹窗保持打开，[开始探索] 原地变可用
    putDownFromLimit(id) {
      putDown(id)
      this.activeCount = countActiveCollections()
      this.activeCollections = listActiveCollections()
      this.$emit('changed')
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
  background: rgba(8, 16, 6, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fade-in 0.2s ease both;
}

.unlock-modal__sheet {
  width: 80%;
  background: var(--c-card);
  border-radius: 32rpx;
  padding: 48rpx 40rpx;
  box-shadow: var(--sh-float);
  animation: rise-in 0.3s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .unlock-modal,
  .unlock-modal__sheet {
    animation: fade-in 0.2s ease both;
  }
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

.unlock-modal__example {
  background: rgba(0, 0, 0, 0.03);
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 32rpx;
}

.unlock-modal__example-label {
  font-size: 22rpx;
  color: var(--c-subtle);
  margin-bottom: 8rpx;
}

.unlock-modal__example-title {
  font-size: 28rpx;
  color: var(--c-ink);
}

.unlock-modal__example-hook {
  font-size: 24rpx;
  color: var(--c-muted);
  line-height: 1.7;
  margin-top: 8rpx;
}

.unlock-modal__blocked {
  font-size: 26rpx;
  color: var(--c-subtle);
  line-height: 1.85;
  margin-bottom: 24rpx;
}

.unlock-modal__active-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 8rpx;
  margin-bottom: 8rpx;
}

.unlock-modal__active-name {
  font-size: 28rpx;
  color: var(--c-ink);
}

.unlock-modal__btn--small {
  padding: 12rpx 32rpx;
  font-size: 24rpx;
}

.unlock-modal__actions {
  display: flex;
  justify-content: center;
  gap: 24rpx;
  margin-top: 8rpx;
}

.unlock-modal__btn {
  padding: 24rpx 48rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-card);
  color: var(--c-muted);
  font-size: 28rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}

.unlock-modal__btn--primary {
  background: var(--c-primary);
  color: #f0f5ef;
  border-color: transparent;
}
</style>
