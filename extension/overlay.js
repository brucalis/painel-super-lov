// ============= Superlovable Overlay =============
// Two layout modes:
//   "sidebar": iframe sidebar fixed on the right of lovable.dev.
//   "popup":   sidebar hidden. A floating round launcher with the extension logo
//              opens a vertical FAB-style menu with main actions + a submenu for
//              quick prompt templates. The user types in Lovable's NATIVE composer;
//              we intercept Enter and route the send through the extension iframe.

(function () {
  if (window.__tsOverlayInjected) return;
  window.__tsOverlayInjected = true;

  // Apenas na janela principal: evita painel/launcher duplicados em iframes
  // e toggles múltiplos (TS_TOGGLE_OVERLAY chega a todos os frames da aba).
  if (window.top !== window) return;

  // Bug fix: só injeta UI (seta, sidebar, launcher, interceptação de Enter)
  // no lovable.dev. Em outros sites (YouTube, Google, etc.) a extensão não
  // deve mostrar nada nem interceptar teclas — apenas captura passiva de token.
  if (!location.hostname.endsWith('lovable.dev')) return;

  if (typeof window.TS_DEBUG === "undefined") window.TS_DEBUG = false;
  const tsDebug = (...args) => { if (window.TS_DEBUG) console.log(...args); };

  const ROOT_ID = "ts-community-overlay-root";
  const IFRAME_ID = "ts-community-overlay-iframe";
  const STYLE_ID = "ts-community-overlay-style";
  const LAUNCHER_ID = "ts-floating-launcher";
  const MENU_ID = "ts-floating-action-menu";
  const SUBMENU_ID = "ts-floating-submenu";
  const NOTIF_PANEL_ID = "ts-notification-panel";
  const COMPOSER_WRAP_CLASS = "ts-native-composer-wrap";
  const TS_SIDEBAR_WIDTH = 380;
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anNhaWFsZWJwc2t3ZnZpbmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjEyOTcsImV4cCI6MjEwMDI5NzI5N30.xRzxMfr92xxRxMwgNG_0iz9J2Rc6SQV3fLgVKItJgrg";
  // Remote notifications feed removed (previous owner's server).

  function getSidepanelUrl() {
    try { return chrome.runtime.getURL("sidepanel.html"); } catch (_) { return null; }
  }
  function getLogoUrl() {
    try { return chrome.runtime.getURL("icons/icon128.png"); } catch (_) { return ""; }
  }

  function injectGlobalStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --ts-sidebar-width: 0px;
        --ts-primary-purple: var(--ts-brand-primary);
        --ts-primary-purple-strong: var(--ts-brand-primary-hover);
        --ts-primary-gradient: var(--ts-brand-gradient);
        --ts-primary-border: rgba(var(--ts-brand-primary-rgb), 0.55);
        --ts-primary-border-soft: rgba(var(--ts-brand-primary-rgb), 0.32);
        --ts-primary-glow: 0 0 0 3px rgba(var(--ts-brand-primary-rgb), 0.18);
        --ts-primary-glow-strong: 0 8px 24px rgba(var(--ts-brand-primary-rgb), 0.35);
      }
      body.ts-sidebar-open {
        padding-right: var(--ts-sidebar-width) !important;
        transition: padding-right 280ms ease !important;
        box-sizing: border-box !important;
      }
      body:not(.ts-sidebar-open) {
        padding-right: 0 !important;
        transition: padding-right 280ms ease !important;
      }
      #${ROOT_ID} {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        width: ${TS_SIDEBAR_WIDTH}px !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        transition: transform 280ms ease !important;
        background: transparent !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: -2px 0 16px rgba(0,0,0,0.18) !important;
        pointer-events: auto !important;
      }
      #${ROOT_ID}.ts-sidebar-collapsed {
        transform: translateX(100%) !important;
        pointer-events: none !important;
      }
      #${ROOT_ID}.ts-popup-mode {
        width: 0 !important;
        height: 0 !important;
        pointer-events: none !important;
        box-shadow: none !important;
        transform: none !important;
        overflow: hidden !important;
      }
      #${ROOT_ID}.ts-popup-mode > #${IFRAME_ID} {
        position: absolute !important;
        left: -10000px !important;
        top: -10000px !important;
        width: 1px !important;
        height: 1px !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      #${IFRAME_ID} {
        width: 100% !important;
        height: 100% !important;
        min-height: 480px !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        background: #ffffff !important;
      }

      /* ===== Floating launcher (popup mode) ===== */
      #${LAUNCHER_ID} {
        position: fixed !important;
        right: 24px !important;
        bottom: 24px !important;
        width: 56px !important;
        height: 56px !important;
        border-radius: 999px !important;
        cursor: grab !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(255, 255, 255, 0.06) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        border: 1px solid var(--ts-primary-border-soft) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18) !important;
        padding: 0 !important;
        transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease !important;
        user-select: none !important;
        touch-action: none !important;
      }
      #${LAUNCHER_ID}:hover {
        transform: scale(1.06) !important;
        border-color: var(--ts-primary-border) !important;
        box-shadow: var(--ts-primary-glow-strong) !important;
      }
      #${LAUNCHER_ID}.ts-launcher-dragging {
        cursor: grabbing !important;
        transition: none !important;
      }
      #${LAUNCHER_ID} img {
        width: 38px !important;
        height: 38px !important;
        object-fit: contain !important;
        pointer-events: none !important;
        border-radius: 8px !important;
        opacity: 1 !important;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35)) !important;
      }
      #${LAUNCHER_ID}.ts-launcher-active {
        background: var(--ts-primary-gradient) !important;
        border-color: var(--ts-primary-purple) !important;
      }
      #${LAUNCHER_ID}.ts-launcher-recording {
        animation: tsLauncherPulse 1.2s infinite !important;
      }
      @keyframes tsLauncherPulse {
        0%,100% { box-shadow: 0 12px 32px rgba(239,68,68,0.45); }
        50%     { box-shadow: 0 12px 32px rgba(239,68,68,0.9); }
      }
      #${LAUNCHER_ID} .ts-launcher-dot {
        position: absolute !important;
        top: 4px !important;
        right: 4px !important;
        min-width: 16px !important;
        height: 16px !important;
        padding: 0 4px !important;
        border-radius: 999px !important;
        background: #ef4444 !important;
        color: #fff !important;
        font: 600 10px/16px system-ui, -apple-system, sans-serif !important;
        text-align: center !important;
        box-shadow: 0 0 0 2px rgba(15,23,42,0.9), 0 2px 6px rgba(239,68,68,0.6) !important;
        pointer-events: none !important;
        display: none !important;
      }
      #${LAUNCHER_ID}.ts-has-unread .ts-launcher-dot {
        display: block !important;
        animation: tsLauncherDotPulse 1.6s infinite !important;
      }
      @keyframes tsLauncherDotPulse {
        0%,100% { transform: scale(1); }
        50%     { transform: scale(1.15); }
      }

      /* ===== Native composer wrap outline (popup mode) — desativado ===== */
      /* Mantemos o estilo padrão da Lovable, sem contorno nem badge. */


      /* ===== FAB-style vertical menu (transparent items) ===== */
      #${MENU_ID}, #${SUBMENU_ID} {
        position: fixed !important;
        z-index: 2147483647 !important;
        flex-direction: column !important;
        gap: 10px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        pointer-events: auto !important;
        opacity: 1 !important;
        visibility: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        border: none !important;
        transition:
          left 260ms cubic-bezier(0.22, 1, 0.36, 1),
          right 260ms cubic-bezier(0.22, 1, 0.36, 1),
          top 260ms cubic-bezier(0.22, 1, 0.36, 1),
          bottom 260ms cubic-bezier(0.22, 1, 0.36, 1),
          transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 220ms ease !important;
      }
      #${MENU_ID}[data-align="right"], #${SUBMENU_ID}[data-align="right"] { align-items: flex-end !important; }
      #${MENU_ID}[data-align="left"],  #${SUBMENU_ID}[data-align="left"]  { align-items: flex-start !important; }
      #${MENU_ID}.ts-floating-menu-open, #${SUBMENU_ID} {
        display: flex !important;
      }
      #${MENU_ID}:not(.ts-floating-menu-open) {
        display: none !important;
      }
      #${MENU_ID} .ts-fab-item, #${SUBMENU_ID} .ts-fab-item {
        display: inline-flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 0 !important;
        background: transparent !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 0 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        box-shadow: none !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: translateY(0) !important;
        animation: tsFabIn 240ms cubic-bezier(0.22, 1, 0.36, 1) both !important;
        pointer-events: auto !important;
        font-family: inherit !important;
        text-align: left !important;
        white-space: nowrap !important;
        transition:
          transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 200ms ease !important;
      }
      #${MENU_ID} .ts-fab-label, #${SUBMENU_ID} .ts-fab-label {
        padding: 6px 10px !important;
        border-radius: 999px !important;
        background: rgba(15, 15, 20, 0.42) !important;
        backdrop-filter: blur(10px) saturate(140%) !important;
        -webkit-backdrop-filter: blur(10px) saturate(140%) !important;
        color: #fff !important;
        text-shadow: 0 1px 4px rgba(0,0,0,0.45) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        line-height: 1.2 !important;
        font-weight: 600 !important;
        letter-spacing: 0.01em !important;
      }
      #${MENU_ID}[data-align="left"] .ts-fab-item,
      #${SUBMENU_ID}[data-align="left"] .ts-fab-item { flex-direction: row !important; }
      #${MENU_ID}[data-align="right"] .ts-fab-item,
      #${SUBMENU_ID}[data-align="right"] .ts-fab-item { flex-direction: row-reverse !important; }
      #${MENU_ID} .ts-fab-item:hover, #${SUBMENU_ID} .ts-fab-item:hover {
        transform: scale(1.04) !important;
      }
      #${MENU_ID} .ts-fab-item:hover .ts-fab-circle,
      #${SUBMENU_ID} .ts-fab-item:hover .ts-fab-circle {
        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.55) !important;
      }
      #${MENU_ID} .ts-fab-circle, #${SUBMENU_ID} .ts-fab-circle {
        width: 38px !important; height: 38px !important;
        border-radius: 999px !important;
        background: var(--ts-primary-gradient) !important;
        color: #fff !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 15px !important;
        flex: 0 0 auto !important;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.45), 0 0 0 1px rgba(255,255,255,0.08) inset !important;
        border: 1px solid rgba(255,255,255,0.15) !important;
        transition: box-shadow 200ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1) !important;
      }
      #${MENU_ID} .ts-fab-circle svg, #${SUBMENU_ID} .ts-fab-circle svg {
        width: 18px !important; height: 18px !important; stroke: #fff !important;
      }
      #${MENU_ID} .ts-fab-item.ts-fab-prompts .ts-fab-circle {
        background: linear-gradient(135deg, #f59e0b, #d97706) !important;
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.45) !important;
      }
      #${MENU_ID} .ts-fab-chevron {
        opacity: 0.85 !important;
        display: inline-flex !important;
        margin: 0 4px !important;
      }
      #${MENU_ID} .ts-fab-chevron svg { width: 14px !important; height: 14px !important; stroke: #fff !important; }
      @keyframes tsFabIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      #${SUBMENU_ID} {
        max-height: 70vh !important;
        overflow-y: auto !important;
        padding: 4px !important;
      }
      #ts-action-toast {
        position: fixed !important;
        z-index: 2147483647 !important;
        padding: 8px 14px !important;
        border-radius: 999px !important;
        background: rgba(20, 20, 25, 0.72) !important;
        backdrop-filter: blur(12px) saturate(150%) !important;
        -webkit-backdrop-filter: blur(12px) saturate(150%) !important;
        color: #fff !important;
        font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        border: 1px solid rgba(255,255,255,0.10) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35) !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transform: translate(-50%, 8px) !important;
        transition: opacity 180ms ease, transform 180ms ease !important;
        max-width: 80vw !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      #ts-action-toast.ts-visible {
        opacity: 1 !important;
        transform: translate(-50%, 0) !important;
      }
      #ts-action-toast.ts-toast-error { border-color: rgba(239,68,68,0.55) !important; color: #fecaca !important; }
      #ts-action-toast.ts-toast-success { border-color: rgba(34,197,94,0.55) !important; color: #bbf7d0 !important; }

      #${MENU_ID} .ts-fab-badge {
        position: absolute !important;
        top: -4px !important;
        right: -4px !important;
        min-width: 17px !important;
        height: 17px !important;
        padding: 0 4px !important;
        border-radius: 999px !important;
        background: #ef4444 !important;
        color: #fff !important;
        font-size: 9px !important;
        font-weight: 800 !important;
        line-height: 17px !important;
        text-align: center !important;
        box-shadow: 0 0 0 2px rgba(15,15,20,0.95) !important;
      }
      #${NOTIF_PANEL_ID} {
        position: fixed !important;
        z-index: 2147483647 !important;
        width: min(340px, calc(100vw - 24px)) !important;
        max-height: min(420px, calc(100vh - 24px)) !important;
        overflow: auto !important;
        background: rgba(17, 17, 19, 0.96) !important;
        color: #f4f4f5 !important;
        border: 1px solid rgba(255,255,255,0.10) !important;
        border-radius: 14px !important;
        box-shadow: 0 18px 50px rgba(0,0,0,0.45) !important;
        backdrop-filter: blur(14px) !important;
        -webkit-backdrop-filter: blur(14px) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }
      #${NOTIF_PANEL_ID} .ts-notif-head { display:flex !important; align-items:center !important; justify-content:space-between !important; padding:12px 14px !important; border-bottom:1px solid rgba(255,255,255,0.08) !important; font-size:13px !important; font-weight:800 !important; }
      #${NOTIF_PANEL_ID} .ts-notif-close { border:0 !important; background:transparent !important; color:#a1a1aa !important; cursor:pointer !important; font-size:15px !important; padding:4px 8px !important; }
      #${NOTIF_PANEL_ID} .ts-notif-list { padding:8px !important; }
      #${NOTIF_PANEL_ID} .ts-notif-empty { margin:0 !important; padding:18px 8px !important; text-align:center !important; color:#a1a1aa !important; font-size:12px !important; }
      #${NOTIF_PANEL_ID} .ts-notif-item { padding:10px 11px !important; border:1px solid rgba(255,255,255,0.08) !important; border-radius:10px !important; background:rgba(255,255,255,0.04) !important; margin-bottom:7px !important; }
      #${NOTIF_PANEL_ID} .ts-notif-title { font-size:12px !important; font-weight:800 !important; color:#fff !important; margin-bottom:4px !important; }
      #${NOTIF_PANEL_ID} .ts-notif-msg { font-size:12px !important; line-height:1.45 !important; color:#d4d4d8 !important; margin-bottom:6px !important; }
      #${NOTIF_PANEL_ID} .ts-notif-link { font-size:11px !important; color:var(--ts-primary-purple) !important; text-decoration:none !important; font-weight:700 !important; }
      #${NOTIF_PANEL_ID} .ts-notif-date { margin-top:5px !important; font-size:10px !important; color:#71717a !important; }

    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function buildOverlay() {
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
    const url = getSidepanelUrl();
    if (!url) return null;
    injectGlobalStyles();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.src = url;
    iframe.setAttribute("allow", "microphone; clipboard-read; clipboard-write");

    root.appendChild(iframe);
    document.body.appendChild(root);
    console.info("[TS Overlay] Sidebar iframe injected at", url);
    return root;
  }

  let currentLayoutMode = "popup"; // "sidebar" | "popup"
  let interceptLocked = false; // 🔒 cadeado: bloqueia interceptação de teclado em qualquer página
  const LVB_ICONS = {
    bug: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    palette: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5"/><circle cx="17.5" cy="10.5" r="0.5"/><circle cx="8.5" cy="7.5" r="0.5"/><circle cx="6.5" cy="12" r="0.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    book: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    zap: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    flask: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6l-5.5 9.5A2 2 0 0 0 5.2 21h13.6a2 2 0 0 0 1.7-3.5L15 8V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>',
    phone: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    pen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    puzzle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877L2.7 15.14a2.402 2.402 0 0 1-.706-1.704c0-.617.235-1.234.706-1.704l1.611-1.611c.23-.23.556-.338.877-.29.493.074.84.504 1.02.968a2.5 2.5 0 1 0 3.237-3.237c-.464-.18-.894-.527-.967-1.02a1.026 1.026 0 0 1 .289-.877l1.568-1.568A2.402 2.402 0 0 1 12.036 2c.617 0 1.234.235 1.704.706l1.611 1.611c.23.23.338.556.29.877-.074.493-.504.84-.968 1.02a2.5 2.5 0 1 0 3.237 3.237c.18-.464.527-.894 1.02-.967.32-.048.647.06.877.29z"/></svg>',
    ambulance: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10H6"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"/><path d="M8 8v4"/><path d="M9 18h6"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
    truck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    film: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
    accessibility: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/></svg>',
    file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    alert: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  };
  // Built-in fallback prompts — used if iframe templates not yet received.
  const DEFAULT_PROMPTS = [
    { label: "Corrigir Bug",        icon: LVB_ICONS.bug, prompt: "Identifique e corrija o bug deste código, explicando a causa raiz e a solução." },
    { label: "Refatorar",           icon: LVB_ICONS.refresh, prompt: "Refatore este código mantendo o comportamento, melhorando legibilidade, modularidade e nomes." },
    { label: "Melhorar UI",         icon: LVB_ICONS.palette, prompt: "Melhore a UI deste componente: hierarquia visual, espaçamento, tipografia e responsividade." },
    { label: "Explicar Código",     icon: LVB_ICONS.book, prompt: "Explique este código passo a passo, incluindo o porquê de cada decisão." },
    { label: "Otimizar",            icon: LVB_ICONS.zap, prompt: "Otimize este código quanto a performance, complexidade e uso de memória." },
    { label: "Segurança",           icon: LVB_ICONS.shield, prompt: "Faça uma revisão de segurança: validação de input, XSS, SQLi, autorização e secrets." },
    { label: "Criar Teste",         icon: LVB_ICONS.flask, prompt: "Crie testes unitários cobrindo casos felizes, erros e edge cases." },
    { label: "Responsividade",      icon: LVB_ICONS.phone, prompt: "Torne este layout totalmente responsivo (mobile, tablet, desktop) sem quebrar a estética." },
    { label: "SEO",                 icon: LVB_ICONS.search, prompt: "Otimize SEO: title, meta description, headings, alt em imagens, schema/JSON-LD e canonical." },
    { label: "Copy & Marketing",    icon: LVB_ICONS.pen, prompt: "Reescreva este conteúdo com tom persuasivo, claro e voltado a conversão." },
    { label: "Cards & Botões",      icon: LVB_ICONS.puzzle, prompt: "Crie variações de cards e botões com estados (hover, active, disabled) consistentes ao design system." },
    { label: "Fix Error",           icon: LVB_ICONS.ambulance, prompt: "Analise este erro e proponha a correção exata, explicando a causa raiz." },
    { label: "Migração",            icon: LVB_ICONS.truck, prompt: "Faça a migração mantendo compatibilidade, com plano passo a passo e rollback." },
    { label: "Transição",           icon: LVB_ICONS.film, prompt: "Adicione transições e animações suaves, respeitando prefers-reduced-motion." },
  ];
  let promptTemplates = DEFAULT_PROMPTS.slice();

  // ===================== Skills source (shared with Sidepanel) =====================
  // Mirrors SP_BUILTIN_SKILLS from sidepanel.js; user skills are read from
  // chrome.storage.local under the same key the sidepanel uses ("sp_user_skills"),
  // so the slash picker, the Skills tab and any autocomplete share one source.
  const BUILTIN_SKILLS = [
    { id: "builtin_accessibility", builtin: true, icon: LVB_ICONS.accessibility, name: "Accessibility Review", description: "Audita acessibilidade (WCAG 2.1 AA)", prefix: "/skill:accessibility" },
    { id: "builtin_redesign",      builtin: true, icon: LVB_ICONS.palette, name: "Redesign",              description: "Refina o design mantendo a funcionalidade", prefix: "/skill:redesign" },
    { id: "builtin_seo_review",    builtin: true, icon: LVB_ICONS.search, name: "SEO Review",            description: "Auditoria técnica e on-page de SEO", prefix: "/skill:seo-review" },
    { id: "builtin_video_creator", builtin: true, icon: LVB_ICONS.film, name: "Video Creator",         description: "Gera vídeos curtos para o projeto", prefix: "/skill:video-creator" },
    { id: "builtin_skill_creator", builtin: true, icon: LVB_ICONS.puzzle, name: "Skill Creator",         description: "Cria uma nova skill reutilizável",
      content: "Me ajude a criar uma nova skill reutilizável para o Lovable. Faça as perguntas necessárias para entender: (1) qual tarefa específica essa skill resolve, (2) quando ela deve ser acionada, (3) qual o output esperado, (4) restrições/convenções do projeto que precisam ser seguidas. Em seguida, gere o prompt final da skill com nome, descrição curta e corpo do prompt pronto para colar." }
  ];
  let userSkillsCache = [];
  function slugifySkill(name) {
    return String(name || "skill").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "skill";
  }
  function normalizeSkill(s) {
    if (!s) return null;
    const name = s.name || s.label || "Skill";
    const prefix = s.prefix || ("/skill:" + slugifySkill(name));
    return {
      id: s.id || prefix,
      label: name,
      icon: s.icon || "✦",
      description: s.description || "",
      prefix: prefix,
      content: s.content || "",
      builtin: !!s.builtin
    };
  }
  function getAvailableSkills() {
    const all = BUILTIN_SKILLS.concat(userSkillsCache || []);
    return all.map(normalizeSkill).filter(Boolean);
  }
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["sp_user_skills"], (r) => {
        userSkillsCache = Array.isArray(r && r.sp_user_skills) ? r.sp_user_skills : [];
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.sp_user_skills) {
          userSkillsCache = Array.isArray(ch.sp_user_skills.newValue) ? ch.sp_user_skills.newValue : [];
          if (slashState && slashState.open) {
            slashState.items = filterSlashItems(slashState.query);
            renderSlashList();
          }
        }
      });
    }
  } catch (_) { /* noop */ }

  function setSidebarCollapsed(collapsed) {
    const sidebar = document.getElementById(ROOT_ID);
    if (sidebar) sidebar.classList.toggle("ts-sidebar-collapsed", Boolean(collapsed));
    if (!document.body) return;
    const isPopup = currentLayoutMode === "popup";
    if (collapsed || isPopup) {
      document.body.classList.remove("ts-sidebar-open");
      document.documentElement.style.setProperty("--ts-sidebar-width", "0px");
    } else {
      document.body.classList.add("ts-sidebar-open");
      document.documentElement.style.setProperty("--ts-sidebar-width", TS_SIDEBAR_WIDTH + "px");
    }
  }

  function applyCollapsedState(collapsed) { setSidebarCollapsed(Boolean(collapsed)); }

  function applyLayoutMode(mode) {
    // Modo popup/chat padrão desativado: a extensão deve enviar sempre pelo painel.
    currentLayoutMode = "popup";
    const root = document.getElementById(ROOT_ID);
    const isPopup = false;
    if (root) root.classList.remove("ts-popup-mode");

    // Não adiciona classe ativa nem marca o composer — mantém o prompt da Lovable padrão.
    if (document.body) document.body.classList.remove("ts-native-chat-active");
    clearComposerWrapMark();
    updateNativeBadge();
    removeLauncher();
    closeMenu();

    removeNativeBadge();
    clearComposerWrapMark();
    clearPopupSelectedSkill();
    try {
      chrome.storage.local.get({ sidebarCollapsed: false }, (r) => {
        setSidebarCollapsed(Boolean(r && r.sidebarCollapsed));
      });
    } catch (_) {
      setSidebarCollapsed(false);
    }
  }

  // ===================== Popup launcher =====================
  const LAUNCHER_SIZE = 56;

  // Try to detect the white preview area on lovable.dev so the launcher and
  // menu never overlap the chat/history/sidepanel. Falls back to viewport.
  function getPreviewBounds() {
    const sels = [
      'iframe[src*="lovableproject.com"]',
      'iframe[src*="lovable.app"]',
      'iframe[title*="preview" i]',
      'iframe[title*="Preview" i]',
      '[data-preview-container]',
      'main iframe',
    ];
    let best = null, bestArea = 0;
    for (const s of sels) {
      document.querySelectorAll(s).forEach((el) => {
        if (el.id === IFRAME_ID) return;
        const r = el.getBoundingClientRect();
        const a = r.width * r.height;
        if (a > bestArea && r.width > 200 && r.height > 200) { best = r; bestArea = a; }
      });
      if (best) break;
    }
    if (best) {
      return { left: best.left, top: best.top, right: best.right, bottom: best.bottom };
    }
    // Fallback — full viewport minus our sidebar.
    const sbW = currentLayoutMode === "sidebar" ? TS_SIDEBAR_WIDTH : 0;
    return { left: 0, top: 0, right: window.innerWidth - sbW, bottom: window.innerHeight };
  }

  function clampLauncherPosition(x, y) {
    const b = getPreviewBounds();
    const pad = 8;
    return {
      x: Math.max(b.left + pad, Math.min(b.right - LAUNCHER_SIZE - pad, x)),
      y: Math.max(b.top + pad, Math.min(b.bottom - LAUNCHER_SIZE - pad, y)),
    };
  }
  function applyLauncherPosition(btn, pos) {
    if (!btn || !pos) return;
    const { x, y } = clampLauncherPosition(pos.x, pos.y);
    btn.style.setProperty("left", x + "px", "important");
    btn.style.setProperty("top", y + "px", "important");
    btn.style.setProperty("right", "auto", "important");
    btn.style.setProperty("bottom", "auto", "important");
  }
  function saveLauncherPosition(pos) {
    try { chrome.storage.local.set({ tsFloatingLauncherPosition: pos }); } catch (_) {}
  }
  function attachLauncherDrag(btn) {
    let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      const rect = btn.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      startX = e.clientX; startY = e.clientY;
      btn.classList.add("ts-launcher-dragging");
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    });
    btn.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      if (moved) {
        applyLauncherPosition(btn, { x: origX + dx, y: origY + dy });
        // Menu/submenu follow drag in real time.
        const m = document.getElementById(MENU_ID);
        if (m) positionMenuRelativeToLauncher(m);
        const s = document.getElementById(SUBMENU_ID);
        if (s) positionSubmenuRelativeToMenu(s);
      }
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;

      btn.classList.remove("ts-launcher-dragging");
      try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) {
        const rect = btn.getBoundingClientRect();
        const pos = clampLauncherPosition(rect.left, rect.top);
        applyLauncherPosition(btn, pos);
        saveLauncherPosition(pos);
        btn.dataset.tsJustDragged = "1";
        setTimeout(() => { delete btn.dataset.tsJustDragged; }, 50);
      }
    };
    btn.addEventListener("pointerup", finish);
    btn.addEventListener("pointercancel", finish);
  }
  function buildLauncher() {
    if (document.getElementById(LAUNCHER_ID)) return;
    const btn = document.createElement("button");
    btn.id = LAUNCHER_ID;
    btn.type = "button";
    btn.title = ((window.tsBrandName && window.tsBrandName()) || "Superlovable") + " — clique para abrir o menu (arraste para mover)";
    const img = document.createElement("img");
    img.src = getLogoUrl();
    img.alt = "TS";
    btn.appendChild(img);
    const dot = document.createElement("span");
    dot.className = "ts-launcher-dot";
    dot.setAttribute("data-ts-launcher-dot", "");
    dot.textContent = "";
    btn.appendChild(dot);
    document.body.appendChild(btn);
    try {
      chrome.storage.local.get({ tsFloatingLauncherPosition: null }, (r) => {
        if (r && r.tsFloatingLauncherPosition) applyLauncherPosition(btn, r.tsFloatingLauncherPosition);
      });
    } catch (_) {}
    attachLauncherDrag(btn);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.tsJustDragged) return;
      toggleMenu();
    });
  }

  function removeLauncher() {
    const b = document.getElementById(LAUNCHER_ID); if (b) b.remove();
    closeMenu();
  }

  // ===================== Native composer detection + wrap =====================
  function findNativeComposer() {
    const candidates = [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="ask"]',
      'textarea[placeholder*="prompt" i]',
      'textarea[placeholder*="message" i]',
      'div[contenteditable="true"][role="textbox"]',
      'form textarea',
      'textarea',
    ];
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.closest && (el.closest(`#${ROOT_ID}`) || el.closest(`#${MENU_ID}`) || el.closest(`#${SUBMENU_ID}`))) continue;
        if (el.offsetParent !== null) return el;
      }
    }
    return null;
  }

  function findNativeComposerWrap() {
    const composer = findNativeComposer();
    if (!composer) return null;
    // Prefer enclosing form; else walk up looking for a container that also holds buttons.
    const form = composer.closest("form");
    if (form) return form;
    let el = composer.parentElement;
    let hops = 0;
    while (el && hops < 6) {
      const hasBtn = el.querySelector("button");
      const rect = el.getBoundingClientRect();
      if (hasBtn && rect.width > 200 && rect.height > 40) return el;
      el = el.parentElement; hops++;
    }
    return composer.parentElement || composer;
  }

  function updateComposerWrapMark() {
    // Nunca marca o composer da Lovable.
    return clearComposerWrapMark();
  }
  function clearComposerWrapMark() {
    document.querySelectorAll("." + COMPOSER_WRAP_CLASS).forEach((el) => el.classList.remove(COMPOSER_WRAP_CLASS));
  }

  function updateNativeBadge() {
    // Badge desativado — mantém o prompt da Lovable com aparência padrão.
    const existing = document.getElementById("ts-native-badge");
    if (existing) existing.remove();
  }

  function removeNativeBadge() {
    const b = document.getElementById("ts-native-badge"); if (b) b.remove();
  }

  // ===================== Selected Skill Badge (popup mode) =====================
  // When the user picks a skill via the slash picker, we don't write the
  // "/skill:..." prefix into the native textarea. Instead we keep the picked
  // skill in memory and render a small badge above the native composer.
  // The prefix is only prepended to the prompt at send time (and the badge is
  // cleared after the send is fired).
  let popupSelectedSkill = null;
  const SKILL_BADGE_ID = "ts-skill-badge";
  const SKILL_BADGE_STYLE_ID = "ts-skill-badge-style";
  // Tracks the textarea we've padded so we can revert padding cleanly
  let _skillPaddedTextarea = null;
  let _skillPaddedOriginal = "";
  function injectSkillBadgeStyles() {
    if (document.getElementById(SKILL_BADGE_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = SKILL_BADGE_STYLE_ID;
    s.textContent = `
      #${SKILL_BADGE_ID} {
        position: fixed; z-index: 2147483645;
        display: inline-flex; align-items: center; gap: 6px;
        padding: 3px 6px 3px 6px; border-radius: 8px;
        background: var(--ts-brand-gradient);
        color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
        font-size: 11px; font-weight: 600; letter-spacing: 0.01em; line-height: 1;
        box-shadow: 0 2px 6px rgba(var(--ts-brand-primary-rgb),.35);
        opacity: 0; transform: translateY(-2px);
        transition: opacity .15s ease, transform .15s ease, left .15s ease, top .15s ease;
        pointer-events: auto; cursor: default; user-select: none;
        max-width: 240px; height: 22px;
      }
      #${SKILL_BADGE_ID}.ts-skill-open { opacity: 1; transform: translateY(0); }
      #${SKILL_BADGE_ID} .ts-skill-badge-icon {
        width: 14px; height: 14px; border-radius: 50%;
        background: rgba(255,255,255,.25);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 9px;
      }
      #${SKILL_BADGE_ID} .ts-skill-badge-name {
        max-width: 170px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #${SKILL_BADGE_ID} .ts-skill-badge-x {
        margin-left: 2px; width: 14px; height: 14px; border-radius: 50%;
        background: rgba(255,255,255,.22); color: #fff; border: none; cursor: pointer;
        font-size: 12px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;
        padding: 0; transition: background .15s ease;
      }
      #${SKILL_BADGE_ID} .ts-skill-badge-x:hover { background: rgba(255,255,255,.4); }
    `;
    document.head.appendChild(s);
  }
  function clearTextareaSkillPadding() {
    if (_skillPaddedTextarea) {
      try { _skillPaddedTextarea.style.paddingTop = _skillPaddedOriginal || ""; } catch (_) {}
      _skillPaddedTextarea = null;
      _skillPaddedOriginal = "";
    }
  }
  function applyTextareaSkillPadding() {
    const composer = findNativeComposer();
    if (!composer) return;
    if (_skillPaddedTextarea !== composer) {
      clearTextareaSkillPadding();
      _skillPaddedTextarea = composer;
      _skillPaddedOriginal = composer.style.paddingTop || "";
    }
    try { composer.style.paddingTop = "32px"; } catch (_) {}
  }
  function renderPopupSkillBadge() {
    let badge = document.getElementById(SKILL_BADGE_ID);
    if (!popupSelectedSkill || currentLayoutMode !== "popup") {
      if (badge) badge.remove();
      clearTextareaSkillPadding();
      return;
    }
    injectSkillBadgeStyles();
    if (!badge) {
      badge = document.createElement("div");
      badge.id = SKILL_BADGE_ID;
      document.body.appendChild(badge);
    }
    const icon = String(popupSelectedSkill.icon || "✦");
    const isSvg = icon.trim().startsWith("<svg");
    const iconHtml = isSvg ? icon : escapeHtml(icon);
    const name = escapeHtml(popupSelectedSkill.label || popupSelectedSkill.name || "Skill");
    badge.innerHTML =
      `<span class="ts-skill-badge-icon">${iconHtml}</span>` +
      `<span class="ts-skill-badge-name">${name}</span>` +
      `<button type="button" class="ts-skill-badge-x" aria-label="Remover skill">×</button>`;
    const x = badge.querySelector(".ts-skill-badge-x");
    if (x) x.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      clearPopupSelectedSkill();
    });
    applyTextareaSkillPadding();
    positionPopupSkillBadge();
    requestAnimationFrame(() => badge.classList.add("ts-skill-open"));
  }
  function positionPopupSkillBadge() {
    const badge = document.getElementById(SKILL_BADGE_ID);
    if (!badge) return;
    const composer = findNativeComposer();
    if (!composer) { badge.remove(); clearTextareaSkillPadding(); return; }
    // Anchor inside the textarea, top-left corner
    const r = composer.getBoundingClientRect();
    const bw = badge.offsetWidth || 140;
    const top = r.top + 6;
    const left = Math.max(8, r.left + 8);
    badge.style.left = Math.min(left, window.innerWidth - bw - 8) + "px";
    badge.style.top = top + "px";
  }
  function setPopupSelectedSkill(skill) {
    popupSelectedSkill = skill || null;
    renderPopupSkillBadge();
  }
  function clearPopupSelectedSkill() {
    popupSelectedSkill = null;
    clearTextareaSkillPadding();
    renderPopupSkillBadge();
  }

  setInterval(() => {
    if (currentLayoutMode !== "popup") return;
    updateComposerWrapMark();
    updateNativeBadge();
    if (popupSelectedSkill) positionPopupSkillBadge();
    if (typeof popupAttachments !== "undefined" && popupAttachments.length) positionPopupAttachments();
    bindNativeButtonHandlers();
    bindNativeDropHandlers();
  }, 800);
  window.addEventListener("scroll", () => {
    if (currentLayoutMode !== "popup") return;
    updateNativeBadge();
    if (popupSelectedSkill) positionPopupSkillBadge();
    if (typeof popupAttachments !== "undefined" && popupAttachments.length) positionPopupAttachments();
  }, true);
  window.addEventListener("resize", () => {
    if (currentLayoutMode !== "popup") return;
    updateNativeBadge();
    if (popupSelectedSkill) positionPopupSkillBadge();
    if (typeof popupAttachments !== "undefined" && popupAttachments.length) positionPopupAttachments();
  });


  // ===================== Popup attachment previews =====================
  const POPUP_ATTACH_ID = "ts-popup-attach-preview";
  const POPUP_ATTACH_STYLE_ID = "ts-popup-attach-style";
  let popupAttachments = []; // [{ id, name, size, type, blobUrl, file }]

  function injectPopupAttachStyles() {
    if (document.getElementById(POPUP_ATTACH_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = POPUP_ATTACH_STYLE_ID;
    s.textContent = `
      #${POPUP_ATTACH_ID} {
        position: fixed; z-index: 2147483645;
        display: flex; flex-wrap: wrap; gap: 6px;
        max-width: 520px; pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
      }
      #${POPUP_ATTACH_ID} .ts-att-item {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 6px 4px 4px; border-radius: 10px;
        background: rgba(59,130,246,0.14);
        border: 1px solid rgba(59,130,246,0.38);
        color: #f4f4f5; font-size: 11px; font-weight: 500;
        max-width: 220px;
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }
      #${POPUP_ATTACH_ID} .ts-att-thumb {
        width: 28px; height: 28px; border-radius: 6px; object-fit: cover;
        background: rgba(255,255,255,0.08);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 12px;
      }
      #${POPUP_ATTACH_ID} .ts-att-name {
        max-width: 130px; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis;
      }
      #${POPUP_ATTACH_ID} .ts-att-x {
        width: 16px; height: 16px; border-radius: 50%;
        background: rgba(255,255,255,0.20); color: #fff; border: none;
        cursor: pointer; font-size: 12px; line-height: 1;
        display: inline-flex; align-items: center; justify-content: center;
        padding: 0; transition: background .15s ease;
      }
      #${POPUP_ATTACH_ID} .ts-att-x:hover { background: rgba(255,255,255,0.4); }
    `;
    document.head.appendChild(s);
  }

  function renderPopupAttachments() {
    let host = document.getElementById(POPUP_ATTACH_ID);
    if (currentLayoutMode !== "popup" || !popupAttachments.length) {
      if (host) host.remove();
      return;
    }
    injectPopupAttachStyles();
    if (!host) {
      host = document.createElement("div");
      host.id = POPUP_ATTACH_ID;
      document.body.appendChild(host);
    }
    host.innerHTML = popupAttachments.map((a) => {
      const isImg = a.type && a.type.indexOf("image/") === 0;
      const thumb = isImg && a.blobUrl
        ? `<img class="ts-att-thumb" src="${a.blobUrl}" alt="">`
        : `<span class="ts-att-thumb">${LVB_ICONS.file}</span>`;
      const name = escapeHtml(a.name);
      let status = "";
      if (a.uploading) status = `<span class="ts-att-status" title="Enviando…">${LVB_ICONS.clock}</span>`;
      else if (a.uploadFailed) status = `<span class="ts-att-status" title="Falha no upload">${LVB_ICONS.alert}</span>`;
      else if (a.ready) status = `<span class="ts-att-status" title="Pronto">${LVB_ICONS.check}</span>`;
      return `<div class="ts-att-item" data-id="${a.id}">${thumb}<span class="ts-att-name" title="${name}">${name}</span>${status}<button type="button" class="ts-att-x" aria-label="Remover anexo" data-id="${a.id}">×</button></div>`;
    }).join("");
    host.querySelectorAll(".ts-att-x").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        removePopupAttachment(btn.getAttribute("data-id"));
      });
    });
    positionPopupAttachments();
  }

  function positionPopupAttachments() {
    const host = document.getElementById(POPUP_ATTACH_ID);
    if (!host) return;
    const composer = findNativeComposerWrap() || findNativeComposer();
    if (!composer) { host.remove(); return; }
    const r = composer.getBoundingClientRect();
    host.style.left = Math.max(8, r.left + 4) + "px";
    const h = host.offsetHeight || 36;
    host.style.top = Math.max(8, r.top - h - 6) + "px";
    host.style.maxWidth = Math.min(r.width, 520) + "px";
  }

  function addPopupAttachments(files) {
    const arr = Array.from(files || []);
    for (const f of arr) {
      if (!f) continue;
      // Avoid duplicate if sidepanel already broadcast this file
      const dup = popupAttachments.find(a => a.name === (f.name || "arquivo") && a.size === (f.size || 0));
      if (dup) continue;
      const id = "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      let blobUrl = null;
      try { if (f.type && f.type.indexOf("image/") === 0) blobUrl = URL.createObjectURL(f); } catch (_) {}
      popupAttachments.push({
        id, name: f.name || "arquivo", size: f.size || 0,
        type: f.type || "", blobUrl, file: f,
        uploading: true, uploadFailed: false, ready: false,
      });
    }
    renderPopupAttachments();
  }

  function syncPopupAttachmentsFromSidepanel(items) {
    const keyOf = (x) => (x.name || "") + "::" + (x.size || 0);
    const incomingKeys = new Set(items.map(keyOf));
    const removed = popupAttachments.filter(a => !incomingKeys.has(keyOf(a)));
    for (const r of removed) { try { if (r.blobUrl) URL.revokeObjectURL(r.blobUrl); } catch(_){} }
    popupAttachments = popupAttachments.filter(a => incomingKeys.has(keyOf(a)));
    for (const it of items) {
      const existing = popupAttachments.find(a => keyOf(a) === keyOf(it));
      if (existing) {
        existing.uploading = !!it.uploading;
        existing.uploadFailed = !!it.uploadFailed;
        existing.ready = !!it.ready;
        existing.upload = it.upload || existing.upload || null;
        if (it.type) existing.type = it.type;
      } else {
        popupAttachments.push({
          id: "att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          name: it.name || "arquivo", size: it.size || 0, type: it.type || "",
          blobUrl: null, file: null,
          uploading: !!it.uploading, uploadFailed: !!it.uploadFailed, ready: !!it.ready,
          upload: it.upload || null,
        });
      }
    }
    // Expose a single source of truth for ready uploads
    try {
      window.TS_PENDING_ATTACHMENTS = popupAttachments
        .filter(a => a.ready && a.upload)
        .map(a => a.upload);
    } catch (_) {}
    renderPopupAttachments();
  }

  window.addEventListener("message", (ev) => {
    const d = ev && ev.data;
    if (!d || d.type !== "TS_OVERLAY_ATTACH_STATE") return;
    syncPopupAttachmentsFromSidepanel(Array.isArray(d.items) ? d.items : []);
  });

  function popupHasPendingUploads() {
    return popupAttachments.some(a => a.uploading);
  }
  function popupHasFailedUploads() {
    return popupAttachments.some(a => a.uploadFailed);
  }
  function popupReadyUploads() {
    return popupAttachments.filter(a => a.ready && a.upload).map(a => a.upload);
  }


  function removePopupAttachment(id) {
    const item = popupAttachments.find((a) => a.id === id);
    if (!item) return;
    popupAttachments = popupAttachments.filter((a) => a.id !== id);
    try { if (item.blobUrl) URL.revokeObjectURL(item.blobUrl); } catch (_) {}
    try {
      postToIframe({ type: "TS_POPUP_ACTION", action: "detach", name: item.name, size: item.size });
    } catch (_) {}
    renderPopupAttachments();
  }
  function clearPopupAttachments() {
    for (const a of popupAttachments) {
      try { if (a.blobUrl) URL.revokeObjectURL(a.blobUrl); } catch (_) {}
    }
    popupAttachments = [];
    renderPopupAttachments();

  }


  // ===================== FAB menu =====================
  let isFloatingMenuOpen = false;

  function closeMenu() {
    isFloatingMenuOpen = false;
    const m = document.getElementById(MENU_ID);
    if (m) { m.classList.remove("ts-floating-menu-open"); m.remove(); }
    closeSubmenu();
    const b = document.getElementById(LAUNCHER_ID);
    if (b) { b.classList.remove("ts-launcher-active"); b.classList.remove("ts-floating-menu-open"); }
    console.log("[TS Popup] Menu open:", isFloatingMenuOpen);
  }
  function closeSubmenu() {
    const s = document.getElementById(SUBMENU_ID); if (s) s.remove();
  }

  function toggleMenu() {
    console.log("[TS Popup] Launcher clicked");
    if (isFloatingMenuOpen || document.getElementById(MENU_ID)) { closeMenu(); return; }
    openMenu();
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function sanitizeUrl(url) {
    try {
      if (!url) return "";
      const parsed = new URL(String(url), window.location.href);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : "";
    } catch (_) { return ""; }
  }

  function bgFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          action: "proxyFetch",
          url,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body || null,
        }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!resp) return reject(new Error("Sem resposta do background"));
          if (!resp.ok) return reject(new Error("Erro " + (resp.status || 0)));
          resolve(resp.data);
        });
      } catch (err) { reject(err); }
    });
  }

  async function fetchNotifications() {
    // Neutralized: remote notifications feed disabled (previous owner's server).
    return [];
  }

  // Lucide icon SVGs (stroke uses currentColor in CSS).
  const LICON = {
    panelRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><path d="M10 8l-3 4 3 4"/></svg>',
    badgeX:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>',
    download:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    sparkles:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
    library:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>',
    bell:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    chevronR:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevronL:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  };

  const LOCK_ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
  const LOCK_ICON_ON  = '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" fill="rgba(239,68,68,.1)"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  function getMainItems() {
    return [
      { action: "sidebar",       icon: LICON.panelRight, label: "Modo Sidebar" },
      { action: "watermark",     icon: LICON.badgeX,     label: "Remover marca d'água" },
      { action: "download",      icon: LICON.download,   label: "Baixar" },
      { action: "optimize",      icon: LICON.sparkles,   label: "Otimizar" },
      { action: "notifications", icon: LICON.bell,       label: "Notificações" },
      { action: "lock",          icon: interceptLocked ? LOCK_ICON_ON : LOCK_ICON_OFF, label: interceptLocked ? "Desbloquear teclado" : "Bloquear teclado", isLock: true },
      { action: "prompts",       icon: LICON.library,    label: "Prompts Prontos", isPrompts: true },
    ];
  }

  // Determine which side of the preview the launcher is on, to align the
  // menu opposite of the closest edge.
  function getMenuAnchor() {
    const launcher = document.getElementById(LAUNCHER_ID);
    const bounds = getPreviewBounds();
    if (!launcher) return { hAlign: "right", vAlign: "up" };
    const r = launcher.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const midX = (bounds.left + bounds.right) / 2;
    const midY = (bounds.top + bounds.bottom) / 2;
    return {
      hAlign: cx >= midX ? "right" : "left", // launcher on right ⇒ items align right
      vAlign: cy >= midY ? "up" : "down",
    };
  }

  function positionMenuRelativeToLauncher(menu) {
    const launcher = document.getElementById(LAUNCHER_ID);
    const bounds = getPreviewBounds();
    const anchor = getMenuAnchor();
    menu.setAttribute("data-align", anchor.hAlign);
    // Reset position props
    ["left","right","top","bottom"].forEach((p) => menu.style.setProperty(p, "auto", "important"));
    if (!launcher) {
      menu.style.setProperty("right", "24px", "important");
      menu.style.setProperty("bottom", "90px", "important");
      return;
    }
    const rect = launcher.getBoundingClientRect();
    const gap = 12;
    if (anchor.hAlign === "right") {
      menu.style.setProperty("right", Math.max(8, window.innerWidth - rect.right) + "px", "important");
    } else {
      menu.style.setProperty("left", Math.max(8, rect.left) + "px", "important");
    }
    if (anchor.vAlign === "up") {
      menu.style.setProperty("bottom", Math.max(8, window.innerHeight - rect.top + gap) + "px", "important");
    } else {
      menu.style.setProperty("top", Math.max(8, rect.bottom + gap) + "px", "important");
    }
    // Constrain inside preview bounds
    menu.style.setProperty("max-width", Math.max(160, bounds.right - bounds.left - 16) + "px", "important");
  }

  function positionSubmenuRelativeToMenu(sub) {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;
    const anchor = getMenuAnchor();
    sub.setAttribute("data-align", anchor.hAlign);
    ["left","right","top","bottom"].forEach((p) => sub.style.setProperty(p, "auto", "important"));
    const mRect = menu.getBoundingClientRect();
    const gap = 10;
    if (anchor.hAlign === "right") {
      // Open to the LEFT of the main menu
      sub.style.setProperty("right", Math.max(8, window.innerWidth - mRect.left + gap) + "px", "important");
    } else {
      // Open to the RIGHT of the main menu
      sub.style.setProperty("left", Math.max(8, mRect.right + gap) + "px", "important");
    }
    sub.style.setProperty("bottom", Math.max(8, window.innerHeight - mRect.bottom) + "px", "important");
  }

  let hoverSubmenuTimer = null;

  function openMenu() {
    const existing = document.getElementById(MENU_ID);
    if (existing) existing.remove();
    closeSubmenu();

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.setAttribute("role", "menu");
    menu.innerHTML = getMainItems().map((it, i) => {
      const chev = it.isPrompts ? `<span class="ts-fab-chevron">${LICON.chevronL}</span>` : "";
      const badge = it.action === "notifications" ? `<span class="ts-fab-badge" data-ts-notif-badge style="display:none">0</span>` : "";
      const extraClass = it.isPrompts ? " ts-fab-prompts" : (it.isLock && interceptLocked ? " ts-fab-lock-active" : "");
      return `<button type="button" class="ts-fab-item${extraClass}" data-action="${it.action}" style="animation-delay:${i * 40}ms">` +
        `<span class="ts-fab-circle">${it.icon}${badge}</span>` +
        `<span class="ts-fab-label">${escapeHtml(it.label)}</span>` +
        chev +
      `</button>`;
    }).join("");
    document.body.appendChild(menu);
    menu.classList.add("ts-floating-menu-open");
    positionMenuRelativeToLauncher(menu);

    isFloatingMenuOpen = true;
    const b = document.getElementById(LAUNCHER_ID);
    if (b) { b.classList.add("ts-launcher-active"); b.classList.add("ts-floating-menu-open"); }

    console.log("[TS Popup] Menu open:", isFloatingMenuOpen);
    checkUnreadNotifications();

    menu.querySelectorAll("[data-action]").forEach((btn) => {
      const action = btn.getAttribute("data-action");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleMenuAction(action);
      });
      if (action === "prompts") {
        btn.addEventListener("mouseenter", () => {
          if (hoverSubmenuTimer) clearTimeout(hoverSubmenuTimer);
          if (!document.getElementById(SUBMENU_ID)) openPromptsSubmenu();
        });
        btn.addEventListener("mouseleave", () => {
          if (hoverSubmenuTimer) clearTimeout(hoverSubmenuTimer);
          hoverSubmenuTimer = setTimeout(() => {
            const sub = document.getElementById(SUBMENU_ID);
            if (sub && !sub.matches(":hover")) closeSubmenu();
          }, 220);
        });
      } else {
        btn.addEventListener("mouseenter", () => { closeSubmenu(); });
      }
    });

    const onDocClick = (ev) => {
      const launcher = document.getElementById(LAUNCHER_ID);
      const sub = document.getElementById(SUBMENU_ID);
      const m = document.getElementById(MENU_ID);
      if (m && m.contains(ev.target)) return;
      if (sub && sub.contains(ev.target)) return;
      if (launcher && launcher.contains(ev.target)) return;
      closeMenu();
      document.removeEventListener("click", onDocClick, true);
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);

    const reposition = () => {
      if (!isFloatingMenuOpen) return;
      positionMenuRelativeToLauncher(menu);
      const s = document.getElementById(SUBMENU_ID);
      if (s) positionSubmenuRelativeToMenu(s);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
  }

  function openPromptsSubmenu() {
    closeSubmenu();
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;
    const sub = document.createElement("div");
    sub.id = SUBMENU_ID;
    const list = (promptTemplates && promptTemplates.length) ? promptTemplates : [];
    sub.innerHTML = list.length
      ? list.map((t, i) =>
          `<button class="ts-fab-item" data-prompt-index="${i}" style="animation-delay:${i * 25}ms" title="${escapeHtml(t.label)}">` +
            `<span class="ts-fab-circle">${(function(ic){ic=String(ic||"✦");return ic.trim().charAt(0)==="<"?ic:escapeHtml(ic);})(t.icon)}</span>` +
            `<span class="ts-fab-label">${escapeHtml(t.label)}</span>` +
          `</button>`
        ).join("")
      : `<div class="ts-fab-item" style="cursor:default;opacity:1">Carregando prompts…</div>`;
    document.body.appendChild(sub);
    positionSubmenuRelativeToMenu(sub);

    sub.addEventListener("mouseenter", () => {
      if (hoverSubmenuTimer) clearTimeout(hoverSubmenuTimer);
    });
    sub.addEventListener("mouseleave", () => {
      if (hoverSubmenuTimer) clearTimeout(hoverSubmenuTimer);
      hoverSubmenuTimer = setTimeout(() => closeSubmenu(), 220);
    });

    sub.querySelectorAll("[data-prompt-index]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-prompt-index"), 10);
        const t = promptTemplates[idx];
        if (!t) return;
        const ok = insertIntoNativeLovableTextarea(t.prompt);
        if (ok) {
          showStatus("Prompt inserido — revise e envie", "success");
        } else {
          showStatus("Composer nativo não encontrado", "error");
        }
        closeSubmenu();
      });
    });
  }

  async function checkUnreadNotifications() {
    try {
      const data = await fetchNotifications();
      if (!Array.isArray(data)) return;
      chrome.storage.local.get(["ql_read_notifs"], (res) => {
        const readIds = (res && res.ql_read_notifs) || [];
        const unread = data.filter((n) => !readIds.includes(n.id)).length;
        document.querySelectorAll("[data-ts-notif-badge]").forEach((badge) => {
          badge.textContent = String(unread);
          badge.style.display = unread > 0 ? "block" : "none";
        });
        const launcher = document.getElementById(LAUNCHER_ID);
        if (launcher) {
          launcher.classList.toggle("ts-has-unread", unread > 0);
          const dot = launcher.querySelector("[data-ts-launcher-dot]");
          if (dot) dot.textContent = unread > 9 ? "9+" : (unread > 0 ? String(unread) : "");
        }
      });
    } catch (_) {}
  }

  function positionNotificationsPanel(panel) {
    const launcher = document.getElementById(LAUNCHER_ID);
    const rect = launcher ? launcher.getBoundingClientRect() : { right: window.innerWidth - 24, top: 24, bottom: 80 };
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    const top = Math.max(12, Math.min(window.innerHeight - 140, rect.top));
    panel.style.setProperty("left", left + "px", "important");
    panel.style.setProperty("top", top + "px", "important");
  }

  async function openNotificationsPanel() {
    let panel = document.getElementById(NOTIF_PANEL_ID);
    if (panel) { panel.remove(); return; }
    panel = document.createElement("div");
    panel.id = NOTIF_PANEL_ID;
    panel.innerHTML = '<div class="ts-notif-head"><span>Notificações</span><button class="ts-notif-close" type="button">${LVB_ICONS.x}</button></div><div class="ts-notif-list"><p class="ts-notif-empty">Carregando...</p></div>';
    document.body.appendChild(panel);
    positionNotificationsPanel(panel);
    panel.querySelector(".ts-notif-close").addEventListener("click", () => panel.remove());

    try {
      const data = await fetchNotifications();
      const list = panel.querySelector(".ts-notif-list");
      if (!Array.isArray(data) || !data.length) { list.innerHTML = '<p class="ts-notif-empty">Nenhuma notificação.</p>'; return; }
      chrome.storage.local.set({ ql_read_notifs: data.map((n) => n.id) });
      document.querySelectorAll("[data-ts-notif-badge]").forEach((badge) => { badge.style.display = "none"; });
      list.innerHTML = data.map((n) => {
        const safeLink = sanitizeUrl(n.link);
        const link = safeLink ? '<a class="ts-notif-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(safeLink) + '">Abrir link →</a>' : '';
        const date = n.created_at ? new Date(n.created_at).toLocaleString("pt-BR") : '';
        return '<div class="ts-notif-item"><div class="ts-notif-title">' + escapeHtml(n.title || 'Notificação') + '</div><div class="ts-notif-msg">' + escapeHtml(n.message || '') + '</div>' + link + '<div class="ts-notif-date">' + escapeHtml(date) + '</div></div>';
      }).join('');
    } catch (_) {
      const list = panel.querySelector(".ts-notif-list");
      if (list) list.innerHTML = '<p class="ts-notif-empty">Erro ao carregar.</p>';
    }
  }


  function handleMenuAction(action) {
    if (action === "sidebar") {
      applyLayoutMode("sidebar");
      try { chrome.storage.local.set({ tsExtensionLayoutMode: "sidebar" }); } catch (_) {}
      closeMenu();
    } else if (action === "watermark") {
      runIframeAction("watermark");
      showStatus("Removendo marca d'água…");
      closeMenu();
    } else if (action === "download") {
      runIframeAction("download");
      showStatus("Baixando arquivos do projeto…");
      closeMenu();
    } else if (action === "optimize") {
      // Optimize text already in native composer
      const composer = findNativeComposer();
      const text = composer ? readComposerText(composer).trim() : "";
      if (!text) {
        showStatus("Digite algo no chat nativo antes de otimizar", "error");
        return;
      }
      runIframeAction("optimize", { prompt: text });
      showStatus("Otimizando prompt do composer nativo…");
      closeMenu();
    } else if (action === "notifications") {
      openNotificationsPanel();
    } else if (action === "lock") {
      interceptLocked = !interceptLocked;
      try { chrome.storage.local.set({ ts_intercept_locked: interceptLocked }); } catch (_) {}
      showStatus(interceptLocked ? "🔒 Teclado bloqueado — extensão pausada" : "🔓 Teclado desbloqueado", interceptLocked ? "error" : "success");
      closeMenu();
    } else if (action === "prompts") {
      if (document.getElementById(SUBMENU_ID)) { closeSubmenu(); return; }
      openPromptsSubmenu();
    }
  }

  let statusTimer = null;
  function showStatus(text, variant) {
    let el = document.getElementById("ts-action-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ts-action-toast";
      document.body.appendChild(el);
    }
    el.textContent = text || "";
    el.classList.remove("ts-toast-error", "ts-toast-success");
    if (variant === "error") el.classList.add("ts-toast-error");
    if (variant === "success") el.classList.add("ts-toast-success");

    // Anchor above the active composer (native or extension)
    let anchorRect = null;
    try {
      const wrap = findNativeComposerWrap();
      if (wrap) anchorRect = wrap.getBoundingClientRect();
    } catch (_) {}
    if (!anchorRect) {
      const composer = findNativeComposer();
      if (composer) anchorRect = composer.getBoundingClientRect();
    }
    let centerX, bottomY;
    if (anchorRect && anchorRect.width > 0) {
      centerX = anchorRect.left + anchorRect.width / 2;
      bottomY = Math.max(8, window.innerHeight - anchorRect.top + 10);
    } else {
      centerX = window.innerWidth / 2;
      bottomY = 24;
    }
    el.style.setProperty("left", centerX + "px", "important");
    el.style.setProperty("right", "auto", "important");
    el.style.setProperty("top", "auto", "important");
    el.style.setProperty("bottom", bottomY + "px", "important");

    // Force reflow then show
    void el.offsetWidth;
    el.classList.add("ts-visible");

    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      try {
        el.classList.remove("ts-visible");
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 220);
      } catch (_) {}
      statusTimer = null;
    }, 2000);
  }

  function postToIframe(msg) {
    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe || !iframe.contentWindow) return false;
    try { iframe.contentWindow.postMessage(msg, "*"); return true; } catch (_) { return false; }
  }
  function runIframeAction(action, extra) {
    postToIframe(Object.assign({ type: "TS_POPUP_ACTION", action }, extra || {}));
  }

  // ===================== Composer read / write =====================
  function readComposerText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }
  function clearComposer(el) {
    if (!el) return;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value") || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(el, "");
      else el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.innerHTML = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  // Reusable insert helper — used by prompt template menu.
  // Does NOT auto-send. If composer is non-empty, append with newline.
  function insertIntoNativeLovableTextarea(text) {
    const input = findNativeComposer();
    if (!input) {
      console.warn("[TS Popup] Native Lovable textarea not found");
      return false;
    }
    input.focus();
    const current = readComposerText(input);
    const next = current && current.trim()
      ? current.replace(/\s+$/, "") + "\n\n" + text
      : text;
    if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value") || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(input, next);
      else input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (input.isContentEditable || input.getAttribute("contenteditable") === "true") {
      input.textContent = next;
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    return true;
  }

  function sendPromptViaIframe(prompt, files) {
    const payload = { type: "TS_POPUP_ACTION", action: "send", prompt };
    if (Array.isArray(files) && files.length) payload.files = files;
    tsDebug("[TS Native Send] pending attachments:", window.TS_PENDING_ATTACHMENTS);
    tsDebug("[TS Native Send] files sent:", payload.files || []);
    const ok = postToIframe(payload);
    if (!ok) showStatus("Painel não pronto. Abra o modo sidebar uma vez.", "error");
    return ok;
  }


  function attachFilesViaIframe(files) {
    showStatus("Enviando " + files.length + " arquivo(s)…");
    postToIframe({ type: "TS_POPUP_ACTION", action: "attach", files });
    try { addPopupAttachments(files); } catch (_) {}
  }

  // ===== Unified popup native send handler =====
  // All paths (Enter on textarea, click on native send button, form submit)
  // must route through this single function. It NEVER falls back to Lovable's
  // own send — that would drop the extension's uploaded files[] from the payload.
  function handlePopupNativeSend() {
    tsDebug("[TS Popup] handlePopupNativeSend entered");
    const composer = findNativeComposer();
    const text = composer ? readComposerText(composer).trim() : "";
    const hasText = text.length > 0;
    const readyFiles = popupReadyUploads();
    const hasFiles = readyFiles.length > 0;
    tsDebug("[TS Popup] message:", text);
    tsDebug("[TS Popup] attachments before send:", popupAttachments);
    tsDebug("[TS Popup] ready files for payload:", readyFiles);

    if (popupHasPendingUploads()) {
      showStatus("Aguarde o upload terminar", "info");
      return false;
    }
    if (popupHasFailedUploads()) {
      showStatus("Remova o anexo com falha antes de enviar.", "error");
      return false;
    }
    if (!hasText && !popupSelectedSkill && !hasFiles) {
      showStatus("Nada para enviar.", "error");
      return false;
    }

    if (composer) clearComposer(composer);
    let finalPrompt = text;
    if (popupSelectedSkill) {
      const pfx = popupSelectedSkill.prefix
        || (popupSelectedSkill.content ? popupSelectedSkill.content : "");
      finalPrompt = text ? (pfx + (pfx.endsWith(":") || pfx.endsWith(" ") ? "" : " ") + text) : pfx;
      clearPopupSelectedSkill();
    }
    // Qualidade: força Lovable a executar o prompt com máxima precisão
    if (finalPrompt && finalPrompt.trim().length > 20) {
      finalPrompt = finalPrompt.trimEnd() + '\n\nIMPORTANTE: Execute TODOS os detalhes desta tarefa com máxima precisão. Não ignore nada, não simplifique, implemente EXATAMENTE o que foi pedido.';
    }
    const ok = sendPromptViaIframe(finalPrompt, readyFiles);
    if (ok === false && hasFiles) {
      showStatus("Envio interceptado falhou. Verifique o console.", "error");
      return false;
    }
    showStatus("Enviando pelo método da extensão…");
    return true;
  }

  // Intercept Enter on the native composer in popup mode.
  document.addEventListener("keydown", (e) => {
    if (currentLayoutMode !== "popup") return;
    if (interceptLocked) return; // 🔒 cadeado ativo — não intercepta teclas
    if (!location.pathname.match(/\/projects\/[0-9a-fA-F-]{36}/i)) return; // só dentro de projetos
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const target = e.target;
    if (!target || !(target.tagName === "TEXTAREA" || (target.getAttribute && target.getAttribute("contenteditable") === "true"))) return;
    if (target.closest && (target.closest(`#${ROOT_ID}`) || target.closest(`#${MENU_ID}`) || target.closest(`#${SUBMENU_ID}`))) return;
    const text = readComposerText(target).trim();
    if (!text && !popupSelectedSkill && !popupReadyUploads().length && !popupAttachments.length) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    handlePopupNativeSend();
  }, true);

  // Intercept form submit in popup mode.
  document.addEventListener("submit", (e) => {
    if (currentLayoutMode !== "popup") return;
    if (interceptLocked) return; // 🔒 cadeado
    if (!location.pathname.match(/\/projects\/[0-9a-fA-F-]{36}/i)) return;
    const form = e.target;
    if (!form || !form.contains) return;
    const composer = findNativeComposer();
    if (!composer || !form.contains(composer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    handlePopupNativeSend();
  }, true);





  // ===================== Native button interception =====================
  function findNativeMicButton() {
    const sels = [
      'button[aria-label*="mic" i]','button[aria-label*="voz" i]','button[aria-label*="voice" i]',
      'button[aria-label*="dicta" i]','button[aria-label*="speech" i]',
      'button[title*="mic" i]','button[title*="voz" i]',
    ];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        if (el.closest && el.closest(`#${ROOT_ID}`)) continue;
        if (el.offsetParent !== null) return el;
      }
    }
    return null;
  }
  function findNativeAttachButton() {
    // NOTE: we intentionally do NOT match the "+" / "Add" / "Plus" button anymore.
    // In the current Lovable UI, "+" opens a menu (Settings, History, …, Attach).
    // We let that menu open natively and intercept the "Attach" menu item instead
    // (see installNativeAttachMenuInterceptor). Only buttons whose label is
    // unambiguously about attaching files are bound here, for older UI variants.
    const sels = [
      'button[aria-label*="attach" i]','button[aria-label*="anexar" i]',
      'button[aria-label*="upload" i]','button[aria-label*="file" i]',
      'button[aria-label*="image" i]','button[aria-label*="imagem" i]',
      'button[title*="attach" i]','button[title*="anexar" i]',
      'button[title*="upload" i]','button[title*="image" i]',
      'label[for] input[type="file"]',
    ];
    for (const s of sels) {
      for (const raw of document.querySelectorAll(s)) {
        const el = raw.tagName === "INPUT" ? raw.closest("label") || raw : raw;
        if (!el) continue;
        if (el.closest && el.closest(`#${ROOT_ID}`)) continue;
        if (el.offsetParent !== null) return el;
      }
    }
    return null;
  }

  function findNativeSendButton() {
    const sels = [
      'button[aria-label*="send" i]','button[aria-label*="enviar" i]','button[aria-label*="submit" i]',
      'button[title*="send" i]','button[title*="enviar" i]','button[title*="submit" i]',
      'button[type="submit"]',
      'form button[type="submit"]',
    ];
    for (const s of sels) {
      for (const el of document.querySelectorAll(s)) {
        if (el.closest && el.closest(`#${ROOT_ID}`)) continue;
        if (el.offsetParent === null) continue;
        return el;
      }
    }
    // Heuristic: find icon-only button inside composer wrap with arrow/send svg.
    try {
      const wrap = findNativeComposerWrap();
      if (wrap) {
        const btns = wrap.querySelectorAll('button');
        for (const b of btns) {
          if (b.closest && b.closest(`#${ROOT_ID}`)) continue;
          if (b.offsetParent === null) continue;
          const txt = (b.innerText || b.textContent || "").trim();
          if (/^(➜|↑|→|send|enviar)$/i.test(txt)) return b;
          if (!txt) {
            const svg = b.querySelector('svg');
            if (svg) {
              const html = svg.outerHTML || "";
              if (/arrow-up|send|paper-plane|M12 19V5|M5 12l7-7|m5 12 7-7/i.test(html)) return b;
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }


  function isPopupNativeModeActive() {
    return false;
  }

  // Direct-bound interceptors (capture-phase) on the actual native buttons,
  // re-applied whenever DOM changes. This wins over Lovable's own handlers,
  // which sometimes open the file picker on pointerdown/mousedown.
  const TS_BOUND_FLAG = "__tsNativeBound";
  function bindNativeButtonHandlers() {
    if (!isPopupNativeModeActive()) return;
    const attach = findNativeAttachButton();
    if (attach && !attach[TS_BOUND_FLAG]) {
      attach[TS_BOUND_FLAG] = true;
      const swallow = (ev) => {
        if (!isPopupNativeModeActive()) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        if (ev.type === "click") triggerPopupAttach();
      };
      ["pointerdown","mousedown","click","keydown"].forEach((t) => {
        attach.addEventListener(t, (ev) => {
          if (t === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
          swallow(ev);
        }, true);
      });
      // Also block any nested <input type=file> from being clicked by Lovable.
      attach.querySelectorAll('input[type="file"]').forEach((inp) => {
        if (inp[TS_BOUND_FLAG]) return;
        inp[TS_BOUND_FLAG] = true;
        inp.addEventListener("click", (ev) => {
          if (!isPopupNativeModeActive()) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          triggerPopupAttach();
        }, true);
      });
    }
    const mic = findNativeMicButton();
    if (mic && !mic[TS_BOUND_FLAG]) {
      mic[TS_BOUND_FLAG] = true;
      ["pointerdown","mousedown","click"].forEach((t) => {
        mic.addEventListener(t, (ev) => {
          if (!isPopupNativeModeActive()) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          if (t === "click") togglePopupVoice();
        }, true);
      });
    }
    const send = findNativeSendButton();
    if (send && !send[TS_BOUND_FLAG]) {
      send[TS_BOUND_FLAG] = true;
      ["pointerdown","mousedown","click","keydown"].forEach((t) => {
        send.addEventListener(t, (ev) => {
          if (!isPopupNativeModeActive()) return;
          if (t === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          if (t === "click" || t === "keydown") handlePopupNativeSend();
        }, true);
      });
    }
  }


  let nativeInterceptorInstalled = false;
  function installNativeButtonInterceptors() {
    if (!nativeInterceptorInstalled) {
      nativeInterceptorInstalled = true;
      // Global capture-phase fallback for cases where direct binding misses
      // a re-rendered button (covers click/pointerdown/mousedown).
      ["pointerdown","mousedown","click"].forEach((t) => {
        document.addEventListener(t, (e) => {
          if (!isPopupNativeModeActive()) return;
          const target = e.target;
          if (!target || !target.closest) return;
          if (target.closest(`#${ROOT_ID}`) || target.closest(`#${MENU_ID}`) ||
              target.closest(`#${SUBMENU_ID}`) || target.closest(`#${LAUNCHER_ID}`)) return;
          const btn = target.closest("button, label");
          if (!btn) return;
          const mic = findNativeMicButton();
          const attach = findNativeAttachButton();
          const send = findNativeSendButton();
          if (mic && (btn === mic || mic.contains(btn))) {
            e.preventDefault(); e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (t === "click") togglePopupVoice();
            return;
          }
          if (attach && (btn === attach || attach.contains(btn))) {
            e.preventDefault(); e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (t === "click") triggerPopupAttach();
            return;
          }
          if (send && (btn === send || send.contains(btn) || btn.contains(send))) {
            e.preventDefault(); e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            if (t === "click") handlePopupNativeSend();
            return;
          }

        }, true);
      });
    }
    bindNativeButtonHandlers();
    bindNativeDropHandlers();
    installNativeAttachMenuInterceptor();
  }

  function triggerPopupAttach() { openTsExtensionFilePicker(); }

  // ===== Native "Attach" menu item interception (popup mode) =====
  // Lovable's "+" composer button opens a menu (Settings, History, Knowledge,
  // GitHub, Connectors, Take a screenshot, Add reference, Add skill, Attach…).
  // We let the menu open natively but hijack the "Attach" entry so the file
  // picker / upload flow runs through the extension instead of Lovable's.
  function closeNativeLovableMenuIfOpen() {
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup",   { key: "Escape", bubbles: true }));
    } catch (_) {}
  }

  function isNativeAttachMenuItem(el) {
    if (!el || !el.closest) return false;
    if (el.closest(`#${ROOT_ID}`) || el.closest(`#${MENU_ID}`) ||
        el.closest(`#${SUBMENU_ID}`) || el.closest(`#${LAUNCHER_ID}`)) return false;
    const item = el.closest('[role="menuitem"], [role="option"], [cmdk-item], [data-radix-collection-item], li, button, div');
    if (!item) return false;
    // Must look like a menu entry — i.e. live inside a popover/menu/listbox/cmdk container.
    const inMenu = item.closest(
      '[role="menu"], [role="listbox"], [role="dialog"], [data-radix-popper-content-wrapper], [cmdk-root], [cmdk-list], [data-state="open"]'
    );
    if (!inMenu) return false;
    const txt = (item.innerText || item.textContent || "").trim().toLowerCase();
    if (!txt) return false;
    // Exact "attach" / "anexar" or short label starting with it. Avoid matching
    // long sentences like "attach a file to your message" inside tooltips.
    if (txt === "attach" || txt === "anexar") return true;
    if (txt.length <= 32 && (/^attach\b/.test(txt) || /^anexar\b/.test(txt))) return true;
    return false;
  }

  let nativeAttachMenuInterceptorInstalled = false;
  function installNativeAttachMenuInterceptor() {
    if (nativeAttachMenuInterceptorInstalled) return;
    nativeAttachMenuInterceptorInstalled = true;
    const handler = (ev) => {
      if (!isPopupNativeModeActive()) return;
      if (ev.type === "keydown" && ev.key !== "Enter" && ev.key !== " ") return;
      if (!isNativeAttachMenuItem(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      if (ev.type === "click" || ev.type === "keydown") {
        tsDebug("[TS Popup] Native Attach intercepted");
        closeNativeLovableMenuIfOpen();
        // Defer so the menu has a tick to unmount before the picker opens.
        setTimeout(() => { try { openTsExtensionFilePicker(); } catch (_) {} }, 0);
      }
    };
    ["pointerdown","mousedown","click","keydown"].forEach((t) => {
      document.addEventListener(t, handler, true);
    });
  }


  // ===== Native drag-and-drop interception (popup mode) =====
  const ACCEPTED_DROP_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  let __tsDropOverlayEl = null;
  let __tsGlobalDropBound = false;
  let __tsDragHideStyleInjected = false;

  function injectDragHideStyles() {
    if (__tsDragHideStyleInjected) return;
    __tsDragHideStyleInjected = true;
    const s = document.createElement("style");
    s.id = "ts-drag-hide-style";
    s.textContent = `
      html.ts-dragging-files [class*="dropzone" i],
      html.ts-dragging-files [class*="DropZone" i],
      html.ts-dragging-files [data-dropzone],
      html.ts-dragging-files [class*="drop-overlay" i],
      html.ts-dragging-files [class*="DropOverlay" i],
      html.ts-dragging-files [class*="file-drop" i] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function hideLovableDropOverlays() {
    try {
      document.documentElement.classList.add("ts-dragging-files");
      // Hide any element whose visible text matches Lovable's drop overlay copy.
      const candidates = document.querySelectorAll("body *");
      const re = /(drop any files here|add files|add them to message)/i;
      for (const el of candidates) {
        if (el.id === "ts-drop-overlay") continue;
        if (el.closest("#" + ROOT_ID)) continue;
        const txt = (el.textContent || "").trim();
        if (txt.length > 0 && txt.length < 200 && re.test(txt)) {
          el.classList.add("ts-hide-lovable-drop-overlay");
          el.style.setProperty("display", "none", "important");
        }
      }
    } catch (_) {}
  }
  function unhideLovableDropOverlays() {
    try {
      document.documentElement.classList.remove("ts-dragging-files");
      document.querySelectorAll(".ts-hide-lovable-drop-overlay").forEach((el) => {
        el.classList.remove("ts-hide-lovable-drop-overlay");
        el.style.removeProperty("display");
      });
    } catch (_) {}
  }

  function ensureTsDropOverlay() {
    if (__tsDropOverlayEl && document.body.contains(__tsDropOverlayEl)) return __tsDropOverlayEl;
    const el = document.createElement("div");
    el.id = "ts-drop-overlay";
    el.style.cssText = [
      "position:fixed",
      "z-index:2147483646",
      "pointer-events:none",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "border:2px dashed rgba(59,130,246,0.9)",
      "background:rgba(59,130,246,0.10)",
      "backdrop-filter:blur(2px)",
      "color:#fff",
      "font:600 14px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      "border-radius:14px",
      "box-shadow:0 8px 32px rgba(59,130,246,0.35)",
    ].join(";");
    el.innerHTML = `<div style="background:rgba(20,20,28,0.85);padding:10px 16px;border-radius:10px;border:1px solid rgba(59,130,246,0.6);display:flex;align-items:center;gap:6px"><span style="display:inline-flex">${LVB_ICONS.download}</span> Solte para anexar imagem</div>`;
    document.body.appendChild(el);
    __tsDropOverlayEl = el;
    return el;
  }
  function showTsDropOverlay() {
    const el = ensureTsDropOverlay();
    const composer = findNativeComposerWrap() || findNativeComposer();
    if (composer) {
      const r = composer.getBoundingClientRect();
      const pad = 8;
      el.style.left = Math.max(8, r.left - pad) + "px";
      el.style.top = Math.max(8, r.top - pad) + "px";
      el.style.width = (r.width + pad * 2) + "px";
      el.style.height = (r.height + pad * 2) + "px";
    } else {
      el.style.left = "16px";
      el.style.top = "16px";
      el.style.width = (window.innerWidth - 32) + "px";
      el.style.height = (window.innerHeight - 32) + "px";
    }
    el.style.display = "flex";
    hideLovableDropOverlays();
  }
  function hideTsDropOverlay() {
    if (__tsDropOverlayEl) __tsDropOverlayEl.style.display = "none";
    unhideLovableDropOverlays();
  }

  let __tsDragLeaveTimer = null;
  function scheduleHideDropOverlay() {
    if (__tsDragLeaveTimer) clearTimeout(__tsDragLeaveTimer);
    __tsDragLeaveTimer = setTimeout(() => { hideTsDropOverlay(); }, 80);
  }
  function cancelHideDropOverlay() {
    if (__tsDragLeaveTimer) { clearTimeout(__tsDragLeaveTimer); __tsDragLeaveTimer = null; }
  }

  function eventHasFiles(ev) {
    try {
      const dt = ev.dataTransfer;
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return types.includes("Files") || types.includes("application/x-moz-file");
    } catch (_) { return false; }
  }

  function handleTsNativeDragDrop(ev) {
    if (!isPopupNativeModeActive()) return;
    if (!eventHasFiles(ev)) return;

    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();

    if (ev.type === "dragenter" || ev.type === "dragover") {
      try { if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy"; } catch (_) {}
      cancelHideDropOverlay();
      showTsDropOverlay();
      return false;
    }
    if (ev.type === "dragleave") {
      scheduleHideDropOverlay();
      return false;
    }
    if (ev.type === "drop") {
      hideTsDropOverlay();
      const files = Array.from((ev.dataTransfer && ev.dataTransfer.files) || []);
      const images = files.filter((f) => f && typeof f.type === "string" &&
        (ACCEPTED_DROP_TYPES.includes(f.type.toLowerCase()) || f.type.toLowerCase().startsWith("image/")));
      if (!images.length) {
        if (files.length) showStatus("Envie apenas imagens (png/jpeg/webp).", "error");
        return false;
      }
      try { attachFilesViaIframe(images); } catch (e) {}
      showStatus("Imagem anexada");
      return false;
    }
  }

  function bindNativeDropHandlers() {
    if (__tsGlobalDropBound) return;
    __tsGlobalDropBound = true;
    injectDragHideStyles();
    const types = ["dragenter", "dragover", "dragleave", "drop"];
    const targets = [window, document, document.body].filter(Boolean);
    types.forEach((type) => {
      targets.forEach((t) => {
        try { t.addEventListener(type, handleTsNativeDragDrop, true); } catch (_) {}
      });
    });
    // End-of-drag cleanup safety net.
    window.addEventListener("dragend", () => { hideTsDropOverlay(); }, true);
  }


  function openTsExtensionFilePicker() {
    let fi = document.getElementById("ts-popup-file-input-global");
    if (!fi) {
      fi = document.createElement("input");
      fi.type = "file";
      fi.id = "ts-popup-file-input-global";
      fi.multiple = true;
      fi.accept = "image/*";
      fi.style.display = "none";
      document.body.appendChild(fi);
      fi.addEventListener("change", () => {
        const files = Array.from(fi.files || []);
        fi.value = "";
        if (files.length) attachFilesViaIframe(files);
      });
    }
    fi.click();
  }

  // ===================== Init =====================
  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init, { once: true });
      return;
    }
    injectGlobalStyles();
    buildOverlay();
    try {
      chrome.storage.local.get({ sidebarCollapsed: false, tsExtensionLayoutMode: "sidebar", ts_intercept_locked: false }, (r) => {
        applyLayoutMode((r && r.tsExtensionLayoutMode) || "sidebar");
        applyCollapsedState(Boolean(r && r.sidebarCollapsed));
        interceptLocked = Boolean(r && r.ts_intercept_locked);
      });
    } catch (_) {
      applyLayoutMode("sidebar");
      applyCollapsedState(false);
    }
  }

  // Replace Lovable's "LOV 3" / "LOV3" / "Lov3.0" header label on chat
  // message cards generated by the extension (Synthetic Fix Error intent)
  // with the Superlovable sender identity. We only touch leaf text nodes so
  // we never break Lovable's interactive controls.
  function getTsHeaderLabel() {
    return "Enviado por Superlovable";
  }
  const TS_HEADER_LABEL_RE = /^\s*(?:lov\s*\d+(?:\.\d+)?|fix(?:\s+build)?\s*error|sec(?:u|ur)?rty\s*scan|security\s*scan|security\s*review|verifica(?:\u00e7|c)(?:\u00e3|a)o\s*de\s*seguran(?:\u00e7|c)a|revis(?:\u00e3|a)o\s*de\s*seguran(?:\u00e7|c)a|an(?:\u00e1|a)lise\s*de\s*seguran(?:\u00e7|c)a|try\s*to\s*fix\s*seo[^\n]*|fix\s*seo\s*issue[^\n]*|seo\s*issue\s*:[^\n]*|meta\s*[-\s]?description|meta\s*descri(?:\u00e7|c)(?:\u00e3|a)o|corrigir\s*(?:problema\s*de\s*)?seo[^\n]*|edi(?:\u00e7|c)(?:\u00e3|a)o\s*visual|visual\s*edit|enviado\s*por\s*[\u26A1\u2728\u{1F4AC}\u{1F680}\s]*.+)\s*$/iu;
  function relabelLovHeaders(root) {
    try {
      const label = getTsHeaderLabel();
      const scope = (root && root.querySelectorAll) ? root : document.body;
      if (!scope) return;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !TS_HEADER_LABEL_RE.test(node.nodeValue)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const hits = [];
      let n;
      while ((n = walker.nextNode())) hits.push(n);
      for (const node of hits) {
        if (node.nodeValue !== label) node.nodeValue = label;
      }
    } catch (_) {}
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(STYLE_ID)) injectGlobalStyles();
    if (!document.getElementById(ROOT_ID)) {
      buildOverlay();
      try {
        chrome.storage.local.get({ sidebarCollapsed: false, tsExtensionLayoutMode: "sidebar" }, (r) => {
          applyLayoutMode((r && r.tsExtensionLayoutMode) || "sidebar");
          applyCollapsedState(Boolean(r && r.sidebarCollapsed));
        });
      } catch (_) {}
    }
    if (currentLayoutMode === "popup") {
      if (!document.getElementById(LAUNCHER_ID)) buildLauncher();
      updateComposerWrapMark();
      bindNativeButtonHandlers();
      bindNativeDropHandlers();
    }
    relabelLovHeaders(document.body);
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  try { relabelLovHeaders(document.body); } catch (_) {}

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.tsExtensionLayoutMode) applyLayoutMode(changes.tsExtensionLayoutMode.newValue || "sidebar");
      if (changes.sidebarCollapsed) applyCollapsedState(Boolean(changes.sidebarCollapsed.newValue));
      if (changes.ts_intercept_locked !== undefined) interceptLocked = Boolean(changes.ts_intercept_locked.newValue);
    });
  } catch (_) {}

  // ===================== Notifications polling =====================
  try {
    setTimeout(() => { checkUnreadNotifications(); }, 1500);
    setInterval(() => { checkUnreadNotifications(); }, 30000);
  } catch (_) {}


  // ===================== Voice (popup native sink) =====================
  let recognition = null;
  let isRecording = false;
  let voiceSink = "iframe";
  let nativeVoiceBaseText = "";
  let nativeVoiceBuffer = "";

  function emitVoice(msg) {
    if (voiceSink === "native") {
      const composer = findNativeComposer();
      if (msg.type === "TS_VOICE_TRANSCRIPT" && composer) {
        nativeVoiceBuffer = msg.transcript || "";
        const baseText = nativeVoiceBaseText;
        const setter = composer.tagName === "TEXTAREA"
          ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")
          : null;
        const newVal = baseText + (baseText && nativeVoiceBuffer ? " " : "") + nativeVoiceBuffer;
        if (setter && setter.set) setter.set.call(composer, newVal);
        else if (composer.tagName === "TEXTAREA") composer.value = newVal;
        else composer.innerText = newVal;
        composer.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (msg.type === "TS_VOICE_STATUS") {
        const launcher = document.getElementById(LAUNCHER_ID);
        if (launcher) launcher.classList.toggle("ts-launcher-recording", Boolean(msg.listening));
        showStatus(msg.listening ? "Ouvindo… (clique novamente para parar)" : "Ditado finalizado");
      } else if (msg.type === "TS_VOICE_ERROR") {
        showStatus("" + (msg.message || msg.error || "Erro no microfone"), "error");
        const launcher = document.getElementById(LAUNCHER_ID);
        if (launcher) launcher.classList.remove("ts-launcher-recording");
      }
      return;
    }
    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe || !iframe.contentWindow) return;
    try { iframe.contentWindow.postMessage(msg, "*"); } catch (_) {}
  }

  function togglePopupVoice() {
    if (isRecording) { stopRecognition(); return; }
    const composer = findNativeComposer();
    if (!composer) { showStatus("Composer nativo não encontrado.", "error"); return; }
    nativeVoiceBaseText = readComposerText(composer);
    nativeVoiceBuffer = "";
    voiceSink = "native";
    startRecognition();
  }
  function stopRecognition() {
    if (recognition) { try { recognition.stop(); } catch (_) {} }
  }
  async function startRecognition() {
    if (isRecording) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      emitVoice({ type: "TS_VOICE_ERROR", error: "unsupported", message: "Reconhecimento de voz não suportado." });
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      emitVoice({ type: "TS_VOICE_ERROR", error: "no-mediadevices", message: "getUserMedia indisponível." });
      return;
    }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) {
      emitVoice({ type: "TS_VOICE_ERROR", error: (err && err.name) || "unknown", message: (err && err.message) || "Falha ao acessar microfone." });
      return;
    }
    try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try {
      const rec = new Ctor();
      rec.lang = "pt-BR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let finalBuffer = "";
      rec.onstart = function () { isRecording = true; finalBuffer = ""; emitVoice({ type: "TS_VOICE_STATUS", listening: true }); };
      rec.onresult = function (event) {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) finalBuffer += (finalBuffer ? " " : "") + r[0].transcript;
          else interim += r[0].transcript;
        }
        emitVoice({ type: "TS_VOICE_TRANSCRIPT", transcript: (finalBuffer + " " + interim).trim() });
      };
      rec.onerror = function (event) { emitVoice({ type: "TS_VOICE_ERROR", error: event.error || "unknown", message: String(event.error || "") }); };
      rec.onend = function () { isRecording = false; recognition = null; emitVoice({ type: "TS_VOICE_STATUS", listening: false }); };
      recognition = rec;
      rec.start();
    } catch (err) {
      isRecording = false; recognition = null;
      emitVoice({ type: "TS_VOICE_ERROR", error: (err && err.name) || "start-failed", message: (err && err.message) || "" });
    }
  }

  // ===================== postMessage handlers =====================
  window.addEventListener("message", (event) => {
    const data = event && event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "TS_VOICE_START") { voiceSink = "iframe"; startRecognition(); }
    else if (data.type === "TS_VOICE_STOP") { stopRecognition(); }
    else if (data.type === "TS_OVERLAY_SET_COLLAPSED") {
      applyCollapsedState(Boolean(data.collapsed));
      try { chrome.storage.local.set({ sidebarCollapsed: Boolean(data.collapsed) }); } catch (_) {}
    } else if (data.type === "TS_OVERLAY_SET_LAYOUT") {
      const mode = (data.mode === "popup" || data.mode === "floating") ? "popup" : "sidebar";
      applyLayoutMode(mode);
      try { chrome.storage.local.set({ tsExtensionLayoutMode: mode }); } catch (_) {}
    } else if (data.type === "TS_OVERLAY_TEMPLATES") {
      if (Array.isArray(data.templates)) {
        promptTemplates = data.templates.slice(0, 24);
        if (document.getElementById(SUBMENU_ID)) openPromptsSubmenu();
      }
    } else if (data.type === "TS_POPUP_RESULT") {
      showStatus(data.message || (data.ok ? "Concluído" : "Falha"), data.ok ? "success" : "error");
    }
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "TS_TOGGLE_OVERLAY") {
        chrome.storage.local.get({ sidebarCollapsed: false }, (r) => {
          const next = !Boolean(r && r.sidebarCollapsed);
          chrome.storage.local.set({ sidebarCollapsed: next });
          applyCollapsedState(next);
        });
      }
    });
  } catch (_) {}

  // ===================== Slash Skills Picker (popup mode) =====================
  // Intercept "/" typed in the native Lovable composer (popup mode only),
  // suppress Lovable's native command menu, and render the extension's own
  // prompt picker anchored above the composer.
  const SLASH_ID = "ts-slash-skills";
  const SLASH_STYLE_ID = "ts-slash-skills-style";
  const SLASH_BODY_CLASS = "ts-slash-skills-active";
  let slashState = { open: false, query: "", items: [], index: 0, target: null };

  function injectSlashStyles() {
    if (document.getElementById(SLASH_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = SLASH_STYLE_ID;
    s.textContent = `
      body.${SLASH_BODY_CLASS} [role="listbox"]:not(#${SLASH_ID} *):not(#${SLASH_ID}),
      body.${SLASH_BODY_CLASS} [data-radix-popper-content-wrapper]:not(#${SLASH_ID} *),
      body.${SLASH_BODY_CLASS} [data-command]:not(#${SLASH_ID} *),
      body.${SLASH_BODY_CLASS} [data-radix-collection-item]:not(#${SLASH_ID} *),
      body.${SLASH_BODY_CLASS} [cmdk-root]:not(#${SLASH_ID} *),
      body.${SLASH_BODY_CLASS} [cmdk-list]:not(#${SLASH_ID} *),
      body.${SLASH_BODY_CLASS} [cmdk-item]:not(#${SLASH_ID} *) {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .ts-slash-skills-textarea-active {
        box-shadow:
          0 0 0 1px rgba(var(--ts-brand-primary-rgb), 0.55),
          0 0 18px rgba(var(--ts-brand-primary-rgb), 0.22) !important;
        border-radius: 12px !important;
        transition: box-shadow .18s ease !important;
      }
      #${SLASH_ID} {
        position: fixed;
        z-index: 2147483646;
        min-width: 320px;
        max-width: 460px;
        max-height: 340px;
        overflow: hidden;
        background: rgba(18, 18, 24, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(var(--ts-brand-primary-rgb), 0.45);
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(0,0,0,.45), 0 0 0 1px rgba(59,130,246,.25);
        color: #f5f5f7;
        font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
        font-size: 13px;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity .14s ease, transform .14s ease;
        display: flex;
        flex-direction: column;
      }
      #${SLASH_ID}.ts-slash-open { opacity: 1; transform: translateY(0); }
      #${SLASH_ID} .ts-slash-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,.06);
      }
      #${SLASH_ID} .ts-slash-title {
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
        color: rgba(255,255,255,.65);
      }
      #${SLASH_ID} .ts-slash-badge {
        background: var(--ts-brand-gradient);
        color: #fff; padding: 2px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 600; letter-spacing: .05em;
      }
      #${SLASH_ID} .ts-slash-hint { font-size: 10px; color: rgba(255,255,255,.4); }
      #${SLASH_ID} .ts-slash-list {
        list-style: none; margin: 0; padding: 6px;
        overflow-y: auto; max-height: 280px;
      }
      #${SLASH_ID} .ts-slash-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 10px; border-radius: 8px; cursor: pointer;
        transition: background .12s ease;
      }
      #${SLASH_ID} .ts-slash-item:hover,
      #${SLASH_ID} .ts-slash-item.ts-active {
        background: rgba(var(--ts-brand-primary-rgb), 0.22);
      }
      #${SLASH_ID} .ts-slash-icon {
        width: 26px; height: 26px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, rgba(59,130,246,.55), rgba(37,99,235,.45));
        font-size: 14px; flex-shrink: 0;
      }
      #${SLASH_ID} .ts-slash-label { flex: 1; font-weight: 500; color: #fff; }
      #${SLASH_ID} .ts-slash-preview {
        font-size: 11px; color: rgba(255,255,255,.45);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        max-width: 180px;
      }
      #${SLASH_ID} .ts-slash-empty {
        padding: 18px; text-align: center; color: rgba(255,255,255,.5); font-size: 12px;
      }
    `;
    document.head.appendChild(s);
  }

  function isPopupSlashScopeActive() {
    return currentLayoutMode === "popup";
  }

  function isNativeComposerTarget(el) {
    if (!el) return false;
    if (el.closest && (el.closest(`#${ROOT_ID}`) || el.closest(`#${MENU_ID}`) || el.closest(`#${SUBMENU_ID}`) || el.closest(`#${SLASH_ID}`))) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.getAttribute && el.getAttribute("contenteditable") === "true") return true;
    return false;
  }

  function parseSlashQuery(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.replace(/^\s+/, "");
    if (!trimmed.startsWith("/")) return null;
    // Match "/" + optional word + optional space + rest
    const m = trimmed.match(/^\/([\p{L}\p{N}_-]*)(?:\s+([\s\S]*))?$/u);
    if (!m) return null;
    return { command: m[1] || "", rest: m[2] || "" };
  }

  function filterSlashItems(query) {
    const q = (query || "").toLowerCase().trim();
    const skills = getAvailableSkills();
    if (!q) return skills.slice(0, 50);
    return skills.filter((t) => {
      const lbl = String(t.label || "").toLowerCase();
      const pfx = String(t.prefix || "").toLowerCase();
      const dsc = String(t.description || "").toLowerCase();
      return lbl.includes(q) || pfx.includes(q) || dsc.includes(q);
    });
  }

  function ensureSlashPopover() {
    let pop = document.getElementById(SLASH_ID);
    if (pop) return pop;
    injectSlashStyles();
    pop = document.createElement("div");
    pop.id = SLASH_ID;
    pop.innerHTML = `
      <div class="ts-slash-head">
        <div class="ts-slash-title">
          <span class="ts-slash-badge">TS Skills</span>
        </div>
        <div class="ts-slash-hint">↑↓ navegar · Enter usar · Esc fechar</div>
      </div>
      <ul class="ts-slash-list" role="listbox"></ul>
    `;
    document.body.appendChild(pop);
    pop.addEventListener("mousedown", (e) => { e.preventDefault(); }); // prevent textarea blur
    return pop;
  }

  function positionSlashPopover() {
    const pop = document.getElementById(SLASH_ID);
    if (!pop || !slashState.target) return;
    const wrap = findNativeComposerWrap() || slashState.target;
    const r = wrap.getBoundingClientRect();
    const w = Math.min(460, Math.max(320, r.width));
    let left = r.left + (r.width - w) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    pop.style.width = w + "px";
    pop.style.left = left + "px";
    // anchor above composer
    const popHeight = pop.offsetHeight || 280;
    let top = r.top - popHeight - 8;
    if (top < 8) top = r.bottom + 8;
    pop.style.top = top + "px";
  }

  function renderSlashList() {
    const pop = ensureSlashPopover();
    const list = pop.querySelector(".ts-slash-list");
    if (!list) return;
    const items = slashState.items;
    if (!items.length) {
      list.innerHTML = `<li class="ts-slash-empty">Nenhuma skill encontrada</li>`;
      return;
    }
    if (slashState.index >= items.length) slashState.index = 0;
    list.innerHTML = items.map((t, i) => {
      const active = i === slashState.index ? " ts-active" : "";
      const icon = String(t.icon || "✦");
      const isSvg = icon.trim().startsWith("<svg");
      const iconHtml = isSvg ? icon : escapeHtml(icon);
      const preview = escapeHtml(String(t.prefix || t.description || "").slice(0, 80));
      return `<li class="ts-slash-item${active}" data-idx="${i}" role="option">
        <span class="ts-slash-icon">${iconHtml}</span>
        <span class="ts-slash-label">${escapeHtml(t.label || "")}</span>
        <span class="ts-slash-preview">${preview}</span>
      </li>`;
    }).join("");
    list.querySelectorAll(".ts-slash-item").forEach((li) => {
      li.addEventListener("mouseenter", () => {
        slashState.index = parseInt(li.getAttribute("data-idx"), 10) || 0;
        list.querySelectorAll(".ts-slash-item").forEach((x) => x.classList.toggle("ts-active", x === li));
      });
      li.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const idx = parseInt(li.getAttribute("data-idx"), 10) || 0;
        applySlashSelection(idx);
      });
    });
    const active = list.querySelector(".ts-slash-item.ts-active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  }

  function openSlashPicker(target, query) {
    slashState.target = target;
    slashState.query = query || "";
    slashState.items = filterSlashItems(slashState.query);
    slashState.index = 0;
    slashState.open = true;
    document.body.classList.add(SLASH_BODY_CLASS);
    const pop = ensureSlashPopover();
    renderSlashList();
    positionSlashPopover();
    requestAnimationFrame(() => { pop.classList.add("ts-slash-open"); positionSlashPopover(); });
    if (target && target.classList) target.classList.add("ts-slash-skills-textarea-active");
  }

  function updateSlashPicker(query) {
    if (!slashState.open) return;
    slashState.query = query || "";
    slashState.items = filterSlashItems(slashState.query);
    slashState.index = 0;
    renderSlashList();
    positionSlashPopover();
  }

  function closeSlashPicker() {
    slashState.open = false;
    document.body.classList.remove(SLASH_BODY_CLASS);
    const pop = document.getElementById(SLASH_ID);
    if (pop) pop.remove();
    if (slashState.target && slashState.target.classList) {
      slashState.target.classList.remove("ts-slash-skills-textarea-active");
    }
    slashState.target = null;
  }

  function applySlashSelection(idx) {
    const t = slashState.items[idx];
    const target = slashState.target;
    if (!t || !target) { closeSlashPicker(); return; }
    // Replace the "/query" portion with just the remaining text (no prefix in
    // the textarea). The picked skill is stored separately and rendered as a
    // badge above the composer; the prefix is added at send time.
    const currentVal = readComposerText(target);
    const parsed = parseSlashQuery(currentVal);
    const next = parsed && parsed.rest ? parsed.rest : "";
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      if (setter && setter.set) setter.set.call(target, next);
      else target.value = next;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (target.isContentEditable) {
      target.textContent = next;
      target.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    setPopupSelectedSkill(t);
    target.focus();
    closeSlashPicker();
    try { showStatus("Skill " + (t.label || t.name || "selecionada")); } catch (_) {}
  }

  // Capture-phase input handler: detect "/" at start of native composer
  function handleSlashInput(e) {
    if (!isPopupSlashScopeActive()) return;
    const target = e.target;
    if (!isNativeComposerTarget(target)) {
      if (slashState.open) closeSlashPicker();
      return;
    }
    const value = readComposerText(target);
    const parsed = parseSlashQuery(value);
    if (parsed) {
      if (!slashState.open) openSlashPicker(target, parsed.command);
      else updateSlashPicker(parsed.command);
    } else if (slashState.open) {
      closeSlashPicker();
    }
  }

  document.addEventListener("input", handleSlashInput, true);
  document.addEventListener("beforeinput", handleSlashInput, true);
  document.addEventListener("keyup", handleSlashInput, true);

  // Keyboard navigation within picker — must run before Lovable handlers (capture)
  document.addEventListener("keydown", (e) => {
    if (!slashState.open || !isPopupSlashScopeActive()) return;
    const target = e.target;
    if (!isNativeComposerTarget(target)) return;
    if (e.key === "ArrowDown") {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      slashState.index = Math.min(slashState.items.length - 1, slashState.index + 1);
      renderSlashList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      slashState.index = Math.max(0, slashState.index - 1);
      renderSlashList();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (e.shiftKey) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      applySlashSelection(slashState.index);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      closeSlashPicker();
    }
  }, true);

  // Close when clicking outside or composer loses focus
  document.addEventListener("focusout", (e) => {
    if (!slashState.open) return;
    setTimeout(() => {
      const ae = document.activeElement;
      if (slashState.open && !isNativeComposerTarget(ae) && !(ae && ae.closest && ae.closest(`#${SLASH_ID}`))) {
        closeSlashPicker();
      }
    }, 80);
  }, true);
  document.addEventListener("mousedown", (e) => {
    if (!slashState.open) return;
    const pop = document.getElementById(SLASH_ID);
    if (pop && pop.contains(e.target)) return;
    if (isNativeComposerTarget(e.target)) return;
    closeSlashPicker();
  }, true);
  window.addEventListener("resize", () => { if (slashState.open) positionSlashPopover(); });
  window.addEventListener("scroll", () => { if (slashState.open) positionSlashPopover(); }, true);

  init();
})();
