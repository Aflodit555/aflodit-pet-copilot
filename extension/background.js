import { createBackgroundRuntime } from "./runtime/backgroundRuntime.js";

const runtime = createBackgroundRuntime({
  chromeApi: chrome,
  version: chrome.runtime.getManifest().version
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  runtime.handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: {
          code: "BACKGROUND_RUNTIME_ERROR",
          message: error?.message || "Background runtime failed."
        }
      });
    });

  return true;
});
