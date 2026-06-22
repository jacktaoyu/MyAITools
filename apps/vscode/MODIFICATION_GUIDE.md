# Cline VS Code 扩展修改与测试指南

本指南介绍如何修改 `apps/vscode/` 目录下的 Cline VS Code 扩展源码，并在本地测试、打包与安装。

> 本扩展在仓库根目录的 workspace 中被标记为 `!apps/vscode`，因此**可以独立开发和构建**，不需要依赖根目录的 `bun` workspace。

---

## 1. 项目结构

```
apps/vscode/
├── src/                          # 扩展主代码（Node.js / VS Code API）
│   ├── extension.ts              # 扩展入口：activate / deactivate
│   ├── common.ts                 # 跨平台通用初始化
│   ├── core/                     # 核心业务逻辑
│   │   ├── controller/           # 消息控制器、gRPC 服务、UI 事件订阅
│   │   ├── webview/              # WebviewProvider：管理侧边栏面板
│   │   ├── task/                 # 任务执行流程
│   │   ├── commands/             # 命令实现（如 addToCline、explainWithCline）
│   │   ├── storage/              # 状态存储与迁移
│   │   ├── prompts/              # 系统提示词模板
│   │   ├── context/              # 上下文收集（文件、终端、诊断等）
│   │   └── ...
│   ├── hosts/vscode/             # VS Code 专属实现
│   │   ├── VscodeWebviewProvider.ts
│   │   ├── VscodeDiffViewProvider.ts
│   │   ├── VscodeTerminalManager.ts
│   │   └── ...
│   ├── services/                 # 各种服务（MCP、搜索、认证、遥测等）
│   ├── shared/                   # 与 CLI/Hub 共享的代码
│   ├── integrations/             # 外部集成（编辑器、终端、诊断等）
│   ├── exports/                  # 对外暴露的 Cline API
│   ├── test/                     # 测试代码
│   │   ├── e2e/                  # Playwright 端到端测试
│   │   ├── services/             # 服务层单元测试
│   │   └── *.test.ts             # 其他单元/集成测试
│   └── __tests__/                # 通过 mocha 运行的单元测试
├── webview-ui/                   # 侧边栏 Webview 前端（React + Vite）
│   ├── src/
│   │   ├── components/           # React 组件
│   │   ├── services/             # 前端服务（与扩展通信）
│   │   ├── context/              # React Context
│   │   └── utils/                # 工具函数
│   ├── index.html
│   └── package.json
├── tests/                        # VS Code 测试规格目录
├── dist/                         # 构建产物（esbuild 输出）
├── esbuild.mjs                   # 扩展打包脚本
├── package.json                  # 扩展清单与脚本
└── biome.jsonc                   # 代码格式/检查配置
```

---

## 2. 环境准备

### 2.1 迁移到新电脑

只需复制整个文件夹：

```bash
apps/vscode/
```

> `apps/vscode/` 包含 `webview-ui/` 子项目，一起复制即可。

### 2.2 安装依赖

在新电脑上进入目录并安装依赖：

```bash
cd apps/vscode
npm run install:all
```

这条命令会执行：

```bash
npm install                  # 安装扩展依赖
cd webview-ui && npm install # 安装前端依赖
```

### 2.3 验证基础构建

```bash
npm run check-types
```

如果通过，说明环境准备完成。

---

## 3. 常见修改入口

### 3.1 修改扩展激活逻辑

文件：`src/extension.ts`

- `activate()` 是扩展入口
- 注册命令、设置 HostProvider、迁移存储、创建 Webview 等都在这里

### 3.2 添加/修改 VS Code 命令

1. 在 `package.json` 的 `contributes.commands` 中声明命令
2. 在 `src/extension.ts` 的 `activate()` 中注册命令
3. 实现逻辑可以放在 `src/core/commands/` 或 `src/hosts/vscode/` 下

示例：在 `package.json` 中添加命令：

```json
"contributes": {
  "commands": [
    {
      "command": "cline.myCustomCommand",
      "title": "My Custom Command",
      "category": "Cline"
    }
  ]
}
```

