import { safeFocus } from "./dom-utils.js";

export function setContenteditableValue(element, query) {
  const text = String(query || "");
  safeFocus(element);

  // Slate.js editors (qianwen etc.) need a dedicated branch — a plain
  // execCommand("insertText") would drop a stray text node without Slate's
  // React model updating, so the placeholder layer stays visible and the
  // send button remains disabled.
  if (isSlateEditor(element)) {
    updateSlateEditorContent(element, text);
    return;
  }

  // Select all current contents first so insertText replaces rather than
  // appends — avoids duplicated text in Lexical (Kimi) etc. and keeps each
  // write idempotent.
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

  // Preferred path: document.execCommand("insertText"). It dispatches native
  // beforeinput/input events with inputType="insertText", which ProseMirror
  // (ChatGPT), Lexical, etc. rely on to update their internal model and
  // trigger a React re-render that enables the send button.
  let inserted = false;
  if (selectionSet || document.activeElement === element) {
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (_error) {
      inserted = false;
    }
  }

  if (inserted) {
    // If execCommand reported success we must NOT verify DOM synchronously.
    // Vue (kimi.com), Lexical, ProseMirror write into their model first and
    // flush to DOM on the next tick; a sync read would see empty and the
    // fallback below would synthesize a second beforeinput — Kimi users
    // ended up with the same query pasted twice. The outer
    // executeSetValue retry loop handles delayed verification instead.
    return;
  }

  // Fallback: only when execCommand was refused. The native beforeinput
  // never fired, the editor's model has no text, so we can safely first-write
  // via synthetic events + direct DOM mutation without risking duplication.
  const isLexicalEditor =
    element.hasAttribute("data-lexical-editor") ||
    element.getAttribute("data-lexical-editor") === "true";

  if (isLexicalEditor) {
    updateLexicalEditorContent(element, text);
    return;
  }

  updateGenericContenteditable(element, text);
}

export function isSlateEditor(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return false;
  }
  return (
    element.getAttribute("data-slate-editor") === "true" ||
    element.hasAttribute("data-slate-node") ||
    element.hasAttribute("data-slate-string")
  );
}

// Slate keeps its own Editor+Selection model; only a valid beforeinput with
// inputType="insertText" and data=<text> triggers Transforms.insertText, which
// updates the model, clears the placeholder layer and enables the send button.
export function updateSlateEditorContent(element, query) {
  safeFocus(element);

  // Step 1: cover all existing content with a selection. Slate's beforeinput
  // handler reads window.getSelection(); without one it silently returns.
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

  // Step 2: if there's leftover text, have Slate clear its own model via
  // deleteContentBackward rather than mutating DOM directly.
  const existingText = String(element.textContent || "");
  if (existingText.trim()) {
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      })
    );
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      })
    );
  }

  if (!query) {
    return;
  }

  // Step 3: dispatch beforeinput(insertText). Slate's handler calls
  // Transforms.insertText(editor, query), React re-renders, the placeholder
  // clears and the send button enables. cancelable:true lets Slate
  // preventDefault() the browser's own text insertion to avoid duplicates.
  element.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: query,
    })
  );

  // Some Slate wrappers (Plate etc.) also sync on input; emit a matching one.
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: query,
    })
  );

  // Step 4: fallback. If Slate hasn't finished mounting (SPA route switch),
  // beforeinput can be dropped. Only when the selection failed AND DOM is
  // still empty do we write a text node directly so the outer verifier can
  // pass and we don't loop forever.
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

export function updateLexicalEditorContent(element, query) {
  safeFocus(element);

  // Prefer selection + beforeinput so Lexical updates its own EditorState
  // (which is what actually re-enables the send button).
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

  // beforeinput + input + change only. No composition events — those put
  // Lexical into IME mode and compositionend would clobber our text on commit,
  // re-disabling the send button.
  dispatchLexicalEvents(element, query);

  // Fallback: if the text didn't actually land in DOM (not fully hydrated /
  // beforeinput swallowed), mutate DOM so the verifier sees the text and
  // executeSetValue stops retrying.
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

export function updateGenericContenteditable(element, query) {
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

// Lexical-only event set: no composition events (see comment above).
export function dispatchLexicalEvents(element, query) {
  element.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: query,
    })
  );
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: query,
    })
  );
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

// Generic contenteditable event set — includes composition events for non-Lexical editors.
export function dispatchContenteditableEvents(element, query) {
  element.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: query,
    })
  );

  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: query,
    })
  );

  element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  element.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: query }));
  element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: query }));
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}
