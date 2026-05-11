import { state, elements, SITE_CATEGORIES } from "./state.js";
import { isWideMediaSite } from "./utils.js";
import { setGlobalStatus } from "./status.js";
import {
  activateScrollGuard,
  getScrollGuardDurationMs,
  renderSiteNav,
  renderCardNavStrip,
  updateScrollEdgeBtns,
  onCardAdded,
} from "./layout.js";
import { createSiteCard } from "./cards-render.js";

// ── 临时添加卡片（+）选择器 ──
export function toggleAddSitePicker() {
  if (state.isAddSitePickerOpen) {
    closeAddSitePicker();
    return;
  }
  state.isAddSitePickerOpen = true;
  elements.addSiteBtn?.setAttribute("aria-expanded", "true");
  if (elements.addSitePopover) {
    elements.addSitePopover.hidden = false;
  }
  renderAddSitePicker();
}

export function closeAddSitePicker() {
  if (!state.isAddSitePickerOpen) {
    return;
  }
  state.isAddSitePickerOpen = false;
  elements.addSiteBtn?.setAttribute("aria-expanded", "false");
  if (elements.addSitePopover) {
    elements.addSitePopover.hidden = true;
  }
}

export function getSitesForCategory(categoryId) {
  if (!Array.isArray(state.allSites) || state.allSites.length === 0) {
    return [];
  }
  if (categoryId === "custom") {
    return state.allSites.filter((s) => s && s.isCustom);
  }
  const category = SITE_CATEGORIES.find((c) => c.id === categoryId);
  const ids = new Set(category?.builtinIds || []);
  const byId = new Map(state.allSites.map((s) => [s.id, s]));
  return Array.from(ids).map((id) => byId.get(id)).filter(Boolean);
}

export function renderAddSitePicker() {
  if (!elements.addSiteTabs || !elements.addSiteList) {
    return;
  }

  elements.addSiteTabs.innerHTML = "";
  SITE_CATEGORIES.forEach((category) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `add-site-tab${state.activeAddSiteCategory === category.id ? " is-active" : ""}`;
    tab.textContent = category.label;
    tab.addEventListener("click", (event) => {
      event.stopPropagation();
      state.activeAddSiteCategory = category.id;
      renderAddSitePicker();
    });
    elements.addSiteTabs.appendChild(tab);
  });

  elements.addSiteList.innerHTML = "";
  const sites = getSitesForCategory(state.activeAddSiteCategory);
  if (sites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "add-site-empty";
    empty.textContent = state.activeAddSiteCategory === "custom"
      ? "还没有自定义站点，前往设置页添加。"
      : "暂无可添加的站点。";
    elements.addSiteList.appendChild(empty);
    return;
  }

  sites.forEach((site) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "add-site-chip";
    const isAlreadyActive = state.cardRefs.has(site.id);
    if (isAlreadyActive) {
      chip.classList.add("is-active");
      chip.title = "该卡片已在页面中";
    }
    chip.textContent = site.name || site.id;
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.cardRefs.has(site.id)) {
        return;
      }
      addSiteCardToPage(site);
      renderAddSitePicker();
    });
    elements.addSiteList.appendChild(chip);
  });
}

export function addSiteCardToPage(site) {
  if (!site || !site.id) {
    return;
  }

  state.hiddenSiteIds.delete(site.id);

  if (state.cardRefs.has(site.id)) {
    setGlobalStatus(`${site.name} 卡片已在页面中。`);
    return;
  }

  if (!state.sites.some((s) => s.id === site.id)) {
    state.sites = [...state.sites, site];
  }

  const emptyState = elements.iframesContainer.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }

  const card = createSiteCard(site);
  if (isWideMediaSite(site.id)) {
    card.classList.add("iframe-card-wide-media");
  }
  elements.iframesContainer.appendChild(card);
  onCardAdded(card);

  if (state.layoutMode === "sidebar") {
    state.activeSidebarSiteId = site.id;
    state.cardRefs.forEach((ref, siteId) => {
      if (ref.cardEl) ref.cardEl.hidden = siteId !== state.activeSidebarSiteId;
    });
    renderSiteNav();
  }

  activateScrollGuard(
    elements.iframesContainer.scrollLeft,
    elements.iframesContainer.scrollTop,
    getScrollGuardDurationMs(1)
  );
  updateScrollEdgeBtns();
  renderCardNavStrip();
  setGlobalStatus(`已在当前页面临时添加 ${site.name} 卡片。`);
}
