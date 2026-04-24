import { state, elements, BASE_CONFIG, SESSION_SNAPSHOTS_MAX } from "./state.js";
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
import { quickCaptureAllResponses } from "./export.js";

export async function handleSendSelected(options = {}) {
  if (state.isSending) {
    return;
  }

  const { clearInputAfterSend = true } = options;
  const query = getQuery();

  if (!query) {
    setGlobalStatus("请输入问题后再发送。", true);
    return;
  }

  const selectedSites = getSelectedSites();
  if (selectedSites.length === 0) {
    setGlobalStatus("没有可发送的站点。", true);
    return;
  }

  state.isSending = true;

  try {
    lockContainerScroll();
    toggleGlobalButtons(true);
    setGlobalStatus(`正在向 ${selectedSites.length} 个站点分发问题...`);

    if (state.lastSearchQuery) {
      try {
        const prevResponses = await quickCaptureAllResponses();
        state.sessionSnapshots.push({
          query: state.lastSearchQuery,
          time: state.lastSearchTime,
          responses: prevResponses
        });
        // 超过上限则丢弃最旧的快照，防止长会话内存无限增长。
        if (state.sessionSnapshots.length > SESSION_SNAPSHOTS_MAX) {
          state.sessionSnapshots = state.sessionSnapshots.slice(-SESSION_SNAPSHOTS_MAX);
        }
      } catch (_snapErr) {
        // 快照失败不阻断发送流程
      }
    }

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

    const historyEntryId = await saveSearchHistory(query, selectedSites);
    const results = await Promise.all(selectedSites.map((site) => sendSmartToSite(site, query)));
    const successCount = results.filter((item) => item && item.ok).length;
    const failedCount = results.length - successCount;

    await refreshHistoryEntryUrls(historyEntryId, selectedSites);
    setGlobalStatus(`发送完成：成功 ${successCount} 个，失败 ${failedCount} 个。`, failedCount > 0);
    scheduleScrollUnlock();
  } finally {
    state.isSending = false;
    toggleGlobalButtons(false);
  }
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

export async function sendSmartToSite(site, query) {
  const ref = state.cardRefs.get(site.id);
  if (!ref || !ref.iframeEl) {
    return {
      ok: false,
      siteId: site.id,
      error: "卡片 iframe 不可用"
    };
  }

  if (site.supportUrlQuery && String(site.url || "").includes("{query}")) {
    return navigateByUrlTemplate(ref, query);
  }

  if (!ref.loaded) {
    return new Promise((resolve) => {
      ref.pendingQuery = query;
      ref.pendingQueryResolver = resolve;
      setSiteStatus(site.id, "卡片加载中，完成后将自动发送...");
    });
  }

  ref.pendingQuery = "";
  ref.pendingQueryResolver = null;
  return dispatchSearchWithRetries(ref, query, 0);
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

  setSiteStatus(ref.site.id, "正在通过 URL 直达搜索结果页...");

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

  return new Promise((resolve) => {
    const pendingDispatch = {
      requestId,
      ref,
      query,
      resolve,
      attempts: 0,
      maxAttempts: 3,
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
      // 跨域 iframe 通信：targetOrigin 优先使用 iframe 当前 src 的 origin（若可解析），否则回退 "*"
      // （同时依赖 inject.js 的 event.origin/event.source 校验来拒绝非扩展对比页的伪造请求）。
      let targetOrigin = "*";
      try {
        const src = pendingDispatch.ref.iframeEl.src || "";
        if (src && src !== "about:blank") {
          targetOrigin = new URL(src).origin;
        }
      } catch (_e) {
        targetOrigin = "*";
      }
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
    return;
  }

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
  pendingDispatch.resolve(result);
}

// 卡片被关闭时调用：
// 1) 取消本站点在 pendingDispatches 里所有尚未完成的 setTimeout 重试，并 resolve 对应 Promise。
// 2) 如果 sendSmartToSite 在等待 iframe 加载完（pendingQueryResolver 未执行），也一并 resolve，
//    避免 handleSendSelected 里的 Promise.all 永不完成、state.isSending 卡在 true。
export function abortPendingWorkForSite(siteId) {
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
      error: "卡片已关闭"
    });
  });

  const ref = state.cardRefs.get(siteId);
  if (ref?.pendingQueryResolver) {
    const resolver = ref.pendingQueryResolver;
    ref.pendingQueryResolver = null;
    ref.pendingQuery = "";
    try {
      resolver({ ok: false, siteId, error: "卡片已关闭" });
    } catch (_e) {
      /* resolver 异常不影响关闭流程 */
    }
  }
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
