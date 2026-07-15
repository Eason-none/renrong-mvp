// 图鉴状态机 + 完成度计算 + 棘轮（product_handoff.md v8 §5.3.0，docs/archive/spec_v1.md §2.2）
// 三态：locked -> active -> completed（completed 无任何退出路径）。
// 最多同时 3 个 active；completed 不占激活位。
// completion_pct 永远按当前真实分母（content 库里的 items.length）现算，不缓存，
// 这样"内容库扩容导致分母变化"天然反映在展示值上，不需要任何迁移逻辑。
// triggered_review_at_100pct 是棘轮：只提供"置 true"的单向操作，不提供重置/撤销的 API。

import { get, set, KEYS } from "./storage.js";
import { getCollectionById } from "../content/library.js";

function defaultState(collectionId) {
	return {
		collection_id: collectionId,
		status: "locked",
		triggered_review_at_100pct: false,
	};
}

function loadStates() {
	return get(KEYS.COLLECTION_UNLOCK_STATES, {});
}

function saveStates(states) {
	set(KEYS.COLLECTION_UNLOCK_STATES, states);
}

function writeState(collectionId, state) {
	const states = loadStates();
	states[collectionId] = state;
	saveStates(states);
	return state;
}

export function getCollectionState(collectionId) {
	const states = loadStates();
	return states[collectionId] ?? defaultState(collectionId);
}

export function getAllCollectionStates() {
	return loadStates();
}

// 激活位计数：只有 active 状态的图鉴占位；completed 不计（v8 设计：完成即释放激活位）。
export function countActiveCollections() {
	const states = getAllCollectionStates();
	return Object.values(states).filter((s) => s.status === "active").length;
}

// locked -> active；上限 3 个同时激活，超出时调用方应先 putDown 一个。
export function activate(collectionId) {
	const state = getCollectionState(collectionId);
	if (state.status !== "locked") {
		throw new Error(`activate: collection ${collectionId} 不处于 locked 状态（当前: ${state.status}）`);
	}
	const activeCount = countActiveCollections();
	if (activeCount >= 3) {
		throw new Error(`activate: 激活位已满（${activeCount}/3），先放下一个图鉴再激活`);
	}
	return writeState(collectionId, { ...state, status: "active" });
}

// active -> locked（"放下"：保留已完成条目记录，只释放激活位）。
// completed 无任何退出路径，尝试 putDown completed 图鉴会抛出。
export function putDown(collectionId) {
	const state = getCollectionState(collectionId);
	if (state.status !== "active") {
		throw new Error(`putDown: collection ${collectionId} 不处于 active 状态（当前: ${state.status}），无法放下`);
	}
	return writeState(collectionId, { ...state, status: "locked" });
}

// spec §2.2 completion_pct 公式：distinct content_id in CompletionEvent(collection_id==X) / items.length
// 纯函数版本，接受 completionEvents 入参，方便断言脚本直接构造场景，不依赖 storage。
export function computeCompletionPct(collectionId, completionEvents) {
	const collection = getCollectionById(collectionId);
	// 找不到 collection 是数据完整性问题，不能静默算成 0——否则已完成的图鉴会因找不到分母
	// 而永远卡在棘轮未触发状态，且没有任何报错信号（doubt-driven 复核发现）。
	if (!collection) {
		throw new Error(`computeCompletionPct: 找不到 collection ${collectionId}`);
	}
	if (collection.items.length === 0) return 0;
	const doneIds = new Set(
		completionEvents
			.filter((e) => e.content_type === "collection_item" && e.collection_id === collectionId)
			.map((e) => e.content_id)
	);
	return doneIds.size / collection.items.length;
}

export function getCompletionPct(collectionId) {
	const completionEvents = get(KEYS.COMPLETION_EVENTS, []);
	return computeCompletionPct(collectionId, completionEvents);
}

// CompletionEvent 创建后由 completionEvent.js 调用：active 下做完条目时，
// 若完成度首次达到 100%，将状态推进到 completed（同时释放激活位）。
// completed 状态下是幂等 no-op（用户重复做同一条目时不会出错）。
export function recordCollectionItemCompletion(collectionId) {
	const state = getCollectionState(collectionId);
	if (state.status === "locked") {
		throw new Error(`recordCollectionItemCompletion: collection ${collectionId} 处于 locked 状态，不应产生完成事件`);
	}
	if (state.status === "completed") {
		return state;
	}

	const pct = getCompletionPct(collectionId);
	if (pct >= 1) {
		return writeState(collectionId, { ...state, status: "completed" });
	}
	return state;
}

// triggered_review_at_100pct 棘轮的"置 true"操作。由 reviewOrchestration 在生成首次回顾快照后调用。
// 返回 false：未处于 completed 或已触发过（调用方据此判断不需要再生成回顾）。
export function markReviewTriggered(collectionId) {
	const state = getCollectionState(collectionId);
	if (state.status !== "completed" || state.triggered_review_at_100pct) {
		return false;
	}
	writeState(collectionId, { ...state, triggered_review_at_100pct: true });
	return true;
}
