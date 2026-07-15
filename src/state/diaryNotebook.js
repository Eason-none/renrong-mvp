// 手记册数据层（diary-notebook）：把散落的 CompletionSummary 聚成可翻阅的册子。
// 纯读取——只读 completionSummaries + 标题反查内容库，绝不写任何 storage 键。形态见
// openspec/changes/add-diary-notebook/design.md（本轮改版：按周陈列 + 幸福小事按天合并 + 卡面直显正文）。
//
// 展示模型（全部是读取端的重组，底层 CompletionSummary 不变）：
//   1. 每一条 summary_text 非空的 CompletionSummary = 一"页"。
//   2. 合成"条目(entry)"：幸福小事（three-good-things）同一自然日的多页合并成一条（标题"幸福时刻是："，
//      正文按当天时间顺序拼段）；其它内容（每日任务/图鉴/即时）一页一条，各自是独立记忆。
//   3. 条目按自然周分组（周一~周日）：主展示一屏一周，无条目的周不产生跨页；周序旧→新（打开落最新周），
//      周内条目按最近活动新→旧（最近的在上）。顶部/跳转导航仍以年月为单位。

import { get, KEYS } from "./storage.js";
import { getDailyTaskById, getCollectionItemById } from "../content/library.js";
import { THREE_GOOD_THINGS_CONTENT_ID, THREE_GOOD_THINGS_TITLE, THREE_GOOD_ENTRY_TITLE } from "./threeGoodThings.js";
import { getSummaryPhotos } from "./conversation.js";
import { timeOfDay } from "../utils/shareCard.js";

export { THREE_GOOD_ENTRY_TITLE };

// 标题三源都反查不到时的兜底。
export const FALLBACK_PAGE_TITLE = "一页手记";

// 标题反查：每日任务池 → 图鉴条目 → 三件幸福小事 → 兜底。
export function resolveTitle(contentId) {
	const dailyTask = getDailyTaskById(contentId);
	if (dailyTask && dailyTask.title) return dailyTask.title;
	const item = getCollectionItemById(contentId);
	if (item && item.title) return item.title;
	if (contentId === THREE_GOOD_THINGS_CONTENT_ID) return THREE_GOOD_THINGS_TITLE;
	return FALLBACK_PAGE_TITLE;
}

const DAY_MS = 86400000;

function startOfDay(ts) {
	const d = new Date(ts);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayKey(ts) {
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 周一为一周起点：返回该周周一 00:00 的时间戳（中国无夏令时，按本地日历算即可）。
function startOfWeek(ts) {
	const d = new Date(ts);
	const dow = d.getDay(); // 0=周日, 1=周一, ... 6=周六
	const toMonday = dow === 0 ? -6 : 1 - dow;
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + toMonday).getTime();
}

// 页（summary_text 非空的 CompletionSummary）解析为展示就绪对象，按 completed_at 旧→新稳定排序。
function loadResolvedPages() {
	const summaries = get(KEYS.COMPLETION_SUMMARIES, []);
	return summaries
		.filter((s) => s && s.summary_text)
		.map((s) => ({
			id: s.id,
			contentId: s.content_id,
			completedAt: s.completed_at,
			summaryText: s.summary_text,
			photoThumb: s.photo_thumb ?? null,
			photos: getSummaryPhotos(s),
		}))
		.sort((a, b) => a.completedAt - b.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// 是否已长出第一页——首页入口"随第一页诞生出现"直接问这个。
export function hasAnyDiaryPage() {
	const summaries = get(KEYS.COMPLETION_SUMMARIES, []);
	return summaries.some((s) => s && s.summary_text);
}

// 全册时间线（2026-07-13，手记册卡片点开 TracePage 用）：条目序旧→新，
// 形状即 TracePage 可选 pages prop 要求的（title/completedAt/summaryText/photoThumb），
// 另带 id（=条目首段的页 id）供调用方定位起始页下标。
// 三件幸福小事在时间线上也按天合并成一页（与册面陈列一致，2026-07-13 用户反馈：
// 单页视图只见当天第一段像丢了记录）：当天多段时逐段带时段标签拼成整页正文；
// photos 汇当天全部照片（按记录顺序），photoThumb 保留首张供单图位兼容。
export function getBookTimeline() {
	return buildEntries().map((entry) => {
		const photos = entry.segments.flatMap((s) => s.photos ?? []);
		return {
			id: entry.segments[0].id,
			title: entry.title,
			completedAt: entry.segments[0].completedAt,
			summaryText:
				entry.segments.length > 1
					? entry.segments.map((s) => `${timeOfDay(new Date(s.completedAt).getHours())}\n${s.summaryText}`).join("\n\n")
					: entry.segments[0].summaryText,
			photoThumb: photos[0] ?? null,
			photos,
		};
	});
}

// 合成条目：幸福小事按自然日合并，其它一页一条。返回按创建时间旧→新的条目数组。
function buildEntries() {
	const pages = loadResolvedPages(); // 旧→新
	const entries = [];
	const threeGoodByDay = new Map();

	for (const page of pages) {
		const segment = { id: page.id, completedAt: page.completedAt, summaryText: page.summaryText, photoThumb: page.photoThumb, photos: page.photos };
		if (page.contentId === THREE_GOOD_THINGS_CONTENT_ID) {
			const k = dayKey(page.completedAt);
			let entry = threeGoodByDay.get(k);
			if (!entry) {
				entry = {
					key: `tg-${k}`,
					kind: "three-good",
					title: THREE_GOOD_ENTRY_TITLE,
					dayTs: startOfDay(page.completedAt),
					sortAt: page.completedAt,
					segments: [],
				};
				threeGoodByDay.set(k, entry);
				entries.push(entry);
			}
			entry.segments.push(segment); // pages 旧→新，段自然按当天时间顺序
			entry.sortAt = Math.max(entry.sortAt, page.completedAt);
		} else {
			entries.push({
				key: `pg-${page.id}`,
				kind: "single",
				title: resolveTitle(page.contentId),
				dayTs: startOfDay(page.completedAt),
				sortAt: page.completedAt,
				segments: [segment],
			});
		}
	}
	return entries;
}

// 主展示：按周分组，周序旧→新（末项=最新周，打开落此处）；周内条目按最近活动新→旧。
// 无条目的周不产生分组（无空格子）。每组附 year/month/label（年月，供顶部与跳转导航）+ rangeLabel（周区间）。
export function getNotebookWeeks() {
	const entries = buildEntries();
	const weekMap = new Map();
	for (const entry of entries) {
		const mondayTs = startOfWeek(entry.dayTs);
		const key = String(mondayTs);
		if (!weekMap.has(key)) weekMap.set(key, { key, mondayTs, entries: [] });
		weekMap.get(key).entries.push(entry);
	}

	const weeks = [...weekMap.values()].sort((a, b) => a.mondayTs - b.mondayTs);
	for (const w of weeks) {
		w.entries.sort((a, b) => b.sortAt - a.sortAt); // 周内最近在上
		// 年月标签取该周最新条目所属年月（用户进周先看到的就是它）
		const top = new Date(w.entries[0].sortAt);
		w.year = top.getFullYear();
		w.month = top.getMonth() + 1;
		w.label = `${w.year}年${w.month}月`;
		const mon = new Date(w.mondayTs);
		const sun = new Date(w.mondayTs + 6 * DAY_MS);
		w.rangeLabel = `${mon.getMonth() + 1}月${mon.getDate()}日 – ${sun.getMonth() + 1}月${sun.getDate()}日`;
	}
	return weeks;
}
