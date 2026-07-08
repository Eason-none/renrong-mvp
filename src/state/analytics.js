// 匿名行为事件上报（openspec: add-metrics-system, specs/analytics-events）
// 三个事件、白名单载荷、完全静默——这层的任何失败都不允许泄漏到用户流程里。
//
// 隐私边界（spec 硬约束）：载荷只有 anon_id / event / content_type / content_id /
// collection_id / client_ts。用户称呼（player_id）、生日、场景标签、对话文本
// 永不出现在这里；anon_id 是本地随机 UUID，与用户任何输入和微信身份无关。
//
// 上报目标是 Supabase PostgREST 直插（design.md D1）：events 表 RLS 只允许
// anon INSERT。VITE_SUPABASE_URL 未配置或开发构建（DEV）时整体 no-op，
// 保证本地调试/H5 预览永远不产生脏数据。

import { get, set, KEYS } from "./storage.js";

// 只允许 import.meta.env.VITE_X / import.meta.env.DEV 这种完整形态的引用——
// Vite 在构建期把它们静态替换成字面量（项目里 qwen.js 等同此用法）。
// 裸引用 import.meta 会在 mp-weixin 的 CommonJS 产物里被 polyfill 成 require('url')，
// 小程序运行时没有该模块，app.js 直接崩（2026-07-08 真机验证实测）。
// Node 断言脚本下 import.meta.env 为 undefined、属性访问抛错 → catch 落到
// "未配置"形态（禁用），由脚本通过 _overrideConfigForVerify 注入测试配置。
let config = { url: "", key: "", dev: false };
try {
	config = {
		url: import.meta.env.VITE_SUPABASE_URL || "",
		key: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
		dev: !!import.meta.env.DEV,
	};
} catch (_) {
	// 非 Vite 环境（Node 断言脚本）：保持禁用形态
}

const QUEUE_LIMIT = 200;

// 仅供 scripts/verify-analytics.mjs 注入配置，业务代码不得调用。
export function _overrideConfigForVerify(partial) {
	config = { ...config, ...partial };
}

function enabled() {
	return !config.dev && !!config.url && !!config.key;
}

// RFC 4122 v4 形状的随机 UUID。小程序端 crypto.getRandomValues 不保证可用，
// Math.random 的随机质量对"区分匿名个体"这个用途足够（不做任何安全用途）。
function randomUuid() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export function getAnonId() {
	let id = get(KEYS.ANALYTICS_ANON_ID, "");
	if (!id) {
		id = randomUuid();
		set(KEYS.ANALYTICS_ANON_ID, id);
	}
	return id;
}

// 白名单组装：不管调用方传什么，出网的字段就这六个。
function buildEvent(event, props = {}) {
	return {
		anon_id: getAnonId(),
		event,
		content_type: props.content_type ?? null,
		content_id: props.content_id ?? null,
		collection_id: props.collection_id ?? null,
		client_ts: new Date().toISOString(),
	};
}

// resolve(true/false)，永不 reject——静默是这层的行为契约。
function send(rows) {
	return new Promise((resolve) => {
		try {
			uni.request({
				url: `${config.url}/rest/v1/events`,
				method: "POST",
				header: {
					apikey: config.key,
					Authorization: `Bearer ${config.key}`,
					"Content-Type": "application/json",
					Prefer: "return=minimal",
				},
				data: rows,
				success: (res) => resolve(res.statusCode >= 200 && res.statusCode < 300),
				fail: () => resolve(false),
			});
		} catch (_) {
			resolve(false);
		}
	});
}

function enqueue(row) {
	const queue = get(KEYS.ANALYTICS_QUEUE, []);
	queue.push(row);
	// 有界：超限丢最旧，storage 不无限膨胀
	while (queue.length > QUEUE_LIMIT) {
		queue.shift();
	}
	set(KEYS.ANALYTICS_QUEUE, queue);
}

// fire-and-forget：失败入队等下次启动补发，client_ts 保持事件真实发生时间。
export function track(event, props) {
	if (!enabled()) return;
	const row = buildEvent(event, props);
	send([row]).then((ok) => {
		if (!ok) enqueue(row);
	});
}

// App onShow 时先于 session_start 调用。乐观清空后整批发送，
// 失败的整批重新入队（enqueue 自带上界，与新产生的失败事件自然合流）。
export function flushQueue() {
	if (!enabled()) return;
	const queue = get(KEYS.ANALYTICS_QUEUE, []);
	if (queue.length === 0) return;
	set(KEYS.ANALYTICS_QUEUE, []);
	send(queue).then((ok) => {
		if (!ok) queue.forEach(enqueue);
	});
}
