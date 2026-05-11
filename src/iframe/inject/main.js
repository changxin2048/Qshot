import { EXTENSION_ORIGIN } from "./constants.js";
import { executeSiteHandler } from "./executor.js";
import { handleExtractRequest } from "./extractor.js";
import { initEmbedSidebarFix } from "./sidebar-fix.js";
import { deliverFilesToInput, extractInputSelectorsFromHandler } from "./file-paste.js";
import { diagnosticLog } from "../../shared/diagnostics.js";
import { findBuiltinSiteForHost } from "../../shared/site-registry.js";
import { initSelectionToolbar } from "./selection-toolbar.js";

const requestResults = new Map();
const requestsInProgress = new Set();
const REQUEST_RESULT_TTL_MS = 5 * 60 * 1000;
const REQUEST_RESULT_MAX = 80;
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
    scheduleUrlReports(site);
    diagnosticLog("inject.search", "handler-success", { site });
    return {
      ok: true,
      siteId: site.id,
      message: "已在当前卡片中尝试写入查询并触发发送",
      currentUrl: window.location.href
    };
  } catch (error) {
    diagnosticLog("inject.search", "handler-error", { site, error: error.message });
    return { ok: false, siteId: site.id, error: error.message };
  }
}

// 独立的文件分发流程：用户一旦在父页选定文件就立刻执行，和 query/submit 完全解耦。
// 这样上传过程对用户可见（每张卡片各自的输入框上方出现附件 chip），后续提交文本时
// 站点的发送按钮逻辑会自动把"上传完成才允许提交"做掉，避免合并发送时遇到的
// race condition（文本已点 send 但文件还在上行）。
async function handleFilesPasteRequest(message) {
  const files = Array.isArray(message.files) ? message.files : [];
  if (files.length === 0) {
    return { ok: false, siteId: message.site?.id, error: "无文件可粘贴" };
  }

  const site = await resolveSite(message.site);
  if (!site) {
    return {
      ok: false,
      siteId: message.site?.id,
      error: `当前页面未匹配到站点配置: ${window.location.hostname}`,
    };
  }

  try {
    const inputSelectors = extractInputSelectorsFromHandler(site.searchHandler);
    diagnosticLog("inject.paste-files", "start", {
      site,
      fileCount: files.length,
      usedSelectors: inputSelectors,
    });
    const delivered = await deliverFilesToInput(files, inputSelectors);
    diagnosticLog("inject.paste-files", "complete", { site, delivered });
    return {
      ok: !!delivered,
      siteId: site.id,
      message: delivered ? `已粘贴 ${files.length} 个文件` : "未能派发到输入框",
    };
  } catch (error) {
    diagnosticLog("inject.paste-files", "error", { site, error: error.message });
    return { ok: false, siteId: site.id, error: error.message };
  }
}

async function resolveSite(explicitSite) {
  if (explicitSite && explicitSite.searchHandler) {
    return explicitSite;
  }
  try {
    return await findBuiltinSiteForHost(window.location.hostname, { fallbackEmpty: true });
  } catch (_error) {
    diagnosticLog("inject.registry", "load-failed", { error: _error.message });
    return null;
  }
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
        type: result.type || "QSHOT_RESULT",
        siteId: result.siteId,
        requestId: result.requestId,
        ok: result.ok,
        message: result.message,
        error: result.error,
        currentUrl: result.currentUrl,
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

function scheduleUrlReports(site) {
  reportCurrentUrl(site);
  [800, 2000, 5000, 10000].forEach((delayMs) => {
    window.setTimeout(() => reportCurrentUrl(site), delayMs);
  });
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

    if (event.data.type === "QSHOT_PASTE_FILES") {
      const requestId = event.data.requestId;
      diagnosticLog("inject.message", "paste-files-received", {
        site: event.data.site,
        requestId,
        fileCount: Array.isArray(event.data.files) ? event.data.files.length : 0,
      });
      handleFilesPasteRequest(event.data)
        .then((result) => {
          notifyParentFrame({ ...result, requestId, type: "QSHOT_PASTE_RESULT" });
        })
        .catch((error) => {
          notifyParentFrame({
            ok: false,
            siteId: event.data.site?.id,
            requestId,
            type: "QSHOT_PASTE_RESULT",
            error: error.message,
          });
        });
      return;
    }

    if (event.data.type !== "QSHOT_SEARCH") return;

    const requestId = event.data.requestId;
    diagnosticLog("inject.message", "search-received", {
      site: event.data.site,
      requestId,
      query: event.data.query,
    });
    const cachedResult = requestId ? getCachedRequestResult(requestId) : null;
    if (cachedResult) {
      diagnosticLog("inject.message", "return-cached-result", { requestId, site: event.data.site });
      notifyParentFrame(cachedResult);
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
          storeRequestResult(requestId, finalResult);
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
          storeRequestResult(requestId, finalResult);
          requestsInProgress.delete(requestId);
        }
        notifyParentFrame(finalResult);
      });
  });
}

function getCachedRequestResult(requestId) {
  pruneRequestResults();
  return requestResults.get(requestId)?.result || null;
}

function storeRequestResult(requestId, result) {
  requestResults.set(requestId, {
    result,
    storedAt: Date.now()
  });
  pruneRequestResults();
}

function pruneRequestResults() {
  const now = Date.now();
  for (const [requestId, entry] of requestResults) {
    if (!entry || now - entry.storedAt > REQUEST_RESULT_TTL_MS) {
      requestResults.delete(requestId);
    }
  }

  while (requestResults.size > REQUEST_RESULT_MAX) {
    const oldestKey = requestResults.keys().next().value;
    if (!oldestKey) break;
    requestResults.delete(oldestKey);
  }
}

export function initInjectScript() {
  const isGrokFrame = window.parent !== window && /(^|\.)grok\.com$/i.test(window.location.hostname);
  // Grok 对 iframe 启动环境很敏感。不要在它启动前 patch history
  // 或注入隐藏侧边栏 CSS；只保留消息监听，保证后续仍可自动发送。
  if (!isGrokFrame) {
    setupUrlReporting();
  }
  installRuntimeMessageListener();
  installWindowMessageListener();
  if (!isGrokFrame) {
    initEmbedSidebarFix(resolveSite);
  }
  initSelectionToolbar();
}
