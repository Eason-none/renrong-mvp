// 存储抽象层（docs/archive/spec_v1.md §2.1, §5）
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
	BREATHING_INTRO_DONE: "breathingIntroDone", // boolean，首次启动的强制呼吸引导是否已完成/跳过（breathing-entry）
};

// ---- 照片外置层（2026-07-12，待决事项 #11 落地：微信 storage 单 key 上限约 1MB）----
// conversations 里的消息图与 completionSummaries 里的 photo_thumb 都是 ≤50KB 的 base64，
// 内嵌在列表键里时约 20 张就撞单 key 上限（且同一张图在两个键里各存一份）。
// 本层在写入时把 dataURL 抽出为独立 `img:` 键（内容寻址：同图共键，消息图和缩略图自动去重），
// 读取时透明还原——业务代码看到的永远是完整 dataURL，键布局只存在于本层之下。
// 旧数据（内嵌 base64）读取时原样返回，该键下一次被写入时自然完成外置，无需一次性迁移。
// 已知边界：① 总量 10MB 上限不变（约 190 张照片，届时需淘汰策略或云存储）；
// ② img 键失去全部引用后不回收（对话/摘要目前永不删除，孤儿键只可能来自"照片被裁掉"的
//    极少数路径，可接受）；③ img 键写入失败（总量满等）时照片置 null——丢照片不丢文字。
const IMAGE_REF_PREFIX = "imgref:";
const IMAGE_KEY_PREFIX = "img:";

function isDataImage(v) {
	return typeof v === "string" && v.startsWith("data:image");
}

function isImageRef(v) {
	return typeof v === "string" && v.startsWith(IMAGE_REF_PREFIX);
}

// 内容寻址键：长度 + djb2 哈希。非安全用途，仅用于同图去重；
// 撞键需要"长度相同且哈希相同"的两张不同图，实际可忽略。
function imageKeyFor(dataUrl) {
	let h = 5381;
	for (let i = 0; i < dataUrl.length; i++) {
		h = ((h << 5) + h + dataUrl.charCodeAt(i)) >>> 0;
	}
	return `${IMAGE_KEY_PREFIX}${dataUrl.length.toString(36)}_${h.toString(36)}`;
}

function externalizeImage(dataUrl) {
	const key = imageKeyFor(dataUrl);
	try {
		if (!uni.getStorageSync(key)) {
			uni.setStorageSync(key, dataUrl);
		}
		return IMAGE_REF_PREFIX + key;
	} catch (_) {
		return null; // 图片键写不进（总量满等）：丢照片不丢文字
	}
}

function resolveImage(ref) {
	const stored = uni.getStorageSync(ref.slice(IMAGE_REF_PREFIX.length));
	return stored || null;
}

// 图片字段双形状（消息的 image/images、摘要的 photo_thumb/photo_thumbs）：
// 单图字段与数组字段都要处理，转换函数（externalize/resolve）作为参数传入以共用遍历骨架
function mapImageFields(obj, singleKey, listKey, isMatch, convert) {
	if (!obj) return obj;
	let out = obj;
	if (isMatch(obj[singleKey])) out = { ...out, [singleKey]: convert(obj[singleKey]) };
	if (Array.isArray(obj[listKey]) && obj[listKey].some(isMatch)) {
		out = { ...out, [listKey]: obj[listKey].map((v) => (isMatch(v) ? convert(v) : v)) };
	}
	return out;
}

// 两个方向共用的形状遍历（只处理两个已知键形状，其余键原样通过）
function convertImages(key, value, isMatch, convert) {
	if (!Array.isArray(value)) return value;
	if (key === KEYS.CONVERSATIONS) {
		return value.map((c) =>
			c && Array.isArray(c.messages)
				? { ...c, messages: c.messages.map((m) => mapImageFields(m, "image", "images", isMatch, convert)) }
				: c
		);
	}
	if (key === KEYS.COMPLETION_SUMMARIES) {
		return value.map((s) => mapImageFields(s, "photo_thumb", "photo_thumbs", isMatch, convert));
	}
	return value;
}

// 写入方向：dataURL → 引用
function packImages(key, value) {
	return convertImages(key, value, isDataImage, externalizeImage);
}

// 读取方向：引用 → dataURL（内嵌旧数据不是引用，原样返回）
function unpackImages(key, value) {
	return convertImages(key, value, isImageRef, resolveImage);
}

export function get(key, defaultValue) {
	const value = uni.getStorageSync(key);
	if (value === "" || value === null || value === undefined) {
		return defaultValue;
	}
	return unpackImages(key, value);
}

export function set(key, value) {
	uni.setStorageSync(key, packImages(key, value));
}

export function remove(key) {
	uni.removeStorageSync(key);
}
