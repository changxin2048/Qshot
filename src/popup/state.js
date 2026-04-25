import {
  SEARCH_GROUPS_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY,
  PROMPT_GROUPS_STORAGE_KEY,
  UI_PREFS_STORAGE_KEY,
  CUSTOM_SITES_STORAGE_KEY,
} from "../shared/storage-keys.js";

// Shared mutable state for the popup. Modules import the singleton and
// mutate fields directly instead of passing N arguments around.
export const state = {
  groups: [],
  promptGroups: [],
  allSites: [],
  historyEntries: [],
  uiPrefs: createNormalizedUiPrefs(),
  activePromptGroupId: null,
  isPromptPickerOpen: false,
  popupPreviewMgr: null,
  composerResizeObserver: null,
  // DOM refs — populated once in main.js after DOM ready.
  dom: {
    queryInput: null,
    composer: null,
    groupsContainer: null,
    historyList: null,
    historySection: null,
    openSettingsBtn: null,
    randomPromptBtn: null,
    promptEntryBtn: null,
    composerActionsRow: null,
    promptPicker: null,
  },
  // Callbacks registered by main.js so panels can trigger cross-cutting work
  // without creating circular imports.
  syncComposerLayout: () => {},
  updatePromptPickerLayoutState: () => {},
};

export function createNormalizedUiPrefs(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    showHistory: src.showHistory !== false,
    showRandomButton: src.showRandomButton !== false,
    showPromptButton: src.showPromptButton !== false,
    prewarmEnabled: src.prewarmEnabled !== false,
  };
}

export function normalizeSiteHomeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  let next = raw.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => (sep === "?" ? "?" : ""));
  next = next.replace(/\?&/, "?");
  next = next.replace(/[?&]$/, "");
  next = next.replace(/\{query\}/g, "");
  if (!/^https?:\/\//i.test(next)) return "";
  return next;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatHistoryDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const lang = window.__QSHOT_I18N__?.getUiLanguage?.() || navigator.language || "zh-CN";
  return date.toLocaleDateString(lang, { year: "numeric", month: "numeric", day: "numeric" });
}

export async function loadGroups() {
  const stored = await chrome.storage.local.get([SEARCH_GROUPS_STORAGE_KEY]);
  return Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY])
    ? stored[SEARCH_GROUPS_STORAGE_KEY]
    : [];
}

export async function loadPromptGroups() {
  const stored = await chrome.storage.local.get([PROMPT_GROUPS_STORAGE_KEY]);
  const source = Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY])
    ? stored[PROMPT_GROUPS_STORAGE_KEY]
    : [];
  return source.map((group, gi) => ({
    id: String(group.id || `prompt-group-${gi}`),
    name: String(group.name || "未命名分组"),
    prompts: Array.isArray(group.prompts)
      ? group.prompts.map((p, pi) => ({
          id: String(p.id || `prompt-${gi}-${pi}`),
          title: String(p.title || "未命名提示词"),
          content: String(p.content || ""),
        }))
      : [],
  }));
}

export async function loadHistory() {
  const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
  return Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY])
    ? stored[SEARCH_HISTORY_STORAGE_KEY].slice(0, 4)
    : [];
}

export async function loadUiPrefs() {
  const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
  return createNormalizedUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
}

export async function refreshAllSites() {
  try {
    const [builtinResp, stored] = await Promise.all([
      fetch(chrome.runtime.getURL("config/siteHandlers.json")),
      chrome.storage.local.get([CUSTOM_SITES_STORAGE_KEY]),
    ]);
    const payload = await builtinResp.json();
    const builtin = (payload.sites || []).filter((s) => s.enabled !== false);
    const custom = Array.isArray(stored[CUSTOM_SITES_STORAGE_KEY])
      ? stored[CUSTOM_SITES_STORAGE_KEY]
      : [];
    const knownIds = new Set(builtin.map((s) => s.id));
    const merged = [...builtin];
    custom.forEach((s) => {
      if (s && !knownIds.has(s.id)) {
        merged.push(s);
        knownIds.add(s.id);
      }
    });
    state.allSites = merged;
  } catch (_e) {
    state.allSites = [];
  }
}
