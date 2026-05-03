import {
  SEARCH_GROUPS_STORAGE_KEY,
  UI_PREFS_STORAGE_KEY,
} from "../shared/storage-keys.js";

const DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY = "defaultSocialOverseasGroupMigrated";
const DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY = "defaultSocialOverseasModeMigrated";
const DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY = "defaultSocialOverseasTiktokMigrated";

export async function ensureInitialStateDefaults() {
  // Only initialize when keys are missing/empty.
  const stored = await chrome.storage.local.get([
    SEARCH_GROUPS_STORAGE_KEY,
    "promptGroups",
    "customSites",
    UI_PREFS_STORAGE_KEY,
    DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY,
    DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY,
    DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY,
  ]);

  const hasGroups = Array.isArray(stored[SEARCH_GROUPS_STORAGE_KEY]) && stored[SEARCH_GROUPS_STORAGE_KEY].length > 0;
  const hasPromptGroups = Array.isArray(stored.promptGroups) && stored.promptGroups.length > 0;
  const hasCustomSites = Array.isArray(stored.customSites);
  const hasUiPrefs = stored[UI_PREFS_STORAGE_KEY] && typeof stored[UI_PREFS_STORAGE_KEY] === "object";
  const shouldReplaceLegacyPromptGroups = isLegacyDefaultPromptGroups(stored.promptGroups);
  const shouldAddDefaultSocialOverseasGroup = shouldAddDefaultGroup(
    stored[SEARCH_GROUPS_STORAGE_KEY],
    "default-social-overseas",
    stored[DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY]
  );
  const shouldMigrateDefaultSocialOverseasMode = shouldMigrateDefaultGroupMode(
    stored[SEARCH_GROUPS_STORAGE_KEY],
    "default-social-overseas",
    stored[DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY]
  );
  const shouldAddTiktokToOverseas = shouldAddSiteIdToGroup(
    stored[SEARCH_GROUPS_STORAGE_KEY],
    "default-social-overseas",
    "tiktok",
    stored[DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY]
  );

  if (
    hasGroups &&
    !shouldAddDefaultSocialOverseasGroup &&
    !shouldMigrateDefaultSocialOverseasMode &&
    !shouldAddTiktokToOverseas &&
    hasPromptGroups &&
    !shouldReplaceLegacyPromptGroups &&
    hasCustomSites &&
    hasUiPrefs
  ) {
    return;
  }

  const defaults = await loadInitialStateFromConfig().catch(() => null);
  if (!defaults) {
    return;
  }

  const patch = {};
  if (!hasGroups && Array.isArray(defaults.searchGroups) && defaults.searchGroups.length > 0) {
    patch[SEARCH_GROUPS_STORAGE_KEY] = defaults.searchGroups;
    patch[DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY] = true;
  } else if (shouldAddDefaultSocialOverseasGroup && Array.isArray(defaults.searchGroups)) {
    const defaultGroup = defaults.searchGroups.find((group) => group.id === "default-social-overseas");
    if (defaultGroup) {
      patch[SEARCH_GROUPS_STORAGE_KEY] = [...stored[SEARCH_GROUPS_STORAGE_KEY], defaultGroup];
      patch[DEFAULT_SOCIAL_OVERSEAS_GROUP_MIGRATED_KEY] = true;
      patch[DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY] = true;
    }
  } else if (shouldMigrateDefaultSocialOverseasMode || shouldAddTiktokToOverseas) {
    patch[SEARCH_GROUPS_STORAGE_KEY] = stored[SEARCH_GROUPS_STORAGE_KEY].map((group) => {
      if (group?.id !== "default-social-overseas") return group;
      const next = { ...group };
      if (shouldMigrateDefaultSocialOverseasMode) {
        next.mode = "tabs";
      }
      if (shouldAddTiktokToOverseas) {
        const siteIds = Array.isArray(next.siteIds) ? [...next.siteIds] : [];
        if (!siteIds.includes("tiktok")) siteIds.push("tiktok");
        next.siteIds = siteIds;
      }
      return next;
    });
    if (shouldMigrateDefaultSocialOverseasMode) {
      patch[DEFAULT_SOCIAL_OVERSEAS_MODE_MIGRATED_KEY] = true;
    }
    if (shouldAddTiktokToOverseas) {
      patch[DEFAULT_SOCIAL_OVERSEAS_TIKTOK_MIGRATED_KEY] = true;
    }
  }
  if ((!hasPromptGroups || shouldReplaceLegacyPromptGroups) && Array.isArray(defaults.promptGroups) && defaults.promptGroups.length > 0) {
    patch.promptGroups = defaults.promptGroups;
  }
  if (!hasCustomSites && Array.isArray(defaults.customSites)) {
    patch.customSites = defaults.customSites;
  }
  if (!hasUiPrefs && defaults.uiPrefs && typeof defaults.uiPrefs === "object") {
    patch[UI_PREFS_STORAGE_KEY] = defaults.uiPrefs;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

function isLegacyDefaultPromptGroups(promptGroups) {
  if (!Array.isArray(promptGroups) || promptGroups.length !== 1) return false;
  const [group] = promptGroups;
  const prompts = Array.isArray(group?.prompts) ? group.prompts : [];
  if (prompts.length !== 1) return false;
  const [prompt] = prompts;
  return (
    group.id === "prompt-group-default" &&
    prompt.id === "prompt-default-1" &&
    prompt.title === "总结重点"
  );
}

function shouldAddDefaultGroup(groups, groupId, hasMigrated) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  if (hasMigrated === true) return false;
  return !groups.some((group) => group?.id === groupId);
}

function shouldMigrateDefaultGroupMode(groups, groupId, hasMigrated) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  if (hasMigrated === true) return false;
  const group = groups.find((item) => item?.id === groupId);
  if (!group || group.mode === "tabs") return false;
  return Array.isArray(group.siteIds) && ["twitter", "youtube", "reddit"].every((siteId) => group.siteIds.includes(siteId));
}

