import fs from "node:fs/promises";
import path from "node:path";
import { getClineHomePath } from "@/core/storage/disk";
import { String } from "@shared/proto/cline/common";
import { DeleteBmsKnowledgeRequest } from "@shared/proto/cline/file";
import { fileExistsAtPath } from "@utils/fs";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

interface RawKnowledgeEntry {
	topic: string;
	content?: string;
	createdAt?: string;
	updatedAt?: string;
}

interface RawKnowledgeFile {
	version?: string;
	entries?: RawKnowledgeEntry[];
}

/**
 * Deletes a BMS AUTOSAR knowledge entry by topic from the workspace or global scope.
 */
export async function deleteBmsKnowledge(
	_controller: Controller,
	request: DeleteBmsKnowledgeRequest,
): Promise<String> {
	const topic = request.topic?.trim();
	if (!topic) {
		return String.create({ value: "No topic provided." });
	}

	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const baseDir =
		scope === "global"
			? path.join(getClineHomePath(), "bms-autosar")
			: path.join(cwd, ".cline", "bms-autosar");
	const kbPath = path.join(baseDir, "knowledge.json");

	if (!(await fileExistsAtPath(kbPath))) {
		return String.create({
			value: `No BMS AUTOSAR knowledge entries found in ${scope} scope.`,
		});
	}

	let data: RawKnowledgeFile;
	try {
		const raw = await fs.readFile(kbPath, "utf-8");
		data = raw.trim()
			? (JSON.parse(raw) as RawKnowledgeFile)
			: { version: "1.0.0", entries: [] };
	} catch (error: any) {
		return String.create({
			value: `Failed to read knowledge file: ${error?.message || error}`,
		});
	}

	const initialLength = data.entries?.length ?? 0;
	const normalizedTopic = topic.toLowerCase();
	const remaining = (data.entries || []).filter(
		(e) => e.topic.toLowerCase() !== normalizedTopic,
	);

	if (remaining.length === initialLength) {
		return String.create({
			value: `No knowledge entry found for "${topic}" in ${scope} scope.`,
		});
	}

	data.entries = remaining;

	await fs.mkdir(baseDir, { recursive: true });
	await fs.writeFile(kbPath, JSON.stringify(data, null, 2), "utf-8");

	return String.create({
		value: `Deleted knowledge entry "${topic}" from ${scope} BMS AUTOSAR knowledge base.`,
	});
}
