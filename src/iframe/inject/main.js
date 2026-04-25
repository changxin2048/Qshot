import { EXTENSION_ORIGIN } from "./constants.js";
import { executeSiteHandler } from "./executor.js";
import { handleExtractRequest } from "./extractor.js";
import { initEmbedSidebarFix } from "./sidebar-fix.js";
import { diagnosticLog } from "../../shared/diagnostics.js";

const registryCache = { sites: null };
const requestResults = new Map();
const requestsInProgress = new Set();
let lastReportedUrl = "";

async function handleSearchRequest(message) {
  const query = String(message.query || "").trim();
  if (!query) {
    diagnosticLog("inject.search", "empty-query", { site: message.site });
    return { ok: false, siteId: message.site?.id, error: "查询为空" };
  }

  const site = await resolveSite(message.site);
  if (!site || !site.searchHandler) {
    diagnosticLog("inject.search", "site-unmatched", {
      site: message.site,
      hostname: window.location.hostname,
    });
    return {
      ok: false,
      siteId: message.site?.id,
      error: `当前页面未匹配到站点配置: ${window.location.hostname}`,
    };
  }

  try {
    diagnosticLog("inject.search", "handler-start", {
      site,
      hostname: window.location.hostname,
      query,
    });
    await executeSiteHandler(query, site.searchHandler);
    reportCurrentUrl(site);
    diagnosticLog("inject.search", "handler-success", { site });
    return { ok: true, siteId: site.id, message: "已在当前卡片中尝试写入查询并触发发送" };
  } catch (error) {
    diagnosticLog("inject.search", "handler-error", { site, error: error.message });
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
  // Use an already-cached empty list as a graceful fallback. This matters
  // because the fetch can fail in two ways on random third-party pages:
  //   (a) the resource isn't listed in web_accessible_resources (shouldn't
  //       happen anymore, but belt & suspenders), or
  //   (b) an ad/privacy blocker in the user's browser intercepts the
  //       chrome-extension:// URL and returns ERR_BLOCKED_BY_CLIENT.
  // Without this guard every content-script caller (URL reporting, sidebar
  // fix, message listener) throws an uncaught promise rejection on every
  // page load.
  try {
    const response = await fetch(chrome.runtime.getURL("config/siteHandlers.json"));
    if (!response.ok) throw new Error("无法读取站点配置");
    const payload = await response.json();
    registryCache.sites = payload.sites || [];
  } catch (_error) {
    diagnosticLog("inject.registry", "load-failed", { error: _error.message });
    registryCache.sites = [];
  }
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
    diagnosticLog("inject.message", "notify-parent", result);
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
    diagnosticLog("inject.message", "notify-parent-failed", { error: _error.message });
    // no parent in top-tab mode
  }
}

async function setupUrlReporting() {
  let site;
  try {
    site = await resolveSite();
  } catch (_error) {
    return;
  }
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
  // Wrap in try/catch: inject.js runs in every frame (all_frames:true), and
  // for a third-party site's own nested iframe the parent origin is the site
  // itself (e.g. https://gemini.google.com), not our extension. postMessage
  // with a non-matching targetOrigin throws synchronously in that case.
  // We still want the strict origin check to protect data leakage to
  // non-extension parents, so we swallow the resulting error silently.
  try {
    diagnosticLog("inject.url", "report", { site, currentUrl });
    window.parent.postMessage(
      { type: "QSHOT_URL_UPDATE", siteId: site.id, currentUrl },
      targetOrigin
    );
  } catch (_error) {
    diagnosticLog("inject.url", "report-failed", { site, error: _error.message });
    // Parent is not our extension page — that's fine, just skip the report.
  }
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
    diagnosticLog("inject.message", "search-received", {
      site: event.data.site,
      requestId,
      query: event.data.query,
    });
    if (requestId && requestResults.has(requestId)) {
      diagnosticLog("inject.message", "return-cached-result", { requestId, site: event.data.site });
      notifyParentFrame(requestResults.get(requestId));
      return;
    }
    if (requestId && requestsInProgress.has(requestId)) {
      diagnosticLog("inject.message", "duplicate-in-progress", { requestId, site: event.data.site });
      return;
    }
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
