// ============================================================
// TS Community - Central Branding Configuration
// ------------------------------------------------------------
// Esta é a fonte oficial de personalização da extensão.
// O painel de revendedor pode sobrescrever `window.TS_BRANDING_CONFIG`
// ANTES deste script ou injetar valores em runtime e chamar
// `window.applyBrandingConfig(novoConfig)`.
//
// Campos suportados:
//   extensionName : string  - Nome exibido no chrome (manifest é estático)
//   brandName     : string  - Nome da marca (header / footer / textos)
//   primaryColor  : string  - HEX da cor predominante (ex: "#FF6A00")
//   whatsappLinks : { support, sales, community } - URLs https://wa.me/...
//
// Regras para novas telas:
//   - Nunca usar roxo hardcoded -> usar var(--ts-brand-*)
//   - Nunca hardcodar wa.me -> usar getBrandWhatsappLink('support'|'sales'|'community')
//   - Nunca hardcodar "TS Community" -> usar window.TS_ACTIVE_BRANDING.brandName
//     ou marcar o nó com data-ts-brand="name" para substituição automática.
// ============================================================

(function () {
  if (window.__tsBrandingInstalled) return;
  window.__tsBrandingInstalled = true;

  var DEFAULTS = {
    extensionName: "Superlovable",
    brandName: "Superlovable",
    primaryColor: "#fb4a60",
    whatsappLinks: {
      support: "",
      sales: "",
      community: "https://discord.gg/bcMbAvRk8V"
    }
  };

  // ---------- helpers ----------
  function isValidHexColor(c) {
    return typeof c === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim());
  }
  function normalizeHex(c) {
    c = c.trim();
    if (c.length === 4) {
      c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    }
    return c.toLowerCase();
  }
  function hexToRgb(hex) {
    hex = normalizeHex(hex);
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function adjustHexColor(hex, delta) {
    var rgb = hexToRgb(hex);
    var f = delta / 100;
    function adj(v) {
      if (f < 0) return Math.round(v * (1 + f));
      return Math.round(v + (255 - v) * f);
    }
    var r = clamp(adj(rgb.r), 0, 255).toString(16).padStart(2, "0");
    var g = clamp(adj(rgb.g), 0, 255).toString(16).padStart(2, "0");
    var b = clamp(adj(rgb.b), 0, 255).toString(16).padStart(2, "0");
    return "#" + r + g + b;
  }
  function isValidWaUrl(url) {
    if (typeof url !== "string") return false;
    return /^https:\/\/(wa\.me|chat\.whatsapp\.com)\//i.test(url.trim());
  }

  // ---------- color application ----------
  function applyBrandColor(hexColor) {
    var color = isValidHexColor(hexColor) ? normalizeHex(hexColor) : DEFAULTS.primaryColor;
    var rgb = hexToRgb(color);
    var hover = adjustHexColor(color, -12);
    var rgbStr = rgb.r + ", " + rgb.g + ", " + rgb.b;

    var root = document.documentElement;
    root.style.setProperty("--ts-brand-primary", color);
    root.style.setProperty("--ts-brand-primary-rgb", rgbStr);
    root.style.setProperty("--ts-brand-primary-hover", hover);
    root.style.setProperty("--ts-brand-primary-soft", "rgba(" + rgbStr + ", 0.12)");
    root.style.setProperty("--ts-brand-primary-border", "rgba(" + rgbStr + ", 0.35)");
    root.style.setProperty("--ts-brand-primary-glow", "rgba(" + rgbStr + ", 0.35)");
    root.style.setProperty("--ts-brand-gradient", "linear-gradient(135deg, " + color + ", " + hover + ")");
  }

  // ---------- text application ----------
  // Selectors that hold the brand/extension name and should be overwritten.
  var BRAND_NAME_SELECTORS = [
    ".ql-title", ".ql-brand", ".sp-brand-text",
    "[data-ts-brand=\"name\"]", "[data-ts-brand-name]"
  ];
  var FOOTER_TEXT_SELECTORS = [".ql-badge-mz", ".sp-footer-badge", "[data-ts-brand=\"footer\"]"];

  function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function buildReplaceRegex(value) {
    var prev = window.__tsLastBrandName;
    var parts = ["TS Community", DEFAULTS.brandName];
    if (prev && prev !== value) parts.push(prev);
    // dedupe + escape
    var seen = {};
    var alt = [];
    parts.forEach(function (p) { if (p && !seen[p]) { seen[p] = 1; alt.push(escapeRegex(p)); } });
    return new RegExp(alt.join("|"), "gi");
  }

  function applyBrandTexts(cfg) {
    var rx = buildReplaceRegex(cfg.brandName);
    try {
      if (document.title) {
        var nt = document.title.replace(rx, cfg.brandName);
        if (nt !== document.title) document.title = nt;
      }
    } catch (_) {}

    function setText(el, value) {
      if (!el) return;
      var hasText = false;
      el.childNodes.forEach(function (n) {
        if (n.nodeType === 3) {
          hasText = true;
          var t = n.nodeValue;
          var nv = t.replace(rx, value);
          if (nv !== t) n.nodeValue = nv;
        }
      });
      if (!hasText && !el.children.length) {
        el.textContent = value;
      }
    }

    BRAND_NAME_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        // brand-name nodes: force exact value (single text node)
        var onlyText = el.children.length === 0;
        if (onlyText) {
          el.textContent = cfg.brandName;
        } else {
          setText(el, cfg.brandName);
        }
      });
    });
    FOOTER_TEXT_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.childNodes.forEach(function (n) {
          if (n.nodeType === 3) {
            var nv = n.nodeValue.replace(rx, cfg.brandName);
            if (nv !== n.nodeValue) n.nodeValue = nv;
          }
        });
      });
    });

    window.__tsLastBrandName = cfg.brandName;
  }

  // ---------- link application ----------
  function applyBrandLinks(links) {
    var attrs = { support: "support", sales: "sales", community: "community" };
    Object.keys(attrs).forEach(function (k) {
      var target = links && links[k];
      if (!target) return;
      document.querySelectorAll('[data-ts-wa="' + k + '"]').forEach(function (el) {
        var keepText = el.getAttribute("data-ts-wa-text");
        var url = target;
        if (keepText) url += (url.indexOf("?") === -1 ? "?" : "&") + "text=" + encodeURIComponent(keepText);
        el.setAttribute("href", url);
      });
    });
  }

  // ---------- public API ----------
  function applyBrandingConfig(config) {
    config = config || {};
    var merged = {
      extensionName: config.extensionName || DEFAULTS.extensionName,
      brandName: config.brandName || DEFAULTS.brandName,
      primaryColor: isValidHexColor(config.primaryColor) ? config.primaryColor : DEFAULTS.primaryColor,
      whatsappLinks: {
        support: isValidWaUrl(config.whatsappLinks && config.whatsappLinks.support)
          ? config.whatsappLinks.support : DEFAULTS.whatsappLinks.support,
        sales: isValidWaUrl(config.whatsappLinks && config.whatsappLinks.sales)
          ? config.whatsappLinks.sales : DEFAULTS.whatsappLinks.sales,
        community: isValidWaUrl(config.whatsappLinks && config.whatsappLinks.community)
          ? config.whatsappLinks.community : DEFAULTS.whatsappLinks.community
      }
    };

    window.TS_ACTIVE_BRANDING = merged;

    try { applyBrandColor(merged.primaryColor); } catch (e) { /* defaults via CSS */ }
    try { applyBrandTexts(merged); } catch (_) {}
    try { applyBrandLinks(merged.whatsappLinks); } catch (_) {}
    return merged;
  }

  function getBrandWhatsappLink(type) {
    type = type || "support";
    var b = window.TS_ACTIVE_BRANDING || DEFAULTS;
    return (b.whatsappLinks && b.whatsappLinks[type]) || DEFAULTS.whatsappLinks[type] || DEFAULTS.whatsappLinks.support;
  }

  function tsBrandName() {
    return (window.TS_ACTIVE_BRANDING && window.TS_ACTIVE_BRANDING.brandName) || DEFAULTS.brandName;
  }

  // expose
  window.TS_BRANDING_DEFAULTS = DEFAULTS;
  window.applyBrandingConfig = applyBrandingConfig;
  window.getBrandWhatsappLink = getBrandWhatsappLink;
  window.tsBrandName = tsBrandName;

  // boot: use overrides if any, else defaults
  applyBrandingConfig(window.TS_BRANDING_CONFIG || {});

  // re-apply texts as new UI is injected (templates render after load)
  try {
    var pending = false;
    var obs = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        try {
          applyBrandTexts(window.TS_ACTIVE_BRANDING || DEFAULTS);
          applyBrandLinks((window.TS_ACTIVE_BRANDING || DEFAULTS).whatsappLinks);
        } catch (_) {}
      });
    });
    var startObserver = function () {
      if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startObserver);
    } else {
      startObserver();
    }
  } catch (_) {}
})();
