import { state, elements, BASE_CONFIG } from "./state.js";
import {
  getSelectedSites,
  getQuery,
  buildSiteUrl,
  createRequestId,
  clearAutoSendFlagFromUrl,
} from "./utils.js";
import { setSiteStatus, setGlobalStatus, toggleGlobalButtons, updateSendBtnState } from "./status.js";
import {
  activateScrollGuard,
  getScrollGuardDurationMs,
  lockContainerScroll,
  restoreLockedScrollPosition,
  scheduleScrollUnlock,
} from "./layout.js";
import { clearIframeTimers, removeFromLoadQueue, pumpLoadQueue } from "./load-queue.js";
import { saveSearchHistory, refreshHistoryEntryUrls } from "./history.js";
import { diagnosticLog } from "../../shared/diagnostics.js";

export async function handleSendSelected(options = {}) {
  if (state.isSending) {
    diagnosticLog("compare.send", "ignored-while-sending");
    return;
  }

  const { clearInputAfterSend = true } = options;
  const query = getQuery();

  if (!query) {
    diagnosticLog("compare.send", "empty-query");
    setGlobalStatus("请输入问题后再发送。", true);
    return;
  }

  const selectedSites = getSelectedSites();
  if (selectedSites.length === 0) {
    diagnosticLog("compare.send", "no-selected-sites");
    setGlobalStatus("没有可发送的站点。", true);
    return;
  }

  state.isSending = true;
  diagnosticLog("compare.send", "start", {
    selectedCount: selectedSites.length,
    siteIds: selectedSites.map((site) => site.id),
    query,
  });

  try {
    lockContainerScroll();
    toggleGlobalButtons(true);
    setGlobalStatus(`正在向 ${selectedSites.length} 个站点分发问题...`);

    state.lastSearchQuery = query;
    state.lastSearchTime = new Date().toLocaleString();

    activateScrollGuard(
      elements.iframesContainer.scrollLeft,
      elements.iframesContainer.scrollTop,
      getScrollGuardDurationMs(selectedSites.length)
    );

    if (clearInputAfterSend) {
      elements.queryInput.value = "";
      updateSendBtnState();
    }

    const historyEntryPromise = saveSearchHistory(query, selectedSites).catch(() => null);
    const results = await sendSitesWithConcurrency(selectedSites, query);
    const successCount = results.filter((item) => item && item.ok).length;
    const failedCount = results.length - successCount;
    diagnosticLog("compare.send", "complete", { successCount, failedCount, results });

    const historyEntryId = await historyEntryPromise;
    await refreshHistoryEntryUrls(historyEntryId, selectedSites);
    setGlobalStatus(`发送完成：成功 ${successCount} 个，失败 ${failedCount} 个。`, failedCount > 0);
    scheduleScrollUnlock();
  } finally {
    state.isSending = false;
    diagnosticLog("compare.send", "unlock");
    toggleGlobalButtons(false);
  }
}

