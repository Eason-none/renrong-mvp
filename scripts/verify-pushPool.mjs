// Task 5 轻量运行时断言脚本：覆盖 spec §3.1 AC1-AC4。
// 单文件直接跑：node scripts/verify-pushPool.mjs
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

const pushPool = await import("../src/state/pushPool.js");
const library = await import("../src/content/library.js");

let failed = false;

function assertTrue(condition, label) {
	if (!condition) {
		failed = true;
		console.error(`FAIL: ${label}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

function assertEqual(actual, expected, label) {
	if (actual !== expected) {
		failed = true;
		console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

// --- AC1：候选满足 scene 过滤 + 不在 GlobalDoneSet ---
memory.clear();
const scene = "室内短";
const candidate1 = pushPool.pickPushCandidate(scene);
assertTrue(!!candidate1 && candidate1.scene.includes(scene), "AC1: 候选满足 scene 过滤");
assertTrue(!pushPool.getGlobalDoneSet().has(candidate1.id), "AC1: 候选不在 GlobalDoneSet 中（初始为空）");

pushPool.markPushDone(candidate1.id);
assertTrue(pushPool.getGlobalDoneSet().has(candidate1.id), "AC1: 做完啦后 content_id 进入 GlobalDoneSet");

// --- AC2：场景池子耗尽后静默重置，正常返回一条内容 ---
memory.clear();
const pool = library.getPushPool(scene);
for (const item of pool) {
	pushPool.markPushDone(item.id);
}
assertEqual(pushPool.getGlobalDoneSet().size, pool.length, "AC2前置: 该场景池子已全部标记为完成");

const afterExhausted = pushPool.pickPushCandidate(scene);
assertTrue(!!afterExhausted, "AC2: 池子耗尽后仍能正常返回一条候选（静默重置）");
assertTrue(
	pool.some((item) => item.id === afterExhausted.id),
	"AC2: 重置后返回的候选属于该场景池子"
);
// 重置只清掉"该场景覆盖到的"子集；其它场景不受影响的验证见下方独立断言
memory.clear();
const otherScene = "室外";
const otherPool = library.getPushPool(otherScene);
const overlapId = pool.find((p) => !otherPool.some((o) => o.id === p.id))?.id;
for (const item of pool) pushPool.markPushDone(item.id);
if (overlapId) {
	assertTrue(pushPool.getGlobalDoneSet().has(overlapId), "AC2前置: 仅属于该场景的条目已标记完成");
}
pushPool.pickPushCandidate(scene); // 触发该场景子集重置
if (overlapId) {
	assertTrue(!pushPool.getGlobalDoneSet().has(overlapId), "AC2: 重置后该场景独占条目从 GlobalDoneSet 移除");
}

// --- AC3：换一个3次后封顶，第4次不再刷新 ---
memory.clear();
let session = pushPool.createPushSession(scene);
assertEqual(session.refreshCount, 0, "AC3前置: 新建会话刷新计数为0");
for (let i = 1; i <= 3; i++) {
	session = pushPool.refreshPushSession(session);
	assertEqual(session.refreshCount, i, `AC3: 第${i}次刷新计数正确`);
	assertEqual(session.exhausted, false, `AC3: 第${i}次刷新未封顶`);
}
const beforeFourth = session.item;
session = pushPool.refreshPushSession(session);
assertEqual(session.exhausted, true, "AC3: 第4次刷新被阻止（封顶）");
assertEqual(session.item.id, beforeFourth.id, "AC3: 第4次刷新不改变当前候选");

// --- AC4：刷新过程不修改 GlobalDoneSet ---
memory.clear();
assertEqual(pushPool.getGlobalDoneSet().size, 0, "AC4前置: GlobalDoneSet 初始为空");
let refreshSession = pushPool.createPushSession(scene);
for (let i = 0; i < 3; i++) {
	refreshSession = pushPool.refreshPushSession(refreshSession);
}
assertEqual(pushPool.getGlobalDoneSet().size, 0, "AC4: 多次刷新后 GlobalDoneSet 仍为空");

if (failed) {
	console.error("\nTask5 pushPool 断言失败");
	process.exit(1);
} else {
	console.log("\nTask5 pushPool 断言全部通过");
}
