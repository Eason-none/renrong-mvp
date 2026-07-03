import { get, set, KEYS } from "./storage.js";

function getTodayStr() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getUncompletedTasks() {
	return get(KEYS.DAILY_TASK_POOL, []);
}

export function claimTask(task) {
	const pool = getUncompletedTasks();
	if (pool.some((t) => t.id === task.id)) return;
	set(KEYS.DAILY_TASK_POOL, [...pool, task]);
}

export function completeTask(taskId) {
	const pool = getUncompletedTasks();
	set(
		KEYS.DAILY_TASK_POOL,
		pool.filter((t) => t.id !== taskId)
	);
}

export function saveCompletedTask(task, completionEventId) {
	const list = get(KEYS.DAILY_COMPLETED_TASKS, []);
	const today = getTodayStr();
	if (list.some((t) => t.id === task.id && t.completedDate === today)) return;
	set(KEYS.DAILY_COMPLETED_TASKS, [
		...list,
		{
			id: task.id,
			title: task.title,
			hook: task.hook,
			time: task.time,
			instructions: task.instructions,
			scene_tags: task.scene_tags,
			completedDate: today,
			completionEventId,
		},
	]);
}

export function getTodayCompleted() {
	const today = getTodayStr();
	return get(KEYS.DAILY_COMPLETED_TASKS, []).filter((t) => t.completedDate === today);
}

export function getPrevDayCompleted() {
	const today = getTodayStr();
	return get(KEYS.DAILY_COMPLETED_TASKS, []).filter((t) => t.completedDate !== today);
}

export function clearPrevDayCompleted() {
	const today = getTodayStr();
	const list = get(KEYS.DAILY_COMPLETED_TASKS, []);
	set(KEYS.DAILY_COMPLETED_TASKS, list.filter((t) => t.completedDate === today));
}
