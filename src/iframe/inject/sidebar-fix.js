// Injects site-specific CSS into the AI site's iframe to hide its internal
// sidebar so our compare page layout isn't wasted on e.g. ChatGPT's nav panel.
// Only runs in iframes (not top tabs) and only for sites in SITE_STYLE_MAP.
export async function initEmbedSidebarFix(resolveSite) {
  if (window.parent === window) return;

  // DeepSeek 在窄 iframe 首屏会先按移动端布局展开会话抽屉。
  // 站点配置解析是异步的，等 resolveSite 后再注入会看到侧栏闪一下；
  // 这里按 hostname 先行安装，尽量赶在首屏绘制前压住抽屉。
  if (/(\.|^)deepseek\.com$/i.test(window.location.hostname)) {
    installEarlyDeepSeekSidebarCss();
    startDeepSeekSidebarSuppressor();
  }

  let site;
  try {
    site = await resolveSite(null);
  } catch (_error) {
    return;
  }
  if (!site) return;

  const STYLE_ID = "ai-compare-embed-sidebar-fix";
  const COMMON_SIDEBAR_CSS = [
    "aside, [role='navigation'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
    "[class*='sidebar'], [class*='side-bar'], [class*='sider'], [class*='left-panel'], [class*='left_panel'], [class*='nav-panel'], [class*='conversation-list'], [class*='chat-list'], [class*='session-list'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
    "main, [role='main'], [class*='main-content'], [class*='chat-main'], [class*='conversation'] { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; margin-left: 0 !important; padding-left: 0 !important; }",
  ];
  const DOMESTIC_CHAT_CSS = [
    ...COMMON_SIDEBAR_CSS,
    "nav:not(:has(textarea)):not(:has([contenteditable='true'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
    "[class*='layout'], [class*='container'], [class*='wrapper'] { margin-left: 0 !important; padding-left: 0 !important; }",
  ];

  // Some sites expose important controls behind their own sidebar drawer.
  // Keep Doubao and Gemini out of this map so their in-card sidebar buttons
  // can still open the native drawer/window when clicked.
  const SITE_STYLE_MAP = {
    chatgpt: [
      "/* AI批量搜索：隐藏 ChatGPT 侧边栏，消除左侧留白 */",
      "nav { display: none !important; }",
      "div:has(> nav) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
      "div:has(nav):not(:has(main)):not(:has([role='main'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
      "[class*='z-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; }",
      "[class*='sidebar-header'] { display: none !important; }",
      "[data-testid*='sidebar'], [data-testid*='nav-'] { display: none !important; width: 0 !important; min-width: 0 !important; }",
      "main { flex: 1 !important; width: 100% !important; padding-left: 0 !important; margin-left: 0 !important; min-width: 0 !important; }",
      "main [class*='max-w']:not([class*='max-w-none']) { max-width: 100% !important; }",
    ],
    deepseek: [
      "/* AI批量搜索：隐藏 DeepSeek 侧边栏，消除左侧留白；用户点击时临时解除抑制 */",
      "html:not(.qshot-user-active) [class*='sidebar'], html:not(.qshot-user-active) [class*='side-bar'], html:not(.qshot-user-active) [class*='left-panel'], html:not(.qshot-user-active) [class*='left_panel'], html:not(.qshot-user-active) [class*='nav-panel'], html:not(.qshot-user-active) [class*='chat-list'], html:not(.qshot-user-active) [class*='conversation-list'], html:not(.qshot-user-active) [class*='history'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; transform: translateX(-120%) !important; pointer-events: none !important; }",
      "html:not(.qshot-user-active) aside, html:not(.qshot-user-active) nav, html:not(.qshot-user-active) [role='navigation'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; transform: translateX(-120%) !important; pointer-events: none !important; }",
      "html:not(.qshot-user-active) div:has(> aside), html:not(.qshot-user-active) div:has(> nav), html:not(.qshot-user-active) div:has([class*='sidebar']):not(:has(textarea)):not(:has([contenteditable='true'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
      "/* structural fallback: hide sidebar by DOM position regardless of class names */",
      "html:not(.qshot-user-active) #root > div > div:first-child:not(:has(textarea)):not(:has([contenteditable='true'])):not(:last-child) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; transform: translateX(-120%) !important; pointer-events: none !important; }",
      "main, [role='main'], [class*='chat-main'], [class*='main-content'], [class*='conversation'] { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; padding-left: 0 !important; margin-left: 0 !important; transform: none !important; }",
    ],
    qwen: [
      "/* AI批量搜索：隐藏通义千问 / Qwen 侧边栏 */",
      ...DOMESTIC_CHAT_CSS,
      ".t-layout__sider, .t-chat__sider, .t-chat-sider, [class*='ant-layout-sider'], [class*='conversation-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
    ],
    yuanbao: [
      "/* AI批量搜索：隐藏腾讯元宝侧边栏 / 会话列表 */",
      ...DOMESTIC_CHAT_CSS,
      "[class*='conversation-sidebar'], [class*='history-sidebar'], [class*='chat-history'], [class*='left-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
    ],
    kimi: [
      "/* AI批量搜索：隐藏 Kimi 侧边栏 / 会话列表 */",
      ...DOMESTIC_CHAT_CSS,
      "[class*='conversation-sidebar'], [class*='chat-history'], [class*='left-sidebar'], [class*='nav-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
    ],
    claude: [
      "/* AI批量搜索：隐藏 Claude 侧边栏 */",
      ...COMMON_SIDEBAR_CSS,
    ],
    grok: [
      "/* AI批量搜索：隐藏 Grok 侧边栏 */",
      ...COMMON_SIDEBAR_CSS,
    ],
  };

  const cssLines = SITE_STYLE_MAP[site.id];
  if (!cssLines) return;

  function injectStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = cssLines.join("\n");
  }

  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!document.getElementById(STYLE_ID)) injectStyle();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function startSiteSuppressors() {
    if (site.id === "deepseek") {
      startDeepSeekSidebarSuppressor();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectStyle();
      startObserver();
      startSiteSuppressors();
    });
  } else {
    injectStyle();
    startObserver();
    startSiteSuppressors();
  }
  setTimeout(injectStyle, 400);
  setTimeout(injectStyle, 1500);
  setTimeout(injectStyle, 4000);
}

