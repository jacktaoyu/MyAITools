/**
 * Lightweight suppression comment parser for BMS AUTOSAR quality gates.
 *
 * Supported C/C++ comment forms:
 *   // bms-qg-disable R21.3
 *   // bms-qg-disable R21.3, R17.7
 *   // bms-qg-disable all
 *   // bms-qg-enable R21.3
 *   // bms-qg-enable all
 *   // bms-qg-disable-line R21.3
 *   // bms-qg-disable-next-line R21.3
 *
 * `disable` / `enable` are toggles that persist until a matching `enable`.
 * `disable-line` suppresses the rule on the same line as the comment.
 * `disable-next-line` suppresses the rule on the following line.
 *
 * Rule ids are matched case-insensitively. The special rule id `all` suppresses
 * every rule on the affected line(s).
 */

export interface QualitySuppressionState {
	isSuppressed(rule: string, line?: number): boolean
}

const SUPPRESSION_COMMENT_REGEX =
	/\/\/\s*bms-qg-(disable|enable|disable-line|disable-next-line)\s+(.+?)\s*$/iu

export function parseQualitySuppressions(content: string): QualitySuppressionState {
	const lines = content.split("\n")
	// Per-line suppressed rule ids (case-normalized). Index 0 = line 1.
	const lineSuppressions: Set<string>[] = lines.map(() => new Set<string>())
	// Rules currently disabled by block suppressions; applied to current and subsequent lines.
	const active = new Set<string>()

	for (let i = 0; i < lines.length; i++) {
		const match = SUPPRESSION_COMMENT_REGEX.exec(lines[i])
		if (match) {
			const command = match[1].toLowerCase()
			const rules = match[2]
				.split(/[,\s]+/u)
				.map((r) => r.trim().toUpperCase())
				.filter(Boolean)

			switch (command) {
				case "disable-line": {
					for (const rule of rules) {
						lineSuppressions[i].add(rule)
					}
					break
				}
				case "disable-next-line": {
					if (i + 1 < lines.length) {
						for (const rule of rules) {
							lineSuppressions[i + 1].add(rule)
						}
					}
					break
				}
				case "disable": {
					for (const rule of rules) {
						active.add(rule)
					}
					break
				}
				case "enable": {
					for (const rule of rules) {
						active.delete(rule)
					}
					break
				}
			}
		}

		// Block suppressions apply to the current line as well. This matches the
		// common expectation that `// bms-qg-disable R21.3` takes effect immediately.
		for (const rule of active) {
			lineSuppressions[i].add(rule)
		}
	}

	return {
		isSuppressed(rule: string, line?: number): boolean {
			if (line === undefined || line < 1 || line > lines.length) {
				return false
			}
			const normalized = rule.toUpperCase()
			const suppressed = lineSuppressions[line - 1]
			return suppressed.has(normalized) || suppressed.has("ALL")
		},
	}
}
