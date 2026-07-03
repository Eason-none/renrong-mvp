<template>
  <view class="daily-task-item" @tap="$emit('select', task)">
    <text class="daily-task-item__title">{{ task.title }}</text>
    <text class="daily-task-item__hook">{{ task.hook }}</text>
  </view>
</template>

<script>
export default {
  name: 'DailyTaskItem',
  emits: ['select'],
  props: {
    task: { type: Object, required: true },
  },
}
</script>

<style>
.daily-task-item {
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--c-border);
}

.daily-task-item__title {
  display: block;
  font-size: 28rpx;
  color: var(--c-ink);
  line-height: 1.45;
  margin-bottom: 8rpx;
}

.daily-task-item__hook {
  display: block;
  font-size: 24rpx;
  color: var(--c-muted);
  line-height: 1.5;
}
</style>
