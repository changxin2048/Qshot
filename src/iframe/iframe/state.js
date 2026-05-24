// Shared mutable state + element refs + constants for the compare page.
// Modules import this singleton and mutate fields directly instead of
// threading N arguments through call chains. main.js is the sole module
// that calls cacheElements() to populate `elements`.

export const BASE_CONFIG = globalThis.QSHOT_BASE_CONFIG || {};

export const STORAGE_KEYS = {
  cardSizeLevel: "cardSizeLevel",
  layoutRows: "layoutRows",
  layoutMode: "layoutMode",
  searchHistory: "searchHistory",
  promptGroups: "promptGroups"
};

export const DEFAULT_VISIBLE_SITE_IDS = ["deepseek", "kimi", "doubao", "gemini"];

export const SITE_CATEGORIES = [
  { id: "ai", label: "AI", builtinIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso", "gemini", "chatgpt", "claude", "grok"] },
  { id: "other", label: "社媒", builtinIds: ["xiaohongshu", "bilibili", "zhihu", "douyin", "twitter", "youtube", "reddit", "tiktok"] },
  { id: "custom", label: "自定义", builtinIds: [] }
];

export const state = {
  sites: [],
  allSites: [],
  requestedSiteIds: null,
  hiddenSiteIds: new Set(),
  cardRefs: new Map(),
  columnCount: "1",
  maximizedSiteId: null,
  shouldAutoSend: false,
  restoreHistoryEntryId: null,
  pendingDispatches: new Map(),
  pendingFileDispatches: new Map(),
  cardSizeLevel: "medium",
  layoutRows: 1,
  layoutMode: "grid",
  activeSidebarSiteId: null,
  searchHistory: [],
  currentHistoryEntryId: null,
  historyEntryIdBySiteId: new Map(),
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
  lastSearchQuery: null,
  lastSearchTime: null,
  isAddSitePickerOpen: false,
  activeAddSiteCategory: "ai",
  // 并发槽位系统：
  //   loadingRefs：当前处于"加载中"（已赋 src、尚未 load/error/超时）的 ref 集合，
  //                size 不会超过 BASE_CONFIG.iframeMaxConcurrent。
  //   loadQueue ：已创建 iframe DOM 但尚未被允许赋 src 的 ref 队列，按入队顺序 FIFO。
  // 每当 loadingRefs 里有 ref 完成/失败/超时时调用 pumpLoadQueue 从队列取下一个补位。
  loadingRefs: new Set(),
  loadQueue: []
};

export const elements = {};

// 预览卡片管理器（由 shared/prompt-item.js 提供）
export const promptPreview = { mgr: null };
