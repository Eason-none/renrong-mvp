// analytics.js 轻量运行时断言脚本（openspec: add-metrics-system, specs/analytics-events）
// 单文件直接跑：node scripts/verify-analytics.mjs
// mock uni（storage + request），request 可编程成功/失败以覆盖队列路径。

const memory = new Map();
let requests = []; // 捕获出网载荷
let nextRequestOk = true; // 控制下一次 request 成败

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
	request(options) {
		requests.push(options);
		if (nextRequestOk) {
			options.success({ statusCode: 201 });
		} else {
			options.fail({ errMsg: "request:fail mock" });
		}
	},
};

const { KEYS } = await import("../src/state/storage.js");
const { track, flushQueue, getAnonId, _overrideConfigForVerify } = await import(
	"../src/state/analytics.js"
);

let failed = false;

function assert(cond, label) {
	if (cond) {
		console.log(`PASS: ${label}`);
	} else {
		failed = true;
		console.error(`FAIL: ${label}`);
	}
}

// track 内部 send 是 microtask 链，flush 到位后再断言
const settle = () => new Promise((r) => setTimeout(r, 0));

// ---- 1. 未配置/DEV 形态：整体 no-op ----
_overrideConfigForVerify({ url: "", key: "", dev: false });
track("session_start");
await settle();
assert(requests.length === 0, "未配置 URL/key 时不发任何请求");

_overrideConfigForVerify({ url: "https://x.supabase.co", key: "k", dev: true });
track("session_start");
await settle();
assert(requests.length === 0, "DEV 构建不发任何请求");

// ---- 2. anon_id：首次生成、此后复用、UUID 形状 ----
_overrideConfigForVerify({ dev: false });
const id1 = getAnonId();
const id2 = getAnonId();
assert(id1 === id2, "anon_id 首次生成后复用同一个值");
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id1), "anon_id 是 v4 UUID 形状");
assert(memory.get(KEYS.ANALYTICS_ANON_ID) === id1, "anon_id 已持久化");

// ---- 3. 载荷白名单：字段恰好六个，个人信息字段传了也不出网 ----
track("task_completed", {
	content_type: "collection_item",
	content_id: "item_001",
	collection_id: "collection_001",
	player_id: "小明", // 恶意/误传字段，必须被白名单丢弃
	birth_date: "2000-01-01",
});
await settle();
assert(requests.length === 1, "启用后 track 发出请求");
const sent = requests[0].data[0];
assert(
	JSON.stringify(Object.keys(sent).sort()) ===
		JSON.stringify(["anon_id", "client_ts", "collection_id", "content_id", "content_type", "event"]),
	"载荷字段恰为白名单六个（误传的个人信息字段被丢弃）"
);
assert(sent.anon_id === id1 && sent.event === "task_completed" && sent.content_id === "item_001", "载荷字段值正确");
assert(requests[0].url.endsWith("/rest/v1/events"), "POST 到 /rest/v1/events");

// ---- 3.5 chat_engaged：只在第一条用户消息上报、每对话至多一次（聊聊率防虚高口径）----
// 走真实 conversation 模块端到端验证埋点位置，而不是直接调 track。
const conversation = await import("../src/state/conversation.js");
requests = [];
const chatConv = conversation.createConversation("evt_chat_engaged_test");
assert(requests.length === 0, "点聊聊创建对话不上报（空对话不入聊聊率分子）");
conversation.addUserMessage(chatConv.id, "第一句话");
await settle();
assert(requests.length === 1 && requests[0].data[0].event === "chat_engaged", "第一条用户消息上报 chat_engaged");
conversation.addUserMessage(chatConv.id, "第二句话");
await settle();
assert(requests.length === 1, "同一对话后续消息不重复上报");

// ---- 4. 失败入队，flush 补发且 client_ts 不变 ----
requests = [];
nextRequestOk = false;
track("task_completed", { content_type: "daily_task", content_id: "dt_001" });
await settle();
let queue = memory.get(KEYS.ANALYTICS_QUEUE);
assert(queue.length === 1, "上报失败的事件进入待发队列");
const queuedTs = queue[0].client_ts;

nextRequestOk = true;
requests = [];
flushQueue();
await settle();
assert(requests.length === 1 && requests[0].data.length === 1, "flushQueue 整批补发队列事件");
assert(requests[0].data[0].client_ts === queuedTs, "补发不修改 client_ts");
assert(memory.get(KEYS.ANALYTICS_QUEUE).length === 0, "补发成功后队列清空");

// ---- 5. flush 失败：整批回队，不丢失 ----
nextRequestOk = false;
track("session_start");
await settle();
flushQueue();
await settle();
assert(memory.get(KEYS.ANALYTICS_QUEUE).length === 1, "flush 失败时事件回队不丢失");
memory.set(KEYS.ANALYTICS_QUEUE, []);

// ---- 6. 队列有界：201 条失败事件只留最新 200 条 ----
nextRequestOk = false;
for (let i = 0; i < 201; i++) {
	track("session_start");
}
await settle();
queue = memory.get(KEYS.ANALYTICS_QUEUE);
assert(queue.length === 200, "队列上限 200，超限不膨胀");

// ---- 7. 空队列 flush 不发请求 ----
memory.set(KEYS.ANALYTICS_QUEUE, []);
requests = [];
nextRequestOk = true;
flushQueue();
await settle();
assert(requests.length === 0, "空队列 flush 不发请求");

if (failed) {
	console.error("\nanalytics 断言失败");
	process.exit(1);
} else {
	console.log("\nanalytics 断言全部通过");
}
