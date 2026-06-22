import fs from "node:fs/promises";
import path from "node:path";
import { fileExistsAtPath } from "@utils/fs";
import { getClineHomePath } from "@core/storage/disk";
import type {
	BmsAutosarKnowledgeEntry,
	BmsAutosarKnowledgeFile,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";
import {
	chunkBmsAutosarText,
	MAX_CHUNK_CHARS,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";

export interface SaveBmsKnowledgeContentOptions {
	cwd: string;
	scope?: "workspace" | "global";
	topic: string;
	content: string;
	tags?: string[];
	sourceFiles?: string[];
}

export interface SaveBmsKnowledgeContentResult {
	chunkCount: number;
	kbPath: string;
}

/**
 * Returns the directory that holds the BMS AUTOSAR knowledge file for the given
 * scope. Workspace scope uses `<cwd>/.cline/bms-autosar`; global scope uses
 * `~/.cline/bms-autosar`.
 */
export function getBmsKnowledgeDir(
	cwd: string,
	scope: "workspace" | "global" = "workspace",
): string {
	if (scope === "global") {
		return path.join(getClineHomePath(), "bms-autosar");
	}
	return path.join(cwd, ".cline", "bms-autosar");
}

/**
 * Saves a single knowledge content string to the BMS AUTOSAR knowledge file.
 * Large content is automatically chunked. Any existing entries for the same
 * topic (including previous chunks) are replaced.
 */
export async function saveBmsKnowledgeContent({
	cwd,
	scope = "workspace",
	topic,
	content,
	tags,
	sourceFiles,
}: SaveBmsKnowledgeContentOptions): Promise<SaveBmsKnowledgeContentResult> {
	const kbDir = getBmsKnowledgeDir(cwd, scope);
	const kbPath = path.join(kbDir, "knowledge.json");

	let data: BmsAutosarKnowledgeFile = { version: "1.0.0", entries: [] };
	if (await fileExistsAtPath(kbPath)) {
		try {
			const raw = await fs.readFile(kbPath, "utf-8");
			if (raw.trim()) {
				const parsed = JSON.parse(raw) as BmsAutosarKnowledgeFile;
				data = {
					version: parsed.version || "1.0.0",
					entries: Array.isArray(parsed.entries) ? parsed.entries : [],
				};
			}
		} catch {
			// Keep default empty knowledge file on parse error.
		}
	}

	const now = new Date().toISOString();
	const baseTopic = topic.toLowerCase();

	// Remove any previous entry (or chunked entries) for this topic so updates
	// do not leave stale chunks behind.
	data.entries = data.entries.filter(
		(e: BmsAutosarKnowledgeEntry) =>
			e.topic.toLowerCase() !== baseTopic &&
			!e.topic.toLowerCase().startsWith(`${baseTopic} - chunk`),
	);

	let chunkCount = 0;
	if (content.length > MAX_CHUNK_CHARS) {
		const chunks = chunkBmsAutosarText(content, MAX_CHUNK_CHARS);
		chunkCount = chunks.length;
		for (let i = 0; i < chunks.length; i++) {
			data.entries.push({
				topic: `${topic} - Chunk ${i + 1}/${chunks.length}`,
				content: chunks[i],
				createdAt: now,
				updatedAt: now,
				tags,
				sourceFiles,
			});
		}
	} else {
		data.entries.push({
			topic,
			content,
			createdAt: now,
			updatedAt: now,
			tags,
			sourceFiles,
		});
	}

	await fs.mkdir(kbDir, { recursive: true });

	// Write to a temp file and atomically rename to avoid corrupting
	// knowledge.json if the process crashes during the write.
	const tempPath = `${kbPath}.tmp`;
	await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
	await fs.rename(tempPath, kbPath);

	return { chunkCount, kbPath };
}
