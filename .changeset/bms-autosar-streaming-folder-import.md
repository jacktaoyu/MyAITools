---
"claude-dev": minor
---

feat: BMS AUTOSAR streaming generation, progress events, folder knowledge import, MISRA checks, ARXML knowledge graph, auto-fix closed loop, and top-level quality panels

Expanded the BMS AUTOSAR generator with real-time streaming, richer observability, bulk knowledge import, quality assurance, LLM-powered auto-fix, and dedicated webview panels:

- Added a dedicated `BmsAutosarService` gRPC service (`proto/cline/bms_autosar.proto`) with:
  - `generateBmsAutosar`: a server-streaming RPC that starts a generation task and emits structured progress events to the webview.
  - `cancelBmsAutosarGeneration`: cancels the currently running generation task.
- Introduced `BmsAutosarProgressBus` to publish/subscribe per-task progress events. `BmsAutosarGenerateHandler` now emits events for `preparing`, `retrieving_knowledge`, `generating`, `complete`, and `error` stages.
- Wired the webview wizard to the new streaming RPC so users see a live progress bar, stage message, and a cancel button during generation.
- Added telemetry events and metrics for BMS AUTOSAR generation: `bms_autosar.generate.started`, `bms_autosar.generate.completed`, `bms_autosar.generate.failed`, and `cline.bms_autosar.generate.duration_ms`.

Knowledge base improvements:

- Centralized persistence in `saveBmsKnowledgeContent` (`src/core/controller/file/bmsKnowledgeStorage.ts`), now supporting both workspace and global scopes and recording `sourceFiles` metadata.
- Refactored `BmsAutosarKnowledgeHandler.add` to use the shared persistence layer, removing duplicated chunk/replace/tag/save logic.
- Added folder import for the BMS AUTOSAR knowledge base:
  - `bms_autosar_knowledge` `add` action now accepts a `folder_path` parameter (mutually exclusive with `file_path`).
  - `extractTextFromFolder` recursively extracts text from all supported files under a folder with bounded concurrency, annotating each file with its relative path and reporting total/successful/failed file counts.
  - New `addBmsKnowledgeFolder` RPC and a folder icon button in the `BmsKnowledgeManager` toolbar.
- File and folder import RPCs now carry a `scope` field so imports respect the workspace/global toggle in the webview.
- Unified file/folder path validation in the knowledge handler.
- Added import progress toasts in the webview and detailed result messages from the backend.
- Sped up local Ollama embedding generation by running embedding requests with bounded concurrency.

Second batch of knowledge base hardening and UX enhancements:

- `knowledge.json` is now written atomically (temp file + rename) to prevent corruption on crash.
- Stop words and BM25 hyperparameters are shared between the worker and the main thread via `BmsAutosarRetrievalConstants`.
- Every knowledge chunk now carries `sourceFiles` metadata.
- `extractTextFromFolder` returns failed files separately instead of mixing failures into the extracted text.
- Partial embedding failures now degrade individual entries to BM25 rather than forcing a full hybrid fallback.
- Path validation resolves symlinks for both the selected path and the workspace root, preventing symlink escape and fixing checks on macOS `/var` symlinks.
- `BmsKnowledgeManager` UX improvements:
  - Inline editing for knowledge entries (content + tags).
  - Multi-select checkboxes with bulk delete.
  - Export the current scope knowledge base as JSON.
  - Import a JSON knowledge base via file picker.
- Added `updateBmsKnowledge`, `exportBmsKnowledge`, and `importBmsKnowledgeJson` controller handlers.

Code quality and retrieval enhancements:

- Added a lightweight MISRA C:2012 static checker (`BmsAutosarMisraChecker`) covering common generated-code violations such as forbidden stdlib/stdio usage, octal constants, uninitialized variables, multiple return points, and missing function declarations. The checker runs automatically as part of `runBmsAutosarQualityGates` after `.c`/`.h` files are written.
- Introduced an ARXML knowledge graph builder (`BmsAutosarKnowledgeGraph`) that extracts SWCs, ports, interfaces, data types, runnables, and their relationships from ARXML files. The semantic retrieval pipeline now boosts knowledge entries that are topologically close to query-relevant AUTOSAR elements.

