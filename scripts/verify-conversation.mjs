// Task 9 轻量运行时断言脚本：覆盖 spec §3.3 AC1-AC3。
// 单文件直接跑：node scripts/verify-conversation.mjs
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

async function assertThrowsAsync(fn, label) {
	try {
		await fn();
		failed = true;
		console.error(`FAIL: ${label}（未抛出异常）`);
	} catch {
		console.log(`PASS: ${label}`);
	}
}

function seedCompletionEvent(id, contentId) {
	const events = get(KEYS.COMPLETION_EVENTS, []);
	events.push({ id, content_id: contentId, content_type: "push", completed_at: 1719200000000 });
	set(KEYS.COMPLETION_EVENTS, events);
}

// --- 1:1绑定 + 创建 ---
memory.clear();
seedCompletionEvent("ce_1", "push_001");
const conv = conversation.createConversation("ce_1");
assertEqual(conv.archived, false, "创建: 新Conversation默认未归档");
assertEqual(conv.user_message_count, 0, "创建: 新Conversation消息计数为0");
let threw = false;
try {
	conversation.createConversation("ce_1");
} catch {
	threw = true;
}
assertTrue(threw, "1:1绑定: 同一completion_event_id二次创建应抛出异常");

// --- AC1（2026-07-06按v8同步：5条消息提示归档机制已随"说完了"重设计移除，
// addUserMessage直接返回更新后的Conversation，不再返回{conversation, shouldPromptArchive}）---
for (let i = 1; i <= 6; i++) {
	const updated = conversation.addUserMessage(conv.id, `消息${i}`);
	assertEqual(updated.user_message_count, i, `AC1: 第${i}条消息后计数正确`);
	assertEqual(updated.archived, false, `AC1: 第${i}条消息后仍未归档（不存在任何消息数触发的自动归档）`);
}

// assistant消息不计入user_message_count
conversation.addAssistantMessage(conv.id, "AI回复，不计入用户消息数");
assertEqual(conversation.getConversation(conv.id).user_message_count, 6, "AC1: assistant消息不增加user_message_count");
assertEqual(conversation.getConversation(conv.id).messages.length, 7, "AC1: messages数组包含全部user+assistant消息");

// --- AC2：点击归档 -> archived=true + 触发摘要生成（messages非空场景）---
let summaryGeneratorCalled = false;
const archivedConv = await conversation.archiveConversation(conv.id, async (c) => {
	summaryGeneratorCalled = true;
	assertTrue(c.messages.length > 0, "AC2: 传给摘要生成函数的conversation包含完整消息");
	return "用户分享了今天的小事";
});
assertEqual(archivedConv.archived, true, "AC2: 归档后archived为true");
assertTrue(typeof archivedConv.archived_at === "number", "AC2: 归档后archived_at被设置");
assertTrue(summaryGeneratorCalled, "AC2: messages非空时调用了摘要生成函数");
const summaries = get(KEYS.COMPLETION_SUMMARIES, []);
assertEqual(summaries.length, 1, "AC2: 生成了1条CompletionSummary");
assertEqual(summaries[0].content_id, "push_001", "AC2: CompletionSummary.content_id取自对应的CompletionEvent");
assertEqual(summaries[0].summary_text, "用户分享了今天的小事", "AC2: CompletionSummary.summary_text为摘要生成函数的返回值");

// 重复归档：幂等no-op，不重复生成摘要
await conversation.archiveConversation(conv.id, async () => "不应被调用");
assertEqual(get(KEYS.COMPLETION_SUMMARIES, []).length, 1, "AC2: 重复归档不会重复生成CompletionSummary");

// --- AC2变体：messages为空时不调用摘要生成函数，summary_text直接为null ---
memory.clear();
seedCompletionEvent("ce_2", "push_002");
const emptyConv = conversation.createConversation("ce_2");
let emptyGeneratorCalled = false;
await conversation.archiveConversation(emptyConv.id, async () => {
	emptyGeneratorCalled = true;
	return "不应被调用";
});
assertEqual(emptyGeneratorCalled, false, "AC2变体: messages为空时不调用摘要生成函数");
const emptySummaries = get(KEYS.COMPLETION_SUMMARIES, []);
assertEqual(emptySummaries.length, 1, "AC2变体: 仍生成1条CompletionSummary记录");
assertEqual(emptySummaries[0].summary_text, null, "AC2变体: messages为空时summary_text为null");

// 归档后不能再发消息（archived是终态）
await assertThrowsAsync(
	async () => conversation.addUserMessage(emptyConv.id, "归档后还想发消息"),
	"归档后追加消息应抛出异常（archived是终态）"
);

// --- AC3：始终未归档的对话，不被任何超时/被动清理逻辑改变状态 ---
memory.clear();
seedCompletionEvent("ce_3", "push_003");
const neverArchived = conversation.createConversation("ce_3");
conversation.addUserMessage(neverArchived.id, "一条消息，之后再也不归档");
// 模拟"长时间过去"——没有任何被动清理函数可调用，本模块也确实没有导出任何timeout/cleanup接口
assertTrue(
	typeof conversation.cleanupStaleConversations === "undefined" && typeof conversation.archiveTimedOut === "undefined",
	"AC3: 模块未导出任何超时/被动清理函数"
);
assertEqual(conversation.getConversation(neverArchived.id).archived, false, "AC3: 没有任何图鉴100%事件发生时，对话保持未归档");

