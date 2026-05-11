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
  const openedTabIds = tabSitePairs.map(({ tab }) => tab.id);
  let results = tabSitePairs.map(({ site, tab }) => ({
    ok: true,
    siteId: site.id,
    tabId: tab.id,
    message: "已打开标签页"
  }));

  if (query) {
    results = await Promise.all(
      tabSitePairs.map(async ({ tab, site }) => {
        try {
          if (!canSearchByUrl(site)) {
            await waitForTabComplete(tab.id);
            await sendQueryToTab(tab.id, site, query);
          }
          return {
            ok: true,
            siteId: site.id,
            tabId: tab.id,
            message: canSearchByUrl(site) ? "已通过 URL 打开搜索结果" : "已打开标签页并完成自动发送"
          };
        } catch (error) {
          return {
            ok: false,
            siteId: site.id,
            tabId: tab.id,
            error: error.message || "标签页自动发送失败"
          };
        }
      })
    );
  }

  return { tabIds: openedTabIds, results };
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
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "SEARCH_SITE_QUERY",
        site,
        query,
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }
  throw lastError || new Error("内容脚本未就绪，自动发送失败");
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
      clearTimeout(timeoutId);
    };
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error("等待标签页加载超时")));
    }, timeoutMs);

    function handleUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }
      finish(resolve);
    }

    function handleRemoved(removedTabId) {
      if (removedTabId !== tabId) {
        return;
      }
      finish(() => reject(new Error("标签页已关闭，自动发送取消")));
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);
    chrome.tabs.get(tabId)
      .then((tab) => {
        if (tab?.status === "complete") {
          finish(resolve);
        }
      })
      .catch((error) => {
        finish(() => reject(error));
      });
  });
}
