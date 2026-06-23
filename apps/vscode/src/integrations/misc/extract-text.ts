import ExcelJS from "exceljs"
import fs from "fs/promises"
import * as iconv from "iconv-lite"
import { isBinaryFile } from "isbinaryfile"
import * as chardet from "jschardet"
import mammoth from "mammoth"
import * as path from "path"
import PDFParser from "pdf2json"
import { truncateContent } from "@/shared/content-limits"
import { Logger } from "@/shared/services/Logger"
import { createConcurrencyLimit } from "@utils/concurrency"
import type { BmsAutosarKnowledgeLocation } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes"
import { dbcToText, parseDbc } from "@core/task/tools/handlers/bms-autosar/BmsAutosarDbcParser"
import { sanitizeNotebookForLLM } from "./notebook-utils"

export async function detectEncoding(fileBuffer: Buffer, fileExtension?: string): Promise<string> {
	const detected = chardet.detect(fileBuffer)
	if (typeof detected === "string") {
		return detected
	} else if (detected && (detected as any).encoding) {
		return (detected as any).encoding
	} else {
		if (fileExtension) {
			const isBinary = await isBinaryFile(fileBuffer).catch(() => false)
			if (isBinary) {
				throw new Error(`Cannot read text for file type: ${fileExtension}`)
			}
		}
		return "utf8"
	}
}

export interface ExtractTextResult {
	text: string
	locations: BmsAutosarKnowledgeLocation[]
}

export async function extractTextFromFile(filePath: string): Promise<string> {
	try {
		await fs.access(filePath)
	} catch (_error) {
		throw new Error(`File not found: ${filePath}`)
	}

	return callTextExtractionFunctions(filePath)
}

export async function extractTextFromFileWithLocations(filePath: string): Promise<ExtractTextResult> {
	try {
		await fs.access(filePath)
	} catch (_error) {
		throw new Error(`File not found: ${filePath}`)
	}

	const fileExtension = path.extname(filePath).toLowerCase()

	if (fileExtension === ".pdf") {
		const result = await extractTextFromPDFWithPages(filePath)
		return { text: truncateContent(result.text), locations: result.locations }
	}

	if (fileExtension === ".docx") {
		const result = await extractTextFromDOCXWithChapters(filePath)
		return { text: truncateContent(result.text), locations: result.locations }
	}

	const text = await callTextExtractionFunctions(filePath)
	return { text, locations: [] }
}

/**
 * Expects the fs.access call to have already been performed prior to calling.
 * Content is automatically truncated if it exceeds 400KB to prevent context overflow.
 */
export async function callTextExtractionFunctions(filePath: string): Promise<string> {
	const fileExtension = path.extname(filePath).toLowerCase()

	let content: string

	switch (fileExtension) {
		case ".pdf":
			content = await extractTextFromPDF(filePath)
			break
		case ".docx":
			content = await extractTextFromDOCX(filePath)
			break
		case ".ipynb":
			content = await extractTextFromIPYNB(filePath)
			break
		case ".xlsx":
			content = await extractTextFromExcel(filePath)
			break
		case ".dbc":
			content = await extractTextFromDBC(filePath)
			break
		default:
			// Check file size with stat() first - faster than reading entire file for size check
			const fileStat = await fs.stat(filePath)
			if (fileStat.size > 20 * 1000 * 1024) {
				// 20MB limit (20 * 1000 * 1024 bytes, decimal MB)
				throw new Error(`File is too large to read into context.`)
			}
			const fileBuffer = await fs.readFile(filePath)
			const encoding = await detectEncoding(fileBuffer, fileExtension)
			content = iconv.decode(fileBuffer, encoding)
	}

	// Truncate content if it exceeds 400KB to prevent context overflow
	return truncateContent(content)
}

interface PdfParserPage {
	Texts?: Array<{ R?: Array<{ T?: string }> }>
}

interface PdfParserData {
	Pages?: PdfParserPage[]
}

function extractTextFromPdfPage(page: PdfParserPage): string {
	const texts = page.Texts || []
	return texts
		.map((text) => (text.R || []).map((run) => decodeURIComponent(run.T || "")).join(""))
		.join(" ")
}

async function extractTextFromPDFWithPages(
	filePath: string,
): Promise<{ text: string; locations: BmsAutosarKnowledgeLocation[] }> {
	const dataBuffer = await fs.readFile(filePath)

	return new Promise((resolve, reject) => {
		const parser = new PDFParser(null, true)

		parser.on("pdfParser_dataReady", () => {
			try {
				const data = (parser.data ?? {}) as PdfParserData
				const pages = data.Pages || []
				const locations: BmsAutosarKnowledgeLocation[] = []
				const parts: string[] = []
				pages.forEach((page, index) => {
					const pageNum = index + 1
					const pageText = extractTextFromPdfPage(page).trim()
					if (pageText) {
						parts.push(`--- Page ${pageNum} ---`)
						parts.push(pageText)
						locations.push({ page: pageNum })
					}
				})
				resolve({ text: parts.join("\n"), locations })
			} catch (err) {
				reject(err)
			} finally {
				parser.destroy()
			}
		})

		parser.on("pdfParser_dataError", (err) => {
			parser.destroy()
			reject(err instanceof Error ? err : new Error(String(err)))
		})

		parser.parseBuffer(dataBuffer)
	})
}

