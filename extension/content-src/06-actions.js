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

      if (config.needsSelection && !state.selectedText) return config.empty;
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
      if (!response.ok) throw new Error(data?.reply || `后端请求失败：${response.status}`);
      return data;
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
      UIController.showLoading(action);
      setRunning(true);

      try {
        log("request", payload);
        const result = await this.callBackend(payload);
        if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
        log("response", result);
        UIController.showResult(result);
      } catch (error) {
        if (requestId !== state.requestId || state.ui !== UI.PANEL) return;
        console.error(error);
        UIController.showError(error);
      } finally {
        if (requestId === state.requestId) setRunning(false);
      }
    }
  };
