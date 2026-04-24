import { UI_PREFS_STORAGE_KEY, CUSTOM_SITES_STORAGE_KEY, SEARCH_GROUPS_STORAGE_KEY, SEARCH_HISTORY_STORAGE_KEY, PROMPT_GROUPS_STORAGE_KEY } from "../../shared/storage-keys.js";
import {
  state,
  t,
  refreshGroups,
  refreshAllSites,
  refreshHistory,
  refreshPromptGroups,
  refreshUiPrefs,
} from "./state.js";
import {
  OVERLAY_STYLES,
  LOGO_URL,
  DICE_SVG,
  SPARKLE_SVG,
  FRAME_TOGGLE_MESSAGE,
  MAIN_HOTKEY_FIRE,
  MAIN_HOTKEY_ESC,
  MAIN_HOTKEY_CONFIG,
} from "./constants.js";
import { renderGroupsIfOpen, hideGroupTooltip, runDefaultSearch } from "./groups-panel.js";
import { renderHistoryIfOpen } from "./history-panel.js";
import { renderPromptPickerIfOpen, fillRandomQuestion } from "./prompts-panel.js";

export function initQshotOverlay() {
  if (window.__QSHOT_OVERLAY_INSTALLED__) return;
  window.__QSHOT_OVERLAY_INSTALLED__ = true;

  state.closeOverlay = closeOverlay;

  const isTopFrame = (function detectTop() {
    try {
      return window.top === window;
    } catch (_e) {
      // Cross-origin access to window.top throws; treat as non-top.
      return false;
    }
  })();

  // Preload config and sync hotkey settings to the MAIN-world listener.
  refreshUiPrefs().then(syncShortcutToMainWorld).catch(() => {});

  // Listen for: (1) MAIN-world hotkey fires, (2) cross-frame forwards so the
  // overlay UI always renders only in the top frame.
  window.addEventListener("message", (event) => {
    if (event.source !== window && !isTopFrame) return;
    const data = event.data;
    if (!data) return;

    if (data.type === MAIN_HOTKEY_FIRE) {
      if (isTopFrame) {
        toggleOverlay();
      } else {
        // Review note (CWS/Edge Add-ons):
        // - Forwards an "open/close overlay" signal between frames in the same tab.
        // - Does NOT include user input. targetOrigin uses "*" because cross-origin
        //   frames may exist; the browser enforces same-origin constraints.
        try {
          window.top.postMessage({ type: FRAME_TOGGLE_MESSAGE }, "*");
        } catch (_err) {
          /* ignored */
        }
      }
      return;
    }

    if (data.type === MAIN_HOTKEY_ESC) {
      if (isTopFrame && state.isOpen) {
        closeOverlay();
      } else if (!isTopFrame) {
        try {
          window.top.postMessage({ type: MAIN_HOTKEY_ESC }, "*");
        } catch (_e) {}
      }
      return;
    }

    if (data.type === FRAME_TOGGLE_MESSAGE && isTopFrame) {
      toggleOverlay();
    }
  });

  // Isolated-world keydown is the fallback for when MAIN-world fails, and
  // also handles Esc to close the overlay (MAIN-world doesn't handle Esc).
  window.addEventListener("keydown", handleGlobalKeydown, true);
  document.addEventListener("keydown", handleGlobalKeydown, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "TOGGLE_SEARCH_OVERLAY") return false;
    if (!isTopFrame) return false;
    toggleOverlay().finally(() => sendResponse && sendResponse({ ok: true }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[UI_PREFS_STORAGE_KEY]) {
      refreshUiPrefs().then(() => {
        syncShortcutToMainWorld();
        if (state.isOpen) {
          applyUiPrefs();
          renderHistoryIfOpen();
          renderPromptPickerIfOpen();
        }
      });
    }
    if (!state.isOpen) return;
    if (changes[CUSTOM_SITES_STORAGE_KEY]) {
      refreshAllSites().then(renderGroupsIfOpen);
    }
    if (changes[SEARCH_GROUPS_STORAGE_KEY]) {
      refreshGroups().then(renderGroupsIfOpen);
    }
    if (changes[SEARCH_HISTORY_STORAGE_KEY]) {
      refreshHistory().then(renderHistoryIfOpen);
    }
    if (changes[PROMPT_GROUPS_STORAGE_KEY]) {
      refreshPromptGroups().then(renderPromptPickerIfOpen);
    }
  });

  function handleGlobalKeydown(event) {
    // Isolated-world keydown only does one job: close the overlay on Esc when
    // it's open. Hotkey "toggle" lives in MAIN-world (overlay_main.js) to
    // avoid double-firing when both worlds match the same key.
    if (!isTopFrame || !state.isOpen) return;
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeOverlay();
  }

  async function toggleOverlay() {
    if (state.isOpen) {
      closeOverlay();
    } else {
      await openOverlay();
    }
  }

  async function openOverlay() {
    if (state.isOpen || !isTopFrame) return;
    await Promise.all([
      refreshGroups(),
      refreshAllSites(),
      refreshHistory(),
      refreshPromptGroups(),
      refreshUiPrefs(),
    ]);
    if (!state.activePromptGroupId) {
      state.activePromptGroupId = state.promptGroups[0]?.id || null;
    }
    mountOverlay();
    state.isOpen = true;
    // Review note (CWS/Edge Add-ons):
    // - "Prewarm" is performance-only (reduces first-load latency for heavy AI sites).
    // - Requests go directly to user-selected third-party sites; the extension does
    //   NOT send user data to any developer-controlled server and does NOT read
    //   response bodies (see background.js).
    try {
      chrome.runtime.sendMessage({ type: "WARMUP_AI_SITES" }).catch(() => {});
    } catch (_err) {
      /* ignored */
    }
  }

  function syncShortcutToMainWorld() {
    try {
      window.postMessage(
        {
          type: MAIN_HOTKEY_CONFIG,
          enabled: state.uiPrefs.overlayShortcutEnabled !== false,
          shortcut: state.uiPrefs.overlayShortcut,
        },
        // Review note: only syncs hotkey config between isolated world and MAIN world; no user input.
        window.location.origin
      );
    } catch (_err) {
      /* ignored */
    }
  }
}

