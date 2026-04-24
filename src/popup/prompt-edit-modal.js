import { state, escapeHtml } from "./state.js";
import { PROMPT_GROUPS_STORAGE_KEY } from "../shared/storage-keys.js";
import { getPromptGroupDisplayName } from "../shared/prompt-groups.js";
import { closePromptPicker } from "./sections.js";

export function openPopupPromptEditModal(prompt, groupId) {
  closePromptPicker();
  const targetGroup =
    state.promptGroups.find((g) => g.id === groupId) || state.promptGroups[0];
  const targetPrompt = targetGroup?.prompts.find((p) => p.id === prompt.id);
  if (!targetPrompt) return;

  const overlay = document.createElement("div");
  overlay.className = "prompt-edit-modal-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:flex-start;justify-content:center;padding:16px;z-index:10000;overflow-y:auto;";

  const modal = document.createElement("div");
  modal.style.cssText =
    "width:100%;margin:auto;background:#fff;border-radius:6px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 16px 40px rgba(0,0,0,.16);";
  modal.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:#111;margin-bottom:2px;">编辑提示词</div>
    <div>
      <label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">名称</label>
      <input class="pep-title" type="text" value="${escapeHtml(targetPrompt.title || "")}" style="width:100%;height:34px;padding:0 10px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;" />
    </div>
    <div>
      <label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">分类</label>
      <select class="pep-group" style="width:100%;height:34px;padding:0 8px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;">
        ${state.promptGroups
          .map(
            (g) =>
              `<option value="${escapeHtml(g.id)}"${g.id === groupId ? " selected" : ""}>${escapeHtml(getPromptGroupDisplayName(g))}</option>`
          )
          .join("")}
        <option value="__new__">＋ 新建分组…</option>
      </select>
      <input class="pep-newgroup" type="text" placeholder="输入新分组名称" style="display:none;width:100%;height:34px;padding:0 10px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;margin-top:6px;" />
    </div>
    <div>
      <label style="font-size:12px;color:#666;display:block;margin-bottom:4px;">提示词内容</label>
      <textarea class="pep-content" style="width:100%;min-height:120px;padding:8px 10px;border:1px solid #ddd;border-radius:4px;font:inherit;font-size:13px;color:#111;outline:none;resize:vertical;line-height:1.6;">${escapeHtml(targetPrompt.content || "")}</textarea>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
      <button class="pep-delete" style="height:32px;padding:0 12px;border:none;border-radius:4px;background:#fee2e2;color:#dc2626;font:inherit;font-size:13px;font-weight:500;cursor:pointer;">删除</button>
      <div style="display:flex;gap:6px;">
        <button class="pep-cancel" style="height:32px;padding:0 12px;border:1px solid #ddd;border-radius:4px;background:#fff;color:#444;font:inherit;font-size:13px;font-weight:500;cursor:pointer;">取消</button>
        <button class="pep-save" style="height:32px;padding:0 14px;border:none;border-radius:4px;background:#111;color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer;">保存</button>
      </div>
    </div>
  `;

  const titleInput = modal.querySelector(".pep-title");
  const groupSelect = modal.querySelector(".pep-group");
  const newGroupInput = modal.querySelector(".pep-newgroup");
  const contentInput = modal.querySelector(".pep-content");

  groupSelect?.addEventListener("change", () => {
    const isNew = groupSelect instanceof HTMLSelectElement && groupSelect.value === "__new__";
    if (newGroupInput instanceof HTMLInputElement) {
      newGroupInput.style.display = isNew ? "block" : "none";
      if (isNew) requestAnimationFrame(() => newGroupInput.focus());
    }
  });

  const prevMinHeight = document.body.style.minHeight;
  const prevBodyBg = document.body.style.background;
  const popupShell = document.querySelector(".popup-shell");
  const prevShellBg = popupShell ? popupShell.style.background : "";
  const popupActions = document.querySelector(".popup-actions");
  const prevActionsDisplay = popupActions ? popupActions.style.display : "";

  function closeModal() {
    overlay.remove();
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.minHeight = prevMinHeight;
    document.body.style.background = prevBodyBg;
    if (popupShell) popupShell.style.background = prevShellBg;
    if (popupActions) popupActions.style.display = prevActionsDisplay;
  }

  modal.querySelector(".pep-cancel").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  modal.querySelector(".pep-save").addEventListener("click", async () => {
    const newTitle =
      (titleInput instanceof HTMLInputElement ? titleInput.value : "").trim() ||
      "未命名提示词";
    const newContent = contentInput instanceof HTMLTextAreaElement ? contentInput.value : "";
    let newGroupId = groupSelect instanceof HTMLSelectElement ? groupSelect.value : groupId;
    if (newGroupId === "__new__") {
      const newName =
        (newGroupInput instanceof HTMLInputElement ? newGroupInput.value : "").trim() ||
        "新建分组";
      const newGroup = { id: `prompt-group-${Date.now()}`, name: newName, prompts: [] };
      state.promptGroups.push(newGroup);
      newGroupId = newGroup.id;
    }
    state.promptGroups.forEach((g) => {
      g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id);
    });
    const destGroup = state.promptGroups.find((g) => g.id === newGroupId) || targetGroup;
    destGroup.prompts.push({ id: targetPrompt.id, title: newTitle, content: newContent });
    await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: state.promptGroups });
    closeModal();
  });

  modal.querySelector(".pep-delete").addEventListener("click", async () => {
    if (!window.confirm("确定要删除这条提示词吗？")) return;
    state.promptGroups.forEach((g) => {
      g.prompts = g.prompts.filter((p) => p.id !== targetPrompt.id);
    });
    await chrome.storage.local.set({ [PROMPT_GROUPS_STORAGE_KEY]: state.promptGroups });
    closeModal();
  });

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = "visible";
  document.body.style.overflow = "visible";
  document.body.style.minHeight = "440px";
  document.body.style.background = "#ffffff";
  if (popupShell) popupShell.style.background = "#ffffff";
  if (popupActions) popupActions.style.display = "none";
  if (titleInput instanceof HTMLInputElement) requestAnimationFrame(() => titleInput.focus());
}
