<template>
  <view class="diary-notebook">
    <!-- 顶栏：合上 + 可点的年月标题（点开按年分组的有页月份列表跳转）。全程无计数。 -->
    <view class="diary-notebook__header">
      <view class="diary-notebook__close" hover-class="u-press" @tap="$emit('close')">‹ 合上</view>
      <view
        v-if="activeWeek"
        class="diary-notebook__month-title"
        hover-class="u-press"
        @tap="showMonthList = true"
      >
        <text class="diary-notebook__month-title-text">{{ activeWeek.label }}</text>
        <text class="diary-notebook__month-caret">▾</text>
      </view>
    </view>

    <!-- 周跨页：一屏一周，横向翻，无条目的周不产生跨页；打开落最新有条目周 -->
    <swiper
      class="diary-notebook__pager"
      :current="activeIndex"
      :circular="false"
      :indicator-dots="false"
      @change="onSwiperChange"
    >
      <swiper-item v-for="week in weeks" :key="week.key" class="diary-notebook__pane">
        <scroll-view class="diary-notebook__scroll" scroll-y>
          <view class="diary-notebook__weeklabel">{{ week.rangeLabel }}</view>

          <!-- 周内竖向全宽条目卡，最近的在上；卡面直接铺开当天记录的正文与照片。
               点卡片以全册时间线为上下文打开 TracePage（可跨页翻阅 + 页脚"保存这一页"分享入口，
               2026-07-13：幸福小事与历史页此前没有任何分享路径，由此补齐） -->
          <view v-for="entry in week.entries" :key="entry.key" class="dn-entry" hover-class="u-press" @tap="openEntry(entry)">
            <view class="dn-entry__date">{{ entryDate(entry) }}</view>
            <view class="dn-entry__title">{{ entry.title }}</view>

            <!-- 幸福小事：当天多段，按时段逐段铺开 -->
            <view v-if="entry.kind === 'three-good'" class="dn-entry__segs">
              <view v-for="(seg, i) in entry.segments" :key="i" class="dn-entry__seg">
                <text class="dn-entry__seg-time">{{ timeBucket(seg.completedAt) }}</text>
                <text user-select selectable class="dn-entry__seg-text">{{ seg.summaryText }}</text>
              </view>
            </view>
            <!-- 其它：一段正文 -->
            <text v-else user-select selectable class="dn-entry__text">{{ entry.segments[0].summaryText }}</text>

            <!-- 照片（当天所有段的缩略图） -->
            <view v-if="photosOf(entry).length" class="dn-entry__photos">
              <image
                v-for="(p, i) in photosOf(entry)"
                :key="i"
                :src="p"
                mode="aspectFill"
                class="dn-entry__photo"
              ></image>
            </view>
          </view>
        </scroll-view>
      </swiper-item>
    </swiper>

    <!-- 单页视图：TracePage 复用（z-120 > 本册 115），左右滑沿全册时间线翻页 -->
    <TracePage
      v-if="pageView"
      :title="pageView.page.title"
      :completed-at="pageView.page.completedAt"
      :summary-text="pageView.page.summaryText"
      :photo-thumb="pageView.page.photoThumb"
      :pages="pageView.timeline"
      :start-index="pageView.index"
      @close="pageView = null"
    />

    <!-- 月份列表：按年分组，只列有条目的月，点即跳转到该月最新一周；无日网格 -->
    <view v-if="showMonthList" class="dn-monthlist" @tap="showMonthList = false">
      <view class="dn-monthlist__panel" @tap.stop>
        <view v-for="group in monthsByYear" :key="group.year" class="dn-monthlist__year">
          <view class="dn-monthlist__year-label">{{ group.year }}</view>
          <view class="dn-monthlist__months">
            <view
              v-for="entry in group.months"
              :key="entry.key"
              class="dn-monthlist__month"
              :class="{ 'dn-monthlist__month--active': entry.index === activeIndex }"
              hover-class="u-press"
              @tap="jumpTo(entry.index)"
            >{{ entry.month }}月</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getNotebookWeeks, getBookTimeline } from '@/state/diaryNotebook.js'
import TracePage from '@/components/TracePage.vue'

// 日期粒度：日 + 时段（与 TracePage 同一套划分）。
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

export default {
  name: 'DiaryNotebook',
  components: { TracePage },
  emits: ['close'],
  data() {
    const weeks = getNotebookWeeks() // 周序旧→新；入口只在有页时渲染本组件，weeks 非空
    return {
      weeks,
      activeIndex: weeks.length ? weeks.length - 1 : 0, // 打开落最新有条目周
      showMonthList: false,
      pageView: null, // { page, timeline, index } | null——点条目卡打开的单页视图
    }
  },
  computed: {
    activeWeek() {
      return this.weeks[this.activeIndex] ?? null
    },
    // 按年分组的月份列表；每个年月跳到"最新的那一周"（weeks 升序遍历，后写入即最新）。
    monthsByYear() {
      const byMonth = new Map()
      this.weeks.forEach((w, index) => {
        byMonth.set(`${w.year}-${w.month}`, { key: `${w.year}-${w.month}`, year: w.year, month: w.month, index })
      })
      const byYear = new Map()
      for (const m of byMonth.values()) {
        if (!byYear.has(m.year)) byYear.set(m.year, [])
        byYear.get(m.year).push(m)
      }
      return [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, months]) => ({ year, months: months.sort((a, b) => a.month - b.month) }))
    },
  },
  methods: {
    // 幸福小事按天合并，卡面只露日期（不带具体时段，时段落到每段前）；其它露"日 + 时段"
    entryDate(entry) {
      const d = new Date(entry.kind === 'three-good' ? entry.dayTs : entry.segments[0].completedAt)
      const base = `${d.getMonth() + 1}月${d.getDate()}日`
      return entry.kind === 'three-good' ? base : `${base} · ${timeOfDay(d.getHours())}`
    },
    // 点条目卡：以全册时间线为上下文打开单页视图。幸福小事合并卡从当天第一段所在页进入
    //（时间线上各段是独立页，进入后左右滑可翻到同天其余段）。
    openEntry(entry) {
      const timeline = getBookTimeline()
      const firstId = entry.segments[0]?.id
      const index = Math.max(0, timeline.findIndex((p) => p.id === firstId))
      this.pageView = { page: timeline[index], timeline, index }
    },
    timeBucket(ts) {
      return timeOfDay(new Date(ts).getHours())
    },
    photosOf(entry) {
      return entry.segments.flatMap((s) => (Array.isArray(s.photos) && s.photos.length ? s.photos : s.photoThumb ? [s.photoThumb] : []))
    },
    onSwiperChange(e) {
      this.activeIndex = e.detail.current
    },
    jumpTo(index) {
      this.activeIndex = index
      this.showMonthList = false
    },
  },
}
</script>

