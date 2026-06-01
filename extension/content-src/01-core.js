const GLOBAL_KEY = "__AFLODIT_PET_COPILOT__";
  window[GLOBAL_KEY]?.destroy?.();
  document.getElementById("aflodit-pet-root")?.remove();
// =========================
  // 1. 常量 / 配置
  // =========================
  const ACTION = Object.freeze({
    CHAT: "chat",
    EXPLAIN: "explain_selection",
    SUMMARY: "summarize_page",
    TRANSLATE: "translate"
  });

  const UI = Object.freeze({ IDLE: "idle", MENU: "menu", PANEL: "panel" });

  const MODE = Object.freeze({
    NORMAL: "normal",
    READING: "reading"
  });

  const ACTIVITY = Object.freeze({
    IDLE: "idle",
    OBSERVING: "observing",
    TRACKING_MOUSE: "tracking_mouse",
    THINKING: "thinking",
    RESPONDING: "responding"
  });

  const CONFIG = Object.freeze({
    version: "0.6.8",
    backendUrl: "http://127.0.0.1:3001/api/pet",
    streamUrl: "http://127.0.0.1:3001/api/pet-stream",
    settingsUrl: "http://127.0.0.1:3001/api/settings",
    streamEnabled: true,
    localClientToken: "aflodit-pet-local-dev",
    debug: false,
    storage: Object.freeze({
      positionKey: "aflodit_pet_position"
    }),
    limits: Object.freeze({
      action: 32,
      userText: 1000,
      selectedText: 4000,
      pageTitle: 256,
      pageUrl: 2048,
      pageText: 6000,
      characterState: 64,
      pagePreview: 1000
    }),
    reading: Object.freeze({
      mouseRange: 260,
      mouseHoldMs: 900,
      glanceDelay: Object.freeze({ min: 1200, max: 2400 })
    }),
    face: Object.freeze({
      menuLookDelay: Object.freeze({ min: 700, max: 1300 }),
      replyPeekStartMs: 10000,
      replyPeekHoldMs: Object.freeze({ min: 900, max: 1400 }),
      replyPeekGapMs: Object.freeze({ min: 3500, max: 7000 }),
      ideaBulbHoldMs: 1180,
      eyeMoveRange: 6,
      mouthMoveRange: 3,
      vectorNormX: 120,
      vectorNormY: 100
    }),
    drag: Object.freeze({
      avatarSize: 64,
      initialOffset: 24,
      viewportMargin: 12,
      dockSnapThreshold: 48,
      dockMargin: 24,
      dragThreshold: 4,
      panelGap: 20,
      helpGap: 10,
      menuWidth: 240,
      menuHeight: 190,
      floatingWidth: 360,
      helpHeight: 132
    })
  });

  const ACTION_CONFIG = Object.freeze({
    [ACTION.CHAT]: Object.freeze({
      label: "Chat",
      refreshable: false,
      needsSelection: false,
      needsUserText: true,
      sendsPageText: false,
      context: "none",
      idle: "马上开始对话吧。",
      loading: "正在执行：Chat",
      empty: "请输入要发送的消息。"
    }),
    [ACTION.EXPLAIN]: Object.freeze({
      label: "Explain",
      refreshable: true,
      needsSelection: true,
      needsUserText: false,
      sendsPageText: false,
      context: "selection",
      contextTitle: "选中文本",
      idle: "正在准备解释选中文本。",
      loading: "正在执行：Explain",
      empty: "请先在网页中选中一段文本。解释和翻译都依赖 selected_text。"
    }),
    [ACTION.SUMMARY]: Object.freeze({
      label: "Summarize",
      refreshable: true,
      needsSelection: false,
      needsUserText: false,
      sendsPageText: true,
      context: "page",
      contextTitle: "当前页面",
      idle: "正在准备总结当前页面。",
      loading: "正在执行：Summarize",
      empty: "当前无法读取页面内容，暂时不能总结这个页面。"
    }),
    [ACTION.TRANSLATE]: Object.freeze({
      label: "Translate",
      refreshable: true,
      needsSelection: true,
      needsUserText: false,
      sendsPageText: false,
      context: "selection",
      contextTitle: "选中文本",
      idle: "正在准备翻译选中文本。",
      loading: "正在执行：Translate",
      empty: "请先在网页中选中一段文本。解释和翻译都依赖 selected_text。"
    })
  });

  const FACE_PARTS = Object.freeze({
    neutral: Object.freeze({ left: "●", mouth: "ᴗ", right: "●", mark: "" }),
    happy: Object.freeze({ left: "●", mouth: "ᴗ", right: "●", mark: "" }),
    // 思考中保留原眼型和原眼位；嘴巴由 FaceController 渲染为固定宽度的流动波浪线。
    thinking: Object.freeze({ left: "●", mouth: "ᴗ", right: "●", mark: "" }),
    // 返回成功瞬间使用：配合灯泡特效，表达“想到了”。
    idea: Object.freeze({ left: "●", mouth: "o", right: "●", mark: "!" }),
    confused: Object.freeze({ left: "・", mouth: "_", right: "・", mark: "?" }),
    error: Object.freeze({ left: "×", mouth: "_", right: "×", mark: "" })
  });

  const READABLE_SELECTORS = Object.freeze([
    "article",
    "main",
    "[role='main']",
    "#mw-content-text .mw-parser-output",
    ".mw-parser-output",
    "article.markdown-body",
    "section",
    "div"
  ]);

  const READABLE_SAFE_REMOVE_SELECTORS = Object.freeze([
    "#aflodit-pet-root",
    "script",
    "style",
    "noscript",
    "template"
  ]);

  // 以右下角默认状态为基准：三气泡在头像左上侧，距离接近初版。
  // 其它象限通过 dx / dy 镜像得到，不再单独维护四套 CSS。
  const MENU_BUTTON_OFFSETS = Object.freeze([
    { key: ACTION.TRANSLATE, dx: -12, dy: -84 },
    { key: ACTION.EXPLAIN, dx: -104, dy: -36 },
    { key: ACTION.SUMMARY, dx: -118, dy: 18 }
  ]);
