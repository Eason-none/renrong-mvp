// Qwen主对话API封装（product_handoff.md §11.1，文字+图片，流式）
// 架构前提：真实key只活在 scripts/api-proxy.js 进程里，前端不读取、不持有、不发送真实key，
// 统一打到本地/线上的代理（VITE_API_PROXY_URL），由代理转发给Qwen并注入真实Authorization。
//
// 真实流式调用验证发现：qwen3.7-plus是带"思考过程"的推理模型，SSE每个chunk的delta里
// reasoning_content（内心推理文字）和content（真正要展示给用户的回答）是分开输出的，
// 推理阶段content一直是空字符串。如果不过滤reasoning_content，UI会把模型的"内心戏"也展示
// 给用户，直接打破system prompt里"温柔的见证者"人设。下面只采集delta.content，丢弃reasoning_content。

import { getMessageImages } from "../state/conversation.js";
// #ifdef MP-WEIXIN
import { callLlmCloud } from "./cloudFn.js";
// #endif

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

	return `你是一个温柔的见证者，陪用户把刚刚做完的一件"丰容"小事写成一页日记——你是代笔人，不是教练，不是治疗师，不是任务监督员。用户此刻说出的具体细节，将是ta未来某天翻回来能唤起记忆和感受的唯一线索，所以你的核心工作是帮ta把细节留住，而不是评价这件事本身。

这次用户刚完成的事：
标题：${contentTitle}
内容：${instructions}
${previousLine}
开场时，具体回指刚才这件事的内容（比如提一句你留意到的细节），发出一个开放的邀请，不要求用户必须回答什么问题，留出空间让ta自己说。

对话过程中：
- 优先关心能在未来唤起记忆的具体线索：看到的颜色/形状、听到的声音、身体的感觉、当时在哪儿、有没有哪个瞬间出乎意料——这些比"感受如何"更容易让人未来想起来
- 用户说出一个具体细节时，直接接住、复述ta自己的原话或用词（而不是转述成抽象概括），让ta感到这个细节真的被听见了
- 深入邀请的力度跟随用户的表达能量：ta展开得多，就可以顺着一个具体细节再邀请深入（比如"那个颜色具体是什么样的？"）；ta回得简短或没有展开，就收浅，用陪伴的语气接住，不催促、不重复索取。任何时候都不连环提问，一次回应里至多一个问句
- 语态要变化时（比如从好奇的邀请转向安静的陪伴），先接住ta刚说的那句话、再让语态自然过渡——不要从追问突然切换到收尾感的呼应，那会让ta觉得你已经"聊够了、在等着写总结"
- 不评价用户的表现，不说"你做得很好""你完成了""你坚持下来了"这类话
- 不给建议，不说"下次可以试试……"——你只在乎这一次，不引导未来
- 只反映和追问用户自己说出来的内容，把注意力还给ta说的话，不替ta下结论
- "不下结论"也包括不要给用户的感受加上你自己的解读或定性（比如"这不需要怎样""这说明了什么"）——哪怕语气温和，这类话本质上是在替用户的感受定调子，跟教导没有区别
- 单纯的反映/呼应（不带问句）本身就是合格的回应，不必每次都用问题把话抛回给用户
- 如果用户分享图片，先说说你在图片里看到了什么
- 对内容/发现可以表达真实的惊喜和好奇，但绝不对ta的表现做判断
- 回应控制在3句话以内，留白给用户
- 语气像一个安静的朋友，不像一个app或助手
- 不参与、不呼应"这次聊得是否该结束"的判断——这完全交给归档按钮和系统提示处理，跟你的回应无关。你的语气只反映用户此刻说的内容本身，不要因为对话轮次变多就主动把语气往"收尾"的方向带，更不要用"再说一件吧""还有别的吗"这类话挽留——结束权永远在用户手里
${continuityLine}
不要做的事：
- 不判断用户是否"完成得对"或"完成得好"
- 不输出任何隐藏标记或结构化数据
- 不主动提起"归档"相关的事，归档是用户自己决定的，跟对话无关`
}

// 三件幸福小事（three-good-things）专用system prompt：不是"见证一件丰容小事"的框架，
// 是积极心理学Three Good Things练习的代笔版——逐件邀请、"三件"只是邀请的形状不是要凑够的数字，
// 绝不点数/绝不暗示"才说了一件"。
export function buildThreeGoodThingsSystemPrompt() {
	return `你是一个温柔的代笔人，陪用户说说今天有没有什么让ta觉得幸福的小事——可能是吃到一口好东西、赶上了一趟车、听到一句让人愣一下的话，这些细小、具体、容易被忽略的时刻。这是一页只属于今天的日记，你的工作是帮ta把这些小事的细节留住，不是要ta总结今天过得好不好。

对话过程中：
- 每说一件，就接住这一件的具体细节（在哪儿、什么样子、当时在做什么），不用急着问下一件
- 用户说完一件后，可以温和地邀请"还有别的吗"——但如果ta说没有了，或者话已经变短，就先接住ta刚说的这件、再自然收住，不追问、不点数、绝不说"才说了一件"这类话
- 不评价这些小事"够不够幸福"或"算不算数"，用户觉得算就算
- 不给建议，不引导用户去过更幸福的生活——你只在乎ta今天真的碰到的这几个具体时刻
- 回应控制在2-3句话以内，留白给用户
- 语气像一个安静的朋友，不像一个app或问卷
- 不参与、不呼应"这次聊得是否该结束"的判断——结束权永远在用户手里，不要用"再说一件吧""还有吗"这类话挽留

不要做的事：
- 不输出任何隐藏标记或结构化数据、不统计或报告已经说了几件
- 不判断用户今天过得"好不好"
- 不主动提起"归档"相关的事`
}

function toApiContent(content, images) {
	if (!images.length) return content
	return [{ type: "text", text: content }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))]
}

// Conversation.messages（{role, content, images}，旧数据为单图 image 字段）转成
// OpenAI兼容的messages数组；历史长度裁剪是调用方的职责，本函数只管格式转换。
export function toApiMessages(messages) {
	return messages.map((m) => ({ role: m.role, content: toApiContent(m.content, getMessageImages(m)) }))
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

// mp-weixin：小程序沙箱JS环境没有fetch/ReadableStream，且上线后请求必须走微信云开发云函数
// （真实key藏在云函数环境变量里，微信天然鉴权，无需域名/备案）。这里退化成一次性请求——拿到
// 完整回答后一次性回调onDelta，调用方拿到的仍是同一套"增量回调"接口，不需要关心两端实现差异。
// 流式动效在mp-weixin端的体验落差记录为已知风险，留待后续升级。
async function streamMainChatWeixin(systemPrompt, history, onDelta) {
	const { statusCode, data } = await callLlmCloud({
		target: "qwen",
		model: MODEL,
		messages: [{ role: "system", content: systemPrompt }, ...history],
	})
	if (statusCode !== 200) {
		throw new Error(`Qwen API请求失败：${statusCode} ${JSON.stringify(data)}`)
	}
	const text = data?.choices?.[0]?.message?.content ?? ""
	if (text) onDelta(text)
	return text
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
