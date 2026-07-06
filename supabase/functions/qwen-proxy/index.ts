// Qwen反向代理：真实上游地址+key从Supabase secrets读（Deno.env.get），
// 客户端传来的Authorization一律被覆盖——客户端不持有、不发送真实key。
// 自包含（不依赖其他文件），可以直接粘贴进Supabase Dashboard的浏览器函数编辑器部署，
// 不强制要求装CLI；deepseek-proxy/index.ts是同样结构的另一份，两者故意不共享代码。

const FUNCTION_NAME = "qwen-proxy"
const BASE_URL_ENV = "QWEN_BASE_URL"
const API_KEY_ENV = "QWEN_API_KEY"

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

const baseUrl = Deno.env.get(BASE_URL_ENV)
const apiKey = Deno.env.get(API_KEY_ENV)
if (!baseUrl || !apiKey) {
	throw new Error(`缺少环境变量：需要 ${BASE_URL_ENV} 和 ${API_KEY_ENV}（在 Supabase Dashboard 的 Edge Functions Secrets 里配置）`)
}

Deno.serve(async (req: Request): Promise<Response> => {
	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS_HEADERS })
	}

	// 实测确认：Supabase传给函数的req.url路径是/qwen-proxy/chat/completions
	// （不带/functions/v1/这段平台路由前缀），剥掉函数名前缀，剩下的部分原样拼到真实上游base url后面。
	const url = new URL(req.url)
	const prefix = `/${FUNCTION_NAME}`
	const upstreamPath = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname
	const upstreamUrl = `${baseUrl}${upstreamPath}${url.search}`

	// 请求体在这里体量都很小（chat completions的JSON），直接读成文本转发，
	// 不用ReadableStream直通，省得处理浏览器/Deno fetch对流式请求体duplex选项的差异。
	const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text()

	const headers = new Headers(req.headers)
	headers.set("Authorization", `Bearer ${apiKey}`) // 真实key由代理注入，覆盖客户端传来的值
	headers.delete("host")

	let upstreamRes: Response
	try {
		upstreamRes = await fetch(upstreamUrl, { method: req.method, headers, body })
	} catch (err) {
		return new Response(String(err), { status: 502, headers: CORS_HEADERS })
	}

	// 响应体（含Qwen的SSE流式回答）直接透传，这一侧才是真正需要"流"的地方。
	const resHeaders = new Headers(upstreamRes.headers)
	for (const [k, v] of Object.entries(CORS_HEADERS)) resHeaders.set(k, v)

	return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders })
})
