<template>
  <!-- 关闭用"sheet 截断冒泡 + 根节点收尾"而不是 @tap.self：.self 在 mp-weixin 编译成普通
       bindtap 后 target 比对失效，弹层内任何点击都会触发关闭（"保存这一页"点了没反应的根因） -->
  <view class="trace-page-overlay" @tap="$emit('close')" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <view class="trace-page-sheet" @tap.stop>
      <view class="trace-page-sheet__back" hover-class="u-press" @tap="$emit('close')">‹ 回去</view>
      <view class="trace-page__date">{{ dateLabel }}</view>
      <view class="trace-page__title">{{ current.title }}</view>
      <!-- 照片：单张整幅；多张横向滑动的相纸条（不裁剪语义交给 aspectFill 单张、多张缩略横排） -->
      <image v-if="currentPhotos.length === 1" :src="currentPhotos[0]" mode="aspectFill" class="trace-page__photo"></image>
      <scroll-view v-else-if="currentPhotos.length > 1" class="trace-page__photo-strip" scroll-x>
        <image
          v-for="(p, i) in currentPhotos"
          :key="i"
          :src="p"
          mode="aspectFill"
          class="trace-page__photo-strip-item"
        ></image>
      </scroll-view>
      <view class="trace-page__lead">那天你说：</view>
      <scroll-view class="trace-page__text-scroll" scroll-y>
        <text user-select selectable class="trace-page__text">{{ current.summaryText }}</text>
      </scroll-view>
      <!-- share-card：安静的常驻保存入口——与"‹ 回去"同级的文字样式，无按钮强调、无红点、
           无动效引导（入口永不主动弹出，红线见 share-card spec） -->
      <view class="trace-page__footer">
        <view class="trace-page__save" hover-class="u-press" @tap="showShare = true">保存这一页</view>
      </view>
    </view>
    <!-- 首次说明（2026-07-13 用户决策）：第一次见到"页"时讲清保存入口在哪，
         与回顾页共用 hintKey，全生命周期只出现一次；仍是说明不是引导弹出 -->
    <FirstTimeHint
      hint-key="share-save-entry"
      text="像这样的每一页都可以做成一张卡片存进相册——入口是页脚的「保存这一页」。手记册里翻到的任何一页、图鉴的回顾，也都能这样保存。"
    />
    <ShareCardPreview v-if="showShare" :page="current" @close="showShare = false" />
  </view>
</template>

<script>
// 重逢弹层（trace-reencounter）：图鉴锁定条目、今日/昨日完成条目点开时展示的一页日记。
// 只在"有页"（summary_text非空）时被调用——无页不弹、不占位（无空格子原则）。

// 日期粒度用"日 + 时段"而不是精确到分钟——重逢重要的是"那天"，不是"那一刻的时间戳"。
const TIME_BUCKETS = [
  [5, '清晨'],
  [8, '上午'],
  [11, '中午'],
  [13, '下午'],
  [17, '傍晚'],
  [19, '晚上'],
  [22, '深夜'],
]

function timeOfDay(hour) {
  for (let i = TIME_BUCKETS.length - 1; i >= 0; i--) {
    if (hour >= TIME_BUCKETS[i][0]) return TIME_BUCKETS[i][1]
  }
  return '深夜'
}