function installEarlyDeepSeekSidebarCss() {
  const STYLE_ID = "ai-compare-deepseek-early-sidebar-fix";
  if (document.getElementById(STYLE_ID)) return;

  // 用 :not(.qshot-user-active) 包裹所有规则，
  // 当用户主动点击时在 html 上加该 class，CSS 抑制临时失效
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    "/* Qshot: prevent DeepSeek mobile drawer from flashing in iframe */",
    "html:not(.qshot-user-active) aside, html:not(.qshot-user-active) nav, html:not(.qshot-user-active) [role='navigation'] { display: none !important; visibility: hidden !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; opacity: 0 !important; overflow: hidden !important; pointer-events: none !important; transform: translateX(-120%) !important; }",
    "html:not(.qshot-user-active) [class*='sidebar'], html:not(.qshot-user-active) [class*='side-bar'], html:not(.qshot-user-active) [class*='sider'], html:not(.qshot-user-active) [class*='drawer'], html:not(.qshot-user-active) [class*='chat-list'], html:not(.qshot-user-active) [class*='conversation-list'], html:not(.qshot-user-active) [class*='history'] { display: none !important; visibility: hidden !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; opacity: 0 !important; overflow: hidden !important; pointer-events: none !important; transform: translateX(-120%) !important; }",
    "html:not(.qshot-user-active) [class*='mask'], html:not(.qshot-user-active) [class*='overlay'], html:not(.qshot-user-active) [class*='backdrop'] { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }",
    "main, [role='main'], [class*='chat-main'], [class*='main-content'] { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; padding-left: 0 !important; transform: none !important; }",
    "/* structural fallback: hide first non-input sibling in root layout regardless of class names */",
    "html:not(.qshot-user-active) #root > div > div:first-child:not(:has(textarea)):not(:has([contenteditable='true'])):not(:last-child) { display: none !important; visibility: hidden !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; opacity: 0 !important; overflow: hidden !important; pointer-events: none !important; transform: translateX(-120%) !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
  ].join("\n");

  (document.head || document.documentElement).appendChild(style);

  // 监听用户点击：点击后 2.5 秒内解除 CSS 抑制，让侧边栏能正常展开
  let clearTimer = null;
  document.addEventListener("click", () => {
    document.documentElement.classList.add("qshot-user-active");
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      document.documentElement.classList.remove("qshot-user-active");
    }, 2500);
  }, true);
}