function shouldAddSiteIdToGroup(groups, groupId, siteId, hasMigrated) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  if (hasMigrated === true) return false;
  const group = groups.find((item) => item?.id === groupId);
  if (!group || !Array.isArray(group.siteIds)) return false;
  return !group.siteIds.includes(siteId);
}

async function loadInitialStateFromConfig() {
  const configPath = getInitialStateConfigPath();
  let resp = await fetch(chrome.runtime.getURL(configPath));
  if (!resp.ok && configPath !== "config/initialState.json") {
    resp = await fetch(chrome.runtime.getURL("config/initialState.json"));
  }
  if (!resp.ok) {
    throw new Error("无法读取初始配置");
  }
  const payload = await resp.json();
  if (!payload || typeof payload !== "object") {
    throw new Error("初始配置无效");
  }

  const { searchGroups, promptGroups, customSites, uiPrefs } = payload;
  if (!Array.isArray(searchGroups) || searchGroups.length === 0) return null;
  if (!Array.isArray(promptGroups) || promptGroups.length === 0) return null;
  if (!Array.isArray(customSites)) return null;
  if (!uiPrefs || typeof uiPrefs !== "object") return null;

  return { searchGroups, promptGroups, customSites, uiPrefs };
}

function getInitialStateConfigPath() {
  const lang = getBrowserLanguage();
  if (lang.startsWith("zh")) {
    return "config/initialState.zh-CN.json";
  }
  return "config/initialState.en.json";
}

function getBrowserLanguage() {
  try {
    const chromeLang = chrome?.i18n?.getUILanguage?.();
    if (chromeLang) return String(chromeLang).toLowerCase();
  } catch (_e) {
    // ignore
  }
  try {
    return String(navigator?.language || "en").toLowerCase();
  } catch (_e) {
    return "en";
  }
}
