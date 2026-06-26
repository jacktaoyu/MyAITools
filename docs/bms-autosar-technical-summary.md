# BMS AUTOSAR 插件完整技术细节总结

> 本文档覆盖 BMS AUTOSAR 插件的全部主要模块，包括近期新增的知识图谱源定位与外部数据联动，以及此前已实现的代码生成、质量门、RAG 知识库、编译管理等能力。

---

## 1. 插件定位与整体架构

BMS AUTOSAR 插件是 `cline-dev` VS Code 扩展的垂直领域插件，面向电池管理系统（BMS）的 AUTOSAR Classic Platform 开发。它把以下能力集成到 VS Code 单一工作区：

- ARXML 解析、缓存与知识图谱可视化
- DBC / Excel / Simulink 外部数据联动
- 基于知识库的 AUTOSAR 代码生成
- 质量报告（MISRA / AUTOSAR 规范检查 + ASIL 安全分析）
- 编译 Profile 管理
- RAG 知识库（文档导入、Embedding、HNSW 向量索引、语义检索）

### 1.1 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code 宿主                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Webview    │  │   Host       │  │   ProtoBus       │  │
│  │  (React +    │  │  Provider    │  │   gRPC-like      │  │
│  │  Cytoscape)  │  │  (window,    │  │   RPC bridge     │  │
│  │              │  │  fs, etc.)   │  │                  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          └─────────────────┴───────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Controller   │
                    │  (RPC handlers)│
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ ARXML Parser │   │ External     │   │ Knowledge    │
│ + Cache      │   │ Parsers      │   │ Cache /      │
│              │   │ (DBC/Excel/  │   │ Vector Index │
│              │   │  Simulink)   │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Quality      │   │ Generator    │   │ Compile      │
│ Gates        │   │ (Template +  │   │ Manager      │
│              │   │  LLM)        │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

### 1.2 通信协议：ProtoBus

所有前后端通信通过 `apps/vscode/proto/` 下的 Protocol Buffers 定义，经 `npm run protos` 生成 TypeScript 客户端/服务端代码。

主要 proto 文件：

- `proto/cline/file.proto`：文件操作、知识库、知识图谱、质量报告、代码生成、模板管理、外部数据解析。
- `proto/cline/bms_autosar.proto`：编译 Profile 管理。
- `proto/cline/ui.proto`：UI 导航与 Dashboard 订阅。
- `proto/host/window.proto`：宿主窗口操作，近期扩展了 `Selection` 字段用于 ARXML 行号定位。

---

## 2. 稳定性与激活机制

### 2.1 激活事件

`apps/vscode/package.json` 中补充了 BMS AUTOSAR 相关命令的 `activationEvents`：

```json
"onCommand:cline.bmsAutosarDashboard"
"onCommand:cline.bmsAutosarKnowledgeGraph"
"onCommand:cline.bmsAutosarQualityReport"
"onCommand:cline.bmsAutosarGenerate"
"onCommand:cline.bmsAutosar.openCompile"
"onCommand:cline.bmsAutosar.openGenerator"
```

### 2.2 `hnswlib-node` 懒加载

原插件在激活时直接 `import "hnswlib-node"`，该原生模块的加载会导致扩展激活崩溃。修复方式：

- 文件：`apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarVectorIndex.ts`
- 改为运行时动态 `import()`：

```ts
async function loadHnswLib(): Promise<{ HierarchicalNSW: typeof HnswClass }> {
    if (!hnswLibPromise) {
        hnswLibPromise = import("hnswlib-node") as Promise<{ HierarchicalNSW: typeof HnswClass }>
    }
    return hnswLibPromise
}
```

只有在真正使用向量索引时才加载原生依赖，避免激活期崩溃。

---

## 3. RAG 知识库

知识库是插件的底座，为 Generator、Quality Report、Knowledge Graph 等模块提供结构化知识。

### 3.1 知识条目类型

`BmsAutosarKnowledgeTypes.ts` 定义了知识条目结构：

```ts
export interface BmsAutosarKnowledgeEntry {
    id: string
    topic: string
    content: string
    source?: BmsAutosarKnowledgeSource
    contentHash?: string
    embedding?: number[]
    embeddingModel?: string
    locations?: BmsKnowledgeLocation[]
    createdAt: number
    updatedAt: number
}
```

支持的知识来源类型包括：ARXML、DBC、Excel、PDF、DOCX、Markdown、纯文本等。

