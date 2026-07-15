// 聊过就顺手归档（原 index.vue 内私有方法，抽出供页面与各任务流组件共享）：
// 用户"‹ 返回"离开而不是"说完了"时，只要发过消息、还没归档，就在后台补一次归档
// 生成日记页——否则这段聊过的内容永远进不了手记册。
// 归档是后台数据操作，失败静默不阻断用户离开。
import { getConversation, archiveConversation } from "@/state/conversation.js";
import { generateSummaryText } from "@/api/deepseek.js";

export async function archiveChatOnExit(conversationId, contentTitle, instructions) {
	if (!conversationId) return;
	const conv = getConversation(conversationId);
	if (!conv || conv.archived || conv.messages.length === 0) return;
	try {
		await archiveConversation(conv.id, (c) => generateSummaryText({ contentTitle, instructions, conversation: c }));
	} catch (err) {
		console.error("archiveConversation on close failed", err);
	}
}
