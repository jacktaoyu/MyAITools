# BMS AUTOSAR 智能代码生成器

> 基于 RAG 知识库、MISRA 质量门、ARXML 知识图谱的电池管理系统 AUTOSAR Classic 代码生成 VS Code 插件。

---

## 一、项目简介

BMS（Battery Management System，电池管理系统）是新能源汽车的核心安全软件，AUTOSAR Classic Platform 是行业主流架构。传统开发依赖资深工程师手写 SWC、BSW、RTE、ARXML，周期长、成本高、知识难以复用。

本项目在 Cline VS Code 插件基础上，构建了一套**端到端的 BMS AUTOSAR 智能代码生成工具**：

- 通过**RAG 知识库**复用企业规范、历史项目、ARXML 模型中的领域知识；
- 通过**MISRA C:2012 静态检查 + LLM 自动修复闭环**保证生成代码质量；
- 通过**ARXML 知识图谱**辅助理解系统架构与接口关系；
- 通过**用户自定义模板**让工程师无需改代码即可定制生成规则。

---

## 二、核心功能

### 2.1 智能代码生成

支持 12 种组件类型，覆盖 BMS 全栈：

| 组件类型 | 说明 |
|---------|------|
| `swc` | Application Software Component |
| `bsw_module` | Basic Software Module |
| `rte_interface` | RTE Interface |
| `arxml_descriptor` | ARXML Descriptor |
| `service` | AUTOSAR Service |
| `ecu_extract` | ECU Extract |
| `bms_csc` | Cell Supervision Circuit / AFE |
| `bms_controller` | BMS Controller |
| `bms_balancer` | Cell Balancer / Equalization |
| `bms_thermal_manager` | Thermal Management |
| `bms_charger` | Charge Controller |
| `bms_diagnosis` | Diagnosis / DTC |

生成产物：

- `.h` 头文件
- `.c` 源文件
- `.arxml` ARXML 描述文件
- `_Types.arxml` 数据类型定义
- BSW 模块额外生成 `*_Cfg.h`、`*_Lcfg.c`、`*_PBcfg.c`

支持**单组件生成**和**批量配置生成**（YAML/JSON）。

### 2.2 ASIL 等级感知生成（ISO 26262）

Wizard 与批量配置均支持选择目标 ASIL 等级：

| ASIL 等级 | 说明 |
|---------|------|
| `QM` | 质量管理，无额外安全要求 |
| `ASIL_A` | 最低安全等级 |
| `ASIL_B` | 中低安全等级 |
| `ASIL_C` | 中高安全等级 |
| `ASIL_D` | 最高安全等级 |

根据所选等级，生成器会自动：

- 在检索 query 中注入 `safety`、`asil` 等关键词，优先召回安全相关规范；
- 在 LLM prompt 中附加对应 ASIL 的设计约束（如 ASIL C/D 要求防御性编程、单一出口、范围检查、WdgM 看门狗、E2E 保护、安全监控）；
- 在模板上下文中暴露 `${AsilLevel}` / `${ASIL_LEVEL}` 变量，便于模板按等级输出条件代码片段。

### 2.3 RAG 知识库增强检索

- **Hybrid 检索**：Embedding 余弦相似度 + BM25 词法分，权重可调；
- **领域 Query 扩展**：自动识别 AUTOSAR/BMS 缩写并扩展同义词，例如：
  - CSC → CellSupervisionCircuit / AFE / AnalogFrontEnd
  - SOC → StateOfCharge
  - BMS → BatteryManagementSystem
- **元数据预过滤**：按 `tag` 和 `source file` 过滤知识条目；
- **ARXML 图谱增强**：从源 ARXML 构建 SWC/Port/Interface 图谱，给拓扑邻近条目加权；
- **LLM-as-reranker**：二阶段 LLM 打分重排，兼顾效率与精度。

### 2.4 MISRA C:2012 质量门

内置轻量级 MISRA C:2012 静态检查器，覆盖 12 条常见生成代码违规：

- 禁用 `stdlib.h` / `stdio.h`
- 八进制常量
- 未初始化变量
- 多返回点
- 函数声明缺失
- 隐式类型转换
- 等 12 项

生成代码后自动运行质量门，生成结构化报告，支持一键定位源码。

### 2.5 自动修复闭环

- 单文件/批量自动修复；
- LLM 生成修复后的代码与统一 diff；
- 用户确认后再写盘，避免误改；
- 修复后自动更新质量报告。

### 2.6 ARXML 知识图谱

