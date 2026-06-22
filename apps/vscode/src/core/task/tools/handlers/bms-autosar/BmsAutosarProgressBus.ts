import { BmsAutosarProgressEvent } from "@shared/proto/cline/bms_autosar"

export type BmsAutosarProgressSubscriber = (event: BmsAutosarProgressEvent) => void | Promise<void>

interface Subscription {
	subscriber: BmsAutosarProgressSubscriber
	cleanup?: () => void
}

const subscribers = new Map<string, Set<Subscription>>()

function getSubscriptions(taskId: string): Set<Subscription> {
	let set = subscribers.get(taskId)
	if (!set) {
		set = new Set()
		subscribers.set(taskId, set)
	}
	return set
}

function cleanupIfEmpty(taskId: string): void {
	const set = subscribers.get(taskId)
	if (set && set.size === 0) {
		subscribers.delete(taskId)
	}
}

/**
 * Subscribe to progress events for a specific task.
 * Returns an unsubscribe function.
 */
export function subscribeToBmsAutosarProgress(
	taskId: string,
	subscriber: BmsAutosarProgressSubscriber,
): () => void {
	const set = getSubscriptions(taskId)
	const subscription: Subscription = { subscriber }
	set.add(subscription)

	const unsubscribe = () => {
		set.delete(subscription)
		cleanupIfEmpty(taskId)
	}
	subscription.cleanup = unsubscribe
	return unsubscribe
}

/**
 * Emit a progress event to all subscribers of a task.
 */
export async function emitBmsAutosarProgress(
	taskId: string,
	partial: Omit<BmsAutosarProgressEvent, "stage" | "message" | "percentComplete" | "isComplete" | "error"> &
		Partial<BmsAutosarProgressEvent>,
): Promise<void> {
	const event = BmsAutosarProgressEvent.create({
		stage: partial.stage ?? "",
		message: partial.message ?? "",
		percentComplete: partial.percentComplete ?? 0,
		isComplete: partial.isComplete ?? false,
		error: partial.error ?? "",
	})
	const set = subscribers.get(taskId)
	if (!set || set.size === 0) {
		return
	}

	const promises: Promise<void>[] = []
	for (const subscription of set) {
		try {
			const result = subscription.subscriber(event)
			if (result instanceof Promise) {
				promises.push(result.catch(() => {}))
			}
		} catch {
			// Ignore subscriber errors.
		}
	}
	await Promise.all(promises)
}

/**
 * Mark a generation as successfully completed.
 */
export async function completeBmsAutosarProgress(taskId: string, message?: string): Promise<void> {
	await emitBmsAutosarProgress(taskId, {
		stage: "complete",
		message: message ?? "Generation complete",
		percentComplete: 100,
		isComplete: true,
	})
}

/**
 * Mark a generation as failed.
 */
export async function failBmsAutosarProgress(taskId: string, error: string): Promise<void> {
	await emitBmsAutosarProgress(taskId, {
		stage: "error",
		message: error,
		percentComplete: 100,
		isComplete: true,
		error,
	})
}
