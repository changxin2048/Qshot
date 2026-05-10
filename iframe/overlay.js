(() => {
  // src/shared/storage-keys.js
  var SEARCH_GROUPS_STORAGE_KEY = "searchGroups";
  var PROMPT_GROUPS_STORAGE_KEY = "promptGroups";
  var UI_PREFS_STORAGE_KEY = "uiPrefs";
  var CUSTOM_SITES_STORAGE_KEY = "customSites";
  var RANDOM_QUESTIONS_STORAGE_KEY = "randomQuestionsText";
  var SEARCH_HISTORY_STORAGE_KEY = "searchHistory";
  var DEFAULT_PROMPT_GROUP_ID = "prompt-group-default";

  // src/shared/shortcut.js
  var DEFAULT_SHORTCUT = Object.freeze({
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: "Q"
  });
  function normalizeKey(key) {
    if (!key) return "";
    if (key.length === 1) return key.toUpperCase();
    return key;
  }
  function normalizeShortcut(input) {
    if (!input || typeof input !== "object") return { ...DEFAULT_SHORTCUT };
    const key = typeof input.key === "string" && input.key.length > 0 ? input.key : DEFAULT_SHORTCUT.key;
    return {
      ctrlKey: !!input.ctrlKey,
      shiftKey: !!input.shiftKey,
      altKey: !!input.altKey,
      metaKey: !!input.metaKey,
      key: normalizeKey(key)
    };
  }

  // src/iframe/overlay/state.js
  var state = {
    hostEl: null,
    shadowRoot: null,
    isOpen: false,
    groups: [],
    allSites: [],
    historyEntries: [],
    promptGroups: [],
    uiPrefs: normalizeUiPrefs(),
    activePromptGroupId: null,
    isPromptPickerOpen: false,
    overlayPreviewMgr: null,
    groupTooltipTimer: null,
    groupTooltipHideTimer: null,
    // main.js registers closeOverlay here so panels can trigger it without
    // creating an import cycle.
    closeOverlay: () => {
    }
  };
  function t(key, substitutions, fallback = "") {
    try {
      const msg = chrome?.i18n?.getMessage?.(key, substitutions) || window.__QSHOT_I18N__?.t?.(key, substitutions);
      return msg || fallback || "";
    } catch (_e) {
      return fallback || "";
    }
  }
  function normalizeUiPrefs(input) {
    const src = input && typeof input === "object" ? input : {};
    return {
      showHistory: src.showHistory !== false,
      showRandomButton: src.showRandomButton !== false,
      showPromptButton: src.showPromptButton !== false,
      prewarmEnabled: src.prewarmEnabled !== false,
      overlayShortcutEnabled: src.overlayShortcutEnabled !== false,
      overlayShortcut: normalizeShortcut(src.overlayShortcut)
    };
  }
  function normalizeSiteHomeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    let next = raw.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => sep === "?" ? "?" : "");
    next = next.replace(/\?&/, "?");
    next = next.replace(/[?&]$/, "");
    next = next.replace(/\{query\}/g, "");
    if (!/^https?:\/\//i.test(next)) return "";
    return next;
  }
  function formatHistoryDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = /* @__PURE__ */ new Date();
    const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    if (sameDay) {
      const lang2 = window.__QSHOT_I18N__?.getUiLanguage?.() || navigator.language || "zh-CN";
      return date.toLocaleTimeString(lang2, { hour: "2-digit", minute: "2-digit" });
    }
    const lang = window.__QSHOT_I18N__?.getUiLanguage?.() || navigator.language || "zh-CN";
    return date.toLocaleDateString(lang, { month: "numeric", day: "numeric" });
  }
  async function refreshGroups() {
    try {
      const stored = await chrome.storage.local.get([SEARCH_GROUPS_STORAGE_KEY]);
      state.groups = Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) ? stored[SEARCH_GROUPS_STORAGE_KEY] : [];
    } catch (_err) {
      state.groups = [];
    }
  }
  async function refreshAllSites() {
    try {
      const [builtinResp, stored] = await Promise.all([
        fetch(chrome.runtime.getURL("config/siteHandlers.json")),
        chrome.storage.local.get([CUSTOM_SITES_STORAGE_KEY])
      ]);
      const payload = await builtinResp.json();
      const builtin = (payload.sites || []).filter((site) => site.enabled !== false);
      const custom = Array.isArray(stored[CUSTOM_SITES_STORAGE_KEY]) ? stored[CUSTOM_SITES_STORAGE_KEY] : [];
      const knownIds = new Set(builtin.map((site) => site.id));
      const merged = [...builtin];
      custom.forEach((site) => {
        if (site && !knownIds.has(site.id)) {
          merged.push(site);
          knownIds.add(site.id);
        }
      });
      state.allSites = merged;
    } catch (_err) {
      state.allSites = [];
    }
  }
  async function refreshHistory() {
    try {
      const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
      state.historyEntries = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY].slice(0, 4) : [];
    } catch (_err) {
      state.historyEntries = [];
    }
  }
  async function refreshPromptGroups() {
    try {
      const stored = await chrome.storage.local.get([PROMPT_GROUPS_STORAGE_KEY]);
      const source = Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY]) ? stored[PROMPT_GROUPS_STORAGE_KEY] : [];
      state.promptGroups = source.map((group, gi) => ({
        id: String(group.id || `prompt-group-${gi}`),
        name: String(group.name || "未命名分组"),
        prompts: Array.isArray(group.prompts) ? group.prompts.map((p, pi) => ({
          id: String(p.id || `prompt-${gi}-${pi}`),
          title: String(p.title || "未命名提示词"),
          content: String(p.content || "")
        })) : []
      }));
      if (!state.promptGroups.some((g) => g.id === state.activePromptGroupId)) {
        state.activePromptGroupId = state.promptGroups[0]?.id || null;
      }
    } catch (_err) {
      state.promptGroups = [];
    }
  }
  async function refreshUiPrefs() {
    try {
      const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
      state.uiPrefs = normalizeUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
    } catch (_err) {
      state.uiPrefs = normalizeUiPrefs();
    }
  }

  // src/iframe/overlay/styles.js
  var BASE = `
  :host {
    all: initial;
    --qshot-panel-scale: 1.167;
    --qshot-panel-offset-y: -80px;
  }
  * { box-sizing: border-box; font-family: "Microsoft YaHei UI", "PingFang SC", -apple-system, sans-serif; }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: rgba(0, 0, 0, 0.38);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    overflow-y: auto;
    animation: qshotFadeIn 140ms ease-out;
  }
  .panel {
    width: 420px;
    max-width: calc(100vw - 32px);
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: #111;
  }
  @keyframes qshotFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes qshotPopIn {
    from {
      opacity: 0;
      transform: translateY(calc(var(--qshot-panel-offset-y) - 8px)) scale(calc(var(--qshot-panel-scale) - 0.02));
    }
    to   {
      opacity: 1;
      transform: translateY(var(--qshot-panel-offset-y)) scale(var(--qshot-panel-scale));
    }
  }
  .header {
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
  }
  .title-logo {
    height: 30px;
    width: auto;
    display: block;
  }
  .composer {
    position: relative;
    width: 100%;
    min-height: 56px;
    padding: 10px 14px;
    border: 1px solid rgba(0, 0, 0, 0.22);
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 5px 12px rgba(0, 0, 0, 0.07);
    display: flex;
    align-items: center;
    gap: 10px;
    transition: min-height 180ms ease, padding 180ms ease;
  }
  .composer.is-mid-expanded,
  .composer.is-expanded {
    padding: 12px 14px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .composer.is-mid-expanded {
    min-height: 82px;
  }
  .composer.is-expanded {
    min-height: 118px;
  }
  .query-input {
    width: 100%;
    min-width: 0;
    min-height: 20px;
    height: 20px;
    max-height: 220px;
    resize: none;
    overflow-y: hidden;
    overflow-x: hidden;
    border: none;
    outline: none;
    background: transparent;
    padding: 0 6px 0 0;
    font-size: 14px;
    line-height: 1.4;
    color: #111;
    flex: 1;
  }
  .composer.is-mid-expanded .query-input {
    min-height: 40px;
    height: auto;
    overflow-y: hidden;
    padding: 2px 4px 0 0;
  }
  .composer.is-expanded .query-input {
    min-height: 76px;
    height: auto;
    overflow-y: auto;
    padding: 2px 4px 0 0;
  }
  .query-input::placeholder { color: #9a9a9a; }
  .query-input::-webkit-scrollbar { width: 7px; height: 7px; }
  .query-input::-webkit-scrollbar-thumb { background: #9c9c9c; border-radius: 999px; }
  .actions-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .composer.is-mid-expanded .actions-row,
  .composer.is-expanded .actions-row { margin-top: 8px; }
  .icon-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: #111;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: none;
    transition: transform 180ms ease, color 180ms ease;
  }
  .icon-btn:hover { transform: translateY(-1px); }
  .icon-btn.dice:hover { transform: translateY(-1px) rotate(-14deg) scale(1.08); }
  .icon-btn svg { width: 22px; height: 22px; fill: currentColor; }
  .icon-btn.sparkle svg { width: 20px; height: 20px; }
  .groups {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .groups:empty { display: none; }
  .group-btn {
    min-width: 84px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid rgba(0, 0, 0, 0.62);
    border-radius: 999px;
    background: #fff;
    color: #111;
    font-size: 14px;
    line-height: 1.2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease;
  }
  .group-btn:hover {
    background: #111;
    color: #fff;
    border-color: #111;
    transform: translateY(-1px);
  }
  .group-tooltip {
    position: absolute;
    z-index: 30;
    display: none;
    max-width: calc(100% - 8px);
    padding: 8px 10px;
    border-radius: 10px;
    background: #ffffff;
    color: #111111;
    border: 1px solid rgba(0, 0, 0, 0.1);
    font-size: 12px;
    line-height: 1.5;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.16);
    pointer-events: auto;
  }
  .group-tooltip-list {
    display: grid;
    grid-template-columns: repeat(5, max-content);
    justify-content: start;
    gap: 6px;
  }
  .group-tooltip-item {
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 999px;
    background: #ffffff;
    color: #111111;
    font: inherit;
    line-height: 1.2;
    padding: 6px 10px;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }
  .group-tooltip-item:hover {
    background: #111111;
    border-color: #111111;
    color: #ffffff;
    transform: translateY(-1px);
  }
  .history-section { padding: 0; }
  .history-section[hidden] { display: none !important; }
  .section-divider {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: 10px;
  }
  .section-divider::before,
  .section-divider::after {
    content: "";
    height: 1px;
    background: rgba(0, 0, 0, 0.24);
  }
  .section-divider-label {
    font-size: 13px;
    color: #313131;
  }
  .history-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .history-empty,
  .history-item {
    width: 100%;
    border-radius: 12px;
  }
  .history-empty {
    padding: 12px 10px;
    text-align: center;
    color: #888888;
    font-size: 12px;
  }
  .history-item {
    position: relative;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: #ffffff;
    padding: 9px 12px;
    padding-right: 24px;
    cursor: pointer;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.03);
  }
  .history-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .history-query {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #111111;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .history-meta {
    flex: none;
    font-size: 10px;
    line-height: 1.5;
    color: #8d8d8d;
    text-align: right;
    white-space: nowrap;
  }
  .history-delete-btn {
    position: absolute;
    top: 6px;
    right: 8px;
    border: none;
    background: transparent;
    padding: 0;
    width: 14px;
    height: 14px;
    font-size: 14px;
    line-height: 1;
    color: #a3a3a3;
    cursor: pointer;
    opacity: 0;
    transform: translateY(-1px);
    transition: opacity 0.15s ease, color 0.15s ease;
  }
  .history-item:hover .history-delete-btn,
  .history-item:focus-within .history-delete-btn {
    opacity: 1;
  }
  .history-delete-btn:hover { color: #6b6b6b; }
`;
  var PICKER = `
  .prompt-picker {
    position: absolute;
    top: calc(100% + 8px);
    left: -1px;
    right: -1px;
    min-height: 228px;
    max-height: 320px;
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    z-index: 6;
  }
  .prompt-picker[hidden] { display: none; }
  .prompt-groups-col {
    padding: 10px;
    border-right: 1px solid rgba(0, 0, 0, 0.08);
    background: #fbfbfb;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 0;
  }
  .prompt-group-item {
    width: 100%;
    min-height: 32px;
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #111;
    text-align: left;
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
    flex-shrink: 0;
  }
  .prompt-group-item.is-active,
  .prompt-group-item:hover {
    background: #111;
    color: #fff;
  }
  .prompt-list-col {
    padding: 6px 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .prompt-item {
    min-height: 36px;
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: #111;
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.07);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .prompt-item:last-child { border-bottom: none; }
  .prompt-item:hover { background: #f6f6f6; }
  .prompt-item-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 0;
  }
  .prompt-item-icons {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .prompt-item:hover .prompt-item-icons { opacity: 1; }
  .prompt-icon-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #999;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: color 120ms ease, background 120ms ease;
  }
  .prompt-icon-btn:hover { background: #e8e8e8; color: #333; }
  .prompt-empty {
    padding: 14px 12px;
    font-size: 12px;
    color: #888;
  }
  .prompt-picker-footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding: 6px 0;
    border-top: 1px solid rgba(0, 0, 0, 0.07);
    background: #fbfbfb;
  }
  .prompt-picker-footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    background: transparent;
    font-size: 11px;
    color: #aaa;
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 4px;
    transition: color 140ms ease, background 140ms ease;
  }
  .prompt-picker-footer-btn:hover { color: #555; background: #f0f0f0; }
  ${window.PromptItemUI?.PREVIEW_CSS ?? ""}
  .panel-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    animation: qshotPopIn 180ms cubic-bezier(.2,.9,.3,1.1) forwards;
    transform: translateY(var(--qshot-panel-offset-y)) scale(var(--qshot-panel-scale));
  }
  .hint-row {
    display: flex;
    justify-content: center;
    color: rgba(255, 255, 255, 0.78);
    font-size: 12px;
    user-select: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .kbd {
    display: inline-block;
    padding: 1px 6px;
    margin: 0 3px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.18);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }
  .panel { position: relative; }
  .settings-corner-btn {
    position: absolute;
    bottom: 5px;
    right: 5px;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #bbb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease, transform 150ms ease;
  }
  .settings-corner-btn:hover {
    color: #555;
    background: rgba(0, 0, 0, 0.06);
    transform: rotate(30deg);
  }
  .settings-corner-btn svg {
    width: 13px;
    height: 13px;
    display: block;
    flex-shrink: 0;
  }
`;
  var OVERLAY_STYLES = BASE + PICKER;

  // src/iframe/overlay/constants.js
  var FRAME_TOGGLE_MESSAGE = "__QSHOT_FRAME_TOGGLE__";
  var MAIN_HOTKEY_FIRE = "__QSHOT_HOTKEY_FIRE__";
  var MAIN_HOTKEY_ESC = "__QSHOT_HOTKEY_ESC__";
  var MAIN_HOTKEY_CONFIG = "__QSHOT_HOTKEY_CONFIG__";
  var RANDOM_QUESTIONS_FILES = {
    zh: "config/random-questions/zh-CN.txt",
    en: "config/random-questions/en.txt"
  };
  var LOGO_URL = chrome.runtime.getURL("popup/logo.svg");
  var DICE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M817.493333 310.997333L533.333333 146.944a42.666667 42.666667 0 0 0-42.666666 0L206.506667 310.997333a42.666667 42.666667 0 0 0-21.333334 36.949334v328.106666a42.666667 42.666667 0 0 0 21.333334 36.992l284.16 164.053334a42.666667 42.666667 0 0 0 42.666666 0l284.16-164.053334a42.666667 42.666667 0 0 0 21.333334-36.992v-328.106666a42.666667 42.666667 0 0 0-21.333334-36.949334zM554.666667 109.994667l284.16 164.053333a85.333333 85.333333 0 0 1 42.666666 73.898667v328.106666a85.333333 85.333333 0 0 1-42.666666 73.898667L554.666667 914.090667a85.333333 85.333333 0 0 1-85.333334 0l-284.16-164.053334a85.333333 85.333333 0 0 1-42.666666-73.898666V347.904a85.333333 85.333333 0 0 1 42.666666-73.898667L469.333333 109.994667a85.333333 85.333333 0 0 1 85.333334 0z"/><path d="M490.666667 524.501333L160.213333 338.602667l20.906667-37.205334L512 487.552l330.88-186.154667 20.906667 37.205334-330.453334 185.898666V896h-42.666666v-371.498667z"/><path d="M469.333333 298.666667a42.666667 42.666667 0 1 0 85.333334 0 42.666667 42.666667 0 0 0-85.333334 0zM347.861333 633.941333a32.725333 32.725333 0 1 1-32.725333-56.661333 32.725333 32.725333 0 0 1 32.725333 56.661333zM286.72 535.296a32.682667 32.682667 0 1 1-32.682667-56.533333 32.682667 32.682667 0 0 1 32.682667 56.533333zM414.72 727.296a32.682667 32.682667 0 1 1-32.682667-56.533333 32.682667 32.682667 0 0 1 32.682667 56.533333zM712.32 558.890667a32.725333 32.725333 0 1 0 32.682667-56.661334 32.725333 32.725333 0 0 0-32.682667 56.661334zM625.621333 709.034667a32.682667 32.682667 0 1 0 32.682667-56.618667 32.682667 32.682667 0 0 0-32.682667 56.618667z"/></svg>`;
  var SPARKLE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M855.071605 339.499431l-10.216418 26.934193c-7.430122 19.718401-31.077915 19.718401-38.508037 0l-10.144975-26.934193c-18.146645-48.010021-50.724873-86.303727-91.447658-107.165224l-31.435132-16.146227c-16.860662-8.716105-16.860662-37.150611 0-45.866717l29.649045-15.217461c41.722994-21.433045 75.015657-61.084178 92.805084-110.737399l10.430749-29.148941c7.287235-20.289949 31.506576-20.289949 38.793811 0l10.430749 29.148941c17.860871 49.653221 51.08209 89.304354 92.876528 110.737399l29.577602 15.217461c16.932105 8.716105 16.932105 37.150611 0 45.866717l-31.363689 16.074783c-40.722785 20.932941-73.372457 59.226647-91.447659 107.236668zM413.265106 95.234163h164.891559v95.305606H413.265106c-136.671383 0-247.480225 127.883835-247.480225 285.773932 0 171.89302 101.592633 284.130732 329.926005 403.87001v-118.096078h82.445779c136.671383 0 247.480225-127.955278 247.480225-285.773932h82.44578c0 210.401057-147.673679 381.008095-329.926005 381.008095v166.677646C371.970773 928.765279 83.339102 785.878313 83.339102 476.313701 83.339102 265.769757 231.012781 95.234163 413.265106 95.234163z"/></svg>`;

  // src/iframe/overlay/groups-panel.js
  function renderGroupsIfOpen() {
    if (!state.shadowRoot) return;
    const container = state.shadowRoot.querySelector(".groups");
    if (!container) return;
    container.innerHTML = "";
    state.groups.forEach((group) => {
      const groupSites = getGroupSites(group);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "group-btn";
      btn.textContent = group.name || t("overlay_unnamedSearchGroup", null, "未命名搜索组");
      if (groupSites.length) {
        btn.addEventListener("mouseenter", () => showGroupTooltip(btn, groupSites));
        btn.addEventListener("mouseleave", () => scheduleHideGroupTooltip());
      }
      btn.addEventListener("click", () => {
        hideGroupTooltip();
        runGroup(group);
      });
      container.appendChild(btn);
    });
  }
  function getGroupSites(group) {
    return (group?.siteIds || []).map((id) => state.allSites.find((site) => site.id === id)).filter((site) => site && normalizeSiteHomeUrl(site.url)).map((site) => ({
      id: site.id,
      name: site.name || site.id,
      url: normalizeSiteHomeUrl(site.url)
    }));
  }
  function getGroupTooltipEl() {
    return state.shadowRoot?.querySelector(".group-tooltip") || null;
  }
  function showGroupTooltip(button, sites) {
    if (!state.shadowRoot) return;
    if (state.groupTooltipTimer) {
      clearTimeout(state.groupTooltipTimer);
      state.groupTooltipTimer = null;
    }
    if (state.groupTooltipHideTimer) {
      clearTimeout(state.groupTooltipHideTimer);
      state.groupTooltipHideTimer = null;
    }
    state.groupTooltipTimer = setTimeout(() => {
      const tooltip = getGroupTooltipEl();
      const panel = state.shadowRoot?.querySelector(".panel");
      if (!(tooltip instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
      renderGroupTooltipSites(tooltip, sites);
      tooltip.style.display = "block";
      requestAnimationFrame(() => {
        const btnRect = button.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const tooltipW = tooltip.offsetWidth;
        const tooltipH = tooltip.offsetHeight;
        let left = btnRect.left - panelRect.left + btnRect.width / 2 - tooltipW / 2;
        if (left < 0) left = 0;
        if (left + tooltipW > panelRect.width) left = Math.max(0, panelRect.width - tooltipW);
        let top = btnRect.top - panelRect.top - tooltipH - 8;
        if (top < 0) top = btnRect.bottom - panelRect.top + 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
    }, 450);
  }
  function hideGroupTooltip() {
    if (state.groupTooltipTimer) {
      clearTimeout(state.groupTooltipTimer);
      state.groupTooltipTimer = null;
    }
    if (state.groupTooltipHideTimer) {
      clearTimeout(state.groupTooltipHideTimer);
      state.groupTooltipHideTimer = null;
    }
    const tooltip = getGroupTooltipEl();
    if (tooltip instanceof HTMLElement) tooltip.style.display = "none";
  }
  function scheduleHideGroupTooltip() {
    if (state.groupTooltipTimer) {
      clearTimeout(state.groupTooltipTimer);
      state.groupTooltipTimer = null;
    }
    if (state.groupTooltipHideTimer) clearTimeout(state.groupTooltipHideTimer);
    state.groupTooltipHideTimer = setTimeout(() => {
      const tooltip = getGroupTooltipEl();
      if (tooltip instanceof HTMLElement) tooltip.style.display = "none";
    }, 180);
  }
  function renderGroupTooltipSites(tooltip, sites) {
    tooltip.innerHTML = "";
    const list = document.createElement("div");
    list.className = "group-tooltip-list";
    list.style.gridTemplateColumns = `repeat(${Math.min(5, Math.max(1, sites.length))}, max-content)`;
    sites.forEach((site) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "group-tooltip-item";
      item.textContent = site.name;
      item.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideGroupTooltip();
        await openSiteHome(site.url);
      });
      list.appendChild(item);
    });
    tooltip.appendChild(list);
  }
  async function openSiteHome(url) {
    const safeUrl = normalizeSiteHomeUrl(url);
    if (!safeUrl) return;
    try {
      await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url: safeUrl });
    } catch (_err) {
    }
    state.closeOverlay();
  }
  async function runDefaultSearch() {
    if (!state.groups.length) return;
    await runGroup(state.groups[0]);
  }
  async function runGroup(group) {
    if (!state.shadowRoot) return;
    const queryInput = state.shadowRoot.querySelector(".query-input");
    const query = queryInput instanceof HTMLTextAreaElement ? queryInput.value.trim() : "";
    try {
      await chrome.runtime.sendMessage({ type: "RUN_SEARCH_GROUP", group, query });
    } catch (_err) {
    }
    state.closeOverlay();
  }

  // src/iframe/overlay/history-panel.js
  function renderHistoryIfOpen() {
    if (!state.shadowRoot) return;
    const historyList = state.shadowRoot.querySelector(".history-list");
    if (!(historyList instanceof HTMLElement)) return;
    historyList.innerHTML = "";
    if (!state.historyEntries.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = t("overlay_emptyHistory", null, "暂无搜索记录");
      historyList.appendChild(empty);
      return;
    }
    state.historyEntries.forEach((entry) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-item";
      const line = document.createElement("div");
      line.className = "history-line";
      const query = document.createElement("div");
      query.className = "history-query";
      query.textContent = String(entry?.query || "").replace(/\s+/g, " ").trim();
      const meta = document.createElement("div");
      meta.className = "history-meta";
      meta.textContent = formatHistoryDate(entry?.createdAt);
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "history-delete-btn";
      deleteBtn.setAttribute("aria-label", t("overlay_deleteHistoryEntry", null, "删除这条记录"));
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await removeHistoryEntry(entry);
      });
      line.appendChild(query);
      line.appendChild(meta);
      item.appendChild(line);
      item.appendChild(deleteBtn);
      item.addEventListener("click", () => {
        const queryInput = state.shadowRoot?.querySelector(".query-input");
        if (queryInput instanceof HTMLTextAreaElement) {
          queryInput.value = entry?.query || "";
          queryInput.dispatchEvent(new Event("input", { bubbles: true }));
          queryInput.focus();
        }
      });
      historyList.appendChild(item);
    });
  }
  async function removeHistoryEntry(entry) {
    try {
      const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
      const fullHistory = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY] : [];
      if (!fullHistory.length) return;
      let removed = false;
      const nextHistory = fullHistory.filter((item) => {
        if (removed) return true;
        if (entry?.id && item?.id === entry.id) {
          removed = true;
          return false;
        }
        if (!entry?.id && item?.query === entry?.query && item?.createdAt === entry?.createdAt) {
          removed = true;
          return false;
        }
        return true;
      });
      if (!removed) return;
      await chrome.storage.local.set({ [SEARCH_HISTORY_STORAGE_KEY]: nextHistory });
    } catch (_err) {
    }
  }

  // src/shared/prompt-groups.js
  function i18n(key) {
    try {
      return chrome?.i18n?.getMessage?.(key) || window.__QSHOT_I18N__?.t?.(key) || "";
    } catch (_e) {
      return "";
    }
  }
  function getAllPromptGroupName() {
    return i18n("settings_prompts_allGroup") || "全部";
  }
  function isAllPromptGroup(group) {
    return !!group && group.id === DEFAULT_PROMPT_GROUP_ID;
  }
  function getPromptGroupDisplayName(group) {
    if (isAllPromptGroup(group)) return getAllPromptGroupName();
    return group?.name || i18n("overlay_unnamedPromptGroup") || "未命名分组";
  }
  function getDisplayPromptEntries(group, allGroups) {
    if (!group) return [];
    if (isAllPromptGroup(group)) {
      const out = [];
      (allGroups || []).forEach((g) => {
        (g.prompts || []).forEach((prompt) => out.push({ prompt, sourceGroup: g }));
      });
      return out;
    }
    return (group.prompts || []).map((prompt) => ({ prompt, sourceGroup: group }));
  }

  // src/iframe/overlay/prompts-panel.js
  var randomQuestionsPromise = null;
  var lastRandomQuestionIndex = -1;
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[RANDOM_QUESTIONS_STORAGE_KEY]) {
        randomQuestionsPromise = null;
        lastRandomQuestionIndex = -1;
      }
    });
  } catch (_e) {
  }
  function parseRandomQuestionsText(text) {
    if (typeof text !== "string") return [];
    return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  }
  async function fetchDefaultRandomQuestionsText() {
    const lang = (() => {
      try {
        const chromeLang = (chrome?.i18n?.getUILanguage?.() || "").toLowerCase();
        if (chromeLang) return chromeLang;
        const navLang = (navigator?.language || "").toLowerCase();
        return navLang || "";
      } catch (_e) {
        return (navigator.language || "").toLowerCase();
      }
    })();
    const path = lang.startsWith("zh") ? RANDOM_QUESTIONS_FILES.zh : RANDOM_QUESTIONS_FILES.en;
    try {
      const res = await fetch(chrome.runtime.getURL(path));
      return res.ok ? await res.text() : "";
    } catch (_e) {
      return "";
    }
  }
  function loadRandomQuestions() {
    if (randomQuestionsPromise) return randomQuestionsPromise;
    randomQuestionsPromise = (async () => {
      const uiLang = (() => {
        try {
          return (chrome?.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase();
        } catch (_e) {
          return (navigator.language || "").toLowerCase();
        }
      })();
      const currentDefaultText = await fetchDefaultRandomQuestionsText();
      const otherPath = uiLang.startsWith("zh") ? RANDOM_QUESTIONS_FILES.en : RANDOM_QUESTIONS_FILES.zh;
      let otherDefaultText = "";
      try {
        const res = await fetch(chrome.runtime.getURL(otherPath));
        otherDefaultText = res.ok ? await res.text() : "";
      } catch (_e) {
        otherDefaultText = "";
      }
      try {
        const stored = await chrome.storage.local.get([RANDOM_QUESTIONS_STORAGE_KEY]);
        const raw = stored[RANDOM_QUESTIONS_STORAGE_KEY];
        const isOldDefault = typeof raw === "string" && raw.trimStart().startsWith("#");
        const hasCustomText = typeof raw === "string" && raw.trim().length > 0;
        const isOtherLangDefault = hasCustomText && raw.trim() === otherDefaultText.trim();
        if (hasCustomText && !isOldDefault && !isOtherLangDefault) {
          return parseRandomQuestionsText(raw);
        }
      } catch (_e) {
      }
      return parseRandomQuestionsText(currentDefaultText);
    })();
    return randomQuestionsPromise;
  }
  async function fillRandomQuestion() {
    if (!state.shadowRoot) return;
    const questions = await loadRandomQuestions();
    if (!questions.length) return;
    const queryInput = state.shadowRoot.querySelector(".query-input");
    if (!(queryInput instanceof HTMLTextAreaElement)) return;
    let idx = Math.floor(Math.random() * questions.length);
    if (questions.length > 1 && idx === lastRandomQuestionIndex) {
      idx = (idx + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length;
    }
    lastRandomQuestionIndex = idx;
    queryInput.value = questions[idx];
    queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    queryInput.focus();
  }
  function renderPromptPickerIfOpen() {
    if (!state.shadowRoot) return;
    const picker = state.shadowRoot.querySelector(".prompt-picker");
    if (!picker) return;
    picker.innerHTML = "";
    if (!state.isPromptPickerOpen || state.uiPrefs.showPromptButton === false) {
      picker.hidden = true;
      return;
    }
    picker.hidden = false;
    if (!state.promptGroups.length) {
      const empty = document.createElement("div");
      empty.className = "prompt-empty";
      empty.textContent = t("overlay_emptyPromptGroups", null, "还没有提示词分组，请先去设置里添加。");
      picker.appendChild(empty);
      return;
    }
    const activeGroup = state.promptGroups.find((g) => g.id === state.activePromptGroupId) || state.promptGroups[0];
    state.activePromptGroupId = activeGroup.id;
    const groupsCol = document.createElement("div");
    groupsCol.className = "prompt-groups-col";
    state.promptGroups.forEach((group) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `prompt-group-item${group.id === activeGroup.id ? " is-active" : ""}`;
      btn.textContent = getPromptGroupDisplayName(group);
      btn.addEventListener("mouseenter", () => {
        if (state.activePromptGroupId === group.id) return;
        state.activePromptGroupId = group.id;
        renderPromptPickerIfOpen();
      });
      btn.addEventListener("click", () => {
        state.activePromptGroupId = group.id;
        renderPromptPickerIfOpen();
      });
      groupsCol.appendChild(btn);
    });
    const listCol = document.createElement("div");
    listCol.className = "prompt-list-col";
    const entries = getDisplayPromptEntries(activeGroup, state.promptGroups);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "prompt-empty";
      empty.textContent = t("overlay_emptyPromptsInGroup", null, "这个分组里还没有提示词。");
      listCol.appendChild(empty);
    } else {
      entries.forEach(({ prompt }) => {
        if (!state.overlayPreviewMgr) {
          state.overlayPreviewMgr = window.PromptItemUI.createPreviewManager(state.shadowRoot);
        }
        const overlayItem = window.PromptItemUI.createItem(prompt, {
          itemClass: "prompt-item",
          labelClass: "prompt-item-label",
          iconsClass: "prompt-item-icons",
          iconBtnClass: "prompt-icon-btn",
          onFill: (p) => {
            const queryInput = state.shadowRoot.querySelector(".query-input");
            if (queryInput instanceof HTMLTextAreaElement) {
              queryInput.value = p.content || "";
              queryInput.dispatchEvent(new Event("input", { bubbles: true }));
              queryInput.focus();
            }
            state.isPromptPickerOpen = false;
            if (state.overlayPreviewMgr) state.overlayPreviewMgr.hide();
            renderPromptPickerIfOpen();
          },
          onEdit: () => {
            chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE", section: "prompts" }).catch(() => {
            });
            state.closeOverlay();
          },
          previewManager: state.overlayPreviewMgr
        });
        listCol.appendChild(overlayItem);
      });
    }
    const footer = document.createElement("div");
    footer.className = "prompt-picker-footer";
    const footerBtn = document.createElement("button");
    footerBtn.type = "button";
    footerBtn.className = "prompt-picker-footer-btn";
    footerBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>${t("overlay_managePrompts", null, "管理提示词")}`;
    footerBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE", section: "prompts" }).catch(() => {
      });
      state.closeOverlay();
    });
    footer.appendChild(footerBtn);
    picker.appendChild(groupsCol);
    picker.appendChild(listCol);
    picker.appendChild(footer);
  }

  // src/iframe/overlay/main.js
  function initQshotOverlay() {
    if (window.__QSHOT_OVERLAY_INSTALLED__) return;
    window.__QSHOT_OVERLAY_INSTALLED__ = true;
    state.closeOverlay = closeOverlay;
    const isTopFrame = function detectTop() {
      try {
        return window.top === window;
      } catch (_e) {
        return false;
      }
    }();
    refreshUiPrefs().then(syncShortcutToMainWorld).catch(() => {
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window && !isTopFrame) return;
      const data = event.data;
      if (!data) return;
      if (data.type === MAIN_HOTKEY_FIRE) {
        if (isTopFrame) {
          toggleOverlay();
        } else {
          try {
            window.top.postMessage({ type: FRAME_TOGGLE_MESSAGE }, "*");
          } catch (_err) {
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
          } catch (_e) {
          }
        }
        return;
      }
      if (data.type === FRAME_TOGGLE_MESSAGE && isTopFrame) {
        toggleOverlay();
      }
    });
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
        refreshUiPrefs()
      ]);
      if (!state.activePromptGroupId) {
        state.activePromptGroupId = state.promptGroups[0]?.id || null;
      }
      mountOverlay();
      state.isOpen = true;
      try {
        chrome.runtime.sendMessage({ type: "WARMUP_AI_SITES" }).catch(() => {
        });
      } catch (_err) {
      }
    }
    function syncShortcutToMainWorld() {
      try {
        window.postMessage(
          {
            type: MAIN_HOTKEY_CONFIG,
            enabled: state.uiPrefs.overlayShortcutEnabled !== false,
            shortcut: state.uiPrefs.overlayShortcut
          },
          // Review note: only syncs hotkey config between isolated world and MAIN world; no user input.
          window.location.origin
        );
      } catch (_err) {
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
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE" }).catch(() => {
      });
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
      const hasVisible = state.uiPrefs.showRandomButton !== false || state.uiPrefs.showPromptButton !== false;
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
    composer.classList.remove("is-mid-expanded", "is-expanded");
    queryInput.style.height = "0px";
    const scrollH = queryInput.scrollHeight;
    const lineHeight = parseFloat(getComputedStyle(queryInput).lineHeight || "20");
    queryInput.style.height = "";
    const shouldExpand = scrollH > lineHeight * 2.7;
    const shouldMidExpand = !shouldExpand && scrollH > lineHeight * 1.7;
    composer.classList.toggle("is-mid-expanded", shouldMidExpand);
    composer.classList.toggle("is-expanded", shouldExpand);
  }

  // src/iframe/overlay.js
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
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdG9yYWdlLWtleXMuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9zaG9ydGN1dC5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL292ZXJsYXkvc3RhdGUuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9vdmVybGF5L3N0eWxlcy5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL292ZXJsYXkvY29uc3RhbnRzLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvb3ZlcmxheS9ncm91cHMtcGFuZWwuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9vdmVybGF5L2hpc3RvcnktcGFuZWwuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9wcm9tcHQtZ3JvdXBzLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvb3ZlcmxheS9wcm9tcHRzLXBhbmVsLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvb3ZlcmxheS9tYWluLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvb3ZlcmxheS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGNvbnN0IFNFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVkgPSBcInNlYXJjaEdyb3Vwc1wiO1xyXG5leHBvcnQgY29uc3QgUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWSA9IFwicHJvbXB0R3JvdXBzXCI7XHJcbmV4cG9ydCBjb25zdCBVSV9QUkVGU19TVE9SQUdFX0tFWSA9IFwidWlQcmVmc1wiO1xyXG5leHBvcnQgY29uc3QgQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZID0gXCJjdXN0b21TaXRlc1wiO1xyXG5leHBvcnQgY29uc3QgUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWSA9IFwicmFuZG9tUXVlc3Rpb25zVGV4dFwiO1xyXG5leHBvcnQgY29uc3QgU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVkgPSBcInNlYXJjaEhpc3RvcnlcIjtcclxuXHJcbi8vIFRoZSBmaXhlZCBcIkFsbFwiIHByb21wdCBncm91cDogYWx3YXlzIGZpcnN0LCBjYW5ub3QgYmUgZGVsZXRlZCBvciByZW5hbWVkLlxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQgPSBcInByb21wdC1ncm91cC1kZWZhdWx0XCI7XHJcbmV4cG9ydCBjb25zdCBMRUdBQ1lfREVGQVVMVF9HUk9VUF9OQU1FID0gXCLpu5jorqTliIbnu4RcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBSQU5ET01fUVVFU1RJT05TX0ZJTEVTID0ge1xyXG4gIHpoOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL3poLUNOLnR4dFwiLFxyXG4gIGVuOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL2VuLnR4dFwiLFxyXG59O1xyXG4iLCAiY29uc3QgREVGQVVMVF9TSE9SVENVVCA9IE9iamVjdC5mcmVlemUoe1xyXG4gIGN0cmxLZXk6IHRydWUsXHJcbiAgc2hpZnRLZXk6IGZhbHNlLFxyXG4gIGFsdEtleTogZmFsc2UsXHJcbiAgbWV0YUtleTogZmFsc2UsXHJcbiAga2V5OiBcIlFcIixcclxufSk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplS2V5KGtleSkge1xyXG4gIGlmICgha2V5KSByZXR1cm4gXCJcIjtcclxuICBpZiAoa2V5Lmxlbmd0aCA9PT0gMSkgcmV0dXJuIGtleS50b1VwcGVyQ2FzZSgpO1xyXG4gIHJldHVybiBrZXk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVTaG9ydGN1dChpbnB1dCkge1xyXG4gIGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSBcIm9iamVjdFwiKSByZXR1cm4geyAuLi5ERUZBVUxUX1NIT1JUQ1VUIH07XHJcbiAgY29uc3Qga2V5ID0gdHlwZW9mIGlucHV0LmtleSA9PT0gXCJzdHJpbmdcIiAmJiBpbnB1dC5rZXkubGVuZ3RoID4gMCA/IGlucHV0LmtleSA6IERFRkFVTFRfU0hPUlRDVVQua2V5O1xyXG4gIHJldHVybiB7XHJcbiAgICBjdHJsS2V5OiAhIWlucHV0LmN0cmxLZXksXHJcbiAgICBzaGlmdEtleTogISFpbnB1dC5zaGlmdEtleSxcclxuICAgIGFsdEtleTogISFpbnB1dC5hbHRLZXksXHJcbiAgICBtZXRhS2V5OiAhIWlucHV0Lm1ldGFLZXksXHJcbiAgICBrZXk6IG5vcm1hbGl6ZUtleShrZXkpLFxyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBtYXRjaFNob3J0Y3V0KGV2ZW50LCBzYykge1xyXG4gIGlmICghc2MgfHwgIXNjLmtleSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmICgoISFzYy5jdHJsS2V5KSAhPT0gZXZlbnQuY3RybEtleSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmICgoISFzYy5zaGlmdEtleSkgIT09IGV2ZW50LnNoaWZ0S2V5KSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCghIXNjLmFsdEtleSkgIT09IGV2ZW50LmFsdEtleSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmICgoISFzYy5tZXRhS2V5KSAhPT0gZXZlbnQubWV0YUtleSkgcmV0dXJuIGZhbHNlO1xyXG4gIHJldHVybiBub3JtYWxpemVLZXkoZXZlbnQua2V5KSA9PT0gbm9ybWFsaXplS2V5KHNjLmtleSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRTaG9ydGN1dChzYykge1xyXG4gIGlmICghc2MgfHwgIXNjLmtleSkge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIGNocm9tZT8uaTE4bj8uZ2V0TWVzc2FnZT8uKFwiY29tbW9uX25vdFNldFwiKSB8fCBcIuacquiuvue9rlwiO1xyXG4gICAgfSBjYXRjaCAoX2UpIHtcclxuICAgICAgcmV0dXJuIFwi5pyq6K6+572uXCI7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGNvbnN0IHBhcnRzID0gW107XHJcbiAgaWYgKHNjLmN0cmxLZXkpIHBhcnRzLnB1c2goXCJDdHJsXCIpO1xyXG4gIGlmIChzYy5hbHRLZXkpIHBhcnRzLnB1c2goXCJBbHRcIik7XHJcbiAgaWYgKHNjLnNoaWZ0S2V5KSBwYXJ0cy5wdXNoKFwiU2hpZnRcIik7XHJcbiAgaWYgKHNjLm1ldGFLZXkpIHBhcnRzLnB1c2goL01hYy9pLnRlc3QobmF2aWdhdG9yLnBsYXRmb3JtKSA/IFwiQ21kXCIgOiBcIldpblwiKTtcclxuICBwYXJ0cy5wdXNoKHNjLmtleS5sZW5ndGggPT09IDEgPyBzYy5rZXkudG9VcHBlckNhc2UoKSA6IHNjLmtleSk7XHJcbiAgcmV0dXJuIHBhcnRzLmpvaW4oXCIgKyBcIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc1Nob3J0Y3V0VmFsaWQoc2MpIHtcclxuICBpZiAoIXNjIHx8ICFzYy5rZXkpIHJldHVybiBmYWxzZTtcclxuICBpZiAoc2Mua2V5ID09PSBcIkNvbnRyb2xcIiB8fCBzYy5rZXkgPT09IFwiU2hpZnRcIiB8fCBzYy5rZXkgPT09IFwiQWx0XCIgfHwgc2Mua2V5ID09PSBcIk1ldGFcIikgcmV0dXJuIGZhbHNlO1xyXG4gIHJldHVybiBzYy5jdHJsS2V5IHx8IHNjLmFsdEtleSB8fCBzYy5tZXRhS2V5IHx8IChzYy5zaGlmdEtleSAmJiBzYy5rZXkubGVuZ3RoID4gMSk7XHJcbn1cclxuIiwgImltcG9ydCB7XHJcbiAgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSxcclxuICBTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSxcclxuICBQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZLFxyXG4gIFVJX1BSRUZTX1NUT1JBR0VfS0VZLFxyXG4gIENVU1RPTV9TSVRFU19TVE9SQUdFX0tFWSxcclxufSBmcm9tIFwiLi4vLi4vc2hhcmVkL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5pbXBvcnQgeyBub3JtYWxpemVTaG9ydGN1dCB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc2hvcnRjdXQuanNcIjtcclxuXHJcbi8vIFNoYXJlZCBtdXRhYmxlIHN0YXRlIGZvciB0aGUgb3ZlcmxheS4gRWFjaCBwYW5lbCBtb2R1bGUgaW1wb3J0cyB0aGlzXHJcbi8vIHNpbmdsZXRvbiBhbmQgcmVhZHMvbXV0YXRlcyB0aGUgc2FtZSBmaWVsZHMgaW5zdGVhZCBvZiBqdWdnbGluZyBjYWxsYmFja3MuXHJcbmV4cG9ydCBjb25zdCBzdGF0ZSA9IHtcclxuICBob3N0RWw6IG51bGwsXHJcbiAgc2hhZG93Um9vdDogbnVsbCxcclxuICBpc09wZW46IGZhbHNlLFxyXG4gIGdyb3VwczogW10sXHJcbiAgYWxsU2l0ZXM6IFtdLFxyXG4gIGhpc3RvcnlFbnRyaWVzOiBbXSxcclxuICBwcm9tcHRHcm91cHM6IFtdLFxyXG4gIHVpUHJlZnM6IG5vcm1hbGl6ZVVpUHJlZnMoKSxcclxuICBhY3RpdmVQcm9tcHRHcm91cElkOiBudWxsLFxyXG4gIGlzUHJvbXB0UGlja2VyT3BlbjogZmFsc2UsXHJcbiAgb3ZlcmxheVByZXZpZXdNZ3I6IG51bGwsXHJcbiAgZ3JvdXBUb29sdGlwVGltZXI6IG51bGwsXHJcbiAgZ3JvdXBUb29sdGlwSGlkZVRpbWVyOiBudWxsLFxyXG4gIC8vIG1haW4uanMgcmVnaXN0ZXJzIGNsb3NlT3ZlcmxheSBoZXJlIHNvIHBhbmVscyBjYW4gdHJpZ2dlciBpdCB3aXRob3V0XHJcbiAgLy8gY3JlYXRpbmcgYW4gaW1wb3J0IGN5Y2xlLlxyXG4gIGNsb3NlT3ZlcmxheTogKCkgPT4ge30sXHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdChrZXksIHN1YnN0aXR1dGlvbnMsIGZhbGxiYWNrID0gXCJcIikge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBtc2cgPSBjaHJvbWU/LmkxOG4/LmdldE1lc3NhZ2U/LihrZXksIHN1YnN0aXR1dGlvbnMpIHx8IHdpbmRvdy5fX1FTSE9UX0kxOE5fXz8udD8uKGtleSwgc3Vic3RpdHV0aW9ucyk7XHJcbiAgICByZXR1cm4gbXNnIHx8IGZhbGxiYWNrIHx8IFwiXCI7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIHJldHVybiBmYWxsYmFjayB8fCBcIlwiO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVVpUHJlZnMoaW5wdXQpIHtcclxuICBjb25zdCBzcmMgPSBpbnB1dCAmJiB0eXBlb2YgaW5wdXQgPT09IFwib2JqZWN0XCIgPyBpbnB1dCA6IHt9O1xyXG4gIHJldHVybiB7XHJcbiAgICBzaG93SGlzdG9yeTogc3JjLnNob3dIaXN0b3J5ICE9PSBmYWxzZSxcclxuICAgIHNob3dSYW5kb21CdXR0b246IHNyYy5zaG93UmFuZG9tQnV0dG9uICE9PSBmYWxzZSxcclxuICAgIHNob3dQcm9tcHRCdXR0b246IHNyYy5zaG93UHJvbXB0QnV0dG9uICE9PSBmYWxzZSxcclxuICAgIHByZXdhcm1FbmFibGVkOiBzcmMucHJld2FybUVuYWJsZWQgIT09IGZhbHNlLFxyXG4gICAgb3ZlcmxheVNob3J0Y3V0RW5hYmxlZDogc3JjLm92ZXJsYXlTaG9ydGN1dEVuYWJsZWQgIT09IGZhbHNlLFxyXG4gICAgb3ZlcmxheVNob3J0Y3V0OiBub3JtYWxpemVTaG9ydGN1dChzcmMub3ZlcmxheVNob3J0Y3V0KSxcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplU2l0ZUhvbWVVcmwodXJsKSB7XHJcbiAgY29uc3QgcmF3ID0gU3RyaW5nKHVybCB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCFyYXcpIHJldHVybiBcIlwiO1xyXG4gIGxldCBuZXh0ID0gcmF3LnJlcGxhY2UoLyhbPyZdKVtePSZdKz1cXHtxdWVyeVxcfS9nLCAoXywgc2VwKSA9PiAoc2VwID09PSBcIj9cIiA/IFwiP1wiIDogXCJcIikpO1xyXG4gIG5leHQgPSBuZXh0LnJlcGxhY2UoL1xcPyYvLCBcIj9cIik7XHJcbiAgbmV4dCA9IG5leHQucmVwbGFjZSgvWz8mXSQvLCBcIlwiKTtcclxuICBuZXh0ID0gbmV4dC5yZXBsYWNlKC9cXHtxdWVyeVxcfS9nLCBcIlwiKTtcclxuICBpZiAoIS9eaHR0cHM/OlxcL1xcLy9pLnRlc3QobmV4dCkpIHJldHVybiBcIlwiO1xyXG4gIHJldHVybiBuZXh0O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0SGlzdG9yeURhdGUodmFsdWUpIHtcclxuICBpZiAoIXZhbHVlKSByZXR1cm4gXCJcIjtcclxuICBjb25zdCBkYXRlID0gbmV3IERhdGUodmFsdWUpO1xyXG4gIGlmIChOdW1iZXIuaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSByZXR1cm4gXCJcIjtcclxuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gIGNvbnN0IHNhbWVEYXkgPVxyXG4gICAgZGF0ZS5nZXRGdWxsWWVhcigpID09PSBub3cuZ2V0RnVsbFllYXIoKSAmJlxyXG4gICAgZGF0ZS5nZXRNb250aCgpID09PSBub3cuZ2V0TW9udGgoKSAmJlxyXG4gICAgZGF0ZS5nZXREYXRlKCkgPT09IG5vdy5nZXREYXRlKCk7XHJcbiAgaWYgKHNhbWVEYXkpIHtcclxuICAgIGNvbnN0IGxhbmcgPSB3aW5kb3cuX19RU0hPVF9JMThOX18/LmdldFVpTGFuZ3VhZ2U/LigpIHx8IG5hdmlnYXRvci5sYW5ndWFnZSB8fCBcInpoLUNOXCI7XHJcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcobGFuZywgeyBob3VyOiBcIjItZGlnaXRcIiwgbWludXRlOiBcIjItZGlnaXRcIiB9KTtcclxuICB9XHJcbiAgY29uc3QgbGFuZyA9IHdpbmRvdy5fX1FTSE9UX0kxOE5fXz8uZ2V0VWlMYW5ndWFnZT8uKCkgfHwgbmF2aWdhdG9yLmxhbmd1YWdlIHx8IFwiemgtQ05cIjtcclxuICByZXR1cm4gZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcobGFuZywgeyBtb250aDogXCJudW1lcmljXCIsIGRheTogXCJudW1lcmljXCIgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWZyZXNoR3JvdXBzKCkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1NFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVldKTtcclxuICAgIHN0YXRlLmdyb3VwcyA9IEFycmF5LmlzQXJyYXkoc3RvcmVkW1NFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVldKVxyXG4gICAgICA/IHN0b3JlZFtTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXVxyXG4gICAgICA6IFtdO1xyXG4gIH0gY2F0Y2ggKF9lcnIpIHtcclxuICAgIHN0YXRlLmdyb3VwcyA9IFtdO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hBbGxTaXRlcygpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgW2J1aWx0aW5SZXNwLCBzdG9yZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xyXG4gICAgICBmZXRjaChjaHJvbWUucnVudGltZS5nZXRVUkwoXCJjb25maWcvc2l0ZUhhbmRsZXJzLmpzb25cIikpLFxyXG4gICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW0NVU1RPTV9TSVRFU19TVE9SQUdFX0tFWV0pLFxyXG4gICAgXSk7XHJcbiAgICBjb25zdCBwYXlsb2FkID0gYXdhaXQgYnVpbHRpblJlc3AuanNvbigpO1xyXG4gICAgY29uc3QgYnVpbHRpbiA9IChwYXlsb2FkLnNpdGVzIHx8IFtdKS5maWx0ZXIoKHNpdGUpID0+IHNpdGUuZW5hYmxlZCAhPT0gZmFsc2UpO1xyXG4gICAgY29uc3QgY3VzdG9tID0gQXJyYXkuaXNBcnJheShzdG9yZWRbQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZXSlcclxuICAgICAgPyBzdG9yZWRbQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZXVxyXG4gICAgICA6IFtdO1xyXG4gICAgY29uc3Qga25vd25JZHMgPSBuZXcgU2V0KGJ1aWx0aW4ubWFwKChzaXRlKSA9PiBzaXRlLmlkKSk7XHJcbiAgICBjb25zdCBtZXJnZWQgPSBbLi4uYnVpbHRpbl07XHJcbiAgICBjdXN0b20uZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgICBpZiAoc2l0ZSAmJiAha25vd25JZHMuaGFzKHNpdGUuaWQpKSB7XHJcbiAgICAgICAgbWVyZ2VkLnB1c2goc2l0ZSk7XHJcbiAgICAgICAga25vd25JZHMuYWRkKHNpdGUuaWQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIHN0YXRlLmFsbFNpdGVzID0gbWVyZ2VkO1xyXG4gIH0gY2F0Y2ggKF9lcnIpIHtcclxuICAgIHN0YXRlLmFsbFNpdGVzID0gW107XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVmcmVzaEhpc3RvcnkoKSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldKTtcclxuICAgIHN0YXRlLmhpc3RvcnlFbnRyaWVzID0gQXJyYXkuaXNBcnJheShzdG9yZWRbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldKVxyXG4gICAgICA/IHN0b3JlZFtTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWV0uc2xpY2UoMCwgNClcclxuICAgICAgOiBbXTtcclxuICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICBzdGF0ZS5oaXN0b3J5RW50cmllcyA9IFtdO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hQcm9tcHRHcm91cHMoKSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWV0pO1xyXG4gICAgY29uc3Qgc291cmNlID0gQXJyYXkuaXNBcnJheShzdG9yZWRbUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWV0pXHJcbiAgICAgID8gc3RvcmVkW1BST01QVF9HUk9VUFNfU1RPUkFHRV9LRVldXHJcbiAgICAgIDogW107XHJcbiAgICBzdGF0ZS5wcm9tcHRHcm91cHMgPSBzb3VyY2UubWFwKChncm91cCwgZ2kpID0+ICh7XHJcbiAgICAgIGlkOiBTdHJpbmcoZ3JvdXAuaWQgfHwgYHByb21wdC1ncm91cC0ke2dpfWApLFxyXG4gICAgICBuYW1lOiBTdHJpbmcoZ3JvdXAubmFtZSB8fCBcIuacquWRveWQjeWIhue7hFwiKSxcclxuICAgICAgcHJvbXB0czogQXJyYXkuaXNBcnJheShncm91cC5wcm9tcHRzKVxyXG4gICAgICAgID8gZ3JvdXAucHJvbXB0cy5tYXAoKHAsIHBpKSA9PiAoe1xyXG4gICAgICAgICAgICBpZDogU3RyaW5nKHAuaWQgfHwgYHByb21wdC0ke2dpfS0ke3BpfWApLFxyXG4gICAgICAgICAgICB0aXRsZTogU3RyaW5nKHAudGl0bGUgfHwgXCLmnKrlkb3lkI3mj5DnpLror41cIiksXHJcbiAgICAgICAgICAgIGNvbnRlbnQ6IFN0cmluZyhwLmNvbnRlbnQgfHwgXCJcIiksXHJcbiAgICAgICAgICB9KSlcclxuICAgICAgICA6IFtdLFxyXG4gICAgfSkpO1xyXG4gICAgaWYgKCFzdGF0ZS5wcm9tcHRHcm91cHMuc29tZSgoZykgPT4gZy5pZCA9PT0gc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCkpIHtcclxuICAgICAgc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9IHN0YXRlLnByb21wdEdyb3Vwc1swXT8uaWQgfHwgbnVsbDtcclxuICAgIH1cclxuICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICBzdGF0ZS5wcm9tcHRHcm91cHMgPSBbXTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWZyZXNoVWlQcmVmcygpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3Qgc3RvcmVkID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtVSV9QUkVGU19TVE9SQUdFX0tFWV0pO1xyXG4gICAgc3RhdGUudWlQcmVmcyA9IG5vcm1hbGl6ZVVpUHJlZnMoc3RvcmVkW1VJX1BSRUZTX1NUT1JBR0VfS0VZXSk7XHJcbiAgfSBjYXRjaCAoX2Vycikge1xyXG4gICAgc3RhdGUudWlQcmVmcyA9IG5vcm1hbGl6ZVVpUHJlZnMoKTtcclxuICB9XHJcbn1cclxuIiwgIi8vIFNwbGl0IGludG8gdHdvIENTUyBibG9ja3MgdG8ga2VlcCB0aGUgZmlsZSB1bmRlciB0aGUgNTAwLWxpbmUgbGltaXQuXHJcbmNvbnN0IEJBU0UgPSBgXHJcbiAgOmhvc3Qge1xyXG4gICAgYWxsOiBpbml0aWFsO1xyXG4gICAgLS1xc2hvdC1wYW5lbC1zY2FsZTogMS4xNjc7XHJcbiAgICAtLXFzaG90LXBhbmVsLW9mZnNldC15OiAtODBweDtcclxuICB9XHJcbiAgKiB7IGJveC1zaXppbmc6IGJvcmRlci1ib3g7IGZvbnQtZmFtaWx5OiBcIk1pY3Jvc29mdCBZYUhlaSBVSVwiLCBcIlBpbmdGYW5nIFNDXCIsIC1hcHBsZS1zeXN0ZW0sIHNhbnMtc2VyaWY7IH1cclxuICAuYmFja2Ryb3Age1xyXG4gICAgcG9zaXRpb246IGZpeGVkO1xyXG4gICAgaW5zZXQ6IDA7XHJcbiAgICB6LWluZGV4OiAyMTQ3NDgzNjQ2O1xyXG4gICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjM4KTtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XHJcbiAgICBwYWRkaW5nOiAyNHB4IDE2cHg7XHJcbiAgICBvdmVyZmxvdy15OiBhdXRvO1xyXG4gICAgYW5pbWF0aW9uOiBxc2hvdEZhZGVJbiAxNDBtcyBlYXNlLW91dDtcclxuICB9XHJcbiAgLnBhbmVsIHtcclxuICAgIHdpZHRoOiA0MjBweDtcclxuICAgIG1heC13aWR0aDogY2FsYygxMDB2dyAtIDMycHgpO1xyXG4gICAgYmFja2dyb3VuZDogI2ZmZmZmZjtcclxuICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XHJcbiAgICBib3gtc2hhZG93OiAwIDI0cHggNjBweCByZ2JhKDAsIDAsIDAsIDAuMjgpO1xyXG4gICAgcGFkZGluZzogMThweCAxNnB4O1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgICBnYXA6IDE0cHg7XHJcbiAgICBjb2xvcjogIzExMTtcclxuICB9XHJcbiAgQGtleWZyYW1lcyBxc2hvdEZhZGVJbiB7IGZyb20geyBvcGFjaXR5OiAwOyB9IHRvIHsgb3BhY2l0eTogMTsgfSB9XHJcbiAgQGtleWZyYW1lcyBxc2hvdFBvcEluIHtcclxuICAgIGZyb20ge1xyXG4gICAgICBvcGFjaXR5OiAwO1xyXG4gICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoY2FsYyh2YXIoLS1xc2hvdC1wYW5lbC1vZmZzZXQteSkgLSA4cHgpKSBzY2FsZShjYWxjKHZhcigtLXFzaG90LXBhbmVsLXNjYWxlKSAtIDAuMDIpKTtcclxuICAgIH1cclxuICAgIHRvICAge1xyXG4gICAgICBvcGFjaXR5OiAxO1xyXG4gICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkodmFyKC0tcXNob3QtcGFuZWwtb2Zmc2V0LXkpKSBzY2FsZSh2YXIoLS1xc2hvdC1wYW5lbC1zY2FsZSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICAuaGVhZGVyIHtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICAgIG1hcmdpbi1ib3R0b206IDJweDtcclxuICB9XHJcbiAgLnRpdGxlLWxvZ28ge1xyXG4gICAgaGVpZ2h0OiAzMHB4O1xyXG4gICAgd2lkdGg6IGF1dG87XHJcbiAgICBkaXNwbGF5OiBibG9jaztcclxuICB9XHJcbiAgLmNvbXBvc2VyIHtcclxuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcclxuICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgbWluLWhlaWdodDogNTZweDtcclxuICAgIHBhZGRpbmc6IDEwcHggMTRweDtcclxuICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC4yMik7XHJcbiAgICBib3JkZXItcmFkaXVzOiAxOHB4O1xyXG4gICAgYmFja2dyb3VuZDogI2ZmZmZmZjtcclxuICAgIGJveC1zaGFkb3c6IDAgNXB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjA3KTtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gICAgZ2FwOiAxMHB4O1xyXG4gICAgdHJhbnNpdGlvbjogbWluLWhlaWdodCAxODBtcyBlYXNlLCBwYWRkaW5nIDE4MG1zIGVhc2U7XHJcbiAgfVxyXG4gIC5jb21wb3Nlci5pcy1taWQtZXhwYW5kZWQsXHJcbiAgLmNvbXBvc2VyLmlzLWV4cGFuZGVkIHtcclxuICAgIHBhZGRpbmc6IDEycHggMTRweDtcclxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgICBhbGlnbi1pdGVtczogc3RyZXRjaDtcclxuICAgIGdhcDogOHB4O1xyXG4gIH1cclxuICAuY29tcG9zZXIuaXMtbWlkLWV4cGFuZGVkIHtcclxuICAgIG1pbi1oZWlnaHQ6IDgycHg7XHJcbiAgfVxyXG4gIC5jb21wb3Nlci5pcy1leHBhbmRlZCB7XHJcbiAgICBtaW4taGVpZ2h0OiAxMThweDtcclxuICB9XHJcbiAgLnF1ZXJ5LWlucHV0IHtcclxuICAgIHdpZHRoOiAxMDAlO1xyXG4gICAgbWluLXdpZHRoOiAwO1xyXG4gICAgbWluLWhlaWdodDogMjBweDtcclxuICAgIGhlaWdodDogMjBweDtcclxuICAgIG1heC1oZWlnaHQ6IDIyMHB4O1xyXG4gICAgcmVzaXplOiBub25lO1xyXG4gICAgb3ZlcmZsb3cteTogaGlkZGVuO1xyXG4gICAgb3ZlcmZsb3cteDogaGlkZGVuO1xyXG4gICAgYm9yZGVyOiBub25lO1xyXG4gICAgb3V0bGluZTogbm9uZTtcclxuICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xyXG4gICAgcGFkZGluZzogMCA2cHggMCAwO1xyXG4gICAgZm9udC1zaXplOiAxNHB4O1xyXG4gICAgbGluZS1oZWlnaHQ6IDEuNDtcclxuICAgIGNvbG9yOiAjMTExO1xyXG4gICAgZmxleDogMTtcclxuICB9XHJcbiAgLmNvbXBvc2VyLmlzLW1pZC1leHBhbmRlZCAucXVlcnktaW5wdXQge1xyXG4gICAgbWluLWhlaWdodDogNDBweDtcclxuICAgIGhlaWdodDogYXV0bztcclxuICAgIG92ZXJmbG93LXk6IGhpZGRlbjtcclxuICAgIHBhZGRpbmc6IDJweCA0cHggMCAwO1xyXG4gIH1cclxuICAuY29tcG9zZXIuaXMtZXhwYW5kZWQgLnF1ZXJ5LWlucHV0IHtcclxuICAgIG1pbi1oZWlnaHQ6IDc2cHg7XHJcbiAgICBoZWlnaHQ6IGF1dG87XHJcbiAgICBvdmVyZmxvdy15OiBhdXRvO1xyXG4gICAgcGFkZGluZzogMnB4IDRweCAwIDA7XHJcbiAgfVxyXG4gIC5xdWVyeS1pbnB1dDo6cGxhY2Vob2xkZXIgeyBjb2xvcjogIzlhOWE5YTsgfVxyXG4gIC5xdWVyeS1pbnB1dDo6LXdlYmtpdC1zY3JvbGxiYXIgeyB3aWR0aDogN3B4OyBoZWlnaHQ6IDdweDsgfVxyXG4gIC5xdWVyeS1pbnB1dDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIgeyBiYWNrZ3JvdW5kOiAjOWM5YzljOyBib3JkZXItcmFkaXVzOiA5OTlweDsgfVxyXG4gIC5hY3Rpb25zLXJvdyB7XHJcbiAgICBkaXNwbGF5OiBmbGV4O1xyXG4gICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBnYXA6IDEwcHg7XHJcbiAgICBmbGV4OiBub25lO1xyXG4gIH1cclxuICAuY29tcG9zZXIuaXMtbWlkLWV4cGFuZGVkIC5hY3Rpb25zLXJvdyxcclxuICAuY29tcG9zZXIuaXMtZXhwYW5kZWQgLmFjdGlvbnMtcm93IHsgbWFyZ2luLXRvcDogOHB4OyB9XHJcbiAgLmljb24tYnRuIHtcclxuICAgIHdpZHRoOiAyNHB4O1xyXG4gICAgaGVpZ2h0OiAyNHB4O1xyXG4gICAgcGFkZGluZzogMDtcclxuICAgIGJvcmRlcjogbm9uZTtcclxuICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xyXG4gICAgY29sb3I6ICMxMTE7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgIGZsZXg6IG5vbmU7XHJcbiAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMTgwbXMgZWFzZSwgY29sb3IgMTgwbXMgZWFzZTtcclxuICB9XHJcbiAgLmljb24tYnRuOmhvdmVyIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xcHgpOyB9XHJcbiAgLmljb24tYnRuLmRpY2U6aG92ZXIgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCkgcm90YXRlKC0xNGRlZykgc2NhbGUoMS4wOCk7IH1cclxuICAuaWNvbi1idG4gc3ZnIHsgd2lkdGg6IDIycHg7IGhlaWdodDogMjJweDsgZmlsbDogY3VycmVudENvbG9yOyB9XHJcbiAgLmljb24tYnRuLnNwYXJrbGUgc3ZnIHsgd2lkdGg6IDIwcHg7IGhlaWdodDogMjBweDsgfVxyXG4gIC5ncm91cHMge1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xyXG4gICAgZmxleC13cmFwOiB3cmFwO1xyXG4gICAgZ2FwOiAxMHB4O1xyXG4gIH1cclxuICAuZ3JvdXBzOmVtcHR5IHsgZGlzcGxheTogbm9uZTsgfVxyXG4gIC5ncm91cC1idG4ge1xyXG4gICAgbWluLXdpZHRoOiA4NHB4O1xyXG4gICAgbWluLWhlaWdodDogMzJweDtcclxuICAgIHBhZGRpbmc6IDAgMTJweDtcclxuICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC42Mik7XHJcbiAgICBib3JkZXItcmFkaXVzOiA5OTlweDtcclxuICAgIGJhY2tncm91bmQ6ICNmZmY7XHJcbiAgICBjb2xvcjogIzExMTtcclxuICAgIGZvbnQtc2l6ZTogMTRweDtcclxuICAgIGxpbmUtaGVpZ2h0OiAxLjI7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMTUwbXMgZWFzZSwgY29sb3IgMTUwbXMgZWFzZSwgYm9yZGVyLWNvbG9yIDE1MG1zIGVhc2UsIHRyYW5zZm9ybSAxNTBtcyBlYXNlO1xyXG4gIH1cclxuICAuZ3JvdXAtYnRuOmhvdmVyIHtcclxuICAgIGJhY2tncm91bmQ6ICMxMTE7XHJcbiAgICBjb2xvcjogI2ZmZjtcclxuICAgIGJvcmRlci1jb2xvcjogIzExMTtcclxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTtcclxuICB9XHJcbiAgLmdyb3VwLXRvb2x0aXAge1xyXG4gICAgcG9zaXRpb246IGFic29sdXRlO1xyXG4gICAgei1pbmRleDogMzA7XHJcbiAgICBkaXNwbGF5OiBub25lO1xyXG4gICAgbWF4LXdpZHRoOiBjYWxjKDEwMCUgLSA4cHgpO1xyXG4gICAgcGFkZGluZzogOHB4IDEwcHg7XHJcbiAgICBib3JkZXItcmFkaXVzOiAxMHB4O1xyXG4gICAgYmFja2dyb3VuZDogI2ZmZmZmZjtcclxuICAgIGNvbG9yOiAjMTExMTExO1xyXG4gICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAwLCAwLCAwLjEpO1xyXG4gICAgZm9udC1zaXplOiAxMnB4O1xyXG4gICAgbGluZS1oZWlnaHQ6IDEuNTtcclxuICAgIGJveC1zaGFkb3c6IDAgMTRweCAzMnB4IHJnYmEoMCwgMCwgMCwgMC4xNik7XHJcbiAgICBwb2ludGVyLWV2ZW50czogYXV0bztcclxuICB9XHJcbiAgLmdyb3VwLXRvb2x0aXAtbGlzdCB7XHJcbiAgICBkaXNwbGF5OiBncmlkO1xyXG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoNSwgbWF4LWNvbnRlbnQpO1xyXG4gICAganVzdGlmeS1jb250ZW50OiBzdGFydDtcclxuICAgIGdhcDogNnB4O1xyXG4gIH1cclxuICAuZ3JvdXAtdG9vbHRpcC1pdGVtIHtcclxuICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC4yKTtcclxuICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xyXG4gICAgYmFja2dyb3VuZDogI2ZmZmZmZjtcclxuICAgIGNvbG9yOiAjMTExMTExO1xyXG4gICAgZm9udDogaW5oZXJpdDtcclxuICAgIGxpbmUtaGVpZ2h0OiAxLjI7XHJcbiAgICBwYWRkaW5nOiA2cHggMTBweDtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgIGZsZXgtc2hyaW5rOiAwO1xyXG4gICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcclxuICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXMgZWFzZSwgY29sb3IgMC4xNXMgZWFzZSwgYm9yZGVyLWNvbG9yIDAuMTVzIGVhc2UsIHRyYW5zZm9ybSAwLjE1cyBlYXNlO1xyXG4gIH1cclxuICAuZ3JvdXAtdG9vbHRpcC1pdGVtOmhvdmVyIHtcclxuICAgIGJhY2tncm91bmQ6ICMxMTExMTE7XHJcbiAgICBib3JkZXItY29sb3I6ICMxMTExMTE7XHJcbiAgICBjb2xvcjogI2ZmZmZmZjtcclxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTtcclxuICB9XHJcbiAgLmhpc3Rvcnktc2VjdGlvbiB7IHBhZGRpbmc6IDA7IH1cclxuICAuaGlzdG9yeS1zZWN0aW9uW2hpZGRlbl0geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IH1cclxuICAuc2VjdGlvbi1kaXZpZGVyIHtcclxuICAgIGRpc3BsYXk6IGdyaWQ7XHJcbiAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciBhdXRvIDFmcjtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBjb2x1bW4tZ2FwOiAxMHB4O1xyXG4gIH1cclxuICAuc2VjdGlvbi1kaXZpZGVyOjpiZWZvcmUsXHJcbiAgLnNlY3Rpb24tZGl2aWRlcjo6YWZ0ZXIge1xyXG4gICAgY29udGVudDogXCJcIjtcclxuICAgIGhlaWdodDogMXB4O1xyXG4gICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjI0KTtcclxuICB9XHJcbiAgLnNlY3Rpb24tZGl2aWRlci1sYWJlbCB7XHJcbiAgICBmb250LXNpemU6IDEzcHg7XHJcbiAgICBjb2xvcjogIzMxMzEzMTtcclxuICB9XHJcbiAgLmhpc3RvcnktbGlzdCB7XHJcbiAgICBtYXJnaW4tdG9wOiAxMHB4O1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgICBnYXA6IDhweDtcclxuICAgIG1pbi1oZWlnaHQ6IDA7XHJcbiAgfVxyXG4gIC5oaXN0b3J5LWVtcHR5LFxyXG4gIC5oaXN0b3J5LWl0ZW0ge1xyXG4gICAgd2lkdGg6IDEwMCU7XHJcbiAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xyXG4gIH1cclxuICAuaGlzdG9yeS1lbXB0eSB7XHJcbiAgICBwYWRkaW5nOiAxMnB4IDEwcHg7XHJcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XHJcbiAgICBjb2xvcjogIzg4ODg4ODtcclxuICAgIGZvbnQtc2l6ZTogMTJweDtcclxuICB9XHJcbiAgLmhpc3RvcnktaXRlbSB7XHJcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XHJcbiAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDAsIDAsIDAuMSk7XHJcbiAgICBiYWNrZ3JvdW5kOiAjZmZmZmZmO1xyXG4gICAgcGFkZGluZzogOXB4IDEycHg7XHJcbiAgICBwYWRkaW5nLXJpZ2h0OiAyNHB4O1xyXG4gICAgY3Vyc29yOiBwb2ludGVyO1xyXG4gICAgYm94LXNoYWRvdzogMCAxcHggNXB4IHJnYmEoMCwgMCwgMCwgMC4wMyk7XHJcbiAgfVxyXG4gIC5oaXN0b3J5LWxpbmUge1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBnYXA6IDhweDtcclxuICB9XHJcbiAgLmhpc3RvcnktcXVlcnkge1xyXG4gICAgZmxleDogMTtcclxuICAgIG1pbi13aWR0aDogMDtcclxuICAgIGZvbnQtc2l6ZTogMTJweDtcclxuICAgIGxpbmUtaGVpZ2h0OiAxLjU7XHJcbiAgICBjb2xvcjogIzExMTExMTtcclxuICAgIHRleHQtYWxpZ246IGxlZnQ7XHJcbiAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xyXG4gICAgb3ZlcmZsb3c6IGhpZGRlbjtcclxuICAgIHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1xyXG4gIH1cclxuICAuaGlzdG9yeS1tZXRhIHtcclxuICAgIGZsZXg6IG5vbmU7XHJcbiAgICBmb250LXNpemU6IDEwcHg7XHJcbiAgICBsaW5lLWhlaWdodDogMS41O1xyXG4gICAgY29sb3I6ICM4ZDhkOGQ7XHJcbiAgICB0ZXh0LWFsaWduOiByaWdodDtcclxuICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XHJcbiAgfVxyXG4gIC5oaXN0b3J5LWRlbGV0ZS1idG4ge1xyXG4gICAgcG9zaXRpb246IGFic29sdXRlO1xyXG4gICAgdG9wOiA2cHg7XHJcbiAgICByaWdodDogOHB4O1xyXG4gICAgYm9yZGVyOiBub25lO1xyXG4gICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XHJcbiAgICBwYWRkaW5nOiAwO1xyXG4gICAgd2lkdGg6IDE0cHg7XHJcbiAgICBoZWlnaHQ6IDE0cHg7XHJcbiAgICBmb250LXNpemU6IDE0cHg7XHJcbiAgICBsaW5lLWhlaWdodDogMTtcclxuICAgIGNvbG9yOiAjYTNhM2EzO1xyXG4gICAgY3Vyc29yOiBwb2ludGVyO1xyXG4gICAgb3BhY2l0eTogMDtcclxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTtcclxuICAgIHRyYW5zaXRpb246IG9wYWNpdHkgMC4xNXMgZWFzZSwgY29sb3IgMC4xNXMgZWFzZTtcclxuICB9XHJcbiAgLmhpc3RvcnktaXRlbTpob3ZlciAuaGlzdG9yeS1kZWxldGUtYnRuLFxyXG4gIC5oaXN0b3J5LWl0ZW06Zm9jdXMtd2l0aGluIC5oaXN0b3J5LWRlbGV0ZS1idG4ge1xyXG4gICAgb3BhY2l0eTogMTtcclxuICB9XHJcbiAgLmhpc3RvcnktZGVsZXRlLWJ0bjpob3ZlciB7IGNvbG9yOiAjNmI2YjZiOyB9XHJcbmA7XHJcbmNvbnN0IFBJQ0tFUiA9IGBcclxuICAucHJvbXB0LXBpY2tlciB7XHJcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICB0b3A6IGNhbGMoMTAwJSArIDhweCk7XHJcbiAgICBsZWZ0OiAtMXB4O1xyXG4gICAgcmlnaHQ6IC0xcHg7XHJcbiAgICBtaW4taGVpZ2h0OiAyMjhweDtcclxuICAgIG1heC1oZWlnaHQ6IDMyMHB4O1xyXG4gICAgZGlzcGxheTogZ3JpZDtcclxuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMTEycHggbWlubWF4KDAsIDFmcik7XHJcbiAgICBncmlkLXRlbXBsYXRlLXJvd3M6IDFmciBhdXRvO1xyXG4gICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAwLCAwLCAwLjEpO1xyXG4gICAgYm9yZGVyLXJhZGl1czogNnB4O1xyXG4gICAgYmFja2dyb3VuZDogI2ZmZjtcclxuICAgIGJveC1zaGFkb3c6IDAgMThweCAzNHB4IHJnYmEoMCwgMCwgMCwgMC4xMik7XHJcbiAgICBvdmVyZmxvdzogaGlkZGVuO1xyXG4gICAgei1pbmRleDogNjtcclxuICB9XHJcbiAgLnByb21wdC1waWNrZXJbaGlkZGVuXSB7IGRpc3BsYXk6IG5vbmU7IH1cclxuICAucHJvbXB0LWdyb3Vwcy1jb2wge1xyXG4gICAgcGFkZGluZzogMTBweDtcclxuICAgIGJvcmRlci1yaWdodDogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC4wOCk7XHJcbiAgICBiYWNrZ3JvdW5kOiAjZmJmYmZiO1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgICBnYXA6IDZweDtcclxuICAgIG92ZXJmbG93LXk6IGF1dG87XHJcbiAgICBtaW4taGVpZ2h0OiAwO1xyXG4gIH1cclxuICAucHJvbXB0LWdyb3VwLWl0ZW0ge1xyXG4gICAgd2lkdGg6IDEwMCU7XHJcbiAgICBtaW4taGVpZ2h0OiAzMnB4O1xyXG4gICAgcGFkZGluZzogNnB4IDEwcHg7XHJcbiAgICBib3JkZXI6IG5vbmU7XHJcbiAgICBib3JkZXItcmFkaXVzOiA0cHg7XHJcbiAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcclxuICAgIGNvbG9yOiAjMTExO1xyXG4gICAgdGV4dC1hbGlnbjogbGVmdDtcclxuICAgIGZvbnQtc2l6ZTogMTJweDtcclxuICAgIGxpbmUtaGVpZ2h0OiAxLjQ7XHJcbiAgICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgICBmbGV4LXNocmluazogMDtcclxuICB9XHJcbiAgLnByb21wdC1ncm91cC1pdGVtLmlzLWFjdGl2ZSxcclxuICAucHJvbXB0LWdyb3VwLWl0ZW06aG92ZXIge1xyXG4gICAgYmFja2dyb3VuZDogIzExMTtcclxuICAgIGNvbG9yOiAjZmZmO1xyXG4gIH1cclxuICAucHJvbXB0LWxpc3QtY29sIHtcclxuICAgIHBhZGRpbmc6IDZweCAwO1xyXG4gICAgb3ZlcmZsb3cteTogYXV0bztcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xyXG4gICAgbWluLWhlaWdodDogMDtcclxuICB9XHJcbiAgLnByb21wdC1pdGVtIHtcclxuICAgIG1pbi1oZWlnaHQ6IDM2cHg7XHJcbiAgICBwYWRkaW5nOiA0cHggMTJweDtcclxuICAgIGZvbnQtc2l6ZTogMTNweDtcclxuICAgIGZvbnQtd2VpZ2h0OiA1MDA7XHJcbiAgICBsaW5lLWhlaWdodDogMS40O1xyXG4gICAgY29sb3I6ICMxMTE7XHJcbiAgICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgwLCAwLCAwLCAwLjA3KTtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gICAgZ2FwOiA2cHg7XHJcbiAgfVxyXG4gIC5wcm9tcHQtaXRlbTpsYXN0LWNoaWxkIHsgYm9yZGVyLWJvdHRvbTogbm9uZTsgfVxyXG4gIC5wcm9tcHQtaXRlbTpob3ZlciB7IGJhY2tncm91bmQ6ICNmNmY2ZjY7IH1cclxuICAucHJvbXB0LWl0ZW0tbGFiZWwge1xyXG4gICAgZmxleDogMTtcclxuICAgIG1pbi13aWR0aDogMDtcclxuICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XHJcbiAgICBvdmVyZmxvdzogaGlkZGVuO1xyXG4gICAgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XHJcbiAgICBwYWRkaW5nOiA0cHggMDtcclxuICB9XHJcbiAgLnByb21wdC1pdGVtLWljb25zIHtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gICAgZ2FwOiAycHg7XHJcbiAgICBmbGV4LXNocmluazogMDtcclxuICAgIG9wYWNpdHk6IDA7XHJcbiAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDEyMG1zIGVhc2U7XHJcbiAgfVxyXG4gIC5wcm9tcHQtaXRlbTpob3ZlciAucHJvbXB0LWl0ZW0taWNvbnMgeyBvcGFjaXR5OiAxOyB9XHJcbiAgLnByb21wdC1pY29uLWJ0biB7XHJcbiAgICB3aWR0aDogMjJweDtcclxuICAgIGhlaWdodDogMjJweDtcclxuICAgIGRpc3BsYXk6IGlubGluZS1mbGV4O1xyXG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcclxuICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xyXG4gICAgYm9yZGVyOiBub25lO1xyXG4gICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XHJcbiAgICBjb2xvcjogIzk5OTtcclxuICAgIGJvcmRlci1yYWRpdXM6IDRweDtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgIHBhZGRpbmc6IDA7XHJcbiAgICBmbGV4LXNocmluazogMDtcclxuICAgIHRyYW5zaXRpb246IGNvbG9yIDEyMG1zIGVhc2UsIGJhY2tncm91bmQgMTIwbXMgZWFzZTtcclxuICB9XHJcbiAgLnByb21wdC1pY29uLWJ0bjpob3ZlciB7IGJhY2tncm91bmQ6ICNlOGU4ZTg7IGNvbG9yOiAjMzMzOyB9XHJcbiAgLnByb21wdC1lbXB0eSB7XHJcbiAgICBwYWRkaW5nOiAxNHB4IDEycHg7XHJcbiAgICBmb250LXNpemU6IDEycHg7XHJcbiAgICBjb2xvcjogIzg4ODtcclxuICB9XHJcbiAgLnByb21wdC1waWNrZXItZm9vdGVyIHtcclxuICAgIGdyaWQtY29sdW1uOiAxIC8gLTE7XHJcbiAgICBkaXNwbGF5OiBmbGV4O1xyXG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XHJcbiAgICBwYWRkaW5nOiA2cHggMDtcclxuICAgIGJvcmRlci10b3A6IDFweCBzb2xpZCByZ2JhKDAsIDAsIDAsIDAuMDcpO1xyXG4gICAgYmFja2dyb3VuZDogI2ZiZmJmYjtcclxuICB9XHJcbiAgLnByb21wdC1waWNrZXItZm9vdGVyLWJ0biB7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBnYXA6IDVweDtcclxuICAgIGJvcmRlcjogbm9uZTtcclxuICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xyXG4gICAgZm9udC1zaXplOiAxMXB4O1xyXG4gICAgY29sb3I6ICNhYWE7XHJcbiAgICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgICBwYWRkaW5nOiAzcHggOHB4O1xyXG4gICAgYm9yZGVyLXJhZGl1czogNHB4O1xyXG4gICAgdHJhbnNpdGlvbjogY29sb3IgMTQwbXMgZWFzZSwgYmFja2dyb3VuZCAxNDBtcyBlYXNlO1xyXG4gIH1cclxuICAucHJvbXB0LXBpY2tlci1mb290ZXItYnRuOmhvdmVyIHsgY29sb3I6ICM1NTU7IGJhY2tncm91bmQ6ICNmMGYwZjA7IH1cclxuICAke3dpbmRvdy5Qcm9tcHRJdGVtVUk/LlBSRVZJRVdfQ1NTID8/IFwiXCJ9XHJcbiAgLnBhbmVsLXdyYXAge1xyXG4gICAgZGlzcGxheTogZmxleDtcclxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gICAgZ2FwOiAxMHB4O1xyXG4gICAgYW5pbWF0aW9uOiBxc2hvdFBvcEluIDE4MG1zIGN1YmljLWJlemllciguMiwuOSwuMywxLjEpIGZvcndhcmRzO1xyXG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKHZhcigtLXFzaG90LXBhbmVsLW9mZnNldC15KSkgc2NhbGUodmFyKC0tcXNob3QtcGFuZWwtc2NhbGUpKTtcclxuICB9XHJcbiAgLmhpbnQtcm93IHtcclxuICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICAgIGNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNzgpO1xyXG4gICAgZm9udC1zaXplOiAxMnB4O1xyXG4gICAgdXNlci1zZWxlY3Q6IG5vbmU7XHJcbiAgICB0ZXh0LXNoYWRvdzogMCAxcHggMnB4IHJnYmEoMCwgMCwgMCwgMC40KTtcclxuICB9XHJcbiAgLmtiZCB7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XHJcbiAgICBwYWRkaW5nOiAxcHggNnB4O1xyXG4gICAgbWFyZ2luOiAwIDNweDtcclxuICAgIGJvcmRlci1yYWRpdXM6IDNweDtcclxuICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCk7XHJcbiAgICBmb250LWZhbWlseTogdWktbW9ub3NwYWNlLCBTRk1vbm8tUmVndWxhciwgTWVubG8sIENvbnNvbGFzLCBtb25vc3BhY2U7XHJcbiAgICBmb250LXNpemU6IDExcHg7XHJcbiAgfVxyXG4gIC5wYW5lbCB7IHBvc2l0aW9uOiByZWxhdGl2ZTsgfVxyXG4gIC5zZXR0aW5ncy1jb3JuZXItYnRuIHtcclxuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgIGJvdHRvbTogNXB4O1xyXG4gICAgcmlnaHQ6IDVweDtcclxuICAgIHdpZHRoOiAyNHB4O1xyXG4gICAgaGVpZ2h0OiAyNHB4O1xyXG4gICAgcGFkZGluZzogMDtcclxuICAgIGJvcmRlcjogbm9uZTtcclxuICAgIGJvcmRlci1yYWRpdXM6IDUwJTtcclxuICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xyXG4gICAgY29sb3I6ICNiYmI7XHJcbiAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcclxuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcclxuICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgIHRyYW5zaXRpb246IGNvbG9yIDE1MG1zIGVhc2UsIGJhY2tncm91bmQgMTUwbXMgZWFzZSwgdHJhbnNmb3JtIDE1MG1zIGVhc2U7XHJcbiAgfVxyXG4gIC5zZXR0aW5ncy1jb3JuZXItYnRuOmhvdmVyIHtcclxuICAgIGNvbG9yOiAjNTU1O1xyXG4gICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjA2KTtcclxuICAgIHRyYW5zZm9ybTogcm90YXRlKDMwZGVnKTtcclxuICB9XHJcbiAgLnNldHRpbmdzLWNvcm5lci1idG4gc3ZnIHtcclxuICAgIHdpZHRoOiAxM3B4O1xyXG4gICAgaGVpZ2h0OiAxM3B4O1xyXG4gICAgZGlzcGxheTogYmxvY2s7XHJcbiAgICBmbGV4LXNocmluazogMDtcclxuICB9XHJcbmA7XHJcbmV4cG9ydCBjb25zdCBPVkVSTEFZX1NUWUxFUyA9IEJBU0UgKyBQSUNLRVI7XHJcbiIsICJleHBvcnQgY29uc3QgRlJBTUVfVE9HR0xFX01FU1NBR0UgPSBcIl9fUVNIT1RfRlJBTUVfVE9HR0xFX19cIjtcclxuZXhwb3J0IGNvbnN0IE1BSU5fSE9US0VZX0ZJUkUgPSBcIl9fUVNIT1RfSE9US0VZX0ZJUkVfX1wiO1xyXG5leHBvcnQgY29uc3QgTUFJTl9IT1RLRVlfRVNDID0gXCJfX1FTSE9UX0hPVEtFWV9FU0NfX1wiO1xyXG5leHBvcnQgY29uc3QgTUFJTl9IT1RLRVlfQ09ORklHID0gXCJfX1FTSE9UX0hPVEtFWV9DT05GSUdfX1wiO1xyXG5cclxuZXhwb3J0IGNvbnN0IFJBTkRPTV9RVUVTVElPTlNfRklMRVMgPSB7XHJcbiAgemg6IFwiY29uZmlnL3JhbmRvbS1xdWVzdGlvbnMvemgtQ04udHh0XCIsXHJcbiAgZW46IFwiY29uZmlnL3JhbmRvbS1xdWVzdGlvbnMvZW4udHh0XCIsXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgTE9HT19VUkwgPSBjaHJvbWUucnVudGltZS5nZXRVUkwoXCJwb3B1cC9sb2dvLnN2Z1wiKTtcclxuXHJcbmV4cG9ydCBjb25zdCBESUNFX1NWRyA9IGA8c3ZnIHZpZXdCb3g9XCIwIDAgMTAyNCAxMDI0XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPjxwYXRoIGQ9XCJNODE3LjQ5MzMzMyAzMTAuOTk3MzMzTDUzMy4zMzMzMzMgMTQ2Ljk0NGE0Mi42NjY2NjcgNDIuNjY2NjY3IDAgMCAwLTQyLjY2NjY2NiAwTDIwNi41MDY2NjcgMzEwLjk5NzMzM2E0Mi42NjY2NjcgNDIuNjY2NjY3IDAgMCAwLTIxLjMzMzMzNCAzNi45NDkzMzR2MzI4LjEwNjY2NmE0Mi42NjY2NjcgNDIuNjY2NjY3IDAgMCAwIDIxLjMzMzMzNCAzNi45OTJsMjg0LjE2IDE2NC4wNTMzMzRhNDIuNjY2NjY3IDQyLjY2NjY2NyAwIDAgMCA0Mi42NjY2NjYgMGwyODQuMTYtMTY0LjA1MzMzNGE0Mi42NjY2NjcgNDIuNjY2NjY3IDAgMCAwIDIxLjMzMzMzNC0zNi45OTJ2LTMyOC4xMDY2NjZhNDIuNjY2NjY3IDQyLjY2NjY2NyAwIDAgMC0yMS4zMzMzMzQtMzYuOTQ5MzM0ek01NTQuNjY2NjY3IDEwOS45OTQ2NjdsMjg0LjE2IDE2NC4wNTMzMzNhODUuMzMzMzMzIDg1LjMzMzMzMyAwIDAgMSA0Mi42NjY2NjYgNzMuODk4NjY3djMyOC4xMDY2NjZhODUuMzMzMzMzIDg1LjMzMzMzMyAwIDAgMS00Mi42NjY2NjYgNzMuODk4NjY3TDU1NC42NjY2NjcgOTE0LjA5MDY2N2E4NS4zMzMzMzMgODUuMzMzMzMzIDAgMCAxLTg1LjMzMzMzNCAwbC0yODQuMTYtMTY0LjA1MzMzNGE4NS4zMzMzMzMgODUuMzMzMzMzIDAgMCAxLTQyLjY2NjY2Ni03My44OTg2NjZWMzQ3LjkwNGE4NS4zMzMzMzMgODUuMzMzMzMzIDAgMCAxIDQyLjY2NjY2Ni03My44OTg2NjdMNDY5LjMzMzMzMyAxMDkuOTk0NjY3YTg1LjMzMzMzMyA4NS4zMzMzMzMgMCAwIDEgODUuMzMzMzM0IDB6XCIvPjxwYXRoIGQ9XCJNNDkwLjY2NjY2NyA1MjQuNTAxMzMzTDE2MC4yMTMzMzMgMzM4LjYwMjY2N2wyMC45MDY2NjctMzcuMjA1MzM0TDUxMiA0ODcuNTUybDMzMC44OC0xODYuMTU0NjY3IDIwLjkwNjY2NyAzNy4yMDUzMzQtMzMwLjQ1MzMzNCAxODUuODk4NjY2Vjg5NmgtNDIuNjY2NjY2di0zNzEuNDk4NjY3elwiLz48cGF0aCBkPVwiTTQ2OS4zMzMzMzMgMjk4LjY2NjY2N2E0Mi42NjY2NjcgNDIuNjY2NjY3IDAgMSAwIDg1LjMzMzMzNCAwIDQyLjY2NjY2NyA0Mi42NjY2NjcgMCAwIDAtODUuMzMzMzM0IDB6TTM0Ny44NjEzMzMgNjMzLjk0MTMzM2EzMi43MjUzMzMgMzIuNzI1MzMzIDAgMSAxLTMyLjcyNTMzMy01Ni42NjEzMzMgMzIuNzI1MzMzIDMyLjcyNTMzMyAwIDAgMSAzMi43MjUzMzMgNTYuNjYxMzMzek0yODYuNzIgNTM1LjI5NmEzMi42ODI2NjcgMzIuNjgyNjY3IDAgMSAxLTMyLjY4MjY2Ny01Ni41MzMzMzMgMzIuNjgyNjY3IDMyLjY4MjY2NyAwIDAgMSAzMi42ODI2NjcgNTYuNTMzMzMzek00MTQuNzIgNzI3LjI5NmEzMi42ODI2NjcgMzIuNjgyNjY3IDAgMSAxLTMyLjY4MjY2Ny01Ni41MzMzMzMgMzIuNjgyNjY3IDMyLjY4MjY2NyAwIDAgMSAzMi42ODI2NjcgNTYuNTMzMzMzek03MTIuMzIgNTU4Ljg5MDY2N2EzMi43MjUzMzMgMzIuNzI1MzMzIDAgMSAwIDMyLjY4MjY2Ny01Ni42NjEzMzQgMzIuNzI1MzMzIDMyLjcyNTMzMyAwIDAgMC0zMi42ODI2NjcgNTYuNjYxMzM0ek02MjUuNjIxMzMzIDcwOS4wMzQ2NjdhMzIuNjgyNjY3IDMyLjY4MjY2NyAwIDEgMCAzMi42ODI2NjctNTYuNjE4NjY3IDMyLjY4MjY2NyAzMi42ODI2NjcgMCAwIDAtMzIuNjgyNjY3IDU2LjYxODY2N3pcIi8+PC9zdmc+YDtcclxuXHJcbmV4cG9ydCBjb25zdCBTUEFSS0xFX1NWRyA9IGA8c3ZnIHZpZXdCb3g9XCIwIDAgMTAyNCAxMDI0XCIgeG1sbnM9XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiPjxwYXRoIGQ9XCJNODU1LjA3MTYwNSAzMzkuNDk5NDMxbC0xMC4yMTY0MTggMjYuOTM0MTkzYy03LjQzMDEyMiAxOS43MTg0MDEtMzEuMDc3OTE1IDE5LjcxODQwMS0zOC41MDgwMzcgMGwtMTAuMTQ0OTc1LTI2LjkzNDE5M2MtMTguMTQ2NjQ1LTQ4LjAxMDAyMS01MC43MjQ4NzMtODYuMzAzNzI3LTkxLjQ0NzY1OC0xMDcuMTY1MjI0bC0zMS40MzUxMzItMTYuMTQ2MjI3Yy0xNi44NjA2NjItOC43MTYxMDUtMTYuODYwNjYyLTM3LjE1MDYxMSAwLTQ1Ljg2NjcxN2wyOS42NDkwNDUtMTUuMjE3NDYxYzQxLjcyMjk5NC0yMS40MzMwNDUgNzUuMDE1NjU3LTYxLjA4NDE3OCA5Mi44MDUwODQtMTEwLjczNzM5OWwxMC40MzA3NDktMjkuMTQ4OTQxYzcuMjg3MjM1LTIwLjI4OTk0OSAzMS41MDY1NzYtMjAuMjg5OTQ5IDM4Ljc5MzgxMSAwbDEwLjQzMDc0OSAyOS4xNDg5NDFjMTcuODYwODcxIDQ5LjY1MzIyMSA1MS4wODIwOSA4OS4zMDQzNTQgOTIuODc2NTI4IDExMC43MzczOTlsMjkuNTc3NjAyIDE1LjIxNzQ2MWMxNi45MzIxMDUgOC43MTYxMDUgMTYuOTMyMTA1IDM3LjE1MDYxMSAwIDQ1Ljg2NjcxN2wtMzEuMzYzNjg5IDE2LjA3NDc4M2MtNDAuNzIyNzg1IDIwLjkzMjk0MS03My4zNzI0NTcgNTkuMjI2NjQ3LTkxLjQ0NzY1OSAxMDcuMjM2NjY4ek00MTMuMjY1MTA2IDk1LjIzNDE2M2gxNjQuODkxNTU5djk1LjMwNTYwNkg0MTMuMjY1MTA2Yy0xMzYuNjcxMzgzIDAtMjQ3LjQ4MDIyNSAxMjcuODgzODM1LTI0Ny40ODAyMjUgMjg1Ljc3MzkzMiAwIDE3MS44OTMwMiAxMDEuNTkyNjMzIDI4NC4xMzA3MzIgMzI5LjkyNjAwNSA0MDMuODcwMDF2LTExOC4wOTYwNzhoODIuNDQ1Nzc5YzEzNi42NzEzODMgMCAyNDcuNDgwMjI1LTEyNy45NTUyNzggMjQ3LjQ4MDIyNS0yODUuNzczOTMyaDgyLjQ0NTc4YzAgMjEwLjQwMTA1Ny0xNDcuNjczNjc5IDM4MS4wMDgwOTUtMzI5LjkyNjAwNSAzODEuMDA4MDk1djE2Ni42Nzc2NDZDMzcxLjk3MDc3MyA5MjguNzY1Mjc5IDgzLjMzOTEwMiA3ODUuODc4MzEzIDgzLjMzOTEwMiA0NzYuMzEzNzAxIDgzLjMzOTEwMiAyNjUuNzY5NzU3IDIzMS4wMTI3ODEgOTUuMjM0MTYzIDQxMy4yNjUxMDYgOTUuMjM0MTYzelwiLz48L3N2Zz5gO1xyXG5cclxuZXhwb3J0IHsgT1ZFUkxBWV9TVFlMRVMgfSBmcm9tIFwiLi9zdHlsZXMuanNcIjtcclxuIiwgImltcG9ydCB7IHN0YXRlLCB0LCBub3JtYWxpemVTaXRlSG9tZVVybCB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyR3JvdXBzSWZPcGVuKCkge1xyXG4gIGlmICghc3RhdGUuc2hhZG93Um9vdCkgcmV0dXJuO1xyXG4gIGNvbnN0IGNvbnRhaW5lciA9IHN0YXRlLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcihcIi5ncm91cHNcIik7XHJcbiAgaWYgKCFjb250YWluZXIpIHJldHVybjtcclxuICBjb250YWluZXIuaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgc3RhdGUuZ3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XHJcbiAgICBjb25zdCBncm91cFNpdGVzID0gZ2V0R3JvdXBTaXRlcyhncm91cCk7XHJcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gICAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgYnRuLmNsYXNzTmFtZSA9IFwiZ3JvdXAtYnRuXCI7XHJcbiAgICBidG4udGV4dENvbnRlbnQgPSBncm91cC5uYW1lIHx8IHQoXCJvdmVybGF5X3VubmFtZWRTZWFyY2hHcm91cFwiLCBudWxsLCBcIuacquWRveWQjeaQnOe0oue7hFwiKTtcclxuICAgIGlmIChncm91cFNpdGVzLmxlbmd0aCkge1xyXG4gICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4gc2hvd0dyb3VwVG9vbHRpcChidG4sIGdyb3VwU2l0ZXMpKTtcclxuICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHNjaGVkdWxlSGlkZUdyb3VwVG9vbHRpcCgpKTtcclxuICAgIH1cclxuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBoaWRlR3JvdXBUb29sdGlwKCk7XHJcbiAgICAgIHJ1bkdyb3VwKGdyb3VwKTtcclxuICAgIH0pO1xyXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKGJ0bik7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEdyb3VwU2l0ZXMoZ3JvdXApIHtcclxuICByZXR1cm4gKGdyb3VwPy5zaXRlSWRzIHx8IFtdKVxyXG4gICAgLm1hcCgoaWQpID0+IHN0YXRlLmFsbFNpdGVzLmZpbmQoKHNpdGUpID0+IHNpdGUuaWQgPT09IGlkKSlcclxuICAgIC5maWx0ZXIoKHNpdGUpID0+IHNpdGUgJiYgbm9ybWFsaXplU2l0ZUhvbWVVcmwoc2l0ZS51cmwpKVxyXG4gICAgLm1hcCgoc2l0ZSkgPT4gKHtcclxuICAgICAgaWQ6IHNpdGUuaWQsXHJcbiAgICAgIG5hbWU6IHNpdGUubmFtZSB8fCBzaXRlLmlkLFxyXG4gICAgICB1cmw6IG5vcm1hbGl6ZVNpdGVIb21lVXJsKHNpdGUudXJsKSxcclxuICAgIH0pKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0R3JvdXBUb29sdGlwRWwoKSB7XHJcbiAgcmV0dXJuIHN0YXRlLnNoYWRvd1Jvb3Q/LnF1ZXJ5U2VsZWN0b3IoXCIuZ3JvdXAtdG9vbHRpcFwiKSB8fCBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG93R3JvdXBUb29sdGlwKGJ1dHRvbiwgc2l0ZXMpIHtcclxuICBpZiAoIXN0YXRlLnNoYWRvd1Jvb3QpIHJldHVybjtcclxuICBpZiAoc3RhdGUuZ3JvdXBUb29sdGlwVGltZXIpIHtcclxuICAgIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBUaW1lcik7XHJcbiAgICBzdGF0ZS5ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpIHtcclxuICAgIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpO1xyXG4gICAgc3RhdGUuZ3JvdXBUb29sdGlwSGlkZVRpbWVyID0gbnVsbDtcclxuICB9XHJcblxyXG4gIHN0YXRlLmdyb3VwVG9vbHRpcFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICBjb25zdCB0b29sdGlwID0gZ2V0R3JvdXBUb29sdGlwRWwoKTtcclxuICAgIGNvbnN0IHBhbmVsID0gc3RhdGUuc2hhZG93Um9vdD8ucXVlcnlTZWxlY3RvcihcIi5wYW5lbFwiKTtcclxuICAgIGlmICghKHRvb2x0aXAgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgfHwgIShwYW5lbCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSkgcmV0dXJuO1xyXG5cclxuICAgIHJlbmRlckdyb3VwVG9vbHRpcFNpdGVzKHRvb2x0aXAsIHNpdGVzKTtcclxuICAgIHRvb2x0aXAuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGJ0blJlY3QgPSBidXR0b24uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIGNvbnN0IHBhbmVsUmVjdCA9IHBhbmVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICBjb25zdCB0b29sdGlwVyA9IHRvb2x0aXAub2Zmc2V0V2lkdGg7XHJcbiAgICAgIGNvbnN0IHRvb2x0aXBIID0gdG9vbHRpcC5vZmZzZXRIZWlnaHQ7XHJcbiAgICAgIGxldCBsZWZ0ID0gYnRuUmVjdC5sZWZ0IC0gcGFuZWxSZWN0LmxlZnQgKyBidG5SZWN0LndpZHRoIC8gMiAtIHRvb2x0aXBXIC8gMjtcclxuICAgICAgaWYgKGxlZnQgPCAwKSBsZWZ0ID0gMDtcclxuICAgICAgaWYgKGxlZnQgKyB0b29sdGlwVyA+IHBhbmVsUmVjdC53aWR0aCkgbGVmdCA9IE1hdGgubWF4KDAsIHBhbmVsUmVjdC53aWR0aCAtIHRvb2x0aXBXKTtcclxuICAgICAgbGV0IHRvcCA9IGJ0blJlY3QudG9wIC0gcGFuZWxSZWN0LnRvcCAtIHRvb2x0aXBIIC0gODtcclxuICAgICAgaWYgKHRvcCA8IDApIHRvcCA9IGJ0blJlY3QuYm90dG9tIC0gcGFuZWxSZWN0LnRvcCArIDg7XHJcbiAgICAgIHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xyXG4gICAgICB0b29sdGlwLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XHJcbiAgICB9KTtcclxuICB9LCA0NTApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaGlkZUdyb3VwVG9vbHRpcCgpIHtcclxuICBpZiAoc3RhdGUuZ3JvdXBUb29sdGlwVGltZXIpIHtcclxuICAgIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBUaW1lcik7XHJcbiAgICBzdGF0ZS5ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpIHtcclxuICAgIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpO1xyXG4gICAgc3RhdGUuZ3JvdXBUb29sdGlwSGlkZVRpbWVyID0gbnVsbDtcclxuICB9XHJcbiAgY29uc3QgdG9vbHRpcCA9IGdldEdyb3VwVG9vbHRpcEVsKCk7XHJcbiAgaWYgKHRvb2x0aXAgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgdG9vbHRpcC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNjaGVkdWxlSGlkZUdyb3VwVG9vbHRpcCgpIHtcclxuICBpZiAoc3RhdGUuZ3JvdXBUb29sdGlwVGltZXIpIHtcclxuICAgIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBUaW1lcik7XHJcbiAgICBzdGF0ZS5ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpO1xyXG4gIHN0YXRlLmdyb3VwVG9vbHRpcEhpZGVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgY29uc3QgdG9vbHRpcCA9IGdldEdyb3VwVG9vbHRpcEVsKCk7XHJcbiAgICBpZiAodG9vbHRpcCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB0b29sdGlwLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICB9LCAxODApO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJHcm91cFRvb2x0aXBTaXRlcyh0b29sdGlwLCBzaXRlcykge1xyXG4gIHRvb2x0aXAuaW5uZXJIVE1MID0gXCJcIjtcclxuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsaXN0LmNsYXNzTmFtZSA9IFwiZ3JvdXAtdG9vbHRpcC1saXN0XCI7XHJcbiAgbGlzdC5zdHlsZS5ncmlkVGVtcGxhdGVDb2x1bW5zID0gYHJlcGVhdCgke01hdGgubWluKDUsIE1hdGgubWF4KDEsIHNpdGVzLmxlbmd0aCkpfSwgbWF4LWNvbnRlbnQpYDtcclxuICBzaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGl0ZW0udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgICBpdGVtLmNsYXNzTmFtZSA9IFwiZ3JvdXAtdG9vbHRpcC1pdGVtXCI7XHJcbiAgICBpdGVtLnRleHRDb250ZW50ID0gc2l0ZS5uYW1lO1xyXG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICBoaWRlR3JvdXBUb29sdGlwKCk7XHJcbiAgICAgIGF3YWl0IG9wZW5TaXRlSG9tZShzaXRlLnVybCk7XHJcbiAgICB9KTtcclxuICAgIGxpc3QuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcbiAgfSk7XHJcbiAgdG9vbHRpcC5hcHBlbmRDaGlsZChsaXN0KTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gb3BlblNpdGVIb21lKHVybCkge1xyXG4gIGNvbnN0IHNhZmVVcmwgPSBub3JtYWxpemVTaXRlSG9tZVVybCh1cmwpO1xyXG4gIGlmICghc2FmZVVybCkgcmV0dXJuO1xyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiT1BFTl9FWFRFUk5BTF9VUkxcIiwgdXJsOiBzYWZlVXJsIH0pO1xyXG4gIH0gY2F0Y2ggKF9lcnIpIHtcclxuICAgIC8qIGlnbm9yZWQgKi9cclxuICB9XHJcbiAgc3RhdGUuY2xvc2VPdmVybGF5KCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5EZWZhdWx0U2VhcmNoKCkge1xyXG4gIGlmICghc3RhdGUuZ3JvdXBzLmxlbmd0aCkgcmV0dXJuO1xyXG4gIGF3YWl0IHJ1bkdyb3VwKHN0YXRlLmdyb3Vwc1swXSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJ1bkdyb3VwKGdyb3VwKSB7XHJcbiAgaWYgKCFzdGF0ZS5zaGFkb3dSb290KSByZXR1cm47XHJcbiAgY29uc3QgcXVlcnlJbnB1dCA9IHN0YXRlLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcihcIi5xdWVyeS1pbnB1dFwiKTtcclxuICBjb25zdCBxdWVyeSA9IHF1ZXJ5SW5wdXQgaW5zdGFuY2VvZiBIVE1MVGV4dEFyZWFFbGVtZW50ID8gcXVlcnlJbnB1dC52YWx1ZS50cmltKCkgOiBcIlwiO1xyXG4gIHRyeSB7XHJcbiAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiUlVOX1NFQVJDSF9HUk9VUFwiLCBncm91cCwgcXVlcnkgfSk7XHJcbiAgfSBjYXRjaCAoX2Vycikge1xyXG4gICAgLyogaWdub3JlZCAqL1xyXG4gIH1cclxuICBzdGF0ZS5jbG9zZU92ZXJsYXkoKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc3RhdGUsIHQsIGZvcm1hdEhpc3RvcnlEYXRlIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVkgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckhpc3RvcnlJZk9wZW4oKSB7XHJcbiAgaWYgKCFzdGF0ZS5zaGFkb3dSb290KSByZXR1cm47XHJcbiAgY29uc3QgaGlzdG9yeUxpc3QgPSBzdGF0ZS5zaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3IoXCIuaGlzdG9yeS1saXN0XCIpO1xyXG4gIGlmICghKGhpc3RvcnlMaXN0IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSByZXR1cm47XHJcblxyXG4gIGhpc3RvcnlMaXN0LmlubmVySFRNTCA9IFwiXCI7XHJcblxyXG4gIGlmICghc3RhdGUuaGlzdG9yeUVudHJpZXMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbXB0eS5jbGFzc05hbWUgPSBcImhpc3RvcnktZW1wdHlcIjtcclxuICAgIGVtcHR5LnRleHRDb250ZW50ID0gdChcIm92ZXJsYXlfZW1wdHlIaXN0b3J5XCIsIG51bGwsIFwi5pqC5peg5pCc57Si6K6w5b2VXCIpO1xyXG4gICAgaGlzdG9yeUxpc3QuYXBwZW5kQ2hpbGQoZW1wdHkpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgc3RhdGUuaGlzdG9yeUVudHJpZXMuZm9yRWFjaCgoZW50cnkpID0+IHtcclxuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gICAgaXRlbS50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGl0ZW0uY2xhc3NOYW1lID0gXCJoaXN0b3J5LWl0ZW1cIjtcclxuXHJcbiAgICBjb25zdCBsaW5lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGxpbmUuY2xhc3NOYW1lID0gXCJoaXN0b3J5LWxpbmVcIjtcclxuXHJcbiAgICBjb25zdCBxdWVyeSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBxdWVyeS5jbGFzc05hbWUgPSBcImhpc3RvcnktcXVlcnlcIjtcclxuICAgIHF1ZXJ5LnRleHRDb250ZW50ID0gU3RyaW5nKGVudHJ5Py5xdWVyeSB8fCBcIlwiKS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKS50cmltKCk7XHJcblxyXG4gICAgY29uc3QgbWV0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBtZXRhLmNsYXNzTmFtZSA9IFwiaGlzdG9yeS1tZXRhXCI7XHJcbiAgICBtZXRhLnRleHRDb250ZW50ID0gZm9ybWF0SGlzdG9yeURhdGUoZW50cnk/LmNyZWF0ZWRBdCk7XHJcblxyXG4gICAgY29uc3QgZGVsZXRlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGRlbGV0ZUJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGRlbGV0ZUJ0bi5jbGFzc05hbWUgPSBcImhpc3RvcnktZGVsZXRlLWJ0blwiO1xyXG4gICAgZGVsZXRlQnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgdChcIm92ZXJsYXlfZGVsZXRlSGlzdG9yeUVudHJ5XCIsIG51bGwsIFwi5Yig6Zmk6L+Z5p2h6K6w5b2VXCIpKTtcclxuICAgIGRlbGV0ZUJ0bi50ZXh0Q29udGVudCA9IFwiw5dcIjtcclxuICAgIGRlbGV0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICBhd2FpdCByZW1vdmVIaXN0b3J5RW50cnkoZW50cnkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgbGluZS5hcHBlbmRDaGlsZChxdWVyeSk7XHJcbiAgICBsaW5lLmFwcGVuZENoaWxkKG1ldGEpO1xyXG4gICAgaXRlbS5hcHBlbmRDaGlsZChsaW5lKTtcclxuICAgIGl0ZW0uYXBwZW5kQ2hpbGQoZGVsZXRlQnRuKTtcclxuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgY29uc3QgcXVlcnlJbnB1dCA9IHN0YXRlLnNoYWRvd1Jvb3Q/LnF1ZXJ5U2VsZWN0b3IoXCIucXVlcnktaW5wdXRcIik7XHJcbiAgICAgIGlmIChxdWVyeUlucHV0IGluc3RhbmNlb2YgSFRNTFRleHRBcmVhRWxlbWVudCkge1xyXG4gICAgICAgIHF1ZXJ5SW5wdXQudmFsdWUgPSBlbnRyeT8ucXVlcnkgfHwgXCJcIjtcclxuICAgICAgICAvLyBzeW5jQ29tcG9zZXJMYXlvdXQgaXMgY2FsbGVkIGJ5IG1haW4gdmlhIGlucHV0IGV2ZW50IHN1YnNjcmlwdGlvbjtcclxuICAgICAgICAvLyBkaXNwYXRjaCBhbiBpbnB1dCBldmVudCBzbyB0aGUgbGF5b3V0IHVwZGF0ZXMgZm9yIHRoZSBwYXN0ZWQgdGV4dC5cclxuICAgICAgICBxdWVyeUlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICAgICAgICBxdWVyeUlucHV0LmZvY3VzKCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgaGlzdG9yeUxpc3QuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlbW92ZUhpc3RvcnlFbnRyeShlbnRyeSkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1NFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZXSk7XHJcbiAgICBjb25zdCBmdWxsSGlzdG9yeSA9IEFycmF5LmlzQXJyYXkoc3RvcmVkW1NFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZXSlcclxuICAgICAgPyBzdG9yZWRbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldXHJcbiAgICAgIDogW107XHJcbiAgICBpZiAoIWZ1bGxIaXN0b3J5Lmxlbmd0aCkgcmV0dXJuO1xyXG5cclxuICAgIGxldCByZW1vdmVkID0gZmFsc2U7XHJcbiAgICBjb25zdCBuZXh0SGlzdG9yeSA9IGZ1bGxIaXN0b3J5LmZpbHRlcigoaXRlbSkgPT4ge1xyXG4gICAgICBpZiAocmVtb3ZlZCkgcmV0dXJuIHRydWU7XHJcbiAgICAgIGlmIChlbnRyeT8uaWQgJiYgaXRlbT8uaWQgPT09IGVudHJ5LmlkKSB7XHJcbiAgICAgICAgcmVtb3ZlZCA9IHRydWU7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICAgIGlmICghZW50cnk/LmlkICYmIGl0ZW0/LnF1ZXJ5ID09PSBlbnRyeT8ucXVlcnkgJiYgaXRlbT8uY3JlYXRlZEF0ID09PSBlbnRyeT8uY3JlYXRlZEF0KSB7XHJcbiAgICAgICAgcmVtb3ZlZCA9IHRydWU7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKCFyZW1vdmVkKSByZXR1cm47XHJcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldOiBuZXh0SGlzdG9yeSB9KTtcclxuICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICAvKiBpZ25vcmVkICovXHJcbiAgfVxyXG59XHJcbiIsICJpbXBvcnQgeyBERUZBVUxUX1BST01QVF9HUk9VUF9JRCB9IGZyb20gXCIuL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5cclxuZnVuY3Rpb24gaTE4bihrZXkpIHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIGNocm9tZT8uaTE4bj8uZ2V0TWVzc2FnZT8uKGtleSkgfHwgd2luZG93Ll9fUVNIT1RfSTE4Tl9fPy50Py4oa2V5KSB8fCBcIlwiO1xyXG4gIH0gY2F0Y2ggKF9lKSB7XHJcbiAgICByZXR1cm4gXCJcIjtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxQcm9tcHRHcm91cE5hbWUoKSB7XHJcbiAgcmV0dXJuIGkxOG4oXCJzZXR0aW5nc19wcm9tcHRzX2FsbEdyb3VwXCIpIHx8IFwi5YWo6YOoXCI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0FsbFByb21wdEdyb3VwKGdyb3VwKSB7XHJcbiAgcmV0dXJuICEhZ3JvdXAgJiYgZ3JvdXAuaWQgPT09IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvbXB0R3JvdXBEaXNwbGF5TmFtZShncm91cCkge1xyXG4gIGlmIChpc0FsbFByb21wdEdyb3VwKGdyb3VwKSkgcmV0dXJuIGdldEFsbFByb21wdEdyb3VwTmFtZSgpO1xyXG4gIHJldHVybiBncm91cD8ubmFtZSB8fCBpMThuKFwib3ZlcmxheV91bm5hbWVkUHJvbXB0R3JvdXBcIikgfHwgXCLmnKrlkb3lkI3liIbnu4RcIjtcclxufVxyXG5cclxuLy8gRmxhdHRlbnMgYSBncm91cCdzIHByb21wdCBsaXN0IGZvciBkaXNwbGF5LiBXaGVuIHRoZSBncm91cCBpcyB0aGUgdmlydHVhbFxyXG4vLyBcIkFsbFwiIGdyb3VwLCB1bmlvbnMgcHJvbXB0cyBhY3Jvc3MgZXZlcnkgcmVhbCBncm91cCB3aGlsZSByZW1lbWJlcmluZyB0aGVcclxuLy8gc291cmNlIGdyb3VwIG9uIGVhY2ggZW50cnkuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXREaXNwbGF5UHJvbXB0RW50cmllcyhncm91cCwgYWxsR3JvdXBzKSB7XHJcbiAgaWYgKCFncm91cCkgcmV0dXJuIFtdO1xyXG4gIGlmIChpc0FsbFByb21wdEdyb3VwKGdyb3VwKSkge1xyXG4gICAgY29uc3Qgb3V0ID0gW107XHJcbiAgICAoYWxsR3JvdXBzIHx8IFtdKS5mb3JFYWNoKChnKSA9PiB7XHJcbiAgICAgIChnLnByb21wdHMgfHwgW10pLmZvckVhY2goKHByb21wdCkgPT4gb3V0LnB1c2goeyBwcm9tcHQsIHNvdXJjZUdyb3VwOiBnIH0pKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIG91dDtcclxuICB9XHJcbiAgcmV0dXJuIChncm91cC5wcm9tcHRzIHx8IFtdKS5tYXAoKHByb21wdCkgPT4gKHsgcHJvbXB0LCBzb3VyY2VHcm91cDogZ3JvdXAgfSkpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzdGF0ZSwgdCB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IGdldFByb21wdEdyb3VwRGlzcGxheU5hbWUsIGdldERpc3BsYXlQcm9tcHRFbnRyaWVzIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9wcm9tcHQtZ3JvdXBzLmpzXCI7XHJcbmltcG9ydCB7IFJBTkRPTV9RVUVTVElPTlNfRklMRVMgfSBmcm9tIFwiLi9jb25zdGFudHMuanNcIjtcclxuaW1wb3J0IHsgUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcblxyXG5sZXQgcmFuZG9tUXVlc3Rpb25zUHJvbWlzZSA9IG51bGw7XHJcbmxldCBsYXN0UmFuZG9tUXVlc3Rpb25JbmRleCA9IC0xO1xyXG5cclxuLy8gUmVzZXQgY2FjaGUgd2hlbiB1c2VyIGVkaXRzIHRoZSByYW5kb20tcXVlc3Rpb25zIHRleHQgaW4gU2V0dGluZ3MuXHJcbnRyeSB7XHJcbiAgY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhTmFtZSkgPT4ge1xyXG4gICAgaWYgKGFyZWFOYW1lID09PSBcImxvY2FsXCIgJiYgY2hhbmdlc1tSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZXSkge1xyXG4gICAgICByYW5kb21RdWVzdGlvbnNQcm9taXNlID0gbnVsbDtcclxuICAgICAgbGFzdFJhbmRvbVF1ZXN0aW9uSW5kZXggPSAtMTtcclxuICAgIH1cclxuICB9KTtcclxufSBjYXRjaCAoX2UpIHtcclxuICAvKiBjaHJvbWUuc3RvcmFnZSBtYXkgYmUgdW5hdmFpbGFibGUgaW4gc29tZSBzdWItZnJhbWVzICovXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlUmFuZG9tUXVlc3Rpb25zVGV4dCh0ZXh0KSB7XHJcbiAgaWYgKHR5cGVvZiB0ZXh0ICE9PSBcInN0cmluZ1wiKSByZXR1cm4gW107XHJcbiAgcmV0dXJuIHRleHRcclxuICAgIC5zcGxpdCgvXFxyP1xcbi8pXHJcbiAgICAubWFwKChsaW5lKSA9PiBsaW5lLnRyaW0oKSlcclxuICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUgJiYgIWxpbmUuc3RhcnRzV2l0aChcIiNcIikpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBmZXRjaERlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0KCkge1xyXG4gIGNvbnN0IGxhbmcgPSAoKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2hyb21lTGFuZyA9IChjaHJvbWU/LmkxOG4/LmdldFVJTGFuZ3VhZ2U/LigpIHx8IFwiXCIpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgIGlmIChjaHJvbWVMYW5nKSByZXR1cm4gY2hyb21lTGFuZztcclxuICAgICAgY29uc3QgbmF2TGFuZyA9IChuYXZpZ2F0b3I/Lmxhbmd1YWdlIHx8IFwiXCIpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgIHJldHVybiBuYXZMYW5nIHx8IFwiXCI7XHJcbiAgICB9IGNhdGNoIChfZSkge1xyXG4gICAgICByZXR1cm4gKG5hdmlnYXRvci5sYW5ndWFnZSB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgfVxyXG4gIH0pKCk7XHJcbiAgY29uc3QgcGF0aCA9IGxhbmcuc3RhcnRzV2l0aChcInpoXCIpID8gUkFORE9NX1FVRVNUSU9OU19GSUxFUy56aCA6IFJBTkRPTV9RVUVTVElPTlNfRklMRVMuZW47XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGNocm9tZS5ydW50aW1lLmdldFVSTChwYXRoKSk7XHJcbiAgICByZXR1cm4gcmVzLm9rID8gYXdhaXQgcmVzLnRleHQoKSA6IFwiXCI7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZFJhbmRvbVF1ZXN0aW9ucygpIHtcclxuICBpZiAocmFuZG9tUXVlc3Rpb25zUHJvbWlzZSkgcmV0dXJuIHJhbmRvbVF1ZXN0aW9uc1Byb21pc2U7XHJcbiAgcmFuZG9tUXVlc3Rpb25zUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XHJcbiAgICBjb25zdCB1aUxhbmcgPSAoKCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHJldHVybiAoY2hyb21lPy5pMThuPy5nZXRVSUxhbmd1YWdlPy4oKSB8fCBuYXZpZ2F0b3IubGFuZ3VhZ2UgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICAgICAgfSBjYXRjaCAoX2UpIHtcclxuICAgICAgICByZXR1cm4gKG5hdmlnYXRvci5sYW5ndWFnZSB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICB9XHJcbiAgICB9KSgpO1xyXG4gICAgY29uc3QgY3VycmVudERlZmF1bHRUZXh0ID0gYXdhaXQgZmV0Y2hEZWZhdWx0UmFuZG9tUXVlc3Rpb25zVGV4dCgpO1xyXG4gICAgY29uc3Qgb3RoZXJQYXRoID0gdWlMYW5nLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFJBTkRPTV9RVUVTVElPTlNfRklMRVMuZW4gOiBSQU5ET01fUVVFU1RJT05TX0ZJTEVTLnpoO1xyXG4gICAgbGV0IG90aGVyRGVmYXVsdFRleHQgPSBcIlwiO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKG90aGVyUGF0aCkpO1xyXG4gICAgICBvdGhlckRlZmF1bHRUZXh0ID0gcmVzLm9rID8gYXdhaXQgcmVzLnRleHQoKSA6IFwiXCI7XHJcbiAgICB9IGNhdGNoIChfZSkge1xyXG4gICAgICBvdGhlckRlZmF1bHRUZXh0ID0gXCJcIjtcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWV0pO1xyXG4gICAgICBjb25zdCByYXcgPSBzdG9yZWRbUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWV07XHJcbiAgICAgIC8vIExlZ2FjeSBkZWZhdWx0IGNvbnRlbnQgc3RhcnRzIHdpdGggYSAjIGNvbW1lbnQgYmxvY2s7IHRyZWF0IGFzIFwibm90XHJcbiAgICAgIC8vIGN1c3RvbWl6ZWRcIiBhbmQgZmFsbCBiYWNrIHRvIHRoZSBidWlsdC1pbiBxdWVzdGlvbiBmaWxlLlxyXG4gICAgICBjb25zdCBpc09sZERlZmF1bHQgPSB0eXBlb2YgcmF3ID09PSBcInN0cmluZ1wiICYmIHJhdy50cmltU3RhcnQoKS5zdGFydHNXaXRoKFwiI1wiKTtcclxuICAgICAgY29uc3QgaGFzQ3VzdG9tVGV4dCA9IHR5cGVvZiByYXcgPT09IFwic3RyaW5nXCIgJiYgcmF3LnRyaW0oKS5sZW5ndGggPiAwO1xyXG4gICAgICBjb25zdCBpc090aGVyTGFuZ0RlZmF1bHQgPSBoYXNDdXN0b21UZXh0ICYmIHJhdy50cmltKCkgPT09IG90aGVyRGVmYXVsdFRleHQudHJpbSgpO1xyXG4gICAgICBpZiAoaGFzQ3VzdG9tVGV4dCAmJiAhaXNPbGREZWZhdWx0ICYmICFpc090aGVyTGFuZ0RlZmF1bHQpIHtcclxuICAgICAgICByZXR1cm4gcGFyc2VSYW5kb21RdWVzdGlvbnNUZXh0KHJhdyk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKF9lKSB7XHJcbiAgICAgIC8qIGZhbGwgYmFjayB0byBkZWZhdWx0IGZpbGUgKi9cclxuICAgIH1cclxuICAgIHJldHVybiBwYXJzZVJhbmRvbVF1ZXN0aW9uc1RleHQoY3VycmVudERlZmF1bHRUZXh0KTtcclxuICB9KSgpO1xyXG4gIHJldHVybiByYW5kb21RdWVzdGlvbnNQcm9taXNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsbFJhbmRvbVF1ZXN0aW9uKCkge1xyXG4gIGlmICghc3RhdGUuc2hhZG93Um9vdCkgcmV0dXJuO1xyXG4gIGNvbnN0IHF1ZXN0aW9ucyA9IGF3YWl0IGxvYWRSYW5kb21RdWVzdGlvbnMoKTtcclxuICBpZiAoIXF1ZXN0aW9ucy5sZW5ndGgpIHJldHVybjtcclxuICBjb25zdCBxdWVyeUlucHV0ID0gc3RhdGUuc2hhZG93Um9vdC5xdWVyeVNlbGVjdG9yKFwiLnF1ZXJ5LWlucHV0XCIpO1xyXG4gIGlmICghKHF1ZXJ5SW5wdXQgaW5zdGFuY2VvZiBIVE1MVGV4dEFyZWFFbGVtZW50KSkgcmV0dXJuO1xyXG4gIC8vIFdpdGggPj0yIHF1ZXN0aW9ucywgYXZvaWQgZHJhd2luZyB0aGUgc2FtZSBvbmUgdHdpY2UgaW4gYSByb3cuXHJcbiAgbGV0IGlkeCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHF1ZXN0aW9ucy5sZW5ndGgpO1xyXG4gIGlmIChxdWVzdGlvbnMubGVuZ3RoID4gMSAmJiBpZHggPT09IGxhc3RSYW5kb21RdWVzdGlvbkluZGV4KSB7XHJcbiAgICBpZHggPSAoaWR4ICsgMSArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChxdWVzdGlvbnMubGVuZ3RoIC0gMSkpKSAlIHF1ZXN0aW9ucy5sZW5ndGg7XHJcbiAgfVxyXG4gIGxhc3RSYW5kb21RdWVzdGlvbkluZGV4ID0gaWR4O1xyXG4gIHF1ZXJ5SW5wdXQudmFsdWUgPSBxdWVzdGlvbnNbaWR4XTtcclxuICBxdWVyeUlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuICBxdWVyeUlucHV0LmZvY3VzKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJQcm9tcHRQaWNrZXJJZk9wZW4oKSB7XHJcbiAgaWYgKCFzdGF0ZS5zaGFkb3dSb290KSByZXR1cm47XHJcbiAgY29uc3QgcGlja2VyID0gc3RhdGUuc2hhZG93Um9vdC5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1waWNrZXJcIik7XHJcbiAgaWYgKCFwaWNrZXIpIHJldHVybjtcclxuXHJcbiAgcGlja2VyLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgaWYgKCFzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW4gfHwgc3RhdGUudWlQcmVmcy5zaG93UHJvbXB0QnV0dG9uID09PSBmYWxzZSkge1xyXG4gICAgcGlja2VyLmhpZGRlbiA9IHRydWU7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIHBpY2tlci5oaWRkZW4gPSBmYWxzZTtcclxuXHJcbiAgaWYgKCFzdGF0ZS5wcm9tcHRHcm91cHMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbXB0eS5jbGFzc05hbWUgPSBcInByb21wdC1lbXB0eVwiO1xyXG4gICAgZW1wdHkudGV4dENvbnRlbnQgPSB0KFwib3ZlcmxheV9lbXB0eVByb21wdEdyb3Vwc1wiLCBudWxsLCBcIui/mOayoeacieaPkOekuuivjeWIhue7hO+8jOivt+WFiOWOu+iuvue9rumHjOa3u+WKoOOAglwiKTtcclxuICAgIHBpY2tlci5hcHBlbmRDaGlsZChlbXB0eSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBhY3RpdmVHcm91cCA9XHJcbiAgICBzdGF0ZS5wcm9tcHRHcm91cHMuZmluZCgoZykgPT4gZy5pZCA9PT0gc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCkgfHwgc3RhdGUucHJvbXB0R3JvdXBzWzBdO1xyXG4gIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBhY3RpdmVHcm91cC5pZDtcclxuXHJcbiAgY29uc3QgZ3JvdXBzQ29sID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBncm91cHNDb2wuY2xhc3NOYW1lID0gXCJwcm9tcHQtZ3JvdXBzLWNvbFwiO1xyXG4gIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGJ0bi5jbGFzc05hbWUgPSBgcHJvbXB0LWdyb3VwLWl0ZW0ke2dyb3VwLmlkID09PSBhY3RpdmVHcm91cC5pZCA/IFwiIGlzLWFjdGl2ZVwiIDogXCJcIn1gO1xyXG4gICAgYnRuLnRleHRDb250ZW50ID0gZ2V0UHJvbXB0R3JvdXBEaXNwbGF5TmFtZShncm91cCk7XHJcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4ge1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9PT0gZ3JvdXAuaWQpIHJldHVybjtcclxuICAgICAgc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9IGdyb3VwLmlkO1xyXG4gICAgICByZW5kZXJQcm9tcHRQaWNrZXJJZk9wZW4oKTtcclxuICAgIH0pO1xyXG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBncm91cC5pZDtcclxuICAgICAgcmVuZGVyUHJvbXB0UGlja2VySWZPcGVuKCk7XHJcbiAgICB9KTtcclxuICAgIGdyb3Vwc0NvbC5hcHBlbmRDaGlsZChidG4pO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBsaXN0Q29sID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsaXN0Q29sLmNsYXNzTmFtZSA9IFwicHJvbXB0LWxpc3QtY29sXCI7XHJcbiAgY29uc3QgZW50cmllcyA9IGdldERpc3BsYXlQcm9tcHRFbnRyaWVzKGFjdGl2ZUdyb3VwLCBzdGF0ZS5wcm9tcHRHcm91cHMpO1xyXG4gIGlmICghZW50cmllcy5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVtcHR5LmNsYXNzTmFtZSA9IFwicHJvbXB0LWVtcHR5XCI7XHJcbiAgICBlbXB0eS50ZXh0Q29udGVudCA9IHQoXCJvdmVybGF5X2VtcHR5UHJvbXB0c0luR3JvdXBcIiwgbnVsbCwgXCLov5nkuKrliIbnu4Tph4zov5jmsqHmnInmj5DnpLror43jgIJcIik7XHJcbiAgICBsaXN0Q29sLmFwcGVuZENoaWxkKGVtcHR5KTtcclxuICB9IGVsc2Uge1xyXG4gICAgZW50cmllcy5mb3JFYWNoKCh7IHByb21wdCB9KSA9PiB7XHJcbiAgICAgIGlmICghc3RhdGUub3ZlcmxheVByZXZpZXdNZ3IpIHtcclxuICAgICAgICBzdGF0ZS5vdmVybGF5UHJldmlld01nciA9IHdpbmRvdy5Qcm9tcHRJdGVtVUkuY3JlYXRlUHJldmlld01hbmFnZXIoc3RhdGUuc2hhZG93Um9vdCk7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3Qgb3ZlcmxheUl0ZW0gPSB3aW5kb3cuUHJvbXB0SXRlbVVJLmNyZWF0ZUl0ZW0ocHJvbXB0LCB7XHJcbiAgICAgICAgaXRlbUNsYXNzOiBcInByb21wdC1pdGVtXCIsXHJcbiAgICAgICAgbGFiZWxDbGFzczogXCJwcm9tcHQtaXRlbS1sYWJlbFwiLFxyXG4gICAgICAgIGljb25zQ2xhc3M6IFwicHJvbXB0LWl0ZW0taWNvbnNcIixcclxuICAgICAgICBpY29uQnRuQ2xhc3M6IFwicHJvbXB0LWljb24tYnRuXCIsXHJcbiAgICAgICAgb25GaWxsOiAocCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgcXVlcnlJbnB1dCA9IHN0YXRlLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcihcIi5xdWVyeS1pbnB1dFwiKTtcclxuICAgICAgICAgIGlmIChxdWVyeUlucHV0IGluc3RhbmNlb2YgSFRNTFRleHRBcmVhRWxlbWVudCkge1xyXG4gICAgICAgICAgICBxdWVyeUlucHV0LnZhbHVlID0gcC5jb250ZW50IHx8IFwiXCI7XHJcbiAgICAgICAgICAgIHF1ZXJ5SW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJpbnB1dFwiLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xyXG4gICAgICAgICAgICBxdWVyeUlucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW4gPSBmYWxzZTtcclxuICAgICAgICAgIGlmIChzdGF0ZS5vdmVybGF5UHJldmlld01ncikgc3RhdGUub3ZlcmxheVByZXZpZXdNZ3IuaGlkZSgpO1xyXG4gICAgICAgICAgcmVuZGVyUHJvbXB0UGlja2VySWZPcGVuKCk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBvbkVkaXQ6ICgpID0+IHtcclxuICAgICAgICAgIGNocm9tZS5ydW50aW1lXHJcbiAgICAgICAgICAgIC5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiT1BFTl9TRVRUSU5HU19QQUdFXCIsIHNlY3Rpb246IFwicHJvbXB0c1wiIH0pXHJcbiAgICAgICAgICAgIC5jYXRjaCgoKSA9PiB7fSk7XHJcbiAgICAgICAgICBzdGF0ZS5jbG9zZU92ZXJsYXkoKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHByZXZpZXdNYW5hZ2VyOiBzdGF0ZS5vdmVybGF5UHJldmlld01ncixcclxuICAgICAgfSk7XHJcbiAgICAgIGxpc3RDb2wuYXBwZW5kQ2hpbGQob3ZlcmxheUl0ZW0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBmb290ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGZvb3Rlci5jbGFzc05hbWUgPSBcInByb21wdC1waWNrZXItZm9vdGVyXCI7XHJcbiAgY29uc3QgZm9vdGVyQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBmb290ZXJCdG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgZm9vdGVyQnRuLmNsYXNzTmFtZSA9IFwicHJvbXB0LXBpY2tlci1mb290ZXItYnRuXCI7XHJcbiAgZm9vdGVyQnRuLmlubmVySFRNTCA9IGA8c3ZnIHdpZHRoPVwiMTFcIiBoZWlnaHQ9XCIxMVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuOFwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTIgMTVhMyAzIDAgMSAwIDAtNiAzIDMgMCAwIDAgMCA2WlwiLz48cGF0aCBkPVwiTTE5LjQgMTVhMS42NSAxLjY1IDAgMCAwIC4zMyAxLjgybC4wNi4wNmEyIDIgMCAwIDEtMi44MyAyLjgzbC0uMDYtLjA2YTEuNjUgMS42NSAwIDAgMC0xLjgyLS4zMyAxLjY1IDEuNjUgMCAwIDAtMSAxLjUxVjIxYTIgMiAwIDAgMS00IDB2LS4wOUExLjY1IDEuNjUgMCAwIDAgOSAxOS40YTEuNjUgMS42NSAwIDAgMC0xLjgyLjMzbC0uMDYuMDZhMiAyIDAgMCAxLTIuODMtMi44M2wuMDYtLjA2QTEuNjUgMS42NSAwIDAgMCA0LjY4IDE1YTEuNjUgMS42NSAwIDAgMC0xLjUxLTFIM2EyIDIgMCAwIDEgMC00aC4wOUExLjY1IDEuNjUgMCAwIDAgNC42IDlhMS42NSAxLjY1IDAgMCAwLS4zMy0xLjgybC0uMDYtLjA2YTIgMiAwIDAgMSAyLjgzLTIuODNsLjA2LjA2QTEuNjUgMS42NSAwIDAgMCA5IDQuNjhhMS42NSAxLjY1IDAgMCAwIDEtMS41MVYzYTIgMiAwIDAgMSA0IDB2LjA5YTEuNjUgMS42NSAwIDAgMCAxIDEuNTEgMS42NSAxLjY1IDAgMCAwIDEuODItLjMzbC4wNi0uMDZhMiAyIDAgMCAxIDIuODMgMi44M2wtLjA2LjA2QTEuNjUgMS42NSAwIDAgMCAxOS40IDlhMS42NSAxLjY1IDAgMCAwIDEuNTEgMUgyMWEyIDIgMCAwIDEgMCA0aC0uMDlhMS42NSAxLjY1IDAgMCAwLTEuNTEgMVpcIi8+PC9zdmc+JHt0KFwib3ZlcmxheV9tYW5hZ2VQcm9tcHRzXCIsIG51bGwsIFwi566h55CG5o+Q56S66K+NXCIpfWA7XHJcbiAgZm9vdGVyQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBjaHJvbWUucnVudGltZVxyXG4gICAgICAuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIk9QRU5fU0VUVElOR1NfUEFHRVwiLCBzZWN0aW9uOiBcInByb21wdHNcIiB9KVxyXG4gICAgICAuY2F0Y2goKCkgPT4ge30pO1xyXG4gICAgc3RhdGUuY2xvc2VPdmVybGF5KCk7XHJcbiAgfSk7XHJcbiAgZm9vdGVyLmFwcGVuZENoaWxkKGZvb3RlckJ0bik7XHJcblxyXG4gIHBpY2tlci5hcHBlbmRDaGlsZChncm91cHNDb2wpO1xyXG4gIHBpY2tlci5hcHBlbmRDaGlsZChsaXN0Q29sKTtcclxuICBwaWNrZXIuYXBwZW5kQ2hpbGQoZm9vdGVyKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgVUlfUFJFRlNfU1RPUkFHRV9LRVksIENVU1RPTV9TSVRFU19TVE9SQUdFX0tFWSwgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSwgU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVksIFBST01QVF9HUk9VUFNfU1RPUkFHRV9LRVkgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIHN0YXRlLFxyXG4gIHQsXHJcbiAgcmVmcmVzaEdyb3VwcyxcclxuICByZWZyZXNoQWxsU2l0ZXMsXHJcbiAgcmVmcmVzaEhpc3RvcnksXHJcbiAgcmVmcmVzaFByb21wdEdyb3VwcyxcclxuICByZWZyZXNoVWlQcmVmcyxcclxufSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIE9WRVJMQVlfU1RZTEVTLFxyXG4gIExPR09fVVJMLFxyXG4gIERJQ0VfU1ZHLFxyXG4gIFNQQVJLTEVfU1ZHLFxyXG4gIEZSQU1FX1RPR0dMRV9NRVNTQUdFLFxyXG4gIE1BSU5fSE9US0VZX0ZJUkUsXHJcbiAgTUFJTl9IT1RLRVlfRVNDLFxyXG4gIE1BSU5fSE9US0VZX0NPTkZJRyxcclxufSBmcm9tIFwiLi9jb25zdGFudHMuanNcIjtcclxuaW1wb3J0IHsgcmVuZGVyR3JvdXBzSWZPcGVuLCBoaWRlR3JvdXBUb29sdGlwLCBydW5EZWZhdWx0U2VhcmNoIH0gZnJvbSBcIi4vZ3JvdXBzLXBhbmVsLmpzXCI7XHJcbmltcG9ydCB7IHJlbmRlckhpc3RvcnlJZk9wZW4gfSBmcm9tIFwiLi9oaXN0b3J5LXBhbmVsLmpzXCI7XHJcbmltcG9ydCB7IHJlbmRlclByb21wdFBpY2tlcklmT3BlbiwgZmlsbFJhbmRvbVF1ZXN0aW9uIH0gZnJvbSBcIi4vcHJvbXB0cy1wYW5lbC5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGluaXRRc2hvdE92ZXJsYXkoKSB7XHJcbiAgaWYgKHdpbmRvdy5fX1FTSE9UX09WRVJMQVlfSU5TVEFMTEVEX18pIHJldHVybjtcclxuICB3aW5kb3cuX19RU0hPVF9PVkVSTEFZX0lOU1RBTExFRF9fID0gdHJ1ZTtcclxuXHJcbiAgc3RhdGUuY2xvc2VPdmVybGF5ID0gY2xvc2VPdmVybGF5O1xyXG5cclxuICBjb25zdCBpc1RvcEZyYW1lID0gKGZ1bmN0aW9uIGRldGVjdFRvcCgpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiB3aW5kb3cudG9wID09PSB3aW5kb3c7XHJcbiAgICB9IGNhdGNoIChfZSkge1xyXG4gICAgICAvLyBDcm9zcy1vcmlnaW4gYWNjZXNzIHRvIHdpbmRvdy50b3AgdGhyb3dzOyB0cmVhdCBhcyBub24tdG9wLlxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfSkoKTtcclxuXHJcbiAgLy8gUHJlbG9hZCBjb25maWcgYW5kIHN5bmMgaG90a2V5IHNldHRpbmdzIHRvIHRoZSBNQUlOLXdvcmxkIGxpc3RlbmVyLlxyXG4gIHJlZnJlc2hVaVByZWZzKCkudGhlbihzeW5jU2hvcnRjdXRUb01haW5Xb3JsZCkuY2F0Y2goKCkgPT4ge30pO1xyXG5cclxuICAvLyBMaXN0ZW4gZm9yOiAoMSkgTUFJTi13b3JsZCBob3RrZXkgZmlyZXMsICgyKSBjcm9zcy1mcmFtZSBmb3J3YXJkcyBzbyB0aGVcclxuICAvLyBvdmVybGF5IFVJIGFsd2F5cyByZW5kZXJzIG9ubHkgaW4gdGhlIHRvcCBmcmFtZS5cclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBpZiAoZXZlbnQuc291cmNlICE9PSB3aW5kb3cgJiYgIWlzVG9wRnJhbWUpIHJldHVybjtcclxuICAgIGNvbnN0IGRhdGEgPSBldmVudC5kYXRhO1xyXG4gICAgaWYgKCFkYXRhKSByZXR1cm47XHJcblxyXG4gICAgaWYgKGRhdGEudHlwZSA9PT0gTUFJTl9IT1RLRVlfRklSRSkge1xyXG4gICAgICBpZiAoaXNUb3BGcmFtZSkge1xyXG4gICAgICAgIHRvZ2dsZU92ZXJsYXkoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBSZXZpZXcgbm90ZSAoQ1dTL0VkZ2UgQWRkLW9ucyk6XHJcbiAgICAgICAgLy8gLSBGb3J3YXJkcyBhbiBcIm9wZW4vY2xvc2Ugb3ZlcmxheVwiIHNpZ25hbCBiZXR3ZWVuIGZyYW1lcyBpbiB0aGUgc2FtZSB0YWIuXHJcbiAgICAgICAgLy8gLSBEb2VzIE5PVCBpbmNsdWRlIHVzZXIgaW5wdXQuIHRhcmdldE9yaWdpbiB1c2VzIFwiKlwiIGJlY2F1c2UgY3Jvc3Mtb3JpZ2luXHJcbiAgICAgICAgLy8gICBmcmFtZXMgbWF5IGV4aXN0OyB0aGUgYnJvd3NlciBlbmZvcmNlcyBzYW1lLW9yaWdpbiBjb25zdHJhaW50cy5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgd2luZG93LnRvcC5wb3N0TWVzc2FnZSh7IHR5cGU6IEZSQU1FX1RPR0dMRV9NRVNTQUdFIH0sIFwiKlwiKTtcclxuICAgICAgICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICAgICAgICAvKiBpZ25vcmVkICovXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZGF0YS50eXBlID09PSBNQUlOX0hPVEtFWV9FU0MpIHtcclxuICAgICAgaWYgKGlzVG9wRnJhbWUgJiYgc3RhdGUuaXNPcGVuKSB7XHJcbiAgICAgICAgY2xvc2VPdmVybGF5KCk7XHJcbiAgICAgIH0gZWxzZSBpZiAoIWlzVG9wRnJhbWUpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgd2luZG93LnRvcC5wb3N0TWVzc2FnZSh7IHR5cGU6IE1BSU5fSE9US0VZX0VTQyB9LCBcIipcIik7XHJcbiAgICAgICAgfSBjYXRjaCAoX2UpIHt9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChkYXRhLnR5cGUgPT09IEZSQU1FX1RPR0dMRV9NRVNTQUdFICYmIGlzVG9wRnJhbWUpIHtcclxuICAgICAgdG9nZ2xlT3ZlcmxheSgpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICAvLyBJc29sYXRlZC13b3JsZCBrZXlkb3duIGlzIHRoZSBmYWxsYmFjayBmb3Igd2hlbiBNQUlOLXdvcmxkIGZhaWxzLCBhbmRcclxuICAvLyBhbHNvIGhhbmRsZXMgRXNjIHRvIGNsb3NlIHRoZSBvdmVybGF5IChNQUlOLXdvcmxkIGRvZXNuJ3QgaGFuZGxlIEVzYykuXHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUdsb2JhbEtleWRvd24sIHRydWUpO1xyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUdsb2JhbEtleWRvd24sIHRydWUpO1xyXG5cclxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIF9zZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xyXG4gICAgaWYgKCFtZXNzYWdlIHx8IG1lc3NhZ2UudHlwZSAhPT0gXCJUT0dHTEVfU0VBUkNIX09WRVJMQVlcIikgcmV0dXJuIGZhbHNlO1xyXG4gICAgaWYgKCFpc1RvcEZyYW1lKSByZXR1cm4gZmFsc2U7XHJcbiAgICB0b2dnbGVPdmVybGF5KCkuZmluYWxseSgoKSA9PiBzZW5kUmVzcG9uc2UgJiYgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUgfSkpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfSk7XHJcblxyXG4gIGNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYSkgPT4ge1xyXG4gICAgaWYgKGFyZWEgIT09IFwibG9jYWxcIikgcmV0dXJuO1xyXG4gICAgaWYgKGNoYW5nZXNbVUlfUFJFRlNfU1RPUkFHRV9LRVldKSB7XHJcbiAgICAgIHJlZnJlc2hVaVByZWZzKCkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgc3luY1Nob3J0Y3V0VG9NYWluV29ybGQoKTtcclxuICAgICAgICBpZiAoc3RhdGUuaXNPcGVuKSB7XHJcbiAgICAgICAgICBhcHBseVVpUHJlZnMoKTtcclxuICAgICAgICAgIHJlbmRlckhpc3RvcnlJZk9wZW4oKTtcclxuICAgICAgICAgIHJlbmRlclByb21wdFBpY2tlcklmT3BlbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBpZiAoIXN0YXRlLmlzT3BlbikgcmV0dXJuO1xyXG4gICAgaWYgKGNoYW5nZXNbQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZXSkge1xyXG4gICAgICByZWZyZXNoQWxsU2l0ZXMoKS50aGVuKHJlbmRlckdyb3Vwc0lmT3Blbik7XHJcbiAgICB9XHJcbiAgICBpZiAoY2hhbmdlc1tTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXSkge1xyXG4gICAgICByZWZyZXNoR3JvdXBzKCkudGhlbihyZW5kZXJHcm91cHNJZk9wZW4pO1xyXG4gICAgfVxyXG4gICAgaWYgKGNoYW5nZXNbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldKSB7XHJcbiAgICAgIHJlZnJlc2hIaXN0b3J5KCkudGhlbihyZW5kZXJIaXN0b3J5SWZPcGVuKTtcclxuICAgIH1cclxuICAgIGlmIChjaGFuZ2VzW1BST01QVF9HUk9VUFNfU1RPUkFHRV9LRVldKSB7XHJcbiAgICAgIHJlZnJlc2hQcm9tcHRHcm91cHMoKS50aGVuKHJlbmRlclByb21wdFBpY2tlcklmT3Blbik7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGZ1bmN0aW9uIGhhbmRsZUdsb2JhbEtleWRvd24oZXZlbnQpIHtcclxuICAgIC8vIElzb2xhdGVkLXdvcmxkIGtleWRvd24gb25seSBkb2VzIG9uZSBqb2I6IGNsb3NlIHRoZSBvdmVybGF5IG9uIEVzYyB3aGVuXHJcbiAgICAvLyBpdCdzIG9wZW4uIEhvdGtleSBcInRvZ2dsZVwiIGxpdmVzIGluIE1BSU4td29ybGQgKG92ZXJsYXlfbWFpbi5qcykgdG9cclxuICAgIC8vIGF2b2lkIGRvdWJsZS1maXJpbmcgd2hlbiBib3RoIHdvcmxkcyBtYXRjaCB0aGUgc2FtZSBrZXkuXHJcbiAgICBpZiAoIWlzVG9wRnJhbWUgfHwgIXN0YXRlLmlzT3BlbikgcmV0dXJuO1xyXG4gICAgaWYgKGV2ZW50LmtleSAhPT0gXCJFc2NhcGVcIikgcmV0dXJuO1xyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgY2xvc2VPdmVybGF5KCk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBmdW5jdGlvbiB0b2dnbGVPdmVybGF5KCkge1xyXG4gICAgaWYgKHN0YXRlLmlzT3Blbikge1xyXG4gICAgICBjbG9zZU92ZXJsYXkoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGF3YWl0IG9wZW5PdmVybGF5KCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBmdW5jdGlvbiBvcGVuT3ZlcmxheSgpIHtcclxuICAgIGlmIChzdGF0ZS5pc09wZW4gfHwgIWlzVG9wRnJhbWUpIHJldHVybjtcclxuICAgIGF3YWl0IFByb21pc2UuYWxsKFtcclxuICAgICAgcmVmcmVzaEdyb3VwcygpLFxyXG4gICAgICByZWZyZXNoQWxsU2l0ZXMoKSxcclxuICAgICAgcmVmcmVzaEhpc3RvcnkoKSxcclxuICAgICAgcmVmcmVzaFByb21wdEdyb3VwcygpLFxyXG4gICAgICByZWZyZXNoVWlQcmVmcygpLFxyXG4gICAgXSk7XHJcbiAgICBpZiAoIXN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQpIHtcclxuICAgICAgc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9IHN0YXRlLnByb21wdEdyb3Vwc1swXT8uaWQgfHwgbnVsbDtcclxuICAgIH1cclxuICAgIG1vdW50T3ZlcmxheSgpO1xyXG4gICAgc3RhdGUuaXNPcGVuID0gdHJ1ZTtcclxuICAgIC8vIFJldmlldyBub3RlIChDV1MvRWRnZSBBZGQtb25zKTpcclxuICAgIC8vIC0gXCJQcmV3YXJtXCIgaXMgcGVyZm9ybWFuY2Utb25seSAocmVkdWNlcyBmaXJzdC1sb2FkIGxhdGVuY3kgZm9yIGhlYXZ5IEFJIHNpdGVzKS5cclxuICAgIC8vIC0gUmVxdWVzdHMgZ28gZGlyZWN0bHkgdG8gdXNlci1zZWxlY3RlZCB0aGlyZC1wYXJ0eSBzaXRlczsgdGhlIGV4dGVuc2lvbiBkb2VzXHJcbiAgICAvLyAgIE5PVCBzZW5kIHVzZXIgZGF0YSB0byBhbnkgZGV2ZWxvcGVyLWNvbnRyb2xsZWQgc2VydmVyIGFuZCBkb2VzIE5PVCByZWFkXHJcbiAgICAvLyAgIHJlc3BvbnNlIGJvZGllcyAoc2VlIGJhY2tncm91bmQuanMpLlxyXG4gICAgdHJ5IHtcclxuICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIldBUk1VUF9BSV9TSVRFU1wiIH0pLmNhdGNoKCgpID0+IHt9KTtcclxuICAgIH0gY2F0Y2ggKF9lcnIpIHtcclxuICAgICAgLyogaWdub3JlZCAqL1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3luY1Nob3J0Y3V0VG9NYWluV29ybGQoKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdHlwZTogTUFJTl9IT1RLRVlfQ09ORklHLFxyXG4gICAgICAgICAgZW5hYmxlZDogc3RhdGUudWlQcmVmcy5vdmVybGF5U2hvcnRjdXRFbmFibGVkICE9PSBmYWxzZSxcclxuICAgICAgICAgIHNob3J0Y3V0OiBzdGF0ZS51aVByZWZzLm92ZXJsYXlTaG9ydGN1dCxcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8vIFJldmlldyBub3RlOiBvbmx5IHN5bmNzIGhvdGtleSBjb25maWcgYmV0d2VlbiBpc29sYXRlZCB3b3JsZCBhbmQgTUFJTiB3b3JsZDsgbm8gdXNlciBpbnB1dC5cclxuICAgICAgICB3aW5kb3cubG9jYXRpb24ub3JpZ2luXHJcbiAgICAgICk7XHJcbiAgICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICAgIC8qIGlnbm9yZWQgKi9cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsb3NlT3ZlcmxheSgpIHtcclxuICBpZiAoIXN0YXRlLmlzT3BlbikgcmV0dXJuO1xyXG4gIHN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbiA9IGZhbHNlO1xyXG4gIGhpZGVHcm91cFRvb2x0aXAoKTtcclxuICBpZiAoc3RhdGUub3ZlcmxheVByZXZpZXdNZ3IpIHtcclxuICAgIHN0YXRlLm92ZXJsYXlQcmV2aWV3TWdyLmRlc3Ryb3koKTtcclxuICAgIHN0YXRlLm92ZXJsYXlQcmV2aWV3TWdyID0gbnVsbDtcclxuICB9XHJcbiAgaWYgKHN0YXRlLmhvc3RFbCAmJiBzdGF0ZS5ob3N0RWwucGFyZW50Tm9kZSkge1xyXG4gICAgc3RhdGUuaG9zdEVsLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoc3RhdGUuaG9zdEVsKTtcclxuICB9XHJcbiAgc3RhdGUuaG9zdEVsID0gbnVsbDtcclxuICBzdGF0ZS5zaGFkb3dSb290ID0gbnVsbDtcclxuICBzdGF0ZS5pc09wZW4gPSBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gbW91bnRPdmVybGF5KCkge1xyXG4gIHN0YXRlLmhvc3RFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgc3RhdGUuaG9zdEVsLmlkID0gXCJxc2hvdC1zZWFyY2gtb3ZlcmxheS1ob3N0XCI7XHJcbiAgc3RhdGUuaG9zdEVsLnN0eWxlLmNzc1RleHQgPSBcImFsbDogaW5pdGlhbDsgcG9zaXRpb246IGZpeGVkOyBpbnNldDogMDsgei1pbmRleDogMjE0NzQ4MzY0NjtcIjtcclxuICBzdGF0ZS5zaGFkb3dSb290ID0gc3RhdGUuaG9zdEVsLmF0dGFjaFNoYWRvdyh7IG1vZGU6IFwiY2xvc2VkXCIgfSk7XHJcblxyXG4gIGNvbnN0IHN0eWxlRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XHJcbiAgc3R5bGVFbC50ZXh0Q29udGVudCA9IE9WRVJMQVlfU1RZTEVTO1xyXG4gIHN0YXRlLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoc3R5bGVFbCk7XHJcblxyXG4gIGNvbnN0IGJhY2tkcm9wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBiYWNrZHJvcC5jbGFzc05hbWUgPSBcImJhY2tkcm9wXCI7XHJcbiAgYmFja2Ryb3AuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZG93blwiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC50YXJnZXQgPT09IGJhY2tkcm9wKSBjbG9zZU92ZXJsYXkoKTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHBhbmVsLmNsYXNzTmFtZSA9IFwicGFuZWxcIjtcclxuICBwYW5lbC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIChldmVudCkgPT4ge1xyXG4gICAgLy8gQ2xpY2tpbmcgYW55d2hlcmUgb24gdGhlIHBhbmVsIHRoYXQgaXNuJ3QgdGhlIHByb21wdCBhcmVhIGNvbGxhcHNlcyB0aGUgcGlja2VyLlxyXG4gICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0O1xyXG4gICAgaWYgKHRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcclxuICAgICAgaWYgKCF0YXJnZXQuY2xvc2VzdChcIi5wcm9tcHQtcGlja2VyXCIpICYmICF0YXJnZXQuY2xvc2VzdChcIi5pY29uLWJ0bi5zcGFya2xlXCIpKSB7XHJcbiAgICAgICAgaWYgKHN0YXRlLmlzUHJvbXB0UGlja2VyT3Blbikge1xyXG4gICAgICAgICAgc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuID0gZmFsc2U7XHJcbiAgICAgICAgICByZW5kZXJQcm9tcHRQaWNrZXJJZk9wZW4oKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImhlYWRlclwiKTtcclxuICBoZWFkZXIuY2xhc3NOYW1lID0gXCJoZWFkZXJcIjtcclxuICBjb25zdCBsb2dvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImltZ1wiKTtcclxuICBsb2dvLmNsYXNzTmFtZSA9IFwidGl0bGUtbG9nb1wiO1xyXG4gIGxvZ28uYWx0ID0gXCJRc2hvdFwiO1xyXG4gIGxvZ28uc3JjID0gTE9HT19VUkw7XHJcbiAgbG9nby5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgKCkgPT4ge1xyXG4gICAgbG9nby5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgfSk7XHJcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGxvZ28pO1xyXG4gIHBhbmVsLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcblxyXG4gIGNvbnN0IGNvbXBvc2VyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgY29tcG9zZXIuY2xhc3NOYW1lID0gXCJjb21wb3NlclwiO1xyXG5cclxuICBjb25zdCBxdWVyeUlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInRleHRhcmVhXCIpO1xyXG4gIHF1ZXJ5SW5wdXQuY2xhc3NOYW1lID0gXCJxdWVyeS1pbnB1dFwiO1xyXG4gIHF1ZXJ5SW5wdXQucm93cyA9IDE7XHJcbiAgcXVlcnlJbnB1dC5wbGFjZWhvbGRlciA9IHQoXCJwb3B1cF9xdWVyeVBsYWNlaG9sZGVyXCIsIG51bGwsIFwi6L6T5YWl5L2g6KaB5pCc57Si55qEXCIpO1xyXG4gIGNvbXBvc2VyLmFwcGVuZENoaWxkKHF1ZXJ5SW5wdXQpO1xyXG5cclxuICBjb25zdCBhY3Rpb25zUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBhY3Rpb25zUm93LmNsYXNzTmFtZSA9IFwiYWN0aW9ucy1yb3dcIjtcclxuXHJcbiAgY29uc3QgZGljZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgZGljZUJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBkaWNlQnRuLmNsYXNzTmFtZSA9IFwiaWNvbi1idG4gZGljZVwiO1xyXG4gIGRpY2VCdG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCB0KFwicG9wdXBfcmFuZG9tUXVlc3Rpb25cIiwgbnVsbCwgXCLpmo/mnLrpl67pophcIikpO1xyXG4gIGRpY2VCdG4uaW5uZXJIVE1MID0gRElDRV9TVkc7XHJcbiAgZGljZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuID0gZmFsc2U7XHJcbiAgICByZW5kZXJQcm9tcHRQaWNrZXJJZk9wZW4oKTtcclxuICAgIGZpbGxSYW5kb21RdWVzdGlvbigpO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBzcGFya2xlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBzcGFya2xlQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIHNwYXJrbGVCdG4uY2xhc3NOYW1lID0gXCJpY29uLWJ0biBzcGFya2xlXCI7XHJcbiAgc3BhcmtsZUJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIHQoXCJwb3B1cF9wcm9tcHRFbnRyeVwiLCBudWxsLCBcIuaPkOekuuivjVwiKSk7XHJcbiAgc3BhcmtsZUJ0bi5pbm5lckhUTUwgPSBTUEFSS0xFX1NWRztcclxuICBzcGFya2xlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuID0gIXN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbjtcclxuICAgIHJlbmRlclByb21wdFBpY2tlcklmT3BlbigpO1xyXG4gIH0pO1xyXG5cclxuICBhY3Rpb25zUm93LmFwcGVuZENoaWxkKGRpY2VCdG4pO1xyXG4gIGFjdGlvbnNSb3cuYXBwZW5kQ2hpbGQoc3BhcmtsZUJ0bik7XHJcbiAgY29tcG9zZXIuYXBwZW5kQ2hpbGQoYWN0aW9uc1Jvdyk7XHJcblxyXG4gIGNvbnN0IHByb21wdFBpY2tlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcHJvbXB0UGlja2VyLmNsYXNzTmFtZSA9IFwicHJvbXB0LXBpY2tlclwiO1xyXG4gIHByb21wdFBpY2tlci5oaWRkZW4gPSB0cnVlO1xyXG4gIGNvbXBvc2VyLmFwcGVuZENoaWxkKHByb21wdFBpY2tlcik7XHJcblxyXG4gIHBhbmVsLmFwcGVuZENoaWxkKGNvbXBvc2VyKTtcclxuXHJcbiAgY29uc3Qgc2V0dGluZ3NDb3JuZXJCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIHNldHRpbmdzQ29ybmVyQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIHNldHRpbmdzQ29ybmVyQnRuLmNsYXNzTmFtZSA9IFwic2V0dGluZ3MtY29ybmVyLWJ0blwiO1xyXG4gIHNldHRpbmdzQ29ybmVyQnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgdChcInBvcHVwX3NldHRpbmdzXCIsIG51bGwsIFwi6K6+572uXCIpKTtcclxuICBzZXR0aW5nc0Nvcm5lckJ0bi5pbm5lckhUTUwgPSBgPHN2ZyB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIxLjhcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+PHBhdGggZD1cIk0xMiAxNWEzIDMgMCAxIDAgMC02IDMgMyAwIDAgMCAwIDZaXCIvPjxwYXRoIGQ9XCJNMTkuNCAxNWExLjY1IDEuNjUgMCAwIDAgLjMzIDEuODJsLjA2LjA2YTIgMiAwIDAgMS0yLjgzIDIuODNsLS4wNi0uMDZhMS42NSAxLjY1IDAgMCAwLTEuODItLjMzIDEuNjUgMS42NSAwIDAgMC0xIDEuNTFWMjFhMiAyIDAgMCAxLTQgMHYtLjA5QTEuNjUgMS42NSAwIDAgMCA5IDE5LjRhMS42NSAxLjY1IDAgMCAwLTEuODIuMzNsLS4wNi4wNmEyIDIgMCAwIDEtMi44My0yLjgzbC4wNi0uMDZBMS42NSAxLjY1IDAgMCAwIDQuNjggMTVhMS42NSAxLjY1IDAgMCAwLTEuNTEtMUgzYTIgMiAwIDAgMSAwLTRoLjA5QTEuNjUgMS42NSAwIDAgMCA0LjYgOWExLjY1IDEuNjUgMCAwIDAtLjMzLTEuODJsLS4wNi0uMDZhMiAyIDAgMCAxIDIuODMtMi44M2wuMDYuMDZBMS42NSAxLjY1IDAgMCAwIDkgNC42OGExLjY1IDEuNjUgMCAwIDAgMS0xLjUxVjNhMiAyIDAgMCAxIDQgMHYuMDlhMS42NSAxLjY1IDAgMCAwIDEgMS41MSAxLjY1IDEuNjUgMCAwIDAgMS44Mi0uMzNsLjA2LS4wNmEyIDIgMCAwIDEgMi44MyAyLjgzbC0uMDYuMDZBMS42NSAxLjY1IDAgMCAwIDE5LjQgOWExLjY1IDEuNjUgMCAwIDAgMS41MSAxSDIxYTIgMiAwIDAgMSAwIDRoLS4wOWExLjY1IDEuNjUgMCAwIDAtMS41MSAxWlwiLz48L3N2Zz5gO1xyXG4gIHNldHRpbmdzQ29ybmVyQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiT1BFTl9TRVRUSU5HU19QQUdFXCIgfSkuY2F0Y2goKCkgPT4ge30pO1xyXG4gICAgY2xvc2VPdmVybGF5KCk7XHJcbiAgfSk7XHJcbiAgcGFuZWwuYXBwZW5kQ2hpbGQoc2V0dGluZ3NDb3JuZXJCdG4pO1xyXG5cclxuICBjb25zdCBncm91cHNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGdyb3Vwc0NvbnRhaW5lci5jbGFzc05hbWUgPSBcImdyb3Vwc1wiO1xyXG4gIHBhbmVsLmFwcGVuZENoaWxkKGdyb3Vwc0NvbnRhaW5lcik7XHJcblxyXG4gIGNvbnN0IGdyb3VwVG9vbHRpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgZ3JvdXBUb29sdGlwLmNsYXNzTmFtZSA9IFwiZ3JvdXAtdG9vbHRpcFwiO1xyXG4gIGdyb3VwVG9vbHRpcC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VlbnRlclwiLCAoKSA9PiB7XHJcbiAgICBpZiAoc3RhdGUuZ3JvdXBUb29sdGlwSGlkZVRpbWVyKSB7XHJcbiAgICAgIGNsZWFyVGltZW91dChzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIpO1xyXG4gICAgICBzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIgPSBudWxsO1xyXG4gICAgfVxyXG4gIH0pO1xyXG4gIGdyb3VwVG9vbHRpcC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCAoKSA9PiB7XHJcbiAgICAvLyBJbXBvcnQgaGVyZSB0byBhdm9pZCBhIGN5Y2xlOyBncm91cHMtcGFuZWwgZXhwb3J0cyBoaWRlR3JvdXBUb29sdGlwIGJ1dFxyXG4gICAgLy8gd2UgY2FuIGNhbGwgdGhyb3VnaCB0aGUgc2NoZWR1bGUgcGF0aCB2aWEgRE9NIGV2ZW50IGZvcndhcmRpbmcg4oCUIHNpbXBseVxyXG4gICAgLy8gY2xlYXIgaW5saW5lIHN0YXRlIHNvIHRoZSBleGlzdGluZyBzY2hlZHVsaW5nIGxvZ2ljIHBpY2tzIHVwLlxyXG4gICAgaWYgKHN0YXRlLmdyb3VwVG9vbHRpcEhpZGVUaW1lcikgY2xlYXJUaW1lb3V0KHN0YXRlLmdyb3VwVG9vbHRpcEhpZGVUaW1lcik7XHJcbiAgICBzdGF0ZS5ncm91cFRvb2x0aXBIaWRlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgY29uc3QgdG9vbHRpcCA9IHN0YXRlLnNoYWRvd1Jvb3Q/LnF1ZXJ5U2VsZWN0b3IoXCIuZ3JvdXAtdG9vbHRpcFwiKTtcclxuICAgICAgaWYgKHRvb2x0aXAgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkgdG9vbHRpcC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICB9LCAxODApO1xyXG4gIH0pO1xyXG4gIHBhbmVsLmFwcGVuZENoaWxkKGdyb3VwVG9vbHRpcCk7XHJcblxyXG4gIGNvbnN0IGhpc3RvcnlTZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgaGlzdG9yeVNlY3Rpb24uY2xhc3NOYW1lID0gXCJoaXN0b3J5LXNlY3Rpb25cIjtcclxuICBoaXN0b3J5U2VjdGlvbi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsbGVkYnlcIiwgXCJxc2hvdE92ZXJsYXlIaXN0b3J5VGl0bGVcIik7XHJcblxyXG4gIGNvbnN0IGhpc3RvcnlEaXZpZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoaXN0b3J5RGl2aWRlci5jbGFzc05hbWUgPSBcInNlY3Rpb24tZGl2aWRlclwiO1xyXG4gIGNvbnN0IGhpc3RvcnlUaXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gIGhpc3RvcnlUaXRsZS5pZCA9IFwicXNob3RPdmVybGF5SGlzdG9yeVRpdGxlXCI7XHJcbiAgaGlzdG9yeVRpdGxlLmNsYXNzTmFtZSA9IFwic2VjdGlvbi1kaXZpZGVyLWxhYmVsXCI7XHJcbiAgaGlzdG9yeVRpdGxlLnRleHRDb250ZW50ID0gdChcInBvcHVwX2hpc3RvcnlTZWFyY2hcIiwgbnVsbCwgXCLljoblj7LmkJzntKJcIik7XHJcbiAgaGlzdG9yeURpdmlkZXIuYXBwZW5kQ2hpbGQoaGlzdG9yeVRpdGxlKTtcclxuXHJcbiAgY29uc3QgaGlzdG9yeUxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhpc3RvcnlMaXN0LmNsYXNzTmFtZSA9IFwiaGlzdG9yeS1saXN0XCI7XHJcblxyXG4gIGhpc3RvcnlTZWN0aW9uLmFwcGVuZENoaWxkKGhpc3RvcnlEaXZpZGVyKTtcclxuICBoaXN0b3J5U2VjdGlvbi5hcHBlbmRDaGlsZChoaXN0b3J5TGlzdCk7XHJcbiAgcGFuZWwuYXBwZW5kQ2hpbGQoaGlzdG9yeVNlY3Rpb24pO1xyXG5cclxuICBjb25zdCBwYW5lbFdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHBhbmVsV3JhcC5jbGFzc05hbWUgPSBcInBhbmVsLXdyYXBcIjtcclxuICBwYW5lbFdyYXAuYXBwZW5kQ2hpbGQocGFuZWwpO1xyXG5cclxuICBjb25zdCBoaW50Um93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoaW50Um93LmNsYXNzTmFtZSA9IFwiaGludC1yb3dcIjtcclxuICBoaW50Um93LmlubmVySFRNTCA9IGA8c3Bhbj48c3BhbiBjbGFzcz1cImtiZFwiPkVudGVyPC9zcGFuPiAke3QoXCJvdmVybGF5X2hpbnRTZWFyY2hcIiwgbnVsbCwgXCLmkJzntKJcIil9IMK3IDxzcGFuIGNsYXNzPVwia2JkXCI+RXNjPC9zcGFuPiAke3QoXCJjb21tb25fY2xvc2VcIiwgbnVsbCwgXCLlhbPpl61cIil9PC9zcGFuPmA7XHJcbiAgcGFuZWxXcmFwLmFwcGVuZENoaWxkKGhpbnRSb3cpO1xyXG5cclxuICBiYWNrZHJvcC5hcHBlbmRDaGlsZChwYW5lbFdyYXApO1xyXG4gIHN0YXRlLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoYmFja2Ryb3ApO1xyXG5cclxuICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuYXBwZW5kQ2hpbGQoc3RhdGUuaG9zdEVsKTtcclxuXHJcbiAgcXVlcnlJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgIGlmIChzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW4pIHtcclxuICAgICAgICBzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW4gPSBmYWxzZTtcclxuICAgICAgICByZW5kZXJQcm9tcHRQaWNrZXJJZk9wZW4oKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgY2xvc2VPdmVybGF5KCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRW50ZXJcIiAmJiAhZXZlbnQuc2hpZnRLZXkpIHtcclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgYXdhaXQgcnVuRGVmYXVsdFNlYXJjaCgpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBxdWVyeUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCBzeW5jQ29tcG9zZXJMYXlvdXQpO1xyXG4gIHF1ZXJ5SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNldXBcIiwgc3luY0NvbXBvc2VyTGF5b3V0KTtcclxuICBxdWVyeUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBzeW5jQ29tcG9zZXJMYXlvdXQpO1xyXG5cclxuICBiYWNrZHJvcC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgY2xvc2VPdmVybGF5KCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGFwcGx5VWlQcmVmcygpO1xyXG4gIHJlbmRlckdyb3Vwc0lmT3BlbigpO1xyXG4gIHJlbmRlckhpc3RvcnlJZk9wZW4oKTtcclxuICByZW5kZXJQcm9tcHRQaWNrZXJJZk9wZW4oKTtcclxuICBzeW5jQ29tcG9zZXJMYXlvdXQoKTtcclxuXHJcbiAgc2V0VGltZW91dCgoKSA9PiBxdWVyeUlucHV0LmZvY3VzKCksIDApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhcHBseVVpUHJlZnMoKSB7XHJcbiAgaWYgKCFzdGF0ZS5zaGFkb3dSb290KSByZXR1cm47XHJcbiAgY29uc3QgZGljZUJ0biA9IHN0YXRlLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcihcIi5pY29uLWJ0bi5kaWNlXCIpO1xyXG4gIGNvbnN0IHNwYXJrbGVCdG4gPSBzdGF0ZS5zaGFkb3dSb290LnF1ZXJ5U2VsZWN0b3IoXCIuaWNvbi1idG4uc3BhcmtsZVwiKTtcclxuICBjb25zdCBhY3Rpb25zUm93ID0gc3RhdGUuc2hhZG93Um9vdC5xdWVyeVNlbGVjdG9yKFwiLmFjdGlvbnMtcm93XCIpO1xyXG4gIGNvbnN0IGhpc3RvcnlTZWN0aW9uID0gc3RhdGUuc2hhZG93Um9vdC5xdWVyeVNlbGVjdG9yKFwiLmhpc3Rvcnktc2VjdGlvblwiKTtcclxuICBpZiAoZGljZUJ0bikge1xyXG4gICAgZGljZUJ0bi5zdHlsZS5kaXNwbGF5ID0gc3RhdGUudWlQcmVmcy5zaG93UmFuZG9tQnV0dG9uID09PSBmYWxzZSA/IFwibm9uZVwiIDogXCJpbmxpbmUtZmxleFwiO1xyXG4gIH1cclxuICBpZiAoc3BhcmtsZUJ0bikge1xyXG4gICAgc3BhcmtsZUJ0bi5zdHlsZS5kaXNwbGF5ID0gc3RhdGUudWlQcmVmcy5zaG93UHJvbXB0QnV0dG9uID09PSBmYWxzZSA/IFwibm9uZVwiIDogXCJpbmxpbmUtZmxleFwiO1xyXG4gIH1cclxuICBpZiAoYWN0aW9uc1Jvdykge1xyXG4gICAgY29uc3QgaGFzVmlzaWJsZSA9XHJcbiAgICAgIHN0YXRlLnVpUHJlZnMuc2hvd1JhbmRvbUJ1dHRvbiAhPT0gZmFsc2UgfHwgc3RhdGUudWlQcmVmcy5zaG93UHJvbXB0QnV0dG9uICE9PSBmYWxzZTtcclxuICAgIGFjdGlvbnNSb3cuc3R5bGUuZGlzcGxheSA9IGhhc1Zpc2libGUgPyBcImZsZXhcIiA6IFwibm9uZVwiO1xyXG4gIH1cclxuICBpZiAoaGlzdG9yeVNlY3Rpb24gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xyXG4gICAgaGlzdG9yeVNlY3Rpb24uaGlkZGVuID0gc3RhdGUudWlQcmVmcy5zaG93SGlzdG9yeSA9PT0gZmFsc2U7XHJcbiAgICBoaXN0b3J5U2VjdGlvbi5zdHlsZS5kaXNwbGF5ID0gc3RhdGUudWlQcmVmcy5zaG93SGlzdG9yeSA9PT0gZmFsc2UgPyBcIm5vbmVcIiA6IFwiYmxvY2tcIjtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN5bmNDb21wb3NlckxheW91dCgpIHtcclxuICBpZiAoIXN0YXRlLnNoYWRvd1Jvb3QpIHJldHVybjtcclxuICBjb25zdCBjb21wb3NlciA9IHN0YXRlLnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvcihcIi5jb21wb3NlclwiKTtcclxuICBjb25zdCBxdWVyeUlucHV0ID0gc3RhdGUuc2hhZG93Um9vdC5xdWVyeVNlbGVjdG9yKFwiLnF1ZXJ5LWlucHV0XCIpO1xyXG4gIGlmICghY29tcG9zZXIgfHwgIXF1ZXJ5SW5wdXQpIHJldHVybjtcclxuXHJcbiAgY29tcG9zZXIuY2xhc3NMaXN0LnJlbW92ZShcImlzLW1pZC1leHBhbmRlZFwiLCBcImlzLWV4cGFuZGVkXCIpO1xyXG4gIHF1ZXJ5SW5wdXQuc3R5bGUuaGVpZ2h0ID0gXCIwcHhcIjtcclxuICBjb25zdCBzY3JvbGxIID0gcXVlcnlJbnB1dC5zY3JvbGxIZWlnaHQ7XHJcbiAgY29uc3QgbGluZUhlaWdodCA9IHBhcnNlRmxvYXQoZ2V0Q29tcHV0ZWRTdHlsZShxdWVyeUlucHV0KS5saW5lSGVpZ2h0IHx8IFwiMjBcIik7XHJcbiAgcXVlcnlJbnB1dC5zdHlsZS5oZWlnaHQgPSBcIlwiO1xyXG4gIGNvbnN0IHNob3VsZEV4cGFuZCA9IHNjcm9sbEggPiBsaW5lSGVpZ2h0ICogMi43O1xyXG4gIGNvbnN0IHNob3VsZE1pZEV4cGFuZCA9ICFzaG91bGRFeHBhbmQgJiYgc2Nyb2xsSCA+IGxpbmVIZWlnaHQgKiAxLjc7XHJcbiAgY29tcG9zZXIuY2xhc3NMaXN0LnRvZ2dsZShcImlzLW1pZC1leHBhbmRlZFwiLCBzaG91bGRNaWRFeHBhbmQpO1xyXG4gIGNvbXBvc2VyLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1leHBhbmRlZFwiLCBzaG91bGRFeHBhbmQpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBpbml0UXNob3RPdmVybGF5IH0gZnJvbSBcIi4vb3ZlcmxheS9tYWluLmpzXCI7XHJcblxyXG5pZiAoIWlzR3Jva1N1YkZyYW1lKCkpIHtcclxuICBpbml0UXNob3RPdmVybGF5KCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzR3Jva1N1YkZyYW1lKCkge1xyXG4gIGlmICh3aW5kb3cgPT09IHdpbmRvdy50b3ApIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBob3N0ID0gd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgcmV0dXJuIGhvc3QgPT09IFwiZ3Jvay5jb21cIjtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7QUFBTyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLHVCQUF1QjtBQUM3QixNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLCtCQUErQjtBQUNyQyxNQUFNLDZCQUE2QjtBQUduQyxNQUFNLDBCQUEwQjs7O0FDUnZDLE1BQU0sbUJBQW1CLE9BQU8sT0FBTztBQUFBLElBQ3JDLFNBQVM7QUFBQSxJQUNULFVBQVU7QUFBQSxJQUNWLFFBQVE7QUFBQSxJQUNSLFNBQVM7QUFBQSxJQUNULEtBQUs7QUFBQSxFQUNQLENBQUM7QUFFTSxXQUFTLGFBQWEsS0FBSztBQUNoQyxRQUFJLENBQUMsSUFBSyxRQUFPO0FBQ2pCLFFBQUksSUFBSSxXQUFXLEVBQUcsUUFBTyxJQUFJLFlBQVk7QUFDN0MsV0FBTztBQUFBLEVBQ1Q7QUFFTyxXQUFTLGtCQUFrQixPQUFPO0FBQ3ZDLFFBQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxTQUFVLFFBQU8sRUFBRSxHQUFHLGlCQUFpQjtBQUN0RSxVQUFNLE1BQU0sT0FBTyxNQUFNLFFBQVEsWUFBWSxNQUFNLElBQUksU0FBUyxJQUFJLE1BQU0sTUFBTSxpQkFBaUI7QUFDakcsV0FBTztBQUFBLE1BQ0wsU0FBUyxDQUFDLENBQUMsTUFBTTtBQUFBLE1BQ2pCLFVBQVUsQ0FBQyxDQUFDLE1BQU07QUFBQSxNQUNsQixRQUFRLENBQUMsQ0FBQyxNQUFNO0FBQUEsTUFDaEIsU0FBUyxDQUFDLENBQUMsTUFBTTtBQUFBLE1BQ2pCLEtBQUssYUFBYSxHQUFHO0FBQUEsSUFDdkI7QUFBQSxFQUNGOzs7QUNiTyxNQUFNLFFBQVE7QUFBQSxJQUNuQixRQUFRO0FBQUEsSUFDUixZQUFZO0FBQUEsSUFDWixRQUFRO0FBQUEsSUFDUixRQUFRLENBQUM7QUFBQSxJQUNULFVBQVUsQ0FBQztBQUFBLElBQ1gsZ0JBQWdCLENBQUM7QUFBQSxJQUNqQixjQUFjLENBQUM7QUFBQSxJQUNmLFNBQVMsaUJBQWlCO0FBQUEsSUFDMUIscUJBQXFCO0FBQUEsSUFDckIsb0JBQW9CO0FBQUEsSUFDcEIsbUJBQW1CO0FBQUEsSUFDbkIsbUJBQW1CO0FBQUEsSUFDbkIsdUJBQXVCO0FBQUE7QUFBQTtBQUFBLElBR3ZCLGNBQWMsTUFBTTtBQUFBLElBQUM7QUFBQSxFQUN2QjtBQUVPLFdBQVMsRUFBRSxLQUFLLGVBQWUsV0FBVyxJQUFJO0FBQ25ELFFBQUk7QUFDRixZQUFNLE1BQU0sUUFBUSxNQUFNLGFBQWEsS0FBSyxhQUFhLEtBQUssT0FBTyxnQkFBZ0IsSUFBSSxLQUFLLGFBQWE7QUFDM0csYUFBTyxPQUFPLFlBQVk7QUFBQSxJQUM1QixTQUFTLElBQUk7QUFDWCxhQUFPLFlBQVk7QUFBQSxJQUNyQjtBQUFBLEVBQ0Y7QUFFTyxXQUFTLGlCQUFpQixPQUFPO0FBQ3RDLFVBQU0sTUFBTSxTQUFTLE9BQU8sVUFBVSxXQUFXLFFBQVEsQ0FBQztBQUMxRCxXQUFPO0FBQUEsTUFDTCxhQUFhLElBQUksZ0JBQWdCO0FBQUEsTUFDakMsa0JBQWtCLElBQUkscUJBQXFCO0FBQUEsTUFDM0Msa0JBQWtCLElBQUkscUJBQXFCO0FBQUEsTUFDM0MsZ0JBQWdCLElBQUksbUJBQW1CO0FBQUEsTUFDdkMsd0JBQXdCLElBQUksMkJBQTJCO0FBQUEsTUFDdkQsaUJBQWlCLGtCQUFrQixJQUFJLGVBQWU7QUFBQSxJQUN4RDtBQUFBLEVBQ0Y7QUFFTyxXQUFTLHFCQUFxQixLQUFLO0FBQ3hDLFVBQU0sTUFBTSxPQUFPLE9BQU8sRUFBRSxFQUFFLEtBQUs7QUFDbkMsUUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixRQUFJLE9BQU8sSUFBSSxRQUFRLDJCQUEyQixDQUFDLEdBQUcsUUFBUyxRQUFRLE1BQU0sTUFBTSxFQUFHO0FBQ3RGLFdBQU8sS0FBSyxRQUFRLE9BQU8sR0FBRztBQUM5QixXQUFPLEtBQUssUUFBUSxTQUFTLEVBQUU7QUFDL0IsV0FBTyxLQUFLLFFBQVEsY0FBYyxFQUFFO0FBQ3BDLFFBQUksQ0FBQyxnQkFBZ0IsS0FBSyxJQUFJLEVBQUcsUUFBTztBQUN4QyxXQUFPO0FBQUEsRUFDVDtBQUVPLFdBQVMsa0JBQWtCLE9BQU87QUFDdkMsUUFBSSxDQUFDLE1BQU8sUUFBTztBQUNuQixVQUFNLE9BQU8sSUFBSSxLQUFLLEtBQUs7QUFDM0IsUUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLENBQUMsRUFBRyxRQUFPO0FBQ3pDLFVBQU0sTUFBTSxvQkFBSSxLQUFLO0FBQ3JCLFVBQU0sVUFDSixLQUFLLFlBQVksTUFBTSxJQUFJLFlBQVksS0FDdkMsS0FBSyxTQUFTLE1BQU0sSUFBSSxTQUFTLEtBQ2pDLEtBQUssUUFBUSxNQUFNLElBQUksUUFBUTtBQUNqQyxRQUFJLFNBQVM7QUFDWCxZQUFNQSxRQUFPLE9BQU8sZ0JBQWdCLGdCQUFnQixLQUFLLFVBQVUsWUFBWTtBQUMvRSxhQUFPLEtBQUssbUJBQW1CQSxPQUFNLEVBQUUsTUFBTSxXQUFXLFFBQVEsVUFBVSxDQUFDO0FBQUEsSUFDN0U7QUFDQSxVQUFNLE9BQU8sT0FBTyxnQkFBZ0IsZ0JBQWdCLEtBQUssVUFBVSxZQUFZO0FBQy9FLFdBQU8sS0FBSyxtQkFBbUIsTUFBTSxFQUFFLE9BQU8sV0FBVyxLQUFLLFVBQVUsQ0FBQztBQUFBLEVBQzNFO0FBRUEsaUJBQXNCLGdCQUFnQjtBQUNwQyxRQUFJO0FBQ0YsWUFBTSxTQUFTLE1BQU0sT0FBTyxRQUFRLE1BQU0sSUFBSSxDQUFDLHlCQUF5QixDQUFDO0FBQ3pFLFlBQU0sU0FBUyxNQUFNLFFBQVEsT0FBTyx5QkFBeUIsQ0FBQyxJQUMxRCxPQUFPLHlCQUF5QixJQUNoQyxDQUFDO0FBQUEsSUFDUCxTQUFTLE1BQU07QUFDYixZQUFNLFNBQVMsQ0FBQztBQUFBLElBQ2xCO0FBQUEsRUFDRjtBQUVBLGlCQUFzQixrQkFBa0I7QUFDdEMsUUFBSTtBQUNGLFlBQU0sQ0FBQyxhQUFhLE1BQU0sSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQzlDLE1BQU0sT0FBTyxRQUFRLE9BQU8sMEJBQTBCLENBQUM7QUFBQSxRQUN2RCxPQUFPLFFBQVEsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQUM7QUFBQSxNQUNyRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLE1BQU0sWUFBWSxLQUFLO0FBQ3ZDLFlBQU0sV0FBVyxRQUFRLFNBQVMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxTQUFTLEtBQUssWUFBWSxLQUFLO0FBQzdFLFlBQU0sU0FBUyxNQUFNLFFBQVEsT0FBTyx3QkFBd0IsQ0FBQyxJQUN6RCxPQUFPLHdCQUF3QixJQUMvQixDQUFDO0FBQ0wsWUFBTSxXQUFXLElBQUksSUFBSSxRQUFRLElBQUksQ0FBQyxTQUFTLEtBQUssRUFBRSxDQUFDO0FBQ3ZELFlBQU0sU0FBUyxDQUFDLEdBQUcsT0FBTztBQUMxQixhQUFPLFFBQVEsQ0FBQyxTQUFTO0FBQ3ZCLFlBQUksUUFBUSxDQUFDLFNBQVMsSUFBSSxLQUFLLEVBQUUsR0FBRztBQUNsQyxpQkFBTyxLQUFLLElBQUk7QUFDaEIsbUJBQVMsSUFBSSxLQUFLLEVBQUU7QUFBQSxRQUN0QjtBQUFBLE1BQ0YsQ0FBQztBQUNELFlBQU0sV0FBVztBQUFBLElBQ25CLFNBQVMsTUFBTTtBQUNiLFlBQU0sV0FBVyxDQUFDO0FBQUEsSUFDcEI7QUFBQSxFQUNGO0FBRUEsaUJBQXNCLGlCQUFpQjtBQUNyQyxRQUFJO0FBQ0YsWUFBTSxTQUFTLE1BQU0sT0FBTyxRQUFRLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixDQUFDO0FBQzFFLFlBQU0saUJBQWlCLE1BQU0sUUFBUSxPQUFPLDBCQUEwQixDQUFDLElBQ25FLE9BQU8sMEJBQTBCLEVBQUUsTUFBTSxHQUFHLENBQUMsSUFDN0MsQ0FBQztBQUFBLElBQ1AsU0FBUyxNQUFNO0FBQ2IsWUFBTSxpQkFBaUIsQ0FBQztBQUFBLElBQzFCO0FBQUEsRUFDRjtBQUVBLGlCQUFzQixzQkFBc0I7QUFDMUMsUUFBSTtBQUNGLFlBQU0sU0FBUyxNQUFNLE9BQU8sUUFBUSxNQUFNLElBQUksQ0FBQyx5QkFBeUIsQ0FBQztBQUN6RSxZQUFNLFNBQVMsTUFBTSxRQUFRLE9BQU8seUJBQXlCLENBQUMsSUFDMUQsT0FBTyx5QkFBeUIsSUFDaEMsQ0FBQztBQUNMLFlBQU0sZUFBZSxPQUFPLElBQUksQ0FBQyxPQUFPLFFBQVE7QUFBQSxRQUM5QyxJQUFJLE9BQU8sTUFBTSxNQUFNLGdCQUFnQixFQUFFLEVBQUU7QUFBQSxRQUMzQyxNQUFNLE9BQU8sTUFBTSxRQUFRLE9BQU87QUFBQSxRQUNsQyxTQUFTLE1BQU0sUUFBUSxNQUFNLE9BQU8sSUFDaEMsTUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLFFBQVE7QUFBQSxVQUM1QixJQUFJLE9BQU8sRUFBRSxNQUFNLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFBRTtBQUFBLFVBQ3ZDLE9BQU8sT0FBTyxFQUFFLFNBQVMsUUFBUTtBQUFBLFVBQ2pDLFNBQVMsT0FBTyxFQUFFLFdBQVcsRUFBRTtBQUFBLFFBQ2pDLEVBQUUsSUFDRixDQUFDO0FBQUEsTUFDUCxFQUFFO0FBQ0YsVUFBSSxDQUFDLE1BQU0sYUFBYSxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sTUFBTSxtQkFBbUIsR0FBRztBQUN2RSxjQUFNLHNCQUFzQixNQUFNLGFBQWEsQ0FBQyxHQUFHLE1BQU07QUFBQSxNQUMzRDtBQUFBLElBQ0YsU0FBUyxNQUFNO0FBQ2IsWUFBTSxlQUFlLENBQUM7QUFBQSxJQUN4QjtBQUFBLEVBQ0Y7QUFFQSxpQkFBc0IsaUJBQWlCO0FBQ3JDLFFBQUk7QUFDRixZQUFNLFNBQVMsTUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUM7QUFDcEUsWUFBTSxVQUFVLGlCQUFpQixPQUFPLG9CQUFvQixDQUFDO0FBQUEsSUFDL0QsU0FBUyxNQUFNO0FBQ2IsWUFBTSxVQUFVLGlCQUFpQjtBQUFBLElBQ25DO0FBQUEsRUFDRjs7O0FDN0pBLE1BQU0sT0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUE0U2IsTUFBTSxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFrSVgsT0FBTyxjQUFjLGVBQWUsRUFBRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7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
