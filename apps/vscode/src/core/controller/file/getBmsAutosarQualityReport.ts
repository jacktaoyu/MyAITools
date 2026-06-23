import {
	BmsAutosarQualityIssue,
	BmsAutosarQualityReport,
	BmsAutosarQualityReportFile,
	BmsAutosarQualityReportRequest,
} from "@shared/proto/cline/file";
import { getQualityReport } from "@core/task/tools/handlers/bms-autosar/BmsAutosarQualityReportStore";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

export async function getBmsAutosarQualityReport(
	_controller: Controller,
	_request: BmsAutosarQualityReportRequest,
): Promise<BmsAutosarQualityReport> {
	const cwd = await getCwd(getDesktopDir());
	const report = getQualityReport(cwd);

	if (!report) {
		return BmsAutosarQualityReport.create({
			cwd,
			files: [],
			errors: 0,
			warnings: 0,
			info: 0,
			total: 0,
			updatedAt: new Date().toISOString(),
		});
	}

	return BmsAutosarQualityReport.create({
		cwd: report.cwd,
		files: report.files.map((file) =>
			BmsAutosarQualityReportFile.create({
				filePath: file.filePath,
				issues: file.issues.map((issue) =>
					BmsAutosarQualityIssue.create({
						severity: issue.severity,
						message: issue.message,
						line: issue.line ?? 0,
						rule: issue.rule ?? "",
						category: issue.category ?? "",
					}),
				),
			}),
		),
		errors: report.summary.errors,
		warnings: report.summary.warnings,
		info: report.summary.info,
		total: report.summary.total,
		updatedAt: report.updatedAt,
	});
}
