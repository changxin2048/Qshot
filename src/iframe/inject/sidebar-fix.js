// Injects site-specific CSS into the AI site's iframe to hide its internal
// sidebar so our compare page layout isn't wasted on e.g. ChatGPT's nav panel.
// Only runs in iframes (not top tabs) and only for sites in SITE_STYLE_MAP.
export async function initEmbedSidebarFix(resolveSite) {
  if (window.parent === window) return;

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
      "/* AI批量搜索：隐藏 DeepSeek 侧边栏，消除左侧留白 */",
      "[class*='sidebar']:not([class*='sidebar-content']):not([class*='sidebar-body']) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; }",
      "[class*='left-panel'], [class*='left_panel'], [class*='nav-panel'], [class*='chat-list'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; }",
      "div:has(nav):not(:has(main)):not(:has([role='main'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; }",
      "[class*='chat-main'], [class*='main-content'], [class*='conversation'] { flex: 1 !important; width: 100% !important; min-width: 0 !important; padding-left: 0 !important; margin-left: 0 !important; }",
    ],
    doubao: [
      "/* AI批量搜索：隐藏豆包侧边栏 / 会话列表 */",
      ...DOMESTIC_CHAT_CSS,
      "[class*='semi-layout-sider'], [class*='conversation-sidebar'], [class*='chat-history'], [class*='left-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
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
    gemini: [
      "/* AI批量搜索：隐藏 Gemini 侧边栏 */",
      ...COMMON_SIDEBAR_CSS,
      "bard-sidenav, mat-sidenav, .mat-drawer-side, .mat-sidenav { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; visibility: hidden !important; }",
      ".mat-drawer-content, mat-sidenav-content { margin-left: 0 !important; width: 100% !important; }",
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectStyle();
      startObserver();
    });
  } else {
    injectStyle();
    startObserver();
  }
  setTimeout(injectStyle, 400);
  setTimeout(injectStyle, 1500);
  setTimeout(injectStyle, 4000);
}
