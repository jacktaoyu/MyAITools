# BMS AUTOSAR 插件演示脚本

> 演示基板工程：`AUTOSAR-BMS--main`  
> 插件产物：`apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix`  
> 适用说明：演示路径基于示例工程；若使用实际英飞凌芯片工程，只需替换对应文件路径。

---

## 一、环境准备与插件安装

### 1.1 构建 VSIX（如已构建可跳过）

```bash
cd apps/vscode
npm run package:vsix
```

构建完成后产物为：

```
apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix
```

### 1.2 安装插件

1. 打开 VS Code。
2. 左侧 **Extensions** 视图 → 右上角 `...` → **Install from VSIX...**
3. 选择 `apps/vscode/dist/claude-dev-3.89.2-bms-autosar.vsix`。
4. 安装成功后，左侧活动栏出现 Cline/BMS AUTOSAR 入口。

### 1.3 打开演示工程

- `File` → `Open Folder...` → 选择 `AUTOSAR-BMS--main/`。
- 等待 VS Code 索引完成。

---

## 二、打开 BMS AUTOSAR Dashboard

1. 按 `Cmd/Ctrl + Shift + P` 打开命令面板。
2. 输入并选择：

   ```
   Cline: Open BMS AUTOSAR Dashboard
   ```

3. Dashboard 展示三块核心区域：
   - **Quick Actions**：Generator / Knowledge / Compile / Quality Report / Knowledge Graph
   - **Live Metrics**：Quality Errors / Warnings、Knowledge Entries、Compile Profiles
   - **Recent Issues**：当前工程质量报告问题列表

> 展示话术：  
> “这是我们 BMS AUTOSAR 插件的入口 Dashboard。它把生成器、知识库、编译、质量报告、知识图谱统一到了一个视图里。”

---

## 三、打开并加载 ARXML 知识图谱

### 3.1 进入图谱视图

1. 在 Dashboard 点击 **Knowledge Graph**；或命令面板选择：

   ```
   Cline: Open BMS AUTOSAR Knowledge Graph
   ```

2. 顶部左侧下拉框保持 `Workspace`。
3. 点击 **Select ARXML Files**。
4. 选择：

   ```
   AUTOSAR-BMS--main/Arxml/ECU_Composition.arxml
   ```

5. 点击刷新按钮，等待图谱渲染。

> 展示话术：  
> “这里会把 ARXML 里的 SWC、Port、Interface、Runnable、DataType 等 AUTOSAR 元素解析成节点，并自动建立 contains/provides/requires/implements/references/triggers 关系。”

---

## 四、图谱交互演示

### 4.1 组合节点（AR-PACKAGE）

- 注意颜色较淡的矩形 **AR-PACKAGE** 组合节点。
- 普通节点会被自动归入对应的包内。
- 点击包节点，子节点一起高亮。

### 4.2 节点类型过滤

- 顶部第二行是节点类型标签，例如：
  - `COMPOSITION-SW-COMPONENT-TYPE`
  - `APPLICATION-SW-COMPONENT-TYPE`
  - `P-PORT-PROTOTYPE`
  - `R-PORT-PROTOTYPE`
  - `SENDER-RECEIVER-INTERFACE`
  - `RUNNABLE-ENTITY`
  - `AR-PACKAGE`
- 点击标签可隐藏/显示对应类型节点。

### 4.3 关系类型过滤

- 顶部第三行是关系类型标签：
  - `contains`
  - `provides`
  - `requires`
  - `implements`
  - `references`
  - `triggers`
- 点击可单独控制边的显隐。

### 4.4 布局切换

- 顶部下拉框切换布局：
  - **Force (cose)**：基础力导向
  - **Force Bilkent**：适合展示模块聚类
  - **Hierarchical (dagre)**：适合展示层级依赖
  - **Grid / Circle / Concentric / Breadthfirst**：其他视图

### 4.5 搜索节点

- 顶部 `Search nodes...` 输入框。
- 输入 `BMS`、`SOP`、`Cell` 等关键字实时过滤。

### 4.6 双击打开源文件

- 双击任意非 Package 节点。
- VS Code 自动打开对应 ARXML 文件并跳转到元素所在行号。

### 4.7 面包屑导航

- 选中节点后底部显示 `Package / SubPackage / 节点名`。
- 点击包名可聚焦对应 AR-PACKAGE 组合节点。

