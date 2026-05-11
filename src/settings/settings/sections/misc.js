import { state, msg, applyDomI18n, SECTION_META } from "../state.js";
import { createOtherSettingToggle, createSearchConfigIoCard } from "./other.js";
import { persistAll } from "../store.js";

let _darkModeMediaListener = null;

export function applyDarkMode(mode) {
  if (_darkModeMediaListener) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", _darkModeMediaListener);
    _darkModeMediaListener = null;
  }
  if (mode === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else if (mode === "light") {
    document.documentElement.dataset.theme = "";
  } else {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    document.documentElement.dataset.theme = mq.matches ? "dark" : "";
    _darkModeMediaListener = (e) => {
      document.documentElement.dataset.theme = e.matches ? "dark" : "";
    };
    mq.addEventListener("change", _darkModeMediaListener);
  }
}

export function renderMiscSection() {
  const { miscSection } = state.dom;
  miscSection.innerHTML = "";

  const topRow = document.createElement("div");
  topRow.className = "misc-top-row";
  topRow.appendChild(createThemeModeCard());
  topRow.appendChild(createLocaleCard());
  miscSection.appendChild(topRow);

  miscSection.appendChild(createHomeDisplayCard());
  miscSection.appendChild(createTextSelectionCard());
  miscSection.appendChild(createSearchConfigIoCard());
}

function createTextSelectionCard() {
  const card = document.createElement("section");
  card.className = "other-settings-card";
  card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_misc_textSelectionTitle", "\u9009\u6587\u641c\u7d22")}</strong>
    </div>
    <div class="other-settings-list two-col"></div>
  `;
  const list = card.querySelector(".other-settings-list");
  list.appendChild(
    createOtherSettingToggle(
      "contextMenuEnabled",
      msg("settings_other_contextMenuToggleTitle", "\u53f3\u952e\u641c\u7d22\u83dc\u5355"),
      msg("settings_other_contextMenuToggleDesc", "\u9009\u4e2d\u6587\u5b57\u540e\u53f3\u952e\u53ef\u8c03\u7528\u641c\u7d22\u7ec4\u3002")
    )
  );
  list.appendChild(
    createOtherSettingToggle(
      "selectionSearchEnabled",
      msg("settings_other_selectionSearchToggleTitle", "\u5212\u8bcd\u641c\u7d22\u6c14\u6ce1"),
      msg("settings_other_selectionSearchToggleDesc", "\u9009\u4e2d\u6587\u5b57\u540e\u81ea\u52a8\u5f39\u51fa\u641c\u7d22\u5feb\u6377\u6c14\u6ce1\u3002"),
      undefined,
      { defaultValue: false }
    )
  );
  return card;
}

function createThemeModeCard() {
  const current = state.uiPrefs?.darkMode === "dark" || state.uiPrefs?.darkMode === "light"
    ? state.uiPrefs.darkMode
    : "auto";

  const options = [
    { value: "auto", label: msg("settings_misc_themeAuto", "跟随浏览器") },
    { value: "dark", label: msg("settings_misc_themeDark", "深色") },
    { value: "light", label: msg("settings_misc_themeLight", "浅色") },
  ];
  const currentLabel = options.find((o) => o.value === current)?.label ?? options[0].label;

  const card = document.createElement("section");
  card.className = "other-settings-card misc-inline-card";
  card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_misc_darkModeTitle", "\u4e3b\u9898\u989c\u8272")}</strong>
      <span>${msg("settings_misc_themeDesc", "可跟随浏览器配色，或固定为深色 / 浅色界面。")}</span>
    </div>
    <div class="about-locale-row">
      <div class="locale-dropdown" role="combobox" aria-haspopup="listbox" aria-expanded="false">
        <button type="button" class="locale-trigger">
          <span class="locale-trigger-label">${currentLabel}</span>
          <svg class="locale-trigger-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="locale-menu" role="listbox"></div>
      </div>
    </div>
  `;

  const dropdown = card.querySelector(".locale-dropdown");
  const trigger  = card.querySelector(".locale-trigger");
  const label    = card.querySelector(".locale-trigger-label");
  const menu     = card.querySelector(".locale-menu");

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "option";
    btn.className = "locale-option" + (opt.value === current ? " is-active" : "");
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    menu?.appendChild(btn);
  });

  function openMenu() {
    menu.classList.add("is-open");
    dropdown.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
  }
  function closeMenu() {
    menu.classList.remove("is-open");
    dropdown.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
  }

  trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.contains("is-open") ? closeMenu() : openMenu();
  });

  menu?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".locale-option");
    if (!btn) return;
    closeMenu();
    const v = btn.dataset.value;
    if (v === current) return;
    label.textContent = btn.textContent;
    const next = v === "dark" || v === "light" ? v : "auto";
    state.uiPrefs.darkMode = next;
    await persistAll();
    applyDarkMode(next);
    renderMiscSection();
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) closeMenu();
  }, { capture: false });

  return card;
}

