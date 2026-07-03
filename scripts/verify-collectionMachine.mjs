// v8 图鉴状态机断言脚本：覆盖三态（locked/active/completed）+ 激活位上限3 + 棘轮不可逆。
// 单文件直接跑：node scripts/verify-collectionMachine.mjs

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

const machine = await import("../src/state/collectionMachine.js");
const { KEYS, get, set } = await import("../src/state/storage.js");

let failed = false;

function assertEqual(actual, expected, label) {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a !== b) {
		failed = true;
		console.error(`FAIL: ${label}\n  expected: ${b}\n  actual:   ${a}`);
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

const C1 = "collection_001"; // 7个条目
const C2 = "collection_002";
const C3 = "collection_003";
const ITEMS = ["color_001", "color_004", "color_005", "color_006", "color_007", "color_008", "color_009"];

function addCompletionEvent(collectionId, contentId) {
	const events = get(KEYS.COMPLETION_EVENTS, []);
	events.push({
		id: `ce_${contentId}_${Date.now()}`,
		content_id: contentId,
		content_type: "collection_item",
		collection_id: collectionId,
		completed_at: Date.now(),
	});
	set(KEYS.COMPLETION_EVENTS, events);
}

// --- 基础：locked 默认态 ---
memory.clear();
assertEqual(machine.getCollectionState(C1).status, "locked", "初始状态为 locked");
assertEqual(machine.countActiveCollections(), 0, "初始激活位计数为 0");

// --- activate：locked -> active ---
machine.activate(C1);
assertEqual(machine.getCollectionState(C1).status, "active", "activate 后状态为 active");
assertEqual(machine.countActiveCollections(), 1, "activate 后激活位计数为 1");
assertThrows(() => machine.activate(C1), "active 状态下再次 activate 应抛出");

// --- putDown：active -> locked ---
machine.putDown(C1);
assertEqual(machine.getCollectionState(C1).status, "locked", "putDown 后状态回到 locked");
assertEqual(machine.countActiveCollections(), 0, "putDown 后激活位计数回到 0");
assertThrows(() => machine.putDown(C1), "locked 状态下 putDown 应抛出");

// --- 激活位上限 3 ---
memory.clear();
machine.activate(C1);
machine.activate(C2);
machine.activate(C3);
assertEqual(machine.countActiveCollections(), 3, "三个图鉴同时 active，激活位满");
assertThrows(() => machine.activate("collection_004"), "激活位满时再激活第4个应抛出");

// --- completed 不占激活位：完成 C1 后可激活 collection_004 ---
ITEMS.forEach((id) => addCompletionEvent(C1, id));
machine.recordCollectionItemCompletion(C1);
assertEqual(machine.getCollectionState(C1).status, "completed", "7/7 完成后状态为 completed");
assertEqual(machine.countActiveCollections(), 2, "completed 不占激活位（剩2个active）");
machine.activate("collection_004");
assertEqual(machine.countActiveCollections(), 3, "completed 释放后可再激活第3个");

// --- completed 无退出路径 ---
assertThrows(() => machine.putDown(C1), "completed 状态下 putDown 应抛出");

// --- completion_pct 计算 ---
memory.clear();
machine.activate(C1);
addCompletionEvent(C1, "color_001");
assertEqual(machine.getCompletionPct(C1), 1 / 7, "1/7 完成 pct 正确");
addCompletionEvent(C1, "color_004");
addCompletionEvent(C1, "color_005");
addCompletionEvent(C1, "color_006");
assertEqual(machine.getCompletionPct(C1), 4 / 7, "4/7 完成 pct 正确");

// 重复完成同一条目不增加分子
addCompletionEvent(C1, "color_006");
assertEqual(machine.getCompletionPct(C1), 4 / 7, "重复完成同一条目 pct 不变（distinct 语义）");

// --- recordCollectionItemCompletion：active -> completed 自动推进 ---
memory.clear();
machine.activate(C1);
ITEMS.forEach((id) => addCompletionEvent(C1, id));
let state = machine.recordCollectionItemCompletion(C1);
assertEqual(state.status, "completed", "100% 时 recordCollectionItemCompletion 推进到 completed");

// completed 下再次调用是幂等 no-op
state = machine.recordCollectionItemCompletion(C1);
assertEqual(state.status, "completed", "completed 下 recordCollectionItemCompletion 是幂等 no-op");

// --- locked 下 recordCollectionItemCompletion 应抛出 ---
memory.clear();
assertThrows(() => machine.recordCollectionItemCompletion(C1), "locked 下 recordCollectionItemCompletion 应抛出");

// --- triggered_review_at_100pct 棘轮 ---
memory.clear();
machine.activate(C1);
ITEMS.forEach((id) => addCompletionEvent(C1, id));
machine.recordCollectionItemCompletion(C1);
assertEqual(machine.markReviewTriggered(C1), true, "completed 时 markReviewTriggered 首次返回 true");
assertEqual(machine.getCollectionState(C1).triggered_review_at_100pct, true, "棘轮置 true 后持久化");
assertEqual(machine.markReviewTriggered(C1), false, "棘轮已置 true 后再次调用返回 false（不可逆）");

// markReviewTriggered 在非 completed 状态下返回 false
memory.clear();
machine.activate(C2);
assertEqual(machine.markReviewTriggered(C2), false, "active 状态下 markReviewTriggered 返回 false");

// --- 未知 collectionId 的 computeCompletionPct 应抛出 ---
memory.clear();
assertThrows(
	() => machine.getCompletionPct("collection_不存在"),
	"未知 collectionId 应抛出，而不是静默返回 0"
);

// --- putDown 保留完成事件（条目绿色保留） ---
memory.clear();
machine.activate(C1);
addCompletionEvent(C1, "color_001");
addCompletionEvent(C1, "color_004");
assertEqual(machine.getCompletionPct(C1), 2 / 7, "putDown 前 pct 为 2/7");
machine.putDown(C1);
assertEqual(machine.getCollectionState(C1).status, "locked", "putDown 后状态回到 locked");
assertEqual(machine.getCompletionPct(C1), 2 / 7, "putDown 后 completionEvent 仍保留，pct 不变");
// 重新激活后完成事件依然有效
machine.activate(C1);
assertEqual(machine.getCompletionPct(C1), 2 / 7, "重新 activate 后已完成条目仍计数");

if (failed) {
	console.error("\nv8 collectionMachine 断言失败");
	process.exit(1);
} else {
	console.log("\nv8 collectionMachine 断言全部通过");
}
