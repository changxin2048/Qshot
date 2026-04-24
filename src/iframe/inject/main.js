import { EXTENSION_ORIGIN } from "./constants.js";
import { executeSiteHandler } from "./executor.js";
import { handleExtractRequest } from "./extractor.js";
import { initEmbedSidebarFix } from "./sidebar-fix.js";

const registryCache = { sites: null };
const requestResults = new Map();
const requestsInProgress = new Set();
let lastReportedUrl = "";

async function handleSearchRequest(message) {
  const query = String(message.query || "").trim();
  if (!query) {
    return { ok: false, siteId: message.site?.id, error: "查询为空" };
  }

  const site = await resolveSite(message.site);
  if (!site || !site.searchHandler) {
    return {
      ok: false,
      siteId: message.site?.id,
      error: `当前页面未匹配到站点配置: ${window.location.hostname}`,
    };
  }

  try {
    await executeSiteHandler(query, site.searchHandler);
    reportCurrentUrl(site);
    return { ok: true, siteId: site.id, message: "已在当前卡片中尝试写入查询并触发发送" };
  } catch (error) {
    return { ok: false, siteId: site.id, error: error.message };
  }
}

async function resolveSite(explicitSite) {
  if (explicitSite && explicitSite.searchHandler) {
    return explicitSite;
  }
  const registry = await loadRegistry();
  return registry.find((site) => siteMatchesHost(site, window.location.hostname));
}

async function loadRegistry() {
  if (registryCache.sites) return registryCache.sites;
  const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
  if (!response.ok) throw new Error("无法读取站点配置");
  const payload = await response.json();
  registryCache.sites = payload.sites || [];
  return registryCache.sites;
}

function siteMatchesHost(site, hostname) {
  const normalizedHost = normalizeHost(hostname);
  const patterns = Array.isArray(site.matchPatterns) ? site.matchPatterns : [];
  return patterns.some(
    (pattern) =>
      normalizedHost === normalizeHost(pattern) ||
      normalizedHost.endsWith(`.${normalizeHost(pattern)}`)
  );
}

function normalizeHost(hostname) {
  return String(hostname || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function notifyParentFrame(result) {
  if (window.parent === window) return;
  // Strictly target our own extension page. If inject.js happens to run
  // inside a non-extension parent frame, the browser drops the message —
  // prevents leaking query/result to a third-party parent.
  const targetOrigin = EXTENSION_ORIGIN || "*";
  try {
    window.parent.postMessage(
      {
        type: "QSHOT_RESULT",
        siteId: result.siteId,
        requestId: result.requestId,
        ok: result.ok,
        message: result.message,
        error: result.error,
      },
      targetOrigin
    );
  } catch (_error) {
    // no parent in top-tab mode
  }
}

async function setupUrlReporting() {
  const site = await resolveSite();
  if (!site) return;

  reportCurrentUrl(site);

  const originalPushState = history.pushState.bind(history);
  history.pushState = function patchedPushState(...args) {
    const value = originalPushState(...args);
    reportCurrentUrl(site);
    return value;
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function patchedReplaceState(...args) {
    const value = originalReplaceState(...args);
    reportCurrentUrl(site);
    return value;
  };

  window.addEventListener("popstate", () => reportCurrentUrl(site));
  window.addEventListener("hashchange", () => reportCurrentUrl(site));
  window.setInterval(() => reportCurrentUrl(site), 1500);
}

function reportCurrentUrl(site) {
  const currentUrl = window.location.href;
  if (!site || !currentUrl || currentUrl === lastReportedUrl || window.parent === window) {
    return;
  }
  lastReportedUrl = currentUrl;
  const targetOrigin = EXTENSION_ORIGIN || "*";
  window.parent.postMessage(
    { type: "QSHOT_URL_UPDATE", siteId: site.id, currentUrl },
    targetOrigin
  );
}

function installRuntimeMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "SEARCH_SITE_QUERY") return false;

    handleSearchRequest(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          siteId: message.site?.id,
          error: error.message,
        });
      });

    return true;
  });
}

function installWindowMessageListener() {
  window.addEventListener("message", (event) => {
    // Security: only accept messages from our own extension compare page.
    // event.origin must be our chrome-extension://<id> (browser-enforced,
    // unforgeable), and event.source must be window.parent (rules out
    // adversarial nested iframes of the same AI site).
    if (EXTENSION_ORIGIN) {
      if (event.origin !== EXTENSION_ORIGIN) return;
      if (event.source !== window.parent) return;
    }

    if (!event.data) return;

    if (event.data.type === "QSHOT_EXTRACT") {
      handleExtractRequest(event.data);
      return;
    }

    if (event.data.type !== "QSHOT_SEARCH") return;

    const requestId = event.data.requestId;
    if (requestId && requestResults.has(requestId)) {
      notifyParentFrame(requestResults.get(requestId));
      return;
    }
    if (requestId && requestsInProgress.has(requestId)) return;
    if (requestId) requestsInProgress.add(requestId);

    handleSearchRequest(event.data)
      .then((result) => {
        const finalResult = { ...result, requestId };
        if (requestId) {
          requestResults.set(requestId, finalResult);
          requestsInProgress.delete(requestId);
        }
        notifyParentFrame(finalResult);
      })
      .catch((error) => {
        const finalResult = {
          ok: false,
          siteId: event.data.site?.id,
          requestId,
          error: error.message,
        };
        if (requestId) {
          requestResults.set(requestId, finalResult);
          requestsInProgress.delete(requestId);
        }
        notifyParentFrame(finalResult);
      });
  });
}

export function initInjectScript() {
  setupUrlReporting();
  installRuntimeMessageListener();
  installWindowMessageListener();
  initEmbedSidebarFix(resolveSite);
}
