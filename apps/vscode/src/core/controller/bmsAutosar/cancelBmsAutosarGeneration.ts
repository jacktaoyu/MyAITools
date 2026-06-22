import { Empty, EmptyRequest } from "@shared/proto/cline/common";
import { Controller } from "../index";

/**
 * Cancels the currently running BMS AUTOSAR generation task.
 */
export async function cancelBmsAutosarGeneration(
	controller: Controller,
	_request: EmptyRequest,
): Promise<Empty> {
	await controller.cancelTask();
	return Empty.create();
}