// =========================
  // 2. 运行态
  // =========================
  const state = {
    ui: UI.IDLE,
    mode: MODE.NORMAL,
    activity: ACTIVITY.IDLE,
    action: ACTION.CHAT,
    selectedText: "",
    running: false,
    requestId: 0,
    lookTimer: null,
    replyPeekTimer: null,
    readingTimer: null,
    ideaTimer: null,
    lastMouseAt: 0,
    position: {
      mode: "docked",
      dockX: "right",
      dockY: "bottom",
      offsetX: CONFIG.drag.initialOffset,
      offsetY: CONFIG.drag.initialOffset,
      x: 0,
      y: 0,
      updatedAt: 0
    },
    layout: {
      menuVariant: "br",
      panelPlacement: "top"
    },
    drag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      moved: false,
      suppressClick: false
    }
  };

  const dom = {};
  const cleanups = [];
// =========================
  // 3. 工具函数
  // =========================
  const log = (...args) => CONFIG.debug && console.log("[AFlodit Pet]", ...args);
  const text = (value) => String(value ?? "").trim();
  const limit = (value, max) => text(value).slice(0, max);
  const actionConfig = (action) => ACTION_CONFIG[action] || ACTION_CONFIG[ACTION.CHAT];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const randomBetween = (min, max) => min + Math.random() * (max - min);

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }
// =========================
  // 9. 公共状态设置
  // =========================
  function setMode(mode = MODE.NORMAL) {
    const safeMode = Object.values(MODE).includes(mode) ? mode : MODE.NORMAL;
    state.mode = safeMode;
    if (dom.root) {
      dom.root.dataset.mode = safeMode;
      dom.root.classList.toggle("pet-mode-reading", safeMode === MODE.READING);
    }
  }

  function setActivity(activity = ACTIVITY.IDLE) {
    const safeActivity = Object.values(ACTIVITY).includes(activity) ? activity : ACTIVITY.IDLE;
    state.activity = safeActivity;
    if (dom.root) dom.root.dataset.activity = safeActivity;
  }

  function setBubbleType(type = "normal") {
    dom.panel.classList.remove("bubble-type-normal", "bubble-type-info", "bubble-type-warning", "bubble-type-error");
    dom.panel.classList.add(`bubble-type-${type || "normal"}`);
  }

  function setMeta(emotion, motion) {
    dom.meta.textContent = `emotion: ${emotion} | motion: ${motion}`;
  }

  function setRunning(running) {
    state.running = running;
    dom.quickButtons.forEach((button) => { button.disabled = running; });
    dom.chatSend.disabled = running;
    dom.chatInput.disabled = running;
    dom.refresh.disabled = running;
  }
