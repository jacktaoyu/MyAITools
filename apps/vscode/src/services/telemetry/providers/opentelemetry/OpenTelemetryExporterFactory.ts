import { credentials as grpcCredentials } from "@grpc/grpc-js"
import { ConsoleLogRecordExporter, LogRecordExporter } from "@opentelemetry/sdk-logs"
import { ConsoleMetricExporter, MetricReader, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { Logger } from "@/shared/services/Logger"
import { wrapLogsExporterWithDiagnostics, wrapMetricsExporterWithDiagnostics } from "./otel-exporter-diagnostics"

/**
 * Check if debug diagnostics are enabled
 */
function isDebugEnabled(): boolean {
	return process.env.TEL_DEBUG_DIAGNOSTICS === "true" || process.env.IS_DEV === "true"
}

/**
 * Create a console log exporter
 */
export function createConsoleLogExporter(): ConsoleLogRecordExporter {
	return new ConsoleLogRecordExporter()
}

export function ensurePathSuffix(url: URL, suffix: string): void {
	const pathname = url.pathname
	const normalizedPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
	url.pathname = normalizedPathname
	if (!normalizedPathname.endsWith(suffix)) {
		url.pathname = `${normalizedPathname}${suffix}`
	}
}

/**
 * Create an OTLP log exporter based on protocol
 */
export async function createOTLPLogExporter(
	protocol: string,
	endpoint: string,
	insecure: boolean,
	headers?: Record<string, string>,
): Promise<LogRecordExporter | null> {
	try {
		let exporter: any = null
		const logsUrl = new URL(endpoint)
		ensurePathSuffix(logsUrl, "/v1/logs")

		switch (protocol) {
			case "grpc": {
				const { OTLPLogExporter } = await import("@opentelemetry/exporter-logs-otlp-grpc")
				const grpcEndpoint = endpoint.replace(/^https?:\/\//, "")
				const credentials = insecure ? grpcCredentials.createInsecure() : grpcCredentials.createSsl()

				exporter = new OTLPLogExporter({
					url: grpcEndpoint,
					credentials: credentials,
					headers,
				})
				break
			}
			case "http/json": {
				const { OTLPLogExporter } = await import("@opentelemetry/exporter-logs-otlp-http")
				exporter = new OTLPLogExporter({ url: logsUrl.toString(), headers })
				break
			}
			case "http/protobuf": {
				const { OTLPLogExporter } = await import("@opentelemetry/exporter-logs-otlp-proto")
				exporter = new OTLPLogExporter({ url: logsUrl.toString(), headers })
				break
			}
			default:
				Logger.warn(`[OTEL] Unknown OTLP protocol for logs: ${protocol}`)
				return null
		}

		// Wrap with diagnostics if debug is enabled
		if (isDebugEnabled()) {
			wrapLogsExporterWithDiagnostics(exporter, protocol, logsUrl.toString())
		}

		return exporter
	} catch (error) {
		Logger.error("[OTEL] Error creating OTLP log exporter:", error)
		return null
	}
}

/**
 * Create a console metric reader with exporter
 */
export function createConsoleMetricReader(intervalMs: number, timeoutMs: number): MetricReader {
	const exporter = new ConsoleMetricExporter()
	return new PeriodicExportingMetricReader({
		exporter,
		exportIntervalMillis: intervalMs,
		exportTimeoutMillis: timeoutMs,
	})
}

/**
 * Create an OTLP metric reader with exporter based on protocol
 */
export async function createOTLPMetricReader(
	protocol: string,
	endpoint: string,
	insecure: boolean,
	intervalMs: number,
	timeoutMs: number,
	headers?: Record<string, string>,
): Promise<MetricReader | null> {
	try {
		let exporter: any = null

		const metricsUrl = new URL(endpoint)
		ensurePathSuffix(metricsUrl, "/v1/metrics")

		switch (protocol) {
			case "grpc": {
				const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-grpc")
				const grpcEndpoint = endpoint.replace(/^https?:\/\//, "")
				const credentials = insecure ? grpcCredentials.createInsecure() : grpcCredentials.createSsl()

				exporter = new OTLPMetricExporter({
					url: grpcEndpoint,
					credentials: credentials,
					headers,
				})
				break
			}
			case "http/json": {
				const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http")
				exporter = new OTLPMetricExporter({ url: metricsUrl.toString(), headers })
				break
			}
			case "http/protobuf": {
				const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-proto")
				exporter = new OTLPMetricExporter({ url: metricsUrl.toString(), headers })
				break
			}
			default:
				Logger.warn(`[OTEL] Unknown OTLP protocol for metrics: ${protocol}`)
				return null
		}

		// Wrap with diagnostics if debug is enabled
		if (isDebugEnabled()) {
			wrapMetricsExporterWithDiagnostics(exporter, protocol, metricsUrl.toString())
		}

		return new PeriodicExportingMetricReader({
			exporter,
			exportIntervalMillis: intervalMs,
			exportTimeoutMillis: timeoutMs,
		})
	} catch (error) {
		Logger.error("[OTEL] Error creating OTLP metric reader:", error)
		return null
	}
}
