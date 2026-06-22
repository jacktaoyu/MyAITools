import fs from "node:fs/promises";
import path from "node:path";
import { buildApiHandler } from "@core/api";
import { formatResponse } from "@core/prompts/responses";
import {
	AutoFixBmsAutosarFileRequest,
	AutoFixBmsAutosarFileResponse,
} from "@shared/proto/cline/file";
import { autoFixBmsAutosarFile as runBmsAutosarAutoFix } from "@core/task/tools/handlers/bms-autosar/BmsAutosarAutoFixer";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

/**
 * Automatically fixes a BMS AUTOSAR generated file using the configured LLM
 * based on the latest quality/MISRA report.
 *
 * When `request.apply` is false, the handler returns a preview diff without
 * writing to disk. When true, it writes the fixed content to disk.
 */
export async function autoFixBmsAutosarFile(
	controller: Controller,
	request: AutoFixBmsAutosarFileRequest,
): Promise<AutoFixBmsAutosarFileResponse> {
	const cwd = await getCwd(getDesktopDir());
	const filePath = request.filePath;
	if (!filePath) {
		return AutoFixBmsAutosarFileResponse.create({
			fixed: false,
			applied: false,
			message: "file_path is required.",
		});
	}

	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(cwd, filePath);
	const relPath = path.relative(cwd, absolutePath);

	try {
		const apiConfiguration = controller.stateManager.getApiConfiguration();
		const mode =
			(controller.stateManager.getGlobalSettingsKey("mode") as
				| "plan"
				| "act") || "act";
		const apiHandler = await buildApiHandler(apiConfiguration, mode);
		const result = await runBmsAutosarAutoFix(apiHandler, cwd, relPath);

		const diff = formatResponse.createPrettyPatch(
			relPath,
			result.originalContent,
			result.fixedContent,
		);

		let applied = false;
		if (request.apply && result.fixed) {
			await fs.writeFile(absolutePath, result.fixedContent, "utf-8");
			applied = true;
		}

		return AutoFixBmsAutosarFileResponse.create({
			fixed: result.fixed,
			applied,
			filePath: relPath,
			originalContent: result.originalContent,
			fixedContent: result.fixedContent,
			diff,
			message: result.message,
		});
	} catch (error: any) {
		return AutoFixBmsAutosarFileResponse.create({
			fixed: false,
			applied: false,
			filePath: relPath,
			message: `Auto-fix failed for ${relPath}: ${error?.message || error}`,
		});
	}
}