function formatDiaryDate(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${timeOfDay(d.getHours())}`
}

// 横滑翻页的最小识别阈值（rpx 无关的物理像素）：水平位移需超过此值、且水平分量占优，
// 才判定为翻页手势——低于阈值或以纵向为主的滑动交给内部 scroll-view，不误触翻页。
const SWIPE_THRESHOLD = 60

import ShareCardPreview from './ShareCardPreview.vue'
import FirstTimeHint from './FirstTimeHint.vue'

export default {
  name: 'TracePage',
  components: { ShareCardPreview, FirstTimeHint },
  props: {
    title: { type: String, required: true },
    completedAt: { type: Number, required: true },
    summaryText: { type: String, required: true },
    photoThumb: { type: String, default: null },
    // 完整照片列表（photo_thumbs）；不传时回落单图 photoThumb。pages 时间线的每页可带自己的 photos。
    photos: { type: Array, default: null },
    // 可选相邻翻页上下文（trace-reencounter 扩展）：调用方传入全册时间线（旧→新的页数组，
    // 每项含 title/completedAt/summaryText/photoThumb）与当前页在其中的下标时，弹层内左右滑
    // 沿该序列切页。不传（默认 null）时行为与现状完全一致——单页展示、左右滑无响应。
    pages: { type: Array, default: null },
    startIndex: { type: Number, default: 0 },
  },
  emits: ['close'],
  data() {
    return {
      // 内部游标，仅在提供 pages 时生效；触点缓存用于 touchend 时算位移
      cursor: this.clampIndex(this.startIndex),
      touchX: 0,
      touchY: 0,
      showShare: false,
    }
  },
  computed: {
    // 有邻页序列时以游标页为准，否则回落到标量 props（现状单页行为逐像素不变）
    current() {
      if (this.hasNeighbors) return this.pages[this.cursor]
      return { title: this.title, completedAt: this.completedAt, summaryText: this.summaryText, photoThumb: this.photoThumb, photos: this.photos }
    },
    // 当前页照片列表（新旧归一）：photos 数组优先，回落单图
    currentPhotos() {
      const p = this.current.photos
      if (Array.isArray(p) && p.length) return p.filter(Boolean)
      return this.current.photoThumb ? [this.current.photoThumb] : []
    },
    hasNeighbors() {
      return Array.isArray(this.pages) && this.pages.length > 0
    },
    dateLabel() {
      return formatDiaryDate(this.current.completedAt)
    },
  },
  watch: {
    startIndex(v) {
      this.cursor = this.clampIndex(v)
    },
  },
  methods: {
    clampIndex(i) {
      if (!Array.isArray(this.pages) || this.pages.length === 0) return 0
      if (i < 0) return 0
      if (i >= this.pages.length) return this.pages.length - 1
      return i
    },
    onTouchStart(e) {
      const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
      if (!t) return
      this.touchX = t.pageX
      this.touchY = t.pageY
    },
    // 往回划（向右，dx>0）= 更早一页；往前划（向左，dx<0）= 更晚一页。
    // 与月间横翻方向感一致（design.md 决策 8）。两端停止且无任何"到头了"提示。
    onTouchEnd(e) {
      // 分享预览打开时不翻页：预览不再 catch 触摸事件（mp 上 catch 会阻断子树 tap 合成），
      // 改由这里按 showShare 忽略，避免在预览上滑动把底下的页翻走
      if (this.showShare) return
      if (!this.hasNeighbors || this.pages.length < 2) return
      const t = e.changedTouches && e.changedTouches[0]
      if (!t) return
      const dx = t.pageX - this.touchX
      const dy = t.pageY - this.touchY
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return
      const next = this.cursor + (dx > 0 ? -1 : 1)
      if (next < 0 || next >= this.pages.length) return // 到达全册最早/最晚，静默停止
      this.cursor = next
    },
  },
}
</script>

<style>
.trace-page-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.5);
  z-index: 120;
  display: flex;
  align-items: flex-end;
  animation: fade-in 0.2s ease both;
}

.trace-page-sheet {
  width: 100%;
  max-height: 80vh;
  background: var(--c-card);
  border-radius: 36rpx 36rpx 0 0;
  padding: 40rpx 40rpx 56rpx;
  box-sizing: border-box;
  box-shadow: var(--sh-float);
  animation: sheet-up 0.3s var(--ease-out) both;
  display: flex;
  flex-direction: column;
}

@media (prefers-reduced-motion: reduce) {
  .trace-page-overlay,
  .trace-page-sheet {
    animation: fade-in 0.2s ease both;
  }
}

.trace-page-sheet__back {
  font-size: 28rpx;
  color: var(--c-primary);
  /* 热区下探 12rpx，margin 相应收 12rpx，视觉节奏不变 */
  padding: 12rpx 24rpx 12rpx 0;
  margin-bottom: 8rpx;
  margin-top: -12rpx;
}

.trace-page__date {
  font-size: 22rpx;
  color: var(--c-subtle);
  letter-spacing: 0.08em;
  margin-bottom: 10rpx;
}

.trace-page__title {
  font-size: 34rpx;
  color: var(--c-ink);
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 28rpx;
}

.trace-page__photo {
  width: 100%;
  max-height: 360rpx;
  border-radius: 20rpx;
  margin-bottom: 28rpx;
  background: var(--c-surface);
}

.trace-page__photo-strip {
  width: 100%;
  white-space: nowrap;
  margin-bottom: 28rpx;
}

.trace-page__photo-strip-item {
  display: inline-block;
  width: 300rpx;
  height: 300rpx;
  border-radius: 16rpx;
  margin-right: 16rpx;
  background: var(--c-surface);
}

.trace-page__lead {
  font-size: 24rpx;
  color: var(--c-subtle);
  margin-bottom: 12rpx;
}

.trace-page__text-scroll {
  max-height: 40vh;
}

.trace-page__text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.9;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

.trace-page__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 24rpx;
}

.trace-page__save {
  font-size: 26rpx;
  color: var(--c-primary);
  border-bottom: 1rpx dashed var(--c-border-s);
  padding-bottom: 4rpx;
}
</style>
