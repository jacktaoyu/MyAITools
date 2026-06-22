import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "mocha"
import type { ApiHandler, ApiHandlerModel } from "@core/api"
import type { ApiStream } from "@core/api/transform/stream"
import { autoFixBmsAutosarFile } from "../BmsAutosarAutoFixer"
import { clearQualityReport, upsertQualityReportFile } from "../BmsAutosarQualityReportStore"

function createMockApiHandler(responseText: string): ApiHandler {
	return {
		getModel: () => ({ id: "mock" } as ApiHandlerModel),
		createMessage: async function* (): ApiStream {
			yield { type: "text", text: responseText }
		},
	} as unknown as ApiHandler
}

describe("BmsAutosarAutoFixer", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-autofix-test-"))
		clearQualityReport(tempDir)
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
	})

	it("returns unchanged when no quality issues are recorded", async () => {
		const filePath = path.join(tempDir, "BmsTest.c")
		await fs.writeFile(filePath, "void BmsTest_Run(void) { }\n", "utf-8")
		const api = createMockApiHandler("unused")
		const result = await autoFixBmsAutosarFile(api, tempDir, "BmsTest.c")
		assert.equal(result.fixed, false)
		assert.ok(result.message.includes("No quality issues"))
	})

	it("returns fixed content when LLM returns a code block", async () => {
		const filePath = path.join(tempDir, "BmsTest.c")
		const original = "void BmsTest_Run(void) { malloc(1); }\n"
		await fs.writeFile(filePath, original, "utf-8")
		upsertQualityReportFile(tempDir, "BmsTest.c", [
			{ severity: "error", message: "Use of malloc() is not allowed", rule: "R21.3", line: 1 },
		])

		const fixed = "void BmsTest_Run(void) { }\n"
		const api = createMockApiHandler(`\`\`\`c\n${fixed}\`\`\``)
		const result = await autoFixBmsAutosarFile(api, tempDir, "BmsTest.c")

		assert.equal(result.fixed, true)
		assert.ok(result.message.includes("Fixed 1 issue"))
		assert.equal(result.fixedContent, fixed)
		// The file is no longer written directly; caller is responsible for applying the fix.
		assert.equal(await fs.readFile(filePath, "utf-8"), original)
	})

	it("falls back to raw response when no code block is present", async () => {
		const filePath = path.join(tempDir, "BmsTest.c")
		const original = "void BmsTest_Run(void) { malloc(1); }\n"
		await fs.writeFile(filePath, original, "utf-8")
		upsertQualityReportFile(tempDir, "BmsTest.c", [{ severity: "warning", message: "style" }])

		const fixed = "void BmsTest_Run(void) { }\n"
		const api = createMockApiHandler(fixed)
		const result = await autoFixBmsAutosarFile(api, tempDir, "BmsTest.c")

		assert.equal(result.fixed, true)
		assert.equal(result.fixedContent, fixed)
		assert.equal(await fs.readFile(filePath, "utf-8"), original)
	})
})
