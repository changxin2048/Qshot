(() => {
  // src/shared/prompt-item.js
  (function initPromptItemUI() {
    "use strict";
    const _EYE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const _CLOSE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const PREVIEW_CSS = `
.qshot-preview-card {
  position: fixed;
  z-index: 2147483647;
  width: 340px;
  max-width: calc(100vw - 20px);
  max-height: 360px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", Arial, sans-serif;
}
.qshot-preview-card[hidden] { display: none; }
.qshot-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  flex-shrink: 0;
}
.qshot-preview-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.qshot-preview-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  white-space: nowrap;
  font-family: inherit;
  line-height: 1;
}
.qshot-preview-btn--copy {
  border: none;
  background: #111111;
  color: #ffffff;
}
.qshot-preview-btn--copy:hover { background: #333333; }
.qshot-preview-btn--copy.is-copied { background: #2dbf62; }
.qshot-preview-btn--edit {
  border: 1px solid #dcdcdc;
  background: #ffffff;
  color: #333333;
}
.qshot-preview-btn--edit:hover {
  background: #f5f5f5;
  border-color: #c0c0c0;
}
.qshot-preview-close-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: #666666;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: background 120ms ease, color 120ms ease;
}
.qshot-preview-close-btn:hover {
  background: #f5f5f5;
  color: #111111;
}
.qshot-preview-title {
  padding: 10px 14px 0;
  font-size: 14px;
  font-weight: 600;
  color: #111111;
  line-height: 1.4;
  flex-shrink: 0;
}
.qshot-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 14px 12px;
  font-size: 13px;
  line-height: 1.65;
  color: #444444;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.qshot-preview-body::-webkit-scrollbar { width: 5px; }
.qshot-preview-body::-webkit-scrollbar-track { background: transparent; }
.qshot-preview-body::-webkit-scrollbar-thumb {
  background: #dcdcdc;
  border-radius: 3px;
}
`.trim();
    function createPreviewManager(shadowRoot) {
      let cardEl = null;
      let hideTimer = null;
      let currentOnEdit = null;
      let currentPrompt = null;
      function getHost() {
        return shadowRoot || document.body;
      }
      function fallbackCopy(text) {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        } catch (_) {
        }
      }
      function ensureCard() {
        const host = getHost();
        if (!cardEl || !host.contains(cardEl)) {
          cardEl = document.createElement("div");
          cardEl.className = "qshot-preview-card";
          cardEl.hidden = true;
          cardEl.addEventListener("mouseenter", () => {
            cancelHide();
          });
          cardEl.addEventListener("mouseleave", () => scheduleHide());
          host.appendChild(cardEl);
        }
        return cardEl;
      }
      function cancelHide() {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      }
      function show(anchorEl, prompt, opts) {
        cancelHide();
        const card = ensureCard();
        card.innerHTML = "";
        currentPrompt = prompt;
        currentOnEdit = opts && typeof opts.onEdit === "function" ? opts.onEdit : null;
        const header = document.createElement("div");
        header.className = "qshot-preview-header";
        const actions = document.createElement("div");
        actions.className = "qshot-preview-actions";
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "qshot-preview-btn qshot-preview-btn--copy";
        copyBtn.textContent = "复制";
        copyBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const text = currentPrompt && currentPrompt.content || "";
          const markCopied = () => {
            copyBtn.textContent = "✓ 已复制";
            copyBtn.classList.add("is-copied");
            setTimeout(() => {
              copyBtn.textContent = "复制";
              copyBtn.classList.remove("is-copied");
            }, 1500);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(markCopied).catch(() => {
              fallbackCopy(text);
              markCopied();
            });
          } else {
            fallbackCopy(text);
            markCopied();
          }
        });
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "qshot-preview-btn qshot-preview-btn--edit";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const cb = currentOnEdit;
          const p = currentPrompt;
          hide();
          if (cb) cb(p);
        });
        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "qshot-preview-close-btn";
        closeBtn.setAttribute("aria-label", "关闭");
        closeBtn.innerHTML = _CLOSE;
        closeBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          hide();
        });
        header.appendChild(actions);
        header.appendChild(closeBtn);
        const titleRow = document.createElement("div");
        titleRow.className = "qshot-preview-title";
        titleRow.textContent = prompt && prompt.title || "未命名提示词";
        const body = document.createElement("p");
        body.className = "qshot-preview-body";
        body.textContent = prompt && prompt.content || "（暂无内容）";
        card.appendChild(header);
        card.appendChild(titleRow);
        card.appendChild(body);
        card.hidden = false;
        requestAnimationFrame(() => {
          const rect = anchorEl.getBoundingClientRect();
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const cardW = card.offsetWidth || 340;
          const cardH = card.offsetHeight || 200;
          let top = rect.bottom + 6;
          let left = rect.left;
          if (top + cardH > vh - 8) top = rect.top - cardH - 6;
          if (top < 8) top = 8;
          if (left + cardW > vw - 8) left = vw - cardW - 8;
          if (left < 8) left = 8;
          card.style.top = `${top}px`;
          card.style.left = `${left}px`;
        });
      }
      function hide() {
        cancelHide();
        if (cardEl) cardEl.hidden = true;
        currentOnEdit = null;
        currentPrompt = null;
      }
      function scheduleHide() {
        cancelHide();
        hideTimer = setTimeout(() => hide(), 260);
      }
      function destroy() {
        hide();
        if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
        cardEl = null;
      }
      return { show, hide, scheduleHide, cancelHide, destroy };
    }
    function createItem(prompt, {
      onFill,
      onEdit,
      previewManager,
      itemClass = "popup-prompt-item",
      labelClass = "popup-prompt-item-label",
      iconsClass = "popup-prompt-edit-wrap",
      iconBtnClass = "popup-prompt-icon-btn"
    } = {}) {
      const item = document.createElement("div");
      item.className = itemClass;
      const label = document.createElement("span");
      label.className = labelClass;
      label.textContent = prompt.title || "未命名提示词";
      label.addEventListener("click", () => onFill && onFill(prompt));
      const icons = document.createElement("div");
      icons.className = iconsClass;
      const eyeBtn = document.createElement("button");
      eyeBtn.type = "button";
      eyeBtn.className = iconBtnClass;
      eyeBtn.setAttribute("aria-label", "预览");
      eyeBtn.title = "预览";
      eyeBtn.innerHTML = _EYE;
      if (previewManager) {
        let showTimer = null;
        const cancelShow = () => {
          if (showTimer) {
            clearTimeout(showTimer);
            showTimer = null;
          }
        };
        const scheduleShow = () => {
          cancelShow();
          previewManager.cancelHide?.();
          showTimer = setTimeout(() => {
            showTimer = null;
            previewManager.show(eyeBtn, prompt, { onEdit });
          }, 200);
        };
        const hidePreview = () => {
          cancelShow();
          previewManager.scheduleHide();
        };
        eyeBtn.addEventListener("mouseenter", scheduleShow);
        eyeBtn.addEventListener("pointerenter", scheduleShow);
        eyeBtn.addEventListener("focus", scheduleShow);
        eyeBtn.addEventListener("mouseleave", hidePreview);
        eyeBtn.addEventListener("pointerleave", hidePreview);
        eyeBtn.addEventListener("blur", hidePreview);
        eyeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          cancelShow();
          previewManager.cancelHide?.();
          previewManager.show(eyeBtn, prompt, { onEdit });
        });
      }
      icons.appendChild(eyeBtn);
      item.appendChild(label);
      item.appendChild(icons);
      return item;
    }
    window.PromptItemUI = { createItem, createPreviewManager, PREVIEW_CSS };
  })();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL3NoYXJlZC9wcm9tcHQtaXRlbS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXHJcbiAqIHNoYXJlZC9wcm9tcHQtaXRlbS5qc1xyXG4gKiDnu5/kuIDnmoTmj5DnpLror43mnaHnm67lt6XljoIgKyDpooTop4jljaHniYfnrqHnkIblmajjgIJcclxuICog5Zyo5LiJ5aSE5L2/55So77ya6aG26YOo5by556qXIChwb3B1cC5qcynjgIHlhajlsYDmkJzntKLmta7lsYIgKG92ZXJsYXkuanMp44CB5pCc57Si57uT5p6c6aG1IChpZnJhbWUuanMpXHJcbiAqIOS/ruaUueatpOaWh+S7tuWNs+WPr+WQjOatpeabtOaWsOS4ieWkhOihjOS4uuS4juWkluinguOAglxyXG4gKlxyXG4gKiDorr7orqHvvJpcclxuICogICAtIOadoeebruWPs+S+p+WPquS/neeVmeS4gOS4quOAjOecvOedm+OAjeaMiemSruOAglxyXG4gKiAgIC0g6byg5qCH56e75Yiw55y8552b5LiKIOKGkiDplJrlrprlnKjnnLznnZvpmYTov5HlvLnlh7rpooTop4jljaHniYfvvIjnprvlvIDlu7bov5/pmpDol4/vvInjgIJcclxuICogICAtIOmihOiniOWNoeeJh+mhtumDqOW3puS+p+S4uuOAjOWkjeWItiAvIOe8lui+keOAjeS4pOS4quaMiemSru+8jOWPs+S+p+S4uuWFs+mXreaMiemSruOAglxyXG4gKi9cclxuKGZ1bmN0aW9uIGluaXRQcm9tcHRJdGVtVUkoKSB7XHJcbiAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAvLyDilIDilIAgU1ZHIOWbvuaghyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcclxuICBjb25zdCBfRVlFID0gYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMS41XCI+PHBhdGggZD1cIk0yIDEyczMuNS03IDEwLTcgMTAgNyAxMCA3LTMuNSA3LTEwIDctMTAtNy0xMC03WlwiLz48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIi8+PC9zdmc+YDtcclxuICBjb25zdCBfQ0xPU0UgPSBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGxpbmUgeDE9XCIxOFwiIHkxPVwiNlwiIHgyPVwiNlwiIHkyPVwiMThcIi8+PGxpbmUgeDE9XCI2XCIgeTE9XCI2XCIgeDI9XCIxOFwiIHkyPVwiMThcIi8+PC9zdmc+YDtcclxuXHJcbiAgLy8g4pSA4pSAIOmihOiniOWNoeeJhyBDU1PvvIjkvpsgc2hhZG93IERPTSDkuIrkuIvmlocgb3ZlcmxheS5qcyDlvJXnlKjvvInilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcclxuICAvLyBwb3B1cC5jc3MgLyBpZnJhbWUuY3NzIOS5n+WkjeWItuS6huWQjOS4gOWll+agt+W8j++8jOeUqOS6juWQhOiHqueahOmdniBzaGFkb3cgRE9NIOWcuuaZr+OAglxyXG4gIGNvbnN0IFBSRVZJRVdfQ1NTID0gYFxyXG4ucXNob3QtcHJldmlldy1jYXJkIHtcclxuICBwb3NpdGlvbjogZml4ZWQ7XHJcbiAgei1pbmRleDogMjE0NzQ4MzY0NztcclxuICB3aWR0aDogMzQwcHg7XHJcbiAgbWF4LXdpZHRoOiBjYWxjKDEwMHZ3IC0gMjBweCk7XHJcbiAgbWF4LWhlaWdodDogMzYwcHg7XHJcbiAgYmFja2dyb3VuZDogI2ZmZmZmZjtcclxuICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDAsIDAsIDAuMDgpO1xyXG4gIGJvcmRlci1yYWRpdXM6IDE0cHg7XHJcbiAgYm94LXNoYWRvdzogMCAxNHB4IDQwcHggcmdiYSgxNSwgMjMsIDQyLCAwLjE4KTtcclxuICBkaXNwbGF5OiBmbGV4O1xyXG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XHJcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcclxuICBmb250LWZhbWlseTogXCJTZWdvZSBVSVwiLCBcIk1pY3Jvc29mdCBZYUhlaSBVSVwiLCBcIlBpbmdGYW5nIFNDXCIsIEFyaWFsLCBzYW5zLXNlcmlmO1xyXG59XHJcbi5xc2hvdC1wcmV2aWV3LWNhcmRbaGlkZGVuXSB7IGRpc3BsYXk6IG5vbmU7IH1cclxuLnFzaG90LXByZXZpZXctaGVhZGVyIHtcclxuICBkaXNwbGF5OiBmbGV4O1xyXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xyXG4gIGdhcDogMTBweDtcclxuICBwYWRkaW5nOiAxMHB4IDEycHg7XHJcbiAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC4wNyk7XHJcbiAgZmxleC1zaHJpbms6IDA7XHJcbn1cclxuLnFzaG90LXByZXZpZXctYWN0aW9ucyB7XHJcbiAgZGlzcGxheTogZmxleDtcclxuICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gIGdhcDogNnB4O1xyXG59XHJcbi5xc2hvdC1wcmV2aWV3LWJ0biB7XHJcbiAgaGVpZ2h0OiAyOHB4O1xyXG4gIHBhZGRpbmc6IDAgMTJweDtcclxuICBib3JkZXItcmFkaXVzOiA4cHg7XHJcbiAgZm9udC1zaXplOiAxM3B4O1xyXG4gIGZvbnQtd2VpZ2h0OiA1MDA7XHJcbiAgY3Vyc29yOiBwb2ludGVyO1xyXG4gIHRyYW5zaXRpb246IGJhY2tncm91bmQgMTQwbXMgZWFzZSwgY29sb3IgMTQwbXMgZWFzZSwgYm9yZGVyLWNvbG9yIDE0MG1zIGVhc2U7XHJcbiAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcclxuICBmb250LWZhbWlseTogaW5oZXJpdDtcclxuICBsaW5lLWhlaWdodDogMTtcclxufVxyXG4ucXNob3QtcHJldmlldy1idG4tLWNvcHkge1xyXG4gIGJvcmRlcjogbm9uZTtcclxuICBiYWNrZ3JvdW5kOiAjMTExMTExO1xyXG4gIGNvbG9yOiAjZmZmZmZmO1xyXG59XHJcbi5xc2hvdC1wcmV2aWV3LWJ0bi0tY29weTpob3ZlciB7IGJhY2tncm91bmQ6ICMzMzMzMzM7IH1cclxuLnFzaG90LXByZXZpZXctYnRuLS1jb3B5LmlzLWNvcGllZCB7IGJhY2tncm91bmQ6ICMyZGJmNjI7IH1cclxuLnFzaG90LXByZXZpZXctYnRuLS1lZGl0IHtcclxuICBib3JkZXI6IDFweCBzb2xpZCAjZGNkY2RjO1xyXG4gIGJhY2tncm91bmQ6ICNmZmZmZmY7XHJcbiAgY29sb3I6ICMzMzMzMzM7XHJcbn1cclxuLnFzaG90LXByZXZpZXctYnRuLS1lZGl0OmhvdmVyIHtcclxuICBiYWNrZ3JvdW5kOiAjZjVmNWY1O1xyXG4gIGJvcmRlci1jb2xvcjogI2MwYzBjMDtcclxufVxyXG4ucXNob3QtcHJldmlldy1jbG9zZS1idG4ge1xyXG4gIHdpZHRoOiAyNHB4O1xyXG4gIGhlaWdodDogMjRweDtcclxuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcclxuICBhbGlnbi1pdGVtczogY2VudGVyO1xyXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xyXG4gIGJvcmRlcjogbm9uZTtcclxuICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcclxuICBib3JkZXItcmFkaXVzOiA1MCU7XHJcbiAgY29sb3I6ICM2NjY2NjY7XHJcbiAgY3Vyc29yOiBwb2ludGVyO1xyXG4gIGZsZXgtc2hyaW5rOiAwO1xyXG4gIHBhZGRpbmc6IDA7XHJcbiAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAxMjBtcyBlYXNlLCBjb2xvciAxMjBtcyBlYXNlO1xyXG59XHJcbi5xc2hvdC1wcmV2aWV3LWNsb3NlLWJ0bjpob3ZlciB7XHJcbiAgYmFja2dyb3VuZDogI2Y1ZjVmNTtcclxuICBjb2xvcjogIzExMTExMTtcclxufVxyXG4ucXNob3QtcHJldmlldy10aXRsZSB7XHJcbiAgcGFkZGluZzogMTBweCAxNHB4IDA7XHJcbiAgZm9udC1zaXplOiAxNHB4O1xyXG4gIGZvbnQtd2VpZ2h0OiA2MDA7XHJcbiAgY29sb3I6ICMxMTExMTE7XHJcbiAgbGluZS1oZWlnaHQ6IDEuNDtcclxuICBmbGV4LXNocmluazogMDtcclxufVxyXG4ucXNob3QtcHJldmlldy1ib2R5IHtcclxuICBmbGV4OiAxO1xyXG4gIG92ZXJmbG93LXk6IGF1dG87XHJcbiAgcGFkZGluZzogNnB4IDE0cHggMTJweDtcclxuICBmb250LXNpemU6IDEzcHg7XHJcbiAgbGluZS1oZWlnaHQ6IDEuNjU7XHJcbiAgY29sb3I6ICM0NDQ0NDQ7XHJcbiAgd2hpdGUtc3BhY2U6IHByZS13cmFwO1xyXG4gIHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7XHJcbiAgbWFyZ2luOiAwO1xyXG59XHJcbi5xc2hvdC1wcmV2aWV3LWJvZHk6Oi13ZWJraXQtc2Nyb2xsYmFyIHsgd2lkdGg6IDVweDsgfVxyXG4ucXNob3QtcHJldmlldy1ib2R5Ojotd2Via2l0LXNjcm9sbGJhci10cmFjayB7IGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyB9XHJcbi5xc2hvdC1wcmV2aWV3LWJvZHk6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iIHtcclxuICBiYWNrZ3JvdW5kOiAjZGNkY2RjO1xyXG4gIGJvcmRlci1yYWRpdXM6IDNweDtcclxufVxyXG5gLnRyaW0oKTtcclxuXHJcbiAgLy8g4pSA4pSAIOmihOiniOWNoeeJh+euoeeQhuWZqCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcclxuICAvKipcclxuICAgKiBAcGFyYW0ge1NoYWRvd1Jvb3R8bnVsbH0gc2hhZG93Um9vdFxyXG4gICAqICAg5Lyg5YWlIFNoYWRvd1Jvb3Qg5YiZ5bCG5Y2h54mH5oyC5YiwIHNoYWRvdyBET03vvIhvdmVybGF5IOWcuuaZr++8ie+8m1xyXG4gICAqICAg5Lyg5YWlIG51bGwg5YiZ5oyC5YiwIGRvY3VtZW50LmJvZHnvvIhwb3B1cCAvIGlmcmFtZSDlnLrmma/vvInjgIJcclxuICAgKi9cclxuICBmdW5jdGlvbiBjcmVhdGVQcmV2aWV3TWFuYWdlcihzaGFkb3dSb290KSB7XHJcbiAgICBsZXQgY2FyZEVsID0gbnVsbDtcclxuICAgIGxldCBoaWRlVGltZXIgPSBudWxsO1xyXG4gICAgbGV0IGN1cnJlbnRPbkVkaXQgPSBudWxsO1xyXG4gICAgbGV0IGN1cnJlbnRQcm9tcHQgPSBudWxsO1xyXG5cclxuICAgIGZ1bmN0aW9uIGdldEhvc3QoKSB7XHJcbiAgICAgIHJldHVybiBzaGFkb3dSb290IHx8IGRvY3VtZW50LmJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZmFsbGJhY2tDb3B5KHRleHQpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB0YSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XHJcbiAgICAgICAgdGEudmFsdWUgPSB0ZXh0O1xyXG4gICAgICAgIHRhLnN0eWxlLmNzc1RleHQgPSAncG9zaXRpb246Zml4ZWQ7b3BhY2l0eTowO3RvcDowO2xlZnQ6MCc7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0YSk7XHJcbiAgICAgICAgdGEuc2VsZWN0KCk7XHJcbiAgICAgICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2NvcHknKTtcclxuICAgICAgICB0YS5yZW1vdmUoKTtcclxuICAgICAgfSBjYXRjaCAoXykgeyAvKiDpnZnpu5jlpLHotKUgKi8gfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGVuc3VyZUNhcmQoKSB7XHJcbiAgICAgIGNvbnN0IGhvc3QgPSBnZXRIb3N0KCk7XHJcbiAgICAgIGlmICghY2FyZEVsIHx8ICFob3N0LmNvbnRhaW5zKGNhcmRFbCkpIHtcclxuICAgICAgICBjYXJkRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBjYXJkRWwuY2xhc3NOYW1lID0gJ3FzaG90LXByZXZpZXctY2FyZCc7XHJcbiAgICAgICAgY2FyZEVsLmhpZGRlbiA9IHRydWU7XHJcbiAgICAgICAgY2FyZEVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XHJcbiAgICAgICAgICBjYW5jZWxIaWRlKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY2FyZEVsLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiBzY2hlZHVsZUhpZGUoKSk7XHJcbiAgICAgICAgaG9zdC5hcHBlbmRDaGlsZChjYXJkRWwpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBjYXJkRWw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gY2FuY2VsSGlkZSgpIHtcclxuICAgICAgaWYgKGhpZGVUaW1lcikge1xyXG4gICAgICAgIGNsZWFyVGltZW91dChoaWRlVGltZXIpO1xyXG4gICAgICAgIGhpZGVUaW1lciA9IG51bGw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGFuY2hvckVsXHJcbiAgICAgKiBAcGFyYW0ge3t0aXRsZT86c3RyaW5nLCBjb250ZW50PzpzdHJpbmd9fSBwcm9tcHRcclxuICAgICAqIEBwYXJhbSB7eyBvbkVkaXQ/OiAocDphbnkpPT52b2lkIH19IFtvcHRzXVxyXG4gICAgICovXHJcbiAgICBmdW5jdGlvbiBzaG93KGFuY2hvckVsLCBwcm9tcHQsIG9wdHMpIHtcclxuICAgICAgY2FuY2VsSGlkZSgpO1xyXG4gICAgICBjb25zdCBjYXJkID0gZW5zdXJlQ2FyZCgpO1xyXG4gICAgICBjYXJkLmlubmVySFRNTCA9ICcnO1xyXG4gICAgICBjdXJyZW50UHJvbXB0ID0gcHJvbXB0O1xyXG4gICAgICBjdXJyZW50T25FZGl0ID0gKG9wdHMgJiYgdHlwZW9mIG9wdHMub25FZGl0ID09PSAnZnVuY3Rpb24nKSA/IG9wdHMub25FZGl0IDogbnVsbDtcclxuXHJcbiAgICAgIC8vIEhlYWRlcu+8muW3puS+pyDlpI3liLYgKyDnvJbovpHvvIzlj7Pkvqcg5YWz6ZetXHJcbiAgICAgIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICBoZWFkZXIuY2xhc3NOYW1lID0gJ3FzaG90LXByZXZpZXctaGVhZGVyJztcclxuXHJcbiAgICAgIGNvbnN0IGFjdGlvbnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgYWN0aW9ucy5jbGFzc05hbWUgPSAncXNob3QtcHJldmlldy1hY3Rpb25zJztcclxuXHJcbiAgICAgIGNvbnN0IGNvcHlCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcclxuICAgICAgY29weUJ0bi50eXBlID0gJ2J1dHRvbic7XHJcbiAgICAgIGNvcHlCdG4uY2xhc3NOYW1lID0gJ3FzaG90LXByZXZpZXctYnRuIHFzaG90LXByZXZpZXctYnRuLS1jb3B5JztcclxuICAgICAgY29weUJ0bi50ZXh0Q29udGVudCA9ICflpI3liLYnO1xyXG4gICAgICBjb3B5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2KSA9PiB7XHJcbiAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IChjdXJyZW50UHJvbXB0ICYmIGN1cnJlbnRQcm9tcHQuY29udGVudCkgfHwgJyc7XHJcbiAgICAgICAgY29uc3QgbWFya0NvcGllZCA9ICgpID0+IHtcclxuICAgICAgICAgIGNvcHlCdG4udGV4dENvbnRlbnQgPSAn4pyTIOW3suWkjeWItic7XHJcbiAgICAgICAgICBjb3B5QnRuLmNsYXNzTGlzdC5hZGQoJ2lzLWNvcGllZCcpO1xyXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvcHlCdG4udGV4dENvbnRlbnQgPSAn5aSN5Yi2JztcclxuICAgICAgICAgICAgY29weUJ0bi5jbGFzc0xpc3QucmVtb3ZlKCdpcy1jb3BpZWQnKTtcclxuICAgICAgICAgIH0sIDE1MDApO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgaWYgKG5hdmlnYXRvci5jbGlwYm9hcmQgJiYgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQpIHtcclxuICAgICAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRleHQpLnRoZW4obWFya0NvcGllZCkuY2F0Y2goKCkgPT4ge1xyXG4gICAgICAgICAgICBmYWxsYmFja0NvcHkodGV4dCk7XHJcbiAgICAgICAgICAgIG1hcmtDb3BpZWQoKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBmYWxsYmFja0NvcHkodGV4dCk7XHJcbiAgICAgICAgICBtYXJrQ29waWVkKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IGVkaXRCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcclxuICAgICAgZWRpdEJ0bi50eXBlID0gJ2J1dHRvbic7XHJcbiAgICAgIGVkaXRCdG4uY2xhc3NOYW1lID0gJ3FzaG90LXByZXZpZXctYnRuIHFzaG90LXByZXZpZXctYnRuLS1lZGl0JztcclxuICAgICAgZWRpdEJ0bi50ZXh0Q29udGVudCA9ICfnvJbovpEnO1xyXG4gICAgICBlZGl0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2KSA9PiB7XHJcbiAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgY29uc3QgY2IgPSBjdXJyZW50T25FZGl0O1xyXG4gICAgICAgIGNvbnN0IHAgPSBjdXJyZW50UHJvbXB0O1xyXG4gICAgICAgIGhpZGUoKTtcclxuICAgICAgICBpZiAoY2IpIGNiKHApO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoY29weUJ0bik7XHJcbiAgICAgIGFjdGlvbnMuYXBwZW5kQ2hpbGQoZWRpdEJ0bik7XHJcblxyXG4gICAgICBjb25zdCBjbG9zZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xyXG4gICAgICBjbG9zZUJ0bi50eXBlID0gJ2J1dHRvbic7XHJcbiAgICAgIGNsb3NlQnRuLmNsYXNzTmFtZSA9ICdxc2hvdC1wcmV2aWV3LWNsb3NlLWJ0bic7XHJcbiAgICAgIGNsb3NlQnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICflhbPpl60nKTtcclxuICAgICAgY2xvc2VCdG4uaW5uZXJIVE1MID0gX0NMT1NFO1xyXG4gICAgICBjbG9zZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldikgPT4ge1xyXG4gICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgIGhpZGUoKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBoZWFkZXIuYXBwZW5kQ2hpbGQoYWN0aW9ucyk7XHJcbiAgICAgIGhlYWRlci5hcHBlbmRDaGlsZChjbG9zZUJ0bik7XHJcblxyXG4gICAgICBjb25zdCB0aXRsZVJvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICB0aXRsZVJvdy5jbGFzc05hbWUgPSAncXNob3QtcHJldmlldy10aXRsZSc7XHJcbiAgICAgIHRpdGxlUm93LnRleHRDb250ZW50ID0gKHByb21wdCAmJiBwcm9tcHQudGl0bGUpIHx8ICfmnKrlkb3lkI3mj5DnpLror40nO1xyXG5cclxuICAgICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICAgICAgYm9keS5jbGFzc05hbWUgPSAncXNob3QtcHJldmlldy1ib2R5JztcclxuICAgICAgYm9keS50ZXh0Q29udGVudCA9IChwcm9tcHQgJiYgcHJvbXB0LmNvbnRlbnQpIHx8ICfvvIjmmoLml6DlhoXlrrnvvIknO1xyXG5cclxuICAgICAgY2FyZC5hcHBlbmRDaGlsZChoZWFkZXIpO1xyXG4gICAgICBjYXJkLmFwcGVuZENoaWxkKHRpdGxlUm93KTtcclxuICAgICAgY2FyZC5hcHBlbmRDaGlsZChib2R5KTtcclxuICAgICAgY2FyZC5oaWRkZW4gPSBmYWxzZTtcclxuXHJcbiAgICAgIC8vIOWumuS9je+8muS8mOWFiOWcqOmUmueCueS4i+aWue+8jOepuumXtOS4jei2s+WImee/u+i9rOWIsOS4iuaWuVxyXG4gICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSBhbmNob3JFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCB2dyA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IHZoID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGNhcmRXID0gY2FyZC5vZmZzZXRXaWR0aCB8fCAzNDA7XHJcbiAgICAgICAgY29uc3QgY2FyZEggPSBjYXJkLm9mZnNldEhlaWdodCB8fCAyMDA7XHJcbiAgICAgICAgbGV0IHRvcCA9IHJlY3QuYm90dG9tICsgNjtcclxuICAgICAgICBsZXQgbGVmdCA9IHJlY3QubGVmdDtcclxuICAgICAgICBpZiAodG9wICsgY2FyZEggPiB2aCAtIDgpIHRvcCA9IHJlY3QudG9wIC0gY2FyZEggLSA2O1xyXG4gICAgICAgIGlmICh0b3AgPCA4KSB0b3AgPSA4O1xyXG4gICAgICAgIGlmIChsZWZ0ICsgY2FyZFcgPiB2dyAtIDgpIGxlZnQgPSB2dyAtIGNhcmRXIC0gODtcclxuICAgICAgICBpZiAobGVmdCA8IDgpIGxlZnQgPSA4O1xyXG4gICAgICAgIGNhcmQuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcclxuICAgICAgICBjYXJkLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gaGlkZSgpIHtcclxuICAgICAgY2FuY2VsSGlkZSgpO1xyXG4gICAgICBpZiAoY2FyZEVsKSBjYXJkRWwuaGlkZGVuID0gdHJ1ZTtcclxuICAgICAgY3VycmVudE9uRWRpdCA9IG51bGw7XHJcbiAgICAgIGN1cnJlbnRQcm9tcHQgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHNjaGVkdWxlSGlkZSgpIHtcclxuICAgICAgY2FuY2VsSGlkZSgpO1xyXG4gICAgICBoaWRlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGhpZGUoKSwgMjYwKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBkZXN0cm95KCkge1xyXG4gICAgICBoaWRlKCk7XHJcbiAgICAgIGlmIChjYXJkRWwgJiYgY2FyZEVsLnBhcmVudE5vZGUpIGNhcmRFbC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGNhcmRFbCk7XHJcbiAgICAgIGNhcmRFbCA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHsgc2hvdywgaGlkZSwgc2NoZWR1bGVIaWRlLCBjYW5jZWxIaWRlLCBkZXN0cm95IH07XHJcbiAgfVxyXG5cclxuICAvLyDilIDilIAg5o+Q56S66K+N5p2h55uu5bel5Y6CIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxyXG4gIC8qKlxyXG4gICAqIOWIm+W7uuS4gOS4quWujOaVtOeahOaPkOekuuivjeadoeebriBET00g5YWD57Sg77yI5qCH6aKYICsg55y8552b5Zu+5qCH77yJ44CCXHJcbiAgICog5aSN5Yi2L+e8lui+keaTjeS9nOW3sue7n+S4gOi/geenu+WIsOmihOiniOWNoeeJh+WGhe+8jOatpOWkhOS4jeWGjea4suafk+WvueW6lOWbvuagh+OAglxyXG4gICAqXHJcbiAgICogQHBhcmFtIHtPYmplY3R9IHByb21wdCAgICAgICAgLSB7IHRpdGxlLCBjb250ZW50IH1cclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0c1xyXG4gICAqICAgLSBvbkZpbGwocCkgICAgICAg54K55Ye75qCH6aKY5pe25Zue6LCD77yI5aGr5YWl6L6T5YWl5qGG77yJXHJcbiAgICogICAtIG9uRWRpdChwKSAgICAgICDpooTop4jljaHniYflhoXjgIznvJbovpHjgI3mjInpkq7ngrnlh7vml7blm57osINcclxuICAgKiAgIC0gcHJldmlld01hbmFnZXIgIGNyZWF0ZVByZXZpZXdNYW5hZ2VyKCkg55qE6L+U5Zue5YC8XHJcbiAgICogICAtIGl0ZW1DbGFzcyAgICAgICDmnaHnm67lrrnlmaggQ1NTIOexu++8iOm7mOiupOWMuemFjSBwb3B1cC9pZnJhbWUg55qE5qC35byP77yJXHJcbiAgICogICAtIGxhYmVsQ2xhc3MgICAgICDmoIfpopggQ1NTIOexu1xyXG4gICAqICAgLSBpY29uc0NsYXNzICAgICAg5Zu+5qCH5Yy65Z+fIENTUyDnsbtcclxuICAgKiAgIC0gaWNvbkJ0bkNsYXNzICAgIOavj+S4quWbvuagh+aMiemSriBDU1Mg57G7XHJcbiAgICovXHJcbiAgZnVuY3Rpb24gY3JlYXRlSXRlbShwcm9tcHQsIHtcclxuICAgIG9uRmlsbCxcclxuICAgIG9uRWRpdCxcclxuICAgIHByZXZpZXdNYW5hZ2VyLFxyXG4gICAgaXRlbUNsYXNzICAgID0gJ3BvcHVwLXByb21wdC1pdGVtJyxcclxuICAgIGxhYmVsQ2xhc3MgICA9ICdwb3B1cC1wcm9tcHQtaXRlbS1sYWJlbCcsXHJcbiAgICBpY29uc0NsYXNzICAgPSAncG9wdXAtcHJvbXB0LWVkaXQtd3JhcCcsXHJcbiAgICBpY29uQnRuQ2xhc3MgPSAncG9wdXAtcHJvbXB0LWljb24tYnRuJyxcclxuICB9ID0ge30pIHtcclxuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgIGl0ZW0uY2xhc3NOYW1lID0gaXRlbUNsYXNzO1xyXG5cclxuICAgIGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgbGFiZWwuY2xhc3NOYW1lID0gbGFiZWxDbGFzcztcclxuICAgIGxhYmVsLnRleHRDb250ZW50ID0gcHJvbXB0LnRpdGxlIHx8ICfmnKrlkb3lkI3mj5DnpLror40nO1xyXG4gICAgbGFiZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvbkZpbGwgJiYgb25GaWxsKHByb21wdCkpO1xyXG5cclxuICAgIGNvbnN0IGljb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICBpY29ucy5jbGFzc05hbWUgPSBpY29uc0NsYXNzO1xyXG5cclxuICAgIC8vIOS7heS/neeVmeOAjOecvOedm+OAjeWbvuagh++8muaCrOWBnCDihpIg5by55Ye66aKE6KeI77yI5YaF572u5aSN5Yi2L+e8lui+keaMiemSru+8iVxyXG4gICAgY29uc3QgZXllQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XHJcbiAgICBleWVCdG4udHlwZSA9ICdidXR0b24nO1xyXG4gICAgZXllQnRuLmNsYXNzTmFtZSA9IGljb25CdG5DbGFzcztcclxuICAgIGV5ZUJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAn6aKE6KeIJyk7XHJcbiAgICBleWVCdG4udGl0bGUgPSAn6aKE6KeIJztcclxuICAgIGV5ZUJ0bi5pbm5lckhUTUwgPSBfRVlFO1xyXG4gICAgaWYgKHByZXZpZXdNYW5hZ2VyKSB7XHJcbiAgICAgIGxldCBzaG93VGltZXIgPSBudWxsO1xyXG4gICAgICBjb25zdCBjYW5jZWxTaG93ID0gKCkgPT4ge1xyXG4gICAgICAgIGlmIChzaG93VGltZXIpIHsgY2xlYXJUaW1lb3V0KHNob3dUaW1lcik7IHNob3dUaW1lciA9IG51bGw7IH1cclxuICAgICAgfTtcclxuICAgICAgY29uc3Qgc2NoZWR1bGVTaG93ID0gKCkgPT4ge1xyXG4gICAgICAgIGNhbmNlbFNob3coKTtcclxuICAgICAgICBwcmV2aWV3TWFuYWdlci5jYW5jZWxIaWRlPy4oKTtcclxuICAgICAgICBzaG93VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgIHNob3dUaW1lciA9IG51bGw7XHJcbiAgICAgICAgICBwcmV2aWV3TWFuYWdlci5zaG93KGV5ZUJ0biwgcHJvbXB0LCB7IG9uRWRpdCB9KTtcclxuICAgICAgICB9LCAyMDApO1xyXG4gICAgICB9O1xyXG4gICAgICBjb25zdCBoaWRlUHJldmlldyA9ICgpID0+IHtcclxuICAgICAgICBjYW5jZWxTaG93KCk7XHJcbiAgICAgICAgcHJldmlld01hbmFnZXIuc2NoZWR1bGVIaWRlKCk7XHJcbiAgICAgIH07XHJcbiAgICAgIGV5ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgc2NoZWR1bGVTaG93KTtcclxuICAgICAgZXllQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJlbnRlcicsIHNjaGVkdWxlU2hvdyk7XHJcbiAgICAgIGV5ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsIHNjaGVkdWxlU2hvdyk7XHJcbiAgICAgIGV5ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgaGlkZVByZXZpZXcpO1xyXG4gICAgICBleWVCdG4uYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxlYXZlJywgaGlkZVByZXZpZXcpO1xyXG4gICAgICBleWVCdG4uYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIGhpZGVQcmV2aWV3KTtcclxuICAgICAgZXllQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcclxuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgIGNhbmNlbFNob3coKTtcclxuICAgICAgICBwcmV2aWV3TWFuYWdlci5jYW5jZWxIaWRlPy4oKTtcclxuICAgICAgICBwcmV2aWV3TWFuYWdlci5zaG93KGV5ZUJ0biwgcHJvbXB0LCB7IG9uRWRpdCB9KTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWNvbnMuYXBwZW5kQ2hpbGQoZXllQnRuKTtcclxuICAgIGl0ZW0uYXBwZW5kQ2hpbGQobGFiZWwpO1xyXG4gICAgaXRlbS5hcHBlbmRDaGlsZChpY29ucyk7XHJcbiAgICByZXR1cm4gaXRlbTtcclxuICB9XHJcblxyXG4gIHdpbmRvdy5Qcm9tcHRJdGVtVUkgPSB7IGNyZWF0ZUl0ZW0sIGNyZWF0ZVByZXZpZXdNYW5hZ2VyLCBQUkVWSUVXX0NTUyB9O1xyXG59KSgpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiOztBQVdBLEdBQUMsU0FBUyxtQkFBbUI7QUFDM0I7QUFHQSxVQUFNLE9BQU87QUFDYixVQUFNLFNBQVM7QUFJZixVQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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
