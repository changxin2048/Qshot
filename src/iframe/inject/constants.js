// The extension compare page origin — used to validate incoming postMessages
// and to target outgoing postMessages. inject.js is injected into every
// matching frame, so without this origin check any third-party page could
// forge QSHOT_SEARCH / QSHOT_EXTRACT messages and weaponize a logged-in AI
// tab on the user's behalf.
export const EXTENSION_ORIGIN =
  typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id
    ? `chrome-extension://${chrome.runtime.id}`
    : null;

// These actions actually "submit". Once one of them has fired successfully we
// must not let later fallback steps (extra click / synthesized Enter) re-fire,
// otherwise sites like ChatGPT/ProseMirror submit the same query twice.
export const SUBMIT_ACTIONS = new Set(["click", "sendKeys", "smartSubmit"]);

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
