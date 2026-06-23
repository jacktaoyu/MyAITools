# BMS AUTOSAR 扩展变更说明

本文档记录 Cline VS Code 插件中 BMS（电池管理系统）AUTOSAR 代码生成能力的所有变更。后续相关改动请继续追加到本文档。

---

## 2026-06-23（第三十次迭代 / ASIL 等级支持深化与 ARXML 知识图谱优化）

### 新增功能

- **ASIL 感知的 MISRA 规则**
  - `BmsAutosarMisraChecker.ts`：
    - `MisraRule` 新增 `appliesTo?: AsilLevel[] | "all"`，允许规则按 ASIL 级别生效。
    - `MisraCheckOptions` 新增 `asilLevel`，`runMisraChecks` 按 ASIL 过滤规则。
    - ASIL C/D 下 `advisory` 规则自动提升为 `error`。
    - 新增 `SAFETY-EXIT` 规则，强制高 ASIL 函数单一出口。
    - 新增 `R8.9` 文件作用域对象启发式检查。

- **ASIL 安全验证报告**
  - 新增 `BmsAutosarAsilSafetyChecker.ts`：
    - `inferAsilLevel` 从文件头 `\ASIL level:` 注释解析 ASIL。
    - `runAsilSafetyChecks` 针对高 ASIL 检查 WdgM、E2E、DET、范围检查、单一出口等安全模式。
  - `BmsAutosarQualityGates.ts`：
    - `QualityGateOptions` 新增 `asilLevel`。
    - `.c/.h` 文件同时运行 MISRA 检查与 ASIL 安全检查。
    - 所有 issue 增加 `category` 字段（`MISRA` / `ASIL` / `STRUCTURAL` / `COMPILE`）。
  - `WriteToFileToolHandler.ts`：保存文件前解析 ASIL 并传入质量门。

- **模板 ASIL 条件块**
  - `BmsAutosarGenerateHandler.ts` 上下文新增 `asil_level`、`isHighAsil`、`asil_A_or_higher`、`asil_B_or_higher`、`asil_C_or_higher`。
  - `templates.json` 中 `swc` 与 `bms_csc` 的 C 模板扩展 ASIL-B+ / ASIL-C/D 安全占位注释。

- **质量问题分类与 Webview 过滤**
  - `proto/cline/file.proto`：`BmsAutosarQualityIssue` 新增 `category = 5`。
  - `BmsAutosarQualityReportStore.ts`、`getBmsAutosarQualityReport.ts` 透传 `category`。
  - `BmsAutosarQualityReportView.tsx` 与 `BmsAutosarQualityPanel.tsx` 新增 Category 过滤按钮（All / MISRA / ASIL / STRUCTURAL / COMPILE）。

- **ARXML 知识图谱优化**
  - `apps/vscode/package.json` 显式添加 `fast-xml-parser` 依赖。
  - `BmsAutosarKnowledgeGraph.ts`：
    - 新增基于 `fast-xml-parser` 的 `buildArxmlKnowledgeGraphFromXml`。
    - 保留原 regex 解析作为 fallback，默认优先使用 XML 解析器。
    - 解析结果与 regex 路径在现有测试 ARXML 上等价。
  - `BmsAutosarKnowledgeCache.ts`：
    - 新增 `loadArxmlGraphCached` / `saveArxmlGraphCached`。
    - 按文件 `mtimeMs` 维护缓存，缓存目录 `~/.cline/bms-autosar/cache/arxml-graph/`。
  - `getBmsAutosarKnowledgeGraph.ts`：
    - 改为逐文件解析/缓存后合并 graph，避免重复解析大文件。
  - Webview 图谱导出：
    - 新增公共组件 `BmsAutosarKnowledgeGraphRenderer.tsx`，包含 `simpleForceLayout`、SVG 渲染、导出按钮。
    - 支持 **Export SVG**（序列化当前 SVG）与 **Export Mermaid**（生成 `graph LR` 文本）。
    - `BmsAutosarKnowledgeGraphView.tsx`（全屏/对话框两个入口）复用该组件，消除重复代码。

### 单元测试

- 更新 `BmsAutosarMisraChecker.test.ts`：覆盖 ASIL 规则过滤、advisory 提升为 error、`SAFETY-EXIT`。
- 新增 `BmsAutosarAsilSafetyChecker.test.ts`：覆盖 ASIL 推断、WdgM/E2E/DET/范围检查/单一出口。
- 更新 `BmsAutosarKnowledgeCache.test.ts`：覆盖 ARXML graph 缓存命中与 mtime 失效。
- 全量单元测试通过：`npm run test:unit` 共 **1685** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- `npm run package:vsix` 成功生成 `dist/claude-dev-3.89.2-bms-autosar.vsix`。

---

## 2026-06-22（第二十九次迭代 / 编译构建集成优化与统一入口菜单）

### 新增功能

- **编译配置能力增强**
  - `proto/cline/bms_autosar.proto`：
    - `BmsAutosarCompileProfile` 新增 `repeated string commands = 9`，支持多步命令序列。
    - `CompileBmsAutosarResponse` 新增 `terminal_id`、`initial_output`。
    - 新增 RPC `getBmsAutosarCompileStatus`：供 Webview 轮询终端编译状态。
  - `BmsAutosarCompileProfileStorage.ts`：
    - 新增 `builtinOverrides` 字段，允许用户覆盖内置 profile 的 name/workflow/command/commands/workingDirRelative/jobs。
    - `buildBmsCompileCommand` 改为返回 `{ cwd, command }[]` 步骤数组，支持单条或多条命令。
    - 合并优先级：workspace override > global override > built-in。
  - `executeCommandInTerminal.ts`：
    - 复用 `VscodeTerminalManager`，统一创建/复用名为 **BMS Build** 的终端。
    - 返回 `terminal_id` 与初始输出，供后续状态查询。
  - 新增 `CompileStatusTracker.ts`：
    - 按 `terminal_id` 记录终端输出、完成状态、退出码与错误信息。
    - 支持 Webview 轮询 `getBmsAutosarCompileStatus`。
  - 新增 controller `getBmsAutosarCompileStatus.ts`。

- **Webview 编译管理器升级**
  - `BmsAutosarCompileManager.tsx`：
    - 选中内置 profile 时可启用 **Edit defaults**，保存为 override。
    - 命令编辑框支持多行输入，每行对应一个执行步骤。
    - 点击 **Run Compile** 后启动轮询，实时显示终端输出与完成状态。

- **统一 BMS AUTOSAR 入口菜单**
  - `ChatTextArea.tsx` 工具栏将 Generator、Knowledge、Compile、Quality Report、Knowledge Graph 五个入口合并为单个 **BMS AUTOSAR** 下拉菜单。
  - 选择 **Knowledge / Compile** 时通过 `forwardRef` 打开对应对话框；其余项直接跳转对应视图。
  - `BmsKnowledgeManager.tsx` 与 `BmsAutosarCompileManager.tsx` 改为仅渲染对话框内容，内部触发按钮移除。

### 单元测试

- 更新 `BmsAutosarCompileProfileStorage.test.ts`：覆盖多步命令、`builtinOverrides`、命令步骤拆分。
- 更新 `compileBmsAutosar.test.ts`：覆盖 `commands` 字段与 `terminal_id` 返回。
- 全量单元测试通过：`npm run test:unit` 共 **1674** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- `npm run package:vsix` 成功生成 `dist/claude-dev-3.89.2-bms-autosar.vsix`。

---

## 2026-06-22（第二十八次迭代 / 编译构建集成）

### 新增功能

