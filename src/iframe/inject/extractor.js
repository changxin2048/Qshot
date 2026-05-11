import { EXTENSION_ORIGIN } from "./constants.js";

// ─── API / window-state 优先提取策略 ────────────────────────────────────────
// 比 DOM 选择器更可靠：直接读取站点自身加载对话数据时使用的内部接口或 JS 状态

/**
 * ChatGPT: 从 /backend-api/conversation/{id} 读取完整对话树，
 * 按时间顺序返回 user / assistant turns。
 * inject.js 运行在 chatgpt.com 的 iframe 内，与页面同源，fetch 会自动携带 session cookie。
 */
async function fetchChatGPTConversation() {
  const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  if (!match) return null;
  try {
    const res = await Promise.race([
      fetch(`/backend-api/conversation/${match[1]}`),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.mapping) return null;

    // 从 current_node 沿 parent 链反向走，重建时序顺序
    const nodes = data.mapping;
    const orderedIds = [];
    let nodeId = data.current_node;
    while (nodeId && nodes[nodeId]) {
      orderedIds.unshift(nodeId);
      nodeId = nodes[nodeId]?.parent;
    }

    const turns = [];
    for (const id of orderedIds) {
      const msg = nodes[id]?.message;
      if (!msg) continue;
      const role = msg.author?.role;
      if (role !== "user" && role !== "assistant") continue;
      const parts = msg.content?.parts;
      if (!Array.isArray(parts)) continue;
      const text = parts.filter((p) => typeof p === "string").join("\n").trim();
      if (!text) continue;
      turns.push({ role: role === "user" ? "user" : "assistant", text });
    }
    return turns.length > 0 ? turns : null;
  } catch {
    return null;
  }
}

/**
 * 通用：尝试从页面的 window 状态里读取对话数据，
 * 覆盖 Next.js (__NEXT_DATA__)、React hydration 等常见模式。
 */
function extractFromWindowState() {
  try {
    // Next.js: 对话数据常挂在 pageProps
    const pageProps = window.__NEXT_DATA__?.props?.pageProps;
    if (pageProps) {
      // 遍历候选字段
      const candidates = [
        pageProps?.conversation?.messages,
        pageProps?.chatConversation?.messages,
        pageProps?.messages,
      ];
      for (const msgs of candidates) {
        if (!Array.isArray(msgs) || msgs.length === 0) continue;
        const turns = msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            const text =
              typeof m.content === "string"
                ? m.content
                : Array.isArray(m.content)
                  ? m.content.filter((c) => typeof c === "string").join("\n")
                  : "";
            return { role: m.role, text: text.trim() };
          })
          .filter((m) => m.text);
        if (turns.length > 0) return turns;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * 统一入口：按优先级尝试各种提取策略。
 * 1. 站点特定 API（ChatGPT）
 * 2. window 状态（Next.js / React hydration）
 * 3. DOM 选择器（现有逻辑）
 */
async function extractTurnsWithFallback(host) {
  // ChatGPT / OpenAI
  if (host === "chatgpt.com" || host === "chat.openai.com") {
    const turns = await fetchChatGPTConversation();
    if (turns) return turns;
  }

  // window state（通用兜底，在 DOM 之前）
  const stateTurns = extractFromWindowState();
  if (stateTurns) return stateTurns;

  // DOM 选择器（已有实现）
  return extractConversationTurns();
}

// Review note (CWS/Edge Add-ons): extraction is only used for user-visible
// export/summary features triggered from the extension page. Extracted text
// is postMessage'd back to the extension compare page only; no upload.
export async function handleExtractRequest(message) {
  const host = window.location.hostname.replace(/^www\./, "");
  const targetOrigin = EXTENSION_ORIGIN || "*";
  try {
    const [content, rawTurns] = await Promise.all([
      Promise.resolve(extractReadablePageText()),
      extractTurnsWithFallback(host),
    ]);

    // 如果 turns 里有 assistant 内容但没有 user turn，且调用方传入了 query，
    // 则用 query 补一个合成的 user turn，让导出时至少能显示用户问题标签。
    let turns = rawTurns;
    const query = String(message.query || "").trim();
    if (query && turns && turns.length > 0 && !turns.some((t) => t.role === "user")) {
      turns = [{ role: "user", text: query }, ...turns];
    }

    window.parent.postMessage(
      {
        type: "QSHOT_EXTRACT_RESULT",
        requestId: message.requestId,
        siteId: message.site?.id,
        content,
        turns,
        url: window.location.href,
      },
      targetOrigin
    );
  } catch (_err) {
    // 任何异步错误都走同步 fallback，确保 postMessage 必达
    window.parent.postMessage(
      {
        type: "QSHOT_EXTRACT_RESULT",
        requestId: message.requestId,
        siteId: message.site?.id,
        content: extractReadablePageText(),
        turns: extractConversationTurns(),
        url: window.location.href,
      },
      targetOrigin
    );
  }
}

function extractReadablePageText() {
  const host = window.location.hostname.replace(/^www\./, "");
  const siteText = extractBySiteSelectors(host);
  if (siteText && siteText.length > 40) {
    return siteText;
  }
  return extractWithGenericSelectors();
}

function getSiteContentConfig(host) {
  const configs = {
    "chatgpt.com": {
      containers: ["[data-message-author-role='assistant']"],
      content: [".markdown.prose", ".prose", "[class*='markdown']", "article"],
    },
    "chat.openai.com": {
      containers: ["[data-message-author-role='assistant']"],
      content: [".markdown.prose", ".prose"],
    },
    "chat.deepseek.com": {
      containers: ["[class*='ds-message-bubble'][class*='assistant']", "[class*='message'][class*='assistant']"],
      content: ["[class*='ds-markdown']", "[class*='markdown']", "[class*='chat-message-content']"],
    },
    "kimi.moonshot.cn": {
      containers: ["[class*='segment-item']", "[class*='message'][class*='ai']", "[class*='bubble'][class*='assistant']"],
      content: ["[class*='markdown-content']", "[class*='content']", "[class*='text']"],
    },
    "kimi.com": {
      containers: ["[class*='segment-item']", "[class*='message'][class*='ai']", "[class*='bubble'][class*='assistant']", "[class*='chat-content-item']"],
      content: ["[class*='markdown-content']", "[class*='content']", "[class*='text']", "[class*='markdown']"],
    },
    "tongyi.aliyun.com": {
      containers: ["[class*='answer-message']", "[class*='agent-chat__answer']", "[class*='chat-bubble']"],
      content: ["[class*='markdown']", "[class*='answer-text']", "[class*='content']"],
    },
    "doubao.com": {
      containers: ["[data-author-type='2']", "[class*='chat-response']", "[class*='assistant-message']"],
      content: ["[class*='markdown']", "[class*='message-text']", "[class*='content']"],
    },
    "gemini.google.com": {
      containers: ["model-response", "message-content[class*='model']", "[class*='response-container']"],
      content: [".markdown", "[class*='response-content']", "[class*='model-response-text']"],
    },
    "chatglm.cn": {
      containers: ["[class*='chat-msg--ai']", "[class*='assistant-message']"],
      content: ["[class*='content']", "[class*='markdown']", "[class*='text']"],
    },
    "yuanbao.tencent.com": {
      containers: ["[class*='agent-chat__message--ai']", "[class*='ai-message']"],
      content: ["[class*='hyper-text']", "[class*='markdown']", "[class*='content']"],
    },
    // 通义千问新域名
    "qianwen.com": {
      containers: ["[class*='answer-message']", "[class*='ai-message']", "[class*='assistant-message']"],
      content: ["[class*='markdown']", "[class*='answer-text']", "[class*='content']"],
    },
  };

  for (const [domain, config] of Object.entries(configs)) {
    if (host === domain || host.endsWith("." + domain)) return config;
  }
  return null;
}

function domToMarkdown(element) {
  function convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "button", "svg", "aside"].includes(tag)) return "";

    const children = () => Array.from(node.childNodes).map(convertNode).join("");

    switch (tag) {
      case "h1": return `\n\n# ${children().trim()}\n\n`;
      case "h2": return `\n\n## ${children().trim()}\n\n`;
      case "h3": return `\n\n### ${children().trim()}\n\n`;
      case "h4": return `\n\n#### ${children().trim()}\n\n`;
      case "h5": return `\n\n##### ${children().trim()}\n\n`;
      case "h6": return `\n\n###### ${children().trim()}\n\n`;
      case "p": {
        const inner = children().trim();
        return inner ? `\n\n${inner}\n\n` : "";
      }
      case "br": return "  \n";
      case "hr": return "\n\n---\n\n";
      case "strong":
      case "b": {
        const inner = children().trim();
        return inner ? `**${inner}**` : "";
      }
      case "em":
      case "i": {
        const inner = children().trim();
        return inner ? `*${inner}*` : "";
      }
      case "del":
      case "s": {
        const inner = children().trim();
        return inner ? `~~${inner}~~` : "";
      }
      case "code": {
        if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") {
          return node.textContent || "";
        }
        const inner = children().trim();
        return inner ? `\`${inner}\`` : "";
      }
      case "pre": {
        const codeEl = node.querySelector("code");
        let lang = "";
        if (codeEl) {
          const classMatch = codeEl.className.match(/language-(\w+)/);
          if (classMatch) lang = classMatch[1];
        }
        const content = (codeEl || node).textContent || "";
        return `\n\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n\n`;
      }
      case "blockquote": {
        const inner = children().trim().split("\n").map((line) => `> ${line}`).join("\n");
        return `\n\n${inner}\n\n`;
      }
      case "ul": {
        const liEls = Array.from(node.querySelectorAll("li")).filter(
          (el) => el.closest("ul") === node || el.closest("ol") === node
        );
        const items = liEls
          .map((li) => {
            const text = convertNode(li).trim();
            return `- ${text.replace(/\n/g, "\n  ")}`;
          })
          .join("\n");
        return items ? `\n\n${items}\n\n` : "";
      }
      case "ol": {
        const liEls = Array.from(node.querySelectorAll("li")).filter(
          (el) => el.closest("ul") === node || el.closest("ol") === node
        );
        const items = liEls
          .map((li, idx) => {
            const text = convertNode(li).trim();
            return `${idx + 1}. ${text.replace(/\n/g, "\n   ")}`;
          })
          .join("\n");
        return items ? `\n\n${items}\n\n` : "";
      }
      case "li": {
        const inner = children().trim();
        return inner.replace(/\n{3,}/g, "\n\n");
      }
      case "div":
      case "section":
      case "article":
      case "figure":
      case "figcaption":
      case "details":
      case "summary": {
        const inner = children().trim();
        return inner ? `\n\n${inner}\n\n` : "";
      }
      case "a": {
        const href = (node.getAttribute("href") || "").trim();
        const text = children().trim();
        if (!text) return "";
        if (!href || href.startsWith("#") || href === text) return text;
        return `[${text}](${href})`;
      }
      case "img": {
        const alt = node.getAttribute("alt") || "";
        return alt ? `[图片: ${alt}]` : "";
      }
      case "table": return convertTable(node);
      default: return children();
    }
  }

  function convertTable(tableEl) {
    const allRows = Array.from(tableEl.querySelectorAll("tr"));
    if (!allRows.length) return "";
    const data = allRows
      .map((row) =>
        Array.from(row.querySelectorAll("th, td")).map((cell) =>
          (cell.innerText || cell.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n/g, " ")
        )
      )
      .filter((row) => row.length > 0);
    if (!data.length) return "";
    const colCount = Math.max(...data.map((r) => r.length));
    const normalized = data.map((row) => {
      while (row.length < colCount) row.push("");
      return row;
    });
    const sep = Array(colCount).fill("---");
    const lines = [
      `| ${normalized[0].join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ];
    return `\n\n${lines.join("\n")}\n\n`;
  }

  return convertNode(element).replace(/\n{3,}/g, "\n\n").trim();
}

function extractBySiteSelectors(host) {
  const config = getSiteContentConfig(host);
  if (!config) return "";

  const parts = [];

  for (const containerSel of (config.containers || [])) {
    const containers = Array.from(document.querySelectorAll(containerSel));
    if (containers.length === 0) continue;

    for (const container of containers) {
      let text = "";
      for (const contentSel of (config.content || [])) {
        const el = container.querySelector(contentSel);
        if (el) {
          text = domToMarkdown(el);
          break;
        }
      }
      if (!text) text = domToMarkdown(container);
      if (text) parts.push(text);
    }

    if (parts.length > 0) break;
  }

  if (parts.length > 0) return parts.join("\n\n---\n\n").slice(0, 10000);

  for (const contentSel of (config.content || [])) {
    const nodes = Array.from(document.querySelectorAll(contentSel));
    if (nodes.length > 0) {
      const texts = nodes.map((n) => domToMarkdown(n)).filter(Boolean);
      if (texts.length > 0) return texts.join("\n\n---\n\n").slice(0, 10000);
    }
  }

  return "";
}

function extractWithGenericSelectors() {
  const selectors = [
    "[data-message-author-role='assistant']",
    ".markdown",
    ".prose",
    "[class*='assistant-message']",
    "[class*='ai-message']",
    "[class*='bot-message']",
    "[class*='response-content']",
    "main article",
    "main",
  ];

  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector))
      .map((node) => domToMarkdown(node))
      .filter(Boolean);
    if (nodes.length > 0) return nodes.join("\n\n---\n\n").slice(0, 10000);
  }

  return (document.body?.innerText || "").trim().slice(0, 8000);
}

function getSiteConversationConfig(host) {
  const makeAiExtractor = (selectors) => (el) => {
    for (const sel of selectors) {
      const found = el.querySelector(sel);
      if (found) return domToMarkdown(found);
    }
    return domToMarkdown(el);
  };

  const configs = {
    "chatgpt.com": {
      allMessages: "[data-message-author-role='user'], [data-message-author-role='assistant']",
      getRole: (el) => el.getAttribute("data-message-author-role"),
      getUserText: (el) => {
        const inner = el.querySelector(".whitespace-pre-wrap") || el.querySelector("p");
        return ((inner || el).innerText || "").trim();
      },
      getAiText: makeAiExtractor([".markdown.prose", ".prose", "[class*='markdown']"]),
    },
    "chat.openai.com": {
      allMessages: "[data-message-author-role='user'], [data-message-author-role='assistant']",
      getRole: (el) => el.getAttribute("data-message-author-role"),
      getUserText: (el) => {
        const inner = el.querySelector(".whitespace-pre-wrap") || el.querySelector("p");
        return ((inner || el).innerText || "").trim();
      },
      getAiText: makeAiExtractor([".markdown.prose", ".prose"]),
    },
    "doubao.com": {
      // 豆包多版本兼容：旧版用 data-author-type，新版用 class 命名
      userSelector: [
        "[data-author-type='1']",
        "[class*='message--human']",
        "[class*='chat-message--human']",
        "[class*='human-message']",
        "[class*='sender-content']",
      ],
      assistantSelector: [
        "[data-author-type='2']",
        "[class*='message--bot']",
        "[class*='chat-message--bot']",
        "[class*='bot-message']",
        "[class*='assistant-message']",
        "[class*='receiver-content']",
      ],
      getAiText: makeAiExtractor(["[class*='markdown']", "[class*='message-text']", "[class*='content']"]),
    },
    "chat.deepseek.com": {
      userSelector: ["[class*='human-message']", "[class*='ds-message-bubble--user']", "[class*='user-message']"],
      assistantSelector: ["[class*='ds-message-bubble--assistant']", "[class*='ds-message-bubble'][class*='assistant']"],
      getAiText: makeAiExtractor(["[class*='ds-markdown']", "[class*='markdown']"]),
    },
    "kimi.moonshot.cn": {
      userSelector: ["[class*='chat-message--user']", "[class*='segment'][class*='user']", "[class*='human']"],
      assistantSelector: ["[class*='chat-message--ai']", "[class*='segment'][class*='ai']", "[class*='bubble'][class*='assistant']"],
      getAiText: makeAiExtractor(["[class*='markdown-content']", "[class*='content']"]),
    },
    "kimi.com": {
      userSelector: ["[class*='chat-message--user']", "[class*='segment'][class*='user']", "[class*='human']", "[class*='user-message']"],
      assistantSelector: ["[class*='chat-message--ai']", "[class*='segment'][class*='ai']", "[class*='bubble'][class*='assistant']", "[class*='chat-content-item']"],
      getAiText: makeAiExtractor(["[class*='markdown-content']", "[class*='content']", "[class*='markdown']"]),
    },
    "gemini.google.com": {
      // 只保留最外层容器，避免父子元素同时命中导致同一条消息被抓两次
      userSelector: ["user-query"],
      assistantSelector: ["model-response"],
      getAiText: makeAiExtractor([".markdown", "[class*='response-content']", "[class*='model-response-text']"]),
    },
    "tongyi.aliyun.com": {
      userSelector: ["[class*='chat-bubble-user']", "[class*='question-container']", "[class*='user-message']"],
      assistantSelector: ["[class*='answer-message']", "[class*='agent-chat__answer']"],
      getAiText: makeAiExtractor(["[class*='markdown']", "[class*='answer-text']"]),
    },
    "chatglm.cn": {
      userSelector: ["[class*='chat-msg--human']"],
      assistantSelector: ["[class*='chat-msg--ai']"],
      getAiText: makeAiExtractor(["[class*='content']", "[class*='markdown']"]),
    },
    "yuanbao.tencent.com": {
      userSelector: ["[class*='agent-chat__message--human']", "[class*='question']"],
      // 只取 AI 真实回复容器，跳过思考/推理框（reasoning/thinking）
      assistantSelector: [
        "[class*='agent-chat__message--ai']:not([class*='reasoning'])",
        "[class*='agent-chat__message--ai']:not([class*='thinking'])",
        "[class*='agent-chat__message--ai']",
      ],
      getAiText: makeAiExtractor(["[class*='hyper-text']", "[class*='markdown']", "[class*='content']"]),
    },
    // 通义千问新域名 qianwen.com（旧域名 tongyi.aliyun.com 已迁移）
    "qianwen.com": {
      userSelector: [
        "[class*='human-message']",
        "[class*='user-message']",
        "[class*='chat-bubble-user']",
        "[class*='question-container']",
      ],
      assistantSelector: [
        "[class*='answer-message']",
        "[class*='agent-chat__answer']",
        "[class*='ai-message']",
        "[class*='assistant-message']",
      ],
      getAiText: makeAiExtractor(["[class*='markdown']", "[class*='answer-text']", "[class*='content']"]),
    },
    // Claude.ai
    "claude.ai": {
      userSelector: [
        "[data-testid='human-turn']",
        "[class*='human-turn']",
        "[class*='user-message']",
        "[class*='HumanMessage']",
      ],
      assistantSelector: [
        "[data-testid='assistant-turn']",
        "[class*='assistant-turn']",
        "[class*='ai-message']",
        "[class*='AssistantMessage']",
      ],
      getAiText: makeAiExtractor(["[class*='prose']", "[class*='markdown']", "[class*='content']"]),
    },
    // Grok (grok.com)
    "grok.com": {
      userSelector: [
        "[class*='human-message']",
        "[class*='user-message']",
        "[class*='message--user']",
        "[class*='query']",
      ],
      assistantSelector: [
        "[class*='assistant-message']",
        "[class*='ai-message']",
        "[class*='message--assistant']",
        "[class*='response']",
      ],
      getAiText: makeAiExtractor(["[class*='markdown']", "[class*='prose']", "[class*='content']"]),
    },
  };

  for (const [domain, config] of Object.entries(configs)) {
    if (host === domain || host.endsWith("." + domain)) return config;
  }
  return null;
}

/**
 * 通用对话轮次提取兜底：当站点未在 getSiteConversationConfig 中配置时使用。
 * 按常见 AI 聊天站点的 class/attribute 命名模式逐一尝试，找到第一个
 * 能同时提取到 user turn 和 assistant turn 的方案即返回结果。
 * 候选方案按"精确度"从高到低排列，避免把无关元素误判为对话。
 */
function extractConversationTurnsGeneric() {
  // 每个候选：[userSelector, assistantSelector]
  const candidates = [
    ["[data-message-author-role='user']",    "[data-message-author-role='assistant']"],
    ["[data-author-type='1']",               "[data-author-type='2']"],
    ["[class*='human-turn']",                "[class*='assistant-turn']"],
    ["[class*='user-turn']",                 "[class*='assistant-turn']"],
    ["[class*='human-message']",             "[class*='assistant-message']"],
    ["[class*='user-message']",              "[class*='ai-message']"],
    ["[class*='human-bubble']",              "[class*='assistant-bubble']"],
    ["[class*='message--human']",            "[class*='message--bot']"],
    ["[class*='message--user']",             "[class*='message--bot']"],
    ["[class*='chat-message--human']",       "[class*='chat-message--bot']"],
    ["[class*='sender-content']",            "[class*='receiver-content']"],
    ["[class*='chat-msg--human']",           "[class*='chat-msg--ai']"],
    ["[class*='request-item']",              "[class*='response-item']"],
  ];

  for (const [userSel, aiSel] of candidates) {
    try {
      const userEls = Array.from(document.querySelectorAll(userSel));
      const aiEls   = Array.from(document.querySelectorAll(aiSel));
      if (userEls.length === 0 || aiEls.length === 0) continue;

      // 简单合理性检验：user 数量应该 ≈ ai 数量（允许差 1），避免把全局元素误匹配
      if (Math.abs(userEls.length - aiEls.length) > Math.max(userEls.length, aiEls.length)) continue;

      const combined = `${userSel}, ${aiSel}`;
      const allEls   = filterDescendants(Array.from(document.querySelectorAll(combined)));
      const userSet  = new Set(userEls);

      const turns = [];
      for (const el of allEls) {
        const isUser = userSet.has(el);
        const text   = isUser
          ? (el.innerText || el.textContent || "").trim()
          : domToMarkdown(el);
        if (text && text.length > 2) {
          turns.push({ role: isUser ? "user" : "assistant", text });
        }
      }

      const hasUser      = turns.some((t) => t.role === "user");
      const hasAssistant = turns.some((t) => t.role === "assistant");
      if (hasUser && hasAssistant) return turns;
    } catch (_) { /* 选择器语法错误等，跳过此候选 */ }
  }

  // ── 排除法兜底：通过"已知 AI 元素"定位聊天容器，非 AI 同级元素视为用户消息 ──
  // 适用于豆包等 AI 元素有明确标识、但用户消息无特定标识的站点。
  // 条件：所有 AI 元素必须共享同一个直接父容器（平铺结构），
  //       且父容器里的非 AI 子元素文本内容像一条用户消息（长度合理）。
  const exclusionAiSelectors = [
    "[data-author-type='2']",
    "[data-message-author-role='assistant']",
    "[class*='bot-message']",
    "[class*='assistant-message']",
  ];
  for (const aiSel of exclusionAiSelectors) {
    try {
      const aiEls = Array.from(document.querySelectorAll(aiSel));
      if (aiEls.length < 1) continue;

      // 检查是否所有 AI 元素共享同一个父节点（平铺结构）
      const parent = aiEls[0].parentElement;
      if (!parent || !aiEls.every((el) => el.parentElement === parent)) continue;

      const aiSet = new Set(aiEls);
      const siblings = Array.from(parent.children);
      const turns = [];

      for (const sib of siblings) {
        if (aiSet.has(sib)) {
          const text = domToMarkdown(sib);
          if (text && text.length > 5) turns.push({ role: "assistant", text });
        } else {
          // 可能是用户消息：长度在合理范围内（排除空元素和过长的非消息内容）
          const text = (sib.innerText || sib.textContent || "").trim();
          if (text && text.length >= 2 && text.length <= 3000) {
            turns.push({ role: "user", text });
          }
        }
      }

      const hasUser = turns.some((t) => t.role === "user");
      const hasAI   = turns.some((t) => t.role === "assistant");
      if (hasUser && hasAI) return turns;
    } catch (_) { /* skip */ }
  }

  return null;
}

/**
 * 去掉元素列表中互为祖先/后代关系的元素，只保留最外层。
 * 解决如 Gemini "user-query" 和其子元素同时命中导致同一条消息被抓两次的问题。
 */
function filterDescendants(elements) {
  return elements.filter(
    (el) => !elements.some((other) => other !== el && other.contains(el))
  );
}

function extractConversationTurns() {
  const host = window.location.hostname.replace(/^www\./, "");
  const config = getSiteConversationConfig(host);

  if (config) {
    const turns = [];
    try {
      if (config.allMessages) {
        const els = Array.from(document.querySelectorAll(config.allMessages));
        for (const el of els) {
          const role = config.getRole(el);
          if (role !== "user" && role !== "assistant") continue;
          const text = role === "user"
            ? (config.getUserText ? config.getUserText(el) : (el.innerText || "").trim())
            : (config.getAiText ? config.getAiText(el) : domToMarkdown(el));
          if (text && text !== "暂未提取到内容") turns.push({ role, text });
        }
        // allMessages 模式：若没有 user turn，说明选择器不适配当前页面版本，走通用兜底
        if (turns.length > 0 && !turns.some((t) => t.role === "user")) {
          return extractConversationTurnsGeneric();
        }
      } else {
        const userSelStr = (config.userSelector || []).join(", ");
        const aiSelStr   = (config.assistantSelector || []).join(", ");
        if (!userSelStr && !aiSelStr) return extractConversationTurnsGeneric();

        const combined = [userSelStr, aiSelStr].filter(Boolean).join(", ");
        // 过滤父子重复：同一条消息的外层容器和内层元素可能都命中选择器，只保留最外层
        const allEls   = filterDescendants(Array.from(document.querySelectorAll(combined)));
        const userEls  = new Set(userSelStr ? Array.from(document.querySelectorAll(userSelStr)) : []);

        for (const el of allEls) {
          const role = userEls.has(el) ? "user" : "assistant";
          const text = role === "user"
            ? (el.innerText || el.textContent || "").trim()
            : (config.getAiText ? config.getAiText(el) : domToMarkdown(el));
          if (text && text !== "暂未提取到内容") turns.push({ role, text });
        }
        // userSelector 模式：同样检查是否实际找到了 user turn
        if (turns.length > 0 && !turns.some((t) => t.role === "user")) {
          return extractConversationTurnsGeneric();
        }
      }
    } catch (_err) {
      return extractConversationTurnsGeneric();
    }

    if (turns.length > 0) return turns;
    return extractConversationTurnsGeneric();
  }

  return extractConversationTurnsGeneric();
}