function startDeepSeekSidebarSuppressor() {
  if (window.__QSHOT_DEEPSEEK_SIDEBAR_SUPPRESSOR__) return;
  window.__QSHOT_DEEPSEEK_SIDEBAR_SUPPRESSOR__ = true;

  // 用户主动点击后暂停抑制 2.5 秒，让侧边栏能正常响应交互
  let userClickPauseUntil = 0;
  let clearInlineTimer = null;
  document.addEventListener("click", () => {
    userClickPauseUntil = Date.now() + 2500;
    // 清除 forceHideElement 留下的 inline style，让侧边栏能正常展示
    document.querySelectorAll("[data-qshot-deepseek-hidden='true']").forEach((el) => {
      el.removeAttribute("data-qshot-deepseek-hidden");
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
      el.style.removeProperty("opacity");
      el.style.removeProperty("pointer-events");
      el.style.removeProperty("width");
      el.style.removeProperty("min-width");
      el.style.removeProperty("max-width");
      el.style.removeProperty("transform");
    });
    clearTimeout(clearInlineTimer);
    clearInlineTimer = setTimeout(() => {
      userClickPauseUntil = 0;
    }, 2500);
  }, true);

  let scheduled = false;
  const schedule = () => {
    if (Date.now() < userClickPauseUntil) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (Date.now() < userClickPauseUntil) return;
      suppressDeepSeekSidebar();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "aria-hidden"],
    childList: true,
    subtree: true,
  });

  [0, 50, 120, 250, 500, 1000, 2000, 4000].forEach((delayMs) => {
    setTimeout(schedule, delayMs);
  });
}

function suppressDeepSeekSidebar() {
  const body = document.body;
  if (!body) return;

  const selector = [
    "aside",
    "nav",
    "[role='navigation']",
    "[class*='sidebar']",
    "[class*='side-bar']",
    "[class*='sider']",
    "[class*='drawer']",
    "[class*='mask']",
    "[class*='modal']",
    "[class*='overlay']",
    "[class*='history']",
    "[class*='conversation']",
    "[class*='chat-list']",
  ].join(",");

  document.querySelectorAll(selector).forEach((element) => {
    if (isDeepSeekSidebarLike(element) || isDeepSeekBackdropLike(element)) {
      forceHideElement(element);
    }
  });

  Array.from(body.children).forEach((element) => {
    if (isDeepSeekSidebarLike(element) || isDeepSeekBackdropLike(element)) {
      forceHideElement(element);
    }
  });

  // 结构性扫描：类名哈希化时上面的选择器会全部失效，
  // 这里从 #root 出发递归遍历，用文字内容+位置检测侧边栏。
  const root = document.getElementById("root");
  if (root) {
    scanDeepSeekTree(root, 0);
  }
}

function scanDeepSeekTree(parent, depth) {
  if (depth > 4) return;
  for (const child of Array.from(parent.children)) {
    if (child.dataset.qshotDeepseekHidden === "true") continue;
    if (isDeepSeekSidebarLike(child) || isDeepSeekBackdropLike(child)) {
      forceHideElement(child);
    } else {
      scanDeepSeekTree(child, depth + 1);
    }
  }
}

function isDeepSeekSidebarLike(element) {
  if (!(element instanceof HTMLElement) || element.dataset.qshotKeep === "true") {
    return false;
  }
  if (element.querySelector("textarea, [contenteditable='true']")) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const className = typeof element.className === "string" ? element.className : "";
  const text = String(element.innerText || element.textContent || "").slice(0, 600);
  const looksLikeDeepSeekMenu =
    /deepseek|新对话|开启新对话|今天|昨天|历史|会话|chat/i.test(text) ||
    /sidebar|side-bar|sider|drawer|history|conversation|chat-list/i.test(className);

  return looksLikeDeepSeekMenu &&
    rect.left <= Math.max(24, viewportWidth * 0.08) &&
    rect.top <= 96 &&
    rect.width >= 180 &&
    rect.width <= Math.max(420, viewportWidth * 0.72) &&
    rect.height >= Math.max(360, viewportHeight * 0.65);
}

function isDeepSeekBackdropLike(element) {
  if (!(element instanceof HTMLElement) || element.querySelector("textarea, [contenteditable='true']")) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  if (rect.width < viewportWidth * 0.45 || rect.height < viewportHeight * 0.65) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const background = style.backgroundColor || "";
  const hasDimBackground = /rgba?\([^)]*,\s*(0\.[2-9]|[1-9])\)/.test(background);
  const isOverlayPosition = style.position === "fixed" || style.position === "absolute" || style.position === "sticky";
  return isOverlayPosition && hasDimBackground;
}

function forceHideElement(element) {
  element.dataset.qshotDeepseekHidden = "true";
  element.style.setProperty("display", "none", "important");
  element.style.setProperty("visibility", "hidden", "important");
  element.style.setProperty("opacity", "0", "important");
  element.style.setProperty("pointer-events", "none", "important");
  element.style.setProperty("width", "0", "important");
  element.style.setProperty("min-width", "0", "important");
  element.style.setProperty("max-width", "0", "important");
  element.style.setProperty("transform", "translateX(-120%)", "important");
}