// --- 归档进行中锁（2026-07-13 修复：并发双归档产生两条相似手记页）---
memory.clear();
seedCompletionEvent("ce_race", "push_003");
const raceConv = conversation.createConversation("ce_race");
conversation.addUserMessage(raceConv.id, "这段对话会被并发归档两次");
let raceGenCalls = 0;
const slowSummary = async () => {
	raceGenCalls += 1;
	await new Promise((r) => setTimeout(r, 30)); // 模拟 LLM 摘要延迟——竞态窗口
	return "同一段对话的摘要";
};
// 模拟真机时序：""返回"退出的后台归档还在飞，用户点开回顾触发被动归档
await Promise.all([
	conversation.archiveConversation(raceConv.id, slowSummary),
	conversation.archiveConversation(raceConv.id, slowSummary),
]);
assertEqual(raceGenCalls, 1, "归档锁【核心】: 并发两次归档，摘要生成只实际调用1次");
assertEqual(
	get(KEYS.COMPLETION_SUMMARIES, []).filter((s) => s.completion_event_id === "ce_race").length,
	1,
	"归档锁【核心】: storage里最终只有1份摘要（不再出现两条相似手记页）"
);
// 锁释放后重复调用仍是幂等 no-op（archived 已置位）
await conversation.archiveConversation(raceConv.id, slowSummary);
assertEqual(raceGenCalls, 1, "归档锁: 锁释放后再调仍走 archived 幂等，无第2次生成");

// --- 存量重复摘要清理（dedupeCompletionSummaries）---
const dupSummaries = get(KEYS.COMPLETION_SUMMARIES, []);
dupSummaries.push({ ...dupSummaries[0], id: "cs_dup_late" }); // 人为造一条同事件的重复摘要
set(KEYS.COMPLETION_SUMMARIES, dupSummaries);
const removed = conversation.dedupeCompletionSummaries();
assertEqual(removed, 1, "去重: 同 completion_event_id 的重复摘要被清掉1条");
const keptList = get(KEYS.COMPLETION_SUMMARIES, []).filter((s) => s.completion_event_id === "ce_race");
assertEqual(keptList.length, 1, "去重: 只剩1份");
assertTrue(keptList[0].id !== "cs_dup_late", "去重: 保留的是最早写入的那份");
assertEqual(conversation.dedupeCompletionSummaries(), 0, "去重: 幂等，第二次跑零删除");

// --- 照片收齐（2026-07-13 多图拼贴）：归档存全部用户图片，photo_thumb 仍是首图 ---
memory.clear();
seedCompletionEvent("ce_ph", "push_003");
const phConv = conversation.createConversation("ce_ph");
conversation.addUserMessage(phConv.id, "两张图", ["data:image/png;base64,AA", "data:image/png;base64,BB"]);
conversation.addAssistantMessage(phConv.id, "看到了");
conversation.addUserMessage(phConv.id, "又一张", ["data:image/png;base64,CC"]);
await conversation.archiveConversation(phConv.id, async () => "照片页");
const phSummary = get(KEYS.COMPLETION_SUMMARIES, []).find((s) => s.completion_event_id === "ce_ph");
assertEqual(phSummary.photo_thumbs, ["data:image/png;base64,AA", "data:image/png;base64,BB", "data:image/png;base64,CC"], "照片收齐: photo_thumbs按发送顺序含全部图片");
assertEqual(phSummary.photo_thumb, "data:image/png;base64,AA", "照片收齐: photo_thumb仍为首图（兼容）");
assertEqual(conversation.getSummaryPhotos(phSummary), phSummary.photo_thumbs, "照片收齐: getSummaryPhotos返回完整列表");
assertEqual(conversation.getSummaryPhotos({ photo_thumb: "x" }), ["x"], "照片收齐: 旧单图数据归一为数组");

// 存量回填：老摘要没有 photo_thumbs，dedupe 时从归档对话反查补齐
const backfillList = get(KEYS.COMPLETION_SUMMARIES, []).map((s) => {
	const { photo_thumbs, ...legacy } = s;
	return legacy; // 人为退回旧形状
});
set(KEYS.COMPLETION_SUMMARIES, backfillList);
conversation.dedupeCompletionSummaries();
const backfilled = get(KEYS.COMPLETION_SUMMARIES, []).find((s) => s.completion_event_id === "ce_ph");
assertEqual(backfilled.photo_thumbs, ["data:image/png;base64,AA", "data:image/png;base64,BB", "data:image/png;base64,CC"], "回填: 启动清理从归档对话补齐photo_thumbs");

if (failed) {
	console.error("\nTask9 conversation 断言失败");
	process.exit(1);
} else {
	console.log("\nTask9 conversation 断言全部通过");
}
