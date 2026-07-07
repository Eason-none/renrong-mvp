// reviewOrchestration 轻量运行时断言脚本（defer-review-to-first-view 时序）：
// 快照在首次点开回顾时生成，素材=点开时刻全部已归档摘要（含被动归档刚产生的）；
// 失败不落半成品、下次点开重试；棘轮保证快照只生成一次。
// 单文件直接跑：node scripts/verify-reviewOrchestration.mjs

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

const orchestration = await import("../src/state/reviewOrchestration.js");
const machine = await import("../src/state/collectionMachine.js");
const completionEvent = await import("../src/state/completionEvent.js");
const conversation = await import("../src/state/conversation.js");
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

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// 场景1：核心时序——首次点开回顾时，被动归档的摘要（含最后一条目的聊聊）进入素材
// ============================================================
memory.clear();
machine.activate("collection_001");

// 前5个条目：跳过聊天，无Conversation
for (const itemId of ["color_001", "color_004", "color_005", "color_006", "color_007"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_001" });
}

// 第6个条目：聊聊 + 主动归档（点开回顾前已有的摘要A）
const event6 = completionEvent.createCompletionEvent({ contentId: "color_008", contentType: "collection_item", collectionId: "collection_001" });
const conv6 = conversation.createConversation(event6.id);
conversation.addUserMessage(conv6.id, "做完这件事感觉挺平静的");
await conversation.archiveConversation(conv6.id, async () => "摘要A（点开回顾前就已归档）");

// 第7个条目（最后一条→100%）：聊了但尚未归档——本变更的核心用例：
// 最后一条的聊聊必须能进入回顾素材（旧时序下它永远被排除）
const event7 = completionEvent.createCompletionEvent({ contentId: "color_009", contentType: "collection_item", collectionId: "collection_001" });
const conv7 = conversation.createConversation(event7.id);
conversation.addUserMessage(conv7.id, "最后这件事让我想起了很多");

assertEqual(machine.getCollectionState("collection_001").status, "completed", "前置: collection_001已达100%完成");
assertEqual(conversation.getConversation(conv7.id).archived, false, "前置: conv7在点开回顾前仍未归档");

let genCalls = 0;
let materialAtGen = null;
const snap1 = await orchestration.ensureFirstReviewSnapshot(
	"collection_001",
	async (collectionId, summaries) => {
		genCalls++;
		materialAtGen = summaries;
		return "这是图鉴的首次回顾叙事";
	},
	async () => "摘要B（点开回顾时被动归档产生）"
);

assertTrue(!!snap1, "场景1: ensureFirstReviewSnapshot返回了生成的ReviewSnapshot");
assertEqual(genCalls, 1, "场景1: 回顾生成函数被调用且仅调用1次");
assertEqual(materialAtGen.length, 2, "场景1【核心】: 素材包含主动归档的摘要A和被动归档刚产生的摘要B");
assertTrue(materialAtGen.some((s) => s.summary_text === "摘要B（点开回顾时被动归档产生）"), "场景1【核心】: 最后一条目的聊聊摘要进入了回顾素材");
assertEqual(snap1.source_summary_ids.length, 2, "场景1: source_summary_ids记录了2条素材");
assertEqual(conversation.getConversation(conv7.id).archived, true, "场景1: conv7在生成前被被动归档");
assertEqual(machine.getCollectionState("collection_001").triggered_review_at_100pct, true, "场景1: 棘轮置true");

// 幂等：再次调用应该是no-op
const snap1Again = await orchestration.ensureFirstReviewSnapshot("collection_001", async () => {
	genCalls++;
	return "不应被调用到";
}, async () => "不应被调用到");
assertEqual(snap1Again, null, "场景1: 棘轮置位后再调用返回null（幂等no-op）");
assertEqual(genCalls, 1, "场景1: 重复调用不会再次生成");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).length, 1, "场景1: 只有1份快照");