在 `src/extension.ts` 中注册：

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand("cline.myCustomCommand", async () => {
    vscode.window.showInformationMessage("Hello from Cline!")
  })
)
```

### 3.3 修改侧边栏 UI

前端代码在 `webview-ui/src/`：

- `components/chat/` — 聊天界面
- `components/settings/` — 设置界面
- `components/history/` — 历史记录
- `components/welcome/` — 欢迎页
- `components/common/` — 通用组件
- `services/` — 与后端扩展通信的服务

前后端通信主要通过 `vscode.postMessage` 和 `window.addEventListener("message")`。

### 3.4 修改任务执行逻辑

核心代码在 `src/core/task/`：

- 任务创建、循环、工具调用、上下文管理
- 修改前建议先阅读 `src/core/controller/` 中的消息处理流程

### 3.5 修改存储/配置

- `src/core/storage/` — 状态存储与迁移
- `src/shared/storage/` — 跨平台共享存储
- 配置项通常在 `package.json` 的 `contributes.configuration` 中声明

### 3.6 修改提示词/Prompt

- `src/core/prompts/` — 系统提示词和各类 prompt 模板

---

## 4. 开发工作流

### 4.1 启动开发模式（热更新）

```bash
npm run dev
```

这会同时启动：

- `watch:esbuild` — 监听扩展源码变化并重新打包到 `dist/`
- `watch:tsc` — 类型检查

> 注意：webview 前端需要单独启动热更新：
>
> ```bash
> npm run dev:webview
> ```

### 4.2 使用 VS Code 调试

1. 用 VS Code 打开 `apps/vscode/` 文件夹
2. 按 `F5` 或点击左侧运行按钮选择 **"Run Extension"**
3. 会启动一个新的 VS Code Extension Development Host 窗口
4. 在这个新窗口中测试扩展功能

常用调试技巧：

- 在 `src/extension.ts` 或业务代码中打断点
- 使用 `console.log()`，输出会出现在 Debug Console 中
- 修改代码后按 `Ctrl+R`（或 `Cmd+R`）重新加载 Extension Host

### 4.3 单独构建 Webview

```bash
npm run build:webview
```

构建产物在 `webview-ui/build/`，会被 esbuild 打包进扩展。

### 4.4 重新编译扩展

```bash
npm run compile
```

这会执行类型检查、lint 和 esbuild 打包。

### 4.5 代码格式与检查

```bash
# 检查类型
npm run check-types

# 运行 lint
npm run lint

# 自动修复格式
npm run fix:all
```

---

## 5. 测试修改

### 5.1 手动测试（推荐第一步）

按 `F5` 启动 Extension Development Host 后：

1. 打开一个工作区（文件夹）
2. 点击左侧 Cline 图标打开侧边栏
3. 测试你修改的功能
4. 在 DevTools 中查看前端日志：`Help > Toggle Developer Tools`
5. 在 Debug Console 中查看扩展日志

### 5.2 运行单元测试

单元测试使用 Mocha + ts-node，配置文件：`.mocharc.json`

```bash
npm run test:unit
```

测试文件匹配：

- `src/**/__tests__/*.ts`
- `src/test/services/**/*.test.ts`

添加新的单元测试：

```typescript
// src/utils/__tests__/my-util.test.ts
import assert from "node:assert"
import { myUtil } from "@/utils/my-util"

describe("myUtil", () => {
  it("should do something", () => {
    assert.strictEqual(myUtil("input"), "expected")
  })
})
```

### 5.3 运行集成测试

```bash
npm run test:integration
```

这会在真实的 VS Code 环境中运行 `vscode-test` 测试。

### 5.4 运行全部测试

```bash
npm test
```

等价于：

```bash
npm run test:unit && npm run test:integration
```

### 5.5 端到端测试（E2E）

E2E 测试使用 Playwright，模拟真实用户操作 VS Code。

```bash
# 完整流程：构建 + 运行 E2E
npm run test:e2e

# 只运行 E2E（不重新构建测试环境）
npm run e2e

# 运行指定测试文件
npm run e2e -- auth.test.ts

# 调试模式
npm run e2e -- --debug

# 可视化模式
npm run e2e -- --headed

# 按名称过滤
npm run e2e -- --grep "Chat"
```

E2E 测试文件在 `src/test/e2e/`：

- `auth.test.ts` — API 密钥、提供商选择
- `chat.test.ts` — 聊天、模式切换、slash 命令
- `diff.test.ts` — diff 编辑器
- `editor.test.ts` — 代码操作与编辑器集成

添加新的 E2E 测试：

```typescript
import { expect } from "@playwright/test"
import { e2e } from "./utils/helpers"

