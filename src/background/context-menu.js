import { SEARCH_GROUPS_STORAGE_KEY, QUICK_ACCESS_SITES_KEY, UI_PREFS_STORAGE_KEY } from "../shared/storage-keys.js";
import { runSearchGroup, openSiteTabAndSend } from "./tabs.js";
import { loadEnabledSites } from "./sites.js";

const ROOT_ID = "qshot-root";
const GROUP_PREFIX = "qshot-group-";
const SITE_PREFIX = "qshot-site-";
let rebuildQueue = Promise.resolve();
let rebuildGeneration = 0;

// 在模块加载时注册点击监听（service worker 每次启动均执行一次）
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

/**
 * 根据当前搜索组与快捷调用站点配置重建右键菜单。
 * 在安装/更新、以及相关 storage key 变动时调用。
 */
export async function rebuildContextMenus() {
  const generation = ++rebuildGeneration;
  rebuildQueue = rebuildQueue
    .catch(() => {})
    .then(() => rebuildContextMenusNow(generation));
  return rebuildQueue;
}

async function rebuildContextMenusNow(generation) {
  await chrome.contextMenus.removeAll();

  const prefsResult = await chrome.storage.local.get(UI_PREFS_STORAGE_KEY);
  const uiPrefs = prefsResult[UI_PREFS_STORAGE_KEY] || {};
  if (uiPrefs.contextMenuEnabled === false) return;

  const [groups, quickSiteIds, allSites] = await Promise.all([
    loadSearchGroups(),
    loadQuickAccessSiteIds(),
    loadEnabledSites().catch(() => []),
  ]);

  const enabledGroups = groups.filter((g) => g.enabled !== false);
  const quickSites = quickSiteIds
    .map((id) => allSites.find((s) => s.id === id))
    .filter(Boolean);

  if (enabledGroups.length === 0 && quickSites.length === 0) return;

  if (generation !== rebuildGeneration) return;

  await createContextMenu({
    id: ROOT_ID,
    title: "Qshot \u641c\u7d22",
    contexts: ["selection"],
  });

  if (enabledGroups.length > 0) {
    for (const group of enabledGroups) {
      if (generation !== rebuildGeneration) return;
      const siteNames = (group.siteIds || [])
        .map((id) => allSites.find((s) => s.id === id)?.name)
        .filter(Boolean);
      const preview = siteNames.length
        ? "  (" + (siteNames.length > 5 ? siteNames.slice(0, 5).join(" \u00b7 ") + "..." : siteNames.join(" \u00b7 ")) + ")"
        : "";
      await createContextMenu({
        id: GROUP_PREFIX + group.id,
        parentId: ROOT_ID,
        title: group.name + preview,
        contexts: ["selection"],
      });
    }
  }

  if (quickSites.length > 0) {
    if (generation !== rebuildGeneration) return;
    await createContextMenu({
      id: "qshot-sites-sep",
      parentId: ROOT_ID,
      type: "separator",
      contexts: ["selection"],
    });

    for (const site of quickSites) {
      if (generation !== rebuildGeneration) return;
      await createContextMenu({
        id: SITE_PREFIX + site.id,
        parentId: ROOT_ID,
        title: site.name,
        contexts: ["selection"],
      });
    }
  }
}

async function handleContextMenuClick(info) {
  const query = (info.selectionText || "").trim();
  if (!query) return;

  const menuId = String(info.menuItemId);

  if (menuId.startsWith(GROUP_PREFIX)) {
    const groupId = menuId.slice(GROUP_PREFIX.length);
    const groups = await loadSearchGroups();
    const group = groups.find((g) => g.id === groupId);
    if (group) await runSearchGroup(group, query).catch(() => {});
    return;
  }

  if (menuId.startsWith(SITE_PREFIX)) {
    const siteId = menuId.slice(SITE_PREFIX.length);
    const allSites = await loadEnabledSites().catch(() => []);
    const site = allSites.find((s) => s.id === siteId);
    if (site) await openSiteTabAndSend(site, query).catch(() => {});
  }
}

async function loadSearchGroups() {
  const result = await chrome.storage.local.get(SEARCH_GROUPS_STORAGE_KEY);
  return Array.isArray(result[SEARCH_GROUPS_STORAGE_KEY])
    ? result[SEARCH_GROUPS_STORAGE_KEY]
    : [];
}

async function loadQuickAccessSiteIds() {
  const result = await chrome.storage.local.get(QUICK_ACCESS_SITES_KEY);
  return Array.isArray(result[QUICK_ACCESS_SITES_KEY])
    ? result[QUICK_ACCESS_SITES_KEY]
    : [];
}

function createContextMenu(options) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(options, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