- **BMS AUTOSAR 编译/构建集成**
  - 扩展 `proto/cline/bms_autosar.proto`：
    - 新增 `BmsAutosarCompileProfile` 描述编译配置（id、name、workflow、command、working_dir_relative、jobs、is_builtin、scope）。
    - 新增 RPC：
      - `compileBmsAutosar`：在 VS Code 集成终端执行选中配置。
      - `listBmsAutosarCompileProfiles`：列出内置 + workspace/global 自定义配置。
      - `saveBmsAutosarCompileProfile` / `deleteBmsAutosarCompileProfile`：管理自定义配置。
  - 重新生成 gRPC 桩代码（`npm run protos`）。
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage.ts`：
    - 内置两条工作流：
      - `appl`：在 `<workspace>/appl` 目录执行 `m -j32`。
      - `launch`：在 workspace 根目录先执行 `launch.bat`，再执行 `make -j32`。
    - workspace 配置保存在 `<cwd>/.cline/bms-autosar/compile-profiles.json`，global 配置保存在 `~/.cline/bms-autosar/compile-profiles.json`。
    - 支持保存/删除自定义配置、记录上次选中配置、合并 built-in / global / workspace 配置（workspace 优先级最高）。
  - 新增 controller handlers：
    - `src/core/controller/bmsAutosar/compileBmsAutosar.ts`：构造命令并调用 `HostProvider.workspace.executeCommandInTerminal` 打开终端执行。
    - `src/core/controller/bmsAutosar/listBmsAutosarCompileProfiles.ts`
    - `src/core/controller/bmsAutosar/saveBmsAutosarCompileProfile.ts`
    - `src/core/controller/bmsAutosar/deleteBmsAutosarCompileProfile.ts`
  - 新增 Webview UI：
    - `webview-ui/src/components/chat/BmsAutosarCompileManager.tsx`：对话框形式选择 Scope、Profile，点击 **Run Compile** 启动构建；支持新增/编辑/删除自定义配置。
    - `ChatTextArea.tsx` 工具栏新增扳手图标按钮，打开 BMS AUTOSAR 编译管理器。

### 单元测试

- 新增 `BmsAutosarCompileProfileStorage.test.ts`：覆盖内置配置加载、workspace/global 保存与隔离、删除、lastSelected 持久化、命令构建、目录计算。
- 新增 `compileBmsAutosar.test.ts`：覆盖 appl / launch 内置配置执行、终端失败回退、未找到配置抛错、选中配置持久化。
- 全量单元测试通过：`npm run test:unit` 共 **1671** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第二十七次迭代 / ASIL 等级支持）

### 新增功能

- **ISO 26262 ASIL 等级全链路支持**
  - `proto/cline/bms_autosar.proto`：`GenerateBmsAutosarRequest` 新增 `string asil_level = 9`，可选值 `QM / ASIL_A / ASIL_B / ASIL_C / ASIL_D`。
  - 重新生成 gRPC 桩代码。
  - `BmsAutosarGenerateHandler`：
    - 从 tool 参数读取 `asil_level` 并透传到生成蓝图；
    - 在检索 query 中，对非 QM 等级自动追加 `safety asil` 关键词，召回安全相关规范；
    - 在 LLM prompt 的 Design Requirements 中注入 ASIL 专项要求（防御性编程、范围检查、单一出口、WdgM、E2E、安全监控等），等级越高约束越严格。
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarAsil.ts`：
    - 提供 `normalizeAsilLevel`、`isHighAsil`、`isAsil`、`asilLabel`、`getAsilDesignGuidelines` 等工具函数；
    - 支持 `ASIL-D`、`asil_d` 等大小写/连字符变体归一化。
  - 内置模板 `assets/bms-autosar/templates.json` 注入 ASIL 上下文变量（`${AsilLevel}`、`${ASIL_LEVEL}`），支持按等级输出条件代码片段。

- **Wizard UI 增加 ASIL 选择**
  - `BmsAutosarWizard.tsx`：在 Output format 下方新增 ASIL level 下拉框，默认值 `QM`。
  - `BmsAutosarWizard.utils.ts`：
    - `WizardFormState` 新增 `asilLevel: AsilLevel`；
    - `buildPrompt` 在 prompt 中说明 ASIL 等级；
    - `exportBatchConfig` / `importBatchConfig` / `applyPreset` 读写 `asil_level` / `asilLevel`。
  - `BmsAutosarWizard.presets.ts`：预设支持 `asilLevel` 字段。

### 单元测试

- 新增 `BmsAutosarAsil.test.ts`：覆盖 ASIL 归一化、高 ASIL 判断、标签、设计指南内容差异。
- 扩展 `BmsAutosarGenerateHandler.test.ts`：覆盖 ASIL D 请求时 blueprint 包含 ASIL 上下文与安全关键词。
- 全量单元测试通过：`npm run test:unit` 共 **1658** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- `npm run package:vsix` 成功生成 `dist/claude-dev-3.89.2-bms-autosar.vsix`（约 9.06 MB）。

---

## 2026-06-22（第二十六次迭代 / RAG 检索增强）

### 新增功能

- **tag / sourceFile 元数据预过滤**
  - `BmsAutosarSemanticRetrievalOptions` 新增 `tags`、`sourceFiles` 字段。
  - `BmsAutosarSemanticRetrieval.ts` 在 embedding/BM25 之前先按元数据过滤条目，支持与逻辑：匹配任一 tag 且匹配任一 source file；大小写不敏感。
  - 生成器 `BmsAutosarGenerateHandler` 检索知识时传入 `tags: [componentType]`，使生成结果优先聚焦对应组件类型。
  - Webview 知识库管理器的 tag 选择现在会同步作为语义检索的预过滤条件。

- **AUTOSAR 领域 query 扩展**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarQueryExpander.ts`。
  - 维护 AUTOSAR/BMS 缩写与全称/同义词映射（CSC↔Cell Supervision Circuit↔AFE、SOC↔StateOfCharge、BMS↔BatteryManagementSystem 等）。
  - 检索前自动扩展查询字符串，同时用于 embedding 和 BM25，缓解词汇鸿沟。

- **LLM-as-reranker 二阶段排序**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarReranker.ts`。
  - 一阶段 hybrid + ARXML 图谱得分完成后，取 top N 候选交给 LLM 按 0-10 打分。
  - 最终得分 = (1 - llmWeight) × stageOneScore + llmWeight × (llmScore / 10)。
  - 当无可用 LLM handler 或调用失败时，自动回退到一阶段得分，保证可用性。
  - 默认最多重排 15 个候选，避免 LLM 调用成本过高。

- **检索参数可调 UI**
  - 扩展 `proto/cline/file.proto`：
    - `SearchBmsKnowledgeRequest` 新增 `tags`、`source_files`、`hybrid_weight`、`score_threshold`、`use_reranker`。
    - `BmsKnowledgeSearchResult` 新增 `tags`、`source_files`。
  - 重新生成 gRPC 桩代码。
  - `searchBmsKnowledge` controller 透传所有新参数。
  - `BmsKnowledgeManager.tsx`：
    - 语义搜索框旁新增展开按钮，打开 **Retrieval settings** 面板。
    - 提供 Top K、Hybrid Weight 滑块、Score Threshold、LLM reranker 开关。
    - 搜索结果列表展示 tags 与 source files。

### 单元测试

- 新增 `BmsAutosarQueryExpander.test.ts`：覆盖空查询、无同义词、缩写扩展、交叉同义词、去重。
- 新增 `BmsAutosarReranker.test.ts`：覆盖 JSON 分数解析、缺失 JSON/count 不匹配回退、分数截断、无 API handler 回退、maxCandidates 限制。
- 新增 `BmsAutosarSemanticRetrievalFilters.test.ts`：覆盖 tag 过滤、sourceFile 过滤、空结果、大小写不敏感。
- 全量单元测试通过：`npm run test:unit` 共 **1647** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第二十五次迭代 / 模板引擎与用户自定义模板）

### 新增功能

