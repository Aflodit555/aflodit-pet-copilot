// =========================
  // 10. UI 控制
  // =========================
  function clearHoverCloseTimer() {
    if (!state.hoverCloseTimer) return;
    window.clearTimeout(state.hoverCloseTimer);
    state.hoverCloseTimer = null;
  }

  function isTextInputFocused() {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    return !!active.closest?.("input, textarea, select, [contenteditable='true']");
  }

  function isElementVisible(element) {
    return !!element && !element.classList.contains("hidden");
  }

  function expandedRectContains(rect, clientX, clientY, padding) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return clientX >= rect.left - padding
      && clientX <= rect.right + padding
      && clientY >= rect.top - padding
      && clientY <= rect.bottom + padding;
  }

  function isPointerInBubbleSafeZone(clientX, clientY) {
    const padding = CONFIG.hoverMenu.safeZonePadding;
    const elements = [
      dom.avatar,
      isElementVisible(dom.menu) ? dom.menu : null,
      ...(dom.quickButtons || []).filter(isElementVisible)
    ];

    return elements.some((element) => expandedRectContains(element.getBoundingClientRect(), clientX, clientY, padding));
  }

  function canHoverOpenMenu() {
    return dom.root?.classList.contains("aflodit-ready")
      && state.ui === UI.IDLE
      && state.mode === MODE.NORMAL
      && !state.running
      && !state.drag.active
      && !state.drag.suppressClick
      && !isTextInputFocused()
      && !isElementVisible(dom.settings)
      && !isElementVisible(dom.pomodoroSettings)
      && !isElementVisible(dom.pomodoroNotice);
  }

  function scheduleHoverClose() {
    if (state.menuOpenReason !== "hover" || state.hoverCloseTimer) return;
    state.hoverCloseTimer = window.setTimeout(() => {
      state.hoverCloseTimer = null;
      const pointer = state.lastPointer;
      if (state.menuOpenReason !== "hover") return;
      if (pointer && isPointerInBubbleSafeZone(pointer.clientX, pointer.clientY)) return;
      UIController.closeHoverMenu();
    }, CONFIG.hoverMenu.closeDelayMs);
  }

  function handleHoverMenuPointerMove(event) {
    state.lastPointer = { clientX: event.clientX, clientY: event.clientY };

    if (state.menuOpenReason === "hover") {
      if (isPointerInBubbleSafeZone(event.clientX, event.clientY)) {
        clearHoverCloseTimer();
      } else {
        scheduleHoverClose();
      }
      return;
    }

    if (canHoverOpenMenu() && isPointerInBubbleSafeZone(event.clientX, event.clientY)) {
      UIController.openMenu("hover");
    }
  }

  const UIController = {
    closeMenu(resetLook = true) {
      clearHoverCloseTimer();
      dom.menu.classList.add("hidden");
      state.menuOpenReason = null;
      FaceController.stopLookLoop(resetLook);
    },

    openMenu(reason = "click") {
      clearHoverCloseTimer();
      FaceController.stopReplyPeekLoop(true);
      Extractor.updateSelectedText();
      this.closePanel();
      dom.menu.classList.remove("hidden");
      state.ui = UI.MENU;
      state.menuOpenReason = reason;
      LayoutManager.updateFloatingLayout();
      FaceController.startMenuLookLoop();
    },

    closeHoverMenu() {
      if (state.menuOpenReason !== "hover") return;
      this.closeMenu(true);
      state.ui = UI.IDLE;
      state.action = ACTION.CHAT;
      FaceController.resetFace();
    },

    closePanel() {
      clearHoverCloseTimer();
      dom.panel.classList.add("hidden");
      dom.refresh.classList.add("hidden");
      this.closeSettings();
      globalThis.AFloditPomodoroController?.hidePanels?.();
    },

    closeSettings() {
      clearHoverCloseTimer();
      dom.settings.classList.add("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
    },

    toggleSettings() {
      clearHoverCloseTimer();
      const willOpen = dom.settings.classList.contains("hidden");
      if (!willOpen) {
        this.closeSettings();
        LayoutManager.schedulePetLayout();
        return;
      }

      dom.settings.classList.remove("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
      SettingsManager.load();
    },

    openModelSettings() {
      clearHoverCloseTimer();
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.remove("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
      SettingsManager.load();
    },

    openCommandHelp() {
      clearHoverCloseTimer();
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsCommands.classList.remove("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
    },

    openDisplaySettings() {
      clearHoverCloseTimer();
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.remove("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      UiSettingsStore.hydrateControls();
      LayoutManager.schedulePetLayout();
    },

    openAbout() {
      clearHoverCloseTimer();
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.remove("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
    },

    backToSettingsMenu() {
      clearHoverCloseTimer();
      dom.settingsModel.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
    },

    showSettingsNotice(message) {
      dom.settingsMessage.textContent = message;
      LayoutManager.schedulePetLayout();
    },

    openPanel(action) {
      clearHoverCloseTimer();
      const config = actionConfig(action);
      state.action = action;
      Extractor.updateSelectedText();
      this.closeMenu(true);
      this.closeSettings();
      enforceScrollBoxes();

      state.ui = UI.PANEL;
      dom.panel.classList.remove("hidden");
      dom.mode.textContent = config.label;
      dom.status.textContent = config.idle;
      dom.reply.textContent = "暂无回复。";
      dom.reply.scrollTop = 0;
      dom.refresh.classList.toggle("hidden", !config.refreshable);
      setBubbleType("normal");
      setMeta("neutral", "idle");

      dom.chatRow.classList.toggle("hidden", !config.needsUserText);
      dom.contextBlock.classList.toggle("hidden", config.context === "none");

      if (config.needsUserText) {
        window.setTimeout(() => dom.chatInput.focus(), 0);
      } else if (config.context === "page") {
        dom.contextTitle.textContent = config.contextTitle;
        dom.selected.textContent = Extractor.getPagePreview() || "当前无法读取页面内容。";
      } else if (config.context === "selection") {
        dom.contextTitle.textContent = config.contextTitle;
        dom.selected.textContent = state.selectedText || "暂无选中文本。";
      }

      LayoutManager.updateFloatingLayout();
    },

    showWarning(message) {
      clearHoverCloseTimer();
      FaceController.stopReplyPeekLoop(true);
      this.closeMenu(false);
      dom.panel.classList.remove("hidden");
      state.ui = UI.PANEL;
      dom.status.textContent = "无法执行当前动作。";
      dom.reply.textContent = message;
      dom.reply.scrollTop = 0;
      setMeta("confused", "shake");
      setBubbleType("warning");
      LayoutManager.updateFloatingLayout();
      FaceController.reactFace({ emotion: "confused", motion: "shake" });
    },

    showLoading(action) {
      clearHoverCloseTimer();
      FaceController.stopReplyPeekLoop(true);
      const config = actionConfig(action);
      dom.status.textContent = config.loading;
      dom.reply.textContent = "思考中...";
      delete dom.reply.dataset.streaming;
      dom.reply.scrollTop = 0;
      setMeta("thinking", "focus");
      setBubbleType("info");
      LayoutManager.updateFloatingLayout();
      FaceController.startThinkingFace();
    },

    showStreamingStart(action) {
      this.showLoading(action);
      dom.status.textContent = "正在接收流式回复...";
      dom.reply.textContent = "";
      dom.reply.dataset.streaming = "true";
      setMeta("thinking", "think");
    },

    appendStreamingDelta(delta = "") {
      if (!delta) return;
      if (dom.reply.dataset.streaming !== "true") {
        dom.reply.textContent = "";
        dom.reply.dataset.streaming = "true";
      }
      dom.reply.textContent += delta;
      dom.reply.scrollTop = dom.reply.scrollHeight;
      LayoutManager.updateFloatingLayout();
    },

    resolveFinalFace(result = {}) {
      const bubbleType = result.bubble_type || "normal";
      if (bubbleType === "error" || result.emotion === "error") return { emotion: "error", motion: "shake" };
      if (bubbleType === "warning" || result.emotion === "confused") return { emotion: "confused", motion: "shake" };
      return { emotion: "idea", motion: "bulb" };
    },

    showResult(result = {}) {
      const finalFace = this.resolveFinalFace(result);
      enforceScrollBoxes();
      dom.status.textContent = "本地后端已返回结果。";
      dom.reply.textContent = result.reply || "后端没有返回 reply。";
      delete dom.reply.dataset.streaming;
      dom.reply.scrollTop = 0;
      setMeta(finalFace.emotion, finalFace.motion);
      setBubbleType(result.bubble_type || "normal");
      LayoutManager.updateFloatingLayout();
      if (finalFace.motion === "bulb") {
        FaceController.playIdeaBulb();
      } else {
        FaceController.reactFace(finalFace);
        if (finalFace.emotion === "happy") FaceController.startReplyPeekLoop();
      }
    },

    showError(error) {
      FaceController.stopReplyPeekLoop(true);
      dom.status.textContent = "请求本地后端失败。";
      dom.reply.textContent = String(error?.message || error);
      delete dom.reply.dataset.streaming;
      dom.reply.scrollTop = 0;
      setMeta("error", "shake");
      setBubbleType("error");
      LayoutManager.updateFloatingLayout();
      FaceController.reactFace({ emotion: "error", motion: "shake" });
    },

    closeAll() {
      clearHoverCloseTimer();
      state.requestId += 1;
      FaceController.stopReadingLoop(true);
      setMode(MODE.NORMAL);
      setActivity(ACTIVITY.IDLE);
      dom.avatar.title = "AFlodit Pet Copilot";
      this.closeMenu(false);
      this.closePanel();
      state.ui = UI.IDLE;
      state.action = ACTION.CHAT;
      setRunning(false);
      setBubbleType("normal");
      FaceController.resetFace();
    },

    enterReadingMode() {
      clearHoverCloseTimer();
      state.requestId += 1;
      setRunning(false);
      this.closeMenu(false);
      this.closePanel();
      FaceController.stopLookLoop(false);
      FaceController.stopReplyPeekLoop(false);
      FaceController.hideIdeaBulb({ clearTimer: true });
      FaceController.clearMotion();

      state.ui = UI.IDLE;
      state.action = ACTION.CHAT;
      setMode(MODE.READING);
      setActivity(ACTIVITY.OBSERVING);

      dom.avatar.title = "陪读模式中：点击退出并返回 Chat";
      FaceController.setEmotion("happy");
      FaceController.setLookCenter();
      FaceController.startReadingLoop();
    },

    exitReadingMode({ openChat = true } = {}) {
      clearHoverCloseTimer();
      if (state.mode !== MODE.READING) {
        if (openChat) this.openPanel(ACTION.CHAT);
        return;
      }

      state.requestId += 1;
      FaceController.stopReadingLoop(true);
      setMode(MODE.NORMAL);
      setActivity(ACTIVITY.IDLE);
      dom.avatar.title = "AFlodit Pet Copilot";
      FaceController.resetFace();
      if (openChat) this.openPanel(ACTION.CHAT);
    }
  };
// =========================
  // 10.1 Settings API
  // =========================
  const SettingsManager = {
    busy: false,

    headers() {
      return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.localClientToken}`
      };
    },

    setBusy(busy) {
      this.busy = busy;
      dom.settingsSave.disabled = busy;
      dom.settingsTest.disabled = busy;
    },

    async request(path = "", options = {}) {
      const response = await fetch(`${CONFIG.settingsUrl}${path}`, {
        ...options,
        headers: {
          ...this.headers(),
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error?.message || data?.message || `Settings request failed: ${response.status}`;
        const error = new Error(message);
        error.data = data;
        throw error;
      }
      return data;
    },

    apiKeyPlaceholder(settings) {
      const model = settings?.model || {};
      return model.apiKeySet ? `Saved: ${model.apiKeyPreview || "configured"}` : "Not saved";
    },

    hydrate(settings) {
      const model = settings?.model || {};
      dom.settingsProvider.value = model.provider || "mock";
      dom.settingsBaseUrl.value = model.baseUrl || "";
      dom.settingsModelName.value = model.model || "";
      dom.settingsApiKey.value = "";
      dom.settingsApiKey.placeholder = this.apiKeyPlaceholder(settings);
    },

    readForm() {
      const model = {
        provider: dom.settingsProvider.value,
        baseUrl: dom.settingsBaseUrl.value.trim(),
        model: dom.settingsModelName.value.trim()
      };
      const apiKey = dom.settingsApiKey.value.trim();
      if (apiKey) model.apiKey = apiKey;
      return { model };
    },

    userMessageForCode(code, fallback) {
      const messages = {
        MODEL_AUTH_FAILED: "Authentication failed. Check your API key.",
        MODEL_TIMEOUT: "Request timed out.",
        MODEL_NETWORK_ERROR: "Network error. Check the base URL.",
        MODEL_BAD_RESPONSE: "Provider returned an invalid response.",
        MODEL_CONFIG_INVALID: "Invalid model settings.",
        SETTINGS_AUTH_REQUIRED: "Settings token rejected by local backend."
      };
      return messages[code] || fallback || "Settings request failed.";
    },

    async load() {
      if (this.busy) return;
      this.setBusy(true);
      try {
        const data = await this.request("");
        this.hydrate(data.settings);
      } catch (error) {
        const code = error?.data?.error?.code || error?.data?.code;
        UIController.showSettingsNotice(this.userMessageForCode(code, error.message));
      } finally {
        this.setBusy(false);
      }
    },

    async save() {
      if (this.busy) return;
      this.setBusy(true);
      UIController.showSettingsNotice("Saving...");
      try {
        const data = await this.request("", {
          method: "PUT",
          body: JSON.stringify(this.readForm())
        });
        this.hydrate(data.settings);
        UIController.showSettingsNotice("Saved locally.");
      } catch (error) {
        const code = error?.data?.error?.code || error?.data?.code;
        UIController.showSettingsNotice(this.userMessageForCode(code, error.message));
      } finally {
        this.setBusy(false);
      }
    },

    async test() {
      if (this.busy) return;
      this.setBusy(true);
      UIController.showSettingsNotice("Testing...");
      try {
        const data = await this.request("/test", {
          method: "POST",
          body: JSON.stringify(this.readForm())
        });
        if (data.ok) {
          UIController.showSettingsNotice(`Connected. ${data.latencyMs || 0}ms.`);
        } else {
          UIController.showSettingsNotice(this.userMessageForCode(data.code, data.message));
        }
      } catch (error) {
        const code = error?.data?.error?.code || error?.data?.code;
        UIController.showSettingsNotice(this.userMessageForCode(code, error.message));
      } finally {
        this.setBusy(false);
      }
    }
  };

// =========================
  // 12. 拖拽
  // =========================

  const UiSettingsStore = {
    memory: null,

    defaults() {
      return {
        positionMode: "docked",
        edgeSnap: true,
        initialPosition: "bottom-right",
        savedPosition: null,
        opacity: 1
      };
    },

    sanitize(raw = {}) {
      const base = this.defaults();
      const positionMode = raw.positionMode === "free" ? "free" : "docked";
      const initialPosition = ["bottom-right", "bottom-left", "top-right", "top-left", "current"].includes(raw.initialPosition)
        ? raw.initialPosition
        : base.initialPosition;
      const opacity = [1, 0.8, 0.6].includes(Number(raw.opacity)) ? Number(raw.opacity) : base.opacity;
      const savedPosition = raw.savedPosition
        && Number.isFinite(Number(raw.savedPosition.x))
        && Number.isFinite(Number(raw.savedPosition.y))
        ? { x: Number(raw.savedPosition.x), y: Number(raw.savedPosition.y) }
        : null;

      return {
        positionMode,
        edgeSnap: typeof raw.edgeSnap === "boolean" ? raw.edgeSnap : base.edgeSnap,
        initialPosition,
        savedPosition,
        opacity
      };
    },

    storageArea() {
      return globalThis.chrome?.storage?.local || null;
    },

    async load() {
      traceLayout("UI settings load starts", {
        storageAvailable: !!this.storageArea()?.get
      });
      const area = this.storageArea();
      if (!area?.get) {
        state.uiSettings = this.sanitize(this.memory || state.uiSettings);
        traceLayout("UI settings load finishes", {
          source: "memory/default",
          initialPosition: state.uiSettings.initialPosition,
          edgeSnap: state.uiSettings.edgeSnap,
          opacity: state.uiSettings.opacity,
          hasSavedPosition: !!state.uiSettings.savedPosition
        });
        return state.uiSettings;
      }

      return new Promise((resolve) => {
        try {
          area.get(CONFIG.storage.uiSettingsKey, (result = {}) => {
            if (globalThis.chrome?.runtime?.lastError) {
              log("Failed to load UI settings.", globalThis.chrome.runtime.lastError.message);
              state.uiSettings = this.sanitize(this.memory || state.uiSettings);
              traceLayout("UI settings load finishes", {
                source: "chrome.storage.local error fallback",
                initialPosition: state.uiSettings.initialPosition,
                edgeSnap: state.uiSettings.edgeSnap,
                opacity: state.uiSettings.opacity,
                hasSavedPosition: !!state.uiSettings.savedPosition
              });
              resolve(state.uiSettings);
              return;
            }
            state.uiSettings = this.sanitize(result[CONFIG.storage.uiSettingsKey]);
            this.memory = state.uiSettings;
            traceLayout("UI settings load finishes", {
              source: "chrome.storage.local",
              initialPosition: state.uiSettings.initialPosition,
              edgeSnap: state.uiSettings.edgeSnap,
              opacity: state.uiSettings.opacity,
              hasSavedPosition: !!state.uiSettings.savedPosition
            });
            resolve(state.uiSettings);
          });
        } catch (error) {
          log("Failed to load UI settings.", error);
          state.uiSettings = this.sanitize(this.memory || state.uiSettings);
          traceLayout("UI settings load finishes", {
            source: "exception fallback",
            initialPosition: state.uiSettings.initialPosition,
            edgeSnap: state.uiSettings.edgeSnap,
            opacity: state.uiSettings.opacity,
            hasSavedPosition: !!state.uiSettings.savedPosition
          });
          resolve(state.uiSettings);
        }
      });
    },

    async save(settings = state.uiSettings) {
      const sanitized = this.sanitize(settings);
      state.uiSettings = sanitized;
      this.memory = sanitized;
      const area = this.storageArea();
      if (!area?.set) return sanitized;

      return new Promise((resolve) => {
        try {
          area.set({ [CONFIG.storage.uiSettingsKey]: sanitized }, () => {
            if (globalThis.chrome?.runtime?.lastError) {
              log("Failed to save UI settings.", globalThis.chrome.runtime.lastError.message);
            }
            resolve(sanitized);
          });
        } catch (error) {
          log("Failed to save UI settings.", error);
          resolve(sanitized);
        }
      });
    },

    applyOpacity() {
      if (dom.pet) dom.pet.style.opacity = String(state.uiSettings.opacity);
    },

    hydrateControls() {
      if (!dom.uiEdgeSnap) return;
      dom.uiEdgeSnap.value = state.uiSettings.edgeSnap ? "on" : "off";
      dom.uiInitialPosition.value = state.uiSettings.initialPosition;
      dom.uiOpacity.value = String(state.uiSettings.opacity);
    },

    currentFreePosition(position = state.position) {
      const rect = Geometry.getPositioningRect(position);
      const clamped = Geometry.clampFullPosition(rect.left, rect.top);
      return { x: clamped.x, y: clamped.y };
    },

    async saveCurrentPosition(position = state.position) {
      if (state.uiSettings.initialPosition !== "current") return;
      state.uiSettings = this.sanitize({
        ...state.uiSettings,
        savedPosition: this.currentFreePosition(position)
      });
      this.hydrateControls();
      await this.save();
    },

    async setEdgeSnap(value) {
      state.uiSettings = this.sanitize({ ...state.uiSettings, edgeSnap: value === "on" });
      await this.save();
      this.hydrateControls();
    },

    async setInitialPosition(initialPosition) {
      const next = {
        ...state.uiSettings,
        initialPosition,
        savedPosition: initialPosition === "current" ? this.currentFreePosition() : state.uiSettings.savedPosition
      };
      state.uiSettings = this.sanitize(next);
      await this.save();
      this.hydrateControls();

      if (state.uiSettings.initialPosition === "current") {
        LayoutManager.setRootPosition({
          mode: "free",
          dockX: null,
          dockY: null,
          offsetX: 0,
          offsetY: 0,
          x: state.uiSettings.savedPosition.x,
          y: state.uiSettings.savedPosition.y,
          updatedAt: Date.now()
        }, { snap: false, persist: false });
        LayoutManager.schedulePetLayout();
        return;
      }

      LayoutManager.setRootPosition(LayoutManager.positionForCorner(state.uiSettings.initialPosition), {
        snap: false,
        persist: false
      });
      LayoutManager.schedulePetLayout();
    },

    async setOpacity(opacity) {
      state.uiSettings = this.sanitize({ ...state.uiSettings, opacity: Number(opacity) });
      this.applyOpacity();
      await this.save();
      this.hydrateControls();
      LayoutManager.updateFloatingLayout();
      LayoutManager.schedulePetLayout();
    },

    async resetPosition() {
      state.uiSettings = this.sanitize({
        ...state.uiSettings,
        initialPosition: "bottom-right",
        savedPosition: null
      });
      await this.save();
      this.hydrateControls();
      LayoutManager.setRootPosition(LayoutManager.positionForCorner("bottom-right"), {
        snap: false,
        persist: false
      });
      LayoutManager.schedulePetLayout();
    }
  };

  const DragManager = {
    begin(event) {
      if (event.button !== undefined && event.button !== 0) return;

      const position = Geometry.clampPosition(state.position);
      Object.assign(state.drag, {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
        moved: false
      });

      dom.root.classList.add("pet-dragging");
      dom.avatar.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },

    move(event) {
      if (!state.drag.active || event.pointerId !== state.drag.pointerId) return;
      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      const distance = Math.hypot(dx, dy);
      if (!state.drag.moved && distance < CONFIG.drag.dragThreshold) return;

      state.drag.moved = true;
      if (state.menuOpenReason === "hover") UIController.closeHoverMenu();
      LayoutManager.setRootPosition({
        x: state.drag.originX + dx,
        y: state.drag.originY + dy,
        mode: "free"
      }, { snap: false, persist: false });

      event.preventDefault();
    },

    end(event) {
      if (!state.drag.active || event.pointerId !== state.drag.pointerId) return;

      const didMove = state.drag.moved;
      state.drag.active = false;
      state.drag.pointerId = null;
      dom.root.classList.remove("pet-dragging");
      dom.avatar.releasePointerCapture?.(event.pointerId);

      if (didMove) {
        LayoutManager.setRootPosition(state.position, { snap: true });
        LayoutManager.schedulePetLayout();
        state.drag.suppressClick = true;
        window.setTimeout(() => { state.drag.suppressClick = false; }, 160);
      }
    }
  };
// =========================
  // 13. 事件绑定
  // =========================

  const ScrollGuard = {
    isScrollable(element, axis) {
      if (!element || element === document || element === window) return false;
      const style = window.getComputedStyle(element);
      const overflow = axis === "x" ? style.overflowX : style.overflowY;
      if (!/(auto|scroll|overlay)/i.test(overflow)) return false;
      return axis === "x"
        ? element.scrollWidth > element.clientWidth + 1
        : element.scrollHeight > element.clientHeight + 1;
    },

    findScrollable(target, axis) {
      let node = target;
      while (node && node !== dom.root) {
        if (node.nodeType === Node.ELEMENT_NODE && this.isScrollable(node, axis)) return node;
        node = node.parentElement;
      }
      return this.isScrollable(dom.root, axis) ? dom.root : null;
    },

    canScroll(element, axis, delta) {
      if (!element) return false;
      if (axis === "x") {
        if (delta < 0) return element.scrollLeft > 0;
        if (delta > 0) return element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
        return false;
      }
      if (delta < 0) return element.scrollTop > 0;
      if (delta > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      return false;
    },

    handleWheel(event) {
      if (!dom.root?.contains(event.target)) return;

      const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y";
      const delta = axis === "x" ? event.deltaX : event.deltaY;
      const scrollable = this.findScrollable(event.target, axis);

      if (scrollable && this.canScroll(scrollable, axis, delta)) {
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }
  };
  function bindEvents() {
    on(dom.root, "wheel", (event) => ScrollGuard.handleWheel(event), { capture: true, passive: false });
    on(document, "selectionchange", () => Extractor.updateSelectedText());
    on(document, "mousemove", (event) => FaceController.handleReadingMouseMove(event), { passive: true });
    on(document, "pointermove", (event) => handleHoverMenuPointerMove(event), { passive: true });
    on(window, "resize", () => LayoutManager.handleViewportResize());

    on(dom.avatar, "pointerdown", (event) => DragManager.begin(event));
    on(dom.avatar, "pointermove", (event) => DragManager.move(event));
    on(dom.avatar, "pointerup", (event) => DragManager.end(event));
    on(dom.avatar, "pointercancel", (event) => DragManager.end(event));

    on(dom.avatar, "click", (event) => {
      event.stopPropagation();

      if (state.drag.suppressClick) {
        event.preventDefault();
        state.drag.suppressClick = false;
        return;
      }

      if (state.mode === MODE.READING) {
        UIController.exitReadingMode({ openChat: true });
        return;
      }

      if (state.ui === UI.IDLE) return UIController.openMenu("click");
      if (state.ui === UI.MENU && state.menuOpenReason === "hover") {
        state.menuOpenReason = "click";
        clearHoverCloseTimer();
        return;
      }
      if (state.ui === UI.MENU) return UIController.openPanel(ACTION.CHAT);
      UIController.closeAll();
    });

    on(dom.menu, "click", (event) => event.stopPropagation());
    on(dom.panel, "click", (event) => event.stopPropagation());
    on(dom.settings, "click", (event) => event.stopPropagation());

    on(dom.settingsButton, "click", (event) => {
      event.stopPropagation();
      UIController.toggleSettings();
    });

    on(dom.settingsModelEntry, "click", (event) => {
      event.stopPropagation();
      UIController.openModelSettings();
    });

    on(dom.settingsCommandsEntry, "click", (event) => {
      event.stopPropagation();
      UIController.openCommandHelp();
    });

    on(dom.settingsDisplayEntry, "click", (event) => {
      event.stopPropagation();
      UIController.openDisplaySettings();
    });

    on(dom.settingsAboutEntry, "click", (event) => {
      event.stopPropagation();
      UIController.openAbout();
    });

    on(dom.settingsTest, "click", (event) => {
      event.stopPropagation();
      SettingsManager.test();
    });

    on(dom.settingsSave, "click", (event) => {
      event.stopPropagation();
      SettingsManager.save();
    });

    on(dom.settingsBack, "click", (event) => {
      event.stopPropagation();
      UIController.backToSettingsMenu();
    });

    on(dom.settingsCancel, "click", (event) => {
      event.stopPropagation();
      UIController.closeSettings();
      LayoutManager.schedulePetLayout();
    });

    on(dom.commandsBack, "click", (event) => {
      event.stopPropagation();
      UIController.backToSettingsMenu();
    });

    on(dom.commandsClose, "click", (event) => {
      event.stopPropagation();
      UIController.closeSettings();
      LayoutManager.schedulePetLayout();
    });

    on(dom.displayBack, "click", (event) => {
      event.stopPropagation();
      UIController.backToSettingsMenu();
    });

    on(dom.aboutBack, "click", (event) => {
      event.stopPropagation();
      UIController.backToSettingsMenu();
    });

    on(dom.uiEdgeSnap, "change", () => {
      UiSettingsStore.setEdgeSnap(dom.uiEdgeSnap.value);
    });

    on(dom.uiInitialPosition, "change", () => {
      UiSettingsStore.setInitialPosition(dom.uiInitialPosition.value);
    });

    on(dom.uiOpacity, "change", () => {
      UiSettingsStore.setOpacity(dom.uiOpacity.value);
    });

    on(dom.uiResetPosition, "click", (event) => {
      event.stopPropagation();
      UiSettingsStore.resetPosition();
    });

    dom.quickButtons.forEach((button) => {
      on(button, "click", (event) => {
        event.stopPropagation();
        ActionRunner.runAction(button.dataset.action);
      });
    });

    on(dom.refresh, "click", (event) => {
      event.stopPropagation();
      if (actionConfig(state.action).refreshable) ActionRunner.runAction(state.action);
    });

    on(dom.chatSend, "click", () => {
      const value = dom.chatInput.value;
      const localCommand = Extractor.parseLocalCommand(value);
      dom.chatInput.value = "";

      if (localCommand?.type === "enter_reading") return UIController.enterReadingMode();
      if (localCommand?.type === "exit_reading") return UIController.exitReadingMode({ openChat: true });
      if (localCommand?.type === "open_pomodoro") return globalThis.AFloditPomodoroController?.openSettings?.();
      if (localCommand?.type === "stop_pomodoro") return globalThis.AFloditPomodoroController?.stop?.();
      if (localCommand?.type === "pomodoro_status") return globalThis.AFloditPomodoroController?.showStatus?.();
      ActionRunner.runAction(ACTION.CHAT, value);
    });

    on(dom.chatInput, "keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        dom.chatSend.click();
      }
    });

    on(document, "click", (event) => {
      if (state.ui === UI.MENU && !dom.pet?.contains(event.target)) UIController.closeAll();
    });

    on(document, "keydown", (event) => {
      if (event.key === "Escape" && state.ui !== UI.IDLE) UIController.closeAll();
    });
  }
// =========================
  // 14. 生命周期
  // =========================
  function destroy() {
    state.requestId += 1;
    clearHoverCloseTimer();
    cleanups.splice(0).forEach((cleanup) => cleanup());
    FaceController.stopLookLoop(true);
    FaceController.stopReplyPeekLoop(true);
    FaceController.stopReadingLoop(true);
    FaceController.hideIdeaBulb({ clearTimer: true });
    globalThis.AFloditPomodoroController?.destroy?.();
    dom.root?.remove();
    state.ui = UI.IDLE;
    state.mode = MODE.NORMAL;
    state.activity = ACTIVITY.IDLE;
    state.running = false;
  }

  async function init() {
    traceLayout("init starts", { version: CONFIG.version });
    createDom();
    await UiSettingsStore.load();
    UiSettingsStore.applyOpacity();
    traceLayout("initial root layout about to apply", {
      initialPosition: state.uiSettings.initialPosition,
      hasSavedPosition: !!state.uiSettings.savedPosition,
      root: traceStyleSnapshot(dom.root)
    });
    LayoutManager.setInitialPosition();
    LayoutManager.markReady();
    setMode(MODE.NORMAL);
    setActivity(ACTIVITY.IDLE);
    enforceScrollBoxes();
    FaceController.resetFace();
    bindEvents();
    globalThis.AFloditPomodoroController?.bindEvents?.();
    globalThis.AFloditPomodoroController?.restore?.();
    window[GLOBAL_KEY] = { version: CONFIG.version, destroy };
  }

  init().catch((error) => {
    console.error("[AFlodit Pet] init failed", error);
  });
