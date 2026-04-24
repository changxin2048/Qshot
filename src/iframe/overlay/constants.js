export const FRAME_TOGGLE_MESSAGE = "__QSHOT_FRAME_TOGGLE__";
export const MAIN_HOTKEY_FIRE = "__QSHOT_HOTKEY_FIRE__";
export const MAIN_HOTKEY_ESC = "__QSHOT_HOTKEY_ESC__";
export const MAIN_HOTKEY_CONFIG = "__QSHOT_HOTKEY_CONFIG__";

export const RANDOM_QUESTIONS_FILES = {
  zh: "config/random-questions/zh-CN.txt",
  en: "config/random-questions/en.txt",
};

export const LOGO_URL = chrome.runtime.getURL("popup/logo.svg");

export const DICE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M817.493333 310.997333L533.333333 146.944a42.666667 42.666667 0 0 0-42.666666 0L206.506667 310.997333a42.666667 42.666667 0 0 0-21.333334 36.949334v328.106666a42.666667 42.666667 0 0 0 21.333334 36.992l284.16 164.053334a42.666667 42.666667 0 0 0 42.666666 0l284.16-164.053334a42.666667 42.666667 0 0 0 21.333334-36.992v-328.106666a42.666667 42.666667 0 0 0-21.333334-36.949334zM554.666667 109.994667l284.16 164.053333a85.333333 85.333333 0 0 1 42.666666 73.898667v328.106666a85.333333 85.333333 0 0 1-42.666666 73.898667L554.666667 914.090667a85.333333 85.333333 0 0 1-85.333334 0l-284.16-164.053334a85.333333 85.333333 0 0 1-42.666666-73.898666V347.904a85.333333 85.333333 0 0 1 42.666666-73.898667L469.333333 109.994667a85.333333 85.333333 0 0 1 85.333334 0z"/><path d="M490.666667 524.501333L160.213333 338.602667l20.906667-37.205334L512 487.552l330.88-186.154667 20.906667 37.205334-330.453334 185.898666V896h-42.666666v-371.498667z"/><path d="M469.333333 298.666667a42.666667 42.666667 0 1 0 85.333334 0 42.666667 42.666667 0 0 0-85.333334 0zM347.861333 633.941333a32.725333 32.725333 0 1 1-32.725333-56.661333 32.725333 32.725333 0 0 1 32.725333 56.661333zM286.72 535.296a32.682667 32.682667 0 1 1-32.682667-56.533333 32.682667 32.682667 0 0 1 32.682667 56.533333zM414.72 727.296a32.682667 32.682667 0 1 1-32.682667-56.533333 32.682667 32.682667 0 0 1 32.682667 56.533333zM712.32 558.890667a32.725333 32.725333 0 1 0 32.682667-56.661334 32.725333 32.725333 0 0 0-32.682667 56.661334zM625.621333 709.034667a32.682667 32.682667 0 1 0 32.682667-56.618667 32.682667 32.682667 0 0 0-32.682667 56.618667z"/></svg>`;

export const SPARKLE_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M855.071605 339.499431l-10.216418 26.934193c-7.430122 19.718401-31.077915 19.718401-38.508037 0l-10.144975-26.934193c-18.146645-48.010021-50.724873-86.303727-91.447658-107.165224l-31.435132-16.146227c-16.860662-8.716105-16.860662-37.150611 0-45.866717l29.649045-15.217461c41.722994-21.433045 75.015657-61.084178 92.805084-110.737399l10.430749-29.148941c7.287235-20.289949 31.506576-20.289949 38.793811 0l10.430749 29.148941c17.860871 49.653221 51.08209 89.304354 92.876528 110.737399l29.577602 15.217461c16.932105 8.716105 16.932105 37.150611 0 45.866717l-31.363689 16.074783c-40.722785 20.932941-73.372457 59.226647-91.447659 107.236668zM413.265106 95.234163h164.891559v95.305606H413.265106c-136.671383 0-247.480225 127.883835-247.480225 285.773932 0 171.89302 101.592633 284.130732 329.926005 403.87001v-118.096078h82.445779c136.671383 0 247.480225-127.955278 247.480225-285.773932h82.44578c0 210.401057-147.673679 381.008095-329.926005 381.008095v166.677646C371.970773 928.765279 83.339102 785.878313 83.339102 476.313701 83.339102 265.769757 231.012781 95.234163 413.265106 95.234163z"/></svg>`;

