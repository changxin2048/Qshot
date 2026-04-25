import { state, SITE_CATEGORIES } from "./state.js";
import { escapeHtml, createRequestId, normalizeQueryForMatch } from "./utils.js";

const EXTRACT_TIMEOUT_MS = 2500;

export function showExportModal() {
  const existing = document.getElementById("exportModal");
  if (existing) {
    existing.remove();
    return;
  }

  const aiSiteIds = new Set(
    (SITE_CATEGORIES.find((c) => c.id === "ai")?.builtinIds) || []
  );
  const exportableRefs = Array.from(state.cardRefs.values()).filter((ref) =>
    aiSiteIds.has(ref?.site?.id)
  );
  const selectedSiteIds = new Set(exportableRefs.map((ref) => ref.site.id));
  let selectedFormat = "markdown";

  const modal = document.createElement("div");
  modal.id = "exportModal";
  modal.className = "export-modal";
  modal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-header">
        <h3 class="export-modal-title">导出对话结果</h3>
        <button class="export-close-btn" type="button" aria-label="关闭"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="export-notice">将读取各卡片当前已加载的 AI 回答内容，结果取决于页面加载状态。<br>此功能还处于测试阶段，可能存在内容提取不完整或格式异常等问题。<br>仅支持 AI 模型对话导出。</div>
      <div class="export-modal-body">
        <div class="export-section">
          <div class="export-section-title">导出格式</div>
          <div class="export-option-row">
            <button class="export-option-btn is-active" data-export-format="markdown">Markdown</button>
            <button class="export-option-btn" data-export-format="txt">TXT</button>
          </div>
        </div>
        <div class="export-section">
          <div class="export-section-title">选择导出</div>
          <div class="export-site-list"></div>
        </div>
      </div>
      <div class="export-actions">
        <button class="export-cancel-btn" type="button">取消</button>
        <button class="export-confirm-btn" type="button">导出</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const siteList = modal.querySelector(".export-site-list");
  let isExporting = false;

  if (exportableRefs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "export-site-empty";
    empty.textContent = "当前页面没有可导出的 AI 模型卡片。";
    siteList.appendChild(empty);
  } else {
    exportableRefs.forEach((ref) => {
      const row = document.createElement("label");
      row.className = "export-site-item";
      row.innerHTML = `
        <input type="checkbox" checked data-site-id="${escapeHtml(ref.site.id)}" />
        <span>${escapeHtml(ref.site.name)}</span>
      `;

      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedSiteIds.add(ref.site.id);
        } else {
          selectedSiteIds.delete(ref.site.id);
        }
      });

      siteList.appendChild(row);
    });
  }

  modal.querySelectorAll("[data-export-format]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedFormat = button.dataset.exportFormat;
      modal.querySelectorAll("[data-export-format]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
    });
  });

  const closeModal = (force = false) => {
    if (isExporting && !force) {
      return;
    }
    modal.remove();
  };

  modal.querySelector(".export-close-btn").addEventListener("click", closeModal);
  modal.querySelector(".export-cancel-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  const confirmBtn = modal.querySelector(".export-confirm-btn");
  const cancelBtn = modal.querySelector(".export-cancel-btn");
  const noticeEl = modal.querySelector(".export-notice");

  confirmBtn.addEventListener("click", async () => {
    if (isExporting) {
      return;
    }
    if (selectedSiteIds.size === 0) {
      noticeEl.textContent = "请至少选择一个要导出的 AI 模型。";
      return;
    }

    isExporting = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = "正在导出...";
    noticeEl.textContent = `正在读取 ${selectedSiteIds.size} 个卡片内容，请稍候...`;

    try {
      const responses = await collectVisibleResponses(selectedSiteIds);
      const content = generateExportContent(responses, selectedFormat, selectedSiteIds);
      const extension = selectedFormat === "markdown" ? "md" : selectedFormat;
      const mimeType = selectedFormat === "html" ? "text/html" : "text/plain";
      downloadFile(content, buildExportFilename(extension), mimeType);
      closeModal(true);
    } catch (error) {
      isExporting = false;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmBtn.textContent = "导出";
      noticeEl.textContent = `导出失败：${error.message || "未知错误"}`;
    }
  });

}

