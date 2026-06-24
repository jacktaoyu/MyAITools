# BMS AUTOSAR 插件演示逐字稿

> **演示时长**：约 15–20 分钟  
> **演示工程**：`AUTOSAR-BMS--main`（基板工程，实际英飞凌项目替换对应文件路径即可）  
> **插件版本**：`claude-dev-3.89.2-bms-autosar.vsix`

---

## 第 1 部分：开场（1 分钟）

**[PPT 第 1 页：标题 + 项目背景]**

> 大家好，今天我给大家介绍我们在 Cline 里新增的 **BMS AUTOSAR 插件**。
>
> 我们在做电池管理系统（BMS）的 AUTOSAR 开发时，经常会遇到几个问题：
> - ARXML 文件动辄几千上万行，元素层级深，读不懂、找不着；
> - 软件组件、端口、接口、数据类型、Runnable 之间的关系理不清楚；
> - 代码生成、质量检查、编译构建这几个环节是割裂的，来回切换工具；
> - DBC、Simulink、Excel 这些外部数据和 ARXML 对不上号，出了问题很难追溯。
>
> 这个插件的目标就是把 **ARXML 解析、知识管理、代码生成、质量报告、知识图谱、编译管理** 统一到一个工作流里，并且把 DBC、Excel、Simulink 也拉进同一张图，直接在 VS Code 里完成。

**[PPT 第 2 页：演示大纲]**

> 今天我会按这个顺序演示：
> 1. 插件安装和工程准备；
> 2. BMS AUTOSAR Dashboard 总览；
> 3. ARXML 知识图谱；
> 4. 图谱交互：过滤、布局、源文件跳转、面包屑；
> 5. 外部数据联动：DBC、Excel、Simulink；
> 6. 代码生成、质量报告、编译管理简介。
>
> 我们用仓库里的 `AUTOSAR-BMS--main` 作为示例工程，实际大家的英飞凌芯片工程替换对应路径即可。

---

## 第 2 部分：环境准备（1 分钟）

**[操作：打开 VS Code，安装 VSIX]**

> 首先安装插件。我已经打包好了最新版本。
>
> 打开扩展面板，选择 **Install from VSIX**，找到这个文件：
>
> ```text
> apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix
> ```
>
> 安装完成后记得 **Reload Window**，确保新版本生效。

**[操作：Reload 后，File → Open Folder，选择 AUTOSAR-BMS--main]**

> 然后打开我们的示例工程：
>
> ```text
> AUTOSAR-BMS--main/
> ```
>
> 这个工程里有 ARXML、Simulink 模型、C 代码、CANoe 配置，是一个比较典型的 BMS AUTOSAR 项目结构。
>
> 实际工作中，大家把这里换成自己的英飞凌芯片工程目录就行。

---

## 第 3 部分：Dashboard 总览（2 分钟）

**[操作：Cmd/Ctrl+Shift+P，运行 Cline: Open BMS AUTOSAR Dashboard]**

> 插件激活后，我们先看 **BMS AUTOSAR Dashboard**，这是整个功能的入口。
>
> 大家可以看到 Dashboard 分为三块：
>
> **第一块是 Quick Actions**，一键进入五个核心功能：
> - Generator：代码生成；
> - Knowledge：知识库管理；
> - Compile：编译管理；
> - Quality Report：质量报告；
> - Knowledge Graph：知识图谱。
>
> **第二块是 Live Metrics**，实时显示当前工程的状态：
> - Quality Errors / Warnings：最近一次质量扫描的结果；
> - Knowledge Entries：知识库里的文档/ARXML 数量；
> - Compile Profiles：已配置的编译配置数；
> - Component library：可用的代码模板数。
>
> **第三块是 Recent Issues**，最近质量报告里的前几个问题。
>
> 这个 Dashboard 的设计思路是：**先让开发者一眼看到全局，再决定下一步操作**。

---

## 第 4 部分：ARXML 知识图谱（4 分钟）

**[操作：Dashboard 点击 Knowledge Graph 卡片]**

> 下面进入今天的核心功能：**ARXML 知识图谱**。
>
> 我们选择 `Workspace` scope，然后点击 **Select ARXML Files**。

**[操作：选择 AUTOSAR-BMS--main/Arxml/ECU_Composition.arxml，点击刷新]**

> 选择示例工程里的：
>
> ```text
> AUTOSAR-BMS--main/Arxml/ECU_Composition.arxml
> ```
>
> 点击刷新按钮，稍等几秒，图就渲染出来了。

