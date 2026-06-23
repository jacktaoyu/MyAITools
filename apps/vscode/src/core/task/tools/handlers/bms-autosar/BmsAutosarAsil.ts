/**
 * ASIL (Automotive Safety Integrity Level) helpers for BMS AUTOSAR generation.
 *
 * Aligns with ISO 26262 ASIL levels: QM, ASIL_A, ASIL_B, ASIL_C, ASIL_D.
 */

export type AsilLevel = "QM" | "ASIL_A" | "ASIL_B" | "ASIL_C" | "ASIL_D"

export const ASIL_LEVELS: readonly AsilLevel[] = ["QM", "ASIL_A", "ASIL_B", "ASIL_C", "ASIL_D"]

export const DEFAULT_ASIL_LEVEL: AsilLevel = "QM"

/**
 * Normalizes a raw ASIL string to a valid AsilLevel.
 * Defaults to QM when the input is unrecognized.
 */
export function normalizeAsilLevel(value: string | undefined): AsilLevel {
	if (!value) {
		return DEFAULT_ASIL_LEVEL
	}
	const normalized = value.trim().toUpperCase().replace(/-/g, "_")
	if (ASIL_LEVELS.includes(normalized as AsilLevel)) {
		return normalized as AsilLevel
	}
	return DEFAULT_ASIL_LEVEL
}

/**
 * Returns true for ASIL_C and ASIL_D, where stricter safety patterns are required.
 */
export function isHighAsil(level: AsilLevel): boolean {
	return level === "ASIL_C" || level === "ASIL_D"
}

/**
 * Returns true for any ASIL level above QM.
 */
export function isAsil(level: AsilLevel): boolean {
	return level !== "QM"
}

/**
 * Human-readable label for the ASIL level.
 */
export function asilLabel(level: AsilLevel): string {
	switch (level) {
		case "QM":
			return "QM (Quality Management)"
		case "ASIL_A":
			return "ASIL A"
		case "ASIL_B":
			return "ASIL B"
		case "ASIL_C":
			return "ASIL C"
		case "ASIL_D":
			return "ASIL D"
	}
}

/**
 * Returns ISO 26262 / AUTOSAR aligned design guidelines for the given ASIL level.
 * These are injected into the generation prompt to steer the LLM.
 */
export function getAsilDesignGuidelines(level: AsilLevel): string {
	const base = [
		"Follow MISRA C:2012 aligned style.",
		"Initialize all local variables at declaration.",
		"Avoid dynamic memory allocation.",
		"Use const-correctness for read-only data.",
	]

	switch (level) {
		case "QM":
			return base.join("\n")
		case "ASIL_A":
		case "ASIL_B":
			return [
				...base,
				"Add range checks for safety-related inputs and outputs.",
				"Return typed error codes (Std_ReturnType / E_OK / E_NOT_OK).",
				"Avoid implicit type conversions that may lose safety-critical data.",
			].join("\n")
		case "ASIL_C":
		case "ASIL_D":
			return [
				...base,
				"Add defensive programming: input validation, output clamping, and single points of return.",
				"Use redundant checks or diverse monitoring for safety-critical computations where appropriate.",
				"Integrate WdgM checkpoint calls for safety-critical runnables.",
				"Report safety-relevant failures via DET and/or DEM.",
				"Protect data with E2E protection when communicated across boundaries.",
				"Use explicit safe states for detected faults.",
				"Avoid floating-point comparisons for safety thresholds; prefer fixed-point or integer arithmetic.",
			].join("\n")
	}
}