### 3.2 导入与增量更新

后端 handlers：

- `addBmsKnowledge.ts`：单文件导入。
- `addBmsKnowledgeFolder.ts`：文件夹批量导入。
- `importBmsKnowledgeJson.ts`：从 JSON 批量导入。
- `deleteBmsKnowledge.ts` / `updateBmsKnowledge.ts`：删除与更新。

导入流程：

1. 按文件类型提取文本（`extract-text.ts`），支持按结构/章节/页拆分 `locations`。
2. 对 ARXML 优先按 `AR-PACKAGE` / `SW-COMPONENT-TYPE` 等结构标签 chunking。
3. 记录 `sourceHash`、`mtimeMs`、`size`、`contentHash` 等元数据。
4. `bmsKnowledgeStorage.ts` 的 `saveBmsKnowledgeEntries` 按 sourceHash 合并，保留未变更条目，删除已移除源文件对应条目，返回新增/更新/移除/未变统计。

### 3.3 Embedding 服务

`BmsAutosarEmbeddingService.ts` 提供：

- 统一的 `createEmbedding()` 接口，支持多种 embedding provider。
- 向量维度与模型一致性校验。
- 批量 embedding 能力。

### 3.4 向量缓存

`BmsAutosarKnowledgeCache.ts` 实现 `loadVectorCached` / `saveVectorCached`：

- 磁盘缓存目录：`~/.cline/bms-autosar/cache/vectors/<contentHash>.<model>.json`
- `BmsAutosarSemanticRetrieval.ts` 优先走向量缓存，缺失时批量 embedding 并写入缓存。
- 旧 `knowledge.json` 内嵌 embedding 可自动迁移到独立向量缓存。

### 3.5 HNSW 向量索引

`BmsAutosarVectorIndex.ts` 基于 `hnswlib-node` 实现 cosine 空间 HNSW 索引：

- 索引键为 `entriesHash + embeddingModel`，知识条目变化时自动失效。
- 索引文件持久化到 `~/.cline/bms-autosar/cache/vector-index/`。
- `BmsAutosarSemanticRetrieval.ts` 在条目数 ≥ 64 时优先使用向量索引，将 embedding 检索从 O(N) 降到近似 O(log N)；索引不可用时自动退化到线性扫描。
- `warmBmsAutosarVectorCache()` 在导入完成后后台批量预热向量索引。

### 3.6 语义检索与重排序

`BmsAutosarSemanticRetrieval.ts` 实现 hybrid 检索：

- 结合 embedding 相似度与 BM25 词法匹配。
- 支持按查询意图调整 hybrid weight。
- `BmsAutosarReranker.ts` 对候选结果做最终重排序。
- `BmsAutosarQueryExpander.ts` 解析查询意图：
  - `general`
  - `component_lookup`
  - `safety_guidance`
  - `interface_search`

### 3.7 查询意图与权重

`BmsAutosarQueryExpander.ts` 的 `parseAutosarIntent()` 根据关键词判断意图，`BmsAutosarSemanticRetrieval.ts` 据此调整权重：

- `component_lookup`：偏重 embedding（0.85）
- `interface_search`：平衡（0.75）
- `safety_guidance`：偏重 BM25（0.65）

---

## 4. ARXML 知识图谱

### 4.1 解析器

解析器：`src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeGraph.ts`

提供两种实现：

- **XML AST 解析**：`buildArxmlKnowledgeGraphFromXml(content, sourceFile)`，基于 XML 结构精确遍历。
- **Regex 解析**：`buildArxmlKnowledgeGraphRegex(content, sourceFile)`，作为 XML 解析不可用时的兜底。

### 4.2 节点数据结构

```ts
export interface ArxmlNode {
    id: string
    type: ArxmlNodeType
    name: string
    path: string
    packagePath: string
    sourceFile: string
    line: number
}
```

`sourceFile` 和 `line` 用于前端双击节点时定位源文件行号。行号通过 `findLineForShortName(content, shortName)` 在 ARXML 内容中查找 `<SHORT-NAME>` 位置计算。

### 4.3 关系类型

图谱边 `ArxmlEdge` 的 `relation` 包括：

- `contains`：AR-PACKAGE 包含子元素
- `provides` / `requires`：端口提供/使用接口
- `implements`：组件实现接口
- `references`：通用引用
- `triggers`：Runnable 触发关系

### 4.4 图谱缓存

