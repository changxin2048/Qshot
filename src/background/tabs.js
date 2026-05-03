import { loadEnabledSites, buildSiteUrl, canSearchByUrl, delay } from "./sites.js";

const COMPARE_PAGE_BASE_URL = chrome.runtime.getURL("iframe/iframe.html");

export async function openComparePage(query = "", siteIds = []) {
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

export async function runSearchGroup(group, query) {
  if (!group || !group.mode) {
    throw new Error("搜索组配置无效");
  }

  if (group.mode === "tabs") {
    return openSitesInTabs(group.siteIds || [], query);
  }

  const tab = await openComparePage(query, group.siteIds || []);
  return { tabId: tab.id };
}

export async function openSitesInTabs(siteIds, query) {
  const sites = await loadEnabledSites();
  const targetSites = Array.isArray(siteIds) && siteIds.length > 0
    ? sites.filter((site) => siteIds.includes(site.id))
    : sites;

  if (targetSites.length === 0) {
    return { tabIds: [] };
  }

  const tabSitePairs = [];

  // 第一个站点：真正新开标签并切过去，保留用户当前页面不被覆盖。
  const firstSite = targetSites[0];
  const firstTab = await chrome.tabs.create({
    url: buildSiteUrl(firstSite, query),
    active: true,
  }).catch(() => null);
  if (firstTab) tabSitePairs.push({ tab: firstTab, site: firstSite });

  // 其余站点：在后台新标签页中并发打开
  const remainingSites = targetSites.slice(1);
  const newTabs = await Promise.all(
    remainingSites.map((site) =>
      chrome.tabs.create({ url: buildSiteUrl(site, query), active: false }).catch(() => null)
    )
  );
  newTabs.forEach((tab, idx) => {
    if (tab) tabSitePairs.push({ tab, site: remainingSites[idx] });
  });

  // 并发等待每个 tab 完成加载并独立发送查询，互不阻塞
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
          // 单个站点失败不影响其他
        }
      })
    );
  }

  const openedTabIds = tabSitePairs.map(({ tab }) => tab.id);
  return { tabIds: openedTabIds };
}

export async function openSiteTabAndSend(site, query) {
  if (!site || !site.url) {
    throw new Error("站点配置无效");
  }

  const tab = await chrome.tabs.create({
    url: buildSiteUrl(site, query),
    active: true,
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
        query,
      });
      return;
    } catch (_error) {
      await delay(300);
    }
  }
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
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
