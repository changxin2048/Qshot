import { state, elements, STORAGE_KEYS } from "./state.js";
import { createRequestId, setQueryInputValue } from "./utils.js";

export async function savePreferences() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.cardSizeLevel]: state.cardSizeLevel,
    [STORAGE_KEYS.layoutRows]: state.layoutRows,
    [STORAGE_KEYS.layoutMode]: state.layoutMode,
    [STORAGE_KEYS.searchHistory]: state.searchHistory
  });
}

export async function saveSearchHistory(query, sites) {
  const entry = {
    id: createRequestId(),
    query,
    sites: sites.map((site) => {
      const ref = state.cardRefs.get(site.id);
      return {
        id: site.id,
        name: site.name,
        url: ref?.currentUrl || site.url
      };
    }),
    createdAt: new Date().toISOString()
  };

  state.currentHistoryEntryId = entry.id;
  sites.forEach((site) => {
    if (site?.id) {
      state.historyEntryIdBySiteId.set(site.id, entry.id);
    }
  });
  state.searchHistory = [entry, ...state.searchHistory].slice(0, 50);
  await savePreferences();
  renderHistoryList();
  return entry.id;
}

export async function refreshHistoryEntryUrls(entryId, sites) {
  if (!entryId || !Array.isArray(sites) || sites.length === 0) {
    return;
  }

  const latestUrlsBySiteId = new Map();
  sites.forEach((site) => {
    if (!site?.id) {
      return;
    }
    const ref = state.cardRefs.get(site.id);
    latestUrlsBySiteId.set(site.id, String(ref?.currentUrl || site.url || ""));
  });

  let changed = false;
  state.searchHistory = state.searchHistory.map((entry) => {
    if (entry.id !== entryId || !Array.isArray(entry.sites)) {
      return entry;
    }

    const updatedSites = entry.sites.map((site) => {
      const nextUrl = latestUrlsBySiteId.get(site?.id);
      if (!nextUrl || site.url === nextUrl) {
        return site;
      }
      changed = true;
      return {
        ...site,
        url: nextUrl
      };
    });

    return changed ? { ...entry, sites: updatedSites } : entry;
  });

  if (!changed) {
    return;
  }

  await savePreferences();
  renderHistoryList();
}

export function renderHistoryList() {
  if (!elements.historyList) {
    return;
  }

  elements.historyList.innerHTML = "";
  if (state.searchHistory.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-item-meta";
    empty.textContent = "暂无搜索记录";
    elements.historyList.appendChild(empty);
    return;
  }

  state.searchHistory.forEach((entry) => {
    const normalizedSites = normalizeHistorySites(entry.sites);

    const item = document.createElement("div");
    item.className = "history-item";

    const actions = document.createElement("div");
    actions.className = "history-item-actions";

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = formatHistoryTime(entry.createdAt);
    actions.appendChild(meta);

    const actionButtons = document.createElement("div");
    actionButtons.className = "history-action-buttons";

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "history-restore-btn";
    restoreBtn.textContent = "复原";
    restoreBtn.setAttribute("aria-label", "新开页面复原这次搜索会话");
    restoreBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openHistoryEntryRestorePage(entry.id);
    });
    actionButtons.appendChild(restoreBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "history-item-delete-btn";
    deleteBtn.textContent = "删除";
    deleteBtn.setAttribute("aria-label", "删除记录");
    deleteBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteHistoryEntry(entry.id);
    });
    actionButtons.appendChild(deleteBtn);
    actions.appendChild(actionButtons);

    const title = document.createElement("div");
    title.className = "history-item-title";
    title.textContent = entry.query;

    const links = document.createElement("div");
    links.className = "history-site-links";

    normalizedSites.forEach((site) => {
      const link = document.createElement(site.url ? "a" : "button");
      link.className = "history-site-link";
      link.textContent = site.name;

      if (site.url) {
        link.href = site.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } else {
        link.type = "button";
        link.disabled = true;
      }

      link.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      links.appendChild(link);
    });

    item.appendChild(actions);
    item.appendChild(title);
    item.appendChild(links);
    item.addEventListener("click", () => {
      setQueryInputValue(entry.query, { focus: true });
      closeHistoryPanel();
    });
    elements.historyList.appendChild(item);
  });
}

function openHistoryEntryRestorePage(entryId) {
  if (!entryId) {
    return;
  }

  const url = new URL(chrome.runtime.getURL("iframe/iframe.html"));
  url.searchParams.set("restoreHistoryId", entryId);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
  closeHistoryPanel();
}

