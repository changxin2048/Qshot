// Split into two CSS blocks to keep the file under the 500-line limit.
const BASE = `
  :host {
    all: initial;
    --qshot-panel-scale: 1.167;
    --qshot-panel-offset-y: -80px;
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
    width: 420px;
    max-width: calc(100vw - 32px);
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
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
  .composer.is-mid-expanded,
  .composer.is-expanded {
    padding: 12px 14px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .composer.is-mid-expanded {
    min-height: 82px;
  }
  .composer.is-expanded {
    min-height: 118px;
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
  .composer.is-mid-expanded .query-input {
    min-height: 40px;
    height: auto;
    overflow-y: hidden;
    padding: 2px 4px 0 0;
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
  .composer.is-mid-expanded .actions-row,
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
  @keyframes qshot-pick-wiggle {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-3px) rotate(-2deg); }
    75% { transform: translateY(-2px) rotate(2deg); }
  }
  .group-btn[data-pick-num] {
    position: relative;
    animation: qshot-pick-wiggle 0.5s ease-in-out infinite;
    border-color: #111;
  }
  .group-btn[data-pick-num]:hover {
    animation: qshot-pick-wiggle 0.5s ease-in-out infinite;
  }
  .group-btn[data-pick-num]::before {
    content: attr(data-pick-num);
    position: absolute;
    top: -10px;
    left: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: #111;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    pointer-events: none;
    box-sizing: border-box;
  }
  @keyframes qshot-flip-out {
    from { transform: perspective(500px) rotateY(0deg); opacity: 1; }
    to   { transform: perspective(500px) rotateY(90deg); opacity: 0; }
  }
  @keyframes qshot-flip-in {
    from { transform: perspective(500px) rotateY(-90deg); opacity: 0; }
    to   { transform: perspective(500px) rotateY(0deg); opacity: 1; }
  }
  .groups.flip-out {
    animation: qshot-flip-out 0.18s ease-in forwards;
    pointer-events: none;
  }
  .groups.flip-in {
    animation: qshot-flip-in 0.18s ease-out forwards;
  }
  .site-pick-btn {
    min-width: 84px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid rgba(0, 0, 0, 0.38);
    border-radius: 999px;
    background: #fff;
    color: #111;
    font-size: 14px;
    line-height: 1.2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease;
  }
  .site-pick-btn:hover {
    background: #111;
    color: #fff;
    border-color: #111;
    transform: translateY(-1px);
  }
  .site-pick-btn[data-pick-num] {
    animation: qshot-pick-wiggle 0.5s ease-in-out infinite;
    border-color: rgba(0, 0, 0, 0.62);
  }
  .site-pick-btn[data-pick-num]::before {
    content: attr(data-pick-num);
    position: absolute;
    top: -10px;
    left: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: #444;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    pointer-events: none;
    box-sizing: border-box;
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
`;
const PICKER = `
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
    animation: qshotPopIn 180ms cubic-bezier(.2,.9,.3,1.1) forwards;
    transform: translateY(var(--qshot-panel-offset-y)) scale(var(--qshot-panel-scale));
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
    bottom: 5px;
    right: 5px;
    width: 24px;
    height: 24px;
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
    width: 13px;
    height: 13px;
    display: block;
    flex-shrink: 0;
  }
`;
const DARK = `
  .panel.dark {
    background: #27272a;
    color: #f4f4f5;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  }
  .title-logo.dark {
    filter: brightness(0) invert(1);
  }
  .panel.dark .composer {
    border-color: #3f3f46;
    background: #27272a;
    box-shadow: 0 5px 12px rgba(0, 0, 0, 0.35);
  }
  .panel.dark .query-input {
    color: #f4f4f5;
  }
  .panel.dark .query-input::placeholder {
    color: #71717a;
  }
  .panel.dark .icon-btn {
    color: #d4d4d8;
  }
  .panel.dark .icon-btn:hover {
    color: #f4f4f5;
  }
  .panel.dark .group-btn {
    border-color: rgba(255, 255, 255, 0.5);
    background: #27272a;
    color: #f4f4f5;
  }
  .panel.dark .group-btn:hover {
    background: #f4f4f5;
    color: #18181b;
    border-color: #f4f4f5;
  }
  .panel.dark .site-pick-btn {
    border-color: rgba(255, 255, 255, 0.35);
    background: #27272a;
    color: #f4f4f5;
  }
  .panel.dark .site-pick-btn:hover {
    background: #f4f4f5;
    color: #18181b;
    border-color: #f4f4f5;
  }
  .panel.dark .group-tooltip {
    background: #27272a;
    border-color: #3f3f46;
    color: #f4f4f5;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.5);
  }
  .panel.dark .group-tooltip-item {
    border-color: rgba(255, 255, 255, 0.2);
    background: #27272a;
    color: #f4f4f5;
  }
  .panel.dark .group-tooltip-item:hover {
    background: #f4f4f5;
    border-color: #f4f4f5;
    color: #18181b;
  }
  .panel.dark .section-divider::before,
  .panel.dark .section-divider::after {
    background: rgba(255, 255, 255, 0.18);
  }
  .panel.dark .section-divider-label {
    color: #a1a1aa;
  }
  .panel.dark .history-empty {
    color: #71717a;
  }
  .panel.dark .history-item {
    border-color: rgba(255, 255, 255, 0.08);
    background: #2a2a2e;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
  }
  .panel.dark .history-item:hover {
    background: #3f3f46;
  }
  .panel.dark .history-query {
    color: #f4f4f5;
  }
  .panel.dark .history-meta {
    color: #71717a;
  }
  .panel.dark .history-delete-btn {
    color: #71717a;
  }
  .panel.dark .history-delete-btn:hover {
    color: #a1a1aa;
  }
  .panel.dark .settings-corner-btn {
    color: #71717a;
  }
  .panel.dark .settings-corner-btn:hover {
    color: #d4d4d8;
    background: rgba(255, 255, 255, 0.08);
  }
  .panel.dark .prompt-picker {
    border-color: #3f3f46;
    background: #27272a;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.5);
  }
  .panel.dark .prompt-groups-col {
    background: #2a2a2e;
    border-right-color: rgba(255, 255, 255, 0.08);
  }
  .panel.dark .prompt-group-item {
    color: #d4d4d8;
  }
  .panel.dark .prompt-group-item.is-active,
  .panel.dark .prompt-group-item:hover {
    background: #f4f4f5;
    color: #18181b;
  }
  .panel.dark .prompt-item {
    color: #f4f4f5;
    border-bottom-color: rgba(255, 255, 255, 0.07);
  }
  .panel.dark .prompt-item:hover {
    background: #3f3f46;
  }
  .panel.dark .prompt-icon-btn {
    color: #71717a;
  }
  .panel.dark .prompt-icon-btn:hover {
    background: #3f3f46;
    color: #d4d4d8;
  }
  .panel.dark .prompt-empty {
    color: #71717a;
  }
  .panel.dark .prompt-picker-footer {
    border-top-color: rgba(255, 255, 255, 0.07);
    background: #2a2a2e;
  }
  .panel.dark .prompt-picker-footer-btn {
    color: #71717a;
  }
  .panel.dark .prompt-picker-footer-btn:hover {
    color: #d4d4d8;
    background: #3f3f46;
  }
`;
export const OVERLAY_STYLES = BASE + PICKER + DARK;
