import { initQshotOverlay } from "./overlay/main.js";

if (!isGrokSubFrame()) {
  initQshotOverlay();
}

function isGrokSubFrame() {
  if (window === window.top) {
    return false;
  }

  try {
    const host = window.location.hostname.replace(/^www\./, "").toLowerCase();
    return host === "grok.com";
  } catch (_error) {
    return false;
  }
}
