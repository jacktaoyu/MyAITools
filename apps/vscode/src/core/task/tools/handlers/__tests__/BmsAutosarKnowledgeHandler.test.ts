import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "mocha"
import { ClineDefaultTool } from "@/shared/tools"
import { TaskState } from "../../../TaskState"
import type { TaskConfig } from "../../types/TaskConfig"
import { BmsAutosarKnowledgeHandler } from "../BmsAutosarKnowledgeHandler"
import { suggestBmsAutosarTags } from "../bms-autosar/BmsAutosarKnowledgeTypes"

function createConfig(cwd: string): TaskConfig {
	return {
		taskId: "task-1",
		ulid: "ulid-1",
		cwd,
		mode: "act",
		strictPlanModeEnabled: false,
		yoloModeToggled: false,
		vscodeTerminalExecutionMode: "backgroundExec",
		enableParallelToolCalling: true,
		isSubagentExecution: false,
		taskState: new TaskState(),
		messageState: {},
		api: { getModel: () => ({ id: "openai/gpt-5", info: {} }) },
		autoApprovalSettings: { enableNotifications: false, actions: {} },
		autoApprover: { shouldAutoApproveTool: () => [false, false] },
		browserSettings: {},
		focusChainSettings: {},
		services: {
			stateManager: { getApiConfiguration: () => ({}) },
			mcpHub: {},
		},
		callbacks: {
			say: async () => undefined,
			ask: async () => ({ response: "yesButtonClicked" }),
			sayAndCreateMissingParamError: async () => "missing",
			removeLastPartialMessageIfExistsWithType: async () => undefined,
		},
		coordinator: { getHandler: () => undefined },
	} as unknown as TaskConfig
}

