import fs from "node:fs/promises";
import path from "node:path";
import { String } from "@shared/proto/cline/common";
import { BmsKnowledgeListRequest } from "@shared/proto/cline/file";
import { getClineHomePath } from "@/core/storage/disk";
import { fileExistsAtPath } from "@utils/fs";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

/**
 * Exports the BMS AUTOSAR knowledge base for the workspace or global scope as
 * a JSON string.
 */
export async function exportBmsKnowledge(
	_controller: Controller,
	request: BmsKnowledgeListRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const baseDir =
		scope === "global"
			? path.join(getClineHomePath(), "bms-autosar")
			: path.join(cwd, ".cline", "bms-autosar");
	const kbPath = path.join(baseDir, "knowledge.json");

	if (!(await fileExistsAtPath(kbPath))) {
		return String.create({
			value: JSON.stringify({ version: "1", entries: [] }, null, 2),
		});
	}

	try {
		const raw = await fs.readFile(kbPath, "utf-8");
		// Validate JSON before returning.
		JSON.parse(raw);
		return String.create({ value: raw });
	} catch (error: any) {
		return String.create({
			value: `Failed to export knowledge base: ${error?.message || error}`,
		});
	}
}
