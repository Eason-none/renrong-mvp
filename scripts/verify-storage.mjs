// Task 3 轻量运行时断言脚本：对 storage.js 覆盖的全部6类实体做一次写入→读出比对。
// 单文件直接跑：node scripts/verify-storage.mjs
// mock uni 全局对象（真实 uni-app 运行时由框架注入，这里用 Map 模拟同等语义）。

const memory = new Map();
globalThis.uni = {
	setStorageSync(key, value) {
		memory.set(key, value);
	},
	getStorageSync(key) {
		return memory.has(key) ? memory.get(key) : "";
	},
	removeStorageSync(key) {
		memory.delete(key);
	},
};

const { KEYS, get, set, remove } = await import("../src/state/storage.js");

let failed = false;

function assertDeepEqual(actual, expected, label) {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a !== b) {
		failed = true;
		console.error(`FAIL: ${label}\n  expected: ${b}\n  actual:   ${a}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

const samples = {
	[KEYS.UNLOCK_SLOT_BALANCE]: { count: 2 },
	[KEYS.COLLECTION_UNLOCK_STATES]: {
		collection_001: {
			collection_id: "collection_001",
			status: "in_progress",
			unlocked_at: 1719200000000,
			granted_slot_at_50pct: false,
			triggered_review_at_100pct: false,
		},
	},
	[KEYS.COMPLETION_EVENTS]: [
		{
			id: "ce_1",
			content_id: "push_001",
			content_type: "push",
			completed_at: 1719200000000,
		},
	],
	[KEYS.CONVERSATIONS]: [
		{
			id: "conv_1",
			completion_event_id: "ce_1",
			messages: [{ role: "user", content: "今天天气不错" }],
			archived: false,
			user_message_count: 1,
		},
	],
	[KEYS.COMPLETION_SUMMARIES]: [
		{
			id: "cs_1",
			content_id: "push_001",
			completed_at: 1719200000000,
			summary_text: null,
		},
	],
	[KEYS.REVIEW_SNAPSHOTS]: [
		{
			id: "rs_1",
			collection_id: "collection_001",
			sequence: 1,
			generated_at: 1719200000000,
			text: "这是一段回顾文案",
			source_summary_ids: ["cs_1"],
		},
	],
};

// 1. 写入前读取默认值应为传入的 defaultValue
for (const key of Object.values(KEYS)) {
	assertDeepEqual(get(key, "__default__"), "__default__", `${key} 写入前读取返回 defaultValue`);
}

// 2. 写入后读出，结构应与写入前一致
for (const [key, value] of Object.entries(samples)) {
	set(key, value);
	assertDeepEqual(get(key), value, `${key} 写入→读出结构一致`);
}

// 3. remove 之后应恢复成 defaultValue
for (const key of Object.values(KEYS)) {
	remove(key);
	assertDeepEqual(get(key, "__default__"), "__default__", `${key} remove 后恢复 defaultValue`);
}

// 4. 照片外置层（2026-07-12 待决#11）：写入抽 img 键、读取透明还原、双键同图去重、旧数据兼容
const PHOTO = "data:image/png;base64," + "A".repeat(2000);
const convsWithPhoto = [
	{
		id: "conv_p",
		completion_event_id: "ce_p",
		messages: [
			{ role: "user", content: "拍了张照片", image: PHOTO },
			{ role: "assistant", content: "看到了", image: null },
		],
		archived: false,
		user_message_count: 1,
	},
];
const summariesWithPhoto = [{ id: "cs_p", content_id: "dt-002", completed_at: 1719200000000, summary_text: "一页", photo_thumb: PHOTO }];

set(KEYS.CONVERSATIONS, convsWithPhoto);
set(KEYS.COMPLETION_SUMMARIES, summariesWithPhoto);

const rawConvs = memory.get(KEYS.CONVERSATIONS);
const rawSummaries = memory.get(KEYS.COMPLETION_SUMMARIES);
assertDeepEqual(
	typeof rawConvs[0].messages[0].image === "string" && rawConvs[0].messages[0].image.startsWith("imgref:"),
	true,
	"照片外置: conversations 主键里存的是引用而非 base64"
);
assertDeepEqual(rawSummaries[0].photo_thumb.startsWith("imgref:"), true, "照片外置: completionSummaries 主键里存的是引用");
assertDeepEqual(rawConvs[0].messages[0].image, rawSummaries[0].photo_thumb, "照片外置: 同一张图在两个键里指向同一 img 键（去重）");
assertDeepEqual(memory.get(rawConvs[0].messages[0].image.slice("imgref:".length)), PHOTO, "照片外置: img 键持有原始 dataURL");
assertDeepEqual(get(KEYS.CONVERSATIONS), convsWithPhoto, "照片外置: conversations 读回与写入等值（透明还原）");
assertDeepEqual(get(KEYS.COMPLETION_SUMMARIES), summariesWithPhoto, "照片外置: completionSummaries 读回与写入等值");

// 旧数据兼容：直接向底层塞"内嵌 base64"的旧形状，get 应原样返回
memory.set(KEYS.CONVERSATIONS, convsWithPhoto);
assertDeepEqual(get(KEYS.CONVERSATIONS), convsWithPhoto, "照片外置: 旧内嵌 base64 数据读取原样兼容");

// img 键写入失败（模拟总量满）：照片置 null，文字不丢
memory.delete(KEYS.CONVERSATIONS);
const realSet = globalThis.uni.setStorageSync;
globalThis.uni.setStorageSync = (key, value) => {
	if (key.startsWith("img:")) throw new Error("storage full");
	memory.set(key, value);
};
set(KEYS.CONVERSATIONS, [{ ...convsWithPhoto[0], messages: [{ role: "user", content: "还有文字", image: "data:image/png;base64,ZZZZ" }] }]);
globalThis.uni.setStorageSync = realSet;
const degraded = get(KEYS.CONVERSATIONS);
assertDeepEqual(degraded[0].messages[0].image, null, "照片外置: img 键写满时照片置 null");
assertDeepEqual(degraded[0].messages[0].content, "还有文字", "照片外置: 丢照片不丢文字");

remove(KEYS.CONVERSATIONS);
remove(KEYS.COMPLETION_SUMMARIES);

// 5. 多图消息（images 数组，2026-07-13 一次可选多张）：数组内每张各自外置、读取透明还原
const PHOTO2 = "data:image/png;base64," + "B".repeat(2000);
const convsMulti = [
	{
		id: "conv_m",
		completion_event_id: "ce_m",
		messages: [{ role: "user", content: "拍了两张", images: [PHOTO, PHOTO2] }],
		archived: false,
		user_message_count: 1,
	},
];
set(KEYS.CONVERSATIONS, convsMulti);
const rawMulti = memory.get(KEYS.CONVERSATIONS);
assertDeepEqual(
	rawMulti[0].messages[0].images.every((v) => typeof v === "string" && v.startsWith("imgref:")),
	true,
	"多图外置: images 数组每张都存为引用"
);
assertDeepEqual(get(KEYS.CONVERSATIONS), convsMulti, "多图外置: 读回与写入等值（透明还原）");
remove(KEYS.CONVERSATIONS);

if (failed) {
	console.error("\nTask3 storage 断言失败");
	process.exit(1);
} else {
	console.log("\nTask3 storage 断言全部通过");
}