export const OVERLAY_STYLES = `
  :host {
    all: initial;
    --qshot-panel-scale: 1.167;
    --qshot-panel-offset-y: -12px;
  }
  * { box-sizing: border-box; font-family: "Microsoft YaHei UI", "PingFang SC", -apple-system, sans-serif; }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: rgba(0, 0, 0, 0.38);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    overflow-y: auto;
    animation: qshotFadeIn 140ms ease-out;
  }

  .panel {
    width: 440px;
    max-width: calc(100vw - 32px);
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: qshotPopIn 180ms cubic-bezier(.2,.9,.3,1.1) forwards;
    transform: translateY(var(--qshot-panel-offset-y)) scale(var(--qshot-panel-scale));
    color: #111;
  }

  @keyframes qshotFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes qshotPopIn {
    from {
      opacity: 0;
      transform: translateY(calc(var(--qshot-panel-offset-y) - 8px)) scale(calc(var(--qshot-panel-scale) - 0.02));
    }
    to   {
      opacity: 1;
      transform: translateY(var(--qshot-panel-offset-y)) scale(var(--qshot-panel-scale));
    }
  }

  .header {
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
  }
  .title-logo {
    height: 30px;
    width: auto;
    display: block;
  }

  .composer {
    position: relative;
    width: 100%;
    min-height: 56px;
    padding: 10px 14px;
    border: 1px solid rgba(0, 0, 0, 0.22);
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 5px 12px rgba(0, 0, 0, 0.07);
    display: flex;
    align-items: center;
    gap: 10px;
    transition: min-height 180ms ease, padding 180ms ease;
  }
  .composer.is-expanded {
    min-height: 118px;
    padding: 12px 14px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .query-input {
    width: 100%;
    min-width: 0;
    min-height: 20px;
    height: 20px;
    max-height: 220px;
    resize: none;
    overflow-y: hidden;
    overflow-x: hidden;
    border: none;
    outline: none;
    background: transparent;
    padding: 0 6px 0 0;
    font-size: 14px;
    line-height: 1.4;
    color: #111;
    flex: 1;
  }
  .composer.is-expanded .query-input {
    min-height: 76px;
    height: auto;
    overflow-y: auto;
    padding: 2px 4px 0 0;
  }
  .query-input::placeholder { color: #9a9a9a; }
  .query-input::-webkit-scrollbar { width: 7px; height: 7px; }
  .query-input::-webkit-scrollbar-thumb { background: #9c9c9c; border-radius: 999px; }

  .actions-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .composer.is-expanded .actions-row { margin-top: 8px; }

  .icon-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: #111;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: none;
    transition: transform 180ms ease, color 180ms ease;
  }
  .icon-btn:hover { transform: translateY(-1px); }
  .icon-btn.dice:hover { transform: translateY(-1px) rotate(-14deg) scale(1.08); }
  .icon-btn svg { width: 22px; height: 22px; fill: currentColor; }
  .icon-btn.sparkle svg { width: 20px; height: 20px; }

  .groups {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .groups:empty { display: none; }

  .group-btn {
    min-width: 84px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid rgba(0, 0, 0, 0.62);
    border-radius: 999px;
    background: #fff;
    color: #111;
    font-size: 14px;
    line-height: 1.2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease;
  }
  .group-btn:hover {
    background: #111;
    color: #fff;
    border-color: #111;
    transform: translateY(-1px);
  }

  .group-tooltip {
    position: absolute;
    z-index: 30;
    display: none;
    max-width: calc(100% - 8px);
    padding: 8px 10px;
    border-radius: 10px;
    background: #ffffff;
    color: #111111;
    border: 1px solid rgba(0, 0, 0, 0.1);
    font-size: 12px;
    line-height: 1.5;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.16);
    pointer-events: auto;
  }

  .group-tooltip-list {
    display: grid;
    grid-template-columns: repeat(5, max-content);
    justify-content: start;
    gap: 6px;
  }

  .group-tooltip-item {
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 999px;
    background: #ffffff;
    color: #111111;
    font: inherit;
    line-height: 1.2;
    padding: 6px 10px;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .group-tooltip-item:hover {
    background: #111111;
    border-color: #111111;
    color: #ffffff;
    transform: translateY(-1px);
  }

  .history-section { padding: 0; }
  .history-section[hidden] { display: none !important; }

  .section-divider {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: 10px;
  }
  .section-divider::before,
  .section-divider::after {
    content: "";
    height: 1px;
    background: rgba(0, 0, 0, 0.24);
  }
  .section-divider-label {
    font-size: 13px;
    color: #313131;
  }

  .history-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }

  .history-empty,
  .history-item {
    width: 100%;
    border-radius: 12px;
  }

  .history-empty {
    padding: 12px 10px;
    text-align: center;
    color: #888888;
    font-size: 12px;
  }

  .history-item {
    position: relative;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: #ffffff;
    padding: 9px 12px;
    padding-right: 24px;
    cursor: pointer;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.03);
  }

  .history-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .history-query {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #111111;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .history-meta {
    flex: none;
    font-size: 10px;
    line-height: 1.5;
    color: #8d8d8d;
    text-align: right;
    white-space: nowrap;
  }

  .history-delete-btn {
    position: absolute;
    top: 6px;
    right: 8px;
    border: none;
    background: transparent;
    padding: 0;
    width: 14px;
    height: 14px;
    font-size: 14px;
    line-height: 1;
    color: #a3a3a3;
    cursor: pointer;
    opacity: 0;
    transform: translateY(-1px);
    transition: opacity 0.15s ease, color 0.15s ease;
  }

  .history-item:hover .history-delete-btn,
  .history-item:focus-within .history-delete-btn {
    opacity: 1;
  }

  .history-delete-btn:hover { color: #6b6b6b; }

  .prompt-picker {
    position: absolute;
    top: calc(100% + 8px);
    left: -1px;
    right: -1px;
    min-height: 228px;
    max-height: 320px;
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    z-index: 6;
  }
  .prompt-picker[hidden] { display: none; }

  .prompt-groups-col {
    padding: 10px;
    border-right: 1px solid rgba(0, 0, 0, 0.08);
    background: #fbfbfb;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 0;
  }
  .prompt-group-item {
    width: 100%;
    min-height: 32px;
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #111;
    text-align: left;
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
    flex-shrink: 0;
  }
  .prompt-group-item.is-active,
  .prompt-group-item:hover {
    background: #111;
    color: #fff;
  }

  .prompt-list-col {
    padding: 6px 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .prompt-item {
    min-height: 36px;
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: #111;
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.07);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .prompt-item:last-child { border-bottom: none; }
  .prompt-item:hover { background: #f6f6f6; }
  .prompt-item-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 0;
  }
  .prompt-item-icons {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .prompt-item:hover .prompt-item-icons { opacity: 1; }
  .prompt-icon-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #999;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: color 120ms ease, background 120ms ease;
  }
  .prompt-icon-btn:hover { background: #e8e8e8; color: #333; }
  .prompt-empty {
    padding: 14px 12px;
    font-size: 12px;
    color: #888;
  }
  .prompt-picker-footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding: 6px 0;
    border-top: 1px solid rgba(0, 0, 0, 0.07);
    background: #fbfbfb;
  }
  .prompt-picker-footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    background: transparent;
    font-size: 11px;
    color: #aaa;
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 4px;
    transition: color 140ms ease, background 140ms ease;
  }
  .prompt-picker-footer-btn:hover { color: #555; background: #f0f0f0; }
  ${window.PromptItemUI?.PREVIEW_CSS ?? ""}

  .panel-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .hint-row {
    display: flex;
    justify-content: center;
    color: rgba(255, 255, 255, 0.78);
    font-size: 12px;
    user-select: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .kbd {
    display: inline-block;
    padding: 1px 6px;
    margin: 0 3px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.18);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }

  .panel { position: relative; }
  .settings-corner-btn {
    position: absolute;
    bottom: 10px;
    right: 10px;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #bbb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease, transform 150ms ease;
  }
  .settings-corner-btn:hover {
    color: #555;
    background: rgba(0, 0, 0, 0.06);
    transform: rotate(30deg);
  }
  .settings-corner-btn svg {
    width: 14px;
    height: 14px;
    display: block;
    flex-shrink: 0;
  }
`;
