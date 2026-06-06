// =========================
  // 11. 后端链路
  // =========================
  const ActionRunner = {
    validate(action, userText = "") {
      const config = actionConfig(action);
      Extractor.updateSelectedText();

      if (action === ACTION.CHAT) {
        const chat = Extractor.parseChatInput(userText);
        if (!chat.userText) return config.empty;
        if (chat.useSelection && !(state.selectedText || Extractor.getSelectedText())) {
          return "请先选中文本，或去掉 @选区。";
        }
        return "";
      }

      if (config.needsSelection && !state.selectedText) return normalizeUserErrorMessage("NO_SELECTED_TEXT");
      if (config.needsUserText && !userText.trim()) return config.empty;
      if (action === ACTION.SUMMARY && !Extractor.getPageTextSnippet()) return config.empty;
      return "";
    },

    buildPayload(action, userText = "") {
      const config = actionConfig(action);
      const selectedText = state.selectedText || Extractor.getSelectedText();
      const chat = action === ACTION.CHAT ? Extractor.parseChatInput(userText) : null;
      const finalUserText = chat ? chat.userText : userText;
      const useSelection = chat ? chat.useSelection : action !== ACTION.CHAT;
      const usePage = chat ? chat.usePage : config.sendsPageText;
      const hasContext = useSelection || usePage;

      return {
        action: limit(action, CONFIG.limits.action),
        user_text: limit(finalUserText, CONFIG.limits.userText),
        selected_text: useSelection ? limit(selectedText, CONFIG.limits.selectedText) : "",
        page_title: hasContext ? limit(document.title, CONFIG.limits.pageTitle) : "",
        page_url: hasContext ? limit(window.location.href, CONFIG.limits.pageUrl) : "",
        page_text_snippet: usePage ? Extractor.getPageTextSnippet() : "",
        character_state: limit("thinking", CONFIG.limits.characterState)
      };
    },

    async callBackend(payload) {
      const response = await fetch(CONFIG.backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aflodit-Pet-Token": CONFIG.localClientToken
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(data?.reply || data?.message || `后端请求失败：${response.status}`);
        error.code = data?.error_code || data?.code || data?.error?.code;
        error.data = data;
        error.status = response.status;
        throw error;
      }
      if (!data || typeof data.reply !== "string") {
        const error = new Error("Unexpected backend response shape.");
        error.code = "MODEL_BAD_RESPONSE";
        error.data = data;
        throw error;
      }
      return data;
    },

    handleStreamEventLine(line, handlers) {
      if (!line.trim()) return null;
      const event = JSON.parse(line);

      if (event.type === "delta") {
        handlers.onDelta?.(String(event.text || ""));
        return null;
      }

      if (event.type === "final") {
        return event.data || null;
      }

      if (event.type === "error") {
        const data = event.data || null;
        if (data && !data.error_code && event.error_code) data.error_code = event.error_code;
        return data;
      }

      return null;
    },

    async callStreamingBackend(payload, handlers = {}) {
      const response = await fetch(CONFIG.streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aflodit-Pet-Token": CONFIG.localClientToken
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok || !response.body) {
        throw new Error(`流式后端请求失败：${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData = null;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const result = this.handleStreamEventLine(line, handlers);
          if (result) finalData = result;
        }

        if (done) break;
      }

      if (buffer.trim()) {
        const result = this.handleStreamEventLine(buffer, handlers);
        if (result) finalData = result;
      }

      if (!finalData) {
        const error = new Error("流式后端没有返回 final 事件。");
        error.code = "MODEL_BAD_RESPONSE";
        throw error;
      }
      return finalData;
    },

    async runAction(action, userText = "") {
      if (state.running) return;

      UIController.openPanel(action);
      const validationError = this.validate(action, userText);
      if (validationError) {
        UIController.showWarning(validationError);
        return;
      }

      const requestId = ++state.requestId;
      const payload = this.buildPayload(action, userText.trim());
      state.pendingRequest = {
        action,
        selectedText: payload.selected_text || "",
        fingerprint: `${payload.action}|${payload.selected_text || ""}|${payload.page_url || ""}|${payload.page_text_snippet || ""}`
      };
      UIController.showLoading(action);
      setRunning(true);

      try {
        log("request", payload);
        let result;
        if (CONFIG.streamEnabled) {
          try {
            UIController.showStreamingStart(action);
            result = await this.callStreamingBackend(payload, {
              onDelta(delta) {
                if (requestId === state.requestId && state.ui === UI.PANEL) {
                  UIController.appendStreamingDelta(delta);
                }
              }
            });
          } catch (streamError) {
            log("stream fallback", streamError);
            if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
            UIController.showLoading(action);
            result = await this.callBackend(payload);
          }
        } else {
          result = await this.callBackend(payload);
        }
        if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
        log("response", result);
        UIController.showResult(result);
      } catch (error) {
        if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
        console.error(error);
        UIController.showError(error);
      } finally {
        if (requestId === state.requestId) state.pendingRequest = null;
        if (requestId === state.requestId) setRunning(false);
      }
    }
  };