<style>
/* 全屏 overlay：纸感底色 = 摊开的册子内页。z-index 115 < TracePage 的 120。 */
.diary-notebook {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--c-bg);
  z-index: 115;
  animation: fade-in 0.24s ease both;
}

@media (prefers-reduced-motion: reduce) {
  .diary-notebook {
    animation: fade-in 0.2s ease both;
  }
}

.diary-notebook__header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: 88rpx 40rpx 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  background: linear-gradient(var(--c-bg) 72%, rgba(243, 247, 240, 0));
  z-index: 4;
}

.diary-notebook__close {
  font-size: 30rpx;
  color: var(--c-primary);
  padding: 12rpx 24rpx 12rpx 0;
  margin: -12rpx 0;
}

.diary-notebook__month-title {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  padding: 6rpx 8rpx;
}

.diary-notebook__month-title-text {
  font-size: 34rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
}

.diary-notebook__month-caret {
  font-size: 20rpx;
  color: var(--c-subtle);
}

.diary-notebook__pager {
  position: fixed;
  top: 176rpx;
  left: 0;
  right: 0;
  bottom: 0;
}

.diary-notebook__pane {
  height: 100%;
  box-sizing: border-box;
}

.diary-notebook__scroll {
  height: 100%;
}

/* 当周区间标注（如 7月6日 – 7月12日），轻声交代这一屏是哪一周 */
.diary-notebook__weeklabel {
  padding: 8rpx 40rpx 4rpx;
  font-size: 22rpx;
  color: var(--c-subtle);
  letter-spacing: 0.06em;
}

/* 条目卡：全宽标本卡，卡面直接铺开正文 */
.dn-entry {
  margin: 20rpx 40rpx 0;
  padding: 30rpx 32rpx 32rpx;
  background: var(--c-card);
  border: 1rpx solid var(--c-border);
  border-radius: 24rpx;
  box-shadow: var(--sh-card);
  box-sizing: border-box;
  animation: rise-in 0.3s var(--ease-out) both;
}

/* 末条留出底部呼吸空间 */
.dn-entry:last-child {
  margin-bottom: 80rpx;
}

@media (prefers-reduced-motion: reduce) {
  .dn-entry {
    animation: fade-in 0.2s ease both;
  }
}

.dn-entry__date {
  font-size: 20rpx;
  color: var(--c-subtle);
  letter-spacing: 0.06em;
  margin-bottom: 8rpx;
}

.dn-entry__title {
  font-size: 30rpx;
  color: var(--c-ink);
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 18rpx;
}

/* 单段正文 */
.dn-entry__text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.9;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

/* 幸福小事多段：时段小标 + 正文，逐段错落 */
.dn-entry__segs {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.dn-entry__seg {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.dn-entry__seg-time {
  font-size: 20rpx;
  color: var(--c-accent-ink);
  letter-spacing: 0.08em;
}

.dn-entry__seg-text {
  font-size: 28rpx;
  color: var(--c-muted);
  line-height: 1.9;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

/* 照片：一排小方图，正文为主、照片为辅 */
.dn-entry__photos {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 22rpx;
}

.dn-entry__photo {
  width: 180rpx;
  height: 180rpx;
  border-radius: 16rpx;
  background: var(--c-surface);
}

/* 月份列表：从顶栏下垂的目录页，scrim 点空处关闭 */
.dn-monthlist {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.4);
  z-index: 8;
  animation: fade-in 0.2s ease both;
}

.dn-monthlist__panel {
  position: absolute;
  top: 176rpx;
  left: 40rpx;
  right: 40rpx;
  max-height: 66vh;
  overflow-y: auto;
  background: var(--c-card);
  border-radius: 24rpx;
  box-shadow: var(--sh-float);
  padding: 28rpx 32rpx 36rpx;
  box-sizing: border-box;
  animation: rise-in 0.26s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .dn-monthlist,
  .dn-monthlist__panel {
    animation: fade-in 0.2s ease both;
  }
}

.dn-monthlist__year {
  padding: 12rpx 0;
}

.dn-monthlist__year-label {
  font-size: 22rpx;
  color: var(--c-subtle);
  letter-spacing: 0.12em;
  margin-bottom: 14rpx;
}

.dn-monthlist__months {
  display: flex;
  flex-wrap: wrap;
  gap: 18rpx;
}

.dn-monthlist__month {
  padding: 14rpx 30rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  background: var(--c-bg);
  font-size: 26rpx;
  color: var(--c-muted);
}

.dn-monthlist__month--active {
  background: var(--c-primary);
  color: #f0f5ef;
  border-color: transparent;
}
</style>