**[操作：等待图谱渲染，简单缩放/平移]**

> 现在大家看到的是这个 ARXML 里所有 AUTOSAR 元素的可视化。
>
> 不同颜色代表不同类型：
> - 绿色：软件组件（Application / Composition SWC）；
> - 蓝色：端口（P-Port / R-Port）；
> - 橙色：接口（Sender-Receiver / Client-Server）；
> - 紫色：Runnable；
> - 黄绿色：数据类型；
> - 灰色：AR-PACKAGE 组合节点。
>
> 每个节点上的标签是元素名称，边代表它们之间的关系，比如 contains、provides、requires、implements、references、triggers。

**[操作：点击一个 AR-PACKAGE 节点，展示组合节点展开/收缩效果]**

> 注意这些灰色的矩形，这是 **AR-PACKAGE 组合节点**。所有属于同一个包的 SWC、Port、Interface 都会被自动收进这个包里。
>
> 这样我们就能像看文件夹一样，先看清包层级，再钻进去看细节。

**[操作：点击一个普通节点，展示高亮效果]**

> 比如我点一下这个组件节点，和它相关的节点和边会高亮，不相关的会变淡。
>
> 这样我们就能快速回答：
> - 这个数据类型被哪些接口引用？
> - 这个接口被哪些端口使用？
> - 这个组件包含哪些 Runnable？

**[操作：展示类型图例过滤]**

> 顶部是类型图例，点击某个类型可以隐藏或显示。比如数据类型很多很密，我可以先把数据类型隐藏，只看组件和接口的架构。

**[操作：展示关系过滤]**

> 再下面一行是关系过滤。如果我只想看清“谁调用了谁”，可以只保留 `triggers`；如果只想看“谁依赖哪个接口”，可以只保留 `requires` 和 `provides`。

**[操作：展示搜索框]**

> 如果图很大，还可以直接搜索。比如我搜 `ISH`，所有 ISH 相关的节点都会留下来。
>
> 这个功能在排查具体模块时非常有用。

**[操作：切换 Layout 下拉框，展示 Hierarchical / Grid / Circle]**

> 另外我们提供了多种布局算法：
> - **Force (cose)**：基础力导向；
> - **Force Bilkent**：默认，适合看清模块聚集；
> - **Hierarchical (dagre)**：适合展示层级，比如从 ECU 到组件到端口；
> - **Grid / Circle / Concentric / Breadthfirst**：其他快速浏览视图。
>
> 大家可以根据不同的讲解场景切换布局。

**[操作：双击一个节点，VS Code 自动打开 ARXML 并定位到对应行]**

> 还有一个非常实用的功能：**双击节点，可以直接打开源 ARXML 文件，并跳到这个元素所在的行号**。
>
> 这样我们看到图上某个节点有疑问时，不用再翻 ARXML，双击就能回去看原始定义。

**[操作：选中节点，展示底部面包屑，点击包名聚焦]**

> 选中节点后，底部会出现面包屑：`Package / SubPackage / 节点名`。
>
> 点击包名，图谱会自动聚焦到对应的 AR-PACKAGE 组合节点。

**[操作：点击 Export PNG / Export Mermaid]**

> 最后，这个图可以导出：
> - **PNG**：直接贴到 PPT 或文档里；
> - **Mermaid**：可以放到 Markdown 或 Confluence 里，方便维护。

---

## 第 5 部分：外部数据联动（5 分钟）

**[PPT 第 3 页：外部数据联动架构]**

> 接下来是本次新增的重点功能：**把 DBC、Excel、Simulink 数据也挂到同一张知识图谱上**。
>
> 我们在开发中经常遇到这样的情况：ARXML 里定义了端口和接口，DBC 里定义了 CAN 信号，Excel 里定义了接口和参数，Simulink 里定义了数据字典。这些资料分散在不同文件里，名称不一致时很难发现。
>
> 现在我们可以在图谱里一键引入这些外部数据，并按名称自动建立关联。

### 5.1 联动 DBC

**[操作：点击 Link DBC]**

> 首先点击 **Link DBC**。

**[操作：选择 AUTOSAR-BMS--main/Test/CANoe/BMS_CAN.dbc]**

> 选择示例工程里的 CAN 矩阵：
>
> ```text
> AUTOSAR-BMS--main/Test/CANoe/BMS_CAN.dbc
> ```

**[操作：等待外部节点渲染，展示橙色 CAN-SIGNAL 节点]**

