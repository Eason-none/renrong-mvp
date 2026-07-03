// DeepSeek摘要生成API封装（product_handoff.md §11.2，对话归档时触发，轻量模型，非流式）
// 摘要是离线批处理性质的单次结果，不需要逐字展示，所以不像Task12那样需要区分H5/mp-weixin的
// 流式实现——用uni.request一次性请求即可，两端行为一致。

const PROXY_URL = import.meta.env.VITE_API_PROXY_URL || "http://localhost:5555"
const MODEL = import.meta.env.VITE_DEEPSEEK_MODEL

function buildSummaryPrompt({ contentTitle, instructions, conversation }) {
	const conversationText = conversation.messages
		.map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
		.join("\n")

	return `你的任务是把下面这段对话总结成一段不超过100字的摘要。

这次完成的内容：
标题：${contentTitle}
内容：${instructions}

完整对话：
${conversationText}

要求：
- 只保留用户自己说过的具体内容（看到的、感觉到的、说的话），不要加你自己的评价或结论
- 不用"开心""有所收获""感到平静"这类概括性的情绪定性词，用用户原话里更具体的描述（比如"注意到叶子背面是另一种绿"，而不是"用户感受到了自然之美"）
- 不超过100字，不用完整段落的修饰语，直接、简洁
- 如果对话内容很少或很碎片化，摘要也可以很短，不需要硬凑满

直接输出摘要文本，不要加任何前缀说明。`
}

// 注入到Task9的archiveConversation(conversationId, generateSummaryText)时按
// (conversation) => generateSummaryText({ contentTitle, instructions, conversation }) 包一层闭包——
// archiveConversation只持有conversation，不知道对应内容的标题/正文，所以由调用方（UI层）补上这两项。
export function generateSummaryText({ contentTitle, instructions, conversation }) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: `${PROXY_URL}/deepseek-proxy/chat/completions`,
			method: "POST",
			header: { "Content-Type": "application/json" },
			data: {
				model: MODEL,
				messages: [{ role: "user", content: buildSummaryPrompt({ contentTitle, instructions, conversation }) }],
			},
			success: (res) => {
				if (res.statusCode !== 200) {
					reject(new Error(`DeepSeek API请求失败：${res.statusCode} ${JSON.stringify(res.data)}`))
					return
				}
				resolve(res.data?.choices?.[0]?.message?.content?.trim() ?? "")
			},
			fail: (err) => reject(new Error(`DeepSeek API请求失败：${err.errMsg}`)),
		})
	})
}
