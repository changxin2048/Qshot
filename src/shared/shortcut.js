const DEFAULT_SHORTCUT = Object.freeze({
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  key: "Q",
});

export function normalizeKey(key) {
  if (!key) return "";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function normalizeShortcut(input) {
  if (!input || typeof input !== "object") return { ...DEFAULT_SHORTCUT };
  const key = typeof input.key === "string" && input.key.length > 0 ? input.key : DEFAULT_SHORTCUT.key;
  return {
    ctrlKey: !!input.ctrlKey,
    shiftKey: !!input.shiftKey,
    altKey: !!input.altKey,
    metaKey: !!input.metaKey,
    key: normalizeKey(key),
  };
}

export function matchShortcut(event, sc) {
  if (!sc || !sc.key) return false;
  if ((!!sc.ctrlKey) !== event.ctrlKey) return false;
  if ((!!sc.shiftKey) !== event.shiftKey) return false;
  if ((!!sc.altKey) !== event.altKey) return false;
  if ((!!sc.metaKey) !== event.metaKey) return false;
  return normalizeKey(event.key) === normalizeKey(sc.key);
}

export function formatShortcut(sc) {
  if (!sc || !sc.key) {
    try {
      return chrome?.i18n?.getMessage?.("common_notSet") || "未设置";
    } catch (_e) {
      return "未设置";
    }
  }
  const parts = [];
  if (sc.ctrlKey) parts.push("Ctrl");
  if (sc.altKey) parts.push("Alt");
  if (sc.shiftKey) parts.push("Shift");
  if (sc.metaKey) parts.push(/Mac/i.test(navigator.platform) ? "Cmd" : "Win");
  parts.push(sc.key.length === 1 ? sc.key.toUpperCase() : sc.key);
  return parts.join(" + ");
}

export function isShortcutValid(sc) {
  if (!sc || !sc.key) return false;
  if (sc.key === "Control" || sc.key === "Shift" || sc.key === "Alt" || sc.key === "Meta") return false;
  return sc.ctrlKey || sc.altKey || sc.metaKey || (sc.shiftKey && sc.key.length > 1);
}
