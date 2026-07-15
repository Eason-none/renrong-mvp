// 存量原图迁移（diary-trace 1.5）：升级前，聊天消息里的图片是未压缩的原图base64，
// 一次性幂等压缩替换，避免 CONVERSATIONS 单key被撑爆。压缩失败静默裁掉该图（丢照片不丢对话）。
// 迁移完成后置一个一次性标记，此后启动直接跳过——不是常规业务数据，不纳入 KEYS 统一表。

import { get, set, KEYS } from "./storage.js";
import { compressImageDataUrl } from "@/utils/imageCompress.js";

const MIGRATION_DONE_KEY = "imageMigrationV1Done";

// 保守阈值：压缩目标≤50KB（base64后约68000字符），用12万字符（约90KB解码后）判定"像原图"——
// 宁可漏判（旧图留着不影响功能，只是仍占空间）也不误判已压缩过的图再压一次。
const LOOKS_LIKE_ORIGINAL_THRESHOLD = 120000;

function looksLikeOriginal(dataUrl) {
	return typeof dataUrl === "string" && dataUrl.length > LOOKS_LIKE_ORIGINAL_THRESHOLD;
}

export async function migrateOversizedConversationImages() {
	if (get(MIGRATION_DONE_KEY, false)) return;

	const conversations = get(KEYS.CONVERSATIONS, []);
	let changed = false;

	for (const conv of conversations) {
		for (const msg of conv.messages) {
			if (msg.role !== "user" || !looksLikeOriginal(msg.image)) continue;
			try {
				msg.image = await compressImageDataUrl(msg.image);
			} catch (err) {
				console.error("migrateOversizedConversationImages: 压缩失败，裁掉该图", err);
				msg.image = null;
			}
			changed = true;
		}
	}

	if (changed) set(KEYS.CONVERSATIONS, conversations);
	set(MIGRATION_DONE_KEY, true);
}
