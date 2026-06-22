/**
 * Creates a concurrency limiter that ensures at most `limit` async operations
 * run at the same time. Preserves call order on the caller side.
 */
export function createConcurrencyLimit(limit: number) {
	const executing = new Set<Promise<unknown>>()
	return async <T>(fn: () => Promise<T>): Promise<T> => {
		while (executing.size >= limit) {
			await Promise.race(executing)
		}
		const promise = fn().finally(() => executing.delete(promise))
		executing.add(promise)
		return promise
	}
}