`BmsAutosarKnowledgeCache.ts` 实现了 ARXML 图谱的内存 + 磁盘双层缓存：

- 内存缓存：`LRUCache<string, ArxmlGraphCacheEntry>`，容量 128，TTL 30 分钟。
- 磁盘缓存：`~/.cline/bms-autosar/cache/arxml-graph/<hash>.json`。
- 缓存键基于文件路径哈希，有效性通过文件 `mtimeMs` 校验。

在 `getBmsAutosarKnowledgeGraph` 中：

```ts
let graph = await loadArxmlGraphCached(filePath)
if (!graph) {
    const content = await fs.readFile(filePath, "utf-8")
    graph = buildArxmlKnowledgeGraph(content, filePath)
    await saveArxmlGraphCached(filePath, stat.mtimeMs, graph)
}
```

### 4.5 打开源文件

新增 `openArxmlSource` RPC：`src/core/controller/file/openArxmlSource.ts`。

通过 `HostProvider.window.showTextDocument` 而非直接 `vscode.*`，保证跨宿主一致性。`Selection` 字段将 1-based 行号转换为 0-based 编辑器坐标。

---

## 5. 前端知识图谱渲染

### 5.1 技术栈

- React 18 + TypeScript + Vite
- VS Code Webview UI Toolkit
- Cytoscape.js + `cytoscape-cose-bilkent` + `cytoscape-dagre`
- ProtoBus 生成的 `FileServiceClient`

### 5.2 核心组件

| 组件 | 路径 | 职责 |
| --- | --- | --- |
| `BmsAutosarKnowledgeGraphRenderer` | `webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphRenderer.tsx` | Cytoscape 渲染、交互、外部节点集成 |
| `BmsAutosarKnowledgeGraphView` | `webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphView.tsx` | 视图容器、ARXML 文件选择、刷新 |
| `BmsAutosarDashboard` | `webview-ui/src/components/bms-autosar/BmsAutosarDashboard.tsx` | Dashboard 入口与指标 |

### 5.3 节点与布局

#### 节点样式映射

| 类型 | 颜色 | 半径 |
| --- | --- | --- |
| `APPLICATION-SW-COMPONENT-TYPE` | 绿色 `#4EC9B0` | 22 |
| `COMPOSITION-SW-COMPONENT-TYPE` | 绿色 `#4EC9B0` | 26 |
| `P-PORT-PROTOTYPE` / `R-PORT-PROTOTYPE` | 蓝色 `#9CDCFE` | 12 |
| `SENDER-RECEIVER-INTERFACE` / `CLIENT-SERVER-INTERFACE` | 橙色 `#CE9178` | 16 |
| `RUNNABLE-ENTITY` | 紫色 `#C586C0` | 13 |
| `AR-PACKAGE` | 灰色 `#808080` | 20 |
| `CAN-SIGNAL` | 橙色 `#FFA500` | 11 |
| `EXCEL-INTERFACE` | 紫色 `#9C89B8` | 11 |
| `EXCEL-PARAMETER` | 浅紫 `#B28DFF` | 11 |
| `SIMULINK-DATA` | 粉色 `#FF69B4` | 11 |

### 5.4 布局算法

提供 7 种布局，默认改为 `dagre`：

1. `dagre`（默认，层次 LR，适合 AUTOSAR 包 → 组件 → 端口层级）
2. `cose`
3. `cose-bilkent`
4. `grid`
5. `circle`
6. `concentric`
7. `breadthfirst`

渲染实现要点：

- 节点不再使用 Cytoscape compound `parent` 关系，所有节点平铺，包层级通过 `contains` 边表达。
- 节点尺寸、颜色、标签使用 `data(size)` / `data(color)` / `data(label)` 字符串样式映射，避免函数映射在 layout 阶段拿不到尺寸。
- 容器遮罩使用 `opacity: 0` + `pointer-events: none` 代替 `visibility: hidden`，保证 Cytoscape 能读取容器尺寸。
- 布局在 `requestAnimationFrame` 后触发，`layoutstop` 前后调用 `cy.resize()`。
- 若布局结果 `boundingBox` 面积 `< 10000` 或宽高 `< 50`，自动 fallback 到 `grid` 重新布局。

### 5.5 交互功能

- 类型过滤 / 关系过滤。
- 搜索过滤。
- 双击打开源文件。
- 面包屑导航。
- 缩放 / Fit。
- PNG / Mermaid 导出。

