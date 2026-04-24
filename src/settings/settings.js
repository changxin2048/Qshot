(function initSettingsPage() {
  const { t, applyDomI18n } = window.__QSHOT_I18N__ || {};
  const msg = (key, fallback) => (t ? (t(key) || fallback || "") : fallback || "");

  const GROUPS_STORAGE_KEY = "searchGroups";
  const PROMPTS_STORAGE_KEY = "promptGroups";
  const UI_PREFS_STORAGE_KEY = "uiPrefs";
  const CUSTOM_SITES_STORAGE_KEY = "customSites";
  const RANDOM_QUESTIONS_STORAGE_KEY = "randomQuestionsText";
  // "全部" 是一个特殊的固定分组：永远在第一位、不能删除、不能重命名、不能拖动。
  // 它在界面上等同于所有分组提示词的并集；用户也可以把提示词直接加到它下面，
  // 这时提示词会存储在这个分组里，并同样出现在"全部"视图中。
  const DEFAULT_PROMPT_GROUP_ID = "prompt-group-default";
  const LEGACY_DEFAULT_GROUP_NAME = "默认分组";
  function getAllPromptGroupName() {
    return msg("settings_prompts_allGroup", "全部");
  }
  function isAllPromptGroup(group) {
    return !!group && group.id === DEFAULT_PROMPT_GROUP_ID;
  }
  const RANDOM_QUESTIONS_FILES = {
    zh: "config/random-questions/zh-CN.txt",
    en: "config/random-questions/en.txt"
  };
  const PICKER_CLOSE_DELAY_MS = 320;
  let _hoverCardKeyHandler = null;
  const COMMON_SEARCH_PARAM_KEYS = ["q", "query", "wd", "word", "kw", "keyword", "s", "search", "key", "k", "text", "term", "w"];
  const SITE_CATEGORIES = {
    ai: { label: "AI", siteIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso", "gemini", "chatgpt", "claude", "grok"] },
    other: { label: msg("settings_groups_categoryOther", "社媒平台"), siteIds: ["xiaohongshu", "bilibili", "zhihu", "douyin"] },
    custom: { label: msg("settings_groups_categoryCustom", "自定义"), siteIds: [] }
  };
  const AI_SITE_GROUPS = [
    { label: msg("settings_groups_aiDomestic", "国内"), siteIds: ["deepseek", "doubao", "kimi", "yuanbao", "qwen", "metaso"] },
    { label: msg("settings_groups_aiOverseas", "国外"), siteIds: ["gemini", "chatgpt", "claude", "grok"] }
  ];
  const SECTION_META = {
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

  const groupsSection = document.getElementById("groupsSection");
  const promptsSection = document.getElementById("promptsSection");
  const customSection = document.getElementById("customSection");
  const randomSection = document.getElementById("randomSection");
  const otherSection = document.getElementById("otherSection");
  const aboutSection = document.getElementById("aboutSection");
  const sectionEyebrow = document.getElementById("sectionEyebrow");
  const sectionLogoWrap = document.getElementById("sectionLogoWrap");
  const sectionTitleRow = document.getElementById("sectionTitleRow");
  const sectionTitle = document.getElementById("sectionTitle");
  const sectionSubtitle = document.getElementById("sectionSubtitle");
  const promptsHeaderActions = document.getElementById("promptsHeaderActions");
  const promptLearnLink = document.getElementById("promptLearnLink");
  const navItems = Array.from(document.querySelectorAll(".settings-nav-item"));
  const GROUP_MODE_OPTIONS = [
    { value: "compare", label: "卡片呈现" },
    { value: "tabs", label: "新开标签" }
  ];

  let groups = [];
  let promptGroups = [];
  let uiPrefs = createNormalizedUiPrefs();
  let randomQuestionsText = null;
  let defaultRandomQuestionsText = "";
  let sites = [];
  let customSites = [];
  let customFormState = createBlankCustomFormState();
  let activeSection = "groups";
  let openPickerGroupId = null;
  let activePickerCategoryKey = null;
  let pickerCloseTimerId = null;
  let activePromptGroupId = null;
  let promptEditorState = null;
  let pendingPromptGroupFocusId = null;
  let renamingPromptGroupId = null;
  let importModalState = null;
  let _promptHoverTimer = null;

  document.addEventListener("DOMContentLoaded", start);

  async function start() {
    applyDomI18n?.(document);
    const builtinSites = await loadBuiltinSites();
    const stored = await chrome.storage.local.get([
      GROUPS_STORAGE_KEY,
      PROMPTS_STORAGE_KEY,
      UI_PREFS_STORAGE_KEY,
      CUSTOM_SITES_STORAGE_KEY,
      RANDOM_QUESTIONS_STORAGE_KEY
    ]);
    customSites = createNormalizedCustomSites(stored[CUSTOM_SITES_STORAGE_KEY]);
    sites = mergeSites(builtinSites, customSites);
    syncCustomCategoryIds();
    groups = createNormalizedGroups(stored[GROUPS_STORAGE_KEY]);
    promptGroups = createNormalizedPromptGroups(stored[PROMPTS_STORAGE_KEY]);
    uiPrefs = createNormalizedUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
    defaultRandomQuestionsText = await loadDefaultRandomQuestionsText();
    const storedRaw = stored[RANDOM_QUESTIONS_STORAGE_KEY];
    // 如果存储的内容是旧版（以 # 注释开头的说明块），视为未自定义，替换为新的干净默认题库
    const isOldDefault = typeof storedRaw === "string" && storedRaw.trimStart().startsWith("#");
    randomQuestionsText = (typeof storedRaw === "string" && !isOldDefault)
      ? storedRaw
      : defaultRandomQuestionsText;
    activePromptGroupId = promptGroups[0]?.id || null;
    if (!Array.isArray(stored[GROUPS_STORAGE_KEY]) || stored[GROUPS_STORAGE_KEY].length === 0) {
      await chrome.storage.local.set({ [GROUPS_STORAGE_KEY]: groups });
    }
    if (!Array.isArray(stored[PROMPTS_STORAGE_KEY]) || stored[PROMPTS_STORAGE_KEY].length === 0) {
      await chrome.storage.local.set({ [PROMPTS_STORAGE_KEY]: promptGroups });
    }
    if (!stored[UI_PREFS_STORAGE_KEY] || typeof stored[UI_PREFS_STORAGE_KEY] !== "object") {
      await chrome.storage.local.set({ [UI_PREFS_STORAGE_KEY]: uiPrefs });
    }
    if (!Array.isArray(stored[CUSTOM_SITES_STORAGE_KEY])) {
      await chrome.storage.local.set({ [CUSTOM_SITES_STORAGE_KEY]: customSites });
    }
    bindEvents();
    const hashSection = new URLSearchParams(location.search).get("section") || location.hash.replace("#", "");
    if (hashSection && SECTION_META[hashSection]) {
      setActiveSection(hashSection);
    } else {
      renderCurrentSection();
    }
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    attachGroupDrag(groupsSection);

    navItems.forEach((item) => {
      item.addEventListener("click", () => {
        setActiveSection(item.dataset.section || "groups");
      });
    });

    document.getElementById("promptExportBtn").addEventListener("click", handleExport);
    document.getElementById("promptImportBtn").addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".md,.json";
      fileInput.addEventListener("change", handleImportFileChange);
      fileInput.click();
    });
  }

  function handleDocumentClick(event) {
    if (openPickerGroupId && !event.target.closest(".inline-add-wrap")) {
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
    activeSection = sectionKey;
    navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.section === sectionKey));
    const meta = SECTION_META[sectionKey];
    const eyebrow = meta.eyebrowKey ? msg(meta.eyebrowKey, meta.eyebrow) : (meta.eyebrow || "");
    const title = meta.titleKey ? msg(meta.titleKey, meta.title) : (meta.title || "");
    const subtitle = meta.subtitleKey ? msg(meta.subtitleKey, meta.subtitle) : (meta.subtitle || "");
    sectionEyebrow.textContent = eyebrow;
    sectionEyebrow.hidden = true;
    sectionTitle.textContent = title;
    sectionTitle.hidden = !title;
    sectionSubtitle.textContent = subtitle;
    sectionSubtitle.hidden = !subtitle;
    sectionLogoWrap.hidden = sectionKey !== "about";
    sectionTitleRow.hidden = !title && sectionKey !== "prompts";
    updateSectionVisibility();
    renderCurrentSection();
  }

  function renderCurrentSection() {
    updateSectionVisibility();
    if (activeSection === "prompts") {
      renderPromptsSection();
      return;
    }
    if (activeSection === "custom") {
      renderCustomSection();
      return;
    }
    if (activeSection === "random") {
      renderRandomSection();
      return;
    }
    if (activeSection === "other") {
      renderOtherSection();
      return;
    }
    if (activeSection === "about") {
      renderAboutSection();
      return;
    }
    renderGroupsSection();
  }

  function updateSectionVisibility() {
    const showGroups = activeSection === "groups";
    const showPrompts = activeSection === "prompts";
    const showCustom = activeSection === "custom";
    const showRandom = activeSection === "random";
    const showOther = activeSection === "other";
    const showAbout = activeSection === "about";
    groupsSection.hidden = !showGroups;
    promptsSection.hidden = !showPrompts;
    customSection.hidden = !showCustom;
    randomSection.hidden = !showRandom;
    otherSection.hidden = !showOther;
    aboutSection.hidden = !showAbout;
    groupsSection.style.display = showGroups ? "flex" : "none";
    promptsSection.style.display = showPrompts ? "flex" : "none";
    customSection.style.display = showCustom ? "flex" : "none";
    randomSection.style.display = showRandom ? "flex" : "none";
    otherSection.style.display = showOther ? "flex" : "none";
    aboutSection.style.display = showAbout ? "flex" : "none";
    promptsHeaderActions.hidden = !showPrompts;
    promptsHeaderActions.style.display = showPrompts ? "flex" : "none";
    if (promptLearnLink) {
      promptLearnLink.hidden = !showPrompts;
    }
  }

  function createNormalizedGroups(input) {
    const validSiteIds = new Set(sites.map((site) => site.id));
    const source = Array.isArray(input) && input.length > 0
      ? input
      : [
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
      siteIds: Array.isArray(group.siteIds)
        ? group.siteIds.filter((siteId, index, arr) => validSiteIds.has(siteId) && arr.indexOf(siteId) === index)
        : []
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
        // 兼容历史数据：名字叫"默认分组"但 id 不同的也视为固定分组
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
      prompts: Array.isArray(group.prompts)
        ? group.prompts.map((prompt, index) => ({
            id: String(prompt.id || `${group.id || 'prompt'}-${index}`),
            title: String(prompt.title || "未命名提示词"),
            content: String(prompt.content || "")
          }))
        : []
    }));
  }

  // "全部"分组展示时，列出所有分组的提示词并集；其它分组展示自身的提示词。
  // 返回 [{ prompt, sourceGroup }] 结构，方便卡片层拿到提示词真正所属的分组。
  function getDisplayPromptEntries(group) {
    if (!group) return [];
    if (isAllPromptGroup(group)) {
      const out = [];
      promptGroups.forEach((g) => {
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
      showHistory: source.showHistory !== false,
      showRandomButton: source.showRandomButton !== false,
      showPromptButton: source.showPromptButton !== false,
      prewarmEnabled: source.prewarmEnabled !== false,
      overlayShortcutEnabled: source.overlayShortcutEnabled !== false,
      overlayShortcut: normalizeShortcut(source.overlayShortcut)
    };
  }

  function normalizeShortcut(input) {
    const fallback = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: "Q" };
    if (!input || typeof input !== "object") return fallback;
    const key = typeof input.key === "string" && input.key.length > 0 ? input.key : fallback.key;
    return {
      ctrlKey: !!input.ctrlKey,
      shiftKey: !!input.shiftKey,
      altKey: !!input.altKey,
      metaKey: !!input.metaKey,
      key: key.length === 1 ? key.toUpperCase() : key
    };
  }

  function formatShortcut(sc) {
    if (!sc || !sc.key) return msg("common_notSet", "未设置");
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
    // 必须至少包含一个修饰键，避免和正常打字冲突
    return sc.ctrlKey || sc.altKey || sc.metaKey || (sc.shiftKey && sc.key.length > 1);
  }

  function getGroupById(groupId) {
    return groups.find((item) => item.id === groupId) || null;
  }

  function renderGroupsSection() {
    groupsSection.innerHTML = "";

    if (!groups.length) {
      const emptyState = document.createElement("section");
      emptyState.className = "settings-empty-state";
      emptyState.innerHTML = `<strong>${msg("settings_groups_emptyTitle", "还没有搜索组")}</strong><p>${msg("settings_groups_emptyDesc", "先创建一个搜索组，再配置你要调用的网站或 AI 模型。")}</p>`;
      groupsSection.appendChild(emptyState);
    } else {
      groups.forEach((group, index) => groupsSection.appendChild(createGroupCard(group, index)));
    }

    const addCard = document.createElement("section");
    addCard.className = "settings-add-card";
    addCard.innerHTML = `<button class="add-section-btn" type="button">${msg("settings_groups_addGroup", "新增搜索组")}</button>`;
    addCard.querySelector("button").addEventListener("click", async () => {
      groups.push({
        id: `group_${Date.now()}`,
        name: "新搜索组",
        enabled: true,
        mode: "compare",
        siteIds: []
      });
      markDirty();
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
        groups = groups.filter((item) => item.id !== currentGroup.id);
        if (openPickerGroupId === currentGroup.id) {
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

    const selectedSites = group.siteIds.map((siteId) => sites.find((site) => site.id === siteId)).filter(Boolean);
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
      if (openPickerGroupId === group.id) {
        closePicker();
      } else {
        openPickerGroupId = group.id;
        if (!activePickerCategoryKey || !SITE_CATEGORIES[activePickerCategoryKey]) {
          activePickerCategoryKey = Object.keys(SITE_CATEGORIES)[0] || null;
        }
      }
      renderGroupsSection();
    });
    wrap.appendChild(button);

    if (openPickerGroupId === group.id) {
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
      const isActive = activePickerCategoryKey === key;
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
          empty.innerHTML = `还没有自定义站点<br/><span class="hover-picker-empty-hint">前往左侧「自定义搜索」添加</span>`;
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
          const groupSites = marketGroup.siteIds
            .map((siteId) => categorySites.find((site) => site.id === siteId))
            .filter(Boolean);
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
        const tip = document.createElement("div");
        tip.className = "hover-picker-tip";
        tip.textContent = "社媒平台更推荐使用“新开标签”模式；卡片呈现的预览与打开体验可能不稳定。";
        submenu.appendChild(tip);

        categorySites.forEach((site) => {
          submenu.appendChild(createPickerSiteOption(group, site, key));
        });
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

  function renderPromptsSection() {
    promptsSection.innerHTML = "";
    if (!promptGroups.length) {
      promptGroups = createNormalizedPromptGroups([]);
    }
    if (!activePromptGroupId || !promptGroups.some((group) => group.id === activePromptGroupId)) {
      activePromptGroupId = promptGroups[0]?.id || null;
    }

    const activeGroup = promptGroups.find((group) => group.id === activePromptGroupId) || promptGroups[0];
    if (!activeGroup) {
      return;
    }

    const shell = document.createElement("section");
    shell.className = "prompt-settings-shell";
    shell.appendChild(createPromptGroupSidebar(activeGroup));
    shell.appendChild(createPromptContentPanel(activeGroup));
    promptsSection.appendChild(shell);

    if (promptEditorState) {
      promptsSection.appendChild(createPromptEditorModal());
    }
  }

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

  function createNormalizedCustomSites(input) {
    if (!Array.isArray(input)) {
      return [];
    }
    const seenIds = new Set();
    return input
      .map((raw) => {
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
          matchPatterns: Array.isArray(raw.matchPatterns) && raw.matchPatterns.length > 0
            ? raw.matchPatterns.map((pattern) => String(pattern))
            : deriveMatchPatterns(url),
          isCustom: true
        };
      })
      .filter(Boolean);
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
    SITE_CATEGORIES.custom.siteIds = customSites.map((site) => site.id);
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
      const priorityKey = COMMON_SEARCH_PARAM_KEYS.find((key) =>
        paramKeys.some((item) => item.toLowerCase() === key)
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
      error: msg("settings_custom_convertNoParam", "未能自动识别搜索参数，请手动在 URL 中把搜索词替换成 {query}。")
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

  function renderCustomSection() {
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
      converterInput.value = customFormState.converterInput || "";
      converterInput.addEventListener("input", (event) => {
        customFormState.converterInput = event.target.value;
        customFormState.converterError = "";
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

    if (customFormState.converterError && converterMsg) {
      converterMsg.textContent = customFormState.converterError;
      converterMsg.classList.add("is-error");
    }

    function handleConvertClick() {
      const result = convertUrlToTemplate(customFormState.converterInput);
      if (!result.ok) {
        customFormState.converterError = result.error;
        if (converterMsg) {
          converterMsg.textContent = result.error;
          converterMsg.classList.add("is-error");
          converterMsg.classList.remove("is-success");
        }
        return;
      }
      customFormState.url = result.url;
      if (!customFormState.name && result.name) {
        customFormState.name = result.name;
      }
      customFormState.formError = "";
      customFormState.converterError = "";
      renderCustomSection();
    }

    customSection.appendChild(converter);

    const form = document.createElement("section");
    form.className = "custom-search-card";
    const isEditing = customFormState.mode === "edit";
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
      nameInput.value = customFormState.name || "";
      nameInput.addEventListener("input", (event) => {
        customFormState.name = event.target.value;
      });
    }
    if (urlInput instanceof HTMLInputElement) {
      urlInput.value = customFormState.url || "";
      urlInput.addEventListener("input", (event) => {
        customFormState.url = event.target.value;
      });
    }
    if (customFormState.formError && formMsg) {
      formMsg.textContent = customFormState.formError;
      formMsg.classList.add("is-error");
    }
    if (submitBtn) {
      submitBtn.addEventListener("click", handleCustomFormSubmit);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        customFormState = createBlankCustomFormState();
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
      <span>${msg("settings_custom_listCountPrefix", "当前共 ")}${customSites.length}${msg("settings_custom_listCountSuffix", " 个自定义站点。")}</span>
    `;
    listCard.appendChild(header);

    if (!customSites.length) {
      const empty = document.createElement("div");
      empty.className = "site-selection-empty";
      empty.textContent = msg("settings_custom_listEmpty", "还没有自定义站点，上方添加后会在这里显示。");
      listCard.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "custom-sites-list";
      customSites.forEach((site) => {
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
      customFormState = {
        mode: "edit",
        editingId: site.id,
        name: site.name,
        url: site.url,
        converterInput: "",
        converterError: "",
        formError: ""
      };
      renderCustomSection();
      customSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    deleteBtn?.addEventListener("click", async () => {
      const confirmed = window.confirm(
        msg("settings_custom_deleteConfirmPrefix", "是否要删除自定义站点「") +
          site.name +
          msg("settings_custom_deleteConfirmMid", "」？\n") +
          msg("settings_custom_deleteConfirmBody", "删除后，所有搜索组中引用该站点的记录也会同步移除。")
      );
      if (!confirmed) return;
      customSites = customSites.filter((item) => item.id !== site.id);
      groups = groups.map((group) => ({
        ...group,
        siteIds: (group.siteIds || []).filter((id) => id !== site.id)
      }));
      if (customFormState.mode === "edit" && customFormState.editingId === site.id) {
        customFormState = createBlankCustomFormState();
      }
      await persistAll();
      renderCustomSection();
    });

    return row;
  }

  async function handleCustomFormSubmit() {
    const name = String(customFormState.name || "").trim();
    const url = String(customFormState.url || "").trim();

    if (!name) {
      customFormState.formError = msg("settings_custom_errorNameRequired", "请输入站点名称。");
      renderCustomSection();
      return;
    }
    if (!url) {
      customFormState.formError = msg("settings_custom_errorUrlRequired", "请输入 URL 链接。");
      renderCustomSection();
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      customFormState.formError = msg("settings_custom_errorUrlProtocol", "URL 必须以 http:// 或 https:// 开头。");
      renderCustomSection();
      return;
    }
    if (!url.includes("{query}")) {
      customFormState.formError = msg("settings_custom_errorMissingQuery", "URL 中必须包含 {query} 作为搜索词占位符。");
      renderCustomSection();
      return;
    }
    try {
      new URL(url.replace("{query}", "ai"));
    } catch (_error) {
      customFormState.formError = msg("settings_custom_errorUrlInvalid", "URL 格式不合法，请检查后重试。");
      renderCustomSection();
      return;
    }

    if (customFormState.mode === "edit" && customFormState.editingId) {
      customSites = customSites.map((site) =>
        site.id === customFormState.editingId
          ? {
              ...site,
              name,
              url,
              supportUrlQuery: true,
              matchPatterns: deriveMatchPatterns(url)
            }
          : site
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
      customSites = [...customSites, newSite];
    }

    customFormState = createBlankCustomFormState();
    await persistAll();
    renderCustomSection();
  }

  function renderOtherSection() {
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
      },
    ].forEach((item) => {
      list?.appendChild(createOtherSettingToggle(item.key, item.title, item.desc));
    });

    otherSection.appendChild(card);
    otherSection.appendChild(createShortcutCard());
    otherSection.appendChild(createSearchConfigIoCard());
  }

  async function loadDefaultRandomQuestionsText() {
    const lang = (() => {
      try {
        return (chrome?.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase();
      } catch (_e) {
        return (navigator.language || "").toLowerCase();
      }
    })();
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
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .length;
  }

  async function persistRandomQuestionsText() {
    await chrome.storage.local.set({ [RANDOM_QUESTIONS_STORAGE_KEY]: randomQuestionsText });
  }

  // 把原始文本（无序号）转换为带序号的显示文本（"1. Q\n2. Q\n…"）
  function rawToNumbered(raw) {
    if (!raw) return "";
    let idx = 0;
    return raw.split(/\r?\n/).map((line) => {
      if (!line.trim()) return "";
      idx++;
      return idx + ". " + line;
    }).join("\n");
  }

  // 把显示文本（可能带序号前缀）还原为原始文本
  function numberedToRaw(numbered) {
    return numbered.split(/\r?\n/).map((line) => {
      return line.replace(/^\d+\.\s+/, "");
    }).join("\n");
  }

  function renderRandomSection() {
    randomSection.innerHTML = "";

    // 语言检测：非中文环境切换为英文
    const isZh = (() => {
      try { return (chrome?.i18n?.getUILanguage?.() || "").toLowerCase().startsWith("zh"); } catch (_) { return true; }
    })();

    // —— 顶部：显示骰子按钮开关 ——
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
    // —— 副标题下方说明文字 ——
    const introDiv = document.createElement("div");
    introDiv.className = "random-intro-text";

    const p1 = document.createElement("p");
    p1.className = "random-hint-para";
    p1.textContent = isZh
      ? "很多时候不是不想用 AI，而是不知道问什么。随手一点骰子，一个好问题出来了，思考就开始了。"
      : "Often the problem isn't not wanting to use AI — it's not knowing what to ask. One tap of the dice, a great question surfaces. Thinking begins.";

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

    // —— 下方：问题库编辑区 ——
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

    // 初始显示：把存储的原始文本转成带序号的格式
    const initialRaw = typeof randomQuestionsText === "string" ? randomQuestionsText : defaultRandomQuestionsText;
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
        randomQuestionsText = raw;
        await persistRandomQuestionsText();
        showSaved();
      }, 400);
    };

    // Enter 键：拦截默认换行，直接插入 "N. " 开头的新行，序号即时可见
    textarea.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      // 找光标前最后一个带序号行，下一行序号 = 该序号 + 1
      const linesBeforeCursor = value.substring(0, start).split("\n");
      let lastNum = 0;
      for (const line of linesBeforeCursor) {
        const m = line.match(/^(\d+)\.\s/);
        if (m) lastNum = parseInt(m[1], 10);
      }
      // 光标所在行本身如果是带序号行，也算进去
      const curLine = linesBeforeCursor[linesBeforeCursor.length - 1] || "";
      const curMatch = curLine.match(/^(\d+)\.\s/);
      if (curMatch) lastNum = Math.max(lastNum, parseInt(curMatch[1], 10));

      const nextNum = lastNum + 1;
      const insertion = "\n" + nextNum + ". ";
      const newValue = value.substring(0, start) + insertion + value.substring(end);
      textarea.value = newValue;

      const newPos = start + insertion.length;
      textarea.setSelectionRange(newPos, newPos);

      const raw = numberedToRaw(newValue);
      updateCount(raw);
      scheduleSave(raw);
    });

    // 普通输入时只更新计数和排程保存（不重新编号，避免光标跳动）
    textarea.addEventListener("input", () => {
      const raw = numberedToRaw(textarea.value);
      updateCount(raw);
      scheduleSave(raw);
    });

    // 失焦时重新编号，并立即保存（防止快速离开页面时丢失）
    textarea.addEventListener("blur", async () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      const raw = reformat();
      randomQuestionsText = raw;
      await persistRandomQuestionsText();
    });

    // 粘贴后立即重新编号
    textarea.addEventListener("paste", () => {
      requestAnimationFrame(() => {
        const raw = reformat();
        scheduleSave(raw);
      });
    });

    randomSection.appendChild(poolCard);

    // —— 底部：使用说明 + AI 协同制定题库提示词 ——
    const COPYPROMPT = isZh
      ? `我想定制一套专属 AI 提问题库，用于每天随机抽取问题，并直接发送给 AI 进行分析、搜索、拆解或生成建议。

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
每个问题单独占一行`
      : `I want to build a custom AI question bank — a personal collection of prompts for daily use, sent directly to AI for analysis, research, breakdown, or generating recommendations.

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
    const hint3Text = isZh
      ? "你也可以让 AI 帮你一起完成，协同制定一套属于自己的专属题库。参考下方提示词直接发给任意 AI："
      : "You can also let AI help you build it. Send the prompt below to any AI to get started:";
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

  // ── 搜索配置 导入 / 导出 ──────────────────────────────────────────────────────

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
      exportedAt: new Date().toISOString(),
      searchGroups: groups,
      customSites: customSites
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Qshot搜索配置-${new Date().toISOString().slice(0, 10)}.json`;
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

    if (importedGroups.length) {
      groups = createNormalizedGroups(importedGroups);
    }
    if (importedCustomSites.length) {
      customSites = createNormalizedCustomSites(importedCustomSites);
    }

    await persistAll();
    renderOtherSection();

    if (activeSection === "groups") {
      renderGroupsSection();
    }
    if (activeSection === "custom") {
      renderCustomSection();
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
      chrome.tabs.create({ url }).catch(() => {});
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
        display.textContent = formatShortcut(uiPrefs.overlayShortcut);
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

      uiPrefs.overlayShortcut = candidate;
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
      uiPrefs.overlayShortcut = normalizeShortcut(null);
      await persistAll();
      renderDisplay();
    });

    renderDisplay();
    return row;
  }

  function renderAboutSection() {
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

  function createOtherSettingToggle(key, title, desc, tip) {
    const row = document.createElement("article");
    row.className = "other-setting-row" + (tip ? " other-setting-row--with-tip" : "");

    const isOn = uiPrefs[key] !== false;
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
      uiPrefs[key] = !(uiPrefs[key] !== false);
      await persistAll();
      if (activeSection === "random") {
        renderRandomSection();
      } else {
        renderOtherSection();
      }
    });

    return row;
  }

  function createPromptGroupSidebar(activeGroup) {
    const aside = document.createElement("aside");
    aside.className = "prompt-groups-sidebar";

    const list = document.createElement("div");
    list.className = "prompt-groups-list";
    promptGroups.forEach((group) => {
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
      promptGroups.push(newGroup);
      activePromptGroupId = newGroup.id;
      renamingPromptGroupId = newGroup.id;
      pendingPromptGroupFocusId = newGroup.id;
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
    const isRenaming = !isAll && renamingPromptGroupId === group.id;
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
        if (renamingPromptGroupId === group.id) {
          renamingPromptGroupId = null;
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
          if (renamingPromptGroupId === group.id) {
            renamingPromptGroupId = null;
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
      if (pendingPromptGroupFocusId === group.id) {
        pendingPromptGroupFocusId = null;
      }
      return row;
    }

    const nameEl = document.createElement("span");
    nameEl.className = "prompt-group-nav-name";
    nameEl.textContent = displayName || msg("overlay_unnamedPromptGroup", "未命名分组");
    row.appendChild(nameEl);

    row.addEventListener("click", (ev) => {
      if (ev.target.closest(".prompt-group-nav-action")) return;
      activePromptGroupId = group.id;
      renderPromptsSection();
    });

    if (isActive && !isAll) {
      const actions = document.createElement("div");
      actions.className = "prompt-group-nav-actions";

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "prompt-group-nav-action prompt-group-nav-rename";
      renameBtn.setAttribute("aria-label", "重命名分组");
      renameBtn.title = "重命名";
      renameBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      renameBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        renamingPromptGroupId = group.id;
        renderPromptsSection();
      });
      actions.appendChild(renameBtn);

      if (!isLocked) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "prompt-group-nav-action prompt-group-nav-delete";
        deleteBtn.setAttribute("aria-label", "删除分组");
        deleteBtn.title = "删除分组";
        deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
        deleteBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const shouldDelete = window.confirm("是否要删除该提示词分组？");
          if (!shouldDelete) return;
          promptGroups = promptGroups.filter((g) => g.id !== group.id);
          if (!promptGroups.length) {
            promptGroups = createNormalizedPromptGroups([]);
          }
          activePromptGroupId = promptGroups[0]?.id || null;
          await persistAll();
          renderPromptsSection();
        });
        actions.appendChild(deleteBtn);
      }

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "prompt-group-nav-action prompt-group-nav-drag";
      dragHandle.setAttribute("aria-label", "拖动排序");
      dragHandle.title = "拖动排序";
      dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>`;
      actions.appendChild(dragHandle);

      row.appendChild(actions);
    }

    return row;
  }

  function attachPromptGroupDrag(container) {
    container.addEventListener("pointerdown", onPointerDown);

    function onPointerDown(e) {
      const handle = e.target.closest(".prompt-group-nav-drag");
      if (!handle) return;
      const item = handle.closest(".prompt-group-nav-item");
      if (!item) return;
      // "全部"分组永远锁定在第一位，不允许拖动
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

        // "全部"分组永远第一位：不允许把其它分组拖到它前面
        if (newInsertBefore && newInsertBefore.dataset && newInsertBefore.dataset.groupId === DEFAULT_PROMPT_GROUP_ID) {
          newInsertBefore = newInsertBefore.nextElementSibling;
        }

        if (newInsertBefore !== lastInsertBefore) {
          const allItems = Array.from(container.querySelectorAll(".prompt-group-nav-item"));
          const firstPositions = new Map();
          allItems.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));

          if (newInsertBefore) {
            container.insertBefore(item, newInsertBefore);
          } else {
            container.appendChild(item);
          }
          lastInsertBefore = newInsertBefore;

          allItems
            .filter((el) => el !== item)
            .forEach((el) => {
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
          const reordered = newGroupIds.map((id) => promptGroups.find((g) => g.id === id)).filter(Boolean);
          if (reordered.length === promptGroups.length) {
            promptGroups = reordered;
            await persistAll();
            renderPromptsSection();
          }
        }, 160);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }
  }

  function createPromptContentPanel(activeGroup) {
    const panel = document.createElement("section");
    panel.className = "prompt-content-panel";

    const isAll = isAllPromptGroup(activeGroup);
    const entries = getDisplayPromptEntries(activeGroup);
    const displayName = isAll ? getAllPromptGroupName() : (activeGroup.name || "未命名分组");

    const header = document.createElement("div");
    header.className = "prompt-content-header";
    header.innerHTML = `
      <div>
        <div class="prompt-content-title">${escapeHtml(displayName)}</div>
        <div class="prompt-content-subtitle">当前分类下共 ${entries.length} 条提示词</div>
      </div>
    `;
    panel.appendChild(header);

    const list = document.createElement("div");
    list.className = "prompt-cards-list";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "site-selection-empty";
      empty.textContent = isAll
        ? "还没有任何提示词，点击下方按钮添加。"
        : "当前分组还没有提示词，点击下方按钮添加。";
      list.appendChild(empty);
    } else {
      entries.forEach(({ prompt, sourceGroup }) => {
        list.appendChild(createPromptCard(sourceGroup, prompt, { disableDrag: isAll }));
      });
      // "全部"是聚合视图，跨分组排序语义不明确，因此仅允许在具体分组里拖动
      if (!isAll) {
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
      promptEditorState = {
        mode: "create",
        // 在"全部"视图下新建时，默认写入"全部"分组；用户仍可在弹窗里改为其它分组。
        groupId: isAll ? DEFAULT_PROMPT_GROUP_ID : activeGroup.id,
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

    // 铅笔编辑按钮
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "prompt-icon-btn prompt-edit-icon-btn";
    editBtn.setAttribute("aria-label", "编辑");
    editBtn.title = "编辑";
    editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener("click", () => {
      promptEditorState = {
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
    previewBtn.setAttribute("aria-label", "预览");
    previewBtn.title = "预览内容";
    previewBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    let hoverTimer = null;
    previewBtn.addEventListener("mouseenter", () => {
      hoverTimer = setTimeout(() => {
        showPromptHoverCard(prompt, group, previewBtn);
      }, 200);
    });
    previewBtn.addEventListener("mouseleave", () => {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    // 拖拽手柄
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "prompt-icon-btn prompt-card-drag-handle";
    dragHandle.setAttribute("aria-label", "拖动排序");
    dragHandle.title = "拖动排序";
    dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>`;

    const titleEl = document.createElement("div");
    titleEl.className = "prompt-card-title";
    titleEl.textContent = prompt.title || "未命名提示词";

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

  function showPromptHoverCard(prompt, group, anchorBtn) {
    const existing = document.querySelector(".prompt-hover-card");
    if (existing) existing.remove();
    document.removeEventListener("keydown", _hoverCardKeyHandler);

    const card = document.createElement("div");
    card.className = "prompt-hover-card";

    function closeCard() {
      card.remove();
      document.removeEventListener("keydown", _hoverCardKeyHandler);
    }

    _hoverCardKeyHandler = (ev) => {
      if (ev.key === "Escape") closeCard();
    };

    const header = document.createElement("div");
    header.className = "prompt-hover-card-header";

    const headerActions = document.createElement("div");
    headerActions.className = "prompt-hover-card-header-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "prompt-hover-card-copy-btn";
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(prompt.content || "").then(() => {
        copyBtn.textContent = "✓ 已复制";
        copyBtn.classList.add("is-copied");
        setTimeout(() => {
          copyBtn.textContent = "复制";
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
        copyBtn.textContent = "✓ 已复制";
        setTimeout(() => { copyBtn.textContent = "复制"; }, 1800);
      });
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "prompt-hover-card-edit-btn";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => {
      closeCard();
      promptEditorState = {
        mode: "edit",
        groupId: group.id,
        promptId: prompt.id,
        title: prompt.title || "",
        content: prompt.content || ""
      };
      renderPromptsSection();
    });

    headerActions.appendChild(copyBtn);
    headerActions.appendChild(editBtn);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "prompt-hover-card-close-btn";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener("click", closeCard);

    header.appendChild(headerActions);
    header.appendChild(closeBtn);

    // 提示词标题行
    const titleRow = document.createElement("div");
    titleRow.className = "prompt-hover-card-title";
    titleRow.textContent = prompt.title || "未命名提示词";

    // 提示词内容
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
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    };
    card.addEventListener("mouseenter", cancelLeave);
    card.addEventListener("mouseleave", startLeave);
    anchorBtn.addEventListener("mouseleave", startLeave);
    anchorBtn.addEventListener("mouseenter", cancelLeave);

    setTimeout(() => document.addEventListener("keydown", _hoverCardKeyHandler), 0);
  }

  function createPromptEditorModal() {
    if (!promptEditorState) {
      return document.createElement("div");
    }

    const editorState = promptEditorState;
    const editorGroup = promptGroups.find((group) => group.id === editorState.groupId) || promptGroups[0];
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
          ${promptGroups.map((group) => `<option value="${escapeHtml(group.id)}" ${group.id === editorGroup.id ? "selected" : ""}>${escapeHtml(isAllPromptGroup(group) ? getAllPromptGroupName() : group.name)}</option>`).join("")}
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
      promptGroups.push(newGroup);
      const opt = document.createElement("option");
      opt.value = newGroup.id;
      opt.textContent = name;
      const newGroupOpt = groupSelect ? groupSelect.querySelector('option[value="__new_group__"]') : null;
      if (groupSelect) groupSelect.insertBefore(opt, newGroupOpt);
      if (groupSelect) groupSelect.value = newGroup.id;
      promptEditorState.groupId = newGroup.id;
      hideNewGroupRow();
    }

    if (titleInput) {
      titleInput.addEventListener("input", (event) => {
        const nextValue = event.target instanceof HTMLInputElement ? event.target.value : "";
        promptEditorState.title = nextValue;
      });
    }
    if (groupSelect) {
      groupSelect.addEventListener("change", (event) => {
        const nextValue = event.target instanceof HTMLSelectElement ? event.target.value : editorState.groupId;
        if (nextValue === "__new_group__") {
          showNewGroupRow();
        } else {
          hideNewGroupRow();
          promptEditorState.groupId = nextValue;
        }
      });
    }
    if (newGroupConfirmBtn) {
      newGroupConfirmBtn.addEventListener("click", confirmNewGroup);
    }
    if (newGroupInput) {
      newGroupInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); confirmNewGroup(); }
        if (ev.key === "Escape") {
          hideNewGroupRow();
          if (groupSelect) groupSelect.value = promptEditorState.groupId || (promptGroups[0] ? promptGroups[0].id : "");
        }
      });
    }
    if (contentInput) {
      contentInput.addEventListener("input", (event) => {
        const nextValue = event.target instanceof HTMLTextAreaElement ? event.target.value : "";
        promptEditorState.content = nextValue;
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        promptEditorState = null;
        renderPromptsSection();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const targetGroup = promptGroups.find((group) => group.id === promptEditorState.groupId);
        if (!targetGroup) {
          return;
        }

        if (promptEditorState.mode === "edit") {
          promptGroups.forEach((group) => {
            group.prompts = group.prompts.filter((prompt) => prompt.id !== promptEditorState.promptId);
          });
        }

        targetGroup.prompts.push({
          id: promptEditorState.promptId || `prompt-${Date.now()}`,
          title: promptEditorState.title || msg("overlay_unnamedPrompt", "未命名提示词"),
          content: promptEditorState.content || ""
        });
        activePromptGroupId = targetGroup.id;
        promptEditorState = null;
        await persistAll();
        renderPromptsSection();
      });
    }

    const deleteBtn = modal.querySelector(".prompt-editor-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        const shouldDelete = window.confirm(msg("settings_prompts_deletePromptConfirm", "是否要删除该提示词？"));
        if (!shouldDelete) {
          return;
        }
        promptGroups.forEach((group) => {
          group.prompts = group.prompts.filter((prompt) => prompt.id !== promptEditorState.promptId);
        });
        promptEditorState = null;
        await persistAll();
        renderPromptsSection();
      });
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        promptEditorState = null;
        renderPromptsSection();
      }
    });

    overlay.appendChild(modal);
    return overlay;
  }

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

      const lockedGroupId = groups[0]?.id;
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
          const firstPositions = new Map();
          allCards.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));

          container.insertBefore(card, newInsertBefore);
          lastInsertBefore = newInsertBefore;

          allCards
            .filter((el) => el !== card)
            .forEach((el) => {
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
          const reordered = newGroupIds.map((id) => groups.find((g) => g.id === id)).filter(Boolean);
          if (reordered.length === groups.length) {
            groups = reordered;
            persistAll();
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
          const firstPositions = new Map();
          allCards.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));

          listEl.insertBefore(card, newInsertBefore);
          lastInsertBefore = newInsertBefore;

          allCards
            .filter((el) => el !== card)
            .forEach((el) => {
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
          if (
            cloneCenterY < midY - r.height * 0.4 ||
            (Math.abs(cloneCenterY - midY) <= r.height * 0.6 && cloneCenterX < midX)
          ) {
            newInsertBefore = other;
            break;
          }
        }

        if (newInsertBefore !== lastInsertBefore) {
          const allChips = Array.from(chipsWrap.querySelectorAll(".selected-chip"));
          const firstPositions = new Map();
          allChips.forEach((el) => firstPositions.set(el, el.getBoundingClientRect()));

          chipsWrap.insertBefore(chip, newInsertBefore);
          lastInsertBefore = newInsertBefore;

          allChips
            .filter((el) => el !== chip)
            .forEach((el) => {
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


  function setActivePickerCategory(categoryKey) {
    if (activePickerCategoryKey === categoryKey) {
      return;
    }
    activePickerCategoryKey = categoryKey;
    renderGroupsSection();
  }

  function clearPickerCloseTimer() {
    if (pickerCloseTimerId) {
      window.clearTimeout(pickerCloseTimerId);
      pickerCloseTimerId = null;
    }
  }

  function schedulePickerClose() {
    clearPickerCloseTimer();
    pickerCloseTimerId = window.setTimeout(() => {
      closePicker();
      renderGroupsSection();
    }, PICKER_CLOSE_DELAY_MS);
  }

  function closePicker() {
    clearPickerCloseTimer();
    openPickerGroupId = null;
    activePickerCategoryKey = null;
  }

  function getCategorySites(categoryKey) {
    const category = SITE_CATEGORIES[categoryKey];
    if (!category) return [];
    return category.siteIds.map((siteId) => sites.find((site) => site.id === siteId)).filter(Boolean);
  }

  function markDirty() {}

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
      openPickerGroupId = currentGroup.id;
      activePickerCategoryKey = categoryKey;
      clearPickerCloseTimer();
      renderGroupsSection();
    });
    return label;
  }

  async function persistAll() {
    customSites = createNormalizedCustomSites(customSites);
    const builtinSites = sites.filter((site) => !site.isCustom);
    sites = mergeSites(builtinSites, customSites);
    syncCustomCategoryIds();
    groups = createNormalizedGroups(groups);
    promptGroups = createNormalizedPromptGroups(promptGroups);
    uiPrefs = createNormalizedUiPrefs(uiPrefs);
    await chrome.storage.local.set({
      [GROUPS_STORAGE_KEY]: groups,
      [PROMPTS_STORAGE_KEY]: promptGroups,
      [UI_PREFS_STORAGE_KEY]: uiPrefs,
      [CUSTOM_SITES_STORAGE_KEY]: customSites
    });
  }

  async function loadBuiltinSites() {
    const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
    const payload = await response.json();
    return (payload.sites || []).filter((site) => site.enabled !== false);
  }

  // ── Import / Export ────────────────────────────────────────────────────────

  function handleExport() {
    const lines = [];
    promptGroups.forEach((group, gi) => {
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
    a.download = `Qshow提示词-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 将提示词内容里的 Markdown 标题（# ~ ######）转成加粗，
  // 避免与导出文件中 # 分组、## 提示词标题 的结构符号冲突。
  // 代码围栏内的内容原样保留，列表/段落/序号结构不受影响。
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
    // Split on lines that start with exactly one # (not ##)
    const groupChunks = text.split(/\n(?=# (?!#))/);
    for (const chunk of groupChunks) {
      const chunkLines = chunk.split("\n");
      const firstLine = chunkLines[0] || "";
      if (!firstLine.startsWith("# ") || firstLine.startsWith("## ")) continue;
      const groupName = firstLine.slice(2).trim();
      if (!groupName) continue;

      const prompts = [];
      const rest = chunkLines.slice(1).join("\n");
      // Split on lines that start with ##
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
    const existingNames = new Set(promptGroups.map((g) => g.name));
    importModalState = {
      groups: importedGroups.map((group) => {
        const prompts = group.prompts.map((p) => ({
          title: String(p.title || "").trim() || "未命名提示词",
          content: String(p.content || "")
        }));
        let name = group.name.trim();
        // 兼容旧版导出：把"默认分组"视为新的"全部"分组
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
    if (!importModalState) return;

    const totalPrompts = importModalState.groups.reduce((s, g) => s + g.prompts.length, 0);
    const selectedCount = importModalState.groups.reduce(
      (s, g) => s + g.promptSelections.filter(Boolean).length, 0
    );

    const overlay = document.createElement("div");
    overlay.id = "promptImportModal";
    overlay.className = "import-modal-overlay";
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeImportModal(); });

    const dialog = document.createElement("div");
    dialog.className = "import-modal-dialog";

    // Header
    const header = document.createElement("div");
    header.className = "import-modal-header";
    const headerText = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "import-modal-title";
    titleEl.textContent = "导入提示词";
    const subtitleEl = document.createElement("div");
    subtitleEl.className = "import-modal-subtitle";
    subtitleEl.textContent = `共 ${importModalState.groups.length} 个分组，${totalPrompts} 条提示词 · 已选 ${selectedCount} 条`;
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

    // Body
    const body = document.createElement("div");
    body.className = "import-modal-body";

    importModalState.groups.forEach((group, gi) => {
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
        importModalState.groups[gi].promptSelections = importModalState.groups[gi].prompts.map(() => groupCheck.checked);
        renderImportModal();
      });

      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "import-expand-btn";
      expandBtn.setAttribute("aria-label", group.expanded ? "收起" : "展开");
      expandBtn.innerHTML = group.expanded
        ? `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      expandBtn.addEventListener("click", () => {
        importModalState.groups[gi].expanded = !importModalState.groups[gi].expanded;
        renderImportModal();
      });

      const groupNameEl = document.createElement("span");
      groupNameEl.className = "import-group-name";
      groupNameEl.textContent = group.name;
      groupNameEl.addEventListener("click", () => {
        importModalState.groups[gi].expanded = !importModalState.groups[gi].expanded;
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
            importModalState.groups[gi].conflictStrategy = strategy;
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
            importModalState.groups[gi].promptSelections[pi] = promptCheck.checked;
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

    // Footer
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
    importModalState = null;
  }

  async function doImport() {
    if (!importModalState) return;
    const existingGroupMap = new Map(promptGroups.map((g) => [g.name, g]));

    importModalState.groups.forEach((group) => {
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
          while (promptGroups.some((g) => g.name === name)) {
            name = `${group.name} (${suffix++})`;
          }
        }
        promptGroups.push({
          id: `prompt-group-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          prompts: newPrompts
        });
      }
    });

    await persistAll();
    closeImportModal();
    activePromptGroupId = promptGroups[0]?.id || null;
    renderPromptsSection();
  }

  // ── End Import / Export ────────────────────────────────────────────────────

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
