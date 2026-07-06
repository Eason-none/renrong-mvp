// Task 4 轻量运行时断言脚本：核对内容库数量与已知条目id，校验 getPushPool(scene) 过滤逻辑。
// 单文件直接跑：node scripts/verify-library.mjs

import * as library from "../src/content/library.js";

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

// 1. 推送层：38条，id 全部唯一
const pushContent = library.getAllPushContent();
assertEqual(pushContent.length, 38, "推送层共38条");
assertEqual(new Set(pushContent.map((i) => i.id)).size, 38, "推送层id全部唯一");

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
assertTrue(!!library.getPushContentById("push_001"), "push_001 可查到");
assertTrue(!!library.getCollectionItemById("color_001"), "color_001 可查到");
assertEqual(library.getCollectionItemById("nonexistent_id"), undefined, "查不存在的条目id返回undefined");

// 4. getPushPool(scene) 按scene正确过滤（spec §2.3：pool = item where scene ∈ item.scene）
const indoorShort = library.getPushPool("室内短");
assertEqual(indoorShort.length, 28, "室内短场景过滤数量正确");
assertTrue(
	indoorShort.every((item) => item.scene.includes("室内短")),
	"室内短场景过滤结果全部满足 scene 包含该场景"
);
assertTrue(
	pushContent.filter((item) => !item.scene.includes("室内短")).every((item) => !indoorShort.includes(item)),
	"室内短场景过滤结果不包含不满足条件的条目"
);

if (failed) {
	console.error("\nTask4 library 断言失败");
	process.exit(1);
} else {
	console.log("\nTask4 library 断言全部通过");
}
