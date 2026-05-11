import esbuild from "esbuild";
import { cp, rm, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeclarativeNetRequestRules } from "./src/config/rules-source.mjs";

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

// Non-JS assets shipped in the extension — live under src/, mirrored into dist/.
const SRC_ASSETS = [
  "manifest.json",
  "_locales",
  "icons",
  "config/initialState.json",
  "config/initialState.zh-CN.json",
  "config/initialState.en.json",
  "config/siteHandlers.json",
  "config/random-questions",
  "popup/popup.html",
  "popup/popup.css",
  "popup/styles",
  "popup/icon128.png",
  "popup/logo.svg",
  "settings/settings.html",
  "settings/settings.css",
  "settings/styles",
  "settings/about-logo.svg",
  "iframe/iframe.html",
  "iframe/iframe.css",
  "iframe/styles",
];

// Top-level meta files — kept at repo root for GitHub display, also copied
// into the shipped extension so Chrome Web Store review can see them.
const ROOT_ASSETS = ["LICENSE", "PRIVACY.md"];

async function copyOne(from, to) {
  if (!existsSync(from)) {
    console.warn(`[assets] skip missing: ${path.relative(ROOT, from)}`);
    return;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

async function copyAssets() {
  for (const rel of SRC_ASSETS) {
    await copyOne(path.join(SRC, rel), path.join(DIST, rel));
  }
  for (const rel of ROOT_ASSETS) {
    await copyOne(path.join(ROOT, rel), path.join(DIST, rel));
  }
  await generateRules();
}

// 把 src/config/rules-source.mjs 展开成 Chrome MV3 接受的 JSON 数组
// 写到 dist/config/rules.json。每次 watch 重建也会重写一次，保证与源一致。
async function generateRules() {
  const target = path.join(DIST, "config", "rules.json");
  await mkdir(path.dirname(target), { recursive: true });
  const rules = buildDeclarativeNetRequestRules();
  await writeFile(target, JSON.stringify(rules, null, 2) + "\n", "utf8");
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
