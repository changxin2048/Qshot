import { UI_PREFS_STORAGE_KEY } from "./shared/storage-keys.js";
import { ensureInitialStateDefaults } from "./background/initial-state.js";
import { syncCommandShortcut } from "./background/shortcut-sync.js";
import { openComparePage, runSearchGroup, openSiteTabAndSend } from "./background/tabs.js";
import { warmupAiSites } from "./background/warmup.js";

const SETTINGS_PAGE_URL = chrome.runtime.getURL("settings/settings.html");

chrome.runtime.onInstalled.addListener(async () => {
  console.log("Qshot - 子弹搜索 已安装");
  await ensureInitialStateDefaults();
  await syncCommandShortcut();
});

// 当用户在设置里修改快捷键时，同步更新 manifest command 的绑定，
// 这样内置页面的自动弹窗也会跟着用户的设置走。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[UI_PREFS_STORAGE_KEY]) return;
  const newPrefs = changes[UI_PREFS_STORAGE_KEY].newValue;
  if (!newPrefs) return;
  syncCommandShortcut(newPrefs).catch(() => {});
});

// 当用户在任意页面触发 manifest command 时：
// - 普通网页 → 向内容脚本发消息切换浮层
// - 浏览器内置页面（chrome://、edge:// 等）→ 打开扩展弹窗
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-overlay") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab) return;

  const url = tab.url || "";
  const isRestricted =
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    /^https?:\/\/(chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(url);

  if (isRestricted) {
    try {
      await chrome.action.openPopup();
    } catch (_e) {
      /* 部分情况下无法打开弹窗，忽略 */
    }
  } else {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SEARCH_OVERLAY" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "ENSURE_INITIAL_STATE_DEFAULTS") {
    ensureInitialStateDefaults()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "SETTINGS_SAVED") {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "OPEN_COMPARE_PAGE") {
    openComparePage(message.query)
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "RUN_SEARCH_GROUP") {
    runSearchGroup(message.group, message.query)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "OPEN_SETTINGS_PAGE") {
    const section = message.section ? `?section=${message.section}` : "";
    chrome.tabs.create({ url: SETTINGS_PAGE_URL + section })
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "OPEN_EXTERNAL_URL") {
    chrome.tabs.create({ url: message.url, active: true })
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "OPEN_SITE_TAB_AND_SEND") {
    openSiteTabAndSend(message.site, message.query)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "WARMUP_AI_SITES") {
    warmupAiSites()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
