import {
	BmsAutosarTemplateEntry,
	DeleteBmsAutosarTemplateRequest,
	ListBmsAutosarTemplatesRequest,
	SaveBmsAutosarTemplateRequest,
} from "@shared/proto/cline/file"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileServiceClient } from "@/services/grpc-client"
import { getErrorMessage } from "./BmsAutosarWizard.utils"

const BUILTIN_COMPONENT_TYPES = [
	"swc",
	"bsw_module",
	"rte_interface",
	"arxml_descriptor",
	"service",
	"ecu_extract",
	"bms_csc",
	"bms_controller",
	"bms_balancer",
	"bms_thermal_manager",
	"bms_charger",
	"bms_diagnosis",
]

interface BmsAutosarTemplateManagerProps {
	isOpen: boolean
	onClose: () => void
}

export const BmsAutosarTemplateManager: React.FC<BmsAutosarTemplateManagerProps> = ({ isOpen, onClose }) => {
	const [templates, setTemplates] = useState<BmsAutosarTemplateEntry[]>([])
	const [loading, setLoading] = useState(false)
	const [newKey, setNewKey] = useState("")
	const [newComponentType, setNewComponentType] = useState("swc")
	const [newScope, setNewScope] = useState<"workspace" | "global">("workspace")
	const [message, setMessage] = useState<string | null>(null)

	const loadTemplates = useCallback(async () => {
		setLoading(true)
		try {
			const response = await FileServiceClient.listBmsAutosarTemplates(ListBmsAutosarTemplatesRequest.create({}))
			setTemplates(response.entries)
		} catch (error) {
			console.error("Failed to load templates:", error)
			setMessage(`Failed to load templates: ${getErrorMessage(error)}`)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (isOpen) {
			loadTemplates()
		}
	}, [isOpen, loadTemplates])

	const handleDelete = async (key: string, scope: string) => {
		try {
			const response = await FileServiceClient.deleteBmsAutosarTemplate(
				DeleteBmsAutosarTemplateRequest.create({ key, scope }),
			)
			setMessage(response.value)
			await loadTemplates()
		} catch (error) {
			console.error("Failed to delete template:", error)
			setMessage(`Failed to delete template: ${getErrorMessage(error)}`)
		}
	}

	const handleCreate = async () => {
		const key = newKey.trim()
		if (!key) {
			setMessage("Template key is required.")
			return
		}
		try {
			const response = await FileServiceClient.saveBmsAutosarTemplate(
				SaveBmsAutosarTemplateRequest.create({
					key,
					scope: newScope,
					componentType: newComponentType,
					headerTemplate: `#ifndef ${key.toUpperCase()}_H\n#define ${key.toUpperCase()}_H\n\n#include "Std_Types.h"\n\n#endif /* ${key.toUpperCase()}_H */`,
					cTemplate: `#include "${key}.h"\n\n/* TODO: implement ${key} */`,
					arxmlTemplate: `<?xml version="1.0" encoding="UTF-8"?>\n<AUTOSAR>\n  <AR-PACKAGES>\n    <AR-PACKAGE>\n      <SHORT-NAME>${key}</SHORT-NAME>\n    </AR-PACKAGE>\n  </AR-PACKAGES>\n</AUTOSAR>`,
				}),
			)
			setMessage(response.value)
			setNewKey("")
			await loadTemplates()
		} catch (error) {
			console.error("Failed to save template:", error)
			setMessage(`Failed to save template: ${getErrorMessage(error)}`)
		}
	}

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
			<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Manage BMS AUTOSAR Templates</DialogTitle>
					<DialogDescription>
						User-defined templates are stored in <code>.cline/bms-autosar/templates.json</code> (workspace) or{" "}
						<code>~/.cline/bms-autosar/templates.json</code> (global). They override built-in templates with the same
						key.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto mt-3">
					{loading ? (
						<div className="text-sm text-description py-4 text-center">Loading...</div>
					) : templates.length === 0 ? (
						<div className="text-sm text-description py-4 text-center">No user-defined templates yet.</div>
					) : (
						<ul className="divide-y divide-[var(--vscode-panel-border)] border border-[var(--vscode-panel-border)] rounded">
							{templates.map((template) => (
								<li className="py-2 px-3 flex items-center justify-between gap-2" key={template.key}>
									<div className="text-xs">
										<div className="font-medium">{template.key}</div>
										<div className="text-[var(--vscode-descriptionForeground)]">
											{template.componentType} · {template.scope}
										</div>
									</div>
									<VSCodeButton
										appearance="icon"
										aria-label={`Delete ${template.key}`}
										onClick={() => handleDelete(template.key, template.scope)}>
										<i className="codicon codicon-trash" style={{ fontSize: "12.5px" }} />
									</VSCodeButton>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="mt-4 pt-4 border-t border-[var(--vscode-panel-border)]">
					<h4 className="text-sm font-medium mb-2">Create template from built-in type</h4>
					<div className="flex items-end gap-2">
						<div className="flex-1 flex flex-col gap-1">
							<Label className="text-xs">Key</Label>
							<Input
								className="text-xs"
								onChange={(e) => setNewKey(e.target.value)}
								placeholder="e.g., my_custom_swc"
								value={newKey}
							/>
						</div>
						<div className="flex-1 flex flex-col gap-1">
							<Label className="text-xs">Base type</Label>
							<select
								className="text-xs px-2 py-1.5 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
								onChange={(e) => setNewComponentType(e.target.value)}
								value={newComponentType}>
								{BUILTIN_COMPONENT_TYPES.map((type) => (
									<option key={type} value={type}>
										{type}
									</option>
								))}
							</select>
						</div>
						<div className="flex-1 flex flex-col gap-1">
							<Label className="text-xs">Scope</Label>
							<select
								className="text-xs px-2 py-1.5 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
								onChange={(e) => setNewScope(e.target.value as "workspace" | "global")}
								value={newScope}>
								<option value="workspace">Workspace</option>
								<option value="global">Global</option>
							</select>
						</div>
						<VSCodeButton appearance="primary" onClick={handleCreate}>
							Create
						</VSCodeButton>
					</div>
				</div>

				{message && <div className="mt-3 text-xs text-[var(--vscode-descriptionForeground)]">{message}</div>}
			</DialogContent>
		</Dialog>
	)
}

export default BmsAutosarTemplateManager
