import { Empty, EmptyRequest } from "@shared/proto/cline/common";
import { Logger } from "@/shared/services/Logger";
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler";
import { Controller } from "../index";

// Keep track of active BMS AUTOSAR quality report open subscriptions
const activeBmsAutosarQualityReportSubscriptions = new Set<
	StreamingResponseHandler<Empty>
>();

/**
 * Subscribe to BMS AUTOSAR quality report open events
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToBmsAutosarQualityReport(
	_controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	// Add this subscription to the active subscriptions
	activeBmsAutosarQualityReportSubscriptions.add(responseStream);

	// Register cleanup when the connection is closed
	const cleanup = () => {
		activeBmsAutosarQualityReportSubscriptions.delete(responseStream);
	};

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			cleanup,
			{ type: "bms_autosar_quality_report_subscription" },
			responseStream,
		);
	}
}

/**
 * Send a BMS AUTOSAR quality report open event to all active subscribers
 */
export async function sendBmsAutosarQualityReportEvent(): Promise<void> {
	// Send the event to all active subscribers
	const promises = Array.from(activeBmsAutosarQualityReportSubscriptions).map(
		async (responseStream) => {
			try {
				const event = Empty.create({});
				await responseStream(
					event,
					false, // Not the last message
				);
			} catch (error) {
				Logger.error("Error sending BMS AUTOSAR quality report event:", error);
				// Remove the subscription if there was an error
				activeBmsAutosarQualityReportSubscriptions.delete(responseStream);
			}
		},
	);

	await Promise.all(promises);
}