- **用户自定义模板存储与合并**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarTemplateStorage.ts`：
    - 复用 BMS AUTOSAR 知识库的路径约定：workspace 存储在 `<cwd>/.cline/bms-autosar/templates.json`，global 存储在 `~/.cline/bms-autosar/templates.json`。
    - 提供 `loadBmsTemplates`、`saveBmsTemplate`、`deleteBmsTemplate`。
    - 写入采用原子写入（`.tmp` + `fs.rename`），避免文件损坏。
    - 提供 `loadMergedTemplates(cwd, builtInTemplates)`：按 **built-in → global → workspace** 的优先级合并模板，workspace 模板优先级最高，可覆盖内置模板。
  - 更新 `BmsAutosarGenerateHandler.loadTemplates()`：加载内置 `assets/bms-autosar/templates.json` 后，调用 `loadMergedTemplates` 合并用户模板。

- **模板管理 RPC**
  - 扩展 `proto/cline/file.proto`：
    - `listBmsAutosarTemplates`：列出用户定义的模板（含 key、component_type、scope）。
    - `saveBmsAutosarTemplate`：保存用户模板。
    - `deleteBmsAutosarTemplate`：删除用户模板。
  - 重新生成 gRPC 桩代码。
  - 新增 controllers：
    - `src/core/controller/file/listBmsAutosarTemplates.ts`
    - `src/core/controller/file/saveBmsAutosarTemplate.ts`
    - `src/core/controller/file/deleteBmsAutosarTemplate.ts`

- **Wizard 模板选择与管理 UI**
  - `BmsAutosarWizard.tsx`：
    - 组件类型下拉框自动合并内置类型与用户自定义模板。
    - 新增 **Manage templates** 按钮，打开模板管理对话框。
  - 新增 `BmsAutosarTemplateManager.tsx`：
    - 列出所有用户模板，支持删除。
    - 支持基于内置 component_type 创建新模板，指定 workspace/global scope。
    - 创建时自动生成空的 header / c / arxml 模板骨架，用户可在 `templates.json` 中进一步编辑。

### 单元测试

- 新增 `src/core/task/tools/handlers/bms-autosar/__tests__/BmsAutosarTemplateStorage.test.ts`：覆盖空模板加载、workspace/global 保存与隔离、删除、合并优先级、目录计算。
- 全量单元测试通过：`npm run test:unit` 共 **1631** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第二十四次迭代 / 批量自动修复）

### 新增功能

- **质量报告支持一键批量自动修复**
  - 扩展 `proto/cline/file.proto`：
    - 新增 RPC `autoFixBmsAutosarFiles(AutoFixBmsAutosarFilesRequest) returns (AutoFixBmsAutosarFilesResponse)`。
    - 请求支持 `repeated string file_paths` 与 `bool apply`。
    - 响应返回每个文件的 `AutoFixBmsAutosarFileResponse` 结果，以及 `fixed_count` / `applied_count` / `total_count` / `message` 汇总信息。
  - 重新生成 gRPC 桩代码。
  - 新增 `src/core/controller/file/autoFixBmsAutosarFiles.ts`：
    - 复用已有的单文件 `autoFixBmsAutosarFile` 核心逻辑。
    - 只构建一次 `ApiHandler`，依次处理每个文件，生成 diff。
    - `apply=true` 时批量写回磁盘，并统计成功数。
  - 更新 `BmsAutosarQualityReportView.tsx`：
    - 当报告中有 error/warning 文件时，工具栏显示 **Fix All** 按钮。
    - 点击后先调用 `autoFixBmsAutosarFiles`（`apply=false`）获取批量预览。
    - 弹出批量预览对话框，按文件分组展示所有 diff。
    - 用户确认后点击 **Apply All Fixes**，再次调用 `apply=true` 批量写盘并刷新报告。

### 单元测试

- 新增 `src/core/controller/file/__tests__/autoFixBmsAutosarFiles.test.ts`：覆盖空文件列表错误、批量预览不写盘、批量应用写盘、部分文件无 issue 时继续处理其余文件。
- 全量单元测试通过：`npm run test:unit` 共 **1624** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第二十三次迭代 / 顶层面板与 ARXML 文件选择）

### 新增功能

- **MISRA 质量报告与 ARXML 知识图谱提升为独立顶层面板**
  - 新增 VS Code 命令：
    - `cline.bmsAutosarQualityReport` — “Open BMS AUTOSAR Quality Report”
    - `cline.bmsAutosarKnowledgeGraph` — “Open BMS AUTOSAR Knowledge Graph”
  - 命令在 `src/registry.ts` 与 `package.json` 注册，并在 `src/extension.ts` 中处理：显示 webview 并通过 `UiService` 发送导航事件。
  - 扩展 `proto/cline/ui.proto` 的 `UiService`：
    - `subscribeToBmsAutosarQualityReport`
    - `subscribeToBmsAutosarKnowledgeGraph`
  - 新增后端订阅/发送器：
    - `src/core/controller/ui/subscribeToBmsAutosarQualityReport.ts`
    - `src/core/controller/ui/subscribeToBmsAutosarKnowledgeGraph.ts`
  - 扩展 `ExtensionStateContext`：新增 `showBmsAutosarQualityReport` / `showBmsAutosarKnowledgeGraph` 状态及对应 `navigateTo*` / `hide*` 方法。
  - 更新 `webview-ui/src/App.tsx`：懒加载并渲染新的顶层面板；`ChatView.isHidden` 同步纳入两个新面板状态。

- **新建顶层面板组件**
  - `webview-ui/src/components/bms-autosar/BmsAutosarQualityReportView.tsx`：全屏质量报告视图，保留按严重等级过滤、点击跳转文件、自动修复预览/确认/应用功能。
  - `webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphView.tsx`：全屏 ARXML 知识图谱视图，保留力导向布局、节点筛选、节点详情。

- **ARXML 知识图谱支持用户选择文件**
  - 在 `BmsAutosarKnowledgeGraphView` 顶部增加：
    - Scope 切换（Workspace / Global）。
    - “Select ARXML Files” 按钮，调用 `FileServiceClient.selectFiles` 多选 `.arxml` 文件。
    - 已选文件数量与文件名展示，以及 “Clear” 按钮清空选择（回退到从知识库自动发现 ARXML）。
  - 放宽 `src/integrations/misc/process-files.ts` 的文件选择器过滤，将 `arxml` 加入 `OTHER_FILE_EXTENSIONS`，使文件选择器能够选中 ARXML 文件。

- **在聊天输入工具栏新增两个快捷按钮**
  - 在 `ChatTextArea.tsx` 中与已有的 BMS AUTOSAR Generator 按钮并列新增：
    - 验证图标按钮 → 调用 `navigateToBmsAutosarQualityReport()`，打开 BMS AUTOSAR Quality Report 顶层面板。
    - 图形图标按钮 → 调用 `navigateToBmsAutosarKnowledgeGraph()`，打开 ARXML Knowledge Graph 顶层面板。
  - 悬浮提示分别为 “BMS AUTOSAR Quality Report” 和 “ARXML Knowledge Graph”。

### 单元测试

- 全量单元测试通过：`npm run test:unit` 共 **1620** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第二十二次迭代 / 自动修复确认闭环）

### 新增功能

- **自动修复从“直接写盘”改为“预览 → 确认 → 应用”闭环**
  - 扩展 `proto/cline/file.proto` 中 `autoFixBmsAutosarFile`：
    - 请求新增 `apply` 字段，`false` 时仅返回预览，`true` 时才写盘。
    - 返回类型从单一 `String` 改为 `AutoFixBmsAutosarFileResponse`，包含 `fixed` / `applied` / `file_path` / `original_content` / `fixed_content` / `diff` / `message`。
  - 重新生成 gRPC 桩代码。
  - 重构 `BmsAutosarAutoFixer.ts`：
    - 不再调用 `fs.writeFile` 直接覆盖原文件。
    - 只负责读取原文件、调用 LLM、提取代码块、返回 `originalContent` 与 `fixedContent`。
  - 更新 `autoFixBmsAutosarFile` controller：
    - 使用 `formatResponse.createPrettyPatch` 生成 unified diff。
    - `apply=false` 时返回预览；`apply=true` 时将 `fixedContent` 写回磁盘。
  - 更新 `BmsAutosarQualityPanel.tsx`：
    - 点击魔棒按钮先请求预览，弹出 diff 对话框。
    - 对话框显示 `diff` 与 `fixed_content`（兜底）。
    - 用户可选择 **Apply Fix** 写盘或 **Cancel** 取消。
    - 应用成功后刷新质量报告。

### 单元测试

- 更新 `BmsAutosarAutoFixer.test.ts`：验证 `fixedContent` 返回值，并确认原文件不会被直接修改。
- 全量单元测试通过：`npm run test:unit` 共 **1620** 项通过。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第二十一次迭代 / 单测兼容性与自动修复单测修复）

### 问题修复

- **修复 `BmsAutosarAutoFixer` 单元测试模块解析失败**
  - 现象：Node 23 默认启用实验性 Type Stripping，导致 mocha + ts-node 在加载 `.ts` 测试文件时部分走原生 ESM 解析，无法解析无扩展名的相对导入与 `@core/api` 路径别名。
  - 修复：
    - 在 `apps/vscode/package.json` 的 `test:unit` 脚本中增加 `NODE_OPTIONS=--no-experimental-strip-types`，强制单元测试走 ts-node 编译流程。
    - 修正 `BmsAutosarAutoFixer.test.ts` 中的类型导入：`ApiStream` 从 `@core/api/transform/stream` 导入，而非 `@core/api`。
    - 修正第三个测试用例：当 LLM 返回不含代码块的原始响应且内容与原文不同时，才应判定为 `fixed: true`。

### 单元测试

- 全量单元测试通过：`npm run test:unit` 共 **1620** 项通过（新增 3 项 `BmsAutosarAutoFixer` 测试）。

### 构建验证

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。

---

## 2026-06-22（第十九次迭代 / MISRA 检查与 ARXML 知识图谱）

### 新增功能

- **生成后 MISRA C:2012 静态检查**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarMisraChecker.ts`：
    - 实现轻量级、基于正则的 MISRA C:2012 风格规则检查，覆盖 R5.1（外部标识符长度）、R7.1（八进制常量）、R8.4（外部函数声明可见性）、R9.1（未初始化局部变量）、R11.3（可疑指针转换）、R14.4（控制表达式赋值）、R15.5（单一返回点）、R17.7（返回值使用）、R21.3/R21.8/R21.9（禁用 stdlib 函数）、R21.6（禁用 stdio 函数）。
    - 输出结构化 `MisraIssue`（规则编号、严重等级、行号、消息）。
    - 提供 `formatMisraReport` 与 `formatMisraSummary` 生成 markdown 报告。
  - 集成到 `BmsAutosarQualityGates.ts` 的 `runBmsAutosarQualityGates`：`.c` / `.h` 文件保存后自动执行 MISRA 检查，结果与原有 ARXML/C 校验、编译 smoke test 合并展示。
  - 新增单测 `BmsAutosarMisraChecker.test.ts`：覆盖禁用函数、八进制常量、多返回、未初始化变量及干净代码报告。

