import { Empty } from "@shared/proto/cline/common";
import { OpenArxmlSourceRequest } from "@shared/proto/cline/file";
import { HostProvider } from "@/hosts/host-provider";
import { ShowTextDocumentRequest } from "@/shared/proto/host/window";
import type { Controller } from "..";

/**
 * Opens an ARXML source file in the editor and jumps to the specified line.
 */
export async function openArxmlSource(
	_controller: Controller,
	request: OpenArxmlSourceRequest,
): Promise<Empty> {
	const filePath = request.filePath;
	const line = Math.max(0, request.line - 1);
	if (!filePath) {
		return Empty.create();
	}

	await HostProvider.window.showTextDocument(
		ShowTextDocumentRequest.create({
			path: filePath,
			options: {
				preview: false,
				startLine: line,
				startCharacter: 0,
				endLine: line,
				endCharacter: 0,
			},
		}),
	);
	return Empty.create();
}
