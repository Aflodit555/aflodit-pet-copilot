// =========================
  // 6. 文本提取 / 输入解析
  // =========================
  const Extractor = {
    parseChatInput(raw = "") {
      const input = text(raw);
      const parsed = AFloditCommandRegistry.extractChatContextDirectives(input);
      return {
        userText: parsed.userText,
        useSelection: parsed.useSelection,
        usePage: parsed.usePage
      };
    },

    parseLocalCommand(raw = "") {
      const result = AFloditCommandRegistry.findCommand(text(raw));
      if (!result.matched || !result.executable || result.command?.handler?.type !== "local_action") return null;
      return {
        type: result.command.handler.action,
        commandId: result.command.id,
        args: result.args
      };
    },

    isInsideAfloditRoot(node) {
      if (!node) return false;
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return Boolean(element?.closest?.("#aflodit-pet-root, [data-aflodit-root='true']"));
    },

    getSelectedText() {
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0) return "";
      if (this.isInsideAfloditRoot(selection.anchorNode) || this.isInsideAfloditRoot(selection.focusNode)) return "";
      return selection.toString().trim();
    },

    updateSelectedText() {
      const previous = state.selectedText;
      const selected = this.getSelectedText();
      if (selected) state.selectedText = selected;
      if (actionConfig(state.action).context === "selection") {
        dom.selected.textContent = state.selectedText || "暂无选中文本。";
      }
      if (
        selected
        && selected !== previous
        && state.ui === UI.PANEL
        && actionConfig(state.action).context === "selection"
      ) {
        UIController.markReplyStaleForSelection?.(selected);
      }
    },

    getNodeText(node) {
      return String(node?.innerText || node?.textContent || "").trim();
    },

    cleanReadableClone(root) {
      READABLE_SAFE_REMOVE_SELECTORS.forEach((selector) => {
        root.querySelectorAll(selector).forEach((node) => node.remove());
      });
    },

    collectReadableCandidates(root) {
      const nodes = new Set([root]);
      READABLE_SELECTORS.forEach((selector) => {
        root.querySelectorAll(selector).forEach((node) => nodes.add(node));
      });
      return Array.from(nodes).filter((node) => this.getNodeText(node).length >= 200);
    },

    scoreReadableCandidate(node) {
      const rawText = this.getNodeText(node);
      const textLength = rawText.length;
      if (textLength < 200) return -Infinity;

      const linkTextLength = Array.from(node.querySelectorAll("a"))
        .reduce((sum, link) => sum + this.getNodeText(link).length, 0);

      const linkDensity = linkTextLength / Math.max(textLength, 1);
      const paragraphCount = node.querySelectorAll("p").length;
      const headingCount = node.querySelectorAll("h1,h2,h3").length;
      const listItemCount = node.querySelectorAll("li").length;
      const controlCount = node.querySelectorAll("button,input,select,textarea").length;
      const cssSymbolDensity = (rawText.match(/[{};]/g) || []).length / Math.max(textLength, 1);

      const semanticBoost = node.matches?.("article,main,[role='main'],.mw-parser-output,article.markdown-body") ? 8 : 0;
      const textScore = Math.min(textLength / 1000, 10);
      const paragraphScore = Math.min(paragraphCount * 1.8, 14);
      const headingScore = Math.min(headingCount, 4);
      const listScore = Math.min(listItemCount * 0.15, 3);

      return semanticBoost + textScore + paragraphScore + headingScore + listScore
        - linkDensity * 28
        - Math.min(controlCount * 2, 8)
        - cssSymbolDensity * 80;
    },

    pickReadableCandidate(root) {
      return this.collectReadableCandidates(root)
        .map((node) => ({ node, score: this.scoreReadableCandidate(node) }))
        .sort((a, b) => b.score - a.score)[0]?.node || root;
    },

    normalizeReadableText(raw) {
      const seen = new Set();
      return String(raw || "")
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length >= 2)
        .filter((line) => {
          const key = line.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .join("\n")
        .trim();
    },

    getPageTextSnippet() {
      if (!document.body) return "";
      const clone = document.body.cloneNode(true);
      this.cleanReadableClone(clone);
      const readableRoot = this.pickReadableCandidate(clone);
      const readableText = this.normalizeReadableText(this.getNodeText(readableRoot));
      return limit(readableText, CONFIG.limits.pageText);
    },

    getPagePreview() {
      const title = limit(document.title || "当前页面", CONFIG.limits.pageTitle);
      const snippet = this.getPageTextSnippet();
      return snippet ? `${title}\n\n${limit(snippet, CONFIG.limits.pagePreview)}` : title;
    }
  };
