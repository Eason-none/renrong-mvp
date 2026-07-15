// 统一的 LLM API 反向代理：Qwen + DeepSeek 共用一个进程。
//
// 存在的理由：真实 API key 只应该活在这个进程的环境变量里。此前 src/api/*.js 直接读
// import.meta.env.VITE_QWEN_API_KEY / VITE_DEEPSEEK_API_KEY，这类 VITE_ 前缀变量会被 Vite
// 静态替换进客户端产物（H5 bundle、小程序包都能被解包读出明文），等于把 key 随构建物一起发布了。
// 这个代理把"谁能调用上游模型"收回到服务端，客户端此后不再持有、也不再发送真实 key。
//
// 用法：node scripts/api-proxy.js
// 读取的环境变量（来自 .env.local，均不带 VITE_ 前缀，Vite 不会把它们打进客户端产物）：
//   QWEN_BASE_URL / QWEN_API_KEY
//   DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY
//
// 路由：
//   /qwen-proxy/*      → QWEN_BASE_URL/*      （Authorization 由本进程注入，覆盖客户端传来的值）
//   /deepseek-proxy/*  → DEEPSEEK_BASE_URL/*   （同上）
//
// 部署：普通 Node HTTP 服务，不依赖任何云厂商 SDK，能跑在任意支持 Node 的宿主上
// （VPS + nginx/Caddy 反代、微信云托管的自定义容器等）。上线前还需要：申请一个真实 HTTPS 域名、
// 把该域名加入微信小程序后台"服务器域名"白名单——这两步是账号/基础设施层面的操作，需要人来做，
// 本脚本只负责代理本身。

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

// 不引入 dotenv 依赖（未装在本项目里）——手写几行解析 .env.local 已经够用。
function loadEnvLocal() {
	const envPath = path.resolve(__dirname, '../.env.local')
	if (!fs.existsSync(envPath)) return
	for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eq = trimmed.indexOf('=')
		if (eq === -1) continue
		const key = trimmed.slice(0, eq).trim()
		const value = trimmed.slice(eq + 1).trim()
		if (!(key in process.env)) process.env[key] = value
	}
}
loadEnvLocal()

const ROUTES = {
	'/qwen-proxy': { base: process.env.QWEN_BASE_URL, key: process.env.QWEN_API_KEY, label: 'Qwen' },
	'/deepseek-proxy': { base: process.env.DEEPSEEK_BASE_URL, key: process.env.DEEPSEEK_API_KEY, label: 'DeepSeek' },
}

for (const [prefix, route] of Object.entries(ROUTES)) {
	if (!route.base || !route.key) {
		const varNames = prefix === '/qwen-proxy' ? 'QWEN_BASE_URL / QWEN_API_KEY' : 'DEEPSEEK_BASE_URL / DEEPSEEK_API_KEY'
		console.error(`缺少环境变量：${route.label} 需要 ${varNames}（在 .env.local 里配置）`)
		process.exit(1)
	}
}

const PORT = parseInt(process.env.PROXY_PORT || '5555', 10)

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function matchRoute(pathname) {
	return Object.entries(ROUTES).find(([prefix]) => pathname.startsWith(prefix))
}

http
	.createServer((req, res) => {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, CORS_HEADERS)
			res.end()
			return
		}

		const matched = matchRoute(req.url)
		if (!matched) {
			res.writeHead(404, CORS_HEADERS)
			res.end('未知路由，期望 /qwen-proxy/* 或 /deepseek-proxy/*')
			return
		}

		const [prefix, route] = matched
		const target = new URL(route.base)
		const upstreamPath = target.pathname + req.url.slice(prefix.length)

		// 不把浏览器的 Origin/Referer 转发给上游：部分上游（如阿里云网关）看到 Origin 会
		// 自己生成一套 CORS 响应头，和下面注入的 CORS_HEADERS 叠成两个
		// Access-Control-Allow-Origin，浏览器视为非法 CORS 响应直接拒收。
		const fwdHeaders = { ...req.headers, host: target.hostname, authorization: `Bearer ${route.key}` }
		delete fwdHeaders.origin
		delete fwdHeaders.referer

		const options = {
			hostname: target.hostname,
			port: 443,
			path: upstreamPath,
			method: req.method,
			// 真实 key 由代理注入，完全覆盖客户端传来的 Authorization——客户端此后不发送真实 key。
			headers: fwdHeaders,
		}

		const upstream = https.request(options, (upRes) => {
			// 同理：剥掉上游可能带回的 access-control-* 头，CORS 只由本代理一处负责。
			const resHeaders = { ...upRes.headers }
			for (const name of Object.keys(resHeaders)) {
				if (name.toLowerCase().startsWith('access-control-')) delete resHeaders[name]
			}
			res.writeHead(upRes.statusCode, { ...resHeaders, ...CORS_HEADERS })
			upRes.pipe(res)
		})

		upstream.on('error', (err) => {
			res.writeHead(502, CORS_HEADERS)
			res.end(err.message)
		})

		req.pipe(upstream)
	})
	.listen(PORT, () => {
		console.log(`API 代理已启动：http://localhost:${PORT}`)
		for (const [prefix, route] of Object.entries(ROUTES)) {
			console.log(`  ${prefix} → ${route.base}`)
		}
	})