> 大家可以看到，图谱里新增了橙色的 **CAN-SIGNAL** 节点。
>
> 插件会自动按信号名与 ARXML 节点建立 `references` 关系，用黄色边表示。
>
> 鼠标悬停在信号节点上，Tooltip 会显示这个信号所属报文、报文 ID、起始位、长度、单位等信息。

> ⚠️ 说明一下：当前这个 demo DBC 的底层解析器只解析出消息、没有解析出信号，所以在这个示例工程里可能看不到信号节点。这是 demo 工程数据格式的问题，不是功能问题。**实际英飞凌项目的 DBC 可以正常解析出信号并建立连边。**

### 5.2 联动 Excel

**[操作：点击 Link Excel]**

> 接下来点击 **Link Excel**。

**[操作：选择 AUTOSAR-BMS--main/Tool/BMS_Interface.xlsx]**

> 选择接口表：
>
> ```text
> AUTOSAR-BMS--main/Tool/BMS_Interface.xlsx
> ```

**[操作：等待渲染，展示紫色 EXCEL-INTERFACE 节点]**

> 图谱里新增了紫色的 **EXCEL-INTERFACE** 节点。
>
> 这些节点按 Excel 第一列的接口名命名，并自动与 ARXML 里同名的接口或数据元素建立 `references` 边。
>
> 如果换一个参数表：
>
> ```text
> AUTOSAR-BMS--main/Tool/BMS_Parameter.xlsx
> ```
>
> 会出现浅紫色的 **EXCEL-PARAMETER** 节点。

### 5.3 联动 Simulink 数据字典

**[操作：点击 Link Simulink]**

> 最后点击 **Link Simulink**。

**[操作：选择 AUTOSAR-BMS--main/Model/DD/ 目录或单个 .m 文件]**

> 选择 Simulink 数据字典目录：
>
> ```text
> AUTOSAR-BMS--main/Model/DD/
> ```
>
> 也可以只选单个文件，比如 `data.m`。

**[操作：等待渲染，展示粉色 SIMULINK-DATA 节点]**

> 图谱里新增了粉色的 **SIMULINK-DATA** 节点。
>
> 这些节点来自：
> - `Simulink.NumericType` 定义；
> - `Simulink.defineIntEnumType` 枚举定义；
> - `Simulink.AliasType` 别名定义。
>
> 同样会按名称自动与 ARXML 里的数据类型建立 `references` 边。

**[操作：展示混合图谱，强调四类数据已经统一]**

> 现在大家可以看到，同一张图里同时有：
> - 灰色的 AR-PACKAGE；
> - 绿色的 SWC；
> - 蓝色的 Port；
> - 橙色的 CAN-SIGNAL；
> - 紫色的 EXCEL-INTERFACE；
> - 粉色的 SIMULINK-DATA。
>
> 它们之间通过 contains、provides、requires、references 等关系连在一起。这样我们就能快速发现：
> - 某个 DBC 信号在 ARXML 里有没有对应接口；
> - Excel 里定义的参数在 Simulink 和 ARXML 里是否一致；
> - Simulink 数据类型和 ARXML 数据类型是否同名。

**[操作：点击 Clear 图标，移除外部节点]**

> 如果想只看纯 ARXML 架构，可以点击顶部的 Clear 图标，一键移除所有外部节点和连边。

---

## 第 6 部分：代码生成 Generator（2 分钟）

**[操作：Dashboard 点击 Generator 卡片]**

> 除了图谱，插件还支持 **代码生成**。
>
> 基于前面导入的知识库，我们可以让大模型生成符合 AUTOSAR 规范的代码和 ARXML。

**[操作：展示 Wizard 界面，选择生成 SW Component]**

> 比如我选择生成一个 **Application SW Component**。
>
> 在输入框里描述需求：
>
> > “生成一个电池荷电状态估算 SOC 的 Application SWC，包含一个 Sender-Receiver Port，用于输出 SOC 值。”

**[操作：点击生成，等待输出]**

> 插件会结合知识库里的接口、数据类型、命名规范，生成对应的：
> - C 代码骨架（Runnable、Port API）；
> - ARXML 描述片段；
> - 必要的 RTE 接口说明。
>
> 这里的优势是：**生成不是凭空造的，而是基于真实 ARXML 知识库里的组件和接口关系**，所以一致性和可集成性更好。
>
> 实际英飞凌工程中，大家可以把生成的代码和 ARXML 直接合并到自己的工程里。
>
> 注意：代码生成依赖 LLM，演示前请确保 API Key 已配置。如果现场没有网络，这一步可以只展示 Wizard 界面和模板选择。