e2e("My new feature", async ({ sidebar, helper, page }) => {
  await helper.signin(sidebar)
  // 你的测试步骤
})
```

> E2E 测试需要下载 VS Code 测试版，首次运行可能较慢。

### 5.6 打包并本地安装测试

如果你想在正常的 VS Code 中测试修改后的扩展：

```bash
npm run package:vsix
```

会在 `dist/` 下生成：

```
dist/claude-dev-x.x.x-bms-autosar.vsix
```

然后安装到 VS Code：

```bash
# 通过命令行安装
code --install-extension dist/claude-dev-x.x.x-bms-autosar.vsix

# 或者在 VS Code 中：
# 1. 切换到 Extensions 侧边栏
# 2. 点击右上角 "..." > "Install from VSIX"
# 3. 选择生成的 .vsix 文件
```

---

## 6. 打包与发布

### 6.1 打包

```bash
npm run package
```

这会：

1. 类型检查
2. 构建 webview
3. lint
4. 用 esbuild 生产模式打包到 `dist/`

### 6.2 生成 .vsix

```bash
npm run package:vsix
```

### 6.3 发布到市场（可选）

```bash
npm run publish:marketplace
```

> 发布需要 VS Code Marketplace 的 publisher 权限和 PAT。

---

## 7. 常见问题

### Q1: 按 F5 后扩展没有加载？

- 确保已经运行过 `npm run install:all`
- 检查 `dist/extension.js` 是否存在
- 查看 Debug Console 中的错误信息

### Q2: Webview 显示空白？

- 检查 webview 是否已构建：`npm run build:webview`
- 打开 Extension Host 的 DevTools 查看前端报错
- 如果是开发模式，确保 `npm run dev:webview` 已启动

### Q3: 类型检查报 `@/xxx` 路径错误？

- 项目使用了 TypeScript path mapping，确保在 `apps/vscode/` 目录下运行命令
- 不要从仓库根目录运行 `tsc`

### Q4: 修改了 `package.json` 的命令/配置后不生效？

- 需要重新加载 Extension Host：`Ctrl+R` / `Cmd+R`
- 某些配置变更需要重新打包

### Q5: 如何只测试前端 webview？

```bash
cd webview-ui
npm run dev
```

这会在浏览器中启动 Vite 开发服务器，方便单独调试 UI。

---

## 8. 推荐修改顺序

对于第一次修改本扩展，建议按以下顺序：

1. **环境验证**：`npm run install:all && npm run check-types`
2. **运行扩展**：按 `F5` 启动 Extension Host，确认基础功能正常
3. **做小改动**：例如修改一个 `showInformationMessage` 的提示文本
4. **热重载测试**：按 `Ctrl+R` 查看效果
5. **逐步深入**：再修改 UI 组件或业务逻辑
6. **添加测试**：单元测试 → 集成测试 → 必要时 E2E
7. **打包验证**：`npm run package:vsix` 后在真实 VS Code 中安装测试

---

## 9. 关键文件速查

| 目的 | 文件/目录 |
|------|----------|
| 扩展入口 | `src/extension.ts` |
| 通用初始化 | `src/common.ts` |
| 命令声明 | `package.json` > `contributes.commands` |
| 命令实现 | `src/core/commands/`、`src/extension.ts` |
| 侧边栏 Webview | `src/core/webview/WebviewProvider.ts` |
| VS Code 专属 UI | `src/hosts/vscode/VscodeWebviewProvider.ts` |
| 前端入口 | `webview-ui/src/index.tsx` |
| 聊天组件 | `webview-ui/src/components/chat/` |
| 任务执行 | `src/core/task/` |
| 状态存储 | `src/core/storage/`、`src/shared/storage/` |
| Prompt 模板 | `src/core/prompts/` |
| 单元测试 | `src/**/__tests__/*.ts` |
| E2E 测试 | `src/test/e2e/*.test.ts` |
| 构建脚本 | `esbuild.mjs` |
| 扩展清单 | `package.json` |

---

祝你修改顺利！如果遇到具体错误，可以查看 Debug Console、Terminal 输出或 DevTools 中的报错信息。
