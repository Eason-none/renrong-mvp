// 存储抽象层（spec_v1.md §2.1, §5）
// 业务代码统一通过这层读写，不直接碰 localStorage / wx.setStorageSync。
// `uni` 由 uni-app 运行时注入为全局对象；Node 环境下跑断言脚本时由调用方自行 mock。

export const KEYS = {
	COLLECTION_UNLOCK_STATES: "collectionUnlockStates", // CollectionUnlockState[]，按 collection_id 存为 map
	COMPLETION_EVENTS: "completionEvents", // CompletionEvent[]
	CONVERSATIONS: "conversations", // Conversation[]
	COMPLETION_SUMMARIES: "completionSummaries", // CompletionSummary[]
	REVIEW_SNAPSHOTS: "reviewSnapshots", // ReviewSnapshot[]
	// pushGlobalDoneSet 键已随推送层删除（remove-pushflow）；用户本地残留的旧键无害，不做清理
	BASIC_INFO: "basicInfo", // BasicInfo: { player_id, birth_date, scene_tags[] }
	DAILY_TASK_POOL: "dailyTaskPool", // DailyTask[]（已领取未完成的每日任务）
	DAILY_CARD_SHOWN_DATE: "dailyCardShownDate", // YYYY-MM-DD，防止同天重复弹出日推卡片
	DAILY_COMPLETED_TASKS: "dailyCompletedTasks", // 已完成的每日任务快照，含 completedDate + completionEventId
	ONBOARDING_HINTS_SEEN: "onboardingHintsSeen", // string[]，首次引导气泡的已读 hintKey 集合
	ANALYTICS_ANON_ID: "analyticsAnonId", // string，本地随机 UUID 上报标识——与用户任何输入/微信身份无关（spec: analytics-events）
	ANALYTICS_QUEUE: "analyticsQueue", // 上报失败事件的有界待发队列（上限 200，超限丢最旧）
};

export function get(key, defaultValue) {
	const value = uni.getStorageSync(key);
	if (value === "" || value === null || value === undefined) {
		return defaultValue;
	}
	return value;
}

export function set(key, value) {
	uni.setStorageSync(key, value);
}

export function remove(key) {
	uni.removeStorageSync(key);
}
