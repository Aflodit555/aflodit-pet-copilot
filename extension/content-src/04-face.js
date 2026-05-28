// =========================
  // 7. 面部 / motion / gaze
  // =========================
  const FaceController = {
    setEmotion(emotion = "neutral") {
      const safeEmotion = FACE_PARTS[emotion] ? emotion : "neutral";
      const parts = FACE_PARTS[safeEmotion];
      dom.eyeLeft.textContent = parts.left;
      dom.eyeRight.textContent = parts.right;
      dom.faceMark.textContent = parts.mark;

      if (safeEmotion === "thinking") {
        // 保留原嘴型字符作为透明占位，确保左右眼间距与原笑脸一致；
        // SVG 波浪线绝对定位在嘴巴原位置，固定可视宽度，只让内部波形流动。
        dom.mouth.innerHTML = `
          <span class="pet-thinking-mouth-anchor">${FACE_PARTS.neutral.mouth}</span>
          <span class="pet-thinking-wave-mouth" aria-hidden="true">
            <svg viewBox="0 0 24 8" preserveAspectRatio="none">
              <path d="M0 4 Q3 1.9 6 4 T12 4 T18 4 T24 4"></path>
            </svg>
          </span>
        `;
      } else {
        dom.mouth.textContent = parts.mouth;
      }

      dom.face.className = `pet-face-core face-emotion-${safeEmotion}`;
    },

    setLookOffset(eyeX = 0, eyeY = 0, mouthX = 0, mouthY = 0) {
      dom.eyeLeft.style.transform = `translate(${eyeX}px, ${eyeY}px)`;
      dom.eyeRight.style.transform = `translate(${eyeX}px, ${eyeY}px)`;
      dom.mouth.style.transform = `translate(${mouthX}px, ${mouthY}px)`;
      dom.faceMark.style.transform = `translate(${mouthX}px, ${mouthY}px)`;
    },

    setLookCenter() {
      this.setLookOffset(0, 0, 0, 0);
    },

    lookAtVector(dx = 0, dy = 0) {
      const eyeX = Math.round(clamp(dx / CONFIG.face.vectorNormX, -1, 1) * CONFIG.face.eyeMoveRange);
      const eyeY = Math.round(clamp(dy / CONFIG.face.vectorNormY, -1, 1) * CONFIG.face.eyeMoveRange);
      const mouthX = Math.round(clamp(dx / CONFIG.face.vectorNormX, -1, 1) * CONFIG.face.mouthMoveRange);
      const mouthY = Math.round(clamp(dy / CONFIG.face.vectorNormY, -1, 1) * CONFIG.face.mouthMoveRange);
      this.setLookOffset(eyeX, eyeY, mouthX, mouthY);
    },

    lookAtPoint(x, y) {
      const center = Geometry.getAvatarCenter();
      this.lookAtVector(x - center.x, y - center.y);
    },

    lookAtElement(element) {
      if (!element || element.classList.contains("hidden")) return this.setLookCenter();
      const rect = element.getBoundingClientRect();
      this.lookAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    clearMotion() {
      dom.avatar.classList.remove(
        "motion-nod",
        "motion-shake",
        "motion-jump",
        "motion-think",
        "motion-think-soft",
        "motion-idea-bulb"
      );
    },

    playMotion(motion = "idle") {
      this.clearMotion();
      void dom.avatar.offsetWidth;
      const motionClass = {
        nod: "motion-nod",
        shake: "motion-shake",
        jump: "motion-jump",
        think: "motion-think",
        focus: "motion-think-soft"
      }[motion];
      if (motionClass) dom.avatar.classList.add(motionClass);
    },

    clearIdeaTimer() {
      if (state.ideaTimer) window.clearTimeout(state.ideaTimer);
      state.ideaTimer = null;
    },

    hideIdeaBulb({ resetLook = false, clearTimer = true } = {}) {
      if (clearTimer) this.clearIdeaTimer();
      dom.ideaBulb?.classList.add("hidden");
      dom.avatar.classList.remove("motion-idea-bulb");
      if (resetLook) this.setLookCenter();
    },

    startThinkingFace() {
      this.stopLookLoop(true);
      this.stopReplyPeekLoop(true);
      this.hideIdeaBulb({ clearTimer: true });
      this.clearMotion();
      this.setEmotion("thinking");
      // 思考态只动嘴部波浪；眼睛、嘴巴节点位置都回到原笑脸基准位。
      this.setLookCenter();
    },

    playIdeaBulb({ holdMs = CONFIG.face.ideaBulbHoldMs } = {}) {
      this.stopLookLoop(true);
      this.stopReplyPeekLoop(true);
      this.hideIdeaBulb({ clearTimer: true });
      this.clearMotion();
      this.setEmotion("idea");
      // 让脸看向左上方灯泡，嘴巴只轻微跟随，避免脸部整体漂移。
      this.setLookOffset(-4, -4, -1, -1);

      if (dom.ideaBulb) {
        dom.ideaBulb.classList.add("hidden");
        void dom.ideaBulb.offsetWidth;
        dom.ideaBulb.classList.remove("hidden");
      }

      void dom.avatar.offsetWidth;
      dom.avatar.classList.add("motion-idea-bulb");

      state.ideaTimer = window.setTimeout(() => {
        state.ideaTimer = null;
        dom.ideaBulb?.classList.add("hidden");
        dom.avatar.classList.remove("motion-idea-bulb");

        if (state.ui === UI.PANEL) {
          this.setEmotion("happy");
          this.setLookCenter();
          if (!state.running) this.startReplyPeekLoop();
        }
      }, holdMs);
    },

    stopLookLoop(reset = true) {
      if (state.lookTimer) window.clearTimeout(state.lookTimer);
      state.lookTimer = null;
      if (reset) this.setLookCenter();
    },

    stopReplyPeekLoop(reset = true) {
      if (state.replyPeekTimer) window.clearTimeout(state.replyPeekTimer);
      state.replyPeekTimer = null;
      if (reset) this.setLookCenter();
    },

    stopReadingLoop(reset = true) {
      if (state.readingTimer) window.clearTimeout(state.readingTimer);
      state.readingTimer = null;
      state.lastMouseAt = 0;
      if (reset) this.setLookCenter();
    },

    startMenuLookLoop() {
      this.stopLookLoop(false);
      this.hideIdeaBulb({ clearTimer: true });
      this.setEmotion("neutral");

      const tick = () => {
        if (state.ui !== UI.MENU || dom.menu.classList.contains("hidden")) return;
        const visibleTargets = dom.quickButtons.filter((btn) => !btn.classList.contains("hidden"));
        const target = visibleTargets[Math.floor(Math.random() * visibleTargets.length)];
        this.lookAtElement(target);
        state.lookTimer = window.setTimeout(tick, randomBetween(CONFIG.face.menuLookDelay.min, CONFIG.face.menuLookDelay.max));
      };

      tick();
    },

    startReplyPeekLoop() {
      this.stopReplyPeekLoop(false);
      state.replyPeekTimer = window.setTimeout(() => {
        const tick = () => {
          if (state.ui !== UI.PANEL || state.running) return;

          this.setEmotion("happy");
          this.lookAtElement(dom.reply || dom.panel);

          state.replyPeekTimer = window.setTimeout(() => {
            if (state.ui !== UI.PANEL || state.running) return;
            this.setEmotion("happy");
            this.setLookCenter();
            state.replyPeekTimer = window.setTimeout(tick, randomBetween(CONFIG.face.replyPeekGapMs.min, CONFIG.face.replyPeekGapMs.max));
          }, randomBetween(CONFIG.face.replyPeekHoldMs.min, CONFIG.face.replyPeekHoldMs.max));
        };

        tick();
      }, CONFIG.face.replyPeekStartMs);
    },

    startReadingLoop() {
      this.stopReadingLoop(false);

      const tick = () => {
        if (state.mode !== MODE.READING) return;

        const mouseRecentlyActive = Date.now() - state.lastMouseAt < CONFIG.reading.mouseHoldMs;
        if (!mouseRecentlyActive) {
          setActivity(ACTIVITY.OBSERVING);
          this.setEmotion(Math.random() < 0.25 ? "happy" : "neutral");

          const choices = [dom.panel, dom.menu, dom.reply, dom.help].filter((el) => el && !el.classList.contains("hidden"));
          const target = choices[Math.floor(Math.random() * choices.length)] || dom.avatar;
          if (target === dom.avatar) this.setLookCenter();
          else this.lookAtElement(target);
        }

        state.readingTimer = window.setTimeout(tick, randomBetween(CONFIG.reading.glanceDelay.min, CONFIG.reading.glanceDelay.max));
      };

      tick();
    },

    reactFace({ emotion = "neutral", motion = "idle" } = {}) {
      this.hideIdeaBulb({ clearTimer: true });
      this.stopLookLoop(true);
      this.stopReplyPeekLoop(true);
      this.setEmotion(emotion);
      this.playMotion(motion);
    },

    resetFace() {
      this.hideIdeaBulb({ clearTimer: true });
      this.stopLookLoop(true);
      this.stopReplyPeekLoop(true);
      this.clearMotion();
      this.setEmotion("neutral");
      this.setLookCenter();
    },

    handleReadingMouseMove(event) {
      if (state.mode !== MODE.READING || !dom.avatar) return;
      const center = Geometry.getAvatarCenter();
      const dx = event.clientX - center.x;
      const dy = event.clientY - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance > CONFIG.reading.mouseRange) return;

      state.lastMouseAt = Date.now();
      setActivity(ACTIVITY.TRACKING_MOUSE);
      this.setEmotion("happy");
      this.lookAtVector(dx, dy);
    }
  };
