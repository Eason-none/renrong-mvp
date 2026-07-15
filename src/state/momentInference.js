// 即时任务"此刻感"时刻推断（openspec: add-instant-moment-fit）
// 纯函数无副作用：时段桶 + 「桶 × 工作日/周末 → 合理场景」规则表，与档案 scene_tags 求交。
// general 不进表——由 getDailyTaskCandidates 的补足机制天然兜底。
// 桶名与亲和标签不进 UI、不进 analytics（机制对用户不可见）。

// 四档时段桶：morning 06-09 / daytime 09-18 / evening 18-22 / late-night 22-06（本地时间）
export function getMomentBucket(date) {
	const h = date.getHours();
	if (h >= 6 && h < 9) return "morning";
	if (h >= 9 && h < 18) return "daytime";
	if (h >= 18 && h < 22) return "evening";
	return "late-night";
}

const WEEKDAY_SCENES = {
	morning: ["home", "transit", "walking", "driving", "convenience-store"],
	daytime: ["workspace", "classroom", "canteen", "convenience-store", "walking"],
	evening: ["home", "transit", "walking", "driving", "convenience-store", "gym", "market"],
	"late-night": ["home"],
};

const WEEKEND_SCENES = {
	morning: ["home", "walking", "convenience-store"],
	daytime: ["home", "walking", "market", "convenience-store", "gym", "canteen"],
	evening: WEEKDAY_SCENES.evening,
	"late-night": ["home"],
};

// 此刻合理的场景子集（已与档案求交）。交集为空返回 null——调用方回落到纯档案行为，
// 推断层只做"大概率"不做"断言"（夜班、自由职业作息不在表内也永远抽得出）。
export function inferMomentScenes(date, profileTags) {
	if (!profileTags || !profileTags.length) return null;
	const day = date.getDay();
	const table = day === 0 || day === 6 ? WEEKEND_SCENES : WEEKDAY_SCENES;
	const plausible = table[getMomentBucket(date)];
	const matched = profileTags.filter((t) => plausible.includes(t));
	return matched.length ? matched : null;
}

// 当日缓存天气文本 → 亲和标签值（首版只做 rain/sunny，匹配不上视为无天气信号）
function weatherSignal(weatherText) {
	if (!weatherText) return null;
	if (weatherText.includes("雨")) return "rain";
	if (weatherText.includes("晴")) return "sunny";
	return null;
}

// 软优先：打标条目的全部亲和标均与当前时刻相容时排到前面（相对顺序不变）。
// moments 有标 → 必须含当前桶；weather_affinity 有标 → 必须命中已知天气（无天气可判即不相容）。
// 打标是亲和不是限定——无匹配时原样返回，任何候选都不会被过滤掉。
export function preferMomentCandidates(candidates, date, weatherText) {
	const bucket = getMomentBucket(date);
	const weather = weatherSignal(weatherText);
	const compatible = (t) => {
		const hasMoments = Array.isArray(t.moments) && t.moments.length > 0;
		const hasWeather = Array.isArray(t.weather_affinity) && t.weather_affinity.length > 0;
		if (!hasMoments && !hasWeather) return false; // 无标 = 中性，不享受优先
		if (hasMoments && !t.moments.includes(bucket)) return false;
		if (hasWeather && (!weather || !t.weather_affinity.includes(weather))) return false;
		return true;
	};
	const prefer = candidates.filter(compatible);
	if (!prefer.length) return candidates;
	return [...prefer, ...candidates.filter((t) => !compatible(t))];
}
