import {
  SEARCH_GROUPS_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY,
  PROMPT_GROUPS_STORAGE_KEY,
  UI_PREFS_STORAGE_KEY,
  CUSTOM_SITES_STORAGE_KEY,
  RANDOM_QUESTIONS_STORAGE_KEY,
} from "../shared/storage-keys.js";
import {
  state,
  loadGroups,
  loadPromptGroups,
  loadHistory,
  loadUiPrefs,
  refreshAllSites,
} from "./state.js";
import {
  renderGroups,
  renderHistory,
  renderPromptPicker,
  closePromptPicker,
  togglePromptPicker,
  fillRandomQuestion,
  runDefaultSearch,
  invalidateRandomQuestionsCache,
} from "./sections.js";

const { applyDomI18n } = window.__QSHOT_I18N__ || {};

document.addEventListener("DOMContentLoaded", start);
chrome.storage.onChanged.addListener(handleStorageChange);

async function start() {
  const dom = state.dom;
  dom.queryInput = document.getElementById("popupQueryInput");
  dom.composer = document.querySelector(".search-composer");
  dom.groupsContainer = document.getElementById("popupGroups");
  dom.historyList = document.getElementById("popupHistoryList");
  dom.historySection = document.querySelector(".popup-history-section");
  dom.openSettingsBtn = document.getElementById("openSettingsBtn");
  dom.randomPromptBtn = document.getElementById("randomPromptBtn");
  dom.promptEntryBtn = document.getElementById("promptEntryBtn");
  dom.composerActionsRow = document.querySelector(".composer-actions-row");
  dom.promptPicker = document.getElementById("promptPicker");

  // Register cross-module callbacks on the shared state so sections/modal
  // can trigger composer layout sync without importing main.js (keeps the
  // module graph acyclic).
  state.syncComposerLayout = syncComposerLayout;
  state.updatePromptPickerLayoutState = updatePromptPickerLayoutState;

  applyDomI18n?.(document);
  await chrome.runtime.sendMessage({ type: "ENSURE_INITIAL_STATE_DEFAULTS" }).catch(() => null);
  await refreshAllSites();
  await Promise.all([
    refreshGroups(),
    refreshPromptGroups(),
    refreshUiPrefs(),
    refreshHistory(),
  ]);

  bindEvents();
  syncComposerLayout();
  dom.queryInput?.focus();
  triggerPrewarm();
}

function bindEvents() {
  const { openSettingsBtn, randomPromptBtn, promptEntryBtn, queryInput } = state.dom;

  openSettingsBtn?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE" });
    window.close();
  });

  randomPromptBtn?.addEventListener("click", () => {
    closePromptPicker();
    fillRandomQuestion();
  });

  promptEntryBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePromptPicker();
  });

  queryInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await runDefaultSearch();
  });

  // Prompt picker: click-outside + Esc to close.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !state.isPromptPickerOpen) return;
    if (target.closest("#promptEntryBtn") || target.closest("#promptPicker")) return;
    closePromptPicker();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.isPromptPickerOpen) {
      closePromptPicker();
      queryInput?.focus();
    }
  });

  if (queryInput) {
    queryInput.addEventListener("input", syncComposerLayout);
    queryInput.addEventListener("mouseup", syncComposerLayout);
    queryInput.addEventListener("keyup", syncComposerLayout);
    if (typeof ResizeObserver !== "undefined") {
      state.composerResizeObserver = new ResizeObserver(() => syncComposerLayout());
      state.composerResizeObserver.observe(queryInput);
    }
  }
}

function triggerPrewarm() {
  if (state.uiPrefs.prewarmEnabled === false) return;
  // Review note (CWS/Edge Add-ons):
  // - "Prewarm" is performance-only (reduces first-load latency for heavy AI sites).
  // - Requests go directly to user-selected third-party sites; the extension does
  //   NOT send user data to any developer-controlled server and does NOT read
  //   response bodies (mode:"no-cors" in background.js).
  try {
    chrome.runtime.sendMessage({ type: "WARMUP_AI_SITES" }).catch(() => {});
  } catch (_err) {
    // popup may already be closing
  }
}

