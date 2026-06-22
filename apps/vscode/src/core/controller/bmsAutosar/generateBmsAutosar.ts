import {
	BmsAutosarProgressEvent,
	GenerateBmsAutosarRequest,
} from "@shared/proto/cline/bms_autosar";
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler";
import { Controller } from "../index";
import { subscribeToBmsAutosarProgress } from "@core/task/tools/handlers/bms-autosar/BmsAutosarProgressBus";

/**
 * Starts a BMS AUTOSAR generation task and streams structured progress events
 * back to the webview as the task runs.
 */
export async function generateBmsAutosar(
	controller: Controller,
	request: GenerateBmsAutosarRequest,
	responseStream: StreamingResponseHandler<BmsAutosarProgressEvent>,
	requestId?: string,
): Promise<void> {
	const prompt = request.prompt;
	if (!prompt.trim()) {
		throw new Error("Generation prompt is required.");
	}

	await responseStream(
		BmsAutosarProgressEvent.create({
			stage: "preparing",
			message: "Preparing generation task...",
			percentComplete: 10,
		}),
		false,
	);

	const taskId = await controller.initTask(prompt);
	if (!taskId) {
		throw new Error("Failed to initialize generation task.");
	}

	// Forward progress events emitted by the bms_autosar_generate tool handler.
	const unsubscribe = subscribeToBmsAutosarProgress(taskId, async (event) => {
		await responseStream(event, event.isComplete);
	});

	const cleanup = () => {
		unsubscribe();
	};

	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			cleanup,
			{ type: "bms_autosar_generation" as const, taskId },
			responseStream,
		);
	}
}
