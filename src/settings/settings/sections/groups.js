import {
  DEFAULT_CARDS_STORAGE_KEY,
} from "../../../shared/storage-keys.js";
import {
  state,
  msg,
  SITE_CATEGORIES,
  AI_SITE_GROUPS,
  SOCIAL_SITE_GROUPS,
  GROUP_MODE_OPTIONS,
  PICKER_CLOSE_DELAY_MS,
} from "../state.js";
import { escapeHtml, getGroupById } from "../utils.js";
import { persistAll, getCategorySites } from "../store.js";
import { attachChipDrag, attachChipDragGeneric } from "../drag.js";

// 将默认卡片 ID 列表持久化到 chrome.storage.local
async function persistDefaultCards() {
  const ids = Array.isArray(state.defaultCardIds) ? state.defaultCardIds : [];
  if (ids.length === 0) {
    // 清空时移除键，让 iframe 页回退到内置默认值
    await chrome.storage.local.remove(DEFAULT_CARDS_STORAGE_KEY);
  } else {
    await chrome.storage.local.set({ [DEFAULT_CARDS_STORAGE_KEY]: ids });
  }
}

// 在 groupsSection 顶部渲染"首页默认卡片"设置卡，
// 样式参照已有搜索组卡片，名称固定为"首页"、呈现方式预留但不可选。
function renderDefaultCards() {
  const section = state.dom.groupsSection;
  if (!section) return;

  const card = document.createElement("section");
  card.className = "settings-group-card";
  card.innerHTML = `
    <div class="settings-group-meta">
      <div class="group-inline-controls group-inline-controls-split">
        <label class="inline-control group-name-inline-wrap">
          <span class="field-label inline-field-label">${msg("settings_groups_fieldName", "搜索组名称")}</span>
          <input class="group-name-input" type="text" value="${msg("settings_defaultCards_name", "首页")}" readonly style="cursor:default;background:#f8f8f8;" />
        </label>
        <label class="inline-control inline-mode-control inline-mode-select-wrap">
          <span class="field-label inline-field-label">${msg("settings_groups_fieldMode", "呈现方式")}</span>
          <div class="group-mode-dropdown" style="opacity:0.5;pointer-events:none;">
            <button class="group-mode-trigger" type="button" disabled>
              <span class="group-mode-trigger-label">${msg("settings_groups_modeCompare", "卡片呈现")}</span>
              <span class="group-mode-trigger-arrow" aria-hidden="true"></span>
            </button>
          </div>
        </label>
      </div>
    </div>
    <div class="settings-group-sites">
      <div class="site-chip-list" id="defaultCardsChipList"></div>
    </div>
  `;

  const chipList = card.querySelector("#defaultCardsChipList");
  renderDefaultCardsChips(chipList);
  // 只绑定一次拖拽，避免 renderDefaultCardsChips 重复调用导致监听器累积
  attachChipDragGeneric(chipList, async (newIds) => {
    state.defaultCardIds = newIds;
    await persistDefaultCards();
    renderDefaultCardsChips(chipList);
  });
  section.appendChild(card);
}

// 渲染默认卡片的站点选择芯片列表及添加按钮
function renderDefaultCardsChips(chipList) {
  chipList.innerHTML = "";

  // 已选中的站点芯片
  const selectedSites = (state.defaultCardIds || [])
    .map((id) => state.sites.find((s) => s.id === id))
    .filter(Boolean);

  selectedSites.forEach((site) => {
    const chip = document.createElement("div");
    chip.className = "site-chip selected-chip";
    chip.dataset.siteId = site.id;
    chip.innerHTML = `<span class="site-chip-label">${escapeHtml(site.name)}</span><button class="chip-remove-btn" type="button" aria-label="${msg("settings_groups_removeSitePrefix", "删除 ")}${escapeHtml(site.name)}">×</button>`;
    chip.querySelector(".chip-remove-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      state.defaultCardIds = (state.defaultCardIds || []).filter((id) => id !== site.id);
      await persistDefaultCards();
      renderDefaultCardsChips(chipList);
    });
    chipList.appendChild(chip);
  });

  // 添加按钮及选择面板
  const addWrap = document.createElement("div");
  addWrap.className = "inline-add-wrap";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "inline-add-btn";
  addBtn.textContent = msg("common_add", "新增");
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearDefaultCardsPickerTimer();
    if (state.openDefaultCardsPicker) {
      state.openDefaultCardsPicker = false;
      state.defaultCardsPickerCategoryKey = null;
    } else {
      state.openDefaultCardsPicker = true;
      if (!state.defaultCardsPickerCategoryKey || !SITE_CATEGORIES[state.defaultCardsPickerCategoryKey]) {
        state.defaultCardsPickerCategoryKey = Object.keys(SITE_CATEGORIES)[0] || null;
      }
    }
    renderDefaultCardsChips(chipList);
  });
  addWrap.appendChild(addBtn);

  if (state.openDefaultCardsPicker) {
    addWrap.appendChild(createDefaultCardsPicker(chipList));
  }

  chipList.appendChild(addWrap);
}

