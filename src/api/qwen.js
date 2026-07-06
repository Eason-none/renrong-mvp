// Qwen主对话API封装（product_handoff.md §11.1，文字+图片，流式）
// 架构前提：真实key只活在 scripts/api-proxy.js 进程里，前端不读取、不持有、不发送真实key，
// 统一打到本地/线上的代理（VITE_API_PROXY_URL），由代理转发给Qwen并注入真实Authorization。
//
// 真实流式调用验证发现：qwen3.7-plus是带"思考过程"的推理模型，SSE每个chunk的delta里
// reasoning_content（内心推理文字）和content（真正要展示给用户的回答）是分开输出的，
// 推理阶段content一直是空字符串。如果不过滤reasoning_content，UI会把模型的"内心戏"也展示
// 给用户，直接打破system prompt里"温柔的见证者"人设。下面只采集delta.content，丢弃reasoning_content。

const PROXY_URL = import.meta.env.VITE_API_PROXY_URL || "http://localhost:5555";
const MODEL = import.meta.env.VITE_QWEN_MODEL;
// Supabase部署的代理前面挡着一层网关，没有Authorization头会被网关本身拒绝（跟Qwen真实key无关）；
// anon key是Supabase项目里设计给客户端公开持有的值，不是敏感信息，只用来敲开网关，
// 代理内部还是会把它覆盖成真正的Qwen key再转发。本地scripts/api-proxy.js没有这层网关，
// 该变量留空时不发这个头，两种部署形态都兼容。
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 对应11.1定稿文本；previousSummary为null/undefined时省略"上次印象"那一段（仅redo场景注入）。
export function buildMainChatSystemPrompt({ contentTitle, instructions, previousSummary }) {
	const previousLine = previousSummary
		? `ta上次做这件事时，留下了这样的印象：${previousSummary}\n`
		: ""
	const continuityLine = previousSummary
		? '- 如果这次的事跟上次有关联，可以自然提一下上次的印象，但不要用"这是第二次/第三次"这种计数式的表达\n'
		: ""

	return `你是一个温柔的见证者，陪用户聊聊他们刚刚做完的一件"丰容"小事。你不是教练，不是治疗师，不是任务监督员。

这次用户刚完成的事：
标题：${contentTitle}
内容：${instructions}
${previousLine}
开场时，具体回指刚才这件事的内容（比如提一句你留意到的细节），发出一个开放的邀请，不要求用户必须回答什么问题，留出空间让ta自己说。

对话过程中：
- 不评价用户的表现，不说"你做得很好""你完成了""你坚持下来了"这类话
- 不给建议，不说"下次可以试试……"——你只在乎这一次，不引导未来
- 只反映和追问用户自己说出来的内容，把注意力还给ta说的话，不替ta下结论
- "不下结论"也包括不要给用户的感受加上你自己的解读或定性（比如"这不需要怎样""这说明了什么"）——哪怕语气温和，这类话本质上是在替用户的感受定调子，跟教导没有区别
- 单纯的反映/呼应（不带问句）本身就是合格的回应，不必每次都用问题把话抛回给用户
- 如果用户分享图片，先说说你在图片里看到了什么
- 对内容/发现可以表达真实的惊喜和好奇，但绝不对ta的表现做判断
- 回应控制在3句话以内，留白给用户
- 语气像一个安静的朋友，不像一个app或助手
- 不参与、不呼应"这次聊得是否该结束"的判断——这完全交给归档按钮和系统提示处理，跟你的回应无关。你的语气只反映用户此刻说的内容本身，不要因为对话轮次变多就主动把语气往"收尾"的方向带
${continuityLine}
不要做的事：
- 不判断用户是否"完成得对"或"完成得好"
- 不输出任何隐藏标记或结构化数据
- 不主动提起"归档"相关的事，归档是用户自己决定的，跟对话无关`
}

function toApiContent(content, image) {
	if (!image) return content
	return [
		{ type: "text", text: content },
		{ type: "image_url", image_url: { url: image } },
	]
}

// Conversation.messages（{role, content, image}）转成OpenAI兼容的messages数组；
// 历史长度裁剪是调用方的职责，本函数只管格式转换。
export function toApiMessages(messages) {
	return messages.map((m) => ({ role: m.role, content: toApiContent(m.content, m.image) }))
}

function parseSseLine(line, onDelta) {
	const trimmed = line.trim()
	if (!trimmed.startsWith("data:")) return
	const payload = trimmed.slice(5).trim()
	if (payload === "[DONE]" || payload === "") return
	const parsed = JSON.parse(payload)
	const text = parsed.choices?.[0]?.delta?.content
	if (text) onDelta(text)
}

// H5：浏览器原生fetch+ReadableStream，逐chunk解析SSE，真正做到逐字流式。
async function streamMainChatH5(systemPrompt, history, onDelta) {
	const res = await fetch(`${PROXY_URL}/qwen-proxy/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: "system", content: systemPrompt }, ...history],
			stream: true,
		}),
	})
	if (!res.ok) throw new Error(`Qwen API请求失败：${res.status} ${await res.text()}`)

	const reader = res.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""
	let full = ""

	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split("\n")
		buffer = lines.pop()
		for (const line of lines) {
			parseSseLine(line, (text) => {
				full += text
				onDelta(text)
			})
		}
	}
	return full
}

// mp-weixin：小程序沙箱JS环境没有fetch/ReadableStream，wx.request的chunked接收方式
// （enableChunked+onChunkReceived）未经真机/开发者工具验证，为避免交付一段无法验证是否真正工作
// 的解析代码，这里退化成一次性请求——拿到完整回答后一次性回调onDelta，调用方拿到的仍是同一套
// "增量回调"接口，不需要关心两端实现差异。流式动效在mp-weixin端的体验落差记录为已知风险，
// 留给Task26/27人工验收时确认是否需要后续升级。
function streamMainChatWeixin(systemPrompt, history, onDelta) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: `${PROXY_URL}/qwen-proxy/chat/completions`,
			method: "POST",
			header: {
				"Content-Type": "application/json",
				...(SUPABASE_ANON_KEY ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
			},
			data: {
				model: MODEL,
				messages: [{ role: "system", content: systemPrompt }, ...history],
				stream: false,
			},
			success: (res) => {
				if (res.statusCode !== 200) {
					reject(new Error(`Qwen API请求失败：${res.statusCode} ${JSON.stringify(res.data)}`))
					return
				}
				const text = res.data?.choices?.[0]?.message?.content ?? ""
				if (text) onDelta(text)
				resolve(text)
			},
			fail: (err) => reject(new Error(`Qwen API请求失败：${err.errMsg}`)),
		})
	})
}

// 流式主对话：systemPrompt用buildMainChatSystemPrompt生成，history是toApiMessages的结果。
// onDelta(text)每收到一段真正的回答文字就回调一次（已过滤思考过程）；返回完整回答文本，
// 供调用方写入Conversation.messages（Task9的addAssistantMessage）。
export async function streamMainChat({ systemPrompt, history }, onDelta) {
	// #ifdef H5
	return streamMainChatH5(systemPrompt, history, onDelta)
	// #endif
	// #ifndef H5
	return streamMainChatWeixin(systemPrompt, history, onDelta)
	// #endif
}
