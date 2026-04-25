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
      if (await executeSmartSubmit(step, query)) context.submitted = true;
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
    if (current.includes(text) && await valueRemainsStable(step, text)) return;
  }

  if (lastError) throw lastError;
  throw new Error("写入输入框后内容未生效");
}

async function valueRemainsStable(step, text) {
  const stableWaitMs = Number.isFinite(step.stableWaitMs) ? step.stableWaitMs : 0;
  if (stableWaitMs <= 0) {
    return true;
  }

  const deadline = Date.now() + stableWaitMs;
  while (Date.now() < deadline) {
    await delay(Math.min(120, deadline - Date.now()));
    const current = await readCurrentValue(step);
    if (!current.includes(text)) {
      return false;
    }
  }

  return true;
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
        activateSubmitButton(element);
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

async function executeSmartSubmit(step, query) {
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
      activateSubmitButton(candidate);
      if (step.enterFallbackAfterClick === true && await shouldTryKeyboardFallbackAfterClick(step, query, anchor)) {
        const retryCandidate = findBestSubmitButton(anchor, submitSelectors);
        if (retryCandidate && retryCandidate !== candidate) {
          activateSubmitButton(retryCandidate);
          await delay(120);
        }
        dispatchSubmitKeys(anchor);
      }
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
  dispatchSubmitKeys(anchor);
  return false;
}

function dispatchSubmitKeys(anchor) {
  const targets = [anchor, document.activeElement, document.body, document].filter(Boolean);
  const seen = new Set();

  targets.forEach((target) => {
    if (seen.has(target)) return;
    seen.add(target);
    dispatchKeyboardEvent(target, "keydown", "Enter");
    dispatchKeyboardEvent(target, "keypress", "Enter");
    dispatchKeyboardEvent(target, "keyup", "Enter");
  });
}

function activateSubmitButton(element) {
  safeFocus(element);
  dispatchPointerLikeEvent(element, "pointerdown");
  dispatchPointerLikeEvent(element, "mousedown");
  dispatchPointerLikeEvent(element, "pointerup");
  dispatchPointerLikeEvent(element, "mouseup");
  if (typeof element.click === "function") {
    element.click();
  }
}

function dispatchPointerLikeEvent(element, type) {
  const rect = element.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: type.endsWith("down") ? 1 : 0,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  const EventCtor = type.startsWith("pointer") && typeof PointerEvent === "function"
    ? PointerEvent
    : MouseEvent;
  element.dispatchEvent(new EventCtor(type, eventInit));
}

async function shouldTryKeyboardFallbackAfterClick(step, query, anchor) {
  const text = String(query || "").trim();
  if (!text) return false;

  const waitMs = Number.isFinite(step.postClickVerifyMs) ? step.postClickVerifyMs : 600;
  await delay(waitMs);

  const current = readCurrentValueNow(step, anchor);
  return current.includes(text);
}

function readCurrentValueNow(step, anchor) {
  const anchorText = readElementValue(anchor);
  if (anchorText) return anchorText;

  for (const selector of getSelectors(step)) {
    const element = document.querySelector(selector);
    const value = readElementValue(element);
    if (value) return value;
  }

  return "";
}

function readElementValue(element) {
  if (!element) return "";
  if (isTextControl(element)) return String(element.value || "");
  return String(element.textContent || "");
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
  if (element.hasAttribute("disabled")
    || element.getAttribute("aria-disabled") === "true"
    || element.getAttribute("data-disabled") === "true") {
    return false;
  }

  // Kimi (.send-button-container.disabled) / 豆包 etc. express "disabled" via
  // class names instead of the attribute. Without filtering we'd click a DIV
  // still in disabled state and the site would silently ignore it.
  if (hasDisabledState(element)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden"
    && style.display !== "none"
    && style.pointerEvents !== "none";
}

function hasDisabledState(element) {
  const disabledClassPattern = /(^|\s|[-_])(disabled|is-disabled|btn-disabled|button-disabled|mat-mdc-button-disabled|send-button-container--disabled)(\s|$|[-_])/i;
  let current = element;

  while (current instanceof HTMLElement) {
    const className = typeof current.className === "string" ? current.className : "";
    if (disabledClassPattern.test(className)
      || current.getAttribute("aria-disabled") === "true"
      || current.getAttribute("data-disabled") === "true") {
      return true;
    }

    if (current.tagName === "FORM" || current.getAttribute("role") === "form") {
      return false;
    }
    current = current.parentElement;
  }

  return false;
}
