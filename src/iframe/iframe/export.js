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
        site,
        // 传入最近一次搜索词，inject.js 可在 turns 完全为空时用作 user turn 回退标签
        query: state.lastSearchQuery || ""
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

/**
 * 将单个模型卡片的对话轮次解析为分组：
 *   - 第一个 user turn（对应 bigQuery）→ 大问题（question: null，已作一级标题展示，跳过）
 *   - 后续每个 user turn → 单独追问（question: 追问文本，会成为三级标题）
 *   - 每个 turn 后紧跟的 assistant turns → 该组的回答
 *
 * @param {object} item      - 包含 turns / content 的模型响应
 * @param {string} [bigQuery] - 当前章节的大问题文本，用于在累积对话历史中定位正确的起始位置。
 *   Gemini 等站点会在同一 iframe 里保留全部历史，不定位就会把历史章节的 Q&A 误算入当前章节。
 */
function parseConversationGroups(item, bigQuery) {
  const turns = Array.isArray(item.turns) ? item.turns : null;
  if (!turns || turns.length === 0) return null;

  // ── 1. 在累积对话中定位 bigQuery 对应的 user turn，只解析从它开始的轮次 ──
  let startIdx = 0;
  if (bigQuery) {
    const normBig = normalizeQueryForMatch(bigQuery);
    let matchIdx = -1;
    for (let i = 0; i < turns.length; i++) {
      if (turns[i].role !== "user") continue;
      // 部分站点（如 Gemini）的 user turn 带有"你说 / You said"前缀，先剥离再比较
      const cleaned = String(turns[i].text || "")
        .replace(/^(你说|You\s+said)[：:：\s]*/i, "")
        .trim();
      const normTurn = normalizeQueryForMatch(cleaned);
      // 宽松匹配：两侧互相包含即认为是同一个问题（处理截断/换行等情况）
      if (
        normTurn === normBig ||
        (normBig.length > 6 && normTurn.includes(normBig)) ||
        (normTurn.length > 6 && normBig.includes(normTurn))
      ) {
        matchIdx = i; // 取最后一次匹配，确保使用最新出现的那轮
      }
    }
    if (matchIdx >= 0) startIdx = matchIdx;
  }

  const relevantTurns = turns.slice(startIdx);

  // ── 2. 逐 turn 构建分组 ──
  const groups = [];
  let currentGroup = null;
  let seenUserCount = 0;

  for (const turn of relevantTurns) {
    if (turn.role === "user") {
      seenUserCount++;
      // 剥离"你说 / You said"前缀，避免出现在三级标题文本里
      const cleanText = String(turn.text || "")
        .replace(/^(你说|You\s+said)[：:：\s]*/i, "")
        .trim();
      if (seenUserCount === 1) {
        currentGroup = { question: null, answers: [] };
      } else {
        currentGroup = { question: cleanText, answers: [] };
      }
      groups.push(currentGroup);
    } else if (turn.role === "assistant") {
      if (!currentGroup) {
        // 没有任何 user turn（URL 模板类站点），助手回复归入隐式大问题组
        currentGroup = { question: null, answers: [] };
        groups.push(currentGroup);
      }
      const text = flattenExportBodyMarkdown(String(turn.text || ""));
      // 去重：部分站点的 DOM 选择器会命中父子元素，导致同一内容被提取两次
      const lastAnswer = currentGroup.answers[currentGroup.answers.length - 1];
      if (text && text !== lastAnswer) {
        currentGroup.answers.push(text);
      }
    }
  }

  return groups.length > 0 ? groups : null;
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
            const groups = parseConversationGroups(item, section.query);
            let body;
            if (groups) {
              body = groups
                .map((g) => {
                  const answerText = g.answers.join("\n\n") || "暂未提取到内容";
                  if (g.question === null) {
                    return answerText;
                  }
                  const qLine = g.question.replace(/\r?\n/g, " ").trim();
                  return qLine ? `### ${qLine}\n\n${answerText}` : answerText;
                })
                .filter(Boolean)
                .join("\n\n");
            } else {
              body = flattenExportBodyMarkdown(item.content || "暂未提取到内容");
            }
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
          .map((item) => {
            const groups = parseConversationGroups(item, section.query);
            let bodyHtml;
            if (groups) {
              bodyHtml = groups
                .map((g) => {
                  const answerHtml = `<pre>${escapeHtml(g.answers.join("\n\n") || "暂未提取到内容")}</pre>`;
                  if (g.question === null) return answerHtml;
                  const qLine = g.question.replace(/\r?\n/g, " ").trim();
                  return qLine ? `<h3>${escapeHtml(qLine)}</h3>${answerHtml}` : answerHtml;
                })
                .filter(Boolean)
                .join("");
            } else {
              bodyHtml = `<pre>${escapeHtml(flattenExportBodyMarkdown(item.content || "暂未提取到内容"))}</pre>`;
            }
            return `<section class="model-section"><h2>${escapeHtml(item.siteName)}</h2><p><strong>URL：</strong> <a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a></p>${bodyHtml}</section>`;
          })
          .join("");
        const timeHtml = section.time ? `<p class="export-time">${escapeHtml(`导出时间：${section.time}`)}</p>` : "";
        return `<section class="query-section"><h1>${escapeHtml(section.query)}</h1>${timeHtml}${modelBlocks}</section>`;
      })
      .join("<hr>");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 对比结果</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.7}.query-section{margin-bottom:40px}.model-section{margin-bottom:28px}pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f7;padding:16px;border-radius:12px}h3{margin:20px 0 8px;font-size:1em;color:#1e40af}a{color:#2563eb}</style></head><body>${querySections}</body></html>`;
  }

  return valid
    .map((section) => {
      const timeStr = section.time ? `导出时间：${section.time}` : "";
      const modelBlocks = section.items
        .map((item) => {
          const groups = parseConversationGroups(item, section.query);
          let body;
          if (groups) {
            body = groups
              .map((g) => {
                const answerText = g.answers.join("\n\n") || "暂未提取到内容";
                if (g.question === null) return answerText;
                const qLine = g.question.replace(/\r?\n/g, " ").trim();
                return qLine ? `▶ 追问：${qLine}\n\n${answerText}` : answerText;
              })
              .filter(Boolean)
              .join("\n\n");
          } else {
            body = flattenExportBodyMarkdown(item.content || "暂未提取到内容");
          }
          return `${item.siteName}\nURL: ${item.url}\n\n${body}`;
        })
        .join("\n\n" + "-".repeat(32) + "\n\n");
      return [section.query, timeStr, modelBlocks].filter(Boolean).join("\n\n");
    })
    .join("\n\n" + "=".repeat(40) + "\n\n");
}

