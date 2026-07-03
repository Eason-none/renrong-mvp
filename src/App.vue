<script>
export default {
  onLaunch: function () {
    console.log('App Launch')
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
}
</script>

<style>
page {
  --c-bg:           #ffffff;
  --c-surface:      #f3f9f2;
  --c-surface-alt:  #e6efe4;
  --c-ink:          #081006;
  --c-muted:        #5d665b;
  --c-subtle:       #888e87;
  --c-primary:      #124703;
  --c-primary-soft: #d0e5cb;
  --c-accent:       #cd9130;
  --c-accent-soft:  #ffe7c3;
  --c-border:       #dfe6de;
  --c-border-s:     #cad5c7;
  --sh-card:  0 2rpx 6rpx rgba(8,16,6,0.06), 0 8rpx 28rpx rgba(8,16,6,0.05);
  --sh-float: 0 4rpx 16rpx rgba(8,16,6,0.08), 0 16rpx 56rpx rgba(8,16,6,0.10);
  font-family: 'PingFang SC', -apple-system, 'Noto Sans SC', sans-serif;
  color: var(--c-ink);
  background: var(--c-bg);
}
</style>
