import fs from "node:fs/promises"
import path from "node:path"
import { getClineHomePath } from "@core/storage/disk"
import { fileExistsAtPath } from "@utils/fs"
import type { BmsAutosarTemplate, BmsAutosarTemplates } from "./BmsAutosarTemplateRenderer"

export type BmsAutosarTemplateScope = "workspace" | "global"

const TEMPLATES_FILE_NAME = "templates.json"

/**
 * Returns the directory that holds user-defined BMS AUTOSAR templates for the
 * given scope. Workspace scope uses `<cwd>/.cline/bms-autosar`; global scope
 * uses `~/.cline/bms-autosar`.
 */
export function getBmsTemplatesDir(cwd: string, scope: BmsAutosarTemplateScope = "workspace"): string {
	if (scope === "global") {
		return path.join(getClineHomePath(), "bms-autosar")
	}
	return path.join(cwd, ".cline", "bms-autosar")
}

function getTemplatesPath(cwd: string, scope: BmsAutosarTemplateScope): string {
	return path.join(getBmsTemplatesDir(cwd, scope), TEMPLATES_FILE_NAME)
}

function createEmptyTemplates(): BmsAutosarTemplates {
	return { version: "1.0.0", templates: {} }
}

/**
 * Merge built-in templates with user-defined global and workspace templates.
 * Workspace templates take highest precedence, then global, then built-in.
 */
export async function loadMergedTemplates(cwd: string, builtInTemplates: BmsAutosarTemplates): Promise<BmsAutosarTemplates> {
	const globalTemplates = await loadBmsTemplates(cwd, "global")
	const workspaceTemplates = await loadBmsTemplates(cwd, "workspace")
	return {
		version: workspaceTemplates.version || globalTemplates.version || builtInTemplates.version,
		templates: {
			...builtInTemplates.templates,
			...globalTemplates.templates,
			...workspaceTemplates.templates,
		},
	}
}

/**
 * Load user-defined BMS AUTOSAR templates for a specific scope.
 */
export async function loadBmsTemplates(cwd: string, scope: BmsAutosarTemplateScope = "workspace"): Promise<BmsAutosarTemplates> {
	const templatesPath = getTemplatesPath(cwd, scope)
	if (!(await fileExistsAtPath(templatesPath))) {
		return createEmptyTemplates()
	}

	try {
		const raw = await fs.readFile(templatesPath, "utf-8")
		if (!raw.trim()) {
			return createEmptyTemplates()
		}
		const parsed = JSON.parse(raw) as BmsAutosarTemplates
		return {
			version: parsed.version || "1.0.0",
			templates: parsed.templates && typeof parsed.templates === "object" ? parsed.templates : {},
		}
	} catch {
		return createEmptyTemplates()
	}
}

/**
 * Save a complete user-defined template to the templates file for the given
 * scope. Existing templates for the same key are overwritten; other templates
 * are preserved.
 */
export async function saveBmsTemplate(
	cwd: string,
	scope: BmsAutosarTemplateScope,
	templateKey: string,
	template: BmsAutosarTemplate,
): Promise<string> {
	const data = await loadBmsTemplates(cwd, scope)
	data.templates[templateKey] = template
	return await writeBmsTemplates(cwd, scope, data)
}

/**
 * Delete a user-defined template from the templates file for the given scope.
 */
export async function deleteBmsTemplate(cwd: string, scope: BmsAutosarTemplateScope, templateKey: string): Promise<boolean> {
	const data = await loadBmsTemplates(cwd, scope)
	if (!Object.hasOwn(data.templates, templateKey)) {
		return false
	}
	delete data.templates[templateKey]
	await writeBmsTemplates(cwd, scope, data)
	return true
}

async function writeBmsTemplates(cwd: string, scope: BmsAutosarTemplateScope, data: BmsAutosarTemplates): Promise<string> {
	const templatesDir = getBmsTemplatesDir(cwd, scope)
	const templatesPath = path.join(templatesDir, TEMPLATES_FILE_NAME)
	await fs.mkdir(templatesDir, { recursive: true })

	// Atomic write to avoid corrupting templates.json if the process crashes.
	const tempPath = `${templatesPath}.tmp`
	await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8")
	await fs.rename(tempPath, templatesPath)
	return templatesPath
}
