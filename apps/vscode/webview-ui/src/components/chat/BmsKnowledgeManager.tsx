import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import Fuse from "fuse.js"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BmsAutosarKnowledgeGraphView } from "./BmsAutosarKnowledgeGraphView"
import { BmsAutosarQualityPanel } from "./BmsAutosarQualityPanel"
import { FileServiceClient } from "@/services/grpc-client"
import {
	AddBmsKnowledgeFolderRequest,
	AddBmsKnowledgeRequest,
	BmsKnowledgeListRequest,
	DeleteBmsKnowledgeRequest,
	ImportBmsKnowledgeJsonRequest,
	SearchBmsKnowledgeRequest,
	UpdateBmsKnowledgeRequest,
	type BmsKnowledgeEntry,
	type BmsKnowledgeSearchResult,
} from "@shared/proto/cline/file"

type Notice = {
	message: string
	type: "success" | "error"
}

type Scope = "workspace" | "global"

const BmsKnowledgeManager: React.FC = () => {
	const [notice, setNotice] = useState<Notice | null>(null)
	const [isOpen, setIsOpen] = useState(false)
	const [entries, setEntries] = useState<BmsKnowledgeEntry[]>([])
	const [loading, setLoading] = useState(false)
	const [scope, setScope] = useState<Scope>("workspace")
	const [searchQuery, setSearchQuery] = useState("")
	const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
	const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
	const [deleteTopic, setDeleteTopic] = useState<string | null>(null)
	const [semanticQuery, setSemanticQuery] = useState("")
	const [semanticResults, setSemanticResults] = useState<BmsKnowledgeSearchResult[]>([])
	const [semanticLoading, setSemanticLoading] = useState(false)
	const [showSemanticPanel, setShowSemanticPanel] = useState(false)
	const [semanticTopK, setSemanticTopK] = useState(5)
	const [semanticHybridWeight, setSemanticHybridWeight] = useState(0.7)
	const [semanticScoreThreshold, setSemanticScoreThreshold] = useState(0)
	const [semanticUseReranker, setSemanticUseReranker] = useState(false)
	const [showRetrievalSettings, setShowRetrievalSettings] = useState(false)
	const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
	const [editingEntry, setEditingEntry] = useState<BmsKnowledgeEntry | null>(null)
	const [editContent, setEditContent] = useState("")
	const [editTags, setEditTags] = useState("")
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

	const showNotice = useCallback((message: string, type: "success" | "error") => {
		setNotice({ message, type })
		window.setTimeout(() => setNotice(null), 3000)
	}, [])

	const fetchEntries = useCallback(async () => {
		setLoading(true)
		try {
			const response = await FileServiceClient.listBmsKnowledge(
				BmsKnowledgeListRequest.create({ scope }),
			)
			setEntries(response.entries || [])
		} catch (error: any) {
			console.error("Failed to list BMS knowledge:", error)
			showNotice(error?.message || "Failed to load BMS knowledge entries", "error")
		} finally {
			setLoading(false)
		}
	}, [scope, showNotice])

	useEffect(() => {
		if (isOpen) {
			fetchEntries()
		}
	}, [isOpen, fetchEntries])

	const handleAdd = async () => {
		showNotice("Importing file into BMS AUTOSAR knowledge base...", "success")
		try {
			const response = await FileServiceClient.addBmsKnowledge(AddBmsKnowledgeRequest.create({ scope }))
			if (response.value) {
				showNotice(response.value, "success")
				if (isOpen) {
					fetchEntries()
				}
			}
		} catch (error: any) {
			console.error("Failed to add BMS knowledge:", error)
			showNotice(error?.message || "Failed to add BMS knowledge", "error")
		}
	}

	const handleAddFolder = async () => {
		showNotice("Importing folder into BMS AUTOSAR knowledge base...", "success")
		try {
			const response = await FileServiceClient.addBmsKnowledgeFolder(
				AddBmsKnowledgeFolderRequest.create({ scope }),
			)
			if (response.value) {
				showNotice(response.value, "success")
				if (isOpen) {
					fetchEntries()
				}
			}
		} catch (error: any) {
			console.error("Failed to add BMS knowledge folder:", error)
			showNotice(error?.message || "Failed to add BMS knowledge folder", "error")
		}
	}

	const handleDelete = async (topic: string) => {
		try {
			const response = await FileServiceClient.deleteBmsKnowledge(
				DeleteBmsKnowledgeRequest.create({ topic, scope }),
			)
			showNotice(response.value, "success")
			setDeleteTopic(null)
			setSelectedEntries((prev) => {
				const next = new Set(prev)
				next.delete(topic)
				return next
			})
			fetchEntries()
		} catch (error: any) {
			console.error("Failed to delete BMS knowledge:", error)
			showNotice(error?.message || "Failed to delete entry", "error")
		}
	}

	const toggleSelectEntry = (topic: string) => {
		setSelectedEntries((prev) => {
			const next = new Set(prev)
			if (next.has(topic)) {
				next.delete(topic)
			} else {
				next.add(topic)
			}
			return next
		})
	}

	const toggleSelectAll = () => {
		if (selectedEntries.size === filteredEntries.length && filteredEntries.length > 0) {
			setSelectedEntries(new Set())
		} else {
			setSelectedEntries(new Set(filteredEntries.map((entry) => entry.topic)))
		}
	}

	const handleBulkDelete = async () => {
		if (selectedEntries.size === 0) return
		const topics = Array.from(selectedEntries)
		let failures = 0
		for (const topic of topics) {
			try {
				await FileServiceClient.deleteBmsKnowledge(DeleteBmsKnowledgeRequest.create({ topic, scope }))
			} catch (error: any) {
				console.error(`Failed to delete ${topic}:`, error)
				failures++
			}
		}
		setSelectedEntries(new Set())
		fetchEntries()
		if (failures === 0) {
			showNotice(`Deleted ${topics.length} entr${topics.length === 1 ? "y" : "ies"}.`, "success")
		} else {
			showNotice(`Deleted ${topics.length - failures} of ${topics.length} entries.`, "error")
		}
	}

	const openEditDialog = (entry: BmsKnowledgeEntry) => {
		setEditingEntry(entry)
		setEditContent(entry.content || "")
		setEditTags((entry.tags || []).join(", "))
		setIsEditDialogOpen(true)
	}

	const handleSaveEdit = async () => {
		if (!editingEntry) return
		try {
			const tags = editTags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean)
			const response = await FileServiceClient.updateBmsKnowledge(
				UpdateBmsKnowledgeRequest.create({
					topic: editingEntry.topic,
					content: editContent,
					tags,
					scope,
				}),
			)
			showNotice(response.value, "success")
			setIsEditDialogOpen(false)
			setEditingEntry(null)
			fetchEntries()
		} catch (error: any) {
			console.error("Failed to update BMS knowledge:", error)
			showNotice(error?.message || "Failed to update entry", "error")
		}
	}

	const handleExport = async () => {
		try {
			const response = await FileServiceClient.exportBmsKnowledge(BmsKnowledgeListRequest.create({ scope }))
			const blob = new Blob([response.value], { type: "application/json" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `bms-autosar-knowledge-${scope}.json`
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
			showNotice(`Exported ${scope} BMS AUTOSAR knowledge base.`, "success")
		} catch (error: any) {
			console.error("Failed to export BMS knowledge:", error)
			showNotice(error?.message || "Failed to export knowledge base", "error")
		}
	}

	const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		if (!file) return
		try {
			const text = await file.text()
			const response = await FileServiceClient.importBmsKnowledgeJson(
				ImportBmsKnowledgeJsonRequest.create({ scope, json: text }),
			)
			showNotice(response.value, "success")
			fetchEntries()
		} catch (error: any) {
			console.error("Failed to import BMS knowledge:", error)
			showNotice(error?.message || "Failed to import knowledge base", "error")
		} finally {
			event.target.value = ""
		}
	}

	const allTags = useMemo(() => {
		const tags = new Set<string>()
		entries.forEach((entry) => entry.tags?.forEach((tag) => tags.add(tag)))
		return Array.from(tags).sort()
	}, [entries])

	const fuse = useMemo(() => {
		return new Fuse(entries, {
			keys: ["topic", "content", "tags"],
			threshold: 0.4,
			ignoreLocation: true,
		})
	}, [entries])

	const filteredEntries = useMemo(() => {
		const query = searchQuery.trim()
		if (!query) {
			return entries.filter((entry) => {
				const matchesTags =
					selectedTags.size === 0 || entry.tags?.some((tag) => selectedTags.has(tag))
				return matchesTags
			})
		}
		const fuseResults = fuse.search(query)
		return fuseResults
			.map((result) => result.item)
			.filter((entry) => {
				const matchesTags =
					selectedTags.size === 0 || entry.tags?.some((tag) => selectedTags.has(tag))
				return matchesTags
			})
	}, [entries, fuse, searchQuery, selectedTags])

	const handleSemanticSearch = useCallback(async () => {
		const query = semanticQuery.trim()
		if (!query) {
			setSemanticResults([])
			return
		}
		setSemanticLoading(true)
		try {
			const tags = selectedTags.size > 0 ? Array.from(selectedTags) : undefined
			const response = await FileServiceClient.searchBmsKnowledge(
				SearchBmsKnowledgeRequest.create({
					query,
					scope,
					topK: semanticTopK,
					hybridWeight: semanticHybridWeight,
					scoreThreshold: semanticScoreThreshold,
					useReranker: semanticUseReranker,
					tags,
				}),
			)
			setSemanticResults(response.results || [])
		} catch (error: any) {
			console.error("Failed to search BMS knowledge:", error)
			showNotice(error?.message || "Failed to search BMS knowledge", "error")
		} finally {
			setSemanticLoading(false)
		}
	}, [
		scope,
		semanticQuery,
		semanticTopK,
		semanticHybridWeight,
		semanticScoreThreshold,
		semanticUseReranker,
		selectedTags,
		showNotice,
	])

	const toggleTag = (tag: string) => {
		setSelectedTags((prev) => {
			const next = new Set(prev)
			if (next.has(tag)) {
				next.delete(tag)
			} else {
				next.add(tag)
			}
			return next
		})
	}

	const toggleExpand = (topic: string) => {
		setExpandedTopic((current) => (current === topic ? null : topic))
	}

	const getEmbeddingIcon = (entry: BmsKnowledgeEntry) => {
		if (!entry.hasEmbedding) {
			return { icon: "codicon-sync", tooltip: "Not embedded yet", color: "var(--vscode-descriptionForeground)" }
		}
		if (entry.embeddingStale) {
			return { icon: "codicon-warning", tooltip: "Embedding stale", color: "var(--vscode-editorWarning-foreground)" }
		}
		return { icon: "codicon-check", tooltip: "Embedding cached", color: "var(--vscode-terminal-ansiGreen)" }
	}

	return (
		<>
			{notice && (
				<div
					className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-3 py-1.5 rounded text-xs shadow border"
					style={{
						backgroundColor: "var(--vscode-notifications-background)",
						color: "var(--vscode-notifications-foreground)",
						borderColor: "var(--vscode-notifications-border)",
					}}>
					{notice.message}
				</div>
			)}

			<Tooltip>
				<TooltipContent>Add BMS Knowledge from File</TooltipContent>
				<TooltipTrigger>
					<VSCodeButton
						appearance="icon"
						aria-label="Add BMS Knowledge from File"
						className="p-0 m-0 flex items-center"
						data-testid="bms-knowledge-add-button"
						onClick={handleAdd}>
						<i className="codicon codicon-book" style={{ fontSize: "12.5px" }} />
					</VSCodeButton>
				</TooltipTrigger>
			</Tooltip>

			<Tooltip>
				<TooltipContent>Add BMS Knowledge from Folder</TooltipContent>
				<TooltipTrigger>
					<VSCodeButton
						appearance="icon"
						aria-label="Add BMS Knowledge from Folder"
						className="p-0 m-0 flex items-center"
						data-testid="bms-knowledge-add-folder-button"
						onClick={handleAddFolder}>
						<i className="codicon codicon-folder-library" style={{ fontSize: "12.5px" }} />
					</VSCodeButton>
				</TooltipTrigger>
			</Tooltip>

			<Dialog onOpenChange={setIsOpen} open={isOpen}>
				<Tooltip>
					<TooltipContent>Manage BMS Knowledge</TooltipContent>
					<TooltipTrigger>
						<VSCodeButton
							appearance="icon"
							aria-label="Manage BMS Knowledge"
							className="p-0 m-0 flex items-center"
							data-testid="bms-knowledge-manage-button"
							onClick={() => setIsOpen(true)}>
							<i className="codicon codicon-list-unordered" style={{ fontSize: "12.5px" }} />
						</VSCodeButton>
					</TooltipTrigger>
				</Tooltip>

				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>BMS AUTOSAR Knowledge</DialogTitle>
						<DialogDescription>
							Search, filter by tags, and manage knowledge entries.
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-center gap-2 mt-3">
						<button
							onClick={() => setScope("workspace")}
							className={`text-xs px-2 py-1 rounded ${
								scope === "workspace"
									? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
									: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] border"
							}`}>
							Workspace
						</button>
						<button
							onClick={() => setScope("global")}
							className={`text-xs px-2 py-1 rounded ${
								scope === "global"
									? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]"
									: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] border"
							}`}>
							Global
						</button>
						<div className="flex-1" />
						<BmsAutosarQualityPanel />
						<BmsAutosarKnowledgeGraphView scope={scope} />
						<Tooltip>
							<TooltipContent>Export knowledge base</TooltipContent>
							<TooltipTrigger>
								<VSCodeButton
									appearance="icon"
									aria-label="Export knowledge base"
									className="p-0 m-0 flex items-center"
									onClick={handleExport}>
									<i className="codicon codicon-desktop-download" style={{ fontSize: "12.5px" }} />
								</VSCodeButton>
							</TooltipTrigger>
						</Tooltip>
						<Tooltip>
							<TooltipContent>Import knowledge base</TooltipContent>
							<TooltipTrigger>
								<VSCodeButton
									appearance="icon"
									aria-label="Import knowledge base"
									className="p-0 m-0 flex items-center relative">
									<i className="codicon codicon-cloud-upload" style={{ fontSize: "12.5px" }} />
									<input
										type="file"
										accept=".json"
										onChange={handleImportFile}
										className="absolute inset-0 opacity-0 cursor-pointer"
									/>
								</VSCodeButton>
							</TooltipTrigger>
						</Tooltip>
						{selectedEntries.size > 0 && (
							<Tooltip>
								<TooltipContent>Delete {selectedEntries.size} selected entries</TooltipContent>
								<TooltipTrigger>
									<VSCodeButton
										appearance="icon"
										aria-label={`Delete ${selectedEntries.size} selected entries`}
										className="p-0 m-0 flex items-center"
										onClick={handleBulkDelete}>
										<i className="codicon codicon-trash" style={{ fontSize: "12.5px", color: "var(--vscode-errorForeground)" }} />
									</VSCodeButton>
								</TooltipTrigger>
							</Tooltip>
						)}
					</div>

					<div className="mt-3">
						<VSCodeTextField
							value={searchQuery}
							onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
							placeholder="Search by topic..."
							className="w-full"
						/>
					</div>

					{allTags.length > 0 && (
						<div className="flex flex-wrap gap-1 mt-3">
							{allTags.map((tag) => (
								<button
									key={tag}
									onClick={() => toggleTag(tag)}
									className={`text-xs px-2 py-0.5 rounded border ${
										selectedTags.has(tag)
											? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent"
											: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
									}`}>
									{tag}
								</button>
							))}
						</div>
					)}

					<div className="mt-3 flex items-center gap-2">
						<VSCodeTextField
							value={semanticQuery}
							onInput={(e) => setSemanticQuery((e.target as HTMLInputElement).value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSemanticSearch()
								}
							}}
							placeholder="Semantic search across knowledge..."
							className="flex-1"
						/>
						<VSCodeButton
							appearance="icon"
							aria-label="Search"
							disabled={semanticLoading}
							onClick={() => {
								handleSemanticSearch()
								setShowSemanticPanel(true)
							}}>
							<i className="codicon codicon-search" style={{ fontSize: "12.5px" }} />
						</VSCodeButton>
						<VSCodeButton
							appearance="icon"
							aria-label="Toggle retrieval settings"
							onClick={() => setShowRetrievalSettings((prev) => !prev)}>
							<i
								className={`codicon ${showRetrievalSettings ? "codicon-chevron-up" : "codicon-chevron-down"}`}
								style={{ fontSize: "12.5px" }}
							/>
						</VSCodeButton>
					</div>

					{showRetrievalSettings && (
						<div className="mt-2 p-2 border border-[var(--vscode-panel-border)] rounded text-xs space-y-2">
							<div className="flex items-center gap-2">
								<label className="w-24 text-[var(--vscode-descriptionForeground)]">Top K</label>
								<input
									type="number"
									min={1}
									max={50}
									value={semanticTopK}
									onChange={(e) => setSemanticTopK(Math.max(1, Math.min(50, Number.parseInt(e.target.value, 10) || 1)))}
									className="flex-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-panel-border)] rounded px-1 py-0.5"
								/>
							</div>
							<div className="flex items-center gap-2">
								<label className="w-24 text-[var(--vscode-descriptionForeground)]">Hybrid Weight</label>
								<input
									type="range"
									min={0}
									max={1}
									step={0.05}
									value={semanticHybridWeight}
									onChange={(e) => setSemanticHybridWeight(Number.parseFloat(e.target.value))}
									className="flex-1"
								/>
								<span className="w-10 text-right">{semanticHybridWeight.toFixed(2)}</span>
							</div>
							<div className="flex items-center gap-2">
								<label className="w-24 text-[var(--vscode-descriptionForeground)]">Threshold</label>
								<input
									type="number"
									min={0}
									max={1}
									step={0.05}
									value={semanticScoreThreshold}
									onChange={(e) => setSemanticScoreThreshold(Math.max(0, Math.min(1, Number.parseFloat(e.target.value) || 0)))}
									className="flex-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-panel-border)] rounded px-1 py-0.5"
								/>
							</div>
							<div className="flex items-center gap-2">
								<input
									id="bms-use-reranker"
									type="checkbox"
									checked={semanticUseReranker}
									onChange={(e) => setSemanticUseReranker(e.target.checked)}
									className="cursor-pointer"
								/>
								<label htmlFor="bms-use-reranker" className="text-[var(--vscode-descriptionForeground)] cursor-pointer">
									Use LLM reranker (slower, more precise)
								</label>
							</div>
							{selectedTags.size > 0 && (
								<div className="text-[var(--vscode-descriptionForeground)]">
									Filtering by tags: {Array.from(selectedTags).join(", ")}
								</div>
							)}
						</div>
					)}

					{showSemanticPanel && (
						<div className="mt-3 border border-[var(--vscode-panel-border)] rounded p-2">
							<div className="flex items-center justify-between mb-2">
								<div className="text-xs font-medium">Semantic Search Results</div>
								<button
									onClick={() => setShowSemanticPanel(false)}
									className="text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]">
									Hide
								</button>
							</div>
							{semanticLoading ? (
								<div className="text-sm text-description py-2 text-center">Searching...</div>
							) : semanticResults.length === 0 ? (
								<div className="text-sm text-description py-2 text-center">No semantic results.</div>
							) : (
								<ul className="divide-y divide-[var(--vscode-panel-border)]">
									{semanticResults.map((result, index) => (
										<li key={index} className="py-1.5">
											<div className="text-sm">{result.topic}</div>
											<div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
												score {(result.score ?? 0).toFixed(3)} · {result.sourcePath || "unknown"}
											</div>
											{(result.tags?.length || result.sourceFiles?.length) && (

												<div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5">

													{result.tags && result.tags.length > 0 && <span>tags: {result.tags.join(", ")}</span>}

													{result.sourceFiles && result.sourceFiles.length > 0 && (

														<span className={result.tags?.length ? "ml-2" : ""}>

															sources: {result.sourceFiles.join(", ")}

														</span>

													)}

												</div>

											)}

											{result.snippet && (

												<div className="text-xs mt-1 line-clamp-3 text-[var(--vscode-descriptionForeground)]">

													{result.snippet}

												</div>

											)}
										</li>
									))}
								</ul>
						)}
					</div>
					)}

					<div className="max-h-80 overflow-y-auto mt-3 border border-[var(--vscode-panel-border)] rounded">
						{loading ? (
							<div className="text-sm text-description py-4 text-center">Loading...</div>
						) : filteredEntries.length === 0 ? (
							<div className="text-sm text-description py-4 text-center">No entries found.</div>
						) : (
							<>
								<div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
									<input
										type="checkbox"
										checked={selectedEntries.size === filteredEntries.length && filteredEntries.length > 0}
										ref={(el) => {
											if (el) {
												el.indeterminate = selectedEntries.size > 0 && selectedEntries.size < filteredEntries.length
											}
										}}
										onChange={toggleSelectAll}
										className="cursor-pointer"
									/>
									<span className="text-xs text-[var(--vscode-descriptionForeground)]">
										{selectedEntries.size > 0 ? `${selectedEntries.size} selected` : `${filteredEntries.length} entries`}
									</span>
								</div>
								<ul className="divide-y divide-[var(--vscode-panel-border)]">
								{filteredEntries.map((entry) => {
									const embedding = getEmbeddingIcon(entry)
									const isExpanded = expandedTopic === entry.topic
									return (
										<li
											key={entry.topic}
											className="py-2 px-2 hover:bg-[var(--vscode-list-hover-background)]">
											<div className="flex items-start gap-2">
												<input
													type="checkbox"
													checked={selectedEntries.has(entry.topic)}
													onChange={() => toggleSelectEntry(entry.topic)}
													className="mt-1 cursor-pointer flex-shrink-0"
												/>
												<div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleExpand(entry.topic)}>
													<div className="text-sm truncate">{entry.topic}</div>
													<div className="text-xs text-description">
														{entry.updatedAt
															? new Date(entry.updatedAt).toLocaleString()
															: ""}
													</div>
													{entry.tags && entry.tags.length > 0 && (
														<div className="flex flex-wrap gap-1 mt-1">
															{entry.tags.map((tag) => (
																<span
																	key={tag}
																	className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
																	{tag}
																</span>
															))}
														</div>
													)}
												</div>
												<div className="flex items-center gap-1 flex-shrink-0">
													<Tooltip>
														<TooltipContent>{embedding.tooltip}</TooltipContent>
														<TooltipTrigger>
															<i
																className={`codicon ${embedding.icon}`}
																style={{
																	fontSize: "12.5px",
																	color: embedding.color,
																}}
															/>
														</TooltipTrigger>
													</Tooltip>
													<Tooltip>
														<TooltipContent>Edit {entry.topic}</TooltipContent>
														<TooltipTrigger>
															<VSCodeButton
																appearance="icon"
																aria-label={`Edit ${entry.topic}`}
																className="p-0 m-0 flex items-center"
																onClick={() => openEditDialog(entry)}>
																<i className="codicon codicon-edit" style={{ fontSize: "12.5px" }} />
															</VSCodeButton>
														</TooltipTrigger>
													</Tooltip>
													<Tooltip>
														<TooltipContent>Delete {entry.topic}</TooltipContent>
														<TooltipTrigger>
															<VSCodeButton
																appearance="icon"
																aria-label={`Delete ${entry.topic}`}
																className="p-0 m-0 flex items-center"
																onClick={() => setDeleteTopic(entry.topic)}>
																<i
																	className="codicon codicon-trash"
																	style={{
																		fontSize: "12.5px",
																		color: "var(--vscode-errorForeground)",
																	}}
																/>
															</VSCodeButton>
														</TooltipTrigger>
													</Tooltip>
												</div>
											</div>
												{isExpanded && (
													<div className="mt-2 text-xs bg-[var(--vscode-textCodeBlock-background)] p-2 rounded max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
														{entry.sourceFiles && entry.sourceFiles.length > 0 && (
															<div className="mb-2 text-[var(--vscode-descriptionForeground)]">
																Sources: {entry.sourceFiles.join(", ")}
															</div>
														)}
														{entry.content}
													</div>
												)}
										</li>
									)
								})}
							</ul>
						</>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{deleteTopic && (
				<Dialog open onOpenChange={() => setDeleteTopic(null)}>
					<DialogContent className="max-w-sm">
						<DialogHeader>
							<DialogTitle>Delete knowledge entry?</DialogTitle>
							<DialogDescription>
								Are you sure you want to delete "{deleteTopic}"? This cannot be undone.
							</DialogDescription>
						</DialogHeader>
						<div className="flex justify-end gap-2 mt-4">
							<VSCodeButton onClick={() => setDeleteTopic(null)}>Cancel</VSCodeButton>
							<VSCodeButton
								appearance="primary"
								onClick={() => handleDelete(deleteTopic)}
								style={{ backgroundColor: "var(--vscode-errorForeground)" }}>
								Delete
							</VSCodeButton>
						</div>
					</DialogContent>
				</Dialog>
			)}

			<Dialog open={isEditDialogOpen} onOpenChange={(open) => {
				setIsEditDialogOpen(open)
				if (!open) setEditingEntry(null)
			}}>
				<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Edit {editingEntry?.topic}</DialogTitle>
						<DialogDescription>
							Update content and tags for this knowledge entry.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 mt-3 flex-1 min-h-0">
						<VSCodeTextField
							value={editTags}
							onInput={(e) => setEditTags((e.target as HTMLInputElement).value)}
							placeholder="Tags (comma separated)"
							className="w-full"
						/>
						<textarea
							value={editContent}
							onChange={(e) => setEditContent(e.target.value)}
							placeholder="Knowledge content..."
							className="flex-1 min-h-0 w-full rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] p-2 text-sm resize-none"
							style={{ minHeight: "200px" }}
						/>
					</div>
					<div className="flex justify-end gap-2 mt-4">
						<VSCodeButton onClick={() => setIsEditDialogOpen(false)}>Cancel</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={handleSaveEdit}>
							Save
						</VSCodeButton>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

export default BmsKnowledgeManager
