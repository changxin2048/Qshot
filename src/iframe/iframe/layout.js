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
  // 按视觉顺序（CSS order）渲染侧边栏，与底部导航条保持一致
  const cardEls = _getSortedCardEls(elements.iframesContainer);
  const selectedSites = cardEls
    .map((el) => state.cardRefs.get(el.dataset.siteId)?.site)
    .filter(Boolean);
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
// 按 CSS order 属性排序的卡片列表（order 相同时按 DOM 顺序兜底）。
// 用 CSS order 视觉重排可避免移动 iframe DOM 节点导致页面刷新。
function _getSortedCardEls(container) {
  const children = Array.from(container.querySelectorAll(".iframe-card"));
  return children.slice().sort((a, b) => {
    const oa = a.style.order !== "" ? parseInt(a.style.order, 10) : 0;
    const ob = b.style.order !== "" ? parseInt(b.style.order, 10) : 0;
    if (oa !== ob) return oa - ob;
    return children.indexOf(a) - children.indexOf(b);
  });
}

// 新增卡片后调用：若已有卡片设了显式 order，则给新卡片赋一个更大的值，
// 保证它出现在视觉末尾而不是因默认值 0 跑到最前面。
export function onCardAdded(cardEl) {
  const container = elements.iframesContainer;
  if (!container) return;
  const others = Array.from(container.querySelectorAll(".iframe-card")).filter((el) => el !== cardEl);
  let maxOrder = -Infinity;
  let hasExplicit = false;
  others.forEach((el) => {
    if (el.style.order !== "") {
      hasExplicit = true;
      const o = parseInt(el.style.order, 10);
      if (!isNaN(o) && o > maxOrder) maxOrder = o;
    }
  });
  if (hasExplicit) {
    cardEl.style.order = String(isFinite(maxOrder) ? maxOrder + 1 : 0);
  }
}

export function renderCardNavStrip() {
  const strip = elements.cardNavStrip;
  if (!strip) return;

  strip.innerHTML = "";

  // 按视觉顺序（CSS order）读取卡片，保证与顶部卡片完全一致。
  const cardEls = _getSortedCardEls(elements.iframesContainer);
  const visibleSites = cardEls
    .map((el) => state.cardRefs.get(el.dataset.siteId)?.site)
    .filter(Boolean);

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
      if (!_drag.active) {
        scrollToCard(site.id);
      }
    });
    _attachChipDrag(chip, site.id);
    strip.appendChild(chip);
  });
}

// ── 底部导航条拖拽排序 ──────────────────────────────────────────

const _drag = {
  active: false,
  siteId: null,
  chipEl: null,
  ghostEl: null,
  indicatorEl: null,
  targetIndex: -1,
  offsetX: 0,
  offsetY: 0,
};

function _attachChipDrag(chip, siteId) {
  let timer = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let moved = false;

  chip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    moved = false;
    chip.classList.add("is-long-press-pending");
    timer = setTimeout(() => {
      timer = null;
      if (!moved) {
        chip.classList.remove("is-long-press-pending");
        try { chip.setPointerCapture(pointerId); } catch (_) {}
        _startDrag(chip, siteId, e.clientX, e.clientY);
      }
    }, 480);
  });

  chip.addEventListener("pointermove", (e) => {
    if (timer === null) return;
    if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) {
      moved = true;
      chip.classList.remove("is-long-press-pending");
      clearTimeout(timer);
      timer = null;
    }
  });

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    chip.classList.remove("is-long-press-pending");
  };
  chip.addEventListener("pointerup", cancel);
  chip.addEventListener("pointercancel", cancel);
}

