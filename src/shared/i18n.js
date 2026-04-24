(function initI18nHelpers() {
  if (window.__QSHOT_I18N__) {
    return;
  }

  function getUiLanguage() {
    try {
      return chrome?.i18n?.getUILanguage?.() || "en";
    } catch (_e) {
      return "en";
    }
  }

  function t(key, substitutions) {
    try {
      const msg = chrome?.i18n?.getMessage?.(key, substitutions);
      if (msg) return msg;
    } catch (_e) {
      // ignore
    }
    return "";
  }

  function applyDomI18n(root = document) {
    const lang = getUiLanguage();
    if (document?.documentElement) {
      document.documentElement.lang = lang;
    }

    const nodes = root.querySelectorAll("[data-i18n], [data-i18n-attr]");
    nodes.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) {
        const msg = t(key);
        if (msg) {
          el.textContent = msg;
        }
      }

      const attrSpec = el.getAttribute("data-i18n-attr");
      if (attrSpec) {
        // format: attr:key;attr2:key2
        attrSpec
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((pair) => {
            const [attr, aKey] = pair.split(":").map((s) => s.trim());
            if (!attr || !aKey) return;
            const msg = t(aKey);
            if (!msg) return;
            el.setAttribute(attr, msg);
          });
      }
    });
  }

  window.__QSHOT_I18N__ = { t, applyDomI18n, getUiLanguage };
})();

