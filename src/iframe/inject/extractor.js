import { EXTENSION_ORIGIN } from "./constants.js";

export function handleExtractRequest(message) {
  // Review note (CWS/Edge Add-ons): extraction is only used for user-visible
  // export/summary features triggered from the extension page. Extracted text
  // is postMessage'd back to the extension compare page only; no upload.
  const content = extractReadablePageText();
  const turns = extractConversationTurns();
  const targetOrigin = EXTENSION_ORIGIN || "*";
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
      allMessages: "[data-author-type='1'], [data-author-type='2']",
      getRole: (el) => el.getAttribute("data-author-type") === "1" ? "user" : "assistant",
      getUserText: (el) => (el.innerText || el.textContent || "").trim(),
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
      userSelector: ["user-query", ".user-query-bubble-with-background"],
      assistantSelector: ["model-response", "message-content"],
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
      assistantSelector: ["[class*='agent-chat__message--ai']"],
      getAiText: makeAiExtractor(["[class*='hyper-text']", "[class*='markdown']", "[class*='content']"]),
    },
  };

  for (const [domain, config] of Object.entries(configs)) {
    if (host === domain || host.endsWith("." + domain)) return config;
  }
  return null;
}

function extractConversationTurns() {
  const host = window.location.hostname.replace(/^www\./, "");
  const config = getSiteConversationConfig(host);
  if (!config) return null;

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
    } else {
      const userSelStr = (config.userSelector || []).join(", ");
      const aiSelStr = (config.assistantSelector || []).join(", ");
      if (!userSelStr && !aiSelStr) return null;

      const combined = [userSelStr, aiSelStr].filter(Boolean).join(", ");
      const allEls = Array.from(document.querySelectorAll(combined));
      const userEls = new Set(userSelStr ? Array.from(document.querySelectorAll(userSelStr)) : []);

      for (const el of allEls) {
        const role = userEls.has(el) ? "user" : "assistant";
        const text = role === "user"
          ? (el.innerText || el.textContent || "").trim()
          : (config.getAiText ? config.getAiText(el) : domToMarkdown(el));
        if (text && text !== "暂未提取到内容") turns.push({ role, text });
      }
    }
  } catch (_err) {
    return null;
  }

  return turns.length > 0 ? turns : null;
}