---

## 6. 外部数据源联动

### 6.1 DBC 解析

- handler：`src/core/controller/file/parseBmsAutosarDbc.ts`
- 复用 `BmsAutosarDbcParser.ts`。
- 输出 `CAN-SIGNAL` 节点，`metadata` 包含 message、messageId、dlc、startBit、length、unit。

### 6.2 Excel 解析

- handler：`src/core/controller/file/parseBmsAutosarExcel.ts`
- 使用 `ExcelJS` 读取 `.xlsx`。
- 文件名含 `parameter` -> `EXCEL-PARAMETER`，否则 -> `EXCEL-INTERFACE`。
- 默认第一行为表头，第一列为名称，第二列为描述。

### 6.3 Simulink 数据字典解析

- handler：`src/core/controller/file/parseBmsAutosarSimulinkData.ts`
- 正则解析 `.m` 文件：
  - `Simulink.NumericType` 别名
  - `Simulink.defineIntEnumType` 枚举
  - `Simulink.AliasType` 别名
- 支持单文件或目录批量解析，输出 `SIMULINK-DATA` 节点。

### 6.4 前端集成与自动连边

- `BmsAutosarKnowledgeGraphRenderer.tsx` 新增 `Link DBC` / `Link Excel` / `Link Simulink` 按钮。
- 点击后先调用 `FileServiceClient.selectFiles` 选择文件/目录，再调用对应 parse RPC。
- 解析结果追加到 `externalNodes` / `externalEdges` 状态。
- `autoLinkExternalNodes` 按名称大小写不敏感精确匹配，将外部节点与 ARXML 节点建立最多 3 条 `references` 边。

---

## 7. 代码生成 Generator

### 7.1 架构

核心 handler：`src/core/task/tools/handlers/BmsAutosarGenerateHandler.ts`

生成流程：

1. 加载模板（`BmsAutosarTemplateStorage.ts` + `BmsAutosarTemplateRenderer.ts`）。
2. 从知识库检索相关知识（`BmsAutosarSemanticRetrieval.ts`）。
3. 解析需求，推断组件类型、端口、Runnable（`BmsAutosarRequirementParser.ts`）。
4. 渲染模板生成 `.c`、`.h`、`.arxml`、`_Types.arxml`。
5. 应用安全修复（`fixAutosarContent`）。
6. 输出结果并报告进度（`BmsAutosarProgressBus.ts`）。

### 7.2 模板系统

- 模板定义：`assets/bms-autosar/templates.json`
- 渲染器：`BmsAutosarTemplateRenderer.ts`
- 支持 Mustache-like 占位符，根据 `BmsAutosarTemplateContext` 渲染。
- 模板类型包括：SWC、Composition、Interface、DataType、Runnable 等。

### 7.3 需求解析

`BmsAutosarRequirementParser.ts`：

- 从自然语言需求中提取组件类型。
- 推断端口列表（Sender/Receiver、Client/Server）。
- 推断 Runnable 周期（10ms / 100ms / 1s 等）。

### 7.4 向导界面

`BmsAutosarWizard.tsx` + `BmsAutosarWizard.presets.ts`：

- 提供可视化 Wizard，选择组件类型、端口、Runnable、ASIL 等级。
- 内置多个预设，覆盖常见 BMS 组件（状态估计、功率限制、绝缘监测、电流传感器等）。

### 7.5 批量生成

`BmsAutosarGenerateHandler.ts` 支持通过 YAML/JSON 配置文件批量生成多个组件。

---

## 8. 质量报告 Quality Gates

### 8.1 质量门核心

`src/core/task/tools/utils/BmsAutosarQualityGates.ts`：

- 调用 `BmsAutosarMisraChecker.ts` 跑 MISRA C 规则检查。
- 调用 `BmsAutosarAsilSafetyChecker.ts` 跑 ASIL 安全分析。
- 调用 `validateArxmlEnhanced` 检查 ARXML 重复 SHORT-NAME、悬空 TREF 引用等。
- 应用抑制注释过滤（`BmsAutosarQualitySuppressions.ts`）。
- 将结果写入 `BmsAutosarQualityReportStore.ts`。

### 8.2 MISRA 检查

`BmsAutosarMisraChecker.ts`：

- 基于正则与简单 AST 检查常见 MISRA C 违规。
- 覆盖规则：R21.3、R17.7、R11.3、R10.1 等。
- 输出 `MisraIssue` 列表，含 rule、line、message、severity。

