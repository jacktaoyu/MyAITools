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
import type { Controller } from "..";

interface RawKnowledgeEntry {
	topic?: string;
	content?: string;
	updatedAt?: string;
	tags?: string[];
	sourceFiles?: string[];
	embedding?: {
		model?: string;
		contentHash?: string;
	};
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
							const hasEmbedding = !!entry.embedding?.model;
							const embeddingStale = hasEmbedding
								? (entry.embedding?.contentHash ?? "") !==
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