function createLocaleCard() {
  const current = state.uiPrefs?.localeMode === "zh" || state.uiPrefs?.localeMode === "en"
    ? state.uiPrefs.localeMode
    : "auto";

  const options = [
    { value: "auto", label: msg("settings_about_localeAuto", "跟随浏览器") },
    { value: "zh",   label: "简体中文" },
    { value: "en",   label: "English" }
  ];
  const currentLabel = options.find((o) => o.value === current)?.label ?? options[0].label;

  const card = document.createElement("section");
  card.className = "other-settings-card misc-inline-card";
  card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_about_localeTitle", "界面语言")}</strong>
      <span>${msg("settings_about_localeDesc", "可跟随浏览器语言，或固定为中文 / 英文界面。")}</span>
    </div>
    <div class="about-locale-row">
      <div class="locale-dropdown" role="combobox" aria-haspopup="listbox" aria-expanded="false">
        <button type="button" class="locale-trigger">
          <span class="locale-trigger-label">${currentLabel}</span>
          <svg class="locale-trigger-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="locale-menu" role="listbox"></div>
      </div>
    </div>
  `;

  const dropdown = card.querySelector(".locale-dropdown");
  const trigger  = card.querySelector(".locale-trigger");
  const label    = card.querySelector(".locale-trigger-label");
  const menu     = card.querySelector(".locale-menu");

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.role = "option";
    btn.className = "locale-option" + (opt.value === current ? " is-active" : "");
    btn.dataset.value = opt.value;
    btn.textContent = opt.label;
    menu?.appendChild(btn);
  });

  function openMenu() {
    menu.classList.add("is-open");
    dropdown.setAttribute("aria-expanded", "true");
    trigger.classList.add("is-open");
  }
  function closeMenu() {
    menu.classList.remove("is-open");
    dropdown.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
  }

  trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.contains("is-open") ? closeMenu() : openMenu();
  });

  menu?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".locale-option");
    if (!btn) return;
    closeMenu();
    const v = btn.dataset.value;
    if (v === current) return;
    label.textContent = btn.textContent;
    state.uiPrefs.localeMode = v === "zh" || v === "en" ? v : "auto";
    await persistAll();
    window.__QSHOT_I18N__?.setLocaleMode?.(state.uiPrefs.localeMode);
    applyDomI18n?.(document);
    const meta = SECTION_META[state.activeSection];
    if (meta) {
      const title    = meta.titleKey    ? msg(meta.titleKey,    meta.title)    : (meta.title    || "");
      const subtitle = meta.subtitleKey ? msg(meta.subtitleKey, meta.subtitle) : (meta.subtitle || "");
      if (state.dom.sectionEyebrow)  state.dom.sectionEyebrow.hidden = true;
      if (state.dom.sectionTitle)    { state.dom.sectionTitle.textContent = title;    state.dom.sectionTitle.hidden = !title; }
      if (state.dom.sectionSubtitle) { state.dom.sectionSubtitle.textContent = subtitle; state.dom.sectionSubtitle.hidden = !subtitle; }
    }
    state.renderMiscSection();
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) closeMenu();
  }, { capture: false });

  return card;
}

function createHomeDisplayCard() {
  const card = document.createElement("section");
  card.className = "other-settings-card";
  card.innerHTML = `
    <div class="other-settings-intro">
      <strong>${msg("settings_other_homeDisplayTitle", "\u9996\u9875\u663e\u793a\u9879")}</strong>
    </div>
    <div class="other-settings-list two-col"></div>
  `;
  const list = card.querySelector(".other-settings-list");
  [
    {
      key: "showPromptButton",
      title: msg("settings_other_showPromptTitle", "\u663e\u793a\u63d0\u793a\u8bcd\u6309\u9215"),
      desc: msg("settings_other_showPromptDesc", "\u5173\u95ed\u540e\u8f93\u5165\u6846\u4e0b\u65b9\u7684\u63d0\u793a\u8bcd\u5165\u53e3\u5c06\u9690\u85cf\u3002")
    },
    {
      key: "showHistory",
      title: msg("settings_other_showHistoryTitle", "\u663e\u793a\u641c\u7d22\u5386\u53f2"),
      desc: msg("settings_other_showHistoryDesc", "\u5173\u95ed\u540e\u9996\u9875\u5386\u53f2\u533a\u57df\u4e0d\u518d\u663e\u793a\u3002")
    }
  ].forEach((item) => {
    list?.appendChild(createOtherSettingToggle(item.key, item.title, item.desc));
  });
  return card;
}
