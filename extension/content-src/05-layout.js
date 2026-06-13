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
      return safeGetRect(dom.avatar) || safeGetRect(dom.root) || {
        left: 0,
        top: 0,
        right: CONFIG.drag.avatarSize,
        bottom: CONFIG.drag.avatarSize,
        width: CONFIG.drag.avatarSize,
        height: CONFIG.drag.avatarSize,
        x: 0,
        y: 0
      };
    },

    getPositioningRect(position = state.position) {
      const rootRect = safeGetRect(dom.root);
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

    setAbsolutePosition(element, left, top, callerLabel = "Geometry.setAbsolutePosition") {
      const rootRect = safeGetRect(dom.root);
      if (!element || !rootRect) return;
      element.style.left = `${Math.round(left - rootRect.left)}px`;
      element.style.top = `${Math.round(top - rootRect.top)}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      traceLayout("Geometry.setAbsolutePosition", {
        callerLabel,
        target: traceElementName(element),
        requested: { left, top },
        rootRect: {
          left: rootRect.left,
          top: rootRect.top,
          right: rootRect.right,
          bottom: rootRect.bottom
        }
      });
      tracePositionWrite(callerLabel, element);
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
    }
  };
// =========================
  // 8. 浮层布局系统
  // =========================
  const LayoutManager = {
    layoutFrame: null,
    anchorLayoutTimer: null,
    layoutReason: "layout",
    firstLayoutStarted: false,
    firstLayoutApplied: false,

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
      traceLayout("LayoutManager.applyRootPosition", {
        resolved,
        dockEdge,
        target: traceElementName(dom.root)
      });
      tracePositionWrite("LayoutManager.applyRootPosition", dom.root);

      this.updateFloatingLayout();
    },

    setRootPosition(position, { snap = false, persist = true } = {}) {
      traceLayout("LayoutManager.setRootPosition start", {
        input: position,
        snap,
        persist,
        edgeSnap: state.uiSettings.edgeSnap
      });
      const shouldSnap = snap && state.uiSettings.edgeSnap;
      const next = shouldSnap ? Geometry.snapPosition(position) : Geometry.resolvePosition(position);
      traceLayout("LayoutManager.setRootPosition resolved", { shouldSnap, next });
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
      if (persist && state.uiSettings.initialPosition === "current") {
        UiSettingsStore.saveCurrentPosition(next);
      }
    },

    positionForCorner(corner) {
      const isLeft = corner === "bottom-left" || corner === "top-left";
      const isTop = corner === "top-left" || corner === "top-right";
      const dockX = isLeft ? "left" : "right";
      const dockY = isTop ? "top" : "bottom";
      const offset = CONFIG.drag.initialOffset;

      return {
        mode: "docked",
        dockX,
        dockY,
        offsetX: offset,
        offsetY: offset,
        x: 0,
        y: 0,
        updatedAt: Date.now()
      };
    },

    positionFromUiSettings() {
      const settings = state.uiSettings;
      if (settings.initialPosition === "current" && settings.savedPosition) {
        return {
          mode: "free",
          dockX: null,
          dockY: null,
          offsetX: 0,
          offsetY: 0,
          x: settings.savedPosition.x,
          y: settings.savedPosition.y,
          updatedAt: Date.now()
        };
      }
      return this.positionForCorner(settings.initialPosition || "bottom-right");
    },

    setInitialPosition() {
      this.setRootPosition(this.positionFromUiSettings(), { snap: false, persist: false });
    },

    applyAnchoredLayout(reason = "layout") {
      const next = Geometry.resolvePosition(state.position);
      state.position = {
        mode: next.mode,
        dockX: next.dockX,
        dockY: next.dockY,
        offsetX: next.offsetX,
        offsetY: next.offsetY,
        x: next.x,
        y: next.y,
        updatedAt: state.position?.updatedAt || Date.now()
      };
      traceLayout("LayoutManager.applyAnchoredLayout", { reason, next });
      this.layoutReason = reason;
      this.applyRootPosition(next);
      this.schedulePetLayout();
    },

    scheduleAnchorLayout(reason = "resize") {
      if (this.anchorLayoutTimer) {
        window.clearTimeout(this.anchorLayoutTimer);
      }
      this.anchorLayoutTimer = window.setTimeout(() => {
        this.anchorLayoutTimer = null;
        this.applyAnchoredLayout(reason);
      }, CONFIG.settingsPanel.resizeDebounceMs);
    },

    handleViewportResize(reason = "resize") {
      this.scheduleAnchorLayout(reason);
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
      const rootRect = safeGetRect(dom.root);
      if (!button || !rootRect) return;
      button.style.left = `${Math.round(left - rootRect.left)}px`;
      button.style.top = `${Math.round(top - rootRect.top)}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
      traceLayout("LayoutManager.applyMenuButtonLayout", {
        target: traceElementName(button),
        requested: { left, top }
      });
      tracePositionWrite("LayoutManager.applyMenuButtonLayout", button);
    },

    applyMenuTailDirection(button) {
      const buttonRect = safeGetRect(button);
      const avatarRect = Geometry.getAvatarRect();
      if (!buttonRect || !avatarRect) return;
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

      const rootRect = safeGetRect(dom.root);
      if (!rootRect) return;
      const orientation = this.getOpenOrientation();
      state.layout.menuVariant = orientation.menuVariant;
      dom.menu.dataset.variant = orientation.menuVariant;

      // 菜单容器只作为按钮承载层，直接锚在 root 上；按钮按真实屏幕坐标计算。
      Geometry.setAbsolutePosition(dom.menu, rootRect.left, rootRect.top, "LayoutManager.updateMenuLayout menu");

      this.getMenuButtonPositions(orientation).forEach((item) => {
        const button = dom.quickButtonMap[item.key];
        if (!button) return;
        this.applyMenuButtonLayout(button, item.left, item.top);
      });

      window.requestAnimationFrame(() => {
        dom.quickButtons.forEach((button) => this.applyMenuTailDirection(button));
      });
    },

    rectFromPosition(left, top, width, height) {
      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height
      };
    },

    unionRects(rects) {
      const visible = rects.filter(Boolean);
      if (!visible.length) return null;
      const left = Math.min(...visible.map((rect) => rect.left));
      const top = Math.min(...visible.map((rect) => rect.top));
      const right = Math.max(...visible.map((rect) => rect.right));
      const bottom = Math.max(...visible.map((rect) => rect.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    },

    stackOverflowScore(rect, viewport, margin) {
      return Math.max(0, margin - rect.left)
        + Math.max(0, margin - rect.top)
        + Math.max(0, rect.right - (viewport.width - margin))
        + Math.max(0, rect.bottom - (viewport.height - margin));
    },

    measurePetParts() {
      const viewport = Geometry.getViewport();
      const margin = 12;
      const gap = 12;
      const avatarRect = Geometry.getAvatarRect();
      const panelSize = Geometry.getFloatingSize(dom.panel, CONFIG.drag.floatingWidth, 260);
      const hasAux = !!dom.settings && !dom.settings.classList.contains("hidden");
      const auxNaturalHeight = hasAux
        ? Math.max(48, Math.min(CONFIG.settingsPanel.maxHeight, viewport.height - margin * 2))
        : 0;

      return { viewport, margin, gap, avatarRect, panelSize, hasAux, auxNaturalHeight };
    },

    deriveCardRectFromAvatar(placement, parts) {
      const { avatarRect, panelSize, viewport, gap } = parts;
      const centerX = avatarRect.left + avatarRect.width / 2;
      const centerY = avatarRect.top + avatarRect.height / 2;
      const alignLeft = centerX > viewport.width / 2 ? avatarRect.right - panelSize.width : avatarRect.left;
      const alignTop = centerY > viewport.height / 2 ? avatarRect.bottom - panelSize.height : avatarRect.top;
      const preferred = {
        top: { left: alignLeft, top: avatarRect.top - panelSize.height - gap },
        bottom: { left: alignLeft, top: avatarRect.bottom + gap },
        left: { left: avatarRect.left - panelSize.width - gap, top: alignTop },
        right: { left: avatarRect.right + gap, top: alignTop }
      }[placement] || { left: alignLeft, top: avatarRect.top - panelSize.height - gap };

      return this.rectFromPosition(preferred.left, preferred.top, panelSize.width, panelSize.height);
    },

    panelCandidates(parts) {
      const { avatarRect, viewport, margin } = parts;
      const roomLeft = avatarRect.left - margin;
      const roomRight = viewport.width - avatarRect.right - margin;
      const preferLeft = roomLeft >= roomRight;
      const orderedPlacements = ["top", "bottom", preferLeft ? "left" : "right", preferLeft ? "right" : "left"];

      return orderedPlacements.map((placement, index) => {
        const rect = this.deriveCardRectFromAvatar(placement, parts);
        return {
          placement,
          priority: index,
          left: rect.left,
          top: rect.top
        };
      });
    },

    deriveSettingsRectFromCard(panelRect, side, parts) {
      const { gap, auxNaturalHeight } = parts;
      const localLeft = 0;
      const localTop = side === "above" ? -auxNaturalHeight - gap : panelRect.height + gap;
      const left = panelRect.left + localLeft;
      const top = panelRect.top + localTop;

      return {
        side,
        height: auxNaturalHeight,
        localLeft,
        localTop,
        rect: this.rectFromPosition(left, top, panelRect.width, auxNaturalHeight)
      };
    },

    auxPlacements(panelRect, parts) {
      if (!parts.hasAux) return [{ side: "none", height: 0, rect: null, scoreBias: 0 }];

      const { viewport, margin, gap, auxNaturalHeight } = parts;
      const spaceAbove = panelRect.top - margin - gap;
      const spaceBelow = viewport.height - panelRect.bottom - margin - gap;
      const build = (side, scoreBias) => {
        return {
          ...this.deriveSettingsRectFromCard(panelRect, side, parts),
          scoreBias
        };
      };
      const above = build("above", 0);
      const below = build("below", 20);
      if (spaceAbove >= auxNaturalHeight) return [above, below];
      if (spaceBelow >= auxNaturalHeight) return [below, above];
      return spaceAbove >= spaceBelow ? [above, below] : [below, above];
    },

    scoreLayoutCandidate(candidate, parts) {
      const { viewport, margin, avatarRect, panelSize, gap } = parts;
      const panelRect = this.rectFromPosition(candidate.left, candidate.top, panelSize.width, panelSize.height);
      const stackRect = this.unionRects([avatarRect, panelRect, candidate.aux?.rect]);
      const overflowPenalty = this.stackOverflowScore(stackRect, viewport, margin) * 1000;
      const panelAvatarOverlap = Geometry.rectsOverlap(panelRect, avatarRect, gap) ? 100000 : 0;
      const auxAvatarOverlap = candidate.aux?.rect && Geometry.rectsOverlap(candidate.aux.rect, avatarRect, gap) ? 50000 : 0;
      const auxPanelOverlap = candidate.aux?.rect && Geometry.rectsOverlap(candidate.aux.rect, panelRect, 0) ? 100000 : 0;
      return overflowPenalty
        + panelAvatarOverlap
        + auxAvatarOverlap
        + auxPanelOverlap
        + candidate.priority * 80
        + (candidate.aux?.scoreBias || 0);
    },

    computePetLayout(parts = null) {
      if (!dom.panel || dom.panel.classList.contains("hidden")) return null;

      traceLayout("LayoutManager.computePetLayout start", {
        firstLayoutStarted: this.firstLayoutStarted,
        panel: traceElementName(dom.panel),
        auxiliaryHidden: dom.settings?.classList.contains("hidden")
      });
      parts = parts || this.measurePetParts();
      const candidates = [];
      this.panelCandidates(parts).forEach((panelCandidate) => {
        const panelRect = this.rectFromPosition(panelCandidate.left, panelCandidate.top, parts.panelSize.width, parts.panelSize.height);
        this.auxPlacements(panelRect, parts).forEach((aux) => {
          candidates.push({ ...panelCandidate, aux });
        });
      });

      const layout = candidates.reduce((best, candidate) => (
        !best || this.scoreLayoutCandidate(candidate, parts) < this.scoreLayoutCandidate(best, parts)
          ? candidate
          : best
      ), null);
      traceLayout("LayoutManager.computePetLayout result", {
        candidateCount: candidates.length,
        layout
      });
      return layout;
    },

    cardSettingsDistance(cardRect, settingsRect) {
      if (!cardRect || !settingsRect) return null;
      const horizontalGap = settingsRect.right < cardRect.left
        ? cardRect.left - settingsRect.right
        : (settingsRect.left > cardRect.right ? settingsRect.left - cardRect.right : 0);
      const verticalGap = settingsRect.bottom <= cardRect.top
        ? cardRect.top - settingsRect.bottom
        : (settingsRect.top >= cardRect.bottom ? settingsRect.top - cardRect.bottom : 0);
      return { horizontalGap, verticalGap };
    },

    rectDistance(a, b) {
      if (!a || !b) return null;
      const horizontalGap = b.right < a.left
        ? a.left - b.right
        : (b.left > a.right ? b.left - a.right : 0);
      const verticalGap = b.bottom < a.top
        ? a.top - b.bottom
        : (b.top > a.bottom ? b.top - a.bottom : 0);
      return {
        horizontalGap,
        verticalGap,
        nearestGap: Math.max(horizontalGap, verticalGap)
      };
    },

    traceAnchoredLayout(reason, layout, parts) {
      if (!AFLODIT_LAYOUT_TRACE || !layout) return;
      const cardRect = this.rectFromPosition(layout.left, layout.top, parts.panelSize.width, parts.panelSize.height);
      const settingsRect = layout.aux?.rect || null;
      const cardSettingsDistance = this.cardSettingsDistance(cardRect, settingsRect);
      const cardAvatarDistance = this.rectDistance(cardRect, parts.avatarRect);
      const payload = {
        reason,
        viewport: parts.viewport,
        anchor: {
          mode: state.position?.mode || "",
          dockX: state.position?.dockX || null,
          dockY: state.position?.dockY || null,
          x: state.position?.x,
          y: state.position?.y
        },
        avatarRect: parts.avatarRect,
        cardRect,
        settingsRect,
        cardSettingsDistance,
        cardAvatarDistance,
        settingsPlacement: layout.aux?.side || "none",
        boundaryCorrection: false
      };
      traceLayout("anchored layout", payload);
      if (cardSettingsDistance && cardSettingsDistance.horizontalGap > 32) {
        console.warn("[AFlodit Layout Trace]", "settings detached from card", payload);
      }
      if (cardAvatarDistance && cardAvatarDistance.nearestGap > 48) {
        console.warn("[AFlodit Layout Trace]", "card detached from avatar", payload);
      }
    },

    applyPetLayout(layout) {
      if (!layout || !dom.panel) return;

      traceLayout("LayoutManager.applyPetLayout start", {
        layout,
        firstLayoutApplied: this.firstLayoutApplied
      });
      Geometry.setAbsolutePosition(dom.panel, layout.left, layout.top, "LayoutManager.applyPetLayout panel");
      state.layout.panelPlacement = layout.placement;

      if (!dom.settings) return;
      if (!layout.aux || layout.aux.side === "none") {
        dom.settings.style.height = "";
        dom.settings.style.maxHeight = "";
        dom.settings.style.left = "";
        dom.settings.style.top = "";
        dom.settings.style.right = "";
        dom.settings.style.bottom = "";
        return;
      }

      dom.settings.dataset.placement = layout.aux.side;
      dom.settings.style.left = `${Math.round(layout.aux.localLeft || 0)}px`;
      dom.settings.style.right = "auto";
      dom.settings.style.width = "100%";
      dom.settings.style.height = `${Math.round(layout.aux.height)}px`;
      dom.settings.style.maxHeight = `${Math.round(layout.aux.height)}px`;
      dom.settings.style.top = `${Math.round(layout.aux.localTop)}px`;
      dom.settings.style.bottom = "auto";
      tracePositionWrite("LayoutManager.applyPetLayout auxiliary", dom.settings);
    },

    updateFloatingLayout() {
      if (!dom.root) return;
      if (!this.firstLayoutStarted) {
        this.firstLayoutStarted = true;
        traceLayout("first layout starts", {
          root: traceElementName(dom.root),
          ready: dom.root.classList.contains("aflodit-ready")
        });
      }
      this.updateMenuLayout();
      const parts = this.measurePetParts();
      const layout = this.computePetLayout(parts);
      this.applyPetLayout(layout);
      this.traceAnchoredLayout(this.layoutReason || "updateFloatingLayout", layout, parts);
      if (!this.firstLayoutApplied) {
        this.firstLayoutApplied = true;
        traceLayout("first layout applies position", {
          root: traceStyleSnapshot(dom.root),
          card: traceStyleSnapshot(dom.panel),
          avatar: traceStyleSnapshot(dom.avatar),
          face: traceStyleSnapshot(dom.face)
        });
      }
    },

    schedulePetLayout() {
      if (this.layoutFrame) return;
      this.layoutFrame = window.requestAnimationFrame(() => {
        this.layoutFrame = null;
        this.updateFloatingLayout();
      });
    },

    markReady() {
      traceLayout("LayoutManager.markReady before reveal", {
        root: traceStyleSnapshot(dom.root),
        card: traceStyleSnapshot(dom.panel),
        avatar: traceStyleSnapshot(dom.avatar),
        face: traceStyleSnapshot(dom.face)
      });
      traceLayout("LayoutManager.markReady clearing inline hidden", {
        previousVisibility: dom.root?.style.visibility || ""
      });
      if (dom.root) dom.root.style.visibility = "";
      tracePositionWrite("LayoutManager.markReady inline hidden cleared", dom.root);
      dom.root?.classList.add("aflodit-ready");
      traceLayout("LayoutManager.markReady aflodit-ready added", {
        className: dom.root?.className || "",
        root: traceStyleSnapshot(dom.root)
      });
    }
  };
