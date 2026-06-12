# AFlodit Pet Copilot

## 项目简介

AFlodit Pet Copilot 是一个轻量级浏览器宠物助手扩展。它会在网页上注入一个悬浮宠物 UI，帮助你和当前网页内容互动。

它目前支持：

- 普通 Chat 对话
- 解释网页中选中的文本
- 翻译或润色网页中选中的文本
- 总结当前网页内容
- 在扩展设置面板中配置自己的模型服务

扩展本身不直接调用模型 API。浏览器扩展会把用户输入、选中文本和页面上下文发送到本地 Node.js 后端：

```text
content.js -> http://127.0.0.1:3001/api/pet -> Local Backend -> LLM Runtime
```

Dify 现在不再是运行时依赖。仓库中的本地后端已经接管了输入整理、Prompt 构建、模型调用、JSON 解析、响应归一化和安全 fallback。

## 当前版本

当前实现是 `v0.8.0 Backendless Runtime Phase 6.1`。

### v0.8.0 Phase 6.1 Chat Background Route Audit & UI Improvement

Phase 6.1 tightens the optional background Chat payload. `runtime:chat` accepts only `providerId`, `model`, and `userText`; `userText` must be 1-512 characters after trimming, and extra fields are rejected.

The Chat input now hints that `/bg ` or `@background ` runs the optional background runtime route. Background Chat results are labeled as coming from background runtime, while normal Chat still uses the local backend. `requestEnabled` remains `false`.

### v0.8.0 Phase 6 Optional Background Chat Route

Phase 6 adds one optional background AI route for Chat only. In the Chat panel, messages starting with `/bg ` or `@background ` are sent to the extension background runtime using only public fields: `providerId`, `model`, and user input. The background runtime reads the Runtime Key internally, builds the DeepSeek request from the allowlisted provider descriptor, and returns a normal pet reply.

This does not switch the main AI route. Normal Chat plus Explain/Translate/Summarize still use the local backend. `requestEnabled` remains `false`; a successful background chat does not mean the provider is connected or enabled for the main route.

### v0.8.0 Phase 5C.2 DeepSeek-only Real Test Connection

Phase 5C.2 adds a DeepSeek-only Real Test button in Backendless Preview. It sends one minimal DeepSeek chat completions request from the background runtime after the exact `https://api.deepseek.com/*` optional permission is granted and a Runtime Key is saved.

Real Test may consume a tiny amount of DeepSeek quota. It does not switch Chat/Explain/Translate/Summarize to the background runtime, does not mark the provider connected, and does not set `requestEnabled=true`; the status card must still show `Request enabled: no`.

OpenAI, DashScope, and OpenRouter real tests are intentionally not configured in this preview phase. The main AI actions still use the local backend.

### v0.8.0 Phase 5C.1 DeepSeek Permission Request UI

Phase 5C.1 only requests the exact DeepSeek optional host permission `https://api.deepseek.com/*` from the background runtime. It does not request a model, does not connect to the provider, and keeps `requestEnabled=false`.

OpenAI, DashScope, and OpenRouter permission requests are intentionally not configured in this preview phase.

### v0.8.0 Phase 5C.0.1 Permission Status Wire Fix

Phase 5C.0.1 fixes the `runtime:getProviderPermissionStatus` message wire across the content script and background runtime, adds a lightweight runtime test for permission status responses, and compacts the Backendless Preview action area.

The phase remains status-only: it does not request permissions, does not call a provider, and keeps `requestEnabled=false`.

### v0.8.0 Phase 5C.0 Provider Permission Status Skeleton

Phase 5C.0 only checks DeepSeek optional host permission status from the background runtime. It adds the exact optional host permission `https://api.deepseek.com/*` and a Backendless Preview button for `runtime:getProviderPermissionStatus`.

This phase does not request permissions, does not call a model provider, does not mean the provider is connected, and does not move Chat/Explain/Translate/Summarize to the background runtime. `requestEnabled` remains `false` for every provider.

OpenAI, DashScope, and OpenRouter permissions are intentionally not configured in this preview phase. Their permission status response is `PERMISSION_NOT_CONFIGURED`.


### v0.8.0 Phase 5B Mock Test Connection Skeleton