// ============================================================
// 场景2：并发重入——同一图鉴同时触发两次，不应产生两份sequence=1快照
// ============================================================
memory.clear();
machine.activate("collection_002");
for (const itemId of ["corner_001", "corner_002", "corner_003", "corner_004", "corner_006", "corner_007", "corner_008"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_002" });
}
assertEqual(machine.getCollectionState("collection_002").status, "completed", "场景2前置: collection_002已达100%完成");

let concurrentGenCalls = 0;
const slowGen = async () => {
	concurrentGenCalls++;
	await sleep(20); // 拉宽并发窗口，模拟真实网络往返期间另一次点开插入进来
	return "并发场景下生成的回顾文案";
};

const [resultA, resultB] = await Promise.all([
	orchestration.ensureFirstReviewSnapshot("collection_002", slowGen, async () => null),
	orchestration.ensureFirstReviewSnapshot("collection_002", slowGen, async () => null),
]);

assertEqual(concurrentGenCalls, 1, "场景2【核心】: 并发触发两次，生成函数只被实际调用1次");
const oneSucceeded = (resultA !== null) !== (resultB !== null) || (resultA !== null && resultB !== null && resultA.id === resultB.id);
assertTrue(oneSucceeded, "场景2: 两次并发调用不会各自生成独立快照");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).filter((s) => s.collection_id === "collection_002").length, 1, "场景2【核心】: storage里最终只有1份快照");

// ============================================================
// 场景3：被动归档中途失败——不落快照不置棘轮，下次点开整体重试自愈
// ============================================================
memory.clear();
machine.activate("collection_003");
for (const itemId of ["idea_004", "idea_005", "idea_006", "idea_007", "idea_008", "idea_009", "idea_010"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_003" });
}
const eventA = completionEvent.createCompletionEvent({ contentId: "idea_011", contentType: "collection_item", collectionId: "collection_003" });
const convA = conversation.createConversation(eventA.id);
conversation.addUserMessage(convA.id, "对话A的内容");
const eventB = completionEvent.createCompletionEvent({ contentId: "idea_012", contentType: "collection_item", collectionId: "collection_003" });
const convB = conversation.createConversation(eventB.id);
conversation.addUserMessage(convB.id, "对话B的内容（第一次归档会失败）");

assertEqual(machine.getCollectionState("collection_003").status, "completed", "场景3前置: collection_003已达100%完成");

let scene3GenCalls = 0;
let firstAttemptThrew = false;
try {
	await orchestration.ensureFirstReviewSnapshot(
		"collection_003",
		async () => {
			scene3GenCalls++;
			return "不应在第一次尝试中被生成";
		},
		async (conv) => {
			if (conv.id === convB.id) {
				throw new Error("模拟摘要生成API调用失败");
			}
			return "对话A的摘要";
		}
	);
} catch {
	firstAttemptThrew = true;
}

assertTrue(firstAttemptThrew, "场景3: 归档convB失败时异常向外传播");
assertEqual(scene3GenCalls, 0, "场景3【核心】: 归档失败发生在生成之前，回顾生成函数完全没被调用");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).filter((s) => s.collection_id === "collection_003").length, 0, "场景3【核心】: 失败时没有落任何快照（不留半成品）");
assertEqual(conversation.getConversation(convA.id).archived, true, "场景3: 失败前已成功归档的convA保持归档（幂等，重试不重复）");
assertEqual(conversation.getConversation(convB.id).archived, false, "场景3: 失败的convB仍未归档");
assertEqual(machine.getCollectionState("collection_003").triggered_review_at_100pct, false, "场景3: 棘轮未置位");

// 重试（=用户下次点开回顾）：这次convB归档成功，素材应包含A、B两条摘要
let retryMaterial = null;
const snap3 = await orchestration.ensureFirstReviewSnapshot(
	"collection_003",
	async (collectionId, summaries) => {
		scene3GenCalls++;
		retryMaterial = summaries;
		return "重试成功生成的回顾文案";
	},
	async () => "对话B的摘要（重试成功）"
);

assertTrue(!!snap3, "场景3: 重试成功返回快照");
assertEqual(scene3GenCalls, 1, "场景3: 重试时生成函数被调用1次");
assertEqual(retryMaterial.length, 2, "场景3【核心】: 重试后的素材包含A、B两条摘要（自愈且完整）");
assertEqual(conversation.getConversation(convB.id).archived, true, "场景3: 重试后convB归档成功");
assertEqual(machine.getCollectionState("collection_003").triggered_review_at_100pct, true, "场景3: 重试成功后棘轮置true");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).filter((s) => s.collection_id === "collection_003").length, 1, "场景3: 全程只产生1份快照");

