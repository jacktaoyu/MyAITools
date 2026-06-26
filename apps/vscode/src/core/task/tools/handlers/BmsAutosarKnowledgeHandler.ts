import fs from "node:fs/promises"
import path from "node:path"
import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { extractTextFromFile, extractTextFromFolder } from "@/integrations/misc/extract-text"
import { fileExistsAtPath } from "@utils/fs"
import { isLocatedInPath } from "@utils/path"
import { getClineHomePath } from "@/core/storage/disk"
import { telemetryService } from "@/services/telemetry"
import { ClineDefaultTool } from "@/shared/tools"
import { Logger } from "@/shared/services/Logger"
import { canCreateEmbeddings, createEmbeddings, DEFAULT_EMBEDDING_MODEL, hashContent } from "./bms-autosar/BmsAutosarEmbeddingService"
import {
	suggestBmsAutosarTags,
	type BmsAutosarKnowledgeEntry,
	type BmsAutosarKnowledgeFile,
	type BmsAutosarKnowledgeSource,
} from "./bms-autosar/BmsAutosarKnowledgeTypes"
import { saveBmsKnowledgeContent } from "@core/controller/file/bmsKnowledgeStorage"
import {
	invalidateBmsAutosarKnowledgeCache,
	loadKnowledgeSourceCached,
} from "./bms-autosar/BmsAutosarKnowledgeCache"
import type { ToolResponse } from "../../index"
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

export type {
	BmsAutosarKnowledgeEmbedding,
	BmsAutosarKnowledgeEntry,
	BmsAutosarKnowledgeFile,
	BmsAutosarKnowledgeSource,
} from "./bms-autosar/BmsAutosarKnowledgeTypes"

export class BmsAutosarKnowledgeHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE

	// Serialize background embedding refreshes per knowledge file so that
	// rapid add/update calls cannot race and clobber each other.
	private refreshQueue = new Map<string, Promise<void>>()

	constructor() {}

	getDescription(block: ToolUse): string {
		return `[${block.name} action='${block.params.action || "unknown"}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const partialMessage = JSON.stringify({
			action: block.params.action,
			topic: block.params.topic,
			scope: block.params.scope,
			status: "Managing BMS AUTOSAR knowledge base...",
		})
		await uiHelpers.ask("tool", partialMessage, block.partial).catch(() => {})
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const action = block.params.action
		const topic = block.params.topic || ""
		const content = block.params.content || ""
		const filePath = block.params.file_path || ""
		const folderPath = block.params.folder_path || ""
		const tagsRaw = block.params.tags || ""
		const scope = block.params.scope === "global" ? "global" : "workspace"
		Logger.log(`[BmsAutosarKnowledgeHandler] execute start action=${action} topic=${topic || "n/a"}`)

		if (!action) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(block.name, "action")
		}

		const validActions = ["add", "list", "get", "delete"]
		if (!validActions.includes(action)) {
			config.taskState.consecutiveMistakeCount++
			return formatResponse.toolResult(
				`Error: Invalid action "${action}". Must be one of: ${validActions.join(", ")}.`,
			)
		}

		config.taskState.consecutiveMistakeCount = 0

		try {
			switch (action) {
				case "add":
					return await this.addEntry(config, topic, content, filePath, folderPath, tagsRaw, scope)
				case "list":
					return await this.listEntries(config, scope)
				case "get":
					return await this.getEntry(config, topic, scope)
				case "delete":
					return await this.deleteEntry(config, topic, scope)
				default:
					return formatResponse.toolResult(`Error: Unhandled action "${action}".`)
			}
		} catch (error) {
			Logger.log(`[BmsAutosarKnowledgeHandler] execute error action=${action} error=${error}`)
			return formatResponse.toolResult(`Error managing BMS AUTOSAR knowledge base: ${error}`)
		}
	}

	private getKnowledgeFilePath(config: TaskConfig, scope: "workspace" | "global"): string {
		const baseDir =
			scope === "global" ? path.join(getClineHomePath(), "bms-autosar") : path.join(config.cwd, ".cline", "bms-autosar")
		return path.join(baseDir, "knowledge.json")
	}

	private async loadKnowledgeFile(filePath: string): Promise<BmsAutosarKnowledgeFile> {
		if (!(await fileExistsAtPath(filePath))) {
			return { version: "1.0.0", entries: [] }
		}
		const content = await fs.readFile(filePath, "utf-8")
		if (!content.trim()) {
			return { version: "1.0.0", entries: [] }
		}
		const parsed = JSON.parse(content) as BmsAutosarKnowledgeFile
		return {
			version: parsed.version || "1.0.0",
			entries: Array.isArray(parsed.entries) ? parsed.entries : [],
		}
	}

	private async saveKnowledgeFile(filePath: string, data: BmsAutosarKnowledgeFile): Promise<void> {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
	}

	private async addEntry(
		config: TaskConfig,
		topic: string,
		content: string,
		filePath: string,
		folderPath: string,
		tagsRaw: string,
		scope: "workspace" | "global",
	): Promise<ToolResponse> {
		if (!topic.trim()) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "topic")
		}

		if (folderPath.trim() && filePath.trim()) {
			return formatResponse.toolResult(
				`Error: Provide either "file_path" or "folder_path", not both.`,
			)
		}

		let finalContent = content.trim()
		let sourceFiles: string[] | undefined
		let sourceTag: string | undefined

		if (folderPath.trim()) {
			sourceTag = "folder"
			const absoluteFolderPath = await this.resolveAndValidatePath(config, folderPath.trim(), scope, true)
			const { text, files } = await extractTextFromFolder(absoluteFolderPath)
			sourceFiles = files
			finalContent = this.mergeExtractedContent(finalContent, text, path.basename(absoluteFolderPath), true)
		} else if (filePath.trim()) {
			sourceTag = "imported"
			const absoluteFilePath = await this.resolveAndValidatePath(config, filePath.trim(), scope, false)
			const extractedText = await extractTextFromFile(absoluteFilePath)
			sourceFiles = [path.basename(absoluteFilePath)]
			finalContent = this.mergeExtractedContent(finalContent, extractedText, path.basename(absoluteFilePath), false)
		}

		if (!finalContent.trim()) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "content")
		}

		const tags = this.buildTags(topic, finalContent, tagsRaw, sourceTag)

		const { chunkCount, kbPath } = await saveBmsKnowledgeContent({
			cwd: config.cwd,
			scope,
			topic: topic.trim(),
			content: finalContent,
			tags,
			sourceFiles,
		})

		invalidateBmsAutosarKnowledgeCache(kbPath)
		Logger.log(`[BmsAutosarKnowledgeHandler] triggering background embedding refresh for ${kbPath}`)
		this.refreshEmbeddingsForFile(config, kbPath).catch(() => {})

		if (chunkCount > 0) {
			return formatResponse.toolResult(
				`Added ${chunkCount} chunked knowledge entries for "${topic}" to ${scope} knowledge base.`,
			)
		}

		return formatResponse.toolResult(`Added knowledge entry "${topic}" to ${scope} knowledge base.`)
	}

	private mergeExtractedContent(
		userContent: string,
		extractedText: string,
		sourceName: string,
		isFolder: boolean,
	): string {
		const sourceLabel = isFolder ? `folder ${sourceName}` : sourceName
		if (userContent) {
			return `User note:\n${userContent}\n\nExtracted from ${sourceLabel}:\n${extractedText}`
		}
		return `Extracted from ${sourceLabel}:\n${extractedText}`
	}

	private buildTags(topic: string, content: string, tagsRaw: string, sourceTag?: string): string[] {
		let tags: string[] = []
		try {
			if (tagsRaw.trim()) {
				tags = JSON.parse(tagsRaw) as string[]
				if (!Array.isArray(tags)) {
					tags = []
				}
			}
		} catch {
			tags = []
		}

		// Auto-suggest tags when none are provided.
		if (tags.length === 0) {
			tags = suggestBmsAutosarTags(topic, content)
		}
		if (sourceTag) {
			tags = Array.from(new Set([...tags, sourceTag]))
		}

		return tags
	}

	private async resolveAndValidatePath(
		config: TaskConfig,
		inputPath: string,
		scope: "workspace" | "global",
		expectDirectory?: boolean,
	): Promise<string> {
		const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.resolve(config.cwd, inputPath)

		if (!(await fileExistsAtPath(absolutePath))) {
			throw new Error(`${expectDirectory ? "Folder" : "File"} not found: ${inputPath}`)
		}

		// Resolve symlinks so a link pointing outside the allowed directory
		// cannot be used to bypass the workspace/global scope check.
		const realPath = await fs.realpath(absolutePath)

		const stats = await fs.stat(realPath)
		if (expectDirectory !== undefined) {
			const isDirectory = stats.isDirectory()
			if (expectDirectory && !isDirectory) {
				throw new Error(`Path is not a folder: ${inputPath}`)
			}
			if (!expectDirectory && isDirectory) {
				throw new Error(`Path is not a file: ${inputPath}`)
			}
		}

		// Allow paths inside the workspace, or inside the global knowledge directory for global scope.
		// Resolve the workspace root as well so symlinks in the root path (e.g. /var -> /private/var)
		// do not cause valid sub-paths to be rejected.
		const globalKnowledgeDir = path.join(getClineHomePath(), "bms-autosar")
		const realWorkspaceRoot = await fs.realpath(config.cwd).catch(() => config.cwd)
		const isInWorkspace = isLocatedInPath(realWorkspaceRoot, realPath)
		const isInGlobalDir = scope === "global" && isLocatedInPath(globalKnowledgeDir, realPath)

		if (!isInWorkspace && !isInGlobalDir) {
			throw new Error(
				`${expectDirectory ? "Folder" : "File"} must be located inside the current workspace (or ~/.cline/bms-autosar/ for global scope). Path: ${inputPath}`,
			)
		}

		return realPath
	}

	private async listEntries(config: TaskConfig, scope: "workspace" | "global"): Promise<ToolResponse> {
		const filePath = this.getKnowledgeFilePath(config, scope)
		const cached = await loadKnowledgeSourceCached(filePath)
		const data: BmsAutosarKnowledgeFile = cached
			? { version: "1.0.0", entries: cached.entries }
			: await this.loadKnowledgeFile(filePath)

		if (data.entries.length === 0) {
			return formatResponse.toolResult(`No entries found in ${scope} BMS AUTOSAR knowledge base.`)
		}

		const lines = data.entries.map((e, i) => {
			const tagPart = e.tags && e.tags.length > 0 ? ` [${e.tags.join(", ")}]` : ""
			return `${i + 1}. ${e.topic}${tagPart} (updated ${e.updatedAt})`
		})
		return formatResponse.toolResult(
			`${scope} BMS AUTOSAR knowledge base entries:\n${lines.join("\n")}`,
		)
	}

	private async getEntry(
		config: TaskConfig,
		topic: string,
		scope: "workspace" | "global",
	): Promise<ToolResponse> {
		if (!topic.trim()) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "topic")
		}

		const filePath = this.getKnowledgeFilePath(config, scope)
		const cached = await loadKnowledgeSourceCached(filePath)
		const data: BmsAutosarKnowledgeFile = cached
			? { version: "1.0.0", entries: cached.entries }
			: await this.loadKnowledgeFile(filePath)

		const entry = data.entries.find((e) => e.topic.toLowerCase() === topic.trim().toLowerCase())
		if (!entry) {
			return formatResponse.toolResult(`No knowledge entry found for "${topic}" in ${scope} knowledge base.`)
		}

		const tagLine = entry.tags && entry.tags.length > 0 ? `Tags: ${entry.tags.join(", ")}\n` : ""
		return formatResponse.toolResult(
			`Topic: ${entry.topic}\nUpdated: ${entry.updatedAt}\n${tagLine}\n${entry.content}`,
		)
	}

	private async deleteEntry(
		config: TaskConfig,
		topic: string,
		scope: "workspace" | "global",
	): Promise<ToolResponse> {
		if (!topic.trim()) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "topic")
		}

		const filePath = this.getKnowledgeFilePath(config, scope)
		const data = await this.loadKnowledgeFile(filePath)

		const initialLength = data.entries.length
		data.entries = data.entries.filter((e) => e.topic.toLowerCase() !== topic.trim().toLowerCase())

		if (data.entries.length === initialLength) {
			return formatResponse.toolResult(`No knowledge entry found for "${topic}" in ${scope} knowledge base.`)
		}

		await this.saveKnowledgeFile(filePath, data)
		invalidateBmsAutosarKnowledgeCache(filePath)
		return formatResponse.toolResult(`Deleted knowledge entry "${topic}" from ${scope} knowledge base.`)
	}

	private async refreshEmbeddingsForFile(
		config: TaskConfig,
		filePath: string,
		data?: BmsAutosarKnowledgeFile,
	): Promise<void> {
		const existing = this.refreshQueue.get(filePath)
		if (existing) {
			return existing
		}

		const promise = this.runRefreshEmbeddingsForFile(config, filePath, data).finally(() => {
			this.refreshQueue.delete(filePath)
		})
		this.refreshQueue.set(filePath, promise)
		return promise
	}

	private async runRefreshEmbeddingsForFile(
		config: TaskConfig,
		filePath: string,
		data?: BmsAutosarKnowledgeFile,
	): Promise<void> {
		const startTime = Date.now()
		const apiConfiguration = config.services.stateManager.getApiConfiguration()
		if (!canCreateEmbeddings(apiConfiguration)) {
			return
		}

		try {
			const fileData = data ?? (await this.loadKnowledgeFile(filePath))
			const model = DEFAULT_EMBEDDING_MODEL
			telemetryService.captureBmsAutosarKnowledgeRefreshStarted(config.ulid)
			const textsToEmbed: string[] = []
			const entriesToEmbed: BmsAutosarKnowledgeEntry[] = []

			for (const entry of fileData.entries) {
				const currentHash = hashContent(entry.content)
				const cached = entry.embedding
				if (!cached || cached.model !== model || cached.contentHash !== currentHash) {
					textsToEmbed.push(`${entry.topic}\n${entry.content}`)
					entriesToEmbed.push(entry)
				}
			}

			if (entriesToEmbed.length === 0) {
				return
			}

			const embeddings = await createEmbeddings(textsToEmbed, { apiConfiguration, model })
			embeddings.forEach((embedding, index) => {
				if (embedding) {
					entriesToEmbed[index].embedding = embedding
				}
			})

			await this.saveKnowledgeFile(filePath, fileData)
			telemetryService.captureBmsAutosarKnowledgeRefreshCompleted(config.ulid, Date.now() - startTime)
		} catch {
			// Eager embedding is best-effort; failures should not block the user.
		}
	}

}

/**
 * Loads the merged BMS AUTOSAR knowledge base from workspace and global scopes.
 */
export async function loadBmsAutosarKnowledgeBaseWithSources(cwd: string): Promise<BmsAutosarKnowledgeSource[]> {
	const workspacePath = path.join(cwd, ".cline", "bms-autosar", "knowledge.json")
	const globalPath = path.join(getClineHomePath(), "bms-autosar", "knowledge.json")

	const sources: BmsAutosarKnowledgeSource[] = []

	for (const filePath of [workspacePath, globalPath]) {
		if (await fileExistsAtPath(filePath)) {
			try {
				const content = await fs.readFile(filePath, "utf-8")
				if (content.trim()) {
					const parsed = JSON.parse(content) as BmsAutosarKnowledgeFile
					if (Array.isArray(parsed.entries)) {
						sources.push({ path: filePath, entries: parsed.entries })
					}
				}
			} catch {
				// Skip malformed knowledge files
			}
		}
	}

	return sources
}

export async function loadBmsAutosarKnowledgeBase(cwd: string): Promise<BmsAutosarKnowledgeEntry[]> {
	const sources = await loadBmsAutosarKnowledgeBaseWithSources(cwd)
	return sources.flatMap((source) => source.entries)
}
