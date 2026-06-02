// =========================
  // 15. Pomodoro Focus Ring
  // =========================
  const AFloditPomodoroController = (() => {
    const PHASE = Object.freeze({
      IDLE: "idle",
      CONFIGURING: "configuring",
      WORK_RUNNING: "work_running",
      WORK_DONE: "work_done",
      REST_RUNNING: "rest_running",
      REST_DONE: "rest_done",
      COMPLETED: "completed"
    });

    const DEFAULTS = Object.freeze({
      workMinutes: 25,
      restMinutes: 5,
      totalRounds: 4
    });

    const INPUT_LIMITS = Object.freeze({
      workMinutes: Object.freeze({ min: 1, max: 99, fallback: DEFAULTS.workMinutes }),
      restMinutes: Object.freeze({ min: 1, max: 99, fallback: DEFAULTS.restMinutes }),
      totalRounds: Object.freeze({ min: 1, max: 10, fallback: DEFAULTS.totalRounds })
    });

    const pomodoroState = {
      phase: PHASE.IDLE,
      startedAt: 0,
      durationMs: 0,
      workMinutes: DEFAULTS.workMinutes,
      restMinutes: DEFAULTS.restMinutes,
      totalRounds: DEFAULTS.totalRounds,
      currentRound: 1,
      timerId: null,
      bound: false
    };

    state.pomodoroState = pomodoroState;

    function storageKey() {
      return CONFIG.storage.pomodoroKey;
    }

    function isRunningPhase(phase = pomodoroState.phase) {
      return phase === PHASE.WORK_RUNNING || phase === PHASE.REST_RUNNING;
    }

    function clampInt(value, min, max, fallback) {
      const number = Math.round(Number(value));
      if (!Number.isFinite(number)) return fallback;
      return clamp(number, min, max);
    }

    function sanitizePomodoroNumberInput(raw = "") {
      const source = String(raw ?? "");
      let result = "";
      let hasDecimalPoint = false;

      for (const char of source) {
        if (char >= "0" && char <= "9") {
          result += char;
        } else if (char === "." && !hasDecimalPoint) {
          result += char;
          hasDecimalPoint = true;
        }

        if (result.length >= 6) break;
      }

      return result;
    }

    function normalizePomodoroNumber(raw, min, max, fallback) {
      const sanitized = sanitizePomodoroNumberInput(raw);
      if (!sanitized || sanitized === ".") return fallback;

      const parsed = Number.parseFloat(sanitized);
      if (!Number.isFinite(parsed)) return fallback;

      return clamp(Math.ceil(parsed), min, max);
    }

    function normalizeInputValue(input, limits) {
      const normalized = normalizePomodoroNumber(input.value, limits.min, limits.max, limits.fallback);
      input.value = String(normalized);
      return normalized;
    }

    function setInputValue(input, value, limits) {
      input.value = String(normalizePomodoroNumber(value, limits.min, limits.max, limits.fallback));
    }

    function readConfig() {
      return {
        workMinutes: normalizeInputValue(dom.pomodoroWork, INPUT_LIMITS.workMinutes),
        restMinutes: normalizeInputValue(dom.pomodoroRest, INPUT_LIMITS.restMinutes),
        totalRounds: normalizeInputValue(dom.pomodoroRounds, INPUT_LIMITS.totalRounds)
      };
    }

    function hydrateInputs() {
      setInputValue(dom.pomodoroWork, pomodoroState.workMinutes, INPUT_LIMITS.workMinutes);
      setInputValue(dom.pomodoroRest, pomodoroState.restMinutes, INPUT_LIMITS.restMinutes);
      setInputValue(dom.pomodoroRounds, pomodoroState.totalRounds, INPUT_LIMITS.totalRounds);
    }

    function hidePanels() {
      dom.pomodoroSettings?.classList.add("hidden");
      dom.pomodoroNotice?.classList.add("hidden");
    }

    function preparePanel() {
      FaceController.stopReplyPeekLoop(true);
      UIController.closeMenu(true);
      UIController.closeSettings();
      hidePanels();

      state.ui = UI.PANEL;
      state.action = ACTION.CHAT;
      dom.panel.classList.remove("hidden");
      dom.mode.textContent = "Pomodoro";
      dom.status.textContent = "本地番茄钟，不请求后端。";
      dom.reply.textContent = "设置后开始专注。";
      dom.reply.scrollTop = 0;
      dom.refresh.classList.add("hidden");
      dom.contextBlock.classList.add("hidden");
      dom.chatRow.classList.add("hidden");
      setBubbleType("info");
      setMeta("neutral", "idle");
      LayoutManager.updateFloatingLayout();
    }

    function clearTimer() {
      if (pomodoroState.timerId) {
        window.clearInterval(pomodoroState.timerId);
        pomodoroState.timerId = null;
      }
    }

    function clearStorage() {
      try {
        localStorage.removeItem(storageKey());
      } catch (error) {
        log("Failed to clear pomodoro state.", error);
      }
    }

    function saveRunningState() {
      if (!isRunningPhase()) return;
      try {
        localStorage.setItem(storageKey(), JSON.stringify({
          phase: pomodoroState.phase,
          startedAt: pomodoroState.startedAt,
          durationMs: pomodoroState.durationMs,
          workMinutes: pomodoroState.workMinutes,
          restMinutes: pomodoroState.restMinutes,
          totalRounds: pomodoroState.totalRounds,
          currentRound: pomodoroState.currentRound
        }));
      } catch (error) {
        log("Failed to save pomodoro state.", error);
      }
    }

    function setRing({ visible, degrees = 0, phase = pomodoroState.phase, done = false } = {}) {
      const safeDegrees = clamp(Number(degrees) || 0, 0, 360);
      dom.root.style.setProperty("--aflodit-pomodoro-progress", `${safeDegrees}deg`);
      dom.root.style.setProperty("--aflodit-pomodoro-alpha", visible ? "0.9" : "0");
      dom.root.classList.toggle("pet-pomodoro-active", !!visible);
      dom.root.classList.toggle("pet-pomodoro-rest", phase === PHASE.REST_RUNNING || phase === PHASE.REST_DONE);
      dom.root.classList.toggle("pet-pomodoro-done", !!done);
      dom.pomodoroRing.classList.toggle("hidden", !visible);
    }

    function elapsedMs() {
      return Math.max(0, Date.now() - Number(pomodoroState.startedAt || 0));
    }

    function runningProgress() {
      if (!pomodoroState.durationMs) return 0;
      return clamp(elapsedMs() / pomodoroState.durationMs, 0, 1);
    }

    function formatMinutes(minutes) {
      return `${minutes} 分钟`;
    }

    function formatRemaining() {
      const remaining = Math.max(0, pomodoroState.durationMs - elapsedMs());
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function updateRingForRunningPhase() {
      const progress = runningProgress();
      if (progress >= 1) {
        completeCurrentPhase();
        return;
      }

      const isRest = pomodoroState.phase === PHASE.REST_RUNNING;
      setRing({
        visible: true,
        degrees: progress * 360,
        phase: pomodoroState.phase
      });
    }

    function startTicking() {
      clearTimer();
      updateRingForRunningPhase();
      pomodoroState.timerId = window.setInterval(updateRingForRunningPhase, 250);
    }

    function startRunningPhase(phase, { currentRound = pomodoroState.currentRound, startedAt = Date.now() } = {}) {
      clearTimer();
      hidePanels();
      dom.panel.classList.add("hidden");
      state.ui = UI.IDLE;
      FaceController.resetFace();

      pomodoroState.phase = phase;
      pomodoroState.currentRound = currentRound;
      pomodoroState.startedAt = startedAt;
      pomodoroState.durationMs = (phase === PHASE.REST_RUNNING ? pomodoroState.restMinutes : pomodoroState.workMinutes) * 60 * 1000;
      saveRunningState();
      startTicking();
    }

    function showNotice({ phase, title, body, primaryText, showPrimary = true }) {
      preparePanel();
      dom.pomodoroNotice.classList.remove("hidden");
      dom.pomodoroNoticeTitle.textContent = title;
      dom.pomodoroNoticeBody.textContent = body;
      dom.pomodoroPrimary.textContent = primaryText || "";
      dom.pomodoroPrimary.classList.toggle("hidden", !showPrimary);
      dom.pomodoroEnd.textContent = phase === PHASE.COMPLETED ? "结束" : "结束番茄钟";
      LayoutManager.updateFloatingLayout();
    }

    function completeCurrentPhase() {
      clearTimer();
      clearStorage();

      if (pomodoroState.phase === PHASE.WORK_RUNNING) {
        pomodoroState.phase = PHASE.WORK_DONE;
        setRing({ visible: true, degrees: 360, phase: PHASE.WORK_DONE, done: true });
        showNotice({
          phase: PHASE.WORK_DONE,
          title: "工作结束",
          body: `该休息 ${formatMinutes(pomodoroState.restMinutes)} 了。`,
          primaryText: "开始休息"
        });
        return;
      }

      if (pomodoroState.phase === PHASE.REST_RUNNING) {
        setRing({ visible: false, degrees: 360, phase: PHASE.REST_DONE });
        if (pomodoroState.currentRound >= pomodoroState.totalRounds) {
          pomodoroState.phase = PHASE.COMPLETED;
          showNotice({
            phase: PHASE.COMPLETED,
            title: "番茄钟完成",
            body: `已完成 ${pomodoroState.currentRound} / ${pomodoroState.totalRounds} 轮。`,
            showPrimary: false
          });
          return;
        }

        pomodoroState.phase = PHASE.REST_DONE;
        showNotice({
          phase: PHASE.REST_DONE,
          title: "休息结束",
          body: "准备进入下一轮？",
          primaryText: "开始下一轮"
        });
      }
    }

    function openSettings() {
      preparePanel();
      pomodoroState.phase = PHASE.CONFIGURING;
      hydrateInputs();
      dom.pomodoroSettings.classList.remove("hidden");
      dom.pomodoroMessage.textContent = "本地计时，不请求后端。";
      LayoutManager.updateFloatingLayout();
    }

    function startFromSettings() {
      Object.assign(pomodoroState, readConfig(), {
        phase: PHASE.WORK_RUNNING,
        currentRound: 1
      });
      dom.pomodoroMessage.textContent = "";
      startRunningPhase(PHASE.WORK_RUNNING, { currentRound: 1 });
    }

    function startRest() {
      startRunningPhase(PHASE.REST_RUNNING);
    }

    function startNextRound() {
      startRunningPhase(PHASE.WORK_RUNNING, {
        currentRound: clamp(pomodoroState.currentRound + 1, 1, pomodoroState.totalRounds)
      });
    }

    function stop({ closePanel = true } = {}) {
      clearTimer();
      clearStorage();
      Object.assign(pomodoroState, {
        phase: PHASE.IDLE,
        startedAt: 0,
        durationMs: 0,
        currentRound: 1
      });
      setRing({ visible: false, degrees: 0 });
      hidePanels();
      if (closePanel) {
        dom.panel.classList.add("hidden");
        state.ui = UI.IDLE;
      }
      FaceController.resetFace();
      LayoutManager.updateFloatingLayout();
    }

    function showStatus() {
      preparePanel();
      dom.pomodoroNotice.classList.remove("hidden");
      dom.pomodoroNoticeTitle.textContent = "番茄钟状态";

      if (isRunningPhase()) {
        const phaseText = pomodoroState.phase === PHASE.WORK_RUNNING ? "工作中" : "休息中";
        dom.pomodoroNoticeBody.textContent = `${phaseText}，第 ${pomodoroState.currentRound} / ${pomodoroState.totalRounds} 轮，剩余 ${formatRemaining()}。`;
      } else if (pomodoroState.phase === PHASE.WORK_DONE) {
        dom.pomodoroNoticeBody.textContent = `工作结束，第 ${pomodoroState.currentRound} / ${pomodoroState.totalRounds} 轮。`;
      } else if (pomodoroState.phase === PHASE.REST_DONE) {
        dom.pomodoroNoticeBody.textContent = `休息结束，第 ${pomodoroState.currentRound} / ${pomodoroState.totalRounds} 轮。`;
      } else {
        dom.pomodoroNoticeBody.textContent = "当前没有运行中的番茄钟。";
      }

      dom.pomodoroPrimary.classList.add("hidden");
      dom.pomodoroEnd.textContent = "关闭";
      LayoutManager.updateFloatingLayout();
    }

    function restore() {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
      } catch (error) {
        clearStorage();
      }
      if (!saved || !isRunningPhase(saved.phase)) {
        setRing({ visible: false, degrees: 0 });
        return;
      }

      const totalRounds = clampInt(saved.totalRounds, INPUT_LIMITS.totalRounds.min, INPUT_LIMITS.totalRounds.max, DEFAULTS.totalRounds);
      Object.assign(pomodoroState, {
        phase: saved.phase,
        startedAt: Number(saved.startedAt) || Date.now(),
        durationMs: Number(saved.durationMs) || 0,
        workMinutes: clampInt(saved.workMinutes, INPUT_LIMITS.workMinutes.min, INPUT_LIMITS.workMinutes.max, DEFAULTS.workMinutes),
        restMinutes: clampInt(saved.restMinutes, INPUT_LIMITS.restMinutes.min, INPUT_LIMITS.restMinutes.max, DEFAULTS.restMinutes),
        totalRounds,
        currentRound: clampInt(saved.currentRound, INPUT_LIMITS.totalRounds.min, totalRounds, 1)
      });

      if (!pomodoroState.durationMs || elapsedMs() >= pomodoroState.durationMs) {
        completeCurrentPhase();
        return;
      }

      startTicking();
    }

    function handlePrimary() {
      if (pomodoroState.phase === PHASE.WORK_DONE) return startRest();
      if (pomodoroState.phase === PHASE.REST_DONE) return startNextRound();
    }

    function bindInputGuard(input, limits) {
      on(input, "input", () => {
        const sanitized = sanitizePomodoroNumberInput(input.value);
        if (input.value !== sanitized) input.value = sanitized;
      });
      on(input, "blur", () => {
        normalizeInputValue(input, limits);
      });
      on(input, "keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        normalizeInputValue(input, limits);
      });
    }

    function bindEvents() {
      if (pomodoroState.bound) return;
      pomodoroState.bound = true;

      bindInputGuard(dom.pomodoroWork, INPUT_LIMITS.workMinutes);
      bindInputGuard(dom.pomodoroRest, INPUT_LIMITS.restMinutes);
      bindInputGuard(dom.pomodoroRounds, INPUT_LIMITS.totalRounds);

      on(dom.pomodoroStart, "click", (event) => {
        event.stopPropagation();
        startFromSettings();
      });

      on(dom.pomodoroCancel, "click", (event) => {
        event.stopPropagation();
        hidePanels();
        dom.panel.classList.add("hidden");
        state.ui = UI.IDLE;
        if (pomodoroState.phase === PHASE.CONFIGURING) pomodoroState.phase = PHASE.IDLE;
        LayoutManager.updateFloatingLayout();
      });

      on(dom.pomodoroPrimary, "click", (event) => {
        event.stopPropagation();
        handlePrimary();
      });

      on(dom.pomodoroEnd, "click", (event) => {
        event.stopPropagation();
        if (dom.pomodoroPrimary.classList.contains("hidden") && pomodoroState.phase !== PHASE.COMPLETED) {
          hidePanels();
          dom.panel.classList.add("hidden");
          state.ui = UI.IDLE;
          LayoutManager.updateFloatingLayout();
          return;
        }
        stop();
      });
    }

    function destroy() {
      clearTimer();
      if (isRunningPhase()) saveRunningState();
    }

    return {
      PHASE,
      bindEvents,
      destroy,
      hidePanels,
      openSettings,
      restore,
      showStatus,
      stop
    };
  })();

  globalThis.AFloditPomodoroController = AFloditPomodoroController;