// ─── 新导出逻辑：以模型为单位，每个模型独立展示 ───────────────────────────────

/**
 * 当 turns 提取失败时，从平铺的 content 文本里尝试解析 Q&A pairs。
 * 支持两种模式：
 *   1. Claude 的 "You said: xxx" 文本标记
 *   2. 通用 "---" 分隔块（Grok、Kimi 等，extractReadablePageText 用 --- 拼接多个容器）
 */
function parseQAFromFlatContent(content) {
  if (!content || content === "暂未提取到内容") return null;

  // 清理 UI 杂项（按钮文字等）——同时处理行内和行尾形式
  const cleanUI = (text) =>
    text
      .replace(/(编辑|复制|分享|收藏|朗读|Edit|Copy|Share|点赞|踩|Thumbs up|Thumbs down)\s*/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  // ── 模式 1：Claude "You said: xxx" ─────────────────────────────────────────
  if (content.includes("You said:")) {
    const pairs = [];
    const segs = content.split(/(?:^|\n)You said:\s*/m).filter(Boolean);
    for (const seg of segs) {
      const nl = seg.indexOf("\n");
      if (nl === -1) continue;
      const question = seg.slice(0, nl).trim();
      let answer = seg.slice(nl).trim();
      answer = answer
        .replace(/^[^\n]*Claude responded:[^\n]*\n/gm, "")
        .replace(/^\d{1,2}:\d{2}\s*\n/gm, "")
        .replace(/^Claude is AI[^\n]*\n/gm, "")
        .replace(/^Sonnet[^\n]*\n/gm, "")
        .replace(/^Adaptive\s*\n/gm, "")
        .replace(/^[^\n]*finished the response[^\n]*\n/gm, "")
        .trim();
      if (question && answer && answer.length > 20) {
        pairs.push({ question, answers: [flattenExportBodyMarkdown(answer)] });
      }
    }
    if (pairs.length > 0) return pairs;
  }

  // ── 模式 2：按 "---" 分隔块，短块=用户问题，长块=AI 回答 ──────────────────
  const blocks = content
    .split(/\n{1,2}---\n{1,2}/)
    .map((b) => cleanUI(b))
    .filter((b) => b.length > 0);

  if (blocks.length < 2) return null;

  /**
   * 判断一个块是否"像用户问题"，采用严格标准避免把 AI 回答的第一句话误判为问题：
   * - 长度 8~350 字符（排除过短的代码片段和过长的 AI 回答）
   * - 不包含反引号（排除代码）
   * - 不包含编程关键词
   * - 没有 markdown 结构标记（排除 AI 格式化回答）
   * - 不以数字序号或破折号列表开头（排除 AI 列表回答）
   */
  const isQuestion = (b) => {
    if (!b || b.length < 8 || b.length > 350) return false;
    // 包含反引号 → 代码，不是问题
    if (/`/.test(b)) return false;
    // 包含编程关键词 → AI 技术回答片段
    if (/\bfunction\b|\bconst\b|\blet\b|\bvar\b|\bclass\b|\breturn\b|=>|===/m.test(b)) return false;
    // 有 markdown 结构标记（标题、加粗、代码块、列表）
    const mdCount = (b.match(/^#{1,6}\s|^\s*[-*+]\s|\*\*|```/gm) || []).length;
    if (mdCount > 0) return false;
    // 以数字序号开头（"1. "、"2. "）→ 通常是 AI 列表
    if (/^\d+[\.\)]\s/.test(b.trim())) return false;
    return true;
  };

  const pairs = [];
  let i = 0;
  while (i < blocks.length) {
    if (isQuestion(blocks[i])) {
      const q = blocks[i].replace(/\r?\n/g, " ").trim();
      const ansBlocks = [];
      let j = i + 1;
      while (j < blocks.length && !isQuestion(blocks[j])) {
        ansBlocks.push(blocks[j]);
        j++;
        if (ansBlocks.length >= 2) break;
      }
      if (ansBlocks.length > 0 && q.length >= 2) {
        pairs.push({
          question: q,
          answers: [flattenExportBodyMarkdown(ansBlocks.join("\n\n"))],
        });
        i = j;
        continue;
      }
    }
    i++;
  }

  return pairs.length > 0 ? pairs : null;
}