function _startDrag(chip, siteId, clientX, clientY) {
  _drag.active = true;
  _drag.siteId = siteId;
  _drag.chipEl = chip;
  _drag.targetIndex = -1;

  chip.classList.add("is-drag-source");

  const rect = chip.getBoundingClientRect();
  _drag.offsetX = clientX - rect.left;
  _drag.offsetY = clientY - rect.top;

  // 创建跟随鼠标的幽灵元素
  const ghost = document.createElement("button");
  ghost.type = "button";
  ghost.className = "card-nav-chip is-drag-ghost";
  ghost.textContent = chip.textContent;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  _drag.ghostEl = ghost;

  // 创建插入位置指示条（fixed 定位避免被 overflow 裁剪）
  const indicator = document.createElement("div");
  indicator.style.cssText = [
    "position:fixed",
    `top:${rect.top - 2}px`,
    `height:${rect.height + 4}px`,
    "width:3px",
    "border-radius:2px",
    "background:#2563eb",
    "pointer-events:none",
    "z-index:9999",
    "display:none",
    "transform:translateX(-50%)",
  ].join(";");
  document.body.appendChild(indicator);
  _drag.indicatorEl = indicator;

  document.addEventListener("pointermove", _onDragMove);
  document.addEventListener("pointerup", _onDragEnd);
  document.addEventListener("pointercancel", _onDragEnd);
}

function _onDragMove(e) {
  if (!_drag.active) return;

  // 移动幽灵
  const ghost = _drag.ghostEl;
  if (ghost) {
    ghost.style.left = `${e.clientX - _drag.offsetX}px`;
    ghost.style.top = `${e.clientY - _drag.offsetY}px`;
  }

  // 计算插入位置（基于非被拖拽的 chip）
  const strip = elements.cardNavStrip;
  const indicator = _drag.indicatorEl;
  if (!strip || !indicator) return;

  const chips = Array.from(strip.querySelectorAll(".card-nav-chip:not(.is-drag-source)"));
  let targetIndex = chips.length;
  let indicatorX = null;

  if (chips.length === 0) {
    targetIndex = 0;
    const stripRect = strip.getBoundingClientRect();
    indicatorX = stripRect.left + 4;
  } else {
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        targetIndex = i;
        indicatorX = r.left;
        break;
      }
      if (i === chips.length - 1) {
        targetIndex = chips.length;
        indicatorX = r.right;
      }
    }
  }

  _drag.targetIndex = targetIndex;
  indicator.style.display = "block";
  indicator.style.left = `${indicatorX}px`;
}

function _onDragEnd() {
  document.removeEventListener("pointermove", _onDragMove);
  document.removeEventListener("pointerup", _onDragEnd);
  document.removeEventListener("pointercancel", _onDragEnd);

  if (_drag.ghostEl) { _drag.ghostEl.remove(); _drag.ghostEl = null; }
  if (_drag.indicatorEl) { _drag.indicatorEl.remove(); _drag.indicatorEl = null; }
  if (_drag.chipEl) { _drag.chipEl.classList.remove("is-drag-source"); }

  const { siteId, targetIndex } = _drag;
  _drag.active = false;
  _drag.siteId = null;
  _drag.chipEl = null;
  _drag.targetIndex = -1;

  if (siteId && targetIndex >= 0) {
    _executeReorder(siteId, targetIndex);
  }
}

function _executeReorder(siteId, targetIndex) {
  const container = elements.iframesContainer;
  if (!container) return;

  // 按当前视觉顺序读取 id 列表
  const sortedEls = _getSortedCardEls(container);
  const currentIds = sortedEls.map((el) => el.dataset.siteId);

  // 计算新顺序
  const withoutDragged = currentIds.filter((id) => id !== siteId);
  const clampedTarget = Math.min(Math.max(0, targetIndex), withoutDragged.length);
  withoutDragged.splice(clampedTarget, 0, siteId);
  const newOrder = withoutDragged;

  // 用 CSS order 属性改变视觉顺序，完全不移动 DOM 节点，
  // 避免 iframe 被浏览器重新加载（保留当前对话内容）。
  newOrder.forEach((id, index) => {
    const ref = state.cardRefs.get(id);
    if (ref?.cardEl) {
      ref.cardEl.style.order = String(index);
    }
  });

  // 同步更新 state.sites，保证下次 renderCards() 时顺序一致
  const siteById = new Map(state.sites.map((s) => [s.id, s]));
  const newOrderSet = new Set(newOrder);
  const reorderedSites = newOrder.map((id) => siteById.get(id)).filter(Boolean);
  const otherSites = state.sites.filter((s) => !newOrderSet.has(s.id));
  state.sites = [...reorderedSites, ...otherSites];

  // 重新渲染导航条和侧边栏（如有）
  renderCardNavStrip();
  if (state.layoutMode === "sidebar") {
    renderSiteNav();
  }
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
