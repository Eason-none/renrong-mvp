// 内容库加载与查询
// 数据源：图鉴来自项目根目录 content_library_draft_v1.json（运营产出的权威内容库草稿）；
// 每日任务池来自 daily_tasks.json（含 remove-pushflow 变更并入的原推送层 38 条，共 77 条）。
// 这一层只做加载/查询，不做去重/随机/状态机逻辑——那是状态机层的职责。
// 注意：不再读取 content_library_draft_v1.json 的 push_content 字段（仅作运营历史档案）。

import rawLibrary from "../../content_library_draft_v1.json" with { type: "json" };
import dailyTasksRaw from "./daily_tasks.json" with { type: "json" };

// 按 id 反查每日任务条目（含并入的原 push_xxx 条目）——历史 push 完成事件的标题反查也走这里
export function getDailyTaskById(id) {
	return dailyTasksRaw.find((t) => t.id === id);
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
