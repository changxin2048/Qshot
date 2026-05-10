(() => {
  // src/iframe/inject/constants.js
  var EXTENSION_ORIGIN = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id ? `chrome-extension://${chrome.runtime.id}` : null;
  var SUBMIT_ACTIONS = /* @__PURE__ */ new Set(["click", "sendKeys", "smartSubmit"]);
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // src/iframe/inject/dom-utils.js
  function safeFocus(element) {
    if (!element || typeof element.focus !== "function") {
      return;
    }
    try {
      element.focus({ preventScroll: true });
    } catch (_error) {
      element.focus();
    }
  }
  function isTextControl(element) {
    return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
  }
  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
      return;
    }
    element.value = value;
  }
  function dispatchEventList(element, events) {
    events.forEach((eventName) => {
      let event;
      if (eventName === "input") {
        event = new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: "",
          inputType: "insertText"
        });
      } else {
        event = new Event(eventName, { bubbles: true, cancelable: true });
      }
      element.dispatchEvent(event);
    });
  }
  function dispatchKeyboardEvent(element, phase, key) {
    const event = new KeyboardEvent(phase, {
      key,
      code: key === "Enter" ? "Enter" : key,
      keyCode: key === "Enter" ? 13 : 0,
      which: key === "Enter" ? 13 : 0,
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(event);
  }
  function detectInputType(element) {
    if (element.isContentEditable) {
      return "contenteditable";
    }
    return "text";
  }

  // src/iframe/inject/editors.js
  function setContenteditableValue(element, query) {
    const text = String(query || "");
    safeFocus(element);
    if (isSlateEditor(element)) {
      updateSlateEditorContent(element, text);
      return;
    }
    let selectionSet = false;
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
        selectionSet = true;
      }
    } catch (_error) {
      selectionSet = false;
    }
    let inserted = false;
    if (selectionSet || document.activeElement === element) {
      try {
        inserted = document.execCommand("insertText", false, text);
      } catch (_error) {
        inserted = false;
      }
    }
    if (inserted) {
      return;
    }
    const isLexicalEditor = element.hasAttribute("data-lexical-editor") || element.getAttribute("data-lexical-editor") === "true";
    if (isLexicalEditor) {
      updateLexicalEditorContent(element, text);
      return;
    }
    updateGenericContenteditable(element, text);
  }
  function isSlateEditor(element) {
    if (!element || typeof element.getAttribute !== "function") {
      return false;
    }
    return element.getAttribute("data-slate-editor") === "true" || element.hasAttribute("data-slate-node") || element.hasAttribute("data-slate-string");
  }
  function updateSlateEditorContent(element, query) {
    safeFocus(element);
    const selection = window.getSelection();
    let selectionSet = false;
    try {
      if (selection) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.addRange(range);
        selectionSet = true;
      }
    } catch (_error) {
      selectionSet = false;
    }
    const existingText = String(element.textContent || "");
    if (existingText.trim()) {
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward"
        })
      );
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward"
        })
      );
    }
    if (!query) {
      return;
    }
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: query
      })
    );
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: query
      })
    );
    const stillEmpty = !String(element.textContent || "").trim();
    if (!selectionSet && stillEmpty) {
      const paragraphs = element.querySelectorAll(
        "[data-slate-node='element'], p, div"
      );
      if (paragraphs.length > 0) {
        paragraphs[0].textContent = query;
      } else {
        element.textContent = query;
      }
    }
  }
  function updateLexicalEditorContent(element, query) {
    safeFocus(element);
    let selectionSet = false;
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
        selectionSet = true;
      }
    } catch (_error) {
      selectionSet = false;
    }
    dispatchLexicalEvents(element, query);
    const currentText = String(element.textContent || "");
    if (!query || currentText.includes(query)) {
      return;
    }
    const paragraphs = element.querySelectorAll("p");
    if (paragraphs.length > 0) {
      if (paragraphs.length > 1) {
        for (let i = 1; i < paragraphs.length; i += 1) {
          paragraphs[i].remove();
        }
      }
      const firstParagraph = paragraphs[0];
      firstParagraph.innerHTML = "";
      if (query.trim()) {
        const span = document.createElement("span");
        span.setAttribute("data-lexical-text", "true");
        span.textContent = query;
        firstParagraph.appendChild(span);
      }
    } else {
      element.innerHTML = "";
      const paragraph = document.createElement("p");
      if (query.trim()) {
        const span = document.createElement("span");
        span.setAttribute("data-lexical-text", "true");
        span.textContent = query;
        paragraph.appendChild(span);
      }
      element.appendChild(paragraph);
    }
  }
  function updateGenericContenteditable(element, query) {
    safeFocus(element);
    const paragraphs = element.querySelectorAll("p");
    if (paragraphs.length > 0) {
      if (paragraphs.length > 1) {
        for (let index = 1; index < paragraphs.length; index += 1) {
          paragraphs[index].remove();
        }
      }
      const firstParagraph = paragraphs[0];
      firstParagraph.classList.remove("is-empty", "is-editor-empty");
      firstParagraph.textContent = query;
    } else {
      element.innerHTML = "";
      const paragraph = document.createElement("p");
      paragraph.textContent = query;
      element.appendChild(paragraph);
    }
    dispatchContenteditableEvents(element, query);
  }
  function dispatchLexicalEvents(element, query) {
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: query
      })
    );
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: query
      })
    );
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  }
  function dispatchContenteditableEvents(element, query) {
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: query
      })
    );
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: query
      })
    );
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    element.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: query }));
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: query }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  }

  // src/iframe/inject/executor.js
  var FILES_MIN_SUBMIT_WAIT_MS = 2e4;
  var FILES_MIN_FIND_TIMEOUT_MS = 25e3;
  var SUBMIT_VERIFY_WAIT_MS = 900;
  var SUBMIT_VERIFY_RETRY_COUNT = 4;
  function applyFilesAwareTimeouts(step) {
    if (step.action !== "smartSubmit" && step.action !== "click") {
      return step;
    }
    const next = { ...step };
    if (next.action === "smartSubmit") {
      next.submitWaitMs = Math.max(
        Number.isFinite(next.submitWaitMs) ? next.submitWaitMs : 0,
        FILES_MIN_SUBMIT_WAIT_MS
      );
    } else if (next.action === "click") {
      next.timeout = Math.max(
        Number.isFinite(next.timeout) ? next.timeout : 0,
        FILES_MIN_FIND_TIMEOUT_MS
      );
    }
    return next;
  }
  async function executeSiteHandler(query, handlerConfig, options = {}) {
    if (!handlerConfig || !Array.isArray(handlerConfig.steps) || handlerConfig.steps.length === 0) {
      throw new Error("无效的站点处理器配置");
    }
    const { hasFiles = false } = options;
    const context = { submitted: false };
    for (const rawStep of handlerConfig.steps) {
      const step = hasFiles ? applyFilesAwareTimeouts(rawStep) : rawStep;
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
    await verifySubmittedOrRetry(query, handlerConfig, context, { hasFiles });
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
        context.submitted = true;
        return;
      case "smartSubmit":
        if (await executeSmartSubmit(step, query)) context.submitted = true;
        return;
      default:
        throw new Error(`不支持的 action: ${step.action}`);
    }
  }
  async function verifySubmittedOrRetry(query, handlerConfig, context, options = {}) {
    const text = String(query || "").trim();
    if (!text) {
      return;
    }
    const steps = Array.isArray(handlerConfig.steps) ? handlerConfig.steps : [];
    const submitSteps = steps.filter((step) => SUBMIT_ACTIONS.has(step.action));
    const inputStep = findSubmitVerificationInputStep(steps);
    const rewriteStep = steps.find((step) => step.action === "setValue" && getSelectors(step).length > 0);
    if (submitSteps.length === 0 || !inputStep) {
      return;
    }
    const verifyWaitMs = Number.isFinite(handlerConfig.submitVerifyWaitMs) ? handlerConfig.submitVerifyWaitMs : SUBMIT_VERIFY_WAIT_MS;
    const maxRetries = Number.isFinite(handlerConfig.submitVerifyRetries) ? handlerConfig.submitVerifyRetries : SUBMIT_VERIFY_RETRY_COUNT;
    await delay(verifyWaitMs);
    for (let retryIndex = 0; retryIndex <= maxRetries; retryIndex += 1) {
      const current = await readCurrentValue(inputStep);
      if (!current.includes(text)) {
        return;
      }
      if (retryIndex >= maxRetries) {
        throw new Error("内容仍停留在输入框，发送按钮可能未生效");
      }
      if (rewriteStep) {
        await executeStep(rewriteStep, query, context);
        if (rewriteStep.waitAfter) {
          await delay(rewriteStep.waitAfter);
        }
        await delay(120);
      } else {
        await refireInputEvents(inputStep, text);
      }
      context.submitted = false;
      for (const rawStep of submitSteps) {
        const step = options.hasFiles ? applyFilesAwareTimeouts(rawStep) : rawStep;
        try {
          await executeStep(step, query, context);
        } catch (error) {
          if (step.optional) continue;
          throw error;
        }
        if (step.waitAfter) {
          await delay(step.waitAfter);
        }
        await delay(Math.min(verifyWaitMs, 450));
        const afterSubmitValue = await readCurrentValue(inputStep);
        if (!afterSubmitValue.includes(text)) {
          return;
        }
      }
      await delay(verifyWaitMs);
    }
  }
  async function refireInputEvents(step, text) {
    try {
      const element = await findElement(step);
      safeFocus(element);
      if (isTextControl(element)) {
        dispatchEventList(element, ["input", "change"]);
        return;
      }
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text
        })
      );
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    } catch (_error) {
    }
  }
  function findSubmitVerificationInputStep(steps) {
    const inputActions = /* @__PURE__ */ new Set(["setValue", "smartSubmit", "sendKeys", "focus"]);
    return steps.find((step) => step.action === "setValue" && getSelectors(step).length > 0) || steps.find((step) => inputActions.has(step.action) && getSelectors(step).length > 0) || null;
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
    const maxAttempts = step.maxAttempts || 12;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const element = await findElement(step);
      safeFocus(element);
      let inputType = step.inputType === "auto" ? detectInputType(element) : step.inputType || detectInputType(element);
      if (inputType === "text" && !isTextControl(element)) {
        inputType = "contenteditable";
        try {
          if (element.getAttribute("contenteditable") !== "true") {
            element.setAttribute("contenteditable", "true");
          }
        } catch (_error) {
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
    const filtered = element && element.isContentEditable ? events.filter((name) => name !== "input" && name !== "beforeinput") : events;
    dispatchEventList(element, filtered);
  }
  async function executeClick(step) {
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
    const element = step.selector || step.selectors ? await findElement(step) : document.activeElement;
    if (!element) throw new Error("没有可发送按键的目标元素");
    const keys = Array.isArray(step.keys) ? step.keys : [];
    for (const key of keys) {
      dispatchKeyboardEvent(element, "keydown", key);
      dispatchKeyboardEvent(element, "keypress", key);
      dispatchKeyboardEvent(element, "keyup", key);
    }
  }
  async function executeSmartSubmit(step, query) {
    const anchor = step.selector || step.selectors ? await findElement(step) : document.activeElement;
    if (!anchor) throw new Error("没有可用于提交的输入元素");
    safeFocus(anchor);
    const submitSelectors = Array.isArray(step.submitSelectors) && step.submitSelectors.length > 0 ? step.submitSelectors : [
      "button[type='submit']",
      "button[aria-label*='发送']",
      "button[aria-label*='Send']",
      "button[title*='发送']",
      "button[title*='Send']",
      "[role='button'][aria-label*='发送']",
      "[role='button'][aria-label*='Send']"
    ];
    const waitMs = Number.isFinite(step.submitWaitMs) ? step.submitWaitMs : 1200;
    const deadline = Date.now() + waitMs;
    while (Date.now() <= deadline) {
      const candidate = findBestSubmitButton(anchor, submitSelectors);
      if (candidate) {
        activateSubmitButton(candidate);
        if (step.enterFallbackAfterClick !== false && await shouldTryKeyboardFallbackAfterClick(step, query, anchor)) {
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
    dispatchSubmitKeys(anchor);
    return false;
  }
  function dispatchSubmitKeys(anchor) {
    const targets = [anchor, document.activeElement, document.body, document].filter(Boolean);
    const seen = /* @__PURE__ */ new Set();
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
      clientY: rect.top + rect.height / 2
    };
    const EventCtor = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
    element.dispatchEvent(new EventCtor(type, eventInit));
  }
  async function shouldTryKeyboardFallbackAfterClick(step, query, anchor) {
    const text = String(query || "").trim();
    if (!text) return false;
    const waitMs = Number.isFinite(step.postClickVerifyMs) ? step.postClickVerifyMs : 900;
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
    const timeoutMs = step.timeout || 6e3;
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
    const nearbyRoot = typeof anchor.closest === "function" ? anchor.closest("form, footer, [role='form'], [class*='input'], [class*='composer'], [class*='footer']") : null;
    if (nearbyRoot) searchRoots.push(nearbyRoot);
    if (anchor.parentElement) searchRoots.push(anchor.parentElement);
    searchRoots.push(document);
    const seen = /* @__PURE__ */ new Set();
    const candidates = [];
    searchRoots.forEach((root) => {
      selectors.forEach((selector) => {
        root.querySelectorAll(selector).forEach((element) => {
          if (seen.has(element) || !isUsableSubmitButton(element)) return;
          if (looksLikeNonSubmitControl(element)) return;
          seen.add(element);
          candidates.push(element);
        });
      });
    });
    if (candidates.length === 0) {
      return findHeuristicSubmitButton(anchor);
    }
    const anchorRect = anchor.getBoundingClientRect();
    const sendLike = candidates.filter(looksLikeSubmitControl);
    const pool = sendLike.length > 0 ? sendLike : candidates;
    pool.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftScore = Math.abs(leftRect.right - anchorRect.right) + Math.abs(leftRect.bottom - anchorRect.bottom);
      const rightScore = Math.abs(rightRect.right - anchorRect.right) + Math.abs(rightRect.bottom - anchorRect.bottom);
      return leftScore - rightScore;
    });
    return pool[0];
  }
  function findHeuristicSubmitButton(anchor) {
    const root = typeof anchor.closest === "function" ? anchor.closest("form, footer, [role='form'], [class*='input'], [class*='composer'], [class*='footer'], [class*='sender'], [class*='chat']") : null;
    const searchRoot = root || document;
    const anchorRect = anchor.getBoundingClientRect();
    const candidates = [];
    searchRoot.querySelectorAll("button, [role='button'], [tabindex='0']").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (element === anchor || element.contains(anchor) || !isUsableSubmitButton(element)) return;
      if (element.querySelector("textarea, input, [contenteditable='true']")) return;
      if (looksLikeNonSubmitControl(element)) return;
      const rect = element.getBoundingClientRect();
      const isNearComposer = rect.top >= anchorRect.top - 80 && rect.bottom <= anchorRect.bottom + 100 && rect.left >= anchorRect.left - 40;
      if (!isNearComposer) return;
      candidates.push(element);
    });
    if (candidates.length === 0) return null;
    const sendLike = candidates.filter(looksLikeSubmitControl);
    const pool = sendLike.length > 0 ? sendLike : candidates;
    pool.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftScore = Math.abs(leftRect.right - anchorRect.right) + Math.abs(leftRect.bottom - anchorRect.bottom);
      const rightScore = Math.abs(rightRect.right - anchorRect.right) + Math.abs(rightRect.bottom - anchorRect.bottom);
      return leftScore - rightScore;
    });
    return pool[0];
  }
  function looksLikeSubmitControl(element) {
    const label = getControlSignature(element);
    return /发送|提交|send|submit|arrow[-_ ]?up|paper[-_ ]?plane|send-button|btn-send|icon-send/i.test(label);
  }
  function looksLikeNonSubmitControl(element) {
    const label = getControlSignature(element);
    return /附件|上传|添加|更多|语音|麦克风|停止|取消|模型|工具|attach|upload|add|plus|more|voice|mic|microphone|stop|cancel|model|tool|file|image|photo|camera/i.test(label);
  }
  function getControlSignature(element) {
    const attrs = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test-id"),
      element.getAttribute("class"),
      element.textContent
    ];
    element.querySelectorAll("svg, path, use, mat-icon, i").forEach((child) => {
      attrs.push(
        child.getAttribute("aria-label"),
        child.getAttribute("data-icon"),
        child.getAttribute("class"),
        child.getAttribute("d"),
        child.textContent
      );
    });
    return attrs.filter(Boolean).join(" ");
  }
  function isUsableSubmitButton(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" || element.getAttribute("data-disabled") === "true") {
      return false;
    }
    if (hasDisabledState(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && style.pointerEvents !== "none";
  }
  function hasDisabledState(element) {
    const disabledClassPattern = /(^|\s|[-_])(disabled|is-disabled|btn-disabled|button-disabled|mat-mdc-button-disabled|send-button-container--disabled)(\s|$|[-_])/i;
    let current = element;
    while (current instanceof HTMLElement) {
      const className = typeof current.className === "string" ? current.className : "";
      if (disabledClassPattern.test(className) || current.getAttribute("aria-disabled") === "true" || current.getAttribute("data-disabled") === "true") {
        return true;
      }
      if (current.tagName === "FORM" || current.getAttribute("role") === "form") {
        return false;
      }
      current = current.parentElement;
    }
    return false;
  }

  // src/iframe/inject/extractor.js
  function handleExtractRequest(message) {
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
        url: window.location.href
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
        content: [".markdown.prose", ".prose", "[class*='markdown']", "article"]
      },
      "chat.openai.com": {
        containers: ["[data-message-author-role='assistant']"],
        content: [".markdown.prose", ".prose"]
      },
      "chat.deepseek.com": {
        containers: ["[class*='ds-message-bubble'][class*='assistant']", "[class*='message'][class*='assistant']"],
        content: ["[class*='ds-markdown']", "[class*='markdown']", "[class*='chat-message-content']"]
      },
      "kimi.moonshot.cn": {
        containers: ["[class*='segment-item']", "[class*='message'][class*='ai']", "[class*='bubble'][class*='assistant']"],
        content: ["[class*='markdown-content']", "[class*='content']", "[class*='text']"]
      },
      "kimi.com": {
        containers: ["[class*='segment-item']", "[class*='message'][class*='ai']", "[class*='bubble'][class*='assistant']", "[class*='chat-content-item']"],
        content: ["[class*='markdown-content']", "[class*='content']", "[class*='text']", "[class*='markdown']"]
      },
      "tongyi.aliyun.com": {
        containers: ["[class*='answer-message']", "[class*='agent-chat__answer']", "[class*='chat-bubble']"],
        content: ["[class*='markdown']", "[class*='answer-text']", "[class*='content']"]
      },
      "doubao.com": {
        containers: ["[data-author-type='2']", "[class*='chat-response']", "[class*='assistant-message']"],
        content: ["[class*='markdown']", "[class*='message-text']", "[class*='content']"]
      },
      "gemini.google.com": {
        containers: ["model-response", "message-content[class*='model']", "[class*='response-container']"],
        content: [".markdown", "[class*='response-content']", "[class*='model-response-text']"]
      },
      "chatglm.cn": {
        containers: ["[class*='chat-msg--ai']", "[class*='assistant-message']"],
        content: ["[class*='content']", "[class*='markdown']", "[class*='text']"]
      },
      "yuanbao.tencent.com": {
        containers: ["[class*='agent-chat__message--ai']", "[class*='ai-message']"],
        content: ["[class*='hyper-text']", "[class*='markdown']", "[class*='content']"]
      }
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
        case "h1":
          return `

# ${children().trim()}

`;
        case "h2":
          return `

## ${children().trim()}

`;
        case "h3":
          return `

### ${children().trim()}

`;
        case "h4":
          return `

#### ${children().trim()}

`;
        case "h5":
          return `

##### ${children().trim()}

`;
        case "h6":
          return `

###### ${children().trim()}

`;
        case "p": {
          const inner = children().trim();
          return inner ? `

${inner}

` : "";
        }
        case "br":
          return "  \n";
        case "hr":
          return "\n\n---\n\n";
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
          return `

\`\`\`${lang}
${content.trim()}
\`\`\`

`;
        }
        case "blockquote": {
          const inner = children().trim().split("\n").map((line) => `> ${line}`).join("\n");
          return `

${inner}

`;
        }
        case "ul": {
          const liEls = Array.from(node.querySelectorAll("li")).filter(
            (el) => el.closest("ul") === node || el.closest("ol") === node
          );
          const items = liEls.map((li) => {
            const text = convertNode(li).trim();
            return `- ${text.replace(/\n/g, "\n  ")}`;
          }).join("\n");
          return items ? `

${items}

` : "";
        }
        case "ol": {
          const liEls = Array.from(node.querySelectorAll("li")).filter(
            (el) => el.closest("ul") === node || el.closest("ol") === node
          );
          const items = liEls.map((li, idx) => {
            const text = convertNode(li).trim();
            return `${idx + 1}. ${text.replace(/\n/g, "\n   ")}`;
          }).join("\n");
          return items ? `

${items}

` : "";
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
          return inner ? `

${inner}

` : "";
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
        case "table":
          return convertTable(node);
        default:
          return children();
      }
    }
    function convertTable(tableEl) {
      const allRows = Array.from(tableEl.querySelectorAll("tr"));
      if (!allRows.length) return "";
      const data = allRows.map(
        (row) => Array.from(row.querySelectorAll("th, td")).map(
          (cell) => (cell.innerText || cell.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n/g, " ")
        )
      ).filter((row) => row.length > 0);
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
        ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)
      ];
      return `

${lines.join("\n")}

`;
    }
    return convertNode(element).replace(/\n{3,}/g, "\n\n").trim();
  }
  function extractBySiteSelectors(host) {
    const config = getSiteContentConfig(host);
    if (!config) return "";
    const parts = [];
    for (const containerSel of config.containers || []) {
      const containers = Array.from(document.querySelectorAll(containerSel));
      if (containers.length === 0) continue;
      for (const container of containers) {
        let text = "";
        for (const contentSel of config.content || []) {
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
    if (parts.length > 0) return parts.join("\n\n---\n\n").slice(0, 1e4);
    for (const contentSel of config.content || []) {
      const nodes = Array.from(document.querySelectorAll(contentSel));
      if (nodes.length > 0) {
        const texts = nodes.map((n) => domToMarkdown(n)).filter(Boolean);
        if (texts.length > 0) return texts.join("\n\n---\n\n").slice(0, 1e4);
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
      "main"
    ];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).map((node) => domToMarkdown(node)).filter(Boolean);
      if (nodes.length > 0) return nodes.join("\n\n---\n\n").slice(0, 1e4);
    }
    return (document.body?.innerText || "").trim().slice(0, 8e3);
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
        getAiText: makeAiExtractor([".markdown.prose", ".prose", "[class*='markdown']"])
      },
      "chat.openai.com": {
        allMessages: "[data-message-author-role='user'], [data-message-author-role='assistant']",
        getRole: (el) => el.getAttribute("data-message-author-role"),
        getUserText: (el) => {
          const inner = el.querySelector(".whitespace-pre-wrap") || el.querySelector("p");
          return ((inner || el).innerText || "").trim();
        },
        getAiText: makeAiExtractor([".markdown.prose", ".prose"])
      },
      "doubao.com": {
        allMessages: "[data-author-type='1'], [data-author-type='2']",
        getRole: (el) => el.getAttribute("data-author-type") === "1" ? "user" : "assistant",
        getUserText: (el) => (el.innerText || el.textContent || "").trim(),
        getAiText: makeAiExtractor(["[class*='markdown']", "[class*='message-text']", "[class*='content']"])
      },
      "chat.deepseek.com": {
        userSelector: ["[class*='human-message']", "[class*='ds-message-bubble--user']", "[class*='user-message']"],
        assistantSelector: ["[class*='ds-message-bubble--assistant']", "[class*='ds-message-bubble'][class*='assistant']"],
        getAiText: makeAiExtractor(["[class*='ds-markdown']", "[class*='markdown']"])
      },
      "kimi.moonshot.cn": {
        userSelector: ["[class*='chat-message--user']", "[class*='segment'][class*='user']", "[class*='human']"],
        assistantSelector: ["[class*='chat-message--ai']", "[class*='segment'][class*='ai']", "[class*='bubble'][class*='assistant']"],
        getAiText: makeAiExtractor(["[class*='markdown-content']", "[class*='content']"])
      },
      "kimi.com": {
        userSelector: ["[class*='chat-message--user']", "[class*='segment'][class*='user']", "[class*='human']", "[class*='user-message']"],
        assistantSelector: ["[class*='chat-message--ai']", "[class*='segment'][class*='ai']", "[class*='bubble'][class*='assistant']", "[class*='chat-content-item']"],
        getAiText: makeAiExtractor(["[class*='markdown-content']", "[class*='content']", "[class*='markdown']"])
      },
      "gemini.google.com": {
        userSelector: ["user-query", ".user-query-bubble-with-background"],
        assistantSelector: ["model-response", "message-content"],
        getAiText: makeAiExtractor([".markdown", "[class*='response-content']", "[class*='model-response-text']"])
      },
      "tongyi.aliyun.com": {
        userSelector: ["[class*='chat-bubble-user']", "[class*='question-container']", "[class*='user-message']"],
        assistantSelector: ["[class*='answer-message']", "[class*='agent-chat__answer']"],
        getAiText: makeAiExtractor(["[class*='markdown']", "[class*='answer-text']"])
      },
      "chatglm.cn": {
        userSelector: ["[class*='chat-msg--human']"],
        assistantSelector: ["[class*='chat-msg--ai']"],
        getAiText: makeAiExtractor(["[class*='content']", "[class*='markdown']"])
      },
      "yuanbao.tencent.com": {
        userSelector: ["[class*='agent-chat__message--human']", "[class*='question']"],
        assistantSelector: ["[class*='agent-chat__message--ai']"],
        getAiText: makeAiExtractor(["[class*='hyper-text']", "[class*='markdown']", "[class*='content']"])
      }
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
          const text = role === "user" ? config.getUserText ? config.getUserText(el) : (el.innerText || "").trim() : config.getAiText ? config.getAiText(el) : domToMarkdown(el);
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
          const text = role === "user" ? (el.innerText || el.textContent || "").trim() : config.getAiText ? config.getAiText(el) : domToMarkdown(el);
          if (text && text !== "暂未提取到内容") turns.push({ role, text });
        }
      }
    } catch (_err) {
      return null;
    }
    return turns.length > 0 ? turns : null;
  }

  // src/iframe/inject/sidebar-fix.js
  async function initEmbedSidebarFix(resolveSite2) {
    if (window.parent === window) return;
    if (/(\.|^)deepseek\.com$/i.test(window.location.hostname)) {
      installEarlyDeepSeekSidebarCss();
      startDeepSeekSidebarSuppressor();
    }
    let site;
    try {
      site = await resolveSite2(null);
    } catch (_error) {
      return;
    }
    if (!site) return;
    const STYLE_ID = "ai-compare-embed-sidebar-fix";
    const COMMON_SIDEBAR_CSS = [
      "aside, [role='navigation'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
      "[class*='sidebar'], [class*='side-bar'], [class*='sider'], [class*='left-panel'], [class*='left_panel'], [class*='nav-panel'], [class*='conversation-list'], [class*='chat-list'], [class*='session-list'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
      "main, [role='main'], [class*='main-content'], [class*='chat-main'], [class*='conversation'] { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; margin-left: 0 !important; padding-left: 0 !important; }"
    ];
    const DOMESTIC_CHAT_CSS = [
      ...COMMON_SIDEBAR_CSS,
      "nav:not(:has(textarea)):not(:has([contenteditable='true'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
      "[class*='layout'], [class*='container'], [class*='wrapper'] { margin-left: 0 !important; padding-left: 0 !important; }"
    ];
    const SITE_STYLE_MAP = {
      chatgpt: [
        "/* AI批量搜索：隐藏 ChatGPT 侧边栏，消除左侧留白 */",
        "nav { display: none !important; }",
        "div:has(> nav) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
        "div:has(nav):not(:has(main)):not(:has([role='main'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
        "[class*='z-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; }",
        "[class*='sidebar-header'] { display: none !important; }",
        "[data-testid*='sidebar'], [data-testid*='nav-'] { display: none !important; width: 0 !important; min-width: 0 !important; }",
        "main { flex: 1 !important; width: 100% !important; padding-left: 0 !important; margin-left: 0 !important; min-width: 0 !important; }",
        "main [class*='max-w']:not([class*='max-w-none']) { max-width: 100% !important; }"
      ],
      deepseek: [
        "/* AI批量搜索：隐藏 DeepSeek 侧边栏，消除左侧留白 */",
        "[class*='sidebar'], [class*='side-bar'], [class*='left-panel'], [class*='left_panel'], [class*='nav-panel'], [class*='chat-list'], [class*='conversation-list'], [class*='history'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; transform: translateX(-120%) !important; pointer-events: none !important; }",
        "aside, nav, [role='navigation'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; transform: translateX(-120%) !important; pointer-events: none !important; }",
        "div:has(> aside), div:has(> nav), div:has([class*='sidebar']):not(:has(textarea)):not(:has([contenteditable='true'])) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }",
        "/* structural fallback: hide sidebar by DOM position regardless of class names */",
        "#root > div > div:first-child:not(:has(textarea)):not(:has([contenteditable='true'])):not(:last-child) { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; transform: translateX(-120%) !important; pointer-events: none !important; }",
        "main, [role='main'], [class*='chat-main'], [class*='main-content'], [class*='conversation'] { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; padding-left: 0 !important; margin-left: 0 !important; transform: none !important; }"
      ],
      qwen: [
        "/* AI批量搜索：隐藏通义千问 / Qwen 侧边栏 */",
        ...DOMESTIC_CHAT_CSS,
        ".t-layout__sider, .t-chat__sider, .t-chat-sider, [class*='ant-layout-sider'], [class*='conversation-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }"
      ],
      yuanbao: [
        "/* AI批量搜索：隐藏腾讯元宝侧边栏 / 会话列表 */",
        ...DOMESTIC_CHAT_CSS,
        "[class*='conversation-sidebar'], [class*='history-sidebar'], [class*='chat-history'], [class*='left-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }"
      ],
      kimi: [
        "/* AI批量搜索：隐藏 Kimi 侧边栏 / 会话列表 */",
        ...DOMESTIC_CHAT_CSS,
        "[class*='conversation-sidebar'], [class*='chat-history'], [class*='left-sidebar'], [class*='nav-sidebar'] { display: none !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; overflow: hidden !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }"
      ],
      claude: [
        "/* AI批量搜索：隐藏 Claude 侧边栏 */",
        ...COMMON_SIDEBAR_CSS
      ],
      grok: [
        "/* AI批量搜索：隐藏 Grok 侧边栏 */",
        ...COMMON_SIDEBAR_CSS
      ]
    };
    const cssLines = SITE_STYLE_MAP[site.id];
    if (!cssLines) return;
    function injectStyle() {
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = cssLines.join("\n");
    }
    let observer = null;
    function startObserver() {
      if (observer) return;
      observer = new MutationObserver(() => {
        if (!document.getElementById(STYLE_ID)) injectStyle();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    function startSiteSuppressors() {
      if (site.id === "deepseek") {
        startDeepSeekSidebarSuppressor();
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        injectStyle();
        startObserver();
        startSiteSuppressors();
      });
    } else {
      injectStyle();
      startObserver();
      startSiteSuppressors();
    }
    setTimeout(injectStyle, 400);
    setTimeout(injectStyle, 1500);
    setTimeout(injectStyle, 4e3);
  }
  function installEarlyDeepSeekSidebarCss() {
    const STYLE_ID = "ai-compare-deepseek-early-sidebar-fix";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "/* Qshot: prevent DeepSeek mobile drawer from flashing in iframe */",
      "aside, nav, [role='navigation'] { display: none !important; visibility: hidden !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; opacity: 0 !important; overflow: hidden !important; pointer-events: none !important; transform: translateX(-120%) !important; }",
      "[class*='sidebar'], [class*='side-bar'], [class*='sider'], [class*='drawer'], [class*='chat-list'], [class*='conversation-list'], [class*='history'] { display: none !important; visibility: hidden !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; opacity: 0 !important; overflow: hidden !important; pointer-events: none !important; transform: translateX(-120%) !important; }",
      "[class*='mask'], [class*='overlay'], [class*='backdrop'] { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }",
      "main, [role='main'], [class*='chat-main'], [class*='main-content'] { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; padding-left: 0 !important; transform: none !important; }",
      "/* structural fallback: hide first non-input sibling in root layout regardless of class names */",
      "#root > div > div:first-child:not(:has(textarea)):not(:has([contenteditable='true'])):not(:last-child) { display: none !important; visibility: hidden !important; width: 0 !important; min-width: 0 !important; max-width: 0 !important; opacity: 0 !important; overflow: hidden !important; pointer-events: none !important; transform: translateX(-120%) !important; flex: none !important; flex-basis: 0 !important; padding: 0 !important; margin: 0 !important; }"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }
  function startDeepSeekSidebarSuppressor() {
    if (window.__QSHOT_DEEPSEEK_SIDEBAR_SUPPRESSOR__) return;
    window.__QSHOT_DEEPSEEK_SIDEBAR_SUPPRESSOR__ = true;
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        suppressDeepSeekSidebar();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
      childList: true,
      subtree: true
    });
    [0, 50, 120, 250, 500, 1e3, 2e3, 4e3].forEach((delayMs) => {
      setTimeout(schedule, delayMs);
    });
  }
  function suppressDeepSeekSidebar() {
    const body = document.body;
    if (!body) return;
    const selector = [
      "aside",
      "nav",
      "[role='navigation']",
      "[class*='sidebar']",
      "[class*='side-bar']",
      "[class*='sider']",
      "[class*='drawer']",
      "[class*='mask']",
      "[class*='modal']",
      "[class*='overlay']",
      "[class*='history']",
      "[class*='conversation']",
      "[class*='chat-list']"
    ].join(",");
    document.querySelectorAll(selector).forEach((element) => {
      if (isDeepSeekSidebarLike(element) || isDeepSeekBackdropLike(element)) {
        forceHideElement(element);
      }
    });
    Array.from(body.children).forEach((element) => {
      if (isDeepSeekSidebarLike(element) || isDeepSeekBackdropLike(element)) {
        forceHideElement(element);
      }
    });
    const root = document.getElementById("root");
    if (root) {
      scanDeepSeekTree(root, 0);
    }
  }
  function scanDeepSeekTree(parent, depth) {
    if (depth > 4) return;
    for (const child of Array.from(parent.children)) {
      if (child.dataset.qshotDeepseekHidden === "true") continue;
      if (isDeepSeekSidebarLike(child) || isDeepSeekBackdropLike(child)) {
        forceHideElement(child);
      } else {
        scanDeepSeekTree(child, depth + 1);
      }
    }
  }
  function isDeepSeekSidebarLike(element) {
    if (!(element instanceof HTMLElement) || element.dataset.qshotKeep === "true") {
      return false;
    }
    if (element.querySelector("textarea, [contenteditable='true']")) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const className = typeof element.className === "string" ? element.className : "";
    const text = String(element.innerText || element.textContent || "").slice(0, 600);
    const looksLikeDeepSeekMenu = /deepseek|新对话|开启新对话|今天|昨天|历史|会话|chat/i.test(text) || /sidebar|side-bar|sider|drawer|history|conversation|chat-list/i.test(className);
    return looksLikeDeepSeekMenu && rect.left <= Math.max(24, viewportWidth * 0.08) && rect.top <= 96 && rect.width >= 180 && rect.width <= Math.max(420, viewportWidth * 0.72) && rect.height >= Math.max(360, viewportHeight * 0.65);
  }
  function isDeepSeekBackdropLike(element) {
    if (!(element instanceof HTMLElement) || element.querySelector("textarea, [contenteditable='true']")) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    if (rect.width < viewportWidth * 0.45 || rect.height < viewportHeight * 0.65) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const background = style.backgroundColor || "";
    const hasDimBackground = /rgba?\([^)]*,\s*(0\.[2-9]|[1-9])\)/.test(background);
    const isOverlayPosition = style.position === "fixed" || style.position === "absolute" || style.position === "sticky";
    return isOverlayPosition && hasDimBackground;
  }
  function forceHideElement(element) {
    element.dataset.qshotDeepseekHidden = "true";
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("opacity", "0", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("width", "0", "important");
    element.style.setProperty("min-width", "0", "important");
    element.style.setProperty("max-width", "0", "important");
    element.style.setProperty("transform", "translateX(-120%)", "important");
  }

  // src/shared/storage-keys.js
  var UI_PREFS_STORAGE_KEY = "uiPrefs";

  // src/shared/diagnostics.js
  var DIAGNOSTIC_LOG_PREF_KEY = "diagnosticLogsEnabled";
  var LOG_PREFIX = "[Qshot diagnostics]";
  var diagnosticLogsEnabled = false;
  var hasLoadedPreference = false;
  function getChromeStorage() {
    try {
      return chrome?.storage?.local || null;
    } catch (_error) {
      return null;
    }
  }
  async function refreshDiagnosticLogPreference() {
    const storage = getChromeStorage();
    if (!storage) {
      diagnosticLogsEnabled = false;
      hasLoadedPreference = true;
      return diagnosticLogsEnabled;
    }
    try {
      const stored = await storage.get([UI_PREFS_STORAGE_KEY]);
      diagnosticLogsEnabled = stored[UI_PREFS_STORAGE_KEY]?.[DIAGNOSTIC_LOG_PREF_KEY] === true;
    } catch (_error) {
      diagnosticLogsEnabled = false;
    }
    hasLoadedPreference = true;
    return diagnosticLogsEnabled;
  }
  function isDiagnosticLoggingEnabled() {
    if (!hasLoadedPreference) {
      refreshDiagnosticLogPreference();
    }
    return diagnosticLogsEnabled;
  }
  function diagnosticLog(scope, eventName, details = void 0) {
    if (!isDiagnosticLoggingEnabled()) {
      return;
    }
    const label = `${LOG_PREFIX} ${scope}:${eventName}`;
    if (details === void 0) {
      console.log(label);
      return;
    }
    console.log(label, sanitizeDiagnosticDetails(details));
  }
  function sanitizeDiagnosticDetails(value) {
    if (!value || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeDiagnosticDetails);
    }
    const output = {};
    Object.entries(value).forEach(([key, rawValue]) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes("query") || normalizedKey.includes("prompt") || normalizedKey.includes("content")) {
        output[key] = describeTextValue(rawValue);
        return;
      }
      if (normalizedKey.includes("url")) {
        output[key] = rawValue ? "[redacted-url]" : rawValue;
        return;
      }
      if (key === "site" && rawValue && typeof rawValue === "object") {
        output[key] = { id: rawValue.id, name: rawValue.name };
        return;
      }
      output[key] = sanitizeDiagnosticDetails(rawValue);
    });
    return output;
  }
  function describeTextValue(value) {
    if (typeof value !== "string") {
      return value == null ? value : "[redacted]";
    }
    return `[redacted length=${value.length}]`;
  }
  try {
    refreshDiagnosticLogPreference();
    chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName !== "local" || !changes[UI_PREFS_STORAGE_KEY]) {
        return;
      }
      const nextPrefs = changes[UI_PREFS_STORAGE_KEY].newValue;
      diagnosticLogsEnabled = nextPrefs?.[DIAGNOSTIC_LOG_PREF_KEY] === true;
      hasLoadedPreference = true;
    });
  } catch (_error) {
    diagnosticLogsEnabled = false;
    hasLoadedPreference = true;
  }

  // src/iframe/inject/file-paste.js
  var MIME_EXT_FALLBACK = {
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
    try {
      if (event.clipboardData !== dt) {
        Object.defineProperty(event, "clipboardData", { value: dt, configurable: true });
      }
    } catch (_error) {
    }
    return { event, dt };
  }
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
  async function findInputElement(selectors, timeoutMs = 4e3) {
    const list = (Array.isArray(selectors) ? selectors : [selectors]).filter(Boolean);
    if (list.length === 0) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      for (const selector of list) {
        try {
          const el = document.querySelector(selector);
          if (el) return el;
        } catch (_error) {
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    return null;
  }
  var DEFAULT_INPUT_SELECTORS = [
    '[contenteditable="true"]',
    "textarea",
    'input[type="text"]'
  ];
  async function deliverFilesToInput(fileEntries, explicitSelectors) {
    if (!Array.isArray(fileEntries) || fileEntries.length === 0) return false;
    const files = fileEntries.map(blobToFile).filter((f) => f instanceof Blob);
    if (files.length === 0) {
      diagnosticLog("inject.paste", "reconstruct-failed", { expected: fileEntries.length });
      return false;
    }
    const selectors = Array.isArray(explicitSelectors) && explicitSelectors.length > 0 ? explicitSelectors : DEFAULT_INPUT_SELECTORS;
    const target = await findInputElement(selectors);
    if (!target) {
      diagnosticLog("inject.paste", "input-not-found", { selectors });
      return false;
    }
    try {
      target.focus();
    } catch (_error) {
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    let dispatched = false;
    try {
      dispatched = dispatchPaste(target, files);
    } catch (error) {
      diagnosticLog("inject.paste", "dispatch-error", { error: error.message });
      dispatched = false;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return dispatched;
  }
  function extractInputSelectorsFromHandler(handlerConfig) {
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

  // src/shared/site-registry.js
  var SITE_HANDLERS_PATH = "config/siteHandlers.json";
  var builtinSites = null;
  var builtinSitesPromise = null;
  var domainIndex = null;
  async function loadBuiltinSites(options = {}) {
    const { fallbackEmpty = false } = options;
    if (builtinSites) return builtinSites;
    if (builtinSitesPromise) return builtinSitesPromise;
    builtinSitesPromise = fetch(chrome.runtime.getURL(SITE_HANDLERS_PATH)).then((response) => {
      if (!response.ok) throw new Error("无法读取站点配置");
      return response.json();
    }).then((payload) => {
      builtinSites = Array.isArray(payload.sites) ? payload.sites : [];
      domainIndex = buildDomainIndex(builtinSites);
      return builtinSites;
    }).catch((error) => {
      if (!fallbackEmpty) throw error;
      builtinSites = [];
      domainIndex = /* @__PURE__ */ new Map();
      return builtinSites;
    }).finally(() => {
      builtinSitesPromise = null;
    });
    return builtinSitesPromise;
  }
  async function findBuiltinSiteForHost(hostname, options = {}) {
    const sites = await loadBuiltinSites(options);
    const normalizedHost = normalizeHost(hostname);
    if (!normalizedHost) return null;
    const index = domainIndex || buildDomainIndex(sites);
    for (const candidate of getHostCandidates(normalizedHost)) {
      const matches = index.get(candidate);
      if (matches?.length) return matches[0];
    }
    return sites.find((site) => siteMatchesHost(site, normalizedHost)) || null;
  }
  function normalizeHost(value) {
    return String(value || "").trim().toLowerCase().replace(/^\*:\/\//, "").replace(/^https?:\/\//, "").replace(/^\*\./, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  }
  function buildDomainIndex(sites) {
    const index = /* @__PURE__ */ new Map();
    (sites || []).forEach((site) => {
      const patterns = Array.isArray(site.matchPatterns) ? site.matchPatterns : [];
      patterns.forEach((pattern) => {
        const host = normalizeHost(pattern);
        if (!host) return;
        const list = index.get(host) || [];
        list.push(site);
        index.set(host, list);
      });
    });
    return index;
  }
  function getHostCandidates(hostname) {
    const parts = hostname.split(".").filter(Boolean);
    const candidates = [];
    for (let index = 0; index < parts.length; index += 1) {
      candidates.push(parts.slice(index).join("."));
    }
    return candidates;
  }
  function siteMatchesHost(site, normalizedHost) {
    const patterns = Array.isArray(site.matchPatterns) ? site.matchPatterns : [];
    return patterns.some((pattern) => {
      const host = normalizeHost(pattern);
      return normalizedHost === host || normalizedHost.endsWith(`.${host}`);
    });
  }

  // src/iframe/inject/main.js
  var requestResults = /* @__PURE__ */ new Map();
  var requestsInProgress = /* @__PURE__ */ new Set();
  var REQUEST_RESULT_TTL_MS = 5 * 60 * 1e3;
  var REQUEST_RESULT_MAX = 80;
  var lastReportedUrl = "";
  async function handleSearchRequest(message) {
    const query = String(message.query || "").trim();
    if (!query) {
      diagnosticLog("inject.search", "empty-query", { site: message.site });
      return { ok: false, siteId: message.site?.id, error: "查询为空" };
    }
    const site = await resolveSite(message.site);
    if (!site || !site.searchHandler) {
      diagnosticLog("inject.search", "site-unmatched", {
        site: message.site,
        hostname: window.location.hostname
      });
      return {
        ok: false,
        siteId: message.site?.id,
        error: `当前页面未匹配到站点配置: ${window.location.hostname}`
      };
    }
    try {
      diagnosticLog("inject.search", "handler-start", {
        site,
        hostname: window.location.hostname,
        query
      });
      await executeSiteHandler(query, site.searchHandler);
      scheduleUrlReports(site);
      diagnosticLog("inject.search", "handler-success", { site });
      return {
        ok: true,
        siteId: site.id,
        message: "已在当前卡片中尝试写入查询并触发发送",
        currentUrl: window.location.href
      };
    } catch (error) {
      diagnosticLog("inject.search", "handler-error", { site, error: error.message });
      return { ok: false, siteId: site.id, error: error.message };
    }
  }
  async function handleFilesPasteRequest(message) {
    const files = Array.isArray(message.files) ? message.files : [];
    if (files.length === 0) {
      return { ok: false, siteId: message.site?.id, error: "无文件可粘贴" };
    }
    const site = await resolveSite(message.site);
    if (!site) {
      return {
        ok: false,
        siteId: message.site?.id,
        error: `当前页面未匹配到站点配置: ${window.location.hostname}`
      };
    }
    try {
      const inputSelectors = extractInputSelectorsFromHandler(site.searchHandler);
      diagnosticLog("inject.paste-files", "start", {
        site,
        fileCount: files.length,
        usedSelectors: inputSelectors
      });
      const delivered = await deliverFilesToInput(files, inputSelectors);
      diagnosticLog("inject.paste-files", "complete", { site, delivered });
      return {
        ok: !!delivered,
        siteId: site.id,
        message: delivered ? `已粘贴 ${files.length} 个文件` : "未能派发到输入框"
      };
    } catch (error) {
      diagnosticLog("inject.paste-files", "error", { site, error: error.message });
      return { ok: false, siteId: site.id, error: error.message };
    }
  }
  async function resolveSite(explicitSite) {
    if (explicitSite && explicitSite.searchHandler) {
      return explicitSite;
    }
    try {
      return await findBuiltinSiteForHost(window.location.hostname, { fallbackEmpty: true });
    } catch (_error) {
      diagnosticLog("inject.registry", "load-failed", { error: _error.message });
      return null;
    }
  }
  function notifyParentFrame(result) {
    if (window.parent === window) return;
    const targetOrigin = EXTENSION_ORIGIN || "*";
    try {
      diagnosticLog("inject.message", "notify-parent", result);
      window.parent.postMessage(
        {
          type: result.type || "QSHOT_RESULT",
          siteId: result.siteId,
          requestId: result.requestId,
          ok: result.ok,
          message: result.message,
          error: result.error,
          currentUrl: result.currentUrl
        },
        targetOrigin
      );
    } catch (_error) {
      diagnosticLog("inject.message", "notify-parent-failed", { error: _error.message });
    }
  }
  async function setupUrlReporting() {
    let site;
    try {
      site = await resolveSite();
    } catch (_error) {
      return;
    }
    if (!site) return;
    reportCurrentUrl(site);
    const originalPushState = history.pushState.bind(history);
    history.pushState = function patchedPushState(...args) {
      const value = originalPushState(...args);
      reportCurrentUrl(site);
      return value;
    };
    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function patchedReplaceState(...args) {
      const value = originalReplaceState(...args);
      reportCurrentUrl(site);
      return value;
    };
    window.addEventListener("popstate", () => reportCurrentUrl(site));
    window.addEventListener("hashchange", () => reportCurrentUrl(site));
    window.setInterval(() => reportCurrentUrl(site), 1500);
  }
  function reportCurrentUrl(site) {
    const currentUrl = window.location.href;
    if (!site || !currentUrl || currentUrl === lastReportedUrl || window.parent === window) {
      return;
    }
    lastReportedUrl = currentUrl;
    const targetOrigin = EXTENSION_ORIGIN || "*";
    try {
      diagnosticLog("inject.url", "report", { site, currentUrl });
      window.parent.postMessage(
        { type: "QSHOT_URL_UPDATE", siteId: site.id, currentUrl },
        targetOrigin
      );
    } catch (_error) {
      diagnosticLog("inject.url", "report-failed", { site, error: _error.message });
    }
  }
  function scheduleUrlReports(site) {
    reportCurrentUrl(site);
    [800, 2e3, 5e3, 1e4].forEach((delayMs) => {
      window.setTimeout(() => reportCurrentUrl(site), delayMs);
    });
  }
  function installRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "SEARCH_SITE_QUERY") return false;
      handleSearchRequest(message).then((result) => sendResponse(result)).catch((error) => {
        sendResponse({
          ok: false,
          siteId: message.site?.id,
          error: error.message
        });
      });
      return true;
    });
  }
  function installWindowMessageListener() {
    window.addEventListener("message", (event) => {
      if (EXTENSION_ORIGIN) {
        if (event.origin !== EXTENSION_ORIGIN) return;
        if (event.source !== window.parent) return;
      }
      if (!event.data) return;
      if (event.data.type === "QSHOT_EXTRACT") {
        handleExtractRequest(event.data);
        return;
      }
      if (event.data.type === "QSHOT_PASTE_FILES") {
        const requestId2 = event.data.requestId;
        diagnosticLog("inject.message", "paste-files-received", {
          site: event.data.site,
          requestId: requestId2,
          fileCount: Array.isArray(event.data.files) ? event.data.files.length : 0
        });
        handleFilesPasteRequest(event.data).then((result) => {
          notifyParentFrame({ ...result, requestId: requestId2, type: "QSHOT_PASTE_RESULT" });
        }).catch((error) => {
          notifyParentFrame({
            ok: false,
            siteId: event.data.site?.id,
            requestId: requestId2,
            type: "QSHOT_PASTE_RESULT",
            error: error.message
          });
        });
        return;
      }
      if (event.data.type !== "QSHOT_SEARCH") return;
      const requestId = event.data.requestId;
      diagnosticLog("inject.message", "search-received", {
        site: event.data.site,
        requestId,
        query: event.data.query
      });
      const cachedResult = requestId ? getCachedRequestResult(requestId) : null;
      if (cachedResult) {
        diagnosticLog("inject.message", "return-cached-result", { requestId, site: event.data.site });
        notifyParentFrame(cachedResult);
        return;
      }
      if (requestId && requestsInProgress.has(requestId)) {
        diagnosticLog("inject.message", "duplicate-in-progress", { requestId, site: event.data.site });
        return;
      }
      if (requestId) requestsInProgress.add(requestId);
      handleSearchRequest(event.data).then((result) => {
        const finalResult = { ...result, requestId };
        if (requestId) {
          storeRequestResult(requestId, finalResult);
          requestsInProgress.delete(requestId);
        }
        notifyParentFrame(finalResult);
      }).catch((error) => {
        const finalResult = {
          ok: false,
          siteId: event.data.site?.id,
          requestId,
          error: error.message
        };
        if (requestId) {
          storeRequestResult(requestId, finalResult);
          requestsInProgress.delete(requestId);
        }
        notifyParentFrame(finalResult);
      });
    });
  }
  function getCachedRequestResult(requestId) {
    pruneRequestResults();
    return requestResults.get(requestId)?.result || null;
  }
  function storeRequestResult(requestId, result) {
    requestResults.set(requestId, {
      result,
      storedAt: Date.now()
    });
    pruneRequestResults();
  }
  function pruneRequestResults() {
    const now = Date.now();
    for (const [requestId, entry] of requestResults) {
      if (!entry || now - entry.storedAt > REQUEST_RESULT_TTL_MS) {
        requestResults.delete(requestId);
      }
    }
    while (requestResults.size > REQUEST_RESULT_MAX) {
      const oldestKey = requestResults.keys().next().value;
      if (!oldestKey) break;
      requestResults.delete(oldestKey);
    }
  }
  function initInjectScript() {
    const isGrokFrame = window.parent !== window && /(^|\.)grok\.com$/i.test(window.location.hostname);
    if (!isGrokFrame) {
      setupUrlReporting();
    }
    installRuntimeMessageListener();
    installWindowMessageListener();
    if (!isGrokFrame) {
      initEmbedSidebarFix(resolveSite);
    }
  }

  // src/iframe/inject.js
  initInjectScript();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL2lmcmFtZS9pbmplY3QvY29uc3RhbnRzLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaW5qZWN0L2RvbS11dGlscy5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2luamVjdC9lZGl0b3JzLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaW5qZWN0L2V4ZWN1dG9yLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaW5qZWN0L2V4dHJhY3Rvci5qcyIsICIuLi8uLi9zcmMvaWZyYW1lL2luamVjdC9zaWRlYmFyLWZpeC5qcyIsICIuLi8uLi9zcmMvc2hhcmVkL3N0b3JhZ2Uta2V5cy5qcyIsICIuLi8uLi9zcmMvc2hhcmVkL2RpYWdub3N0aWNzLmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaW5qZWN0L2ZpbGUtcGFzdGUuanMiLCAiLi4vLi4vc3JjL3NoYXJlZC9zaXRlLXJlZ2lzdHJ5LmpzIiwgIi4uLy4uL3NyYy9pZnJhbWUvaW5qZWN0L21haW4uanMiLCAiLi4vLi4vc3JjL2lmcmFtZS9pbmplY3QuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIFRoZSBleHRlbnNpb24gY29tcGFyZSBwYWdlIG9yaWdpbiDigJQgdXNlZCB0byB2YWxpZGF0ZSBpbmNvbWluZyBwb3N0TWVzc2FnZXNcclxuLy8gYW5kIHRvIHRhcmdldCBvdXRnb2luZyBwb3N0TWVzc2FnZXMuIGluamVjdC5qcyBpcyBpbmplY3RlZCBpbnRvIGV2ZXJ5XHJcbi8vIG1hdGNoaW5nIGZyYW1lLCBzbyB3aXRob3V0IHRoaXMgb3JpZ2luIGNoZWNrIGFueSB0aGlyZC1wYXJ0eSBwYWdlIGNvdWxkXHJcbi8vIGZvcmdlIFFTSE9UX1NFQVJDSCAvIFFTSE9UX0VYVFJBQ1QgbWVzc2FnZXMgYW5kIHdlYXBvbml6ZSBhIGxvZ2dlZC1pbiBBSVxyXG4vLyB0YWIgb24gdGhlIHVzZXIncyBiZWhhbGYuXHJcbmV4cG9ydCBjb25zdCBFWFRFTlNJT05fT1JJR0lOID1cclxuICB0eXBlb2YgY2hyb21lICE9PSBcInVuZGVmaW5lZFwiICYmIGNocm9tZS5ydW50aW1lICYmIGNocm9tZS5ydW50aW1lLmlkXHJcbiAgICA/IGBjaHJvbWUtZXh0ZW5zaW9uOi8vJHtjaHJvbWUucnVudGltZS5pZH1gXHJcbiAgICA6IG51bGw7XHJcblxyXG4vLyBUaGVzZSBhY3Rpb25zIGFjdHVhbGx5IFwic3VibWl0XCIuIE9uY2Ugb25lIG9mIHRoZW0gaGFzIGZpcmVkIHN1Y2Nlc3NmdWxseSB3ZVxyXG4vLyBtdXN0IG5vdCBsZXQgbGF0ZXIgZmFsbGJhY2sgc3RlcHMgKGV4dHJhIGNsaWNrIC8gc3ludGhlc2l6ZWQgRW50ZXIpIHJlLWZpcmUsXHJcbi8vIG90aGVyd2lzZSBzaXRlcyBsaWtlIENoYXRHUFQvUHJvc2VNaXJyb3Igc3VibWl0IHRoZSBzYW1lIHF1ZXJ5IHR3aWNlLlxyXG5leHBvcnQgY29uc3QgU1VCTUlUX0FDVElPTlMgPSBuZXcgU2V0KFtcImNsaWNrXCIsIFwic2VuZEtleXNcIiwgXCJzbWFydFN1Ym1pdFwiXSk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZGVsYXkobXMpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcclxufVxyXG4iLCAiLy8gRm9jdXMgYW4gZWxlbWVudCB3aXRob3V0IHRyaWdnZXJpbmcgdGhlIGJyb3dzZXIncyBkZWZhdWx0IFwic2Nyb2xsIGZvY3VzZWRcclxuLy8gZWxlbWVudCBpbnRvIHZpZXdcIiBiZWhhdmlvciwgd2hpY2ggd291bGQgaml0dGVyIHRoZSBvdXRlciAuaWZyYW1lcy1jb250YWluZXJcclxuLy8gc2Nyb2xsTGVmdC9zY3JvbGxUb3AuXHJcbmV4cG9ydCBmdW5jdGlvbiBzYWZlRm9jdXMoZWxlbWVudCkge1xyXG4gIGlmICghZWxlbWVudCB8fCB0eXBlb2YgZWxlbWVudC5mb2N1cyAhPT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIHRyeSB7XHJcbiAgICBlbGVtZW50LmZvY3VzKHsgcHJldmVudFNjcm9sbDogdHJ1ZSB9KTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIGVsZW1lbnQuZm9jdXMoKTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpc1RleHRDb250cm9sKGVsZW1lbnQpIHtcclxuICByZXR1cm4gZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxUZXh0QXJlYUVsZW1lbnQgfHwgZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXROYXRpdmVWYWx1ZShlbGVtZW50LCB2YWx1ZSkge1xyXG4gIGNvbnN0IHByb3RvdHlwZSA9IE9iamVjdC5nZXRQcm90b3R5cGVPZihlbGVtZW50KTtcclxuICBjb25zdCBkZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihwcm90b3R5cGUsIFwidmFsdWVcIik7XHJcbiAgaWYgKGRlc2NyaXB0b3IgJiYgdHlwZW9mIGRlc2NyaXB0b3Iuc2V0ID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgIGRlc2NyaXB0b3Iuc2V0LmNhbGwoZWxlbWVudCwgdmFsdWUpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBlbGVtZW50LnZhbHVlID0gdmFsdWU7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaEV2ZW50TGlzdChlbGVtZW50LCBldmVudHMpIHtcclxuICBldmVudHMuZm9yRWFjaCgoZXZlbnROYW1lKSA9PiB7XHJcbiAgICBsZXQgZXZlbnQ7XHJcbiAgICBpZiAoZXZlbnROYW1lID09PSBcImlucHV0XCIpIHtcclxuICAgICAgZXZlbnQgPSBuZXcgSW5wdXRFdmVudChcImlucHV0XCIsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgZGF0YTogXCJcIixcclxuICAgICAgICBpbnB1dFR5cGU6IFwiaW5zZXJ0VGV4dFwiLFxyXG4gICAgICB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGV2ZW50ID0gbmV3IEV2ZW50KGV2ZW50TmFtZSwgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pO1xyXG4gICAgfVxyXG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcclxuICB9KTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRpc3BhdGNoS2V5Ym9hcmRFdmVudChlbGVtZW50LCBwaGFzZSwga2V5KSB7XHJcbiAgY29uc3QgZXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudChwaGFzZSwge1xyXG4gICAga2V5LFxyXG4gICAgY29kZToga2V5ID09PSBcIkVudGVyXCIgPyBcIkVudGVyXCIgOiBrZXksXHJcbiAgICBrZXlDb2RlOiBrZXkgPT09IFwiRW50ZXJcIiA/IDEzIDogMCxcclxuICAgIHdoaWNoOiBrZXkgPT09IFwiRW50ZXJcIiA/IDEzIDogMCxcclxuICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gIH0pO1xyXG4gIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChldmVudCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RJbnB1dFR5cGUoZWxlbWVudCkge1xyXG4gIGlmIChlbGVtZW50LmlzQ29udGVudEVkaXRhYmxlKSB7XHJcbiAgICByZXR1cm4gXCJjb250ZW50ZWRpdGFibGVcIjtcclxuICB9XHJcbiAgcmV0dXJuIFwidGV4dFwiO1xyXG59XHJcbiIsICJpbXBvcnQgeyBzYWZlRm9jdXMgfSBmcm9tIFwiLi9kb20tdXRpbHMuanNcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRDb250ZW50ZWRpdGFibGVWYWx1ZShlbGVtZW50LCBxdWVyeSkge1xyXG4gIGNvbnN0IHRleHQgPSBTdHJpbmcocXVlcnkgfHwgXCJcIik7XHJcbiAgc2FmZUZvY3VzKGVsZW1lbnQpO1xyXG5cclxuICAvLyBTbGF0ZS5qcyBlZGl0b3JzIChxaWFud2VuIGV0Yy4pIG5lZWQgYSBkZWRpY2F0ZWQgYnJhbmNoIOKAlCBhIHBsYWluXHJcbiAgLy8gZXhlY0NvbW1hbmQoXCJpbnNlcnRUZXh0XCIpIHdvdWxkIGRyb3AgYSBzdHJheSB0ZXh0IG5vZGUgd2l0aG91dCBTbGF0ZSdzXHJcbiAgLy8gUmVhY3QgbW9kZWwgdXBkYXRpbmcsIHNvIHRoZSBwbGFjZWhvbGRlciBsYXllciBzdGF5cyB2aXNpYmxlIGFuZCB0aGVcclxuICAvLyBzZW5kIGJ1dHRvbiByZW1haW5zIGRpc2FibGVkLlxyXG4gIGlmIChpc1NsYXRlRWRpdG9yKGVsZW1lbnQpKSB7XHJcbiAgICB1cGRhdGVTbGF0ZUVkaXRvckNvbnRlbnQoZWxlbWVudCwgdGV4dCk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICAvLyBTZWxlY3QgYWxsIGN1cnJlbnQgY29udGVudHMgZmlyc3Qgc28gaW5zZXJ0VGV4dCByZXBsYWNlcyByYXRoZXIgdGhhblxyXG4gIC8vIGFwcGVuZHMg4oCUIGF2b2lkcyBkdXBsaWNhdGVkIHRleHQgaW4gTGV4aWNhbCAoS2ltaSkgZXRjLiBhbmQga2VlcHMgZWFjaFxyXG4gIC8vIHdyaXRlIGlkZW1wb3RlbnQuXHJcbiAgbGV0IHNlbGVjdGlvblNldCA9IGZhbHNlO1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XHJcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHMoZWxlbWVudCk7XHJcbiAgICBjb25zdCBzZWxlY3Rpb24gPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XHJcbiAgICBpZiAoc2VsZWN0aW9uKSB7XHJcbiAgICAgIHNlbGVjdGlvbi5yZW1vdmVBbGxSYW5nZXMoKTtcclxuICAgICAgc2VsZWN0aW9uLmFkZFJhbmdlKHJhbmdlKTtcclxuICAgICAgc2VsZWN0aW9uU2V0ID0gdHJ1ZTtcclxuICAgIH1cclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHNlbGVjdGlvblNldCA9IGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgLy8gUHJlZmVycmVkIHBhdGg6IGRvY3VtZW50LmV4ZWNDb21tYW5kKFwiaW5zZXJ0VGV4dFwiKS4gSXQgZGlzcGF0Y2hlcyBuYXRpdmVcclxuICAvLyBiZWZvcmVpbnB1dC9pbnB1dCBldmVudHMgd2l0aCBpbnB1dFR5cGU9XCJpbnNlcnRUZXh0XCIsIHdoaWNoIFByb3NlTWlycm9yXHJcbiAgLy8gKENoYXRHUFQpLCBMZXhpY2FsLCBldGMuIHJlbHkgb24gdG8gdXBkYXRlIHRoZWlyIGludGVybmFsIG1vZGVsIGFuZFxyXG4gIC8vIHRyaWdnZXIgYSBSZWFjdCByZS1yZW5kZXIgdGhhdCBlbmFibGVzIHRoZSBzZW5kIGJ1dHRvbi5cclxuICBsZXQgaW5zZXJ0ZWQgPSBmYWxzZTtcclxuICBpZiAoc2VsZWN0aW9uU2V0IHx8IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsZW1lbnQpIHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGluc2VydGVkID0gZG9jdW1lbnQuZXhlY0NvbW1hbmQoXCJpbnNlcnRUZXh0XCIsIGZhbHNlLCB0ZXh0KTtcclxuICAgIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgICBpbnNlcnRlZCA9IGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgaWYgKGluc2VydGVkKSB7XHJcbiAgICAvLyBJZiBleGVjQ29tbWFuZCByZXBvcnRlZCBzdWNjZXNzIHdlIG11c3QgTk9UIHZlcmlmeSBET00gc3luY2hyb25vdXNseS5cclxuICAgIC8vIFZ1ZSAoa2ltaS5jb20pLCBMZXhpY2FsLCBQcm9zZU1pcnJvciB3cml0ZSBpbnRvIHRoZWlyIG1vZGVsIGZpcnN0IGFuZFxyXG4gICAgLy8gZmx1c2ggdG8gRE9NIG9uIHRoZSBuZXh0IHRpY2s7IGEgc3luYyByZWFkIHdvdWxkIHNlZSBlbXB0eSBhbmQgdGhlXHJcbiAgICAvLyBmYWxsYmFjayBiZWxvdyB3b3VsZCBzeW50aGVzaXplIGEgc2Vjb25kIGJlZm9yZWlucHV0IOKAlCBLaW1pIHVzZXJzXHJcbiAgICAvLyBlbmRlZCB1cCB3aXRoIHRoZSBzYW1lIHF1ZXJ5IHBhc3RlZCB0d2ljZS4gVGhlIG91dGVyXHJcbiAgICAvLyBleGVjdXRlU2V0VmFsdWUgcmV0cnkgbG9vcCBoYW5kbGVzIGRlbGF5ZWQgdmVyaWZpY2F0aW9uIGluc3RlYWQuXHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICAvLyBGYWxsYmFjazogb25seSB3aGVuIGV4ZWNDb21tYW5kIHdhcyByZWZ1c2VkLiBUaGUgbmF0aXZlIGJlZm9yZWlucHV0XHJcbiAgLy8gbmV2ZXIgZmlyZWQsIHRoZSBlZGl0b3IncyBtb2RlbCBoYXMgbm8gdGV4dCwgc28gd2UgY2FuIHNhZmVseSBmaXJzdC13cml0ZVxyXG4gIC8vIHZpYSBzeW50aGV0aWMgZXZlbnRzICsgZGlyZWN0IERPTSBtdXRhdGlvbiB3aXRob3V0IHJpc2tpbmcgZHVwbGljYXRpb24uXHJcbiAgY29uc3QgaXNMZXhpY2FsRWRpdG9yID1cclxuICAgIGVsZW1lbnQuaGFzQXR0cmlidXRlKFwiZGF0YS1sZXhpY2FsLWVkaXRvclwiKSB8fFxyXG4gICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJkYXRhLWxleGljYWwtZWRpdG9yXCIpID09PSBcInRydWVcIjtcclxuXHJcbiAgaWYgKGlzTGV4aWNhbEVkaXRvcikge1xyXG4gICAgdXBkYXRlTGV4aWNhbEVkaXRvckNvbnRlbnQoZWxlbWVudCwgdGV4dCk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICB1cGRhdGVHZW5lcmljQ29udGVudGVkaXRhYmxlKGVsZW1lbnQsIHRleHQpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNTbGF0ZUVkaXRvcihlbGVtZW50KSB7XHJcbiAgaWYgKCFlbGVtZW50IHx8IHR5cGVvZiBlbGVtZW50LmdldEF0dHJpYnV0ZSAhPT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG4gIHJldHVybiAoXHJcbiAgICBlbGVtZW50LmdldEF0dHJpYnV0ZShcImRhdGEtc2xhdGUtZWRpdG9yXCIpID09PSBcInRydWVcIiB8fFxyXG4gICAgZWxlbWVudC5oYXNBdHRyaWJ1dGUoXCJkYXRhLXNsYXRlLW5vZGVcIikgfHxcclxuICAgIGVsZW1lbnQuaGFzQXR0cmlidXRlKFwiZGF0YS1zbGF0ZS1zdHJpbmdcIilcclxuICApO1xyXG59XHJcblxyXG4vLyBTbGF0ZSBrZWVwcyBpdHMgb3duIEVkaXRvcitTZWxlY3Rpb24gbW9kZWw7IG9ubHkgYSB2YWxpZCBiZWZvcmVpbnB1dCB3aXRoXHJcbi8vIGlucHV0VHlwZT1cImluc2VydFRleHRcIiBhbmQgZGF0YT08dGV4dD4gdHJpZ2dlcnMgVHJhbnNmb3Jtcy5pbnNlcnRUZXh0LCB3aGljaFxyXG4vLyB1cGRhdGVzIHRoZSBtb2RlbCwgY2xlYXJzIHRoZSBwbGFjZWhvbGRlciBsYXllciBhbmQgZW5hYmxlcyB0aGUgc2VuZCBidXR0b24uXHJcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVTbGF0ZUVkaXRvckNvbnRlbnQoZWxlbWVudCwgcXVlcnkpIHtcclxuICBzYWZlRm9jdXMoZWxlbWVudCk7XHJcblxyXG4gIC8vIFN0ZXAgMTogY292ZXIgYWxsIGV4aXN0aW5nIGNvbnRlbnQgd2l0aCBhIHNlbGVjdGlvbi4gU2xhdGUncyBiZWZvcmVpbnB1dFxyXG4gIC8vIGhhbmRsZXIgcmVhZHMgd2luZG93LmdldFNlbGVjdGlvbigpOyB3aXRob3V0IG9uZSBpdCBzaWxlbnRseSByZXR1cm5zLlxyXG4gIGNvbnN0IHNlbGVjdGlvbiA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcclxuICBsZXQgc2VsZWN0aW9uU2V0ID0gZmFsc2U7XHJcbiAgdHJ5IHtcclxuICAgIGlmIChzZWxlY3Rpb24pIHtcclxuICAgICAgc2VsZWN0aW9uLnJlbW92ZUFsbFJhbmdlcygpO1xyXG4gICAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XHJcbiAgICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyhlbGVtZW50KTtcclxuICAgICAgc2VsZWN0aW9uLmFkZFJhbmdlKHJhbmdlKTtcclxuICAgICAgc2VsZWN0aW9uU2V0ID0gdHJ1ZTtcclxuICAgIH1cclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHNlbGVjdGlvblNldCA9IGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgLy8gU3RlcCAyOiBpZiB0aGVyZSdzIGxlZnRvdmVyIHRleHQsIGhhdmUgU2xhdGUgY2xlYXIgaXRzIG93biBtb2RlbCB2aWFcclxuICAvLyBkZWxldGVDb250ZW50QmFja3dhcmQgcmF0aGVyIHRoYW4gbXV0YXRpbmcgRE9NIGRpcmVjdGx5LlxyXG4gIGNvbnN0IGV4aXN0aW5nVGV4dCA9IFN0cmluZyhlbGVtZW50LnRleHRDb250ZW50IHx8IFwiXCIpO1xyXG4gIGlmIChleGlzdGluZ1RleHQudHJpbSgpKSB7XHJcbiAgICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoXHJcbiAgICAgIG5ldyBJbnB1dEV2ZW50KFwiYmVmb3JlaW5wdXRcIiwge1xyXG4gICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgICBpbnB1dFR5cGU6IFwiZGVsZXRlQ29udGVudEJhY2t3YXJkXCIsXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgICBuZXcgSW5wdXRFdmVudChcImlucHV0XCIsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiBcImRlbGV0ZUNvbnRlbnRCYWNrd2FyZFwiLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGlmICghcXVlcnkpIHtcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIC8vIFN0ZXAgMzogZGlzcGF0Y2ggYmVmb3JlaW5wdXQoaW5zZXJ0VGV4dCkuIFNsYXRlJ3MgaGFuZGxlciBjYWxsc1xyXG4gIC8vIFRyYW5zZm9ybXMuaW5zZXJ0VGV4dChlZGl0b3IsIHF1ZXJ5KSwgUmVhY3QgcmUtcmVuZGVycywgdGhlIHBsYWNlaG9sZGVyXHJcbiAgLy8gY2xlYXJzIGFuZCB0aGUgc2VuZCBidXR0b24gZW5hYmxlcy4gY2FuY2VsYWJsZTp0cnVlIGxldHMgU2xhdGVcclxuICAvLyBwcmV2ZW50RGVmYXVsdCgpIHRoZSBicm93c2VyJ3Mgb3duIHRleHQgaW5zZXJ0aW9uIHRvIGF2b2lkIGR1cGxpY2F0ZXMuXHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgbmV3IElucHV0RXZlbnQoXCJiZWZvcmVpbnB1dFwiLCB7XHJcbiAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgIGlucHV0VHlwZTogXCJpbnNlcnRUZXh0XCIsXHJcbiAgICAgIGRhdGE6IHF1ZXJ5LFxyXG4gICAgfSlcclxuICApO1xyXG5cclxuICAvLyBTb21lIFNsYXRlIHdyYXBwZXJzIChQbGF0ZSBldGMuKSBhbHNvIHN5bmMgb24gaW5wdXQ7IGVtaXQgYSBtYXRjaGluZyBvbmUuXHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgbmV3IElucHV0RXZlbnQoXCJpbnB1dFwiLCB7XHJcbiAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgIGlucHV0VHlwZTogXCJpbnNlcnRUZXh0XCIsXHJcbiAgICAgIGRhdGE6IHF1ZXJ5LFxyXG4gICAgfSlcclxuICApO1xyXG5cclxuICAvLyBTdGVwIDQ6IGZhbGxiYWNrLiBJZiBTbGF0ZSBoYXNuJ3QgZmluaXNoZWQgbW91bnRpbmcgKFNQQSByb3V0ZSBzd2l0Y2gpLFxyXG4gIC8vIGJlZm9yZWlucHV0IGNhbiBiZSBkcm9wcGVkLiBPbmx5IHdoZW4gdGhlIHNlbGVjdGlvbiBmYWlsZWQgQU5EIERPTSBpc1xyXG4gIC8vIHN0aWxsIGVtcHR5IGRvIHdlIHdyaXRlIGEgdGV4dCBub2RlIGRpcmVjdGx5IHNvIHRoZSBvdXRlciB2ZXJpZmllciBjYW5cclxuICAvLyBwYXNzIGFuZCB3ZSBkb24ndCBsb29wIGZvcmV2ZXIuXHJcbiAgY29uc3Qgc3RpbGxFbXB0eSA9ICFTdHJpbmcoZWxlbWVudC50ZXh0Q29udGVudCB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCFzZWxlY3Rpb25TZXQgJiYgc3RpbGxFbXB0eSkge1xyXG4gICAgY29uc3QgcGFyYWdyYXBocyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChcclxuICAgICAgXCJbZGF0YS1zbGF0ZS1ub2RlPSdlbGVtZW50J10sIHAsIGRpdlwiXHJcbiAgICApO1xyXG4gICAgaWYgKHBhcmFncmFwaHMubGVuZ3RoID4gMCkge1xyXG4gICAgICBwYXJhZ3JhcGhzWzBdLnRleHRDb250ZW50ID0gcXVlcnk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlbGVtZW50LnRleHRDb250ZW50ID0gcXVlcnk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTGV4aWNhbEVkaXRvckNvbnRlbnQoZWxlbWVudCwgcXVlcnkpIHtcclxuICBzYWZlRm9jdXMoZWxlbWVudCk7XHJcblxyXG4gIC8vIFByZWZlciBzZWxlY3Rpb24gKyBiZWZvcmVpbnB1dCBzbyBMZXhpY2FsIHVwZGF0ZXMgaXRzIG93biBFZGl0b3JTdGF0ZVxyXG4gIC8vICh3aGljaCBpcyB3aGF0IGFjdHVhbGx5IHJlLWVuYWJsZXMgdGhlIHNlbmQgYnV0dG9uKS5cclxuICBsZXQgc2VsZWN0aW9uU2V0ID0gZmFsc2U7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcclxuICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyhlbGVtZW50KTtcclxuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcclxuICAgIGlmIChzZWwpIHtcclxuICAgICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xyXG4gICAgICBzZWwuYWRkUmFuZ2UocmFuZ2UpO1xyXG4gICAgICBzZWxlY3Rpb25TZXQgPSB0cnVlO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgc2VsZWN0aW9uU2V0ID0gZmFsc2U7XHJcbiAgfVxyXG5cclxuICAvLyBiZWZvcmVpbnB1dCArIGlucHV0ICsgY2hhbmdlIG9ubHkuIE5vIGNvbXBvc2l0aW9uIGV2ZW50cyDigJQgdGhvc2UgcHV0XHJcbiAgLy8gTGV4aWNhbCBpbnRvIElNRSBtb2RlIGFuZCBjb21wb3NpdGlvbmVuZCB3b3VsZCBjbG9iYmVyIG91ciB0ZXh0IG9uIGNvbW1pdCxcclxuICAvLyByZS1kaXNhYmxpbmcgdGhlIHNlbmQgYnV0dG9uLlxyXG4gIGRpc3BhdGNoTGV4aWNhbEV2ZW50cyhlbGVtZW50LCBxdWVyeSk7XHJcblxyXG4gIC8vIEZhbGxiYWNrOiBpZiB0aGUgdGV4dCBkaWRuJ3QgYWN0dWFsbHkgbGFuZCBpbiBET00gKG5vdCBmdWxseSBoeWRyYXRlZCAvXHJcbiAgLy8gYmVmb3JlaW5wdXQgc3dhbGxvd2VkKSwgbXV0YXRlIERPTSBzbyB0aGUgdmVyaWZpZXIgc2VlcyB0aGUgdGV4dCBhbmRcclxuICAvLyBleGVjdXRlU2V0VmFsdWUgc3RvcHMgcmV0cnlpbmcuXHJcbiAgY29uc3QgY3VycmVudFRleHQgPSBTdHJpbmcoZWxlbWVudC50ZXh0Q29udGVudCB8fCBcIlwiKTtcclxuICBpZiAoIXF1ZXJ5IHx8IGN1cnJlbnRUZXh0LmluY2x1ZGVzKHF1ZXJ5KSkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcGFyYWdyYXBocyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChcInBcIik7XHJcbiAgaWYgKHBhcmFncmFwaHMubGVuZ3RoID4gMCkge1xyXG4gICAgaWYgKHBhcmFncmFwaHMubGVuZ3RoID4gMSkge1xyXG4gICAgICBmb3IgKGxldCBpID0gMTsgaSA8IHBhcmFncmFwaHMubGVuZ3RoOyBpICs9IDEpIHtcclxuICAgICAgICBwYXJhZ3JhcGhzW2ldLnJlbW92ZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBmaXJzdFBhcmFncmFwaCA9IHBhcmFncmFwaHNbMF07XHJcbiAgICBmaXJzdFBhcmFncmFwaC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgaWYgKHF1ZXJ5LnRyaW0oKSkge1xyXG4gICAgICBjb25zdCBzcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIik7XHJcbiAgICAgIHNwYW4uc2V0QXR0cmlidXRlKFwiZGF0YS1sZXhpY2FsLXRleHRcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICBzcGFuLnRleHRDb250ZW50ID0gcXVlcnk7XHJcbiAgICAgIGZpcnN0UGFyYWdyYXBoLmFwcGVuZENoaWxkKHNwYW4pO1xyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICBlbGVtZW50LmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICBjb25zdCBwYXJhZ3JhcGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcclxuICAgIGlmIChxdWVyeS50cmltKCkpIHtcclxuICAgICAgY29uc3Qgc3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xyXG4gICAgICBzcGFuLnNldEF0dHJpYnV0ZShcImRhdGEtbGV4aWNhbC10ZXh0XCIsIFwidHJ1ZVwiKTtcclxuICAgICAgc3Bhbi50ZXh0Q29udGVudCA9IHF1ZXJ5O1xyXG4gICAgICBwYXJhZ3JhcGguYXBwZW5kQ2hpbGQoc3Bhbik7XHJcbiAgICB9XHJcbiAgICBlbGVtZW50LmFwcGVuZENoaWxkKHBhcmFncmFwaCk7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlR2VuZXJpY0NvbnRlbnRlZGl0YWJsZShlbGVtZW50LCBxdWVyeSkge1xyXG4gIHNhZmVGb2N1cyhlbGVtZW50KTtcclxuXHJcbiAgY29uc3QgcGFyYWdyYXBocyA9IGVsZW1lbnQucXVlcnlTZWxlY3RvckFsbChcInBcIik7XHJcbiAgaWYgKHBhcmFncmFwaHMubGVuZ3RoID4gMCkge1xyXG4gICAgaWYgKHBhcmFncmFwaHMubGVuZ3RoID4gMSkge1xyXG4gICAgICBmb3IgKGxldCBpbmRleCA9IDE7IGluZGV4IDwgcGFyYWdyYXBocy5sZW5ndGg7IGluZGV4ICs9IDEpIHtcclxuICAgICAgICBwYXJhZ3JhcGhzW2luZGV4XS5yZW1vdmUoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgZmlyc3RQYXJhZ3JhcGggPSBwYXJhZ3JhcGhzWzBdO1xyXG4gICAgZmlyc3RQYXJhZ3JhcGguY2xhc3NMaXN0LnJlbW92ZShcImlzLWVtcHR5XCIsIFwiaXMtZWRpdG9yLWVtcHR5XCIpO1xyXG4gICAgZmlyc3RQYXJhZ3JhcGgudGV4dENvbnRlbnQgPSBxdWVyeTtcclxuICB9IGVsc2Uge1xyXG4gICAgZWxlbWVudC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgY29uc3QgcGFyYWdyYXBoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XHJcbiAgICBwYXJhZ3JhcGgudGV4dENvbnRlbnQgPSBxdWVyeTtcclxuICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQocGFyYWdyYXBoKTtcclxuICB9XHJcblxyXG4gIGRpc3BhdGNoQ29udGVudGVkaXRhYmxlRXZlbnRzKGVsZW1lbnQsIHF1ZXJ5KTtcclxufVxyXG5cclxuLy8gTGV4aWNhbC1vbmx5IGV2ZW50IHNldDogbm8gY29tcG9zaXRpb24gZXZlbnRzIChzZWUgY29tbWVudCBhYm92ZSkuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaExleGljYWxFdmVudHMoZWxlbWVudCwgcXVlcnkpIHtcclxuICBlbGVtZW50LmRpc3BhdGNoRXZlbnQoXHJcbiAgICBuZXcgSW5wdXRFdmVudChcImJlZm9yZWlucHV0XCIsIHtcclxuICAgICAgYnViYmxlczogdHJ1ZSxcclxuICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcclxuICAgICAgaW5wdXRUeXBlOiBcImluc2VydFRleHRcIixcclxuICAgICAgZGF0YTogcXVlcnksXHJcbiAgICB9KVxyXG4gICk7XHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgbmV3IElucHV0RXZlbnQoXCJpbnB1dFwiLCB7XHJcbiAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgIGlucHV0VHlwZTogXCJpbnNlcnRUZXh0XCIsXHJcbiAgICAgIGRhdGE6IHF1ZXJ5LFxyXG4gICAgfSlcclxuICApO1xyXG4gIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJjaGFuZ2VcIiwgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxufVxyXG5cclxuLy8gR2VuZXJpYyBjb250ZW50ZWRpdGFibGUgZXZlbnQgc2V0IOKAlCBpbmNsdWRlcyBjb21wb3NpdGlvbiBldmVudHMgZm9yIG5vbi1MZXhpY2FsIGVkaXRvcnMuXHJcbmV4cG9ydCBmdW5jdGlvbiBkaXNwYXRjaENvbnRlbnRlZGl0YWJsZUV2ZW50cyhlbGVtZW50LCBxdWVyeSkge1xyXG4gIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChcclxuICAgIG5ldyBJbnB1dEV2ZW50KFwiYmVmb3JlaW5wdXRcIiwge1xyXG4gICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICBpbnB1dFR5cGU6IFwiaW5zZXJ0VGV4dFwiLFxyXG4gICAgICBkYXRhOiBxdWVyeSxcclxuICAgIH0pXHJcbiAgKTtcclxuXHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgbmV3IElucHV0RXZlbnQoXCJpbnB1dFwiLCB7XHJcbiAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgIGlucHV0VHlwZTogXCJpbnNlcnRUZXh0XCIsXHJcbiAgICAgIGRhdGE6IHF1ZXJ5LFxyXG4gICAgfSlcclxuICApO1xyXG5cclxuICBlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IENvbXBvc2l0aW9uRXZlbnQoXCJjb21wb3NpdGlvbnN0YXJ0XCIsIHsgYnViYmxlczogdHJ1ZSB9KSk7XHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KFwiY29tcG9zaXRpb251cGRhdGVcIiwgeyBidWJibGVzOiB0cnVlLCBkYXRhOiBxdWVyeSB9KSk7XHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDb21wb3NpdGlvbkV2ZW50KFwiY29tcG9zaXRpb25lbmRcIiwgeyBidWJibGVzOiB0cnVlLCBkYXRhOiBxdWVyeSB9KSk7XHJcbiAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudChcImNoYW5nZVwiLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBTVUJNSVRfQUNUSU9OUywgZGVsYXkgfSBmcm9tIFwiLi9jb25zdGFudHMuanNcIjtcclxuaW1wb3J0IHtcclxuICBzYWZlRm9jdXMsXHJcbiAgaXNUZXh0Q29udHJvbCxcclxuICBzZXROYXRpdmVWYWx1ZSxcclxuICBkaXNwYXRjaEV2ZW50TGlzdCxcclxuICBkaXNwYXRjaEtleWJvYXJkRXZlbnQsXHJcbiAgZGV0ZWN0SW5wdXRUeXBlLFxyXG59IGZyb20gXCIuL2RvbS11dGlscy5qc1wiO1xyXG5pbXBvcnQgeyBzZXRDb250ZW50ZWRpdGFibGVWYWx1ZSB9IGZyb20gXCIuL2VkaXRvcnMuanNcIjtcclxuXHJcbi8vIGhhc0ZpbGVzPXRydWUg5pe25pW05L2T5oqKXCLnrYnmjInpkq7lj6/nlKhcIueahOmihOeul+iwg+Wkp++8mlxyXG4vLyAgIC0g5LiK5Lyg5Yiw5ZCEIEFJIOermeeCueacjeWKoeWZqOeahOaWh+S7tuS8oOi+k+aZrumBjSAzfjE1IOenku+8jOWOn+mFjee9rueahCBzdWJtaXRXYWl0TXPvvIjlpJrmlbBcclxuLy8gICAgIDE1MDBtc++8jENoYXRHUFQgMzAwMG1z77yJ6L+c6L+c5LiN5aSf44CC562J5LiN5Yiw5oyJ6ZKu5Lqu6LW35bCx5Lya5Zue6JC95YiwIEVudGVyIOWFnOW6le+8jFxyXG4vLyAgICAg56uZ54K55Lya5oqK5paH5pys5o+Q5Lqk5L2G5oqb5byD5bCa5pyq5LiK5Lyg5a6M5oiQ55qE6ZmE5Lu244CCXHJcbi8vICAgLSDov5nph4znlKjmnIDlsI/lgLwgMjBzIOWFnOW6le+8m+S4quWIq+ermeeCueS4iuS8oOeJueWIq+aFouWPr+S7peWcqCBzaXRlSGFuZGxlcnMuanNvbiDph4znu5lcclxuLy8gICAgIOWNleeLrCBzdGVwIOaYvuW8j+iwg+abtOWkp+eahCBzdWJtaXRXYWl0TXPvvIzku43nhLbkv53nlZkgbWF4KCkg6K+t5LmJ44CCXHJcbmNvbnN0IEZJTEVTX01JTl9TVUJNSVRfV0FJVF9NUyA9IDIwMDAwO1xyXG5jb25zdCBGSUxFU19NSU5fRklORF9USU1FT1VUX01TID0gMjUwMDA7XHJcbmNvbnN0IFNVQk1JVF9WRVJJRllfV0FJVF9NUyA9IDkwMDtcclxuY29uc3QgU1VCTUlUX1ZFUklGWV9SRVRSWV9DT1VOVCA9IDQ7XHJcblxyXG5mdW5jdGlvbiBhcHBseUZpbGVzQXdhcmVUaW1lb3V0cyhzdGVwKSB7XHJcbiAgLy8g5LiN5Zyo5Y6fIGNvbmZpZyDkuIrmlLnlhpnvvJrmr4/mrKHlj6rlr7kgU1VCTUlUX0FDVElPTlMg57G755qE5q2l6aqk5Lqn5Ye65LiA5Lu96KGl5LiB5Ymv5pys77yMXHJcbiAgLy8g6K6pIGhhc0ZpbGVzIOW8gOWFs+WPquW9seWTjeacrOasoeaJp+ihjO+8jOmBv+WFjeaxoeafk+WFqOWxgOe8k+WtmOeahCBzaXRlIGNvbmZpZ+OAglxyXG4gIGlmIChzdGVwLmFjdGlvbiAhPT0gXCJzbWFydFN1Ym1pdFwiICYmIHN0ZXAuYWN0aW9uICE9PSBcImNsaWNrXCIpIHtcclxuICAgIHJldHVybiBzdGVwO1xyXG4gIH1cclxuICBjb25zdCBuZXh0ID0geyAuLi5zdGVwIH07XHJcbiAgaWYgKG5leHQuYWN0aW9uID09PSBcInNtYXJ0U3VibWl0XCIpIHtcclxuICAgIG5leHQuc3VibWl0V2FpdE1zID0gTWF0aC5tYXgoXHJcbiAgICAgIE51bWJlci5pc0Zpbml0ZShuZXh0LnN1Ym1pdFdhaXRNcykgPyBuZXh0LnN1Ym1pdFdhaXRNcyA6IDAsXHJcbiAgICAgIEZJTEVTX01JTl9TVUJNSVRfV0FJVF9NU1xyXG4gICAgKTtcclxuICB9IGVsc2UgaWYgKG5leHQuYWN0aW9uID09PSBcImNsaWNrXCIpIHtcclxuICAgIG5leHQudGltZW91dCA9IE1hdGgubWF4KFxyXG4gICAgICBOdW1iZXIuaXNGaW5pdGUobmV4dC50aW1lb3V0KSA/IG5leHQudGltZW91dCA6IDAsXHJcbiAgICAgIEZJTEVTX01JTl9GSU5EX1RJTUVPVVRfTVNcclxuICAgICk7XHJcbiAgfVxyXG4gIHJldHVybiBuZXh0O1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVNpdGVIYW5kbGVyKHF1ZXJ5LCBoYW5kbGVyQ29uZmlnLCBvcHRpb25zID0ge30pIHtcclxuICBpZiAoIWhhbmRsZXJDb25maWcgfHwgIUFycmF5LmlzQXJyYXkoaGFuZGxlckNvbmZpZy5zdGVwcykgfHwgaGFuZGxlckNvbmZpZy5zdGVwcy5sZW5ndGggPT09IDApIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIuaXoOaViOeahOermeeCueWkhOeQhuWZqOmFjee9rlwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHsgaGFzRmlsZXMgPSBmYWxzZSB9ID0gb3B0aW9ucztcclxuICBjb25zdCBjb250ZXh0ID0geyBzdWJtaXR0ZWQ6IGZhbHNlIH07XHJcblxyXG4gIGZvciAoY29uc3QgcmF3U3RlcCBvZiBoYW5kbGVyQ29uZmlnLnN0ZXBzKSB7XHJcbiAgICBjb25zdCBzdGVwID0gaGFzRmlsZXMgPyBhcHBseUZpbGVzQXdhcmVUaW1lb3V0cyhyYXdTdGVwKSA6IHJhd1N0ZXA7XHJcblxyXG4gICAgaWYgKGNvbnRleHQuc3VibWl0dGVkICYmIFNVQk1JVF9BQ1RJT05TLmhhcyhzdGVwLmFjdGlvbikpIHtcclxuICAgICAgY29udGludWU7XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgZXhlY3V0ZVN0ZXAoc3RlcCwgcXVlcnksIGNvbnRleHQpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgaWYgKHN0ZXAub3B0aW9uYWwpIGNvbnRpbnVlO1xyXG4gICAgICBjb25zdCBsYWJlbCA9IHN0ZXAuZGVzY3JpcHRpb24gfHwgc3RlcC5hY3Rpb24gfHwgXCLmnKrnn6XmraXpqqRcIjtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2xhYmVsfeWksei0pTogJHtlcnJvci5tZXNzYWdlfWApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChzdGVwLndhaXRBZnRlcikge1xyXG4gICAgICBhd2FpdCBkZWxheShzdGVwLndhaXRBZnRlcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhd2FpdCB2ZXJpZnlTdWJtaXR0ZWRPclJldHJ5KHF1ZXJ5LCBoYW5kbGVyQ29uZmlnLCBjb250ZXh0LCB7IGhhc0ZpbGVzIH0pO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlU3RlcChzdGVwLCBxdWVyeSwgY29udGV4dCkge1xyXG4gIHN3aXRjaCAoc3RlcC5hY3Rpb24pIHtcclxuICAgIGNhc2UgXCJmb2N1c1wiOlxyXG4gICAgICBhd2FpdCBleGVjdXRlRm9jdXMoc3RlcCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIGNhc2UgXCJzZXRWYWx1ZVwiOlxyXG4gICAgICBhd2FpdCBleGVjdXRlU2V0VmFsdWUoc3RlcCwgcXVlcnkpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICBjYXNlIFwidHJpZ2dlckV2ZW50c1wiOlxyXG4gICAgICBhd2FpdCBleGVjdXRlVHJpZ2dlckV2ZW50cyhzdGVwKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgY2FzZSBcImNsaWNrXCI6XHJcbiAgICAgIGlmIChhd2FpdCBleGVjdXRlQ2xpY2soc3RlcCkpIGNvbnRleHQuc3VibWl0dGVkID0gdHJ1ZTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgY2FzZSBcIndhaXRcIjpcclxuICAgICAgYXdhaXQgZGVsYXkoc3RlcC5kdXJhdGlvbiB8fCAwKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgY2FzZSBcInNlbmRLZXlzXCI6XHJcbiAgICAgIGF3YWl0IGV4ZWN1dGVTZW5kS2V5cyhzdGVwKTtcclxuICAgICAgY29udGV4dC5zdWJtaXR0ZWQgPSB0cnVlO1xyXG4gICAgICByZXR1cm47XHJcbiAgICBjYXNlIFwic21hcnRTdWJtaXRcIjpcclxuICAgICAgaWYgKGF3YWl0IGV4ZWN1dGVTbWFydFN1Ym1pdChzdGVwLCBxdWVyeSkpIGNvbnRleHQuc3VibWl0dGVkID0gdHJ1ZTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgZGVmYXVsdDpcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGDkuI3mlK/mjIHnmoQgYWN0aW9uOiAke3N0ZXAuYWN0aW9ufWApO1xyXG4gIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gdmVyaWZ5U3VibWl0dGVkT3JSZXRyeShxdWVyeSwgaGFuZGxlckNvbmZpZywgY29udGV4dCwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhxdWVyeSB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCF0ZXh0KSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCBzdGVwcyA9IEFycmF5LmlzQXJyYXkoaGFuZGxlckNvbmZpZy5zdGVwcykgPyBoYW5kbGVyQ29uZmlnLnN0ZXBzIDogW107XHJcbiAgY29uc3Qgc3VibWl0U3RlcHMgPSBzdGVwcy5maWx0ZXIoKHN0ZXApID0+IFNVQk1JVF9BQ1RJT05TLmhhcyhzdGVwLmFjdGlvbikpO1xyXG4gIGNvbnN0IGlucHV0U3RlcCA9IGZpbmRTdWJtaXRWZXJpZmljYXRpb25JbnB1dFN0ZXAoc3RlcHMpO1xyXG4gIGNvbnN0IHJld3JpdGVTdGVwID0gc3RlcHMuZmluZCgoc3RlcCkgPT4gc3RlcC5hY3Rpb24gPT09IFwic2V0VmFsdWVcIiAmJiBnZXRTZWxlY3RvcnMoc3RlcCkubGVuZ3RoID4gMCk7XHJcbiAgaWYgKHN1Ym1pdFN0ZXBzLmxlbmd0aCA9PT0gMCB8fCAhaW5wdXRTdGVwKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCB2ZXJpZnlXYWl0TXMgPSBOdW1iZXIuaXNGaW5pdGUoaGFuZGxlckNvbmZpZy5zdWJtaXRWZXJpZnlXYWl0TXMpXHJcbiAgICA/IGhhbmRsZXJDb25maWcuc3VibWl0VmVyaWZ5V2FpdE1zXHJcbiAgICA6IFNVQk1JVF9WRVJJRllfV0FJVF9NUztcclxuICBjb25zdCBtYXhSZXRyaWVzID0gTnVtYmVyLmlzRmluaXRlKGhhbmRsZXJDb25maWcuc3VibWl0VmVyaWZ5UmV0cmllcylcclxuICAgID8gaGFuZGxlckNvbmZpZy5zdWJtaXRWZXJpZnlSZXRyaWVzXHJcbiAgICA6IFNVQk1JVF9WRVJJRllfUkVUUllfQ09VTlQ7XHJcblxyXG4gIGF3YWl0IGRlbGF5KHZlcmlmeVdhaXRNcyk7XHJcblxyXG4gIGZvciAobGV0IHJldHJ5SW5kZXggPSAwOyByZXRyeUluZGV4IDw9IG1heFJldHJpZXM7IHJldHJ5SW5kZXggKz0gMSkge1xyXG4gICAgY29uc3QgY3VycmVudCA9IGF3YWl0IHJlYWRDdXJyZW50VmFsdWUoaW5wdXRTdGVwKTtcclxuICAgIGlmICghY3VycmVudC5pbmNsdWRlcyh0ZXh0KSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHJldHJ5SW5kZXggPj0gbWF4UmV0cmllcykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCLlhoXlrrnku43lgZznlZnlnKjovpPlhaXmoYbvvIzlj5HpgIHmjInpkq7lj6/og73mnKrnlJ/mlYhcIik7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHJld3JpdGVTdGVwKSB7XHJcbiAgICAgIGF3YWl0IGV4ZWN1dGVTdGVwKHJld3JpdGVTdGVwLCBxdWVyeSwgY29udGV4dCk7XHJcbiAgICAgIGlmIChyZXdyaXRlU3RlcC53YWl0QWZ0ZXIpIHtcclxuICAgICAgICBhd2FpdCBkZWxheShyZXdyaXRlU3RlcC53YWl0QWZ0ZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIGF3YWl0IGRlbGF5KDEyMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBhd2FpdCByZWZpcmVJbnB1dEV2ZW50cyhpbnB1dFN0ZXAsIHRleHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnRleHQuc3VibWl0dGVkID0gZmFsc2U7XHJcbiAgICBmb3IgKGNvbnN0IHJhd1N0ZXAgb2Ygc3VibWl0U3RlcHMpIHtcclxuICAgICAgY29uc3Qgc3RlcCA9IG9wdGlvbnMuaGFzRmlsZXMgPyBhcHBseUZpbGVzQXdhcmVUaW1lb3V0cyhyYXdTdGVwKSA6IHJhd1N0ZXA7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgZXhlY3V0ZVN0ZXAoc3RlcCwgcXVlcnksIGNvbnRleHQpO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGlmIChzdGVwLm9wdGlvbmFsKSBjb250aW51ZTtcclxuICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHN0ZXAud2FpdEFmdGVyKSB7XHJcbiAgICAgICAgYXdhaXQgZGVsYXkoc3RlcC53YWl0QWZ0ZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIGF3YWl0IGRlbGF5KE1hdGgubWluKHZlcmlmeVdhaXRNcywgNDUwKSk7XHJcbiAgICAgIGNvbnN0IGFmdGVyU3VibWl0VmFsdWUgPSBhd2FpdCByZWFkQ3VycmVudFZhbHVlKGlucHV0U3RlcCk7XHJcbiAgICAgIGlmICghYWZ0ZXJTdWJtaXRWYWx1ZS5pbmNsdWRlcyh0ZXh0KSkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IGRlbGF5KHZlcmlmeVdhaXRNcyk7XHJcbiAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWZpcmVJbnB1dEV2ZW50cyhzdGVwLCB0ZXh0KSB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBhd2FpdCBmaW5kRWxlbWVudChzdGVwKTtcclxuICAgIHNhZmVGb2N1cyhlbGVtZW50KTtcclxuICAgIGlmIChpc1RleHRDb250cm9sKGVsZW1lbnQpKSB7XHJcbiAgICAgIGRpc3BhdGNoRXZlbnRMaXN0KGVsZW1lbnQsIFtcImlucHV0XCIsIFwiY2hhbmdlXCJdKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgZWxlbWVudC5kaXNwYXRjaEV2ZW50KFxyXG4gICAgICBuZXcgSW5wdXRFdmVudChcImlucHV0XCIsIHtcclxuICAgICAgICBidWJibGVzOiB0cnVlLFxyXG4gICAgICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICAgICAgaW5wdXRUeXBlOiBcImluc2VydFRleHRcIixcclxuICAgICAgICBkYXRhOiB0ZXh0LFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoXCJjaGFuZ2VcIiwgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIC8vIOS/neW6leS6i+S7tuWksei0peS4jeW6lOmYu+aWreWQjue7reaPkOS6pOmHjeivleOAglxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZmluZFN1Ym1pdFZlcmlmaWNhdGlvbklucHV0U3RlcChzdGVwcykge1xyXG4gIGNvbnN0IGlucHV0QWN0aW9ucyA9IG5ldyBTZXQoW1wic2V0VmFsdWVcIiwgXCJzbWFydFN1Ym1pdFwiLCBcInNlbmRLZXlzXCIsIFwiZm9jdXNcIl0pO1xyXG4gIHJldHVybiBzdGVwcy5maW5kKChzdGVwKSA9PiBzdGVwLmFjdGlvbiA9PT0gXCJzZXRWYWx1ZVwiICYmIGdldFNlbGVjdG9ycyhzdGVwKS5sZW5ndGggPiAwKVxyXG4gICAgfHwgc3RlcHMuZmluZCgoc3RlcCkgPT4gaW5wdXRBY3Rpb25zLmhhcyhzdGVwLmFjdGlvbikgJiYgZ2V0U2VsZWN0b3JzKHN0ZXApLmxlbmd0aCA+IDApXHJcbiAgICB8fCBudWxsO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlRm9jdXMoc3RlcCkge1xyXG4gIGNvbnN0IGVsZW1lbnQgPSBhd2FpdCBmaW5kRWxlbWVudChzdGVwKTtcclxuICBzYWZlRm9jdXMoZWxlbWVudCk7XHJcbiAgaWYgKHR5cGVvZiBlbGVtZW50LmNsaWNrID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgIGVsZW1lbnQuY2xpY2soKTtcclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTZXRWYWx1ZShzdGVwLCBxdWVyeSkge1xyXG4gIGNvbnN0IHRleHQgPSBTdHJpbmcocXVlcnkgfHwgXCJcIik7XHJcbiAgLy8gQ2hhdEdQVC1jbGFzcyBTUEFzIGhhdmUgI3Byb21wdC10ZXh0YXJlYSBpbiBET00gb24gaWZyYW1lIGxvYWQgYnV0XHJcbiAgLy8gUHJvc2VNaXJyb3IvUmVhY3QgaHlkcmF0aW9uIGhhc24ndCBmaW5pc2hlZCDigJQgYSB3cml0ZS10aGVuLWRvbmUgZmxvd1xyXG4gIC8vIGdldHMgY2xvYmJlcmVkIGJ5IGEgcmUtcmVuZGVyLiBXcml0ZSwgdmVyaWZ5LCByZXRyeSB1bnRpbCB0aGUgZWRpdG9yXHJcbiAgLy8gYWN0dWFsbHkgdGFrZXMgdGhlIHRleHQgb3IgYXR0ZW1wdHMgcnVuIG91dC5cclxuICBjb25zdCBtYXhBdHRlbXB0cyA9IHN0ZXAubWF4QXR0ZW1wdHMgfHwgMTI7XHJcbiAgbGV0IGxhc3RFcnJvciA9IG51bGw7XHJcblxyXG4gIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgbWF4QXR0ZW1wdHM7IGF0dGVtcHQgKz0gMSkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGF3YWl0IGZpbmRFbGVtZW50KHN0ZXApO1xyXG4gICAgc2FmZUZvY3VzKGVsZW1lbnQpO1xyXG5cclxuICAgIGxldCBpbnB1dFR5cGUgPSBzdGVwLmlucHV0VHlwZSA9PT0gXCJhdXRvXCJcclxuICAgICAgPyBkZXRlY3RJbnB1dFR5cGUoZWxlbWVudClcclxuICAgICAgOiAoc3RlcC5pbnB1dFR5cGUgfHwgZGV0ZWN0SW5wdXRUeXBlKGVsZW1lbnQpKTtcclxuXHJcbiAgICAvLyBLaW1pJ3MgLmNoYXQtaW5wdXQtZWRpdG9yIGFuZCBzb21lIFZ1ZSBlZGl0b3JzIHN0YXlcclxuICAgIC8vIGNvbnRlbnRlZGl0YWJsZT1cImZhbHNlXCIgZHVyaW5nIFNTUiDihpIgaHlkcmF0aW9uIGFuZCBmYWxsIHRocm91Z2ggdG9cclxuICAgIC8vIFwidGV4dFwiIG1vZGUgaW5jb3JyZWN0bHkuIElmIHRoZSBlbGVtZW50IGlzIGEgRElWL1NQQU4taXNoIGVkaXRhYmxlXHJcbiAgICAvLyBjb250YWluZXIsIGZvcmNlIGNvbnRlbnRlZGl0YWJsZSBwYXRoIGFuZCB0cnkgdG8gZmxpcCB0aGUgYXR0cmlidXRlLlxyXG4gICAgaWYgKGlucHV0VHlwZSA9PT0gXCJ0ZXh0XCIgJiYgIWlzVGV4dENvbnRyb2woZWxlbWVudCkpIHtcclxuICAgICAgaW5wdXRUeXBlID0gXCJjb250ZW50ZWRpdGFibGVcIjtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBpZiAoZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJjb250ZW50ZWRpdGFibGVcIikgIT09IFwidHJ1ZVwiKSB7XHJcbiAgICAgICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShcImNvbnRlbnRlZGl0YWJsZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgICAgICAvLyBzb21lIGNvbnRhaW5lcnMgYWN0aXZlbHkgcmVzZXQgY29udGVudGVkaXRhYmxlOyBzZXRDb250ZW50ZWRpdGFibGVWYWx1ZSBmYWxsYmFjayBoYW5kbGVzIGl0XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAoaW5wdXRUeXBlID09PSBcImNvbnRlbnRlZGl0YWJsZVwiKSB7XHJcbiAgICAgICAgc2V0Q29udGVudGVkaXRhYmxlVmFsdWUoZWxlbWVudCwgdGV4dCk7XHJcbiAgICAgIH0gZWxzZSBpZiAoaXNUZXh0Q29udHJvbChlbGVtZW50KSkge1xyXG4gICAgICAgIHNldE5hdGl2ZVZhbHVlKGVsZW1lbnQsIHRleHQpO1xyXG4gICAgICAgIGRpc3BhdGNoRXZlbnRMaXN0KGVsZW1lbnQsIFtcImlucHV0XCIsIFwiY2hhbmdlXCJdKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCLnm67moIflhYPntKDkuI3mmK/lj6/lhpnovpPlhaXmjqfku7ZcIik7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGxhc3RFcnJvciA9IGVycm9yO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGV4dCkgcmV0dXJuO1xyXG5cclxuICAgIGF3YWl0IGRlbGF5KDYwICsgYXR0ZW1wdCAqIDQwKTtcclxuXHJcbiAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgcmVhZEN1cnJlbnRWYWx1ZShzdGVwKTtcclxuICAgIGlmIChjdXJyZW50LmluY2x1ZGVzKHRleHQpICYmIGF3YWl0IHZhbHVlUmVtYWluc1N0YWJsZShzdGVwLCB0ZXh0KSkgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgaWYgKGxhc3RFcnJvcikgdGhyb3cgbGFzdEVycm9yO1xyXG4gIHRocm93IG5ldyBFcnJvcihcIuWGmeWFpei+k+WFpeahhuWQjuWGheWuueacqueUn+aViFwiKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gdmFsdWVSZW1haW5zU3RhYmxlKHN0ZXAsIHRleHQpIHtcclxuICBjb25zdCBzdGFibGVXYWl0TXMgPSBOdW1iZXIuaXNGaW5pdGUoc3RlcC5zdGFibGVXYWl0TXMpID8gc3RlcC5zdGFibGVXYWl0TXMgOiAwO1xyXG4gIGlmIChzdGFibGVXYWl0TXMgPD0gMCkge1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyBzdGFibGVXYWl0TXM7XHJcbiAgd2hpbGUgKERhdGUubm93KCkgPCBkZWFkbGluZSkge1xyXG4gICAgYXdhaXQgZGVsYXkoTWF0aC5taW4oMTIwLCBkZWFkbGluZSAtIERhdGUubm93KCkpKTtcclxuICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCByZWFkQ3VycmVudFZhbHVlKHN0ZXApO1xyXG4gICAgaWYgKCFjdXJyZW50LmluY2x1ZGVzKHRleHQpKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZWFkQ3VycmVudFZhbHVlKHN0ZXApIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgZWxlbWVudCA9IGF3YWl0IGZpbmRFbGVtZW50KHN0ZXApO1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gXCJcIjtcclxuICAgIGlmIChpc1RleHRDb250cm9sKGVsZW1lbnQpKSByZXR1cm4gU3RyaW5nKGVsZW1lbnQudmFsdWUgfHwgXCJcIik7XHJcbiAgICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudGV4dENvbnRlbnQgfHwgXCJcIik7XHJcbiAgfSBjYXRjaCAoX2Vycm9yKSB7XHJcbiAgICByZXR1cm4gXCJcIjtcclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVUcmlnZ2VyRXZlbnRzKHN0ZXApIHtcclxuICBjb25zdCBlbGVtZW50ID0gYXdhaXQgZmluZEVsZW1lbnQoc3RlcCk7XHJcbiAgY29uc3QgZXZlbnRzID0gQXJyYXkuaXNBcnJheShzdGVwLmV2ZW50cykgPyBzdGVwLmV2ZW50cyA6IFtdO1xyXG4gIC8vIGNvbnRlbnRlZGl0YWJsZSArIGV4ZWNDb21tYW5kKFwiaW5zZXJ0VGV4dFwiKSBhbHJlYWR5IGRpc3BhdGNoZWQgYW5cclxuICAvLyBpc1RydXN0ZWQ9dHJ1ZSBpbnB1dDsgYSBzZWNvbmQgc3ludGhldGljIGlucHV0IChkYXRhPT1cIlwiKSBtYWtlc1xyXG4gIC8vIFByb3NlTWlycm9yIHRoaW5rIHRoZSBmaWVsZCB3YXMgZW1wdGllZCBhbmQgdGhlIG5ldyB0ZXh0IGZsYXNoZXMgYXdheS5cclxuICBjb25zdCBmaWx0ZXJlZCA9IGVsZW1lbnQgJiYgZWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZVxyXG4gICAgPyBldmVudHMuZmlsdGVyKChuYW1lKSA9PiBuYW1lICE9PSBcImlucHV0XCIgJiYgbmFtZSAhPT0gXCJiZWZvcmVpbnB1dFwiKVxyXG4gICAgOiBldmVudHM7XHJcbiAgZGlzcGF0Y2hFdmVudExpc3QoZWxlbWVudCwgZmlsdGVyZWQpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlQ2xpY2soc3RlcCkge1xyXG4gIC8vIEFmdGVyIHNldFZhbHVlLCBSZWFjdCBvZnRlbiBuZWVkcyBhbm90aGVyIHJlbmRlciBiZWZvcmUgdGhlIHNlbmQgYnV0dG9uXHJcbiAgLy8gZmxpcHMgZnJvbSBhcmlhLWRpc2FibGVkLiBQb2xsIHVudGlsIHRoZSBidXR0b24gaXMgdHJ1bHkgdXNhYmxlIGluc3RlYWRcclxuICAvLyBvZiBcImNsaWNrIG9uIHNpZ2h0XCIsIHdoaWNoIHdvdWxkIGZhbGwgdGhyb3VnaCB0byBFbnRlciBmYWxsYmFjayAx4oCTMnMgbGF0ZXIuXHJcbiAgY29uc3Qgc2VsZWN0b3JzID0gZ2V0U2VsZWN0b3JzKHN0ZXApO1xyXG4gIGlmIChzZWxlY3RvcnMubGVuZ3RoID09PSAwKSB0aHJvdyBuZXcgRXJyb3IoXCLnvLrlsJHpgInmi6nlmahcIik7XHJcblxyXG4gIGNvbnN0IHRpbWVvdXRNcyA9IE51bWJlci5pc0Zpbml0ZShzdGVwLnRpbWVvdXQpID8gc3RlcC50aW1lb3V0IDogMTUwMDtcclxuICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB0aW1lb3V0TXM7XHJcbiAgbGV0IGxhc3RTZWVuID0gbnVsbDtcclxuXHJcbiAgd2hpbGUgKERhdGUubm93KCkgPD0gZGVhZGxpbmUpIHtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgICAgaWYgKCFlbGVtZW50KSBjb250aW51ZTtcclxuICAgICAgbGFzdFNlZW4gPSBlbGVtZW50O1xyXG4gICAgICBpZiAoaXNVc2FibGVTdWJtaXRCdXR0b24oZWxlbWVudCkpIHtcclxuICAgICAgICBhY3RpdmF0ZVN1Ym1pdEJ1dHRvbihlbGVtZW50KTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgYXdhaXQgZGVsYXkoMjUpO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFsYXN0U2VlbikgdGhyb3cgbmV3IEVycm9yKGDmnKrmib7liLDlhYPntKA6ICR7c2VsZWN0b3JzLmpvaW4oXCIsIFwiKX1gKTtcclxuICB0aHJvdyBuZXcgRXJyb3IoXCLnm67moIfmjInpkq7lpITkuo7npoHnlKjmgIFcIik7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTZW5kS2V5cyhzdGVwKSB7XHJcbiAgY29uc3QgZWxlbWVudCA9IHN0ZXAuc2VsZWN0b3IgfHwgc3RlcC5zZWxlY3RvcnNcclxuICAgID8gYXdhaXQgZmluZEVsZW1lbnQoc3RlcClcclxuICAgIDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcclxuICBpZiAoIWVsZW1lbnQpIHRocm93IG5ldyBFcnJvcihcIuayoeacieWPr+WPkemAgeaMiemUrueahOebruagh+WFg+e0oFwiKTtcclxuXHJcbiAgY29uc3Qga2V5cyA9IEFycmF5LmlzQXJyYXkoc3RlcC5rZXlzKSA/IHN0ZXAua2V5cyA6IFtdO1xyXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcclxuICAgIGRpc3BhdGNoS2V5Ym9hcmRFdmVudChlbGVtZW50LCBcImtleWRvd25cIiwga2V5KTtcclxuICAgIGRpc3BhdGNoS2V5Ym9hcmRFdmVudChlbGVtZW50LCBcImtleXByZXNzXCIsIGtleSk7XHJcbiAgICBkaXNwYXRjaEtleWJvYXJkRXZlbnQoZWxlbWVudCwgXCJrZXl1cFwiLCBrZXkpO1xyXG4gIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVNtYXJ0U3VibWl0KHN0ZXAsIHF1ZXJ5KSB7XHJcbiAgY29uc3QgYW5jaG9yID0gc3RlcC5zZWxlY3RvciB8fCBzdGVwLnNlbGVjdG9yc1xyXG4gICAgPyBhd2FpdCBmaW5kRWxlbWVudChzdGVwKVxyXG4gICAgOiBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xyXG4gIGlmICghYW5jaG9yKSB0aHJvdyBuZXcgRXJyb3IoXCLmsqHmnInlj6/nlKjkuo7mj5DkuqTnmoTovpPlhaXlhYPntKBcIik7XHJcblxyXG4gIHNhZmVGb2N1cyhhbmNob3IpO1xyXG5cclxuICBjb25zdCBzdWJtaXRTZWxlY3RvcnMgPSBBcnJheS5pc0FycmF5KHN0ZXAuc3VibWl0U2VsZWN0b3JzKSAmJiBzdGVwLnN1Ym1pdFNlbGVjdG9ycy5sZW5ndGggPiAwXHJcbiAgICA/IHN0ZXAuc3VibWl0U2VsZWN0b3JzXHJcbiAgICA6IFtcclxuICAgICAgICBcImJ1dHRvblt0eXBlPSdzdWJtaXQnXVwiLFxyXG4gICAgICAgIFwiYnV0dG9uW2FyaWEtbGFiZWwqPSflj5HpgIEnXVwiLFxyXG4gICAgICAgIFwiYnV0dG9uW2FyaWEtbGFiZWwqPSdTZW5kJ11cIixcclxuICAgICAgICBcImJ1dHRvblt0aXRsZSo9J+WPkemAgSddXCIsXHJcbiAgICAgICAgXCJidXR0b25bdGl0bGUqPSdTZW5kJ11cIixcclxuICAgICAgICBcIltyb2xlPSdidXR0b24nXVthcmlhLWxhYmVsKj0n5Y+R6YCBJ11cIixcclxuICAgICAgICBcIltyb2xlPSdidXR0b24nXVthcmlhLWxhYmVsKj0nU2VuZCddXCIsXHJcbiAgICAgIF07XHJcblxyXG4gIC8vIFBvbGwgZm9yIGEgdXNhYmxlIHNlbmQgYnV0dG9uIGZpcnN0LiBMZXhpY2FsIChLaW1pKSAvIFByb3NlTWlycm9yXHJcbiAgLy8gKENoYXRHUFQpIG5lZWQgYSBSZWFjdCByZS1yZW5kZXIgYWZ0ZXIgc2V0VmFsdWUgYmVmb3JlIHRoZSBidXR0b25cclxuICAvLyB1bi1kaXNhYmxlcyDigJQgZG9uJ3Qgc2tpcCB0aGlzIHdpdGggZm9ybS5yZXF1ZXN0U3VibWl0KCkgd2hpY2ggd291bGRcclxuICAvLyBzaWxlbnRseSBmYWlsIHdoaWxlIHRoZSBidXR0b24gaXMgc3RpbGwgZGlzYWJsZWQuXHJcbiAgY29uc3Qgd2FpdE1zID0gTnVtYmVyLmlzRmluaXRlKHN0ZXAuc3VibWl0V2FpdE1zKSA/IHN0ZXAuc3VibWl0V2FpdE1zIDogMTIwMDtcclxuICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB3YWl0TXM7XHJcbiAgd2hpbGUgKERhdGUubm93KCkgPD0gZGVhZGxpbmUpIHtcclxuICAgIGNvbnN0IGNhbmRpZGF0ZSA9IGZpbmRCZXN0U3VibWl0QnV0dG9uKGFuY2hvciwgc3VibWl0U2VsZWN0b3JzKTtcclxuICAgIGlmIChjYW5kaWRhdGUpIHtcclxuICAgICAgYWN0aXZhdGVTdWJtaXRCdXR0b24oY2FuZGlkYXRlKTtcclxuICAgICAgaWYgKHN0ZXAuZW50ZXJGYWxsYmFja0FmdGVyQ2xpY2sgIT09IGZhbHNlICYmIGF3YWl0IHNob3VsZFRyeUtleWJvYXJkRmFsbGJhY2tBZnRlckNsaWNrKHN0ZXAsIHF1ZXJ5LCBhbmNob3IpKSB7XHJcbiAgICAgICAgY29uc3QgcmV0cnlDYW5kaWRhdGUgPSBmaW5kQmVzdFN1Ym1pdEJ1dHRvbihhbmNob3IsIHN1Ym1pdFNlbGVjdG9ycyk7XHJcbiAgICAgICAgaWYgKHJldHJ5Q2FuZGlkYXRlICYmIHJldHJ5Q2FuZGlkYXRlICE9PSBjYW5kaWRhdGUpIHtcclxuICAgICAgICAgIGFjdGl2YXRlU3VibWl0QnV0dG9uKHJldHJ5Q2FuZGlkYXRlKTtcclxuICAgICAgICAgIGF3YWl0IGRlbGF5KDEyMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGRpc3BhdGNoU3VibWl0S2V5cyhhbmNob3IpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgYXdhaXQgZGVsYXkoMjUpO1xyXG4gIH1cclxuXHJcbiAgLy8gRm9ybS1zdWJtaXQgZmFsbGJhY2suIFJpc2s6IGNoYXQucXdlbi5haSAvIGtpbWkuY29tIHdyYXAgdGhlIGNvbXBvc2VyXHJcbiAgLy8gaW4gYW4gZW1wdHkgPGZvcm0+IHdpdGggbm8gYWN0aW9uIGFuZCBubyByZWFsIHN1Ym1pdCBidXR0b24uIENhbGxpbmdcclxuICAvLyBmb3JtLnJlcXVlc3RTdWJtaXQoKS9zdWJtaXQoKSB3b3VsZCBuYXZpZ2F0ZSB0aGUgaWZyYW1lIHRvIGN1cnJlbnQgVVJMXHJcbiAgLy8gKEdFVCBzdWJtaXQpLCBmcmVlemluZyB0aGUgZnJhbWUuIE9ubHkgc3VibWl0IHdoZW4gdGhlIGZvcm0gaGFzIGEgcmVhbFxyXG4gIC8vIGFjdGlvbiBvciBhdCBsZWFzdCBvbmUgdXNhYmxlIHN1Ym1pdCBidXR0b24uXHJcbiAgY29uc3QgZm9ybSA9IHR5cGVvZiBhbmNob3IuY2xvc2VzdCA9PT0gXCJmdW5jdGlvblwiID8gYW5jaG9yLmNsb3Nlc3QoXCJmb3JtXCIpIDogbnVsbDtcclxuICBpZiAoZm9ybSAmJiBpc1NhZmVUb1N1Ym1pdEZvcm0oZm9ybSkpIHtcclxuICAgIGlmICh0eXBlb2YgZm9ybS5yZXF1ZXN0U3VibWl0ID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgZm9ybS5yZXF1ZXN0U3VibWl0KCk7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGVvZiBmb3JtLnN1Ym1pdCA9PT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICAgIGZvcm0uc3VibWl0KCk7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gTGFzdCByZXNvcnQ6IHN5bnRoZXRpYyBFbnRlci5cclxuICBkaXNwYXRjaFN1Ym1pdEtleXMoYW5jaG9yKTtcclxuICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpc3BhdGNoU3VibWl0S2V5cyhhbmNob3IpIHtcclxuICBjb25zdCB0YXJnZXRzID0gW2FuY2hvciwgZG9jdW1lbnQuYWN0aXZlRWxlbWVudCwgZG9jdW1lbnQuYm9keSwgZG9jdW1lbnRdLmZpbHRlcihCb29sZWFuKTtcclxuICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xyXG5cclxuICB0YXJnZXRzLmZvckVhY2goKHRhcmdldCkgPT4ge1xyXG4gICAgaWYgKHNlZW4uaGFzKHRhcmdldCkpIHJldHVybjtcclxuICAgIHNlZW4uYWRkKHRhcmdldCk7XHJcbiAgICBkaXNwYXRjaEtleWJvYXJkRXZlbnQodGFyZ2V0LCBcImtleWRvd25cIiwgXCJFbnRlclwiKTtcclxuICAgIGRpc3BhdGNoS2V5Ym9hcmRFdmVudCh0YXJnZXQsIFwia2V5cHJlc3NcIiwgXCJFbnRlclwiKTtcclxuICAgIGRpc3BhdGNoS2V5Ym9hcmRFdmVudCh0YXJnZXQsIFwia2V5dXBcIiwgXCJFbnRlclwiKTtcclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWN0aXZhdGVTdWJtaXRCdXR0b24oZWxlbWVudCkge1xyXG4gIHNhZmVGb2N1cyhlbGVtZW50KTtcclxuICBkaXNwYXRjaFBvaW50ZXJMaWtlRXZlbnQoZWxlbWVudCwgXCJwb2ludGVyZG93blwiKTtcclxuICBkaXNwYXRjaFBvaW50ZXJMaWtlRXZlbnQoZWxlbWVudCwgXCJtb3VzZWRvd25cIik7XHJcbiAgZGlzcGF0Y2hQb2ludGVyTGlrZUV2ZW50KGVsZW1lbnQsIFwicG9pbnRlcnVwXCIpO1xyXG4gIGRpc3BhdGNoUG9pbnRlckxpa2VFdmVudChlbGVtZW50LCBcIm1vdXNldXBcIik7XHJcbiAgaWYgKHR5cGVvZiBlbGVtZW50LmNsaWNrID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgIGVsZW1lbnQuY2xpY2soKTtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpc3BhdGNoUG9pbnRlckxpa2VFdmVudChlbGVtZW50LCB0eXBlKSB7XHJcbiAgY29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgY29uc3QgZXZlbnRJbml0ID0ge1xyXG4gICAgYnViYmxlczogdHJ1ZSxcclxuICAgIGNhbmNlbGFibGU6IHRydWUsXHJcbiAgICB2aWV3OiB3aW5kb3csXHJcbiAgICBidXR0b246IDAsXHJcbiAgICBidXR0b25zOiB0eXBlLmVuZHNXaXRoKFwiZG93blwiKSA/IDEgOiAwLFxyXG4gICAgY2xpZW50WDogcmVjdC5sZWZ0ICsgcmVjdC53aWR0aCAvIDIsXHJcbiAgICBjbGllbnRZOiByZWN0LnRvcCArIHJlY3QuaGVpZ2h0IC8gMixcclxuICB9O1xyXG4gIGNvbnN0IEV2ZW50Q3RvciA9IHR5cGUuc3RhcnRzV2l0aChcInBvaW50ZXJcIikgJiYgdHlwZW9mIFBvaW50ZXJFdmVudCA9PT0gXCJmdW5jdGlvblwiXHJcbiAgICA/IFBvaW50ZXJFdmVudFxyXG4gICAgOiBNb3VzZUV2ZW50O1xyXG4gIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnRDdG9yKHR5cGUsIGV2ZW50SW5pdCkpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzaG91bGRUcnlLZXlib2FyZEZhbGxiYWNrQWZ0ZXJDbGljayhzdGVwLCBxdWVyeSwgYW5jaG9yKSB7XHJcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhxdWVyeSB8fCBcIlwiKS50cmltKCk7XHJcbiAgaWYgKCF0ZXh0KSByZXR1cm4gZmFsc2U7XHJcblxyXG4gIGNvbnN0IHdhaXRNcyA9IE51bWJlci5pc0Zpbml0ZShzdGVwLnBvc3RDbGlja1ZlcmlmeU1zKSA/IHN0ZXAucG9zdENsaWNrVmVyaWZ5TXMgOiA5MDA7XHJcbiAgYXdhaXQgZGVsYXkod2FpdE1zKTtcclxuXHJcbiAgY29uc3QgY3VycmVudCA9IHJlYWRDdXJyZW50VmFsdWVOb3coc3RlcCwgYW5jaG9yKTtcclxuICByZXR1cm4gY3VycmVudC5pbmNsdWRlcyh0ZXh0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZEN1cnJlbnRWYWx1ZU5vdyhzdGVwLCBhbmNob3IpIHtcclxuICBjb25zdCBhbmNob3JUZXh0ID0gcmVhZEVsZW1lbnRWYWx1ZShhbmNob3IpO1xyXG4gIGlmIChhbmNob3JUZXh0KSByZXR1cm4gYW5jaG9yVGV4dDtcclxuXHJcbiAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBnZXRTZWxlY3RvcnMoc3RlcCkpIHtcclxuICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcclxuICAgIGNvbnN0IHZhbHVlID0gcmVhZEVsZW1lbnRWYWx1ZShlbGVtZW50KTtcclxuICAgIGlmICh2YWx1ZSkgcmV0dXJuIHZhbHVlO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIFwiXCI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRFbGVtZW50VmFsdWUoZWxlbWVudCkge1xyXG4gIGlmICghZWxlbWVudCkgcmV0dXJuIFwiXCI7XHJcbiAgaWYgKGlzVGV4dENvbnRyb2woZWxlbWVudCkpIHJldHVybiBTdHJpbmcoZWxlbWVudC52YWx1ZSB8fCBcIlwiKTtcclxuICByZXR1cm4gU3RyaW5nKGVsZW1lbnQudGV4dENvbnRlbnQgfHwgXCJcIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzU2FmZVRvU3VibWl0Rm9ybShmb3JtKSB7XHJcbiAgaWYgKCEoZm9ybSBpbnN0YW5jZW9mIEhUTUxGb3JtRWxlbWVudCkpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgY29uc3QgYWN0aW9uID0gKGZvcm0uZ2V0QXR0cmlidXRlKFwiYWN0aW9uXCIpIHx8IFwiXCIpLnRyaW0oKTtcclxuICBjb25zdCBjdXJyZW50VXJsID0gKHdpbmRvdy5sb2NhdGlvbi5ocmVmIHx8IFwiXCIpLnNwbGl0KFwiI1wiKVswXTtcclxuICBjb25zdCBhYnNvbHV0ZUFjdGlvbiA9ICgoKSA9PiB7XHJcbiAgICBpZiAoIWFjdGlvbikgcmV0dXJuIFwiXCI7XHJcbiAgICB0cnkge1xyXG4gICAgICByZXR1cm4gbmV3IFVSTChhY3Rpb24sIHdpbmRvdy5sb2NhdGlvbi5ocmVmKS5ocmVmLnNwbGl0KFwiI1wiKVswXTtcclxuICAgIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgICByZXR1cm4gXCJcIjtcclxuICAgIH1cclxuICB9KSgpO1xyXG5cclxuICBpZiAoYWN0aW9uICYmIGFic29sdXRlQWN0aW9uICYmIGFic29sdXRlQWN0aW9uICE9PSBjdXJyZW50VXJsKSByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgY29uc3Qgc3VibWl0QnV0dG9uID0gZm9ybS5xdWVyeVNlbGVjdG9yKFwiYnV0dG9uW3R5cGU9J3N1Ym1pdCddLCBpbnB1dFt0eXBlPSdzdWJtaXQnXVwiKTtcclxuICBpZiAoc3VibWl0QnV0dG9uICYmIGlzVXNhYmxlU3VibWl0QnV0dG9uKHN1Ym1pdEJ1dHRvbikpIHJldHVybiB0cnVlO1xyXG5cclxuICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGZpbmRFbGVtZW50KHN0ZXApIHtcclxuICBjb25zdCBzZWxlY3RvcnMgPSBnZXRTZWxlY3RvcnMoc3RlcCk7XHJcbiAgaWYgKHNlbGVjdG9ycy5sZW5ndGggPT09IDApIHRocm93IG5ldyBFcnJvcihcIue8uuWwkemAieaLqeWZqFwiKTtcclxuXHJcbiAgY29uc3QgdGltZW91dE1zID0gc3RlcC50aW1lb3V0IHx8IDYwMDA7XHJcbiAgY29uc3Qgc3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgd2hpbGUgKERhdGUubm93KCkgLSBzdGFydGVkQXQgPD0gdGltZW91dE1zKSB7XHJcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgIGlmIChlbGVtZW50KSByZXR1cm4gZWxlbWVudDtcclxuICAgIH1cclxuICAgIGF3YWl0IGRlbGF5KDI1KTtcclxuICB9XHJcblxyXG4gIHRocm93IG5ldyBFcnJvcihg5pyq5om+5Yiw5YWD57SgOiAke3NlbGVjdG9ycy5qb2luKFwiLCBcIil9YCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFNlbGVjdG9ycyhzdGVwKSB7XHJcbiAgaWYgKEFycmF5LmlzQXJyYXkoc3RlcC5zZWxlY3RvcnMpKSByZXR1cm4gc3RlcC5zZWxlY3RvcnMuZmlsdGVyKEJvb2xlYW4pO1xyXG4gIGlmIChBcnJheS5pc0FycmF5KHN0ZXAuc2VsZWN0b3IpKSByZXR1cm4gc3RlcC5zZWxlY3Rvci5maWx0ZXIoQm9vbGVhbik7XHJcbiAgcmV0dXJuIHN0ZXAuc2VsZWN0b3IgPyBbc3RlcC5zZWxlY3Rvcl0gOiBbXTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmluZEJlc3RTdWJtaXRCdXR0b24oYW5jaG9yLCBzZWxlY3RvcnMpIHtcclxuICBjb25zdCBzZWFyY2hSb290cyA9IFtdO1xyXG4gIGNvbnN0IG5lYXJieVJvb3QgPSB0eXBlb2YgYW5jaG9yLmNsb3Nlc3QgPT09IFwiZnVuY3Rpb25cIlxyXG4gICAgPyBhbmNob3IuY2xvc2VzdChcImZvcm0sIGZvb3RlciwgW3JvbGU9J2Zvcm0nXSwgW2NsYXNzKj0naW5wdXQnXSwgW2NsYXNzKj0nY29tcG9zZXInXSwgW2NsYXNzKj0nZm9vdGVyJ11cIilcclxuICAgIDogbnVsbDtcclxuXHJcbiAgaWYgKG5lYXJieVJvb3QpIHNlYXJjaFJvb3RzLnB1c2gobmVhcmJ5Um9vdCk7XHJcbiAgaWYgKGFuY2hvci5wYXJlbnRFbGVtZW50KSBzZWFyY2hSb290cy5wdXNoKGFuY2hvci5wYXJlbnRFbGVtZW50KTtcclxuICBzZWFyY2hSb290cy5wdXNoKGRvY3VtZW50KTtcclxuXHJcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcclxuICBjb25zdCBjYW5kaWRhdGVzID0gW107XHJcblxyXG4gIHNlYXJjaFJvb3RzLmZvckVhY2goKHJvb3QpID0+IHtcclxuICAgIHNlbGVjdG9ycy5mb3JFYWNoKChzZWxlY3RvcikgPT4ge1xyXG4gICAgICByb290LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmZvckVhY2goKGVsZW1lbnQpID0+IHtcclxuICAgICAgICBpZiAoc2Vlbi5oYXMoZWxlbWVudCkgfHwgIWlzVXNhYmxlU3VibWl0QnV0dG9uKGVsZW1lbnQpKSByZXR1cm47XHJcbiAgICAgICAgaWYgKGxvb2tzTGlrZU5vblN1Ym1pdENvbnRyb2woZWxlbWVudCkpIHJldHVybjtcclxuICAgICAgICBzZWVuLmFkZChlbGVtZW50KTtcclxuICAgICAgICBjYW5kaWRhdGVzLnB1c2goZWxlbWVudCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIGZpbmRIZXVyaXN0aWNTdWJtaXRCdXR0b24oYW5jaG9yKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGFuY2hvclJlY3QgPSBhbmNob3IuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgY29uc3Qgc2VuZExpa2UgPSBjYW5kaWRhdGVzLmZpbHRlcihsb29rc0xpa2VTdWJtaXRDb250cm9sKTtcclxuICBjb25zdCBwb29sID0gc2VuZExpa2UubGVuZ3RoID4gMCA/IHNlbmRMaWtlIDogY2FuZGlkYXRlcztcclxuICBwb29sLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiB7XHJcbiAgICBjb25zdCBsZWZ0UmVjdCA9IGxlZnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCByaWdodFJlY3QgPSByaWdodC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGNvbnN0IGxlZnRTY29yZSA9IE1hdGguYWJzKGxlZnRSZWN0LnJpZ2h0IC0gYW5jaG9yUmVjdC5yaWdodCkgKyBNYXRoLmFicyhsZWZ0UmVjdC5ib3R0b20gLSBhbmNob3JSZWN0LmJvdHRvbSk7XHJcbiAgICBjb25zdCByaWdodFNjb3JlID0gTWF0aC5hYnMocmlnaHRSZWN0LnJpZ2h0IC0gYW5jaG9yUmVjdC5yaWdodCkgKyBNYXRoLmFicyhyaWdodFJlY3QuYm90dG9tIC0gYW5jaG9yUmVjdC5ib3R0b20pO1xyXG4gICAgcmV0dXJuIGxlZnRTY29yZSAtIHJpZ2h0U2NvcmU7XHJcbiAgfSk7XHJcblxyXG4gIHJldHVybiBwb29sWzBdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kSGV1cmlzdGljU3VibWl0QnV0dG9uKGFuY2hvcikge1xyXG4gIGNvbnN0IHJvb3QgPSB0eXBlb2YgYW5jaG9yLmNsb3Nlc3QgPT09IFwiZnVuY3Rpb25cIlxyXG4gICAgPyBhbmNob3IuY2xvc2VzdChcImZvcm0sIGZvb3RlciwgW3JvbGU9J2Zvcm0nXSwgW2NsYXNzKj0naW5wdXQnXSwgW2NsYXNzKj0nY29tcG9zZXInXSwgW2NsYXNzKj0nZm9vdGVyJ10sIFtjbGFzcyo9J3NlbmRlciddLCBbY2xhc3MqPSdjaGF0J11cIilcclxuICAgIDogbnVsbDtcclxuICBjb25zdCBzZWFyY2hSb290ID0gcm9vdCB8fCBkb2N1bWVudDtcclxuICBjb25zdCBhbmNob3JSZWN0ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXTtcclxuXHJcbiAgc2VhcmNoUm9vdFxyXG4gICAgLnF1ZXJ5U2VsZWN0b3JBbGwoXCJidXR0b24sIFtyb2xlPSdidXR0b24nXSwgW3RhYmluZGV4PScwJ11cIilcclxuICAgIC5mb3JFYWNoKChlbGVtZW50KSA9PiB7XHJcbiAgICAgIGlmICghKGVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpIHJldHVybjtcclxuICAgICAgaWYgKGVsZW1lbnQgPT09IGFuY2hvciB8fCBlbGVtZW50LmNvbnRhaW5zKGFuY2hvcikgfHwgIWlzVXNhYmxlU3VibWl0QnV0dG9uKGVsZW1lbnQpKSByZXR1cm47XHJcbiAgICAgIGlmIChlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoXCJ0ZXh0YXJlYSwgaW5wdXQsIFtjb250ZW50ZWRpdGFibGU9J3RydWUnXVwiKSkgcmV0dXJuO1xyXG4gICAgICBpZiAobG9va3NMaWtlTm9uU3VibWl0Q29udHJvbChlbGVtZW50KSkgcmV0dXJuO1xyXG5cclxuICAgICAgY29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgIGNvbnN0IGlzTmVhckNvbXBvc2VyID1cclxuICAgICAgICByZWN0LnRvcCA+PSBhbmNob3JSZWN0LnRvcCAtIDgwICYmXHJcbiAgICAgICAgcmVjdC5ib3R0b20gPD0gYW5jaG9yUmVjdC5ib3R0b20gKyAxMDAgJiZcclxuICAgICAgICByZWN0LmxlZnQgPj0gYW5jaG9yUmVjdC5sZWZ0IC0gNDA7XHJcbiAgICAgIGlmICghaXNOZWFyQ29tcG9zZXIpIHJldHVybjtcclxuXHJcbiAgICAgIGNhbmRpZGF0ZXMucHVzaChlbGVtZW50KTtcclxuICAgIH0pO1xyXG5cclxuICBpZiAoY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG5cclxuICBjb25zdCBzZW5kTGlrZSA9IGNhbmRpZGF0ZXMuZmlsdGVyKGxvb2tzTGlrZVN1Ym1pdENvbnRyb2wpO1xyXG4gIGNvbnN0IHBvb2wgPSBzZW5kTGlrZS5sZW5ndGggPiAwID8gc2VuZExpa2UgOiBjYW5kaWRhdGVzO1xyXG4gIHBvb2wuc29ydCgobGVmdCwgcmlnaHQpID0+IHtcclxuICAgIGNvbnN0IGxlZnRSZWN0ID0gbGVmdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGNvbnN0IHJpZ2h0UmVjdCA9IHJpZ2h0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgY29uc3QgbGVmdFNjb3JlID0gTWF0aC5hYnMobGVmdFJlY3QucmlnaHQgLSBhbmNob3JSZWN0LnJpZ2h0KSArIE1hdGguYWJzKGxlZnRSZWN0LmJvdHRvbSAtIGFuY2hvclJlY3QuYm90dG9tKTtcclxuICAgIGNvbnN0IHJpZ2h0U2NvcmUgPSBNYXRoLmFicyhyaWdodFJlY3QucmlnaHQgLSBhbmNob3JSZWN0LnJpZ2h0KSArIE1hdGguYWJzKHJpZ2h0UmVjdC5ib3R0b20gLSBhbmNob3JSZWN0LmJvdHRvbSk7XHJcbiAgICByZXR1cm4gbGVmdFNjb3JlIC0gcmlnaHRTY29yZTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHBvb2xbMF07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvb2tzTGlrZVN1Ym1pdENvbnRyb2woZWxlbWVudCkge1xyXG4gIGNvbnN0IGxhYmVsID0gZ2V0Q29udHJvbFNpZ25hdHVyZShlbGVtZW50KTtcclxuICByZXR1cm4gL+WPkemAgXzmj5DkuqR8c2VuZHxzdWJtaXR8YXJyb3dbLV8gXT91cHxwYXBlclstXyBdP3BsYW5lfHNlbmQtYnV0dG9ufGJ0bi1zZW5kfGljb24tc2VuZC9pLnRlc3QobGFiZWwpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBsb29rc0xpa2VOb25TdWJtaXRDb250cm9sKGVsZW1lbnQpIHtcclxuICBjb25zdCBsYWJlbCA9IGdldENvbnRyb2xTaWduYXR1cmUoZWxlbWVudCk7XHJcbiAgcmV0dXJuIC/pmYTku7Z85LiK5LygfOa3u+WKoHzmm7TlpJp86K+t6Z+zfOm6puWFi+mjjnzlgZzmraJ85Y+W5raIfOaooeWei3zlt6Xlhbd8YXR0YWNofHVwbG9hZHxhZGR8cGx1c3xtb3JlfHZvaWNlfG1pY3xtaWNyb3Bob25lfHN0b3B8Y2FuY2VsfG1vZGVsfHRvb2x8ZmlsZXxpbWFnZXxwaG90b3xjYW1lcmEvaS50ZXN0KGxhYmVsKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Q29udHJvbFNpZ25hdHVyZShlbGVtZW50KSB7XHJcbiAgY29uc3QgYXR0cnMgPSBbXHJcbiAgICBlbGVtZW50LmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiksXHJcbiAgICBlbGVtZW50LmdldEF0dHJpYnV0ZShcInRpdGxlXCIpLFxyXG4gICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJkYXRhLXRlc3RpZFwiKSxcclxuICAgIGVsZW1lbnQuZ2V0QXR0cmlidXRlKFwiZGF0YS10ZXN0LWlkXCIpLFxyXG4gICAgZWxlbWVudC5nZXRBdHRyaWJ1dGUoXCJjbGFzc1wiKSxcclxuICAgIGVsZW1lbnQudGV4dENvbnRlbnQsXHJcbiAgXTtcclxuICBlbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoXCJzdmcsIHBhdGgsIHVzZSwgbWF0LWljb24sIGlcIikuZm9yRWFjaCgoY2hpbGQpID0+IHtcclxuICAgIGF0dHJzLnB1c2goXHJcbiAgICAgIGNoaWxkLmdldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiksXHJcbiAgICAgIGNoaWxkLmdldEF0dHJpYnV0ZShcImRhdGEtaWNvblwiKSxcclxuICAgICAgY2hpbGQuZ2V0QXR0cmlidXRlKFwiY2xhc3NcIiksXHJcbiAgICAgIGNoaWxkLmdldEF0dHJpYnV0ZShcImRcIiksXHJcbiAgICAgIGNoaWxkLnRleHRDb250ZW50XHJcbiAgICApO1xyXG4gIH0pO1xyXG4gIHJldHVybiBhdHRycy5maWx0ZXIoQm9vbGVhbikuam9pbihcIiBcIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVXNhYmxlU3VibWl0QnV0dG9uKGVsZW1lbnQpIHtcclxuICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpKSByZXR1cm4gZmFsc2U7XHJcbiAgaWYgKGVsZW1lbnQuaGFzQXR0cmlidXRlKFwiZGlzYWJsZWRcIilcclxuICAgIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKFwiYXJpYS1kaXNhYmxlZFwiKSA9PT0gXCJ0cnVlXCJcclxuICAgIHx8IGVsZW1lbnQuZ2V0QXR0cmlidXRlKFwiZGF0YS1kaXNhYmxlZFwiKSA9PT0gXCJ0cnVlXCIpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIC8vIEtpbWkgKC5zZW5kLWJ1dHRvbi1jb250YWluZXIuZGlzYWJsZWQpIC8g6LGG5YyFIGV0Yy4gZXhwcmVzcyBcImRpc2FibGVkXCIgdmlhXHJcbiAgLy8gY2xhc3MgbmFtZXMgaW5zdGVhZCBvZiB0aGUgYXR0cmlidXRlLiBXaXRob3V0IGZpbHRlcmluZyB3ZSdkIGNsaWNrIGEgRElWXHJcbiAgLy8gc3RpbGwgaW4gZGlzYWJsZWQgc3RhdGUgYW5kIHRoZSBzaXRlIHdvdWxkIHNpbGVudGx5IGlnbm9yZSBpdC5cclxuICBpZiAoaGFzRGlzYWJsZWRTdGF0ZShlbGVtZW50KSkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgaWYgKHJlY3Qud2lkdGggPD0gMCB8fCByZWN0LmhlaWdodCA8PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gIGNvbnN0IHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XHJcbiAgcmV0dXJuIHN0eWxlLnZpc2liaWxpdHkgIT09IFwiaGlkZGVuXCJcclxuICAgICYmIHN0eWxlLmRpc3BsYXkgIT09IFwibm9uZVwiXHJcbiAgICAmJiBzdHlsZS5wb2ludGVyRXZlbnRzICE9PSBcIm5vbmVcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gaGFzRGlzYWJsZWRTdGF0ZShlbGVtZW50KSB7XHJcbiAgY29uc3QgZGlzYWJsZWRDbGFzc1BhdHRlcm4gPSAvKF58XFxzfFstX10pKGRpc2FibGVkfGlzLWRpc2FibGVkfGJ0bi1kaXNhYmxlZHxidXR0b24tZGlzYWJsZWR8bWF0LW1kYy1idXR0b24tZGlzYWJsZWR8c2VuZC1idXR0b24tY29udGFpbmVyLS1kaXNhYmxlZCkoXFxzfCR8Wy1fXSkvaTtcclxuICBsZXQgY3VycmVudCA9IGVsZW1lbnQ7XHJcblxyXG4gIHdoaWxlIChjdXJyZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHR5cGVvZiBjdXJyZW50LmNsYXNzTmFtZSA9PT0gXCJzdHJpbmdcIiA/IGN1cnJlbnQuY2xhc3NOYW1lIDogXCJcIjtcclxuICAgIGlmIChkaXNhYmxlZENsYXNzUGF0dGVybi50ZXN0KGNsYXNzTmFtZSlcclxuICAgICAgfHwgY3VycmVudC5nZXRBdHRyaWJ1dGUoXCJhcmlhLWRpc2FibGVkXCIpID09PSBcInRydWVcIlxyXG4gICAgICB8fCBjdXJyZW50LmdldEF0dHJpYnV0ZShcImRhdGEtZGlzYWJsZWRcIikgPT09IFwidHJ1ZVwiKSB7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChjdXJyZW50LnRhZ05hbWUgPT09IFwiRk9STVwiIHx8IGN1cnJlbnQuZ2V0QXR0cmlidXRlKFwicm9sZVwiKSA9PT0gXCJmb3JtXCIpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgY3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudDtcclxuICB9XHJcblxyXG4gIHJldHVybiBmYWxzZTtcclxufVxyXG4iLCAiaW1wb3J0IHsgRVhURU5TSU9OX09SSUdJTiB9IGZyb20gXCIuL2NvbnN0YW50cy5qc1wiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZUV4dHJhY3RSZXF1ZXN0KG1lc3NhZ2UpIHtcclxuICAvLyBSZXZpZXcgbm90ZSAoQ1dTL0VkZ2UgQWRkLW9ucyk6IGV4dHJhY3Rpb24gaXMgb25seSB1c2VkIGZvciB1c2VyLXZpc2libGVcclxuICAvLyBleHBvcnQvc3VtbWFyeSBmZWF0dXJlcyB0cmlnZ2VyZWQgZnJvbSB0aGUgZXh0ZW5zaW9uIHBhZ2UuIEV4dHJhY3RlZCB0ZXh0XHJcbiAgLy8gaXMgcG9zdE1lc3NhZ2UnZCBiYWNrIHRvIHRoZSBleHRlbnNpb24gY29tcGFyZSBwYWdlIG9ubHk7IG5vIHVwbG9hZC5cclxuICBjb25zdCBjb250ZW50ID0gZXh0cmFjdFJlYWRhYmxlUGFnZVRleHQoKTtcclxuICBjb25zdCB0dXJucyA9IGV4dHJhY3RDb252ZXJzYXRpb25UdXJucygpO1xyXG4gIGNvbnN0IHRhcmdldE9yaWdpbiA9IEVYVEVOU0lPTl9PUklHSU4gfHwgXCIqXCI7XHJcbiAgd2luZG93LnBhcmVudC5wb3N0TWVzc2FnZShcclxuICAgIHtcclxuICAgICAgdHlwZTogXCJRU0hPVF9FWFRSQUNUX1JFU1VMVFwiLFxyXG4gICAgICByZXF1ZXN0SWQ6IG1lc3NhZ2UucmVxdWVzdElkLFxyXG4gICAgICBzaXRlSWQ6IG1lc3NhZ2Uuc2l0ZT8uaWQsXHJcbiAgICAgIGNvbnRlbnQsXHJcbiAgICAgIHR1cm5zLFxyXG4gICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxyXG4gICAgfSxcclxuICAgIHRhcmdldE9yaWdpblxyXG4gICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4dHJhY3RSZWFkYWJsZVBhZ2VUZXh0KCkge1xyXG4gIGNvbnN0IGhvc3QgPSB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpO1xyXG4gIGNvbnN0IHNpdGVUZXh0ID0gZXh0cmFjdEJ5U2l0ZVNlbGVjdG9ycyhob3N0KTtcclxuICBpZiAoc2l0ZVRleHQgJiYgc2l0ZVRleHQubGVuZ3RoID4gNDApIHtcclxuICAgIHJldHVybiBzaXRlVGV4dDtcclxuICB9XHJcbiAgcmV0dXJuIGV4dHJhY3RXaXRoR2VuZXJpY1NlbGVjdG9ycygpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRTaXRlQ29udGVudENvbmZpZyhob3N0KSB7XHJcbiAgY29uc3QgY29uZmlncyA9IHtcclxuICAgIFwiY2hhdGdwdC5jb21cIjoge1xyXG4gICAgICBjb250YWluZXJzOiBbXCJbZGF0YS1tZXNzYWdlLWF1dGhvci1yb2xlPSdhc3Npc3RhbnQnXVwiXSxcclxuICAgICAgY29udGVudDogW1wiLm1hcmtkb3duLnByb3NlXCIsIFwiLnByb3NlXCIsIFwiW2NsYXNzKj0nbWFya2Rvd24nXVwiLCBcImFydGljbGVcIl0sXHJcbiAgICB9LFxyXG4gICAgXCJjaGF0Lm9wZW5haS5jb21cIjoge1xyXG4gICAgICBjb250YWluZXJzOiBbXCJbZGF0YS1tZXNzYWdlLWF1dGhvci1yb2xlPSdhc3Npc3RhbnQnXVwiXSxcclxuICAgICAgY29udGVudDogW1wiLm1hcmtkb3duLnByb3NlXCIsIFwiLnByb3NlXCJdLFxyXG4gICAgfSxcclxuICAgIFwiY2hhdC5kZWVwc2Vlay5jb21cIjoge1xyXG4gICAgICBjb250YWluZXJzOiBbXCJbY2xhc3MqPSdkcy1tZXNzYWdlLWJ1YmJsZSddW2NsYXNzKj0nYXNzaXN0YW50J11cIiwgXCJbY2xhc3MqPSdtZXNzYWdlJ11bY2xhc3MqPSdhc3Npc3RhbnQnXVwiXSxcclxuICAgICAgY29udGVudDogW1wiW2NsYXNzKj0nZHMtbWFya2Rvd24nXVwiLCBcIltjbGFzcyo9J21hcmtkb3duJ11cIiwgXCJbY2xhc3MqPSdjaGF0LW1lc3NhZ2UtY29udGVudCddXCJdLFxyXG4gICAgfSxcclxuICAgIFwia2ltaS5tb29uc2hvdC5jblwiOiB7XHJcbiAgICAgIGNvbnRhaW5lcnM6IFtcIltjbGFzcyo9J3NlZ21lbnQtaXRlbSddXCIsIFwiW2NsYXNzKj0nbWVzc2FnZSddW2NsYXNzKj0nYWknXVwiLCBcIltjbGFzcyo9J2J1YmJsZSddW2NsYXNzKj0nYXNzaXN0YW50J11cIl0sXHJcbiAgICAgIGNvbnRlbnQ6IFtcIltjbGFzcyo9J21hcmtkb3duLWNvbnRlbnQnXVwiLCBcIltjbGFzcyo9J2NvbnRlbnQnXVwiLCBcIltjbGFzcyo9J3RleHQnXVwiXSxcclxuICAgIH0sXHJcbiAgICBcImtpbWkuY29tXCI6IHtcclxuICAgICAgY29udGFpbmVyczogW1wiW2NsYXNzKj0nc2VnbWVudC1pdGVtJ11cIiwgXCJbY2xhc3MqPSdtZXNzYWdlJ11bY2xhc3MqPSdhaSddXCIsIFwiW2NsYXNzKj0nYnViYmxlJ11bY2xhc3MqPSdhc3Npc3RhbnQnXVwiLCBcIltjbGFzcyo9J2NoYXQtY29udGVudC1pdGVtJ11cIl0sXHJcbiAgICAgIGNvbnRlbnQ6IFtcIltjbGFzcyo9J21hcmtkb3duLWNvbnRlbnQnXVwiLCBcIltjbGFzcyo9J2NvbnRlbnQnXVwiLCBcIltjbGFzcyo9J3RleHQnXVwiLCBcIltjbGFzcyo9J21hcmtkb3duJ11cIl0sXHJcbiAgICB9LFxyXG4gICAgXCJ0b25neWkuYWxpeXVuLmNvbVwiOiB7XHJcbiAgICAgIGNvbnRhaW5lcnM6IFtcIltjbGFzcyo9J2Fuc3dlci1tZXNzYWdlJ11cIiwgXCJbY2xhc3MqPSdhZ2VudC1jaGF0X19hbnN3ZXInXVwiLCBcIltjbGFzcyo9J2NoYXQtYnViYmxlJ11cIl0sXHJcbiAgICAgIGNvbnRlbnQ6IFtcIltjbGFzcyo9J21hcmtkb3duJ11cIiwgXCJbY2xhc3MqPSdhbnN3ZXItdGV4dCddXCIsIFwiW2NsYXNzKj0nY29udGVudCddXCJdLFxyXG4gICAgfSxcclxuICAgIFwiZG91YmFvLmNvbVwiOiB7XHJcbiAgICAgIGNvbnRhaW5lcnM6IFtcIltkYXRhLWF1dGhvci10eXBlPScyJ11cIiwgXCJbY2xhc3MqPSdjaGF0LXJlc3BvbnNlJ11cIiwgXCJbY2xhc3MqPSdhc3Npc3RhbnQtbWVzc2FnZSddXCJdLFxyXG4gICAgICBjb250ZW50OiBbXCJbY2xhc3MqPSdtYXJrZG93biddXCIsIFwiW2NsYXNzKj0nbWVzc2FnZS10ZXh0J11cIiwgXCJbY2xhc3MqPSdjb250ZW50J11cIl0sXHJcbiAgICB9LFxyXG4gICAgXCJnZW1pbmkuZ29vZ2xlLmNvbVwiOiB7XHJcbiAgICAgIGNvbnRhaW5lcnM6IFtcIm1vZGVsLXJlc3BvbnNlXCIsIFwibWVzc2FnZS1jb250ZW50W2NsYXNzKj0nbW9kZWwnXVwiLCBcIltjbGFzcyo9J3Jlc3BvbnNlLWNvbnRhaW5lciddXCJdLFxyXG4gICAgICBjb250ZW50OiBbXCIubWFya2Rvd25cIiwgXCJbY2xhc3MqPSdyZXNwb25zZS1jb250ZW50J11cIiwgXCJbY2xhc3MqPSdtb2RlbC1yZXNwb25zZS10ZXh0J11cIl0sXHJcbiAgICB9LFxyXG4gICAgXCJjaGF0Z2xtLmNuXCI6IHtcclxuICAgICAgY29udGFpbmVyczogW1wiW2NsYXNzKj0nY2hhdC1tc2ctLWFpJ11cIiwgXCJbY2xhc3MqPSdhc3Npc3RhbnQtbWVzc2FnZSddXCJdLFxyXG4gICAgICBjb250ZW50OiBbXCJbY2xhc3MqPSdjb250ZW50J11cIiwgXCJbY2xhc3MqPSdtYXJrZG93biddXCIsIFwiW2NsYXNzKj0ndGV4dCddXCJdLFxyXG4gICAgfSxcclxuICAgIFwieXVhbmJhby50ZW5jZW50LmNvbVwiOiB7XHJcbiAgICAgIGNvbnRhaW5lcnM6IFtcIltjbGFzcyo9J2FnZW50LWNoYXRfX21lc3NhZ2UtLWFpJ11cIiwgXCJbY2xhc3MqPSdhaS1tZXNzYWdlJ11cIl0sXHJcbiAgICAgIGNvbnRlbnQ6IFtcIltjbGFzcyo9J2h5cGVyLXRleHQnXVwiLCBcIltjbGFzcyo9J21hcmtkb3duJ11cIiwgXCJbY2xhc3MqPSdjb250ZW50J11cIl0sXHJcbiAgICB9LFxyXG4gIH07XHJcblxyXG4gIGZvciAoY29uc3QgW2RvbWFpbiwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhjb25maWdzKSkge1xyXG4gICAgaWYgKGhvc3QgPT09IGRvbWFpbiB8fCBob3N0LmVuZHNXaXRoKFwiLlwiICsgZG9tYWluKSkgcmV0dXJuIGNvbmZpZztcclxuICB9XHJcbiAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRvbVRvTWFya2Rvd24oZWxlbWVudCkge1xyXG4gIGZ1bmN0aW9uIGNvbnZlcnROb2RlKG5vZGUpIHtcclxuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkgcmV0dXJuIG5vZGUudGV4dENvbnRlbnQgfHwgXCJcIjtcclxuICAgIGlmIChub2RlLm5vZGVUeXBlICE9PSBOb2RlLkVMRU1FTlRfTk9ERSkgcmV0dXJuIFwiXCI7XHJcblxyXG4gICAgY29uc3QgdGFnID0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBpZiAoW1wic2NyaXB0XCIsIFwic3R5bGVcIiwgXCJub3NjcmlwdFwiLCBcImJ1dHRvblwiLCBcInN2Z1wiLCBcImFzaWRlXCJdLmluY2x1ZGVzKHRhZykpIHJldHVybiBcIlwiO1xyXG5cclxuICAgIGNvbnN0IGNoaWxkcmVuID0gKCkgPT4gQXJyYXkuZnJvbShub2RlLmNoaWxkTm9kZXMpLm1hcChjb252ZXJ0Tm9kZSkuam9pbihcIlwiKTtcclxuXHJcbiAgICBzd2l0Y2ggKHRhZykge1xyXG4gICAgICBjYXNlIFwiaDFcIjogcmV0dXJuIGBcXG5cXG4jICR7Y2hpbGRyZW4oKS50cmltKCl9XFxuXFxuYDtcclxuICAgICAgY2FzZSBcImgyXCI6IHJldHVybiBgXFxuXFxuIyMgJHtjaGlsZHJlbigpLnRyaW0oKX1cXG5cXG5gO1xyXG4gICAgICBjYXNlIFwiaDNcIjogcmV0dXJuIGBcXG5cXG4jIyMgJHtjaGlsZHJlbigpLnRyaW0oKX1cXG5cXG5gO1xyXG4gICAgICBjYXNlIFwiaDRcIjogcmV0dXJuIGBcXG5cXG4jIyMjICR7Y2hpbGRyZW4oKS50cmltKCl9XFxuXFxuYDtcclxuICAgICAgY2FzZSBcImg1XCI6IHJldHVybiBgXFxuXFxuIyMjIyMgJHtjaGlsZHJlbigpLnRyaW0oKX1cXG5cXG5gO1xyXG4gICAgICBjYXNlIFwiaDZcIjogcmV0dXJuIGBcXG5cXG4jIyMjIyMgJHtjaGlsZHJlbigpLnRyaW0oKX1cXG5cXG5gO1xyXG4gICAgICBjYXNlIFwicFwiOiB7XHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSBjaGlsZHJlbigpLnRyaW0oKTtcclxuICAgICAgICByZXR1cm4gaW5uZXIgPyBgXFxuXFxuJHtpbm5lcn1cXG5cXG5gIDogXCJcIjtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwiYnJcIjogcmV0dXJuIFwiICBcXG5cIjtcclxuICAgICAgY2FzZSBcImhyXCI6IHJldHVybiBcIlxcblxcbi0tLVxcblxcblwiO1xyXG4gICAgICBjYXNlIFwic3Ryb25nXCI6XHJcbiAgICAgIGNhc2UgXCJiXCI6IHtcclxuICAgICAgICBjb25zdCBpbm5lciA9IGNoaWxkcmVuKCkudHJpbSgpO1xyXG4gICAgICAgIHJldHVybiBpbm5lciA/IGAqKiR7aW5uZXJ9KipgIDogXCJcIjtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwiZW1cIjpcclxuICAgICAgY2FzZSBcImlcIjoge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gY2hpbGRyZW4oKS50cmltKCk7XHJcbiAgICAgICAgcmV0dXJuIGlubmVyID8gYCoke2lubmVyfSpgIDogXCJcIjtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwiZGVsXCI6XHJcbiAgICAgIGNhc2UgXCJzXCI6IHtcclxuICAgICAgICBjb25zdCBpbm5lciA9IGNoaWxkcmVuKCkudHJpbSgpO1xyXG4gICAgICAgIHJldHVybiBpbm5lciA/IGB+fiR7aW5uZXJ9fn5gIDogXCJcIjtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwiY29kZVwiOiB7XHJcbiAgICAgICAgaWYgKG5vZGUucGFyZW50RWxlbWVudCAmJiBub2RlLnBhcmVudEVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSBcInByZVwiKSB7XHJcbiAgICAgICAgICByZXR1cm4gbm9kZS50ZXh0Q29udGVudCB8fCBcIlwiO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBpbm5lciA9IGNoaWxkcmVuKCkudHJpbSgpO1xyXG4gICAgICAgIHJldHVybiBpbm5lciA/IGBcXGAke2lubmVyfVxcYGAgOiBcIlwiO1xyXG4gICAgICB9XHJcbiAgICAgIGNhc2UgXCJwcmVcIjoge1xyXG4gICAgICAgIGNvbnN0IGNvZGVFbCA9IG5vZGUucXVlcnlTZWxlY3RvcihcImNvZGVcIik7XHJcbiAgICAgICAgbGV0IGxhbmcgPSBcIlwiO1xyXG4gICAgICAgIGlmIChjb2RlRWwpIHtcclxuICAgICAgICAgIGNvbnN0IGNsYXNzTWF0Y2ggPSBjb2RlRWwuY2xhc3NOYW1lLm1hdGNoKC9sYW5ndWFnZS0oXFx3KykvKTtcclxuICAgICAgICAgIGlmIChjbGFzc01hdGNoKSBsYW5nID0gY2xhc3NNYXRjaFsxXTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgY29udGVudCA9IChjb2RlRWwgfHwgbm9kZSkudGV4dENvbnRlbnQgfHwgXCJcIjtcclxuICAgICAgICByZXR1cm4gYFxcblxcblxcYFxcYFxcYCR7bGFuZ31cXG4ke2NvbnRlbnQudHJpbSgpfVxcblxcYFxcYFxcYFxcblxcbmA7XHJcbiAgICAgIH1cclxuICAgICAgY2FzZSBcImJsb2NrcXVvdGVcIjoge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gY2hpbGRyZW4oKS50cmltKCkuc3BsaXQoXCJcXG5cIikubWFwKChsaW5lKSA9PiBgPiAke2xpbmV9YCkuam9pbihcIlxcblwiKTtcclxuICAgICAgICByZXR1cm4gYFxcblxcbiR7aW5uZXJ9XFxuXFxuYDtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwidWxcIjoge1xyXG4gICAgICAgIGNvbnN0IGxpRWxzID0gQXJyYXkuZnJvbShub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXCJsaVwiKSkuZmlsdGVyKFxyXG4gICAgICAgICAgKGVsKSA9PiBlbC5jbG9zZXN0KFwidWxcIikgPT09IG5vZGUgfHwgZWwuY2xvc2VzdChcIm9sXCIpID09PSBub2RlXHJcbiAgICAgICAgKTtcclxuICAgICAgICBjb25zdCBpdGVtcyA9IGxpRWxzXHJcbiAgICAgICAgICAubWFwKChsaSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gY29udmVydE5vZGUobGkpLnRyaW0oKTtcclxuICAgICAgICAgICAgcmV0dXJuIGAtICR7dGV4dC5yZXBsYWNlKC9cXG4vZywgXCJcXG4gIFwiKX1gO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC5qb2luKFwiXFxuXCIpO1xyXG4gICAgICAgIHJldHVybiBpdGVtcyA/IGBcXG5cXG4ke2l0ZW1zfVxcblxcbmAgOiBcIlwiO1xyXG4gICAgICB9XHJcbiAgICAgIGNhc2UgXCJvbFwiOiB7XHJcbiAgICAgICAgY29uc3QgbGlFbHMgPSBBcnJheS5mcm9tKG5vZGUucXVlcnlTZWxlY3RvckFsbChcImxpXCIpKS5maWx0ZXIoXHJcbiAgICAgICAgICAoZWwpID0+IGVsLmNsb3Nlc3QoXCJ1bFwiKSA9PT0gbm9kZSB8fCBlbC5jbG9zZXN0KFwib2xcIikgPT09IG5vZGVcclxuICAgICAgICApO1xyXG4gICAgICAgIGNvbnN0IGl0ZW1zID0gbGlFbHNcclxuICAgICAgICAgIC5tYXAoKGxpLCBpZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dCA9IGNvbnZlcnROb2RlKGxpKS50cmltKCk7XHJcbiAgICAgICAgICAgIHJldHVybiBgJHtpZHggKyAxfS4gJHt0ZXh0LnJlcGxhY2UoL1xcbi9nLCBcIlxcbiAgIFwiKX1gO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC5qb2luKFwiXFxuXCIpO1xyXG4gICAgICAgIHJldHVybiBpdGVtcyA/IGBcXG5cXG4ke2l0ZW1zfVxcblxcbmAgOiBcIlwiO1xyXG4gICAgICB9XHJcbiAgICAgIGNhc2UgXCJsaVwiOiB7XHJcbiAgICAgICAgY29uc3QgaW5uZXIgPSBjaGlsZHJlbigpLnRyaW0oKTtcclxuICAgICAgICByZXR1cm4gaW5uZXIucmVwbGFjZSgvXFxuezMsfS9nLCBcIlxcblxcblwiKTtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwiZGl2XCI6XHJcbiAgICAgIGNhc2UgXCJzZWN0aW9uXCI6XHJcbiAgICAgIGNhc2UgXCJhcnRpY2xlXCI6XHJcbiAgICAgIGNhc2UgXCJmaWd1cmVcIjpcclxuICAgICAgY2FzZSBcImZpZ2NhcHRpb25cIjpcclxuICAgICAgY2FzZSBcImRldGFpbHNcIjpcclxuICAgICAgY2FzZSBcInN1bW1hcnlcIjoge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gY2hpbGRyZW4oKS50cmltKCk7XHJcbiAgICAgICAgcmV0dXJuIGlubmVyID8gYFxcblxcbiR7aW5uZXJ9XFxuXFxuYCA6IFwiXCI7XHJcbiAgICAgIH1cclxuICAgICAgY2FzZSBcImFcIjoge1xyXG4gICAgICAgIGNvbnN0IGhyZWYgPSAobm9kZS5nZXRBdHRyaWJ1dGUoXCJocmVmXCIpIHx8IFwiXCIpLnRyaW0oKTtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gY2hpbGRyZW4oKS50cmltKCk7XHJcbiAgICAgICAgaWYgKCF0ZXh0KSByZXR1cm4gXCJcIjtcclxuICAgICAgICBpZiAoIWhyZWYgfHwgaHJlZi5zdGFydHNXaXRoKFwiI1wiKSB8fCBocmVmID09PSB0ZXh0KSByZXR1cm4gdGV4dDtcclxuICAgICAgICByZXR1cm4gYFske3RleHR9XSgke2hyZWZ9KWA7XHJcbiAgICAgIH1cclxuICAgICAgY2FzZSBcImltZ1wiOiB7XHJcbiAgICAgICAgY29uc3QgYWx0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJhbHRcIikgfHwgXCJcIjtcclxuICAgICAgICByZXR1cm4gYWx0ID8gYFvlm77niYc6ICR7YWx0fV1gIDogXCJcIjtcclxuICAgICAgfVxyXG4gICAgICBjYXNlIFwidGFibGVcIjogcmV0dXJuIGNvbnZlcnRUYWJsZShub2RlKTtcclxuICAgICAgZGVmYXVsdDogcmV0dXJuIGNoaWxkcmVuKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb252ZXJ0VGFibGUodGFibGVFbCkge1xyXG4gICAgY29uc3QgYWxsUm93cyA9IEFycmF5LmZyb20odGFibGVFbC5xdWVyeVNlbGVjdG9yQWxsKFwidHJcIikpO1xyXG4gICAgaWYgKCFhbGxSb3dzLmxlbmd0aCkgcmV0dXJuIFwiXCI7XHJcbiAgICBjb25zdCBkYXRhID0gYWxsUm93c1xyXG4gICAgICAubWFwKChyb3cpID0+XHJcbiAgICAgICAgQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbChcInRoLCB0ZFwiKSkubWFwKChjZWxsKSA9PlxyXG4gICAgICAgICAgKGNlbGwuaW5uZXJUZXh0IHx8IGNlbGwudGV4dENvbnRlbnQgfHwgXCJcIikudHJpbSgpLnJlcGxhY2UoL1xcfC9nLCBcIlxcXFx8XCIpLnJlcGxhY2UoL1xcbi9nLCBcIiBcIilcclxuICAgICAgICApXHJcbiAgICAgIClcclxuICAgICAgLmZpbHRlcigocm93KSA9PiByb3cubGVuZ3RoID4gMCk7XHJcbiAgICBpZiAoIWRhdGEubGVuZ3RoKSByZXR1cm4gXCJcIjtcclxuICAgIGNvbnN0IGNvbENvdW50ID0gTWF0aC5tYXgoLi4uZGF0YS5tYXAoKHIpID0+IHIubGVuZ3RoKSk7XHJcbiAgICBjb25zdCBub3JtYWxpemVkID0gZGF0YS5tYXAoKHJvdykgPT4ge1xyXG4gICAgICB3aGlsZSAocm93Lmxlbmd0aCA8IGNvbENvdW50KSByb3cucHVzaChcIlwiKTtcclxuICAgICAgcmV0dXJuIHJvdztcclxuICAgIH0pO1xyXG4gICAgY29uc3Qgc2VwID0gQXJyYXkoY29sQ291bnQpLmZpbGwoXCItLS1cIik7XHJcbiAgICBjb25zdCBsaW5lcyA9IFtcclxuICAgICAgYHwgJHtub3JtYWxpemVkWzBdLmpvaW4oXCIgfCBcIil9IHxgLFxyXG4gICAgICBgfCAke3NlcC5qb2luKFwiIHwgXCIpfSB8YCxcclxuICAgICAgLi4ubm9ybWFsaXplZC5zbGljZSgxKS5tYXAoKHJvdykgPT4gYHwgJHtyb3cuam9pbihcIiB8IFwiKX0gfGApLFxyXG4gICAgXTtcclxuICAgIHJldHVybiBgXFxuXFxuJHtsaW5lcy5qb2luKFwiXFxuXCIpfVxcblxcbmA7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gY29udmVydE5vZGUoZWxlbWVudCkucmVwbGFjZSgvXFxuezMsfS9nLCBcIlxcblxcblwiKS50cmltKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4dHJhY3RCeVNpdGVTZWxlY3RvcnMoaG9zdCkge1xyXG4gIGNvbnN0IGNvbmZpZyA9IGdldFNpdGVDb250ZW50Q29uZmlnKGhvc3QpO1xyXG4gIGlmICghY29uZmlnKSByZXR1cm4gXCJcIjtcclxuXHJcbiAgY29uc3QgcGFydHMgPSBbXTtcclxuXHJcbiAgZm9yIChjb25zdCBjb250YWluZXJTZWwgb2YgKGNvbmZpZy5jb250YWluZXJzIHx8IFtdKSkge1xyXG4gICAgY29uc3QgY29udGFpbmVycyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjb250YWluZXJTZWwpKTtcclxuICAgIGlmIChjb250YWluZXJzLmxlbmd0aCA9PT0gMCkgY29udGludWU7XHJcblxyXG4gICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgY29udGFpbmVycykge1xyXG4gICAgICBsZXQgdGV4dCA9IFwiXCI7XHJcbiAgICAgIGZvciAoY29uc3QgY29udGVudFNlbCBvZiAoY29uZmlnLmNvbnRlbnQgfHwgW10pKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBjb250YWluZXIucXVlcnlTZWxlY3Rvcihjb250ZW50U2VsKTtcclxuICAgICAgICBpZiAoZWwpIHtcclxuICAgICAgICAgIHRleHQgPSBkb21Ub01hcmtkb3duKGVsKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAoIXRleHQpIHRleHQgPSBkb21Ub01hcmtkb3duKGNvbnRhaW5lcik7XHJcbiAgICAgIGlmICh0ZXh0KSBwYXJ0cy5wdXNoKHRleHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwYXJ0cy5sZW5ndGggPiAwKSBicmVhaztcclxuICB9XHJcblxyXG4gIGlmIChwYXJ0cy5sZW5ndGggPiAwKSByZXR1cm4gcGFydHMuam9pbihcIlxcblxcbi0tLVxcblxcblwiKS5zbGljZSgwLCAxMDAwMCk7XHJcblxyXG4gIGZvciAoY29uc3QgY29udGVudFNlbCBvZiAoY29uZmlnLmNvbnRlbnQgfHwgW10pKSB7XHJcbiAgICBjb25zdCBub2RlcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjb250ZW50U2VsKSk7XHJcbiAgICBpZiAobm9kZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zdCB0ZXh0cyA9IG5vZGVzLm1hcCgobikgPT4gZG9tVG9NYXJrZG93bihuKSkuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICBpZiAodGV4dHMubGVuZ3RoID4gMCkgcmV0dXJuIHRleHRzLmpvaW4oXCJcXG5cXG4tLS1cXG5cXG5cIikuc2xpY2UoMCwgMTAwMDApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIFwiXCI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGV4dHJhY3RXaXRoR2VuZXJpY1NlbGVjdG9ycygpIHtcclxuICBjb25zdCBzZWxlY3RvcnMgPSBbXHJcbiAgICBcIltkYXRhLW1lc3NhZ2UtYXV0aG9yLXJvbGU9J2Fzc2lzdGFudCddXCIsXHJcbiAgICBcIi5tYXJrZG93blwiLFxyXG4gICAgXCIucHJvc2VcIixcclxuICAgIFwiW2NsYXNzKj0nYXNzaXN0YW50LW1lc3NhZ2UnXVwiLFxyXG4gICAgXCJbY2xhc3MqPSdhaS1tZXNzYWdlJ11cIixcclxuICAgIFwiW2NsYXNzKj0nYm90LW1lc3NhZ2UnXVwiLFxyXG4gICAgXCJbY2xhc3MqPSdyZXNwb25zZS1jb250ZW50J11cIixcclxuICAgIFwibWFpbiBhcnRpY2xlXCIsXHJcbiAgICBcIm1haW5cIixcclxuICBdO1xyXG5cclxuICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xyXG4gICAgY29uc3Qgbm9kZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKVxyXG4gICAgICAubWFwKChub2RlKSA9PiBkb21Ub01hcmtkb3duKG5vZGUpKVxyXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgaWYgKG5vZGVzLmxlbmd0aCA+IDApIHJldHVybiBub2Rlcy5qb2luKFwiXFxuXFxuLS0tXFxuXFxuXCIpLnNsaWNlKDAsIDEwMDAwKTtcclxuICB9XHJcblxyXG4gIHJldHVybiAoZG9jdW1lbnQuYm9keT8uaW5uZXJUZXh0IHx8IFwiXCIpLnRyaW0oKS5zbGljZSgwLCA4MDAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0U2l0ZUNvbnZlcnNhdGlvbkNvbmZpZyhob3N0KSB7XHJcbiAgY29uc3QgbWFrZUFpRXh0cmFjdG9yID0gKHNlbGVjdG9ycykgPT4gKGVsKSA9PiB7XHJcbiAgICBmb3IgKGNvbnN0IHNlbCBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgY29uc3QgZm91bmQgPSBlbC5xdWVyeVNlbGVjdG9yKHNlbCk7XHJcbiAgICAgIGlmIChmb3VuZCkgcmV0dXJuIGRvbVRvTWFya2Rvd24oZm91bmQpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRvbVRvTWFya2Rvd24oZWwpO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IGNvbmZpZ3MgPSB7XHJcbiAgICBcImNoYXRncHQuY29tXCI6IHtcclxuICAgICAgYWxsTWVzc2FnZXM6IFwiW2RhdGEtbWVzc2FnZS1hdXRob3Itcm9sZT0ndXNlciddLCBbZGF0YS1tZXNzYWdlLWF1dGhvci1yb2xlPSdhc3Npc3RhbnQnXVwiLFxyXG4gICAgICBnZXRSb2xlOiAoZWwpID0+IGVsLmdldEF0dHJpYnV0ZShcImRhdGEtbWVzc2FnZS1hdXRob3Itcm9sZVwiKSxcclxuICAgICAgZ2V0VXNlclRleHQ6IChlbCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGlubmVyID0gZWwucXVlcnlTZWxlY3RvcihcIi53aGl0ZXNwYWNlLXByZS13cmFwXCIpIHx8IGVsLnF1ZXJ5U2VsZWN0b3IoXCJwXCIpO1xyXG4gICAgICAgIHJldHVybiAoKGlubmVyIHx8IGVsKS5pbm5lclRleHQgfHwgXCJcIikudHJpbSgpO1xyXG4gICAgICB9LFxyXG4gICAgICBnZXRBaVRleHQ6IG1ha2VBaUV4dHJhY3RvcihbXCIubWFya2Rvd24ucHJvc2VcIiwgXCIucHJvc2VcIiwgXCJbY2xhc3MqPSdtYXJrZG93biddXCJdKSxcclxuICAgIH0sXHJcbiAgICBcImNoYXQub3BlbmFpLmNvbVwiOiB7XHJcbiAgICAgIGFsbE1lc3NhZ2VzOiBcIltkYXRhLW1lc3NhZ2UtYXV0aG9yLXJvbGU9J3VzZXInXSwgW2RhdGEtbWVzc2FnZS1hdXRob3Itcm9sZT0nYXNzaXN0YW50J11cIixcclxuICAgICAgZ2V0Um9sZTogKGVsKSA9PiBlbC5nZXRBdHRyaWJ1dGUoXCJkYXRhLW1lc3NhZ2UtYXV0aG9yLXJvbGVcIiksXHJcbiAgICAgIGdldFVzZXJUZXh0OiAoZWwpID0+IHtcclxuICAgICAgICBjb25zdCBpbm5lciA9IGVsLnF1ZXJ5U2VsZWN0b3IoXCIud2hpdGVzcGFjZS1wcmUtd3JhcFwiKSB8fCBlbC5xdWVyeVNlbGVjdG9yKFwicFwiKTtcclxuICAgICAgICByZXR1cm4gKChpbm5lciB8fCBlbCkuaW5uZXJUZXh0IHx8IFwiXCIpLnRyaW0oKTtcclxuICAgICAgfSxcclxuICAgICAgZ2V0QWlUZXh0OiBtYWtlQWlFeHRyYWN0b3IoW1wiLm1hcmtkb3duLnByb3NlXCIsIFwiLnByb3NlXCJdKSxcclxuICAgIH0sXHJcbiAgICBcImRvdWJhby5jb21cIjoge1xyXG4gICAgICBhbGxNZXNzYWdlczogXCJbZGF0YS1hdXRob3ItdHlwZT0nMSddLCBbZGF0YS1hdXRob3ItdHlwZT0nMiddXCIsXHJcbiAgICAgIGdldFJvbGU6IChlbCkgPT4gZWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1hdXRob3ItdHlwZVwiKSA9PT0gXCIxXCIgPyBcInVzZXJcIiA6IFwiYXNzaXN0YW50XCIsXHJcbiAgICAgIGdldFVzZXJUZXh0OiAoZWwpID0+IChlbC5pbm5lclRleHQgfHwgZWwudGV4dENvbnRlbnQgfHwgXCJcIikudHJpbSgpLFxyXG4gICAgICBnZXRBaVRleHQ6IG1ha2VBaUV4dHJhY3RvcihbXCJbY2xhc3MqPSdtYXJrZG93biddXCIsIFwiW2NsYXNzKj0nbWVzc2FnZS10ZXh0J11cIiwgXCJbY2xhc3MqPSdjb250ZW50J11cIl0pLFxyXG4gICAgfSxcclxuICAgIFwiY2hhdC5kZWVwc2Vlay5jb21cIjoge1xyXG4gICAgICB1c2VyU2VsZWN0b3I6IFtcIltjbGFzcyo9J2h1bWFuLW1lc3NhZ2UnXVwiLCBcIltjbGFzcyo9J2RzLW1lc3NhZ2UtYnViYmxlLS11c2VyJ11cIiwgXCJbY2xhc3MqPSd1c2VyLW1lc3NhZ2UnXVwiXSxcclxuICAgICAgYXNzaXN0YW50U2VsZWN0b3I6IFtcIltjbGFzcyo9J2RzLW1lc3NhZ2UtYnViYmxlLS1hc3Npc3RhbnQnXVwiLCBcIltjbGFzcyo9J2RzLW1lc3NhZ2UtYnViYmxlJ11bY2xhc3MqPSdhc3Npc3RhbnQnXVwiXSxcclxuICAgICAgZ2V0QWlUZXh0OiBtYWtlQWlFeHRyYWN0b3IoW1wiW2NsYXNzKj0nZHMtbWFya2Rvd24nXVwiLCBcIltjbGFzcyo9J21hcmtkb3duJ11cIl0pLFxyXG4gICAgfSxcclxuICAgIFwia2ltaS5tb29uc2hvdC5jblwiOiB7XHJcbiAgICAgIHVzZXJTZWxlY3RvcjogW1wiW2NsYXNzKj0nY2hhdC1tZXNzYWdlLS11c2VyJ11cIiwgXCJbY2xhc3MqPSdzZWdtZW50J11bY2xhc3MqPSd1c2VyJ11cIiwgXCJbY2xhc3MqPSdodW1hbiddXCJdLFxyXG4gICAgICBhc3Npc3RhbnRTZWxlY3RvcjogW1wiW2NsYXNzKj0nY2hhdC1tZXNzYWdlLS1haSddXCIsIFwiW2NsYXNzKj0nc2VnbWVudCddW2NsYXNzKj0nYWknXVwiLCBcIltjbGFzcyo9J2J1YmJsZSddW2NsYXNzKj0nYXNzaXN0YW50J11cIl0sXHJcbiAgICAgIGdldEFpVGV4dDogbWFrZUFpRXh0cmFjdG9yKFtcIltjbGFzcyo9J21hcmtkb3duLWNvbnRlbnQnXVwiLCBcIltjbGFzcyo9J2NvbnRlbnQnXVwiXSksXHJcbiAgICB9LFxyXG4gICAgXCJraW1pLmNvbVwiOiB7XHJcbiAgICAgIHVzZXJTZWxlY3RvcjogW1wiW2NsYXNzKj0nY2hhdC1tZXNzYWdlLS11c2VyJ11cIiwgXCJbY2xhc3MqPSdzZWdtZW50J11bY2xhc3MqPSd1c2VyJ11cIiwgXCJbY2xhc3MqPSdodW1hbiddXCIsIFwiW2NsYXNzKj0ndXNlci1tZXNzYWdlJ11cIl0sXHJcbiAgICAgIGFzc2lzdGFudFNlbGVjdG9yOiBbXCJbY2xhc3MqPSdjaGF0LW1lc3NhZ2UtLWFpJ11cIiwgXCJbY2xhc3MqPSdzZWdtZW50J11bY2xhc3MqPSdhaSddXCIsIFwiW2NsYXNzKj0nYnViYmxlJ11bY2xhc3MqPSdhc3Npc3RhbnQnXVwiLCBcIltjbGFzcyo9J2NoYXQtY29udGVudC1pdGVtJ11cIl0sXHJcbiAgICAgIGdldEFpVGV4dDogbWFrZUFpRXh0cmFjdG9yKFtcIltjbGFzcyo9J21hcmtkb3duLWNvbnRlbnQnXVwiLCBcIltjbGFzcyo9J2NvbnRlbnQnXVwiLCBcIltjbGFzcyo9J21hcmtkb3duJ11cIl0pLFxyXG4gICAgfSxcclxuICAgIFwiZ2VtaW5pLmdvb2dsZS5jb21cIjoge1xyXG4gICAgICB1c2VyU2VsZWN0b3I6IFtcInVzZXItcXVlcnlcIiwgXCIudXNlci1xdWVyeS1idWJibGUtd2l0aC1iYWNrZ3JvdW5kXCJdLFxyXG4gICAgICBhc3Npc3RhbnRTZWxlY3RvcjogW1wibW9kZWwtcmVzcG9uc2VcIiwgXCJtZXNzYWdlLWNvbnRlbnRcIl0sXHJcbiAgICAgIGdldEFpVGV4dDogbWFrZUFpRXh0cmFjdG9yKFtcIi5tYXJrZG93blwiLCBcIltjbGFzcyo9J3Jlc3BvbnNlLWNvbnRlbnQnXVwiLCBcIltjbGFzcyo9J21vZGVsLXJlc3BvbnNlLXRleHQnXVwiXSksXHJcbiAgICB9LFxyXG4gICAgXCJ0b25neWkuYWxpeXVuLmNvbVwiOiB7XHJcbiAgICAgIHVzZXJTZWxlY3RvcjogW1wiW2NsYXNzKj0nY2hhdC1idWJibGUtdXNlciddXCIsIFwiW2NsYXNzKj0ncXVlc3Rpb24tY29udGFpbmVyJ11cIiwgXCJbY2xhc3MqPSd1c2VyLW1lc3NhZ2UnXVwiXSxcclxuICAgICAgYXNzaXN0YW50U2VsZWN0b3I6IFtcIltjbGFzcyo9J2Fuc3dlci1tZXNzYWdlJ11cIiwgXCJbY2xhc3MqPSdhZ2VudC1jaGF0X19hbnN3ZXInXVwiXSxcclxuICAgICAgZ2V0QWlUZXh0OiBtYWtlQWlFeHRyYWN0b3IoW1wiW2NsYXNzKj0nbWFya2Rvd24nXVwiLCBcIltjbGFzcyo9J2Fuc3dlci10ZXh0J11cIl0pLFxyXG4gICAgfSxcclxuICAgIFwiY2hhdGdsbS5jblwiOiB7XHJcbiAgICAgIHVzZXJTZWxlY3RvcjogW1wiW2NsYXNzKj0nY2hhdC1tc2ctLWh1bWFuJ11cIl0sXHJcbiAgICAgIGFzc2lzdGFudFNlbGVjdG9yOiBbXCJbY2xhc3MqPSdjaGF0LW1zZy0tYWknXVwiXSxcclxuICAgICAgZ2V0QWlUZXh0OiBtYWtlQWlFeHRyYWN0b3IoW1wiW2NsYXNzKj0nY29udGVudCddXCIsIFwiW2NsYXNzKj0nbWFya2Rvd24nXVwiXSksXHJcbiAgICB9LFxyXG4gICAgXCJ5dWFuYmFvLnRlbmNlbnQuY29tXCI6IHtcclxuICAgICAgdXNlclNlbGVjdG9yOiBbXCJbY2xhc3MqPSdhZ2VudC1jaGF0X19tZXNzYWdlLS1odW1hbiddXCIsIFwiW2NsYXNzKj0ncXVlc3Rpb24nXVwiXSxcclxuICAgICAgYXNzaXN0YW50U2VsZWN0b3I6IFtcIltjbGFzcyo9J2FnZW50LWNoYXRfX21lc3NhZ2UtLWFpJ11cIl0sXHJcbiAgICAgIGdldEFpVGV4dDogbWFrZUFpRXh0cmFjdG9yKFtcIltjbGFzcyo9J2h5cGVyLXRleHQnXVwiLCBcIltjbGFzcyo9J21hcmtkb3duJ11cIiwgXCJbY2xhc3MqPSdjb250ZW50J11cIl0pLFxyXG4gICAgfSxcclxuICB9O1xyXG5cclxuICBmb3IgKGNvbnN0IFtkb21haW4sIGNvbmZpZ10gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlncykpIHtcclxuICAgIGlmIChob3N0ID09PSBkb21haW4gfHwgaG9zdC5lbmRzV2l0aChcIi5cIiArIGRvbWFpbikpIHJldHVybiBjb25maWc7XHJcbiAgfVxyXG4gIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0Q29udmVyc2F0aW9uVHVybnMoKSB7XHJcbiAgY29uc3QgaG9zdCA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZS5yZXBsYWNlKC9ed3d3XFwuLywgXCJcIik7XHJcbiAgY29uc3QgY29uZmlnID0gZ2V0U2l0ZUNvbnZlcnNhdGlvbkNvbmZpZyhob3N0KTtcclxuICBpZiAoIWNvbmZpZykgcmV0dXJuIG51bGw7XHJcblxyXG4gIGNvbnN0IHR1cm5zID0gW107XHJcbiAgdHJ5IHtcclxuICAgIGlmIChjb25maWcuYWxsTWVzc2FnZXMpIHtcclxuICAgICAgY29uc3QgZWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGNvbmZpZy5hbGxNZXNzYWdlcykpO1xyXG4gICAgICBmb3IgKGNvbnN0IGVsIG9mIGVscykge1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBjb25maWcuZ2V0Um9sZShlbCk7XHJcbiAgICAgICAgaWYgKHJvbGUgIT09IFwidXNlclwiICYmIHJvbGUgIT09IFwiYXNzaXN0YW50XCIpIGNvbnRpbnVlO1xyXG4gICAgICAgIGNvbnN0IHRleHQgPSByb2xlID09PSBcInVzZXJcIlxyXG4gICAgICAgICAgPyAoY29uZmlnLmdldFVzZXJUZXh0ID8gY29uZmlnLmdldFVzZXJUZXh0KGVsKSA6IChlbC5pbm5lclRleHQgfHwgXCJcIikudHJpbSgpKVxyXG4gICAgICAgICAgOiAoY29uZmlnLmdldEFpVGV4dCA/IGNvbmZpZy5nZXRBaVRleHQoZWwpIDogZG9tVG9NYXJrZG93bihlbCkpO1xyXG4gICAgICAgIGlmICh0ZXh0ICYmIHRleHQgIT09IFwi5pqC5pyq5o+Q5Y+W5Yiw5YaF5a65XCIpIHR1cm5zLnB1c2goeyByb2xlLCB0ZXh0IH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb25zdCB1c2VyU2VsU3RyID0gKGNvbmZpZy51c2VyU2VsZWN0b3IgfHwgW10pLmpvaW4oXCIsIFwiKTtcclxuICAgICAgY29uc3QgYWlTZWxTdHIgPSAoY29uZmlnLmFzc2lzdGFudFNlbGVjdG9yIHx8IFtdKS5qb2luKFwiLCBcIik7XHJcbiAgICAgIGlmICghdXNlclNlbFN0ciAmJiAhYWlTZWxTdHIpIHJldHVybiBudWxsO1xyXG5cclxuICAgICAgY29uc3QgY29tYmluZWQgPSBbdXNlclNlbFN0ciwgYWlTZWxTdHJdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiLCBcIik7XHJcbiAgICAgIGNvbnN0IGFsbEVscyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChjb21iaW5lZCkpO1xyXG4gICAgICBjb25zdCB1c2VyRWxzID0gbmV3IFNldCh1c2VyU2VsU3RyID8gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHVzZXJTZWxTdHIpKSA6IFtdKTtcclxuXHJcbiAgICAgIGZvciAoY29uc3QgZWwgb2YgYWxsRWxzKSB7XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IHVzZXJFbHMuaGFzKGVsKSA/IFwidXNlclwiIDogXCJhc3Npc3RhbnRcIjtcclxuICAgICAgICBjb25zdCB0ZXh0ID0gcm9sZSA9PT0gXCJ1c2VyXCJcclxuICAgICAgICAgID8gKGVsLmlubmVyVGV4dCB8fCBlbC50ZXh0Q29udGVudCB8fCBcIlwiKS50cmltKClcclxuICAgICAgICAgIDogKGNvbmZpZy5nZXRBaVRleHQgPyBjb25maWcuZ2V0QWlUZXh0KGVsKSA6IGRvbVRvTWFya2Rvd24oZWwpKTtcclxuICAgICAgICBpZiAodGV4dCAmJiB0ZXh0ICE9PSBcIuaaguacquaPkOWPluWIsOWGheWuuVwiKSB0dXJucy5wdXNoKHsgcm9sZSwgdGV4dCB9KTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKF9lcnIpIHtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHR1cm5zLmxlbmd0aCA+IDAgPyB0dXJucyA6IG51bGw7XHJcbn1cclxuIiwgIi8vIEluamVjdHMgc2l0ZS1zcGVjaWZpYyBDU1MgaW50byB0aGUgQUkgc2l0ZSdzIGlmcmFtZSB0byBoaWRlIGl0cyBpbnRlcm5hbFxyXG4vLyBzaWRlYmFyIHNvIG91ciBjb21wYXJlIHBhZ2UgbGF5b3V0IGlzbid0IHdhc3RlZCBvbiBlLmcuIENoYXRHUFQncyBuYXYgcGFuZWwuXHJcbi8vIE9ubHkgcnVucyBpbiBpZnJhbWVzIChub3QgdG9wIHRhYnMpIGFuZCBvbmx5IGZvciBzaXRlcyBpbiBTSVRFX1NUWUxFX01BUC5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGluaXRFbWJlZFNpZGViYXJGaXgocmVzb2x2ZVNpdGUpIHtcclxuICBpZiAod2luZG93LnBhcmVudCA9PT0gd2luZG93KSByZXR1cm47XHJcblxyXG4gIC8vIERlZXBTZWVrIOWcqOeqhCBpZnJhbWUg6aaW5bGP5Lya5YWI5oyJ56e75Yqo56uv5biD5bGA5bGV5byA5Lya6K+d5oq95bGJ44CCXHJcbiAgLy8g56uZ54K56YWN572u6Kej5p6Q5piv5byC5q2l55qE77yM562JIHJlc29sdmVTaXRlIOWQjuWGjeazqOWFpeS8mueci+WIsOS+p+agj+mXquS4gOS4i++8m1xyXG4gIC8vIOi/memHjOaMiSBob3N0bmFtZSDlhYjooYzlronoo4XvvIzlsL3ph4/otbblnKjpppblsY/nu5jliLbliY3ljovkvY/mir3lsYnjgIJcclxuICBpZiAoLyhcXC58XilkZWVwc2Vla1xcLmNvbSQvaS50ZXN0KHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZSkpIHtcclxuICAgIGluc3RhbGxFYXJseURlZXBTZWVrU2lkZWJhckNzcygpO1xyXG4gICAgc3RhcnREZWVwU2Vla1NpZGViYXJTdXBwcmVzc29yKCk7XHJcbiAgfVxyXG5cclxuICBsZXQgc2l0ZTtcclxuICB0cnkge1xyXG4gICAgc2l0ZSA9IGF3YWl0IHJlc29sdmVTaXRlKG51bGwpO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBpZiAoIXNpdGUpIHJldHVybjtcclxuXHJcbiAgY29uc3QgU1RZTEVfSUQgPSBcImFpLWNvbXBhcmUtZW1iZWQtc2lkZWJhci1maXhcIjtcclxuICBjb25zdCBDT01NT05fU0lERUJBUl9DU1MgPSBbXHJcbiAgICBcImFzaWRlLCBbcm9sZT0nbmF2aWdhdGlvbiddIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB3aWR0aDogMCAhaW1wb3J0YW50OyBtaW4td2lkdGg6IDAgIWltcG9ydGFudDsgbWF4LXdpZHRoOiAwICFpbXBvcnRhbnQ7IG92ZXJmbG93OiBoaWRkZW4gIWltcG9ydGFudDsgZmxleDogbm9uZSAhaW1wb3J0YW50OyBmbGV4LWJhc2lzOiAwICFpbXBvcnRhbnQ7IHBhZGRpbmc6IDAgIWltcG9ydGFudDsgbWFyZ2luOiAwICFpbXBvcnRhbnQ7IH1cIixcclxuICAgIFwiW2NsYXNzKj0nc2lkZWJhciddLCBbY2xhc3MqPSdzaWRlLWJhciddLCBbY2xhc3MqPSdzaWRlciddLCBbY2xhc3MqPSdsZWZ0LXBhbmVsJ10sIFtjbGFzcyo9J2xlZnRfcGFuZWwnXSwgW2NsYXNzKj0nbmF2LXBhbmVsJ10sIFtjbGFzcyo9J2NvbnZlcnNhdGlvbi1saXN0J10sIFtjbGFzcyo9J2NoYXQtbGlzdCddLCBbY2xhc3MqPSdzZXNzaW9uLWxpc3QnXSB7IGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDsgd2lkdGg6IDAgIWltcG9ydGFudDsgbWluLXdpZHRoOiAwICFpbXBvcnRhbnQ7IG1heC13aWR0aDogMCAhaW1wb3J0YW50OyBvdmVyZmxvdzogaGlkZGVuICFpbXBvcnRhbnQ7IGZsZXg6IG5vbmUgIWltcG9ydGFudDsgZmxleC1iYXNpczogMCAhaW1wb3J0YW50OyBwYWRkaW5nOiAwICFpbXBvcnRhbnQ7IG1hcmdpbjogMCAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICBcIm1haW4sIFtyb2xlPSdtYWluJ10sIFtjbGFzcyo9J21haW4tY29udGVudCddLCBbY2xhc3MqPSdjaGF0LW1haW4nXSwgW2NsYXNzKj0nY29udmVyc2F0aW9uJ10geyBmbGV4OiAxIDEgYXV0byAhaW1wb3J0YW50OyB3aWR0aDogMTAwJSAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDEwMCUgIWltcG9ydGFudDsgbWluLXdpZHRoOiAwICFpbXBvcnRhbnQ7IG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7IHBhZGRpbmctbGVmdDogMCAhaW1wb3J0YW50OyB9XCIsXHJcbiAgXTtcclxuICBjb25zdCBET01FU1RJQ19DSEFUX0NTUyA9IFtcclxuICAgIC4uLkNPTU1PTl9TSURFQkFSX0NTUyxcclxuICAgIFwibmF2Om5vdCg6aGFzKHRleHRhcmVhKSk6bm90KDpoYXMoW2NvbnRlbnRlZGl0YWJsZT0ndHJ1ZSddKSkgeyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgfVwiLFxyXG4gICAgXCJbY2xhc3MqPSdsYXlvdXQnXSwgW2NsYXNzKj0nY29udGFpbmVyJ10sIFtjbGFzcyo9J3dyYXBwZXInXSB7IG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7IHBhZGRpbmctbGVmdDogMCAhaW1wb3J0YW50OyB9XCIsXHJcbiAgXTtcclxuXHJcbiAgLy8gU29tZSBzaXRlcyBleHBvc2UgaW1wb3J0YW50IGNvbnRyb2xzIGJlaGluZCB0aGVpciBvd24gc2lkZWJhciBkcmF3ZXIuXHJcbiAgLy8gS2VlcCBEb3ViYW8gYW5kIEdlbWluaSBvdXQgb2YgdGhpcyBtYXAgc28gdGhlaXIgaW4tY2FyZCBzaWRlYmFyIGJ1dHRvbnNcclxuICAvLyBjYW4gc3RpbGwgb3BlbiB0aGUgbmF0aXZlIGRyYXdlci93aW5kb3cgd2hlbiBjbGlja2VkLlxyXG4gIGNvbnN0IFNJVEVfU1RZTEVfTUFQID0ge1xyXG4gICAgY2hhdGdwdDogW1xyXG4gICAgICBcIi8qIEFJ5om56YeP5pCc57Si77ya6ZqQ6JePIENoYXRHUFQg5L6n6L655qCP77yM5raI6Zmk5bem5L6n55WZ55m9ICovXCIsXHJcbiAgICAgIFwibmF2IHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICAgIFwiZGl2Omhhcyg+IG5hdikgeyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgfVwiLFxyXG4gICAgICBcImRpdjpoYXMobmF2KTpub3QoOmhhcyhtYWluKSk6bm90KDpoYXMoW3JvbGU9J21haW4nXSkpIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB3aWR0aDogMCAhaW1wb3J0YW50OyBtaW4td2lkdGg6IDAgIWltcG9ydGFudDsgbWF4LXdpZHRoOiAwICFpbXBvcnRhbnQ7IG92ZXJmbG93OiBoaWRkZW4gIWltcG9ydGFudDsgZmxleDogbm9uZSAhaW1wb3J0YW50OyBmbGV4LWJhc2lzOiAwICFpbXBvcnRhbnQ7IHBhZGRpbmc6IDAgIWltcG9ydGFudDsgbWFyZ2luOiAwICFpbXBvcnRhbnQ7IH1cIixcclxuICAgICAgXCJbY2xhc3MqPSd6LXNpZGViYXInXSB7IGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDsgd2lkdGg6IDAgIWltcG9ydGFudDsgbWluLXdpZHRoOiAwICFpbXBvcnRhbnQ7IH1cIixcclxuICAgICAgXCJbY2xhc3MqPSdzaWRlYmFyLWhlYWRlciddIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICAgIFwiW2RhdGEtdGVzdGlkKj0nc2lkZWJhciddLCBbZGF0YS10ZXN0aWQqPSduYXYtJ10geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICAgIFwibWFpbiB7IGZsZXg6IDEgIWltcG9ydGFudDsgd2lkdGg6IDEwMCUgIWltcG9ydGFudDsgcGFkZGluZy1sZWZ0OiAwICFpbXBvcnRhbnQ7IG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICAgIFwibWFpbiBbY2xhc3MqPSdtYXgtdyddOm5vdChbY2xhc3MqPSdtYXgtdy1ub25lJ10pIHsgbWF4LXdpZHRoOiAxMDAlICFpbXBvcnRhbnQ7IH1cIixcclxuICAgIF0sXHJcbiAgICBkZWVwc2VlazogW1xyXG4gICAgICBcIi8qIEFJ5om56YeP5pCc57Si77ya6ZqQ6JePIERlZXBTZWVrIOS+p+i+ueagj++8jOa2iOmZpOW3puS+p+eVmeeZvSAqL1wiLFxyXG4gICAgICBcIltjbGFzcyo9J3NpZGViYXInXSwgW2NsYXNzKj0nc2lkZS1iYXInXSwgW2NsYXNzKj0nbGVmdC1wYW5lbCddLCBbY2xhc3MqPSdsZWZ0X3BhbmVsJ10sIFtjbGFzcyo9J25hdi1wYW5lbCddLCBbY2xhc3MqPSdjaGF0LWxpc3QnXSwgW2NsYXNzKj0nY29udmVyc2F0aW9uLWxpc3QnXSwgW2NsYXNzKj0naGlzdG9yeSddIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB3aWR0aDogMCAhaW1wb3J0YW50OyBtaW4td2lkdGg6IDAgIWltcG9ydGFudDsgbWF4LXdpZHRoOiAwICFpbXBvcnRhbnQ7IG92ZXJmbG93OiBoaWRkZW4gIWltcG9ydGFudDsgZmxleDogbm9uZSAhaW1wb3J0YW50OyBmbGV4LWJhc2lzOiAwICFpbXBvcnRhbnQ7IHBhZGRpbmc6IDAgIWltcG9ydGFudDsgbWFyZ2luOiAwICFpbXBvcnRhbnQ7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgtMTIwJSkgIWltcG9ydGFudDsgcG9pbnRlci1ldmVudHM6IG5vbmUgIWltcG9ydGFudDsgfVwiLFxyXG4gICAgICBcImFzaWRlLCBuYXYsIFtyb2xlPSduYXZpZ2F0aW9uJ10geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC0xMjAlKSAhaW1wb3J0YW50OyBwb2ludGVyLWV2ZW50czogbm9uZSAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICAgIFwiZGl2Omhhcyg+IGFzaWRlKSwgZGl2Omhhcyg+IG5hdiksIGRpdjpoYXMoW2NsYXNzKj0nc2lkZWJhciddKTpub3QoOmhhcyh0ZXh0YXJlYSkpOm5vdCg6aGFzKFtjb250ZW50ZWRpdGFibGU9J3RydWUnXSkpIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB3aWR0aDogMCAhaW1wb3J0YW50OyBtaW4td2lkdGg6IDAgIWltcG9ydGFudDsgbWF4LXdpZHRoOiAwICFpbXBvcnRhbnQ7IG92ZXJmbG93OiBoaWRkZW4gIWltcG9ydGFudDsgZmxleDogbm9uZSAhaW1wb3J0YW50OyBmbGV4LWJhc2lzOiAwICFpbXBvcnRhbnQ7IHBhZGRpbmc6IDAgIWltcG9ydGFudDsgbWFyZ2luOiAwICFpbXBvcnRhbnQ7IH1cIixcclxuICAgICAgXCIvKiBzdHJ1Y3R1cmFsIGZhbGxiYWNrOiBoaWRlIHNpZGViYXIgYnkgRE9NIHBvc2l0aW9uIHJlZ2FyZGxlc3Mgb2YgY2xhc3MgbmFtZXMgKi9cIixcclxuICAgICAgXCIjcm9vdCA+IGRpdiA+IGRpdjpmaXJzdC1jaGlsZDpub3QoOmhhcyh0ZXh0YXJlYSkpOm5vdCg6aGFzKFtjb250ZW50ZWRpdGFibGU9J3RydWUnXSkpOm5vdCg6bGFzdC1jaGlsZCkgeyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC0xMjAlKSAhaW1wb3J0YW50OyBwb2ludGVyLWV2ZW50czogbm9uZSAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICAgIFwibWFpbiwgW3JvbGU9J21haW4nXSwgW2NsYXNzKj0nY2hhdC1tYWluJ10sIFtjbGFzcyo9J21haW4tY29udGVudCddLCBbY2xhc3MqPSdjb252ZXJzYXRpb24nXSB7IGZsZXg6IDEgMSBhdXRvICFpbXBvcnRhbnQ7IHdpZHRoOiAxMDAlICFpbXBvcnRhbnQ7IG1heC13aWR0aDogMTAwJSAhaW1wb3J0YW50OyBtaW4td2lkdGg6IDAgIWltcG9ydGFudDsgcGFkZGluZy1sZWZ0OiAwICFpbXBvcnRhbnQ7IG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7IHRyYW5zZm9ybTogbm9uZSAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICBdLFxyXG4gICAgcXdlbjogW1xyXG4gICAgICBcIi8qIEFJ5om56YeP5pCc57Si77ya6ZqQ6JeP6YCa5LmJ5Y2D6ZeuIC8gUXdlbiDkvqfovrnmoI8gKi9cIixcclxuICAgICAgLi4uRE9NRVNUSUNfQ0hBVF9DU1MsXHJcbiAgICAgIFwiLnQtbGF5b3V0X19zaWRlciwgLnQtY2hhdF9fc2lkZXIsIC50LWNoYXQtc2lkZXIsIFtjbGFzcyo9J2FudC1sYXlvdXQtc2lkZXInXSwgW2NsYXNzKj0nY29udmVyc2F0aW9uLXNpZGViYXInXSB7IGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDsgd2lkdGg6IDAgIWltcG9ydGFudDsgbWluLXdpZHRoOiAwICFpbXBvcnRhbnQ7IG1heC13aWR0aDogMCAhaW1wb3J0YW50OyBvdmVyZmxvdzogaGlkZGVuICFpbXBvcnRhbnQ7IGZsZXg6IG5vbmUgIWltcG9ydGFudDsgZmxleC1iYXNpczogMCAhaW1wb3J0YW50OyBwYWRkaW5nOiAwICFpbXBvcnRhbnQ7IG1hcmdpbjogMCAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICBdLFxyXG4gICAgeXVhbmJhbzogW1xyXG4gICAgICBcIi8qIEFJ5om56YeP5pCc57Si77ya6ZqQ6JeP6IW+6K6v5YWD5a6d5L6n6L655qCPIC8g5Lya6K+d5YiX6KGoICovXCIsXHJcbiAgICAgIC4uLkRPTUVTVElDX0NIQVRfQ1NTLFxyXG4gICAgICBcIltjbGFzcyo9J2NvbnZlcnNhdGlvbi1zaWRlYmFyJ10sIFtjbGFzcyo9J2hpc3Rvcnktc2lkZWJhciddLCBbY2xhc3MqPSdjaGF0LWhpc3RvcnknXSwgW2NsYXNzKj0nbGVmdC1zaWRlYmFyJ10geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgfVwiLFxyXG4gICAgXSxcclxuICAgIGtpbWk6IFtcclxuICAgICAgXCIvKiBBSeaJuemHj+aQnOe0ou+8mumakOiXjyBLaW1pIOS+p+i+ueagjyAvIOS8muivneWIl+ihqCAqL1wiLFxyXG4gICAgICAuLi5ET01FU1RJQ19DSEFUX0NTUyxcclxuICAgICAgXCJbY2xhc3MqPSdjb252ZXJzYXRpb24tc2lkZWJhciddLCBbY2xhc3MqPSdjaGF0LWhpc3RvcnknXSwgW2NsYXNzKj0nbGVmdC1zaWRlYmFyJ10sIFtjbGFzcyo9J25hdi1zaWRlYmFyJ10geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHdpZHRoOiAwICFpbXBvcnRhbnQ7IG1pbi13aWR0aDogMCAhaW1wb3J0YW50OyBtYXgtd2lkdGg6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgfVwiLFxyXG4gICAgXSxcclxuICAgIGNsYXVkZTogW1xyXG4gICAgICBcIi8qIEFJ5om56YeP5pCc57Si77ya6ZqQ6JePIENsYXVkZSDkvqfovrnmoI8gKi9cIixcclxuICAgICAgLi4uQ09NTU9OX1NJREVCQVJfQ1NTLFxyXG4gICAgXSxcclxuICAgIGdyb2s6IFtcclxuICAgICAgXCIvKiBBSeaJuemHj+aQnOe0ou+8mumakOiXjyBHcm9rIOS+p+i+ueagjyAqL1wiLFxyXG4gICAgICAuLi5DT01NT05fU0lERUJBUl9DU1MsXHJcbiAgICBdLFxyXG4gIH07XHJcblxyXG4gIGNvbnN0IGNzc0xpbmVzID0gU0lURV9TVFlMRV9NQVBbc2l0ZS5pZF07XHJcbiAgaWYgKCFjc3NMaW5lcykgcmV0dXJuO1xyXG5cclxuICBmdW5jdGlvbiBpbmplY3RTdHlsZSgpIHtcclxuICAgIGxldCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNUWUxFX0lEKTtcclxuICAgIGlmICghZWwpIHtcclxuICAgICAgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XHJcbiAgICAgIGVsLmlkID0gU1RZTEVfSUQ7XHJcbiAgICAgIChkb2N1bWVudC5oZWFkIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQoZWwpO1xyXG4gICAgfVxyXG4gICAgZWwudGV4dENvbnRlbnQgPSBjc3NMaW5lcy5qb2luKFwiXFxuXCIpO1xyXG4gIH1cclxuXHJcbiAgbGV0IG9ic2VydmVyID0gbnVsbDtcclxuICBmdW5jdGlvbiBzdGFydE9ic2VydmVyKCkge1xyXG4gICAgaWYgKG9ic2VydmVyKSByZXR1cm47XHJcbiAgICBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcclxuICAgICAgaWYgKCFkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIGluamVjdFN0eWxlKCk7XHJcbiAgICB9KTtcclxuICAgIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHN0YXJ0U2l0ZVN1cHByZXNzb3JzKCkge1xyXG4gICAgaWYgKHNpdGUuaWQgPT09IFwiZGVlcHNlZWtcIikge1xyXG4gICAgICBzdGFydERlZXBTZWVrU2lkZWJhclN1cHByZXNzb3IoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlID09PSBcImxvYWRpbmdcIikge1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgKCkgPT4ge1xyXG4gICAgICBpbmplY3RTdHlsZSgpO1xyXG4gICAgICBzdGFydE9ic2VydmVyKCk7XHJcbiAgICAgIHN0YXJ0U2l0ZVN1cHByZXNzb3JzKCk7XHJcbiAgICB9KTtcclxuICB9IGVsc2Uge1xyXG4gICAgaW5qZWN0U3R5bGUoKTtcclxuICAgIHN0YXJ0T2JzZXJ2ZXIoKTtcclxuICAgIHN0YXJ0U2l0ZVN1cHByZXNzb3JzKCk7XHJcbiAgfVxyXG4gIHNldFRpbWVvdXQoaW5qZWN0U3R5bGUsIDQwMCk7XHJcbiAgc2V0VGltZW91dChpbmplY3RTdHlsZSwgMTUwMCk7XHJcbiAgc2V0VGltZW91dChpbmplY3RTdHlsZSwgNDAwMCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGluc3RhbGxFYXJseURlZXBTZWVrU2lkZWJhckNzcygpIHtcclxuICBjb25zdCBTVFlMRV9JRCA9IFwiYWktY29tcGFyZS1kZWVwc2Vlay1lYXJseS1zaWRlYmFyLWZpeFwiO1xyXG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChTVFlMRV9JRCkpIHJldHVybjtcclxuXHJcbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XHJcbiAgc3R5bGUuaWQgPSBTVFlMRV9JRDtcclxuICBzdHlsZS50ZXh0Q29udGVudCA9IFtcclxuICAgIFwiLyogUXNob3Q6IHByZXZlbnQgRGVlcFNlZWsgbW9iaWxlIGRyYXdlciBmcm9tIGZsYXNoaW5nIGluIGlmcmFtZSAqL1wiLFxyXG4gICAgXCJhc2lkZSwgbmF2LCBbcm9sZT0nbmF2aWdhdGlvbiddIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB2aXNpYmlsaXR5OiBoaWRkZW4gIWltcG9ydGFudDsgd2lkdGg6IDAgIWltcG9ydGFudDsgbWluLXdpZHRoOiAwICFpbXBvcnRhbnQ7IG1heC13aWR0aDogMCAhaW1wb3J0YW50OyBvcGFjaXR5OiAwICFpbXBvcnRhbnQ7IG92ZXJmbG93OiBoaWRkZW4gIWltcG9ydGFudDsgcG9pbnRlci1ldmVudHM6IG5vbmUgIWltcG9ydGFudDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC0xMjAlKSAhaW1wb3J0YW50OyB9XCIsXHJcbiAgICBcIltjbGFzcyo9J3NpZGViYXInXSwgW2NsYXNzKj0nc2lkZS1iYXInXSwgW2NsYXNzKj0nc2lkZXInXSwgW2NsYXNzKj0nZHJhd2VyJ10sIFtjbGFzcyo9J2NoYXQtbGlzdCddLCBbY2xhc3MqPSdjb252ZXJzYXRpb24tbGlzdCddLCBbY2xhc3MqPSdoaXN0b3J5J10geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHZpc2liaWxpdHk6IGhpZGRlbiAhaW1wb3J0YW50OyB3aWR0aDogMCAhaW1wb3J0YW50OyBtaW4td2lkdGg6IDAgIWltcG9ydGFudDsgbWF4LXdpZHRoOiAwICFpbXBvcnRhbnQ7IG9wYWNpdHk6IDAgIWltcG9ydGFudDsgb3ZlcmZsb3c6IGhpZGRlbiAhaW1wb3J0YW50OyBwb2ludGVyLWV2ZW50czogbm9uZSAhaW1wb3J0YW50OyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTEyMCUpICFpbXBvcnRhbnQ7IH1cIixcclxuICAgIFwiW2NsYXNzKj0nbWFzayddLCBbY2xhc3MqPSdvdmVybGF5J10sIFtjbGFzcyo9J2JhY2tkcm9wJ10geyBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7IHZpc2liaWxpdHk6IGhpZGRlbiAhaW1wb3J0YW50OyBvcGFjaXR5OiAwICFpbXBvcnRhbnQ7IHBvaW50ZXItZXZlbnRzOiBub25lICFpbXBvcnRhbnQ7IH1cIixcclxuICAgIFwibWFpbiwgW3JvbGU9J21haW4nXSwgW2NsYXNzKj0nY2hhdC1tYWluJ10sIFtjbGFzcyo9J21haW4tY29udGVudCddIHsgd2lkdGg6IDEwMCUgIWltcG9ydGFudDsgbWF4LXdpZHRoOiAxMDAlICFpbXBvcnRhbnQ7IG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7IHBhZGRpbmctbGVmdDogMCAhaW1wb3J0YW50OyB0cmFuc2Zvcm06IG5vbmUgIWltcG9ydGFudDsgfVwiLFxyXG4gICAgXCIvKiBzdHJ1Y3R1cmFsIGZhbGxiYWNrOiBoaWRlIGZpcnN0IG5vbi1pbnB1dCBzaWJsaW5nIGluIHJvb3QgbGF5b3V0IHJlZ2FyZGxlc3Mgb2YgY2xhc3MgbmFtZXMgKi9cIixcclxuICAgIFwiI3Jvb3QgPiBkaXYgPiBkaXY6Zmlyc3QtY2hpbGQ6bm90KDpoYXModGV4dGFyZWEpKTpub3QoOmhhcyhbY29udGVudGVkaXRhYmxlPSd0cnVlJ10pKTpub3QoOmxhc3QtY2hpbGQpIHsgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50OyB2aXNpYmlsaXR5OiBoaWRkZW4gIWltcG9ydGFudDsgd2lkdGg6IDAgIWltcG9ydGFudDsgbWluLXdpZHRoOiAwICFpbXBvcnRhbnQ7IG1heC13aWR0aDogMCAhaW1wb3J0YW50OyBvcGFjaXR5OiAwICFpbXBvcnRhbnQ7IG92ZXJmbG93OiBoaWRkZW4gIWltcG9ydGFudDsgcG9pbnRlci1ldmVudHM6IG5vbmUgIWltcG9ydGFudDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC0xMjAlKSAhaW1wb3J0YW50OyBmbGV4OiBub25lICFpbXBvcnRhbnQ7IGZsZXgtYmFzaXM6IDAgIWltcG9ydGFudDsgcGFkZGluZzogMCAhaW1wb3J0YW50OyBtYXJnaW46IDAgIWltcG9ydGFudDsgfVwiLFxyXG4gIF0uam9pbihcIlxcblwiKTtcclxuXHJcbiAgKGRvY3VtZW50LmhlYWQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChzdHlsZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0RGVlcFNlZWtTaWRlYmFyU3VwcHJlc3NvcigpIHtcclxuICBpZiAod2luZG93Ll9fUVNIT1RfREVFUFNFRUtfU0lERUJBUl9TVVBQUkVTU09SX18pIHJldHVybjtcclxuICB3aW5kb3cuX19RU0hPVF9ERUVQU0VFS19TSURFQkFSX1NVUFBSRVNTT1JfXyA9IHRydWU7XHJcblxyXG4gIGxldCBzY2hlZHVsZWQgPSBmYWxzZTtcclxuICBjb25zdCBzY2hlZHVsZSA9ICgpID0+IHtcclxuICAgIGlmIChzY2hlZHVsZWQpIHJldHVybjtcclxuICAgIHNjaGVkdWxlZCA9IHRydWU7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICBzY2hlZHVsZWQgPSBmYWxzZTtcclxuICAgICAgc3VwcHJlc3NEZWVwU2Vla1NpZGViYXIoKTtcclxuICAgIH0pO1xyXG4gIH07XHJcblxyXG4gIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoc2NoZWR1bGUpO1xyXG4gIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7XHJcbiAgICBhdHRyaWJ1dGVzOiB0cnVlLFxyXG4gICAgYXR0cmlidXRlRmlsdGVyOiBbXCJjbGFzc1wiLCBcInN0eWxlXCIsIFwiYXJpYS1oaWRkZW5cIl0sXHJcbiAgICBjaGlsZExpc3Q6IHRydWUsXHJcbiAgICBzdWJ0cmVlOiB0cnVlLFxyXG4gIH0pO1xyXG5cclxuICBbMCwgNTAsIDEyMCwgMjUwLCA1MDAsIDEwMDAsIDIwMDAsIDQwMDBdLmZvckVhY2goKGRlbGF5TXMpID0+IHtcclxuICAgIHNldFRpbWVvdXQoc2NoZWR1bGUsIGRlbGF5TXMpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdXBwcmVzc0RlZXBTZWVrU2lkZWJhcigpIHtcclxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcclxuICBpZiAoIWJvZHkpIHJldHVybjtcclxuXHJcbiAgY29uc3Qgc2VsZWN0b3IgPSBbXHJcbiAgICBcImFzaWRlXCIsXHJcbiAgICBcIm5hdlwiLFxyXG4gICAgXCJbcm9sZT0nbmF2aWdhdGlvbiddXCIsXHJcbiAgICBcIltjbGFzcyo9J3NpZGViYXInXVwiLFxyXG4gICAgXCJbY2xhc3MqPSdzaWRlLWJhciddXCIsXHJcbiAgICBcIltjbGFzcyo9J3NpZGVyJ11cIixcclxuICAgIFwiW2NsYXNzKj0nZHJhd2VyJ11cIixcclxuICAgIFwiW2NsYXNzKj0nbWFzayddXCIsXHJcbiAgICBcIltjbGFzcyo9J21vZGFsJ11cIixcclxuICAgIFwiW2NsYXNzKj0nb3ZlcmxheSddXCIsXHJcbiAgICBcIltjbGFzcyo9J2hpc3RvcnknXVwiLFxyXG4gICAgXCJbY2xhc3MqPSdjb252ZXJzYXRpb24nXVwiLFxyXG4gICAgXCJbY2xhc3MqPSdjaGF0LWxpc3QnXVwiLFxyXG4gIF0uam9pbihcIixcIik7XHJcblxyXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpLmZvckVhY2goKGVsZW1lbnQpID0+IHtcclxuICAgIGlmIChpc0RlZXBTZWVrU2lkZWJhckxpa2UoZWxlbWVudCkgfHwgaXNEZWVwU2Vla0JhY2tkcm9wTGlrZShlbGVtZW50KSkge1xyXG4gICAgICBmb3JjZUhpZGVFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBBcnJheS5mcm9tKGJvZHkuY2hpbGRyZW4pLmZvckVhY2goKGVsZW1lbnQpID0+IHtcclxuICAgIGlmIChpc0RlZXBTZWVrU2lkZWJhckxpa2UoZWxlbWVudCkgfHwgaXNEZWVwU2Vla0JhY2tkcm9wTGlrZShlbGVtZW50KSkge1xyXG4gICAgICBmb3JjZUhpZGVFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICAvLyDnu5PmnoTmgKfmiavmj4/vvJrnsbvlkI3lk4jluIzljJbml7bkuIrpnaLnmoTpgInmi6nlmajkvJrlhajpg6jlpLHmlYjvvIxcclxuICAvLyDov5nph4zku44gI3Jvb3Qg5Ye65Y+R6YCS5b2S6YGN5Y6G77yM55So5paH5a2X5YaF5a65K+S9jee9ruajgOa1i+S+p+i+ueagj+OAglxyXG4gIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvb3RcIik7XHJcbiAgaWYgKHJvb3QpIHtcclxuICAgIHNjYW5EZWVwU2Vla1RyZWUocm9vdCwgMCk7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzY2FuRGVlcFNlZWtUcmVlKHBhcmVudCwgZGVwdGgpIHtcclxuICBpZiAoZGVwdGggPiA0KSByZXR1cm47XHJcbiAgZm9yIChjb25zdCBjaGlsZCBvZiBBcnJheS5mcm9tKHBhcmVudC5jaGlsZHJlbikpIHtcclxuICAgIGlmIChjaGlsZC5kYXRhc2V0LnFzaG90RGVlcHNlZWtIaWRkZW4gPT09IFwidHJ1ZVwiKSBjb250aW51ZTtcclxuICAgIGlmIChpc0RlZXBTZWVrU2lkZWJhckxpa2UoY2hpbGQpIHx8IGlzRGVlcFNlZWtCYWNrZHJvcExpa2UoY2hpbGQpKSB7XHJcbiAgICAgIGZvcmNlSGlkZUVsZW1lbnQoY2hpbGQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc2NhbkRlZXBTZWVrVHJlZShjaGlsZCwgZGVwdGggKyAxKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzRGVlcFNlZWtTaWRlYmFyTGlrZShlbGVtZW50KSB7XHJcbiAgaWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSB8fCBlbGVtZW50LmRhdGFzZXQucXNob3RLZWVwID09PSBcInRydWVcIikge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuICBpZiAoZWxlbWVudC5xdWVyeVNlbGVjdG9yKFwidGV4dGFyZWEsIFtjb250ZW50ZWRpdGFibGU9J3RydWUnXVwiKSkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgcmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgY29uc3Qgdmlld3BvcnRIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCB8fCAwO1xyXG4gIGNvbnN0IHZpZXdwb3J0V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGggfHwgMDtcclxuICBjb25zdCBjbGFzc05hbWUgPSB0eXBlb2YgZWxlbWVudC5jbGFzc05hbWUgPT09IFwic3RyaW5nXCIgPyBlbGVtZW50LmNsYXNzTmFtZSA6IFwiXCI7XHJcbiAgY29uc3QgdGV4dCA9IFN0cmluZyhlbGVtZW50LmlubmVyVGV4dCB8fCBlbGVtZW50LnRleHRDb250ZW50IHx8IFwiXCIpLnNsaWNlKDAsIDYwMCk7XHJcbiAgY29uc3QgbG9va3NMaWtlRGVlcFNlZWtNZW51ID1cclxuICAgIC9kZWVwc2Vla3zmlrDlr7nor5185byA5ZCv5paw5a+56K+dfOS7iuWkqXzmmKjlpKl85Y6G5Y+yfOS8muivnXxjaGF0L2kudGVzdCh0ZXh0KSB8fFxyXG4gICAgL3NpZGViYXJ8c2lkZS1iYXJ8c2lkZXJ8ZHJhd2VyfGhpc3Rvcnl8Y29udmVyc2F0aW9ufGNoYXQtbGlzdC9pLnRlc3QoY2xhc3NOYW1lKTtcclxuXHJcbiAgcmV0dXJuIGxvb2tzTGlrZURlZXBTZWVrTWVudSAmJlxyXG4gICAgcmVjdC5sZWZ0IDw9IE1hdGgubWF4KDI0LCB2aWV3cG9ydFdpZHRoICogMC4wOCkgJiZcclxuICAgIHJlY3QudG9wIDw9IDk2ICYmXHJcbiAgICByZWN0LndpZHRoID49IDE4MCAmJlxyXG4gICAgcmVjdC53aWR0aCA8PSBNYXRoLm1heCg0MjAsIHZpZXdwb3J0V2lkdGggKiAwLjcyKSAmJlxyXG4gICAgcmVjdC5oZWlnaHQgPj0gTWF0aC5tYXgoMzYwLCB2aWV3cG9ydEhlaWdodCAqIDAuNjUpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc0RlZXBTZWVrQmFja2Ryb3BMaWtlKGVsZW1lbnQpIHtcclxuICBpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQpIHx8IGVsZW1lbnQucXVlcnlTZWxlY3RvcihcInRleHRhcmVhLCBbY29udGVudGVkaXRhYmxlPSd0cnVlJ11cIikpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQgfHwgMDtcclxuICBjb25zdCB2aWV3cG9ydFdpZHRoID0gd2luZG93LmlubmVyV2lkdGggfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoIHx8IDA7XHJcbiAgaWYgKHJlY3Qud2lkdGggPCB2aWV3cG9ydFdpZHRoICogMC40NSB8fCByZWN0LmhlaWdodCA8IHZpZXdwb3J0SGVpZ2h0ICogMC42NSkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcclxuICBjb25zdCBiYWNrZ3JvdW5kID0gc3R5bGUuYmFja2dyb3VuZENvbG9yIHx8IFwiXCI7XHJcbiAgY29uc3QgaGFzRGltQmFja2dyb3VuZCA9IC9yZ2JhP1xcKFteKV0qLFxccyooMFxcLlsyLTldfFsxLTldKVxcKS8udGVzdChiYWNrZ3JvdW5kKTtcclxuICBjb25zdCBpc092ZXJsYXlQb3NpdGlvbiA9IHN0eWxlLnBvc2l0aW9uID09PSBcImZpeGVkXCIgfHwgc3R5bGUucG9zaXRpb24gPT09IFwiYWJzb2x1dGVcIiB8fCBzdHlsZS5wb3NpdGlvbiA9PT0gXCJzdGlja3lcIjtcclxuICByZXR1cm4gaXNPdmVybGF5UG9zaXRpb24gJiYgaGFzRGltQmFja2dyb3VuZDtcclxufVxyXG5cclxuZnVuY3Rpb24gZm9yY2VIaWRlRWxlbWVudChlbGVtZW50KSB7XHJcbiAgZWxlbWVudC5kYXRhc2V0LnFzaG90RGVlcHNlZWtIaWRkZW4gPSBcInRydWVcIjtcclxuICBlbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KFwiZGlzcGxheVwiLCBcIm5vbmVcIiwgXCJpbXBvcnRhbnRcIik7XHJcbiAgZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcInZpc2liaWxpdHlcIiwgXCJoaWRkZW5cIiwgXCJpbXBvcnRhbnRcIik7XHJcbiAgZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIm9wYWNpdHlcIiwgXCIwXCIsIFwiaW1wb3J0YW50XCIpO1xyXG4gIGVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoXCJwb2ludGVyLWV2ZW50c1wiLCBcIm5vbmVcIiwgXCJpbXBvcnRhbnRcIik7XHJcbiAgZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShcIndpZHRoXCIsIFwiMFwiLCBcImltcG9ydGFudFwiKTtcclxuICBlbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KFwibWluLXdpZHRoXCIsIFwiMFwiLCBcImltcG9ydGFudFwiKTtcclxuICBlbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KFwibWF4LXdpZHRoXCIsIFwiMFwiLCBcImltcG9ydGFudFwiKTtcclxuICBlbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KFwidHJhbnNmb3JtXCIsIFwidHJhbnNsYXRlWCgtMTIwJSlcIiwgXCJpbXBvcnRhbnRcIik7XHJcbn1cclxuIiwgImV4cG9ydCBjb25zdCBTRUFSQ0hfR1JPVVBTX1NUT1JBR0VfS0VZID0gXCJzZWFyY2hHcm91cHNcIjtcclxuZXhwb3J0IGNvbnN0IFBST01QVF9HUk9VUFNfU1RPUkFHRV9LRVkgPSBcInByb21wdEdyb3Vwc1wiO1xyXG5leHBvcnQgY29uc3QgVUlfUFJFRlNfU1RPUkFHRV9LRVkgPSBcInVpUHJlZnNcIjtcclxuZXhwb3J0IGNvbnN0IENVU1RPTV9TSVRFU19TVE9SQUdFX0tFWSA9IFwiY3VzdG9tU2l0ZXNcIjtcclxuZXhwb3J0IGNvbnN0IFJBTkRPTV9RVUVTVElPTlNfU1RPUkFHRV9LRVkgPSBcInJhbmRvbVF1ZXN0aW9uc1RleHRcIjtcclxuZXhwb3J0IGNvbnN0IFNFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZID0gXCJzZWFyY2hIaXN0b3J5XCI7XHJcblxyXG4vLyBUaGUgZml4ZWQgXCJBbGxcIiBwcm9tcHQgZ3JvdXA6IGFsd2F5cyBmaXJzdCwgY2Fubm90IGJlIGRlbGV0ZWQgb3IgcmVuYW1lZC5cclxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUFJPTVBUX0dST1VQX0lEID0gXCJwcm9tcHQtZ3JvdXAtZGVmYXVsdFwiO1xyXG5leHBvcnQgY29uc3QgTEVHQUNZX0RFRkFVTFRfR1JPVVBfTkFNRSA9IFwi6buY6K6k5YiG57uEXCI7XHJcblxyXG5leHBvcnQgY29uc3QgUkFORE9NX1FVRVNUSU9OU19GSUxFUyA9IHtcclxuICB6aDogXCJjb25maWcvcmFuZG9tLXF1ZXN0aW9ucy96aC1DTi50eHRcIixcclxuICBlbjogXCJjb25maWcvcmFuZG9tLXF1ZXN0aW9ucy9lbi50eHRcIixcclxufTtcclxuIiwgImltcG9ydCB7IFVJX1BSRUZTX1NUT1JBR0VfS0VZIH0gZnJvbSBcIi4vc3RvcmFnZS1rZXlzLmpzXCI7XHJcblxyXG5jb25zdCBESUFHTk9TVElDX0xPR19QUkVGX0tFWSA9IFwiZGlhZ25vc3RpY0xvZ3NFbmFibGVkXCI7XHJcbmNvbnN0IExPR19QUkVGSVggPSBcIltRc2hvdCBkaWFnbm9zdGljc11cIjtcclxuXHJcbmxldCBkaWFnbm9zdGljTG9nc0VuYWJsZWQgPSBmYWxzZTtcclxubGV0IGhhc0xvYWRlZFByZWZlcmVuY2UgPSBmYWxzZTtcclxuXHJcbmZ1bmN0aW9uIGdldENocm9tZVN0b3JhZ2UoKSB7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiBjaHJvbWU/LnN0b3JhZ2U/LmxvY2FsIHx8IG51bGw7XHJcbiAgfSBjYXRjaCAoX2Vycm9yKSB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWZyZXNoRGlhZ25vc3RpY0xvZ1ByZWZlcmVuY2UoKSB7XHJcbiAgY29uc3Qgc3RvcmFnZSA9IGdldENocm9tZVN0b3JhZ2UoKTtcclxuICBpZiAoIXN0b3JhZ2UpIHtcclxuICAgIGRpYWdub3N0aWNMb2dzRW5hYmxlZCA9IGZhbHNlO1xyXG4gICAgaGFzTG9hZGVkUHJlZmVyZW5jZSA9IHRydWU7XHJcbiAgICByZXR1cm4gZGlhZ25vc3RpY0xvZ3NFbmFibGVkO1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IHN0b3JlZCA9IGF3YWl0IHN0b3JhZ2UuZ2V0KFtVSV9QUkVGU19TVE9SQUdFX0tFWV0pO1xyXG4gICAgZGlhZ25vc3RpY0xvZ3NFbmFibGVkID0gc3RvcmVkW1VJX1BSRUZTX1NUT1JBR0VfS0VZXT8uW0RJQUdOT1NUSUNfTE9HX1BSRUZfS0VZXSA9PT0gdHJ1ZTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIGRpYWdub3N0aWNMb2dzRW5hYmxlZCA9IGZhbHNlO1xyXG4gIH1cclxuICBoYXNMb2FkZWRQcmVmZXJlbmNlID0gdHJ1ZTtcclxuICByZXR1cm4gZGlhZ25vc3RpY0xvZ3NFbmFibGVkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNEaWFnbm9zdGljTG9nZ2luZ0VuYWJsZWQoKSB7XHJcbiAgaWYgKCFoYXNMb2FkZWRQcmVmZXJlbmNlKSB7XHJcbiAgICByZWZyZXNoRGlhZ25vc3RpY0xvZ1ByZWZlcmVuY2UoKTtcclxuICB9XHJcbiAgcmV0dXJuIGRpYWdub3N0aWNMb2dzRW5hYmxlZDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRpYWdub3N0aWNMb2coc2NvcGUsIGV2ZW50TmFtZSwgZGV0YWlscyA9IHVuZGVmaW5lZCkge1xyXG4gIGlmICghaXNEaWFnbm9zdGljTG9nZ2luZ0VuYWJsZWQoKSkge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgbGFiZWwgPSBgJHtMT0dfUFJFRklYfSAke3Njb3BlfToke2V2ZW50TmFtZX1gO1xyXG4gIGlmIChkZXRhaWxzID09PSB1bmRlZmluZWQpIHtcclxuICAgIGNvbnNvbGUubG9nKGxhYmVsKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgY29uc29sZS5sb2cobGFiZWwsIHNhbml0aXplRGlhZ25vc3RpY0RldGFpbHMoZGV0YWlscykpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzYW5pdGl6ZURpYWdub3N0aWNEZXRhaWxzKHZhbHVlKSB7XHJcbiAgaWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09IFwib2JqZWN0XCIpIHtcclxuICAgIHJldHVybiB2YWx1ZTtcclxuICB9XHJcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XHJcbiAgICByZXR1cm4gdmFsdWUubWFwKHNhbml0aXplRGlhZ25vc3RpY0RldGFpbHMpO1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgb3V0cHV0ID0ge307XHJcbiAgT2JqZWN0LmVudHJpZXModmFsdWUpLmZvckVhY2goKFtrZXksIHJhd1ZhbHVlXSkgPT4ge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IGtleS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKG5vcm1hbGl6ZWRLZXkuaW5jbHVkZXMoXCJxdWVyeVwiKSB8fCBub3JtYWxpemVkS2V5LmluY2x1ZGVzKFwicHJvbXB0XCIpIHx8IG5vcm1hbGl6ZWRLZXkuaW5jbHVkZXMoXCJjb250ZW50XCIpKSB7XHJcbiAgICAgIG91dHB1dFtrZXldID0gZGVzY3JpYmVUZXh0VmFsdWUocmF3VmFsdWUpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAobm9ybWFsaXplZEtleS5pbmNsdWRlcyhcInVybFwiKSkge1xyXG4gICAgICBvdXRwdXRba2V5XSA9IHJhd1ZhbHVlID8gXCJbcmVkYWN0ZWQtdXJsXVwiIDogcmF3VmFsdWU7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChrZXkgPT09IFwic2l0ZVwiICYmIHJhd1ZhbHVlICYmIHR5cGVvZiByYXdWYWx1ZSA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICBvdXRwdXRba2V5XSA9IHsgaWQ6IHJhd1ZhbHVlLmlkLCBuYW1lOiByYXdWYWx1ZS5uYW1lIH07XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIG91dHB1dFtrZXldID0gc2FuaXRpemVEaWFnbm9zdGljRGV0YWlscyhyYXdWYWx1ZSk7XHJcbiAgfSk7XHJcbiAgcmV0dXJuIG91dHB1dDtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVzY3JpYmVUZXh0VmFsdWUodmFsdWUpIHtcclxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSB7XHJcbiAgICByZXR1cm4gdmFsdWUgPT0gbnVsbCA/IHZhbHVlIDogXCJbcmVkYWN0ZWRdXCI7XHJcbiAgfVxyXG4gIHJldHVybiBgW3JlZGFjdGVkIGxlbmd0aD0ke3ZhbHVlLmxlbmd0aH1dYDtcclxufVxyXG5cclxudHJ5IHtcclxuICByZWZyZXNoRGlhZ25vc3RpY0xvZ1ByZWZlcmVuY2UoKTtcclxuICBjaHJvbWU/LnN0b3JhZ2U/Lm9uQ2hhbmdlZD8uYWRkTGlzdGVuZXI/LigoY2hhbmdlcywgYXJlYU5hbWUpID0+IHtcclxuICAgIGlmIChhcmVhTmFtZSAhPT0gXCJsb2NhbFwiIHx8ICFjaGFuZ2VzW1VJX1BSRUZTX1NUT1JBR0VfS0VZXSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBuZXh0UHJlZnMgPSBjaGFuZ2VzW1VJX1BSRUZTX1NUT1JBR0VfS0VZXS5uZXdWYWx1ZTtcclxuICAgIGRpYWdub3N0aWNMb2dzRW5hYmxlZCA9IG5leHRQcmVmcz8uW0RJQUdOT1NUSUNfTE9HX1BSRUZfS0VZXSA9PT0gdHJ1ZTtcclxuICAgIGhhc0xvYWRlZFByZWZlcmVuY2UgPSB0cnVlO1xyXG4gIH0pO1xyXG59IGNhdGNoIChfZXJyb3IpIHtcclxuICBkaWFnbm9zdGljTG9nc0VuYWJsZWQgPSBmYWxzZTtcclxuICBoYXNMb2FkZWRQcmVmZXJlbmNlID0gdHJ1ZTtcclxufVxyXG4iLCAiLy8g5ZyoIGlmcmFtZSDlhoXmiorniLbpobUgcG9zdE1lc3NhZ2Ug6L+H5p2l55qEIEJsb2Ig5ZCI5oiQ5oiQIENsaXBib2FyZEV2ZW50KCdwYXN0ZScpXHJcbi8vIOa0vuWPkeWIsOermeeCuei+k+WFpeahhu+8jOeUseermeeCueiHqui6q+eahOeymOi0tOS4iuS8oOebkeWQrOWZqOaOpeeuoeaWh+S7tuS4iuS8oOOAglxyXG4vLyDmgJ3ot6/lr7nlupQgZG9jc+OAiuWkmiBBSSDnq5nngrnnu5/kuIDmlofku7bkuIrkvKDvvJrmioDmnK/ot6/nur/liIbmnpDjgIvnrKwgNCDoioLmlrnmoYggROOAglxyXG4vL1xyXG4vLyDlhbPplK7lt6XnqIvopoHngrnvvIjlrp7miJjpqozor4Hov4fnmoTlnZHvvInvvJpcclxuLy8gICAxKSDot6jkuIrkuIvmlofnlKggQmxvYu+8iOe7k+aehOWMluWFi+mahu+8iSsg5ZCM5pe25bimIG5hbWUvdHlwZS9zaXplIOWFg+aVsOaNru+8jFxyXG4vLyAgICAgIGluamVjdCDkvqfph43lu7ogRmlsZSDkv53or4EgRmlsZUxpc3Qg6IO96K+G5Yir44CCXHJcbi8vICAgMikg56uZ54K554m55a6a55qEIGZvY3VzIOmAieaLqeWZqOS8mOWFiOS6jumAmueUqOWFnOW6le+8iCNwcm9tcHQtdGV4dGFyZWEg5LmL5LqOIENoYXRHUFTjgIFcclxuLy8gICAgICAuY2hhdC1pbnB1dC1lZGl0b3Ig5LmL5LqOIEtpbWnjgIF0ZXh0YXJlYVtmb3JtY29udHJvbG5hbWU9J3Byb21wdFRleHQnXSDkuYvkuo5cclxuLy8gICAgICBHZW1pbmkg562J77yJ77yM6K6pIHBhc3RlIOS6i+S7tueahCB0YXJnZXQg5ZKM56uZ54K555uR5ZCs5Zmo5oyC6L296IqC54K55LiA6Ie044CCXHJcbi8vICAgMykgZm9jdXMg5b+F6aG75piv55yf5a6e55qEIGZvY3Vz77yI5LiN5bimIHByZXZlbnRTY3JvbGzvvInvvIzorqkgZG9jdW1lbnQuYWN0aXZlRWxlbWVudFxyXG4vLyAgICAgIOWwseS9je+8m+a0vuWPkeaXtuebtOaOpeeUqCB0YXJnZXTvvIzkuI3kvp3otZYgYWN0aXZlRWxlbWVudOKAlOKAlOi3qOWfnyBpZnJhbWUg5Zyo5rKh5pyJXHJcbi8vICAgICAgYnJvd3NlciBmb2N1cyDnmoTmg4XlhrXkuIsgZWxlbWVudC5mb2N1cygpIOS4jeS4gOWumuiDveiuqSBhY3RpdmVFbGVtZW50IOWIh+WIsOebruagh+OAglxyXG4vLyAgIDQpIOa0vuWPkeWQjuimgeeVmeWHuuaXtumXtOiuqeS4iuS8oOaOkumYn+ivt+axguWPkeWHuuWOu+OAgeaWh+S7tiBjaGlwIOa4suafk+WHuuadpe+8jOWGjeWbnuWOu+i1sFxyXG4vLyAgICAgIHNldFZhbHVlIOKGkiBzbWFydFN1Ym1pdO+8m+S4iuS8oOWujOaIkOeUseermeeCueiHquW3seeahCBVSe+8iHNlbmQg5oyJ6ZKuIGRpc2FibGVkL1xyXG4vLyAgICAgIGVuYWJsZWQg5YiH5o2i77yJ5o6n5Yi277yM5oiR5Lus55qEIHNtYXJ0U3VibWl0IOacrOadpeWwsei9ruivouaMiemSruWPr+eUqOaAge+8jOWkqeeEtuetieW+heOAglxyXG5cclxuaW1wb3J0IHsgZGlhZ25vc3RpY0xvZyB9IGZyb20gXCIuLi8uLi9zaGFyZWQvZGlhZ25vc3RpY3MuanNcIjtcclxuXHJcbmNvbnN0IE1JTUVfRVhUX0ZBTExCQUNLID0ge1xyXG4gIFwiaW1hZ2UvcG5nXCI6IFwicG5nXCIsXHJcbiAgXCJpbWFnZS9qcGVnXCI6IFwianBnXCIsXHJcbiAgXCJpbWFnZS9naWZcIjogXCJnaWZcIixcclxuICBcImltYWdlL3dlYnBcIjogXCJ3ZWJwXCIsXHJcbiAgXCJpbWFnZS9ibXBcIjogXCJibXBcIixcclxuICBcImltYWdlL3N2Zyt4bWxcIjogXCJzdmdcIixcclxuICBcImFwcGxpY2F0aW9uL3BkZlwiOiBcInBkZlwiLFxyXG4gIFwidGV4dC9wbGFpblwiOiBcInR4dFwiLFxyXG4gIFwidGV4dC9tYXJrZG93blwiOiBcIm1kXCIsXHJcbiAgXCJ0ZXh0L2NzdlwiOiBcImNzdlwiLFxyXG4gIFwiYXBwbGljYXRpb24vanNvblwiOiBcImpzb25cIixcclxuICBcImFwcGxpY2F0aW9uL3htbFwiOiBcInhtbFwiLFxyXG4gIFwidGV4dC94bWxcIjogXCJ4bWxcIlxyXG59O1xyXG5cclxuZnVuY3Rpb24gZW5zdXJlRmlsZU5hbWUobmFtZSwgdHlwZSkge1xyXG4gIGlmIChuYW1lKSByZXR1cm4gbmFtZTtcclxuICBjb25zdCBleHQgPSBNSU1FX0VYVF9GQUxMQkFDS1t0eXBlXSB8fCBcImJpblwiO1xyXG4gIHJldHVybiBgY2xpcGJvYXJkLSR7RGF0ZS5ub3coKX0uJHtleHR9YDtcclxufVxyXG5cclxuZnVuY3Rpb24gYmxvYlRvRmlsZShlbnRyeSkge1xyXG4gIC8vIOWFvOWuueS4pOenjeW9ouaAge+8mlxyXG4gIC8vICAgLSB7IGJsb2IsIG5hbWUsIHR5cGUsIHNpemUsIGxhc3RNb2RpZmllZCB977yI5o6o6I2Q77yM54i26aG15pi+5byP5YyF6KOF77yJXHJcbiAgLy8gICAtIOijuCBGaWxlIC8gQmxvYu+8iOmZjee6p++8iVxyXG4gIGxldCBibG9iID0gbnVsbDtcclxuICBsZXQgbmFtZSA9IFwiXCI7XHJcbiAgbGV0IHR5cGUgPSBcIlwiO1xyXG4gIGxldCBsYXN0TW9kaWZpZWQgPSBEYXRlLm5vdygpO1xyXG5cclxuICBpZiAoZW50cnkgJiYgdHlwZW9mIGVudHJ5ID09PSBcIm9iamVjdFwiICYmIGVudHJ5LmJsb2IgaW5zdGFuY2VvZiBCbG9iKSB7XHJcbiAgICBibG9iID0gZW50cnkuYmxvYjtcclxuICAgIG5hbWUgPSBlbnRyeS5uYW1lIHx8IFwiXCI7XHJcbiAgICB0eXBlID0gZW50cnkudHlwZSB8fCBibG9iLnR5cGUgfHwgXCJcIjtcclxuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoZW50cnkubGFzdE1vZGlmaWVkKSkge1xyXG4gICAgICBsYXN0TW9kaWZpZWQgPSBlbnRyeS5sYXN0TW9kaWZpZWQ7XHJcbiAgICB9XHJcbiAgfSBlbHNlIGlmIChlbnRyeSBpbnN0YW5jZW9mIEJsb2IpIHtcclxuICAgIGJsb2IgPSBlbnRyeTtcclxuICAgIG5hbWUgPSBlbnRyeS5uYW1lIHx8IFwiXCI7XHJcbiAgICB0eXBlID0gZW50cnkudHlwZSB8fCBcIlwiO1xyXG4gICAgaWYgKGVudHJ5Lmxhc3RNb2RpZmllZCkge1xyXG4gICAgICBsYXN0TW9kaWZpZWQgPSBlbnRyeS5sYXN0TW9kaWZpZWQ7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBpZiAoIShibG9iIGluc3RhbmNlb2YgQmxvYikpIHJldHVybiBudWxsO1xyXG5cclxuICBuYW1lID0gZW5zdXJlRmlsZU5hbWUobmFtZSwgdHlwZSk7XHJcbiAgdHlwZSA9IHR5cGUgfHwgXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIjtcclxuXHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiBuZXcgRmlsZShbYmxvYl0sIG5hbWUsIHsgdHlwZSwgbGFzdE1vZGlmaWVkIH0pO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgY29uc3QgZmFsbGJhY2sgPSBibG9iLnNsaWNlKDAsIGJsb2Iuc2l6ZSwgdHlwZSk7XHJcbiAgICB0cnkge1xyXG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZmFsbGJhY2ssIFwibmFtZVwiLCB7IHZhbHVlOiBuYW1lLCBjb25maWd1cmFibGU6IHRydWUgfSk7XHJcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShmYWxsYmFjaywgXCJsYXN0TW9kaWZpZWRcIiwgeyB2YWx1ZTogbGFzdE1vZGlmaWVkLCBjb25maWd1cmFibGU6IHRydWUgfSk7XHJcbiAgICB9IGNhdGNoIChfZXJyKSB7XHJcbiAgICAgIC8qIGlnbm9yZSAqL1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZhbGxiYWNrO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRDbGlwYm9hcmREYXRhVHJhbnNmZXIoZmlsZXMpIHtcclxuICBjb25zdCBkdCA9IG5ldyBEYXRhVHJhbnNmZXIoKTtcclxuICBmaWxlcy5mb3JFYWNoKChmaWxlKSA9PiB7XHJcbiAgICBpZiAoZmlsZSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGR0Lml0ZW1zLmFkZChmaWxlKTtcclxuICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XHJcbiAgICAgICAgLyogaWdub3JlICovXHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuICByZXR1cm4gZHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGJ1aWxkUGFzdGVFdmVudChmaWxlcykge1xyXG4gIGNvbnN0IGR0ID0gYnVpbGRDbGlwYm9hcmREYXRhVHJhbnNmZXIoZmlsZXMpO1xyXG4gIGlmICghZHQgfHwgIWR0LmZpbGVzIHx8IGR0LmZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICBjb25zdCBldmVudCA9IG5ldyBDbGlwYm9hcmRFdmVudChcInBhc3RlXCIsIHtcclxuICAgIGNsaXBib2FyZERhdGE6IGR0LFxyXG4gICAgYnViYmxlczogdHJ1ZSxcclxuICAgIGNhbmNlbGFibGU6IHRydWVcclxuICB9KTtcclxuXHJcbiAgLy8g5YWc5bqV77ya5Liq5Yir5rWP6KeI5Zmo54mI5pys5p6E6YCg5Zmo5Lya5b+955WlIGluaXQg5a2X5YW46YeM55qEIGNsaXBib2FyZERhdGHjgIJcclxuICB0cnkge1xyXG4gICAgaWYgKGV2ZW50LmNsaXBib2FyZERhdGEgIT09IGR0KSB7XHJcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShldmVudCwgXCJjbGlwYm9hcmREYXRhXCIsIHsgdmFsdWU6IGR0LCBjb25maWd1cmFibGU6IHRydWUgfSk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoX2Vycm9yKSB7XHJcbiAgICAvKiBpZ25vcmUgKi9cclxuICB9XHJcbiAgcmV0dXJuIHsgZXZlbnQsIGR0IH07XHJcbn1cclxuXHJcbi8vIOebtOaOpea0vuWPkeWIsCB0YXJnZXTvvIzkuI3nu5UgZG9jdW1lbnQuYWN0aXZlRWxlbWVudO+8mlxyXG4vLyDot6jln58gaWZyYW1lIOWcqOa1j+iniOWZqOayoeaKiiBmb2N1cyDnu5nliLDoh6rlt7Hml7bvvIxlbGVtZW50LmZvY3VzKCkg5LiN5LiA5a6a6K6pXHJcbi8vIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQg55yf5q2j5YiH5Yiw55uu5qCH5YWD57Sg77yI5b6I5aSa5Zy65pmv5LiL6L+Y5pivIGJvZHnvvInjgILov5nnp43mg4XlhrXkuItcclxuLy8g5rS+5Y+R5YiwIGFjdGl2ZUVsZW1lbnQoPWJvZHkpIOWHoOS5juiCr+WumuaUtuS4jeWIsOKAlOKAlENoYXRHUFQvQ2xhdWRlL0dlbWluaSDov5nnsbtcclxuLy8g5oqKIHBhc3RlIOebkeWQrOaMguWcqCBSZWFjdCDnvJbovpHlmajoioLngrnkuIrnmoTnq5nngrnpg73kvJrlpLHotKXjgIJcclxuLy9cclxuLy8g56uZ54K555qEIFJlYWN0L1Byb3NlTWlycm9yL0xleGljYWwg6YO95Lya5oqK55uR5ZCs5oyC5Zyo57yW6L6R5Zmo6IqC54K55LiK5bm25YaS5rOh5YiwIGRvY3VtZW5077yMXHJcbi8vIOebtOaOpea0vuWPkeWIsOe8lui+keWZqOiKgueCueaYr+acgOeos+eahOKAlOKAlOaXouiDveWRveS4ree8lui+keWZqOiHqui6q+eahOebkeWQrOWZqO+8jOS5n+iDvee7p+e7reWGkuazoeOAglxyXG5mdW5jdGlvbiBkaXNwYXRjaFBhc3RlKHRhcmdldCwgZmlsZXMpIHtcclxuICBjb25zdCBidWlsdCA9IGJ1aWxkUGFzdGVFdmVudChmaWxlcyk7XHJcbiAgaWYgKCFidWlsdCkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5wYXN0ZVwiLCBcImRpc3BhdGNoLXNraXAtZW1wdHktZmlsZWxpc3RcIiwgeyBleHBlY3RlZDogZmlsZXMubGVuZ3RoIH0pO1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgb2sgPSB0YXJnZXQuZGlzcGF0Y2hFdmVudChidWlsdC5ldmVudCk7XHJcbiAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5wYXN0ZVwiLCBcImRpc3BhdGNoZWRcIiwge1xyXG4gICAgdGFyZ2V0VGFnOiB0YXJnZXQ/LnRhZ05hbWUsXHJcbiAgICB0YXJnZXRJZDogdGFyZ2V0Py5pZCxcclxuICAgIHRhcmdldENsYXNzOiB0eXBlb2YgdGFyZ2V0Py5jbGFzc05hbWUgPT09IFwic3RyaW5nXCIgPyB0YXJnZXQuY2xhc3NOYW1lLnNsaWNlKDAsIDgwKSA6IFwiXCIsXHJcbiAgICBmaWxlQ291bnQ6IGJ1aWx0LmR0LmZpbGVzLmxlbmd0aCxcclxuICAgIGRlZmF1bHRQcmV2ZW50ZWQ6IGJ1aWx0LmV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQsXHJcbiAgICByZXR1cm5lZE9rOiBva1xyXG4gIH0pO1xyXG4gIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG4vLyDpobrnnYDkuIDnu4TpgInmi6nlmajmib7nrKzkuIDkuKrlrZjlnKjnmoTlhYPntKDvvIzmlK/mjIHnrYnlvoXvvIjnq5nngrkgU1BBIOawtOWQiO+8ieOAglxyXG5hc3luYyBmdW5jdGlvbiBmaW5kSW5wdXRFbGVtZW50KHNlbGVjdG9ycywgdGltZW91dE1zID0gNDAwMCkge1xyXG4gIGNvbnN0IGxpc3QgPSAoQXJyYXkuaXNBcnJheShzZWxlY3RvcnMpID8gc2VsZWN0b3JzIDogW3NlbGVjdG9yc10pLmZpbHRlcihCb29sZWFuKTtcclxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xyXG5cclxuICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyB0aW1lb3V0TXM7XHJcbiAgd2hpbGUgKERhdGUubm93KCkgPD0gZGVhZGxpbmUpIHtcclxuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgbGlzdCkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XHJcbiAgICAgICAgaWYgKGVsKSByZXR1cm4gZWw7XHJcbiAgICAgIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgICAgIC8qIOmAieaLqeWZqOmdnuazle+8jOi3s+i/hyAqL1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCA2MCkpO1xyXG4gIH1cclxuICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuLy8g6buY6K6k5YWc5bqV6YCJ5oup5Zmo77ya5LuO5pyA5bi46KeB55qE5a+M5paH5pys57yW6L6R5Zmo5YiwIHRleHRhcmVh44CCXHJcbmNvbnN0IERFRkFVTFRfSU5QVVRfU0VMRUNUT1JTID0gW1xyXG4gICdbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScsXHJcbiAgXCJ0ZXh0YXJlYVwiLFxyXG4gICdpbnB1dFt0eXBlPVwidGV4dFwiXSdcclxuXTtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxpdmVyRmlsZXNUb0lucHV0KGZpbGVFbnRyaWVzLCBleHBsaWNpdFNlbGVjdG9ycykge1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShmaWxlRW50cmllcykgfHwgZmlsZUVudHJpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gIGNvbnN0IGZpbGVzID0gZmlsZUVudHJpZXNcclxuICAgIC5tYXAoYmxvYlRvRmlsZSlcclxuICAgIC5maWx0ZXIoKGYpID0+IGYgaW5zdGFuY2VvZiBCbG9iKTtcclxuICBpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0LnBhc3RlXCIsIFwicmVjb25zdHJ1Y3QtZmFpbGVkXCIsIHsgZXhwZWN0ZWQ6IGZpbGVFbnRyaWVzLmxlbmd0aCB9KTtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHNlbGVjdG9ycyA9IEFycmF5LmlzQXJyYXkoZXhwbGljaXRTZWxlY3RvcnMpICYmIGV4cGxpY2l0U2VsZWN0b3JzLmxlbmd0aCA+IDBcclxuICAgID8gZXhwbGljaXRTZWxlY3RvcnNcclxuICAgIDogREVGQVVMVF9JTlBVVF9TRUxFQ1RPUlM7XHJcblxyXG4gIGNvbnN0IHRhcmdldCA9IGF3YWl0IGZpbmRJbnB1dEVsZW1lbnQoc2VsZWN0b3JzKTtcclxuICBpZiAoIXRhcmdldCkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5wYXN0ZVwiLCBcImlucHV0LW5vdC1mb3VuZFwiLCB7IHNlbGVjdG9ycyB9KTtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIC8vIOecn+WuniBmb2N1c++8iOS4jeeUqCBwcmV2ZW50U2Nyb2xs77yJ77ya6K6pIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPSB0YXJnZXTvvIxcclxuICAvLyDnq5nngrnmioogcGFzdGUg55uR5ZCs5oyC5ZyoIGFjdGl2ZUVsZW1lbnQg5LiK5pe25omN6IO95pS25Yiw44CCXHJcbiAgdHJ5IHtcclxuICAgIHRhcmdldC5mb2N1cygpO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgLyog5Liq5Yir5a655Zmo5oum5oiqIGZvY3Vz77yM5b+955WlICovXHJcbiAgfVxyXG5cclxuICAvLyDnrYnlvoXkuIDkuIsgUHJvc2VNaXJyb3IvTGV4aWNhbC9WdWUg5rC05ZCI77yM5Lmf6K6pIGFjdGl2ZUVsZW1lbnQg55yf5q2j5bCx5L2N44CCXHJcbiAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMjAwKSk7XHJcblxyXG4gIGxldCBkaXNwYXRjaGVkID0gZmFsc2U7XHJcbiAgdHJ5IHtcclxuICAgIGRpc3BhdGNoZWQgPSBkaXNwYXRjaFBhc3RlKHRhcmdldCwgZmlsZXMpO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0LnBhc3RlXCIsIFwiZGlzcGF0Y2gtZXJyb3JcIiwgeyBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcclxuICAgIGRpc3BhdGNoZWQgPSBmYWxzZTtcclxuICB9XHJcblxyXG4gIC8vIOWPqua0vuWPkeS4gOasoe+8muWkmuaVsCBBSSDnq5nngrnnmoQgcGFzdGUg55uR5ZCs6YO95Lya5ZCM5q2l5oqK5paH5Lu25aGe6L+b5LiK5Lyg6Zif5YiX77yMXHJcbiAgLy8g6YeN6K+V5LiA5qyh5Lya6KKrIEtpbWkgLyDosYbljIXnrYnnq5nngrnlvZPmiJDkuKTmrKHni6znq4vkuIrkvKDvvIznu5PmnpzlsLHmmK/kuIDlvKDlm77lj5jkuKTku73jgIJcclxuXHJcbiAgLy8g57uZ5LiK5Lyg5o6S6Zif6K+35rGC5ZKMIFVJIGNoaXAg5riy5p+T55WZ5LiA54K55pe26Ze077yb55yf5q2j562J5b6FXCLkuIrkvKDlrozmiJDihpLlj5HpgIHmjInpkq7kuq7otbdcIlxyXG4gIC8vIOaYr+WcqCBleGVjdXRvci5qcyDnmoQgc21hcnRTdWJtaXQg6L2u6K+i6YeM5a6M5oiQ55qE77yI6KeBIGhhc0ZpbGVzIOWIhuaUr+mHjOWvuVxyXG4gIC8vIHN1Ym1pdFdhaXRNcyAvIHRpbWVvdXQg55qE5Yqo5oCB5pS+5aSn77yJ44CCXHJcbiAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNDAwKSk7XHJcblxyXG4gIHJldHVybiBkaXNwYXRjaGVkO1xyXG59XHJcblxyXG4vLyDku44gc2l0ZS5zZWFyY2hIYW5kbGVyIOmHjOaKveS4gOS7veacgOWPr+iDveeahOi+k+WFpeahhumAieaLqeWZqO+8jOeUqOS6jui+heWKqSBwYXN0ZSDlrprkvY3jgIJcclxuLy8g5LyY5YWI57qn77ya56ys5LiA5LiqIGZvY3VzIOatpemqpOeahCBzZWxlY3RvcnMgLyBzZWxlY3RvciDihpIg5Lu75L2V5pyJIHNlbGVjdG9ycyDnmoTmraXpqqTjgIJcclxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RJbnB1dFNlbGVjdG9yc0Zyb21IYW5kbGVyKGhhbmRsZXJDb25maWcpIHtcclxuICBpZiAoIWhhbmRsZXJDb25maWcgfHwgIUFycmF5LmlzQXJyYXkoaGFuZGxlckNvbmZpZy5zdGVwcykpIHJldHVybiBbXTtcclxuXHJcbiAgY29uc3QgY29sbGVjdCA9IChzdGVwKSA9PiB7XHJcbiAgICBpZiAoIXN0ZXApIHJldHVybiBbXTtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0ZXAuc2VsZWN0b3JzKSkgcmV0dXJuIHN0ZXAuc2VsZWN0b3JzLmZpbHRlcihCb29sZWFuKTtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KHN0ZXAuc2VsZWN0b3IpKSByZXR1cm4gc3RlcC5zZWxlY3Rvci5maWx0ZXIoQm9vbGVhbik7XHJcbiAgICBpZiAodHlwZW9mIHN0ZXAuc2VsZWN0b3IgPT09IFwic3RyaW5nXCIpIHJldHVybiBbc3RlcC5zZWxlY3Rvcl07XHJcbiAgICByZXR1cm4gW107XHJcbiAgfTtcclxuXHJcbiAgY29uc3QgZm9jdXNTdGVwID0gaGFuZGxlckNvbmZpZy5zdGVwcy5maW5kKChzKSA9PiBzPy5hY3Rpb24gPT09IFwiZm9jdXNcIik7XHJcbiAgY29uc3QgZm9jdXNTZWxlY3RvcnMgPSBjb2xsZWN0KGZvY3VzU3RlcCk7XHJcbiAgaWYgKGZvY3VzU2VsZWN0b3JzLmxlbmd0aCA+IDApIHJldHVybiBmb2N1c1NlbGVjdG9ycztcclxuXHJcbiAgZm9yIChjb25zdCBzdGVwIG9mIGhhbmRsZXJDb25maWcuc3RlcHMpIHtcclxuICAgIGNvbnN0IGdvdCA9IGNvbGxlY3Qoc3RlcCk7XHJcbiAgICBpZiAoZ290Lmxlbmd0aCA+IDApIHJldHVybiBnb3Q7XHJcbiAgfVxyXG4gIHJldHVybiBbXTtcclxufVxyXG4iLCAiY29uc3QgU0lURV9IQU5ETEVSU19QQVRIID0gXCJjb25maWcvc2l0ZUhhbmRsZXJzLmpzb25cIjtcclxuXHJcbmxldCBidWlsdGluU2l0ZXMgPSBudWxsO1xyXG5sZXQgYnVpbHRpblNpdGVzUHJvbWlzZSA9IG51bGw7XHJcbmxldCBkb21haW5JbmRleCA9IG51bGw7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZEJ1aWx0aW5TaXRlcyhvcHRpb25zID0ge30pIHtcclxuICBjb25zdCB7IGZhbGxiYWNrRW1wdHkgPSBmYWxzZSB9ID0gb3B0aW9ucztcclxuXHJcbiAgaWYgKGJ1aWx0aW5TaXRlcykgcmV0dXJuIGJ1aWx0aW5TaXRlcztcclxuICBpZiAoYnVpbHRpblNpdGVzUHJvbWlzZSkgcmV0dXJuIGJ1aWx0aW5TaXRlc1Byb21pc2U7XHJcblxyXG4gIGJ1aWx0aW5TaXRlc1Byb21pc2UgPSBmZXRjaChjaHJvbWUucnVudGltZS5nZXRVUkwoU0lURV9IQU5ETEVSU19QQVRIKSlcclxuICAgIC50aGVuKChyZXNwb25zZSkgPT4ge1xyXG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB0aHJvdyBuZXcgRXJyb3IoXCLml6Dms5Xor7vlj5bnq5nngrnphY3nva5cIik7XHJcbiAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9KVxyXG4gICAgLnRoZW4oKHBheWxvYWQpID0+IHtcclxuICAgICAgYnVpbHRpblNpdGVzID0gQXJyYXkuaXNBcnJheShwYXlsb2FkLnNpdGVzKSA/IHBheWxvYWQuc2l0ZXMgOiBbXTtcclxuICAgICAgZG9tYWluSW5kZXggPSBidWlsZERvbWFpbkluZGV4KGJ1aWx0aW5TaXRlcyk7XHJcbiAgICAgIHJldHVybiBidWlsdGluU2l0ZXM7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICBpZiAoIWZhbGxiYWNrRW1wdHkpIHRocm93IGVycm9yO1xyXG4gICAgICBidWlsdGluU2l0ZXMgPSBbXTtcclxuICAgICAgZG9tYWluSW5kZXggPSBuZXcgTWFwKCk7XHJcbiAgICAgIHJldHVybiBidWlsdGluU2l0ZXM7XHJcbiAgICB9KVxyXG4gICAgLmZpbmFsbHkoKCkgPT4ge1xyXG4gICAgICBidWlsdGluU2l0ZXNQcm9taXNlID0gbnVsbDtcclxuICAgIH0pO1xyXG5cclxuICByZXR1cm4gYnVpbHRpblNpdGVzUHJvbWlzZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbmRCdWlsdGluU2l0ZUZvckhvc3QoaG9zdG5hbWUsIG9wdGlvbnMgPSB7fSkge1xyXG4gIGNvbnN0IHNpdGVzID0gYXdhaXQgbG9hZEJ1aWx0aW5TaXRlcyhvcHRpb25zKTtcclxuICBjb25zdCBub3JtYWxpemVkSG9zdCA9IG5vcm1hbGl6ZUhvc3QoaG9zdG5hbWUpO1xyXG4gIGlmICghbm9ybWFsaXplZEhvc3QpIHJldHVybiBudWxsO1xyXG5cclxuICBjb25zdCBpbmRleCA9IGRvbWFpbkluZGV4IHx8IGJ1aWxkRG9tYWluSW5kZXgoc2l0ZXMpO1xyXG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGdldEhvc3RDYW5kaWRhdGVzKG5vcm1hbGl6ZWRIb3N0KSkge1xyXG4gICAgY29uc3QgbWF0Y2hlcyA9IGluZGV4LmdldChjYW5kaWRhdGUpO1xyXG4gICAgaWYgKG1hdGNoZXM/Lmxlbmd0aCkgcmV0dXJuIG1hdGNoZXNbMF07XHJcbiAgfVxyXG5cclxuICAvLyBGYWxsYmFjayBmb3IgdW51c3VhbCBtYXRjaCBwYXR0ZXJucyB0aGF0IGFyZSBub3QgcGxhaW4gZG9tYWlucy5cclxuICByZXR1cm4gc2l0ZXMuZmluZCgoc2l0ZSkgPT4gc2l0ZU1hdGNoZXNIb3N0KHNpdGUsIG5vcm1hbGl6ZWRIb3N0KSkgfHwgbnVsbDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUhvc3QodmFsdWUpIHtcclxuICByZXR1cm4gU3RyaW5nKHZhbHVlIHx8IFwiXCIpXHJcbiAgICAudHJpbSgpXHJcbiAgICAudG9Mb3dlckNhc2UoKVxyXG4gICAgLnJlcGxhY2UoL15cXCo6XFwvXFwvLywgXCJcIilcclxuICAgIC5yZXBsYWNlKC9eaHR0cHM/OlxcL1xcLy8sIFwiXCIpXHJcbiAgICAucmVwbGFjZSgvXlxcKlxcLi8sIFwiXCIpXHJcbiAgICAucmVwbGFjZSgvXnd3d1xcLi8sIFwiXCIpXHJcbiAgICAucmVwbGFjZSgvXFwvLiokLywgXCJcIilcclxuICAgIC5yZXBsYWNlKC86XFxkKyQvLCBcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGREb21haW5JbmRleChzaXRlcykge1xyXG4gIGNvbnN0IGluZGV4ID0gbmV3IE1hcCgpO1xyXG4gIChzaXRlcyB8fCBbXSkuZm9yRWFjaCgoc2l0ZSkgPT4ge1xyXG4gICAgY29uc3QgcGF0dGVybnMgPSBBcnJheS5pc0FycmF5KHNpdGUubWF0Y2hQYXR0ZXJucykgPyBzaXRlLm1hdGNoUGF0dGVybnMgOiBbXTtcclxuICAgIHBhdHRlcm5zLmZvckVhY2goKHBhdHRlcm4pID0+IHtcclxuICAgICAgY29uc3QgaG9zdCA9IG5vcm1hbGl6ZUhvc3QocGF0dGVybik7XHJcbiAgICAgIGlmICghaG9zdCkgcmV0dXJuO1xyXG4gICAgICBjb25zdCBsaXN0ID0gaW5kZXguZ2V0KGhvc3QpIHx8IFtdO1xyXG4gICAgICBsaXN0LnB1c2goc2l0ZSk7XHJcbiAgICAgIGluZGV4LnNldChob3N0LCBsaXN0KTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG4gIHJldHVybiBpbmRleDtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0SG9zdENhbmRpZGF0ZXMoaG9zdG5hbWUpIHtcclxuICBjb25zdCBwYXJ0cyA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKS5maWx0ZXIoQm9vbGVhbik7XHJcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtdO1xyXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGg7IGluZGV4ICs9IDEpIHtcclxuICAgIGNhbmRpZGF0ZXMucHVzaChwYXJ0cy5zbGljZShpbmRleCkuam9pbihcIi5cIikpO1xyXG4gIH1cclxuICByZXR1cm4gY2FuZGlkYXRlcztcclxufVxyXG5cclxuZnVuY3Rpb24gc2l0ZU1hdGNoZXNIb3N0KHNpdGUsIG5vcm1hbGl6ZWRIb3N0KSB7XHJcbiAgY29uc3QgcGF0dGVybnMgPSBBcnJheS5pc0FycmF5KHNpdGUubWF0Y2hQYXR0ZXJucykgPyBzaXRlLm1hdGNoUGF0dGVybnMgOiBbXTtcclxuICByZXR1cm4gcGF0dGVybnMuc29tZSgocGF0dGVybikgPT4ge1xyXG4gICAgY29uc3QgaG9zdCA9IG5vcm1hbGl6ZUhvc3QocGF0dGVybik7XHJcbiAgICByZXR1cm4gbm9ybWFsaXplZEhvc3QgPT09IGhvc3QgfHwgbm9ybWFsaXplZEhvc3QuZW5kc1dpdGgoYC4ke2hvc3R9YCk7XHJcbiAgfSk7XHJcbn1cclxuIiwgImltcG9ydCB7IEVYVEVOU0lPTl9PUklHSU4gfSBmcm9tIFwiLi9jb25zdGFudHMuanNcIjtcclxuaW1wb3J0IHsgZXhlY3V0ZVNpdGVIYW5kbGVyIH0gZnJvbSBcIi4vZXhlY3V0b3IuanNcIjtcclxuaW1wb3J0IHsgaGFuZGxlRXh0cmFjdFJlcXVlc3QgfSBmcm9tIFwiLi9leHRyYWN0b3IuanNcIjtcclxuaW1wb3J0IHsgaW5pdEVtYmVkU2lkZWJhckZpeCB9IGZyb20gXCIuL3NpZGViYXItZml4LmpzXCI7XHJcbmltcG9ydCB7IGRlbGl2ZXJGaWxlc1RvSW5wdXQsIGV4dHJhY3RJbnB1dFNlbGVjdG9yc0Zyb21IYW5kbGVyIH0gZnJvbSBcIi4vZmlsZS1wYXN0ZS5qc1wiO1xyXG5pbXBvcnQgeyBkaWFnbm9zdGljTG9nIH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9kaWFnbm9zdGljcy5qc1wiO1xyXG5pbXBvcnQgeyBmaW5kQnVpbHRpblNpdGVGb3JIb3N0IH0gZnJvbSBcIi4uLy4uL3NoYXJlZC9zaXRlLXJlZ2lzdHJ5LmpzXCI7XHJcblxyXG5jb25zdCByZXF1ZXN0UmVzdWx0cyA9IG5ldyBNYXAoKTtcclxuY29uc3QgcmVxdWVzdHNJblByb2dyZXNzID0gbmV3IFNldCgpO1xyXG5jb25zdCBSRVFVRVNUX1JFU1VMVF9UVExfTVMgPSA1ICogNjAgKiAxMDAwO1xyXG5jb25zdCBSRVFVRVNUX1JFU1VMVF9NQVggPSA4MDtcclxubGV0IGxhc3RSZXBvcnRlZFVybCA9IFwiXCI7XHJcblxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTZWFyY2hSZXF1ZXN0KG1lc3NhZ2UpIHtcclxuICBjb25zdCBxdWVyeSA9IFN0cmluZyhtZXNzYWdlLnF1ZXJ5IHx8IFwiXCIpLnRyaW0oKTtcclxuICBpZiAoIXF1ZXJ5KSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0LnNlYXJjaFwiLCBcImVtcHR5LXF1ZXJ5XCIsIHsgc2l0ZTogbWVzc2FnZS5zaXRlIH0pO1xyXG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBzaXRlSWQ6IG1lc3NhZ2Uuc2l0ZT8uaWQsIGVycm9yOiBcIuafpeivouS4uuepulwiIH07XHJcbiAgfVxyXG5cclxuICBjb25zdCBzaXRlID0gYXdhaXQgcmVzb2x2ZVNpdGUobWVzc2FnZS5zaXRlKTtcclxuICBpZiAoIXNpdGUgfHwgIXNpdGUuc2VhcmNoSGFuZGxlcikge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5zZWFyY2hcIiwgXCJzaXRlLXVubWF0Y2hlZFwiLCB7XHJcbiAgICAgIHNpdGU6IG1lc3NhZ2Uuc2l0ZSxcclxuICAgICAgaG9zdG5hbWU6IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZSxcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6IGZhbHNlLFxyXG4gICAgICBzaXRlSWQ6IG1lc3NhZ2Uuc2l0ZT8uaWQsXHJcbiAgICAgIGVycm9yOiBg5b2T5YmN6aG16Z2i5pyq5Yy56YWN5Yiw56uZ54K56YWN572uOiAke3dpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZX1gLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0LnNlYXJjaFwiLCBcImhhbmRsZXItc3RhcnRcIiwge1xyXG4gICAgICBzaXRlLFxyXG4gICAgICBob3N0bmFtZTogd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lLFxyXG4gICAgICBxdWVyeSxcclxuICAgIH0pO1xyXG5cclxuICAgIGF3YWl0IGV4ZWN1dGVTaXRlSGFuZGxlcihxdWVyeSwgc2l0ZS5zZWFyY2hIYW5kbGVyKTtcclxuICAgIHNjaGVkdWxlVXJsUmVwb3J0cyhzaXRlKTtcclxuICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3Quc2VhcmNoXCIsIFwiaGFuZGxlci1zdWNjZXNzXCIsIHsgc2l0ZSB9KTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG9rOiB0cnVlLFxyXG4gICAgICBzaXRlSWQ6IHNpdGUuaWQsXHJcbiAgICAgIG1lc3NhZ2U6IFwi5bey5Zyo5b2T5YmN5Y2h54mH5Lit5bCd6K+V5YaZ5YWl5p+l6K+i5bm26Kem5Y+R5Y+R6YCBXCIsXHJcbiAgICAgIGN1cnJlbnRVcmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmXHJcbiAgICB9O1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0LnNlYXJjaFwiLCBcImhhbmRsZXItZXJyb3JcIiwgeyBzaXRlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcclxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc2l0ZUlkOiBzaXRlLmlkLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xyXG4gIH1cclxufVxyXG5cclxuLy8g54us56uL55qE5paH5Lu25YiG5Y+R5rWB56iL77ya55So5oi35LiA5pem5Zyo54i26aG16YCJ5a6a5paH5Lu25bCx56uL5Yi75omn6KGM77yM5ZKMIHF1ZXJ5L3N1Ym1pdCDlrozlhajop6PogKbjgIJcclxuLy8g6L+Z5qC35LiK5Lyg6L+H56iL5a+555So5oi35Y+v6KeB77yI5q+P5byg5Y2h54mH5ZCE6Ieq55qE6L6T5YWl5qGG5LiK5pa55Ye6546w6ZmE5Lu2IGNoaXDvvInvvIzlkI7nu63mj5DkuqTmlofmnKzml7ZcclxuLy8g56uZ54K555qE5Y+R6YCB5oyJ6ZKu6YC76L6R5Lya6Ieq5Yqo5oqKXCLkuIrkvKDlrozmiJDmiY3lhYHorrjmj5DkuqRcIuWBmuaOie+8jOmBv+WFjeWQiOW5tuWPkemAgeaXtumBh+WIsOeahFxyXG4vLyByYWNlIGNvbmRpdGlvbu+8iOaWh+acrOW3sueCuSBzZW5kIOS9huaWh+S7tui/mOWcqOS4iuihjO+8ieOAglxyXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVGaWxlc1Bhc3RlUmVxdWVzdChtZXNzYWdlKSB7XHJcbiAgY29uc3QgZmlsZXMgPSBBcnJheS5pc0FycmF5KG1lc3NhZ2UuZmlsZXMpID8gbWVzc2FnZS5maWxlcyA6IFtdO1xyXG4gIGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcclxuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgc2l0ZUlkOiBtZXNzYWdlLnNpdGU/LmlkLCBlcnJvcjogXCLml6Dmlofku7blj6/nspjotLRcIiB9O1xyXG4gIH1cclxuXHJcbiAgY29uc3Qgc2l0ZSA9IGF3YWl0IHJlc29sdmVTaXRlKG1lc3NhZ2Uuc2l0ZSk7XHJcbiAgaWYgKCFzaXRlKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBvazogZmFsc2UsXHJcbiAgICAgIHNpdGVJZDogbWVzc2FnZS5zaXRlPy5pZCxcclxuICAgICAgZXJyb3I6IGDlvZPliY3pobXpnaLmnKrljLnphY3liLDnq5nngrnphY3nva46ICR7d2luZG93LmxvY2F0aW9uLmhvc3RuYW1lfWAsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGlucHV0U2VsZWN0b3JzID0gZXh0cmFjdElucHV0U2VsZWN0b3JzRnJvbUhhbmRsZXIoc2l0ZS5zZWFyY2hIYW5kbGVyKTtcclxuICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3QucGFzdGUtZmlsZXNcIiwgXCJzdGFydFwiLCB7XHJcbiAgICAgIHNpdGUsXHJcbiAgICAgIGZpbGVDb3VudDogZmlsZXMubGVuZ3RoLFxyXG4gICAgICB1c2VkU2VsZWN0b3JzOiBpbnB1dFNlbGVjdG9ycyxcclxuICAgIH0pO1xyXG4gICAgY29uc3QgZGVsaXZlcmVkID0gYXdhaXQgZGVsaXZlckZpbGVzVG9JbnB1dChmaWxlcywgaW5wdXRTZWxlY3RvcnMpO1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5wYXN0ZS1maWxlc1wiLCBcImNvbXBsZXRlXCIsIHsgc2l0ZSwgZGVsaXZlcmVkIH0pO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgb2s6ICEhZGVsaXZlcmVkLFxyXG4gICAgICBzaXRlSWQ6IHNpdGUuaWQsXHJcbiAgICAgIG1lc3NhZ2U6IGRlbGl2ZXJlZCA/IGDlt7LnspjotLQgJHtmaWxlcy5sZW5ndGh9IOS4quaWh+S7tmAgOiBcIuacquiDvea0vuWPkeWIsOi+k+WFpeahhlwiLFxyXG4gICAgfTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5wYXN0ZS1maWxlc1wiLCBcImVycm9yXCIsIHsgc2l0ZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSk7XHJcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHNpdGVJZDogc2l0ZS5pZCwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcclxuICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVTaXRlKGV4cGxpY2l0U2l0ZSkge1xyXG4gIGlmIChleHBsaWNpdFNpdGUgJiYgZXhwbGljaXRTaXRlLnNlYXJjaEhhbmRsZXIpIHtcclxuICAgIHJldHVybiBleHBsaWNpdFNpdGU7XHJcbiAgfVxyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gYXdhaXQgZmluZEJ1aWx0aW5TaXRlRm9ySG9zdCh3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUsIHsgZmFsbGJhY2tFbXB0eTogdHJ1ZSB9KTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3QucmVnaXN0cnlcIiwgXCJsb2FkLWZhaWxlZFwiLCB7IGVycm9yOiBfZXJyb3IubWVzc2FnZSB9KTtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbm90aWZ5UGFyZW50RnJhbWUocmVzdWx0KSB7XHJcbiAgaWYgKHdpbmRvdy5wYXJlbnQgPT09IHdpbmRvdykgcmV0dXJuO1xyXG4gIC8vIFN0cmljdGx5IHRhcmdldCBvdXIgb3duIGV4dGVuc2lvbiBwYWdlLiBJZiBpbmplY3QuanMgaGFwcGVucyB0byBydW5cclxuICAvLyBpbnNpZGUgYSBub24tZXh0ZW5zaW9uIHBhcmVudCBmcmFtZSwgdGhlIGJyb3dzZXIgZHJvcHMgdGhlIG1lc3NhZ2Ug4oCUXHJcbiAgLy8gcHJldmVudHMgbGVha2luZyBxdWVyeS9yZXN1bHQgdG8gYSB0aGlyZC1wYXJ0eSBwYXJlbnQuXHJcbiAgY29uc3QgdGFyZ2V0T3JpZ2luID0gRVhURU5TSU9OX09SSUdJTiB8fCBcIipcIjtcclxuICB0cnkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC5tZXNzYWdlXCIsIFwibm90aWZ5LXBhcmVudFwiLCByZXN1bHQpO1xyXG4gICAgd2luZG93LnBhcmVudC5wb3N0TWVzc2FnZShcclxuICAgICAge1xyXG4gICAgICAgIHR5cGU6IHJlc3VsdC50eXBlIHx8IFwiUVNIT1RfUkVTVUxUXCIsXHJcbiAgICAgICAgc2l0ZUlkOiByZXN1bHQuc2l0ZUlkLFxyXG4gICAgICAgIHJlcXVlc3RJZDogcmVzdWx0LnJlcXVlc3RJZCxcclxuICAgICAgICBvazogcmVzdWx0Lm9rLFxyXG4gICAgICAgIG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLFxyXG4gICAgICAgIGVycm9yOiByZXN1bHQuZXJyb3IsXHJcbiAgICAgICAgY3VycmVudFVybDogcmVzdWx0LmN1cnJlbnRVcmwsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRhcmdldE9yaWdpblxyXG4gICAgKTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3QubWVzc2FnZVwiLCBcIm5vdGlmeS1wYXJlbnQtZmFpbGVkXCIsIHsgZXJyb3I6IF9lcnJvci5tZXNzYWdlIH0pO1xyXG4gICAgLy8gbm8gcGFyZW50IGluIHRvcC10YWIgbW9kZVxyXG4gIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc2V0dXBVcmxSZXBvcnRpbmcoKSB7XHJcbiAgbGV0IHNpdGU7XHJcbiAgdHJ5IHtcclxuICAgIHNpdGUgPSBhd2FpdCByZXNvbHZlU2l0ZSgpO1xyXG4gIH0gY2F0Y2ggKF9lcnJvcikge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBpZiAoIXNpdGUpIHJldHVybjtcclxuXHJcbiAgcmVwb3J0Q3VycmVudFVybChzaXRlKTtcclxuXHJcbiAgY29uc3Qgb3JpZ2luYWxQdXNoU3RhdGUgPSBoaXN0b3J5LnB1c2hTdGF0ZS5iaW5kKGhpc3RvcnkpO1xyXG4gIGhpc3RvcnkucHVzaFN0YXRlID0gZnVuY3Rpb24gcGF0Y2hlZFB1c2hTdGF0ZSguLi5hcmdzKSB7XHJcbiAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsUHVzaFN0YXRlKC4uLmFyZ3MpO1xyXG4gICAgcmVwb3J0Q3VycmVudFVybChzaXRlKTtcclxuICAgIHJldHVybiB2YWx1ZTtcclxuICB9O1xyXG5cclxuICBjb25zdCBvcmlnaW5hbFJlcGxhY2VTdGF0ZSA9IGhpc3RvcnkucmVwbGFjZVN0YXRlLmJpbmQoaGlzdG9yeSk7XHJcbiAgaGlzdG9yeS5yZXBsYWNlU3RhdGUgPSBmdW5jdGlvbiBwYXRjaGVkUmVwbGFjZVN0YXRlKC4uLmFyZ3MpIHtcclxuICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxSZXBsYWNlU3RhdGUoLi4uYXJncyk7XHJcbiAgICByZXBvcnRDdXJyZW50VXJsKHNpdGUpO1xyXG4gICAgcmV0dXJuIHZhbHVlO1xyXG4gIH07XHJcblxyXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicG9wc3RhdGVcIiwgKCkgPT4gcmVwb3J0Q3VycmVudFVybChzaXRlKSk7XHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJoYXNoY2hhbmdlXCIsICgpID0+IHJlcG9ydEN1cnJlbnRVcmwoc2l0ZSkpO1xyXG4gIHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiByZXBvcnRDdXJyZW50VXJsKHNpdGUpLCAxNTAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVwb3J0Q3VycmVudFVybChzaXRlKSB7XHJcbiAgY29uc3QgY3VycmVudFVybCA9IHdpbmRvdy5sb2NhdGlvbi5ocmVmO1xyXG4gIGlmICghc2l0ZSB8fCAhY3VycmVudFVybCB8fCBjdXJyZW50VXJsID09PSBsYXN0UmVwb3J0ZWRVcmwgfHwgd2luZG93LnBhcmVudCA9PT0gd2luZG93KSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIGxhc3RSZXBvcnRlZFVybCA9IGN1cnJlbnRVcmw7XHJcbiAgY29uc3QgdGFyZ2V0T3JpZ2luID0gRVhURU5TSU9OX09SSUdJTiB8fCBcIipcIjtcclxuICAvLyBXcmFwIGluIHRyeS9jYXRjaDogaW5qZWN0LmpzIHJ1bnMgaW4gZXZlcnkgZnJhbWUgKGFsbF9mcmFtZXM6dHJ1ZSksIGFuZFxyXG4gIC8vIGZvciBhIHRoaXJkLXBhcnR5IHNpdGUncyBvd24gbmVzdGVkIGlmcmFtZSB0aGUgcGFyZW50IG9yaWdpbiBpcyB0aGUgc2l0ZVxyXG4gIC8vIGl0c2VsZiAoZS5nLiBodHRwczovL2dlbWluaS5nb29nbGUuY29tKSwgbm90IG91ciBleHRlbnNpb24uIHBvc3RNZXNzYWdlXHJcbiAgLy8gd2l0aCBhIG5vbi1tYXRjaGluZyB0YXJnZXRPcmlnaW4gdGhyb3dzIHN5bmNocm9ub3VzbHkgaW4gdGhhdCBjYXNlLlxyXG4gIC8vIFdlIHN0aWxsIHdhbnQgdGhlIHN0cmljdCBvcmlnaW4gY2hlY2sgdG8gcHJvdGVjdCBkYXRhIGxlYWthZ2UgdG9cclxuICAvLyBub24tZXh0ZW5zaW9uIHBhcmVudHMsIHNvIHdlIHN3YWxsb3cgdGhlIHJlc3VsdGluZyBlcnJvciBzaWxlbnRseS5cclxuICB0cnkge1xyXG4gICAgZGlhZ25vc3RpY0xvZyhcImluamVjdC51cmxcIiwgXCJyZXBvcnRcIiwgeyBzaXRlLCBjdXJyZW50VXJsIH0pO1xyXG4gICAgd2luZG93LnBhcmVudC5wb3N0TWVzc2FnZShcclxuICAgICAgeyB0eXBlOiBcIlFTSE9UX1VSTF9VUERBVEVcIiwgc2l0ZUlkOiBzaXRlLmlkLCBjdXJyZW50VXJsIH0sXHJcbiAgICAgIHRhcmdldE9yaWdpblxyXG4gICAgKTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3QudXJsXCIsIFwicmVwb3J0LWZhaWxlZFwiLCB7IHNpdGUsIGVycm9yOiBfZXJyb3IubWVzc2FnZSB9KTtcclxuICAgIC8vIFBhcmVudCBpcyBub3Qgb3VyIGV4dGVuc2lvbiBwYWdlIOKAlCB0aGF0J3MgZmluZSwganVzdCBza2lwIHRoZSByZXBvcnQuXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzY2hlZHVsZVVybFJlcG9ydHMoc2l0ZSkge1xyXG4gIHJlcG9ydEN1cnJlbnRVcmwoc2l0ZSk7XHJcbiAgWzgwMCwgMjAwMCwgNTAwMCwgMTAwMDBdLmZvckVhY2goKGRlbGF5TXMpID0+IHtcclxuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHJlcG9ydEN1cnJlbnRVcmwoc2l0ZSksIGRlbGF5TXMpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbnN0YWxsUnVudGltZU1lc3NhZ2VMaXN0ZW5lcigpIHtcclxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIF9zZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xyXG4gICAgaWYgKCFtZXNzYWdlIHx8IG1lc3NhZ2UudHlwZSAhPT0gXCJTRUFSQ0hfU0lURV9RVUVSWVwiKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgaGFuZGxlU2VhcmNoUmVxdWVzdChtZXNzYWdlKVxyXG4gICAgICAudGhlbigocmVzdWx0KSA9PiBzZW5kUmVzcG9uc2UocmVzdWx0KSlcclxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICAgIHNlbmRSZXNwb25zZSh7XHJcbiAgICAgICAgICBvazogZmFsc2UsXHJcbiAgICAgICAgICBzaXRlSWQ6IG1lc3NhZ2Uuc2l0ZT8uaWQsXHJcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZSxcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGluc3RhbGxXaW5kb3dNZXNzYWdlTGlzdGVuZXIoKSB7XHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xyXG4gICAgLy8gU2VjdXJpdHk6IG9ubHkgYWNjZXB0IG1lc3NhZ2VzIGZyb20gb3VyIG93biBleHRlbnNpb24gY29tcGFyZSBwYWdlLlxyXG4gICAgLy8gZXZlbnQub3JpZ2luIG11c3QgYmUgb3VyIGNocm9tZS1leHRlbnNpb246Ly88aWQ+IChicm93c2VyLWVuZm9yY2VkLFxyXG4gICAgLy8gdW5mb3JnZWFibGUpLCBhbmQgZXZlbnQuc291cmNlIG11c3QgYmUgd2luZG93LnBhcmVudCAocnVsZXMgb3V0XHJcbiAgICAvLyBhZHZlcnNhcmlhbCBuZXN0ZWQgaWZyYW1lcyBvZiB0aGUgc2FtZSBBSSBzaXRlKS5cclxuICAgIGlmIChFWFRFTlNJT05fT1JJR0lOKSB7XHJcbiAgICAgIGlmIChldmVudC5vcmlnaW4gIT09IEVYVEVOU0lPTl9PUklHSU4pIHJldHVybjtcclxuICAgICAgaWYgKGV2ZW50LnNvdXJjZSAhPT0gd2luZG93LnBhcmVudCkgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghZXZlbnQuZGF0YSkgcmV0dXJuO1xyXG5cclxuICAgIGlmIChldmVudC5kYXRhLnR5cGUgPT09IFwiUVNIT1RfRVhUUkFDVFwiKSB7XHJcbiAgICAgIGhhbmRsZUV4dHJhY3RSZXF1ZXN0KGV2ZW50LmRhdGEpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gXCJRU0hPVF9QQVNURV9GSUxFU1wiKSB7XHJcbiAgICAgIGNvbnN0IHJlcXVlc3RJZCA9IGV2ZW50LmRhdGEucmVxdWVzdElkO1xyXG4gICAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0Lm1lc3NhZ2VcIiwgXCJwYXN0ZS1maWxlcy1yZWNlaXZlZFwiLCB7XHJcbiAgICAgICAgc2l0ZTogZXZlbnQuZGF0YS5zaXRlLFxyXG4gICAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgICBmaWxlQ291bnQ6IEFycmF5LmlzQXJyYXkoZXZlbnQuZGF0YS5maWxlcykgPyBldmVudC5kYXRhLmZpbGVzLmxlbmd0aCA6IDAsXHJcbiAgICAgIH0pO1xyXG4gICAgICBoYW5kbGVGaWxlc1Bhc3RlUmVxdWVzdChldmVudC5kYXRhKVxyXG4gICAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcclxuICAgICAgICAgIG5vdGlmeVBhcmVudEZyYW1lKHsgLi4ucmVzdWx0LCByZXF1ZXN0SWQsIHR5cGU6IFwiUVNIT1RfUEFTVEVfUkVTVUxUXCIgfSk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICBub3RpZnlQYXJlbnRGcmFtZSh7XHJcbiAgICAgICAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgICAgICAgc2l0ZUlkOiBldmVudC5kYXRhLnNpdGU/LmlkLFxyXG4gICAgICAgICAgICByZXF1ZXN0SWQsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiUVNIT1RfUEFTVEVfUkVTVUxUXCIsXHJcbiAgICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlLFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZXZlbnQuZGF0YS50eXBlICE9PSBcIlFTSE9UX1NFQVJDSFwiKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgcmVxdWVzdElkID0gZXZlbnQuZGF0YS5yZXF1ZXN0SWQ7XHJcbiAgICBkaWFnbm9zdGljTG9nKFwiaW5qZWN0Lm1lc3NhZ2VcIiwgXCJzZWFyY2gtcmVjZWl2ZWRcIiwge1xyXG4gICAgICBzaXRlOiBldmVudC5kYXRhLnNpdGUsXHJcbiAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgcXVlcnk6IGV2ZW50LmRhdGEucXVlcnksXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGNhY2hlZFJlc3VsdCA9IHJlcXVlc3RJZCA/IGdldENhY2hlZFJlcXVlc3RSZXN1bHQocmVxdWVzdElkKSA6IG51bGw7XHJcbiAgICBpZiAoY2FjaGVkUmVzdWx0KSB7XHJcbiAgICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3QubWVzc2FnZVwiLCBcInJldHVybi1jYWNoZWQtcmVzdWx0XCIsIHsgcmVxdWVzdElkLCBzaXRlOiBldmVudC5kYXRhLnNpdGUgfSk7XHJcbiAgICAgIG5vdGlmeVBhcmVudEZyYW1lKGNhY2hlZFJlc3VsdCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChyZXF1ZXN0SWQgJiYgcmVxdWVzdHNJblByb2dyZXNzLmhhcyhyZXF1ZXN0SWQpKSB7XHJcbiAgICAgIGRpYWdub3N0aWNMb2coXCJpbmplY3QubWVzc2FnZVwiLCBcImR1cGxpY2F0ZS1pbi1wcm9ncmVzc1wiLCB7IHJlcXVlc3RJZCwgc2l0ZTogZXZlbnQuZGF0YS5zaXRlIH0pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAocmVxdWVzdElkKSByZXF1ZXN0c0luUHJvZ3Jlc3MuYWRkKHJlcXVlc3RJZCk7XHJcblxyXG4gICAgaGFuZGxlU2VhcmNoUmVxdWVzdChldmVudC5kYXRhKVxyXG4gICAgICAudGhlbigocmVzdWx0KSA9PiB7XHJcbiAgICAgICAgY29uc3QgZmluYWxSZXN1bHQgPSB7IC4uLnJlc3VsdCwgcmVxdWVzdElkIH07XHJcbiAgICAgICAgaWYgKHJlcXVlc3RJZCkge1xyXG4gICAgICAgICAgc3RvcmVSZXF1ZXN0UmVzdWx0KHJlcXVlc3RJZCwgZmluYWxSZXN1bHQpO1xyXG4gICAgICAgICAgcmVxdWVzdHNJblByb2dyZXNzLmRlbGV0ZShyZXF1ZXN0SWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBub3RpZnlQYXJlbnRGcmFtZShmaW5hbFJlc3VsdCk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcclxuICAgICAgICBjb25zdCBmaW5hbFJlc3VsdCA9IHtcclxuICAgICAgICAgIG9rOiBmYWxzZSxcclxuICAgICAgICAgIHNpdGVJZDogZXZlbnQuZGF0YS5zaXRlPy5pZCxcclxuICAgICAgICAgIHJlcXVlc3RJZCxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlLFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgaWYgKHJlcXVlc3RJZCkge1xyXG4gICAgICAgICAgc3RvcmVSZXF1ZXN0UmVzdWx0KHJlcXVlc3RJZCwgZmluYWxSZXN1bHQpO1xyXG4gICAgICAgICAgcmVxdWVzdHNJblByb2dyZXNzLmRlbGV0ZShyZXF1ZXN0SWQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBub3RpZnlQYXJlbnRGcmFtZShmaW5hbFJlc3VsdCk7XHJcbiAgICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRDYWNoZWRSZXF1ZXN0UmVzdWx0KHJlcXVlc3RJZCkge1xyXG4gIHBydW5lUmVxdWVzdFJlc3VsdHMoKTtcclxuICByZXR1cm4gcmVxdWVzdFJlc3VsdHMuZ2V0KHJlcXVlc3RJZCk/LnJlc3VsdCB8fCBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9yZVJlcXVlc3RSZXN1bHQocmVxdWVzdElkLCByZXN1bHQpIHtcclxuICByZXF1ZXN0UmVzdWx0cy5zZXQocmVxdWVzdElkLCB7XHJcbiAgICByZXN1bHQsXHJcbiAgICBzdG9yZWRBdDogRGF0ZS5ub3coKVxyXG4gIH0pO1xyXG4gIHBydW5lUmVxdWVzdFJlc3VsdHMoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcHJ1bmVSZXF1ZXN0UmVzdWx0cygpIHtcclxuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gIGZvciAoY29uc3QgW3JlcXVlc3RJZCwgZW50cnldIG9mIHJlcXVlc3RSZXN1bHRzKSB7XHJcbiAgICBpZiAoIWVudHJ5IHx8IG5vdyAtIGVudHJ5LnN0b3JlZEF0ID4gUkVRVUVTVF9SRVNVTFRfVFRMX01TKSB7XHJcbiAgICAgIHJlcXVlc3RSZXN1bHRzLmRlbGV0ZShyZXF1ZXN0SWQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgd2hpbGUgKHJlcXVlc3RSZXN1bHRzLnNpemUgPiBSRVFVRVNUX1JFU1VMVF9NQVgpIHtcclxuICAgIGNvbnN0IG9sZGVzdEtleSA9IHJlcXVlc3RSZXN1bHRzLmtleXMoKS5uZXh0KCkudmFsdWU7XHJcbiAgICBpZiAoIW9sZGVzdEtleSkgYnJlYWs7XHJcbiAgICByZXF1ZXN0UmVzdWx0cy5kZWxldGUob2xkZXN0S2V5KTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBpbml0SW5qZWN0U2NyaXB0KCkge1xyXG4gIGNvbnN0IGlzR3Jva0ZyYW1lID0gd2luZG93LnBhcmVudCAhPT0gd2luZG93ICYmIC8oXnxcXC4pZ3Jva1xcLmNvbSQvaS50ZXN0KHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZSk7XHJcbiAgLy8gR3JvayDlr7kgaWZyYW1lIOWQr+WKqOeOr+Wig+W+iOaVj+aEn+OAguS4jeimgeWcqOWug+WQr+WKqOWJjSBwYXRjaCBoaXN0b3J5XHJcbiAgLy8g5oiW5rOo5YWl6ZqQ6JeP5L6n6L655qCPIENTU++8m+WPquS/neeVmea2iOaBr+ebkeWQrO+8jOS/neivgeWQjue7reS7jeWPr+iHquWKqOWPkemAgeOAglxyXG4gIGlmICghaXNHcm9rRnJhbWUpIHtcclxuICAgIHNldHVwVXJsUmVwb3J0aW5nKCk7XHJcbiAgfVxyXG4gIGluc3RhbGxSdW50aW1lTWVzc2FnZUxpc3RlbmVyKCk7XHJcbiAgaW5zdGFsbFdpbmRvd01lc3NhZ2VMaXN0ZW5lcigpO1xyXG4gIGlmICghaXNHcm9rRnJhbWUpIHtcclxuICAgIGluaXRFbWJlZFNpZGViYXJGaXgocmVzb2x2ZVNpdGUpO1xyXG4gIH1cclxufVxyXG4iLCAiaW1wb3J0IHsgaW5pdEluamVjdFNjcmlwdCB9IGZyb20gXCIuL2luamVjdC9tYWluLmpzXCI7XHJcblxyXG5pbml0SW5qZWN0U2NyaXB0KCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7O0FBS08sTUFBTSxtQkFDWCxPQUFPLFdBQVcsZUFBZSxPQUFPLFdBQVcsT0FBTyxRQUFRLEtBQzlELHNCQUFzQixPQUFPLFFBQVEsRUFBRSxLQUN2QztBQUtDLE1BQU0saUJBQWlCLG9CQUFJLElBQUksQ0FBQyxTQUFTLFlBQVksYUFBYSxDQUFDO0FBRW5FLFdBQVMsTUFBTSxJQUFJO0FBQ3hCLFdBQU8sSUFBSSxRQUFRLENBQUMsWUFBWSxXQUFXLFNBQVMsRUFBRSxDQUFDO0FBQUEsRUFDekQ7OztBQ2RPLFdBQVMsVUFBVSxTQUFTO0FBQ2pDLFFBQUksQ0FBQyxXQUFXLE9BQU8sUUFBUSxVQUFVLFlBQVk7QUFDbkQ7QUFBQSxJQUNGO0FBQ0EsUUFBSTtBQUNGLGNBQVEsTUFBTSxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsSUFDdkMsU0FBUyxRQUFRO0FBQ2YsY0FBUSxNQUFNO0FBQUEsSUFDaEI7QUFBQSxFQUNGO0FBRU8sV0FBUyxjQUFjLFNBQVM7QUFD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LHVCQUF1QjtBQUMxRCx1QkFBZSxPQUFPLFNBQVM7QUFBQSxNQUNqQztBQUFBLElBQ0Y7QUFFQSxXQUFPLGVBQWUsT0FBTyxvQkFBb0I7QUFDL0MsWUFBTSxZQUFZLGVBQWUsS0FBSyxFQUFFLEtBQUssRUFBRTtBQUMvQyxVQUFJLENBQUMsVUFBVztBQUNoQixxQkFBZSxPQUFPLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Y7QUFFTyxXQUFTLG1CQUFtQjtBQUNqQyxVQUFNLGNBQWMsT0FBTyxXQUFXLFVBQVUsb0JBQW9CLEtBQUssT0FBTyxTQUFTLFFBQVE7QUFHakcsUUFBSSxDQUFDLGFBQWE7QUFDaEIsd0JBQWtCO0FBQUEsSUFDcEI7QUFDQSxrQ0FBOEI7QUFDOUIsaUNBQTZCO0FBQzdCLFFBQUksQ0FBQyxhQUFhO0FBQ2hCLDBCQUFvQixXQUFXO0FBQUEsSUFDakM7QUFBQSxFQUNGOzs7QUNqVkEsbUJBQWlCOyIsCiAgIm5hbWVzIjogWyJyZXNvbHZlU2l0ZSIsICJyZXF1ZXN0SWQiXQp9Cg==