export async function quickCaptureAllResponses() {
  const CAPTURE_TIMEOUT = 3000;
  const promises = [];
  for (const [, ref] of state.cardRefs.entries()) {
    const p = Promise.race([
      collectResponseForSite(ref),
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              siteName: ref.site.name,
              content: "暂未提取到内容",
              turns: null,
              url: ref.currentUrl || ref.site.url
            }),
          CAPTURE_TIMEOUT
        )
      )
    ]);
    promises.push(p);
  }
  return Promise.all(promises);
}

export async function collectVisibleResponses(selectedSiteIds = null) {
  const refs = Array.from(state.cardRefs.entries())
    .filter(([siteId]) => !selectedSiteIds || selectedSiteIds.has(siteId))
    .map(([, ref]) => ref);

  return Promise.all(refs.map((ref) => collectResponseForSite(ref)));
}

export async function collectResponseForSite(ref) {
  if (!ref.iframeEl) {
    return {
      siteName: ref.site.name,
      content: "暂未提取到内容",
      turns: null,
      url: ref.currentUrl || ref.site.url
    };
  }

  const response = await requestIframeContent(ref.iframeEl, ref.site);
  if (response.content && response.content !== "暂未提取到内容") {
    return response;
  }

  return {
    ...response,
    content: extractFallbackContent(ref)
  };
}

export function extractFallbackContent(ref) {
  if (!ref || !ref.bodyEl) {
    return "暂未提取到内容";
  }

  const fallbackPanel = ref.bodyEl.querySelector(".fallback-panel");
  if (fallbackPanel) {
    return String(fallbackPanel.textContent || "暂未提取到内容").trim() || "暂未提取到内容";
  }

  return ref.statusEl?.textContent?.trim() || "暂未提取到内容";
}

export function requestIframeContent(iframe, site) {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    let completed = false;
    let timeoutId = null;
    // Review note (CWS/Edge Add-ons):
    // - We only request readable text from the card iframe when the user triggers Export/Summary actions.
    // - We bind replies to the specific iframe via event.source to prevent other iframes from spoofing responses and polluting exported content.
    // 在闭包里快照 contentWindow，后续 event 校验一律对照这个快照做来源判定。
    // 为什么不在 handler 里每次读 iframe.contentWindow：iframe 被 detach 后它会变 null，
    // 那样任何 event.source 都会 !== null 而通过校验，反而变成"零校验"。
    const expectedWindow = iframe.contentWindow;

    const finish = (result) => {
      if (completed) {
        return;
      }
      completed = true;
      window.removeEventListener("message", handler);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      resolve(result);
    };

    const handler = (event) => {
      // ── 安全校验：只接受来自本次提取目标 iframe 的回执 ──
      // requestId 是 UUID/随机串，单靠它虽然攻击者难猜，但同页面里其它卡片/广告 iframe
      // 仍然可能监听到消息模式后向本对比页发伪造的 QSHOT_EXTRACT_RESULT，
      // 从而把导出 / 剪贴板 / 摘要里的内容替换成攻击者写的字符串。
      // 加 event.source 白名单后，即便攻击者抢先回消息，也会因 source 不匹配被丢弃。
      if (event.source !== expectedWindow) return;
      if (!event.data || event.data.type !== "QSHOT_EXTRACT_RESULT" || event.data.requestId !== requestId) {
        return;
      }

      finish({
        siteName: site.name,
        content: cleanExtractedContent(event.data.content || ""),
        turns: Array.isArray(event.data.turns) ? event.data.turns : null,
        url: event.data.url || site.url
      });
    };

    window.addEventListener("message", handler);

    try {
      // 站点 iframe 经常会跨 origin 重定向（例如入口域名跳到登录/对话域名）。
      // 使用 "*" 避免 targetOrigin 过期导致消息被静默丢弃；回包仍用 event.source + requestId 校验。
      const targetOrigin = "*";
      iframe.contentWindow.postMessage({
        type: "QSHOT_EXTRACT",
        requestId,
        site
      }, targetOrigin);
    } catch (_error) {
      finish({
        siteName: site.name,
        content: "暂未提取到内容",
        turns: null,
        url: site.url
      });
      return;
    }

    timeoutId = window.setTimeout(() => {
      finish({
        siteName: site.name,
        content: "暂未提取到内容",
        turns: null,
        url: site.url
      });
    }, EXTRACT_TIMEOUT_MS);
  });
}