- **ARXML 知识图谱化检索**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeGraph.ts`：
    - 使用正则解析 ARXML，抽取 `AR-PACKAGE`、`APPLICATION-SW-COMPONENT-TYPE`、`P-PORT-PROTOTYPE`、`R-PORT-PROTOTYPE`、`SENDER-RECEIVER-INTERFACE`、`IMPLEMENTATION-DATA-TYPE`、`RUNNABLE-ENTITY`、`DATA-PROTOTYPE` 等节点。
    - 构建两类边：`contains`（父子包含关系）与 `provides` / `requires` / `references` / `triggers`（TREF/REF 引用关系）。
    - 提供 `searchGraphNodes`、`getRelatedNodes`、`rankByGraphProximity` 等图谱查询 API。
  - 集成到 `BmsAutosarSemanticRetrieval.ts`：当知识条目 `sourceFiles` 包含 `.arxml` 时，运行时构建/合并 ARXML 图谱，对图谱中与查询相关的节点及其邻居关联到的条目给予 hybrid 分数加成，实现“图谱近邻”增强检索。
  - 新增单测 `BmsAutosarKnowledgeGraph.test.ts`：覆盖节点抽取、contains 边、引用边、图谱搜索、近邻排序。

### 单元测试

- 全量单元测试通过：`npm run test:unit` 共 1614 项通过。

### 构建验证

- `npm run check-types`、`npm run lint` 全部通过。

---

## 2026-06-22（第十八次迭代 / 知识库第二批优化）

### 新增功能与优化

- **知识库 JSON 原子写入**
  - `saveBmsKnowledgeContent()` 先写入 `.tmp` 临时文件，再 `fs.rename` 到 `knowledge.json`，降低进程崩溃导致知识库损坏的风险。
  - `updateBmsKnowledge` / `importBmsKnowledgeJson` 同样采用原子写入。

- **停用词与 BM25 常量共享**
  - 新建 `src/core/task/tools/handlers/bms-autosar/BmsAutosarRetrievalConstants.ts`，集中导出 `STOP_WORDS`、`BM25_K1`、`BM25_B`。
  - `BmsAutosarRetrievalWorker.ts` 与 `BmsAutosarSemanticRetrieval.ts` 均从该文件引入，避免重复定义并修复 worker 文件中的残留未闭合数组。

- **所有 chunk 携带来源元数据**
  - `saveBmsKnowledgeContent()` 在分块时把 `sourceFiles` 写入每个 chunk，使 chunk 级条目也能追溯到原始文件。

- **部分 embedding 失败降级到 BM25**
  - `BmsAutosarSemanticRetrieval.ts` 的 hybrid 评分改为：对没有可用 embedding 的条目，直接使用其 BM25 分数作为语义分数，而不是强置 0。
  - 只有当完全无法获取 query/entry embedding 时，才整体回退到纯 BM25 并记录 telemetry。

- **路径校验处理符号链接**
  - `BmsAutosarKnowledgeHandler.resolveAndValidatePath()` 对输入路径调用 `fs.realpath`，并对 `config.cwd` 也进行 realpath 解析。
  - 同时修复了 macOS `/var` 到 `/private/var` 符号链接导致合法子目录被误判为越界的问题。

- **`extractTextFromFolder` 失败隔离**
  - 返回值新增 `failedFiles: { path, error }[]`，失败文件不再混入正文，而是单独返回供调用方展示摘要。

- **知识库管理器 UX 增强**
  - `BmsKnowledgeManager.tsx` 新增：
    - 每条条目左侧复选框 + 顶部 "Select all"，支持多选。
    - 批量删除按钮（仅在选择条目时显示）。
    - 每条条目的编辑按钮，弹出对话框修改 content 与 tags；保存后清除旧 embedding 以便重新计算。
    - 导出按钮：将当前 scope 的 `knowledge.json` 作为 JSON 文件下载。
    - 导入按钮：通过隐藏 `<input type="file" accept=".json">` 选择 JSON，调用 `importBmsKnowledgeJson` 合并条目（相同 topic 覆盖）。
  - 新增 controller 处理器：
    - `src/core/controller/file/updateBmsKnowledge.ts`
    - `src/core/controller/file/exportBmsKnowledge.ts`
    - `src/core/controller/file/importBmsKnowledgeJson.ts`
  - `file.proto` 新增 RPC：`updateBmsKnowledge`、`exportBmsKnowledge`、`importBmsKnowledgeJson`，并重新生成桩代码。

### 单元测试

- 修复 `BmsAutosarKnowledgeHandler` folder import 测试在 macOS 临时目录符号链接环境下的失败。
- 全量单元测试通过：`npm run test:unit` 共 1601 项通过。

### 构建验证

- `npm run protos` 成功重新生成所有 gRPC 桩代码。
- `npm run check-types`、`npm run lint` 全部通过。

---

## 2026-06-22（第十七次迭代 / 流式生成与知识库优化）

### 新增功能

- **BMS AUTOSAR 独立 gRPC 服务**
  - 新增 `apps/vscode/proto/cline/bms_autosar.proto`：定义 `BmsAutosarService`。
    - `generateBmsAutosar(GenerateBmsAutosarRequest)` 返回流式 `BmsAutosarProgressEvent`。
    - `cancelBmsAutosarGeneration(EmptyRequest)` 取消当前生成任务。
  - 新增 controller 目录 `src/core/controller/bmsAutosar/`：
    - `generateBmsAutosar.ts`：初始化任务并向前端转发进度流。
    - `cancelBmsAutosarGeneration.ts`：调用 `controller.cancelTask()`。
  - 自动生成并注册 nice-grpc / grpc-js 桩代码与 `protobus-services.ts`。

- **生成进度事件总线**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarProgressBus.ts`。
  - 支持按 `taskId` 订阅/发送/完成/失败结构化进度事件。
  - `BmsAutosarGenerateHandler` 在 `preparing`、`retrieving_knowledge`、`generating`、`complete`、`error` 阶段发射事件，前端可实时感知生成状态。

- **Webview 向导接入流式生成**
  - `BmsAutosarWizard.tsx` 不再直接调用 `TaskServiceClient.newTask`，改用 `BmsAutosarServiceClient.generateBmsAutosar`。
  - Review 步骤点击 Generate 后展示实时进度条、阶段消息与取消按钮。

- **遥测增强**
  - `TelemetryService` 新增 BMS AUTOSAR 生成事件：
    - `bms_autosar.generate.started`
    - `bms_autosar.generate.completed`
    - `bms_autosar.generate.failed`
  - 新增指标：`cline.bms_autosar.generate.duration_ms`。
  - `BmsAutosarGenerateHandler` 在 execute 入口记录 started/completed/failed 与耗时。

### 知识库优化

