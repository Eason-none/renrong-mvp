// 回顾编排：快照在用户首次点开回顾时惰性生成（defer-review-to-first-view 变更，
// 取代旧"100%瞬间先快照后归档"时序）。素材 = 点开时刻该图鉴全部已归档对话的摘要——
// 先被动归档、再收集、再生成，让最后一条目完成后的聊聊也能进入回顾。
// "可复现/定格"语义由棘轮承载：快照一经落盘永不重生成，与在哪个瞬间生成无关。

import { get, set, KEYS } from "./storage.js";
import { getCollectionState, markReviewTriggered } from "./collectionMachine.js";
import { getConversationByCompletionEventId, archiveConversation } from "./conversation.js";

function generateId(prefix) {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getCollectionItemEvents(collectionId) {
	const events = get(KEYS.COMPLETION_EVENTS, []);
	return events.filter((e) => e.content_type === "collection_item" && e.collection_id === collectionId);
}

// 素材收集：只取"已归档对话"产生的 CompletionSummary。
// 不依赖"CompletionSummary只可能在archiveConversation()里创建"这条跨模块隐式假设——
// 万一未来出现别的写入路径（数据修复脚本等），那条假设会静默失效。这里显式核对
// 来源Conversation确实archived===true，让"素材仅来自已归档对话"这条不变量自证。
// 用 (content_id, completed_at) 这对组合键匹配到具体是哪条CompletionEvent——这是entity定义里
// "completed_at用于排序/匹配"的字面用法；该组合键理论上在"同一内容毫秒级内被重复完成两次"时
// 可能误判，但这需要远超人类点击节奏的操作频率才会触发，按可接受风险记录，不在本任务内改entity设计。
function gatherExistingSummaries(collectionId) {
	const events = getCollectionItemEvents(collectionId);
	const summaries = get(KEYS.COMPLETION_SUMMARIES, []);
	const matched = [];
	for (const event of events) {
		const conv = getConversationByCompletionEventId(event.id);
		if (!conv || !conv.archived) continue;
		const summary = summaries.find((s) => s.content_id === event.content_id && s.completed_at === event.completed_at);
		if (summary) matched.push(summary);
	}
	return matched;
}

function getUnarchivedConversationsForCollection(collectionId) {
	const events = getCollectionItemEvents(collectionId);
	const result = [];
	for (const event of events) {
		const conv = getConversationByCompletionEventId(event.id);
		if (conv && !conv.archived) result.push(conv);
	}
	return result;
}

function findExistingFirstReviewSnapshot(collectionId) {
	const snapshots = get(KEYS.REVIEW_SNAPSHOTS, []);
	return snapshots.find((s) => s.collection_id === collectionId && s.sequence === 1);
}

// 纯查询，供回顾视图/全部回顾列表读取——不参与编排逻辑本身。
export function getReviewSnapshots(collectionId) {
	return get(KEYS.REVIEW_SNAPSHOTS, [])
		.filter((s) => s.collection_id === collectionId)
		.sort((a, b) => a.sequence - b.sequence);
}

// 同一 collectionId 的编排正在进行中时阻止重入——generateReviewText/archiveConversation 都是
// 跨越 await 的异步调用，如果调用方（UI层）不小心重复触发本函数（比如重复点开回顾/重复的状态
// 变更事件），两次调用会在第一次还没把棘轮置true之前都通过"未触发过"的检查，进而各自生成一份
// sequence=1 快照——这是纯内存锁，不持久化，App重启即释放。
// 局限（doubt-driven复核发现，记录为可接受的范围限制，不修复）：这把锁只防得住"同一进程内"的
// 并发重入，防不住多个浏览器标签页/小程序多实例同时操作同一份storage的极端场景——
// MVP成功标准明确是"开发者本人单会话跑通"（spec_v1.md §1），多标签页并发完全不在当前验证范围内，
// 为此做跨进程锁（比如把"进行中"标记也写进storage）属于当前阶段的过度设计。
const pendingCollectionIds = new Set();

// 首次点开回顾时调用（ReviewView）。四步顺序：
//   1) 名单入口定格：同步收集该图鉴当前未归档对话（沿用2026-07-06竞态修复的教训——
//      生成期间用户若返回图鉴另开对话，新对话不在名单里，不被归档、不进本次素材，留待自然归档）。
//   2) 先被动归档名单里的对话：让它们的摘要进入素材（含最后一条目完成后的聊聊——
//      本变更存在的理由）。顺序await而非Promise.all：并发跑会让多个archiveConversation调用
//      都基于同一份旧的CONVERSATIONS数组快照去读写，后写的覆盖丢失先写的归档结果（lost-update）。
//   3) 收集全部已归档摘要 → 生成回顾叙事 → 快照落盘。
//   4) triggered_review_at_100pct 置 true（棘轮，由 collectionMachine.markReviewTriggered 负责不可逆）。
//
// 失败语义：任一步骤抛出则整体失败——快照不落盘、棘轮不置位；已成功的单条归档保留
// （archiveConversation幂等no-op，重试不产生重复摘要）。重试方式就是用户下次再点开回顾，
// 不需要任何后台补偿任务。若storage里已存在sequence=1快照（含旧时序遗留的数据），
// 跳过生成，只补做归档+棘轮，快照内容永不改写。
//
// generateReviewText(collectionId, summaries) -> Promise<string>：src/api/review.js 提供真实实现，
// 必须把传入的summaries参数当作素材的唯一来源——不能在内部又回头查storage实时读取。
// generateSummaryText(conversation) -> Promise<string>：传给被动归档调用的 conversation.archiveConversation。
export async function ensureFirstReviewSnapshot(collectionId, generateReviewText, generateSummaryText) {
	const state = getCollectionState(collectionId);
	if (state.status !== "completed" || state.triggered_review_at_100pct) {
		return null;
	}
	if (pendingCollectionIds.has(collectionId)) {
		return null;
	}

	pendingCollectionIds.add(collectionId);
	try {
		const unarchivedConversations = getUnarchivedConversationsForCollection(collectionId);

		let reviewSnapshot = findExistingFirstReviewSnapshot(collectionId);
		if (!reviewSnapshot) {
			// 先归档再收集：归档失败会在快照落盘之前抛出，不留半成品
			for (const conv of unarchivedConversations) {
				await archiveConversation(conv.id, generateSummaryText);
			}
			const summariesSnapshot = gatherExistingSummaries(collectionId);
			const reviewText = await generateReviewText(collectionId, summariesSnapshot);

			reviewSnapshot = {
				id: generateId("rs"),
				collection_id: collectionId,
				sequence: 1,
				generated_at: Date.now(),
				text: reviewText,
				source_summary_ids: summariesSnapshot.map((s) => s.id),
			};
			const reviewSnapshots = get(KEYS.REVIEW_SNAPSHOTS, []);
			reviewSnapshots.push(reviewSnapshot);
			set(KEYS.REVIEW_SNAPSHOTS, reviewSnapshots);
		} else {
			// 快照已存在（上次在步骤4前被打断，或旧时序遗留）：只补做归档+棘轮，不改写快照
			for (const conv of unarchivedConversations) {
				await archiveConversation(conv.id, generateSummaryText);
			}
		}

		// 走到这里时按本函数开头的校验，markReviewTriggered理论上不可能返回false——
		// 但"理论上不会"不等于代码里写明了不会：一旦这个不变量真被打破（比如锁防不住的
		// 跨进程竞态），不检查返回值会让"快照已生成但棘轮没置true"这种不一致态完全没有信号。
		const triggered = markReviewTriggered(collectionId);
		if (!triggered) {
			throw new Error(`ensureFirstReviewSnapshot: markReviewTriggered未成功置位（collection ${collectionId}），但前面的快照/归档步骤已经执行——出现了不应该出现的状态不一致`);
		}
		return reviewSnapshot;
	} finally {
		pendingCollectionIds.delete(collectionId);
	}
}
