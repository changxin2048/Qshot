const SITE_HANDLERS_PATH = "config/siteHandlers.json";

let builtinSites = null;
let builtinSitesPromise = null;
let domainIndex = null;

export async function loadBuiltinSites(options = {}) {
  const { fallbackEmpty = false } = options;

  if (builtinSites) return builtinSites;
  if (builtinSitesPromise) return builtinSitesPromise;

  builtinSitesPromise = fetch(chrome.runtime.getURL(SITE_HANDLERS_PATH))
    .then((response) => {
      if (!response.ok) throw new Error("无法读取站点配置");
      return response.json();
    })
    .then((payload) => {
      builtinSites = Array.isArray(payload.sites) ? payload.sites : [];
      domainIndex = buildDomainIndex(builtinSites);
      return builtinSites;
    })
    .catch((error) => {
      if (!fallbackEmpty) throw error;
      builtinSites = [];
      domainIndex = new Map();
      return builtinSites;
    })
    .finally(() => {
      builtinSitesPromise = null;
    });

  return builtinSitesPromise;
}

export async function findBuiltinSiteForHost(hostname, options = {}) {
  const sites = await loadBuiltinSites(options);
  const normalizedHost = normalizeHost(hostname);
  if (!normalizedHost) return null;

  const index = domainIndex || buildDomainIndex(sites);
  for (const candidate of getHostCandidates(normalizedHost)) {
    const matches = index.get(candidate);
    if (matches?.length) return matches[0];
  }

  // Fallback for unusual match patterns that are not plain domains.
  return sites.find((site) => siteMatchesHost(site, normalizedHost)) || null;
}

export function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\*:\/\//, "")
    .replace(/^https?:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function buildDomainIndex(sites) {
  const index = new Map();
  (sites || []).forEach((site) => {
    const patterns = Array.isArray(site.matchPatterns) ? site.matchPatterns : [];
    patterns.forEach((pattern) => {
      const host = normalizeHost(pattern);
      if (!host) return;
      const list = index.get(host) || [];
      list.push(site);
      index.set(host, list);
    });
  });
  return index;
}

function getHostCandidates(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  const candidates = [];
  for (let index = 0; index < parts.length; index += 1) {
    candidates.push(parts.slice(index).join("."));
  }
  return candidates;
}

function siteMatchesHost(site, normalizedHost) {
  const patterns = Array.isArray(site.matchPatterns) ? site.matchPatterns : [];
  return patterns.some((pattern) => {
    const host = normalizeHost(pattern);
    return normalizedHost === host || normalizedHost.endsWith(`.${host}`);
  });
}