function closeOverlay() {
  if (!state.isOpen) return;
  state.isPromptPickerOpen = false;
  hideGroupTooltip();
  if (state.overlayPreviewMgr) {
    state.overlayPreviewMgr.destroy();
    state.overlayPreviewMgr = null;
  }
  if (state.hostEl && state.hostEl.parentNode) {
    state.hostEl.parentNode.removeChild(state.hostEl);
  }
  state.hostEl = null;
  state.shadowRoot = null;
  state.isOpen = false;
}

function mountOverlay() {
  state.hostEl = document.createElement("div");
  state.hostEl.id = "qshot-search-overlay-host";
  state.hostEl.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483646;";
  state.shadowRoot = state.hostEl.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = OVERLAY_STYLES;
  state.shadowRoot.appendChild(styleEl);

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closeOverlay();
  });

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.addEventListener("mousedown", (event) => {
    // Clicking anywhere on the panel that isn't the prompt area collapses the picker.
    const target = event.target;
    if (target instanceof Element) {
      if (!target.closest(".prompt-picker") && !target.closest(".icon-btn.sparkle")) {
        if (state.isPromptPickerOpen) {
          state.isPromptPickerOpen = false;
          renderPromptPickerIfOpen();
        }
      }
    }
  });

  const header = document.createElement("header");
  header.className = "header";
  const logo = document.createElement("img");
  logo.className = "title-logo";
  logo.alt = "Qshot";
  logo.src = LOGO_URL;
  logo.addEventListener("error", () => {
    logo.style.display = "none";
  });
  header.appendChild(logo);
  panel.appendChild(header);

  const composer = document.createElement("section");
  composer.className = "composer";

  const queryInput = document.createElement("textarea");
  queryInput.className = "query-input";
  queryInput.rows = 1;
  queryInput.placeholder = t("popup_queryPlaceholder", null, "输入你要搜索的");
  composer.appendChild(queryInput);

  const actionsRow = document.createElement("div");
  actionsRow.className = "actions-row";

  const diceBtn = document.createElement("button");
  diceBtn.type = "button";
  diceBtn.className = "icon-btn dice";
  diceBtn.setAttribute("aria-label", t("popup_randomQuestion", null, "随机问题"));
  diceBtn.innerHTML = DICE_SVG;
  diceBtn.addEventListener("click", () => {
    state.isPromptPickerOpen = false;
    renderPromptPickerIfOpen();
    fillRandomQuestion();
  });

  const sparkleBtn = document.createElement("button");
  sparkleBtn.type = "button";
  sparkleBtn.className = "icon-btn sparkle";
  sparkleBtn.setAttribute("aria-label", t("popup_promptEntry", null, "提示词"));
  sparkleBtn.innerHTML = SPARKLE_SVG;
  sparkleBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    state.isPromptPickerOpen = !state.isPromptPickerOpen;
    renderPromptPickerIfOpen();
  });

  actionsRow.appendChild(diceBtn);
  actionsRow.appendChild(sparkleBtn);
  composer.appendChild(actionsRow);

  const promptPicker = document.createElement("div");
  promptPicker.className = "prompt-picker";
  promptPicker.hidden = true;
  composer.appendChild(promptPicker);

  panel.appendChild(composer);

  const settingsCornerBtn = document.createElement("button");
  settingsCornerBtn.type = "button";
  settingsCornerBtn.className = "settings-corner-btn";
  settingsCornerBtn.setAttribute("aria-label", t("popup_settings", null, "设置"));
  settingsCornerBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
  settingsCornerBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE" }).catch(() => {});
    closeOverlay();
  });
  panel.appendChild(settingsCornerBtn);

  const groupsContainer = document.createElement("div");
  groupsContainer.className = "groups";
  panel.appendChild(groupsContainer);

  const groupTooltip = document.createElement("div");
  groupTooltip.className = "group-tooltip";
  groupTooltip.addEventListener("mouseenter", () => {
    if (state.groupTooltipHideTimer) {
      clearTimeout(state.groupTooltipHideTimer);
      state.groupTooltipHideTimer = null;
    }
  });
  groupTooltip.addEventListener("mouseleave", () => {
    // Import here to avoid a cycle; groups-panel exports hideGroupTooltip but
    // we can call through the schedule path via DOM event forwarding — simply
    // clear inline state so the existing scheduling logic picks up.
    if (state.groupTooltipHideTimer) clearTimeout(state.groupTooltipHideTimer);
    state.groupTooltipHideTimer = setTimeout(() => {
      const tooltip = state.shadowRoot?.querySelector(".group-tooltip");
      if (tooltip instanceof HTMLElement) tooltip.style.display = "none";
    }, 180);
  });
  panel.appendChild(groupTooltip);

  const historySection = document.createElement("section");
  historySection.className = "history-section";
  historySection.setAttribute("aria-labelledby", "qshotOverlayHistoryTitle");

  const historyDivider = document.createElement("div");
  historyDivider.className = "section-divider";
  const historyTitle = document.createElement("span");
  historyTitle.id = "qshotOverlayHistoryTitle";
  historyTitle.className = "section-divider-label";
  historyTitle.textContent = t("popup_historySearch", null, "历史搜索");
  historyDivider.appendChild(historyTitle);

  const historyList = document.createElement("div");
  historyList.className = "history-list";

  historySection.appendChild(historyDivider);
  historySection.appendChild(historyList);
  panel.appendChild(historySection);

  const panelWrap = document.createElement("div");
  panelWrap.className = "panel-wrap";
  panelWrap.appendChild(panel);

  const hintRow = document.createElement("div");
  hintRow.className = "hint-row";
  hintRow.innerHTML = `<span><span class="kbd">Enter</span> ${t("overlay_hintSearch", null, "搜索")} · <span class="kbd">Esc</span> ${t("common_close", null, "关闭")}</span>`;
  panelWrap.appendChild(hintRow);

  backdrop.appendChild(panelWrap);
  state.shadowRoot.appendChild(backdrop);

  document.documentElement.appendChild(state.hostEl);

  queryInput.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (state.isPromptPickerOpen) {
        state.isPromptPickerOpen = false;
        renderPromptPickerIfOpen();
        return;
      }
      closeOverlay();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await runDefaultSearch();
    }
  });

  queryInput.addEventListener("input", syncComposerLayout);
  queryInput.addEventListener("mouseup", syncComposerLayout);
  queryInput.addEventListener("keyup", syncComposerLayout);

  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
    }
  });

  applyUiPrefs();
  renderGroupsIfOpen();
  renderHistoryIfOpen();
  renderPromptPickerIfOpen();
  syncComposerLayout();

  setTimeout(() => queryInput.focus(), 0);
}

