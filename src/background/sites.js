export const AI_SITE_IDS = [
  "deepseek", "doubao", "kimi", "yuanbao", "qwen",
  "gemini", "chatgpt", "claude", "grok",
];

export async function loadEnabledSites() {
  const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
  if (!response.ok) {
    throw new Error("无法读取站点配置");
  }

  const payload = await response.json();
  const builtin = (payload.sites || []).filter((site) => site.enabled !== false);
  const custom = await loadCustomSitesFromStorage();

  const seen = new Set(builtin.map((site) => site.id));
  const merged = [...builtin];
  custom.forEach((site) => {
    if (!seen.has(site.id)) {
      merged.push(site);
      seen.add(site.id);
    }
  });
  return merged;
}

async function loadCustomSitesFromStorage() {
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
          isCustom: true,
        };
      })
      .filter((site) => site && site.enabled !== false);
  } catch (_error) {
    return [];
  }
}

export function buildSiteUrl(site, query) {
  const url = String(site?.url || "");
  if (!url.includes("{query}")) {
    return url;
  }

  if (query && site?.supportUrlQuery) {
    return url.replace(/\{query\}/g, encodeURIComponent(query));
  }

  // 空 query 或站点不支持 URL 直达：剥离含 {query} 的参数段，回落到基础 URL
  let next = url.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => (sep === "?" ? "?" : ""));
  next = next.replace(/\?&/, "?");
  next = next.replace(/[?&]$/, "");
  // 兜底：万一还残留 {query}，粗暴清掉
  return next.replace(/\{query\}/g, "");
}

export function canSearchByUrl(site) {
  return Boolean(site?.supportUrlQuery && String(site.url || "").includes("{query}"));
}

export function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
