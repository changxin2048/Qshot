import { LEGACY_DEFAULT_GROUP_NAME } from "../../shared/storage-keys.js";
import { getAllPromptGroupName } from "../../shared/prompt-groups.js";
import { state } from "./state.js";
import { persistAll } from "./store.js";

export function handleExport() {
  const lines = [];
  state.promptGroups.forEach((group, gi) => {
    if (gi > 0) lines.push("");
    lines.push(`# ${group.name}`);
    group.prompts.forEach((p) => {
      lines.push("");
      lines.push(`## ${p.title}`);
      lines.push("");
      lines.push(flattenPromptContentForExport(p.content));
    });
  });
  const markdown = lines.join("\n");
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Qshow提示词-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// 将提示词内容里的 Markdown 标题（# ~ ######）转成加粗，
// 避免与导出文件中 # 分组、## 提示词标题 的结构符号冲突。
// 代码围栏内的内容原样保留，列表/段落/序号结构不受影响。
function flattenPromptContentForExport(raw) {
  const text = String(raw || "").trim();
  if (!text) return text;
  const lines = text.split(/\r?\n/);
  const out = [];
  let inCodeFence = false;
  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    const trimmed = trimmedEnd.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      out.push(trimmedEnd);
      continue;
    }
    if (inCodeFence) {
      out.push(trimmedEnd);
      continue;
    }
    const headingMatch = trimmedEnd.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      out.push(`**${headingMatch[2].trim()}**`);
      out.push("");
    } else {
      out.push(trimmedEnd);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseMarkdownPrompts(text) {
  const groups = [];
  // Split on lines that start with exactly one # (not ##)
  const groupChunks = text.split(/\n(?=# (?!#))/);
  for (const chunk of groupChunks) {
    const chunkLines = chunk.split("\n");
    const firstLine = chunkLines[0] || "";
    if (!firstLine.startsWith("# ") || firstLine.startsWith("## ")) continue;
    const groupName = firstLine.slice(2).trim();
    if (!groupName) continue;

    const prompts = [];
    const rest = chunkLines.slice(1).join("\n");
    // Split on lines that start with ##
    const promptChunks = rest.split(/\n(?=## )/);
    for (const pChunk of promptChunks) {
      const pLines = pChunk.split("\n");
      const pFirst = pLines[0] || "";
      if (!pFirst.startsWith("## ")) continue;
      const title = pFirst.slice(3).trim();
      if (!title) continue;
      const content = pLines.slice(1).join("\n").trim();
      prompts.push({ title, content });
    }

    groups.push({ name: groupName, prompts });
  }
  return groups;
}

export async function handleImportFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    let valid = [];

    if (file.name.endsWith(".json") || text.trimStart().startsWith("{")) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.promptGroups)) {
        alert("JSON 格式不正确，请导入从本插件导出的文件。");
        return;
      }
      valid = data.promptGroups.filter(
        (g) => g && typeof g.name === "string" && g.name.trim() && Array.isArray(g.prompts)
      );
    } else {
      valid = parseMarkdownPrompts(text);
    }

    if (!valid.length) {
      alert("文件中没有可导入的提示词分组。");
      return;
    }
    openImportModal(valid);
  } catch (_) {
    alert("无法解析文件，请检查文件格式是否正确。");
  }
}

function openImportModal(importedGroups) {
  const allName = getAllPromptGroupName();
  const existingNames = new Set(state.promptGroups.map((g) => g.name));
  state.importModalState = {
    groups: importedGroups.map((group) => {
      const prompts = group.prompts.map((p) => ({
        title: String(p.title || "").trim() || "未命名提示词",
        content: String(p.content || "")
      }));
      let name = group.name.trim();
      // 兼容旧版导出：把"默认分组"视为新的"全部"分组
      if (name === LEGACY_DEFAULT_GROUP_NAME) {
        name = allName;
      }
      return {
        name,
        prompts,
        expanded: false,
        conflictExists: existingNames.has(name),
        conflictStrategy: "merge",
        promptSelections: prompts.map(() => true)
      };
    })
  };
  renderImportModal();
}

