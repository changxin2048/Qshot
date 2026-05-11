import { escapeHtml } from "./utils.js";
import { collectVisibleResponses, buildExportFilename, downloadFile } from "./export-collect.js";
import { generateExportContent } from "./export-sections.js";
import { state, SITE_CATEGORIES } from "./state.js";

export function showExportModal() {
  const existing = document.getElementById("exportModal");
  if (existing) {
    existing.remove();
    return;
  }

  const aiSiteIds = new Set(
    (SITE_CATEGORIES.find((c) => c.id === "ai")?.builtinIds) || []
  );
  const exportableRefs = Array.from(state.cardRefs.values()).filter((ref) =>
    aiSiteIds.has(ref?.site?.id)
  );
  const selectedSiteIds = new Set(exportableRefs.map((ref) => ref.site.id));
  let selectedFormat = "markdown";

  const modal = document.createElement("div");
  modal.id = "exportModal";
  modal.className = "export-modal";
  modal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-header">
        <h3 class="export-modal-title">导出对话结果</h3>
        <button class="export-close-btn" type="button" aria-label="关闭"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="export-notice">将读取各卡片当前已加载的 AI 回答内容，结果取决于页面加载状态。<br>此功能还处于测试阶段，可能存在内容提取不完整或格式异常等问题。<br>仅支持 AI 模型对话导出。</div>
      <div class="export-modal-body">
        <div class="export-section">
          <div class="export-section-title">导出格式</div>
          <div class="export-option-row">
            <button class="export-option-btn is-active" data-export-format="markdown">Markdown</button>
            <button class="export-option-btn" data-export-format="txt">TXT</button>
          </div>
        </div>
        <div class="export-section">
          <div class="export-section-title">选择导出</div>
          <div class="export-site-list"></div>
        </div>
      </div>
      <div class="export-actions">
        <button class="export-cancel-btn" type="button">取消</button>
        <button class="export-confirm-btn" type="button">导出</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const siteList = modal.querySelector(".export-site-list");
  let isExporting = false;

  if (exportableRefs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "export-site-empty";
    empty.textContent = "当前页面没有可导出的 AI 模型卡片。";
    siteList.appendChild(empty);
  } else {
    exportableRefs.forEach((ref) => {
      const row = document.createElement("label");
      row.className = "export-site-item";
      row.innerHTML = `
        <input type="checkbox" checked data-site-id="${escapeHtml(ref.site.id)}" />
        <span>${escapeHtml(ref.site.name)}</span>
      `;

      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedSiteIds.add(ref.site.id);
        } else {
          selectedSiteIds.delete(ref.site.id);
        }
      });

      siteList.appendChild(row);
    });
  }

  modal.querySelectorAll("[data-export-format]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedFormat = button.dataset.exportFormat;
      modal.querySelectorAll("[data-export-format]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
    });
  });

  const closeModal = (force = false) => {
    if (isExporting && !force) {
      return;
    }
    modal.remove();
  };

  modal.querySelector(".export-close-btn").addEventListener("click", closeModal);
  modal.querySelector(".export-cancel-btn").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  const confirmBtn = modal.querySelector(".export-confirm-btn");
  const cancelBtn = modal.querySelector(".export-cancel-btn");
  const noticeEl = modal.querySelector(".export-notice");

  confirmBtn.addEventListener("click", async () => {
    if (isExporting) {
      return;
    }
    if (selectedSiteIds.size === 0) {
      noticeEl.textContent = "请至少选择一个要导出的 AI 模型。";
      return;
    }

    isExporting = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = "正在导出...";
    noticeEl.textContent = `正在读取 ${selectedSiteIds.size} 个卡片内容，请稍候...`;

    try {
      const responses = await collectVisibleResponses(selectedSiteIds);
      const content = generateExportContent(responses, selectedFormat, selectedSiteIds);
      const extension = selectedFormat === "markdown" ? "md" : selectedFormat;
      const mimeType = selectedFormat === "html" ? "text/html" : "text/plain";
      downloadFile(content, buildExportFilename(extension), mimeType);
      closeModal(true);
    } catch (error) {
      isExporting = false;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmBtn.textContent = "导出";
      noticeEl.textContent = `导出失败：${error.message || "未知错误"}`;
    }
  });

}
