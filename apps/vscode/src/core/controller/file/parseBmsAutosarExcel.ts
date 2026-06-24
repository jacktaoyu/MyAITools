import ExcelJS from "exceljs";
import { StringRequest } from "@shared/proto/cline/common";
import {
	BmsAutosarExternalGraph,
	BmsAutosarExternalNode,
} from "@shared/proto/cline/file";
import type { Controller } from "..";

/**
 * Parses an Excel interface or parameter file into external graph nodes.
 */
export async function parseBmsAutosarExcel(
	_controller: Controller,
	request: StringRequest,
): Promise<BmsAutosarExternalGraph> {
	const filePath = request.value;
	if (!filePath) {
		return BmsAutosarExternalGraph.create({ nodes: [], edges: [] });
	}

	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(filePath);
	const nodes: BmsAutosarExternalNode[] = [];
	const type = filePath.toLowerCase().includes("parameter")
		? "EXCEL-PARAMETER"
		: "EXCEL-INTERFACE";

	for (const worksheet of workbook.worksheets) {
		worksheet.eachRow((row, rowNumber) => {
			if (rowNumber === 1) return;
			const name = row.getCell(1).text?.trim();
			if (!name) return;
			const description = row.getCell(2).text?.trim();
			nodes.push(
				BmsAutosarExternalNode.create({
					id: `${type}:${name}`,
					type,
					name,
					sourceFile: filePath,
					metadata: JSON.stringify({ sheet: worksheet.name, description }),
				}),
			);
		});
	}

	return BmsAutosarExternalGraph.create({ nodes, edges: [] });
}
