## 1. 存储与内容库基础

- [x] 1.1 在 `src/state/storage.js` 的 KEYS 中新增 `BASIC_INFO`、`DAILY_TASK_POOL`、`DAILY_CARD_SHOWN_DATE` 三个存储键
- [x] 1.2 创建 `src/state/basicInfo.js`：实现 `getBasicInfo()`、`saveBasicInfo(patch)` 两个函数，管理玩家ID/出生日期/scene_tags的读写
- [x] 1.3 创建 `src/state/dailyTaskPool.js`：实现 `getUncompletedTasks()`、`claimTask(task)`、`completeTask(taskId)` 三个函数
- [x] 1.4 创建 `src/content/daily_tasks.json`：初始内容库文件，包含10-15条占位任务条目，每条含 id/title/hook/time/instructions/scene_tags，覆盖 general 标签及至少3个具体场景标签
- [x] 1.5 在 `src/content/library.js` 中新增 `getDailyTaskCandidates(sceneTags)` 函数：按场景标签交集过滤+随机抽3条，general补足逻辑，排除已在DailyTaskPool中的条目

## 2. 基本信息设置

- [x] 2.1 创建 `src/components/BasicInfoSettings.vue`：包含玩家ID输入框、出生日期选择器（uni-app `picker` mode=date）、三维度场景偏好多选（工位/教室/自己的房间；地铁公交/步行骑行/私家车；便利店/食堂/健身房/菜市场）
- [x] 2.2 `BasicInfoSettings.vue` 加载时从 `getBasicInfo()` 读取现有值回填，保存时调用 `saveBasicInfo(patch)`，emit `close` 关闭页面
- [x] 2.3 修改 `src/components/NavBar.vue`：设置弹层列表项增加「基本信息」排在最上方，点击打开 BasicInfoSettings（弹层内切换，参考隐私政策的切换模式）

## 3. 外部 API 封装

- [x] 3.1 创建 `src/api/location.js`：封装 `wx.getLocation`，返回城市名（逆地理编码或直接取城市字段）；授权失败返回 `null`，仅 mp-weixin 生效，H5 直接返回 `null`
- [x] 3.2 创建 `src/api/weather.js`：封装天气 API 调用（读取 `VITE_WEATHER_API_KEY` 环境变量），入参城市名，返回天气描述字符串；key 未配置或调用失败返回 `null`

## 4. 日推卡片

- [x] 4.1 创建 `src/components/DailyCard.vue`：全屏遮罩卡片组件，接收 props：`playerInfo`（BasicInfo数据）、`city`、`weather`、`candidates`（3条候选任务对象数组）；emit `claim(task)`、`close`、`go-basic-info`
- [x] 4.2 `DailyCard.vue` 渲染逻辑：玩家信息区（ID/存活天数/日期/城市/天气，各字段按降级规则处理）、固定提醒文案、三个候选任务卡片（标题+hook+领取按钮）、BasicInfo不完整时底部显示引导入口
- [x] 4.3 候选任务领取交互：点击「领取」调用 `claimTask(task)` 写入 DailyTaskPool，按钮变为"已领取"不可点；同一候选若已在池中则直接显示"已领取"
- [x] 4.4 在 `src/pages/index/index.vue` 中接入日推卡片触发逻辑：页面 `onShow` 时比对 `DailyCardShownDate` 与当日日期，若不同则异步获取 location + weather + candidates 后展示 DailyCard，同时更新 `DailyCardShownDate`

## 5. 已领取任务区块（「当下」tab）

- [x] 5.1 创建 `src/components/DailyTaskItem.vue`：单条已领取任务的卡片展示组件，显示 title + hook，点击整体区域 emit `select(task)`
- [x] 5.2 在 `src/pages/index/index.vue` 中新增「我的日常任务」区块：读取 `getUncompletedTasks()`，列表为空时不渲染区块，非空时在现有主流程上方或下方展示任务列表
- [x] 5.3 点击已领取任务进入完成流程：在 `index.vue` 中处理 `select(task)` 事件，切换到任务卡片视图（task 的 title/time/instructions），展示「做完啦」按钮

## 6. 每日任务完成流程

- [x] 6.1 在 `index.vue` 中实现每日任务的做完啦→聊聊邀请→对话/跳过流程，结构复用 PushFlow.vue 的做完啦/邀请/ChatView 段，但来源标记为 `content_type: 'daily_task'`
- [x] 6.2 点击「做完啦」时调用 `completeTask(taskId)` 将任务从 DailyTaskPool 未完成列表中移除，同时创建 CompletionEvent（contentType: 'daily_task'，collectionId: null）
- [x] 6.3 完成后聊聊/跳过流程与主线推送保持一致（ChatView 复用，跳过直接返回「我的日常任务」列表视图）

## 7. 验收

- [x] 7.1 mp-weixin build 通过，日推卡片首次打开正常出现，当天再次打开不重复出现
- [x] 7.2 BasicInfo 存入读出正确（Storage面板核查）；场景偏好多选保存后次日推送任务与偏好匹配
- [x] 7.3 领取任务后写入 DailyTaskPool，出现在「我的日常任务」，做完啦后从列表消失
- [x] 7.4 已领取任务跨天仍保留（次日打开仍可在「我的日常任务」找到）
- [x] 7.5 设置→基本信息入口可正常打开和保存
- [x] 7.6 GPS拒绝/天气API无key时卡片正常展示，城市和天气显示"未知"
