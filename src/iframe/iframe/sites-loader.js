import { state } from "./state.js";

export async function loadSites() {
  const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
  if (!response.ok) {
    throw new Error("无法加载站点配置");
  }

  const payload = await response.json();
  const builtinSites = (payload.sites || []).filter((site) => site.enabled !== false);
  const customSites = await loadCustomSitesFromStorage();
  const mergedSites = mergeSiteLists(builtinSites, customSites);
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

export async function loadCustomSitesFromStorage() {
  try {
    const stored = await chrome.storage.local.get(["customSites"]);
    const list = Array.isArray(stored.customSites) ? stored.customSites : [];
    return list
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const name = String(raw.name || "").trim();
        const url = String(raw.url || "").trim();
        const id = String(raw.id || "").trim();
        if (!id || !name || !url) return null;
        return {
          id,
          name,
          url,
          enabled: raw.enabled !== false,
          supportIframe: raw.supportIframe !== false,
          supportUrlQuery: raw.supportUrlQuery !== false && url.includes("{query}"),
          matchPatterns: Array.isArray(raw.matchPatterns) ? raw.matchPatterns.map(String) : [],
          isCustom: true
        };
      })
      .filter((site) => site && site.enabled !== false);
  } catch (_error) {
    return [];
  }
}

export function mergeSiteLists(builtin, custom) {
  const result = Array.isArray(builtin) ? [...builtin] : [];
  const seen = new Set(result.map((site) => site.id));
  (custom || []).forEach((site) => {
    if (!site || seen.has(site.id)) return;
    result.push(site);
    seen.add(site.id);
  });
  return result;
}
