import fs from "node:fs/promises";
import { StringRequest } from "@shared/proto/cline/common";
import {
	BmsAutosarExternalGraph,
	BmsAutosarExternalNode,
} from "@shared/proto/cline/file";
import type { BmsAutosarDbc } from "@core/task/tools/handlers/bms-autosar/BmsAutosarDbcParser";
import type { Controller } from "..";

/**
 * Parses a CAN DBC file into external graph nodes (CAN signals).
 */
export async function parseBmsAutosarDbc(
	_controller: Controller,
	request: StringRequest,
): Promise<BmsAutosarExternalGraph> {
	const filePath = request.value;
	if (!filePath) {
		return BmsAutosarExternalGraph.create({ nodes: [], edges: [] });
	}

	const content = await fs.readFile(filePath, "utf-8");
	const { parseDbc } = await import(
		"@core/task/tools/handlers/bms-autosar/BmsAutosarDbcParser"
	);
	const dbc: BmsAutosarDbc = parseDbc(content);
	const nodes: BmsAutosarExternalNode[] = [];

	for (const message of dbc.messages) {
		for (const signal of message.signals) {
			nodes.push(
				BmsAutosarExternalNode.create({
					id: `CAN-SIGNAL:${signal.name}`,
					type: "CAN-SIGNAL",
					name: signal.name,
					sourceFile: filePath,
					metadata: JSON.stringify({
						message: message.name,
						messageId: message.id,
						dlc: message.dlc,
						startBit: signal.startBit,
						length: signal.length,
						unit: signal.unit,
					}),
				}),
			);
		}
	}

	return BmsAutosarExternalGraph.create({ nodes, edges: [] });
}