// 清除默认卡片选择面板的自动关闭定时器
function clearDefaultCardsPickerTimer() {
  if (state.defaultCardsPickerCloseTimerId) {
    clearTimeout(state.defaultCardsPickerCloseTimerId);
    state.defaultCardsPickerCloseTimerId = null;
  }
}

// 延迟关闭默认卡片选择面板
function scheduleDefaultCardsPickerClose(chipList) {
  clearDefaultCardsPickerTimer();
  state.defaultCardsPickerCloseTimerId = setTimeout(() => {
    state.openDefaultCardsPicker = false;
    state.defaultCardsPickerCategoryKey = null;
    renderDefaultCardsChips(chipList);
  }, PICKER_CLOSE_DELAY_MS);
}

// 切换默认卡片选择面板的分类
function setDefaultCardsPickerCategory(key, chipList) {
  if (state.defaultCardsPickerCategoryKey === key) return;
  state.defaultCardsPickerCategoryKey = key;
  renderDefaultCardsChips(chipList);
}

// 创建默认卡片站点选择面板
function createDefaultCardsPicker(chipList) {
  const panel = document.createElement("div");
  panel.className = "hover-picker-panel is-open";
  panel.addEventListener("click", (e) => e.stopPropagation());
  panel.addEventListener("mouseenter", clearDefaultCardsPickerTimer);
  panel.addEventListener("mouseleave", () => scheduleDefaultCardsPickerClose(chipList));

  Object.entries(SITE_CATEGORIES).forEach(([key, category]) => {
    const row = document.createElement("div");
    row.className = "hover-picker-row";
    const isActive = state.defaultCardsPickerCategoryKey === key;
    if (isActive) row.classList.add("is-active");

    const entry = document.createElement("button");
    entry.className = "hover-picker-entry";
    entry.type = "button";
    entry.innerHTML = `<span>${escapeHtml(category.label)}</span><span class="hover-picker-arrow">›</span>`;
    entry.addEventListener("mouseenter", () => {
      clearDefaultCardsPickerTimer();
      setDefaultCardsPickerCategory(key, chipList);
    });
    entry.addEventListener("click", (e) => {
      e.stopPropagation();
      clearDefaultCardsPickerTimer();
      setDefaultCardsPickerCategory(key, chipList);
    });
    row.appendChild(entry);

    const submenu = document.createElement("div");
    submenu.className = `hover-picker-submenu${isActive ? " is-open" : ""}`;
    submenu.addEventListener("mouseenter", clearDefaultCardsPickerTimer);
    submenu.addEventListener("mouseleave", () => scheduleDefaultCardsPickerClose(chipList));

    const categorySites = getCategorySites(key);

    if (key === "custom") {
      if (!categorySites.length) {
        const empty = document.createElement("div");
        empty.className = "hover-picker-empty";
        empty.innerHTML = msg("settings_groups_customEmpty", `还没有自定义站点<br/><span class="hover-picker-empty-hint">前往左侧「自定义搜索」添加</span>`);
        submenu.appendChild(empty);
      } else {
        categorySites.forEach((site) => submenu.appendChild(createDefaultCardPickerOption(site, chipList)));
      }
    } else {
      submenu.classList.add("hover-picker-submenu--ai");
      const columnsWrap = document.createElement("div");
      columnsWrap.className = "hover-picker-ai-columns";
      const groups = key === "ai" ? AI_SITE_GROUPS : SOCIAL_SITE_GROUPS;
      groups.forEach((grp) => {
        const groupSites = grp.siteIds.map((id) => categorySites.find((s) => s.id === id)).filter(Boolean);
        if (!groupSites.length) return;
        const col = document.createElement("div");
        col.className = "hover-picker-ai-col";
        const colTitle = document.createElement("div");
        colTitle.className = "hover-picker-site-group-title";
        colTitle.textContent = msg(grp.labelKey, grp.label);
        col.appendChild(colTitle);
        groupSites.forEach((site) => col.appendChild(createDefaultCardPickerOption(site, chipList)));
        columnsWrap.appendChild(col);
      });
      submenu.appendChild(columnsWrap);
    }

    row.appendChild(submenu);
    panel.appendChild(row);
  });

  // 底部"恢复默认"预设按钮
  const presetRow = document.createElement("div");
  presetRow.className = "hover-picker-presets";
  const presetItem = document.createElement("div");
  presetItem.className = "hover-picker-preset-item";
  presetItem.innerHTML = `
    <div class="hover-picker-preset-info">
      <span class="hover-picker-preset-label">${msg("settings_defaultCards_restoreDefault", "恢复默认")}</span>
      <span class="hover-picker-preset-sites">DeepSeek、Kimi、豆包、Gemini</span>
    </div>
  `;
  const presetBtn = document.createElement("button");
  presetBtn.type = "button";
  presetBtn.className = "hover-picker-preset-apply";
  presetBtn.textContent = msg("settings_defaultCards_apply", "应用");
  presetBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    state.defaultCardIds = [];
    await persistDefaultCards();
    state.openDefaultCardsPicker = false;
    state.defaultCardsPickerCategoryKey = null;
    renderDefaultCardsChips(chipList);
  });
  presetItem.appendChild(presetBtn);
  presetRow.appendChild(presetItem);
  const tip = document.createElement("div");
  tip.className = "hover-picker-tip";
  tip.textContent = msg("settings_defaultCards_tip", "留空时自动使用内置默认站点。");
  presetRow.appendChild(tip);
  panel.appendChild(presetRow);

  return panel;
}

