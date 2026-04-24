// Focus an element without triggering the browser's default "scroll focused
// element into view" behavior, which would jitter the outer .iframes-container
// scrollLeft/scrollTop.
export function safeFocus(element) {
  if (!element || typeof element.focus !== "function") {
    return;
  }
  try {
    element.focus({ preventScroll: true });
  } catch (_error) {
    element.focus();
  }
}

export function isTextControl(element) {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

export function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(element, value);
    return;
  }
  element.value = value;
}

export function dispatchEventList(element, events) {
  events.forEach((eventName) => {
    let event;
    if (eventName === "input") {
      event = new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        data: "",
        inputType: "insertText",
      });
    } else {
      event = new Event(eventName, { bubbles: true, cancelable: true });
    }
    element.dispatchEvent(event);
  });
}

export function dispatchKeyboardEvent(element, phase, key) {
  const event = new KeyboardEvent(phase, {
    key,
    code: key === "Enter" ? "Enter" : key,
    keyCode: key === "Enter" ? 13 : 0,
    which: key === "Enter" ? 13 : 0,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

export function detectInputType(element) {
  if (element.isContentEditable) {
    return "contenteditable";
  }
  return "text";
}
