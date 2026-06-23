import type { WizardPreset } from "./BmsAutosarWizard.presets"

export type AsilLevel = "QM" | "ASIL_A" | "ASIL_B" | "ASIL_C" | "ASIL_D"

export const ASIL_LEVELS: readonly AsilLevel[] = ["QM", "ASIL_A", "ASIL_B", "ASIL_C", "ASIL_D"]

export interface WizardFormState {
	componentType: string
	componentName: string
	requirements: string
	outputFormat: string
	asilLevel: AsilLevel
	portsJson: string
	runnablesJson: string
}

export interface BatchComponentConfig {
	component_type?: string
	component_name: string
	requirements?: string
	output_format?: string
	asil_level?: AsilLevel
	ports?: unknown[]
	runnables?: unknown[]
}

export interface BatchConfig {
	components: BatchComponentConfig[]
}

export function buildPrompt(state: WizardFormState): string {
	const typeLabel = state.componentType
	let prompt = `Generate a BMS AUTOSAR ${typeLabel} (component_type="${state.componentType}") named "${state.componentName.trim()}" with output_format="${state.outputFormat}" and asil_level="${state.asilLevel}".`
	if (state.requirements.trim()) {
		prompt += `\n\nRequirements:\n${state.requirements.trim()}`
	}
	if (state.portsJson.trim()) {
		prompt += `\n\nPorts (JSON):\n${state.portsJson.trim()}`
	}
	if (state.runnablesJson.trim()) {
		prompt += `\n\nRunnables (JSON):\n${state.runnablesJson.trim()}`
	}
	prompt += `\n\nUse the bms_autosar_generate tool. If any required information is missing, ask before writing files.`
	return prompt
}

export function validateJsonArray(value: string): { valid: boolean; error?: string } {
	if (!value.trim()) {
		return { valid: true }
	}
	try {
		const parsed = JSON.parse(value)
		if (!Array.isArray(parsed)) {
			return { valid: false, error: "Must be a JSON array." }
		}
		return { valid: true }
	} catch (err: unknown) {
		return { valid: false, error: `Invalid JSON: ${getErrorMessage(err)}` }
	}
}

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export function validateForm(state: WizardFormState): { valid: boolean; errors: Partial<Record<keyof WizardFormState, string>> } {
	const errors: Partial<Record<keyof WizardFormState, string>> = {}

	if (!state.componentType.trim()) {
		errors.componentType = "Component type is required."
	}
	if (!state.componentName.trim()) {
		errors.componentName = "Component name is required."
	}
	if (!state.outputFormat.trim()) {
		errors.outputFormat = "Output format is required."
	}

	const portsValidation = validateJsonArray(state.portsJson)
	if (!portsValidation.valid) {
		errors.portsJson = portsValidation.error
	}

	const runnablesValidation = validateJsonArray(state.runnablesJson)
	if (!runnablesValidation.valid) {
		errors.runnablesJson = runnablesValidation.error
	}

	return { valid: Object.keys(errors).length === 0, errors }
}

export function exportBatchConfig(state: WizardFormState): BatchConfig {
	const config: BatchComponentConfig = {
		component_type: state.componentType,
		component_name: state.componentName.trim(),
		output_format: state.outputFormat,
		asil_level: state.asilLevel,
	}
	if (state.requirements.trim()) {
		config.requirements = state.requirements.trim()
	}
	const portsValidation = validateJsonArray(state.portsJson)
	if (portsValidation.valid && state.portsJson.trim()) {
		config.ports = JSON.parse(state.portsJson) as unknown[]
	}
	const runnablesValidation = validateJsonArray(state.runnablesJson)
	if (runnablesValidation.valid && state.runnablesJson.trim()) {
		config.runnables = JSON.parse(state.runnablesJson) as unknown[]
	}
	return { components: [config] }
}

export function importBatchConfig(config: BatchConfig): WizardFormState | { error: string } {
	if (!config || !Array.isArray(config.components) || config.components.length === 0) {
		return { error: "Batch config must contain a non-empty 'components' array." }
	}
	const item = config.components[0]
	if (!item.component_name) {
		return { error: "First component is missing 'component_name'." }
	}
	return {
		componentType: item.component_type || "swc",
		componentName: item.component_name,
		requirements: item.requirements || "",
		outputFormat: item.output_format || "both",
		asilLevel: item.asil_level || "QM",
		portsJson: Array.isArray(item.ports) ? JSON.stringify(item.ports, null, 2) : "",
		runnablesJson: Array.isArray(item.runnables) ? JSON.stringify(item.runnables, null, 2) : "",
	}
}

export function applyPreset(preset: WizardPreset): WizardFormState {
	return {
		componentType: "",
		componentName: preset.componentName,
		requirements: preset.requirements,
		outputFormat: preset.outputFormat,
		asilLevel: (preset.asilLevel as AsilLevel) ?? "QM",
		portsJson: preset.portsJson,
		runnablesJson: preset.runnablesJson,
	}
}

export function downloadBlob(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}
