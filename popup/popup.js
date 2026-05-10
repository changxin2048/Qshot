(() => {
  // src/shared/storage-keys.js
  var SEARCH_GROUPS_STORAGE_KEY = "searchGroups";
  var PROMPT_GROUPS_STORAGE_KEY = "promptGroups";
  var UI_PREFS_STORAGE_KEY = "uiPrefs";
  var CUSTOM_SITES_STORAGE_KEY = "customSites";
  var RANDOM_QUESTIONS_STORAGE_KEY = "randomQuestionsText";
  var SEARCH_HISTORY_STORAGE_KEY = "searchHistory";
  var DEFAULT_PROMPT_GROUP_ID = "prompt-group-default";

  // src/popup/state.js
  var state = {
    groups: [],
    promptGroups: [],
    allSites: [],
    historyEntries: [],
    uiPrefs: createNormalizedUiPrefs(),
    activePromptGroupId: null,
    isPromptPickerOpen: false,
    popupPreviewMgr: null,
    composerResizeObserver: null,
    // DOM refs — populated once in main.js after DOM ready.
    dom: {
      queryInput: null,
      composer: null,
      groupsContainer: null,
      historyList: null,
      historySection: null,
      openSettingsBtn: null,
      randomPromptBtn: null,
      promptEntryBtn: null,
      composerActionsRow: null,
      promptPicker: null
    },
    // Callbacks registered by main.js so panels can trigger cross-cutting work
    // without creating circular imports.
    syncComposerLayout: () => {
    },
    updatePromptPickerLayoutState: () => {
    }
  };
  function createNormalizedUiPrefs(input) {
    const src = input && typeof input === "object" ? input : {};
    return {
      showHistory: src.showHistory === true,
      showRandomButton: src.showRandomButton !== false,
      showPromptButton: src.showPromptButton !== false,
      prewarmEnabled: src.prewarmEnabled !== false
    };
  }
  function normalizeSiteHomeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    let next = raw.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => sep === "?" ? "?" : "");
    next = next.replace(/\?&/, "?");
    next = next.replace(/[?&]$/, "");
    next = next.replace(/\{query\}/g, "");
    if (!/^https?:\/\//i.test(next)) return "";
    return next;
  }
  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function formatHistoryDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const lang = window.__QSHOT_I18N__?.getUiLanguage?.() || navigator.language || "zh-CN";
    return date.toLocaleDateString(lang, { year: "numeric", month: "numeric", day: "numeric" });
  }
  async function loadGroups() {
    const stored = await chrome.storage.local.get([SEARCH_GROUPS_STORAGE_KEY]);
    return Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) ? stored[SEARCH_GROUPS_STORAGE_KEY] : [];
  }
  async function loadPromptGroups() {
    const stored = await chrome.storage.local.get([PROMPT_GROUPS_STORAGE_KEY]);
    const source = Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY]) ? stored[PROMPT_GROUPS_STORAGE_KEY] : [];
    return source.map((group, gi) => ({
      id: String(group.id || `prompt-group-${gi}`),
      name: String(group.name || "未命名分组"),
      prompts: Array.isArray(group.prompts) ? group.prompts.map((p, pi) => ({
        id: String(p.id || `prompt-${gi}-${pi}`),
        title: String(p.title || "未命名提示词"),
        content: String(p.content || "")
      })) : []
    }));
  }
  async function loadHistory() {
    const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
    return Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY].slice(0, 4) : [];
  }
  async function loadUiPrefs() {
    const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
    return createNormalizedUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
  }
  async function refreshAllSites() {
    try {
      const [builtinResp, stored] = await Promise.all([
        fetch(chrome.runtime.getURL("config/siteHandlers.json")),
        chrome.storage.local.get([CUSTOM_SITES_STORAGE_KEY])
      ]);
      const payload = await builtinResp.json();
      const builtin = (payload.sites || []).filter((s) => s.enabled !== false);
      const custom = Array.isArray(stored[CUSTOM_SITES_STORAGE_KEY]) ? stored[CUSTOM_SITES_STORAGE_KEY] : [];
      const knownIds = new Set(builtin.map((s) => s.id));
      const merged = [...builtin];
      custom.forEach((s) => {
        if (s && !knownIds.has(s.id)) {
          merged.push(s);
          knownIds.add(s.id);
        }
      });
      state.allSites = merged;
    } catch (_e) {
      state.allSites = [];
    }
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

  // src/popup/prompt-edit-modal.js
  function openPopupPromptEditModal(prompt, groupId) {
    closePromptPicker();
    const targetGroup = state.promptGroups.find((g) => g.id === groupId) || state.promptGroups[0];
    const targetPrompt = targetGroup?.prompts.find((p) => p.id === prompt.id);
    if (!targetPrompt) return;
    const overlay = document.createElement("div");
    overlay.className = "prompt-edit-modal-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:flex-start;justify-content:center;padding:16px;z-index:10000;overflow-y:auto;";
    const modal = document.createElement("div");
    modal.style.cssText = "width:100%;margin:auto;background:#fff;border-radius:6px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 40px rgba(0,0,0,.16);";
    modal.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#111;margin-bottom:2px;">编辑提示词</div>
    <div>
      <label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">名称</label>
      <input class="pep-title" type="text" value="${escapeHtml(targetPrompt.title || "")}" style="width:100%;height:34px;padding:0 10px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;" />
    </div>
    <div>
      <label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">分类</label>
      <select class="pep-group" style="width:100%;height:34px;padding:0 8px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;">
        ${state.promptGroups.map(
      (g) => `<option value="${escapeHtml(g.id)}"${g.id === groupId ? " selected" : ""}>${escapeHtml(getPromptGroupDisplayName(g))}</option>`
    ).join("")}
        <option value="__new__">＋ 新建分组…</option>
      </select>
      <input class="pep-newgroup" type="text" placeholder="输入新分组名称" style="display:none;width:100%;height:34px;padding:0 10px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;margin-top:6px;" />
    </div>
    <div>
      <label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">提示词内容</label>
      <textarea class="pep-content" style="width:100%;min-height:120px;padding:8px 10px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;resize:vertical;line-height:1.6;">${escapeHtml(targetPrompt.content || "")}</textarea>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
      <button class="pep-delete" style="height:32px;padding:0 12px;border:none;border-radius:4px;background:#fee2e2;color:#dc2626;font:inherit;font-size:13px;font-weight:500;cursor:pointer;">删除</button>
      <div style="display:flex;gap:6px;">
        <button class="pep-cancel" style="height:32px;padding:0 12px;border:1px solid #ddd;border-radius:4px;background:#fff;color:#444;font:inherit;font-size:13px;font-weight:500;cursor:pointer;">取消</button>
        <button class="pep-save" style="height:32px;padding:0 14px;border:none;border-radius:4px;background:#111;color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer;">保存</button>
      </div>
    </div>
  `;
    const titleInput = modal.querySelector(".pep-title");
    const groupSelect = modal.querySelector(".pep-group");
    const newGroupInput = modal.querySelector(".pep-newgroup");
    const contentInput = modal.querySelector(".pep-content");
    groupSelect?.addEventListener("change", () => {
      const isNew = groupSelect instanceof HTMLSelectElement && groupSelect.value === "__new__";
      if (newGroupInput instanceof HTMLInputElement) {
        newGroupInput.style.display = isNew ? "block" : "none";
        if (isNew) requestAnimationFrame(() => newGroupInput.focus());
      }
    });
    const prevMinHeight = document.body.style.minHeight;
    const prevBodyBg = document.body.style.background;
    const popupShell = document.querySelector(".popup-shell");
    const prevShellBg = popupShell ? popupShell.style.background : "";
    const popupActions = document.querySelector(".popup-actions");
    const prevActionsDisplay = popupActions ? popupActions.style.display : "";
    function closeModal() {
      overlay.remove();
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.minHeight = prevMinHeight;
      document.body.style.background = prevBodyBg;
      if (popupShell) popupShell.style.background = prevShellBg;
      if (popupActions) popupActions.style.display = prevActionsDisplay;
    }
    modal.querySelector(".pep-cancel").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    modal.querySelector(".pep-save").addEventListener("click", async () => {
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
      await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: state.promptGroups });
      closeModal();
    });
    modal.querySelector(".pep-delete").addEventListener("click", async () => {
      if (!window.confirm("确定要删除这条提示词吗？")) return;
      state.promptGroups.forEach((g) => {
        g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id);
      });
      await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: state.promptGroups });
      closeModal();
    });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "visible";
    document.body.style.overflow = "visible";
    document.body.style.minHeight = "440px";
    document.body.style.background = "#ffffff";
    if (popupShell) popupShell.style.background = "#ffffff";
    if (popupActions) popupActions.style.display = "none";
    if (titleInput instanceof HTMLInputElement) requestAnimationFrame(() => titleInput.focus());
  }

  // src/popup/sections.js
  var RANDOM_QUESTIONS_FILES = {
    zh: "config/random-questions/zh-CN.txt",
    en: "config/random-questions/en.txt"
  };
  var randomQuestionsPromise = null;
  var lastRandomQuestionIndex = -1;
  function msg(key, fallback = "") {
    return window.__QSHOT_I18N__?.t?.(key) || fallback;
  }
  function invalidateRandomQuestionsCache() {
    randomQuestionsPromise = null;
    lastRandomQuestionIndex = -1;
  }
  function parseRandomQuestionsText(text) {
    if (typeof text !== "string") return [];
    return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  }
  async function fetchDefaultRandomQuestionsText() {
    const getUiLanguage = window.__QSHOT_I18N__?.getUiLanguage;
    const lang = (getUiLanguage?.() || "").toLowerCase();
    const path = lang.startsWith("zh") ? RANDOM_QUESTIONS_FILES.zh : RANDOM_QUESTIONS_FILES.en;
    try {
      const res = await fetch(chrome.runtime.getURL(path));
      return res.ok ? await res.text() : "";
    } catch (_e) {
      return "";
    }
  }
  function loadRandomQuestions() {
    if (randomQuestionsPromise) return randomQuestionsPromise;
    randomQuestionsPromise = (async () => {
      const getUiLanguage = window.__QSHOT_I18N__?.getUiLanguage;
      const uiLang = (getUiLanguage?.() || "").toLowerCase();
      const currentDefaultText = await fetchDefaultRandomQuestionsText();
      const otherPath = uiLang.startsWith("zh") ? RANDOM_QUESTIONS_FILES.en : RANDOM_QUESTIONS_FILES.zh;
      let otherDefaultText = "";
      try {
        const res = await fetch(chrome.runtime.getURL(otherPath));
        otherDefaultText = res.ok ? await res.text() : "";
      } catch (_e) {
        otherDefaultText = "";
      }
      try {
        const stored = await chrome.storage.local.get([RANDOM_QUESTIONS_STORAGE_KEY]);
        const raw = stored[RANDOM_QUESTIONS_STORAGE_KEY];
        const isOldDefault = typeof raw === "string" && raw.trimStart().startsWith("#");
        const hasCustomText = typeof raw === "string" && raw.trim().length > 0;
        const isOtherLangDefault = hasCustomText && raw.trim() === otherDefaultText.trim();
        if (hasCustomText && !isOldDefault && !isOtherLangDefault) {
          return parseRandomQuestionsText(raw);
        }
      } catch (_e) {
      }
      return parseRandomQuestionsText(currentDefaultText);
    })();
    return randomQuestionsPromise;
  }
  async function fillRandomQuestion() {
    const questions = await loadRandomQuestions();
    if (!questions.length) return;
    const { queryInput } = state.dom;
    if (!queryInput) return;
    let idx = Math.floor(Math.random() * questions.length);
    if (questions.length > 1 && idx === lastRandomQuestionIndex) {
      idx = (idx + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length;
    }
    lastRandomQuestionIndex = idx;
    queryInput.value = questions[idx];
    state.syncComposerLayout();
    queryInput.focus();
  }
  var _groupTooltipEl = null;
  var _groupTooltipTimer = null;
  var _groupTooltipHideTimer = null;
  function renderGroups() {
    const { groupsContainer } = state.dom;
    if (!groupsContainer) return;
    groupsContainer.innerHTML = "";
    groupsContainer.hidden = state.groups.length === 0;
    state.groups.forEach((group) => {
      const button = document.createElement("button");
      button.className = "popup-group-btn";
      button.type = "button";
      button.innerHTML = `<span class="popup-group-name">${escapeHtml(group.name)}</span>`;
      const groupSites = getGroupSites(group);
      if (groupSites.length) {
        button.addEventListener("mouseenter", () => showGroupTooltip(button, groupSites));
        button.addEventListener("mouseleave", () => scheduleHideGroupTooltip());
      }
      button.addEventListener("click", async () => {
        hideGroupTooltip();
        await runGroup(group);
      });
      groupsContainer.appendChild(button);
    });
  }
  function getOrCreateGroupTooltip() {
    if (!_groupTooltipEl) {
      _groupTooltipEl = document.createElement("div");
      _groupTooltipEl.className = "group-tooltip";
      _groupTooltipEl.addEventListener("mouseenter", () => {
        if (_groupTooltipHideTimer) {
          clearTimeout(_groupTooltipHideTimer);
          _groupTooltipHideTimer = null;
        }
      });
      _groupTooltipEl.addEventListener("mouseleave", () => scheduleHideGroupTooltip());
      document.body.appendChild(_groupTooltipEl);
    }
    return _groupTooltipEl;
  }
  function getGroupSites(group) {
    return (group.siteIds || []).map((id) => state.allSites.find((site) => site.id === id)).filter((site) => site && normalizeSiteHomeUrl(site.url)).map((site) => ({
      id: site.id,
      name: site.name || site.id,
      url: normalizeSiteHomeUrl(site.url)
    }));
  }
  function showGroupTooltip(button, sites) {
    if (_groupTooltipTimer) {
      clearTimeout(_groupTooltipTimer);
      _groupTooltipTimer = null;
    }
    if (_groupTooltipHideTimer) {
      clearTimeout(_groupTooltipHideTimer);
      _groupTooltipHideTimer = null;
    }
    _groupTooltipTimer = setTimeout(() => {
      const tooltip = getOrCreateGroupTooltip();
      renderGroupTooltipSites(tooltip, sites);
      tooltip.style.display = "block";
      requestAnimationFrame(() => {
        const btnRect = button.getBoundingClientRect();
        const tooltipW = tooltip.offsetWidth;
        const tooltipH = tooltip.offsetHeight;
        let left = btnRect.left + btnRect.width / 2 - tooltipW / 2;
        if (left < 4) left = 4;
        if (left + tooltipW > window.innerWidth - 4) left = window.innerWidth - tooltipW - 4;
        let top = btnRect.top - tooltipH - 8;
        if (top < 4) top = btnRect.bottom + 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
    }, 450);
  }
  function hideGroupTooltip() {
    if (_groupTooltipTimer) {
      clearTimeout(_groupTooltipTimer);
      _groupTooltipTimer = null;
    }
    if (_groupTooltipHideTimer) {
      clearTimeout(_groupTooltipHideTimer);
      _groupTooltipHideTimer = null;
    }
    if (_groupTooltipEl) _groupTooltipEl.style.display = "none";
  }
  function scheduleHideGroupTooltip() {
    if (_groupTooltipTimer) {
      clearTimeout(_groupTooltipTimer);
      _groupTooltipTimer = null;
    }
    if (_groupTooltipHideTimer) clearTimeout(_groupTooltipHideTimer);
    _groupTooltipHideTimer = setTimeout(() => {
      if (_groupTooltipEl) _groupTooltipEl.style.display = "none";
    }, 180);
  }
  function renderGroupTooltipSites(tooltip, sites) {
    tooltip.innerHTML = "";
    const list = document.createElement("div");
    const columns = Math.min(5, Math.max(1, sites.length));
    list.className = "group-tooltip-list";
    list.style.gridTemplateColumns = `repeat(${columns}, max-content)`;
    const maxItemWidth = getTooltipItemMaxWidth(tooltip, sites, columns);
    if (maxItemWidth) {
      list.style.setProperty("--group-tooltip-item-max-width", `${maxItemWidth}px`);
    }
    sites.forEach((site) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "group-tooltip-item";
      item.textContent = site.name;
      item.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideGroupTooltip();
        await openSiteHome(site.url);
      });
      list.appendChild(item);
    });
    tooltip.appendChild(list);
  }
  function getTooltipItemMaxWidth(tooltip, sites, columns) {
    const availableWidth = Math.max(160, window.innerWidth - 28);
    const gapWidth = 6;
    const buttonWidths = sites.map((site) => estimateTooltipButtonWidth(tooltip, site.name));
    for (let i = 0; i < buttonWidths.length; i += columns) {
      const rowWidths = buttonWidths.slice(i, i + columns);
      const rowWidth = rowWidths.reduce((sum, width) => sum + width, 0) + gapWidth * Math.max(0, rowWidths.length - 1);
      if (rowWidth > availableWidth) {
        return Math.floor((availableWidth - gapWidth * (columns - 1)) / columns);
      }
    }
    return 0;
  }
  function estimateTooltipButtonWidth(tooltip, label) {
    const canvas = estimateTooltipButtonWidth.canvas || document.createElement("canvas");
    estimateTooltipButtonWidth.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 80;
    ctx.font = window.getComputedStyle(tooltip).font || "12px Microsoft YaHei UI";
    return Math.ceil(ctx.measureText(String(label || "")).width) + 20;
  }
  async function openSiteHome(url) {
    const safeUrl = normalizeSiteHomeUrl(url);
    if (!safeUrl) return;
    try {
      await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url: safeUrl });
    } catch (_err) {
    }
    window.close();
  }
  async function runDefaultSearch() {
    if (!state.groups.length) return;
    await runGroup(state.groups[0]);
  }
  function runGroup(group) {
    const { queryInput } = state.dom;
    const query = queryInput ? queryInput.value.trim() : "";
    chrome.runtime.sendMessage({ type: "RUN_SEARCH_GROUP", group, query }).catch(() => {
    });
    window.close();
  }
  function renderHistory(history) {
    const { historyList, queryInput } = state.dom;
    if (!historyList) return;
    historyList.innerHTML = "";
    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "popup-history-empty";
      empty.textContent = msg("popup_emptyHistory", "暂无搜索记录");
      historyList.appendChild(empty);
      return;
    }
    history.forEach((entry) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "popup-history-item";
      const query = String(entry.query || "").replace(/\s+/g, " ").trim();
      const dateText = formatHistoryDate(entry.createdAt);
      item.innerHTML = `
      <div class="popup-history-line">
        <div class="popup-history-query">${escapeHtml(query)}</div>
        <div class="popup-history-meta">${escapeHtml(dateText)}</div>
      </div>
      <button class="popup-history-delete-btn" type="button" aria-label="${msg("popup_deleteHistoryEntry", "删除这条记录")}">×</button>
    `;
      const deleteBtn = item.querySelector(".popup-history-delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await removeHistoryEntry(entry);
        });
      }
      item.addEventListener("click", () => {
        if (queryInput) {
          queryInput.value = entry.query || "";
          queryInput.focus();
        }
      });
      historyList.appendChild(item);
    });
  }
  async function removeHistoryEntry(entry) {
    const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
    const fullHistory = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY] : [];
    if (!fullHistory.length) return;
    let removed = false;
    const nextHistory = fullHistory.filter((item) => {
      if (removed) return true;
      if (entry?.id && item?.id === entry.id) {
        removed = true;
        return false;
      }
      if (!entry?.id && item?.query === entry?.query && item?.createdAt === entry?.createdAt) {
        removed = true;
        return false;
      }
      return true;
    });
    if (!removed) return;
    await chrome.storage.local.set({ [SEARCH_HISTORY_STORAGE_KEY]: nextHistory });
  }
  function closePromptPicker() {
    if (!state.isPromptPickerOpen) return;
    state.isPromptPickerOpen = false;
    if (state.popupPreviewMgr) state.popupPreviewMgr.hide();
    renderPromptPicker();
    state.updatePromptPickerLayoutState();
  }
  function togglePromptPicker() {
    state.isPromptPickerOpen = !state.isPromptPickerOpen;
    renderPromptPicker();
  }
  function renderPromptPicker() {
    state.updatePromptPickerLayoutState();
    const { promptPicker, promptEntryBtn, queryInput } = state.dom;
    if (!promptPicker || !promptEntryBtn || state.uiPrefs.showPromptButton === false) {
      if (promptPicker) promptPicker.hidden = true;
      state.updatePromptPickerLayoutState();
      return;
    }
    promptPicker.innerHTML = "";
    promptEntryBtn.setAttribute("aria-expanded", String(state.isPromptPickerOpen));
    if (!state.isPromptPickerOpen) {
      promptPicker.hidden = true;
      state.updatePromptPickerLayoutState();
      return;
    }
    promptPicker.hidden = false;
    if (!state.promptGroups.length) {
      const empty = document.createElement("div");
      empty.className = "popup-prompt-picker-empty";
      empty.textContent = msg("popup_emptyPromptGroups", "还没有提示词分组，请先去设置里添加。");
      promptPicker.appendChild(empty);
      state.updatePromptPickerLayoutState();
      return;
    }
    const activeGroup = state.promptGroups.find((group) => group.id === state.activePromptGroupId) || state.promptGroups[0];
    if (!activeGroup) {
      state.updatePromptPickerLayoutState();
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
        if (state.activePromptGroupId === group.id) return;
        state.activePromptGroupId = group.id;
        switchPopupPromptGroup(state, promptPicker, queryInput);
      });
      button.addEventListener("click", () => {
        if (state.activePromptGroupId === group.id) return;
        state.activePromptGroupId = group.id;
        switchPopupPromptGroup(state, promptPicker, queryInput);
      });
      groupsColumn.appendChild(button);
    });
    promptPicker.appendChild(groupsColumn);
    promptPicker.appendChild(buildPopupPromptsColumn(state, activeGroup, queryInput));
    const footer = document.createElement("div");
    footer.className = "popup-prompt-picker-footer";
    const settingsLink = document.createElement("button");
    settingsLink.type = "button";
    settingsLink.className = "popup-prompt-picker-settings-btn";
    settingsLink.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>${msg("popup_managePrompts", "管理提示词")}`;
    settingsLink.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE", section: "prompts" });
      window.close();
    });
    footer.appendChild(settingsLink);
    promptPicker.appendChild(footer);
    state.updatePromptPickerLayoutState();
  }
  function buildPopupPromptsColumn(state2, activeGroup, queryInput) {
    const promptsColumn = document.createElement("div");
    promptsColumn.className = "popup-prompt-list";
    const entries = getDisplayPromptEntries(activeGroup, state2.promptGroups);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "popup-prompt-picker-empty";
      empty.textContent = isAllPromptGroup(activeGroup) ? msg("popup_emptyPrompts", "还没有提示词，请先去设置里添加。") : msg("popup_emptyPromptsInGroup", "这个分组里还没有提示词。");
      promptsColumn.appendChild(empty);
    } else {
      state2.popupPreviewMgr = state2.popupPreviewMgr || window.PromptItemUI.createPreviewManager(null);
      entries.forEach(({ prompt, sourceGroup }) => {
        const item = window.PromptItemUI.createItem(prompt, {
          onFill: (p) => {
            if (queryInput) {
              queryInput.value = p.content || "";
              closePromptPicker();
              state2.syncComposerLayout({ scrollToTop: true });
              requestAnimationFrame(() => {
                queryInput.focus();
                queryInput.setSelectionRange(0, 0);
                queryInput.scrollTop = 0;
                state2.syncComposerLayout({ scrollToTop: true });
              });
            }
          },
          onEdit: (p) => openPopupPromptEditModal(p, sourceGroup.id),
          previewManager: state2.popupPreviewMgr
        });
        promptsColumn.appendChild(item);
      });
    }
    return promptsColumn;
  }
  function switchPopupPromptGroup(state2, promptPicker, queryInput) {
    if (!promptPicker || promptPicker.hidden) return;
    promptPicker.querySelectorAll(".popup-prompt-group-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.groupId === state2.activePromptGroupId);
    });
    const activeGroup = state2.promptGroups.find((g) => g.id === state2.activePromptGroupId) || state2.promptGroups[0];
    if (!activeGroup) return;
    const oldList = promptPicker.querySelector(".popup-prompt-list");
    const newList = buildPopupPromptsColumn(state2, activeGroup, queryInput);
    if (oldList) {
      oldList.replaceWith(newList);
    } else {
      const footer = promptPicker.querySelector(".popup-prompt-picker-footer");
      promptPicker.insertBefore(newList, footer || null);
    }
  }

  // src/popup/popup.js
  var { applyDomI18n } = window.__QSHOT_I18N__ || {};
  document.addEventListener("DOMContentLoaded", start);
  chrome.storage.onChanged.addListener(handleStorageChange);
  async function start() {
    const dom = state.dom;
    dom.queryInput = document.getElementById("popupQueryInput");
    dom.composer = document.querySelector(".search-composer");
    dom.groupsContainer = document.getElementById("popupGroups");
    dom.historyList = document.getElementById("popupHistoryList");
    dom.historySection = document.querySelector(".popup-history-section");
    dom.openSettingsBtn = document.getElementById("openSettingsBtn");
    dom.randomPromptBtn = document.getElementById("randomPromptBtn");
    dom.promptEntryBtn = document.getElementById("promptEntryBtn");
    dom.composerActionsRow = document.querySelector(".composer-actions-row");
    dom.promptPicker = document.getElementById("promptPicker");
    state.syncComposerLayout = syncComposerLayout;
    state.updatePromptPickerLayoutState = updatePromptPickerLayoutState;
    applyDomI18n?.(document);
    await chrome.runtime.sendMessage({ type: "ENSURE_INITIAL_STATE_DEFAULTS" }).catch(() => null);
    await refreshAllSites();
    await Promise.all([
      refreshGroups(),
      refreshPromptGroups(),
      refreshUiPrefs(),
      refreshHistory()
    ]);
    bindEvents();
    syncComposerLayout();
    dom.queryInput?.focus();
    triggerPrewarm();
  }
  function bindEvents() {
    const { openSettingsBtn, randomPromptBtn, promptEntryBtn, queryInput } = state.dom;
    openSettingsBtn?.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE" });
      window.close();
    });
    randomPromptBtn?.addEventListener("click", () => {
      closePromptPicker();
      fillRandomQuestion();
    });
    promptEntryBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePromptPicker();
    });
    queryInput?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      await runDefaultSearch();
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !state.isPromptPickerOpen) return;
      if (target.closest("#promptEntryBtn") || target.closest("#promptPicker")) return;
      closePromptPicker();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.isPromptPickerOpen) {
        closePromptPicker();
        queryInput?.focus();
      }
    });
    if (queryInput) {
      queryInput.addEventListener("input", syncComposerLayout);
      queryInput.addEventListener("mouseup", syncComposerLayout);
      queryInput.addEventListener("keyup", syncComposerLayout);
      if (typeof ResizeObserver !== "undefined") {
        state.composerResizeObserver = new ResizeObserver(() => syncComposerLayout());
        state.composerResizeObserver.observe(queryInput);
      }
    }
  }
  function triggerPrewarm() {
    if (state.uiPrefs.prewarmEnabled === false) return;
    try {
      chrome.runtime.sendMessage({ type: "WARMUP_AI_SITES" }).catch(() => {
      });
    } catch (_err) {
    }
  }
  async function handleStorageChange(changes, areaName) {
    if (areaName !== "local") return;
    if (changes[CUSTOM_SITES_STORAGE_KEY]) {
      await refreshAllSites();
      await refreshGroups();
    }
    if (changes[SEARCH_GROUPS_STORAGE_KEY]) await refreshGroups();
    if (changes[PROMPT_GROUPS_STORAGE_KEY]) await refreshPromptGroups();
    if (changes[UI_PREFS_STORAGE_KEY]) await refreshUiPrefs();
    if (changes[SEARCH_HISTORY_STORAGE_KEY]) await refreshHistory();
    if (changes[RANDOM_QUESTIONS_STORAGE_KEY]) invalidateRandomQuestionsCache();
  }
  async function refreshGroups() {
    state.groups = await loadGroups();
    renderGroups();
  }
  async function refreshPromptGroups() {
    state.promptGroups = await loadPromptGroups();
    if (!state.promptGroups.some((g) => g.id === state.activePromptGroupId)) {
      state.activePromptGroupId = state.promptGroups[0]?.id || null;
    }
    renderPromptPicker();
  }
  async function refreshUiPrefs() {
    state.uiPrefs = await loadUiPrefs();
    applyUiPrefs();
  }
  async function refreshHistory() {
    const history = await loadHistory();
    state.historyEntries = history;
    renderHistory(history);
  }
  function applyUiPrefs() {
    const { historySection, randomPromptBtn, promptEntryBtn, composerActionsRow } = state.dom;
    if (historySection) {
      historySection.hidden = state.uiPrefs.showHistory === false;
      historySection.classList.toggle("is-hidden", state.uiPrefs.showHistory === false);
      historySection.style.display = state.uiPrefs.showHistory === false ? "none" : "block";
    }
    if (randomPromptBtn) {
      randomPromptBtn.hidden = state.uiPrefs.showRandomButton === false;
      randomPromptBtn.style.display = state.uiPrefs.showRandomButton === false ? "none" : "inline-flex";
    }
    if (promptEntryBtn) {
      promptEntryBtn.hidden = state.uiPrefs.showPromptButton === false;
      promptEntryBtn.style.display = state.uiPrefs.showPromptButton === false ? "none" : "inline-flex";
      if (state.uiPrefs.showPromptButton === false) closePromptPicker();
    }
    if (composerActionsRow) {
      const hasVisible = state.uiPrefs.showRandomButton !== false || state.uiPrefs.showPromptButton !== false;
      composerActionsRow.hidden = !hasVisible;
      composerActionsRow.style.display = hasVisible ? "flex" : "none";
    }
    updatePromptPickerLayoutState();
  }
  function syncComposerLayout(options = {}) {
    const { composer, queryInput } = state.dom;
    if (!composer || !queryInput) return;
    composer.classList.remove("is-mid-expanded", "is-expanded");
    queryInput.style.height = "auto";
    queryInput.style.minHeight = "0px";
    const scrollH = queryInput.scrollHeight;
    const lineHeight = parseFloat(window.getComputedStyle(queryInput).lineHeight || "21.75");
    const maxHeight = parseFloat(window.getComputedStyle(queryInput).maxHeight || "220");
    queryInput.style.minHeight = "";
    const shouldExpand = scrollH > lineHeight * 2.7;
    const shouldMidExpand = !shouldExpand && scrollH > lineHeight * 1.7;
    composer.classList.toggle("is-mid-expanded", shouldMidExpand);
    composer.classList.toggle("is-expanded", shouldExpand);
    queryInput.style.height = shouldExpand ? `${Math.min(scrollH, maxHeight)}px` : "";
    queryInput.style.overflowY = shouldExpand && scrollH > maxHeight ? "auto" : "";
    if (options.scrollToTop) {
      queryInput.scrollTop = 0;
    }
  }
  function updatePromptPickerLayoutState() {
    const { composer } = state.dom;
    if (!composer) return;
    const shouldExpandDownward = state.isPromptPickerOpen && state.uiPrefs.showHistory === false;
    composer.classList.toggle("is-picker-inline-open", shouldExpandDownward);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9zdG9yYWdlLWtleXMuanMiLCAiLi4vLi4vc3JjL3BvcHVwL3N0YXRlLmpzIiwgIi4uLy4uL3NyYy9zaGFyZWQvcHJvbXB0LWdyb3Vwcy5qcyIsICIuLi8uLi9zcmMvcG9wdXAvcHJvbXB0LWVkaXQtbW9kYWwuanMiLCAiLi4vLi4vc3JjL3BvcHVwL3NlY3Rpb25zLmpzIiwgIi4uLy4uL3NyYy9wb3B1cC9wb3B1cC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGNvbnN0IFNFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVkgPSBcInNlYXJjaEdyb3Vwc1wiO1xyXG5leHBvcnQgY29uc3QgUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWSA9IFwicHJvbXB0R3JvdXBzXCI7XHJcbmV4cG9ydCBjb25zdCBVSV9QUkVGU19TVE9SQUdFX0tFWSA9IFwidWlQcmVmc1wiO1xyXG5leHBvcnQgY29uc3QgQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZID0gXCJjdXN0b21TaXRlc1wiO1xyXG5leHBvcnQgY29uc3QgUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWSA9IFwicmFuZG9tUXVlc3Rpb25zVGV4dFwiO1xyXG5leHBvcnQgY29uc3QgU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVkgPSBcInNlYXJjaEhpc3RvcnlcIjtcclxuXHJcbi8vIFRoZSBmaXhlZCBcIkFsbFwiIHByb21wdCBncm91cDogYWx3YXlzIGZpcnN0LCBjYW5ub3QgYmUgZGVsZXRlZCBvciByZW5hbWVkLlxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQgPSBcInByb21wdC1ncm91cC1kZWZhdWx0XCI7XHJcbmV4cG9ydCBjb25zdCBMRUdBQ1lfREVGQVVMVF9HUk9VUF9OQU1FID0gXCLpu5jorqTliIbnu4RcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBSQU5ET01fUVVFU1RJT05TX0ZJTEVTID0ge1xyXG4gIHpoOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL3poLUNOLnR4dFwiLFxyXG4gIGVuOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL2VuLnR4dFwiLFxyXG59O1xyXG4iLCAiaW1wb3J0IHtcclxuICBTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZLFxyXG4gIFNFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZLFxyXG4gIFBST01QVF9HUk9VUFNfU1RPUkFHRV9LRVksXHJcbiAgVUlfUFJFRlNfU1RPUkFHRV9LRVksXHJcbiAgQ1VTVE9NX1NJVEVTX1NUT1JBR0VfS0VZLFxyXG59IGZyb20gXCIuLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcblxyXG4vLyBTaGFyZWQgbXV0YWJsZSBzdGF0ZSBmb3IgdGhlIHBvcHVwLiBNb2R1bGVzIGltcG9ydCB0aGUgc2luZ2xldG9uIGFuZFxyXG4vLyBtdXRhdGUgZmllbGRzIGRpcmVjdGx5IGluc3RlYWQgb2YgcGFzc2luZyBOIGFyZ3VtZW50cyBhcm91bmQuXHJcbmV4cG9ydCBjb25zdCBzdGF0ZSA9IHtcclxuICBncm91cHM6IFtdLFxyXG4gIHByb21wdEdyb3VwczogW10sXHJcbiAgYWxsU2l0ZXM6IFtdLFxyXG4gIGhpc3RvcnlFbnRyaWVzOiBbXSxcclxuICB1aVByZWZzOiBjcmVhdGVOb3JtYWxpemVkVWlQcmVmcygpLFxyXG4gIGFjdGl2ZVByb21wdEdyb3VwSWQ6IG51bGwsXHJcbiAgaXNQcm9tcHRQaWNrZXJPcGVuOiBmYWxzZSxcclxuICBwb3B1cFByZXZpZXdNZ3I6IG51bGwsXHJcbiAgY29tcG9zZXJSZXNpemVPYnNlcnZlcjogbnVsbCxcclxuICAvLyBET00gcmVmcyDigJQgcG9wdWxhdGVkIG9uY2UgaW4gbWFpbi5qcyBhZnRlciBET00gcmVhZHkuXHJcbiAgZG9tOiB7XHJcbiAgICBxdWVyeUlucHV0OiBudWxsLFxyXG4gICAgY29tcG9zZXI6IG51bGwsXHJcbiAgICBncm91cHNDb250YWluZXI6IG51bGwsXHJcbiAgICBoaXN0b3J5TGlzdDogbnVsbCxcclxuICAgIGhpc3RvcnlTZWN0aW9uOiBudWxsLFxyXG4gICAgb3BlblNldHRpbmdzQnRuOiBudWxsLFxyXG4gICAgcmFuZG9tUHJvbXB0QnRuOiBudWxsLFxyXG4gICAgcHJvbXB0RW50cnlCdG46IG51bGwsXHJcbiAgICBjb21wb3NlckFjdGlvbnNSb3c6IG51bGwsXHJcbiAgICBwcm9tcHRQaWNrZXI6IG51bGwsXHJcbiAgfSxcclxuICAvLyBDYWxsYmFja3MgcmVnaXN0ZXJlZCBieSBtYWluLmpzIHNvIHBhbmVscyBjYW4gdHJpZ2dlciBjcm9zcy1jdXR0aW5nIHdvcmtcclxuICAvLyB3aXRob3V0IGNyZWF0aW5nIGNpcmN1bGFyIGltcG9ydHMuXHJcbiAgc3luY0NvbXBvc2VyTGF5b3V0OiAoKSA9PiB7fSxcclxuICB1cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZTogKCkgPT4ge30sXHJcbn07XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTm9ybWFsaXplZFVpUHJlZnMoaW5wdXQpIHtcclxuICBjb25zdCBzcmMgPSBpbnB1dCAmJiB0eXBlb2YgaW5wdXQgPT09IFwib2JqZWN0XCIgPyBpbnB1dCA6IHt9O1xyXG4gIHJldHVybiB7XHJcbiAgICBzaG93SGlzdG9yeTogc3JjLnNob3dIaXN0b3J5ID09PSB0cnVlLFxyXG4gICAgc2hvd1JhbmRvbUJ1dHRvbjogc3JjLnNob3dSYW5kb21CdXR0b24gIT09IGZhbHNlLFxyXG4gICAgc2hvd1Byb21wdEJ1dHRvbjogc3JjLnNob3dQcm9tcHRCdXR0b24gIT09IGZhbHNlLFxyXG4gICAgcHJld2FybUVuYWJsZWQ6IHNyYy5wcmV3YXJtRW5hYmxlZCAhPT0gZmFsc2UsXHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVNpdGVIb21lVXJsKHVybCkge1xyXG4gIGNvbnN0IHJhdyA9IFN0cmluZyh1cmwgfHwgXCJcIikudHJpbSgpO1xyXG4gIGlmICghcmF3KSByZXR1cm4gXCJcIjtcclxuICBsZXQgbmV4dCA9IHJhdy5yZXBsYWNlKC8oWz8mXSlbXj0mXSs9XFx7cXVlcnlcXH0vZywgKF8sIHNlcCkgPT4gKHNlcCA9PT0gXCI/XCIgPyBcIj9cIiA6IFwiXCIpKTtcclxuICBuZXh0ID0gbmV4dC5yZXBsYWNlKC9cXD8mLywgXCI/XCIpO1xyXG4gIG5leHQgPSBuZXh0LnJlcGxhY2UoL1s/Jl0kLywgXCJcIik7XHJcbiAgbmV4dCA9IG5leHQucmVwbGFjZSgvXFx7cXVlcnlcXH0vZywgXCJcIik7XHJcbiAgaWYgKCEvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KG5leHQpKSByZXR1cm4gXCJcIjtcclxuICByZXR1cm4gbmV4dDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZUh0bWwodmFsdWUpIHtcclxuICByZXR1cm4gU3RyaW5nKHZhbHVlKVxyXG4gICAgLnJlcGxhY2VBbGwoXCImXCIsIFwiJmFtcDtcIilcclxuICAgIC5yZXBsYWNlQWxsKFwiPFwiLCBcIiZsdDtcIilcclxuICAgIC5yZXBsYWNlQWxsKFwiPlwiLCBcIiZndDtcIilcclxuICAgIC5yZXBsYWNlQWxsKCdcIicsIFwiJnF1b3Q7XCIpXHJcbiAgICAucmVwbGFjZUFsbChcIidcIiwgXCImIzM5O1wiKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEhpc3RvcnlEYXRlKHZhbHVlKSB7XHJcbiAgaWYgKCF2YWx1ZSkgcmV0dXJuIFwiXCI7XHJcbiAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcclxuICBpZiAoTnVtYmVyLmlzTmFOKGRhdGUuZ2V0VGltZSgpKSkgcmV0dXJuIFwiXCI7XHJcbiAgY29uc3QgbGFuZyA9IHdpbmRvdy5fX1FTSE9UX0kxOE5fXz8uZ2V0VWlMYW5ndWFnZT8uKCkgfHwgbmF2aWdhdG9yLmxhbmd1YWdlIHx8IFwiemgtQ05cIjtcclxuICByZXR1cm4gZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcobGFuZywgeyB5ZWFyOiBcIm51bWVyaWNcIiwgbW9udGg6IFwibnVtZXJpY1wiLCBkYXk6IFwibnVtZXJpY1wiIH0pO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZEdyb3VwcygpIHtcclxuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1NFQVJDSF9HUk9VUFNfU1RPUkFHRV9LRVldKTtcclxuICByZXR1cm4gQXJyYXkuaXNBcnJheShzdG9yZWRbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0pXHJcbiAgICA/IHN0b3JlZFtTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZXVxyXG4gICAgOiBbXTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRQcm9tcHRHcm91cHMoKSB7XHJcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZXSk7XHJcbiAgY29uc3Qgc291cmNlID0gQXJyYXkuaXNBcnJheShzdG9yZWRbUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWV0pXHJcbiAgICA/IHN0b3JlZFtQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZXVxyXG4gICAgOiBbXTtcclxuICByZXR1cm4gc291cmNlLm1hcCgoZ3JvdXAsIGdpKSA9PiAoe1xyXG4gICAgaWQ6IFN0cmluZyhncm91cC5pZCB8fCBgcHJvbXB0LWdyb3VwLSR7Z2l9YCksXHJcbiAgICBuYW1lOiBTdHJpbmcoZ3JvdXAubmFtZSB8fCBcIuacquWRveWQjeWIhue7hFwiKSxcclxuICAgIHByb21wdHM6IEFycmF5LmlzQXJyYXkoZ3JvdXAucHJvbXB0cylcclxuICAgICAgPyBncm91cC5wcm9tcHRzLm1hcCgocCwgcGkpID0+ICh7XHJcbiAgICAgICAgICBpZDogU3RyaW5nKHAuaWQgfHwgYHByb21wdC0ke2dpfS0ke3BpfWApLFxyXG4gICAgICAgICAgdGl0bGU6IFN0cmluZyhwLnRpdGxlIHx8IFwi5pyq5ZG95ZCN5o+Q56S66K+NXCIpLFxyXG4gICAgICAgICAgY29udGVudDogU3RyaW5nKHAuY29udGVudCB8fCBcIlwiKSxcclxuICAgICAgICB9KSlcclxuICAgICAgOiBbXSxcclxuICB9KSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkSGlzdG9yeSgpIHtcclxuICBjb25zdCBzdG9yZWQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW1NFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZXSk7XHJcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoc3RvcmVkW1NFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZXSlcclxuICAgID8gc3RvcmVkW1NFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZXS5zbGljZSgwLCA0KVxyXG4gICAgOiBbXTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRVaVByZWZzKCkge1xyXG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbVUlfUFJFRlNfU1RPUkFHRV9LRVldKTtcclxuICByZXR1cm4gY3JlYXRlTm9ybWFsaXplZFVpUHJlZnMoc3RvcmVkW1VJX1BSRUZTX1NUT1JBR0VfS0VZXSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWZyZXNoQWxsU2l0ZXMoKSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IFtidWlsdGluUmVzcCwgc3RvcmVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcclxuICAgICAgZmV0Y2goY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKFwiY29uZmlnL3NpdGVIYW5kbGVycy5qc29uXCIpKSxcclxuICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtDVVNUT01fU0lURVNfU1RPUkFHRV9LRVldKSxcclxuICAgIF0pO1xyXG4gICAgY29uc3QgcGF5bG9hZCA9IGF3YWl0IGJ1aWx0aW5SZXNwLmpzb24oKTtcclxuICAgIGNvbnN0IGJ1aWx0aW4gPSAocGF5bG9hZC5zaXRlcyB8fCBbXSkuZmlsdGVyKChzKSA9PiBzLmVuYWJsZWQgIT09IGZhbHNlKTtcclxuICAgIGNvbnN0IGN1c3RvbSA9IEFycmF5LmlzQXJyYXkoc3RvcmVkW0NVU1RPTV9TSVRFU19TVE9SQUdFX0tFWV0pXHJcbiAgICAgID8gc3RvcmVkW0NVU1RPTV9TSVRFU19TVE9SQUdFX0tFWV1cclxuICAgICAgOiBbXTtcclxuICAgIGNvbnN0IGtub3duSWRzID0gbmV3IFNldChidWlsdGluLm1hcCgocykgPT4gcy5pZCkpO1xyXG4gICAgY29uc3QgbWVyZ2VkID0gWy4uLmJ1aWx0aW5dO1xyXG4gICAgY3VzdG9tLmZvckVhY2goKHMpID0+IHtcclxuICAgICAgaWYgKHMgJiYgIWtub3duSWRzLmhhcyhzLmlkKSkge1xyXG4gICAgICAgIG1lcmdlZC5wdXNoKHMpO1xyXG4gICAgICAgIGtub3duSWRzLmFkZChzLmlkKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBzdGF0ZS5hbGxTaXRlcyA9IG1lcmdlZDtcclxuICB9IGNhdGNoIChfZSkge1xyXG4gICAgc3RhdGUuYWxsU2l0ZXMgPSBbXTtcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEIH0gZnJvbSBcIi4vc3RvcmFnZS1rZXlzLmpzXCI7XHJcblxyXG5mdW5jdGlvbiBpMThuKGtleSkge1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gY2hyb21lPy5pMThuPy5nZXRNZXNzYWdlPy4oa2V5KSB8fCB3aW5kb3cuX19RU0hPVF9JMThOX18/LnQ/LihrZXkpIHx8IFwiXCI7XHJcbiAgfSBjYXRjaCAoX2UpIHtcclxuICAgIHJldHVybiBcIlwiO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEFsbFByb21wdEdyb3VwTmFtZSgpIHtcclxuICByZXR1cm4gaTE4bihcInNldHRpbmdzX3Byb21wdHNfYWxsR3JvdXBcIikgfHwgXCLlhajpg6hcIjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApIHtcclxuICByZXR1cm4gISFncm91cCAmJiBncm91cC5pZCA9PT0gREVGQVVMVF9QUk9NUFRfR1JPVVBfSUQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRQcm9tcHRHcm91cERpc3BsYXlOYW1lKGdyb3VwKSB7XHJcbiAgaWYgKGlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApKSByZXR1cm4gZ2V0QWxsUHJvbXB0R3JvdXBOYW1lKCk7XHJcbiAgcmV0dXJuIGdyb3VwPy5uYW1lIHx8IGkxOG4oXCJvdmVybGF5X3VubmFtZWRQcm9tcHRHcm91cFwiKSB8fCBcIuacquWRveWQjeWIhue7hFwiO1xyXG59XHJcblxyXG4vLyBGbGF0dGVucyBhIGdyb3VwJ3MgcHJvbXB0IGxpc3QgZm9yIGRpc3BsYXkuIFdoZW4gdGhlIGdyb3VwIGlzIHRoZSB2aXJ0dWFsXHJcbi8vIFwiQWxsXCIgZ3JvdXAsIHVuaW9ucyBwcm9tcHRzIGFjcm9zcyBldmVyeSByZWFsIGdyb3VwIHdoaWxlIHJlbWVtYmVyaW5nIHRoZVxyXG4vLyBzb3VyY2UgZ3JvdXAgb24gZWFjaCBlbnRyeS5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldERpc3BsYXlQcm9tcHRFbnRyaWVzKGdyb3VwLCBhbGxHcm91cHMpIHtcclxuICBpZiAoIWdyb3VwKSByZXR1cm4gW107XHJcbiAgaWYgKGlzQWxsUHJvbXB0R3JvdXAoZ3JvdXApKSB7XHJcbiAgICBjb25zdCBvdXQgPSBbXTtcclxuICAgIChhbGxHcm91cHMgfHwgW10pLmZvckVhY2goKGcpID0+IHtcclxuICAgICAgKGcucHJvbXB0cyB8fCBbXSkuZm9yRWFjaCgocHJvbXB0KSA9PiBvdXQucHVzaCh7IHByb21wdCwgc291cmNlR3JvdXA6IGcgfSkpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gb3V0O1xyXG4gIH1cclxuICByZXR1cm4gKGdyb3VwLnByb21wdHMgfHwgW10pLm1hcCgocHJvbXB0KSA9PiAoeyBwcm9tcHQsIHNvdXJjZUdyb3VwOiBncm91cCB9KSk7XHJcbn1cclxuIiwgImltcG9ydCB7IHN0YXRlLCBlc2NhcGVIdG1sIH0gZnJvbSBcIi4vc3RhdGUuanNcIjtcclxuaW1wb3J0IHsgUFJPTVBUX0dST1VQU19TVE9SQUdFX0tFWSB9IGZyb20gXCIuLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcbmltcG9ydCB7IGdldFByb21wdEdyb3VwRGlzcGxheU5hbWUgfSBmcm9tIFwiLi4vc2hhcmVkL3Byb21wdC1ncm91cHMuanNcIjtcclxuaW1wb3J0IHsgY2xvc2VQcm9tcHRQaWNrZXIgfSBmcm9tIFwiLi9zZWN0aW9ucy5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5Qb3B1cFByb21wdEVkaXRNb2RhbChwcm9tcHQsIGdyb3VwSWQpIHtcclxuICBjbG9zZVByb21wdFBpY2tlcigpO1xyXG4gIGNvbnN0IHRhcmdldEdyb3VwID1cclxuICAgIHN0YXRlLnByb21wdEdyb3Vwcy5maW5kKChnKSA9PiBnLmlkID09PSBncm91cElkKSB8fCBzdGF0ZS5wcm9tcHRHcm91cHNbMF07XHJcbiAgY29uc3QgdGFyZ2V0UHJvbXB0ID0gdGFyZ2V0R3JvdXA/LnByb21wdHMuZmluZCgocCkgPT4gcC5pZCA9PT0gcHJvbXB0LmlkKTtcclxuICBpZiAoIXRhcmdldFByb21wdCkgcmV0dXJuO1xyXG5cclxuICBjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBvdmVybGF5LmNsYXNzTmFtZSA9IFwicHJvbXB0LWVkaXQtbW9kYWwtb3ZlcmxheVwiO1xyXG4gIG92ZXJsYXkuc3R5bGUuY3NzVGV4dCA9XHJcbiAgICBcInBvc2l0aW9uOmZpeGVkO2luc2V0OjA7YmFja2dyb3VuZDpyZ2JhKDAsMCwwLC4yOCk7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmZsZXgtc3RhcnQ7anVzdGlmeS1jb250ZW50OmNlbnRlcjtwYWRkaW5nOjE2cHg7ei1pbmRleDoxMDAwMDtvdmVyZmxvdy15OmF1dG87XCI7XHJcblxyXG4gIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBtb2RhbC5zdHlsZS5jc3NUZXh0ID1cclxuICAgIFwid2lkdGg6MTAwJTttYXJnaW46YXV0bztiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoxOHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEwcHg7Ym94LXNoYWRvdzowIDE2cHggNDBweCByZ2JhKDAsMCwwLC4xNik7XCI7XHJcbiAgbW9kYWwuaW5uZXJIVE1MID0gYFxyXG4gICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxNHB4O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjojMTExO21hcmdpbi1ib3R0b206MnB4O1wiPue8lui+keaPkOekuuivjTwvZGl2PlxyXG4gICAgPGRpdj5cclxuICAgICAgPGxhYmVsIHN0eWxlPVwiZm9udC1zaXplOjEycHg7Y29sb3I6IzY2NjtkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206NHB4O1wiPuWQjeensDwvbGFiZWw+XHJcbiAgICAgIDxpbnB1dCBjbGFzcz1cInBlcC10aXRsZVwiIHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCIke2VzY2FwZUh0bWwodGFyZ2V0UHJvbXB0LnRpdGxlIHx8IFwiXCIpfVwiIHN0eWxlPVwid2lkdGg6MTAwJTtoZWlnaHQ6MzRweDtwYWRkaW5nOjAgMTBweDtib3JkZXI6MXB4IHNvbGlkICNkZGQ7Ym9yZGVyLXJhZGl1czo0cHg7Zm9udDppbmhlcml0O2ZvbnQtc2l6ZToxM3B4O2NvbG9yOiMxMTE7b3V0bGluZTpub25lO1wiIC8+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXY+XHJcbiAgICAgIDxsYWJlbCBzdHlsZT1cImZvbnQtc2l6ZToxMnB4O2NvbG9yOiM2NjY7ZGlzcGxheTpibG9jazttYXJnaW4tYm90dG9tOjRweDtcIj7liIbnsbs8L2xhYmVsPlxyXG4gICAgICA8c2VsZWN0IGNsYXNzPVwicGVwLWdyb3VwXCIgc3R5bGU9XCJ3aWR0aDoxMDAlO2hlaWdodDozNHB4O3BhZGRpbmc6MCA4cHg7Ym9yZGVyOjFweCBzb2xpZCAjZGRkO2JvcmRlci1yYWRpdXM6NHB4O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTNweDtjb2xvcjojMTExO291dGxpbmU6bm9uZTtcIj5cclxuICAgICAgICAke3N0YXRlLnByb21wdEdyb3Vwc1xyXG4gICAgICAgICAgLm1hcChcclxuICAgICAgICAgICAgKGcpID0+XHJcbiAgICAgICAgICAgICAgYDxvcHRpb24gdmFsdWU9XCIke2VzY2FwZUh0bWwoZy5pZCl9XCIke2cuaWQgPT09IGdyb3VwSWQgPyBcIiBzZWxlY3RlZFwiIDogXCJcIn0+JHtlc2NhcGVIdG1sKGdldFByb21wdEdyb3VwRGlzcGxheU5hbWUoZykpfTwvb3B0aW9uPmBcclxuICAgICAgICAgIClcclxuICAgICAgICAgIC5qb2luKFwiXCIpfVxyXG4gICAgICAgIDxvcHRpb24gdmFsdWU9XCJfX25ld19fXCI+77yLIOaWsOW7uuWIhue7hOKApjwvb3B0aW9uPlxyXG4gICAgICA8L3NlbGVjdD5cclxuICAgICAgPGlucHV0IGNsYXNzPVwicGVwLW5ld2dyb3VwXCIgdHlwZT1cInRleHRcIiBwbGFjZWhvbGRlcj1cIui+k+WFpeaWsOWIhue7hOWQjeensFwiIHN0eWxlPVwiZGlzcGxheTpub25lO3dpZHRoOjEwMCU7aGVpZ2h0OjM0cHg7cGFkZGluZzowIDEwcHg7Ym9yZGVyOjFweCBzb2xpZCAjZGRkO2JvcmRlci1yYWRpdXM6NHB4O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTNweDtjb2xvcjojMTExO291dGxpbmU6bm9uZTttYXJnaW4tdG9wOjZweDtcIiAvPlxyXG4gICAgPC9kaXY+XHJcbiAgICA8ZGl2PlxyXG4gICAgICA8bGFiZWwgc3R5bGU9XCJmb250LXNpemU6MTJweDtjb2xvcjojNjY2O2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWJvdHRvbTo0cHg7XCI+5o+Q56S66K+N5YaF5a65PC9sYWJlbD5cclxuICAgICAgPHRleHRhcmVhIGNsYXNzPVwicGVwLWNvbnRlbnRcIiBzdHlsZT1cIndpZHRoOjEwMCU7bWluLWhlaWdodDoxMjBweDtwYWRkaW5nOjhweCAxMHB4O2JvcmRlcjoxcHggc29saWQgI2RkZDtib3JkZXItcmFkaXVzOjRweDtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEzcHg7Y29sb3I6IzExMTtvdXRsaW5lOm5vbmU7cmVzaXplOnZlcnRpY2FsO2xpbmUtaGVpZ2h0OjEuNjtcIj4ke2VzY2FwZUh0bWwodGFyZ2V0UHJvbXB0LmNvbnRlbnQgfHwgXCJcIil9PC90ZXh0YXJlYT5cclxuICAgIDwvZGl2PlxyXG4gICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Z2FwOjhweDttYXJnaW4tdG9wOjJweDtcIj5cclxuICAgICAgPGJ1dHRvbiBjbGFzcz1cInBlcC1kZWxldGVcIiBzdHlsZT1cImhlaWdodDozMnB4O3BhZGRpbmc6MCAxMnB4O2JvcmRlcjpub25lO2JvcmRlci1yYWRpdXM6NHB4O2JhY2tncm91bmQ6I2ZlZTJlMjtjb2xvcjojZGMyNjI2O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo1MDA7Y3Vyc29yOnBvaW50ZXI7XCI+5Yig6ZmkPC9idXR0b24+XHJcbiAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7Z2FwOjZweDtcIj5cclxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwicGVwLWNhbmNlbFwiIHN0eWxlPVwiaGVpZ2h0OjMycHg7cGFkZGluZzowIDEycHg7Ym9yZGVyOjFweCBzb2xpZCAjZGRkO2JvcmRlci1yYWRpdXM6NHB4O2JhY2tncm91bmQ6I2ZmZjtjb2xvcjojNDQ0O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo1MDA7Y3Vyc29yOnBvaW50ZXI7XCI+5Y+W5raIPC9idXR0b24+XHJcbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cInBlcC1zYXZlXCIgc3R5bGU9XCJoZWlnaHQ6MzJweDtwYWRkaW5nOjAgMTRweDtib3JkZXI6bm9uZTtib3JkZXItcmFkaXVzOjRweDtiYWNrZ3JvdW5kOiMxMTE7Y29sb3I6I2ZmZjtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NTAwO2N1cnNvcjpwb2ludGVyO1wiPuS/neWtmDwvYnV0dG9uPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcblxyXG4gIGNvbnN0IHRpdGxlSW5wdXQgPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnBlcC10aXRsZVwiKTtcclxuICBjb25zdCBncm91cFNlbGVjdCA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucGVwLWdyb3VwXCIpO1xyXG4gIGNvbnN0IG5ld0dyb3VwSW5wdXQgPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnBlcC1uZXdncm91cFwiKTtcclxuICBjb25zdCBjb250ZW50SW5wdXQgPSBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnBlcC1jb250ZW50XCIpO1xyXG5cclxuICBncm91cFNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XHJcbiAgICBjb25zdCBpc05ldyA9IGdyb3VwU2VsZWN0IGluc3RhbmNlb2YgSFRNTFNlbGVjdEVsZW1lbnQgJiYgZ3JvdXBTZWxlY3QudmFsdWUgPT09IFwiX19uZXdfX1wiO1xyXG4gICAgaWYgKG5ld0dyb3VwSW5wdXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSB7XHJcbiAgICAgIG5ld0dyb3VwSW5wdXQuc3R5bGUuZGlzcGxheSA9IGlzTmV3ID8gXCJibG9ja1wiIDogXCJub25lXCI7XHJcbiAgICAgIGlmIChpc05ldykgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IG5ld0dyb3VwSW5wdXQuZm9jdXMoKSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IHByZXZNaW5IZWlnaHQgPSBkb2N1bWVudC5ib2R5LnN0eWxlLm1pbkhlaWdodDtcclxuICBjb25zdCBwcmV2Qm9keUJnID0gZG9jdW1lbnQuYm9keS5zdHlsZS5iYWNrZ3JvdW5kO1xyXG4gIGNvbnN0IHBvcHVwU2hlbGwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLnBvcHVwLXNoZWxsXCIpO1xyXG4gIGNvbnN0IHByZXZTaGVsbEJnID0gcG9wdXBTaGVsbCA/IHBvcHVwU2hlbGwuc3R5bGUuYmFja2dyb3VuZCA6IFwiXCI7XHJcbiAgY29uc3QgcG9wdXBBY3Rpb25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5wb3B1cC1hY3Rpb25zXCIpO1xyXG4gIGNvbnN0IHByZXZBY3Rpb25zRGlzcGxheSA9IHBvcHVwQWN0aW9ucyA/IHBvcHVwQWN0aW9ucy5zdHlsZS5kaXNwbGF5IDogXCJcIjtcclxuXHJcbiAgZnVuY3Rpb24gY2xvc2VNb2RhbCgpIHtcclxuICAgIG92ZXJsYXkucmVtb3ZlKCk7XHJcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUub3ZlcmZsb3cgPSBcIlwiO1xyXG4gICAgZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9IFwiXCI7XHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm1pbkhlaWdodCA9IHByZXZNaW5IZWlnaHQ7XHJcbiAgICBkb2N1bWVudC5ib2R5LnN0eWxlLmJhY2tncm91bmQgPSBwcmV2Qm9keUJnO1xyXG4gICAgaWYgKHBvcHVwU2hlbGwpIHBvcHVwU2hlbGwuc3R5bGUuYmFja2dyb3VuZCA9IHByZXZTaGVsbEJnO1xyXG4gICAgaWYgKHBvcHVwQWN0aW9ucykgcG9wdXBBY3Rpb25zLnN0eWxlLmRpc3BsYXkgPSBwcmV2QWN0aW9uc0Rpc3BsYXk7XHJcbiAgfVxyXG5cclxuICBtb2RhbC5xdWVyeVNlbGVjdG9yKFwiLnBlcC1jYW5jZWxcIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsb3NlTW9kYWwpO1xyXG4gIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XHJcbiAgICBpZiAoZS50YXJnZXQgPT09IG92ZXJsYXkpIGNsb3NlTW9kYWwoKTtcclxuICB9KTtcclxuXHJcbiAgbW9kYWwucXVlcnlTZWxlY3RvcihcIi5wZXAtc2F2ZVwiKS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgY29uc3QgbmV3VGl0bGUgPVxyXG4gICAgICAodGl0bGVJbnB1dCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQgPyB0aXRsZUlucHV0LnZhbHVlIDogXCJcIikudHJpbSgpIHx8XHJcbiAgICAgIFwi5pyq5ZG95ZCN5o+Q56S66K+NXCI7XHJcbiAgICBjb25zdCBuZXdDb250ZW50ID0gY29udGVudElucHV0IGluc3RhbmNlb2YgSFRNTFRleHRBcmVhRWxlbWVudCA/IGNvbnRlbnRJbnB1dC52YWx1ZSA6IFwiXCI7XHJcbiAgICBsZXQgbmV3R3JvdXBJZCA9IGdyb3VwU2VsZWN0IGluc3RhbmNlb2YgSFRNTFNlbGVjdEVsZW1lbnQgPyBncm91cFNlbGVjdC52YWx1ZSA6IGdyb3VwSWQ7XHJcbiAgICBpZiAobmV3R3JvdXBJZCA9PT0gXCJfX25ld19fXCIpIHtcclxuICAgICAgY29uc3QgbmV3TmFtZSA9XHJcbiAgICAgICAgKG5ld0dyb3VwSW5wdXQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50ID8gbmV3R3JvdXBJbnB1dC52YWx1ZSA6IFwiXCIpLnRyaW0oKSB8fFxyXG4gICAgICAgIFwi5paw5bu65YiG57uEXCI7XHJcbiAgICAgIGNvbnN0IG5ld0dyb3VwID0geyBpZDogYHByb21wdC1ncm91cC0ke0RhdGUubm93KCl9YCwgbmFtZTogbmV3TmFtZSwgcHJvbXB0czogW10gfTtcclxuICAgICAgc3RhdGUucHJvbXB0R3JvdXBzLnB1c2gobmV3R3JvdXApO1xyXG4gICAgICBuZXdHcm91cElkID0gbmV3R3JvdXAuaWQ7XHJcbiAgICB9XHJcbiAgICBzdGF0ZS5wcm9tcHRHcm91cHMuZm9yRWFjaCgoZykgPT4ge1xyXG4gICAgICBnLnByb21wdHMgPSBnLnByb21wdHMuZmlsdGVyKChwKSA9PiBwLmlkICE9PSB0YXJnZXRQcm9tcHQuaWQpO1xyXG4gICAgfSk7XHJcbiAgICBjb25zdCBkZXN0R3JvdXAgPSBzdGF0ZS5wcm9tcHRHcm91cHMuZmluZCgoZykgPT4gZy5pZCA9PT0gbmV3R3JvdXBJZCkgfHwgdGFyZ2V0R3JvdXA7XHJcbiAgICBkZXN0R3JvdXAucHJvbXB0cy5wdXNoKHsgaWQ6IHRhcmdldFByb21wdC5pZCwgdGl0bGU6IG5ld1RpdGxlLCBjb250ZW50OiBuZXdDb250ZW50IH0pO1xyXG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW1BST01QVF9HUk9VUFNfU1RPUkFHRV9LRVldOiBzdGF0ZS5wcm9tcHRHcm91cHMgfSk7XHJcbiAgICBjbG9zZU1vZGFsKCk7XHJcbiAgfSk7XHJcblxyXG4gIG1vZGFsLnF1ZXJ5U2VsZWN0b3IoXCIucGVwLWRlbGV0ZVwiKS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgaWYgKCF3aW5kb3cuY29uZmlybShcIuehruWumuimgeWIoOmZpOi/meadoeaPkOekuuivjeWQl++8n1wiKSkgcmV0dXJuO1xyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLmZvckVhY2goKGcpID0+IHtcclxuICAgICAgZy5wcm9tcHRzID0gZy5wcm9tcHRzLmZpbHRlcigocCkgPT4gcC5pZCAhPT0gdGFyZ2V0UHJvbXB0LmlkKTtcclxuICAgIH0pO1xyXG4gICAgYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW1BST01QVF9HUk9VUFNfU1RPUkFHRV9LRVldOiBzdGF0ZS5wcm9tcHRHcm91cHMgfSk7XHJcbiAgICBjbG9zZU1vZGFsKCk7XHJcbiAgfSk7XHJcblxyXG4gIG92ZXJsYXkuYXBwZW5kQ2hpbGQobW9kYWwpO1xyXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XHJcbiAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLm92ZXJmbG93ID0gXCJ2aXNpYmxlXCI7XHJcbiAgZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9IFwidmlzaWJsZVwiO1xyXG4gIGRvY3VtZW50LmJvZHkuc3R5bGUubWluSGVpZ2h0ID0gXCI0NDBweFwiO1xyXG4gIGRvY3VtZW50LmJvZHkuc3R5bGUuYmFja2dyb3VuZCA9IFwiI2ZmZmZmZlwiO1xyXG4gIGlmIChwb3B1cFNoZWxsKSBwb3B1cFNoZWxsLnN0eWxlLmJhY2tncm91bmQgPSBcIiNmZmZmZmZcIjtcclxuICBpZiAocG9wdXBBY3Rpb25zKSBwb3B1cEFjdGlvbnMuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xyXG4gIGlmICh0aXRsZUlucHV0IGluc3RhbmNlb2YgSFRNTElucHV0RWxlbWVudCkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHRpdGxlSW5wdXQuZm9jdXMoKSk7XHJcbn1cclxuIiwgImltcG9ydCB7IHN0YXRlLCBub3JtYWxpemVTaXRlSG9tZVVybCwgZXNjYXBlSHRtbCwgZm9ybWF0SGlzdG9yeURhdGUgfSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQgeyBTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSwgUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWSB9IGZyb20gXCIuLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcbmltcG9ydCB7IGlzQWxsUHJvbXB0R3JvdXAsIGdldFByb21wdEdyb3VwRGlzcGxheU5hbWUsIGdldERpc3BsYXlQcm9tcHRFbnRyaWVzIH0gZnJvbSBcIi4uL3NoYXJlZC9wcm9tcHQtZ3JvdXBzLmpzXCI7XHJcbmltcG9ydCB7IG9wZW5Qb3B1cFByb21wdEVkaXRNb2RhbCB9IGZyb20gXCIuL3Byb21wdC1lZGl0LW1vZGFsLmpzXCI7XHJcblxyXG5jb25zdCBSQU5ET01fUVVFU1RJT05TX0ZJTEVTID0ge1xyXG4gIHpoOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL3poLUNOLnR4dFwiLFxyXG4gIGVuOiBcImNvbmZpZy9yYW5kb20tcXVlc3Rpb25zL2VuLnR4dFwiLFxyXG59O1xyXG5cclxubGV0IHJhbmRvbVF1ZXN0aW9uc1Byb21pc2UgPSBudWxsO1xyXG5sZXQgbGFzdFJhbmRvbVF1ZXN0aW9uSW5kZXggPSAtMTtcclxuXHJcbmZ1bmN0aW9uIG1zZyhrZXksIGZhbGxiYWNrID0gXCJcIikge1xyXG4gIHJldHVybiB3aW5kb3cuX19RU0hPVF9JMThOX18/LnQ/LihrZXkpIHx8IGZhbGxiYWNrO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaW52YWxpZGF0ZVJhbmRvbVF1ZXN0aW9uc0NhY2hlKCkge1xyXG4gIHJhbmRvbVF1ZXN0aW9uc1Byb21pc2UgPSBudWxsO1xyXG4gIGxhc3RSYW5kb21RdWVzdGlvbkluZGV4ID0gLTE7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBhcnNlUmFuZG9tUXVlc3Rpb25zVGV4dCh0ZXh0KSB7XHJcbiAgaWYgKHR5cGVvZiB0ZXh0ICE9PSBcInN0cmluZ1wiKSByZXR1cm4gW107XHJcbiAgcmV0dXJuIHRleHRcclxuICAgIC5zcGxpdCgvXFxyP1xcbi8pXHJcbiAgICAubWFwKChsaW5lKSA9PiBsaW5lLnRyaW0oKSlcclxuICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUgJiYgIWxpbmUuc3RhcnRzV2l0aChcIiNcIikpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBmZXRjaERlZmF1bHRSYW5kb21RdWVzdGlvbnNUZXh0KCkge1xyXG4gIGNvbnN0IGdldFVpTGFuZ3VhZ2UgPSB3aW5kb3cuX19RU0hPVF9JMThOX18/LmdldFVpTGFuZ3VhZ2U7XHJcbiAgY29uc3QgbGFuZyA9IChnZXRVaUxhbmd1YWdlPy4oKSB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gIGNvbnN0IHBhdGggPSBsYW5nLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFJBTkRPTV9RVUVTVElPTlNfRklMRVMuemggOiBSQU5ET01fUVVFU1RJT05TX0ZJTEVTLmVuO1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChjaHJvbWUucnVudGltZS5nZXRVUkwocGF0aCkpO1xyXG4gICAgcmV0dXJuIHJlcy5vayA/IGF3YWl0IHJlcy50ZXh0KCkgOiBcIlwiO1xyXG4gIH0gY2F0Y2ggKF9lKSB7XHJcbiAgICByZXR1cm4gXCJcIjtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvYWRSYW5kb21RdWVzdGlvbnMoKSB7XHJcbiAgaWYgKHJhbmRvbVF1ZXN0aW9uc1Byb21pc2UpIHJldHVybiByYW5kb21RdWVzdGlvbnNQcm9taXNlO1xyXG4gIHJhbmRvbVF1ZXN0aW9uc1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2V0VWlMYW5ndWFnZSA9IHdpbmRvdy5fX1FTSE9UX0kxOE5fXz8uZ2V0VWlMYW5ndWFnZTtcclxuICAgIGNvbnN0IHVpTGFuZyA9IChnZXRVaUxhbmd1YWdlPy4oKSB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgY29uc3QgY3VycmVudERlZmF1bHRUZXh0ID0gYXdhaXQgZmV0Y2hEZWZhdWx0UmFuZG9tUXVlc3Rpb25zVGV4dCgpO1xyXG4gICAgY29uc3Qgb3RoZXJQYXRoID0gdWlMYW5nLnN0YXJ0c1dpdGgoXCJ6aFwiKSA/IFJBTkRPTV9RVUVTVElPTlNfRklMRVMuZW4gOiBSQU5ET01fUVVFU1RJT05TX0ZJTEVTLnpoO1xyXG4gICAgbGV0IG90aGVyRGVmYXVsdFRleHQgPSBcIlwiO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKG90aGVyUGF0aCkpO1xyXG4gICAgICBvdGhlckRlZmF1bHRUZXh0ID0gcmVzLm9rID8gYXdhaXQgcmVzLnRleHQoKSA6IFwiXCI7XHJcbiAgICB9IGNhdGNoIChfZSkge1xyXG4gICAgICBvdGhlckRlZmF1bHRUZXh0ID0gXCJcIjtcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWV0pO1xyXG4gICAgICBjb25zdCByYXcgPSBzdG9yZWRbUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWV07XHJcbiAgICAgIGNvbnN0IGlzT2xkRGVmYXVsdCA9IHR5cGVvZiByYXcgPT09IFwic3RyaW5nXCIgJiYgcmF3LnRyaW1TdGFydCgpLnN0YXJ0c1dpdGgoXCIjXCIpO1xyXG4gICAgICBjb25zdCBoYXNDdXN0b21UZXh0ID0gdHlwZW9mIHJhdyA9PT0gXCJzdHJpbmdcIiAmJiByYXcudHJpbSgpLmxlbmd0aCA+IDA7XHJcbiAgICAgIGNvbnN0IGlzT3RoZXJMYW5nRGVmYXVsdCA9IGhhc0N1c3RvbVRleHQgJiYgcmF3LnRyaW0oKSA9PT0gb3RoZXJEZWZhdWx0VGV4dC50cmltKCk7XHJcbiAgICAgIGlmIChoYXNDdXN0b21UZXh0ICYmICFpc09sZERlZmF1bHQgJiYgIWlzT3RoZXJMYW5nRGVmYXVsdCkge1xyXG4gICAgICAgIHJldHVybiBwYXJzZVJhbmRvbVF1ZXN0aW9uc1RleHQocmF3KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoX2UpIHtcclxuICAgICAgLyogZmFsbGJhY2sgKi9cclxuICAgIH1cclxuICAgIHJldHVybiBwYXJzZVJhbmRvbVF1ZXN0aW9uc1RleHQoY3VycmVudERlZmF1bHRUZXh0KTtcclxuICB9KSgpO1xyXG4gIHJldHVybiByYW5kb21RdWVzdGlvbnNQcm9taXNlO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmlsbFJhbmRvbVF1ZXN0aW9uKCkge1xyXG4gIGNvbnN0IHF1ZXN0aW9ucyA9IGF3YWl0IGxvYWRSYW5kb21RdWVzdGlvbnMoKTtcclxuICBpZiAoIXF1ZXN0aW9ucy5sZW5ndGgpIHJldHVybjtcclxuICBjb25zdCB7IHF1ZXJ5SW5wdXQgfSA9IHN0YXRlLmRvbTtcclxuICBpZiAoIXF1ZXJ5SW5wdXQpIHJldHVybjtcclxuICBsZXQgaWR4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogcXVlc3Rpb25zLmxlbmd0aCk7XHJcbiAgaWYgKHF1ZXN0aW9ucy5sZW5ndGggPiAxICYmIGlkeCA9PT0gbGFzdFJhbmRvbVF1ZXN0aW9uSW5kZXgpIHtcclxuICAgIGlkeCA9IChpZHggKyAxICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKHF1ZXN0aW9ucy5sZW5ndGggLSAxKSkpICUgcXVlc3Rpb25zLmxlbmd0aDtcclxuICB9XHJcbiAgbGFzdFJhbmRvbVF1ZXN0aW9uSW5kZXggPSBpZHg7XHJcbiAgcXVlcnlJbnB1dC52YWx1ZSA9IHF1ZXN0aW9uc1tpZHhdO1xyXG4gIHN0YXRlLnN5bmNDb21wb3NlckxheW91dCgpO1xyXG4gIHF1ZXJ5SW5wdXQuZm9jdXMoKTtcclxufVxyXG5cclxuLy8g4pSA4pSAIFNlYXJjaCBncm91cHMgKyB0b29sdGlwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxyXG5sZXQgX2dyb3VwVG9vbHRpcEVsID0gbnVsbDtcclxubGV0IF9ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7XHJcbmxldCBfZ3JvdXBUb29sdGlwSGlkZVRpbWVyID0gbnVsbDtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJHcm91cHMoKSB7XHJcbiAgY29uc3QgeyBncm91cHNDb250YWluZXIgfSA9IHN0YXRlLmRvbTtcclxuICBpZiAoIWdyb3Vwc0NvbnRhaW5lcikgcmV0dXJuO1xyXG4gIGdyb3Vwc0NvbnRhaW5lci5pbm5lckhUTUwgPSBcIlwiO1xyXG4gIGdyb3Vwc0NvbnRhaW5lci5oaWRkZW4gPSBzdGF0ZS5ncm91cHMubGVuZ3RoID09PSAwO1xyXG5cclxuICBzdGF0ZS5ncm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcclxuICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICBidXR0b24uY2xhc3NOYW1lID0gXCJwb3B1cC1ncm91cC1idG5cIjtcclxuICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGJ1dHRvbi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJwb3B1cC1ncm91cC1uYW1lXCI+JHtlc2NhcGVIdG1sKGdyb3VwLm5hbWUpfTwvc3Bhbj5gO1xyXG5cclxuICAgIGNvbnN0IGdyb3VwU2l0ZXMgPSBnZXRHcm91cFNpdGVzKGdyb3VwKTtcclxuICAgIGlmIChncm91cFNpdGVzLmxlbmd0aCkge1xyXG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4gc2hvd0dyb3VwVG9vbHRpcChidXR0b24sIGdyb3VwU2l0ZXMpKTtcclxuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHNjaGVkdWxlSGlkZUdyb3VwVG9vbHRpcCgpKTtcclxuICAgIH1cclxuICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgICBoaWRlR3JvdXBUb29sdGlwKCk7XHJcbiAgICAgIGF3YWl0IHJ1bkdyb3VwKGdyb3VwKTtcclxuICAgIH0pO1xyXG4gICAgZ3JvdXBzQ29udGFpbmVyLmFwcGVuZENoaWxkKGJ1dHRvbik7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldE9yQ3JlYXRlR3JvdXBUb29sdGlwKCkge1xyXG4gIGlmICghX2dyb3VwVG9vbHRpcEVsKSB7XHJcbiAgICBfZ3JvdXBUb29sdGlwRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgX2dyb3VwVG9vbHRpcEVsLmNsYXNzTmFtZSA9IFwiZ3JvdXAtdG9vbHRpcFwiO1xyXG4gICAgX2dyb3VwVG9vbHRpcEVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWVudGVyXCIsICgpID0+IHtcclxuICAgICAgaWYgKF9ncm91cFRvb2x0aXBIaWRlVGltZXIpIHtcclxuICAgICAgICBjbGVhclRpbWVvdXQoX2dyb3VwVG9vbHRpcEhpZGVUaW1lcik7XHJcbiAgICAgICAgX2dyb3VwVG9vbHRpcEhpZGVUaW1lciA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgX2dyb3VwVG9vbHRpcEVsLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWxlYXZlXCIsICgpID0+IHNjaGVkdWxlSGlkZUdyb3VwVG9vbHRpcCgpKTtcclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoX2dyb3VwVG9vbHRpcEVsKTtcclxuICB9XHJcbiAgcmV0dXJuIF9ncm91cFRvb2x0aXBFbDtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0R3JvdXBTaXRlcyhncm91cCkge1xyXG4gIHJldHVybiAoZ3JvdXAuc2l0ZUlkcyB8fCBbXSlcclxuICAgIC5tYXAoKGlkKSA9PiBzdGF0ZS5hbGxTaXRlcy5maW5kKChzaXRlKSA9PiBzaXRlLmlkID09PSBpZCkpXHJcbiAgICAuZmlsdGVyKChzaXRlKSA9PiBzaXRlICYmIG5vcm1hbGl6ZVNpdGVIb21lVXJsKHNpdGUudXJsKSlcclxuICAgIC5tYXAoKHNpdGUpID0+ICh7XHJcbiAgICAgIGlkOiBzaXRlLmlkLFxyXG4gICAgICBuYW1lOiBzaXRlLm5hbWUgfHwgc2l0ZS5pZCxcclxuICAgICAgdXJsOiBub3JtYWxpemVTaXRlSG9tZVVybChzaXRlLnVybCksXHJcbiAgICB9KSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNob3dHcm91cFRvb2x0aXAoYnV0dG9uLCBzaXRlcykge1xyXG4gIGlmIChfZ3JvdXBUb29sdGlwVGltZXIpIHsgY2xlYXJUaW1lb3V0KF9ncm91cFRvb2x0aXBUaW1lcik7IF9ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7IH1cclxuICBpZiAoX2dyb3VwVG9vbHRpcEhpZGVUaW1lcikgeyBjbGVhclRpbWVvdXQoX2dyb3VwVG9vbHRpcEhpZGVUaW1lcik7IF9ncm91cFRvb2x0aXBIaWRlVGltZXIgPSBudWxsOyB9XHJcbiAgX2dyb3VwVG9vbHRpcFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICBjb25zdCB0b29sdGlwID0gZ2V0T3JDcmVhdGVHcm91cFRvb2x0aXAoKTtcclxuICAgIHJlbmRlckdyb3VwVG9vbHRpcFNpdGVzKHRvb2x0aXAsIHNpdGVzKTtcclxuICAgIHRvb2x0aXAuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgIGNvbnN0IGJ0blJlY3QgPSBidXR0b24uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIGNvbnN0IHRvb2x0aXBXID0gdG9vbHRpcC5vZmZzZXRXaWR0aDtcclxuICAgICAgY29uc3QgdG9vbHRpcEggPSB0b29sdGlwLm9mZnNldEhlaWdodDtcclxuICAgICAgbGV0IGxlZnQgPSBidG5SZWN0LmxlZnQgKyBidG5SZWN0LndpZHRoIC8gMiAtIHRvb2x0aXBXIC8gMjtcclxuICAgICAgaWYgKGxlZnQgPCA0KSBsZWZ0ID0gNDtcclxuICAgICAgaWYgKGxlZnQgKyB0b29sdGlwVyA+IHdpbmRvdy5pbm5lcldpZHRoIC0gNCkgbGVmdCA9IHdpbmRvdy5pbm5lcldpZHRoIC0gdG9vbHRpcFcgLSA0O1xyXG4gICAgICBsZXQgdG9wID0gYnRuUmVjdC50b3AgLSB0b29sdGlwSCAtIDg7XHJcbiAgICAgIGlmICh0b3AgPCA0KSB0b3AgPSBidG5SZWN0LmJvdHRvbSArIDg7XHJcbiAgICAgIHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xyXG4gICAgICB0b29sdGlwLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XHJcbiAgICB9KTtcclxuICB9LCA0NTApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoaWRlR3JvdXBUb29sdGlwKCkge1xyXG4gIGlmIChfZ3JvdXBUb29sdGlwVGltZXIpIHsgY2xlYXJUaW1lb3V0KF9ncm91cFRvb2x0aXBUaW1lcik7IF9ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7IH1cclxuICBpZiAoX2dyb3VwVG9vbHRpcEhpZGVUaW1lcikgeyBjbGVhclRpbWVvdXQoX2dyb3VwVG9vbHRpcEhpZGVUaW1lcik7IF9ncm91cFRvb2x0aXBIaWRlVGltZXIgPSBudWxsOyB9XHJcbiAgaWYgKF9ncm91cFRvb2x0aXBFbCkgX2dyb3VwVG9vbHRpcEVsLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gc2NoZWR1bGVIaWRlR3JvdXBUb29sdGlwKCkge1xyXG4gIGlmIChfZ3JvdXBUb29sdGlwVGltZXIpIHsgY2xlYXJUaW1lb3V0KF9ncm91cFRvb2x0aXBUaW1lcik7IF9ncm91cFRvb2x0aXBUaW1lciA9IG51bGw7IH1cclxuICBpZiAoX2dyb3VwVG9vbHRpcEhpZGVUaW1lcikgY2xlYXJUaW1lb3V0KF9ncm91cFRvb2x0aXBIaWRlVGltZXIpO1xyXG4gIF9ncm91cFRvb2x0aXBIaWRlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgIGlmIChfZ3JvdXBUb29sdGlwRWwpIF9ncm91cFRvb2x0aXBFbC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgfSwgMTgwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyR3JvdXBUb29sdGlwU2l0ZXModG9vbHRpcCwgc2l0ZXMpIHtcclxuICB0b29sdGlwLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgY29uc3QgY29sdW1ucyA9IE1hdGgubWluKDUsIE1hdGgubWF4KDEsIHNpdGVzLmxlbmd0aCkpO1xyXG4gIGxpc3QuY2xhc3NOYW1lID0gXCJncm91cC10b29sdGlwLWxpc3RcIjtcclxuICBsaXN0LnN0eWxlLmdyaWRUZW1wbGF0ZUNvbHVtbnMgPSBgcmVwZWF0KCR7Y29sdW1uc30sIG1heC1jb250ZW50KWA7XHJcbiAgY29uc3QgbWF4SXRlbVdpZHRoID0gZ2V0VG9vbHRpcEl0ZW1NYXhXaWR0aCh0b29sdGlwLCBzaXRlcywgY29sdW1ucyk7XHJcbiAgaWYgKG1heEl0ZW1XaWR0aCkge1xyXG4gICAgbGlzdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZ3JvdXAtdG9vbHRpcC1pdGVtLW1heC13aWR0aFwiLCBgJHttYXhJdGVtV2lkdGh9cHhgKTtcclxuICB9XHJcbiAgc2l0ZXMuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgICBpdGVtLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gICAgaXRlbS5jbGFzc05hbWUgPSBcImdyb3VwLXRvb2x0aXAtaXRlbVwiO1xyXG4gICAgaXRlbS50ZXh0Q29udGVudCA9IHNpdGUubmFtZTtcclxuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChldmVudCkgPT4ge1xyXG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgaGlkZUdyb3VwVG9vbHRpcCgpO1xyXG4gICAgICBhd2FpdCBvcGVuU2l0ZUhvbWUoc2l0ZS51cmwpO1xyXG4gICAgfSk7XHJcbiAgICBsaXN0LmFwcGVuZENoaWxkKGl0ZW0pO1xyXG4gIH0pO1xyXG4gIHRvb2x0aXAuYXBwZW5kQ2hpbGQobGlzdCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFRvb2x0aXBJdGVtTWF4V2lkdGgodG9vbHRpcCwgc2l0ZXMsIGNvbHVtbnMpIHtcclxuICBjb25zdCBhdmFpbGFibGVXaWR0aCA9IE1hdGgubWF4KDE2MCwgd2luZG93LmlubmVyV2lkdGggLSAyOCk7XHJcbiAgY29uc3QgZ2FwV2lkdGggPSA2O1xyXG4gIGNvbnN0IGJ1dHRvbldpZHRocyA9IHNpdGVzLm1hcCgoc2l0ZSkgPT4gZXN0aW1hdGVUb29sdGlwQnV0dG9uV2lkdGgodG9vbHRpcCwgc2l0ZS5uYW1lKSk7XHJcblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYnV0dG9uV2lkdGhzLmxlbmd0aDsgaSArPSBjb2x1bW5zKSB7XHJcbiAgICBjb25zdCByb3dXaWR0aHMgPSBidXR0b25XaWR0aHMuc2xpY2UoaSwgaSArIGNvbHVtbnMpO1xyXG4gICAgY29uc3Qgcm93V2lkdGggPSByb3dXaWR0aHMucmVkdWNlKChzdW0sIHdpZHRoKSA9PiBzdW0gKyB3aWR0aCwgMCkgKyBnYXBXaWR0aCAqIE1hdGgubWF4KDAsIHJvd1dpZHRocy5sZW5ndGggLSAxKTtcclxuICAgIGlmIChyb3dXaWR0aCA+IGF2YWlsYWJsZVdpZHRoKSB7XHJcbiAgICAgIHJldHVybiBNYXRoLmZsb29yKChhdmFpbGFibGVXaWR0aCAtIGdhcFdpZHRoICogKGNvbHVtbnMgLSAxKSkgLyBjb2x1bW5zKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiAwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBlc3RpbWF0ZVRvb2x0aXBCdXR0b25XaWR0aCh0b29sdGlwLCBsYWJlbCkge1xyXG4gIGNvbnN0IGNhbnZhcyA9IGVzdGltYXRlVG9vbHRpcEJ1dHRvbldpZHRoLmNhbnZhcyB8fCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xyXG4gIGVzdGltYXRlVG9vbHRpcEJ1dHRvbldpZHRoLmNhbnZhcyA9IGNhbnZhcztcclxuICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG4gIGlmICghY3R4KSByZXR1cm4gODA7XHJcbiAgY3R4LmZvbnQgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSh0b29sdGlwKS5mb250IHx8IFwiMTJweCBNaWNyb3NvZnQgWWFIZWkgVUlcIjtcclxuICByZXR1cm4gTWF0aC5jZWlsKGN0eC5tZWFzdXJlVGV4dChTdHJpbmcobGFiZWwgfHwgXCJcIikpLndpZHRoKSArIDIwO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBvcGVuU2l0ZUhvbWUodXJsKSB7XHJcbiAgY29uc3Qgc2FmZVVybCA9IG5vcm1hbGl6ZVNpdGVIb21lVXJsKHVybCk7XHJcbiAgaWYgKCFzYWZlVXJsKSByZXR1cm47XHJcbiAgdHJ5IHtcclxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJPUEVOX0VYVEVSTkFMX1VSTFwiLCB1cmw6IHNhZmVVcmwgfSk7XHJcbiAgfSBjYXRjaCAoX2Vycikge1xyXG4gICAgLyogaWdub3JlZCAqL1xyXG4gIH1cclxuICB3aW5kb3cuY2xvc2UoKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bkRlZmF1bHRTZWFyY2goKSB7XHJcbiAgaWYgKCFzdGF0ZS5ncm91cHMubGVuZ3RoKSByZXR1cm47XHJcbiAgYXdhaXQgcnVuR3JvdXAoc3RhdGUuZ3JvdXBzWzBdKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcnVuR3JvdXAoZ3JvdXApIHtcclxuICBjb25zdCB7IHF1ZXJ5SW5wdXQgfSA9IHN0YXRlLmRvbTtcclxuICBjb25zdCBxdWVyeSA9IHF1ZXJ5SW5wdXQgPyBxdWVyeUlucHV0LnZhbHVlLnRyaW0oKSA6IFwiXCI7XHJcbiAgY2hyb21lLnJ1bnRpbWVcclxuICAgIC5zZW5kTWVzc2FnZSh7IHR5cGU6IFwiUlVOX1NFQVJDSF9HUk9VUFwiLCBncm91cCwgcXVlcnkgfSlcclxuICAgIC5jYXRjaCgoKSA9PiB7fSk7XHJcbiAgd2luZG93LmNsb3NlKCk7XHJcbn1cclxuXHJcbi8vIOKUgOKUgCBIaXN0b3J5IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxyXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVySGlzdG9yeShoaXN0b3J5KSB7XHJcbiAgY29uc3QgeyBoaXN0b3J5TGlzdCwgcXVlcnlJbnB1dCB9ID0gc3RhdGUuZG9tO1xyXG4gIGlmICghaGlzdG9yeUxpc3QpIHJldHVybjtcclxuICBoaXN0b3J5TGlzdC5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICBpZiAoaGlzdG9yeS5sZW5ndGggPT09IDApIHtcclxuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVtcHR5LmNsYXNzTmFtZSA9IFwicG9wdXAtaGlzdG9yeS1lbXB0eVwiO1xyXG4gICAgZW1wdHkudGV4dENvbnRlbnQgPSBtc2coXCJwb3B1cF9lbXB0eUhpc3RvcnlcIiwgXCLmmoLml6DmkJzntKLorrDlvZVcIik7XHJcbiAgICBoaXN0b3J5TGlzdC5hcHBlbmRDaGlsZChlbXB0eSk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBoaXN0b3J5LmZvckVhY2goKGVudHJ5KSA9PiB7XHJcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGl0ZW0udHlwZSA9IFwiYnV0dG9uXCI7XHJcbiAgICBpdGVtLmNsYXNzTmFtZSA9IFwicG9wdXAtaGlzdG9yeS1pdGVtXCI7XHJcbiAgICBjb25zdCBxdWVyeSA9IFN0cmluZyhlbnRyeS5xdWVyeSB8fCBcIlwiKS5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKS50cmltKCk7XHJcbiAgICBjb25zdCBkYXRlVGV4dCA9IGZvcm1hdEhpc3RvcnlEYXRlKGVudHJ5LmNyZWF0ZWRBdCk7XHJcbiAgICBpdGVtLmlubmVySFRNTCA9IGBcclxuICAgICAgPGRpdiBjbGFzcz1cInBvcHVwLWhpc3RvcnktbGluZVwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJwb3B1cC1oaXN0b3J5LXF1ZXJ5XCI+JHtlc2NhcGVIdG1sKHF1ZXJ5KX08L2Rpdj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicG9wdXAtaGlzdG9yeS1tZXRhXCI+JHtlc2NhcGVIdG1sKGRhdGVUZXh0KX08L2Rpdj5cclxuICAgICAgPC9kaXY+XHJcbiAgICAgIDxidXR0b24gY2xhc3M9XCJwb3B1cC1oaXN0b3J5LWRlbGV0ZS1idG5cIiB0eXBlPVwiYnV0dG9uXCIgYXJpYS1sYWJlbD1cIiR7bXNnKFwicG9wdXBfZGVsZXRlSGlzdG9yeUVudHJ5XCIsIFwi5Yig6Zmk6L+Z5p2h6K6w5b2VXCIpfVwiPsOXPC9idXR0b24+XHJcbiAgICBgO1xyXG4gICAgY29uc3QgZGVsZXRlQnRuID0gaXRlbS5xdWVyeVNlbGVjdG9yKFwiLnBvcHVwLWhpc3RvcnktZGVsZXRlLWJ0blwiKTtcclxuICAgIGlmIChkZWxldGVCdG4pIHtcclxuICAgICAgZGVsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgIGF3YWl0IHJlbW92ZUhpc3RvcnlFbnRyeShlbnRyeSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBpZiAocXVlcnlJbnB1dCkge1xyXG4gICAgICAgIHF1ZXJ5SW5wdXQudmFsdWUgPSBlbnRyeS5xdWVyeSB8fCBcIlwiO1xyXG4gICAgICAgIHF1ZXJ5SW5wdXQuZm9jdXMoKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBoaXN0b3J5TGlzdC5hcHBlbmRDaGlsZChpdGVtKTtcclxuICB9KTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gcmVtb3ZlSGlzdG9yeUVudHJ5KGVudHJ5KSB7XHJcbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWV0pO1xyXG4gIGNvbnN0IGZ1bGxIaXN0b3J5ID0gQXJyYXkuaXNBcnJheShzdG9yZWRbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldKVxyXG4gICAgPyBzdG9yZWRbU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVldXHJcbiAgICA6IFtdO1xyXG4gIGlmICghZnVsbEhpc3RvcnkubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gIGxldCByZW1vdmVkID0gZmFsc2U7XHJcbiAgY29uc3QgbmV4dEhpc3RvcnkgPSBmdWxsSGlzdG9yeS5maWx0ZXIoKGl0ZW0pID0+IHtcclxuICAgIGlmIChyZW1vdmVkKSByZXR1cm4gdHJ1ZTtcclxuICAgIGlmIChlbnRyeT8uaWQgJiYgaXRlbT8uaWQgPT09IGVudHJ5LmlkKSB7XHJcbiAgICAgIHJlbW92ZWQgPSB0cnVlO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBpZiAoIWVudHJ5Py5pZCAmJiBpdGVtPy5xdWVyeSA9PT0gZW50cnk/LnF1ZXJ5ICYmIGl0ZW0/LmNyZWF0ZWRBdCA9PT0gZW50cnk/LmNyZWF0ZWRBdCkge1xyXG4gICAgICByZW1vdmVkID0gdHJ1ZTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfSk7XHJcblxyXG4gIGlmICghcmVtb3ZlZCkgcmV0dXJuO1xyXG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWV06IG5leHRIaXN0b3J5IH0pO1xyXG59XHJcblxyXG4vLyDilIDilIAgUHJvbXB0IHBpY2tlciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcclxuZXhwb3J0IGZ1bmN0aW9uIGNsb3NlUHJvbXB0UGlja2VyKCkge1xyXG4gIGlmICghc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuKSByZXR1cm47XHJcbiAgc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuID0gZmFsc2U7XHJcbiAgaWYgKHN0YXRlLnBvcHVwUHJldmlld01ncikgc3RhdGUucG9wdXBQcmV2aWV3TWdyLmhpZGUoKTtcclxuICByZW5kZXJQcm9tcHRQaWNrZXIoKTtcclxuICBzdGF0ZS51cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZSgpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlUHJvbXB0UGlja2VyKCkge1xyXG4gIHN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbiA9ICFzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW47XHJcbiAgcmVuZGVyUHJvbXB0UGlja2VyKCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJQcm9tcHRQaWNrZXIoKSB7XHJcbiAgc3RhdGUudXBkYXRlUHJvbXB0UGlja2VyTGF5b3V0U3RhdGUoKTtcclxuICBjb25zdCB7IHByb21wdFBpY2tlciwgcHJvbXB0RW50cnlCdG4sIHF1ZXJ5SW5wdXQgfSA9IHN0YXRlLmRvbTtcclxuXHJcbiAgaWYgKCFwcm9tcHRQaWNrZXIgfHwgIXByb21wdEVudHJ5QnRuIHx8IHN0YXRlLnVpUHJlZnMuc2hvd1Byb21wdEJ1dHRvbiA9PT0gZmFsc2UpIHtcclxuICAgIGlmIChwcm9tcHRQaWNrZXIpIHByb21wdFBpY2tlci5oaWRkZW4gPSB0cnVlO1xyXG4gICAgc3RhdGUudXBkYXRlUHJvbXB0UGlja2VyTGF5b3V0U3RhdGUoKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIHByb21wdFBpY2tlci5pbm5lckhUTUwgPSBcIlwiO1xyXG4gIHByb21wdEVudHJ5QnRuLnNldEF0dHJpYnV0ZShcImFyaWEtZXhwYW5kZWRcIiwgU3RyaW5nKHN0YXRlLmlzUHJvbXB0UGlja2VyT3BlbikpO1xyXG5cclxuICBpZiAoIXN0YXRlLmlzUHJvbXB0UGlja2VyT3Blbikge1xyXG4gICAgcHJvbXB0UGlja2VyLmhpZGRlbiA9IHRydWU7XHJcbiAgICBzdGF0ZS51cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZSgpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgcHJvbXB0UGlja2VyLmhpZGRlbiA9IGZhbHNlO1xyXG5cclxuICBpZiAoIXN0YXRlLnByb21wdEdyb3Vwcy5sZW5ndGgpIHtcclxuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGVtcHR5LmNsYXNzTmFtZSA9IFwicG9wdXAtcHJvbXB0LXBpY2tlci1lbXB0eVwiO1xyXG4gICAgZW1wdHkudGV4dENvbnRlbnQgPSBtc2coXCJwb3B1cF9lbXB0eVByb21wdEdyb3Vwc1wiLCBcIui/mOayoeacieaPkOekuuivjeWIhue7hO+8jOivt+WFiOWOu+iuvue9rumHjOa3u+WKoOOAglwiKTtcclxuICAgIHByb21wdFBpY2tlci5hcHBlbmRDaGlsZChlbXB0eSk7XHJcbiAgICBzdGF0ZS51cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZSgpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgYWN0aXZlR3JvdXAgPVxyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGdyb3VwKSA9PiBncm91cC5pZCA9PT0gc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCkgfHxcclxuICAgIHN0YXRlLnByb21wdEdyb3Vwc1swXTtcclxuICBpZiAoIWFjdGl2ZUdyb3VwKSB7XHJcbiAgICBzdGF0ZS51cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZSgpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZ3JvdXBzQ29sdW1uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBncm91cHNDb2x1bW4uY2xhc3NOYW1lID0gXCJwb3B1cC1wcm9tcHQtZ3JvdXBzXCI7XHJcblxyXG4gIHN0YXRlLnByb21wdEdyb3Vwcy5mb3JFYWNoKChncm91cCkgPT4ge1xyXG4gICAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcclxuICAgIGJ1dHRvbi5kYXRhc2V0Lmdyb3VwSWQgPSBncm91cC5pZDtcclxuICAgIGJ1dHRvbi5jbGFzc05hbWUgPSBgcG9wdXAtcHJvbXB0LWdyb3VwLWl0ZW0ke2dyb3VwLmlkID09PSBhY3RpdmVHcm91cC5pZCA/IFwiIGlzLWFjdGl2ZVwiIDogXCJcIn1gO1xyXG4gICAgYnV0dG9uLnRleHRDb250ZW50ID0gZ2V0UHJvbXB0R3JvdXBEaXNwbGF5TmFtZShncm91cCk7XHJcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlZW50ZXJcIiwgKCkgPT4ge1xyXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9PT0gZ3JvdXAuaWQpIHJldHVybjtcclxuICAgICAgc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCA9IGdyb3VwLmlkO1xyXG4gICAgICBzd2l0Y2hQb3B1cFByb21wdEdyb3VwKHN0YXRlLCBwcm9tcHRQaWNrZXIsIHF1ZXJ5SW5wdXQpO1xyXG4gICAgfSk7XHJcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgaWYgKHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPT09IGdyb3VwLmlkKSByZXR1cm47XHJcbiAgICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBncm91cC5pZDtcclxuICAgICAgc3dpdGNoUG9wdXBQcm9tcHRHcm91cChzdGF0ZSwgcHJvbXB0UGlja2VyLCBxdWVyeUlucHV0KTtcclxuICAgIH0pO1xyXG4gICAgZ3JvdXBzQ29sdW1uLmFwcGVuZENoaWxkKGJ1dHRvbik7XHJcbiAgfSk7XHJcblxyXG4gIHByb21wdFBpY2tlci5hcHBlbmRDaGlsZChncm91cHNDb2x1bW4pO1xyXG4gIHByb21wdFBpY2tlci5hcHBlbmRDaGlsZChidWlsZFBvcHVwUHJvbXB0c0NvbHVtbihzdGF0ZSwgYWN0aXZlR3JvdXAsIHF1ZXJ5SW5wdXQpKTtcclxuXHJcbiAgY29uc3QgZm9vdGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBmb290ZXIuY2xhc3NOYW1lID0gXCJwb3B1cC1wcm9tcHQtcGlja2VyLWZvb3RlclwiO1xyXG4gIGNvbnN0IHNldHRpbmdzTGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XHJcbiAgc2V0dGluZ3NMaW5rLnR5cGUgPSBcImJ1dHRvblwiO1xyXG4gIHNldHRpbmdzTGluay5jbGFzc05hbWUgPSBcInBvcHVwLXByb21wdC1waWNrZXItc2V0dGluZ3MtYnRuXCI7XHJcbiAgc2V0dGluZ3NMaW5rLmlubmVySFRNTCA9IGA8c3ZnIHdpZHRoPVwiMTFcIiBoZWlnaHQ9XCIxMVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjEuOFwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTIgMTVhMyAzIDAgMSAwIDAtNiAzIDMgMCAwIDAgMCA2WlwiLz48cGF0aCBkPVwiTTE5LjQgMTVhMS42NSAxLjY1IDAgMCAwIC4zMyAxLjgybC4wNi4wNmEyIDIgMCAwIDEtMi44MyAyLjgzbC0uMDYtLjA2YTEuNjUgMS42NSAwIDAgMC0xLjgyLS4zMyAxLjY1IDEuNjUgMCAwIDAtMSAxLjUxVjIxYTIgMiAwIDAgMS00IDB2LS4wOUExLjY1IDEuNjUgMCAwIDAgOSAxOS40YTEuNjUgMS42NSAwIDAgMC0xLjgyLjMzbC0uMDYuMDZhMiAyIDAgMCAxLTIuODMtMi44M2wuMDYtLjA2QTEuNjUgMS42NSAwIDAgMCA0LjY4IDE1YTEuNjUgMS42NSAwIDAgMC0xLjUxLTFIM2EyIDIgMCAwIDEgMC00aC4wOUExLjY1IDEuNjUgMCAwIDAgNC42IDlhMS42NSAxLjY1IDAgMCAwLS4zMy0xLjgybC0uMDYtLjA2YTIgMiAwIDAgMSAyLjgzLTIuODNsLjA2LjA2QTEuNjUgMS42NSAwIDAgMCA5IDQuNjhhMS42NSAxLjY1IDAgMCAwIDEtMS41MVYzYTIgMiAwIDAgMSA0IDB2LjA5YTEuNjUgMS42NSAwIDAgMCAxIDEuNTEgMS42NSAxLjY1IDAgMCAwIDEuODItLjMzbC4wNi0uMDZhMiAyIDAgMCAxIDIuODMgMi44M2wtLjA2LjA2QTEuNjUgMS42NSAwIDAgMCAxOS40IDlhMS42NSAxLjY1IDAgMCAwIDEuNTEgMUgyMWEyIDIgMCAwIDEgMCA0aC0uMDlhMS42NSAxLjY1IDAgMCAwLTEuNTEgMVpcIi8+PC9zdmc+JHttc2coXCJwb3B1cF9tYW5hZ2VQcm9tcHRzXCIsIFwi566h55CG5o+Q56S66K+NXCIpfWA7XHJcbiAgc2V0dGluZ3NMaW5rLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZSkgPT4ge1xyXG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJPUEVOX1NFVFRJTkdTX1BBR0VcIiwgc2VjdGlvbjogXCJwcm9tcHRzXCIgfSk7XHJcbiAgICB3aW5kb3cuY2xvc2UoKTtcclxuICB9KTtcclxuICBmb290ZXIuYXBwZW5kQ2hpbGQoc2V0dGluZ3NMaW5rKTtcclxuICBwcm9tcHRQaWNrZXIuYXBwZW5kQ2hpbGQoZm9vdGVyKTtcclxuXHJcbiAgc3RhdGUudXBkYXRlUHJvbXB0UGlja2VyTGF5b3V0U3RhdGUoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRQb3B1cFByb21wdHNDb2x1bW4oc3RhdGUsIGFjdGl2ZUdyb3VwLCBxdWVyeUlucHV0KSB7XHJcbiAgY29uc3QgcHJvbXB0c0NvbHVtbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgcHJvbXB0c0NvbHVtbi5jbGFzc05hbWUgPSBcInBvcHVwLXByb21wdC1saXN0XCI7XHJcblxyXG4gIGNvbnN0IGVudHJpZXMgPSBnZXREaXNwbGF5UHJvbXB0RW50cmllcyhhY3RpdmVHcm91cCwgc3RhdGUucHJvbXB0R3JvdXBzKTtcclxuICBpZiAoIWVudHJpZXMubGVuZ3RoKSB7XHJcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBlbXB0eS5jbGFzc05hbWUgPSBcInBvcHVwLXByb21wdC1waWNrZXItZW1wdHlcIjtcclxuICAgIGVtcHR5LnRleHRDb250ZW50ID0gaXNBbGxQcm9tcHRHcm91cChhY3RpdmVHcm91cClcclxuICAgICAgPyBtc2coXCJwb3B1cF9lbXB0eVByb21wdHNcIiwgXCLov5jmsqHmnInmj5DnpLror43vvIzor7flhYjljrvorr7nva7ph4zmt7vliqDjgIJcIilcclxuICAgICAgOiBtc2coXCJwb3B1cF9lbXB0eVByb21wdHNJbkdyb3VwXCIsIFwi6L+Z5Liq5YiG57uE6YeM6L+Y5rKh5pyJ5o+Q56S66K+N44CCXCIpO1xyXG4gICAgcHJvbXB0c0NvbHVtbi5hcHBlbmRDaGlsZChlbXB0eSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHN0YXRlLnBvcHVwUHJldmlld01nciA9XHJcbiAgICAgIHN0YXRlLnBvcHVwUHJldmlld01nciB8fCB3aW5kb3cuUHJvbXB0SXRlbVVJLmNyZWF0ZVByZXZpZXdNYW5hZ2VyKG51bGwpO1xyXG4gICAgZW50cmllcy5mb3JFYWNoKCh7IHByb21wdCwgc291cmNlR3JvdXAgfSkgPT4ge1xyXG4gICAgICBjb25zdCBpdGVtID0gd2luZG93LlByb21wdEl0ZW1VSS5jcmVhdGVJdGVtKHByb21wdCwge1xyXG4gICAgICAgIG9uRmlsbDogKHApID0+IHtcclxuICAgICAgICAgIGlmIChxdWVyeUlucHV0KSB7XHJcbiAgICAgICAgICAgIHF1ZXJ5SW5wdXQudmFsdWUgPSBwLmNvbnRlbnQgfHwgXCJcIjtcclxuICAgICAgICAgICAgY2xvc2VQcm9tcHRQaWNrZXIoKTtcclxuICAgICAgICAgICAgc3RhdGUuc3luY0NvbXBvc2VyTGF5b3V0KHsgc2Nyb2xsVG9Ub3A6IHRydWUgfSk7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgcXVlcnlJbnB1dC5mb2N1cygpO1xyXG4gICAgICAgICAgICAgIHF1ZXJ5SW5wdXQuc2V0U2VsZWN0aW9uUmFuZ2UoMCwgMCk7XHJcbiAgICAgICAgICAgICAgcXVlcnlJbnB1dC5zY3JvbGxUb3AgPSAwO1xyXG4gICAgICAgICAgICAgIHN0YXRlLnN5bmNDb21wb3NlckxheW91dCh7IHNjcm9sbFRvVG9wOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIG9uRWRpdDogKHApID0+IG9wZW5Qb3B1cFByb21wdEVkaXRNb2RhbChwLCBzb3VyY2VHcm91cC5pZCksXHJcbiAgICAgICAgcHJldmlld01hbmFnZXI6IHN0YXRlLnBvcHVwUHJldmlld01ncixcclxuICAgICAgfSk7XHJcbiAgICAgIHByb21wdHNDb2x1bW4uYXBwZW5kQ2hpbGQoaXRlbSk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIHByb21wdHNDb2x1bW47XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN3aXRjaFBvcHVwUHJvbXB0R3JvdXAoc3RhdGUsIHByb21wdFBpY2tlciwgcXVlcnlJbnB1dCkge1xyXG4gIGlmICghcHJvbXB0UGlja2VyIHx8IHByb21wdFBpY2tlci5oaWRkZW4pIHJldHVybjtcclxuXHJcbiAgLy8g5Y+q5pu05paw5bem5L6n5YiG57G75oyJ6ZKu5r+A5rS754q25oCB77yM5LiN6YeN5bu65bem5L6nXHJcbiAgcHJvbXB0UGlja2VyLnF1ZXJ5U2VsZWN0b3JBbGwoXCIucG9wdXAtcHJvbXB0LWdyb3VwLWl0ZW1cIikuZm9yRWFjaCgoYnRuKSA9PiB7XHJcbiAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZShcImlzLWFjdGl2ZVwiLCBidG4uZGF0YXNldC5ncm91cElkID09PSBzdGF0ZS5hY3RpdmVQcm9tcHRHcm91cElkKTtcclxuICB9KTtcclxuXHJcbiAgLy8g5LuF5pu/5o2i5Y+z5L6n5o+Q56S66K+N5YiX6KGoXHJcbiAgY29uc3QgYWN0aXZlR3JvdXAgPVxyXG4gICAgc3RhdGUucHJvbXB0R3JvdXBzLmZpbmQoKGcpID0+IGcuaWQgPT09IHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQpIHx8IHN0YXRlLnByb21wdEdyb3Vwc1swXTtcclxuICBpZiAoIWFjdGl2ZUdyb3VwKSByZXR1cm47XHJcblxyXG4gIGNvbnN0IG9sZExpc3QgPSBwcm9tcHRQaWNrZXIucXVlcnlTZWxlY3RvcihcIi5wb3B1cC1wcm9tcHQtbGlzdFwiKTtcclxuICBjb25zdCBuZXdMaXN0ID0gYnVpbGRQb3B1cFByb21wdHNDb2x1bW4oc3RhdGUsIGFjdGl2ZUdyb3VwLCBxdWVyeUlucHV0KTtcclxuICBpZiAob2xkTGlzdCkge1xyXG4gICAgb2xkTGlzdC5yZXBsYWNlV2l0aChuZXdMaXN0KTtcclxuICB9IGVsc2Uge1xyXG4gICAgY29uc3QgZm9vdGVyID0gcHJvbXB0UGlja2VyLnF1ZXJ5U2VsZWN0b3IoXCIucG9wdXAtcHJvbXB0LXBpY2tlci1mb290ZXJcIik7XHJcbiAgICBwcm9tcHRQaWNrZXIuaW5zZXJ0QmVmb3JlKG5ld0xpc3QsIGZvb3RlciB8fCBudWxsKTtcclxuICB9XHJcbn1cclxuIiwgImltcG9ydCB7XHJcbiAgU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWSxcclxuICBTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSxcclxuICBQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZLFxyXG4gIFVJX1BSRUZTX1NUT1JBR0VfS0VZLFxyXG4gIENVU1RPTV9TSVRFU19TVE9SQUdFX0tFWSxcclxuICBSQU5ET01fUVVFU1RJT05TX1NUT1JBR0VfS0VZLFxyXG59IGZyb20gXCIuLi9zaGFyZWQvc3RvcmFnZS1rZXlzLmpzXCI7XHJcbmltcG9ydCB7XHJcbiAgc3RhdGUsXHJcbiAgbG9hZEdyb3VwcyxcclxuICBsb2FkUHJvbXB0R3JvdXBzLFxyXG4gIGxvYWRIaXN0b3J5LFxyXG4gIGxvYWRVaVByZWZzLFxyXG4gIHJlZnJlc2hBbGxTaXRlcyxcclxufSBmcm9tIFwiLi9zdGF0ZS5qc1wiO1xyXG5pbXBvcnQge1xyXG4gIHJlbmRlckdyb3VwcyxcclxuICByZW5kZXJIaXN0b3J5LFxyXG4gIHJlbmRlclByb21wdFBpY2tlcixcclxuICBjbG9zZVByb21wdFBpY2tlcixcclxuICB0b2dnbGVQcm9tcHRQaWNrZXIsXHJcbiAgZmlsbFJhbmRvbVF1ZXN0aW9uLFxyXG4gIHJ1bkRlZmF1bHRTZWFyY2gsXHJcbiAgaW52YWxpZGF0ZVJhbmRvbVF1ZXN0aW9uc0NhY2hlLFxyXG59IGZyb20gXCIuL3NlY3Rpb25zLmpzXCI7XHJcblxyXG5jb25zdCB7IGFwcGx5RG9tSTE4biB9ID0gd2luZG93Ll9fUVNIT1RfSTE4Tl9fIHx8IHt9O1xyXG5cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgc3RhcnQpO1xyXG5jaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoaGFuZGxlU3RvcmFnZUNoYW5nZSk7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzdGFydCgpIHtcclxuICBjb25zdCBkb20gPSBzdGF0ZS5kb207XHJcbiAgZG9tLnF1ZXJ5SW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInBvcHVwUXVlcnlJbnB1dFwiKTtcclxuICBkb20uY29tcG9zZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLnNlYXJjaC1jb21wb3NlclwiKTtcclxuICBkb20uZ3JvdXBzQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwb3B1cEdyb3Vwc1wiKTtcclxuICBkb20uaGlzdG9yeUxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInBvcHVwSGlzdG9yeUxpc3RcIik7XHJcbiAgZG9tLmhpc3RvcnlTZWN0aW9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5wb3B1cC1oaXN0b3J5LXNlY3Rpb25cIik7XHJcbiAgZG9tLm9wZW5TZXR0aW5nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3BlblNldHRpbmdzQnRuXCIpO1xyXG4gIGRvbS5yYW5kb21Qcm9tcHRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJhbmRvbVByb21wdEJ0blwiKTtcclxuICBkb20ucHJvbXB0RW50cnlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb21wdEVudHJ5QnRuXCIpO1xyXG4gIGRvbS5jb21wb3NlckFjdGlvbnNSb3cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiLmNvbXBvc2VyLWFjdGlvbnMtcm93XCIpO1xyXG4gIGRvbS5wcm9tcHRQaWNrZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInByb21wdFBpY2tlclwiKTtcclxuXHJcbiAgLy8gUmVnaXN0ZXIgY3Jvc3MtbW9kdWxlIGNhbGxiYWNrcyBvbiB0aGUgc2hhcmVkIHN0YXRlIHNvIHNlY3Rpb25zL21vZGFsXHJcbiAgLy8gY2FuIHRyaWdnZXIgY29tcG9zZXIgbGF5b3V0IHN5bmMgd2l0aG91dCBpbXBvcnRpbmcgbWFpbi5qcyAoa2VlcHMgdGhlXHJcbiAgLy8gbW9kdWxlIGdyYXBoIGFjeWNsaWMpLlxyXG4gIHN0YXRlLnN5bmNDb21wb3NlckxheW91dCA9IHN5bmNDb21wb3NlckxheW91dDtcclxuICBzdGF0ZS51cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZSA9IHVwZGF0ZVByb21wdFBpY2tlckxheW91dFN0YXRlO1xyXG5cclxuICBhcHBseURvbUkxOG4/Lihkb2N1bWVudCk7XHJcbiAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIkVOU1VSRV9JTklUSUFMX1NUQVRFX0RFRkFVTFRTXCIgfSkuY2F0Y2goKCkgPT4gbnVsbCk7XHJcbiAgYXdhaXQgcmVmcmVzaEFsbFNpdGVzKCk7XHJcbiAgYXdhaXQgUHJvbWlzZS5hbGwoW1xyXG4gICAgcmVmcmVzaEdyb3VwcygpLFxyXG4gICAgcmVmcmVzaFByb21wdEdyb3VwcygpLFxyXG4gICAgcmVmcmVzaFVpUHJlZnMoKSxcclxuICAgIHJlZnJlc2hIaXN0b3J5KCksXHJcbiAgXSk7XHJcblxyXG4gIGJpbmRFdmVudHMoKTtcclxuICBzeW5jQ29tcG9zZXJMYXlvdXQoKTtcclxuICBkb20ucXVlcnlJbnB1dD8uZm9jdXMoKTtcclxuICB0cmlnZ2VyUHJld2FybSgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBiaW5kRXZlbnRzKCkge1xyXG4gIGNvbnN0IHsgb3BlblNldHRpbmdzQnRuLCByYW5kb21Qcm9tcHRCdG4sIHByb21wdEVudHJ5QnRuLCBxdWVyeUlucHV0IH0gPSBzdGF0ZS5kb207XHJcblxyXG4gIG9wZW5TZXR0aW5nc0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogXCJPUEVOX1NFVFRJTkdTX1BBR0VcIiB9KTtcclxuICAgIHdpbmRvdy5jbG9zZSgpO1xyXG4gIH0pO1xyXG5cclxuICByYW5kb21Qcm9tcHRCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBjbG9zZVByb21wdFBpY2tlcigpO1xyXG4gICAgZmlsbFJhbmRvbVF1ZXN0aW9uKCk7XHJcbiAgfSk7XHJcblxyXG4gIHByb21wdEVudHJ5QnRuPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgIHRvZ2dsZVByb21wdFBpY2tlcigpO1xyXG4gIH0pO1xyXG5cclxuICBxdWVyeUlucHV0Py5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgIGlmIChldmVudC5rZXkgIT09IFwiRW50ZXJcIiB8fCBldmVudC5zaGlmdEtleSkgcmV0dXJuO1xyXG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgIGF3YWl0IHJ1bkRlZmF1bHRTZWFyY2goKTtcclxuICB9KTtcclxuXHJcbiAgLy8gUHJvbXB0IHBpY2tlcjogY2xpY2stb3V0c2lkZSArIEVzYyB0byBjbG9zZS5cclxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XHJcbiAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XHJcbiAgICBpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50KSB8fCAhc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuKSByZXR1cm47XHJcbiAgICBpZiAodGFyZ2V0LmNsb3Nlc3QoXCIjcHJvbXB0RW50cnlCdG5cIikgfHwgdGFyZ2V0LmNsb3Nlc3QoXCIjcHJvbXB0UGlja2VyXCIpKSByZXR1cm47XHJcbiAgICBjbG9zZVByb21wdFBpY2tlcigpO1xyXG4gIH0pO1xyXG4gIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChldmVudCkgPT4ge1xyXG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFc2NhcGVcIiAmJiBzdGF0ZS5pc1Byb21wdFBpY2tlck9wZW4pIHtcclxuICAgICAgY2xvc2VQcm9tcHRQaWNrZXIoKTtcclxuICAgICAgcXVlcnlJbnB1dD8uZm9jdXMoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgaWYgKHF1ZXJ5SW5wdXQpIHtcclxuICAgIHF1ZXJ5SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsIHN5bmNDb21wb3NlckxheW91dCk7XHJcbiAgICBxdWVyeUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIHN5bmNDb21wb3NlckxheW91dCk7XHJcbiAgICBxdWVyeUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBzeW5jQ29tcG9zZXJMYXlvdXQpO1xyXG4gICAgaWYgKHR5cGVvZiBSZXNpemVPYnNlcnZlciAhPT0gXCJ1bmRlZmluZWRcIikge1xyXG4gICAgICBzdGF0ZS5jb21wb3NlclJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHN5bmNDb21wb3NlckxheW91dCgpKTtcclxuICAgICAgc3RhdGUuY29tcG9zZXJSZXNpemVPYnNlcnZlci5vYnNlcnZlKHF1ZXJ5SW5wdXQpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gdHJpZ2dlclByZXdhcm0oKSB7XHJcbiAgaWYgKHN0YXRlLnVpUHJlZnMucHJld2FybUVuYWJsZWQgPT09IGZhbHNlKSByZXR1cm47XHJcbiAgLy8gUmV2aWV3IG5vdGUgKENXUy9FZGdlIEFkZC1vbnMpOlxyXG4gIC8vIC0gXCJQcmV3YXJtXCIgaXMgcGVyZm9ybWFuY2Utb25seSAocmVkdWNlcyBmaXJzdC1sb2FkIGxhdGVuY3kgZm9yIGhlYXZ5IEFJIHNpdGVzKS5cclxuICAvLyAtIFJlcXVlc3RzIGdvIGRpcmVjdGx5IHRvIHVzZXItc2VsZWN0ZWQgdGhpcmQtcGFydHkgc2l0ZXM7IHRoZSBleHRlbnNpb24gZG9lc1xyXG4gIC8vICAgTk9UIHNlbmQgdXNlciBkYXRhIHRvIGFueSBkZXZlbG9wZXItY29udHJvbGxlZCBzZXJ2ZXIgYW5kIGRvZXMgTk9UIHJlYWRcclxuICAvLyAgIHJlc3BvbnNlIGJvZGllcyAobW9kZTpcIm5vLWNvcnNcIiBpbiBiYWNrZ3JvdW5kLmpzKS5cclxuICB0cnkge1xyXG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiBcIldBUk1VUF9BSV9TSVRFU1wiIH0pLmNhdGNoKCgpID0+IHt9KTtcclxuICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICAvLyBwb3B1cCBtYXkgYWxyZWFkeSBiZSBjbG9zaW5nXHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTdG9yYWdlQ2hhbmdlKGNoYW5nZXMsIGFyZWFOYW1lKSB7XHJcbiAgaWYgKGFyZWFOYW1lICE9PSBcImxvY2FsXCIpIHJldHVybjtcclxuICBpZiAoY2hhbmdlc1tDVVNUT01fU0lURVNfU1RPUkFHRV9LRVldKSB7XHJcbiAgICBhd2FpdCByZWZyZXNoQWxsU2l0ZXMoKTtcclxuICAgIGF3YWl0IHJlZnJlc2hHcm91cHMoKTtcclxuICB9XHJcbiAgaWYgKGNoYW5nZXNbU0VBUkNIX0dST1VQU19TVE9SQUdFX0tFWV0pIGF3YWl0IHJlZnJlc2hHcm91cHMoKTtcclxuICBpZiAoY2hhbmdlc1tQUk9NUFRfR1JPVVBTX1NUT1JBR0VfS0VZXSkgYXdhaXQgcmVmcmVzaFByb21wdEdyb3VwcygpO1xyXG4gIGlmIChjaGFuZ2VzW1VJX1BSRUZTX1NUT1JBR0VfS0VZXSkgYXdhaXQgcmVmcmVzaFVpUHJlZnMoKTtcclxuICBpZiAoY2hhbmdlc1tTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWV0pIGF3YWl0IHJlZnJlc2hIaXN0b3J5KCk7XHJcbiAgaWYgKGNoYW5nZXNbUkFORE9NX1FVRVNUSU9OU19TVE9SQUdFX0tFWV0pIGludmFsaWRhdGVSYW5kb21RdWVzdGlvbnNDYWNoZSgpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoR3JvdXBzKCkge1xyXG4gIHN0YXRlLmdyb3VwcyA9IGF3YWl0IGxvYWRHcm91cHMoKTtcclxuICByZW5kZXJHcm91cHMoKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gcmVmcmVzaFByb21wdEdyb3VwcygpIHtcclxuICBzdGF0ZS5wcm9tcHRHcm91cHMgPSBhd2FpdCBsb2FkUHJvbXB0R3JvdXBzKCk7XHJcbiAgaWYgKCFzdGF0ZS5wcm9tcHRHcm91cHMuc29tZSgoZykgPT4gZy5pZCA9PT0gc3RhdGUuYWN0aXZlUHJvbXB0R3JvdXBJZCkpIHtcclxuICAgIHN0YXRlLmFjdGl2ZVByb21wdEdyb3VwSWQgPSBzdGF0ZS5wcm9tcHRHcm91cHNbMF0/LmlkIHx8IG51bGw7XHJcbiAgfVxyXG4gIHJlbmRlclByb21wdFBpY2tlcigpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWZyZXNoVWlQcmVmcygpIHtcclxuICBzdGF0ZS51aVByZWZzID0gYXdhaXQgbG9hZFVpUHJlZnMoKTtcclxuICBhcHBseVVpUHJlZnMoKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gcmVmcmVzaEhpc3RvcnkoKSB7XHJcbiAgY29uc3QgaGlzdG9yeSA9IGF3YWl0IGxvYWRIaXN0b3J5KCk7XHJcbiAgc3RhdGUuaGlzdG9yeUVudHJpZXMgPSBoaXN0b3J5O1xyXG4gIHJlbmRlckhpc3RvcnkoaGlzdG9yeSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFwcGx5VWlQcmVmcygpIHtcclxuICBjb25zdCB7IGhpc3RvcnlTZWN0aW9uLCByYW5kb21Qcm9tcHRCdG4sIHByb21wdEVudHJ5QnRuLCBjb21wb3NlckFjdGlvbnNSb3cgfSA9IHN0YXRlLmRvbTtcclxuXHJcbiAgaWYgKGhpc3RvcnlTZWN0aW9uKSB7XHJcbiAgICBoaXN0b3J5U2VjdGlvbi5oaWRkZW4gPSBzdGF0ZS51aVByZWZzLnNob3dIaXN0b3J5ID09PSBmYWxzZTtcclxuICAgIGhpc3RvcnlTZWN0aW9uLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgc3RhdGUudWlQcmVmcy5zaG93SGlzdG9yeSA9PT0gZmFsc2UpO1xyXG4gICAgaGlzdG9yeVNlY3Rpb24uc3R5bGUuZGlzcGxheSA9IHN0YXRlLnVpUHJlZnMuc2hvd0hpc3RvcnkgPT09IGZhbHNlID8gXCJub25lXCIgOiBcImJsb2NrXCI7XHJcbiAgfVxyXG4gIGlmIChyYW5kb21Qcm9tcHRCdG4pIHtcclxuICAgIHJhbmRvbVByb21wdEJ0bi5oaWRkZW4gPSBzdGF0ZS51aVByZWZzLnNob3dSYW5kb21CdXR0b24gPT09IGZhbHNlO1xyXG4gICAgcmFuZG9tUHJvbXB0QnRuLnN0eWxlLmRpc3BsYXkgPVxyXG4gICAgICBzdGF0ZS51aVByZWZzLnNob3dSYW5kb21CdXR0b24gPT09IGZhbHNlID8gXCJub25lXCIgOiBcImlubGluZS1mbGV4XCI7XHJcbiAgfVxyXG4gIGlmIChwcm9tcHRFbnRyeUJ0bikge1xyXG4gICAgcHJvbXB0RW50cnlCdG4uaGlkZGVuID0gc3RhdGUudWlQcmVmcy5zaG93UHJvbXB0QnV0dG9uID09PSBmYWxzZTtcclxuICAgIHByb21wdEVudHJ5QnRuLnN0eWxlLmRpc3BsYXkgPVxyXG4gICAgICBzdGF0ZS51aVByZWZzLnNob3dQcm9tcHRCdXR0b24gPT09IGZhbHNlID8gXCJub25lXCIgOiBcImlubGluZS1mbGV4XCI7XHJcbiAgICBpZiAoc3RhdGUudWlQcmVmcy5zaG93UHJvbXB0QnV0dG9uID09PSBmYWxzZSkgY2xvc2VQcm9tcHRQaWNrZXIoKTtcclxuICB9XHJcbiAgaWYgKGNvbXBvc2VyQWN0aW9uc1Jvdykge1xyXG4gICAgY29uc3QgaGFzVmlzaWJsZSA9XHJcbiAgICAgIHN0YXRlLnVpUHJlZnMuc2hvd1JhbmRvbUJ1dHRvbiAhPT0gZmFsc2UgfHwgc3RhdGUudWlQcmVmcy5zaG93UHJvbXB0QnV0dG9uICE9PSBmYWxzZTtcclxuICAgIGNvbXBvc2VyQWN0aW9uc1Jvdy5oaWRkZW4gPSAhaGFzVmlzaWJsZTtcclxuICAgIGNvbXBvc2VyQWN0aW9uc1Jvdy5zdHlsZS5kaXNwbGF5ID0gaGFzVmlzaWJsZSA/IFwiZmxleFwiIDogXCJub25lXCI7XHJcbiAgfVxyXG4gIHVwZGF0ZVByb21wdFBpY2tlckxheW91dFN0YXRlKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN5bmNDb21wb3NlckxheW91dChvcHRpb25zID0ge30pIHtcclxuICBjb25zdCB7IGNvbXBvc2VyLCBxdWVyeUlucHV0IH0gPSBzdGF0ZS5kb207XHJcbiAgaWYgKCFjb21wb3NlciB8fCAhcXVlcnlJbnB1dCkgcmV0dXJuO1xyXG5cclxuICAvLyBDbGVhciBsYXlvdXQgY2xhc3NlcyArIGlubGluZSBoZWlnaHQgc28gc2Nyb2xsSGVpZ2h0IHJlZmxlY3RzIHJlYWwgY29udGVudC5cclxuICBjb21wb3Nlci5jbGFzc0xpc3QucmVtb3ZlKFwiaXMtbWlkLWV4cGFuZGVkXCIsIFwiaXMtZXhwYW5kZWRcIik7XHJcbiAgcXVlcnlJbnB1dC5zdHlsZS5oZWlnaHQgPSBcImF1dG9cIjtcclxuICBxdWVyeUlucHV0LnN0eWxlLm1pbkhlaWdodCA9IFwiMHB4XCI7XHJcblxyXG4gIGNvbnN0IHNjcm9sbEggPSBxdWVyeUlucHV0LnNjcm9sbEhlaWdodDtcclxuICBjb25zdCBsaW5lSGVpZ2h0ID0gcGFyc2VGbG9hdCh3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShxdWVyeUlucHV0KS5saW5lSGVpZ2h0IHx8IFwiMjEuNzVcIik7XHJcbiAgY29uc3QgbWF4SGVpZ2h0ID0gcGFyc2VGbG9hdCh3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShxdWVyeUlucHV0KS5tYXhIZWlnaHQgfHwgXCIyMjBcIik7XHJcblxyXG4gIHF1ZXJ5SW5wdXQuc3R5bGUubWluSGVpZ2h0ID0gXCJcIjtcclxuICBjb25zdCBzaG91bGRFeHBhbmQgPSBzY3JvbGxIID4gbGluZUhlaWdodCAqIDIuNztcclxuICBjb25zdCBzaG91bGRNaWRFeHBhbmQgPSAhc2hvdWxkRXhwYW5kICYmIHNjcm9sbEggPiBsaW5lSGVpZ2h0ICogMS43O1xyXG4gIGNvbXBvc2VyLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1taWQtZXhwYW5kZWRcIiwgc2hvdWxkTWlkRXhwYW5kKTtcclxuICBjb21wb3Nlci5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtZXhwYW5kZWRcIiwgc2hvdWxkRXhwYW5kKTtcclxuICBxdWVyeUlucHV0LnN0eWxlLmhlaWdodCA9IHNob3VsZEV4cGFuZCA/IGAke01hdGgubWluKHNjcm9sbEgsIG1heEhlaWdodCl9cHhgIDogXCJcIjtcclxuICBxdWVyeUlucHV0LnN0eWxlLm92ZXJmbG93WSA9IHNob3VsZEV4cGFuZCAmJiBzY3JvbGxIID4gbWF4SGVpZ2h0ID8gXCJhdXRvXCIgOiBcIlwiO1xyXG4gIGlmIChvcHRpb25zLnNjcm9sbFRvVG9wKSB7XHJcbiAgICBxdWVyeUlucHV0LnNjcm9sbFRvcCA9IDA7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB1cGRhdGVQcm9tcHRQaWNrZXJMYXlvdXRTdGF0ZSgpIHtcclxuICBjb25zdCB7IGNvbXBvc2VyIH0gPSBzdGF0ZS5kb207XHJcbiAgaWYgKCFjb21wb3NlcikgcmV0dXJuO1xyXG4gIGNvbnN0IHNob3VsZEV4cGFuZERvd253YXJkID0gc3RhdGUuaXNQcm9tcHRQaWNrZXJPcGVuICYmIHN0YXRlLnVpUHJlZnMuc2hvd0hpc3RvcnkgPT09IGZhbHNlO1xyXG4gIGNvbXBvc2VyLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1waWNrZXItaW5saW5lLW9wZW5cIiwgc2hvdWxkRXhwYW5kRG93bndhcmQpO1xyXG59XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBQU8sTUFBTSw0QkFBNEI7QUFDbEMsTUFBTSw0QkFBNEI7QUFDbEMsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSwyQkFBMkI7QUFDakMsTUFBTSwrQkFBK0I7QUFDckMsTUFBTSw2QkFBNkI7QUFHbkMsTUFBTSwwQkFBMEI7OztBQ0VoQyxNQUFNLFFBQVE7QUFBQSxJQUNuQixRQUFRLENBQUM7QUFBQSxJQUNULGNBQWMsQ0FBQztBQUFBLElBQ2YsVUFBVSxDQUFDO0FBQUEsSUFDWCxnQkFBZ0IsQ0FBQztBQUFBLElBQ2pCLFNBQVMsd0JBQXdCO0FBQUEsSUFDakMscUJBQXFCO0FBQUEsSUFDckIsb0JBQW9CO0FBQUEsSUFDcEIsaUJBQWlCO0FBQUEsSUFDakIsd0JBQXdCO0FBQUE7QUFBQSxJQUV4QixLQUFLO0FBQUEsTUFDSCxZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFD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LE1BQU0sUUFBUSxxQkFBcUIsUUFBUSxTQUFTO0FBQUEsSUFDeEQ7QUFDQSxRQUFJLGdCQUFnQjtBQUNsQixxQkFBZSxTQUFTLE1BQU0sUUFBUSxxQkFBcUI7QUFDM0QscUJBQWUsTUFBTSxVQUNuQixNQUFNLFFBQVEscUJBQXFCLFFBQVEsU0FBUztBQUN0RCxVQUFJLE1BQU0sUUFBUSxxQkFBcUIsTUFBTyxtQkFBa0I7QUFBQSxJQUNsRTtBQUNBLFFBQUksb0JBQW9CO0FBQ3RCLFlBQU0sYUFDSixNQUFNLFFBQVEscUJBQXFCLFNBQVMsTUFBTSxRQUFRLHFCQUFxQjtBQUNqRix5QkFBbUIsU0FBUyxDQUFDO0FBQzdCLHlCQUFtQixNQUFNLFVBQVUsYUFBYSxTQUFTO0FBQUEsSUFDM0Q7QUFDQSxrQ0FBOEI7QUFBQSxFQUNoQztBQUVBLFdBQVMsbUJBQW1CLFVBQVUsQ0FBQyxHQUFHO0FBQ3hDLFVBQU0sRUFBRSxVQUFVLFdBQVcsSUFBSSxNQUFNO0FBQ3ZDLFFBQUksQ0FBQyxZQUFZLENBQUMsV0FBWTtBQUc5QixhQUFTLFVBQVUsT0FBTyxtQkFBbUIsYUFBYTtBQUMxRCxlQUFXLE1BQU0sU0FBUztBQUMxQixlQUFXLE1BQU0sWUFBWTtBQUU3QixVQUFNLFVBQVUsV0FBVztBQUMzQixVQUFNLGFBQWEsV0FBVyxPQUFPLGlCQUFpQixVQUFVLEVBQUUsY0FBYyxPQUFPO0FBQ3ZGLFVBQU0sWUFBWSxXQUFXLE9BQU8saUJBQWlCLFVBQVUsRUFBRSxhQUFhLEtBQUs7QUFFbkYsZUFBVyxNQUFNLFlBQVk7QUFDN0IsVUFBTSxlQUFlLFVBQVUsYUFBYTtBQUM1QyxVQUFNLGtCQUFrQixDQUFDLGdCQUFnQixVQUFVLGFBQWE7QUFDaEUsYUFBUyxVQUFVLE9BQU8sbUJBQW1CLGVBQWU7QUFDNUQsYUFBUyxVQUFVLE9BQU8sZUFBZSxZQUFZO0FBQ3JELGVBQVcsTUFBTSxTQUFTLGVBQWUsR0FBRyxLQUFLLElBQUksU0FBUyxTQUFTLENBQUMsT0FBTztBQUMvRSxlQUFXLE1BQU0sWUFBWSxnQkFBZ0IsVUFBVSxZQUFZLFNBQVM7QUFDNUUsUUFBSSxRQUFRLGFBQWE7QUFDdkIsaUJBQVcsWUFBWTtBQUFBLElBQ3pCO0FBQUEsRUFDRjtBQUVBLFdBQVMsZ0NBQWdDO0FBQ3ZDLFVBQU0sRUFBRSxTQUFTLElBQUksTUFBTTtBQUMzQixRQUFJLENBQUMsU0FBVTtBQUNmLFVBQU0sdUJBQXVCLE1BQU0sc0JBQXNCLE1BQU0sUUFBUSxnQkFBZ0I7QUFDdkYsYUFBUyxVQUFVLE9BQU8seUJBQXlCLG9CQUFvQjtBQUFBLEVBQ3pFOyIsCiAgIm5hbWVzIjogWyJzdGF0ZSJdCn0K
