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
      const rootWidth = dom.root?.offsetWidth || 0;
      const rootHeight = dom.root?.offsetHeight || 0;
      const avatarWidth = dom.avatar?.offsetWidth || 0;
      const avatarHeight = dom.avatar?.offsetHeight || 0;
      const fallback = CONFIG.drag.avatarSize;
      return {
        width: rootWidth || avatarWidth || fallback,
        height: rootHeight || avatarHeight || fallback
      };
    },

    getAvatarRect() {
      return dom.avatar?.getBoundingClientRect?.() || dom.root?.getBoundingClientRect?.();
    },

    getPositioningRect(position = state.position) {
      const rootRect = dom.root?.getBoundingClientRect?.();
      if (rootRect?.width && rootRect?.height) {
        return {
          left: rootRect.left,
          top: rootRect.top,
          right: rootRect.right,
          bottom: rootRect.bottom,
          width: rootRect.width,
          height: rootRect.height,
          x: rootRect.left,
          y: rootRect.top
        };
      }

      const current = this.resolvePosition(position);
      const size = this.getAvatarSize();
      return {
        left: current.x,
        top: current.y,
        right: current.x + size.width,
        bottom: current.y + size.height,
        width: size.width,
        height: size.height,
        x: current.x,
        y: current.y
      };
    },

    getAvatarCenter() {
      const rect = this.getAvatarRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    },

    defaultPosition() {
      return {
        mode: "docked",
        dockX: "right",
        dockY: "bottom",
        offsetX: CONFIG.drag.initialOffset,
        offsetY: CONFIG.drag.initialOffset,
        x: 0,
        y: 0,
        updatedAt: Date.now()
      };
    },

    normalizePosition(position = state.position) {
      const fallback = this.defaultPosition();
      const source = position && typeof position === "object" && !Array.isArray(position) ? position : fallback;
      const legacyEdge = source.snapEdge === "left" || source.snapEdge === "right" || source.snapEdge === "top" || source.snapEdge === "bottom"
        ? source.snapEdge
        : null;
      const dockX = source.dockX === "left" || source.dockX === "right"
        ? source.dockX
        : (legacyEdge === "left" || legacyEdge === "right" ? legacyEdge : null);
      const dockY = source.dockY === "top" || source.dockY === "bottom"
        ? source.dockY
        : (legacyEdge === "top" || legacyEdge === "bottom" ? legacyEdge : null);
      const hasMode = source.mode === "free" || source.mode === "docked";
      const hasCoordinates = Number.isFinite(Number(source.x)) && Number.isFinite(Number(source.y));
      const mode = source.mode === "free" && !dockX && !dockY ? "free" : (dockX || dockY ? "docked" : (hasCoordinates ? "free" : fallback.mode));
      const x = hasCoordinates ? Number(source.x) : fallback.x;
      const y = hasCoordinates ? Number(source.y) : fallback.y;
      const offsetX = Math.max(0, Number.isFinite(Number(source.offsetX)) ? Number(source.offsetX) : fallback.offsetX);
      const offsetY = Math.max(0, Number.isFinite(Number(source.offsetY)) ? Number(source.offsetY) : fallback.offsetY);

      if (!dockX && !dockY && !hasCoordinates) {
        return fallback;
      }

      if (mode === "free" || (!dockX && !dockY)) {
        return {
          mode: "free",
          dockX: null,
          dockY: null,
          offsetX: 0,
          offsetY: 0,
          x,
          y,
          updatedAt: Number(source.updatedAt) || Date.now()
        };
      }

      return {
        mode: "docked",
        dockX,
        dockY,
        offsetX,
        offsetY,
        x,
        y,
        updatedAt: Number(source.updatedAt) || Date.now()
      };
    },

    clampFullPosition(x, y) {
      const viewport = this.getViewport();
      const size = this.getAvatarSize();
      const margin = CONFIG.drag.viewportMargin;
      const minX = Math.min(margin, Math.max(0, viewport.width - size.width));
      const minY = Math.min(margin, Math.max(0, viewport.height - size.height));
      const maxX = Math.max(minX, viewport.width - size.width - margin);
      const maxY = Math.max(minY, viewport.height - size.height - margin);

      return {
        x: Math.round(clamp(Number(x) || 0, minX, maxX)),
        y: Math.round(clamp(Number(y) || 0, minY, maxY))
      };
    },

    resolvePosition(position = state.position) {
      const next = this.normalizePosition(position);
      const viewport = this.getViewport();
      const size = this.getAvatarSize();
      let x = next.x;
      let y = next.y;

      if (next.mode === "docked") {
        if (next.dockX === "left") x = next.offsetX;
        if (next.dockX === "right") x = viewport.width - size.width - next.offsetX;
        if (next.dockY === "top") y = next.offsetY;
        if (next.dockY === "bottom") y = viewport.height - size.height - next.offsetY;
      }

      return { ...next, ...this.clampFullPosition(x, y) };
    },

    clampPosition(position = state.position) {
      return this.resolvePosition(position);
    },

    snapPosition(position = state.position) {
      const viewport = this.getViewport();
      const current = this.resolvePosition(position);
      const rect = this.getPositioningRect(current);
      const leftDistance = Math.max(0, rect.left);
      const rightDistance = Math.max(0, viewport.width - rect.right);
      const topDistance = Math.max(0, rect.top);
      const bottomDistance = Math.max(0, viewport.height - rect.bottom);
      const snapDistance = CONFIG.drag.dockSnapThreshold;
      const dockMargin = CONFIG.drag.dockMargin;

      let dockX = null;
      let dockY = null;

      if (Math.min(leftDistance, rightDistance) <= snapDistance) {
        dockX = leftDistance <= rightDistance ? "left" : "right";
      }
      if (Math.min(topDistance, bottomDistance) <= snapDistance) {
        dockY = topDistance <= bottomDistance ? "top" : "bottom";
      }

      if (!dockX && !dockY) {
        return this.resolvePosition({
          mode: "free",
          dockX: null,
          dockY: null,
          offsetX: 0,
          offsetY: 0,
          x: current.x,
          y: current.y,
          updatedAt: Date.now()
        });
      }

      return this.resolvePosition({
        mode: "docked",
        dockX,
        dockY,
        offsetX: dockX ? dockMargin : 0,
        offsetY: dockY ? dockMargin : 0,
        x: current.x,
        y: current.y,
        updatedAt: Date.now()
      });
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
    loadStoredPosition() {
      try {
        const raw = window.localStorage?.getItem(CONFIG.storage.positionKey);
        if (!raw) return null;
        return Geometry.normalizePosition(JSON.parse(raw));
      } catch (error) {
        log("Failed to load pet position.", error);
        return null;
      }
    },

    savePosition() {
      try {
        window.localStorage?.setItem(CONFIG.storage.positionKey, JSON.stringify(state.position));
      } catch (error) {
        log("Failed to save pet position.", error);
      }
    },

    applyRootPosition(resolved) {
      const dockEdge = resolved.mode === "docked"
        ? [resolved.dockY, resolved.dockX].filter(Boolean).join("-")
        : "free";

      dom.root.style.left = `${resolved.x}px`;
      dom.root.style.top = `${resolved.y}px`;
      dom.root.style.right = "auto";
      dom.root.style.bottom = "auto";
      dom.root.dataset.positionMode = resolved.mode;
      dom.root.dataset.dockX = resolved.dockX || "";
      dom.root.dataset.dockY = resolved.dockY || "";
      dom.root.dataset.snapEdge = dockEdge || "free";

      this.updateFloatingLayout();
    },

    setRootPosition(position, { snap = false, persist = true } = {}) {
      const next = snap ? Geometry.snapPosition(position) : Geometry.resolvePosition(position);
      state.position = {
        mode: next.mode,
        dockX: next.dockX,
        dockY: next.dockY,
        offsetX: next.offsetX,
        offsetY: next.offsetY,
        x: next.x,
        y: next.y,
        updatedAt: Date.now()
      };

      this.applyRootPosition(next);
      if (persist) this.savePosition();
    },

    setInitialPosition() {
      const offset = CONFIG.drag.initialOffset;
      const stored = this.loadStoredPosition();
      this.setRootPosition(stored || {
        mode: "docked",
        dockX: "right",
        dockY: "bottom",
        offsetX: offset,
        offsetY: offset,
        x: 0,
        y: 0,
        updatedAt: Date.now()
      }, { snap: false });
    },

    handleViewportResize() {
      this.applyRootPosition(Geometry.resolvePosition(state.position));
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

    updateFloatingLayout() {
      if (!dom.root) return;
      this.updateMenuLayout();
      this.updatePanelLayout();
    }
  };