export function cleanExtractedContent(content) {
  const text = String(content || "").trim();
  if (!text) {
    return "暂未提取到内容";
  }

  const junkPattern = /window\.__|\brequestAnimationFrame\b|function\s*\(|'use strict'|"use strict"|theme-host|__webpack|__NEXT_DATA__|gtag\(|ga\(/i;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !junkPattern.test(line))
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""));

  const result = lines.join("\n").trim();
  return result || text.slice(0, 6000) || "暂未提取到内容";
}

/**
 * 导出用：去掉正文里的 #～###### 标题语法，改为加粗行，避免与外层「问题 / 模型」标题层级冲突；
 * 保留列表、加粗等；合并过多空行为「段落之间空一行」。
 */
export function flattenExportBodyMarkdown(raw) {
  const text = String(raw || "").trim();
  if (!text || text === "暂未提取到内容") {
    return text || "暂未提取到内容";
  }

  const lines = text.split(/\r?\n/);
  const out = [];
  let inCodeFence = false;
  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    const trimmed = trimmedEnd.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      out.push(trimmedEnd);
      continue;
    }
    if (inCodeFence) {
      out.push(trimmedEnd);
      continue;
    }
    const headingMatch = trimmedEnd.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const title = headingMatch[2].trim();
      out.push(`**${title}**`);
      out.push("");
    } else {
      out.push(trimmedEnd);
    }
  }

  let result = out.join("\n");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result || "暂未提取到内容";
}

export function buildExportSectionsFromConversations(cardData) {
  const cardsWithTurns = cardData.filter((c) => Array.isArray(c.turns) && c.turns.length > 0);
  if (cardsWithTurns.length === 0) return null;

  const cardPairs = cardsWithTurns.map((card) => {
    const pairs = [];
    const turns = card.turns;
    for (let i = 0; i < turns.length; i++) {
      if (turns[i].role === "user") {
        let j = i + 1;
        while (j < turns.length && turns[j].role !== "assistant") j++;
        const answer = j < turns.length ? turns[j].text : "";
        if (answer) {
          pairs.push({ question: turns[i].text, answer });
        }
      }
    }
    return { siteName: card.siteName, url: card.url, pairs };
  });

  const seenQ = new Map();
  for (const card of cardPairs) {
    for (const pair of card.pairs) {
      const norm = normalizeQueryForMatch(pair.question);
      if (!seenQ.has(norm)) {
        seenQ.set(norm, pair.question);
      }
    }
  }

  if (seenQ.size === 0) return null;

  const sections = [];
  for (const [normQ, question] of seenQ.entries()) {
    const models = [];
    for (const card of cardPairs) {
      const pair = card.pairs.find((p) => normalizeQueryForMatch(p.question) === normQ);
      if (pair) {
        models.push({ siteName: card.siteName, url: card.url, content: pair.answer });
      }
    }
    if (models.length > 0) {
      sections.push({ query: question, models });
    }
  }

  return sections.length > 0 ? sections : null;
}