### 8.3 ASIL 安全分析

`BmsAutosarAsilSafetyChecker.ts` + `BmsAutosarAsil.ts`：

- 推断 ASIL 等级（QM / A / B / C / D）。
- 检查安全相关函数、变量、端口是否符合 ASIL 设计约束。
- 提供 `getAsilDesignGuidelines()` 生成对应 ASIL 的设计建议。

### 8.4 抑制注释

`BmsAutosarQualitySuppressions.ts` 支持：

- `// bms-qg-disable-line R21.3`
- `// bms-qg-disable-next-line R21.3`
- `// bms-qg-disable R21.3` / `// bms-qg-enable R21.3`
- `// bms-qg-disable all` / `// bms-qg-enable all`

规则 ID 大小写不敏感，支持逗号分隔多个规则。

### 8.5 自动修复

`BmsAutosarAutoFixer.ts` / `autoFixBmsAutosarFile.ts` / `autoFixBmsAutosarFiles.ts`：

- 对质量报告中的部分 issue 自动生成修复建议。
- 修复后重新运行 `runBmsAutosarQualityGates()` 返回残余问题，形成闭环。
- `fixAutosarContent` 提供安全的通用修复：去除 trailing whitespace、统一换行、补头文件 include guard 等。

### 8.6 质量报告存储

`BmsAutosarQualityReportStore.ts`：

- 将质量报告持久化到工作区或全局存储。
- 支持按文件、按 category、按 severity 查询。

---

## 9. 编译管理 Compile Manager

### 9.1 编译 Profile 存储

`BmsAutosarCompileProfileStorage.ts`：

- 持久化编译 Profile（名称、工具链、源码路径、编译选项等）。
- 支持增删改查与 lastSelectedId 记录。

### 9.2 编译执行

后端 handler 通过 `BmsAutosarServiceClient.listBmsAutosarCompileProfiles` 等 RPC 暴露。

前端 `BmsAutosarCompileManager.tsx`：

- 展示 Profile 列表。
- 支持新建、编辑、删除 Profile。
- 点击 Build 调用底层编译命令，显示输出日志。
- 错误输出可点击跳转源码。

---

## 10. Dashboard 与 UI 基础设施

### 10.1 Dashboard

`BmsAutosarDashboard.tsx`：

- 一站式入口，展示 Quick Actions、Live Metrics、Recent Issues。
- Quick Actions：Generator / Knowledge / Compile / Quality Report / Knowledge Graph。
- Live Metrics：Quality Errors/Warnings、Knowledge Entries、Compile Profiles、Template Count。
- 通过 `subscribeToBmsAutosarDashboard` gRPC 流从扩展命令打开。

### 10.2 导航与状态

`ExtensionStateContext` 管理：

- `showBmsAutosarDashboard`
- `navigateToBmsAutosarWizard`
- `navigateToBmsAutosarQualityReport`
- `navigateToBmsAutosarKnowledgeGraph`

各全屏视图打开时自动关闭其他视图。

### 10.3 Toast 通知

`useBmsAutosarNotice.tsx`：

- 提供 success / error 两种类型的底部浮层提示。
- 替换原生 `alert`，提升 Webview 内体验。

### 10.4 进度总线

`BmsAutosarProgressBus.ts`：

- 为长时间运行任务（生成、质量扫描、编译）提供进度事件。
- 前端可订阅进度并展示进度条。

---

## 11. 构建与测试结果

### 11.1 关键命令

```bash
npm run check-types   # 全量 TypeScript 检查
npm run lint          # Biome 代码检查 + proto lint
npm run test:unit     # 单元测试
npm run package:vsix  # 打包 VSIX
```

### 11.2 当前验证结果

| 检查项 | 结果 |
| --- | --- |
| `check-types` | ✅ 通过 |
| `lint` | ✅ 通过 |
| `test:unit` | ✅ **1716 passing** |
| `package:vsix` | ✅ 成功，产物 9.12 MB |

### 11.3 Proto 生成

修改 proto 后运行：

```bash
npm run protos
```

会重新生成：

- `src/shared/proto/`
- `src/generated/hosts/vscode/protobus-services.ts`
- `src/generated/hosts/vscode/protobus-service-types.ts`
- `webview-ui/src/services/grpc-client.ts`
- 其他 Host Bridge 相关文件

---

