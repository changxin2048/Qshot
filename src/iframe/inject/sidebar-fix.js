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
