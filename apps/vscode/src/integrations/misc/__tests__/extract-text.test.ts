import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "mocha"
import { extractTextFromFolder } from "../extract-text"

describe("extractTextFromFolder", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "extract-folder-test-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("extracts text from supported files recursively", async () => {
		await fs.writeFile(path.join(tempDir, "a.txt"), "Hello from A")
		await fs.writeFile(path.join(tempDir, "b.md"), "# Hello from B")

		const subDir = path.join(tempDir, "nested")
		await fs.mkdir(subDir)
		await fs.writeFile(path.join(subDir, "c.txt"), "Hello from C")

		const result = await extractTextFromFolder(tempDir)

		assert.ok(result.text.includes("--- File: a.txt ---"))
		assert.ok(result.text.includes("Hello from A"))
		assert.ok(result.text.includes("--- File: b.md ---"))
		assert.ok(result.text.includes("# Hello from B"))
		assert.ok(result.text.includes("--- File: nested/c.txt ---"))
		assert.ok(result.text.includes("Hello from C"))
		assert.deepStrictEqual(result.files.sort(), ["a.txt", "b.md", "nested/c.txt"])
	})

	it("skips unsupported files", async () => {
		await fs.writeFile(path.join(tempDir, "a.txt"), "Hello from A")
		await fs.writeFile(path.join(tempDir, "ignored.exe"), "binary content")

		const result = await extractTextFromFolder(tempDir)

		assert.ok(result.text.includes("Hello from A"))
		assert.ok(!result.text.includes("binary content"))
		assert.deepStrictEqual(result.files, ["a.txt"])
	})

	it("returns successful files only when some extractions fail", async () => {
		await fs.writeFile(path.join(tempDir, "a.txt"), "Hello from A")
		// Create an Excel file with invalid content so extraction fails.
		await fs.writeFile(path.join(tempDir, "bad.xlsx"), "not a valid xlsx")

		const result = await extractTextFromFolder(tempDir)

		assert.ok(result.text.includes("Hello from A"))
		assert.ok(!result.text.includes("Error extracting content"))
		assert.ok(result.files.includes("a.txt"))
		assert.ok(!result.files.includes("bad.xlsx"))
		const failure = result.failedFiles.find((f) => f.path === "bad.xlsx")
		assert.ok(failure)
		assert.ok(failure.error.length > 0)
	})

	it("throws when no supported files are found", async () => {
		await fs.writeFile(path.join(tempDir, "ignored.exe"), "binary content")

		await assert.rejects(
			async () => extractTextFromFolder(tempDir),
			/No supported files found/,
		)
	})

	it("throws when path is not a directory", async () => {
		const filePath = path.join(tempDir, "file.txt")
		await fs.writeFile(filePath, "not a directory")

		await assert.rejects(
			async () => extractTextFromFolder(filePath),
			/Path is not a directory/,
		)
	})
})