/**
 * 将单个模型的对话提取为 Q&A pair 列表。
 * 优先使用结构化的 turns，其次用 content 文本解析兜底。
 * 每个 pair：{ question: string, answers: string[] }
 */
function extractModelQAPairs(resp) {
  // ── 优先：从结构化 turns 提取 ───────────────────────────────────────────────
  const turns = Array.isArray(resp.turns) ? resp.turns : null;
  if (turns && turns.length > 0) {
    const pairs = [];
    let cur = null;
    for (const turn of turns) {
      if (turn.role === "user") {
        const q = String(turn.text || "")
          .replace(/^(你说|You\s+said)[：:：\s]*/i, "")
          .trim();
        if (!q) continue;
        cur = { question: q, answers: [] };
        pairs.push(cur);
      } else if (turn.role === "assistant" && cur) {
        const text = flattenExportBodyMarkdown(String(turn.text || ""));
        const last = cur.answers[cur.answers.length - 1];
        if (text && text !== last) cur.answers.push(text);
      }
    }
    if (pairs.length > 0) return pairs;
  }

  // ── 兜底：从平铺 content 文本解析 ──────────────────────────────────────────
  const contentPairs = parseQAFromFlatContent(resp.content);
  if (contentPairs && contentPairs.length > 0) return contentPairs;

  return [];
}

