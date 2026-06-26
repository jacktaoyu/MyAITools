import fs from "node:fs/promises";
import path from "node:path";
import { buildApiHandler } from "@core/api";
import type { ApiHandler } from "@core/api";
import { formatResponse } from "@core/prompts/responses";
import {
	AutoFixBmsAutosarFileResponse,
	AutoFixBmsAutosarFilesRequest,
	AutoFixBmsAutosarFilesResponse,
	BmsAutosarQualityIssue,
} from "@shared/proto/cline/file";
import type { AutoFixResult } from "@core/task/tools/handlers/bms-autosar/BmsAutosarAutoFixer";
import type {
	ValidationIssue,
	ValidationResult,
} from "@core/task/tools/utils/BmsAutosarValidationUtils";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

/**
 * Automatically fixes multiple BMS AUTOSAR generated files using the configured
 * LLM based on the latest quality/MISRA report.
 *
 * When `request.apply` is false, the handler returns preview diffs without
 * writing to disk. When true, it writes the fixed contents to disk.
 */
export async function autoFixBmsAutosarFiles(
	controller: Controller,
	request: AutoFixBmsAutosarFilesRequest,
	apiHandler?: ApiHandler,
): Promise<AutoFixBmsAutosarFilesResponse> {
	const cwd = await getCwd(getDesktopDir());
	const filePaths = request.filePaths;
	if (!filePaths || filePaths.length === 0) {
		return AutoFixBmsAutosarFilesResponse.create({
			fixedCount: 0,
			appliedCount: 0,
			totalCount: 0,
			message: "At least one file_path is required.",
		});
	}

	try {
		const resolvedApiHandler =
			apiHandler ??
			(await (async () => {
				const apiConfiguration = controller.stateManager.getApiConfiguration();
				const mode =
					(controller.stateManager.getGlobalSettingsKey("mode") as
						| "plan"
						| "act") || "act";
				return await buildApiHandler(apiConfiguration, mode);
			})());

		const [
			{ autoFixBmsAutosarFile: runBmsAutosarAutoFix },
			{ runBmsAutosarQualityGates },
		] = await Promise.all([
			import("@core/task/tools/handlers/bms-autosar/BmsAutosarAutoFixer"),
			import("@core/task/tools/utils/BmsAutosarQualityGates"),
		]);

		const results: AutoFixBmsAutosarFileResponse[] = [];
		let fixedCount = 0;
		let appliedCount = 0;

		for (const filePath of filePaths) {
			const absolutePath = path.isAbsolute(filePath)
				? filePath
				: path.join(cwd, filePath);
			const relPath = path.relative(cwd, absolutePath);

			try {
				const result: AutoFixResult = await runBmsAutosarAutoFix(
					resolvedApiHandler,
					cwd,
					relPath,
				);
				const diff = formatResponse.createPrettyPatch(
					relPath,
					result.originalContent,
					result.fixedContent,
				);

				let applied = false;
				if (request.apply && result.fixed) {
					await fs.writeFile(absolutePath, result.fixedContent, "utf-8");
					applied = true;
					appliedCount++;
				}

				if (result.fixed) {
					fixedCount++;
				}

				const remainingResult: ValidationResult =
					await runBmsAutosarQualityGates(relPath, result.fixedContent, {
						cwd,
					});
				const remainingIssues = remainingResult.issues.map((issue) =>
					mapValidationIssueToProto(issue),
				);

				results.push(
					AutoFixBmsAutosarFileResponse.create({
						fixed: result.fixed,
						applied,
						filePath: relPath,
						originalContent: result.originalContent,
						fixedContent: result.fixedContent,
						diff,
						message: result.message,
						remainingIssues,
					}),
				);
			} catch (error: any) {
				results.push(
					AutoFixBmsAutosarFileResponse.create({
						fixed: false,
						applied: false,
						filePath: relPath,
						message: `Auto-fix failed for ${relPath}: ${error?.message || error}`,
					}),
				);
			}
		}

		const summary = request.apply
			? `Applied fixes to ${appliedCount} of ${filePaths.length} file(s).`
			: `Generated fixes for ${fixedCount} of ${filePaths.length} file(s).`;

		return AutoFixBmsAutosarFilesResponse.create({
			results,
			fixedCount,
			appliedCount,
			totalCount: filePaths.length,
			message: summary,
		});
	} catch (error: any) {
		return AutoFixBmsAutosarFilesResponse.create({
			fixedCount: 0,
			appliedCount: 0,
			totalCount: filePaths.length,
			message: `Batch auto-fix failed: ${error?.message || error}`,
		});
	}
}

function mapValidationIssueToProto(
	issue: ValidationIssue,
): BmsAutosarQualityIssue {
	return BmsAutosarQualityIssue.create({
		severity: issue.severity,
		message: issue.message,
		line: issue.line ?? 0,
		rule: issue.rule ?? "",
		category: issue.category ?? "",
	});
}
