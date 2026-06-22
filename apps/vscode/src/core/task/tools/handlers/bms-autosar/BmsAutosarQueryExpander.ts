/**
 * AUTOSAR/BMS domain query expansion.
 *
 * Embedding and BM25 retrievers suffer from a vocabulary gap: queries and
 * knowledge entries may refer to the same concept using different abbreviations
 * or naming conventions (e.g. "CSC" vs "Cell Supervision Circuit" vs "AFE").
 * This module expands a user query with canonical synonyms so that retrieval
 * can bridge those surface-form mismatches without requiring a domain-tuned
 * embedding model.
 */

export interface QueryExpansion {
	/** Query with expansion terms appended. */
	expanded: string
	/** Original query. */
	original: string
	/** Terms that were added by the expansion. */
	addedTerms: string[]
}

/**
 * Canonical AUTOSAR/BMS acronym and synonym map.
 * Keys are query terms that trigger expansion; values are synonyms to append.
 */
export const AUTOSAR_SYNONYMS: ReadonlyMap<string, readonly string[]> = new Map([
	["csc", ["CellSupervisionCircuit", "CellSupervision", "AFE", "AnalogFrontEnd"]],
	["afe", ["AnalogFrontEnd", "CSC", "CellSupervisionCircuit"]],
	["soc", ["StateOfCharge"]],
	["soh", ["StateOfHealth"]],
	["dod", ["DepthOfDischarge"]],
	["bms", ["BatteryManagementSystem"]],
	["swc", ["SoftwareComponent", "ApplicationSwComponentType"]],
	["rte", ["RuntimeEnvironment", "RunTimeEnvironment"]],
	["bsw", ["BasicSoftware"]],
	["ecu", ["ElectronicControlUnit"]],
	["dem", ["DiagnosticEventManager"]],
	["dtc", ["DiagnosticTroubleCode"]],
	["dbc", ["DiagnosticCommunication"]],
	["nvm", ["NonVolatileMemory", "NvM"]],
	["com", ["Communication"]],
	["pdu", ["ProtocolDataUnit"]],
	["ecum", ["ECUStateManager"]],
	["nm", ["NetworkManagement"]],
	["cdd", ["ComplexDeviceDriver"]],
	["schm", ["ScheduleManager", "BswScheduler"]],
	["adc", ["AnalogDigitalConverter"]],
	["gpio", ["GeneralPurposeIO", "GeneralPurposeInputOutput"]],
	["pwm", ["PulseWidthModulation"]],
	["spi", ["SerialPeripheralInterface"]],
	["can", ["ControllerAreaNetwork"]],
	["lin", ["LocalInterconnectNetwork"]],
	["memmap", ["MemoryMapping"]],
	["contactor", ["Relay", "HVSwitch"]],
	["balancing", ["CellBalancing", "Equalization"]],
	["thermal", ["TemperatureManagement", "ThermalManagement"]],
	["charger", ["Charging", "ChargeController"]],
	["diagnosis", ["Diagnostic", "FaultDetection"]],
	["state-estimation", ["StateEstimation", "SOC", "SOH", "StateOfCharge", "StateOfHealth"]],
])

function tokenizeForExpansion(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((token) => token.length > 1)
}

/**
 * Expands an AUTOSAR/BMS query with domain synonyms.
 *
 * The expansion is conservative: only whole tokens that appear in the synonym
 * map trigger additions, and each synonym is added at most once. Expansions are
 * appended rather than replacing the original query so that embedding models
 * retain the original user intent while gaining additional domain vocabulary.
 */
export function expandAutosarQuery(query: string): QueryExpansion {
	const normalized = query.trim()
	if (!normalized) {
		return { expanded: "", original: "", addedTerms: [] }
	}

	const tokens = tokenizeForExpansion(normalized)
	const added = new Set<string>()

	for (const token of tokens) {
		const synonyms = AUTOSAR_SYNONYMS.get(token)
		if (synonyms) {
			for (const synonym of synonyms) {
				added.add(synonym)
			}
		}
	}

	const addedTerms = Array.from(added)
	const expanded = addedTerms.length > 0 ? `${normalized} ${addedTerms.join(" ")}` : normalized

	return { expanded, original: normalized, addedTerms }
}
