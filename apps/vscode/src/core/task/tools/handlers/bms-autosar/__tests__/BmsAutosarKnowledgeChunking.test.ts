import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { chunkBmsAutosarText, MAX_CHUNK_CHARS } from "../BmsAutosarKnowledgeTypes"

describe("BmsAutosarKnowledgeChunking", () => {
	it("returns a single chunk for short text", () => {
		const text = "Short knowledge entry."
		const chunks = chunkBmsAutosarText(text)
		assert.deepStrictEqual(chunks, [text])
	})

	it("splits long text into chunks under the max size", () => {
		const text = "word ".repeat(MAX_CHUNK_CHARS)
		const chunks = chunkBmsAutosarText(text)
		assert.ok(chunks.length > 1)
		for (const chunk of chunks) {
			assert.ok(chunk.length <= MAX_CHUNK_CHARS)
		}
	})

	it("prefers paragraph boundaries when possible", () => {
		const paragraphs = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}: ${"x".repeat(200)}`)
		const text = paragraphs.join("\n\n")
		const chunks = chunkBmsAutosarText(text, 1000)
		for (const chunk of chunks) {
			assert.ok(chunk.length <= 1000)
		}
	})

	it("does not lose content", () => {
		const text = "word ".repeat(MAX_CHUNK_CHARS)
		const chunks = chunkBmsAutosarText(text)
		const reconstructed = chunks.join(" ")
		assert.ok(reconstructed.includes("word"))
	})
})
