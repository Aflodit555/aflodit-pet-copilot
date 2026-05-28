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

        <div id="aflodit-pet-help" class="pet-floating-help hidden">
          <div class="pet-help-title">快捷说明</div>
          <div class="pet-help-line"><b>Enter</b>：发送 Chat</div>
          <div class="pet-help-line"><b>Esc</b>：关闭面板</div>
          <div class="pet-help-line"><b>@选区</b>：引用当前选中文本</div>
          <div class="pet-help-line"><b>@页面</b>：引用当前页面正文</div>
          <div class="pet-help-line"><b>@陪读</b>：进入陪读模式</div>
          <div class="pet-help-line pet-help-muted">例：@选区 解释这段话</div>
          <div class="pet-help-line pet-help-muted">例：@页面 这页主要讲什么</div>
        </div>

        <div id="aflodit-pet-panel" class="hidden bubble-type-normal">
          <div class="pet-title-row">
            <div class="pet-title">AFlodit Pet Copilot <span class="pet-version">${CONFIG.version}</span></div>
            <div class="pet-title-actions">
              <button id="aflodit-pet-help-button" class="pet-help-button" title="快捷说明">?</button>
              <div id="aflodit-pet-mode" class="pet-mode-tag">Chat</div>
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
    root.id = "aflodit-pet-root";
    root.innerHTML = renderTemplate();
    document.body.appendChild(root);

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
      help: root.querySelector("#aflodit-pet-help"),
      helpButton: root.querySelector("#aflodit-pet-help-button"),
      mode: root.querySelector("#aflodit-pet-mode"),
      status: root.querySelector("#aflodit-pet-status"),
      contextBlock: root.querySelector("#aflodit-pet-context-block"),
      contextTitle: root.querySelector("#aflodit-pet-context-title"),
      selected: root.querySelector("#aflodit-pet-selected"),
      reply: root.querySelector("#aflodit-pet-reply"),
      refresh: root.querySelector("#aflodit-pet-refresh-action"),
      meta: root.querySelector("#aflodit-pet-meta"),
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
