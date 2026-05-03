// declarativeNetRequest 规则的"源数据"。
//
// 设计目的：原本静态的 rules.json 因为每个站点都重复 ~60 行
// (Sec-Fetch-* 写入 + CSP / X-Frame-Options 移除) 而膨胀到 1800+ 行，
// 违反"单文件 ≤ 500 行"约束。这里只列出站点列表 + 模板，
// 由 build.mjs 在构建时展开成 dist/config/rules.json。
//
// 修改规则后跑 `npm run build` 即可生效。

// 通用的 Sec-Fetch-* 请求头改写：让目标站点把 iframe 请求当成
// 同源顶层导航处理，从而绕过部分 SPA 在第三方 frame 下的初始化分支。
const COMMON_REQUEST_HEADERS = [
  { header: "Sec-Fetch-Dest", operation: "set", value: "document" },
  { header: "Sec-Fetch-Site", operation: "set", value: "same-origin" },
  { header: "Sec-Fetch-Mode", operation: "set", value: "navigate" },
  { header: "Sec-Fetch-User", operation: "set", value: "?1" },
];

// 通用的响应头移除：清掉拒绝嵌入的策略头。
const COMMON_RESPONSE_HEADERS = [
  { header: "content-security-policy", operation: "remove" },
  { header: "content-security-policy-report-only", operation: "remove" },
  { header: "x-frame-options", operation: "remove" },
];

// 默认 host 规则：每个 host 一条，priority 1，仅 sub_frame。
// 顺序就是输出 rule.id 的顺序（1..N）。
const HOST_RULES = [
  { host: "chatgpt.com" },
  { host: "chat.openai.com" },
  { host: "chat.deepseek.com" },
  { host: "deepseek.com" },
  { host: "kimi.moonshot.cn" },
  { host: "tongyi.aliyun.com" },
  { host: "qwen.ai" },
  { host: "chat.qwen.ai" },
  { host: "doubao.com" },
  { host: "www.doubao.com" },
  { host: "gemini.google.com" },
  { host: "claude.ai" },
  { host: "yuanbao.tencent.com" },
  { host: "metaso.cn" },
  { host: "xiaohongshu.com" },
  { host: "www.xiaohongshu.com" },
  { host: "bilibili.com" },
  { host: "www.bilibili.com" },
  { host: "search.bilibili.com" },
  { host: "zhihu.com" },
  { host: "www.zhihu.com" },
  { host: "douyin.com" },
  { host: "www.douyin.com" },
  // Grok 在第三方 iframe 下白屏，单独放宽：
  // - 加 Upgrade-Insecure-Requests 模仿顶层导航
  // - 同时覆盖 main_frame，便于 chrome.tabs 直接打开时也吃规则
  {
    host: "grok.com",
    extraRequestHeaders: [
      { header: "Upgrade-Insecure-Requests", operation: "set", value: "1" },
    ],
    resourceTypes: ["main_frame", "sub_frame"],
  },
  { host: "www.kimi.com" },
  { host: "kimi.com" },
  { host: "www.qianwen.com" },
  { host: "qianwen.com" },
  { host: "x.com" },
  { host: "twitter.com" },
  { host: "youtube.com" },
  { host: "www.youtube.com" },
  { host: "reddit.com" },
  { host: "www.reddit.com" },
  { host: "tiktok.com" },
  { host: "www.tiktok.com" },
];

// 批处理规则：用 requestDomains 一次匹配多个站点，priority 2，
// 额外移除几条跨域 / 权限策略头，专治社媒类站点的 iframe 渲染。
const BATCH_RULES = [
  {
    priority: 2,
    requestDomains: ["x.com", "twitter.com", "youtube.com", "reddit.com", "tiktok.com"],
    extraResponseHeadersRemove: [
      "cross-origin-opener-policy",
      "cross-origin-resource-policy",
      "cross-origin-embedder-policy",
      "permissions-policy",
    ],
  },
];

function buildHostRule(entry, id) {
  const requestHeaders = entry.extraRequestHeaders
    ? [...COMMON_REQUEST_HEADERS, ...entry.extraRequestHeaders]
    : COMMON_REQUEST_HEADERS;
  const resourceTypes = entry.resourceTypes || ["sub_frame"];

  return {
    id,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders,
      responseHeaders: COMMON_RESPONSE_HEADERS,
    },
    condition: {
      urlFilter: `||${entry.host}/`,
      resourceTypes,
    },
  };
}

function buildBatchRule(entry, id) {
  const responseHeaders = [
    ...COMMON_RESPONSE_HEADERS,
    ...(entry.extraResponseHeadersRemove || []).map((header) => ({
      header,
      operation: "remove",
    })),
  ];

  return {
    id,
    priority: entry.priority ?? 2,
    action: {
      type: "modifyHeaders",
      responseHeaders,
    },
    condition: {
      requestDomains: entry.requestDomains,
      resourceTypes: entry.resourceTypes || ["sub_frame"],
    },
  };
}

export function buildDeclarativeNetRequestRules() {
  const rules = [];
  HOST_RULES.forEach((entry, index) => {
    rules.push(buildHostRule(entry, index + 1));
  });
  BATCH_RULES.forEach((entry, index) => {
    rules.push(buildBatchRule(entry, HOST_RULES.length + index + 1));
  });
  return rules;
}