describe("BmsAutosarKnowledgeHandler", () => {
	let tempDir: string
	let handler: BmsAutosarKnowledgeHandler

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-kb-handler-test-"))
		await fs.mkdir(path.join(tempDir, ".cline", "bms-autosar"), { recursive: true })
		handler = new BmsAutosarKnowledgeHandler()
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("adds a knowledge entry with tags", async () => {
		const config = createConfig(tempDir)
		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: {
				action: "add",
				topic: "Naming Convention",
				content: "Use Bms_ prefix for all SWCs.",
				tags: JSON.stringify(["naming", "convention"]),
			},
			partial: false,
		})

		assert.ok((result as string).includes("Added knowledge entry"))

		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const raw = await fs.readFile(kbPath, "utf-8")
		const data = JSON.parse(raw)
		assert.equal(data.entries.length, 1)
		assert.deepStrictEqual(data.entries[0].tags, ["naming", "convention"])
	})

	it("lists entries with tags", async () => {
		const config = createConfig(tempDir)
		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const data = {
			version: "1.0.0",
			entries: [
				{
					topic: "Cell Voltage",
					content: "Cell voltage guidance.",
					createdAt: "2026-06-21T00:00:00.000Z",
					updatedAt: "2026-06-21T00:00:00.000Z",
					tags: ["arxml"],
				},
			],
		}
		await fs.writeFile(kbPath, JSON.stringify(data, null, 2), "utf-8")

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: { action: "list" },
			partial: false,
		})

		assert.ok((result as string).includes("Cell Voltage"))
		assert.ok((result as string).includes("[arxml]"))
	})

	it("shows tags in get output", async () => {
		const config = createConfig(tempDir)
		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const data = {
			version: "1.0.0",
			entries: [
				{
					topic: "DTC Mapping",
					content: "DTC to DEM event mapping.",
					createdAt: "2026-06-21T00:00:00.000Z",
					updatedAt: "2026-06-21T00:00:00.000Z",
					tags: ["diagnostic", "dtc"],
				},
			],
		}
		await fs.writeFile(kbPath, JSON.stringify(data, null, 2), "utf-8")

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: { action: "get", topic: "DTC Mapping" },
			partial: false,
		})

		assert.ok((result as string).includes("Tags: diagnostic, dtc"))
	})

	it("clears embedding when updating an entry", async () => {
		const config = createConfig(tempDir)
		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const data = {
			version: "1.0.0",
			entries: [
				{
					topic: "Thermal Runaway",
					content: "Old content.",
					createdAt: "2026-06-21T00:00:00.000Z",
					updatedAt: "2026-06-21T00:00:00.000Z",
					embedding: { model: "text-embedding-3-small", vector: [0.1], contentHash: "old" },
				},
			],
		}
		await fs.writeFile(kbPath, JSON.stringify(data, null, 2), "utf-8")

		await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: { action: "add", topic: "Thermal Runaway", content: "New content." },
			partial: false,
		})

		const raw = await fs.readFile(kbPath, "utf-8")
		const updated = JSON.parse(raw)
		assert.equal(updated.entries[0].content, "New content.")
		assert.equal(updated.entries[0].embedding, undefined)
	})

	it("auto-suggests tags when none are provided", async () => {
		const config = createConfig(tempDir)
		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: {
				action: "add",
				topic: "Cell Balancing",
				content: "Passive cell balancing uses resistors to dissipate energy from high cells.",
			},
			partial: false,
		})

		assert.ok((result as string).includes("Added knowledge entry"))

		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const raw = await fs.readFile(kbPath, "utf-8")
		const data = JSON.parse(raw)
		assert.ok(data.entries[0].tags.includes("balancing"))
		assert.ok(data.entries[0].tags.includes("cell"))
	})

	it("adds a knowledge entry from a folder", async () => {
		const config = createConfig(tempDir)
		const folderPath = path.join(tempDir, "docs")
		await fs.mkdir(folderPath)
		await fs.writeFile(path.join(folderPath, "note.txt"), "Folder note content.")

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: {
				action: "add",
				topic: "Docs Folder",
				folder_path: "docs",
			},
			partial: false,
		})

		assert.ok((result as string).includes("Added knowledge entry"))

		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const raw = await fs.readFile(kbPath, "utf-8")
		const data = JSON.parse(raw)
		assert.equal(data.entries.length, 1)
		assert.ok(data.entries[0].content.includes("Folder note content."))
		assert.ok(data.entries[0].tags.includes("folder"))
	})

	it("adds a knowledge entry from a folder with source files", async () => {
		const config = createConfig(tempDir)
		const folderPath = path.join(tempDir, "docs")
		await fs.mkdir(folderPath)
		await fs.writeFile(path.join(folderPath, "note.txt"), "Folder note content.")

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: {
				action: "add",
				topic: "Docs Folder",
				folder_path: "docs",
			},
			partial: false,
		})

		assert.ok((result as string).includes("Added knowledge entry"))

		const kbPath = path.join(tempDir, ".cline", "bms-autosar", "knowledge.json")
		const raw = await fs.readFile(kbPath, "utf-8")
		const data = JSON.parse(raw)
		assert.equal(data.entries.length, 1)
		assert.ok(data.entries[0].content.includes("Folder note content."))
		assert.ok(data.entries[0].tags.includes("folder"))
		assert.deepStrictEqual(data.entries[0].sourceFiles, ["note.txt"])
	})

	it("rejects both file_path and folder_path", async () => {
		const config = createConfig(tempDir)
		const filePath = path.join(tempDir, "doc.txt")
		const folderPath = path.join(tempDir, "docs")
		await fs.writeFile(filePath, "content")
		await fs.mkdir(folderPath)
		await fs.writeFile(path.join(folderPath, "note.txt"), "folder content")

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE,
			params: {
				action: "add",
				topic: "Both",
				file_path: "doc.txt",
				folder_path: "docs",
			},
			partial: false,
		})

		assert.ok((result as string).includes("either"))
	})

	describe("suggestBmsAutosarTags", () => {
		it("suggests tags based on BMS keywords", () => {
			const tags = suggestBmsAutosarTags("Thermal Runaway", "Detect thermal runaway and trigger cooling in battery cells.")
			assert.ok(tags.includes("thermal"))
			assert.ok(tags.includes("cell"))
		})

		it("suggests autosar and arxml tags", () => {
			const tags = suggestBmsAutosarTags("ARXML Structure", "AUTOSAR package structure for BMS SWC.")
			assert.ok(tags.includes("arxml"))
			assert.ok(tags.includes("autosar"))
		})

		it("returns an empty array for generic text", () => {
			const tags = suggestBmsAutosarTags("Hello", "This is a generic note.")
			assert.deepStrictEqual(tags, [])
		})
	})
})
