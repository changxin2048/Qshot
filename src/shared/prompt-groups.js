import { DEFAULT_PROMPT_GROUP_ID } from "./storage-keys.js";

function i18n(key) {
  try {
    return chrome?.i18n?.getMessage?.(key) || "";
  } catch (_e) {
    return "";
  }
}

export function getAllPromptGroupName() {
  return i18n("settings_prompts_allGroup") || "全部";
}

export function isAllPromptGroup(group) {
  return !!group && group.id === DEFAULT_PROMPT_GROUP_ID;
}

export function getPromptGroupDisplayName(group) {
  if (isAllPromptGroup(group)) return getAllPromptGroupName();
  return group?.name || i18n("overlay_unnamedPromptGroup") || "未命名分组";
}

// Flattens a group's prompt list for display. When the group is the virtual
// "All" group, unions prompts across every real group while remembering the
// source group on each entry.
export function getDisplayPromptEntries(group, allGroups) {
  if (!group) return [];
  if (isAllPromptGroup(group)) {
    const out = [];
    (allGroups || []).forEach((g) => {
      (g.prompts || []).forEach((prompt) => out.push({ prompt, sourceGroup: g }));
    });
    return out;
  }
  return (group.prompts || []).map((prompt) => ({ prompt, sourceGroup: group }));
}
