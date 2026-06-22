import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { createConcurrencyLimit } from "./concurrency"

describe("createConcurrencyLimit", () => {
	it("runs tasks concurrently up to the limit", async () => {
		const limit = createConcurrencyLimit(2)
		let running = 0
		let maxRunning = 0

		const tasks = Array.from({ length: 5 }, async (_, i) => {
			return limit(async () => {
				running++
				maxRunning = Math.max(maxRunning, running)
				await new Promise((resolve) => setTimeout(resolve, 10))
				running--
				return i
			})
		})

		const results = await Promise.all(tasks)
		assert.deepStrictEqual(results, [0, 1, 2, 3, 4])
		assert.equal(maxRunning, 2)
		assert.equal(running, 0)
	})

	it("preserves results and errors", async () => {
		const limit = createConcurrencyLimit(1)
		const result = await limit(async () => "ok")
		assert.equal(result, "ok")

		await assert.rejects(
			limit(async () => {
				throw new Error("expected")
			}),
			/expected/,
		)
	})
})
