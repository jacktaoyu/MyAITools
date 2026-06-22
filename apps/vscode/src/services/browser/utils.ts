import { fileExistsAtPath } from "@utils/fs"
import * as fs from "fs/promises"
import * as path from "path"
import type { launch as LaunchType } from "puppeteer-core"
import { HostProvider } from "@/hosts/host-provider"

interface PCRStats {
	puppeteer: { launch: typeof LaunchType }
	executablePath: string
}

export async function ensureChromiumExists(): Promise<PCRStats> {
	const puppeteerDir = path.join(HostProvider.get().globalStorageFsPath, "puppeteer")
	const dirExists = await fileExistsAtPath(puppeteerDir)
	if (!dirExists) {
		await fs.mkdir(puppeteerDir, { recursive: true })
	}
	// Lazy-load puppeteer-chromium-resolver (and its puppeteer-core dependency)
	// so the browser automation stack is only pulled in when actually used.
	// @ts-ignore — CJS default export from ESM dynamic import
	const { default: PCR } = await import("puppeteer-chromium-resolver")
	// if chromium doesn't exist, this will download it to path.join(puppeteerDir, ".chromium-browser-snapshots")
	// if it does exist it will return the path to existing chromium
	const stats: PCRStats = await PCR({
		downloadPath: puppeteerDir,
	})
	return stats
}
