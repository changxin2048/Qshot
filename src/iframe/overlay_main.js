import { matchShortcut, normalizeShortcut } from "../shared/shortcut.js";

const __QSHOT_IS_GROK_SUBFRAME__ = (() => {
  if (window === window.top) {
    return false;
  }
  try {
    return window.location.hostname.replace(/^www\./, "").toLowerCase() === "grok.com";
  } catch (_error) {
    return false;
  }
})();

// Framebusting 防御：第三方站点（YouTube/Reddit/X/TikTok 等）经常用脚本检测是否在 iframe 内，
// 然后通过 top.location 跳出 / 重定向到主页。这里在 MAIN world 拦截这些常见模式。
(function installFramebustingGuard() {
  if (__QSHOT_IS_GROK_SUBFRAME__) return;
  if (window.__QSHOT_FRAMEBUST_GUARD__) return;
  window.__QSHOT_FRAMEBUST_GUARD__ = true;
  if (window === window.top) return;

  // 这个 guard 会伪装 window.top / parent / frameElement，能拦住社媒类站点
  // 主动跳出 iframe，但对 Grok 这类重型 SPA 可能会破坏启动环境。
  // 只在已知会 frame-bust 的站点启用，不要全站注入。
  const host = window.location.hostname.replace(/^www\./, "").toLowerCase();
  const framebustingHosts = new Set([
    "x.com",
    "twitter.com",
    "youtube.com",
    "reddit.com",
    "tiktok.com",
  ]);
  if (!framebustingHosts.has(host)) return;

  // 1) 拦截 top.location.href = ... / top.location = ... / top.location.replace(...)
  try {
    const noopLocation = new Proxy({}, {
      get(_target, prop) {
        if (prop === "replace" || prop === "assign" || prop === "reload") {
          return () => {};
        }
        return "";
      },
      set() { return true; },
    });
    Object.defineProperty(window, "top", { configurable: true, get: () => window.self });
    Object.defineProperty(window, "parent", { configurable: true, get: () => window.self });
    Object.defineProperty(document, "domain", { configurable: true, get: () => window.location.hostname });
    Object.defineProperty(window, "frameElement", { configurable: true, get: () => null });
    void noopLocation;
  } catch (_e) {
    // 某些浏览器版本里这些属性是 non-configurable，吞掉异常即可
  }
})();

(function initQshotMainHotkey() {
  if (__QSHOT_IS_GROK_SUBFRAME__) return;
  if (window.__QSHOT_MAIN_HOTKEY_INSTALLED__) {
    return;
  }
  window.__QSHOT_MAIN_HOTKEY_INSTALLED__ = true;

  // Review note (CWS/Edge Add-ons):
  // - This MAIN-world script only listens for the user-configured hotkey (default Ctrl+Q) and Escape.
  // - It does NOT record or upload keystrokes. It only emits a fire/close signal to the extension isolated world when the configured shortcut matches.
  // - postMessage is used only for same-page MAIN-world <-> isolated-world communication, not for any developer server communication.

  // 与 isolated world 通信使用的 message 常量
  const MSG_CONFIG = "__QSHOT_HOTKEY_CONFIG__";
  const MSG_FIRE = "__QSHOT_HOTKEY_FIRE__";
  const MSG_ESC = "__QSHOT_HOTKEY_ESC__";

  // 本地配置缓存；isolated world 会在启动和配置变更时通过 postMessage 同步过来
  let shortcut = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: "Q" };
  let enabled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== MSG_CONFIG) return;
    if (data.shortcut && typeof data.shortcut === "object") {
      shortcut = normalizeShortcut(data.shortcut);
    }
    if (typeof data.enabled === "boolean") {
      enabled = data.enabled;
    }
  });

  // 在 capture 阶段抢先监听，拦截网站自己的 keydown 处理
  window.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keydown", handleKeydown, true);

  function handleKeydown(event) {
    // Esc：通知 isolated world 关闭浮层（如果已打开）
    if (event.key === "Escape") {
      try { window.postMessage({ type: MSG_ESC }, window.location.origin); } catch (_e) {}
      return;
    }

    if (!enabled) return;
    if (!matchShortcut(event, shortcut)) return;

    // 阻止传播，让网站自己的 listener 收不到
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    // 通知 isolated world 去切换 overlay
    try {
      window.postMessage({ type: MSG_FIRE }, window.location.origin);
    } catch (_err) {
      /* 忽略 */
    }
  }

})();