async function sendSitesWithConcurrency(sites, query) {
  const results = new Array(sites.length);
  const configuredConcurrency = Number.isFinite(BASE_CONFIG.sendConcurrency)
    ? BASE_CONFIG.sendConcurrency
    : 2;
  const concurrency = Math.max(1, Math.min(sites.length, configuredConcurrency));
  let nextIndex = 0;

  async function worker(workerId) {
    while (nextIndex < sites.length) {
      const index = nextIndex;
      nextIndex += 1;

      const site = sites[index];
      diagnosticLog("compare.send", "pooled-dispatch", {
        siteId: site.id,
        index: index + 1,
        total: sites.length,
        workerId,
        concurrency,
      });
      setSiteStatus(site.id, `正在发送（${index + 1}/${sites.length}）...`);

      try {
        results[index] = await sendSmartToSite(site, query, 0);
      } catch (error) {
        diagnosticLog("compare.send", "pooled-dispatch-error", {
          siteId: site.id,
          workerId,
          error: error.message,
        });
        results[index] = {
          ok: false,
          siteId: site.id,
          error: error.message || "发送失败"
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, (_item, index) => worker(index + 1))
  );

  return results;
}

export async function maybeAutoSendFromUrl() {
  if (!state.shouldAutoSend) {
    return;
  }

  const query = getQuery();
  if (!query) {
    state.shouldAutoSend = false;
    return;
  }

  state.shouldAutoSend = false;
  clearAutoSendFlagFromUrl();
  await handleSendSelected({ clearInputAfterSend: true });
}

export async function sendSmartToSite(site, query, dispatchDelayMs = 0) {
  if (site.supportIframe === false) {
    diagnosticLog("compare.site", "external-tab-route", { site });
    return openExternalSiteForQuery(site, query);
  }

  const ref = state.cardRefs.get(site.id);
  if (!ref || !ref.iframeEl) {
    diagnosticLog("compare.site", "missing-iframe", { site });
    return {
      ok: false,
      siteId: site.id,
      error: "卡片 iframe 不可用"
    };
  }

  if (site.supportUrlQuery && String(site.url || "").includes("{query}")) {
    diagnosticLog("compare.site", "url-template-route", { site });
    return navigateByUrlTemplate(ref, query);
  }

  if (!ref.loaded) {
    diagnosticLog("compare.site", "wait-for-iframe-load", { site });
    settlePendingQuery(ref, {
      ok: false,
      siteId: site.id,
      error: "已取消上一条等待中的发送任务"
    });
    return new Promise((resolve) => {
      ref.pendingQuery = query;
      ref.pendingQueryDelayMs = dispatchDelayMs;
      ref.pendingQueryResolver = resolve;
      setSiteStatus(site.id, "卡片加载中，完成后将自动发送...");
    });
  }

  ref.pendingQuery = "";
  ref.pendingQueryDelayMs = 0;
  ref.pendingQueryResolver = null;
  diagnosticLog("compare.site", "dispatch-route", { site });
  return dispatchSearchWithRetries(ref, query, dispatchDelayMs);
}

async function openExternalSiteForQuery(site, query) {
  const targetUrl = buildSiteUrl(site, query);
  if (!targetUrl) {
    return {
      ok: false,
      siteId: site.id,
      error: "站点 URL 配置无效"
    };
  }

  const response = await chrome.runtime.sendMessage({
    type: "OPEN_SITE_TAB_AND_SEND",
    site,
    query
  });

  if (!response?.ok) {
    return {
      ok: false,
      siteId: site.id,
      error: response?.error || "新标签页打开失败"
    };
  }

  return {
    ok: true,
    siteId: site.id,
    message: "已在新标签页打开"
  };
}

export function navigateByUrlTemplate(ref, query) {
  const targetUrl = buildSiteUrl(ref.site, query);
  if (!targetUrl) {
    return Promise.resolve({
      ok: false,
      siteId: ref.site.id,
      error: "站点 URL 配置无效"
    });
  }

  const iframe = ref.iframeEl;
  if (!iframe) {
    return Promise.resolve({
      ok: false,
      siteId: ref.site.id,
      error: "卡片 iframe 不可用"
    });
  }

  // 同步更新 _targetSrc，防止队列里待加载的 beginIframeLoad 用旧 URL 覆盖刚设好的 query URL。
  // 场景：并发槽位满时，TikTok/社媒卡片还在排队，autosend 已调用 navigateByUrlTemplate 设好了带
  // query 的 src，但之后 beginIframeLoad 才轮到该卡片，若不更新 _targetSrc 会覆盖回空 URL。
  ref._targetSrc = targetUrl;

  setSiteStatus(ref.site.id, "正在通过 URL 直达搜索结果页...");
  diagnosticLog("compare.url", "navigate-start", { site: ref.site, targetUrl });

  return new Promise((resolve) => {
    const timeoutMs = 12000;
    let done = false;

    const cleanup = () => {
      iframe.removeEventListener("load", handleLoad, true);
      iframe.removeEventListener("error", handleError, true);
    };

    const finish = (result) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      diagnosticLog("compare.url", "navigate-finish", { site: ref.site, result });
      resolve(result);
    };

    const handleLoad = () => {
      ref.loaded = true;
      ref.currentUrl = iframe.src || targetUrl;
      finish({
        ok: true,
        siteId: ref.site.id,
        message: "已通过 URL 跳转到搜索结果页"
      });
    };

    const handleError = () => {
      finish({
        ok: false,
        siteId: ref.site.id,
        error: "URL 跳转失败，页面未响应"
      });
    };

    iframe.addEventListener("load", handleLoad, true);
    iframe.addEventListener("error", handleError, true);

    window.setTimeout(() => {
      finish({
        ok: false,
        siteId: ref.site.id,
        error: "URL 跳转超时，未进入目标结果页"
      });
    }, timeoutMs);

    iframe.src = targetUrl;
  });
}

export function dispatchSearchWithRetries(ref, query, initialDelayMs) {
  const requestId = createRequestId();
  diagnosticLog("compare.dispatch", "created", { site: ref.site, requestId, query });

  return new Promise((resolve) => {
    const pendingDispatch = {
      requestId,
      ref,
      query,
      resolve,
      attempts: 0,
      maxAttempts: BASE_CONFIG.tabSendRetryCount || 8,
      retryDelayMs: BASE_CONFIG.tabSendRetryDelayMs || 1800,
      timerId: null,
      completed: false
    };

    state.pendingDispatches.set(requestId, pendingDispatch);
    scheduleDispatchAttempt(pendingDispatch, initialDelayMs);
  });
}

export function scheduleDispatchAttempt(pendingDispatch, delayMs) {
  pendingDispatch.timerId = window.setTimeout(() => {
    if (pendingDispatch.completed) {
      return;
    }

    restoreLockedScrollPosition();

    pendingDispatch.attempts += 1;

    if (!pendingDispatch.ref.iframeEl?.contentWindow) {
      diagnosticLog("compare.dispatch", "missing-content-window", {
        site: pendingDispatch.ref.site,
        requestId: pendingDispatch.requestId,
        attempt: pendingDispatch.attempts,
      });
      if (pendingDispatch.attempts < pendingDispatch.maxAttempts) {
        scheduleDispatchAttempt(pendingDispatch, pendingDispatch.retryDelayMs);
      } else {
        finalizePendingDispatch(pendingDispatch.requestId, {
          ok: false,
          siteId: pendingDispatch.ref.site.id,
          error: "卡片 iframe 不可用"
        });
      }
      return;
    }

    try {
      // 跨域 iframe 通信：固定使用 "*" 作为 targetOrigin。
      // 原因：Kimi（www.kimi.com → kimi.com）、通义（www.qianwen.com → chat.qwen.ai）
      // 等站点在 iframe 内会发生跨 origin 重定向，若使用初始 src 的 origin 做 targetOrigin，
      // 浏览器会静默丢弃 postMessage，inject.js 永远收不到 QSHOT_SEARCH，输入框始终为空。
      // 安全性由 inject.js 接收端的 event.origin===EXTENSION_ORIGIN 校验保证，
      // 发送端使用 "*" 不降低安全等级，仅意味着查询文本对 iframe 内其他 message 监听器可见
      // （而 iframe 本身是用户已登录的 AI 站点，属可信范围）。
      const targetOrigin = "*";
      diagnosticLog("compare.dispatch", "post-message", {
        site: pendingDispatch.ref.site,
        requestId: pendingDispatch.requestId,
        attempt: pendingDispatch.attempts,
      });
      pendingDispatch.ref.iframeEl.contentWindow.postMessage(
        {
          type: "QSHOT_SEARCH",
          query: pendingDispatch.query,
          site: pendingDispatch.ref.site,
          requestId: pendingDispatch.requestId
        },
        targetOrigin
      );
      setSiteStatus(pendingDispatch.ref.site.id, "查询已发送到卡片 iframe，等待页面响应...");
      restoreLockedScrollPosition();
    } catch (error) {
      diagnosticLog("compare.dispatch", "post-message-error", {
        site: pendingDispatch.ref.site,
        requestId: pendingDispatch.requestId,
        attempt: pendingDispatch.attempts,
        error: error.message,
      });
      if (pendingDispatch.attempts < pendingDispatch.maxAttempts) {
        scheduleDispatchAttempt(pendingDispatch, pendingDispatch.retryDelayMs);
      } else {
        finalizePendingDispatch(pendingDispatch.requestId, {
          ok: false,
          siteId: pendingDispatch.ref.site.id,
          error: error.message
        });
      }
      return;
    }

    scheduleDispatchAttemptFailure(pendingDispatch);
  }, delayMs);
}

export function scheduleDispatchAttemptFailure(pendingDispatch) {
  pendingDispatch.timerId = window.setTimeout(() => {
    if (pendingDispatch.completed) {
      return;
    }

    if (pendingDispatch.attempts < pendingDispatch.maxAttempts) {
      diagnosticLog("compare.dispatch", "retry", {
        site: pendingDispatch.ref.site,
        requestId: pendingDispatch.requestId,
        nextAttempt: pendingDispatch.attempts + 1,
      });
      setSiteStatus(
        pendingDispatch.ref.site.id,
        `自动发送暂未响应，正在重试 ${pendingDispatch.attempts + 1}/${pendingDispatch.maxAttempts}...`
      );
      scheduleDispatchAttempt(pendingDispatch, 0);
      return;
    }

    diagnosticLog("compare.dispatch", "timeout", {
      site: pendingDispatch.ref.site,
      requestId: pendingDispatch.requestId,
      attempts: pendingDispatch.attempts,
    });
    finalizePendingDispatch(pendingDispatch.requestId, {
      ok: false,
      siteId: pendingDispatch.ref.site.id,
      error: "自动发送超时，未收到卡片页面响应"
    });
  }, pendingDispatch.retryDelayMs);
}

export function resolvePendingDispatch(requestId, payload) {
  const pendingDispatch = state.pendingDispatches.get(requestId);
  if (!pendingDispatch || pendingDispatch.completed) {
    diagnosticLog("compare.dispatch", "resolve-miss", { requestId, payload });
    return;
  }

  diagnosticLog("compare.dispatch", "resolve", {
    site: pendingDispatch.ref.site,
    requestId,
    payload,
  });
  finalizePendingDispatch(requestId, payload);
}

export function finalizePendingDispatch(requestId, result) {
  const pendingDispatch = state.pendingDispatches.get(requestId);
  if (!pendingDispatch || pendingDispatch.completed) {
    return;
  }

  pendingDispatch.completed = true;
  if (pendingDispatch.timerId) {
    window.clearTimeout(pendingDispatch.timerId);
  }
  state.pendingDispatches.delete(requestId);
  restoreLockedScrollPosition();
  diagnosticLog("compare.dispatch", "finalize", {
    site: pendingDispatch.ref.site,
    requestId,
    result,
  });
  pendingDispatch.resolve(result);
}

export function settlePendingQuery(ref, result) {
  if (!ref) {
    return false;
  }

  const resolver = typeof ref.pendingQueryResolver === "function"
    ? ref.pendingQueryResolver
    : null;
  ref.pendingQueryResolver = null;
  ref.pendingQuery = "";
  ref.pendingQueryDelayMs = 0;

  if (!resolver) {
    return false;
  }

  try {
    resolver(result);
  } catch (_error) {
    /* ignore resolver failure */
  }
  return true;
}

export function flushPendingQueryAfterLoad(ref) {
  if (!ref?.pendingQuery) {
    return;
  }

  const queuedQuery = ref.pendingQuery;
  const queuedDelayMs = Number.isFinite(ref.pendingQueryDelayMs) ? ref.pendingQueryDelayMs : 0;
  const resolver = typeof ref.pendingQueryResolver === "function"
    ? ref.pendingQueryResolver
    : null;
  ref.pendingQuery = "";
  ref.pendingQueryDelayMs = 0;
  ref.pendingQueryResolver = null;

  if (!resolver) {
    return;
  }

  dispatchSearchWithRetries(ref, queuedQuery, queuedDelayMs)
    .then((result) => {
      resolver(result);
    })
    .catch((error) => {
      resolver({
        ok: false,
        siteId: ref.site?.id,
        error: error?.message || "自动发送失败"
      });
    });
}

// 卡片被关闭时调用：
// 1) 取消本站点在 pendingDispatches 里所有尚未完成的 setTimeout 重试，并 resolve 对应 Promise。
// 2) 如果 sendSmartToSite 在等待 iframe 加载完（pendingQueryResolver 未执行），也一并 resolve，
//    避免 handleSendSelected 里的 Promise.all 永不完成、state.isSending 卡在 true。
export function abortPendingWorkForSite(siteId, options = {}) {
  const { reason = "卡片已关闭" } = options;
  diagnosticLog("compare.dispatch", "abort-site", { siteId, reason });
  const toCancel = [];
  state.pendingDispatches.forEach((pending, requestId) => {
    if (pending?.ref?.site?.id === siteId) {
      toCancel.push(requestId);
    }
  });
  toCancel.forEach((requestId) => {
    finalizePendingDispatch(requestId, {
      ok: false,
      siteId,
      error: reason
    });
  });

  const ref = state.cardRefs.get(siteId);
  settlePendingQuery(ref, { ok: false, siteId, error: reason });
  // 顺带收掉本张卡片 iframe 相关的延迟加载 / 超时回退定时器，
  // 避免关闭卡片后 25s 内仍触发 renderFallback 操作已 detach 的 DOM。
  clearIframeTimers(ref);
  // 从并发队列和加载中集合里移除这张卡片；如果它原本占着一个槽位，
  // 释放后立刻 pumpLoadQueue 让后面排队的卡片补上。
  if (ref) {
    removeFromLoadQueue(ref);
    if (state.loadingRefs.has(ref)) {
      state.loadingRefs.delete(ref);
      pumpLoadQueue();
    }
  }
}
