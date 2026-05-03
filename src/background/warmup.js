import { UI_PREFS_STORAGE_KEY } from "../shared/storage-keys.js";
import { AI_SITE_IDS, loadEnabledSites } from "./sites.js";

const WARMUP_COOLDOWN_MS = 5 * 60 * 1000;
let lastWarmupAt = 0;

export async function warmupAiSites() {
  const now = Date.now();
  if (now - lastWarmupAt < WARMUP_COOLDOWN_MS) {
    return { skipped: true, reason: "cooldown" };
  }

  const stored = await chrome.storage.local.get([UI_PREFS_STORAGE_KEY]);
  const prefs = stored[UI_PREFS_STORAGE_KEY] || {};
  if (prefs.prewarmEnabled === false) {
    return { skipped: true, reason: "disabled" };
  }

  const sites = await loadEnabledSites();
  const targets = sites.filter((site) => AI_SITE_IDS.includes(site.id));
  if (targets.length === 0) {
    return { skipped: true, reason: "no-targets" };
  }

  lastWarmupAt = now;

  // Review note (CWS/Edge Add-ons):
  // - This "prewarm" is only for performance (reducing first-load latency for heavy AI sites).
  // - Requests go directly from the user's browser to the selected third‑party sites; the extension does NOT send user data to any developer-controlled server.
  // - Using mode:"no-cors" means the extension does NOT read response bodies; credentials:"include" only reuses the user's existing login session.
  await Promise.all(
    targets.map((site) => {
      const warmupUrl = (site.url || "").replace("{query}", "");
      if (!warmupUrl || !/^https?:\/\//.test(warmupUrl)) {
        return null;
      }
      return fetch(warmupUrl, {
        credentials: "include",
        mode: "no-cors",
        cache: "default",
        redirect: "follow",
      }).catch(() => null);
    })
  );

  return { warmed: targets.length };
}
