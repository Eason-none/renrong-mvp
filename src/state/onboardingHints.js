// 首次引导气泡的已读标记：每个 hintKey 全生命周期只出现一次，点"知道了"后永久消失。
// 只存已读集合，不存展示时机——什么时候该弹由接入处的渲染条件决定。
import { get, set, KEYS } from "./storage.js";

export function hasSeenHint(hintKey) {
	return get(KEYS.ONBOARDING_HINTS_SEEN, []).includes(hintKey);
}

export function markHintSeen(hintKey) {
	const seen = get(KEYS.ONBOARDING_HINTS_SEEN, []);
	if (seen.includes(hintKey)) return;
	set(KEYS.ONBOARDING_HINTS_SEEN, [...seen, hintKey]);
}
