import fs from "node:fs/promises";
import path from "node:path";
import { String } from "@shared/proto/cline/common";
import { ImportBmsKnowledgeJsonRequest } from "@shared/proto/cline/file";
import { getClineHomePath } from "@/core/storage/disk";
import { fileExistsAtPath } from "@utils/fs";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

type KnowledgeEntry = {
	topic: string;
	content?: string;
	createdAt?: string;
	updatedAt?: string;
	tags?: string[];
	embedding?: unknown;
	sourceFiles?: string[];
};

type KnowledgeData = {
	version: string;
	entries: KnowledgeEntry[];
};

/**
 * Imports BMS AUTOSAR knowledge entries from a JSON string into the workspace
 * or global knowledge base.
 */
export async function importBmsKnowledgeJson(
	_controller: Controller,
	request: ImportBmsKnowledgeJsonRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const baseDir =
		scope === "global"
			? path.join(getClineHomePath(), "bms-autosar")
			: path.join(cwd, ".cline", "bms-autosar");
	const kbPath = path.join(baseDir, "knowledge.json");

	let imported: KnowledgeData;
	try {
		imported = JSON.parse(request.json);
	} catch (error: any) {
		return String.create({ value: `Invalid JSON: ${error?.message || error}` });
	}

	if (!Array.isArray(imported.entries)) {
		return String.create({
			value: "Invalid knowledge JSON: missing entries array.",
		});
	}

	let existing: KnowledgeData = { version: "1", entries: [] };
	if (await fileExistsAtPath(kbPath)) {
		try {
			const raw = await fs.readFile(kbPath, "utf-8");
			existing = JSON.parse(raw);
		} catch {
			// Start fresh if existing file is corrupt.
		}
	}

	await fs.mkdir(baseDir, { recursive: true });

	const merged = new Map<string, KnowledgeEntry>();
	for (const entry of existing.entries) {
		merged.set(entry.topic.toLowerCase(), entry);
	}

	let importedCount = 0;
	for (const entry of imported.entries) {
		if (!entry.topic) {
			continue;
		}
		entry.updatedAt = new Date().toISOString();
		// Clear embeddings so they will be recomputed on next retrieval.
		entry.embedding = undefined;
		merged.set(entry.topic.toLowerCase(), entry);
		importedCount++;
	}

	const data: KnowledgeData = {
		version: existing.version || "1",
		entries: Array.from(merged.values()),
	};

	const tempPath = `${kbPath}.tmp`;
	await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
	await fs.rename(tempPath, kbPath);

	return String.create({
		value: `Imported ${importedCount} ${scope} BMS AUTOSAR knowledge entr${importedCount === 1 ? "y" : "ies"}.`,
	});
}
