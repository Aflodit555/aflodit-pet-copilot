// =========================
  // 4. 几何 / 布局工具
  // =========================
  const Geometry = {
    getViewport() {
      return {
        width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0),
        height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0)
      };
    },

    getAvatarSize() {
      const rect = dom.avatar?.getBoundingClientRect?.();
      const fallback = CONFIG.drag.avatarSize;
      return { width: rect?.width || fallback, height: rect?.height || fallback };
    },

    getAvatarRect() {
      return dom.avatar?.getBoundingClientRect?.() || dom.root?.getBoundingClientRect?.();
    },

    getAvatarCenter() {
      const rect = this.getAvatarRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    },

    clampPosition(position = state.position) {
      const viewport = this.getViewport();
      const size = this.getAvatarSize();
      const margin = CONFIG.drag.viewportMargin;
      const maxX = Math.max(margin, viewport.width - size.width - margin);
      const maxY = Math.max(margin, viewport.height - size.height - margin);

      return {
        x: Math.round(clamp(Number(position.x) || 0, margin, maxX)),
        y: Math.round(clamp(Number(position.y) || 0, margin, maxY)),
        snapEdge: position.snapEdge || "free"
      };
    },

    snapPosition(position = state.position) {
      const viewport = this.getViewport();
      const size = this.getAvatarSize();
      const margin = CONFIG.drag.viewportMargin;
      const bounds = {
        left: margin,
        top: margin,
        right: Math.max(margin, viewport.width - size.width - margin),
        bottom: Math.max(margin, viewport.height - size.height - margin)
      };
      const current = this.clampPosition(position);
      const candidates = [
        { edge: "left", distance: Math.abs(current.x - bounds.left), x: bounds.left, y: current.y },
        { edge: "right", distance: Math.abs(current.x - bounds.right), x: bounds.right, y: current.y },
        { edge: "top", distance: Math.abs(current.y - bounds.top), x: current.x, y: bounds.top },
        { edge: "bottom", distance: Math.abs(current.y - bounds.bottom), x: current.x, y: bounds.bottom }
      ].sort((a, b) => a.distance - b.distance);

      const nearest = candidates[0];
      if (nearest.distance <= CONFIG.drag.snapDistance) {
        return this.clampPosition({ x: nearest.x, y: nearest.y, snapEdge: nearest.edge });
      }

      return { ...current, snapEdge: "free" };
    },

    clampFloating(left, top, width, height) {
      const viewport = this.getViewport();
      const margin = CONFIG.drag.viewportMargin;
      const maxLeft = Math.max(margin, viewport.width - width - margin);
      const maxTop = Math.max(margin, viewport.height - height - margin);
      return {
        left: clamp(left, margin, maxLeft),
        top: clamp(top, margin, maxTop)
      };
    },

    setAbsolutePosition(element, left, top) {
      const rootRect = dom.root.getBoundingClientRect();
      element.style.left = `${Math.round(left - rootRect.left)}px`;
      element.style.top = `${Math.round(top - rootRect.top)}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
    },

    getFloatingSize(element, fallbackWidth, fallbackHeight) {
      return {
        width: element.offsetWidth || fallbackWidth,
        height: element.offsetHeight || fallbackHeight
      };
    },

    rectsOverlap(a, b, margin = 0) {
      return !(
        a.right + margin <= b.left ||
        a.left >= b.right + margin ||
        a.bottom + margin <= b.top ||
        a.top >= b.bottom + margin
      );
    },

    expandRect(rect, padding = 0) {
      return {
        left: rect.left - padding,
        top: rect.top - padding,
        right: rect.right + padding,
        bottom: rect.bottom + padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2
      };
    }
  };
// =========================
  // 8. 浮层布局系统
  // =========================
  const LayoutManager = {
    setRootPosition(position, { snap = false } = {}) {
      const next = snap ? Geometry.snapPosition(position) : Geometry.clampPosition(position);
      state.position = next;

      dom.root.style.left = `${next.x}px`;
      dom.root.style.top = `${next.y}px`;
      dom.root.style.right = "auto";
      dom.root.style.bottom = "auto";
      dom.root.dataset.snapEdge = next.snapEdge || "free";

      this.updateFloatingLayout();
    },

    setInitialPosition() {
      const viewport = Geometry.getViewport();
      const size = Geometry.getAvatarSize();
      const offset = CONFIG.drag.initialOffset;
      this.setRootPosition({
        x: viewport.width - size.width - offset,
        y: viewport.height - size.height - offset,
        snapEdge: "right"
      }, { snap: false });
    },

    handleViewportResize() {
      this.setRootPosition(state.position, { snap: state.position.snapEdge !== "free" });
      this.updateFloatingLayout();
    },

    getOpenOrientation() {
      const viewport = Geometry.getViewport();
      const avatarCenter = Geometry.getAvatarCenter();
      const openHorizontal = avatarCenter.x > viewport.width / 2 ? "left" : "right";
      const openVertical = avatarCenter.y > viewport.height / 2 ? "up" : "down";
      const signX = openHorizontal === "left" ? -1 : 1;
      const signY = openVertical === "up" ? -1 : 1;

      return {
        openHorizontal,
        openVertical,
        signX,
        signY,
        menuVariant: `${openVertical === "up" ? "b" : "t"}${openHorizontal === "left" ? "r" : "l"}`
      };
    },

    getMenuButtonPositions(orientation) {
      const avatarCenter = Geometry.getAvatarCenter();
      const buttonWidth = 100;
      const buttonHeight = 40;

      return MENU_BUTTON_OFFSETS.map((item) => {
        const dx = Math.abs(item.dx) * orientation.signX;
        // MENU_BUTTON_OFFSETS 的 dy 以“向上展开”为基准；在上方区域时做上下镜像。
        const dy = item.dy * (orientation.signY === -1 ? 1 : -1);
        const desiredLeft = avatarCenter.x + dx - buttonWidth / 2;
        const desiredTop = avatarCenter.y + dy - buttonHeight / 2;
        const clamped = Geometry.clampFloating(desiredLeft, desiredTop, buttonWidth, buttonHeight);
        return { key: item.key, ...clamped };
      });
    },

    applyMenuButtonLayout(button, left, top) {
      const rootRect = dom.root.getBoundingClientRect();
      button.style.left = `${Math.round(left - rootRect.left)}px`;
      button.style.top = `${Math.round(top - rootRect.top)}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
    },

    applyMenuTailDirection(button) {
      const buttonRect = button.getBoundingClientRect();
      const avatarRect = Geometry.getAvatarRect();
      const buttonCenterX = buttonRect.left + buttonRect.width / 2;
      const buttonCenterY = buttonRect.top + buttonRect.height / 2;
      const avatarCenterX = avatarRect.left + avatarRect.width / 2;
      const avatarCenterY = avatarRect.top + avatarRect.height / 2;
      const dx = avatarCenterX - buttonCenterX;
      const dy = avatarCenterY - buttonCenterY;

      button.classList.remove("tail-top", "tail-bottom", "tail-left", "tail-right");
      if (Math.abs(dx) > Math.abs(dy)) {
        button.classList.add(dx > 0 ? "tail-right" : "tail-left");
      } else {
        button.classList.add(dy > 0 ? "tail-bottom" : "tail-top");
      }
    },

    updateMenuLayout() {
      if (!dom.menu || dom.menu.classList.contains("hidden")) return;

      const rootRect = dom.root.getBoundingClientRect();
      const orientation = this.getOpenOrientation();
      state.layout.menuVariant = orientation.menuVariant;
      dom.menu.dataset.variant = orientation.menuVariant;

      // 菜单容器只作为按钮承载层，直接锚在 root 上；按钮按真实屏幕坐标计算。
      Geometry.setAbsolutePosition(dom.menu, rootRect.left, rootRect.top);

      this.getMenuButtonPositions(orientation).forEach((item) => {
        const button = dom.quickButtonMap[item.key];
        if (!button) return;
        this.applyMenuButtonLayout(button, item.left, item.top);
      });

      window.requestAnimationFrame(() => {
        dom.quickButtons.forEach((button) => this.applyMenuTailDirection(button));
      });
    },

    updatePanelLayout() {
      if (!dom.panel || dom.panel.classList.contains("hidden")) return;

      const size = Geometry.getFloatingSize(dom.panel, CONFIG.drag.floatingWidth, 260);
      const viewport = Geometry.getViewport();
      const avatarRect = Geometry.getAvatarRect();
      const margin = CONFIG.drag.viewportMargin;
      const gap = CONFIG.drag.panelGap;

      const roomAbove = avatarRect.top - margin;
      const roomBelow = viewport.height - avatarRect.bottom - margin;
      const roomLeft = avatarRect.left - margin;
      const roomRight = viewport.width - avatarRect.right - margin;

      const preferVertical = Math.max(roomAbove, roomBelow) >= size.height + gap || Math.min(roomLeft, roomRight) < size.width * 0.4;
      let desiredLeft = avatarRect.left;
      let desiredTop = avatarRect.bottom + gap;

      if (preferVertical) {
        const placeAbove = roomAbove >= size.height + gap || roomAbove >= roomBelow;
        state.layout.panelPlacement = placeAbove ? "top" : "bottom";
        desiredTop = placeAbove ? avatarRect.top - size.height - gap : avatarRect.bottom + gap;
        desiredLeft = (avatarRect.left + avatarRect.right) / 2 > viewport.width / 2
          ? avatarRect.right - size.width
          : avatarRect.left;
      } else {
        const placeLeft = roomLeft >= size.width + gap || roomLeft >= roomRight;
        state.layout.panelPlacement = placeLeft ? "left" : "right";
        desiredLeft = placeLeft ? avatarRect.left - size.width - gap : avatarRect.right + gap;
        desiredTop = avatarRect.top;
      }

      const next = Geometry.clampFloating(desiredLeft, desiredTop, size.width, size.height);
      Geometry.setAbsolutePosition(dom.panel, next.left, next.top);
    },

    getHelpCandidates(size, anchorRect, avatarRect) {
      const gap = CONFIG.drag.helpGap;
      return [
        { name: "above", left: anchorRect.left, top: anchorRect.top - size.height - gap },
        { name: "below", left: anchorRect.left, top: anchorRect.bottom + gap },
        { name: "right", left: anchorRect.right + gap, top: anchorRect.top },
        { name: "left", left: anchorRect.left - size.width - gap, top: anchorRect.top }
      ].map((item) => {
        const clamped = Geometry.clampFloating(item.left, item.top, size.width, size.height);
        const rect = {
          left: clamped.left,
          top: clamped.top,
          right: clamped.left + size.width,
          bottom: clamped.top + size.height,
          width: size.width,
          height: size.height
        };
        const overlapAvatar = Geometry.rectsOverlap(rect, Geometry.expandRect(avatarRect, 10));
        return { ...item, ...clamped, rect, overlapAvatar };
      });
    },

    updateHelpLayout() {
      if (!dom.help || dom.help.classList.contains("hidden")) return;

      const size = Geometry.getFloatingSize(dom.help, CONFIG.drag.floatingWidth, CONFIG.drag.helpHeight);
      const panelVisible = dom.panel && !dom.panel.classList.contains("hidden");
      const avatarRect = Geometry.getAvatarRect();
      const anchorRect = panelVisible ? dom.panel.getBoundingClientRect() : avatarRect;
      const candidates = this.getHelpCandidates(size, anchorRect, avatarRect);

      let ordered = candidates;

      if (panelVisible) {
        // help 要和 panel 站在同一侧，更远离 avatar，避免被笑脸切到。
        const ax = (avatarRect.left + avatarRect.right) / 2;
        const ay = (avatarRect.top + avatarRect.bottom) / 2;
        const px = (anchorRect.left + anchorRect.right) / 2;
        const py = (anchorRect.top + anchorRect.bottom) / 2;

        const preferred = Math.abs(px - ax) > Math.abs(py - ay)
          ? (px >= ax ? ["right", "above", "below", "left"] : ["left", "above", "below", "right"])
          : (py >= ay ? ["below", "right", "left", "above"] : ["above", "right", "left", "below"]);

        ordered = preferred.flatMap((name) => candidates.filter((item) => item.name === name));
      }

      const best = ordered.find((item) => !item.overlapAvatar) || ordered[0];
      Geometry.setAbsolutePosition(dom.help, best.left, best.top);
    },

    updateFloatingLayout() {
      if (!dom.root) return;
      this.updateMenuLayout();
      this.updatePanelLayout();
      this.updateHelpLayout();
    }
  };
