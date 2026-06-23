import fs from "node:fs/promises";
import path from "node:path";
import { getClineHomePath } from "@/core/storage/disk";
import {
	BmsKnowledgeEntry,
	BmsKnowledgeList,
	BmsKnowledgeListRequest,
} from "@shared/proto/cline/file";
import { fileExistsAtPath } from "@utils/fs";
import { getCwd, getDesktopDir } from "@utils/path";
import { hashContent } from "@core/task/tools/handlers/bms-autosar/BmsAutosarEmbeddingService";
import { loadVectorCached } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeCache";
import { DEFAULT_EMBEDDING_MODEL } from "@core/task/tools/handlers/bms-autosar/BmsAutosarEmbeddingService";
import type { Controller } from "..";

interface RawKnowledgeLocation {
	path?: string;
	page?: number;
	chapter?: string;
}

interface RawKnowledgeEntry {
	topic?: string;
	content?: string;
	updatedAt?: string;
	tags?: string[];
	sourceFiles?: string[];
	sourcePath?: string;
	sourceHash?: string;
	sourceMtimeMs?: number;
	sourceSize?: number;
	locations?: RawKnowledgeLocation[];
	embedding?: {
		model?: string;
		contentHash?: string;
	};
	contentHash?: string;
	embeddingModel?: string;
}

interface RawKnowledgeFile {
	entries?: RawKnowledgeEntry[];
}

/**
 * Lists BMS AUTOSAR knowledge entries from the workspace or global scope.
 */
export async function listBmsKnowledge(
	_controller: Controller,
	request: BmsKnowledgeListRequest,
): Promise<BmsKnowledgeList> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const baseDir =
		scope === "global"
			? path.join(getClineHomePath(), "bms-autosar")
			: path.join(cwd, ".cline", "bms-autosar");
	const kbPath = path.join(baseDir, "knowledge.json");

	const entries: BmsKnowledgeEntry[] = [];

	if (await fileExistsAtPath(kbPath)) {
		try {
			const raw = await fs.readFile(kbPath, "utf-8");
			if (raw.trim()) {
				const parsed = JSON.parse(raw) as RawKnowledgeFile;
				if (Array.isArray(parsed.entries)) {
					for (const entry of parsed.entries) {
						if (entry.topic) {
							const contentHash =
								entry.contentHash || hashContent(entry.content || "");
							const embeddingModel =
								entry.embeddingModel || DEFAULT_EMBEDDING_MODEL;
							const cachedVector = await loadVectorCached(
								contentHash,
								embeddingModel,
							);
							// Backwards compatibility: also consider legacy in-entry embeddings.
							const hasEmbedding = !!cachedVector || !!entry.embedding?.model;
							const embeddingStale = hasEmbedding
								? (entry.embedding?.contentHash ?? contentHash) !==
									hashContent(entry.content || "")
								: false;
							entries.push(
								BmsKnowledgeEntry.create({
									topic: entry.topic,
									updatedAt: entry.updatedAt || "",
									tags: entry.tags || [],
									hasEmbedding,
									embeddingStale,
									content: entry.content || "",
									sourceFiles: entry.sourceFiles || [],
									sourcePath: entry.sourcePath || "",
									sourceHash: entry.sourceHash || "",
									sourceMtimeMs: entry.sourceMtimeMs ?? 0,
									sourceSize: entry.sourceSize ?? 0,
									locations: (entry.locations || []).map((loc) => ({
										path: loc.path || "",
										page: loc.page ?? 0,
										chapter: loc.chapter || "",
									})),
								}),
							);
						}
					}
				}
			}
		} catch {
			// Return empty list on malformed files.
		}
	}

	return BmsKnowledgeList.create({ entries });
}
