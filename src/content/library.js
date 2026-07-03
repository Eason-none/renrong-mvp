// 内容库加载与查询（spec_v1.md §2.1, §2.3, §3.1）
// 数据源：项目根目录的 content_library_draft_v1.json（运营产出的权威内容库草稿）。
// 这一层只做加载/查询，不做去重/随机/状态机逻辑——那是 Task5 起的状态机层的职责。

import rawLibrary from "../../content_library_draft_v1.json" with { type: "json" };
import dailyTasksRaw from "./daily_tasks.json" with { type: "json" };

export function getAllPushContent() {
	return rawLibrary.push_content;
}

export function getPushContentById(id) {
	return rawLibrary.push_content.find((item) => item.id === id);
}

// spec §2.3 GetPushCandidate: pool = PushContentItem where scene ∈ item.scene
export function getPushPool(scene) {
	return rawLibrary.push_content.filter((item) => item.scene.includes(scene));
}

export function getAllCollections() {
	return rawLibrary.collections;
}

export function getCollectionById(collectionId) {
	return rawLibrary.collections.find((c) => c.id === collectionId);
}

export function getCollectionItemById(itemId) {
	for (const collection of rawLibrary.collections) {
		const item = collection.items.find((i) => i.id === itemId);
		if (item) return item;
	}
	return undefined;
}

// 按场景标签抽取每日任务候选（daily-task-content spec）
// sceneTags: string[]（用户偏好标签集合）；excludeIds: string[]（已在 DailyTaskPool 中的 id）
export function getDailyTaskCandidates(sceneTags, excludeIds = []) {
	const all = dailyTasksRaw.filter((t) => !excludeIds.includes(t.id));

	function shuffle(arr) {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	const hasTags = sceneTags && sceneTags.length > 0;
	const matched = hasTags
		? all.filter((t) => t.scene_tags.some((tag) => sceneTags.includes(tag) && tag !== "general"))
		: [];

	const generalPool = all.filter((t) => t.scene_tags.includes("general") && !matched.some((m) => m.id === t.id));

	const picked = shuffle(matched).slice(0, 3);
	if (picked.length < 3) {
		const need = 3 - picked.length;
		picked.push(...shuffle(generalPool).slice(0, need));
	}
	return picked;
}