async function extractTextFromPDF(filePath: string): Promise<string> {
	const { text } = await extractTextFromPDFWithPages(filePath)
	return text
}

function stripHtmlTags(html: string): string {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

async function extractTextFromDOCXWithChapters(
	filePath: string,
): Promise<{ text: string; locations: BmsAutosarKnowledgeLocation[] }> {
	const result = await mammoth.convertToHtml(
		{ path: filePath },
		{
			styleMap: ["p.Heading1 => h1", "p.Heading2 => h2", "p.Heading3 => h3"],
		},
	)
	let html = result.value
	// Insert chapter markers around headings before stripping tags.
	html = html
		.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_match, title) => `\n--- Chapter: ${stripHtmlTags(title)} ---\n${stripHtmlTags(title)}\n`)
		.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_match, title) => `\n--- Section: ${stripHtmlTags(title)} ---\n${stripHtmlTags(title)}\n`)
	const text = stripHtmlTags(html)
	const locations: BmsAutosarKnowledgeLocation[] = []
	const chapterRegex = /--- (?:Chapter|Section):\s*(.+?) ---/g
	let match: RegExpExecArray | null
	while ((match = chapterRegex.exec(text)) !== null) {
		locations.push({ chapter: match[1].trim() })
	}
	return { text, locations }
}

async function extractTextFromDOCX(filePath: string): Promise<string> {
	const { text } = await extractTextFromDOCXWithChapters(filePath)
	return text
}

async function extractTextFromDBC(filePath: string): Promise<string> {
	const content = await fs.readFile(filePath, "utf-8")
	const dbc = parseDbc(content)
	return dbcToText(dbc)
}

async function extractTextFromIPYNB(filePath: string): Promise<string> {
	const fileBuffer = await fs.readFile(filePath)
	const encoding = await detectEncoding(fileBuffer)
	const data = iconv.decode(fileBuffer, encoding)

	// Strip all outputs to reduce context size - outputs aren't needed for understanding
	// notebook structure. For Jupyter commands, the specific cell's outputs are included
	// separately via sanitizeCellForLLM which preserves text outputs.
	return sanitizeNotebookForLLM(data, true)
}

/**
 * Format the data inside Excel cells
 */
function formatCellValue(cell: ExcelJS.Cell): string {
	const value = cell.value
	if (value === null || value === undefined) {
		return ""
	}

	// Handle error values (#DIV/0!, #N/A, etc.)
	if (typeof value === "object" && "error" in value) {
		return `[Error: ${value.error}]`
	}

	// Handle dates - ExcelJS can parse them as Date objects
	if (value instanceof Date) {
		return value.toISOString().split("T")[0] // Just the date part
	}

	// Handle rich text
	if (typeof value === "object" && "richText" in value) {
		return value.richText.map((rt) => rt.text).join("")
	}

	// Handle hyperlinks
	if (typeof value === "object" && "text" in value && "hyperlink" in value) {
		return `${value.text} (${value.hyperlink})`
	}

	// Handle formulas - get the calculated result
	if (typeof value === "object" && "formula" in value) {
		if ("result" in value && value.result !== undefined && value.result !== null) {
			return value.result.toString()
		} else {
			return `[Formula: ${value.formula}]`
		}
	}

	return value.toString()
}

/**
 * Extract and format text from xlsx files
 */
async function extractTextFromExcel(filePath: string): Promise<string> {
	const workbook = new ExcelJS.Workbook()
	let excelText = ""

	try {
		await workbook.xlsx.readFile(filePath)

		workbook.eachSheet((worksheet, _sheetId) => {
			// Skip hidden sheets
			if (worksheet.state === "hidden" || worksheet.state === "veryHidden") {
				return
			}

			excelText += `--- Sheet: ${worksheet.name} ---\n`

			worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
				// Optional: limit processing for very large sheets
				if (rowNumber > 50000) {
					excelText += `[... truncated at row ${rowNumber} ...]\n`
					return false
				}

				const rowTexts: string[] = []
				let hasContent = false

				row.eachCell({ includeEmpty: true }, (cell, _colNumber) => {
					const cellText = formatCellValue(cell)
					if (cellText.trim()) {
						hasContent = true
					}
					rowTexts.push(cellText)
				})

				// Only add rows with actual content
				if (hasContent) {
					excelText += rowTexts.join("\t") + "\n"
				}

				return true
			})

			excelText += "\n" // Blank line between sheets
		})

		return excelText.trim()
	} catch (error: any) {
		Logger.error(`Error extracting text from Excel ${filePath}:`, error)
		throw new Error(`Failed to extract text from Excel: ${error.message}`)
	}
}