function applyUiPrefs() {
  if (!state.shadowRoot) return;
  const diceBtn = state.shadowRoot.querySelector(".icon-btn.dice");
  const sparkleBtn = state.shadowRoot.querySelector(".icon-btn.sparkle");
  const actionsRow = state.shadowRoot.querySelector(".actions-row");
  const historySection = state.shadowRoot.querySelector(".history-section");
  if (diceBtn) {
    diceBtn.style.display = state.uiPrefs.showRandomButton === false ? "none" : "inline-flex";
  }
  if (sparkleBtn) {
    sparkleBtn.style.display = state.uiPrefs.showPromptButton === false ? "none" : "inline-flex";
  }
  if (actionsRow) {
    const hasVisible =
      state.uiPrefs.showRandomButton !== false || state.uiPrefs.showPromptButton !== false;
    actionsRow.style.display = hasVisible ? "flex" : "none";
  }
  if (historySection instanceof HTMLElement) {
    historySection.hidden = state.uiPrefs.showHistory === false;
    historySection.style.display = state.uiPrefs.showHistory === false ? "none" : "block";
  }
}

function syncComposerLayout() {
  if (!state.shadowRoot) return;
  const composer = state.shadowRoot.querySelector(".composer");
  const queryInput = state.shadowRoot.querySelector(".query-input");
  if (!composer || !queryInput) return;

  composer.classList.remove("is-expanded");
  queryInput.style.height = "0px";
  const scrollH = queryInput.scrollHeight;
  const lineHeight = parseFloat(getComputedStyle(queryInput).lineHeight || "20");
  queryInput.style.height = "";
  composer.classList.toggle("is-expanded", scrollH > lineHeight * 1.7);
}
