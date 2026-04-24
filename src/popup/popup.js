(function initPopup() {
  const { applyDomI18n, getUiLanguage, t } = window.__QSHOT_I18N__ || {};
  const SEARCH_GROUPS_STORAGE_KEY = "searchGroups";
  const SEARCH_HISTORY_STORAGE_KEY = "searchHistory";
  const PROMPT_GROUPS_STORAGE_KEY = "promptGroups";
  const UI_PREFS_STORAGE_KEY = "uiPrefs";
  const CUSTOM_SITES_STORAGE_KEY = "customSites";
  const RANDOM_QUESTIONS_STORAGE_KEY = "randomQuestionsText";
  // "全部"分组：第一位固定、无法删除，视图上是所有分组提示词的并集。
  const DEFAULT_PROMPT_GROUP_ID = "prompt-group-default";
  function getAllPromptGroupName() {
    return (t && t("settings_prompts_allGroup")) || "全部";
  }
  function isAllPromptGroup(group) {
    return !!group && group.id === DEFAULT_PROMPT_GROUP_ID;
  }
  function getPromptGroupDisplayName(group) {
    if (isAllPromptGroup(group)) return getAllPromptGroupName();
    return group?.name || "未命名分组";
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
  // 随机问题题库：优先读 chrome.storage.local 里用户在设置中维护的内容；
  // 若用户还没改过（首次运行），fallback 到 config/random-questions/*.txt 的默认题库。
  // 解析规则：一行一题，空行与以 # 开头的注释行会被忽略。
  const RANDOM_QUESTIONS_FILES = {
    zh: "config/random-questions/zh-CN.txt",
    en: "config/random-questions/en.txt"
  };
  let randomQuestionsPromise = null;
  let lastRandomQuestionIndex = -1;
  function parseRandomQuestionsText(text) {
    if (typeof text !== "string") return [];
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  }
  async function fetchDefaultRandomQuestionsText() {
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
      try {
        const stored = await chrome.storage.local.get([RANDOM_QUESTIONS_STORAGE_KEY]);
        const raw = stored[RANDOM_QUESTIONS_STORAGE_KEY];
        // 旧版默认内容以 # 注释块开头，视为未自定义，回退到新默认题库
        const isOldDefault = typeof raw === "string" && raw.trimStart().startsWith("#");
        if (typeof raw === "string" && !isOldDefault) {
          return parseRandomQuestionsText(raw);
        }
      } catch (_e) {
        // ignore, fallback to default
      }
      return parseRandomQuestionsText(await fetchDefaultRandomQuestionsText());
    })();
    return randomQuestionsPromise;
  }

  const queryInput = document.getElementById("popupQueryInput");
  const composer = document.querySelector(".search-composer");
  const groupsContainer = document.getElementById("popupGroups");
  const historyList = document.getElementById("popupHistoryList");
  const historySection = document.querySelector(".popup-history-section");
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const randomPromptBtn = document.getElementById("randomPromptBtn");
  const promptEntryBtn = document.getElementById("promptEntryBtn");
  const composerActionsRow = document.querySelector(".composer-actions-row");
  const promptPicker = document.getElementById("promptPicker");

  let groups = [];
  let promptGroups = [];
  let allSites = [];
  let uiPrefs = createNormalizedUiPrefs();
  let activePromptGroupId = null;
  let isPromptPickerOpen = false;
  let composerResizeObserver = null;

  document.addEventListener("DOMContentLoaded", start);
  chrome.storage.onChanged.addListener(handleStorageChange);

  async function start() {
    applyDomI18n?.(document);
    await refreshAllSites();
    await Promise.all([refreshGroups(), refreshPromptGroups(), refreshUiPrefs(), refreshHistory()]);
    bindPromptPickerEvents();
    bindComposerLayoutEvents();
    syncComposerLayout();
    queryInput.focus();
    triggerPrewarm();
  }

  function triggerPrewarm() {
    if (uiPrefs.prewarmEnabled === false) {
      return;
    }
    // Review note (CWS/Edge Add-ons):
    // - "Prewarm" is performance-only (reduces first-load latency for heavy AI sites).
    // - Requests go directly to user-selected third-party sites; the extension does NOT send user data to any developer-controlled server and does NOT read response bodies (mode:"no-cors" in background.js).
    try {
      chrome.runtime.sendMessage({ type: "WARMUP_AI_SITES" })
        .catch(() => {});
    } catch (_err) {
      // popup 立即关闭等情况下忽略
    }
  }

  openSettingsBtn.addEventListener("click", async () => {
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




  queryInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    await runDefaultSearch();
  });

  async function handleStorageChange(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    if (changes[CUSTOM_SITES_STORAGE_KEY]) {
      await refreshAllSites();
      await refreshGroups();
    }

    if (changes[SEARCH_GROUPS_STORAGE_KEY]) {
      await refreshGroups();
    }

    if (changes[PROMPT_GROUPS_STORAGE_KEY]) {
      await refreshPromptGroups();
    }

    if (changes[UI_PREFS_STORAGE_KEY]) {
      await refreshUiPrefs();
    }

    if (changes[SEARCH_HISTORY_STORAGE_KEY]) {
      await refreshHistory();
    }

    if (changes[RANDOM_QUESTIONS_STORAGE_KEY]) {
      randomQuestionsPromise = null;
      lastRandomQuestionIndex = -1;
    }
  }

  async function refreshGroups() {
    groups = await loadGroups();
    renderGroups(groups);
  }

  async function refreshPromptGroups() {
    promptGroups = await loadPromptGroups();
    if (!promptGroups.some((group) => group.id === activePromptGroupId)) {
      activePromptGroupId = promptGroups[0]?.id || null;
    }
    renderPromptPicker();
  }

  async function refreshUiPrefs() {
    uiPrefs = await loadUiPrefs();
    applyUiPrefs();
  }

  async function refreshHistory() {
    const history = await loadHistory();
    renderHistory(history);
  }

  function renderGroups(groupList) {
    groupsContainer.innerHTML = "";
    groupsContainer.hidden = groupList.length === 0;

    groupList.forEach((group) => {
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

  // ── 搜索组 tooltip ──
  let _groupTooltipEl = null;
  let _groupTooltipTimer = null;
  let _groupTooltipHideTimer = null;

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
      _groupTooltipEl.addEventListener("mouseleave", () => {
        scheduleHideGroupTooltip();
      });
      document.body.appendChild(_groupTooltipEl);
    }
    return _groupTooltipEl;
  }

  function getGroupSites(group) {
    return (group.siteIds || [])
      .map((id) => allSites.find((site) => site.id === id))
      .filter((site) => site && normalizeSiteHomeUrl(site.url))
      .map((site) => ({
        id: site.id,
        name: site.name || site.id,
        url: normalizeSiteHomeUrl(site.url)
      }));
  }

  function showGroupTooltip(button, sites) {
    if (_groupTooltipTimer) { clearTimeout(_groupTooltipTimer); _groupTooltipTimer = null; }
    if (_groupTooltipHideTimer) { clearTimeout(_groupTooltipHideTimer); _groupTooltipHideTimer = null; }
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
        if (top < 4) {
          top = btnRect.bottom + 8;
        }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
    }, 450);
  }

  function hideGroupTooltip() {
    if (_groupTooltipTimer) { clearTimeout(_groupTooltipTimer); _groupTooltipTimer = null; }
    if (_groupTooltipHideTimer) { clearTimeout(_groupTooltipHideTimer); _groupTooltipHideTimer = null; }
    if (_groupTooltipEl) {
      _groupTooltipEl.style.display = "none";
    }
  }

  function scheduleHideGroupTooltip() {
    if (_groupTooltipTimer) { clearTimeout(_groupTooltipTimer); _groupTooltipTimer = null; }
    if (_groupTooltipHideTimer) { clearTimeout(_groupTooltipHideTimer); }
    _groupTooltipHideTimer = setTimeout(() => {
      if (_groupTooltipEl) {
        _groupTooltipEl.style.display = "none";
      }
    }, 180);
  }

  function renderGroupTooltipSites(tooltip, sites) {
    tooltip.innerHTML = "";

    const list = document.createElement("div");
    list.className = "group-tooltip-list";
    list.style.gridTemplateColumns = `repeat(${Math.min(5, Math.max(1, sites.length))}, max-content)`;
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

  async function openSiteHome(url) {
    const safeUrl = normalizeSiteHomeUrl(url);
    if (!safeUrl) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url: safeUrl });
    } catch (_err) {
      /* 忽略 */
    }

    window.close();
  }

  function normalizeSiteHomeUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) {
      return "";
    }

    let next = raw.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => (sep === "?" ? "?" : ""));
    next = next.replace(/\?&/, "?");
    next = next.replace(/[?&]$/, "");
    next = next.replace(/\{query\}/g, "");
    if (!/^https?:\/\//i.test(next)) {
      return "";
    }
    return next;
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
      custom.forEach((s) => { if (s && !knownIds.has(s.id)) { merged.push(s); knownIds.add(s.id); } });
      allSites = merged;
    } catch (_e) {
      allSites = [];
    }
  }

  function renderPromptPicker() {
    updatePromptPickerLayoutState();

    if (!promptPicker || !promptEntryBtn || uiPrefs.showPromptButton === false) {
      if (promptPicker) {
        promptPicker.hidden = true;
      }
      updatePromptPickerLayoutState();
      return;
    }

    promptPicker.innerHTML = "";
    promptEntryBtn.setAttribute("aria-expanded", String(isPromptPickerOpen));

    if (!isPromptPickerOpen) {
      promptPicker.hidden = true;
      updatePromptPickerLayoutState();
      return;
    }

    promptPicker.hidden = false;

    if (!promptGroups.length) {
      const empty = document.createElement("div");
      empty.className = "popup-prompt-picker-empty";
      empty.textContent = "还没有提示词分组，请先去设置里添加。";
      promptPicker.appendChild(empty);
      updatePromptPickerLayoutState();
      return;
    }

    const activeGroup = promptGroups.find((group) => group.id === activePromptGroupId) || promptGroups[0];
    if (!activeGroup) {
      updatePromptPickerLayoutState();
      return;
    }

    const groupsColumn = document.createElement("div");
    groupsColumn.className = "popup-prompt-groups";

    promptGroups.forEach((group) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `popup-prompt-group-item${group.id === activeGroup.id ? " is-active" : ""}`;
      button.textContent = getPromptGroupDisplayName(group);
      button.addEventListener("mouseenter", () => {
        if (activePromptGroupId === group.id) {
          return;
        }
        activePromptGroupId = group.id;
        renderPromptPicker();
      });
      button.addEventListener("click", () => {
        activePromptGroupId = group.id;
        renderPromptPicker();
      });
      groupsColumn.appendChild(button);
    });

    const promptsColumn = document.createElement("div");
    promptsColumn.className = "popup-prompt-list";

    const entries = getDisplayPromptEntries(activeGroup, promptGroups);
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "popup-prompt-picker-empty";
      empty.textContent = isAllPromptGroup(activeGroup)
        ? "还没有提示词，请先去设置里添加。"
        : "这个分组里还没有提示词。";
      promptsColumn.appendChild(empty);
    } else {
      _popupPreviewMgr = _popupPreviewMgr || window.PromptItemUI.createPreviewManager(null);
      entries.forEach(({ prompt, sourceGroup }) => {
        const item = window.PromptItemUI.createItem(prompt, {
          onFill: (p) => { queryInput.value = p.content || ""; closePromptPicker(); queryInput.focus(); },
          onEdit: (p) => openPopupPromptEditModal(p, sourceGroup.id),
          previewManager: _popupPreviewMgr,
        });
        promptsColumn.appendChild(item);
      });
    }

    promptPicker.appendChild(groupsColumn);
    promptPicker.appendChild(promptsColumn);

    const footer = document.createElement("div");
    footer.className = "popup-prompt-picker-footer";
    const settingsLink = document.createElement("button");
    settingsLink.type = "button";
    settingsLink.className = "popup-prompt-picker-settings-btn";
    settingsLink.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>管理提示词`;
    settingsLink.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE", section: "prompts" });
      window.close();
    });
    footer.appendChild(settingsLink);
    promptPicker.appendChild(footer);

    updatePromptPickerLayoutState();
  }

  // 预览卡片管理器（由 shared/prompt-item.js 提供）
  let _popupPreviewMgr = null;


  // ── popup 编辑弹窗 ──
  function openPopupPromptEditModal(prompt, groupId) {
    closePromptPicker();
    const targetGroup = promptGroups.find((g) => g.id === groupId) || promptGroups[0];
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
          ${promptGroups.map((g) => `<option value="${escapeHtml(g.id)}"${g.id === groupId ? " selected" : ""}>${escapeHtml(getPromptGroupDisplayName(g))}</option>`).join("")}
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
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

    modal.querySelector(".pep-save").addEventListener("click", async () => {
      const newTitle = (titleInput instanceof HTMLInputElement ? titleInput.value : "").trim() || "未命名提示词";
      const newContent = contentInput instanceof HTMLTextAreaElement ? contentInput.value : "";
      let newGroupId = groupSelect instanceof HTMLSelectElement ? groupSelect.value : groupId;
      if (newGroupId === "__new__") {
        const newName = (newGroupInput instanceof HTMLInputElement ? newGroupInput.value : "").trim() || "新建分组";
        const newGroup = { id: `prompt-group-${Date.now()}`, name: newName, prompts: [] };
        promptGroups.push(newGroup);
        newGroupId = newGroup.id;
      }
      promptGroups.forEach((g) => { g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id); });
      const destGroup = promptGroups.find((g) => g.id === newGroupId) || targetGroup;
      destGroup.prompts.push({ id: targetPrompt.id, title: newTitle, content: newContent });
      await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: promptGroups });
      closeModal();
    });

    modal.querySelector(".pep-delete").addEventListener("click", async () => {
      if (!window.confirm("确定要删除这条提示词吗？")) return;
      promptGroups.forEach((g) => { g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id); });
      await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: promptGroups });
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

  function bindPromptPickerEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !isPromptPickerOpen) {
        return;
      }
      if (target.closest("#promptEntryBtn") || target.closest("#promptPicker")) {
        return;
      }
      closePromptPicker();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isPromptPickerOpen) {
        closePromptPicker();
        queryInput.focus();
      }
    });
  }

  function bindComposerLayoutEvents() {
    queryInput.addEventListener("mouseup", syncComposerLayout);
    queryInput.addEventListener("keyup", syncComposerLayout);

    if (typeof ResizeObserver !== "undefined") {
      composerResizeObserver = new ResizeObserver(() => {
        syncComposerLayout();
      });
      composerResizeObserver.observe(queryInput);
    }
  }

  function syncComposerLayout() {
    if (!composer || !queryInput) {
      return;
    }

    // 先把 expanded 状态和内联高度清掉，让 scrollHeight 反映真实内容高度
    composer.classList.remove("is-expanded");
    queryInput.style.height = "0px";
    queryInput.style.minHeight = "0px";

    const scrollH = queryInput.scrollHeight;
    const lineHeight = parseFloat(window.getComputedStyle(queryInput).lineHeight || "21.75");

    // 还原内联样式，再按测量结果决定是否展开
    queryInput.style.height = "";
    queryInput.style.minHeight = "";
    composer.classList.toggle("is-expanded", scrollH > lineHeight * 1.7);
  }

  function togglePromptPicker() {
    isPromptPickerOpen = !isPromptPickerOpen;
    renderPromptPicker();
  }

  function applyUiPrefs() {
    if (historySection) {
      historySection.hidden = uiPrefs.showHistory === false;
      historySection.classList.toggle("is-hidden", uiPrefs.showHistory === false);
      historySection.style.display = uiPrefs.showHistory === false ? "none" : "block";
    }

    if (randomPromptBtn) {
      randomPromptBtn.hidden = uiPrefs.showRandomButton === false;
      randomPromptBtn.style.display = uiPrefs.showRandomButton === false ? "none" : "inline-flex";
    }

    if (promptEntryBtn) {
      promptEntryBtn.hidden = uiPrefs.showPromptButton === false;
      promptEntryBtn.style.display = uiPrefs.showPromptButton === false ? "none" : "inline-flex";
      if (uiPrefs.showPromptButton === false) {
        closePromptPicker();
      }
    }

    if (composerActionsRow) {
      const hasVisibleActions = uiPrefs.showRandomButton !== false || uiPrefs.showPromptButton !== false;
      composerActionsRow.hidden = !hasVisibleActions;
      composerActionsRow.style.display = hasVisibleActions ? "flex" : "none";
    }

    updatePromptPickerLayoutState();
  }

  function closePromptPicker() {
    if (!isPromptPickerOpen) {
      return;
    }
    isPromptPickerOpen = false;
    if (_popupPreviewMgr) _popupPreviewMgr.hide();
    renderPromptPicker();
    updatePromptPickerLayoutState();
  }

  function updatePromptPickerLayoutState() {
    if (!composer) {
      return;
    }

    const shouldExpandDownward = isPromptPickerOpen && uiPrefs.showHistory === false;
    composer.classList.toggle("is-picker-inline-open", shouldExpandDownward);
  }

  async function fillRandomQuestion() {
    const questions = await loadRandomQuestions();
    if (!questions.length) {
      return;
    }

    // 防重复：题库有 2 条及以上时，避免连续两次抽到同一条。
    let randomIndex = Math.floor(Math.random() * questions.length);
    if (questions.length > 1 && randomIndex === lastRandomQuestionIndex) {
      randomIndex = (randomIndex + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length;
    }
    lastRandomQuestionIndex = randomIndex;
    queryInput.value = questions[randomIndex];
    syncComposerLayout();
    queryInput.focus();
  }

  function renderHistory(history) {
    historyList.innerHTML = "";

    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.className = "popup-history-empty";
      empty.textContent = "暂无搜索记录";
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
        <button class="popup-history-delete-btn" type="button" aria-label="删除这条记录">×</button>
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
        queryInput.value = entry.query || "";
        queryInput.focus();
      });
      historyList.appendChild(item);
    });
  }

  async function runDefaultSearch() {
    if (!groups.length) {
      return;
    }

    await runGroup(groups[0]);
  }

  function runGroup(group) {
    const query = queryInput.value.trim();
    chrome.runtime.sendMessage({
      type: "RUN_SEARCH_GROUP",
      group,
      query
    }).catch(() => {});
    window.close();
  }

  async function loadGroups() {
    const stored = await chrome.storage.local.get([SEARCH_GROUPS_STORAGE_KEY]);
    return Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) ? stored[SEARCH_GROUPS_STORAGE_KEY] : [];
  }

  async function loadPromptGroups() {
    const stored = await chrome.storage.local.get([PROMPT_GROUPS_STORAGE_KEY]);
    const source = Array.isArray(stored[PROMPT_GROUPS_STORAGE_KEY]) ? stored[PROMPT_GROUPS_STORAGE_KEY] : [];
    return source.map((group, groupIndex) => ({
      id: String(group.id || `prompt-group-${groupIndex}`),
      name: String(group.name || "未命名分组"),
      prompts: Array.isArray(group.prompts)
        ? group.prompts.map((prompt, promptIndex) => ({
            id: String(prompt.id || `prompt-${groupIndex}-${promptIndex}`),
            title: String(prompt.title || "未命名提示词"),
            content: String(prompt.content || "")
          }))
        : []
    }));
  }

  async function loadHistory() {
    const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
    return Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY].slice(0, 4) : [];
  }

  async function removeHistoryEntry(entry) {
    const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
    const fullHistory = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY]) ? stored[SEARCH_HISTORY_STORAGE_KEY] : [];
    if (!fullHistory.length) {
      return;
    }

    let removed = false;
    const nextHistory = fullHistory.filter((item) => {
      if (removed) {
        return true;
      }

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

    if (!removed) {
      return;
    }

    await chrome.storage.local.set({ [SEARCH_HISTORY_STORAGE_KEY]: nextHistory });
  }

  async function loadUiPrefs() {
    const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
    return createNormalizedUiPrefs(stored[UI_PREFS_STORAGE_KEY]);
  }

  function createNormalizedUiPrefs(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      showHistory: source.showHistory !== false,
      showRandomButton: source.showRandomButton !== false,
      showPromptButton: source.showPromptButton !== false,
      prewarmEnabled: source.prewarmEnabled !== false
    };
  }

  function formatHistoryDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
