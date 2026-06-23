import fs from "node:fs/promises";
import path from "node:path";
import { fileExistsAtPath } from "@utils/fs";
import { getClineHomePath } from "@core/storage/disk";
import type {
	BmsAutosarKnowledgeEntry,
	BmsAutosarKnowledgeFile,
	BmsAutosarKnowledgeLocation,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";
import {
	chunkBmsAutosarText,
	MAX_CHUNK_CHARS,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";
import { migrateEntryEmbeddingToVectorCache } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeCache";

export interface SaveBmsKnowledgeContentOptions {
	cwd: string;
	scope?: "workspace" | "global";
	topic: string;
	content: string;
	tags?: string[];
	sourceFiles?: string[];
	sourcePath?: string;
	sourceHash?: string;
	sourceMtimeMs?: number;
	sourceSize?: number;
	locations?: BmsAutosarKnowledgeLocation[];
}

export interface SaveBmsKnowledgeEntriesOptions {
	cwd: string;
	scope?: "workspace" | "global";
	entries: BmsAutosarKnowledgeEntry[];
	/**
	 * Source paths that should be removed before adding the new entries.
	 * Typically the previous file list for a folder import.
	 */
	removedSourcePaths?: string[];
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

export async function loadBmsKnowledgeFile(
	kbPath: string,
): Promise<BmsAutosarKnowledgeFile> {
	if (await fileExistsAtPath(kbPath)) {
		try {
			const raw = await fs.readFile(kbPath, "utf-8");
			if (raw.trim()) {
				const parsed = JSON.parse(raw) as BmsAutosarKnowledgeFile;
				return {
					version: parsed.version || "1.0.0",
					entries: Array.isArray(parsed.entries) ? parsed.entries : [],
				};
			}
		} catch {
			// Keep default empty knowledge file on parse error.
		}
	}
	return { version: "1.0.0", entries: [] };
}

export async function loadBmsKnowledgeEntries(
	cwd: string,
	scope: "workspace" | "global" = "workspace",
): Promise<BmsAutosarKnowledgeEntry[]> {
	const kbPath = path.join(getBmsKnowledgeDir(cwd, scope), "knowledge.json");
	const data = await loadBmsKnowledgeFile(kbPath);
	await migrateEntriesEmbeddings(data.entries);
	return data.entries;
}

async function writeBmsKnowledgeFile(
	kbPath: string,
	data: BmsAutosarKnowledgeFile,
): Promise<void> {
	const kbDir = path.dirname(kbPath);
	await fs.mkdir(kbDir, { recursive: true });
	const tempPath = `${kbPath}.tmp`;
	await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
	await fs.rename(tempPath, kbPath);
}

/**
 * Migrates any in-entry embeddings to the separate vector cache and removes
 * them from the entries. This keeps knowledge.json small while preserving
 * cached vectors.
 */
async function migrateEntriesEmbeddings(
	entries: BmsAutosarKnowledgeEntry[],
): Promise<void> {
	await Promise.all(
		entries.map((entry) => migrateEntryEmbeddingToVectorCache(entry)),
	);
}

/**
 * Saves a batch of knowledge entries, merging by sourcePath when provided.
 * Entries without sourcePath are appended; entries with a sourcePath replace
 * any existing entries sharing the same sourcePath. Removed source paths are
 * deleted entirely.
 */
export async function saveBmsKnowledgeEntries({
	cwd,
	scope = "workspace",
	entries,
	removedSourcePaths = [],
}: SaveBmsKnowledgeEntriesOptions): Promise<{
	kbPath: string;
	entryCount: number;
}> {
	const kbDir = getBmsKnowledgeDir(cwd, scope);
	const kbPath = path.join(kbDir, "knowledge.json");

	const data = await loadBmsKnowledgeFile(kbPath);
	await migrateEntriesEmbeddings(data.entries);

	const newSourcePaths = new Set(
		entries.map((e) => e.sourcePath).filter(Boolean) as string[],
	);
	const removedSet = new Set(removedSourcePaths);

	data.entries = data.entries.filter((e) => {
		if (
			e.sourcePath &&
			(newSourcePaths.has(e.sourcePath) || removedSet.has(e.sourcePath))
		) {
			return false;
		}
		return true;
	});

	// Ensure every new entry has up-to-date timestamps and migrated embeddings.
	const now = new Date().toISOString();
	for (const entry of entries) {
		entry.updatedAt = now;
		if (!entry.createdAt) {
			entry.createdAt = now;
		}
		await migrateEntryEmbeddingToVectorCache(entry);
	}

	data.entries.push(...entries);
	await writeBmsKnowledgeFile(kbPath, data);
	return { kbPath, entryCount: entries.length };
}

/**
 * Saves a single knowledge content string to the BMS AUTOSAR knowledge file.
 * Large content is automatically chunked. Any existing entries for the same
 * topic (including previous chunks) are replaced. When sourcePath is provided,
 * existing entries with the same sourcePath are also replaced.
 */
export async function saveBmsKnowledgeContent({
	cwd,
	scope = "workspace",
	topic,
	content,
	tags,
	sourceFiles,
	sourcePath,
	sourceHash,
	sourceMtimeMs,
	sourceSize,
	locations,
}: SaveBmsKnowledgeContentOptions): Promise<SaveBmsKnowledgeContentResult> {
	const now = new Date().toISOString();

	let entries: BmsAutosarKnowledgeEntry[];
	if (content.length > MAX_CHUNK_CHARS) {
		const chunks = chunkBmsAutosarText(content, MAX_CHUNK_CHARS);
		entries = chunks.map((chunk, index) => ({
			topic: `${topic} - Chunk ${index + 1}/${chunks.length}`,
			content: chunk,
			createdAt: now,
			updatedAt: now,
			tags,
			sourceFiles,
			sourcePath,
			sourceHash,
			sourceMtimeMs,
			sourceSize,
			locations,
		}));
	} else {
		entries = [
			{
				topic,
				content,
				createdAt: now,
				updatedAt: now,
				tags,
				sourceFiles,
				sourcePath,
				sourceHash,
				sourceMtimeMs,
				sourceSize,
				locations,
			},
		];
	}

	const kbDir = getBmsKnowledgeDir(cwd, scope);
	const kbPath = path.join(kbDir, "knowledge.json");
	const data = await loadBmsKnowledgeFile(kbPath);
	await migrateEntriesEmbeddings(data.entries);

	const baseTopic = topic.toLowerCase();
	const sourcePathsToReplace = new Set(
		entries.map((e) => e.sourcePath).filter(Boolean) as string[],
	);

	data.entries = data.entries.filter((e: BmsAutosarKnowledgeEntry) => {
		// Remove previous entries for the same topic and its chunks.
		const sameTopic =
			e.topic.toLowerCase() === baseTopic ||
			e.topic.toLowerCase().startsWith(`${baseTopic} - chunk`);
		if (sameTopic) {
			return false;
		}
		// Remove entries that share a sourcePath with the new content.
		if (e.sourcePath && sourcePathsToReplace.has(e.sourcePath)) {
			return false;
		}
		return true;
	});

	for (const entry of entries) {
		await migrateEntryEmbeddingToVectorCache(entry);
	}
	data.entries.push(...entries);

	await writeBmsKnowledgeFile(kbPath, data);
	return { chunkCount: entries.length > 1 ? entries.length : 0, kbPath };
}
