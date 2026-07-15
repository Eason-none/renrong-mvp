// 断言脚本：分享卡数据模型（openspec: add-share-cards tasks 1.2）
// 运行：node scripts/verify-shareCard.mjs
import assert from "node:assert/strict";
import {
	SHARE_SLOGAN,
	formatCardDate,
	buildDiaryCardModel,
	buildReviewCardModel,
	excerptReviewText,
} from "../src/utils/shareCard.js";
import { THREE_GOOD_THINGS_TITLE, THREE_GOOD_ENTRY_TITLE } from "../src/state/threeGoodThings.js";

// ---- 1. 三版式分派 ----
const ts = new Date(2026, 6, 9, 18, 30).getTime(); // 7月9日 傍晚
const photoPage = { title: "Color Walk", completedAt: ts, summaryText: "云边上有一圈奶油色", photoThumb: "data:image/png;base64,xxx" };
const textPage = { title: "在通勤路上注意一件事", completedAt: ts, summaryText: "看到墙上的涂鸦" };

assert.equal(buildDiaryCardModel(photoPage).kind, "photo");
assert.equal(buildDiaryCardModel(textPage).kind, "text");
assert.equal(buildReviewCardModel("一段叙事", "颜色图鉴").kind, "letter");
console.log("PASS 三版式分派");

// ---- 2. 日期格式（日+时段粒度，与 TracePage 一致） ----
assert.equal(buildDiaryCardModel(photoPage).date, "7月9日 · 傍晚");
assert.equal(formatCardDate(new Date(2026, 6, 11, 23, 10).getTime()), "7月11日 · 深夜");
console.log("PASS 日期粒度");

// ---- 3. 三件幸福小事：多行才逐条（叶形符号），单段散文不硬拆 ----
const tgtMulti = { title: THREE_GOOD_THINGS_TITLE, completedAt: ts, summaryText: "食堂阿姨多给了一勺土豆\n雨停在出门前一分钟\n室友哼歌跑调但好听" };
const tgtSingle = { title: THREE_GOOD_THINGS_TITLE, completedAt: ts, summaryText: "说了食堂的土豆和雨停的巧合，语气轻快。" };
assert.equal(buildDiaryCardModel(tgtMulti).bullets, true);
assert.equal(buildDiaryCardModel(tgtMulti).lines.length, 3);
assert.equal(buildDiaryCardModel(tgtSingle).bullets, false);
// 普通页即使多行也不用叶形条目
const normalMulti = { title: "普通条目", completedAt: ts, summaryText: "第一段\n第二段" };
assert.equal(buildDiaryCardModel(normalMulti).bullets, false);
assert.equal(buildDiaryCardModel(normalMulti).lines.length, 2);
// 手记册合并页标题（幸福时刻是：）同样条目化；但含时段标签行（当天多段合并）时按段落排
const entryMulti = { title: THREE_GOOD_ENTRY_TITLE, completedAt: ts, summaryText: "土豆多了一勺\n雨停在出门前" };
assert.equal(buildDiaryCardModel(entryMulti).bullets, true);
const entryMerged = { title: THREE_GOOD_ENTRY_TITLE, completedAt: ts, summaryText: "上午\n土豆多了一勺\n\n晚上\n雨停在出门前" };
assert.equal(buildDiaryCardModel(entryMerged).bullets, false);
console.log("PASS 三件小事条目化");

// ---- 4. 回顾节选边界 ----
assert.equal(excerptReviewText("第一段。\n第二段。"), "第一段。"); // 有换行取首段
const short = "不到一百二十字的短叙事。";
assert.equal(excerptReviewText(short), short); // 短文不加省略号
const long = "字".repeat(200);
const ex = excerptReviewText(long);
assert.equal(ex.length, 122);
assert.ok(ex.endsWith("……"));
// 全文模式按段落切分
const full = buildReviewCardModel("第一段。\n\n第二段。\n第三段。", "颜色图鉴", true);
assert.deepEqual(full.paragraphs, ["第一段。", "第二段。", "第三段。"]);
assert.equal(full.excerpted, false);
const excerpted = buildReviewCardModel("第一段。\n第二段。", "颜色图鉴");
assert.deepEqual(excerpted.paragraphs, ["第一段。"]);
assert.equal(excerpted.excerpted, true);
console.log("PASS 节选边界");

// ---- 5. 红线：模型类型上不含任何计数/进度字段，slogan 唯一 ----
const DIARY_KEYS = ["kind", "date", "title", "lines", "bullets", "photos", "photoThumb", "slogan"].sort();
const LETTER_KEYS = ["kind", "collectionName", "paragraphs", "excerpted", "slogan"].sort();
assert.deepEqual(Object.keys(buildDiaryCardModel(photoPage)).sort(), DIARY_KEYS);
assert.deepEqual(Object.keys(buildReviewCardModel("x", "y")).sort(), LETTER_KEYS);
for (const banned of ["count", "times", "progress", "pct", "streak", "total"]) {
	assert.ok(!DIARY_KEYS.includes(banned) && !LETTER_KEYS.includes(banned), `模型不得含 ${banned}`);
}
assert.equal(buildDiaryCardModel(textPage).slogan, SHARE_SLOGAN);
assert.equal(buildReviewCardModel("x", "y").slogan, SHARE_SLOGAN);
console.log("PASS 红线字段");

// ---- 6. 纵向拼贴：photos 数组取前 3、旧单图升格、无图为 text 版 ----
const fourPhotos = { title: "x", completedAt: ts, summaryText: "y", photos: ["p1", "p2", "p3", "p4"] };
assert.deepEqual(buildDiaryCardModel(fourPhotos).photos, ["p1", "p2", "p3"]); // 上限3
assert.equal(buildDiaryCardModel(fourPhotos).kind, "photo");
assert.equal(buildDiaryCardModel(fourPhotos).photoThumb, "p1"); // 主图=首图
assert.deepEqual(buildDiaryCardModel(photoPage).photos, [photoPage.photoThumb]); // 旧单图升格为数组
assert.deepEqual(buildDiaryCardModel(textPage).photos, []);
console.log("PASS 纵向拼贴取前3");

console.log("verify-shareCard: 全部通过");
