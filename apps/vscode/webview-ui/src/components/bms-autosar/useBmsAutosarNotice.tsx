import { useCallback, useMemo, useState } from "react"

export type NoticeType = "success" | "error"

export interface BmsAutosarNotice {
	message: string
	type: NoticeType
}

export function useBmsAutosarNotice(timeoutMs = 3000) {
	const [notice, setNotice] = useState<BmsAutosarNotice | null>(null)

	const showNotice = useCallback(
		(message: string, type: NoticeType) => {
			setNotice({ message, type })
			window.setTimeout(() => setNotice(null), timeoutMs)
		},
		[timeoutMs],
	)

	const noticeElement = useMemo(() => {
		if (!notice) {
			return null
		}
		return (
			<div
				className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-md text-sm border ${
					notice.type === "error"
						? "bg-[var(--vscode-inputValidation-errorBackground)] border-[var(--vscode-inputValidation-errorBorder)] text-[var(--vscode-errorForeground)]"
						: "bg-[var(--vscode-inputValidation-infoBackground)] border-[var(--vscode-inputValidation-infoBorder)] text-[var(--vscode-foreground)]"
				}`}>
				{notice.message}
			</div>
		)
	}, [notice])

	return { notice, showNotice, noticeElement }
}