## 12. 已知限制与后续方向

### 12.1 当前限制

1. **DBC 信号解析**：底层 `BmsAutosarDbcParser` 对当前 demo DBC 只解析出消息、未解析出信号，需要增强 DBC 语法覆盖。
2. **外部节点名称匹配**：目前为大小写不敏感精确匹配，名称不一致时无法关联；可引入 fuzzy / 同义词 / 规则映射。
3. **Simulink 解析**：基于正则，对复杂 `.m` 脚本或数据字典对象支持有限，标注为实验性。
4. **ARXML 行号定位**：通过 `<SHORT-NAME>` 匹配计算行号，若 ARXML 存在同名元素可能定位到第一个出现位置。
5. **图谱性能**：超大 ARXML（数万节点）在 Cytoscape 中渲染和布局性能会下降，后续可引入虚拟化或分层加载。

### 12.2 可扩展方向

- 支持 `.ldf`（LIN）、`.fibex`、AUTOSAR `.arxml` 变种。
- 外部节点匹配策略可配置：正则、前缀、 fuzzy 相似度。
- 图谱支持差异对比（两个版本的 ARXML 对比）。
- 基于图谱的代码生成提示：直接选中节点让 LLM 生成对应 RTE 调用。
- 把知识图谱结果缓存到向量索引，支持自然语言问答。

---

## 13. 关键文件索引

### 13.1 Proto 定义

- `apps/vscode/proto/cline/file.proto`
- `apps/vscode/proto/cline/bms_autosar.proto`
- `apps/vscode/proto/cline/ui.proto`
- `apps/vscode/proto/host/window.proto`

### 13.2 后端解析与 Handler

- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeGraph.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeCache.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarDbcParser.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarEmbeddingService.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarVectorIndex.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarSemanticRetrieval.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarQueryExpander.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarReranker.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarRequirementParser.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarTemplateRenderer.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarTemplateStorage.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarMisraChecker.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarAsilSafetyChecker.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarAutoFixer.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarQualityReportStore.ts`
- `apps/vscode/src/core/task/tools/handlers/bms-autosar/BmsAutosarProgressBus.ts`
- `apps/vscode/src/core/task/tools/utils/BmsAutosarQualityGates.ts`
- `apps/vscode/src/core/task/tools/utils/BmsAutosarQualitySuppressions.ts`
- `apps/vscode/src/core/task/tools/utils/BmsAutosarValidationUtils.ts`
- `apps/vscode/src/core/task/tools/handlers/BmsAutosarGenerateHandler.ts`
- `apps/vscode/src/core/controller/file/getBmsAutosarKnowledgeGraph.ts`
- `apps/vscode/src/core/controller/file/openArxmlSource.ts`
- `apps/vscode/src/core/controller/file/parseBmsAutosarDbc.ts`
- `apps/vscode/src/core/controller/file/parseBmsAutosarExcel.ts`
- `apps/vscode/src/core/controller/file/parseBmsAutosarSimulinkData.ts`
- `apps/vscode/src/core/controller/file/getBmsAutosarQualityReport.ts`
- `apps/vscode/src/core/controller/file/autoFixBmsAutosarFile.ts`
- `apps/vscode/src/core/controller/file/autoFixBmsAutosarFiles.ts`
- `apps/vscode/src/core/controller/file/addBmsKnowledge.ts`
- `apps/vscode/src/core/controller/file/searchBmsKnowledge.ts`

### 13.3 宿主端实现

- `apps/vscode/src/hosts/vscode/hostbridge/window/showTextDocument.ts`

### 13.4 前端组件

- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarDashboard.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphView.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphRenderer.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarWizard.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarQualityReportView.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarTemplateManager.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/useBmsAutosarNotice.tsx`
- `apps/vscode/webview-ui/src/components/chat/BmsAutosarCompileManager.tsx`
- `apps/vscode/webview-ui/src/components/chat/BmsKnowledgeManager.tsx`

### 13.5 生成的客户端

- `apps/vscode/webview-ui/src/services/grpc-client.ts`
- `apps/vscode/src/generated/hosts/vscode/protobus-services.ts`
- `apps/vscode/src/generated/hosts/vscode/protobus-service-types.ts`

---

## 14. 2026-06-27 运行时稳定性修复

### 14.1 ToolExecutor 初始化顺序崩溃

