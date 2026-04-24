import {
  SEARCH_GROUPS_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY,
  PROMPT_GROUPS_STORAGE_KEY,
  UI_PREFS_STORAGE_KEY,
  CUSTOM_SITES_STORAGE_KEY,
  RANDOM_QUESTIONS_STORAGE_KEY,
  DEFAULT_PROMPT_GROUP_ID,
} from "../shared/storage-keys.js";
import {
  getAllPromptGroupName,
  isAllPromptGroup,
  getPromptGroupDisplayName,
  getDisplayPromptEntries,
} from "../shared/prompt-groups.js";
import {
  matchShortcut,
  normalizeShortcut,
  normalizeKey,
} from "../shared/shortcut.js";

(function initQshotOverlay() {
  if (window.__QSHOT_OVERLAY_INSTALLED__) {
    return;
  }
  window.__QSHOT_OVERLAY_INSTALLED__ = true;

  const t = (key, substitutions, fallback = "") => {
    try {
      const msg = chrome?.i18n?.getMessage?.(key, substitutions);
      return msg || fallback || "";
    } catch (_e) {
      return fallback || "";
    }
  };
  // 随机问题题库：优先读 chrome.storage.local 里用户在设置中维护的内容；
  // 首次运行时 fallback 到 config/random-questions/*.txt 的默认题库。
  // 解析规则：一行一题，空行与以 # 开头的注释行会被忽略。
  const RANDOM_QUESTIONS_FILES = {
    zh: "config/random-questions/zh-CN.txt",
    en: "config/random-questions/en.txt"
  };
  let randomQuestionsPromise = null;
  let lastRandomQuestionIndex = -1;
  function parseRandomQuestionsText(text) {
    if (typeof text !== "string") return [];
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  }
  async function fetchDefaultRandomQuestionsText() {
    const lang = (() => {
      try {
        return (chrome?.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase();
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
      try {
        const stored = await chrome.storage.local.get([RANDOM_QUESTIONS_STORAGE_KEY]);
        const raw = stored[RANDOM_QUESTIONS_STORAGE_KEY];
        // 旧版默认内容以 # 注释块开头，视为未自定义，回退到新默认题库
        const isOldDefault = typeof raw === "string" && raw.trimStart().startsWith("#");
        if (typeof raw === "string" && !isOldDefault) {
          return parseRandomQuestionsText(raw);
        }
      } catch (_e) {
        /* 忽略，回退到默认文件 */
      }
      return parseRandomQuestionsText(await fetchDefaultRandomQuestionsText());
    })();
    return randomQuestionsPromise;
  }
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[RANDOM_QUESTIONS_STORAGE_KEY]) {
        randomQuestionsPromise = null;
        lastRandomQuestionIndex = -1;
      }
    });
  } catch (_e) {
    /* chrome.storage 不可用时忽略 */
  }

  // 根据 Shadow DOM 承载，样式不会污染宿主页面
  const OVERLAY_STYLES = `
    :host {
      all: initial;
      --qshot-panel-scale: 1.167;
      --qshot-panel-offset-y: -12px;
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
      width: 440px;
      max-width: calc(100vw - 32px);
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
      padding: 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      animation: qshotPopIn 180ms cubic-bezier(.2,.9,.3,1.1) forwards;
      transform: translateY(var(--qshot-panel-offset-y)) scale(var(--qshot-panel-scale));
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
    .composer.is-expanded {
      min-height: 118px;
      padding: 12px 14px;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
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

    .history-section {
      padding: 0;
    }

    .history-section[hidden] {
      display: none !important;
    }

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

    .history-delete-btn:hover {
      color: #6b6b6b;
    }

    /* 提示词 picker */
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
    /* 预览卡片（由 shared/prompt-item.js 统一提供） */
    ${window.PromptItemUI?.PREVIEW_CSS ?? ""}

    .panel-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
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

    .panel {
      position: relative;
    }
    .settings-corner-btn {
      position: absolute;
      bottom: 10px;
      right: 10px;
      width: 26px;
      height: 26px;
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
      width: 14px;
      height: 14px;
      display: block;
      flex-shrink: 0;
    }
  `;

  const LOGO_URL = chrome.runtime.getURL("popup/logo.svg");

  const DICE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M817.493333 310.997333L533.333333 146.944a42.666667 42.666667 0 0 0-42.666666 0L206.506667 310.997333a42.666667 42.666667 0 0 0-21.333334 36.949334v328.106666a42.666667 42.666667 0 0 0 21.333334 36.992l284.16 164.053334a42.666667 42.666667 0 0 0 42.666666 0l284.16-164.053334a42.666667 42.666667 0 0 0 21.333334-36.992v-328.106666a42.666667 42.666667 0 0 0-21.333334-36.949334zM554.666667 109.994667l284.16 164.053333a85.333333 85.333333 0 0 1 42.666666 73.898667v328.106666a85.333333 85.333333 0 0 1-42.666666 73.898667L554.666667 914.090667a85.333333 85.333333 0 0 1-85.333334 0l-284.16-164.053334a85.333333 85.333333 0 0 1-42.666666-73.898666V347.904a85.333333 85.333333 0 0 1 42.666666-73.898667L469.333333 109.994667a85.333333 85.333333 0 0 1 85.333334 0z"/><path d="M490.666667 524.501333L160.213333 338.602667l20.906667-37.205334L512 487.552l330.88-186.154667 20.906667 37.205334-330.453334 185.898666V896h-42.666666v-371.498667z"/><path d="M469.333333 298.666667a42.666667 42.666667 0 1 0 85.333334 0 42.666667 42.666667 0 0 0-85.333334 0zM347.861333 633.941333a32.725333 32.725333 0 1 1-32.725333-56.661333 32.725333 32.725333 0 0 1 32.725333 56.661333zM286.72 535.296a32.682667 32.682667 0 1 1-32.682667-56.533333 32.682667 32.682667 0 0 1 32.682667 56.533333zM414.72 727.296a32.682667 32.682667 0 1 1-32.682667-56.533333 32.682667 32.682667 0 0 1 32.682667 56.533333zM712.32 558.890667a32.725333 32.725333 0 1 0 32.682667-56.661334 32.725333 32.725333 0 0 0-32.682667 56.661334zM625.621333 709.034667a32.682667 32.682667 0 1 0 32.682667-56.618667 32.682667 32.682667 0 0 0-32.682667 56.618667z"/></svg>`;

  const SPARKLE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M855.071605 339.499431l-10.216418 26.934193c-7.430122 19.718401-31.077915 19.718401-38.508037 0l-10.144975-26.934193c-18.146645-48.010021-50.724873-86.303727-91.447658-107.165224l-31.435132-16.146227c-16.860662-8.716105-16.860662-37.150611 0-45.866717l29.649045-15.217461c41.722994-21.433045 75.015657-61.084178 92.805084-110.737399l10.430749-29.148941c7.287235-20.289949 31.506576-20.289949 38.793811 0l10.430749 29.148941c17.860871 49.653221 51.08209 89.304354 92.876528 110.737399l29.577602 15.217461c16.932105 8.716105 16.932105 37.150611 0 45.866717l-31.363689 16.074783c-40.722785 20.932941-73.372457 59.226647-91.447659 107.236668zM413.265106 95.234163h164.891559v95.305606H413.265106c-136.671383 0-247.480225 127.883835-247.480225 285.773932 0 171.89302 101.592633 284.130732 329.926005 403.87001v-118.096078h82.445779c136.671383 0 247.480225-127.955278 247.480225-285.773932h82.44578c0 210.401057-147.673679 381.008095-329.926005 381.008095v166.677646C371.970773 928.765279 83.339102 785.878313 83.339102 476.313701 83.339102 265.769757 231.012781 95.234163 413.265106 95.234163z"/></svg>`;

  let hostEl = null;
  let shadowRoot = null;
  let isOpen = false;
  let groups = [];
  let allSites = [];
  let historyEntries = [];
  let promptGroups = [];
  let uiPrefs = normalizeUiPrefs();
  let activePromptGroupId = null;
  let isPromptPickerOpen = false;
  let _overlayPreviewMgr = null;
  let _groupTooltipTimer = null;
  let _groupTooltipHideTimer = null;

  const isTopFrame = (function detectTop() {
    try {
      return window.top === window;
    } catch (_e) {
      // 跨域受限时访问 window.top 会抛错，认为不是顶层
      return false;
    }
  })();

  const FRAME_TOGGLE_MESSAGE = "__QSHOT_FRAME_TOGGLE__";
  const MAIN_HOTKEY_FIRE = "__QSHOT_HOTKEY_FIRE__";
  const MAIN_HOTKEY_ESC = "__QSHOT_HOTKEY_ESC__";
  const MAIN_HOTKEY_CONFIG = "__QSHOT_HOTKEY_CONFIG__";

  // 启动时先读一次配置，并同步给 MAIN world 的键盘监听器
  refreshUiPrefs().then(syncShortcutToMainWorld).catch(() => {});

  // 监听消息：
  // 1. 来自 MAIN world 的快捷键触发（主通道）
  // 2. 来自子 frame 的 window.top.postMessage 转发（浮层 UI 只在顶层渲染）
  window.addEventListener("message", (event) => {
    if (event.source !== window && !isTopFrame) return;
    const data = event.data;
    if (!data) return;

    if (data.type === MAIN_HOTKEY_FIRE) {
      if (isTopFrame) {
        toggleOverlay();
      } else {
        // 子 frame 收到 MAIN world 的触发 → 转发到顶层
        // Review note (CWS/Edge Add-ons):
        // - This postMessage only forwards an "open/close overlay" signal between frames in the same tab.
        // - It does NOT include user input. targetOrigin uses "*" here because cross-origin frames may exist; the browser enforces same-origin constraints.
        try {
          window.top.postMessage({ type: FRAME_TOGGLE_MESSAGE }, "*");
        } catch (_err) {
          /* 忽略跨域错误 */
        }
      }
      return;
    }

    if (data.type === MAIN_HOTKEY_ESC) {
      if (isTopFrame && isOpen) {
        closeOverlay();
      } else if (!isTopFrame) {
        // Same as above: only forwards an Escape-close signal, no user input included.
        try { window.top.postMessage({ type: MAIN_HOTKEY_ESC }, "*"); } catch (_e) {}
      }
      return;
    }

    if (data.type === FRAME_TOGGLE_MESSAGE && isTopFrame) {
      toggleOverlay();
    }
  });

  // 仍然在 isolated world 挂一份 keydown 监听，作为 MAIN world 失效时的兜底，
  // 以及处理浮层打开后的 Esc 关闭（MAIN world 不处理 Esc）
  window.addEventListener("keydown", handleGlobalKeydown, true);
  document.addEventListener("keydown", handleGlobalKeydown, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "TOGGLE_SEARCH_OVERLAY") {
      return false;
    }
    if (!isTopFrame) return false;
    toggleOverlay().finally(() => sendResponse && sendResponse({ ok: true }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[UI_PREFS_STORAGE_KEY]) {
      refreshUiPrefs().then(() => {
        syncShortcutToMainWorld();
        if (isOpen) {
          applyUiPrefs();
          renderHistoryIfOpen();
          renderPromptPickerIfOpen();
        }
      });
    }
    if (!isOpen) return;
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
    // isolated world 的 keydown 只负责一件事：浮层打开时，Esc 关闭它。
    // 快捷键触发浮层的职责完全交给 MAIN world（overlay_main.js），
    // 避免两个 world 都匹配同一按键导致 toggle 两次相消。
    if (!isTopFrame || !isOpen) return;
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeOverlay();
  }

  async function toggleOverlay() {
    if (isOpen) {
      closeOverlay();
    } else {
      await openOverlay();
    }
  }

  async function openOverlay() {
    if (isOpen || !isTopFrame) return;
    await Promise.all([refreshGroups(), refreshAllSites(), refreshHistory(), refreshPromptGroups(), refreshUiPrefs()]);
    if (!activePromptGroupId) {
      activePromptGroupId = promptGroups[0]?.id || null;
    }
    mountOverlay();
    isOpen = true;
    // Review note (CWS/Edge Add-ons):
    // - "Prewarm" is performance-only (reduces first-load latency for heavy AI sites).
    // - Requests go directly to user-selected third-party sites; the extension does NOT send user data to any developer-controlled server and does NOT read response bodies (see background.js).
    // 触发预热（复用 popup 中的行为）
    try {
      chrome.runtime.sendMessage({ type: "WARMUP_AI_SITES" }).catch(() => {});
    } catch (_err) {
      /* 忽略 */
    }
  }

  function closeOverlay() {
    if (!isOpen) return;
    isPromptPickerOpen = false;
    hideGroupTooltip();
    if (_overlayPreviewMgr) { _overlayPreviewMgr.destroy(); _overlayPreviewMgr = null; }
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadowRoot = null;
    isOpen = false;
  }

  function mountOverlay() {
    hostEl = document.createElement("div");
    hostEl.id = "qshot-search-overlay-host";
    hostEl.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483646;";
    shadowRoot = hostEl.attachShadow({ mode: "closed" });

    const styleEl = document.createElement("style");
    styleEl.textContent = OVERLAY_STYLES;
    shadowRoot.appendChild(styleEl);

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) {
        closeOverlay();
      }
    });

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.addEventListener("mousedown", (event) => {
      // 点击面板内部时，若点击到非 prompt 区域则关闭 picker
      const target = event.target;
      if (target instanceof Element) {
        if (!target.closest(".prompt-picker") && !target.closest(".icon-btn.sparkle")) {
          if (isPromptPickerOpen) {
            isPromptPickerOpen = false;
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
    logo.addEventListener("error", () => { logo.style.display = "none"; });
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
      isPromptPickerOpen = false;
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
      isPromptPickerOpen = !isPromptPickerOpen;
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
      if (_groupTooltipHideTimer) {
        clearTimeout(_groupTooltipHideTimer);
        _groupTooltipHideTimer = null;
      }
    });
    groupTooltip.addEventListener("mouseleave", () => {
      scheduleHideGroupTooltip();
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
    shadowRoot.appendChild(backdrop);

    document.documentElement.appendChild(hostEl);

    // 绑定行为
    queryInput.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (isPromptPickerOpen) {
          isPromptPickerOpen = false;
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

    // 全局 Esc 兜底（焦点不在输入框时也能关）
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

    // 聚焦输入框
    setTimeout(() => queryInput.focus(), 0);
  }

  function applyUiPrefs() {
    if (!shadowRoot) return;
    const diceBtn = shadowRoot.querySelector(".icon-btn.dice");
    const sparkleBtn = shadowRoot.querySelector(".icon-btn.sparkle");
    const actionsRow = shadowRoot.querySelector(".actions-row");
    const historySection = shadowRoot.querySelector(".history-section");
    if (diceBtn) {
      diceBtn.style.display = uiPrefs.showRandomButton === false ? "none" : "inline-flex";
    }
    if (sparkleBtn) {
      sparkleBtn.style.display = uiPrefs.showPromptButton === false ? "none" : "inline-flex";
    }
    if (actionsRow) {
      const hasVisible = uiPrefs.showRandomButton !== false || uiPrefs.showPromptButton !== false;
      actionsRow.style.display = hasVisible ? "flex" : "none";
    }
    if (historySection instanceof HTMLElement) {
      historySection.hidden = uiPrefs.showHistory === false;
      historySection.style.display = uiPrefs.showHistory === false ? "none" : "block";
    }
  }

  function syncComposerLayout() {
    if (!shadowRoot) return;
    const composer = shadowRoot.querySelector(".composer");
    const queryInput = shadowRoot.querySelector(".query-input");
    if (!composer || !queryInput) return;

    composer.classList.remove("is-expanded");
    queryInput.style.height = "0px";
    const scrollH = queryInput.scrollHeight;
    const lineHeight = parseFloat(getComputedStyle(queryInput).lineHeight || "20");
    queryInput.style.height = "";
    composer.classList.toggle("is-expanded", scrollH > lineHeight * 1.7);
  }

  function renderGroupsIfOpen() {
    if (!shadowRoot) return;
    const container = shadowRoot.querySelector(".groups");
    if (!container) return;
    container.innerHTML = "";

    groups.forEach((group) => {
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
    return (group?.siteIds || [])
      .map((id) => allSites.find((site) => site.id === id))
      .filter((site) => site && normalizeSiteHomeUrl(site.url))
      .map((site) => ({
        id: site.id,
        name: site.name || site.id,
        url: normalizeSiteHomeUrl(site.url)
      }));
  }

  function getGroupTooltipEl() {
    return shadowRoot?.querySelector(".group-tooltip") || null;
  }

  function showGroupTooltip(button, sites) {
    if (!shadowRoot) return;
    if (_groupTooltipTimer) {
      clearTimeout(_groupTooltipTimer);
      _groupTooltipTimer = null;
    }
    if (_groupTooltipHideTimer) {
      clearTimeout(_groupTooltipHideTimer);
      _groupTooltipHideTimer = null;
    }

    _groupTooltipTimer = setTimeout(() => {
      const tooltip = getGroupTooltipEl();
      const panel = shadowRoot?.querySelector(".panel");
      if (!(tooltip instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
        return;
      }

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
        if (top < 0) {
          top = btnRect.bottom - panelRect.top + 8;
        }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
    }, 450);
  }

  function hideGroupTooltip() {
    if (_groupTooltipTimer) {
      clearTimeout(_groupTooltipTimer);
      _groupTooltipTimer = null;
    }
    if (_groupTooltipHideTimer) {
      clearTimeout(_groupTooltipHideTimer);
      _groupTooltipHideTimer = null;
    }
    const tooltip = getGroupTooltipEl();
    if (tooltip instanceof HTMLElement) {
      tooltip.style.display = "none";
    }
  }

  function scheduleHideGroupTooltip() {
    if (_groupTooltipTimer) {
      clearTimeout(_groupTooltipTimer);
      _groupTooltipTimer = null;
    }
    if (_groupTooltipHideTimer) {
      clearTimeout(_groupTooltipHideTimer);
    }
    _groupTooltipHideTimer = setTimeout(() => {
      const tooltip = getGroupTooltipEl();
      if (tooltip instanceof HTMLElement) {
        tooltip.style.display = "none";
      }
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

  function renderHistoryIfOpen() {
    if (!shadowRoot) return;
    const historyList = shadowRoot.querySelector(".history-list");
    if (!(historyList instanceof HTMLElement)) return;

    historyList.innerHTML = "";

    if (!historyEntries.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = t("overlay_emptyHistory", null, "暂无搜索记录");
      historyList.appendChild(empty);
      return;
    }

    historyEntries.forEach((entry) => {
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
        const queryInput = shadowRoot?.querySelector(".query-input");
        if (queryInput instanceof HTMLTextAreaElement) {
          queryInput.value = entry?.query || "";
          syncComposerLayout();
          queryInput.focus();
        }
      });
      historyList.appendChild(item);
    });
  }

  function renderPromptPickerIfOpen() {
    if (!shadowRoot) return;
    const picker = shadowRoot.querySelector(".prompt-picker");
    if (!picker) return;

    picker.innerHTML = "";
    if (!isPromptPickerOpen || uiPrefs.showPromptButton === false) {
      picker.hidden = true;
      return;
    }
    picker.hidden = false;

    if (!promptGroups.length) {
      const empty = document.createElement("div");
      empty.className = "prompt-empty";
      empty.textContent = t("overlay_emptyPromptGroups", null, "还没有提示词分组，请先去设置里添加。");
      picker.appendChild(empty);
      return;
    }

    const activeGroup = promptGroups.find((g) => g.id === activePromptGroupId) || promptGroups[0];
    activePromptGroupId = activeGroup.id;

    const groupsCol = document.createElement("div");
    groupsCol.className = "prompt-groups-col";
    promptGroups.forEach((group) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `prompt-group-item${group.id === activeGroup.id ? " is-active" : ""}`;
      btn.textContent = getPromptGroupDisplayName(group);
      btn.addEventListener("mouseenter", () => {
        if (activePromptGroupId === group.id) return;
        activePromptGroupId = group.id;
        renderPromptPickerIfOpen();
      });
      btn.addEventListener("click", () => {
        activePromptGroupId = group.id;
        renderPromptPickerIfOpen();
      });
      groupsCol.appendChild(btn);
    });

    const listCol = document.createElement("div");
    listCol.className = "prompt-list-col";
    const entries = getDisplayPromptEntries(activeGroup, promptGroups);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "prompt-empty";
      empty.textContent = t("overlay_emptyPromptsInGroup", null, "这个分组里还没有提示词。");
      listCol.appendChild(empty);
    } else {
      entries.forEach(({ prompt }) => {
        const item = document.createElement("div");
        item.className = "prompt-item";

        const label = document.createElement("span");
        label.className = "prompt-item-label";
        label.textContent = prompt.title || t("overlay_unnamedPrompt", null, "未命名提示词");
        label.addEventListener("click", () => {
          const queryInput = shadowRoot.querySelector(".query-input");
          if (queryInput instanceof HTMLTextAreaElement) {
            queryInput.value = prompt.content || "";
            syncComposerLayout();
            queryInput.focus();
          }
          isPromptPickerOpen = false;
          hideOvPreview();
          renderPromptPickerIfOpen();
        });

        const icons = document.createElement("div");
        icons.className = "prompt-item-icons";

        if (!_overlayPreviewMgr) {
          _overlayPreviewMgr = window.PromptItemUI.createPreviewManager(shadowRoot);
        }
        const overlayItem = window.PromptItemUI.createItem(prompt, {
          itemClass: "prompt-item",
          labelClass: "prompt-item-label",
          iconsClass: "prompt-item-icons",
          iconBtnClass: "prompt-icon-btn",
          onFill: (p) => {
            const queryInput = shadowRoot.querySelector(".query-input");
            if (queryInput instanceof HTMLTextAreaElement) {
              queryInput.value = p.content || "";
              syncComposerLayout();
              queryInput.focus();
            }
            isPromptPickerOpen = false;
            if (_overlayPreviewMgr) _overlayPreviewMgr.hide();
            renderPromptPickerIfOpen();
          },
          onEdit: () => {
            chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE", section: "prompts" }).catch(() => {});
            closeOverlay();
          },
          previewManager: _overlayPreviewMgr,
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
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE", section: "prompts" }).catch(() => {});
      closeOverlay();
    });
    footer.appendChild(footerBtn);

    picker.appendChild(groupsCol);
    picker.appendChild(listCol);
    picker.appendChild(footer);
  }

  async function fillRandomQuestion() {
    if (!shadowRoot) return;
    const questions = await loadRandomQuestions();
    if (!questions.length) return;
    const queryInput = shadowRoot.querySelector(".query-input");
    if (!(queryInput instanceof HTMLTextAreaElement)) return;
    // 防重复：题库有 2 条及以上时，避免连续两次抽到同一条。
    let idx = Math.floor(Math.random() * questions.length);
    if (questions.length > 1 && idx === lastRandomQuestionIndex) {
      idx = (idx + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length;
    }
    lastRandomQuestionIndex = idx;
    queryInput.value = questions[idx];
    syncComposerLayout();
    queryInput.focus();
  }

  async function runDefaultSearch() {
    if (!groups.length) return;
    await runGroup(groups[0]);
  }

  async function runGroup(group) {
    if (!shadowRoot) return;
    const queryInput = shadowRoot.querySelector(".query-input");
    const query = queryInput instanceof HTMLTextAreaElement ? queryInput.value.trim() : "";
    try {
      await chrome.runtime.sendMessage({
        type: "RUN_SEARCH_GROUP",
        group,
        query
      });
    } catch (_err) {
      /* 忽略 */
    }
    closeOverlay();
  }

  async function refreshGroups() {
    try {
      const stored = await chrome.storage.local.get([SEARCH_GROUPS_STORAGE_KEY]);
      groups = Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) ? stored[SEARCH_GROUPS_STORAGE_KEY] : [];
    } catch (_err) {
      groups = [];
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
      allSites = merged;
    } catch (_err) {
      allSites = [];
    }
  }

  async function refreshHistory() {
    try {
      const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
      historyEntries = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY])
        ? stored[SEARCH_HISTORY_STORAGE_KEY].slice(0, 4)
        : [];
    } catch (_err) {
      historyEntries = [];
    }
  }

  async function refreshPromptGroups() {
    try {
      const stored = await chrome.storage.local.get([PROMPT_GROUPS_STORAGE_KEY]);
      const source = Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY]) ? stored[PROMPT_GROUPS_STORAGE_KEY] : [];
      promptGroups = source.map((group, gi) => ({
        id: String(group.id || `prompt-group-${gi}`),
        name: String(group.name || "未命名分组"),
        prompts: Array.isArray(group.prompts)
          ? group.prompts.map((p, pi) => ({
              id: String(p.id || `prompt-${gi}-${pi}`),
              title: String(p.title || "未命名提示词"),
              content: String(p.content || "")
            }))
          : []
      }));
      if (!promptGroups.some((g) => g.id === activePromptGroupId)) {
        activePromptGroupId = promptGroups[0]?.id || null;
      }
    } catch (_err) {
      promptGroups = [];
    }
  }

  async function refreshUiPrefs() {
    try {
      const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
      uiPrefs = normalizeUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
    } catch (_err) {
      uiPrefs = normalizeUiPrefs();
    }
  }

  async function openSiteHome(url) {
    const safeUrl = normalizeSiteHomeUrl(url);
    if (!safeUrl) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url: safeUrl });
    } catch (_err) {
      /* 忽略 */
    }

    closeOverlay();
  }

  async function removeHistoryEntry(entry) {
    try {
      const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
      const fullHistory = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY] : [];
      if (!fullHistory.length) {
        return;
      }

      let removed = false;
      const nextHistory = fullHistory.filter((item) => {
        if (removed) {
          return true;
        }

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

      if (!removed) {
        return;
      }

      await chrome.storage.local.set({ [SEARCH_HISTORY_STORAGE_KEY]: nextHistory });
    } catch (_err) {
      /* 忽略 */
    }
  }

  function formatHistoryDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (sameDay) {
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    return date.toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric"
    });
  }

  function normalizeSiteHomeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) {
      return "";
    }

    let next = raw.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => (sep === "?" ? "?" : ""));
    next = next.replace(/\?&/, "?");
    next = next.replace(/[?&]$/, "");
    next = next.replace(/\{query\}/g, "");
    if (!/^https?:\/\//i.test(next)) {
      return "";
    }
    return next;
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

  function syncShortcutToMainWorld() {
    try {
      window.postMessage(
        {
          type: MAIN_HOTKEY_CONFIG,
          enabled: uiPrefs.overlayShortcutEnabled !== false,
          shortcut: uiPrefs.overlayShortcut
        },
        // Review note (CWS/Edge Add-ons): this message only syncs hotkey config between isolated world and MAIN world; no user input is included.
        window.location.origin
      );
    } catch (_err) {
      /* 忽略 */
    }
  }

})();
