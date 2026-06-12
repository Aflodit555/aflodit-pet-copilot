const DEEPSEEK_PROVIDER_ID = "deepseek";
const DEEPSEEK_REQUIRED_HOST_PERMISSION = "https://api.deepseek.com/*";
const DEFAULT_TIMEOUT_MS = 15000;

function nowMs() {
  return Date.now();
}

function buildResponse(base = {}) {
  return {
    mode: "real-test",
    providerId: DEEPSEEK_PROVIDER_ID,
    providerName: "DeepSeek",
    requestEnabled: false,
    ...base
  };
}

function normalizeModel(model, provider) {
  const trimmed = typeof model === "string" ? model.trim() : "";
  return trimmed || provider.defaultModel;
}

function buildDeepSeekUrl(provider) {
  return `${provider.origin}${provider.chatPath}`;
}

function messageForError(errorCode) {
  const messages = {
    AUTH_FAILED: "DeepSeek authentication failed. Check your Runtime Key.",
    RATE_LIMITED: "DeepSeek rate limit reached. Try again later.",
    PROVIDER_QUOTA_EXCEEDED: "DeepSeek quota appears to be exhausted.",
    PROVIDER_BAD_REQUEST: "DeepSeek rejected the minimal test request.",
    PROVIDER_UNAVAILABLE: "DeepSeek service is currently unavailable. Try again later.",
    NETWORK_ERROR: "DeepSeek real test failed due to a network error.",
    TIMEOUT: "DeepSeek real test timed out.",
    PROVIDER_ERROR: "DeepSeek real test failed."
  };
  return messages[errorCode] || messages.PROVIDER_ERROR;
}

function messageForChatError(errorCode) {
  const messages = {
    AUTH_FAILED: "DeepSeek authentication failed. Check your Runtime Key.",
    RATE_LIMITED: "DeepSeek rate limit reached. Try again later.",
    PROVIDER_QUOTA_EXCEEDED: "DeepSeek quota appears to be exhausted.",
    PROVIDER_BAD_REQUEST: "DeepSeek rejected the background chat request.",
    PROVIDER_UNAVAILABLE: "DeepSeek service is currently unavailable. Try again later.",
    NETWORK_ERROR: "Background chat failed due to a network error.",
    TIMEOUT: "Background chat timed out.",
    PROVIDER_ERROR: "Background chat failed."
  };
  return messages[errorCode] || messages.PROVIDER_ERROR;
}

function messageForActionError(errorCode) {
  const base = messageForChatError(errorCode);
  return base.replace(/^Background chat/i, "Background Runtime");
}

function normalizeAction(action) {
  return ["chat", "explain", "translate", "summarize"].includes(action) ? action : "chat";
}

function actionText(payload = {}) {
  const action = normalizeAction(payload.action);
  const userText = String(payload.userText || "").trim();
  const pageText = String(payload.pageText || "").trim();
  const selectionText = String(payload.selectionText || "").trim();
  if (action === "summarize") return selectionText || pageText || userText;
  if (action === "explain" || action === "translate") return selectionText || userText;
  return userText;
}

function systemPromptForAction(action) {
  const prompts = {
    chat: "You are AFlodit Pet Copilot. Answer the user's chat message directly and concisely.",
    explain: "Explain the user's text clearly and briefly in Simplified Chinese. Focus on meaning and key points.",
    translate: "Translate the user's text into natural Simplified Chinese. Return only the translation or polished Chinese text.",
    summarize: "Summarize the user's text briefly in Simplified Chinese. Prioritize topic, key points, and conclusion."
  };
  return prompts[normalizeAction(action)] || prompts.chat;
}

function actionFailure({ action, errorCode, message, providerName = "DeepSeek" }) {
  return {
    ok: false,
    source: "Background Runtime",
    mode: "background-action",
    action: normalizeAction(action),
    providerId: DEEPSEEK_PROVIDER_ID,
    providerName,
    errorCode,
    message,
    recoveryHint: "Switch Runtime Mode to Local Backend to use the local backend.",
    requestEnabled: false
  };
}

function errorCodeForStatus(status) {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400) return "PROVIDER_BAD_REQUEST";
  if (status === 402) return "PROVIDER_QUOTA_EXCEEDED";
  if ([500, 502, 503, 504].includes(status)) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_ERROR";
}

