// 内容库轻量运行时断言脚本：核对图鉴与每日任务池数量、id 唯一性、scene_tags 合法性。
// （remove-pushflow 变更后推送层已删除，原 38 条并入每日任务池，共 77 条。）
// 单文件直接跑：node scripts/verify-library.mjs

import * as library from "../src/content/library.js";
import dailyTasks from "../src/content/daily_tasks.json" with { type: "json" };

let failed = false;

function assertEqual(actual, expected, label) {
	if (actual !== expected) {
		failed = true;
		console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

function assertTrue(condition, label) {
	if (!condition) {
		failed = true;
		console.error(`FAIL: ${label}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

// 1. 每日任务池：77条（原生39 + 并入的原推送层38），id 唯一，scene_tags 全部合法
const VALID_TAGS = ["workspace", "classroom", "home", "transit", "walking", "driving", "convenience-store", "canteen", "gym", "market", "general"];
assertEqual(dailyTasks.length, 77, "每日任务池共77条");
assertEqual(new Set(dailyTasks.map((t) => t.id)).size, 77, "每日任务池id全部唯一");
assertTrue(
	dailyTasks.every((t) => Array.isArray(t.scene_tags) && t.scene_tags.length > 0 && t.scene_tags.every((tag) => VALID_TAGS.includes(tag))),
	"每条任务的scene_tags非空且全部来自11维集合"
);
assertTrue(
	dailyTasks.every((t) => t.id && t.title && t.hook && t.time && t.instructions),
	"每条任务的必填字段（id/title/hook/time/instructions）齐全"
);

// 2. 图鉴：11个已建图鉴（2026-07-06同步：感知5本+事件6本，共80条），条目数与已知齐全
const collections = library.getAllCollections();
assertEqual(collections.length, 11, "已建图鉴共11个");

const expectedCollections = {
	collection_001: { name: "颜色图鉴", count: 7 },
	collection_002: { name: "角落图鉴", count: 7 },
	collection_003: { name: "想法图鉴", count: 9 },
	collection_004: { name: "连接图鉴", count: 7 },
	collection_005: { name: "物件图鉴", count: 8 },
	collection_006: { name: "城市探索图鉴", count: 7 },
	collection_007: { name: "独处图鉴", count: 7 },
	collection_008: { name: "自然接触图鉴", count: 7 },
	collection_009: { name: "时间实验图鉴", count: 7 },
	collection_010: { name: "饮食探索图鉴", count: 7 },
	collection_011: { name: "人文空间图鉴", count: 7 },
};
for (const [id, expected] of Object.entries(expectedCollections)) {
	const collection = library.getCollectionById(id);
	assertTrue(!!collection, `图鉴 ${id} 存在`);
	assertEqual(collection.name, expected.name, `图鉴 ${id} 名称正确`);
	assertEqual(collection.items.length, expected.count, `图鉴 ${id} 条目数正确`);
}

// 3. 已知条目id可查
assertTrue(!!library.getDailyTaskById("push_001"), "并入的原推送层条目 push_001 可在每日任务池查到（历史事件标题反查依赖）");
assertTrue(!!library.getDailyTaskById("dt-002"), "原生每日任务 dt-002 可查到");
assertTrue(!!library.getCollectionItemById("color_001"), "color_001 可查到");
assertEqual(library.getCollectionItemById("nonexistent_id"), undefined, "查不存在的条目id返回undefined");

// 4. getDailyTaskCandidates 按 scene_tags 过滤 + 排除
const picked = library.getDailyTaskCandidates(["walking"], []);
assertTrue(picked.length > 0 && picked.length <= 3, "walking标签能抽到1-3条候选");
const walkingIds = dailyTasks.filter((t) => t.scene_tags.includes("walking")).map((t) => t.id);
const generalIds = dailyTasks.filter((t) => t.scene_tags.includes("general")).map((t) => t.id);
assertTrue(
	picked.every((t) => walkingIds.includes(t.id) || generalIds.includes(t.id)),
	"抽到的候选全部来自walking匹配池或general补足池"
);
const excludeAll = dailyTasks.map((t) => t.id);
assertEqual(library.getDailyTaskCandidates(["walking"], excludeAll).length, 0, "全部排除时返回空数组（即时抽取空态的依据）");

if (failed) {
	console.error("\nTask4 library 断言失败");
	process.exit(1);
} else {
	console.log("\nTask4 library 断言全部通过");
}
