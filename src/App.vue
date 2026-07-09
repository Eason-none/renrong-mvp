<script>
import { flushQueue, track } from './state/analytics.js'

export default {
  onLaunch: function () {
    console.log('App Launch')
  },
  onShow: function () {
    // 先冲待发队列再报本次 session_start（specs/analytics-events：失败事件有界重发）。
    // onShow 含冷启动和后台切回，多报由 SQL 口径按 anon_id+天去重（design.md D3）。
    flushQueue()
    track('session_start')
  },
  onHide: function () {
    console.log('App Hide')
  },
}
</script>

<style>
page {
  /* 标本册色层：页面底 = 带品牌绿相的纸感底，卡片 = 白色"标本卡"贴在纸上 */
  --c-bg:           #f3f7f0;
  --c-card:         #ffffff;
  --c-surface:      #ecf3e8;
  --c-surface-alt:  #e3ece0;
  --c-ink:          #081006;
  --c-muted:        #4c5749;
  --c-subtle:       #66705f;
  --c-primary:      #124703;
  --c-primary-deep: #0d3502;
  --c-primary-soft: #d3e6cc;
  /* 金 = 烫金语义，只属于"点亮/完成"时刻：bright 用于填充与描边，ink 用于文字（保证对比度） */
  --c-accent:       #cd9130;
  --c-accent-ink:   #8a5c12;
  --c-accent-soft:  #f7ecd4;
  --c-border:       #d9e2d4;
  --c-border-s:     #c2cfbc;
  --sh-card:  0 2rpx 6rpx rgba(8,16,6,0.06), 0 8rpx 28rpx rgba(8,16,6,0.05);
  --sh-float: 0 4rpx 16rpx rgba(8,16,6,0.08), 0 16rpx 56rpx rgba(8,16,6,0.10);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  font-family: 'PingFang SC', -apple-system, 'Noto Sans SC', sans-serif;
  color: var(--c-ink);
  background: var(--c-bg);
}

/* ===== 全局动效词汇（组件 <style> 不带 scoped，keyframes 全局可用）===== */

/* 卡片/内容入场：从纸面轻轻"落"上来 */
@keyframes rise-in {
  from { opacity: 0; transform: translateY(16rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 遮罩淡入 */
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* 底部抽屉上滑 */
@keyframes sheet-up {
  from { opacity: 0; transform: translateY(120rpx); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 仪式印记：完成时刻的金色 ✦ 像盖章一样落下 */
@keyframes seal-stamp {
  0%   { opacity: 0; transform: scale(1.6); }
  60%  { opacity: 1; transform: scale(0.94); }
  100% { opacity: 1; transform: scale(1); }
}

/* 按压反馈：所有可点元素统一 hover-class="u-press"（微信小程序/H5 通用） */
.u-press {
  transform: scale(0.97);
  opacity: 0.8;
}

/* 完成仪式的共享印记元素 */
.ritual-seal {
  font-size: 48rpx;
  color: var(--c-accent);
  text-align: center;
  margin-bottom: 28rpx;
  animation: seal-stamp 0.5s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .ritual-seal { animation: fade-in 0.3s ease both; }
}
</style>
