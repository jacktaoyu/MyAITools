import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	extractTextFromFileWithLocations,
	KNOWLEDGE_IMPORT_EXTENSIONS,
} from "@/integrations/misc/extract-text";
import { String as ProtoString } from "@shared/proto/cline/common";
import { AddBmsKnowledgeFolderRequest } from "@shared/proto/cline/file";
import { ShowMessageType } from "@/shared/proto/host/window";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";
import { HostProvider } from "@/hosts/host-provider";
import {
	loadBmsKnowledgeEntries,
	saveBmsKnowledgeEntries,
} from "./bmsKnowledgeStorage";
import type { BmsAutosarKnowledgeEntry } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";
import { warmBmsAutosarVectorCache } from "@core/task/tools/handlers/bms-autosar/BmsAutosarVectorIndex";

interface FileExtractionResult {
	relativePath: string;
	entry?: BmsAutosarKnowledgeEntry;
	error?: string;
}

function hashBuffer(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

async function collectKnowledgeFiles(folderPath: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs
		.readdir(folderPath, { withFileTypes: true })
		.catch(() => []);
	for (const entry of entries) {
		const fullPath = path.join(folderPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectKnowledgeFiles(fullPath)));
		} else if (
			entry.isFile() &&
			KNOWLEDGE_IMPORT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
		) {
			files.push(fullPath);
		}
	}
	return files;
}

function deriveTags(relativePath: string, userTag?: string): string[] {
	const ext = path.extname(relativePath).toLowerCase().replace(".", "");
	const tags = new Set<string>(["imported", "folder"]);
	if (ext) {
		tags.add(ext);
	}
	if (userTag) {
		tags.add(userTag);
	}
	return Array.from(tags);
}

/**
 * Opens a folder picker to recursively import all supported documents from a
 * folder into the BMS AUTOSAR knowledge base.
 *
 * Changed or new files are re-extracted; unchanged files reuse their existing
 * entries (and embeddings). Deleted files are removed from the knowledge base.
 */
export async function addBmsKnowledgeFolder(
	_controller: Controller,
	request: AddBmsKnowledgeFolderRequest,
): Promise<ProtoString> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";

	const dialog = await HostProvider.window.showOpenDialogue({
		canSelectMany: false,
		canSelectFolders: true,
		canSelectFiles: false,
		openLabel: "Add Folder to BMS Knowledge",
	});

	const folderPath = dialog.paths[0];
	if (!folderPath) {
		return ProtoString.create({ value: "" });
	}

	const files = await collectKnowledgeFiles(folderPath);
	if (files.length === 0) {
		const message = `No supported files found in ${path.basename(folderPath)}.`;
		HostProvider.window.showMessage({ type: ShowMessageType.WARNING, message });
		return ProtoString.create({ value: message });
	}

	const defaultTag = path.basename(folderPath);
	const topicResp = await HostProvider.window.showInputBox({
		title: "BMS AUTOSAR Knowledge Folder Tag",
		prompt: "Enter an optional tag/prefix for this folder import",
		value: defaultTag,
	});
	const userTag = topicResp.response?.trim();

	const existingEntries = await loadBmsKnowledgeEntries(cwd, scope);
	const existingBySourcePath = new Map<string, BmsAutosarKnowledgeEntry>();
	for (const entry of existingEntries) {
		if (entry.sourcePath) {
			existingBySourcePath.set(entry.sourcePath, entry);
		}
	}

	const currentSourcePaths = new Set(
		files.map((filePath) => path.relative(folderPath, filePath)),
	);

	const extractionResults: FileExtractionResult[] = [];
	for (const filePath of files.sort()) {
		const relativePath = path.relative(folderPath, filePath);
		const stat = await fs.stat(filePath).catch(() => undefined);
		if (!stat) {
			extractionResults.push({ relativePath, error: "Could not stat file." });
			continue;
		}

		const existing = existingBySourcePath.get(relativePath);
		if (
			existing &&
			existing.sourceMtimeMs === stat.mtimeMs &&
			existing.sourceSize === stat.size
		) {
			// Reuse unchanged entry without re-reading or re-hashing.
			extractionResults.push({ relativePath, entry: existing });
			continue;
		}

		try {
			const buffer = await fs.readFile(filePath);
			const sourceHash = hashBuffer(buffer);
			if (existing && existing.sourceHash === sourceHash) {
				// Content unchanged despite mtime drift; reuse entry and refresh mtime.
				existing.sourceMtimeMs = stat.mtimeMs;
				existing.sourceSize = stat.size;
				extractionResults.push({ relativePath, entry: existing });
				continue;
			}

			const { text, locations } =
				await extractTextFromFileWithLocations(filePath);
			const now = new Date().toISOString();
			const entry: BmsAutosarKnowledgeEntry = {
				topic: relativePath,
				content: text,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now,
				tags: deriveTags(relativePath, userTag),
				sourceFiles: [relativePath],
				sourcePath: relativePath,
				sourceHash,
				sourceMtimeMs: stat.mtimeMs,
				sourceSize: stat.size,
				locations,
			};
			extractionResults.push({ relativePath, entry });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			extractionResults.push({ relativePath, error: message });
		}
	}

	const newEntries = extractionResults
		.map((result) => result.entry)
		.filter((entry): entry is BmsAutosarKnowledgeEntry => entry !== undefined);
	const failedFiles = extractionResults.filter((result) => result.error);

	// Source paths that existed before but are no longer present in the folder.
	const removedSourcePaths = existingEntries
		.map((entry) => entry.sourcePath)
		.filter(
			(sourcePath): sourcePath is string =>
				!!sourcePath && !currentSourcePaths.has(sourcePath),
		);

	const { kbPath } = await saveBmsKnowledgeEntries({
		cwd,
		scope,
		entries: newEntries,
		removedSourcePaths,
	});

	warmBmsAutosarVectorCache(
		newEntries,
		_controller.stateManager.getApiConfiguration(),
	).catch(() => {
		// Best-effort embedding warm-up.
	});

	const failureSummary =
		failedFiles.length > 0
			? ` (${failedFiles.length} file(s) could not be read: ${failedFiles.map((f) => f.relativePath).join(", ")})`
			: "";
	const removedSummary =
		removedSourcePaths.length > 0
			? ` Removed ${removedSourcePaths.length} stale entries.`
			: "";
	const message = `Imported ${newEntries.length} entries from ${files.length} files in ${path.basename(folderPath)} to ${scope} BMS AUTOSAR knowledge base (${kbPath}).${failureSummary}${removedSummary}`;
	HostProvider.window.showMessage({
		type:
			failedFiles.length > 0
				? ShowMessageType.WARNING
				: ShowMessageType.INFORMATION,
		message,
	});

	return ProtoString.create({ value: message });
}