export function applyHistoryRestoreFromUrl() {
  const entryId = state.restoreHistoryEntryId;
  if (!entryId) {
    return null;
  }

  const entry = state.searchHistory.find((item) => item?.id === entryId);
  if (!entry) {
    clearRestoreHistoryParamFromUrl();
    return null;
  }

  const normalizedSites = normalizeHistorySites(entry.sites);
  const siteById = new Map((state.allSites || []).map((site) => [site.id, site]));
  const restoredSites = normalizedSites
    .map((historySite) => buildRestoredSite(historySite, siteById))
    .filter(Boolean);

  if (restoredSites.length === 0) {
    setQueryInputValue("", { focus: false });
    clearRestoreHistoryParamFromUrl();
    return entry;
  }

  state.sites = restoredSites;
  state.hiddenSiteIds.clear();
  state.maximizedSiteId = null;
  state.activeSidebarSiteId = restoredSites[0]?.id || null;
  state.currentHistoryEntryId = entry.id || null;
  state.historyEntryIdBySiteId.clear();
  restoredSites.forEach((site) => {
    if (site?.id && entry?.id) {
      state.historyEntryIdBySiteId.set(site.id, entry.id);
    }
  });

  setQueryInputValue("", { focus: false });
  clearRestoreHistoryParamFromUrl();
  return entry;
}

function buildRestoredSite(historySite, siteById) {
  const id = String(historySite?.id || "").trim();
  const name = String(historySite?.name || "").trim() || "未命名站点";
  const url = normalizeRestoredUrl(historySite?.url);
  const baseSite = siteById.get(id);

  if (baseSite) {
    return {
      ...baseSite,
      restoreUrl: url || baseSite.url
    };
  }

  if (!id || !url) {
    return null;
  }

  return {
    id,
    name,
    url,
    restoreUrl: url,
    enabled: true,
    supportIframe: true,
    supportUrlQuery: false,
    matchPatterns: [],
    isCustom: true
  };
}

function normalizeRestoredUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch (_error) {
    return "";
  }
}

function normalizeHistorySites(sites) {
  return Array.isArray(sites)
    ? sites.map((site, index) => {
        if (typeof site === "string") {
          return {
            id: `legacy-${index}`,
            name: site,
            url: ""
          };
        }

        return {
          id: String(site.id || `site-${index}`),
          name: String(site.name || "未命名站点"),
          url: String(site.url || "")
        };
      })
    : [];
}

function clearRestoreHistoryParamFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("restoreHistoryId")) {
      url.searchParams.delete("restoreHistoryId");
      history.replaceState({}, "", url.toString());
    }
  } catch (_error) {
    /* ignore */
  }
}

export async function deleteHistoryEntry(id) {
  state.searchHistory = state.searchHistory.filter((entry) => entry.id !== id);
  for (const [siteId, entryId] of state.historyEntryIdBySiteId.entries()) {
    if (entryId === id) {
      state.historyEntryIdBySiteId.delete(siteId);
    }
  }
  if (state.currentHistoryEntryId === id) {
    state.currentHistoryEntryId = null;
  }
  await savePreferences();
  renderHistoryList();
}

export async function clearAllHistory() {
  state.searchHistory = [];
  state.currentHistoryEntryId = null;
  state.historyEntryIdBySiteId.clear();
  await savePreferences();
  renderHistoryList();
}

export function formatHistoryTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

export async function updateLatestHistoryUrl(siteId, url) {
  const entryId = state.historyEntryIdBySiteId.get(siteId) || state.currentHistoryEntryId;
  if (!siteId || !url || !entryId) {
    return;
  }

  let changed = false;
  state.searchHistory = state.searchHistory.map((entry) => {
    if (entry.id !== entryId || !Array.isArray(entry.sites)) {
      return entry;
    }

    const updatedSites = entry.sites.map((site) => {
      if (!site || site.id !== siteId || site.url === url) {
        return site;
      }

      changed = true;
      return {
        ...site,
        url
      };
    });

    return changed ? { ...entry, sites: updatedSites } : entry;
  });

  if (!changed) {
    return;
  }

  await savePreferences();
  renderHistoryList();
}

export function openHistoryPanel() {
  elements.historyPanel.classList.add("is-open");
}

export function closeHistoryPanel() {
  elements.historyPanel.classList.remove("is-open");
}

export function toggleHistoryPanel() {
  if (elements.historyPanel.classList.contains("is-open")) {
    closeHistoryPanel();
  } else {
    openHistoryPanel();
  }
}
