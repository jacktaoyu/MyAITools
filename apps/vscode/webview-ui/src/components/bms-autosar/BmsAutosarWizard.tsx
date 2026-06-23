import { type BmsAutosarProgressEvent, GenerateBmsAutosarRequest } from "@shared/proto/cline/bms_autosar"
import { type BmsAutosarTemplatesList, ListBmsAutosarTemplatesRequest } from "@shared/proto/cline/file"
import { dump as yamlDump, load as yamlLoad } from "js-yaml"
import { Loader2 } from "lucide-react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { BmsAutosarServiceClient, FileServiceClient } from "@/services/grpc-client"
import ViewHeader from "../common/ViewHeader"
import BmsAutosarTemplateManager from "./BmsAutosarTemplateManager"
import { COMPONENT_PRESETS } from "./BmsAutosarWizard.presets"
import {
	ASIL_LEVELS,
	applyPreset,
	buildPrompt,
	downloadBlob,
	exportBatchConfig,
	getErrorMessage,
	importBatchConfig,
	validateForm,
	type WizardFormState,
} from "./BmsAutosarWizard.utils"

const COMPONENT_TYPES = [
	{ value: "swc", label: "Application SWC" },
	{ value: "bsw_module", label: "BSW Module" },
	{ value: "rte_interface", label: "RTE Interface" },
	{ value: "arxml_descriptor", label: "ARXML Descriptor" },
	{ value: "service", label: "Service" },
	{ value: "ecu_extract", label: "ECU Extract" },
	{ value: "bms_csc", label: "BMS Cell Supervision (CSC/AFE)" },
	{ value: "bms_controller", label: "BMS Controller" },
	{ value: "bms_balancer", label: "BMS Balancer" },
	{ value: "bms_thermal_manager", label: "BMS Thermal Manager" },
	{ value: "bms_charger", label: "BMS Charger" },
	{ value: "bms_diagnosis", label: "BMS Diagnosis" },
]

const OUTPUT_FORMATS = [
	{ value: "both", label: "C Code + ARXML" },
	{ value: "c_code", label: "C Code only" },
	{ value: "arxml", label: "ARXML only" },
]

type WizardStep = "type" | "details" | "review"

type BmsAutosarWizardProps = {
	onDone: () => void
}