/**
 * 将单个模型的数据渲染为指定格式的文本块。
 * 新格式：模型名一级标题 + URL，对话轮次用 "User:" / "AI:" 标签展示。
 * 当无法提取用户提问时（如豆包、元宝等），直接用 "AI:" 前缀展示各条回答。
 */
function renderSingleModelBlock(resp, format) {
  const name     = resp.siteName;
  const url      = resp.url;
  const pairs    = extractModelQAPairs(resp);

  // ── 将 content 按 "---" 切分成 AI 回答块，作为无问题时的展示基础 ──────────
  const contentBlocks = (() => {
    const raw = resp.content || "";
    if (!raw || raw === "暂未提取到内容") return [];
    const bs = raw
      .split(/\n{1,2}---\n{1,2}/)
      .map((b) => flattenExportBodyMarkdown(b.trim()))
      .filter((b) => b && b !== "暂未提取到内容" && b.length > 10);
    return bs;
  })();

  const singleFallback = flattenExportBodyMarkdown(resp.content || "暂未提取到内容");

  if (format === "markdown") {
    const header = `# ${name}\n\n**URL：**${url}`;

    if (pairs.length > 0) {
      // 有完整对话轮次：User: / AI: 标签
      const body = pairs
        .map((p) => {
          const qLine = p.question.replace(/\r?\n/g, " ").trim();
          const ans   = p.answers.join("\n\n") || "暂未提取到内容";
          return [
            qLine ? `**User:** ${qLine}` : null,
            `**AI:** ${ans}`,
          ].filter(Boolean).join("\n\n");
        })
        .filter(Boolean)
        .join("\n\n---\n\n");
      return `${header}\n\n${body}`;
    }

    // 无用户提问——用 AI: 前缀分块或直接展示
    if (contentBlocks.length > 1) {
      const body = contentBlocks.map((b) => `**AI:** ${b}`).join("\n\n---\n\n");
      return `${header}\n\n${body}`;
    }
    return `${header}\n\n${singleFallback}`;
  }

  if (format === "html") {
    const headerHtml = `<h1>${escapeHtml(name)}</h1><p><strong>URL：</strong><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></p>`;

    if (pairs.length > 0) {
      const body = pairs
        .map((p) => {
          const qLine = p.question.replace(/\r?\n/g, " ").trim();
          const ans   = p.answers.join("\n\n") || "暂未提取到内容";
          return [
            qLine ? `<p class="user-turn"><strong>User:</strong> ${escapeHtml(qLine)}</p>` : null,
            `<div class="ai-turn"><strong>AI:</strong><pre>${escapeHtml(ans)}</pre></div>`,
          ].filter(Boolean).join("");
        })
        .filter(Boolean)
        .join("<hr class=\"turn-sep\">");
      return `<section class="model-section">${headerHtml}${body}</section>`;
    }

    if (contentBlocks.length > 1) {
      const body = contentBlocks
        .map((b) => `<div class="ai-turn"><strong>AI:</strong><pre>${escapeHtml(b)}</pre></div>`)
        .join("<hr class=\"turn-sep\">");
      return `<section class="model-section">${headerHtml}${body}</section>`;
    }
    return `<section class="model-section">${headerHtml}<pre>${escapeHtml(singleFallback)}</pre></section>`;
  }

  // ── TXT ─────────────────────────────────────────────────────────────────────
  if (pairs.length > 0) {
    const body = pairs
      .map((p) => {
        const qLine = p.question.replace(/\r?\n/g, " ").trim();
        const ans   = p.answers.join("\n\n") || "暂未提取到内容";
        return [qLine ? `User: ${qLine}` : null, `AI: ${ans}`].filter(Boolean).join("\n\n");
      })
      .filter(Boolean)
      .join("\n\n" + "-".repeat(40) + "\n\n");
    return `${name}\nURL: ${url}\n\n${body}`;
  }

  if (contentBlocks.length > 1) {
    const body = contentBlocks
      .map((b) => `AI: ${b}`)
      .join("\n\n" + "-".repeat(40) + "\n\n");
    return `${name}\nURL: ${url}\n\n${body}`;
  }
  return `${name}\nURL: ${url}\n\n${singleFallback}`;
}