- **统一持久化层**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes.ts`，集中存放 `BmsAutosarKnowledgeEntry` / `BmsAutosarKnowledgeFile` / `BmsAutosarKnowledgeSource` 类型、`suggestBmsAutosarTags()`、`chunkBmsAutosarText()` 与 `MAX_CHUNK_CHARS`。
  - 扩展 `src/core/controller/file/bmsKnowledgeStorage.ts` 的 `saveBmsKnowledgeContent()`：支持 `scope`（workspace/global）、记录 `sourceFiles`、返回写入路径。
  - `BmsAutosarKnowledgeHandler.ts` 的 `add` 操作重构为调用 `saveBmsKnowledgeContent()`，消除与 controller 之间的 chunk/replace/tag/save 重复逻辑。
  - `addBmsKnowledge.ts` 与 `addBmsKnowledgeFolder.ts` 均复用 `saveBmsKnowledgeContent()`。

- **文件/文件夹导入支持 global scope**
  - `file.proto` 中 `addBmsKnowledge` 改为接收 `AddBmsKnowledgeRequest`，`addBmsKnowledgeFolder` 改为接收 `AddBmsKnowledgeFolderRequest`，均携带 `scope` 字段。
  - `BmsKnowledgeManager.tsx` 的文件/文件夹导入按钮根据当前 scope 切换（workspace/global）写入对应知识库。

- **统一路径校验**
  - `BmsAutosarKnowledgeHandler.ts` 将 `resolveAndValidateFilePath` 与 `resolveAndValidateFolderPath` 合并为 `resolveAndValidatePath`，通过 `expectDirectory` 参数区分文件/文件夹。

- **文件夹导入并行化与元数据**
  - `extractTextFromFolder()` 改用 `createConcurrencyLimit(4)` 并发读取文件，返回 `text` / `files` / `totalFiles` / `failedFiles`。
  - 知识条目新增 `sourceFiles` 字段，记录 folder import 成功读取的源文件相对路径；`BmsKnowledgeEntry` proto 与 `listBmsKnowledge.ts` 同步透传，管理器展开条目时显示 Sources 列表。

- **导入进度反馈**
  - `BmsKnowledgeManager.tsx` 点击文件/文件夹导入后立即显示 "Importing ..." toast，完成后替换为结果消息。
  - `addBmsKnowledgeFolder.ts` 返回结果包含 `X/total` 文件数与失败文件数摘要。

- **Ollama embedding 并发**
  - `BmsAutosarEmbeddingService.ts` 的 `createOllamaEmbeddings` 使用 `createConcurrencyLimit(4)` 并发请求 Ollama 本地 embedding，减少大量 chunk 时的等待时间。

- **缓存外部变更感知**
  - 说明：`BmsAutosarKnowledgeCache.ts` 的 `loadKnowledgeSourceCached` 每次访问都会比较 `mtimeMs`，外部修改 knowledge.json 会自动重新加载，无需额外文件监听。

### 单元测试

- 新增 `src/integrations/misc/__tests__/extract-text.test.ts` 中 `extractTextFromFolder` 测试：覆盖递归提取、跳过不支持的文件、部分失败、无支持文件报错、非目录报错。
- 新增 `src/core/controller/file/__tests__/bmsKnowledgeStorage.test.ts`：覆盖 workspace/global 写入、chunk 与 `sourceFiles`、同名 topic 替换。
- 新增 `src/utils/concurrency.test.ts`：覆盖 `createConcurrencyLimit` 的并发上限与错误传播。
- 扩展 `BmsAutosarKnowledgeHandler.test.ts`：覆盖 folder import 的 `sourceFiles`。

### 构建与打包

- `npm run protos` 重新生成 BMS AUTOSAR 服务与 knowledge RPC 相关桩代码。
- `npm run check-types`、`npm run lint` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（共 126 项）。

---

## 2026-06-21（第十六次迭代 / RAG 智能化升级）

### 新增功能

- **Hybrid 融合检索**
  - `BmsAutosarSemanticRetrieval.ts` 重构为同时计算 embedding cosine 分数与 lexical（BM25）分数，分别 min-max 归一化后加权融合。
  - 默认权重：embedding `0.7`、lexical `0.3`；可通过 `SemanticRetrievalOptions.hybridWeight` 调整。
  - 新增 `retrieveRelevantKnowledgeResults()` 返回 `{ entry, score, sourcePath }`，保留 `retrieveRelevantKnowledgeEntries()` 作为兼容包装。

- **BM25 替换 TF-IDF**
  - `BmsAutosarRetrievalWorker.ts` 与主线程统一使用 BM25（k1=1.5, b=0.75）计算 lexical 分数。
  - `BmsAutosarKnowledgeCache.ts` 的磁盘/内存缓存由 TF-IDF 索引迁移为 `LexicalIndex`（`.lexical.json`），自动失效旧缓存。

- **查询聚焦化**
  - `BmsAutosarGenerateHandler.ts` 的检索 query 由冗长模板字符串精简为 `${componentType} ${componentName} ${requirements}`，降低无关关键词对 embedding/lexical 排序的干扰。

- **来源与分数注入 blueprint**
  - 生成蓝图的 **Relevant Knowledge Base Entries** 章节现在显示每个条目的融合分数 `score` 与来源路径 `source`。

- **大文档分块存储**
  - 新增 `chunkBmsAutosarText()` 工具函数，对 `extractTextFromFile` 返回的长文本按段落/ARXML 元素切分，每 chunk 保存为独立知识条目（`Topic - Chunk N/M`）。
  - `BmsAutosarKnowledgeHandler.ts` 与 `addBmsKnowledge.ts` 均支持分块导入；重复导入同一 topic 会自动替换旧 chunks。

- **Ollama 本地 embedding 降级**
  - `BmsAutosarEmbeddingService.ts` 在无 OpenAI key 且检测到 Ollama 配置（base URL 或 model ID）时，自动通过 `ollama.embeddings()` 生成本地 embedding。
  - 后台 eager embedding 刷新条件同步放宽：OpenAI 或 Ollama 任一可用即执行。

- **知识管理器 fuzzy 搜索与语义检索预览**
  - `BmsKnowledgeManager.tsx` 的 topic 搜索改用 `fuse.js`，支持 topic / content / tags 模糊匹配。
  - 新增语义搜索输入框与结果预览面板，调用 `FileServiceClient.searchBmsKnowledge()` 展示 topK 结果及其分数、来源路径、摘要。

- **Webview 语义检索 RPC**
  - `proto/cline/file.proto` 新增 `searchBmsKnowledge` RPC 与 `SearchBmsKnowledgeRequest`、`BmsKnowledgeSearchResult`、`BmsKnowledgeSearchResults` 消息。
  - 新增 controller `searchBmsKnowledge.ts`，加载 workspace/global 知识源并复用 `retrieveRelevantKnowledgeResults` 返回排序结果。

### 单元测试

- 更新 `BmsAutosarSemanticRetrieval.test.ts`：覆盖 BM25 排序、`scoreThreshold`、hybrid 权重、结果结构（score / sourcePath）。
- 新增 `BmsAutosarKnowledgeChunking.test.ts`：覆盖短文本、长文本、段落边界、内容不丢失。
- 新增/更新共 11 项 BMS AUTOSAR 相关单元测试。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（共 119 项）。
- Webview 构建通过，`size-limit` 695.93 kB / 2 MB。
- 已生成产物：`apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix`（168 files, 9.03 MB）。

---

## 2026-06-21（第十五次迭代）

### 新增功能

- **知识库智能化增强**
  - **Eager Embedding 预计算**：当配置 OpenAI 兼容 API key 时，`bms_autosar_knowledge` 的 `add`/`update` 操作会在保存后后台立即计算并写入 embedding，消除首次检索时的延迟。
  - **自动标签推荐**：新增 `suggestBmsAutosarTags()`，当用户未提供 `tags` 时，根据 topic 与 content 中的 BMS/AUTOSAR 关键词自动推荐标签（如 `balancing`、`thermal`、`diagnosis`、`arxml`、`autosar` 等）。
  - **检索相关性阈值**：`retrieveRelevantKnowledgeEntries` 新增 `scoreThreshold` 参数，对 embedding 与 TF-IDF 结果均生效，避免低分条目进入生成蓝图。
  - `BmsAutosarGenerateHandler` 继续调用语义检索，未来可进一步调优 `scoreThreshold`。

### 单元测试

- 扩展 `BmsAutosarKnowledgeHandler.test.ts`：覆盖自动标签推荐、`suggestBmsAutosarTags` 关键词匹配。
- 扩展 `BmsAutosarSemanticRetrieval.test.ts`：覆盖 `scoreThreshold` 过滤行为。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（共 108 项）。

---

## 2026-06-21（第十四次迭代）

### 新增功能

- **BMS AUTOSAR 质量门禁与自动修复**
  - 新增 `src/core/task/tools/utils/BmsAutosarQualityGates.ts`：
    - `fixAutosarContent(relPath, content)`：保存前自动修复尾部空白、统一换行符、补全 EOF 换行；对 `.h` 文件自动插入 include guard（根据文件名推导宏名）。
    - `validateArxmlEnhanced(content)`：检测同父节点下重复的 `<SHORT-NAME>`，以及指向本文件内不存在的 `SHORT-NAME` 的 `TREF` 引用。
    - `compileCSmokeTest(relPath, content)`：当系统存在 `gcc` 或 `clang` 时，使用 `-fsyntax-only -std=c99` 对生成的 `.c` 文件做编译冒烟测试。
    - `runBmsAutosarQualityGates(relPath, content)`：组合基础校验、增强校验与编译冒烟测试，统一返回结果。
  - `WriteToFileToolHandler.ts` 在构造 `newContent` 后、持久化前调用 `fixAutosarContent`；在保存后异步调用 `runBmsAutosarQualityGates`。
  - 所有质量门禁均为建议/信息级别，命中后追加到工具返回消息，不阻断文件写入。

### 单元测试

- 新增 `src/core/task/tools/utils/__tests__/BmsAutosarQualityGates.test.ts`：覆盖自动修复、include guard、重复 SHORT-NAME、悬空引用、编译冒烟测试成功/失败场景、质量门禁组合。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（共 103 项）。

---

## 2026-06-21（第十三次迭代）

### 新增功能

- **BMS AUTOSAR 生成向导增强**
  - 新增 `webview-ui/src/components/bms-autosar/BmsAutosarWizard.presets.ts`：为全部 12 种 `component_type` 提供领域预设（组件名、需求、端口、Runnable、输出格式）。
  - 新增 `webview-ui/src/components/bms-autosar/BmsAutosarWizard.utils.ts`：统一封装 prompt 构建、表单校验、批量配置导入/导出。
  - 进入 Details 步骤或切换组件类型时自动填充对应预设，减少重复输入。
  - Details 步骤增加「Apply preset」按钮，支持手动重新应用当前类型预设。
  - 增加实时 prompt 预览开关，用户可在提交前查看将发送给模型的完整 prompt。
  - 增加批量配置导入/导出：
    - 支持 `.json` 和 `.yaml`/`.yml` 导入，自动回填向导表单。
    - 支持导出为 JSON 或 YAML 格式的 batch config，便于复用与版本管理。
  - 表单校验增强：每个字段失去焦点时校验，空组件名、非法 JSON 数组等会显示具体错误信息，未修复前无法进入 Review 步骤。

### 依赖变更

- `webview-ui/package.json` 新增 `js-yaml`，用于向导内的 YAML 导入/导出。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run test:unit` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（共 92 项）。

---