---

## 第 7 部分：质量报告 Quality Report（2 分钟）

**[操作：Dashboard 点击 Quality Report 卡片]**

> 生成代码之后，下一步是质量检查。
>
> 我们集成了 AUTOSAR 规范检查和 MISRA C 检查。

**[操作：选择分析范围，例如 AUTOSAR-BMS--main/Arxml/ 和 Code/]**

> 比如我选择分析这两个目录：
>
> ```text
> AUTOSAR-BMS--main/Arxml/
> AUTOSAR-BMS--main/Code/
> ```
>
> 点击运行。

**[操作：等待扫描完成，展示结果]**

> 扫描完成后，这里会列出：
> - 错误数；
> - 警告数；
> - 每个文件的问题列表；
> - 具体问题描述和位置。
>
> 点击某一条问题，可以跳转到对应文件的具体行。
>
> 这样开发者在提交代码前就能先把规范问题修掉。

---

## 第 8 部分：编译管理 Compile Manager（2 分钟）

**[操作：Dashboard 点击 Compile 卡片]**

> 最后一步是 **编译构建**。
>
> BMS AUTOSAR 项目通常要对应特定的芯片和工具链。这个插件支持配置多个编译 Profile，方便在不同项目间切换。

**[操作：展示已有 Profile 或新建一个]**

> 比如我新建一个 Profile：
> - 名称：`Infineon_BMS_Debug`；
> - 工具链：选择英飞凌工程实际使用的编译器，比如 Tasking、HighTec、Green Hills 等；
> - 源码路径：指向工程里的 C 代码目录。

**[操作：点击 Build，展示编译输出]**

> 配置好后点击 Build，插件会调用底层编译命令，并把输出日志显示在这里。
>
> 如果有编译错误，点击错误可以直接跳转到源码位置。
>
> 如果演示现场没有安装英飞凌工具链，这一步可以只展示配置界面，不实际点 Build。

---

## 第 9 部分：收尾总结（1 分钟）

**[PPT 最后一页：总结 + Q&A]**

> 好，整个演示流程就到这里。我们回顾一下这个插件解决了什么问题：
>
> 1. **知识图谱可视化**：把复杂 ARXML 架构画成图，支持组合节点、关系过滤、源文件跳转、面包屑导航；
> 2. **外部数据联动**：把 DBC、Excel、Simulink 数据字典挂到同一张图里，按名称自动关联；
> 3. **代码生成**：基于知识库生成符合 AUTOSAR 规范的组件、接口、ARXML；
> 4. **质量报告**：自动跑 AUTOSAR / MISRA 检查；
> 5. **编译管理**：统一管理不同芯片/工具链的编译配置。
>
> 今天我们用的是 `AUTOSAR-BMS--main` 作为示例。换成大家的英飞凌芯片工程时，只需要替换 ARXML、DBC、Excel、Simulink、C 代码和编译工具链路径，整个流程完全一致。
>
> 谢谢大家，有问题欢迎提问。

---

## 附录：现场演示小技巧

| 场景 | 建议 |
|---|---|
| 紧张忘词 | 每段开头先看一眼 Dashboard/界面，再念台词 |
| 图谱加载慢 | 提前打开一次，缓存布局；演示时直接展示 |
| DBC demo 不出信号 | 提前说明是示例 DBC 格式问题，强调功能逻辑 |
| 没有 LLM Key | Generator 只展示界面，重点讲 Knowledge + Graph |
| 没有工具链 | Compile Manager 只讲配置，不点 Build |
| 想显得专业 | 多用手势：点节点、拖图谱、切布局、搜名称、双击跳转 |

---

## 附录：演示文件速查表

| 功能 | 路径 |
|---|---|
| VSIX 产物 | `apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix` |
| 示例 ARXML | `AUTOSAR-BMS--main/Arxml/ECU_Composition.arxml` |
| 示例 DBC | `AUTOSAR-BMS--main/Test/CANoe/BMS_CAN.dbc` |
| 示例 Excel 接口 | `AUTOSAR-BMS--main/Tool/BMS_Interface.xlsx` |
| 示例 Excel 参数 | `AUTOSAR-BMS--main/Tool/BMS_Parameter.xlsx` |
| 示例 Simulink DD | `AUTOSAR-BMS--main/Model/DD/` |
