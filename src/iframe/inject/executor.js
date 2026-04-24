import { SUBMIT_ACTIONS, delay } from "./constants.js";
import {
  safeFocus,
  isTextControl,
  setNativeValue,
  dispatchEventList,
  dispatchKeyboardEvent,
  detectInputType,
} from "./dom-utils.js";
import { setContenteditableValue } from "./editors.js";

export async function executeSiteHandler(query, handlerConfig) {
  if (!handlerConfig || !Array.isArray(handlerConfig.steps) || handlerConfig.steps.length === 0) {
    throw new Error("无效的站点处理器配置");
  }

  const context = { submitted: false };

  for (const step of handlerConfig.steps) {
    if (context.submitted && SUBMIT_ACTIONS.has(step.action)) {
      continue;
    }

    try {
      await executeStep(step, query, context);
    } catch (error) {
      if (step.optional) continue;
      const label = step.description || step.action || "未知步骤";
      throw new Error(`${label}失败: ${error.message}`);
    }

    if (step.waitAfter) {
      await delay(step.waitAfter);
    }
  }
}

async function executeStep(step, query, context) {
  switch (step.action) {
    case "focus":
      await executeFocus(step);
      return;
    case "setValue":
      await executeSetValue(step, query);
      return;
    case "triggerEvents":
      await executeTriggerEvents(step);
      return;
    case "click":
      if (await executeClick(step)) context.submitted = true;
      return;
    case "wait":
      await delay(step.duration || 0);
      return;
    case "sendKeys":
      await executeSendKeys(step);
      return;
    case "smartSubmit":
      if (await executeSmartSubmit(step)) context.submitted = true;
      return;
    default:
      throw new Error(`不支持的 action: ${step.action}`);
  }
}

async function executeFocus(step) {
  const element = await findElement(step);
  safeFocus(element);
  if (typeof element.click === "function") {
    element.click();
  }
}

async function executeSetValue(step, query) {
  const text = String(query || "");
  // ChatGPT-class SPAs have #prompt-textarea in DOM on iframe load but
  // ProseMirror/React hydration hasn't finished — a write-then-done flow
  // gets clobbered by a re-render. Write, verify, retry until the editor
  // actually takes the text or attempts run out.
  const maxAttempts = step.maxAttempts || 12;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const element = await findElement(step);
    safeFocus(element);

    let inputType = step.inputType === "auto"
      ? detectInputType(element)
      : (step.inputType || detectInputType(element));

    // Kimi's .chat-input-editor and some Vue editors stay
    // contenteditable="false" during SSR → hydration and fall through to
    // "text" mode incorrectly. If the element is a DIV/SPAN-ish editable
    // container, force contenteditable path and try to flip the attribute.
    if (inputType === "text" && !isTextControl(element)) {
      inputType = "contenteditable";
      try {
        if (element.getAttribute("contenteditable") !== "true") {
          element.setAttribute("contenteditable", "true");
        }
      } catch (_error) {
        // some containers actively reset contenteditable; setContenteditableValue fallback handles it
      }
    }

    try {
      if (inputType === "contenteditable") {
        setContenteditableValue(element, text);
      } else if (isTextControl(element)) {
        setNativeValue(element, text);
        dispatchEventList(element, ["input", "change"]);
      } else {
        throw new Error("目标元素不是可写输入控件");
      }
    } catch (error) {
      lastError = error;
    }

    if (!text) return;

    await delay(60 + attempt * 40);

    const current = await readCurrentValue(step);
    if (current.includes(text)) return;
  }

  if (lastError) throw lastError;
  throw new Error("写入输入框后内容未生效");
}

async function readCurrentValue(step) {
  try {
    const element = await findElement(step);
    if (!element) return "";
    if (isTextControl(element)) return String(element.value || "");
    return String(element.textContent || "");
  } catch (_error) {
    return "";
  }
}

async function executeTriggerEvents(step) {
  const element = await findElement(step);
  const events = Array.isArray(step.events) ? step.events : [];
  // contenteditable + execCommand("insertText") already dispatched an
  // isTrusted=true input; a second synthetic input (data=="") makes
  // ProseMirror think the field was emptied and the new text flashes away.
  const filtered = element && element.isContentEditable
    ? events.filter((name) => name !== "input" && name !== "beforeinput")
    : events;
  dispatchEventList(element, filtered);
}

async function executeClick(step) {
  // After setValue, React often needs another render before the send button
  // flips from aria-disabled. Poll until the button is truly usable instead
  // of "click on sight", which would fall through to Enter fallback 1–2s later.
  const selectors = getSelectors(step);
  if (selectors.length === 0) throw new Error("缺少选择器");

  const timeoutMs = Number.isFinite(step.timeout) ? step.timeout : 1500;
  const deadline = Date.now() + timeoutMs;
  let lastSeen = null;

  while (Date.now() <= deadline) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      lastSeen = element;
      if (isUsableSubmitButton(element)) {
        element.click();
        return true;
      }
    }
    await delay(25);
  }

  if (!lastSeen) throw new Error(`未找到元素: ${selectors.join(", ")}`);
  throw new Error("目标按钮处于禁用态");
}

