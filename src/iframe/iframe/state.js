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

export const SITE_CATEGORIES = [
  { id: "ai", label: "AI", builtinIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso", "gemini", "chatgpt", "claude", "grok"] },
  { id: "other", label: "社媒", builtinIds: ["xiaohongshu", "bilibili", "zhihu", "douyin"] },
  { id: "custom", label: "自定义", builtinIds: [] }
];

// 本轮会话内保留的历史问答快照上限。每条快照包含所有当前卡片的完整回答文本，
// 单条可能几十 KB 起步，长会话下不设上限会让页面内存持续增长。
// 20 条足够覆盖绝大多数"连续追问 + 一次性导出"的场景。
export const SESSION_SNAPSHOTS_MAX = 20;

export const state = {
  sites: [],
  allSites: [],
  requestedSiteIds: null,
  hiddenSiteIds: new Set(),
  cardRefs: new Map(),
  columnCount: "1",
  maximizedSiteId: null,
  shouldAutoSend: false,
  pendingDispatches: new Map(),
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
  loadingRefs: new Set(),
  loadQueue: []
};

export const elements = {};

// 预览卡片管理器（由 shared/prompt-item.js 提供）
export const promptPreview = { mgr: null };
