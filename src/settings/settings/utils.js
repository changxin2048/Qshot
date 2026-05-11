import { state } from "./state.js";
import { loadBuiltinSites as loadBuiltinSitesFromRegistry } from "../../shared/site-registry.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Intentional no-op retained for parity with the original monolithic file.
// Callers mark a conceptual "dirty" moment; persistence is handled by persistAll.
export function markDirty() {}

export function getGroupById(groupId) {
  return state.groups.find((item) => item.id === groupId) || null;
}

export async function loadBuiltinSites() {
  return loadBuiltinSitesFromRegistry({ fallbackEmpty: false }).then((sites) =>
    sites.filter((site) => site.enabled !== false)
  );
}
