// Task 10 轻量运行时断言脚本：覆盖 spec §2.4、§3.5 AC1，
// 重点是交接文档标注的"最容易被悄悄破坏的一条逻辑"——首次回顾的素材快照必须在被动归档之前固定。
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
const { KEYS, get } = await import("../src/state/storage.js");

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
// 场景1：核心顺序验证——图鉴100%触发时仍有未归档对话（spec §6 验证4 对应场景）
// ============================================================
memory.clear();
machine.activate("collection_001");

// 前5个条目：跳过聊天，无Conversation
for (const itemId of ["color_001", "color_004", "color_005", "color_006", "color_007"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_001" });
}

// 第6个条目：聊聊 + 主动归档（这条摘要应该被首次回顾用到）
const event6 = completionEvent.createCompletionEvent({ contentId: "color_008", contentType: "collection_item", collectionId: "collection_001" });
const conv6 = conversation.createConversation(event6.id);
conversation.addUserMessage(conv6.id, "做完这件事感觉挺平静的");
await conversation.archiveConversation(conv6.id, async () => "摘要A（在100%触发前就已归档）");

// 第7个条目：聊聊但不归档——这次完成会让图鉴变成100%，触发回顾编排
const event7 = completionEvent.createCompletionEvent({ contentId: "color_009", contentType: "collection_item", collectionId: "collection_001" });
const conv7 = conversation.createConversation(event7.id);
conversation.addUserMessage(conv7.id, "这条对话在100%触发的那一刻还没归档");

assertEqual(machine.getCollectionState("collection_001").status, "completed", "前置: collection_001已达100%完成");
assertEqual(conversation.getConversation(conv7.id).archived, false, "前置: conv7在触发回顾编排前仍未归档");

let reviewGenCallCount = 0;
let capturedSummariesAtGenTime = null;
const result1 = await orchestration.triggerReviewOnCompletion(
	"collection_001",
	async (collectionId, summaries) => {
		reviewGenCallCount++;
		capturedSummariesAtGenTime = summaries;
		return "这是图鉴的首次回顾叙事";
	},
	async () => "摘要B（被动归档产生，晚于本次回顾快照）"
);

assertTrue(!!result1, "场景1: triggerReviewOnCompletion返回了生成的ReviewSnapshot");
assertEqual(reviewGenCallCount, 1, "场景1: 回顾生成函数被调用且仅调用1次");

// 核心断言：传给生成函数的素材快照里，只应该包含conv6(已归档)产生的摘要，不应该包含conv7(当时未归档)的
assertEqual(capturedSummariesAtGenTime.length, 1, "场景1【核心】: 生成回顾时的素材快照只包含1条已归档摘要");
assertEqual(capturedSummariesAtGenTime[0].summary_text, "摘要A（在100%触发前就已归档）", "场景1【核心】: 素材快照里是conv6的摘要，不是conv7的");
assertEqual(result1.source_summary_ids.length, 1, "场景1【核心】: ReviewSnapshot.source_summary_ids只记录了1条");

// 步骤2的事后验证：conv7现在应该已经被动归档了，且产生了新摘要——但这条新摘要不应该混进上面的回顾素材
assertEqual(conversation.getConversation(conv7.id).archived, true, "场景1: 回顾生成完成后，conv7被统一被动归档");
const allSummaries = get(KEYS.COMPLETION_SUMMARIES, []);
assertEqual(allSummaries.length, 2, "场景1: 总共产生2条CompletionSummary（conv6主动归档的+conv7被动归档的）");
const conv7Summary = allSummaries.find((s) => s.summary_text === "摘要B（被动归档产生，晚于本次回顾快照）");
assertTrue(!!conv7Summary, "场景1: conv7被动归档确实生成了新摘要");
assertTrue(!result1.source_summary_ids.includes(conv7Summary.id), "场景1【核心】: conv7的新摘要没有混进首次回顾的source_summary_ids");

// 步骤3：棘轮置true
assertEqual(machine.getCollectionState("collection_001").triggered_review_at_100pct, true, "场景1: triggered_review_at_100pct被置为true");

// 幂等性：再次调用应该是no-op
const result1Again = await orchestration.triggerReviewOnCompletion("collection_001", async () => {
	reviewGenCallCount++;
	return "不应被调用到";
}, async () => "不应被调用到");
assertEqual(result1Again, null, "场景1: 已触发过首次回顾后再调用返回null（幂等no-op）");
assertEqual(reviewGenCallCount, 1, "场景1: 重复调用不会再次调用回顾生成函数");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).length, 1, "场景1: 重复调用不会产生第二条ReviewSnapshot");