// ─── 以下函数保留备用，不再用于主导出流程 ───────────────────────────────────
function buildSectionsFromFullConversation(responses) {
  const stripPrefix = (text) =>
    String(text || "").replace(/^(你说|You\s+said)[：:：\s]*/i, "").trim();

  const withTurns = responses.filter((r) => Array.isArray(r.turns) && r.turns.length > 0);
  if (withTurns.length === 0) return null;

  // Step 1: 提取每个模型的 Q&A pair 列表
  const modelData = withTurns.map((resp) => {
    const pairs = [];
    let cur = null;
    for (const turn of resp.turns) {
      if (turn.role === "user") {
        const q = stripPrefix(turn.text);
        if (!q) continue;
        cur = { question: q, normQ: normalizeQueryForMatch(q), answers: [] };
        pairs.push(cur);
      } else if (turn.role === "assistant" && cur) {
        const text = flattenExportBodyMarkdown(String(turn.text || ""));
        const last = cur.answers[cur.answers.length - 1];
        if (text && text !== last) cur.answers.push(text);
      }
    }
    return { siteName: resp.siteName, url: resp.url, pairs };
  });

  // Step 2: 统计每个问题在多少模型里出现
  const qCount = new Map();   // normQ → number of models
  const qText = new Map();    // normQ → display text (首次出现)
  for (const model of modelData) {
    const seen = new Set();
    for (const p of model.pairs) {
      if (seen.has(p.normQ)) continue;
      seen.add(p.normQ);
      qCount.set(p.normQ, (qCount.get(p.normQ) || 0) + 1);
      if (!qText.has(p.normQ)) qText.set(p.normQ, p.question);
    }
  }

  const total = modelData.length;
  const isCommon = (normQ) => total === 1 || (qCount.get(normQ) || 0) >= 2;

  // Step 3: 按首次出现顺序收集通用问题
  const commonNormQs = [];
  const added = new Set();
  for (const model of modelData) {
    for (const p of model.pairs) {
      if (isCommon(p.normQ) && !added.has(p.normQ)) {
        added.add(p.normQ);
        commonNormQs.push(p.normQ);
      }
    }
  }
  if (commonNormQs.length === 0) return null;

  // Step 4: 构建章节
  const sections = [];
  for (const normQ of commonNormQs) {
    const query = qText.get(normQ) || normQ;
    const items = [];

    for (const model of modelData) {
      const idx = model.pairs.findIndex((p) => p.normQ === normQ);
      if (idx === -1) continue;

      const main = model.pairs[idx];
      // 单独追问：此通用问题之后、下一个通用问题之前、仅属于本模型的问题
      const followups = [];
      for (let i = idx + 1; i < model.pairs.length; i++) {
        if (isCommon(model.pairs[i].normQ)) break;
        followups.push(model.pairs[i]);
      }

      items.push({
        siteName: model.siteName,
        url: model.url,
        mainAnswer: main.answers.join("\n\n") || "暂未提取到内容",
        followups,
      });
    }

    // 没有 turns 数据的模型用 content 兜底
    for (const resp of responses) {
      if (items.some((it) => it.siteName === resp.siteName)) continue;
      items.push({
        siteName: resp.siteName,
        url: resp.url,
        mainAnswer: flattenExportBodyMarkdown(resp.content || "暂未提取到内容"),
        followups: [],
      });
    }

    if (items.length > 0) sections.push({ query, items });
  }

  return sections.length > 0 ? sections : null;
}

/**
 * 把 buildSectionsFromFullConversation 返回的章节渲染为指定格式。
 * 每个 item 包含 mainAnswer（大问题回答）和 followups（单独追问列表）。
 */
