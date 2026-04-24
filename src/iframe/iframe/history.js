import { state, elements, STORAGE_KEYS } from "./state.js";
import { createRequestId } from "./utils.js";

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
    const normalizedSites = Array.isArray(entry.sites)
      ? entry.sites.map((site, index) => {
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

    const item = document.createElement("div");
    item.className = "history-item";

    const title = document.createElement("div");
    title.className = "history-item-title";
    title.textContent = entry.query;

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    meta.textContent = formatHistoryTime(entry.createdAt);

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

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "history-item-delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "删除记录");
    deleteBtn.setAttribute("data-tooltip", "删除该记录");
    deleteBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteHistoryEntry(entry.id);
    });

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(links);
    item.appendChild(deleteBtn);
    item.addEventListener("click", () => {
      elements.queryInput.value = entry.query;
      closeHistoryPanel();
    });
    elements.historyList.appendChild(item);
  });
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
