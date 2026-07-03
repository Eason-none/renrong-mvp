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

// --- AC1：每条用户消息计数+1，count%5==0时shouldPromptArchive为true，但不阻断输入 ---
for (let i = 1; i <= 4; i++) {
	const { conversation: updated, shouldPromptArchive } = conversation.addUserMessage(conv.id, `消息${i}`);
	assertEqual(updated.user_message_count, i, `AC1: 第${i}条消息后计数正确`);
	assertEqual(shouldPromptArchive, false, `AC1: 第${i}条消息未达5的倍数，不应提示归档`);
}
const fifth = conversation.addUserMessage(conv.id, "消息5");
assertEqual(fifth.conversation.user_message_count, 5, "AC1: 第5条消息后计数为5");
assertEqual(fifth.shouldPromptArchive, true, "AC1: 第5条消息触发shouldPromptArchive=true");

// 用户"不理会提示继续打字"：继续发消息，状态不受影响（不阻断输入）
const sixth = conversation.addUserMessage(conv.id, "消息6（不理会提示继续打字）");
assertEqual(sixth.conversation.user_message_count, 6, "AC1: 忽略提示后仍能继续发消息，计数继续增加");
assertEqual(sixth.conversation.archived, false, "AC1: 忽略提示不会自动归档，状态不变");

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

if (failed) {
	console.error("\nTask9 conversation 断言失败");
	process.exit(1);
} else {
	console.log("\nTask9 conversation 断言全部通过");
}
