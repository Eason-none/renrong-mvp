// 推送层去重/刷新/重置（spec_v1.md §2.3、§3.1 AC1-AC4）
// 纯函数状态机：GlobalDoneSet 持久化经 storage.js；"换一个"刷新计数是单次推送实例内的临时会话状态，
// 由调用方持有 session 对象，本模块不在内部维护可变状态。

import { get, set, KEYS } from "./storage.js";
import { getPushPool } from "../content/library.js";

const MAX_REFRESH = 3;

function loadDoneSet() {
	return new Set(get(KEYS.PUSH_GLOBAL_DONE_SET, []));
}

function saveDoneSet(doneSet) {
	set(KEYS.PUSH_GLOBAL_DONE_SET, [...doneSet]);
}

// spec §2.3 GetPushCandidate(scene) 的池子部分：
// available = pool - GlobalDoneSet；池子耗尽时静默重置"该场景覆盖到的" GlobalDoneSet 子集。
function getAvailablePool(scene) {
	const pool = getPushPool(scene);
	const doneSet = loadDoneSet();
	let available = pool.filter((item) => !doneSet.has(item.id));
	if (available.length === 0 && pool.length > 0) {
		for (const item of pool) {
			doneSet.delete(item.id);
		}
		saveDoneSet(doneSet);
		available = pool;
	}
	return available;
}

// AC1：返回满足 scene 过滤、且不在 GlobalDoneSet 里的随机候选；不修改任何持久化状态。
export function pickPushCandidate(scene) {
	const available = getAvailablePool(scene);
	if (available.length === 0) return undefined;
	const index = Math.floor(Math.random() * available.length);
	return available[index];
}

// 开启一次推送实例：随机抽取候选，刷新计数归零。
export function createPushSession(scene) {
	return { scene, refreshCount: 0, item: pickPushCandidate(scene), exhausted: false };
}

// AC3/AC4："换一个"：从 available 重新随机抽取，不写入 GlobalDoneSet；同一实例内最多刷新3次。
export function refreshPushSession(session) {
	if (session.refreshCount >= MAX_REFRESH) {
		return { ...session, exhausted: true };
	}
	return {
		...session,
		refreshCount: session.refreshCount + 1,
		item: pickPushCandidate(session.scene),
		exhausted: false,
	};
}

// 点击"做完啦"：把 content_id 写入 GlobalDoneSet（全局、不分场景）。
export function markPushDone(contentId) {
	const doneSet = loadDoneSet();
	doneSet.add(contentId);
	saveDoneSet(doneSet);
}

export function getGlobalDoneSet() {
	return loadDoneSet();
}
