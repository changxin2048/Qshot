// 在 iframe 内把父页 postMessage 过来的 Blob 合成成 ClipboardEvent('paste')
// 派发到站点输入框，由站点自身的粘贴上传监听器接管文件上传。
// 思路对应 docs《多 AI 站点统一文件上传：技术路线分析》第 4 节方案 D。
//
// 关键工程要点（实战验证过的坑）：
//   1) 跨上下文用 Blob（结构化克隆）+ 同时带 name/type/size 元数据，
//      inject 侧重建 File 保证 FileList 能识别。
//   2) 站点特定的 focus 选择器优先于通用兜底（#prompt-textarea 之于 ChatGPT、
//      .chat-input-editor 之于 Kimi、textarea[formcontrolname='promptText'] 之于
//      Gemini 等），让 paste 事件的 target 和站点监听器挂载节点一致。
//   3) focus 必须是真实的 focus（不带 preventScroll），让 document.activeElement
//      就位；派发时直接用 target，不依赖 activeElement——跨域 iframe 在没有
//      browser focus 的情况下 element.focus() 不一定能让 activeElement 切到目标。
//   4) 派发后要留出时间让上传排队请求发出去、文件 chip 渲染出来，再回去走
//      setValue → smartSubmit；上传完成由站点自己的 UI（send 按钮 disabled/
//      enabled 切换）控制，我们的 smartSubmit 本来就轮询按钮可用态，天然等待。

import { diagnosticLog } from "../../shared/diagnostics.js";

const MIME_EXT_FALLBACK = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml"
};

function ensureFileName(name, type) {
  if (name) return name;
  const ext = MIME_EXT_FALLBACK[type] || "bin";
  return `clipboard-${Date.now()}.${ext}`;
}

function blobToFile(entry) {
  // 兼容两种形态：
  //   - { blob, name, type, size, lastModified }（推荐，父页显式包装）
  //   - 裸 File / Blob（降级）
  let blob = null;
  let name = "";
  let type = "";
  let lastModified = Date.now();

  if (entry && typeof entry === "object" && entry.blob instanceof Blob) {
    blob = entry.blob;
    name = entry.name || "";
    type = entry.type || blob.type || "";
    if (Number.isFinite(entry.lastModified)) {
      lastModified = entry.lastModified;
    }
  } else if (entry instanceof Blob) {
    blob = entry;
    name = entry.name || "";
    type = entry.type || "";
    if (entry.lastModified) {
      lastModified = entry.lastModified;
    }
  }

  if (!(blob instanceof Blob)) return null;

  name = ensureFileName(name, type);
  type = type || "application/octet-stream";

  try {
    return new File([blob], name, { type, lastModified });
  } catch (_error) {
    const fallback = blob.slice(0, blob.size, type);
    try {
      Object.defineProperty(fallback, "name", { value: name, configurable: true });
      Object.defineProperty(fallback, "lastModified", { value: lastModified, configurable: true });
    } catch (_err) {
      /* ignore */
    }
    return fallback;
  }
}

function buildClipboardDataTransfer(files) {
  const dt = new DataTransfer();
  files.forEach((file) => {
    if (file) {
      try {
        dt.items.add(file);
      } catch (_error) {
        /* ignore */
      }
    }
  });
  return dt;
}

function buildPasteEvent(files) {
  const dt = buildClipboardDataTransfer(files);
  if (!dt || !dt.files || dt.files.length === 0) {
    return null;
  }

  const event = new ClipboardEvent("paste", {
    clipboardData: dt,
    bubbles: true,
    cancelable: true
  });

  // 兜底：个别浏览器版本构造器会忽略 init 字典里的 clipboardData。
  try {
    if (event.clipboardData !== dt) {
      Object.defineProperty(event, "clipboardData", { value: dt, configurable: true });
    }
  } catch (_error) {
    /* ignore */
  }
  return { event, dt };
}

