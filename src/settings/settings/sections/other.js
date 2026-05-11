import {
  normalizeShortcut,
  formatShortcut,
  isShortcutValid,
} from "../../../shared/shortcut.js";
import { QUICK_ACCESS_SITES_KEY } from "../../../shared/storage-keys.js";
import { state, msg, SITE_CATEGORIES, AI_SITE_GROUPS, SOCIAL_SITE_GROUPS, PICKER_CLOSE_DELAY_MS } from "../state.js";
import { escapeHtml } from "../utils.js";
import {
  persistAll,
  createNormalizedGroups,
  createNormalizedCustomSites,
  mergeSites,
  getCategorySites,
} from "../store.js";
import { attachChipDragGeneric } from "../drag.js";

async function persistQuickAccessSites() {
  await chrome.storage.local.set({ [QUICK_ACCESS_SITES_KEY]: state.quickAccessSiteIds });
}

export function renderOtherSection() {
  const { otherSection } = state.dom;
  otherSection.innerHTML = "";

  otherSection.appendChild(createShortcutCard());
}

function createQuickSitesCard() {
  const MAX = 9;
  const card = document.createElement("div");
  card.className = "quick-sites-card";

  const intro = document.createElement("div");
  intro.className = "other-settings-intro";
  intro.style.cssText = "";
  intro.innerHTML = `
    <strong>${msg("settings_other_quickSitesTitle", "三击空格快捷站点")}</strong>
    <span>${msg("settings_other_quickSitesDesc", "在搜索浮层输入框中三击空格，快速跳转到以下站点（最多 9 个）。")}</span>
  `;
  card.appendChild(intro);

  const chipList = document.createElement("div");
  chipList.className = "site-chip-list";
  chipList.style.marginTop = "4px";

  function renderChips() {
    chipList.innerHTML = "";
    const selectedSites = state.quickAccessSiteIds
      .map((id) => state.sites.find((s) => s.id === id))
      .filter(Boolean);

    selectedSites.forEach((site) => {
      const chip = document.createElement("div");
      chip.className = "site-chip selected-chip";
      chip.dataset.siteId = site.id;
      chip.innerHTML = `<span class="site-chip-label">${escapeHtml(site.name)}</span><button class="chip-remove-btn" type="button" aria-label="${escapeHtml(site.name)} 删除">×</button>`;
      chip.querySelector(".chip-remove-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        state.quickAccessSiteIds = state.quickAccessSiteIds.filter((id) => id !== site.id);
        await persistQuickAccessSites();
        renderChips();
      });
      chipList.appendChild(chip);
    });

    if (selectedSites.length < MAX) {
      const addWrap = document.createElement("div");
      addWrap.className = "inline-add-wrap quick-sites-add-wrap";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "inline-add-btn";
      addBtn.textContent = msg("common_add", "新增");
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearQuickPickerTimer();
        if (state.openQuickSitesPicker) {
          state.openQuickSitesPicker = false;
          state.quickPickerCategoryKey = null;
        } else {
          state.openQuickSitesPicker = true;
          if (!state.quickPickerCategoryKey || !SITE_CATEGORIES[state.quickPickerCategoryKey]) {
            state.quickPickerCategoryKey = Object.keys(SITE_CATEGORIES)[0] || null;
          }
        }
        renderChips();
      });
      addWrap.appendChild(addBtn);

      if (state.openQuickSitesPicker) {
        addWrap.appendChild(createQuickPicker(renderChips));
      }

      chipList.appendChild(addWrap);
    }
  }

  renderChips();
  attachChipDragGeneric(chipList, async (newIds) => {
    state.quickAccessSiteIds = newIds;
    await persistQuickAccessSites();
    renderChips();
  });
  card.appendChild(chipList);
  return card;
}

function clearQuickPickerTimer() {
  if (state.quickPickerCloseTimerId) {
    clearTimeout(state.quickPickerCloseTimerId);
    state.quickPickerCloseTimerId = null;
  }
}

function scheduleQuickPickerClose(renderFn) {
  clearQuickPickerTimer();
  state.quickPickerCloseTimerId = setTimeout(() => {
    state.openQuickSitesPicker = false;
    state.quickPickerCategoryKey = null;
    renderFn();
  }, PICKER_CLOSE_DELAY_MS);
}

function setQuickPickerCategory(key, renderFn) {
  if (state.quickPickerCategoryKey === key) return;
  state.quickPickerCategoryKey = key;
  renderFn();
}