MISRA quality report, ARXML knowledge graph visualization, and auto-fix closed loop:

- Added `BmsAutosarQualityReportStore` to keep the latest quality/MISRA report in memory for webview queries and auto-fix.
- Extended `FileService` (`proto/cline/file.proto`) with:
  - `getBmsAutosarQualityReport`: returns the latest aggregated quality/MISRA report.
  - `getBmsAutosarKnowledgeGraph`: builds and returns an ARXML knowledge graph.
  - `autoFixBmsAutosarFile`: single-file LLM auto-fix with preview (`apply=false`) and write-back (`apply=true`) modes.
  - `autoFixBmsAutosarFiles`: batch multi-file LLM auto-fix with per-file diffs and counts.
- Refactored `BmsAutosarAutoFixer` to return the fixed content instead of writing directly to disk.
- Added `autoFixBmsAutosarFile` and `autoFixBmsAutosarFiles` controller handlers that generate unified diffs and apply fixes on user confirmation.
- Added new VS Code commands and `UiService` events to open dedicated top-level webview panels:
  - `cline.bmsAutosarQualityReport`
  - `cline.bmsAutosarKnowledgeGraph`
- Added full-screen webview components under `webview-ui/src/components/bms-autosar/`:
  - `BmsAutosarQualityReportView`: lists issues by severity, opens files, and supports single-file + batch auto-fix with diff preview.
  - `BmsAutosarKnowledgeGraphView`: interactive force-directed graph of SWC/Port/Interface relationships, with scope toggle and user-selectable ARXML files.
- Added toolbar buttons in `ChatTextArea.tsx` for quick access to the quality report and knowledge graph panels.
- Allowed `.arxml` files in the shared file picker so users can select ARXML files for the knowledge graph.
- Added unit tests for `BmsAutosarAutoFixer` and `autoFixBmsAutosarFiles`.

User-defined BMS AUTOSAR generation templates:

- Added `BmsAutosarTemplateStorage` (`src/core/task/tools/handlers/bms-autosar/BmsAutosarTemplateStorage.ts`) to read and write user templates from `<cwd>/.cline/bms-autosar/templates.json` (workspace) and `~/.cline/bms-autosar/templates.json` (global).
- `loadMergedTemplates` merges built-in, global, and workspace templates with workspace taking highest precedence, so users can override built-in generation patterns without code changes.
- Extended `FileService` with `listBmsAutosarTemplates`, `saveBmsAutosarTemplate`, and `deleteBmsAutosarTemplate` RPCs.
- Updated `BmsAutosarWizard` to include user templates in the component type dropdown and added a `BmsAutosarTemplateManager` dialog for listing, creating, and deleting custom templates.
- Added unit tests for `BmsAutosarTemplateStorage` covering save/load/delete, scope isolation, and merge precedence.

RAG retrieval enhancements for the BMS AUTOSAR knowledge base:

- Added metadata pre-filtering by `tags` and `sourceFiles` in `BmsAutosarSemanticRetrieval`, and wired tag selection in `BmsKnowledgeManager` into semantic search.
- Introduced `BmsAutosarQueryExpander` with a canonical AUTOSAR/BMS acronym/synonym map (CSC, AFE, SOC, BMS, SWC, RTE, BSW, etc.) to bridge vocabulary gaps in embedding and BM25 retrieval.
- Added an optional LLM-as-reranker second stage (`BmsAutosarReranker`) that scores top hybrid+graph candidates on a 0-10 scale and blends the result back into the final ranking, with graceful fallback when no LLM is available.
- Exposed retrieval tuning controls in the webview (Top K, hybrid weight slider, score threshold, LLM reranker toggle) and extended `SearchBmsKnowledgeRequest` / `BmsKnowledgeSearchResult` protobuf messages accordingly.
- `BmsAutosarGenerateHandler` now passes the component type as a tag filter when retrieving knowledge, focusing generation context on the target component type.
- Added unit tests for `BmsAutosarQueryExpander`, `BmsAutosarReranker`, and semantic retrieval metadata filters.

Updated `BMS_AUTOSAR_CHANGES.md` to document the new iterations and optimizations.
