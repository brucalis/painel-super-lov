(() => {
  if (window.__SLV2_VISUAL_EDITOR__) return;
  window.__SLV2_VISUAL_EDITOR__ = true;
  let active = false;
  let hovered = null;
  let overlay = null;
  let badge = null;

  const projectId = () => (location.pathname.match(/\/projects\/([0-9a-zA-Z-]+)/) || [])[1] || null;
  function ensureUi() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'slv2-visual-overlay';
    overlay.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #e83eaa;background:rgba(232,62,170,.08);border-radius:6px;display:none;box-sizing:border-box';
    badge = document.createElement('div');
    badge.id = 'slv2-visual-badge';
    badge.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;background:#17131f;color:#fff;padding:5px 8px;border-radius:6px;font:600 11px/1.2 system-ui;display:none;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    document.documentElement.append(overlay, badge);
  }
  function selectorFor(el) {
    if (!el || el === document.body || el === document.documentElement) return el?.tagName?.toLowerCase() || 'body';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 5; depth += 1, node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].filter((c) => !/^sl|^css-|^sc-/.test(c)).slice(0, 2);
      if (classes.length) part += classes.map((c) => `.${CSS.escape(c)}`).join('');
      if (node.parentElement) {
        const same = [...node.parentElement.children].filter((x) => x.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) {}
    }
    return parts.join(' > ');
  }
  function describe(el) {
    const r = el.getBoundingClientRect();
    return {
      projectId: projectId(), url: location.href, tagName: el.tagName,
      id: el.id || '', classes: [...el.classList], text: (el.innerText || el.textContent || '').slice(0, 500),
      selector: selectorFor(el), ariaLabel: el.getAttribute('aria-label') || '', role: el.getAttribute('role') || '',
      rect: { x: r.x, y: r.y, width: r.width, height: r.height }, capturedAt: new Date().toISOString()
    };
  }
  function paint(el) {
    ensureUi();
    if (!el) { overlay.style.display = badge.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, { display:'block', left:`${r.left}px`, top:`${r.top}px`, width:`${r.width}px`, height:`${r.height}px` });
    badge.textContent = `${el.tagName.toLowerCase()} · clique para selecionar`;
    Object.assign(badge.style, { display:'block', left:`${Math.max(6,r.left)}px`, top:`${Math.max(6,r.top-28)}px` });
  }
  function validTarget(el) { return el && !el.closest('#slv2-visual-overlay,#slv2-visual-badge,[data-super-lovable-ui]'); }
  function onMove(e) { if (!active || !validTarget(e.target)) return; hovered = e.target; paint(hovered); }
  function onClick(e) {
    if (!active || !validTarget(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const selection = describe(e.target);
    chrome.runtime.sendMessage({ action: 'SLV2_VISUAL_SELECTION', selection }, () => void chrome.runtime.lastError);
    stop();
  }
  function onKey(e) { if (active && e.key === 'Escape') stop(); }
  function start() { active = true; ensureUi(); document.addEventListener('mousemove', onMove, true); document.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey, true); }
  function stop() { active = false; hovered = null; paint(null); document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true); }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.action === 'SLV2_START_VISUAL_PICKER') { start(); sendResponse({ success:true }); }
    if (msg?.action === 'SLV2_STOP_VISUAL_PICKER') { stop(); sendResponse({ success:true }); }
  });
})();
