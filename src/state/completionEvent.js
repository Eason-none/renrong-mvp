// CompletionEvent创建 + 聊聊邀请触发（spec_v1.md §3.2 AC1-AC3）
// "做完啦"点击的入口：立即创建CompletionEvent，不依赖/不强制随后的聊天（AC1）。
// AC2的邀请文案是全产品统一一句固定文案（product_handoff.md §6.5.1定稿），本模块只导出常量，
// 由UI层（Task17起）负责展示；这一层不做任何渲染。
// AC3：本模块不创建Conversation——"跳过聊天"在这一层就是"什么都不做"，天然成立，
// 不需要额外的"跳过"分支。

import { get, set, KEYS } from "./storage.js";
import { getCollectionState, recordCollectionItemCompletion } from "./collectionMachine.js";

// product_handoff.md §6.5.1 定稿文案：全产品统一一句，不分内容类型。
export const COMPLETION_INVITE_TEXT = "刚才做的这件事给你带来了什么感受吗？很愿意听你聊聊";

function generateId() {
	return `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// "push" 保留在白名单里只为历史事件的读取/反查兼容（remove-pushflow 变更后
// 推送层已删除，代码里不再有任何创建 push 类型事件的入口）。
const VALID_CONTENT_TYPES = ["push", "collection_item", "daily_task"];

// AC1：立即创建CompletionEvent，无需任何验证/评分，且不依赖是否随后聊天。
export function createCompletionEvent({ contentId, contentType, collectionId }) {
	if (!VALID_CONTENT_TYPES.includes(contentType)) {
		throw new Error(`createCompletionEvent: 非法 contentType: ${contentType}`);
	}
	if (contentType === "collection_item" && !collectionId) {
		throw new Error("createCompletionEvent: contentType为collection_item时collectionId必填");
	}
	// 在落盘前就校验图鉴状态机的前提条件，避免"recordCollectionItemCompletion 事后才抛错"
	// 导致一个被拒绝的完成事件已经写进了storage——校验和持久化必须保持原子性。
	if (contentType === "collection_item" && getCollectionState(collectionId).status === "locked") {
		throw new Error(`createCompletionEvent: collection ${collectionId} 处于 locked 状态，不应产生完成事件`);
	}

	const event = {
		id: generateId(),
		content_id: contentId,
		content_type: contentType,
		// null而非undefined：参照collectionMachine.js的doubt-driven复核结论，
		// undefined的字段会被storage落盘时的JSON序列化直接丢掉，造成往返后字段形状不一致。
		collection_id: contentType === "collection_item" ? collectionId : null,
		completed_at: Date.now(),
	};

	const events = get(KEYS.COMPLETION_EVENTS, []);
	events.push(event);
	set(KEYS.COMPLETION_EVENTS, events);

	// daily_task 完成不驱动图鉴状态机——独立轨道，无联动。
	// （push 类型的 GlobalDoneSet 副作用已随推送层删除；历史 push 事件只读不再产生。）
	if (contentType === "collection_item") {
		recordCollectionItemCompletion(collectionId);
	}

	return event;
}

// 纯查询，供Task24历史回顾角标用content_id反查标题——不参与任何状态机写入。
export function getCompletionEvent(id) {
	return get(KEYS.COMPLETION_EVENTS, []).find((e) => e.id === id);
}
