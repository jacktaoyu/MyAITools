import type { Boolean, EmptyRequest } from "@shared/proto/cline/common"
import { lazy, Suspense, useCallback, useEffect } from "react"
import AccountView from "./components/account/AccountView"
import ChatView from "./components/chat/ChatView"
import HistoryView from "./components/history/HistoryView"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import OnboardingView from "./components/onboarding/OnboardingView"
import SettingsView from "./components/settings/SettingsView"
const BmsAutosarWizard = lazy(() => import("./components/bms-autosar/BmsAutosarWizard"))
const BmsAutosarQualityReportView = lazy(() => import("./components/bms-autosar/BmsAutosarQualityReportView"))
const BmsAutosarKnowledgeGraphView = lazy(() => import("./components/bms-autosar/BmsAutosarKnowledgeGraphView"))
const BmsAutosarDashboard = lazy(() => import("./components/bms-autosar/BmsAutosarDashboard"))
import WorktreesView from "./components/worktrees/WorktreesView"
import { useClineAuth } from "./context/ClineAuthContext"
import { useExtensionState } from "./context/ExtensionStateContext"
import { Providers } from "./Providers"
import { UiServiceClient } from "./services/grpc-client"

const AppContent = () => {
	const {
		didHydrateState,
		showWelcome,
		shouldShowAnnouncement,
		showMcp,
		mcpTab,
		showSettings,
		settingsTargetSection,
		showHistory,
		showAccount,
		showWorktrees,
		showBmsAutosarWizard,
		showBmsAutosarQualityReport,
		showBmsAutosarKnowledgeGraph,
		showBmsAutosarDashboard,
		showAnnouncement,
		setShowAnnouncement,
		setShouldShowAnnouncement,
		closeMcpView,
		navigateToHistory,
		hideSettings,
		hideHistory,
		hideAccount,
		hideWorktrees,
		hideBmsAutosarWizard,
		hideBmsAutosarQualityReport,
		hideBmsAutosarKnowledgeGraph,
		hideBmsAutosarDashboard,
		hideAnnouncement,
	} = useExtensionState()

	const { clineUser, organizations, activeOrganization } = useClineAuth()

	const showUpdateAnnouncementModal = useCallback(() => {
		setShowAnnouncement(true)
		UiServiceClient.onDidShowAnnouncement({} as EmptyRequest)
			.then((response: Boolean) => {
				setShouldShowAnnouncement(response.value)
			})
			.catch((error) => {
				console.error("Failed to acknowledge announcement:", error)
			})
	}, [setShouldShowAnnouncement, setShowAnnouncement])

	useEffect(() => {
		if (!didHydrateState || showWelcome || !shouldShowAnnouncement || showAnnouncement) {
			return
		}
		showUpdateAnnouncementModal()
	}, [didHydrateState, showWelcome, shouldShowAnnouncement, showAnnouncement, showUpdateAnnouncementModal])

	if (!didHydrateState) {
		return null
	}

	if (showWelcome) {
		return <OnboardingView />
	}

	return (
		<div className="flex h-screen w-full flex-col">
			{showSettings && <SettingsView onDone={hideSettings} targetSection={settingsTargetSection} />}
			{showHistory && <HistoryView onDone={hideHistory} />}
			{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
			{showAccount && (
				<AccountView
					activeOrganization={activeOrganization}
					clineUser={clineUser}
					onDone={hideAccount}
					organizations={organizations}
				/>
			)}
			{showWorktrees && <WorktreesView onDone={hideWorktrees} />}
			{showBmsAutosarWizard && (
				<Suspense fallback={null}>
					<BmsAutosarWizard onDone={hideBmsAutosarWizard} />
				</Suspense>
			)}
			{showBmsAutosarQualityReport && (
				<Suspense fallback={null}>
					<BmsAutosarQualityReportView onDone={hideBmsAutosarQualityReport} />
				</Suspense>
			)}
			{showBmsAutosarKnowledgeGraph && (
				<Suspense fallback={null}>
					<BmsAutosarKnowledgeGraphView onDone={hideBmsAutosarKnowledgeGraph} />
				</Suspense>
			)}
			{showBmsAutosarDashboard && (
				<Suspense fallback={null}>
					<BmsAutosarDashboard onDone={hideBmsAutosarDashboard} />
				</Suspense>
			)}
			{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
			<ChatView
				hideAnnouncement={hideAnnouncement}
				isHidden={
					showSettings ||
					showHistory ||
					showMcp ||
					showAccount ||
					showWorktrees ||
					showBmsAutosarWizard ||
					showBmsAutosarQualityReport ||
					showBmsAutosarKnowledgeGraph ||
					showBmsAutosarDashboard
				}
				showAnnouncement={showAnnouncement}
				showHistoryView={navigateToHistory}
			/>
		</div>
	)
}

const App = () => {
	return (
		<Providers>
			<AppContent />
		</Providers>
	)
}

export default App
