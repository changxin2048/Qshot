import {
  FRAME_TOGGLE_MESSAGE,
  MAIN_HOTKEY_ESC,
  MAIN_HOTKEY_FIRE,
} from "./overlay/constants.js";

(function initQshotOverlayFrameForwarder() {
  if (window === window.top) {
    return;
  }
  if (window.__QSHOT_OVERLAY_FRAME_FORWARDER__) {
    return;
  }
  window.__QSHOT_OVERLAY_FRAME_FORWARDER__ = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data) {
      return;
    }

    if (data.type === MAIN_HOTKEY_FIRE) {
      try {
        window.top.postMessage({ type: FRAME_TOGGLE_MESSAGE }, "*");
      } catch (_error) {
        /* ignored */
      }
      return;
    }

    if (data.type === MAIN_HOTKEY_ESC) {
      try {
        window.top.postMessage({ type: MAIN_HOTKEY_ESC }, "*");
      } catch (_error) {
        /* ignored */
      }
    }
  });
})();
