import { state, t, formatHistoryDate } from "./state.js";
import { SEARCH_HISTORY_STORAGE_KEY } from "../../shared/storage-keys.js";

export function renderHistoryIfOpen() {
  if (!state.shadowRoot) return;
  const historyList = state.shadowRoot.querySelector(".history-list");
  if (!(historyList instanceof HTMLElement)) return;

  historyList.innerHTML = "";

  if (!state.historyEntries.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = t("overlay_emptyHistory", null, "暂无搜索记录");
    historyList.appendChild(empty);
    return;
  }

  state.historyEntries.forEach((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "history-item";

    const line = document.createElement("div");
    line.className = "history-line";

    const query = document.createElement("div");
    query.className = "history-query";
    query.textContent = String(entry?.query || "").replace(/\s+/g, " ").trim();

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = formatHistoryDate(entry?.createdAt);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "history-delete-btn";
    deleteBtn.setAttribute("aria-label", t("overlay_deleteHistoryEntry", null, "删除这条记录"));
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await removeHistoryEntry(entry);
    });

    line.appendChild(query);
    line.appendChild(meta);
    item.appendChild(line);
    item.appendChild(deleteBtn);
    item.addEventListener("click", () => {
      const queryInput = state.shadowRoot?.querySelector(".query-input");
      if (queryInput instanceof HTMLTextAreaElement) {
        queryInput.value = entry?.query || "";
        // syncComposerLayout is called by main via input event subscription;
        // dispatch an input event so the layout updates for the pasted text.
        queryInput.dispatchEvent(new Event("input", { bubbles: true }));
        queryInput.focus();
      }
    });
    historyList.appendChild(item);
  });
}

async function removeHistoryEntry(entry) {
  try {
    const stored = await chrome.storage.local.get([SEARCH_HISTORY_STORAGE_KEY]);
    const fullHistory = Array.isArray(stored[SEARCH_HISTORY_STORAGE_KEY])
      ? stored[SEARCH_HISTORY_STORAGE_KEY]
      : [];
    if (!fullHistory.length) return;

    let removed = false;
    const nextHistory = fullHistory.filter((item) => {
      if (removed) return true;
      if (entry?.id && item?.id === entry.id) {
        removed = true;
        return false;
      }
      if (!entry?.id && item?.query === entry?.query && item?.createdAt === entry?.createdAt) {
        removed = true;
        return false;
      }
      return true;
    });

    if (!removed) return;
    await chrome.storage.local.set({ [SEARCH_HISTORY_STORAGE_KEY]: nextHistory });
  } catch (_err) {
    /* ignored */
  }
}
