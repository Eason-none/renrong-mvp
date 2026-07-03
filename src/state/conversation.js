// Conversation归档计数规则 + 归档动作（spec_v1.md §2.4、§3.3 AC1-AC3）
// 每个CompletionEvent最多一个Conversation，1:1绑定，互相隔离。
// 归档是终态（"快照定格"精神同样适用于对话本身）：archived之后不再接受新消息，
// 重复调用archiveConversation是幂等no-op，这样Task10"被动归档"和用户主动点归档按钮
// 即使前后脚都触发也不会生成两条CompletionSummary。

import { get, set, KEYS } from "./storage.js";

function generateId(prefix) {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadConversations() {
	return get(KEYS.CONVERSATIONS, []);
}

function saveConversations(list) {
	set(KEYS.CONVERSATIONS, list);
}

function writeConversation(updated) {
	const conversations = loadConversations();
	const index = conversations.findIndex((c) => c.id === updated.id);
	if (index === -1) {
		throw new Error(`writeConversation: 找不到 conversation ${updated.id}`);
	}
	conversations[index] = updated;
	saveConversations(conversations);
	return updated;
}

function assertNotArchived(conversation, action) {
	if (conversation.archived) {
		throw new Error(`${action}: conversation ${conversation.id} 已归档，不能再操作`);
	}
}

export function getConversation(conversationId) {
	return loadConversations().find((c) => c.id === conversationId);
}

export function getConversationByCompletionEventId(completionEventId) {
	return loadConversations().find((c) => c.completion_event_id === completionEventId);
}

// product_handoff.md §6.2/§6.2.1："历史回顾"角标——展示全部已归档对话，不分推送层/图鉴层来源。
// 纯查询，按archived_at倒序，最近归档的在最前面。
export function getArchivedConversations() {
	return loadConversations()
		.filter((c) => c.archived)
		.sort((a, b) => b.archived_at - a.archived_at);
}

// 用户选择"聊聊"才调用（跳过聊天则永远不调用本函数，AC3的前提即由此天然成立）。
export function createConversation(completionEventId) {
	const conversations = loadConversations();
	if (conversations.some((c) => c.completion_event_id === completionEventId)) {
		throw new Error(`createConversation: completion_event_id ${completionEventId} 已存在Conversation（1:1绑定）`);
	}
	const conversation = {
		id: generateId("conv"),
		completion_event_id: completionEventId,
		messages: [],
		archived: false,
		archived_at: null,
		user_message_count: 0,
	};
	conversations.push(conversation);
	saveConversations(conversations);
	return conversation;
}

export function addUserMessage(conversationId, content, image) {
	const conversation = getConversation(conversationId);
	if (!conversation) throw new Error(`addUserMessage: 找不到 conversation ${conversationId}`);
	assertNotArchived(conversation, "addUserMessage");
	const updated = {
		...conversation,
		messages: [...conversation.messages, { role: "user", content, image: image ?? null }],
		user_message_count: conversation.user_message_count + 1,
	};
	writeConversation(updated);
	return updated;
}

export function addAssistantMessage(conversationId, content) {
	const conversation = getConversation(conversationId);
	if (!conversation) throw new Error(`addAssistantMessage: 找不到 conversation ${conversationId}`);
	assertNotArchived(conversation, "addAssistantMessage");
	const updated = {
		...conversation,
		messages: [...conversation.messages, { role: "assistant", content, image: null }],
	};
	return writeConversation(updated);
}

function loadCompletionSummaries() {
	return get(KEYS.COMPLETION_SUMMARIES, []);
}

// product_handoff.md §11.1："历史完成摘要"仅在redo场景注入——同一content_id之前完成过且留下过
// 摘要时，取最近一条非空摘要供主对话system prompt引用。纯查询，不参与任何写入流程。
export function getLatestSummaryForContent(contentId) {
	const matches = loadCompletionSummaries().filter((s) => s.content_id === contentId && s.summary_text);
	if (matches.length === 0) return undefined;
	return matches.reduce((latest, s) => (s.completed_at > latest.completed_at ? s : latest));
}

function saveCompletionSummaries(list) {
	set(KEYS.COMPLETION_SUMMARIES, list);
}

function findCompletionEvent(completionEventId) {
	const events = get(KEYS.COMPLETION_EVENTS, []);
	return events.find((e) => e.id === completionEventId);
}

// AC2：归档（无论主动点按钮还是Task10被动批量触发，都走这一个函数）：
// archived=true+archived_at=now；messages非空则触发摘要生成调用，messages为空则summary_text直接为null。
// generateSummaryText 是注入的摘要生成函数（Task13的src/api/deepseek.js会提供真实实现，
// 这里只接受函数引用，保持本模块与具体模型API解耦——同步或返回Promise都支持，统一await）。
export async function archiveConversation(conversationId, generateSummaryText) {
	const conversation = getConversation(conversationId);
	if (!conversation) throw new Error(`archiveConversation: 找不到 conversation ${conversationId}`);
	if (conversation.archived) return conversation; // 已归档，幂等no-op，不重复生成摘要

	const completionEvent = findCompletionEvent(conversation.completion_event_id);
	if (!completionEvent) {
		throw new Error(`archiveConversation: 找不到对应的CompletionEvent ${conversation.completion_event_id}`);
	}

	// 摘要生成（可能跨网络、可能失败）必须在"标记archived=true"之前完成——
	// 否则摘要调用失败时，conversation已经被错误地永久标记为archived，却没有对应的CompletionSummary，
	// 违反"archived且messages非空就一定有摘要"的不变量（reviewOrchestration的断言脚本测出过这个问题）。
	let summaryText = null;
	if (conversation.messages.length > 0) {
		if (typeof generateSummaryText !== "function") {
			throw new Error("archiveConversation: messages非空时必须提供generateSummaryText");
		}
		summaryText = await generateSummaryText(conversation);
	}

	const archived = { ...conversation, archived: true, archived_at: Date.now() };
	writeConversation(archived);

	const summary = {
		id: generateId("cs"),
		content_id: completionEvent.content_id,
		completed_at: completionEvent.completed_at,
		summary_text: summaryText,
	};
	const summaries = loadCompletionSummaries();
	summaries.push(summary);
	saveCompletionSummaries(summaries);

	return archived;
}
