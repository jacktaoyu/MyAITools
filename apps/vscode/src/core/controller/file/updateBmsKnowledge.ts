import fs from "node:fs/promises";
import path from "node:path";
import { String } from "@shared/proto/cline/common";
import { UpdateBmsKnowledgeRequest } from "@shared/proto/cline/file";
import { getClineHomePath } from "@/core/storage/disk";
import { fileExistsAtPath } from "@utils/fs";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

/**
 * Updates an existing BMS AUTOSAR knowledge entry in the workspace or global
 * knowledge base.
 */
export async function updateBmsKnowledge(
	_controller: Controller,
	request: UpdateBmsKnowledgeRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const topic = request.topic.trim();
	const content = request.content;

	if (!topic) {
		return String.create({ value: "Topic is required." });
	}

	const baseDir =
		scope === "global"
			? path.join(getClineHomePath(), "bms-autosar")
			: path.join(cwd, ".cline", "bms-autosar");
	const kbPath = path.join(baseDir, "knowledge.json");

	if (!(await fileExistsAtPath(kbPath))) {
		return String.create({
			value: `No ${scope} BMS AUTOSAR knowledge base found.`,
		});
	}

	let data: {
		version: string;
		entries: Array<{
			topic: string;
			content?: string;
			createdAt?: string;
			updatedAt?: string;
			tags?: string[];
			embedding?: unknown;
			sourceFiles?: string[];
		}>;
	};
	try {
		const raw = await fs.readFile(kbPath, "utf-8");
		data = JSON.parse(raw);
	} catch (error: any) {
		return String.create({
			value: `Failed to read knowledge base: ${error?.message || error}`,
		});
	}

	const entry = data.entries.find(
		(e) => e.topic.toLowerCase() === topic.toLowerCase(),
	);
	if (!entry) {
		return String.create({
			value: `No knowledge entry found for "${topic}" in ${scope} knowledge base.`,
		});
	}

	entry.content = content;
	entry.updatedAt = new Date().toISOString();
	entry.tags = request.tags.length > 0 ? request.tags : undefined;
	// Clear embedding so it will be recomputed on next retrieval.
	entry.embedding = undefined;

	const tempPath = `${kbPath}.tmp`;
	await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
	await fs.rename(tempPath, kbPath);

	return String.create({
		value: `Updated knowledge entry "${topic}" in ${scope} BMS AUTOSAR knowledge base.`,
	});
}
