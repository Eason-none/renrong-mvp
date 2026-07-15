// 三件幸福小事（three-good-things）：常驻轻内容，不来自每日任务池，一天至多一页。
// "聊即是做"——点入口直接进对话，没有任务卡、没有"做完啦"步骤；完成事件在进入对话时就创建，
// 跟其他层"做完啦即登记完成、随后聊不聊都不影响"是同一个语义。

import { get, KEYS } from "./storage.js";
import { createCompletionEvent } from "./completionEvent.js";
import { createConversation, getConversationByCompletionEventId } from "./conversation.js";

export const THREE_GOOD_THINGS_CONTENT_ID = "three-good-things";
export const THREE_GOOD_THINGS_TITLE = "三件幸福小事";
// 手记册里按天合并后的条目/单页标题（用户指定文案）。放这里（而不是 diaryNotebook.js）
// 是因为分享卡也要按它识别"这是幸福小事页"——shareCard(utils) 不能反向 import 手记册数据层。
export const THREE_GOOD_ENTRY_TITLE = "幸福时刻是：";
// 只用于摘要生成prompt的"这次完成的内容"框架，不直接展示给用户（用户看到的是专用开场白，见qwen.js）
export const THREE_GOOD_THINGS_SUMMARY_CONTEXT = "用户说了今天几件让ta觉得幸福的小事，可以是一件也可以是几件";

function isSameCalendarDay(ts1, ts2) {
	const d1 = new Date(ts1);
	const d2 = new Date(ts2);
	return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function todayEvents() {
	const now = Date.now();
	return get(KEYS.COMPLETION_EVENTS, []).filter(
		(e) => e.content_id === THREE_GOOD_THINGS_CONTENT_ID && isSameCalendarDay(e.completed_at, now)
	);
}

// 点击入口时调用：随时可记——每次点击总是进入记录对话，不再一天一页。
// 历史回看交给手记册（diary-notebook），入口本身只负责"记"，永不因为今天记过就变只读/拒绝进入。
//
// 关键：绝不续用"已经发过消息"的对话。返回即归档（archiveChatOnExit）是异步且较慢的（先跑摘要API
// 再置 archived），若续用一条正在后台归档的对话，会话随后被封存，用户下一条消息就撞上"已归档不能操作"。
// 所以带消息的会话一律视作"这一段已经结束/正在封存"，重新开一段，不去碰它。
// - 今天有"进了但一句没说、也没归档"的空对话 → 复用它（避免反复点入口堆一堆空事件）
// - 有事件却还没建对话（理论上少见）→ 补建续上，不浪费这个事件
// - 否则 → 新建完成事件+对话，开全新的一段（同一天可多段，每段各自归档成独立的一页）
// 恒返回 {mode:'chat', completionEventId, conversationId}（保留 mode 字段兼容调用方形态）。
export function resolveTodayEntry() {
	for (const event of todayEvents()) {
		const conv = getConversationByCompletionEventId(event.id);
		if (conv && !conv.archived && conv.messages.length === 0) {
			return { mode: "chat", completionEventId: event.id, conversationId: conv.id };
		}
		if (!conv) {
			const created = createConversation(event.id);
			return { mode: "chat", completionEventId: event.id, conversationId: created.id };
		}
	}

	const created = createCompletionEvent({ contentId: THREE_GOOD_THINGS_CONTENT_ID, contentType: "daily_task", collectionId: null });
	const conv = createConversation(created.id);
	return { mode: "chat", completionEventId: created.id, conversationId: conv.id };
}
