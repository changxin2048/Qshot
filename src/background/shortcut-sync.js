import { UI_PREFS_STORAGE_KEY } from "../shared/storage-keys.js";

// 将 {ctrlKey, altKey, shiftKey, metaKey, key} 对象转成 "Ctrl+Alt+Q" 格式的字符串，
// 用于 chrome.commands.update()。
function formatShortcutForCommand(sc) {
  if (!sc || !sc.key) return "";
  const parts = [];
  if (sc.ctrlKey) parts.push("Ctrl");
  if (sc.altKey) parts.push("Alt");
  if (sc.shiftKey) parts.push("Shift");
  if (sc.metaKey) parts.push("MacCtrl");
  if (parts.length === 0) return "";
  const key = sc.key.length === 1 ? sc.key.toUpperCase() : sc.key;
  parts.push(key);
  return parts.join("+");
}

// 从 storage 读取用户设置的快捷键，更新 manifest command 绑定。
export async function syncCommandShortcut(prefs) {
  try {
    let sc = prefs?.overlayShortcut;
    if (!sc) {
      const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
      sc = stored[UI_PREFS_STORAGE_KEY]?.overlayShortcut;
    }
    if (!sc) return;
    const shortcutStr = formatShortcutForCommand(sc);
    if (!shortcutStr) return;
    await chrome.commands.update({ name: "toggle-overlay", shortcut: shortcutStr });
  } catch (_e) {
    /* 快捷键组合不合法或不被支持时忽略，保持 manifest 默认值 */
  }
}