`v0.8.0 Phase 5B` 是 Backendless Preview 的 Mock Test Connection skeleton 阶段，不是最终 Backendless 用户版。当前普通功能仍需要本地 backend。

本阶段在 Phase 4 Provider Registry UI / Provider Allowlist 基础上，新增 background runtime 的 mock-only Test Connection 消息和 Backendless Preview UI 按钮，用于验证 UI -> content script -> background runtime 的安全消息链路。AI 主链路仍保持不变：

```text
content.js -> http://127.0.0.1:3001/api/pet -> Local Backend -> LLM Runtime
```

Phase 5B 的 background runtime 当前用于状态探测、脱敏 public settings preview、Backendless Preview Runtime Key 存储、provider allowlist 选择，以及 mock Test Connection。支持消息：`runtime:getStatus`、`runtime:testConnectionMock`、`settings:getPublic`、`settings:savePublic`、`settings:saveSecret`、`settings:clearKey`。Background Runtime settings 保存 `provider`、`model`、`saveMode`、`debugEnabled` 等 public 字段；Runtime Key 只用于未来 Backendless runtime 预备能力，不影响旧 backend 模型配置，不迁移真实模型请求，不执行任意 fetch，不引入 `https://*/*`，不引入 `optional_host_permissions`，也不引入 Native Messaging。Chat、Explain、Translate、Summarize 仍走本地 backend。

Provider allowlist 当前包含 `Mock`、`OpenAI`、`DeepSeek`、`Qwen / DashScope` 和 `OpenRouter`。这些 provider descriptor 只用于 UI 预览和 settings 校验；`requestEnabled=false` 表示 background runtime 尚未启用真实 provider 请求能力。切换 provider 时，如果 model 为空或仍是旧 provider 的默认模型，UI 和 settings store 会自动填入新 provider 的默认模型。手动编辑过的 model 会被保留。

Mock Test Connection 只检查 provider 是否在 allowlist、provider 是否 enabled、Runtime Key 是否存在，并回显安全的 mock 状态。它不会请求真实 provider，不会把任何 provider 的 `requestEnabled` 改为 `true`，也不会返回完整 Runtime Key。真实 provider Test Connection 计划留到 Phase 5C。

Runtime Key 的保存位置由 `saveMode` 决定：

- `local`：保存到浏览器扩展的 `chrome.storage.local`，浏览器重启后仍可能保留。runtime 会尽力设置 `TRUSTED_CONTEXTS`，避免 content script 直接访问；不支持该能力的浏览器会安全降级。
- `session`：保存到 `chrome.storage.session`，用于更短生命周期；扩展重载或浏览器重启后可能失效。不支持 session storage 的浏览器会安全降级为 background 内存态。

`settings:getPublic` 会返回脱敏 public settings、`hasApiKey`、`apiKeyPreview` 和 provider allowlist，不会返回完整 Runtime Key。Runtime Key 不会写入 `backend/.env`，也不会写入 `backend/.local/settings.local.json`，也不会发送给真实 provider。

当前仍保留此前版本中的本地模型设置能力：

- Settings 面板可以读取、保存、测试模型配置。
- 新增 `GET /api/settings`、`PUT /api/settings`、`POST /api/settings/test`。
- 本地设置保存在 `backend/.local/settings.local.json`。
- API Key 不会保存到扩展的 `localStorage` 或 `chrome.storage`。
- API Key 不会通过 `GET /api/settings` 原样返回，只返回 `apiKeySet` 和 `apiKeyPreview`。
- 已保存的本地设置会覆盖 `.env` 默认值，并影响之后的 `/api/pet` 和 `/api/pet-stream` 请求。

## 功能概览

- **Floating Pet UI**：网页右下角的悬浮宠物入口。
- **Chat**：向宠物发送普通问题或指令。
- **Explain Selected Text**：选中网页文本后，让宠物用简洁中文解释。
- **Translate Selected Text**：选中网页文本后，翻译或润色为自然的简体中文。
- **Summarize Current Page**：提取当前页面可读内容并总结。
- **Settings Panel**：在 UI 中配置 Base URL、Model、API Key、Provider。模型请求超时固定为 40000ms。
- **Backendless Preview**：预览 background public settings、provider allowlist、Runtime Key 存储和 mock Test Connection，当前不驱动真实模型请求。
- **Mock Mode**：无需 API Key 的本地演示模式，适合首次运行和测试。
- **OpenAI-Compatible Provider**：支持标准 `/v1/chat/completions` 风格的模型服务。
- **Experimental Streaming**：实验性 `/api/pet-stream` 流式回复。
- **@Command foundation**：源码级命令解析基础，当前包含内置上下文命令。
- **Pet Positioning**：支持 docked/free 位置、边缘吸附、窗口 resize 后位置约束。

