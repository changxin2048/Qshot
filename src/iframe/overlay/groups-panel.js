import { state, t, normalizeSiteHomeUrl } from "./state.js";

export function renderGroupsIfOpen() {
  if (!state.shadowRoot) return;
  const container = state.shadowRoot.querySelector(".groups");
  if (!container) return;
  if (state.isGroupPickMode) exitGroupPickMode();
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

export async function openSiteHome(url) {
  const safeUrl = normalizeSiteHomeUrl(url);
  if (!safeUrl) return;
  try {
    await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url: safeUrl });
  } catch (_err) {
    /* ignored */
  }
  state.closeOverlay();
}

export async function openSiteWithQuery(site) {
  const raw = String(site?.url || "").trim();
  if (!raw) return;
  const queryInput = state.shadowRoot?.querySelector(".query-input");
  const query = queryInput instanceof HTMLTextAreaElement ? queryInput.value.trim() : "";
  let url;
  if (query && raw.includes("{query}")) {
    url = raw.replace(/\{query\}/g, encodeURIComponent(query));
  } else {
    url = normalizeSiteHomeUrl(raw);
  }
  if (!url) return;
  try {
    await chrome.runtime.sendMessage({ type: "OPEN_EXTERNAL_URL", url });
  } catch (_err) {
    /* ignored */
  }
  state.closeOverlay();
}

export async function runDefaultSearch() {
  if (!state.groups.length) return;
  await runGroup(state.groups[0]);
}

export function enterGroupPickMode() {
  if (!state.shadowRoot || !state.groups.length) return;
  state.isGroupPickMode = true;
  const btns = state.shadowRoot.querySelectorAll(".group-btn");
  btns.forEach((btn, i) => {
    if (i < 9) {
      btn.setAttribute("data-pick-num", String(i + 1));
      btn.style.animationDelay = `${i * 0.06}s`;
    }
  });
  const hintRow = state.shadowRoot.querySelector(".hint-row");
  if (hintRow instanceof HTMLElement) {
    hintRow.dataset.prevHtml = hintRow.innerHTML;
    const count = Math.min(state.groups.length, 9);
    hintRow.innerHTML = `<span><span class="kbd">1</span>${count > 1 ? `–<span class="kbd">${count}</span>` : ""} ${t("overlay_pickGroupHint", null, "选择搜索组")} · <span class="kbd">Esc</span> ${t("overlay_cancelPick", null, "取消")}</span>`;
  }
}

export function exitGroupPickMode() {
  state.isGroupPickMode = false;
  if (!state.shadowRoot) return;
  const btns = state.shadowRoot.querySelectorAll(".group-btn");
  btns.forEach((btn) => {
    btn.removeAttribute("data-pick-num");
    btn.style.animationDelay = "";
  });
  const hintRow = state.shadowRoot.querySelector(".hint-row");
  if (hintRow instanceof HTMLElement && hintRow.dataset.prevHtml) {
    hintRow.innerHTML = hintRow.dataset.prevHtml;
    delete hintRow.dataset.prevHtml;
  }
}

export function getPickableSites() {
  return state.quickAccessSiteIds
    .map((id) => state.allSites.find((s) => s.id === id))
    .filter((s) => s && normalizeSiteHomeUrl(s.url));
}

function flipGroups(callback) {
  const container = state.shadowRoot?.querySelector(".groups");
  if (!container) {
    callback();
    return;
  }
  container.classList.remove("flip-out", "flip-in");
  container.classList.add("flip-out");
  setTimeout(() => {
    container.classList.remove("flip-out");
    callback();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = state.shadowRoot?.querySelector(".groups");
        if (!c) return;
        c.classList.add("flip-in");
        setTimeout(() => c.classList.remove("flip-in"), 200);
      });
    });
  }, 180);
}

export function enterSitePickMode() {
  if (!state.shadowRoot) return;
  state.isSitePickMode = true;
  const sites = getPickableSites();

  flipGroups(() => {
    const container = state.shadowRoot?.querySelector(".groups");
    if (!container) return;
    container.innerHTML = "";

    if (!sites.length) {
      const empty = document.createElement("span");
      empty.style.cssText = "font-size:13px;color:#888;padding:4px 0;";
      empty.textContent = t("overlay_noSites", null, "暂无可用站点");
      container.appendChild(empty);
    } else {
      sites.forEach((site, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "site-pick-btn";
        btn.textContent = site.name || site.id;
        if (i < 9) {
          btn.setAttribute("data-pick-num", String(i + 1));
          btn.style.animationDelay = `${i * 0.06}s`;
        }
        btn.addEventListener("click", () => {
          state.isSitePickMode = false;
          openSiteWithQuery(site);
        });
        container.appendChild(btn);
      });
    }

    const hintRow = state.shadowRoot?.querySelector(".hint-row");
    if (hintRow instanceof HTMLElement) {
      if (!hintRow.dataset.prevHtml) {
        hintRow.dataset.prevHtml = hintRow.innerHTML;
      }
      const count = Math.min(sites.length, 9);
      hintRow.innerHTML = count > 0
        ? `<span><span class="kbd">1</span>${count > 1 ? `–<span class="kbd">${count}</span>` : ""} ${t("overlay_pickSiteHint", null, "打开站点主页")} · <span class="kbd">Esc</span> ${t("overlay_cancelPick", null, "取消")}</span>`
        : `<span>${t("overlay_noSites", null, "暂无可用站点")} · <span class="kbd">Esc</span> ${t("overlay_cancelPick", null, "取消")}</span>`;
    }
  });
}

export function exitSitePickMode() {
  state.isSitePickMode = false;
  if (!state.shadowRoot) return;

  const hintRow = state.shadowRoot.querySelector(".hint-row");
  if (hintRow instanceof HTMLElement && hintRow.dataset.prevHtml) {
    hintRow.innerHTML = hintRow.dataset.prevHtml;
    delete hintRow.dataset.prevHtml;
  }

  flipGroups(() => {
    renderGroupsIfOpen();
  });
}

export async function runGroup(group) {
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