async function executeSendKeys(step) {
  const element = step.selector || step.selectors
    ? await findElement(step)
    : document.activeElement;
  if (!element) throw new Error("没有可发送按键的目标元素");

  const keys = Array.isArray(step.keys) ? step.keys : [];
  for (const key of keys) {
    dispatchKeyboardEvent(element, "keydown", key);
    dispatchKeyboardEvent(element, "keypress", key);
    dispatchKeyboardEvent(element, "keyup", key);
  }
}

async function executeSmartSubmit(step) {
  const anchor = step.selector || step.selectors
    ? await findElement(step)
    : document.activeElement;
  if (!anchor) throw new Error("没有可用于提交的输入元素");

  safeFocus(anchor);

  const submitSelectors = Array.isArray(step.submitSelectors) && step.submitSelectors.length > 0
    ? step.submitSelectors
    : [
        "button[type='submit']",
        "button[aria-label*='发送']",
        "button[aria-label*='Send']",
        "button[title*='发送']",
        "button[title*='Send']",
        "[role='button'][aria-label*='发送']",
        "[role='button'][aria-label*='Send']",
      ];

  // Poll for a usable send button first. Lexical (Kimi) / ProseMirror
  // (ChatGPT) need a React re-render after setValue before the button
  // un-disables — don't skip this with form.requestSubmit() which would
  // silently fail while the button is still disabled.
  const waitMs = Number.isFinite(step.submitWaitMs) ? step.submitWaitMs : 1200;
  const deadline = Date.now() + waitMs;
  while (Date.now() <= deadline) {
    const candidate = findBestSubmitButton(anchor, submitSelectors);
    if (candidate) {
      candidate.click();
      return true;
    }
    await delay(25);
  }

  // Form-submit fallback. Risk: chat.qwen.ai / kimi.com wrap the composer
  // in an empty <form> with no action and no real submit button. Calling
  // form.requestSubmit()/submit() would navigate the iframe to current URL
  // (GET submit), freezing the frame. Only submit when the form has a real
  // action or at least one usable submit button.
  const form = typeof anchor.closest === "function" ? anchor.closest("form") : null;
  if (form && isSafeToSubmitForm(form)) {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return true;
    }
    if (typeof form.submit === "function") {
      form.submit();
      return true;
    }
  }

  // Last resort: synthetic Enter.
  dispatchKeyboardEvent(anchor, "keydown", "Enter");
  dispatchKeyboardEvent(anchor, "keypress", "Enter");
  dispatchKeyboardEvent(anchor, "keyup", "Enter");
  return false;
}

function isSafeToSubmitForm(form) {
  if (!(form instanceof HTMLFormElement)) return false;

  const action = (form.getAttribute("action") || "").trim();
  const currentUrl = (window.location.href || "").split("#")[0];
  const absoluteAction = (() => {
    if (!action) return "";
    try {
      return new URL(action, window.location.href).href.split("#")[0];
    } catch (_error) {
      return "";
    }
  })();

  if (action && absoluteAction && absoluteAction !== currentUrl) return true;

  const submitButton = form.querySelector("button[type='submit'], input[type='submit']");
  if (submitButton && isUsableSubmitButton(submitButton)) return true;

  return false;
}

async function findElement(step) {
  const selectors = getSelectors(step);
  if (selectors.length === 0) throw new Error("缺少选择器");

  const timeoutMs = step.timeout || 6000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    await delay(25);
  }

  throw new Error(`未找到元素: ${selectors.join(", ")}`);
}

function getSelectors(step) {
  if (Array.isArray(step.selectors)) return step.selectors.filter(Boolean);
  if (Array.isArray(step.selector)) return step.selector.filter(Boolean);
  return step.selector ? [step.selector] : [];
}

function findBestSubmitButton(anchor, selectors) {
  const searchRoots = [];
  const nearbyRoot = typeof anchor.closest === "function"
    ? anchor.closest("form, footer, [role='form'], [class*='input'], [class*='composer'], [class*='footer']")
    : null;

  if (nearbyRoot) searchRoots.push(nearbyRoot);
  if (anchor.parentElement) searchRoots.push(anchor.parentElement);
  searchRoots.push(document);

  const seen = new Set();
  const candidates = [];

  searchRoots.forEach((root) => {
    selectors.forEach((selector) => {
      root.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element) || !isUsableSubmitButton(element)) return;
        seen.add(element);
        candidates.push(element);
      });
    });
  });

  if (candidates.length === 0) return null;

  const anchorRect = anchor.getBoundingClientRect();
  candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const leftScore = Math.abs(leftRect.right - anchorRect.right) + Math.abs(leftRect.bottom - anchorRect.bottom);
    const rightScore = Math.abs(rightRect.right - anchorRect.right) + Math.abs(rightRect.bottom - anchorRect.bottom);
    return leftScore - rightScore;
  });

  return candidates[0];
}

function isUsableSubmitButton(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
    return false;
  }

  // Kimi (.send-button-container.disabled) / 豆包 etc. express "disabled" via
  // class names instead of the attribute. Without filtering we'd click a DIV
  // still in disabled state and the site would silently ignore it.
  const className = typeof element.className === "string" ? element.className : "";
  if (/\b(is-disabled|btn-disabled|send-button-container--disabled)\b/.test(className)
    || /(^|\s)disabled(\s|$)/.test(className)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
