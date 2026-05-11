import { state, elements } from "./state.js";
import { updateLatestHistoryUrl } from "./history.js";
import { resolvePendingDispatch } from "./send.js";
import { diagnosticLog } from "../../shared/diagnostics.js";

export function handleFrameMessage(event) {
  const payload = event.data;
  if (!payload || !payload.type || !payload.siteId) {
    return;
  }

  // 安全校验：消息必须来自我们已登记的某张卡片的 iframe，且 payload.siteId 要与该卡片匹配。
  // 这样可以阻止第三方内嵌广告 / 跨站 iframe 伪造 URL_UPDATE / RESULT 污染 UI 或历史记录。
  const ref = findCardRefByMessageSource(event.source);
  if (!ref || ref.site.id !== payload.siteId) {
    diagnosticLog("compare.message", "source-mismatch", {
      payloadType: payload.type,
      siteId: payload.siteId,
      matchedSiteId: ref?.site?.id,
    });
    return;
  }

  if (payload.type === "QSHOT_URL_UPDATE") {
    diagnosticLog("compare.message", "url-update", { siteId: payload.siteId, currentUrl: payload.currentUrl });
    ref.injectedPinged = true;
    if (payload.currentUrl) {
      ref.currentUrl = payload.currentUrl;
      updateLatestHistoryUrl(payload.siteId, payload.currentUrl);
    }
    return;
  }

  if (payload.type === "QSHOT_PASTE_RESULT") {
    diagnosticLog("compare.message", "paste-result", {
      siteId: payload.siteId,
      requestId: payload.requestId,
      ok: payload.ok,
      error: payload.error,
    });
    resolvePendingFileDispatch(payload);
    return;
  }

  if (payload.type !== "QSHOT_RESULT") {
    diagnosticLog("compare.message", "unknown-type", { payloadType: payload.type, siteId: payload.siteId });
    return;
  }

  diagnosticLog("compare.message", "result", {
    siteId: payload.siteId,
    requestId: payload.requestId,
    ok: payload.ok,
    error: payload.error,
  });

  if (payload.currentUrl) {
    ref.currentUrl = payload.currentUrl;
    updateLatestHistoryUrl(payload.siteId, payload.currentUrl);
  }

  if (payload.requestId) {
    resolvePendingDispatch(payload.requestId, payload);
  }

  if (payload.ok) {
    setSiteStatus(payload.siteId, payload.message || "iframe 页面已处理查询。", "success");
  } else {
    setSiteStatus(payload.siteId, payload.error || "iframe 页面处理失败。", "error");
  }
}

function resolvePendingFileDispatch(payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  const pending = state.pendingFileDispatches.get(requestId);
  if (!pending) {
    return;
  }

  state.pendingFileDispatches.delete(requestId);
  if (pending.timerId) {
    window.clearTimeout(pending.timerId);
  }

  if (payload.ok) {
    setSiteStatus(payload.siteId, payload.message || "文件已发送到卡片输入框。", "success");
  } else {
    setSiteStatus(payload.siteId, payload.error || "文件发送失败。", "error");
  }

  try {
    pending.resolve(payload);
  } catch (_error) {
    /* ignore resolver failure */
  }
}

// 遍历当前活跃的卡片，找到 contentWindow === source 的那一张。
// 注意：AI 站点内部的 sub-iframe 发来的消息，source 会是那个内部 window，
// 匹配不上我们的 ref.iframeEl.contentWindow，会被直接丢弃——这正是我们要的。
export function findCardRefByMessageSource(source) {
  if (!source) return null;
  for (const ref of state.cardRefs.values()) {
    const win = ref.iframeEl && ref.iframeEl.contentWindow;
    if (win && win === source) {
      return ref;
    }
  }
  return null;
}

export function setSiteStatus(siteId, message, kind = "info") {
  const ref = state.cardRefs.get(siteId);
  if (!ref) {
    return;
  }

  ref.statusEl.textContent = message;
  ref.statusEl.classList.toggle("success-text", kind === "success");
}

export function setGlobalStatus(message, isError = false) {
  elements.globalStatus.textContent = message;
  elements.globalStatus.classList.toggle("success-text", !isError);
}

export function toggleGlobalButtons(isBusy) {
  elements.sendSelectedBtn.disabled = isBusy;
  if (elements.promptAssistBtn) {
    elements.promptAssistBtn.disabled = isBusy;
  }
}

export function updateSendBtnState() {
  const hasContent = elements.queryInput.value.trim().length > 0;
  elements.sendSelectedBtn.classList.toggle("is-empty", !hasContent);
}