- 现象：修改版 BMS 插件在模型输出后长时间卡在 "Thinking..."，同一模型下原版 Cline 流畅。
- 根因：`ToolExecutor` 在 `Task` 构造函数中创建时，`this.api` 尚未初始化（`initializeApi()` 在构造后才调用），导致 UI flush 阶段调用 `this.api.getModel()` 抛出 `TypeError: Cannot read properties of undefined (reading 'getModel')`。
- 修复：`ToolExecutor` 构造函数改为接收 `getApi: () => ApiHandler` getter；`asToolConfig()`、`isParallelToolCallingEnabled()`、`applyLatestBrowserSettings()`、`executeTool()` 的 hook model 上下文均改为 `this.getApi()`，使用时再动态获取已初始化的 API handler。
- 影响文件：`src/core/task/ToolExecutor.ts`、`src/core/task/index.ts`。

### 14.2 ARXML 知识图谱布局塌缩

- 现象：知识图谱渲染后所有节点/边压成底部一小团。
- 根因：Cytoscape `cose-bilkent` 对 `AR-PACKAGE` compound 父节点（嵌套包套子包）处理异常，所有节点坐标被算到原点。
- 修复：
  - 去掉 Cytoscape compound `parent` 关系，所有节点平铺，包层级通过 `contains` 边表达。
  - 默认布局从 `cose-bilkent` 改为 `dagre`（层次 LR）。
  - 布局结束后计算 `boundingBox`，若面积 `< 10000` 或宽高 `< 50` 自动 fallback 到 `grid`。
  - 节点样式从函数回调改为 `data(...)` 字符串映射。
  - 容器遮罩从 `visibility: hidden` 改为 `opacity: 0` + `pointer-events: none`。
  - 布局触发加入 `requestAnimationFrame` 延迟，并在 `layoutstop` 前后调用 `cy.resize()`。
- 影响文件：`webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphRenderer.tsx`、`webview-ui/vite.config.ts`。

### 14.3 懒加载深化

- `ToolExecutorCoordinator` 中 BMS Handler 改为懒加载包装类。
- `BmsAutosarEmbeddingService` 中 `Ollama` 改为运行时动态 `import()`。
- `searchBmsKnowledge`、`addBmsKnowledge`、`addBmsKnowledgeFolder`、`autoFixBmsAutosarFile`、`autoFixBmsAutosarFiles` 均在运行时动态 import 检索/修复相关重模块。
- `extension.ts` 中 BMS UI 事件发送器改为命令触发时动态 import。
- `vite.config.ts` 将知识图谱渲染器拆分为独立 `knowledgeGraph` chunk，按需加载 cytoscape / dagre / cose-bilkent。

### 14.4 BMS 工具按需注入与模式激活

- `bms_autosar_generate` / `bms_autosar_knowledge` 工具描述新增 `contextRequirements: (context) => context.bmsAutosarEnabled === true`。
- `SystemPromptContext` 新增 `bmsAutosarEnabled`，`TaskState` 新增 `bmsAutosarMode`。
- `Task.initiateTaskLoop()` 检测用户输入包含 `/bms-autosar` 时激活 BMS 模式，整个任务会话内保留 BMS 工具注入。

### 14.5 调试与可观测性

- `Task` 主循环：请求前输出 provider/model/bmsMode/apiHistoryMessages；流式循环内每秒输出 chunk 统计；`onFlushError` 输出完整堆栈。
- `getSystemPrompt()`：输出 prompt 长度、BMS 模式开关、BMS 工具注入情况、native tools 数量。
- `BmsAutosarGenerateHandler` / `BmsAutosarKnowledgeHandler`：输出调用参数与完成/错误状态。
- `BmsAutosarEmbeddingService`：输出 embedding 调用长度/数量、模型、耗时、成功/失败。

### 14.6 知识缓存文件大小保护

- `BmsAutosarKnowledgeCache.ts` 的 `loadTemplatesCached` / `loadKnowledgeSourceCached` 增加 `MAX_KNOWLEDGE_FILE_SIZE_BYTES = 10 MB` 上限，超大文件跳过并记录警告，防止异常大文件导致内存/解析问题。

### 14.7 构建验证（2026-06-27）

| 检查项 | 结果 |
| --- | --- |
| `check-types` | ✅ 通过 |
| `lint` / `lint:proto` | ✅ 通过 |
| `test:unit` | ✅ **1716 passing** |
| `package:vsix` | ✅ 成功，产物 9.12 MB |

