// 断言脚本：时刻推断纯函数（openspec: add-instant-moment-fit tasks 1.2）
// 运行：node scripts/verify-momentInference.mjs
import assert from "node:assert/strict";
import { getMomentBucket, inferMomentScenes, preferMomentCandidates } from "../src/state/momentInference.js";

// 2026-07-08 是周三（工作日），2026-07-11 是周六（周末）
const weekday = (h, m = 0) => new Date(2026, 6, 8, h, m);
const weekend = (h, m = 0) => new Date(2026, 6, 11, h, m);

// ---- 1. 时段桶边界（整点归属 + 跨零点） ----
assert.equal(getMomentBucket(weekday(5, 59)), "late-night");
assert.equal(getMomentBucket(weekday(6, 0)), "morning");
assert.equal(getMomentBucket(weekday(8, 59)), "morning");
assert.equal(getMomentBucket(weekday(9, 0)), "daytime");
assert.equal(getMomentBucket(weekday(17, 59)), "daytime");
assert.equal(getMomentBucket(weekday(18, 0)), "evening");
assert.equal(getMomentBucket(weekday(21, 59)), "evening");
assert.equal(getMomentBucket(weekday(22, 0)), "late-night");
assert.equal(getMomentBucket(weekday(0, 30)), "late-night");
console.log("PASS 时段桶边界");

// ---- 2. 工作日/周末规则表分支 ----
// 工作日白天：workspace 在表内、market 不在
assert.deepEqual(inferMomentScenes(weekday(14), ["workspace", "market"]), ["workspace"]);
// 周末白天：market 在表内、workspace 不在
assert.deepEqual(inferMomentScenes(weekend(14), ["workspace", "market"]), ["market"]);
// 深夜两种日子都只剩 home
assert.deepEqual(inferMomentScenes(weekday(23), ["home", "market", "gym"]), ["home"]);
assert.deepEqual(inferMomentScenes(weekend(2), ["home", "canteen"]), ["home"]);
console.log("PASS 工作日/周末分支");

// ---- 3. 交集为空 / 档案为空 → null（调用方回落） ----
assert.equal(inferMomentScenes(weekday(14), ["driving"]), null); // 工作日白天表内无 driving
assert.equal(inferMomentScenes(weekday(23), ["market", "canteen"]), null);
assert.equal(inferMomentScenes(weekday(14), []), null);
assert.equal(inferMomentScenes(weekday(14), undefined), null);
console.log("PASS 空交集回落");

// ---- 4. general 永不进推断结果（由候选补足机制兜底，不属于推断层） ----
const withGeneral = inferMomentScenes(weekday(23), ["home", "general"]);
assert.deepEqual(withGeneral, ["home"]);
console.log("PASS general 不进推断表");

// ---- 5. 软优先：相容排前、不相容不优先、无标中性、永不丢候选 ----
const cands = [
	{ id: "a" }, // 无标：中性
	{ id: "b", moments: ["evening"] }, // 桶不符
	{ id: "c", moments: ["daytime"] }, // 桶相容 → 优先
	{ id: "d", moments: ["daytime"], weather_affinity: ["rain"] }, // 桶符但天气不符
	{ id: "e", weather_affinity: ["rain"] }, // 纯天气标，雨天时优先
];
// 工作日白天 + 雨：c、d、e 相容（d 桶+雨都符，e 纯雨符）
let ordered = preferMomentCandidates(cands, weekday(14), "雷阵雨转多云");
assert.deepEqual(ordered.map((t) => t.id), ["c", "d", "e", "a", "b"]);
// 无天气缓存：只有 c 优先（d、e 有天气标但无天气可判 → 不相容）
ordered = preferMomentCandidates(cands, weekday(14), null);
assert.deepEqual(ordered.map((t) => t.id), ["c", "a", "b", "d", "e"]);
// 晴天：c 优先，d/e 是 rain 标不相容
ordered = preferMomentCandidates(cands, weekday(14), "晴");
assert.deepEqual(ordered.map((t) => t.id), ["c", "a", "b", "d", "e"]);
// 天气文本匹配不上 rain/sunny → 视为无天气信号
ordered = preferMomentCandidates(cands, weekday(14), "多云");
assert.deepEqual(ordered.map((t) => t.id), ["c", "a", "b", "d", "e"]);
// 无任何相容条目 → 原样返回（引用与顺序都不变）
const neutral = [{ id: "x" }, { id: "y", moments: ["late-night"] }];
assert.deepEqual(preferMomentCandidates(neutral, weekday(14), null).map((t) => t.id), ["x", "y"]);
// 永不丢候选
assert.equal(ordered.length, cands.length);
assert.deepEqual([...ordered].map((t) => t.id).sort(), cands.map((t) => t.id).sort());
console.log("PASS 软优先排序");

console.log("verify-momentInference: 全部通过");
