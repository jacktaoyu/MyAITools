import fs from "node:fs/promises";
import path from "node:path";
import { StringRequest } from "@shared/proto/cline/common";
import {
	BmsAutosarExternalGraph,
	BmsAutosarExternalNode,
} from "@shared/proto/cline/file";
import { fileExistsAtPath } from "@utils/fs";
import type { Controller } from "..";

function parseSimulinkDataNames(content: string): string[] {
	const names = new Set<string>();

	// NumericType aliases: sfix16_Sp_t = Simulink.NumericType;
	const numericTypeRegex = /^(\w+)\s*=\s*Simulink\.NumericType\s*;/gm;
	for (const match of content.matchAll(numericTypeRegex)) {
		names.add(match[1]);
	}

	// Enum types: Simulink.defineIntEnumType('eOffOn_t', ...)
	const enumTypeRegex = /Simulink\.defineIntEnumType\(\s*'([^']+)'/g;
	for (const match of content.matchAll(enumTypeRegex)) {
		names.add(match[1]);
	}

	// Alias types: MyType = Simulink.AliasType;
	const aliasTypeRegex = /^(\w+)\s*=\s*Simulink\.AliasType\s*;/gm;
	for (const match of content.matchAll(aliasTypeRegex)) {
		names.add(match[1]);
	}

	return Array.from(names);
}

/**
 * Parses Simulink data dictionary .m files into external graph nodes.
 * The request value may be a single .m file or a directory containing them.
 */
export async function parseBmsAutosarSimulinkData(
	_controller: Controller,
	request: StringRequest,
): Promise<BmsAutosarExternalGraph> {
	const inputPath = request.value;
	if (!inputPath) {
		return BmsAutosarExternalGraph.create({ nodes: [], edges: [] });
	}

	const filePaths: string[] = [];
	if (await fileExistsAtPath(inputPath)) {
		const stat = await fs.stat(inputPath);
		if (stat.isDirectory()) {
			const entries = await fs.readdir(inputPath);
			for (const entry of entries) {
				if (entry.endsWith(".m")) {
					filePaths.push(path.join(inputPath, entry));
				}
			}
		} else {
			filePaths.push(inputPath);
		}
	}

	const nodes: BmsAutosarExternalNode[] = [];
	for (const filePath of filePaths) {
		const content = await fs.readFile(filePath, "utf-8");
		const names = parseSimulinkDataNames(content);
		for (const name of names) {
			nodes.push(
				BmsAutosarExternalNode.create({
					id: `SIMULINK-DATA:${name}`,
					type: "SIMULINK-DATA",
					name,
					sourceFile: filePath,
					metadata: JSON.stringify({ file: path.basename(filePath) }),
				}),
			);
		}
	}

	return BmsAutosarExternalGraph.create({ nodes, edges: [] });
}
