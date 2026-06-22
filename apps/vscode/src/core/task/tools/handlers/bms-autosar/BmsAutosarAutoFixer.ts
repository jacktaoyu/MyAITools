import fs from "node:fs/promises"
import path from "node:path"
import type { ApiHandler } from "@core/api"
import type { QualityReportIssue } from "./BmsAutosarQualityReportStore"
import { getQualityReport } from "./BmsAutosarQualityReportStore"

export interface AutoFixResult {
	filePath: string
	fixed: boolean
	originalContent: string
	fixedContent: string
	message: string
}

function buildFixPrompt(content: string, issues: QualityReportIssue[]): string {
	const issueLines = issues
		.map((issue) => {
			const linePart = issue.line ? ` (line ${issue.line})` : ""
			const rulePart = issue.rule ? `[${issue.rule}] ` : ""
			return `- ${rulePart}${issue.severity}${linePart}: ${issue.message}`
		})
		.join("\n")

	return `You are an AUTOSAR/MISRA-C expert. Fix the following C code so that it satisfies the listed quality/MISRA issues.

Requirements:
- Preserve all existing public APIs (function signatures, macro names, exported typedefs).
- Only change what is necessary to resolve the issues.
- Maintain AUTOSAR naming conventions and coding style.
- Do not add explanatory comments about the changes unless the original code already contained TODOs.
- Return ONLY the fixed source code, wrapped in a single Markdown code block using the language tag \`c\`.

Issues to fix:
${issueLines}

Source code:
\`\`\`c
${content}
\`\`\`

Fixed source code:`
}

async function callLlmForFix(api: ApiHandler, prompt: string): Promise<string> {
	const stream = api.createMessage(
		"You are an expert embedded AUTOSAR C programmer that produces MISRA-compliant code.",
		[{ role: "user", content: prompt }],
	)

	let response = ""
	for await (const chunk of stream) {
		if (chunk.type === "text") {
			response += chunk.text
		}
	}
	return response
}

function extractCodeBlock(response: string): string {
	const match = response.match(/```(?:c|C)\s*\n([\s\S]*?)\n```/)
	if (match) {
		return match[1]
	}
	// Fallback: if no code block, return the raw response trimmed.
	return response.trim()
}

/**
 * Attempts to automatically fix quality/MISRA issues in a single BMS AUTOSAR
 * generated file by calling the configured LLM.
 */
export async function autoFixBmsAutosarFile(
	api: ApiHandler,
	workspaceCwd: string,
	filePath: string,
): Promise<AutoFixResult> {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceCwd, filePath)
	const originalContent = await fs.readFile(absolutePath, "utf-8")

	const report = getQualityReport(workspaceCwd)
	const reportFile = report?.files.find(
		(f) => f.filePath.toLowerCase() === filePath.toLowerCase() || f.filePath.toLowerCase() === absolutePath.toLowerCase(),
	)
	const issues = reportFile?.issues ?? []

	if (issues.length === 0) {
		return { filePath, fixed: false, originalContent, fixedContent: originalContent, message: "No quality issues recorded for this file." }
	}

	const prompt = buildFixPrompt(originalContent, issues)
	const llmResponse = await callLlmForFix(api, prompt)
	const fixedContent = extractCodeBlock(llmResponse)

	if (!fixedContent || fixedContent === originalContent.trim()) {
		return { filePath, fixed: false, originalContent, fixedContent: originalContent, message: "LLM did not produce any changes." }
	}

	// Ensure the file ends with a newline.
	const normalizedFixedContent = fixedContent.endsWith("\n") ? fixedContent : `${fixedContent}\n`

	return {
		filePath,
		fixed: true,
		originalContent,
		fixedContent: normalizedFixedContent,
		message: `Fixed ${issues.length} issue(s) in ${path.basename(filePath)}.`,
	}
}