// ============================================================
// 场景4：回归（2026-07-06真机bug的变体）——回顾生成期间新开的对话不被归档、不进素材
// ============================================================
memory.clear();
machine.activate("collection_001");
for (const itemId of ["color_001", "color_004", "color_005", "color_006", "color_007", "color_008"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_001" });
}
const finalEvent = completionEvent.createCompletionEvent({ contentId: "color_009", contentType: "collection_item", collectionId: "collection_001" });
assertEqual(machine.getCollectionState("collection_001").status, "completed", "场景4前置: 达到100%");

let midGenConv = null;
let midGenSummaryCalls = 0;
const snap4 = await orchestration.ensureFirstReviewSnapshot(
	"collection_001",
	async () => {
		// 模拟：叙事还在生成中（数秒API往返），用户返回图鉴对最后一条点了"聊聊"
		midGenConv = conversation.createConversation(finalEvent.id);
		conversation.addUserMessage(midGenConv.id, "生成期间用户正在聊的对话");
		await sleep(10);
		return "场景4的回顾文案";
	},
	async () => {
		midGenSummaryCalls++;
		return "被动归档摘要";
	}
);

assertEqual(conversation.getConversation(midGenConv.id).archived, false, "场景4【核心】: 生成期间新建的对话没有被被动归档");
assertEqual(midGenSummaryCalls, 0, "场景4: 名单入口定格，没有为新对话触发摘要调用");
assertEqual(snap4.source_summary_ids.length, 0, "场景4: 新对话的内容没有混进本次快照素材");
let sendStillWorks = true;
try {
	conversation.addUserMessage(midGenConv.id, "生成完之后用户还能继续发消息");
} catch {
	sendStillWorks = false;
}
assertTrue(sendStillWorks, "场景4【核心】: 生成完成后用户仍能继续发送消息");

// ============================================================
// 场景5：旧中间态收敛——已有sequence=1快照但棘轮未置位（旧时序遗留/步骤4前被打断），
// 下次点开只补做归档+棘轮，快照内容不被改写
// ============================================================
memory.clear();
machine.activate("collection_002");
for (const itemId of ["corner_001", "corner_002", "corner_003", "corner_004", "corner_006", "corner_007"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_002" });
}
const lastEvent = completionEvent.createCompletionEvent({ contentId: "corner_008", contentType: "collection_item", collectionId: "collection_002" });
const lingerConv = conversation.createConversation(lastEvent.id);
conversation.addUserMessage(lingerConv.id, "遗留的未归档对话");
set(KEYS.REVIEW_SNAPSHOTS, [{
	id: "rs_legacy", collection_id: "collection_002", sequence: 1,
	generated_at: Date.now(), text: "旧时序遗留的快照文本", source_summary_ids: [],
}]);
assertEqual(machine.getCollectionState("collection_002").triggered_review_at_100pct, false, "场景5前置: 棘轮未置位的旧中间态");

let scene5GenCalls = 0;
const snap5 = await orchestration.ensureFirstReviewSnapshot(
	"collection_002",
	async () => {
		scene5GenCalls++;
		return "不应被重新生成";
	},
	async () => "遗留对话的摘要"
);

assertEqual(scene5GenCalls, 0, "场景5【核心】: 已有快照时不重新生成");
assertEqual(snap5.text, "旧时序遗留的快照文本", "场景5: 返回的是原有快照，内容未被改写");
assertEqual(conversation.getConversation(lingerConv.id).archived, true, "场景5: 遗留未归档对话被补做归档");
assertEqual(machine.getCollectionState("collection_002").triggered_review_at_100pct, true, "场景5: 棘轮补置位，中间态收敛");

if (failed) {
	console.error("\nreviewOrchestration 断言失败");
	process.exit(1);
} else {
	console.log("\nreviewOrchestration 断言全部通过");
}
