// 微信云开发·普通云函数：LLM 反向代理（Qwen + DeepSeek 共用一个函数）。
//
// 存在的理由与 scripts/api-proxy.js 完全一致：真实 API key 只应活在服务端——这里是云函数的
// 环境变量。小程序端通过 wx.cloud.callFunction 调用，微信天然鉴权，只有本小程序能调，
// 因此无需公网域名、无需 ICP 备案、无需配 request 合法域名白名单。H5 端不走这里，仍走
// VITE_API_PROXY_URL 指向的 HTTP 代理（scripts/api-proxy.js）。
//
// 环境变量（在云函数控制台配置，与旧 .env.local 里不带 VITE_ 前缀的同名值一致）：
//   QWEN_BASE_URL / QWEN_API_KEY
//   DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY
//
// 入参 event：{ target: 'qwen' | 'deepseek', model, messages }
//   model 由小程序端从 VITE_QWEN_MODEL / VITE_DEEPSEEK_MODEL 带上来，云函数只转发不关心具体值。
// 返回：{ statusCode, data }
//   data 是上游 OpenAI 兼容响应的原始 JSON，客户端按 data.choices[0].message.content 读取，
//   与原 uni.request 的 { res.statusCode, res.data } 同形——客户端解析逻辑几乎不用改。
//
// 注意：普通云函数默认超时 3s，而 LLM 一次回答常需 5~15s，必须在控制台把执行超时调到 60s。

const https = require('https')
const { URL } = require('url')

const ROUTES = {
	qwen: { base: process.env.QWEN_BASE_URL, key: process.env.QWEN_API_KEY },
	deepseek: { base: process.env.DEEPSEEK_BASE_URL, key: process.env.DEEPSEEK_API_KEY },
}

// 真实 key 由云函数注入 Authorization；上游只拿到这一份，客户端从头到尾不持有真实 key。
function postJson(urlStr, key, bodyObj) {
	return new Promise((resolve, reject) => {
		const url = new URL(urlStr)
		const payload = JSON.stringify(bodyObj)
		const req = https.request(
			{
				hostname: url.hostname,
				port: 443,
				path: url.pathname + url.search,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(payload),
					Authorization: `Bearer ${key}`,
				},
			},
			(res) => {
				let raw = ''
				res.on('data', (chunk) => (raw += chunk))
				res.on('end', () => {
					let data
					try {
						data = JSON.parse(raw)
					} catch (e) {
						// 上游异常时可能返回非 JSON（网关 HTML 等），原样带回便于排查
						data = { rawText: raw }
					}
					resolve({ statusCode: res.statusCode, data })
				})
			},
		)
		req.on('error', reject)
		req.write(payload)
		req.end()
	})
}

exports.main = async (event) => {
	const { target, model, messages } = event || {}
	const route = ROUTES[target]
	if (!route) {
		return { statusCode: 400, data: { error: `未知 target：${target}，期望 'qwen' 或 'deepseek'` } }
	}
	if (!route.base || !route.key) {
		return { statusCode: 500, data: { error: `云函数缺少环境变量：${target} 的 BASE_URL / API_KEY 未配置` } }
	}
	// 与 api-proxy.js 的路由一致：上游路径 = BASE_URL + /chat/completions；
	// 小程序端不做流式，stream 恒为 false。
	const upstream = route.base.replace(/\/+$/, '') + '/chat/completions'
	try {
		return await postJson(upstream, route.key, { model, messages, stream: false })
	} catch (err) {
		return { statusCode: 502, data: { error: `上游请求失败：${err.message}` } }
	}
}
