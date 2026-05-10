import {
  SEARCH_GROUPS_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY,
  PROMPT_GROUPS_STORAGE_KEY,
  UI_PREFS_STORAGE_KEY,
  CUSTOM_SITES_STORAGE_KEY,
} from "../../shared/storage-keys.js";
import { normalizeShortcut } from "../../shared/shortcut.js";

// Shared mutable state for the overlay. Each panel module imports this
// singleton and reads/mutates the same fields instead of juggling callbacks.
export const state = {
  hostEl: null,
  shadowRoot: null,
  isOpen: false,
  groups: [],
  allSites: [],
  customSites: [],
  historyEntries: [],
  promptGroups: [],
  uiPrefs: normalizeUiPrefs(),
  activePromptGroupId: null,
  isPromptPickerOpen: false,
  isGroupPickMode: false,
  isSitePickMode: false,
  overlayPreviewMgr: null,
  groupTooltipTimer: null,
  groupTooltipHideTimer: null,
  // main.js registers closeOverlay here so panels can trigger it without
  // creating an import cycle.
  closeOverlay: () => {},
};

export function t(key, substitutions, fallback = "") {
  try {
    const msg = chrome?.i18n?.getMessage?.(key, substitutions) || window.__QSHOT_I18N__?.t?.(key, substitutions);
    return msg || fallback || "";
  } catch (_e) {
    return fallback || "";
  }
}

export function normalizeUiPrefs(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    showHistory: src.showHistory !== false,
    showRandomButton: src.showRandomButton !== false,
    showPromptButton: src.showPromptButton !== false,
    prewarmEnabled: src.prewarmEnabled !== false,
    overlayShortcutEnabled: src.overlayShortcutEnabled !== false,
    overlayShortcut: normalizeShortcut(src.overlayShortcut),
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

export function formatHistoryDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    const lang = window.__QSHOT_I18N__?.getUiLanguage?.() || navigator.language || "zh-CN";
    return date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  }
  const lang = window.__QSHOT_I18N__?.getUiLanguage?.() || navigator.language || "zh-CN";
  return date.toLocaleDateString(lang, { month: "numeric", day: "numeric" });
}

export async function refreshGroups() {
  try {
    const stored = await chrome.storage.local.get([SEARCH_GROUPS_STORAGE_KEY]);
    state.groups = Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY])
      ? stored[SEARCH_GROUPS_STORAGE_KEY]
      : [];
  } catch (_err) {
    state.groups = [];
  }
}

export async function refreshAllSites() {
  try {
    const [builtinResp, stored] = await Promise.all([
      fetch(chrome.runtime.getURL("config/siteHandlers.json")),
      chrome.storage.local.get([CUSTOM_SITES_STORAGE_KEY]),
    ]);
    const payload = await builtinResp.json();
    const builtin = (payload.sites || []).filter((site) => site.enabled !== false);
    const custom = Array.isArray(stored[CUSTOM_SITES_STORAGE_KEY])
      ? stored[CUSTOM_SITES_STORAGE_KEY]
      : [];
    const knownIds = new Set(builtin.map((site) => site.id));
    const merged = [...builtin];
    const validCustom = [];
    custom.forEach((site) => {
      if (site && !knownIds.has(site.id)) {
        merged.push(site);
        knownIds.add(site.id);
        validCustom.push(site);
      }
    });
    state.allSites = merged;
    state.customSites = validCustom;
  } catch (_err) {
    state.allSites = [];
    state.customSites = [];
  }
}

export async function refreshHistory() {
  try {
    const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
    state.historyEntries = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY])
      ? stored[SEARCH_HISTORY_STORAGE_KEY].slice(0, 4)
      : [];
  } catch (_err) {
    state.historyEntries = [];
  }
}

export async function refreshPromptGroups() {
  try {
    const stored = await chrome.storage.local.get([PROMPT_GROUPS_STORAGE_KEY]);
    const source = Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY])
      ? stored[PROMPT_GROUPS_STORAGE_KEY]
      : [];
    state.promptGroups = source.map((group, gi) => ({
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
    if (!state.promptGroups.some((g) => g.id === state.activePromptGroupId)) {
      state.activePromptGroupId = state.promptGroups[0]?.id || null;
    }
  } catch (_err) {
    state.promptGroups = [];
  }
}

export async function refreshUiPrefs() {
  try {
    const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
    state.uiPrefs = normalizeUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
  } catch (_err) {
    state.uiPrefs = normalizeUiPrefs();
  }
}