// 创建默认卡片选择面板中的站点选项
function createDefaultCardPickerOption(site, chipList) {
  const label = document.createElement("label");
  label.className = "hover-picker-option";
  const isChecked = (state.defaultCardIds || []).includes(site.id);
  label.innerHTML = `
    <span class="hover-picker-option-text">${escapeHtml(site.name)}</span>
    <input type="checkbox" ${isChecked ? "checked" : ""} />
  `;
  const checkbox = label.querySelector("input");
  checkbox.addEventListener("click", (e) => e.stopPropagation());
  checkbox.addEventListener("change", async () => {
    clearDefaultCardsPickerTimer();
    if (checkbox.checked) {
      state.defaultCardIds = [...(state.defaultCardIds || []), site.id];
    } else {
      state.defaultCardIds = (state.defaultCardIds || []).filter((id) => id !== site.id);
    }
    await persistDefaultCards();
    state.openDefaultCardsPicker = false;
    state.defaultCardsPickerCategoryKey = null;
    renderDefaultCardsChips(chipList);
  });
  return label;
}

export function renderGroupsSection() {
  const { groupsSection } = state.dom;
  groupsSection.innerHTML = "";

  // 在搜索组列表之前渲染"首页默认卡片"设置
  renderDefaultCards();

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
        const groupSites = marketGroup.siteIds
          .map((siteId) => categorySites.find((site) => site.id === siteId))
          .filter(Boolean);
        if (!groupSites.length) return;

        const col = document.createElement("div");
        col.className = "hover-picker-ai-col";

        const colTitle = document.createElement("div");
        colTitle.className = "hover-picker-site-group-title";
        colTitle.textContent = msg(marketGroup.labelKey, marketGroup.label);
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
        const groupSites = marketGroup.siteIds
          .map((siteId) => categorySites.find((site) => site.id === siteId))
          .filter(Boolean);
        if (!groupSites.length) return;

        const col = document.createElement("div");
        col.className = "hover-picker-ai-col";

        const colTitle = document.createElement("div");
        colTitle.className = "hover-picker-site-group-title";
        colTitle.textContent = msg(marketGroup.labelKey, marketGroup.label);
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

export function setActivePickerCategory(categoryKey) {
  if (state.activePickerCategoryKey === categoryKey) {
    return;
  }
  state.activePickerCategoryKey = categoryKey;
  renderGroupsSection();
}

export function clearPickerCloseTimer() {
  if (state.pickerCloseTimerId) {
    window.clearTimeout(state.pickerCloseTimerId);
    state.pickerCloseTimerId = null;
  }
}

export function schedulePickerClose() {
  clearPickerCloseTimer();
  state.pickerCloseTimerId = window.setTimeout(() => {
    closePicker();
    renderGroupsSection();
  }, PICKER_CLOSE_DELAY_MS);
}

export function closePicker() {
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
