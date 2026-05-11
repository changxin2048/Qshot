import { state } from "./state.js";
import { loadEnabledSites } from "../../shared/site-registry.js";

// customSites: 已由调用方从 storage 预取的自定义站点数组（可选）。
// 传入时跳过内部的 chrome.storage.local.get，减少一次 IPC 往返。
export async function loadSites(customSites) {
  const options = Array.isArray(customSites) ? { customSites } : {};
  const mergedSites = await loadEnabledSites(options);
  state.allSites = mergedSites;
  if (Array.isArray(state.requestedSiteIds) && state.requestedSiteIds.length > 0) {
    const siteById = new Map(mergedSites.map((site) => [site.id, site]));
    state.sites = state.requestedSiteIds
      .map((siteId) => siteById.get(siteId))
      .filter(Boolean);
  } else {
    state.sites = mergedSites;
  }
  state.hiddenSiteIds.clear();
}