function renderImportModal() {
  document.getElementById("promptImportModal")?.remove();
  if (!state.importModalState) return;

  const totalPrompts = state.importModalState.groups.reduce((s, g) => s + g.prompts.length, 0);
  const selectedCount = state.importModalState.groups.reduce(
    (s, g) => s + g.promptSelections.filter(Boolean).length, 0
  );

  const overlay = document.createElement("div");
  overlay.id = "promptImportModal";
  overlay.className = "import-modal-overlay";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeImportModal(); });

  const dialog = document.createElement("div");
  dialog.className = "import-modal-dialog";

  // Header
  const header = document.createElement("div");
  header.className = "import-modal-header";
  const headerText = document.createElement("div");
  const titleEl = document.createElement("div");
  titleEl.className = "import-modal-title";
  titleEl.textContent = "导入提示词";
  const subtitleEl = document.createElement("div");
  subtitleEl.className = "import-modal-subtitle";
  subtitleEl.textContent = `共 ${state.importModalState.groups.length} 个分组，${totalPrompts} 条提示词 · 已选 ${selectedCount} 条`;
  headerText.appendChild(titleEl);
  headerText.appendChild(subtitleEl);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "import-modal-close";
  closeBtn.setAttribute("aria-label", "关闭");
  closeBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  closeBtn.addEventListener("click", closeImportModal);
  header.appendChild(headerText);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement("div");
  body.className = "import-modal-body";

  state.importModalState.groups.forEach((group, gi) => {
    const selectedInGroup = group.promptSelections.filter(Boolean).length;
    const allSelected = selectedInGroup === group.prompts.length;
    const noneSelected = selectedInGroup === 0;

    const groupItem = document.createElement("div");
    groupItem.className = "import-group-item";

    const groupRow = document.createElement("div");
    groupRow.className = "import-group-row";

    const groupCheck = document.createElement("input");
    groupCheck.type = "checkbox";
    groupCheck.className = "import-checkbox";
    groupCheck.checked = allSelected;
    groupCheck.indeterminate = !allSelected && !noneSelected;
    groupCheck.addEventListener("change", () => {
      state.importModalState.groups[gi].promptSelections = state.importModalState.groups[gi].prompts.map(() => groupCheck.checked);
      renderImportModal();
    });

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "import-expand-btn";
    expandBtn.setAttribute("aria-label", group.expanded ? "收起" : "展开");
    expandBtn.innerHTML = group.expanded
      ? `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    expandBtn.addEventListener("click", () => {
      state.importModalState.groups[gi].expanded = !state.importModalState.groups[gi].expanded;
      renderImportModal();
    });

    const groupNameEl = document.createElement("span");
    groupNameEl.className = "import-group-name";
    groupNameEl.textContent = group.name;
    groupNameEl.addEventListener("click", () => {
      state.importModalState.groups[gi].expanded = !state.importModalState.groups[gi].expanded;
      renderImportModal();
    });

    const groupMetaEl = document.createElement("span");
    groupMetaEl.className = "import-group-meta";
    groupMetaEl.textContent = `${selectedInGroup}/${group.prompts.length}`;

    groupRow.appendChild(groupCheck);
    groupRow.appendChild(expandBtn);
    groupRow.appendChild(groupNameEl);
    groupRow.appendChild(groupMetaEl);

    if (group.conflictExists) {
      const badge = document.createElement("span");
      badge.className = "import-conflict-badge";
      badge.textContent = "已存在";
      groupRow.appendChild(badge);

      const strategyWrap = document.createElement("div");
      strategyWrap.className = "import-strategy-wrap";

      ["merge", "new"].forEach((strategy) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `import-strategy-btn${group.conflictStrategy === strategy ? " is-active" : ""}`;
        btn.textContent = strategy === "merge" ? "合并" : "新建";
        btn.title = strategy === "merge" ? "将选中内容追加到已有分组" : "保留原分组，另建新分组";
        btn.addEventListener("click", () => {
          state.importModalState.groups[gi].conflictStrategy = strategy;
          renderImportModal();
        });
        strategyWrap.appendChild(btn);
      });

      groupRow.appendChild(strategyWrap);
    }

    groupItem.appendChild(groupRow);

    if (group.expanded) {
      const promptList = document.createElement("div");
      promptList.className = "import-prompt-list";
      group.prompts.forEach((prompt, pi) => {
        const promptRow = document.createElement("label");
        promptRow.className = "import-prompt-row";
        const promptCheck = document.createElement("input");
        promptCheck.type = "checkbox";
        promptCheck.className = "import-checkbox";
        promptCheck.checked = group.promptSelections[pi];
        promptCheck.addEventListener("change", () => {
          state.importModalState.groups[gi].promptSelections[pi] = promptCheck.checked;
          renderImportModal();
        });
        const promptTitle = document.createElement("span");
        promptTitle.className = "import-prompt-title";
        promptTitle.textContent = prompt.title;
        promptRow.appendChild(promptCheck);
        promptRow.appendChild(promptTitle);
        promptList.appendChild(promptRow);
      });
      groupItem.appendChild(promptList);
    }

    body.appendChild(groupItem);
  });

  // Footer
  const footer = document.createElement("div");
  footer.className = "import-modal-footer";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "import-footer-cancel-btn";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", closeImportModal);

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "import-footer-confirm-btn";
  confirmBtn.textContent = selectedCount > 0 ? `导入已选（${selectedCount} 条）` : "导入";
  confirmBtn.disabled = selectedCount === 0;
  confirmBtn.addEventListener("click", doImport);

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function closeImportModal() {
  document.getElementById("promptImportModal")?.remove();
  state.importModalState = null;
}

async function doImport() {
  if (!state.importModalState) return;
  const existingGroupMap = new Map(state.promptGroups.map((g) => [g.name, g]));

  state.importModalState.groups.forEach((group) => {
    const selectedPrompts = group.prompts.filter((_, i) => group.promptSelections[i]);
    if (!selectedPrompts.length) return;

    const newPrompts = selectedPrompts.map((p) => ({
      id: `prompt-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: p.title,
      content: p.content
    }));

    if (group.conflictExists && group.conflictStrategy === "merge") {
      const existing = existingGroupMap.get(group.name);
      if (existing) {
        existing.prompts.push(...newPrompts);
      }
    } else {
      let name = group.name;
      if (group.conflictExists && group.conflictStrategy === "new") {
        let suffix = 2;
        while (state.promptGroups.some((g) => g.name === name)) {
          name = `${group.name} (${suffix++})`;
        }
      }
      state.promptGroups.push({
        id: `prompt-group-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        prompts: newPrompts
      });
    }
  });

  await persistAll();
  closeImportModal();
  state.activePromptGroupId = state.promptGroups[0]?.id || null;
  state.renderPromptsSection();
}
