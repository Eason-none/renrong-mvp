<template>
  <view class="basic-info">
    <view class="basic-info__title">基本信息</view>

    <view class="basic-info__field">
      <text class="basic-info__label">玩家 ID</text>
      <input
        class="basic-info__input"
        v-model="form.player_id"
        placeholder="给自己取个代号吧"
        maxlength="20"
      />
    </view>

    <view class="basic-info__field">
      <text class="basic-info__label">出生日期（选填）</text>
      <view class="basic-info__picker-row">
        <picker class="basic-info__picker-wrap" mode="date" :value="form.birth_date" @change="onBirthDateChange">
          <view class="basic-info__picker">
            {{ form.birth_date || '选择日期，也可以不填' }}
          </view>
        </picker>
        <!-- 微信的 date picker 点开后只能"选一个"或取消，选过就回不到未填——这里补上反悔口。
             不弹确认：误点清除后重选的成本极低，确认弹窗只会添堵。 -->
        <view v-if="form.birth_date" class="basic-info__picker-clear" hover-class="u-press" @tap="clearBirthDate">清除</view>
      </view>
    </view>

    <view class="basic-info__field">
      <text class="basic-info__label">主要待的地方</text>
      <view class="basic-info__tags">
        <view
          v-for="opt in PLACE_OPTIONS"
          :key="opt.value"
          class="basic-info__tag"
          :class="{ 'basic-info__tag--active': form.scene_tags.includes(opt.value) }"
          hover-class="u-press"
          @tap="toggleTag(opt.value)"
        >{{ opt.label }}</view>
      </view>
    </view>

    <view class="basic-info__field">
      <text class="basic-info__label">通勤方式</text>
      <view class="basic-info__tags">
        <view
          v-for="opt in TRANSIT_OPTIONS"
          :key="opt.value"
          class="basic-info__tag"
          :class="{ 'basic-info__tag--active': form.scene_tags.includes(opt.value) }"
          hover-class="u-press"
          @tap="toggleTag(opt.value)"
        >{{ opt.label }}</view>
      </view>
    </view>

    <view class="basic-info__field">
      <text class="basic-info__label">经常去的地方</text>
      <view class="basic-info__tags">
        <view
          v-for="opt in VENUE_OPTIONS"
          :key="opt.value"
          class="basic-info__tag"
          :class="{ 'basic-info__tag--active': form.scene_tags.includes(opt.value) }"
          hover-class="u-press"
          @tap="toggleTag(opt.value)"
        >{{ opt.label }}</view>
      </view>
    </view>

    <view class="basic-info__save" hover-class="u-press" @tap="save">保存</view>
  </view>
</template>

<script>
import { getBasicInfo, saveBasicInfo } from '@/state/basicInfo.js'

const PLACE_OPTIONS = [
  { label: '工位', value: 'workspace' },
  { label: '教室', value: 'classroom' },
  { label: '自己的房间', value: 'home' },
]
const TRANSIT_OPTIONS = [
  { label: '地铁/公交', value: 'transit' },
  { label: '步行/骑行', value: 'walking' },
  { label: '私家车', value: 'driving' },
]
const VENUE_OPTIONS = [
  { label: '便利店', value: 'convenience-store' },
  { label: '食堂', value: 'canteen' },
  { label: '健身房', value: 'gym' },
  { label: '菜市场', value: 'market' },
]

export default {
  name: 'BasicInfoSettings',
  emits: ['close'],
  data() {
    const info = getBasicInfo()
    return {
      PLACE_OPTIONS,
      TRANSIT_OPTIONS,
      VENUE_OPTIONS,
      form: {
        player_id: info.player_id || '',
        birth_date: info.birth_date || '',
        scene_tags: [...(info.scene_tags || [])],
      },
    }
  },
  methods: {
    onBirthDateChange(e) {
      this.form.birth_date = e.detail.value
    },
    clearBirthDate() {
      this.form.birth_date = ''
    },
    toggleTag(value) {
      const idx = this.form.scene_tags.indexOf(value)
      if (idx === -1) {
        this.form.scene_tags.push(value)
      } else {
        this.form.scene_tags.splice(idx, 1)
      }
    },
    save() {
      saveBasicInfo({
        player_id: this.form.player_id.trim(),
        birth_date: this.form.birth_date,
        scene_tags: [...this.form.scene_tags],
      })
      this.$emit('close')
    },
  },
}
</script>

<style>
.basic-info {
  padding: 32rpx;
}

.basic-info__title {
  font-size: 36rpx;
  color: var(--c-ink);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin-bottom: 40rpx;
}

.basic-info__field {
  margin-bottom: 40rpx;
}

.basic-info__label {
  display: block;
  font-size: 26rpx;
  color: var(--c-muted);
  margin-bottom: 16rpx;
}

.basic-info__input {
  border-bottom: 1rpx solid var(--c-border);
  padding: 12rpx 0;
  font-size: 30rpx;
  color: var(--c-ink);
}

.basic-info__picker-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.basic-info__picker-wrap {
  flex: 1;
}

.basic-info__picker {
  border-bottom: 1rpx solid var(--c-border);
  padding: 12rpx 0;
  font-size: 30rpx;
  color: var(--c-ink);
}

.basic-info__picker-clear {
  flex-shrink: 0;
  font-size: 26rpx;
  color: var(--c-muted);
  padding: 12rpx 8rpx;
}

.basic-info__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.basic-info__tag {
  padding: 16rpx 32rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--c-border-s);
  font-size: 26rpx;
  color: var(--c-muted);
  background: var(--c-surface);
  transition: transform 0.12s ease, opacity 0.12s ease, background 0.15s ease;
}

.basic-info__tag--active {
  border-color: transparent;
  background: var(--c-primary);
  color: #f0f5ef;
}

.basic-info__save {
  margin-top: 48rpx;
  padding: 30rpx 0;
  text-align: center;
  background: var(--c-primary);
  color: #f0f5ef;
  border-radius: 999rpx;
  font-size: 30rpx;
  letter-spacing: 0.02em;
  box-shadow: var(--sh-card);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
</style>
