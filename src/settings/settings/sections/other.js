import {
  normalizeShortcut,
  formatShortcut,
  isShortcutValid,
} from "../../../shared/shortcut.js";
import { state, msg } from "../state.js";
import { escapeHtml } from "../utils.js";
import {
  persistAll,
  createNormalizedGroups,
  createNormalizedCustomSites,
  mergeSites,
} from "../store.js";

export function renderOtherSection() {
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
    },
  ].forEach((item) => {
    list?.appendChild(createOtherSettingToggle(item.key, item.title, item.desc));
  });

  otherSection.appendChild(card);
  otherSection.appendChild(createShortcutCard());
  otherSection.appendChild(createSearchConfigIoCard());
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