## 快速开始

在最终 Backendless 版本完成前，当前 Phase 6.1 仍按本地后端流程运行，只有显式 background Chat 预览走 background runtime。

### 1. 准备环境

你需要：

- Node.js
- Chromium 系浏览器，例如 Chrome、Edge
- 浏览器扩展开发者模式，用于加载 unpacked extension

### 2. 启动后端

推荐先用 Mock Mode 启动，不需要任何 API Key。

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

在 macOS 或 Linux 上可以把 `copy` 换成：

```bash
cp .env.example .env
```

默认后端地址是：

```text
http://127.0.0.1:3001
```

扩展默认会调用：

```text
POST http://127.0.0.1:3001/api/pet
```

### 3. 加载浏览器扩展

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 开启开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择本仓库中的 `extension/` 目录。
5. 打开一个普通网页，点击悬浮宠物开始使用。

### 4. 使用 Mock Mode

Mock Mode 是首次运行推荐模式。

确认 `backend/.env` 中保留：

```env
MODEL_PROVIDER=mock
MODEL_NAME=mock
```

Mock Mode 不需要 API Key，也不会访问真实模型服务。它会返回确定性的结构化回复，适合确认扩展、后端和 UI 链路是否正常。

### 5. 配置真实模型

你可以通过两种方式配置 OpenAI-Compatible 模型。

#### 方式 A：通过 Settings UI

1. 启动本地后端。
2. 打开网页上的宠物面板。
3. 点击标题栏里的设置按钮。
4. 进入模型配置。
5. 填写 Base URL、Model、API Key、Provider。
6. 点击 Save。
7. 点击 Test Connection。

如果 API Key 输入框留空，保存时会保留已有的本地 Key。API Key 不会回填到输入框中。

#### 方式 B：通过 `backend/.env`

```env
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://provider.example.com/v1
MODEL_API_KEY=your_api_key_here
MODEL_NAME=your_model_name
MODEL_TEMPERATURE=0.3
MODEL_MAX_TOKENS=512
MODEL_RESPONSE_FORMAT=
LLM_DEBUG=false
```

`MODEL_BASE_URL` 可以指向 `/v1`，也可以直接指向 `/v1/chat/completions`。

不要提交真实 API Key。`.env`、`backend/.env`、`backend/.local/` 和 `*.local.json` 都应该保持为本地文件。

后端支持通过 `apiKey="__CLEAR__"` 清除已保存的本地 Key；当前 UI 保持简洁，没有单独暴露清除按钮。

## 使用手册

### 普通聊天

点击悬浮宠物打开面板，进入 Chat，输入问题后发送。普通 Chat 会优先回答你的输入；如果你用 `@选区` 或 `@页面` 引用了上下文，后端会把对应文本一起发送给模型。

### 解释选中文本

1. 在网页中选中一段文本。
2. 点击宠物快捷菜单中的 explain。
3. 宠物会用简洁的简体中文说明含义、重点和必要背景。

如果没有选中文本，系统会提示你先选中需要解释的网页文本。

### 翻译选中文本

1. 在网页中选中一段文本。
2. 点击 translate。
3. 宠物会把选中文本翻译或润色为自然的简体中文。

如果选中文本已经是中文，后端不会说“无法翻译”，而是提供更自然的中文润色版本。

### 总结当前网页

点击 summarize 后，扩展会尝试提取当前网页的可读正文，并发送给本地后端总结。

页面总结质量取决于网页结构。有些网页正文清晰，效果会更好；有些页面包含大量导航、弹窗或动态内容，提取质量可能下降。

### 设置模型

打开设置按钮，进入模型配置：

- Save：保存到 `backend/.local/settings.local.json`。
- Test Connection：测试当前表单配置或已保存配置。
- 测试成功时会显示 `Connected. <latency>ms.`。
- 常见失败会显示简短原因，例如认证失败、请求超时、模型设置无效。