## 2026-06-21（第十二次迭代）

### 新增功能

- **模板渲染引擎支持嵌套循环**
  - `BmsAutosarTemplateRenderer.ts` 现在支持 `{{#each runnables}}...{{#each ports}}...{{/each}}...{{/each}}` 嵌套结构。
  - 6 个 BMS 领域组件类型的 C 模板可在每个 runnable 内部迭代端口，生成更贴近真实 AUTOSAR 实现的框架代码。

- **批量生成（JSON/YAML 配置）**
  - `BmsAutosarGenerateHandler.ts` 新增 `config_file` 参数。
  - 支持读取 `.json` 或 `.yaml`/`.yml` 批量配置文件，解析 `components` 数组后逐个生成蓝图。
  - 单个组件缺失 `component_name` 时跳过并返回错误片段，不中断后续组件生成。

- **知识检索性能优化**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeCache.ts`。
  - `templates.json` 与 workspace/global `knowledge.json` 使用基于 `mtime` 的进程内缓存，避免每次生成重复读盘/解析。
  - 查询 embedding 增加同进程备忘录缓存，相同 query/model 组合不再重复调用 embedding API。
  - `BmsAutosarKnowledgeHandler.ts` 在 add/update/delete 后自动失效对应文件缓存，保证数据一致性。

- **Webview 生成向导**
  - 新增 `webview-ui/src/components/bms-autosar/BmsAutosarWizard.tsx`：三步向导（选择组件类型 → 填写名称/需求/ports/runnables → 预览并生成）。
  - 新增 `webview-ui/src/components/ui/textarea.tsx`。
  - `ExtensionStateContext` 增加 `showBmsAutosarWizard` 状态与导航/隐藏函数。
  - `App.tsx` 渲染向导并正确处理 `ChatView` 隐藏逻辑。
  - `ChatTextArea.tsx` 工具栏新增 CPU 图标按钮，点击打开 BMS AUTOSAR 生成向导。
  - 向导提交后通过 `TaskServiceClient.newTask` 发起任务，由模型调用 `bms_autosar_generate` 工具生成产物。

### 优化与增强

- **生成产物验证增强**
  - `BmsAutosarValidationUtils.ts` 新增检查项：
    - ARXML：空的 `TYPE-TREF` / `SOFTWARE-COMPOSITION-TREF` 引用、`DEST` 属性缺失/不匹配。
    - C 源码：函数体内 magic numbers、未初始化局部变量、函数定义命名规范（AUTOSAR 风格 `<Module>_<Operation>`）。
  - 所有检查均为建议级别，命中后追加到工具返回信息，不阻断文件保存。

### 单元测试

- 扩展 `BmsAutosarGenerateHandler.test.ts`：覆盖 JSON 批量配置生成。
- 新增 `BmsAutosarKnowledgeCache.test.ts`：覆盖模板/知识源缓存、mtime 变更重载、文件删除清理、缓存失效。
- 扩展 `BmsAutosarValidationUtils.test.ts`：覆盖新增 ARXML 引用检查、magic numbers、未初始化变量、命名规范。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run test:unit`、`npm run compile` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（共 92 项）。
- 新增/更新 `package:vsix` 脚本：`npm run package:vsix` 直接输出到 `apps/vscode/dist/claude-dev-<version>-bms-autosar.vsix`。
- 已生成产物：`dist/claude-dev-3.89.2-bms-autosar.vsix`（113 files, 8.95 MB）。

---

## 2026-06-21（第十一次迭代）

### 新增功能

- **BMS 领域专用组件类型**
  - `templates.json` 版本升级至 `3.0.0`。
  - 新增 6 个面向电池管理系统真实角色的 `component_type`：
    - `bms_csc`：Cell Supervision Circuit / AFE 从机接口
    - `bms_controller`：BMS 主控制器（模式管理、接触器、HV 状态机）
    - `bms_balancer`：被动/主动均衡控制
    - `bms_thermal_manager`：热管理（过温保护、冷却/加热 PWM）
    - `bms_charger`：AC/DC 充电控制（CC/CV）
    - `bms_diagnosis`：诊断/DTC 管理服务 SWC
  - 每个类型包含领域默认端口、Runnable、C/H 模板、ARXML 结构与 `_Types.arxml`。

- **组件类型自动推断**
  - `BmsAutosarRequirementParser.ts` 新增 `inferComponentTypeFromRequirements()`。
  - 当 `bms_autosar_generate` 未提供 `component_type` 时，根据 `requirements` 文本推断领域类型（如 "thermal manager" -> `bms_thermal_manager`）。
  - 新增端口推断规则：`CellVoltage_Slave`、`CellTemperature_Slave`、`PreChargeStatus`、`HvRequest`、`BalanceCommand`、`CoolingPwm`、`HeatingPwm`、`ChargerVoltage`、`ChargerCurrent`、`ChargeRequest`、`FaultStatus`。

- **工具定义与提示更新**
  - `bms_autosar_generate.ts`：`component_type` 改为可选，枚举新增 6 个 BMS 类型。
  - `commands.ts` 的 `/bms-autosar` slash 命令说明同步更新。
  - `.claude/skills/bms-autosar/SKILL.md` 与 `.cline/skills/bms-autosar/SKILL.md` 增加 Built-in BMS Domain Component Types 表格与调用示例。

- **单元测试**
  - 扩展 `BmsAutosarGenerateHandler.test.ts`：覆盖 `bms_thermal_manager`、`bms_controller`、`bms_diagnosis` 蓝图生成，以及 `component_type` 省略时的自动推断。
  - 扩展 `BmsAutosarRequirementParser.test.ts`：覆盖新端口规则与 6 种组件类型推断。

### 构建与打包

- `npm run check-types`、`npm run lint`、BMS AUTOSAR 相关单元测试全部通过。

---

## 2026-06-21（第十次迭代）

### 新增功能

- **知识库标签系统**
  - 扩展 `BmsAutosarKnowledgeEntry` 增加可选 `tags?: string[]`。
  - 扩展 `proto/cline/file.proto` 的 `BmsKnowledgeEntry`：新增 `tags`、`has_embedding`、`embedding_stale`、`content` 字段。
  - `bms_autosar_knowledge` 工具的 `add` 动作支持 `tags` 参数（JSON 数组字符串）。
  - `list` / `get` 输出显示标签。
  - 更新条目时保留原有标签（除非显式传入新标签）。

- **ARXML 文件导入知识库**
  - `addBmsKnowledge` 文件过滤器增加 `.arxml`。
  - 导入 ARXML 时自动提取第一个 `<SHORT-NAME>` 作为默认 topic 建议。
  - ARXML 导入后自动打上标签 `["imported", "arxml", "autosar"]`。

- **前端知识库管理器增强**
  - 新增搜索框，按 topic 实时过滤。
  - 新增 Workspace / Global scope 切换。
  - 新增标签云，点击标签过滤条目。
  - 显示 embedding 状态图标：
    - `codicon-check` 绿色：已缓存
    - `codicon-sync` 灰色：未嵌入
    - `codicon-warning` 黄色：embedding 过期（内容已变）
  - 点击条目可展开/折叠，查看完整 content。
  - 删除前增加确认弹窗。

- **后端标签与 embedding 状态透传**
  - `listBmsKnowledge.ts` 读取 knowledge.json 的 `tags`、`content`、`embedding`，计算 `has_embedding` / `embedding_stale` 后返回给前端。

- **工具描述更新**
  - `bms_autosar_knowledge.ts` 系统提示更新，说明 `file_path` 支持 `.arxml` 和 `tags` 参数。

- **单元测试**
  - 新增 `src/core/task/tools/handlers/__tests__/BmsAutosarKnowledgeHandler.test.ts`：覆盖 tags 添加、list/get 标签显示、更新时清除 embedding。
  - 新增 `src/core/controller/file/__tests__/addBmsKnowledge.test.ts`：覆盖 ARXML SHORT-NAME 提取。
  - 新增 `src/core/controller/file/__tests__/listBmsKnowledge.test.ts`：覆盖 tags 和 embedding 状态透传。

### 构建与打包

- `npm run protos`、`npm run check-types`、`npm run lint`、`npm run package` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（新增 9 项，共 68 项）。
- `npx vsce package --no-dependencies` 成功，产物 `claude-dev-3.89.2.vsix`（113 files, 8.94 MB）。

---

## 2026-06-21（第九次迭代）

### 新增功能

- **扩展可生成的 AUTOSAR 组件类型**
  - 新增 `service` 类型：生成 AUTOSAR Service SWC，适用于 BMS 诊断服务、标定服务、SOA 服务封装；产物包含 `${ComponentName}.h/.c` 和 `${ComponentName}.arxml`（`SERVICE-SW-COMPONENT-TYPE`、`SERVICE-INTERFACE`）。
  - 新增 `ecu_extract` 类型：生成 ECU 级聚合 ARXML，包含 `COMPOSITION-SW-COMPONENT-TYPE` 和 `ROOT-SW-COMPOSITION-PROTOTYPE`，支持通过 `components` 参数引用多个 SWC/BSW 原型。
  - 工具描述和参数 schema 已同步更新：`core/prompts/system-prompt/tools/bms_autosar_generate.ts`、`core/assistant-message/index.ts`。