- 解析 ARXML，提取 SWC、Port、Interface、Data Type、Runnable 等实体；
- 构建节点-边关系网络；
- Webview 交互式力导向图谱可视化；
- 检索阶段利用图谱邻近度提升相关性。

### 2.7 用户自定义模板

- 内置默认模板，开箱即用；
- 支持 workspace / global 两级模板存储；
- 优先级：workspace > global > built-in；
- Wizard 中自动合并内置类型与用户模板；
- 提供模板管理对话框，支持创建、列出、删除。

### 2.8 编译构建集成

在 Chat 工具栏的 **BMS AUTOSAR** 下拉菜单中选择 **Compile**，即可打开编译管理对话框：

- **内置配置**：
  - `Appl: m -j32` — 在 `<workspace>/appl` 目录执行 `m -j32`。
  - `Root: launch.bat → make -j32` — 在 workspace 根目录执行 `launch.bat` 后再执行 `make -j32`。
- **内置配置覆盖**：选中内置 profile 后可点击 **Edit defaults** 修改 name、workflow、工作目录、并发数、命令等，并以 override 形式持久化（不改动源码内置配置）。
- **多步命令**：profile 支持 `commands` 数组，每行一条命令，按顺序在指定工作目录执行；也支持保留单条 `command` 以兼容旧配置。
- **自定义配置**：支持新增、编辑、删除自定义 profile；可覆盖 workflow、工作目录、并发任务数（`-j`）、完整命令。
- **配置持久化**：workspace 配置保存在 `<cwd>/.cline/bms-autosar/compile-profiles.json`，global 配置保存在 `~/.cline/bms-autosar/compile-profiles.json`；合并优先级为 workspace override > global override > built-in。
- **终端执行与状态轮询**：点击 **Run Compile** 后，会在名为 **BMS Build** 的 VS Code 集成终端中执行命令，并在对话框内实时轮询显示终端输出、完成状态与退出码。

---

## 三、安装与运行

### 3.1 环境要求

- VS Code >= 1.84.0
- Node.js >= 22
- Bun 1.3.13（可选，用于 SDK 构建）

### 3.2 安装插件

构建产物已生成：

```bash
apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix
```

在 VS Code 中：

1. 打开 Extensions 视图（`Cmd+Shift+X` / `Ctrl+Shift+X`）；
2. 点击右上角 `...` → **Install from VSIX...**；
3. 选择上述 `.vsix` 文件；
4. 安装后重载窗口。

### 3.3 重新构建（开发用途）

```bash
cd apps/vscode
npm install
npm run package:vsix
```

构建成功后会输出到 `apps/vscode/dist/`。

---

## 四、快速上手

### 4.1 打开 BMS AUTOSAR Wizard

安装插件后，通过以下方式打开生成向导：

- 命令面板：`Cmd+Shift+P` → `BMS AUTOSAR: Generate Component`
- 或点击聊天输入框工具栏的 **BMS** 图标

### 4.2 生成单个组件

1. 选择组件类型，例如 `bms_csc`；
2. 输入组件名，例如 `BmsCellSupervision`；
3. 输入需求描述（可选）；
4. 选择输出格式：`both` / `c_code` / `arxml`；
5. 点击 **Generate**；
6. 查看实时进度条，生成完成后文件自动写入工作区。

### 4.3 批量生成

准备 YAML 配置文件：

```yaml
components:
  - component_name: BmsCellSupervision
    component_type: bms_csc
    requirements: Measure 16 cell voltages and temperatures
  - component_name: BmsStateEstimator
    component_type: swc
    requirements: Estimate SOC and SOH
```

在 Wizard 中选择 **Batch Config** 并导入该 YAML，即可批量生成。

### 4.4 管理知识库

点击聊天输入框的 **BMS Knowledge** 图标：

- **Add from File**：导入单个文件到知识库；
- **Add from Folder**：导入整个文件夹到知识库；
- **Semantic Search**：使用 hybrid 语义检索；
- **Retrieval Settings**：调整 Top K、Hybrid Weight、Score Threshold、LLM Reranker；
- 选择 tag 可预过滤检索范围；
- 支持编辑、删除、导入/导出 JSON。

### 4.5 查看质量报告与自动修复

点击工具栏 **BMS Quality Report** 图标：

- 查看所有生成文件的 MISRA 检查结果；
- 按 error / warning / info 分级；
- 点击文件名打开源码；
- 点击 **Fix** 或 **Fix All** 预览 LLM 自动修复 diff；
- 确认后应用修复并写盘。

