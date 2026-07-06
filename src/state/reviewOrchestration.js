// 归档时序与回顾触发编排（spec_v1.md §2.4、§3.5 AC1）
// 交接文档标注："最容易被悄悄破坏的一条逻辑"——图鉴100%时必须先用"已归档对话产生的摘要"
// 生成首次回顾快照，再把当时仍未归档的对话统一被动归档；顺序不能反，否则被动归档刚好补全的
// 摘要会错误混进首次回顾素材，破坏"快照定格"语义（生成的回顾内容理应可复现）。

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

// 步骤1的输入素材：AC1要求"仅来自已归档对话"产生的 CompletionSummary。
// 不依赖"CompletionSummary只可能在archiveConversation()里创建"这条跨模块隐式假设——
// 万一未来出现别的写入路径（数据修复脚本等），那条假设会静默失效。这里改成显式核对
// 来源Conversation确实archived===true，让这条AC1最核心的不变量自证，而不是依赖注释里的约定
// （doubt-driven复核发现：原实现只是推断"存在的summary=已归档的"，没有真正校验）。
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

// 纯查询，供Task22图鉴卡片角标判断"回顾已生成"还是"还在生成中"——不参与编排逻辑本身。
export function getReviewSnapshots(collectionId) {
	return get(KEYS.REVIEW_SNAPSHOTS, [])
		.filter((s) => s.collection_id === collectionId)
		.sort((a, b) => a.sequence - b.sequence);
}

// 同一 collectionId 的编排正在进行中时阻止重入——generateReviewText/archiveConversation 都是
// 跨越 await 的异步调用，如果调用方（UI层）不小心重复触发本函数（比如重复点击/重复的状态变更
// 事件），两次调用会在第一次还没把棘轮置true之前都通过"未触发过"的检查，进而各自生成一份
// sequence=1 快照——这是纯内存锁，不持久化，App重启即释放。
// 局限（doubt-driven复核发现，记录为可接受的范围限制，不修复）：这把锁只防得住"同一进程内"的
// 并发重入，防不住多个浏览器标签页/小程序多实例同时操作同一份storage的极端场景——
// MVP成功标准明确是"开发者本人单会话跑通"（spec_v1.md §1），多标签页并发完全不在当前验证范围内，
// 为此做跨进程锁（比如把"进行中"标记也写进storage）属于当前阶段的过度设计。
const pendingCollectionIds = new Set();

// AC1 + §2.4：图鉴100%触发后的编排，三步顺序不能反：
//   1) 先用当前已归档对话产生的 CompletionSummary 生成 ReviewSnapshot(sequence=1)——
//      素材必须在调用生成函数之前就快照固定，不能等 await 回来后再重新计算。
//   2) 生成完成后，才把"进入本函数那一刻定格的未归档名单"统一被动归档（名单必须在
//      任何await之前同步收集，否则会把回顾生成期间用户新开的对话误伤进来，见函数内注释）。
//      这里用顺序await而非Promise.all：并发跑会让多个archiveConversation调用都基于同一份旧的
//      CONVERSATIONS数组快照去读写，后写的会覆盖丢失先写的归档结果（doubt-driven复核提醒的
//      lost-update风险）——顺序执行是有意的设计决策，不是疏漏。
//   3) triggered_review_at_100pct 置 true（棘轮，由 collectionMachine.markReviewTriggered 负责不可逆）。
//
// 步骤1的快照写入和步骤3的棘轮置true是两次独立的、可能被中途打断的操作（网络失败/异常退出）。
// 为了让"中途失败后重试"不会重复生成第二份 sequence=1 快照，重试时先检查是否已存在
// 一份 sequence=1 快照，存在则跳过生成、直接续做步骤2/3——整个函数对"步骤1之后任意时刻被打断"
// 都是可安全重试的（步骤2本身也是幂等的，archiveConversation对已归档对话是no-op）。
// 调用契约（留给Task17+ UI实现时注意）：本函数抛出异常后不会自动重试——如果失败发生在步骤2/3，
// 图鉴会卡在"快照已生成但棘轮未置true"的中间态，调用方必须用level-triggered的方式
// （比如每次App启动时检查所有 status===completed && !triggered_review_at_100pct 的图鉴）
// 重新调用本函数，而不能只在"刚好跨越100%那一刻"调用一次就不管了。
//
// generateReviewText(collectionId, summaries) -> Promise<string>：Task14 的 src/api/review.js 提供真实实现，
// 且必须把传入的summaries参数当作素材的唯一来源——不能在内部又回头查storage实时读取，
// 否则会把"素材必须在被动归档之前快照固定"这条本文件存在的意义绕过去。
// generateSummaryText(conversation) -> Promise<string>：传给步骤2里调用的 conversation.archiveConversation。
export async function triggerReviewOnCompletion(collectionId, generateReviewText, generateSummaryText) {
	const state = getCollectionState(collectionId);
	if (state.status !== "completed" || state.triggered_review_at_100pct) {
		return null;
	}
	if (pendingCollectionIds.has(collectionId)) {
		return null;
	}

	pendingCollectionIds.add(collectionId);
	try {
		// 被动归档名单在进入编排的这一刻同步定格，不能等步骤1的await回来后再收集：
		// 回顾生成要好几秒，期间用户很可能正对最后完成的那个条目点"聊聊"新建对话——
		// 晚收集会把这个正在进行的对话扫进被动归档，用户下一条消息就撞上assertNotArchived
		// 发不出去（真机验收实际踩到的bug）。§6.5.3的语义本来就是"触发那一刻仍未归档的对话"。
		// 归档动作本身仍在步骤1之后执行，素材快照的时序约束不受影响；名单里若有对话
		// 期间被用户主动"说完了"归档，archiveConversation幂等no-op天然跳过。
		const unarchivedConversations = getUnarchivedConversationsForCollection(collectionId);
		let reviewSnapshot = findExistingFirstReviewSnapshot(collectionId);
		if (!reviewSnapshot) {
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
		}

		for (const conv of unarchivedConversations) {
			await archiveConversation(conv.id, generateSummaryText);
		}

		// 走到这里时按本函数开头的校验，markReviewTriggered理论上不可能返回false——
		// 但"理论上不会"不等于代码里写明了不会：一旦这个不变量真被打破（比如锁防不住的
		// 跨进程竞态），不检查返回值会让"快照已生成但棘轮没置true"这种不一致态完全没有信号。
		const triggered = markReviewTriggered(collectionId);
		if (!triggered) {
			throw new Error(`triggerReviewOnCompletion: markReviewTriggered未成功置位（collection ${collectionId}），但前面的快照/归档步骤已经执行——出现了不应该出现的状态不一致`);
		}
		return reviewSnapshot;
	} finally {
		pendingCollectionIds.delete(collectionId);
	}
}