- **从需求文本自动推导 Ports / Runnables**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarRequirementParser.ts`。
  - 当用户未显式提供 `ports`/`runnables` 但提供了 `requirements` 时，根据关键词推断：
    - `cell voltage` → `CellVoltage` R-PORT；`temperature` → `CellTemperature` R-PORT；`SOC`/`SOH` → Provided S/R 端口；`diagnosis`/`DTC` → C/S 端口；等等。
    - `every 10ms/100ms/1s` → `TimingEvent`；`data received` → `DataReceivedEvent`；`init` → `OperationInvokedEvent`。
  - 推断结果作为默认填充，不覆盖用户显式 JSON。

- **增强 ARXML 完整性**
  - `swc` 和 `service` 类型的 ARXML 现在包含独立的数据类型包（`IMPLEMENTATION-DATA-TYPE`）和接口包（`SENDER-RECEIVER-INTERFACE` / `CLIENT-SERVER-INTERFACE`）。
  - 端口原型增加 `REQUIRED-INTERFACE-TREF` / `PROVIDED-INTERFACE-TREF` 引用。
  - `RUNNABLE-ENTITY` 增加 `MINIMUM-START-INTERVAL`，并为 `TimingEvent` / `DataReceivedEvent` / `OperationInvokedEvent` 添加事件绑定。
  - 当 `output_format` 为 `arxml`/`both` 时，额外生成 `${ComponentName}_Types.arxml`。

- **验证规则更新**
  - `BmsAutosarValidationUtils.ts` 现在识别 `SERVICE-SW-COMPONENT-TYPE` 和 `COMPOSITION-SW-COMPONENT-TYPE` 为合法 AUTOSAR 内容。

- **单元测试**
  - 新增 `src/core/task/tools/handlers/bms-autosar/__tests__/BmsAutosarRequirementParser.test.ts`。
  - 扩展 `BmsAutosarGenerateHandler.test.ts`：覆盖 requirements 推导、`service`、`ecu_extract`。
  - 扩展 `BmsAutosarValidationUtils.test.ts`：覆盖 service/composition ARXML 校验。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run package` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（新增 13 项，共 59 项）。
- `npx vsce package --no-dependencies` 成功，产物 `claude-dev-3.89.2.vsix`（113 files, 8.94 MB）。

---

## 2026-06-19（第八次迭代）

### 新增功能

- **语义检索 / Embedding 检索**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarEmbeddingService.ts`：基于现有 `openai` 包和 `@/shared/net` 的 `createOpenAIClient`，调用 OpenAI 兼容的 embedding 端点生成向量；默认模型 `text-embedding-3-small`；内容按 SHA-256 哈希缓存。
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarSemanticRetrieval.ts`：
    - 优先使用 embedding + 余弦相似度对知识库条目排序。
    - 当未配置 API key、端点不可用或部分条目 embedding 失败时，自动降级为本地 TF-IDF + 余弦相似度。
    - 新计算的 embedding 会写回 `knowledge.json`，按 `{model, contentHash}` 键控，未修改条目不会重复嵌入。
  - `BmsAutosarKnowledgeHandler.ts` 扩展知识条目 schema，新增 `embedding?: { model, vector, contentHash }`；更新条目时自动清除旧 embedding，保证内容变化后重新嵌入。
  - `BmsAutosarGenerateHandler.ts` 移除原有的子串匹配过滤，改为调用语义检索；检索 query 综合 `component_type`、`component_name`、`ports`、`runnables`、`requirements`。
  - 无新增运行时依赖，保持 bundle 体积稳定（`dist/extension.js` ≈ 17 MB，`dist/cline.vsix` ≈ 8.9 MB）。

- **单元测试**
  - 新增 `src/core/task/tools/handlers/bms-autosar/__tests__/BmsAutosarEmbeddingService.test.ts`：覆盖 `hashContent`、无 key/空输入行为。
  - 新增 `src/core/task/tools/handlers/bms-autosar/__tests__/BmsAutosarSemanticRetrieval.test.ts`：覆盖空源、TF-IDF 排序、component name 匹配、topK 截断。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run package` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（新增 11 项，共 46 项）。

---

## 2026-06-19（第七次迭代）

### 新增功能

- **生成产物后自动验证**
  - 新增 `src/core/task/tools/utils/BmsAutosarValidationUtils.ts`，零外部依赖。
  - 在 `WriteToFileToolHandler` 保存文件后自动调用验证，并把结果追加到工具返回消息中，模型下轮可见。
  - 验证范围：
    - `.arxml` 文件：检查 XML well-formed、根元素为 `<AUTOSAR>`、存在 `<SHORT-NAME>`、标签平衡（含自闭合标签）。
    - `.h` 文件：检查完整 include guard、无动态内存分配函数、无 `goto`、TODO 提示。
    - `.c` 文件：检查无 `malloc`/`free`/`calloc`/`realloc`、无 `goto`、至少存在一个函数声明/定义、TODO 提示。
  - 命中规则：所有 `.arxml`；`.c`/`.h` 文件名以 `Bms` 开头、包含 `bms_`/`autosar`、或位于 `bms`/`autosar` 目录下。
  - 验证为同步轻量检查，异常被吞掉，永远不会中断文件保存流程。

- **单元测试**
  - 新增 `src/core/task/tools/utils/__tests__/BmsAutosarValidationUtils.test.ts`。
  - 覆盖文件命中规则、ARXML 结构校验、C/H 代码规范检查、报告格式化。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run package` 全部通过。
- BMS AUTOSAR 相关单元测试全部通过（35 项）。

---

## 2026-06-19（第六次迭代）

### 优化内容

- **数据驱动的模板渲染引擎**
  - 新增 `src/core/task/tools/handlers/bms-autosar/BmsAutosarTemplateRenderer.ts`。
  - 支持 `${Variable}` 变量替换、`{{#each ports}}...{{/each}}` 循环、`{{#if ports}}...{{/if}}` / `{{#unless ports}}...{{/unless}}` 条件。
  - 循环内可访问 `${name}`、`${direction}`、`${interface_type}`、`${data_type}`、`${event}`、`${period_ms}` 以及 `${$index}` 计数器。
  - 渲染器零依赖，保持 bundle 体积可控。

- **内置模板升级**
  - `assets/bms-autosar/templates.json` 版本升至 `2.0.0`。
  - **SWC**: ARXML 根据用户传入的 `ports` 动态生成 `R-PORT-PROTOTYPE` / `P-PORT-PROTOTYPE`，根据 `runnables` 生成 `RUNNABLE-ENTITY`；C 模板按 runnable 展开实现框架。
  - **BSW module**: ARXML 增加 `BSW-MODULE-DESCRIPTION` / `PROVIDED-ENTRYS`；C 模板包含 `*_Cfg.h` / `*_Lcfg.c` / `*_PBcfg.h` 引用；蓝图额外提示生成三组配置层文件。
  - **RTE interface**: 根据 `interface_type` 生成 `SENDER-RECEIVER-INTERFACE` 或 `CLIENT-SERVER-INTERFACE`。
  - **ARXML descriptor**: 支持根据传入的 `ports` / `runnables` 填充通用 `AR-PACKAGE`。

- **处理器重构**
  - `src/core/task/tools/handlers/BmsAutosarGenerateHandler.ts` 使用新渲染器生成 header / C / ARXML 示例。
  - 为每个 port 预计算 `direction_required`、`direction_provided`、`interface_sr`、`interface_cs` 布尔标记；为每个 runnable 预计算 `event_*` 标记，便于模板做条件分支。
  - 修复模板加载路径，使其在源码、测试和打包后三种布局下都能正确找到 `assets/bms-autosar/templates.json`。

- **单元测试**
  - 新增 `src/core/task/tools/handlers/__tests__/BmsAutosarGenerateHandler.test.ts`。
  - 覆盖模板渲染器（变量、循环、条件、enriched flags）和处理器（SWC 蓝图、BSW 配置层、参数校验）。

### 构建与打包

- `npm run check-types`、`npm run lint`、`npm run package` 全部通过。
- BMS AUTOSAR 专属单元测试全部通过。

---

## 2026-06-17（第五次迭代）

### 新增功能

- **Webview 内操作反馈 Toast**
  - 新增 `BmsKnowledgeManager` 组件，统一管理工具栏入口。
  - 点击“添加 BMS 知识”或删除条目后，在 webview 底部弹出成功/失败 toast，3 秒后自动消失。
  - 避免用户只能依赖 VS Code 右下角通知或控制台日志。

