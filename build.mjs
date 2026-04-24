import esbuild from "esbuild";
import { cp, rm, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const WATCH = process.argv.includes("--watch");
const DEV = WATCH || process.env.NODE_ENV !== "production";

// JS entry points — paths relative to src/, mirrored under dist/.
const ENTRIES = [
  "background.js",
  "config/baseConfig.js",
  "iframe/inject.js",
  "iframe/overlay.js",
  "iframe/overlay_main.js",
  "iframe/iframe.js",
  "popup/popup.js",
  "settings/settings.js",
  "shared/i18n.js",
  "shared/prompt-item.js",
];

// Non-JS assets copied verbatim into dist/.
// Source paths are relative to project root (not src/), since assets stay outside src/.
const STATIC_ASSETS = [
  "manifest.json",
  "_locales",
  "_metadata",
  "icons",
  "LICENSE",
  "PRIVACY.md",
  "config/initialState.json",
  "config/rules.json",
  "config/siteHandlers.json",
  "config/random-questions",
  "popup/popup.html",
  "popup/popup.css",
  "popup/icon128.png",
  "popup/logo.svg",
  "settings/settings.html",
  "settings/settings.css",
  "settings/about-logo.svg",
  "iframe/iframe.html",
  "iframe/iframe.css",
];

async function copyAssets() {
  for (const rel of STATIC_ASSETS) {
    const from = path.join(ROOT, rel);
    const to = path.join(DIST, rel);
    if (!existsSync(from)) {
      console.warn(`[assets] skip missing: ${rel}`);
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true });
  }
}

function makeBuildOptions() {
  return {
    entryPoints: ENTRIES.map((rel) => ({
      in: path.join(SRC, rel),
      out: rel.replace(/\.js$/, ""),
    })),
    outdir: DIST,
    bundle: true,
    format: "iife",
    target: "chrome110",
    sourcemap: DEV ? "inline" : false,
    minify: !DEV,
    logLevel: "info",
    legalComments: "none",
    charset: "utf8",
  };
}

async function run() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const options = makeBuildOptions();

  if (WATCH) {
    const ctx = await esbuild.context({
      ...options,
      plugins: [
        {
          name: "copy-assets-on-rebuild",
          setup(build) {
            build.onEnd(async (result) => {
              if (result.errors.length === 0) {
                await copyAssets();
                console.log(`[build] ok (${new Date().toLocaleTimeString()})`);
              }
            });
          },
        },
      ],
    });
    await ctx.watch();
    await copyAssets();
    console.log("[build] watching src/ ...");
  } else {
    await esbuild.build(options);
    await copyAssets();
    console.log("[build] done → dist/");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