### 4.8 缩放与导出

- `+` / `-` 缩放，方框图标 `Fit` 自适应。
- **Export PNG**：导出高清图谱图片。
- **Export Mermaid**：把图谱定义复制到剪贴板。

---

## 五、外部数据源联动（本次新增重点）

### 5.1 关联 DBC

1. 点击 **Link DBC**。
2. 选择：

   ```
   AUTOSAR-BMS--main/Test/CANoe/BMS_CAN.dbc
   ```

3. 图谱出现橙色 **CAN-SIGNAL** 节点。
4. 自动按信号名与 ARXML 节点建立黄色 `references` 边。
5. 悬停信号节点，Tooltip 显示：
   - 所属报文
   - 报文 ID
   - 起始位
   - 长度
   - 单位

> ⚠️ 注意：当前 demo 工程的 `BMS_CAN.dbc` 底层解析器只解析出消息、未解析出信号，因此该 demo 可能看不到信号节点。展示时请说明这是 demo DBC 格式问题，实际项目 DBC 会正常出信号。

### 5.2 关联 Excel

1. 点击 **Link Excel**。
2. 选择接口表或参数表：

   ```
   AUTOSAR-BMS--main/Tool/BMS_Interface.xlsx
   AUTOSAR-BMS--main/Tool/BMS_Parameter.xlsx
   ```

3. 图谱出现紫色/浅紫色节点：
   - **EXCEL-INTERFACE**
   - **EXCEL-PARAMETER**
4. 按名称自动与 ARXML 节点连边。

### 5.3 关联 Simulink 数据字典

1. 点击 **Link Simulink**。
2. 选择整个目录或单个 `.m` 文件：

   ```
   AUTOSAR-BMS--main/Model/DD/
   AUTOSAR-BMS--main/Model/DD/data.m
   ```

3. 图谱出现粉色 **SIMULINK-DATA** 节点。
4. 节点来源包括：
   - `Simulink.NumericType`
   - `Simulink.defineIntEnumType`
   - `Simulink.AliasType`
5. 自动与同名 ARXML 数据类型建立 `references` 边。

### 5.4 清除外部数据

- 外部节点加载后，顶部会出现 **Clear** 图标。
- 点击可移除所有外部节点和连边。

> 展示话术：  
> “这样我们就把 ARXML、DBC、Excel、Simulink 四份异构数据串到了一个图里，方便做追溯和一致性检查。”

---

## 六、Dashboard 其他能力（可选展示）

| 功能 | 入口 | 说明 |
| --- | --- | --- |
| **Generator** | Dashboard → `Generator` | 基于模板生成 BMS AUTOSAR 组件、SWC、ARXML 等 |
| **Quality Report** | Dashboard → `Quality Report` | 查看 MISRA、ASIL、命名规范等质量问题 |
| **Compile** | Dashboard → `Compile` | 选择编译 Profile，运行构建 |
| **Knowledge** | Dashboard → `Knowledge` | 导入/管理 BMS 领域知识文档 |

---

## 七、切换到实际英飞凌工程

1. **ARXML**：替换为实际工程中的 `.arxml`，例如：
   - `EcucDescription.arxml`
   - `SoftwareComponents.arxml`
   - `SystemDescription.arxml`
2. **DBC**：替换为实际 CAN 矩阵 `.dbc`。
3. **Excel**：替换为接口表、参数表 `.xlsx`。
4. **Simulink**：替换为 `Model/DD/*.m` 或 `.sldd` 数据字典目录。
5. 如果实际工程没有 AR-PACKAGE 层级，组合节点会自动退化为普通节点，不影响使用。

---

## 八、演示 Q&A（备用）

**Q：双击节点没跳到行？**  
A：确认 ARXML 文件在磁盘上存在且未被移动；首次打开需要一点时间。

**Q：外部节点没有连边？**  
A：自动关联按“节点名称”大小写不敏感精确匹配。如果 DBC 信号名与 ARXML 端口名不一致则不会连边；后续可扩展 fuzzy 匹配。

**Q：布局很乱？**  
A：切换成 `Hierarchical (dagre)` 或点击 `Fit`；Package 多时 `cose-bilkent` 可能需要多等几秒。

**Q：插件激活慢？**  
A：`hnswlib-node` 已改为懒加载，首次激活会稍慢，后续使用正常。
