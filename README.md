# AFlodit Pet Copilot

**Status: v0.8.0-beta.1**

AFlodit Pet Copilot 是一个轻量级 Chromium 浏览器宠物助手扩展。
它会在网页右下角显示一个小宠物助手，并提供 Chat、Explain、Translate、Summarize 等能力。

当前版本的核心路线是 **Backendless Background Runtime**：普通用户不再需要启动本地 Node backend，只需要在扩展中填写 Provider、Model ID 和 Runtime Key，即可直接通过浏览器扩展后台调用 AI 服务。

---

## 当前推荐配置

普通用户建议优先使用：

* **Provider**：Alibaba Bailian / DashScope
* **Model ID**：qwen-plus
* **Runtime Key**：你的 Alibaba Cloud Model Studio / Bailian API Key
* **Runtime**：Background Runtime Beta

也可以尝试：

* qwen3.6-plus
* qwen3.7-plus
* deepseek-v4-flash

---

## 主要功能

* **Chat**
  在网页中直接和助手聊天。

* **Explain**
  选中网页文本后，让助手解释内容。

* **Translate**
  选中网页文本后，让助手翻译内容。

* **Summarize**
  总结当前页面内容。

* **Pomodoro**
  内置简单番茄钟辅助专注。

* **Save & Connect**
  在设置页输入 Provider、Model ID、Runtime Key 后，一键保存并连接 AI 服务。

---

## v0.8.0 Beta 重点变化

### 1. Background Runtime Beta

从 v0.8.0 开始，扩展可以直接在浏览器后台调用 AI Provider。

普通用户不再需要：

* 启动本地 Node backend
* 配置本地服务地址
* 保持终端窗口运行

Local Backend 仍然保留，但主要用于开发者调试。

---

### 2. 简化 AI 设置页

现在普通用户只需要关注四件事：

1. 服务商
2. 模型 ID
3. 运行密钥
4. 连接状态

高级诊断、本地后端配置、runtime 细节等内容默认折叠在 **高级工具** 中，避免普通配置流程被工程信息干扰。

---

### 3. 更稳定的连接流程

* 优化了 Save & Connect 状态同步。
* 区分连接测试 timeout 和正式请求 timeout。
* 连接失败时会给出更清晰的提示。
* Developer diagnostics 中会保留更详细的排障信息，但不会暴露 API Key。

---

### 4. 修复选区污染

插件设置面板中的文字不会再被误判为网页选中文本。
Translate / Explain 现在只处理网页正文中的选区。

---

## 服务商状态

### 已手动验证 / 推荐

* **Alibaba Bailian / DashScope**

  * qwen-plus
  * qwen3.6-plus
  * qwen3.7-plus
  * deepseek-v4-flash

* **DeepSeek**

  * deepseek-v4-flash

### Experimental

以下服务商已经加入配置入口，但本轮由于账号创建或支付门槛，暂未完整手动验证：

* OpenAI
* OpenRouter

如果你使用这些服务商，请自行确认：

* API Key 是否有效
* Model ID 是否正确
* 当前账号是否有模型权限
* 服务额度是否充足

---

## 安装方式

1. 前往 GitHub Releases。
2. 下载 `aflodit-pet-copilot-v0.8.0-beta.zip`。
3. 解压 zip 文件。
4. 打开 Chrome / Edge / Brave / Vivaldi / Arc 等 Chromium 系浏览器。
5. 进入扩展管理页面。
6. 开启 **Developer Mode**。
7. 点击 **Load unpacked**。
8. 选择解压后的插件文件夹。

注意：请选择包含 `manifest.json` 的文件夹。

---

## 使用方式

### 配置 AI 服务

1. 点击宠物面板中的设置按钮。
2. 进入 **AI 设置 / 模型与密钥**。
3. 选择 Provider。
4. 输入 Model ID。
5. 输入 Runtime Key。
6. 点击 **保存并连接**。

连接成功后即可使用 Chat、Explain、Translate、Summarize。

---

### Explain / Translate

1. 在网页中选中一段文本。
2. 点击 Explain 或 Translate。
3. 助手会基于选中文本返回解释或翻译。

如果没有选中文本，扩展会提示你先选择需要处理的内容。

---

### Summarize

点击 Summarize 后，扩展会提取当前页面内容并生成概要。
Summarize 默认处理当前页面，不会被临时选区劫持。

---

## 本地开发

项目结构大致如下：

```text
aflodit_pet_copilot/
├─ extension/              # 浏览器扩展源码
│  ├─ content-src/         # content.js 分模块源码
│  ├─ runtime/             # Background Runtime 相关逻辑
│  ├─ manifest.json
│  ├─ pet.css
│  └─ build-content.js
├─ backend/                # Legacy Local Backend，主要用于开发调试
├─ docs/                   # 架构与开发文档
├─ scripts/                # release package 构建与检查脚本
└─ dist/                   # release package 输出目录
```

---

## 开发调试流程

在本地修改扩展源码后，如果修改了 `extension/content-src/*`，需要重新生成 `content.js`：

```bash
node extension/build-content.js
```

然后在浏览器扩展管理页中重新加载 `extension/` 目录。

---

## 构建发布包

```bash
node scripts/buildReleasePackage.js
node scripts/checkReleasePackage.js
```

构建结果会输出到：

```text
dist/aflodit-pet-copilot-v0.8.0/
```

发布 zip 建议作为 GitHub Release asset 上传。

---

## 开发者说明

Background Runtime 是当前主线。
Local Backend 仍保留，但现在主要用于开发、兼容测试和故障排查。

高级工具中可以查看：

* Runtime 状态
* Permission 状态
* 最近一次连接测试
* 最近一次 action 失败信息
* Diagnostics

Diagnostics 会自动隐藏 API Key，不应包含完整密钥。

---

## 当前限制

* 目前主要面向 Chromium 系浏览器。
* Firefox / Safari 暂不作为当前适配目标。
* OpenAI / OpenRouter 虽已提供入口，但本轮未完成真实 API 手动验证。
* 这是 Beta 版本，仍可能存在个别页面提取不完整、模型响应慢、服务商额度限制等问题。

---

## License

This project is currently released as an open-source browser extension project.
For security issues, please refer to `SECURITY.md`.
