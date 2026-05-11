import "../shared/i18n.js";
import "../shared/prompt-item.js";
import { initQshotOverlay } from "./overlay/main.js";

if (window === window.top) {
  initQshotOverlay();
}