### 4.6 查看 ARXML 知识图谱

点击工具栏 **BMS Knowledge Graph** 图标：

- 选择 workspace/global 作用域；
- 选择要解析的 ARXML 文件；
- 查看 SWC、Port、Interface 的交互式关系图。

---

## 五、系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户交互层                            │
│  VS Code 插件 │ Wizard │ 知识库管理器 │ 质量报告 │ ARXML 图谱 │
└────────────────────┬────────────────────────────────────────┘
                     │ gRPC / Protobuf
┌────────────────────▼────────────────────────────────────────┐
│                        任务编排层                            │
│  GenerateHandler │ 进度总线 │ 模板引擎 │ 质量门 │ 自动修复器  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                        智能检索层                            │
│  Embedding │ BM25 │ Query 扩展 │ ARXML 图谱 │ LLM Reranker  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                        知识/质量层                           │
│  BMS 知识库 │ 用户模板 │ MISRA 检查器 │ 质量报告 │ ARXML 图谱 │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、主要技术栈

- **前端**：React + TypeScript + Vite + VS Code Webview UI Toolkit
- **后端**：Node.js + TypeScript + gRPC + Protobuf
- **检索**：OpenAI / Ollama Embedding + BM25 + 自定义领域扩展 + LLM 重排
- **图谱**：ARXML 解析 + 力导向图可视化
- **质量**：MISRA C:2012 规则检查 + LLM 自动修复
- **构建**：esbuild + vsce

---

## 七、测试与验证

```bash
cd apps/vscode
npm run check-types   # TypeScript 类型检查
npm run lint          # 代码规范
npm run test:unit     # 单元测试
npm run package:vsix  # 构建可安装插件
```

当前状态：

- ✅ `check-types` 通过
- ✅ `lint` 通过
- ✅ `test:unit` **1647 项通过**
- ✅ `package:vsix` 成功生成 `.vsix`（9.1 MB）

---

## 八、项目结构（BMS AUTOSAR 相关）

```
apps/vscode/
├── proto/cline/file.proto              # gRPC 接口定义
├── src/core/task/tools/handlers/bms-autosar/
│   ├── BmsAutosarSemanticRetrieval.ts  # Hybrid 语义检索
│   ├── BmsAutosarQueryExpander.ts      # AUTOSAR query 扩展
│   ├── BmsAutosarReranker.ts           # LLM 重排序
│   ├── BmsAutosarKnowledgeGraph.ts     # ARXML 图谱构建
│   ├── BmsAutosarMisraChecker.ts       # MISRA 静态检查
│   ├── BmsAutosarAutoFixer.ts          # LLM 自动修复
│   ├── BmsAutosarTemplateStorage.ts    # 用户模板存储
│   └── BmsAutosarTemplateRenderer.ts   # 模板渲染引擎
├── src/core/controller/file/           # gRPC controller 实现
├── webview-ui/src/components/bms-autosar/  # Webview 面板
│   ├── BmsAutosarWizard.tsx
│   ├── BmsAutosarQualityReportView.tsx
│   ├── BmsAutosarKnowledgeGraphView.tsx
│   └── BmsAutosarTemplateManager.tsx
└── webview-ui/src/components/chat/BmsKnowledgeManager.tsx
```

---

## 九、竞赛亮点

1. **领域专用 RAG**：针对 AUTOSAR/BMS 缩写与概念做 query 扩展，解决通用检索的词汇鸿沟；
2. **ARXML 图谱增强检索**：首次将 ARXML 知识图谱融入代码生成的上下文检索；
3. **LLM 二阶段重排**：在 embedding+BM25 后引入 LLM-as-reranker，兼顾效率与精度；
4. **生成-检查-修复闭环**：MISRA 检查与 LLM 自动修复形成完整质量闭环；
5. **工程可落地**：完整 VS Code 插件形态，可直接安装到工程师日常开发环境。

---

## 十、未来展望

- 引入更多 AUTOSAR 标准规范（如 AUTOSAR CP R22-11）作为结构化知识；
- 增加生成代码的单元测试与仿真验证能力；
- 支持从自然语言需求自动推导端口、runnable 和数据类型；
- 建立 BMS 代码生成 benchmark，量化 RAG 与生成质量提升；
- 探索多 Agent 协作：架构设计 Agent + 代码生成 Agent + 审查 Agent。

---

## 十一、联系方式

如有问题或建议，欢迎通过项目仓库提交 Issue 或 Pull Request。

---

**附：构建产物位置**

```
apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix
```
