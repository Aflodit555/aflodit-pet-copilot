// =========================
  // 10. UI 控制
  // =========================
  const UIController = {
    closeMenu(resetLook = true) {
      dom.menu.classList.add("hidden");
      FaceController.stopLookLoop(resetLook);
    },

    openMenu() {
      FaceController.stopReplyPeekLoop(true);
      Extractor.updateSelectedText();
      this.closePanel();
      dom.menu.classList.remove("hidden");
      state.ui = UI.MENU;
      LayoutManager.updateFloatingLayout();
      FaceController.startMenuLookLoop();
    },

    closePanel() {
      dom.panel.classList.add("hidden");
      dom.refresh.classList.add("hidden");
      dom.help.classList.add("hidden");
      this.closeSettings();
    },

    closeSettings() {
      dom.settings.classList.add("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsMessage.textContent = "";
    },

    toggleSettings() {
      const willOpen = dom.settings.classList.contains("hidden");
      if (!willOpen) {
        this.closeSettings();
        LayoutManager.updateFloatingLayout();
        return;
      }

      dom.help.classList.add("hidden");
      dom.settings.classList.remove("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsModel.classList.add("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.updateFloatingLayout();
    },

    openModelSettings() {
      dom.settingsMenu.classList.add("hidden");
      dom.settingsModel.classList.remove("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.updateFloatingLayout();
    },

    backToSettingsMenu() {
      dom.settingsModel.classList.add("hidden");
      dom.settingsMenu.classList.remove("hidden");
      dom.settingsMessage.textContent = "";
      LayoutManager.updateFloatingLayout();
    },

    showSettingsNotice(message) {
      dom.settingsMessage.textContent = message;
      LayoutManager.updateFloatingLayout();
    },

    toggleHelp() {
      this.closeSettings();
      const willOpen = dom.help.classList.contains("hidden");
      if (willOpen) {
        dom.help.style.visibility = "hidden";
        dom.help.classList.remove("hidden");
        LayoutManager.updateFloatingLayout();
        window.requestAnimationFrame(() => { dom.help.style.visibility = ""; });
        return;
      }
      dom.help.classList.add("hidden");
    },

    openPanel(action) {
      const config = actionConfig(action);
      state.action = action;
      Extractor.updateSelectedText();
      this.closeMenu(true);
      enforceScrollBoxes();

      state.ui = UI.PANEL;
      dom.panel.classList.remove("hidden");
      dom.help.classList.add("hidden");
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
  // 12. 拖拽
  // =========================
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
        state.drag.suppressClick = true;
        window.setTimeout(() => { state.drag.suppressClick = false; }, 160);
      }
    }
  };
// =========================
  // 13. 事件绑定
  // =========================
  function bindEvents() {
    on(document, "selectionchange", () => Extractor.updateSelectedText());
    on(document, "mousemove", (event) => FaceController.handleReadingMouseMove(event), { passive: true });
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

      if (state.ui === UI.IDLE) return UIController.openMenu();
      if (state.ui === UI.MENU) return UIController.openPanel(ACTION.CHAT);
      UIController.closeAll();
    });

    on(dom.menu, "click", (event) => event.stopPropagation());
    on(dom.panel, "click", (event) => event.stopPropagation());
    on(dom.help, "click", (event) => event.stopPropagation());
    on(dom.settings, "click", (event) => event.stopPropagation());

    on(dom.settingsButton, "click", (event) => {
      event.stopPropagation();
      UIController.toggleSettings();
    });

    on(dom.helpButton, "click", (event) => {
      event.stopPropagation();
      UIController.toggleHelp();
    });

    on(dom.settingsModelEntry, "click", (event) => {
      event.stopPropagation();
      UIController.openModelSettings();
    });

    on(dom.settingsTest, "click", (event) => {
      event.stopPropagation();
      UIController.showSettingsNotice("连接测试将在安全设置接口完成后启用。");
    });

    on(dom.settingsSave, "click", (event) => {
      event.stopPropagation();
      UIController.showSettingsNotice("模型配置保存功能将在安全设置接口完成后启用。");
    });

    on(dom.settingsBack, "click", (event) => {
      event.stopPropagation();
      UIController.backToSettingsMenu();
    });

    on(dom.settingsCancel, "click", (event) => {
      event.stopPropagation();
      UIController.closeSettings();
      LayoutManager.updateFloatingLayout();
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
    cleanups.splice(0).forEach((cleanup) => cleanup());
    FaceController.stopLookLoop(true);
    FaceController.stopReplyPeekLoop(true);
    FaceController.stopReadingLoop(true);
    FaceController.hideIdeaBulb({ clearTimer: true });
    dom.root?.remove();
    state.ui = UI.IDLE;
    state.mode = MODE.NORMAL;
    state.activity = ACTIVITY.IDLE;
    state.running = false;
  }

  function init() {
    createDom();
    LayoutManager.setInitialPosition();
    setMode(MODE.NORMAL);
    setActivity(ACTIVITY.IDLE);
    enforceScrollBoxes();
    FaceController.resetFace();
    bindEvents();
    window[GLOBAL_KEY] = { version: CONFIG.version, destroy };
  }

  init();
