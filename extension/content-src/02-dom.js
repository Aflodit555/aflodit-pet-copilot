// =========================
  // 5. DOM / 模板
  // =========================
  function renderTemplate() {
    return `
      <div id="aflodit-pet">
        <div id="aflodit-pet-menu" class="pet-quick-menu hidden">
          <button class="pet-quick-action" data-action="${ACTION.TRANSLATE}">translate</button>
          <button class="pet-quick-action" data-action="${ACTION.EXPLAIN}">explain</button>
          <button class="pet-quick-action" data-action="${ACTION.SUMMARY}">summarize</button>
        </div>

        <div id="aflodit-pet-panel" class="hidden bubble-type-normal">
          <div class="pet-title-row">
            <div class="pet-title">AFlodit Pet Copilot <span class="pet-version">${CONFIG.version}</span></div>
            <div class="pet-title-actions">
              <button id="aflodit-pet-settings-button" class="pet-icon-button" title="插件设置 / 模型配置">⚙</button>
              <div id="aflodit-pet-mode" class="pet-mode-tag">Chat</div>
            </div>
          </div>

          <div id="aflodit-pet-settings" class="pet-settings-panel hidden">
            <div id="aflodit-pet-settings-menu" class="pet-settings-view">
              <div class="pet-settings-title">插件设置</div>
              <button class="pet-settings-menu-item" data-settings-view="model">模型配置</button>
              <button class="pet-settings-menu-item" data-settings-view="runtime">Backendless Preview</button>
              <button class="pet-settings-menu-item" data-settings-view="display">显示与位置</button>
              <button class="pet-settings-menu-item" data-settings-view="commands">快捷命令</button>
              <button class="pet-settings-menu-item" data-settings-view="about">关于</button>
            </div>

            <div id="aflodit-pet-settings-model" class="pet-settings-view pet-settings-fixed-footer hidden">
              <div class="pet-settings-body">
              <div class="pet-settings-title">模型配置</div>
              <label class="pet-settings-field">
                <span>Base URL</span>
                <input id="aflodit-pet-settings-base-url" type="text" autocomplete="off" />
              </label>
              <label class="pet-settings-field">
                <span>Model</span>
                <input id="aflodit-pet-settings-model-name" type="text" autocomplete="off" />
              </label>
              <label class="pet-settings-field">
                <span>API Key</span>
                <input id="aflodit-pet-settings-api-key" type="password" autocomplete="off" />
              </label>
              <label class="pet-settings-field">
                <span>Provider</span>
                <select id="aflodit-pet-settings-provider">
                  <option value="mock">mock</option>
                  <option value="openai-compatible">openai-compatible</option>
                </select>
              </label>
              <div id="aflodit-pet-settings-message" class="pet-settings-message" aria-live="polite"></div>
              </div>
              <div class="pet-settings-actions pet-settings-footer">
                <button id="aflodit-pet-settings-test" class="pet-secondary-button">Test Connection</button>
                <button id="aflodit-pet-settings-save" class="pet-primary-button">Save</button>
                <button id="aflodit-pet-settings-back" class="pet-secondary-button">Back</button>
                <button id="aflodit-pet-settings-cancel" class="pet-secondary-button">Cancel</button>
              </div>
            </div>

            <div id="aflodit-pet-settings-runtime" class="pet-settings-view pet-settings-fixed-footer hidden">
              <div class="pet-settings-body">
              <div class="pet-settings-title">Backendless Preview</div>
              <div class="pet-settings-message pet-runtime-warning">Backendless Preview 当前不接真实模型，真实 Chat/Explain/Translate/Summarize 仍走本地 backend。</div>
              <div class="pet-runtime-summary">
                <div><b>Runtime status</b>：<span id="aflodit-pet-runtime-settings-status">unavailable</span></div>
                <div><b>Has API Key</b>：<span id="aflodit-pet-runtime-has-key">false</span></div>
                <div><b>API Key preview</b>：<span id="aflodit-pet-runtime-key-preview"></span></div>
              </div>
              <label class="pet-settings-field">
                <span>Provider</span>
                <select id="aflodit-pet-runtime-provider">
                  <option value="mock">mock</option>
                </select>
              </label>
              <label class="pet-settings-field">
                <span>Model</span>
                <input id="aflodit-pet-runtime-model" type="text" autocomplete="off" />
              </label>
              <div class="pet-runtime-provider-card">
                <div><b>Provider selected</b>：<span id="aflodit-pet-runtime-provider-selected">Mock</span></div>
                <div><b>Protocol</b>：<span id="aflodit-pet-runtime-provider-protocol">mock</span></div>
                <div><b>Default model</b>：<span id="aflodit-pet-runtime-provider-default-model">mock-model</span></div>
                <div><b>Permission status</b>: <span id="aflodit-pet-runtime-provider-permission-status">unknown</span></div>
                <div><b>Request enabled</b>：<span id="aflodit-pet-runtime-provider-request-enabled">no</span></div>
              </div>
              <div class="pet-settings-message pet-runtime-warning">Provider selection and permission status are preview-only. Permission granted does not mean provider connected. Real model requests are still disabled.</div>
              <label class="pet-settings-field">
                <span>API Key</span>
                <input id="aflodit-pet-runtime-api-key" type="password" autocomplete="off" placeholder="Enter API Key for future backendless runtime" />
              </label>
              <label class="pet-settings-field">
                <span>Save mode</span>
                <select id="aflodit-pet-runtime-save-mode">
                  <option value="local">local</option>
                  <option value="session">session</option>
                </select>
              </label>
              <label class="pet-settings-check">
                <input id="aflodit-pet-runtime-debug" type="checkbox" />
                <span>Debug enabled</span>
              </label>
              <div class="pet-runtime-provider-card">
                <div><b>Runtime Mode</b>: <span id="aflodit-pet-runtime-mode-label">Local Backend</span></div>
                <label class="pet-settings-check" title="Uses 127.0.0.1 backend. Best for stable local development.">
                  <input id="aflodit-pet-runtime-mode-local" name="aflodit-pet-runtime-mode" type="radio" value="local_backend" />
                  <span>Local Backend</span>
                </label>
                <div class="pet-settings-message pet-runtime-compact-note">Uses 127.0.0.1 backend. Best for stable local development.</div>
                <label class="pet-settings-check" title="Uses extension background runtime. No local backend needed after setup.">
                  <input id="aflodit-pet-runtime-mode-background" name="aflodit-pet-runtime-mode" type="radio" value="background_runtime_beta" />
                  <span>Background Runtime Beta</span>
                </label>
                <div class="pet-settings-message pet-runtime-compact-note">Uses extension background runtime. No local backend needed after setup.</div>
              </div>
              <div class="pet-runtime-provider-card" aria-live="polite">
                <div><b>Background Runtime Readiness</b>: <span id="aflodit-pet-runtime-readiness-summary">not checked</span></div>
                <div><b>Provider</b>: <span id="aflodit-pet-runtime-readiness-provider">not checked</span></div>
                <div><b>Runtime Key</b>: <span id="aflodit-pet-runtime-readiness-key">not checked</span></div>
                <div><b>Permission</b>: <span id="aflodit-pet-runtime-readiness-permission">not checked</span></div>
                <div><b>Model</b>: <span id="aflodit-pet-runtime-readiness-model">not checked</span></div>
                <div><b>Runtime Mode</b>: <span id="aflodit-pet-runtime-readiness-mode">not checked</span></div>
                <div><b>Real Test</b>: <span id="aflodit-pet-runtime-readiness-real-test">optional / not checked</span></div>
              </div>
              <div class="pet-settings-message pet-runtime-warning">此 Key 仅用于 Backendless Preview，不影响当前本地后端模型配置。当前 AI 功能仍走本地 backend，也不会修改 backend/.env 或 backend/.local/settings.local.json。</div>
              <div id="aflodit-pet-runtime-message" class="pet-settings-message" aria-live="polite"></div>
              </div>
              <div class="pet-settings-actions pet-settings-footer pet-runtime-actions">
                <div class="pet-runtime-actions-group">
                  <div class="pet-runtime-actions-title">Runtime Actions</div>
                  <div class="pet-runtime-actions-row">
                    <button id="aflodit-pet-runtime-save" class="pet-primary-button">Save Settings</button>
                    <button id="aflodit-pet-runtime-save-key" class="pet-primary-button">Save Key</button>
                    <button id="aflodit-pet-runtime-clear-key" class="pet-secondary-button" title="Only clears Backendless Preview key, not backend key.">Clear Key</button>
                  </div>
                </div>
                <div class="pet-runtime-actions-group">
                  <div class="pet-runtime-actions-title">Preview Checks</div>
                  <div class="pet-runtime-actions-row">
                    <button id="aflodit-pet-runtime-test-mock" class="pet-secondary-button">Mock Test</button>
                    <button id="aflodit-pet-runtime-check-permission" class="pet-secondary-button">Check Permission</button>
                    <button id="aflodit-pet-runtime-check-readiness" class="pet-secondary-button">Check Readiness</button>
                    <button id="aflodit-pet-runtime-request-permission" class="pet-secondary-button">Request Permission</button>
                    <button id="aflodit-pet-runtime-test-real" class="pet-secondary-button">Real Test</button>
                  </div>
                </div>
                <div class="pet-runtime-actions-row pet-runtime-nav-row">
                  <button id="aflodit-pet-runtime-reload" class="pet-secondary-button">Reload</button>
                  <button id="aflodit-pet-runtime-back" class="pet-secondary-button pet-runtime-back-button">Back</button>
                </div>
              </div>
            </div>

            <div id="aflodit-pet-settings-commands" class="pet-settings-view pet-settings-fixed-footer hidden">
              <div class="pet-settings-body">
              <div class="pet-settings-title">快捷命令</div>
              <div class="pet-help-line"><b>Enter</b>：发送 Chat</div>
              <div class="pet-help-line"><b>Esc</b>：关闭面板</div>
              <div class="pet-help-line"><b>@选区</b>：引用当前选中文本</div>
              <div class="pet-help-line"><b>@页面</b>：引用当前页面正文</div>
              <div class="pet-help-line"><b>@陪读</b>：进入陪读模式</div>
              <div class="pet-help-line"><b>@退出陪读</b>：退出陪读模式</div>
              <div class="pet-help-line"><b>@番茄钟</b>：打开本地番茄钟</div>
              <div class="pet-help-line"><b>@停止番茄钟</b>：停止当前番茄钟</div>
              <div class="pet-help-line pet-help-muted">示例：@选区 解释这段话</div>
              <div class="pet-help-line pet-help-muted">示例：@页面 这页主要讲什么</div>
              </div>
              <div class="pet-settings-actions pet-settings-footer">
                <button id="aflodit-pet-commands-back" class="pet-secondary-button">Back</button>
                <button id="aflodit-pet-commands-close" class="pet-secondary-button">Close</button>
              </div>
            </div>

            <div id="aflodit-pet-settings-display" class="pet-settings-view pet-settings-fixed-footer hidden">
              <div class="pet-settings-body">
              <div class="pet-settings-title">显示与位置</div>
              <label class="pet-settings-field">
                <span>边缘吸附</span>
                <select id="aflodit-pet-ui-edge-snap">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="pet-settings-field">
                <span>初始位置</span>
                <select id="aflodit-pet-ui-initial-position">
                  <option value="bottom-right">右下角</option>
                  <option value="bottom-left">左下角</option>
                  <option value="top-right">右上角</option>
                  <option value="top-left">左上角</option>
                  <option value="current">当前位置</option>
                </select>
              </label>
              <label class="pet-settings-field">
                <span>透明度</span>
                <select id="aflodit-pet-ui-opacity">
                  <option value="1">100%</option>
                  <option value="0.8">80%</option>
                  <option value="0.6">60%</option>
                </select>
              </label>
              <div class="pet-settings-message">显示设置保存在浏览器 chrome.storage.local，不写入后端模型配置。</div>
              </div>
              <div class="pet-settings-actions pet-settings-footer">
                <button id="aflodit-pet-ui-reset-position" class="pet-secondary-button">重置位置</button>
                <button id="aflodit-pet-display-back" class="pet-secondary-button">Back</button>
              </div>
            </div>

            <div id="aflodit-pet-settings-about" class="pet-settings-view pet-settings-fixed-footer hidden">
              <div class="pet-settings-body">
              <div class="pet-settings-title">关于</div>
              <div class="pet-about-list">
                <div><b>Project</b>：AFlodit Pet Copilot</div>
                <div><b>Version</b>：${CONFIG.version}</div>
                <div><b>Runtime status</b>：<span id="aflodit-pet-runtime-status">backend legacy</span></div>
                <div><b>Backend URL</b>：http://127.0.0.1:3001</div>
                <div><b>Model modes</b>：Mock / OpenAI-Compatible</div>
                <div><b>GitHub</b>：https://github.com/AFlodit55/aflodit-pet-copilot</div>
              </div>
              <div class="pet-about-section">
                <div class="pet-about-section-title">产品概述</div>
                <div class="pet-settings-note">AFlodit Pet Copilot 是一个运行在网页中的轻量 AI 桌宠助手，支持聊天、解释选中文本、翻译选中文本和总结当前网页。</div>
              </div>
              <div class="pet-about-section">
                <div class="pet-about-section-title">当前阶段</div>
                <div class="pet-settings-note">当前版本为 v0.8.0 Phase 4。Backendless Preview 已接入 provider allowlist、public settings 和 Runtime Key 预览，但主要 AI 功能仍通过本地 backend 运行。</div>
              </div>
              <div class="pet-about-section">
                <div class="pet-about-section-title">安全说明</div>
                <div class="pet-settings-note">本地 backend API Key 与 Backendless Preview Runtime Key 分开保存；content script 只能看到脱敏状态，不会拿到完整 Runtime Key。</div>
              </div>
              </div>
              <div class="pet-settings-actions pet-settings-footer">
                <button id="aflodit-pet-about-back" class="pet-secondary-button">Back</button>
              </div>
            </div>
          </div>

          <div id="aflodit-pet-pomodoro-settings" class="pet-pomodoro-panel hidden" aria-live="polite">
            <div class="pet-settings-title">番茄钟</div>
            <label class="pet-settings-field">
              <span>工作时间（分钟）</span>
              <input id="aflodit-pet-pomodoro-work" type="text" inputmode="decimal" maxlength="6" autocomplete="off" />
            </label>
            <label class="pet-settings-field">
              <span>休息时间（分钟）</span>
              <input id="aflodit-pet-pomodoro-rest" type="text" inputmode="decimal" maxlength="6" autocomplete="off" />
            </label>
            <label class="pet-settings-field">
              <span>轮数</span>
              <input id="aflodit-pet-pomodoro-rounds" type="text" inputmode="decimal" maxlength="6" autocomplete="off" />
            </label>
            <div id="aflodit-pet-pomodoro-message" class="pet-settings-message">本地计时，不请求后端。</div>
            <div class="pet-settings-actions">
              <button id="aflodit-pet-pomodoro-start" class="pet-primary-button">开始</button>
              <button id="aflodit-pet-pomodoro-cancel" class="pet-secondary-button">取消</button>
            </div>
          </div>

          <div id="aflodit-pet-pomodoro-notice" class="pet-pomodoro-panel hidden" aria-live="polite">
            <div id="aflodit-pet-pomodoro-notice-title" class="pet-settings-title">番茄钟</div>
            <div id="aflodit-pet-pomodoro-notice-body" class="pet-settings-note"></div>
            <div class="pet-settings-actions">
              <button id="aflodit-pet-pomodoro-primary" class="pet-primary-button">开始休息</button>
              <button id="aflodit-pet-pomodoro-end" class="pet-secondary-button">结束番茄钟</button>
            </div>
          </div>

          <div id="aflodit-pet-status" class="pet-status">请选择一种使用方式。</div>

          <div id="aflodit-pet-context-block">
            <div id="aflodit-pet-context-title" class="pet-section-title">选中文本</div>
            <div id="aflodit-pet-selected" class="pet-text pet-selected-text">暂无选中文本。</div>
          </div>

          <div class="pet-reply-title-row">
            <div class="pet-section-title pet-reply-title">助手回复</div>
            <button id="aflodit-pet-refresh-action" class="pet-refresh-button hidden" title="重新执行当前动作">↻</button>
          </div>
          <div id="aflodit-pet-reply" class="pet-text pet-reply-text">暂无回复。</div>

          <div id="aflodit-pet-meta" class="pet-meta">emotion: neutral | motion: idle</div>

          <div id="aflodit-pet-chat-row" class="pet-chat-row hidden">
            <input id="aflodit-pet-chat-input" class="pet-chat-input" placeholder="马上开始对话吧" />
            <button id="aflodit-pet-chat-send" class="pet-chat-button">发送</button>
          </div>
        </div>

        <div id="aflodit-pet-avatar" title="AFlodit Pet Copilot">
          <span id="aflodit-pet-pomodoro-ring" class="pet-pomodoro-ring hidden" aria-hidden="true"></span>
          <span id="aflodit-pet-idea-bulb" class="pet-idea-bulb hidden" aria-hidden="true">
            <span class="pet-idea-bulb-glow"></span>
            <span class="pet-idea-bulb-ray pet-idea-bulb-ray-1"></span>
            <span class="pet-idea-bulb-ray pet-idea-bulb-ray-2"></span>
            <span class="pet-idea-bulb-ray pet-idea-bulb-ray-3"></span>
            <span class="pet-idea-bulb-spark pet-idea-bulb-spark-1"></span>
            <span class="pet-idea-bulb-spark pet-idea-bulb-spark-2"></span>
            <span class="pet-idea-bulb-spark pet-idea-bulb-spark-3"></span>
            <span class="pet-idea-bulb-glass"></span>
            <span class="pet-idea-bulb-core"></span>
            <span class="pet-idea-bulb-base"></span>
          </span>
          <span id="aflodit-pet-face" class="pet-face-core face-emotion-neutral" aria-hidden="true">
            <span id="aflodit-pet-eye-left" class="pet-face-part pet-eye pet-eye-left">●</span><span id="aflodit-pet-mouth" class="pet-face-part pet-mouth">ᴗ</span><span id="aflodit-pet-eye-right" class="pet-face-part pet-eye pet-eye-right">●</span><span id="aflodit-pet-face-mark" class="pet-face-part pet-face-mark"></span>
          </span>
        </div>
      </div>
    `;
  }

  function injectIdeaMotionStyle() {
    if (document.getElementById("aflodit-pet-idea-motion-style")) return;

    const style = document.createElement("style");
    style.id = "aflodit-pet-idea-motion-style";
    style.textContent = `
      #aflodit-pet-avatar {
        position: relative;
        overflow: visible !important;
      }

      .pet-idea-bulb.hidden {
        display: none !important;
      }

      .pet-idea-bulb {
        position: absolute;
        left: -21px;
        top: -42px;
        width: 46px;
        height: 56px;
        pointer-events: none;
        z-index: 7;
        transform-origin: 54% 88%;
        animation: af-pet-idea-bulb-dance 1180ms cubic-bezier(.18,.85,.28,1.25) both;
      }

      .pet-idea-bulb-glow {
        position: absolute;
        left: 3px;
        top: -1px;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,236,128,.72) 0%, rgba(255,236,128,.28) 42%, rgba(255,236,128,0) 72%);
        filter: blur(1px);
        animation: af-pet-idea-glow 1180ms ease-out both;
      }

      .pet-idea-bulb-glass {
        position: absolute;
        left: 8px;
        top: 4px;
        width: 27px;
        height: 30px;
        border: 3px solid #222;
        border-radius: 50% 50% 46% 46%;
        background: #fff2a0;
        box-shadow:
          0 0 0 2px rgba(255,255,255,.28) inset,
          0 0 12px rgba(255,220,80,.58);
      }

      .pet-idea-bulb-glass::after {
        content: "";
        position: absolute;
        left: 6px;
        top: 5px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: rgba(255,255,255,.86);
      }

      .pet-idea-bulb-core {
        position: absolute;
        left: 18px;
        top: 19px;
        width: 8px;
        height: 7px;
        border: 2px solid #222;
        border-top: 0;
        border-radius: 0 0 8px 8px;
        opacity: .86;
      }

      .pet-idea-bulb-base {
        position: absolute;
        left: 14px;
        top: 32px;
        width: 16px;
        height: 14px;
        border: 3px solid #222;
        border-top: 0;
        border-radius: 3px 3px 8px 8px;
        background: #f7f7f7;
      }

      .pet-idea-bulb-base::before,
      .pet-idea-bulb-base::after {
        content: "";
        position: absolute;
        left: 2px;
        width: 12px;
        height: 2px;
        border-radius: 999px;
        background: #222;
      }

      .pet-idea-bulb-base::before { top: 4px; }
      .pet-idea-bulb-base::after { top: 9px; }

      .pet-idea-bulb-ray {
        position: absolute;
        width: 12px;
        height: 3px;
        border-radius: 999px;
        background: #222;
        opacity: 0;
        transform-origin: 50% 50%;
        animation: af-pet-idea-ray 1180ms ease-out both;
      }

      .pet-idea-bulb-ray-1 {
        left: 17px;
        top: -5px;
        transform: rotate(90deg) scaleX(.45);
        animation-delay: 80ms;
      }

      .pet-idea-bulb-ray-2 {
        left: -2px;
        top: 9px;
        transform: rotate(142deg) scaleX(.45);
        animation-delay: 150ms;
      }

      .pet-idea-bulb-ray-3 {
        right: -1px;
        top: 10px;
        transform: rotate(38deg) scaleX(.45);
        animation-delay: 220ms;
      }

      .pet-idea-bulb-spark {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #222;
        opacity: 0;
        animation: af-pet-idea-spark 1180ms ease-out both;
      }

      .pet-idea-bulb-spark-1 { left: 5px; top: -4px; animation-delay: 210ms; }
      .pet-idea-bulb-spark-2 { left: 36px; top: 1px; animation-delay: 310ms; }
      .pet-idea-bulb-spark-3 { left: 1px; top: 27px; animation-delay: 400ms; }


      .face-emotion-thinking .pet-mouth {
        position: relative;
        display: inline-block;
        overflow: visible;
      }

      .pet-thinking-mouth-anchor {
        opacity: 0;
        pointer-events: none;
      }

      .pet-thinking-wave-mouth {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 12px;
        height: 8px;
        overflow: hidden;
        pointer-events: none;
        transform: translate(-50%, -18%);
      }

      .pet-thinking-wave-mouth svg {
        display: block;
        width: 24px;
        height: 8px;
        animation: af-pet-thinking-wave-flow 680ms linear infinite;
      }

      .pet-thinking-wave-mouth path {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.9;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .motion-think-soft {
        animation: af-pet-thinking-soft 1280ms ease-in-out infinite;
      }

      .motion-idea-bulb {
        animation: af-pet-idea-face-pop 520ms cubic-bezier(.18,.85,.25,1.2) both;
      }


      @keyframes af-pet-thinking-wave-flow {
        from { transform: translateX(0); }
        to { transform: translateX(-12px); }
      }

      @keyframes af-pet-thinking-soft {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-1px) rotate(-1deg); }
      }

      @keyframes af-pet-idea-face-pop {
        0% { transform: translateY(0) scale(1); }
        35% { transform: translateY(-2px) scale(1.045); }
        72% { transform: translateY(1px) scale(.99); }
        100% { transform: translateY(0) scale(1); }
      }

      @keyframes af-pet-idea-bulb-dance {
        0% { opacity: 0; transform: translate(-5px, 8px) scale(.38) rotate(-22deg); }
        18% { opacity: 1; transform: translate(1px, -2px) scale(1.16) rotate(9deg); }
        32% { opacity: 1; transform: translate(-2px, 1px) scale(.96) rotate(-6deg); }
        48% { opacity: 1; transform: translate(0, -3px) scale(1.04) rotate(4deg); }
        68% { opacity: 1; transform: translate(1px, -1px) scale(1) rotate(-2deg); }
        84% { opacity: 1; transform: translate(0, -4px) scale(.96) rotate(2deg); }
        100% { opacity: 0; transform: translate(2px, -9px) scale(.78) rotate(8deg); }
      }

      @keyframes af-pet-idea-glow {
        0%, 100% { opacity: 0; transform: scale(.55); }
        18%, 72% { opacity: 1; transform: scale(1.12); }
        46% { opacity: .76; transform: scale(.95); }
      }

      @keyframes af-pet-idea-ray {
        0%, 12% { opacity: 0; }
        24% { opacity: .95; }
        48% { opacity: .36; }
        66% { opacity: .9; }
        100% { opacity: 0; }
      }

      @keyframes af-pet-idea-spark {
        0%, 18% { opacity: 0; transform: translate(0, 0) scale(.35); }
        38% { opacity: .88; transform: translate(-1px, -4px) scale(1); }
        72% { opacity: .35; transform: translate(2px, -7px) scale(.72); }
        100% { opacity: 0; transform: translate(4px, -10px) scale(.35); }
      }
    `;

    document.head.appendChild(style);
  }

  function createDom() {
    injectIdeaMotionStyle();

    const root = document.createElement("div");
    traceLayout("DOM root created", { root });
    root.id = "aflodit-pet-root";
    root.style.visibility = "hidden";
    traceLayout("DOM root inline visibility hidden", traceStyleSnapshot(root));
    root.innerHTML = renderTemplate();
    traceLayout("DOM template rendered before append", {
      root,
      card: root.querySelector("#aflodit-pet-panel"),
      menu: root.querySelector("#aflodit-pet-menu"),
      avatar: root.querySelector("#aflodit-pet-avatar"),
      face: root.querySelector("#aflodit-pet-face"),
      auxiliaryPanel: root.querySelector("#aflodit-pet-settings")
    });
    document.body.appendChild(root);
    traceLayout("DOM root appended to document.body", {
      root,
      bodyContainsRoot: document.body.contains(root)
    });

    const quickButtons = Array.from(root.querySelectorAll(".pet-quick-action"));
    const quickButtonMap = quickButtons.reduce((acc, button) => {
      acc[button.dataset.action] = button;
      return acc;
    }, {});

    Object.assign(dom, {
      root,
      pet: root.querySelector("#aflodit-pet"),
      avatar: root.querySelector("#aflodit-pet-avatar"),
      menu: root.querySelector("#aflodit-pet-menu"),
      panel: root.querySelector("#aflodit-pet-panel"),
      settingsButton: root.querySelector("#aflodit-pet-settings-button"),
      settings: root.querySelector("#aflodit-pet-settings"),
      settingsMenu: root.querySelector("#aflodit-pet-settings-menu"),
      settingsModel: root.querySelector("#aflodit-pet-settings-model"),
      settingsRuntime: root.querySelector("#aflodit-pet-settings-runtime"),
      settingsCommands: root.querySelector("#aflodit-pet-settings-commands"),
      settingsDisplay: root.querySelector("#aflodit-pet-settings-display"),
      settingsAbout: root.querySelector("#aflodit-pet-settings-about"),
      pomodoroSettings: root.querySelector("#aflodit-pet-pomodoro-settings"),
      pomodoroNotice: root.querySelector("#aflodit-pet-pomodoro-notice"),
      pomodoroWork: root.querySelector("#aflodit-pet-pomodoro-work"),
      pomodoroRest: root.querySelector("#aflodit-pet-pomodoro-rest"),
      pomodoroRounds: root.querySelector("#aflodit-pet-pomodoro-rounds"),
      pomodoroMessage: root.querySelector("#aflodit-pet-pomodoro-message"),
      pomodoroStart: root.querySelector("#aflodit-pet-pomodoro-start"),
      pomodoroCancel: root.querySelector("#aflodit-pet-pomodoro-cancel"),
      pomodoroNoticeTitle: root.querySelector("#aflodit-pet-pomodoro-notice-title"),
      pomodoroNoticeBody: root.querySelector("#aflodit-pet-pomodoro-notice-body"),
      pomodoroPrimary: root.querySelector("#aflodit-pet-pomodoro-primary"),
      pomodoroEnd: root.querySelector("#aflodit-pet-pomodoro-end"),
      settingsModelEntry: root.querySelector("[data-settings-view='model']"),
      settingsRuntimeEntry: root.querySelector("[data-settings-view='runtime']"),
      settingsCommandsEntry: root.querySelector("[data-settings-view='commands']"),
      settingsDisplayEntry: root.querySelector("[data-settings-view='display']"),
      settingsAboutEntry: root.querySelector("[data-settings-view='about']"),
      settingsProvider: root.querySelector("#aflodit-pet-settings-provider"),
      settingsBaseUrl: root.querySelector("#aflodit-pet-settings-base-url"),
      settingsModelName: root.querySelector("#aflodit-pet-settings-model-name"),
      settingsApiKey: root.querySelector("#aflodit-pet-settings-api-key"),
      runtimeStatus: root.querySelector("#aflodit-pet-runtime-status"),
      runtimeSettingsStatus: root.querySelector("#aflodit-pet-runtime-settings-status"),
      runtimeProvider: root.querySelector("#aflodit-pet-runtime-provider"),
      runtimeModel: root.querySelector("#aflodit-pet-runtime-model"),
      runtimeProviderSelected: root.querySelector("#aflodit-pet-runtime-provider-selected"),
      runtimeProviderProtocol: root.querySelector("#aflodit-pet-runtime-provider-protocol"),
      runtimeProviderDefaultModel: root.querySelector("#aflodit-pet-runtime-provider-default-model"),
      runtimeProviderPermissionStatus: root.querySelector("#aflodit-pet-runtime-provider-permission-status"),
      runtimeProviderRequestEnabled: root.querySelector("#aflodit-pet-runtime-provider-request-enabled"),
      runtimeApiKey: root.querySelector("#aflodit-pet-runtime-api-key"),
      runtimeSaveMode: root.querySelector("#aflodit-pet-runtime-save-mode"),
      runtimeDebug: root.querySelector("#aflodit-pet-runtime-debug"),
      runtimeModeLabel: root.querySelector("#aflodit-pet-runtime-mode-label"),
      runtimeModeLocal: root.querySelector("#aflodit-pet-runtime-mode-local"),
      runtimeModeBackground: root.querySelector("#aflodit-pet-runtime-mode-background"),
      runtimeReadinessSummary: root.querySelector("#aflodit-pet-runtime-readiness-summary"),
      runtimeReadinessProvider: root.querySelector("#aflodit-pet-runtime-readiness-provider"),
      runtimeReadinessKey: root.querySelector("#aflodit-pet-runtime-readiness-key"),
      runtimeReadinessPermission: root.querySelector("#aflodit-pet-runtime-readiness-permission"),
      runtimeReadinessModel: root.querySelector("#aflodit-pet-runtime-readiness-model"),
      runtimeReadinessMode: root.querySelector("#aflodit-pet-runtime-readiness-mode"),
      runtimeReadinessRealTest: root.querySelector("#aflodit-pet-runtime-readiness-real-test"),
      runtimeHasKey: root.querySelector("#aflodit-pet-runtime-has-key"),
      runtimeKeyPreview: root.querySelector("#aflodit-pet-runtime-key-preview"),
      runtimeMessage: root.querySelector("#aflodit-pet-runtime-message"),
      runtimeSave: root.querySelector("#aflodit-pet-runtime-save"),
      runtimeSaveKey: root.querySelector("#aflodit-pet-runtime-save-key"),
      runtimeTestMock: root.querySelector("#aflodit-pet-runtime-test-mock"),
      runtimeCheckPermission: root.querySelector("#aflodit-pet-runtime-check-permission"),
      runtimeCheckReadiness: root.querySelector("#aflodit-pet-runtime-check-readiness"),
      runtimeRequestPermission: root.querySelector("#aflodit-pet-runtime-request-permission"),
      runtimeTestReal: root.querySelector("#aflodit-pet-runtime-test-real"),
      runtimeReload: root.querySelector("#aflodit-pet-runtime-reload"),
      runtimeClearKey: root.querySelector("#aflodit-pet-runtime-clear-key"),
      runtimeBack: root.querySelector("#aflodit-pet-runtime-back"),
      settingsMessage: root.querySelector("#aflodit-pet-settings-message"),
      settingsTest: root.querySelector("#aflodit-pet-settings-test"),
      settingsSave: root.querySelector("#aflodit-pet-settings-save"),
      settingsBack: root.querySelector("#aflodit-pet-settings-back"),
      settingsCancel: root.querySelector("#aflodit-pet-settings-cancel"),
      commandsBack: root.querySelector("#aflodit-pet-commands-back"),
      commandsClose: root.querySelector("#aflodit-pet-commands-close"),
      displayBack: root.querySelector("#aflodit-pet-display-back"),
      aboutBack: root.querySelector("#aflodit-pet-about-back"),
      uiEdgeSnap: root.querySelector("#aflodit-pet-ui-edge-snap"),
      uiInitialPosition: root.querySelector("#aflodit-pet-ui-initial-position"),
      uiOpacity: root.querySelector("#aflodit-pet-ui-opacity"),
      uiResetPosition: root.querySelector("#aflodit-pet-ui-reset-position"),
      mode: root.querySelector("#aflodit-pet-mode"),
      status: root.querySelector("#aflodit-pet-status"),
      contextBlock: root.querySelector("#aflodit-pet-context-block"),
      contextTitle: root.querySelector("#aflodit-pet-context-title"),
      selected: root.querySelector("#aflodit-pet-selected"),
      reply: root.querySelector("#aflodit-pet-reply"),
      refresh: root.querySelector("#aflodit-pet-refresh-action"),
      meta: root.querySelector("#aflodit-pet-meta"),
      pomodoroRing: root.querySelector("#aflodit-pet-pomodoro-ring"),
      ideaBulb: root.querySelector("#aflodit-pet-idea-bulb"),
      face: root.querySelector("#aflodit-pet-face"),
      eyeLeft: root.querySelector("#aflodit-pet-eye-left"),
      mouth: root.querySelector("#aflodit-pet-mouth"),
      eyeRight: root.querySelector("#aflodit-pet-eye-right"),
      faceMark: root.querySelector("#aflodit-pet-face-mark"),
      chatRow: root.querySelector("#aflodit-pet-chat-row"),
      chatInput: root.querySelector("#aflodit-pet-chat-input"),
      chatSend: root.querySelector("#aflodit-pet-chat-send"),
      quickButtons,
      quickButtonMap
    });

    traceLayout("DOM refs assigned and containment checked", {
      root: dom.root,
      avatar: dom.avatar,
      face: dom.face,
      card: dom.panel,
      auxiliaryPanel: dom.settings,
      rootContainsAvatar: dom.root.contains(dom.avatar),
      rootContainsFace: dom.root.contains(dom.face),
      rootContainsCard: dom.root.contains(dom.panel),
      rootContainsAuxiliaryPanel: dom.root.contains(dom.settings),
      afloditElementCount: document.querySelectorAll("[id*='aflodit'], [class*='aflodit']").length
    });
  }

  function enforceScrollBoxes() {
    Object.assign(dom.selected.style, {
      maxHeight: "104px",
      overflowY: "auto",
      overflowX: "hidden",
      lineHeight: "1.42",
      padding: "6px 8px"
    });

    Object.assign(dom.reply.style, {
      maxHeight: "148px",
      overflowY: "auto",
      overflowX: "hidden",
      lineHeight: "1.55",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      textOverflow: "clip"
    });
  }
