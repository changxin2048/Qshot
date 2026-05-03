import { state, elements } from "./state.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clearAutoSendFlagFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("autosend");
  history.replaceState({}, "", url.toString());
}

export function normalizeQueryForMatch(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 300);
}

export function buildSiteUrl(site, query) {
  if (site?.id === "youtube") {
    const youtubeEmbedUrl = buildYoutubeEmbedUrl(query);
    if (youtubeEmbedUrl) {
      return youtubeEmbedUrl;
    }
  }

  const url = site.url || "";
  if (!url.includes("{query}")) {
    return url;
  }
  if (query && site.supportUrlQuery) {
    return url.replace("{query}", encodeURIComponent(query));
  }
  // 空 query 或站点不支持 URL 直达：剥离含 {query} 的参数段，回落到基础 URL
  let next = url.replace(/([?&])[^=&]+=\{query\}/g, (_, sep) => (sep === "?" ? "?" : ""));
  next = next.replace(/[?&]$/, "");
  // 兜底：万一还残留 {query}，粗暴清掉
  return next.replace(/\{query\}/g, "");
}

function buildYoutubeEmbedUrl(query) {
  const text = String(query || "").trim();
  if (!text) return "";

  const videoId = extractYoutubeVideoId(text);
  if (!videoId) return "";

  // YouTube IFrame API 推荐带 enablejsapi + origin。
  // 这里用 youtube-nocookie 域减少第三方 cookie 干扰。
  const origin = encodeURIComponent(window.location.origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${origin}&playsinline=1&rel=0`;
}

function extractYoutubeVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  // 直接输入 11 位 videoId
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_e) {
    return "";
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const v = parsed.searchParams.get("v");
    if (/^[A-Za-z0-9_-]{11}$/.test(v || "")) {
      return v;
    }

    const match = parsed.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
    if (match?.[2]) {
      return match[2];
    }
  }

  return "";
}

export function getSelectedSites() {
  return state.sites.filter((site) => !state.hiddenSiteIds.has(site.id));
}

export function isWideMediaSite(siteId) {
  return siteId === "xiaohongshu" || siteId === "bilibili";
}

export function getQuery() {
  return elements.queryInput.value.trim();
}

export function setQueryInputValue(value, options = {}) {
  if (!elements.queryInput) {
    return;
  }

  elements.queryInput.value = String(value || "");
  elements.queryInput.dispatchEvent(new Event("input", { bubbles: true }));

  if (options.focus) {
    elements.queryInput.focus();
  }
}

export function ensureCardsNotEmpty() {
  if (state.cardRefs.size > 0) {
    return;
  }

  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.textContent = "请先选择至少一个站点。";
  elements.iframesContainer.innerHTML = "";
  elements.iframesContainer.appendChild(emptyState);
}

export function parseRequestedSiteIds(rawValue) {
  if (!rawValue) {
    return null;
  }

  const siteIds = rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index);

  return siteIds.length > 0 ? siteIds : null;
}

export function normalizePromptGroups(source) {
  const list = Array.isArray(source) ? source : [];
  return list.map((group, groupIndex) => ({
    id: String(group.id || `prompt-group-${groupIndex}`),
    name: String(group.name || "未命名分组"),
    prompts: Array.isArray(group.prompts)
      ? group.prompts.map((prompt, promptIndex) => ({
          id: String(prompt.id || `prompt-${groupIndex}-${promptIndex}`),
          title: String(prompt.title || "未命名提示词"),
          content: String(prompt.content || "")
        }))
      : []
  }));
}
