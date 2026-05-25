import { state, elements, STORAGE_KEYS } from "./state.js";
import {
  getSelectedSites,
  parseRequestedSiteIds,
  normalizePromptGroups,
} from "./utils.js";
import {
  setGlobalStatus,
  updateSendBtnState,
  handleFrameMessage,
} from "./status.js";
import {
  activateScrollGuard,
  getScrollGuardDurationMs,
  updateScrollEdgeBtns,
  updateLayoutUi,
  renderSiteNav,
} from "./layout.js";
import { loadSites } from "./sites-loader.js";
import { loadBuiltinSites } from "../../shared/site-registry.js";
import { renderCards, refreshSiteCard } from "./cards-render.js";
import { handleSendSelected, maybeAutoSendFromUrl } from "./send.js";
import {
  renderHistoryList,
  clearAllHistory,
  toggleHistoryPanel,
  closeHistoryPanel,
  applyHistoryRestoreFromUrl,
} from "./history.js";
import {
  bindPromptPickerEvents,
  renderPromptPicker,
  togglePromptPicker,
  closePromptPicker,
} from "./prompts.js";
import {
  toggleAddSitePicker,
  closeAddSitePicker,
} from "./add-site.js";
import { showExportModal } from "./export.js";
import { bindFileUploadEvents } from "./file-upload.js";
import { UI_PREFS_STORAGE_KEY, CUSTOM_SITES_STORAGE_KEY, DEFAULT_CARDS_STORAGE_KEY } from "../../shared/storage-keys.js";

let _darkModeMediaListener = null;

function applyDarkModeToDoc(mode) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (_darkModeMediaListener) {
    mq.removeEventListener("change", _darkModeMediaListener);
    _darkModeMediaListener = null;
  }
  if (mode === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else if (mode === "light") {
    document.documentElement.dataset.theme = "";
  } else {
    document.documentElement.dataset.theme = mq.matches ? "dark" : "";
    _darkModeMediaListener = (e) => {
      document.documentElement.dataset.theme = e.matches ? "dark" : "";
    };
    mq.addEventListener("change", _darkModeMediaListener);
  }
}

export function initComparePage() {
  const { applyDomI18n } = window.__QSHOT_I18N__ || {};
  state._applyDomI18n = applyDomI18n;

  document.addEventListener("DOMContentLoaded", start);
  window.addEventListener("message", handleFrameMessage);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[UI_PREFS_STORAGE_KEY]) return;
    const uiPrefs = changes[UI_PREFS_STORAGE_KEY].newValue || {};
    applyDarkModeToDoc(uiPrefs.darkMode);
  });
}

async function start() {
  try {
    // 把原本 3 次串行的 chrome.storage.local.get（UI 偏好 / 布局历史 / 自定义站点）
    // 合并为 1 次批量读取，同时与 siteHandlers.json 的 fetch 并行发起，
    // 消除两次额外的 IPC 往返，加快首屏到可交互的时间。
    const allStorageKeys = [
      UI_PREFS_STORAGE_KEY,
      STORAGE_KEYS.cardSizeLevel,
      STORAGE_KEYS.layoutRows,
      STORAGE_KEYS.layoutMode,
      STORAGE_KEYS.searchHistory,
      STORAGE_KEYS.promptGroups,
      CUSTOM_SITES_STORAGE_KEY,
      DEFAULT_CARDS_STORAGE_KEY,
    ];
    const [stored] = await Promise.all([
      chrome.storage.local.get(allStorageKeys),
      loadBuiltinSites({ fallbackEmpty: true }),
    ]);

    const uiPrefs = stored[UI_PREFS_STORAGE_KEY] || {};
    const lm = uiPrefs.localeMode;
    window.__QSHOT_I18N__?.setLocaleMode?.(lm === "zh" || lm === "en" ? lm : "auto");
    applyDarkModeToDoc(uiPrefs.darkMode);
    state._applyDomI18n?.(document);
    cacheElements();
    bindEvents();
    bindFileUploadEvents();
    hydrateQueryFromUrl();
    updateSendBtnState();
    await restorePreferences(stored);
    bindPromptPickerEvents();
    await loadSites({
      customSites: stored[CUSTOM_SITES_STORAGE_KEY],
      defaultCardIds: stored[DEFAULT_CARDS_STORAGE_KEY],
    });
    const restoredEntry = applyHistoryRestoreFromUrl();
    renderCards();
    setGlobalStatus(restoredEntry
      ? `已复原 "${restoredEntry.query || "历史记录"}" 的 ${getSelectedSites().length} 张卡片。`
      : `已加载 ${getSelectedSites().length} 个站点。`);
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
    if (
      elements.historyPanel.classList.contains("is-open") &&
      !elements.historyPanel.contains(event.target) &&
      !elements.historyToggleBtn.contains(event.target)
    ) {
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
      await savePreferences();
    });
  });

  elements.cardSizeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.cardSizeLevel = button.dataset.cardSize;
      updateLayoutUi();
      await savePreferences();
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
    await savePreferences();
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

  // scrollGuard：加载阶段 iframe 内部 focus/selection 可能会把外层容器自动滚到"对齐可视区"的位置，
  // 这里同时锁定 scrollLeft 和 scrollTop，横排/多排网格都能生效。
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

    // 新建对话会让所有卡片一起重新加载，这里显式走并发队列（immediate=false），
    // 避免 N 张卡片同时冷启动打满 CPU。单张"刷新"按钮仍走立即路径（immediate=true）。
    state.cardRefs.forEach((ref) => {
      ref.restoreUrl = "";
      refreshSiteCard(ref, { immediate: false });
    });

    // "新建对话"意味着所有卡片都已 reload，上一轮的对话在页面里已经不存在。
    // 把本轮会话相关的内存状态也一起清掉：
    //   - lastSearchQuery / lastSearchTime：上次问题元信息，清掉避免导出标题显示陈旧问题
    // 搜索历史（state.searchHistory）是持久化的用户资产，不在此清理。
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

  // 在弹层上用 capture 阶段记录点击位置，避免子元素 click 时同步重渲染
  // 导致 event.target 脱离 DOM，使外层 document 判定失真而误关闭弹层。
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

// preloaded: 由 start() 批量预读的 storage 数据（可选）。
// 传入时直接使用，否则回退到单独读取 storage（保持向后兼容）。
async function restorePreferences(preloaded) {
  const stored = preloaded || await chrome.storage.local.get([
    STORAGE_KEYS.cardSizeLevel,
    STORAGE_KEYS.layoutRows,
    STORAGE_KEYS.layoutMode,
    STORAGE_KEYS.searchHistory,
    STORAGE_KEYS.promptGroups,
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

async function savePreferences() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.cardSizeLevel]: state.cardSizeLevel,
    [STORAGE_KEYS.layoutRows]: state.layoutRows,
    [STORAGE_KEYS.layoutMode]: state.layoutMode,
    [STORAGE_KEYS.searchHistory]: state.searchHistory
  });
}
