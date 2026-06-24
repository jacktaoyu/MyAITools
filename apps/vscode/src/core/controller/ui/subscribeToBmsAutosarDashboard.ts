import { Empty, EmptyRequest } from "@shared/proto/cline/common";
import { Logger } from "@/shared/services/Logger";
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler";
import { Controller } from "../index";

// Keep track of active BMS AUTOSAR dashboard open subscriptions
const activeBmsAutosarDashboardSubscriptions = new Set<
	StreamingResponseHandler<Empty>
>();

/**
 * Subscribe to BMS AUTOSAR dashboard open events
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToBmsAutosarDashboard(
	_controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	// Add this subscription to the active subscriptions
	activeBmsAutosarDashboardSubscriptions.add(responseStream);

	// Register cleanup when the connection is closed
	const cleanup = () => {
		activeBmsAutosarDashboardSubscriptions.delete(responseStream);
	};

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(
			requestId,
			cleanup,
			{ type: "bms_autosar_dashboard_subscription" },
			responseStream,
		);
	}
}

/**
 * Send a BMS AUTOSAR dashboard open event to all active subscribers
 */
export async function sendBmsAutosarDashboardEvent(): Promise<void> {
	// Send the event to all active subscribers
	const promises = Array.from(activeBmsAutosarDashboardSubscriptions).map(
		async (responseStream) => {
			try {
				const event = Empty.create({});
				await responseStream(
					event,
					false, // Not the last message
				);
			} catch (error) {
				Logger.error("Error sending BMS AUTOSAR dashboard event:", error);
				// Remove the subscription if there was an error
				activeBmsAutosarDashboardSubscriptions.delete(responseStream);
			}
		},
	);

	await Promise.all(promises);
}