// 直接派发到 target，不绕 document.activeElement：
// 跨域 iframe 在浏览器没把 focus 给到自己时，element.focus() 不一定让
// document.activeElement 真正切到目标元素（很多场景下还是 body）。这种情况下
// 派发到 activeElement(=body) 几乎肯定收不到——ChatGPT/Claude/Gemini 这类
// 把 paste 监听挂在 React 编辑器节点上的站点都会失败。
//
// 站点的 React/ProseMirror/Lexical 都会把监听挂在编辑器节点上并冒泡到 document，
// 直接派发到编辑器节点是最稳的——既能命中编辑器自身的监听器，也能继续冒泡。
function dispatchPaste(target, files) {
  const built = buildPasteEvent(files);
  if (!built) {
    diagnosticLog("inject.paste", "dispatch-skip-empty-filelist", { expected: files.length });
    return false;
  }

  const ok = target.dispatchEvent(built.event);
  diagnosticLog("inject.paste", "dispatched", {
    targetTag: target?.tagName,
    targetId: target?.id,
    targetClass: typeof target?.className === "string" ? target.className.slice(0, 80) : "",
    fileCount: built.dt.files.length,
    defaultPrevented: built.event.defaultPrevented,
    returnedOk: ok
  });
  return true;
}

// 顺着一组选择器找第一个存在的元素，支持等待（站点 SPA 水合）。
async function findInputElement(selectors, timeoutMs = 4000) {
  const list = (Array.isArray(selectors) ? selectors : [selectors]).filter(Boolean);
  if (list.length === 0) return null;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    for (const selector of list) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (_error) {
        /* 选择器非法，跳过 */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return null;
}

// 默认兜底选择器：从最常见的富文本编辑器到 textarea。
const DEFAULT_INPUT_SELECTORS = [
  '[contenteditable="true"]',
  "textarea",
  'input[type="text"]'
];

export async function deliverFilesToInput(fileEntries, explicitSelectors) {
  if (!Array.isArray(fileEntries) || fileEntries.length === 0) return false;

  const files = fileEntries
    .map(blobToFile)
    .filter((f) => f instanceof Blob);
  if (files.length === 0) {
    diagnosticLog("inject.paste", "reconstruct-failed", { expected: fileEntries.length });
    return false;
  }

  const selectors = Array.isArray(explicitSelectors) && explicitSelectors.length > 0
    ? explicitSelectors
    : DEFAULT_INPUT_SELECTORS;

  const target = await findInputElement(selectors);
  if (!target) {
    diagnosticLog("inject.paste", "input-not-found", { selectors });
    return false;
  }

  // 真实 focus（不用 preventScroll）：让 document.activeElement = target，
  // 站点把 paste 监听挂在 activeElement 上时才能收到。
  try {
    target.focus();
  } catch (_error) {
    /* 个别容器拦截 focus，忽略 */
  }

  // 等待一下 ProseMirror/Lexical/Vue 水合，也让 activeElement 真正就位。
  await new Promise((resolve) => setTimeout(resolve, 200));

  let dispatched = false;
  try {
    dispatched = dispatchPaste(target, files);
  } catch (error) {
    diagnosticLog("inject.paste", "dispatch-error", { error: error.message });
    dispatched = false;
  }

  // 只派发一次：多数 AI 站点的 paste 监听都会同步把文件塞进上传队列，
  // 重试一次会被 Kimi / 豆包等站点当成两次独立上传，结果就是一张图变两份。

  // 给上传排队请求和 UI chip 渲染留一点时间；真正等待"上传完成→发送按钮亮起"
  // 是在 executor.js 的 smartSubmit 轮询里完成的（见 hasFiles 分支里对
  // submitWaitMs / timeout 的动态放大）。
  await new Promise((resolve) => setTimeout(resolve, 400));

  return dispatched;
}

// 从 site.searchHandler 里抽一份最可能的输入框选择器，用于辅助 paste 定位。
// 优先级：第一个 focus 步骤的 selectors / selector → 任何有 selectors 的步骤。
export function extractInputSelectorsFromHandler(handlerConfig) {
  if (!handlerConfig || !Array.isArray(handlerConfig.steps)) return [];

  const collect = (step) => {
    if (!step) return [];
    if (Array.isArray(step.selectors)) return step.selectors.filter(Boolean);
    if (Array.isArray(step.selector)) return step.selector.filter(Boolean);
    if (typeof step.selector === "string") return [step.selector];
    return [];
  };

  const focusStep = handlerConfig.steps.find((s) => s?.action === "focus");
  const focusSelectors = collect(focusStep);
  if (focusSelectors.length > 0) return focusSelectors;

  for (const step of handlerConfig.steps) {
    const got = collect(step);
    if (got.length > 0) return got;
  }
  return [];
}
