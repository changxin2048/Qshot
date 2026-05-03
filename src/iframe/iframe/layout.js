import { state, elements, BASE_CONFIG } from "./state.js";
import { getSelectedSites, escapeHtml } from "./utils.js";
import { setGlobalStatus } from "./status.js";

// 激活滚动守卫：在 iframe 加载 / 自动发送期间，锁定容器滚动位置，
// 防止 iframe 内部输入框 focus() 导致的祖先容器"对齐可视区"抖动。
export function activateScrollGuard(left, top, durationMs) {
  const container = elements.iframesContainer;

  state.scrollGuardActive = true;
  state.scrollGuardLeft = left;
  state.scrollGuardTop = top;
  container?.classList.add("is-scroll-guarded");
  if (state.scrollGuardTimerId) {
    window.clearTimeout(state.scrollGuardTimerId);
  }

  startScrollGuardLoop();

  state.scrollGuardTimerId = window.setTimeout(() => {
    stopScrollGuard();
  }, Math.max(1000, durationMs | 0));
}

function startScrollGuardLoop() {
  if (state.scrollGuardRafId) {
    return;
  }

  const tick = () => {
    const container = elements.iframesContainer;
    if (!state.scrollGuardActive || !container) {
      state.scrollGuardRafId = null;
      return;
    }

    if (!state.userIsScrolling) {
      if (container.scrollLeft !== state.scrollGuardLeft) {
        container.scrollLeft = state.scrollGuardLeft;
      }
      if (container.scrollTop !== state.scrollGuardTop) {
        container.scrollTop = state.scrollGuardTop;
      }
    }

    state.scrollGuardRafId = window.requestAnimationFrame(tick);
  };

  state.scrollGuardRafId = window.requestAnimationFrame(tick);
}

export function stopScrollGuard() {
  state.scrollGuardActive = false;
  if (state.scrollGuardTimerId) {
    window.clearTimeout(state.scrollGuardTimerId);
    state.scrollGuardTimerId = null;
  }
  if (state.scrollGuardRafId) {
    window.cancelAnimationFrame(state.scrollGuardRafId);
    state.scrollGuardRafId = null;
  }
  elements.iframesContainer?.classList.remove("is-scroll-guarded");
}

// 根据卡片数量估算守卫时长：错峰加载 120ms/个 + 重型 SPA 冷启动需要的稳定时间。
export function getScrollGuardDurationMs(cardCount) {
  const staggerMs = (BASE_CONFIG.iframeStaggerMs != null) ? BASE_CONFIG.iframeStaggerMs : 120;
  const base = 3000;
  const extra = Math.max(0, (cardCount | 0) - 1) * staggerMs;
  return Math.min(base + extra + 1500, 8000);
}

export function updateScrollEdgeBtns() {
  const show = state.layoutRows === 1 && state.layoutMode !== "sidebar";
  const c = elements.iframesContainer;
  const canScrollH = c.scrollWidth > c.clientWidth + 2;
  if (elements.scrollToStartBtn) elements.scrollToStartBtn.hidden = !(show && canScrollH);
  if (elements.scrollToEndBtn) elements.scrollToEndBtn.hidden = !(show && canScrollH);

  const showVert = state.layoutRows > 1 && state.layoutMode !== "sidebar";
  const canScrollV = c.scrollHeight > c.clientHeight + 2;
  if (elements.scrollVertGroup) elements.scrollVertGroup.hidden = !(showVert && canScrollV);
}

export function lockContainerScroll() {
  if (!elements.iframesContainer) {
    return;
  }

  if (state.layoutRows === 1) {
    state.lockedScrollLeft = null;
    state.isScrollLocked = false;
    return;
  }

  state.lockedScrollLeft = elements.iframesContainer.scrollLeft;
  state.isScrollLocked = true;
}

export function restoreLockedScrollPosition() {
  if (state.lockedScrollLeft === null || !elements.iframesContainer) {
    return;
  }

  elements.iframesContainer.scrollLeft = state.lockedScrollLeft;
}

export function scheduleScrollUnlock() {
  if (state.scrollUnlockTimerId) {
    window.clearTimeout(state.scrollUnlockTimerId);
  }

  if (state.layoutRows === 1) {
    state.lockedScrollLeft = null;
    state.isScrollLocked = false;
    state.scrollUnlockTimerId = null;
    return;
  }

  state.scrollUnlockTimerId = window.setTimeout(() => {
    state.lockedScrollLeft = null;
    state.isScrollLocked = false;
    state.scrollUnlockTimerId = null;
  }, 2200);
}

