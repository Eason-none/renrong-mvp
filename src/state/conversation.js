// Conversation归档计数规则 + 归档动作（docs/archive/spec_v1.md §2.4、§3.3 AC1-AC3）
// 每个CompletionEvent最多一个Conversation，1:1绑定，互相隔离。
// 归档是终态（"快照定格"精神同样适用于对话本身）：archived之后不再接受新消息，
// 重复调用archiveConversation是幂等no-op，这样Task10"被动归档"和用户主动点归档按钮
// 即使前后脚都触发也不会生成两条CompletionSummary。

import { get, set, KEYS } from "./storage.js";
import { track } from "./analytics.js";

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

// 一条消息的全部图片（新旧结构归一）：新消息存 images 数组（一次可选多张），
// 旧数据只有单图 image 字段——读取端统一走这里，写入端只写 images。
export function getMessageImages(message) {
	if (Array.isArray(message?.images)) return message.images.filter(Boolean);
	return message?.image ? [message.image] : [];
}

// 对话中用户发送的全部图片，按发送顺序。
function collectUserImages(conversation) {
	const images = [];
	for (const m of conversation.messages) {
		if (m.role === "user") images.push(...getMessageImages(m));
	}
	return images;
}

// 一页摘要的全部照片（新旧结构归一）：新摘要存 photo_thumbs 完整列表，
// 旧数据只有单图 photo_thumb——读取端（TracePage/手记册/分享卡）统一走这里。
export function getSummaryPhotos(summary) {
	if (Array.isArray(summary?.photo_thumbs)) return summary.photo_thumbs.filter(Boolean);
	return summary?.photo_thumb ? [summary.photo_thumb] : [];
}

export function addUserMessage(conversationId, content, images) {
	const conversation = getConversation(conversationId);
	if (!conversation) throw new Error(`addUserMessage: 找不到 conversation ${conversationId}`);
	assertNotArchived(conversation, "addUserMessage");
	// 兼容旧签名：第三参历史上是单图字符串
	const imageList = (Array.isArray(images) ? images : [images]).filter(Boolean);
	const updated = {
		...conversation,
		messages: [...conversation.messages, { role: "user", content, images: imageList }],
		user_message_count: conversation.user_message_count + 1,
	};
	writeConversation(updated);
	// 聊聊率分子的唯一埋点（specs/analytics-events 最小事件集#4）：只在第一条用户消息时
	// 报一次。埋在这里而不是"点聊聊"入口，是为了让"进了对话没说话"的空对话（含随后
	// 直接归档的）进不了分子——聊聊率口径以实质发言为准，不被空进空出虚高。
	if (updated.user_message_count === 1) {
		const event = findCompletionEvent(conversation.completion_event_id);
		track("chat_engaged", {
			content_type: event ? event.content_type : null,
			content_id: event ? event.content_id : null,
			collection_id: event ? event.collection_id : null,
		});
	}
	return updated;
}