function createQuickPicker(renderFn) {
  const MAX = 9;
  const panel = document.createElement("div");
  panel.className = "hover-picker-panel is-open";
  panel.addEventListener("click", (e) => e.stopPropagation());
  panel.addEventListener("mouseenter", clearQuickPickerTimer);
  panel.addEventListener("mouseleave", () => scheduleQuickPickerClose(renderFn));

  Object.entries(SITE_CATEGORIES).forEach(([key, category]) => {
    const row = document.createElement("div");
    row.className = "hover-picker-row";
    const isActive = state.quickPickerCategoryKey === key;
    if (isActive) row.classList.add("is-active");

    const entry = document.createElement("button");
    entry.className = "hover-picker-entry";
    entry.type = "button";
    entry.innerHTML = `<span>${escapeHtml(category.label)}</span><span class="hover-picker-arrow">›</span>`;
    entry.addEventListener("mouseenter", () => {
      clearQuickPickerTimer();
      setQuickPickerCategory(key, renderFn);
    });
    entry.addEventListener("click", (e) => {
      e.stopPropagation();
      clearQuickPickerTimer();
      setQuickPickerCategory(key, renderFn);
    });
    row.appendChild(entry);

    const submenu = document.createElement("div");
    submenu.className = `hover-picker-submenu${isActive ? " is-open" : ""}`;
    submenu.addEventListener("mouseenter", clearQuickPickerTimer);
    submenu.addEventListener("mouseleave", () => scheduleQuickPickerClose(renderFn));

    const categorySites = getCategorySites(key);

    if (key === "custom") {
      if (!categorySites.length) {
        const empty = document.createElement("div");
        empty.className = "hover-picker-empty";
        empty.innerHTML = msg("settings_groups_customEmpty", `还没有自定义站点<br/><span class="hover-picker-empty-hint">前往左侧「自定义搜索」添加</span>`);
        submenu.appendChild(empty);
      } else {
        categorySites.forEach((site) => submenu.appendChild(createQuickPickerOption(site, renderFn, MAX)));
      }
    } else if (key === "ai") {
      submenu.classList.add("hover-picker-submenu--ai");
      const columnsWrap = document.createElement("div");
      columnsWrap.className = "hover-picker-ai-columns";
      AI_SITE_GROUPS.forEach((grp) => {
        const groupSites = grp.siteIds.map((id) => categorySites.find((s) => s.id === id)).filter(Boolean);
        if (!groupSites.length) return;
        const col = document.createElement("div");
        col.className = "hover-picker-ai-col";
        const colTitle = document.createElement("div");
        colTitle.className = "hover-picker-site-group-title";
        colTitle.textContent = msg(grp.labelKey, grp.label);
        col.appendChild(colTitle);
        groupSites.forEach((site) => col.appendChild(createQuickPickerOption(site, renderFn, MAX)));
        columnsWrap.appendChild(col);
      });
      submenu.appendChild(columnsWrap);
    } else {
      submenu.classList.add("hover-picker-submenu--ai");
      const columnsWrap = document.createElement("div");
      columnsWrap.className = "hover-picker-ai-columns";
      SOCIAL_SITE_GROUPS.forEach((grp) => {
        const groupSites = grp.siteIds.map((id) => categorySites.find((s) => s.id === id)).filter(Boolean);
        if (!groupSites.length) return;
        const col = document.createElement("div");
        col.className = "hover-picker-ai-col";
        const colTitle = document.createElement("div");
        colTitle.className = "hover-picker-site-group-title";
        colTitle.textContent = msg(grp.labelKey, grp.label);
        col.appendChild(colTitle);
        groupSites.forEach((site) => col.appendChild(createQuickPickerOption(site, renderFn, MAX)));
        columnsWrap.appendChild(col);
      });
      submenu.appendChild(columnsWrap);
    }

    row.appendChild(submenu);
    panel.appendChild(row);
  });

  return panel;
}

function createQuickPickerOption(site, renderFn, max) {
  const label = document.createElement("label");
  label.className = "hover-picker-option";
  const isChecked = state.quickAccessSiteIds.includes(site.id);
  const atMax = state.quickAccessSiteIds.length >= max;
  const disabled = !isChecked && atMax;
  label.innerHTML = `
    <span class="hover-picker-option-text">${escapeHtml(site.name)}</span>
    <input type="checkbox" ${isChecked ? "checked" : ""} ${disabled ? "disabled" : ""} />
  `;
  if (disabled) label.style.opacity = "0.45";
  const checkbox = label.querySelector("input");
  checkbox.addEventListener("click", (e) => e.stopPropagation());
  checkbox.addEventListener("change", async () => {
    clearQuickPickerTimer();
    if (checkbox.checked) {
      if (state.quickAccessSiteIds.length < max) {
        state.quickAccessSiteIds = [...state.quickAccessSiteIds, site.id];
      }
    } else {
      state.quickAccessSiteIds = state.quickAccessSiteIds.filter((id) => id !== site.id);
    }
    await persistQuickAccessSites();
    renderFn();
  });
  return label;
}

export function createOtherSettingToggle(key, title, desc, tip, options = {}) {
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
    } else if (state.activeSection === "misc") {
      state.renderMiscSection();
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
  card.style.cssText = "border: none; background: transparent; box-shadow: none;";
  card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_other_globalShortcutTitle", "全局搜索快捷键")}</strong>
      <span>${msg("settings_other_globalShortcutDesc", "在任意网页上用快捷键在屏幕中间快速弹出搜索浮层。")}</span>
    </div>
    <div class="other-settings-list"></div>
  `;
  card.insertBefore(createQuickSitesCard(), card.querySelector(".other-settings-intro").nextSibling);

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

export function createSearchConfigIoCard() {
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
    searchGroups: state.groups,
    customSites: state.customSites
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

  if (importedCustomSites.length) {
    state.customSites = createNormalizedCustomSites(importedCustomSites);
    const builtinSites = state.sites.filter((site) => !site.isCustom);
    state.sites = mergeSites(builtinSites, state.customSites);
  }
  if (importedGroups.length) {
    state.groups = createNormalizedGroups(importedGroups);
  }

  await persistAll();
  if (state.activeSection === "misc") {
    state.renderMiscSection();
  } else {
    renderOtherSection();
  }

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