function renderFullConversationSections(sections, format) {
  if (!sections || sections.length === 0) return "";

  const fmtFollowup = (fu, sep) => {
    const qLine = String(fu.question || "").replace(/\r?\n/g, " ").trim();
    const ans = fu.answers.join("\n\n") || "暂未提取到内容";
    if (!qLine) return ans;
    return sep === "md"
      ? `### ${qLine}\n\n${ans}`
      : `▶ 追问：${qLine}\n\n${ans}`;
  };

  if (format === "markdown") {
    return sections
      .map((section) => {
        const queryLine = String(section.query || "").replace(/\r?\n/g, " ").trim();
        const modelBlocks = section.items
          .map((item) => {
            const parts = [item.mainAnswer];
            if (item.followups && item.followups.length > 0) {
              parts.push(...item.followups.map((fu) => fmtFollowup(fu, "md")));
            }
            return `## ${item.siteName}\n\n**URL：**${item.url}\n\n${parts.filter(Boolean).join("\n\n")}`;
          })
          .join("\n\n");
        return [`# ${queryLine}`, modelBlocks].filter(Boolean).join("\n\n");
      })
      .join("\n\n---\n\n");
  }

  if (format === "html") {
    const querySections = sections
      .map((section) => {
        const modelBlocks = section.items
          .map((item) => {
            let bodyHtml = `<pre>${escapeHtml(item.mainAnswer)}</pre>`;
            if (item.followups && item.followups.length > 0) {
              bodyHtml += item.followups
                .map((fu) => {
                  const qLine = String(fu.question || "").replace(/\r?\n/g, " ").trim();
                  const ans = fu.answers.join("\n\n") || "暂未提取到内容";
                  return qLine
                    ? `<h3>${escapeHtml(qLine)}</h3><pre>${escapeHtml(ans)}</pre>`
                    : `<pre>${escapeHtml(ans)}</pre>`;
                })
                .join("");
            }
            return `<section class="model-section"><h2>${escapeHtml(item.siteName)}</h2><p><strong>URL：</strong><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a></p>${bodyHtml}</section>`;
          })
          .join("");
        return `<section class="query-section"><h1>${escapeHtml(section.query)}</h1>${modelBlocks}</section>`;
      })
      .join("<hr>");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 对比结果</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.7}.query-section{margin-bottom:40px}.model-section{margin-bottom:28px}pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f7;padding:16px;border-radius:12px}h3{margin:20px 0 8px;font-size:1em;color:#1e40af}a{color:#2563eb}</style></head><body>${querySections}</body></html>`;
  }

  // TXT format
  return sections
    .map((section) => {
      const modelBlocks = section.items
        .map((item) => {
          const parts = [item.mainAnswer];
          if (item.followups && item.followups.length > 0) {
            parts.push(...item.followups.map((fu) => fmtFollowup(fu, "txt")));
          }
          return `${item.siteName}\nURL: ${item.url}\n\n${parts.filter(Boolean).join("\n\n")}`;
        })
        .join("\n\n" + "-".repeat(32) + "\n\n");
      return [section.query, modelBlocks].filter(Boolean).join("\n\n");
    })
    .join("\n\n" + "=".repeat(40) + "\n\n");
}

/**
 * 导出主函数（新逻辑）：
 * 以"模型"为第一维度，每个模型独立为一个一级块；
 * 该模型对话里的每个用户提问作为二级标题，回答紧跟其后。
 * 不依赖 sessionSnapshots，直接读取各 iframe 当前加载页面的完整对话。
 * 支持从历史复原、单卡片、多卡片、单独追问等全部场景。
 */
export function generateExportContent(responses, format, selectedSiteIds = null) {
  const allowedNames = buildSiteNameFilter(selectedSiteIds);
  const filtered = allowedNames
    ? responses.filter((r) => allowedNames.has(r.siteName))
    : responses;

  if (filtered.length === 0) return "";

  if (format === "markdown") {
    return filtered
      .map((resp) => renderSingleModelBlock(resp, "markdown"))
      .join("\n\n---\n\n");
  }

  if (format === "html") {
    const blocks = filtered
      .map((resp) => renderSingleModelBlock(resp, "html"))
      .join("<hr>");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 对话导出</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.7}.model-section{margin-bottom:40px}pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f7;padding:16px;border-radius:12px}h2{color:#1e40af;margin:28px 0 8px}a{color:#2563eb}</style></head><body>${blocks}</body></html>`;
  }

  // TXT
  return filtered
    .map((resp) => renderSingleModelBlock(resp, "txt"))
    .join("\n\n" + "=".repeat(40) + "\n\n");
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