export function addAssistantMessage(conversationId, content) {
	const conversation = getConversation(conversationId);
	if (!conversation) throw new Error(`addAssistantMessage: 找不到 conversation ${conversationId}`);
	assertNotArchived(conversation, "addAssistantMessage");
	const updated = {
		...conversation,
		messages: [...conversation.messages, { role: "assistant", content, images: [] }],
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

// 归档进行中锁（2026-07-13 修复真机 bug：同一对话生成两条高度相似的手记页）——
// "conversation.archived 才幂等跳过"的检查跨越了摘要生成的 await（LLM 要几秒），
// "返回"退出触发的后台归档还没落盘时，用户马上点开回顾触发被动归档，两次调用
// 都通过"未归档"检查，各自生成一份摘要。与 reviewOrchestration.pendingCollectionIds
// 同一立场：进行中的归档共享同一个 Promise，并发调用不会产生第二份摘要。
// 纯内存锁不持久化，App 重启即释放；跨进程场景不在 MVP 范围（同 reviewOrchestration 备注）。
const pendingArchives = new Map();

// AC2：归档（无论主动点按钮还是Task10被动批量触发，都走这一个函数）：
// archived=true+archived_at=now；messages非空则触发摘要生成调用，messages为空则summary_text直接为null。
// generateSummaryText 是注入的摘要生成函数（Task13的src/api/deepseek.js会提供真实实现，
// 这里只接受函数引用，保持本模块与具体模型API解耦——同步或返回Promise都支持，统一await）。
export function archiveConversation(conversationId, generateSummaryText) {
	const pending = pendingArchives.get(conversationId);
	if (pending) return pending;
	const task = doArchiveConversation(conversationId, generateSummaryText).finally(() => {
		pendingArchives.delete(conversationId);
	});
	pendingArchives.set(conversationId, task);
	return task;
}

async function doArchiveConversation(conversationId, generateSummaryText) {
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
	// summaryText trim后为空字符串（模型判定"没捞到实质内容"，见diary-trace规格）一律归一化为null——
	// 摘要记录仍然写入，只是不构成一页日记，读取端只需判断summary_text是否非空即可，不用重复trim。
	let summaryText = null;
	if (conversation.messages.length > 0) {
		if (typeof generateSummaryText !== "function") {
			throw new Error("archiveConversation: messages非空时必须提供generateSummaryText");
		}
		const raw = (await generateSummaryText(conversation)) ?? "";
		summaryText = raw.trim() || null;
	}

	// 日记页的照片：收齐对话中用户发送的全部图片（发送时已压缩为缩略图落库，见ChatView.chooseImage）。
	// photo_thumbs 是完整列表（TracePage 多图展示、分享卡取前3拼贴）；photo_thumb 保留首图，
	// 供旧读取端与"卡面主图"语义兼容。
	const photoThumbs = collectUserImages(conversation);
	const photoThumb = photoThumbs[0] ?? null;

	const archived = { ...conversation, archived: true, archived_at: Date.now() };
	writeConversation(archived);

	const summary = {
		id: generateId("cs"),
		completion_event_id: completionEvent.id,
		content_id: completionEvent.content_id,
		completed_at: completionEvent.completed_at,
		summary_text: summaryText,
		photo_thumb: photoThumb,
		photo_thumbs: photoThumbs,
	};
	const summaries = loadCompletionSummaries();
	summaries.push(summary);
	saveCompletionSummaries(summaries);

	return archived;
}

// 存量重复摘要清理（2026-07-13，配合归档进行中锁）：锁只防今后，此前竞态已产生的
// "同一完成事件两份摘要"要一次性收敛——同 key（completion_event_id，旧数据回退
// content_id|completed_at 组合键）只保留最早写入的一份。幂等，无重复时零写入；
// App 启动时调用。三件幸福小事同一天多次记录是不同完成事件，天然不受影响。
export function dedupeCompletionSummaries() {
	const summaries = loadCompletionSummaries();
	const seen = new Set();
	// 顺带清洗历史脏摘要：旧摘要 prompt 让模型"输出空字符串"，只发照片没打字的对话
	// 会把「空字符串」字面量当摘要落库（日记页上直接显示这四个字）。归一为 null——
	// 与"没聊出内容不成页"同一语义；photo_thumb 保留在记录里不动。
	const garbage = /^\[?(无内容|空字符串)\]?$/;
	// photo_thumbs 回填（2026-07-13 多图拼贴）：此前归档只留首图进 photo_thumb，其余图
	// 一直完整躺在归档对话里——按 completion_event_id 反查对话补齐完整列表。幂等：已有
	// photo_thumbs 的记录不动；反查不到对话（旧 push 时代等）就用单图字段升格。
	const conversations = loadConversations();
	const convByEvent = new Map(conversations.map((c) => [c.completion_event_id, c]));
	const kept = summaries
		.map((s) => (s && typeof s.summary_text === "string" && garbage.test(s.summary_text.trim()) ? { ...s, summary_text: null } : s))
		.map((s) => {
			if (!s || Array.isArray(s.photo_thumbs)) return s;
			const conv = convByEvent.get(s.completion_event_id);
			const photos = conv ? collectUserImages(conv) : [];
			return { ...s, photo_thumbs: photos.length ? photos : s.photo_thumb ? [s.photo_thumb] : [] };
		})
		.filter((s) => {
			const key = s.completion_event_id ?? `${s.content_id}|${s.completed_at}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	if (JSON.stringify(kept) !== JSON.stringify(summaries)) {
		saveCompletionSummaries(kept);
	}
	return summaries.length - kept.length;
}

// 重逢弹层的唯一查询入口（diary-trace / trace-reencounter 规格）：给定一个CompletionEvent，
// 返回它对应的日记页（summary_text非空的CompletionSummary），没有则返回null——
// 调用方不需要关心"没聊过""聊了但没实质内容""还没归档"这几种情况的区别，统一按"有没有页"分支。
// 优先按completion_event_id精确匹配；旧数据没有这个字段时回退(content_id, completed_at)组合键匹配，
// 与reviewOrchestration.gatherExistingSummaries用的是同一套回退键。
export function getDiaryPageForEvent(completionEvent) {
	if (!completionEvent) return null;
	const summaries = loadCompletionSummaries();
	const byId = summaries.find((s) => s.completion_event_id === completionEvent.id);
	const summary =
		byId ??
		summaries.find((s) => s.content_id === completionEvent.content_id && s.completed_at === completionEvent.completed_at);
	if (!summary || !summary.summary_text) return null;
	return summary;
}
