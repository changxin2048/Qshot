(() => {
  // src/iframe/iframe/state.js
  var BASE_CONFIG = globalThis.QSHOT_BASE_CONFIG || {};
  var STORAGE_KEYS = {
    cardSizeLevel: "cardSizeLevel",
    layoutRows: "layoutRows",
    layoutMode: "layoutMode",
    searchHistory: "searchHistory",
    promptGroups: "promptGroups"
  };
  var SITE_CATEGORIES = [
    { id: "ai", label: "AI", builtinIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso", "gemini", "chatgpt", "claude", "grok"] },
    { id: "other", label: "社媒", builtinIds: ["xiaohongshu", "bilibili", "zhihu", "douyin", "twitter", "youtube", "reddit", "tiktok"] },
    { id: "custom", label: "自定义", builtinIds: [] }
  ];
  var SESSION_SNAPSHOTS_MAX = 20;
  var state = {
    sites: [],
    allSites: [],
    requestedSiteIds: null,
    hiddenSiteIds: /* @__PURE__ */ new Set(),
    cardRefs: /* @__PURE__ */ new Map(),
    columnCount: "1",
    maximizedSiteId: null,
    shouldAutoSend: false,
    restoreHistoryEntryId: null,
    pendingDispatches: /* @__PURE__ */ new Map(),
    cardSizeLevel: "medium",
    layoutRows: 1,
    layoutMode: "grid",
    activeSidebarSiteId: null,
    searchHistory: [],
    currentHistoryEntryId: null,
    historyEntryIdBySiteId: /* @__PURE__ */ new Map(),
    promptGroups: [],
    activePromptGroupId: null,
    isPromptPickerOpen: false,
    lockedScrollLeft: null,
    scrollUnlockTimerId: null,
    isScrollLocked: false,
    scrollGuardActive: false,
    scrollGuardLeft: 0,
    scrollGuardTop: 0,
    scrollGuardRafId: null,
    scrollGuardTimerId: null,
    userIsScrolling: false,
    userScrollTimer: null,
    isSending: false,
    sessionSnapshots: [],
    sessionVersion: 0,
    lastSearchQuery: null,
    lastSearchTime: null,
    isAddSitePickerOpen: false,
    activeAddSiteCategory: "ai",
    // 并发槽位系统：
    //   loadingRefs：当前处于"加载中"（已赋 src、尚未 load/error/超时）的 ref 集合，
    //                size 不会超过 BASE_CONFIG.iframeMaxConcurrent。
    //   loadQueue ：已创建 iframe DOM 但尚未被允许赋 src 的 ref 队列，按入队顺序 FIFO。
    // 每当 loadingRefs 里有 ref 完成/失败/超时时调用 pumpLoadQueue 从队列取下一个补位。
    loadingRefs: /* @__PURE__ */ new Set(),
    loadQueue: []
  };
  var elements = {};
  var promptPreview = { mgr: null };

  // src/iframe/iframe/utils.js
  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function createRequestId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function clearAutoSendFlagFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("autosend");
    history.replaceState({}, "", url.toString());
  }
  function buildSiteUrl(site, query) {
    if (site?.id === "youtube") {
      const youtubeEmbedUrl = buildYoutubeEmbedUrl(query);
      if (youtubeEmbedUrl) {
        return youtubeEmbedUrl;
      }
    }
    const url = site.url || "";
    if (!url.includes("{query}")) {
      return url;
    }
    if (query && site.supportUrlQuery) {
      return url.replace("{query}", encodeURIComponent(query));
    }
    let next = url.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => sep === "?" ? "?" : "");
    next = next.replace(/[?&]$/, "");
    return next.replace(/\{query\}/g, "");
  }
  function buildYoutubeEmbedUrl(query) {
    const text = String(query || "").trim();
    if (!text) return "";
    const videoId = extractYoutubeVideoId(text);
    if (!videoId) return "";
    const origin = encodeURIComponent(window.location.origin);
    return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${origin}&playsinline=1&rel=0`;
  }
  function extractYoutubeVideoId(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
      return raw;
    }
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_e) {
      return "";
    }
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (/^[A-Za-z0-9_-]{11}$/.test(v || "")) {
        return v;
      }
      const match = parsed.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (match?.[2]) {
        return match[2];
      }
    }
    return "";
  }
  function getSelectedSites() {
    return state.sites.filter((site) => !state.hiddenSiteIds.has(site.id));
  }
  function isWideMediaSite(siteId) {
    return siteId === "xiaohongshu" || siteId === "bilibili";
  }
  function isSocialMediaCardSite(siteId) {
    return siteId === "xiaohongshu" || siteId === "bilibili" || siteId === "zhihu";
  }
  function getQuery() {
    return elements.queryInput.value.trim();
  }
  function setQueryInputValue(value, options = {}) {
    if (!elements.queryInput) {
      return;
    }
    elements.queryInput.value = String(value || "");
    elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));
    if (options.focus) {
      elements.queryInput.focus();
    }
  }
  function ensureCardsNotEmpty() {
    if (state.cardRefs.size > 0) {
      return;
    }
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "请先选择至少一个站点。";
    elements.iframesContainer.innerHTML = "";
    elements.iframesContainer.appendChild(emptyState);
  }
  function parseRequestedSiteIds(rawValue) {
    if (!rawValue) {
      return null;
    }
    const siteIds = rawValue.split(",").map((item) => item.trim()).filter(Boolean).filter((id, index, list) => list.indexOf(id) === index);
    return siteIds.length > 0 ? siteIds : null;
  }
  function normalizePromptGroups(source) {
    const list = Array.isArray(source) ? source : [];
    return list.map((group, groupIndex) => ({
      id: String(group.id || `prompt-group-${groupIndex}`),
      name: String(group.name || "未命名分组"),
      prompts: Array.isArray(group.prompts) ? group.prompts.map((prompt, promptIndex) => ({
        id: String(prompt.id || `prompt-${groupIndex}-${promptIndex}`),
        title: String(prompt.title || "未命名提示词"),
        content: String(prompt.content || "")
      })) : []
    }));
  }

  // src/iframe/iframe/history.js
  async function savePreferences() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.cardSizeLevel]: state.cardSizeLevel,
      [STORAGE_KEYS.layoutRows]: state.layoutRows,
      [STORAGE_KEYS.layoutMode]: state.layoutMode,
      [STORAGE_KEYS.searchHistory]: state.searchHistory
    });
  }
  async function saveSearchHistory(query, sites) {
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
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
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
  async function refreshHistoryEntryUrls(entryId, sites) {
    if (!entryId || !Array.isArray(sites) || sites.length === 0) {
      return;
    }
    const latestUrlsBySiteId = /* @__PURE__ */ new Map();
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
  function renderHistoryList() {
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
  function applyHistoryRestoreFromUrl() {
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
    const restoredSites = normalizedSites.map((historySite) => buildRestoredSite(historySite, siteById)).filter(Boolean);
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
    return Array.isArray(sites) ? sites.map((site, index) => {
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
    }) : [];
  }
  function clearRestoreHistoryParamFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("restoreHistoryId")) {
        url.searchParams.delete("restoreHistoryId");
        history.replaceState({}, "", url.toString());
      }
    } catch (_error) {
    }
  }
  async function deleteHistoryEntry(id) {
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
  async function clearAllHistory() {
    state.searchHistory = [];
    state.currentHistoryEntryId = null;
    state.historyEntryIdBySiteId.clear();
    await savePreferences();
    renderHistoryList();
  }
  function formatHistoryTime(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString();
  }
  async function updateLatestHistoryUrl(siteId, url) {
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
  function openHistoryPanel() {
    elements.historyPanel.classList.add("is-open");
  }
  function closeHistoryPanel() {
    elements.historyPanel.classList.remove("is-open");
  }
  function toggleHistoryPanel() {
    if (elements.historyPanel.classList.contains("is-open")) {
      closeHistoryPanel();
    } else {
      openHistoryPanel();
    }
  }

  // src/iframe/iframe/layout.js
  function activateScrollGuard(left, top, durationMs) {
    const container = elements.iframesContainer;
    state.scrollGuardActive = true;
    state.scrollGuardLeft = left;
    state.scrollGuardTop = top;
    container?.classList.add("is-scroll-guarded");
    if (state.scrollGuardTimerId) {
      window.clearTimeout(state.scrollGuardTimerId);
    }
    startScrollGuardLoop();
    state.scrollGuardTimerId = window.setTimeout(() => {
      stopScrollGuard();
    }, Math.max(1e3, durationMs | 0));
  }
  function startScrollGuardLoop() {
    if (state.scrollGuardRafId) {
      return;
    }
    const tick = () => {
      const container = elements.iframesContainer;
      if (!state.scrollGuardActive || !container) {
        state.scrollGuardRafId = null;
        return;
      }
      if (!state.userIsScrolling) {
        if (container.scrollLeft !== state.scrollGuardLeft) {
          container.scrollLeft = state.scrollGuardLeft;
        }
        if (container.scrollTop !== state.scrollGuardTop) {
          container.scrollTop = state.scrollGuardTop;
        }
      }
      state.scrollGuardRafId = window.requestAnimationFrame(tick);
    };
    state.scrollGuardRafId = window.requestAnimationFrame(tick);
  }
  function stopScrollGuard() {
    state.scrollGuardActive = false;
    if (state.scrollGuardTimerId) {
      window.clearTimeout(state.scrollGuardTimerId);
      state.scrollGuardTimerId = null;
    }
    if (state.scrollGuardRafId) {
      window.cancelAnimationFrame(state.scrollGuardRafId);
      state.scrollGuardRafId = null;
    }
    elements.iframesContainer?.classList.remove("is-scroll-guarded");
  }
  function getScrollGuardDurationMs(cardCount) {
    const staggerMs = BASE_CONFIG.iframeStaggerMs != null ? BASE_CONFIG.iframeStaggerMs : 120;
    const base = 3e3;
    const extra = Math.max(0, (cardCount | 0) - 1) * staggerMs;
    return Math.min(base + extra + 1500, 8e3);
  }
  function updateScrollEdgeBtns() {
    const show = state.layoutRows === 1 && state.layoutMode !== "sidebar";
    const c = elements.iframesContainer;
    const canScrollH = c.scrollWidth > c.clientWidth + 2;
    if (elements.scrollToStartBtn) elements.scrollToStartBtn.hidden = !(show && canScrollH);
    if (elements.scrollToEndBtn) elements.scrollToEndBtn.hidden = !(show && canScrollH);
    const showVert = state.layoutRows > 1 && state.layoutMode !== "sidebar";
    const canScrollV = c.scrollHeight > c.clientHeight + 2;
    if (elements.scrollVertGroup) elements.scrollVertGroup.hidden = !(showVert && canScrollV);
  }
  function lockContainerScroll() {
    if (!elements.iframesContainer) {
      return;
    }
    if (state.layoutRows === 1) {
      state.lockedScrollLeft = null;
      state.isScrollLocked = false;
      return;
    }
    state.lockedScrollLeft = elements.iframesContainer.scrollLeft;
    state.isScrollLocked = true;
  }
  function restoreLockedScrollPosition() {
    if (state.lockedScrollLeft === null || !elements.iframesContainer) {
      return;
    }
    elements.iframesContainer.scrollLeft = state.lockedScrollLeft;
  }
  function scheduleScrollUnlock() {
    if (state.scrollUnlockTimerId) {
      window.clearTimeout(state.scrollUnlockTimerId);
    }
    if (state.layoutRows === 1) {
      state.lockedScrollLeft = null;
      state.isScrollLocked = false;
      state.scrollUnlockTimerId = null;
      return;
    }
    state.scrollUnlockTimerId = window.setTimeout(() => {
      state.lockedScrollLeft = null;
      state.isScrollLocked = false;
      state.scrollUnlockTimerId = null;
    }, 2200);
  }
  function updateLayoutUi() {
    const appShell = document.querySelector(".app-shell");
    if (state.layoutMode === "sidebar") {
      appShell?.classList.add("is-sidebar-mode");
      elements.iframesContainer.dataset.layoutRows = "sidebar";
      if (elements.siteNavPanel) elements.siteNavPanel.hidden = false;
      if (elements.cardSizeGroup) elements.cardSizeGroup.hidden = true;
      elements.sidebarLayoutBtn?.classList.add("is-active");
      elements.layoutRowsButtons.forEach((btn) => btn.classList.remove("is-active"));
      elements.cardSizeButtons.forEach((btn) => btn.classList.remove("is-active"));
      updateScrollEdgeBtns();
      return;
    }
    appShell?.classList.remove("is-sidebar-mode");
    if (elements.siteNavPanel) elements.siteNavPanel.hidden = true;
    elements.sidebarLayoutBtn?.classList.remove("is-active");
    state.cardRefs.forEach((ref) => {
      if (ref.cardEl) ref.cardEl.hidden = false;
    });
    const singleRowWidthMap = {
      small: 480,
      medium: 640,
      large: 960
    };
    const socialMediaWidthMap = {
      small: 640,
      medium: 760,
      large: 960
    };
    let effectiveWidth = singleRowWidthMap[state.cardSizeLevel] || singleRowWidthMap.medium;
    const socialMediaWidth = socialMediaWidthMap[state.cardSizeLevel] || socialMediaWidthMap.medium;
    let rowHeight = "calc(100vh - 163px)";
    if (state.layoutRows > 1) {
      rowHeight = state.layoutRows === 2 ? "calc(100vh - 159px)" : "calc(100vh - 179px)";
    }
    state.lockedScrollLeft = null;
    state.isScrollLocked = false;
    if (state.scrollUnlockTimerId) {
      window.clearTimeout(state.scrollUnlockTimerId);
      state.scrollUnlockTimerId = null;
    }
    elements.iframesContainer.style.setProperty("--effective-card-width", `${effectiveWidth}px`);
    elements.iframesContainer.style.setProperty("--social-media-card-width", `${socialMediaWidth}px`);
    elements.iframesContainer.style.setProperty("--row-height", rowHeight);
    document.documentElement.style.setProperty("--card-width", `${effectiveWidth}px`);
    elements.iframesContainer.dataset.layoutRows = String(state.layoutRows);
    elements.layoutRowsButtons.forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.layoutRows) === state.layoutRows);
    });
    elements.cardSizeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.cardSize === state.cardSizeLevel);
    });
    if (elements.cardSizeGroup) {
      elements.cardSizeGroup.hidden = state.layoutRows !== 1;
    }
    updateScrollEdgeBtns();
  }
  function renderSiteNav() {
    if (!elements.siteNavList) return;
    elements.siteNavList.innerHTML = "";
    const selectedSites = getSelectedSites();
    selectedSites.forEach((site) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "site-nav-item" + (site.id === state.activeSidebarSiteId ? " is-active" : "");
      btn.dataset.siteId = site.id;
      btn.innerHTML = `<span class="site-nav-item-indicator"></span><span>${escapeHtml(site.name)}</span>`;
      btn.addEventListener("click", () => activateSidebarSite(site.id));
      elements.siteNavList.appendChild(btn);
    });
  }
  function activateSidebarSite(siteId) {
    state.activeSidebarSiteId = siteId;
    state.cardRefs.forEach((ref, id) => {
      if (ref.cardEl) ref.cardEl.hidden = id !== siteId;
    });
    if (elements.siteNavList) {
      elements.siteNavList.querySelectorAll(".site-nav-item").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.siteId === siteId);
      });
    }
  }
  function renderCardNavStrip() {
    const strip = elements.cardNavStrip;
    if (!strip) return;
    strip.innerHTML = "";
    const visibleSites = getSelectedSites().filter((site) => state.cardRefs.has(site.id));
    if (visibleSites.length <= 1) {
      return;
    }
    visibleSites.forEach((site) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "card-nav-chip";
      chip.dataset.siteId = site.id;
      chip.textContent = site.name;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        scrollToCard(site.id);
      });
      strip.appendChild(chip);
    });
  }
  function scrollToCard(siteId) {
    const ref = state.cardRefs.get(siteId);
    if (!ref?.cardEl) return;
    if (state.layoutMode === "sidebar") {
      activateSidebarSite(siteId);
      return;
    }
    const card = ref.cardEl;
    const container = elements.iframesContainer;
    if (!container) return;
    const cardRect = card.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (state.layoutRows === 1) {
      const target = container.scrollLeft + (cardRect.left - containerRect.left) - 12;
      container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    } else {
      const target = container.scrollTop + (cardRect.top - containerRect.top) - 12;
      container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }

  // src/shared/storage-keys.js
  var UI_PREFS_STORAGE_KEY = "uiPrefs";
  var DEFAULT_PROMPT_GROUP_ID = "prompt-group-default";

  // src/shared/diagnostics.js
  var DIAGNOSTIC_LOG_PREF_KEY = "diagnosticLogsEnabled";
  var LOG_PREFIX = "[Qshot diagnostics]";
  var diagnosticLogsEnabled = false;
  var hasLoadedPreference = false;
  function getChromeStorage() {
    try {
      return chrome?.storage?.local || null;
    } catch (_error) {
      return null;
    }
  }
  async function refreshDiagnosticLogPreference() {
    const storage = getChromeStorage();
    if (!storage) {
      diagnosticLogsEnabled = false;
      hasLoadedPreference = true;
      return diagnosticLogsEnabled;
    }
    try {
      const stored = await storage.get([UI_PREFS_STORAGE_KEY]);
      diagnosticLogsEnabled = stored[UI_PREFS_STORAGE_KEY]?.[DIAGNOSTIC_LOG_PREF_KEY] === true;
    } catch (_error) {
      diagnosticLogsEnabled = false;
    }
    hasLoadedPreference = true;
    return diagnosticLogsEnabled;
  }
  function isDiagnosticLoggingEnabled() {
    if (!hasLoadedPreference) {
      refreshDiagnosticLogPreference();
    }
    return diagnosticLogsEnabled;
  }
  function diagnosticLog(scope, eventName, details = void 0) {
    if (!isDiagnosticLoggingEnabled()) {
      return;
    }
    const label = `${LOG_PREFIX} ${scope}:${eventName}`;
    if (details === void 0) {
      console.log(label);
      return;
    }
    console.log(label, sanitizeDiagnosticDetails(details));
  }
  function sanitizeDiagnosticDetails(value) {
    if (!value || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeDiagnosticDetails);
    }
    const output = {};
    Object.entries(value).forEach(([key, rawValue]) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes("query") || normalizedKey.includes("prompt") || normalizedKey.includes("content")) {
        output[key] = describeTextValue(rawValue);
        return;
      }
      if (normalizedKey.includes("url")) {
        output[key] = rawValue ? "[redacted-url]" : rawValue;
        return;
      }
      if (key === "site" && rawValue && typeof rawValue === "object") {
        output[key] = { id: rawValue.id, name: rawValue.name };
        return;
      }
      output[key] = sanitizeDiagnosticDetails(rawValue);
    });
    return output;
  }
  function describeTextValue(value) {
    if (typeof value !== "string") {
      return value == null ? value : "[redacted]";
    }
    return `[redacted length=${value.length}]`;
  }
  try {
    refreshDiagnosticLogPreference();
    chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName !== "local" || !changes[UI_PREFS_STORAGE_KEY]) {
        return;
      }
      const nextPrefs = changes[UI_PREFS_STORAGE_KEY].newValue;
      diagnosticLogsEnabled = nextPrefs?.[DIAGNOSTIC_LOG_PREF_KEY] === true;
      hasLoadedPreference = true;
    });
  } catch (_error) {
    diagnosticLogsEnabled = false;
    hasLoadedPreference = true;
  }

  // src/iframe/iframe/file-upload.js
  var MAX_FILE_SIZE = 25 * 1024 * 1024;
  var MAX_FILES_PER_PICK = 8;
  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  async function fileToEntry(file) {
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type || "application/octet-stream" });
    return {
      blob,
      name: file.name || `file-${Date.now()}`,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified || Date.now()
    };
  }
  function dispatchFilesToCard(ref, entries) {
    if (!ref || !ref.iframeEl) return false;
    if (entries.length === 0) return false;
    if (!ref.loaded || !ref.iframeEl.contentWindow) {
      if (!Array.isArray(ref.pendingFilesOnLoad)) {
        ref.pendingFilesOnLoad = [];
      }
      ref.pendingFilesOnLoad.push(...entries);
      diagnosticLog("compare.files", "queued-for-load", {
        site: ref.site,
        fileCount: entries.length
      });
      return true;
    }
    try {
      ref.iframeEl.contentWindow.postMessage(
        {
          type: "QSHOT_PASTE_FILES",
          files: entries,
          site: ref.site,
          requestId: createRequestId()
        },
        "*"
      );
      diagnosticLog("compare.files", "post-message", {
        site: ref.site,
        fileCount: entries.length
      });
      return true;
    } catch (error) {
      diagnosticLog("compare.files", "post-message-error", {
        site: ref.site,
        error: error.message
      });
      return false;
    }
  }
  function dispatchPendingFilesForCard(ref) {
    if (!ref || !Array.isArray(ref.pendingFilesOnLoad) || ref.pendingFilesOnLoad.length === 0) {
      return;
    }
    const entries = ref.pendingFilesOnLoad;
    ref.pendingFilesOnLoad = [];
    dispatchFilesToCard(ref, entries);
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function ingestFileList(fileList) {
    if (!fileList) return;
    const incoming = Array.from(fileList).slice(0, MAX_FILES_PER_PICK);
    if (incoming.length === 0) return;
    const entries = [];
    for (const file of incoming) {
      if (!(file instanceof File)) continue;
      if (file.size > MAX_FILE_SIZE) {
        window.alert(`文件 "${file.name}" 超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB 上限，已跳过。`);
        continue;
      }
      try {
        entries.push(await fileToEntry(file));
      } catch (error) {
        diagnosticLog("compare.files", "read-failed", { name: file.name, error: error.message });
      }
    }
    if (entries.length === 0) return;
    const totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0);
    const targets = [];
    state.cardRefs.forEach((ref) => {
      if (state.hiddenSiteIds.has(ref.site.id)) return;
      targets.push(ref);
    });
    setGlobalStatus(
      `准备把 ${entries.length} 个文件（${formatSize(totalSize)}）依次发送到 ${targets.length} 个 AI 卡片...`
    );
    let dispatchedCount = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const ref = targets[i];
      setGlobalStatus(
        `正在向第 ${i + 1}/${targets.length} 个卡片（${ref.site.name || ref.site.id}）发送文件...`
      );
      if (dispatchFilesToCard(ref, entries)) {
        dispatchedCount += 1;
      }
      if (i < targets.length - 1) {
        await delay(1200);
      }
    }
    setGlobalStatus(
      `已发送 ${entries.length} 个文件（${formatSize(totalSize)}）到 ${dispatchedCount} 个 AI 卡片，请稍候各卡片完成上传后再提交问题。`
    );
  }
  function bindFileUploadEvents() {
    const btn = elements.fileUploadBtn;
    const input = elements.fileUploadInput;
    const textarea = elements.queryInput;
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      input.click();
    });
    input.addEventListener("change", async () => {
      await ingestFileList(input.files);
      input.value = "";
    });
    if (textarea) {
      textarea.addEventListener("paste", (event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          ingestFileList(files);
        }
      });
      textarea.addEventListener("dragover", (event) => {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
          event.preventDefault();
        }
      });
      textarea.addEventListener("drop", (event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          ingestFileList(files);
        }
      });
    }
  }

  // src/iframe/iframe/cards-render.js
  function renderCards() {
    elements.iframesContainer.innerHTML = "";
    elements.iframesContainer.dataset.columns = "1";
    elements.iframesContainer.dataset.layoutRows = state.layoutMode === "sidebar" ? "sidebar" : String(state.layoutRows);
    state.cardRefs.clear();
    const selectedSites = getSelectedSites();
    if (selectedSites.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "请先选择至少一个站点。";
      elements.iframesContainer.appendChild(emptyState);
      return;
    }
    selectedSites.forEach((site) => {
      const card = createSiteCard(site);
      if (isWideMediaSite(site.id)) {
        card.classList.add("iframe-card-wide-media");
      }
      if (isSocialMediaCardSite(site.id)) {
        card.classList.add("iframe-card-social-media");
      }
      elements.iframesContainer.appendChild(card);
    });
    if (state.layoutMode === "sidebar") {
      if (!state.activeSidebarSiteId || !state.cardRefs.has(state.activeSidebarSiteId)) {
        state.activeSidebarSiteId = selectedSites[0]?.id || null;
      }
      state.cardRefs.forEach((ref, siteId) => {
        if (ref.cardEl) ref.cardEl.hidden = siteId !== state.activeSidebarSiteId;
      });
      renderSiteNav();
    }
    elements.iframesContainer.scrollLeft = 0;
    elements.iframesContainer.scrollTop = 0;
    activateScrollGuard(0, 0, getScrollGuardDurationMs(selectedSites.length));
    renderCardNavStrip();
  }
  function createSiteCard(site) {
    const card = document.createElement("article");
    card.className = "iframe-card";
    card.dataset.siteId = site.id;
    card.tabIndex = 0;
    card.addEventListener("mouseenter", () => {
      card.classList.add("is-actions-visible");
    });
    card.addEventListener("mouseleave", () => {
      card.classList.remove("is-actions-visible");
    });
    card.addEventListener("focusin", () => {
      card.classList.add("is-actions-visible");
    });
    card.addEventListener("focusout", () => {
      card.classList.remove("is-actions-visible");
    });
    const title = document.createElement("h3");
    title.className = "site-title";
    title.textContent = site.name;
    const body = document.createElement("div");
    body.className = "iframe-card-body";
    const status = document.createElement("div");
    status.className = "site-status visually-hidden";
    status.textContent = site.supportIframe ? "等待 iframe 加载" : "该站点默认使用新标签页模式";
    const iconJump = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    const iconRefresh = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    const iconClose = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const jumpBtn = document.createElement("button");
    jumpBtn.type = "button";
    jumpBtn.className = "card-hover-btn card-hover-btn-icon";
    jumpBtn.innerHTML = iconJump;
    jumpBtn.setAttribute("data-tooltip", "跳往原网站");
    jumpBtn.setAttribute("aria-label", "跳往原网站");
    jumpBtn.addEventListener("click", () => {
      const ref2 = state.cardRefs.get(site.id);
      const targetUrl = ref2?.currentUrl || site.url;
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    });
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "card-hover-btn card-hover-btn-icon";
    refreshBtn.innerHTML = iconRefresh;
    refreshBtn.setAttribute("data-tooltip", "刷新当前卡片");
    refreshBtn.setAttribute("aria-label", "刷新当前卡片");
    refreshBtn.addEventListener("click", () => {
      const ref2 = state.cardRefs.get(site.id);
      if (ref2) {
        refreshSiteCard(ref2);
      }
    });
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "card-hover-btn card-hover-btn-icon";
    closeBtn.innerHTML = iconClose;
    closeBtn.setAttribute("data-tooltip", "关闭这张卡片");
    closeBtn.setAttribute("aria-label", "关闭这张卡片");
    closeBtn.addEventListener("click", () => {
      state.hiddenSiteIds.add(site.id);
      abortPendingWorkForSite(site.id);
      const ref2 = state.cardRefs.get(site.id);
      if (ref2?.cardEl) {
        ref2.cardEl.remove();
      }
      state.cardRefs.delete(site.id);
      if (state.maximizedSiteId === site.id) {
        state.maximizedSiteId = null;
      }
      if (state.layoutMode === "sidebar" && state.activeSidebarSiteId === site.id) {
        const nextSite = getSelectedSites().find((s) => s.id !== site.id && state.cardRefs.has(s.id));
        state.activeSidebarSiteId = nextSite?.id || null;
        if (state.activeSidebarSiteId) {
          state.cardRefs.forEach((r, id) => {
            if (r.cardEl) r.cardEl.hidden = id !== state.activeSidebarSiteId;
          });
        }
        renderSiteNav();
      }
      ensureCardsNotEmpty();
      renderCardNavStrip();
      setGlobalStatus(`已关闭 ${site.name} 卡片。`);
    });
    const hoverActions = document.createElement("div");
    hoverActions.className = "card-hover-actions";
    hoverActions.appendChild(jumpBtn);
    hoverActions.appendChild(refreshBtn);
    hoverActions.appendChild(closeBtn);
    const initialUrl = site.restoreUrl || site.url;
    const ref = {
      site,
      restoreUrl: site.restoreUrl || "",
      cardEl: card,
      statusEl: status,
      bodyEl: body,
      iframeEl: null,
      loadingEl: null,
      hoverActionEl: hoverActions,
      jumpBtnEl: jumpBtn,
      refreshBtnEl: refreshBtn,
      closeBtnEl: closeBtn,
      loaded: false,
      pendingQuery: "",
      pendingQueryDelayMs: 0,
      pendingQueryResolver: null,
      pendingFilesOnLoad: [],
      currentUrl: initialUrl,
      // 本张卡片当前 iframe 相关的两个定时器：
      //   loadDelayTimerId：错峰加载排队中，到点给 iframe 赋 src
      //   fallbackTimerId：超过 embedTimeoutMs 仍未加载成功时切换到 fallback 页
      // 刷新 / 关闭卡片时必须清理，否则旧 timer 会把新 iframe 踢掉或在已关闭卡片上跑。
      loadDelayTimerId: null,
      fallbackTimerId: null
    };
    state.cardRefs.set(site.id, ref);
    createIframeBody(ref);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(hoverActions);
    return card;
  }
  function refreshSiteCard(ref, options = {}) {
    const { immediate = true } = options;
    ref.loaded = false;
    ref.pendingQuery = "";
    ref.pendingQueryDelayMs = 0;
    ref.pendingQueryResolver = null;
    ref.pendingFilesOnLoad = [];
    ref.iframeEl = null;
    createIframeBody(ref, { immediate });
    setSiteStatus(ref.site.id, "正在重新加载…");
  }
  function createIframeBody(ref, options = {}) {
    const { immediate = false } = options;
    clearIframeTimers(ref);
    removeFromLoadQueue(ref);
    if (state.loadingRefs.has(ref)) {
      state.loadingRefs.delete(ref);
    }
    if (ref.site.supportIframe === false) {
      renderExternalFallback(ref);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.className = "ai-iframe";
    iframe.dataset.siteId = ref.site.id;
    iframe.loading = "eager";
    iframe.allow = ref.site.id === "grok" ? "clipboard-read; clipboard-write; autoplay; fullscreen; picture-in-picture" : "clipboard-read; clipboard-write; microphone; camera; geolocation; autoplay; fullscreen; picture-in-picture; storage-access; web-share";
    const loadState = { resolved: false };
    ref._loadState = loadState;
    ref._targetSrc = ref.restoreUrl || buildSiteUrl(ref.site, "");
    const loading = createLoadingOverlay(ref.site.name, immediate ? "正在加载…" : "等待加载中…");
    iframe.addEventListener("load", () => {
      if (ref.iframeEl !== iframe) return;
      const currentSrc = iframe.src || "";
      if (!currentSrc || currentSrc === "about:blank") {
        return;
      }
      loadState.resolved = true;
      ref.loaded = true;
      ref.currentUrl = currentSrc;
      clearIframeTimers(ref);
      releaseLoadSlot(ref);
      hideLoadingOverlay(ref);
      setSiteStatus(ref.site.id, "iframe 已加载，可直接在卡片内操作。");
      if (ref.pendingQuery) {
        const queuedQuery = ref.pendingQuery;
        const queuedDelayMs = Number.isFinite(ref.pendingQueryDelayMs) ? ref.pendingQueryDelayMs : 0;
        const queuedResolver = ref.pendingQueryResolver;
        ref.pendingQuery = "";
        ref.pendingQueryDelayMs = 0;
        ref.pendingQueryResolver = null;
        dispatchSearchWithRetries(ref, queuedQuery, queuedDelayMs).then((result) => {
          if (typeof queuedResolver === "function") {
            queuedResolver(result);
          }
        });
      }
      dispatchPendingFilesForCard(ref);
    });
    iframe.addEventListener("error", () => {
      if (ref.iframeEl !== iframe) return;
      if (!loadState.resolved) {
        loadState.resolved = true;
        clearIframeTimers(ref);
        releaseLoadSlot(ref);
        renderFallback(ref, "加载失败，目标站点未响应或拒绝了连接。");
      }
    });
    ref.bodyEl.innerHTML = "";
    ref.bodyEl.appendChild(loading);
    ref.bodyEl.appendChild(iframe);
    ref.iframeEl = iframe;
    ref.loadingEl = loading;
    if (immediate) {
      state.loadingRefs.add(ref);
      beginIframeLoad(ref);
    } else {
      enqueueLoad(ref);
    }
  }
  function renderFallback(ref, message) {
    clearIframeTimers(ref);
    ref.loadingEl = null;
    ref.bodyEl.innerHTML = `
    <div class="fallback-panel">
      <div class="warning-box">
        <strong>当前卡片未能完成嵌入</strong>
      </div>
      <p>${escapeHtml(message || ref.site.notes || "该站点可能限制 iframe 嵌入。")}</p>
      <div class="inline-action-row">
        <button class="site-action-btn" type="button" data-retry-load>重新加载</button>
        <button class="site-action-btn" type="button" data-open-site="${escapeHtml(ref.site.url)}">在新标签页打开</button>
      </div>
    </div>
  `;
    ref.iframeEl = null;
    ref.loaded = false;
    const retryButton = ref.bodyEl.querySelector("[data-retry-load]");
    if (retryButton) {
      retryButton.addEventListener("click", () => {
        createIframeBody(ref, { immediate: true });
        setSiteStatus(ref.site.id, "正在重新加载…");
      });
    }
    const openButton = ref.bodyEl.querySelector("[data-open-site]");
    if (openButton) {
      openButton.addEventListener("click", () => {
        window.open(ref.site.url, "_blank", "noopener,noreferrer");
      });
    }
    if (ref.hoverActionEl && !ref.cardEl.contains(ref.hoverActionEl)) {
      ref.cardEl.appendChild(ref.hoverActionEl);
    }
    setSiteStatus(ref.site.id, "该站点暂时无法在卡片内嵌入。");
  }
  function renderExternalFallback(ref) {
    ref.loadingEl = null;
    ref.iframeEl = null;
    ref.loaded = false;
    ref.currentUrl = ref.restoreUrl || buildSiteUrl(ref.site, "");
    ref.bodyEl.innerHTML = `
    <div class="fallback-panel">
      <div class="warning-box">
        <strong>${escapeHtml(ref.site.name)} 已改为新标签页模式</strong>
      </div>
      <p>${escapeHtml(ref.site.notes || "该站点当前不适合在卡片内嵌入。")}</p>
      <div class="inline-action-row">
        <button class="site-action-btn" type="button" data-open-site="${escapeHtml(ref.currentUrl)}">在新标签页打开</button>
      </div>
    </div>
  `;
    const openButton = ref.bodyEl.querySelector("[data-open-site]");
    if (openButton) {
      openButton.addEventListener("click", () => {
        window.open(ref.currentUrl || ref.site.url, "_blank", "noopener,noreferrer");
      });
    }
    if (ref.hoverActionEl && !ref.cardEl.contains(ref.hoverActionEl)) {
      ref.cardEl.appendChild(ref.hoverActionEl);
    }
    setSiteStatus(ref.site.id, "该站点已改为新标签页模式。");
  }
  function createLoadingOverlay(siteName, message) {
    const loading = document.createElement("div");
    loading.className = "iframe-loading-panel";
    loading.setAttribute("aria-live", "polite");
    loading.innerHTML = `
    <div class="iframe-loading-spinner" aria-hidden="true"></div>
    <div class="iframe-loading-title">${escapeHtml(siteName)}</div>
    <div class="iframe-loading-text">${escapeHtml(message)}</div>
  `;
    return loading;
  }
  function updateLoadingOverlay(ref, message) {
    const textEl = ref?.loadingEl?.querySelector(".iframe-loading-text");
    if (textEl) {
      textEl.textContent = message;
    }
  }
  function hideLoadingOverlay(ref) {
    if (!ref?.loadingEl) return;
    ref.loadingEl.hidden = true;
  }

  // src/iframe/iframe/load-queue.js
  function clearIframeTimers(ref) {
    if (!ref) return;
    if (ref.loadDelayTimerId) {
      window.clearTimeout(ref.loadDelayTimerId);
      ref.loadDelayTimerId = null;
    }
    if (ref.fallbackTimerId) {
      window.clearTimeout(ref.fallbackTimerId);
      ref.fallbackTimerId = null;
    }
  }
  function enqueueLoad(ref) {
    if (!ref) return;
    if (state.loadingRefs.has(ref)) return;
    if (state.loadQueue.indexOf(ref) >= 0) return;
    state.loadQueue.push(ref);
    setSiteStatus(ref.site.id, "等待加载中…");
    updateLoadingOverlay(ref, "等待加载中…");
    pumpLoadQueue();
  }
  function pumpLoadQueue() {
    const max = Math.max(1, BASE_CONFIG.iframeMaxConcurrent | 0 || 3);
    const staggerMs = BASE_CONFIG.iframeStaggerMs != null ? BASE_CONFIG.iframeStaggerMs : 120;
    let batchDelay = 0;
    while (state.loadingRefs.size < max && state.loadQueue.length > 0) {
      const next = state.loadQueue.shift();
      if (!next || !next.iframeEl || !state.cardRefs.has(next.site.id)) {
        continue;
      }
      state.loadingRefs.add(next);
      if (batchDelay === 0) {
        beginIframeLoad(next);
      } else {
        const target = next;
        window.setTimeout(() => {
          if (state.loadingRefs.has(target) && target.iframeEl) {
            beginIframeLoad(target);
          }
        }, batchDelay);
      }
      batchDelay += staggerMs;
    }
  }
  function releaseLoadSlot(ref) {
    if (!ref) return;
    if (state.loadingRefs.has(ref)) {
      state.loadingRefs.delete(ref);
    }
    pumpLoadQueue();
  }
  function removeFromLoadQueue(ref) {
    const idx = state.loadQueue.indexOf(ref);
    if (idx >= 0) {
      state.loadQueue.splice(idx, 1);
    }
  }
  function beginIframeLoad(ref) {
    const iframe = ref?.iframeEl;
    const targetSrc = ref?._targetSrc;
    if (!iframe || !targetSrc) return;
    iframe.src = targetSrc;
    setSiteStatus(ref.site.id, "正在加载…");
    updateLoadingOverlay(ref, "正在加载…");
    const timeoutMs = BASE_CONFIG.embedTimeoutMs || 18e3;
    ref.fallbackTimerId = window.setTimeout(() => {
      ref.fallbackTimerId = null;
      if (!ref._loadState?.resolved && ref.iframeEl === iframe) {
        releaseLoadSlot(ref);
        renderFallback(ref, "站点未能在限定时间内完成 iframe 加载。可能仍被目标站点限制嵌入。");
      }
    }, timeoutMs);
  }

  // src/iframe/iframe/export.js
  var EXTRACT_TIMEOUT_MS = 2500;
  function showExportModal() {
    const existing = document.getElementById("exportModal");
    if (existing) {
      existing.remove();
      return;
    }
    const aiSiteIds = new Set(
      SITE_CATEGORIES.find((c) => c.id === "ai")?.builtinIds || []
    );
    const exportableRefs = Array.from(state.cardRefs.values()).filter(
      (ref) => aiSiteIds.has(ref?.site?.id)
    );
    const selectedSiteIds = new Set(exportableRefs.map((ref) => ref.site.id));
    let selectedFormat = "markdown";
    const modal = document.createElement("div");
    modal.id = "exportModal";
    modal.className = "export-modal";
    modal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-header">
        <h3 class="export-modal-title">导出对话结果</h3>
        <button class="export-close-btn" type="button" aria-label="关闭"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="export-notice">将读取各卡片当前已加载的 AI 回答内容，结果取决于页面加载状态。<br>此功能还处于测试阶段，可能存在内容提取不完整或格式异常等问题。<br>仅支持 AI 模型对话导出。</div>
      <div class="export-modal-body">
        <div class="export-section">
          <div class="export-section-title">导出格式</div>
          <div class="export-option-row">
            <button class="export-option-btn is-active" data-export-format="markdown">Markdown</button>
            <button class="export-option-btn" data-export-format="txt">TXT</button>
          </div>
        </div>
        <div class="export-section">
          <div class="export-section-title">选择导出</div>
          <div class="export-site-list"></div>
        </div>
      </div>
      <div class="export-actions">
        <button class="export-cancel-btn" type="button">取消</button>
        <button class="export-confirm-btn" type="button">导出</button>
      </div>
    </div>
  `;
    document.body.appendChild(modal);
    const siteList = modal.querySelector(".export-site-list");
    let isExporting = false;
    if (exportableRefs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "export-site-empty";
      empty.textContent = "当前页面没有可导出的 AI 模型卡片。";
      siteList.appendChild(empty);
    } else {
      exportableRefs.forEach((ref) => {
        const row = document.createElement("label");
        row.className = "export-site-item";
        row.innerHTML = `
        <input type="checkbox" checked data-site-id="${escapeHtml(ref.site.id)}" />
        <span>${escapeHtml(ref.site.name)}</span>
      `;
        const checkbox = row.querySelector("input");
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selectedSiteIds.add(ref.site.id);
          } else {
            selectedSiteIds.delete(ref.site.id);
          }
        });
        siteList.appendChild(row);
      });
    }
    modal.querySelectorAll("[data-export-format]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedFormat = button.dataset.exportFormat;
        modal.querySelectorAll("[data-export-format]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
      });
    });
    const closeModal = (force = false) => {
      if (isExporting && !force) {
        return;
      }
      modal.remove();
    };
    modal.querySelector(".export-close-btn").addEventListener("click", closeModal);
    modal.querySelector(".export-cancel-btn").addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
    const confirmBtn = modal.querySelector(".export-confirm-btn");
    const cancelBtn = modal.querySelector(".export-cancel-btn");
    const noticeEl = modal.querySelector(".export-notice");
    confirmBtn.addEventListener("click", async () => {
      if (isExporting) {
        return;
      }
      if (selectedSiteIds.size === 0) {
        noticeEl.textContent = "请至少选择一个要导出的 AI 模型。";
        return;
      }
      isExporting = true;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      confirmBtn.textContent = "正在导出...";
      noticeEl.textContent = `正在读取 ${selectedSiteIds.size} 个卡片内容，请稍候...`;
      try {
        const responses = await collectVisibleResponses(selectedSiteIds);
        const content = generateExportContent(responses, selectedFormat, selectedSiteIds);
        const extension = selectedFormat === "markdown" ? "md" : selectedFormat;
        const mimeType = selectedFormat === "html" ? "text/html" : "text/plain";
        downloadFile(content, buildExportFilename(extension), mimeType);
        closeModal(true);
      } catch (error) {
        isExporting = false;
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        confirmBtn.textContent = "导出";
        noticeEl.textContent = `导出失败：${error.message || "未知错误"}`;
      }
    });
  }
  async function quickCaptureAllResponses() {
    const CAPTURE_TIMEOUT = 3e3;
    const promises = [];
    for (const [, ref] of state.cardRefs.entries()) {
      const p = Promise.race([
        collectResponseForSite(ref),
        new Promise(
          (resolve) => setTimeout(
            () => resolve({
              siteName: ref.site.name,
              content: "暂未提取到内容",
              turns: null,
              url: ref.currentUrl || ref.site.url
            }),
            CAPTURE_TIMEOUT
          )
        )
      ]);
      promises.push(p);
    }
    return Promise.all(promises);
  }
  async function collectVisibleResponses(selectedSiteIds = null) {
    const refs = Array.from(state.cardRefs.entries()).filter(([siteId]) => !selectedSiteIds || selectedSiteIds.has(siteId)).map(([, ref]) => ref);
    return Promise.all(refs.map((ref) => collectResponseForSite(ref)));
  }
  async function collectResponseForSite(ref) {
    if (!ref.iframeEl) {
      return {
        siteName: ref.site.name,
        content: "暂未提取到内容",
        turns: null,
        url: ref.currentUrl || ref.site.url
      };
    }
    const response = await requestIframeContent(ref.iframeEl, ref.site);
    if (response.content && response.content !== "暂未提取到内容") {
      return response;
    }
    return {
      ...response,
      content: extractFallbackContent(ref)
    };
  }
  function extractFallbackContent(ref) {
    if (!ref || !ref.bodyEl) {
      return "暂未提取到内容";
    }
    const fallbackPanel = ref.bodyEl.querySelector(".fallback-panel");
    if (fallbackPanel) {
      return String(fallbackPanel.textContent || "暂未提取到内容").trim() || "暂未提取到内容";
    }
    return ref.statusEl?.textContent?.trim() || "暂未提取到内容";
  }
  function requestIframeContent(iframe, site) {
    return new Promise((resolve) => {
      const requestId = createRequestId();
      let completed = false;
      let timeoutId = null;
      const expectedWindow = iframe.contentWindow;
      const finish = (result) => {
        if (completed) {
          return;
        }
        completed = true;
        window.removeEventListener("message", handler);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        resolve(result);
      };
      const handler = (event) => {
        if (event.source !== expectedWindow) return;
        if (!event.data || event.data.type !== "QSHOT_EXTRACT_RESULT" || event.data.requestId !== requestId) {
          return;
        }
        finish({
          siteName: site.name,
          content: cleanExtractedContent(event.data.content || ""),
          turns: Array.isArray(event.data.turns) ? event.data.turns : null,
          url: event.data.url || site.url
        });
      };
      window.addEventListener("message", handler);
      try {
        const targetOrigin = "*";
        iframe.contentWindow.postMessage({
          type: "QSHOT_EXTRACT",
          requestId,
          site
        }, targetOrigin);
      } catch (_error) {
        finish({
          siteName: site.name,
          content: "暂未提取到内容",
          turns: null,
          url: site.url
        });
        return;
      }
      timeoutId = window.setTimeout(() => {
        finish({
          siteName: site.name,
          content: "暂未提取到内容",
          turns: null,
          url: site.url
        });
      }, EXTRACT_TIMEOUT_MS);
    });
  }
  function cleanExtractedContent(content) {
    const text = String(content || "").trim();
    if (!text) {
      return "暂未提取到内容";
    }
    const junkPattern = /window\.__|\brequestAnimationFrame\b|function\s*\(|'use strict'|"use strict"|theme-host|__webpack|__NEXT_DATA__|gtag\(|ga\(/i;
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => !junkPattern.test(line)).filter((line, index, arr) => !(line === "" && arr[index - 1] === ""));
    const result = lines.join("\n").trim();
    return result || text.slice(0, 6e3) || "暂未提取到内容";
  }
  function flattenExportBodyMarkdown(raw) {
    const text = String(raw || "").trim();
    if (!text || text === "暂未提取到内容") {
      return text || "暂未提取到内容";
    }
    const lines = text.split(/\r?\n/);
    const out = [];
    let inCodeFence = false;
    for (const line of lines) {
      const trimmedEnd = line.trimEnd();
      const trimmed = trimmedEnd.trim();
      if (trimmed.startsWith("```")) {
        inCodeFence = !inCodeFence;
        out.push(trimmedEnd);
        continue;
      }
      if (inCodeFence) {
        out.push(trimmedEnd);
        continue;
      }
      const headingMatch = trimmedEnd.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const title = headingMatch[2].trim();
        out.push(`**${title}**`);
        out.push("");
      } else {
        out.push(trimmedEnd);
      }
    }
    let result = out.join("\n");
    result = result.replace(/\n{3,}/g, "\n\n").trim();
    return result || "暂未提取到内容";
  }
  function buildSiteNameFilter(selectedSiteIds) {
    if (!selectedSiteIds) {
      return null;
    }
    const names = /* @__PURE__ */ new Set();
    for (const [id, ref] of state.cardRefs.entries()) {
      if (selectedSiteIds.has(id)) {
        names.add(ref.site.name);
      }
    }
    return names;
  }
  function renderSectionsToFormat(sections, format) {
    const valid = sections.filter((s) => (s.items || []).length > 0);
    if (valid.length === 0) return "";
    if (format === "markdown") {
      return valid.map((section) => {
        const queryLine = String(section.query || "").replace(/\r?\n/g, " ").trim();
        const timeLine = section.time ? `导出时间：${section.time}` : "";
        const modelBlocks = section.items.map((item) => {
          const body = flattenExportBodyMarkdown(item.content || "暂未提取到内容");
          return `## ${item.siteName}

**URL：**${item.url}

${body}`;
        }).join("\n\n");
        return [`# ${queryLine}`, timeLine, modelBlocks].filter(Boolean).join("\n\n");
      }).join("\n\n---\n\n");
    }
    if (format === "html") {
      const querySections = valid.map((section) => {
        const modelBlocks = section.items.map(
          (item) => `<section class="model-section"><h2>${escapeHtml(item.siteName)}</h2><p><strong>URL：</strong> <a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a></p><pre>${escapeHtml(flattenExportBodyMarkdown(item.content || "暂未提取到内容"))}</pre></section>`
        ).join("");
        const timeHtml = section.time ? `<p class="export-time">${escapeHtml(`导出时间：${section.time}`)}</p>` : "";
        return `<section class="query-section"><h1>${escapeHtml(section.query)}</h1>${timeHtml}${modelBlocks}</section>`;
      }).join("<hr>");
      return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 对比结果</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.7}.query-section{margin-bottom:40px}.model-section{margin-bottom:28px}pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f7;padding:16px;border-radius:12px}a{color:#2563eb}</style></head><body>${querySections}</body></html>`;
    }
    return valid.map((section) => {
      const timeStr = section.time ? `导出时间：${section.time}` : "";
      const modelBlocks = section.items.map((item) => {
        const body = flattenExportBodyMarkdown(item.content || "暂未提取到内容");
        return `${item.siteName}
URL: ${item.url}

${body}`;
      }).join("\n\n" + "-".repeat(32) + "\n\n");
      return [section.query, timeStr, modelBlocks].filter(Boolean).join("\n\n");
    }).join("\n\n" + "=".repeat(40) + "\n\n");
  }
  function generateExportContent(responses, format, selectedSiteIds = null) {
    const currentQuery = state.lastSearchQuery || state.searchHistory[0]?.query || "未填写问题";
    const currentTime = state.lastSearchTime || (/* @__PURE__ */ new Date()).toLocaleString();
    const allowedNames = buildSiteNameFilter(selectedSiteIds);
    const filterItems = (items) => allowedNames ? items.filter((r) => allowedNames.has(r.siteName)) : items;
    const allSections = [
      ...state.sessionSnapshots.map((s) => ({
        query: s.query,
        time: s.time,
        items: filterItems(s.responses)
      })),
      { query: currentQuery, time: currentTime, items: filterItems(responses) }
    ];
    return renderSectionsToFormat(allSections, format);
  }
  function buildExportFilename(extension) {
    const query = state.lastSearchQuery || state.searchHistory[0]?.query || "";
    const now = /* @__PURE__ */ new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    if (!query) {
      return `AI导出_${date}.${extension}`;
    }
    const keyword = query.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ").slice(0, 16).trim().replace(/\s/g, "-");
    return `${keyword}_${date}.${extension}`;
  }
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  // src/iframe/iframe/send.js
  async function handleSendSelected(options = {}) {
    if (state.isSending) {
      diagnosticLog("compare.send", "ignored-while-sending");
      return;
    }
    const { clearInputAfterSend = true } = options;
    const query = getQuery();
    if (!query) {
      diagnosticLog("compare.send", "empty-query");
      setGlobalStatus("请输入问题后再发送。", true);
      return;
    }
    const selectedSites = getSelectedSites();
    if (selectedSites.length === 0) {
      diagnosticLog("compare.send", "no-selected-sites");
      setGlobalStatus("没有可发送的站点。", true);
      return;
    }
    state.isSending = true;
    diagnosticLog("compare.send", "start", {
      selectedCount: selectedSites.length,
      siteIds: selectedSites.map((site) => site.id),
      query
    });
    try {
      lockContainerScroll();
      toggleGlobalButtons(true);
      setGlobalStatus(`正在向 ${selectedSites.length} 个站点分发问题...`);
      if (state.lastSearchQuery) {
        capturePreviousSessionSnapshot(state.lastSearchQuery, state.lastSearchTime, state.sessionVersion);
      }
      state.lastSearchQuery = query;
      state.lastSearchTime = (/* @__PURE__ */ new Date()).toLocaleString();
      activateScrollGuard(
        elements.iframesContainer.scrollLeft,
        elements.iframesContainer.scrollTop,
        getScrollGuardDurationMs(selectedSites.length)
      );
      if (clearInputAfterSend) {
        elements.queryInput.value = "";
        updateSendBtnState();
      }
      const historyEntryPromise = saveSearchHistory(query, selectedSites).catch(() => null);
      const results = await sendSitesWithConcurrency(selectedSites, query);
      const successCount = results.filter((item) => item && item.ok).length;
      const failedCount = results.length - successCount;
      diagnosticLog("compare.send", "complete", { successCount, failedCount, results });
      const historyEntryId = await historyEntryPromise;
      await refreshHistoryEntryUrls(historyEntryId, selectedSites);
      setGlobalStatus(`发送完成：成功 ${successCount} 个，失败 ${failedCount} 个。`, failedCount > 0);
      scheduleScrollUnlock();
    } finally {
      state.isSending = false;
      diagnosticLog("compare.send", "unlock");
      toggleGlobalButtons(false);
    }
  }
  async function sendSitesWithConcurrency(sites, query) {
    const results = new Array(sites.length);
    const configuredConcurrency = Number.isFinite(BASE_CONFIG.sendConcurrency) ? BASE_CONFIG.sendConcurrency : 2;
    const concurrency = Math.max(1, Math.min(sites.length, configuredConcurrency));
    let nextIndex = 0;
    async function worker(workerId) {
      while (nextIndex < sites.length) {
        const index = nextIndex;
        nextIndex += 1;
        const site = sites[index];
        diagnosticLog("compare.send", "pooled-dispatch", {
          siteId: site.id,
          index: index + 1,
          total: sites.length,
          workerId,
          concurrency
        });
        setSiteStatus(site.id, `正在发送（${index + 1}/${sites.length}）...`);
        try {
          results[index] = await sendSmartToSite(site, query, 0);
        } catch (error) {
          diagnosticLog("compare.send", "pooled-dispatch-error", {
            siteId: site.id,
            workerId,
            error: error.message
          });
          results[index] = {
            ok: false,
            siteId: site.id,
            error: error.message || "发送失败"
          };
        }
      }
    }
    await Promise.all(
      Array.from({ length: concurrency }, (_item, index) => worker(index + 1))
    );
    return results;
  }
  function capturePreviousSessionSnapshot(query, time, sessionVersion) {
    quickCaptureAllResponses().then((prevResponses) => {
      if (state.sessionVersion !== sessionVersion) {
        return;
      }
      state.sessionSnapshots.push({
        query,
        time,
        responses: prevResponses
      });
      if (state.sessionSnapshots.length > SESSION_SNAPSHOTS_MAX) {
        state.sessionSnapshots = state.sessionSnapshots.slice(-SESSION_SNAPSHOTS_MAX);
      }
    }).catch(() => {
    });
  }
  async function maybeAutoSendFromUrl() {
    if (!state.shouldAutoSend) {
      return;
    }
    const query = getQuery();
    if (!query) {
      state.shouldAutoSend = false;
      return;
    }
    state.shouldAutoSend = false;
    clearAutoSendFlagFromUrl();
    await handleSendSelected({ clearInputAfterSend: true });
  }
  async function sendSmartToSite(site, query, dispatchDelayMs = 0) {
    if (site.supportIframe === false) {
      diagnosticLog("compare.site", "external-tab-route", { site });
      return openExternalSiteForQuery(site, query);
    }
    const ref = state.cardRefs.get(site.id);
    if (!ref || !ref.iframeEl) {
      diagnosticLog("compare.site", "missing-iframe", { site });
      return {
        ok: false,
        siteId: site.id,
        error: "卡片 iframe 不可用"
      };
    }
    if (site.supportUrlQuery && String(site.url || "").includes("{query}")) {
      diagnosticLog("compare.site", "url-template-route", { site });
      return navigateByUrlTemplate(ref, query);
    }
    if (!ref.loaded) {
      diagnosticLog("compare.site", "wait-for-iframe-load", { site });
      return new Promise((resolve) => {
        ref.pendingQuery = query;
        ref.pendingQueryDelayMs = dispatchDelayMs;
        ref.pendingQueryResolver = resolve;
        setSiteStatus(site.id, "卡片加载中，完成后将自动发送...");
      });
    }
    ref.pendingQuery = "";
    ref.pendingQueryDelayMs = 0;
    ref.pendingQueryResolver = null;
    diagnosticLog("compare.site", "dispatch-route", { site });
    return dispatchSearchWithRetries(ref, query, dispatchDelayMs);
  }
  async function openExternalSiteForQuery(site, query) {
    const targetUrl = buildSiteUrl(site, query);
    if (!targetUrl) {
      return {
        ok: false,
        siteId: site.id,
        error: "站点 URL 配置无效"
      };
    }
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_SITE_TAB_AND_SEND",
      site,
      query
    });
    if (!response?.ok) {
      return {
        ok: false,
        siteId: site.id,
        error: response?.error || "新标签页打开失败"
      };
    }
    return {
      ok: true,
      siteId: site.id,
      message: "已在新标签页打开"
    };
  }
  function navigateByUrlTemplate(ref, query) {
    const targetUrl = buildSiteUrl(ref.site, query);
    if (!targetUrl) {
      return Promise.resolve({
        ok: false,
        siteId: ref.site.id,
        error: "站点 URL 配置无效"
      });
    }
    const iframe = ref.iframeEl;
    if (!iframe) {
      return Promise.resolve({
        ok: false,
        siteId: ref.site.id,
        error: "卡片 iframe 不可用"
      });
    }
    ref._targetSrc = targetUrl;
    setSiteStatus(ref.site.id, "正在通过 URL 直达搜索结果页...");
    diagnosticLog("compare.url", "navigate-start", { site: ref.site, targetUrl });
    return new Promise((resolve) => {
      const timeoutMs = 12e3;
      let done = false;
      const cleanup = () => {
        iframe.removeEventListener("load", handleLoad, true);
        iframe.removeEventListener("error", handleError, true);
      };
      const finish = (result) => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        diagnosticLog("compare.url", "navigate-finish", { site: ref.site, result });
        resolve(result);
      };
      const handleLoad = () => {
        ref.loaded = true;
        ref.currentUrl = iframe.src || targetUrl;
        finish({
          ok: true,
          siteId: ref.site.id,
          message: "已通过 URL 跳转到搜索结果页"
        });
      };
      const handleError = () => {
        finish({
          ok: false,
          siteId: ref.site.id,
          error: "URL 跳转失败，页面未响应"
        });
      };
      iframe.addEventListener("load", handleLoad, true);
      iframe.addEventListener("error", handleError, true);
      window.setTimeout(() => {
        finish({
          ok: false,
          siteId: ref.site.id,
          error: "URL 跳转超时，未进入目标结果页"
        });
      }, timeoutMs);
      iframe.src = targetUrl;
    });
  }
  function dispatchSearchWithRetries(ref, query, initialDelayMs) {
    const requestId = createRequestId();
    diagnosticLog("compare.dispatch", "created", { site: ref.site, requestId, query });
    return new Promise((resolve) => {
      const pendingDispatch = {
        requestId,
        ref,
        query,
        resolve,
        attempts: 0,
        maxAttempts: 3,
        retryDelayMs: BASE_CONFIG.tabSendRetryDelayMs || 1800,
        timerId: null,
        completed: false
      };
      state.pendingDispatches.set(requestId, pendingDispatch);
      scheduleDispatchAttempt(pendingDispatch, initialDelayMs);
    });
  }
  function scheduleDispatchAttempt(pendingDispatch, delayMs) {
    pendingDispatch.timerId = window.setTimeout(() => {
      if (pendingDispatch.completed) {
        return;
      }
      restoreLockedScrollPosition();
      pendingDispatch.attempts += 1;
      if (!pendingDispatch.ref.iframeEl?.contentWindow) {
        diagnosticLog("compare.dispatch", "missing-content-window", {
          site: pendingDispatch.ref.site,
          requestId: pendingDispatch.requestId,
          attempt: pendingDispatch.attempts
        });
        if (pendingDispatch.attempts < pendingDispatch.maxAttempts) {
          scheduleDispatchAttempt(pendingDispatch, pendingDispatch.retryDelayMs);
        } else {
          finalizePendingDispatch(pendingDispatch.requestId, {
            ok: false,
            siteId: pendingDispatch.ref.site.id,
            error: "卡片 iframe 不可用"
          });
        }
        return;
      }
      try {
        const targetOrigin = "*";
        diagnosticLog("compare.dispatch", "post-message", {
          site: pendingDispatch.ref.site,
          requestId: pendingDispatch.requestId,
          attempt: pendingDispatch.attempts
        });
        pendingDispatch.ref.iframeEl.contentWindow.postMessage(
          {
            type: "QSHOT_SEARCH",
            query: pendingDispatch.query,
            site: pendingDispatch.ref.site,
            requestId: pendingDispatch.requestId
          },
          targetOrigin
        );
        setSiteStatus(pendingDispatch.ref.site.id, "查询已发送到卡片 iframe，等待页面响应...");
        restoreLockedScrollPosition();
      } catch (error) {
        diagnosticLog("compare.dispatch", "post-message-error", {
          site: pendingDispatch.ref.site,
          requestId: pendingDispatch.requestId,
          attempt: pendingDispatch.attempts,
          error: error.message
        });
        if (pendingDispatch.attempts < pendingDispatch.maxAttempts) {
          scheduleDispatchAttempt(pendingDispatch, pendingDispatch.retryDelayMs);
        } else {
          finalizePendingDispatch(pendingDispatch.requestId, {
            ok: false,
            siteId: pendingDispatch.ref.site.id,
            error: error.message
          });
        }
        return;
      }
      scheduleDispatchAttemptFailure(pendingDispatch);
    }, delayMs);
  }
  function scheduleDispatchAttemptFailure(pendingDispatch) {
    pendingDispatch.timerId = window.setTimeout(() => {
      if (pendingDispatch.completed) {
        return;
      }
      if (pendingDispatch.attempts < pendingDispatch.maxAttempts) {
        diagnosticLog("compare.dispatch", "retry", {
          site: pendingDispatch.ref.site,
          requestId: pendingDispatch.requestId,
          nextAttempt: pendingDispatch.attempts + 1
        });
        setSiteStatus(
          pendingDispatch.ref.site.id,
          `自动发送暂未响应，正在重试 ${pendingDispatch.attempts + 1}/${pendingDispatch.maxAttempts}...`
        );
        scheduleDispatchAttempt(pendingDispatch, 0);
        return;
      }
      diagnosticLog("compare.dispatch", "timeout", {
        site: pendingDispatch.ref.site,
        requestId: pendingDispatch.requestId,
        attempts: pendingDispatch.attempts
      });
      finalizePendingDispatch(pendingDispatch.requestId, {
        ok: false,
        siteId: pendingDispatch.ref.site.id,
        error: "自动发送超时，未收到卡片页面响应"
      });
    }, pendingDispatch.retryDelayMs);
  }
  function resolvePendingDispatch(requestId, payload) {
    const pendingDispatch = state.pendingDispatches.get(requestId);
    if (!pendingDispatch || pendingDispatch.completed) {
      diagnosticLog("compare.dispatch", "resolve-miss", { requestId, payload });
      return;
    }
    diagnosticLog("compare.dispatch", "resolve", {
      site: pendingDispatch.ref.site,
      requestId,
      payload
    });
    finalizePendingDispatch(requestId, payload);
  }
  function finalizePendingDispatch(requestId, result) {
    const pendingDispatch = state.pendingDispatches.get(requestId);
    if (!pendingDispatch || pendingDispatch.completed) {
      return;
    }
    pendingDispatch.completed = true;
    if (pendingDispatch.timerId) {
      window.clearTimeout(pendingDispatch.timerId);
    }
    state.pendingDispatches.delete(requestId);
    restoreLockedScrollPosition();
    diagnosticLog("compare.dispatch", "finalize", {
      site: pendingDispatch.ref.site,
      requestId,
      result
    });
    pendingDispatch.resolve(result);
  }
  function abortPendingWorkForSite(siteId) {
    diagnosticLog("compare.dispatch", "abort-site", { siteId });
    const toCancel = [];
    state.pendingDispatches.forEach((pending, requestId) => {
      if (pending?.ref?.site?.id === siteId) {
        toCancel.push(requestId);
      }
    });
    toCancel.forEach((requestId) => {
      finalizePendingDispatch(requestId, {
        ok: false,
        siteId,
        error: "卡片已关闭"
      });
    });
    const ref = state.cardRefs.get(siteId);
    if (ref?.pendingQueryResolver) {
      const resolver = ref.pendingQueryResolver;
      ref.pendingQueryResolver = null;
      ref.pendingQuery = "";
      ref.pendingQueryDelayMs = 0;
      try {
        resolver({ ok: false, siteId, error: "卡片已关闭" });
      } catch (_e) {
      }
    }
    clearIframeTimers(ref);
    if (ref) {
      removeFromLoadQueue(ref);
      if (state.loadingRefs.has(ref)) {
        state.loadingRefs.delete(ref);
        pumpLoadQueue();
      }
    }
  }

  // src/iframe/iframe/status.js
  function handleFrameMessage(event) {
    const payload = event.data;
    if (!payload || !payload.type || !payload.siteId) {
      return;
    }
    const ref = findCardRefByMessageSource(event.source);
    if (!ref || ref.site.id !== payload.siteId) {
      diagnosticLog("compare.message", "source-mismatch", {
        payloadType: payload.type,
        siteId: payload.siteId,
        matchedSiteId: ref?.site?.id
      });
      return;
    }
    if (payload.type === "QSHOT_URL_UPDATE") {
      diagnosticLog("compare.message", "url-update", { siteId: payload.siteId, currentUrl: payload.currentUrl });
      ref.injectedPinged = true;
      if (payload.currentUrl) {
        ref.currentUrl = payload.currentUrl;
        updateLatestHistoryUrl(payload.siteId, payload.currentUrl);
      }
      return;
    }
    if (payload.type !== "QSHOT_RESULT") {
      diagnosticLog("compare.message", "unknown-type", { payloadType: payload.type, siteId: payload.siteId });
      return;
    }
    diagnosticLog("compare.message", "result", {
      siteId: payload.siteId,
      requestId: payload.requestId,
      ok: payload.ok,
      error: payload.error
    });
    if (payload.currentUrl) {
      ref.currentUrl = payload.currentUrl;
      updateLatestHistoryUrl(payload.siteId, payload.currentUrl);
    }
    if (payload.requestId) {
      resolvePendingDispatch(payload.requestId, payload);
    }
    if (payload.ok) {
      setSiteStatus(payload.siteId, payload.message || "iframe 页面已处理查询。", "success");
    } else {
      setSiteStatus(payload.siteId, payload.error || "iframe 页面处理失败。", "error");
    }
  }
  function findCardRefByMessageSource(source) {
    if (!source) return null;
    for (const ref of state.cardRefs.values()) {
      const win = ref.iframeEl && ref.iframeEl.contentWindow;
      if (win && win === source) {
        return ref;
      }
    }
    return null;
  }
  function setSiteStatus(siteId, message, kind = "info") {
    const ref = state.cardRefs.get(siteId);
    if (!ref) {
      return;
    }
    ref.statusEl.textContent = message;
    ref.statusEl.classList.toggle("success-text", kind === "success");
  }
  function setGlobalStatus(message, isError = false) {
    elements.globalStatus.textContent = message;
    elements.globalStatus.classList.toggle("success-text", !isError);
  }
  function toggleGlobalButtons(isBusy) {
    elements.sendSelectedBtn.disabled = isBusy;
    if (elements.promptAssistBtn) {
      elements.promptAssistBtn.disabled = isBusy;
    }
  }
  function updateSendBtnState() {
    const hasContent = elements.queryInput.value.trim().length > 0;
    elements.sendSelectedBtn.classList.toggle("is-empty", !hasContent);
  }

  // src/shared/site-registry.js
  var SITE_HANDLERS_PATH = "config/siteHandlers.json";
  var builtinSites = null;
  var builtinSitesPromise = null;
  var domainIndex = null;
  async function loadBuiltinSites(options = {}) {
    const { fallbackEmpty = false } = options;
    if (builtinSites) return builtinSites;
    if (builtinSitesPromise) return builtinSitesPromise;
    builtinSitesPromise = fetch(chrome.runtime.getURL(SITE_HANDLERS_PATH)).then((response) => {
      if (!response.ok) throw new Error("无法读取站点配置");
      return response.json();
    }).then((payload) => {
      builtinSites = Array.isArray(payload.sites) ? payload.sites : [];
      domainIndex = buildDomainIndex(builtinSites);
      return builtinSites;
    }).catch((error) => {
      if (!fallbackEmpty) throw error;
      builtinSites = [];
      domainIndex = /* @__PURE__ */ new Map();
      return builtinSites;
    }).finally(() => {
      builtinSitesPromise = null;
    });
    return builtinSitesPromise;
  }
  function normalizeHost(value) {
    return String(value || "").trim().toLowerCase().replace(/^\*:\/\//, "").replace(/^https?:\/\//, "").replace(/^\*\./, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  }
  function buildDomainIndex(sites) {
    const index = /* @__PURE__ */ new Map();
    (sites || []).forEach((site) => {
      const patterns = Array.isArray(site.matchPatterns) ? site.matchPatterns : [];
      patterns.forEach((pattern) => {
        const host = normalizeHost(pattern);
        if (!host) return;
        const list = index.get(host) || [];
        list.push(site);
        index.set(host, list);
      });
    });
    return index;
  }

  // src/iframe/iframe/sites-loader.js
  async function loadSites() {
    const builtinSites2 = (await loadBuiltinSites()).filter((site) => site.enabled !== false);
    const customSites = await loadCustomSitesFromStorage();
    const mergedSites = mergeSiteLists(builtinSites2, customSites);
    state.allSites = mergedSites;
    if (Array.isArray(state.requestedSiteIds) && state.requestedSiteIds.length > 0) {
      const siteById = new Map(mergedSites.map((site) => [site.id, site]));
      state.sites = state.requestedSiteIds.map((siteId) => siteById.get(siteId)).filter(Boolean);
    } else {
      state.sites = mergedSites;
    }
    state.hiddenSiteIds.clear();
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
  function mergeSiteLists(builtin, custom) {
    const result = Array.isArray(builtin) ? [...builtin] : [];
    const seen = new Set(result.map((site) => site.id));
    (custom || []).forEach((site) => {
      if (!site || seen.has(site.id)) return;
      result.push(site);
      seen.add(site.id);
    });
    return result;
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

  // src/iframe/iframe/prompts.js
  function bindPromptPickerEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !state.isPromptPickerOpen) {
        return;
      }
      if (target.closest("#promptAssistBtn") || target.closest("#promptPicker")) {
        return;
      }
      closePromptPicker();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.isPromptPickerOpen) {
        closePromptPicker();
        elements.queryInput?.focus();
      }
    });
  }
  function togglePromptPicker() {
    state.isPromptPickerOpen = !state.isPromptPickerOpen;
    renderPromptPicker();
  }
  function closePromptPicker() {
    if (!state.isPromptPickerOpen) {
      return;
    }
    state.isPromptPickerOpen = false;
    if (promptPreview.mgr) promptPreview.mgr.hide();
    renderPromptPicker();
  }
  function openPromptEditModal(prompt, groupId) {
    closePromptPicker();
    let targetGroup = state.promptGroups.find((g) => g.id === groupId) || state.promptGroups[0];
    let targetPrompt = targetGroup?.prompts.find((p) => p.id === prompt.id);
    if (!targetPrompt) return;
    const overlay = document.createElement("div");
    overlay.className = "prompt-edit-modal-overlay";
    const modal = document.createElement("div");
    modal.className = "prompt-edit-modal";
    modal.innerHTML = `
    <div class="prompt-edit-modal-title">编辑提示词</div>
    <div>
      <label class="prompt-edit-field-label">名称</label>
      <input class="prompt-edit-input" type="text" value="${escapeHtml(targetPrompt.title || "")}" />
    </div>
    <div>
      <label class="prompt-edit-field-label">分类</label>
      <select class="prompt-edit-select">
        ${state.promptGroups.map((g) => `<option value="${escapeHtml(g.id)}"${g.id === groupId ? " selected" : ""}>${escapeHtml(getPromptGroupDisplayName(g))}</option>`).join("")}
        <option value="__new__">＋ 新建分组…</option>
      </select>
      <input class="prompt-edit-input prompt-edit-new-group-input" type="text" placeholder="输入新分组名称" style="display:none;margin-top:8px;" />
    </div>
    <div>
      <label class="prompt-edit-field-label">提示词内容</label>
      <textarea class="prompt-edit-textarea">${escapeHtml(targetPrompt.content || "")}</textarea>
    </div>
    <div class="prompt-edit-actions">
      <button class="prompt-edit-delete-btn" type="button">删除</button>
      <div class="prompt-edit-main-btns">
        <button class="prompt-edit-cancel-btn" type="button">取消</button>
        <button class="prompt-edit-save-btn" type="button">保存</button>
      </div>
    </div>
  `;
    const titleInput = modal.querySelector(".prompt-edit-input");
    const groupSelect = modal.querySelector(".prompt-edit-select");
    const newGroupInput = modal.querySelector(".prompt-edit-new-group-input");
    const contentInput = modal.querySelector(".prompt-edit-textarea");
    const cancelBtn = modal.querySelector(".prompt-edit-cancel-btn");
    const saveBtn = modal.querySelector(".prompt-edit-save-btn");
    const deleteBtn = modal.querySelector(".prompt-edit-delete-btn");
    groupSelect?.addEventListener("change", () => {
      const isNew = groupSelect instanceof HTMLSelectElement && groupSelect.value === "__new__";
      if (newGroupInput instanceof HTMLInputElement) {
        newGroupInput.style.display = isNew ? "block" : "none";
        if (isNew) requestAnimationFrame(() => newGroupInput.focus());
      }
    });
    cancelBtn.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    saveBtn.addEventListener("click", async () => {
      const newTitle = (titleInput instanceof HTMLInputElement ? titleInput.value : "").trim() || "未命名提示词";
      const newContent = contentInput instanceof HTMLTextAreaElement ? contentInput.value : "";
      let newGroupId = groupSelect instanceof HTMLSelectElement ? groupSelect.value : groupId;
      if (newGroupId === "__new__") {
        const newName = (newGroupInput instanceof HTMLInputElement ? newGroupInput.value : "").trim() || "新建分组";
        const newGroup = { id: `prompt-group-${Date.now()}`, name: newName, prompts: [] };
        state.promptGroups.push(newGroup);
        newGroupId = newGroup.id;
      }
      state.promptGroups.forEach((g) => {
        g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id);
      });
      const destGroup = state.promptGroups.find((g) => g.id === newGroupId) || targetGroup;
      destGroup.prompts.push({ id: targetPrompt.id, title: newTitle, content: newContent });
      await chrome.storage.local.set({ [STORAGE_KEYS.promptGroups]: state.promptGroups });
      overlay.remove();
    });
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("确定要删除这条提示词吗？")) return;
      state.promptGroups.forEach((g) => {
        g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id);
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.promptGroups]: state.promptGroups });
      overlay.remove();
    });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    if (titleInput instanceof HTMLInputElement) {
      requestAnimationFrame(() => titleInput.focus());
    }
  }
  function renderPromptPicker() {
    if (!elements.promptPicker || !elements.promptAssistBtn) {
      return;
    }
    elements.promptAssistBtn.style.display = state.promptGroups.length > 0 ? "inline-flex" : "none";
    elements.promptPicker.innerHTML = "";
    elements.promptAssistBtn.setAttribute("aria-expanded", String(state.isPromptPickerOpen));
    if (!state.isPromptPickerOpen) {
      elements.promptPicker.hidden = true;
      return;
    }
    elements.promptPicker.hidden = false;
    if (!state.promptGroups.length) {
      const empty = document.createElement("div");
      empty.className = "popup-prompt-picker-empty";
      empty.textContent = "还没有提示词分组，请先去设置里添加。";
      elements.promptPicker.appendChild(empty);
      return;
    }
    const activeGroup = state.promptGroups.find((group) => group.id === state.activePromptGroupId) || state.promptGroups[0];
    if (!activeGroup) {
      return;
    }
    const groupsColumn = document.createElement("div");
    groupsColumn.className = "popup-prompt-groups";
    state.promptGroups.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.groupId = group.id;
      button.className = `popup-prompt-group-item${group.id === activeGroup.id ? " is-active" : ""}`;
      button.textContent = getPromptGroupDisplayName(group);
      button.addEventListener("mouseenter", () => {
        if (state.activePromptGroupId === group.id) {
          return;
        }
        state.activePromptGroupId = group.id;
        switchPromptGroup();
      });
      button.addEventListener("click", () => {
        if (state.activePromptGroupId === group.id) {
          return;
        }
        state.activePromptGroupId = group.id;
        switchPromptGroup();
      });
      groupsColumn.appendChild(button);
    });
    elements.promptPicker.appendChild(groupsColumn);
    elements.promptPicker.appendChild(buildPromptsColumn(activeGroup));
  }
  function buildPromptsColumn(activeGroup) {
    const promptsColumn = document.createElement("div");
    promptsColumn.className = "popup-prompt-list";
    const entries = getDisplayPromptEntries(activeGroup, state.promptGroups);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "popup-prompt-picker-empty";
      empty.textContent = isAllPromptGroup(activeGroup) ? "还没有提示词，请先去设置里添加。" : "这个分组里还没有提示词。";
      promptsColumn.appendChild(empty);
    } else {
      promptPreview.mgr = promptPreview.mgr || window.PromptItemUI.createPreviewManager(null);
      entries.forEach(({ prompt, sourceGroup }) => {
        const item = window.PromptItemUI.createItem(prompt, {
          onFill: (p) => {
            setQueryInputValue(p.content || "", { focus: true });
            closePromptPicker();
          },
          onEdit: (p) => openPromptEditModal(p, sourceGroup.id),
          previewManager: promptPreview.mgr
        });
        promptsColumn.appendChild(item);
      });
    }
    return promptsColumn;
  }
  function switchPromptGroup() {
    if (!elements.promptPicker || elements.promptPicker.hidden) return;
    elements.promptPicker.querySelectorAll(".popup-prompt-group-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.groupId === state.activePromptGroupId);
    });
    const activeGroup = state.promptGroups.find((g) => g.id === state.activePromptGroupId) || state.promptGroups[0];
    if (!activeGroup) return;
    const oldList = elements.promptPicker.querySelector(".popup-prompt-list");
    const newList = buildPromptsColumn(activeGroup);
    if (oldList) {
      oldList.replaceWith(newList);
    } else {
      elements.promptPicker.appendChild(newList);
    }
  }

  // src/iframe/iframe/add-site.js
  function toggleAddSitePicker() {
    if (state.isAddSitePickerOpen) {
      closeAddSitePicker();
      return;
    }
    state.isAddSitePickerOpen = true;
    elements.addSiteBtn?.setAttribute("aria-expanded", "true");
    if (elements.addSitePopover) {
      elements.addSitePopover.hidden = false;
    }
    renderAddSitePicker();
  }
  function closeAddSitePicker() {
    if (!state.isAddSitePickerOpen) {
      return;
    }
    state.isAddSitePickerOpen = false;
    elements.addSiteBtn?.setAttribute("aria-expanded", "false");
    if (elements.addSitePopover) {
      elements.addSitePopover.hidden = true;
    }
  }
  function getSitesForCategory(categoryId) {
    if (!Array.isArray(state.allSites) || state.allSites.length === 0) {
      return [];
    }
    if (categoryId === "custom") {
      return state.allSites.filter((s) => s && s.isCustom);
    }
    const category = SITE_CATEGORIES.find((c) => c.id === categoryId);
    const ids = new Set(category?.builtinIds || []);
    const byId = new Map(state.allSites.map((s) => [s.id, s]));
    return Array.from(ids).map((id) => byId.get(id)).filter(Boolean);
  }
  function renderAddSitePicker() {
    if (!elements.addSiteTabs || !elements.addSiteList) {
      return;
    }
    elements.addSiteTabs.innerHTML = "";
    SITE_CATEGORIES.forEach((category) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `add-site-tab${state.activeAddSiteCategory === category.id ? " is-active" : ""}`;
      tab.textContent = category.label;
      tab.addEventListener("click", (event) => {
        event.stopPropagation();
        state.activeAddSiteCategory = category.id;
        renderAddSitePicker();
      });
      elements.addSiteTabs.appendChild(tab);
    });
    elements.addSiteList.innerHTML = "";
    const sites = getSitesForCategory(state.activeAddSiteCategory);
    if (sites.length === 0) {
      const empty = document.createElement("div");
      empty.className = "add-site-empty";
      empty.textContent = state.activeAddSiteCategory === "custom" ? "还没有自定义站点，前往设置页添加。" : "暂无可添加的站点。";
      elements.addSiteList.appendChild(empty);
      return;
    }
    sites.forEach((site) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "add-site-chip";
      const isAlreadyActive = state.cardRefs.has(site.id);
      if (isAlreadyActive) {
        chip.classList.add("is-active");
        chip.title = "该卡片已在页面中";
      }
      chip.textContent = site.name || site.id;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.cardRefs.has(site.id)) {
          return;
        }
        addSiteCardToPage(site);
        renderAddSitePicker();
      });
      elements.addSiteList.appendChild(chip);
    });
  }
  function addSiteCardToPage(site) {
    if (!site || !site.id) {
      return;
    }
    state.hiddenSiteIds.delete(site.id);
    if (state.cardRefs.has(site.id)) {
      setGlobalStatus(`${site.name} 卡片已在页面中。`);
      return;
    }
    if (!state.sites.some((s) => s.id === site.id)) {
      state.sites = [...state.sites, site];
    }
    const emptyState = elements.iframesContainer.querySelector(".empty-state");
    if (emptyState) {
      emptyState.remove();
    }
    const card = createSiteCard(site);
    if (isWideMediaSite(site.id)) {
      card.classList.add("iframe-card-wide-media");
    }
    elements.iframesContainer.appendChild(card);
    if (state.layoutMode === "sidebar") {
      state.activeSidebarSiteId = site.id;
      state.cardRefs.forEach((ref, siteId) => {
        if (ref.cardEl) ref.cardEl.hidden = siteId !== state.activeSidebarSiteId;
      });
      renderSiteNav();
    }
    activateScrollGuard(
      elements.iframesContainer.scrollLeft,
      elements.iframesContainer.scrollTop,
      getScrollGuardDurationMs(1)
    );
    updateScrollEdgeBtns();
    renderCardNavStrip();
    setGlobalStatus(`已在当前页面临时添加 ${site.name} 卡片。`);
  }

  // src/iframe/iframe/main.js
  function initComparePage() {
    const { applyDomI18n } = window.__QSHOT_I18N__ || {};
    state._applyDomI18n = applyDomI18n;
    document.addEventListener("DOMContentLoaded", start);
    window.addEventListener("message", handleFrameMessage);
  }
  async function start() {
    try {
      state._applyDomI18n?.(document);
      cacheElements();
      bindEvents();
      bindFileUploadEvents();
      hydrateQueryFromUrl();
      updateSendBtnState();
      await restorePreferences();
      bindPromptPickerEvents();
      await loadSites();
      const restoredEntry = applyHistoryRestoreFromUrl();
      renderCards();
      setGlobalStatus(restoredEntry ? `已复原 "${restoredEntry.query || "历史记录"}" 的 ${getSelectedSites().length} 张卡片。` : `已加载 ${getSelectedSites().length} 个站点。`);
      await maybeAutoSendFromUrl();
    } catch (error) {
      setGlobalStatus(`初始化失败：${error.message}`, true);
    }
  }
  function cacheElements() {
    elements.queryInput = document.getElementById("queryInput");
    elements.sendSelectedBtn = document.getElementById("sendSelectedBtn");
    elements.promptAssistBtn = document.getElementById("promptAssistBtn");
    elements.promptPicker = document.getElementById("promptPicker");
    elements.globalStatus = document.getElementById("globalStatus");
    elements.iframesContainer = document.getElementById("iframes-container");
    elements.layoutToggleBtn = document.getElementById("layoutToggleBtn");
    elements.layoutPopover = document.getElementById("layoutPopover");
    elements.layoutRowsButtons = Array.from(document.querySelectorAll("[data-layout-rows]"));
    elements.cardSizeButtons = Array.from(document.querySelectorAll("[data-card-size]"));
    elements.cardSizeGroup = document.getElementById("cardSizeGroup");
    elements.exportBtn = document.getElementById("exportBtn");
    elements.historyToggleBtn = document.getElementById("historyToggleBtn");
    elements.historyPanel = document.getElementById("historyPanel");
    elements.historyList = document.getElementById("historyList");
    elements.closeHistoryPanelBtn = document.getElementById("closeHistoryPanelBtn");
    elements.clearHistoryBtn = document.getElementById("clearHistoryBtn");
    elements.siteNavPanel = document.getElementById("siteNavPanel");
    elements.siteNavList = document.getElementById("siteNavList");
    elements.sidebarLayoutBtn = document.querySelector("[data-layout-mode='sidebar']");
    elements.scrollToStartBtn = document.getElementById("scrollToStartBtn");
    elements.scrollToEndBtn = document.getElementById("scrollToEndBtn");
    elements.scrollToTopBtn = document.getElementById("scrollToTopBtn");
    elements.scrollToBottomBtn = document.getElementById("scrollToBottomBtn");
    elements.scrollVertGroup = document.getElementById("scrollVertGroup");
    elements.newChatBtn = document.getElementById("newChatBtn");
    elements.settingsBtn = document.getElementById("settingsBtn");
    elements.addSiteBtn = document.getElementById("addSiteBtn");
    elements.addSitePopover = document.getElementById("addSitePopover");
    elements.addSiteTabs = document.getElementById("addSiteTabs");
    elements.addSiteList = document.getElementById("addSiteList");
    elements.closeAddSitePopoverBtn = document.getElementById("closeAddSitePopoverBtn");
    elements.cardNavStrip = document.getElementById("cardNavStrip");
    elements.fileUploadBtn = document.getElementById("fileUploadBtn");
    elements.fileUploadInput = document.getElementById("fileUploadInput");
  }
  function bindEvents() {
    elements.sendSelectedBtn.addEventListener("click", handleSendSelected);
    elements.promptAssistBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePromptPicker();
    });
    elements.queryInput.addEventListener("input", () => {
      closePromptPicker();
      updateSendBtnState();
    });
    elements.queryInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      await handleSendSelected();
    });
    elements.exportBtn.addEventListener("click", showExportModal);
    elements.historyToggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHistoryPanel();
    });
    elements.closeHistoryPanelBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeHistoryPanel();
    });
    document.addEventListener("click", (event) => {
      if (elements.historyPanel.classList.contains("is-open") && !elements.historyPanel.contains(event.target) && !elements.historyToggleBtn.contains(event.target)) {
        closeHistoryPanel();
      }
    });
    elements.clearHistoryBtn?.addEventListener("click", async () => {
      if (state.searchHistory.length === 0) {
        return;
      }
      await clearAllHistory();
    });
    elements.layoutToggleBtn.addEventListener("click", () => {
      const isHidden = elements.layoutPopover.hasAttribute("hidden");
      if (isHidden) {
        elements.layoutPopover.removeAttribute("hidden");
      } else {
        elements.layoutPopover.setAttribute("hidden", "");
      }
    });
    elements.layoutRowsButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        state.layoutRows = Number(button.dataset.layoutRows);
        state.layoutMode = "grid";
        updateLayoutUi();
        await savePreferences2();
      });
    });
    elements.cardSizeButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        state.cardSizeLevel = button.dataset.cardSize;
        updateLayoutUi();
        await savePreferences2();
      });
    });
    elements.sidebarLayoutBtn?.addEventListener("click", async () => {
      if (state.layoutMode === "sidebar") {
        state.layoutMode = "grid";
      } else {
        state.layoutMode = "sidebar";
        const firstSite = getSelectedSites()[0];
        if (!state.activeSidebarSiteId || !state.cardRefs.has(state.activeSidebarSiteId)) {
          state.activeSidebarSiteId = firstSite?.id || null;
        }
        state.cardRefs.forEach((ref, siteId) => {
          if (ref.cardEl) ref.cardEl.hidden = siteId !== state.activeSidebarSiteId;
        });
        renderSiteNav();
      }
      updateLayoutUi();
      await savePreferences2();
    });
    document.addEventListener("click", (event) => {
      if (!elements.layoutPopover || elements.layoutPopover.hasAttribute("hidden")) {
        return;
      }
      const insidePopover = elements.layoutPopover.contains(event.target);
      const insideToggle = elements.layoutToggleBtn.contains(event.target);
      if (!insidePopover && !insideToggle) {
        elements.layoutPopover.setAttribute("hidden", "");
      }
    });
    elements.iframesContainer.addEventListener("wheel", () => {
      state.userIsScrolling = true;
      clearTimeout(state.userScrollTimer);
      state.userScrollTimer = setTimeout(() => {
        state.userIsScrolling = false;
        state.userScrollTimer = null;
        if (state.scrollGuardActive) {
          state.scrollGuardLeft = elements.iframesContainer.scrollLeft;
          state.scrollGuardTop = elements.iframesContainer.scrollTop;
        }
      }, 400);
    }, { passive: true });
    elements.iframesContainer.addEventListener("pointerdown", () => {
      state.userIsScrolling = true;
    }, { passive: true });
    window.addEventListener("pointerup", () => {
      if (state.userIsScrolling) {
        state.userIsScrolling = false;
        if (state.scrollGuardActive) {
          state.scrollGuardLeft = elements.iframesContainer.scrollLeft;
          state.scrollGuardTop = elements.iframesContainer.scrollTop;
        }
      }
    }, { passive: true });
    elements.iframesContainer.addEventListener("scroll", () => {
      if (!state.scrollGuardActive || state.userIsScrolling) {
        return;
      }
      const container = elements.iframesContainer;
      if (container.scrollLeft !== state.scrollGuardLeft) {
        container.scrollLeft = state.scrollGuardLeft;
      }
      if (container.scrollTop !== state.scrollGuardTop) {
        container.scrollTop = state.scrollGuardTop;
      }
    }, { passive: true });
    elements.iframesContainer.addEventListener("wheel", (event) => {
      if (state.layoutRows !== 1 || state.layoutMode === "sidebar") {
        return;
      }
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      elements.iframesContainer.scrollLeft += event.deltaY * 1.2;
    }, { passive: false });
    elements.scrollToStartBtn?.addEventListener("click", () => {
      elements.iframesContainer.scrollTo({ left: 0, behavior: "smooth" });
    });
    elements.scrollToEndBtn?.addEventListener("click", () => {
      elements.iframesContainer.scrollTo({ left: elements.iframesContainer.scrollWidth, behavior: "smooth" });
    });
    elements.scrollToTopBtn?.addEventListener("click", () => {
      elements.iframesContainer.scrollTo({ top: 0, behavior: "smooth" });
    });
    elements.scrollToBottomBtn?.addEventListener("click", () => {
      elements.iframesContainer.scrollTo({ top: elements.iframesContainer.scrollHeight, behavior: "smooth" });
    });
    elements.iframesContainer.addEventListener("scroll", updateScrollEdgeBtns, { passive: true });
    window.addEventListener("resize", () => {
      updateLayoutUi();
    });
    elements.newChatBtn?.addEventListener("click", () => {
      elements.queryInput.value = "";
      updateSendBtnState();
      activateScrollGuard(
        elements.iframesContainer.scrollLeft,
        elements.iframesContainer.scrollTop,
        getScrollGuardDurationMs(state.cardRefs.size)
      );
      state.cardRefs.forEach((ref) => {
        ref.restoreUrl = "";
        refreshSiteCard(ref, { immediate: false });
      });
      state.sessionSnapshots = [];
      state.sessionVersion += 1;
      state.lastSearchQuery = null;
      state.lastSearchTime = null;
      state.currentHistoryEntryId = null;
      state.historyEntryIdBySiteId.clear();
      setGlobalStatus("已新建对话，所有卡片已重置。");
    });
    elements.settingsBtn?.addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE" });
      } catch (_error) {
        window.open(chrome.runtime.getURL("settings/settings.html"), "_blank", "noopener,noreferrer");
      }
    });
    elements.addSiteBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleAddSitePicker();
    });
    elements.addSitePopover?.addEventListener("mousedown", (event) => {
      state._addSitePickerMouseInside = elements.addSitePopover.contains(event.target);
    }, true);
    elements.closeAddSitePopoverBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAddSitePicker();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!state.isAddSitePickerOpen || !elements.addSitePopover) {
        return;
      }
      const insidePopover = elements.addSitePopover.contains(event.target);
      const insideBtn = elements.addSiteBtn?.contains(event.target);
      if (!insidePopover && !insideBtn) {
        closeAddSitePicker();
      }
    }, true);
    document.addEventListener("click", (event) => {
      if (!state.isAddSitePickerOpen || !elements.addSitePopover) {
        return;
      }
      if (state._addSitePickerMouseInside) {
        state._addSitePickerMouseInside = false;
        return;
      }
      const insidePopover = elements.addSitePopover.contains(event.target);
      const insideBtn = elements.addSiteBtn?.contains(event.target);
      if (!insidePopover && !insideBtn) {
        closeAddSitePicker();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.isAddSitePickerOpen) {
        closeAddSitePicker();
      }
    });
    window.addEventListener("blur", () => {
      if (!state.isAddSitePickerOpen) {
        return;
      }
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          closeAddSitePicker();
        }
      }, 0);
    });
  }
  function hydrateQueryFromUrl() {
    const url = new URL(window.location.href);
    const query = url.searchParams.get("q");
    const sitesParam = url.searchParams.get("sites");
    state.restoreHistoryEntryId = url.searchParams.get("restoreHistoryId");
    state.shouldAutoSend = url.searchParams.get("autosend") === "1";
    state.requestedSiteIds = parseRequestedSiteIds(sitesParam);
    if (query) {
      elements.queryInput.value = query;
    }
  }
  async function restorePreferences() {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.cardSizeLevel,
      STORAGE_KEYS.layoutRows,
      STORAGE_KEYS.layoutMode,
      STORAGE_KEYS.searchHistory,
      STORAGE_KEYS.promptGroups
    ]);
    if (typeof stored[STORAGE_KEYS.cardSizeLevel] === "string") {
      state.cardSizeLevel = stored[STORAGE_KEYS.cardSizeLevel];
    }
    if (typeof stored[STORAGE_KEYS.layoutRows] === "number") {
      state.layoutRows = stored[STORAGE_KEYS.layoutRows];
    }
    if (stored[STORAGE_KEYS.layoutMode] === "sidebar" || stored[STORAGE_KEYS.layoutMode] === "grid") {
      state.layoutMode = stored[STORAGE_KEYS.layoutMode];
    }
    if (Array.isArray(stored[STORAGE_KEYS.searchHistory])) {
      state.searchHistory = stored[STORAGE_KEYS.searchHistory];
    }
    state.promptGroups = normalizePromptGroups(stored[STORAGE_KEYS.promptGroups]);
    if (!state.promptGroups.some((group) => group.id === state.activePromptGroupId)) {
      state.activePromptGroupId = state.promptGroups[0]?.id || null;
    }
    elements.iframesContainer.dataset.columns = "1";
    updateLayoutUi();
    renderHistoryList();
    renderPromptPicker();
  }
  async function savePreferences2() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.cardSizeLevel]: state.cardSizeLevel,
      [STORAGE_KEYS.layoutRows]: state.layoutRows,
      [STORAGE_KEYS.layoutMode]: state.layoutMode,
      [STORAGE_KEYS.searchHistory]: state.searchHistory
    });
  }

  // src/iframe/iframe.js
  initComparePage();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2lmcmFtZS9pZnJhbWUvc3RhdGUuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9pZnJhbWUvdXRpbHMuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9pZnJhbWUvaGlzdG9yeS5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9sYXlvdXQuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9zdG9yYWdlLWtleXMuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9kaWFnbm9zdGljcy5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9maWxlLXVwbG9hZC5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9jYXJkcy1yZW5kZXIuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9pZnJhbWUvbG9hZC1xdWV1ZS5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9leHBvcnQuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9pZnJhbWUvc2VuZC5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9zdGF0dXMuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9zaXRlLXJlZ2lzdHJ5LmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaWZyYW1lL3NpdGVzLWxvYWRlci5qcyIsICIuLi8uLi9zcmMvc2hhcmVkL3Byb21wdC1ncm91cHMuanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9pZnJhbWUvcHJvbXB0cy5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9hZGQtc2l0ZS5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2lmcmFtZS9tYWluLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaWZyYW1lLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBTaGFyZWQgbXV0YWJsZSBzdGF0ZSArIGVsZW1lbnQgcmVmcyArIGNvbnN0YW50cyBmb3IgdGhlIGNvbXBhcmUgcGFnZS5cclxuLy8gTW9kdWxlcyBpbXBvcnQgdGhpcyBzaW5nbGV0b24gYW5kIG11dGF0ZSBmaWVsZHMgZGlyZWN0bHkgaW5zdGVhZCBvZlxyXG4vLyB0aHJlYWRpbmcgTiBhcmd1bWVudHMgdGhyb3VnaCBjYWxsIGNoYWlucy4gbWFpbi5qcyBpcyB0aGUgc29sZSBtb2R1bGVcclxuLy8gdGhhdCBjYWxscyBjYWNoZUVsZW1lbnRzKCkgdG8gcG9wdWxhdGUgYGVsZW1lbnRzYC5cclxuXHJcbmV4cG9ydCBjb25zdCBCQVNFX0NPTkZJRyA9IGdsb2JhbFRoaXMuUVNIT1RfQkFTRV9DT05GSUcgfHwge307XHJcblxyXG5leHBvcnQgY29uc3QgU1RPUkFHRV9LRVlTID0ge1xyXG4gIGNhcmRTaXplTGV2ZWw6IFwiY2FyZFNpemVMZXZlbFwiLFxyXG4gIGxheW91dFJvd3M6IFwibGF5b3V0Um93c1wiLFxyXG4gIGxheW91dE1vZGU6IFwibGF5b3V0TW9kZVwiLFxyXG4gIHNlYXJjaEhpc3Rvcnk6IFwic2VhcmNoSGlzdG9yeVwiLFxyXG4gIHByb21wdEdyb3VwczogXCJwcm9tcHRHcm91cHNcIlxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IFNJVEVfQ0FURUdPUklFUyA9IFtcclxuICB7IGlkOiBcImFpXCIsIGxhYmVsOiBcIkFJXCIsIGJ1aWx0aW5JZHM6IFtcImRlZXBzZWVrXCIsIFwiZG91YmFvXCIsIFwia2ltaVwiLCBcInl1YW5iYW9cIiwgXCJxd2VuXCIsIFwibWV0YXNvXCIsIFwiZ2VtaW5pXCIsIFwiY2hhdGdwdFwiLCBcImNsYXVkZVwiLCBcImdyb2tcIl0gfSxcclxuICB7IGlkOiBcIm90aGVyXCIsIGxhYmVsOiBcIuekvuWqklwiLCBidWlsdGluSWRzOiBbXCJ4aWFvaG9uZ3NodVwiLCBcImJpbGliaWxpXCIsIFwiemhpaHVcIiwgXCJkb3V5aW5cIiwgXCJ0d2l0dGVyXCIsIFwieW91dHViZVwiLCBcInJlZGRpdFwiLCBcInRpa3Rva1wiXSB9LFxyXG4gIHsgaWQ6IFwiY3VzdG9tXCIsIGxhYmVsOiBcIuiHquWumuS5iVwiLCBidWlsdGluSWRzOiBbXSB9XHJcbl07XHJcblxyXG4vLyDmnKzova7kvJror53lhoXkv53nlZnnmoTljoblj7Lpl67nrZTlv6vnhafkuIrpmZDjgILmr4/mnaHlv6vnhafljIXlkKvmiYDmnInlvZPliY3ljaHniYfnmoTlrozmlbTlm57nrZTmlofmnKzvvIxcclxuLy8g5Y2V5p2h5Y+v6IO95Yeg5Y2BIEtCIOi1t+atpe+8jOmVv+S8muivneS4i+S4jeiuvuS4iumZkOS8muiuqemhtemdouWGheWtmOaMgee7reWinumVv+OAglxyXG4vLyAyMCDmnaHotrPlpJ/opobnm5bnu53lpKflpJrmlbBcIui/nue7rei/vemXriArIOS4gOasoeaAp+WvvOWHulwi55qE5Zy65pmv44CCXHJcbmV4cG9ydCBjb25zdCBTRVNTSU9OX1NOQVBTSE9UU19NQVggPSAyMDtcclxuXHJcbmV4cG9ydCBjb25zdCBzdGF0ZSA9IHtcclxuICBzaXRlczogW10sXHJcbiAgYWxsU2l0ZXM6IFtdLFxyXG4gIHJlcXVlc3RlZFNpdGVJZHM6IG51bGwsXHJcbiAgaGlkZGVuU2l0ZUlkczogbmV3IFNldCgpLFxyXG4gIGNhcmRSZWZzOiBuZXcgTWFwKCksXHJcbiAgY29sdW1uQ291bnQ6IFwiMVwiLFxyXG4gIG1heGltaXplZFNpdGVJZDogbnVsbCxcclxuICBzaG91bGRBdXRvU2VuZDogZmFsc2UsXHJcbiAgcmVzdG9yZUhpc3RvcnlFbnRyeUlkOiBudWxsLFxyXG4gIHBlbmRpbmdEaXNwYXRjaGVzOiBuZXcgTWFwKCksXHJcbiAgY2FyZFNpemVMZXZlbDogXCJtZWRpdW1cIixcclxuICBsYXlvdXRSb3dzOiAxLFxyXG4gIGxheW91dE1vZGU6IFwiZ3JpZFwiLFxyXG4gIGFjdGl2ZVNpZGViYXJTaXRlSWQ6IG51bGwsXHJcbiAgc2VhcmNoSGlzdG9yeTogW10sXHJcbiAgY3VycmVudEhpc3RvcnlFbnRyeUlkOiBudWxsLFxyXG4gIGhpc3RvcnlFbnRyeUlkQnlTaXRlSWQ6IG5ldyBNYXAoKSxcclxuICBwcm9tcHRHcm91cHM6IFtdLFxyXG4gIGFjdGl2ZVByb21wdEdyb3VwSWQ6IG51bGwsXHJcbiAgaXNQcm9tcHRQaWNrZXJPcGVuOiBmYWxzZSxcclxuICBsb2NrZWRTY3JvbGxMZWZ0OiBudWxsLFxyXG4gIHNjcm9sbFVubG9ja1RpbWVySWQ6IG51bGwsXHJcbiAgaXNTY3JvbGxMb2NrZWQ6IGZhbHNlLFxyXG4gIHNjcm9sbEd1YXJkQWN0aXZlOiBmYWxzZSxcclxuICBzY3JvbGxHdWFyZExlZnQ6IDAsXHJcbiAgc2Nyb2xsR3VhcmRUb3A6IDAsXHJcbiAgc2Nyb2xsR3VhcmRSYWZJZDogbnVsbCxcclxuICBzY3JvbGxHdWFyZFRpbWVySWQ6IG51bGwsXHJcbiAgdXNlcklzU2Nyb2xsaW5nOiBmYWxzZSxcclxuICB1c2VyU2Nyb2xsVGltZXI6IG51bGwsXHJcbiAgaXNTZW5kaW5nOiBmYWxzZSxcclxuICBzZXNzaW9uU25hcHNob3RzOiBbXSxcclxuICBzZXNzaW9uVmVyc2lvbjogMCxcclxuICBsYXN0U2VhcmNoUXVlcnk6IG51bGwsXHJcbiAgbGFzdFNlYXJjaFRpbWU6IG51bGwsXHJcbiAgaXNBZGRTaXRlUGlja2VyT3BlbjogZmFsc2UsXHJcbiAgYWN0aXZlQWRkU2l0ZUNhdGVnb3J5OiBcImFpXCIsXHJcbiAgLy8g5bm25Y+R5qe95L2N57O757uf77yaXHJcbiAgLy8gICBsb2FkaW5nUmVmc++8muW9k+WJjeWkhOS6jlwi5Yqg6L295LitXCLvvIjlt7LotYsgc3Jj44CB5bCa5pyqIGxvYWQvZXJyb3Iv6LaF5pe277yJ55qEIHJlZiDpm4blkIjvvIxcclxuICAvLyAgICAgICAgICAgICAgICBzaXplIOS4jeS8mui2hei/hyBCQVNFX0NPTkZJRy5pZnJhbWVNYXhDb25jdXJyZW5044CCXHJcbiAgLy8gICBsb2FkUXVldWUg77ya5bey5Yib5bu6IGlmcmFtZSBET00g5L2G5bCa5pyq6KKr5YWB6K646LWLIHNyYyDnmoQgcmVmIOmYn+WIl++8jOaMieWFpemYn+mhuuW6jyBGSUZP44CCXHJcbiAgLy8g5q+P5b2TIGxvYWRpbmdSZWZzIOmHjOaciSByZWYg5a6M5oiQL+Wksei0pS/otoXml7bml7bosIPnlKggcHVtcExvYWRRdWV1ZSDku47pmJ/liJflj5bkuIvkuIDkuKrooaXkvY3jgIJcclxuICBsb2FkaW5nUmVmczogbmV3IFNldCgpLFxyXG4gIGxvYWRRdWV1ZTogW11cclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBlbGVtZW50cyA9IHt9O1xyXG5cclxuLy8g6aKE6KeI5Y2h54mH566h55CG5Zmo77yI55SxIHNoYXJlZC9wcm9tcHQtaXRlbS5qcyDmj5DkvpvvvIlcclxuZXhwb3J0IGNvbnN0IHByb21wdFByZXZpZXcgPSB7IG1ncjogbnVsbCB9O1xyXG4iLCAiaW1wb3J0IHsgc3RhdGUsIGVsZW1lbnRzIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVIdG1sKHZhbHVlKSB7XHJcbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSlcclxuICAgIC5yZXBsYWNlQWxsKFwiJlwiLCBcIiZhbXA7XCIpXHJcbiAgICAucmVwbGFjZUFsbChcIjxcIiwgXCImbHQ7XCIpXHJcbiAgICAucmVwbGFjZUFsbChcIj5cIiwgXCImZ3Q7XCIpXHJcbiAgICAucmVwbGFjZUFsbCgnXCInLCBcIiZxdW90O1wiKVxyXG4gICAgLnJlcGxhY2VBbGwoXCInXCIsIFwiJiMzOTtcIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZXF1ZXN0SWQoKSB7XHJcbiAgaWYgKGdsb2JhbFRoaXMuY3J5cHRvPy5yYW5kb21VVUlEKSB7XHJcbiAgICByZXR1cm4gZ2xvYmFsVGhpcy5jcnlwdG8ucmFuZG9tVVVJRCgpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGByZXFfJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDEwKX1gO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJBdXRvU2VuZEZsYWdGcm9tVXJsKCkge1xyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwod2luZG93LmxvY2F0aW9uLmhyZWYpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuZGVsZXRlKFwiYXV0b3NlbmRcIik7XHJcbiAgaGlzdG9yeS5yZXBsYWNlU3RhdGUoe30sIFwiXCIsIHVybC50b1N0cmluZygpKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVF1ZXJ5Rm9yTWF0Y2godGV4dCkge1xyXG4gIHJldHVybiBTdHJpbmcodGV4dCB8fCBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKS5zbGljZSgwLCAzMDApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTaXRlVXJsKHNpdGUsIHF1ZXJ5KSB7XHJcbiAgaWYgKHNpdGU/LmlkID09PSBcInlvdXR1YmVcIikge1xyXG4gICAgY29uc3QgeW91dHViZUVtYmVkVXJsID0gYnVpbGRZb3V0dWJlRW1iZWRVcmwocXVlcnkpO1xyXG4gICAgaWYgKHlvdXR1YmVFbWJlZFVybCkge1xyXG4gICAgICByZXR1cm4geW91dHViZUVtYmVkVXJsO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc3QgdXJsID0gc2l0ZS51cmwgfHwgXCJcIjtcclxuICBpZiAoIXVybC5pbmNsdWRlcyhcIntxdWVyeX1cIikpIHtcclxuICAgIHJldHVybiB1cmw7XHJcbiAgfVxyXG4gIGlmIChxdWVyeSAmJiBzaXRlLnN1cHBvcnRVcmxRdWVyeSkge1xyXG4gICAgcmV0dXJuIHVybC5yZXBsYWNlKFwie3F1ZXJ5fVwiLCBlbmNvZGVVUklDb21wb25lbnQocXVlcnkpKTtcclxuICB9XHJcbiAgLy8g56m6IHF1ZXJ5IOaIluermeeCueS4jeaUr+aMgSBVUkwg55u06L6+77ya5Yml56a75ZCrIHtxdWVyeX0g55qE5Y+C5pWw5q6177yM5Zue6JC95Yiw5Z+656GAIFVSTFxyXG4gIGxldCBuZXh0ID0gdXJsLnJlcGxhY2UoLyhbPyZdKVtePSZdKz1cXHtxdWVyeVxcfS9nLCAoXywgc2VwKSA9PiAoc2VwID09PSBcIj9cIiA/IFwiP1wiIDogXCJcIikpO1xyXG4gIG5leHQgPSBuZXh0LnJlcGxhY2UoL1s/Jl0kLywgXCJcIik7XHJcbiAgLy8g5YWc5bqV77ya5LiH5LiA6L+Y5q6L55WZIHtxdWVyeX3vvIznspfmmrTmuIXmjolcclxuICByZXR1cm4gbmV4dC5yZXBsYWNlKC9cXHtxdWVyeVxcfS9nLCBcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRZb3V0dWJlRW1iZWRVcmwocXVlcnkpIHtcclxuICBjb25zdCB0ZXh0ID0gU3RyaW5nKHF1ZXJ5IHx8IFwiXCIpLnRyaW0oKTtcclxuICBpZiAoIXRleHQpIHJldHVybiBcIlwiO1xyXG5cclxuICBjb25zdCB2aWRlb0lkID0gZXh0cmFjdFlvdXR1YmVWaWRlb0lkKHRleHQpO1xyXG4gIGlmICghdmlkZW9JZCkgcmV0dXJuIFwiXCI7XHJcblxyXG4gIC8vIFlvdVR1YmUgSUZyYW1lIEFQSSDmjqjojZDluKYgZW5hYmxlanNhcGkgKyBvcmlnaW7jgIJcclxuICAvLyDov5nph4znlKggeW91dHViZS1ub2Nvb2tpZSDln5/lh4/lsJHnrKzkuInmlrkgY29va2llIOW5suaJsOOAglxyXG4gIGNvbnN0IG9yaWdpbiA9IGVuY29kZVVSSUNvbXBvbmVudCh3aW5kb3cubG9jYXRpb24ub3JpZ2luKTtcclxuICByZXR1cm4gYGh0dHBzOi8vd3d3LnlvdXR1YmUtbm9jb29raWUuY29tL2VtYmVkLyR7dmlkZW9JZH0/ZW5hYmxlanNhcGk9MSZvcmlnaW49JHtvcmlnaW59JnBsYXlzaW5saW5lPTEmcmVsPTBgO1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0WW91dHViZVZpZGVvSWQoaW5wdXQpIHtcclxuICBjb25zdCByYXcgPSBTdHJpbmcoaW5wdXQgfHwgXCJcIikudHJpbSgpO1xyXG4gIGlmICghcmF3KSByZXR1cm4gXCJcIjtcclxuXHJcbiAgLy8g55u05o6l6L6T5YWlIDExIOS9jSB2aWRlb0lkXHJcbiAgaWYgKC9eW0EtWmEtejAtOV8tXXsxMX0kLy50ZXN0KHJhdykpIHtcclxuICAgIHJldHVybiByYXc7XHJcbiAgfVxyXG5cclxuICBsZXQgcGFyc2VkO1xyXG4gIHRyeSB7XHJcbiAgICBwYXJzZWQgPSBuZXcgVVJMKHJhdyk7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICBpZiAoaG9zdCA9PT0gXCJ5b3V0dS5iZVwiKSB7XHJcbiAgICBjb25zdCBpZCA9IHBhcnNlZC5wYXRobmFtZS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnNwbGl0KFwiL1wiKVswXTtcclxuICAgIHJldHVybiAvXltBLVphLXowLTlfLV17MTF9JC8udGVzdChpZCkgPyBpZCA6IFwiXCI7XHJcbiAgfVxyXG5cclxuICBpZiAoaG9zdCA9PT0gXCJ5b3V0dWJlLmNvbVwiIHx8IGhvc3QuZW5kc1dpdGgoXCIueW91dHViZS5jb21cIikpIHtcclxuICAgIGNvbnN0IHYgPSBwYXJzZWQuc2VhcmNoUGFyYW1zLmdldChcInZcIik7XHJcbiAgICBpZiAoL15bQS1aYS16MC05Xy1dezExfSQvLnRlc3QodiB8fCBcIlwiKSkge1xyXG4gICAgICByZXR1cm4gdjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBtYXRjaCA9IHBhcnNlZC5wYXRobmFtZS5tYXRjaCgvXFwvKGVtYmVkfHNob3J0c3xsaXZlKVxcLyhbQS1aYS16MC05Xy1dezExfSkvKTtcclxuICAgIGlmIChtYXRjaD8uWzJdKSB7XHJcbiAgICAgIHJldHVybiBtYXRjaFsyXTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBcIlwiO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2VsZWN0ZWRTaXRlcygpIHtcclxuICByZXR1cm4gc3RhdGUuc2l0ZXMuZmlsdGVyKChzaXRlKSA9PiAhc3RhdGUuaGlkZGVuU2l0ZUlkcy5oYXMoc2l0ZS5pZCkpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNXaWRlTWVkaWFTaXRlKHNpdGVJZCkge1xyXG4gIHJldHVybiBzaXRlSWQgPT09IFwieGlhb2hvbmdzaHVcIiB8fCBzaXRlSWQgPT09IFwiYmlsaWJpbGlcIjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzU29jaWFsTWVkaWFDYXJkU2l0ZShzaXRlSWQpIHtcclxuICByZXR1cm4gc2l0ZUlkID09PSBcInhpYW9ob25nc2h1XCIgfHwgc2l0ZUlkID09PSBcImJpbGliaWxpXCIgfHwgc2l0ZUlkID09PSBcInpoaWh1XCI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRRdWVyeSgpIHtcclxuICByZXR1cm4gZWxlbWVudHMucXVlcnlJbnB1dC52YWx1ZS50cmltKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRRdWVyeUlucHV0VmFsdWUodmFsdWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gIGlmICghZWxlbWVudHMucXVlcnlJbnB1dCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgZWxlbWVudHMucXVlcnlJbnB1dC52YWx1ZSA9IFN0cmluZyh2YWx1ZSB8fCBcIlwiKTtcclxuICBlbGVtZW50cy5xdWVyeUlucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiaW5wdXRcIiwgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHJcbiAgaWYgKG9wdGlvbnMuZm9jdXMpIHtcclxuICAgIGVsZW1lbnRzLnF1ZXJ5SW5wdXQuZm9jdXMoKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBlbnN1cmVDYXJkc05vdEVtcHR5KCkge1xyXG4gIGlmIChzdGF0ZS5jYXJkUmVmcy5zaXplID4gMCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZW1wdHlTdGF0ZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgZW1wdHlTdGF0ZS5jbGFzc05hbWUgPSBcImVtcHR5LXN0YXRlXCI7XHJcbiAgZW1wdHlTdGF0ZS50ZXh0Q29udGVudCA9IFwi6K+35YWI6YCJ5oup6Iez5bCR5LiA5Liq56uZ54K544CCXCI7XHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuYXBwZW5kQ2hpbGQoZW1wdHlTdGF0ZSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlcXVlc3RlZFNpdGVJZHMocmF3VmFsdWUpIHtcclxuICBpZiAoIXJhd1ZhbHVlKSB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGNvbnN0IHNpdGVJZHMgPSByYXdWYWx1ZVxyXG4gICAgLnNwbGl0KFwiLFwiKVxyXG4gICAgLm1hcCgoaXRlbSkgPT4gaXRlbS50cmltKCkpXHJcbiAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAuZmlsdGVyKChpZCwgaW5kZXgsIGxpc3QpID0+IGxpc3QuaW5kZXhPZihpZCkgPT09IGluZGV4KTtcclxuXHJcbiAgcmV0dXJuIHNpdGVJZHMubGVuZ3RoID4gMCA/IHNpdGVJZHMgOiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplUHJvbXB0R3JvdXBzKHNvdXJjZSkge1xyXG4gIGNvbnN0IGxpc3QgPSBBcnJheS5pc0FycmF5KHNvdXJjZSkgPyBzb3VyY2UgOiBbXTtcclxuICByZXR1cm4gbGlzdC5tYXAoKGdyb3VwLCBncm91cEluZGV4KSA9PiAoe1xyXG4gICAgaWQ6IFN0cmluZyhncm91cC5pZCB8fCBgcHJvbXB0LWdyb3VwLSR7Z3JvdXBJbmRleH1gKSxcclxuICAgIG5hbWU6IFN0cmluZyhncm91cC5uYW1lIHx8IFwi5pyq5ZG95ZCN5YiG57uEXCIpLFxyXG4gICAgcHJvbXB0czogQXJyYXkuaXNBcnJheShncm91cC5wcm9tcHRzKVxyXG4gICAgICA/IGdyb3VwLnByb21wdHMubWFwKChwcm9tcHQsIHByb21wdEluZGV4KSA9PiAoe1xyXG4gICAgICAgICAgaWQ6IFN0cmluZyhwcm9tcHQuaWQgfHwgYHByb21wdC0ke2dyb3VwSW5kZXh9LSR7cHJvbXB0SW5kZXh9YCksXHJcbiAgICAgICAgICB0aXRsZTogU3RyaW5nKHByb21wdC50aXRsZSB8fCBcIuacquWRveWQjeaPkOekuuivjVwiKSxcclxuICAgICAgICAgIGNvbnRlbnQ6IFN0cmluZyhwcm9tcHQuY29udGVudCB8fCBcIlwiKVxyXG4gICAgICAgIH0pKVxyXG4gICAgICA6IFtdXHJcbiAgfSkpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzdGF0ZSwgZWxlbWVudHMsIFNUT1JBR0VfS0VZUyB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVJlcXVlc3RJZCwgc2V0UXVlcnlJbnB1dFZhbHVlIH0gZnJvbSBcIi4vdXRpbHMuanNcIjtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlUHJlZmVyZW5jZXMoKSB7XHJcbiAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHtcclxuICAgIFtTVE9SQUdFX0tFWVMuY2FyZFNpemVMZXZlbF06IHN0YXRlLmNhcmRTaXplTGV2ZWwsXHJcbiAgICBbU1RPUkFHRV9LRVlTLmxheW91dFJvd3NdOiBzdGF0ZS5sYXlvdXRSb3dzLFxyXG4gICAgW1NUT1JBR0VfS0VZUy5sYXlvdXRNb2RlXTogc3RhdGUubGF5b3V0TW9kZSxcclxuICAgIFtTVE9SQUdFX0tFWVMuc2VhcmNoSGlzdG9yeV06IHN0YXRlLnNlYXJjaEhpc3RvcnlcclxuICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNhdmVTZWFyY2hIaXN0b3J5KHF1ZXJ5LCBzaXRlcykge1xyXG4gIGNvbnN0IGVudHJ5ID0ge1xyXG4gICAgaWQ6IGNyZWF0ZVJlcXVlc3RJZCgpLFxyXG4gICAgcXVlcnksXHJcbiAgICBzaXRlczogc2l0ZXMubWFwKChzaXRlKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJlZiA9IHN0YXRlLmNhcmRSZWZzLmdldChzaXRlLmlkKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpZDogc2l0ZS5pZCxcclxuICAgICAgICBuYW1lOiBzaXRlLm5hbWUsXHJcbiAgICAgICAgdXJsOiByZWY/LmN1cnJlbnRVcmwgfHwgc2l0ZS51cmxcclxuICAgICAgfTtcclxuICAgIH0pLFxyXG4gICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICB9O1xyXG5cclxuICBzdGF0ZS5jdXJyZW50SGlzdG9yeUVudHJ5SWQgPSBlbnRyeS5pZDtcclxuICBzaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBpZiAoc2l0ZT8uaWQpIHtcclxuICAgICAgc3RhdGUuaGlzdG9yeUVudHJ5SWRCeVNpdGVJZC5zZXQoc2l0ZS5pZCwgZW50cnkuaWQpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG4gIHN0YXRlLnNlYXJjaEhpc3RvcnkgPSBbZW50cnksIC4uLnN0YXRlLnNlYXJjaEhpc3RvcnldLnNsaWNlKDAsIDUwKTtcclxuICBhd2FpdCBzYXZlUHJlZmVyZW5jZXMoKTtcclxuICByZW5kZXJIaXN0b3J5TGlzdCgpO1xyXG4gIHJldHVybiBlbnRyeS5pZDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hIaXN0b3J5RW50cnlVcmxzKGVudHJ5SWQsIHNpdGVzKSB7XHJcbiAgaWYgKCFlbnRyeUlkIHx8ICFBcnJheS5pc0FycmF5KHNpdGVzKSB8fCBzaXRlcy5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGNvbnN0IGxhdGVzdFVybHNCeVNpdGVJZCA9IG5ldyBNYXAoKTtcclxuICBzaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBpZiAoIXNpdGU/LmlkKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IHJlZiA9IHN0YXRlLmNhcmRSZWZzLmdldChzaXRlLmlkKTtcclxuICAgIGxhdGVzdFVybHNCeVNpdGVJZC5zZXQoc2l0ZS5pZCwgU3RyaW5nKHJlZj8uY3VycmVudFVybCB8fCBzaXRlLnVybCB8fCBcIlwiKSk7XHJcbiAgfSk7XHJcblxyXG4gIGxldCBjaGFuZ2VkID0gZmFsc2U7XHJcbiAgc3RhdGUuc2VhcmNoSGlzdG9yeSA9IHN0YXRlLnNlYXJjaEhpc3RvcnkubWFwKChlbnRyeSkgPT4ge1xyXG4gICAgaWYgKGVudHJ5LmlkICE9PSBlbnRyeUlkIHx8ICFBcnJheS5pc0FycmF5KGVudHJ5LnNpdGVzKSkge1xyXG4gICAgICByZXR1cm4gZW50cnk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdXBkYXRlZFNpdGVzID0gZW50cnkuc2l0ZXMubWFwKChzaXRlKSA9PiB7XHJcbiAgICAgIGNvbnN0IG5leHRVcmwgPSBsYXRlc3RVcmxzQnlTaXRlSWQuZ2V0KHNpdGU/LmlkKTtcclxuICAgICAgaWYgKCFuZXh0VXJsIHx8IHNpdGUudXJsID09PSBuZXh0VXJsKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpdGU7XHJcbiAgICAgIH1cclxuICAgICAgY2hhbmdlZCA9IHRydWU7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgLi4uc2l0ZSxcclxuICAgICAgICB1cmw6IG5leHRVcmxcclxuICAgICAgfTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiBjaGFuZ2VkID8geyAuLi5lbnRyeSwgc2l0ZXM6IHVwZGF0ZWRTaXRlcyB9IDogZW50cnk7XHJcbiAgfSk7XHJcblxyXG4gIGlmICghY2hhbmdlZCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgYXdhaXQgc2F2ZVByZWZlcmVuY2VzKCk7XHJcbiAgcmVuZGVySGlzdG9yeUxpc3QoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckhpc3RvcnlMaXN0KCkge1xyXG4gIGlmICghZWxlbWVudHMuaGlzdG9yeUxpc3QpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGVsZW1lbnRzLmhpc3RvcnlMaXN0LmlubmVySFRNTCA9IFwiXCI7XHJcbiAgaWYgKHN0YXRlLnNlYXJjaEhpc3RvcnkubGVuZ3RoID09PSAwKSB7XHJcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbXB0eS5jbGFzc05hbWUgPSBcImhpc3RvcnktaXRlbS1tZXRhXCI7XHJcbiAgICBlbXB0eS50ZXh0Q29udGVudCA9IFwi5pqC5peg5pCc57Si6K6w5b2VXCI7XHJcbiAgICBlbGVtZW50cy5oaXN0b3J5TGlzdC5hcHBlbmRDaGlsZChlbXB0eSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBzdGF0ZS5zZWFyY2hIaXN0b3J5LmZvckVhY2goKGVudHJ5KSA9PiB7XHJcbiAgICBjb25zdCBub3JtYWxpemVkU2l0ZXMgPSBub3JtYWxpemVIaXN0b3J5U2l0ZXMoZW50cnkuc2l0ZXMpO1xyXG5cclxuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgaXRlbS5jbGFzc05hbWUgPSBcImhpc3RvcnktaXRlbVwiO1xyXG5cclxuICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgYWN0aW9ucy5jbGFzc05hbWUgPSBcImhpc3RvcnktaXRlbS1hY3Rpb25zXCI7XHJcblxyXG4gICAgY29uc3QgbWV0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBtZXRhLmNsYXNzTmFtZSA9IFwiaGlzdG9yeS1pdGVtLW1ldGFcIjtcclxuICAgIG1ldGEudGV4dENvbnRlbnQgPSBmb3JtYXRIaXN0b3J5VGltZShlbnRyeS5jcmVhdGVkQXQpO1xyXG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChtZXRhKTtcclxuXHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGFjdGlvbkJ1dHRvbnMuY2xhc3NOYW1lID0gXCJoaXN0b3J5LWFjdGlvbi1idXR0b25zXCI7XHJcblxyXG4gICAgY29uc3QgcmVzdG9yZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICByZXN0b3JlQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgcmVzdG9yZUJ0bi5jbGFzc05hbWUgPSBcImhpc3RvcnktcmVzdG9yZS1idG5cIjtcclxuICAgIHJlc3RvcmVCdG4udGV4dENvbnRlbnQgPSBcIuWkjeWOn1wiO1xyXG4gICAgcmVzdG9yZUJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwi5paw5byA6aG16Z2i5aSN5Y6f6L+Z5qyh5pCc57Si5Lya6K+dXCIpO1xyXG4gICAgcmVzdG9yZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICBvcGVuSGlzdG9yeUVudHJ5UmVzdG9yZVBhZ2UoZW50cnkuaWQpO1xyXG4gICAgfSk7XHJcbiAgICBhY3Rpb25CdXR0b25zLmFwcGVuZENoaWxkKHJlc3RvcmVCdG4pO1xyXG5cclxuICAgIGNvbnN0IGRlbGV0ZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICBkZWxldGVCdG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgICBkZWxldGVCdG4uY2xhc3NOYW1lID0gXCJoaXN0b3J5LWl0ZW0tZGVsZXRlLWJ0blwiO1xyXG4gICAgZGVsZXRlQnRuLnRleHRDb250ZW50ID0gXCLliKDpmaRcIjtcclxuICAgIGRlbGV0ZUJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwi5Yig6Zmk6K6w5b2VXCIpO1xyXG4gICAgZGVsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgIGF3YWl0IGRlbGV0ZUhpc3RvcnlFbnRyeShlbnRyeS5pZCk7XHJcbiAgICB9KTtcclxuICAgIGFjdGlvbkJ1dHRvbnMuYXBwZW5kQ2hpbGQoZGVsZXRlQnRuKTtcclxuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoYWN0aW9uQnV0dG9ucyk7XHJcblxyXG4gICAgY29uc3QgdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdGl0bGUuY2xhc3NOYW1lID0gXCJoaXN0b3J5LWl0ZW0tdGl0bGVcIjtcclxuICAgIHRpdGxlLnRleHRDb250ZW50ID0gZW50cnkucXVlcnk7XHJcblxyXG4gICAgY29uc3QgbGlua3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgbGlua3MuY2xhc3NOYW1lID0gXCJoaXN0b3J5LXNpdGUtbGlua3NcIjtcclxuXHJcbiAgICBub3JtYWxpemVkU2l0ZXMuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgICBjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChzaXRlLnVybCA/IFwiYVwiIDogXCJidXR0b25cIik7XHJcbiAgICAgIGxpbmsuY2xhc3NOYW1lID0gXCJoaXN0b3J5LXNpdGUtbGlua1wiO1xyXG4gICAgICBsaW5rLnRleHRDb250ZW50ID0gc2l0ZS5uYW1lO1xyXG5cclxuICAgICAgaWYgKHNpdGUudXJsKSB7XHJcbiAgICAgICAgbGluay5ocmVmID0gc2l0ZS51cmw7XHJcbiAgICAgICAgbGluay50YXJnZXQgPSBcIl9ibGFua1wiO1xyXG4gICAgICAgIGxpbmsucmVsID0gXCJub29wZW5lciBub3JlZmVycmVyXCI7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbGluay50eXBlID0gXCJidXR0b25cIjtcclxuICAgICAgICBsaW5rLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGluay5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBsaW5rcy5hcHBlbmRDaGlsZChsaW5rKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGl0ZW0uYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcbiAgICBpdGVtLmFwcGVuZENoaWxkKHRpdGxlKTtcclxuICAgIGl0ZW0uYXBwZW5kQ2hpbGQobGlua3MpO1xyXG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBzZXRRdWVyeUlucHV0VmFsdWUoZW50cnkucXVlcnksIHsgZm9jdXM6IHRydWUgfSk7XHJcbiAgICAgIGNsb3NlSGlzdG9yeVBhbmVsKCk7XHJcbiAgICB9KTtcclxuICAgIGVsZW1lbnRzLmhpc3RvcnlMaXN0LmFwcGVuZENoaWxkKGl0ZW0pO1xyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBvcGVuSGlzdG9yeUVudHJ5UmVzdG9yZVBhZ2UoZW50cnlJZCkge1xyXG4gIGlmICghZW50cnlJZCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgdXJsID0gbmV3IFVSTChjaHJvbWUucnVudGltZS5nZXRVUkwoXCJpZnJhbWUvaWZyYW1lLmh0bWxcIikpO1xyXG4gIHVybC5zZWFyY2hQYXJhbXMuc2V0KFwicmVzdG9yZUhpc3RvcnlJZFwiLCBlbnRyeUlkKTtcclxuICB3aW5kb3cub3Blbih1cmwudG9TdHJpbmcoKSwgXCJfYmxhbmtcIiwgXCJub29wZW5lcixub3JlZmVycmVyXCIpO1xyXG4gIGNsb3NlSGlzdG9yeVBhbmVsKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBhcHBseUhpc3RvcnlSZXN0b3JlRnJvbVVybCgpIHtcclxuICBjb25zdCBlbnRyeUlkID0gc3RhdGUucmVzdG9yZUhpc3RvcnlFbnRyeUlkO1xyXG4gIGlmICghZW50cnlJZCkge1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICBjb25zdCBlbnRyeSA9IHN0YXRlLnNlYXJjaEhpc3RvcnkuZmluZCgoaXRlbSkgPT4gaXRlbT8uaWQgPT09IGVudHJ5SWQpO1xyXG4gIGlmICghZW50cnkpIHtcclxuICAgIGNsZWFyUmVzdG9yZUhpc3RvcnlQYXJhbUZyb21VcmwoKTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgbm9ybWFsaXplZFNpdGVzID0gbm9ybWFsaXplSGlzdG9yeVNpdGVzKGVudHJ5LnNpdGVzKTtcclxuICBjb25zdCBzaXRlQnlJZCA9IG5ldyBNYXAoKHN0YXRlLmFsbFNpdGVzIHx8IFtdKS5tYXAoKHNpdGUpID0+IFtzaXRlLmlkLCBzaXRlXSkpO1xyXG4gIGNvbnN0IHJlc3RvcmVkU2l0ZXMgPSBub3JtYWxpemVkU2l0ZXNcclxuICAgIC5tYXAoKGhpc3RvcnlTaXRlKSA9PiBidWlsZFJlc3RvcmVkU2l0ZShoaXN0b3J5U2l0ZSwgc2l0ZUJ5SWQpKVxyXG4gICAgLmZpbHRlcihCb29sZWFuKTtcclxuXHJcbiAgaWYgKHJlc3RvcmVkU2l0ZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBzZXRRdWVyeUlucHV0VmFsdWUoXCJcIiwgeyBmb2N1czogZmFsc2UgfSk7XHJcbiAgICBjbGVhclJlc3RvcmVIaXN0b3J5UGFyYW1Gcm9tVXJsKCk7XHJcbiAgICByZXR1cm4gZW50cnk7XHJcbiAgfVxyXG5cclxuICBzdGF0ZS5zaXRlcyA9IHJlc3RvcmVkU2l0ZXM7XHJcbiAgc3RhdGUuaGlkZGVuU2l0ZUlkcy5jbGVhcigpO1xyXG4gIHN0YXRlLm1heGltaXplZFNpdGVJZCA9IG51bGw7XHJcbiAgc3RhdGUuYWN0aXZlU2lkZWJhclNpdGVJZCA9IHJlc3RvcmVkU2l0ZXNbMF0/LmlkIHx8IG51bGw7XHJcbiAgc3RhdGUuY3VycmVudEhpc3RvcnlFbnRyeUlkID0gZW50cnkuaWQgfHwgbnVsbDtcclxuICBzdGF0ZS5oaXN0b3J5RW50cnlJZEJ5U2l0ZUlkLmNsZWFyKCk7XHJcbiAgcmVzdG9yZWRTaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBpZiAoc2l0ZT8uaWQgJiYgZW50cnk/LmlkKSB7XHJcbiAgICAgIHN0YXRlLmhpc3RvcnlFbnRyeUlkQnlTaXRlSWQuc2V0KHNpdGUuaWQsIGVudHJ5LmlkKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgc2V0UXVlcnlJbnB1dFZhbHVlKFwiXCIsIHsgZm9jdXM6IGZhbHNlIH0pO1xyXG4gIGNsZWFyUmVzdG9yZUhpc3RvcnlQYXJhbUZyb21VcmwoKTtcclxuICByZXR1cm4gZW50cnk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJ1aWxkUmVzdG9yZWRTaXRlKGhpc3RvcnlTaXRlLCBzaXRlQnlJZCkge1xyXG4gIGNvbnN0IGlkID0gU3RyaW5nKGhpc3RvcnlTaXRlPy5pZCB8fCBcIlwiKS50cmltKCk7XHJcbiAgY29uc3QgbmFtZSA9IFN0cmluZyhoaXN0b3J5U2l0ZT8ubmFtZSB8fCBcIlwiKS50cmltKCkgfHwgXCLmnKrlkb3lkI3nq5nngrlcIjtcclxuICBjb25zdCB1cmwgPSBub3JtYWxpemVSZXN0b3JlZFVybChoaXN0b3J5U2l0ZT8udXJsKTtcclxuICBjb25zdCBiYXNlU2l0ZSA9IHNpdGVCeUlkLmdldChpZCk7XHJcblxyXG4gIGlmIChiYXNlU2l0ZSkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgLi4uYmFzZVNpdGUsXHJcbiAgICAgIHJlc3RvcmVVcmw6IHVybCB8fCBiYXNlU2l0ZS51cmxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBpZiAoIWlkIHx8ICF1cmwpIHtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGlkLFxyXG4gICAgbmFtZSxcclxuICAgIHVybCxcclxuICAgIHJlc3RvcmVVcmw6IHVybCxcclxuICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICBzdXBwb3J0SWZyYW1lOiB0cnVlLFxyXG4gICAgc3VwcG9ydFVybFF1ZXJ5OiBmYWxzZSxcclxuICAgIG1hdGNoUGF0dGVybnM6IFtdLFxyXG4gICAgaXNDdXN0b206IHRydWVcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBub3JtYWxpemVSZXN0b3JlZFVybCh2YWx1ZSkge1xyXG4gIGNvbnN0IHJhdyA9IFN0cmluZyh2YWx1ZSB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCFyYXcpIHJldHVybiBcIlwiO1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHJhdyk7XHJcbiAgICByZXR1cm4gcGFyc2VkLnByb3RvY29sID09PSBcImh0dHA6XCIgfHwgcGFyc2VkLnByb3RvY29sID09PSBcImh0dHBzOlwiID8gcGFyc2VkLnRvU3RyaW5nKCkgOiBcIlwiO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgcmV0dXJuIFwiXCI7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBub3JtYWxpemVIaXN0b3J5U2l0ZXMoc2l0ZXMpIHtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheShzaXRlcylcclxuICAgID8gc2l0ZXMubWFwKChzaXRlLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIGlmICh0eXBlb2Ygc2l0ZSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaWQ6IGBsZWdhY3ktJHtpbmRleH1gLFxyXG4gICAgICAgICAgICBuYW1lOiBzaXRlLFxyXG4gICAgICAgICAgICB1cmw6IFwiXCJcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgaWQ6IFN0cmluZyhzaXRlLmlkIHx8IGBzaXRlLSR7aW5kZXh9YCksXHJcbiAgICAgICAgICBuYW1lOiBTdHJpbmcoc2l0ZS5uYW1lIHx8IFwi5pyq5ZG95ZCN56uZ54K5XCIpLFxyXG4gICAgICAgICAgdXJsOiBTdHJpbmcoc2l0ZS51cmwgfHwgXCJcIilcclxuICAgICAgICB9O1xyXG4gICAgICB9KVxyXG4gICAgOiBbXTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xlYXJSZXN0b3JlSGlzdG9yeVBhcmFtRnJvbVVybCgpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCh3aW5kb3cubG9jYXRpb24uaHJlZik7XHJcbiAgICBpZiAodXJsLnNlYXJjaFBhcmFtcy5oYXMoXCJyZXN0b3JlSGlzdG9yeUlkXCIpKSB7XHJcbiAgICAgIHVybC5zZWFyY2hQYXJhbXMuZGVsZXRlKFwicmVzdG9yZUhpc3RvcnlJZFwiKTtcclxuICAgICAgaGlzdG9yeS5yZXBsYWNlU3RhdGUoe30sIFwiXCIsIHVybC50b1N0cmluZygpKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIC8qIGlnbm9yZSAqL1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUhpc3RvcnlFbnRyeShpZCkge1xyXG4gIHN0YXRlLnNlYXJjaEhpc3RvcnkgPSBzdGF0ZS5zZWFyY2hIaXN0b3J5LmZpbHRlcigoZW50cnkpID0+IGVudHJ5LmlkICE9PSBpZCk7XHJcbiAgZm9yIChjb25zdCBbc2l0ZUlkLCBlbnRyeUlkXSBvZiBzdGF0ZS5oaXN0b3J5RW50cnlJZEJ5U2l0ZUlkLmVudHJpZXMoKSkge1xyXG4gICAgaWYgKGVudHJ5SWQgPT09IGlkKSB7XHJcbiAgICAgIHN0YXRlLmhpc3RvcnlFbnRyeUlkQnlTaXRlSWQuZGVsZXRlKHNpdGVJZCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5jdXJyZW50SGlzdG9yeUVudHJ5SWQgPT09IGlkKSB7XHJcbiAgICBzdGF0ZS5jdXJyZW50SGlzdG9yeUVudHJ5SWQgPSBudWxsO1xyXG4gIH1cclxuICBhd2FpdCBzYXZlUHJlZmVyZW5jZXMoKTtcclxuICByZW5kZXJIaXN0b3J5TGlzdCgpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xlYXJBbGxIaXN0b3J5KCkge1xyXG4gIHN0YXRlLnNlYXJjaEhpc3RvcnkgPSBbXTtcclxuICBzdGF0ZS5jdXJyZW50SGlzdG9yeUVudHJ5SWQgPSBudWxsO1xyXG4gIHN0YXRlLmhpc3RvcnlFbnRyeUlkQnlTaXRlSWQuY2xlYXIoKTtcclxuICBhd2FpdCBzYXZlUHJlZmVyZW5jZXMoKTtcclxuICByZW5kZXJIaXN0b3J5TGlzdCgpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0SGlzdG9yeVRpbWUodmFsdWUpIHtcclxuICBpZiAoIXZhbHVlKSB7XHJcbiAgICByZXR1cm4gXCJcIjtcclxuICB9XHJcblxyXG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XHJcbiAgaWYgKE51bWJlci5pc05hTihkYXRlLmdldFRpbWUoKSkpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRhdGUudG9Mb2NhbGVTdHJpbmcoKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZUxhdGVzdEhpc3RvcnlVcmwoc2l0ZUlkLCB1cmwpIHtcclxuICBjb25zdCBlbnRyeUlkID0gc3RhdGUuaGlzdG9yeUVudHJ5SWRCeVNpdGVJZC5nZXQoc2l0ZUlkKSB8fCBzdGF0ZS5jdXJyZW50SGlzdG9yeUVudHJ5SWQ7XHJcbiAgaWYgKCFzaXRlSWQgfHwgIXVybCB8fCAhZW50cnlJZCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgbGV0IGNoYW5nZWQgPSBmYWxzZTtcclxuICBzdGF0ZS5zZWFyY2hIaXN0b3J5ID0gc3RhdGUuc2VhcmNoSGlzdG9yeS5tYXAoKGVudHJ5KSA9PiB7XHJcbiAgICBpZiAoZW50cnkuaWQgIT09IGVudHJ5SWQgfHwgIUFycmF5LmlzQXJyYXkoZW50cnkuc2l0ZXMpKSB7XHJcbiAgICAgIHJldHVybiBlbnRyeTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB1cGRhdGVkU2l0ZXMgPSBlbnRyeS5zaXRlcy5tYXAoKHNpdGUpID0+IHtcclxuICAgICAgaWYgKCFzaXRlIHx8IHNpdGUuaWQgIT09IHNpdGVJZCB8fCBzaXRlLnVybCA9PT0gdXJsKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpdGU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNoYW5nZWQgPSB0cnVlO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIC4uLnNpdGUsXHJcbiAgICAgICAgdXJsXHJcbiAgICAgIH07XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gY2hhbmdlZCA/IHsgLi4uZW50cnksIHNpdGVzOiB1cGRhdGVkU2l0ZXMgfSA6IGVudHJ5O1xyXG4gIH0pO1xyXG5cclxuICBpZiAoIWNoYW5nZWQpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGF3YWl0IHNhdmVQcmVmZXJlbmNlcygpO1xyXG4gIHJlbmRlckhpc3RvcnlMaXN0KCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBvcGVuSGlzdG9yeVBhbmVsKCkge1xyXG4gIGVsZW1lbnRzLmhpc3RvcnlQYW5lbC5jbGFzc0xpc3QuYWRkKFwiaXMtb3BlblwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNsb3NlSGlzdG9yeVBhbmVsKCkge1xyXG4gIGVsZW1lbnRzLmhpc3RvcnlQYW5lbC5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtb3BlblwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZUhpc3RvcnlQYW5lbCgpIHtcclxuICBpZiAoZWxlbWVudHMuaGlzdG9yeVBhbmVsLmNsYXNzTGlzdC5jb250YWlucyhcImlzLW9wZW5cIikpIHtcclxuICAgIGNsb3NlSGlzdG9yeVBhbmVsKCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIG9wZW5IaXN0b3J5UGFuZWwoKTtcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7IHN0YXRlLCBlbGVtZW50cywgQkFTRV9DT05GSUcgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQgeyBnZXRTZWxlY3RlZFNpdGVzLCBlc2NhcGVIdG1sIH0gZnJvbSBcIi4vdXRpbHMuanNcIjtcclxuaW1wb3J0IHsgc2V0R2xvYmFsU3RhdHVzIH0gZnJvbSBcIi4vc3RhdHVzLmpzXCI7XHJcblxyXG4vLyDmv4DmtLvmu5rliqjlrojljavvvJrlnKggaWZyYW1lIOWKoOi9vSAvIOiHquWKqOWPkemAgeacn+mXtO+8jOmUgeWumuWuueWZqOa7muWKqOS9jee9ru+8jFxyXG4vLyDpmLLmraIgaWZyYW1lIOWGhemDqOi+k+WFpeahhiBmb2N1cygpIOWvvOiHtOeahOelluWFiOWuueWZqFwi5a+56b2Q5Y+v6KeG5Yy6XCLmipbliqjjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGFjdGl2YXRlU2Nyb2xsR3VhcmQobGVmdCwgdG9wLCBkdXJhdGlvbk1zKSB7XHJcbiAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lcjtcclxuXHJcbiAgc3RhdGUuc2Nyb2xsR3VhcmRBY3RpdmUgPSB0cnVlO1xyXG4gIHN0YXRlLnNjcm9sbEd1YXJkTGVmdCA9IGxlZnQ7XHJcbiAgc3RhdGUuc2Nyb2xsR3VhcmRUb3AgPSB0b3A7XHJcbiAgY29udGFpbmVyPy5jbGFzc0xpc3QuYWRkKFwiaXMtc2Nyb2xsLWd1YXJkZWRcIik7XHJcbiAgaWYgKHN0YXRlLnNjcm9sbEd1YXJkVGltZXJJZCkge1xyXG4gICAgd2luZG93LmNsZWFyVGltZW91dChzdGF0ZS5zY3JvbGxHdWFyZFRpbWVySWQpO1xyXG4gIH1cclxuXHJcbiAgc3RhcnRTY3JvbGxHdWFyZExvb3AoKTtcclxuXHJcbiAgc3RhdGUuc2Nyb2xsR3VhcmRUaW1lcklkID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgc3RvcFNjcm9sbEd1YXJkKCk7XHJcbiAgfSwgTWF0aC5tYXgoMTAwMCwgZHVyYXRpb25NcyB8IDApKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RhcnRTY3JvbGxHdWFyZExvb3AoKSB7XHJcbiAgaWYgKHN0YXRlLnNjcm9sbEd1YXJkUmFmSWQpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGNvbnN0IHRpY2sgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyO1xyXG4gICAgaWYgKCFzdGF0ZS5zY3JvbGxHdWFyZEFjdGl2ZSB8fCAhY29udGFpbmVyKSB7XHJcbiAgICAgIHN0YXRlLnNjcm9sbEd1YXJkUmFmSWQgPSBudWxsO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCFzdGF0ZS51c2VySXNTY3JvbGxpbmcpIHtcclxuICAgICAgaWYgKGNvbnRhaW5lci5zY3JvbGxMZWZ0ICE9PSBzdGF0ZS5zY3JvbGxHdWFyZExlZnQpIHtcclxuICAgICAgICBjb250YWluZXIuc2Nyb2xsTGVmdCA9IHN0YXRlLnNjcm9sbEd1YXJkTGVmdDtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY29udGFpbmVyLnNjcm9sbFRvcCAhPT0gc3RhdGUuc2Nyb2xsR3VhcmRUb3ApIHtcclxuICAgICAgICBjb250YWluZXIuc2Nyb2xsVG9wID0gc3RhdGUuc2Nyb2xsR3VhcmRUb3A7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzdGF0ZS5zY3JvbGxHdWFyZFJhZklkID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcclxuICB9O1xyXG5cclxuICBzdGF0ZS5zY3JvbGxHdWFyZFJhZklkID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHN0b3BTY3JvbGxHdWFyZCgpIHtcclxuICBzdGF0ZS5zY3JvbGxHdWFyZEFjdGl2ZSA9IGZhbHNlO1xyXG4gIGlmIChzdGF0ZS5zY3JvbGxHdWFyZFRpbWVySWQpIHtcclxuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoc3RhdGUuc2Nyb2xsR3VhcmRUaW1lcklkKTtcclxuICAgIHN0YXRlLnNjcm9sbEd1YXJkVGltZXJJZCA9IG51bGw7XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5zY3JvbGxHdWFyZFJhZklkKSB7XHJcbiAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoc3RhdGUuc2Nyb2xsR3VhcmRSYWZJZCk7XHJcbiAgICBzdGF0ZS5zY3JvbGxHdWFyZFJhZklkID0gbnVsbDtcclxuICB9XHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lcj8uY2xhc3NMaXN0LnJlbW92ZShcImlzLXNjcm9sbC1ndWFyZGVkXCIpO1xyXG59XHJcblxyXG4vLyDmoLnmja7ljaHniYfmlbDph4/kvLDnrpflrojljavml7bplb/vvJrplJnls7DliqDovb0gMTIwbXMv5LiqICsg6YeN5Z6LIFNQQSDlhrflkK/liqjpnIDopoHnmoTnqLPlrprml7bpl7TjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGdldFNjcm9sbEd1YXJkRHVyYXRpb25NcyhjYXJkQ291bnQpIHtcclxuICBjb25zdCBzdGFnZ2VyTXMgPSAoQkFTRV9DT05GSUcuaWZyYW1lU3RhZ2dlck1zICE9IG51bGwpID8gQkFTRV9DT05GSUcuaWZyYW1lU3RhZ2dlck1zIDogMTIwO1xyXG4gIGNvbnN0IGJhc2UgPSAzMDAwO1xyXG4gIGNvbnN0IGV4dHJhID0gTWF0aC5tYXgoMCwgKGNhcmRDb3VudCB8IDApIC0gMSkgKiBzdGFnZ2VyTXM7XHJcbiAgcmV0dXJuIE1hdGgubWluKGJhc2UgKyBleHRyYSArIDE1MDAsIDgwMDApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlU2Nyb2xsRWRnZUJ0bnMoKSB7XHJcbiAgY29uc3Qgc2hvdyA9IHN0YXRlLmxheW91dFJvd3MgPT09IDEgJiYgc3RhdGUubGF5b3V0TW9kZSAhPT0gXCJzaWRlYmFyXCI7XHJcbiAgY29uc3QgYyA9IGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXI7XHJcbiAgY29uc3QgY2FuU2Nyb2xsSCA9IGMuc2Nyb2xsV2lkdGggPiBjLmNsaWVudFdpZHRoICsgMjtcclxuICBpZiAoZWxlbWVudHMuc2Nyb2xsVG9TdGFydEJ0bikgZWxlbWVudHMuc2Nyb2xsVG9TdGFydEJ0bi5oaWRkZW4gPSAhKHNob3cgJiYgY2FuU2Nyb2xsSCk7XHJcbiAgaWYgKGVsZW1lbnRzLnNjcm9sbFRvRW5kQnRuKSBlbGVtZW50cy5zY3JvbGxUb0VuZEJ0bi5oaWRkZW4gPSAhKHNob3cgJiYgY2FuU2Nyb2xsSCk7XHJcblxyXG4gIGNvbnN0IHNob3dWZXJ0ID0gc3RhdGUubGF5b3V0Um93cyA+IDEgJiYgc3RhdGUubGF5b3V0TW9kZSAhPT0gXCJzaWRlYmFyXCI7XHJcbiAgY29uc3QgY2FuU2Nyb2xsViA9IGMuc2Nyb2xsSGVpZ2h0ID4gYy5jbGllbnRIZWlnaHQgKyAyO1xyXG4gIGlmIChlbGVtZW50cy5zY3JvbGxWZXJ0R3JvdXApIGVsZW1lbnRzLnNjcm9sbFZlcnRHcm91cC5oaWRkZW4gPSAhKHNob3dWZXJ0ICYmIGNhblNjcm9sbFYpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbG9ja0NvbnRhaW5lclNjcm9sbCgpIHtcclxuICBpZiAoIWVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGlmIChzdGF0ZS5sYXlvdXRSb3dzID09PSAxKSB7XHJcbiAgICBzdGF0ZS5sb2NrZWRTY3JvbGxMZWZ0ID0gbnVsbDtcclxuICAgIHN0YXRlLmlzU2Nyb2xsTG9ja2VkID0gZmFsc2U7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBzdGF0ZS5sb2NrZWRTY3JvbGxMZWZ0ID0gZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zY3JvbGxMZWZ0O1xyXG4gIHN0YXRlLmlzU2Nyb2xsTG9ja2VkID0gdHJ1ZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVMb2NrZWRTY3JvbGxQb3NpdGlvbigpIHtcclxuICBpZiAoc3RhdGUubG9ja2VkU2Nyb2xsTGVmdCA9PT0gbnVsbCB8fCAhZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lcikge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zY3JvbGxMZWZ0ID0gc3RhdGUubG9ja2VkU2Nyb2xsTGVmdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNjaGVkdWxlU2Nyb2xsVW5sb2NrKCkge1xyXG4gIGlmIChzdGF0ZS5zY3JvbGxVbmxvY2tUaW1lcklkKSB7XHJcbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHN0YXRlLnNjcm9sbFVubG9ja1RpbWVySWQpO1xyXG4gIH1cclxuXHJcbiAgaWYgKHN0YXRlLmxheW91dFJvd3MgPT09IDEpIHtcclxuICAgIHN0YXRlLmxvY2tlZFNjcm9sbExlZnQgPSBudWxsO1xyXG4gICAgc3RhdGUuaXNTY3JvbGxMb2NrZWQgPSBmYWxzZTtcclxuICAgIHN0YXRlLnNjcm9sbFVubG9ja1RpbWVySWQgPSBudWxsO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgc3RhdGUuc2Nyb2xsVW5sb2NrVGltZXJJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcclxuICAgIHN0YXRlLmxvY2tlZFNjcm9sbExlZnQgPSBudWxsO1xyXG4gICAgc3RhdGUuaXNTY3JvbGxMb2NrZWQgPSBmYWxzZTtcclxuICAgIHN0YXRlLnNjcm9sbFVubG9ja1RpbWVySWQgPSBudWxsO1xyXG4gIH0sIDIyMDApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTGF5b3V0VWkoKSB7XHJcbiAgY29uc3QgYXBwU2hlbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLmFwcC1zaGVsbFwiKTtcclxuXHJcbiAgaWYgKHN0YXRlLmxheW91dE1vZGUgPT09IFwic2lkZWJhclwiKSB7XHJcbiAgICBhcHBTaGVsbD8uY2xhc3NMaXN0LmFkZChcImlzLXNpZGViYXItbW9kZVwiKTtcclxuICAgIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuZGF0YXNldC5sYXlvdXRSb3dzID0gXCJzaWRlYmFyXCI7XHJcbiAgICBpZiAoZWxlbWVudHMuc2l0ZU5hdlBhbmVsKSBlbGVtZW50cy5zaXRlTmF2UGFuZWwuaGlkZGVuID0gZmFsc2U7XHJcbiAgICBpZiAoZWxlbWVudHMuY2FyZFNpemVHcm91cCkgZWxlbWVudHMuY2FyZFNpemVHcm91cC5oaWRkZW4gPSB0cnVlO1xyXG4gICAgZWxlbWVudHMuc2lkZWJhckxheW91dEJ0bj8uY2xhc3NMaXN0LmFkZChcImlzLWFjdGl2ZVwiKTtcclxuICAgIGVsZW1lbnRzLmxheW91dFJvd3NCdXR0b25zLmZvckVhY2goKGJ0bikgPT4gYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1hY3RpdmVcIikpO1xyXG4gICAgZWxlbWVudHMuY2FyZFNpemVCdXR0b25zLmZvckVhY2goKGJ0bikgPT4gYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1hY3RpdmVcIikpO1xyXG4gICAgdXBkYXRlU2Nyb2xsRWRnZUJ0bnMoKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGFwcFNoZWxsPy5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtc2lkZWJhci1tb2RlXCIpO1xyXG4gIGlmIChlbGVtZW50cy5zaXRlTmF2UGFuZWwpIGVsZW1lbnRzLnNpdGVOYXZQYW5lbC5oaWRkZW4gPSB0cnVlO1xyXG4gIGVsZW1lbnRzLnNpZGViYXJMYXlvdXRCdG4/LmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1hY3RpdmVcIik7XHJcbiAgc3RhdGUuY2FyZFJlZnMuZm9yRWFjaCgocmVmKSA9PiB7XHJcbiAgICBpZiAocmVmLmNhcmRFbCkgcmVmLmNhcmRFbC5oaWRkZW4gPSBmYWxzZTtcclxuICB9KTtcclxuXHJcbiAgY29uc3Qgc2luZ2xlUm93V2lkdGhNYXAgPSB7XHJcbiAgICBzbWFsbDogNDgwLFxyXG4gICAgbWVkaXVtOiA2NDAsXHJcbiAgICBsYXJnZTogOTYwXHJcbiAgfTtcclxuICBjb25zdCBzb2NpYWxNZWRpYVdpZHRoTWFwID0ge1xyXG4gICAgc21hbGw6IDY0MCxcclxuICAgIG1lZGl1bTogNzYwLFxyXG4gICAgbGFyZ2U6IDk2MFxyXG4gIH07XHJcblxyXG4gIGxldCBlZmZlY3RpdmVXaWR0aCA9IHNpbmdsZVJvd1dpZHRoTWFwW3N0YXRlLmNhcmRTaXplTGV2ZWxdIHx8IHNpbmdsZVJvd1dpZHRoTWFwLm1lZGl1bTtcclxuICBjb25zdCBzb2NpYWxNZWRpYVdpZHRoID0gc29jaWFsTWVkaWFXaWR0aE1hcFtzdGF0ZS5jYXJkU2l6ZUxldmVsXSB8fCBzb2NpYWxNZWRpYVdpZHRoTWFwLm1lZGl1bTtcclxuICBsZXQgcm93SGVpZ2h0ID0gXCJjYWxjKDEwMHZoIC0gMTYzcHgpXCI7XHJcbiAgaWYgKHN0YXRlLmxheW91dFJvd3MgPiAxKSB7XHJcbiAgICByb3dIZWlnaHQgPSBzdGF0ZS5sYXlvdXRSb3dzID09PSAyXHJcbiAgICAgID8gXCJjYWxjKDEwMHZoIC0gMTU5cHgpXCJcclxuICAgICAgOiBcImNhbGMoMTAwdmggLSAxNzlweClcIjtcclxuICB9XHJcblxyXG4gIHN0YXRlLmxvY2tlZFNjcm9sbExlZnQgPSBudWxsO1xyXG4gIHN0YXRlLmlzU2Nyb2xsTG9ja2VkID0gZmFsc2U7XHJcbiAgaWYgKHN0YXRlLnNjcm9sbFVubG9ja1RpbWVySWQpIHtcclxuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoc3RhdGUuc2Nyb2xsVW5sb2NrVGltZXJJZCk7XHJcbiAgICBzdGF0ZS5zY3JvbGxVbmxvY2tUaW1lcklkID0gbnVsbDtcclxuICB9XHJcblxyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoXCItLWVmZmVjdGl2ZS1jYXJkLXdpZHRoXCIsIGAke2VmZmVjdGl2ZVdpZHRofXB4YCk7XHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tc29jaWFsLW1lZGlhLWNhcmQtd2lkdGhcIiwgYCR7c29jaWFsTWVkaWFXaWR0aH1weGApO1xyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoXCItLXJvdy1oZWlnaHRcIiwgcm93SGVpZ2h0KTtcclxuICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoXCItLWNhcmQtd2lkdGhcIiwgYCR7ZWZmZWN0aXZlV2lkdGh9cHhgKTtcclxuICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLmRhdGFzZXQubGF5b3V0Um93cyA9IFN0cmluZyhzdGF0ZS5sYXlvdXRSb3dzKTtcclxuXHJcbiAgZWxlbWVudHMubGF5b3V0Um93c0J1dHRvbnMuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XHJcbiAgICBidXR0b24uY2xhc3NMaXN0LnRvZ2dsZShcImlzLWFjdGl2ZVwiLCBOdW1iZXIoYnV0dG9uLmRhdGFzZXQubGF5b3V0Um93cykgPT09IHN0YXRlLmxheW91dFJvd3MpO1xyXG4gIH0pO1xyXG5cclxuICBlbGVtZW50cy5jYXJkU2l6ZUJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XHJcbiAgICBidXR0b24uY2xhc3NMaXN0LnRvZ2dsZShcImlzLWFjdGl2ZVwiLCBidXR0b24uZGF0YXNldC5jYXJkU2l6ZSA9PT0gc3RhdGUuY2FyZFNpemVMZXZlbCk7XHJcbiAgfSk7XHJcblxyXG4gIGlmIChlbGVtZW50cy5jYXJkU2l6ZUdyb3VwKSB7XHJcbiAgICBlbGVtZW50cy5jYXJkU2l6ZUdyb3VwLmhpZGRlbiA9IHN0YXRlLmxheW91dFJvd3MgIT09IDE7XHJcbiAgfVxyXG4gIHVwZGF0ZVNjcm9sbEVkZ2VCdG5zKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJTaXRlTmF2KCkge1xyXG4gIGlmICghZWxlbWVudHMuc2l0ZU5hdkxpc3QpIHJldHVybjtcclxuICBlbGVtZW50cy5zaXRlTmF2TGlzdC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gIGNvbnN0IHNlbGVjdGVkU2l0ZXMgPSBnZXRTZWxlY3RlZFNpdGVzKCk7XHJcbiAgc2VsZWN0ZWRTaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gICAgYnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgYnRuLmNsYXNzTmFtZSA9IFwic2l0ZS1uYXYtaXRlbVwiICsgKHNpdGUuaWQgPT09IHN0YXRlLmFjdGl2ZVNpZGViYXJTaXRlSWQgPyBcIiBpcy1hY3RpdmVcIiA6IFwiXCIpO1xyXG4gICAgYnRuLmRhdGFzZXQuc2l0ZUlkID0gc2l0ZS5pZDtcclxuICAgIGJ0bi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJzaXRlLW5hdi1pdGVtLWluZGljYXRvclwiPjwvc3Bhbj48c3Bhbj4ke2VzY2FwZUh0bWwoc2l0ZS5uYW1lKX08L3NwYW4+YDtcclxuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gYWN0aXZhdGVTaWRlYmFyU2l0ZShzaXRlLmlkKSk7XHJcbiAgICBlbGVtZW50cy5zaXRlTmF2TGlzdC5hcHBlbmRDaGlsZChidG4pO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWN0aXZhdGVTaWRlYmFyU2l0ZShzaXRlSWQpIHtcclxuICBzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkID0gc2l0ZUlkO1xyXG4gIHN0YXRlLmNhcmRSZWZzLmZvckVhY2goKHJlZiwgaWQpID0+IHtcclxuICAgIGlmIChyZWYuY2FyZEVsKSByZWYuY2FyZEVsLmhpZGRlbiA9IGlkICE9PSBzaXRlSWQ7XHJcbiAgfSk7XHJcbiAgaWYgKGVsZW1lbnRzLnNpdGVOYXZMaXN0KSB7XHJcbiAgICBlbGVtZW50cy5zaXRlTmF2TGlzdC5xdWVyeVNlbGVjdG9yQWxsKFwiLnNpdGUtbmF2LWl0ZW1cIikuZm9yRWFjaCgoaXRlbSkgPT4ge1xyXG4gICAgICBpdGVtLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1hY3RpdmVcIiwgaXRlbS5kYXRhc2V0LnNpdGVJZCA9PT0gc2l0ZUlkKTtcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuLy8g6aG26YOo5Y2h54mH5a+86Iiq5p2h77ya5pi+56S65b2T5YmN6aG16Z2i5omA5pyJ5Y2h54mH77yM5LiA6ZSu5rua5Yqo5Yiw5a+55bqU5Y2h54mH44CCXHJcbi8vIOS4jeWBmlwi5b2T5YmN5omA5Zyo6aG1XCLnmoTpq5jkuq7ov73ouKrvvIzmjInpkq7lj6rlnKggaG92ZXIg5pe25omN5Lya5pi+6buR5bqV77yM6YG/5YWN5rua5Yqo5pe26Imy5Z2X5Lmx6Lez44CCXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDYXJkTmF2U3RyaXAoKSB7XHJcbiAgY29uc3Qgc3RyaXAgPSBlbGVtZW50cy5jYXJkTmF2U3RyaXA7XHJcbiAgaWYgKCFzdHJpcCkgcmV0dXJuO1xyXG5cclxuICBzdHJpcC5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICBjb25zdCB2aXNpYmxlU2l0ZXMgPSBnZXRTZWxlY3RlZFNpdGVzKCkuZmlsdGVyKChzaXRlKSA9PiBzdGF0ZS5jYXJkUmVmcy5oYXMoc2l0ZS5pZCkpO1xyXG4gIGlmICh2aXNpYmxlU2l0ZXMubGVuZ3RoIDw9IDEpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIHZpc2libGVTaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBjb25zdCBjaGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGNoaXAudHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgICBjaGlwLmNsYXNzTmFtZSA9IFwiY2FyZC1uYXYtY2hpcFwiO1xyXG4gICAgY2hpcC5kYXRhc2V0LnNpdGVJZCA9IHNpdGUuaWQ7XHJcbiAgICBjaGlwLnRleHRDb250ZW50ID0gc2l0ZS5uYW1lO1xyXG4gICAgY2hpcC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICBzY3JvbGxUb0NhcmQoc2l0ZS5pZCk7XHJcbiAgICB9KTtcclxuICAgIHN0cmlwLmFwcGVuZENoaWxkKGNoaXApO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2Nyb2xsVG9DYXJkKHNpdGVJZCkge1xyXG4gIGNvbnN0IHJlZiA9IHN0YXRlLmNhcmRSZWZzLmdldChzaXRlSWQpO1xyXG4gIGlmICghcmVmPy5jYXJkRWwpIHJldHVybjtcclxuXHJcbiAgaWYgKHN0YXRlLmxheW91dE1vZGUgPT09IFwic2lkZWJhclwiKSB7XHJcbiAgICBhY3RpdmF0ZVNpZGViYXJTaXRlKHNpdGVJZCk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBjYXJkID0gcmVmLmNhcmRFbDtcclxuICBjb25zdCBjb250YWluZXIgPSBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyO1xyXG4gIGlmICghY29udGFpbmVyKSByZXR1cm47XHJcblxyXG4gIGNvbnN0IGNhcmRSZWN0ID0gY2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICBjb25zdCBjb250YWluZXJSZWN0ID0gY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG5cclxuICBpZiAoc3RhdGUubGF5b3V0Um93cyA9PT0gMSkge1xyXG4gICAgY29uc3QgdGFyZ2V0ID0gY29udGFpbmVyLnNjcm9sbExlZnQgKyAoY2FyZFJlY3QubGVmdCAtIGNvbnRhaW5lclJlY3QubGVmdCkgLSAxMjtcclxuICAgIGNvbnRhaW5lci5zY3JvbGxUbyh7IGxlZnQ6IE1hdGgubWF4KDAsIHRhcmdldCksIGJlaGF2aW9yOiBcInNtb290aFwiIH0pO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBjb25zdCB0YXJnZXQgPSBjb250YWluZXIuc2Nyb2xsVG9wICsgKGNhcmRSZWN0LnRvcCAtIGNvbnRhaW5lclJlY3QudG9wKSAtIDEyO1xyXG4gICAgY29udGFpbmVyLnNjcm9sbFRvKHsgdG9wOiBNYXRoLm1heCgwLCB0YXJnZXQpLCBiZWhhdmlvcjogXCJzbW9vdGhcIiB9KTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVNYXhpbWl6ZShzaXRlSWQpIHtcclxuICBzdGF0ZS5tYXhpbWl6ZWRTaXRlSWQgPSBzdGF0ZS5tYXhpbWl6ZWRTaXRlSWQgPT09IHNpdGVJZCA/IG51bGwgOiBzaXRlSWQ7XHJcblxyXG4gIHN0YXRlLmNhcmRSZWZzLmZvckVhY2goKHJlZiwgaWQpID0+IHtcclxuICAgIGNvbnN0IGlzTWF4aW1pemVkID0gc3RhdGUubWF4aW1pemVkU2l0ZUlkID09PSBpZDtcclxuICAgIGNvbnN0IHNob3VsZEhpZGUgPSBCb29sZWFuKHN0YXRlLm1heGltaXplZFNpdGVJZCkgJiYgIWlzTWF4aW1pemVkO1xyXG5cclxuICAgIHJlZi5jYXJkRWwuaGlkZGVuID0gc2hvdWxkSGlkZTtcclxuICAgIHJlZi5jYXJkRWwuc3R5bGUuZmxleEJhc2lzID0gaXNNYXhpbWl6ZWQgPyBcImNhbGMoMTAwdncgLSAyOHB4KVwiIDogXCJcIjtcclxuICB9KTtcclxuXHJcbiAgaWYgKHN0YXRlLm1heGltaXplZFNpdGVJZCkge1xyXG4gICAgc2V0R2xvYmFsU3RhdHVzKFwi5b2T5YmN5Y2h54mH5bey5pyA5aSn5YyW5pi+56S644CCXCIpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBzZXRHbG9iYWxTdGF0dXMoYOW3suWKoOi9vSAke2dldFNlbGVjdGVkU2l0ZXMoKS5sZW5ndGh9IOS4quermeeCueOAgmApO1xyXG4gIH1cclxufVxyXG4iLCAiZXhwb3J0IGNvbnN0IFNFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVkgPSBcInNlYXJjaEdyb3Vwc1wiO1xyXG5leHBvcnQgY29uc3QgUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWSA9IFwicHJvbXB0R3JvdXBzXCI7XHJcbmV4cG9ydCBjb25zdCBVSV9QUkVGU19TVE9SQUdFX0tFWSA9IFwidWlQcmVmc1wiO1xyXG5leHBvcnQgY29uc3QgQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZID0gXCJjdXN0b21TaXRlc1wiO1xyXG5leHBvcnQgY29uc3QgUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWSA9IFwicmFuZG9tUXVlc3Rpb25zVGV4dFwiO1xyXG5leHBvcnQgY29uc3QgU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVkgPSBcInNlYXJjaEhpc3RvcnlcIjtcclxuXHJcbi8vIFRoZSBmaXhlZCBcIkFsbFwiIHByb21wdCBncm91cDogYWx3YXlzIGZpcnN0LCBjYW5ub3QgYmUgZGVsZXRlZCBvciByZW5hbWVkLlxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQgPSBcInByb21wdC1ncm91cC1kZWZhdWx0XCI7XHJcbmV4cG9ydCBjb25zdCBMRUdBQ1lfREVGQVVMVF9HUk9VUF9OQU1FID0gXCLpu5jorqTliIbnu4RcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBSQU5ET01fUVVFU1RJT05TX0ZJTEVTID0ge1xyXG4gIHpoOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL3poLUNOLnR4dFwiLFxyXG4gIGVuOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL2VuLnR4dFwiLFxyXG59O1xyXG4iLCAiaW1wb3J0IHsgVUlfUFJFRlNfU1RPUkFHRV9LRVkgfSBmcm9tIFwiLi9zdG9yYWdlLWtleXMuanNcIjtcclxuXHJcbmNvbnN0IERJQUdOT1NUSUNfTE9HX1BSRUZfS0VZID0gXCJkaWFnbm9zdGljTG9nc0VuYWJsZWRcIjtcclxuY29uc3QgTE9HX1BSRUZJWCA9IFwiW1FzaG90IGRpYWdub3N0aWNzXVwiO1xyXG5cclxubGV0IGRpYWdub3N0aWNMb2dzRW5hYmxlZCA9IGZhbHNlO1xyXG5sZXQgaGFzTG9hZGVkUHJlZmVyZW5jZSA9IGZhbHNlO1xyXG5cclxuZnVuY3Rpb24gZ2V0Q2hyb21lU3RvcmFnZSgpIHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIGNocm9tZT8uc3RvcmFnZT8ubG9jYWwgfHwgbnVsbDtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hEaWFnbm9zdGljTG9nUHJlZmVyZW5jZSgpIHtcclxuICBjb25zdCBzdG9yYWdlID0gZ2V0Q2hyb21lU3RvcmFnZSgpO1xyXG4gIGlmICghc3RvcmFnZSkge1xyXG4gICAgZGlhZ25vc3RpY0xvZ3NFbmFibGVkID0gZmFsc2U7XHJcbiAgICBoYXNMb2FkZWRQcmVmZXJlbmNlID0gdHJ1ZTtcclxuICAgIHJldHVybiBkaWFnbm9zdGljTG9nc0VuYWJsZWQ7XHJcbiAgfVxyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3Qgc3RvcmVkID0gYXdhaXQgc3RvcmFnZS5nZXQoW1VJX1BSRUZTX1NUT1JBR0VfS0VZXSk7XHJcbiAgICBkaWFnbm9zdGljTG9nc0VuYWJsZWQgPSBzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldPy5bRElBR05PU1RJQ19MT0dfUFJFRl9LRVldID09PSB0cnVlO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgZGlhZ25vc3RpY0xvZ3NFbmFibGVkID0gZmFsc2U7XHJcbiAgfVxyXG4gIGhhc0xvYWRlZFByZWZlcmVuY2UgPSB0cnVlO1xyXG4gIHJldHVybiBkaWFnbm9zdGljTG9nc0VuYWJsZWQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0RpYWdub3N0aWNMb2dnaW5nRW5hYmxlZCgpIHtcclxuICBpZiAoIWhhc0xvYWRlZFByZWZlcmVuY2UpIHtcclxuICAgIHJlZnJlc2hEaWFnbm9zdGljTG9nUHJlZmVyZW5jZSgpO1xyXG4gIH1cclxuICByZXR1cm4gZGlhZ25vc3RpY0xvZ3NFbmFibGVkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGlhZ25vc3RpY0xvZyhzY29wZSwgZXZlbnROYW1lLCBkZXRhaWxzID0gdW5kZWZpbmVkKSB7XHJcbiAgaWYgKCFpc0RpYWdub3N0aWNMb2dnaW5nRW5hYmxlZCgpKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBsYWJlbCA9IGAke0xPR19QUkVGSVh9ICR7c2NvcGV9OiR7ZXZlbnROYW1lfWA7XHJcbiAgaWYgKGRldGFpbHMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgY29uc29sZS5sb2cobGFiZWwpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBjb25zb2xlLmxvZyhsYWJlbCwgc2FuaXRpemVEaWFnbm9zdGljRGV0YWlscyhkZXRhaWxzKSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhbml0aXplRGlhZ25vc3RpY0RldGFpbHModmFsdWUpIHtcclxuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIikge1xyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG4gIH1cclxuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcclxuICAgIHJldHVybiB2YWx1ZS5tYXAoc2FuaXRpemVEaWFnbm9zdGljRGV0YWlscyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBvdXRwdXQgPSB7fTtcclxuICBPYmplY3QuZW50cmllcyh2YWx1ZSkuZm9yRWFjaCgoW2tleSwgcmF3VmFsdWVdKSA9PiB7XHJcbiAgICBjb25zdCBub3JtYWxpemVkS2V5ID0ga2V5LnRvTG93ZXJDYXNlKCk7XHJcbiAgICBpZiAobm9ybWFsaXplZEtleS5pbmNsdWRlcyhcInF1ZXJ5XCIpIHx8IG5vcm1hbGl6ZWRLZXkuaW5jbHVkZXMoXCJwcm9tcHRcIikgfHwgbm9ybWFsaXplZEtleS5pbmNsdWRlcyhcImNvbnRlbnRcIikpIHtcclxuICAgICAgb3V0cHV0W2tleV0gPSBkZXNjcmliZVRleHRWYWx1ZShyYXdWYWx1ZSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChub3JtYWxpemVkS2V5LmluY2x1ZGVzKFwidXJsXCIpKSB7XHJcbiAgICAgIG91dHB1dFtrZXldID0gcmF3VmFsdWUgPyBcIltyZWRhY3RlZC11cmxdXCIgOiByYXdWYWx1ZTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKGtleSA9PT0gXCJzaXRlXCIgJiYgcmF3VmFsdWUgJiYgdHlwZW9mIHJhd1ZhbHVlID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgIG91dHB1dFtrZXldID0geyBpZDogcmF3VmFsdWUuaWQsIG5hbWU6IHJhd1ZhbHVlLm5hbWUgfTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgb3V0cHV0W2tleV0gPSBzYW5pdGl6ZURpYWdub3N0aWNEZXRhaWxzKHJhd1ZhbHVlKTtcclxuICB9KTtcclxuICByZXR1cm4gb3V0cHV0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZXNjcmliZVRleHRWYWx1ZSh2YWx1ZSkge1xyXG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIpIHtcclxuICAgIHJldHVybiB2YWx1ZSA9PSBudWxsID8gdmFsdWUgOiBcIltyZWRhY3RlZF1cIjtcclxuICB9XHJcbiAgcmV0dXJuIGBbcmVkYWN0ZWQgbGVuZ3RoPSR7dmFsdWUubGVuZ3RofV1gO1xyXG59XHJcblxyXG50cnkge1xyXG4gIHJlZnJlc2hEaWFnbm9zdGljTG9nUHJlZmVyZW5jZSgpO1xyXG4gIGNocm9tZT8uc3RvcmFnZT8ub25DaGFuZ2VkPy5hZGRMaXN0ZW5lcj8uKChjaGFuZ2VzLCBhcmVhTmFtZSkgPT4ge1xyXG4gICAgaWYgKGFyZWFOYW1lICE9PSBcImxvY2FsXCIgfHwgIWNoYW5nZXNbVUlfUFJFRlNfU1RPUkFHRV9LRVldKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IG5leHRQcmVmcyA9IGNoYW5nZXNbVUlfUFJFRlNfU1RPUkFHRV9LRVldLm5ld1ZhbHVlO1xyXG4gICAgZGlhZ25vc3RpY0xvZ3NFbmFibGVkID0gbmV4dFByZWZzPy5bRElBR05PU1RJQ19MT0dfUFJFRl9LRVldID09PSB0cnVlO1xyXG4gICAgaGFzTG9hZGVkUHJlZmVyZW5jZSA9IHRydWU7XHJcbiAgfSk7XHJcbn0gY2F0Y2ggKF9lcnJvcikge1xyXG4gIGRpYWdub3N0aWNMb2dzRW5hYmxlZCA9IGZhbHNlO1xyXG4gIGhhc0xvYWRlZFByZWZlcmVuY2UgPSB0cnVlO1xyXG59XHJcbiIsICIvLyDniLbpobXvvIjogZrlkIjop4blm77vvInkvqfnmoRcIuaWh+S7tuebtOaOpea0vuWPkeWIsOWQhCBBSSDljaHniYdcIumAu+i+keOAglxyXG4vL1xyXG4vLyDorr7orqHlj5boiI3vvJrnlKjmiLfkuIDml6bpgInlpb3mlofku7blsLHnq4vliLvmioogQmxvYiBwb3N0TWVzc2FnZSDliLDmiYDmnInlt7LliqDovb3nmoQgaWZyYW1l77yMXHJcbi8vIGNvbnRlbnQgc2NyaXB0IOWcqOavj+S4quermeeCueeahOi+k+WFpeahhumHjOWQiOaIkCBwYXN0ZSDkuovku7bop6blj5Hnq5nngrnoh6rlt7HnmoRcIueymOi0tOS4iuS8oFwi44CCXHJcbi8vIOi/meenjVwi5LiK5Lyg5LiO5o+Q5Lqk6Kej6ICmXCLnmoTlvaLmgIHlr7nmr5RcIuWQiOW5tuWPkemAgVwi5pyJ5Yeg54K55aW95aSE77yaXHJcbi8vICAgMSkg5paH5Lu25LiK5Lyg6L+H56iL5a+555So5oi35Y+v6KeB77yI5q+P5byg5Y2h54mH6L6T5YWl5qGG5LiK5pa55Ye6546w6ZmE5Lu2IGNoaXDvvInvvIzlj6/op4bljJblj43ppojlvLrvvJtcclxuLy8gICAyKSDkuIrkvKDlrozlhajlvILmraXvvIznrYnnlKjmiLfovpPlrozmlofmnKzngrnlj5HpgIHml7bvvIzmlofku7blpJrljYrlt7Lnu4/kvKDlrozvvIzlj5HpgIHmjInpkq7kuq7lsLHog73nm7TmjqVcclxuLy8gICAgICDngrnvvIzkuI3lho3pnIDopoFcIuWFiCBwYXN0ZSDlho0gc2V0VmFsdWUg5YaNIHdhaXTihpJzdWJtaXRcIumCo+adoeWuueaYk+ivr+inpiBFbnRlciDlhZzlupXnmoRcclxuLy8gICAgICDlkIjlubbot6/lvoTvvJtcclxuLy8gICAzKSDmsqHkvKDlroznmoTljaHniYfkuZ/kuI3lvbHlk43lhbbku5bljaHniYfigJTigJTlj5HpgIHmjInpkq7lpKnnhLYgZGlzYWJsZe+8jOetieS4iuS8oOWujOaJjeS8muS6ruOAglxyXG4vL1xyXG4vLyDov5jmsqHliqDovb3lroznmoTljaHniYfvvIhsb2FkaW5nUmVmcyDph4znmoTvvInkvJrmiorov5nkuIDmibnmlofku7bmjILlnKggcmVmLnBlbmRpbmdGaWxlc09uTG9hZCDkuIrvvIxcclxuLy8gaWZyYW1lIOWKoOi9veS6i+S7tumHjOWGjeihpeWPkeS4gOasoeOAglxyXG5cclxuaW1wb3J0IHsgc3RhdGUsIGVsZW1lbnRzIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgc2V0R2xvYmFsU3RhdHVzIH0gZnJvbSBcIi4vc3RhdHVzLmpzXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVJlcXVlc3RJZCB9IGZyb20gXCIuL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7IGRpYWdub3N0aWNMb2cgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2RpYWdub3N0aWNzLmpzXCI7XHJcblxyXG4vLyDljZXmlofku7bkvZPnp6/kuIrpmZDvvJpwb3N0TWVzc2FnZSDnu5PmnoTljJblhYvpmoYgKyBOIOW8oOWNoeeJh+WQhOaMgeS4gOS7ve+8jOmcgOimgee7meWGheWtmOeVmeS9memHj+OAglxyXG5jb25zdCBNQVhfRklMRV9TSVpFID0gMjUgKiAxMDI0ICogMTAyNDtcclxuLy8g5q+P5qyh6YCJ5Y+W5pyA5aSa5o6l5Y+X55qE5paH5Lu25pWw6YeP44CCXHJcbmNvbnN0IE1BWF9GSUxFU19QRVJfUElDSyA9IDg7XHJcblxyXG5mdW5jdGlvbiBmb3JtYXRTaXplKGJ5dGVzKSB7XHJcbiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoYnl0ZXMpIHx8IGJ5dGVzIDw9IDApIHJldHVybiBcIlwiO1xyXG4gIGlmIChieXRlcyA8IDEwMjQpIHJldHVybiBgJHtieXRlc31CYDtcclxuICBpZiAoYnl0ZXMgPCAxMDI0ICogMTAyNCkgcmV0dXJuIGAkeyhieXRlcyAvIDEwMjQpLnRvRml4ZWQoMSl9S0JgO1xyXG4gIHJldHVybiBgJHsoYnl0ZXMgLyAoMTAyNCAqIDEwMjQpKS50b0ZpeGVkKDEpfU1CYDtcclxufVxyXG5cclxuLy8gRmlsZSDihpIg5Y+v57uT5p6E5YyW5YWL6ZqG55qEIGVudHJ5IOWvueixoeOAguWQjOaXtuW4puS4iiBuYW1lL3R5cGUvc2l6Ze+8jGluamVjdCDkvqfph43lu7ogRmlsZVxyXG4vLyDml7bkuI3kvp3otZYgRmlsZSDoh6rouqvlnKjot6jkuIrkuIvmloflhYvpmoblkI7mmK/lkKbku43kv53nlZnov5nkupvlrZfmrrXjgIJcclxuYXN5bmMgZnVuY3Rpb24gZmlsZVRvRW50cnkoZmlsZSkge1xyXG4gIC8vIOeUqCBBcnJheUJ1ZmZlciDlgZrkuIDmrKHmmL7lvI/mi7fotJ3lho0gd3JhcCDlm54gQmxvYu+8muWOn+WniyBGaWxlIOWcqOafkOS6m+a1j+iniOWZqOeJiOacrOmHjFxyXG4gIC8vIOi3qCBvcmlnaW4g57uT5p6E5YyW5YWL6ZqG5ZCO5Lya5LiiIG5hbWXvvJvmiJHku6zlt7Lnu4/mioogbmFtZSDljZXni6zmjILlnKjlpJblsYIgZW50cnkg5LiK77yMXHJcbiAgLy8g5YaF5bGCIGJsb2Ig5Y+q5L+d55WZ5LqM6L+b5Yi25pys5L2T5Y2z5Y+v44CCXHJcbiAgY29uc3QgYXJyYXlCdWZmZXIgPSBhd2FpdCBmaWxlLmFycmF5QnVmZmVyKCk7XHJcbiAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFthcnJheUJ1ZmZlcl0sIHsgdHlwZTogZmlsZS50eXBlIHx8IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIgfSk7XHJcbiAgcmV0dXJuIHtcclxuICAgIGJsb2IsXHJcbiAgICBuYW1lOiBmaWxlLm5hbWUgfHwgYGZpbGUtJHtEYXRlLm5vdygpfWAsXHJcbiAgICB0eXBlOiBmaWxlLnR5cGUgfHwgXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcclxuICAgIHNpemU6IGZpbGUuc2l6ZSxcclxuICAgIGxhc3RNb2RpZmllZDogZmlsZS5sYXN0TW9kaWZpZWQgfHwgRGF0ZS5ub3coKVxyXG4gIH07XHJcbn1cclxuXHJcbi8vIOe7meWNleS4quWNoeeJh+a0vuWPkeS4gOaJueaWh+S7tuOAguW3suWKoOi9veWwseebtOaOpSBwb3N0TWVzc2FnZe+8m+acquWKoOi9veWwseaMgui1t++8jOetieWNoeeJhyBsb2FkXHJcbi8vIOS6i+S7tuinpuWPkeaXtuWGjeiwg+eUqCBkaXNwYXRjaFBlbmRpbmdGaWxlc0ZvckNhcmTjgIJcclxuZnVuY3Rpb24gZGlzcGF0Y2hGaWxlc1RvQ2FyZChyZWYsIGVudHJpZXMpIHtcclxuICBpZiAoIXJlZiB8fCAhcmVmLmlmcmFtZUVsKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gIGlmICghcmVmLmxvYWRlZCB8fCAhcmVmLmlmcmFtZUVsLmNvbnRlbnRXaW5kb3cpIHtcclxuICAgIGlmICghQXJyYXkuaXNBcnJheShyZWYucGVuZGluZ0ZpbGVzT25Mb2FkKSkge1xyXG4gICAgICByZWYucGVuZGluZ0ZpbGVzT25Mb2FkID0gW107XHJcbiAgICB9XHJcbiAgICByZWYucGVuZGluZ0ZpbGVzT25Mb2FkLnB1c2goLi4uZW50cmllcyk7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5maWxlc1wiLCBcInF1ZXVlZC1mb3ItbG9hZFwiLCB7XHJcbiAgICAgIHNpdGU6IHJlZi5zaXRlLFxyXG4gICAgICBmaWxlQ291bnQ6IGVudHJpZXMubGVuZ3RoLFxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICByZWYuaWZyYW1lRWwuY29udGVudFdpbmRvdy5wb3N0TWVzc2FnZShcclxuICAgICAge1xyXG4gICAgICAgIHR5cGU6IFwiUVNIT1RfUEFTVEVfRklMRVNcIixcclxuICAgICAgICBmaWxlczogZW50cmllcyxcclxuICAgICAgICBzaXRlOiByZWYuc2l0ZSxcclxuICAgICAgICByZXF1ZXN0SWQ6IGNyZWF0ZVJlcXVlc3RJZCgpLFxyXG4gICAgICB9LFxyXG4gICAgICBcIipcIlxyXG4gICAgKTtcclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLmZpbGVzXCIsIFwicG9zdC1tZXNzYWdlXCIsIHtcclxuICAgICAgc2l0ZTogcmVmLnNpdGUsXHJcbiAgICAgIGZpbGVDb3VudDogZW50cmllcy5sZW5ndGgsXHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5maWxlc1wiLCBcInBvc3QtbWVzc2FnZS1lcnJvclwiLCB7XHJcbiAgICAgIHNpdGU6IHJlZi5zaXRlLFxyXG4gICAgICBlcnJvcjogZXJyb3IubWVzc2FnZSxcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxufVxyXG5cclxuLy8g5Y2h54mHIGlmcmFtZSDliqDovb3lrozmiJDml7booqsgY2FyZHMtcmVuZGVyLmpzIOiwg+eUqO+8jOaKiuWFpemYn+acn+mXtOWghuenr+eahOaWh+S7tuihpeWPkeWHuuWOu+OAglxyXG5leHBvcnQgZnVuY3Rpb24gZGlzcGF0Y2hQZW5kaW5nRmlsZXNGb3JDYXJkKHJlZikge1xyXG4gIGlmICghcmVmIHx8ICFBcnJheS5pc0FycmF5KHJlZi5wZW5kaW5nRmlsZXNPbkxvYWQpIHx8IHJlZi5wZW5kaW5nRmlsZXNPbkxvYWQubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIGNvbnN0IGVudHJpZXMgPSByZWYucGVuZGluZ0ZpbGVzT25Mb2FkO1xyXG4gIHJlZi5wZW5kaW5nRmlsZXNPbkxvYWQgPSBbXTtcclxuICBkaXNwYXRjaEZpbGVzVG9DYXJkKHJlZiwgZW50cmllcyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlbGF5KG1zKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGluZ2VzdEZpbGVMaXN0KGZpbGVMaXN0KSB7XHJcbiAgaWYgKCFmaWxlTGlzdCkgcmV0dXJuO1xyXG4gIGNvbnN0IGluY29taW5nID0gQXJyYXkuZnJvbShmaWxlTGlzdCkuc2xpY2UoMCwgTUFYX0ZJTEVTX1BFUl9QSUNLKTtcclxuICBpZiAoaW5jb21pbmcubGVuZ3RoID09PSAwKSByZXR1cm47XHJcblxyXG4gIGNvbnN0IGVudHJpZXMgPSBbXTtcclxuICBmb3IgKGNvbnN0IGZpbGUgb2YgaW5jb21pbmcpIHtcclxuICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBGaWxlKSkgY29udGludWU7XHJcbiAgICBpZiAoZmlsZS5zaXplID4gTUFYX0ZJTEVfU0laRSkge1xyXG4gICAgICB3aW5kb3cuYWxlcnQoYOaWh+S7tiBcIiR7ZmlsZS5uYW1lfVwiIOi2hei/hyAke01BWF9GSUxFX1NJWkUgLyAoMTAyNCAqIDEwMjQpfU1CIOS4iumZkO+8jOW3sui3s+i/h+OAgmApO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIGVudHJpZXMucHVzaChhd2FpdCBmaWxlVG9FbnRyeShmaWxlKSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5maWxlc1wiLCBcInJlYWQtZmFpbGVkXCIsIHsgbmFtZTogZmlsZS5uYW1lLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xyXG5cclxuICAvLyDimIUg6aG65bqP5Liy6KGM5rS+5Y+R77yM57ud5LiN5bm26KGMIOKYhVxyXG4gIC8vXHJcbiAgLy8g5rWP6KeI5Zmo5ZCM5LiA5pe25Yi75Y+q5YWB6K645LiA5LiqIGZyYW1lIOaMgeaciSBkb2N1bWVudCBmb2N1c+OAguWmguaenOaIkeS7rOWvueaJgOaciSBpZnJhbWVcclxuICAvLyDlkIzml7YgcG9zdE1lc3NhZ2XvvIxOIOS4qiBpbmplY3Qg5Lya5ZCM5pe26LCDIGVsZW1lbnQuZm9jdXMoKe+8jOS6kuebuOaKoueEpueCue+8jOWvvOiHtOmZpFxyXG4gIC8vIOS6huafkOS4gOS4qlwi6L+Q5rCU5aW9XCLnmoTvvIjlrp7mtYvmmK8gS2ltaSAvIOiFvuiur+WFg+Wune+8ieS7peWklu+8jOWFtuS7luWNoeeJh+eahCBmb2N1cyDkuI1cclxuICAvLyDnlJ/mlYjvvIxwYXN0ZSDkuovku7bmtL7lj5HliLAgYm9keSDkuIrogIzkuI3mmK/nnJ/mraPnmoTovpPlhaXmoYboioLngrnjgIJcclxuICAvL1xyXG4gIC8vIOS4suihjOWMluiuqeavj+W8oOWNoeeJh+WcqOiHquW3seeahOeql+WPo+acn+mHjOWujOaIkCBmb2N1cyDihpIgd2FpdCDihpIgcGFzdGUg55qE5pW05aWX5rWB56iL77yM6YG/5YWNXHJcbiAgLy8g54Sm54K55oqi5aS677ybZG9jc+OAiuWkmiBBSSDnq5nngrnnu5/kuIDmlofku7bkuIrkvKDvvJrmioDmnK/ot6/nur/liIbmnpDjgIs1LjQg6IqC5Lmf5piO56Gu5o+Q5Yiw6L+ZXHJcbiAgLy8g5LiA57qm5p2f44CCMTIwMG1zIOmXtOmalOeVmee7mSBpbmplY3Qg5L6n55qEIGZvY3VzICsgMjAwbXMgd2FpdCArIHBhc3RlICsg5LiK5Lyg6K+35rGCXHJcbiAgLy8g5Y+R5Ye677yM5YaN5YiH5LiL5LiA5byg5Y2h77yM5pW05L2TIE4g5byg5Y2h54mH5aSn57qmIDEuMk4g56eS5a6M5oiQ5YiG5Y+R44CCXHJcbiAgY29uc3QgdG90YWxTaXplID0gZW50cmllcy5yZWR1Y2UoKHN1bSwgZSkgPT4gc3VtICsgKGUuc2l6ZSB8fCAwKSwgMCk7XHJcbiAgY29uc3QgdGFyZ2V0cyA9IFtdO1xyXG4gIHN0YXRlLmNhcmRSZWZzLmZvckVhY2goKHJlZikgPT4ge1xyXG4gICAgaWYgKHN0YXRlLmhpZGRlblNpdGVJZHMuaGFzKHJlZi5zaXRlLmlkKSkgcmV0dXJuO1xyXG4gICAgdGFyZ2V0cy5wdXNoKHJlZik7XHJcbiAgfSk7XHJcblxyXG4gIHNldEdsb2JhbFN0YXR1cyhcclxuICAgIGDlh4blpIfmioogJHtlbnRyaWVzLmxlbmd0aH0g5Liq5paH5Lu277yIJHtmb3JtYXRTaXplKHRvdGFsU2l6ZSl977yJ5L6d5qyh5Y+R6YCB5YiwICR7dGFyZ2V0cy5sZW5ndGh9IOS4qiBBSSDljaHniYcuLi5gXHJcbiAgKTtcclxuXHJcbiAgbGV0IGRpc3BhdGNoZWRDb3VudCA9IDA7XHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YXJnZXRzLmxlbmd0aDsgaSArPSAxKSB7XHJcbiAgICBjb25zdCByZWYgPSB0YXJnZXRzW2ldO1xyXG4gICAgc2V0R2xvYmFsU3RhdHVzKFxyXG4gICAgICBg5q2j5Zyo5ZCR56ysICR7aSArIDF9LyR7dGFyZ2V0cy5sZW5ndGh9IOS4quWNoeeJh++8iCR7cmVmLnNpdGUubmFtZSB8fCByZWYuc2l0ZS5pZH3vvInlj5HpgIHmlofku7YuLi5gXHJcbiAgICApO1xyXG4gICAgaWYgKGRpc3BhdGNoRmlsZXNUb0NhcmQocmVmLCBlbnRyaWVzKSkge1xyXG4gICAgICBkaXNwYXRjaGVkQ291bnQgKz0gMTtcclxuICAgIH1cclxuICAgIC8vIOe7mSBpbmplY3Qg5L6nIGZvY3VzICsgMjAwbXMgd2FpdCArIHBhc3RlICsg5LiK5Lyg5Yid5aeL5YyW55qE5pe26Ze077yM5YaN5YiH5LiL5LiA5byg5Y2h44CCXHJcbiAgICBpZiAoaSA8IHRhcmdldHMubGVuZ3RoIC0gMSkge1xyXG4gICAgICBhd2FpdCBkZWxheSgxMjAwKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHNldEdsb2JhbFN0YXR1cyhcclxuICAgIGDlt7Llj5HpgIEgJHtlbnRyaWVzLmxlbmd0aH0g5Liq5paH5Lu277yIJHtmb3JtYXRTaXplKHRvdGFsU2l6ZSl977yJ5YiwICR7ZGlzcGF0Y2hlZENvdW50fSDkuKogQUkg5Y2h54mH77yMYCArXHJcbiAgICAgIFwi6K+356iN5YCZ5ZCE5Y2h54mH5a6M5oiQ5LiK5Lyg5ZCO5YaN5o+Q5Lqk6Zeu6aKY44CCXCJcclxuICApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYmluZEZpbGVVcGxvYWRFdmVudHMoKSB7XHJcbiAgY29uc3QgYnRuID0gZWxlbWVudHMuZmlsZVVwbG9hZEJ0bjtcclxuICBjb25zdCBpbnB1dCA9IGVsZW1lbnRzLmZpbGVVcGxvYWRJbnB1dDtcclxuICBjb25zdCB0ZXh0YXJlYSA9IGVsZW1lbnRzLnF1ZXJ5SW5wdXQ7XHJcbiAgaWYgKCFidG4gfHwgIWlucHV0KSByZXR1cm47XHJcblxyXG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgaW5wdXQuY2xpY2soKTtcclxuICB9KTtcclxuXHJcbiAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBhc3luYyAoKSA9PiB7XHJcbiAgICBhd2FpdCBpbmdlc3RGaWxlTGlzdChpbnB1dC5maWxlcyk7XHJcbiAgICBpbnB1dC52YWx1ZSA9IFwiXCI7XHJcbiAgfSk7XHJcblxyXG4gIC8vIOebtOaOpeaKiuaWh+S7tuaLliAvIOeymOi0tOWIsOi+k+WFpeahhu+8muebuOWQjOeahFwi56uL5Y2z5rS+5Y+RXCLor63kuYnjgIJcclxuICBpZiAodGV4dGFyZWEpIHtcclxuICAgIHRleHRhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXCJwYXN0ZVwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgZmlsZXMgPSBldmVudC5jbGlwYm9hcmREYXRhPy5maWxlcztcclxuICAgICAgaWYgKGZpbGVzICYmIGZpbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGluZ2VzdEZpbGVMaXN0KGZpbGVzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGV4dGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImRyYWdvdmVyXCIsIChldmVudCkgPT4ge1xyXG4gICAgICBpZiAoZXZlbnQuZGF0YVRyYW5zZmVyICYmIEFycmF5LmZyb20oZXZlbnQuZGF0YVRyYW5zZmVyLnR5cGVzIHx8IFtdKS5pbmNsdWRlcyhcIkZpbGVzXCIpKSB7XHJcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGV4dGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImRyb3BcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IGZpbGVzID0gZXZlbnQuZGF0YVRyYW5zZmVyPy5maWxlcztcclxuICAgICAgaWYgKGZpbGVzICYmIGZpbGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGluZ2VzdEZpbGVMaXN0KGZpbGVzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyDlhbzlrrnml6flhaXlj6PvvJrku6XliY0gbWFpbi5qcyAvIHNlbmQuanMg5Lya6LCDIHJlbmRlckZpbGVQcmV2aWV3QmFy77yM546w5Zyo5rKh5pyJIGNoaXBcclxuLy8g6aKE6KeI5p2h5LqG77yM5a+85Ye65oiQIG5vb3Ag6K6p5LiK5ri45LiN55So5pS5IGltcG9ydOOAglxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyRmlsZVByZXZpZXdCYXIoKSB7XHJcbiAgLy8gaW50ZW50aW9uYWxseSBlbXB0eVxyXG59XHJcbiIsICJpbXBvcnQgeyBzdGF0ZSwgZWxlbWVudHMgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQgeyBnZXRTZWxlY3RlZFNpdGVzLCBpc1dpZGVNZWRpYVNpdGUsIGlzU29jaWFsTWVkaWFDYXJkU2l0ZSwgYnVpbGRTaXRlVXJsLCBlc2NhcGVIdG1sLCBlbnN1cmVDYXJkc05vdEVtcHR5IH0gZnJvbSBcIi4vdXRpbHMuanNcIjtcclxuaW1wb3J0IHsgc2V0U2l0ZVN0YXR1cywgc2V0R2xvYmFsU3RhdHVzIH0gZnJvbSBcIi4vc3RhdHVzLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgY2xlYXJJZnJhbWVUaW1lcnMsXHJcbiAgcmVtb3ZlRnJvbUxvYWRRdWV1ZSxcclxuICBlbnF1ZXVlTG9hZCxcclxuICBiZWdpbklmcmFtZUxvYWQsXHJcbiAgcmVsZWFzZUxvYWRTbG90LFxyXG59IGZyb20gXCIuL2xvYWQtcXVldWUuanNcIjtcclxuaW1wb3J0IHtcclxuICBhY3RpdmF0ZVNjcm9sbEd1YXJkLFxyXG4gIGdldFNjcm9sbEd1YXJkRHVyYXRpb25NcyxcclxuICByZW5kZXJTaXRlTmF2LFxyXG4gIHJlbmRlckNhcmROYXZTdHJpcCxcclxuICB1cGRhdGVTY3JvbGxFZGdlQnRucyxcclxufSBmcm9tIFwiLi9sYXlvdXQuanNcIjtcclxuaW1wb3J0IHsgZGlzcGF0Y2hTZWFyY2hXaXRoUmV0cmllcywgYWJvcnRQZW5kaW5nV29ya0ZvclNpdGUgfSBmcm9tIFwiLi9zZW5kLmpzXCI7XHJcbmltcG9ydCB7IGRpc3BhdGNoUGVuZGluZ0ZpbGVzRm9yQ2FyZCB9IGZyb20gXCIuL2ZpbGUtdXBsb2FkLmpzXCI7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQ2FyZHMoKSB7XHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuZGF0YXNldC5jb2x1bW5zID0gXCIxXCI7XHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5kYXRhc2V0LmxheW91dFJvd3MgPSBzdGF0ZS5sYXlvdXRNb2RlID09PSBcInNpZGViYXJcIiA/IFwic2lkZWJhclwiIDogU3RyaW5nKHN0YXRlLmxheW91dFJvd3MpO1xyXG4gIHN0YXRlLmNhcmRSZWZzLmNsZWFyKCk7XHJcblxyXG4gIGNvbnN0IHNlbGVjdGVkU2l0ZXMgPSBnZXRTZWxlY3RlZFNpdGVzKCk7XHJcbiAgaWYgKHNlbGVjdGVkU2l0ZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBjb25zdCBlbXB0eVN0YXRlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVtcHR5U3RhdGUuY2xhc3NOYW1lID0gXCJlbXB0eS1zdGF0ZVwiO1xyXG4gICAgZW1wdHlTdGF0ZS50ZXh0Q29udGVudCA9IFwi6K+35YWI6YCJ5oup6Iez5bCR5LiA5Liq56uZ54K544CCXCI7XHJcbiAgICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLmFwcGVuZENoaWxkKGVtcHR5U3RhdGUpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgLy8g5aSa5Y2h54mH5Zy65pmv5LiL5L2/55So5bm25Y+R5qe95L2N57O757uf77yI6KeBIHB1bXBMb2FkUXVldWXvvInvvJpcclxuICAvLyDmiYDmnInljaHniYflhYjmioogRE9NIOW7uuWHuuadpeaPkuWFpeWuueWZqOW5tuWFpemYn++8jOeUseanveS9jeezu+e7n+aMiVxyXG4gIC8vIEJBU0VfQ09ORklHLmlmcmFtZU1heENvbmN1cnJlbnQg6ZmQ5rWB77yM6YG/5YWNIDZ+OCDkuKrph43lnosgU1BBIOWQjOaXtuWGt+WQr+WKqOaJk+a7oSBDUFXjgIJcclxuICBzZWxlY3RlZFNpdGVzLmZvckVhY2goKHNpdGUpID0+IHtcclxuICAgIGNvbnN0IGNhcmQgPSBjcmVhdGVTaXRlQ2FyZChzaXRlKTtcclxuICAgIGlmIChpc1dpZGVNZWRpYVNpdGUoc2l0ZS5pZCkpIHtcclxuICAgICAgY2FyZC5jbGFzc0xpc3QuYWRkKFwiaWZyYW1lLWNhcmQtd2lkZS1tZWRpYVwiKTtcclxuICAgIH1cclxuICAgIGlmIChpc1NvY2lhbE1lZGlhQ2FyZFNpdGUoc2l0ZS5pZCkpIHtcclxuICAgICAgY2FyZC5jbGFzc0xpc3QuYWRkKFwiaWZyYW1lLWNhcmQtc29jaWFsLW1lZGlhXCIpO1xyXG4gICAgfVxyXG4gICAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5hcHBlbmRDaGlsZChjYXJkKTtcclxuICB9KTtcclxuXHJcbiAgaWYgKHN0YXRlLmxheW91dE1vZGUgPT09IFwic2lkZWJhclwiKSB7XHJcbiAgICBpZiAoIXN0YXRlLmFjdGl2ZVNpZGViYXJTaXRlSWQgfHwgIXN0YXRlLmNhcmRSZWZzLmhhcyhzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkKSkge1xyXG4gICAgICBzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkID0gc2VsZWN0ZWRTaXRlc1swXT8uaWQgfHwgbnVsbDtcclxuICAgIH1cclxuICAgIHN0YXRlLmNhcmRSZWZzLmZvckVhY2goKHJlZiwgc2l0ZUlkKSA9PiB7XHJcbiAgICAgIGlmIChyZWYuY2FyZEVsKSByZWYuY2FyZEVsLmhpZGRlbiA9IHNpdGVJZCAhPT0gc3RhdGUuYWN0aXZlU2lkZWJhclNpdGVJZDtcclxuICAgIH0pO1xyXG4gICAgcmVuZGVyU2l0ZU5hdigpO1xyXG4gIH1cclxuXHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zY3JvbGxMZWZ0ID0gMDtcclxuICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbFRvcCA9IDA7XHJcbiAgYWN0aXZhdGVTY3JvbGxHdWFyZCgwLCAwLCBnZXRTY3JvbGxHdWFyZER1cmF0aW9uTXMoc2VsZWN0ZWRTaXRlcy5sZW5ndGgpKTtcclxuICByZW5kZXJDYXJkTmF2U3RyaXAoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNpdGVDYXJkKHNpdGUpIHtcclxuICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFydGljbGVcIik7XHJcbiAgY2FyZC5jbGFzc05hbWUgPSBcImlmcmFtZS1jYXJkXCI7XHJcbiAgY2FyZC5kYXRhc2V0LnNpdGVJZCA9IHNpdGUuaWQ7XHJcbiAgY2FyZC50YWJJbmRleCA9IDA7XHJcbiAgY2FyZC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VlbnRlclwiLCAoKSA9PiB7XHJcbiAgICBjYXJkLmNsYXNzTGlzdC5hZGQoXCJpcy1hY3Rpb25zLXZpc2libGVcIik7XHJcbiAgfSk7XHJcbiAgY2FyZC5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCAoKSA9PiB7XHJcbiAgICBjYXJkLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1hY3Rpb25zLXZpc2libGVcIik7XHJcbiAgfSk7XHJcbiAgY2FyZC5hZGRFdmVudExpc3RlbmVyKFwiZm9jdXNpblwiLCAoKSA9PiB7XHJcbiAgICBjYXJkLmNsYXNzTGlzdC5hZGQoXCJpcy1hY3Rpb25zLXZpc2libGVcIik7XHJcbiAgfSk7XHJcbiAgY2FyZC5hZGRFdmVudExpc3RlbmVyKFwiZm9jdXNvdXRcIiwgKCkgPT4ge1xyXG4gICAgY2FyZC5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtYWN0aW9ucy12aXNpYmxlXCIpO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCB0aXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJoM1wiKTtcclxuICB0aXRsZS5jbGFzc05hbWUgPSBcInNpdGUtdGl0bGVcIjtcclxuICB0aXRsZS50ZXh0Q29udGVudCA9IHNpdGUubmFtZTtcclxuXHJcbiAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYm9keS5jbGFzc05hbWUgPSBcImlmcmFtZS1jYXJkLWJvZHlcIjtcclxuXHJcbiAgY29uc3Qgc3RhdHVzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzdGF0dXMuY2xhc3NOYW1lID0gXCJzaXRlLXN0YXR1cyB2aXN1YWxseS1oaWRkZW5cIjtcclxuICBzdGF0dXMudGV4dENvbnRlbnQgPSBzaXRlLnN1cHBvcnRJZnJhbWVcclxuICAgID8gXCLnrYnlvoUgaWZyYW1lIOWKoOi9vVwiXHJcbiAgICA6IFwi6K+l56uZ54K56buY6K6k5L2/55So5paw5qCH562+6aG15qih5byPXCI7XHJcblxyXG4gIGNvbnN0IGljb25KdW1wID1cclxuICAgICc8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMThcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PHBhdGggZD1cIk0xOCAxM3Y2YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0yVjhhMiAyIDAgMCAxIDItMmg2XCIvPjxwb2x5bGluZSBwb2ludHM9XCIxNSAzIDIxIDMgMjEgOVwiLz48bGluZSB4MT1cIjEwXCIgeTE9XCIxNFwiIHgyPVwiMjFcIiB5Mj1cIjNcIi8+PC9zdmc+JztcclxuICBjb25zdCBpY29uUmVmcmVzaCA9XHJcbiAgICAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjxwYXRoIGQ9XCJNMjMgNHY2aC02XCIvPjxwYXRoIGQ9XCJNMjAuNDkgMTVhOSA5IDAgMSAxLTIuMTItOS4zNkwyMyAxMFwiLz48L3N2Zz4nO1xyXG4gIGNvbnN0IGljb25DbG9zZSA9XHJcbiAgICAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE4XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCIvPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCIvPjwvc3ZnPic7XHJcblxyXG4gIGNvbnN0IGp1bXBCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGp1bXBCdG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAganVtcEJ0bi5jbGFzc05hbWUgPSBcImNhcmQtaG92ZXItYnRuIGNhcmQtaG92ZXItYnRuLWljb25cIjtcclxuICBqdW1wQnRuLmlubmVySFRNTCA9IGljb25KdW1wO1xyXG4gIGp1bXBCdG4uc2V0QXR0cmlidXRlKFwiZGF0YS10b29sdGlwXCIsIFwi6Lez5b6A5Y6f572R56uZXCIpO1xyXG4gIGp1bXBCdG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIui3s+W+gOWOn+e9keermVwiKTtcclxuICBqdW1wQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBjb25zdCByZWYgPSBzdGF0ZS5jYXJkUmVmcy5nZXQoc2l0ZS5pZCk7XHJcbiAgICBjb25zdCB0YXJnZXRVcmwgPSByZWY/LmN1cnJlbnRVcmwgfHwgc2l0ZS51cmw7XHJcbiAgICB3aW5kb3cub3Blbih0YXJnZXRVcmwsIFwiX2JsYW5rXCIsIFwibm9vcGVuZXIsbm9yZWZlcnJlclwiKTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgcmVmcmVzaEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgcmVmcmVzaEJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICByZWZyZXNoQnRuLmNsYXNzTmFtZSA9IFwiY2FyZC1ob3Zlci1idG4gY2FyZC1ob3Zlci1idG4taWNvblwiO1xyXG4gIHJlZnJlc2hCdG4uaW5uZXJIVE1MID0gaWNvblJlZnJlc2g7XHJcbiAgcmVmcmVzaEJ0bi5zZXRBdHRyaWJ1dGUoXCJkYXRhLXRvb2x0aXBcIiwgXCLliLfmlrDlvZPliY3ljaHniYdcIik7XHJcbiAgcmVmcmVzaEJ0bi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwi5Yi35paw5b2T5YmN5Y2h54mHXCIpO1xyXG4gIHJlZnJlc2hCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIGNvbnN0IHJlZiA9IHN0YXRlLmNhcmRSZWZzLmdldChzaXRlLmlkKTtcclxuICAgIGlmIChyZWYpIHtcclxuICAgICAgcmVmcmVzaFNpdGVDYXJkKHJlZik7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBjbG9zZUJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBjbG9zZUJ0bi5jbGFzc05hbWUgPSBcImNhcmQtaG92ZXItYnRuIGNhcmQtaG92ZXItYnRuLWljb25cIjtcclxuICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBpY29uQ2xvc2U7XHJcbiAgY2xvc2VCdG4uc2V0QXR0cmlidXRlKFwiZGF0YS10b29sdGlwXCIsIFwi5YWz6Zet6L+Z5byg5Y2h54mHXCIpO1xyXG4gIGNsb3NlQnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCLlhbPpl63ov5nlvKDljaHniYdcIik7XHJcbiAgY2xvc2VCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIHN0YXRlLmhpZGRlblNpdGVJZHMuYWRkKHNpdGUuaWQpO1xyXG4gICAgLy8g5YWI5oqK5pys5Y2h54mH5bCa5pyq5a6M5oiQ55qE5rS+5Y+R5YWo6YOo5riF55CG5o6J77yaXHJcbiAgICAvLyAxKSBzdGF0ZS5wZW5kaW5nRGlzcGF0Y2hlcyDph4zmjILnnYDnmoQgc2V0VGltZW91dO+8iOm7mOiupOacgOWkmiAzIOasoSDDlyAxMnMg6YeN6K+VIOKJiCAzNnPvvIlcclxuICAgIC8vIDIpIHNlbmRTbWFydFRvU2l0ZSDlnKhcImlmcmFtZSDmnKrliqDovb3lroxcIuaXtuaMgui1t+eahCBwZW5kaW5nUXVlcnlSZXNvbHZlclxyXG4gICAgLy8g5aaC5p6c5LiN5riF77yMUHJvbWlzZS5hbGwg5Lya5LiA55u0IGhhbmfvvIxoYW5kbGVTZW5kU2VsZWN0ZWQg55qEIGlzU2VuZGluZyDop6PkuI3lvIDvvIxVSSDljaHmrbvjgIJcclxuICAgIGFib3J0UGVuZGluZ1dvcmtGb3JTaXRlKHNpdGUuaWQpO1xyXG4gICAgY29uc3QgcmVmID0gc3RhdGUuY2FyZFJlZnMuZ2V0KHNpdGUuaWQpO1xyXG4gICAgaWYgKHJlZj8uY2FyZEVsKSB7XHJcbiAgICAgIHJlZi5jYXJkRWwucmVtb3ZlKCk7XHJcbiAgICB9XHJcbiAgICBzdGF0ZS5jYXJkUmVmcy5kZWxldGUoc2l0ZS5pZCk7XHJcbiAgICBpZiAoc3RhdGUubWF4aW1pemVkU2l0ZUlkID09PSBzaXRlLmlkKSB7XHJcbiAgICAgIHN0YXRlLm1heGltaXplZFNpdGVJZCA9IG51bGw7XHJcbiAgICB9XHJcbiAgICBpZiAoc3RhdGUubGF5b3V0TW9kZSA9PT0gXCJzaWRlYmFyXCIgJiYgc3RhdGUuYWN0aXZlU2lkZWJhclNpdGVJZCA9PT0gc2l0ZS5pZCkge1xyXG4gICAgICBjb25zdCBuZXh0U2l0ZSA9IGdldFNlbGVjdGVkU2l0ZXMoKS5maW5kKChzKSA9PiBzLmlkICE9PSBzaXRlLmlkICYmIHN0YXRlLmNhcmRSZWZzLmhhcyhzLmlkKSk7XHJcbiAgICAgIHN0YXRlLmFjdGl2ZVNpZGViYXJTaXRlSWQgPSBuZXh0U2l0ZT8uaWQgfHwgbnVsbDtcclxuICAgICAgaWYgKHN0YXRlLmFjdGl2ZVNpZGViYXJTaXRlSWQpIHtcclxuICAgICAgICBzdGF0ZS5jYXJkUmVmcy5mb3JFYWNoKChyLCBpZCkgPT4ge1xyXG4gICAgICAgICAgaWYgKHIuY2FyZEVsKSByLmNhcmRFbC5oaWRkZW4gPSBpZCAhPT0gc3RhdGUuYWN0aXZlU2lkZWJhclNpdGVJZDtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICByZW5kZXJTaXRlTmF2KCk7XHJcbiAgICB9XHJcbiAgICBlbnN1cmVDYXJkc05vdEVtcHR5KCk7XHJcbiAgICByZW5kZXJDYXJkTmF2U3RyaXAoKTtcclxuICAgIHNldEdsb2JhbFN0YXR1cyhg5bey5YWz6ZetICR7c2l0ZS5uYW1lfSDljaHniYfjgIJgKTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgaG92ZXJBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBob3ZlckFjdGlvbnMuY2xhc3NOYW1lID0gXCJjYXJkLWhvdmVyLWFjdGlvbnNcIjtcclxuICBob3ZlckFjdGlvbnMuYXBwZW5kQ2hpbGQoanVtcEJ0bik7XHJcbiAgaG92ZXJBY3Rpb25zLmFwcGVuZENoaWxkKHJlZnJlc2hCdG4pO1xyXG4gIGhvdmVyQWN0aW9ucy5hcHBlbmRDaGlsZChjbG9zZUJ0bik7XHJcblxyXG4gIGNvbnN0IGluaXRpYWxVcmwgPSBzaXRlLnJlc3RvcmVVcmwgfHwgc2l0ZS51cmw7XHJcbiAgY29uc3QgcmVmID0ge1xyXG4gICAgc2l0ZSxcclxuICAgIHJlc3RvcmVVcmw6IHNpdGUucmVzdG9yZVVybCB8fCBcIlwiLFxyXG4gICAgY2FyZEVsOiBjYXJkLFxyXG4gICAgc3RhdHVzRWw6IHN0YXR1cyxcclxuICAgIGJvZHlFbDogYm9keSxcclxuICAgIGlmcmFtZUVsOiBudWxsLFxyXG4gICAgbG9hZGluZ0VsOiBudWxsLFxyXG4gICAgaG92ZXJBY3Rpb25FbDogaG92ZXJBY3Rpb25zLFxyXG4gICAganVtcEJ0bkVsOiBqdW1wQnRuLFxyXG4gICAgcmVmcmVzaEJ0bkVsOiByZWZyZXNoQnRuLFxyXG4gICAgY2xvc2VCdG5FbDogY2xvc2VCdG4sXHJcbiAgICBsb2FkZWQ6IGZhbHNlLFxyXG4gICAgcGVuZGluZ1F1ZXJ5OiBcIlwiLFxyXG4gICAgcGVuZGluZ1F1ZXJ5RGVsYXlNczogMCxcclxuICAgIHBlbmRpbmdRdWVyeVJlc29sdmVyOiBudWxsLFxyXG4gICAgcGVuZGluZ0ZpbGVzT25Mb2FkOiBbXSxcclxuICAgIGN1cnJlbnRVcmw6IGluaXRpYWxVcmwsXHJcbiAgICAvLyDmnKzlvKDljaHniYflvZPliY0gaWZyYW1lIOebuOWFs+eahOS4pOS4quWumuaXtuWZqO+8mlxyXG4gICAgLy8gICBsb2FkRGVsYXlUaW1lcklk77ya6ZSZ5bOw5Yqg6L295o6S6Zif5Lit77yM5Yiw54K557uZIGlmcmFtZSDotYsgc3JjXHJcbiAgICAvLyAgIGZhbGxiYWNrVGltZXJJZO+8mui2hei/hyBlbWJlZFRpbWVvdXRNcyDku43mnKrliqDovb3miJDlip/ml7bliIfmjaLliLAgZmFsbGJhY2sg6aG1XHJcbiAgICAvLyDliLfmlrAgLyDlhbPpl63ljaHniYfml7blv4XpobvmuIXnkIbvvIzlkKbliJnml6cgdGltZXIg5Lya5oqK5pawIGlmcmFtZSDouKLmjonmiJblnKjlt7LlhbPpl63ljaHniYfkuIrot5HjgIJcclxuICAgIGxvYWREZWxheVRpbWVySWQ6IG51bGwsXHJcbiAgICBmYWxsYmFja1RpbWVySWQ6IG51bGxcclxuICB9O1xyXG5cclxuICBzdGF0ZS5jYXJkUmVmcy5zZXQoc2l0ZS5pZCwgcmVmKTtcclxuICAvLyDpu5jorqTotbDlubblj5HpmJ/liJfvvIhpbW1lZGlhdGU9ZmFsc2XvvInvvJvosIPnlKjmlrnlj6/pgJrov4cgcmVmcmVzaFNpdGVDYXJkIOS8oCBpbW1lZGlhdGU9dHJ1ZSDotbDnq4vljbPot6/lvoTjgIJcclxuICBjcmVhdGVJZnJhbWVCb2R5KHJlZik7XHJcblxyXG4gIGNhcmQuYXBwZW5kQ2hpbGQodGl0bGUpO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQoYm9keSk7XHJcbiAgY2FyZC5hcHBlbmRDaGlsZChob3ZlckFjdGlvbnMpO1xyXG4gIHJldHVybiBjYXJkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVmcmVzaFNpdGVDYXJkKHJlZiwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgLy8gaW1tZWRpYXRlPXRydWXvvIjpu5jorqTvvInvvJrljZXljaHniYfkuLvliqjliLfmlrDvvIznq4vljbPliqDovb3jgIHkuI3lj5flubblj5Hmp73kvY3pmZDliLbjgIJcclxuICAvLyBpbW1lZGlhdGU9ZmFsc2XvvJogIOaJuemHj+WIt+aWsO+8iOS+i+Wmglwi5paw5bu65a+56K+dXCLvvInvvIznu5/kuIDotbDlubblj5HpmJ/liJfvvIzpgb/lhY3miYDmnInljaHniYflkIzml7blhrflkK/liqjjgIJcclxuICBjb25zdCB7IGltbWVkaWF0ZSA9IHRydWUgfSA9IG9wdGlvbnM7XHJcbiAgcmVmLmxvYWRlZCA9IGZhbHNlO1xyXG4gIHJlZi5wZW5kaW5nUXVlcnkgPSBcIlwiO1xyXG4gIHJlZi5wZW5kaW5nUXVlcnlEZWxheU1zID0gMDtcclxuICByZWYucGVuZGluZ1F1ZXJ5UmVzb2x2ZXIgPSBudWxsO1xyXG4gIHJlZi5wZW5kaW5nRmlsZXNPbkxvYWQgPSBbXTtcclxuICByZWYuaWZyYW1lRWwgPSBudWxsO1xyXG4gIGNyZWF0ZUlmcmFtZUJvZHkocmVmLCB7IGltbWVkaWF0ZSB9KTtcclxuICBzZXRTaXRlU3RhdHVzKHJlZi5zaXRlLmlkLCBcIuato+WcqOmHjeaWsOWKoOi9veKAplwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlmcmFtZUJvZHkocmVmLCBvcHRpb25zID0ge30pIHtcclxuICAvLyBpbW1lZGlhdGU9dHJ1Ze+8mue7lei/h+W5tuWPkeanveS9jeebtOaOpeWKoOi9ve+8iOeUqOaIt+S4u+WKqOWIt+aWsOetieWcuuaZr++8ieOAglxyXG4gIC8vIGltbWVkaWF0ZT1mYWxzZe+8iOm7mOiupO+8ie+8mui1sOmYn+WIl++8jOWPlyBpZnJhbWVNYXhDb25jdXJyZW50IOmZkOWItuOAglxyXG4gIGNvbnN0IHsgaW1tZWRpYXRlID0gZmFsc2UgfSA9IG9wdGlvbnM7XHJcblxyXG4gIC8vIOmHjeW7uiBpZnJhbWUg5LmL5YmN77yM5YWI5oqK5pysIHJlZiDnmoTmiYDmnInljoblj7JcIuaMguS7tlwi6YO95riF55CG5bmy5YeA77yaXHJcbiAgLy8gICAxKSBsb2FkLWRlbGF5IC8gZmFsbGJhY2sg5a6a5pe25ZmoXHJcbiAgLy8gICAyKSDlpoLmnpzov5jlnKjmjpLpmJ8gLyDliqDovb3kuK3vvIzmiormp73kvY3ph4rmlL7mjolcclxuICBjbGVhcklmcmFtZVRpbWVycyhyZWYpO1xyXG4gIHJlbW92ZUZyb21Mb2FkUXVldWUocmVmKTtcclxuICBpZiAoc3RhdGUubG9hZGluZ1JlZnMuaGFzKHJlZikpIHtcclxuICAgIHN0YXRlLmxvYWRpbmdSZWZzLmRlbGV0ZShyZWYpO1xyXG4gICAgLy8g6L+Z5LiA5qyh5LiN56uL5Y2zIHB1bXDvvJrkuIvpnaLkvJrmiormlrAgaWZyYW1lIOWKoOWbnumYn+WIl++8iOaIluebtOaOpeWKoOi9ve+8ie+8jFxyXG4gICAgLy8g6YG/5YWN5Zyo5ZCM5LiAIHRpY2sg6YeM5YWI6YeK5pS+5YaN5Y2g55So6YCg5oiQ55+t5pqC55qEXCLnqbrovazooaXkvY1cIuOAglxyXG4gIH1cclxuXHJcbiAgaWYgKHJlZi5zaXRlLnN1cHBvcnRJZnJhbWUgPT09IGZhbHNlKSB7XHJcbiAgICByZW5kZXJFeHRlcm5hbEZhbGxiYWNrKHJlZik7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBpZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaWZyYW1lXCIpO1xyXG4gIGlmcmFtZS5jbGFzc05hbWUgPSBcImFpLWlmcmFtZVwiO1xyXG4gIGlmcmFtZS5kYXRhc2V0LnNpdGVJZCA9IHJlZi5zaXRlLmlkO1xyXG4gIGlmcmFtZS5sb2FkaW5nID0gXCJlYWdlclwiO1xyXG4gIGlmcmFtZS5hbGxvdyA9IHJlZi5zaXRlLmlkID09PSBcImdyb2tcIlxyXG4gICAgPyBcImNsaXBib2FyZC1yZWFkOyBjbGlwYm9hcmQtd3JpdGU7IGF1dG9wbGF5OyBmdWxsc2NyZWVuOyBwaWN0dXJlLWluLXBpY3R1cmVcIlxyXG4gICAgOiBcImNsaXBib2FyZC1yZWFkOyBjbGlwYm9hcmQtd3JpdGU7IG1pY3JvcGhvbmU7IGNhbWVyYTsgZ2VvbG9jYXRpb247IGF1dG9wbGF5OyBmdWxsc2NyZWVuOyBwaWN0dXJlLWluLXBpY3R1cmU7IHN0b3JhZ2UtYWNjZXNzOyB3ZWItc2hhcmVcIjtcclxuXHJcbiAgY29uc3QgbG9hZFN0YXRlID0geyByZXNvbHZlZDogZmFsc2UgfTtcclxuICByZWYuX2xvYWRTdGF0ZSA9IGxvYWRTdGF0ZTtcclxuICByZWYuX3RhcmdldFNyYyA9IHJlZi5yZXN0b3JlVXJsIHx8IGJ1aWxkU2l0ZVVybChyZWYuc2l0ZSwgXCJcIik7XHJcblxyXG4gIGNvbnN0IGxvYWRpbmcgPSBjcmVhdGVMb2FkaW5nT3ZlcmxheShyZWYuc2l0ZS5uYW1lLCBpbW1lZGlhdGUgPyBcIuato+WcqOWKoOi9veKAplwiIDogXCLnrYnlvoXliqDovb3kuK3igKZcIik7XHJcblxyXG4gIGlmcmFtZS5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XHJcbiAgICAvLyDlrojljasgMe+8mmlmcmFtZSDlj6/og73lt7Looqvmm7/mjaLvvIjliLfmlrAgLyDlhbPpl63vvInvvIzlvZPliY0gcmVmIOS4jeWGjeaMgeaciei/meW8oCBpZnJhbWUg5bCx5b+955Wl44CCXHJcbiAgICBpZiAocmVmLmlmcmFtZUVsICE9PSBpZnJhbWUpIHJldHVybjtcclxuICAgIC8vIOWuiOWNqyAy77ya6L+H5ruk5o6JIGFib3V0OmJsYW5rIOeahOWIneWniyBsb2FkIOS6i+S7tuOAglxyXG4gICAgY29uc3QgY3VycmVudFNyYyA9IGlmcmFtZS5zcmMgfHwgXCJcIjtcclxuICAgIGlmICghY3VycmVudFNyYyB8fCBjdXJyZW50U3JjID09PSBcImFib3V0OmJsYW5rXCIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgbG9hZFN0YXRlLnJlc29sdmVkID0gdHJ1ZTtcclxuICAgIHJlZi5sb2FkZWQgPSB0cnVlO1xyXG4gICAgcmVmLmN1cnJlbnRVcmwgPSBjdXJyZW50U3JjO1xyXG4gICAgY2xlYXJJZnJhbWVUaW1lcnMocmVmKTtcclxuICAgIHJlbGVhc2VMb2FkU2xvdChyZWYpO1xyXG4gICAgaGlkZUxvYWRpbmdPdmVybGF5KHJlZik7XHJcbiAgICBzZXRTaXRlU3RhdHVzKHJlZi5zaXRlLmlkLCBcImlmcmFtZSDlt7LliqDovb3vvIzlj6/nm7TmjqXlnKjljaHniYflhoXmk43kvZzjgIJcIik7XHJcblxyXG4gICAgaWYgKHJlZi5wZW5kaW5nUXVlcnkpIHtcclxuICAgICAgY29uc3QgcXVldWVkUXVlcnkgPSByZWYucGVuZGluZ1F1ZXJ5O1xyXG4gICAgICBjb25zdCBxdWV1ZWREZWxheU1zID0gTnVtYmVyLmlzRmluaXRlKHJlZi5wZW5kaW5nUXVlcnlEZWxheU1zKSA/IHJlZi5wZW5kaW5nUXVlcnlEZWxheU1zIDogMDtcclxuICAgICAgY29uc3QgcXVldWVkUmVzb2x2ZXIgPSByZWYucGVuZGluZ1F1ZXJ5UmVzb2x2ZXI7XHJcbiAgICAgIHJlZi5wZW5kaW5nUXVlcnkgPSBcIlwiO1xyXG4gICAgICByZWYucGVuZGluZ1F1ZXJ5RGVsYXlNcyA9IDA7XHJcbiAgICAgIHJlZi5wZW5kaW5nUXVlcnlSZXNvbHZlciA9IG51bGw7XHJcbiAgICAgIGRpc3BhdGNoU2VhcmNoV2l0aFJldHJpZXMocmVmLCBxdWV1ZWRRdWVyeSwgcXVldWVkRGVsYXlNcylcclxuICAgICAgICAudGhlbigocmVzdWx0KSA9PiB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHF1ZXVlZFJlc29sdmVyID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICAgICAgcXVldWVkUmVzb2x2ZXIocmVzdWx0KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyDljaHniYflnKjliqDovb3lrozmiJDliY3nlKjmiLflj6/og73lt7Lnu4/pgInlpb3kuobmlofku7bvvIxkaXNwYXRjaFBlbmRpbmdGaWxlc0ZvckNhcmRcclxuICAgIC8vIOS8muaKiuaMguWcqCByZWYucGVuZGluZ0ZpbGVzT25Mb2FkIOS4iueahOmCo+S4gOaJueaWh+S7tiBwb3N0TWVzc2FnZSDov5vljrvjgIJcclxuICAgIGRpc3BhdGNoUGVuZGluZ0ZpbGVzRm9yQ2FyZChyZWYpO1xyXG4gIH0pO1xyXG5cclxuICBpZnJhbWUuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHtcclxuICAgIGlmIChyZWYuaWZyYW1lRWwgIT09IGlmcmFtZSkgcmV0dXJuO1xyXG4gICAgaWYgKCFsb2FkU3RhdGUucmVzb2x2ZWQpIHtcclxuICAgICAgbG9hZFN0YXRlLnJlc29sdmVkID0gdHJ1ZTtcclxuICAgICAgY2xlYXJJZnJhbWVUaW1lcnMocmVmKTtcclxuICAgICAgcmVsZWFzZUxvYWRTbG90KHJlZik7XHJcbiAgICAgIHJlbmRlckZhbGxiYWNrKHJlZiwgXCLliqDovb3lpLHotKXvvIznm67moIfnq5nngrnmnKrlk43lupTmiJbmi5Lnu53kuobov57mjqXjgIJcIik7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIC8vIOWFiOaKiiBpZnJhbWUg6IqC54K55o+S5YWlIERPTe+8iOS4jei1iyBzcmPvvInvvIzlho3lhrPlrprotbDnq4vljbPliqDovb3ov5jmmK/lhaXpmJ/jgIJcclxuICByZWYuYm9keUVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgcmVmLmJvZHlFbC5hcHBlbmRDaGlsZChsb2FkaW5nKTtcclxuICByZWYuYm9keUVsLmFwcGVuZENoaWxkKGlmcmFtZSk7XHJcbiAgcmVmLmlmcmFtZUVsID0gaWZyYW1lO1xyXG4gIHJlZi5sb2FkaW5nRWwgPSBsb2FkaW5nO1xyXG5cclxuICBpZiAoaW1tZWRpYXRlKSB7XHJcbiAgICAvLyDnq4vljbPliqDovb3ot6/lvoTkuI3ljaDnlKjmma7pgJrmp73kvY3vvIznlKjmiLfkuLvliqjmk43kvZznnqzml7bnqoHnoLTkuIrpmZDmmK/lj6/mjqXlj5fnmoTjgIJcclxuICAgIHN0YXRlLmxvYWRpbmdSZWZzLmFkZChyZWYpO1xyXG4gICAgYmVnaW5JZnJhbWVMb2FkKHJlZik7XHJcbiAgfSBlbHNlIHtcclxuICAgIGVucXVldWVMb2FkKHJlZik7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyRmFsbGJhY2socmVmLCBtZXNzYWdlKSB7XHJcbiAgLy8g6L+b5YWlIGZhbGxiYWNrIOaEj+WRs+edgOW9k+WJjSBpZnJhbWUg5bey5L2c5bqf77yM5ZCM5pe25pS25o6J5pys5byg5Y2h54mH5q6L55WZ55qE5Yqg6L29L+i2heaXtuWumuaXtuWZqOOAglxyXG4gIGNsZWFySWZyYW1lVGltZXJzKHJlZik7XHJcbiAgcmVmLmxvYWRpbmdFbCA9IG51bGw7XHJcbiAgcmVmLmJvZHlFbC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiZmFsbGJhY2stcGFuZWxcIj5cclxuICAgICAgPGRpdiBjbGFzcz1cIndhcm5pbmctYm94XCI+XHJcbiAgICAgICAgPHN0cm9uZz7lvZPliY3ljaHniYfmnKrog73lrozmiJDltYzlhaU8L3N0cm9uZz5cclxuICAgICAgPC9kaXY+XHJcbiAgICAgIDxwPiR7ZXNjYXBlSHRtbChtZXNzYWdlIHx8IHJlZi5zaXRlLm5vdGVzIHx8IFwi6K+l56uZ54K55Y+v6IO96ZmQ5Yi2IGlmcmFtZSDltYzlhaXjgIJcIil9PC9wPlxyXG4gICAgICA8ZGl2IGNsYXNzPVwiaW5saW5lLWFjdGlvbi1yb3dcIj5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwic2l0ZS1hY3Rpb24tYnRuXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtcmV0cnktbG9hZD7ph43mlrDliqDovb08L2J1dHRvbj5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwic2l0ZS1hY3Rpb24tYnRuXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtb3Blbi1zaXRlPVwiJHtlc2NhcGVIdG1sKHJlZi5zaXRlLnVybCl9XCI+5Zyo5paw5qCH562+6aG15omT5byAPC9idXR0b24+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgYDtcclxuICByZWYuaWZyYW1lRWwgPSBudWxsO1xyXG4gIHJlZi5sb2FkZWQgPSBmYWxzZTtcclxuICBjb25zdCByZXRyeUJ1dHRvbiA9IHJlZi5ib2R5RWwucXVlcnlTZWxlY3RvcihcIltkYXRhLXJldHJ5LWxvYWRdXCIpO1xyXG4gIGlmIChyZXRyeUJ1dHRvbikge1xyXG4gICAgcmV0cnlCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgLy8g55So5oi35Li75Yqo54K55Ye7XCLph43mlrDliqDovb1cIu+8mui1sOeri+WNs+i3r+W+hO+8jOS4jeWPl+W5tuWPkeS4iumZkOmZkOWItuOAglxyXG4gICAgICBjcmVhdGVJZnJhbWVCb2R5KHJlZiwgeyBpbW1lZGlhdGU6IHRydWUgfSk7XHJcbiAgICAgIHNldFNpdGVTdGF0dXMocmVmLnNpdGUuaWQsIFwi5q2j5Zyo6YeN5paw5Yqg6L294oCmXCIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGNvbnN0IG9wZW5CdXR0b24gPSByZWYuYm9keUVsLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1vcGVuLXNpdGVdXCIpO1xyXG4gIGlmIChvcGVuQnV0dG9uKSB7XHJcbiAgICBvcGVuQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIHdpbmRvdy5vcGVuKHJlZi5zaXRlLnVybCwgXCJfYmxhbmtcIiwgXCJub29wZW5lcixub3JlZmVycmVyXCIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGlmIChyZWYuaG92ZXJBY3Rpb25FbCAmJiAhcmVmLmNhcmRFbC5jb250YWlucyhyZWYuaG92ZXJBY3Rpb25FbCkpIHtcclxuICAgIHJlZi5jYXJkRWwuYXBwZW5kQ2hpbGQocmVmLmhvdmVyQWN0aW9uRWwpO1xyXG4gIH1cclxuICBzZXRTaXRlU3RhdHVzKHJlZi5zaXRlLmlkLCBcIuivpeermeeCueaaguaXtuaXoOazleWcqOWNoeeJh+WGheW1jOWFpeOAglwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyRXh0ZXJuYWxGYWxsYmFjayhyZWYpIHtcclxuICByZWYubG9hZGluZ0VsID0gbnVsbDtcclxuICByZWYuaWZyYW1lRWwgPSBudWxsO1xyXG4gIHJlZi5sb2FkZWQgPSBmYWxzZTtcclxuICByZWYuY3VycmVudFVybCA9IHJlZi5yZXN0b3JlVXJsIHx8IGJ1aWxkU2l0ZVVybChyZWYuc2l0ZSwgXCJcIik7XHJcbiAgcmVmLmJvZHlFbC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiZmFsbGJhY2stcGFuZWxcIj5cclxuICAgICAgPGRpdiBjbGFzcz1cIndhcm5pbmctYm94XCI+XHJcbiAgICAgICAgPHN0cm9uZz4ke2VzY2FwZUh0bWwocmVmLnNpdGUubmFtZSl9IOW3suaUueS4uuaWsOagh+etvumhteaooeW8jzwvc3Ryb25nPlxyXG4gICAgICA8L2Rpdj5cclxuICAgICAgPHA+JHtlc2NhcGVIdG1sKHJlZi5zaXRlLm5vdGVzIHx8IFwi6K+l56uZ54K55b2T5YmN5LiN6YCC5ZCI5Zyo5Y2h54mH5YaF5bWM5YWl44CCXCIpfTwvcD5cclxuICAgICAgPGRpdiBjbGFzcz1cImlubGluZS1hY3Rpb24tcm93XCI+XHJcbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInNpdGUtYWN0aW9uLWJ0blwiIHR5cGU9XCJidXR0b25cIiBkYXRhLW9wZW4tc2l0ZT1cIiR7ZXNjYXBlSHRtbChyZWYuY3VycmVudFVybCl9XCI+5Zyo5paw5qCH562+6aG15omT5byAPC9idXR0b24+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgYDtcclxuXHJcbiAgY29uc3Qgb3BlbkJ1dHRvbiA9IHJlZi5ib2R5RWwucXVlcnlTZWxlY3RvcihcIltkYXRhLW9wZW4tc2l0ZV1cIik7XHJcbiAgaWYgKG9wZW5CdXR0b24pIHtcclxuICAgIG9wZW5CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgd2luZG93Lm9wZW4ocmVmLmN1cnJlbnRVcmwgfHwgcmVmLnNpdGUudXJsLCBcIl9ibGFua1wiLCBcIm5vb3BlbmVyLG5vcmVmZXJyZXJcIik7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgaWYgKHJlZi5ob3ZlckFjdGlvbkVsICYmICFyZWYuY2FyZEVsLmNvbnRhaW5zKHJlZi5ob3ZlckFjdGlvbkVsKSkge1xyXG4gICAgcmVmLmNhcmRFbC5hcHBlbmRDaGlsZChyZWYuaG92ZXJBY3Rpb25FbCk7XHJcbiAgfVxyXG4gIHNldFNpdGVTdGF0dXMocmVmLnNpdGUuaWQsIFwi6K+l56uZ54K55bey5pS55Li65paw5qCH562+6aG15qih5byP44CCXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVMb2FkaW5nT3ZlcmxheShzaXRlTmFtZSwgbWVzc2FnZSkge1xyXG4gIGNvbnN0IGxvYWRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxvYWRpbmcuY2xhc3NOYW1lID0gXCJpZnJhbWUtbG9hZGluZy1wYW5lbFwiO1xyXG4gIGxvYWRpbmcuc2V0QXR0cmlidXRlKFwiYXJpYS1saXZlXCIsIFwicG9saXRlXCIpO1xyXG4gIGxvYWRpbmcuaW5uZXJIVE1MID0gYFxyXG4gICAgPGRpdiBjbGFzcz1cImlmcmFtZS1sb2FkaW5nLXNwaW5uZXJcIiBhcmlhLWhpZGRlbj1cInRydWVcIj48L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJpZnJhbWUtbG9hZGluZy10aXRsZVwiPiR7ZXNjYXBlSHRtbChzaXRlTmFtZSl9PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwiaWZyYW1lLWxvYWRpbmctdGV4dFwiPiR7ZXNjYXBlSHRtbChtZXNzYWdlKX08L2Rpdj5cclxuICBgO1xyXG4gIHJldHVybiBsb2FkaW5nO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTG9hZGluZ092ZXJsYXkocmVmLCBtZXNzYWdlKSB7XHJcbiAgY29uc3QgdGV4dEVsID0gcmVmPy5sb2FkaW5nRWw/LnF1ZXJ5U2VsZWN0b3IoXCIuaWZyYW1lLWxvYWRpbmctdGV4dFwiKTtcclxuICBpZiAodGV4dEVsKSB7XHJcbiAgICB0ZXh0RWwudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaGlkZUxvYWRpbmdPdmVybGF5KHJlZikge1xyXG4gIGlmICghcmVmPy5sb2FkaW5nRWwpIHJldHVybjtcclxuICByZWYubG9hZGluZ0VsLmhpZGRlbiA9IHRydWU7XHJcbn1cclxuIiwgImltcG9ydCB7IHN0YXRlLCBCQVNFX0NPTkZJRyB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IHNldFNpdGVTdGF0dXMgfSBmcm9tIFwiLi9zdGF0dXMuanNcIjtcclxuaW1wb3J0IHsgcmVuZGVyRmFsbGJhY2ssIHVwZGF0ZUxvYWRpbmdPdmVybGF5IH0gZnJvbSBcIi4vY2FyZHMtcmVuZGVyLmpzXCI7XHJcblxyXG4vLyDnu5/kuIDmuIXnkIYgcmVmIOS4iueahCBsb2FkLWRlbGF5IOWSjCBmYWxsYmFjayDlrprml7blmajjgIJcclxuLy8g5Zyo6YeN5bu6IGlmcmFtZe+8iOWIt+aWsCAvIOaNoiBzcmPvvInmiJblhbPpl63ljaHniYfkuYvliY3lv4XpobvosIPnlKjkuIDmrKHvvIxcclxuLy8g5ZCm5YiZ5penIGlmcmFtZSDnmoQgZmFsbGJhY2sgdGltZXIg5Lya5ZyoIH4yNXMg5ZCO6Kem5Y+R77yM5oqK5pawIGlmcmFtZSDnm7TmjqXouKLmiJAgZmFsbGJhY2sg6Z2i5p2/44CCXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhcklmcmFtZVRpbWVycyhyZWYpIHtcclxuICBpZiAoIXJlZikgcmV0dXJuO1xyXG4gIGlmIChyZWYubG9hZERlbGF5VGltZXJJZCkge1xyXG4gICAgd2luZG93LmNsZWFyVGltZW91dChyZWYubG9hZERlbGF5VGltZXJJZCk7XHJcbiAgICByZWYubG9hZERlbGF5VGltZXJJZCA9IG51bGw7XHJcbiAgfVxyXG4gIGlmIChyZWYuZmFsbGJhY2tUaW1lcklkKSB7XHJcbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHJlZi5mYWxsYmFja1RpbWVySWQpO1xyXG4gICAgcmVmLmZhbGxiYWNrVGltZXJJZCA9IG51bGw7XHJcbiAgfVxyXG59XHJcblxyXG4vLyDilIDilIAg5bm25Y+R5qe95L2N57O757ufIOKUgOKUgFxyXG4vLyDnm67moIfvvJrlkIzkuIDml7bliLvmnIDlpJrlhYHorrggQkFTRV9DT05GSUcuaWZyYW1lTWF4Q29uY3VycmVudCDlvKAgaWZyYW1lIOecn+ato+WcqOWKoOi9veOAglxyXG4vLyAtIGVucXVldWVMb2FkKHJlZinvvJrlhaXpmJ/vvIzlsJ3or5Xnq4vljbPooaXkvY1cclxuLy8gLSBwdW1wTG9hZFF1ZXVlKCkgIO+8muW9k+anveS9jeepuumXsuaXtu+8jOS7jumYn+mmluWPliByZWYg6LCD55SoIGJlZ2luSWZyYW1lTG9hZFxyXG4vLyAtIGJlZ2luSWZyYW1lTG9hZChyZWYp77ya55yf5q2j57uZIGlmcmFtZSDotYsgc3JjIOW5tuWQr+WKqCBmYWxsYmFjayDlrprml7blmahcclxuLy8gLSByZWxlYXNlTG9hZFNsb3QocmVmKe+8mnJlZiDliqDovb3lrozmiJAv5aSx6LSlL+i2heaXtuaXtumHiuaUvuanveS9je+8jOinpuWPkeS4i+S4gOS4qlxyXG4vLyAtIHJlbW92ZUZyb21Mb2FkUXVldWUocmVmKe+8muS7jumYn+WIl+S4reenu+mZpO+8iOWFs+mXreWNoeeJhyAvIOmHjeW7uuWJjeS9v+eUqO+8iVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVucXVldWVMb2FkKHJlZikge1xyXG4gIGlmICghcmVmKSByZXR1cm47XHJcbiAgaWYgKHN0YXRlLmxvYWRpbmdSZWZzLmhhcyhyZWYpKSByZXR1cm47XHJcbiAgaWYgKHN0YXRlLmxvYWRRdWV1ZS5pbmRleE9mKHJlZikgPj0gMCkgcmV0dXJuO1xyXG4gIHN0YXRlLmxvYWRRdWV1ZS5wdXNoKHJlZik7XHJcbiAgc2V0U2l0ZVN0YXR1cyhyZWYuc2l0ZS5pZCwgXCLnrYnlvoXliqDovb3kuK3igKZcIik7XHJcbiAgdXBkYXRlTG9hZGluZ092ZXJsYXkocmVmLCBcIuetieW+heWKoOi9veS4reKAplwiKTtcclxuICBwdW1wTG9hZFF1ZXVlKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBwdW1wTG9hZFF1ZXVlKCkge1xyXG4gIGNvbnN0IG1heCA9IE1hdGgubWF4KDEsIEJBU0VfQ09ORklHLmlmcmFtZU1heENvbmN1cnJlbnQgfCAwIHx8IDMpO1xyXG4gIGNvbnN0IHN0YWdnZXJNcyA9IChCQVNFX0NPTkZJRy5pZnJhbWVTdGFnZ2VyTXMgIT0gbnVsbCkgPyBCQVNFX0NPTkZJRy5pZnJhbWVTdGFnZ2VyTXMgOiAxMjA7XHJcbiAgLy8g5pys5qyhXCLooaXkvY3miblcIuWGhemDqOS7jeeEtuS/neeVmeW+ruWwj+mUmeWzsO+8jOmBv+WFjeWQjOS4gCB0aWNrIOWkmuS4quS4gOi1t+i1iyBzcmPjgIJcclxuICBsZXQgYmF0Y2hEZWxheSA9IDA7XHJcbiAgd2hpbGUgKHN0YXRlLmxvYWRpbmdSZWZzLnNpemUgPCBtYXggJiYgc3RhdGUubG9hZFF1ZXVlLmxlbmd0aCA+IDApIHtcclxuICAgIGNvbnN0IG5leHQgPSBzdGF0ZS5sb2FkUXVldWUuc2hpZnQoKTtcclxuICAgIC8vIHJlZiDlj6/og73lnKjmjpLpmJ/mnJ/pl7TooqvlhbPpl63jgIHooqvph43lu7rvvJrot7Pov4fml6DmlYjpobnjgIJcclxuICAgIGlmICghbmV4dCB8fCAhbmV4dC5pZnJhbWVFbCB8fCAhc3RhdGUuY2FyZFJlZnMuaGFzKG5leHQuc2l0ZS5pZCkpIHtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICBzdGF0ZS5sb2FkaW5nUmVmcy5hZGQobmV4dCk7XHJcbiAgICBpZiAoYmF0Y2hEZWxheSA9PT0gMCkge1xyXG4gICAgICBiZWdpbklmcmFtZUxvYWQobmV4dCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCB0YXJnZXQgPSBuZXh0O1xyXG4gICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgLy8g5bu26L+f5Yiw54K55pe25YaN5qCh6aqM5LiA6YGN77yM5pyf6Ze05Y+v6IO95bey6KKr5YWz6ZetL+WIt+aWsOOAglxyXG4gICAgICAgIGlmIChzdGF0ZS5sb2FkaW5nUmVmcy5oYXModGFyZ2V0KSAmJiB0YXJnZXQuaWZyYW1lRWwpIHtcclxuICAgICAgICAgIGJlZ2luSWZyYW1lTG9hZCh0YXJnZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSwgYmF0Y2hEZWxheSk7XHJcbiAgICB9XHJcbiAgICBiYXRjaERlbGF5ICs9IHN0YWdnZXJNcztcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZWxlYXNlTG9hZFNsb3QocmVmKSB7XHJcbiAgaWYgKCFyZWYpIHJldHVybjtcclxuICBpZiAoc3RhdGUubG9hZGluZ1JlZnMuaGFzKHJlZikpIHtcclxuICAgIHN0YXRlLmxvYWRpbmdSZWZzLmRlbGV0ZShyZWYpO1xyXG4gIH1cclxuICBwdW1wTG9hZFF1ZXVlKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVGcm9tTG9hZFF1ZXVlKHJlZikge1xyXG4gIGNvbnN0IGlkeCA9IHN0YXRlLmxvYWRRdWV1ZS5pbmRleE9mKHJlZik7XHJcbiAgaWYgKGlkeCA+PSAwKSB7XHJcbiAgICBzdGF0ZS5sb2FkUXVldWUuc3BsaWNlKGlkeCwgMSk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyDnnJ/mraPnu5kgaWZyYW1lIOi1iyBzcmMg5bm25ZCv5YqoIGZhbGxiYWNrIOWumuaXtuWZqOOAglxyXG4vLyDku4XnlLEgZW5xdWV1ZUxvYWQg4oaSIHB1bXBMb2FkUXVldWUg6amx5Yqo77yM5oiW55SxIGltbWVkaWF0ZSDot6/lvoTnm7TmjqXosIPnlKjjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGJlZ2luSWZyYW1lTG9hZChyZWYpIHtcclxuICBjb25zdCBpZnJhbWUgPSByZWY/LmlmcmFtZUVsO1xyXG4gIGNvbnN0IHRhcmdldFNyYyA9IHJlZj8uX3RhcmdldFNyYztcclxuICBpZiAoIWlmcmFtZSB8fCAhdGFyZ2V0U3JjKSByZXR1cm47XHJcbiAgLy8g5p6B56uv5oOF5Ya15LiLIHJlZiDlj6/og73lnKjmjpLpmJ/mnJ/pl7Tooqvmm7/mjaLmiJDmlrAgaWZyYW1l77yM6L+Z6YeM5Lul5b2T5YmNIGlmcmFtZUVsIOS4uuWHhuOAglxyXG4gIGlmcmFtZS5zcmMgPSB0YXJnZXRTcmM7XHJcbiAgc2V0U2l0ZVN0YXR1cyhyZWYuc2l0ZS5pZCwgXCLmraPlnKjliqDovb3igKZcIik7XHJcbiAgdXBkYXRlTG9hZGluZ092ZXJsYXkocmVmLCBcIuato+WcqOWKoOi9veKAplwiKTtcclxuXHJcbiAgLy8gZmFsbGJhY2sg6LaF5pe25LuOXCLnnJ/mraPlvIDlp4vliqDovb1cIueahOaXtuWIu+eul+i1t++8jOWSjOaYr+WQpuaOkui/h+mYn+aXoOWFs+OAglxyXG4gIGNvbnN0IHRpbWVvdXRNcyA9IEJBU0VfQ09ORklHLmVtYmVkVGltZW91dE1zIHx8IDE4MDAwO1xyXG4gIHJlZi5mYWxsYmFja1RpbWVySWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICByZWYuZmFsbGJhY2tUaW1lcklkID0gbnVsbDtcclxuICAgIGlmICghcmVmLl9sb2FkU3RhdGU/LnJlc29sdmVkICYmIHJlZi5pZnJhbWVFbCA9PT0gaWZyYW1lKSB7XHJcbiAgICAgIC8vIOi2heaXtuS5n+eul+S4gOasoVwi57uT5p2fXCLvvIzph4rmlL7mp73kvY3orqnpmJ/liJfnu6fnu63liY3ov5vjgIJcclxuICAgICAgcmVsZWFzZUxvYWRTbG90KHJlZik7XHJcbiAgICAgIHJlbmRlckZhbGxiYWNrKHJlZiwgXCLnq5nngrnmnKrog73lnKjpmZDlrprml7bpl7TlhoXlrozmiJAgaWZyYW1lIOWKoOi9veOAguWPr+iDveS7jeiiq+ebruagh+ermeeCuemZkOWItuW1jOWFpeOAglwiKTtcclxuICAgIH1cclxuICB9LCB0aW1lb3V0TXMpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzdGF0ZSwgU0lURV9DQVRFR09SSUVTIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgZXNjYXBlSHRtbCwgY3JlYXRlUmVxdWVzdElkLCBub3JtYWxpemVRdWVyeUZvck1hdGNoIH0gZnJvbSBcIi4vdXRpbHMuanNcIjtcclxuXHJcbmNvbnN0IEVYVFJBQ1RfVElNRU9VVF9NUyA9IDI1MDA7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2hvd0V4cG9ydE1vZGFsKCkge1xyXG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJleHBvcnRNb2RhbFwiKTtcclxuICBpZiAoZXhpc3RpbmcpIHtcclxuICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgYWlTaXRlSWRzID0gbmV3IFNldChcclxuICAgIChTSVRFX0NBVEVHT1JJRVMuZmluZCgoYykgPT4gYy5pZCA9PT0gXCJhaVwiKT8uYnVpbHRpbklkcykgfHwgW11cclxuICApO1xyXG4gIGNvbnN0IGV4cG9ydGFibGVSZWZzID0gQXJyYXkuZnJvbShzdGF0ZS5jYXJkUmVmcy52YWx1ZXMoKSkuZmlsdGVyKChyZWYpID0+XHJcbiAgICBhaVNpdGVJZHMuaGFzKHJlZj8uc2l0ZT8uaWQpXHJcbiAgKTtcclxuICBjb25zdCBzZWxlY3RlZFNpdGVJZHMgPSBuZXcgU2V0KGV4cG9ydGFibGVSZWZzLm1hcCgocmVmKSA9PiByZWYuc2l0ZS5pZCkpO1xyXG4gIGxldCBzZWxlY3RlZEZvcm1hdCA9IFwibWFya2Rvd25cIjtcclxuXHJcbiAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIG1vZGFsLmlkID0gXCJleHBvcnRNb2RhbFwiO1xyXG4gIG1vZGFsLmNsYXNzTmFtZSA9IFwiZXhwb3J0LW1vZGFsXCI7XHJcbiAgbW9kYWwuaW5uZXJIVE1MID0gYFxyXG4gICAgPGRpdiBjbGFzcz1cImV4cG9ydC1tb2RhbC1jb250ZW50XCI+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJleHBvcnQtbW9kYWwtaGVhZGVyXCI+XHJcbiAgICAgICAgPGgzIGNsYXNzPVwiZXhwb3J0LW1vZGFsLXRpdGxlXCI+5a+85Ye65a+56K+d57uT5p6cPC9oMz5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZXhwb3J0LWNsb3NlLWJ0blwiIHR5cGU9XCJidXR0b25cIiBhcmlhLWxhYmVsPVwi5YWz6ZetXCI+PHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxNVwiIGhlaWdodD1cIjE1XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjxsaW5lIHgxPVwiMThcIiB5MT1cIjZcIiB4Mj1cIjZcIiB5Mj1cIjE4XCIvPjxsaW5lIHgxPVwiNlwiIHkxPVwiNlwiIHgyPVwiMThcIiB5Mj1cIjE4XCIvPjwvc3ZnPjwvYnV0dG9uPlxyXG4gICAgICA8L2Rpdj5cclxuICAgICAgPGRpdiBjbGFzcz1cImV4cG9ydC1ub3RpY2VcIj7lsIbor7vlj5blkITljaHniYflvZPliY3lt7LliqDovb3nmoQgQUkg5Zue562U5YaF5a6577yM57uT5p6c5Y+W5Yaz5LqO6aG16Z2i5Yqg6L2954q25oCB44CCPGJyPuatpOWKn+iDvei/mOWkhOS6jua1i+ivlemYtuaute+8jOWPr+iDveWtmOWcqOWGheWuueaPkOWPluS4jeWujOaVtOaIluagvOW8j+W8guW4uOetiemXrumimOOAgjxicj7ku4XmlK/mjIEgQUkg5qih5Z6L5a+56K+d5a+85Ye644CCPC9kaXY+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJleHBvcnQtbW9kYWwtYm9keVwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJleHBvcnQtc2VjdGlvblwiPlxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cImV4cG9ydC1zZWN0aW9uLXRpdGxlXCI+5a+85Ye65qC85byPPC9kaXY+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiZXhwb3J0LW9wdGlvbi1yb3dcIj5cclxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImV4cG9ydC1vcHRpb24tYnRuIGlzLWFjdGl2ZVwiIGRhdGEtZXhwb3J0LWZvcm1hdD1cIm1hcmtkb3duXCI+TWFya2Rvd248L2J1dHRvbj5cclxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImV4cG9ydC1vcHRpb24tYnRuXCIgZGF0YS1leHBvcnQtZm9ybWF0PVwidHh0XCI+VFhUPC9idXR0b24+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZXhwb3J0LXNlY3Rpb25cIj5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJleHBvcnQtc2VjdGlvbi10aXRsZVwiPumAieaLqeWvvOWHujwvZGl2PlxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cImV4cG9ydC1zaXRlLWxpc3RcIj48L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgPC9kaXY+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJleHBvcnQtYWN0aW9uc1wiPlxyXG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJleHBvcnQtY2FuY2VsLWJ0blwiIHR5cGU9XCJidXR0b25cIj7lj5bmtog8L2J1dHRvbj5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiZXhwb3J0LWNvbmZpcm0tYnRuXCIgdHlwZT1cImJ1dHRvblwiPuWvvOWHujwvYnV0dG9uPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcblxyXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobW9kYWwpO1xyXG5cclxuICBjb25zdCBzaXRlTGlzdCA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIuZXhwb3J0LXNpdGUtbGlzdFwiKTtcclxuICBsZXQgaXNFeHBvcnRpbmcgPSBmYWxzZTtcclxuXHJcbiAgaWYgKGV4cG9ydGFibGVSZWZzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZW1wdHkuY2xhc3NOYW1lID0gXCJleHBvcnQtc2l0ZS1lbXB0eVwiO1xyXG4gICAgZW1wdHkudGV4dENvbnRlbnQgPSBcIuW9k+WJjemhtemdouayoeacieWPr+WvvOWHuueahCBBSSDmqKHlnovljaHniYfjgIJcIjtcclxuICAgIHNpdGVMaXN0LmFwcGVuZENoaWxkKGVtcHR5KTtcclxuICB9IGVsc2Uge1xyXG4gICAgZXhwb3J0YWJsZVJlZnMuZm9yRWFjaCgocmVmKSA9PiB7XHJcbiAgICAgIGNvbnN0IHJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJsYWJlbFwiKTtcclxuICAgICAgcm93LmNsYXNzTmFtZSA9IFwiZXhwb3J0LXNpdGUtaXRlbVwiO1xyXG4gICAgICByb3cuaW5uZXJIVE1MID0gYFxyXG4gICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjaGVja2VkIGRhdGEtc2l0ZS1pZD1cIiR7ZXNjYXBlSHRtbChyZWYuc2l0ZS5pZCl9XCIgLz5cclxuICAgICAgICA8c3Bhbj4ke2VzY2FwZUh0bWwocmVmLnNpdGUubmFtZSl9PC9zcGFuPlxyXG4gICAgICBgO1xyXG5cclxuICAgICAgY29uc3QgY2hlY2tib3ggPSByb3cucXVlcnlTZWxlY3RvcihcImlucHV0XCIpO1xyXG4gICAgICBjaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcclxuICAgICAgICBpZiAoY2hlY2tib3guY2hlY2tlZCkge1xyXG4gICAgICAgICAgc2VsZWN0ZWRTaXRlSWRzLmFkZChyZWYuc2l0ZS5pZCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHNlbGVjdGVkU2l0ZUlkcy5kZWxldGUocmVmLnNpdGUuaWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBzaXRlTGlzdC5hcHBlbmRDaGlsZChyb3cpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBtb2RhbC5xdWVyeVNlbGVjdG9yQWxsKFwiW2RhdGEtZXhwb3J0LWZvcm1hdF1cIikuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XHJcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgc2VsZWN0ZWRGb3JtYXQgPSBidXR0b24uZGF0YXNldC5leHBvcnRGb3JtYXQ7XHJcbiAgICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJbZGF0YS1leHBvcnQtZm9ybWF0XVwiKS5mb3JFYWNoKChpdGVtKSA9PiB7XHJcbiAgICAgICAgaXRlbS5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtYWN0aXZlXCIsIGl0ZW0gPT09IGJ1dHRvbik7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGNsb3NlTW9kYWwgPSAoZm9yY2UgPSBmYWxzZSkgPT4ge1xyXG4gICAgaWYgKGlzRXhwb3J0aW5nICYmICFmb3JjZSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBtb2RhbC5yZW1vdmUoKTtcclxuICB9O1xyXG5cclxuICBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLmV4cG9ydC1jbG9zZS1idG5cIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsb3NlTW9kYWwpO1xyXG4gIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIuZXhwb3J0LWNhbmNlbC1idG5cIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsb3NlTW9kYWwpO1xyXG4gIG1vZGFsLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC50YXJnZXQgPT09IG1vZGFsKSB7XHJcbiAgICAgIGNsb3NlTW9kYWwoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgY29uc3QgY29uZmlybUJ0biA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIuZXhwb3J0LWNvbmZpcm0tYnRuXCIpO1xyXG4gIGNvbnN0IGNhbmNlbEJ0biA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIuZXhwb3J0LWNhbmNlbC1idG5cIik7XHJcbiAgY29uc3Qgbm90aWNlRWwgPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLmV4cG9ydC1ub3RpY2VcIik7XHJcblxyXG4gIGNvbmZpcm1CdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgIGlmIChpc0V4cG9ydGluZykge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoc2VsZWN0ZWRTaXRlSWRzLnNpemUgPT09IDApIHtcclxuICAgICAgbm90aWNlRWwudGV4dENvbnRlbnQgPSBcIuivt+iHs+WwkemAieaLqeS4gOS4quimgeWvvOWHuueahCBBSSDmqKHlnovjgIJcIjtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlzRXhwb3J0aW5nID0gdHJ1ZTtcclxuICAgIGNvbmZpcm1CdG4uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgY2FuY2VsQnRuLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgIGNvbmZpcm1CdG4udGV4dENvbnRlbnQgPSBcIuato+WcqOWvvOWHui4uLlwiO1xyXG4gICAgbm90aWNlRWwudGV4dENvbnRlbnQgPSBg5q2j5Zyo6K+75Y+WICR7c2VsZWN0ZWRTaXRlSWRzLnNpemV9IOS4quWNoeeJh+WGheWuue+8jOivt+eojeWAmS4uLmA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2VzID0gYXdhaXQgY29sbGVjdFZpc2libGVSZXNwb25zZXMoc2VsZWN0ZWRTaXRlSWRzKTtcclxuICAgICAgY29uc3QgY29udGVudCA9IGdlbmVyYXRlRXhwb3J0Q29udGVudChyZXNwb25zZXMsIHNlbGVjdGVkRm9ybWF0LCBzZWxlY3RlZFNpdGVJZHMpO1xyXG4gICAgICBjb25zdCBleHRlbnNpb24gPSBzZWxlY3RlZEZvcm1hdCA9PT0gXCJtYXJrZG93blwiID8gXCJtZFwiIDogc2VsZWN0ZWRGb3JtYXQ7XHJcbiAgICAgIGNvbnN0IG1pbWVUeXBlID0gc2VsZWN0ZWRGb3JtYXQgPT09IFwiaHRtbFwiID8gXCJ0ZXh0L2h0bWxcIiA6IFwidGV4dC9wbGFpblwiO1xyXG4gICAgICBkb3dubG9hZEZpbGUoY29udGVudCwgYnVpbGRFeHBvcnRGaWxlbmFtZShleHRlbnNpb24pLCBtaW1lVHlwZSk7XHJcbiAgICAgIGNsb3NlTW9kYWwodHJ1ZSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBpc0V4cG9ydGluZyA9IGZhbHNlO1xyXG4gICAgICBjb25maXJtQnRuLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICAgIGNhbmNlbEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICBjb25maXJtQnRuLnRleHRDb250ZW50ID0gXCLlr7zlh7pcIjtcclxuICAgICAgbm90aWNlRWwudGV4dENvbnRlbnQgPSBg5a+85Ye65aSx6LSl77yaJHtlcnJvci5tZXNzYWdlIHx8IFwi5pyq55+l6ZSZ6K+vXCJ9YDtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBxdWlja0NhcHR1cmVBbGxSZXNwb25zZXMoKSB7XHJcbiAgY29uc3QgQ0FQVFVSRV9USU1FT1VUID0gMzAwMDtcclxuICBjb25zdCBwcm9taXNlcyA9IFtdO1xyXG4gIGZvciAoY29uc3QgWywgcmVmXSBvZiBzdGF0ZS5jYXJkUmVmcy5lbnRyaWVzKCkpIHtcclxuICAgIGNvbnN0IHAgPSBQcm9taXNlLnJhY2UoW1xyXG4gICAgICBjb2xsZWN0UmVzcG9uc2VGb3JTaXRlKHJlZiksXHJcbiAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PlxyXG4gICAgICAgIHNldFRpbWVvdXQoXHJcbiAgICAgICAgICAoKSA9PlxyXG4gICAgICAgICAgICByZXNvbHZlKHtcclxuICAgICAgICAgICAgICBzaXRlTmFtZTogcmVmLnNpdGUubmFtZSxcclxuICAgICAgICAgICAgICBjb250ZW50OiBcIuaaguacquaPkOWPluWIsOWGheWuuVwiLFxyXG4gICAgICAgICAgICAgIHR1cm5zOiBudWxsLFxyXG4gICAgICAgICAgICAgIHVybDogcmVmLmN1cnJlbnRVcmwgfHwgcmVmLnNpdGUudXJsXHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgQ0FQVFVSRV9USU1FT1VUXHJcbiAgICAgICAgKVxyXG4gICAgICApXHJcbiAgICBdKTtcclxuICAgIHByb21pc2VzLnB1c2gocCk7XHJcbiAgfVxyXG4gIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb2xsZWN0VmlzaWJsZVJlc3BvbnNlcyhzZWxlY3RlZFNpdGVJZHMgPSBudWxsKSB7XHJcbiAgY29uc3QgcmVmcyA9IEFycmF5LmZyb20oc3RhdGUuY2FyZFJlZnMuZW50cmllcygpKVxyXG4gICAgLmZpbHRlcigoW3NpdGVJZF0pID0+ICFzZWxlY3RlZFNpdGVJZHMgfHwgc2VsZWN0ZWRTaXRlSWRzLmhhcyhzaXRlSWQpKVxyXG4gICAgLm1hcCgoWywgcmVmXSkgPT4gcmVmKTtcclxuXHJcbiAgcmV0dXJuIFByb21pc2UuYWxsKHJlZnMubWFwKChyZWYpID0+IGNvbGxlY3RSZXNwb25zZUZvclNpdGUocmVmKSkpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29sbGVjdFJlc3BvbnNlRm9yU2l0ZShyZWYpIHtcclxuICBpZiAoIXJlZi5pZnJhbWVFbCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc2l0ZU5hbWU6IHJlZi5zaXRlLm5hbWUsXHJcbiAgICAgIGNvbnRlbnQ6IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCIsXHJcbiAgICAgIHR1cm5zOiBudWxsLFxyXG4gICAgICB1cmw6IHJlZi5jdXJyZW50VXJsIHx8IHJlZi5zaXRlLnVybFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdElmcmFtZUNvbnRlbnQocmVmLmlmcmFtZUVsLCByZWYuc2l0ZSk7XHJcbiAgaWYgKHJlc3BvbnNlLmNvbnRlbnQgJiYgcmVzcG9uc2UuY29udGVudCAhPT0gXCLmmoLmnKrmj5Dlj5bliLDlhoXlrrlcIikge1xyXG4gICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIC4uLnJlc3BvbnNlLFxyXG4gICAgY29udGVudDogZXh0cmFjdEZhbGxiYWNrQ29udGVudChyZWYpXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RGYWxsYmFja0NvbnRlbnQocmVmKSB7XHJcbiAgaWYgKCFyZWYgfHwgIXJlZi5ib2R5RWwpIHtcclxuICAgIHJldHVybiBcIuaaguacquaPkOWPluWIsOWGheWuuVwiO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZmFsbGJhY2tQYW5lbCA9IHJlZi5ib2R5RWwucXVlcnlTZWxlY3RvcihcIi5mYWxsYmFjay1wYW5lbFwiKTtcclxuICBpZiAoZmFsbGJhY2tQYW5lbCkge1xyXG4gICAgcmV0dXJuIFN0cmluZyhmYWxsYmFja1BhbmVsLnRleHRDb250ZW50IHx8IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCIpLnRyaW0oKSB8fCBcIuaaguacquaPkOWPluWIsOWGheWuuVwiO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJlZi5zdGF0dXNFbD8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBcIuaaguacquaPkOWPluWIsOWGheWuuVwiO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVxdWVzdElmcmFtZUNvbnRlbnQoaWZyYW1lLCBzaXRlKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICBjb25zdCByZXF1ZXN0SWQgPSBjcmVhdGVSZXF1ZXN0SWQoKTtcclxuICAgIGxldCBjb21wbGV0ZWQgPSBmYWxzZTtcclxuICAgIGxldCB0aW1lb3V0SWQgPSBudWxsO1xyXG4gICAgLy8gUmV2aWV3IG5vdGUgKENXUy9FZGdlIEFkZC1vbnMpOlxyXG4gICAgLy8gLSBXZSBvbmx5IHJlcXVlc3QgcmVhZGFibGUgdGV4dCBmcm9tIHRoZSBjYXJkIGlmcmFtZSB3aGVuIHRoZSB1c2VyIHRyaWdnZXJzIEV4cG9ydC9TdW1tYXJ5IGFjdGlvbnMuXHJcbiAgICAvLyAtIFdlIGJpbmQgcmVwbGllcyB0byB0aGUgc3BlY2lmaWMgaWZyYW1lIHZpYSBldmVudC5zb3VyY2UgdG8gcHJldmVudCBvdGhlciBpZnJhbWVzIGZyb20gc3Bvb2ZpbmcgcmVzcG9uc2VzIGFuZCBwb2xsdXRpbmcgZXhwb3J0ZWQgY29udGVudC5cclxuICAgIC8vIOWcqOmXreWMhemHjOW/q+eFpyBjb250ZW50V2luZG9377yM5ZCO57utIGV2ZW50IOagoemqjOS4gOW+i+WvueeFp+i/meS4quW/q+eFp+WBmuadpea6kOWIpOWumuOAglxyXG4gICAgLy8g5Li65LuA5LmI5LiN5ZyoIGhhbmRsZXIg6YeM5q+P5qyh6K+7IGlmcmFtZS5jb250ZW50V2luZG9377yaaWZyYW1lIOiiqyBkZXRhY2gg5ZCO5a6D5Lya5Y+YIG51bGzvvIxcclxuICAgIC8vIOmCo+agt+S7u+S9lSBldmVudC5zb3VyY2Ug6YO95LyaICE9PSBudWxsIOiAjOmAmui/h+agoemqjO+8jOWPjeiAjOWPmOaIkFwi6Zu25qCh6aqMXCLjgIJcclxuICAgIGNvbnN0IGV4cGVjdGVkV2luZG93ID0gaWZyYW1lLmNvbnRlbnRXaW5kb3c7XHJcblxyXG4gICAgY29uc3QgZmluaXNoID0gKHJlc3VsdCkgPT4ge1xyXG4gICAgICBpZiAoY29tcGxldGVkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbXBsZXRlZCA9IHRydWU7XHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBoYW5kbGVyKTtcclxuICAgICAgaWYgKHRpbWVvdXRJZCkge1xyXG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcclxuICAgICAgfVxyXG4gICAgICByZXNvbHZlKHJlc3VsdCk7XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGhhbmRsZXIgPSAoZXZlbnQpID0+IHtcclxuICAgICAgLy8g4pSA4pSAIOWuieWFqOagoemqjO+8muWPquaOpeWPl+adpeiHquacrOasoeaPkOWPluebruaghyBpZnJhbWUg55qE5Zue5omnIOKUgOKUgFxyXG4gICAgICAvLyByZXF1ZXN0SWQg5pivIFVVSUQv6ZqP5py65Liy77yM5Y2V6Z2g5a6D6Jm954S25pS75Ye76ICF6Zq+54yc77yM5L2G5ZCM6aG16Z2i6YeM5YW25a6D5Y2h54mHL+W5v+WRiiBpZnJhbWVcclxuICAgICAgLy8g5LuN54S25Y+v6IO955uR5ZCs5Yiw5raI5oGv5qih5byP5ZCO5ZCR5pys5a+55q+U6aG15Y+R5Lyq6YCg55qEIFFTSE9UX0VYVFJBQ1RfUkVTVUxU77yMXHJcbiAgICAgIC8vIOS7juiAjOaKiuWvvOWHuiAvIOWJqui0tOadvyAvIOaRmOimgemHjOeahOWGheWuueabv+aNouaIkOaUu+WHu+iAheWGmeeahOWtl+espuS4suOAglxyXG4gICAgICAvLyDliqAgZXZlbnQuc291cmNlIOeZveWQjeWNleWQju+8jOWNs+S+v+aUu+WHu+iAheaKouWFiOWbnua2iOaBr++8jOS5n+S8muWboCBzb3VyY2Ug5LiN5Yy56YWN6KKr5Lii5byD44CCXHJcbiAgICAgIGlmIChldmVudC5zb3VyY2UgIT09IGV4cGVjdGVkV2luZG93KSByZXR1cm47XHJcbiAgICAgIGlmICghZXZlbnQuZGF0YSB8fCBldmVudC5kYXRhLnR5cGUgIT09IFwiUVNIT1RfRVhUUkFDVF9SRVNVTFRcIiB8fCBldmVudC5kYXRhLnJlcXVlc3RJZCAhPT0gcmVxdWVzdElkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmaW5pc2goe1xyXG4gICAgICAgIHNpdGVOYW1lOiBzaXRlLm5hbWUsXHJcbiAgICAgICAgY29udGVudDogY2xlYW5FeHRyYWN0ZWRDb250ZW50KGV2ZW50LmRhdGEuY29udGVudCB8fCBcIlwiKSxcclxuICAgICAgICB0dXJuczogQXJyYXkuaXNBcnJheShldmVudC5kYXRhLnR1cm5zKSA/IGV2ZW50LmRhdGEudHVybnMgOiBudWxsLFxyXG4gICAgICAgIHVybDogZXZlbnQuZGF0YS51cmwgfHwgc2l0ZS51cmxcclxuICAgICAgfSk7XHJcbiAgICB9O1xyXG5cclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBoYW5kbGVyKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAvLyDnq5nngrkgaWZyYW1lIOe7j+W4uOS8mui3qCBvcmlnaW4g6YeN5a6a5ZCR77yI5L6L5aaC5YWl5Y+j5Z+f5ZCN6Lez5Yiw55m75b2VL+WvueivneWfn+WQje+8ieOAglxyXG4gICAgICAvLyDkvb/nlKggXCIqXCIg6YG/5YWNIHRhcmdldE9yaWdpbiDov4fmnJ/lr7zoh7Tmtojmga/ooqvpnZnpu5jkuKLlvIPvvJvlm57ljIXku43nlKggZXZlbnQuc291cmNlICsgcmVxdWVzdElkIOagoemqjOOAglxyXG4gICAgICBjb25zdCB0YXJnZXRPcmlnaW4gPSBcIipcIjtcclxuICAgICAgaWZyYW1lLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgIHR5cGU6IFwiUVNIT1RfRVhUUkFDVFwiLFxyXG4gICAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgICBzaXRlXHJcbiAgICAgIH0sIHRhcmdldE9yaWdpbik7XHJcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgICAgZmluaXNoKHtcclxuICAgICAgICBzaXRlTmFtZTogc2l0ZS5uYW1lLFxyXG4gICAgICAgIGNvbnRlbnQ6IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCIsXHJcbiAgICAgICAgdHVybnM6IG51bGwsXHJcbiAgICAgICAgdXJsOiBzaXRlLnVybFxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRpbWVvdXRJZCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgZmluaXNoKHtcclxuICAgICAgICBzaXRlTmFtZTogc2l0ZS5uYW1lLFxyXG4gICAgICAgIGNvbnRlbnQ6IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCIsXHJcbiAgICAgICAgdHVybnM6IG51bGwsXHJcbiAgICAgICAgdXJsOiBzaXRlLnVybFxyXG4gICAgICB9KTtcclxuICAgIH0sIEVYVFJBQ1RfVElNRU9VVF9NUyk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhbkV4dHJhY3RlZENvbnRlbnQoY29udGVudCkge1xyXG4gIGNvbnN0IHRleHQgPSBTdHJpbmcoY29udGVudCB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCF0ZXh0KSB7XHJcbiAgICByZXR1cm4gXCLmmoLmnKrmj5Dlj5bliLDlhoXlrrlcIjtcclxuICB9XHJcblxyXG4gIGNvbnN0IGp1bmtQYXR0ZXJuID0gL3dpbmRvd1xcLl9ffFxcYnJlcXVlc3RBbmltYXRpb25GcmFtZVxcYnxmdW5jdGlvblxccypcXCh8J3VzZSBzdHJpY3QnfFwidXNlIHN0cmljdFwifHRoZW1lLWhvc3R8X193ZWJwYWNrfF9fTkVYVF9EQVRBX198Z3RhZ1xcKHxnYVxcKC9pO1xyXG5cclxuICBjb25zdCBsaW5lcyA9IHRleHRcclxuICAgIC5zcGxpdCgvXFxyP1xcbi8pXHJcbiAgICAubWFwKChsaW5lKSA9PiBsaW5lLnRyaW1FbmQoKSlcclxuICAgIC5maWx0ZXIoKGxpbmUpID0+ICFqdW5rUGF0dGVybi50ZXN0KGxpbmUpKVxyXG4gICAgLmZpbHRlcigobGluZSwgaW5kZXgsIGFycikgPT4gIShsaW5lID09PSBcIlwiICYmIGFycltpbmRleCAtIDFdID09PSBcIlwiKSk7XHJcblxyXG4gIGNvbnN0IHJlc3VsdCA9IGxpbmVzLmpvaW4oXCJcXG5cIikudHJpbSgpO1xyXG4gIHJldHVybiByZXN1bHQgfHwgdGV4dC5zbGljZSgwLCA2MDAwKSB8fCBcIuaaguacquaPkOWPluWIsOWGheWuuVwiO1xyXG59XHJcblxyXG4vKipcclxuICog5a+85Ye655So77ya5Y675o6J5q2j5paH6YeM55qEICPvvZ4jIyMjIyMg5qCH6aKY6K+t5rOV77yM5pS55Li65Yqg57KX6KGM77yM6YG/5YWN5LiO5aSW5bGC44CM6Zeu6aKYIC8g5qih5Z6L44CN5qCH6aKY5bGC57qn5Yay56qB77ybXHJcbiAqIOS/neeVmeWIl+ihqOOAgeWKoOeyl+etie+8m+WQiOW5tui/h+WkmuepuuihjOS4uuOAjOauteiQveS5i+mXtOepuuS4gOihjOOAjeOAglxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZsYXR0ZW5FeHBvcnRCb2R5TWFya2Rvd24ocmF3KSB7XHJcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhyYXcgfHwgXCJcIikudHJpbSgpO1xyXG4gIGlmICghdGV4dCB8fCB0ZXh0ID09PSBcIuaaguacquaPkOWPluWIsOWGheWuuVwiKSB7XHJcbiAgICByZXR1cm4gdGV4dCB8fCBcIuaaguacquaPkOWPluWIsOWGheWuuVwiO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KC9cXHI/XFxuLyk7XHJcbiAgY29uc3Qgb3V0ID0gW107XHJcbiAgbGV0IGluQ29kZUZlbmNlID0gZmFsc2U7XHJcbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XHJcbiAgICBjb25zdCB0cmltbWVkRW5kID0gbGluZS50cmltRW5kKCk7XHJcbiAgICBjb25zdCB0cmltbWVkID0gdHJpbW1lZEVuZC50cmltKCk7XHJcbiAgICBpZiAodHJpbW1lZC5zdGFydHNXaXRoKFwiYGBgXCIpKSB7XHJcbiAgICAgIGluQ29kZUZlbmNlID0gIWluQ29kZUZlbmNlO1xyXG4gICAgICBvdXQucHVzaCh0cmltbWVkRW5kKTtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcbiAgICBpZiAoaW5Db2RlRmVuY2UpIHtcclxuICAgICAgb3V0LnB1c2godHJpbW1lZEVuZCk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgY29uc3QgaGVhZGluZ01hdGNoID0gdHJpbW1lZEVuZC5tYXRjaCgvXigjezEsNn0pXFxzKyguKykkLyk7XHJcbiAgICBpZiAoaGVhZGluZ01hdGNoKSB7XHJcbiAgICAgIGNvbnN0IHRpdGxlID0gaGVhZGluZ01hdGNoWzJdLnRyaW0oKTtcclxuICAgICAgb3V0LnB1c2goYCoqJHt0aXRsZX0qKmApO1xyXG4gICAgICBvdXQucHVzaChcIlwiKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIG91dC5wdXNoKHRyaW1tZWRFbmQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IHJlc3VsdCA9IG91dC5qb2luKFwiXFxuXCIpO1xyXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9cXG57Myx9L2csIFwiXFxuXFxuXCIpLnRyaW0oKTtcclxuICByZXR1cm4gcmVzdWx0IHx8IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBidWlsZEV4cG9ydFNlY3Rpb25zRnJvbUNvbnZlcnNhdGlvbnMoY2FyZERhdGEpIHtcclxuICBjb25zdCBjYXJkc1dpdGhUdXJucyA9IGNhcmREYXRhLmZpbHRlcigoYykgPT4gQXJyYXkuaXNBcnJheShjLnR1cm5zKSAmJiBjLnR1cm5zLmxlbmd0aCA+IDApO1xyXG4gIGlmIChjYXJkc1dpdGhUdXJucy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG5cclxuICBjb25zdCBjYXJkUGFpcnMgPSBjYXJkc1dpdGhUdXJucy5tYXAoKGNhcmQpID0+IHtcclxuICAgIGNvbnN0IHBhaXJzID0gW107XHJcbiAgICBjb25zdCB0dXJucyA9IGNhcmQudHVybnM7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHR1cm5zLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGlmICh0dXJuc1tpXS5yb2xlID09PSBcInVzZXJcIikge1xyXG4gICAgICAgIGxldCBqID0gaSArIDE7XHJcbiAgICAgICAgd2hpbGUgKGogPCB0dXJucy5sZW5ndGggJiYgdHVybnNbal0ucm9sZSAhPT0gXCJhc3Npc3RhbnRcIikgaisrO1xyXG4gICAgICAgIGNvbnN0IGFuc3dlciA9IGogPCB0dXJucy5sZW5ndGggPyB0dXJuc1tqXS50ZXh0IDogXCJcIjtcclxuICAgICAgICBpZiAoYW5zd2VyKSB7XHJcbiAgICAgICAgICBwYWlycy5wdXNoKHsgcXVlc3Rpb246IHR1cm5zW2ldLnRleHQsIGFuc3dlciB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB7IHNpdGVOYW1lOiBjYXJkLnNpdGVOYW1lLCB1cmw6IGNhcmQudXJsLCBwYWlycyB9O1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBzZWVuUSA9IG5ldyBNYXAoKTtcclxuICBmb3IgKGNvbnN0IGNhcmQgb2YgY2FyZFBhaXJzKSB7XHJcbiAgICBmb3IgKGNvbnN0IHBhaXIgb2YgY2FyZC5wYWlycykge1xyXG4gICAgICBjb25zdCBub3JtID0gbm9ybWFsaXplUXVlcnlGb3JNYXRjaChwYWlyLnF1ZXN0aW9uKTtcclxuICAgICAgaWYgKCFzZWVuUS5oYXMobm9ybSkpIHtcclxuICAgICAgICBzZWVuUS5zZXQobm9ybSwgcGFpci5xdWVzdGlvbik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmIChzZWVuUS5zaXplID09PSAwKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgY29uc3Qgc2VjdGlvbnMgPSBbXTtcclxuICBmb3IgKGNvbnN0IFtub3JtUSwgcXVlc3Rpb25dIG9mIHNlZW5RLmVudHJpZXMoKSkge1xyXG4gICAgY29uc3QgbW9kZWxzID0gW107XHJcbiAgICBmb3IgKGNvbnN0IGNhcmQgb2YgY2FyZFBhaXJzKSB7XHJcbiAgICAgIGNvbnN0IHBhaXIgPSBjYXJkLnBhaXJzLmZpbmQoKHApID0+IG5vcm1hbGl6ZVF1ZXJ5Rm9yTWF0Y2gocC5xdWVzdGlvbikgPT09IG5vcm1RKTtcclxuICAgICAgaWYgKHBhaXIpIHtcclxuICAgICAgICBtb2RlbHMucHVzaCh7IHNpdGVOYW1lOiBjYXJkLnNpdGVOYW1lLCB1cmw6IGNhcmQudXJsLCBjb250ZW50OiBwYWlyLmFuc3dlciB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKG1vZGVscy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHNlY3Rpb25zLnB1c2goeyBxdWVyeTogcXVlc3Rpb24sIG1vZGVscyB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBzZWN0aW9ucy5sZW5ndGggPiAwID8gc2VjdGlvbnMgOiBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTaXRlTmFtZUZpbHRlcihzZWxlY3RlZFNpdGVJZHMpIHtcclxuICBpZiAoIXNlbGVjdGVkU2l0ZUlkcykge1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG4gIGNvbnN0IG5hbWVzID0gbmV3IFNldCgpO1xyXG4gIGZvciAoY29uc3QgW2lkLCByZWZdIG9mIHN0YXRlLmNhcmRSZWZzLmVudHJpZXMoKSkge1xyXG4gICAgaWYgKHNlbGVjdGVkU2l0ZUlkcy5oYXMoaWQpKSB7XHJcbiAgICAgIG5hbWVzLmFkZChyZWYuc2l0ZS5uYW1lKTtcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIG5hbWVzO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyU2VjdGlvbnNUb0Zvcm1hdChzZWN0aW9ucywgZm9ybWF0KSB7XHJcbiAgY29uc3QgdmFsaWQgPSBzZWN0aW9ucy5maWx0ZXIoKHMpID0+IChzLml0ZW1zIHx8IFtdKS5sZW5ndGggPiAwKTtcclxuICBpZiAodmFsaWQubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcclxuXHJcbiAgaWYgKGZvcm1hdCA9PT0gXCJtYXJrZG93blwiKSB7XHJcbiAgICByZXR1cm4gdmFsaWRcclxuICAgICAgLm1hcCgoc2VjdGlvbikgPT4ge1xyXG4gICAgICAgIGNvbnN0IHF1ZXJ5TGluZSA9IFN0cmluZyhzZWN0aW9uLnF1ZXJ5IHx8IFwiXCIpLnJlcGxhY2UoL1xccj9cXG4vZywgXCIgXCIpLnRyaW0oKTtcclxuICAgICAgICBjb25zdCB0aW1lTGluZSA9IHNlY3Rpb24udGltZSA/IGDlr7zlh7rml7bpl7TvvJoke3NlY3Rpb24udGltZX1gIDogXCJcIjtcclxuICAgICAgICBjb25zdCBtb2RlbEJsb2NrcyA9IHNlY3Rpb24uaXRlbXNcclxuICAgICAgICAgIC5tYXAoKGl0ZW0pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IGZsYXR0ZW5FeHBvcnRCb2R5TWFya2Rvd24oaXRlbS5jb250ZW50IHx8IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCIpO1xyXG4gICAgICAgICAgICByZXR1cm4gYCMjICR7aXRlbS5zaXRlTmFtZX1cXG5cXG4qKlVSTO+8mioqJHtpdGVtLnVybH1cXG5cXG4ke2JvZHl9YDtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgICAuam9pbihcIlxcblxcblwiKTtcclxuICAgICAgICByZXR1cm4gW2AjICR7cXVlcnlMaW5lfWAsIHRpbWVMaW5lLCBtb2RlbEJsb2Nrc10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCJcXG5cXG5cIik7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5qb2luKFwiXFxuXFxuLS0tXFxuXFxuXCIpO1xyXG4gIH1cclxuXHJcbiAgaWYgKGZvcm1hdCA9PT0gXCJodG1sXCIpIHtcclxuICAgIGNvbnN0IHF1ZXJ5U2VjdGlvbnMgPSB2YWxpZFxyXG4gICAgICAubWFwKChzZWN0aW9uKSA9PiB7XHJcbiAgICAgICAgY29uc3QgbW9kZWxCbG9ja3MgPSBzZWN0aW9uLml0ZW1zXHJcbiAgICAgICAgICAubWFwKFxyXG4gICAgICAgICAgICAoaXRlbSkgPT5cclxuICAgICAgICAgICAgICBgPHNlY3Rpb24gY2xhc3M9XCJtb2RlbC1zZWN0aW9uXCI+PGgyPiR7ZXNjYXBlSHRtbChpdGVtLnNpdGVOYW1lKX08L2gyPjxwPjxzdHJvbmc+VVJM77yaPC9zdHJvbmc+IDxhIGhyZWY9XCIke2VzY2FwZUh0bWwoaXRlbS51cmwpfVwiIHRhcmdldD1cIl9ibGFua1wiPiR7ZXNjYXBlSHRtbChpdGVtLnVybCl9PC9hPjwvcD48cHJlPiR7ZXNjYXBlSHRtbChmbGF0dGVuRXhwb3J0Qm9keU1hcmtkb3duKGl0ZW0uY29udGVudCB8fCBcIuaaguacquaPkOWPluWIsOWGheWuuVwiKSl9PC9wcmU+PC9zZWN0aW9uPmBcclxuICAgICAgICAgIClcclxuICAgICAgICAgIC5qb2luKFwiXCIpO1xyXG4gICAgICAgIGNvbnN0IHRpbWVIdG1sID0gc2VjdGlvbi50aW1lID8gYDxwIGNsYXNzPVwiZXhwb3J0LXRpbWVcIj4ke2VzY2FwZUh0bWwoYOWvvOWHuuaXtumXtO+8miR7c2VjdGlvbi50aW1lfWApfTwvcD5gIDogXCJcIjtcclxuICAgICAgICByZXR1cm4gYDxzZWN0aW9uIGNsYXNzPVwicXVlcnktc2VjdGlvblwiPjxoMT4ke2VzY2FwZUh0bWwoc2VjdGlvbi5xdWVyeSl9PC9oMT4ke3RpbWVIdG1sfSR7bW9kZWxCbG9ja3N9PC9zZWN0aW9uPmA7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5qb2luKFwiPGhyPlwiKTtcclxuICAgIHJldHVybiBgPCFkb2N0eXBlIGh0bWw+PGh0bWwgbGFuZz1cInpoLUNOXCI+PGhlYWQ+PG1ldGEgY2hhcnNldD1cIlVURi04XCI+PHRpdGxlPkFJIOWvueavlOe7k+aenDwvdGl0bGU+PHN0eWxlPmJvZHl7Zm9udC1mYW1pbHk6QXJpYWwsc2Fucy1zZXJpZjtwYWRkaW5nOjI0cHg7bGluZS1oZWlnaHQ6MS43fS5xdWVyeS1zZWN0aW9ue21hcmdpbi1ib3R0b206NDBweH0ubW9kZWwtc2VjdGlvbnttYXJnaW4tYm90dG9tOjI4cHh9cHJle3doaXRlLXNwYWNlOnByZS13cmFwO3dvcmQtYnJlYWs6YnJlYWstd29yZDtiYWNrZ3JvdW5kOiNmN2Y3Zjc7cGFkZGluZzoxNnB4O2JvcmRlci1yYWRpdXM6MTJweH1he2NvbG9yOiMyNTYzZWJ9PC9zdHlsZT48L2hlYWQ+PGJvZHk+JHtxdWVyeVNlY3Rpb25zfTwvYm9keT48L2h0bWw+YDtcclxuICB9XHJcblxyXG4gIHJldHVybiB2YWxpZFxyXG4gICAgLm1hcCgoc2VjdGlvbikgPT4ge1xyXG4gICAgICBjb25zdCB0aW1lU3RyID0gc2VjdGlvbi50aW1lID8gYOWvvOWHuuaXtumXtO+8miR7c2VjdGlvbi50aW1lfWAgOiBcIlwiO1xyXG4gICAgICBjb25zdCBtb2RlbEJsb2NrcyA9IHNlY3Rpb24uaXRlbXNcclxuICAgICAgICAubWFwKChpdGVtKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBib2R5ID0gZmxhdHRlbkV4cG9ydEJvZHlNYXJrZG93bihpdGVtLmNvbnRlbnQgfHwgXCLmmoLmnKrmj5Dlj5bliLDlhoXlrrlcIik7XHJcbiAgICAgICAgICByZXR1cm4gYCR7aXRlbS5zaXRlTmFtZX1cXG5VUkw6ICR7aXRlbS51cmx9XFxuXFxuJHtib2R5fWA7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuam9pbihcIlxcblxcblwiICsgXCItXCIucmVwZWF0KDMyKSArIFwiXFxuXFxuXCIpO1xyXG4gICAgICByZXR1cm4gW3NlY3Rpb24ucXVlcnksIHRpbWVTdHIsIG1vZGVsQmxvY2tzXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIlxcblxcblwiKTtcclxuICAgIH0pXHJcbiAgICAuam9pbihcIlxcblxcblwiICsgXCI9XCIucmVwZWF0KDQwKSArIFwiXFxuXFxuXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVFeHBvcnRDb250ZW50KHJlc3BvbnNlcywgZm9ybWF0LCBzZWxlY3RlZFNpdGVJZHMgPSBudWxsKSB7XHJcbiAgY29uc3QgY3VycmVudFF1ZXJ5ID0gc3RhdGUubGFzdFNlYXJjaFF1ZXJ5IHx8IHN0YXRlLnNlYXJjaEhpc3RvcnlbMF0/LnF1ZXJ5IHx8IFwi5pyq5aGr5YaZ6Zeu6aKYXCI7XHJcbiAgY29uc3QgY3VycmVudFRpbWUgPSBzdGF0ZS5sYXN0U2VhcmNoVGltZSB8fCBuZXcgRGF0ZSgpLnRvTG9jYWxlU3RyaW5nKCk7XHJcblxyXG4gIGNvbnN0IGFsbG93ZWROYW1lcyA9IGJ1aWxkU2l0ZU5hbWVGaWx0ZXIoc2VsZWN0ZWRTaXRlSWRzKTtcclxuICBjb25zdCBmaWx0ZXJJdGVtcyA9IChpdGVtcykgPT5cclxuICAgIGFsbG93ZWROYW1lcyA/IGl0ZW1zLmZpbHRlcigocikgPT4gYWxsb3dlZE5hbWVzLmhhcyhyLnNpdGVOYW1lKSkgOiBpdGVtcztcclxuXHJcbiAgY29uc3QgYWxsU2VjdGlvbnMgPSBbXHJcbiAgICAuLi5zdGF0ZS5zZXNzaW9uU25hcHNob3RzLm1hcCgocykgPT4gKHtcclxuICAgICAgcXVlcnk6IHMucXVlcnksXHJcbiAgICAgIHRpbWU6IHMudGltZSxcclxuICAgICAgaXRlbXM6IGZpbHRlckl0ZW1zKHMucmVzcG9uc2VzKVxyXG4gICAgfSkpLFxyXG4gICAgeyBxdWVyeTogY3VycmVudFF1ZXJ5LCB0aW1lOiBjdXJyZW50VGltZSwgaXRlbXM6IGZpbHRlckl0ZW1zKHJlc3BvbnNlcykgfVxyXG4gIF07XHJcbiAgcmV0dXJuIHJlbmRlclNlY3Rpb25zVG9Gb3JtYXQoYWxsU2VjdGlvbnMsIGZvcm1hdCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUV4cG9ydFByZXZpZXcocmVzcG9uc2VzLCBmb3JtYXQsIHNlbGVjdGVkU2l0ZUlkcyA9IG51bGwpIHtcclxuICBjb25zdCBmdWxsID0gZ2VuZXJhdGVFeHBvcnRDb250ZW50KHJlc3BvbnNlcywgZm9ybWF0LCBzZWxlY3RlZFNpdGVJZHMpO1xyXG4gIHJldHVybiBmdWxsLmxlbmd0aCA+IDE2MDAgPyBgJHtmdWxsLnNsaWNlKDAsIDE2MDApfVxcblxcbi4uLmAgOiBmdWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRFeHBvcnRGaWxlbmFtZShleHRlbnNpb24pIHtcclxuICBjb25zdCBxdWVyeSA9IHN0YXRlLmxhc3RTZWFyY2hRdWVyeSB8fCBzdGF0ZS5zZWFyY2hIaXN0b3J5WzBdPy5xdWVyeSB8fCBcIlwiO1xyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgY29uc3QgZGF0ZSA9IGAke25vdy5nZXRGdWxsWWVhcigpfSR7U3RyaW5nKG5vdy5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgXCIwXCIpfSR7U3RyaW5nKG5vdy5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKX1gO1xyXG5cclxuICBpZiAoIXF1ZXJ5KSB7XHJcbiAgICByZXR1cm4gYEFJ5a+85Ye6XyR7ZGF0ZX0uJHtleHRlbnNpb259YDtcclxuICB9XHJcblxyXG4gIGNvbnN0IGtleXdvcmQgPSBxdWVyeVxyXG4gICAgLnJlcGxhY2UoL1teXFx1NGUwMC1cXHU5ZmE1YS16QS1aMC05XS9nLCBcIiBcIilcclxuICAgIC50cmltKClcclxuICAgIC5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKVxyXG4gICAgLnNsaWNlKDAsIDE2KVxyXG4gICAgLnRyaW0oKVxyXG4gICAgLnJlcGxhY2UoL1xccy9nLCBcIi1cIik7XHJcblxyXG4gIHJldHVybiBgJHtrZXl3b3JkfV8ke2RhdGV9LiR7ZXh0ZW5zaW9ufWA7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkb3dubG9hZEZpbGUoY29udGVudCwgZmlsZW5hbWUsIG1pbWVUeXBlKSB7XHJcbiAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtjb250ZW50XSwgeyB0eXBlOiBtaW1lVHlwZSB9KTtcclxuICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xyXG4gIGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xyXG4gIGFuY2hvci5ocmVmID0gdXJsO1xyXG4gIGFuY2hvci5kb3dubG9hZCA9IGZpbGVuYW1lO1xyXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYW5jaG9yKTtcclxuICBhbmNob3IuY2xpY2soKTtcclxuICBhbmNob3IucmVtb3ZlKCk7XHJcbiAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzdGF0ZSwgZWxlbWVudHMsIEJBU0VfQ09ORklHLCBTRVNTSU9OX1NOQVBTSE9UU19NQVggfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIGdldFNlbGVjdGVkU2l0ZXMsXHJcbiAgZ2V0UXVlcnksXHJcbiAgYnVpbGRTaXRlVXJsLFxyXG4gIGNyZWF0ZVJlcXVlc3RJZCxcclxuICBjbGVhckF1dG9TZW5kRmxhZ0Zyb21VcmwsXHJcbn0gZnJvbSBcIi4vdXRpbHMuanNcIjtcclxuaW1wb3J0IHsgc2V0U2l0ZVN0YXR1cywgc2V0R2xvYmFsU3RhdHVzLCB0b2dnbGVHbG9iYWxCdXR0b25zLCB1cGRhdGVTZW5kQnRuU3RhdGUgfSBmcm9tIFwiLi9zdGF0dXMuanNcIjtcclxuaW1wb3J0IHtcclxuICBhY3RpdmF0ZVNjcm9sbEd1YXJkLFxyXG4gIGdldFNjcm9sbEd1YXJkRHVyYXRpb25NcyxcclxuICBsb2NrQ29udGFpbmVyU2Nyb2xsLFxyXG4gIHJlc3RvcmVMb2NrZWRTY3JvbGxQb3NpdGlvbixcclxuICBzY2hlZHVsZVNjcm9sbFVubG9jayxcclxufSBmcm9tIFwiLi9sYXlvdXQuanNcIjtcclxuaW1wb3J0IHsgY2xlYXJJZnJhbWVUaW1lcnMsIHJlbW92ZUZyb21Mb2FkUXVldWUsIHB1bXBMb2FkUXVldWUgfSBmcm9tIFwiLi9sb2FkLXF1ZXVlLmpzXCI7XHJcbmltcG9ydCB7IHNhdmVTZWFyY2hIaXN0b3J5LCByZWZyZXNoSGlzdG9yeUVudHJ5VXJscyB9IGZyb20gXCIuL2hpc3RvcnkuanNcIjtcclxuaW1wb3J0IHsgcXVpY2tDYXB0dXJlQWxsUmVzcG9uc2VzIH0gZnJvbSBcIi4vZXhwb3J0LmpzXCI7XHJcbmltcG9ydCB7IGRpYWdub3N0aWNMb2cgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL2RpYWdub3N0aWNzLmpzXCI7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2VuZFNlbGVjdGVkKG9wdGlvbnMgPSB7fSkge1xyXG4gIGlmIChzdGF0ZS5pc1NlbmRpbmcpIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLnNlbmRcIiwgXCJpZ25vcmVkLXdoaWxlLXNlbmRpbmdcIik7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCB7IGNsZWFySW5wdXRBZnRlclNlbmQgPSB0cnVlIH0gPSBvcHRpb25zO1xyXG4gIGNvbnN0IHF1ZXJ5ID0gZ2V0UXVlcnkoKTtcclxuXHJcbiAgaWYgKCFxdWVyeSkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUuc2VuZFwiLCBcImVtcHR5LXF1ZXJ5XCIpO1xyXG4gICAgc2V0R2xvYmFsU3RhdHVzKFwi6K+36L6T5YWl6Zeu6aKY5ZCO5YaN5Y+R6YCB44CCXCIsIHRydWUpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgc2VsZWN0ZWRTaXRlcyA9IGdldFNlbGVjdGVkU2l0ZXMoKTtcclxuICBpZiAoc2VsZWN0ZWRTaXRlcy5sZW5ndGggPT09IDApIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLnNlbmRcIiwgXCJuby1zZWxlY3RlZC1zaXRlc1wiKTtcclxuICAgIHNldEdsb2JhbFN0YXR1cyhcIuayoeacieWPr+WPkemAgeeahOermeeCueOAglwiLCB0cnVlKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIHN0YXRlLmlzU2VuZGluZyA9IHRydWU7XHJcbiAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUuc2VuZFwiLCBcInN0YXJ0XCIsIHtcclxuICAgIHNlbGVjdGVkQ291bnQ6IHNlbGVjdGVkU2l0ZXMubGVuZ3RoLFxyXG4gICAgc2l0ZUlkczogc2VsZWN0ZWRTaXRlcy5tYXAoKHNpdGUpID0+IHNpdGUuaWQpLFxyXG4gICAgcXVlcnksXHJcbiAgfSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBsb2NrQ29udGFpbmVyU2Nyb2xsKCk7XHJcbiAgICB0b2dnbGVHbG9iYWxCdXR0b25zKHRydWUpO1xyXG4gICAgc2V0R2xvYmFsU3RhdHVzKGDmraPlnKjlkJEgJHtzZWxlY3RlZFNpdGVzLmxlbmd0aH0g5Liq56uZ54K55YiG5Y+R6Zeu6aKYLi4uYCk7XHJcblxyXG4gICAgaWYgKHN0YXRlLmxhc3RTZWFyY2hRdWVyeSkge1xyXG4gICAgICBjYXB0dXJlUHJldmlvdXNTZXNzaW9uU25hcHNob3Qoc3RhdGUubGFzdFNlYXJjaFF1ZXJ5LCBzdGF0ZS5sYXN0U2VhcmNoVGltZSwgc3RhdGUuc2Vzc2lvblZlcnNpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXRlLmxhc3RTZWFyY2hRdWVyeSA9IHF1ZXJ5O1xyXG4gICAgc3RhdGUubGFzdFNlYXJjaFRpbWUgPSBuZXcgRGF0ZSgpLnRvTG9jYWxlU3RyaW5nKCk7XHJcblxyXG4gICAgYWN0aXZhdGVTY3JvbGxHdWFyZChcclxuICAgICAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zY3JvbGxMZWZ0LFxyXG4gICAgICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbFRvcCxcclxuICAgICAgZ2V0U2Nyb2xsR3VhcmREdXJhdGlvbk1zKHNlbGVjdGVkU2l0ZXMubGVuZ3RoKVxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoY2xlYXJJbnB1dEFmdGVyU2VuZCkge1xyXG4gICAgICBlbGVtZW50cy5xdWVyeUlucHV0LnZhbHVlID0gXCJcIjtcclxuICAgICAgdXBkYXRlU2VuZEJ0blN0YXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaGlzdG9yeUVudHJ5UHJvbWlzZSA9IHNhdmVTZWFyY2hIaXN0b3J5KHF1ZXJ5LCBzZWxlY3RlZFNpdGVzKS5jYXRjaCgoKSA9PiBudWxsKTtcclxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBzZW5kU2l0ZXNXaXRoQ29uY3VycmVuY3koc2VsZWN0ZWRTaXRlcywgcXVlcnkpO1xyXG4gICAgY29uc3Qgc3VjY2Vzc0NvdW50ID0gcmVzdWx0cy5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0gJiYgaXRlbS5vaykubGVuZ3RoO1xyXG4gICAgY29uc3QgZmFpbGVkQ291bnQgPSByZXN1bHRzLmxlbmd0aCAtIHN1Y2Nlc3NDb3VudDtcclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLnNlbmRcIiwgXCJjb21wbGV0ZVwiLCB7IHN1Y2Nlc3NDb3VudCwgZmFpbGVkQ291bnQsIHJlc3VsdHMgfSk7XHJcblxyXG4gICAgY29uc3QgaGlzdG9yeUVudHJ5SWQgPSBhd2FpdCBoaXN0b3J5RW50cnlQcm9taXNlO1xyXG4gICAgYXdhaXQgcmVmcmVzaEhpc3RvcnlFbnRyeVVybHMoaGlzdG9yeUVudHJ5SWQsIHNlbGVjdGVkU2l0ZXMpO1xyXG4gICAgc2V0R2xvYmFsU3RhdHVzKGDlj5HpgIHlrozmiJDvvJrmiJDlip8gJHtzdWNjZXNzQ291bnR9IOS4qu+8jOWksei0pSAke2ZhaWxlZENvdW50fSDkuKrjgIJgLCBmYWlsZWRDb3VudCA+IDApO1xyXG4gICAgc2NoZWR1bGVTY3JvbGxVbmxvY2soKTtcclxuICB9IGZpbmFsbHkge1xyXG4gICAgc3RhdGUuaXNTZW5kaW5nID0gZmFsc2U7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5zZW5kXCIsIFwidW5sb2NrXCIpO1xyXG4gICAgdG9nZ2xlR2xvYmFsQnV0dG9ucyhmYWxzZSk7XHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzZW5kU2l0ZXNXaXRoQ29uY3VycmVuY3koc2l0ZXMsIHF1ZXJ5KSB7XHJcbiAgY29uc3QgcmVzdWx0cyA9IG5ldyBBcnJheShzaXRlcy5sZW5ndGgpO1xyXG4gIGNvbnN0IGNvbmZpZ3VyZWRDb25jdXJyZW5jeSA9IE51bWJlci5pc0Zpbml0ZShCQVNFX0NPTkZJRy5zZW5kQ29uY3VycmVuY3kpXHJcbiAgICA/IEJBU0VfQ09ORklHLnNlbmRDb25jdXJyZW5jeVxyXG4gICAgOiAyO1xyXG4gIGNvbnN0IGNvbmN1cnJlbmN5ID0gTWF0aC5tYXgoMSwgTWF0aC5taW4oc2l0ZXMubGVuZ3RoLCBjb25maWd1cmVkQ29uY3VycmVuY3kpKTtcclxuICBsZXQgbmV4dEluZGV4ID0gMDtcclxuXHJcbiAgYXN5bmMgZnVuY3Rpb24gd29ya2VyKHdvcmtlcklkKSB7XHJcbiAgICB3aGlsZSAobmV4dEluZGV4IDwgc2l0ZXMubGVuZ3RoKSB7XHJcbiAgICAgIGNvbnN0IGluZGV4ID0gbmV4dEluZGV4O1xyXG4gICAgICBuZXh0SW5kZXggKz0gMTtcclxuXHJcbiAgICAgIGNvbnN0IHNpdGUgPSBzaXRlc1tpbmRleF07XHJcbiAgICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLnNlbmRcIiwgXCJwb29sZWQtZGlzcGF0Y2hcIiwge1xyXG4gICAgICAgIHNpdGVJZDogc2l0ZS5pZCxcclxuICAgICAgICBpbmRleDogaW5kZXggKyAxLFxyXG4gICAgICAgIHRvdGFsOiBzaXRlcy5sZW5ndGgsXHJcbiAgICAgICAgd29ya2VySWQsXHJcbiAgICAgICAgY29uY3VycmVuY3ksXHJcbiAgICAgIH0pO1xyXG4gICAgICBzZXRTaXRlU3RhdHVzKHNpdGUuaWQsIGDmraPlnKjlj5HpgIHvvIgke2luZGV4ICsgMX0vJHtzaXRlcy5sZW5ndGh977yJLi4uYCk7XHJcblxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHJlc3VsdHNbaW5kZXhdID0gYXdhaXQgc2VuZFNtYXJ0VG9TaXRlKHNpdGUsIHF1ZXJ5LCAwKTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5zZW5kXCIsIFwicG9vbGVkLWRpc3BhdGNoLWVycm9yXCIsIHtcclxuICAgICAgICAgIHNpdGVJZDogc2l0ZS5pZCxcclxuICAgICAgICAgIHdvcmtlcklkLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2UsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmVzdWx0c1tpbmRleF0gPSB7XHJcbiAgICAgICAgICBvazogZmFsc2UsXHJcbiAgICAgICAgICBzaXRlSWQ6IHNpdGUuaWQsXHJcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZSB8fCBcIuWPkemAgeWksei0pVwiXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICBBcnJheS5mcm9tKHsgbGVuZ3RoOiBjb25jdXJyZW5jeSB9LCAoX2l0ZW0sIGluZGV4KSA9PiB3b3JrZXIoaW5kZXggKyAxKSlcclxuICApO1xyXG5cclxuICByZXR1cm4gcmVzdWx0cztcclxufVxyXG5cclxuZnVuY3Rpb24gY2FwdHVyZVByZXZpb3VzU2Vzc2lvblNuYXBzaG90KHF1ZXJ5LCB0aW1lLCBzZXNzaW9uVmVyc2lvbikge1xyXG4gIHF1aWNrQ2FwdHVyZUFsbFJlc3BvbnNlcygpXHJcbiAgICAudGhlbigocHJldlJlc3BvbnNlcykgPT4ge1xyXG4gICAgICBpZiAoc3RhdGUuc2Vzc2lvblZlcnNpb24gIT09IHNlc3Npb25WZXJzaW9uKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBzdGF0ZS5zZXNzaW9uU25hcHNob3RzLnB1c2goe1xyXG4gICAgICAgIHF1ZXJ5LFxyXG4gICAgICAgIHRpbWUsXHJcbiAgICAgICAgcmVzcG9uc2VzOiBwcmV2UmVzcG9uc2VzXHJcbiAgICAgIH0pO1xyXG4gICAgICAvLyDotoXov4fkuIrpmZDliJnkuKLlvIPmnIDml6fnmoTlv6vnhafvvIzpmLLmraLplb/kvJror53lhoXlrZjml6DpmZDlop7plb/jgIJcclxuICAgICAgaWYgKHN0YXRlLnNlc3Npb25TbmFwc2hvdHMubGVuZ3RoID4gU0VTU0lPTl9TTkFQU0hPVFNfTUFYKSB7XHJcbiAgICAgICAgc3RhdGUuc2Vzc2lvblNuYXBzaG90cyA9IHN0YXRlLnNlc3Npb25TbmFwc2hvdHMuc2xpY2UoLVNFU1NJT05fU05BUFNIT1RTX01BWCk7XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICAuY2F0Y2goKCkgPT4ge1xyXG4gICAgICAvLyDlv6vnhaflpLHotKXkuI3pmLvmlq3lj5HpgIHmtYHnqItcclxuICAgIH0pO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWF5YmVBdXRvU2VuZEZyb21VcmwoKSB7XHJcbiAgaWYgKCFzdGF0ZS5zaG91bGRBdXRvU2VuZCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcXVlcnkgPSBnZXRRdWVyeSgpO1xyXG4gIGlmICghcXVlcnkpIHtcclxuICAgIHN0YXRlLnNob3VsZEF1dG9TZW5kID0gZmFsc2U7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBzdGF0ZS5zaG91bGRBdXRvU2VuZCA9IGZhbHNlO1xyXG4gIGNsZWFyQXV0b1NlbmRGbGFnRnJvbVVybCgpO1xyXG4gIGF3YWl0IGhhbmRsZVNlbmRTZWxlY3RlZCh7IGNsZWFySW5wdXRBZnRlclNlbmQ6IHRydWUgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZW5kU21hcnRUb1NpdGUoc2l0ZSwgcXVlcnksIGRpc3BhdGNoRGVsYXlNcyA9IDApIHtcclxuICBpZiAoc2l0ZS5zdXBwb3J0SWZyYW1lID09PSBmYWxzZSkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUuc2l0ZVwiLCBcImV4dGVybmFsLXRhYi1yb3V0ZVwiLCB7IHNpdGUgfSk7XHJcbiAgICByZXR1cm4gb3BlbkV4dGVybmFsU2l0ZUZvclF1ZXJ5KHNpdGUsIHF1ZXJ5KTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlZiA9IHN0YXRlLmNhcmRSZWZzLmdldChzaXRlLmlkKTtcclxuICBpZiAoIXJlZiB8fCAhcmVmLmlmcmFtZUVsKSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5zaXRlXCIsIFwibWlzc2luZy1pZnJhbWVcIiwgeyBzaXRlIH0pO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBzaXRlSWQ6IHNpdGUuaWQsXHJcbiAgICAgIGVycm9yOiBcIuWNoeeJhyBpZnJhbWUg5LiN5Y+v55SoXCJcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBpZiAoc2l0ZS5zdXBwb3J0VXJsUXVlcnkgJiYgU3RyaW5nKHNpdGUudXJsIHx8IFwiXCIpLmluY2x1ZGVzKFwie3F1ZXJ5fVwiKSkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUuc2l0ZVwiLCBcInVybC10ZW1wbGF0ZS1yb3V0ZVwiLCB7IHNpdGUgfSk7XHJcbiAgICByZXR1cm4gbmF2aWdhdGVCeVVybFRlbXBsYXRlKHJlZiwgcXVlcnkpO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFyZWYubG9hZGVkKSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5zaXRlXCIsIFwid2FpdC1mb3ItaWZyYW1lLWxvYWRcIiwgeyBzaXRlIH0pO1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICAgIHJlZi5wZW5kaW5nUXVlcnkgPSBxdWVyeTtcclxuICAgICAgcmVmLnBlbmRpbmdRdWVyeURlbGF5TXMgPSBkaXNwYXRjaERlbGF5TXM7XHJcbiAgICAgIHJlZi5wZW5kaW5nUXVlcnlSZXNvbHZlciA9IHJlc29sdmU7XHJcbiAgICAgIHNldFNpdGVTdGF0dXMoc2l0ZS5pZCwgXCLljaHniYfliqDovb3kuK3vvIzlrozmiJDlkI7lsIboh6rliqjlj5HpgIEuLi5cIik7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHJlZi5wZW5kaW5nUXVlcnkgPSBcIlwiO1xyXG4gIHJlZi5wZW5kaW5nUXVlcnlEZWxheU1zID0gMDtcclxuICByZWYucGVuZGluZ1F1ZXJ5UmVzb2x2ZXIgPSBudWxsO1xyXG4gIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLnNpdGVcIiwgXCJkaXNwYXRjaC1yb3V0ZVwiLCB7IHNpdGUgfSk7XHJcbiAgcmV0dXJuIGRpc3BhdGNoU2VhcmNoV2l0aFJldHJpZXMocmVmLCBxdWVyeSwgZGlzcGF0Y2hEZWxheU1zKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gb3BlbkV4dGVybmFsU2l0ZUZvclF1ZXJ5KHNpdGUsIHF1ZXJ5KSB7XHJcbiAgY29uc3QgdGFyZ2V0VXJsID0gYnVpbGRTaXRlVXJsKHNpdGUsIHF1ZXJ5KTtcclxuICBpZiAoIXRhcmdldFVybCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBzaXRlSWQ6IHNpdGUuaWQsXHJcbiAgICAgIGVycm9yOiBcIuermeeCuSBVUkwg6YWN572u5peg5pWIXCJcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcclxuICAgIHR5cGU6IFwiT1BFTl9TSVRFX1RBQl9BTkRfU0VORFwiLFxyXG4gICAgc2l0ZSxcclxuICAgIHF1ZXJ5XHJcbiAgfSk7XHJcblxyXG4gIGlmICghcmVzcG9uc2U/Lm9rKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogZmFsc2UsXHJcbiAgICAgIHNpdGVJZDogc2l0ZS5pZCxcclxuICAgICAgZXJyb3I6IHJlc3BvbnNlPy5lcnJvciB8fCBcIuaWsOagh+etvumhteaJk+W8gOWksei0pVwiXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIG9rOiB0cnVlLFxyXG4gICAgc2l0ZUlkOiBzaXRlLmlkLFxyXG4gICAgbWVzc2FnZTogXCLlt7LlnKjmlrDmoIfnrb7pobXmiZPlvIBcIlxyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBuYXZpZ2F0ZUJ5VXJsVGVtcGxhdGUocmVmLCBxdWVyeSkge1xyXG4gIGNvbnN0IHRhcmdldFVybCA9IGJ1aWxkU2l0ZVVybChyZWYuc2l0ZSwgcXVlcnkpO1xyXG4gIGlmICghdGFyZ2V0VXJsKSB7XHJcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBzaXRlSWQ6IHJlZi5zaXRlLmlkLFxyXG4gICAgICBlcnJvcjogXCLnq5nngrkgVVJMIOmFjee9ruaXoOaViFwiXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGlmcmFtZSA9IHJlZi5pZnJhbWVFbDtcclxuICBpZiAoIWlmcmFtZSkge1xyXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XHJcbiAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgc2l0ZUlkOiByZWYuc2l0ZS5pZCxcclxuICAgICAgZXJyb3I6IFwi5Y2h54mHIGlmcmFtZSDkuI3lj6/nlKhcIlxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyDlkIzmraXmm7TmlrAgX3RhcmdldFNyY++8jOmYsuatoumYn+WIl+mHjOW+heWKoOi9veeahCBiZWdpbklmcmFtZUxvYWQg55So5penIFVSTCDopobnm5bliJrorr7lpb3nmoQgcXVlcnkgVVJM44CCXHJcbiAgLy8g5Zy65pmv77ya5bm25Y+R5qe95L2N5ruh5pe277yMVGlrVG9rL+ekvuWqkuWNoeeJh+i/mOWcqOaOkumYn++8jGF1dG9zZW5kIOW3suiwg+eUqCBuYXZpZ2F0ZUJ5VXJsVGVtcGxhdGUg6K6+5aW95LqG5bimXHJcbiAgLy8gcXVlcnkg55qEIHNyY++8jOS9huS5i+WQjiBiZWdpbklmcmFtZUxvYWQg5omN6L2u5Yiw6K+l5Y2h54mH77yM6Iul5LiN5pu05pawIF90YXJnZXRTcmMg5Lya6KaG55uW5Zue56m6IFVSTOOAglxyXG4gIHJlZi5fdGFyZ2V0U3JjID0gdGFyZ2V0VXJsO1xyXG5cclxuICBzZXRTaXRlU3RhdHVzKHJlZi5zaXRlLmlkLCBcIuato+WcqOmAmui/hyBVUkwg55u06L6+5pCc57Si57uT5p6c6aG1Li4uXCIpO1xyXG4gIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLnVybFwiLCBcIm5hdmlnYXRlLXN0YXJ0XCIsIHsgc2l0ZTogcmVmLnNpdGUsIHRhcmdldFVybCB9KTtcclxuXHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICBjb25zdCB0aW1lb3V0TXMgPSAxMjAwMDtcclxuICAgIGxldCBkb25lID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3QgY2xlYW51cCA9ICgpID0+IHtcclxuICAgICAgaWZyYW1lLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsIGhhbmRsZUxvYWQsIHRydWUpO1xyXG4gICAgICBpZnJhbWUucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsIGhhbmRsZUVycm9yLCB0cnVlKTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZmluaXNoID0gKHJlc3VsdCkgPT4ge1xyXG4gICAgICBpZiAoZG9uZSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBkb25lID0gdHJ1ZTtcclxuICAgICAgY2xlYW51cCgpO1xyXG4gICAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS51cmxcIiwgXCJuYXZpZ2F0ZS1maW5pc2hcIiwgeyBzaXRlOiByZWYuc2l0ZSwgcmVzdWx0IH0pO1xyXG4gICAgICByZXNvbHZlKHJlc3VsdCk7XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGhhbmRsZUxvYWQgPSAoKSA9PiB7XHJcbiAgICAgIHJlZi5sb2FkZWQgPSB0cnVlO1xyXG4gICAgICByZWYuY3VycmVudFVybCA9IGlmcmFtZS5zcmMgfHwgdGFyZ2V0VXJsO1xyXG4gICAgICBmaW5pc2goe1xyXG4gICAgICAgIG9rOiB0cnVlLFxyXG4gICAgICAgIHNpdGVJZDogcmVmLnNpdGUuaWQsXHJcbiAgICAgICAgbWVzc2FnZTogXCLlt7LpgJrov4cgVVJMIOi3s+i9rOWIsOaQnOe0oue7k+aenOmhtVwiXHJcbiAgICAgIH0pO1xyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBoYW5kbGVFcnJvciA9ICgpID0+IHtcclxuICAgICAgZmluaXNoKHtcclxuICAgICAgICBvazogZmFsc2UsXHJcbiAgICAgICAgc2l0ZUlkOiByZWYuc2l0ZS5pZCxcclxuICAgICAgICBlcnJvcjogXCJVUkwg6Lez6L2s5aSx6LSl77yM6aG16Z2i5pyq5ZON5bqUXCJcclxuICAgICAgfSk7XHJcbiAgICB9O1xyXG5cclxuICAgIGlmcmFtZS5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCBoYW5kbGVMb2FkLCB0cnVlKTtcclxuICAgIGlmcmFtZS5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgaGFuZGxlRXJyb3IsIHRydWUpO1xyXG5cclxuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgZmluaXNoKHtcclxuICAgICAgICBvazogZmFsc2UsXHJcbiAgICAgICAgc2l0ZUlkOiByZWYuc2l0ZS5pZCxcclxuICAgICAgICBlcnJvcjogXCJVUkwg6Lez6L2s6LaF5pe277yM5pyq6L+b5YWl55uu5qCH57uT5p6c6aG1XCJcclxuICAgICAgfSk7XHJcbiAgICB9LCB0aW1lb3V0TXMpO1xyXG5cclxuICAgIGlmcmFtZS5zcmMgPSB0YXJnZXRVcmw7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaFNlYXJjaFdpdGhSZXRyaWVzKHJlZiwgcXVlcnksIGluaXRpYWxEZWxheU1zKSB7XHJcbiAgY29uc3QgcmVxdWVzdElkID0gY3JlYXRlUmVxdWVzdElkKCk7XHJcbiAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUuZGlzcGF0Y2hcIiwgXCJjcmVhdGVkXCIsIHsgc2l0ZTogcmVmLnNpdGUsIHJlcXVlc3RJZCwgcXVlcnkgfSk7XHJcblxyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgY29uc3QgcGVuZGluZ0Rpc3BhdGNoID0ge1xyXG4gICAgICByZXF1ZXN0SWQsXHJcbiAgICAgIHJlZixcclxuICAgICAgcXVlcnksXHJcbiAgICAgIHJlc29sdmUsXHJcbiAgICAgIGF0dGVtcHRzOiAwLFxyXG4gICAgICBtYXhBdHRlbXB0czogMyxcclxuICAgICAgcmV0cnlEZWxheU1zOiBCQVNFX0NPTkZJRy50YWJTZW5kUmV0cnlEZWxheU1zIHx8IDE4MDAsXHJcbiAgICAgIHRpbWVySWQ6IG51bGwsXHJcbiAgICAgIGNvbXBsZXRlZDogZmFsc2VcclxuICAgIH07XHJcblxyXG4gICAgc3RhdGUucGVuZGluZ0Rpc3BhdGNoZXMuc2V0KHJlcXVlc3RJZCwgcGVuZGluZ0Rpc3BhdGNoKTtcclxuICAgIHNjaGVkdWxlRGlzcGF0Y2hBdHRlbXB0KHBlbmRpbmdEaXNwYXRjaCwgaW5pdGlhbERlbGF5TXMpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2NoZWR1bGVEaXNwYXRjaEF0dGVtcHQocGVuZGluZ0Rpc3BhdGNoLCBkZWxheU1zKSB7XHJcbiAgcGVuZGluZ0Rpc3BhdGNoLnRpbWVySWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICBpZiAocGVuZGluZ0Rpc3BhdGNoLmNvbXBsZXRlZCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgcmVzdG9yZUxvY2tlZFNjcm9sbFBvc2l0aW9uKCk7XHJcblxyXG4gICAgcGVuZGluZ0Rpc3BhdGNoLmF0dGVtcHRzICs9IDE7XHJcblxyXG4gICAgaWYgKCFwZW5kaW5nRGlzcGF0Y2gucmVmLmlmcmFtZUVsPy5jb250ZW50V2luZG93KSB7XHJcbiAgICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLmRpc3BhdGNoXCIsIFwibWlzc2luZy1jb250ZW50LXdpbmRvd1wiLCB7XHJcbiAgICAgICAgc2l0ZTogcGVuZGluZ0Rpc3BhdGNoLnJlZi5zaXRlLFxyXG4gICAgICAgIHJlcXVlc3RJZDogcGVuZGluZ0Rpc3BhdGNoLnJlcXVlc3RJZCxcclxuICAgICAgICBhdHRlbXB0OiBwZW5kaW5nRGlzcGF0Y2guYXR0ZW1wdHMsXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAocGVuZGluZ0Rpc3BhdGNoLmF0dGVtcHRzIDwgcGVuZGluZ0Rpc3BhdGNoLm1heEF0dGVtcHRzKSB7XHJcbiAgICAgICAgc2NoZWR1bGVEaXNwYXRjaEF0dGVtcHQocGVuZGluZ0Rpc3BhdGNoLCBwZW5kaW5nRGlzcGF0Y2gucmV0cnlEZWxheU1zKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBmaW5hbGl6ZVBlbmRpbmdEaXNwYXRjaChwZW5kaW5nRGlzcGF0Y2gucmVxdWVzdElkLCB7XHJcbiAgICAgICAgICBvazogZmFsc2UsXHJcbiAgICAgICAgICBzaXRlSWQ6IHBlbmRpbmdEaXNwYXRjaC5yZWYuc2l0ZS5pZCxcclxuICAgICAgICAgIGVycm9yOiBcIuWNoeeJhyBpZnJhbWUg5LiN5Y+v55SoXCJcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8g6Leo5Z+fIGlmcmFtZSDpgJrkv6HvvJrlm7rlrprkvb/nlKggXCIqXCIg5L2c5Li6IHRhcmdldE9yaWdpbuOAglxyXG4gICAgICAvLyDljp/lm6DvvJpLaW1p77yId3d3LmtpbWkuY29tIOKGkiBraW1pLmNvbe+8ieOAgemAmuS5ie+8iHd3dy5xaWFud2VuLmNvbSDihpIgY2hhdC5xd2VuLmFp77yJXHJcbiAgICAgIC8vIOetieermeeCueWcqCBpZnJhbWUg5YaF5Lya5Y+R55Sf6LeoIG9yaWdpbiDph43lrprlkJHvvIzoi6Xkvb/nlKjliJ3lp4sgc3JjIOeahCBvcmlnaW4g5YGaIHRhcmdldE9yaWdpbu+8jFxyXG4gICAgICAvLyDmtY/op4jlmajkvJrpnZnpu5jkuKLlvIMgcG9zdE1lc3NhZ2XvvIxpbmplY3QuanMg5rC46L+c5pS25LiN5YiwIFFTSE9UX1NFQVJDSO+8jOi+k+WFpeahhuWni+e7iOS4uuepuuOAglxyXG4gICAgICAvLyDlronlhajmgKfnlLEgaW5qZWN0LmpzIOaOpeaUtuerr+eahCBldmVudC5vcmlnaW49PT1FWFRFTlNJT05fT1JJR0lOIOagoemqjOS/neivge+8jFxyXG4gICAgICAvLyDlj5HpgIHnq6/kvb/nlKggXCIqXCIg5LiN6ZmN5L2O5a6J5YWo562J57qn77yM5LuF5oSP5ZGz552A5p+l6K+i5paH5pys5a+5IGlmcmFtZSDlhoXlhbbku5YgbWVzc2FnZSDnm5HlkKzlmajlj6/op4FcclxuICAgICAgLy8g77yI6ICMIGlmcmFtZSDmnKzouqvmmK/nlKjmiLflt7LnmbvlvZXnmoQgQUkg56uZ54K577yM5bGe5Y+v5L+h6IyD5Zu077yJ44CCXHJcbiAgICAgIGNvbnN0IHRhcmdldE9yaWdpbiA9IFwiKlwiO1xyXG4gICAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5kaXNwYXRjaFwiLCBcInBvc3QtbWVzc2FnZVwiLCB7XHJcbiAgICAgICAgc2l0ZTogcGVuZGluZ0Rpc3BhdGNoLnJlZi5zaXRlLFxyXG4gICAgICAgIHJlcXVlc3RJZDogcGVuZGluZ0Rpc3BhdGNoLnJlcXVlc3RJZCxcclxuICAgICAgICBhdHRlbXB0OiBwZW5kaW5nRGlzcGF0Y2guYXR0ZW1wdHMsXHJcbiAgICAgIH0pO1xyXG4gICAgICBwZW5kaW5nRGlzcGF0Y2gucmVmLmlmcmFtZUVsLmNvbnRlbnRXaW5kb3cucG9zdE1lc3NhZ2UoXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdHlwZTogXCJRU0hPVF9TRUFSQ0hcIixcclxuICAgICAgICAgIHF1ZXJ5OiBwZW5kaW5nRGlzcGF0Y2gucXVlcnksXHJcbiAgICAgICAgICBzaXRlOiBwZW5kaW5nRGlzcGF0Y2gucmVmLnNpdGUsXHJcbiAgICAgICAgICByZXF1ZXN0SWQ6IHBlbmRpbmdEaXNwYXRjaC5yZXF1ZXN0SWRcclxuICAgICAgICB9LFxyXG4gICAgICAgIHRhcmdldE9yaWdpblxyXG4gICAgICApO1xyXG4gICAgICBzZXRTaXRlU3RhdHVzKHBlbmRpbmdEaXNwYXRjaC5yZWYuc2l0ZS5pZCwgXCLmn6Xor6Llt7Llj5HpgIHliLDljaHniYcgaWZyYW1l77yM562J5b6F6aG16Z2i5ZON5bqULi4uXCIpO1xyXG4gICAgICByZXN0b3JlTG9ja2VkU2Nyb2xsUG9zaXRpb24oKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLmRpc3BhdGNoXCIsIFwicG9zdC1tZXNzYWdlLWVycm9yXCIsIHtcclxuICAgICAgICBzaXRlOiBwZW5kaW5nRGlzcGF0Y2gucmVmLnNpdGUsXHJcbiAgICAgICAgcmVxdWVzdElkOiBwZW5kaW5nRGlzcGF0Y2gucmVxdWVzdElkLFxyXG4gICAgICAgIGF0dGVtcHQ6IHBlbmRpbmdEaXNwYXRjaC5hdHRlbXB0cyxcclxuICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZSxcclxuICAgICAgfSk7XHJcbiAgICAgIGlmIChwZW5kaW5nRGlzcGF0Y2guYXR0ZW1wdHMgPCBwZW5kaW5nRGlzcGF0Y2gubWF4QXR0ZW1wdHMpIHtcclxuICAgICAgICBzY2hlZHVsZURpc3BhdGNoQXR0ZW1wdChwZW5kaW5nRGlzcGF0Y2gsIHBlbmRpbmdEaXNwYXRjaC5yZXRyeURlbGF5TXMpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGZpbmFsaXplUGVuZGluZ0Rpc3BhdGNoKHBlbmRpbmdEaXNwYXRjaC5yZXF1ZXN0SWQsIHtcclxuICAgICAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgICAgIHNpdGVJZDogcGVuZGluZ0Rpc3BhdGNoLnJlZi5zaXRlLmlkLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgc2NoZWR1bGVEaXNwYXRjaEF0dGVtcHRGYWlsdXJlKHBlbmRpbmdEaXNwYXRjaCk7XHJcbiAgfSwgZGVsYXlNcyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzY2hlZHVsZURpc3BhdGNoQXR0ZW1wdEZhaWx1cmUocGVuZGluZ0Rpc3BhdGNoKSB7XHJcbiAgcGVuZGluZ0Rpc3BhdGNoLnRpbWVySWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICBpZiAocGVuZGluZ0Rpc3BhdGNoLmNvbXBsZXRlZCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHBlbmRpbmdEaXNwYXRjaC5hdHRlbXB0cyA8IHBlbmRpbmdEaXNwYXRjaC5tYXhBdHRlbXB0cykge1xyXG4gICAgICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5kaXNwYXRjaFwiLCBcInJldHJ5XCIsIHtcclxuICAgICAgICBzaXRlOiBwZW5kaW5nRGlzcGF0Y2gucmVmLnNpdGUsXHJcbiAgICAgICAgcmVxdWVzdElkOiBwZW5kaW5nRGlzcGF0Y2gucmVxdWVzdElkLFxyXG4gICAgICAgIG5leHRBdHRlbXB0OiBwZW5kaW5nRGlzcGF0Y2guYXR0ZW1wdHMgKyAxLFxyXG4gICAgICB9KTtcclxuICAgICAgc2V0U2l0ZVN0YXR1cyhcclxuICAgICAgICBwZW5kaW5nRGlzcGF0Y2gucmVmLnNpdGUuaWQsXHJcbiAgICAgICAgYOiHquWKqOWPkemAgeaaguacquWTjeW6lO+8jOato+WcqOmHjeivlSAke3BlbmRpbmdEaXNwYXRjaC5hdHRlbXB0cyArIDF9LyR7cGVuZGluZ0Rpc3BhdGNoLm1heEF0dGVtcHRzfS4uLmBcclxuICAgICAgKTtcclxuICAgICAgc2NoZWR1bGVEaXNwYXRjaEF0dGVtcHQocGVuZGluZ0Rpc3BhdGNoLCAwKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLmRpc3BhdGNoXCIsIFwidGltZW91dFwiLCB7XHJcbiAgICAgIHNpdGU6IHBlbmRpbmdEaXNwYXRjaC5yZWYuc2l0ZSxcclxuICAgICAgcmVxdWVzdElkOiBwZW5kaW5nRGlzcGF0Y2gucmVxdWVzdElkLFxyXG4gICAgICBhdHRlbXB0czogcGVuZGluZ0Rpc3BhdGNoLmF0dGVtcHRzLFxyXG4gICAgfSk7XHJcbiAgICBmaW5hbGl6ZVBlbmRpbmdEaXNwYXRjaChwZW5kaW5nRGlzcGF0Y2gucmVxdWVzdElkLCB7XHJcbiAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgc2l0ZUlkOiBwZW5kaW5nRGlzcGF0Y2gucmVmLnNpdGUuaWQsXHJcbiAgICAgIGVycm9yOiBcIuiHquWKqOWPkemAgei2heaXtu+8jOacquaUtuWIsOWNoeeJh+mhtemdouWTjeW6lFwiXHJcbiAgICB9KTtcclxuICB9LCBwZW5kaW5nRGlzcGF0Y2gucmV0cnlEZWxheU1zKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQZW5kaW5nRGlzcGF0Y2gocmVxdWVzdElkLCBwYXlsb2FkKSB7XHJcbiAgY29uc3QgcGVuZGluZ0Rpc3BhdGNoID0gc3RhdGUucGVuZGluZ0Rpc3BhdGNoZXMuZ2V0KHJlcXVlc3RJZCk7XHJcbiAgaWYgKCFwZW5kaW5nRGlzcGF0Y2ggfHwgcGVuZGluZ0Rpc3BhdGNoLmNvbXBsZXRlZCkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUuZGlzcGF0Y2hcIiwgXCJyZXNvbHZlLW1pc3NcIiwgeyByZXF1ZXN0SWQsIHBheWxvYWQgfSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5kaXNwYXRjaFwiLCBcInJlc29sdmVcIiwge1xyXG4gICAgc2l0ZTogcGVuZGluZ0Rpc3BhdGNoLnJlZi5zaXRlLFxyXG4gICAgcmVxdWVzdElkLFxyXG4gICAgcGF5bG9hZCxcclxuICB9KTtcclxuICBmaW5hbGl6ZVBlbmRpbmdEaXNwYXRjaChyZXF1ZXN0SWQsIHBheWxvYWQpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZmluYWxpemVQZW5kaW5nRGlzcGF0Y2gocmVxdWVzdElkLCByZXN1bHQpIHtcclxuICBjb25zdCBwZW5kaW5nRGlzcGF0Y2ggPSBzdGF0ZS5wZW5kaW5nRGlzcGF0Y2hlcy5nZXQocmVxdWVzdElkKTtcclxuICBpZiAoIXBlbmRpbmdEaXNwYXRjaCB8fCBwZW5kaW5nRGlzcGF0Y2guY29tcGxldGVkKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBwZW5kaW5nRGlzcGF0Y2guY29tcGxldGVkID0gdHJ1ZTtcclxuICBpZiAocGVuZGluZ0Rpc3BhdGNoLnRpbWVySWQpIHtcclxuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQocGVuZGluZ0Rpc3BhdGNoLnRpbWVySWQpO1xyXG4gIH1cclxuICBzdGF0ZS5wZW5kaW5nRGlzcGF0Y2hlcy5kZWxldGUocmVxdWVzdElkKTtcclxuICByZXN0b3JlTG9ja2VkU2Nyb2xsUG9zaXRpb24oKTtcclxuICBkaWFnbm9zdGljTG9nKFwiY29tcGFyZS5kaXNwYXRjaFwiLCBcImZpbmFsaXplXCIsIHtcclxuICAgIHNpdGU6IHBlbmRpbmdEaXNwYXRjaC5yZWYuc2l0ZSxcclxuICAgIHJlcXVlc3RJZCxcclxuICAgIHJlc3VsdCxcclxuICB9KTtcclxuICBwZW5kaW5nRGlzcGF0Y2gucmVzb2x2ZShyZXN1bHQpO1xyXG59XHJcblxyXG4vLyDljaHniYfooqvlhbPpl63ml7bosIPnlKjvvJpcclxuLy8gMSkg5Y+W5raI5pys56uZ54K55ZyoIHBlbmRpbmdEaXNwYXRjaGVzIOmHjOaJgOacieWwmuacquWujOaIkOeahCBzZXRUaW1lb3V0IOmHjeivle+8jOW5tiByZXNvbHZlIOWvueW6lCBQcm9taXNl44CCXHJcbi8vIDIpIOWmguaenCBzZW5kU21hcnRUb1NpdGUg5Zyo562J5b6FIGlmcmFtZSDliqDovb3lrozvvIhwZW5kaW5nUXVlcnlSZXNvbHZlciDmnKrmiafooYzvvInvvIzkuZ/kuIDlubYgcmVzb2x2Ze+8jFxyXG4vLyAgICDpgb/lhY0gaGFuZGxlU2VuZFNlbGVjdGVkIOmHjOeahCBQcm9taXNlLmFsbCDmsLjkuI3lrozmiJDjgIFzdGF0ZS5pc1NlbmRpbmcg5Y2h5ZyoIHRydWXjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGFib3J0UGVuZGluZ1dvcmtGb3JTaXRlKHNpdGVJZCkge1xyXG4gIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLmRpc3BhdGNoXCIsIFwiYWJvcnQtc2l0ZVwiLCB7IHNpdGVJZCB9KTtcclxuICBjb25zdCB0b0NhbmNlbCA9IFtdO1xyXG4gIHN0YXRlLnBlbmRpbmdEaXNwYXRjaGVzLmZvckVhY2goKHBlbmRpbmcsIHJlcXVlc3RJZCkgPT4ge1xyXG4gICAgaWYgKHBlbmRpbmc/LnJlZj8uc2l0ZT8uaWQgPT09IHNpdGVJZCkge1xyXG4gICAgICB0b0NhbmNlbC5wdXNoKHJlcXVlc3RJZCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbiAgdG9DYW5jZWwuZm9yRWFjaCgocmVxdWVzdElkKSA9PiB7XHJcbiAgICBmaW5hbGl6ZVBlbmRpbmdEaXNwYXRjaChyZXF1ZXN0SWQsIHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBzaXRlSWQsXHJcbiAgICAgIGVycm9yOiBcIuWNoeeJh+W3suWFs+mXrVwiXHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgcmVmID0gc3RhdGUuY2FyZFJlZnMuZ2V0KHNpdGVJZCk7XHJcbiAgaWYgKHJlZj8ucGVuZGluZ1F1ZXJ5UmVzb2x2ZXIpIHtcclxuICAgIGNvbnN0IHJlc29sdmVyID0gcmVmLnBlbmRpbmdRdWVyeVJlc29sdmVyO1xyXG4gICAgcmVmLnBlbmRpbmdRdWVyeVJlc29sdmVyID0gbnVsbDtcclxuICAgIHJlZi5wZW5kaW5nUXVlcnkgPSBcIlwiO1xyXG4gICAgcmVmLnBlbmRpbmdRdWVyeURlbGF5TXMgPSAwO1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmVzb2x2ZXIoeyBvazogZmFsc2UsIHNpdGVJZCwgZXJyb3I6IFwi5Y2h54mH5bey5YWz6ZetXCIgfSk7XHJcbiAgICB9IGNhdGNoIChfZSkge1xyXG4gICAgICAvKiByZXNvbHZlciDlvILluLjkuI3lvbHlk43lhbPpl63mtYHnqIsgKi9cclxuICAgIH1cclxuICB9XHJcbiAgLy8g6aG65bim5pS25o6J5pys5byg5Y2h54mHIGlmcmFtZSDnm7jlhbPnmoTlu7bov5/liqDovb0gLyDotoXml7blm57pgIDlrprml7blmajvvIxcclxuICAvLyDpgb/lhY3lhbPpl63ljaHniYflkI4gMjVzIOWGheS7jeinpuWPkSByZW5kZXJGYWxsYmFjayDmk43kvZzlt7IgZGV0YWNoIOeahCBET03jgIJcclxuICBjbGVhcklmcmFtZVRpbWVycyhyZWYpO1xyXG4gIC8vIOS7juW5tuWPkemYn+WIl+WSjOWKoOi9veS4rembhuWQiOmHjOenu+mZpOi/meW8oOWNoeeJh++8m+WmguaenOWug+WOn+acrOWNoOedgOS4gOS4quanveS9je+8jFxyXG4gIC8vIOmHiuaUvuWQjueri+WIuyBwdW1wTG9hZFF1ZXVlIOiuqeWQjumdouaOkumYn+eahOWNoeeJh+ihpeS4iuOAglxyXG4gIGlmIChyZWYpIHtcclxuICAgIHJlbW92ZUZyb21Mb2FkUXVldWUocmVmKTtcclxuICAgIGlmIChzdGF0ZS5sb2FkaW5nUmVmcy5oYXMocmVmKSkge1xyXG4gICAgICBzdGF0ZS5sb2FkaW5nUmVmcy5kZWxldGUocmVmKTtcclxuICAgICAgcHVtcExvYWRRdWV1ZSgpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgc3RhdGUsIGVsZW1lbnRzIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgdXBkYXRlTGF0ZXN0SGlzdG9yeVVybCB9IGZyb20gXCIuL2hpc3RvcnkuanNcIjtcclxuaW1wb3J0IHsgcmVzb2x2ZVBlbmRpbmdEaXNwYXRjaCB9IGZyb20gXCIuL3NlbmQuanNcIjtcclxuaW1wb3J0IHsgZGlhZ25vc3RpY0xvZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvZGlhZ25vc3RpY3MuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVGcmFtZU1lc3NhZ2UoZXZlbnQpIHtcclxuICBjb25zdCBwYXlsb2FkID0gZXZlbnQuZGF0YTtcclxuICBpZiAoIXBheWxvYWQgfHwgIXBheWxvYWQudHlwZSB8fCAhcGF5bG9hZC5zaXRlSWQpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIC8vIOWuieWFqOagoemqjO+8mua2iOaBr+W/hemhu+adpeiHquaIkeS7rOW3sueZu+iusOeahOafkOW8oOWNoeeJh+eahCBpZnJhbWXvvIzkuJQgcGF5bG9hZC5zaXRlSWQg6KaB5LiO6K+l5Y2h54mH5Yy56YWN44CCXHJcbiAgLy8g6L+Z5qC35Y+v5Lul6Zi75q2i56ys5LiJ5pa55YaF5bWM5bm/5ZGKIC8g6Leo56uZIGlmcmFtZSDkvKrpgKAgVVJMX1VQREFURSAvIFJFU1VMVCDmsaHmn5MgVUkg5oiW5Y6G5Y+y6K6w5b2V44CCXHJcbiAgY29uc3QgcmVmID0gZmluZENhcmRSZWZCeU1lc3NhZ2VTb3VyY2UoZXZlbnQuc291cmNlKTtcclxuICBpZiAoIXJlZiB8fCByZWYuc2l0ZS5pZCAhPT0gcGF5bG9hZC5zaXRlSWQpIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLm1lc3NhZ2VcIiwgXCJzb3VyY2UtbWlzbWF0Y2hcIiwge1xyXG4gICAgICBwYXlsb2FkVHlwZTogcGF5bG9hZC50eXBlLFxyXG4gICAgICBzaXRlSWQ6IHBheWxvYWQuc2l0ZUlkLFxyXG4gICAgICBtYXRjaGVkU2l0ZUlkOiByZWY/LnNpdGU/LmlkLFxyXG4gICAgfSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBpZiAocGF5bG9hZC50eXBlID09PSBcIlFTSE9UX1VSTF9VUERBVEVcIikge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUubWVzc2FnZVwiLCBcInVybC11cGRhdGVcIiwgeyBzaXRlSWQ6IHBheWxvYWQuc2l0ZUlkLCBjdXJyZW50VXJsOiBwYXlsb2FkLmN1cnJlbnRVcmwgfSk7XHJcbiAgICByZWYuaW5qZWN0ZWRQaW5nZWQgPSB0cnVlO1xyXG4gICAgaWYgKHBheWxvYWQuY3VycmVudFVybCkge1xyXG4gICAgICByZWYuY3VycmVudFVybCA9IHBheWxvYWQuY3VycmVudFVybDtcclxuICAgICAgdXBkYXRlTGF0ZXN0SGlzdG9yeVVybChwYXlsb2FkLnNpdGVJZCwgcGF5bG9hZC5jdXJyZW50VXJsKTtcclxuICAgIH1cclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGlmIChwYXlsb2FkLnR5cGUgIT09IFwiUVNIT1RfUkVTVUxUXCIpIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJjb21wYXJlLm1lc3NhZ2VcIiwgXCJ1bmtub3duLXR5cGVcIiwgeyBwYXlsb2FkVHlwZTogcGF5bG9hZC50eXBlLCBzaXRlSWQ6IHBheWxvYWQuc2l0ZUlkIH0pO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgZGlhZ25vc3RpY0xvZyhcImNvbXBhcmUubWVzc2FnZVwiLCBcInJlc3VsdFwiLCB7XHJcbiAgICBzaXRlSWQ6IHBheWxvYWQuc2l0ZUlkLFxyXG4gICAgcmVxdWVzdElkOiBwYXlsb2FkLnJlcXVlc3RJZCxcclxuICAgIG9rOiBwYXlsb2FkLm9rLFxyXG4gICAgZXJyb3I6IHBheWxvYWQuZXJyb3IsXHJcbiAgfSk7XHJcblxyXG4gIGlmIChwYXlsb2FkLmN1cnJlbnRVcmwpIHtcclxuICAgIHJlZi5jdXJyZW50VXJsID0gcGF5bG9hZC5jdXJyZW50VXJsO1xyXG4gICAgdXBkYXRlTGF0ZXN0SGlzdG9yeVVybChwYXlsb2FkLnNpdGVJZCwgcGF5bG9hZC5jdXJyZW50VXJsKTtcclxuICB9XHJcblxyXG4gIGlmIChwYXlsb2FkLnJlcXVlc3RJZCkge1xyXG4gICAgcmVzb2x2ZVBlbmRpbmdEaXNwYXRjaChwYXlsb2FkLnJlcXVlc3RJZCwgcGF5bG9hZCk7XHJcbiAgfVxyXG5cclxuICBpZiAocGF5bG9hZC5vaykge1xyXG4gICAgc2V0U2l0ZVN0YXR1cyhwYXlsb2FkLnNpdGVJZCwgcGF5bG9hZC5tZXNzYWdlIHx8IFwiaWZyYW1lIOmhtemdouW3suWkhOeQhuafpeivouOAglwiLCBcInN1Y2Nlc3NcIik7XHJcbiAgfSBlbHNlIHtcclxuICAgIHNldFNpdGVTdGF0dXMocGF5bG9hZC5zaXRlSWQsIHBheWxvYWQuZXJyb3IgfHwgXCJpZnJhbWUg6aG16Z2i5aSE55CG5aSx6LSl44CCXCIsIFwiZXJyb3JcIik7XHJcbiAgfVxyXG59XHJcblxyXG4vLyDpgY3ljoblvZPliY3mtLvot4PnmoTljaHniYfvvIzmib7liLAgY29udGVudFdpbmRvdyA9PT0gc291cmNlIOeahOmCo+S4gOW8oOOAglxyXG4vLyDms6jmhI/vvJpBSSDnq5nngrnlhoXpg6jnmoQgc3ViLWlmcmFtZSDlj5HmnaXnmoTmtojmga/vvIxzb3VyY2Ug5Lya5piv6YKj5Liq5YaF6YOoIHdpbmRvd++8jFxyXG4vLyDljLnphY3kuI3kuIrmiJHku6znmoQgcmVmLmlmcmFtZUVsLmNvbnRlbnRXaW5kb3fvvIzkvJrooqvnm7TmjqXkuKLlvIPigJTigJTov5nmraPmmK/miJHku6zopoHnmoTjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRDYXJkUmVmQnlNZXNzYWdlU291cmNlKHNvdXJjZSkge1xyXG4gIGlmICghc291cmNlKSByZXR1cm4gbnVsbDtcclxuICBmb3IgKGNvbnN0IHJlZiBvZiBzdGF0ZS5jYXJkUmVmcy52YWx1ZXMoKSkge1xyXG4gICAgY29uc3Qgd2luID0gcmVmLmlmcmFtZUVsICYmIHJlZi5pZnJhbWVFbC5jb250ZW50V2luZG93O1xyXG4gICAgaWYgKHdpbiAmJiB3aW4gPT09IHNvdXJjZSkge1xyXG4gICAgICByZXR1cm4gcmVmO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFNpdGVTdGF0dXMoc2l0ZUlkLCBtZXNzYWdlLCBraW5kID0gXCJpbmZvXCIpIHtcclxuICBjb25zdCByZWYgPSBzdGF0ZS5jYXJkUmVmcy5nZXQoc2l0ZUlkKTtcclxuICBpZiAoIXJlZikge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgcmVmLnN0YXR1c0VsLnRleHRDb250ZW50ID0gbWVzc2FnZTtcclxuICByZWYuc3RhdHVzRWwuY2xhc3NMaXN0LnRvZ2dsZShcInN1Y2Nlc3MtdGV4dFwiLCBraW5kID09PSBcInN1Y2Nlc3NcIik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRHbG9iYWxTdGF0dXMobWVzc2FnZSwgaXNFcnJvciA9IGZhbHNlKSB7XHJcbiAgZWxlbWVudHMuZ2xvYmFsU3RhdHVzLnRleHRDb250ZW50ID0gbWVzc2FnZTtcclxuICBlbGVtZW50cy5nbG9iYWxTdGF0dXMuY2xhc3NMaXN0LnRvZ2dsZShcInN1Y2Nlc3MtdGV4dFwiLCAhaXNFcnJvcik7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVHbG9iYWxCdXR0b25zKGlzQnVzeSkge1xyXG4gIGVsZW1lbnRzLnNlbmRTZWxlY3RlZEJ0bi5kaXNhYmxlZCA9IGlzQnVzeTtcclxuICBpZiAoZWxlbWVudHMucHJvbXB0QXNzaXN0QnRuKSB7XHJcbiAgICBlbGVtZW50cy5wcm9tcHRBc3Npc3RCdG4uZGlzYWJsZWQgPSBpc0J1c3k7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlU2VuZEJ0blN0YXRlKCkge1xyXG4gIGNvbnN0IGhhc0NvbnRlbnQgPSBlbGVtZW50cy5xdWVyeUlucHV0LnZhbHVlLnRyaW0oKS5sZW5ndGggPiAwO1xyXG4gIGVsZW1lbnRzLnNlbmRTZWxlY3RlZEJ0bi5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtZW1wdHlcIiwgIWhhc0NvbnRlbnQpO1xyXG59XHJcbiIsICJjb25zdCBTSVRFX0hBTkRMRVJTX1BBVEggPSBcImNvbmZpZy9zaXRlSGFuZGxlcnMuanNvblwiO1xyXG5cclxubGV0IGJ1aWx0aW5TaXRlcyA9IG51bGw7XHJcbmxldCBidWlsdGluU2l0ZXNQcm9taXNlID0gbnVsbDtcclxubGV0IGRvbWFpbkluZGV4ID0gbnVsbDtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkQnVpbHRpblNpdGVzKG9wdGlvbnMgPSB7fSkge1xyXG4gIGNvbnN0IHsgZmFsbGJhY2tFbXB0eSA9IGZhbHNlIH0gPSBvcHRpb25zO1xyXG5cclxuICBpZiAoYnVpbHRpblNpdGVzKSByZXR1cm4gYnVpbHRpblNpdGVzO1xyXG4gIGlmIChidWlsdGluU2l0ZXNQcm9taXNlKSByZXR1cm4gYnVpbHRpblNpdGVzUHJvbWlzZTtcclxuXHJcbiAgYnVpbHRpblNpdGVzUHJvbWlzZSA9IGZldGNoKGNocm9tZS5ydW50aW1lLmdldFVSTChTSVRFX0hBTkRMRVJTX1BBVEgpKVxyXG4gICAgLnRoZW4oKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHRocm93IG5ldyBFcnJvcihcIuaXoOazleivu+WPluermeeCuemFjee9rlwiKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0pXHJcbiAgICAudGhlbigocGF5bG9hZCkgPT4ge1xyXG4gICAgICBidWlsdGluU2l0ZXMgPSBBcnJheS5pc0FycmF5KHBheWxvYWQuc2l0ZXMpID8gcGF5bG9hZC5zaXRlcyA6IFtdO1xyXG4gICAgICBkb21haW5JbmRleCA9IGJ1aWxkRG9tYWluSW5kZXgoYnVpbHRpblNpdGVzKTtcclxuICAgICAgcmV0dXJuIGJ1aWx0aW5TaXRlcztcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgIGlmICghZmFsbGJhY2tFbXB0eSkgdGhyb3cgZXJyb3I7XHJcbiAgICAgIGJ1aWx0aW5TaXRlcyA9IFtdO1xyXG4gICAgICBkb21haW5JbmRleCA9IG5ldyBNYXAoKTtcclxuICAgICAgcmV0dXJuIGJ1aWx0aW5TaXRlcztcclxuICAgIH0pXHJcbiAgICAuZmluYWxseSgoKSA9PiB7XHJcbiAgICAgIGJ1aWx0aW5TaXRlc1Byb21pc2UgPSBudWxsO1xyXG4gICAgfSk7XHJcblxyXG4gIHJldHVybiBidWlsdGluU2l0ZXNQcm9taXNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZEJ1aWx0aW5TaXRlRm9ySG9zdChob3N0bmFtZSwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgY29uc3Qgc2l0ZXMgPSBhd2FpdCBsb2FkQnVpbHRpblNpdGVzKG9wdGlvbnMpO1xyXG4gIGNvbnN0IG5vcm1hbGl6ZWRIb3N0ID0gbm9ybWFsaXplSG9zdChob3N0bmFtZSk7XHJcbiAgaWYgKCFub3JtYWxpemVkSG9zdCkgcmV0dXJuIG51bGw7XHJcblxyXG4gIGNvbnN0IGluZGV4ID0gZG9tYWluSW5kZXggfHwgYnVpbGREb21haW5JbmRleChzaXRlcyk7XHJcbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgZ2V0SG9zdENhbmRpZGF0ZXMobm9ybWFsaXplZEhvc3QpKSB7XHJcbiAgICBjb25zdCBtYXRjaGVzID0gaW5kZXguZ2V0KGNhbmRpZGF0ZSk7XHJcbiAgICBpZiAobWF0Y2hlcz8ubGVuZ3RoKSByZXR1cm4gbWF0Y2hlc1swXTtcclxuICB9XHJcblxyXG4gIC8vIEZhbGxiYWNrIGZvciB1bnVzdWFsIG1hdGNoIHBhdHRlcm5zIHRoYXQgYXJlIG5vdCBwbGFpbiBkb21haW5zLlxyXG4gIHJldHVybiBzaXRlcy5maW5kKChzaXRlKSA9PiBzaXRlTWF0Y2hlc0hvc3Qoc2l0ZSwgbm9ybWFsaXplZEhvc3QpKSB8fCBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplSG9zdCh2YWx1ZSkge1xyXG4gIHJldHVybiBTdHJpbmcodmFsdWUgfHwgXCJcIilcclxuICAgIC50cmltKClcclxuICAgIC50b0xvd2VyQ2FzZSgpXHJcbiAgICAucmVwbGFjZSgvXlxcKjpcXC9cXC8vLCBcIlwiKVxyXG4gICAgLnJlcGxhY2UoL15odHRwcz86XFwvXFwvLywgXCJcIilcclxuICAgIC5yZXBsYWNlKC9eXFwqXFwuLywgXCJcIilcclxuICAgIC5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIilcclxuICAgIC5yZXBsYWNlKC9cXC8uKiQvLCBcIlwiKVxyXG4gICAgLnJlcGxhY2UoLzpcXGQrJC8sIFwiXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBidWlsZERvbWFpbkluZGV4KHNpdGVzKSB7XHJcbiAgY29uc3QgaW5kZXggPSBuZXcgTWFwKCk7XHJcbiAgKHNpdGVzIHx8IFtdKS5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICBjb25zdCBwYXR0ZXJucyA9IEFycmF5LmlzQXJyYXkoc2l0ZS5tYXRjaFBhdHRlcm5zKSA/IHNpdGUubWF0Y2hQYXR0ZXJucyA6IFtdO1xyXG4gICAgcGF0dGVybnMuZm9yRWFjaCgocGF0dGVybikgPT4ge1xyXG4gICAgICBjb25zdCBob3N0ID0gbm9ybWFsaXplSG9zdChwYXR0ZXJuKTtcclxuICAgICAgaWYgKCFob3N0KSByZXR1cm47XHJcbiAgICAgIGNvbnN0IGxpc3QgPSBpbmRleC5nZXQoaG9zdCkgfHwgW107XHJcbiAgICAgIGxpc3QucHVzaChzaXRlKTtcclxuICAgICAgaW5kZXguc2V0KGhvc3QsIGxpc3QpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIGluZGV4O1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRIb3N0Q2FuZGlkYXRlcyhob3N0bmFtZSkge1xyXG4gIGNvbnN0IHBhcnRzID0gaG9zdG5hbWUuc3BsaXQoXCIuXCIpLmZpbHRlcihCb29sZWFuKTtcclxuICBjb25zdCBjYW5kaWRhdGVzID0gW107XHJcbiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBhcnRzLmxlbmd0aDsgaW5kZXggKz0gMSkge1xyXG4gICAgY2FuZGlkYXRlcy5wdXNoKHBhcnRzLnNsaWNlKGluZGV4KS5qb2luKFwiLlwiKSk7XHJcbiAgfVxyXG4gIHJldHVybiBjYW5kaWRhdGVzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaXRlTWF0Y2hlc0hvc3Qoc2l0ZSwgbm9ybWFsaXplZEhvc3QpIHtcclxuICBjb25zdCBwYXR0ZXJucyA9IEFycmF5LmlzQXJyYXkoc2l0ZS5tYXRjaFBhdHRlcm5zKSA/IHNpdGUubWF0Y2hQYXR0ZXJucyA6IFtdO1xyXG4gIHJldHVybiBwYXR0ZXJucy5zb21lKChwYXR0ZXJuKSA9PiB7XHJcbiAgICBjb25zdCBob3N0ID0gbm9ybWFsaXplSG9zdChwYXR0ZXJuKTtcclxuICAgIHJldHVybiBub3JtYWxpemVkSG9zdCA9PT0gaG9zdCB8fCBub3JtYWxpemVkSG9zdC5lbmRzV2l0aChgLiR7aG9zdH1gKTtcclxuICB9KTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQgeyBsb2FkQnVpbHRpblNpdGVzIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zaXRlLXJlZ2lzdHJ5LmpzXCI7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZFNpdGVzKCkge1xyXG4gIGNvbnN0IGJ1aWx0aW5TaXRlcyA9IChhd2FpdCBsb2FkQnVpbHRpblNpdGVzKCkpLmZpbHRlcigoc2l0ZSkgPT4gc2l0ZS5lbmFibGVkICE9PSBmYWxzZSk7XHJcbiAgY29uc3QgY3VzdG9tU2l0ZXMgPSBhd2FpdCBsb2FkQ3VzdG9tU2l0ZXNGcm9tU3RvcmFnZSgpO1xyXG4gIGNvbnN0IG1lcmdlZFNpdGVzID0gbWVyZ2VTaXRlTGlzdHMoYnVpbHRpblNpdGVzLCBjdXN0b21TaXRlcyk7XHJcbiAgc3RhdGUuYWxsU2l0ZXMgPSBtZXJnZWRTaXRlcztcclxuICBpZiAoQXJyYXkuaXNBcnJheShzdGF0ZS5yZXF1ZXN0ZWRTaXRlSWRzKSAmJiBzdGF0ZS5yZXF1ZXN0ZWRTaXRlSWRzLmxlbmd0aCA+IDApIHtcclxuICAgIGNvbnN0IHNpdGVCeUlkID0gbmV3IE1hcChtZXJnZWRTaXRlcy5tYXAoKHNpdGUpID0+IFtzaXRlLmlkLCBzaXRlXSkpO1xyXG4gICAgc3RhdGUuc2l0ZXMgPSBzdGF0ZS5yZXF1ZXN0ZWRTaXRlSWRzXHJcbiAgICAgIC5tYXAoKHNpdGVJZCkgPT4gc2l0ZUJ5SWQuZ2V0KHNpdGVJZCkpXHJcbiAgICAgIC5maWx0ZXIoQm9vbGVhbik7XHJcbiAgfSBlbHNlIHtcclxuICAgIHN0YXRlLnNpdGVzID0gbWVyZ2VkU2l0ZXM7XHJcbiAgfVxyXG4gIHN0YXRlLmhpZGRlblNpdGVJZHMuY2xlYXIoKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRDdXN0b21TaXRlc0Zyb21TdG9yYWdlKCkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1wiY3VzdG9tU2l0ZXNcIl0pO1xyXG4gICAgY29uc3QgbGlzdCA9IEFycmF5LmlzQXJyYXkoc3RvcmVkLmN1c3RvbVNpdGVzKSA/IHN0b3JlZC5jdXN0b21TaXRlcyA6IFtdO1xyXG4gICAgcmV0dXJuIGxpc3RcclxuICAgICAgLm1hcCgocmF3KSA9PiB7XHJcbiAgICAgICAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgY29uc3QgbmFtZSA9IFN0cmluZyhyYXcubmFtZSB8fCBcIlwiKS50cmltKCk7XHJcbiAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKHJhdy51cmwgfHwgXCJcIikudHJpbSgpO1xyXG4gICAgICAgIGNvbnN0IGlkID0gU3RyaW5nKHJhdy5pZCB8fCBcIlwiKS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFpZCB8fCAhbmFtZSB8fCAhdXJsKSByZXR1cm4gbnVsbDtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgaWQsXHJcbiAgICAgICAgICBuYW1lLFxyXG4gICAgICAgICAgdXJsLFxyXG4gICAgICAgICAgZW5hYmxlZDogcmF3LmVuYWJsZWQgIT09IGZhbHNlLFxyXG4gICAgICAgICAgc3VwcG9ydElmcmFtZTogcmF3LnN1cHBvcnRJZnJhbWUgIT09IGZhbHNlLFxyXG4gICAgICAgICAgc3VwcG9ydFVybFF1ZXJ5OiByYXcuc3VwcG9ydFVybFF1ZXJ5ICE9PSBmYWxzZSAmJiB1cmwuaW5jbHVkZXMoXCJ7cXVlcnl9XCIpLFxyXG4gICAgICAgICAgbWF0Y2hQYXR0ZXJuczogQXJyYXkuaXNBcnJheShyYXcubWF0Y2hQYXR0ZXJucykgPyByYXcubWF0Y2hQYXR0ZXJucy5tYXAoU3RyaW5nKSA6IFtdLFxyXG4gICAgICAgICAgaXNDdXN0b206IHRydWVcclxuICAgICAgICB9O1xyXG4gICAgICB9KVxyXG4gICAgICAuZmlsdGVyKChzaXRlKSA9PiBzaXRlICYmIHNpdGUuZW5hYmxlZCAhPT0gZmFsc2UpO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgcmV0dXJuIFtdO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlU2l0ZUxpc3RzKGJ1aWx0aW4sIGN1c3RvbSkge1xyXG4gIGNvbnN0IHJlc3VsdCA9IEFycmF5LmlzQXJyYXkoYnVpbHRpbikgPyBbLi4uYnVpbHRpbl0gOiBbXTtcclxuICBjb25zdCBzZWVuID0gbmV3IFNldChyZXN1bHQubWFwKChzaXRlKSA9PiBzaXRlLmlkKSk7XHJcbiAgKGN1c3RvbSB8fCBbXSkuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgaWYgKCFzaXRlIHx8IHNlZW4uaGFzKHNpdGUuaWQpKSByZXR1cm47XHJcbiAgICByZXN1bHQucHVzaChzaXRlKTtcclxuICAgIHNlZW4uYWRkKHNpdGUuaWQpO1xyXG4gIH0pO1xyXG4gIHJldHVybiByZXN1bHQ7XHJcbn1cclxuIiwgImltcG9ydCB7IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEIH0gZnJvbSBcIi4vc3RvcmFnZS1rZXlzLmpzXCI7XHJcblxyXG5mdW5jdGlvbiBpMThuKGtleSkge1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gY2hyb21lPy5pMThuPy5nZXRNZXNzYWdlPy4oa2V5KSB8fCB3aW5kb3cuX19RU0hPVF9JMThOX18/LnQ/LihrZXkpIHx8IFwiXCI7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEFsbFByb21wdEdyb3VwTmFtZSgpIHtcclxuICByZXR1cm4gaTE4bihcInNldHRpbmdzX3Byb21wdHNfYWxsR3JvdXBcIikgfHwgXCLlhajpg6hcIjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApIHtcclxuICByZXR1cm4gISFncm91cCAmJiBncm91cC5pZCA9PT0gREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRQcm9tcHRHcm91cERpc3BsYXlOYW1lKGdyb3VwKSB7XHJcbiAgaWYgKGlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApKSByZXR1cm4gZ2V0QWxsUHJvbXB0R3JvdXBOYW1lKCk7XHJcbiAgcmV0dXJuIGdyb3VwPy5uYW1lIHx8IGkxOG4oXCJvdmVybGF5X3VubmFtZWRQcm9tcHRHcm91cFwiKSB8fCBcIuacquWRveWQjeWIhue7hFwiO1xyXG59XHJcblxyXG4vLyBGbGF0dGVucyBhIGdyb3VwJ3MgcHJvbXB0IGxpc3QgZm9yIGRpc3BsYXkuIFdoZW4gdGhlIGdyb3VwIGlzIHRoZSB2aXJ0dWFsXHJcbi8vIFwiQWxsXCIgZ3JvdXAsIHVuaW9ucyBwcm9tcHRzIGFjcm9zcyBldmVyeSByZWFsIGdyb3VwIHdoaWxlIHJlbWVtYmVyaW5nIHRoZVxyXG4vLyBzb3VyY2UgZ3JvdXAgb24gZWFjaCBlbnRyeS5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldERpc3BsYXlQcm9tcHRFbnRyaWVzKGdyb3VwLCBhbGxHcm91cHMpIHtcclxuICBpZiAoIWdyb3VwKSByZXR1cm4gW107XHJcbiAgaWYgKGlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApKSB7XHJcbiAgICBjb25zdCBvdXQgPSBbXTtcclxuICAgIChhbGxHcm91cHMgfHwgW10pLmZvckVhY2goKGcpID0+IHtcclxuICAgICAgKGcucHJvbXB0cyB8fCBbXSkuZm9yRWFjaCgocHJvbXB0KSA9PiBvdXQucHVzaCh7IHByb21wdCwgc291cmNlR3JvdXA6IGcgfSkpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gb3V0O1xyXG4gIH1cclxuICByZXR1cm4gKGdyb3VwLnByb21wdHMgfHwgW10pLm1hcCgocHJvbXB0KSA9PiAoeyBwcm9tcHQsIHNvdXJjZUdyb3VwOiBncm91cCB9KSk7XHJcbn1cclxuIiwgImltcG9ydCB7IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdG9yYWdlLWtleXMuanNcIjtcclxuaW1wb3J0IHtcclxuICBpc0FsbFByb21wdEdyb3VwLFxyXG4gIGdldFByb21wdEdyb3VwRGlzcGxheU5hbWUsXHJcbiAgZ2V0RGlzcGxheVByb21wdEVudHJpZXMsXHJcbn0gZnJvbSBcIi4uLy4uL3NoYXJlZC9wcm9tcHQtZ3JvdXBzLmpzXCI7XHJcbmltcG9ydCB7IHN0YXRlLCBlbGVtZW50cywgU1RPUkFHRV9LRVlTLCBwcm9tcHRQcmV2aWV3IH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgZXNjYXBlSHRtbCwgc2V0UXVlcnlJbnB1dFZhbHVlIH0gZnJvbSBcIi4vdXRpbHMuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBiaW5kUHJvbXB0UGlja2VyRXZlbnRzKCkge1xyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldDtcclxuICAgIGlmICghKHRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQpIHx8ICFzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW4pIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0YXJnZXQuY2xvc2VzdChcIiNwcm9tcHRBc3Npc3RCdG5cIikgfHwgdGFyZ2V0LmNsb3Nlc3QoXCIjcHJvbXB0UGlja2VyXCIpKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjbG9zZVByb21wdFBpY2tlcigpO1xyXG4gIH0pO1xyXG5cclxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIgJiYgc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuKSB7XHJcbiAgICAgIGNsb3NlUHJvbXB0UGlja2VyKCk7XHJcbiAgICAgIGVsZW1lbnRzLnF1ZXJ5SW5wdXQ/LmZvY3VzKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVQcm9tcHRQaWNrZXIoKSB7XHJcbiAgc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuID0gIXN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbjtcclxuICByZW5kZXJQcm9tcHRQaWNrZXIoKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNsb3NlUHJvbXB0UGlja2VyKCkge1xyXG4gIGlmICghc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIHN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbiA9IGZhbHNlO1xyXG4gIGlmIChwcm9tcHRQcmV2aWV3Lm1ncikgcHJvbXB0UHJldmlldy5tZ3IuaGlkZSgpO1xyXG4gIHJlbmRlclByb21wdFBpY2tlcigpO1xyXG59XHJcblxyXG4vLyDilIDilIAg57yW6L6R5by556qXIOKUgOKUgFxyXG5leHBvcnQgZnVuY3Rpb24gb3BlblByb21wdEVkaXRNb2RhbChwcm9tcHQsIGdyb3VwSWQpIHtcclxuICBjbG9zZVByb21wdFBpY2tlcigpO1xyXG5cclxuICAvLyDmib7lvZPliY3nmoQgcHJvbXB0IOWvueixoe+8iOW8leeUqO+8iVxyXG4gIGxldCB0YXJnZXRHcm91cCA9IHN0YXRlLnByb21wdEdyb3Vwcy5maW5kKChnKSA9PiBnLmlkID09PSBncm91cElkKSB8fCBzdGF0ZS5wcm9tcHRHcm91cHNbMF07XHJcbiAgbGV0IHRhcmdldFByb21wdCA9IHRhcmdldEdyb3VwPy5wcm9tcHRzLmZpbmQoKHApID0+IHAuaWQgPT09IHByb21wdC5pZCk7XHJcbiAgaWYgKCF0YXJnZXRQcm9tcHQpIHJldHVybjtcclxuXHJcbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcInByb21wdC1lZGl0LW1vZGFsLW92ZXJsYXlcIjtcclxuXHJcbiAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIG1vZGFsLmNsYXNzTmFtZSA9IFwicHJvbXB0LWVkaXQtbW9kYWxcIjtcclxuICBtb2RhbC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWVkaXQtbW9kYWwtdGl0bGVcIj7nvJbovpHmj5DnpLror408L2Rpdj5cclxuICAgIDxkaXY+XHJcbiAgICAgIDxsYWJlbCBjbGFzcz1cInByb21wdC1lZGl0LWZpZWxkLWxhYmVsXCI+5ZCN56ewPC9sYWJlbD5cclxuICAgICAgPGlucHV0IGNsYXNzPVwicHJvbXB0LWVkaXQtaW5wdXRcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHtlc2NhcGVIdG1sKHRhcmdldFByb21wdC50aXRsZSB8fCBcIlwiKX1cIiAvPlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2PlxyXG4gICAgICA8bGFiZWwgY2xhc3M9XCJwcm9tcHQtZWRpdC1maWVsZC1sYWJlbFwiPuWIhuexuzwvbGFiZWw+XHJcbiAgICAgIDxzZWxlY3QgY2xhc3M9XCJwcm9tcHQtZWRpdC1zZWxlY3RcIj5cclxuICAgICAgICAke3N0YXRlLnByb21wdEdyb3Vwcy5tYXAoKGcpID0+IGA8b3B0aW9uIHZhbHVlPVwiJHtlc2NhcGVIdG1sKGcuaWQpfVwiJHtnLmlkID09PSBncm91cElkID8gXCIgc2VsZWN0ZWRcIiA6IFwiXCJ9PiR7ZXNjYXBlSHRtbChnZXRQcm9tcHRHcm91cERpc3BsYXlOYW1lKGcpKX08L29wdGlvbj5gKS5qb2luKFwiXCIpfVxyXG4gICAgICAgIDxvcHRpb24gdmFsdWU9XCJfX25ld19fXCI+77yLIOaWsOW7uuWIhue7hOKApjwvb3B0aW9uPlxyXG4gICAgICA8L3NlbGVjdD5cclxuICAgICAgPGlucHV0IGNsYXNzPVwicHJvbXB0LWVkaXQtaW5wdXQgcHJvbXB0LWVkaXQtbmV3LWdyb3VwLWlucHV0XCIgdHlwZT1cInRleHRcIiBwbGFjZWhvbGRlcj1cIui+k+WFpeaWsOWIhue7hOWQjeensFwiIHN0eWxlPVwiZGlzcGxheTpub25lO21hcmdpbi10b3A6OHB4O1wiIC8+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXY+XHJcbiAgICAgIDxsYWJlbCBjbGFzcz1cInByb21wdC1lZGl0LWZpZWxkLWxhYmVsXCI+5o+Q56S66K+N5YaF5a65PC9sYWJlbD5cclxuICAgICAgPHRleHRhcmVhIGNsYXNzPVwicHJvbXB0LWVkaXQtdGV4dGFyZWFcIj4ke2VzY2FwZUh0bWwodGFyZ2V0UHJvbXB0LmNvbnRlbnQgfHwgXCJcIil9PC90ZXh0YXJlYT5cclxuICAgIDwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cInByb21wdC1lZGl0LWFjdGlvbnNcIj5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cInByb21wdC1lZGl0LWRlbGV0ZS1idG5cIiB0eXBlPVwiYnV0dG9uXCI+5Yig6ZmkPC9idXR0b24+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJwcm9tcHQtZWRpdC1tYWluLWJ0bnNcIj5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwicHJvbXB0LWVkaXQtY2FuY2VsLWJ0blwiIHR5cGU9XCJidXR0b25cIj7lj5bmtog8L2J1dHRvbj5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwicHJvbXB0LWVkaXQtc2F2ZS1idG5cIiB0eXBlPVwiYnV0dG9uXCI+5L+d5a2YPC9idXR0b24+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgYDtcclxuXHJcbiAgY29uc3QgdGl0bGVJbnB1dCA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWVkaXQtaW5wdXRcIik7XHJcbiAgY29uc3QgZ3JvdXBTZWxlY3QgPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1lZGl0LXNlbGVjdFwiKTtcclxuICBjb25zdCBuZXdHcm91cElucHV0ID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdC1uZXctZ3JvdXAtaW5wdXRcIik7XHJcbiAgY29uc3QgY29udGVudElucHV0ID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdC10ZXh0YXJlYVwiKTtcclxuICBjb25zdCBjYW5jZWxCdG4gPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1lZGl0LWNhbmNlbC1idG5cIik7XHJcbiAgY29uc3Qgc2F2ZUJ0biA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWVkaXQtc2F2ZS1idG5cIik7XHJcbiAgY29uc3QgZGVsZXRlQnRuID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdC1kZWxldGUtYnRuXCIpO1xyXG5cclxuICAvLyDpgInmi6njgIzmlrDlu7rliIbnu4TjgI3ml7bmmL7npLrovpPlhaXmoYZcclxuICBncm91cFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XHJcbiAgICBjb25zdCBpc05ldyA9IGdyb3VwU2VsZWN0IGluc3RhbmNlb2YgSFRNTFNlbGVjdEVsZW1lbnQgJiYgZ3JvdXBTZWxlY3QudmFsdWUgPT09IFwiX19uZXdfX1wiO1xyXG4gICAgaWYgKG5ld0dyb3VwSW5wdXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSB7XHJcbiAgICAgIG5ld0dyb3VwSW5wdXQuc3R5bGUuZGlzcGxheSA9IGlzTmV3ID8gXCJibG9ja1wiIDogXCJub25lXCI7XHJcbiAgICAgIGlmIChpc05ldykgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IG5ld0dyb3VwSW5wdXQuZm9jdXMoKSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGNhbmNlbEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gb3ZlcmxheS5yZW1vdmUoKSk7XHJcbiAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGUpID0+IHsgaWYgKGUudGFyZ2V0ID09PSBvdmVybGF5KSBvdmVybGF5LnJlbW92ZSgpOyB9KTtcclxuXHJcbiAgc2F2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgY29uc3QgbmV3VGl0bGUgPSAodGl0bGVJbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQgPyB0aXRsZUlucHV0LnZhbHVlIDogXCJcIikudHJpbSgpIHx8IFwi5pyq5ZG95ZCN5o+Q56S66K+NXCI7XHJcbiAgICBjb25zdCBuZXdDb250ZW50ID0gY29udGVudElucHV0IGluc3RhbmNlb2YgSFRNTFRleHRBcmVhRWxlbWVudCA/IGNvbnRlbnRJbnB1dC52YWx1ZSA6IFwiXCI7XHJcbiAgICBsZXQgbmV3R3JvdXBJZCA9IGdyb3VwU2VsZWN0IGluc3RhbmNlb2YgSFRNTFNlbGVjdEVsZW1lbnQgPyBncm91cFNlbGVjdC52YWx1ZSA6IGdyb3VwSWQ7XHJcblxyXG4gICAgLy8g5aSE55CG5paw5bu65YiG57uEXHJcbiAgICBpZiAobmV3R3JvdXBJZCA9PT0gXCJfX25ld19fXCIpIHtcclxuICAgICAgY29uc3QgbmV3TmFtZSA9IChuZXdHcm91cElucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCA/IG5ld0dyb3VwSW5wdXQudmFsdWUgOiBcIlwiKS50cmltKCkgfHwgXCLmlrDlu7rliIbnu4RcIjtcclxuICAgICAgY29uc3QgbmV3R3JvdXAgPSB7IGlkOiBgcHJvbXB0LWdyb3VwLSR7RGF0ZS5ub3coKX1gLCBuYW1lOiBuZXdOYW1lLCBwcm9tcHRzOiBbXSB9O1xyXG4gICAgICBzdGF0ZS5wcm9tcHRHcm91cHMucHVzaChuZXdHcm91cCk7XHJcbiAgICAgIG5ld0dyb3VwSWQgPSBuZXdHcm91cC5pZDtcclxuICAgIH1cclxuXHJcbiAgICAvLyDku47ljp/liIbnu4TliKDpmaRcclxuICAgIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChnKSA9PiB7XHJcbiAgICAgIGcucHJvbXB0cyA9IGcucHJvbXB0cy5maWx0ZXIoKHApID0+IHAuaWQgIT09IHRhcmdldFByb21wdC5pZCk7XHJcbiAgICB9KTtcclxuICAgIC8vIOaUvuWFpeebruagh+WIhue7hFxyXG4gICAgY29uc3QgZGVzdEdyb3VwID0gc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGcpID0+IGcuaWQgPT09IG5ld0dyb3VwSWQpIHx8IHRhcmdldEdyb3VwO1xyXG4gICAgZGVzdEdyb3VwLnByb21wdHMucHVzaCh7IGlkOiB0YXJnZXRQcm9tcHQuaWQsIHRpdGxlOiBuZXdUaXRsZSwgY29udGVudDogbmV3Q29udGVudCB9KTtcclxuXHJcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbU1RPUkFHRV9LRVlTLnByb21wdEdyb3Vwc106IHN0YXRlLnByb21wdEdyb3VwcyB9KTtcclxuICAgIG92ZXJsYXkucmVtb3ZlKCk7XHJcbiAgfSk7XHJcblxyXG4gIGRlbGV0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShcIuehruWumuimgeWIoOmZpOi/meadoeaPkOekuuivjeWQl++8n1wiKSkgcmV0dXJuO1xyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLmZvckVhY2goKGcpID0+IHtcclxuICAgICAgZy5wcm9tcHRzID0gZy5wcm9tcHRzLmZpbHRlcigocCkgPT4gcC5pZCAhPT0gdGFyZ2V0UHJvbXB0LmlkKTtcclxuICAgIH0pO1xyXG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW1NUT1JBR0VfS0VZUy5wcm9tcHRHcm91cHNdOiBzdGF0ZS5wcm9tcHRHcm91cHMgfSk7XHJcbiAgICBvdmVybGF5LnJlbW92ZSgpO1xyXG4gIH0pO1xyXG5cclxuICBvdmVybGF5LmFwcGVuZENoaWxkKG1vZGFsKTtcclxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xyXG4gIGlmICh0aXRsZUlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkge1xyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRpdGxlSW5wdXQuZm9jdXMoKSk7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyUHJvbXB0UGlja2VyKCkge1xyXG4gIGlmICghZWxlbWVudHMucHJvbXB0UGlja2VyIHx8ICFlbGVtZW50cy5wcm9tcHRBc3Npc3RCdG4pIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGVsZW1lbnRzLnByb21wdEFzc2lzdEJ0bi5zdHlsZS5kaXNwbGF5ID0gc3RhdGUucHJvbXB0R3JvdXBzLmxlbmd0aCA+IDAgPyBcImlubGluZS1mbGV4XCIgOiBcIm5vbmVcIjtcclxuXHJcbiAgZWxlbWVudHMucHJvbXB0UGlja2VyLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgZWxlbWVudHMucHJvbXB0QXNzaXN0QnRuLnNldEF0dHJpYnV0ZShcImFyaWEtZXhwYW5kZWRcIiwgU3RyaW5nKHN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbikpO1xyXG5cclxuICBpZiAoIXN0YXRlLmlzUHJvbXB0UGlja2VyT3Blbikge1xyXG4gICAgZWxlbWVudHMucHJvbXB0UGlja2VyLmhpZGRlbiA9IHRydWU7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBlbGVtZW50cy5wcm9tcHRQaWNrZXIuaGlkZGVuID0gZmFsc2U7XHJcblxyXG4gIGlmICghc3RhdGUucHJvbXB0R3JvdXBzLmxlbmd0aCkge1xyXG4gICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZW1wdHkuY2xhc3NOYW1lID0gXCJwb3B1cC1wcm9tcHQtcGlja2VyLWVtcHR5XCI7XHJcbiAgICBlbXB0eS50ZXh0Q29udGVudCA9IFwi6L+Y5rKh5pyJ5o+Q56S66K+N5YiG57uE77yM6K+35YWI5Y676K6+572u6YeM5re75Yqg44CCXCI7XHJcbiAgICBlbGVtZW50cy5wcm9tcHRQaWNrZXIuYXBwZW5kQ2hpbGQoZW1wdHkpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgYWN0aXZlR3JvdXAgPSBzdGF0ZS5wcm9tcHRHcm91cHMuZmluZCgoZ3JvdXApID0+IGdyb3VwLmlkID09PSBzdGF0ZS5hY3RpdmVQcm9tcHRHcm91cElkKSB8fCBzdGF0ZS5wcm9tcHRHcm91cHNbMF07XHJcbiAgaWYgKCFhY3RpdmVHcm91cCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZ3JvdXBzQ29sdW1uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBncm91cHNDb2x1bW4uY2xhc3NOYW1lID0gXCJwb3B1cC1wcm9tcHQtZ3JvdXBzXCI7XHJcblxyXG4gIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGJ1dHRvbi5kYXRhc2V0Lmdyb3VwSWQgPSBncm91cC5pZDtcclxuICAgIGJ1dHRvbi5jbGFzc05hbWUgPSBgcG9wdXAtcHJvbXB0LWdyb3VwLWl0ZW0ke2dyb3VwLmlkID09PSBhY3RpdmVHcm91cC5pZCA/IFwiIGlzLWFjdGl2ZVwiIDogXCJcIn1gO1xyXG4gICAgYnV0dG9uLnRleHRDb250ZW50ID0gZ2V0UHJvbXB0R3JvdXBEaXNwbGF5TmFtZShncm91cCk7XHJcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4ge1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9PT0gZ3JvdXAuaWQpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9IGdyb3VwLmlkO1xyXG4gICAgICBzd2l0Y2hQcm9tcHRHcm91cCgpO1xyXG4gICAgfSk7XHJcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgaWYgKHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPT09IGdyb3VwLmlkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBncm91cC5pZDtcclxuICAgICAgc3dpdGNoUHJvbXB0R3JvdXAoKTtcclxuICAgIH0pO1xyXG4gICAgZ3JvdXBzQ29sdW1uLmFwcGVuZENoaWxkKGJ1dHRvbik7XHJcbiAgfSk7XHJcblxyXG4gIGVsZW1lbnRzLnByb21wdFBpY2tlci5hcHBlbmRDaGlsZChncm91cHNDb2x1bW4pO1xyXG4gIGVsZW1lbnRzLnByb21wdFBpY2tlci5hcHBlbmRDaGlsZChidWlsZFByb21wdHNDb2x1bW4oYWN0aXZlR3JvdXApKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRQcm9tcHRzQ29sdW1uKGFjdGl2ZUdyb3VwKSB7XHJcbiAgY29uc3QgcHJvbXB0c0NvbHVtbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcHJvbXB0c0NvbHVtbi5jbGFzc05hbWUgPSBcInBvcHVwLXByb21wdC1saXN0XCI7XHJcblxyXG4gIGNvbnN0IGVudHJpZXMgPSBnZXREaXNwbGF5UHJvbXB0RW50cmllcyhhY3RpdmVHcm91cCwgc3RhdGUucHJvbXB0R3JvdXBzKTtcclxuICBpZiAoIWVudHJpZXMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbXB0eS5jbGFzc05hbWUgPSBcInBvcHVwLXByb21wdC1waWNrZXItZW1wdHlcIjtcclxuICAgIGVtcHR5LnRleHRDb250ZW50ID0gaXNBbGxQcm9tcHRHcm91cChhY3RpdmVHcm91cClcclxuICAgICAgPyBcIui/mOayoeacieaPkOekuuivje+8jOivt+WFiOWOu+iuvue9rumHjOa3u+WKoOOAglwiXHJcbiAgICAgIDogXCLov5nkuKrliIbnu4Tph4zov5jmsqHmnInmj5DnpLror43jgIJcIjtcclxuICAgIHByb21wdHNDb2x1bW4uYXBwZW5kQ2hpbGQoZW1wdHkpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBwcm9tcHRQcmV2aWV3Lm1nciA9IHByb21wdFByZXZpZXcubWdyIHx8IHdpbmRvdy5Qcm9tcHRJdGVtVUkuY3JlYXRlUHJldmlld01hbmFnZXIobnVsbCk7XHJcbiAgICBlbnRyaWVzLmZvckVhY2goKHsgcHJvbXB0LCBzb3VyY2VHcm91cCB9KSA9PiB7XHJcbiAgICAgIGNvbnN0IGl0ZW0gPSB3aW5kb3cuUHJvbXB0SXRlbVVJLmNyZWF0ZUl0ZW0ocHJvbXB0LCB7XHJcbiAgICAgICAgb25GaWxsOiAocCkgPT4ge1xyXG4gICAgICAgICAgc2V0UXVlcnlJbnB1dFZhbHVlKHAuY29udGVudCB8fCBcIlwiLCB7IGZvY3VzOiB0cnVlIH0pO1xyXG4gICAgICAgICAgY2xvc2VQcm9tcHRQaWNrZXIoKTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIG9uRWRpdDogKHApID0+IG9wZW5Qcm9tcHRFZGl0TW9kYWwocCwgc291cmNlR3JvdXAuaWQpLFxyXG4gICAgICAgIHByZXZpZXdNYW5hZ2VyOiBwcm9tcHRQcmV2aWV3Lm1ncixcclxuICAgICAgfSk7XHJcbiAgICAgIHByb21wdHNDb2x1bW4uYXBwZW5kQ2hpbGQoaXRlbSk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIHByb21wdHNDb2x1bW47XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN3aXRjaFByb21wdEdyb3VwKCkge1xyXG4gIGlmICghZWxlbWVudHMucHJvbXB0UGlja2VyIHx8IGVsZW1lbnRzLnByb21wdFBpY2tlci5oaWRkZW4pIHJldHVybjtcclxuXHJcbiAgLy8g5Y+q5pu05paw5bem5L6n5YiG57G75oyJ6ZKu55qE5r+A5rS754q25oCB77yM5LiN6YeN5bu65bem5L6nXHJcbiAgZWxlbWVudHMucHJvbXB0UGlja2VyLnF1ZXJ5U2VsZWN0b3JBbGwoXCIucG9wdXAtcHJvbXB0LWdyb3VwLWl0ZW1cIikuZm9yRWFjaCgoYnRuKSA9PiB7XHJcbiAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZShcImlzLWFjdGl2ZVwiLCBidG4uZGF0YXNldC5ncm91cElkID09PSBzdGF0ZS5hY3RpdmVQcm9tcHRHcm91cElkKTtcclxuICB9KTtcclxuXHJcbiAgLy8g5LuF5pu/5o2i5Y+z5L6n5o+Q56S66K+N5YiX6KGoXHJcbiAgY29uc3QgYWN0aXZlR3JvdXAgPVxyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGcpID0+IGcuaWQgPT09IHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQpIHx8IHN0YXRlLnByb21wdEdyb3Vwc1swXTtcclxuICBpZiAoIWFjdGl2ZUdyb3VwKSByZXR1cm47XHJcblxyXG4gIGNvbnN0IG9sZExpc3QgPSBlbGVtZW50cy5wcm9tcHRQaWNrZXIucXVlcnlTZWxlY3RvcihcIi5wb3B1cC1wcm9tcHQtbGlzdFwiKTtcclxuICBjb25zdCBuZXdMaXN0ID0gYnVpbGRQcm9tcHRzQ29sdW1uKGFjdGl2ZUdyb3VwKTtcclxuICBpZiAob2xkTGlzdCkge1xyXG4gICAgb2xkTGlzdC5yZXBsYWNlV2l0aChuZXdMaXN0KTtcclxuICB9IGVsc2Uge1xyXG4gICAgZWxlbWVudHMucHJvbXB0UGlja2VyLmFwcGVuZENoaWxkKG5ld0xpc3QpO1xyXG4gIH1cclxufVxyXG5cclxuLy8gS2VlcCBERUZBVUxUX1BST01QVF9HUk9VUF9JRCBpbXBvcnRlZCBzbyB0cmVlLXNoYWtpbmcgZG9lc24ndCBkcm9wIGl0O1xyXG4vLyBwcm9tcHQtZ3JvdXBzIGhlbHBlcnMgcmVseSBvbiBpdCB0cmFuc2l0aXZlbHkuXHJcbmV4cG9ydCB7IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEIH07XHJcbiIsICJpbXBvcnQgeyBzdGF0ZSwgZWxlbWVudHMsIFNJVEVfQ0FURUdPUklFUyB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IGlzV2lkZU1lZGlhU2l0ZSB9IGZyb20gXCIuL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7IHNldEdsb2JhbFN0YXR1cyB9IGZyb20gXCIuL3N0YXR1cy5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIGFjdGl2YXRlU2Nyb2xsR3VhcmQsXHJcbiAgZ2V0U2Nyb2xsR3VhcmREdXJhdGlvbk1zLFxyXG4gIHJlbmRlclNpdGVOYXYsXHJcbiAgcmVuZGVyQ2FyZE5hdlN0cmlwLFxyXG4gIHVwZGF0ZVNjcm9sbEVkZ2VCdG5zLFxyXG59IGZyb20gXCIuL2xheW91dC5qc1wiO1xyXG5pbXBvcnQgeyBjcmVhdGVTaXRlQ2FyZCB9IGZyb20gXCIuL2NhcmRzLXJlbmRlci5qc1wiO1xyXG5cclxuLy8g4pSA4pSAIOS4tOaXtua3u+WKoOWNoeeJh++8iCvvvInpgInmi6nlmagg4pSA4pSAXHJcbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVBZGRTaXRlUGlja2VyKCkge1xyXG4gIGlmIChzdGF0ZS5pc0FkZFNpdGVQaWNrZXJPcGVuKSB7XHJcbiAgICBjbG9zZUFkZFNpdGVQaWNrZXIoKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgc3RhdGUuaXNBZGRTaXRlUGlja2VyT3BlbiA9IHRydWU7XHJcbiAgZWxlbWVudHMuYWRkU2l0ZUJ0bj8uc2V0QXR0cmlidXRlKFwiYXJpYS1leHBhbmRlZFwiLCBcInRydWVcIik7XHJcbiAgaWYgKGVsZW1lbnRzLmFkZFNpdGVQb3BvdmVyKSB7XHJcbiAgICBlbGVtZW50cy5hZGRTaXRlUG9wb3Zlci5oaWRkZW4gPSBmYWxzZTtcclxuICB9XHJcbiAgcmVuZGVyQWRkU2l0ZVBpY2tlcigpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2xvc2VBZGRTaXRlUGlja2VyKCkge1xyXG4gIGlmICghc3RhdGUuaXNBZGRTaXRlUGlja2VyT3Blbikge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBzdGF0ZS5pc0FkZFNpdGVQaWNrZXJPcGVuID0gZmFsc2U7XHJcbiAgZWxlbWVudHMuYWRkU2l0ZUJ0bj8uc2V0QXR0cmlidXRlKFwiYXJpYS1leHBhbmRlZFwiLCBcImZhbHNlXCIpO1xyXG4gIGlmIChlbGVtZW50cy5hZGRTaXRlUG9wb3Zlcikge1xyXG4gICAgZWxlbWVudHMuYWRkU2l0ZVBvcG92ZXIuaGlkZGVuID0gdHJ1ZTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRTaXRlc0ZvckNhdGVnb3J5KGNhdGVnb3J5SWQpIHtcclxuICBpZiAoIUFycmF5LmlzQXJyYXkoc3RhdGUuYWxsU2l0ZXMpIHx8IHN0YXRlLmFsbFNpdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIFtdO1xyXG4gIH1cclxuICBpZiAoY2F0ZWdvcnlJZCA9PT0gXCJjdXN0b21cIikge1xyXG4gICAgcmV0dXJuIHN0YXRlLmFsbFNpdGVzLmZpbHRlcigocykgPT4gcyAmJiBzLmlzQ3VzdG9tKTtcclxuICB9XHJcbiAgY29uc3QgY2F0ZWdvcnkgPSBTSVRFX0NBVEVHT1JJRVMuZmluZCgoYykgPT4gYy5pZCA9PT0gY2F0ZWdvcnlJZCk7XHJcbiAgY29uc3QgaWRzID0gbmV3IFNldChjYXRlZ29yeT8uYnVpbHRpbklkcyB8fCBbXSk7XHJcbiAgY29uc3QgYnlJZCA9IG5ldyBNYXAoc3RhdGUuYWxsU2l0ZXMubWFwKChzKSA9PiBbcy5pZCwgc10pKTtcclxuICByZXR1cm4gQXJyYXkuZnJvbShpZHMpLm1hcCgoaWQpID0+IGJ5SWQuZ2V0KGlkKSkuZmlsdGVyKEJvb2xlYW4pO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQWRkU2l0ZVBpY2tlcigpIHtcclxuICBpZiAoIWVsZW1lbnRzLmFkZFNpdGVUYWJzIHx8ICFlbGVtZW50cy5hZGRTaXRlTGlzdCkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgZWxlbWVudHMuYWRkU2l0ZVRhYnMuaW5uZXJIVE1MID0gXCJcIjtcclxuICBTSVRFX0NBVEVHT1JJRVMuZm9yRWFjaCgoY2F0ZWdvcnkpID0+IHtcclxuICAgIGNvbnN0IHRhYiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICB0YWIudHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgICB0YWIuY2xhc3NOYW1lID0gYGFkZC1zaXRlLXRhYiR7c3RhdGUuYWN0aXZlQWRkU2l0ZUNhdGVnb3J5ID09PSBjYXRlZ29yeS5pZCA/IFwiIGlzLWFjdGl2ZVwiIDogXCJcIn1gO1xyXG4gICAgdGFiLnRleHRDb250ZW50ID0gY2F0ZWdvcnkubGFiZWw7XHJcbiAgICB0YWIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgc3RhdGUuYWN0aXZlQWRkU2l0ZUNhdGVnb3J5ID0gY2F0ZWdvcnkuaWQ7XHJcbiAgICAgIHJlbmRlckFkZFNpdGVQaWNrZXIoKTtcclxuICAgIH0pO1xyXG4gICAgZWxlbWVudHMuYWRkU2l0ZVRhYnMuYXBwZW5kQ2hpbGQodGFiKTtcclxuICB9KTtcclxuXHJcbiAgZWxlbWVudHMuYWRkU2l0ZUxpc3QuaW5uZXJIVE1MID0gXCJcIjtcclxuICBjb25zdCBzaXRlcyA9IGdldFNpdGVzRm9yQ2F0ZWdvcnkoc3RhdGUuYWN0aXZlQWRkU2l0ZUNhdGVnb3J5KTtcclxuICBpZiAoc2l0ZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbXB0eS5jbGFzc05hbWUgPSBcImFkZC1zaXRlLWVtcHR5XCI7XHJcbiAgICBlbXB0eS50ZXh0Q29udGVudCA9IHN0YXRlLmFjdGl2ZUFkZFNpdGVDYXRlZ29yeSA9PT0gXCJjdXN0b21cIlxyXG4gICAgICA/IFwi6L+Y5rKh5pyJ6Ieq5a6a5LmJ56uZ54K577yM5YmN5b6A6K6+572u6aG15re75Yqg44CCXCJcclxuICAgICAgOiBcIuaaguaXoOWPr+a3u+WKoOeahOermeeCueOAglwiO1xyXG4gICAgZWxlbWVudHMuYWRkU2l0ZUxpc3QuYXBwZW5kQ2hpbGQoZW1wdHkpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgc2l0ZXMuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgY29uc3QgY2hpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICBjaGlwLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgY2hpcC5jbGFzc05hbWUgPSBcImFkZC1zaXRlLWNoaXBcIjtcclxuICAgIGNvbnN0IGlzQWxyZWFkeUFjdGl2ZSA9IHN0YXRlLmNhcmRSZWZzLmhhcyhzaXRlLmlkKTtcclxuICAgIGlmIChpc0FscmVhZHlBY3RpdmUpIHtcclxuICAgICAgY2hpcC5jbGFzc0xpc3QuYWRkKFwiaXMtYWN0aXZlXCIpO1xyXG4gICAgICBjaGlwLnRpdGxlID0gXCLor6XljaHniYflt7LlnKjpobXpnaLkuK1cIjtcclxuICAgIH1cclxuICAgIGNoaXAudGV4dENvbnRlbnQgPSBzaXRlLm5hbWUgfHwgc2l0ZS5pZDtcclxuICAgIGNoaXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgaWYgKHN0YXRlLmNhcmRSZWZzLmhhcyhzaXRlLmlkKSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBhZGRTaXRlQ2FyZFRvUGFnZShzaXRlKTtcclxuICAgICAgcmVuZGVyQWRkU2l0ZVBpY2tlcigpO1xyXG4gICAgfSk7XHJcbiAgICBlbGVtZW50cy5hZGRTaXRlTGlzdC5hcHBlbmRDaGlsZChjaGlwKTtcclxuICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGFkZFNpdGVDYXJkVG9QYWdlKHNpdGUpIHtcclxuICBpZiAoIXNpdGUgfHwgIXNpdGUuaWQpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIHN0YXRlLmhpZGRlblNpdGVJZHMuZGVsZXRlKHNpdGUuaWQpO1xyXG5cclxuICBpZiAoc3RhdGUuY2FyZFJlZnMuaGFzKHNpdGUuaWQpKSB7XHJcbiAgICBzZXRHbG9iYWxTdGF0dXMoYCR7c2l0ZS5uYW1lfSDljaHniYflt7LlnKjpobXpnaLkuK3jgIJgKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGlmICghc3RhdGUuc2l0ZXMuc29tZSgocykgPT4gcy5pZCA9PT0gc2l0ZS5pZCkpIHtcclxuICAgIHN0YXRlLnNpdGVzID0gWy4uLnN0YXRlLnNpdGVzLCBzaXRlXTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGVtcHR5U3RhdGUgPSBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIuZW1wdHktc3RhdGVcIik7XHJcbiAgaWYgKGVtcHR5U3RhdGUpIHtcclxuICAgIGVtcHR5U3RhdGUucmVtb3ZlKCk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBjYXJkID0gY3JlYXRlU2l0ZUNhcmQoc2l0ZSk7XHJcbiAgaWYgKGlzV2lkZU1lZGlhU2l0ZShzaXRlLmlkKSkge1xyXG4gICAgY2FyZC5jbGFzc0xpc3QuYWRkKFwiaWZyYW1lLWNhcmQtd2lkZS1tZWRpYVwiKTtcclxuICB9XHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5hcHBlbmRDaGlsZChjYXJkKTtcclxuXHJcbiAgaWYgKHN0YXRlLmxheW91dE1vZGUgPT09IFwic2lkZWJhclwiKSB7XHJcbiAgICBzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkID0gc2l0ZS5pZDtcclxuICAgIHN0YXRlLmNhcmRSZWZzLmZvckVhY2goKHJlZiwgc2l0ZUlkKSA9PiB7XHJcbiAgICAgIGlmIChyZWYuY2FyZEVsKSByZWYuY2FyZEVsLmhpZGRlbiA9IHNpdGVJZCAhPT0gc3RhdGUuYWN0aXZlU2lkZWJhclNpdGVJZDtcclxuICAgIH0pO1xyXG4gICAgcmVuZGVyU2l0ZU5hdigpO1xyXG4gIH1cclxuXHJcbiAgYWN0aXZhdGVTY3JvbGxHdWFyZChcclxuICAgIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsTGVmdCxcclxuICAgIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsVG9wLFxyXG4gICAgZ2V0U2Nyb2xsR3VhcmREdXJhdGlvbk1zKDEpXHJcbiAgKTtcclxuICB1cGRhdGVTY3JvbGxFZGdlQnRucygpO1xyXG4gIHJlbmRlckNhcmROYXZTdHJpcCgpO1xyXG4gIHNldEdsb2JhbFN0YXR1cyhg5bey5Zyo5b2T5YmN6aG16Z2i5Li05pe25re75YqgICR7c2l0ZS5uYW1lfSDljaHniYfjgIJgKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc3RhdGUsIGVsZW1lbnRzLCBTVE9SQUdFX0tFWVMgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIGdldFNlbGVjdGVkU2l0ZXMsXHJcbiAgcGFyc2VSZXF1ZXN0ZWRTaXRlSWRzLFxyXG4gIG5vcm1hbGl6ZVByb21wdEdyb3VwcyxcclxufSBmcm9tIFwiLi91dGlscy5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIHNldEdsb2JhbFN0YXR1cyxcclxuICB1cGRhdGVTZW5kQnRuU3RhdGUsXHJcbiAgaGFuZGxlRnJhbWVNZXNzYWdlLFxyXG59IGZyb20gXCIuL3N0YXR1cy5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIGFjdGl2YXRlU2Nyb2xsR3VhcmQsXHJcbiAgZ2V0U2Nyb2xsR3VhcmREdXJhdGlvbk1zLFxyXG4gIHVwZGF0ZVNjcm9sbEVkZ2VCdG5zLFxyXG4gIHVwZGF0ZUxheW91dFVpLFxyXG4gIHJlbmRlclNpdGVOYXYsXHJcbn0gZnJvbSBcIi4vbGF5b3V0LmpzXCI7XHJcbmltcG9ydCB7IGxvYWRTaXRlcyB9IGZyb20gXCIuL3NpdGVzLWxvYWRlci5qc1wiO1xyXG5pbXBvcnQgeyByZW5kZXJDYXJkcywgcmVmcmVzaFNpdGVDYXJkIH0gZnJvbSBcIi4vY2FyZHMtcmVuZGVyLmpzXCI7XHJcbmltcG9ydCB7IGhhbmRsZVNlbmRTZWxlY3RlZCwgbWF5YmVBdXRvU2VuZEZyb21VcmwgfSBmcm9tIFwiLi9zZW5kLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgcmVuZGVySGlzdG9yeUxpc3QsXHJcbiAgY2xlYXJBbGxIaXN0b3J5LFxyXG4gIHRvZ2dsZUhpc3RvcnlQYW5lbCxcclxuICBjbG9zZUhpc3RvcnlQYW5lbCxcclxuICBhcHBseUhpc3RvcnlSZXN0b3JlRnJvbVVybCxcclxufSBmcm9tIFwiLi9oaXN0b3J5LmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgYmluZFByb21wdFBpY2tlckV2ZW50cyxcclxuICByZW5kZXJQcm9tcHRQaWNrZXIsXHJcbiAgdG9nZ2xlUHJvbXB0UGlja2VyLFxyXG4gIGNsb3NlUHJvbXB0UGlja2VyLFxyXG59IGZyb20gXCIuL3Byb21wdHMuanNcIjtcclxuaW1wb3J0IHtcclxuICB0b2dnbGVBZGRTaXRlUGlja2VyLFxyXG4gIGNsb3NlQWRkU2l0ZVBpY2tlcixcclxufSBmcm9tIFwiLi9hZGQtc2l0ZS5qc1wiO1xyXG5pbXBvcnQgeyBzaG93RXhwb3J0TW9kYWwgfSBmcm9tIFwiLi9leHBvcnQuanNcIjtcclxuaW1wb3J0IHsgYmluZEZpbGVVcGxvYWRFdmVudHMgfSBmcm9tIFwiLi9maWxlLXVwbG9hZC5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGluaXRDb21wYXJlUGFnZSgpIHtcclxuICBjb25zdCB7IGFwcGx5RG9tSTE4biB9ID0gd2luZG93Ll9fUVNIT1RfSTE4Tl9fIHx8IHt9O1xyXG4gIHN0YXRlLl9hcHBseURvbUkxOG4gPSBhcHBseURvbUkxOG47XHJcblxyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIHN0YXJ0KTtcclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgaGFuZGxlRnJhbWVNZXNzYWdlKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc3RhcnQoKSB7XHJcbiAgdHJ5IHtcclxuICAgIHN0YXRlLl9hcHBseURvbUkxOG4/Lihkb2N1bWVudCk7XHJcbiAgICBjYWNoZUVsZW1lbnRzKCk7XHJcbiAgICBiaW5kRXZlbnRzKCk7XHJcbiAgICBiaW5kRmlsZVVwbG9hZEV2ZW50cygpO1xyXG4gICAgaHlkcmF0ZVF1ZXJ5RnJvbVVybCgpO1xyXG4gICAgdXBkYXRlU2VuZEJ0blN0YXRlKCk7XHJcbiAgICBhd2FpdCByZXN0b3JlUHJlZmVyZW5jZXMoKTtcclxuICAgIGJpbmRQcm9tcHRQaWNrZXJFdmVudHMoKTtcclxuICAgIGF3YWl0IGxvYWRTaXRlcygpO1xyXG4gICAgY29uc3QgcmVzdG9yZWRFbnRyeSA9IGFwcGx5SGlzdG9yeVJlc3RvcmVGcm9tVXJsKCk7XHJcbiAgICByZW5kZXJDYXJkcygpO1xyXG4gICAgc2V0R2xvYmFsU3RhdHVzKHJlc3RvcmVkRW50cnlcclxuICAgICAgPyBg5bey5aSN5Y6fIFwiJHtyZXN0b3JlZEVudHJ5LnF1ZXJ5IHx8IFwi5Y6G5Y+y6K6w5b2VXCJ9XCIg55qEICR7Z2V0U2VsZWN0ZWRTaXRlcygpLmxlbmd0aH0g5byg5Y2h54mH44CCYFxyXG4gICAgICA6IGDlt7LliqDovb0gJHtnZXRTZWxlY3RlZFNpdGVzKCkubGVuZ3RofSDkuKrnq5nngrnjgIJgKTtcclxuICAgIGF3YWl0IG1heWJlQXV0b1NlbmRGcm9tVXJsKCk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIHNldEdsb2JhbFN0YXR1cyhg5Yid5aeL5YyW5aSx6LSl77yaJHtlcnJvci5tZXNzYWdlfWAsIHRydWUpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY2FjaGVFbGVtZW50cygpIHtcclxuICBlbGVtZW50cy5xdWVyeUlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJxdWVyeUlucHV0XCIpO1xyXG4gIGVsZW1lbnRzLnNlbmRTZWxlY3RlZEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2VuZFNlbGVjdGVkQnRuXCIpO1xyXG4gIGVsZW1lbnRzLnByb21wdEFzc2lzdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvbXB0QXNzaXN0QnRuXCIpO1xyXG4gIGVsZW1lbnRzLnByb21wdFBpY2tlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvbXB0UGlja2VyXCIpO1xyXG4gIGVsZW1lbnRzLmdsb2JhbFN0YXR1cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ2xvYmFsU3RhdHVzXCIpO1xyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImlmcmFtZXMtY29udGFpbmVyXCIpO1xyXG4gIGVsZW1lbnRzLmxheW91dFRvZ2dsZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibGF5b3V0VG9nZ2xlQnRuXCIpO1xyXG4gIGVsZW1lbnRzLmxheW91dFBvcG92ZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxheW91dFBvcG92ZXJcIik7XHJcbiAgZWxlbWVudHMubGF5b3V0Um93c0J1dHRvbnMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXCJbZGF0YS1sYXlvdXQtcm93c11cIikpO1xyXG4gIGVsZW1lbnRzLmNhcmRTaXplQnV0dG9ucyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcIltkYXRhLWNhcmQtc2l6ZV1cIikpO1xyXG4gIGVsZW1lbnRzLmNhcmRTaXplR3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhcmRTaXplR3JvdXBcIik7XHJcbiAgZWxlbWVudHMuZXhwb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJleHBvcnRCdG5cIik7XHJcbiAgZWxlbWVudHMuaGlzdG9yeVRvZ2dsZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGlzdG9yeVRvZ2dsZUJ0blwiKTtcclxuICBlbGVtZW50cy5oaXN0b3J5UGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImhpc3RvcnlQYW5lbFwiKTtcclxuICBlbGVtZW50cy5oaXN0b3J5TGlzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaGlzdG9yeUxpc3RcIik7XHJcbiAgZWxlbWVudHMuY2xvc2VIaXN0b3J5UGFuZWxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsb3NlSGlzdG9yeVBhbmVsQnRuXCIpO1xyXG4gIGVsZW1lbnRzLmNsZWFySGlzdG9yeUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXJIaXN0b3J5QnRuXCIpO1xyXG4gIGVsZW1lbnRzLnNpdGVOYXZQYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2l0ZU5hdlBhbmVsXCIpO1xyXG4gIGVsZW1lbnRzLnNpdGVOYXZMaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzaXRlTmF2TGlzdFwiKTtcclxuICBlbGVtZW50cy5zaWRlYmFyTGF5b3V0QnRuID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIltkYXRhLWxheW91dC1tb2RlPSdzaWRlYmFyJ11cIik7XHJcbiAgZWxlbWVudHMuc2Nyb2xsVG9TdGFydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2Nyb2xsVG9TdGFydEJ0blwiKTtcclxuICBlbGVtZW50cy5zY3JvbGxUb0VuZEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2Nyb2xsVG9FbmRCdG5cIik7XHJcbiAgZWxlbWVudHMuc2Nyb2xsVG9Ub3BCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNjcm9sbFRvVG9wQnRuXCIpO1xyXG4gIGVsZW1lbnRzLnNjcm9sbFRvQm90dG9tQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzY3JvbGxUb0JvdHRvbUJ0blwiKTtcclxuICBlbGVtZW50cy5zY3JvbGxWZXJ0R3JvdXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNjcm9sbFZlcnRHcm91cFwiKTtcclxuICBlbGVtZW50cy5uZXdDaGF0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJuZXdDaGF0QnRuXCIpO1xyXG4gIGVsZW1lbnRzLnNldHRpbmdzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZXR0aW5nc0J0blwiKTtcclxuICBlbGVtZW50cy5hZGRTaXRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhZGRTaXRlQnRuXCIpO1xyXG4gIGVsZW1lbnRzLmFkZFNpdGVQb3BvdmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhZGRTaXRlUG9wb3ZlclwiKTtcclxuICBlbGVtZW50cy5hZGRTaXRlVGFicyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiYWRkU2l0ZVRhYnNcIik7XHJcbiAgZWxlbWVudHMuYWRkU2l0ZUxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFkZFNpdGVMaXN0XCIpO1xyXG4gIGVsZW1lbnRzLmNsb3NlQWRkU2l0ZVBvcG92ZXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNsb3NlQWRkU2l0ZVBvcG92ZXJCdG5cIik7XHJcbiAgZWxlbWVudHMuY2FyZE5hdlN0cmlwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYXJkTmF2U3RyaXBcIik7XHJcbiAgZWxlbWVudHMuZmlsZVVwbG9hZEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmlsZVVwbG9hZEJ0blwiKTtcclxuICBlbGVtZW50cy5maWxlVXBsb2FkSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbGVVcGxvYWRJbnB1dFwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYmluZEV2ZW50cygpIHtcclxuICBlbGVtZW50cy5zZW5kU2VsZWN0ZWRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZVNlbmRTZWxlY3RlZCk7XHJcbiAgZWxlbWVudHMucHJvbXB0QXNzaXN0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIHRvZ2dsZVByb21wdFBpY2tlcigpO1xyXG4gIH0pO1xyXG4gIGVsZW1lbnRzLnF1ZXJ5SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcclxuICAgIGNsb3NlUHJvbXB0UGlja2VyKCk7XHJcbiAgICB1cGRhdGVTZW5kQnRuU3RhdGUoKTtcclxuICB9KTtcclxuICBlbGVtZW50cy5xdWVyeUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGFzeW5jIChldmVudCkgPT4ge1xyXG4gICAgaWYgKGV2ZW50LmtleSAhPT0gXCJFbnRlclwiIHx8IGV2ZW50LnNoaWZ0S2V5KSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChldmVudC5pc0NvbXBvc2luZyB8fCBldmVudC5rZXlDb2RlID09PSAyMjkpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICBhd2FpdCBoYW5kbGVTZW5kU2VsZWN0ZWQoKTtcclxuICB9KTtcclxuICBlbGVtZW50cy5leHBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHNob3dFeHBvcnRNb2RhbCk7XHJcbiAgZWxlbWVudHMuaGlzdG9yeVRvZ2dsZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIHRvZ2dsZUhpc3RvcnlQYW5lbCgpO1xyXG4gIH0pO1xyXG4gIGVsZW1lbnRzLmNsb3NlSGlzdG9yeVBhbmVsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgY2xvc2VIaXN0b3J5UGFuZWwoKTtcclxuICB9KTtcclxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBpZiAoXHJcbiAgICAgIGVsZW1lbnRzLmhpc3RvcnlQYW5lbC5jbGFzc0xpc3QuY29udGFpbnMoXCJpcy1vcGVuXCIpICYmXHJcbiAgICAgICFlbGVtZW50cy5oaXN0b3J5UGFuZWwuY29udGFpbnMoZXZlbnQudGFyZ2V0KSAmJlxyXG4gICAgICAhZWxlbWVudHMuaGlzdG9yeVRvZ2dsZUJ0bi5jb250YWlucyhldmVudC50YXJnZXQpXHJcbiAgICApIHtcclxuICAgICAgY2xvc2VIaXN0b3J5UGFuZWwoKTtcclxuICAgIH1cclxuICB9KTtcclxuICBlbGVtZW50cy5jbGVhckhpc3RvcnlCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XHJcbiAgICBpZiAoc3RhdGUuc2VhcmNoSGlzdG9yeS5sZW5ndGggPT09IDApIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgYXdhaXQgY2xlYXJBbGxIaXN0b3J5KCk7XHJcbiAgfSk7XHJcbiAgZWxlbWVudHMubGF5b3V0VG9nZ2xlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBjb25zdCBpc0hpZGRlbiA9IGVsZW1lbnRzLmxheW91dFBvcG92ZXIuaGFzQXR0cmlidXRlKFwiaGlkZGVuXCIpO1xyXG4gICAgaWYgKGlzSGlkZGVuKSB7XHJcbiAgICAgIGVsZW1lbnRzLmxheW91dFBvcG92ZXIucmVtb3ZlQXR0cmlidXRlKFwiaGlkZGVuXCIpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZWxlbWVudHMubGF5b3V0UG9wb3Zlci5zZXRBdHRyaWJ1dGUoXCJoaWRkZW5cIiwgXCJcIik7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGVsZW1lbnRzLmxheW91dFJvd3NCdXR0b25zLmZvckVhY2goKGJ1dHRvbikgPT4ge1xyXG4gICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIHN0YXRlLmxheW91dFJvd3MgPSBOdW1iZXIoYnV0dG9uLmRhdGFzZXQubGF5b3V0Um93cyk7XHJcbiAgICAgIHN0YXRlLmxheW91dE1vZGUgPSBcImdyaWRcIjtcclxuICAgICAgdXBkYXRlTGF5b3V0VWkoKTtcclxuICAgICAgYXdhaXQgc2F2ZVByZWZlcmVuY2VzKCk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZWxlbWVudHMuY2FyZFNpemVCdXR0b25zLmZvckVhY2goKGJ1dHRvbikgPT4ge1xyXG4gICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgIHN0YXRlLmNhcmRTaXplTGV2ZWwgPSBidXR0b24uZGF0YXNldC5jYXJkU2l6ZTtcclxuICAgICAgdXBkYXRlTGF5b3V0VWkoKTtcclxuICAgICAgYXdhaXQgc2F2ZVByZWZlcmVuY2VzKCk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgZWxlbWVudHMuc2lkZWJhckxheW91dEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgIGlmIChzdGF0ZS5sYXlvdXRNb2RlID09PSBcInNpZGViYXJcIikge1xyXG4gICAgICBzdGF0ZS5sYXlvdXRNb2RlID0gXCJncmlkXCI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzdGF0ZS5sYXlvdXRNb2RlID0gXCJzaWRlYmFyXCI7XHJcbiAgICAgIGNvbnN0IGZpcnN0U2l0ZSA9IGdldFNlbGVjdGVkU2l0ZXMoKVswXTtcclxuICAgICAgaWYgKCFzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkIHx8ICFzdGF0ZS5jYXJkUmVmcy5oYXMoc3RhdGUuYWN0aXZlU2lkZWJhclNpdGVJZCkpIHtcclxuICAgICAgICBzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkID0gZmlyc3RTaXRlPy5pZCB8fCBudWxsO1xyXG4gICAgICB9XHJcbiAgICAgIHN0YXRlLmNhcmRSZWZzLmZvckVhY2goKHJlZiwgc2l0ZUlkKSA9PiB7XHJcbiAgICAgICAgaWYgKHJlZi5jYXJkRWwpIHJlZi5jYXJkRWwuaGlkZGVuID0gc2l0ZUlkICE9PSBzdGF0ZS5hY3RpdmVTaWRlYmFyU2l0ZUlkO1xyXG4gICAgICB9KTtcclxuICAgICAgcmVuZGVyU2l0ZU5hdigpO1xyXG4gICAgfVxyXG4gICAgdXBkYXRlTGF5b3V0VWkoKTtcclxuICAgIGF3YWl0IHNhdmVQcmVmZXJlbmNlcygpO1xyXG4gIH0pO1xyXG5cclxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBpZiAoIWVsZW1lbnRzLmxheW91dFBvcG92ZXIgfHwgZWxlbWVudHMubGF5b3V0UG9wb3Zlci5oYXNBdHRyaWJ1dGUoXCJoaWRkZW5cIikpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGluc2lkZVBvcG92ZXIgPSBlbGVtZW50cy5sYXlvdXRQb3BvdmVyLmNvbnRhaW5zKGV2ZW50LnRhcmdldCk7XHJcbiAgICBjb25zdCBpbnNpZGVUb2dnbGUgPSBlbGVtZW50cy5sYXlvdXRUb2dnbGVCdG4uY29udGFpbnMoZXZlbnQudGFyZ2V0KTtcclxuICAgIGlmICghaW5zaWRlUG9wb3ZlciAmJiAhaW5zaWRlVG9nZ2xlKSB7XHJcbiAgICAgIGVsZW1lbnRzLmxheW91dFBvcG92ZXIuc2V0QXR0cmlidXRlKFwiaGlkZGVuXCIsIFwiXCIpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJ3aGVlbFwiLCAoKSA9PiB7XHJcbiAgICBzdGF0ZS51c2VySXNTY3JvbGxpbmcgPSB0cnVlO1xyXG4gICAgY2xlYXJUaW1lb3V0KHN0YXRlLnVzZXJTY3JvbGxUaW1lcik7XHJcbiAgICBzdGF0ZS51c2VyU2Nyb2xsVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgc3RhdGUudXNlcklzU2Nyb2xsaW5nID0gZmFsc2U7XHJcbiAgICAgIHN0YXRlLnVzZXJTY3JvbGxUaW1lciA9IG51bGw7XHJcbiAgICAgIGlmIChzdGF0ZS5zY3JvbGxHdWFyZEFjdGl2ZSkge1xyXG4gICAgICAgIHN0YXRlLnNjcm9sbEd1YXJkTGVmdCA9IGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsTGVmdDtcclxuICAgICAgICBzdGF0ZS5zY3JvbGxHdWFyZFRvcCA9IGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsVG9wO1xyXG4gICAgICB9XHJcbiAgICB9LCA0MDApO1xyXG4gIH0sIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcclxuXHJcbiAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmRvd25cIiwgKCkgPT4ge1xyXG4gICAgc3RhdGUudXNlcklzU2Nyb2xsaW5nID0gdHJ1ZTtcclxuICB9LCB7IHBhc3NpdmU6IHRydWUgfSk7XHJcblxyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsICgpID0+IHtcclxuICAgIGlmIChzdGF0ZS51c2VySXNTY3JvbGxpbmcpIHtcclxuICAgICAgc3RhdGUudXNlcklzU2Nyb2xsaW5nID0gZmFsc2U7XHJcbiAgICAgIGlmIChzdGF0ZS5zY3JvbGxHdWFyZEFjdGl2ZSkge1xyXG4gICAgICAgIHN0YXRlLnNjcm9sbEd1YXJkTGVmdCA9IGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsTGVmdDtcclxuICAgICAgICBzdGF0ZS5zY3JvbGxHdWFyZFRvcCA9IGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsVG9wO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSwgeyBwYXNzaXZlOiB0cnVlIH0pO1xyXG5cclxuICAvLyBzY3JvbGxHdWFyZO+8muWKoOi9vemYtuautSBpZnJhbWUg5YaF6YOoIGZvY3VzL3NlbGVjdGlvbiDlj6/og73kvJrmiorlpJblsYLlrrnlmajoh6rliqjmu5rliLBcIuWvuem9kOWPr+inhuWMulwi55qE5L2N572u77yMXHJcbiAgLy8g6L+Z6YeM5ZCM5pe26ZSB5a6aIHNjcm9sbExlZnQg5ZKMIHNjcm9sbFRvcO+8jOaoquaOki/lpJrmjpLnvZHmoLzpg73og73nlJ/mlYjjgIJcclxuICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgKCkgPT4ge1xyXG4gICAgaWYgKCFzdGF0ZS5zY3JvbGxHdWFyZEFjdGl2ZSB8fCBzdGF0ZS51c2VySXNTY3JvbGxpbmcpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29udGFpbmVyID0gZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lcjtcclxuICAgIGlmIChjb250YWluZXIuc2Nyb2xsTGVmdCAhPT0gc3RhdGUuc2Nyb2xsR3VhcmRMZWZ0KSB7XHJcbiAgICAgIGNvbnRhaW5lci5zY3JvbGxMZWZ0ID0gc3RhdGUuc2Nyb2xsR3VhcmRMZWZ0O1xyXG4gICAgfVxyXG4gICAgaWYgKGNvbnRhaW5lci5zY3JvbGxUb3AgIT09IHN0YXRlLnNjcm9sbEd1YXJkVG9wKSB7XHJcbiAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgPSBzdGF0ZS5zY3JvbGxHdWFyZFRvcDtcclxuICAgIH1cclxuICB9LCB7IHBhc3NpdmU6IHRydWUgfSk7XHJcblxyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcihcIndoZWVsXCIsIChldmVudCkgPT4ge1xyXG4gICAgaWYgKHN0YXRlLmxheW91dFJvd3MgIT09IDEgfHwgc3RhdGUubGF5b3V0TW9kZSA9PT0gXCJzaWRlYmFyXCIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKE1hdGguYWJzKGV2ZW50LmRlbHRhWSkgPD0gTWF0aC5hYnMoZXZlbnQuZGVsdGFYKSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zY3JvbGxMZWZ0ICs9IGV2ZW50LmRlbHRhWSAqIDEuMjtcclxuICB9LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xyXG5cclxuICBlbGVtZW50cy5zY3JvbGxUb1N0YXJ0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgZWxlbWVudHMuaWZyYW1lc0NvbnRhaW5lci5zY3JvbGxUbyh7IGxlZnQ6IDAsIGJlaGF2aW9yOiBcInNtb290aFwiIH0pO1xyXG4gIH0pO1xyXG5cclxuICBlbGVtZW50cy5zY3JvbGxUb0VuZEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsVG8oeyBsZWZ0OiBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbFdpZHRoLCBiZWhhdmlvcjogXCJzbW9vdGhcIiB9KTtcclxuICB9KTtcclxuXHJcbiAgZWxlbWVudHMuc2Nyb2xsVG9Ub3BCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbFRvKHsgdG9wOiAwLCBiZWhhdmlvcjogXCJzbW9vdGhcIiB9KTtcclxuICB9KTtcclxuXHJcbiAgZWxlbWVudHMuc2Nyb2xsVG9Cb3R0b21CdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbFRvKHsgdG9wOiBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbEhlaWdodCwgYmVoYXZpb3I6IFwic21vb3RoXCIgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCB1cGRhdGVTY3JvbGxFZGdlQnRucywgeyBwYXNzaXZlOiB0cnVlIH0pO1xyXG5cclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCAoKSA9PiB7XHJcbiAgICB1cGRhdGVMYXlvdXRVaSgpO1xyXG4gIH0pO1xyXG5cclxuICBlbGVtZW50cy5uZXdDaGF0QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgZWxlbWVudHMucXVlcnlJbnB1dC52YWx1ZSA9IFwiXCI7XHJcbiAgICB1cGRhdGVTZW5kQnRuU3RhdGUoKTtcclxuXHJcbiAgICBhY3RpdmF0ZVNjcm9sbEd1YXJkKFxyXG4gICAgICBlbGVtZW50cy5pZnJhbWVzQ29udGFpbmVyLnNjcm9sbExlZnQsXHJcbiAgICAgIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuc2Nyb2xsVG9wLFxyXG4gICAgICBnZXRTY3JvbGxHdWFyZER1cmF0aW9uTXMoc3RhdGUuY2FyZFJlZnMuc2l6ZSlcclxuICAgICk7XHJcblxyXG4gICAgLy8g5paw5bu65a+56K+d5Lya6K6p5omA5pyJ5Y2h54mH5LiA6LW36YeN5paw5Yqg6L2977yM6L+Z6YeM5pi+5byP6LWw5bm25Y+R6Zif5YiX77yIaW1tZWRpYXRlPWZhbHNl77yJ77yMXHJcbiAgICAvLyDpgb/lhY0gTiDlvKDljaHniYflkIzml7blhrflkK/liqjmiZPmu6EgQ1BV44CC5Y2V5bygXCLliLfmlrBcIuaMiemSruS7jei1sOeri+WNs+i3r+W+hO+8iGltbWVkaWF0ZT10cnVl77yJ44CCXHJcbiAgICBzdGF0ZS5jYXJkUmVmcy5mb3JFYWNoKChyZWYpID0+IHtcclxuICAgICAgcmVmLnJlc3RvcmVVcmwgPSBcIlwiO1xyXG4gICAgICByZWZyZXNoU2l0ZUNhcmQocmVmLCB7IGltbWVkaWF0ZTogZmFsc2UgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBcIuaWsOW7uuWvueivnVwi5oSP5ZGz552A5omA5pyJ5Y2h54mH6YO95beyIHJlbG9hZO+8jOS4iuS4gOi9rueahOWvueivneWcqOmhtemdoumHjOW3sue7j+S4jeWtmOWcqOOAglxyXG4gICAgLy8g5oqK5pys6L2u5Lya6K+d55u45YWz55qE5YaF5a2Y54q25oCB5Lmf5LiA6LW35riF5o6J77yaXHJcbiAgICAvLyAgIC0gc2Vzc2lvblNuYXBzaG90c++8muS5i+WJjeWQhOi9rumXruetlOeahOW/q+eFp++8jOa4heaOiemBv+WFjeWvvOWHuuaXtua3t+WFpeW3suS4jeWPr+ingeeahOaXp+WvueivnVxyXG4gICAgLy8gICAtIGxhc3RTZWFyY2hRdWVyeSAvIGxhc3RTZWFyY2hUaW1l77ya5LiK5qyh6Zeu6aKY5YWD5L+h5oGv77yM5riF5o6J6YG/5YWN5a+85Ye65qCH6aKY5pi+56S66ZmI5pen6Zeu6aKYXHJcbiAgICAvLyDmkJzntKLljoblj7LvvIhzdGF0ZS5zZWFyY2hIaXN0b3J577yJ5piv5oyB5LmF5YyW55qE55So5oi36LWE5Lqn77yM5LiN5Zyo5q2k5riF55CG44CCXHJcbiAgICBzdGF0ZS5zZXNzaW9uU25hcHNob3RzID0gW107XHJcbiAgICBzdGF0ZS5zZXNzaW9uVmVyc2lvbiArPSAxO1xyXG4gICAgc3RhdGUubGFzdFNlYXJjaFF1ZXJ5ID0gbnVsbDtcclxuICAgIHN0YXRlLmxhc3RTZWFyY2hUaW1lID0gbnVsbDtcclxuICAgIHN0YXRlLmN1cnJlbnRIaXN0b3J5RW50cnlJZCA9IG51bGw7XHJcbiAgICBzdGF0ZS5oaXN0b3J5RW50cnlJZEJ5U2l0ZUlkLmNsZWFyKCk7XHJcblxyXG4gICAgc2V0R2xvYmFsU3RhdHVzKFwi5bey5paw5bu65a+56K+d77yM5omA5pyJ5Y2h54mH5bey6YeN572u44CCXCIpO1xyXG4gIH0pO1xyXG5cclxuICBlbGVtZW50cy5zZXR0aW5nc0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJPUEVOX1NFVFRJTkdTX1BBR0VcIiB9KTtcclxuICAgIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgICB3aW5kb3cub3BlbihjaHJvbWUucnVudGltZS5nZXRVUkwoXCJzZXR0aW5ncy9zZXR0aW5ncy5odG1sXCIpLCBcIl9ibGFua1wiLCBcIm5vb3BlbmVyLG5vcmVmZXJyZXJcIik7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGVsZW1lbnRzLmFkZFNpdGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgdG9nZ2xlQWRkU2l0ZVBpY2tlcigpO1xyXG4gIH0pO1xyXG5cclxuICAvLyDlnKjlvLnlsYLkuIrnlKggY2FwdHVyZSDpmLbmrrXorrDlvZXngrnlh7vkvY3nva7vvIzpgb/lhY3lrZDlhYPntKAgY2xpY2sg5pe25ZCM5q2l6YeN5riy5p+TXHJcbiAgLy8g5a+86Ie0IGV2ZW50LnRhcmdldCDohLHnprsgRE9N77yM5L2/5aSW5bGCIGRvY3VtZW50IOWIpOWumuWkseecn+iAjOivr+WFs+mXreW8ueWxguOAglxyXG4gIGVsZW1lbnRzLmFkZFNpdGVQb3BvdmVyPy5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIChldmVudCkgPT4ge1xyXG4gICAgc3RhdGUuX2FkZFNpdGVQaWNrZXJNb3VzZUluc2lkZSA9IGVsZW1lbnRzLmFkZFNpdGVQb3BvdmVyLmNvbnRhaW5zKGV2ZW50LnRhcmdldCk7XHJcbiAgfSwgdHJ1ZSk7XHJcblxyXG4gIGVsZW1lbnRzLmNsb3NlQWRkU2l0ZVBvcG92ZXJCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgY2xvc2VBZGRTaXRlUGlja2VyKCk7XHJcbiAgfSk7XHJcblxyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmICghc3RhdGUuaXNBZGRTaXRlUGlja2VyT3BlbiB8fCAhZWxlbWVudHMuYWRkU2l0ZVBvcG92ZXIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgaW5zaWRlUG9wb3ZlciA9IGVsZW1lbnRzLmFkZFNpdGVQb3BvdmVyLmNvbnRhaW5zKGV2ZW50LnRhcmdldCk7XHJcbiAgICBjb25zdCBpbnNpZGVCdG4gPSBlbGVtZW50cy5hZGRTaXRlQnRuPy5jb250YWlucyhldmVudC50YXJnZXQpO1xyXG4gICAgaWYgKCFpbnNpZGVQb3BvdmVyICYmICFpbnNpZGVCdG4pIHtcclxuICAgICAgY2xvc2VBZGRTaXRlUGlja2VyKCk7XHJcbiAgICB9XHJcbiAgfSwgdHJ1ZSk7XHJcblxyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmICghc3RhdGUuaXNBZGRTaXRlUGlja2VyT3BlbiB8fCAhZWxlbWVudHMuYWRkU2l0ZVBvcG92ZXIpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKHN0YXRlLl9hZGRTaXRlUGlja2VyTW91c2VJbnNpZGUpIHtcclxuICAgICAgc3RhdGUuX2FkZFNpdGVQaWNrZXJNb3VzZUluc2lkZSA9IGZhbHNlO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBpbnNpZGVQb3BvdmVyID0gZWxlbWVudHMuYWRkU2l0ZVBvcG92ZXIuY29udGFpbnMoZXZlbnQudGFyZ2V0KTtcclxuICAgIGNvbnN0IGluc2lkZUJ0biA9IGVsZW1lbnRzLmFkZFNpdGVCdG4/LmNvbnRhaW5zKGV2ZW50LnRhcmdldCk7XHJcbiAgICBpZiAoIWluc2lkZVBvcG92ZXIgJiYgIWluc2lkZUJ0bikge1xyXG4gICAgICBjbG9zZUFkZFNpdGVQaWNrZXIoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVzY2FwZVwiICYmIHN0YXRlLmlzQWRkU2l0ZVBpY2tlck9wZW4pIHtcclxuICAgICAgY2xvc2VBZGRTaXRlUGlja2VyKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCAoKSA9PiB7XHJcbiAgICBpZiAoIXN0YXRlLmlzQWRkU2l0ZVBpY2tlck9wZW4pIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICBpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBpbnN0YW5jZW9mIEhUTUxJRnJhbWVFbGVtZW50KSB7XHJcbiAgICAgICAgY2xvc2VBZGRTaXRlUGlja2VyKCk7XHJcbiAgICAgIH1cclxuICAgIH0sIDApO1xyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoeWRyYXRlUXVlcnlGcm9tVXJsKCkge1xyXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwod2luZG93LmxvY2F0aW9uLmhyZWYpO1xyXG4gIGNvbnN0IHF1ZXJ5ID0gdXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJxXCIpO1xyXG4gIGNvbnN0IHNpdGVzUGFyYW0gPSB1cmwuc2VhcmNoUGFyYW1zLmdldChcInNpdGVzXCIpO1xyXG4gIHN0YXRlLnJlc3RvcmVIaXN0b3J5RW50cnlJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KFwicmVzdG9yZUhpc3RvcnlJZFwiKTtcclxuICBzdGF0ZS5zaG91bGRBdXRvU2VuZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KFwiYXV0b3NlbmRcIikgPT09IFwiMVwiO1xyXG4gIHN0YXRlLnJlcXVlc3RlZFNpdGVJZHMgPSBwYXJzZVJlcXVlc3RlZFNpdGVJZHMoc2l0ZXNQYXJhbSk7XHJcbiAgaWYgKHF1ZXJ5KSB7XHJcbiAgICBlbGVtZW50cy5xdWVyeUlucHV0LnZhbHVlID0gcXVlcnk7XHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZXN0b3JlUHJlZmVyZW5jZXMoKSB7XHJcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtcclxuICAgIFNUT1JBR0VfS0VZUy5jYXJkU2l6ZUxldmVsLFxyXG4gICAgU1RPUkFHRV9LRVlTLmxheW91dFJvd3MsXHJcbiAgICBTVE9SQUdFX0tFWVMubGF5b3V0TW9kZSxcclxuICAgIFNUT1JBR0VfS0VZUy5zZWFyY2hIaXN0b3J5LFxyXG4gICAgU1RPUkFHRV9LRVlTLnByb21wdEdyb3Vwc1xyXG4gIF0pO1xyXG5cclxuICBpZiAodHlwZW9mIHN0b3JlZFtTVE9SQUdFX0tFWVMuY2FyZFNpemVMZXZlbF0gPT09IFwic3RyaW5nXCIpIHtcclxuICAgIHN0YXRlLmNhcmRTaXplTGV2ZWwgPSBzdG9yZWRbU1RPUkFHRV9LRVlTLmNhcmRTaXplTGV2ZWxdO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIHN0b3JlZFtTVE9SQUdFX0tFWVMubGF5b3V0Um93c10gPT09IFwibnVtYmVyXCIpIHtcclxuICAgIHN0YXRlLmxheW91dFJvd3MgPSBzdG9yZWRbU1RPUkFHRV9LRVlTLmxheW91dFJvd3NdO1xyXG4gIH1cclxuICBpZiAoc3RvcmVkW1NUT1JBR0VfS0VZUy5sYXlvdXRNb2RlXSA9PT0gXCJzaWRlYmFyXCIgfHwgc3RvcmVkW1NUT1JBR0VfS0VZUy5sYXlvdXRNb2RlXSA9PT0gXCJncmlkXCIpIHtcclxuICAgIHN0YXRlLmxheW91dE1vZGUgPSBzdG9yZWRbU1RPUkFHRV9LRVlTLmxheW91dE1vZGVdO1xyXG4gIH1cclxuICBpZiAoQXJyYXkuaXNBcnJheShzdG9yZWRbU1RPUkFHRV9LRVlTLnNlYXJjaEhpc3RvcnldKSkge1xyXG4gICAgc3RhdGUuc2VhcmNoSGlzdG9yeSA9IHN0b3JlZFtTVE9SQUdFX0tFWVMuc2VhcmNoSGlzdG9yeV07XHJcbiAgfVxyXG4gIHN0YXRlLnByb21wdEdyb3VwcyA9IG5vcm1hbGl6ZVByb21wdEdyb3VwcyhzdG9yZWRbU1RPUkFHRV9LRVlTLnByb21wdEdyb3Vwc10pO1xyXG4gIGlmICghc3RhdGUucHJvbXB0R3JvdXBzLnNvbWUoKGdyb3VwKSA9PiBncm91cC5pZCA9PT0gc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCkpIHtcclxuICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBzdGF0ZS5wcm9tcHRHcm91cHNbMF0/LmlkIHx8IG51bGw7XHJcbiAgfVxyXG4gIGVsZW1lbnRzLmlmcmFtZXNDb250YWluZXIuZGF0YXNldC5jb2x1bW5zID0gXCIxXCI7XHJcbiAgdXBkYXRlTGF5b3V0VWkoKTtcclxuICByZW5kZXJIaXN0b3J5TGlzdCgpO1xyXG4gIHJlbmRlclByb21wdFBpY2tlcigpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzYXZlUHJlZmVyZW5jZXMoKSB7XHJcbiAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHtcclxuICAgIFtTVE9SQUdFX0tFWVMuY2FyZFNpemVMZXZlbF06IHN0YXRlLmNhcmRTaXplTGV2ZWwsXHJcbiAgICBbU1RPUkFHRV9LRVlTLmxheW91dFJvd3NdOiBzdGF0ZS5sYXlvdXRSb3dzLFxyXG4gICAgW1NUT1JBR0VfS0VZUy5sYXlvdXRNb2RlXTogc3RhdGUubGF5b3V0TW9kZSxcclxuICAgIFtTVE9SQUdFX0tFWVMuc2VhcmNoSGlzdG9yeV06IHN0YXRlLnNlYXJjaEhpc3RvcnlcclxuICB9KTtcclxufVxyXG4iLCAiaW1wb3J0IHsgaW5pdENvbXBhcmVQYWdlIH0gZnJvbSBcIi4vaWZyYW1lL21haW4uanNcIjtcclxuaW5pdENvbXBhcmVQYWdlKCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBS08sTUFBTSxjQUFjLFdBQVcscUJBQXFCLENBQUM7QUFFckQsTUFBTSxlQUFlO0FBQUEsSUFDMUIsZUFBZTtBQUFBLElBQ2YsWUFBWTtBQUFBLElBQ1osWUFBWTtBQUFBLElBQ1osZUFBZTtBQUFBLElBQ2YsY0FBYztBQUFBLEVBQ2hCO0FBRU8sTUFBTSxrQkFBa0I7QUFBQSxJQUM3QixFQUFFLElBQUksTUFBTSxPQUFPLE1BQU0sWUFBWSxDQUFDLFlBQVksVUFBVSxRQUFRLFdBQVcsUUFBUSxVQUFVLFVBQVUsV0FBVyxVQUFVLE1BQU0sRUFBRTtBQUFBLElB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UUFBSSxDQUFDLE1BQU0sYUFBYSxLQUFLLENBQUMsVUFBVSxNQUFNLE9BQU8sTUFBTSxtQkFBbUIsR0FBRztBQUMvRSxZQUFNLHNCQUFzQixNQUFNLGFBQWEsQ0FBQyxHQUFHLE1BQU07QUFBQSxJQUMzRDtBQUNBLGFBQVMsaUJBQWlCLFFBQVEsVUFBVTtBQUM1QyxtQkFBZTtBQUNmLHNCQUFrQjtBQUNsQix1QkFBbUI7QUFBQSxFQUNyQjtBQUVBLGlCQUFlQSxtQkFBa0I7QUFDL0IsVUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJO0FBQUEsTUFDN0IsQ0FBQyxhQUFhLGFBQWEsR0FBRyxNQUFNO0FBQUEsTUFDcEMsQ0FBQyxhQUFhLFVBQVUsR0FBRyxNQUFNO0FBQUEsTUFDakMsQ0FBQyxhQUFhLFVBQVUsR0FBRyxNQUFNO0FBQUEsTUFDakMsQ0FBQyxhQUFhLGFBQWEsR0FBRyxNQUFNO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0g7OztBQ2xiQSxrQkFBZ0I7IiwKICAibmFtZXMiOiBbInJlZiIsICJidWlsdGluU2l0ZXMiLCAic2F2ZVByZWZlcmVuY2VzIl0KfQo=
