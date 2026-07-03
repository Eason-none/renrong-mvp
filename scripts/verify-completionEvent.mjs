// Task 8 轻量运行时断言脚本：覆盖 spec §3.2 AC1-AC3。
// 单文件直接跑：node scripts/verify-completionEvent.mjs
// mock uni 全局对象，写法延续 verify-storage.mjs。

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

const completionEvent = await import("../src/state/completionEvent.js");
const pushPool = await import("../src/state/pushPool.js");
const machine = await import("../src/state/collectionMachine.js");
const { KEYS, get } = await import("../src/state/storage.js");

let failed = false;

function assertEqual(actual, expected, label) {
	if (actual !== expected) {
		failed = true;
		console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

function assertTrue(condition, label) {
	if (!condition) {
		failed = true;
		console.error(`FAIL: ${label}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

function assertThrows(fn, label) {
	try {
		fn();
		failed = true;
		console.error(`FAIL: ${label}（未抛出异常）`);
	} catch {
		console.log(`PASS: ${label}`);
	}
}

// --- AC1：点击"做完啦"立即创建CompletionEvent，不需要验证/评分 ---
memory.clear();
const pushEvent = completionEvent.createCompletionEvent({ contentId: "push_001", contentType: "push" });
assertTrue(!!pushEvent.id, "AC1: push类型事件创建后有id");
assertEqual(pushEvent.content_id, "push_001", "AC1: push事件content_id正确");
assertEqual(pushEvent.content_type, "push", "AC1: push事件content_type正确");
const storedEvents = get(KEYS.COMPLETION_EVENTS, []);
assertEqual(storedEvents.length, 1, "AC1: 事件已持久化到storage");

// AC1副作用：push类型应驱动Task5的GlobalDoneSet
assertTrue(pushPool.getGlobalDoneSet().has("push_001"), "AC1: push类型事件创建后content_id进入GlobalDoneSet");

// AC1副作用：collection_item类型应驱动Task6的状态机（即使collection处于locked也应报错——
// 这是"调用方必须先解锁才能产生完成事件"的既有约束，不是本模块新增的限制）
assertThrows(
	() => completionEvent.createCompletionEvent({ contentId: "color_001", contentType: "collection_item", collectionId: "collection_001" }),
	"AC1: 对locked图鉴创建collection_item事件应抛出异常（图鉴状态机既有约束）"
);
// 回归：被拒绝的完成事件不应留下"半写入"的脏数据——校验失败时事件不能进入storage。
assertEqual(get(KEYS.COMPLETION_EVENTS, []).length, 1, "回归: locked图鉴被拒绝的完成事件不应被持久化（仍只有此前的push事件1条）");

machine.unlockInitial("collection_001");
const collectionEvent = completionEvent.createCompletionEvent({
	contentId: "color_001",
	contentType: "collection_item",
	collectionId: "collection_001",
});
assertEqual(collectionEvent.collection_id, "collection_001", "AC1: collection_item事件collection_id正确");
assertEqual(machine.getCollectionState("collection_001").status, "in_progress", "AC1: 创建collection_item事件驱动状态机进入in_progress");

// 校验：非法contentType / collection_item缺collectionId
assertThrows(
	() => completionEvent.createCompletionEvent({ contentId: "x", contentType: "unknown" }),
	"校验: 非法contentType应抛出异常"
);
assertThrows(
	() => completionEvent.createCompletionEvent({ contentId: "x", contentType: "collection_item" }),
	"校验: collection_item缺collectionId应抛出异常"
);

// --- AC2：创建成功后，统一固定邀请文案存在且非空，全产品一句（不分内容类型） ---
assertTrue(typeof completionEvent.COMPLETION_INVITE_TEXT === "string" && completionEvent.COMPLETION_INVITE_TEXT.length > 0, "AC2: 邀请文案是非空字符串");

// --- AC3：跳过聊天 -> 不创建Conversation ---
const conversations = get(KEYS.CONVERSATIONS, []);
assertEqual(conversations.length, 0, "AC3: createCompletionEvent本身不会创建任何Conversation");

if (failed) {
	console.error("\nTask8 completionEvent 断言失败");
	process.exit(1);
} else {
	console.log("\nTask8 completionEvent 断言全部通过");
}