- **BMS 知识库管理入口**
  - 在聊天输入工具栏新增“管理 BMS 知识”按钮（列表图标）。
  - 点击后弹出管理弹窗，列出当前工作区所有知识条目及其更新时间。
  - 每个条目右侧提供删除按钮，点击后从 `<cwd>/.cline/bms-autosar/knowledge.json` 中移除。
  - 后端新增两个 RPC：
    - `listBmsKnowledge(BmsKnowledgeListRequest) returns (BmsKnowledgeList)`
    - `deleteBmsKnowledge(DeleteBmsKnowledgeRequest) returns (String)`
  - 相关文件：
    - `proto/cline/file.proto`
    - `src/core/controller/file/listBmsKnowledge.ts`（新建）
    - `src/core/controller/file/deleteBmsKnowledge.ts`（新建）
    - `webview-ui/src/components/chat/BmsKnowledgeManager.tsx`（新建）
    - `webview-ui/src/components/chat/ChatTextArea.tsx`
    - `src/generated/hosts/vscode/protobus-services.ts`（自动生成）

### 构建与打包

- `npm run package` 类型检查、lint、构建全部通过。
- `npx vsce package --out dist/cline.vsix` 重新打包成功。
- 生成文件：`apps/vscode/dist/cline.vsix`（9.83 MB）。

---

## 2026-06-17（第四次迭代）

### 新增功能

- **Webview 工具栏按钮一键导入 BMS 知识**
  - 在 `ChatTextArea.tsx` 工具栏新增 "Add BMS Knowledge from File" 按钮（书本图标）。
  - 前端通过 `FileServiceClient.addBmsKnowledge(EmptyRequest)` 调用后端 RPC。
  - 后端 handler `src/core/controller/file/addBmsKnowledge.ts`：
    - 使用 `HostProvider.window.showOpenDialogue` 打开文件选择器，支持 `.xlsx`、`.xls`、`.docx`、`.pdf`、`.csv`、`.txt`、`.md`。
    - 使用 `HostProvider.window.showInputBox` 提示输入知识主题。
    - 复用 `extractTextFromFile` 提取文本并自动截断超大内容。
    - 保存/更新到 `<cwd>/.cline/bms-autosar/knowledge.json`。
  - 已在 `proto/cline/file.proto` 新增 `rpc addBmsKnowledge(EmptyRequest) returns (String);` 并重新生成 gRPC 桩代码。
  - 相关修改文件：
    - `src/core/controller/file/addBmsKnowledge.ts`（新建）
    - `webview-ui/src/components/chat/ChatTextArea.tsx`
    - `src/generated/hosts/vscode/protobus-services.ts`（自动注册）
    - `.cline/skills/bms-autosar/SKILL.md`
    - `.claude/skills/bms-autosar/SKILL.md`

### 构建与打包

- `npm run package` 类型检查、lint、构建全部通过。
- `npx vsce package --out dist/cline.vsix` 重新打包成功。
- 生成文件：`apps/vscode/dist/cline.vsix`（9.83 MB）。

---

## 2026-06-17（第三次迭代）

### 新增功能

- **支持从 Excel/Word/PDF 等文件导入知识库**
  - 扩展 `bms_autosar_knowledge` 工具的 `add` 操作，新增 `file_path` 参数。
  - 复用项目已有的 `extractTextFromFile`（`src/integrations/misc/extract-text.ts`）能力，支持格式：
    - `.xlsx`（Excel）
    - `.docx`（Word）
    - `.pdf`（PDF）
    - `.csv`、`.txt`、`.md`、`.ipynb` 等文本类文件
  - 文件路径安全检查：
    - 解析为绝对路径。
    - 必须位于当前工作区内，或位于全局知识库目录 `~/.cline/bms-autosar/`（当 `scope=global`）。
  - 如果同时提供 `content` 和 `file_path`，两者内容会合并存储。
  - 超大文本自动截断（复用 `extractTextFromFile` 内置的 400KB 限制）。
  - 修改文件：
    - `src/core/prompts/system-prompt/tools/bms_autosar_knowledge.ts`
    - `src/core/assistant-message/index.ts`（新增 `file_path` 到 `toolParamNames`）
    - `src/core/task/tools/handlers/BmsAutosarKnowledgeHandler.ts`
  - 更新 Skill 文档 `.cline/skills/bms-autosar/SKILL.md` 与 `.claude/skills/bms-autosar/SKILL.md`，添加文件导入示例。

### 构建与打包

- `npm run package` 类型检查、lint、构建全部通过。
- `npx vsce package --out dist/cline.vsix` 重新打包成功。
- 生成文件：`apps/vscode/dist/cline.vsix`（9.83 MB）。

---

## 2026-06-17（第二次迭代）

### 新增功能

- **用户可自主扩展的 BMS AUTOSAR 知识库**
  - 新增 `bms_autosar_knowledge` 工具，支持四种操作：
    - `add`：向知识库添加/更新条目
    - `list`：列出所有条目主题
    - `get`：按主题检索条目内容
    - `delete`：按主题删除条目
  - 参数包括 `action`、`topic`、`content`、`scope`。
  - 知识库持久化位置：
    - 工作区级别：`<cwd>/.cline/bms-autosar/knowledge.json`
    - 全局级别：`~/.cline/bms-autosar/knowledge.json`
  - 新增工具定义 `src/core/prompts/system-prompt/tools/bms_autosar_knowledge.ts`。
  - 新增工具处理器 `src/core/task/tools/handlers/BmsAutosarKnowledgeHandler.ts`，并导出 `loadBmsAutosarKnowledgeBase` 供生成器使用。
  - 在 `ToolExecutorCoordinator.ts` 与全部 12 个模型变体配置中注册该工具。
  - 在 `src/core/assistant-message/index.ts` 的 `toolParamNames` 中新增 `action`、`scope`、`topic`。

- **`bms_autosar_generate` 自动引用知识库**
  - 修改 `src/core/task/tools/handlers/BmsAutosarGenerateHandler.ts`。
  - 生成蓝图时自动加载工作区与全局知识库条目。
  - 根据 `component_type`、`component_name` 以及 BMS/AUTOSAR 关键词匹配相关知识，追加到蓝图「Relevant Knowledge Base Entries」部分。

- **更新 BMS AUTOSAR Skill**
  - 在 `.cline/skills/bms-autosar/SKILL.md` 与 `.claude/skills/bms-autosar/SKILL.md` 中新增「扩展知识库」章节。
  - 说明如何使用 `bms_autosar_knowledge` 工具以及工作区/全局作用域的区别。

### 构建与打包

- `npm run package` 类型检查、lint、构建全部通过。
- `npx vsce package --out dist/cline.vsix` 重新打包成功。
- 生成文件：`apps/vscode/dist/cline.vsix`（9.83 MB）。

---

## 2026-06-17

### 新增功能

- **BMS AUTOSAR 知识库 Skill**
  - 新增 `.cline/skills/bms-autosar/SKILL.md` 与 `.claude/skills/bms-autosar/SKILL.md`
  - 涵盖 BMS 核心概念、AUTOSAR Classic Platform 架构、SWC/BSW/RTE 设计规范、MISRA C:2012 代码风格、ARXML 描述模板及验证规则。

- **`/bms-autosar` Slash Command**
  - 在 `src/shared/slashCommands.ts`、`src/core/slash-commands/index.ts`、`src/core/prompts/commands.ts` 中注册。
  - 输入 `/bms-autosar` 后自动注入 BMS AUTOSAR 专业知识，并引导模型调用 `bms_autosar_generate` 工具。

- **`bms_autosar_generate` 专用工具**
  - 在 `src/shared/tools.ts` 新增 `BMS_AUTOSAR_GENERATE` 工具枚举。
  - 新增工具定义 `src/core/prompts/system-prompt/tools/bms_autosar_generate.ts`。
  - 新增工具处理器 `src/core/task/tools/handlers/BmsAutosarGenerateHandler.ts`。
  - 在 `ToolExecutorCoordinator.ts` 与全部 12 个模型变体配置中注册该工具。
  - 支持参数：
    - `component_type`: `swc` / `bsw_module` / `rte_interface` / `arxml_descriptor`
    - `component_name`: 组件 SHORT-NAME
    - `ports`: RTE 端口 JSON 数组
    - `runnables`: 可运行实体 JSON 数组
    - `requirements`: 额外需求
    - `output_format`: `c_code` / `arxml` / `both`

- **VS Code 命令面板入口**
  - 新增命令 `Cline: Generate BMS AUTOSAR Code`（`cline.bmsAutosarGenerate`）。
  - 修改文件：`src/registry.ts`、`src/extension.ts`、`apps/vscode/package.json`。

- **内置模板数据文件**
  - `apps/vscode/assets/bms-autosar/templates.json`：SWC、BSW 模块、RTE 接口代码与 ARXML 模板。
  - `apps/vscode/assets/bms-autosar/arxml-patterns.json`：可复用 ARXML 片段。
  - `apps/vscode/assets/bms-autosar/code-style.md`：BMS AUTOSAR C 代码风格指南。

### 构建与打包

- `npm run package` 类型检查、lint、构建全部通过。
- `npx vsce package --out dist/cline.vsix` 重新打包成功。
- 生成文件：`apps/vscode/dist/cline.vsix`（9.83 MB）。

---
