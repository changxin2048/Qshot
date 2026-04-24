import { state, t, normalizeSiteHomeUrl } from "./state.js";

export function renderGroupsIfOpen() {
  if (!state.shadowRoot) return;
  const container = state.shadowRoot.querySelector(".groups");
  if (!container) return;
  container.innerHTML = "";

  state.groups.forEach((group) => {
    const groupSites = getGroupSites(group);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-btn";
    btn.textContent = group.name || t("overlay_unnamedSearchGroup", null, "未命名搜索组");
    if (groupSites.length) {
      btn.addEventListener("mouseenter", () => showGroupTooltip(btn, groupSites));
      btn.addEventListener("mouseleave", () => scheduleHideGroupTooltip());
    }
    btn.addEventListener("click", () => {
      hideGroupTooltip();
      runGroup(group);
    });
    container.appendChild(btn);
  });
}

function getGroupSites(group) {
  return (group?.siteIds || [])
    .map((id) => state.allSites.find((site) => site.id === id))
    .filter((site) => site && normalizeSiteHomeUrl(site.url))
    .map((site) => ({
      id: site.id,
      name: site.name || site.id,
      url: normalizeSiteHomeUrl(site.url),
    }));
}

function getGroupTooltipEl() {
  return state.shadowRoot?.querySelector(".group-tooltip") || null;
}

function showGroupTooltip(button, sites) {
  if (!state.shadowRoot) return;
  if (state.groupTooltipTimer) {
    clearTimeout(state.groupTooltipTimer);
    state.groupTooltipTimer = null;
  }
  if (state.groupTooltipHideTimer) {
    clearTimeout(state.groupTooltipHideTimer);
    state.groupTooltipHideTimer = null;
  }

  state.groupTooltipTimer = setTimeout(() => {
    const tooltip = getGroupTooltipEl();
    const panel = state.shadowRoot?.querySelector(".panel");
    if (!(tooltip instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    renderGroupTooltipSites(tooltip, sites);
    tooltip.style.display = "block";
    requestAnimationFrame(() => {
      const btnRect = button.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const tooltipW = tooltip.offsetWidth;
      const tooltipH = tooltip.offsetHeight;
      let left = btnRect.left - panelRect.left + btnRect.width / 2 - tooltipW / 2;
      if (left < 0) left = 0;
      if (left + tooltipW > panelRect.width) left = Math.max(0, panelRect.width - tooltipW);
      let top = btnRect.top - panelRect.top - tooltipH - 8;
      if (top < 0) top = btnRect.bottom - panelRect.top + 8;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });
  }, 450);
}

export function hideGroupTooltip() {
  if (state.groupTooltipTimer) {
    clearTimeout(state.groupTooltipTimer);
    state.groupTooltipTimer = null;
  }
  if (state.groupTooltipHideTimer) {
    clearTimeout(state.groupTooltipHideTimer);
    state.groupTooltipHideTimer = null;
  }
  const tooltip = getGroupTooltipEl();
  if (tooltip instanceof HTMLElement) tooltip.style.display = "none";
}

function scheduleHideGroupTooltip() {
  if (state.groupTooltipTimer) {
    clearTimeout(state.groupTooltipTimer);
    state.groupTooltipTimer = null;
  }
  if (state.groupTooltipHideTimer) clearTimeout(state.groupTooltipHideTimer);
  state.groupTooltipHideTimer = setTimeout(() => {
    const tooltip = getGroupTooltipEl();
    if (tooltip instanceof HTMLElement) tooltip.style.display = "none";
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
  if (!safeUrl) return;
  try {
    await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url: safeUrl });
  } catch (_err) {
    /* ignored */
  }
  state.closeOverlay();
}

export async function runDefaultSearch() {
  if (!state.groups.length) return;
  await runGroup(state.groups[0]);
}

async function runGroup(group) {
  if (!state.shadowRoot) return;
  const queryInput = state.shadowRoot.querySelector(".query-input");
  const query = queryInput instanceof HTMLTextAreaElement ? queryInput.value.trim() : "";
  try {
    await chrome.runtime.sendMessage({ type: "RUN_SEARCH_GROUP", group, query });
  } catch (_err) {
    /* ignored */
  }
  state.closeOverlay();
}
