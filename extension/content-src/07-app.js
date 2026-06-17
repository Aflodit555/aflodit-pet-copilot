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

    return elements.some((element) => expandedRectContains(safeGetRect(element), clientX, clientY, padding));
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

  const USER_ERROR_MESSAGES = Object.freeze({
    noSelectedText: "请先在网页中选中一段文字。",
    backendDisconnected: "本地后端未连接，请确认 backend 已运行。",
    missingApiKey: "请先在设置中填写 API Key。",
    timeout: "请求超过 40 秒，可能是网络或模型服务较慢。",
    invalidModelResponse: "模型返回格式异常，请稍后重试或检查模型配置。"
  });

  function clearSettingsNoticeTimer() {
    if (!state.settingsNoticeTimer) return;
    window.clearTimeout(state.settingsNoticeTimer);
    state.settingsNoticeTimer = null;
  }

  function scrollReplyToTop() {
    if (!dom.reply) return;
    dom.reply.scrollTop = 0;
    const raf = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 0));
    raf(() => {
      if (dom.reply) dom.reply.scrollTop = 0;
    });
  }

  function fallbackReplyText() {
    return "暂无回复。";
  }

  function staleReplyText() {
    return "已选择新文本，请点击刷新获取回复。";
  }

  function resultMatchesCurrentContext(action) {
    const cached = state.lastResult;
    if (!cached.replyText || cached.action !== action) return false;
    if (actionConfig(action).context === "selection") {
      return Boolean(cached.selectedText) && cached.selectedText === state.selectedText;
    }
    return true;
  }

  function cacheVisibleResult({ action = state.action, result = {}, finalFace = {} } = {}) {
    if (result.error_code || result.bubble_type === "error" || result.emotion === "error") return;
    const replyText = String(dom.reply?.textContent || result.reply || "").trim();
    if (!replyText) return;
    const pending = state.pendingRequest || {};
    state.lastResult = {
      action,
      selectedText: pending.selectedText || state.selectedText || "",
      replyText,
      emotion: finalFace.emotion || result.emotion || "neutral",
      motion: finalFace.motion || result.motion || "idle",
      bubbleType: result.bubble_type || "normal",
      statusMessage: dom.status?.textContent || "",
      requestFingerprint: pending.fingerprint || `${action}|${pending.selectedText || state.selectedText || ""}`
    };
    state.replyStale = false;
  }

  function normalizeUserErrorMessage(error, context = {}) {
    const code = String(context.code || error?.code || context.result?.error_code || "").trim();
    const rawMessage = String(context.message || error?.message || context.result?.reply || error || "");
    const lowerMessage = rawMessage.toLowerCase();
    const resultBubbleType = context.result?.bubble_type || "";
    const isResultError = resultBubbleType === "error" || resultBubbleType === "warning";
    const canInferFromMessage = !context.result || isResultError;

    if (error === "NO_SELECTED_TEXT" || code === "NO_SELECTED_TEXT") return USER_ERROR_MESSAGES.noSelectedText;
    if (canInferFromMessage && /selected text|选中|選中/i.test(rawMessage) && /missing|required|需要|请先|請先/i.test(rawMessage)) {
      return USER_ERROR_MESSAGES.noSelectedText;
    }

    if (
      code === "MODEL_CONFIG_INVALID"
      || code === "MODEL_AUTH_FAILED"
      || (canInferFromMessage && /api[_ -]?key|model_api_key|missing openai-compatible|unsupported model_provider|provider must be|invalid model settings/i.test(rawMessage))
    ) {
      return USER_ERROR_MESSAGES.missingApiKey;
    }

    if (code === "MODEL_TIMEOUT" || (canInferFromMessage && /timeout|timed out|abort/i.test(lowerMessage))) {
      return USER_ERROR_MESSAGES.timeout;
    }

    if (
      code === "MODEL_BAD_RESPONSE"
      || (canInferFromMessage && /json|parse|malformed|unexpected.*response|invalid response|non-json|choices|没有返回 final|did not include/i.test(rawMessage))
    ) {
      return USER_ERROR_MESSAGES.invalidModelResponse;
    }

    if (
      error?.name === "TypeError"
      || /failed to fetch|load failed|networkerror|connection refused|econnrefused|err_connection_refused|无法连接|不能连接/i.test(rawMessage)
    ) {
      return USER_ERROR_MESSAGES.backendDisconnected;
    }

    if (isResultError && /模型暂时|有效结果|valid result/i.test(rawMessage)) {
      return USER_ERROR_MESSAGES.invalidModelResponse;
    }

    return context.fallback || rawMessage || USER_ERROR_MESSAGES.invalidModelResponse;
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

  function isInsidePetRoot(target) {
    return !!dom.root && !!target && dom.root.contains(target);
  }

  function handleOutsidePointerDown(event) {
    if (state.ui !== UI.PANEL || isInsidePetRoot(event.target)) {
      state.outsidePointer = null;
      return;
    }

    state.outsidePointer = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  }

  function handleOutsidePointerUp(event) {
    const started = state.outsidePointer;
    state.outsidePointer = null;

    if (!started || state.ui !== UI.PANEL || isInsidePetRoot(event.target)) return;
    if (event.pointerId !== undefined && started.pointerId !== undefined && event.pointerId !== started.pointerId) return;

    const distance = Math.hypot(event.clientX - started.x, event.clientY - started.y);
    if (distance > CONFIG.outsideClose.movementThreshold) return;

    window.setTimeout(() => {
      if (state.ui !== UI.PANEL) return;
      const selectionText = String(window.getSelection?.().toString() || "").trim();
      if (selectionText) return;
      UIController.closeAll();
    }, CONFIG.outsideClose.selectionCheckDelayMs);
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
      clearSettingsNoticeTimer();
      dom.settings.classList.add("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsRuntime.classList.add("hidden");
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
      dom.settingsRuntime.classList.add("hidden");
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
      dom.settingsRuntime.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
      SettingsManager.load();
    },

    openRuntimeSettings() {
      clearHoverCloseTimer();
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsRuntime.classList.remove("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      RuntimeSettingsManager.load();
      LayoutManager.schedulePetLayout();
    },

    openCommandHelp() {
      clearHoverCloseTimer();
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsRuntime.classList.add("hidden");
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
      dom.settingsRuntime.classList.add("hidden");
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
      dom.settingsRuntime.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.remove("hidden");
      dom.settingsMessage.textContent = "";
      BackgroundRuntimeClient.refreshStatus();
      LayoutManager.schedulePetLayout();
    },

    backToSettingsMenu() {
      clearHoverCloseTimer();
      dom.settingsModel.classList.add("hidden");
      dom.settingsRuntime.classList.add("hidden");
      dom.settingsCommands.classList.add("hidden");
      dom.settingsDisplay.classList.add("hidden");
      dom.settingsAbout.classList.add("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.schedulePetLayout();
    },

    showSettingsNotice(message) {
      clearSettingsNoticeTimer();
      dom.settingsMessage.textContent = message;
      if (message) {
        state.settingsNoticeTimer = window.setTimeout(() => {
          dom.settingsMessage.textContent = "";
          state.settingsNoticeTimer = null;
          LayoutManager.schedulePetLayout();
        }, 3600);
      }
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
      const canRestore = resultMatchesCurrentContext(action);
      dom.status.textContent = canRestore ? (state.lastResult.statusMessage || config.idle) : config.idle;
      dom.reply.textContent = canRestore ? state.lastResult.replyText : fallbackReplyText();
      scrollReplyToTop();
      dom.refresh.classList.toggle("hidden", !config.refreshable);
      setBubbleType(canRestore ? state.lastResult.bubbleType : "normal");
      setMeta(canRestore ? state.lastResult.emotion : "neutral", canRestore ? state.lastResult.motion : "idle");
      state.replyStale = false;

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

    markReplyStaleForSelection(selectedText = "") {
      if (!state.lastResult.replyText || state.replyStale) return;
      if (!selectedText || selectedText === state.lastResult.selectedText) return;
      dom.reply.textContent = staleReplyText();
      delete dom.reply.dataset.streaming;
      scrollReplyToTop();
      setBubbleType("info");
      setMeta("thinking", "idle");
      state.replyStale = true;
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
      scrollReplyToTop();
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
      scrollReplyToTop();
      state.replyStale = false;
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
      dom.status.textContent = `${actionConfig(state.action).label} 已完成。`;
      dom.reply.textContent = normalizeUserErrorMessage(null, {
        result,
        fallback: result.reply || "后端没有返回 reply。"
      });
      delete dom.reply.dataset.streaming;
      scrollReplyToTop();
      setMeta(finalFace.emotion, finalFace.motion);
      setBubbleType(result.bubble_type || "normal");
      cacheVisibleResult({ action: state.action, result, finalFace });
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
      dom.status.textContent = `${actionConfig(state.action).label} 请求失败。`;
      dom.reply.textContent = normalizeUserErrorMessage(error);
      delete dom.reply.dataset.streaming;
      scrollReplyToTop();
      setMeta("error", "shake");
      setBubbleType("error");
      LayoutManager.updateFloatingLayout();
      FaceController.reactFace({ emotion: "error", motion: "shake" });
    },

    showBackgroundChatError(error = {}) {
      FaceController.stopReplyPeekLoop(true);
      const code = String(error.code || error.errorCode || error.data?.errorCode || error.data?.error?.code || "").trim();
      const details = {
        MISSING_RUNTIME_KEY: "Save a Runtime Key in AI Settings.",
        MISSING_PROVIDER_PERMISSION: "Grant provider permission in AI Settings.",
        AUTH_FAILED: "Provider authentication failed. Check your Runtime Key.",
        RATE_LIMITED: "Provider rate limit reached. Try again later.",
        TIMEOUT: "AI 请求超时，请稍后重试或切换更快的模型。",
        NETWORK_ERROR: "网络请求失败。",
        PROVIDER_UNAVAILABLE: "Provider is unavailable. Try again later.",
        PROVIDER_BAD_REQUEST: "Provider rejected the background runtime request.",
        PROVIDER_QUOTA_EXCEEDED: "Provider quota appears to be exhausted.",
        PROVIDER_ERROR: "Provider returned no usable result.",
        BACKGROUND_CHAT_NOT_CONFIGURED: "Chat is not configured for this provider.",
        BACKGROUND_ACTION_NOT_CONFIGURED: "This action is not configured for the selected provider.",
        INVALID_PAYLOAD: "The request payload was rejected."
      };
      const detail = details[code] || error.message || "AI request failed.";
      const recovery = error.backgroundChatSource === "preview"
        ? "Open AI settings and check the current provider configuration."
        : "Remove the runtime override and try ordinary Chat.";

      dom.status.textContent = `${actionConfig(state.action).label} 请求失败。`;
      dom.reply.textContent = [
        "AI 请求失败。",
        detail,
        recovery,
        error.backgroundChatSource === "preview" && error.data?.action === "chat" ? "/local can force Local Backend Chat." : ""
      ].filter(Boolean).join("\n");
      delete dom.reply.dataset.streaming;
      scrollReplyToTop();
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
  // 10.1 Background runtime client
  // =========================
  const BackgroundRuntimeClient = {
    updateLabel(label, available = false) {
      state.backgroundRuntime = {
        checked: true,
        available,
        label
      };
      if (dom.runtimeStatus) dom.runtimeStatus.textContent = label;
    },

    send(message, timeoutMs = CONFIG.backgroundStatusTimeoutMs) {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.sendMessage) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(null);
        }, timeoutMs);

        try {
          runtime.sendMessage(message, (response) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            if (runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(response || null);
          });
        } catch (error) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(null);
        }
      });
    },

    async request(message, timeoutMs = CONFIG.backgroundStatusTimeoutMs) {
      const response = await this.send(message, timeoutMs);
      if (!response) {
        return {
          ok: false,
          error: {
            code: "BACKGROUND_UNAVAILABLE",
            message: "Background runtime unavailable."
          }
        };
      }
      return response;
    },

    async getStatus() {
      return this.request({ type: "runtime:getStatus" });
    },

    async chat(payload = {}) {
      return this.request({
        type: "runtime:chat",
        payload: {
          providerId: payload.providerId,
          model: payload.model,
          userText: payload.userText
        }
      }, 60000);
    },

    async action(payload = {}) {
      const actionTimeouts = {
        chat: 60000,
        explain: 45000,
        translate: 45000,
        summarize: 90000
      };
      const timeoutMs = actionTimeouts[payload.action] || 45000;
      return this.request({
        type: "runtime:action",
        payload: {
          providerId: payload.providerId,
          model: payload.model,
          action: payload.action,
          userText: payload.userText,
          pageText: payload.pageText,
          selectionText: payload.selectionText
        }
      }, timeoutMs + 5000);
    },

    async getPublicSettings() {
      return this.request({ type: "settings:getPublic" }, 5000);
    },

    async savePublicSettings(payload = {}) {
      const settingsPayload = {
        provider: payload.provider,
        model: payload.model,
        saveMode: payload.saveMode,
        debugEnabled: payload.debugEnabled,
        runtimeMode: payload.runtimeMode
      };
      if (payload.customProvider !== undefined) {
        settingsPayload.customProvider = payload.customProvider;
      }
      return this.request({
        type: "settings:savePublic",
        payload: settingsPayload
      }, 5000);
    },

    async testConnectionMock(payload = {}) {
      return this.request({
        type: "runtime:testConnectionMock",
        payload: {
          providerId: payload.providerId,
          model: payload.model
        }
      }, 5000);
    },

    async testProviderConnection(payload = {}) {
      return this.request({
        type: "runtime:testProviderConnection",
        payload: {
          providerId: payload.providerId,
          model: payload.model
        }
      }, 25000);
    },

    async getBackgroundChatReadiness(payload = {}) {
      return this.request({
        type: "runtime:getBackgroundChatReadiness",
        payload: {
          providerId: payload.providerId,
          model: payload.model
        }
      }, 5000);
    },

    async getDiagnostics() {
      return this.request({ type: "runtime:getDiagnostics" });
    },

    async getProviderPermissionStatus(payload = {}) {
      return this.request({
        type: "runtime:getProviderPermissionStatus",
        payload: {
          providerId: payload.providerId
        }
      }, 5000);
    },

    async requestProviderPermission(payload = {}) {
      return this.request({
        type: "runtime:requestProviderPermission",
        payload: {
          providerId: payload.providerId
        }
      }, 15000);
    },

    async saveSecret(apiKey = "") {
      return this.request({
        type: "settings:saveSecret",
        payload: { apiKey, providerId: dom.runtimeProvider?.value || state.runtimePublicSettings.provider }
      }, 5000);
    },

    async clearKey() {
      return this.request({ type: "settings:clearKey" });
    },

    async refreshStatus() {
      const status = await this.getStatus();
      if (status?.ok && status.runtime === "background") {
        this.updateLabel("backend legacy / background available", true);
        return status;
      }
      this.updateLabel("backend legacy", false);
      return null;
    }
  };

  function installBackgroundRuntimeRoute() {
    if (!ActionRunner || ActionRunner.backgroundRuntimeRouteInstalled) return;

    const originalRunAction = ActionRunner.runAction.bind(ActionRunner);
    const runtimeActionUserTextLimit = 1000;

    function runtimeActionName(action) {
      if (action === ACTION.EXPLAIN) return "explain";
      if (action === ACTION.TRANSLATE) return "translate";
      if (action === ACTION.SUMMARY) return "summarize";
      return "chat";
    }

    const expectedBackgroundRuntimeErrorCodes = new Set([
      "MISSING_PROVIDER_PERMISSION",
      "MISSING_RUNTIME_KEY",
      "AUTH_FAILED",
      "RATE_LIMITED",
      "PROVIDER_BAD_REQUEST",
      "PROVIDER_QUOTA_EXCEEDED",
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_ERROR",
      "TIMEOUT",
      "NETWORK_ERROR",
      "PERMISSION_NOT_CONFIGURED",
      "PERMISSION_DENIED",
      "BACKGROUND_CHAT_NOT_CONFIGURED",
      "BACKGROUND_ACTION_NOT_CONFIGURED",
      "BACKGROUND_UNAVAILABLE",
      "INVALID_PAYLOAD"
    ]);

    function backgroundRuntimeErrorCode(error = {}) {
      return String(error.code || error.errorCode || error.data?.errorCode || error.data?.error?.code || "").trim();
    }

    function isExpectedBackgroundRuntimeError(error = {}) {
      const code = backgroundRuntimeErrorCode(error);
      return expectedBackgroundRuntimeErrorCodes.has(code);
    }

    function warnExpectedBackgroundRuntimeError(error = {}) {
      if (!state.runtimePublicSettings.debugEnabled || !globalThis.console?.warn) return;
      const code = backgroundRuntimeErrorCode(error) || "UNKNOWN";
      const message = String(error.message || "Background Runtime failed.").slice(0, 200);
      globalThis.console.warn("[AFlodit Pet] expected background runtime failure", { code, message });
    }

    ActionRunner.applyBackgroundChatInputHint = function applyBackgroundChatInputHint() {
      if (!dom.chatInput) return;
      dom.chatInput.placeholder = "输入消息，按 Enter 发送";
      dom.chatInput.title = "Chat";
    };

    ActionRunner.parseBackgroundRuntimeRoute = function parseBackgroundRuntimeRoute(action, userText = "") {
      const trimmed = String(userText || "").trim();
      if (action === ACTION.CHAT) {
        const lower = trimmed.toLowerCase();
        const backgroundPrefixes = ["/bg ", "@background "];
        const localPrefixes = ["/local ", "@local "];
        const backgroundPrefix = backgroundPrefixes.find((item) => lower.startsWith(item));
        if (backgroundPrefix) {
          return {
            route: "background",
            source: "explicit-background",
            userText: trimmed.slice(backgroundPrefix.length).trim()
          };
        }
        const localPrefix = localPrefixes.find((item) => lower.startsWith(item));
        if (localPrefix) {
          return {
            route: "local",
            source: "explicit-local",
            userText: trimmed.slice(localPrefix.length).trim()
          };
        }
      }

      const previewEnabled = state.runtimePublicSettings.runtimeMode === "background_runtime_beta";
      return {
        route: previewEnabled ? "background" : "local",
        source: previewEnabled ? "preview" : "default-local",
        userText: trimmed
      };
    };

    ActionRunner.syncBackgroundRuntimePreviewSetting = async function syncBackgroundRuntimePreviewSetting(action, userText = "") {
      const lower = String(userText || "").trim().toLowerCase();
      if (action === ACTION.CHAT && (lower.startsWith("/bg ") || lower.startsWith("@background ") || lower.startsWith("/local ") || lower.startsWith("@local "))) {
        return;
      }

      const response = await BackgroundRuntimeClient.getPublicSettings();
      if (response?.ok && response.settings) {
        state.runtimePublicSettings.runtimeMode = response.settings.runtimeMode === "background_runtime_beta"
          ? "background_runtime_beta"
          : "local_backend";
      }
    };

    ActionRunner.callBackgroundRuntimeAction = async function callBackgroundRuntimeAction(payload = {}) {
      const settingsResponse = await BackgroundRuntimeClient.getPublicSettings();
      if (!settingsResponse?.ok) {
        const error = new Error(settingsResponse?.message || settingsResponse?.error?.message || "Background runtime settings unavailable.");
        error.code = settingsResponse?.error?.code || settingsResponse?.errorCode;
        throw error;
      }

      const settings = settingsResponse.settings || {};
      const response = await BackgroundRuntimeClient.action({
        providerId: settings.provider,
        model: settings.model,
        action: runtimeActionName(payload.action),
        userText: payload.user_text,
        pageText: payload.page_text_snippet,
        selectionText: payload.selected_text
      });

      if (!response?.ok) {
        const error = new Error(response?.message || response?.error?.message || "Background Runtime failed.");
        error.code = response?.errorCode || response?.error?.code;
        error.data = response;
        throw error;
      }

      return {
        ...response,
        reply: String(response.reply || "").trim(),
        emotion: response.emotion || "neutral",
        motion: response.motion || "idle",
        bubble_type: response.bubble_type || "normal",
        confidence: Number.isFinite(Number(response.confidence)) ? Number(response.confidence) : 0.7
      };
    };

    ActionRunner.runAction = async function runActionWithOptionalBackgroundRuntime(action, userText = "") {
      await this.syncBackgroundRuntimePreviewSetting(action, userText).catch(() => {});
      const backgroundRoute = this.parseBackgroundRuntimeRoute(action, userText);
      if (backgroundRoute.route === "local") return originalRunAction(action, backgroundRoute.userText ?? userText);
      if (state.running) return;

      UIController.openPanel(action);
      const validationError = this.validate(action, backgroundRoute.userText);
      if (validationError) {
        UIController.showWarning(validationError);
        return;
      }
      if (backgroundRoute.userText.length > runtimeActionUserTextLimit) {
        UIController.showWarning("输入内容最多支持 1000 个字符，请缩短后重试。");
        return;
      }
      if (action === ACTION.CHAT && !backgroundRoute.userText) {
        UIController.showWarning(actionConfig(action).empty);
        return;
      }

      const requestId = ++state.requestId;
      const payload = this.buildPayload(action, backgroundRoute.userText);
      state.pendingRequest = {
        action,
        selectedText: payload.selected_text || "",
        fingerprint: `background-runtime|${payload.action}|${payload.selected_text || ""}|${payload.page_text_snippet || ""}|${payload.user_text || ""}`
      };
      UIController.showLoading(action);
      setRunning(true);

      try {
        const result = await this.callBackgroundRuntimeAction(payload);
        if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
        UIController.showResult(result);
      } catch (error) {
        if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
        error.backgroundChatSource = backgroundRoute.source;
        if (isExpectedBackgroundRuntimeError(error)) {
          warnExpectedBackgroundRuntimeError(error);
        } else {
          console.error("[AFlodit Pet] unexpected background runtime failure", error);
        }
        RuntimeSettingsManager?.showFailureDiagnostics?.(error.data || {});
        UIController.showBackgroundChatError(error);
      } finally {
        if (requestId === state.requestId) state.pendingRequest = null;
        if (requestId === state.requestId) setRunning(false);
      }
    };

    ActionRunner.backgroundRuntimeRouteInstalled = true;
  }

  installBackgroundRuntimeRoute();

  const RUNTIME_COPY = Object.freeze({
    advancedTools: "\u9ad8\u7ea7\u5de5\u5177",
    notConnected: "\u672a\u8fde\u63a5",
    connected: "\u5df2\u8fde\u63a5",
    connecting: "\u6b63\u5728\u8fde\u63a5...",
    failed: "\u8fde\u63a5\u5931\u8d25",
    failedHelp: "\u8bf7\u68c0\u67e5\u6a21\u578b ID\u3001API Key \u6216\u670d\u52a1\u989d\u5ea6\u3002",
    syncing: "\u540e\u53f0\u6b63\u5728\u540c\u6b65\u72b6\u6001...",
    saved: "\u5df2\u4fdd\u5b58",
    notSaved: "\u672a\u4fdd\u5b58",
    testPassed: "\u6d4b\u8bd5\u901a\u8fc7",
    notChecked: "\u672a\u68c0\u67e5",
    ready: "\u5df2\u5c31\u7eea",
    notReady: "\u672a\u5c31\u7eea",
    notConfigured: "\u672a\u914d\u7f6e",
    backgroundRuntimeBeta: "\u540e\u53f0\u8fd0\u884c Beta",
    enterRuntimeKey: "\u8f93\u5165",
    runtimeKey: "\u8fd0\u884c\u5bc6\u94a5"
  });

  const RuntimeSettingsManager = {
    busy: false,
    lastReadiness: null,
    lastPermissionStatus: null,

    isDeveloperMode() {
      return state.runtimeSetupViewMode === "developer";
    },

    setSetupViewMode(mode = "user") {
      state.runtimeSetupViewMode = mode === "developer" ? "developer" : "user";
      const developer = this.isDeveloperMode();
      (dom.runtimeDeveloperOnly || []).forEach((node) => node.classList.toggle("hidden", !developer));
      if (dom.runtimeDeveloperTools) dom.runtimeDeveloperTools.open = developer;
      if (dom.runtimeDeveloperToggle) {
        dom.runtimeDeveloperToggle.textContent = RUNTIME_COPY.advancedTools;
      }
      if (dom.runtimeDiagnosticsOutput && !developer) {
        dom.runtimeDiagnosticsOutput.classList.add("hidden");
      }
      LayoutManager.schedulePetLayout();
    },

    setBusy(busy) {
      this.busy = busy;
      dom.runtimeSave.disabled = busy;
      if (dom.runtimeModeLocal) dom.runtimeModeLocal.disabled = busy;
      if (dom.runtimeModeBackground) dom.runtimeModeBackground.disabled = busy;
      dom.runtimeTestMock.disabled = busy;
      dom.runtimeCheckPermission.disabled = busy;
      if (dom.runtimeCheckReadiness) dom.runtimeCheckReadiness.disabled = busy;
      dom.runtimeTestReal.disabled = busy;
      if (dom.runtimeCopyDiagnostics) dom.runtimeCopyDiagnostics.disabled = busy;
      if (dom.runtimeLocalBackend) dom.runtimeLocalBackend.disabled = busy;
      this.updatePermissionRequestButton();
      this.updateRealTestButton();
      dom.runtimeReload.disabled = busy;
      dom.runtimeClearKey.disabled = busy;
    },

    setMessage(message) {
      if (dom.runtimeMessage) dom.runtimeMessage.textContent = message || "";
      LayoutManager.schedulePetLayout();
    },

    setConnectionStatus(status = RUNTIME_COPY.notConnected, message = "-") {
      if (dom.runtimeConnectionStatus) dom.runtimeConnectionStatus.textContent = status;
      if (dom.runtimeConnectionMessage) dom.runtimeConnectionMessage.textContent = message || "-";
      LayoutManager.schedulePetLayout();
    },

    setStatusProviderModel(provider = this.providerById(dom.runtimeProvider?.value || state.runtimePublicSettings.provider), model = "") {
      if (!dom.runtimeStatusProviderModel) return;
      const providerName = provider?.displayName || "provider";
      const modelId = String(model || dom.runtimeModel?.value || state.runtimePublicSettings.model || "").trim();
      dom.runtimeStatusProviderModel.textContent = modelId ? `${providerName} \u00b7 ${modelId}` : providerName;
    },

    userMessage(response, fallback = "Runtime settings request failed.") {
      const code = response?.error?.code || response?.code || "";
      const messages = {
        BACKGROUND_UNAVAILABLE: "Background runtime unavailable.",
        MESSAGE_PAYLOAD_FORBIDDEN: "Runtime settings rejected unsafe fields.",
        SETTING_FORBIDDEN: "Runtime settings rejected unsafe fields.",
        SETTING_UNKNOWN: "Runtime settings rejected unsupported fields.",
        CUSTOM_PROVIDER_INVALID: "Custom provider requires a valid HTTPS Base URL.",
        CUSTOM_BASE_URL_INVALID: "Custom Base URL is invalid.",
        CUSTOM_BASE_URL_HTTPS_REQUIRED: "Custom Base URL must use HTTPS.",
        CUSTOM_BASE_URL_QUERY_FORBIDDEN: "Custom Base URL cannot include query string or hash.",
        CUSTOM_BASE_URL_PRIVATE_NETWORK_FORBIDDEN: "Custom Base URL cannot point to localhost or a private network in this release.",
        PROVIDER_NOT_ALLOWED: "Provider is not available in AI Settings.",
        PERMISSION_NOT_CONFIGURED: "Provider permission is not configured for this release.",
        PERMISSION_DENIED: "Provider permission was not granted. Real provider requests are still disabled.",
        BACKGROUND_CHAT_NOT_CONFIGURED: "Background chat is not configured for this provider.",
        UNKNOWN_PROVIDER: "Provider is not available in AI Settings.",
        RUNTIME_MODE_INVALID: "Runtime mode must be Local Backend or Background Runtime Beta.",
        REAL_TEST_NOT_CONFIGURED: "Real provider test is not configured for this provider.",
        MISSING_PROVIDER_PERMISSION: "Provider permission is missing. Grant provider permission before running a real test.",
        MISSING_RUNTIME_KEY: "Runtime key is missing. Save a Runtime Key before running a real test.",
        AUTH_FAILED: "Provider authentication failed. Check your Runtime Key.",
        RATE_LIMITED: "Provider rate limit reached. Try again later.",
        PROVIDER_QUOTA_EXCEEDED: "Provider quota appears to be exhausted.",
        PROVIDER_BAD_REQUEST: "Provider rejected the minimal test request.",
        PROVIDER_UNAVAILABLE: "Provider service is currently unavailable. Try again later.",
        NETWORK_ERROR: "Provider real test failed due to a network error.",
        TIMEOUT: "Provider real test timed out.",
        PROVIDER_ERROR: "Provider real test failed.",
        INVALID_PAYLOAD: "Provider request rejected invalid payload.",
        RUNTIME_TEST_PAYLOAD_FORBIDDEN: "Runtime mock test rejected unsafe fields.",
        RUNTIME_TEST_PAYLOAD_UNKNOWN: "Runtime mock test rejected unsupported fields."
      };
      return messages[code] || response?.error?.message || response?.message || fallback;
    },

    sanitizeProviders(providers = []) {
      const items = Array.isArray(providers) ? providers : [];
      const sanitized = items
        .filter((provider) => provider && typeof provider.id === "string" && typeof provider.displayName === "string")
        .map((provider) => ({
          id: String(provider.id).trim(),
          displayName: String(provider.displayName).trim(),
          protocol: String(provider.protocol || "").trim(),
          defaultModel: String(provider.defaultModel || "").trim(),
          setupHint: String(provider.setupHint || "").trim(),
          hasRequiredHostPermission: Boolean(provider.hasRequiredHostPermission),
          enabled: Boolean(provider.enabled),
          requestEnabled: Boolean(provider.requestEnabled),
          customEndpoint: provider.customEndpoint || false,
          customConfigured: Boolean(provider.customConfigured),
          hasApiKey: Boolean(provider.hasApiKey),
          apiKeyPreview: String(provider.apiKeyPreview || "").trim()
        }))
        .filter((provider) => provider.id && provider.displayName);

      return sanitized.length ? sanitized : state.runtimeProviders;
    },

    providerById(providerId) {
      return state.runtimeProviders.find((provider) => provider.id === providerId) || state.runtimeProviders[0];
    },

    isCustomProvider(providerOrId) {
      const id = typeof providerOrId === "string" ? providerOrId : providerOrId?.id;
      return id === "custom_openai_compatible";
    },

    updateCustomProviderVisibility(provider = this.providerById(dom.runtimeProvider?.value || state.runtimePublicSettings.provider)) {
      const isCustom = this.isCustomProvider(provider);
      if (dom.runtimeCustomBaseUrlField) dom.runtimeCustomBaseUrlField.classList.toggle("hidden", !isCustom);
      if (dom.runtimeCustomBaseUrlHint) dom.runtimeCustomBaseUrlHint.classList.toggle("hidden", !isCustom);
    },

    customProviderConfigFromForm(providerId = dom.runtimeProvider?.value || "") {
      if (!this.isCustomProvider(providerId)) return undefined;
      return {
        name: "Custom OpenAI-compatible",
        baseURL: String(dom.runtimeCustomBaseUrl?.value || "").trim()
      };
    },

    providerHasHostPermission(provider) {
      return Boolean(provider?.id !== "mock" && provider?.protocol === "openai-compatible" && provider?.hasRequiredHostPermission);
    },

    providerOptionLabel(provider = {}) {
      if (provider.id === "dashscope") return `${provider.displayName} (Recommended)`;
      if (provider.id === "custom_openai_compatible") return `${provider.displayName} (Advanced)`;
      if (provider.id === "mock") return `${provider.displayName} (Developer)`;
      return `${provider.displayName} (Experimental)`;
    },

    renderProviderOptions(selectedProvider = "mock") {
      if (!dom.runtimeProvider) return;
      const previous = dom.runtimeProvider.value || selectedProvider;
      dom.runtimeProvider.textContent = "";

      state.runtimeProviders.forEach((provider) => {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = this.providerOptionLabel(provider);
        option.disabled = !provider.enabled;
        dom.runtimeProvider.appendChild(option);
      });

      const nextProvider = this.providerById(selectedProvider)?.id || this.providerById(previous)?.id || "mock";
      dom.runtimeProvider.value = nextProvider;
    },

    updateProviderStatus(providerId = dom.runtimeProvider?.value || "mock") {
      const provider = this.providerById(providerId);
      if (!provider) return;

      if (dom.runtimeProviderSelected) dom.runtimeProviderSelected.textContent = provider.displayName;
      if (dom.runtimeProviderProtocol) dom.runtimeProviderProtocol.textContent = provider.protocol || "unknown";
      if (dom.runtimeProviderDefaultModel) dom.runtimeProviderDefaultModel.textContent = provider.defaultModel || "";
      if (dom.runtimeProviderHint) {
        if (provider.id === "dashscope") {
          dom.runtimeProviderHint.textContent = "\u4f7f\u7528\u963f\u91cc\u4e91\u767e\u70bc API Key\u3002\u63a8\u8350\u4ece qwen-plus \u5f00\u59cb\u3002";
        } else if (this.isCustomProvider(provider)) {
          dom.runtimeProviderHint.textContent = "\u9ad8\u7ea7\u5165\u53e3\uff1a\u586b\u5199 HTTPS Base URL\u3001Model ID \u548c Runtime Key\u3002";
        } else {
          dom.runtimeProviderHint.textContent = "\u4f7f\u7528\u5f53\u524d\u670d\u52a1\u5546\u7684 API Key\u3002";
        }
      }
      if (dom.runtimeModelHint) {
        dom.runtimeModelHint.textContent = this.isCustomProvider(provider)
          ? "Model ID \u4f1a\u539f\u6837\u53d1\u9001\u7ed9\u81ea\u5b9a\u4e49\u670d\u52a1\u5546\u3002"
          : "\u6a21\u578b ID \u4f1a\u539f\u6837\u53d1\u9001\u7ed9\u5f53\u524d\u670d\u52a1\u5546\u3002";
      }
      this.updateCustomProviderVisibility(provider);
      if (dom.runtimeProviderPermissionStatus) dom.runtimeProviderPermissionStatus.textContent = "unknown";
      this.updateRuntimeKeyPlaceholder(provider);
      this.updatePermissionRequestButton(provider.id);
      this.updateRealTestButton(provider.id);
      this.renderSetupChecklist();
    },

    updatePermissionRequestButton(providerId = dom.runtimeProvider?.value || "mock") {
      if (!dom.runtimeRequestPermission) return;
      const provider = this.providerById(providerId);
      const hasPermission = this.providerHasHostPermission(provider);
      const status = this.lastPermissionStatus?.providerId === provider?.id ? this.lastPermissionStatus : null;
      const readinessPermission = (this.lastReadiness?.providerId === provider?.id ? this.lastReadiness?.checks : [])
        ?.find?.((check) => check.id === "permission");
      const permissionGranted = Boolean(
        (status?.ok && status.permissionGranted)
        || (readinessPermission && readinessPermission.ok)
      );
      const shouldShow = hasPermission && !permissionGranted;
      dom.runtimeRequestPermission.classList.toggle("hidden", !shouldShow);
      dom.runtimeRequestPermission.disabled = this.busy || !shouldShow;
      dom.runtimeRequestPermission.title = hasPermission
        ? `Request ${provider.displayName} optional host permission.`
        : "Host Permission is not configured for this provider.";
    },

    updateRealTestButton(providerId = dom.runtimeProvider?.value || "mock") {
      if (!dom.runtimeTestReal) return;
      const provider = this.providerById(providerId);
      dom.runtimeTestReal.disabled = this.busy;
      dom.runtimeTestReal.title = provider?.id !== "mock" && provider?.protocol === "openai-compatible"
        ? `Run a minimal ${provider.displayName} real test.`
        : "Real provider test is configured for listed real providers only.";
    },

    applyPermissionStatus(response = {}, providerId = dom.runtimeProvider?.value || "mock") {
      if (dom.runtimeProviderPermissionStatus) {
        if (response.ok && response.permissionGranted) {
          dom.runtimeProviderPermissionStatus.textContent = "granted";
        } else if (response.ok && response.permissionConfigured) {
          dom.runtimeProviderPermissionStatus.textContent = "missing";
        } else if (response.errorCode === "PERMISSION_NOT_CONFIGURED") {
          dom.runtimeProviderPermissionStatus.textContent = "not configured";
        } else {
          dom.runtimeProviderPermissionStatus.textContent = "unknown";
        }
      }
      this.lastPermissionStatus = { ...(response || {}), providerId };
      this.updatePermissionRequestButton(providerId);
      this.updateRealTestButton(providerId);
      this.renderSetupChecklist(this.lastReadiness);
    },

    readinessText(check) {
      if (!check) return "not checked";
      const stateText = check.ok ? "ready" : "missing";
      return `${stateText} - ${check.message || ""}`.trim();
    },

    realTestText(status = state.runtimePublicSettings.lastRealTestStatus) {
      if (!status) return "not checked";
      if (status.ok) return `passed - ${status.providerId || "provider"} / ${status.model || "model"}`;
      return `failed - ${status.errorCode || "UNKNOWN"}`;
    },

    lastActionText(status = state.runtimePublicSettings.lastActionFailure) {
      if (!status) return "none";
      return status.errorCode || status.reason || status.type || "failed";
    },

    hasSuccessfulRealTest(providerId = "", model = "") {
      const status = state.runtimePublicSettings.lastRealTestStatus;
      if (!status?.ok) return false;
      if (providerId && status.providerId !== providerId) return false;
      return !model || status.model === model;
    },

    isBackgroundUnavailableResponse(response = {}) {
      return response?.error?.code === "BACKGROUND_UNAVAILABLE" || response?.errorCode === "BACKGROUND_UNAVAILABLE";
    },

    showRuntimeSyncing(providerId = "", model = "") {
      const provider = this.providerById(providerId);
      this.setStatusProviderModel(provider, model);
      this.setConnectionStatus(RUNTIME_COPY.syncing, RUNTIME_COPY.syncing);
      this.setMessage(RUNTIME_COPY.syncing);
      if (dom.runtimeReadinessRealTest) {
        dom.runtimeReadinessRealTest.textContent = `passed - ${providerId || "provider"} / ${model || "model"}`;
      }
    },

    providerHasSavedKey(provider) {
      if (!provider) return false;
      return provider.id === state.runtimePublicSettings.provider
        ? Boolean(state.runtimePublicSettings.hasApiKey)
        : Boolean(provider.hasApiKey);
    },

    renderSetupChecklist(response = this.lastReadiness || null) {
      const byId = {};
      (Array.isArray(response?.checks) ? response.checks : []).forEach((check) => {
        byId[check.id] = check;
      });
      const provider = this.providerById(dom.runtimeProvider?.value || state.runtimePublicSettings.provider);
      const model = String(dom.runtimeModel?.value || state.runtimePublicSettings.model || "").trim();
      const providerHasKey = this.providerHasSavedKey(provider);
      const realTest = state.runtimePublicSettings.lastRealTestStatus;
      this.setStatusProviderModel(provider, model);

      if (dom.runtimeReadinessSummary) {
        dom.runtimeReadinessSummary.textContent = response
          ? (response.canUseBackgroundRuntime ? "ready" : "blocked")
          : "not checked";
      }
      if (dom.runtimeReadinessProvider) dom.runtimeReadinessProvider.textContent = provider?.displayName || "missing";
      if (dom.runtimeReadinessKey) {
        dom.runtimeReadinessKey.textContent = providerHasKey ? RUNTIME_COPY.saved : RUNTIME_COPY.notSaved;
      }
      if (dom.runtimeReadinessPermission) {
        if (byId.permission) {
          dom.runtimeReadinessPermission.textContent = byId.permission.ok ? "granted" : "missing";
        } else if (!this.providerHasHostPermission(provider)) {
          dom.runtimeReadinessPermission.textContent = "not configured for this provider";
        } else if (this.lastPermissionStatus?.providerId === provider?.id && this.lastPermissionStatus?.ok && this.lastPermissionStatus.permissionGranted) {
          dom.runtimeReadinessPermission.textContent = "granted";
        } else if (this.lastPermissionStatus?.providerId === provider?.id && this.lastPermissionStatus?.ok && this.lastPermissionStatus.permissionConfigured) {
          dom.runtimeReadinessPermission.textContent = "missing";
        } else if (this.lastPermissionStatus?.providerId === provider?.id && this.lastPermissionStatus?.errorCode === "PERMISSION_NOT_CONFIGURED") {
          dom.runtimeReadinessPermission.textContent = "not configured";
        } else {
          dom.runtimeReadinessPermission.textContent = "not checked";
        }
      }
      if (dom.runtimeReadinessModel) dom.runtimeReadinessModel.textContent = model ? model : "missing";
      if (dom.runtimeReadinessMode) dom.runtimeReadinessMode.textContent = this.runtimeModeLabel(this.readRuntimeMode());
      if (dom.runtimeReadinessRealTest) {
        dom.runtimeReadinessRealTest.textContent = this.realTestText();
      }
      if (dom.runtimeLastAction) dom.runtimeLastAction.textContent = this.lastActionText();
      if (dom.runtimeSummaryMode) dom.runtimeSummaryMode.textContent = this.runtimeModeLabel(this.readRuntimeMode());
      if (dom.runtimeSummaryProvider) dom.runtimeSummaryProvider.textContent = provider?.displayName || "missing";
      if (dom.runtimeSummaryBeta) {
        dom.runtimeSummaryBeta.textContent = response
          ? (response.canUseBackgroundRuntime ? RUNTIME_COPY.ready : RUNTIME_COPY.notReady)
          : (!provider || provider.id === "mock" || provider.protocol !== "openai-compatible" ? RUNTIME_COPY.notConfigured : RUNTIME_COPY.notChecked);
      }
      if (realTest?.ok && realTest.providerId === provider?.id && (!model || realTest.model === model)) {
        this.setConnectionStatus(RUNTIME_COPY.connected, RUNTIME_COPY.testPassed);
      } else if (realTest && realTest.providerId === provider?.id && realTest.ok === false) {
        this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
      } else {
        this.setConnectionStatus(RUNTIME_COPY.notConnected, providerHasKey ? RUNTIME_COPY.saved : "-");
      }
      this.updatePermissionRequestButton(provider?.id);
      LayoutManager.schedulePetLayout();
    },

    renderReadiness(response = null) {
      this.renderSetupChecklist(response);
    },

    runtimeModeLabel(mode = "local_backend") {
      return mode === "background_runtime_beta" ? RUNTIME_COPY.backgroundRuntimeBeta : "Local Backend Dev";
    },

    updateRuntimeModeUi(mode = "local_backend") {
      const normalized = mode === "background_runtime_beta" ? "background_runtime_beta" : "local_backend";
      if (dom.runtimeModeLocal) dom.runtimeModeLocal.checked = normalized === "local_backend";
      if (dom.runtimeModeBackground) dom.runtimeModeBackground.checked = normalized === "background_runtime_beta";
      if (dom.runtimeModeLabel) dom.runtimeModeLabel.textContent = this.runtimeModeLabel(normalized);
      this.renderSetupChecklist();
    },

    warnIfBackgroundModeWithoutReadiness() {
      if (this.readRuntimeMode() !== "background_runtime_beta") return;
      const missing = [];
      if (!state.runtimePublicSettings.hasApiKey) missing.push("Runtime Key");
      if (!String(dom.runtimeModel?.value || "").trim()) missing.push("Model");
      if (String(dom.runtimeReadinessPermission?.textContent || "") !== "granted") missing.push("Permission");
      if (!state.runtimePublicSettings.lastRealTestStatus?.ok) missing.push("Real Test");
      if (this.lastReadiness && !this.lastReadiness.canUseBackgroundRuntime) {
        (this.lastReadiness.checks || [])
          .filter((check) => !check.ok)
          .map((check) => (check.id === "provider" ? "unsupported provider" : check.label))
          .forEach((label) => {
            if (!missing.includes(label)) missing.push(label);
          });
      }
      if (!missing.length) return;
      this.setMessage(`Background Runtime Beta is selected but setup is incomplete. Missing: ${missing.join(" / ")}.`);
    },

    handleProviderChange() {
      const nextProviderId = dom.runtimeProvider.value || "mock";
      const previousProvider = this.providerById(state.runtimePublicSettings.provider);
      const nextProvider = this.providerById(nextProviderId);
      const currentModel = String(dom.runtimeModel.value || "").trim();
      const shouldUseDefaultModel = !currentModel || currentModel === previousProvider?.defaultModel;

      if (shouldUseDefaultModel && nextProvider?.defaultModel) {
        dom.runtimeModel.value = nextProvider.defaultModel;
      }

      state.runtimePublicSettings.provider = nextProviderId;
      state.runtimePublicSettings.hasApiKey = Boolean(nextProvider?.hasApiKey);
      state.runtimePublicSettings.apiKeyPreview = nextProvider?.apiKeyPreview || "";
      this.lastReadiness = null;
      this.lastPermissionStatus = null;
      this.renderReadiness(null);
      this.updateProviderStatus(nextProviderId);
      this.refreshProviderPermissionStatus(nextProviderId);
      LayoutManager.schedulePetLayout();
    },

    hydrate(data = {}) {
      const settings = data.settings || data || {};
      const provider = settings.provider || "mock";
      state.runtimeProviders = this.sanitizeProviders(data.providers);
      state.runtimePublicSettings = {
        provider,
        model: settings.model || "mock-model",
        saveMode: settings.saveMode === "session" ? "session" : "local",
        debugEnabled: Boolean(settings.debugEnabled),
        runtimeMode: settings.runtimeMode === "background_runtime_beta" ? "background_runtime_beta" : "local_backend",
        customProvider: settings.customProvider || null,
        hasApiKey: Boolean(settings.hasApiKey),
        apiKeyPreview: settings.apiKeyPreview || "",
        lastRealTestStatus: settings.lastRealTestStatus || null,
        lastActionFailure: settings.lastActionFailure || null
      };
      this.lastReadiness = null;
      this.lastPermissionStatus = null;
      this.setSetupViewMode("user");

      this.renderProviderOptions(provider);
      dom.runtimeModel.value = state.runtimePublicSettings.model;
      if (dom.runtimeCustomBaseUrl) {
        dom.runtimeCustomBaseUrl.value = state.runtimePublicSettings.customProvider?.baseURL || "";
      }
      dom.runtimeApiKey.value = "";
      this.updateRuntimeKeyPlaceholder(this.providerById(provider));
      dom.runtimeSaveMode.value = state.runtimePublicSettings.saveMode;
      dom.runtimeDebug.checked = state.runtimePublicSettings.debugEnabled;
      this.updateRuntimeModeUi(state.runtimePublicSettings.runtimeMode);
      this.renderSetupChecklist(null);
      this.updateProviderStatus(dom.runtimeProvider.value);
    },

    readForm() {
      const providerId = dom.runtimeProvider.value || "mock";
      const provider = this.providerById(providerId);
      const typedModel = String(dom.runtimeModel.value || "").trim();
      const model = this.isCustomProvider(provider) ? typedModel : (typedModel || provider?.defaultModel || "mock-model");
      return {
        provider: providerId,
        model,
        saveMode: dom.runtimeSaveMode.value === "session" ? "session" : "local",
        debugEnabled: Boolean(dom.runtimeDebug.checked),
        runtimeMode: this.isDeveloperMode() ? this.readRuntimeMode() : "background_runtime_beta",
        customProvider: this.customProviderConfigFromForm(providerId)
      };
    },

    readRuntimeMode() {
      return dom.runtimeModeBackground?.checked ? "background_runtime_beta" : "local_backend";
    },

    readSecretForm() {
      return String(dom.runtimeApiKey.value || "").trim();
    },

    updateRuntimeKeyPlaceholder(provider = this.providerById(dom.runtimeProvider?.value || state.runtimePublicSettings.provider)) {
      if (!dom.runtimeApiKey) return;
      const hasApiKey = provider?.id === state.runtimePublicSettings.provider
        ? state.runtimePublicSettings.hasApiKey
        : Boolean(provider?.hasApiKey);
      const preview = provider?.id === state.runtimePublicSettings.provider
        ? state.runtimePublicSettings.apiKeyPreview
        : provider?.apiKeyPreview;
      dom.runtimeApiKey.placeholder = hasApiKey
        ? `${RUNTIME_COPY.saved} ${provider?.displayName || "provider"}: ${preview || "configured"}`
        : `${RUNTIME_COPY.enterRuntimeKey} ${provider?.displayName || "provider"} ${RUNTIME_COPY.runtimeKey}`;
    },

    async refreshStatus() {
      const status = await BackgroundRuntimeClient.refreshStatus();
      if (dom.runtimeSettingsStatus) {
        dom.runtimeSettingsStatus.textContent = status ? "background available" : "unavailable";
      }
      return status;
    },

    async load() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("Loading AI settings...");
      try {
        await this.refreshStatus();
        const response = await BackgroundRuntimeClient.getPublicSettings();
        if (!response.ok) {
          this.setMessage(this.userMessage(response));
          return;
        }
        this.hydrate(response);
        this.setMessage("");
      } catch (error) {
        this.setMessage(error?.message || "Runtime settings request failed.");
      } finally {
        this.setBusy(false);
      }
    },

    async save() {
      return this.saveAndConnect();
    },

    connectionFailureMessage(response = {}, fallback = "Model test failed. Check your Model ID or provider account.") {
      const code = response?.error?.code || response?.errorCode || response?.code || "";
      const genericProviderFailure = RUNTIME_COPY.failedHelp;
      const messages = {
        BACKGROUND_UNAVAILABLE: "Background runtime unavailable.",
        MISSING_RUNTIME_KEY: "Runtime Key is missing.",
        MISSING_PROVIDER_PERMISSION: "Provider permission was denied.",
        PERMISSION_DENIED: "Provider permission was denied.",
        AUTH_FAILED: genericProviderFailure,
        RATE_LIMITED: genericProviderFailure,
        PROVIDER_QUOTA_EXCEEDED: genericProviderFailure,
        PROVIDER_BAD_REQUEST: genericProviderFailure,
        PROVIDER_UNAVAILABLE: genericProviderFailure,
        NETWORK_ERROR: genericProviderFailure,
        TIMEOUT: genericProviderFailure,
        PROVIDER_ERROR: genericProviderFailure,
        UNKNOWN_PROVIDER: "Provider is not available in AI Settings.",
        PROVIDER_DISABLED: "Provider is disabled.",
        CUSTOM_PROVIDER_INVALID: "Custom provider requires a valid HTTPS Base URL.",
        CUSTOM_BASE_URL_INVALID: "Custom Base URL is invalid.",
        CUSTOM_BASE_URL_HTTPS_REQUIRED: "Custom Base URL must use HTTPS.",
        CUSTOM_BASE_URL_PRIVATE_NETWORK_FORBIDDEN: "Custom Base URL cannot point to localhost or a private network in this release.",
        REAL_TEST_NOT_CONFIGURED: "Provider is experimental and may not be verified."
      };
      return messages[code] || response?.message || response?.error?.message || fallback;
    },

    showFailureDiagnostics(response = {}) {
      if (!dom.runtimeDiagnosticsOutput || !this.isDeveloperMode()) return;
      const actionFailure = response.lastActionFailure || response.data?.lastActionFailure || null;
      const diagnostic = {
        providerId: response.providerId || response.lastRealTestStatus?.providerId || actionFailure?.providerId || "",
        model: response.model || response.lastRealTestStatus?.model || actionFailure?.model || "",
        errorCode: response.errorCode || response.lastRealTestStatus?.errorCode || actionFailure?.errorCode || "",
        providerError: response.providerError || response.lastRealTestStatus?.providerError || null,
        lastActionFailure: actionFailure
      };
      dom.runtimeDiagnosticsOutput.value = JSON.stringify(diagnostic, null, 2);
      dom.runtimeDiagnosticsOutput.classList.remove("hidden");
    },

    async saveAndConnect() {
      if (this.busy) return;
      this.setBusy(true);
      this.setConnectionStatus(RUNTIME_COPY.connecting, RUNTIME_COPY.connecting);
      this.setMessage("");
      let form = null;
      try {
        form = this.readForm();
        const provider = this.providerById(form.provider);
        if (!provider || provider.id === "mock" || provider.protocol !== "openai-compatible") {
          this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
          this.setMessage(RUNTIME_COPY.failedHelp);
          return;
        }
        if (this.isCustomProvider(provider)) {
          const customBaseURL = String(form.customProvider?.baseURL || "").trim();
          if (!customBaseURL || !/^https:\/\//i.test(customBaseURL)) {
            this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
            this.setMessage("Custom Provider requires an HTTPS Base URL, such as https://example.com/v1.");
            return;
          }
          if (!String(form.model || "").trim()) {
            this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
            this.setMessage("Custom Provider requires a Model ID.");
            return;
          }
        }

        const existingKey = this.providerHasSavedKey(provider);
        const apiKey = this.readSecretForm();
        if (!apiKey && !existingKey) {
          this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
          this.setMessage(RUNTIME_COPY.failedHelp);
          return;
        }

        const response = await BackgroundRuntimeClient.savePublicSettings(form);
        if (!response.ok) {
          if (this.isBackgroundUnavailableResponse(response) && this.hasSuccessfulRealTest(form.provider, form.model)) {
            this.showRuntimeSyncing(form.provider, form.model);
            return;
          }
          const message = this.connectionFailureMessage(response, this.userMessage(response));
          this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
          this.setMessage(RUNTIME_COPY.failedHelp);
          return;
        }
        let hydrated = response;
        if (apiKey) {
          const keyResponse = await BackgroundRuntimeClient.saveSecret(apiKey);
          if (!keyResponse.ok) {
            this.hydrate(response);
            const message = this.connectionFailureMessage(keyResponse, "Runtime Key is missing.");
            this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
            this.setMessage(RUNTIME_COPY.failedHelp);
            return;
          }
          hydrated = keyResponse;
        }
        this.hydrate(hydrated);
        const activeProvider = this.providerById(form.provider);

        this.setConnectionStatus(RUNTIME_COPY.connecting, RUNTIME_COPY.connecting);
        let permissionStatus = await BackgroundRuntimeClient.getProviderPermissionStatus({ providerId: form.provider });
        this.applyPermissionStatus(permissionStatus, form.provider);
        if (!permissionStatus.ok && permissionStatus.errorCode !== "PERMISSION_NOT_CONFIGURED") {
          if (this.isBackgroundUnavailableResponse(permissionStatus) && this.hasSuccessfulRealTest(form.provider, form.model)) {
            this.showRuntimeSyncing(form.provider, form.model);
            return;
          }
          const message = this.connectionFailureMessage(permissionStatus, "Provider permission was denied.");
          this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
          this.setMessage(RUNTIME_COPY.failedHelp);
          return;
        }
        if (this.providerHasHostPermission(activeProvider) && !permissionStatus.permissionGranted) {
          this.setConnectionStatus(RUNTIME_COPY.connecting, RUNTIME_COPY.connecting);
          const permissionResponse = await BackgroundRuntimeClient.requestProviderPermission({ providerId: form.provider });
          if (!permissionResponse.ok || permissionResponse.permissionGranted === false) {
            this.applyPermissionStatus(permissionResponse, form.provider);
            if (this.isBackgroundUnavailableResponse(permissionResponse) && this.hasSuccessfulRealTest(form.provider, form.model)) {
              this.showRuntimeSyncing(form.provider, form.model);
              return;
            }
            const message = this.connectionFailureMessage(permissionResponse, "Provider permission was denied.");
            this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
            this.setMessage(RUNTIME_COPY.failedHelp);
            return;
          }
          permissionStatus = await BackgroundRuntimeClient.getProviderPermissionStatus({ providerId: form.provider });
          this.applyPermissionStatus(permissionStatus, form.provider);
          if (!permissionStatus.ok || !permissionStatus.permissionGranted) {
            if (this.isBackgroundUnavailableResponse(permissionStatus) && this.hasSuccessfulRealTest(form.provider, form.model)) {
              this.showRuntimeSyncing(form.provider, form.model);
              return;
            }
            const message = this.connectionFailureMessage(permissionStatus, "Provider permission was denied.");
            this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
            this.setMessage(RUNTIME_COPY.failedHelp);
            return;
          }
        }

        this.setConnectionStatus(RUNTIME_COPY.connecting, RUNTIME_COPY.connecting);
        const readiness = await BackgroundRuntimeClient.getBackgroundChatReadiness({
          providerId: form.provider,
          model: form.model
        });
        this.lastReadiness = readiness?.ok ? readiness : null;
        this.renderReadiness(readiness?.ok ? readiness : null);
        if (!readiness.ok || !readiness.canUseBackgroundRuntime) {
          if (
            this.isBackgroundUnavailableResponse(readiness)
            && this.hasSuccessfulRealTest(form.provider, form.model)
          ) {
            this.showRuntimeSyncing(form.provider, form.model);
            return;
          }
          const message = this.connectionFailureMessage(readiness, readiness.nextAction || "Model test failed. Check your Model ID or provider account.");
          this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
          this.setMessage(RUNTIME_COPY.failedHelp);
          return;
        }

        this.setConnectionStatus(RUNTIME_COPY.connecting, RUNTIME_COPY.connecting);
        const testResponse = await BackgroundRuntimeClient.testProviderConnection({
          providerId: form.provider,
          model: form.model
        });
        if (testResponse.lastRealTestStatus) {
          state.runtimePublicSettings.lastRealTestStatus = testResponse.lastRealTestStatus;
        }
        this.renderSetupChecklist(this.lastReadiness);
        if (!testResponse.ok) {
          this.showFailureDiagnostics(testResponse);
          if (
            this.isBackgroundUnavailableResponse(testResponse)
            && this.hasSuccessfulRealTest(form.provider, form.model)
          ) {
            this.showRuntimeSyncing(form.provider, form.model);
            return;
          }
          const message = this.connectionFailureMessage(testResponse);
          this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
          this.setMessage(RUNTIME_COPY.failedHelp);
          return;
        }

        this.setStatusProviderModel(activeProvider, testResponse.model || form.model);
        this.setConnectionStatus(RUNTIME_COPY.connected, RUNTIME_COPY.testPassed);
        this.setMessage("");
      } catch (error) {
        if (this.hasSuccessfulRealTest(form?.provider, form?.model)) {
          this.showRuntimeSyncing(form.provider, form.model);
          return;
        }
        const message = error?.message || "Model test failed. Check your Model ID or provider account.";
        this.setConnectionStatus(RUNTIME_COPY.failed, RUNTIME_COPY.failedHelp);
        this.setMessage(RUNTIME_COPY.failedHelp);
      } finally {
        this.setBusy(false);
      }
    },

    async saveKey() {
      if (this.busy) return;
      const apiKey = this.readSecretForm();
      if (!apiKey) {
        this.setMessage("Enter a Runtime API Key before saving.");
        return;
      }

      this.setBusy(true);
      this.setMessage("Saving runtime key...");
      try {
        const response = await BackgroundRuntimeClient.saveSecret(apiKey);
        if (!response.ok) {
          this.setMessage(this.userMessage(response, "Runtime key save failed."));
          return;
        }
        this.hydrate(response);
        this.setMessage("Runtime Key saved for the selected provider. Backend key is unchanged.");
      } catch (error) {
        this.setMessage(error?.message || "Runtime key save failed.");
      } finally {
        this.setBusy(false);
      }
    },

    async testMock() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("[Mock Test] Running mock runtime test...");
      try {
        const form = this.readForm();
        const response = await BackgroundRuntimeClient.testConnectionMock({
          providerId: form.provider,
          model: form.model
        });
        if (!response.ok) {
          this.setMessage(`[Mock Test] ${response.message || this.userMessage(response, "Mock runtime test failed.")}`);
          return;
        }
        this.setMessage(`[Mock Test] ${response.message || "Mock test passed. Real provider requests are still disabled."}`);
      } catch (error) {
        this.setMessage(`[Mock Test] ${error?.message || "Mock runtime test failed."}`);
      } finally {
        this.setBusy(false);
      }
    },

    async refreshProviderPermissionStatus(providerId = dom.runtimeProvider?.value || "mock") {
      const provider = this.providerById(providerId);
      if (!this.providerHasHostPermission(provider)) {
        this.applyPermissionStatus({
          ok: false,
          providerId,
          errorCode: "PERMISSION_NOT_CONFIGURED",
          permissionConfigured: false,
          permissionGranted: false,
          requestEnabled: false
        }, providerId);
        return;
      }

      try {
        const response = await BackgroundRuntimeClient.getProviderPermissionStatus({ providerId });
        if ((dom.runtimeProvider?.value || "mock") !== providerId) return;
        this.applyPermissionStatus(response, providerId);
      } catch (error) {
        if ((dom.runtimeProvider?.value || "mock") !== providerId) return;
        this.applyPermissionStatus({
          ok: false,
          providerId,
          errorCode: "PERMISSION_STATUS_UNAVAILABLE",
          permissionConfigured: true,
          permissionGranted: false,
          requestEnabled: false
        }, providerId);
      }
    },

    async checkPermission() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("[Permission Check] Checking provider permission status...");
      try {
        const form = this.readForm();
        const response = await BackgroundRuntimeClient.getProviderPermissionStatus({
          providerId: form.provider
        });
        const providerLabel = response.providerName || this.providerById(form.provider)?.displayName || form.provider;
        this.applyPermissionStatus(response, form.provider);
        if (response.ok) {
          const permissionText = response.permissionGranted ? "is granted" : "is not granted";
          this.setMessage(`[Permission Check] ${providerLabel} permission ${permissionText}. Real provider requests are still disabled.`);
          return;
        }
        this.setMessage(`[Permission Check] ${response.message || this.userMessage(response, "Provider permission status check failed.")}`);
      } catch (error) {
        this.setMessage(`[Permission Check] ${error?.message || "Provider permission status check failed."}`);
      } finally {
        this.setBusy(false);
      }
    },

    async checkReadiness() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("[Readiness] Checking Runtime Mode readiness...");
      try {
        const form = this.readForm();
        const response = await BackgroundRuntimeClient.getBackgroundChatReadiness({
          providerId: form.provider,
          model: form.model
        });
        this.lastReadiness = response?.ok ? response : null;
        this.renderReadiness(response?.ok ? response : null);
        if (!response.ok) {
          this.setMessage(`[Readiness] ${response.message || this.userMessage(response, "Runtime Mode readiness check failed.")}`);
          return;
        }
        this.setMessage(`[Readiness] ${response.nextAction || (response.canUseBackgroundRuntime ? "Background Runtime Beta is ready." : "Background Runtime Beta is not ready yet.")}`);
      } catch (error) {
        this.lastReadiness = null;
        this.renderReadiness(null);
        this.setMessage(`[Readiness] ${error?.message || "Runtime Mode readiness check failed."}`);
      } finally {
        this.setBusy(false);
      }
    },

    async requestPermission() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("[Permission Check] Requesting provider permission...");
      try {
        const form = this.readForm();
        const response = await BackgroundRuntimeClient.requestProviderPermission({
          providerId: form.provider
        });
        this.setMessage(`[Permission Check] ${response.message || this.userMessage(response, "Provider permission request failed.")}`);

        const status = await BackgroundRuntimeClient.getProviderPermissionStatus({
          providerId: form.provider
        });
        this.applyPermissionStatus(status, form.provider);
      } catch (error) {
        this.setMessage(error?.message || "Provider permission request failed.");
      } finally {
        this.setBusy(false);
      }
    },

    async testReal() {
      if (this.busy) return;
      const form = this.readForm();
      const provider = this.providerById(form.provider);
      if (provider?.id !== "mock" && provider?.protocol === "openai-compatible") {
        const confirmed = window.confirm(
          `This sends a minimal ${provider.displayName} request and may consume a tiny amount of quota.`
        );
        if (!confirmed) return;
      }

      this.setBusy(true);
      this.setMessage("[Real Provider Test] Running real provider test...");
      try {
        const response = await BackgroundRuntimeClient.testProviderConnection({
          providerId: form.provider,
          model: form.model
        });
        if (!response.ok) {
          if (response.lastRealTestStatus) {
            state.runtimePublicSettings.lastRealTestStatus = response.lastRealTestStatus;
            this.renderSetupChecklist();
          }
          this.showFailureDiagnostics(response);
          this.setMessage(`[Real Provider Test] ${this.connectionFailureMessage(response, "Real provider test failed.")}`);
          return;
        }
        if (response.lastRealTestStatus) {
          state.runtimePublicSettings.lastRealTestStatus = response.lastRealTestStatus;
          this.renderSetupChecklist();
        }
        this.setMessage(`[Real Provider Test] ${response.message || "Real provider test passed."}`);
      } catch (error) {
        this.setMessage(`[Real Provider Test] ${error?.message || "Real provider test failed."}`);
      } finally {
        this.setBusy(false);
      }
    },

    async clearKey() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("Clearing runtime key...");
      try {
        const response = await BackgroundRuntimeClient.clearKey();
        if (!response.ok) {
          this.setMessage(this.userMessage(response));
          return;
        }
        this.hydrate(response);
        this.setMessage("Runtime key cleared for the selected provider. Backend API Key is unchanged.");
      } catch (error) {
        this.setMessage(error?.message || "Runtime settings request failed.");
      } finally {
        this.setBusy(false);
      }
    },

    async copyDiagnostics() {
      if (this.busy) return;
      this.setBusy(true);
      this.setMessage("[Diagnostics] Preparing safe diagnostics...");
      try {
        const response = await BackgroundRuntimeClient.getDiagnostics();
        if (!response.ok || !response.diagnostics) {
          this.setMessage(`[Diagnostics] ${response.message || this.userMessage(response, "Diagnostics unavailable.")}`);
          return;
        }
        const text = JSON.stringify(response.diagnostics, null, 2);
        if (dom.runtimeDiagnosticsOutput) {
          dom.runtimeDiagnosticsOutput.value = text;
          dom.runtimeDiagnosticsOutput.classList.toggle("hidden", !this.isDeveloperMode());
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          this.setMessage("[Diagnostics] Safe diagnostics copied.");
          return;
        }
        this.setMessage(this.isDeveloperMode()
          ? "[Diagnostics] Clipboard unavailable. Safe diagnostics are shown below."
          : "[Diagnostics] Clipboard unavailable. Turn on Developer Tools to view diagnostics JSON.");
      } catch (error) {
        this.setMessage(`[Diagnostics] ${error?.message || "Diagnostics unavailable."}`);
      } finally {
        this.setBusy(false);
      }
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
        MODEL_AUTH_FAILED: USER_ERROR_MESSAGES.missingApiKey,
        MODEL_TIMEOUT: USER_ERROR_MESSAGES.timeout,
        MODEL_NETWORK_ERROR: "模型服务连接失败，请检查 Base URL。",
        MODEL_BAD_RESPONSE: USER_ERROR_MESSAGES.invalidModelResponse,
        MODEL_CONFIG_INVALID: USER_ERROR_MESSAGES.missingApiKey,
        SETTINGS_AUTH_REQUIRED: "Settings token rejected by local backend."
      };
      return messages[code] || normalizeUserErrorMessage(null, { code, message: fallback, fallback: fallback || "Settings request failed." });
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
        UIController.showSettingsNotice("已保存");
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
          UIController.showSettingsNotice("连接成功");
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
    on(document, "pointerdown", (event) => handleOutsidePointerDown(event), { capture: true, passive: true });
    on(document, "pointerup", (event) => handleOutsidePointerUp(event), { capture: true, passive: true });
    on(window, "resize", () => LayoutManager.handleViewportResize("resize"));
    on(document, "fullscreenchange", () => LayoutManager.handleViewportResize("fullscreenchange"));
    if (window.visualViewport) {
      on(window.visualViewport, "resize", () => LayoutManager.handleViewportResize("visualViewport.resize"));
    }

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

    on(dom.settingsRuntimeEntry, "click", (event) => {
      event.stopPropagation();
      UIController.openRuntimeSettings();
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

    on(dom.runtimeSave, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.save();
    });

    on(dom.runtimeProvider, "change", () => {
      RuntimeSettingsManager.handleProviderChange();
    });

    on(dom.runtimeTestMock, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.testMock();
    });

    on(dom.runtimeCheckPermission, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.checkPermission();
    });

    on(dom.runtimeCheckReadiness, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.checkReadiness();
    });

    on(dom.runtimeModeLocal, "change", () => {
      RuntimeSettingsManager.updateRuntimeModeUi(RuntimeSettingsManager.readRuntimeMode());
    });

    on(dom.runtimeModeBackground, "change", () => {
      RuntimeSettingsManager.updateRuntimeModeUi(RuntimeSettingsManager.readRuntimeMode());
      RuntimeSettingsManager.warnIfBackgroundModeWithoutReadiness();
    });

    on(dom.runtimeRequestPermission, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.requestPermission();
    });

    on(dom.runtimeTestReal, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.testReal();
    });

    on(dom.runtimeCopyDiagnostics, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.copyDiagnostics();
    });

    on(dom.runtimeLocalBackend, "click", (event) => {
      event.stopPropagation();
      UIController.openModelSettings();
    });

    on(dom.runtimeDeveloperToggle, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.setSetupViewMode(
        RuntimeSettingsManager.isDeveloperMode() ? "user" : "developer"
      );
    });

    on(dom.runtimeReload, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.load();
    });

    on(dom.runtimeClearKey, "click", (event) => {
      event.stopPropagation();
      RuntimeSettingsManager.clearKey();
    });

    on(dom.runtimeBack, "click", (event) => {
      event.stopPropagation();
      UIController.backToSettingsMenu();
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
    ActionRunner.applyBackgroundChatInputHint?.();
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