### 宠物位置

宠物支持 docked/free 两种位置状态：

- docked：靠近页面边缘停靠。
- free：拖动后自由放置。
- edge snap：拖动结束后可吸附到边缘。
- resize clamp：窗口尺寸变化后会尽量把宠物限制在可见区域内。

### @Command

项目中已有源码级 `@Command` 基础，位于 `extension/content-src/commands/`。

当前内置命令主要用于 Chat 上下文和本地阅读模式，例如：

- `@选区`
- `@页面`
- 本地阅读模式切换命令

运行时不允许第三方插件加载，也不允许远程 JavaScript 加载。扩展能力应通过源码内的命令注册机制逐步扩展。

## 安全说明

本项目采用 local-first 的安全边界，但不声称是生产级账户安全系统。

- 后端默认绑定到 `127.0.0.1`。
- Settings API 需要本地 token。
- API Key 保存在 `backend/.local/settings.local.json`。
- Background Runtime settings 不影响 `backend/.local/settings.local.json`；Runtime Key 只保存在扩展 background secret store 中。
- Backendless Preview provider 选择不会同步到 backend settings，也不会影响当前本地 backend 的模型配置。
- `requestEnabled=false` 的 provider 只表示已进入 allowlist，不表示 background 已能请求真实模型。
- `backend/.local/` 和 `*.local.json` 已加入 `.gitignore`。
- `GET /api/settings` 只返回 `apiKeySet` 和 `apiKeyPreview`。
- API Key 不会保存在扩展的 `localStorage` 或 `chrome.storage`。
- 后端日志不应该输出完整 API Key 或 Authorization header。
- 不要把后端绑定到 `0.0.0.0`，除非你明确理解网络暴露风险。
- 不要提交 `.env`、本地 settings 文件、私有 endpoint 或任何真实密钥。

## 本地 Settings API

Settings API 用于本机保存和测试模型配置。

```text
GET  /api/settings
PUT  /api/settings
POST /api/settings/test
```

所有 settings 路由都需要本地 token。支持的请求头：

```text
Authorization: Bearer <LOCAL_CLIENT_TOKEN>
X-Aflodit-Token: <LOCAL_CLIENT_TOKEN>
X-Aflodit-Pet-Token: <LOCAL_CLIENT_TOKEN>
```

配置形状：

```json
{
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKey": "secret"
  }
}
```

`GET /api/settings` 返回的是脱敏结果，例如：

```json
{
  "settings": {
    "model": {
      "provider": "openai-compatible",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "apiKeySet": true,
      "apiKeyPreview": "sk-...abcd"
    }
  }
}
```

`POST /api/settings/test` 会返回 `ok`、`provider`、`model`、`latencyMs` 和安全的人类可读消息。失败时会使用规范化错误码，例如：

- `MODEL_AUTH_FAILED`
- `MODEL_TIMEOUT`
- `MODEL_NETWORK_ERROR`
- `MODEL_BAD_RESPONSE`
- `MODEL_CONFIG_INVALID`

## API Contract

`POST /api/pet` 是稳定的非流式接口。请求字段保持 snake_case，用于兼容浏览器扩展和早期输入约定。

```json
{
  "action": "chat",
  "user_text": "",
  "selected_text": "",
  "page_title": "",
  "page_url": "",
  "page_text_snippet": "",
  "character_state": ""
}
```

支持的 canonical actions：

- `chat`
- `explain_selection`
- `summarize_page`
- `translate`

后端响应保持前端兼容形状：

```json
{
  "reply": "string",
  "emotion": "neutral",
  "motion": "idle",
  "bubble_type": "normal",
  "confidence": 0.7
}
```

允许的枚举值：

- `emotion`: `neutral`, `happy`, `thinking`, `confused`, `error`
- `motion`: `idle`, `nod`, `shake`, `jump`, `think`
- `bubble_type`: `normal`, `info`, `warning`, `error`

## Experimental Streaming

`POST /api/pet-stream` 是实验性流式接口。它使用与 `/api/pet` 相同的请求 payload，但返回 newline-delimited JSON events，方便 Manifest V3 content script 通过 `fetch()` 和 `ReadableStream` 读取增量文本。

事件示例：