async function handleStorageChange(changes, areaName) {
  if (areaName !== "local") return;
  if (changes[CUSTOM_SITES_STORAGE_KEY]) {
    await refreshAllSites();
    await refreshGroups();
  }
  if (changes[SEARCH_GROUPS_STORAGE_KEY]) await refreshGroups();
  if (changes[PROMPT_GROUPS_STORAGE_KEY]) await refreshPromptGroups();
  if (changes[UI_PREFS_STORAGE_KEY]) await refreshUiPrefs();
  if (changes[SEARCH_HISTORY_STORAGE_KEY]) await refreshHistory();
  if (changes[RANDOM_QUESTIONS_STORAGE_KEY]) invalidateRandomQuestionsCache();
}

async function refreshGroups() {
  state.groups = await loadGroups();
  renderGroups();
}

async function refreshPromptGroups() {
  state.promptGroups = await loadPromptGroups();
  if (!state.promptGroups.some((g) => g.id === state.activePromptGroupId)) {
    state.activePromptGroupId = state.promptGroups[0]?.id || null;
  }
  renderPromptPicker();
}

async function refreshUiPrefs() {
  state.uiPrefs = await loadUiPrefs();
  applyUiPrefs();
}

async function refreshHistory() {
  const history = await loadHistory();
  state.historyEntries = history;
  renderHistory(history);
}

function applyUiPrefs() {
  const { historySection, randomPromptBtn, promptEntryBtn, composerActionsRow } = state.dom;

  if (historySection) {
    historySection.hidden = state.uiPrefs.showHistory === false;
    historySection.classList.toggle("is-hidden", state.uiPrefs.showHistory === false);
    historySection.style.display = state.uiPrefs.showHistory === false ? "none" : "block";
  }
  if (randomPromptBtn) {
    randomPromptBtn.hidden = state.uiPrefs.showRandomButton === false;
    randomPromptBtn.style.display =
      state.uiPrefs.showRandomButton === false ? "none" : "inline-flex";
  }
  if (promptEntryBtn) {
    promptEntryBtn.hidden = state.uiPrefs.showPromptButton === false;
    promptEntryBtn.style.display =
      state.uiPrefs.showPromptButton === false ? "none" : "inline-flex";
    if (state.uiPrefs.showPromptButton === false) closePromptPicker();
  }
  if (composerActionsRow) {
    const hasVisible =
      state.uiPrefs.showRandomButton !== false || state.uiPrefs.showPromptButton !== false;
    composerActionsRow.hidden = !hasVisible;
    composerActionsRow.style.display = hasVisible ? "flex" : "none";
  }
  updatePromptPickerLayoutState();
}

function syncComposerLayout(options = {}) {
  const { composer, queryInput } = state.dom;
  if (!composer || !queryInput) return;

  // Clear layout classes + inline height so scrollHeight reflects real content.
  composer.classList.remove("is-mid-expanded", "is-expanded");
  queryInput.style.height = "auto";
  queryInput.style.minHeight = "0px";

  const scrollH = queryInput.scrollHeight;
  const lineHeight = parseFloat(window.getComputedStyle(queryInput).lineHeight || "21.75");
  const maxHeight = parseFloat(window.getComputedStyle(queryInput).maxHeight || "220");

  queryInput.style.minHeight = "";
  const shouldExpand = scrollH > lineHeight * 2.7;
  const shouldMidExpand = !shouldExpand && scrollH > lineHeight * 1.7;
  composer.classList.toggle("is-mid-expanded", shouldMidExpand);
  composer.classList.toggle("is-expanded", shouldExpand);
  queryInput.style.height = shouldExpand ? `${Math.min(scrollH, maxHeight)}px` : "";
  queryInput.style.overflowY = shouldExpand && scrollH > maxHeight ? "auto" : "";
  if (options.scrollToTop) {
    queryInput.scrollTop = 0;
  }
}

function updatePromptPickerLayoutState() {
  const { composer } = state.dom;
  if (!composer) return;
  const shouldExpandDownward = state.isPromptPickerOpen && state.uiPrefs.showHistory === false;
  composer.classList.toggle("is-picker-inline-open", shouldExpandDownward);
}
