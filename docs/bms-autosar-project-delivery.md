# BMS AUTOSAR 插件 — 项目交付文档

> **项目**：cline-dev VS Code 扩展 — BMS AUTOSAR 插件扩展  
> **版本**：`claude-dev@3.89.2-bms-autosar`  
> **产物**：`apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix`（约 9.12 MB）  
> **基板工程**：`AUTOSAR-BMS--main/`（演示用；实际工程路径可替换）  
> **交付日期**：2026-06-27

---

## 目录

1. [项目概述](#1-项目概述)
2. [交付功能清单](#2-交付功能清单)
3. [完整技术实现](#3-完整技术实现)
4. [演示指南](#4-演示指南)
5. [演讲逐字稿](#5-演讲逐字稿)
6. [交付物清单](#6-交付物清单)
7. [附录：关键文件索引](#7-附录关键文件索引)

---

## 1. 项目概述

### 1.1 背景

在电池管理系统（BMS）的 AUTOSAR Classic Platform 开发中，团队长期面临以下痛点：

- ARXML 文件体量庞大、层级复杂，人工阅读与维护成本高；
- 软件组件、端口、接口、数据类型、Runnable 之间的关系难以直观理解；
- 代码生成、质量检查、编译构建等环节工具割裂；
- DBC、Simulink、Excel 等外部数据源与 ARXML 之间缺乏统一视图，影响追溯与一致性检查。

### 1.2 目标

在 `cline-dev` VS Code 扩展中新增 BMS AUTOSAR 插件，实现：

- ARXML 解析、缓存、知识图谱可视化；
- DBC / Excel / Simulink 外部数据联动；
- 源文件行号级定位与双向导航；
- 基于知识库的代码生成、质量报告、编译管理。

### 1.3 适用范围

- 演示基板工程：`AUTOSAR-BMS--main/`
- 实际目标工程：英飞凌芯片 BMS 项目（或其他 AUTOSAR Classic Platform 工程）
- 运行环境：VS Code 1.85+，Node.js 23

---

## 2. 交付功能清单

### 2.1 稳定性与激活

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 插件激活事件补齐 | ✅ | `package.json` 增加 `onCommand:cline.bmsAutosarDashboard` 等激活事件 |
| `hnswlib-node` 懒加载 | ✅ | 改为运行时 `import()`，避免扩展激活期原生模块崩溃 |
| BMS Handler / Ollama / RAG 懒加载 | ✅ | 首次使用时才 `import()`，降低激活期负载 |
| UI 事件发送器懒加载 | ✅ | 命令触发时动态 import，减少激活依赖 |
| ToolExecutor 初始化顺序修复 | ✅ | `getApi()` getter 避免构造时 `this.api` 未定义 |
| BMS 模式激活 | ✅ | 输入 `/bms-autosar` 激活，会话内持续保留 BMS 工具 |
| 调试日志增强 | ✅ | Task 主循环、System Prompt、BMS Handler、Embedding 四层日志 |
| 知识缓存大小保护 | ✅ | 超过 10 MB 的模板/知识文件跳过并告警 |

### 2.2 ARXML 知识图谱

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 节点源定位 | ✅ | `ArxmlNode` 新增 `sourceFile` / `line` 字段 |
| 双解析器 | ✅ | XML AST 精确解析 + Regex 兜底解析 |
| 图谱缓存 | ✅ | 内存 LRU + 磁盘缓存，按 `mtimeMs` 失效 |
| 多文件合并 | ✅ | `getBmsAutosarKnowledgeGraph` 支持多个 ARXML 合并 |
| 打开源文件 | ✅ | `openArxmlSource` RPC 跳转到 ARXML 具体行 |

### 2.3 图谱交互增强

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| AR-PACKAGE 节点与 contains 边 | ✅ | 包节点与成员通过 `contains` 边表达层级（已移除 compound parent） |
| 节点类型过滤 | ✅ | 支持所有 AUTOSAR 元素类型 |
| 关系类型过滤 | ✅ | contains / provides / requires / implements / references / triggers |
| Dagre 层次布局 | ✅ | 默认 `Hierarchical (dagre)` 布局；`cose-bilkent` 塌缩时自动 fallback 到 `grid` |
| 双击打开源文件 | ✅ | 双击节点调用 `openArxmlSource` |
| 面包屑导航 | ✅ | 底部显示 packagePath，点击包名聚焦 |
| 搜索过滤 | ✅ | 按名称、路径、ID、类型实时过滤 |
| 导出 | ✅ | PNG 高清导出、Mermaid 定义导出 |

### 2.4 外部数据源联动

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| DBC 解析 | ✅ | `parseBmsAutosarDbc` 复用 `BmsAutosarDbcParser` |
| Excel 解析 | ✅ | `parseBmsAutosarExcel` 使用 `ExcelJS` |
| Simulink 数据字典解析 | ✅ | `parseBmsAutosarSimulinkData` 正则解析 `.m` 文件 |
| 外部节点渲染 | ✅ | 前端渲染 `CAN-SIGNAL` / `EXCEL-INTERFACE` / `EXCEL-PARAMETER` / `SIMULINK-DATA` |
| 自动连边 | ✅ | 按名称大小写不敏感精确匹配建立 `references` 边 |

### 2.5 其他核心能力

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| RAG 知识库 | ✅ | 文档导入、Embedding、HNSW 向量索引、语义检索 |
| 代码生成 Generator | ✅ | 模板 + LLM，支持 Wizard 与批量配置 |
| 质量报告 Quality Report | ✅ | MISRA / AUTOSAR / ASIL 检查 + 抑制注释 + 自动修复 |
| 编译管理 Compile Manager | ✅ | 多 Profile 编译配置与构建 |
| Dashboard | ✅ | 统一入口与实时指标 |

---

## 3. 完整技术实现

### 3.1 整体架构

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

### 3.2 通信协议：ProtoBus

所有前后端通信通过 `apps/vscode/proto/` 下的 Protocol Buffers 定义，经 `npm run protos` 生成 TypeScript 客户端/服务端代码。

主要 proto 文件：

- `proto/cline/file.proto`：文件操作、知识库、知识图谱、质量报告、代码生成、模板管理、外部数据解析。
- `proto/cline/bms_autosar.proto`：编译 Profile 管理。
- `proto/cline/ui.proto`：UI 导航与 Dashboard 订阅。
- `proto/host/window.proto`：宿主窗口操作，近期扩展了 `Selection` 字段用于 ARXML 行号定位。

### 3.3 稳定性与激活机制

`apps/vscode/package.json` 中补充了 BMS AUTOSAR 相关命令的 `activationEvents`：

```json
"onCommand:cline.bmsAutosarDashboard"
"onCommand:cline.bmsAutosarKnowledgeGraph"
"onCommand:cline.bmsAutosarQualityReport"
"onCommand:cline.bmsAutosarGenerate"
"onCommand:cline.bmsAutosar.openCompile"
"onCommand:cline.bmsAutosar.openGenerator"
```

`hnswlib-node` 改为运行时动态 `import()`，避免扩展激活期原生模块加载崩溃：

```ts
async function loadHnswLib(): Promise<{ HierarchicalNSW: typeof HnswClass }> {
    if (!hnswLibPromise) {
        hnswLibPromise = import("hnswlib-node") as Promise<{ HierarchicalNSW: typeof HnswClass }>
    }
    return hnswLibPromise
}
```

### 3.4 RAG 知识库

#### 3.4.1 知识条目类型

`BmsAutosarKnowledgeTypes.ts` 定义了知识条目结构，支持 ARXML、DBC、Excel、PDF、DOCX、Markdown、纯文本等来源。

#### 3.4.2 导入与增量更新

后端 handlers：

- `addBmsKnowledge.ts`：单文件导入。
- `addBmsKnowledgeFolder.ts`：文件夹批量导入。
- `importBmsKnowledgeJson.ts`：从 JSON 批量导入。
- `deleteBmsKnowledge.ts` / `updateBmsKnowledge.ts`：删除与更新。

导入流程：

1. 按文件类型提取文本（`extract-text.ts`），支持按结构/章节/页拆分 `locations`。
2. 对 ARXML 优先按 `AR-PACKAGE` / `SW-COMPONENT-TYPE` 等结构标签 chunking。
3. 记录 `sourceHash`、`mtimeMs`、`size`、`contentHash` 等元数据。
4. `bmsKnowledgeStorage.ts` 按 sourceHash 合并，保留未变更条目，删除已移除源文件对应条目。

#### 3.4.3 Embedding 与向量缓存

- `BmsAutosarEmbeddingService.ts`：统一 embedding 接口，支持多种 provider。
- `BmsAutosarKnowledgeCache.ts`：向量磁盘缓存，`~/.cline/bms-autosar/cache/vectors/<contentHash>.<model>.json`。

#### 3.4.4 HNSW 向量索引

`BmsAutosarVectorIndex.ts` 基于 `hnswlib-node` 实现 cosine 空间 HNSW 索引：

- 索引键为 `entriesHash + embeddingModel`，条目变化时自动失效。
- 索引文件持久化到 `~/.cline/bms-autosar/cache/vector-index/`。
- 条目数 ≥ 64 时优先使用向量索引，O(N) 降到近似 O(log N)。
- `warmBmsAutosarVectorCache()` 在导入完成后后台批量预热。

#### 3.4.5 语义检索与查询意图

`BmsAutosarSemanticRetrieval.ts` 实现 hybrid 检索：

- 结合 embedding 相似度与 BM25 词法匹配。
- `BmsAutosarQueryExpander.ts` 解析意图：`general` / `component_lookup` / `safety_guidance` / `interface_search`。
- 根据意图调整 hybrid weight。
- `BmsAutosarReranker.ts` 对候选结果做最终重排序。

### 3.5 ARXML 知识图谱

#### 3.5.1 解析器

解析器：`src/core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeGraph.ts`

- **XML AST 解析**：`buildArxmlKnowledgeGraphFromXml(content, sourceFile)`。
- **Regex 解析**：`buildArxmlKnowledgeGraphRegex(content, sourceFile)` 作为兜底。

#### 3.5.2 节点数据结构

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

`sourceFile` 和 `line` 用于前端双击节点时定位源文件行号。行号通过 `findLineForShortName` 计算 `<SHORT-NAME>` 位置。

#### 3.5.3 关系类型

- `contains`：AR-PACKAGE 包含子元素
- `provides` / `requires`：端口提供/使用接口
- `implements`：组件实现接口
- `references`：通用引用
- `triggers`：Runnable 触发关系

#### 3.5.4 图谱缓存

`BmsAutosarKnowledgeCache.ts` 实现了 ARXML 图谱的内存 + 磁盘双层缓存：

- 内存：`LRUCache<string, ArxmlGraphCacheEntry>`，128 条目，30 分钟 TTL。
- 磁盘：`~/.cline/bms-autosar/cache/arxml-graph/<hash>.json`。
- 失效策略：基于文件 `mtimeMs` 校验。

#### 3.5.5 打开源文件

新增 `openArxmlSource` RPC：`src/core/controller/file/openArxmlSource.ts`。

通过 `HostProvider.window.showTextDocument` 而非直接 `vscode.*`，保证跨宿主一致性。`Selection` 字段将 1-based 行号转换为 0-based 编辑器坐标。

### 3.6 前端知识图谱渲染

#### 3.6.1 技术栈

- React 18 + TypeScript + Vite
- VS Code Webview UI Toolkit
- Cytoscape.js + `cytoscape-cose-bilkent` + `cytoscape-dagre`
- ProtoBus 生成的 `FileServiceClient`

#### 3.6.2 核心组件

| 组件 | 路径 | 职责 |
| --- | --- | --- |
| `BmsAutosarKnowledgeGraphRenderer` | `webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphRenderer.tsx` | Cytoscape 渲染、交互、外部节点集成 |
| `BmsAutosarKnowledgeGraphView` | `webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphView.tsx` | 视图容器、ARXML 文件选择、刷新 |
| `BmsAutosarDashboard` | `webview-ui/src/components/bms-autosar/BmsAutosarDashboard.tsx` | Dashboard 入口与指标 |

#### 3.6.3 节点样式映射

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

#### 3.6.4 布局算法

提供 7 种布局，默认改为 `dagre`：

1. `dagre`（默认，层次 LR）
2. `cose`
3. `cose-bilkent`
4. `grid`
5. `circle`
6. `concentric`
7. `breadthfirst`

渲染稳定性优化：

- 节点不再使用 Cytoscape compound `parent` 关系，所有节点平铺，包层级通过 `contains` 边表达。
- 节点尺寸/颜色/标签使用 `data(...)` 字符串样式映射。
- 容器遮罩使用 `opacity: 0` + `pointer-events: none` 代替 `visibility: hidden`。
- 布局触发加入 `requestAnimationFrame` 延迟，`layoutstop` 前后调用 `cy.resize()`。
- 若 `boundingBox` 面积 `< 10000` 或宽高 `< 50`，自动 fallback 到 `grid`。

#### 3.6.5 交互功能

- 类型过滤 / 关系过滤。
- 搜索过滤。
- 双击打开源文件。
- 面包屑导航。
- 缩放 / Fit。
- PNG / Mermaid 导出。

### 3.7 外部数据源联动

#### 3.7.1 DBC 解析

- handler：`src/core/controller/file/parseBmsAutosarDbc.ts`
- 复用 `BmsAutosarDbcParser.ts`。
- 输出 `CAN-SIGNAL` 节点，`metadata` 包含 message、messageId、dlc、startBit、length、unit。

#### 3.7.2 Excel 解析

- handler：`src/core/controller/file/parseBmsAutosarExcel.ts`
- 使用 `ExcelJS` 读取 `.xlsx`。
- 文件名含 `parameter` -> `EXCEL-PARAMETER`，否则 -> `EXCEL-INTERFACE`。

#### 3.7.3 Simulink 数据字典解析

- handler：`src/core/controller/file/parseBmsAutosarSimulinkData.ts`
- 正则解析 `.m` 文件中的 `Simulink.NumericType`、`Simulink.defineIntEnumType`、`Simulink.AliasType`。
- 支持单文件或目录批量解析，输出 `SIMULINK-DATA` 节点。

#### 3.7.4 前端集成与自动连边

- `BmsAutosarKnowledgeGraphRenderer.tsx` 新增 `Link DBC` / `Link Excel` / `Link Simulink` 按钮。
- 点击后先调用 `FileServiceClient.selectFiles` 选择文件/目录，再调用对应 parse RPC。
- `autoLinkExternalNodes` 按名称大小写不敏感精确匹配，将外部节点与 ARXML 节点建立最多 3 条 `references` 边。

### 3.8 代码生成 Generator

核心 handler：`src/core/task/tools/handlers/BmsAutosarGenerateHandler.ts`

生成流程：

1. 加载模板（`BmsAutosarTemplateStorage.ts` + `BmsAutosarTemplateRenderer.ts`）。
2. 从知识库检索相关知识（`BmsAutosarSemanticRetrieval.ts`）。
3. 解析需求，推断组件类型、端口、Runnable（`BmsAutosarRequirementParser.ts`）。
4. 渲染模板生成 `.c`、`.h`、`.arxml`、`_Types.arxml`。
5. 应用安全修复（`fixAutosarContent`）。
6. 输出结果并报告进度（`BmsAutosarProgressBus.ts`）。

模板定义：`assets/bms-autosar/templates.json`。`BmsAutosarWizard.tsx` 提供可视化 Wizard 与预设。

### 3.9 质量报告 Quality Gates

`src/core/task/tools/utils/BmsAutosarQualityGates.ts`：

- 调用 `BmsAutosarMisraChecker.ts` 跑 MISRA C 规则检查。
- 调用 `BmsAutosarAsilSafetyChecker.ts` 跑 ASIL 安全分析。
- 检查 ARXML 重复 SHORT-NAME、悬空 TREF 引用。
- 应用抑制注释过滤（`BmsAutosarQualitySuppressions.ts`）。
- 将结果写入 `BmsAutosarQualityReportStore.ts`。

抑制注释支持：

- `// bms-qg-disable-line R21.3`
- `// bms-qg-disable-next-line R21.3`
- `// bms-qg-disable R21.3` / `// bms-qg-enable R21.3`
- `// bms-qg-disable all` / `// bms-qg-enable all`

自动修复：`BmsAutosarAutoFixer.ts` / `autoFixBmsAutosarFile.ts` / `autoFixBmsAutosarFiles.ts` 自动生成修复建议并重新校验。

### 3.10 编译管理 Compile Manager

- `BmsAutosarCompileProfileStorage.ts`：持久化编译 Profile（名称、工具链、源码路径、编译选项等）。
- 前端 `BmsAutosarCompileManager.tsx`：展示 Profile 列表，新建/编辑/删除，点击 Build 调用编译命令并显示日志，错误可跳转源码。

### 3.11 Dashboard 与 UI 基础设施

`BmsAutosarDashboard.tsx`：

- Quick Actions：Generator / Knowledge / Compile / Quality Report / Knowledge Graph。
- Live Metrics：Quality Errors/Warnings、Knowledge Entries、Compile Profiles、Template Count。
- Recent Issues：最近质量报告问题。

`ExtensionStateContext` 管理各视图导航状态，各全屏视图打开时自动关闭其他视图。`useBmsAutosarNotice.tsx` 提供 success / error Toast。`BmsAutosarProgressBus.ts` 提供长时间任务进度事件。

### 3.12 构建与测试结果

```bash
npm run check-types
npm run lint
NODE_OPTIONS=--no-experimental-strip-types npm run test:unit
npm run package:vsix
```

| 检查项 | 结果 |
| --- | --- |
| `check-types` | ✅ 通过 |
| `lint` | ✅ 通过 |
| `test:unit` | ✅ **1716 passing** |
| `package:vsix` | ✅ 成功，产物 9.12 MB（2026-06-27 构建） |

修改 proto 后运行 `npm run protos` 会重新生成所有客户端/服务端桩代码。

### 3.13 已知限制与后续方向

#### 限制

1. DBC 信号解析：底层 parser 对 demo DBC 只解析出消息、未解析出信号。
2. 外部节点匹配：当前为大小写不敏感精确匹配，名称不一致时无法关联。
3. Simulink 解析：基于正则，对复杂 `.m` 脚本支持有限。
4. ARXML 行号定位：通过 `<SHORT-NAME>` 匹配计算行号，同名元素可能定位到第一个出现位置。
5. 图谱性能：超大 ARXML（数万节点）在 Cytoscape 中渲染和布局性能会下降；目前已去掉 compound 节点以提升布局稳定性。

#### 后续方向

- 支持 `.ldf`、`.fibex` 等更多汽车网络描述文件。
- 外部节点匹配策略可配置化（正则、前缀、 fuzzy 相似度）。
- 图谱差异对比：两个版本 ARXML 的增量可视化。
- 基于图谱的代码生成提示：选中节点让 LLM 生成 RTE 调用。
- 把知识图谱结果缓存到向量索引，支持自然语言问答。

---

## 4. 演示指南

### 4.1 环境准备

1. 安装 VSIX：`apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix`
2. Reload Window。
3. `File` → `Open Folder` → 选择 `AUTOSAR-BMS--main/`。

### 4.2 打开 Dashboard

- 命令面板：`Cline: Open BMS AUTOSAR Dashboard`
- 查看 Quick Actions、Live Metrics、Recent Issues。

### 4.3 知识图谱

1. Dashboard 点击 `Knowledge Graph`。
2. `Select ARXML Files` → 选择 `AUTOSAR-BMS--main/Arxml/ECU_Composition.arxml`。
3. 点击刷新，等待渲染。
4. 演示：组合节点、过滤、布局切换、搜索、双击打开源文件、面包屑、导出。

### 4.4 外部数据联动

| 按钮 | 选择文件 | 预期结果 |
| --- | --- | --- |
| Link DBC | `AUTOSAR-BMS--main/Test/CANoe/BMS_CAN.dbc` | 橙色 `CAN-SIGNAL` 节点 |
| Link Excel | `AUTOSAR-BMS--main/Tool/BMS_Interface.xlsx` | 紫色 `EXCEL-INTERFACE` 节点 |
| Link Simulink | `AUTOSAR-BMS--main/Model/DD/` | 粉色 `SIMULINK-DATA` 节点 |

外部节点会按名称与 ARXML 节点自动建立 `references` 边。

### 4.5 其他功能

- Generator：基于知识库生成 SWC / ARXML / C 骨架。
- Quality Report：扫描 ARXML 和 C 代码，列出规范问题。
- Compile Manager：配置芯片工具链 Profile 并运行构建。

---

## 5. 演讲逐字稿

### 第 1 部分：开场（1 分钟）

> 大家好，今天我给大家介绍我们在 Cline 里新增的 **BMS AUTOSAR 插件**。
>
> 我们在做电池管理系统的 AUTOSAR 开发时，经常会遇到几个问题：ARXML 文件太大读不懂；组件、端口、接口、数据类型之间的关系理不清楚；代码生成、质量检查、编译构建来回切换工具；DBC、Simulink、Excel 这些外部数据和 ARXML 对不上号。
>
> 这个插件的目标就是把 ARXML 解析、知识管理、代码生成、质量报告、知识图谱、编译管理统一到一个工作流里，并且把 DBC、Excel、Simulink 也拉进同一张图。

### 第 2 部分：环境准备（1 分钟）

> 首先安装插件。打开扩展面板，选择 Install from VSIX，找到 `apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix`，安装后 Reload Window。
>
> 然后打开示例工程 `AUTOSAR-BMS--main/`。实际工作中换成英飞凌芯片工程目录即可。

### 第 3 部分：Dashboard（2 分钟）

> 命令面板运行 `Cline: Open BMS AUTOSAR Dashboard`。
>
> Dashboard 分为三块：Quick Actions（Generator / Knowledge / Compile / Quality Report / Knowledge Graph）、Live Metrics（Quality Errors/Warnings、Knowledge Entries、Compile Profiles）、Recent Issues。
>
> 设计思路是：先让开发者一眼看到全局，再决定下一步操作。

### 第 4 部分：知识图谱（4 分钟）

> 点击 Knowledge Graph，选择 Workspace，Select ARXML Files，选择 `AUTOSAR-BMS--main/Arxml/ECU_Composition.arxml`，刷新。
>
> 现在大家看到的是 ARXML 里所有 AUTOSAR 元素的可视化。绿色是 SWC，蓝色是 Port，橙色是 Interface，紫色是 Runnable，灰色是 AR-PACKAGE 组合节点。
>
> 点击类型图例可以过滤；点击关系图例可以过滤边；切换布局可以看到不同视角；搜索框可以快速定位；双击节点能直接打开 ARXML 源文件并跳到对应行；底部面包屑可以点击包名聚焦。

### 第 5 部分：外部数据联动（5 分钟）

> 接下来是本次新增重点：把 DBC、Excel、Simulink 挂到同一张图。
>
> 点击 Link DBC，选择 `BMS_CAN.dbc`，出现橙色 CAN-SIGNAL 节点，按信号名自动连边。
>
> 点击 Link Excel，选择 `BMS_Interface.xlsx`，出现紫色 EXCEL-INTERFACE 节点。
>
> 点击 Link Simulink，选择 `Model/DD/` 目录，出现粉色 SIMULINK-DATA 节点。
>
> 现在一张图里同时有 ARXML、DBC、Excel、Simulink 四份数据，方便做追溯和一致性检查。

### 第 6 部分：Generator / Quality / Compile（4 分钟）

> 基于知识库，Generator 可以生成符合 AUTOSAR 规范的 SWC、ARXML 和 C 骨架；Quality Report 可以跑 MISRA 和 AUTOSAR 规范检查；Compile Manager 可以配置英飞凌工具链 Profile 并运行构建。

### 第 7 部分：收尾（1 分钟）

> 总结一下：这个插件解决了 ARXML 可视化、外部数据联动、代码生成、质量检查、编译管理五个方面的问题。今天我们用 `AUTOSAR-BMS--main` 演示，实际英飞凌工程只需替换文件路径。谢谢大家！

---

## 6. 交付物清单

| 交付物 | 路径 | 说明 |
| --- | --- | --- |
| VSIX 插件包 | `apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix` | 可直接安装使用 |
| 项目交付文档 | `docs/bms-autosar-project-delivery.md` | 本文档（含完整技术实现、演示指南、演讲稿） |
| 技术细节总结 | `docs/bms-autosar-technical-summary.md` | 独立完整技术总结 |
| 操作说明 | `docs/bms-autosar-demo-guide.md` | 详细演示步骤 |
| 演讲逐字稿 | `docs/bms-autosar-demo-script.md` | 完整演讲稿 |
| PPT 大纲 | `docs/bms-autosar-demo-slides.pptx` | 11 页演示幻灯片 |
| 变更说明 | `BMS_AUTOSAR_CHANGES.md` | 历次迭代变更日志 |

---

## 7. 附录：关键文件索引

### 7.1 Proto 定义

- `apps/vscode/proto/cline/file.proto`
- `apps/vscode/proto/cline/bms_autosar.proto`
- `apps/vscode/proto/cline/ui.proto`
- `apps/vscode/proto/host/window.proto`

### 7.2 后端解析与 Handler

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

### 7.3 宿主端实现

- `apps/vscode/src/hosts/vscode/hostbridge/window/showTextDocument.ts`

### 7.4 前端组件

- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarDashboard.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphView.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarKnowledgeGraphRenderer.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarWizard.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarQualityReportView.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/BmsAutosarTemplateManager.tsx`
- `apps/vscode/webview-ui/src/components/bms-autosar/useBmsAutosarNotice.tsx`
- `apps/vscode/webview-ui/src/components/chat/BmsAutosarCompileManager.tsx`
- `apps/vscode/webview-ui/src/components/chat/BmsKnowledgeManager.tsx`

### 7.5 生成的客户端

- `apps/vscode/webview-ui/src/services/grpc-client.ts`
- `apps/vscode/src/generated/hosts/vscode/protobus-services.ts`
- `apps/vscode/src/generated/hosts/vscode/protobus-service-types.ts`

---

**文档结束**
