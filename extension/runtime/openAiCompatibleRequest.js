const DEFAULT_TIMEOUT_MS = 15000;

function nowMs() {
  return Date.now();
}

function normalizeModel(model, provider) {
  const trimmed = typeof model === "string" ? model.trim() : "";
  return trimmed || provider?.defaultModel || "";
}

function normalizeAction(action) {
  return ["chat", "explain", "translate", "summarize"].includes(action) ? action : "chat";
}

function buildProviderUrl(provider) {
  const baseURL = String(provider?.baseURL || provider?.origin || "").replace(/\/+$/, "");
  const chatPath = String(provider?.chatPath || "").startsWith("/")
    ? provider.chatPath
    : `/${provider?.chatPath || ""}`;
  return `${baseURL}${chatPath}`;
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

function messageForProviderError(providerName, mode, errorCode) {
  const target = providerName || "Provider";
  const base = {
    AUTH_FAILED: `${target} authentication failed. Check the Runtime Key for this provider.`,
    RATE_LIMITED: `${target} rate limit reached. Try again later.`,
    PROVIDER_QUOTA_EXCEEDED: `${target} quota appears to be exhausted.`,
    PROVIDER_BAD_REQUEST: `${target} rejected the request.`,
    PROVIDER_UNAVAILABLE: `${target} service is currently unavailable. Try again later.`,
    NETWORK_ERROR: `${target} request failed due to a network error.`,
    TIMEOUT: `${target} request timed out.`,
    PROVIDER_ERROR: `${target} request failed.`
  };
  if (mode === "real-test" && errorCode === "PROVIDER_BAD_REQUEST") {
    return `${target} rejected the minimal test request.`;
  }
  return base[errorCode] || base.PROVIDER_ERROR;
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

function actionText(payload = {}) {
  const action = normalizeAction(payload.action);
  const userText = String(payload.userText || "").trim();
  const pageText = String(payload.pageText || "").trim();
  const selectionText = String(payload.selectionText || "").trim();
  if (action === "summarize") return selectionText || pageText || userText;
  if (action === "explain" || action === "translate") return selectionText || userText;
  return userText;
}

function actionFailure({ provider, action, errorCode, message, recoveryHint }) {
  return {
    ok: false,
    source: "Background Runtime",
    mode: "background-action",
    action: normalizeAction(action),
    providerId: provider?.id || "",
    providerName: provider?.displayName || "",
    errorCode,
    message,
    recoveryHint: recoveryHint || "Switch Runtime Mode to Local Backend to use the local backend.",
    requestEnabled: false
  };
}

function safeLoggerPayload(provider, mode, latencyMs, extra = {}) {
  return {
    providerId: provider?.id || "",
    mode,
    latencyMs,
    ...extra
  };
}

async function providerFetch({ provider, apiKey, body, timeoutMs, logger, logMode }) {
  const url = buildProviderUrl(provider);
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
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const latencyMs = Math.max(0, nowMs() - startedAt);
    if (!response.ok) {
      const errorCode = errorCodeForStatus(response.status);
      logger?.warn?.(`${provider.displayName} ${logMode} failed.`, safeLoggerPayload(provider, logMode, latencyMs, {
        errorCode,
        statusCategory: `${Math.floor(response.status / 100)}xx`
      }));
      return { ok: false, response, latencyMs, errorCode };
    }

    return { ok: true, response, latencyMs };
  } catch (error) {
    const latencyMs = Math.max(0, nowMs() - startedAt);
    const errorCode = isTimeoutError(error) ? "TIMEOUT" : "NETWORK_ERROR";
    logger?.warn?.(`${provider.displayName} ${logMode} error.`, safeLoggerPayload(provider, logMode, latencyMs, { errorCode }));
    return { ok: false, response: null, latencyMs, errorCode };
  } finally {
    clearTimeout(timer);
  }
}

async function readApiKey({ provider, secretStore, saveMode }) {
  return secretStore.getSecretForTrustedRuntimeOnly(saveMode, provider.id);
}

export async function testOpenAiCompatibleConnection({
  provider,
  model,
  secretStore,
  saveMode = null,
  logger = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const selectedModel = normalizeModel(model, provider);
  const apiKey = await readApiKey({ provider, secretStore, saveMode });

  if (!apiKey) {
    return {
      ok: false,
      mode: "real-test",
      providerId: provider?.id || "",
      providerName: provider?.displayName || "",
      errorCode: "MISSING_RUNTIME_KEY",
      message: `Runtime key is missing. Save a Runtime Key for ${provider?.displayName || "this provider"} before running a real test.`,
      requestEnabled: false
    };
  }

  const result = await providerFetch({
    provider,
    apiKey,
    timeoutMs,
    logger,
    logMode: "real-test",
    body: {
      model: selectedModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0,
      stream: false
    }
  });

  if (!result.ok) {
    return {
      ok: false,
      mode: "real-test",
      providerId: provider.id,
      providerName: provider.displayName,
      errorCode: result.errorCode,
      message: messageForProviderError(provider.displayName, "real-test", result.errorCode),
      requestEnabled: false
    };
  }

  logger?.debug?.(`${provider.displayName} real test passed.`, safeLoggerPayload(provider, "real-test", result.latencyMs));

  return {
    ok: true,
    mode: "real-test",
    providerId: provider.id,
    providerName: provider.displayName,
    model: selectedModel,
    permissionGranted: true,
    hasApiKey: true,
    latencyMs: result.latencyMs,
    requestEnabled: false,
    message: `${provider.displayName} real test passed. Background Runtime Beta can use this provider after setup.`
  };
}

export async function runOpenAiCompatibleBackgroundChat({
  provider,
  model,
  userText,
  secretStore,
  saveMode = null,
  logger = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const selectedModel = normalizeModel(model, provider);
  const apiKey = await readApiKey({ provider, secretStore, saveMode });

  if (!apiKey) {
    return {
      ok: false,
      mode: "background-chat",
      providerId: provider?.id || "",
      providerName: provider?.displayName || "",
      errorCode: "MISSING_RUNTIME_KEY",
      message: `Runtime key is missing. Save a Runtime Key for ${provider?.displayName || "this provider"} before running background chat.`,
      requestEnabled: false
    };
  }

  const result = await providerFetch({
    provider,
    apiKey,
    timeoutMs,
    logger,
    logMode: "background-chat",
    body: {
      model: selectedModel,
      messages: [
        { role: "system", content: systemPromptForAction("chat") },
        { role: "user", content: String(userText || "").trim() }
      ],
      max_tokens: 512,
      temperature: 0.3,
      stream: false
    }
  });

  if (!result.ok) {
    return {
      ok: false,
      mode: "background-chat",
      providerId: provider.id,
      providerName: provider.displayName,
      errorCode: result.errorCode,
      message: messageForProviderError(provider.displayName, "background-chat", result.errorCode),
      requestEnabled: false
    };
  }

  const data = await result.response.json().catch(() => null);
  const reply = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!reply) {
    return {
      ok: false,
      mode: "background-chat",
      providerId: provider.id,
      providerName: provider.displayName,
      errorCode: "PROVIDER_ERROR",
      message: "Background chat returned no usable reply.",
      requestEnabled: false
    };
  }

  logger?.debug?.(`${provider.displayName} background chat passed.`, safeLoggerPayload(provider, "background-chat", result.latencyMs));

  return {
    ok: true,
    mode: "background-chat",
    providerId: provider.id,
    providerName: provider.displayName,
    model: selectedModel,
    reply,
    emotion: "neutral",
    motion: "idle",
    bubble_type: "normal",
    confidence: 0.7,
    latencyMs: result.latencyMs,
    requestEnabled: false,
    message: "Background chat completed."
  };
}

export async function runOpenAiCompatibleBackgroundAction({
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
  const apiKey = await readApiKey({ provider, secretStore, saveMode });

  if (!apiKey) {
    return actionFailure({
      provider,
      action: selectedAction,
      errorCode: "MISSING_RUNTIME_KEY",
      message: `Runtime key is missing. Save a Runtime Key for ${provider?.displayName || "this provider"} before running background runtime actions.`
    });
  }

  const text = actionText({ action: selectedAction, userText, pageText, selectionText });
  if (!text) {
    return actionFailure({
      provider,
      action: selectedAction,
      errorCode: "INVALID_PAYLOAD",
      message: "Background Runtime action has no usable text."
    });
  }

  const result = await providerFetch({
    provider,
    apiKey,
    timeoutMs,
    logger,
    logMode: "background-action",
    body: {
      model: selectedModel,
      messages: [
        { role: "system", content: systemPromptForAction(selectedAction) },
        { role: "user", content: text }
      ],
      max_tokens: 512,
      temperature: 0.3,
      stream: false
    }
  });

  if (!result.ok) {
    return actionFailure({
      provider,
      action: selectedAction,
      errorCode: result.errorCode,
      message: messageForProviderError(provider.displayName, "background-action", result.errorCode)
    });
  }

  const data = await result.response.json().catch(() => null);
  const reply = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!reply) {
    return actionFailure({
      provider,
      action: selectedAction,
      errorCode: "PROVIDER_ERROR",
      message: "Background Runtime returned no usable reply."
    });
  }

  logger?.debug?.(`${provider.displayName} background action passed.`, safeLoggerPayload(provider, "background-action", result.latencyMs, {
    action: selectedAction
  }));

  return {
    ok: true,
    source: "Background Runtime",
    mode: "background-action",
    action: selectedAction,
    providerId: provider.id,
    providerName: provider.displayName,
    model: selectedModel,
    reply,
    emotion: "neutral",
    motion: "idle",
    bubble_type: "normal",
    confidence: 0.7,
    latencyMs: result.latencyMs,
    requestEnabled: false,
    message: "Background Runtime action completed."
  };
}

export function buildOpenAiCompatibleUrlForTest(provider) {
  return buildProviderUrl(provider);
}
