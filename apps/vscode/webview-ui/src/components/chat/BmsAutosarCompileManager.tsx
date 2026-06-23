import {
	VSCodeButton,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeTextArea,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { BmsAutosarServiceClient } from "@/services/grpc-client";
import {
	BmsAutosarCompileProfile,
	CompileBmsAutosarRequest,
	DeleteBmsAutosarCompileProfileRequest,
	ListBmsAutosarCompileProfilesRequest,
	SaveBmsAutosarCompileProfileRequest,
} from "@shared/proto/cline/bms_autosar";

type Notice = {
	message: string;
	type: "success" | "error";
};

type Scope = "workspace" | "global";

const EMPTY_PROFILE: Partial<BmsAutosarCompileProfile> = {
	id: "",
	name: "",
	workflow: "appl",
	command: "",
	commands: [],
	workingDirRelative: "appl",
	jobs: 32,
};

function formatCommands(commands?: string[]): string {
	return (commands || []).join("\n");
}

function parseCommands(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export interface BmsAutosarCompileManagerRef {
	open: () => void;
}

type BmsAutosarCompileManagerProps = {}

const BmsAutosarCompileManager = forwardRef<BmsAutosarCompileManagerRef, BmsAutosarCompileManagerProps>(function BmsAutosarCompileManager(_props, ref) {
	const [notice, setNotice] = useState<Notice | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [scope, setScope] = useState<Scope>("workspace");
	const [profiles, setProfiles] = useState<BmsAutosarCompileProfile[]>([]);
	const [lastSelectedId, setLastSelectedId] = useState("");
	const [selectedId, setSelectedId] = useState("");
	const [loading, setLoading] = useState(false);
	const [showManage, setShowManage] = useState(false);
	const [editingProfile, setEditingProfile] = useState<Partial<BmsAutosarCompileProfile>>(EMPTY_PROFILE);
	const [editingCommands, setEditingCommands] = useState("");

	const showNotice = useCallback((message: string, type: "success" | "error") => {
		setNotice({ message, type });
		window.setTimeout(() => setNotice(null), 4000);
	}, []);

	useImperativeHandle(ref, () => ({ open: () => setIsOpen(true) }), []);

	const fetchProfiles = useCallback(async () => {
		setLoading(true);
		try {
			const response = await BmsAutosarServiceClient.listBmsAutosarCompileProfiles(
				ListBmsAutosarCompileProfilesRequest.create({ scope }),
			);
			const list = response.profiles || [];
			setProfiles(list);
			setLastSelectedId(response.lastSelectedId || "");
			const defaultId = response.lastSelectedId || list[0]?.id || "";
			setSelectedId((prev) => (list.some((p) => p.id === prev) ? prev : defaultId));
		} catch (error: unknown) {
			console.error("Failed to list compile profiles:", error);
			showNotice(getErrorMessage(error) || "Failed to load compile profiles", "error");
		} finally {
			setLoading(false);
		}
	}, [scope, showNotice]);

	useEffect(() => {
		if (isOpen) {
			fetchProfiles();
		}
	}, [isOpen, fetchProfiles]);

	const selectedProfile = useMemo(
		() => profiles.find((p) => p.id === selectedId),
		[profiles, selectedId],
	);

	const handleRun = async () => {
		if (!selectedId) {
			showNotice("Please select a compile profile.", "error");
			return;
		}
		try {
			const response = await BmsAutosarServiceClient.compileBmsAutosar(
				CompileBmsAutosarRequest.create({ profileId: selectedId, scope }),
			);
			if (response.success) {
				showNotice(`Started: ${response.command}`, "success");
			} else {
				showNotice(response.message || "Compile failed to start.", "error");
			}
		} catch (error: unknown) {
			console.error("Failed to start compile:", error);
			showNotice(getErrorMessage(error) || "Failed to start compile", "error");
		}
	};

	const handleSaveProfile = async () => {
		const id = editingProfile.id?.trim();
		const name = editingProfile.name?.trim();
		const workflow = editingProfile.workflow;
		const isBuiltin = profiles.some((p) => p.id === id && p.isBuiltin);

		if (!id) {
			showNotice("Profile id is required.", "error");
			return;
		}
		if (!isBuiltin && (!name || (workflow !== "appl" && workflow !== "launch"))) {
			showNotice("Name and workflow are required for custom profiles.", "error");
			return;
		}

		const commands = parseCommands(editingCommands);
		try {
			const response = await BmsAutosarServiceClient.saveBmsAutosarCompileProfile(
				SaveBmsAutosarCompileProfileRequest.create({
					scope,
					profile: BmsAutosarCompileProfile.create({
						id,
						name: name || id,
						workflow: workflow || "appl",
						command: editingProfile.command || "",
						commands,
						workingDirRelative: editingProfile.workingDirRelative || "",
						jobs: editingProfile.jobs || 32,
					}),
				}),
			);
			showNotice(response.value, "success");
			setEditingProfile(EMPTY_PROFILE);
			setEditingCommands("");
			setShowManage(false);
			await fetchProfiles();
			setSelectedId(id);
		} catch (error: unknown) {
			console.error("Failed to save compile profile:", error);
			showNotice(getErrorMessage(error) || "Failed to save profile", "error");
		}
	};

	const handleDeleteProfile = async (id: string) => {
		try {
			const response = await BmsAutosarServiceClient.deleteBmsAutosarCompileProfile(
				DeleteBmsAutosarCompileProfileRequest.create({ scope, id }),
			);
			showNotice(response.value, "success");
			await fetchProfiles();
		} catch (error: unknown) {
			console.error("Failed to delete compile profile:", error);
			showNotice(getErrorMessage(error) || "Failed to delete profile", "error");
		}
	};

	const startNewProfile = () => {
		setEditingProfile({ ...EMPTY_PROFILE, id: `custom-${Date.now()}`, name: "" });
		setEditingCommands("");
		setShowManage(true);
	};

	const startEditProfile = (profile: BmsAutosarCompileProfile) => {
		setEditingProfile({ ...profile });
		setEditingCommands(formatCommands(profile.commands));
		setShowManage(true);
	};

	const isEditingBuiltin = Boolean(
		editingProfile.id && profiles.some((p) => p.id === editingProfile.id && p.isBuiltin),
	);

	return (
		<>
			{notice && (
				<div
					className={`fixed top-2 right-2 z-50 px-3 py-2 rounded text-xs ${
						notice.type === "error"
							? "bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-inputValidation-errorForeground)]"
							: "bg-[var(--vscode-inputValidation-infoBackground)] text-[var(--vscode-inputValidation-infoForeground)]"
					}`}>
					{notice.message}
				</div>
			)}

			<Dialog onOpenChange={setIsOpen} open={isOpen}>
				<DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>BMS AUTOSAR Compile</DialogTitle>
						<DialogDescription>
							Run a compile/build workflow in an integrated terminal.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3 mt-2 overflow-y-auto">
						<div className="flex items-center gap-2">
							<span className="text-xs">Scope</span>
							<VSCodeDropdown
								className="flex-1"
								currentValue={scope}
								onChange={(e: unknown) => setScope((e as React.ChangeEvent<HTMLSelectElement>).target.value as Scope)}>
								<VSCodeOption value="workspace">Workspace</VSCodeOption>
								<VSCodeOption value="global">Global</VSCodeOption>
							</VSCodeDropdown>
						</div>

						<div className="flex items-center gap-2">
							<span className="text-xs">Profile</span>
							<VSCodeDropdown
								className="flex-1"
								currentValue={selectedId}
								disabled={loading || profiles.length === 0}
								onChange={(e: unknown) => setSelectedId((e as React.ChangeEvent<HTMLSelectElement>).target.value)}>
								{profiles.map((profile) => (
									<VSCodeOption key={profile.id} value={profile.id}>
										{profile.name} {profile.isBuiltin ? "(built-in)" : `(${profile.scope})`}
									</VSCodeOption>
								))}
							</VSCodeDropdown>
						</div>

						{selectedProfile && (
							<div className="text-xs text-[var(--vscode-descriptionForeground)] space-y-1">
								<div>
									<strong>Workflow:</strong> {selectedProfile.workflow}
								</div>
								<div>
									<strong>Working dir:</strong>{" "}
									{selectedProfile.workingDirRelative || "<workspace root>"}
								</div>
								{selectedProfile.commands && selectedProfile.commands.length > 0 && (
									<div>
										<strong>Commands:</strong> {selectedProfile.commands.join("; ")}
									</div>
								)}
								{selectedProfile.command && (
									<div>
										<strong>Command override:</strong> {selectedProfile.command}
									</div>
								)}
							</div>
						)}

						<div className="flex gap-2 mt-1">
							<VSCodeButton onClick={handleRun}>Run Compile</VSCodeButton>
							<VSCodeButton appearance="secondary" onClick={() => setShowManage(true)}>
								Manage Profiles
							</VSCodeButton>
						</div>

						{showManage && (
							<div className="border border-[var(--vscode-editorGroup-border)] rounded p-3 flex flex-col gap-2 mt-2">
								<div className="text-sm font-semibold">
									{isEditingBuiltin
										? "Edit Built-in Defaults"
										: editingProfile.id && profiles.some((p) => p.id === editingProfile.id && !p.isBuiltin)
											? "Edit Profile"
											: "New Profile"}
								</div>

								<VSCodeTextField
									className="w-full"
									placeholder="Profile id"
									value={editingProfile.id || ""}
									disabled={isEditingBuiltin}
									onChange={(e: unknown) =>
										setEditingProfile((prev) => ({
											...prev,
											id: (e as React.ChangeEvent<HTMLInputElement>).target.value,
										}))
									}
								/>
								<VSCodeTextField
									className="w-full"
									placeholder="Display name"
									value={editingProfile.name || ""}
									disabled={isEditingBuiltin}
									onChange={(e: unknown) =>
										setEditingProfile((prev) => ({
											...prev,
											name: (e as React.ChangeEvent<HTMLInputElement>).target.value,
										}))
									}
								/>
								<div className="flex gap-2">
									<VSCodeDropdown
										className="flex-1"
										currentValue={editingProfile.workflow}
										disabled={isEditingBuiltin}
										onChange={(e: unknown) =>
											setEditingProfile((prev) => ({
												...prev,
												workflow: (e as React.ChangeEvent<HTMLSelectElement>).target.value as
													| "appl"
													| "launch",
											}))
										}>
										<VSCodeOption value="appl">appl</VSCodeOption>
										<VSCodeOption value="launch">launch</VSCodeOption>
									</VSCodeDropdown>
									<VSCodeTextField
										className="w-20"
										placeholder="Jobs"
										value={String(editingProfile.jobs ?? 32)}
										onChange={(e: unknown) =>
											setEditingProfile((prev) => ({
												...prev,
												jobs: parseInt((e as React.ChangeEvent<HTMLInputElement>).target.value, 10) || 0,
											}))
										}
									/>
								</div>
								<VSCodeTextField
									className="w-full"
									placeholder="Working directory relative to workspace root (e.g. appl)"
									value={editingProfile.workingDirRelative || ""}
									onChange={(e: unknown) =>
										setEditingProfile((prev) => ({
											...prev,
											workingDirRelative: (e as React.ChangeEvent<HTMLInputElement>).target.value,
										}))
									}
								/>
								<VSCodeTextArea
									className="w-full min-h-[80px]"
									placeholder="Optional ordered commands (one per line). When set, overrides the single command above."
									value={editingCommands}
									onChange={(e: unknown) =>
										setEditingCommands((e as React.ChangeEvent<HTMLTextAreaElement>).target.value)
									}
								/>
								<VSCodeTextField
									className="w-full"
									placeholder="Optional single command override"
									value={editingProfile.command || ""}
									onChange={(e: unknown) =>
										setEditingProfile((prev) => ({
											...prev,
											command: (e as React.ChangeEvent<HTMLInputElement>).target.value,
										}))
									}
								/>
								<div className="flex gap-2">
									<VSCodeButton onClick={handleSaveProfile}>Save</VSCodeButton>
									<VSCodeButton
										appearance="secondary"
										onClick={() => {
											setEditingProfile(EMPTY_PROFILE);
											setEditingCommands("");
											setShowManage(false);
										}}>
										Cancel
									</VSCodeButton>
								</div>

								<div className="mt-2 space-y-1">
									{profiles.map((profile) => (
										<div
											key={profile.id}
											className="flex items-center justify-between text-xs border-b border-[var(--vscode-editorGroup-border)] py-1">
											<span>
												{profile.name} {profile.isBuiltin ? "(built-in)" : `(${profile.scope})`}
											</span>
											<div className="flex gap-1">
												<VSCodeButton
													appearance="icon"
													onClick={() => startEditProfile(profile)}>
													<i className="codicon codicon-edit" />
												</VSCodeButton>
												{!profile.isBuiltin && (
													<VSCodeButton
														appearance="icon"
														onClick={() => handleDeleteProfile(profile.id)}>
														<i className="codicon codicon-trash" />
													</VSCodeButton>
												)}
											</div>
										</div>
									))}
								</div>

								<VSCodeButton appearance="secondary" onClick={startNewProfile}>
									<i className="codicon codicon-add mr-1" />
									New Profile
								</VSCodeButton>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
});

export default BmsAutosarCompileManager;