// ============================================================
// 场景2：并发重入——同一图鉴的编排被同时触发两次，不应产生两份sequence=1快照
// ============================================================
memory.clear();
machine.activate("collection_002");
for (const itemId of ["corner_001", "corner_002", "corner_003", "corner_004", "corner_006", "corner_007", "corner_008"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_002" });
}
assertEqual(machine.getCollectionState("collection_002").status, "completed", "场景2前置: collection_002已达100%完成");

let concurrentGenCallCount = 0;
const slowGenerateReviewText = async () => {
	concurrentGenCallCount++;
	await sleep(20); // 拉宽并发窗口，模拟真实网络往返期间另一次调用插入进来
	return "并发场景下生成的回顾文案";
};

const [resultA, resultB] = await Promise.all([
	orchestration.triggerReviewOnCompletion("collection_002", slowGenerateReviewText, async () => null),
	orchestration.triggerReviewOnCompletion("collection_002", slowGenerateReviewText, async () => null),
]);

assertEqual(concurrentGenCallCount, 1, "场景2【核心】: 并发触发两次，回顾生成函数只被实际调用1次");
const oneOfThemSucceeded = (resultA !== null) !== (resultB !== null) || (resultA !== null && resultB !== null && resultA.id === resultB.id);
assertTrue(oneOfThemSucceeded, "场景2: 两次并发调用不会各自生成一份独立的ReviewSnapshot");
const collection2Snapshots = get(KEYS.REVIEW_SNAPSHOTS, []).filter((s) => s.collection_id === "collection_002");
assertEqual(collection2Snapshots.length, 1, "场景2【核心】: storage里collection_002最终只有1条sequence=1的ReviewSnapshot");

// ============================================================
// 场景3：步骤2中途失败后重试——不应该重新生成第二份首次回顾快照
// ============================================================
memory.clear();
machine.activate("collection_003");
for (const itemId of ["idea_004", "idea_005", "idea_006", "idea_007", "idea_008", "idea_009", "idea_010"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_003" });
}
// 倒数第2个条目：未归档对话A（处理顺序在前，应该被成功归档）
const eventA = completionEvent.createCompletionEvent({ contentId: "idea_011", contentType: "collection_item", collectionId: "collection_003" });
const convA = conversation.createConversation(eventA.id);
conversation.addUserMessage(convA.id, "对话A的内容");
// 最后一个条目：未归档对话B（处理顺序在后，模拟它在被动归档时失败）——这次完成让图鉴变成100%
const eventB = completionEvent.createCompletionEvent({ contentId: "idea_012", contentType: "collection_item", collectionId: "collection_003" });
const convB = conversation.createConversation(eventB.id);
conversation.addUserMessage(convB.id, "对话B的内容（这次归档会失败）");

assertEqual(machine.getCollectionState("collection_003").status, "completed", "场景3前置: collection_003已达100%完成");

let firstAttemptGenCallCount = 0;
let firstAttemptThrew = false;
try {
	await orchestration.triggerReviewOnCompletion(
		"collection_003",
		async () => {
			firstAttemptGenCallCount++;
			return "首次尝试生成的回顾文案";
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

assertTrue(firstAttemptThrew, "场景3: 第一次调用在归档convB时失败，异常向外传播");
assertEqual(firstAttemptGenCallCount, 1, "场景3: 第一次调用确实生成了1次回顾文案（在失败点之前已完成步骤1）");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).filter((s) => s.collection_id === "collection_003").length, 1, "场景3: 失败时步骤1产生的ReviewSnapshot已经持久化，没有丢失");
assertEqual(conversation.getConversation(convA.id).archived, true, "场景3: 失败前已经成功归档的convA保持归档状态");
assertEqual(conversation.getConversation(convB.id).archived, false, "场景3: 失败的convB仍未归档");
assertEqual(machine.getCollectionState("collection_003").triggered_review_at_100pct, false, "场景3【核心】: 失败时棘轮还没被置true（步骤3从未执行到）");

// 重试：这次convB的摘要生成成功
const result3 = await orchestration.triggerReviewOnCompletion(
	"collection_003",
	async () => {
		firstAttemptGenCallCount++; // 如果这次又被调用，计数会变成2，断言会失败
		return "不应该再被生成一次";
	},
	async () => "对话B的摘要（重试成功）"
);

assertEqual(firstAttemptGenCallCount, 1, "场景3【核心】: 重试时没有重新调用回顾生成函数（复用已存在的sequence=1快照）");
assertTrue(!!result3, "场景3: 重试成功，返回了ReviewSnapshot");
assertEqual(result3.text, "首次尝试生成的回顾文案", "场景3: 重试返回的是第一次就已经生成好的那份快照内容");
assertEqual(conversation.getConversation(convB.id).archived, true, "场景3: 重试后convB也被成功归档");
assertEqual(machine.getCollectionState("collection_003").triggered_review_at_100pct, true, "场景3: 重试成功后棘轮被置为true");
assertEqual(get(KEYS.REVIEW_SNAPSHOTS, []).filter((s) => s.collection_id === "collection_003").length, 1, "场景3【核心】: 全程只产生了1条ReviewSnapshot，没有因为重试而重复");

// ============================================================
// 场景4：回归（2026-07-06真机验收发现的bug）——回顾生成期间用户对最后完成的条目
// 点"聊聊"新建的对话，不得被被动归档。修复前被动归档名单在步骤1的await之后才收集，
// 会把这个正在进行的对话扫进去，用户下一条消息撞上assertNotArchived发不出去。
// ============================================================
memory.clear();
machine.activate("collection_001");
for (const itemId of ["color_001", "color_004", "color_005", "color_006", "color_007", "color_008"]) {
	completionEvent.createCompletionEvent({ contentId: itemId, contentType: "collection_item", collectionId: "collection_001" });
}
const finalEvent = completionEvent.createCompletionEvent({ contentId: "color_009", contentType: "collection_item", collectionId: "collection_001" });
assertEqual(machine.getCollectionState("collection_001").status, "completed", "场景4前置: 最后一条完成后达到100%");

let midGenConv = null;
let midGenSummaryCalls = 0;
await orchestration.triggerReviewOnCompletion(
	"collection_001",
	async () => {
		// 模拟：回顾还在生成中（真实场景是数秒的API往返），用户此刻点了"聊聊"开始对话
		midGenConv = conversation.createConversation(finalEvent.id);
		conversation.addUserMessage(midGenConv.id, "回顾生成期间用户正在聊的对话");
		await sleep(10);
		return "场景4的回顾文案";
	},
	async () => {
		midGenSummaryCalls++;
		return "被动归档摘要";
	}
);

assertEqual(conversation.getConversation(midGenConv.id).archived, false, "场景4【核心】: 生成期间新建的对话没有被被动归档");
assertEqual(midGenSummaryCalls, 0, "场景4: 没有为生成期间新建的对话触发摘要调用（名单里本来就没别的未归档对话）");
let sendStillWorks = true;
try {
	conversation.addUserMessage(midGenConv.id, "回顾生成完之后用户还能继续发消息");
} catch {
	sendStillWorks = false;
}
assertTrue(sendStillWorks, "场景4【核心】: 回顾生成完成后用户仍能继续发送消息");

if (failed) {
	console.error("\nTask10 reviewOrchestration 断言失败");
	process.exit(1);
} else {
	console.log("\nTask10 reviewOrchestration 断言全部通过");
}
