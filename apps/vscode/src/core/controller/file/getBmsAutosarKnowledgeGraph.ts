import fs from "node:fs/promises";
import path from "node:path";
import {
	BmsAutosarKnowledgeGraph,
	BmsAutosarKnowledgeGraphEdge,
	BmsAutosarKnowledgeGraphNode,
	BmsAutosarKnowledgeGraphRequest,
} from "@shared/proto/cline/file";
import { getBmsKnowledgeDir } from "@core/controller/file/bmsKnowledgeStorage";
import { buildArxmlKnowledgeGraph } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeGraph";
import type { BmsAutosarKnowledgeFile } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

export async function getBmsAutosarKnowledgeGraph(
	_controller: Controller,
	request: BmsAutosarKnowledgeGraphRequest,
): Promise<BmsAutosarKnowledgeGraph> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const arxmlPaths: string[] = [...request.filePaths];

	// If no explicit paths are given, collect ARXML source files from the
	// knowledge base entries.
	if (arxmlPaths.length === 0) {
		const kbDir = getBmsKnowledgeDir(cwd, scope);
		const kbPath = path.join(kbDir, "knowledge.json");
		try {
			const raw = await fs.readFile(kbPath, "utf-8");
			const data = JSON.parse(raw) as BmsAutosarKnowledgeFile;
			const seen = new Set<string>();
			for (const entry of data.entries) {
				for (const sourceFile of entry.sourceFiles || []) {
					if (sourceFile.toLowerCase().endsWith(".arxml")) {
						const resolved = path.isAbsolute(sourceFile)
							? sourceFile
							: path.join(kbDir, sourceFile);
						if (!seen.has(resolved)) {
							seen.add(resolved);
							arxmlPaths.push(resolved);
						}
					}
				}
			}
		} catch {
			// Knowledge file may not exist yet.
		}
	}

	const contents: string[] = [];
	for (const filePath of arxmlPaths) {
		try {
			contents.push(await fs.readFile(filePath, "utf-8"));
		} catch {
			// Skip unreadable files.
		}
	}

	const graph = buildArxmlKnowledgeGraph(contents.join("\n"));
	return BmsAutosarKnowledgeGraph.create({
		nodes: Array.from(graph.nodes.values()).map((node) =>
			BmsAutosarKnowledgeGraphNode.create({
				id: node.id,
				type: node.type,
				name: node.name,
				path: node.path,
				packagePath: node.packagePath,
			}),
		),
		edges: graph.edges.map((edge) =>
			BmsAutosarKnowledgeGraphEdge.create({
				source: edge.source,
				target: edge.target,
				relation: edge.relation,
			}),
		),
	});
}