const BmsAutosarWizard: React.FC<BmsAutosarWizardProps> = ({ onDone }) => {
	const { environment } = useExtensionState()
	const [step, setStep] = useState<WizardStep>("type")
	const [form, setForm] = useState<WizardFormState>({
		componentType: "swc",
		componentName: "",
		requirements: "",
		outputFormat: "both",
		asilLevel: "QM",
		portsJson: "",
		runnablesJson: "",
	})
	const [touched, setTouched] = useState<Partial<Record<keyof WizardFormState, boolean>>>({})
	const [showPreview, setShowPreview] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [successNotice, setSuccessNotice] = useState<string | null>(null)
	const [progress, setProgress] = useState<BmsAutosarProgressEvent | null>(null)
	const [cancelFn, setCancelFn] = useState<(() => void) | null>(null)
	const [customTemplates, setCustomTemplates] = useState<BmsAutosarTemplatesList["entries"]>([])
	const [showTemplateManager, setShowTemplateManager] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const validation = useMemo(() => validateForm(form), [form])
	const promptPreview = useMemo(() => buildPrompt(form), [form])

	const updateForm = useCallback(<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) => {
		setForm((prev) => ({ ...prev, [key]: value }))
		setTouched((prev) => ({ ...prev, [key]: true }))
		setError(null)
	}, [])

	const applyComponentPreset = useCallback(() => {
		const preset = COMPONENT_PRESETS[form.componentType]
		if (!preset) return
		setForm((prev) => ({
			...prev,
			...applyPreset(preset),
			componentType: prev.componentType,
		}))
		setTouched((prev) => ({ ...prev, componentName: true }))
	}, [form.componentType])

	useEffect(() => {
		// Auto-apply preset when landing on details step if fields are empty
		if (step === "details" && !form.componentName && !form.requirements && !form.portsJson && !form.runnablesJson) {
			applyComponentPreset()
		}
	}, [step, form.componentName, form.requirements, form.portsJson, form.runnablesJson, applyComponentPreset])

	const loadCustomTemplates = useCallback(async () => {
		try {
			const response = await FileServiceClient.listBmsAutosarTemplates(ListBmsAutosarTemplatesRequest.create({}))
			setCustomTemplates(response.entries)
		} catch (error) {
			console.error("Failed to load custom templates:", error)
		}
	}, [])

	useEffect(() => {
		loadCustomTemplates()
	}, [loadCustomTemplates])

	const componentTypeOptions = useMemo(
		() => [...COMPONENT_TYPES, ...customTemplates.map((entry) => ({ value: entry.key, label: `${entry.key} (custom)` }))],
		[customTemplates],
	)

	const canProceed = useCallback(() => {
		if (step === "type") return !!form.componentType
		if (step === "details") return validation.valid
		return true
	}, [step, form.componentType, validation.valid])

	const handleGenerate = useCallback(async () => {
		if (!validation.valid) {
			setError("Please fix the form errors before generating.")
			return
		}
		setIsSubmitting(true)
		setError(null)
		setSuccessNotice(null)
		setProgress(null)

		const unsubscribe = BmsAutosarServiceClient.generateBmsAutosar(
			GenerateBmsAutosarRequest.create({
				prompt: promptPreview,
				componentType: form.componentType,
				componentName: form.componentName,
				outputFormat: form.outputFormat,
				asilLevel: form.asilLevel,
				requirements: form.requirements,
				portsJson: form.portsJson,
				runnablesJson: form.runnablesJson,
			}),
			{
				onResponse: (event) => setProgress(event),
				onError: (err) => {
					setError(getErrorMessage(err) || "Failed to start generation task.")
					setIsSubmitting(false)
				},
				onComplete: () => {
					setIsSubmitting(false)
					onDone()
				},
			},
		)
		setCancelFn(() => unsubscribe)
	}, [form, onDone, promptPreview, validation.valid])

	const handleNext = useCallback(() => {
		setError(null)
		if (step === "type") {
			setStep("details")
		} else if (step === "details") {
			if (!validation.valid) {
				setTouched({
					componentType: true,
					componentName: true,
					outputFormat: true,
					asilLevel: true,
					portsJson: true,
					runnablesJson: true,
					requirements: true,
				})
				setError("Please fix the form errors before continuing.")
				return
			}
			setStep("review")
		}
	}, [step, validation.valid])

	const handleBack = useCallback(() => {
		setError(null)
		if (step === "details") setStep("type")
		else if (step === "review") setStep("details")
	}, [step])

	const handleExportJson = useCallback(() => {
		const config = exportBatchConfig(form)
		downloadBlob(JSON.stringify(config, null, 2), `${form.componentName || "bms-autosar"}-batch.json`, "application/json")
	}, [form])

	const handleExportYaml = useCallback(() => {
		const config = exportBatchConfig(form)
		const yamlText = yamlDump(config, { indent: 2, lineWidth: -1 })
		downloadBlob(yamlText, `${form.componentName || "bms-autosar"}-batch.yaml`, "text/yaml")
	}, [form])

	const handleImportClick = useCallback(() => {
		fileInputRef.current?.click()
	}, [])

	const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => {
			try {
				const content = reader.result as string
				let config: unknown
				if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
					config = yamlLoad(content)
				} else {
					config = JSON.parse(content)
				}
				const imported = importBatchConfig(
					config as {
						components: {
							component_type?: string
							component_name: string
							requirements?: string
							output_format?: string
							ports?: unknown[]
							runnables?: unknown[]
						}[]
					},
				)
				if ("error" in imported) {
					setError(imported.error)
				} else {
					setForm(imported)
					setTouched({})
					setError(null)
				}
			} catch (err) {
				setError(`Failed to import config: ${getErrorMessage(err)}`)
			}
		}
		reader.readAsText(file)
		// Reset input so the same file can be selected again
		event.target.value = ""
	}, [])

	const renderFieldError = (field: keyof WizardFormState) => {
		if (!touched[field]) return null
		const message = validation.errors[field]
		return message ? <div className="mt-1 text-xs text-error">{message}</div> : null
	}

	return (
		<div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--vscode-editor-background)" }}>
			<ViewHeader environment={environment} onDone={onDone} title="BMS AUTOSAR Generator" />

			<div className="flex-1 overflow-auto px-6 pb-6">
				<div className="mx-auto max-w-3xl">
					<div className="mb-6 flex items-center gap-2 text-sm text-description">
						<span className={step === "type" ? "text-foreground font-medium" : ""}>1. Type</span>
						<span>→</span>
						<span className={step === "details" ? "text-foreground font-medium" : ""}>2. Details</span>
						<span>→</span>
						<span className={step === "review" ? "text-foreground font-medium" : ""}>3. Review</span>
					</div>

					{step === "type" && (
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<Label htmlFor="component-type">Component type</Label>
								<Button onClick={() => setShowTemplateManager(true)} size="sm" variant="outline">
									Manage templates
								</Button>
							</div>
							<Select onValueChange={(value) => updateForm("componentType", value)} value={form.componentType}>
								<SelectTrigger id="component-type">
									<SelectValue placeholder="Select a component type" />
								</SelectTrigger>
								<SelectContent>
									{componentTypeOptions.map((type) => (
										<SelectItem key={type.value} value={type.value}>
											{type.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{renderFieldError("componentType")}
						</div>
					)}

					{step === "details" && (
						<div className="flex flex-col gap-5">
							<div className="flex items-center justify-between">
								<Label>Component details</Label>
								<Button onClick={applyComponentPreset} size="sm" variant="outline">
									Apply preset
								</Button>
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="component-name">Component name</Label>
								<Input
									id="component-name"
									onBlur={() => setTouched((prev) => ({ ...prev, componentName: true }))}
									onChange={(e) => updateForm("componentName", e.target.value)}
									placeholder="e.g., BmsCscFront"
									value={form.componentName}
								/>
								{renderFieldError("componentName")}
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="output-format">Output format</Label>
								<Select onValueChange={(value) => updateForm("outputFormat", value)} value={form.outputFormat}>
									<SelectTrigger id="output-format">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{OUTPUT_FORMATS.map((fmt) => (
											<SelectItem key={fmt.value} value={fmt.value}>
												{fmt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{renderFieldError("outputFormat")}
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="asil-level">ASIL level</Label>
								<Select
									onValueChange={(value) => updateForm("asilLevel", value as WizardFormState["asilLevel"])}
									value={form.asilLevel}>
									<SelectTrigger id="asil-level">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ASIL_LEVELS.map((level) => (
											<SelectItem key={level} value={level}>
												{level === "QM" ? "QM (Quality Management)" : level.replace("_", " ")}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="requirements">Requirements (optional)</Label>
								<Textarea
									id="requirements"
									onChange={(e) => updateForm("requirements", e.target.value)}
									placeholder="Describe ports, runnables, behavior, timing, and safety requirements..."
									rows={5}
									value={form.requirements}
								/>
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="ports-json">Ports JSON (optional)</Label>
								<Textarea
									id="ports-json"
									onBlur={() => setTouched((prev) => ({ ...prev, portsJson: true }))}
									onChange={(e) => updateForm("portsJson", e.target.value)}
									placeholder='[{"name":"CellVoltage","direction":"provided","interface_type":"S/R","data_type":"Adc_VoltageType"}]'
									rows={3}
									value={form.portsJson}
								/>
								{renderFieldError("portsJson")}
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="runnables-json">Runnables JSON (optional)</Label>
								<Textarea
									id="runnables-json"
									onBlur={() => setTouched((prev) => ({ ...prev, runnablesJson: true }))}
									onChange={(e) => updateForm("runnablesJson", e.target.value)}
									placeholder='[{"name":"Run100ms","event":"TimingEvent","period_ms":100}]'
									rows={3}
									value={form.runnablesJson}
								/>
								{renderFieldError("runnablesJson")}
							</div>

							<div className="flex flex-col gap-2">
								<Button
									className="self-start"
									onClick={() => setShowPreview((prev) => !prev)}
									size="sm"
									variant="outline">
									{showPreview ? "Hide live preview" : "Show live preview"}
								</Button>
								{showPreview && (
									<div className="rounded-md border border-panel-border p-4">
										<h4 className="mb-2 text-xs font-medium text-description">Live prompt preview</h4>
										<pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
											{buildPrompt(form)}
										</pre>
									</div>
								)}
							</div>
						</div>
					)}

					{step === "review" && (
						<div className="flex flex-col gap-4">
							<div className="rounded-md border border-panel-border p-4">
								<h4 className="mb-2 text-sm font-medium">Generation request</h4>
								<pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{promptPreview}</pre>
							</div>
						</div>
					)}

					{error && <div className="mt-4 text-sm text-error">{error}</div>}
					{isSubmitting && progress && (
						<div className="mt-6 flex flex-col gap-3 rounded-md border border-panel-border p-4">
							<div className="flex items-center gap-2 text-sm text-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span className="capitalize">{progress.message || progress.stage}</span>
							</div>
							<Progress value={progress.percentComplete} />
							<Button
								onClick={() => {
									cancelFn?.()
									setIsSubmitting(false)
								}}
								size="sm"
								variant="secondary">
								Cancel
							</Button>
						</div>
					)}
					{successNotice && (
						<div className="mt-4 flex items-center gap-2 rounded-md bg-button-background/10 px-3 py-2 text-sm text-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{successNotice}
						</div>
					)}

					<div className="mt-8 flex flex-wrap items-center justify-between gap-3">
						<div className="flex gap-2">
							<Button disabled={step === "type" || isSubmitting} onClick={handleBack} variant="secondary">
								Back
							</Button>
							{step === "details" && (
								<>
									<Button onClick={handleImportClick} size="sm" variant="outline">
										Import
									</Button>
									<input
										accept=".json,.yaml,.yml"
										className="hidden"
										onChange={handleFileImport}
										ref={fileInputRef}
										type="file"
									/>
								</>
							)}
						</div>
						<div className="flex gap-2">
							{step === "details" && (
								<>
									<Button onClick={handleExportJson} size="sm" variant="outline">
										Export JSON
									</Button>
									<Button onClick={handleExportYaml} size="sm" variant="outline">
										Export YAML
									</Button>
								</>
							)}
							{step === "review" ? (
								<Button disabled={isSubmitting} onClick={handleGenerate}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Starting task...
										</>
									) : (
										"Generate"
									)}
								</Button>
							) : (
								<Button disabled={!canProceed()} onClick={handleNext}>
									Next
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>

			<BmsAutosarTemplateManager isOpen={showTemplateManager} onClose={() => setShowTemplateManager(false)} />
		</div>
	)
}

export default BmsAutosarWizard
