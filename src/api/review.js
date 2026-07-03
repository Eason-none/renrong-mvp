// 回顾叙事生成API封装（product_handoff.md §11.3，spec_v1.md §3.5）
// 调用契约（reviewOrchestration.js注入要求）：generateReviewText(collectionId, summaries) -> Promise<string>，
// summaries是调用方（Task10）已经快照固定好的素材，本文件只管按它生成文本，不回头查storage——
// 这是"快照定格"语义成立的前提，不能在这里违反。
// 复用Task12（Qwen）的注入模式（tasks_v1.md Task14依赖关系写明），用同一个模型做叙事生成；
// 跟Task12不同的是这里不需要逐字流式（生成期间UI展示的是Task22的"邀请式加载文案"，不是打字机效果），
// 所以用一次性非流式请求即可，两端（H5/mp-weixin）用uni.request统一处理，不用区分平台。

import { getCollectionById, getCollectionItemById } from "../content/library.js"

const PROXY_URL = import.meta.env.VITE_API_PROXY_URL || "http://localhost:5555"
const MODEL = import.meta.env.VITE_QWEN_MODEL

// §5.4.2固定兜底模板：摘要全空时原样使用，不经模型生成（spec §3.5 AC2 / §6验证5）。
function buildFallbackText(collectionName) {
	return `有一段时间，你在《${collectionName}》这件事上，认真地走了一段路。具体发生了什么，我们没能听你讲起过，但这并不妨碍这段经历真实地属于你。有些感受不必说出来才算数，安静地经历过，本身就足够了。`
}

// 机制A：按content_id分组，同一内容做过多次时把历史摘要序列都列出来，供模型识别"反复做同一件事"的模式。
// 注：summaries只包含"已归档对话产生"的记录（含summary_text为null的情况，比如聊了但没说话）；
// "完成过但完全没聊天"的completion_event在当前数据流里不会进入这个数组（Task10的
// gatherExistingSummaries按设计只匹配已归档的Conversation），属于§11.3三层取数逻辑里
// 第③层在现有契约下暂时无法落地的已知缺口，记录为后续扩展点，不在本任务内回头改Task10的契约。
function buildItemsData(summaries) {
	const byContentId = new Map()
	for (const summary of summaries) {
		if (!byContentId.has(summary.content_id)) byContentId.set(summary.content_id, [])
		byContentId.get(summary.content_id).push(summary)
	}

	const blocks = []
	for (const [contentId, group] of byContentId) {
		const item = getCollectionItemById(contentId)
		const title = item?.title ?? contentId
		group.sort((a, b) => a.completed_at - b.completed_at)
		const lines = group.map((s, i) => {
			const text = s.summary_text ?? "（没有留下对话记录，只知道完成了这件事）"
			return `  - 第${i + 1}次：${text}`
		})
		blocks.push(`- 《${title}》\n${lines.join("\n")}`)
	}
	return blocks.join("\n")
}

function buildPrompt({ collectionName, summaries }) {
	const hasSummaries = summaries.some((s) => s.summary_text)

	if (!hasSummaries) {
		// 与AC2一致：这个分支不应该走到这里被拼进prompt——调用方在没有summaries内容时
		// 直接用buildFallbackText短路返回，不应该构造prompt也不应该调模型。
		throw new Error("buildPrompt: 不应该在hasSummaries=false时构造prompt，应直接用兜底文案")
	}

	const itemsData = buildItemsData(summaries)

	return `你的任务是为用户写一段完整的回顾叙事，纪念ta在"${collectionName}"这本图鉴里完成的探索。

这是一段连续的、有温度的叙事文字，不是总结报告，不是数据列表。你的语气目标是"一起回望"——像被陪伴、被看见的感觉，不是写总结陈词。

这是ta这段时间在这本图鉴里留下的记录（按完成的内容分组，同一条内容如果做过多次，会附带每一次的摘要）：

${itemsData}

写作前，先从这些摘要里找一条贯穿的线索——ta的感受或注意力呈现出的某种倾向、生活里被重新看见的某个角落，不是"完成了哪些事"本身。用这条线索组织整段叙事，具体细节只作为支撑这条线索的例证出现，不要按完成顺序逐条复述发生了什么，那会变成事件流水账，不是叙事。

如果同一条内容下出现了多条摘要，这是需要你识别和呼应的一种模式——不要机械列出或一一对比，而是像一个真正记得这些细节的人那样，自然地在叙事里点出"你好像对这件事有种特殊的偏好"之类的呼应。不要做任何形式的情绪分类、打标签或频次统计（比如不要写"3次平静、2次惊喜"），所有的模式识别都必须是定性的、融合进叙事语言本身的。

写作时必须遵守：
- 可以反映/呼应用户自己说过的内容，帮ta看见连接
- 绝不能评价表现——不能说"你坚持完成了""你做得很好""你进步了"这类话
- 必须传达"完美也罢、做不好也罢都没关系，这只是探索不是任务"的立场，但不要用任何固定的句子模板，措辞应该根据这次内容自然写出来
- 整段是一篇连续的文字，不分点、不加小标题、不附加任何数据列表或时间线
- 不要在结尾刻意总结或升华成一句格言式的话`
}

function requestQwen(prompt) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: `${PROXY_URL}/qwen-proxy/chat/completions`,
			method: "POST",
			header: { "Content-Type": "application/json" },
			data: { model: MODEL, messages: [{ role: "user", content: prompt }] },
			success: (res) => {
				if (res.statusCode !== 200) {
					reject(new Error(`回顾生成API请求失败：${res.statusCode} ${JSON.stringify(res.data)}`))
					return
				}
				resolve(res.data?.choices?.[0]?.message?.content?.trim() ?? "")
			},
			fail: (err) => reject(new Error(`回顾生成API请求失败：${err.errMsg}`)),
		})
	})
}

export async function generateReviewText(collectionId, summaries) {
	const collection = getCollectionById(collectionId)
	const collectionName = collection?.name ?? collectionId
	const hasSummaries = summaries.some((s) => s.summary_text)

	if (!hasSummaries) {
		return buildFallbackText(collectionName)
	}

	const prompt = buildPrompt({ collectionName, summaries })
	return requestQwen(prompt)
}
