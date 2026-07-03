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

if (failed) {
	console.error("\nTask3 storage 断言失败");
	process.exit(1);
} else {
	console.log("\nTask3 storage 断言全部通过");
}
