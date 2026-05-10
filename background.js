(() => {
  // src/shared/storage-keys.js
  var SEARCH_GROUPS_STORAGE_KEY = "searchGroups";
  var UI_PREFS_STORAGE_KEY = "uiPrefs";

  // src/background/initial-state.js
  var DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY = "defaultSocialOverseasGroupMigrated";
  var DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY = "defaultSocialOverseasModeMigrated";
  var DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY = "defaultSocialOverseasTiktokMigrated";
  async function ensureInitialStateDefaults() {
    const stored = await chrome.storage.local.get([
      SEARCH_GROUPS_STORAGE_KEY,
      "promptGroups",
      "customSites",
      UI_PREFS_STORAGE_KEY,
      DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY,
      DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY,
      DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY
    ]);
    const hasGroups = Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) && stored[SEARCH_GROUPS_STORAGE_KEY].length > 0;
    const hasPromptGroups = Array.isArray(stored.promptGroups) && stored.promptGroups.length > 0;
    const hasCustomSites = Array.isArray(stored.customSites);
    const hasUiPrefs = stored[UI_PREFS_STORAGE_KEY] && typeof stored[UI_PREFS_STORAGE_KEY] === "object";
    const shouldReplaceLegacyPromptGroups = isLegacyDefaultPromptGroups(stored.promptGroups);
    const shouldAddDefaultSocialOverseasGroup = shouldAddDefaultGroup(
      stored[SEARCH_GROUPS_STORAGE_KEY],
      "default-social-overseas",
      stored[DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY]
    );
    const shouldMigrateDefaultSocialOverseasMode = shouldMigrateDefaultGroupMode(
      stored[SEARCH_GROUPS_STORAGE_KEY],
      "default-social-overseas",
      stored[DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY]
    );
    const shouldAddTiktokToOverseas = shouldAddSiteIdToGroup(
      stored[SEARCH_GROUPS_STORAGE_KEY],
      "default-social-overseas",
      "tiktok",
      stored[DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY]
    );
    if (hasGroups && !shouldAddDefaultSocialOverseasGroup && !shouldMigrateDefaultSocialOverseasMode && !shouldAddTiktokToOverseas && hasPromptGroups && !shouldReplaceLegacyPromptGroups && hasCustomSites && hasUiPrefs) {
      return;
    }
    const defaults = await loadInitialStateFromConfig().catch(() => null);
    if (!defaults) {
      return;
    }
    const patch = {};
    if (!hasGroups && Array.isArray(defaults.searchGroups) && defaults.searchGroups.length > 0) {
      patch[SEARCH_GROUPS_STORAGE_KEY] = defaults.searchGroups;
      patch[DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY] = true;
    } else if (shouldAddDefaultSocialOverseasGroup && Array.isArray(defaults.searchGroups)) {
      const defaultGroup = defaults.searchGroups.find((group) => group.id === "default-social-overseas");
      if (defaultGroup) {
        patch[SEARCH_GROUPS_STORAGE_KEY] = [...stored[SEARCH_GROUPS_STORAGE_KEY], defaultGroup];
        patch[DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY] = true;
        patch[DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY] = true;
      }
    } else if (shouldMigrateDefaultSocialOverseasMode || shouldAddTiktokToOverseas) {
      patch[SEARCH_GROUPS_STORAGE_KEY] = stored[SEARCH_GROUPS_STORAGE_KEY].map((group) => {
        if (group?.id !== "default-social-overseas") return group;
        const next = { ...group };
        if (shouldMigrateDefaultSocialOverseasMode) {
          next.mode = "tabs";
        }
        if (shouldAddTiktokToOverseas) {
          const siteIds = Array.isArray(next.siteIds) ? [...next.siteIds] : [];
          if (!siteIds.includes("tiktok")) siteIds.push("tiktok");
          next.siteIds = siteIds;
        }
        return next;
      });
      if (shouldMigrateDefaultSocialOverseasMode) {
        patch[DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY] = true;
      }
      if (shouldAddTiktokToOverseas) {
        patch[DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY] = true;
      }
    }
    if ((!hasPromptGroups || shouldReplaceLegacyPromptGroups) && Array.isArray(defaults.promptGroups) && defaults.promptGroups.length > 0) {
      patch.promptGroups = defaults.promptGroups;
    }
    if (!hasCustomSites && Array.isArray(defaults.customSites)) {
      patch.customSites = defaults.customSites;
    }
    if (!hasUiPrefs && defaults.uiPrefs && typeof defaults.uiPrefs === "object") {
      patch[UI_PREFS_STORAGE_KEY] = defaults.uiPrefs;
    }
    if (Object.keys(patch).length > 0) {
      await chrome.storage.local.set(patch);
    }
  }
  function isLegacyDefaultPromptGroups(promptGroups) {
    if (!Array.isArray(promptGroups) || promptGroups.length !== 1) return false;
    const [group] = promptGroups;
    const prompts = Array.isArray(group?.prompts) ? group.prompts : [];
    if (prompts.length !== 1) return false;
    const [prompt] = prompts;
    return group.id === "prompt-group-default" && prompt.id === "prompt-default-1" && prompt.title === "总结重点";
  }
  function shouldAddDefaultGroup(groups, groupId, hasMigrated) {
    if (!Array.isArray(groups) || groups.length === 0) return false;
    if (hasMigrated === true) return false;
    return !groups.some((group) => group?.id === groupId);
  }
  function shouldMigrateDefaultGroupMode(groups, groupId, hasMigrated) {
    if (!Array.isArray(groups) || groups.length === 0) return false;
    if (hasMigrated === true) return false;
    const group = groups.find((item) => item?.id === groupId);
    if (!group || group.mode === "tabs") return false;
    return Array.isArray(group.siteIds) && ["twitter", "youtube", "reddit"].every((siteId) => group.siteIds.includes(siteId));
  }
  function shouldAddSiteIdToGroup(groups, groupId, siteId, hasMigrated) {
    if (!Array.isArray(groups) || groups.length === 0) return false;
    if (hasMigrated === true) return false;
    const group = groups.find((item) => item?.id === groupId);
    if (!group || !Array.isArray(group.siteIds)) return false;
    return !group.siteIds.includes(siteId);
  }
  async function loadInitialStateFromConfig() {
    const configPath = getInitialStateConfigPath();
    let resp = await fetch(chrome.runtime.getURL(configPath));
    if (!resp.ok && configPath !== "config/initialState.json") {
      resp = await fetch(chrome.runtime.getURL("config/initialState.json"));
    }
    if (!resp.ok) {
      throw new Error("无法读取初始配置");
    }
    const payload = await resp.json();
    if (!payload || typeof payload !== "object") {
      throw new Error("初始配置无效");
    }
    const { searchGroups, promptGroups, customSites, uiPrefs } = payload;
    if (!Array.isArray(searchGroups) || searchGroups.length === 0) return null;
    if (!Array.isArray(promptGroups) || promptGroups.length === 0) return null;
    if (!Array.isArray(customSites)) return null;
    if (!uiPrefs || typeof uiPrefs !== "object") return null;
    return { searchGroups, promptGroups, customSites, uiPrefs };
  }
  function getInitialStateConfigPath() {
    const lang = getBrowserLanguage();
    if (lang.startsWith("zh")) {
      return "config/initialState.zh-CN.json";
    }
    return "config/initialState.en.json";
  }
  function getBrowserLanguage() {
    try {
      const chromeLang = chrome?.i18n?.getUILanguage?.();
      if (chromeLang) return String(chromeLang).toLowerCase();
    } catch (_e) {
    }
    try {
      return String(navigator?.language || "en").toLowerCase();
    } catch (_e) {
      return "en";
    }
  }

  // src/background/shortcut-sync.js
  function formatShortcutForCommand(sc) {
    if (!sc || !sc.key) return "";
    const parts = [];
    if (sc.ctrlKey) parts.push("Ctrl");
    if (sc.altKey) parts.push("Alt");
    if (sc.shiftKey) parts.push("Shift");
    if (sc.metaKey) parts.push("MacCtrl");
    if (parts.length === 0) return "";
    const key = sc.key.length === 1 ? sc.key.toUpperCase() : sc.key;
    parts.push(key);
    return parts.join("+");
  }
  async function syncCommandShortcut(prefs) {
    try {
      let sc = prefs?.overlayShortcut;
      if (!sc) {
        const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
        sc = stored[UI_PREFS_STORAGE_KEY]?.overlayShortcut;
      }
      if (!sc) return;
      const shortcutStr = formatShortcutForCommand(sc);
      if (!shortcutStr) return;
      await chrome.commands.update({ name: "toggle-overlay", shortcut: shortcutStr });
    } catch (_e) {
    }
  }

  // src/background/sites.js
  var AI_SITE_IDS = [
    "deepseek",
    "doubao",
    "kimi",
    "yuanbao",
    "qwen",
    "gemini",
    "chatgpt",
    "claude",
    "grok"
  ];
  async function loadEnabledSites() {
    const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
    if (!response.ok) {
      throw new Error("无法读取站点配置");
    }
    const payload = await response.json();
    const builtin = (payload.sites || []).filter((site) => site.enabled !== false);
    const custom = await loadCustomSitesFromStorage();
    const seen = new Set(builtin.map((site) => site.id));
    const merged = [...builtin];
    custom.forEach((site) => {
      if (!seen.has(site.id)) {
        merged.push(site);
        seen.add(site.id);
      }
    });
    return merged;
  }
  async function loadCustomSitesFromStorage() {
    try {
      const stored = await chrome.storage.local.get(["customSites"]);
      const list = Array.isArray(stored.customSites) ? stored.customSites : [];
      return list.map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const name = String(raw.name || "").trim();
        const url = String(raw.url || "").trim();
        const id = String(raw.id || "").trim();
        if (!id || !name || !url) return null;
        return {
          id,
          name,
          url,
          enabled: raw.enabled !== false,
          supportIframe: raw.supportIframe !== false,
          supportUrlQuery: raw.supportUrlQuery !== false && url.includes("{query}"),
          matchPatterns: Array.isArray(raw.matchPatterns) ? raw.matchPatterns.map(String) : [],
          isCustom: true
        };
      }).filter((site) => site && site.enabled !== false);
    } catch (_error) {
      return [];
    }
  }
  function buildSiteUrl(site, query) {
    const url = String(site?.url || "");
    if (!url.includes("{query}")) {
      return url;
    }
    if (query && site?.supportUrlQuery) {
      return url.replace(/\{query\}/g, encodeURIComponent(query));
    }
    let next = url.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => sep === "?" ? "?" : "");
    next = next.replace(/\?&/, "?");
    next = next.replace(/[?&]$/, "");
    return next.replace(/\{query\}/g, "");
  }
  function canSearchByUrl(site) {
    return Boolean(site?.supportUrlQuery && String(site.url || "").includes("{query}"));
  }
  function delay(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  // src/background/tabs.js
  var COMPARE_PAGE_BASE_URL = chrome.runtime.getURL("iframe/iframe.html");
  async function openComparePage(query = "", siteIds = []) {
    const targetUrl = buildComparePageUrl(query, siteIds);
    return chrome.tabs.create({ url: targetUrl });
  }
  function buildComparePageUrl(query, siteIds = []) {
    const url = new URL(COMPARE_PAGE_BASE_URL);
    if (query) {
      url.searchParams.set("q", query);
      url.searchParams.set("autosend", "1");
    }
    if (Array.isArray(siteIds) && siteIds.length > 0) {
      url.searchParams.set("sites", siteIds.join(","));
    }
    return url.toString();
  }
  async function runSearchGroup(group, query) {
    if (!group || !group.mode) {
      throw new Error("搜索组配置无效");
    }
    if (group.mode === "tabs") {
      return openSitesInTabs(group.siteIds || [], query);
    }
    const tab = await openComparePage(query, group.siteIds || []);
    return { tabId: tab.id };
  }
  async function openSitesInTabs(siteIds, query) {
    const sites = await loadEnabledSites();
    const targetSites = Array.isArray(siteIds) && siteIds.length > 0 ? sites.filter((site) => siteIds.includes(site.id)) : sites;
    if (targetSites.length === 0) {
      return { tabIds: [] };
    }
    const tabSitePairs = [];
    const firstSite = targetSites[0];
    const firstTab = await chrome.tabs.create({
      url: buildSiteUrl(firstSite, query),
      active: true
    }).catch(() => null);
    if (firstTab) tabSitePairs.push({ tab: firstTab, site: firstSite });
    const remainingSites = targetSites.slice(1);
    const newTabs = await Promise.all(
      remainingSites.map(
        (site) => chrome.tabs.create({ url: buildSiteUrl(site, query), active: false }).catch(() => null)
      )
    );
    newTabs.forEach((tab, idx) => {
      if (tab) tabSitePairs.push({ tab, site: remainingSites[idx] });
    });
    if (query) {
      await Promise.all(
        tabSitePairs.map(async ({ tab, site }) => {
          try {
            if (canSearchByUrl(site)) {
              return;
            }
            await waitForTabComplete(tab.id);
            await sendQueryToTab(tab.id, site, query);
          } catch (_err) {
          }
        })
      );
    }
    const openedTabIds = tabSitePairs.map(({ tab }) => tab.id);
    return { tabIds: openedTabIds };
  }
  async function openSiteTabAndSend(site, query) {
    if (!site || !site.url) {
      throw new Error("站点配置无效");
    }
    const tab = await chrome.tabs.create({
      url: buildSiteUrl(site, query),
      active: true
    });
    if (query && !canSearchByUrl(site)) {
      await waitForTabComplete(tab.id);
      await sendQueryToTab(tab.id, site, query);
    }
    return { tabId: tab.id };
  }
  async function sendQueryToTab(tabId, site, query) {
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "SEARCH_SITE_QUERY",
          site,
          query
        });
        return;
      } catch (_error) {
        await delay(300);
      }
    }
  }
  function waitForTabComplete(tabId, timeoutMs = 2e4) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        reject(new Error("等待标签页加载超时"));
      }, timeoutMs);
      function handleUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") {
          return;
        }
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(handleUpdated);
    });
  }

  // src/background/warmup.js
  var WARMUP_COOLDOWN_MS = 5 * 60 * 1e3;
  var lastWarmupAt = 0;
  async function warmupAiSites() {
    const now = Date.now();
    if (now - lastWarmupAt < WARMUP_COOLDOWN_MS) {
      return { skipped: true, reason: "cooldown" };
    }
    const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
    const prefs = stored[UI_PREFS_STORAGE_KEY] || {};
    if (prefs.prewarmEnabled === false) {
      return { skipped: true, reason: "disabled" };
    }
    const sites = await loadEnabledSites();
    const targets = sites.filter((site) => AI_SITE_IDS.includes(site.id));
    if (targets.length === 0) {
      return { skipped: true, reason: "no-targets" };
    }
    lastWarmupAt = now;
    await Promise.all(
      targets.map((site) => {
        const warmupUrl = (site.url || "").replace("{query}", "");
        if (!warmupUrl || !/^https?:\/\//.test(warmupUrl)) {
          return null;
        }
        return fetch(warmupUrl, {
          credentials: "include",
          mode: "no-cors",
          cache: "default",
          redirect: "follow"
        }).catch(() => null);
      })
    );
    return { warmed: targets.length };
  }

  // src/background.js
  var SETTINGS_PAGE_URL = chrome.runtime.getURL("settings/settings.html");
  chrome.runtime.onInstalled.addListener(async () => {
    console.log("Qshot - 子弹搜索 已安装");
    await ensureInitialStateDefaults();
    await syncCommandShortcut();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[UI_PREFS_STORAGE_KEY]) return;
    const newPrefs = changes[UI_PREFS_STORAGE_KEY].newValue;
    if (!newPrefs) return;
    syncCommandShortcut(newPrefs).catch(() => {
    });
  });
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-overlay") return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    if (!tab) return;
    const url = tab.url || "";
    const isRestricted = !url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.startsWith("chrome-extension://") || /^https?:\/\/(chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/.test(url);
    if (isRestricted) {
      try {
        await chrome.action.openPopup();
      } catch (_e) {
      }
    } else {
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SEARCH_OVERLAY" }).catch(() => {
      });
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }
    if (message.type === "ENSURE_INITIAL_STATE_DEFAULTS") {
      ensureInitialStateDefaults().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "SETTINGS_SAVED") {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "OPEN_COMPARE_PAGE") {
      openComparePage(message.query).then((tab) => sendResponse({ ok: true, tabId: tab.id })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "RUN_SEARCH_GROUP") {
      runSearchGroup(message.group, message.query).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "OPEN_SETTINGS_PAGE") {
      const section = message.section ? `?section=${message.section}` : "";
      chrome.tabs.create({ url: SETTINGS_PAGE_URL + section }).then((tab) => sendResponse({ ok: true, tabId: tab.id })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "OPEN_EXTERNAL_URL") {
      chrome.tabs.create({ url: message.url, active: true }).then((tab) => sendResponse({ ok: true, tabId: tab.id })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "OPEN_SITE_TAB_AND_SEND") {
      openSiteTabAndSend(message.site, message.query).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message.type === "WARMUP_AI_SITES") {
      warmupAiSites().then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3NoYXJlZC9zdG9yYWdlLWtleXMuanMiLCAiLi4vc3JjL2JhY2tncm91bmQvaW5pdGlhbC1zdGF0ZS5qcyIsICIuLi9zcmMvYmFja2dyb3VuZC9zaG9ydGN1dC1zeW5jLmpzIiwgIi4uL3NyYy9iYWNrZ3JvdW5kL3NpdGVzLmpzIiwgIi4uL3NyYy9iYWNrZ3JvdW5kL3RhYnMuanMiLCAiLi4vc3JjL2JhY2tncm91bmQvd2FybXVwLmpzIiwgIi4uL3NyYy9iYWNrZ3JvdW5kLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgY29uc3QgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSA9IFwic2VhcmNoR3JvdXBzXCI7XHJcbmV4cG9ydCBjb25zdCBQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZID0gXCJwcm9tcHRHcm91cHNcIjtcclxuZXhwb3J0IGNvbnN0IFVJX1BSRUZTX1NUT1JBR0VfS0VZID0gXCJ1aVByZWZzXCI7XHJcbmV4cG9ydCBjb25zdCBDVVNUT01fU0lURVNfU1RPUkFHRV9LRVkgPSBcImN1c3RvbVNpdGVzXCI7XHJcbmV4cG9ydCBjb25zdCBSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZID0gXCJyYW5kb21RdWVzdGlvbnNUZXh0XCI7XHJcbmV4cG9ydCBjb25zdCBTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSA9IFwic2VhcmNoSGlzdG9yeVwiO1xyXG5cclxuLy8gVGhlIGZpeGVkIFwiQWxsXCIgcHJvbXB0IGdyb3VwOiBhbHdheXMgZmlyc3QsIGNhbm5vdCBiZSBkZWxldGVkIG9yIHJlbmFtZWQuXHJcbmV4cG9ydCBjb25zdCBERUZBVUxUX1BST01QVF9HUk9VUF9JRCA9IFwicHJvbXB0LWdyb3VwLWRlZmF1bHRcIjtcclxuZXhwb3J0IGNvbnN0IExFR0FDWV9ERUZBVUxUX0dST1VQX05BTUUgPSBcIum7mOiupOWIhue7hFwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IFJBTkRPTV9RVUVTVElPTlNfRklMRVMgPSB7XHJcbiAgemg6IFwiY29uZmlnL3JhbmRvbS1xdWVzdGlvbnMvemgtQ04udHh0XCIsXHJcbiAgZW46IFwiY29uZmlnL3JhbmRvbS1xdWVzdGlvbnMvZW4udHh0XCIsXHJcbn07XHJcbiIsICJpbXBvcnQge1xyXG4gIFNFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVksXHJcbiAgVUlfUFJFRlNfU1RPUkFHRV9LRVksXHJcbn0gZnJvbSBcIi4uL3NoYXJlZC9zdG9yYWdlLWtleXMuanNcIjtcclxuXHJcbmNvbnN0IERFRkFVTFRfU09DSUFMX09WRVJTRUFTX0dST1VQX01JR1JBVEVEX0tFWSA9IFwiZGVmYXVsdFNvY2lhbE92ZXJzZWFzR3JvdXBNaWdyYXRlZFwiO1xyXG5jb25zdCBERUZBVUxUX1NPQ0lBTF9PVkVSU0VBU19NT0RFX01JR1JBVEVEX0tFWSA9IFwiZGVmYXVsdFNvY2lhbE92ZXJzZWFzTW9kZU1pZ3JhdGVkXCI7XHJcbmNvbnN0IERFRkFVTFRfU09DSUFMX09WRVJTRUFTX1RJS1RPS19NSUdSQVRFRF9LRVkgPSBcImRlZmF1bHRTb2NpYWxPdmVyc2Vhc1Rpa3Rva01pZ3JhdGVkXCI7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZW5zdXJlSW5pdGlhbFN0YXRlRGVmYXVsdHMoKSB7XHJcbiAgLy8gT25seSBpbml0aWFsaXplIHdoZW4ga2V5cyBhcmUgbWlzc2luZy9lbXB0eS5cclxuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1xyXG4gICAgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSxcclxuICAgIFwicHJvbXB0R3JvdXBzXCIsXHJcbiAgICBcImN1c3RvbVNpdGVzXCIsXHJcbiAgICBVSV9QUkVGU19TVE9SQUdFX0tFWSxcclxuICAgIERFRkFVTFRfU09DSUFMX09WRVJTRUFTX0dST1VQX01JR1JBVEVEX0tFWSxcclxuICAgIERFRkFVTFRfU09DSUFMX09WRVJTRUFTX01PREVfTUlHUkFURURfS0VZLFxyXG4gICAgREVGQVVMVF9TT0NJQUxfT1ZFUlNFQVNfVElLVE9LX01JR1JBVEVEX0tFWSxcclxuICBdKTtcclxuXHJcbiAgY29uc3QgaGFzR3JvdXBzID0gQXJyYXkuaXNBcnJheShzdG9yZWRbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0pICYmIHN0b3JlZFtTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXS5sZW5ndGggPiAwO1xyXG4gIGNvbnN0IGhhc1Byb21wdEdyb3VwcyA9IEFycmF5LmlzQXJyYXkoc3RvcmVkLnByb21wdEdyb3VwcykgJiYgc3RvcmVkLnByb21wdEdyb3Vwcy5sZW5ndGggPiAwO1xyXG4gIGNvbnN0IGhhc0N1c3RvbVNpdGVzID0gQXJyYXkuaXNBcnJheShzdG9yZWQuY3VzdG9tU2l0ZXMpO1xyXG4gIGNvbnN0IGhhc1VpUHJlZnMgPSBzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldICYmIHR5cGVvZiBzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldID09PSBcIm9iamVjdFwiO1xyXG4gIGNvbnN0IHNob3VsZFJlcGxhY2VMZWdhY3lQcm9tcHRHcm91cHMgPSBpc0xlZ2FjeURlZmF1bHRQcm9tcHRHcm91cHMoc3RvcmVkLnByb21wdEdyb3Vwcyk7XHJcbiAgY29uc3Qgc2hvdWxkQWRkRGVmYXVsdFNvY2lhbE92ZXJzZWFzR3JvdXAgPSBzaG91bGRBZGREZWZhdWx0R3JvdXAoXHJcbiAgICBzdG9yZWRbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0sXHJcbiAgICBcImRlZmF1bHQtc29jaWFsLW92ZXJzZWFzXCIsXHJcbiAgICBzdG9yZWRbREVGQVVMVF9TT0NJQUxfT1ZFUlNFQVNfR1JPVVBfTUlHUkFURURfS0VZXVxyXG4gICk7XHJcbiAgY29uc3Qgc2hvdWxkTWlncmF0ZURlZmF1bHRTb2NpYWxPdmVyc2Vhc01vZGUgPSBzaG91bGRNaWdyYXRlRGVmYXVsdEdyb3VwTW9kZShcclxuICAgIHN0b3JlZFtTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXSxcclxuICAgIFwiZGVmYXVsdC1zb2NpYWwtb3ZlcnNlYXNcIixcclxuICAgIHN0b3JlZFtERUZBVUxUX1NPQ0lBTF9PVkVSU0VBU19NT0RFX01JR1JBVEVEX0tFWV1cclxuICApO1xyXG4gIGNvbnN0IHNob3VsZEFkZFRpa3Rva1RvT3ZlcnNlYXMgPSBzaG91bGRBZGRTaXRlSWRUb0dyb3VwKFxyXG4gICAgc3RvcmVkW1NFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVldLFxyXG4gICAgXCJkZWZhdWx0LXNvY2lhbC1vdmVyc2Vhc1wiLFxyXG4gICAgXCJ0aWt0b2tcIixcclxuICAgIHN0b3JlZFtERUZBVUxUX1NPQ0lBTF9PVkVSU0VBU19USUtUT0tfTUlHUkFURURfS0VZXVxyXG4gICk7XHJcblxyXG4gIGlmIChcclxuICAgIGhhc0dyb3VwcyAmJlxyXG4gICAgIXNob3VsZEFkZERlZmF1bHRTb2NpYWxPdmVyc2Vhc0dyb3VwICYmXHJcbiAgICAhc2hvdWxkTWlncmF0ZURlZmF1bHRTb2NpYWxPdmVyc2Vhc01vZGUgJiZcclxuICAgICFzaG91bGRBZGRUaWt0b2tUb092ZXJzZWFzICYmXHJcbiAgICBoYXNQcm9tcHRHcm91cHMgJiZcclxuICAgICFzaG91bGRSZXBsYWNlTGVnYWN5UHJvbXB0R3JvdXBzICYmXHJcbiAgICBoYXNDdXN0b21TaXRlcyAmJlxyXG4gICAgaGFzVWlQcmVmc1xyXG4gICkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZGVmYXVsdHMgPSBhd2FpdCBsb2FkSW5pdGlhbFN0YXRlRnJvbUNvbmZpZygpLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gIGlmICghZGVmYXVsdHMpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGNvbnN0IHBhdGNoID0ge307XHJcbiAgaWYgKCFoYXNHcm91cHMgJiYgQXJyYXkuaXNBcnJheShkZWZhdWx0cy5zZWFyY2hHcm91cHMpICYmIGRlZmF1bHRzLnNlYXJjaEdyb3Vwcy5sZW5ndGggPiAwKSB7XHJcbiAgICBwYXRjaFtTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXSA9IGRlZmF1bHRzLnNlYXJjaEdyb3VwcztcclxuICAgIHBhdGNoW0RFRkFVTFRfU09DSUFMX09WRVJTRUFTX0dST1VQX01JR1JBVEVEX0tFWV0gPSB0cnVlO1xyXG4gIH0gZWxzZSBpZiAoc2hvdWxkQWRkRGVmYXVsdFNvY2lhbE92ZXJzZWFzR3JvdXAgJiYgQXJyYXkuaXNBcnJheShkZWZhdWx0cy5zZWFyY2hHcm91cHMpKSB7XHJcbiAgICBjb25zdCBkZWZhdWx0R3JvdXAgPSBkZWZhdWx0cy5zZWFyY2hHcm91cHMuZmluZCgoZ3JvdXApID0+IGdyb3VwLmlkID09PSBcImRlZmF1bHQtc29jaWFsLW92ZXJzZWFzXCIpO1xyXG4gICAgaWYgKGRlZmF1bHRHcm91cCkge1xyXG4gICAgICBwYXRjaFtTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXSA9IFsuLi5zdG9yZWRbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0sIGRlZmF1bHRHcm91cF07XHJcbiAgICAgIHBhdGNoW0RFRkFVTFRfU09DSUFMX09WRVJTRUFTX0dST1VQX01JR1JBVEVEX0tFWV0gPSB0cnVlO1xyXG4gICAgICBwYXRjaFtERUZBVUxUX1NPQ0lBTF9PVkVSU0VBU19NT0RFX01JR1JBVEVEX0tFWV0gPSB0cnVlO1xyXG4gICAgfVxyXG4gIH0gZWxzZSBpZiAoc2hvdWxkTWlncmF0ZURlZmF1bHRTb2NpYWxPdmVyc2Vhc01vZGUgfHwgc2hvdWxkQWRkVGlrdG9rVG9PdmVyc2Vhcykge1xyXG4gICAgcGF0Y2hbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0gPSBzdG9yZWRbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0ubWFwKChncm91cCkgPT4ge1xyXG4gICAgICBpZiAoZ3JvdXA/LmlkICE9PSBcImRlZmF1bHQtc29jaWFsLW92ZXJzZWFzXCIpIHJldHVybiBncm91cDtcclxuICAgICAgY29uc3QgbmV4dCA9IHsgLi4uZ3JvdXAgfTtcclxuICAgICAgaWYgKHNob3VsZE1pZ3JhdGVEZWZhdWx0U29jaWFsT3ZlcnNlYXNNb2RlKSB7XHJcbiAgICAgICAgbmV4dC5tb2RlID0gXCJ0YWJzXCI7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHNob3VsZEFkZFRpa3Rva1RvT3ZlcnNlYXMpIHtcclxuICAgICAgICBjb25zdCBzaXRlSWRzID0gQXJyYXkuaXNBcnJheShuZXh0LnNpdGVJZHMpID8gWy4uLm5leHQuc2l0ZUlkc10gOiBbXTtcclxuICAgICAgICBpZiAoIXNpdGVJZHMuaW5jbHVkZXMoXCJ0aWt0b2tcIikpIHNpdGVJZHMucHVzaChcInRpa3Rva1wiKTtcclxuICAgICAgICBuZXh0LnNpdGVJZHMgPSBzaXRlSWRzO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBuZXh0O1xyXG4gICAgfSk7XHJcbiAgICBpZiAoc2hvdWxkTWlncmF0ZURlZmF1bHRTb2NpYWxPdmVyc2Vhc01vZGUpIHtcclxuICAgICAgcGF0Y2hbREVGQVVMVF9TT0NJQUxfT1ZFUlNFQVNfTU9ERV9NSUdSQVRFRF9LRVldID0gdHJ1ZTtcclxuICAgIH1cclxuICAgIGlmIChzaG91bGRBZGRUaWt0b2tUb092ZXJzZWFzKSB7XHJcbiAgICAgIHBhdGNoW0RFRkFVTFRfU09DSUFMX09WRVJTRUFTX1RJS1RPS19NSUdSQVRFRF9LRVldID0gdHJ1ZTtcclxuICAgIH1cclxuICB9XHJcbiAgaWYgKCghaGFzUHJvbXB0R3JvdXBzIHx8IHNob3VsZFJlcGxhY2VMZWdhY3lQcm9tcHRHcm91cHMpICYmIEFycmF5LmlzQXJyYXkoZGVmYXVsdHMucHJvbXB0R3JvdXBzKSAmJiBkZWZhdWx0cy5wcm9tcHRHcm91cHMubGVuZ3RoID4gMCkge1xyXG4gICAgcGF0Y2gucHJvbXB0R3JvdXBzID0gZGVmYXVsdHMucHJvbXB0R3JvdXBzO1xyXG4gIH1cclxuICBpZiAoIWhhc0N1c3RvbVNpdGVzICYmIEFycmF5LmlzQXJyYXkoZGVmYXVsdHMuY3VzdG9tU2l0ZXMpKSB7XHJcbiAgICBwYXRjaC5jdXN0b21TaXRlcyA9IGRlZmF1bHRzLmN1c3RvbVNpdGVzO1xyXG4gIH1cclxuICBpZiAoIWhhc1VpUHJlZnMgJiYgZGVmYXVsdHMudWlQcmVmcyAmJiB0eXBlb2YgZGVmYXVsdHMudWlQcmVmcyA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgcGF0Y2hbVUlfUFJFRlNfU1RPUkFHRV9LRVldID0gZGVmYXVsdHMudWlQcmVmcztcclxuICB9XHJcblxyXG4gIGlmIChPYmplY3Qua2V5cyhwYXRjaCkubGVuZ3RoID4gMCkge1xyXG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHBhdGNoKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzTGVnYWN5RGVmYXVsdFByb21wdEdyb3Vwcyhwcm9tcHRHcm91cHMpIHtcclxuICBpZiAoIUFycmF5LmlzQXJyYXkocHJvbXB0R3JvdXBzKSB8fCBwcm9tcHRHcm91cHMubGVuZ3RoICE9PSAxKSByZXR1cm4gZmFsc2U7XHJcbiAgY29uc3QgW2dyb3VwXSA9IHByb21wdEdyb3VwcztcclxuICBjb25zdCBwcm9tcHRzID0gQXJyYXkuaXNBcnJheShncm91cD8ucHJvbXB0cykgPyBncm91cC5wcm9tcHRzIDogW107XHJcbiAgaWYgKHByb21wdHMubGVuZ3RoICE9PSAxKSByZXR1cm4gZmFsc2U7XHJcbiAgY29uc3QgW3Byb21wdF0gPSBwcm9tcHRzO1xyXG4gIHJldHVybiAoXHJcbiAgICBncm91cC5pZCA9PT0gXCJwcm9tcHQtZ3JvdXAtZGVmYXVsdFwiICYmXHJcbiAgICBwcm9tcHQuaWQgPT09IFwicHJvbXB0LWRlZmF1bHQtMVwiICYmXHJcbiAgICBwcm9tcHQudGl0bGUgPT09IFwi5oC757uT6YeN54K5XCJcclxuICApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG91bGRBZGREZWZhdWx0R3JvdXAoZ3JvdXBzLCBncm91cElkLCBoYXNNaWdyYXRlZCkge1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShncm91cHMpIHx8IGdyb3Vwcy5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZTtcclxuICBpZiAoaGFzTWlncmF0ZWQgPT09IHRydWUpIHJldHVybiBmYWxzZTtcclxuICByZXR1cm4gIWdyb3Vwcy5zb21lKChncm91cCkgPT4gZ3JvdXA/LmlkID09PSBncm91cElkKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvdWxkTWlncmF0ZURlZmF1bHRHcm91cE1vZGUoZ3JvdXBzLCBncm91cElkLCBoYXNNaWdyYXRlZCkge1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShncm91cHMpIHx8IGdyb3Vwcy5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZTtcclxuICBpZiAoaGFzTWlncmF0ZWQgPT09IHRydWUpIHJldHVybiBmYWxzZTtcclxuICBjb25zdCBncm91cCA9IGdyb3Vwcy5maW5kKChpdGVtKSA9PiBpdGVtPy5pZCA9PT0gZ3JvdXBJZCk7XHJcbiAgaWYgKCFncm91cCB8fCBncm91cC5tb2RlID09PSBcInRhYnNcIikgcmV0dXJuIGZhbHNlO1xyXG4gIHJldHVybiBBcnJheS5pc0FycmF5KGdyb3VwLnNpdGVJZHMpICYmIFtcInR3aXR0ZXJcIiwgXCJ5b3V0dWJlXCIsIFwicmVkZGl0XCJdLmV2ZXJ5KChzaXRlSWQpID0+IGdyb3VwLnNpdGVJZHMuaW5jbHVkZXMoc2l0ZUlkKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNob3VsZEFkZFNpdGVJZFRvR3JvdXAoZ3JvdXBzLCBncm91cElkLCBzaXRlSWQsIGhhc01pZ3JhdGVkKSB7XHJcbiAgaWYgKCFBcnJheS5pc0FycmF5KGdyb3VwcykgfHwgZ3JvdXBzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmIChoYXNNaWdyYXRlZCA9PT0gdHJ1ZSkgcmV0dXJuIGZhbHNlO1xyXG4gIGNvbnN0IGdyb3VwID0gZ3JvdXBzLmZpbmQoKGl0ZW0pID0+IGl0ZW0/LmlkID09PSBncm91cElkKTtcclxuICBpZiAoIWdyb3VwIHx8ICFBcnJheS5pc0FycmF5KGdyb3VwLnNpdGVJZHMpKSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuICFncm91cC5zaXRlSWRzLmluY2x1ZGVzKHNpdGVJZCk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRJbml0aWFsU3RhdGVGcm9tQ29uZmlnKCkge1xyXG4gIGNvbnN0IGNvbmZpZ1BhdGggPSBnZXRJbml0aWFsU3RhdGVDb25maWdQYXRoKCk7XHJcbiAgbGV0IHJlc3AgPSBhd2FpdCBmZXRjaChjaHJvbWUucnVudGltZS5nZXRVUkwoY29uZmlnUGF0aCkpO1xyXG4gIGlmICghcmVzcC5vayAmJiBjb25maWdQYXRoICE9PSBcImNvbmZpZy9pbml0aWFsU3RhdGUuanNvblwiKSB7XHJcbiAgICByZXNwID0gYXdhaXQgZmV0Y2goY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwiY29uZmlnL2luaXRpYWxTdGF0ZS5qc29uXCIpKTtcclxuICB9XHJcbiAgaWYgKCFyZXNwLm9rKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCLml6Dms5Xor7vlj5bliJ3lp4vphY3nva5cIik7XHJcbiAgfVxyXG4gIGNvbnN0IHBheWxvYWQgPSBhd2FpdCByZXNwLmpzb24oKTtcclxuICBpZiAoIXBheWxvYWQgfHwgdHlwZW9mIHBheWxvYWQgIT09IFwib2JqZWN0XCIpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIuWIneWni+mFjee9ruaXoOaViFwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHsgc2VhcmNoR3JvdXBzLCBwcm9tcHRHcm91cHMsIGN1c3RvbVNpdGVzLCB1aVByZWZzIH0gPSBwYXlsb2FkO1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShzZWFyY2hHcm91cHMpIHx8IHNlYXJjaEdyb3Vwcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShwcm9tcHRHcm91cHMpIHx8IHByb21wdEdyb3Vwcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShjdXN0b21TaXRlcykpIHJldHVybiBudWxsO1xyXG4gIGlmICghdWlQcmVmcyB8fCB0eXBlb2YgdWlQcmVmcyAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XHJcblxyXG4gIHJldHVybiB7IHNlYXJjaEdyb3VwcywgcHJvbXB0R3JvdXBzLCBjdXN0b21TaXRlcywgdWlQcmVmcyB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRJbml0aWFsU3RhdGVDb25maWdQYXRoKCkge1xyXG4gIGNvbnN0IGxhbmcgPSBnZXRCcm93c2VyTGFuZ3VhZ2UoKTtcclxuICBpZiAobGFuZy5zdGFydHNXaXRoKFwiemhcIikpIHtcclxuICAgIHJldHVybiBcImNvbmZpZy9pbml0aWFsU3RhdGUuemgtQ04uanNvblwiO1xyXG4gIH1cclxuICByZXR1cm4gXCJjb25maWcvaW5pdGlhbFN0YXRlLmVuLmpzb25cIjtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0QnJvd3Nlckxhbmd1YWdlKCkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBjaHJvbWVMYW5nID0gY2hyb21lPy5pMThuPy5nZXRVSUxhbmd1YWdlPy4oKTtcclxuICAgIGlmIChjaHJvbWVMYW5nKSByZXR1cm4gU3RyaW5nKGNocm9tZUxhbmcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIC8vIGlnbm9yZVxyXG4gIH1cclxuICB0cnkge1xyXG4gICAgcmV0dXJuIFN0cmluZyhuYXZpZ2F0b3I/Lmxhbmd1YWdlIHx8IFwiZW5cIikudG9Mb3dlckNhc2UoKTtcclxuICB9IGNhdGNoIChfZSkge1xyXG4gICAgcmV0dXJuIFwiZW5cIjtcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7IFVJX1BSRUZTX1NUT1JBR0VfS0VZIH0gZnJvbSBcIi4uL3NoYXJlZC9zdG9yYWdlLWtleXMuanNcIjtcclxuXHJcbi8vIOWwhiB7Y3RybEtleSwgYWx0S2V5LCBzaGlmdEtleSwgbWV0YUtleSwga2V5fSDlr7nosaHovazmiJAgXCJDdHJsK0FsdCtRXCIg5qC85byP55qE5a2X56ym5Liy77yMXHJcbi8vIOeUqOS6jiBjaHJvbWUuY29tbWFuZHMudXBkYXRlKCnjgIJcclxuZnVuY3Rpb24gZm9ybWF0U2hvcnRjdXRGb3JDb21tYW5kKHNjKSB7XHJcbiAgaWYgKCFzYyB8fCAhc2Mua2V5KSByZXR1cm4gXCJcIjtcclxuICBjb25zdCBwYXJ0cyA9IFtdO1xyXG4gIGlmIChzYy5jdHJsS2V5KSBwYXJ0cy5wdXNoKFwiQ3RybFwiKTtcclxuICBpZiAoc2MuYWx0S2V5KSBwYXJ0cy5wdXNoKFwiQWx0XCIpO1xyXG4gIGlmIChzYy5zaGlmdEtleSkgcGFydHMucHVzaChcIlNoaWZ0XCIpO1xyXG4gIGlmIChzYy5tZXRhS2V5KSBwYXJ0cy5wdXNoKFwiTWFjQ3RybFwiKTtcclxuICBpZiAocGFydHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcclxuICBjb25zdCBrZXkgPSBzYy5rZXkubGVuZ3RoID09PSAxID8gc2Mua2V5LnRvVXBwZXJDYXNlKCkgOiBzYy5rZXk7XHJcbiAgcGFydHMucHVzaChrZXkpO1xyXG4gIHJldHVybiBwYXJ0cy5qb2luKFwiK1wiKTtcclxufVxyXG5cclxuLy8g5LuOIHN0b3JhZ2Ug6K+75Y+W55So5oi36K6+572u55qE5b+r5o236ZSu77yM5pu05pawIG1hbmlmZXN0IGNvbW1hbmQg57uR5a6a44CCXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzeW5jQ29tbWFuZFNob3J0Y3V0KHByZWZzKSB7XHJcbiAgdHJ5IHtcclxuICAgIGxldCBzYyA9IHByZWZzPy5vdmVybGF5U2hvcnRjdXQ7XHJcbiAgICBpZiAoIXNjKSB7XHJcbiAgICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbVUlfUFJFRlNfU1RPUkFHRV9LRVldKTtcclxuICAgICAgc2MgPSBzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldPy5vdmVybGF5U2hvcnRjdXQ7XHJcbiAgICB9XHJcbiAgICBpZiAoIXNjKSByZXR1cm47XHJcbiAgICBjb25zdCBzaG9ydGN1dFN0ciA9IGZvcm1hdFNob3J0Y3V0Rm9yQ29tbWFuZChzYyk7XHJcbiAgICBpZiAoIXNob3J0Y3V0U3RyKSByZXR1cm47XHJcbiAgICBhd2FpdCBjaHJvbWUuY29tbWFuZHMudXBkYXRlKHsgbmFtZTogXCJ0b2dnbGUtb3ZlcmxheVwiLCBzaG9ydGN1dDogc2hvcnRjdXRTdHIgfSk7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIC8qIOW/q+aNt+mUrue7hOWQiOS4jeWQiOazleaIluS4jeiiq+aUr+aMgeaXtuW/veeVpe+8jOS/neaMgSBtYW5pZmVzdCDpu5jorqTlgLwgKi9cclxuICB9XHJcbn1cclxuIiwgImV4cG9ydCBjb25zdCBBSV9TSVRFX0lEUyA9IFtcclxuICBcImRlZXBzZWVrXCIsIFwiZG91YmFvXCIsIFwia2ltaVwiLCBcInl1YW5iYW9cIiwgXCJxd2VuXCIsXHJcbiAgXCJnZW1pbmlcIiwgXCJjaGF0Z3B0XCIsIFwiY2xhdWRlXCIsIFwiZ3Jva1wiLFxyXG5dO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRFbmFibGVkU2l0ZXMoKSB7XHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChjaHJvbWUucnVudGltZS5nZXRVUkwoXCJjb25maWcvc2l0ZUhhbmRsZXJzLmpzb25cIikpO1xyXG4gIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIuaXoOazleivu+WPluermeeCuemFjee9rlwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHBheWxvYWQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgY29uc3QgYnVpbHRpbiA9IChwYXlsb2FkLnNpdGVzIHx8IFtdKS5maWx0ZXIoKHNpdGUpID0+IHNpdGUuZW5hYmxlZCAhPT0gZmFsc2UpO1xyXG4gIGNvbnN0IGN1c3RvbSA9IGF3YWl0IGxvYWRDdXN0b21TaXRlc0Zyb21TdG9yYWdlKCk7XHJcblxyXG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0KGJ1aWx0aW4ubWFwKChzaXRlKSA9PiBzaXRlLmlkKSk7XHJcbiAgY29uc3QgbWVyZ2VkID0gWy4uLmJ1aWx0aW5dO1xyXG4gIGN1c3RvbS5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBpZiAoIXNlZW4uaGFzKHNpdGUuaWQpKSB7XHJcbiAgICAgIG1lcmdlZC5wdXNoKHNpdGUpO1xyXG4gICAgICBzZWVuLmFkZChzaXRlLmlkKTtcclxuICAgIH1cclxuICB9KTtcclxuICByZXR1cm4gbWVyZ2VkO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkQ3VzdG9tU2l0ZXNGcm9tU3RvcmFnZSgpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3Qgc3RvcmVkID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtcImN1c3RvbVNpdGVzXCJdKTtcclxuICAgIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KHN0b3JlZC5jdXN0b21TaXRlcykgPyBzdG9yZWQuY3VzdG9tU2l0ZXMgOiBbXTtcclxuICAgIHJldHVybiBsaXN0XHJcbiAgICAgIC5tYXAoKHJhdykgPT4ge1xyXG4gICAgICAgIGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09IFwib2JqZWN0XCIpIHJldHVybiBudWxsO1xyXG4gICAgICAgIGNvbnN0IG5hbWUgPSBTdHJpbmcocmF3Lm5hbWUgfHwgXCJcIikudHJpbSgpO1xyXG4gICAgICAgIGNvbnN0IHVybCA9IFN0cmluZyhyYXcudXJsIHx8IFwiXCIpLnRyaW0oKTtcclxuICAgICAgICBjb25zdCBpZCA9IFN0cmluZyhyYXcuaWQgfHwgXCJcIikudHJpbSgpO1xyXG4gICAgICAgIGlmICghaWQgfHwgIW5hbWUgfHwgIXVybCkgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGlkLFxyXG4gICAgICAgICAgbmFtZSxcclxuICAgICAgICAgIHVybCxcclxuICAgICAgICAgIGVuYWJsZWQ6IHJhdy5lbmFibGVkICE9PSBmYWxzZSxcclxuICAgICAgICAgIHN1cHBvcnRJZnJhbWU6IHJhdy5zdXBwb3J0SWZyYW1lICE9PSBmYWxzZSxcclxuICAgICAgICAgIHN1cHBvcnRVcmxRdWVyeTogcmF3LnN1cHBvcnRVcmxRdWVyeSAhPT0gZmFsc2UgJiYgdXJsLmluY2x1ZGVzKFwie3F1ZXJ5fVwiKSxcclxuICAgICAgICAgIG1hdGNoUGF0dGVybnM6IEFycmF5LmlzQXJyYXkocmF3Lm1hdGNoUGF0dGVybnMpID8gcmF3Lm1hdGNoUGF0dGVybnMubWFwKFN0cmluZykgOiBbXSxcclxuICAgICAgICAgIGlzQ3VzdG9tOiB0cnVlLFxyXG4gICAgICAgIH07XHJcbiAgICAgIH0pXHJcbiAgICAgIC5maWx0ZXIoKHNpdGUpID0+IHNpdGUgJiYgc2l0ZS5lbmFibGVkICE9PSBmYWxzZSk7XHJcbiAgfSBjYXRjaCAoX2Vycm9yKSB7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTaXRlVXJsKHNpdGUsIHF1ZXJ5KSB7XHJcbiAgY29uc3QgdXJsID0gU3RyaW5nKHNpdGU/LnVybCB8fCBcIlwiKTtcclxuICBpZiAoIXVybC5pbmNsdWRlcyhcIntxdWVyeX1cIikpIHtcclxuICAgIHJldHVybiB1cmw7XHJcbiAgfVxyXG5cclxuICBpZiAocXVlcnkgJiYgc2l0ZT8uc3VwcG9ydFVybFF1ZXJ5KSB7XHJcbiAgICByZXR1cm4gdXJsLnJlcGxhY2UoL1xce3F1ZXJ5XFx9L2csIGVuY29kZVVSSUNvbXBvbmVudChxdWVyeSkpO1xyXG4gIH1cclxuXHJcbiAgLy8g56m6IHF1ZXJ5IOaIluermeeCueS4jeaUr+aMgSBVUkwg55u06L6+77ya5Yml56a75ZCrIHtxdWVyeX0g55qE5Y+C5pWw5q6177yM5Zue6JC95Yiw5Z+656GAIFVSTFxyXG4gIGxldCBuZXh0ID0gdXJsLnJlcGxhY2UoLyhbPyZdKVtePSZdKz1cXHtxdWVyeVxcfS9nLCAoXywgc2VwKSA9PiAoc2VwID09PSBcIj9cIiA/IFwiP1wiIDogXCJcIikpO1xyXG4gIG5leHQgPSBuZXh0LnJlcGxhY2UoL1xcPyYvLCBcIj9cIik7XHJcbiAgbmV4dCA9IG5leHQucmVwbGFjZSgvWz8mXSQvLCBcIlwiKTtcclxuICAvLyDlhZzlupXvvJrkuIfkuIDov5jmrovnlZkge3F1ZXJ5fe+8jOeyl+aatOa4heaOiVxyXG4gIHJldHVybiBuZXh0LnJlcGxhY2UoL1xce3F1ZXJ5XFx9L2csIFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2FuU2VhcmNoQnlVcmwoc2l0ZSkge1xyXG4gIHJldHVybiBCb29sZWFuKHNpdGU/LnN1cHBvcnRVcmxRdWVyeSAmJiBTdHJpbmcoc2l0ZS51cmwgfHwgXCJcIikuaW5jbHVkZXMoXCJ7cXVlcnl9XCIpKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRlbGF5KG1zKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKTtcclxuICB9KTtcclxufVxyXG4iLCAiaW1wb3J0IHsgbG9hZEVuYWJsZWRTaXRlcywgYnVpbGRTaXRlVXJsLCBjYW5TZWFyY2hCeVVybCwgZGVsYXkgfSBmcm9tIFwiLi9zaXRlcy5qc1wiO1xyXG5cclxuY29uc3QgQ09NUEFSRV9QQUdFX0JBU0VfVVJMID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwiaWZyYW1lL2lmcmFtZS5odG1sXCIpO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5Db21wYXJlUGFnZShxdWVyeSA9IFwiXCIsIHNpdGVJZHMgPSBbXSkge1xyXG4gIGNvbnN0IHRhcmdldFVybCA9IGJ1aWxkQ29tcGFyZVBhZ2VVcmwocXVlcnksIHNpdGVJZHMpO1xyXG4gIHJldHVybiBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IHRhcmdldFVybCB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRDb21wYXJlUGFnZVVybChxdWVyeSwgc2l0ZUlkcyA9IFtdKSB7XHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTChDT01QQVJFX1BBR0VfQkFTRV9VUkwpO1xyXG4gIGlmIChxdWVyeSkge1xyXG4gICAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoXCJxXCIsIHF1ZXJ5KTtcclxuICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwiYXV0b3NlbmRcIiwgXCIxXCIpO1xyXG4gIH1cclxuICBpZiAoQXJyYXkuaXNBcnJheShzaXRlSWRzKSAmJiBzaXRlSWRzLmxlbmd0aCA+IDApIHtcclxuICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwic2l0ZXNcIiwgc2l0ZUlkcy5qb2luKFwiLFwiKSk7XHJcbiAgfVxyXG4gIHJldHVybiB1cmwudG9TdHJpbmcoKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1blNlYXJjaEdyb3VwKGdyb3VwLCBxdWVyeSkge1xyXG4gIGlmICghZ3JvdXAgfHwgIWdyb3VwLm1vZGUpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIuaQnOe0oue7hOmFjee9ruaXoOaViFwiKTtcclxuICB9XHJcblxyXG4gIGlmIChncm91cC5tb2RlID09PSBcInRhYnNcIikge1xyXG4gICAgcmV0dXJuIG9wZW5TaXRlc0luVGFicyhncm91cC5zaXRlSWRzIHx8IFtdLCBxdWVyeSk7XHJcbiAgfVxyXG5cclxuICBjb25zdCB0YWIgPSBhd2FpdCBvcGVuQ29tcGFyZVBhZ2UocXVlcnksIGdyb3VwLnNpdGVJZHMgfHwgW10pO1xyXG4gIHJldHVybiB7IHRhYklkOiB0YWIuaWQgfTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5TaXRlc0luVGFicyhzaXRlSWRzLCBxdWVyeSkge1xyXG4gIGNvbnN0IHNpdGVzID0gYXdhaXQgbG9hZEVuYWJsZWRTaXRlcygpO1xyXG4gIGNvbnN0IHRhcmdldFNpdGVzID0gQXJyYXkuaXNBcnJheShzaXRlSWRzKSAmJiBzaXRlSWRzLmxlbmd0aCA+IDBcclxuICAgID8gc2l0ZXMuZmlsdGVyKChzaXRlKSA9PiBzaXRlSWRzLmluY2x1ZGVzKHNpdGUuaWQpKVxyXG4gICAgOiBzaXRlcztcclxuXHJcbiAgaWYgKHRhcmdldFNpdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIHsgdGFiSWRzOiBbXSB9O1xyXG4gIH1cclxuXHJcbiAgY29uc3QgdGFiU2l0ZVBhaXJzID0gW107XHJcblxyXG4gIC8vIOesrOS4gOS4quermeeCue+8muecn+ato+aWsOW8gOagh+etvuW5tuWIh+i/h+WOu++8jOS/neeVmeeUqOaIt+W9k+WJjemhtemdouS4jeiiq+imhuebluOAglxyXG4gIGNvbnN0IGZpcnN0U2l0ZSA9IHRhcmdldFNpdGVzWzBdO1xyXG4gIGNvbnN0IGZpcnN0VGFiID0gYXdhaXQgY2hyb21lLnRhYnMuY3JlYXRlKHtcclxuICAgIHVybDogYnVpbGRTaXRlVXJsKGZpcnN0U2l0ZSwgcXVlcnkpLFxyXG4gICAgYWN0aXZlOiB0cnVlLFxyXG4gIH0pLmNhdGNoKCgpID0+IG51bGwpO1xyXG4gIGlmIChmaXJzdFRhYikgdGFiU2l0ZVBhaXJzLnB1c2goeyB0YWI6IGZpcnN0VGFiLCBzaXRlOiBmaXJzdFNpdGUgfSk7XHJcblxyXG4gIC8vIOWFtuS9meermeeCue+8muWcqOWQjuWPsOaWsOagh+etvumhteS4reW5tuWPkeaJk+W8gFxyXG4gIGNvbnN0IHJlbWFpbmluZ1NpdGVzID0gdGFyZ2V0U2l0ZXMuc2xpY2UoMSk7XHJcbiAgY29uc3QgbmV3VGFicyA9IGF3YWl0IFByb21pc2UuYWxsKFxyXG4gICAgcmVtYWluaW5nU2l0ZXMubWFwKChzaXRlKSA9PlxyXG4gICAgICBjaHJvbWUudGFicy5jcmVhdGUoeyB1cmw6IGJ1aWxkU2l0ZVVybChzaXRlLCBxdWVyeSksIGFjdGl2ZTogZmFsc2UgfSkuY2F0Y2goKCkgPT4gbnVsbClcclxuICAgIClcclxuICApO1xyXG4gIG5ld1RhYnMuZm9yRWFjaCgodGFiLCBpZHgpID0+IHtcclxuICAgIGlmICh0YWIpIHRhYlNpdGVQYWlycy5wdXNoKHsgdGFiLCBzaXRlOiByZW1haW5pbmdTaXRlc1tpZHhdIH0pO1xyXG4gIH0pO1xyXG5cclxuICAvLyDlubblj5HnrYnlvoXmr4/kuKogdGFiIOWujOaIkOWKoOi9veW5tueLrOeri+WPkemAgeafpeivou+8jOS6kuS4jemYu+WhnlxyXG4gIGlmIChxdWVyeSkge1xyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIHRhYlNpdGVQYWlycy5tYXAoYXN5bmMgKHsgdGFiLCBzaXRlIH0pID0+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgaWYgKGNhblNlYXJjaEJ5VXJsKHNpdGUpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGF3YWl0IHdhaXRGb3JUYWJDb21wbGV0ZSh0YWIuaWQpO1xyXG4gICAgICAgICAgYXdhaXQgc2VuZFF1ZXJ5VG9UYWIodGFiLmlkLCBzaXRlLCBxdWVyeSk7XHJcbiAgICAgICAgfSBjYXRjaCAoX2Vycikge1xyXG4gICAgICAgICAgLy8g5Y2V5Liq56uZ54K55aSx6LSl5LiN5b2x5ZON5YW25LuWXHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IG9wZW5lZFRhYklkcyA9IHRhYlNpdGVQYWlycy5tYXAoKHsgdGFiIH0pID0+IHRhYi5pZCk7XHJcbiAgcmV0dXJuIHsgdGFiSWRzOiBvcGVuZWRUYWJJZHMgfTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5TaXRlVGFiQW5kU2VuZChzaXRlLCBxdWVyeSkge1xyXG4gIGlmICghc2l0ZSB8fCAhc2l0ZS51cmwpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIuermeeCuemFjee9ruaXoOaViFwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHRhYiA9IGF3YWl0IGNocm9tZS50YWJzLmNyZWF0ZSh7XHJcbiAgICB1cmw6IGJ1aWxkU2l0ZVVybChzaXRlLCBxdWVyeSksXHJcbiAgICBhY3RpdmU6IHRydWUsXHJcbiAgfSk7XHJcblxyXG4gIGlmIChxdWVyeSAmJiAhY2FuU2VhcmNoQnlVcmwoc2l0ZSkpIHtcclxuICAgIGF3YWl0IHdhaXRGb3JUYWJDb21wbGV0ZSh0YWIuaWQpO1xyXG4gICAgYXdhaXQgc2VuZFF1ZXJ5VG9UYWIodGFiLmlkLCBzaXRlLCBxdWVyeSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4geyB0YWJJZDogdGFiLmlkIH07XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHNlbmRRdWVyeVRvVGFiKHRhYklkLCBzaXRlLCBxdWVyeSkge1xyXG4gIGNvbnN0IG1heEF0dGVtcHRzID0gNjtcclxuICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IG1heEF0dGVtcHRzOyBhdHRlbXB0ICs9IDEpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYklkLCB7XHJcbiAgICAgICAgdHlwZTogXCJTRUFSQ0hfU0lURV9RVUVSWVwiLFxyXG4gICAgICAgIHNpdGUsXHJcbiAgICAgICAgcXVlcnksXHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgICAgYXdhaXQgZGVsYXkoMzAwKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdhaXRGb3JUYWJDb21wbGV0ZSh0YWJJZCwgdGltZW91dE1zID0gMjAwMDApIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgY29uc3QgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIGNocm9tZS50YWJzLm9uVXBkYXRlZC5yZW1vdmVMaXN0ZW5lcihoYW5kbGVVcGRhdGVkKTtcclxuICAgICAgcmVqZWN0KG5ldyBFcnJvcihcIuetieW+heagh+etvumhteWKoOi9vei2heaXtlwiKSk7XHJcbiAgICB9LCB0aW1lb3V0TXMpO1xyXG5cclxuICAgIGZ1bmN0aW9uIGhhbmRsZVVwZGF0ZWQodXBkYXRlZFRhYklkLCBjaGFuZ2VJbmZvKSB7XHJcbiAgICAgIGlmICh1cGRhdGVkVGFiSWQgIT09IHRhYklkIHx8IGNoYW5nZUluZm8uc3RhdHVzICE9PSBcImNvbXBsZXRlXCIpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XHJcbiAgICAgIGNocm9tZS50YWJzLm9uVXBkYXRlZC5yZW1vdmVMaXN0ZW5lcihoYW5kbGVVcGRhdGVkKTtcclxuICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcihoYW5kbGVVcGRhdGVkKTtcclxuICB9KTtcclxufVxyXG4iLCAiaW1wb3J0IHsgVUlfUFJFRlNfU1RPUkFHRV9LRVkgfSBmcm9tIFwiLi4vc2hhcmVkL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5pbXBvcnQgeyBBSV9TSVRFX0lEUywgbG9hZEVuYWJsZWRTaXRlcyB9IGZyb20gXCIuL3NpdGVzLmpzXCI7XHJcblxyXG5jb25zdCBXQVJNVVBfQ09PTERPV05fTVMgPSA1ICogNjAgKiAxMDAwO1xyXG5sZXQgbGFzdFdhcm11cEF0ID0gMDtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3YXJtdXBBaVNpdGVzKCkge1xyXG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgaWYgKG5vdyAtIGxhc3RXYXJtdXBBdCA8IFdBUk1VUF9DT09MRE9XTl9NUykge1xyXG4gICAgcmV0dXJuIHsgc2tpcHBlZDogdHJ1ZSwgcmVhc29uOiBcImNvb2xkb3duXCIgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbVUlfUFJFRlNfU1RPUkFHRV9LRVldKTtcclxuICBjb25zdCBwcmVmcyA9IHN0b3JlZFtVSV9QUkVGU19TVE9SQUdFX0tFWV0gfHwge307XHJcbiAgaWYgKHByZWZzLnByZXdhcm1FbmFibGVkID09PSBmYWxzZSkge1xyXG4gICAgcmV0dXJuIHsgc2tpcHBlZDogdHJ1ZSwgcmVhc29uOiBcImRpc2FibGVkXCIgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHNpdGVzID0gYXdhaXQgbG9hZEVuYWJsZWRTaXRlcygpO1xyXG4gIGNvbnN0IHRhcmdldHMgPSBzaXRlcy5maWx0ZXIoKHNpdGUpID0+IEFJX1NJVEVfSURTLmluY2x1ZGVzKHNpdGUuaWQpKTtcclxuICBpZiAodGFyZ2V0cy5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybiB7IHNraXBwZWQ6IHRydWUsIHJlYXNvbjogXCJuby10YXJnZXRzXCIgfTtcclxuICB9XHJcblxyXG4gIGxhc3RXYXJtdXBBdCA9IG5vdztcclxuXHJcbiAgLy8gUmV2aWV3IG5vdGUgKENXUy9FZGdlIEFkZC1vbnMpOlxyXG4gIC8vIC0gVGhpcyBcInByZXdhcm1cIiBpcyBvbmx5IGZvciBwZXJmb3JtYW5jZSAocmVkdWNpbmcgZmlyc3QtbG9hZCBsYXRlbmN5IGZvciBoZWF2eSBBSSBzaXRlcykuXHJcbiAgLy8gLSBSZXF1ZXN0cyBnbyBkaXJlY3RseSBmcm9tIHRoZSB1c2VyJ3MgYnJvd3NlciB0byB0aGUgc2VsZWN0ZWQgdGhpcmTigJFwYXJ0eSBzaXRlczsgdGhlIGV4dGVuc2lvbiBkb2VzIE5PVCBzZW5kIHVzZXIgZGF0YSB0byBhbnkgZGV2ZWxvcGVyLWNvbnRyb2xsZWQgc2VydmVyLlxyXG4gIC8vIC0gVXNpbmcgbW9kZTpcIm5vLWNvcnNcIiBtZWFucyB0aGUgZXh0ZW5zaW9uIGRvZXMgTk9UIHJlYWQgcmVzcG9uc2UgYm9kaWVzOyBjcmVkZW50aWFsczpcImluY2x1ZGVcIiBvbmx5IHJldXNlcyB0aGUgdXNlcidzIGV4aXN0aW5nIGxvZ2luIHNlc3Npb24uXHJcbiAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICB0YXJnZXRzLm1hcCgoc2l0ZSkgPT4ge1xyXG4gICAgICBjb25zdCB3YXJtdXBVcmwgPSAoc2l0ZS51cmwgfHwgXCJcIikucmVwbGFjZShcIntxdWVyeX1cIiwgXCJcIik7XHJcbiAgICAgIGlmICghd2FybXVwVXJsIHx8ICEvXmh0dHBzPzpcXC9cXC8vLnRlc3Qod2FybXVwVXJsKSkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBmZXRjaCh3YXJtdXBVcmwsIHtcclxuICAgICAgICBjcmVkZW50aWFsczogXCJpbmNsdWRlXCIsXHJcbiAgICAgICAgbW9kZTogXCJuby1jb3JzXCIsXHJcbiAgICAgICAgY2FjaGU6IFwiZGVmYXVsdFwiLFxyXG4gICAgICAgIHJlZGlyZWN0OiBcImZvbGxvd1wiLFxyXG4gICAgICB9KS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgIH0pXHJcbiAgKTtcclxuXHJcbiAgcmV0dXJuIHsgd2FybWVkOiB0YXJnZXRzLmxlbmd0aCB9O1xyXG59XHJcbiIsICJpbXBvcnQgeyBVSV9QUkVGU19TVE9SQUdFX0tFWSB9IGZyb20gXCIuL3NoYXJlZC9zdG9yYWdlLWtleXMuanNcIjtcclxuaW1wb3J0IHsgZW5zdXJlSW5pdGlhbFN0YXRlRGVmYXVsdHMgfSBmcm9tIFwiLi9iYWNrZ3JvdW5kL2luaXRpYWwtc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgc3luY0NvbW1hbmRTaG9ydGN1dCB9IGZyb20gXCIuL2JhY2tncm91bmQvc2hvcnRjdXQtc3luYy5qc1wiO1xyXG5pbXBvcnQgeyBvcGVuQ29tcGFyZVBhZ2UsIHJ1blNlYXJjaEdyb3VwLCBvcGVuU2l0ZVRhYkFuZFNlbmQgfSBmcm9tIFwiLi9iYWNrZ3JvdW5kL3RhYnMuanNcIjtcclxuaW1wb3J0IHsgd2FybXVwQWlTaXRlcyB9IGZyb20gXCIuL2JhY2tncm91bmQvd2FybXVwLmpzXCI7XHJcblxyXG5jb25zdCBTRVRUSU5HU19QQUdFX1VSTCA9IGNocm9tZS5ydW50aW1lLmdldFVSTChcInNldHRpbmdzL3NldHRpbmdzLmh0bWxcIik7XHJcblxyXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XHJcbiAgY29uc29sZS5sb2coXCJRc2hvdCAtIOWtkOW8ueaQnOe0oiDlt7Llronoo4VcIik7XHJcbiAgYXdhaXQgZW5zdXJlSW5pdGlhbFN0YXRlRGVmYXVsdHMoKTtcclxuICBhd2FpdCBzeW5jQ29tbWFuZFNob3J0Y3V0KCk7XHJcbn0pO1xyXG5cclxuLy8g5b2T55So5oi35Zyo6K6+572u6YeM5L+u5pS55b+r5o236ZSu5pe277yM5ZCM5q2l5pu05pawIG1hbmlmZXN0IGNvbW1hbmQg55qE57uR5a6a77yMXHJcbi8vIOi/meagt+WGhee9rumhtemdoueahOiHquWKqOW8ueeql+S5n+S8mui3n+edgOeUqOaIt+eahOiuvue9rui1sOOAglxyXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcclxuICBpZiAoYXJlYSAhPT0gXCJsb2NhbFwiIHx8ICFjaGFuZ2VzW1VJX1BSRUZTX1NUT1JBR0VfS0VZXSkgcmV0dXJuO1xyXG4gIGNvbnN0IG5ld1ByZWZzID0gY2hhbmdlc1tVSV9QUkVGU19TVE9SQUdFX0tFWV0ubmV3VmFsdWU7XHJcbiAgaWYgKCFuZXdQcmVmcykgcmV0dXJuO1xyXG4gIHN5bmNDb21tYW5kU2hvcnRjdXQobmV3UHJlZnMpLmNhdGNoKCgpID0+IHt9KTtcclxufSk7XHJcblxyXG4vLyDlvZPnlKjmiLflnKjku7vmhI/pobXpnaLop6blj5EgbWFuaWZlc3QgY29tbWFuZCDml7bvvJpcclxuLy8gLSDmma7pgJrnvZHpobUg4oaSIOWQkeWGheWuueiEmuacrOWPkea2iOaBr+WIh+aNoua1ruWxglxyXG4vLyAtIOa1j+iniOWZqOWGhee9rumhtemdou+8iGNocm9tZTovL+OAgWVkZ2U6Ly8g562J77yJ4oaSIOaJk+W8gOaJqeWxleW8ueeql1xyXG5jaHJvbWUuY29tbWFuZHMub25Db21tYW5kLmFkZExpc3RlbmVyKGFzeW5jIChjb21tYW5kKSA9PiB7XHJcbiAgaWYgKGNvbW1hbmQgIT09IFwidG9nZ2xlLW92ZXJsYXlcIikgcmV0dXJuO1xyXG5cclxuICBjb25zdCBbdGFiXSA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pLmNhdGNoKCgpID0+IFtdKTtcclxuICBpZiAoIXRhYikgcmV0dXJuO1xyXG5cclxuICBjb25zdCB1cmwgPSB0YWIudXJsIHx8IFwiXCI7XHJcbiAgY29uc3QgaXNSZXN0cmljdGVkID1cclxuICAgICF1cmwgfHxcclxuICAgIHVybC5zdGFydHNXaXRoKFwiY2hyb21lOi8vXCIpIHx8XHJcbiAgICB1cmwuc3RhcnRzV2l0aChcImVkZ2U6Ly9cIikgfHxcclxuICAgIHVybC5zdGFydHNXaXRoKFwiYWJvdXQ6XCIpIHx8XHJcbiAgICB1cmwuc3RhcnRzV2l0aChcImNocm9tZS1leHRlbnNpb246Ly9cIikgfHxcclxuICAgIC9eaHR0cHM/OlxcL1xcLyhjaHJvbWVcXC5nb29nbGVcXC5jb21cXC93ZWJzdG9yZXxtaWNyb3NvZnRlZGdlXFwubWljcm9zb2Z0XFwuY29tXFwvYWRkb25zKS8udGVzdCh1cmwpO1xyXG5cclxuICBpZiAoaXNSZXN0cmljdGVkKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBjaHJvbWUuYWN0aW9uLm9wZW5Qb3B1cCgpO1xyXG4gICAgfSBjYXRjaCAoX2UpIHtcclxuICAgICAgLyog6YOo5YiG5oOF5Ya15LiL5peg5rOV5omT5byA5by556qX77yM5b+955WlICovXHJcbiAgICB9XHJcbiAgfSBlbHNlIHtcclxuICAgIGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYi5pZCwgeyB0eXBlOiBcIlRPR0dMRV9TRUFSQ0hfT1ZFUkxBWVwiIH0pLmNhdGNoKCgpID0+IHt9KTtcclxuICB9XHJcbn0pO1xyXG5cclxuY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlLCBfc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcclxuICBpZiAoIW1lc3NhZ2UgfHwgIW1lc3NhZ2UudHlwZSkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJFTlNVUkVfSU5JVElBTF9TVEFURV9ERUZBVUxUU1wiKSB7XHJcbiAgICBlbnN1cmVJbml0aWFsU3RhdGVEZWZhdWx0cygpXHJcbiAgICAgIC50aGVuKCgpID0+IHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlIH0pKVxyXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJTRVRUSU5HU19TQVZFRFwiKSB7XHJcbiAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSB9KTtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiT1BFTl9DT01QQVJFX1BBR0VcIikge1xyXG4gICAgb3BlbkNvbXBhcmVQYWdlKG1lc3NhZ2UucXVlcnkpXHJcbiAgICAgIC50aGVuKCh0YWIpID0+IHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCB0YWJJZDogdGFiLmlkIH0pKVxyXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJSVU5fU0VBUkNIX0dST1VQXCIpIHtcclxuICAgIHJ1blNlYXJjaEdyb3VwKG1lc3NhZ2UuZ3JvdXAsIG1lc3NhZ2UucXVlcnkpXHJcbiAgICAgIC50aGVuKChyZXN1bHQpID0+IHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCAuLi5yZXN1bHQgfSkpXHJcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSkpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICBpZiAobWVzc2FnZS50eXBlID09PSBcIk9QRU5fU0VUVElOR1NfUEFHRVwiKSB7XHJcbiAgICBjb25zdCBzZWN0aW9uID0gbWVzc2FnZS5zZWN0aW9uID8gYD9zZWN0aW9uPSR7bWVzc2FnZS5zZWN0aW9ufWAgOiBcIlwiO1xyXG4gICAgY2hyb21lLnRhYnMuY3JlYXRlKHsgdXJsOiBTRVRUSU5HU19QQUdFX1VSTCArIHNlY3Rpb24gfSlcclxuICAgICAgLnRoZW4oKHRhYikgPT4gc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHRhYklkOiB0YWIuaWQgfSkpXHJcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSkpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICBpZiAobWVzc2FnZS50eXBlID09PSBcIk9QRU5fRVhURVJOQUxfVVJMXCIpIHtcclxuICAgIGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogbWVzc2FnZS51cmwsIGFjdGl2ZTogdHJ1ZSB9KVxyXG4gICAgICAudGhlbigodGFiKSA9PiBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgdGFiSWQ6IHRhYi5pZCB9KSlcclxuICAgICAgLmNhdGNoKChlcnJvcikgPT4gc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiT1BFTl9TSVRFX1RBQl9BTkRfU0VORFwiKSB7XHJcbiAgICBvcGVuU2l0ZVRhYkFuZFNlbmQobWVzc2FnZS5zaXRlLCBtZXNzYWdlLnF1ZXJ5KVxyXG4gICAgICAudGhlbigocmVzdWx0KSA9PiBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgLi4ucmVzdWx0IH0pKVxyXG4gICAgICAuY2F0Y2goKGVycm9yKSA9PiBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJXQVJNVVBfQUlfU0lURVNcIikge1xyXG4gICAgd2FybXVwQWlTaXRlcygpXHJcbiAgICAgIC50aGVuKChyZXN1bHQpID0+IHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCAuLi5yZXN1bHQgfSkpXHJcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSkpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gZmFsc2U7XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUFPLE1BQU0sNEJBQTRCO0FBRWxDLE1BQU0sdUJBQXVCOzs7QUNHcEMsTUFBTSw2Q0FBNkM7QUFDbkQsTUFBTSw0Q0FBNEM7QUFDbEQsTUFBTSw4Q0FBOEM7QUFFcEQsaUJBQXNCLDZCQUE2QjtBQUVqRCxVQUFNLFNBQVMsTUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJO0FBQUEsTUFDNUM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLFlBQVksTUFBTSxRQUFRLE9BQU8seUJBQXlCLENBQUMsS0FBSyxPQUFPLHlCQUF5QixFQUFFLFNBQVM7QUFDakgsVUFBTSxrQkFBa0IsTUFBTSxRQUFRLE9BQU8sWUFBWSxLQUFLLE9BQU8sYUFBYSxTQUFTO0FBQzNGLFVBQU0saUJBQWlCLE1BQU0sUUFBUSxPQUFPLFdBQVc7QUFDdkQsVUFBTSxhQUFhLE9BQU8sb0JBQW9CLEtBQUssT0FBTyxPQUFPLG9CQUFvQixNQUFNO0FBQzNGLFVBQU0sa0NBQWtDLDRCQUE0QixPQUFPLFlBQVk7QUFDdkYsVUFBTSxzQ0FBc0M7QUFBQSxNQUMxQyxPQUFPLHlCQUF5QjtB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