/**
 * Supported text-extractable file extensions for knowledge import.
 *
 * The default extraction path treats unknown extensions as plain text using
 * encoding detection, so this list primarily controls which files are picked
 * up during recursive folder imports.
 */
export const KNOWLEDGE_IMPORT_EXTENSIONS = new Set([
	// Documents
	".xlsx",
	".xls",
	".docx",
	".pdf",
	".csv",
	".txt",
	".md",
	// C/C++ source and headers (BMS / AUTOSAR generated and hand-written code)
	".c",
	".h",
	".cpp",
	".hpp",
	".cc",
	".hh",
	".cxx",
	".hxx",
	// Web / TypeScript / JavaScript
	".js",
	".ts",
	".jsx",
	".tsx",
	".html",
	".htm",
	".css",
	".scss",
	".less",
	// Python / Shell
	".py",
	".sh",
	".bash",
	".zsh",
	// Data / config
	".json",
	".yaml",
	".yml",
	".xml",
	".toml",
	".ini",
	".cfg",
	".conf",
	// AUTOSAR / CAN / notebooks / logs
	".arxml",
	".dbc",
	".ipynb",
	".log",
])

export interface ExtractTextFromFolderFailure {
	path: string
	error: string
}

export interface ExtractTextFromFolderResult {
	text: string
	files: string[]
	totalFiles: number
	failedFiles: ExtractTextFromFolderFailure[]
}

/**
 * Recursively extracts text from all supported files under a folder and returns
 * a single string with each file's content annotated by its relative path, plus
 * the list of relative paths that were successfully read.
 * Files that cannot be read are logged and skipped rather than failing the
 * entire import.
 */
export async function extractTextFromFolder(folderPath: string): Promise<ExtractTextFromFolderResult> {
	const stats = await fs.stat(folderPath).catch(() => null)
	if (!stats || !stats.isDirectory()) {
		throw new Error(`Path is not a directory: ${folderPath}`)
	}

	const files = await collectKnowledgeFiles(folderPath)
	if (files.length === 0) {
		throw new Error(`No supported files found in ${folderPath}`)
	}

	const limit = createConcurrencyLimit(4)
	const sortedFiles = files.sort()
	const parts = await Promise.all(
		sortedFiles.map((filePath) =>
			limit(async () => {
				const relativePath = path.relative(folderPath, filePath)
				try {
					const content = await extractTextFromFile(filePath)
					return {
						text: `--- File: ${relativePath} ---\n${content}`,
						relativePath,
						success: true as const,
					}
				} catch (error) {
					Logger.error(`Error extracting text from ${filePath}:`, error)
					const errorMessage = error instanceof Error ? error.message : String(error)
					return {
						text: "",
						relativePath,
						success: false as const,
						error: errorMessage,
					}
				}
			}),
		),
	)

	const successfulParts = parts.filter((p) => p.success)
	const failedParts = parts.filter((p) => !p.success)
	return {
		text: successfulParts.map((p) => p.text).join("\n\n"),
		files: successfulParts.map((p) => p.relativePath),
		totalFiles: sortedFiles.length,
		failedFiles: failedParts.map((p) => ({ path: p.relativePath, error: p.error })),
	}
}

/**
 * Recursively collects all supported knowledge-import files under a folder.
 */
async function collectKnowledgeFiles(folderPath: string): Promise<string[]> {
	const files: string[] = []
	const entries = await fs.readdir(folderPath, { withFileTypes: true })
	for (const entry of entries) {
		const fullPath = path.join(folderPath, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await collectKnowledgeFiles(fullPath)))
		} else if (entry.isFile() && KNOWLEDGE_IMPORT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			files.push(fullPath)
		}
	}
	return files
}

/**
 * Helper function used to load file(s) and format them into a string
 */
export async function processFilesIntoText(files: string[]): Promise<string> {
	const fileContentsPromises = files.map(async (filePath) => {
		try {
			// Check if file exists and is binary
			//const isBinary = await isBinaryFile(filePath).catch(() => false)
			//if (isBinary) {
			//	return `<file_content path="${filePath.toPosix()}">\n(Binary file, unable to display content)\n</file_content>`
			//}
			const content = await extractTextFromFile(filePath)
			return `<file_content path="${filePath.toPosix()}">\n${content}\n</file_content>`
		} catch (error) {
			Logger.error(`Error processing file ${filePath}:`, error)
			return `<file_content path="${filePath.toPosix()}">\nError fetching content: ${error.message}\n</file_content>`
		}
	})

	const fileContents = await Promise.all(fileContentsPromises)

	const validFileContents = fileContents.filter((content) => content !== null).join("\n\n")

	if (validFileContents) {
		return `Files attached by the user:\n\n${validFileContents}`
	}

	// returns empty string if no files were loaded properly
	return ""
}
