// 手记册数据层断言（diary-notebook 改版）：幸福小事按天合并 + 按周分组（周一起始）+ 年月标签。
// mock uni，写法延续 verify-conversation.mjs。单文件直接跑：node scripts/verify-diaryNotebook.mjs

const memory = new Map();
globalThis.uni = {
	setStorageSync(key, value) {
		memory.set(key, value);
	},
	getStorageSync(key) {
		return memory.has(key) ? memory.get(key) : "";
	},
	removeStorageSync(key) {
		memory.delete(key);
	},
};

const { KEYS, set } = await import("../src/state/storage.js");
const notebook = await import("../src/state/diaryNotebook.js");
const { THREE_GOOD_THINGS_CONTENT_ID } = await import("../src/state/threeGoodThings.js");

let failed = false;

function assertEqual(actual, expected, label) {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a !== b) {
		failed = true;
		console.error(`FAIL: ${label}\n  expected: ${b}\n  actual:   ${a}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

function assertTrue(cond, label) {
	if (!cond) {
		failed = true;
		console.error(`FAIL: ${label}`);
	} else {
		console.log(`PASS: ${label}`);
	}
}

const TG = THREE_GOOD_THINGS_CONTENT_ID;

// 以某周的周一为锚，构造同周/跨周时间戳，避免硬编码真实星期
function mondayOf(y, m, d) {
	const dt = new Date(y, m - 1, d);
	const dow = dt.getDay();
	const off = dow === 0 ? -6 : 1 - dow;
	return new Date(y, m - 1, d + off);
}
function plusDays(mondayDate, n, hour = 12) {
	const d = new Date(mondayDate);
	d.setDate(d.getDate() + n);
	d.setHours(hour, 0, 0, 0);
	return d.getTime();
}
function seed(rows) {
	set(
		KEYS.COMPLETION_SUMMARIES,
		rows.map((r, i) => ({
			id: r.id ?? `cs${i}`,
			content_id: r.cid,
			completed_at: r.at,
			summary_text: r.txt ?? "x",
			photo_thumb: r.photo ?? null,
		}))
	);
}

const MON = mondayOf(2026, 7, 8);

// ---- 1. 空数据 ----
memory.clear();
assertEqual(notebook.getNotebookWeeks(), [], "空数据：无周");
assertEqual(notebook.hasAnyDiaryPage(), false, "空数据：hasAnyDiaryPage false");

// ---- 2. 幸福小事同一天多次 → 合并成一条 ----
memory.clear();
seed([
	{ cid: TG, at: plusDays(MON, 1, 9), txt: "早" },
	{ cid: TG, at: plusDays(MON, 1, 13), txt: "午", photo: "data:p" },
	{ cid: TG, at: plusDays(MON, 1, 21), txt: "晚" },
]);
let wk = notebook.getNotebookWeeks();
assertEqual(wk.length, 1, "合并：同周一条周");
assertEqual(wk[0].entries.length, 1, "合并：同一天幸福小事只成一条条目");
assertEqual(wk[0].entries[0].kind, "three-good", "合并：kind=three-good");
assertEqual(wk[0].entries[0].title, notebook.THREE_GOOD_ENTRY_TITLE, "合并：标题为“幸福时刻是：”");
assertEqual(wk[0].entries[0].segments.map((s) => s.summaryText), ["早", "午", "晚"], "合并：段按当天时间旧→新");
assertEqual(wk[0].entries[0].segments[1].photoThumb, "data:p", "合并：段内照片透传");

// 时间线（TracePage 单页视图）同样按天合并（2026-07-13 用户反馈：单页只见第一段像丢了记录）
let tl = notebook.getBookTimeline();
assertEqual(tl.length, 1, "时间线：当天多段合并为一页");
assertEqual(tl[0].title, notebook.THREE_GOOD_ENTRY_TITLE, "时间线：合并页标题=幸福时刻是：");
assertEqual(tl[0].summaryText, "上午\n早\n\n下午\n午\n\n晚上\n晚", "时间线：多段逐段带时段标签拼整页");
assertEqual(tl[0].photoThumb, "data:p", "时间线：照片取当天第一张非空");
// 单段的天不加时段标签（日期行本身已含时段）
memory.clear();
seed([{ cid: TG, at: plusDays(MON, 1, 9), txt: "只有一段" }]);
tl = notebook.getBookTimeline();
assertEqual(tl[0].summaryText, "只有一段", "时间线：单段天正文原样、不加时段标签");

// ---- 3. 幸福小事不同天不合并 ----
memory.clear();
seed([
	{ cid: TG, at: plusDays(MON, 1, 10), txt: "周二" },
	{ cid: TG, at: plusDays(MON, 3, 10), txt: "周四" },
]);
wk = notebook.getNotebookWeeks();
assertEqual(wk.length, 1, "不同天：仍同一周");
assertEqual(wk[0].entries.length, 2, "不同天：两条独立条目");

// ---- 4. 其它类型同一天不合并、不用幸福标题 ----
memory.clear();
seed([
	{ cid: "dt-002", at: plusDays(MON, 2, 9), txt: "任务A" },
	{ cid: "dt-002", at: plusDays(MON, 2, 20), txt: "任务B" },
]);
wk = notebook.getNotebookWeeks();
assertEqual(wk[0].entries.length, 2, "每日任务同一天不合并（不同活动=不同记忆）");
assertTrue(
	wk[0].entries.every((e) => e.kind === "single" && e.title !== notebook.THREE_GOOD_ENTRY_TITLE),
	"每日任务条目为 single、非幸福标题"
);

// ---- 5. 按周分组（周一起始）：周一~周日同周，下周一另起 ----
memory.clear();
seed([
	{ cid: "dt-002", at: plusDays(MON, 0, 12), txt: "本周一" },
	{ cid: "dt-002", at: plusDays(MON, 6, 12), txt: "本周日" },
	{ cid: "dt-002", at: plusDays(MON, 7, 12), txt: "下周一" },
]);
wk = notebook.getNotebookWeeks();
assertEqual(wk.length, 2, "周一~周日同周、下周一另起 → 2 周");
assertEqual(wk[0].entries.length, 2, "第一周含周一+周日两条");
assertTrue(wk[0].mondayTs < wk[1].mondayTs, "周序旧→新");

// ---- 6. 空周不占位（跨周） ----
memory.clear();
seed([
	{ cid: "dt-002", at: plusDays(MON, 1, 12), txt: "第1周" },
	{ cid: "dt-002", at: plusDays(MON, 21, 12), txt: "第4周" }, // 跳过中间两周
]);
wk = notebook.getNotebookWeeks();
assertEqual(wk.length, 2, "中间空周不产生跨页");
assertEqual(wk[wk.length - 1].entries[0].summaryText ?? wk[wk.length - 1].entries[0].segments[0].summaryText, "第4周", "最新周在末位（打开落点）");

// ---- 7. 周内条目新→旧 ----
memory.clear();
seed([
	{ cid: "dt-002", at: plusDays(MON, 1, 12), txt: "较早" },
	{ cid: "dt-002", at: plusDays(MON, 4, 12), txt: "较晚" },
]);
wk = notebook.getNotebookWeeks();
assertEqual(wk[0].entries.map((e) => e.segments[0].summaryText), ["较晚", "较早"], "周内最近在上（new→旧）");

// ---- 8. 年月标签 + 跨年排序 ----
memory.clear();
const DEC = mondayOf(2025, 12, 22);
const JAN = mondayOf(2026, 1, 5);
seed([
	{ cid: "dt-002", at: plusDays(DEC, 2, 12), txt: "去年末" },
	{ cid: "dt-002", at: plusDays(JAN, 2, 12), txt: "今年初" },
]);
wk = notebook.getNotebookWeeks();
assertEqual(wk.length, 2, "跨年：两周");
assertEqual(wk[0].label, "2025年12月", "跨年：首周标签 2025年12月");
assertEqual(wk[1].label, "2026年1月", "跨年：次周标签 2026年1月");
assertTrue(wk[0].mondayTs < wk[1].mondayTs, "跨年：周序旧→新");
assertTrue(notebook.hasAnyDiaryPage(), "有页：hasAnyDiaryPage true");

console.log(failed ? "\n=== 有断言失败 ===" : "\n=== 全部通过 ===");
process.exit(failed ? 1 : 0);
