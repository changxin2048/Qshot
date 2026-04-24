import { state, elements } from "./state.js";
import { updateLatestHistoryUrl } from "./history.js";
import { resolvePendingDispatch } from "./send.js";

export function handleFrameMessage(event) {
  const payload = event.data;
  if (!payload || !payload.type || !payload.siteId) {
    return;
  }

  // 安全校验：消息必须来自我们已登记的某张卡片的 iframe，且 payload.siteId 要与该卡片匹配。
  // 这样可以阻止第三方内嵌广告 / 跨站 iframe 伪造 URL_UPDATE / RESULT 污染 UI 或历史记录。
  const ref = findCardRefByMessageSource(event.source);
  if (!ref || ref.site.id !== payload.siteId) {
    return;
  }

  if (payload.type === "QSHOT_URL_UPDATE") {
    ref.injectedPinged = true;
    if (payload.currentUrl) {
      ref.currentUrl = payload.currentUrl;
      updateLatestHistoryUrl(payload.siteId, payload.currentUrl);
    }
    return;
  }

  if (payload.type !== "QSHOT_RESULT") {
    return;
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
