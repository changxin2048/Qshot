export const OVERLAY_PICKER_STYLES = `
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
