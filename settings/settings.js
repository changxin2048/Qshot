(() => {
  // src/shared/storage-keys.js
  var SEARCH_GROUPS_STORAGE_KEY = "searchGroups";
  var PROMPT_GROUPS_STORAGE_KEY = "promptGroups";
  var UI_PREFS_STORAGE_KEY = "uiPrefs";
  var CUSTOM_SITES_STORAGE_KEY = "customSites";
  var RANDOM_QUESTIONS_STORAGE_KEY = "randomQuestionsText";
  var DEFAULT_PROMPT_GROUP_ID = "prompt-group-default";
  var LEGACY_DEFAULT_GROUP_NAME = "默认分组";
  var RANDOM_QUESTIONS_FILES = {
    zh: "config/random-questions/zh-CN.txt",
    en: "config/random-questions/en.txt"
  };

  // src/settings/settings/state.js
  var qshotI18n = typeof window !== "undefined" && window.__QSHOT_I18N__ || {};
  var t = qshotI18n.t;
  var applyDomI18n = qshotI18n.applyDomI18n;
  var msg = (key, fallback) => t ? t(key) || fallback || "" : fallback || "";
  var PICKER_CLOSE_DELAY_MS = 320;
  var COMMON_SEARCH_PARAM_KEYS = [
    "q",
    "query",
    "wd",
    "word",
    "kw",
    "keyword",
    "s",
    "search",
    "key",
    "k",
    "text",
    "term",
    "w"
  ];
  var SITE_CATEGORIES = {
    ai: { label: "AI", siteIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso", "gemini", "chatgpt", "claude", "grok"] },
    other: { label: msg("settings_groups_categoryOther", "社媒平台"), siteIds: ["xiaohongshu", "bilibili", "zhihu", "douyin", "twitter", "youtube", "reddit", "tiktok"] },
    custom: { label: msg("settings_groups_categoryCustom", "自定义"), siteIds: [] }
  };
  var AI_SITE_GROUPS = [
    { label: msg("settings_groups_aiDomestic", "国内"), siteIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso"] },
    { label: msg("settings_groups_aiOverseas", "国外"), siteIds: ["gemini", "chatgpt", "claude", "grok"] }
  ];
  var SOCIAL_SITE_GROUPS = [
    { label: msg("settings_groups_socialDomestic", "国内"), siteIds: ["xiaohongshu", "bilibili", "zhihu", "douyin"] },
    { label: msg("settings_groups_socialOverseas", "海外"), siteIds: ["twitter", "youtube", "reddit", "tiktok"] }
  ];
  var SECTION_META = {
    groups: {
      eyebrowKey: "settings_groupsTitle",
      eyebrow: "搜索组设置",
      titleKey: "settings_sectionTitle_groups",
      title: "分组与调用内容",
      subtitleKey: "settings_sectionSubtitle_groups",
      subtitle: "管理搜索组名称、启用状态、打开方式，以及每个组内调用的网站或 AI 模型。"
    },
    prompts: {
      eyebrowKey: "settings_promptsTitle",
      eyebrow: "提示词设置",
      titleKey: "settings_meta_promptsTitle",
      title: "提示词管理",
      subtitleKey: "settings_meta_promptsSubtitle",
      subtitle: "自由添加和管理您的常用提示词，让每次输入更高效。"
    },
    custom: {
      eyebrowKey: "settings_customTitle",
      eyebrow: "自定义搜索",
      titleKey: "settings_meta_customTitle",
      title: "自定义搜索站点",
      subtitleKey: "settings_meta_customSubtitle",
      subtitle: "添加自己的搜索站点，保存后可在搜索组的“自定义”分类中直接勾选。"
    },
    random: {
      eyebrowKey: "settings_randomTitle",
      eyebrow: "随机问题库",
      titleKey: "settings_meta_randomTitle",
      title: "随机问题库",
      subtitleKey: "settings_meta_randomSubtitle",
      subtitle: "管理骰子按钮随机抽取的问题，一行一个问题。"
    },
    other: {
      eyebrowKey: "settings_shortcutsTitle",
      eyebrow: "快捷键设置",
      title: "",
      subtitle: ""
    },
    about: {
      eyebrow: "",
      title: "",
      subtitle: ""
    }
  };
  var GROUP_MODE_OPTIONS = [
    { value: "compare", label: msg("settings_groups_modeCompare", "卡片呈现") },
    { value: "tabs", label: msg("settings_groups_modeTabs", "新开标签") }
  ];
  var state = {
    groups: [],
    promptGroups: [],
    uiPrefs: null,
    randomQuestionsText: null,
    defaultRandomQuestionsText: "",
    sites: [],
    customSites: [],
    customFormState: createBlankCustomFormState(),
    activeSection: "groups",
    openPickerGroupId: null,
    activePickerCategoryKey: null,
    pickerCloseTimerId: null,
    activePromptGroupId: null,
    promptEditorState: null,
    pendingPromptGroupFocusId: null,
    renamingPromptGroupId: null,
    importModalState: null,
    _promptHoverTimer: null,
    _hoverCardKeyHandler: null,
    // DOM refs — populated in main.js#cacheElements.
    dom: {
      groupsSection: null,
      promptsSection: null,
      customSection: null,
      randomSection: null,
      otherSection: null,
      aboutSection: null,
      sectionEyebrow: null,
      sectionLogoWrap: null,
      sectionTitleRow: null,
      sectionTitle: null,
      sectionSubtitle: null,
      promptsHeaderActions: null,
      promptLearnLink: null,
      navItems: []
    },
    // Callbacks registered by main.js so section modules can trigger re-render
    // without creating import cycles.
    renderCurrentSection: () => {
    },
    renderGroupsSection: () => {
    },
    renderPromptsSection: () => {
    },
    renderCustomSection: () => {
    },
    renderRandomSection: () => {
    },
    renderOtherSection: () => {
    },
    renderAboutSection: () => {
    }
  };
  function createBlankCustomFormState() {
    return {
      mode: "create",
      editingId: null,
      name: "",
      url: "",
      converterInput: "",
      converterError: "",
      formError: ""
    };
  }

  // src/settings/settings/utils.js
  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function getGroupById(groupId) {
    return state.groups.find((item) => item.id === groupId) || null;
  }
  async function loadBuiltinSites() {
    const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
    const payload = await response.json();
    return (payload.sites || []).filter((site) => site.enabled !== false);
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

  // src/shared/shortcut.js
  var DEFAULT_SHORTCUT = Object.freeze({
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: "Q"
  });
  function normalizeKey(key) {
    if (!key) return "";
    if (key.length === 1) return key.toUpperCase();
    return key;
  }
  function normalizeShortcut(input) {
    if (!input || typeof input !== "object") return { ...DEFAULT_SHORTCUT };
    const key = typeof input.key === "string" && input.key.length > 0 ? input.key : DEFAULT_SHORTCUT.key;
    return {
      ctrlKey: !!input.ctrlKey,
      shiftKey: !!input.shiftKey,
      altKey: !!input.altKey,
      metaKey: !!input.metaKey,
      key: normalizeKey(key)
    };
  }
  function formatShortcut(sc) {
    if (!sc || !sc.key) {
      try {
        return chrome?.i18n?.getMessage?.("common_notSet") || "未设置";
      } catch (_e) {
        return "未设置";
      }
    }
    const parts = [];
    if (sc.ctrlKey) parts.push("Ctrl");
    if (sc.altKey) parts.push("Alt");
    if (sc.shiftKey) parts.push("Shift");
    if (sc.metaKey) parts.push(/Mac/i.test(navigator.platform) ? "Cmd" : "Win");
    parts.push(sc.key.length === 1 ? sc.key.toUpperCase() : sc.key);
    return parts.join(" + ");
  }
  function isShortcutValid(sc) {
    if (!sc || !sc.key) return false;
    if (sc.key === "Control" || sc.key === "Shift" || sc.key === "Alt" || sc.key === "Meta") return false;
    return sc.ctrlKey || sc.altKey || sc.metaKey || sc.shiftKey && sc.key.length > 1;
  }

  // src/settings/settings/store.js
  function createNormalizedGroups(input) {
    const validSiteIds = new Set(state.sites.map((site) => site.id));
    const source = Array.isArray(input) && input.length > 0 ? input : [
      { id: "default-hunza", name: "混搭搜索", enabled: true, mode: "compare", siteIds: ["gemini", "chatgpt", "deepseek", "doubao", "kimi", "metaso"] },
      { id: "default-overseas", name: "海外模型", enabled: true, mode: "compare", siteIds: ["gemini", "chatgpt", "claude", "grok"] },
      { id: "default-domestic", name: "国内模型", enabled: true, mode: "compare", siteIds: ["deepseek", "doubao", "kimi", "metaso"] },
      { id: "default-single", name: "单个模型", enabled: true, mode: "tabs", siteIds: ["gemini"] }
    ];
    return source.map((group) => ({
      ...group,
      name: String(group.name || "未命名搜索组"),
      enabled: group.enabled !== false,
      mode: group.mode === "tabs" ? "tabs" : "compare",
      siteIds: Array.isArray(group.siteIds) ? group.siteIds.filter((siteId, index, arr) => validSiteIds.has(siteId) && arr.indexOf(siteId) === index) : []
    }));
  }
  function createNormalizedPromptGroups(input) {
    const defaultName = getAllPromptGroupName();
    let source = Array.isArray(input) && input.length > 0 ? [...input] : [];
    if (source.length === 0) {
      source = [
        {
          id: DEFAULT_PROMPT_GROUP_ID,
          name: defaultName,
          prompts: [
            { id: "prompt-default-1", title: "总结重点", content: "请帮我总结这段内容的重点，并列出三条可执行建议。" }
          ]
        }
      ];
    } else {
      let defaultIndex = source.findIndex((g) => g && g.id === DEFAULT_PROMPT_GROUP_ID);
      if (defaultIndex < 0) {
        defaultIndex = source.findIndex((g) => g && g.name === LEGACY_DEFAULT_GROUP_NAME);
        if (defaultIndex >= 0) {
          source[defaultIndex] = { ...source[defaultIndex], id: DEFAULT_PROMPT_GROUP_ID };
        }
      }
      if (defaultIndex < 0) {
        source.unshift({ id: DEFAULT_PROMPT_GROUP_ID, name: defaultName, prompts: [] });
      } else {
        const def = source.splice(defaultIndex, 1)[0];
        def.name = defaultName;
        source.unshift(def);
      }
    }
    return source.map((group) => ({
      id: String(group.id || `prompt-group-${Date.now()}`),
      name: String(group.name || "未命名提示词分组"),
      prompts: Array.isArray(group.prompts) ? group.prompts.map((prompt, index) => ({
        id: String(prompt.id || `${group.id || "prompt"}-${index}`),
        title: String(prompt.title || "未命名提示词"),
        content: String(prompt.content || "")
      })) : []
    }));
  }
  function getDisplayPromptEntries(group) {
    if (!group) return [];
    if (isAllPromptGroup(group)) {
      const out = [];
      state.promptGroups.forEach((g) => {
        (g.prompts || []).forEach((prompt) => {
          out.push({ prompt, sourceGroup: g });
        });
      });
      return out;
    }
    return (group.prompts || []).map((prompt) => ({ prompt, sourceGroup: group }));
  }
  function createNormalizedUiPrefs(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      showHistory: source.showHistory === true,
      showRandomButton: source.showRandomButton !== false,
      showPromptButton: source.showPromptButton !== false,
      prewarmEnabled: source.prewarmEnabled !== false,
      overlayShortcutEnabled: source.overlayShortcutEnabled !== false,
      diagnosticLogsEnabled: source.diagnosticLogsEnabled === true,
      overlayShortcut: normalizeShortcut(source.overlayShortcut)
    };
  }
  function createNormalizedCustomSites(input) {
    if (!Array.isArray(input)) {
      return [];
    }
    const seenIds = /* @__PURE__ */ new Set();
    return input.map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const name = String(raw.name || "").trim();
      const url = String(raw.url || "").trim();
      if (!name || !url) return null;
      let id = String(raw.id || "").trim();
      if (!id || seenIds.has(id)) {
        id = createCustomSiteId();
      }
      seenIds.add(id);
      return {
        id,
        name,
        url,
        enabled: raw.enabled !== false,
        supportIframe: raw.supportIframe !== false,
        supportUrlQuery: raw.supportUrlQuery !== false && url.includes("{query}"),
        matchPatterns: Array.isArray(raw.matchPatterns) && raw.matchPatterns.length > 0 ? raw.matchPatterns.map((pattern) => String(pattern)) : deriveMatchPatterns(url),
        isCustom: true
      };
    }).filter(Boolean);
  }
  function createCustomSiteId() {
    return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  function deriveMatchPatterns(url) {
    try {
      const normalized = normalizeUrlForParse(url);
      const host = new URL(normalized).hostname.replace(/^www\./, "");
      return host ? [host] : [];
    } catch (_error) {
      return [];
    }
  }
  function normalizeUrlForParse(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }
  function mergeSites(builtin, custom) {
    const result = Array.isArray(builtin) ? [...builtin] : [];
    const knownIds = new Set(result.map((site) => site.id));
    (custom || []).forEach((site) => {
      if (!site || knownIds.has(site.id)) return;
      result.push(site);
      knownIds.add(site.id);
    });
    return result;
  }
  function syncCustomCategoryIds() {
    SITE_CATEGORIES.custom.siteIds = state.customSites.map((site) => site.id);
  }
  function convertUrlToTemplate(rawUrl) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) {
      return { ok: false, error: msg("settings_custom_convertEmpty", "请先粘贴一个 URL 再转换。") };
    }
    if (trimmed.includes("{query}")) {
      return { ok: true, url: trimmed, name: guessSiteNameFromUrl(trimmed) };
    }
    let parsed;
    try {
      parsed = new URL(normalizeUrlForParse(trimmed));
    } catch (_error) {
      return { ok: false, error: msg("settings_custom_convertInvalidUrl", "URL 格式不正确，请检查后重试。") };
    }
    const params = parsed.searchParams;
    const paramKeys = Array.from(params.keys());
    if (paramKeys.length > 0) {
      const priorityKey = COMMON_SEARCH_PARAM_KEYS.find(
        (key) => paramKeys.some((item) => item.toLowerCase() === key)
      );
      let targetKey = null;
      if (priorityKey) {
        targetKey = paramKeys.find((item) => item.toLowerCase() === priorityKey) || null;
      } else {
        targetKey = paramKeys.find((key) => String(params.get(key) || "").trim().length > 0) || paramKeys[0];
      }
      if (targetKey) {
        params.set(targetKey, "__AI_CUSTOM_QUERY_PLACEHOLDER__");
        const rebuilt = parsed.toString().replace("__AI_CUSTOM_QUERY_PLACEHOLDER__", "{query}");
        return { ok: true, url: rebuilt, name: guessSiteNameFromUrl(rebuilt) };
      }
    }
    return {
      ok: false,
      error: msg("settings_custom_convertNoParam", "未能识别到搜索参数。请提供带有搜索词参数的搜索结果链接，或手动在 URL 中把搜索词替换成 {query}。")
    };
  }
  function guessSiteNameFromUrl(url) {
    try {
      const parsed = new URL(normalizeUrlForParse(url));
      const host = parsed.hostname.replace(/^www\./, "");
      if (!host) return "";
      const first = host.split(".")[0] || host;
      return first.charAt(0).toUpperCase() + first.slice(1);
    } catch (_error) {
      return "";
    }
  }
  function getCategorySites(categoryKey) {
    const category = SITE_CATEGORIES[categoryKey];
    if (!category) return [];
    return category.siteIds.map((siteId) => state.sites.find((site) => site.id === siteId)).filter(Boolean);
  }
  async function persistAll() {
    state.customSites = createNormalizedCustomSites(state.customSites);
    const builtinSites = state.sites.filter((site) => !site.isCustom);
    state.sites = mergeSites(builtinSites, state.customSites);
    syncCustomCategoryIds();
    state.groups = createNormalizedGroups(state.groups);
    state.promptGroups = createNormalizedPromptGroups(state.promptGroups);
    state.uiPrefs = createNormalizedUiPrefs(state.uiPrefs);
    await chrome.storage.local.set({
      [SEARCH_GROUPS_STORAGE_KEY]: state.groups,
      [PROMPT_GROUPS_STORAGE_KEY]: state.promptGroups,
      [UI_PREFS_STORAGE_KEY]: state.uiPrefs,
      [CUSTOM_SITES_STORAGE_KEY]: state.customSites
    });
  }

  // src/settings/settings/drag.js
  function attachGroupDrag(container) {
    container.addEventListener("pointerdown", onGroupPointerDown);
    function onGroupPointerDown(e) {
      const handle = e.target.closest(".group-drag-handle");
      if (!handle) return;
      const card = handle.closest(".settings-group-card");
      if (!card) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const cardBorderRadius = window.getComputedStyle(card).borderRadius || "18px";
      const clone = card.cloneNode(true);
      clone.style.cssText = [
        "position:fixed",
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        "pointer-events:none",
        "z-index:9999",
        "box-shadow:0 12px 40px rgba(0,0,0,0.16)",
        "opacity:0.96",
        "transition:none",
        `border-radius:${cardBorderRadius}`
      ].join(";");
      document.body.appendChild(clone);
      card.style.opacity = "0";
      card.style.pointerEvents = "none";
      const lockedGroupId = state.groups[0]?.id;
      let lastInsertBefore = null;
      function onMove(ev) {
        clone.style.top = `${ev.clientY - offsetY}px`;
        const cloneCenterY = ev.clientY - offsetY + rect.height / 2;
        const otherCards = Array.from(container.querySelectorAll(".settings-group-card")).filter((c) => c !== card);
        const addCard = container.querySelector(".settings-add-card");
        let newInsertBefore = addCard;
        for (const other of otherCards) {
          const r = other.getBoundingClientRect();
          if (cloneCenterY < r.top + r.height / 2) {
            newInsertBefore = other;
            break;
          }
        }
        if (newInsertBefore && newInsertBefore.dataset && newInsertBefore.dataset.groupId === lockedGroupId) {
          newInsertBefore = newInsertBefore.nextElementSibling || addCard;
        }
        if (newInsertBefore !== lastInsertBefore) {
          const allCards = Array.from(container.querySelectorAll(".settings-group-card"));
          const firstPositions = /* @__PURE__ */ new Map();
          allCards.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));
          container.insertBefore(card, newInsertBefore);
          lastInsertBefore = newInsertBefore;
          allCards.filter((el) => el !== card).forEach((el) => {
            const first = firstPositions.get(el);
            if (!first) return;
            const last = el.getBoundingClientRect();
            const dy = first.top - last.top;
            if (Math.abs(dy) < 1) return;
            el.style.transition = "none";
            el.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.style.transition = "transform 200ms cubic-bezier(0.2,0,0,1)";
                el.style.transform = "";
              });
            });
          });
        }
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const finalRect = card.getBoundingClientRect();
        clone.style.transition = "top 160ms ease, box-shadow 160ms ease, opacity 160ms ease";
        clone.style.top = `${finalRect.top}px`;
        clone.style.boxShadow = "none";
        clone.style.opacity = "0";
        setTimeout(() => {
          clone.remove();
          card.style.opacity = "";
          card.style.pointerEvents = "";
          Array.from(container.querySelectorAll(".settings-group-card")).forEach((el) => {
            el.style.transition = "";
            el.style.transform = "";
          });
          const newGroupIds = Array.from(container.querySelectorAll(".settings-group-card")).map((c) => c.dataset.groupId);
          const reordered = newGroupIds.map((id) => state.groups.find((g) => g.id === id)).filter(Boolean);
          if (reordered.length === state.groups.length) {
            state.groups = reordered;
            persistAll();
          }
        }, 160);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }
  }
  function attachPromptGroupDrag(container) {
    container.addEventListener("pointerdown", onPointerDown);
    function onPointerDown(e) {
      const handle = e.target.closest(".prompt-group-nav-drag");
      if (!handle) return;
      const item = handle.closest(".prompt-group-nav-item");
      if (!item) return;
      if (item.dataset.groupId === DEFAULT_PROMPT_GROUP_ID) return;
      e.preventDefault();
      const rect = item.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const cardBorderRadius = window.getComputedStyle(item).borderRadius || "12px";
      const clone = item.cloneNode(true);
      clone.style.cssText = [
        "position:fixed",
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        "pointer-events:none",
        "z-index:9999",
        "box-shadow:0 12px 32px rgba(0,0,0,0.18)",
        "opacity:0.96",
        "transition:none",
        `border-radius:${cardBorderRadius}`,
        "background:#ffffff"
      ].join(";");
      document.body.appendChild(clone);
      item.style.opacity = "0";
      item.style.pointerEvents = "none";
      let lastInsertBefore = null;
      function onMove(ev) {
        clone.style.top = `${ev.clientY - offsetY}px`;
        const cloneCenterY = ev.clientY - offsetY + rect.height / 2;
        const otherItems = Array.from(container.querySelectorAll(".prompt-group-nav-item")).filter((c) => c !== item);
        let newInsertBefore = null;
        for (const other of otherItems) {
          const r = other.getBoundingClientRect();
          if (cloneCenterY < r.top + r.height / 2) {
            newInsertBefore = other;
            break;
          }
        }
        if (newInsertBefore && newInsertBefore.dataset && newInsertBefore.dataset.groupId === DEFAULT_PROMPT_GROUP_ID) {
          newInsertBefore = newInsertBefore.nextElementSibling;
        }
        if (newInsertBefore !== lastInsertBefore) {
          const allItems = Array.from(container.querySelectorAll(".prompt-group-nav-item"));
          const firstPositions = /* @__PURE__ */ new Map();
          allItems.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));
          if (newInsertBefore) {
            container.insertBefore(item, newInsertBefore);
          } else {
            container.appendChild(item);
          }
          lastInsertBefore = newInsertBefore;
          allItems.filter((el) => el !== item).forEach((el) => {
            const first = firstPositions.get(el);
            if (!first) return;
            const last = el.getBoundingClientRect();
            const dy = first.top - last.top;
            if (Math.abs(dy) < 1) return;
            el.style.transition = "none";
            el.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.style.transition = "transform 200ms cubic-bezier(0.2,0,0,1)";
                el.style.transform = "";
              });
            });
          });
        }
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const finalRect = item.getBoundingClientRect();
        clone.style.transition = "top 160ms ease, box-shadow 160ms ease, opacity 160ms ease";
        clone.style.top = `${finalRect.top}px`;
        clone.style.boxShadow = "none";
        clone.style.opacity = "0";
        setTimeout(async () => {
          clone.remove();
          item.style.opacity = "";
          item.style.pointerEvents = "";
          Array.from(container.querySelectorAll(".prompt-group-nav-item")).forEach((el) => {
            el.style.transition = "";
            el.style.transform = "";
          });
          const newGroupIds = Array.from(container.querySelectorAll(".prompt-group-nav-item")).map((c) => c.dataset.groupId);
          const reordered = newGroupIds.map((id) => state.promptGroups.find((g) => g.id === id)).filter(Boolean);
          if (reordered.length === state.promptGroups.length) {
            state.promptGroups = reordered;
            await persistAll();
            state.renderPromptsSection();
          }
        }, 160);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }
  }
  function attachPromptItemDrag(listEl, group) {
    listEl.addEventListener("pointerdown", onPromptPointerDown);
    function onPromptPointerDown(e) {
      const handle = e.target.closest(".prompt-card-drag-handle");
      if (!handle) return;
      const card = handle.closest(".prompt-card-item");
      if (!card) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const clone = card.cloneNode(true);
      clone.style.cssText = [
        "position:fixed",
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        "pointer-events:none",
        "z-index:9999",
        "box-shadow:0 8px 28px rgba(0,0,0,0.13)",
        "opacity:0.95",
        "transition:none",
        "border-radius:8px",
        "background:#fff"
      ].join(";");
      document.body.appendChild(clone);
      card.style.opacity = "0";
      card.style.pointerEvents = "none";
      let lastInsertBefore = null;
      function onMove(ev) {
        clone.style.top = `${ev.clientY - offsetY}px`;
        const cloneCenterY = ev.clientY - offsetY + rect.height / 2;
        const otherCards = Array.from(listEl.querySelectorAll(".prompt-card-item")).filter((c) => c !== card);
        let newInsertBefore = null;
        for (const other of otherCards) {
          const r = other.getBoundingClientRect();
          if (cloneCenterY < r.top + r.height / 2) {
            newInsertBefore = other;
            break;
          }
        }
        if (newInsertBefore !== lastInsertBefore) {
          const allCards = Array.from(listEl.querySelectorAll(".prompt-card-item"));
          const firstPositions = /* @__PURE__ */ new Map();
          allCards.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));
          listEl.insertBefore(card, newInsertBefore);
          lastInsertBefore = newInsertBefore;
          allCards.filter((el) => el !== card).forEach((el) => {
            const first = firstPositions.get(el);
            if (!first) return;
            const last = el.getBoundingClientRect();
            const dy = first.top - last.top;
            if (Math.abs(dy) < 1) return;
            el.style.transition = "none";
            el.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.style.transition = "transform 200ms cubic-bezier(0.2,0,0,1)";
                el.style.transform = "";
              });
            });
          });
        }
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const finalRect = card.getBoundingClientRect();
        clone.style.transition = "top 160ms ease, box-shadow 160ms ease, opacity 160ms ease";
        clone.style.top = `${finalRect.top}px`;
        clone.style.boxShadow = "none";
        clone.style.opacity = "0";
        setTimeout(() => {
          clone.remove();
          card.style.opacity = "";
          card.style.pointerEvents = "";
          Array.from(listEl.querySelectorAll(".prompt-card-item")).forEach((el) => {
            el.style.transition = "";
            el.style.transform = "";
          });
          const newPromptIds = Array.from(listEl.querySelectorAll(".prompt-card-item")).map((c) => c.dataset.promptId);
          const reordered = newPromptIds.map((id) => group.prompts.find((p) => p.id === id)).filter(Boolean);
          if (reordered.length === group.prompts.length) {
            group.prompts = reordered;
            persistAll();
          }
        }, 160);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }
  }
  function attachPromptItemDragAll(listEl) {
    listEl.addEventListener("pointerdown", onPromptPointerDown);
    function onPromptPointerDown(e) {
      const handle = e.target.closest(".prompt-card-drag-handle");
      if (!handle) return;
      const card = handle.closest(".prompt-card-item");
      if (!card) return;
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const clone = card.cloneNode(true);
      clone.style.cssText = [
        "position:fixed",
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        "pointer-events:none",
        "z-index:9999",
        "box-shadow:0 8px 28px rgba(0,0,0,0.13)",
        "opacity:0.95",
        "transition:none",
        "border-radius:8px",
        "background:#fff"
      ].join(";");
      document.body.appendChild(clone);
      card.style.opacity = "0";
      card.style.pointerEvents = "none";
      let lastInsertBefore = null;
      function onMove(ev) {
        clone.style.top = `${ev.clientY - offsetY}px`;
        const cloneCenterY = ev.clientY - offsetY + rect.height / 2;
        const otherCards = Array.from(listEl.querySelectorAll(".prompt-card-item")).filter((c) => c !== card);
        let newInsertBefore = null;
        for (const other of otherCards) {
          const r = other.getBoundingClientRect();
          if (cloneCenterY < r.top + r.height / 2) {
            newInsertBefore = other;
            break;
          }
        }
        if (newInsertBefore !== lastInsertBefore) {
          const allCards = Array.from(listEl.querySelectorAll(".prompt-card-item"));
          const firstPositions = /* @__PURE__ */ new Map();
          allCards.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));
          listEl.insertBefore(card, newInsertBefore);
          lastInsertBefore = newInsertBefore;
          allCards.filter((el) => el !== card).forEach((el) => {
            const first = firstPositions.get(el);
            if (!first) return;
            const last = el.getBoundingClientRect();
            const dy = first.top - last.top;
            if (Math.abs(dy) < 1) return;
            el.style.transition = "none";
            el.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.style.transition = "transform 200ms cubic-bezier(0.2,0,0,1)";
                el.style.transform = "";
              });
            });
          });
        }
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const finalRect = card.getBoundingClientRect();
        clone.style.transition = "top 160ms ease, box-shadow 160ms ease, opacity 160ms ease";
        clone.style.top = `${finalRect.top}px`;
        clone.style.boxShadow = "none";
        clone.style.opacity = "0";
        setTimeout(() => {
          clone.remove();
          card.style.opacity = "";
          card.style.pointerEvents = "";
          Array.from(listEl.querySelectorAll(".prompt-card-item")).forEach((el) => {
            el.style.transition = "";
            el.style.transform = "";
          });
          const groupOrderMap = /* @__PURE__ */ new Map();
          Array.from(listEl.querySelectorAll(".prompt-card-item")).forEach((el) => {
            const gId = el.dataset.groupId;
            if (!groupOrderMap.has(gId)) groupOrderMap.set(gId, []);
            groupOrderMap.get(gId).push(el.dataset.promptId);
          });
          let changed = false;
          groupOrderMap.forEach((promptIds, gId) => {
            const group = state.promptGroups.find((g) => g.id === gId);
            if (!group) return;
            const reordered = promptIds.map((id) => group.prompts.find((p) => p.id === id)).filter(Boolean);
            if (reordered.length === group.prompts.length) {
              group.prompts = reordered;
              changed = true;
            }
          });
          if (changed) persistAll();
        }, 160);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }
  }
  function attachChipDrag(chipsWrap, group) {
    chipsWrap.addEventListener("pointerdown", onPointerDown);
    function onPointerDown(e) {
      const chip = e.target.closest(".selected-chip");
      if (!chip || e.target.closest(".chip-remove-btn")) return;
      e.preventDefault();
      const rect = chip.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const clone = chip.cloneNode(true);
      clone.style.cssText = [
        `position:fixed`,
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        `height:${rect.height}px`,
        `margin:0`,
        `pointer-events:none`,
        `z-index:9999`,
        `box-shadow:0 6px 20px rgba(0,0,0,0.18)`,
        `opacity:1`,
        `cursor:grabbing`,
        `transition:none`
      ].join(";");
      document.body.appendChild(clone);
      chip.classList.add("is-chip-placeholder");
      chipsWrap.classList.add("is-chip-dragging-active");
      let lastInsertBefore = null;
      function onMove(ev) {
        clone.style.left = `${ev.clientX - offsetX}px`;
        clone.style.top = `${ev.clientY - offsetY}px`;
        const cloneCenterX = ev.clientX - offsetX + rect.width / 2;
        const cloneCenterY = ev.clientY - offsetY + rect.height / 2;
        const otherChips = Array.from(chipsWrap.querySelectorAll(".selected-chip")).filter((c) => c !== chip);
        const addWrap = chipsWrap.querySelector(".inline-add-wrap");
        let newInsertBefore = addWrap;
        for (const other of otherChips) {
          const r = other.getBoundingClientRect();
          const midX = r.left + r.width / 2;
          const midY = r.top + r.height / 2;
          if (cloneCenterY < midY - r.height * 0.4 || Math.abs(cloneCenterY - midY) <= r.height * 0.6 && cloneCenterX < midX) {
            newInsertBefore = other;
            break;
          }
        }
        if (newInsertBefore !== lastInsertBefore) {
          const allChips = Array.from(chipsWrap.querySelectorAll(".selected-chip"));
          const firstPositions = /* @__PURE__ */ new Map();
          allChips.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));
          chipsWrap.insertBefore(chip, newInsertBefore);
          lastInsertBefore = newInsertBefore;
          allChips.filter((el) => el !== chip).forEach((el) => {
            const first = firstPositions.get(el);
            if (!first) return;
            const last = el.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = "none";
            el.style.transform = `translate(${dx}px,${dy}px)`;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                el.style.transition = "transform 180ms cubic-bezier(0.2,0,0,1)";
                el.style.transform = "";
              });
            });
          });
        }
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const finalRect = chip.getBoundingClientRect();
        clone.style.transition = "left 150ms ease, top 150ms ease, box-shadow 150ms ease, opacity 150ms ease";
        clone.style.left = `${finalRect.left}px`;
        clone.style.top = `${finalRect.top}px`;
        clone.style.boxShadow = "none";
        clone.style.opacity = "0";
        setTimeout(() => {
          clone.remove();
          chip.classList.remove("is-chip-placeholder");
          chipsWrap.classList.remove("is-chip-dragging-active");
          Array.from(chipsWrap.querySelectorAll(".selected-chip")).forEach((el) => {
            el.style.transition = "";
            el.style.transform = "";
          });
          const newSiteIds = Array.from(chipsWrap.querySelectorAll(".selected-chip")).map((c) => c.dataset.siteId);
          const currentGroup = getGroupById(group.id);
          if (currentGroup) {
            currentGroup.siteIds = newSiteIds;
            persistAll();
          }
        }, 150);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }
  }

  // src/settings/settings/sections/groups.js
  function renderGroupsSection() {
    const { groupsSection } = state.dom;
    groupsSection.innerHTML = "";
    if (!state.groups.length) {
      const emptyState = document.createElement("section");
      emptyState.className = "settings-empty-state";
      emptyState.innerHTML = `<strong>${msg("settings_groups_emptyTitle", "还没有搜索组")}</strong><p>${msg("settings_groups_emptyDesc", "先创建一个搜索组，再配置你要调用的网站或 AI 模型。")}</p>`;
      groupsSection.appendChild(emptyState);
    } else {
      state.groups.forEach((group, index) => groupsSection.appendChild(createGroupCard(group, index)));
    }
    const addCard = document.createElement("section");
    addCard.className = "settings-add-card";
    addCard.innerHTML = `<button class="add-section-btn" type="button">${msg("settings_groups_addGroup", "新增搜索组")}</button>`;
    addCard.querySelector("button").addEventListener("click", async () => {
      state.groups.push({
        id: `group_${Date.now()}`,
        name: msg("settings_groups_newGroupName", "新搜索组"),
        enabled: true,
        mode: "compare",
        siteIds: []
      });
      await persistAll();
      renderGroupsSection();
    });
    groupsSection.appendChild(addCard);
  }
  function createGroupCard(group, index) {
    const isLocked = index === 0;
    const card = document.createElement("section");
    card.className = `settings-group-card${group.enabled ? "" : " is-disabled"}`;
    card.dataset.groupId = group.id;
    if (!isLocked) {
      const deleteCornerBtn = document.createElement("button");
      deleteCornerBtn.type = "button";
      deleteCornerBtn.className = "group-delete-corner-btn";
      deleteCornerBtn.setAttribute("aria-label", msg("settings_groups_deleteGroupAria", "删除搜索组"));
      deleteCornerBtn.textContent = "×";
      deleteCornerBtn.addEventListener("click", async () => {
        const currentGroup = getGroupById(group.id);
        if (!currentGroup) {
          return;
        }
        const shouldDelete = window.confirm(msg("settings_groups_deleteGroupConfirm", "是否要删除该搜索组？"));
        if (!shouldDelete) {
          return;
        }
        state.groups = state.groups.filter((item) => item.id !== currentGroup.id);
        if (state.openPickerGroupId === currentGroup.id) {
          closePicker();
        }
        await persistAll();
        renderGroupsSection();
      });
      card.appendChild(deleteCornerBtn);
    }
    const leftPanel = document.createElement("div");
    leftPanel.className = "settings-group-meta";
    leftPanel.innerHTML = `
    <div class="group-inline-controls group-inline-controls-split">
      <label class="inline-control group-name-inline-wrap">
        <span class="field-label inline-field-label">${msg("settings_groups_fieldName", "搜索组名称")}</span>
        <input class="group-name-input" type="text" value="${escapeHtml(group.name)}" data-field="name" />
      </label>
      <label class="inline-control inline-mode-control inline-mode-select-wrap">
        <span class="field-label inline-field-label">${msg("settings_groups_fieldMode", "呈现方式")}</span>
        <div class="group-mode-dropdown" data-field="mode-dropdown">
          <button class="group-mode-trigger" type="button" data-field="mode-trigger" aria-expanded="false">
            <span class="group-mode-trigger-label">${escapeHtml(group.mode === "tabs" ? msg("settings_groups_modeTabs", "新开标签") : msg("settings_groups_modeCompare", "卡片呈现"))}</span>
            <span class="group-mode-trigger-arrow" aria-hidden="true"></span>
          </button>
          <div class="group-mode-menu" data-field="mode-menu" hidden>
            ${GROUP_MODE_OPTIONS.map((option) => `<button class="group-mode-option${group.mode === option.value ? " is-active" : ""}" type="button" data-mode-value="${option.value}">${escapeHtml(option.label)}</button>`).join("")}
          </div>
        </div>
      </label>
    </div>
  `;
    const rightPanel = document.createElement("div");
    rightPanel.className = "settings-group-sites";
    const chipsWrap = document.createElement("div");
    chipsWrap.className = "site-chip-list";
    const selectedSites = group.siteIds.map((siteId) => state.sites.find((site) => site.id === siteId)).filter(Boolean);
    selectedSites.forEach((site) => chipsWrap.appendChild(createSelectedChip(group, site)));
    chipsWrap.appendChild(createInlineAdd(group));
    attachChipDrag(chipsWrap, group);
    rightPanel.appendChild(chipsWrap);
    card.appendChild(leftPanel);
    card.appendChild(rightPanel);
    if (!isLocked) {
      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "group-drag-handle";
      dragHandle.setAttribute("aria-label", msg("settings_groups_dragAria", "拖动调整搜索组顺序"));
      dragHandle.innerHTML = `<svg viewBox="0 0 1024 1024" aria-hidden="true" class="group-drag-handle-svg"><path d="M716.8 212.48c-10.24 0-17.92 2.56-25.6 5.12v-5.12c0-43.52-33.28-76.8-76.8-76.8-10.24 0-17.92 2.56-28.16 5.12C581.12 104.96 550.4 76.8 512 76.8c-43.52 0-76.8 33.28-76.8 76.8v5.12c-7.68-2.56-15.36-5.12-25.6-5.12-43.52 0-76.8 33.28-76.8 76.8v104.96c-7.68-2.56-15.36-5.12-25.6-5.12-43.52 0-76.8 33.28-76.8 76.8v256c0 156.16 125.44 281.6 281.6 281.6s281.6-125.44 281.6-281.6V289.28c0-43.52-33.28-76.8-76.8-76.8zM742.4 665.6c0 128-102.4 230.4-230.4 230.4s-230.4-102.4-230.4-230.4V409.6c0-15.36 10.24-25.6 25.6-25.6s25.6 10.24 25.6 25.6v209.92h43.52c56.32 5.12 110.08 33.28 143.36 79.36l40.96-30.72c-40.96-56.32-107.52-94.72-176.64-99.84V230.4c0-15.36 10.24-25.6 25.6-25.6s25.6 10.24 25.6 25.6v256h51.2V153.6c0-15.36 10.24-25.6 25.6-25.6s25.6 10.24 25.6 25.6v335.36h51.2V212.48c0-15.36 10.24-25.6 25.6-25.6s25.6 10.24 25.6 25.6v276.48h51.2v-199.68c0-15.36 10.24-25.6 25.6-25.6s25.6 10.24 25.6 25.6V665.6z" fill="#525C6A"></path></svg>`;
      card.appendChild(dragHandle);
    }
    const nameInput = leftPanel.querySelector("[data-field='name']");
    const modeDropdown = leftPanel.querySelector("[data-field='mode-dropdown']");
    const modeTrigger = leftPanel.querySelector("[data-field='mode-trigger']");
    const modeMenu = leftPanel.querySelector("[data-field='mode-menu']");
    if (nameInput) {
      nameInput.addEventListener("input", async (event) => {
        const currentGroup = getGroupById(group.id);
        if (!currentGroup) {
          return;
        }
        const nextValue = event.target instanceof HTMLInputElement ? event.target.value : "";
        currentGroup.name = nextValue;
        await persistAll();
      });
    }
    if (modeDropdown && modeTrigger && modeMenu) {
      modeTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = modeDropdown.classList.contains("is-open");
        document.querySelectorAll(".group-mode-dropdown").forEach((dropdown) => {
          dropdown.classList.remove("is-open");
          const trigger = dropdown.querySelector("[data-field='mode-trigger']");
          const menu = dropdown.querySelector("[data-field='mode-menu']");
          if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
          }
          if (menu) {
            menu.hidden = true;
          }
        });
        if (!isOpen) {
          modeDropdown.classList.add("is-open");
          modeTrigger.setAttribute("aria-expanded", "true");
          modeMenu.hidden = false;
        }
      });
      modeMenu.querySelectorAll("[data-mode-value]").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.stopPropagation();
          const currentGroup = getGroupById(group.id);
          if (!currentGroup) {
            return;
          }
          currentGroup.mode = button.dataset.modeValue === "tabs" ? "tabs" : "compare";
          await persistAll();
          renderGroupsSection();
        });
      });
    }
    return card;
  }
  function createSelectedChip(group, site) {
    const chip = document.createElement("div");
    chip.className = "site-chip selected-chip";
    chip.dataset.siteId = site.id;
    chip.innerHTML = `<span class="site-chip-label">${escapeHtml(site.name)}</span><button class="chip-remove-btn" type="button" aria-label="${msg("settings_groups_removeSitePrefix", "删除 ")}${escapeHtml(site.name)}">×</button>`;
    chip.querySelector(".chip-remove-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      const currentGroup = getGroupById(group.id);
      if (!currentGroup) {
        return;
      }
      currentGroup.siteIds = currentGroup.siteIds.filter((id) => id !== site.id);
      await persistAll();
      renderGroupsSection();
    });
    return chip;
  }
  function createInlineAdd(group) {
    const wrap = document.createElement("div");
    wrap.className = "inline-add-wrap";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-add-btn";
    button.textContent = msg("common_add", "新增");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      clearPickerCloseTimer();
      if (state.openPickerGroupId === group.id) {
        closePicker();
      } else {
        state.openPickerGroupId = group.id;
        if (!state.activePickerCategoryKey || !SITE_CATEGORIES[state.activePickerCategoryKey]) {
          state.activePickerCategoryKey = Object.keys(SITE_CATEGORIES)[0] || null;
        }
      }
      renderGroupsSection();
    });
    wrap.appendChild(button);
    if (state.openPickerGroupId === group.id) {
      wrap.appendChild(createHoverPicker(group));
    }
    return wrap;
  }
  function createHoverPicker(group) {
    const panel = document.createElement("div");
    panel.className = "hover-picker-panel is-open";
    panel.addEventListener("click", (event) => event.stopPropagation());
    panel.addEventListener("mouseenter", clearPickerCloseTimer);
    panel.addEventListener("mouseleave", schedulePickerClose);
    Object.entries(SITE_CATEGORIES).forEach(([key, category]) => {
      const row = document.createElement("div");
      row.className = "hover-picker-row";
      const isActive = state.activePickerCategoryKey === key;
      if (isActive) {
        row.classList.add("is-active");
      }
      const entry = document.createElement("button");
      entry.className = "hover-picker-entry";
      entry.type = "button";
      entry.innerHTML = `<span>${escapeHtml(category.label)}</span><span class="hover-picker-arrow">›</span>`;
      entry.addEventListener("mouseenter", () => {
        clearPickerCloseTimer();
        setActivePickerCategory(key);
      });
      entry.addEventListener("click", (event) => {
        event.stopPropagation();
        clearPickerCloseTimer();
        setActivePickerCategory(key);
      });
      row.appendChild(entry);
      const submenu = document.createElement("div");
      submenu.className = `hover-picker-submenu${isActive ? " is-open" : ""}`;
      submenu.addEventListener("mouseenter", clearPickerCloseTimer);
      submenu.addEventListener("mouseleave", schedulePickerClose);
      const categorySites = getCategorySites(key);
      if (key === "custom") {
        if (!categorySites.length) {
          const empty = document.createElement("div");
          empty.className = "hover-picker-empty";
          empty.innerHTML = msg(
            "settings_groups_customEmpty",
            `还没有自定义站点<br/><span class="hover-picker-empty-hint">前往左侧「自定义搜索」添加</span>`
          );
          submenu.appendChild(empty);
        } else {
          categorySites.forEach((site) => {
            submenu.appendChild(createPickerSiteOption(group, site, key));
          });
        }
      } else if (key === "ai") {
        submenu.classList.add("hover-picker-submenu--ai");
        const columnsWrap = document.createElement("div");
        columnsWrap.className = "hover-picker-ai-columns";
        AI_SITE_GROUPS.forEach((marketGroup) => {
          const groupSites = marketGroup.siteIds.map((siteId) => categorySites.find((site) => site.id === siteId)).filter(Boolean);
          if (!groupSites.length) return;
          const col = document.createElement("div");
          col.className = "hover-picker-ai-col";
          const colTitle = document.createElement("div");
          colTitle.className = "hover-picker-site-group-title";
          colTitle.textContent = marketGroup.label;
          col.appendChild(colTitle);
          groupSites.forEach((site) => {
            col.appendChild(createPickerSiteOption(group, site, key));
          });
          columnsWrap.appendChild(col);
        });
        submenu.appendChild(columnsWrap);
      } else if (key === "other") {
        submenu.classList.add("hover-picker-submenu--ai");
        const tip = document.createElement("div");
        tip.className = "hover-picker-tip";
        tip.textContent = msg(
          "settings_groups_otherTip",
          "社媒平台更推荐使用“新开标签”模式；卡片呈现的预览与打开体验可能不稳定。"
        );
        submenu.appendChild(tip);
        const columnsWrap = document.createElement("div");
        columnsWrap.className = "hover-picker-ai-columns";
        SOCIAL_SITE_GROUPS.forEach((marketGroup) => {
          const groupSites = marketGroup.siteIds.map((siteId) => categorySites.find((site) => site.id === siteId)).filter(Boolean);
          if (!groupSites.length) return;
          const col = document.createElement("div");
          col.className = "hover-picker-ai-col";
          const colTitle = document.createElement("div");
          colTitle.className = "hover-picker-site-group-title";
          colTitle.textContent = marketGroup.label;
          col.appendChild(colTitle);
          groupSites.forEach((site) => {
            col.appendChild(createPickerSiteOption(group, site, key));
          });
          columnsWrap.appendChild(col);
        });
        submenu.appendChild(columnsWrap);
      } else {
        categorySites.forEach((site) => {
          submenu.appendChild(createPickerSiteOption(group, site, key));
        });
      }
      row.appendChild(submenu);
      panel.appendChild(row);
    });
    return panel;
  }
  function setActivePickerCategory(categoryKey) {
    if (state.activePickerCategoryKey === categoryKey) {
      return;
    }
    state.activePickerCategoryKey = categoryKey;
    renderGroupsSection();
  }
  function clearPickerCloseTimer() {
    if (state.pickerCloseTimerId) {
      window.clearTimeout(state.pickerCloseTimerId);
      state.pickerCloseTimerId = null;
    }
  }
  function schedulePickerClose() {
    clearPickerCloseTimer();
    state.pickerCloseTimerId = window.setTimeout(() => {
      closePicker();
      renderGroupsSection();
    }, PICKER_CLOSE_DELAY_MS);
  }
  function closePicker() {
    clearPickerCloseTimer();
    state.openPickerGroupId = null;
    state.activePickerCategoryKey = null;
  }
  function createPickerSiteOption(group, site, categoryKey) {
    const label = document.createElement("label");
    label.className = "hover-picker-option";
    const checked = group.siteIds.includes(site.id);
    label.innerHTML = `
    <span class="hover-picker-option-text">${escapeHtml(site.name)}</span>
    <input type="checkbox" ${checked ? "checked" : ""} />
  `;
    const checkbox = label.querySelector("input");
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", async () => {
      const currentGroup = getGroupById(group.id);
      if (!currentGroup) {
        return;
      }
      if (checkbox.checked) {
        currentGroup.siteIds = [...currentGroup.siteIds, site.id];
      } else {
        currentGroup.siteIds = currentGroup.siteIds.filter((id) => id !== site.id);
      }
      await persistAll();
      state.openPickerGroupId = currentGroup.id;
      state.activePickerCategoryKey = categoryKey;
      clearPickerCloseTimer();
      renderGroupsSection();
    });
    return label;
  }

  // src/settings/settings/sections/prompts-editor.js
  function showPromptHoverCard(prompt, group, anchorBtn) {
    const existing = document.querySelector(".prompt-hover-card");
    if (existing) existing.remove();
    document.removeEventListener("keydown", state._hoverCardKeyHandler);
    const card = document.createElement("div");
    card.className = "prompt-hover-card";
    function closeCard() {
      card.remove();
      document.removeEventListener("keydown", state._hoverCardKeyHandler);
    }
    state._hoverCardKeyHandler = (ev) => {
      if (ev.key === "Escape") closeCard();
    };
    const header = document.createElement("div");
    header.className = "prompt-hover-card-header";
    const headerActions = document.createElement("div");
    headerActions.className = "prompt-hover-card-header-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "prompt-hover-card-copy-btn";
    copyBtn.textContent = msg("common_copy", "复制");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(prompt.content || "").then(() => {
        copyBtn.textContent = "✓ " + msg("common_copied", "已复制");
        copyBtn.classList.add("is-copied");
        setTimeout(() => {
          copyBtn.textContent = msg("common_copy", "复制");
          copyBtn.classList.remove("is-copied");
        }, 1800);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = prompt.content || "";
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        copyBtn.textContent = "✓ " + msg("common_copied", "已复制");
        setTimeout(() => {
          copyBtn.textContent = msg("common_copy", "复制");
        }, 1800);
      });
    });
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "prompt-hover-card-edit-btn";
    editBtn.textContent = msg("common_edit", "编辑");
    editBtn.addEventListener("click", () => {
      closeCard();
      state.promptEditorState = {
        mode: "edit",
        groupId: group.id,
        promptId: prompt.id,
        title: prompt.title || "",
        content: prompt.content || ""
      };
      state.renderPromptsSection();
    });
    headerActions.appendChild(copyBtn);
    headerActions.appendChild(editBtn);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "prompt-hover-card-close-btn";
    closeBtn.setAttribute("aria-label", msg("common_close", "关闭"));
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener("click", closeCard);
    header.appendChild(headerActions);
    header.appendChild(closeBtn);
    const titleRow = document.createElement("div");
    titleRow.className = "prompt-hover-card-title";
    titleRow.textContent = prompt.title || "未命名提示词";
    const body = document.createElement("div");
    body.className = "prompt-hover-card-body";
    body.textContent = prompt.content || "（暂无内容）";
    card.appendChild(header);
    card.appendChild(titleRow);
    card.appendChild(body);
    document.body.appendChild(card);
    const cardRect = card.getBoundingClientRect();
    const row = anchorBtn.closest(".prompt-card-item");
    const titleEl = row ? row.querySelector(".prompt-card-title") : null;
    const iconsEl = row ? row.querySelector(".prompt-card-icon-group") : null;
    let left, top;
    if (titleEl && iconsEl) {
      const titleR = titleEl.getBoundingClientRect();
      const iconsR = iconsEl.getBoundingClientRect();
      const gapLeft = titleR.right;
      const gapRight = iconsR.left;
      const gapW = gapRight - gapLeft;
      if (cardRect.width <= gapW) {
        left = gapLeft + (gapW - cardRect.width) / 2;
      } else {
        left = gapRight - cardRect.width;
      }
      const rowR = row.getBoundingClientRect();
      top = rowR.top;
    } else {
      const rect = anchorBtn.getBoundingClientRect();
      left = rect.right + 10;
      top = rect.top - 10;
    }
    if (left + cardRect.width > window.innerWidth - 12) {
      left = window.innerWidth - cardRect.width - 12;
    }
    if (left < 12) left = 12;
    if (top + cardRect.height > window.innerHeight - 12) {
      top = window.innerHeight - cardRect.height - 12;
    }
    if (top < 12) top = 12;
    card.style.left = left + "px";
    card.style.top = top + "px";
    let leaveTimer = null;
    const startLeave = () => {
      leaveTimer = setTimeout(() => closeCard(), 300);
    };
    const cancelLeave = () => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
    };
    card.addEventListener("mouseenter", cancelLeave);
    card.addEventListener("mouseleave", startLeave);
    anchorBtn.addEventListener("mouseleave", startLeave);
    anchorBtn.addEventListener("mouseenter", cancelLeave);
    setTimeout(() => document.addEventListener("keydown", state._hoverCardKeyHandler), 0);
  }
  function createPromptEditorModal() {
    if (!state.promptEditorState) {
      return document.createElement("div");
    }
    const editorState = state.promptEditorState;
    const editorGroup = state.promptGroups.find((group) => group.id === editorState.groupId && !isAllPromptGroup(group)) || state.promptGroups.find((group) => !isAllPromptGroup(group)) || state.promptGroups[0];
    const overlay = document.createElement("div");
    overlay.className = "prompt-editor-overlay";
    const modal = document.createElement("div");
    modal.className = "prompt-editor-modal";
    modal.innerHTML = `
    <div class="prompt-editor-title">${editorState.mode === "edit" ? msg("settings_prompts_editPromptTitle", "编辑提示词") : msg("settings_prompts_addPromptTitle", "添加提示词")}</div>
    <div class="prompt-editor-field">
      <label class="field-label">${msg("settings_prompts_fieldName", "名称")}</label>
      <input class="prompt-editor-title-input" type="text" value="${escapeHtml(editorState.title || "")}" placeholder="${msg("settings_prompts_promptNamePlaceholder", "请输入提示词名称")}" />
    </div>
    <div class="prompt-editor-field">
      <label class="field-label">${msg("settings_prompts_fieldGroup", "分类")}</label>
      <select class="prompt-editor-group-select">
        ${state.promptGroups.filter((group) => !isAllPromptGroup(group)).map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === editorGroup.id ? "selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}
        <option value="__new_group__">${msg("settings_prompts_newGroupOption", "＋ 新建分组…")}</option>
      </select>
      <div class="prompt-new-group-row" hidden>
        <input class="prompt-new-group-input" type="text" placeholder="${msg("settings_prompts_newGroupPlaceholder", "输入新分组名称，按 Enter 确认")}" />
        <button class="prompt-new-group-confirm-btn" type="button">${msg("common_create", "创建")}</button>
      </div>
    </div>
    <div class="prompt-editor-field">
      <label class="field-label">${msg("settings_prompts_fieldContent", "提示词内容")}</label>
      <textarea class="prompt-editor-content-input">${escapeHtml(editorState.content || "")}</textarea>
    </div>
    <div class="prompt-editor-actions">
      ${editorState.mode === "edit" ? `<button class="prompt-editor-delete-btn" type="button">${msg("common_delete", "删除")}</button>` : "<span></span>"}
      <div class="prompt-editor-main-actions">
        <button class="prompt-editor-cancel-btn" type="button">${msg("common_cancel", "取消")}</button>
        <button class="prompt-editor-save-btn" type="button">${msg("common_save", "保存")}</button>
      </div>
    </div>
  `;
    const titleInput = modal.querySelector(".prompt-editor-title-input");
    const groupSelect = modal.querySelector(".prompt-editor-group-select");
    const newGroupRow = modal.querySelector(".prompt-new-group-row");
    const newGroupInput = modal.querySelector(".prompt-new-group-input");
    const newGroupConfirmBtn = modal.querySelector(".prompt-new-group-confirm-btn");
    const contentInput = modal.querySelector(".prompt-editor-content-input");
    const cancelBtn = modal.querySelector(".prompt-editor-cancel-btn");
    const saveBtn = modal.querySelector(".prompt-editor-save-btn");
    function showNewGroupRow() {
      if (newGroupRow) newGroupRow.hidden = false;
      if (newGroupInput) newGroupInput.focus();
    }
    function hideNewGroupRow() {
      if (newGroupRow) newGroupRow.hidden = true;
      if (newGroupInput) newGroupInput.value = "";
    }
    function confirmNewGroup() {
      const name = (newGroupInput ? newGroupInput.value : "").trim();
      if (!name) return;
      const newGroup = {
        id: `prompt-group-${Date.now()}`,
        name,
        prompts: []
      };
      state.promptGroups.push(newGroup);
      const opt = document.createElement("option");
      opt.value = newGroup.id;
      opt.textContent = name;
      const newGroupOpt = groupSelect ? groupSelect.querySelector('option[value="__new_group__"]') : null;
      if (groupSelect) groupSelect.insertBefore(opt, newGroupOpt);
      if (groupSelect) groupSelect.value = newGroup.id;
      state.promptEditorState.groupId = newGroup.id;
      hideNewGroupRow();
    }
    if (titleInput) {
      titleInput.addEventListener("input", (event) => {
        const nextValue = event.target instanceof HTMLInputElement ? event.target.value : "";
        state.promptEditorState.title = nextValue;
      });
    }
    if (groupSelect) {
      groupSelect.addEventListener("change", (event) => {
        const nextValue = event.target instanceof HTMLSelectElement ? event.target.value : editorState.groupId;
        if (nextValue === "__new_group__") {
          showNewGroupRow();
        } else {
          hideNewGroupRow();
          state.promptEditorState.groupId = nextValue;
        }
      });
    }
    if (newGroupConfirmBtn) {
      newGroupConfirmBtn.addEventListener("click", confirmNewGroup);
    }
    if (newGroupInput) {
      newGroupInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          confirmNewGroup();
        }
        if (ev.key === "Escape") {
          hideNewGroupRow();
          if (groupSelect) groupSelect.value = state.promptEditorState.groupId || (state.promptGroups[0] ? state.promptGroups[0].id : "");
        }
      });
    }
    if (contentInput) {
      contentInput.addEventListener("input", (event) => {
        const nextValue = event.target instanceof HTMLTextAreaElement ? event.target.value : "";
        state.promptEditorState.content = nextValue;
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        state.promptEditorState = null;
        state.renderPromptsSection();
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const targetGroup = state.promptGroups.find((group) => group.id === state.promptEditorState.groupId);
        if (!targetGroup) {
          return;
        }
        let originalGroup = null;
        let originalIndex = -1;
        if (state.promptEditorState.mode === "edit") {
          state.promptGroups.forEach((group) => {
            const promptIndex = group.prompts.findIndex((prompt) => prompt.id === state.promptEditorState.promptId);
            if (promptIndex >= 0) {
              originalGroup = group;
              originalIndex = promptIndex;
            }
            group.prompts = group.prompts.filter((prompt) => prompt.id !== state.promptEditorState.promptId);
          });
        }
        const nextPrompt = {
          id: state.promptEditorState.promptId || `prompt-${Date.now()}`,
          title: state.promptEditorState.title || msg("overlay_unnamedPrompt", "未命名提示词"),
          content: state.promptEditorState.content || ""
        };
        if (state.promptEditorState.mode === "edit" && originalGroup === targetGroup && originalIndex >= 0) {
          targetGroup.prompts.splice(Math.min(originalIndex, targetGroup.prompts.length), 0, nextPrompt);
        } else {
          targetGroup.prompts.unshift(nextPrompt);
        }
        state.activePromptGroupId = targetGroup.id;
        state.promptEditorState = null;
        await persistAll();
        state.renderPromptsSection();
      });
    }
    const deleteBtn = modal.querySelector(".prompt-editor-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        showPromptDeleteConfirm(async () => {
          state.promptGroups.forEach((group) => {
            group.prompts = group.prompts.filter((prompt) => prompt.id !== state.promptEditorState.promptId);
          });
          state.promptEditorState = null;
          await persistAll();
          state.renderPromptsSection();
        });
      });
    }
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        state.promptEditorState = null;
        state.renderPromptsSection();
      }
    });
    overlay.appendChild(modal);
    return overlay;
  }
  function showPromptDeleteConfirm(onConfirm) {
    document.querySelector(".prompt-delete-confirm-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "prompt-delete-confirm-overlay";
    overlay.innerHTML = `
    <div class="prompt-delete-confirm-dialog" role="dialog" aria-modal="true">
      <div class="prompt-delete-confirm-title">${msg("settings_prompts_deletePromptTitle", "删除提示词")}</div>
      <div class="prompt-delete-confirm-message">${msg("settings_prompts_deletePromptConfirm", "是否要删除该提示词？")}</div>
      <div class="prompt-delete-confirm-actions">
        <button class="prompt-delete-confirm-cancel" type="button">${msg("common_cancel", "取消")}</button>
        <button class="prompt-delete-confirm-submit" type="button">${msg("common_delete", "删除")}</button>
      </div>
    </div>
  `;
    const close = () => {
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
    };
    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    overlay.querySelector(".prompt-delete-confirm-cancel")?.addEventListener("click", close);
    overlay.querySelector(".prompt-delete-confirm-submit")?.addEventListener("click", async () => {
      await onConfirm();
      close();
    });
    document.addEventListener("keydown", handleKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector(".prompt-delete-confirm-submit")?.focus();
  }

  // src/settings/settings/sections/prompts.js
  function renderPromptsSection() {
    const { promptsSection } = state.dom;
    promptsSection.innerHTML = "";
    if (!state.promptGroups.length) {
      state.promptGroups = createNormalizedPromptGroups([]);
    }
    if (!state.activePromptGroupId || !state.promptGroups.some((group) => group.id === state.activePromptGroupId)) {
      state.activePromptGroupId = state.promptGroups[0]?.id || null;
    }
    const activeGroup = state.promptGroups.find((group) => group.id === state.activePromptGroupId) || state.promptGroups[0];
    if (!activeGroup) {
      return;
    }
    const shell = document.createElement("section");
    shell.className = "prompt-settings-shell";
    shell.appendChild(createPromptGroupSidebar(activeGroup));
    shell.appendChild(createPromptContentPanel(activeGroup));
    promptsSection.appendChild(shell);
    if (state.promptEditorState) {
      promptsSection.appendChild(createPromptEditorModal());
    }
  }
  function createPromptGroupSidebar(activeGroup) {
    const aside = document.createElement("aside");
    aside.className = "prompt-groups-sidebar";
    const list = document.createElement("div");
    list.className = "prompt-groups-list";
    state.promptGroups.forEach((group) => {
      list.appendChild(createPromptGroupItem(group, activeGroup));
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "prompt-sidebar-add-btn";
    addBtn.textContent = "+ " + msg("settings_prompts_addGroup", "添加分组");
    addBtn.addEventListener("click", () => {
      const newGroup = {
        id: `prompt-group-${Date.now()}`,
        name: "",
        prompts: []
      };
      state.promptGroups.push(newGroup);
      state.activePromptGroupId = newGroup.id;
      state.renamingPromptGroupId = newGroup.id;
      state.pendingPromptGroupFocusId = newGroup.id;
      renderPromptsSection();
    });
    const addBtnWrap = document.createElement("div");
    addBtnWrap.className = "prompt-sidebar-add-wrap";
    addBtnWrap.appendChild(addBtn);
    aside.appendChild(list);
    aside.appendChild(addBtnWrap);
    attachPromptGroupDrag(list);
    return aside;
  }
  function createPromptGroupItem(group, activeGroup) {
    const isActive = group.id === activeGroup.id;
    const isAll = isAllPromptGroup(group);
    const isRenaming = !isAll && state.renamingPromptGroupId === group.id;
    const isLocked = isAll;
    const displayName = isAll ? getAllPromptGroupName() : group.name;
    const row = document.createElement("div");
    row.className = `prompt-group-nav-item${isActive ? " is-active" : ""}${!displayName.trim() && !isRenaming ? " is-empty" : ""}${isRenaming ? " is-renaming" : ""}${isAll ? " is-locked" : ""}`;
    row.dataset.groupId = group.id;
    if (isRenaming) {
      const input = document.createElement("input");
      input.className = "prompt-group-nav-input";
      input.type = "text";
      input.value = group.name;
      input.placeholder = msg("settings_prompts_groupPlaceholder", "请输入分组名称");
      let committed = false;
      const commit = async () => {
        if (committed) return;
        committed = true;
        const nextName = input.value.trim();
        group.name = nextName || msg("settings_prompts_newGroupName", "新建分组");
        if (state.renamingPromptGroupId === group.id) {
          state.renamingPromptGroupId = null;
        }
        await persistAll();
        renderPromptsSection();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          input.blur();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          committed = true;
          if (state.renamingPromptGroupId === group.id) {
            state.renamingPromptGroupId = null;
          }
          renderPromptsSection();
        }
      });
      input.addEventListener("blur", commit);
      row.appendChild(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
      if (state.pendingPromptGroupFocusId === group.id) {
        state.pendingPromptGroupFocusId = null;
      }
      return row;
    }
    const nameEl = document.createElement("span");
    nameEl.className = "prompt-group-nav-name";
    nameEl.textContent = displayName || msg("overlay_unnamedPromptGroup", "未命名分组");
    row.appendChild(nameEl);
    row.addEventListener("click", (ev) => {
      if (ev.target.closest(".prompt-group-nav-action")) return;
      state.activePromptGroupId = group.id;
      renderPromptsSection();
    });
    if (isActive && !isAll) {
      const actions = document.createElement("div");
      actions.className = "prompt-group-nav-actions";
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "prompt-group-nav-action prompt-group-nav-rename";
      renameBtn.setAttribute("aria-label", msg("settings_prompts_renameGroupAria", "重命名分组"));
      renameBtn.title = msg("settings_prompts_renameGroupTitle", "重命名");
      renameBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      renameBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        state.renamingPromptGroupId = group.id;
        renderPromptsSection();
      });
      actions.appendChild(renameBtn);
      if (!isLocked) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "prompt-group-nav-action prompt-group-nav-delete";
        deleteBtn.setAttribute("aria-label", msg("settings_prompts_deleteGroupAria", "删除分组"));
        deleteBtn.title = msg("settings_prompts_deleteGroupTitle", "删除分组");
        deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
        deleteBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const shouldDelete = window.confirm(msg("settings_prompts_deleteGroupConfirm", "是否要删除该提示词分组？"));
          if (!shouldDelete) return;
          state.promptGroups = state.promptGroups.filter((g) => g.id !== group.id);
          if (!state.promptGroups.length) {
            state.promptGroups = createNormalizedPromptGroups([]);
          }
          state.activePromptGroupId = state.promptGroups[0]?.id || null;
          await persistAll();
          renderPromptsSection();
        });
        actions.appendChild(deleteBtn);
      }
      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "prompt-group-nav-action prompt-group-nav-drag";
      dragHandle.setAttribute("aria-label", msg("settings_prompts_dragGroupAria", "拖动排序"));
      dragHandle.title = msg("settings_prompts_dragGroupTitle", "拖动排序");
      dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>`;
      actions.appendChild(dragHandle);
      row.appendChild(actions);
    }
    return row;
  }
  function createPromptContentPanel(activeGroup) {
    const panel = document.createElement("section");
    panel.className = "prompt-content-panel";
    const isAll = isAllPromptGroup(activeGroup);
    const entries = getDisplayPromptEntries(activeGroup);
    const displayName = isAll ? getAllPromptGroupName() : activeGroup.name || msg("overlay_unnamedPromptGroup", "未命名分组");
    const header = document.createElement("div");
    header.className = "prompt-content-header";
    header.innerHTML = `
    <div>
      <div class="prompt-content-title">${escapeHtml(displayName)}</div>
      <div class="prompt-content-subtitle">${msg("settings_prompts_countPrefix", "当前分类下共 ")}${entries.length}${msg("settings_prompts_countSuffix", " 条提示词")}</div>
    </div>
  `;
    panel.appendChild(header);
    const list = document.createElement("div");
    list.className = "prompt-cards-list";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "site-selection-empty";
      empty.textContent = isAll ? msg("settings_prompts_emptyAll", "还没有任何提示词，点击下方按钮添加。") : msg("settings_prompts_emptyGroup", "当前分组还没有提示词，点击下方按钮添加。");
      list.appendChild(empty);
    } else {
      entries.forEach(({ prompt, sourceGroup }) => {
        list.appendChild(createPromptCard(sourceGroup, prompt, { disableDrag: false }));
      });
      if (isAll) {
        attachPromptItemDragAll(list);
      } else {
        attachPromptItemDrag(list, activeGroup);
      }
    }
    panel.appendChild(list);
    const bottomAddWrap = document.createElement("div");
    bottomAddWrap.className = "prompt-panel-bottom-add";
    const bottomAddBtn = document.createElement("button");
    bottomAddBtn.type = "button";
    bottomAddBtn.className = "prompt-panel-add-btn";
    bottomAddBtn.textContent = msg("settings_prompts_addPromptCta", "添加提示词");
    bottomAddBtn.addEventListener("click", () => {
      state.promptEditorState = {
        mode: "create",
        // 在"全部"视图下新建时，默认写入第一个真实分组（非全部）；用户仍可在弹窗里改为其它分组。
        groupId: isAll ? state.promptGroups.find((g) => !isAllPromptGroup(g))?.id || state.promptGroups[0]?.id : activeGroup.id,
        promptId: null,
        title: "",
        content: ""
      };
      renderPromptsSection();
    });
    bottomAddWrap.appendChild(bottomAddBtn);
    panel.appendChild(bottomAddWrap);
    return panel;
  }
  function createPromptCard(group, prompt, options = {}) {
    const disableDrag = !!options.disableDrag;
    const item = document.createElement("article");
    item.className = "prompt-card-item";
    item.dataset.promptId = prompt.id;
    item.dataset.groupId = group.id;
    const inline = document.createElement("div");
    inline.className = "prompt-card-inline";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "prompt-icon-btn prompt-edit-icon-btn";
    editBtn.setAttribute("aria-label", msg("common_edit", "编辑"));
    editBtn.title = msg("common_edit", "编辑");
    editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener("click", () => {
      state.promptEditorState = {
        mode: "edit",
        groupId: group.id,
        promptId: prompt.id,
        title: prompt.title || "",
        content: prompt.content || ""
      };
      renderPromptsSection();
    });
    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className = "prompt-icon-btn prompt-preview-icon-btn";
    previewBtn.setAttribute("aria-label", msg("settings_prompts_previewAria", "预览"));
    previewBtn.title = msg("settings_prompts_previewTitle", "预览内容");
    previewBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    let hoverTimer = null;
    previewBtn.addEventListener("mouseenter", () => {
      hoverTimer = setTimeout(() => {
        showPromptHoverCard(prompt, group, previewBtn);
      }, 200);
    });
    previewBtn.addEventListener("mouseleave", () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    });
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "prompt-icon-btn prompt-card-drag-handle";
    dragHandle.setAttribute("aria-label", msg("settings_prompts_dragGroupAria", "拖动排序"));
    dragHandle.title = msg("settings_prompts_dragGroupTitle", "拖动排序");
    dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>`;
    const titleEl = document.createElement("div");
    titleEl.className = "prompt-card-title";
    titleEl.textContent = prompt.title || msg("overlay_unnamedPrompt", "未命名提示词");
    const rightGroup = document.createElement("div");
    rightGroup.className = "prompt-card-icon-group";
    rightGroup.appendChild(editBtn);
    rightGroup.appendChild(previewBtn);
    if (!disableDrag) {
      rightGroup.appendChild(dragHandle);
    }
    inline.appendChild(titleEl);
    inline.appendChild(rightGroup);
    item.appendChild(inline);
    return item;
  }

  // src/settings/settings/sections/custom.js
  function renderCustomSection() {
    const { customSection } = state.dom;
    customSection.innerHTML = "";
    const converter = document.createElement("section");
    converter.className = "custom-search-card";
    converter.innerHTML = `
    <div class="custom-search-card-head">
      <strong>${msg("settings_custom_convertTitle", "URL 规则转换")}</strong>
      <span>${msg("settings_custom_convertDesc", "粘贴一条带搜索词的 URL，我们尝试自动识别搜索参数并替换为 {query}。")}</span>
    </div>
    <div class="custom-converter-row">
      <input class="custom-converter-input" type="text" />
      <button class="custom-converter-btn" type="button">${msg("settings_custom_convertBtn", "转换")}</button>
    </div>
    <div class="custom-converter-msg" data-field="converter-msg"></div>
  `;
    const converterInput = converter.querySelector(".custom-converter-input");
    const converterBtn = converter.querySelector(".custom-converter-btn");
    const converterMsg = converter.querySelector("[data-field='converter-msg']");
    if (converterInput instanceof HTMLInputElement) {
      converterInput.value = state.customFormState.converterInput || "";
      converterInput.addEventListener("input", (event) => {
        state.customFormState.converterInput = event.target.value;
        state.customFormState.converterError = "";
        if (converterMsg) {
          converterMsg.textContent = "";
          converterMsg.classList.remove("is-error");
          converterMsg.classList.remove("is-success");
        }
      });
      converterInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleConvertClick();
        }
      });
    }
    if (converterBtn) {
      converterBtn.addEventListener("click", handleConvertClick);
    }
    if (state.customFormState.converterError && converterMsg) {
      converterMsg.textContent = state.customFormState.converterError;
      converterMsg.classList.add("is-error");
    }
    function handleConvertClick() {
      const result = convertUrlToTemplate(state.customFormState.converterInput);
      if (!result.ok) {
        state.customFormState.converterError = result.error;
        if (converterMsg) {
          converterMsg.textContent = result.error;
          converterMsg.classList.add("is-error");
          converterMsg.classList.remove("is-success");
        }
        return;
      }
      state.customFormState.url = result.url;
      if (!state.customFormState.name && result.name) {
        state.customFormState.name = result.name;
      }
      state.customFormState.formError = "";
      state.customFormState.converterError = "";
      renderCustomSection();
    }
    customSection.appendChild(converter);
    const form = document.createElement("section");
    form.className = "custom-search-card";
    const isEditing = state.customFormState.mode === "edit";
    form.innerHTML = `
    <div class="custom-search-card-head">
      <strong>${isEditing ? msg("settings_custom_editTitle", "编辑自定义站点") : msg("settings_custom_addTitle", "手动添加")}</strong>
      <span>${msg("settings_custom_addDesc", "填写站点名称与 URL，{query} 会在搜索时自动替换为你的关键词。")}</span>
    </div>
    <label class="custom-field">
      <span class="field-label inline-field-label">${msg("settings_custom_fieldName", "名称")}</span>
      <input class="custom-form-input" type="text" data-field="name" />
    </label>
    <label class="custom-field">
      <span class="field-label inline-field-label">${msg("settings_custom_fieldUrl", "URL 链接")}</span>
      <input class="custom-form-input" type="text" data-field="url" />
    </label>
    <div class="custom-form-msg" data-field="form-msg"></div>
    <div class="custom-form-actions">
      ${isEditing ? `<button class="custom-form-cancel-btn" type="button">${msg("settings_custom_cancelEdit", "取消编辑")}</button>` : ""}
      <button class="custom-form-submit-btn" type="button">${isEditing ? msg("settings_custom_saveEdit", "保存修改") : msg("settings_custom_confirmAdd", "确定添加")}</button>
    </div>
  `;
    const nameInput = form.querySelector("[data-field='name']");
    const urlInput = form.querySelector("[data-field='url']");
    const formMsg = form.querySelector("[data-field='form-msg']");
    const submitBtn = form.querySelector(".custom-form-submit-btn");
    const cancelBtn = form.querySelector(".custom-form-cancel-btn");
    if (nameInput instanceof HTMLInputElement) {
      nameInput.value = state.customFormState.name || "";
      nameInput.addEventListener("input", (event) => {
        state.customFormState.name = event.target.value;
      });
    }
    if (urlInput instanceof HTMLInputElement) {
      urlInput.value = state.customFormState.url || "";
      urlInput.addEventListener("input", (event) => {
        state.customFormState.url = event.target.value;
      });
    }
    if (state.customFormState.formError && formMsg) {
      formMsg.textContent = state.customFormState.formError;
      formMsg.classList.add("is-error");
    }
    if (submitBtn) {
      submitBtn.addEventListener("click", handleCustomFormSubmit);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        state.customFormState = createBlankCustomFormState();
        renderCustomSection();
      });
    }
    customSection.appendChild(form);
    const listCard = document.createElement("section");
    listCard.className = "custom-search-card custom-sites-list-card";
    const header = document.createElement("div");
    header.className = "custom-search-card-head";
    header.innerHTML = `
    <strong>${msg("settings_custom_listTitle", "已添加的自定义站点")}</strong>
    <span>${msg("settings_custom_listCountPrefix", "当前共 ")}${state.customSites.length}${msg("settings_custom_listCountSuffix", " 个自定义站点。")}</span>
  `;
    listCard.appendChild(header);
    if (!state.customSites.length) {
      const empty = document.createElement("div");
      empty.className = "site-selection-empty";
      empty.textContent = msg("settings_custom_listEmpty", "还没有自定义站点，上方添加后会在这里显示。");
      listCard.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "custom-sites-list";
      state.customSites.forEach((site) => {
        list.appendChild(createCustomSiteRow(site));
      });
      listCard.appendChild(list);
    }
    customSection.appendChild(listCard);
  }
  function createCustomSiteRow(site) {
    const row = document.createElement("article");
    row.className = "custom-site-row";
    row.innerHTML = `
    <div class="custom-site-info">
      <div class="custom-site-name">${escapeHtml(site.name)}</div>
      <div class="custom-site-url">${escapeHtml(site.url)}</div>
    </div>
    <div class="custom-site-actions">
      <button class="custom-site-edit-btn" type="button">${msg("common_edit", "编辑")}</button>
      <button class="custom-site-delete-btn" type="button" aria-label="${msg("common_delete", "删除")}">×</button>
    </div>
  `;
    const editBtn = row.querySelector(".custom-site-edit-btn");
    const deleteBtn = row.querySelector(".custom-site-delete-btn");
    editBtn?.addEventListener("click", () => {
      state.customFormState = {
        mode: "edit",
        editingId: site.id,
        name: site.name,
        url: site.url,
        converterInput: "",
        converterError: "",
        formError: ""
      };
      renderCustomSection();
      state.dom.customSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    deleteBtn?.addEventListener("click", async () => {
      const confirmed = window.confirm(
        msg("settings_custom_deleteConfirmPrefix", "是否要删除自定义站点「") + site.name + msg("settings_custom_deleteConfirmMid", "」？\n") + msg("settings_custom_deleteConfirmBody", "删除后，所有搜索组中引用该站点的记录也会同步移除。")
      );
      if (!confirmed) return;
      state.customSites = state.customSites.filter((item) => item.id !== site.id);
      state.groups = state.groups.map((group) => ({
        ...group,
        siteIds: (group.siteIds || []).filter((id) => id !== site.id)
      }));
      if (state.customFormState.mode === "edit" && state.customFormState.editingId === site.id) {
        state.customFormState = createBlankCustomFormState();
      }
      await persistAll();
      renderCustomSection();
    });
    return row;
  }
  async function handleCustomFormSubmit() {
    const name = String(state.customFormState.name || "").trim();
    const url = String(state.customFormState.url || "").trim();
    if (!name) {
      state.customFormState.formError = msg("settings_custom_errorNameRequired", "请输入站点名称。");
      renderCustomSection();
      return;
    }
    if (!url) {
      state.customFormState.formError = msg("settings_custom_errorUrlRequired", "请输入 URL 链接。");
      renderCustomSection();
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      state.customFormState.formError = msg("settings_custom_errorUrlProtocol", "URL 必须以 http:// 或 https:// 开头。");
      renderCustomSection();
      return;
    }
    if (!url.includes("{query}")) {
      state.customFormState.formError = msg("settings_custom_errorMissingQuery", "URL 中必须包含 {query} 作为搜索词占位符。");
      renderCustomSection();
      return;
    }
    try {
      new URL(url.replace("{query}", "ai"));
    } catch (_error) {
      state.customFormState.formError = msg("settings_custom_errorUrlInvalid", "URL 格式不合法，请检查后重试。");
      renderCustomSection();
      return;
    }
    if (state.customFormState.mode === "edit" && state.customFormState.editingId) {
      state.customSites = state.customSites.map(
        (site) => site.id === state.customFormState.editingId ? {
          ...site,
          name,
          url,
          supportUrlQuery: true,
          matchPatterns: deriveMatchPatterns(url)
        } : site
      );
    } else {
      const newSite = {
        id: createCustomSiteId(),
        name,
        url,
        enabled: true,
        supportIframe: true,
        supportUrlQuery: true,
        matchPatterns: deriveMatchPatterns(url),
        isCustom: true
      };
      state.customSites = [...state.customSites, newSite];
    }
    state.customFormState = createBlankCustomFormState();
    await persistAll();
    renderCustomSection();
  }

  // src/settings/settings/sections/other.js
  function renderOtherSection() {
    const { otherSection } = state.dom;
    otherSection.innerHTML = "";
    const card = document.createElement("section");
    card.className = "other-settings-card";
    card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_other_homeDisplayTitle", "首页显示项")}</strong>
      <span>${msg("settings_other_homeDisplayDesc", "控制首页里哪些模块显示，哪些模块隐藏。")}</span>
    </div>
    <div class="other-settings-list"></div>
  `;
    const list = card.querySelector(".other-settings-list");
    [
      {
        key: "showHistory",
        title: msg("settings_other_showHistoryTitle", "显示历史搜索记录"),
        desc: msg("settings_other_showHistoryDesc", "关闭后，首页下方的历史搜索区域将不再显示。")
      },
      {
        key: "showPromptButton",
        title: msg("settings_other_showPromptTitle", "显示提示词按钮"),
        desc: msg("settings_other_showPromptDesc", "关闭后，输入框下方的提示词入口将隐藏。")
      }
    ].forEach((item) => {
      list?.appendChild(createOtherSettingToggle(item.key, item.title, item.desc));
    });
    otherSection.appendChild(card);
    otherSection.appendChild(createShortcutCard());
    otherSection.appendChild(createSearchConfigIoCard());
  }
  function createOtherSettingToggle(key, title, desc, tip, options = {}) {
    const row = document.createElement("article");
    row.className = "other-setting-row" + (tip ? " other-setting-row--with-tip" : "");
    const isOn = getOtherSettingValue(key, options.defaultValue !== false);
    row.innerHTML = `
    <div class="other-setting-row-main">
      <div class="other-setting-copy">
        <div class="other-setting-title">${escapeHtml(title)}</div>
        <div class="other-setting-desc">${escapeHtml(desc)}</div>
      </div>
      <button class="other-setting-switch ${isOn ? "is-on" : "is-off"}" type="button" aria-pressed="${isOn ? "true" : "false"}">
        <span class="other-setting-switch-thumb"></span>
      </button>
    </div>
    ${tip ? `<div class="other-setting-desc shortcut-tip">${escapeHtml(tip)}</div>` : ""}
  `;
    const toggle = row.querySelector(".other-setting-switch");
    toggle?.addEventListener("click", async () => {
      state.uiPrefs[key] = !getOtherSettingValue(key, options.defaultValue !== false);
      await persistAll();
      if (state.activeSection === "random") {
        state.renderRandomSection();
      } else {
        renderOtherSection();
      }
    });
    return row;
  }
  function getOtherSettingValue(key, defaultValue = true) {
    if (Object.prototype.hasOwnProperty.call(state.uiPrefs || {}, key)) {
      return state.uiPrefs[key] !== false;
    }
    return defaultValue;
  }
  function createShortcutCard() {
    const card = document.createElement("section");
    card.className = "other-settings-card";
    card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_other_globalShortcutTitle", "全局搜索快捷键")}</strong>
      <span>${msg("settings_other_globalShortcutDesc", "在任意网页上用快捷键在屏幕中间快速弹出搜索浮层。")}</span>
    </div>
    <div class="other-settings-list"></div>
  `;
    const list = card.querySelector(".other-settings-list");
    if (list) {
      list.appendChild(
        createOtherSettingToggle(
          "overlayShortcutEnabled",
          msg("settings_other_enableGlobalShortcutTitle", "启用全局搜索快捷键"),
          msg("settings_other_enableGlobalShortcutDesc", "开启后，按下下方自定义的快捷键即可在当前网页弹出搜索浮层；关闭后快捷键将失效。"),
          msg("settings_other_enableGlobalShortcutTip", "在浏览器内页、扩展商店或部分特殊网页中，可能无法通过快捷键唤起。")
        )
      );
      list.appendChild(createShortcutRecorderRow());
      list.appendChild(createShortcutsPageHint());
    }
    return card;
  }
  function createSearchConfigIoCard() {
    const card = document.createElement("section");
    card.className = "other-settings-card";
    card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_other_searchConfigIoTitle", "导入 / 导出搜索配置")}</strong>
      <span>${msg("settings_other_searchConfigIoDesc", "导出当前的搜索组与自定义搜索站点，分享给他人后可一键导入还原。不含提示词设置。")}</span>
    </div>
    <div class="search-config-io-row">
      <button type="button" class="search-config-io-btn search-config-export-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${msg("settings_other_exportConfig", "导出配置")}
      </button>
      <button type="button" class="search-config-io-btn search-config-import-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="17"/></svg>
        ${msg("settings_other_importConfig", "导入配置")}
      </button>
      <span class="search-config-io-hint" aria-live="polite"></span>
    </div>
  `;
    card.querySelector(".search-config-export-btn").addEventListener("click", exportSearchConfig);
    card.querySelector(".search-config-import-btn").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", handleSearchConfigImportFile);
      input.click();
    });
    return card;
  }
  function exportSearchConfig() {
    const payload = {
      version: 1,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      searchGroups: state.groups,
      customSites: state.customSites
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Qshot搜索配置-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function handleSearchConfigImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch (_) {
      alert(msg("settings_other_importParseError", "无法解析文件，请确认是否为从本插件导出的 JSON 配置文件。"));
      return;
    }
    if (!payload || typeof payload !== "object" || payload.version !== 1) {
      alert(msg("settings_other_importInvalidFormat", "文件格式不正确，请使用本插件导出的搜索配置文件。"));
      return;
    }
    const importedGroups = Array.isArray(payload.searchGroups) ? payload.searchGroups : [];
    const importedCustomSites = Array.isArray(payload.customSites) ? payload.customSites : [];
    if (!importedGroups.length && !importedCustomSites.length) {
      alert(msg("settings_other_importEmpty", "文件中没有可导入的搜索组或自定义站点。"));
      return;
    }
    const groupCount = importedGroups.length;
    const siteCount = importedCustomSites.length;
    const desc = [
      groupCount ? `${groupCount} 个搜索组` : "",
      siteCount ? `${siteCount} 个自定义站点` : ""
    ].filter(Boolean).join("、");
    const confirmed = confirm([
      msg("settings_other_importConfirmLine1Prefix", "即将导入 ") + desc + msg("settings_other_importConfirmLine1Suffix", "。"),
      "",
      msg("settings_other_importConfirmLine2Prefix", "导入后将完全覆盖当前的搜索组配置") + (siteCount ? msg("settings_other_importConfirmLine2Sites", "和自定义站点") : "") + msg("settings_other_importConfirmLine2Suffix", "，此操作不可撤销。"),
      "",
      msg("settings_other_importConfirmLine3", "确认继续？")
    ].join("\n"));
    if (!confirmed) return;
    if (importedCustomSites.length) {
      state.customSites = createNormalizedCustomSites(importedCustomSites);
      const builtinSites = state.sites.filter((site) => !site.isCustom);
      state.sites = mergeSites(builtinSites, state.customSites);
    }
    if (importedGroups.length) {
      state.groups = createNormalizedGroups(importedGroups);
    }
    await persistAll();
    renderOtherSection();
    if (state.activeSection === "groups") {
      state.renderGroupsSection();
    }
    if (state.activeSection === "custom") {
      state.renderCustomSection();
    }
  }
  function createShortcutsPageHint() {
    const row = document.createElement("div");
    row.className = "shortcut-page-hint";
    row.innerHTML = `${msg("settings_other_shortcutsHintPrefix", "也可前往浏览器的")}<button type="button" class="shortcut-page-link">${msg("settings_other_shortcutsHintLink", "扩展键盘快捷方式")}</button>${msg("settings_other_shortcutsHintSuffix", "，将「激活扩展」改为快捷激活顶部弹窗（任意页面均可唤起）。")}`;
    const btn = row.querySelector(".shortcut-page-link");
    btn?.addEventListener("click", () => {
      const isEdge = /Edg\//.test(navigator.userAgent);
      const url = isEdge ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
      chrome.tabs.create({ url }).catch(() => {
      });
    });
    return row;
  }
  function createShortcutRecorderRow() {
    const row = document.createElement("article");
    row.className = "other-setting-row other-setting-row--with-tip shortcut-row";
    row.innerHTML = `
    <div class="other-setting-row-main">
      <div class="other-setting-copy">
        <div class="other-setting-title">${msg("settings_other_customShortcutTitle", "自定义快捷键")}</div>
        <div class="other-setting-desc">${msg("settings_other_customShortcutDesc", "点击右侧按钮后按下组合键即可录制。必须至少包含一个修饰键（Ctrl / Alt / Shift / Win）。")}</div>
      </div>
      <div class="shortcut-recorder">
        <button type="button" class="shortcut-display" aria-label="${msg("settings_other_recordShortcutAria", "录制快捷键")}"></button>
        <button type="button" class="shortcut-reset" title="${msg("settings_other_resetShortcutTitle", "恢复默认 Alt + Q")}">${msg("settings_other_resetShortcut", "恢复默认")}</button>
      </div>
    </div>
    <div class="other-setting-desc shortcut-tip">${msg("settings_other_shortcutRefreshTip", "提示：修改快捷键后，需要刷新当前网页才会生效。")}</div>
  `;
    const display = row.querySelector(".shortcut-display");
    const resetBtn = row.querySelector(".shortcut-reset");
    let isRecording = false;
    function renderDisplay() {
      if (!(display instanceof HTMLButtonElement)) return;
      if (isRecording) {
        display.textContent = msg("settings_other_recording", "按下组合键…");
        display.classList.add("is-recording");
      } else {
        display.textContent = formatShortcut(state.uiPrefs.overlayShortcut);
        display.classList.remove("is-recording");
      }
    }
    function stopRecording() {
      if (!isRecording) return;
      isRecording = false;
      document.removeEventListener("keydown", onKeyDown, true);
      renderDisplay();
    }
    async function onKeyDown(event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        stopRecording();
        return;
      }
      const rawKey = event.key;
      if (rawKey === "Control" || rawKey === "Shift" || rawKey === "Alt" || rawKey === "Meta") {
        return;
      }
      const candidate = {
        ctrlKey: !!event.ctrlKey,
        shiftKey: !!event.shiftKey,
        altKey: !!event.altKey,
        metaKey: !!event.metaKey,
        key: rawKey.length === 1 ? rawKey.toUpperCase() : rawKey
      };
      if (!isShortcutValid(candidate)) {
        display.textContent = msg("settings_other_recordInvalid", "必须包含修饰键，请重试");
        return;
      }
      state.uiPrefs.overlayShortcut = candidate;
      await persistAll();
      stopRecording();
    }
    display?.addEventListener("click", () => {
      if (isRecording) {
        stopRecording();
        return;
      }
      isRecording = true;
      renderDisplay();
      document.addEventListener("keydown", onKeyDown, true);
    });
    resetBtn?.addEventListener("click", async () => {
      state.uiPrefs.overlayShortcut = normalizeShortcut(null);
      await persistAll();
      renderDisplay();
    });
    renderDisplay();
    return row;
  }

  // src/settings/settings/sections/random.js
  async function loadDefaultRandomQuestionsText(preferredLang = "") {
    const lang = String(preferredLang || (() => {
      try {
        const chromeLang = (chrome?.i18n?.getUILanguage?.() || "").toLowerCase();
        if (chromeLang) return chromeLang;
        const navLang = (navigator?.language || "").toLowerCase();
        return navLang || "";
      } catch (_e) {
        return (navigator.language || "").toLowerCase();
      }
    })()).toLowerCase();
    const path = lang.startsWith("zh") ? RANDOM_QUESTIONS_FILES.zh : RANDOM_QUESTIONS_FILES.en;
    try {
      const res = await fetch(chrome.runtime.getURL(path));
      return res.ok ? await res.text() : "";
    } catch (_e) {
      return "";
    }
  }
  function countRandomQuestions(text) {
    if (typeof text !== "string") return 0;
    return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).length;
  }
  async function persistRandomQuestionsText() {
    await chrome.storage.local.set({ [RANDOM_QUESTIONS_STORAGE_KEY]: state.randomQuestionsText });
  }
  function rawToNumbered(raw) {
    if (!raw) return "";
    let idx = 0;
    return raw.split(/\r?\n/).map((line) => {
      if (!line.trim()) return "";
      idx++;
      return idx + ". " + line;
    }).join("\n");
  }
  function numberedToRaw(numbered) {
    return numbered.split(/\r?\n/).map((line) => {
      return line.replace(/^\d+\.\s+/, "");
    }).join("\n");
  }
  function renderRandomSection() {
    const { randomSection } = state.dom;
    randomSection.innerHTML = "";
    const isZh = (() => {
      try {
        return (chrome?.i18n?.getUILanguage?.() || "").toLowerCase().startsWith("zh");
      } catch (_) {
        return true;
      }
    })();
    const switchCard = document.createElement("section");
    switchCard.className = "other-settings-card";
    switchCard.innerHTML = `<div class="other-settings-list"></div>`;
    const switchList = switchCard.querySelector(".other-settings-list");
    switchList?.appendChild(
      createOtherSettingToggle(
        "showRandomButton",
        msg("settings_random_showSwitchTitle", "显示随机骰子按钮"),
        msg("settings_random_showSwitchDesc", "开启后，输入框下方会出现骰子按钮，点击即可从下方题库里随机抽取一个问题填入搜索框。")
      )
    );
    const introDiv = document.createElement("div");
    introDiv.className = "random-intro-text";
    const p1 = document.createElement("p");
    p1.className = "random-hint-para";
    p1.textContent = isZh ? "很多时候不是不想用 AI，而是不知道问什么。随手一点骰子，一个好问题出来了，思考就开始了。" : "Often the problem isn't not wanting to use AI — it's not knowing what to ask. One tap of the dice, a great question surfaces. Thinking begins.";
    const p2 = document.createElement("p");
    p2.className = "random-hint-para";
    if (isZh) {
      p2.innerHTML = "题库可以自己设置——因为最好的题库永远是关于你自己的。根据你的职业、兴趣或想探索的方向，填入你真正关心的问题，<br>让每一次随机都有价值。";
    } else {
      p2.textContent = "Build your own pool — because the best questions are always the ones most relevant to you. Fill it with topics tied to your role, interests, or goals, and every roll becomes worthwhile.";
    }
    introDiv.appendChild(p1);
    introDiv.appendChild(p2);
    randomSection.appendChild(introDiv);
    randomSection.appendChild(switchCard);
    const poolCard = document.createElement("section");
    poolCard.className = "other-settings-card random-pool-card";
    poolCard.innerHTML = `
    <div class="other-settings-intro">
      <strong>${escapeHtml(msg("settings_random_poolTitle", "问题库"))}</strong>
    </div>
    <textarea class="random-pool-textarea" spellcheck="false" placeholder="${escapeHtml(msg("settings_random_poolPlaceholder", "每行一个问题…"))}"></textarea>
    <div class="random-pool-footer">
      <span class="random-pool-count"></span>
      <span class="random-pool-status" aria-live="polite"></span>
    </div>
  `;
    const textarea = poolCard.querySelector(".random-pool-textarea");
    const countEl = poolCard.querySelector(".random-pool-count");
    const statusEl = poolCard.querySelector(".random-pool-status");
    const updateCount = (raw) => {
      const n = countRandomQuestions(raw);
      countEl.textContent = msg("settings_random_countPrefix", "当前共 ") + n + msg("settings_random_countSuffix", " 个问题。");
    };
    const reformat = () => {
      const raw = numberedToRaw(textarea.value);
      textarea.value = rawToNumbered(raw);
      updateCount(raw);
      return raw;
    };
    const initialRaw = typeof state.randomQuestionsText === "string" ? state.randomQuestionsText : state.defaultRandomQuestionsText;
    textarea.value = rawToNumbered(initialRaw);
    updateCount(initialRaw);
    let saveTimer = null;
    let statusTimer = null;
    const showSaved = () => {
      statusEl.textContent = msg("settings_random_saved", "已保存");
      statusEl.classList.add("is-visible");
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => statusEl.classList.remove("is-visible"), 1200);
    };
    const scheduleSave = (raw) => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        saveTimer = null;
        state.randomQuestionsText = raw;
        await persistRandomQuestionsText();
        showSaved();
      }, 400);
    };
    textarea.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const startPos = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const linesBeforeCursor = value.substring(0, startPos).split("\n");
      let lastNum = 0;
      for (const line of linesBeforeCursor) {
        const m = line.match(/^(\d+)\.\s/);
        if (m) lastNum = parseInt(m[1], 10);
      }
      const curLine = linesBeforeCursor[linesBeforeCursor.length - 1] || "";
      const curMatch = curLine.match(/^(\d+)\.\s/);
      if (curMatch) lastNum = Math.max(lastNum, parseInt(curMatch[1], 10));
      const nextNum = lastNum + 1;
      const insertion = "\n" + nextNum + ". ";
      const newValue = value.substring(0, startPos) + insertion + value.substring(end);
      textarea.value = newValue;
      const newPos = startPos + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
      const raw = numberedToRaw(newValue);
      updateCount(raw);
      scheduleSave(raw);
    });
    textarea.addEventListener("input", () => {
      const raw = numberedToRaw(textarea.value);
      updateCount(raw);
      scheduleSave(raw);
    });
    textarea.addEventListener("blur", async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const raw = reformat();
      state.randomQuestionsText = raw;
      await persistRandomQuestionsText();
    });
    textarea.addEventListener("paste", () => {
      requestAnimationFrame(() => {
        const raw = reformat();
        scheduleSave(raw);
      });
    });
    randomSection.appendChild(poolCard);
    const COPYPROMPT = isZh ? `我想定制一套专属 AI 提问题库，用于每天随机抽取问题，并直接发送给 AI 进行分析、搜索、拆解或生成建议。

我的身份 / 职业：[填写你的职业、行业或角色]
我关注的方向：[填写你最近关心的领域或兴趣]
我当前想解决的问题：[填写你的目标、困惑或正在做的事]

请根据以上信息，生成 30 个高质量问题。

要求：
每个问题都要适合直接发送给 AI 使用
问题要采用清晰、客观、可分析的表达方式
问题要能引导 AI 输出分析、方法、案例、步骤、对比或建议
问题要贴近我的身份、关注方向和当前问题
问题不要太宽泛，要有具体场景或明确切入点，覆盖行业洞察、实操方法、机会发现、风险判断、复盘优化等方向
不要输出分类、编号、解释、标题或多余内容
每个问题单独占一行` : `I want to build a custom AI question bank — a personal collection of prompts for daily use, sent directly to AI for analysis, research, breakdown, or generating recommendations.

My role / profession: [your job title, industry, or role]
My focus area: [what you're currently interested in or exploring]
My current challenge: [your goal, question, or ongoing project]

Based on the above, generate 30 high-quality questions.

Requirements:
Every question should be suitable for sending directly to an AI
Questions should be clear, specific, and analytically framed
Questions should prompt the AI to produce analysis, methods, examples, steps, comparisons, or recommendations
Questions should be relevant to my role, focus area, and current challenge
Avoid vague questions — each should have a concrete angle or scenario, covering areas such as industry insights, practical approaches, opportunity discovery, risk assessment, and retrospective improvement
Do not include categories, numbers, explanations, headings, or any extra content
One question per line`;
    const hintCard = document.createElement("section");
    hintCard.className = "other-settings-card random-hint-card";
    const hint3Text = isZh ? "你也可以让 AI 帮你一起完成，协同制定一套属于自己的专属题库。参考下方提示词直接发给任意 AI：" : "You can also let AI help you build it. Send the prompt below to any AI to get started:";
    const copyLabel = isZh ? "复制" : "Copy";
    const copyAriaLabel = isZh ? "复制提示词" : "Copy prompt";
    hintCard.innerHTML = `
    <p class="random-hint-para">${hint3Text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    <div class="random-prompt-block">
      <button class="random-prompt-copy-btn" type="button" aria-label="${copyAriaLabel}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span class="random-prompt-copy-label">${copyLabel}</span>
      </button>
      <pre class="random-prompt-text"></pre>
    </div>
  `;
    const promptPre = hintCard.querySelector(".random-prompt-text");
    promptPre.textContent = COPYPROMPT;
    const copyBtn = hintCard.querySelector(".random-prompt-copy-btn");
    const copyLabelEl = hintCard.querySelector(".random-prompt-copy-label");
    let copyResetTimer = null;
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(COPYPROMPT);
      } catch (_e) {
        const ta = document.createElement("textarea");
        ta.value = COPYPROMPT;
        ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copyLabelEl.textContent = isZh ? "已复制" : "Copied";
      copyBtn.classList.add("is-copied");
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyLabelEl.textContent = copyLabel;
        copyBtn.classList.remove("is-copied");
      }, 1800);
    });
    randomSection.appendChild(hintCard);
  }

  // src/settings/settings/sections/about.js
  function renderAboutSection() {
    const { aboutSection } = state.dom;
    aboutSection.innerHTML = "";
    const privacyCard = document.createElement("section");
    privacyCard.className = "other-settings-card about-plugin-card";
    privacyCard.innerHTML = `
    <div class="other-settings-intro about-plugin-intro">
      <strong>${msg("settings_about_privacyTitle", "隐私与数据说明")}</strong>
    </div>
    <div class="about-plugin-privacy" role="note">
      <p><strong>${msg("settings_about_openSourceLabel", "开源且免费：")}</strong>${msg("settings_about_openSourceBody", "Qshot 是一个开源且免费插件，不会进行任何后端服务器运行。欢迎审查与贡献。")}</p>
      <p><strong>${msg("settings_about_zeroDataLabel", "零数据收集：")}</strong>${msg("settings_about_zeroDataBody", "Qshot 不会将您的搜索关键词、浏览记录或页面内容上传到开发者服务器。用于功能的配置数据仅保存在本地。")}</p>
      <p><strong>${msg("settings_about_transparencyLabel", "交互透明性：")}</strong>${msg("settings_about_transparencyBody", "插件通过 iframe 或“新标签页模式”打开目标网站，您与网站的登录与交互均直接发生在浏览器与目标网站之间。")}</p>
    </div>
  `;
    aboutSection.appendChild(privacyCard);
    const linksRow = document.createElement("div");
    linksRow.className = "about-plugin-links-wrap";
    linksRow.innerHTML = `
    <div class="about-plugin-actions" aria-label="相关链接">
      <a class="about-plugin-action-btn" href="https://qshot.top/" target="_blank" rel="noreferrer noopener">${msg("settings_about_site", "插件官网")}</a>
      <a class="about-plugin-action-btn" href="https://github.com/30bewater/Qshot" target="_blank" rel="noreferrer noopener">${msg("settings_about_source", "开源地址")}</a>
      <div class="about-plugin-action-btn about-plugin-action-btn--author" role="group" aria-label="${msg("settings_about_authorAria", "作者账号")}">
        <span class="about-plugin-author-label">${msg("settings_about_authorLabel", "作者账号：")}</span>
        <div class="about-plugin-author-links">
        <a class="about-plugin-social" href="https://space.bilibili.com/101651671" target="_blank" rel="noreferrer noopener" aria-label="B站">
          <svg viewBox="0 0 1071 1024" aria-hidden="true">
            <path fill="currentColor" d="M887.365188 952.783894H184.455499C82.758914 952.783894 0 876.72402 0 783.272408V336.111466c0-93.477378 82.758914-169.537251 184.455499-169.537252h704.043373c51.969094 0 101.67082 20.225949 136.377002 55.498973A159.256801 159.256801 0 0 1 1071.846453 336.420652V783.272408c0 93.451613-82.758914 169.511486-184.481265 169.511486zM184.455499 251.600495c-54.829069 0-99.429218 37.901109-99.429218 84.510971V783.272408c0 46.609861 44.600149 84.51097 99.429218 84.51097H887.365188c54.829069 0 99.429218-37.901109 99.429218-84.51097V335.415796a74.539706 74.539706 0 0 0-22.570613-53.72115c-18.808844-19.11803-46.377972-30.09415-75.750687-30.094151z" />
            <path fill="currentColor" d="M397.794168 495.316736L219.651226 535.923226a36.355177 36.355177 0 0 1-15.175903-71.112889l178.142942-40.55496a35.8141 35.8141 0 0 1 43.131513 27.955611c4.302845 19.169562-8.786049 38.854434-27.95561 43.157279zM674.052285 495.316736c-19.169562-4.302845-32.258456-23.987717-27.955611-43.157279a35.8141 35.8141 0 0 1 43.131514-27.955611l178.142941 40.55496a36.355177 36.355177 0 0 1-15.175902 71.112889l-178.142942-40.554959zM268.811876 1023.999845a56.684187 56.684187 0 0 1-56.684187-56.813015v-42.590437a56.684187 56.684187 0 1 1 113.600264 0v42.590437a56.684187 56.684187 0 0 1-56.684187 56.813015zM803.034577 1023.999845a56.684187 56.684187 0 0 1-56.813015-56.813015v-42.590437a56.684187 56.684187 0 1 1 113.600264 0v42.590437a56.684187 56.684187 0 0 1-56.684187 56.813015z" />
            <path fill="currentColor" d="M248.918821 42.946487m26.538343-29.671097l0 0q26.538343-29.671097 56.20944-3.132755l185.900469 166.272595q29.671097 26.538343 3.132754 56.20944l0 0q-26.538343 29.671097-56.20944 3.132755l-185.900468-166.272595q-29.671097-26.538343-3.132755-56.20944Z" />
            <path fill="currentColor" d="M577.629382 262.330313m-26.538343-29.671098l0 0q-26.538343-29.671097 3.132755-56.20944l185.900468-166.272595q29.671097-26.538343 56.209441 3.132755l0 0q26.538343 29.671097-3.132755 56.20944l-185.900468 166.272595q-29.671097 26.538343-56.209441-3.132755Z" />
            <path fill="currentColor" d="M595.621982 756.373184a39.447041 39.447041 0 0 1-30.738289-14.686357L533.346672 702.677799l-32.438814 38.467951a39.730462 39.730462 0 0 1-55.473207 5.153108l-44.316729-36.535535a23.188986 23.188986 0 1 1 29.501543-35.762569l39.163621 32.258455 33.495202-39.601634a39.6274 39.6274 0 0 1 61.038563 0.566842l32.722236 40.323069 45.424646-33.933215A23.188986 23.188986 0 1 1 669.904033 710.665117l-50.655051 37.798047a39.369745 39.369745 0 0 1-23.627 7.91002z" />
          </svg>
        </a>
        <a class="about-plugin-social" href="https://www.douyin.com/user/MS4wLjABAAAADBh-jUk9v7E7KNECLoVzxFBsoRNGaXNQ0U1Fyf5KOSlQQq0b38ulL6fObIsagi2T" target="_blank" rel="noreferrer noopener" aria-label="抖音">
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <path fill="currentColor" d="M937.4 423.9c-84 0-165.7-27.3-232.9-77.8v352.3c0 179.9-138.6 325.6-309.6 325.6S85.3 878.3 85.3 698.4c0-179.9 138.6-325.6 309.6-325.6 17.1 0 33.7 1.5 49.9 4.3v186.6c-15.5-6.1-32-9.2-48.6-9.2-76.3 0-138.2 65-138.2 145.3 0 80.2 61.9 145.3 138.2 145.3 76.2 0 138.1-65.1 138.1-145.3V0H707c0 134.5 103.7 243.5 231.6 243.5v180.3l-1.2 0.1" />
          </svg>
        </a>
        <a class="about-plugin-social" href="https://www.xiaohongshu.com/user/profile/6301f593000000001200ee74?m_source=itab" target="_blank" rel="noreferrer noopener" aria-label="小红书">
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <path fill="currentColor" d="M996.152 56.513c-7.986-10.852-17.61-20.885-28.871-28.87C944.143 10.442 916.09 0 885.377 0H138.419c-30.715 0-59.176 10.443-82.314 27.642-10.852 7.986-20.885 17.61-28.87 28.87C10.444 79.448 0.001 107.703 0.001 138.623V885.58c0 30.715 10.442 59.176 27.641 81.905 7.986 10.852 17.61 20.885 28.871 28.87 23.138 17.2 51.19 27.643 81.904 27.643h746.959c30.714 0 59.175-10.443 81.904-27.642 10.852-7.986 20.885-17.61 28.87-28.87 17.2-23.139 27.643-51.19 27.643-81.905V138.622c0-30.92-10.852-59.175-27.642-82.11z m-629.633 410.54c16.38-36.241 34.81-71.87 52.213-107.497h59.995c-14.743 29.28-31.124 57.947-41.566 85.794 24.366-1.433 46.48-2.662 72.484-4.095-13.923 27.847-26.209 52.623-38.494 77.398-1.639 3.276-3.277 6.757-4.915 10.033-12.9 25.8-12.9 26.004 15.767 26.62 3.071 0 5.938 0.41 11.466 1.022-7.985 15.767-15.152 30.1-22.728 44.228-1.229 2.253-4.71 4.915-6.962 4.915-21.09 0-42.385 0.614-63.475-1.639-15.152-1.638-21.09-13.309-15.152-27.642 7.166-17.814 15.766-35.219 23.752-52.828 2.662-6.143 5.528-12.08 9.42-21.09-11.673 0-20.272 0.206-28.872 0-24.776-1.023-33.17-12.285-22.933-35.218zM76.171 658.299c-12.695-22.114-24.16-42.59-35.832-63.065 0-2.458 22.933-72.485 17.814-151.726h63.065s2.253 148.45-45.047 214.791z m147.222-7.985c0.614 37.061-24.98 37.061-24.98 37.061H162.17l-38.085-50.37h39.928v-277.45h59.994c0 90.915-0.204 199.846-0.614 290.76z m87.227 4.71c-28.666-25.186-44.227-100.333-43.818-211.925h59.175c-4.504 58.765 14.538 137.187 14.538 137.187s-17.404 38.495-29.895 74.737z m129.817 26.004c-1.638 3.071-6.757 5.938-10.443 6.142-27.847 0.41-55.9 0.205-87.842 0.205 12.081-24.16 22.114-43.818 30.92-61.018h95.621c-10.647 20.885-19.042 38.085-28.256 54.67z m244.481 6.552h-215.2c10.442-20.68 29.075-57.537 29.075-57.537h61.428V441.87h-38.29v-58.766h138.622v57.947h-37.88v189.196h62.245v57.333z m284.615-43.409c0 43.409-42.385 42.18-42.385 42.18h-55.285l-23.138-49.756 59.995 0.205s0.614-45.047 0-60.609c-0.41-13.105-7.576-21.5-20.886-21.704-26.618-0.615-53.442-0.205-82.722-0.205v132.274h-59.38V555.1h-59.995v-61.222h58.356v-51.804h-38.7v-57.947h39.315v-24.571h59.994l0.41 24.57h47.708s44.024-1.023 44.228 41.77c0.205 12.697 0.41 54.263 0.41 68.187 50.575-0.205 72.075 10.033 72.075 45.25V644.17z m-25.39-200.46H912.2v-30.507c0-11.057 5.528-21.295 14.947-27.233 10.647-6.757 25.39-11.057 39.314 2.252 0.614 0.41 1.024 1.024 1.433 1.638 19.247 20.27 4.095 53.852-23.752 53.852z" />
            <path fill="currentColor" d="M805.521 493.878h39.723v-52.01h-40.132z" />
          </svg>
        </a>
      </div>
      </div>
    </div>
  `;
    aboutSection.appendChild(linksRow);
  }

  // src/settings/settings/import-export.js
  function handleExport() {
    const lines = [];
    state.promptGroups.forEach((group, gi) => {
      if (gi > 0) lines.push("");
      lines.push(`# ${group.name}`);
      group.prompts.forEach((p) => {
        lines.push("");
        lines.push(`## ${p.title}`);
        lines.push("");
        lines.push(flattenPromptContentForExport(p.content));
      });
    });
    const markdown = lines.join("\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Qshow提示词-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function flattenPromptContentForExport(raw) {
    const text = String(raw || "").trim();
    if (!text) return text;
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
        out.push(`**${headingMatch[2].trim()}**`);
        out.push("");
      } else {
        out.push(trimmedEnd);
      }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function parseMarkdownPrompts(text) {
    const groups = [];
    const groupChunks = text.split(/\n(?=# (?!#))/);
    for (const chunk of groupChunks) {
      const chunkLines = chunk.split("\n");
      const firstLine = chunkLines[0] || "";
      if (!firstLine.startsWith("# ") || firstLine.startsWith("## ")) continue;
      const groupName = firstLine.slice(2).trim();
      if (!groupName) continue;
      const prompts = [];
      const rest = chunkLines.slice(1).join("\n");
      const promptChunks = rest.split(/\n(?=## )/);
      for (const pChunk of promptChunks) {
        const pLines = pChunk.split("\n");
        const pFirst = pLines[0] || "";
        if (!pFirst.startsWith("## ")) continue;
        const title = pFirst.slice(3).trim();
        if (!title) continue;
        const content = pLines.slice(1).join("\n").trim();
        prompts.push({ title, content });
      }
      groups.push({ name: groupName, prompts });
    }
    return groups;
  }
  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let valid = [];
      if (file.name.endsWith(".json") || text.trimStart().startsWith("{")) {
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.promptGroups)) {
          alert("JSON 格式不正确，请导入从本插件导出的文件。");
          return;
        }
        valid = data.promptGroups.filter(
          (g) => g && typeof g.name === "string" && g.name.trim() && Array.isArray(g.prompts)
        );
      } else {
        valid = parseMarkdownPrompts(text);
      }
      if (!valid.length) {
        alert("文件中没有可导入的提示词分组。");
        return;
      }
      openImportModal(valid);
    } catch (_) {
      alert("无法解析文件，请检查文件格式是否正确。");
    }
  }
  function openImportModal(importedGroups) {
    const allName = getAllPromptGroupName();
    const existingNames = new Set(state.promptGroups.map((g) => g.name));
    state.importModalState = {
      groups: importedGroups.map((group) => {
        const prompts = group.prompts.map((p) => ({
          title: String(p.title || "").trim() || "未命名提示词",
          content: String(p.content || "")
        }));
        let name = group.name.trim();
        if (name === LEGACY_DEFAULT_GROUP_NAME) {
          name = allName;
        }
        return {
          name,
          prompts,
          expanded: false,
          conflictExists: existingNames.has(name),
          conflictStrategy: "merge",
          promptSelections: prompts.map(() => true)
        };
      })
    };
    renderImportModal();
  }
  function renderImportModal() {
    document.getElementById("promptImportModal")?.remove();
    if (!state.importModalState) return;
    const totalPrompts = state.importModalState.groups.reduce((s, g) => s + g.prompts.length, 0);
    const selectedCount = state.importModalState.groups.reduce(
      (s, g) => s + g.promptSelections.filter(Boolean).length,
      0
    );
    const overlay = document.createElement("div");
    overlay.id = "promptImportModal";
    overlay.className = "import-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeImportModal();
    });
    const dialog = document.createElement("div");
    dialog.className = "import-modal-dialog";
    const header = document.createElement("div");
    header.className = "import-modal-header";
    const headerText = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "import-modal-title";
    titleEl.textContent = "导入提示词";
    const subtitleEl = document.createElement("div");
    subtitleEl.className = "import-modal-subtitle";
    subtitleEl.textContent = `共 ${state.importModalState.groups.length} 个分组，${totalPrompts} 条提示词 · 已选 ${selectedCount} 条`;
    headerText.appendChild(titleEl);
    headerText.appendChild(subtitleEl);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "import-modal-close";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    closeBtn.addEventListener("click", closeImportModal);
    header.appendChild(headerText);
    header.appendChild(closeBtn);
    const body = document.createElement("div");
    body.className = "import-modal-body";
    state.importModalState.groups.forEach((group, gi) => {
      const selectedInGroup = group.promptSelections.filter(Boolean).length;
      const allSelected = selectedInGroup === group.prompts.length;
      const noneSelected = selectedInGroup === 0;
      const groupItem = document.createElement("div");
      groupItem.className = "import-group-item";
      const groupRow = document.createElement("div");
      groupRow.className = "import-group-row";
      const groupCheck = document.createElement("input");
      groupCheck.type = "checkbox";
      groupCheck.className = "import-checkbox";
      groupCheck.checked = allSelected;
      groupCheck.indeterminate = !allSelected && !noneSelected;
      groupCheck.addEventListener("change", () => {
        state.importModalState.groups[gi].promptSelections = state.importModalState.groups[gi].prompts.map(() => groupCheck.checked);
        renderImportModal();
      });
      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "import-expand-btn";
      expandBtn.setAttribute("aria-label", group.expanded ? "收起" : "展开");
      expandBtn.innerHTML = group.expanded ? `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      expandBtn.addEventListener("click", () => {
        state.importModalState.groups[gi].expanded = !state.importModalState.groups[gi].expanded;
        renderImportModal();
      });
      const groupNameEl = document.createElement("span");
      groupNameEl.className = "import-group-name";
      groupNameEl.textContent = group.name;
      groupNameEl.addEventListener("click", () => {
        state.importModalState.groups[gi].expanded = !state.importModalState.groups[gi].expanded;
        renderImportModal();
      });
      const groupMetaEl = document.createElement("span");
      groupMetaEl.className = "import-group-meta";
      groupMetaEl.textContent = `${selectedInGroup}/${group.prompts.length}`;
      groupRow.appendChild(groupCheck);
      groupRow.appendChild(expandBtn);
      groupRow.appendChild(groupNameEl);
      groupRow.appendChild(groupMetaEl);
      if (group.conflictExists) {
        const badge = document.createElement("span");
        badge.className = "import-conflict-badge";
        badge.textContent = "已存在";
        groupRow.appendChild(badge);
        const strategyWrap = document.createElement("div");
        strategyWrap.className = "import-strategy-wrap";
        ["merge", "new"].forEach((strategy) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `import-strategy-btn${group.conflictStrategy === strategy ? " is-active" : ""}`;
          btn.textContent = strategy === "merge" ? "合并" : "新建";
          btn.title = strategy === "merge" ? "将选中内容追加到已有分组" : "保留原分组，另建新分组";
          btn.addEventListener("click", () => {
            state.importModalState.groups[gi].conflictStrategy = strategy;
            renderImportModal();
          });
          strategyWrap.appendChild(btn);
        });
        groupRow.appendChild(strategyWrap);
      }
      groupItem.appendChild(groupRow);
      if (group.expanded) {
        const promptList = document.createElement("div");
        promptList.className = "import-prompt-list";
        group.prompts.forEach((prompt, pi) => {
          const promptRow = document.createElement("label");
          promptRow.className = "import-prompt-row";
          const promptCheck = document.createElement("input");
          promptCheck.type = "checkbox";
          promptCheck.className = "import-checkbox";
          promptCheck.checked = group.promptSelections[pi];
          promptCheck.addEventListener("change", () => {
            state.importModalState.groups[gi].promptSelections[pi] = promptCheck.checked;
            renderImportModal();
          });
          const promptTitle = document.createElement("span");
          promptTitle.className = "import-prompt-title";
          promptTitle.textContent = prompt.title;
          promptRow.appendChild(promptCheck);
          promptRow.appendChild(promptTitle);
          promptList.appendChild(promptRow);
        });
        groupItem.appendChild(promptList);
      }
      body.appendChild(groupItem);
    });
    const footer = document.createElement("div");
    footer.className = "import-modal-footer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "import-footer-cancel-btn";
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", closeImportModal);
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "import-footer-confirm-btn";
    confirmBtn.textContent = selectedCount > 0 ? `导入已选（${selectedCount} 条）` : "导入";
    confirmBtn.disabled = selectedCount === 0;
    confirmBtn.addEventListener("click", doImport);
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }
  function closeImportModal() {
    document.getElementById("promptImportModal")?.remove();
    state.importModalState = null;
  }
  async function doImport() {
    if (!state.importModalState) return;
    const existingGroupMap = new Map(state.promptGroups.map((g) => [g.name, g]));
    state.importModalState.groups.forEach((group) => {
      const selectedPrompts = group.prompts.filter((_, i) => group.promptSelections[i]);
      if (!selectedPrompts.length) return;
      const newPrompts = selectedPrompts.map((p) => ({
        id: `prompt-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: p.title,
        content: p.content
      }));
      if (group.conflictExists && group.conflictStrategy === "merge") {
        const existing = existingGroupMap.get(group.name);
        if (existing) {
          existing.prompts.push(...newPrompts);
        }
      } else {
        let name = group.name;
        if (group.conflictExists && group.conflictStrategy === "new") {
          let suffix = 2;
          while (state.promptGroups.some((g) => g.name === name)) {
            name = `${group.name} (${suffix++})`;
          }
        }
        state.promptGroups.push({
          id: `prompt-group-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          prompts: newPrompts
        });
      }
    });
    await persistAll();
    closeImportModal();
    state.activePromptGroupId = state.promptGroups[0]?.id || null;
    state.renderPromptsSection();
  }

  // src/settings/settings/main.js
  function initSettingsPage() {
    document.addEventListener("DOMContentLoaded", start);
  }
  function cacheElements() {
    state.dom.groupsSection = document.getElementById("groupsSection");
    state.dom.promptsSection = document.getElementById("promptsSection");
    state.dom.customSection = document.getElementById("customSection");
    state.dom.randomSection = document.getElementById("randomSection");
    state.dom.otherSection = document.getElementById("otherSection");
    state.dom.aboutSection = document.getElementById("aboutSection");
    state.dom.sectionEyebrow = document.getElementById("sectionEyebrow");
    state.dom.sectionLogoWrap = document.getElementById("sectionLogoWrap");
    state.dom.sectionTitleRow = document.getElementById("sectionTitleRow");
    state.dom.sectionTitle = document.getElementById("sectionTitle");
    state.dom.sectionSubtitle = document.getElementById("sectionSubtitle");
    state.dom.promptsHeaderActions = document.getElementById("promptsHeaderActions");
    state.dom.promptLearnLink = document.getElementById("promptLearnLink");
    state.dom.navItems = Array.from(document.querySelectorAll(".settings-nav-item"));
  }
  function registerRenderCallbacks() {
    state.renderCurrentSection = renderCurrentSection;
    state.renderGroupsSection = renderGroupsSection;
    state.renderPromptsSection = renderPromptsSection;
    state.renderCustomSection = renderCustomSection;
    state.renderRandomSection = renderRandomSection;
    state.renderOtherSection = renderOtherSection;
    state.renderAboutSection = renderAboutSection;
  }
  async function start() {
    applyDomI18n?.(document);
    cacheElements();
    registerRenderCallbacks();
    const builtinSites = await loadBuiltinSites();
    const stored = await chrome.storage.local.get([
      SEARCH_GROUPS_STORAGE_KEY,
      PROMPT_GROUPS_STORAGE_KEY,
      UI_PREFS_STORAGE_KEY,
      CUSTOM_SITES_STORAGE_KEY,
      RANDOM_QUESTIONS_STORAGE_KEY
    ]);
    state.customSites = createNormalizedCustomSites(stored[CUSTOM_SITES_STORAGE_KEY]);
    state.sites = mergeSites(builtinSites, state.customSites);
    syncCustomCategoryIds();
    state.groups = createNormalizedGroups(stored[SEARCH_GROUPS_STORAGE_KEY]);
    state.promptGroups = createNormalizedPromptGroups(stored[PROMPT_GROUPS_STORAGE_KEY]);
    state.uiPrefs = createNormalizedUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
    const uiLang = (() => {
      try {
        return (chrome?.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase();
      } catch (_e) {
        return (navigator.language || "").toLowerCase();
      }
    })();
    state.defaultRandomQuestionsText = await loadDefaultRandomQuestionsText(uiLang);
    const otherLang = uiLang.startsWith("zh") ? "en" : "zh";
    const otherDefaultRandomQuestionsText = await loadDefaultRandomQuestionsText(otherLang);
    const storedRaw = stored[RANDOM_QUESTIONS_STORAGE_KEY];
    const isOldDefault = typeof storedRaw === "string" && storedRaw.trimStart().startsWith("#");
    const hasUserRandomQuestions = typeof storedRaw === "string" && storedRaw.trim().length > 0;
    const normalizedRaw = hasUserRandomQuestions ? storedRaw.trim() : "";
    const normalizedOtherDefault = otherDefaultRandomQuestionsText.trim();
    const isStoredOtherLangDefault = normalizedRaw && normalizedRaw === normalizedOtherDefault;
    state.randomQuestionsText = hasUserRandomQuestions && !isOldDefault && !isStoredOtherLangDefault ? storedRaw : state.defaultRandomQuestionsText;
    state.activePromptGroupId = state.promptGroups[0]?.id || null;
    if (!Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) || stored[SEARCH_GROUPS_STORAGE_KEY].length === 0) {
      await chrome.storage.local.set({ [SEARCH_GROUPS_STORAGE_KEY]: state.groups });
    }
    if (!Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY]) || stored[PROMPT_GROUPS_STORAGE_KEY].length === 0) {
      await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: state.promptGroups });
    }
    if (!stored[UI_PREFS_STORAGE_KEY] || typeof stored[UI_PREFS_STORAGE_KEY] !== "object") {
      await chrome.storage.local.set({ [UI_PREFS_STORAGE_KEY]: state.uiPrefs });
    }
    if (!Array.isArray(stored[CUSTOM_SITES_STORAGE_KEY])) {
      await chrome.storage.local.set({ [CUSTOM_SITES_STORAGE_KEY]: state.customSites });
    }
    bindEvents();
    const hashSection = new URLSearchParams(location.search).get("section") || location.hash.replace("#", "");
    if (hashSection && SECTION_META[hashSection]) {
      setActiveSection(hashSection);
    } else {
      setActiveSection(state.activeSection);
    }
  }
  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    attachGroupDrag(state.dom.groupsSection);
    state.dom.navItems.forEach((item) => {
      item.addEventListener("click", () => {
        setActiveSection(item.dataset.section || "groups");
      });
    });
    const exportBtn = document.getElementById("promptExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", handleExport);
    }
    const importBtn = document.getElementById("promptImportBtn");
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".md,.json";
        fileInput.addEventListener("change", handleImportFileChange);
        fileInput.click();
      });
    }
  }
  function handleDocumentClick(event) {
    if (state.openPickerGroupId && !event.target.closest(".inline-add-wrap")) {
      closePicker();
      renderGroupsSection();
      return;
    }
    if (!event.target.closest(".group-mode-dropdown")) {
      document.querySelectorAll(".group-mode-dropdown").forEach((dropdown) => {
        dropdown.classList.remove("is-open");
        const trigger = dropdown.querySelector("[data-field='mode-trigger']");
        const menu = dropdown.querySelector("[data-field='mode-menu']");
        if (trigger) {
          trigger.setAttribute("aria-expanded", "false");
        }
        if (menu) {
          menu.hidden = true;
        }
      });
    }
  }
  function setActiveSection(sectionKey) {
    if (!SECTION_META[sectionKey]) {
      return;
    }
    state.activeSection = sectionKey;
    state.dom.navItems.forEach(
      (item) => item.classList.toggle("is-active", item.dataset.section === sectionKey)
    );
    const meta = SECTION_META[sectionKey];
    const eyebrow = meta.eyebrowKey ? msg(meta.eyebrowKey, meta.eyebrow) : meta.eyebrow || "";
    const title = meta.titleKey ? msg(meta.titleKey, meta.title) : meta.title || "";
    const subtitle = meta.subtitleKey ? msg(meta.subtitleKey, meta.subtitle) : meta.subtitle || "";
    state.dom.sectionEyebrow.textContent = eyebrow;
    state.dom.sectionEyebrow.hidden = true;
    state.dom.sectionTitle.textContent = title;
    state.dom.sectionTitle.hidden = !title;
    state.dom.sectionSubtitle.textContent = subtitle;
    state.dom.sectionSubtitle.hidden = !subtitle;
    state.dom.sectionLogoWrap.hidden = sectionKey !== "about";
    state.dom.sectionTitleRow.hidden = !title && sectionKey !== "prompts";
    updateSectionVisibility();
    renderCurrentSection();
  }
  function renderCurrentSection() {
    updateSectionVisibility();
    if (state.activeSection === "prompts") {
      renderPromptsSection();
      return;
    }
    if (state.activeSection === "custom") {
      renderCustomSection();
      return;
    }
    if (state.activeSection === "random") {
      renderRandomSection();
      return;
    }
    if (state.activeSection === "other") {
      renderOtherSection();
      return;
    }
    if (state.activeSection === "about") {
      renderAboutSection();
      return;
    }
    renderGroupsSection();
  }
  function updateSectionVisibility() {
    const { dom } = state;
    const showGroups = state.activeSection === "groups";
    const showPrompts = state.activeSection === "prompts";
    const showCustom = state.activeSection === "custom";
    const showRandom = state.activeSection === "random";
    const showOther = state.activeSection === "other";
    const showAbout = state.activeSection === "about";
    if (dom.groupsSection) {
      dom.groupsSection.hidden = !showGroups;
      dom.groupsSection.style.display = showGroups ? "flex" : "none";
    }
    if (dom.promptsSection) {
      dom.promptsSection.hidden = !showPrompts;
      dom.promptsSection.style.display = showPrompts ? "flex" : "none";
    }
    if (dom.customSection) {
      dom.customSection.hidden = !showCustom;
      dom.customSection.style.display = showCustom ? "flex" : "none";
    }
    if (dom.randomSection) {
      dom.randomSection.hidden = !showRandom;
      dom.randomSection.style.display = showRandom ? "flex" : "none";
    }
    if (dom.otherSection) {
      dom.otherSection.hidden = !showOther;
      dom.otherSection.style.display = showOther ? "flex" : "none";
    }
    if (dom.aboutSection) {
      dom.aboutSection.hidden = !showAbout;
      dom.aboutSection.style.display = showAbout ? "flex" : "none";
    }
    if (dom.promptsHeaderActions) {
      dom.promptsHeaderActions.hidden = !showPrompts;
      dom.promptsHeaderActions.style.display = showPrompts ? "flex" : "none";
    }
    if (dom.promptLearnLink) {
      dom.promptLearnLink.hidden = !showPrompts;
    }
  }

  // src/settings/settings.js
  initSettingsPage();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdG9yYWdlLWtleXMuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL3N0YXRlLmpzIiwgIi4uLy4uL3NyYy9zZXR0aW5ncy9zZXR0aW5ncy91dGlscy5qcyIsICIuLi8uLi9zcmMvc2hhcmVkL3Byb21wdC1ncm91cHMuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9zaG9ydGN1dC5qcyIsICIuLi8uLi9zcmMvc2V0dGluZ3Mvc2V0dGluZ3Mvc3RvcmUuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL2RyYWcuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL3NlY3Rpb25zL2dyb3Vwcy5qcyIsICIuLi8uLi9zcmMvc2V0dGluZ3Mvc2V0dGluZ3Mvc2VjdGlvbnMvcHJvbXB0cy1lZGl0b3IuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL3NlY3Rpb25zL3Byb21wdHMuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL3NlY3Rpb25zL2N1c3RvbS5qcyIsICIuLi8uLi9zcmMvc2V0dGluZ3Mvc2V0dGluZ3Mvc2VjdGlvbnMvb3RoZXIuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL3NlY3Rpb25zL3JhbmRvbS5qcyIsICIuLi8uLi9zcmMvc2V0dGluZ3Mvc2V0dGluZ3Mvc2VjdGlvbnMvYWJvdXQuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL2ltcG9ydC1leHBvcnQuanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzL21haW4uanMiLCAiLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJleHBvcnQgY29uc3QgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSA9IFwic2VhcmNoR3JvdXBzXCI7XHJcbmV4cG9ydCBjb25zdCBQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZID0gXCJwcm9tcHRHcm91cHNcIjtcclxuZXhwb3J0IGNvbnN0IFVJX1BSRUZTX1NUT1JBR0VfS0VZID0gXCJ1aVByZWZzXCI7XHJcbmV4cG9ydCBjb25zdCBDVVNUT01fU0lURVNfU1RPUkFHRV9LRVkgPSBcImN1c3RvbVNpdGVzXCI7XHJcbmV4cG9ydCBjb25zdCBSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZID0gXCJyYW5kb21RdWVzdGlvbnNUZXh0XCI7XHJcbmV4cG9ydCBjb25zdCBTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSA9IFwic2VhcmNoSGlzdG9yeVwiO1xyXG5cclxuLy8gVGhlIGZpeGVkIFwiQWxsXCIgcHJvbXB0IGdyb3VwOiBhbHdheXMgZmlyc3QsIGNhbm5vdCBiZSBkZWxldGVkIG9yIHJlbmFtZWQuXHJcbmV4cG9ydCBjb25zdCBERUZBVUxUX1BST01QVF9HUk9VUF9JRCA9IFwicHJvbXB0LWdyb3VwLWRlZmF1bHRcIjtcclxuZXhwb3J0IGNvbnN0IExFR0FDWV9ERUZBVUxUX0dST1VQX05BTUUgPSBcIum7mOiupOWIhue7hFwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IFJBTkRPTV9RVUVTVElPTlNfRklMRVMgPSB7XHJcbiAgemg6IFwiY29uZmlnL3JhbmRvbS1xdWVzdGlvbnMvemgtQ04udHh0XCIsXHJcbiAgZW46IFwiY29uZmlnL3JhbmRvbS1xdWVzdGlvbnMvZW4udHh0XCIsXHJcbn07XHJcbiIsICIvLyBTaGFyZWQgbXV0YWJsZSBzdGF0ZSwgY29uc3RhbnRzIGFuZCBET00gcmVmcyBmb3IgdGhlIHNldHRpbmdzIHBhZ2UuXHJcbi8vIEVhY2ggbW9kdWxlIGltcG9ydHMgdGhpcyBzaW5nbGV0b24gYW5kIG11dGF0ZXMgZmllbGRzIGRpcmVjdGx5IGluc3RlYWQgb2ZcclxuLy8ganVnZ2xpbmcgY2xvc3VyZSBiaW5kaW5ncyBhbmQgY2FsbGJhY2sgY2hhaW5zLlxyXG5cclxuY29uc3QgcXNob3RJMThuID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgd2luZG93Ll9fUVNIT1RfSTE4Tl9fKSB8fCB7fTtcclxuZXhwb3J0IGNvbnN0IHQgPSBxc2hvdEkxOG4udDtcclxuZXhwb3J0IGNvbnN0IGFwcGx5RG9tSTE4biA9IHFzaG90STE4bi5hcHBseURvbUkxOG47XHJcblxyXG5leHBvcnQgY29uc3QgbXNnID0gKGtleSwgZmFsbGJhY2spID0+ICh0ID8gKHQoa2V5KSB8fCBmYWxsYmFjayB8fCBcIlwiKSA6IGZhbGxiYWNrIHx8IFwiXCIpO1xyXG5cclxuZXhwb3J0IGNvbnN0IFBJQ0tFUl9DTE9TRV9ERUxBWV9NUyA9IDMyMDtcclxuXHJcbmV4cG9ydCBjb25zdCBDT01NT05fU0VBUkNIX1BBUkFNX0tFWVMgPSBbXHJcbiAgXCJxXCIsIFwicXVlcnlcIiwgXCJ3ZFwiLCBcIndvcmRcIiwgXCJrd1wiLCBcImtleXdvcmRcIiwgXCJzXCIsIFwic2VhcmNoXCIsIFwia2V5XCIsIFwia1wiLCBcInRleHRcIiwgXCJ0ZXJtXCIsIFwid1wiXHJcbl07XHJcblxyXG5leHBvcnQgY29uc3QgU0lURV9DQVRFR09SSUVTID0ge1xyXG4gIGFpOiB7IGxhYmVsOiBcIkFJXCIsIHNpdGVJZHM6IFtcImRlZXBzZWVrXCIsIFwiZG91YmFvXCIsIFwia2ltaVwiLCBcInl1YW5iYW9cIiwgXCJxd2VuXCIsIFwibWV0YXNvXCIsIFwiZ2VtaW5pXCIsIFwiY2hhdGdwdFwiLCBcImNsYXVkZVwiLCBcImdyb2tcIl0gfSxcclxuICBvdGhlcjogeyBsYWJlbDogbXNnKFwic2V0dGluZ3NfZ3JvdXBzX2NhdGVnb3J5T3RoZXJcIiwgXCLnpL7lqpLlubPlj7BcIiksIHNpdGVJZHM6IFtcInhpYW9ob25nc2h1XCIsIFwiYmlsaWJpbGlcIiwgXCJ6aGlodVwiLCBcImRvdXlpblwiLCBcInR3aXR0ZXJcIiwgXCJ5b3V0dWJlXCIsIFwicmVkZGl0XCIsIFwidGlrdG9rXCJdIH0sXHJcbiAgY3VzdG9tOiB7IGxhYmVsOiBtc2coXCJzZXR0aW5nc19ncm91cHNfY2F0ZWdvcnlDdXN0b21cIiwgXCLoh6rlrprkuYlcIiksIHNpdGVJZHM6IFtdIH1cclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBBSV9TSVRFX0dST1VQUyA9IFtcclxuICB7IGxhYmVsOiBtc2coXCJzZXR0aW5nc19ncm91cHNfYWlEb21lc3RpY1wiLCBcIuWbveWGhVwiKSwgc2l0ZUlkczogW1wiZGVlcHNlZWtcIiwgXCJkb3ViYW9cIiwgXCJraW1pXCIsIFwieXVhbmJhb1wiLCBcInF3ZW5cIiwgXCJtZXRhc29cIl0gfSxcclxuICB7IGxhYmVsOiBtc2coXCJzZXR0aW5nc19ncm91cHNfYWlPdmVyc2Vhc1wiLCBcIuWbveWkllwiKSwgc2l0ZUlkczogW1wiZ2VtaW5pXCIsIFwiY2hhdGdwdFwiLCBcImNsYXVkZVwiLCBcImdyb2tcIl0gfVxyXG5dO1xyXG5cclxuZXhwb3J0IGNvbnN0IFNPQ0lBTF9TSVRFX0dST1VQUyA9IFtcclxuICB7IGxhYmVsOiBtc2coXCJzZXR0aW5nc19ncm91cHNfc29jaWFsRG9tZXN0aWNcIiwgXCLlm73lhoVcIiksIHNpdGVJZHM6IFtcInhpYW9ob25nc2h1XCIsIFwiYmlsaWJpbGlcIiwgXCJ6aGlodVwiLCBcImRvdXlpblwiXSB9LFxyXG4gIHsgbGFiZWw6IG1zZyhcInNldHRpbmdzX2dyb3Vwc19zb2NpYWxPdmVyc2Vhc1wiLCBcIua1t+WkllwiKSwgc2l0ZUlkczogW1widHdpdHRlclwiLCBcInlvdXR1YmVcIiwgXCJyZWRkaXRcIiwgXCJ0aWt0b2tcIl0gfVxyXG5dO1xyXG5cclxuZXhwb3J0IGNvbnN0IFNFQ1RJT05fTUVUQSA9IHtcclxuICBncm91cHM6IHtcclxuICAgIGV5ZWJyb3dLZXk6IFwic2V0dGluZ3NfZ3JvdXBzVGl0bGVcIixcclxuICAgIGV5ZWJyb3c6IFwi5pCc57Si57uE6K6+572uXCIsXHJcbiAgICB0aXRsZUtleTogXCJzZXR0aW5nc19zZWN0aW9uVGl0bGVfZ3JvdXBzXCIsXHJcbiAgICB0aXRsZTogXCLliIbnu4TkuI7osIPnlKjlhoXlrrlcIixcclxuICAgIHN1YnRpdGxlS2V5OiBcInNldHRpbmdzX3NlY3Rpb25TdWJ0aXRsZV9ncm91cHNcIixcclxuICAgIHN1YnRpdGxlOiBcIueuoeeQhuaQnOe0oue7hOWQjeensOOAgeWQr+eUqOeKtuaAgeOAgeaJk+W8gOaWueW8j++8jOS7peWPiuavj+S4que7hOWGheiwg+eUqOeahOe9keermeaIliBBSSDmqKHlnovjgIJcIlxyXG4gIH0sXHJcbiAgcHJvbXB0czoge1xyXG4gICAgZXllYnJvd0tleTogXCJzZXR0aW5nc19wcm9tcHRzVGl0bGVcIixcclxuICAgIGV5ZWJyb3c6IFwi5o+Q56S66K+N6K6+572uXCIsXHJcbiAgICB0aXRsZUtleTogXCJzZXR0aW5nc19tZXRhX3Byb21wdHNUaXRsZVwiLFxyXG4gICAgdGl0bGU6IFwi5o+Q56S66K+N566h55CGXCIsXHJcbiAgICBzdWJ0aXRsZUtleTogXCJzZXR0aW5nc19tZXRhX3Byb21wdHNTdWJ0aXRsZVwiLFxyXG4gICAgc3VidGl0bGU6IFwi6Ieq55Sx5re75Yqg5ZKM566h55CG5oKo55qE5bi455So5o+Q56S66K+N77yM6K6p5q+P5qyh6L6T5YWl5pu06auY5pWI44CCXCJcclxuICB9LFxyXG4gIGN1c3RvbToge1xyXG4gICAgZXllYnJvd0tleTogXCJzZXR0aW5nc19jdXN0b21UaXRsZVwiLFxyXG4gICAgZXllYnJvdzogXCLoh6rlrprkuYnmkJzntKJcIixcclxuICAgIHRpdGxlS2V5OiBcInNldHRpbmdzX21ldGFfY3VzdG9tVGl0bGVcIixcclxuICAgIHRpdGxlOiBcIuiHquWumuS5ieaQnOe0ouermeeCuVwiLFxyXG4gICAgc3VidGl0bGVLZXk6IFwic2V0dGluZ3NfbWV0YV9jdXN0b21TdWJ0aXRsZVwiLFxyXG4gICAgc3VidGl0bGU6IFwi5re75Yqg6Ieq5bex55qE5pCc57Si56uZ54K577yM5L+d5a2Y5ZCO5Y+v5Zyo5pCc57Si57uE55qE4oCc6Ieq5a6a5LmJ4oCd5YiG57G75Lit55u05o6l5Yu+6YCJ44CCXCJcclxuICB9LFxyXG4gIHJhbmRvbToge1xyXG4gICAgZXllYnJvd0tleTogXCJzZXR0aW5nc19yYW5kb21UaXRsZVwiLFxyXG4gICAgZXllYnJvdzogXCLpmo/mnLrpl67popjlupNcIixcclxuICAgIHRpdGxlS2V5OiBcInNldHRpbmdzX21ldGFfcmFuZG9tVGl0bGVcIixcclxuICAgIHRpdGxlOiBcIumaj+acuumXrumimOW6k1wiLFxyXG4gICAgc3VidGl0bGVLZXk6IFwic2V0dGluZ3NfbWV0YV9yYW5kb21TdWJ0aXRsZVwiLFxyXG4gICAgc3VidGl0bGU6IFwi566h55CG6aqw5a2Q5oyJ6ZKu6ZqP5py65oq95Y+W55qE6Zeu6aKY77yM5LiA6KGM5LiA5Liq6Zeu6aKY44CCXCJcclxuICB9LFxyXG4gIG90aGVyOiB7XHJcbiAgICBleWVicm93S2V5OiBcInNldHRpbmdzX3Nob3J0Y3V0c1RpdGxlXCIsXHJcbiAgICBleWVicm93OiBcIuW/q+aNt+mUruiuvue9rlwiLFxyXG4gICAgdGl0bGU6IFwiXCIsXHJcbiAgICBzdWJ0aXRsZTogXCJcIlxyXG4gIH0sXHJcbiAgYWJvdXQ6IHtcclxuICAgIGV5ZWJyb3c6IFwiXCIsXHJcbiAgICB0aXRsZTogXCJcIixcclxuICAgIHN1YnRpdGxlOiBcIlwiXHJcbiAgfVxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IEdST1VQX01PREVfT1BUSU9OUyA9IFtcclxuICB7IHZhbHVlOiBcImNvbXBhcmVcIiwgbGFiZWw6IG1zZyhcInNldHRpbmdzX2dyb3Vwc19tb2RlQ29tcGFyZVwiLCBcIuWNoeeJh+WRiOeOsFwiKSB9LFxyXG4gIHsgdmFsdWU6IFwidGFic1wiLCBsYWJlbDogbXNnKFwic2V0dGluZ3NfZ3JvdXBzX21vZGVUYWJzXCIsIFwi5paw5byA5qCH562+XCIpIH1cclxuXTtcclxuXHJcbi8vIFNoYXJlZCBtdXRhYmxlIHN0YXRlLiBQb3B1bGF0ZWQgYnkgbWFpbi5qcyNzdGFydCBhZnRlciBET00gaXMgcmVhZHkuXHJcbmV4cG9ydCBjb25zdCBzdGF0ZSA9IHtcclxuICBncm91cHM6IFtdLFxyXG4gIHByb21wdEdyb3VwczogW10sXHJcbiAgdWlQcmVmczogbnVsbCxcclxuICByYW5kb21RdWVzdGlvbnNUZXh0OiBudWxsLFxyXG4gIGRlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0OiBcIlwiLFxyXG4gIHNpdGVzOiBbXSxcclxuICBjdXN0b21TaXRlczogW10sXHJcbiAgY3VzdG9tRm9ybVN0YXRlOiBjcmVhdGVCbGFua0N1c3RvbUZvcm1TdGF0ZSgpLFxyXG4gIGFjdGl2ZVNlY3Rpb246IFwiZ3JvdXBzXCIsXHJcbiAgb3BlblBpY2tlckdyb3VwSWQ6IG51bGwsXHJcbiAgYWN0aXZlUGlja2VyQ2F0ZWdvcnlLZXk6IG51bGwsXHJcbiAgcGlja2VyQ2xvc2VUaW1lcklkOiBudWxsLFxyXG4gIGFjdGl2ZVByb21wdEdyb3VwSWQ6IG51bGwsXHJcbiAgcHJvbXB0RWRpdG9yU3RhdGU6IG51bGwsXHJcbiAgcGVuZGluZ1Byb21wdEdyb3VwRm9jdXNJZDogbnVsbCxcclxuICByZW5hbWluZ1Byb21wdEdyb3VwSWQ6IG51bGwsXHJcbiAgaW1wb3J0TW9kYWxTdGF0ZTogbnVsbCxcclxuICBfcHJvbXB0SG92ZXJUaW1lcjogbnVsbCxcclxuICBfaG92ZXJDYXJkS2V5SGFuZGxlcjogbnVsbCxcclxuICAvLyBET00gcmVmcyDigJQgcG9wdWxhdGVkIGluIG1haW4uanMjY2FjaGVFbGVtZW50cy5cclxuICBkb206IHtcclxuICAgIGdyb3Vwc1NlY3Rpb246IG51bGwsXHJcbiAgICBwcm9tcHRzU2VjdGlvbjogbnVsbCxcclxuICAgIGN1c3RvbVNlY3Rpb246IG51bGwsXHJcbiAgICByYW5kb21TZWN0aW9uOiBudWxsLFxyXG4gICAgb3RoZXJTZWN0aW9uOiBudWxsLFxyXG4gICAgYWJvdXRTZWN0aW9uOiBudWxsLFxyXG4gICAgc2VjdGlvbkV5ZWJyb3c6IG51bGwsXHJcbiAgICBzZWN0aW9uTG9nb1dyYXA6IG51bGwsXHJcbiAgICBzZWN0aW9uVGl0bGVSb3c6IG51bGwsXHJcbiAgICBzZWN0aW9uVGl0bGU6IG51bGwsXHJcbiAgICBzZWN0aW9uU3VidGl0bGU6IG51bGwsXHJcbiAgICBwcm9tcHRzSGVhZGVyQWN0aW9uczogbnVsbCxcclxuICAgIHByb21wdExlYXJuTGluazogbnVsbCxcclxuICAgIG5hdkl0ZW1zOiBbXSxcclxuICB9LFxyXG4gIC8vIENhbGxiYWNrcyByZWdpc3RlcmVkIGJ5IG1haW4uanMgc28gc2VjdGlvbiBtb2R1bGVzIGNhbiB0cmlnZ2VyIHJlLXJlbmRlclxyXG4gIC8vIHdpdGhvdXQgY3JlYXRpbmcgaW1wb3J0IGN5Y2xlcy5cclxuICByZW5kZXJDdXJyZW50U2VjdGlvbjogKCkgPT4ge30sXHJcbiAgcmVuZGVyR3JvdXBzU2VjdGlvbjogKCkgPT4ge30sXHJcbiAgcmVuZGVyUHJvbXB0c1NlY3Rpb246ICgpID0+IHt9LFxyXG4gIHJlbmRlckN1c3RvbVNlY3Rpb246ICgpID0+IHt9LFxyXG4gIHJlbmRlclJhbmRvbVNlY3Rpb246ICgpID0+IHt9LFxyXG4gIHJlbmRlck90aGVyU2VjdGlvbjogKCkgPT4ge30sXHJcbiAgcmVuZGVyQWJvdXRTZWN0aW9uOiAoKSA9PiB7fSxcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCbGFua0N1c3RvbUZvcm1TdGF0ZSgpIHtcclxuICByZXR1cm4ge1xyXG4gICAgbW9kZTogXCJjcmVhdGVcIixcclxuICAgIGVkaXRpbmdJZDogbnVsbCxcclxuICAgIG5hbWU6IFwiXCIsXHJcbiAgICB1cmw6IFwiXCIsXHJcbiAgICBjb252ZXJ0ZXJJbnB1dDogXCJcIixcclxuICAgIGNvbnZlcnRlckVycm9yOiBcIlwiLFxyXG4gICAgZm9ybUVycm9yOiBcIlwiXHJcbiAgfTtcclxufVxyXG4iLCAiaW1wb3J0IHsgc3RhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwodmFsdWUpIHtcclxuICByZXR1cm4gU3RyaW5nKHZhbHVlKVxyXG4gICAgLnJlcGxhY2VBbGwoXCImXCIsIFwiJmFtcDtcIilcclxuICAgIC5yZXBsYWNlQWxsKFwiPFwiLCBcIiZsdDtcIilcclxuICAgIC5yZXBsYWNlQWxsKFwiPlwiLCBcIiZndDtcIilcclxuICAgIC5yZXBsYWNlQWxsKCdcIicsIFwiJnF1b3Q7XCIpXHJcbiAgICAucmVwbGFjZUFsbChcIidcIiwgXCImIzM5O1wiKTtcclxufVxyXG5cclxuLy8gSW50ZW50aW9uYWwgbm8tb3AgcmV0YWluZWQgZm9yIHBhcml0eSB3aXRoIHRoZSBvcmlnaW5hbCBtb25vbGl0aGljIGZpbGUuXHJcbi8vIENhbGxlcnMgbWFyayBhIGNvbmNlcHR1YWwgXCJkaXJ0eVwiIG1vbWVudDsgcGVyc2lzdGVuY2UgaXMgaGFuZGxlZCBieSBwZXJzaXN0QWxsLlxyXG5leHBvcnQgZnVuY3Rpb24gbWFya0RpcnR5KCkge31cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRHcm91cEJ5SWQoZ3JvdXBJZCkge1xyXG4gIHJldHVybiBzdGF0ZS5ncm91cHMuZmluZCgoaXRlbSkgPT4gaXRlbS5pZCA9PT0gZ3JvdXBJZCkgfHwgbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRCdWlsdGluU2l0ZXMoKSB7XHJcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChjaHJvbWUucnVudGltZS5nZXRVUkwoXCJjb25maWcvc2l0ZUhhbmRsZXJzLmpzb25cIikpO1xyXG4gIGNvbnN0IHBheWxvYWQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgcmV0dXJuIChwYXlsb2FkLnNpdGVzIHx8IFtdKS5maWx0ZXIoKHNpdGUpID0+IHNpdGUuZW5hYmxlZCAhPT0gZmFsc2UpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBERUZBVUxUX1BST01QVF9HUk9VUF9JRCB9IGZyb20gXCIuL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5cclxuZnVuY3Rpb24gaTE4bihrZXkpIHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIGNocm9tZT8uaTE4bj8uZ2V0TWVzc2FnZT8uKGtleSkgfHwgd2luZG93Ll9fUVNIT1RfSTE4Tl9fPy50Py4oa2V5KSB8fCBcIlwiO1xyXG4gIH0gY2F0Y2ggKF9lKSB7XHJcbiAgICByZXR1cm4gXCJcIjtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxQcm9tcHRHcm91cE5hbWUoKSB7XHJcbiAgcmV0dXJuIGkxOG4oXCJzZXR0aW5nc19wcm9tcHRzX2FsbEdyb3VwXCIpIHx8IFwi5YWo6YOoXCI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0FsbFByb21wdEdyb3VwKGdyb3VwKSB7XHJcbiAgcmV0dXJuICEhZ3JvdXAgJiYgZ3JvdXAuaWQgPT09IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvbXB0R3JvdXBEaXNwbGF5TmFtZShncm91cCkge1xyXG4gIGlmIChpc0FsbFByb21wdEdyb3VwKGdyb3VwKSkgcmV0dXJuIGdldEFsbFByb21wdEdyb3VwTmFtZSgpO1xyXG4gIHJldHVybiBncm91cD8ubmFtZSB8fCBpMThuKFwib3ZlcmxheV91bm5hbWVkUHJvbXB0R3JvdXBcIikgfHwgXCLmnKrlkb3lkI3liIbnu4RcIjtcclxufVxyXG5cclxuLy8gRmxhdHRlbnMgYSBncm91cCdzIHByb21wdCBsaXN0IGZvciBkaXNwbGF5LiBXaGVuIHRoZSBncm91cCBpcyB0aGUgdmlydHVhbFxyXG4vLyBcIkFsbFwiIGdyb3VwLCB1bmlvbnMgcHJvbXB0cyBhY3Jvc3MgZXZlcnkgcmVhbCBncm91cCB3aGlsZSByZW1lbWJlcmluZyB0aGVcclxuLy8gc291cmNlIGdyb3VwIG9uIGVhY2ggZW50cnkuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXREaXNwbGF5UHJvbXB0RW50cmllcyhncm91cCwgYWxsR3JvdXBzKSB7XHJcbiAgaWYgKCFncm91cCkgcmV0dXJuIFtdO1xyXG4gIGlmIChpc0FsbFByb21wdEdyb3VwKGdyb3VwKSkge1xyXG4gICAgY29uc3Qgb3V0ID0gW107XHJcbiAgICAoYWxsR3JvdXBzIHx8IFtdKS5mb3JFYWNoKChnKSA9PiB7XHJcbiAgICAgIChnLnByb21wdHMgfHwgW10pLmZvckVhY2goKHByb21wdCkgPT4gb3V0LnB1c2goeyBwcm9tcHQsIHNvdXJjZUdyb3VwOiBnIH0pKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIG91dDtcclxuICB9XHJcbiAgcmV0dXJuIChncm91cC5wcm9tcHRzIHx8IFtdKS5tYXAoKHByb21wdCkgPT4gKHsgcHJvbXB0LCBzb3VyY2VHcm91cDogZ3JvdXAgfSkpO1xyXG59XHJcbiIsICJjb25zdCBERUZBVUxUX1NIT1JUQ1VUID0gT2JqZWN0LmZyZWV6ZSh7XHJcbiAgY3RybEtleTogdHJ1ZSxcclxuICBzaGlmdEtleTogZmFsc2UsXHJcbiAgYWx0S2V5OiBmYWxzZSxcclxuICBtZXRhS2V5OiBmYWxzZSxcclxuICBrZXk6IFwiUVwiLFxyXG59KTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVLZXkoa2V5KSB7XHJcbiAgaWYgKCFrZXkpIHJldHVybiBcIlwiO1xyXG4gIGlmIChrZXkubGVuZ3RoID09PSAxKSByZXR1cm4ga2V5LnRvVXBwZXJDYXNlKCk7XHJcbiAgcmV0dXJuIGtleTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVNob3J0Y3V0KGlucHV0KSB7XHJcbiAgaWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09IFwib2JqZWN0XCIpIHJldHVybiB7IC4uLkRFRkFVTFRfU0hPUlRDVVQgfTtcclxuICBjb25zdCBrZXkgPSB0eXBlb2YgaW5wdXQua2V5ID09PSBcInN0cmluZ1wiICYmIGlucHV0LmtleS5sZW5ndGggPiAwID8gaW5wdXQua2V5IDogREVGQVVMVF9TSE9SVENVVC5rZXk7XHJcbiAgcmV0dXJuIHtcclxuICAgIGN0cmxLZXk6ICEhaW5wdXQuY3RybEtleSxcclxuICAgIHNoaWZ0S2V5OiAhIWlucHV0LnNoaWZ0S2V5LFxyXG4gICAgYWx0S2V5OiAhIWlucHV0LmFsdEtleSxcclxuICAgIG1ldGFLZXk6ICEhaW5wdXQubWV0YUtleSxcclxuICAgIGtleTogbm9ybWFsaXplS2V5KGtleSksXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoU2hvcnRjdXQoZXZlbnQsIHNjKSB7XHJcbiAgaWYgKCFzYyB8fCAhc2Mua2V5KSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCghIXNjLmN0cmxLZXkpICE9PSBldmVudC5jdHJsS2V5KSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCghIXNjLnNoaWZ0S2V5KSAhPT0gZXZlbnQuc2hpZnRLZXkpIHJldHVybiBmYWxzZTtcclxuICBpZiAoKCEhc2MuYWx0S2V5KSAhPT0gZXZlbnQuYWx0S2V5KSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKCghIXNjLm1ldGFLZXkpICE9PSBldmVudC5tZXRhS2V5KSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuIG5vcm1hbGl6ZUtleShldmVudC5rZXkpID09PSBub3JtYWxpemVLZXkoc2Mua2V5KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFNob3J0Y3V0KHNjKSB7XHJcbiAgaWYgKCFzYyB8fCAhc2Mua2V5KSB7XHJcbiAgICB0cnkge1xyXG4gICAgICByZXR1cm4gY2hyb21lPy5pMThuPy5nZXRNZXNzYWdlPy4oXCJjb21tb25fbm90U2V0XCIpIHx8IFwi5pyq6K6+572uXCI7XHJcbiAgICB9IGNhdGNoIChfZSkge1xyXG4gICAgICByZXR1cm4gXCLmnKrorr7nva5cIjtcclxuICAgIH1cclxuICB9XHJcbiAgY29uc3QgcGFydHMgPSBbXTtcclxuICBpZiAoc2MuY3RybEtleSkgcGFydHMucHVzaChcIkN0cmxcIik7XHJcbiAgaWYgKHNjLmFsdEtleSkgcGFydHMucHVzaChcIkFsdFwiKTtcclxuICBpZiAoc2Muc2hpZnRLZXkpIHBhcnRzLnB1c2goXCJTaGlmdFwiKTtcclxuICBpZiAoc2MubWV0YUtleSkgcGFydHMucHVzaCgvTWFjL2kudGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pID8gXCJDbWRcIiA6IFwiV2luXCIpO1xyXG4gIHBhcnRzLnB1c2goc2Mua2V5Lmxlbmd0aCA9PT0gMSA/IHNjLmtleS50b1VwcGVyQ2FzZSgpIDogc2Mua2V5KTtcclxuICByZXR1cm4gcGFydHMuam9pbihcIiArIFwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzU2hvcnRjdXRWYWxpZChzYykge1xyXG4gIGlmICghc2MgfHwgIXNjLmtleSkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmIChzYy5rZXkgPT09IFwiQ29udHJvbFwiIHx8IHNjLmtleSA9PT0gXCJTaGlmdFwiIHx8IHNjLmtleSA9PT0gXCJBbHRcIiB8fCBzYy5rZXkgPT09IFwiTWV0YVwiKSByZXR1cm4gZmFsc2U7XHJcbiAgcmV0dXJuIHNjLmN0cmxLZXkgfHwgc2MuYWx0S2V5IHx8IHNjLm1ldGFLZXkgfHwgKHNjLnNoaWZ0S2V5ICYmIHNjLmtleS5sZW5ndGggPiAxKTtcclxufVxyXG4iLCAiaW1wb3J0IHtcclxuICBTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZIGFzIEdST1VQU19TVE9SQUdFX0tFWSxcclxuICBQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZIGFzIFBST01QVFNfU1RPUkFHRV9LRVksXHJcbiAgVUlfUFJFRlNfU1RPUkFHRV9LRVksXHJcbiAgQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZLFxyXG4gIERFRkFVTFRfUFJPTVBUX0dST1VQX0lELFxyXG4gIExFR0FDWV9ERUZBVUxUX0dST1VQX05BTUUsXHJcbn0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zdG9yYWdlLWtleXMuanNcIjtcclxuaW1wb3J0IHtcclxuICBnZXRBbGxQcm9tcHRHcm91cE5hbWUsXHJcbiAgaXNBbGxQcm9tcHRHcm91cCxcclxufSBmcm9tIFwiLi4vLi4vc2hhcmVkL3Byb21wdC1ncm91cHMuanNcIjtcclxuaW1wb3J0IHsgbm9ybWFsaXplU2hvcnRjdXQgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3Nob3J0Y3V0LmpzXCI7XHJcbmltcG9ydCB7IHN0YXRlLCBTSVRFX0NBVEVHT1JJRVMsIENPTU1PTl9TRUFSQ0hfUEFSQU1fS0VZUyB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IG1zZyB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcblxyXG5leHBvcnQge1xyXG4gIEdST1VQU19TVE9SQUdFX0tFWSxcclxuICBQUk9NUFRTX1NUT1JBR0VfS0VZLFxyXG4gIFVJX1BSRUZTX1NUT1JBR0VfS0VZLFxyXG4gIENVU1RPTV9TSVRFU19TVE9SQUdFX0tFWSxcclxufTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOb3JtYWxpemVkR3JvdXBzKGlucHV0KSB7XHJcbiAgY29uc3QgdmFsaWRTaXRlSWRzID0gbmV3IFNldChzdGF0ZS5zaXRlcy5tYXAoKHNpdGUpID0+IHNpdGUuaWQpKTtcclxuICBjb25zdCBzb3VyY2UgPSBBcnJheS5pc0FycmF5KGlucHV0KSAmJiBpbnB1dC5sZW5ndGggPiAwXHJcbiAgICA/IGlucHV0XHJcbiAgICA6IFtcclxuICAgICAgICB7IGlkOiBcImRlZmF1bHQtaHVuemFcIiwgbmFtZTogXCLmt7fmkK3mkJzntKJcIiwgZW5hYmxlZDogdHJ1ZSwgbW9kZTogXCJjb21wYXJlXCIsIHNpdGVJZHM6IFtcImdlbWluaVwiLCBcImNoYXRncHRcIiwgXCJkZWVwc2Vla1wiLCBcImRvdWJhb1wiLCBcImtpbWlcIiwgXCJtZXRhc29cIl0gfSxcclxuICAgICAgICB7IGlkOiBcImRlZmF1bHQtb3ZlcnNlYXNcIiwgbmFtZTogXCLmtbflpJbmqKHlnotcIiwgZW5hYmxlZDogdHJ1ZSwgbW9kZTogXCJjb21wYXJlXCIsIHNpdGVJZHM6IFtcImdlbWluaVwiLCBcImNoYXRncHRcIiwgXCJjbGF1ZGVcIiwgXCJncm9rXCJdIH0sXHJcbiAgICAgICAgeyBpZDogXCJkZWZhdWx0LWRvbWVzdGljXCIsIG5hbWU6IFwi5Zu95YaF5qih5Z6LXCIsIGVuYWJsZWQ6IHRydWUsIG1vZGU6IFwiY29tcGFyZVwiLCBzaXRlSWRzOiBbXCJkZWVwc2Vla1wiLCBcImRvdWJhb1wiLCBcImtpbWlcIiwgXCJtZXRhc29cIl0gfSxcclxuICAgICAgICB7IGlkOiBcImRlZmF1bHQtc2luZ2xlXCIsIG5hbWU6IFwi5Y2V5Liq5qih5Z6LXCIsIGVuYWJsZWQ6IHRydWUsIG1vZGU6IFwidGFic1wiLCBzaXRlSWRzOiBbXCJnZW1pbmlcIl0gfVxyXG4gICAgICBdO1xyXG5cclxuICByZXR1cm4gc291cmNlLm1hcCgoZ3JvdXApID0+ICh7XHJcbiAgICAuLi5ncm91cCxcclxuICAgIG5hbWU6IFN0cmluZyhncm91cC5uYW1lIHx8IFwi5pyq5ZG95ZCN5pCc57Si57uEXCIpLFxyXG4gICAgZW5hYmxlZDogZ3JvdXAuZW5hYmxlZCAhPT0gZmFsc2UsXHJcbiAgICBtb2RlOiBncm91cC5tb2RlID09PSBcInRhYnNcIiA/IFwidGFic1wiIDogXCJjb21wYXJlXCIsXHJcbiAgICBzaXRlSWRzOiBBcnJheS5pc0FycmF5KGdyb3VwLnNpdGVJZHMpXHJcbiAgICAgID8gZ3JvdXAuc2l0ZUlkcy5maWx0ZXIoKHNpdGVJZCwgaW5kZXgsIGFycikgPT4gdmFsaWRTaXRlSWRzLmhhcyhzaXRlSWQpICYmIGFyci5pbmRleE9mKHNpdGVJZCkgPT09IGluZGV4KVxyXG4gICAgICA6IFtdXHJcbiAgfSkpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTm9ybWFsaXplZFByb21wdEdyb3VwcyhpbnB1dCkge1xyXG4gIGNvbnN0IGRlZmF1bHROYW1lID0gZ2V0QWxsUHJvbXB0R3JvdXBOYW1lKCk7XHJcbiAgbGV0IHNvdXJjZSA9IEFycmF5LmlzQXJyYXkoaW5wdXQpICYmIGlucHV0Lmxlbmd0aCA+IDAgPyBbLi4uaW5wdXRdIDogW107XHJcblxyXG4gIGlmIChzb3VyY2UubGVuZ3RoID09PSAwKSB7XHJcbiAgICBzb3VyY2UgPSBbXHJcbiAgICAgIHtcclxuICAgICAgICBpZDogREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQsXHJcbiAgICAgICAgbmFtZTogZGVmYXVsdE5hbWUsXHJcbiAgICAgICAgcHJvbXB0czogW1xyXG4gICAgICAgICAgeyBpZDogXCJwcm9tcHQtZGVmYXVsdC0xXCIsIHRpdGxlOiBcIuaAu+e7k+mHjeeCuVwiLCBjb250ZW50OiBcIuivt+W4ruaIkeaAu+e7k+i/meauteWGheWuueeahOmHjeeCue+8jOW5tuWIl+WHuuS4ieadoeWPr+aJp+ihjOW7uuiuruOAglwiIH1cclxuICAgICAgICBdXHJcbiAgICAgIH1cclxuICAgIF07XHJcbiAgfSBlbHNlIHtcclxuICAgIGxldCBkZWZhdWx0SW5kZXggPSBzb3VyY2UuZmluZEluZGV4KChnKSA9PiBnICYmIGcuaWQgPT09IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEKTtcclxuICAgIGlmIChkZWZhdWx0SW5kZXggPCAwKSB7XHJcbiAgICAgIC8vIOWFvOWuueWOhuWPsuaVsOaNru+8muWQjeWtl+WPq1wi6buY6K6k5YiG57uEXCLkvYYgaWQg5LiN5ZCM55qE5Lmf6KeG5Li65Zu65a6a5YiG57uEXHJcbiAgICAgIGRlZmF1bHRJbmRleCA9IHNvdXJjZS5maW5kSW5kZXgoKGcpID0+IGcgJiYgZy5uYW1lID09PSBMRUdBQ1lfREVGQVVMVF9HUk9VUF9OQU1FKTtcclxuICAgICAgaWYgKGRlZmF1bHRJbmRleCA+PSAwKSB7XHJcbiAgICAgICAgc291cmNlW2RlZmF1bHRJbmRleF0gPSB7IC4uLnNvdXJjZVtkZWZhdWx0SW5kZXhdLCBpZDogREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQgfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGRlZmF1bHRJbmRleCA8IDApIHtcclxuICAgICAgc291cmNlLnVuc2hpZnQoeyBpZDogREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQsIG5hbWU6IGRlZmF1bHROYW1lLCBwcm9tcHRzOiBbXSB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IGRlZiA9IHNvdXJjZS5zcGxpY2UoZGVmYXVsdEluZGV4LCAxKVswXTtcclxuICAgICAgZGVmLm5hbWUgPSBkZWZhdWx0TmFtZTtcclxuICAgICAgc291cmNlLnVuc2hpZnQoZGVmKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBzb3VyY2UubWFwKChncm91cCkgPT4gKHtcclxuICAgIGlkOiBTdHJpbmcoZ3JvdXAuaWQgfHwgYHByb21wdC1ncm91cC0ke0RhdGUubm93KCl9YCksXHJcbiAgICBuYW1lOiBTdHJpbmcoZ3JvdXAubmFtZSB8fCBcIuacquWRveWQjeaPkOekuuivjeWIhue7hFwiKSxcclxuICAgIHByb21wdHM6IEFycmF5LmlzQXJyYXkoZ3JvdXAucHJvbXB0cylcclxuICAgICAgPyBncm91cC5wcm9tcHRzLm1hcCgocHJvbXB0LCBpbmRleCkgPT4gKHtcclxuICAgICAgICAgIGlkOiBTdHJpbmcocHJvbXB0LmlkIHx8IGAke2dyb3VwLmlkIHx8ICdwcm9tcHQnfS0ke2luZGV4fWApLFxyXG4gICAgICAgICAgdGl0bGU6IFN0cmluZyhwcm9tcHQudGl0bGUgfHwgXCLmnKrlkb3lkI3mj5DnpLror41cIiksXHJcbiAgICAgICAgICBjb250ZW50OiBTdHJpbmcocHJvbXB0LmNvbnRlbnQgfHwgXCJcIilcclxuICAgICAgICB9KSlcclxuICAgICAgOiBbXVxyXG4gIH0pKTtcclxufVxyXG5cclxuLy8gXCLlhajpg6hcIuWIhue7hOWxleekuuaXtu+8jOWIl+WHuuaJgOacieWIhue7hOeahOaPkOekuuivjeW5tumbhu+8m+WFtuWug+WIhue7hOWxleekuuiHqui6q+eahOaPkOekuuivjeOAglxyXG4vLyDov5Tlm54gW3sgcHJvbXB0LCBzb3VyY2VHcm91cCB9XSDnu5PmnoTvvIzmlrnkvr/ljaHniYflsYLmi7/liLDmj5DnpLror43nnJ/mraPmiYDlsZ7nmoTliIbnu4TjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGdldERpc3BsYXlQcm9tcHRFbnRyaWVzKGdyb3VwKSB7XHJcbiAgaWYgKCFncm91cCkgcmV0dXJuIFtdO1xyXG4gIGlmIChpc0FsbFByb21wdEdyb3VwKGdyb3VwKSkge1xyXG4gICAgY29uc3Qgb3V0ID0gW107XHJcbiAgICBzdGF0ZS5wcm9tcHRHcm91cHMuZm9yRWFjaCgoZykgPT4ge1xyXG4gICAgICAoZy5wcm9tcHRzIHx8IFtdKS5mb3JFYWNoKChwcm9tcHQpID0+IHtcclxuICAgICAgICBvdXQucHVzaCh7IHByb21wdCwgc291cmNlR3JvdXA6IGcgfSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gb3V0O1xyXG4gIH1cclxuICByZXR1cm4gKGdyb3VwLnByb21wdHMgfHwgW10pLm1hcCgocHJvbXB0KSA9PiAoeyBwcm9tcHQsIHNvdXJjZUdyb3VwOiBncm91cCB9KSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOb3JtYWxpemVkVWlQcmVmcyhpbnB1dCkge1xyXG4gIGNvbnN0IHNvdXJjZSA9IGlucHV0ICYmIHR5cGVvZiBpbnB1dCA9PT0gXCJvYmplY3RcIiA/IGlucHV0IDoge307XHJcbiAgcmV0dXJuIHtcclxuICAgIHNob3dIaXN0b3J5OiBzb3VyY2Uuc2hvd0hpc3RvcnkgPT09IHRydWUsXHJcbiAgICBzaG93UmFuZG9tQnV0dG9uOiBzb3VyY2Uuc2hvd1JhbmRvbUJ1dHRvbiAhPT0gZmFsc2UsXHJcbiAgICBzaG93UHJvbXB0QnV0dG9uOiBzb3VyY2Uuc2hvd1Byb21wdEJ1dHRvbiAhPT0gZmFsc2UsXHJcbiAgICBwcmV3YXJtRW5hYmxlZDogc291cmNlLnByZXdhcm1FbmFibGVkICE9PSBmYWxzZSxcclxuICAgIG92ZXJsYXlTaG9ydGN1dEVuYWJsZWQ6IHNvdXJjZS5vdmVybGF5U2hvcnRjdXRFbmFibGVkICE9PSBmYWxzZSxcclxuICAgIGRpYWdub3N0aWNMb2dzRW5hYmxlZDogc291cmNlLmRpYWdub3N0aWNMb2dzRW5hYmxlZCA9PT0gdHJ1ZSxcclxuICAgIG92ZXJsYXlTaG9ydGN1dDogbm9ybWFsaXplU2hvcnRjdXQoc291cmNlLm92ZXJsYXlTaG9ydGN1dClcclxuICB9O1xyXG59XHJcblxyXG4vLyDilIDilIAgQ3VzdG9tLXNpdGUgaGVscGVycyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOb3JtYWxpemVkQ3VzdG9tU2l0ZXMoaW5wdXQpIHtcclxuICBpZiAoIUFycmF5LmlzQXJyYXkoaW5wdXQpKSB7XHJcbiAgICByZXR1cm4gW107XHJcbiAgfVxyXG4gIGNvbnN0IHNlZW5JZHMgPSBuZXcgU2V0KCk7XHJcbiAgcmV0dXJuIGlucHV0XHJcbiAgICAubWFwKChyYXcpID0+IHtcclxuICAgICAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XHJcbiAgICAgIGNvbnN0IG5hbWUgPSBTdHJpbmcocmF3Lm5hbWUgfHwgXCJcIikudHJpbSgpO1xyXG4gICAgICBjb25zdCB1cmwgPSBTdHJpbmcocmF3LnVybCB8fCBcIlwiKS50cmltKCk7XHJcbiAgICAgIGlmICghbmFtZSB8fCAhdXJsKSByZXR1cm4gbnVsbDtcclxuICAgICAgbGV0IGlkID0gU3RyaW5nKHJhdy5pZCB8fCBcIlwiKS50cmltKCk7XHJcbiAgICAgIGlmICghaWQgfHwgc2Vlbklkcy5oYXMoaWQpKSB7XHJcbiAgICAgICAgaWQgPSBjcmVhdGVDdXN0b21TaXRlSWQoKTtcclxuICAgICAgfVxyXG4gICAgICBzZWVuSWRzLmFkZChpZCk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaWQsXHJcbiAgICAgICAgbmFtZSxcclxuICAgICAgICB1cmwsXHJcbiAgICAgICAgZW5hYmxlZDogcmF3LmVuYWJsZWQgIT09IGZhbHNlLFxyXG4gICAgICAgIHN1cHBvcnRJZnJhbWU6IHJhdy5zdXBwb3J0SWZyYW1lICE9PSBmYWxzZSxcclxuICAgICAgICBzdXBwb3J0VXJsUXVlcnk6IHJhdy5zdXBwb3J0VXJsUXVlcnkgIT09IGZhbHNlICYmIHVybC5pbmNsdWRlcyhcIntxdWVyeX1cIiksXHJcbiAgICAgICAgbWF0Y2hQYXR0ZXJuczogQXJyYXkuaXNBcnJheShyYXcubWF0Y2hQYXR0ZXJucykgJiYgcmF3Lm1hdGNoUGF0dGVybnMubGVuZ3RoID4gMFxyXG4gICAgICAgICAgPyByYXcubWF0Y2hQYXR0ZXJucy5tYXAoKHBhdHRlcm4pID0+IFN0cmluZyhwYXR0ZXJuKSlcclxuICAgICAgICAgIDogZGVyaXZlTWF0Y2hQYXR0ZXJucyh1cmwpLFxyXG4gICAgICAgIGlzQ3VzdG9tOiB0cnVlXHJcbiAgICAgIH07XHJcbiAgICB9KVxyXG4gICAgLmZpbHRlcihCb29sZWFuKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUN1c3RvbVNpdGVJZCgpIHtcclxuICByZXR1cm4gYGN1c3RvbV8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgNyl9YDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZU1hdGNoUGF0dGVybnModXJsKSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVVcmxGb3JQYXJzZSh1cmwpO1xyXG4gICAgY29uc3QgaG9zdCA9IG5ldyBVUkwobm9ybWFsaXplZCkuaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xyXG4gICAgcmV0dXJuIGhvc3QgPyBbaG9zdF0gOiBbXTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVVcmxGb3JQYXJzZSh1cmwpIHtcclxuICBjb25zdCB0cmltbWVkID0gU3RyaW5nKHVybCB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCF0cmltbWVkKSByZXR1cm4gXCJcIjtcclxuICBpZiAoL15odHRwcz86XFwvXFwvL2kudGVzdCh0cmltbWVkKSkge1xyXG4gICAgcmV0dXJuIHRyaW1tZWQ7XHJcbiAgfVxyXG4gIHJldHVybiBgaHR0cHM6Ly8ke3RyaW1tZWR9YDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlU2l0ZXMoYnVpbHRpbiwgY3VzdG9tKSB7XHJcbiAgY29uc3QgcmVzdWx0ID0gQXJyYXkuaXNBcnJheShidWlsdGluKSA/IFsuLi5idWlsdGluXSA6IFtdO1xyXG4gIGNvbnN0IGtub3duSWRzID0gbmV3IFNldChyZXN1bHQubWFwKChzaXRlKSA9PiBzaXRlLmlkKSk7XHJcbiAgKGN1c3RvbSB8fCBbXSkuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgaWYgKCFzaXRlIHx8IGtub3duSWRzLmhhcyhzaXRlLmlkKSkgcmV0dXJuO1xyXG4gICAgcmVzdWx0LnB1c2goc2l0ZSk7XHJcbiAgICBrbm93bklkcy5hZGQoc2l0ZS5pZCk7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIHJlc3VsdDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHN5bmNDdXN0b21DYXRlZ29yeUlkcygpIHtcclxuICBTSVRFX0NBVEVHT1JJRVMuY3VzdG9tLnNpdGVJZHMgPSBzdGF0ZS5jdXN0b21TaXRlcy5tYXAoKHNpdGUpID0+IHNpdGUuaWQpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29udmVydFVybFRvVGVtcGxhdGUocmF3VXJsKSB7XHJcbiAgY29uc3QgdHJpbW1lZCA9IFN0cmluZyhyYXdVcmwgfHwgXCJcIikudHJpbSgpO1xyXG4gIGlmICghdHJpbW1lZCkge1xyXG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogbXNnKFwic2V0dGluZ3NfY3VzdG9tX2NvbnZlcnRFbXB0eVwiLCBcIuivt+WFiOeymOi0tOS4gOS4qiBVUkwg5YaN6L2s5o2i44CCXCIpIH07XHJcbiAgfVxyXG4gIGlmICh0cmltbWVkLmluY2x1ZGVzKFwie3F1ZXJ5fVwiKSkge1xyXG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHVybDogdHJpbW1lZCwgbmFtZTogZ3Vlc3NTaXRlTmFtZUZyb21VcmwodHJpbW1lZCkgfTtcclxuICB9XHJcblxyXG4gIGxldCBwYXJzZWQ7XHJcbiAgdHJ5IHtcclxuICAgIHBhcnNlZCA9IG5ldyBVUkwobm9ybWFsaXplVXJsRm9yUGFyc2UodHJpbW1lZCkpO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogbXNnKFwic2V0dGluZ3NfY3VzdG9tX2NvbnZlcnRJbnZhbGlkVXJsXCIsIFwiVVJMIOagvOW8j+S4jeato+ehru+8jOivt+ajgOafpeWQjumHjeivleOAglwiKSB9O1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcGFyYW1zID0gcGFyc2VkLnNlYXJjaFBhcmFtcztcclxuICBjb25zdCBwYXJhbUtleXMgPSBBcnJheS5mcm9tKHBhcmFtcy5rZXlzKCkpO1xyXG4gIGlmIChwYXJhbUtleXMubGVuZ3RoID4gMCkge1xyXG4gICAgY29uc3QgcHJpb3JpdHlLZXkgPSBDT01NT05fU0VBUkNIX1BBUkFNX0tFWVMuZmluZCgoa2V5KSA9PlxyXG4gICAgICBwYXJhbUtleXMuc29tZSgoaXRlbSkgPT4gaXRlbS50b0xvd2VyQ2FzZSgpID09PSBrZXkpXHJcbiAgICApO1xyXG4gICAgbGV0IHRhcmdldEtleSA9IG51bGw7XHJcbiAgICBpZiAocHJpb3JpdHlLZXkpIHtcclxuICAgICAgdGFyZ2V0S2V5ID0gcGFyYW1LZXlzLmZpbmQoKGl0ZW0pID0+IGl0ZW0udG9Mb3dlckNhc2UoKSA9PT0gcHJpb3JpdHlLZXkpIHx8IG51bGw7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0YXJnZXRLZXkgPSBwYXJhbUtleXMuZmluZCgoa2V5KSA9PiBTdHJpbmcocGFyYW1zLmdldChrZXkpIHx8IFwiXCIpLnRyaW0oKS5sZW5ndGggPiAwKSB8fCBwYXJhbUtleXNbMF07XHJcbiAgICB9XHJcbiAgICBpZiAodGFyZ2V0S2V5KSB7XHJcbiAgICAgIHBhcmFtcy5zZXQodGFyZ2V0S2V5LCBcIl9fQUlfQ1VTVE9NX1FVRVJZX1BMQUNFSE9MREVSX19cIik7XHJcbiAgICAgIGNvbnN0IHJlYnVpbHQgPSBwYXJzZWQudG9TdHJpbmcoKS5yZXBsYWNlKFwiX19BSV9DVVNUT01fUVVFUllfUExBQ0VIT0xERVJfX1wiLCBcIntxdWVyeX1cIik7XHJcbiAgICAgIHJldHVybiB7IG9rOiB0cnVlLCB1cmw6IHJlYnVpbHQsIG5hbWU6IGd1ZXNzU2l0ZU5hbWVGcm9tVXJsKHJlYnVpbHQpIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4ge1xyXG4gICAgb2s6IGZhbHNlLFxyXG4gICAgZXJyb3I6IG1zZyhcInNldHRpbmdzX2N1c3RvbV9jb252ZXJ0Tm9QYXJhbVwiLCBcIuacquiDveivhuWIq+WIsOaQnOe0ouWPguaVsOOAguivt+aPkOS+m+W4puacieaQnOe0ouivjeWPguaVsOeahOaQnOe0oue7k+aenOmTvuaOpe+8jOaIluaJi+WKqOWcqCBVUkwg5Lit5oqK5pCc57Si6K+N5pu/5o2i5oiQIHtxdWVyeX3jgIJcIilcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ3Vlc3NTaXRlTmFtZUZyb21VcmwodXJsKSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwobm9ybWFsaXplVXJsRm9yUGFyc2UodXJsKSk7XHJcbiAgICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnJlcGxhY2UoL153d3dcXC4vLCBcIlwiKTtcclxuICAgIGlmICghaG9zdCkgcmV0dXJuIFwiXCI7XHJcbiAgICBjb25zdCBmaXJzdCA9IGhvc3Quc3BsaXQoXCIuXCIpWzBdIHx8IGhvc3Q7XHJcbiAgICByZXR1cm4gZmlyc3QuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBmaXJzdC5zbGljZSgxKTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENhdGVnb3J5U2l0ZXMoY2F0ZWdvcnlLZXkpIHtcclxuICBjb25zdCBjYXRlZ29yeSA9IFNJVEVfQ0FURUdPUklFU1tjYXRlZ29yeUtleV07XHJcbiAgaWYgKCFjYXRlZ29yeSkgcmV0dXJuIFtdO1xyXG4gIHJldHVybiBjYXRlZ29yeS5zaXRlSWRzLm1hcCgoc2l0ZUlkKSA9PiBzdGF0ZS5zaXRlcy5maW5kKChzaXRlKSA9PiBzaXRlLmlkID09PSBzaXRlSWQpKS5maWx0ZXIoQm9vbGVhbik7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwZXJzaXN0QWxsKCkge1xyXG4gIHN0YXRlLmN1c3RvbVNpdGVzID0gY3JlYXRlTm9ybWFsaXplZEN1c3RvbVNpdGVzKHN0YXRlLmN1c3RvbVNpdGVzKTtcclxuICBjb25zdCBidWlsdGluU2l0ZXMgPSBzdGF0ZS5zaXRlcy5maWx0ZXIoKHNpdGUpID0+ICFzaXRlLmlzQ3VzdG9tKTtcclxuICBzdGF0ZS5zaXRlcyA9IG1lcmdlU2l0ZXMoYnVpbHRpblNpdGVzLCBzdGF0ZS5jdXN0b21TaXRlcyk7XHJcbiAgc3luY0N1c3RvbUNhdGVnb3J5SWRzKCk7XHJcbiAgc3RhdGUuZ3JvdXBzID0gY3JlYXRlTm9ybWFsaXplZEdyb3VwcyhzdGF0ZS5ncm91cHMpO1xyXG4gIHN0YXRlLnByb21wdEdyb3VwcyA9IGNyZWF0ZU5vcm1hbGl6ZWRQcm9tcHRHcm91cHMoc3RhdGUucHJvbXB0R3JvdXBzKTtcclxuICBzdGF0ZS51aVByZWZzID0gY3JlYXRlTm9ybWFsaXplZFVpUHJlZnMoc3RhdGUudWlQcmVmcyk7XHJcbiAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHtcclxuICAgIFtHUk9VUFNfU1RPUkFHRV9LRVldOiBzdGF0ZS5ncm91cHMsXHJcbiAgICBbUFJPTVBUU19TVE9SQUdFX0tFWV06IHN0YXRlLnByb21wdEdyb3VwcyxcclxuICAgIFtVSV9QUkVGU19TVE9SQUdFX0tFWV06IHN0YXRlLnVpUHJlZnMsXHJcbiAgICBbQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZXTogc3RhdGUuY3VzdG9tU2l0ZXNcclxuICB9KTtcclxufVxyXG4iLCAiaW1wb3J0IHsgREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQgfSBmcm9tIFwiLi4vLi4vc2hhcmVkL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5pbXBvcnQgeyBzdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IGdldEdyb3VwQnlJZCB9IGZyb20gXCIuL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7IHBlcnNpc3RBbGwgfSBmcm9tIFwiLi9zdG9yZS5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGF0dGFjaEdyb3VwRHJhZyhjb250YWluZXIpIHtcclxuICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uR3JvdXBQb2ludGVyRG93bik7XHJcblxyXG4gIGZ1bmN0aW9uIG9uR3JvdXBQb2ludGVyRG93bihlKSB7XHJcbiAgICBjb25zdCBoYW5kbGUgPSBlLnRhcmdldC5jbG9zZXN0KFwiLmdyb3VwLWRyYWctaGFuZGxlXCIpO1xyXG4gICAgaWYgKCFoYW5kbGUpIHJldHVybjtcclxuICAgIGNvbnN0IGNhcmQgPSBoYW5kbGUuY2xvc2VzdChcIi5zZXR0aW5ncy1ncm91cC1jYXJkXCIpO1xyXG4gICAgaWYgKCFjYXJkKSByZXR1cm47XHJcblxyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgIGNvbnN0IHJlY3QgPSBjYXJkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgb2Zmc2V0WSA9IGUuY2xpZW50WSAtIHJlY3QudG9wO1xyXG4gICAgY29uc3QgY2FyZEJvcmRlclJhZGl1cyA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGNhcmQpLmJvcmRlclJhZGl1cyB8fCBcIjE4cHhcIjtcclxuXHJcbiAgICBjb25zdCBjbG9uZSA9IGNhcmQuY2xvbmVOb2RlKHRydWUpO1xyXG4gICAgY2xvbmUuc3R5bGUuY3NzVGV4dCA9IFtcclxuICAgICAgXCJwb3NpdGlvbjpmaXhlZFwiLFxyXG4gICAgICBgbGVmdDoke3JlY3QubGVmdH1weGAsXHJcbiAgICAgIGB0b3A6JHtyZWN0LnRvcH1weGAsXHJcbiAgICAgIGB3aWR0aDoke3JlY3Qud2lkdGh9cHhgLFxyXG4gICAgICBcInBvaW50ZXItZXZlbnRzOm5vbmVcIixcclxuICAgICAgXCJ6LWluZGV4Ojk5OTlcIixcclxuICAgICAgXCJib3gtc2hhZG93OjAgMTJweCA0MHB4IHJnYmEoMCwwLDAsMC4xNilcIixcclxuICAgICAgXCJvcGFjaXR5OjAuOTZcIixcclxuICAgICAgXCJ0cmFuc2l0aW9uOm5vbmVcIixcclxuICAgICAgYGJvcmRlci1yYWRpdXM6JHtjYXJkQm9yZGVyUmFkaXVzfWBcclxuICAgIF0uam9pbihcIjtcIik7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNsb25lKTtcclxuXHJcbiAgICBjYXJkLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcclxuICAgIGNhcmQuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwibm9uZVwiO1xyXG5cclxuICAgIGNvbnN0IGxvY2tlZEdyb3VwSWQgPSBzdGF0ZS5ncm91cHNbMF0/LmlkO1xyXG4gICAgbGV0IGxhc3RJbnNlcnRCZWZvcmUgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIG9uTW92ZShldikge1xyXG4gICAgICBjbG9uZS5zdHlsZS50b3AgPSBgJHtldi5jbGllbnRZIC0gb2Zmc2V0WX1weGA7XHJcblxyXG4gICAgICBjb25zdCBjbG9uZUNlbnRlclkgPSBldi5jbGllbnRZIC0gb2Zmc2V0WSArIHJlY3QuaGVpZ2h0IC8gMjtcclxuICAgICAgY29uc3Qgb3RoZXJDYXJkcyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc2V0dGluZ3MtZ3JvdXAtY2FyZFwiKSkuZmlsdGVyKChjKSA9PiBjICE9PSBjYXJkKTtcclxuICAgICAgY29uc3QgYWRkQ2FyZCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLnNldHRpbmdzLWFkZC1jYXJkXCIpO1xyXG4gICAgICBsZXQgbmV3SW5zZXJ0QmVmb3JlID0gYWRkQ2FyZDtcclxuXHJcbiAgICAgIGZvciAoY29uc3Qgb3RoZXIgb2Ygb3RoZXJDYXJkcykge1xyXG4gICAgICAgIGNvbnN0IHIgPSBvdGhlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBpZiAoY2xvbmVDZW50ZXJZIDwgci50b3AgKyByLmhlaWdodCAvIDIpIHtcclxuICAgICAgICAgIG5ld0luc2VydEJlZm9yZSA9IG90aGVyO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAobmV3SW5zZXJ0QmVmb3JlICYmIG5ld0luc2VydEJlZm9yZS5kYXRhc2V0ICYmIG5ld0luc2VydEJlZm9yZS5kYXRhc2V0Lmdyb3VwSWQgPT09IGxvY2tlZEdyb3VwSWQpIHtcclxuICAgICAgICBuZXdJbnNlcnRCZWZvcmUgPSBuZXdJbnNlcnRCZWZvcmUubmV4dEVsZW1lbnRTaWJsaW5nIHx8IGFkZENhcmQ7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChuZXdJbnNlcnRCZWZvcmUgIT09IGxhc3RJbnNlcnRCZWZvcmUpIHtcclxuICAgICAgICBjb25zdCBhbGxDYXJkcyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuc2V0dGluZ3MtZ3JvdXAtY2FyZFwiKSk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RQb3NpdGlvbnMgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgYWxsQ2FyZHMuZm9yRWFjaCgoZWwpID0+IGZpcnN0UG9zaXRpb25zLnNldChlbCwgZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkpKTtcclxuXHJcbiAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShjYXJkLCBuZXdJbnNlcnRCZWZvcmUpO1xyXG4gICAgICAgIGxhc3RJbnNlcnRCZWZvcmUgPSBuZXdJbnNlcnRCZWZvcmU7XHJcblxyXG4gICAgICAgIGFsbENhcmRzXHJcbiAgICAgICAgICAuZmlsdGVyKChlbCkgPT4gZWwgIT09IGNhcmQpXHJcbiAgICAgICAgICAuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBmaXJzdFBvc2l0aW9ucy5nZXQoZWwpO1xyXG4gICAgICAgICAgICBpZiAoIWZpcnN0KSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnN0IGxhc3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICAgICAgY29uc3QgZHkgPSBmaXJzdC50b3AgLSBsYXN0LnRvcDtcclxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKGR5KSA8IDEpIHJldHVybjtcclxuICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9IFwibm9uZVwiO1xyXG4gICAgICAgICAgICBlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke2R5fXB4KWA7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcInRyYW5zZm9ybSAyMDBtcyBjdWJpYy1iZXppZXIoMC4yLDAsMCwxKVwiO1xyXG4gICAgICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNmb3JtID0gXCJcIjtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG9uVXAoKSB7XHJcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBvbk1vdmUpO1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uVXApO1xyXG5cclxuICAgICAgY29uc3QgZmluYWxSZWN0ID0gY2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgY2xvbmUuc3R5bGUudHJhbnNpdGlvbiA9IFwidG9wIDE2MG1zIGVhc2UsIGJveC1zaGFkb3cgMTYwbXMgZWFzZSwgb3BhY2l0eSAxNjBtcyBlYXNlXCI7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRvcCA9IGAke2ZpbmFsUmVjdC50b3B9cHhgO1xyXG4gICAgICBjbG9uZS5zdHlsZS5ib3hTaGFkb3cgPSBcIm5vbmVcIjtcclxuICAgICAgY2xvbmUuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xyXG5cclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgY2xvbmUucmVtb3ZlKCk7XHJcbiAgICAgICAgY2FyZC5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcclxuICAgICAgICBjYXJkLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIlwiO1xyXG5cclxuICAgICAgICBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKFwiLnNldHRpbmdzLWdyb3VwLWNhcmRcIikpLmZvckVhY2goKGVsKSA9PiB7XHJcbiAgICAgICAgICBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJcIjtcclxuICAgICAgICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IFwiXCI7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5ld0dyb3VwSWRzID0gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbChcIi5zZXR0aW5ncy1ncm91cC1jYXJkXCIpKS5tYXAoKGMpID0+IGMuZGF0YXNldC5ncm91cElkKTtcclxuICAgICAgICBjb25zdCByZW9yZGVyZWQgPSBuZXdHcm91cElkcy5tYXAoKGlkKSA9PiBzdGF0ZS5ncm91cHMuZmluZCgoZykgPT4gZy5pZCA9PT0gaWQpKS5maWx0ZXIoQm9vbGVhbik7XHJcbiAgICAgICAgaWYgKHJlb3JkZXJlZC5sZW5ndGggPT09IHN0YXRlLmdyb3Vwcy5sZW5ndGgpIHtcclxuICAgICAgICAgIHN0YXRlLmdyb3VwcyA9IHJlb3JkZXJlZDtcclxuICAgICAgICAgIHBlcnNpc3RBbGwoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sIDE2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIG9uTW92ZSk7XHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uVXApO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGF0dGFjaFByb21wdEdyb3VwRHJhZyhjb250YWluZXIpIHtcclxuICBjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uUG9pbnRlckRvd24pO1xyXG5cclxuICBmdW5jdGlvbiBvblBvaW50ZXJEb3duKGUpIHtcclxuICAgIGNvbnN0IGhhbmRsZSA9IGUudGFyZ2V0LmNsb3Nlc3QoXCIucHJvbXB0LWdyb3VwLW5hdi1kcmFnXCIpO1xyXG4gICAgaWYgKCFoYW5kbGUpIHJldHVybjtcclxuICAgIGNvbnN0IGl0ZW0gPSBoYW5kbGUuY2xvc2VzdChcIi5wcm9tcHQtZ3JvdXAtbmF2LWl0ZW1cIik7XHJcbiAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgIC8vIFwi5YWo6YOoXCLliIbnu4TmsLjov5zplIHlrprlnKjnrKzkuIDkvY3vvIzkuI3lhYHorrjmi5bliqhcclxuICAgIGlmIChpdGVtLmRhdGFzZXQuZ3JvdXBJZCA9PT0gREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQpIHJldHVybjtcclxuXHJcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcblxyXG4gICAgY29uc3QgcmVjdCA9IGl0ZW0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBvZmZzZXRZID0gZS5jbGllbnRZIC0gcmVjdC50b3A7XHJcbiAgICBjb25zdCBjYXJkQm9yZGVyUmFkaXVzID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoaXRlbSkuYm9yZGVyUmFkaXVzIHx8IFwiMTJweFwiO1xyXG5cclxuICAgIGNvbnN0IGNsb25lID0gaXRlbS5jbG9uZU5vZGUodHJ1ZSk7XHJcbiAgICBjbG9uZS5zdHlsZS5jc3NUZXh0ID0gW1xyXG4gICAgICBcInBvc2l0aW9uOmZpeGVkXCIsXHJcbiAgICAgIGBsZWZ0OiR7cmVjdC5sZWZ0fXB4YCxcclxuICAgICAgYHRvcDoke3JlY3QudG9wfXB4YCxcclxuICAgICAgYHdpZHRoOiR7cmVjdC53aWR0aH1weGAsXHJcbiAgICAgIFwicG9pbnRlci1ldmVudHM6bm9uZVwiLFxyXG4gICAgICBcInotaW5kZXg6OTk5OVwiLFxyXG4gICAgICBcImJveC1zaGFkb3c6MCAxMnB4IDMycHggcmdiYSgwLDAsMCwwLjE4KVwiLFxyXG4gICAgICBcIm9wYWNpdHk6MC45NlwiLFxyXG4gICAgICBcInRyYW5zaXRpb246bm9uZVwiLFxyXG4gICAgICBgYm9yZGVyLXJhZGl1czoke2NhcmRCb3JkZXJSYWRpdXN9YCxcclxuICAgICAgXCJiYWNrZ3JvdW5kOiNmZmZmZmZcIlxyXG4gICAgXS5qb2luKFwiO1wiKTtcclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY2xvbmUpO1xyXG5cclxuICAgIGl0ZW0uc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xyXG4gICAgaXRlbS5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XHJcblxyXG4gICAgbGV0IGxhc3RJbnNlcnRCZWZvcmUgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIG9uTW92ZShldikge1xyXG4gICAgICBjbG9uZS5zdHlsZS50b3AgPSBgJHtldi5jbGllbnRZIC0gb2Zmc2V0WX1weGA7XHJcblxyXG4gICAgICBjb25zdCBjbG9uZUNlbnRlclkgPSBldi5jbGllbnRZIC0gb2Zmc2V0WSArIHJlY3QuaGVpZ2h0IC8gMjtcclxuICAgICAgY29uc3Qgb3RoZXJJdGVtcyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoXCIucHJvbXB0LWdyb3VwLW5hdi1pdGVtXCIpKS5maWx0ZXIoKGMpID0+IGMgIT09IGl0ZW0pO1xyXG4gICAgICBsZXQgbmV3SW5zZXJ0QmVmb3JlID0gbnVsbDtcclxuXHJcbiAgICAgIGZvciAoY29uc3Qgb3RoZXIgb2Ygb3RoZXJJdGVtcykge1xyXG4gICAgICAgIGNvbnN0IHIgPSBvdGhlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBpZiAoY2xvbmVDZW50ZXJZIDwgci50b3AgKyByLmhlaWdodCAvIDIpIHtcclxuICAgICAgICAgIG5ld0luc2VydEJlZm9yZSA9IG90aGVyO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBcIuWFqOmDqFwi5YiG57uE5rC46L+c56ys5LiA5L2N77ya5LiN5YWB6K645oqK5YW25a6D5YiG57uE5ouW5Yiw5a6D5YmN6Z2iXHJcbiAgICAgIGlmIChuZXdJbnNlcnRCZWZvcmUgJiYgbmV3SW5zZXJ0QmVmb3JlLmRhdGFzZXQgJiYgbmV3SW5zZXJ0QmVmb3JlLmRhdGFzZXQuZ3JvdXBJZCA9PT0gREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQpIHtcclxuICAgICAgICBuZXdJbnNlcnRCZWZvcmUgPSBuZXdJbnNlcnRCZWZvcmUubmV4dEVsZW1lbnRTaWJsaW5nO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAobmV3SW5zZXJ0QmVmb3JlICE9PSBsYXN0SW5zZXJ0QmVmb3JlKSB7XHJcbiAgICAgICAgY29uc3QgYWxsSXRlbXMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKFwiLnByb21wdC1ncm91cC1uYXYtaXRlbVwiKSk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RQb3NpdGlvbnMgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgYWxsSXRlbXMuZm9yRWFjaCgoZWwpID0+IGZpcnN0UG9zaXRpb25zLnNldChlbCwgZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkpKTtcclxuXHJcbiAgICAgICAgaWYgKG5ld0luc2VydEJlZm9yZSkge1xyXG4gICAgICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShpdGVtLCBuZXdJbnNlcnRCZWZvcmUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoaXRlbSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxhc3RJbnNlcnRCZWZvcmUgPSBuZXdJbnNlcnRCZWZvcmU7XHJcblxyXG4gICAgICAgIGFsbEl0ZW1zXHJcbiAgICAgICAgICAuZmlsdGVyKChlbCkgPT4gZWwgIT09IGl0ZW0pXHJcbiAgICAgICAgICAuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBmaXJzdFBvc2l0aW9ucy5nZXQoZWwpO1xyXG4gICAgICAgICAgICBpZiAoIWZpcnN0KSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnN0IGxhc3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICAgICAgY29uc3QgZHkgPSBmaXJzdC50b3AgLSBsYXN0LnRvcDtcclxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKGR5KSA8IDEpIHJldHVybjtcclxuICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9IFwibm9uZVwiO1xyXG4gICAgICAgICAgICBlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke2R5fXB4KWA7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcInRyYW5zZm9ybSAyMDBtcyBjdWJpYy1iZXppZXIoMC4yLDAsMCwxKVwiO1xyXG4gICAgICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNmb3JtID0gXCJcIjtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG9uVXAoKSB7XHJcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBvbk1vdmUpO1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uVXApO1xyXG5cclxuICAgICAgY29uc3QgZmluYWxSZWN0ID0gaXRlbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgY2xvbmUuc3R5bGUudHJhbnNpdGlvbiA9IFwidG9wIDE2MG1zIGVhc2UsIGJveC1zaGFkb3cgMTYwbXMgZWFzZSwgb3BhY2l0eSAxNjBtcyBlYXNlXCI7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRvcCA9IGAke2ZpbmFsUmVjdC50b3B9cHhgO1xyXG4gICAgICBjbG9uZS5zdHlsZS5ib3hTaGFkb3cgPSBcIm5vbmVcIjtcclxuICAgICAgY2xvbmUuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xyXG5cclxuICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgY2xvbmUucmVtb3ZlKCk7XHJcbiAgICAgICAgaXRlbS5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcclxuICAgICAgICBpdGVtLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIlwiO1xyXG5cclxuICAgICAgICBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKFwiLnByb21wdC1ncm91cC1uYXYtaXRlbVwiKSkuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcIlwiO1xyXG4gICAgICAgICAgZWwuc3R5bGUudHJhbnNmb3JtID0gXCJcIjtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgbmV3R3JvdXBJZHMgPSBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKFwiLnByb21wdC1ncm91cC1uYXYtaXRlbVwiKSkubWFwKChjKSA9PiBjLmRhdGFzZXQuZ3JvdXBJZCk7XHJcbiAgICAgICAgY29uc3QgcmVvcmRlcmVkID0gbmV3R3JvdXBJZHMubWFwKChpZCkgPT4gc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGcpID0+IGcuaWQgPT09IGlkKSkuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICAgIGlmIChyZW9yZGVyZWQubGVuZ3RoID09PSBzdGF0ZS5wcm9tcHRHcm91cHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICBzdGF0ZS5wcm9tcHRHcm91cHMgPSByZW9yZGVyZWQ7XHJcbiAgICAgICAgICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgICAgICAgICBzdGF0ZS5yZW5kZXJQcm9tcHRzU2VjdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSwgMTYwKTtcclxuICAgIH1cclxuXHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcm1vdmVcIiwgb25Nb3ZlKTtcclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVydXBcIiwgb25VcCk7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXR0YWNoUHJvbXB0SXRlbURyYWcobGlzdEVsLCBncm91cCkge1xyXG4gIGxpc3RFbC5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmRvd25cIiwgb25Qcm9tcHRQb2ludGVyRG93bik7XHJcblxyXG4gIGZ1bmN0aW9uIG9uUHJvbXB0UG9pbnRlckRvd24oZSkge1xyXG4gICAgY29uc3QgaGFuZGxlID0gZS50YXJnZXQuY2xvc2VzdChcIi5wcm9tcHQtY2FyZC1kcmFnLWhhbmRsZVwiKTtcclxuICAgIGlmICghaGFuZGxlKSByZXR1cm47XHJcbiAgICBjb25zdCBjYXJkID0gaGFuZGxlLmNsb3Nlc3QoXCIucHJvbXB0LWNhcmQtaXRlbVwiKTtcclxuICAgIGlmICghY2FyZCkgcmV0dXJuO1xyXG5cclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuXHJcbiAgICBjb25zdCByZWN0ID0gY2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGNvbnN0IG9mZnNldFkgPSBlLmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICBjb25zdCBjbG9uZSA9IGNhcmQuY2xvbmVOb2RlKHRydWUpO1xyXG4gICAgY2xvbmUuc3R5bGUuY3NzVGV4dCA9IFtcclxuICAgICAgXCJwb3NpdGlvbjpmaXhlZFwiLFxyXG4gICAgICBgbGVmdDoke3JlY3QubGVmdH1weGAsXHJcbiAgICAgIGB0b3A6JHtyZWN0LnRvcH1weGAsXHJcbiAgICAgIGB3aWR0aDoke3JlY3Qud2lkdGh9cHhgLFxyXG4gICAgICBcInBvaW50ZXItZXZlbnRzOm5vbmVcIixcclxuICAgICAgXCJ6LWluZGV4Ojk5OTlcIixcclxuICAgICAgXCJib3gtc2hhZG93OjAgOHB4IDI4cHggcmdiYSgwLDAsMCwwLjEzKVwiLFxyXG4gICAgICBcIm9wYWNpdHk6MC45NVwiLFxyXG4gICAgICBcInRyYW5zaXRpb246bm9uZVwiLFxyXG4gICAgICBcImJvcmRlci1yYWRpdXM6OHB4XCIsXHJcbiAgICAgIFwiYmFja2dyb3VuZDojZmZmXCJcclxuICAgIF0uam9pbihcIjtcIik7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNsb25lKTtcclxuXHJcbiAgICBjYXJkLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcclxuICAgIGNhcmQuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwibm9uZVwiO1xyXG5cclxuICAgIGxldCBsYXN0SW5zZXJ0QmVmb3JlID0gbnVsbDtcclxuXHJcbiAgICBmdW5jdGlvbiBvbk1vdmUoZXYpIHtcclxuICAgICAgY2xvbmUuc3R5bGUudG9wID0gYCR7ZXYuY2xpZW50WSAtIG9mZnNldFl9cHhgO1xyXG5cclxuICAgICAgY29uc3QgY2xvbmVDZW50ZXJZID0gZXYuY2xpZW50WSAtIG9mZnNldFkgKyByZWN0LmhlaWdodCAvIDI7XHJcbiAgICAgIGNvbnN0IG90aGVyQ2FyZHMgPSBBcnJheS5mcm9tKGxpc3RFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLnByb21wdC1jYXJkLWl0ZW1cIikpLmZpbHRlcigoYykgPT4gYyAhPT0gY2FyZCk7XHJcbiAgICAgIGxldCBuZXdJbnNlcnRCZWZvcmUgPSBudWxsO1xyXG5cclxuICAgICAgZm9yIChjb25zdCBvdGhlciBvZiBvdGhlckNhcmRzKSB7XHJcbiAgICAgICAgY29uc3QgciA9IG90aGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGlmIChjbG9uZUNlbnRlclkgPCByLnRvcCArIHIuaGVpZ2h0IC8gMikge1xyXG4gICAgICAgICAgbmV3SW5zZXJ0QmVmb3JlID0gb3RoZXI7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChuZXdJbnNlcnRCZWZvcmUgIT09IGxhc3RJbnNlcnRCZWZvcmUpIHtcclxuICAgICAgICBjb25zdCBhbGxDYXJkcyA9IEFycmF5LmZyb20obGlzdEVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIucHJvbXB0LWNhcmQtaXRlbVwiKSk7XHJcbiAgICAgICAgY29uc3QgZmlyc3RQb3NpdGlvbnMgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgYWxsQ2FyZHMuZm9yRWFjaCgoZWwpID0+IGZpcnN0UG9zaXRpb25zLnNldChlbCwgZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkpKTtcclxuXHJcbiAgICAgICAgbGlzdEVsLmluc2VydEJlZm9yZShjYXJkLCBuZXdJbnNlcnRCZWZvcmUpO1xyXG4gICAgICAgIGxhc3RJbnNlcnRCZWZvcmUgPSBuZXdJbnNlcnRCZWZvcmU7XHJcblxyXG4gICAgICAgIGFsbENhcmRzXHJcbiAgICAgICAgICAuZmlsdGVyKChlbCkgPT4gZWwgIT09IGNhcmQpXHJcbiAgICAgICAgICAuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZmlyc3QgPSBmaXJzdFBvc2l0aW9ucy5nZXQoZWwpO1xyXG4gICAgICAgICAgICBpZiAoIWZpcnN0KSByZXR1cm47XHJcbiAgICAgICAgICAgIGNvbnN0IGxhc3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICAgICAgY29uc3QgZHkgPSBmaXJzdC50b3AgLSBsYXN0LnRvcDtcclxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKGR5KSA8IDEpIHJldHVybjtcclxuICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9IFwibm9uZVwiO1xyXG4gICAgICAgICAgICBlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke2R5fXB4KWA7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcInRyYW5zZm9ybSAyMDBtcyBjdWJpYy1iZXppZXIoMC4yLDAsMCwxKVwiO1xyXG4gICAgICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNmb3JtID0gXCJcIjtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIG9uVXAoKSB7XHJcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBvbk1vdmUpO1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uVXApO1xyXG5cclxuICAgICAgY29uc3QgZmluYWxSZWN0ID0gY2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgY2xvbmUuc3R5bGUudHJhbnNpdGlvbiA9IFwidG9wIDE2MG1zIGVhc2UsIGJveC1zaGFkb3cgMTYwbXMgZWFzZSwgb3BhY2l0eSAxNjBtcyBlYXNlXCI7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRvcCA9IGAke2ZpbmFsUmVjdC50b3B9cHhgO1xyXG4gICAgICBjbG9uZS5zdHlsZS5ib3hTaGFkb3cgPSBcIm5vbmVcIjtcclxuICAgICAgY2xvbmUuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xyXG5cclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgY2xvbmUucmVtb3ZlKCk7XHJcbiAgICAgICAgY2FyZC5zdHlsZS5vcGFjaXR5ID0gXCJcIjtcclxuICAgICAgICBjYXJkLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIlwiO1xyXG5cclxuICAgICAgICBBcnJheS5mcm9tKGxpc3RFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLnByb21wdC1jYXJkLWl0ZW1cIikpLmZvckVhY2goKGVsKSA9PiB7XHJcbiAgICAgICAgICBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJcIjtcclxuICAgICAgICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IFwiXCI7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5ld1Byb21wdElkcyA9IEFycmF5LmZyb20obGlzdEVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIucHJvbXB0LWNhcmQtaXRlbVwiKSkubWFwKChjKSA9PiBjLmRhdGFzZXQucHJvbXB0SWQpO1xyXG4gICAgICAgIGNvbnN0IHJlb3JkZXJlZCA9IG5ld1Byb21wdElkcy5tYXAoKGlkKSA9PiBncm91cC5wcm9tcHRzLmZpbmQoKHApID0+IHAuaWQgPT09IGlkKSkuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICAgIGlmIChyZW9yZGVyZWQubGVuZ3RoID09PSBncm91cC5wcm9tcHRzLmxlbmd0aCkge1xyXG4gICAgICAgICAgZ3JvdXAucHJvbXB0cyA9IHJlb3JkZXJlZDtcclxuICAgICAgICAgIHBlcnNpc3RBbGwoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sIDE2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJtb3ZlXCIsIG9uTW92ZSk7XHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcnVwXCIsIG9uVXApO1xyXG4gIH1cclxufVxyXG5cclxuLy8gXCLlhajpg6hcIuiBmuWQiOinhuWbvuS4k+eUqOaLluaLve+8muaLluaLveaJi+afhOmAu+i+keS4jiBhdHRhY2hQcm9tcHRJdGVtRHJhZyDnm7jlkIzvvIxcclxuLy8g5L2G6JC954K55pe25oyJ5ZCE5Y2h54mH55qEIGRhdGEtZ3JvdXAtaWQg5YiG57uE77yM5YiG5Yir5pu05paw5ZCE6Ieq5YiG57uE5YaF55qE5o+Q56S66K+N6aG65bqP44CCXHJcbmV4cG9ydCBmdW5jdGlvbiBhdHRhY2hQcm9tcHRJdGVtRHJhZ0FsbChsaXN0RWwpIHtcclxuICBsaXN0RWwuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJkb3duXCIsIG9uUHJvbXB0UG9pbnRlckRvd24pO1xyXG5cclxuICBmdW5jdGlvbiBvblByb21wdFBvaW50ZXJEb3duKGUpIHtcclxuICAgIGNvbnN0IGhhbmRsZSA9IGUudGFyZ2V0LmNsb3Nlc3QoXCIucHJvbXB0LWNhcmQtZHJhZy1oYW5kbGVcIik7XHJcbiAgICBpZiAoIWhhbmRsZSkgcmV0dXJuO1xyXG4gICAgY29uc3QgY2FyZCA9IGhhbmRsZS5jbG9zZXN0KFwiLnByb21wdC1jYXJkLWl0ZW1cIik7XHJcbiAgICBpZiAoIWNhcmQpIHJldHVybjtcclxuXHJcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcblxyXG4gICAgY29uc3QgcmVjdCA9IGNhcmQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBvZmZzZXRZID0gZS5jbGllbnRZIC0gcmVjdC50b3A7XHJcblxyXG4gICAgY29uc3QgY2xvbmUgPSBjYXJkLmNsb25lTm9kZSh0cnVlKTtcclxuICAgIGNsb25lLnN0eWxlLmNzc1RleHQgPSBbXHJcbiAgICAgIFwicG9zaXRpb246Zml4ZWRcIixcclxuICAgICAgYGxlZnQ6JHtyZWN0LmxlZnR9cHhgLFxyXG4gICAgICBgdG9wOiR7cmVjdC50b3B9cHhgLFxyXG4gICAgICBgd2lkdGg6JHtyZWN0LndpZHRofXB4YCxcclxuICAgICAgXCJwb2ludGVyLWV2ZW50czpub25lXCIsXHJcbiAgICAgIFwiei1pbmRleDo5OTk5XCIsXHJcbiAgICAgIFwiYm94LXNoYWRvdzowIDhweCAyOHB4IHJnYmEoMCwwLDAsMC4xMylcIixcclxuICAgICAgXCJvcGFjaXR5OjAuOTVcIixcclxuICAgICAgXCJ0cmFuc2l0aW9uOm5vbmVcIixcclxuICAgICAgXCJib3JkZXItcmFkaXVzOjhweFwiLFxyXG4gICAgICBcImJhY2tncm91bmQ6I2ZmZlwiXHJcbiAgICBdLmpvaW4oXCI7XCIpO1xyXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjbG9uZSk7XHJcblxyXG4gICAgY2FyZC5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XHJcbiAgICBjYXJkLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIm5vbmVcIjtcclxuXHJcbiAgICBsZXQgbGFzdEluc2VydEJlZm9yZSA9IG51bGw7XHJcblxyXG4gICAgZnVuY3Rpb24gb25Nb3ZlKGV2KSB7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRvcCA9IGAke2V2LmNsaWVudFkgLSBvZmZzZXRZfXB4YDtcclxuXHJcbiAgICAgIGNvbnN0IGNsb25lQ2VudGVyWSA9IGV2LmNsaWVudFkgLSBvZmZzZXRZICsgcmVjdC5oZWlnaHQgLyAyO1xyXG4gICAgICBjb25zdCBvdGhlckNhcmRzID0gQXJyYXkuZnJvbShsaXN0RWwucXVlcnlTZWxlY3RvckFsbChcIi5wcm9tcHQtY2FyZC1pdGVtXCIpKS5maWx0ZXIoKGMpID0+IGMgIT09IGNhcmQpO1xyXG4gICAgICBsZXQgbmV3SW5zZXJ0QmVmb3JlID0gbnVsbDtcclxuXHJcbiAgICAgIGZvciAoY29uc3Qgb3RoZXIgb2Ygb3RoZXJDYXJkcykge1xyXG4gICAgICAgIGNvbnN0IHIgPSBvdGhlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBpZiAoY2xvbmVDZW50ZXJZIDwgci50b3AgKyByLmhlaWdodCAvIDIpIHtcclxuICAgICAgICAgIG5ld0luc2VydEJlZm9yZSA9IG90aGVyO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAobmV3SW5zZXJ0QmVmb3JlICE9PSBsYXN0SW5zZXJ0QmVmb3JlKSB7XHJcbiAgICAgICAgY29uc3QgYWxsQ2FyZHMgPSBBcnJheS5mcm9tKGxpc3RFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLnByb21wdC1jYXJkLWl0ZW1cIikpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0UG9zaXRpb25zID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIGFsbENhcmRzLmZvckVhY2goKGVsKSA9PiBmaXJzdFBvc2l0aW9ucy5zZXQoZWwsIGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpKSk7XHJcblxyXG4gICAgICAgIGxpc3RFbC5pbnNlcnRCZWZvcmUoY2FyZCwgbmV3SW5zZXJ0QmVmb3JlKTtcclxuICAgICAgICBsYXN0SW5zZXJ0QmVmb3JlID0gbmV3SW5zZXJ0QmVmb3JlO1xyXG5cclxuICAgICAgICBhbGxDYXJkc1xyXG4gICAgICAgICAgLmZpbHRlcigoZWwpID0+IGVsICE9PSBjYXJkKVxyXG4gICAgICAgICAgLmZvckVhY2goKGVsKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0ID0gZmlyc3RQb3NpdGlvbnMuZ2V0KGVsKTtcclxuICAgICAgICAgICAgaWYgKCFmaXJzdCkgcmV0dXJuO1xyXG4gICAgICAgICAgICBjb25zdCBsYXN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZmlyc3QudG9wIC0gbGFzdC50b3A7XHJcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhkeSkgPCAxKSByZXR1cm47XHJcbiAgICAgICAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcIm5vbmVcIjtcclxuICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZVkoJHtkeX1weClgO1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJ0cmFuc2Zvcm0gMjAwbXMgY3ViaWMtYmV6aWVyKDAuMiwwLDAsMSlcIjtcclxuICAgICAgICAgICAgICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBvblVwKCkge1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcm1vdmVcIiwgb25Nb3ZlKTtcclxuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJ1cFwiLCBvblVwKTtcclxuXHJcbiAgICAgIGNvbnN0IGZpbmFsUmVjdCA9IGNhcmQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRyYW5zaXRpb24gPSBcInRvcCAxNjBtcyBlYXNlLCBib3gtc2hhZG93IDE2MG1zIGVhc2UsIG9wYWNpdHkgMTYwbXMgZWFzZVwiO1xyXG4gICAgICBjbG9uZS5zdHlsZS50b3AgPSBgJHtmaW5hbFJlY3QudG9wfXB4YDtcclxuICAgICAgY2xvbmUuc3R5bGUuYm94U2hhZG93ID0gXCJub25lXCI7XHJcbiAgICAgIGNsb25lLnN0eWxlLm9wYWNpdHkgPSBcIjBcIjtcclxuXHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIGNsb25lLnJlbW92ZSgpO1xyXG4gICAgICAgIGNhcmQuc3R5bGUub3BhY2l0eSA9IFwiXCI7XHJcbiAgICAgICAgY2FyZC5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJcIjtcclxuXHJcbiAgICAgICAgQXJyYXkuZnJvbShsaXN0RWwucXVlcnlTZWxlY3RvckFsbChcIi5wcm9tcHQtY2FyZC1pdGVtXCIpKS5mb3JFYWNoKChlbCkgPT4ge1xyXG4gICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9IFwiXCI7XHJcbiAgICAgICAgICBlbC5zdHlsZS50cmFuc2Zvcm0gPSBcIlwiO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyDmjIkgZ3JvdXBJZCDliIbmobbvvIzliIbliKvmm7TmlrDlkITliIbnu4TnmoTmj5DnpLror43pobrluo9cclxuICAgICAgICBjb25zdCBncm91cE9yZGVyTWFwID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIEFycmF5LmZyb20obGlzdEVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIucHJvbXB0LWNhcmQtaXRlbVwiKSkuZm9yRWFjaCgoZWwpID0+IHtcclxuICAgICAgICAgIGNvbnN0IGdJZCA9IGVsLmRhdGFzZXQuZ3JvdXBJZDtcclxuICAgICAgICAgIGlmICghZ3JvdXBPcmRlck1hcC5oYXMoZ0lkKSkgZ3JvdXBPcmRlck1hcC5zZXQoZ0lkLCBbXSk7XHJcbiAgICAgICAgICBncm91cE9yZGVyTWFwLmdldChnSWQpLnB1c2goZWwuZGF0YXNldC5wcm9tcHRJZCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjaGFuZ2VkID0gZmFsc2U7XHJcbiAgICAgICAgZ3JvdXBPcmRlck1hcC5mb3JFYWNoKChwcm9tcHRJZHMsIGdJZCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgZ3JvdXAgPSBzdGF0ZS5wcm9tcHRHcm91cHMuZmluZCgoZykgPT4gZy5pZCA9PT0gZ0lkKTtcclxuICAgICAgICAgIGlmICghZ3JvdXApIHJldHVybjtcclxuICAgICAgICAgIGNvbnN0IHJlb3JkZXJlZCA9IHByb21wdElkcy5tYXAoKGlkKSA9PiBncm91cC5wcm9tcHRzLmZpbmQoKHApID0+IHAuaWQgPT09IGlkKSkuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICAgICAgaWYgKHJlb3JkZXJlZC5sZW5ndGggPT09IGdyb3VwLnByb21wdHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGdyb3VwLnByb21wdHMgPSByZW9yZGVyZWQ7XHJcbiAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoY2hhbmdlZCkgcGVyc2lzdEFsbCgpO1xyXG4gICAgICB9LCAxNjApO1xyXG4gICAgfVxyXG5cclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBvbk1vdmUpO1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJ1cFwiLCBvblVwKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBhdHRhY2hDaGlwRHJhZyhjaGlwc1dyYXAsIGdyb3VwKSB7XHJcbiAgY2hpcHNXcmFwLmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVyZG93blwiLCBvblBvaW50ZXJEb3duKTtcclxuXHJcbiAgZnVuY3Rpb24gb25Qb2ludGVyRG93bihlKSB7XHJcbiAgICBjb25zdCBjaGlwID0gZS50YXJnZXQuY2xvc2VzdChcIi5zZWxlY3RlZC1jaGlwXCIpO1xyXG4gICAgaWYgKCFjaGlwIHx8IGUudGFyZ2V0LmNsb3Nlc3QoXCIuY2hpcC1yZW1vdmUtYnRuXCIpKSByZXR1cm47XHJcblxyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgIGNvbnN0IHJlY3QgPSBjaGlwLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3Qgb2Zmc2V0WCA9IGUuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgIGNvbnN0IG9mZnNldFkgPSBlLmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICBjb25zdCBjbG9uZSA9IGNoaXAuY2xvbmVOb2RlKHRydWUpO1xyXG4gICAgY2xvbmUuc3R5bGUuY3NzVGV4dCA9IFtcclxuICAgICAgYHBvc2l0aW9uOmZpeGVkYCxcclxuICAgICAgYGxlZnQ6JHtyZWN0LmxlZnR9cHhgLFxyXG4gICAgICBgdG9wOiR7cmVjdC50b3B9cHhgLFxyXG4gICAgICBgd2lkdGg6JHtyZWN0LndpZHRofXB4YCxcclxuICAgICAgYGhlaWdodDoke3JlY3QuaGVpZ2h0fXB4YCxcclxuICAgICAgYG1hcmdpbjowYCxcclxuICAgICAgYHBvaW50ZXItZXZlbnRzOm5vbmVgLFxyXG4gICAgICBgei1pbmRleDo5OTk5YCxcclxuICAgICAgYGJveC1zaGFkb3c6MCA2cHggMjBweCByZ2JhKDAsMCwwLDAuMTgpYCxcclxuICAgICAgYG9wYWNpdHk6MWAsXHJcbiAgICAgIGBjdXJzb3I6Z3JhYmJpbmdgLFxyXG4gICAgICBgdHJhbnNpdGlvbjpub25lYFxyXG4gICAgXS5qb2luKFwiO1wiKTtcclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY2xvbmUpO1xyXG5cclxuICAgIGNoaXAuY2xhc3NMaXN0LmFkZChcImlzLWNoaXAtcGxhY2Vob2xkZXJcIik7XHJcbiAgICBjaGlwc1dyYXAuY2xhc3NMaXN0LmFkZChcImlzLWNoaXAtZHJhZ2dpbmctYWN0aXZlXCIpO1xyXG5cclxuICAgIGxldCBsYXN0SW5zZXJ0QmVmb3JlID0gbnVsbDtcclxuXHJcbiAgICBmdW5jdGlvbiBvbk1vdmUoZXYpIHtcclxuICAgICAgY2xvbmUuc3R5bGUubGVmdCA9IGAke2V2LmNsaWVudFggLSBvZmZzZXRYfXB4YDtcclxuICAgICAgY2xvbmUuc3R5bGUudG9wID0gYCR7ZXYuY2xpZW50WSAtIG9mZnNldFl9cHhgO1xyXG5cclxuICAgICAgY29uc3QgY2xvbmVDZW50ZXJYID0gZXYuY2xpZW50WCAtIG9mZnNldFggKyByZWN0LndpZHRoIC8gMjtcclxuICAgICAgY29uc3QgY2xvbmVDZW50ZXJZID0gZXYuY2xpZW50WSAtIG9mZnNldFkgKyByZWN0LmhlaWdodCAvIDI7XHJcblxyXG4gICAgICBjb25zdCBvdGhlckNoaXBzID0gQXJyYXkuZnJvbShjaGlwc1dyYXAucXVlcnlTZWxlY3RvckFsbChcIi5zZWxlY3RlZC1jaGlwXCIpKS5maWx0ZXIoKGMpID0+IGMgIT09IGNoaXApO1xyXG4gICAgICBjb25zdCBhZGRXcmFwID0gY2hpcHNXcmFwLnF1ZXJ5U2VsZWN0b3IoXCIuaW5saW5lLWFkZC13cmFwXCIpO1xyXG4gICAgICBsZXQgbmV3SW5zZXJ0QmVmb3JlID0gYWRkV3JhcDtcclxuXHJcbiAgICAgIGZvciAoY29uc3Qgb3RoZXIgb2Ygb3RoZXJDaGlwcykge1xyXG4gICAgICAgIGNvbnN0IHIgPSBvdGhlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtaWRYID0gci5sZWZ0ICsgci53aWR0aCAvIDI7XHJcbiAgICAgICAgY29uc3QgbWlkWSA9IHIudG9wICsgci5oZWlnaHQgLyAyO1xyXG4gICAgICAgIGlmIChcclxuICAgICAgICAgIGNsb25lQ2VudGVyWSA8IG1pZFkgLSByLmhlaWdodCAqIDAuNCB8fFxyXG4gICAgICAgICAgKE1hdGguYWJzKGNsb25lQ2VudGVyWSAtIG1pZFkpIDw9IHIuaGVpZ2h0ICogMC42ICYmIGNsb25lQ2VudGVyWCA8IG1pZFgpXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICBuZXdJbnNlcnRCZWZvcmUgPSBvdGhlcjtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKG5ld0luc2VydEJlZm9yZSAhPT0gbGFzdEluc2VydEJlZm9yZSkge1xyXG4gICAgICAgIGNvbnN0IGFsbENoaXBzID0gQXJyYXkuZnJvbShjaGlwc1dyYXAucXVlcnlTZWxlY3RvckFsbChcIi5zZWxlY3RlZC1jaGlwXCIpKTtcclxuICAgICAgICBjb25zdCBmaXJzdFBvc2l0aW9ucyA9IG5ldyBNYXAoKTtcclxuICAgICAgICBhbGxDaGlwcy5mb3JFYWNoKChlbCkgPT4gZmlyc3RQb3NpdGlvbnMuc2V0KGVsLCBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSkpO1xyXG5cclxuICAgICAgICBjaGlwc1dyYXAuaW5zZXJ0QmVmb3JlKGNoaXAsIG5ld0luc2VydEJlZm9yZSk7XHJcbiAgICAgICAgbGFzdEluc2VydEJlZm9yZSA9IG5ld0luc2VydEJlZm9yZTtcclxuXHJcbiAgICAgICAgYWxsQ2hpcHNcclxuICAgICAgICAgIC5maWx0ZXIoKGVsKSA9PiBlbCAhPT0gY2hpcClcclxuICAgICAgICAgIC5mb3JFYWNoKChlbCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmaXJzdCA9IGZpcnN0UG9zaXRpb25zLmdldChlbCk7XHJcbiAgICAgICAgICAgIGlmICghZmlyc3QpIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgbGFzdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBkeCA9IGZpcnN0LmxlZnQgLSBsYXN0LmxlZnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gZmlyc3QudG9wIC0gbGFzdC50b3A7XHJcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhkeCkgPCAxICYmIE1hdGguYWJzKGR5KSA8IDEpIHJldHVybjtcclxuICAgICAgICAgICAgZWwuc3R5bGUudHJhbnNpdGlvbiA9IFwibm9uZVwiO1xyXG4gICAgICAgICAgICBlbC5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7ZHh9cHgsJHtkeX1weClgO1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJ0cmFuc2Zvcm0gMTgwbXMgY3ViaWMtYmV6aWVyKDAuMiwwLDAsMSlcIjtcclxuICAgICAgICAgICAgICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBvblVwKCkge1xyXG4gICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwicG9pbnRlcm1vdmVcIiwgb25Nb3ZlKTtcclxuICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJ1cFwiLCBvblVwKTtcclxuXHJcbiAgICAgIGNvbnN0IGZpbmFsUmVjdCA9IGNoaXAuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRyYW5zaXRpb24gPSBcImxlZnQgMTUwbXMgZWFzZSwgdG9wIDE1MG1zIGVhc2UsIGJveC1zaGFkb3cgMTUwbXMgZWFzZSwgb3BhY2l0eSAxNTBtcyBlYXNlXCI7XHJcbiAgICAgIGNsb25lLnN0eWxlLmxlZnQgPSBgJHtmaW5hbFJlY3QubGVmdH1weGA7XHJcbiAgICAgIGNsb25lLnN0eWxlLnRvcCA9IGAke2ZpbmFsUmVjdC50b3B9cHhgO1xyXG4gICAgICBjbG9uZS5zdHlsZS5ib3hTaGFkb3cgPSBcIm5vbmVcIjtcclxuICAgICAgY2xvbmUuc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xyXG5cclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgY2xvbmUucmVtb3ZlKCk7XHJcbiAgICAgICAgY2hpcC5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtY2hpcC1wbGFjZWhvbGRlclwiKTtcclxuICAgICAgICBjaGlwc1dyYXAuY2xhc3NMaXN0LnJlbW92ZShcImlzLWNoaXAtZHJhZ2dpbmctYWN0aXZlXCIpO1xyXG5cclxuICAgICAgICBBcnJheS5mcm9tKGNoaXBzV3JhcC5xdWVyeVNlbGVjdG9yQWxsKFwiLnNlbGVjdGVkLWNoaXBcIikpLmZvckVhY2goKGVsKSA9PiB7XHJcbiAgICAgICAgICBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJcIjtcclxuICAgICAgICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IFwiXCI7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG5ld1NpdGVJZHMgPSBBcnJheS5mcm9tKGNoaXBzV3JhcC5xdWVyeVNlbGVjdG9yQWxsKFwiLnNlbGVjdGVkLWNoaXBcIikpLm1hcCgoYykgPT4gYy5kYXRhc2V0LnNpdGVJZCk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwID0gZ2V0R3JvdXBCeUlkKGdyb3VwLmlkKTtcclxuICAgICAgICBpZiAoY3VycmVudEdyb3VwKSB7XHJcbiAgICAgICAgICBjdXJyZW50R3JvdXAuc2l0ZUlkcyA9IG5ld1NpdGVJZHM7XHJcbiAgICAgICAgICBwZXJzaXN0QWxsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LCAxNTApO1xyXG4gICAgfVxyXG5cclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJwb2ludGVybW92ZVwiLCBvbk1vdmUpO1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcInBvaW50ZXJ1cFwiLCBvblVwKTtcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7XHJcbiAgc3RhdGUsXHJcbiAgbXNnLFxyXG4gIFNJVEVfQ0FURUdPUklFUyxcclxuICBBSV9TSVRFX0dST1VQUyxcclxuICBTT0NJQUxfU0lURV9HUk9VUFMsXHJcbiAgR1JPVVBfTU9ERV9PUFRJT05TLFxyXG4gIFBJQ0tFUl9DTE9TRV9ERUxBWV9NUyxcclxufSBmcm9tIFwiLi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgZXNjYXBlSHRtbCwgZ2V0R3JvdXBCeUlkIH0gZnJvbSBcIi4uL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7IHBlcnNpc3RBbGwsIGdldENhdGVnb3J5U2l0ZXMgfSBmcm9tIFwiLi4vc3RvcmUuanNcIjtcclxuaW1wb3J0IHsgYXR0YWNoQ2hpcERyYWcgfSBmcm9tIFwiLi4vZHJhZy5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckdyb3Vwc1NlY3Rpb24oKSB7XHJcbiAgY29uc3QgeyBncm91cHNTZWN0aW9uIH0gPSBzdGF0ZS5kb207XHJcbiAgZ3JvdXBzU2VjdGlvbi5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICBpZiAoIXN0YXRlLmdyb3Vwcy5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGVtcHR5U3RhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICAgIGVtcHR5U3RhdGUuY2xhc3NOYW1lID0gXCJzZXR0aW5ncy1lbXB0eS1zdGF0ZVwiO1xyXG4gICAgZW1wdHlTdGF0ZS5pbm5lckhUTUwgPSBgPHN0cm9uZz4ke21zZyhcInNldHRpbmdzX2dyb3Vwc19lbXB0eVRpdGxlXCIsIFwi6L+Y5rKh5pyJ5pCc57Si57uEXCIpfTwvc3Ryb25nPjxwPiR7bXNnKFwic2V0dGluZ3NfZ3JvdXBzX2VtcHR5RGVzY1wiLCBcIuWFiOWIm+W7uuS4gOS4quaQnOe0oue7hO+8jOWGjemFjee9ruS9oOimgeiwg+eUqOeahOe9keermeaIliBBSSDmqKHlnovjgIJcIil9PC9wPmA7XHJcbiAgICBncm91cHNTZWN0aW9uLmFwcGVuZENoaWxkKGVtcHR5U3RhdGUpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBzdGF0ZS5ncm91cHMuZm9yRWFjaCgoZ3JvdXAsIGluZGV4KSA9PiBncm91cHNTZWN0aW9uLmFwcGVuZENoaWxkKGNyZWF0ZUdyb3VwQ2FyZChncm91cCwgaW5kZXgpKSk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBhZGRDYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgYWRkQ2FyZC5jbGFzc05hbWUgPSBcInNldHRpbmdzLWFkZC1jYXJkXCI7XHJcbiAgYWRkQ2FyZC5pbm5lckhUTUwgPSBgPGJ1dHRvbiBjbGFzcz1cImFkZC1zZWN0aW9uLWJ0blwiIHR5cGU9XCJidXR0b25cIj4ke21zZyhcInNldHRpbmdzX2dyb3Vwc19hZGRHcm91cFwiLCBcIuaWsOWinuaQnOe0oue7hFwiKX08L2J1dHRvbj5gO1xyXG4gIGFkZENhcmQucXVlcnlTZWxlY3RvcihcImJ1dHRvblwiKS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgc3RhdGUuZ3JvdXBzLnB1c2goe1xyXG4gICAgICBpZDogYGdyb3VwXyR7RGF0ZS5ub3coKX1gLFxyXG4gICAgICBuYW1lOiBtc2coXCJzZXR0aW5nc19ncm91cHNfbmV3R3JvdXBOYW1lXCIsIFwi5paw5pCc57Si57uEXCIpLFxyXG4gICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICBtb2RlOiBcImNvbXBhcmVcIixcclxuICAgICAgc2l0ZUlkczogW11cclxuICAgIH0pO1xyXG4gICAgYXdhaXQgcGVyc2lzdEFsbCgpO1xyXG4gICAgcmVuZGVyR3JvdXBzU2VjdGlvbigpO1xyXG4gIH0pO1xyXG4gIGdyb3Vwc1NlY3Rpb24uYXBwZW5kQ2hpbGQoYWRkQ2FyZCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUdyb3VwQ2FyZChncm91cCwgaW5kZXgpIHtcclxuICBjb25zdCBpc0xvY2tlZCA9IGluZGV4ID09PSAwO1xyXG4gIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICBjYXJkLmNsYXNzTmFtZSA9IGBzZXR0aW5ncy1ncm91cC1jYXJkJHtncm91cC5lbmFibGVkID8gXCJcIiA6IFwiIGlzLWRpc2FibGVkXCJ9YDtcclxuICBjYXJkLmRhdGFzZXQuZ3JvdXBJZCA9IGdyb3VwLmlkO1xyXG5cclxuICBpZiAoIWlzTG9ja2VkKSB7XHJcbiAgICBjb25zdCBkZWxldGVDb3JuZXJCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gICAgZGVsZXRlQ29ybmVyQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgZGVsZXRlQ29ybmVyQnRuLmNsYXNzTmFtZSA9IFwiZ3JvdXAtZGVsZXRlLWNvcm5lci1idG5cIjtcclxuICAgICAgZGVsZXRlQ29ybmVyQnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbXNnKFwic2V0dGluZ3NfZ3JvdXBzX2RlbGV0ZUdyb3VwQXJpYVwiLCBcIuWIoOmZpOaQnOe0oue7hFwiKSk7XHJcbiAgICBkZWxldGVDb3JuZXJCdG4udGV4dENvbnRlbnQgPSBcIsOXXCI7XHJcbiAgICBkZWxldGVDb3JuZXJCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgICAgY29uc3QgY3VycmVudEdyb3VwID0gZ2V0R3JvdXBCeUlkKGdyb3VwLmlkKTtcclxuICAgICAgaWYgKCFjdXJyZW50R3JvdXApIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgY29uc3Qgc2hvdWxkRGVsZXRlID0gd2luZG93LmNvbmZpcm0obXNnKFwic2V0dGluZ3NfZ3JvdXBzX2RlbGV0ZUdyb3VwQ29uZmlybVwiLCBcIuaYr+WQpuimgeWIoOmZpOivpeaQnOe0oue7hO+8n1wiKSk7XHJcbiAgICAgIGlmICghc2hvdWxkRGVsZXRlKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIHN0YXRlLmdyb3VwcyA9IHN0YXRlLmdyb3Vwcy5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uaWQgIT09IGN1cnJlbnRHcm91cC5pZCk7XHJcbiAgICAgIGlmIChzdGF0ZS5vcGVuUGlja2VyR3JvdXBJZCA9PT0gY3VycmVudEdyb3VwLmlkKSB7XHJcbiAgICAgICAgY2xvc2VQaWNrZXIoKTtcclxuICAgICAgfVxyXG4gICAgICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgICAgIHJlbmRlckdyb3Vwc1NlY3Rpb24oKTtcclxuICAgIH0pO1xyXG4gICAgY2FyZC5hcHBlbmRDaGlsZChkZWxldGVDb3JuZXJCdG4pO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbGVmdFBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBsZWZ0UGFuZWwuY2xhc3NOYW1lID0gXCJzZXR0aW5ncy1ncm91cC1tZXRhXCI7XHJcbiAgbGVmdFBhbmVsLmlubmVySFRNTCA9IGBcclxuICAgIDxkaXYgY2xhc3M9XCJncm91cC1pbmxpbmUtY29udHJvbHMgZ3JvdXAtaW5saW5lLWNvbnRyb2xzLXNwbGl0XCI+XHJcbiAgICAgIDxsYWJlbCBjbGFzcz1cImlubGluZS1jb250cm9sIGdyb3VwLW5hbWUtaW5saW5lLXdyYXBcIj5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cImZpZWxkLWxhYmVsIGlubGluZS1maWVsZC1sYWJlbFwiPiR7bXNnKFwic2V0dGluZ3NfZ3JvdXBzX2ZpZWxkTmFtZVwiLCBcIuaQnOe0oue7hOWQjeensFwiKX08L3NwYW4+XHJcbiAgICAgICAgPGlucHV0IGNsYXNzPVwiZ3JvdXAtbmFtZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwoZ3JvdXAubmFtZSl9XCIgZGF0YS1maWVsZD1cIm5hbWVcIiAvPlxyXG4gICAgICA8L2xhYmVsPlxyXG4gICAgICA8bGFiZWwgY2xhc3M9XCJpbmxpbmUtY29udHJvbCBpbmxpbmUtbW9kZS1jb250cm9sIGlubGluZS1tb2RlLXNlbGVjdC13cmFwXCI+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJmaWVsZC1sYWJlbCBpbmxpbmUtZmllbGQtbGFiZWxcIj4ke21zZyhcInNldHRpbmdzX2dyb3Vwc19maWVsZE1vZGVcIiwgXCLlkYjnjrDmlrnlvI9cIil9PC9zcGFuPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJncm91cC1tb2RlLWRyb3Bkb3duXCIgZGF0YS1maWVsZD1cIm1vZGUtZHJvcGRvd25cIj5cclxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJncm91cC1tb2RlLXRyaWdnZXJcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1maWVsZD1cIm1vZGUtdHJpZ2dlclwiIGFyaWEtZXhwYW5kZWQ9XCJmYWxzZVwiPlxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImdyb3VwLW1vZGUtdHJpZ2dlci1sYWJlbFwiPiR7ZXNjYXBlSHRtbChncm91cC5tb2RlID09PSBcInRhYnNcIiA/IG1zZyhcInNldHRpbmdzX2dyb3Vwc19tb2RlVGFic1wiLCBcIuaWsOW8gOagh+etvlwiKSA6IG1zZyhcInNldHRpbmdzX2dyb3Vwc19tb2RlQ29tcGFyZVwiLCBcIuWNoeeJh+WRiOeOsFwiKSl9PC9zcGFuPlxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImdyb3VwLW1vZGUtdHJpZ2dlci1hcnJvd1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjwvc3Bhbj5cclxuICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cImdyb3VwLW1vZGUtbWVudVwiIGRhdGEtZmllbGQ9XCJtb2RlLW1lbnVcIiBoaWRkZW4+XHJcbiAgICAgICAgICAgICR7R1JPVVBfTU9ERV9PUFRJT05TLm1hcCgob3B0aW9uKSA9PiBgPGJ1dHRvbiBjbGFzcz1cImdyb3VwLW1vZGUtb3B0aW9uJHtncm91cC5tb2RlID09PSBvcHRpb24udmFsdWUgPyBcIiBpcy1hY3RpdmVcIiA6IFwiXCJ9XCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtbW9kZS12YWx1ZT1cIiR7b3B0aW9uLnZhbHVlfVwiPiR7ZXNjYXBlSHRtbChvcHRpb24ubGFiZWwpfTwvYnV0dG9uPmApLmpvaW4oXCJcIil9XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgPC9sYWJlbD5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcblxyXG4gIGNvbnN0IHJpZ2h0UGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJpZ2h0UGFuZWwuY2xhc3NOYW1lID0gXCJzZXR0aW5ncy1ncm91cC1zaXRlc1wiO1xyXG5cclxuICBjb25zdCBjaGlwc1dyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGNoaXBzV3JhcC5jbGFzc05hbWUgPSBcInNpdGUtY2hpcC1saXN0XCI7XHJcblxyXG4gIGNvbnN0IHNlbGVjdGVkU2l0ZXMgPSBncm91cC5zaXRlSWRzLm1hcCgoc2l0ZUlkKSA9PiBzdGF0ZS5zaXRlcy5maW5kKChzaXRlKSA9PiBzaXRlLmlkID09PSBzaXRlSWQpKS5maWx0ZXIoQm9vbGVhbik7XHJcbiAgc2VsZWN0ZWRTaXRlcy5mb3JFYWNoKChzaXRlKSA9PiBjaGlwc1dyYXAuYXBwZW5kQ2hpbGQoY3JlYXRlU2VsZWN0ZWRDaGlwKGdyb3VwLCBzaXRlKSkpO1xyXG5cclxuICBjaGlwc1dyYXAuYXBwZW5kQ2hpbGQoY3JlYXRlSW5saW5lQWRkKGdyb3VwKSk7XHJcbiAgYXR0YWNoQ2hpcERyYWcoY2hpcHNXcmFwLCBncm91cCk7XHJcbiAgcmlnaHRQYW5lbC5hcHBlbmRDaGlsZChjaGlwc1dyYXApO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQobGVmdFBhbmVsKTtcclxuICBjYXJkLmFwcGVuZENoaWxkKHJpZ2h0UGFuZWwpO1xyXG5cclxuICBpZiAoIWlzTG9ja2VkKSB7XHJcbiAgICBjb25zdCBkcmFnSGFuZGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGRyYWdIYW5kbGUudHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgICBkcmFnSGFuZGxlLmNsYXNzTmFtZSA9IFwiZ3JvdXAtZHJhZy1oYW5kbGVcIjtcclxuICAgIGRyYWdIYW5kbGUuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBtc2coXCJzZXR0aW5nc19ncm91cHNfZHJhZ0FyaWFcIiwgXCLmi5bliqjosIPmlbTmkJzntKLnu4Tpobrluo9cIikpO1xyXG4gICAgZHJhZ0hhbmRsZS5pbm5lckhUTUwgPSBgPHN2ZyB2aWV3Qm94PVwiMCAwIDEwMjQgMTAyNFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIGNsYXNzPVwiZ3JvdXAtZHJhZy1oYW5kbGUtc3ZnXCI+PHBhdGggZD1cIk03MTYuOCAyMTIuNDhjLTEwLjI0IDAtMTcuOTIgMi41Ni0yNS42IDUuMTJ2LTUuMTJjMC00My41Mi0zMy4yOC03Ni44LTc2LjgtNzYuOC0xMC4yNCAwLTE3LjkyIDIuNTYtMjguMTYgNS4xMkM1ODEuMTIgMTA0Ljk2IDU1MC40IDc2LjggNTEyIDc2LjhjLTQzLjUyIDAtNzYuOCAzMy4yOC03Ni44IDc2Ljh2NS4xMmMtNy42OC0yLjU2LTE1LjM2LTUuMTItMjUuNi01LjEyLTQzLjUyIDAtNzYuOCAzMy4yOC03Ni44IDc2Ljh2MTA0Ljk2Yy03LjY4LTIuNTYtMTUuMzYtNS4xMi0yNS42LTUuMTItNDMuNTIgMC03Ni44IDMzLjI4LTc2LjggNzYuOHYyNTZjMCAxNTYuMTYgMTI1LjQ0IDI4MS42IDI4MS42IDI4MS42czI4MS42LTEyNS40NCAyODEuNi0yODEuNlYyODkuMjhjMC00My41Mi0zMy4yOC03Ni44LTc2LjgtNzYuOHpNNzQyLjQgNjY1LjZjMCAxMjgtMTAyLjQgMjMwLjQtMjMwLjQgMjMwLjRzLTIzMC40LTEwMi40LTIzMC40LTIzMC40VjQwOS42YzAtMTUuMzYgMTAuMjQtMjUuNiAyNS42LTI1LjZzMjUuNiAxMC4yNCAyNS42IDI1LjZ2MjA5LjkyaDQzLjUyYzU2LjMyIDUuMTIgMTEwLjA4IDMzLjI4IDE0My4zNiA3OS4zNmw0MC45Ni0zMC43MmMtNDAuOTYtNTYuMzItMTA3LjUyLTk0LjcyLTE3Ni42NC05OS44NFYyMzAuNGMwLTE1LjM2IDEwLjI0LTI1LjYgMjUuNi0yNS42czI1LjYgMTAuMjQgMjUuNiAyNS42djI1Nmg1MS4yVjE1My42YzAtMTUuMzYgMTAuMjQtMjUuNiAyNS42LTI1LjZzMjUuNiAxMC4yNCAyNS42IDI1LjZ2MzM1LjM2aDUxLjJWMjEyLjQ4YzAtMTUuMzYgMTAuMjQtMjUuNiAyNS42LTI1LjZzMjUuNiAxMC4yNCAyNS42IDI1LjZ2Mjc2LjQ4aDUxLjJ2LTE5OS42OGMwLTE1LjM2IDEwLjI0LTI1LjYgMjUuNi0yNS42czI1LjYgMTAuMjQgMjUuNiAyNS42VjY2NS42elwiIGZpbGw9XCIjNTI1QzZBXCI+PC9wYXRoPjwvc3ZnPmA7XHJcbiAgICBjYXJkLmFwcGVuZENoaWxkKGRyYWdIYW5kbGUpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbmFtZUlucHV0ID0gbGVmdFBhbmVsLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1maWVsZD0nbmFtZSddXCIpO1xyXG4gIGNvbnN0IG1vZGVEcm9wZG93biA9IGxlZnRQYW5lbC5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtZmllbGQ9J21vZGUtZHJvcGRvd24nXVwiKTtcclxuICBjb25zdCBtb2RlVHJpZ2dlciA9IGxlZnRQYW5lbC5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtZmllbGQ9J21vZGUtdHJpZ2dlciddXCIpO1xyXG4gIGNvbnN0IG1vZGVNZW51ID0gbGVmdFBhbmVsLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1maWVsZD0nbW9kZS1tZW51J11cIik7XHJcblxyXG4gIGlmIChuYW1lSW5wdXQpIHtcclxuICAgIG5hbWVJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRHcm91cCA9IGdldEdyb3VwQnlJZChncm91cC5pZCk7XHJcbiAgICAgIGlmICghY3VycmVudEdyb3VwKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IG5leHRWYWx1ZSA9IGV2ZW50LnRhcmdldCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQgPyBldmVudC50YXJnZXQudmFsdWUgOiBcIlwiO1xyXG4gICAgICBjdXJyZW50R3JvdXAubmFtZSA9IG5leHRWYWx1ZTtcclxuICAgICAgYXdhaXQgcGVyc2lzdEFsbCgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAobW9kZURyb3Bkb3duICYmIG1vZGVUcmlnZ2VyICYmIG1vZGVNZW51KSB7XHJcbiAgICBtb2RlVHJpZ2dlci5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICBjb25zdCBpc09wZW4gPSBtb2RlRHJvcGRvd24uY2xhc3NMaXN0LmNvbnRhaW5zKFwiaXMtb3BlblwiKTtcclxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcIi5ncm91cC1tb2RlLWRyb3Bkb3duXCIpLmZvckVhY2goKGRyb3Bkb3duKSA9PiB7XHJcbiAgICAgICAgZHJvcGRvd24uY2xhc3NMaXN0LnJlbW92ZShcImlzLW9wZW5cIik7XHJcbiAgICAgICAgY29uc3QgdHJpZ2dlciA9IGRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1maWVsZD0nbW9kZS10cmlnZ2VyJ11cIik7XHJcbiAgICAgICAgY29uc3QgbWVudSA9IGRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1maWVsZD0nbW9kZS1tZW51J11cIik7XHJcbiAgICAgICAgaWYgKHRyaWdnZXIpIHtcclxuICAgICAgICAgIHRyaWdnZXIuc2V0QXR0cmlidXRlKFwiYXJpYS1leHBhbmRlZFwiLCBcImZhbHNlXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobWVudSkge1xyXG4gICAgICAgICAgbWVudS5oaWRkZW4gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgIGlmICghaXNPcGVuKSB7XHJcbiAgICAgICAgbW9kZURyb3Bkb3duLmNsYXNzTGlzdC5hZGQoXCJpcy1vcGVuXCIpO1xyXG4gICAgICAgIG1vZGVUcmlnZ2VyLnNldEF0dHJpYnV0ZShcImFyaWEtZXhwYW5kZWRcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgIG1vZGVNZW51LmhpZGRlbiA9IGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBtb2RlTWVudS5xdWVyeVNlbGVjdG9yQWxsKFwiW2RhdGEtbW9kZS12YWx1ZV1cIikuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XHJcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEdyb3VwID0gZ2V0R3JvdXBCeUlkKGdyb3VwLmlkKTtcclxuICAgICAgICBpZiAoIWN1cnJlbnRHcm91cCkge1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdXJyZW50R3JvdXAubW9kZSA9IGJ1dHRvbi5kYXRhc2V0Lm1vZGVWYWx1ZSA9PT0gXCJ0YWJzXCIgPyBcInRhYnNcIiA6IFwiY29tcGFyZVwiO1xyXG4gICAgICAgIGF3YWl0IHBlcnNpc3RBbGwoKTtcclxuICAgICAgICByZW5kZXJHcm91cHNTZWN0aW9uKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gY2FyZDtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU2VsZWN0ZWRDaGlwKGdyb3VwLCBzaXRlKSB7XHJcbiAgY29uc3QgY2hpcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgY2hpcC5jbGFzc05hbWUgPSBcInNpdGUtY2hpcCBzZWxlY3RlZC1jaGlwXCI7XHJcbiAgY2hpcC5kYXRhc2V0LnNpdGVJZCA9IHNpdGUuaWQ7XHJcbiAgY2hpcC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJzaXRlLWNoaXAtbGFiZWxcIj4ke2VzY2FwZUh0bWwoc2l0ZS5uYW1lKX08L3NwYW4+PGJ1dHRvbiBjbGFzcz1cImNoaXAtcmVtb3ZlLWJ0blwiIHR5cGU9XCJidXR0b25cIiBhcmlhLWxhYmVsPVwiJHttc2coXCJzZXR0aW5nc19ncm91cHNfcmVtb3ZlU2l0ZVByZWZpeFwiLCBcIuWIoOmZpCBcIil9JHtlc2NhcGVIdG1sKHNpdGUubmFtZSl9XCI+w5c8L2J1dHRvbj5gO1xyXG5cclxuICBjaGlwLnF1ZXJ5U2VsZWN0b3IoXCIuY2hpcC1yZW1vdmUtYnRuXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgY29uc3QgY3VycmVudEdyb3VwID0gZ2V0R3JvdXBCeUlkKGdyb3VwLmlkKTtcclxuICAgIGlmICghY3VycmVudEdyb3VwKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGN1cnJlbnRHcm91cC5zaXRlSWRzID0gY3VycmVudEdyb3VwLnNpdGVJZHMuZmlsdGVyKChpZCkgPT4gaWQgIT09IHNpdGUuaWQpO1xyXG4gICAgYXdhaXQgcGVyc2lzdEFsbCgpO1xyXG4gICAgcmVuZGVyR3JvdXBzU2VjdGlvbigpO1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gY2hpcDtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlSW5saW5lQWRkKGdyb3VwKSB7XHJcbiAgY29uc3Qgd3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgd3JhcC5jbGFzc05hbWUgPSBcImlubGluZS1hZGQtd3JhcFwiO1xyXG5cclxuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcclxuICBidXR0b24uY2xhc3NOYW1lID0gXCJpbmxpbmUtYWRkLWJ0blwiO1xyXG4gIGJ1dHRvbi50ZXh0Q29udGVudCA9IG1zZyhcImNvbW1vbl9hZGRcIiwgXCLmlrDlop5cIik7XHJcbiAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgY2xlYXJQaWNrZXJDbG9zZVRpbWVyKCk7XHJcbiAgICBpZiAoc3RhdGUub3BlblBpY2tlckdyb3VwSWQgPT09IGdyb3VwLmlkKSB7XHJcbiAgICAgIGNsb3NlUGlja2VyKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzdGF0ZS5vcGVuUGlja2VyR3JvdXBJZCA9IGdyb3VwLmlkO1xyXG4gICAgICBpZiAoIXN0YXRlLmFjdGl2ZVBpY2tlckNhdGVnb3J5S2V5IHx8ICFTSVRFX0NBVEVHT1JJRVNbc3RhdGUuYWN0aXZlUGlja2VyQ2F0ZWdvcnlLZXldKSB7XHJcbiAgICAgICAgc3RhdGUuYWN0aXZlUGlja2VyQ2F0ZWdvcnlLZXkgPSBPYmplY3Qua2V5cyhTSVRFX0NBVEVHT1JJRVMpWzBdIHx8IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJlbmRlckdyb3Vwc1NlY3Rpb24oKTtcclxuICB9KTtcclxuICB3cmFwLmFwcGVuZENoaWxkKGJ1dHRvbik7XHJcblxyXG4gIGlmIChzdGF0ZS5vcGVuUGlja2VyR3JvdXBJZCA9PT0gZ3JvdXAuaWQpIHtcclxuICAgIHdyYXAuYXBwZW5kQ2hpbGQoY3JlYXRlSG92ZXJQaWNrZXIoZ3JvdXApKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB3cmFwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVIb3ZlclBpY2tlcihncm91cCkge1xyXG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBwYW5lbC5jbGFzc05hbWUgPSBcImhvdmVyLXBpY2tlci1wYW5lbCBpcy1vcGVuXCI7XHJcbiAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4gZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCkpO1xyXG4gIHBhbmVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsIGNsZWFyUGlja2VyQ2xvc2VUaW1lcik7XHJcbiAgcGFuZWwuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlbGVhdmVcIiwgc2NoZWR1bGVQaWNrZXJDbG9zZSk7XHJcblxyXG4gIE9iamVjdC5lbnRyaWVzKFNJVEVfQ0FURUdPUklFUykuZm9yRWFjaCgoW2tleSwgY2F0ZWdvcnldKSA9PiB7XHJcbiAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgcm93LmNsYXNzTmFtZSA9IFwiaG92ZXItcGlja2VyLXJvd1wiO1xyXG4gICAgY29uc3QgaXNBY3RpdmUgPSBzdGF0ZS5hY3RpdmVQaWNrZXJDYXRlZ29yeUtleSA9PT0ga2V5O1xyXG4gICAgaWYgKGlzQWN0aXZlKSB7XHJcbiAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKFwiaXMtYWN0aXZlXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGVudHJ5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGVudHJ5LmNsYXNzTmFtZSA9IFwiaG92ZXItcGlja2VyLWVudHJ5XCI7XHJcbiAgICBlbnRyeS50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGVudHJ5LmlubmVySFRNTCA9IGA8c3Bhbj4ke2VzY2FwZUh0bWwoY2F0ZWdvcnkubGFiZWwpfTwvc3Bhbj48c3BhbiBjbGFzcz1cImhvdmVyLXBpY2tlci1hcnJvd1wiPuKAujwvc3Bhbj5gO1xyXG4gICAgZW50cnkuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4ge1xyXG4gICAgICBjbGVhclBpY2tlckNsb3NlVGltZXIoKTtcclxuICAgICAgc2V0QWN0aXZlUGlja2VyQ2F0ZWdvcnkoa2V5KTtcclxuICAgIH0pO1xyXG4gICAgZW50cnkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgY2xlYXJQaWNrZXJDbG9zZVRpbWVyKCk7XHJcbiAgICAgIHNldEFjdGl2ZVBpY2tlckNhdGVnb3J5KGtleSk7XHJcbiAgICB9KTtcclxuICAgIHJvdy5hcHBlbmRDaGlsZChlbnRyeSk7XHJcblxyXG4gICAgY29uc3Qgc3VibWVudSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBzdWJtZW51LmNsYXNzTmFtZSA9IGBob3Zlci1waWNrZXItc3VibWVudSR7aXNBY3RpdmUgPyBcIiBpcy1vcGVuXCIgOiBcIlwifWA7XHJcbiAgICBzdWJtZW51LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsIGNsZWFyUGlja2VyQ2xvc2VUaW1lcik7XHJcbiAgICBzdWJtZW51LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsIHNjaGVkdWxlUGlja2VyQ2xvc2UpO1xyXG4gICAgY29uc3QgY2F0ZWdvcnlTaXRlcyA9IGdldENhdGVnb3J5U2l0ZXMoa2V5KTtcclxuXHJcbiAgICBpZiAoa2V5ID09PSBcImN1c3RvbVwiKSB7XHJcbiAgICAgIGlmICghY2F0ZWdvcnlTaXRlcy5sZW5ndGgpIHtcclxuICAgICAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgICAgZW1wdHkuY2xhc3NOYW1lID0gXCJob3Zlci1waWNrZXItZW1wdHlcIjtcclxuICAgICAgICBlbXB0eS5pbm5lckhUTUwgPSBtc2coXHJcbiAgICAgICAgICBcInNldHRpbmdzX2dyb3Vwc19jdXN0b21FbXB0eVwiLFxyXG4gICAgICAgICAgYOi/mOayoeacieiHquWumuS5ieermeeCuTxici8+PHNwYW4gY2xhc3M9XCJob3Zlci1waWNrZXItZW1wdHktaGludFwiPuWJjeW+gOW3puS+p+OAjOiHquWumuS5ieaQnOe0ouOAjea3u+WKoDwvc3Bhbj5gXHJcbiAgICAgICAgKTtcclxuICAgICAgICBzdWJtZW51LmFwcGVuZENoaWxkKGVtcHR5KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjYXRlZ29yeVNpdGVzLmZvckVhY2goKHNpdGUpID0+IHtcclxuICAgICAgICAgIHN1Ym1lbnUuYXBwZW5kQ2hpbGQoY3JlYXRlUGlja2VyU2l0ZU9wdGlvbihncm91cCwgc2l0ZSwga2V5KSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcImFpXCIpIHtcclxuICAgICAgc3VibWVudS5jbGFzc0xpc3QuYWRkKFwiaG92ZXItcGlja2VyLXN1Ym1lbnUtLWFpXCIpO1xyXG5cclxuICAgICAgY29uc3QgY29sdW1uc1dyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBjb2x1bW5zV3JhcC5jbGFzc05hbWUgPSBcImhvdmVyLXBpY2tlci1haS1jb2x1bW5zXCI7XHJcblxyXG4gICAgICBBSV9TSVRFX0dST1VQUy5mb3JFYWNoKChtYXJrZXRHcm91cCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGdyb3VwU2l0ZXMgPSBtYXJrZXRHcm91cC5zaXRlSWRzXHJcbiAgICAgICAgICAubWFwKChzaXRlSWQpID0+IGNhdGVnb3J5U2l0ZXMuZmluZCgoc2l0ZSkgPT4gc2l0ZS5pZCA9PT0gc2l0ZUlkKSlcclxuICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XHJcbiAgICAgICAgaWYgKCFncm91cFNpdGVzLmxlbmd0aCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBjb2wgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIGNvbC5jbGFzc05hbWUgPSBcImhvdmVyLXBpY2tlci1haS1jb2xcIjtcclxuXHJcbiAgICAgICAgY29uc3QgY29sVGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIGNvbFRpdGxlLmNsYXNzTmFtZSA9IFwiaG92ZXItcGlja2VyLXNpdGUtZ3JvdXAtdGl0bGVcIjtcclxuICAgICAgICBjb2xUaXRsZS50ZXh0Q29udGVudCA9IG1hcmtldEdyb3VwLmxhYmVsO1xyXG4gICAgICAgIGNvbC5hcHBlbmRDaGlsZChjb2xUaXRsZSk7XHJcblxyXG4gICAgICAgIGdyb3VwU2l0ZXMuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgICAgICAgY29sLmFwcGVuZENoaWxkKGNyZWF0ZVBpY2tlclNpdGVPcHRpb24oZ3JvdXAsIHNpdGUsIGtleSkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbHVtbnNXcmFwLmFwcGVuZENoaWxkKGNvbCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBzdWJtZW51LmFwcGVuZENoaWxkKGNvbHVtbnNXcmFwKTtcclxuXHJcbiAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJvdGhlclwiKSB7XHJcbiAgICAgIHN1Ym1lbnUuY2xhc3NMaXN0LmFkZChcImhvdmVyLXBpY2tlci1zdWJtZW51LS1haVwiKTtcclxuICAgICAgY29uc3QgdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgdGlwLmNsYXNzTmFtZSA9IFwiaG92ZXItcGlja2VyLXRpcFwiO1xyXG4gICAgICB0aXAudGV4dENvbnRlbnQgPSBtc2coXHJcbiAgICAgICAgXCJzZXR0aW5nc19ncm91cHNfb3RoZXJUaXBcIixcclxuICAgICAgICBcIuekvuWqkuW5s+WPsOabtOaOqOiNkOS9v+eUqOKAnOaWsOW8gOagh+etvuKAneaooeW8j++8m+WNoeeJh+WRiOeOsOeahOmihOiniOS4juaJk+W8gOS9k+mqjOWPr+iDveS4jeeos+WumuOAglwiXHJcbiAgICAgICk7XHJcbiAgICAgIHN1Ym1lbnUuYXBwZW5kQ2hpbGQodGlwKTtcclxuXHJcbiAgICAgIGNvbnN0IGNvbHVtbnNXcmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgY29sdW1uc1dyYXAuY2xhc3NOYW1lID0gXCJob3Zlci1waWNrZXItYWktY29sdW1uc1wiO1xyXG5cclxuICAgICAgU09DSUFMX1NJVEVfR1JPVVBTLmZvckVhY2goKG1hcmtldEdyb3VwKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZ3JvdXBTaXRlcyA9IG1hcmtldEdyb3VwLnNpdGVJZHNcclxuICAgICAgICAgIC5tYXAoKHNpdGVJZCkgPT4gY2F0ZWdvcnlTaXRlcy5maW5kKChzaXRlKSA9PiBzaXRlLmlkID09PSBzaXRlSWQpKVxyXG4gICAgICAgICAgLmZpbHRlcihCb29sZWFuKTtcclxuICAgICAgICBpZiAoIWdyb3VwU2l0ZXMubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgICAgY29sLmNsYXNzTmFtZSA9IFwiaG92ZXItcGlja2VyLWFpLWNvbFwiO1xyXG5cclxuICAgICAgICBjb25zdCBjb2xUaXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgICAgY29sVGl0bGUuY2xhc3NOYW1lID0gXCJob3Zlci1waWNrZXItc2l0ZS1ncm91cC10aXRsZVwiO1xyXG4gICAgICAgIGNvbFRpdGxlLnRleHRDb250ZW50ID0gbWFya2V0R3JvdXAubGFiZWw7XHJcbiAgICAgICAgY29sLmFwcGVuZENoaWxkKGNvbFRpdGxlKTtcclxuXHJcbiAgICAgICAgZ3JvdXBTaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICAgICAgICBjb2wuYXBwZW5kQ2hpbGQoY3JlYXRlUGlja2VyU2l0ZU9wdGlvbihncm91cCwgc2l0ZSwga2V5KSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29sdW1uc1dyYXAuYXBwZW5kQ2hpbGQoY29sKTtcclxuICAgICAgfSk7XHJcbiAgICAgIHN1Ym1lbnUuYXBwZW5kQ2hpbGQoY29sdW1uc1dyYXApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2F0ZWdvcnlTaXRlcy5mb3JFYWNoKChzaXRlKSA9PiB7XHJcbiAgICAgICAgc3VibWVudS5hcHBlbmRDaGlsZChjcmVhdGVQaWNrZXJTaXRlT3B0aW9uKGdyb3VwLCBzaXRlLCBrZXkpKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcm93LmFwcGVuZENoaWxkKHN1Ym1lbnUpO1xyXG4gICAgcGFuZWwuYXBwZW5kQ2hpbGQocm93KTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHBhbmVsO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2V0QWN0aXZlUGlja2VyQ2F0ZWdvcnkoY2F0ZWdvcnlLZXkpIHtcclxuICBpZiAoc3RhdGUuYWN0aXZlUGlja2VyQ2F0ZWdvcnlLZXkgPT09IGNhdGVnb3J5S2V5KSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIHN0YXRlLmFjdGl2ZVBpY2tlckNhdGVnb3J5S2V5ID0gY2F0ZWdvcnlLZXk7XHJcbiAgcmVuZGVyR3JvdXBzU2VjdGlvbigpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJQaWNrZXJDbG9zZVRpbWVyKCkge1xyXG4gIGlmIChzdGF0ZS5waWNrZXJDbG9zZVRpbWVySWQpIHtcclxuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQoc3RhdGUucGlja2VyQ2xvc2VUaW1lcklkKTtcclxuICAgIHN0YXRlLnBpY2tlckNsb3NlVGltZXJJZCA9IG51bGw7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2NoZWR1bGVQaWNrZXJDbG9zZSgpIHtcclxuICBjbGVhclBpY2tlckNsb3NlVGltZXIoKTtcclxuICBzdGF0ZS5waWNrZXJDbG9zZVRpbWVySWQgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICBjbG9zZVBpY2tlcigpO1xyXG4gICAgcmVuZGVyR3JvdXBzU2VjdGlvbigpO1xyXG4gIH0sIFBJQ0tFUl9DTE9TRV9ERUxBWV9NUyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjbG9zZVBpY2tlcigpIHtcclxuICBjbGVhclBpY2tlckNsb3NlVGltZXIoKTtcclxuICBzdGF0ZS5vcGVuUGlja2VyR3JvdXBJZCA9IG51bGw7XHJcbiAgc3RhdGUuYWN0aXZlUGlja2VyQ2F0ZWdvcnlLZXkgPSBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVQaWNrZXJTaXRlT3B0aW9uKGdyb3VwLCBzaXRlLCBjYXRlZ29yeUtleSkge1xyXG4gIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxhYmVsXCIpO1xyXG4gIGxhYmVsLmNsYXNzTmFtZSA9IFwiaG92ZXItcGlja2VyLW9wdGlvblwiO1xyXG4gIGNvbnN0IGNoZWNrZWQgPSBncm91cC5zaXRlSWRzLmluY2x1ZGVzKHNpdGUuaWQpO1xyXG4gIGxhYmVsLmlubmVySFRNTCA9IGBcclxuICAgIDxzcGFuIGNsYXNzPVwiaG92ZXItcGlja2VyLW9wdGlvbi10ZXh0XCI+JHtlc2NhcGVIdG1sKHNpdGUubmFtZSl9PC9zcGFuPlxyXG4gICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiICR7Y2hlY2tlZCA/IFwiY2hlY2tlZFwiIDogXCJcIn0gLz5cclxuICBgO1xyXG4gIGNvbnN0IGNoZWNrYm94ID0gbGFiZWwucXVlcnlTZWxlY3RvcihcImlucHV0XCIpO1xyXG4gIGNoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpKTtcclxuICBjaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcclxuICAgIGNvbnN0IGN1cnJlbnRHcm91cCA9IGdldEdyb3VwQnlJZChncm91cC5pZCk7XHJcbiAgICBpZiAoIWN1cnJlbnRHcm91cCkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoY2hlY2tib3guY2hlY2tlZCkge1xyXG4gICAgICBjdXJyZW50R3JvdXAuc2l0ZUlkcyA9IFsuLi5jdXJyZW50R3JvdXAuc2l0ZUlkcywgc2l0ZS5pZF07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjdXJyZW50R3JvdXAuc2l0ZUlkcyA9IGN1cnJlbnRHcm91cC5zaXRlSWRzLmZpbHRlcigoaWQpID0+IGlkICE9PSBzaXRlLmlkKTtcclxuICAgIH1cclxuICAgIGF3YWl0IHBlcnNpc3RBbGwoKTtcclxuICAgIHN0YXRlLm9wZW5QaWNrZXJHcm91cElkID0gY3VycmVudEdyb3VwLmlkO1xyXG4gICAgc3RhdGUuYWN0aXZlUGlja2VyQ2F0ZWdvcnlLZXkgPSBjYXRlZ29yeUtleTtcclxuICAgIGNsZWFyUGlja2VyQ2xvc2VUaW1lcigpO1xyXG4gICAgcmVuZGVyR3JvdXBzU2VjdGlvbigpO1xyXG4gIH0pO1xyXG4gIHJldHVybiBsYWJlbDtcclxufVxyXG4iLCAiaW1wb3J0IHtcclxuICBnZXRBbGxQcm9tcHRHcm91cE5hbWUsXHJcbiAgaXNBbGxQcm9tcHRHcm91cCxcclxufSBmcm9tIFwiLi4vLi4vLi4vc2hhcmVkL3Byb21wdC1ncm91cHMuanNcIjtcclxuaW1wb3J0IHsgc3RhdGUsIG1zZyB9IGZyb20gXCIuLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7IHBlcnNpc3RBbGwgfSBmcm9tIFwiLi4vc3RvcmUuanNcIjtcclxuXHJcbi8vIEZvcndhcmQgcmVmZXJlbmNlOiByZW5kZXJQcm9tcHRzU2VjdGlvbiBpcyByZWdpc3RlcmVkIG9uIHN0YXRlIGluIG1haW4uanMuXHJcbi8vIFdlIGNhbGwgc3RhdGUucmVuZGVyUHJvbXB0c1NlY3Rpb24oKSB0byBhdm9pZCBhIGNpcmN1bGFyIGltcG9ydCB3aXRoIHByb21wdHMuanMuXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2hvd1Byb21wdEhvdmVyQ2FyZChwcm9tcHQsIGdyb3VwLCBhbmNob3JCdG4pIHtcclxuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWhvdmVyLWNhcmRcIik7XHJcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcclxuICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBzdGF0ZS5faG92ZXJDYXJkS2V5SGFuZGxlcik7XHJcblxyXG4gIGNvbnN0IGNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGNhcmQuY2xhc3NOYW1lID0gXCJwcm9tcHQtaG92ZXItY2FyZFwiO1xyXG5cclxuICBmdW5jdGlvbiBjbG9zZUNhcmQoKSB7XHJcbiAgICBjYXJkLnJlbW92ZSgpO1xyXG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgc3RhdGUuX2hvdmVyQ2FyZEtleUhhbmRsZXIpO1xyXG4gIH1cclxuXHJcbiAgc3RhdGUuX2hvdmVyQ2FyZEtleUhhbmRsZXIgPSAoZXYpID0+IHtcclxuICAgIGlmIChldi5rZXkgPT09IFwiRXNjYXBlXCIpIGNsb3NlQ2FyZCgpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwicHJvbXB0LWhvdmVyLWNhcmQtaGVhZGVyXCI7XHJcblxyXG4gIGNvbnN0IGhlYWRlckFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGhlYWRlckFjdGlvbnMuY2xhc3NOYW1lID0gXCJwcm9tcHQtaG92ZXItY2FyZC1oZWFkZXItYWN0aW9uc1wiO1xyXG5cclxuICBjb25zdCBjb3B5QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBjb3B5QnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIGNvcHlCdG4uY2xhc3NOYW1lID0gXCJwcm9tcHQtaG92ZXItY2FyZC1jb3B5LWJ0blwiO1xyXG4gIGNvcHlCdG4udGV4dENvbnRlbnQgPSBtc2coXCJjb21tb25fY29weVwiLCBcIuWkjeWItlwiKTtcclxuICBjb3B5QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChwcm9tcHQuY29udGVudCB8fCBcIlwiKS50aGVuKCgpID0+IHtcclxuICAgICAgY29weUJ0bi50ZXh0Q29udGVudCA9IFwi4pyTIFwiICsgbXNnKFwiY29tbW9uX2NvcGllZFwiLCBcIuW3suWkjeWItlwiKTtcclxuICAgICAgY29weUJ0bi5jbGFzc0xpc3QuYWRkKFwiaXMtY29waWVkXCIpO1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICBjb3B5QnRuLnRleHRDb250ZW50ID0gbXNnKFwiY29tbW9uX2NvcHlcIiwgXCLlpI3liLZcIik7XHJcbiAgICAgICAgY29weUJ0bi5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtY29waWVkXCIpO1xyXG4gICAgICB9LCAxODAwKTtcclxuICAgIH0pLmNhdGNoKCgpID0+IHtcclxuICAgICAgY29uc3QgdGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGV4dGFyZWFcIik7XHJcbiAgICAgIHRhLnZhbHVlID0gcHJvbXB0LmNvbnRlbnQgfHwgXCJcIjtcclxuICAgICAgdGEuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246Zml4ZWQ7b3BhY2l0eTowXCI7XHJcbiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGEpO1xyXG4gICAgICB0YS5zZWxlY3QoKTtcclxuICAgICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoXCJjb3B5XCIpO1xyXG4gICAgICB0YS5yZW1vdmUoKTtcclxuICAgICAgY29weUJ0bi50ZXh0Q29udGVudCA9IFwi4pyTIFwiICsgbXNnKFwiY29tbW9uX2NvcGllZFwiLCBcIuW3suWkjeWItlwiKTtcclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGNvcHlCdG4udGV4dENvbnRlbnQgPSBtc2coXCJjb21tb25fY29weVwiLCBcIuWkjeWItlwiKTsgfSwgMTgwMCk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgZWRpdEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgZWRpdEJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBlZGl0QnRuLmNsYXNzTmFtZSA9IFwicHJvbXB0LWhvdmVyLWNhcmQtZWRpdC1idG5cIjtcclxuICBlZGl0QnRuLnRleHRDb250ZW50ID0gbXNnKFwiY29tbW9uX2VkaXRcIiwgXCLnvJbovpFcIik7XHJcbiAgZWRpdEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgY2xvc2VDYXJkKCk7XHJcbiAgICBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZSA9IHtcclxuICAgICAgbW9kZTogXCJlZGl0XCIsXHJcbiAgICAgIGdyb3VwSWQ6IGdyb3VwLmlkLFxyXG4gICAgICBwcm9tcHRJZDogcHJvbXB0LmlkLFxyXG4gICAgICB0aXRsZTogcHJvbXB0LnRpdGxlIHx8IFwiXCIsXHJcbiAgICAgIGNvbnRlbnQ6IHByb21wdC5jb250ZW50IHx8IFwiXCJcclxuICAgIH07XHJcbiAgICBzdGF0ZS5yZW5kZXJQcm9tcHRzU2VjdGlvbigpO1xyXG4gIH0pO1xyXG5cclxuICBoZWFkZXJBY3Rpb25zLmFwcGVuZENoaWxkKGNvcHlCdG4pO1xyXG4gIGhlYWRlckFjdGlvbnMuYXBwZW5kQ2hpbGQoZWRpdEJ0bik7XHJcblxyXG4gIGNvbnN0IGNsb3NlQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBjbG9zZUJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBjbG9zZUJ0bi5jbGFzc05hbWUgPSBcInByb21wdC1ob3Zlci1jYXJkLWNsb3NlLWJ0blwiO1xyXG4gIGNsb3NlQnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbXNnKFwiY29tbW9uX2Nsb3NlXCIsIFwi5YWz6ZetXCIpKTtcclxuICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBgPHN2ZyB3aWR0aD1cIjE2XCIgaGVpZ2h0PVwiMTZcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PGxpbmUgeDE9XCIxOFwiIHkxPVwiNlwiIHgyPVwiNlwiIHkyPVwiMThcIi8+PGxpbmUgeDE9XCI2XCIgeTE9XCI2XCIgeDI9XCIxOFwiIHkyPVwiMThcIi8+PC9zdmc+YDtcclxuICBjbG9zZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgY2xvc2VDYXJkKTtcclxuXHJcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGhlYWRlckFjdGlvbnMpO1xyXG4gIGhlYWRlci5hcHBlbmRDaGlsZChjbG9zZUJ0bik7XHJcblxyXG4gIC8vIOaPkOekuuivjeagh+mimOihjFxyXG4gIGNvbnN0IHRpdGxlUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZVJvdy5jbGFzc05hbWUgPSBcInByb21wdC1ob3Zlci1jYXJkLXRpdGxlXCI7XHJcbiAgdGl0bGVSb3cudGV4dENvbnRlbnQgPSBwcm9tcHQudGl0bGUgfHwgXCLmnKrlkb3lkI3mj5DnpLror41cIjtcclxuXHJcbiAgLy8g5o+Q56S66K+N5YaF5a65XHJcbiAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYm9keS5jbGFzc05hbWUgPSBcInByb21wdC1ob3Zlci1jYXJkLWJvZHlcIjtcclxuICBib2R5LnRleHRDb250ZW50ID0gcHJvbXB0LmNvbnRlbnQgfHwgXCLvvIjmmoLml6DlhoXlrrnvvIlcIjtcclxuXHJcbiAgY2FyZC5hcHBlbmRDaGlsZChoZWFkZXIpO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQodGl0bGVSb3cpO1xyXG4gIGNhcmQuYXBwZW5kQ2hpbGQoYm9keSk7XHJcblxyXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY2FyZCk7XHJcblxyXG4gIGNvbnN0IGNhcmRSZWN0ID0gY2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICBjb25zdCByb3cgPSBhbmNob3JCdG4uY2xvc2VzdChcIi5wcm9tcHQtY2FyZC1pdGVtXCIpO1xyXG4gIGNvbnN0IHRpdGxlRWwgPSByb3cgPyByb3cucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtY2FyZC10aXRsZVwiKSA6IG51bGw7XHJcbiAgY29uc3QgaWNvbnNFbCA9IHJvdyA/IHJvdy5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1jYXJkLWljb24tZ3JvdXBcIikgOiBudWxsO1xyXG5cclxuICBsZXQgbGVmdCwgdG9wO1xyXG4gIGlmICh0aXRsZUVsICYmIGljb25zRWwpIHtcclxuICAgIGNvbnN0IHRpdGxlUiA9IHRpdGxlRWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBpY29uc1IgPSBpY29uc0VsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3QgZ2FwTGVmdCA9IHRpdGxlUi5yaWdodDtcclxuICAgIGNvbnN0IGdhcFJpZ2h0ID0gaWNvbnNSLmxlZnQ7XHJcbiAgICBjb25zdCBnYXBXID0gZ2FwUmlnaHQgLSBnYXBMZWZ0O1xyXG5cclxuICAgIGlmIChjYXJkUmVjdC53aWR0aCA8PSBnYXBXKSB7XHJcbiAgICAgIGxlZnQgPSBnYXBMZWZ0ICsgKGdhcFcgLSBjYXJkUmVjdC53aWR0aCkgLyAyO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbGVmdCA9IGdhcFJpZ2h0IC0gY2FyZFJlY3Qud2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm93UiA9IHJvdy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIHRvcCA9IHJvd1IudG9wO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBjb25zdCByZWN0ID0gYW5jaG9yQnRuLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgbGVmdCA9IHJlY3QucmlnaHQgKyAxMDtcclxuICAgIHRvcCA9IHJlY3QudG9wIC0gMTA7XHJcbiAgfVxyXG4gIGlmIChsZWZ0ICsgY2FyZFJlY3Qud2lkdGggPiB3aW5kb3cuaW5uZXJXaWR0aCAtIDEyKSB7XHJcbiAgICBsZWZ0ID0gd2luZG93LmlubmVyV2lkdGggLSBjYXJkUmVjdC53aWR0aCAtIDEyO1xyXG4gIH1cclxuICBpZiAobGVmdCA8IDEyKSBsZWZ0ID0gMTI7XHJcbiAgaWYgKHRvcCArIGNhcmRSZWN0LmhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCAtIDEyKSB7XHJcbiAgICB0b3AgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSBjYXJkUmVjdC5oZWlnaHQgLSAxMjtcclxuICB9XHJcbiAgaWYgKHRvcCA8IDEyKSB0b3AgPSAxMjtcclxuICBjYXJkLnN0eWxlLmxlZnQgPSBsZWZ0ICsgXCJweFwiO1xyXG4gIGNhcmQuc3R5bGUudG9wID0gdG9wICsgXCJweFwiO1xyXG5cclxuICBsZXQgbGVhdmVUaW1lciA9IG51bGw7XHJcbiAgY29uc3Qgc3RhcnRMZWF2ZSA9ICgpID0+IHtcclxuICAgIGxlYXZlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGNsb3NlQ2FyZCgpLCAzMDApO1xyXG4gIH07XHJcbiAgY29uc3QgY2FuY2VsTGVhdmUgPSAoKSA9PiB7XHJcbiAgICBpZiAobGVhdmVUaW1lcikgeyBjbGVhclRpbWVvdXQobGVhdmVUaW1lcik7IGxlYXZlVGltZXIgPSBudWxsOyB9XHJcbiAgfTtcclxuICBjYXJkLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsIGNhbmNlbExlYXZlKTtcclxuICBjYXJkLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsIHN0YXJ0TGVhdmUpO1xyXG4gIGFuY2hvckJ0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCBzdGFydExlYXZlKTtcclxuICBhbmNob3JCdG4uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgY2FuY2VsTGVhdmUpO1xyXG5cclxuICBzZXRUaW1lb3V0KCgpID0+IGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIHN0YXRlLl9ob3ZlckNhcmRLZXlIYW5kbGVyKSwgMCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQcm9tcHRFZGl0b3JNb2RhbCgpIHtcclxuICBpZiAoIXN0YXRlLnByb21wdEVkaXRvclN0YXRlKSB7XHJcbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGVkaXRvclN0YXRlID0gc3RhdGUucHJvbXB0RWRpdG9yU3RhdGU7XHJcbiAgY29uc3QgZWRpdG9yR3JvdXAgPVxyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGdyb3VwKSA9PiBncm91cC5pZCA9PT0gZWRpdG9yU3RhdGUuZ3JvdXBJZCAmJiAhaXNBbGxQcm9tcHRHcm91cChncm91cCkpIHx8XHJcbiAgICBzdGF0ZS5wcm9tcHRHcm91cHMuZmluZCgoZ3JvdXApID0+ICFpc0FsbFByb21wdEdyb3VwKGdyb3VwKSkgfHxcclxuICAgIHN0YXRlLnByb21wdEdyb3Vwc1swXTtcclxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwicHJvbXB0LWVkaXRvci1vdmVybGF5XCI7XHJcblxyXG4gIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBtb2RhbC5jbGFzc05hbWUgPSBcInByb21wdC1lZGl0b3ItbW9kYWxcIjtcclxuICBtb2RhbC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWVkaXRvci10aXRsZVwiPiR7ZWRpdG9yU3RhdGUubW9kZSA9PT0gXCJlZGl0XCIgPyBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2VkaXRQcm9tcHRUaXRsZVwiLCBcIue8lui+keaPkOekuuivjVwiKSA6IG1zZyhcInNldHRpbmdzX3Byb21wdHNfYWRkUHJvbXB0VGl0bGVcIiwgXCLmt7vliqDmj5DnpLror41cIil9PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWVkaXRvci1maWVsZFwiPlxyXG4gICAgICA8bGFiZWwgY2xhc3M9XCJmaWVsZC1sYWJlbFwiPiR7bXNnKFwic2V0dGluZ3NfcHJvbXB0c19maWVsZE5hbWVcIiwgXCLlkI3np7BcIil9PC9sYWJlbD5cclxuICAgICAgPGlucHV0IGNsYXNzPVwicHJvbXB0LWVkaXRvci10aXRsZS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwoZWRpdG9yU3RhdGUudGl0bGUgfHwgXCJcIil9XCIgcGxhY2Vob2xkZXI9XCIke21zZyhcInNldHRpbmdzX3Byb21wdHNfcHJvbXB0TmFtZVBsYWNlaG9sZGVyXCIsIFwi6K+36L6T5YWl5o+Q56S66K+N5ZCN56ewXCIpfVwiIC8+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJwcm9tcHQtZWRpdG9yLWZpZWxkXCI+XHJcbiAgICAgIDxsYWJlbCBjbGFzcz1cImZpZWxkLWxhYmVsXCI+JHttc2coXCJzZXR0aW5nc19wcm9tcHRzX2ZpZWxkR3JvdXBcIiwgXCLliIbnsbtcIil9PC9sYWJlbD5cclxuICAgICAgPHNlbGVjdCBjbGFzcz1cInByb21wdC1lZGl0b3ItZ3JvdXAtc2VsZWN0XCI+XHJcbiAgICAgICAgJHtzdGF0ZS5wcm9tcHRHcm91cHMuZmlsdGVyKChncm91cCkgPT4gIWlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApKS5tYXAoKGdyb3VwKSA9PiBgPG9wdGlvbiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbChncm91cC5pZCl9XCIgJHtncm91cC5pZCA9PT0gZWRpdG9yR3JvdXAuaWQgPyBcInNlbGVjdGVkXCIgOiBcIlwifT4ke2VzY2FwZUh0bWwoZ3JvdXAubmFtZSl9PC9vcHRpb24+YCkuam9pbihcIlwiKX1cclxuICAgICAgICA8b3B0aW9uIHZhbHVlPVwiX19uZXdfZ3JvdXBfX1wiPiR7bXNnKFwic2V0dGluZ3NfcHJvbXB0c19uZXdHcm91cE9wdGlvblwiLCBcIu+8iyDmlrDlu7rliIbnu4TigKZcIil9PC9vcHRpb24+XHJcbiAgICAgIDwvc2VsZWN0PlxyXG4gICAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LW5ldy1ncm91cC1yb3dcIiBoaWRkZW4+XHJcbiAgICAgICAgPGlucHV0IGNsYXNzPVwicHJvbXB0LW5ldy1ncm91cC1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgcGxhY2Vob2xkZXI9XCIke21zZyhcInNldHRpbmdzX3Byb21wdHNfbmV3R3JvdXBQbGFjZWhvbGRlclwiLCBcIui+k+WFpeaWsOWIhue7hOWQjeensO+8jOaMiSBFbnRlciDnoa7orqRcIil9XCIgLz5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwicHJvbXB0LW5ldy1ncm91cC1jb25maXJtLWJ0blwiIHR5cGU9XCJidXR0b25cIj4ke21zZyhcImNvbW1vbl9jcmVhdGVcIiwgXCLliJvlu7pcIil9PC9idXR0b24+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWVkaXRvci1maWVsZFwiPlxyXG4gICAgICA8bGFiZWwgY2xhc3M9XCJmaWVsZC1sYWJlbFwiPiR7bXNnKFwic2V0dGluZ3NfcHJvbXB0c19maWVsZENvbnRlbnRcIiwgXCLmj5DnpLror43lhoXlrrlcIil9PC9sYWJlbD5cclxuICAgICAgPHRleHRhcmVhIGNsYXNzPVwicHJvbXB0LWVkaXRvci1jb250ZW50LWlucHV0XCI+JHtlc2NhcGVIdG1sKGVkaXRvclN0YXRlLmNvbnRlbnQgfHwgXCJcIil9PC90ZXh0YXJlYT5cclxuICAgIDwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cInByb21wdC1lZGl0b3ItYWN0aW9uc1wiPlxyXG4gICAgICAke2VkaXRvclN0YXRlLm1vZGUgPT09IFwiZWRpdFwiID8gYDxidXR0b24gY2xhc3M9XCJwcm9tcHQtZWRpdG9yLWRlbGV0ZS1idG5cIiB0eXBlPVwiYnV0dG9uXCI+JHttc2coXCJjb21tb25fZGVsZXRlXCIsIFwi5Yig6ZmkXCIpfTwvYnV0dG9uPmAgOiBcIjxzcGFuPjwvc3Bhbj5cIn1cclxuICAgICAgPGRpdiBjbGFzcz1cInByb21wdC1lZGl0b3ItbWFpbi1hY3Rpb25zXCI+XHJcbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInByb21wdC1lZGl0b3ItY2FuY2VsLWJ0blwiIHR5cGU9XCJidXR0b25cIj4ke21zZyhcImNvbW1vbl9jYW5jZWxcIiwgXCLlj5bmtohcIil9PC9idXR0b24+XHJcbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInByb21wdC1lZGl0b3Itc2F2ZS1idG5cIiB0eXBlPVwiYnV0dG9uXCI+JHttc2coXCJjb21tb25fc2F2ZVwiLCBcIuS/neWtmFwiKX08L2J1dHRvbj5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICBgO1xyXG5cclxuICBjb25zdCB0aXRsZUlucHV0ID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdG9yLXRpdGxlLWlucHV0XCIpO1xyXG4gIGNvbnN0IGdyb3VwU2VsZWN0ID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdG9yLWdyb3VwLXNlbGVjdFwiKTtcclxuICBjb25zdCBuZXdHcm91cFJvdyA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LW5ldy1ncm91cC1yb3dcIik7XHJcbiAgY29uc3QgbmV3R3JvdXBJbnB1dCA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LW5ldy1ncm91cC1pbnB1dFwiKTtcclxuICBjb25zdCBuZXdHcm91cENvbmZpcm1CdG4gPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1uZXctZ3JvdXAtY29uZmlybS1idG5cIik7XHJcbiAgY29uc3QgY29udGVudElucHV0ID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdG9yLWNvbnRlbnQtaW5wdXRcIik7XHJcbiAgY29uc3QgY2FuY2VsQnRuID0gbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wcm9tcHQtZWRpdG9yLWNhbmNlbC1idG5cIik7XHJcbiAgY29uc3Qgc2F2ZUJ0biA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWVkaXRvci1zYXZlLWJ0blwiKTtcclxuXHJcbiAgZnVuY3Rpb24gc2hvd05ld0dyb3VwUm93KCkge1xyXG4gICAgaWYgKG5ld0dyb3VwUm93KSBuZXdHcm91cFJvdy5oaWRkZW4gPSBmYWxzZTtcclxuICAgIGlmIChuZXdHcm91cElucHV0KSBuZXdHcm91cElucHV0LmZvY3VzKCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBoaWRlTmV3R3JvdXBSb3coKSB7XHJcbiAgICBpZiAobmV3R3JvdXBSb3cpIG5ld0dyb3VwUm93LmhpZGRlbiA9IHRydWU7XHJcbiAgICBpZiAobmV3R3JvdXBJbnB1dCkgbmV3R3JvdXBJbnB1dC52YWx1ZSA9IFwiXCI7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb25maXJtTmV3R3JvdXAoKSB7XHJcbiAgICBjb25zdCBuYW1lID0gKG5ld0dyb3VwSW5wdXQgPyBuZXdHcm91cElucHV0LnZhbHVlIDogXCJcIikudHJpbSgpO1xyXG4gICAgaWYgKCFuYW1lKSByZXR1cm47XHJcbiAgICBjb25zdCBuZXdHcm91cCA9IHtcclxuICAgICAgaWQ6IGBwcm9tcHQtZ3JvdXAtJHtEYXRlLm5vdygpfWAsXHJcbiAgICAgIG5hbWUsXHJcbiAgICAgIHByb21wdHM6IFtdXHJcbiAgICB9O1xyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLnB1c2gobmV3R3JvdXApO1xyXG4gICAgY29uc3Qgb3B0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcIm9wdGlvblwiKTtcclxuICAgIG9wdC52YWx1ZSA9IG5ld0dyb3VwLmlkO1xyXG4gICAgb3B0LnRleHRDb250ZW50ID0gbmFtZTtcclxuICAgIGNvbnN0IG5ld0dyb3VwT3B0ID0gZ3JvdXBTZWxlY3QgPyBncm91cFNlbGVjdC5xdWVyeVNlbGVjdG9yKCdvcHRpb25bdmFsdWU9XCJfX25ld19ncm91cF9fXCJdJykgOiBudWxsO1xyXG4gICAgaWYgKGdyb3VwU2VsZWN0KSBncm91cFNlbGVjdC5pbnNlcnRCZWZvcmUob3B0LCBuZXdHcm91cE9wdCk7XHJcbiAgICBpZiAoZ3JvdXBTZWxlY3QpIGdyb3VwU2VsZWN0LnZhbHVlID0gbmV3R3JvdXAuaWQ7XHJcbiAgICBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS5ncm91cElkID0gbmV3R3JvdXAuaWQ7XHJcbiAgICBoaWRlTmV3R3JvdXBSb3coKTtcclxuICB9XHJcblxyXG4gIGlmICh0aXRsZUlucHV0KSB7XHJcbiAgICB0aXRsZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgbmV4dFZhbHVlID0gZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCA/IGV2ZW50LnRhcmdldC52YWx1ZSA6IFwiXCI7XHJcbiAgICAgIHN0YXRlLnByb21wdEVkaXRvclN0YXRlLnRpdGxlID0gbmV4dFZhbHVlO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGlmIChncm91cFNlbGVjdCkge1xyXG4gICAgZ3JvdXBTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgY29uc3QgbmV4dFZhbHVlID0gZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgSFRNTFNlbGVjdEVsZW1lbnQgPyBldmVudC50YXJnZXQudmFsdWUgOiBlZGl0b3JTdGF0ZS5ncm91cElkO1xyXG4gICAgICBpZiAobmV4dFZhbHVlID09PSBcIl9fbmV3X2dyb3VwX19cIikge1xyXG4gICAgICAgIHNob3dOZXdHcm91cFJvdygpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGhpZGVOZXdHcm91cFJvdygpO1xyXG4gICAgICAgIHN0YXRlLnByb21wdEVkaXRvclN0YXRlLmdyb3VwSWQgPSBuZXh0VmFsdWU7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuICBpZiAobmV3R3JvdXBDb25maXJtQnRuKSB7XHJcbiAgICBuZXdHcm91cENvbmZpcm1CdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNvbmZpcm1OZXdHcm91cCk7XHJcbiAgfVxyXG4gIGlmIChuZXdHcm91cElucHV0KSB7XHJcbiAgICBuZXdHcm91cElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChldikgPT4ge1xyXG4gICAgICBpZiAoZXYua2V5ID09PSBcIkVudGVyXCIpIHsgZXYucHJldmVudERlZmF1bHQoKTsgY29uZmlybU5ld0dyb3VwKCk7IH1cclxuICAgICAgaWYgKGV2LmtleSA9PT0gXCJFc2NhcGVcIikge1xyXG4gICAgICAgIGhpZGVOZXdHcm91cFJvdygpO1xyXG4gICAgICAgIGlmIChncm91cFNlbGVjdCkgZ3JvdXBTZWxlY3QudmFsdWUgPSBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS5ncm91cElkIHx8IChzdGF0ZS5wcm9tcHRHcm91cHNbMF0gPyBzdGF0ZS5wcm9tcHRHcm91cHNbMF0uaWQgOiBcIlwiKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGlmIChjb250ZW50SW5wdXQpIHtcclxuICAgIGNvbnRlbnRJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIGNvbnN0IG5leHRWYWx1ZSA9IGV2ZW50LnRhcmdldCBpbnN0YW5jZW9mIEhUTUxUZXh0QXJlYUVsZW1lbnQgPyBldmVudC50YXJnZXQudmFsdWUgOiBcIlwiO1xyXG4gICAgICBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS5jb250ZW50ID0gbmV4dFZhbHVlO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoY2FuY2VsQnRuKSB7XHJcbiAgICBjYW5jZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgc3RhdGUucHJvbXB0RWRpdG9yU3RhdGUgPSBudWxsO1xyXG4gICAgICBzdGF0ZS5yZW5kZXJQcm9tcHRzU2VjdGlvbigpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoc2F2ZUJ0bikge1xyXG4gICAgc2F2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCB0YXJnZXRHcm91cCA9IHN0YXRlLnByb21wdEdyb3Vwcy5maW5kKChncm91cCkgPT4gZ3JvdXAuaWQgPT09IHN0YXRlLnByb21wdEVkaXRvclN0YXRlLmdyb3VwSWQpO1xyXG4gICAgICBpZiAoIXRhcmdldEdyb3VwKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgb3JpZ2luYWxHcm91cCA9IG51bGw7XHJcbiAgICAgIGxldCBvcmlnaW5hbEluZGV4ID0gLTE7XHJcbiAgICAgIGlmIChzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS5tb2RlID09PSBcImVkaXRcIikge1xyXG4gICAgICAgIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgcHJvbXB0SW5kZXggPSBncm91cC5wcm9tcHRzLmZpbmRJbmRleCgocHJvbXB0KSA9PiBwcm9tcHQuaWQgPT09IHN0YXRlLnByb21wdEVkaXRvclN0YXRlLnByb21wdElkKTtcclxuICAgICAgICAgIGlmIChwcm9tcHRJbmRleCA+PSAwKSB7XHJcbiAgICAgICAgICAgIG9yaWdpbmFsR3JvdXAgPSBncm91cDtcclxuICAgICAgICAgICAgb3JpZ2luYWxJbmRleCA9IHByb21wdEluZGV4O1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZ3JvdXAucHJvbXB0cyA9IGdyb3VwLnByb21wdHMuZmlsdGVyKChwcm9tcHQpID0+IHByb21wdC5pZCAhPT0gc3RhdGUucHJvbXB0RWRpdG9yU3RhdGUucHJvbXB0SWQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBuZXh0UHJvbXB0ID0ge1xyXG4gICAgICAgIGlkOiBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS5wcm9tcHRJZCB8fCBgcHJvbXB0LSR7RGF0ZS5ub3coKX1gLFxyXG4gICAgICAgIHRpdGxlOiBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS50aXRsZSB8fCBtc2coXCJvdmVybGF5X3VubmFtZWRQcm9tcHRcIiwgXCLmnKrlkb3lkI3mj5DnpLror41cIiksXHJcbiAgICAgICAgY29udGVudDogc3RhdGUucHJvbXB0RWRpdG9yU3RhdGUuY29udGVudCB8fCBcIlwiXHJcbiAgICAgIH07XHJcbiAgICAgIGlmIChzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZS5tb2RlID09PSBcImVkaXRcIiAmJiBvcmlnaW5hbEdyb3VwID09PSB0YXJnZXRHcm91cCAmJiBvcmlnaW5hbEluZGV4ID49IDApIHtcclxuICAgICAgICB0YXJnZXRHcm91cC5wcm9tcHRzLnNwbGljZShNYXRoLm1pbihvcmlnaW5hbEluZGV4LCB0YXJnZXRHcm91cC5wcm9tcHRzLmxlbmd0aCksIDAsIG5leHRQcm9tcHQpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRhcmdldEdyb3VwLnByb21wdHMudW5zaGlmdChuZXh0UHJvbXB0KTtcclxuICAgICAgfVxyXG4gICAgICBzdGF0ZS5hY3RpdmVQcm9tcHRHcm91cElkID0gdGFyZ2V0R3JvdXAuaWQ7XHJcbiAgICAgIHN0YXRlLnByb21wdEVkaXRvclN0YXRlID0gbnVsbDtcclxuICAgICAgYXdhaXQgcGVyc2lzdEFsbCgpO1xyXG4gICAgICBzdGF0ZS5yZW5kZXJQcm9tcHRzU2VjdGlvbigpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBkZWxldGVCdG4gPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1lZGl0b3ItZGVsZXRlLWJ0blwiKTtcclxuICBpZiAoZGVsZXRlQnRuKSB7XHJcbiAgICBkZWxldGVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgc2hvd1Byb21wdERlbGV0ZUNvbmZpcm0oYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgICAgICAgZ3JvdXAucHJvbXB0cyA9IGdyb3VwLnByb21wdHMuZmlsdGVyKChwcm9tcHQpID0+IHByb21wdC5pZCAhPT0gc3RhdGUucHJvbXB0RWRpdG9yU3RhdGUucHJvbXB0SWQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHN0YXRlLnByb21wdEVkaXRvclN0YXRlID0gbnVsbDtcclxuICAgICAgICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgICAgICAgc3RhdGUucmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xyXG4gICAgaWYgKGV2ZW50LnRhcmdldCA9PT0gb3ZlcmxheSkge1xyXG4gICAgICBzdGF0ZS5wcm9tcHRFZGl0b3JTdGF0ZSA9IG51bGw7XHJcbiAgICAgIHN0YXRlLnJlbmRlclByb21wdHNTZWN0aW9uKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIG92ZXJsYXkuYXBwZW5kQ2hpbGQobW9kYWwpO1xyXG4gIHJldHVybiBvdmVybGF5O1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG93UHJvbXB0RGVsZXRlQ29uZmlybShvbkNvbmZpcm0pIHtcclxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLnByb21wdC1kZWxldGUtY29uZmlybS1vdmVybGF5XCIpPy5yZW1vdmUoKTtcclxuXHJcbiAgY29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgb3ZlcmxheS5jbGFzc05hbWUgPSBcInByb21wdC1kZWxldGUtY29uZmlybS1vdmVybGF5XCI7XHJcbiAgb3ZlcmxheS5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWRlbGV0ZS1jb25maXJtLWRpYWxvZ1wiIHJvbGU9XCJkaWFsb2dcIiBhcmlhLW1vZGFsPVwidHJ1ZVwiPlxyXG4gICAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWRlbGV0ZS1jb25maXJtLXRpdGxlXCI+JHttc2coXCJzZXR0aW5nc19wcm9tcHRzX2RlbGV0ZVByb21wdFRpdGxlXCIsIFwi5Yig6Zmk5o+Q56S66K+NXCIpfTwvZGl2PlxyXG4gICAgICA8ZGl2IGNsYXNzPVwicHJvbXB0LWRlbGV0ZS1jb25maXJtLW1lc3NhZ2VcIj4ke21zZyhcInNldHRpbmdzX3Byb21wdHNfZGVsZXRlUHJvbXB0Q29uZmlybVwiLCBcIuaYr+WQpuimgeWIoOmZpOivpeaPkOekuuivje+8n1wiKX08L2Rpdj5cclxuICAgICAgPGRpdiBjbGFzcz1cInByb21wdC1kZWxldGUtY29uZmlybS1hY3Rpb25zXCI+XHJcbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInByb21wdC1kZWxldGUtY29uZmlybS1jYW5jZWxcIiB0eXBlPVwiYnV0dG9uXCI+JHttc2coXCJjb21tb25fY2FuY2VsXCIsIFwi5Y+W5raIXCIpfTwvYnV0dG9uPlxyXG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJwcm9tcHQtZGVsZXRlLWNvbmZpcm0tc3VibWl0XCIgdHlwZT1cImJ1dHRvblwiPiR7bXNnKFwiY29tbW9uX2RlbGV0ZVwiLCBcIuWIoOmZpFwiKX08L2J1dHRvbj5cclxuICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICBgO1xyXG5cclxuICBjb25zdCBjbG9zZSA9ICgpID0+IHtcclxuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIGhhbmRsZUtleWRvd24pO1xyXG4gICAgb3ZlcmxheS5yZW1vdmUoKTtcclxuICB9O1xyXG4gIGNvbnN0IGhhbmRsZUtleWRvd24gPSAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC5rZXkgPT09IFwiRXNjYXBlXCIpIHtcclxuICAgICAgY2xvc2UoKTtcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC50YXJnZXQgPT09IG92ZXJsYXkpIHtcclxuICAgICAgY2xvc2UoKTtcclxuICAgIH1cclxuICB9KTtcclxuICBvdmVybGF5LnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWRlbGV0ZS1jb25maXJtLWNhbmNlbFwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsb3NlKTtcclxuICBvdmVybGF5LnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWRlbGV0ZS1jb25maXJtLXN1Ym1pdFwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IG9uQ29uZmlybSgpO1xyXG4gICAgY2xvc2UoKTtcclxuICB9KTtcclxuXHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgaGFuZGxlS2V5ZG93bik7XHJcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvdmVybGF5KTtcclxuICBvdmVybGF5LnF1ZXJ5U2VsZWN0b3IoXCIucHJvbXB0LWRlbGV0ZS1jb25maXJtLXN1Ym1pdFwiKT8uZm9jdXMoKTtcclxufVxyXG4iLCAiaW1wb3J0IHsgREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQgfSBmcm9tIFwiLi4vLi4vLi4vc2hhcmVkL3N0b3JhZ2Uta2V5cy5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIGdldEFsbFByb21wdEdyb3VwTmFtZSxcclxuICBpc0FsbFByb21wdEdyb3VwLFxyXG59IGZyb20gXCIuLi8uLi8uLi9zaGFyZWQvcHJvbXB0LWdyb3Vwcy5qc1wiO1xyXG5pbXBvcnQgeyBzdGF0ZSwgbXNnIH0gZnJvbSBcIi4uL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vdXRpbHMuanNcIjtcclxuaW1wb3J0IHtcclxuICBwZXJzaXN0QWxsLFxyXG4gIGNyZWF0ZU5vcm1hbGl6ZWRQcm9tcHRHcm91cHMsXHJcbiAgZ2V0RGlzcGxheVByb21wdEVudHJpZXMsXHJcbn0gZnJvbSBcIi4uL3N0b3JlLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgYXR0YWNoUHJvbXB0R3JvdXBEcmFnLFxyXG4gIGF0dGFjaFByb21wdEl0ZW1EcmFnLFxyXG4gIGF0dGFjaFByb21wdEl0ZW1EcmFnQWxsLFxyXG59IGZyb20gXCIuLi9kcmFnLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgc2hvd1Byb21wdEhvdmVyQ2FyZCxcclxuICBjcmVhdGVQcm9tcHRFZGl0b3JNb2RhbCxcclxufSBmcm9tIFwiLi9wcm9tcHRzLWVkaXRvci5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclByb21wdHNTZWN0aW9uKCkge1xyXG4gIGNvbnN0IHsgcHJvbXB0c1NlY3Rpb24gfSA9IHN0YXRlLmRvbTtcclxuICBwcm9tcHRzU2VjdGlvbi5pbm5lckhUTUwgPSBcIlwiO1xyXG4gIGlmICghc3RhdGUucHJvbXB0R3JvdXBzLmxlbmd0aCkge1xyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzID0gY3JlYXRlTm9ybWFsaXplZFByb21wdEdyb3VwcyhbXSk7XHJcbiAgfVxyXG4gIGlmICghc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCB8fCAhc3RhdGUucHJvbXB0R3JvdXBzLnNvbWUoKGdyb3VwKSA9PiBncm91cC5pZCA9PT0gc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCkpIHtcclxuICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBzdGF0ZS5wcm9tcHRHcm91cHNbMF0/LmlkIHx8IG51bGw7XHJcbiAgfVxyXG5cclxuICBjb25zdCBhY3RpdmVHcm91cCA9IHN0YXRlLnByb21wdEdyb3Vwcy5maW5kKChncm91cCkgPT4gZ3JvdXAuaWQgPT09IHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQpIHx8IHN0YXRlLnByb21wdEdyb3Vwc1swXTtcclxuICBpZiAoIWFjdGl2ZUdyb3VwKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBzaGVsbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIHNoZWxsLmNsYXNzTmFtZSA9IFwicHJvbXB0LXNldHRpbmdzLXNoZWxsXCI7XHJcbiAgc2hlbGwuYXBwZW5kQ2hpbGQoY3JlYXRlUHJvbXB0R3JvdXBTaWRlYmFyKGFjdGl2ZUdyb3VwKSk7XHJcbiAgc2hlbGwuYXBwZW5kQ2hpbGQoY3JlYXRlUHJvbXB0Q29udGVudFBhbmVsKGFjdGl2ZUdyb3VwKSk7XHJcbiAgcHJvbXB0c1NlY3Rpb24uYXBwZW5kQ2hpbGQoc2hlbGwpO1xyXG5cclxuICBpZiAoc3RhdGUucHJvbXB0RWRpdG9yU3RhdGUpIHtcclxuICAgIHByb21wdHNTZWN0aW9uLmFwcGVuZENoaWxkKGNyZWF0ZVByb21wdEVkaXRvck1vZGFsKCkpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlUHJvbXB0R3JvdXBTaWRlYmFyKGFjdGl2ZUdyb3VwKSB7XHJcbiAgY29uc3QgYXNpZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYXNpZGVcIik7XHJcbiAgYXNpZGUuY2xhc3NOYW1lID0gXCJwcm9tcHQtZ3JvdXBzLXNpZGViYXJcIjtcclxuXHJcbiAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgbGlzdC5jbGFzc05hbWUgPSBcInByb21wdC1ncm91cHMtbGlzdFwiO1xyXG4gIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgbGlzdC5hcHBlbmRDaGlsZChjcmVhdGVQcm9tcHRHcm91cEl0ZW0oZ3JvdXAsIGFjdGl2ZUdyb3VwKSk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGFkZEJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgYWRkQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIGFkZEJ0bi5jbGFzc05hbWUgPSBcInByb21wdC1zaWRlYmFyLWFkZC1idG5cIjtcclxuICBhZGRCdG4udGV4dENvbnRlbnQgPSBcIisgXCIgKyBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2FkZEdyb3VwXCIsIFwi5re75Yqg5YiG57uEXCIpO1xyXG4gIGFkZEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgY29uc3QgbmV3R3JvdXAgPSB7XHJcbiAgICAgIGlkOiBgcHJvbXB0LWdyb3VwLSR7RGF0ZS5ub3coKX1gLFxyXG4gICAgICBuYW1lOiBcIlwiLFxyXG4gICAgICBwcm9tcHRzOiBbXVxyXG4gICAgfTtcclxuICAgIHN0YXRlLnByb21wdEdyb3Vwcy5wdXNoKG5ld0dyb3VwKTtcclxuICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBuZXdHcm91cC5pZDtcclxuICAgIHN0YXRlLnJlbmFtaW5nUHJvbXB0R3JvdXBJZCA9IG5ld0dyb3VwLmlkO1xyXG4gICAgc3RhdGUucGVuZGluZ1Byb21wdEdyb3VwRm9jdXNJZCA9IG5ld0dyb3VwLmlkO1xyXG4gICAgcmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxuICB9KTtcclxuXHJcbiAgY29uc3QgYWRkQnRuV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYWRkQnRuV3JhcC5jbGFzc05hbWUgPSBcInByb21wdC1zaWRlYmFyLWFkZC13cmFwXCI7XHJcbiAgYWRkQnRuV3JhcC5hcHBlbmRDaGlsZChhZGRCdG4pO1xyXG5cclxuICBhc2lkZS5hcHBlbmRDaGlsZChsaXN0KTtcclxuICBhc2lkZS5hcHBlbmRDaGlsZChhZGRCdG5XcmFwKTtcclxuXHJcbiAgYXR0YWNoUHJvbXB0R3JvdXBEcmFnKGxpc3QpO1xyXG4gIHJldHVybiBhc2lkZTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlUHJvbXB0R3JvdXBJdGVtKGdyb3VwLCBhY3RpdmVHcm91cCkge1xyXG4gIGNvbnN0IGlzQWN0aXZlID0gZ3JvdXAuaWQgPT09IGFjdGl2ZUdyb3VwLmlkO1xyXG4gIGNvbnN0IGlzQWxsID0gaXNBbGxQcm9tcHRHcm91cChncm91cCk7XHJcbiAgY29uc3QgaXNSZW5hbWluZyA9ICFpc0FsbCAmJiBzdGF0ZS5yZW5hbWluZ1Byb21wdEdyb3VwSWQgPT09IGdyb3VwLmlkO1xyXG4gIGNvbnN0IGlzTG9ja2VkID0gaXNBbGw7XHJcbiAgY29uc3QgZGlzcGxheU5hbWUgPSBpc0FsbCA/IGdldEFsbFByb21wdEdyb3VwTmFtZSgpIDogZ3JvdXAubmFtZTtcclxuXHJcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICByb3cuY2xhc3NOYW1lID0gYHByb21wdC1ncm91cC1uYXYtaXRlbSR7aXNBY3RpdmUgPyBcIiBpcy1hY3RpdmVcIiA6IFwiXCJ9JHshZGlzcGxheU5hbWUudHJpbSgpICYmICFpc1JlbmFtaW5nID8gXCIgaXMtZW1wdHlcIiA6IFwiXCJ9JHtpc1JlbmFtaW5nID8gXCIgaXMtcmVuYW1pbmdcIiA6IFwiXCJ9JHtpc0FsbCA/IFwiIGlzLWxvY2tlZFwiIDogXCJcIn1gO1xyXG4gIHJvdy5kYXRhc2V0Lmdyb3VwSWQgPSBncm91cC5pZDtcclxuXHJcbiAgaWYgKGlzUmVuYW1pbmcpIHtcclxuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xyXG4gICAgaW5wdXQuY2xhc3NOYW1lID0gXCJwcm9tcHQtZ3JvdXAtbmF2LWlucHV0XCI7XHJcbiAgICBpbnB1dC50eXBlID0gXCJ0ZXh0XCI7XHJcbiAgICBpbnB1dC52YWx1ZSA9IGdyb3VwLm5hbWU7XHJcbiAgICBpbnB1dC5wbGFjZWhvbGRlciA9IG1zZyhcInNldHRpbmdzX3Byb21wdHNfZ3JvdXBQbGFjZWhvbGRlclwiLCBcIuivt+i+k+WFpeWIhue7hOWQjeensFwiKTtcclxuXHJcbiAgICBsZXQgY29tbWl0dGVkID0gZmFsc2U7XHJcbiAgICBjb25zdCBjb21taXQgPSBhc3luYyAoKSA9PiB7XHJcbiAgICAgIGlmIChjb21taXR0ZWQpIHJldHVybjtcclxuICAgICAgY29tbWl0dGVkID0gdHJ1ZTtcclxuICAgICAgY29uc3QgbmV4dE5hbWUgPSBpbnB1dC52YWx1ZS50cmltKCk7XHJcbiAgICAgIGdyb3VwLm5hbWUgPSBuZXh0TmFtZSB8fCBtc2coXCJzZXR0aW5nc19wcm9tcHRzX25ld0dyb3VwTmFtZVwiLCBcIuaWsOW7uuWIhue7hFwiKTtcclxuICAgICAgaWYgKHN0YXRlLnJlbmFtaW5nUHJvbXB0R3JvdXBJZCA9PT0gZ3JvdXAuaWQpIHtcclxuICAgICAgICBzdGF0ZS5yZW5hbWluZ1Byb21wdEdyb3VwSWQgPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICAgIGF3YWl0IHBlcnNpc3RBbGwoKTtcclxuICAgICAgcmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxuICAgIH07XHJcblxyXG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGV2KSA9PiB7XHJcbiAgICAgIGlmIChldi5rZXkgPT09IFwiRW50ZXJcIikge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgaW5wdXQuYmx1cigpO1xyXG4gICAgICB9IGVsc2UgaWYgKGV2LmtleSA9PT0gXCJFc2NhcGVcIikge1xyXG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgY29tbWl0dGVkID0gdHJ1ZTtcclxuICAgICAgICBpZiAoc3RhdGUucmVuYW1pbmdQcm9tcHRHcm91cElkID09PSBncm91cC5pZCkge1xyXG4gICAgICAgICAgc3RhdGUucmVuYW1pbmdQcm9tcHRHcm91cElkID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCBjb21taXQpO1xyXG5cclxuICAgIHJvdy5hcHBlbmRDaGlsZChpbnB1dCk7XHJcblxyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcclxuICAgICAgaW5wdXQuZm9jdXMoKTtcclxuICAgICAgaW5wdXQuc2VsZWN0KCk7XHJcbiAgICB9KTtcclxuICAgIGlmIChzdGF0ZS5wZW5kaW5nUHJvbXB0R3JvdXBGb2N1c0lkID09PSBncm91cC5pZCkge1xyXG4gICAgICBzdGF0ZS5wZW5kaW5nUHJvbXB0R3JvdXBGb2N1c0lkID0gbnVsbDtcclxuICAgIH1cclxuICAgIHJldHVybiByb3c7XHJcbiAgfVxyXG5cclxuICBjb25zdCBuYW1lRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICBuYW1lRWwuY2xhc3NOYW1lID0gXCJwcm9tcHQtZ3JvdXAtbmF2LW5hbWVcIjtcclxuICBuYW1lRWwudGV4dENvbnRlbnQgPSBkaXNwbGF5TmFtZSB8fCBtc2coXCJvdmVybGF5X3VubmFtZWRQcm9tcHRHcm91cFwiLCBcIuacquWRveWQjeWIhue7hFwiKTtcclxuICByb3cuYXBwZW5kQ2hpbGQobmFtZUVsKTtcclxuXHJcbiAgcm93LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXYpID0+IHtcclxuICAgIGlmIChldi50YXJnZXQuY2xvc2VzdChcIi5wcm9tcHQtZ3JvdXAtbmF2LWFjdGlvblwiKSkgcmV0dXJuO1xyXG4gICAgc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9IGdyb3VwLmlkO1xyXG4gICAgcmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxuICB9KTtcclxuXHJcbiAgaWYgKGlzQWN0aXZlICYmICFpc0FsbCkge1xyXG4gICAgY29uc3QgYWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBhY3Rpb25zLmNsYXNzTmFtZSA9IFwicHJvbXB0LWdyb3VwLW5hdi1hY3Rpb25zXCI7XHJcblxyXG4gICAgY29uc3QgcmVuYW1lQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIHJlbmFtZUJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIHJlbmFtZUJ0bi5jbGFzc05hbWUgPSBcInByb21wdC1ncm91cC1uYXYtYWN0aW9uIHByb21wdC1ncm91cC1uYXYtcmVuYW1lXCI7XHJcbiAgICByZW5hbWVCdG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBtc2coXCJzZXR0aW5nc19wcm9tcHRzX3JlbmFtZUdyb3VwQXJpYVwiLCBcIumHjeWRveWQjeWIhue7hFwiKSk7XHJcbiAgICByZW5hbWVCdG4udGl0bGUgPSBtc2coXCJzZXR0aW5nc19wcm9tcHRzX3JlbmFtZUdyb3VwVGl0bGVcIiwgXCLph43lkb3lkI1cIik7XHJcbiAgICByZW5hbWVCdG4uaW5uZXJIVE1MID0gYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjxwYXRoIGQ9XCJNMTEgNEg0YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmgxNGEyIDIgMCAwIDAgMi0ydi03XCIvPjxwYXRoIGQ9XCJNMTguNSAyLjVhMi4xMjEgMi4xMjEgMCAwIDEgMyAzTDEyIDE1bC00IDEgMS00IDkuNS05LjV6XCIvPjwvc3ZnPmA7XHJcbiAgICByZW5hbWVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldikgPT4ge1xyXG4gICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgc3RhdGUucmVuYW1pbmdQcm9tcHRHcm91cElkID0gZ3JvdXAuaWQ7XHJcbiAgICAgIHJlbmRlclByb21wdHNTZWN0aW9uKCk7XHJcbiAgICB9KTtcclxuICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQocmVuYW1lQnRuKTtcclxuXHJcbiAgICBpZiAoIWlzTG9ja2VkKSB7XHJcbiAgICAgIGNvbnN0IGRlbGV0ZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICAgIGRlbGV0ZUJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICAgICAgZGVsZXRlQnRuLmNsYXNzTmFtZSA9IFwicHJvbXB0LWdyb3VwLW5hdi1hY3Rpb24gcHJvbXB0LWdyb3VwLW5hdi1kZWxldGVcIjtcclxuICAgICAgZGVsZXRlQnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbXNnKFwic2V0dGluZ3NfcHJvbXB0c19kZWxldGVHcm91cEFyaWFcIiwgXCLliKDpmaTliIbnu4RcIikpO1xyXG4gICAgICBkZWxldGVCdG4udGl0bGUgPSBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2RlbGV0ZUdyb3VwVGl0bGVcIiwgXCLliKDpmaTliIbnu4RcIik7XHJcbiAgICAgIGRlbGV0ZUJ0bi5pbm5lckhUTUwgPSBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PHBvbHlsaW5lIHBvaW50cz1cIjMgNiA1IDYgMjEgNlwiLz48cGF0aCBkPVwiTTE5IDZsLTEgMTRhMiAyIDAgMCAxLTIgMkg4YTIgMiAwIDAgMS0yLTJMNSA2XCIvPjxwYXRoIGQ9XCJNMTAgMTF2NlwiLz48cGF0aCBkPVwiTTE0IDExdjZcIi8+PHBhdGggZD1cIk05IDZWNGEyIDIgMCAwIDEgMi0yaDJhMiAyIDAgMCAxIDIgMnYyXCIvPjwvc3ZnPmA7XHJcbiAgICAgIGRlbGV0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGV2KSA9PiB7XHJcbiAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgY29uc3Qgc2hvdWxkRGVsZXRlID0gd2luZG93LmNvbmZpcm0obXNnKFwic2V0dGluZ3NfcHJvbXB0c19kZWxldGVHcm91cENvbmZpcm1cIiwgXCLmmK/lkKbopoHliKDpmaTor6Xmj5DnpLror43liIbnu4TvvJ9cIikpO1xyXG4gICAgICAgIGlmICghc2hvdWxkRGVsZXRlKSByZXR1cm47XHJcbiAgICAgICAgc3RhdGUucHJvbXB0R3JvdXBzID0gc3RhdGUucHJvbXB0R3JvdXBzLmZpbHRlcigoZykgPT4gZy5pZCAhPT0gZ3JvdXAuaWQpO1xyXG4gICAgICAgIGlmICghc3RhdGUucHJvbXB0R3JvdXBzLmxlbmd0aCkge1xyXG4gICAgICAgICAgc3RhdGUucHJvbXB0R3JvdXBzID0gY3JlYXRlTm9ybWFsaXplZFByb21wdEdyb3VwcyhbXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBzdGF0ZS5wcm9tcHRHcm91cHNbMF0/LmlkIHx8IG51bGw7XHJcbiAgICAgICAgYXdhaXQgcGVyc2lzdEFsbCgpO1xyXG4gICAgICAgIHJlbmRlclByb21wdHNTZWN0aW9uKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgICBhY3Rpb25zLmFwcGVuZENoaWxkKGRlbGV0ZUJ0bik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZHJhZ0hhbmRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICBkcmFnSGFuZGxlLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgZHJhZ0hhbmRsZS5jbGFzc05hbWUgPSBcInByb21wdC1ncm91cC1uYXYtYWN0aW9uIHByb21wdC1ncm91cC1uYXYtZHJhZ1wiO1xyXG4gICAgZHJhZ0hhbmRsZS5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIG1zZyhcInNldHRpbmdzX3Byb21wdHNfZHJhZ0dyb3VwQXJpYVwiLCBcIuaLluWKqOaOkuW6j1wiKSk7XHJcbiAgICBkcmFnSGFuZGxlLnRpdGxlID0gbXNnKFwic2V0dGluZ3NfcHJvbXB0c19kcmFnR3JvdXBUaXRsZVwiLCBcIuaLluWKqOaOkuW6j1wiKTtcclxuICAgIGRyYWdIYW5kbGUuaW5uZXJIVE1MID0gYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjxjaXJjbGUgY3g9XCI5XCIgY3k9XCI2XCIgcj1cIjFcIi8+PGNpcmNsZSBjeD1cIjlcIiBjeT1cIjEyXCIgcj1cIjFcIi8+PGNpcmNsZSBjeD1cIjlcIiBjeT1cIjE4XCIgcj1cIjFcIi8+PGNpcmNsZSBjeD1cIjE1XCIgY3k9XCI2XCIgcj1cIjFcIi8+PGNpcmNsZSBjeD1cIjE1XCIgY3k9XCIxMlwiIHI9XCIxXCIvPjxjaXJjbGUgY3g9XCIxNVwiIGN5PVwiMThcIiByPVwiMVwiLz48L3N2Zz5gO1xyXG4gICAgYWN0aW9ucy5hcHBlbmRDaGlsZChkcmFnSGFuZGxlKTtcclxuXHJcbiAgICByb3cuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVQcm9tcHRDb250ZW50UGFuZWwoYWN0aXZlR3JvdXApIHtcclxuICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIHBhbmVsLmNsYXNzTmFtZSA9IFwicHJvbXB0LWNvbnRlbnQtcGFuZWxcIjtcclxuXHJcbiAgY29uc3QgaXNBbGwgPSBpc0FsbFByb21wdEdyb3VwKGFjdGl2ZUdyb3VwKTtcclxuICBjb25zdCBlbnRyaWVzID0gZ2V0RGlzcGxheVByb21wdEVudHJpZXMoYWN0aXZlR3JvdXApO1xyXG4gIGNvbnN0IGRpc3BsYXlOYW1lID0gaXNBbGwgPyBnZXRBbGxQcm9tcHRHcm91cE5hbWUoKSA6IChhY3RpdmVHcm91cC5uYW1lIHx8IG1zZyhcIm92ZXJsYXlfdW5uYW1lZFByb21wdEdyb3VwXCIsIFwi5pyq5ZG95ZCN5YiG57uEXCIpKTtcclxuXHJcbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBoZWFkZXIuY2xhc3NOYW1lID0gXCJwcm9tcHQtY29udGVudC1oZWFkZXJcIjtcclxuICBoZWFkZXIuaW5uZXJIVE1MID0gYFxyXG4gICAgPGRpdj5cclxuICAgICAgPGRpdiBjbGFzcz1cInByb21wdC1jb250ZW50LXRpdGxlXCI+JHtlc2NhcGVIdG1sKGRpc3BsYXlOYW1lKX08L2Rpdj5cclxuICAgICAgPGRpdiBjbGFzcz1cInByb21wdC1jb250ZW50LXN1YnRpdGxlXCI+JHttc2coXCJzZXR0aW5nc19wcm9tcHRzX2NvdW50UHJlZml4XCIsIFwi5b2T5YmN5YiG57G75LiL5YWxIFwiKX0ke2VudHJpZXMubGVuZ3RofSR7bXNnKFwic2V0dGluZ3NfcHJvbXB0c19jb3VudFN1ZmZpeFwiLCBcIiDmnaHmj5DnpLror41cIil9PC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuICBgO1xyXG4gIHBhbmVsLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcblxyXG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxpc3QuY2xhc3NOYW1lID0gXCJwcm9tcHQtY2FyZHMtbGlzdFwiO1xyXG4gIGlmICghZW50cmllcy5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVtcHR5LmNsYXNzTmFtZSA9IFwic2l0ZS1zZWxlY3Rpb24tZW1wdHlcIjtcclxuICAgIGVtcHR5LnRleHRDb250ZW50ID0gaXNBbGxcclxuICAgICAgPyBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2VtcHR5QWxsXCIsIFwi6L+Y5rKh5pyJ5Lu75L2V5o+Q56S66K+N77yM54K55Ye75LiL5pa55oyJ6ZKu5re75Yqg44CCXCIpXHJcbiAgICAgIDogbXNnKFwic2V0dGluZ3NfcHJvbXB0c19lbXB0eUdyb3VwXCIsIFwi5b2T5YmN5YiG57uE6L+Y5rKh5pyJ5o+Q56S66K+N77yM54K55Ye75LiL5pa55oyJ6ZKu5re75Yqg44CCXCIpO1xyXG4gICAgbGlzdC5hcHBlbmRDaGlsZChlbXB0eSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGVudHJpZXMuZm9yRWFjaCgoeyBwcm9tcHQsIHNvdXJjZUdyb3VwIH0pID0+IHtcclxuICAgICAgbGlzdC5hcHBlbmRDaGlsZChjcmVhdGVQcm9tcHRDYXJkKHNvdXJjZUdyb3VwLCBwcm9tcHQsIHsgZGlzYWJsZURyYWc6IGZhbHNlIH0pKTtcclxuICAgIH0pO1xyXG4gICAgaWYgKGlzQWxsKSB7XHJcbiAgICAgIGF0dGFjaFByb21wdEl0ZW1EcmFnQWxsKGxpc3QpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgYXR0YWNoUHJvbXB0SXRlbURyYWcobGlzdCwgYWN0aXZlR3JvdXApO1xyXG4gICAgfVxyXG4gIH1cclxuICBwYW5lbC5hcHBlbmRDaGlsZChsaXN0KTtcclxuXHJcbiAgY29uc3QgYm90dG9tQWRkV3JhcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgYm90dG9tQWRkV3JhcC5jbGFzc05hbWUgPSBcInByb21wdC1wYW5lbC1ib3R0b20tYWRkXCI7XHJcbiAgY29uc3QgYm90dG9tQWRkQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBib3R0b21BZGRCdG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgYm90dG9tQWRkQnRuLmNsYXNzTmFtZSA9IFwicHJvbXB0LXBhbmVsLWFkZC1idG5cIjtcclxuICBib3R0b21BZGRCdG4udGV4dENvbnRlbnQgPSBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2FkZFByb21wdEN0YVwiLCBcIua3u+WKoOaPkOekuuivjVwiKTtcclxuICBib3R0b21BZGRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIHN0YXRlLnByb21wdEVkaXRvclN0YXRlID0ge1xyXG4gICAgICBtb2RlOiBcImNyZWF0ZVwiLFxyXG4gICAgICAvLyDlnKhcIuWFqOmDqFwi6KeG5Zu+5LiL5paw5bu65pe277yM6buY6K6k5YaZ5YWl56ys5LiA5Liq55yf5a6e5YiG57uE77yI6Z2e5YWo6YOo77yJ77yb55So5oi35LuN5Y+v5Zyo5by556qX6YeM5pS55Li65YW25a6D5YiG57uE44CCXHJcbiAgICAgIGdyb3VwSWQ6IGlzQWxsXHJcbiAgICAgICAgPyAoc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGcpID0+ICFpc0FsbFByb21wdEdyb3VwKGcpKT8uaWQgfHwgc3RhdGUucHJvbXB0R3JvdXBzWzBdPy5pZClcclxuICAgICAgICA6IGFjdGl2ZUdyb3VwLmlkLFxyXG4gICAgICBwcm9tcHRJZDogbnVsbCxcclxuICAgICAgdGl0bGU6IFwiXCIsXHJcbiAgICAgIGNvbnRlbnQ6IFwiXCJcclxuICAgIH07XHJcbiAgICByZW5kZXJQcm9tcHRzU2VjdGlvbigpO1xyXG4gIH0pO1xyXG4gIGJvdHRvbUFkZFdyYXAuYXBwZW5kQ2hpbGQoYm90dG9tQWRkQnRuKTtcclxuICBwYW5lbC5hcHBlbmRDaGlsZChib3R0b21BZGRXcmFwKTtcclxuXHJcbiAgcmV0dXJuIHBhbmVsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVQcm9tcHRDYXJkKGdyb3VwLCBwcm9tcHQsIG9wdGlvbnMgPSB7fSkge1xyXG4gIGNvbnN0IGRpc2FibGVEcmFnID0gISFvcHRpb25zLmRpc2FibGVEcmFnO1xyXG4gIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYXJ0aWNsZVwiKTtcclxuICBpdGVtLmNsYXNzTmFtZSA9IFwicHJvbXB0LWNhcmQtaXRlbVwiO1xyXG4gIGl0ZW0uZGF0YXNldC5wcm9tcHRJZCA9IHByb21wdC5pZDtcclxuICBpdGVtLmRhdGFzZXQuZ3JvdXBJZCA9IGdyb3VwLmlkO1xyXG5cclxuICBjb25zdCBpbmxpbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGlubGluZS5jbGFzc05hbWUgPSBcInByb21wdC1jYXJkLWlubGluZVwiO1xyXG5cclxuICAvLyDpk4XnrJTnvJbovpHmjInpkq5cclxuICBjb25zdCBlZGl0QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICBlZGl0QnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIGVkaXRCdG4uY2xhc3NOYW1lID0gXCJwcm9tcHQtaWNvbi1idG4gcHJvbXB0LWVkaXQtaWNvbi1idG5cIjtcclxuICBlZGl0QnRuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgbXNnKFwiY29tbW9uX2VkaXRcIiwgXCLnvJbovpFcIikpO1xyXG4gIGVkaXRCdG4udGl0bGUgPSBtc2coXCJjb21tb25fZWRpdFwiLCBcIue8lui+kVwiKTtcclxuICBlZGl0QnRuLmlubmVySFRNTCA9IGA8c3ZnIHdpZHRoPVwiMTVcIiBoZWlnaHQ9XCIxNVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIiBhcmlhLWhpZGRlbj1cInRydWVcIj48cGF0aCBkPVwiTTExIDRINGEyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMnYtN1wiLz48cGF0aCBkPVwiTTE4LjUgMi41YTIuMTIxIDIuMTIxIDAgMCAxIDMgM0wxMiAxNWwtNCAxIDEtNCA5LjUtOS41elwiLz48L3N2Zz5gO1xyXG4gIGVkaXRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIHN0YXRlLnByb21wdEVkaXRvclN0YXRlID0ge1xyXG4gICAgICBtb2RlOiBcImVkaXRcIixcclxuICAgICAgZ3JvdXBJZDogZ3JvdXAuaWQsXHJcbiAgICAgIHByb21wdElkOiBwcm9tcHQuaWQsXHJcbiAgICAgIHRpdGxlOiBwcm9tcHQudGl0bGUgfHwgXCJcIixcclxuICAgICAgY29udGVudDogcHJvbXB0LmNvbnRlbnQgfHwgXCJcIlxyXG4gICAgfTtcclxuICAgIHJlbmRlclByb21wdHNTZWN0aW9uKCk7XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IHByZXZpZXdCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIHByZXZpZXdCdG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgcHJldmlld0J0bi5jbGFzc05hbWUgPSBcInByb21wdC1pY29uLWJ0biBwcm9tcHQtcHJldmlldy1pY29uLWJ0blwiO1xyXG4gIHByZXZpZXdCdG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBtc2coXCJzZXR0aW5nc19wcm9tcHRzX3ByZXZpZXdBcmlhXCIsIFwi6aKE6KeIXCIpKTtcclxuICBwcmV2aWV3QnRuLnRpdGxlID0gbXNnKFwic2V0dGluZ3NfcHJvbXB0c19wcmV2aWV3VGl0bGVcIiwgXCLpooTop4jlhoXlrrlcIik7XHJcbiAgcHJldmlld0J0bi5pbm5lckhUTUwgPSBgPHN2ZyB3aWR0aD1cIjE1XCIgaGVpZ2h0PVwiMTVcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PHBhdGggZD1cIk0xIDEyczQtOCAxMS04IDExIDggMTEgOC00IDgtMTEgOC0xMS04LTExLTh6XCIvPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiM1wiLz48L3N2Zz5gO1xyXG4gIGxldCBob3ZlclRpbWVyID0gbnVsbDtcclxuICBwcmV2aWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsICgpID0+IHtcclxuICAgIGhvdmVyVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgc2hvd1Byb21wdEhvdmVyQ2FyZChwcm9tcHQsIGdyb3VwLCBwcmV2aWV3QnRuKTtcclxuICAgIH0sIDIwMCk7XHJcbiAgfSk7XHJcbiAgcHJldmlld0J0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2VsZWF2ZVwiLCAoKSA9PiB7XHJcbiAgICBpZiAoaG92ZXJUaW1lcikgeyBjbGVhclRpbWVvdXQoaG92ZXJUaW1lcik7IGhvdmVyVGltZXIgPSBudWxsOyB9XHJcbiAgfSk7XHJcblxyXG4gIC8vIOaLluaLveaJi+afhFxyXG4gIGNvbnN0IGRyYWdIYW5kbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGRyYWdIYW5kbGUudHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgZHJhZ0hhbmRsZS5jbGFzc05hbWUgPSBcInByb21wdC1pY29uLWJ0biBwcm9tcHQtY2FyZC1kcmFnLWhhbmRsZVwiO1xyXG4gIGRyYWdIYW5kbGUuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2RyYWdHcm91cEFyaWFcIiwgXCLmi5bliqjmjpLluo9cIikpO1xyXG4gIGRyYWdIYW5kbGUudGl0bGUgPSBtc2coXCJzZXR0aW5nc19wcm9tcHRzX2RyYWdHcm91cFRpdGxlXCIsIFwi5ouW5Yqo5o6S5bqPXCIpO1xyXG4gIGRyYWdIYW5kbGUuaW5uZXJIVE1MID0gYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBhcmlhLWhpZGRlbj1cInRydWVcIj48Y2lyY2xlIGN4PVwiOVwiIGN5PVwiNVwiIHI9XCIxLjZcIi8+PGNpcmNsZSBjeD1cIjE1XCIgY3k9XCI1XCIgcj1cIjEuNlwiLz48Y2lyY2xlIGN4PVwiOVwiIGN5PVwiMTJcIiByPVwiMS42XCIvPjxjaXJjbGUgY3g9XCIxNVwiIGN5PVwiMTJcIiByPVwiMS42XCIvPjxjaXJjbGUgY3g9XCI5XCIgY3k9XCIxOVwiIHI9XCIxLjZcIi8+PGNpcmNsZSBjeD1cIjE1XCIgY3k9XCIxOVwiIHI9XCIxLjZcIi8+PC9zdmc+YDtcclxuXHJcbiAgY29uc3QgdGl0bGVFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGVFbC5jbGFzc05hbWUgPSBcInByb21wdC1jYXJkLXRpdGxlXCI7XHJcbiAgdGl0bGVFbC50ZXh0Q29udGVudCA9IHByb21wdC50aXRsZSB8fCBtc2coXCJvdmVybGF5X3VubmFtZWRQcm9tcHRcIiwgXCLmnKrlkb3lkI3mj5DnpLror41cIik7XHJcblxyXG4gIGNvbnN0IHJpZ2h0R3JvdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJpZ2h0R3JvdXAuY2xhc3NOYW1lID0gXCJwcm9tcHQtY2FyZC1pY29uLWdyb3VwXCI7XHJcbiAgcmlnaHRHcm91cC5hcHBlbmRDaGlsZChlZGl0QnRuKTtcclxuICByaWdodEdyb3VwLmFwcGVuZENoaWxkKHByZXZpZXdCdG4pO1xyXG4gIGlmICghZGlzYWJsZURyYWcpIHtcclxuICAgIHJpZ2h0R3JvdXAuYXBwZW5kQ2hpbGQoZHJhZ0hhbmRsZSk7XHJcbiAgfVxyXG5cclxuICBpbmxpbmUuYXBwZW5kQ2hpbGQodGl0bGVFbCk7XHJcbiAgaW5saW5lLmFwcGVuZENoaWxkKHJpZ2h0R3JvdXApO1xyXG4gIGl0ZW0uYXBwZW5kQ2hpbGQoaW5saW5lKTtcclxuXHJcbiAgcmV0dXJuIGl0ZW07XHJcbn1cclxuIiwgImltcG9ydCB7IHN0YXRlLCBtc2csIGNyZWF0ZUJsYW5rQ3VzdG9tRm9ybVN0YXRlIH0gZnJvbSBcIi4uL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IGVzY2FwZUh0bWwgfSBmcm9tIFwiLi4vdXRpbHMuanNcIjtcclxuaW1wb3J0IHtcclxuICBwZXJzaXN0QWxsLFxyXG4gIGNyZWF0ZUN1c3RvbVNpdGVJZCxcclxuICBkZXJpdmVNYXRjaFBhdHRlcm5zLFxyXG4gIGNvbnZlcnRVcmxUb1RlbXBsYXRlLFxyXG59IGZyb20gXCIuLi9zdG9yZS5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckN1c3RvbVNlY3Rpb24oKSB7XHJcbiAgY29uc3QgeyBjdXN0b21TZWN0aW9uIH0gPSBzdGF0ZS5kb207XHJcbiAgY3VzdG9tU2VjdGlvbi5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICBjb25zdCBjb252ZXJ0ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICBjb252ZXJ0ZXIuY2xhc3NOYW1lID0gXCJjdXN0b20tc2VhcmNoLWNhcmRcIjtcclxuICBjb252ZXJ0ZXIuaW5uZXJIVE1MID0gYFxyXG4gICAgPGRpdiBjbGFzcz1cImN1c3RvbS1zZWFyY2gtY2FyZC1oZWFkXCI+XHJcbiAgICAgIDxzdHJvbmc+JHttc2coXCJzZXR0aW5nc19jdXN0b21fY29udmVydFRpdGxlXCIsIFwiVVJMIOinhOWImei9rOaNolwiKX08L3N0cm9uZz5cclxuICAgICAgPHNwYW4+JHttc2coXCJzZXR0aW5nc19jdXN0b21fY29udmVydERlc2NcIiwgXCLnspjotLTkuIDmnaHluKbmkJzntKLor43nmoQgVVJM77yM5oiR5Lus5bCd6K+V6Ieq5Yqo6K+G5Yir5pCc57Si5Y+C5pWw5bm25pu/5o2i5Li6IHtxdWVyeX3jgIJcIil9PC9zcGFuPlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY3VzdG9tLWNvbnZlcnRlci1yb3dcIj5cclxuICAgICAgPGlucHV0IGNsYXNzPVwiY3VzdG9tLWNvbnZlcnRlci1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgLz5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImN1c3RvbS1jb252ZXJ0ZXItYnRuXCIgdHlwZT1cImJ1dHRvblwiPiR7bXNnKFwic2V0dGluZ3NfY3VzdG9tX2NvbnZlcnRCdG5cIiwgXCLovazmjaJcIil9PC9idXR0b24+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJjdXN0b20tY29udmVydGVyLW1zZ1wiIGRhdGEtZmllbGQ9XCJjb252ZXJ0ZXItbXNnXCI+PC9kaXY+XHJcbiAgYDtcclxuXHJcbiAgY29uc3QgY29udmVydGVySW5wdXQgPSBjb252ZXJ0ZXIucXVlcnlTZWxlY3RvcihcIi5jdXN0b20tY29udmVydGVyLWlucHV0XCIpO1xyXG4gIGNvbnN0IGNvbnZlcnRlckJ0biA9IGNvbnZlcnRlci5xdWVyeVNlbGVjdG9yKFwiLmN1c3RvbS1jb252ZXJ0ZXItYnRuXCIpO1xyXG4gIGNvbnN0IGNvbnZlcnRlck1zZyA9IGNvbnZlcnRlci5xdWVyeVNlbGVjdG9yKFwiW2RhdGEtZmllbGQ9J2NvbnZlcnRlci1tc2cnXVwiKTtcclxuXHJcbiAgaWYgKGNvbnZlcnRlcklucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkge1xyXG4gICAgY29udmVydGVySW5wdXQudmFsdWUgPSBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuY29udmVydGVySW5wdXQgfHwgXCJcIjtcclxuICAgIGNvbnZlcnRlcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmNvbnZlcnRlcklucHV0ID0gZXZlbnQudGFyZ2V0LnZhbHVlO1xyXG4gICAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuY29udmVydGVyRXJyb3IgPSBcIlwiO1xyXG4gICAgICBpZiAoY29udmVydGVyTXNnKSB7XHJcbiAgICAgICAgY29udmVydGVyTXNnLnRleHRDb250ZW50ID0gXCJcIjtcclxuICAgICAgICBjb252ZXJ0ZXJNc2cuY2xhc3NMaXN0LnJlbW92ZShcImlzLWVycm9yXCIpO1xyXG4gICAgICAgIGNvbnZlcnRlck1zZy5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtc3VjY2Vzc1wiKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBjb252ZXJ0ZXJJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHtcclxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XHJcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBoYW5kbGVDb252ZXJ0Q2xpY2soKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAoY29udmVydGVyQnRuKSB7XHJcbiAgICBjb252ZXJ0ZXJCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZUNvbnZlcnRDbGljayk7XHJcbiAgfVxyXG5cclxuICBpZiAoc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmNvbnZlcnRlckVycm9yICYmIGNvbnZlcnRlck1zZykge1xyXG4gICAgY29udmVydGVyTXNnLnRleHRDb250ZW50ID0gc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmNvbnZlcnRlckVycm9yO1xyXG4gICAgY29udmVydGVyTXNnLmNsYXNzTGlzdC5hZGQoXCJpcy1lcnJvclwiKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGhhbmRsZUNvbnZlcnRDbGljaygpIHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRVcmxUb1RlbXBsYXRlKHN0YXRlLmN1c3RvbUZvcm1TdGF0ZS5jb252ZXJ0ZXJJbnB1dCk7XHJcbiAgICBpZiAoIXJlc3VsdC5vaykge1xyXG4gICAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuY29udmVydGVyRXJyb3IgPSByZXN1bHQuZXJyb3I7XHJcbiAgICAgIGlmIChjb252ZXJ0ZXJNc2cpIHtcclxuICAgICAgICBjb252ZXJ0ZXJNc2cudGV4dENvbnRlbnQgPSByZXN1bHQuZXJyb3I7XHJcbiAgICAgICAgY29udmVydGVyTXNnLmNsYXNzTGlzdC5hZGQoXCJpcy1lcnJvclwiKTtcclxuICAgICAgICBjb252ZXJ0ZXJNc2cuY2xhc3NMaXN0LnJlbW92ZShcImlzLXN1Y2Nlc3NcIik7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgc3RhdGUuY3VzdG9tRm9ybVN0YXRlLnVybCA9IHJlc3VsdC51cmw7XHJcbiAgICBpZiAoIXN0YXRlLmN1c3RvbUZvcm1TdGF0ZS5uYW1lICYmIHJlc3VsdC5uYW1lKSB7XHJcbiAgICAgIHN0YXRlLmN1c3RvbUZvcm1TdGF0ZS5uYW1lID0gcmVzdWx0Lm5hbWU7XHJcbiAgICB9XHJcbiAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZm9ybUVycm9yID0gXCJcIjtcclxuICAgIHN0YXRlLmN1c3RvbUZvcm1TdGF0ZS5jb252ZXJ0ZXJFcnJvciA9IFwiXCI7XHJcbiAgICByZW5kZXJDdXN0b21TZWN0aW9uKCk7XHJcbiAgfVxyXG5cclxuICBjdXN0b21TZWN0aW9uLmFwcGVuZENoaWxkKGNvbnZlcnRlcik7XHJcblxyXG4gIGNvbnN0IGZvcm0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICBmb3JtLmNsYXNzTmFtZSA9IFwiY3VzdG9tLXNlYXJjaC1jYXJkXCI7XHJcbiAgY29uc3QgaXNFZGl0aW5nID0gc3RhdGUuY3VzdG9tRm9ybVN0YXRlLm1vZGUgPT09IFwiZWRpdFwiO1xyXG4gIGZvcm0uaW5uZXJIVE1MID0gYFxyXG4gICAgPGRpdiBjbGFzcz1cImN1c3RvbS1zZWFyY2gtY2FyZC1oZWFkXCI+XHJcbiAgICAgIDxzdHJvbmc+JHtpc0VkaXRpbmcgPyBtc2coXCJzZXR0aW5nc19jdXN0b21fZWRpdFRpdGxlXCIsIFwi57yW6L6R6Ieq5a6a5LmJ56uZ54K5XCIpIDogbXNnKFwic2V0dGluZ3NfY3VzdG9tX2FkZFRpdGxlXCIsIFwi5omL5Yqo5re75YqgXCIpfTwvc3Ryb25nPlxyXG4gICAgICA8c3Bhbj4ke21zZyhcInNldHRpbmdzX2N1c3RvbV9hZGREZXNjXCIsIFwi5aGr5YaZ56uZ54K55ZCN56ew5LiOIFVSTO+8jHtxdWVyeX0g5Lya5Zyo5pCc57Si5pe26Ieq5Yqo5pu/5o2i5Li65L2g55qE5YWz6ZSu6K+N44CCXCIpfTwvc3Bhbj5cclxuICAgIDwvZGl2PlxyXG4gICAgPGxhYmVsIGNsYXNzPVwiY3VzdG9tLWZpZWxkXCI+XHJcbiAgICAgIDxzcGFuIGNsYXNzPVwiZmllbGQtbGFiZWwgaW5saW5lLWZpZWxkLWxhYmVsXCI+JHttc2coXCJzZXR0aW5nc19jdXN0b21fZmllbGROYW1lXCIsIFwi5ZCN56ewXCIpfTwvc3Bhbj5cclxuICAgICAgPGlucHV0IGNsYXNzPVwiY3VzdG9tLWZvcm0taW5wdXRcIiB0eXBlPVwidGV4dFwiIGRhdGEtZmllbGQ9XCJuYW1lXCIgLz5cclxuICAgIDwvbGFiZWw+XHJcbiAgICA8bGFiZWwgY2xhc3M9XCJjdXN0b20tZmllbGRcIj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJmaWVsZC1sYWJlbCBpbmxpbmUtZmllbGQtbGFiZWxcIj4ke21zZyhcInNldHRpbmdzX2N1c3RvbV9maWVsZFVybFwiLCBcIlVSTCDpk77mjqVcIil9PC9zcGFuPlxyXG4gICAgICA8aW5wdXQgY2xhc3M9XCJjdXN0b20tZm9ybS1pbnB1dFwiIHR5cGU9XCJ0ZXh0XCIgZGF0YS1maWVsZD1cInVybFwiIC8+XHJcbiAgICA8L2xhYmVsPlxyXG4gICAgPGRpdiBjbGFzcz1cImN1c3RvbS1mb3JtLW1zZ1wiIGRhdGEtZmllbGQ9XCJmb3JtLW1zZ1wiPjwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cImN1c3RvbS1mb3JtLWFjdGlvbnNcIj5cclxuICAgICAgJHtpc0VkaXRpbmcgPyBgPGJ1dHRvbiBjbGFzcz1cImN1c3RvbS1mb3JtLWNhbmNlbC1idG5cIiB0eXBlPVwiYnV0dG9uXCI+JHttc2coXCJzZXR0aW5nc19jdXN0b21fY2FuY2VsRWRpdFwiLCBcIuWPlua2iOe8lui+kVwiKX08L2J1dHRvbj5gIDogXCJcIn1cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImN1c3RvbS1mb3JtLXN1Ym1pdC1idG5cIiB0eXBlPVwiYnV0dG9uXCI+JHtpc0VkaXRpbmcgPyBtc2coXCJzZXR0aW5nc19jdXN0b21fc2F2ZUVkaXRcIiwgXCLkv53lrZjkv67mlLlcIikgOiBtc2coXCJzZXR0aW5nc19jdXN0b21fY29uZmlybUFkZFwiLCBcIuehruWumua3u+WKoFwiKX08L2J1dHRvbj5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcblxyXG4gIGNvbnN0IG5hbWVJbnB1dCA9IGZvcm0ucXVlcnlTZWxlY3RvcihcIltkYXRhLWZpZWxkPSduYW1lJ11cIik7XHJcbiAgY29uc3QgdXJsSW5wdXQgPSBmb3JtLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1maWVsZD0ndXJsJ11cIik7XHJcbiAgY29uc3QgZm9ybU1zZyA9IGZvcm0ucXVlcnlTZWxlY3RvcihcIltkYXRhLWZpZWxkPSdmb3JtLW1zZyddXCIpO1xyXG4gIGNvbnN0IHN1Ym1pdEJ0biA9IGZvcm0ucXVlcnlTZWxlY3RvcihcIi5jdXN0b20tZm9ybS1zdWJtaXQtYnRuXCIpO1xyXG4gIGNvbnN0IGNhbmNlbEJ0biA9IGZvcm0ucXVlcnlTZWxlY3RvcihcIi5jdXN0b20tZm9ybS1jYW5jZWwtYnRuXCIpO1xyXG5cclxuICBpZiAobmFtZUlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkge1xyXG4gICAgbmFtZUlucHV0LnZhbHVlID0gc3RhdGUuY3VzdG9tRm9ybVN0YXRlLm5hbWUgfHwgXCJcIjtcclxuICAgIG5hbWVJbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICAgIHN0YXRlLmN1c3RvbUZvcm1TdGF0ZS5uYW1lID0gZXZlbnQudGFyZ2V0LnZhbHVlO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGlmICh1cmxJbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpIHtcclxuICAgIHVybElucHV0LnZhbHVlID0gc3RhdGUuY3VzdG9tRm9ybVN0YXRlLnVybCB8fCBcIlwiO1xyXG4gICAgdXJsSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIChldmVudCkgPT4ge1xyXG4gICAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUudXJsID0gZXZlbnQudGFyZ2V0LnZhbHVlO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZm9ybUVycm9yICYmIGZvcm1Nc2cpIHtcclxuICAgIGZvcm1Nc2cudGV4dENvbnRlbnQgPSBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZm9ybUVycm9yO1xyXG4gICAgZm9ybU1zZy5jbGFzc0xpc3QuYWRkKFwiaXMtZXJyb3JcIik7XHJcbiAgfVxyXG4gIGlmIChzdWJtaXRCdG4pIHtcclxuICAgIHN1Ym1pdEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlQ3VzdG9tRm9ybVN1Ym1pdCk7XHJcbiAgfVxyXG4gIGlmIChjYW5jZWxCdG4pIHtcclxuICAgIGNhbmNlbEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUgPSBjcmVhdGVCbGFua0N1c3RvbUZvcm1TdGF0ZSgpO1xyXG4gICAgICByZW5kZXJDdXN0b21TZWN0aW9uKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGN1c3RvbVNlY3Rpb24uYXBwZW5kQ2hpbGQoZm9ybSk7XHJcblxyXG4gIGNvbnN0IGxpc3RDYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgbGlzdENhcmQuY2xhc3NOYW1lID0gXCJjdXN0b20tc2VhcmNoLWNhcmQgY3VzdG9tLXNpdGVzLWxpc3QtY2FyZFwiO1xyXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwiY3VzdG9tLXNlYXJjaC1jYXJkLWhlYWRcIjtcclxuICBoZWFkZXIuaW5uZXJIVE1MID0gYFxyXG4gICAgPHN0cm9uZz4ke21zZyhcInNldHRpbmdzX2N1c3RvbV9saXN0VGl0bGVcIiwgXCLlt7Lmt7vliqDnmoToh6rlrprkuYnnq5nngrlcIil9PC9zdHJvbmc+XHJcbiAgICA8c3Bhbj4ke21zZyhcInNldHRpbmdzX2N1c3RvbV9saXN0Q291bnRQcmVmaXhcIiwgXCLlvZPliY3lhbEgXCIpfSR7c3RhdGUuY3VzdG9tU2l0ZXMubGVuZ3RofSR7bXNnKFwic2V0dGluZ3NfY3VzdG9tX2xpc3RDb3VudFN1ZmZpeFwiLCBcIiDkuKroh6rlrprkuYnnq5nngrnjgIJcIil9PC9zcGFuPlxyXG4gIGA7XHJcbiAgbGlzdENhcmQuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcclxuXHJcbiAgaWYgKCFzdGF0ZS5jdXN0b21TaXRlcy5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVtcHR5LmNsYXNzTmFtZSA9IFwic2l0ZS1zZWxlY3Rpb24tZW1wdHlcIjtcclxuICAgIGVtcHR5LnRleHRDb250ZW50ID0gbXNnKFwic2V0dGluZ3NfY3VzdG9tX2xpc3RFbXB0eVwiLCBcIui/mOayoeacieiHquWumuS5ieermeeCue+8jOS4iuaWuea3u+WKoOWQjuS8muWcqOi/memHjOaYvuekuuOAglwiKTtcclxuICAgIGxpc3RDYXJkLmFwcGVuZENoaWxkKGVtcHR5KTtcclxuICB9IGVsc2Uge1xyXG4gICAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBsaXN0LmNsYXNzTmFtZSA9IFwiY3VzdG9tLXNpdGVzLWxpc3RcIjtcclxuICAgIHN0YXRlLmN1c3RvbVNpdGVzLmZvckVhY2goKHNpdGUpID0+IHtcclxuICAgICAgbGlzdC5hcHBlbmRDaGlsZChjcmVhdGVDdXN0b21TaXRlUm93KHNpdGUpKTtcclxuICAgIH0pO1xyXG4gICAgbGlzdENhcmQuYXBwZW5kQ2hpbGQobGlzdCk7XHJcbiAgfVxyXG5cclxuICBjdXN0b21TZWN0aW9uLmFwcGVuZENoaWxkKGxpc3RDYXJkKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQ3VzdG9tU2l0ZVJvdyhzaXRlKSB7XHJcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFydGljbGVcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwiY3VzdG9tLXNpdGUtcm93XCI7XHJcbiAgcm93LmlubmVySFRNTCA9IGBcclxuICAgIDxkaXYgY2xhc3M9XCJjdXN0b20tc2l0ZS1pbmZvXCI+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJjdXN0b20tc2l0ZS1uYW1lXCI+JHtlc2NhcGVIdG1sKHNpdGUubmFtZSl9PC9kaXY+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJjdXN0b20tc2l0ZS11cmxcIj4ke2VzY2FwZUh0bWwoc2l0ZS51cmwpfTwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY3VzdG9tLXNpdGUtYWN0aW9uc1wiPlxyXG4gICAgICA8YnV0dG9uIGNsYXNzPVwiY3VzdG9tLXNpdGUtZWRpdC1idG5cIiB0eXBlPVwiYnV0dG9uXCI+JHttc2coXCJjb21tb25fZWRpdFwiLCBcIue8lui+kVwiKX08L2J1dHRvbj5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImN1c3RvbS1zaXRlLWRlbGV0ZS1idG5cIiB0eXBlPVwiYnV0dG9uXCIgYXJpYS1sYWJlbD1cIiR7bXNnKFwiY29tbW9uX2RlbGV0ZVwiLCBcIuWIoOmZpFwiKX1cIj7DlzwvYnV0dG9uPlxyXG4gICAgPC9kaXY+XHJcbiAgYDtcclxuXHJcbiAgY29uc3QgZWRpdEJ0biA9IHJvdy5xdWVyeVNlbGVjdG9yKFwiLmN1c3RvbS1zaXRlLWVkaXQtYnRuXCIpO1xyXG4gIGNvbnN0IGRlbGV0ZUJ0biA9IHJvdy5xdWVyeVNlbGVjdG9yKFwiLmN1c3RvbS1zaXRlLWRlbGV0ZS1idG5cIik7XHJcblxyXG4gIGVkaXRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUgPSB7XHJcbiAgICAgIG1vZGU6IFwiZWRpdFwiLFxyXG4gICAgICBlZGl0aW5nSWQ6IHNpdGUuaWQsXHJcbiAgICAgIG5hbWU6IHNpdGUubmFtZSxcclxuICAgICAgdXJsOiBzaXRlLnVybCxcclxuICAgICAgY29udmVydGVySW5wdXQ6IFwiXCIsXHJcbiAgICAgIGNvbnZlcnRlckVycm9yOiBcIlwiLFxyXG4gICAgICBmb3JtRXJyb3I6IFwiXCJcclxuICAgIH07XHJcbiAgICByZW5kZXJDdXN0b21TZWN0aW9uKCk7XHJcbiAgICBzdGF0ZS5kb20uY3VzdG9tU2VjdGlvbi5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiBcInNtb290aFwiLCBibG9jazogXCJzdGFydFwiIH0pO1xyXG4gIH0pO1xyXG5cclxuICBkZWxldGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XHJcbiAgICBjb25zdCBjb25maXJtZWQgPSB3aW5kb3cuY29uZmlybShcclxuICAgICAgbXNnKFwic2V0dGluZ3NfY3VzdG9tX2RlbGV0ZUNvbmZpcm1QcmVmaXhcIiwgXCLmmK/lkKbopoHliKDpmaToh6rlrprkuYnnq5nngrnjgIxcIikgK1xyXG4gICAgICAgIHNpdGUubmFtZSArXHJcbiAgICAgICAgbXNnKFwic2V0dGluZ3NfY3VzdG9tX2RlbGV0ZUNvbmZpcm1NaWRcIiwgXCLjgI3vvJ9cXG5cIikgK1xyXG4gICAgICAgIG1zZyhcInNldHRpbmdzX2N1c3RvbV9kZWxldGVDb25maXJtQm9keVwiLCBcIuWIoOmZpOWQju+8jOaJgOacieaQnOe0oue7hOS4reW8leeUqOivpeermeeCueeahOiusOW9leS5n+S8muWQjOatpeenu+mZpOOAglwiKVxyXG4gICAgKTtcclxuICAgIGlmICghY29uZmlybWVkKSByZXR1cm47XHJcbiAgICBzdGF0ZS5jdXN0b21TaXRlcyA9IHN0YXRlLmN1c3RvbVNpdGVzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5pZCAhPT0gc2l0ZS5pZCk7XHJcbiAgICBzdGF0ZS5ncm91cHMgPSBzdGF0ZS5ncm91cHMubWFwKChncm91cCkgPT4gKHtcclxuICAgICAgLi4uZ3JvdXAsXHJcbiAgICAgIHNpdGVJZHM6IChncm91cC5zaXRlSWRzIHx8IFtdKS5maWx0ZXIoKGlkKSA9PiBpZCAhPT0gc2l0ZS5pZClcclxuICAgIH0pKTtcclxuICAgIGlmIChzdGF0ZS5jdXN0b21Gb3JtU3RhdGUubW9kZSA9PT0gXCJlZGl0XCIgJiYgc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmVkaXRpbmdJZCA9PT0gc2l0ZS5pZCkge1xyXG4gICAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUgPSBjcmVhdGVCbGFua0N1c3RvbUZvcm1TdGF0ZSgpO1xyXG4gICAgfVxyXG4gICAgYXdhaXQgcGVyc2lzdEFsbCgpO1xyXG4gICAgcmVuZGVyQ3VzdG9tU2VjdGlvbigpO1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDdXN0b21Gb3JtU3VibWl0KCkge1xyXG4gIGNvbnN0IG5hbWUgPSBTdHJpbmcoc3RhdGUuY3VzdG9tRm9ybVN0YXRlLm5hbWUgfHwgXCJcIikudHJpbSgpO1xyXG4gIGNvbnN0IHVybCA9IFN0cmluZyhzdGF0ZS5jdXN0b21Gb3JtU3RhdGUudXJsIHx8IFwiXCIpLnRyaW0oKTtcclxuXHJcbiAgaWYgKCFuYW1lKSB7XHJcbiAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZm9ybUVycm9yID0gbXNnKFwic2V0dGluZ3NfY3VzdG9tX2Vycm9yTmFtZVJlcXVpcmVkXCIsIFwi6K+36L6T5YWl56uZ54K55ZCN56ew44CCXCIpO1xyXG4gICAgcmVuZGVyQ3VzdG9tU2VjdGlvbigpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBpZiAoIXVybCkge1xyXG4gICAgc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmZvcm1FcnJvciA9IG1zZyhcInNldHRpbmdzX2N1c3RvbV9lcnJvclVybFJlcXVpcmVkXCIsIFwi6K+36L6T5YWlIFVSTCDpk77mjqXjgIJcIik7XHJcbiAgICByZW5kZXJDdXN0b21TZWN0aW9uKCk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIGlmICghL15odHRwcz86XFwvXFwvL2kudGVzdCh1cmwpKSB7XHJcbiAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZm9ybUVycm9yID0gbXNnKFwic2V0dGluZ3NfY3VzdG9tX2Vycm9yVXJsUHJvdG9jb2xcIiwgXCJVUkwg5b+F6aG75LulIGh0dHA6Ly8g5oiWIGh0dHBzOi8vIOW8gOWktOOAglwiKTtcclxuICAgIHJlbmRlckN1c3RvbVNlY3Rpb24oKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgaWYgKCF1cmwuaW5jbHVkZXMoXCJ7cXVlcnl9XCIpKSB7XHJcbiAgICBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZm9ybUVycm9yID0gbXNnKFwic2V0dGluZ3NfY3VzdG9tX2Vycm9yTWlzc2luZ1F1ZXJ5XCIsIFwiVVJMIOS4reW/hemhu+WMheWQqyB7cXVlcnl9IOS9nOS4uuaQnOe0ouivjeWNoOS9jeespuOAglwiKTtcclxuICAgIHJlbmRlckN1c3RvbVNlY3Rpb24oKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgdHJ5IHtcclxuICAgIG5ldyBVUkwodXJsLnJlcGxhY2UoXCJ7cXVlcnl9XCIsIFwiYWlcIikpO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmZvcm1FcnJvciA9IG1zZyhcInNldHRpbmdzX2N1c3RvbV9lcnJvclVybEludmFsaWRcIiwgXCJVUkwg5qC85byP5LiN5ZCI5rOV77yM6K+35qOA5p+l5ZCO6YeN6K+V44CCXCIpO1xyXG4gICAgcmVuZGVyQ3VzdG9tU2VjdGlvbigpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgaWYgKHN0YXRlLmN1c3RvbUZvcm1TdGF0ZS5tb2RlID09PSBcImVkaXRcIiAmJiBzdGF0ZS5jdXN0b21Gb3JtU3RhdGUuZWRpdGluZ0lkKSB7XHJcbiAgICBzdGF0ZS5jdXN0b21TaXRlcyA9IHN0YXRlLmN1c3RvbVNpdGVzLm1hcCgoc2l0ZSkgPT5cclxuICAgICAgc2l0ZS5pZCA9PT0gc3RhdGUuY3VzdG9tRm9ybVN0YXRlLmVkaXRpbmdJZFxyXG4gICAgICAgID8ge1xyXG4gICAgICAgICAgICAuLi5zaXRlLFxyXG4gICAgICAgICAgICBuYW1lLFxyXG4gICAgICAgICAgICB1cmwsXHJcbiAgICAgICAgICAgIHN1cHBvcnRVcmxRdWVyeTogdHJ1ZSxcclxuICAgICAgICAgICAgbWF0Y2hQYXR0ZXJuczogZGVyaXZlTWF0Y2hQYXR0ZXJucyh1cmwpXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgOiBzaXRlXHJcbiAgICApO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBjb25zdCBuZXdTaXRlID0ge1xyXG4gICAgICBpZDogY3JlYXRlQ3VzdG9tU2l0ZUlkKCksXHJcbiAgICAgIG5hbWUsXHJcbiAgICAgIHVybCxcclxuICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgc3VwcG9ydElmcmFtZTogdHJ1ZSxcclxuICAgICAgc3VwcG9ydFVybFF1ZXJ5OiB0cnVlLFxyXG4gICAgICBtYXRjaFBhdHRlcm5zOiBkZXJpdmVNYXRjaFBhdHRlcm5zKHVybCksXHJcbiAgICAgIGlzQ3VzdG9tOiB0cnVlXHJcbiAgICB9O1xyXG4gICAgc3RhdGUuY3VzdG9tU2l0ZXMgPSBbLi4uc3RhdGUuY3VzdG9tU2l0ZXMsIG5ld1NpdGVdO1xyXG4gIH1cclxuXHJcbiAgc3RhdGUuY3VzdG9tRm9ybVN0YXRlID0gY3JlYXRlQmxhbmtDdXN0b21Gb3JtU3RhdGUoKTtcclxuICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgcmVuZGVyQ3VzdG9tU2VjdGlvbigpO1xyXG59XHJcbiIsICJpbXBvcnQge1xyXG4gIG5vcm1hbGl6ZVNob3J0Y3V0LFxyXG4gIGZvcm1hdFNob3J0Y3V0LFxyXG4gIGlzU2hvcnRjdXRWYWxpZCxcclxufSBmcm9tIFwiLi4vLi4vLi4vc2hhcmVkL3Nob3J0Y3V0LmpzXCI7XHJcbmltcG9ydCB7IHN0YXRlLCBtc2cgfSBmcm9tIFwiLi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgZXNjYXBlSHRtbCB9IGZyb20gXCIuLi91dGlscy5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIHBlcnNpc3RBbGwsXHJcbiAgY3JlYXRlTm9ybWFsaXplZEdyb3VwcyxcclxuICBjcmVhdGVOb3JtYWxpemVkQ3VzdG9tU2l0ZXMsXHJcbiAgbWVyZ2VTaXRlcyxcclxufSBmcm9tIFwiLi4vc3RvcmUuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJPdGhlclNlY3Rpb24oKSB7XHJcbiAgY29uc3QgeyBvdGhlclNlY3Rpb24gfSA9IHN0YXRlLmRvbTtcclxuICBvdGhlclNlY3Rpb24uaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIGNhcmQuY2xhc3NOYW1lID0gXCJvdGhlci1zZXR0aW5ncy1jYXJkXCI7XHJcbiAgY2FyZC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZ3MtaW50cm9cIj5cclxuICAgICAgPHN0cm9uZz4ke21zZyhcInNldHRpbmdzX290aGVyX2hvbWVEaXNwbGF5VGl0bGVcIiwgXCLpppbpobXmmL7npLrpoblcIil9PC9zdHJvbmc+XHJcbiAgICAgIDxzcGFuPiR7bXNnKFwic2V0dGluZ3Nfb3RoZXJfaG9tZURpc3BsYXlEZXNjXCIsIFwi5o6n5Yi26aaW6aG16YeM5ZOq5Lqb5qih5Z2X5pi+56S677yM5ZOq5Lqb5qih5Z2X6ZqQ6JeP44CCXCIpfTwvc3Bhbj5cclxuICAgIDwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cIm90aGVyLXNldHRpbmdzLWxpc3RcIj48L2Rpdj5cclxuICBgO1xyXG5cclxuICBjb25zdCBsaXN0ID0gY2FyZC5xdWVyeVNlbGVjdG9yKFwiLm90aGVyLXNldHRpbmdzLWxpc3RcIik7XHJcbiAgW1xyXG4gICAge1xyXG4gICAgICBrZXk6IFwic2hvd0hpc3RvcnlcIixcclxuICAgICAgdGl0bGU6IG1zZyhcInNldHRpbmdzX290aGVyX3Nob3dIaXN0b3J5VGl0bGVcIiwgXCLmmL7npLrljoblj7LmkJzntKLorrDlvZVcIiksXHJcbiAgICAgIGRlc2M6IG1zZyhcInNldHRpbmdzX290aGVyX3Nob3dIaXN0b3J5RGVzY1wiLCBcIuWFs+mXreWQju+8jOmmlumhteS4i+aWueeahOWOhuWPsuaQnOe0ouWMuuWfn+WwhuS4jeWGjeaYvuekuuOAglwiKVxyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAga2V5OiBcInNob3dQcm9tcHRCdXR0b25cIixcclxuICAgICAgdGl0bGU6IG1zZyhcInNldHRpbmdzX290aGVyX3Nob3dQcm9tcHRUaXRsZVwiLCBcIuaYvuekuuaPkOekuuivjeaMiemSrlwiKSxcclxuICAgICAgZGVzYzogbXNnKFwic2V0dGluZ3Nfb3RoZXJfc2hvd1Byb21wdERlc2NcIiwgXCLlhbPpl63lkI7vvIzovpPlhaXmoYbkuIvmlrnnmoTmj5DnpLror43lhaXlj6PlsIbpmpDol4/jgIJcIilcclxuICAgIH0sXHJcbiAgXS5mb3JFYWNoKChpdGVtKSA9PiB7XHJcbiAgICBsaXN0Py5hcHBlbmRDaGlsZChjcmVhdGVPdGhlclNldHRpbmdUb2dnbGUoaXRlbS5rZXksIGl0ZW0udGl0bGUsIGl0ZW0uZGVzYykpO1xyXG4gIH0pO1xyXG5cclxuICBvdGhlclNlY3Rpb24uYXBwZW5kQ2hpbGQoY2FyZCk7XHJcbiAgb3RoZXJTZWN0aW9uLmFwcGVuZENoaWxkKGNyZWF0ZVNob3J0Y3V0Q2FyZCgpKTtcclxuICBvdGhlclNlY3Rpb24uYXBwZW5kQ2hpbGQoY3JlYXRlU2VhcmNoQ29uZmlnSW9DYXJkKCkpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlT3RoZXJTZXR0aW5nVG9nZ2xlKGtleSwgdGl0bGUsIGRlc2MsIHRpcCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFydGljbGVcIik7XHJcbiAgcm93LmNsYXNzTmFtZSA9IFwib3RoZXItc2V0dGluZy1yb3dcIiArICh0aXAgPyBcIiBvdGhlci1zZXR0aW5nLXJvdy0td2l0aC10aXBcIiA6IFwiXCIpO1xyXG5cclxuICBjb25zdCBpc09uID0gZ2V0T3RoZXJTZXR0aW5nVmFsdWUoa2V5LCBvcHRpb25zLmRlZmF1bHRWYWx1ZSAhPT0gZmFsc2UpO1xyXG4gIHJvdy5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZy1yb3ctbWFpblwiPlxyXG4gICAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZy1jb3B5XCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cIm90aGVyLXNldHRpbmctdGl0bGVcIj4ke2VzY2FwZUh0bWwodGl0bGUpfTwvZGl2PlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJvdGhlci1zZXR0aW5nLWRlc2NcIj4ke2VzY2FwZUh0bWwoZGVzYyl9PC9kaXY+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgICA8YnV0dG9uIGNsYXNzPVwib3RoZXItc2V0dGluZy1zd2l0Y2ggJHtpc09uID8gXCJpcy1vblwiIDogXCJpcy1vZmZcIn1cIiB0eXBlPVwiYnV0dG9uXCIgYXJpYS1wcmVzc2VkPVwiJHtpc09uID8gXCJ0cnVlXCIgOiBcImZhbHNlXCJ9XCI+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJvdGhlci1zZXR0aW5nLXN3aXRjaC10aHVtYlwiPjwvc3Bhbj5cclxuICAgICAgPC9idXR0b24+XHJcbiAgICA8L2Rpdj5cclxuICAgICR7dGlwID8gYDxkaXYgY2xhc3M9XCJvdGhlci1zZXR0aW5nLWRlc2Mgc2hvcnRjdXQtdGlwXCI+JHtlc2NhcGVIdG1sKHRpcCl9PC9kaXY+YCA6IFwiXCJ9XHJcbiAgYDtcclxuXHJcbiAgY29uc3QgdG9nZ2xlID0gcm93LnF1ZXJ5U2VsZWN0b3IoXCIub3RoZXItc2V0dGluZy1zd2l0Y2hcIik7XHJcbiAgdG9nZ2xlPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgc3RhdGUudWlQcmVmc1trZXldID0gIWdldE90aGVyU2V0dGluZ1ZhbHVlKGtleSwgb3B0aW9ucy5kZWZhdWx0VmFsdWUgIT09IGZhbHNlKTtcclxuICAgIGF3YWl0IHBlcnNpc3RBbGwoKTtcclxuICAgIGlmIChzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcInJhbmRvbVwiKSB7XHJcbiAgICAgIHN0YXRlLnJlbmRlclJhbmRvbVNlY3Rpb24oKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJlbmRlck90aGVyU2VjdGlvbigpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gcm93O1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRPdGhlclNldHRpbmdWYWx1ZShrZXksIGRlZmF1bHRWYWx1ZSA9IHRydWUpIHtcclxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHN0YXRlLnVpUHJlZnMgfHwge30sIGtleSkpIHtcclxuICAgIHJldHVybiBzdGF0ZS51aVByZWZzW2tleV0gIT09IGZhbHNlO1xyXG4gIH1cclxuICByZXR1cm4gZGVmYXVsdFZhbHVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVTaG9ydGN1dENhcmQoKSB7XHJcbiAgY29uc3QgY2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIGNhcmQuY2xhc3NOYW1lID0gXCJvdGhlci1zZXR0aW5ncy1jYXJkXCI7XHJcbiAgY2FyZC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZ3MtaW50cm9cIj5cclxuICAgICAgPHN0cm9uZz4ke21zZyhcInNldHRpbmdzX290aGVyX2dsb2JhbFNob3J0Y3V0VGl0bGVcIiwgXCLlhajlsYDmkJzntKLlv6vmjbfplK5cIil9PC9zdHJvbmc+XHJcbiAgICAgIDxzcGFuPiR7bXNnKFwic2V0dGluZ3Nfb3RoZXJfZ2xvYmFsU2hvcnRjdXREZXNjXCIsIFwi5Zyo5Lu75oSP572R6aG15LiK55So5b+r5o236ZSu5Zyo5bGP5bmV5Lit6Ze05b+r6YCf5by55Ye65pCc57Si5rWu5bGC44CCXCIpfTwvc3Bhbj5cclxuICAgIDwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cIm90aGVyLXNldHRpbmdzLWxpc3RcIj48L2Rpdj5cclxuICBgO1xyXG5cclxuICBjb25zdCBsaXN0ID0gY2FyZC5xdWVyeVNlbGVjdG9yKFwiLm90aGVyLXNldHRpbmdzLWxpc3RcIik7XHJcbiAgaWYgKGxpc3QpIHtcclxuICAgIGxpc3QuYXBwZW5kQ2hpbGQoXHJcbiAgICAgIGNyZWF0ZU90aGVyU2V0dGluZ1RvZ2dsZShcclxuICAgICAgICBcIm92ZXJsYXlTaG9ydGN1dEVuYWJsZWRcIixcclxuICAgICAgICBtc2coXCJzZXR0aW5nc19vdGhlcl9lbmFibGVHbG9iYWxTaG9ydGN1dFRpdGxlXCIsIFwi5ZCv55So5YWo5bGA5pCc57Si5b+r5o236ZSuXCIpLFxyXG4gICAgICAgIG1zZyhcInNldHRpbmdzX290aGVyX2VuYWJsZUdsb2JhbFNob3J0Y3V0RGVzY1wiLCBcIuW8gOWQr+WQju+8jOaMieS4i+S4i+aWueiHquWumuS5ieeahOW/q+aNt+mUruWNs+WPr+WcqOW9k+WJjee9kemhteW8ueWHuuaQnOe0oua1ruWxgu+8m+WFs+mXreWQjuW/q+aNt+mUruWwhuWkseaViOOAglwiKSxcclxuICAgICAgICBtc2coXCJzZXR0aW5nc19vdGhlcl9lbmFibGVHbG9iYWxTaG9ydGN1dFRpcFwiLCBcIuWcqOa1j+iniOWZqOWGhemhteOAgeaJqeWxleWVhuW6l+aIlumDqOWIhueJueauiue9kemhteS4re+8jOWPr+iDveaXoOazlemAmui/h+W/q+aNt+mUruWUpOi1t+OAglwiKVxyXG4gICAgICApXHJcbiAgICApO1xyXG4gICAgbGlzdC5hcHBlbmRDaGlsZChjcmVhdGVTaG9ydGN1dFJlY29yZGVyUm93KCkpO1xyXG4gICAgbGlzdC5hcHBlbmRDaGlsZChjcmVhdGVTaG9ydGN1dHNQYWdlSGludCgpKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBjYXJkO1xyXG59XHJcblxyXG4vLyDilIDilIAg5pCc57Si6YWN572uIOWvvOWFpSAvIOWvvOWHuiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZVNlYXJjaENvbmZpZ0lvQ2FyZCgpIHtcclxuICBjb25zdCBjYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgY2FyZC5jbGFzc05hbWUgPSBcIm90aGVyLXNldHRpbmdzLWNhcmRcIjtcclxuICBjYXJkLmlubmVySFRNTCA9IGBcclxuICAgIDxkaXYgY2xhc3M9XCJvdGhlci1zZXR0aW5ncy1pbnRyb1wiPlxyXG4gICAgICA8c3Ryb25nPiR7bXNnKFwic2V0dGluZ3Nfb3RoZXJfc2VhcmNoQ29uZmlnSW9UaXRsZVwiLCBcIuWvvOWFpSAvIOWvvOWHuuaQnOe0oumFjee9rlwiKX08L3N0cm9uZz5cclxuICAgICAgPHNwYW4+JHttc2coXCJzZXR0aW5nc19vdGhlcl9zZWFyY2hDb25maWdJb0Rlc2NcIiwgXCLlr7zlh7rlvZPliY3nmoTmkJzntKLnu4TkuI7oh6rlrprkuYnmkJzntKLnq5nngrnvvIzliIbkuqvnu5nku5bkurrlkI7lj6/kuIDplK7lr7zlhaXov5jljp/jgILkuI3lkKvmj5DnpLror43orr7nva7jgIJcIil9PC9zcGFuPlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwic2VhcmNoLWNvbmZpZy1pby1yb3dcIj5cclxuICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJzZWFyY2gtY29uZmlnLWlvLWJ0biBzZWFyY2gtY29uZmlnLWV4cG9ydC1idG5cIj5cclxuICAgICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuOFwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNFwiLz48cG9seWxpbmUgcG9pbnRzPVwiNyAxMCAxMiAxNSAxNyAxMFwiLz48bGluZSB4MT1cIjEyXCIgeTE9XCIxNVwiIHgyPVwiMTJcIiB5Mj1cIjNcIi8+PC9zdmc+XHJcbiAgICAgICAgJHttc2coXCJzZXR0aW5nc19vdGhlcl9leHBvcnRDb25maWdcIiwgXCLlr7zlh7rphY3nva5cIil9XHJcbiAgICAgIDwvYnV0dG9uPlxyXG4gICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cInNlYXJjaC1jb25maWctaW8tYnRuIHNlYXJjaC1jb25maWctaW1wb3J0LWJ0blwiPlxyXG4gICAgICAgIDxzdmcgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS44XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMSAxNXY0YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0ydi00XCIvPjxwb2x5bGluZSBwb2ludHM9XCI3IDEwIDEyIDUgMTcgMTBcIi8+PGxpbmUgeDE9XCIxMlwiIHkxPVwiNVwiIHgyPVwiMTJcIiB5Mj1cIjE3XCIvPjwvc3ZnPlxyXG4gICAgICAgICR7bXNnKFwic2V0dGluZ3Nfb3RoZXJfaW1wb3J0Q29uZmlnXCIsIFwi5a+85YWl6YWN572uXCIpfVxyXG4gICAgICA8L2J1dHRvbj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJzZWFyY2gtY29uZmlnLWlvLWhpbnRcIiBhcmlhLWxpdmU9XCJwb2xpdGVcIj48L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuICBgO1xyXG5cclxuICBjYXJkLnF1ZXJ5U2VsZWN0b3IoXCIuc2VhcmNoLWNvbmZpZy1leHBvcnQtYnRuXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBleHBvcnRTZWFyY2hDb25maWcpO1xyXG4gIGNhcmQucXVlcnlTZWxlY3RvcihcIi5zZWFyY2gtY29uZmlnLWltcG9ydC1idG5cIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xyXG4gICAgaW5wdXQudHlwZSA9IFwiZmlsZVwiO1xyXG4gICAgaW5wdXQuYWNjZXB0ID0gXCIuanNvbixhcHBsaWNhdGlvbi9qc29uXCI7XHJcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGhhbmRsZVNlYXJjaENvbmZpZ0ltcG9ydEZpbGUpO1xyXG4gICAgaW5wdXQuY2xpY2soKTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIGNhcmQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4cG9ydFNlYXJjaENvbmZpZygpIHtcclxuICBjb25zdCBwYXlsb2FkID0ge1xyXG4gICAgdmVyc2lvbjogMSxcclxuICAgIGV4cG9ydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgIHNlYXJjaEdyb3Vwczogc3RhdGUuZ3JvdXBzLFxyXG4gICAgY3VzdG9tU2l0ZXM6IHN0YXRlLmN1c3RvbVNpdGVzXHJcbiAgfTtcclxuICBjb25zdCBibG9iID0gbmV3IEJsb2IoW0pTT04uc3RyaW5naWZ5KHBheWxvYWQsIG51bGwsIDIpXSwgeyB0eXBlOiBcImFwcGxpY2F0aW9uL2pzb247Y2hhcnNldD11dGYtOFwiIH0pO1xyXG4gIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XHJcbiAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xyXG4gIGEuaHJlZiA9IHVybDtcclxuICBhLmRvd25sb2FkID0gYFFzaG905pCc57Si6YWN572uLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKX0uanNvbmA7XHJcbiAgYS5jbGljaygpO1xyXG4gIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2VhcmNoQ29uZmlnSW1wb3J0RmlsZShldmVudCkge1xyXG4gIGNvbnN0IGZpbGUgPSBldmVudC50YXJnZXQuZmlsZXM/LlswXTtcclxuICBpZiAoIWZpbGUpIHJldHVybjtcclxuXHJcbiAgbGV0IHBheWxvYWQ7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCBmaWxlLnRleHQoKTtcclxuICAgIHBheWxvYWQgPSBKU09OLnBhcnNlKHRleHQpO1xyXG4gIH0gY2F0Y2ggKF8pIHtcclxuICAgIGFsZXJ0KG1zZyhcInNldHRpbmdzX290aGVyX2ltcG9ydFBhcnNlRXJyb3JcIiwgXCLml6Dms5Xop6PmnpDmlofku7bvvIzor7fnoa7orqTmmK/lkKbkuLrku47mnKzmj5Lku7blr7zlh7rnmoQgSlNPTiDphY3nva7mlofku7bjgIJcIikpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFwYXlsb2FkIHx8IHR5cGVvZiBwYXlsb2FkICE9PSBcIm9iamVjdFwiIHx8IHBheWxvYWQudmVyc2lvbiAhPT0gMSkge1xyXG4gICAgYWxlcnQobXNnKFwic2V0dGluZ3Nfb3RoZXJfaW1wb3J0SW52YWxpZEZvcm1hdFwiLCBcIuaWh+S7tuagvOW8j+S4jeato+ehru+8jOivt+S9v+eUqOacrOaPkuS7tuWvvOWHuueahOaQnOe0oumFjee9ruaWh+S7tuOAglwiKSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBpbXBvcnRlZEdyb3VwcyA9IEFycmF5LmlzQXJyYXkocGF5bG9hZC5zZWFyY2hHcm91cHMpID8gcGF5bG9hZC5zZWFyY2hHcm91cHMgOiBbXTtcclxuICBjb25zdCBpbXBvcnRlZEN1c3RvbVNpdGVzID0gQXJyYXkuaXNBcnJheShwYXlsb2FkLmN1c3RvbVNpdGVzKSA/IHBheWxvYWQuY3VzdG9tU2l0ZXMgOiBbXTtcclxuXHJcbiAgaWYgKCFpbXBvcnRlZEdyb3Vwcy5sZW5ndGggJiYgIWltcG9ydGVkQ3VzdG9tU2l0ZXMubGVuZ3RoKSB7XHJcbiAgICBhbGVydChtc2coXCJzZXR0aW5nc19vdGhlcl9pbXBvcnRFbXB0eVwiLCBcIuaWh+S7tuS4reayoeacieWPr+WvvOWFpeeahOaQnOe0oue7hOaIluiHquWumuS5ieermeeCueOAglwiKSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBncm91cENvdW50ID0gaW1wb3J0ZWRHcm91cHMubGVuZ3RoO1xyXG4gIGNvbnN0IHNpdGVDb3VudCA9IGltcG9ydGVkQ3VzdG9tU2l0ZXMubGVuZ3RoO1xyXG4gIGNvbnN0IGRlc2MgPSBbXHJcbiAgICBncm91cENvdW50ID8gYCR7Z3JvdXBDb3VudH0g5Liq5pCc57Si57uEYCA6IFwiXCIsXHJcbiAgICBzaXRlQ291bnQgPyBgJHtzaXRlQ291bnR9IOS4quiHquWumuS5ieermeeCuWAgOiBcIlwiXHJcbiAgXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIuOAgVwiKTtcclxuXHJcbiAgY29uc3QgY29uZmlybWVkID0gY29uZmlybShbXHJcbiAgICBtc2coXCJzZXR0aW5nc19vdGhlcl9pbXBvcnRDb25maXJtTGluZTFQcmVmaXhcIiwgXCLljbPlsIblr7zlhaUgXCIpICsgZGVzYyArIG1zZyhcInNldHRpbmdzX290aGVyX2ltcG9ydENvbmZpcm1MaW5lMVN1ZmZpeFwiLCBcIuOAglwiKSxcclxuICAgIFwiXCIsXHJcbiAgICBtc2coXCJzZXR0aW5nc19vdGhlcl9pbXBvcnRDb25maXJtTGluZTJQcmVmaXhcIiwgXCLlr7zlhaXlkI7lsIblrozlhajopobnm5blvZPliY3nmoTmkJzntKLnu4TphY3nva5cIikgKyAoc2l0ZUNvdW50ID8gbXNnKFwic2V0dGluZ3Nfb3RoZXJfaW1wb3J0Q29uZmlybUxpbmUyU2l0ZXNcIiwgXCLlkozoh6rlrprkuYnnq5nngrlcIikgOiBcIlwiKSArIG1zZyhcInNldHRpbmdzX290aGVyX2ltcG9ydENvbmZpcm1MaW5lMlN1ZmZpeFwiLCBcIu+8jOatpOaTjeS9nOS4jeWPr+aSpOmUgOOAglwiKSxcclxuICAgIFwiXCIsXHJcbiAgICBtc2coXCJzZXR0aW5nc19vdGhlcl9pbXBvcnRDb25maXJtTGluZTNcIiwgXCLnoa7orqTnu6fnu63vvJ9cIilcclxuICBdLmpvaW4oXCJcXG5cIikpO1xyXG4gIGlmICghY29uZmlybWVkKSByZXR1cm47XHJcblxyXG4gIGlmIChpbXBvcnRlZEN1c3RvbVNpdGVzLmxlbmd0aCkge1xyXG4gICAgc3RhdGUuY3VzdG9tU2l0ZXMgPSBjcmVhdGVOb3JtYWxpemVkQ3VzdG9tU2l0ZXMoaW1wb3J0ZWRDdXN0b21TaXRlcyk7XHJcbiAgICBjb25zdCBidWlsdGluU2l0ZXMgPSBzdGF0ZS5zaXRlcy5maWx0ZXIoKHNpdGUpID0+ICFzaXRlLmlzQ3VzdG9tKTtcclxuICAgIHN0YXRlLnNpdGVzID0gbWVyZ2VTaXRlcyhidWlsdGluU2l0ZXMsIHN0YXRlLmN1c3RvbVNpdGVzKTtcclxuICB9XHJcbiAgaWYgKGltcG9ydGVkR3JvdXBzLmxlbmd0aCkge1xyXG4gICAgc3RhdGUuZ3JvdXBzID0gY3JlYXRlTm9ybWFsaXplZEdyb3VwcyhpbXBvcnRlZEdyb3Vwcyk7XHJcbiAgfVxyXG5cclxuICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgcmVuZGVyT3RoZXJTZWN0aW9uKCk7XHJcblxyXG4gIGlmIChzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcImdyb3Vwc1wiKSB7XHJcbiAgICBzdGF0ZS5yZW5kZXJHcm91cHNTZWN0aW9uKCk7XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcImN1c3RvbVwiKSB7XHJcbiAgICBzdGF0ZS5yZW5kZXJDdXN0b21TZWN0aW9uKCk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVTaG9ydGN1dHNQYWdlSGludCgpIHtcclxuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHJvdy5jbGFzc05hbWUgPSBcInNob3J0Y3V0LXBhZ2UtaGludFwiO1xyXG4gIHJvdy5pbm5lckhUTUwgPSBgJHttc2coXCJzZXR0aW5nc19vdGhlcl9zaG9ydGN1dHNIaW50UHJlZml4XCIsIFwi5Lmf5Y+v5YmN5b6A5rWP6KeI5Zmo55qEXCIpfTxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwic2hvcnRjdXQtcGFnZS1saW5rXCI+JHttc2coXCJzZXR0aW5nc19vdGhlcl9zaG9ydGN1dHNIaW50TGlua1wiLCBcIuaJqeWxlemUruebmOW/q+aNt+aWueW8j1wiKX08L2J1dHRvbj4ke21zZyhcInNldHRpbmdzX290aGVyX3Nob3J0Y3V0c0hpbnRTdWZmaXhcIiwgXCLvvIzlsIbjgIzmv4DmtLvmianlsZXjgI3mlLnkuLrlv6vmjbfmv4DmtLvpobbpg6jlvLnnqpfvvIjku7vmhI/pobXpnaLlnYflj6/llKTotbfvvInjgIJcIil9YDtcclxuXHJcbiAgY29uc3QgYnRuID0gcm93LnF1ZXJ5U2VsZWN0b3IoXCIuc2hvcnRjdXQtcGFnZS1saW5rXCIpO1xyXG4gIGJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgIGNvbnN0IGlzRWRnZSA9IC9FZGdcXC8vLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XHJcbiAgICBjb25zdCB1cmwgPSBpc0VkZ2UgPyBcImVkZ2U6Ly9leHRlbnNpb25zL3Nob3J0Y3V0c1wiIDogXCJjaHJvbWU6Ly9leHRlbnNpb25zL3Nob3J0Y3V0c1wiO1xyXG4gICAgY2hyb21lLnRhYnMuY3JlYXRlKHsgdXJsIH0pLmNhdGNoKCgpID0+IHt9KTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHJvdztcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU2hvcnRjdXRSZWNvcmRlclJvdygpIHtcclxuICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYXJ0aWNsZVwiKTtcclxuICByb3cuY2xhc3NOYW1lID0gXCJvdGhlci1zZXR0aW5nLXJvdyBvdGhlci1zZXR0aW5nLXJvdy0td2l0aC10aXAgc2hvcnRjdXQtcm93XCI7XHJcbiAgcm93LmlubmVySFRNTCA9IGBcclxuICAgIDxkaXYgY2xhc3M9XCJvdGhlci1zZXR0aW5nLXJvdy1tYWluXCI+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJvdGhlci1zZXR0aW5nLWNvcHlcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZy10aXRsZVwiPiR7bXNnKFwic2V0dGluZ3Nfb3RoZXJfY3VzdG9tU2hvcnRjdXRUaXRsZVwiLCBcIuiHquWumuS5ieW/q+aNt+mUrlwiKX08L2Rpdj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZy1kZXNjXCI+JHttc2coXCJzZXR0aW5nc19vdGhlcl9jdXN0b21TaG9ydGN1dERlc2NcIiwgXCLngrnlh7vlj7PkvqfmjInpkq7lkI7mjInkuIvnu4TlkIjplK7ljbPlj6/lvZXliLbjgILlv4Xpobvoh7PlsJHljIXlkKvkuIDkuKrkv67ppbDplK7vvIhDdHJsIC8gQWx0IC8gU2hpZnQgLyBXaW7vvInjgIJcIil9PC9kaXY+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgICA8ZGl2IGNsYXNzPVwic2hvcnRjdXQtcmVjb3JkZXJcIj5cclxuICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cInNob3J0Y3V0LWRpc3BsYXlcIiBhcmlhLWxhYmVsPVwiJHttc2coXCJzZXR0aW5nc19vdGhlcl9yZWNvcmRTaG9ydGN1dEFyaWFcIiwgXCLlvZXliLblv6vmjbfplK5cIil9XCI+PC9idXR0b24+XHJcbiAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJzaG9ydGN1dC1yZXNldFwiIHRpdGxlPVwiJHttc2coXCJzZXR0aW5nc19vdGhlcl9yZXNldFNob3J0Y3V0VGl0bGVcIiwgXCLmgaLlpI3pu5jorqQgQWx0ICsgUVwiKX1cIj4ke21zZyhcInNldHRpbmdzX290aGVyX3Jlc2V0U2hvcnRjdXRcIiwgXCLmgaLlpI3pu5jorqRcIil9PC9idXR0b24+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZy1kZXNjIHNob3J0Y3V0LXRpcFwiPiR7bXNnKFwic2V0dGluZ3Nfb3RoZXJfc2hvcnRjdXRSZWZyZXNoVGlwXCIsIFwi5o+Q56S677ya5L+u5pS55b+r5o236ZSu5ZCO77yM6ZyA6KaB5Yi35paw5b2T5YmN572R6aG15omN5Lya55Sf5pWI44CCXCIpfTwvZGl2PlxyXG4gIGA7XHJcblxyXG4gIGNvbnN0IGRpc3BsYXkgPSByb3cucXVlcnlTZWxlY3RvcihcIi5zaG9ydGN1dC1kaXNwbGF5XCIpO1xyXG4gIGNvbnN0IHJlc2V0QnRuID0gcm93LnF1ZXJ5U2VsZWN0b3IoXCIuc2hvcnRjdXQtcmVzZXRcIik7XHJcbiAgbGV0IGlzUmVjb3JkaW5nID0gZmFsc2U7XHJcblxyXG4gIGZ1bmN0aW9uIHJlbmRlckRpc3BsYXkoKSB7XHJcbiAgICBpZiAoIShkaXNwbGF5IGluc3RhbmNlb2YgSFRNTEJ1dHRvbkVsZW1lbnQpKSByZXR1cm47XHJcbiAgICBpZiAoaXNSZWNvcmRpbmcpIHtcclxuICAgICAgZGlzcGxheS50ZXh0Q29udGVudCA9IG1zZyhcInNldHRpbmdzX290aGVyX3JlY29yZGluZ1wiLCBcIuaMieS4i+e7hOWQiOmUruKAplwiKTtcclxuICAgICAgZGlzcGxheS5jbGFzc0xpc3QuYWRkKFwiaXMtcmVjb3JkaW5nXCIpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgZGlzcGxheS50ZXh0Q29udGVudCA9IGZvcm1hdFNob3J0Y3V0KHN0YXRlLnVpUHJlZnMub3ZlcmxheVNob3J0Y3V0KTtcclxuICAgICAgZGlzcGxheS5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtcmVjb3JkaW5nXCIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gc3RvcFJlY29yZGluZygpIHtcclxuICAgIGlmICghaXNSZWNvcmRpbmcpIHJldHVybjtcclxuICAgIGlzUmVjb3JkaW5nID0gZmFsc2U7XHJcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbktleURvd24sIHRydWUpO1xyXG4gICAgcmVuZGVyRGlzcGxheSgpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZnVuY3Rpb24gb25LZXlEb3duKGV2ZW50KSB7XHJcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblxyXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIikge1xyXG4gICAgICBzdG9wUmVjb3JkaW5nKCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByYXdLZXkgPSBldmVudC5rZXk7XHJcbiAgICBpZiAocmF3S2V5ID09PSBcIkNvbnRyb2xcIiB8fCByYXdLZXkgPT09IFwiU2hpZnRcIiB8fCByYXdLZXkgPT09IFwiQWx0XCIgfHwgcmF3S2V5ID09PSBcIk1ldGFcIikge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY2FuZGlkYXRlID0ge1xyXG4gICAgICBjdHJsS2V5OiAhIWV2ZW50LmN0cmxLZXksXHJcbiAgICAgIHNoaWZ0S2V5OiAhIWV2ZW50LnNoaWZ0S2V5LFxyXG4gICAgICBhbHRLZXk6ICEhZXZlbnQuYWx0S2V5LFxyXG4gICAgICBtZXRhS2V5OiAhIWV2ZW50Lm1ldGFLZXksXHJcbiAgICAgIGtleTogcmF3S2V5Lmxlbmd0aCA9PT0gMSA/IHJhd0tleS50b1VwcGVyQ2FzZSgpIDogcmF3S2V5XHJcbiAgICB9O1xyXG5cclxuICAgIGlmICghaXNTaG9ydGN1dFZhbGlkKGNhbmRpZGF0ZSkpIHtcclxuICAgICAgZGlzcGxheS50ZXh0Q29udGVudCA9IG1zZyhcInNldHRpbmdzX290aGVyX3JlY29yZEludmFsaWRcIiwgXCLlv4XpobvljIXlkKvkv67ppbDplK7vvIzor7fph43or5VcIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0ZS51aVByZWZzLm92ZXJsYXlTaG9ydGN1dCA9IGNhbmRpZGF0ZTtcclxuICAgIGF3YWl0IHBlcnNpc3RBbGwoKTtcclxuICAgIHN0b3BSZWNvcmRpbmcoKTtcclxuICB9XHJcblxyXG4gIGRpc3BsYXk/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBpZiAoaXNSZWNvcmRpbmcpIHtcclxuICAgICAgc3RvcFJlY29yZGluZygpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpc1JlY29yZGluZyA9IHRydWU7XHJcbiAgICByZW5kZXJEaXNwbGF5KCk7XHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbktleURvd24sIHRydWUpO1xyXG4gIH0pO1xyXG5cclxuICByZXNldEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgIHN0YXRlLnVpUHJlZnMub3ZlcmxheVNob3J0Y3V0ID0gbm9ybWFsaXplU2hvcnRjdXQobnVsbCk7XHJcbiAgICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgICByZW5kZXJEaXNwbGF5KCk7XHJcbiAgfSk7XHJcblxyXG4gIHJlbmRlckRpc3BsYXkoKTtcclxuICByZXR1cm4gcm93O1xyXG59XHJcbiIsICJpbXBvcnQgeyBSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZLCBSQU5ET01fUVVFU1RJT05TX0ZJTEVTIH0gZnJvbSBcIi4uLy4uLy4uL3NoYXJlZC9zdG9yYWdlLWtleXMuanNcIjtcclxuaW1wb3J0IHsgc3RhdGUsIG1zZyB9IGZyb20gXCIuLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQgeyBlc2NhcGVIdG1sIH0gZnJvbSBcIi4uL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7IGNyZWF0ZU90aGVyU2V0dGluZ1RvZ2dsZSB9IGZyb20gXCIuL290aGVyLmpzXCI7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZERlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0KHByZWZlcnJlZExhbmcgPSBcIlwiKSB7XHJcbiAgY29uc3QgbGFuZyA9IFN0cmluZyhwcmVmZXJyZWRMYW5nIHx8ICgoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjaHJvbWVMYW5nID0gKGNocm9tZT8uaTE4bj8uZ2V0VUlMYW5ndWFnZT8uKCkgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICAgICAgaWYgKGNocm9tZUxhbmcpIHJldHVybiBjaHJvbWVMYW5nO1xyXG4gICAgICBjb25zdCBuYXZMYW5nID0gKG5hdmlnYXRvcj8ubGFuZ3VhZ2UgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICAgICAgcmV0dXJuIG5hdkxhbmcgfHwgXCJcIjtcclxuICAgIH0gY2F0Y2ggKF9lKSB7XHJcbiAgICAgIHJldHVybiAobmF2aWdhdG9yLmxhbmd1YWdlIHx8IFwiXCIpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICB9XHJcbiAgfSkoKSkudG9Mb3dlckNhc2UoKTtcclxuICBjb25zdCBwYXRoID0gbGFuZy5zdGFydHNXaXRoKFwiemhcIikgPyBSQU5ET01fUVVFU1RJT05TX0ZJTEVTLnpoIDogUkFORE9NX1FVRVNUSU9OU19GSUxFUy5lbjtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKHBhdGgpKTtcclxuICAgIHJldHVybiByZXMub2sgPyBhd2FpdCByZXMudGV4dCgpIDogXCJcIjtcclxuICB9IGNhdGNoIChfZSkge1xyXG4gICAgcmV0dXJuIFwiXCI7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjb3VudFJhbmRvbVF1ZXN0aW9ucyh0ZXh0KSB7XHJcbiAgaWYgKHR5cGVvZiB0ZXh0ICE9PSBcInN0cmluZ1wiKSByZXR1cm4gMDtcclxuICByZXR1cm4gdGV4dFxyXG4gICAgLnNwbGl0KC9cXHI/XFxuLylcclxuICAgIC5tYXAoKGxpbmUpID0+IGxpbmUudHJpbSgpKVxyXG4gICAgLmZpbHRlcigobGluZSkgPT4gbGluZSAmJiAhbGluZS5zdGFydHNXaXRoKFwiI1wiKSlcclxuICAgIC5sZW5ndGg7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHBlcnNpc3RSYW5kb21RdWVzdGlvbnNUZXh0KCkge1xyXG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZXTogc3RhdGUucmFuZG9tUXVlc3Rpb25zVGV4dCB9KTtcclxufVxyXG5cclxuLy8g5oqK5Y6f5aeL5paH5pys77yI5peg5bqP5Y+377yJ6L2s5o2i5Li65bim5bqP5Y+355qE5pi+56S65paH5pys77yIXCIxLiBRXFxuMi4gUVxcbuKAplwi77yJXHJcbmZ1bmN0aW9uIHJhd1RvTnVtYmVyZWQocmF3KSB7XHJcbiAgaWYgKCFyYXcpIHJldHVybiBcIlwiO1xyXG4gIGxldCBpZHggPSAwO1xyXG4gIHJldHVybiByYXcuc3BsaXQoL1xccj9cXG4vKS5tYXAoKGxpbmUpID0+IHtcclxuICAgIGlmICghbGluZS50cmltKCkpIHJldHVybiBcIlwiO1xyXG4gICAgaWR4Kys7XHJcbiAgICByZXR1cm4gaWR4ICsgXCIuIFwiICsgbGluZTtcclxuICB9KS5qb2luKFwiXFxuXCIpO1xyXG59XHJcblxyXG4vLyDmiormmL7npLrmlofmnKzvvIjlj6/og73luKbluo/lj7fliY3nvIDvvInov5jljp/kuLrljp/lp4vmlofmnKxcclxuZnVuY3Rpb24gbnVtYmVyZWRUb1JhdyhudW1iZXJlZCkge1xyXG4gIHJldHVybiBudW1iZXJlZC5zcGxpdCgvXFxyP1xcbi8pLm1hcCgobGluZSkgPT4ge1xyXG4gICAgcmV0dXJuIGxpbmUucmVwbGFjZSgvXlxcZCtcXC5cXHMrLywgXCJcIik7XHJcbiAgfSkuam9pbihcIlxcblwiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclJhbmRvbVNlY3Rpb24oKSB7XHJcbiAgY29uc3QgeyByYW5kb21TZWN0aW9uIH0gPSBzdGF0ZS5kb207XHJcbiAgcmFuZG9tU2VjdGlvbi5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICAvLyDor63oqIDmo4DmtYvvvJrpnZ7kuK3mlofnjq/looPliIfmjaLkuLroi7HmlodcclxuICBjb25zdCBpc1poID0gKCgpID0+IHtcclxuICAgIHRyeSB7IHJldHVybiAoY2hyb21lPy5pMThuPy5nZXRVSUxhbmd1YWdlPy4oKSB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoXCJ6aFwiKTsgfSBjYXRjaCAoXykgeyByZXR1cm4gdHJ1ZTsgfVxyXG4gIH0pKCk7XHJcblxyXG4gIC8vIOKAlOKAlCDpobbpg6jvvJrmmL7npLrpqrDlrZDmjInpkq7lvIDlhbMg4oCU4oCUXHJcbiAgY29uc3Qgc3dpdGNoQ2FyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzZWN0aW9uXCIpO1xyXG4gIHN3aXRjaENhcmQuY2xhc3NOYW1lID0gXCJvdGhlci1zZXR0aW5ncy1jYXJkXCI7XHJcbiAgc3dpdGNoQ2FyZC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz1cIm90aGVyLXNldHRpbmdzLWxpc3RcIj48L2Rpdj5gO1xyXG4gIGNvbnN0IHN3aXRjaExpc3QgPSBzd2l0Y2hDYXJkLnF1ZXJ5U2VsZWN0b3IoXCIub3RoZXItc2V0dGluZ3MtbGlzdFwiKTtcclxuICBzd2l0Y2hMaXN0Py5hcHBlbmRDaGlsZChcclxuICAgIGNyZWF0ZU90aGVyU2V0dGluZ1RvZ2dsZShcclxuICAgICAgXCJzaG93UmFuZG9tQnV0dG9uXCIsXHJcbiAgICAgIG1zZyhcInNldHRpbmdzX3JhbmRvbV9zaG93U3dpdGNoVGl0bGVcIiwgXCLmmL7npLrpmo/mnLrpqrDlrZDmjInpkq5cIiksXHJcbiAgICAgIG1zZyhcInNldHRpbmdzX3JhbmRvbV9zaG93U3dpdGNoRGVzY1wiLCBcIuW8gOWQr+WQju+8jOi+k+WFpeahhuS4i+aWueS8muWHuueOsOmqsOWtkOaMiemSru+8jOeCueWHu+WNs+WPr+S7juS4i+aWuemimOW6k+mHjOmaj+acuuaKveWPluS4gOS4qumXrumimOWhq+WFpeaQnOe0ouahhuOAglwiKVxyXG4gICAgKVxyXG4gICk7XHJcbiAgLy8g4oCU4oCUIOWJr+agh+mimOS4i+aWueivtOaYjuaWh+WtlyDigJTigJRcclxuICBjb25zdCBpbnRyb0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaW50cm9EaXYuY2xhc3NOYW1lID0gXCJyYW5kb20taW50cm8tdGV4dFwiO1xyXG5cclxuICBjb25zdCBwMSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xyXG4gIHAxLmNsYXNzTmFtZSA9IFwicmFuZG9tLWhpbnQtcGFyYVwiO1xyXG4gIHAxLnRleHRDb250ZW50ID0gaXNaaFxyXG4gICAgPyBcIuW+iOWkmuaXtuWAmeS4jeaYr+S4jeaDs+eUqCBBSe+8jOiAjOaYr+S4jeefpemBk+mXruS7gOS5iOOAgumaj+aJi+S4gOeCuemqsOWtkO+8jOS4gOS4quWlvemXrumimOWHuuadpeS6hu+8jOaAneiAg+WwseW8gOWni+S6huOAglwiXHJcbiAgICA6IFwiT2Z0ZW4gdGhlIHByb2JsZW0gaXNuJ3Qgbm90IHdhbnRpbmcgdG8gdXNlIEFJIOKAlCBpdCdzIG5vdCBrbm93aW5nIHdoYXQgdG8gYXNrLiBPbmUgdGFwIG9mIHRoZSBkaWNlLCBhIGdyZWF0IHF1ZXN0aW9uIHN1cmZhY2VzLiBUaGlua2luZyBiZWdpbnMuXCI7XHJcblxyXG4gIGNvbnN0IHAyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XHJcbiAgcDIuY2xhc3NOYW1lID0gXCJyYW5kb20taGludC1wYXJhXCI7XHJcbiAgaWYgKGlzWmgpIHtcclxuICAgIHAyLmlubmVySFRNTCA9IFwi6aKY5bqT5Y+v5Lul6Ieq5bex6K6+572u4oCU4oCU5Zug5Li65pyA5aW955qE6aKY5bqT5rC46L+c5piv5YWz5LqO5L2g6Ieq5bex55qE44CC5qC55o2u5L2g55qE6IGM5Lia44CB5YW06Laj5oiW5oOz5o6i57Si55qE5pa55ZCR77yM5aGr5YWl5L2g55yf5q2j5YWz5b+D55qE6Zeu6aKY77yMPGJyPuiuqeavj+S4gOasoemaj+acuumDveacieS7t+WAvOOAglwiO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBwMi50ZXh0Q29udGVudCA9IFwiQnVpbGQgeW91ciBvd24gcG9vbCDigJQgYmVjYXVzZSB0aGUgYmVzdCBxdWVzdGlvbnMgYXJlIGFsd2F5cyB0aGUgb25lcyBtb3N0IHJlbGV2YW50IHRvIHlvdS4gRmlsbCBpdCB3aXRoIHRvcGljcyB0aWVkIHRvIHlvdXIgcm9sZSwgaW50ZXJlc3RzLCBvciBnb2FscywgYW5kIGV2ZXJ5IHJvbGwgYmVjb21lcyB3b3J0aHdoaWxlLlwiO1xyXG4gIH1cclxuXHJcbiAgaW50cm9EaXYuYXBwZW5kQ2hpbGQocDEpO1xyXG4gIGludHJvRGl2LmFwcGVuZENoaWxkKHAyKTtcclxuICByYW5kb21TZWN0aW9uLmFwcGVuZENoaWxkKGludHJvRGl2KTtcclxuICByYW5kb21TZWN0aW9uLmFwcGVuZENoaWxkKHN3aXRjaENhcmQpO1xyXG5cclxuICAvLyDigJTigJQg5LiL5pa577ya6Zeu6aKY5bqT57yW6L6R5Yy6IOKAlOKAlFxyXG4gIGNvbnN0IHBvb2xDYXJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgcG9vbENhcmQuY2xhc3NOYW1lID0gXCJvdGhlci1zZXR0aW5ncy1jYXJkIHJhbmRvbS1wb29sLWNhcmRcIjtcclxuICBwb29sQ2FyZC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZ3MtaW50cm9cIj5cclxuICAgICAgPHN0cm9uZz4ke2VzY2FwZUh0bWwobXNnKFwic2V0dGluZ3NfcmFuZG9tX3Bvb2xUaXRsZVwiLCBcIumXrumimOW6k1wiKSl9PC9zdHJvbmc+XHJcbiAgICA8L2Rpdj5cclxuICAgIDx0ZXh0YXJlYSBjbGFzcz1cInJhbmRvbS1wb29sLXRleHRhcmVhXCIgc3BlbGxjaGVjaz1cImZhbHNlXCIgcGxhY2Vob2xkZXI9XCIke2VzY2FwZUh0bWwobXNnKFwic2V0dGluZ3NfcmFuZG9tX3Bvb2xQbGFjZWhvbGRlclwiLCBcIuavj+ihjOS4gOS4qumXrumimOKAplwiKSl9XCI+PC90ZXh0YXJlYT5cclxuICAgIDxkaXYgY2xhc3M9XCJyYW5kb20tcG9vbC1mb290ZXJcIj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJyYW5kb20tcG9vbC1jb3VudFwiPjwvc3Bhbj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJyYW5kb20tcG9vbC1zdGF0dXNcIiBhcmlhLWxpdmU9XCJwb2xpdGVcIj48L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuICBgO1xyXG5cclxuICBjb25zdCB0ZXh0YXJlYSA9IHBvb2xDYXJkLnF1ZXJ5U2VsZWN0b3IoXCIucmFuZG9tLXBvb2wtdGV4dGFyZWFcIik7XHJcbiAgY29uc3QgY291bnRFbCA9IHBvb2xDYXJkLnF1ZXJ5U2VsZWN0b3IoXCIucmFuZG9tLXBvb2wtY291bnRcIik7XHJcbiAgY29uc3Qgc3RhdHVzRWwgPSBwb29sQ2FyZC5xdWVyeVNlbGVjdG9yKFwiLnJhbmRvbS1wb29sLXN0YXR1c1wiKTtcclxuXHJcbiAgY29uc3QgdXBkYXRlQ291bnQgPSAocmF3KSA9PiB7XHJcbiAgICBjb25zdCBuID0gY291bnRSYW5kb21RdWVzdGlvbnMocmF3KTtcclxuICAgIGNvdW50RWwudGV4dENvbnRlbnQgPSBtc2coXCJzZXR0aW5nc19yYW5kb21fY291bnRQcmVmaXhcIiwgXCLlvZPliY3lhbEgXCIpICsgbiArIG1zZyhcInNldHRpbmdzX3JhbmRvbV9jb3VudFN1ZmZpeFwiLCBcIiDkuKrpl67popjjgIJcIik7XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgcmVmb3JtYXQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCByYXcgPSBudW1iZXJlZFRvUmF3KHRleHRhcmVhLnZhbHVlKTtcclxuICAgIHRleHRhcmVhLnZhbHVlID0gcmF3VG9OdW1iZXJlZChyYXcpO1xyXG4gICAgdXBkYXRlQ291bnQocmF3KTtcclxuICAgIHJldHVybiByYXc7XHJcbiAgfTtcclxuXHJcbiAgLy8g5Yid5aeL5pi+56S677ya5oqK5a2Y5YKo55qE5Y6f5aeL5paH5pys6L2s5oiQ5bim5bqP5Y+355qE5qC85byPXHJcbiAgY29uc3QgaW5pdGlhbFJhdyA9IHR5cGVvZiBzdGF0ZS5yYW5kb21RdWVzdGlvbnNUZXh0ID09PSBcInN0cmluZ1wiID8gc3RhdGUucmFuZG9tUXVlc3Rpb25zVGV4dCA6IHN0YXRlLmRlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0O1xyXG4gIHRleHRhcmVhLnZhbHVlID0gcmF3VG9OdW1iZXJlZChpbml0aWFsUmF3KTtcclxuICB1cGRhdGVDb3VudChpbml0aWFsUmF3KTtcclxuXHJcbiAgbGV0IHNhdmVUaW1lciA9IG51bGw7XHJcbiAgbGV0IHN0YXR1c1RpbWVyID0gbnVsbDtcclxuXHJcbiAgY29uc3Qgc2hvd1NhdmVkID0gKCkgPT4ge1xyXG4gICAgc3RhdHVzRWwudGV4dENvbnRlbnQgPSBtc2coXCJzZXR0aW5nc19yYW5kb21fc2F2ZWRcIiwgXCLlt7Lkv53lrZhcIik7XHJcbiAgICBzdGF0dXNFbC5jbGFzc0xpc3QuYWRkKFwiaXMtdmlzaWJsZVwiKTtcclxuICAgIGlmIChzdGF0dXNUaW1lcikgY2xlYXJUaW1lb3V0KHN0YXR1c1RpbWVyKTtcclxuICAgIHN0YXR1c1RpbWVyID0gc2V0VGltZW91dCgoKSA9PiBzdGF0dXNFbC5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtdmlzaWJsZVwiKSwgMTIwMCk7XHJcbiAgfTtcclxuXHJcbiAgY29uc3Qgc2NoZWR1bGVTYXZlID0gKHJhdykgPT4ge1xyXG4gICAgaWYgKHNhdmVUaW1lcikgY2xlYXJUaW1lb3V0KHNhdmVUaW1lcik7XHJcbiAgICBzYXZlVGltZXIgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcclxuICAgICAgc2F2ZVRpbWVyID0gbnVsbDtcclxuICAgICAgc3RhdGUucmFuZG9tUXVlc3Rpb25zVGV4dCA9IHJhdztcclxuICAgICAgYXdhaXQgcGVyc2lzdFJhbmRvbVF1ZXN0aW9uc1RleHQoKTtcclxuICAgICAgc2hvd1NhdmVkKCk7XHJcbiAgICB9LCA0MDApO1xyXG4gIH07XHJcblxyXG4gIC8vIEVudGVyIOmUru+8muaLpuaIqum7mOiupOaNouihjO+8jOebtOaOpeaPkuWFpSBcIk4uIFwiIOW8gOWktOeahOaWsOihjO+8jOW6j+WPt+WNs+aXtuWPr+ingVxyXG4gIHRleHRhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XHJcbiAgICBpZiAoZS5rZXkgIT09IFwiRW50ZXJcIikgcmV0dXJuO1xyXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgIGNvbnN0IHN0YXJ0UG9zID0gdGV4dGFyZWEuc2VsZWN0aW9uU3RhcnQ7XHJcbiAgICBjb25zdCBlbmQgPSB0ZXh0YXJlYS5zZWxlY3Rpb25FbmQ7XHJcbiAgICBjb25zdCB2YWx1ZSA9IHRleHRhcmVhLnZhbHVlO1xyXG5cclxuICAgIC8vIOaJvuWFieagh+WJjeacgOWQjuS4gOS4quW4puW6j+WPt+ihjO+8jOS4i+S4gOihjOW6j+WPtyA9IOivpeW6j+WPtyArIDFcclxuICAgIGNvbnN0IGxpbmVzQmVmb3JlQ3Vyc29yID0gdmFsdWUuc3Vic3RyaW5nKDAsIHN0YXJ0UG9zKS5zcGxpdChcIlxcblwiKTtcclxuICAgIGxldCBsYXN0TnVtID0gMDtcclxuICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lc0JlZm9yZUN1cnNvcikge1xyXG4gICAgICBjb25zdCBtID0gbGluZS5tYXRjaCgvXihcXGQrKVxcLlxccy8pO1xyXG4gICAgICBpZiAobSkgbGFzdE51bSA9IHBhcnNlSW50KG1bMV0sIDEwKTtcclxuICAgIH1cclxuICAgIC8vIOWFieagh+aJgOWcqOihjOacrOi6q+WmguaenOaYr+W4puW6j+WPt+ihjO+8jOS5n+eul+i/m+WOu1xyXG4gICAgY29uc3QgY3VyTGluZSA9IGxpbmVzQmVmb3JlQ3Vyc29yW2xpbmVzQmVmb3JlQ3Vyc29yLmxlbmd0aCAtIDFdIHx8IFwiXCI7XHJcbiAgICBjb25zdCBjdXJNYXRjaCA9IGN1ckxpbmUubWF0Y2goL14oXFxkKylcXC5cXHMvKTtcclxuICAgIGlmIChjdXJNYXRjaCkgbGFzdE51bSA9IE1hdGgubWF4KGxhc3ROdW0sIHBhcnNlSW50KGN1ck1hdGNoWzFdLCAxMCkpO1xyXG5cclxuICAgIGNvbnN0IG5leHROdW0gPSBsYXN0TnVtICsgMTtcclxuICAgIGNvbnN0IGluc2VydGlvbiA9IFwiXFxuXCIgKyBuZXh0TnVtICsgXCIuIFwiO1xyXG4gICAgY29uc3QgbmV3VmFsdWUgPSB2YWx1ZS5zdWJzdHJpbmcoMCwgc3RhcnRQb3MpICsgaW5zZXJ0aW9uICsgdmFsdWUuc3Vic3RyaW5nKGVuZCk7XHJcbiAgICB0ZXh0YXJlYS52YWx1ZSA9IG5ld1ZhbHVlO1xyXG5cclxuICAgIGNvbnN0IG5ld1BvcyA9IHN0YXJ0UG9zICsgaW5zZXJ0aW9uLmxlbmd0aDtcclxuICAgIHRleHRhcmVhLnNldFNlbGVjdGlvblJhbmdlKG5ld1BvcywgbmV3UG9zKTtcclxuXHJcbiAgICBjb25zdCByYXcgPSBudW1iZXJlZFRvUmF3KG5ld1ZhbHVlKTtcclxuICAgIHVwZGF0ZUNvdW50KHJhdyk7XHJcbiAgICBzY2hlZHVsZVNhdmUocmF3KTtcclxuICB9KTtcclxuXHJcbiAgLy8g5pmu6YCa6L6T5YWl5pe25Y+q5pu05paw6K6h5pWw5ZKM5o6S56iL5L+d5a2Y77yI5LiN6YeN5paw57yW5Y+377yM6YG/5YWN5YWJ5qCH6Lez5Yqo77yJXHJcbiAgdGV4dGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcclxuICAgIGNvbnN0IHJhdyA9IG51bWJlcmVkVG9SYXcodGV4dGFyZWEudmFsdWUpO1xyXG4gICAgdXBkYXRlQ291bnQocmF3KTtcclxuICAgIHNjaGVkdWxlU2F2ZShyYXcpO1xyXG4gIH0pO1xyXG5cclxuICAvLyDlpLHnhKbml7bph43mlrDnvJblj7fvvIzlubbnq4vljbPkv53lrZjvvIjpmLLmraLlv6vpgJ/nprvlvIDpobXpnaLml7bkuKLlpLHvvIlcclxuICB0ZXh0YXJlYS5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCBhc3luYyAoKSA9PiB7XHJcbiAgICBpZiAoc2F2ZVRpbWVyKSB7IGNsZWFyVGltZW91dChzYXZlVGltZXIpOyBzYXZlVGltZXIgPSBudWxsOyB9XHJcbiAgICBjb25zdCByYXcgPSByZWZvcm1hdCgpO1xyXG4gICAgc3RhdGUucmFuZG9tUXVlc3Rpb25zVGV4dCA9IHJhdztcclxuICAgIGF3YWl0IHBlcnNpc3RSYW5kb21RdWVzdGlvbnNUZXh0KCk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIOeymOi0tOWQjueri+WNs+mHjeaWsOe8luWPt1xyXG4gIHRleHRhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXCJwYXN0ZVwiLCAoKSA9PiB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBjb25zdCByYXcgPSByZWZvcm1hdCgpO1xyXG4gICAgICBzY2hlZHVsZVNhdmUocmF3KTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICByYW5kb21TZWN0aW9uLmFwcGVuZENoaWxkKHBvb2xDYXJkKTtcclxuXHJcbiAgLy8g4oCU4oCUIOW6lemDqO+8muS9v+eUqOivtOaYjiArIEFJIOWNj+WQjOWItuWumumimOW6k+aPkOekuuivjSDigJTigJRcclxuICBjb25zdCBDT1BZUFJPTVBUID0gaXNaaFxyXG4gICAgPyBg5oiR5oOz5a6a5Yi25LiA5aWX5LiT5bGeIEFJIOaPkOmXrumimOW6k++8jOeUqOS6juavj+Wkqemaj+acuuaKveWPlumXrumimO+8jOW5tuebtOaOpeWPkemAgee7mSBBSSDov5vooYzliIbmnpDjgIHmkJzntKLjgIHmi4bop6PmiJbnlJ/miJDlu7rorq7jgIJcclxuXHJcbuaIkeeahOi6q+S7vSAvIOiBjOS4mu+8mlvloavlhpnkvaDnmoTogYzkuJrjgIHooYzkuJrmiJbop5LoibJdXHJcbuaIkeWFs+azqOeahOaWueWQke+8mlvloavlhpnkvaDmnIDov5HlhbPlv4PnmoTpoobln5/miJblhbTotqNdXHJcbuaIkeW9k+WJjeaDs+ino+WGs+eahOmXrumimO+8mlvloavlhpnkvaDnmoTnm67moIfjgIHlm7Dmg5HmiJbmraPlnKjlgZrnmoTkuotdXHJcblxyXG7or7fmoLnmja7ku6XkuIrkv6Hmga/vvIznlJ/miJAgMzAg5Liq6auY6LSo6YeP6Zeu6aKY44CCXHJcblxyXG7opoHmsYLvvJpcclxu5q+P5Liq6Zeu6aKY6YO96KaB6YCC5ZCI55u05o6l5Y+R6YCB57uZIEFJIOS9v+eUqFxyXG7pl67popjopoHph4fnlKjmuIXmmbDjgIHlrqLop4LjgIHlj6/liIbmnpDnmoTooajovr7mlrnlvI9cclxu6Zeu6aKY6KaB6IO95byV5a+8IEFJIOi+k+WHuuWIhuaekOOAgeaWueazleOAgeahiOS+i+OAgeatpemqpOOAgeWvueavlOaIluW7uuiurlxyXG7pl67popjopoHotLTov5HmiJHnmoTouqvku73jgIHlhbPms6jmlrnlkJHlkozlvZPliY3pl67pophcclxu6Zeu6aKY5LiN6KaB5aSq5a695rOb77yM6KaB5pyJ5YW35L2T5Zy65pmv5oiW5piO56Gu5YiH5YWl54K577yM6KaG55uW6KGM5Lia5rSe5a+f44CB5a6e5pON5pa55rOV44CB5py65Lya5Y+R546w44CB6aOO6Zmp5Yik5pat44CB5aSN55uY5LyY5YyW562J5pa55ZCRXHJcbuS4jeimgei+k+WHuuWIhuexu+OAgee8luWPt+OAgeino+mHiuOAgeagh+mimOaIluWkmuS9meWGheWuuVxyXG7mr4/kuKrpl67popjljZXni6zljaDkuIDooYxgXHJcbiAgICA6IGBJIHdhbnQgdG8gYnVpbGQgYSBjdXN0b20gQUkgcXVlc3Rpb24gYmFuayDigJQgYSBwZXJzb25hbCBjb2xsZWN0aW9uIG9mIHByb21wdHMgZm9yIGRhaWx5IHVzZSwgc2VudCBkaXJlY3RseSB0byBBSSBmb3IgYW5hbHlzaXMsIHJlc2VhcmNoLCBicmVha2Rvd24sIG9yIGdlbmVyYXRpbmcgcmVjb21tZW5kYXRpb25zLlxyXG5cclxuTXkgcm9sZSAvIHByb2Zlc3Npb246IFt5b3VyIGpvYiB0aXRsZSwgaW5kdXN0cnksIG9yIHJvbGVdXHJcbk15IGZvY3VzIGFyZWE6IFt3aGF0IHlvdSdyZSBjdXJyZW50bHkgaW50ZXJlc3RlZCBpbiBvciBleHBsb3JpbmddXHJcbk15IGN1cnJlbnQgY2hhbGxlbmdlOiBbeW91ciBnb2FsLCBxdWVzdGlvbiwgb3Igb25nb2luZyBwcm9qZWN0XVxyXG5cclxuQmFzZWQgb24gdGhlIGFib3ZlLCBnZW5lcmF0ZSAzMCBoaWdoLXF1YWxpdHkgcXVlc3Rpb25zLlxyXG5cclxuUmVxdWlyZW1lbnRzOlxyXG5FdmVyeSBxdWVzdGlvbiBzaG91bGQgYmUgc3VpdGFibGUgZm9yIHNlbmRpbmcgZGlyZWN0bHkgdG8gYW4gQUlcclxuUXVlc3Rpb25zIHNob3VsZCBiZSBjbGVhciwgc3BlY2lmaWMsIGFuZCBhbmFseXRpY2FsbHkgZnJhbWVkXHJcblF1ZXN0aW9ucyBzaG91bGQgcHJvbXB0IHRoZSBBSSB0byBwcm9kdWNlIGFuYWx5c2lzLCBtZXRob2RzLCBleGFtcGxlcywgc3RlcHMsIGNvbXBhcmlzb25zLCBvciByZWNvbW1lbmRhdGlvbnNcclxuUXVlc3Rpb25zIHNob3VsZCBiZSByZWxldmFudCB0byBteSByb2xlLCBmb2N1cyBhcmVhLCBhbmQgY3VycmVudCBjaGFsbGVuZ2VcclxuQXZvaWQgdmFndWUgcXVlc3Rpb25zIOKAlCBlYWNoIHNob3VsZCBoYXZlIGEgY29uY3JldGUgYW5nbGUgb3Igc2NlbmFyaW8sIGNvdmVyaW5nIGFyZWFzIHN1Y2ggYXMgaW5kdXN0cnkgaW5zaWdodHMsIHByYWN0aWNhbCBhcHByb2FjaGVzLCBvcHBvcnR1bml0eSBkaXNjb3ZlcnksIHJpc2sgYXNzZXNzbWVudCwgYW5kIHJldHJvc3BlY3RpdmUgaW1wcm92ZW1lbnRcclxuRG8gbm90IGluY2x1ZGUgY2F0ZWdvcmllcywgbnVtYmVycywgZXhwbGFuYXRpb25zLCBoZWFkaW5ncywgb3IgYW55IGV4dHJhIGNvbnRlbnRcclxuT25lIHF1ZXN0aW9uIHBlciBsaW5lYDtcclxuXHJcbiAgY29uc3QgaGludENhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICBoaW50Q2FyZC5jbGFzc05hbWUgPSBcIm90aGVyLXNldHRpbmdzLWNhcmQgcmFuZG9tLWhpbnQtY2FyZFwiO1xyXG4gIGNvbnN0IGhpbnQzVGV4dCA9IGlzWmhcclxuICAgID8gXCLkvaDkuZ/lj6/ku6XorqkgQUkg5biu5L2g5LiA6LW35a6M5oiQ77yM5Y2P5ZCM5Yi25a6a5LiA5aWX5bGe5LqO6Ieq5bex55qE5LiT5bGe6aKY5bqT44CC5Y+C6ICD5LiL5pa55o+Q56S66K+N55u05o6l5Y+R57uZ5Lu75oSPIEFJ77yaXCJcclxuICAgIDogXCJZb3UgY2FuIGFsc28gbGV0IEFJIGhlbHAgeW91IGJ1aWxkIGl0LiBTZW5kIHRoZSBwcm9tcHQgYmVsb3cgdG8gYW55IEFJIHRvIGdldCBzdGFydGVkOlwiO1xyXG4gIGNvbnN0IGNvcHlMYWJlbCA9IGlzWmggPyBcIuWkjeWItlwiIDogXCJDb3B5XCI7XHJcbiAgY29uc3QgY29weUFyaWFMYWJlbCA9IGlzWmggPyBcIuWkjeWItuaPkOekuuivjVwiIDogXCJDb3B5IHByb21wdFwiO1xyXG5cclxuICBoaW50Q2FyZC5pbm5lckhUTUwgPSBgXHJcbiAgICA8cCBjbGFzcz1cInJhbmRvbS1oaW50LXBhcmFcIj4ke2hpbnQzVGV4dC5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIikucmVwbGFjZSgvPC9nLCBcIiZsdDtcIikucmVwbGFjZSgvPi9nLCBcIiZndDtcIil9PC9wPlxyXG4gICAgPGRpdiBjbGFzcz1cInJhbmRvbS1wcm9tcHQtYmxvY2tcIj5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cInJhbmRvbS1wcm9tcHQtY29weS1idG5cIiB0eXBlPVwiYnV0dG9uXCIgYXJpYS1sYWJlbD1cIiR7Y29weUFyaWFMYWJlbH1cIj5cclxuICAgICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuOFwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIj5cclxuICAgICAgICAgIDxyZWN0IHg9XCI5XCIgeT1cIjlcIiB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiByeD1cIjJcIi8+XHJcbiAgICAgICAgICA8cGF0aCBkPVwiTTUgMTVINGEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg5YTIgMiAwIDAgMSAyIDJ2MVwiLz5cclxuICAgICAgICA8L3N2Zz5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cInJhbmRvbS1wcm9tcHQtY29weS1sYWJlbFwiPiR7Y29weUxhYmVsfTwvc3Bhbj5cclxuICAgICAgPC9idXR0b24+XHJcbiAgICAgIDxwcmUgY2xhc3M9XCJyYW5kb20tcHJvbXB0LXRleHRcIj48L3ByZT5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcblxyXG4gIGNvbnN0IHByb21wdFByZSA9IGhpbnRDYXJkLnF1ZXJ5U2VsZWN0b3IoXCIucmFuZG9tLXByb21wdC10ZXh0XCIpO1xyXG4gIHByb21wdFByZS50ZXh0Q29udGVudCA9IENPUFlQUk9NUFQ7XHJcblxyXG4gIGNvbnN0IGNvcHlCdG4gPSBoaW50Q2FyZC5xdWVyeVNlbGVjdG9yKFwiLnJhbmRvbS1wcm9tcHQtY29weS1idG5cIik7XHJcbiAgY29uc3QgY29weUxhYmVsRWwgPSBoaW50Q2FyZC5xdWVyeVNlbGVjdG9yKFwiLnJhbmRvbS1wcm9tcHQtY29weS1sYWJlbFwiKTtcclxuICBsZXQgY29weVJlc2V0VGltZXIgPSBudWxsO1xyXG4gIGNvcHlCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KENPUFlQUk9NUFQpO1xyXG4gICAgfSBjYXRjaCAoX2UpIHtcclxuICAgICAgY29uc3QgdGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidGV4dGFyZWFcIik7XHJcbiAgICAgIHRhLnZhbHVlID0gQ09QWVBST01QVDtcclxuICAgICAgdGEuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246Zml4ZWQ7b3BhY2l0eTowO3RvcDowO2xlZnQ6MFwiO1xyXG4gICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRhKTtcclxuICAgICAgdGEuc2VsZWN0KCk7XHJcbiAgICAgIGRvY3VtZW50LmV4ZWNDb21tYW5kKFwiY29weVwiKTtcclxuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0YSk7XHJcbiAgICB9XHJcbiAgICBjb3B5TGFiZWxFbC50ZXh0Q29udGVudCA9IGlzWmggPyBcIuW3suWkjeWItlwiIDogXCJDb3BpZWRcIjtcclxuICAgIGNvcHlCdG4uY2xhc3NMaXN0LmFkZChcImlzLWNvcGllZFwiKTtcclxuICAgIGlmIChjb3B5UmVzZXRUaW1lcikgY2xlYXJUaW1lb3V0KGNvcHlSZXNldFRpbWVyKTtcclxuICAgIGNvcHlSZXNldFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgIGNvcHlMYWJlbEVsLnRleHRDb250ZW50ID0gY29weUxhYmVsO1xyXG4gICAgICBjb3B5QnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1jb3BpZWRcIik7XHJcbiAgICB9LCAxODAwKTtcclxuICB9KTtcclxuXHJcbiAgcmFuZG9tU2VjdGlvbi5hcHBlbmRDaGlsZChoaW50Q2FyZCk7XHJcbn1cclxuIiwgImltcG9ydCB7IHN0YXRlLCBtc2cgfSBmcm9tIFwiLi4vc3RhdGUuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJBYm91dFNlY3Rpb24oKSB7XHJcbiAgY29uc3QgeyBhYm91dFNlY3Rpb24gfSA9IHN0YXRlLmRvbTtcclxuICBhYm91dFNlY3Rpb24uaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgY29uc3QgcHJpdmFjeUNhcmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICBwcml2YWN5Q2FyZC5jbGFzc05hbWUgPSBcIm90aGVyLXNldHRpbmdzLWNhcmQgYWJvdXQtcGx1Z2luLWNhcmRcIjtcclxuICBwcml2YWN5Q2FyZC5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwib3RoZXItc2V0dGluZ3MtaW50cm8gYWJvdXQtcGx1Z2luLWludHJvXCI+XHJcbiAgICAgIDxzdHJvbmc+JHttc2coXCJzZXR0aW5nc19hYm91dF9wcml2YWN5VGl0bGVcIiwgXCLpmpDnp4HkuI7mlbDmja7or7TmmI5cIil9PC9zdHJvbmc+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJhYm91dC1wbHVnaW4tcHJpdmFjeVwiIHJvbGU9XCJub3RlXCI+XHJcbiAgICAgIDxwPjxzdHJvbmc+JHttc2coXCJzZXR0aW5nc19hYm91dF9vcGVuU291cmNlTGFiZWxcIiwgXCLlvIDmupDkuJTlhY3otLnvvJpcIil9PC9zdHJvbmc+JHttc2coXCJzZXR0aW5nc19hYm91dF9vcGVuU291cmNlQm9keVwiLCBcIlFzaG90IOaYr+S4gOS4quW8gOa6kOS4lOWFjei0ueaPkuS7tu+8jOS4jeS8mui/m+ihjOS7u+S9leWQjuerr+acjeWKoeWZqOi/kOihjOOAguasoui/juWuoeafpeS4jui0oeeMruOAglwiKX08L3A+XHJcbiAgICAgIDxwPjxzdHJvbmc+JHttc2coXCJzZXR0aW5nc19hYm91dF96ZXJvRGF0YUxhYmVsXCIsIFwi6Zu25pWw5o2u5pS26ZuG77yaXCIpfTwvc3Ryb25nPiR7bXNnKFwic2V0dGluZ3NfYWJvdXRfemVyb0RhdGFCb2R5XCIsIFwiUXNob3Qg5LiN5Lya5bCG5oKo55qE5pCc57Si5YWz6ZSu6K+N44CB5rWP6KeI6K6w5b2V5oiW6aG16Z2i5YaF5a655LiK5Lyg5Yiw5byA5Y+R6ICF5pyN5Yqh5Zmo44CC55So5LqO5Yqf6IO955qE6YWN572u5pWw5o2u5LuF5L+d5a2Y5Zyo5pys5Zyw44CCXCIpfTwvcD5cclxuICAgICAgPHA+PHN0cm9uZz4ke21zZyhcInNldHRpbmdzX2Fib3V0X3RyYW5zcGFyZW5jeUxhYmVsXCIsIFwi5Lqk5LqS6YCP5piO5oCn77yaXCIpfTwvc3Ryb25nPiR7bXNnKFwic2V0dGluZ3NfYWJvdXRfdHJhbnNwYXJlbmN5Qm9keVwiLCBcIuaPkuS7tumAmui/hyBpZnJhbWUg5oiW4oCc5paw5qCH562+6aG15qih5byP4oCd5omT5byA55uu5qCH572R56uZ77yM5oKo5LiO572R56uZ55qE55m75b2V5LiO5Lqk5LqS5Z2H55u05o6l5Y+R55Sf5Zyo5rWP6KeI5Zmo5LiO55uu5qCH572R56uZ5LmL6Ze044CCXCIpfTwvcD5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcbiAgYWJvdXRTZWN0aW9uLmFwcGVuZENoaWxkKHByaXZhY3lDYXJkKTtcclxuXHJcbiAgY29uc3QgbGlua3NSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGxpbmtzUm93LmNsYXNzTmFtZSA9IFwiYWJvdXQtcGx1Z2luLWxpbmtzLXdyYXBcIjtcclxuICBsaW5rc1Jvdy5pbm5lckhUTUwgPSBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiYWJvdXQtcGx1Z2luLWFjdGlvbnNcIiBhcmlhLWxhYmVsPVwi55u45YWz6ZO+5o6lXCI+XHJcbiAgICAgIDxhIGNsYXNzPVwiYWJvdXQtcGx1Z2luLWFjdGlvbi1idG5cIiBocmVmPVwiaHR0cHM6Ly9xc2hvdC50b3AvXCIgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9yZWZlcnJlciBub29wZW5lclwiPiR7bXNnKFwic2V0dGluZ3NfYWJvdXRfc2l0ZVwiLCBcIuaPkuS7tuWumOe9kVwiKX08L2E+XHJcbiAgICAgIDxhIGNsYXNzPVwiYWJvdXQtcGx1Z2luLWFjdGlvbi1idG5cIiBocmVmPVwiaHR0cHM6Ly9naXRodWIuY29tLzMwYmV3YXRlci9Rc2hvdFwiIHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vcmVmZXJyZXIgbm9vcGVuZXJcIj4ke21zZyhcInNldHRpbmdzX2Fib3V0X3NvdXJjZVwiLCBcIuW8gOa6kOWcsOWdgFwiKX08L2E+XHJcbiAgICAgIDxkaXYgY2xhc3M9XCJhYm91dC1wbHVnaW4tYWN0aW9uLWJ0biBhYm91dC1wbHVnaW4tYWN0aW9uLWJ0bi0tYXV0aG9yXCIgcm9sZT1cImdyb3VwXCIgYXJpYS1sYWJlbD1cIiR7bXNnKFwic2V0dGluZ3NfYWJvdXRfYXV0aG9yQXJpYVwiLCBcIuS9nOiAhei0puWPt1wiKX1cIj5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cImFib3V0LXBsdWdpbi1hdXRob3ItbGFiZWxcIj4ke21zZyhcInNldHRpbmdzX2Fib3V0X2F1dGhvckxhYmVsXCIsIFwi5L2c6ICF6LSm5Y+377yaXCIpfTwvc3Bhbj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiYWJvdXQtcGx1Z2luLWF1dGhvci1saW5rc1wiPlxyXG4gICAgICAgIDxhIGNsYXNzPVwiYWJvdXQtcGx1Z2luLXNvY2lhbFwiIGhyZWY9XCJodHRwczovL3NwYWNlLmJpbGliaWxpLmNvbS8xMDE2NTE2NzFcIiB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub3JlZmVycmVyIG5vb3BlbmVyXCIgYXJpYS1sYWJlbD1cIkLnq5lcIj5cclxuICAgICAgICAgIDxzdmcgdmlld0JveD1cIjAgMCAxMDcxIDEwMjRcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5cclxuICAgICAgICAgICAgPHBhdGggZmlsbD1cImN1cnJlbnRDb2xvclwiIGQ9XCJNODg3LjM2NTE4OCA5NTIuNzgzODk0SDE4NC40NTU0OTlDODIuNzU4OTE0IDk1Mi43ODM4OTQgMCA4NzYuNzI0MDIgMCA3ODMuMjcyNDA4VjMzNi4xMTE0NjZjMC05My40NzczNzggODIuNzU4OTE0LTE2OS41MzcyNTEgMTg0LjQ1NTQ5OS0xNjkuNTM3MjUyaDcwNC4wNDMzNzNjNTEuOTY5MDk0IDAgMTAxLjY3MDgyIDIwLjIyNTk0OSAxMzYuMzc3MDAyIDU1LjQ5ODk3M0ExNTkuMjU2ODAxIDE1OS4yNTY4MDEgMCAwIDEgMTA3MS44NDY0NTMgMzM2LjQyMDY1MlY3ODMuMjcyNDA4YzAgOTMuNDUxNjEzLTgyLjc1ODkxNCAxNjkuNTExNDg2LTE4NC40ODEyNjUgMTY5LjUxMTQ4NnpNMTg0LjQ1NTQ5OSAyNTEuNjAwNDk1Yy01NC44MjkwNjkgMC05OS40MjkyMTggMzcuOTAxMTA5LTk5LjQyOTIxOCA4NC41MTA5NzFWNzgzLjI3MjQwOGMwIDQ2LjYwOTg2MSA0NC42MDAxNDkgODQuNTEwOTcgOTkuNDI5MjE4IDg0LjUxMDk3SDg4Ny4zNjUxODhjNTQuODI5MDY5IDAgOTkuNDI5MjE4LTM3LjkwMTEwOSA5OS40MjkyMTgtODQuNTEwOTdWMzM1LjQxNTc5NmE3NC41Mzk3MDYgNzQuNTM5NzA2IDAgMCAwLTIyLjU3MDYxMy01My43MjExNWMtMTguODA4ODQ0LTE5LjExODAzLTQ2LjM3Nzk3Mi0zMC4wOTQxNS03NS43NTA2ODctMzAuMDk0MTUxelwiIC8+XHJcbiAgICAgICAgICAgIDxwYXRoIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBkPVwiTTM5Ny43OTQxNjggNDk1LjMxNjczNkwyMTkuNjUxMjI2IDUzNS45MjMyMjZhMzYuMzU1MTc3IDM2LjM1NTE3NyAwIDAgMS0xNS4xNzU5MDMtNzEuMTEyODg5bDE3OC4xNDI5NDItNDAuNTU0OTZhMzUuODE0MSAzNS44MTQxIDAgMCAxIDQzLjEzMTUxMyAyNy45NTU2MTFjNC4zMDI4NDUgMTkuMTY5NTYyLTguNzg2MDQ5IDM4Ljg1NDQzNC0yNy45NTU2MSA0My4xNTcyNzl6TTY3NC4wNTIyODUgNDk1LjMxNjczNmMtMTkuMTY5NTYyLTQuMzAyODQ1LTMyLjI1ODQ1Ni0yMy45ODc3MTctMjcuOTU1NjExLTQzLjE1NzI3OWEzNS44MTQxIDM1LjgxNDEgMCAwIDEgNDMuMTMxNTE0LTI3Ljk1NTYxMWwxNzguMTQyOTQxIDQwLjU1NDk2YTM2LjM1NTE3NyAzNi4zNTUxNzcgMCAwIDEtMTUuMTc1OTAyIDcxLjExMjg4OWwtMTc4LjE0Mjk0Mi00MC41NTQ5NTl6TTI2OC44MTE4NzYgMTAyMy45OTk4NDVhNTYuNjg0MTg3IDU2LjY4NDE4NyAwIDAgMS01Ni42ODQxODctNTYuODEzMDE1di00Mi41OTA0MzdhNTYuNjg0MTg3IDU2LjY4NDE4NyAwIDEgMSAxMTMuNjAwMjY0IDB2NDIuNTkwNDM3YTU2LjY4NDE4NyA1Ni42ODQxODcgMCAwIDEtNTYuNjg0MTg3IDU2LjgxMzAxNXpNODAzLjAzNDU3NyAxMDIzLjk5OTg0NWE1Ni42ODQxODcgNTYuNjg0MTg3IDAgMCAxLTU2LjgxMzAxNS01Ni44MTMwMTV2LTQyLjU5MDQzN2E1Ni42ODQxODcgNTYuNjg0MTg3IDAgMSAxIDExMy42MDAyNjQgMHY0Mi41OTA0MzdhNTYuNjg0MTg3IDU2LjY4NDE4NyAwIDAgMS01Ni42ODQxODcgNTYuODEzMDE1elwiIC8+XHJcbiAgICAgICAgICAgIDxwYXRoIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBkPVwiTTI0OC45MTg4MjEgNDIuOTQ2NDg3bTI2LjUzODM0My0yOS42NzEwOTdsMCAwcTI2LjUzODM0My0yOS42NzEwOTcgNTYuMjA5NDQtMy4xMzI3NTVsMTg1LjkwMDQ2OSAxNjYuMjcyNTk1cTI5LjY3MTA5NyAyNi41MzgzNDMgMy4xMzI3NTQgNTYuMjA5NDRsMCAwcS0yNi41MzgzNDMgMjkuNjcxMDk3LTU2LjIwOTQ0IDMuMTMyNzU1bC0xODUuOTAwNDY4LTE2Ni4yNzI1OTVxLTI5LjY3MTA5Ny0yNi41MzgzNDMtMy4xMzI3NTUtNTYuMjA5NDRaXCIgLz5cclxuICAgICAgICAgICAgPHBhdGggZmlsbD1cImN1cnJlbnRDb2xvclwiIGQ9XCJNNTc3LjYyOTM4MiAyNjIuMzMwMzEzbS0yNi41MzgzNDMtMjkuNjcxMDk4bDAgMHEtMjYuNTM4MzQzLTI5LjY3MTA5NyAzLjEzMjc1NS01Ni4yMDk0NGwxODUuOTAwNDY4LTE2Ni4yNzI1OTVxMjkuNjcxMDk3LTI2LjUzODM0MyA1Ni4yMDk0NDEgMy4xMzI3NTVsMCAwcTI2LjUzODM0MyAyOS42NzEwOTctMy4xMzI3NTUgNTYuMjA5NDRsLTE4NS45MDA0NjggMTY2LjI3MjU5NXEtMjkuNjcxMDk3IDI2LjUzODM0My01Ni4yMDk0NDEtMy4xMzI3NTVaXCIgLz5cclxuICAgICAgICAgICAgPHBhdGggZmlsbD1cImN1cnJlbnRDb2xvclwiIGQ9XCJNNTk1LjYyMTk4MiA3NTYuMzczMTg0YTM5LjQ0NzA0MSAzOS40NDcwNDEgMCAwIDEtMzAuNzM4Mjg5LTE0LjY4NjM1N0w1MzMuMzQ2NjcyIDcwMi42Nzc3OTlsLTMyLjQzODgxNCAzOC40Njc5NTFhMzkuNzMwNDYyIDM5LjczMDQ2MiAwIDAgMS01NS40NzMyMDcgNS4xNTMxMDhsLTQ0LjMxNjcyOS0zNi41MzU1MzVhMjMuMTg4OTg2IDIzLjE4ODk4NiAwIDEgMSAyOS41MDE1NDMtMzUuNzYyNTY5bDM5LjE2MzYyMSAzMi4yNTg0NTUgMzMuNDk1MjAyLTM5LjYwMTYzNGEzOS42Mjc0IDM5LjYyNzQgMCAwIDEgNjEuMDM4NTYzIDAuNTY2ODQybDMyLjcyMjIzNiA0MC4zMjMwNjkgNDUuNDI0NjQ2LTMzLjkzMzIxNUEyMy4xODg5ODYgMjMuMTg4OTg2IDAgMSAxIDY2OS45MDQwMzMgNzEwLjY2NTExN2wtNTAuNjU1MDUxIDM3Ljc5ODA0N2EzOS4zNjk3NDUgMzkuMzY5NzQ1IDAgMCAxLTIzLjYyNyA3LjkxMDAyelwiIC8+XHJcbiAgICAgICAgICA8L3N2Zz5cclxuICAgICAgICA8L2E+XHJcbiAgICAgICAgPGEgY2xhc3M9XCJhYm91dC1wbHVnaW4tc29jaWFsXCIgaHJlZj1cImh0dHBzOi8vd3d3LmRvdXlpbi5jb20vdXNlci9NUzR3TGpBQkFBQUFEQmgtalVrOXY3RTdLTkVDTG9WenhGQnNvUk5HYVhOUTBVMUZ5ZjVLT1NsUVFxMGIzOHVsTDZmT2JJc2FnaTJUXCIgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9yZWZlcnJlciBub29wZW5lclwiIGFyaWEtbGFiZWw9XCLmipbpn7NcIj5cclxuICAgICAgICAgIDxzdmcgdmlld0JveD1cIjAgMCAxMDI0IDEwMjRcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5cclxuICAgICAgICAgICAgPHBhdGggZmlsbD1cImN1cnJlbnRDb2xvclwiIGQ9XCJNOTM3LjQgNDIzLjljLTg0IDAtMTY1LjctMjcuMy0yMzIuOS03Ny44djM1Mi4zYzAgMTc5LjktMTM4LjYgMzI1LjYtMzA5LjYgMzI1LjZTODUuMyA4NzguMyA4NS4zIDY5OC40YzAtMTc5LjkgMTM4LjYtMzI1LjYgMzA5LjYtMzI1LjYgMTcuMSAwIDMzLjcgMS41IDQ5LjkgNC4zdjE4Ni42Yy0xNS41LTYuMS0zMi05LjItNDguNi05LjItNzYuMyAwLTEzOC4yIDY1LTEzOC4yIDE0NS4zIDAgODAuMiA2MS45IDE0NS4zIDEzOC4yIDE0NS4zIDc2LjIgMCAxMzguMS02NS4xIDEzOC4xLTE0NS4zVjBINzA3YzAgMTM0LjUgMTAzLjcgMjQzLjUgMjMxLjYgMjQzLjV2MTgwLjNsLTEuMiAwLjFcIiAvPlxyXG4gICAgICAgICAgPC9zdmc+XHJcbiAgICAgICAgPC9hPlxyXG4gICAgICAgIDxhIGNsYXNzPVwiYWJvdXQtcGx1Z2luLXNvY2lhbFwiIGhyZWY9XCJodHRwczovL3d3dy54aWFvaG9uZ3NodS5jb20vdXNlci9wcm9maWxlLzYzMDFmNTkzMDAwMDAwMDAxMjAwZWU3ND9tX3NvdXJjZT1pdGFiXCIgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9yZWZlcnJlciBub29wZW5lclwiIGFyaWEtbGFiZWw9XCLlsI/nuqLkuaZcIj5cclxuICAgICAgICAgIDxzdmcgdmlld0JveD1cIjAgMCAxMDI0IDEwMjRcIiBhcmlhLWhpZGRlbj1cInRydWVcIj5cclxuICAgICAgICAgICAgPHBhdGggZmlsbD1cImN1cnJlbnRDb2xvclwiIGQ9XCJNOTk2LjE1MiA1Ni41MTNjLTcuOTg2LTEwLjg1Mi0xNy42MS0yMC44ODUtMjguODcxLTI4Ljg3Qzk0NC4xNDMgMTAuNDQyIDkxNi4wOSAwIDg4NS4zNzcgMEgxMzguNDE5Yy0zMC43MTUgMC01OS4xNzYgMTAuNDQzLTgyLjMxNCAyNy42NDItMTAuODUyIDcuOTg2LTIwLjg4NSAxNy42MS0yOC44NyAyOC44N0MxMC40NDQgNzkuNDQ4IDAuMDAxIDEwNy43MDMgMC4wMDEgMTM4LjYyM1Y4ODUuNThjMCAzMC43MTUgMTAuNDQyIDU5LjE3NiAyNy42NDEgODEuOTA1IDcuOTg2IDEwLjg1MiAxNy42MSAyMC44ODUgMjguODcxIDI4Ljg3IDIzLjEzOCAxNy4yIDUxLjE5IDI3LjY0MyA4MS45MDQgMjcuNjQzaDc0Ni45NTljMzAuNzE0IDAgNTkuMTc1LTEwLjQ0MyA4MS45MDQtMjcuNjQyIDEwLjg1Mi03Ljk4NiAyMC44ODUtMTcuNjEgMjguODctMjguODcgMTcuMi0yMy4xMzkgMjcuNjQzLTUxLjE5IDI3LjY0My04MS45MDVWMTM4LjYyMmMwLTMwLjkyLTEwLjg1Mi01OS4xNzUtMjcuNjQyLTgyLjExeiBtLTYyOS42MzMgNDEwLjU0YzE2LjM4LTM2LjI0MSAzNC44MS03MS44NyA1Mi4yMTMtMTA3LjQ5N2g1OS45OTVjLTE0Ljc0MyAyOS4yOC0zMS4xMjQgNTcuOTQ3LTQxLjU2NiA4NS43OTQgMjQuMzY2LTEuNDMzIDQ2LjQ4LTIuNjYyIDcyLjQ4NC00LjA5NS0xMy45MjMgMjcuODQ3LTI2LjIwOSA1Mi42MjMtMzguNDk0IDc3LjM5OC0xLjYzOSAzLjI3Ni0zLjI3NyA2Ljc1Ny00LjkxNSAxMC4wMzMtMTIuOSAyNS44LTEyLjkgMjYuMDA0IDE1Ljc2NyAyNi42MiAzLjA3MSAwIDUuOTM4IDAuNDEgMTEuNDY2IDEuMDIyLTcuOTg1IDE1Ljc2Ny0xNS4xNTIgMzAuMS0yMi43MjggNDQuMjI4LTEuMjI5IDIuMjUzLTQuNzEgNC45MTUtNi45NjIgNC45MTUtMjEuMDkgMC00Mi4zODUgMC42MTQtNjMuNDc1LTEuNjM5LTE1LjE1Mi0xLjYzOC0yMS4wOS0xMy4zMDktMTUuMTUyLTI3LjY0MiA3LjE2Ni0xNy44MTQgMTUuNzY2LTM1LjIxOSAyMy43NTItNTIuODI4IDIuNjYyLTYuMTQzIDUuNTI4LTEyLjA4IDkuNDItMjEuMDktMTEuNjczIDAtMjAuMjcyIDAuMjA2LTI4Ljg3MiAwLTI0Ljc3Ni0xLjAyMy0zMy4xNy0xMi4yODUtMjIuOTMzLTM1LjIxOHpNNzYuMTcxIDY1OC4yOTljLTEyLjY5NS0yMi4xMTQtMjQuMTYtNDIuNTktMzUuODMyLTYzLjA2NSAwLTIuNDU4IDIyLjkzMy03Mi40ODUgMTcuODE0LTE1MS43MjZoNjMuMDY1czIuMjUzIDE0OC40NS00NS4wNDcgMjE0Ljc5MXogbTE0Ny4yMjItNy45ODVjMC42MTQgMzcuMDYxLTI0Ljk4IDM3LjA2MS0yNC45OCAzNy4wNjFIMTYyLjE3bC0zOC4wODUtNTAuMzdoMzkuOTI4di0yNzcuNDVoNTkuOTk0YzAgOTAuOTE1LTAuMjA0IDE5OS44NDYtMC42MTQgMjkwLjc2eiBtODcuMjI3IDQuNzFjLTI4LjY2Ni0yNS4xODYtNDQuMjI3LTEwMC4zMzMtNDMuODE4LTIxMS45MjVoNTkuMTc1Yy00LjUwNCA1OC43NjUgMTQuNTM4IDEzNy4xODcgMTQuNTM4IDEzNy4xODdzLTE3LjQwNCAzOC40OTUtMjkuODk1IDc0LjczN3ogbTEyOS44MTcgMjYuMDA0Yy0xLjYzOCAzLjA3MS02Ljc1NyA1LjkzOC0xMC40NDMgNi4xNDItMjcuODQ3IDAuNDEtNTUuOSAwLjIwNS04Ny44NDIgMC4yMDUgMTIuMDgxLTI0LjE2IDIyLjExNC00My44MTggMzAuOTItNjEuMDE4aDk1LjYyMWMtMTAuNjQ3IDIwLjg4NS0xOS4wNDIgMzguMDg1LTI4LjI1NiA1NC42N3ogbTI0NC40ODEgNi41NTJoLTIxNS4yYzEwLjQ0Mi0yMC42OCAyOS4wNzUtNTcuNTM3IDI5LjA3NS01Ny41MzdoNjEuNDI4VjQ0MS44N2gtMzguMjl2LTU4Ljc2NmgxMzguNjIydjU3Ljk0N2gtMzcuODh2MTg5LjE5Nmg2Mi4yNDV2NTcuMzMzeiBtMjg0LjYxNS00My40MDljMCA0My40MDktNDIuMzg1IDQyLjE4LTQyLjM4NSA0Mi4xOGgtNTUuMjg1bC0yMy4xMzgtNDkuNzU2IDU5Ljk5NSAwLjIwNXMwLjYxNC00NS4wNDcgMC02MC42MDljLTAuNDEtMTMuMTA1LTcuNTc2LTIxLjUtMjAuODg2LTIxLjcwNC0yNi42MTgtMC42MTUtNTMuNDQyLTAuMjA1LTgyLjcyMi0wLjIwNXYxMzIuMjc0aC01OS4zOFY1NTUuMWgtNTkuOTk1di02MS4yMjJoNTguMzU2di01MS44MDRoLTM4Ljd2LTU3Ljk0N2gzOS4zMTV2LTI0LjU3MWg1OS45OTRsMC40MSAyNC41N2g0Ny43MDhzNDQuMDI0LTEuMDIzIDQ0LjIyOCA0MS43N2MwLjIwNSAxMi42OTcgMC40MSA1NC4yNjMgMC40MSA2OC4xODcgNTAuNTc1LTAuMjA1IDcyLjA3NSAxMC4wMzMgNzIuMDc1IDQ1LjI1VjY0NC4xN3ogbS0yNS4zOS0yMDAuNDZIOTEyLjJ2LTMwLjUwN2MwLTExLjA1NyA1LjUyOC0yMS4yOTUgMTQuOTQ3LTI3LjIzMyAxMC42NDctNi43NTcgMjUuMzktMTEuMDU3IDM5LjMxNCAyLjI1MiAwLjYxNCAwLjQxIDEuMDI0IDEuMDI0IDEuNDMzIDEuNjM4IDE5LjI0NyAyMC4yNyA0LjA5NSA1My44NTItMjMuNzUyIDUzLjg1MnpcIiAvPlxyXG4gICAgICAgICAgICA8cGF0aCBmaWxsPVwiY3VycmVudENvbG9yXCIgZD1cIk04MDUuNTIxIDQ5My44NzhoMzkuNzIzdi01Mi4wMWgtNDAuMTMyelwiIC8+XHJcbiAgICAgICAgICA8L3N2Zz5cclxuICAgICAgICA8L2E+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcbiAgYWJvdXRTZWN0aW9uLmFwcGVuZENoaWxkKGxpbmtzUm93KTtcclxufVxyXG4iLCAiaW1wb3J0IHsgTEVHQUNZX0RFRkFVTFRfR1JPVVBfTkFNRSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcbmltcG9ydCB7IGdldEFsbFByb21wdEdyb3VwTmFtZSB9IGZyb20gXCIuLi8uLi9zaGFyZWQvcHJvbXB0LWdyb3Vwcy5qc1wiO1xyXG5pbXBvcnQgeyBzdGF0ZSB9IGZyb20gXCIuL3N0YXRlLmpzXCI7XHJcbmltcG9ydCB7IHBlcnNpc3RBbGwgfSBmcm9tIFwiLi9zdG9yZS5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZUV4cG9ydCgpIHtcclxuICBjb25zdCBsaW5lcyA9IFtdO1xyXG4gIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCwgZ2kpID0+IHtcclxuICAgIGlmIChnaSA+IDApIGxpbmVzLnB1c2goXCJcIik7XHJcbiAgICBsaW5lcy5wdXNoKGAjICR7Z3JvdXAubmFtZX1gKTtcclxuICAgIGdyb3VwLnByb21wdHMuZm9yRWFjaCgocCkgPT4ge1xyXG4gICAgICBsaW5lcy5wdXNoKFwiXCIpO1xyXG4gICAgICBsaW5lcy5wdXNoKGAjIyAke3AudGl0bGV9YCk7XHJcbiAgICAgIGxpbmVzLnB1c2goXCJcIik7XHJcbiAgICAgIGxpbmVzLnB1c2goZmxhdHRlblByb21wdENvbnRlbnRGb3JFeHBvcnQocC5jb250ZW50KSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuICBjb25zdCBtYXJrZG93biA9IGxpbmVzLmpvaW4oXCJcXG5cIik7XHJcbiAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFttYXJrZG93bl0sIHsgdHlwZTogXCJ0ZXh0L21hcmtkb3duO2NoYXJzZXQ9dXRmLThcIiB9KTtcclxuICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xyXG4gIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcclxuICBhLmhyZWYgPSB1cmw7XHJcbiAgYS5kb3dubG9hZCA9IGBRc2hvd+aPkOekuuivjS0ke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCl9Lm1kYDtcclxuICBhLmNsaWNrKCk7XHJcbiAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xyXG59XHJcblxyXG4vLyDlsIbmj5DnpLror43lhoXlrrnph4znmoQgTWFya2Rvd24g5qCH6aKY77yIIyB+ICMjIyMjI++8iei9rOaIkOWKoOeyl++8jFxyXG4vLyDpgb/lhY3kuI7lr7zlh7rmlofku7bkuK0gIyDliIbnu4TjgIEjIyDmj5DnpLror43moIfpopgg55qE57uT5p6E56ym5Y+35Yay56qB44CCXHJcbi8vIOS7o+eggeWbtOagj+WGheeahOWGheWuueWOn+agt+S/neeVme+8jOWIl+ihqC/mrrXokL0v5bqP5Y+357uT5p6E5LiN5Y+X5b2x5ZON44CCXHJcbmZ1bmN0aW9uIGZsYXR0ZW5Qcm9tcHRDb250ZW50Rm9yRXhwb3J0KHJhdykge1xyXG4gIGNvbnN0IHRleHQgPSBTdHJpbmcocmF3IHx8IFwiXCIpLnRyaW0oKTtcclxuICBpZiAoIXRleHQpIHJldHVybiB0ZXh0O1xyXG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgvXFxyP1xcbi8pO1xyXG4gIGNvbnN0IG91dCA9IFtdO1xyXG4gIGxldCBpbkNvZGVGZW5jZSA9IGZhbHNlO1xyXG4gIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xyXG4gICAgY29uc3QgdHJpbW1lZEVuZCA9IGxpbmUudHJpbUVuZCgpO1xyXG4gICAgY29uc3QgdHJpbW1lZCA9IHRyaW1tZWRFbmQudHJpbSgpO1xyXG4gICAgaWYgKHRyaW1tZWQuc3RhcnRzV2l0aChcImBgYFwiKSkge1xyXG4gICAgICBpbkNvZGVGZW5jZSA9ICFpbkNvZGVGZW5jZTtcclxuICAgICAgb3V0LnB1c2godHJpbW1lZEVuZCk7XHJcbiAgICAgIGNvbnRpbnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKGluQ29kZUZlbmNlKSB7XHJcbiAgICAgIG91dC5wdXNoKHRyaW1tZWRFbmQpO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuICAgIGNvbnN0IGhlYWRpbmdNYXRjaCA9IHRyaW1tZWRFbmQubWF0Y2goL14oI3sxLDZ9KVxccysoLispJC8pO1xyXG4gICAgaWYgKGhlYWRpbmdNYXRjaCkge1xyXG4gICAgICBvdXQucHVzaChgKioke2hlYWRpbmdNYXRjaFsyXS50cmltKCl9KipgKTtcclxuICAgICAgb3V0LnB1c2goXCJcIik7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBvdXQucHVzaCh0cmltbWVkRW5kKTtcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIG91dC5qb2luKFwiXFxuXCIpLnJlcGxhY2UoL1xcbnszLH0vZywgXCJcXG5cXG5cIikudHJpbSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwYXJzZU1hcmtkb3duUHJvbXB0cyh0ZXh0KSB7XHJcbiAgY29uc3QgZ3JvdXBzID0gW107XHJcbiAgLy8gU3BsaXQgb24gbGluZXMgdGhhdCBzdGFydCB3aXRoIGV4YWN0bHkgb25lICMgKG5vdCAjIylcclxuICBjb25zdCBncm91cENodW5rcyA9IHRleHQuc3BsaXQoL1xcbig/PSMgKD8hIykpLyk7XHJcbiAgZm9yIChjb25zdCBjaHVuayBvZiBncm91cENodW5rcykge1xyXG4gICAgY29uc3QgY2h1bmtMaW5lcyA9IGNodW5rLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgY29uc3QgZmlyc3RMaW5lID0gY2h1bmtMaW5lc1swXSB8fCBcIlwiO1xyXG4gICAgaWYgKCFmaXJzdExpbmUuc3RhcnRzV2l0aChcIiMgXCIpIHx8IGZpcnN0TGluZS5zdGFydHNXaXRoKFwiIyMgXCIpKSBjb250aW51ZTtcclxuICAgIGNvbnN0IGdyb3VwTmFtZSA9IGZpcnN0TGluZS5zbGljZSgyKS50cmltKCk7XHJcbiAgICBpZiAoIWdyb3VwTmFtZSkgY29udGludWU7XHJcblxyXG4gICAgY29uc3QgcHJvbXB0cyA9IFtdO1xyXG4gICAgY29uc3QgcmVzdCA9IGNodW5rTGluZXMuc2xpY2UoMSkuam9pbihcIlxcblwiKTtcclxuICAgIC8vIFNwbGl0IG9uIGxpbmVzIHRoYXQgc3RhcnQgd2l0aCAjI1xyXG4gICAgY29uc3QgcHJvbXB0Q2h1bmtzID0gcmVzdC5zcGxpdCgvXFxuKD89IyMgKS8pO1xyXG4gICAgZm9yIChjb25zdCBwQ2h1bmsgb2YgcHJvbXB0Q2h1bmtzKSB7XHJcbiAgICAgIGNvbnN0IHBMaW5lcyA9IHBDaHVuay5zcGxpdChcIlxcblwiKTtcclxuICAgICAgY29uc3QgcEZpcnN0ID0gcExpbmVzWzBdIHx8IFwiXCI7XHJcbiAgICAgIGlmICghcEZpcnN0LnN0YXJ0c1dpdGgoXCIjIyBcIikpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCB0aXRsZSA9IHBGaXJzdC5zbGljZSgzKS50cmltKCk7XHJcbiAgICAgIGlmICghdGl0bGUpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBjb250ZW50ID0gcExpbmVzLnNsaWNlKDEpLmpvaW4oXCJcXG5cIikudHJpbSgpO1xyXG4gICAgICBwcm9tcHRzLnB1c2goeyB0aXRsZSwgY29udGVudCB9KTtcclxuICAgIH1cclxuXHJcbiAgICBncm91cHMucHVzaCh7IG5hbWU6IGdyb3VwTmFtZSwgcHJvbXB0cyB9KTtcclxuICB9XHJcbiAgcmV0dXJuIGdyb3VwcztcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUltcG9ydEZpbGVDaGFuZ2UoZXZlbnQpIHtcclxuICBjb25zdCBmaWxlID0gZXZlbnQudGFyZ2V0LmZpbGVzPy5bMF07XHJcbiAgaWYgKCFmaWxlKSByZXR1cm47XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHRleHQgPSBhd2FpdCBmaWxlLnRleHQoKTtcclxuICAgIGxldCB2YWxpZCA9IFtdO1xyXG5cclxuICAgIGlmIChmaWxlLm5hbWUuZW5kc1dpdGgoXCIuanNvblwiKSB8fCB0ZXh0LnRyaW1TdGFydCgpLnN0YXJ0c1dpdGgoXCJ7XCIpKSB7XHJcbiAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKHRleHQpO1xyXG4gICAgICBpZiAoIWRhdGEgfHwgIUFycmF5LmlzQXJyYXkoZGF0YS5wcm9tcHRHcm91cHMpKSB7XHJcbiAgICAgICAgYWxlcnQoXCJKU09OIOagvOW8j+S4jeato+ehru+8jOivt+WvvOWFpeS7juacrOaPkuS7tuWvvOWHuueahOaWh+S7tuOAglwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuICAgICAgdmFsaWQgPSBkYXRhLnByb21wdEdyb3Vwcy5maWx0ZXIoXHJcbiAgICAgICAgKGcpID0+IGcgJiYgdHlwZW9mIGcubmFtZSA9PT0gXCJzdHJpbmdcIiAmJiBnLm5hbWUudHJpbSgpICYmIEFycmF5LmlzQXJyYXkoZy5wcm9tcHRzKVxyXG4gICAgICApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFsaWQgPSBwYXJzZU1hcmtkb3duUHJvbXB0cyh0ZXh0KTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXZhbGlkLmxlbmd0aCkge1xyXG4gICAgICBhbGVydChcIuaWh+S7tuS4reayoeacieWPr+WvvOWFpeeahOaPkOekuuivjeWIhue7hOOAglwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgb3BlbkltcG9ydE1vZGFsKHZhbGlkKTtcclxuICB9IGNhdGNoIChfKSB7XHJcbiAgICBhbGVydChcIuaXoOazleino+aekOaWh+S7tu+8jOivt+ajgOafpeaWh+S7tuagvOW8j+aYr+WQpuato+ehruOAglwiKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9wZW5JbXBvcnRNb2RhbChpbXBvcnRlZEdyb3Vwcykge1xyXG4gIGNvbnN0IGFsbE5hbWUgPSBnZXRBbGxQcm9tcHRHcm91cE5hbWUoKTtcclxuICBjb25zdCBleGlzdGluZ05hbWVzID0gbmV3IFNldChzdGF0ZS5wcm9tcHRHcm91cHMubWFwKChnKSA9PiBnLm5hbWUpKTtcclxuICBzdGF0ZS5pbXBvcnRNb2RhbFN0YXRlID0ge1xyXG4gICAgZ3JvdXBzOiBpbXBvcnRlZEdyb3Vwcy5tYXAoKGdyb3VwKSA9PiB7XHJcbiAgICAgIGNvbnN0IHByb21wdHMgPSBncm91cC5wcm9tcHRzLm1hcCgocCkgPT4gKHtcclxuICAgICAgICB0aXRsZTogU3RyaW5nKHAudGl0bGUgfHwgXCJcIikudHJpbSgpIHx8IFwi5pyq5ZG95ZCN5o+Q56S66K+NXCIsXHJcbiAgICAgICAgY29udGVudDogU3RyaW5nKHAuY29udGVudCB8fCBcIlwiKVxyXG4gICAgICB9KSk7XHJcbiAgICAgIGxldCBuYW1lID0gZ3JvdXAubmFtZS50cmltKCk7XHJcbiAgICAgIC8vIOWFvOWuueaXp+eJiOWvvOWHuu+8muaKilwi6buY6K6k5YiG57uEXCLop4bkuLrmlrDnmoRcIuWFqOmDqFwi5YiG57uEXHJcbiAgICAgIGlmIChuYW1lID09PSBMRUdBQ1lfREVGQVVMVF9HUk9VUF9OQU1FKSB7XHJcbiAgICAgICAgbmFtZSA9IGFsbE5hbWU7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBuYW1lLFxyXG4gICAgICAgIHByb21wdHMsXHJcbiAgICAgICAgZXhwYW5kZWQ6IGZhbHNlLFxyXG4gICAgICAgIGNvbmZsaWN0RXhpc3RzOiBleGlzdGluZ05hbWVzLmhhcyhuYW1lKSxcclxuICAgICAgICBjb25mbGljdFN0cmF0ZWd5OiBcIm1lcmdlXCIsXHJcbiAgICAgICAgcHJvbXB0U2VsZWN0aW9uczogcHJvbXB0cy5tYXAoKCkgPT4gdHJ1ZSlcclxuICAgICAgfTtcclxuICAgIH0pXHJcbiAgfTtcclxuICByZW5kZXJJbXBvcnRNb2RhbCgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJJbXBvcnRNb2RhbCgpIHtcclxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb21wdEltcG9ydE1vZGFsXCIpPy5yZW1vdmUoKTtcclxuICBpZiAoIXN0YXRlLmltcG9ydE1vZGFsU3RhdGUpIHJldHVybjtcclxuXHJcbiAgY29uc3QgdG90YWxQcm9tcHRzID0gc3RhdGUuaW1wb3J0TW9kYWxTdGF0ZS5ncm91cHMucmVkdWNlKChzLCBnKSA9PiBzICsgZy5wcm9tcHRzLmxlbmd0aCwgMCk7XHJcbiAgY29uc3Qgc2VsZWN0ZWRDb3VudCA9IHN0YXRlLmltcG9ydE1vZGFsU3RhdGUuZ3JvdXBzLnJlZHVjZShcclxuICAgIChzLCBnKSA9PiBzICsgZy5wcm9tcHRTZWxlY3Rpb25zLmZpbHRlcihCb29sZWFuKS5sZW5ndGgsIDBcclxuICApO1xyXG5cclxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBvdmVybGF5LmlkID0gXCJwcm9tcHRJbXBvcnRNb2RhbFwiO1xyXG4gIG92ZXJsYXkuY2xhc3NOYW1lID0gXCJpbXBvcnQtbW9kYWwtb3ZlcmxheVwiO1xyXG4gIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7IGlmIChlLnRhcmdldCA9PT0gb3ZlcmxheSkgY2xvc2VJbXBvcnRNb2RhbCgpOyB9KTtcclxuXHJcbiAgY29uc3QgZGlhbG9nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBkaWFsb2cuY2xhc3NOYW1lID0gXCJpbXBvcnQtbW9kYWwtZGlhbG9nXCI7XHJcblxyXG4gIC8vIEhlYWRlclxyXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgaGVhZGVyLmNsYXNzTmFtZSA9IFwiaW1wb3J0LW1vZGFsLWhlYWRlclwiO1xyXG4gIGNvbnN0IGhlYWRlclRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGNvbnN0IHRpdGxlRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIHRpdGxlRWwuY2xhc3NOYW1lID0gXCJpbXBvcnQtbW9kYWwtdGl0bGVcIjtcclxuICB0aXRsZUVsLnRleHRDb250ZW50ID0gXCLlr7zlhaXmj5DnpLror41cIjtcclxuICBjb25zdCBzdWJ0aXRsZUVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBzdWJ0aXRsZUVsLmNsYXNzTmFtZSA9IFwiaW1wb3J0LW1vZGFsLXN1YnRpdGxlXCI7XHJcbiAgc3VidGl0bGVFbC50ZXh0Q29udGVudCA9IGDlhbEgJHtzdGF0ZS5pbXBvcnRNb2RhbFN0YXRlLmdyb3Vwcy5sZW5ndGh9IOS4quWIhue7hO+8jCR7dG90YWxQcm9tcHRzfSDmnaHmj5DnpLror40gwrcg5bey6YCJICR7c2VsZWN0ZWRDb3VudH0g5p2hYDtcclxuICBoZWFkZXJUZXh0LmFwcGVuZENoaWxkKHRpdGxlRWwpO1xyXG4gIGhlYWRlclRleHQuYXBwZW5kQ2hpbGQoc3VidGl0bGVFbCk7XHJcbiAgY29uc3QgY2xvc2VCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGNsb3NlQnRuLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIGNsb3NlQnRuLmNsYXNzTmFtZSA9IFwiaW1wb3J0LW1vZGFsLWNsb3NlXCI7XHJcbiAgY2xvc2VCdG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIuWFs+mXrVwiKTtcclxuICBjbG9zZUJ0bi5pbm5lckhUTUwgPSBgPHN2ZyB2aWV3Qm94PVwiMCAwIDE2IDE2XCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCI+PHBhdGggZD1cIk0yIDJsMTIgMTJNMTQgMkwyIDE0XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIi8+PC9zdmc+YDtcclxuICBjbG9zZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgY2xvc2VJbXBvcnRNb2RhbCk7XHJcbiAgaGVhZGVyLmFwcGVuZENoaWxkKGhlYWRlclRleHQpO1xyXG4gIGhlYWRlci5hcHBlbmRDaGlsZChjbG9zZUJ0bik7XHJcblxyXG4gIC8vIEJvZHlcclxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBib2R5LmNsYXNzTmFtZSA9IFwiaW1wb3J0LW1vZGFsLWJvZHlcIjtcclxuXHJcbiAgc3RhdGUuaW1wb3J0TW9kYWxTdGF0ZS5ncm91cHMuZm9yRWFjaCgoZ3JvdXAsIGdpKSA9PiB7XHJcbiAgICBjb25zdCBzZWxlY3RlZEluR3JvdXAgPSBncm91cC5wcm9tcHRTZWxlY3Rpb25zLmZpbHRlcihCb29sZWFuKS5sZW5ndGg7XHJcbiAgICBjb25zdCBhbGxTZWxlY3RlZCA9IHNlbGVjdGVkSW5Hcm91cCA9PT0gZ3JvdXAucHJvbXB0cy5sZW5ndGg7XHJcbiAgICBjb25zdCBub25lU2VsZWN0ZWQgPSBzZWxlY3RlZEluR3JvdXAgPT09IDA7XHJcblxyXG4gICAgY29uc3QgZ3JvdXBJdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGdyb3VwSXRlbS5jbGFzc05hbWUgPSBcImltcG9ydC1ncm91cC1pdGVtXCI7XHJcblxyXG4gICAgY29uc3QgZ3JvdXBSb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgZ3JvdXBSb3cuY2xhc3NOYW1lID0gXCJpbXBvcnQtZ3JvdXAtcm93XCI7XHJcblxyXG4gICAgY29uc3QgZ3JvdXBDaGVjayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcclxuICAgIGdyb3VwQ2hlY2sudHlwZSA9IFwiY2hlY2tib3hcIjtcclxuICAgIGdyb3VwQ2hlY2suY2xhc3NOYW1lID0gXCJpbXBvcnQtY2hlY2tib3hcIjtcclxuICAgIGdyb3VwQ2hlY2suY2hlY2tlZCA9IGFsbFNlbGVjdGVkO1xyXG4gICAgZ3JvdXBDaGVjay5pbmRldGVybWluYXRlID0gIWFsbFNlbGVjdGVkICYmICFub25lU2VsZWN0ZWQ7XHJcbiAgICBncm91cENoZWNrLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xyXG4gICAgICBzdGF0ZS5pbXBvcnRNb2RhbFN0YXRlLmdyb3Vwc1tnaV0ucHJvbXB0U2VsZWN0aW9ucyA9IHN0YXRlLmltcG9ydE1vZGFsU3RhdGUuZ3JvdXBzW2dpXS5wcm9tcHRzLm1hcCgoKSA9PiBncm91cENoZWNrLmNoZWNrZWQpO1xyXG4gICAgICByZW5kZXJJbXBvcnRNb2RhbCgpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgZXhwYW5kQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGV4cGFuZEJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGV4cGFuZEJ0bi5jbGFzc05hbWUgPSBcImltcG9ydC1leHBhbmQtYnRuXCI7XHJcbiAgICBleHBhbmRCdG4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBncm91cC5leHBhbmRlZCA/IFwi5pS26LW3XCIgOiBcIuWxleW8gFwiKTtcclxuICAgIGV4cGFuZEJ0bi5pbm5lckhUTUwgPSBncm91cC5leHBhbmRlZFxyXG4gICAgICA/IGA8c3ZnIHZpZXdCb3g9XCIwIDAgMTYgMTZcIiBmaWxsPVwibm9uZVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB3aWR0aD1cIjEyXCIgaGVpZ2h0PVwiMTJcIj48cGF0aCBkPVwiTTMgNmw1IDUgNS01XCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS44XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCIvPjwvc3ZnPmBcclxuICAgICAgOiBgPHN2ZyB2aWV3Qm94PVwiMCAwIDE2IDE2XCIgZmlsbD1cIm5vbmVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgd2lkdGg9XCIxMlwiIGhlaWdodD1cIjEyXCI+PHBhdGggZD1cIk02IDNsNSA1LTUgNVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuOFwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiLz48L3N2Zz5gO1xyXG4gICAgZXhwYW5kQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIHN0YXRlLmltcG9ydE1vZGFsU3RhdGUuZ3JvdXBzW2dpXS5leHBhbmRlZCA9ICFzdGF0ZS5pbXBvcnRNb2RhbFN0YXRlLmdyb3Vwc1tnaV0uZXhwYW5kZWQ7XHJcbiAgICAgIHJlbmRlckltcG9ydE1vZGFsKCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBncm91cE5hbWVFbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gICAgZ3JvdXBOYW1lRWwuY2xhc3NOYW1lID0gXCJpbXBvcnQtZ3JvdXAtbmFtZVwiO1xyXG4gICAgZ3JvdXBOYW1lRWwudGV4dENvbnRlbnQgPSBncm91cC5uYW1lO1xyXG4gICAgZ3JvdXBOYW1lRWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgc3RhdGUuaW1wb3J0TW9kYWxTdGF0ZS5ncm91cHNbZ2ldLmV4cGFuZGVkID0gIXN0YXRlLmltcG9ydE1vZGFsU3RhdGUuZ3JvdXBzW2dpXS5leHBhbmRlZDtcclxuICAgICAgcmVuZGVySW1wb3J0TW9kYWwoKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGdyb3VwTWV0YUVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICBncm91cE1ldGFFbC5jbGFzc05hbWUgPSBcImltcG9ydC1ncm91cC1tZXRhXCI7XHJcbiAgICBncm91cE1ldGFFbC50ZXh0Q29udGVudCA9IGAke3NlbGVjdGVkSW5Hcm91cH0vJHtncm91cC5wcm9tcHRzLmxlbmd0aH1gO1xyXG5cclxuICAgIGdyb3VwUm93LmFwcGVuZENoaWxkKGdyb3VwQ2hlY2spO1xyXG4gICAgZ3JvdXBSb3cuYXBwZW5kQ2hpbGQoZXhwYW5kQnRuKTtcclxuICAgIGdyb3VwUm93LmFwcGVuZENoaWxkKGdyb3VwTmFtZUVsKTtcclxuICAgIGdyb3VwUm93LmFwcGVuZENoaWxkKGdyb3VwTWV0YUVsKTtcclxuXHJcbiAgICBpZiAoZ3JvdXAuY29uZmxpY3RFeGlzdHMpIHtcclxuICAgICAgY29uc3QgYmFkZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcclxuICAgICAgYmFkZ2UuY2xhc3NOYW1lID0gXCJpbXBvcnQtY29uZmxpY3QtYmFkZ2VcIjtcclxuICAgICAgYmFkZ2UudGV4dENvbnRlbnQgPSBcIuW3suWtmOWcqFwiO1xyXG4gICAgICBncm91cFJvdy5hcHBlbmRDaGlsZChiYWRnZSk7XHJcblxyXG4gICAgICBjb25zdCBzdHJhdGVneVdyYXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBzdHJhdGVneVdyYXAuY2xhc3NOYW1lID0gXCJpbXBvcnQtc3RyYXRlZ3ktd3JhcFwiO1xyXG5cclxuICAgICAgW1wibWVyZ2VcIiwgXCJuZXdcIl0uZm9yRWFjaCgoc3RyYXRlZ3kpID0+IHtcclxuICAgICAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gICAgICAgIGJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICAgICAgICBidG4uY2xhc3NOYW1lID0gYGltcG9ydC1zdHJhdGVneS1idG4ke2dyb3VwLmNvbmZsaWN0U3RyYXRlZ3kgPT09IHN0cmF0ZWd5ID8gXCIgaXMtYWN0aXZlXCIgOiBcIlwifWA7XHJcbiAgICAgICAgYnRuLnRleHRDb250ZW50ID0gc3RyYXRlZ3kgPT09IFwibWVyZ2VcIiA/IFwi5ZCI5bm2XCIgOiBcIuaWsOW7ulwiO1xyXG4gICAgICAgIGJ0bi50aXRsZSA9IHN0cmF0ZWd5ID09PSBcIm1lcmdlXCIgPyBcIuWwhumAieS4reWGheWuuei/veWKoOWIsOW3suacieWIhue7hFwiIDogXCLkv53nlZnljp/liIbnu4TvvIzlj6blu7rmlrDliIbnu4RcIjtcclxuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgICAgIHN0YXRlLmltcG9ydE1vZGFsU3RhdGUuZ3JvdXBzW2dpXS5jb25mbGljdFN0cmF0ZWd5ID0gc3RyYXRlZ3k7XHJcbiAgICAgICAgICByZW5kZXJJbXBvcnRNb2RhbCgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHN0cmF0ZWd5V3JhcC5hcHBlbmRDaGlsZChidG4pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGdyb3VwUm93LmFwcGVuZENoaWxkKHN0cmF0ZWd5V3JhcCk7XHJcbiAgICB9XHJcblxyXG4gICAgZ3JvdXBJdGVtLmFwcGVuZENoaWxkKGdyb3VwUm93KTtcclxuXHJcbiAgICBpZiAoZ3JvdXAuZXhwYW5kZWQpIHtcclxuICAgICAgY29uc3QgcHJvbXB0TGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIHByb21wdExpc3QuY2xhc3NOYW1lID0gXCJpbXBvcnQtcHJvbXB0LWxpc3RcIjtcclxuICAgICAgZ3JvdXAucHJvbXB0cy5mb3JFYWNoKChwcm9tcHQsIHBpKSA9PiB7XHJcbiAgICAgICAgY29uc3QgcHJvbXB0Um93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxhYmVsXCIpO1xyXG4gICAgICAgIHByb21wdFJvdy5jbGFzc05hbWUgPSBcImltcG9ydC1wcm9tcHQtcm93XCI7XHJcbiAgICAgICAgY29uc3QgcHJvbXB0Q2hlY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XHJcbiAgICAgICAgcHJvbXB0Q2hlY2sudHlwZSA9IFwiY2hlY2tib3hcIjtcclxuICAgICAgICBwcm9tcHRDaGVjay5jbGFzc05hbWUgPSBcImltcG9ydC1jaGVja2JveFwiO1xyXG4gICAgICAgIHByb21wdENoZWNrLmNoZWNrZWQgPSBncm91cC5wcm9tcHRTZWxlY3Rpb25zW3BpXTtcclxuICAgICAgICBwcm9tcHRDaGVjay5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcclxuICAgICAgICAgIHN0YXRlLmltcG9ydE1vZGFsU3RhdGUuZ3JvdXBzW2dpXS5wcm9tcHRTZWxlY3Rpb25zW3BpXSA9IHByb21wdENoZWNrLmNoZWNrZWQ7XHJcbiAgICAgICAgICByZW5kZXJJbXBvcnRNb2RhbCgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IHByb21wdFRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICAgICAgcHJvbXB0VGl0bGUuY2xhc3NOYW1lID0gXCJpbXBvcnQtcHJvbXB0LXRpdGxlXCI7XHJcbiAgICAgICAgcHJvbXB0VGl0bGUudGV4dENvbnRlbnQgPSBwcm9tcHQudGl0bGU7XHJcbiAgICAgICAgcHJvbXB0Um93LmFwcGVuZENoaWxkKHByb21wdENoZWNrKTtcclxuICAgICAgICBwcm9tcHRSb3cuYXBwZW5kQ2hpbGQocHJvbXB0VGl0bGUpO1xyXG4gICAgICAgIHByb21wdExpc3QuYXBwZW5kQ2hpbGQocHJvbXB0Um93KTtcclxuICAgICAgfSk7XHJcbiAgICAgIGdyb3VwSXRlbS5hcHBlbmRDaGlsZChwcm9tcHRMaXN0KTtcclxuICAgIH1cclxuXHJcbiAgICBib2R5LmFwcGVuZENoaWxkKGdyb3VwSXRlbSk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIEZvb3RlclxyXG4gIGNvbnN0IGZvb3RlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgZm9vdGVyLmNsYXNzTmFtZSA9IFwiaW1wb3J0LW1vZGFsLWZvb3RlclwiO1xyXG5cclxuICBjb25zdCBjYW5jZWxCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGNhbmNlbEJ0bi50eXBlID0gXCJidXR0b25cIjtcclxuICBjYW5jZWxCdG4uY2xhc3NOYW1lID0gXCJpbXBvcnQtZm9vdGVyLWNhbmNlbC1idG5cIjtcclxuICBjYW5jZWxCdG4udGV4dENvbnRlbnQgPSBcIuWPlua2iFwiO1xyXG4gIGNhbmNlbEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgY2xvc2VJbXBvcnRNb2RhbCk7XHJcblxyXG4gIGNvbnN0IGNvbmZpcm1CdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIGNvbmZpcm1CdG4udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgY29uZmlybUJ0bi5jbGFzc05hbWUgPSBcImltcG9ydC1mb290ZXItY29uZmlybS1idG5cIjtcclxuICBjb25maXJtQnRuLnRleHRDb250ZW50ID0gc2VsZWN0ZWRDb3VudCA+IDAgPyBg5a+85YWl5bey6YCJ77yIJHtzZWxlY3RlZENvdW50fSDmnaHvvIlgIDogXCLlr7zlhaVcIjtcclxuICBjb25maXJtQnRuLmRpc2FibGVkID0gc2VsZWN0ZWRDb3VudCA9PT0gMDtcclxuICBjb25maXJtQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBkb0ltcG9ydCk7XHJcblxyXG4gIGZvb3Rlci5hcHBlbmRDaGlsZChjYW5jZWxCdG4pO1xyXG4gIGZvb3Rlci5hcHBlbmRDaGlsZChjb25maXJtQnRuKTtcclxuXHJcbiAgZGlhbG9nLmFwcGVuZENoaWxkKGhlYWRlcik7XHJcbiAgZGlhbG9nLmFwcGVuZENoaWxkKGJvZHkpO1xyXG4gIGRpYWxvZy5hcHBlbmRDaGlsZChmb290ZXIpO1xyXG4gIG92ZXJsYXkuYXBwZW5kQ2hpbGQoZGlhbG9nKTtcclxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjbG9zZUltcG9ydE1vZGFsKCkge1xyXG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvbXB0SW1wb3J0TW9kYWxcIik/LnJlbW92ZSgpO1xyXG4gIHN0YXRlLmltcG9ydE1vZGFsU3RhdGUgPSBudWxsO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBkb0ltcG9ydCgpIHtcclxuICBpZiAoIXN0YXRlLmltcG9ydE1vZGFsU3RhdGUpIHJldHVybjtcclxuICBjb25zdCBleGlzdGluZ0dyb3VwTWFwID0gbmV3IE1hcChzdGF0ZS5wcm9tcHRHcm91cHMubWFwKChnKSA9PiBbZy5uYW1lLCBnXSkpO1xyXG5cclxuICBzdGF0ZS5pbXBvcnRNb2RhbFN0YXRlLmdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgY29uc3Qgc2VsZWN0ZWRQcm9tcHRzID0gZ3JvdXAucHJvbXB0cy5maWx0ZXIoKF8sIGkpID0+IGdyb3VwLnByb21wdFNlbGVjdGlvbnNbaV0pO1xyXG4gICAgaWYgKCFzZWxlY3RlZFByb21wdHMubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgbmV3UHJvbXB0cyA9IHNlbGVjdGVkUHJvbXB0cy5tYXAoKHApID0+ICh7XHJcbiAgICAgIGlkOiBgcHJvbXB0LWltcG9ydC0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgNyl9YCxcclxuICAgICAgdGl0bGU6IHAudGl0bGUsXHJcbiAgICAgIGNvbnRlbnQ6IHAuY29udGVudFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmIChncm91cC5jb25mbGljdEV4aXN0cyAmJiBncm91cC5jb25mbGljdFN0cmF0ZWd5ID09PSBcIm1lcmdlXCIpIHtcclxuICAgICAgY29uc3QgZXhpc3RpbmcgPSBleGlzdGluZ0dyb3VwTWFwLmdldChncm91cC5uYW1lKTtcclxuICAgICAgaWYgKGV4aXN0aW5nKSB7XHJcbiAgICAgICAgZXhpc3RpbmcucHJvbXB0cy5wdXNoKC4uLm5ld1Byb21wdHMpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBsZXQgbmFtZSA9IGdyb3VwLm5hbWU7XHJcbiAgICAgIGlmIChncm91cC5jb25mbGljdEV4aXN0cyAmJiBncm91cC5jb25mbGljdFN0cmF0ZWd5ID09PSBcIm5ld1wiKSB7XHJcbiAgICAgICAgbGV0IHN1ZmZpeCA9IDI7XHJcbiAgICAgICAgd2hpbGUgKHN0YXRlLnByb21wdEdyb3Vwcy5zb21lKChnKSA9PiBnLm5hbWUgPT09IG5hbWUpKSB7XHJcbiAgICAgICAgICBuYW1lID0gYCR7Z3JvdXAubmFtZX0gKCR7c3VmZml4Kyt9KWA7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHN0YXRlLnByb21wdEdyb3Vwcy5wdXNoKHtcclxuICAgICAgICBpZDogYHByb21wdC1ncm91cC1pbXBvcnQtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDcpfWAsXHJcbiAgICAgICAgbmFtZSxcclxuICAgICAgICBwcm9tcHRzOiBuZXdQcm9tcHRzXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBhd2FpdCBwZXJzaXN0QWxsKCk7XHJcbiAgY2xvc2VJbXBvcnRNb2RhbCgpO1xyXG4gIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBzdGF0ZS5wcm9tcHRHcm91cHNbMF0/LmlkIHx8IG51bGw7XHJcbiAgc3RhdGUucmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxufVxyXG4iLCAiLy8gT3JjaGVzdHJhdGlvbiBmb3IgdGhlIHNldHRpbmdzIHBhZ2U6IGNhY2hlcyBET00gcmVmcywgbG9hZHMgc3RvcmFnZSxcclxuLy8gYmluZHMgZXZlbnRzLCBhbmQgZGlzcGF0Y2hlcyB0byBzZWN0aW9uIHJlbmRlcmVycy5cclxuXHJcbmltcG9ydCB7XHJcbiAgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSBhcyBHUk9VUFNfU1RPUkFHRV9LRVksXHJcbiAgUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWSBhcyBQUk9NUFRTX1NUT1JBR0VfS0VZLFxyXG4gIFVJX1BSRUZTX1NUT1JBR0VfS0VZLFxyXG4gIENVU1RPTV9TSVRFU19TVE9SQUdFX0tFWSxcclxuICBSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZLFxyXG59IGZyb20gXCIuLi8uLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgc3RhdGUsXHJcbiAgbXNnLFxyXG4gIGFwcGx5RG9tSTE4bixcclxuICBTRUNUSU9OX01FVEEsXHJcbn0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgbG9hZEJ1aWx0aW5TaXRlcyB9IGZyb20gXCIuL3V0aWxzLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgY3JlYXRlTm9ybWFsaXplZEdyb3VwcyxcclxuICBjcmVhdGVOb3JtYWxpemVkUHJvbXB0R3JvdXBzLFxyXG4gIGNyZWF0ZU5vcm1hbGl6ZWRVaVByZWZzLFxyXG4gIGNyZWF0ZU5vcm1hbGl6ZWRDdXN0b21TaXRlcyxcclxuICBtZXJnZVNpdGVzLFxyXG4gIHN5bmNDdXN0b21DYXRlZ29yeUlkcyxcclxufSBmcm9tIFwiLi9zdG9yZS5qc1wiO1xyXG5pbXBvcnQgeyBhdHRhY2hHcm91cERyYWcgfSBmcm9tIFwiLi9kcmFnLmpzXCI7XHJcbmltcG9ydCB7IHJlbmRlckdyb3Vwc1NlY3Rpb24sIGNsb3NlUGlja2VyIH0gZnJvbSBcIi4vc2VjdGlvbnMvZ3JvdXBzLmpzXCI7XHJcbmltcG9ydCB7IHJlbmRlclByb21wdHNTZWN0aW9uIH0gZnJvbSBcIi4vc2VjdGlvbnMvcHJvbXB0cy5qc1wiO1xyXG5pbXBvcnQgeyByZW5kZXJDdXN0b21TZWN0aW9uIH0gZnJvbSBcIi4vc2VjdGlvbnMvY3VzdG9tLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgcmVuZGVyUmFuZG9tU2VjdGlvbixcclxuICBsb2FkRGVmYXVsdFJhbmRvbVF1ZXN0aW9uc1RleHQsXHJcbn0gZnJvbSBcIi4vc2VjdGlvbnMvcmFuZG9tLmpzXCI7XHJcbmltcG9ydCB7IHJlbmRlck90aGVyU2VjdGlvbiB9IGZyb20gXCIuL3NlY3Rpb25zL290aGVyLmpzXCI7XHJcbmltcG9ydCB7IHJlbmRlckFib3V0U2VjdGlvbiB9IGZyb20gXCIuL3NlY3Rpb25zL2Fib3V0LmpzXCI7XHJcbmltcG9ydCB7IGhhbmRsZUV4cG9ydCwgaGFuZGxlSW1wb3J0RmlsZUNoYW5nZSB9IGZyb20gXCIuL2ltcG9ydC1leHBvcnQuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpbml0U2V0dGluZ3NQYWdlKCkge1xyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIHN0YXJ0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FjaGVFbGVtZW50cygpIHtcclxuICBzdGF0ZS5kb20uZ3JvdXBzU2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ3JvdXBzU2VjdGlvblwiKTtcclxuICBzdGF0ZS5kb20ucHJvbXB0c1NlY3Rpb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb21wdHNTZWN0aW9uXCIpO1xyXG4gIHN0YXRlLmRvbS5jdXN0b21TZWN0aW9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjdXN0b21TZWN0aW9uXCIpO1xyXG4gIHN0YXRlLmRvbS5yYW5kb21TZWN0aW9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyYW5kb21TZWN0aW9uXCIpO1xyXG4gIHN0YXRlLmRvbS5vdGhlclNlY3Rpb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm90aGVyU2VjdGlvblwiKTtcclxuICBzdGF0ZS5kb20uYWJvdXRTZWN0aW9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhYm91dFNlY3Rpb25cIik7XHJcbiAgc3RhdGUuZG9tLnNlY3Rpb25FeWVicm93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWN0aW9uRXllYnJvd1wiKTtcclxuICBzdGF0ZS5kb20uc2VjdGlvbkxvZ29XcmFwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWN0aW9uTG9nb1dyYXBcIik7XHJcbiAgc3RhdGUuZG9tLnNlY3Rpb25UaXRsZVJvdyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2VjdGlvblRpdGxlUm93XCIpO1xyXG4gIHN0YXRlLmRvbS5zZWN0aW9uVGl0bGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNlY3Rpb25UaXRsZVwiKTtcclxuICBzdGF0ZS5kb20uc2VjdGlvblN1YnRpdGxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzZWN0aW9uU3VidGl0bGVcIik7XHJcbiAgc3RhdGUuZG9tLnByb21wdHNIZWFkZXJBY3Rpb25zID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9tcHRzSGVhZGVyQWN0aW9uc1wiKTtcclxuICBzdGF0ZS5kb20ucHJvbXB0TGVhcm5MaW5rID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwcm9tcHRMZWFybkxpbmtcIik7XHJcbiAgc3RhdGUuZG9tLm5hdkl0ZW1zID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKFwiLnNldHRpbmdzLW5hdi1pdGVtXCIpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVnaXN0ZXJSZW5kZXJDYWxsYmFja3MoKSB7XHJcbiAgc3RhdGUucmVuZGVyQ3VycmVudFNlY3Rpb24gPSByZW5kZXJDdXJyZW50U2VjdGlvbjtcclxuICBzdGF0ZS5yZW5kZXJHcm91cHNTZWN0aW9uID0gcmVuZGVyR3JvdXBzU2VjdGlvbjtcclxuICBzdGF0ZS5yZW5kZXJQcm9tcHRzU2VjdGlvbiA9IHJlbmRlclByb21wdHNTZWN0aW9uO1xyXG4gIHN0YXRlLnJlbmRlckN1c3RvbVNlY3Rpb24gPSByZW5kZXJDdXN0b21TZWN0aW9uO1xyXG4gIHN0YXRlLnJlbmRlclJhbmRvbVNlY3Rpb24gPSByZW5kZXJSYW5kb21TZWN0aW9uO1xyXG4gIHN0YXRlLnJlbmRlck90aGVyU2VjdGlvbiA9IHJlbmRlck90aGVyU2VjdGlvbjtcclxuICBzdGF0ZS5yZW5kZXJBYm91dFNlY3Rpb24gPSByZW5kZXJBYm91dFNlY3Rpb247XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0KCkge1xyXG4gIGFwcGx5RG9tSTE4bj8uKGRvY3VtZW50KTtcclxuICBjYWNoZUVsZW1lbnRzKCk7XHJcbiAgcmVnaXN0ZXJSZW5kZXJDYWxsYmFja3MoKTtcclxuXHJcbiAgY29uc3QgYnVpbHRpblNpdGVzID0gYXdhaXQgbG9hZEJ1aWx0aW5TaXRlcygpO1xyXG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbXHJcbiAgICBHUk9VUFNfU1RPUkFHRV9LRVksXHJcbiAgICBQUk9NUFRTX1NUT1JBR0VfS0VZLFxyXG4gICAgVUlfUFJFRlNfU1RPUkFHRV9LRVksXHJcbiAgICBDVVNUT01fU0lURVNfU1RPUkFHRV9LRVksXHJcbiAgICBSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZLFxyXG4gIF0pO1xyXG4gIHN0YXRlLmN1c3RvbVNpdGVzID0gY3JlYXRlTm9ybWFsaXplZEN1c3RvbVNpdGVzKHN0b3JlZFtDVVNUT01fU0lURVNfU1RPUkFHRV9LRVldKTtcclxuICBzdGF0ZS5zaXRlcyA9IG1lcmdlU2l0ZXMoYnVpbHRpblNpdGVzLCBzdGF0ZS5jdXN0b21TaXRlcyk7XHJcbiAgc3luY0N1c3RvbUNhdGVnb3J5SWRzKCk7XHJcbiAgc3RhdGUuZ3JvdXBzID0gY3JlYXRlTm9ybWFsaXplZEdyb3VwcyhzdG9yZWRbR1JPVVBTX1NUT1JBR0VfS0VZXSk7XHJcbiAgc3RhdGUucHJvbXB0R3JvdXBzID0gY3JlYXRlTm9ybWFsaXplZFByb21wdEdyb3VwcyhzdG9yZWRbUFJPTVBUU19TVE9SQUdFX0tFWV0pO1xyXG4gIHN0YXRlLnVpUHJlZnMgPSBjcmVhdGVOb3JtYWxpemVkVWlQcmVmcyhzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldKTtcclxuICBjb25zdCB1aUxhbmcgPSAoKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIChjaHJvbWU/LmkxOG4/LmdldFVJTGFuZ3VhZ2U/LigpIHx8IG5hdmlnYXRvci5sYW5ndWFnZSB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgfSBjYXRjaCAoX2UpIHtcclxuICAgICAgcmV0dXJuIChuYXZpZ2F0b3IubGFuZ3VhZ2UgfHwgXCJcIikudG9Mb3dlckNhc2UoKTtcclxuICAgIH1cclxuICB9KSgpO1xyXG4gIHN0YXRlLmRlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0ID0gYXdhaXQgbG9hZERlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0KHVpTGFuZyk7XHJcbiAgY29uc3Qgb3RoZXJMYW5nID0gdWlMYW5nLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFwiZW5cIiA6IFwiemhcIjtcclxuICBjb25zdCBvdGhlckRlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0ID0gYXdhaXQgbG9hZERlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0KG90aGVyTGFuZyk7XHJcbiAgY29uc3Qgc3RvcmVkUmF3ID0gc3RvcmVkW1JBTkRPTV9RVUVTVElPTlNfU1RPUkFHRV9LRVldO1xyXG4gIC8vIOWmguaenOWtmOWCqOeahOWGheWuueaYr+aXp+eJiO+8iOS7pSAjIOazqOmHiuW8gOWktOeahOivtOaYjuWdl++8ie+8jOinhuS4uuacquiHquWumuS5ie+8jOabv+aNouS4uuaWsOeahOW5suWHgOm7mOiupOmimOW6k1xyXG4gIGNvbnN0IGlzT2xkRGVmYXVsdCA9IHR5cGVvZiBzdG9yZWRSYXcgPT09IFwic3RyaW5nXCIgJiYgc3RvcmVkUmF3LnRyaW1TdGFydCgpLnN0YXJ0c1dpdGgoXCIjXCIpO1xyXG4gIGNvbnN0IGhhc1VzZXJSYW5kb21RdWVzdGlvbnMgPSB0eXBlb2Ygc3RvcmVkUmF3ID09PSBcInN0cmluZ1wiICYmIHN0b3JlZFJhdy50cmltKCkubGVuZ3RoID4gMDtcclxuICBjb25zdCBub3JtYWxpemVkUmF3ID0gaGFzVXNlclJhbmRvbVF1ZXN0aW9ucyA/IHN0b3JlZFJhdy50cmltKCkgOiBcIlwiO1xyXG4gIGNvbnN0IG5vcm1hbGl6ZWRPdGhlckRlZmF1bHQgPSBvdGhlckRlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0LnRyaW0oKTtcclxuICBjb25zdCBpc1N0b3JlZE90aGVyTGFuZ0RlZmF1bHQgPSBub3JtYWxpemVkUmF3ICYmIG5vcm1hbGl6ZWRSYXcgPT09IG5vcm1hbGl6ZWRPdGhlckRlZmF1bHQ7XHJcbiAgc3RhdGUucmFuZG9tUXVlc3Rpb25zVGV4dCA9IChoYXNVc2VyUmFuZG9tUXVlc3Rpb25zICYmICFpc09sZERlZmF1bHQgJiYgIWlzU3RvcmVkT3RoZXJMYW5nRGVmYXVsdClcclxuICAgID8gc3RvcmVkUmF3XHJcbiAgICA6IHN0YXRlLmRlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0O1xyXG4gIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBzdGF0ZS5wcm9tcHRHcm91cHNbMF0/LmlkIHx8IG51bGw7XHJcblxyXG4gIGlmICghQXJyYXkuaXNBcnJheShzdG9yZWRbR1JPVVBTX1NUT1JBR0VfS0VZXSkgfHwgc3RvcmVkW0dST1VQU19TVE9SQUdFX0tFWV0ubGVuZ3RoID09PSAwKSB7XHJcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbR1JPVVBTX1NUT1JBR0VfS0VZXTogc3RhdGUuZ3JvdXBzIH0pO1xyXG4gIH1cclxuICBpZiAoIUFycmF5LmlzQXJyYXkoc3RvcmVkW1BST01QVFNfU1RPUkFHRV9LRVldKSB8fCBzdG9yZWRbUFJPTVBUU19TVE9SQUdFX0tFWV0ubGVuZ3RoID09PSAwKSB7XHJcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbUFJPTVBUU19TVE9SQUdFX0tFWV06IHN0YXRlLnByb21wdEdyb3VwcyB9KTtcclxuICB9XHJcbiAgaWYgKCFzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldIHx8IHR5cGVvZiBzdG9yZWRbVUlfUFJFRlNfU1RPUkFHRV9LRVldICE9PSBcIm9iamVjdFwiKSB7XHJcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbVUlfUFJFRlNfU1RPUkFHRV9LRVldOiBzdGF0ZS51aVByZWZzIH0pO1xyXG4gIH1cclxuICBpZiAoIUFycmF5LmlzQXJyYXkoc3RvcmVkW0NVU1RPTV9TSVRFU19TVE9SQUdFX0tFWV0pKSB7XHJcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZXTogc3RhdGUuY3VzdG9tU2l0ZXMgfSk7XHJcbiAgfVxyXG5cclxuICBiaW5kRXZlbnRzKCk7XHJcbiAgY29uc3QgaGFzaFNlY3Rpb24gPVxyXG4gICAgbmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpLmdldChcInNlY3Rpb25cIikgfHxcclxuICAgIGxvY2F0aW9uLmhhc2gucmVwbGFjZShcIiNcIiwgXCJcIik7XHJcbiAgaWYgKGhhc2hTZWN0aW9uICYmIFNFQ1RJT05fTUVUQVtoYXNoU2VjdGlvbl0pIHtcclxuICAgIHNldEFjdGl2ZVNlY3Rpb24oaGFzaFNlY3Rpb24pO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBzZXRBY3RpdmVTZWN0aW9uKHN0YXRlLmFjdGl2ZVNlY3Rpb24pO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYmluZEV2ZW50cygpIHtcclxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgaGFuZGxlRG9jdW1lbnRDbGljayk7XHJcbiAgYXR0YWNoR3JvdXBEcmFnKHN0YXRlLmRvbS5ncm91cHNTZWN0aW9uKTtcclxuXHJcbiAgc3RhdGUuZG9tLm5hdkl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcclxuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgc2V0QWN0aXZlU2VjdGlvbihpdGVtLmRhdGFzZXQuc2VjdGlvbiB8fCBcImdyb3Vwc1wiKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBjb25zdCBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb21wdEV4cG9ydEJ0blwiKTtcclxuICBpZiAoZXhwb3J0QnRuKSB7XHJcbiAgICBleHBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZUV4cG9ydCk7XHJcbiAgfVxyXG4gIGNvbnN0IGltcG9ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicHJvbXB0SW1wb3J0QnRuXCIpO1xyXG4gIGlmIChpbXBvcnRCdG4pIHtcclxuICAgIGltcG9ydEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBjb25zdCBmaWxlSW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiaW5wdXRcIik7XHJcbiAgICAgIGZpbGVJbnB1dC50eXBlID0gXCJmaWxlXCI7XHJcbiAgICAgIGZpbGVJbnB1dC5hY2NlcHQgPSBcIi5tZCwuanNvblwiO1xyXG4gICAgICBmaWxlSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBoYW5kbGVJbXBvcnRGaWxlQ2hhbmdlKTtcclxuICAgICAgZmlsZUlucHV0LmNsaWNrKCk7XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGhhbmRsZURvY3VtZW50Q2xpY2soZXZlbnQpIHtcclxuICBpZiAoc3RhdGUub3BlblBpY2tlckdyb3VwSWQgJiYgIWV2ZW50LnRhcmdldC5jbG9zZXN0KFwiLmlubGluZS1hZGQtd3JhcFwiKSkge1xyXG4gICAgY2xvc2VQaWNrZXIoKTtcclxuICAgIHJlbmRlckdyb3Vwc1NlY3Rpb24oKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIGlmICghZXZlbnQudGFyZ2V0LmNsb3Nlc3QoXCIuZ3JvdXAtbW9kZS1kcm9wZG93blwiKSkge1xyXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcIi5ncm91cC1tb2RlLWRyb3Bkb3duXCIpLmZvckVhY2goKGRyb3Bkb3duKSA9PiB7XHJcbiAgICAgIGRyb3Bkb3duLmNsYXNzTGlzdC5yZW1vdmUoXCJpcy1vcGVuXCIpO1xyXG4gICAgICBjb25zdCB0cmlnZ2VyID0gZHJvcGRvd24ucXVlcnlTZWxlY3RvcihcIltkYXRhLWZpZWxkPSdtb2RlLXRyaWdnZXInXVwiKTtcclxuICAgICAgY29uc3QgbWVudSA9IGRyb3Bkb3duLnF1ZXJ5U2VsZWN0b3IoXCJbZGF0YS1maWVsZD0nbW9kZS1tZW51J11cIik7XHJcbiAgICAgIGlmICh0cmlnZ2VyKSB7XHJcbiAgICAgICAgdHJpZ2dlci5zZXRBdHRyaWJ1dGUoXCJhcmlhLWV4cGFuZGVkXCIsIFwiZmFsc2VcIik7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKG1lbnUpIHtcclxuICAgICAgICBtZW51LmhpZGRlbiA9IHRydWU7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2V0QWN0aXZlU2VjdGlvbihzZWN0aW9uS2V5KSB7XHJcbiAgaWYgKCFTRUNUSU9OX01FVEFbc2VjdGlvbktleV0pIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgc3RhdGUuYWN0aXZlU2VjdGlvbiA9IHNlY3Rpb25LZXk7XHJcbiAgc3RhdGUuZG9tLm5hdkl0ZW1zLmZvckVhY2goKGl0ZW0pID0+XHJcbiAgICBpdGVtLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1hY3RpdmVcIiwgaXRlbS5kYXRhc2V0LnNlY3Rpb24gPT09IHNlY3Rpb25LZXkpXHJcbiAgKTtcclxuICBjb25zdCBtZXRhID0gU0VDVElPTl9NRVRBW3NlY3Rpb25LZXldO1xyXG4gIGNvbnN0IGV5ZWJyb3cgPSBtZXRhLmV5ZWJyb3dLZXkgPyBtc2cobWV0YS5leWVicm93S2V5LCBtZXRhLmV5ZWJyb3cpIDogKG1ldGEuZXllYnJvdyB8fCBcIlwiKTtcclxuICBjb25zdCB0aXRsZSA9IG1ldGEudGl0bGVLZXkgPyBtc2cobWV0YS50aXRsZUtleSwgbWV0YS50aXRsZSkgOiAobWV0YS50aXRsZSB8fCBcIlwiKTtcclxuICBjb25zdCBzdWJ0aXRsZSA9IG1ldGEuc3VidGl0bGVLZXkgPyBtc2cobWV0YS5zdWJ0aXRsZUtleSwgbWV0YS5zdWJ0aXRsZSkgOiAobWV0YS5zdWJ0aXRsZSB8fCBcIlwiKTtcclxuICBzdGF0ZS5kb20uc2VjdGlvbkV5ZWJyb3cudGV4dENvbnRlbnQgPSBleWVicm93O1xyXG4gIHN0YXRlLmRvbS5zZWN0aW9uRXllYnJvdy5oaWRkZW4gPSB0cnVlO1xyXG4gIHN0YXRlLmRvbS5zZWN0aW9uVGl0bGUudGV4dENvbnRlbnQgPSB0aXRsZTtcclxuICBzdGF0ZS5kb20uc2VjdGlvblRpdGxlLmhpZGRlbiA9ICF0aXRsZTtcclxuICBzdGF0ZS5kb20uc2VjdGlvblN1YnRpdGxlLnRleHRDb250ZW50ID0gc3VidGl0bGU7XHJcbiAgc3RhdGUuZG9tLnNlY3Rpb25TdWJ0aXRsZS5oaWRkZW4gPSAhc3VidGl0bGU7XHJcbiAgc3RhdGUuZG9tLnNlY3Rpb25Mb2dvV3JhcC5oaWRkZW4gPSBzZWN0aW9uS2V5ICE9PSBcImFib3V0XCI7XHJcbiAgc3RhdGUuZG9tLnNlY3Rpb25UaXRsZVJvdy5oaWRkZW4gPSAhdGl0bGUgJiYgc2VjdGlvbktleSAhPT0gXCJwcm9tcHRzXCI7XHJcbiAgdXBkYXRlU2VjdGlvblZpc2liaWxpdHkoKTtcclxuICByZW5kZXJDdXJyZW50U2VjdGlvbigpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXJDdXJyZW50U2VjdGlvbigpIHtcclxuICB1cGRhdGVTZWN0aW9uVmlzaWJpbGl0eSgpO1xyXG4gIGlmIChzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcInByb21wdHNcIikge1xyXG4gICAgcmVuZGVyUHJvbXB0c1NlY3Rpb24oKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVNlY3Rpb24gPT09IFwiY3VzdG9tXCIpIHtcclxuICAgIHJlbmRlckN1c3RvbVNlY3Rpb24oKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVNlY3Rpb24gPT09IFwicmFuZG9tXCIpIHtcclxuICAgIHJlbmRlclJhbmRvbVNlY3Rpb24oKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgaWYgKHN0YXRlLmFjdGl2ZVNlY3Rpb24gPT09IFwib3RoZXJcIikge1xyXG4gICAgcmVuZGVyT3RoZXJTZWN0aW9uKCk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIGlmIChzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcImFib3V0XCIpIHtcclxuICAgIHJlbmRlckFib3V0U2VjdGlvbigpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICByZW5kZXJHcm91cHNTZWN0aW9uKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZVNlY3Rpb25WaXNpYmlsaXR5KCkge1xyXG4gIGNvbnN0IHsgZG9tIH0gPSBzdGF0ZTtcclxuICBjb25zdCBzaG93R3JvdXBzID0gc3RhdGUuYWN0aXZlU2VjdGlvbiA9PT0gXCJncm91cHNcIjtcclxuICBjb25zdCBzaG93UHJvbXB0cyA9IHN0YXRlLmFjdGl2ZVNlY3Rpb24gPT09IFwicHJvbXB0c1wiO1xyXG4gIGNvbnN0IHNob3dDdXN0b20gPSBzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcImN1c3RvbVwiO1xyXG4gIGNvbnN0IHNob3dSYW5kb20gPSBzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcInJhbmRvbVwiO1xyXG4gIGNvbnN0IHNob3dPdGhlciA9IHN0YXRlLmFjdGl2ZVNlY3Rpb24gPT09IFwib3RoZXJcIjtcclxuICBjb25zdCBzaG93QWJvdXQgPSBzdGF0ZS5hY3RpdmVTZWN0aW9uID09PSBcImFib3V0XCI7XHJcbiAgaWYgKGRvbS5ncm91cHNTZWN0aW9uKSB7XHJcbiAgICBkb20uZ3JvdXBzU2VjdGlvbi5oaWRkZW4gPSAhc2hvd0dyb3VwcztcclxuICAgIGRvbS5ncm91cHNTZWN0aW9uLnN0eWxlLmRpc3BsYXkgPSBzaG93R3JvdXBzID8gXCJmbGV4XCIgOiBcIm5vbmVcIjtcclxuICB9XHJcbiAgaWYgKGRvbS5wcm9tcHRzU2VjdGlvbikge1xyXG4gICAgZG9tLnByb21wdHNTZWN0aW9uLmhpZGRlbiA9ICFzaG93UHJvbXB0cztcclxuICAgIGRvbS5wcm9tcHRzU2VjdGlvbi5zdHlsZS5kaXNwbGF5ID0gc2hvd1Byb21wdHMgPyBcImZsZXhcIiA6IFwibm9uZVwiO1xyXG4gIH1cclxuICBpZiAoZG9tLmN1c3RvbVNlY3Rpb24pIHtcclxuICAgIGRvbS5jdXN0b21TZWN0aW9uLmhpZGRlbiA9ICFzaG93Q3VzdG9tO1xyXG4gICAgZG9tLmN1c3RvbVNlY3Rpb24uc3R5bGUuZGlzcGxheSA9IHNob3dDdXN0b20gPyBcImZsZXhcIiA6IFwibm9uZVwiO1xyXG4gIH1cclxuICBpZiAoZG9tLnJhbmRvbVNlY3Rpb24pIHtcclxuICAgIGRvbS5yYW5kb21TZWN0aW9uLmhpZGRlbiA9ICFzaG93UmFuZG9tO1xyXG4gICAgZG9tLnJhbmRvbVNlY3Rpb24uc3R5bGUuZGlzcGxheSA9IHNob3dSYW5kb20gPyBcImZsZXhcIiA6IFwibm9uZVwiO1xyXG4gIH1cclxuICBpZiAoZG9tLm90aGVyU2VjdGlvbikge1xyXG4gICAgZG9tLm90aGVyU2VjdGlvbi5oaWRkZW4gPSAhc2hvd090aGVyO1xyXG4gICAgZG9tLm90aGVyU2VjdGlvbi5zdHlsZS5kaXNwbGF5ID0gc2hvd090aGVyID8gXCJmbGV4XCIgOiBcIm5vbmVcIjtcclxuICB9XHJcbiAgaWYgKGRvbS5hYm91dFNlY3Rpb24pIHtcclxuICAgIGRvbS5hYm91dFNlY3Rpb24uaGlkZGVuID0gIXNob3dBYm91dDtcclxuICAgIGRvbS5hYm91dFNlY3Rpb24uc3R5bGUuZGlzcGxheSA9IHNob3dBYm91dCA/IFwiZmxleFwiIDogXCJub25lXCI7XHJcbiAgfVxyXG4gIGlmIChkb20ucHJvbXB0c0hlYWRlckFjdGlvbnMpIHtcclxuICAgIGRvbS5wcm9tcHRzSGVhZGVyQWN0aW9ucy5oaWRkZW4gPSAhc2hvd1Byb21wdHM7XHJcbiAgICBkb20ucHJvbXB0c0hlYWRlckFjdGlvbnMuc3R5bGUuZGlzcGxheSA9IHNob3dQcm9tcHRzID8gXCJmbGV4XCIgOiBcIm5vbmVcIjtcclxuICB9XHJcbiAgaWYgKGRvbS5wcm9tcHRMZWFybkxpbmspIHtcclxuICAgIGRvbS5wcm9tcHRMZWFybkxpbmsuaGlkZGVuID0gIXNob3dQcm9tcHRzO1xyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgaW5pdFNldHRpbmdzUGFnZSB9IGZyb20gXCIuL3NldHRpbmdzL21haW4uanNcIjtcclxuaW5pdFNldHRpbmdzUGFnZSgpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUFPLE1BQU0sNEJBQTRCO0FBQ2xDLE1BQU0sNEJBQTRCO0FBQ2xDLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0sK0JBQStCO0FBSXJDLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sNEJBQTRCO0FBRWxDLE1BQU0seUJBQXlCO0FBQUEsSUFDcEMsSUFBSTtBQUFBLElBQ0osSUFBSTtBQUFBLEVBQ047OztBQ1ZBLE1BQU0sWUFBYSxPQUFPLFdBQVcsZUFBZSxPQUFPLGtCQUFtQixDQUFDO0FBQ3hFLE1BQU0sSUFBSSxVQUFVO0FBQ3BCLE1BQU0sZUFBZSxVQUFVO0FBRS9CLE1BQU0sTUFBTSxDQUFDLEtBQUssYUFBYyxJQUFLLEVBQUUsR0FBRyxLQUFLLFlBQVksS0FBTSxZQUFZO0FBRTdFLE1BQU0sd0JBQXdCO0FBRTlCLE1BQU0sMkJBQTJCO0FBQUEsSUFDdEM7QUFBQSxJQUFLO0FBQUEsSUFBUztBQUFBLElBQU07QUFBQSxJQUFRO0FBQUEsSUFBTTtBQUFBLElBQVc7QUFBQSxJQUFLO0FBQUEsSUFBVTtBQUFBLElBQU87QUFBQSxJQUFLO0FBQUEsSUFBUTtBQUFBLElBQVE7QUFBQSxFQUMxRjtBQUVPLE1BQU0sa0JBQWtCO0FBQUEsSUFDN0IsSUFBSSxFQUFFLE9BQU8sTUFBTSxTQUFTLENBQUMsWUFBWSxVQUFVLFFBQVEsV0FBVyxRQUFRLFVBQVUsVUFBVSxXQUFXLFVBQVUs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O0FBQ25CO0FBQUEsSUFDRjtBQUNBLFFBQUksTUFBTSxrQkFBa0IsU0FBUztBQUNuQyx5QkFBbUI7QUFDbkI7QUFBQSxJQUNGO0FBQ0Esd0JBQW9CO0FBQUEsRUFDdEI7QUFFQSxXQUFTLDBCQUEwQjtBQUNqQyxVQUFNLEVBQUUsSUFBSSxJQUFJO0FBQ2hCLFVBQU0sYUFBYSxNQUFNLGtCQUFrQjtBQUMzQyxVQUFNLGNBQWMsTUFBTSxrQkFBa0I7QUFDNUMsVUFBTSxhQUFhLE1BQU0sa0JBQWtCO0FBQzNDLFVBQU0sYUFBYSxNQUFNLGtCQUFrQjtBQUMzQyxVQUFNLFlBQVksTUFBTSxrQkFBa0I7QUFDMUMsVUFBTSxZQUFZLE1BQU0sa0JBQWtCO0FBQzFDLFFBQUksSUFBSSxlQUFlO0FBQ3JCLFVBQUksY0FBYyxTQUFTLENBQUM7QUFDNUIsVUFBSSxjQUFjLE1BQU0sVUFBVSxhQUFhLFNBQVM7QUFBQSxJQUMxRDtBQUNBLFFBQUksSUFBSSxnQkFBZ0I7QUFDdEIsVUFBSSxlQUFlLFNBQVMsQ0FBQztBQUM3QixVQUFJLGVBQWUsTUFBTSxVQUFVLGNBQWMsU0FBUztBQUFBLElBQzVEO0FBQ0EsUUFBSSxJQUFJLGVBQWU7QUFDckIsVUFBSSxjQUFjLFNBQVMsQ0FBQztBQUM1QixVQUFJLGNBQWMsTUFBTSxVQUFVLGFBQWEsU0FBUztBQUFBLElBQzFEO0FBQ0EsUUFBSSxJQUFJLGVBQWU7QUFDckIsVUFBSSxjQUFjLFNBQVMsQ0FBQztBQUM1QixVQUFJLGNBQWMsTUFBTSxVQUFVLGFBQWEsU0FBUztBQUFBLElBQzFEO0FBQ0EsUUFBSSxJQUFJLGNBQWM7QUFDcEIsVUFBSSxhQUFhLFNBQVMsQ0FBQztBQUMzQixVQUFJLGFBQWEsTUFBTSxVQUFVLFlBQVksU0FBUztBQUFBLElBQ3hEO0FBQ0EsUUFBSSxJQUFJLGNBQWM7QUFDcEIsVUFBSSxhQUFhLFNBQVMsQ0FBQztBQUMzQixVQUFJLGFBQWEsTUFBTSxVQUFVLFlBQVksU0FBUztBQUFBLElBQ3hEO0FBQ0EsUUFBSSxJQUFJLHNCQUFzQjtBQUM1QixVQUFJLHFCQUFxQixTQUFTLENBQUM7QUFDbkMsVUFBSSxxQkFBcUIsTUFBTSxVQUFVLGNBQWMsU0FBUztBQUFBLElBQ2xFO0FBQ0EsUUFBSSxJQUFJLGlCQUFpQjtBQUN2QixVQUFJLGdCQUFnQixTQUFTLENBQUM7QUFBQSxJQUNoQztBQUFBLEVBQ0Y7OztBQzVRQSxtQkFBaUI7IiwKICAibmFtZXMiOiBbXQp9Cg==