function isTimeoutError(error) {
  return error?.name === "AbortError" || error?.code === "TIMEOUT";
}

export function requiredDeepSeekHostPermission() {
  return DEEPSEEK_REQUIRED_HOST_PERMISSION;
}

export async function testDeepSeekRealConnection({
  provider,
  model,
  secretStore,
  saveMode = null,
  logger = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const selectedModel = normalizeModel(model, provider);
  const apiKey = await secretStore.getSecretForTrustedRuntimeOnly(saveMode);

  if (!apiKey) {
    return buildResponse({
      ok: false,
      errorCode: "MISSING_RUNTIME_KEY",
      message: "Runtime key is missing. Save a Runtime Key before running a real test."
    });
  }

  const url = buildDeepSeekUrl(provider);
  const startedAt = nowMs();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "user",
            content: "ping"
          }
        ],
        max_tokens: 1,
        temperature: 0,
        stream: false
      }),
      signal: controller.signal
    });

    const latencyMs = Math.max(0, nowMs() - startedAt);
    if (!response.ok) {
      const errorCode = errorCodeForStatus(response.status);
      logger?.warn?.("DeepSeek real test failed.", {
        providerId: DEEPSEEK_PROVIDER_ID,
        mode: "real-test",
        latencyMs,
        errorCode,
        statusCategory: `${Math.floor(response.status / 100)}xx`
      });
      return buildResponse({
        ok: false,
        errorCode,
        message: messageForError(errorCode)
      });
    }

    logger?.debug?.("DeepSeek real test passed.", {
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: "real-test",
      latencyMs
    });

    return buildResponse({
      ok: true,
      model: selectedModel,
      permissionGranted: true,
      hasApiKey: true,
      latencyMs,
      message: "DeepSeek real test passed. Main AI actions still use the local backend."
    });
  } catch (error) {
    const latencyMs = Math.max(0, nowMs() - startedAt);
    const errorCode = isTimeoutError(error) ? "TIMEOUT" : "NETWORK_ERROR";
    logger?.warn?.("DeepSeek real test error.", {
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: "real-test",
      latencyMs,
      errorCode
    });
    return buildResponse({
      ok: false,
      errorCode,
      message: messageForError(errorCode)
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function runDeepSeekBackgroundChat({
  provider,
  model,
  userText,
  secretStore,
  saveMode = null,
  logger = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const selectedModel = normalizeModel(model, provider);
  const apiKey = await secretStore.getSecretForTrustedRuntimeOnly(saveMode);

  if (!apiKey) {
    return {
      ok: false,
      mode: "background-chat",
      providerId: DEEPSEEK_PROVIDER_ID,
      providerName: "DeepSeek",
      errorCode: "MISSING_RUNTIME_KEY",
      message: "Runtime key is missing. Save a Runtime Key before running background chat.",
      requestEnabled: false
    };
  }

  const url = buildDeepSeekUrl(provider);
  const startedAt = nowMs();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: "You are AFlodit Pet Copilot. Answer the user's chat message directly and concisely."
          },
          {
            role: "user",
            content: String(userText || "").trim()
          }
        ],
        max_tokens: 512,
        temperature: 0.3,
        stream: false
      }),
      signal: controller.signal
    });

    const latencyMs = Math.max(0, nowMs() - startedAt);
    if (!response.ok) {
      const errorCode = errorCodeForStatus(response.status);
      logger?.warn?.("DeepSeek background chat failed.", {
        providerId: DEEPSEEK_PROVIDER_ID,
        mode: "background-chat",
        latencyMs,
        errorCode,
        statusCategory: `${Math.floor(response.status / 100)}xx`
      });
      return {
        ok: false,
        mode: "background-chat",
        providerId: DEEPSEEK_PROVIDER_ID,
        providerName: "DeepSeek",
        errorCode,
        message: messageForChatError(errorCode),
        requestEnabled: false
      };
    }

    const data = await response.json().catch(() => null);
    const reply = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      return {
        ok: false,
        mode: "background-chat",
        providerId: DEEPSEEK_PROVIDER_ID,
        providerName: "DeepSeek",
        errorCode: "PROVIDER_ERROR",
        message: "Background chat returned no usable reply.",
        requestEnabled: false
      };
    }

    logger?.debug?.("DeepSeek background chat passed.", {
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: "background-chat",
      latencyMs
    });

    return {
      ok: true,
      mode: "background-chat",
      providerId: DEEPSEEK_PROVIDER_ID,
      providerName: "DeepSeek",
      model: selectedModel,
      reply,
      emotion: "neutral",
      motion: "idle",
      bubble_type: "normal",
      confidence: 0.7,
      latencyMs,
      requestEnabled: false,
      message: "Background chat completed. Main AI actions still use the local backend."
    };
  } catch (error) {
    const latencyMs = Math.max(0, nowMs() - startedAt);
    const errorCode = isTimeoutError(error) ? "TIMEOUT" : "NETWORK_ERROR";
    logger?.warn?.("DeepSeek background chat error.", {
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: "background-chat",
      latencyMs,
      errorCode
    });
    return {
      ok: false,
      mode: "background-chat",
      providerId: DEEPSEEK_PROVIDER_ID,
      providerName: "DeepSeek",
      errorCode,
      message: messageForChatError(errorCode),
      requestEnabled: false
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDeepSeekBackgroundAction({
  provider,
  model,
  action,
  userText,
  pageText = "",
  selectionText = "",
  secretStore,
  saveMode = null,
  logger = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const selectedAction = normalizeAction(action);
  const selectedModel = normalizeModel(model, provider);
  const apiKey = await secretStore.getSecretForTrustedRuntimeOnly(saveMode);

  if (!apiKey) {
    return actionFailure({
      action: selectedAction,
      errorCode: "MISSING_RUNTIME_KEY",
      message: "Runtime key is missing. Save a Runtime Key before running background runtime actions."
    });
  }

  const text = actionText({ action: selectedAction, userText, pageText, selectionText });
  if (!text) {
    return actionFailure({
      action: selectedAction,
      errorCode: "INVALID_PAYLOAD",
      message: "Background Runtime action has no usable text."
    });
  }

  const url = buildDeepSeekUrl(provider);
  const startedAt = nowMs();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: systemPromptForAction(selectedAction)
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 512,
        temperature: 0.3,
        stream: false
      }),
      signal: controller.signal
    });

    const latencyMs = Math.max(0, nowMs() - startedAt);
    if (!response.ok) {
      const errorCode = errorCodeForStatus(response.status);
      logger?.warn?.("DeepSeek background action failed.", {
        providerId: DEEPSEEK_PROVIDER_ID,
        mode: "background-action",
        action: selectedAction,
        latencyMs,
        errorCode,
        statusCategory: `${Math.floor(response.status / 100)}xx`
      });
      return actionFailure({
        action: selectedAction,
        errorCode,
        message: messageForActionError(errorCode)
      });
    }

    const data = await response.json().catch(() => null);
    const reply = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      return actionFailure({
        action: selectedAction,
        errorCode: "PROVIDER_ERROR",
        message: "Background Runtime returned no usable reply."
      });
    }

    logger?.debug?.("DeepSeek background action passed.", {
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: "background-action",
      action: selectedAction,
      latencyMs
    });

    return {
      ok: true,
      source: "Background Runtime",
      mode: "background-action",
      action: selectedAction,
      providerId: DEEPSEEK_PROVIDER_ID,
      providerName: "DeepSeek",
      model: selectedModel,
      reply,
      emotion: "neutral",
      motion: "idle",
      bubble_type: "normal",
      confidence: 0.7,
      latencyMs,
      requestEnabled: false,
      message: "Background Runtime action completed."
    };
  } catch (error) {
    const latencyMs = Math.max(0, nowMs() - startedAt);
    const errorCode = isTimeoutError(error) ? "TIMEOUT" : "NETWORK_ERROR";
    logger?.warn?.("DeepSeek background action error.", {
      providerId: DEEPSEEK_PROVIDER_ID,
      mode: "background-action",
      action: selectedAction,
      latencyMs,
      errorCode
    });
    return actionFailure({
      action: selectedAction,
      errorCode,
      message: messageForActionError(errorCode)
    });
  } finally {
    clearTimeout(timer);
  }
}