export function updateLayoutUi() {
  const appShell = document.querySelector(".app-shell");

  if (state.layoutMode === "sidebar") {
    appShell?.classList.add("is-sidebar-mode");
    elements.iframesContainer.dataset.layoutRows = "sidebar";
    if (elements.siteNavPanel) elements.siteNavPanel.hidden = false;
    if (elements.cardSizeGroup) elements.cardSizeGroup.hidden = true;
    elements.sidebarLayoutBtn?.classList.add("is-active");
    elements.layoutRowsButtons.forEach((btn) => btn.classList.remove("is-active"));
    elements.cardSizeButtons.forEach((btn) => btn.classList.remove("is-active"));
    updateScrollEdgeBtns();
    return;
  }

  appShell?.classList.remove("is-sidebar-mode");
  if (elements.siteNavPanel) elements.siteNavPanel.hidden = true;
  elements.sidebarLayoutBtn?.classList.remove("is-active");
  state.cardRefs.forEach((ref) => {
    if (ref.cardEl) ref.cardEl.hidden = false;
  });

  const singleRowWidthMap = {
    small: 480,
    medium: 640,
    large: 960
  };
  const socialMediaWidthMap = {
    small: 640,
    medium: 760,
    large: 960
  };

  let effectiveWidth = singleRowWidthMap[state.cardSizeLevel] || singleRowWidthMap.medium;
  const socialMediaWidth = socialMediaWidthMap[state.cardSizeLevel] || socialMediaWidthMap.medium;
  let rowHeight = "calc(100vh - 163px)";
  if (state.layoutRows > 1) {
    rowHeight = state.layoutRows === 2
      ? "calc(100vh - 159px)"
      : "calc(100vh - 179px)";
  }

  state.lockedScrollLeft = null;
  state.isScrollLocked = false;
  if (state.scrollUnlockTimerId) {
    window.clearTimeout(state.scrollUnlockTimerId);
    state.scrollUnlockTimerId = null;
  }

  elements.iframesContainer.style.setProperty("--effective-card-width", `${effectiveWidth}px`);
  elements.iframesContainer.style.setProperty("--social-media-card-width", `${socialMediaWidth}px`);
  elements.iframesContainer.style.setProperty("--row-height", rowHeight);
  document.documentElement.style.setProperty("--card-width", `${effectiveWidth}px`);
  elements.iframesContainer.dataset.layoutRows = String(state.layoutRows);

  elements.layoutRowsButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.layoutRows) === state.layoutRows);
  });

  elements.cardSizeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.cardSize === state.cardSizeLevel);
  });

  if (elements.cardSizeGroup) {
    elements.cardSizeGroup.hidden = state.layoutRows !== 1;
  }
  updateScrollEdgeBtns();
}

export function renderSiteNav() {
  if (!elements.siteNavList) return;
  elements.siteNavList.innerHTML = "";
  const selectedSites = getSelectedSites();
  selectedSites.forEach((site) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-nav-item" + (site.id === state.activeSidebarSiteId ? " is-active" : "");
    btn.dataset.siteId = site.id;
    btn.innerHTML = `<span class="site-nav-item-indicator"></span><span>${escapeHtml(site.name)}</span>`;
    btn.addEventListener("click", () => activateSidebarSite(site.id));
    elements.siteNavList.appendChild(btn);
  });
}

export function activateSidebarSite(siteId) {
  state.activeSidebarSiteId = siteId;
  state.cardRefs.forEach((ref, id) => {
    if (ref.cardEl) ref.cardEl.hidden = id !== siteId;
  });
  if (elements.siteNavList) {
    elements.siteNavList.querySelectorAll(".site-nav-item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.siteId === siteId);
    });
  }
}

// 顶部卡片导航条：显示当前页面所有卡片，一键滚动到对应卡片。
// 不做"当前所在页"的高亮追踪，按钮只在 hover 时才会显黑底，避免滚动时色块乱跳。
export function renderCardNavStrip() {
  const strip = elements.cardNavStrip;
  if (!strip) return;

  strip.innerHTML = "";

  const visibleSites = getSelectedSites().filter((site) => state.cardRefs.has(site.id));
  if (visibleSites.length <= 1) {
    return;
  }

  visibleSites.forEach((site) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "card-nav-chip";
    chip.dataset.siteId = site.id;
    chip.textContent = site.name;
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      scrollToCard(site.id);
    });
    strip.appendChild(chip);
  });
}

export function scrollToCard(siteId) {
  const ref = state.cardRefs.get(siteId);
  if (!ref?.cardEl) return;

  if (state.layoutMode === "sidebar") {
    activateSidebarSite(siteId);
    return;
  }

  const card = ref.cardEl;
  const container = elements.iframesContainer;
  if (!container) return;

  const cardRect = card.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (state.layoutRows === 1) {
    const target = container.scrollLeft + (cardRect.left - containerRect.left) - 12;
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  } else {
    const target = container.scrollTop + (cardRect.top - containerRect.top) - 12;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }
}

export function toggleMaximize(siteId) {
  state.maximizedSiteId = state.maximizedSiteId === siteId ? null : siteId;

  state.cardRefs.forEach((ref, id) => {
    const isMaximized = state.maximizedSiteId === id;
    const shouldHide = Boolean(state.maximizedSiteId) && !isMaximized;

    ref.cardEl.hidden = shouldHide;
    ref.cardEl.style.flexBasis = isMaximized ? "calc(100vw - 28px)" : "";
  });

  if (state.maximizedSiteId) {
    setGlobalStatus("当前卡片已最大化显示。");
  } else {
    setGlobalStatus(`已加载 ${getSelectedSites().length} 个站点。`);
  }
}
