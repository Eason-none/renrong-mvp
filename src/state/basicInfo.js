import { get, set, KEYS } from "./storage.js";

const DEFAULT_BASIC_INFO = {
	player_id: "",
	birth_date: "", // YYYY-MM-DD
	scene_tags: [],
};

export function getBasicInfo() {
	return get(KEYS.BASIC_INFO, { ...DEFAULT_BASIC_INFO });
}

export function saveBasicInfo(patch) {
	const current = getBasicInfo();
	set(KEYS.BASIC_INFO, { ...current, ...patch });
}
