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

// 1. 每日任务池：69条（合并后77，经 v8.4 条件四审计删改后现存69），id 唯一，scene_tags 全部合法
const VALID_TAGS = ["workspace", "classroom", "home", "transit", "walking", "driving", "convenience-store", "canteen", "gym", "market", "general"];
assertEqual(dailyTasks.length, 69, "每日任务池共69条");
assertEqual(new Set(dailyTasks.map((t) => t.id)).size, dailyTasks.length, "每日任务池id全部唯一");
assertTrue(
	dailyTasks.every((t) => Array.isArray(t.scene_tags) && t.scene_tags.length > 0 && t.scene_tags.every((tag) => VALID_TAGS.includes(tag))),
	"每条任务的scene_tags非空且全部来自11维集合"
);
assertTrue(
	dailyTasks.every((t) => t.id && t.title && t.hook && t.time && t.instructions),
	"每条任务的必填字段（id/title/hook/time/instructions）齐全"
);

// 1.5 moment 打标（add-instant-moment-fit 任务 2.1，2026-07-12 定稿：一区 6 条采纳、边缘候选不打）
const VALID_MOMENTS = ["morning", "daytime", "evening", "late-night"];
const VALID_WEATHER = ["rain", "sunny"];
assertTrue(
	dailyTasks.every((t) => t.moments === undefined || (Array.isArray(t.moments) && t.moments.length > 0 && t.moments.every((m) => VALID_MOMENTS.includes(m)))),
	"moments 字段缺省或为非空合法时段桶数组"
);
assertTrue(
	dailyTasks.every((t) => t.weather_affinity === undefined || (Array.isArray(t.weather_affinity) && t.weather_affinity.length > 0 && t.weather_affinity.every((w) => VALID_WEATHER.includes(w)))),
	"weather_affinity 字段缺省或为非空合法天气数组"
);
const taggedIds = dailyTasks.filter((t) => t.moments || t.weather_affinity).map((t) => t.id).sort();
assertEqual(
	JSON.stringify(taggedIds),
	JSON.stringify(["dt-002", "dt-013", "dt-018", "dt-046", "push_026", "push_031"]),
	"打标条目恰为定稿的 6 条（其余 63 条保持无标）"
);

// 2. 图鉴：8个已建图鉴（2026-07-11同步：角落图鉴、物件图鉴已删除，时间实验图鉴并入城市探索图鉴，颜色图鉴+2条光影主题，自然接触图鉴+1条），条目数与已知齐全
const collections = library.getAllCollections();
assertEqual(collections.length, 8, "已建图鉴共8个");

const expectedCollections = {
	collection_001: { name: "颜色图鉴", count: 8 },
	collection_003: { name: "想法图鉴", count: 8 },
	collection_004: { name: "联结图鉴", count: 7 },
	collection_006: { name: "城市探索图鉴", count: 10 },
	collection_007: { name: "独处图鉴", count: 7 },
	collection_008: { name: "自然接触图鉴", count: 9 },
	collection_010: { name: "饮食探索图鉴", count: 6 },
	collection_011: { name: "人文空间图鉴", count: 7 },
};
for (const [id, expected] of Object.entries(expectedCollections)) {
	const collection = library.getCollectionById(id);
	assertTrue(!!collection, `图鉴 ${id} 存在`);
	assertEqual(collection.name, expected.name, `图鉴 ${id} 名称正确`);
	assertEqual(collection.items.length, expected.count, `图鉴 ${id} 条目数正确`);
}

// 3. 已知条目id可查
// push_001 已于 v8.4 条件四审计删除（凝视手背类），改用审计后存活的 push_003 验证反查链；
// 已删条目的历史事件反查返回 undefined，由日记页"无标题兜底"承接（diaryNotebook）
assertTrue(!!library.getDailyTaskById("push_003"), "并入的原推送层条目 push_003 可在每日任务池查到（历史事件标题反查依赖）");
assertEqual(library.getDailyTaskById("push_001"), undefined, "审计已删条目反查返回 undefined（下游走无标题兜底）");
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
