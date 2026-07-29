/* content.js — SUPER LOVABLE dentro da interface da Lovable.
 * Responsabilidades:
 *  1. barra de controles próxima ao campo nativo (#super-lovable-native-toolbar);
 *  2. painel Mini;
 *  3. detecção do estado de execução (detectLovableExecutionState);
 *  4. encaminhamento do texto digitado no campo nativo para o fluxo da extensão.
 * NÃO envia nada para a API: o envio continua exclusivamente no fluxo original do popup.
 */
(function () {
  if (window.__superLovableInjected) return;
  window.__superLovableInjected = true;

  const TOOLBAR_ID = 'super-lovable-native-toolbar';
  const MINI_ID = 'super-lovable-mini';
  let settings = { nativeCapture: true, mini: 'open' };
  let lastState = { isRunning: false, confidence: 0, signals: [], lastChangeAt: Date.now() };
  let lastRunningChange = Date.now();

  // ---------- utils ----------
  const projectId = () => (location.pathname.match(/\/projects\/([0-9a-zA-Z-]+)/) || [])[1] || null;

  function loadSettings() {
    chrome.storage.local.get(['super_lovable_settings', 'super_lovable_mini'], (r) => {
      const s = r.super_lovable_settings || {};
      settings.nativeCapture = s.nativeCapture !== false;
      settings.mini = r.super_lovable_mini || 'open';
      paintMini();
    });
  }

  // ---------- detecção de execução ----------
  function detectLovableExecutionState() {
    const signals = [];
    const root = document.querySelector('main') || document.body;

    // sinal 1: botão de parar geração
    const stopBtn = Array.from(root.querySelectorAll('button')).find((b) => {
      const label = `${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`.toLowerCase();
      return /stop|parar|cancelar geração|interromper/.test(label);
    });
    if (stopBtn) signals.push('stop-button');

    // sinal 2: textarea desativada
    const ta = findNativeInput();
    if (ta && (ta.disabled || ta.getAttribute('aria-disabled') === 'true' || ta.readOnly)) signals.push('input-disabled');

    // sinal 3: indicadores de carregamento visíveis
    const spinners = root.querySelectorAll(
      '[role="progressbar"], [data-loading="true"], [aria-busy="true"], .animate-spin'
    );
    if (spinners.length) signals.push('spinner');

    // sinal 4: textos típicos de processamento
    const txt = (root.innerText || '').slice(0, 4000).toLowerCase();
    if (/(thinking|working|generating|gerando|pensando|editing files|analisando)/.test(txt)) signals.push('progress-text');

    // sinal 5: streaming — última mensagem mudando de tamanho
    const last = root.querySelector('[data-message-id]:last-of-type, [data-testid*="message"]:last-of-type');
    const len = last ? (last.textContent || '').length : 0;
    if (detectLovableExecutionState._len !== undefined && len !== detectLovableExecutionState._len) {
      signals.push('streaming');
    }
    detectLovableExecutionState._len = len;

    const isRunning = signals.length > 0;
    if (isRunning !== lastState.isRunning) lastRunningChange = Date.now();
    lastState = {
      isRunning,
      confidence: Math.min(1, signals.length / 3),
      signals,
      lastChangeAt: lastRunningChange,
    };
    return lastState;
  }

  function stableIdleFor() {
    return lastState.isRunning ? 0 : Date.now() - lastState.lastChangeAt;
  }

  // ---------- campo nativo ----------
  function findNativeInput() {
    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"]')
    ).filter((el) => {
      if (el.closest('iframe')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 20) return false;
      if (el.closest('[data-super-lovable-ui]')) return false;
      // evita editores de código, modais e campos de login
      if (el.closest('.monaco-editor, .cm-editor, [role="dialog"], form[action*="login"]')) return false;
      if (/password|email|senha/i.test(el.getAttribute('name') || el.getAttribute('type') || '')) return false;
      return true;
    });
    // pontuação por sinais múltiplos
    let best = null;
    let bestScore = 0;
    candidates.forEach((el) => {
      let score = 0;
      const ph = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
      if (/ask|message|mensagem|pergunt|build|crie|edit/.test(ph)) score += 3;
      if (el.closest('form')) score += 1;
      const form = el.closest('form') || el.parentElement?.parentElement;
      if (form && form.querySelector('button[type="submit"], button[aria-label*="end" i], button[aria-label*="nvi" i]')) score += 2;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight * 0.55) score += 2; // chat fica embaixo
      if (r.left < window.innerWidth * 0.5) score += 1; // painel de chat à esquerda
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return bestScore >= 4 ? best : null;
  }

  function readValue(el) {
    return el.tagName === 'TEXTAREA' ? el.value : el.innerText;
  }
  function clearValue(el) {
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerText = '';
    }
  }

  function forward(text, el) {
    chrome.runtime.sendMessage(
      {
        action: 'superLovableForward',
        data: { text, projectId: projectId(), origin: 'chat nativo redirecionado', isRunning: lastState.isRunning },
      },
      (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          flash('Não foi possível encaminhar para a SUPER LOVABLE. O texto foi mantido no campo.', true);
          return;
        }
        clearValue(el); // limpa apenas após a confirmação
        flash(
          res.queued
            ? `Adicionado à fila da SUPER LOVABLE (posição ${res.position}). Abra a extensão para executar.`
            : 'Registrado na SUPER LOVABLE. Abra a extensão para executar.'
        );
        paintMini(res.queueSize);
      }
    );
  }

  function bindNativeInput() {
    const el = findNativeInput();
    if (!el) return null;
    if (el.dataset.superLovableBound === 'true') return el;
    el.dataset.superLovableBound = 'true';

    el.addEventListener(
      'keydown',
      (e) => {
        if (!settings.nativeCapture) return;
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        const text = readValue(el).trim();
        if (!text) return;
        e.preventDefault();
        e.stopPropagation();
        forward(text, el);
      },
      true
    );
    return el;
  }

  // ---------- barra de controles ----------
  function buildToolbar(anchor) {
    if (document.getElementById(TOOLBAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = TOOLBAR_ID;
    bar.setAttribute('data-super-lovable-ui', 'true');
    bar.innerHTML = `
      <span class="sl-logo" aria-hidden="true">SL</span>
      <span class="sl-title">SUPER LOVABLE</span>
      <span class="sl-sync" id="sl-sync">Projeto sincronizado</span>
      <div class="sl-actions">
        <button class="sl-btn" data-act="skills" title="Atalhos rápidos da SUPER LOVABLE">Skills</button>
        <button class="sl-btn" data-act="improve" title="Melhorar prompt na extensão">Melhorar</button>
        <button class="sl-btn" data-act="watermark" title="Preparar pedido de remoção de marca">Remover marca</button>
        <button class="sl-btn" data-act="download" title="Baixar arquivos do projeto pela extensão">Baixar</button>
        <button class="sl-btn" data-act="help" title="Como usar a SUPER LOVABLE">Ajuda</button>
        <button class="sl-btn" data-act="mini" title="Modo Mini">Mini</button>
        <button class="sl-btn" data-act="hide" title="Ocultar barra">Ocultar</button>
      </div>
      <span class="sl-flag" id="sl-flag">Envio pela SUPER LOVABLE</span>
      <span class="sl-queue" id="sl-queue" title="Itens na fila">0</span>`;
    bar.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      if (act === 'hide') { bar.remove(); return; }
      if (act === 'mini') { setMini(settings.mini === 'open' ? 'minimized' : 'open'); return; }
      if (act === 'help') {
        flash('Abra o ícone da SUPER LOVABLE na barra do Chrome: prompt, fila, histórico e ferramentas ficam lá.');
        return;
      }
      chrome.runtime.sendMessage({ action: 'superLovableTool', data: { tool: act, projectId: projectId() } }, () => {
        flash('Pedido registrado. Abra a extensão para concluir esta ferramenta.');
      });
    });
    const host = anchor.closest('form') || anchor.parentElement;
    host?.parentElement?.insertBefore(bar, host);
  }

  // ---------- Mini ----------
  function setMini(state) {
    settings.mini = state;
    chrome.storage.local.set({ super_lovable_mini: state });
    paintMini();
  }

  function paintMini(queueSize) {
    let mini = document.getElementById(MINI_ID);
    if (!mini) {
      mini = document.createElement('div');
      mini.id = MINI_ID;
      mini.setAttribute('data-super-lovable-ui', 'true');
      mini.innerHTML = `
        <span class="sl-logo">SL</span>
        <span class="sl-mini-status">pronto</span>
        <span class="sl-mini-queue">0</span>
        <button class="sl-btn" data-mini="open">Abrir</button>`;
      mini.addEventListener('click', (e) => {
        if (e.target?.dataset?.mini === 'open') setMini('open');
      });
      document.body.appendChild(mini);
    }
    mini.classList.toggle('hidden', settings.mini !== 'minimized');
    if (typeof queueSize === 'number') {
      mini.querySelector('.sl-mini-queue').textContent = String(queueSize);
      const q = document.getElementById('sl-queue');
      if (q) q.textContent = String(queueSize);
    }
    mini.querySelector('.sl-mini-status').textContent = lastState.isRunning ? 'executando' : 'pronto';
    const bar = document.getElementById(TOOLBAR_ID);
    if (bar) bar.classList.toggle('sl-collapsed', settings.mini === 'minimized');
  }

  function flash(msg, isError) {
    let t = document.getElementById('super-lovable-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'super-lovable-toast';
      t.setAttribute('data-super-lovable-ui', 'true');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = isError ? 'err show' : 'show';
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { t.className = ''; }, 6000);
  }

  // ---------- ciclo de vida (SPA) ----------
  function sync() {
    const el = bindNativeInput();
    if (el) buildToolbar(el);
    detectLovableExecutionState();
    const flag = document.getElementById('sl-flag');
    if (flag) flag.classList.toggle('running', lastState.isRunning);
    const sy = document.getElementById('sl-sync');
    if (sy) sy.textContent = projectId() ? `Projeto ${projectId().slice(0, 8)}…` : 'Sem projeto';
  }

  const observer = new MutationObserver(() => {
    clearTimeout(sync._t);
    sync._t = setTimeout(sync, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      document.getElementById(TOOLBAR_ID)?.remove();
      document.querySelectorAll('[data-super-lovable-bound]').forEach((e) => e.removeAttribute('data-super-lovable-bound'));
    }
    sync();
  }, 1200);

  chrome.runtime.onMessage.addListener((req, _s, sendResponse) => {
    if (req.action === 'superLovableState') {
      const st = detectLovableExecutionState();
      sendResponse({ ...st, idleMs: stableIdleFor(), projectId: projectId() });
      return true;
    }
    if (req.action === 'superLovableQueueSize') {
      paintMini(req.size);
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  loadSettings();
  sync();
  window.detectLovableExecutionState = detectLovableExecutionState;
})();