```json
{ "streamExperimental": true, "type": "start", "action": "translate" }
{ "streamExperimental": true, "type": "delta", "text": "partial reply text" }
{ "streamExperimental": true, "type": "final", "data": { "reply": "complete reply", "emotion": "thinking", "motion": "think", "bubble_type": "info", "confidence": 0.75 } }
```

流式接口只在 `delta` 中发送用户可见文本，不会把原始模型 JSON 输出流给用户。扩展当前配置为优先尝试 `/api/pet-stream`，失败后回退到稳定的 `/api/pet`。

OpenAI-Compatible provider 的流式模式使用 `stream: true`，解析 `/v1/chat/completions` 返回的 `data:` chunks，并忽略 `[DONE]`。Mock Mode 也支持确定性的流式测试。

## 调试与验证

从 `backend/` 目录运行语法检查：

```bash
node --check server.js
node --check src/llm/index.js
node --check src/llm/modelClient.js
node --check src/llm/promptBuilder.js
node --check src/llm/responseNormalizer.js
node --check src/llm/fallbackResponse.js
node --check src/llm/inputNormalizer.js
node --check ../extension/content.js
```

Mock Mode 测试：

```bash
npm run test:normalizer
npm run test:input
npm run test:llm
npm run test:commands
```

本地调试模型输出时可以临时设置：

```env
LLM_DEBUG=true
```

`LLM_DEBUG=true` 可能让 API 响应或终端日志包含更多调试信息。日志仍应保存在本地，不要公开分享包含私有上下文的调试输出。调试结束后建议恢复为 `LLM_DEBUG=false`。

## 常见问题

### 扩展连接不上后端

确认后端正在运行，并且地址是 `http://127.0.0.1:3001`。也可以访问：

```text
GET http://127.0.0.1:3001/api/runtime-status
```

### Save/Test 被拒绝

确认 `backend/.env` 中的 `LOCAL_CLIENT_TOKEN` 与扩展中的本地 token 一致。Settings API 会拒绝没有本地 token 或 token 不匹配的请求。

### 真实模型测试失败

检查 Provider、Base URL、Model 和 API Key。模型请求超时固定为 40000ms。`MODEL_BASE_URL` 可以是 `/v1` 或 `/v1/chat/completions`。如果返回认证失败，优先检查 API Key。

### API Key 保存后没有显示出来

这是预期行为。Settings UI 不会回填真实 API Key，只会显示类似 `Saved: sk-...abcd` 的安全占位信息。

### Mock Mode 正常，真实模型不正常

说明扩展和本地后端链路基本正常。问题通常在模型服务配置、网络、API Key 权限、模型名称或 provider 的 OpenAI-Compatible 兼容性上。

### 页面总结质量不好

页面正文提取依赖当前网页结构。文章页通常效果更好；复杂应用、动态页面、弹窗很多的页面可能会影响提取质量。

### 后端端口冲突

默认端口是 `3001`。如果被占用，可以在 `backend/.env` 中调整：

```env
PORT=3002
```

调整后也需要让扩展配置指向相同端口。

### `npm install` 提示 moderate vulnerability

先确认是否影响当前本地开发路径。不要为了消除提示盲目升级依赖导致运行时行为变化。需要升级时应单独检查变更和测试结果。

## 已知限制

- 使用扩展时必须运行本地后端。
- 这是 Phase 6.1 的临时限制，后续 Phase 计划继续迁移到 background runtime。
- Backendless Preview 的 Mock Test Connection 只验证安全消息链路，不请求真实模型。
- 后端不是 production hardened 服务。
- OpenAI-Compatible provider 的兼容性取决于对方 `/chat/completions` 行为。
- 网页内容提取质量会因网站结构而变化。
- 真实模型延迟取决于 provider、网络和模型本身。

## 开发者说明

项目主要目录：

- `extension/`：Manifest V3 浏览器扩展、content script 和宠物 UI 样式。
- `backend/`：本地 Express 后端和模型运行时。
- `backend/src/llm/`：输入归一化、Prompt 构建、Provider 调用、响应归一化、fallback 和 debug metadata。
- `backend/src/settings/`：本地 settings 存储、校验、脱敏和 API routes。
- `docs/`：架构、开发和 `@Command` 设计说明。

公共贡献时请保持本地密钥、本地 settings、日志、缓存和浏览器 profile 数据不进入 Git。