export function buildSiteNameFilter(selectedSiteIds) {
  if (!selectedSiteIds) {
    return null;
  }
  const names = new Set();
  for (const [id, ref] of state.cardRefs.entries()) {
    if (selectedSiteIds.has(id)) {
      names.add(ref.site.name);
    }
  }
  return names;
}

export function renderSectionsToFormat(sections, format) {
  const valid = sections.filter((s) => (s.items || []).length > 0);
  if (valid.length === 0) return "";

  if (format === "markdown") {
    return valid
      .map((section) => {
        const queryLine = String(section.query || "").replace(/\r?\n/g, " ").trim();
        const timeLine = section.time ? `导出时间：${section.time}` : "";
        const modelBlocks = section.items
          .map((item) => {
            const body = flattenExportBodyMarkdown(item.content || "暂未提取到内容");
            return `## ${item.siteName}\n\n**URL：**${item.url}\n\n${body}`;
          })
          .join("\n\n");
        return [`# ${queryLine}`, timeLine, modelBlocks].filter(Boolean).join("\n\n");
      })
      .join("\n\n---\n\n");
  }

  if (format === "html") {
    const querySections = valid
      .map((section) => {
        const modelBlocks = section.items
          .map(
            (item) =>
              `<section class="model-section"><h2>${escapeHtml(item.siteName)}</h2><p><strong>URL：</strong> <a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a></p><pre>${escapeHtml(flattenExportBodyMarkdown(item.content || "暂未提取到内容"))}</pre></section>`
          )
          .join("");
        const timeHtml = section.time ? `<p class="export-time">${escapeHtml(`导出时间：${section.time}`)}</p>` : "";
        return `<section class="query-section"><h1>${escapeHtml(section.query)}</h1>${timeHtml}${modelBlocks}</section>`;
      })
      .join("<hr>");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 对比结果</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.7}.query-section{margin-bottom:40px}.model-section{margin-bottom:28px}pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f7;padding:16px;border-radius:12px}a{color:#2563eb}</style></head><body>${querySections}</body></html>`;
  }

  return valid
    .map((section) => {
      const timeStr = section.time ? `导出时间：${section.time}` : "";
      const modelBlocks = section.items
        .map((item) => {
          const body = flattenExportBodyMarkdown(item.content || "暂未提取到内容");
          return `${item.siteName}\nURL: ${item.url}\n\n${body}`;
        })
        .join("\n\n" + "-".repeat(32) + "\n\n");
      return [section.query, timeStr, modelBlocks].filter(Boolean).join("\n\n");
    })
    .join("\n\n" + "=".repeat(40) + "\n\n");
}

export function generateExportContent(responses, format, selectedSiteIds = null) {
  const currentQuery = state.lastSearchQuery || state.searchHistory[0]?.query || "未填写问题";
  const currentTime = state.lastSearchTime || new Date().toLocaleString();

  const allowedNames = buildSiteNameFilter(selectedSiteIds);
  const filterItems = (items) =>
    allowedNames ? items.filter((r) => allowedNames.has(r.siteName)) : items;

  const allSections = [
    ...state.sessionSnapshots.map((s) => ({
      query: s.query,
      time: s.time,
      items: filterItems(s.responses)
    })),
    { query: currentQuery, time: currentTime, items: filterItems(responses) }
  ];
  return renderSectionsToFormat(allSections, format);
}

export function generateExportPreview(responses, format, selectedSiteIds = null) {
  const full = generateExportContent(responses, format, selectedSiteIds);
  return full.length > 1600 ? `${full.slice(0, 1600)}\n\n...` : full;
}

export function buildExportFilename(extension) {
  const query = state.lastSearchQuery || state.searchHistory[0]?.query || "";
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  if (!query) {
    return `AI导出_${date}.${extension}`;
  }

  const keyword = query
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 16)
    .trim()
    .replace(/\s/g, "-");

  return `${keyword}_${date}.${extension}`;
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
