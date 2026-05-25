import { state, DEFAULT_VISIBLE_SITE_IDS } from "./state.js";
import { loadEnabledSites } from "../../shared/site-registry.js";

// storageData: 由调用方预取的存储数据对象，可包含 customSites / defaultCardIds。
// 传入时跳过内部的 chrome.storage.local.get，减少 IPC 往返。
export async function loadSites(storageData) {
  const customSites = Array.isArray(storageData) ? storageData : storageData?.customSites;
  const defaultCardIds = Array.isArray(storageData?.defaultCardIds) ? storageData.defaultCardIds : [];
  const options = Array.isArray(customSites) ? { customSites } : {};
  const mergedSites = await loadEnabledSites(options);
  state.allSites = mergedSites;
  if (Array.isArray(state.requestedSiteIds) && state.requestedSiteIds.length > 0) {
    const siteById = new Map(mergedSites.map((site) => [site.id, site]));
    state.sites = state.requestedSiteIds
      .map((siteId) => siteById.get(siteId))
      .filter(Boolean);
    state.hiddenSiteIds.clear();
  } else {
    state.sites = mergedSites;
    // 首次打开（无 URL 指定站点、无历史恢复）时只显示默认站点
    if (state.restoreHistoryEntryId) {
      state.hiddenSiteIds.clear();
    } else {
      // 优先使用用户在设置页配置的默认卡片列表，否则使用内置默认值
      const hasCustomDefaults = defaultCardIds.length > 0;
      const defaults = new Set(hasCustomDefaults ? defaultCardIds : DEFAULT_VISIBLE_SITE_IDS);
      // 按 defaultCardIds 顺序重排 state.sites，保证卡片和导航条顺序与设置页一致
      if (hasCustomDefaults) {
        const siteById = new Map(mergedSites.map((s) => [s.id, s]));
        const reordered = defaultCardIds.map((id) => siteById.get(id)).filter(Boolean);
        const matchedIds = new Set(reordered.map((s) => s.id));
        const rest = mergedSites.filter((s) => !matchedIds.has(s.id));
        state.sites = [...reordered, ...rest];
      }
      state.hiddenSiteIds.clear();
      for (const site of state.sites) {
        if (!defaults.has(site.id)) {
          state.hiddenSiteIds.add(site.id);
        }
      }
    }
  }
}
