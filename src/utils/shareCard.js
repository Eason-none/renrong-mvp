// 分享卡数据模型（share-card spec / add-share-cards design.md D1、D5）
// 纯函数层：只组装绘制所需的数据，不做任何绘制。红线在类型上成立——
// 模型不接收、不输出任何计数/进度/次数字段，卡面上唯一的数字是完成日期。
import { THREE_GOOD_THINGS_TITLE, THREE_GOOD_ENTRY_TITLE } from "../state/threeGoodThings.js";

// slogan 常量唯一来源（design.md D5），措辞与品牌定稿一致（handoff v8.6 §一）
export const SHARE_SLOGAN = "给生活做点丰容";

// 与 TracePage 同一套"日 + 时段"粒度：重逢语义里重要的是"那天"，不是时间戳
const TIME_BUCKETS = [
	[5, "清晨"],
	[8, "上午"],
	[11, "中午"],
	[13, "下午"],
	[17, "傍晚"],
	[19, "晚上"],
	[22, "深夜"],
];

export function timeOfDay(hour) {
	for (let i = TIME_BUCKETS.length - 1; i >= 0; i--) {
		if (hour >= TIME_BUCKETS[i][0]) return TIME_BUCKETS[i][1];
	}
	return "深夜";
}

export function formatCardDate(ts) {
	const d = new Date(ts);
	return `${d.getMonth() + 1}月${d.getDate()}日 · ${timeOfDay(d.getHours())}`;
}

// 手记页卡：有照片 → photo 版（纵向拼贴，最多 3 张，原比例不裁切），否则 text 版
//（三件幸福小事与普通日记页共用 text 版）。
// 摘要是 DeepSeek 生成的散文，不保证结构——三件幸福小事的摘要恰好多行时才逐行作条目（叶形符号），
// 单段散文按段落排，不硬拆结构。手记册按天合并的页（标题=THREE_GOOD_ENTRY_TITLE）正文里
// 混着"上午/晚上"这类时段标签行，那不是条目——含标签行时按段落排，不出叶形符号。
const TIME_LABELS = new Set(TIME_BUCKETS.map((b) => b[1]));

// 卡面照片上限：纵向拼贴取前 3 张（多的在 TracePage 里能看全；卡片是节选性质，
// 与回顾卡默认节选同一产品态度）。不出现"+N"角标——那是数字，踩卡面红线。
export const CARD_PHOTO_MAX = 3;

export function buildDiaryCardModel(page) {
	const lines = String(page.summaryText || "")
		.split(/\n+/)
		.map((s) => s.trim())
		.filter(Boolean);
	const isThreeGood = page.title === THREE_GOOD_THINGS_TITLE || page.title === THREE_GOOD_ENTRY_TITLE;
	const allPhotos = Array.isArray(page.photos) && page.photos.length ? page.photos.filter(Boolean) : page.photoThumb ? [page.photoThumb] : [];
	const photos = allPhotos.slice(0, CARD_PHOTO_MAX);
	return {
		kind: photos.length ? "photo" : "text",
		date: formatCardDate(page.completedAt),
		title: page.title || "",
		lines,
		bullets: isThreeGood && lines.length > 1 && !lines.some((l) => TIME_LABELS.has(l)),
		photos,
		photoThumb: photos[0] ?? null,
		slogan: SHARE_SLOGAN,
	};
}

// 回顾卡默认节选：首个换行前的第一段；无换行则前 120 字加省略号（share-card spec）
const EXCERPT_MAX = 120;

export function excerptReviewText(text) {
	const t = String(text || "").trim();
	const nl = t.indexOf("\n");
	if (nl > 0) return t.slice(0, nl).trim();
	if (t.length <= EXCERPT_MAX) return t;
	return t.slice(0, EXCERPT_MAX) + "……";
}

export function buildReviewCardModel(reviewText, collectionName, useFullText = false) {
	const t = String(reviewText || "").trim();
	const paragraphs = useFullText
		? t.split(/\n+/).map((s) => s.trim()).filter(Boolean)
		: [excerptReviewText(t)];
	return {
		kind: "letter",
		collectionName: collectionName || "",
		paragraphs,
		excerpted: !useFullText,
		slogan: SHARE_SLOGAN,
	};
}
