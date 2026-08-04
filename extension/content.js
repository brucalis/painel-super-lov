/* content.js — SUPER LOVABLE dentro da interface da Lovable.
 * Responsabilidades:
 *  1. barra integrada ao chat nativo, com campo próprio, envio direto e contador da fila;
 *  2. painel Mini;
 *  3. detecção do estado de execução (detectLovableExecutionState);
 *  4. encaminhamento do texto digitado no campo nativo para a função central.
 * O envio real é feito pelo motor da fila no service worker, que reproduz
 * exatamente o fluxo original (mesmos IDs, payload, intent e endpoint).
 */
(function () {
  if (window.__superLovableInjected) return;
  window.__superLovableInjected = true;

  const TOOLBAR_ID = 'super-lovable-native-toolbar';
  const MINI_ID = 'super-lovable-mini';
  const MAX_QUEUE_ITEMS = 10;
  let settings = { nativeCapture: true, mini: 'open' };
  let lastState = { isRunning: false, confidence: 0, signals: [], lastChangeAt: Date.now() };
  let lastRunningChange = Date.now();
  let summary = { total: 0, waiting: 0, isFull: false, paused: false, activeStatus: null };

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
  // Sinais fortes indicam execução sozinhos. Sinais fracos (spinner, texto,
  // streaming) só contam quando aparecem juntos, evitando o falso "ocupada"
  // que impedia o envio imediato com a Lovable parada.
  function detectLovableExecutionState() {
    const strong = [];
    const weak = [];
    const root = document.querySelector('main') || document.body;

    // sinal forte 1: botão de parar geração visível
    const stopBtn = Array.from(root.querySelectorAll('button')).find((b) => {
      const label = `${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`.toLowerCase();
      if (!/\b(stop|parar|interromper|cancelar geração)\b/.test(label)) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (stopBtn) strong.push('stop-button');

    // sinal forte 2: campo nativo desativado
    const ta = findNativeInput();
    if (ta && (ta.disabled || ta.getAttribute('aria-disabled') === 'true' || ta.readOnly)) strong.push('input-disabled');

    // sinal fraco: indicadores de carregamento realmente visíveis
    const spinner = Array.from(
      root.querySelectorAll('[role="progressbar"], [data-loading="true"], [aria-busy="true"], .animate-spin, [data-state="loading"]')
    ).some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    });
    if (spinner) weak.push('spinner');

    // sinal fraco: textos de progresso no rodapé do chat (não na página toda)
    const tail = (root.innerText || '').slice(-1200).toLowerCase();
    if (/(thinking…|thinking\.\.\.|generating|gerando|pensando|editing files|working on it|building your|deploying)/.test(tail)) {
      weak.push('progress-text');
    }

    // sinal fraco: streaming — última mensagem crescendo entre duas leituras
    const last = root.querySelector('[data-message-id]:last-of-type, [data-testid*="message"]:last-of-type');
    const len = last ? (last.textContent || '').length : 0;
    if (detectLovableExecutionState._len !== undefined && len > detectLovableExecutionState._len) {
      weak.push('streaming');
    }
    detectLovableExecutionState._len = len;

    const signals = [...strong, ...weak];
    const isRunning = strong.length > 0 || weak.length >= 2;
    if (isRunning !== lastState.isRunning) lastRunningChange = Date.now();
    lastState = {
      isRunning,
      confidence: strong.length ? 1 : Math.min(1, weak.length / 2),
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
      if (el.closest('.monaco-editor, .cm-editor, [role="dialog"], form[action*="login"]')) return false;
      if (/password|email|senha/i.test(el.getAttribute('name') || el.getAttribute('type') || '')) return false;
      return true;
    });
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
      if (r.bottom > window.innerHeight * 0.55) score += 2;
      if (r.left < window.innerWidth * 0.5) score += 1;
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

  // ---------- função central de envio (mesma para todos os pontos) ----------
  function submitOrQueuePrompt({ text, source }) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'SUPER_LOVABLE_SUBMIT_PROMPT',
          data: { text, projectId: projectId(), source: source || 'native_toolbar', attachments: [] },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: 'A extensão precisa ser recarregada para continuar.' });
            return;
          }
          resolve(res || { success: false, error: 'Sem resposta da SUPER LOVABLE.' });
        }
      );
    });
  }

  async function handleSubmit(text, onDone) {
    if (!projectId()) {
      setBarStatus('Abra um projeto primeiro', 'warn');
      flash('Inicie um projeto no chat principal da Lovable e depois use a extensão.', true);
      return;
    }
    if (!text.trim()) return;
    if (summary.isFull) {
      setBarStatus('Fila cheia', 'warn');
      flash(`A fila atingiu o limite de ${MAX_QUEUE_ITEMS} comandos. Aguarde a conclusão de um deles para adicionar outro.`, true);
      return;
    }
    setBarStatus('Enviando…', 'busy');
    const res = await submitOrQueuePrompt({ text, source: onDone ? 'native_chat' : 'native_toolbar' });
    if (!res.success) {
      const reason = res.blocked ? `${res.error} Abra a extensão para ativar seu acesso.` : res.error;
      setBarStatus('Não enviado', 'warn');
      flash(reason || 'Não foi possível enviar.', true);
      return;
    }
    if (onDone) onDone();
    if (res.sent) {
      setBarStatus('Enviando agora', 'busy');
      flash('Comando enviado pela SUPER LOVABLE.');
    } else {
      setBarStatus(`Adicionado à fila — posição ${res.position}`, 'queued');
      flash(`Adicionado à fila (posição ${res.position}). O envio é automático.`);
    }
    refreshSummary();
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
        handleSubmit(text, () => clearValue(el));
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
      <div class="sl-top">
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
        <span class="sl-flag" id="sl-flag">Pronto para enviar</span>
        <button class="sl-queue" id="sl-queue" title="Itens na fila — clique para abrir a fila">0</button>
      </div>
      <div class="sl-compose">
        <textarea id="sl-input" rows="1" placeholder="Escreva aqui e envie pela SUPER LOVABLE…"
          aria-label="Prompt da SUPER LOVABLE"></textarea>
        <button class="sl-send" id="sl-send" title="Enviar agora ou adicionar à fila">➤</button>
      </div>`;

    bar.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (e.target?.id === 'sl-send') {
        const input = bar.querySelector('#sl-input');
        const text = input.value.trim();
        handleSubmit(text, () => { input.value = ''; input.style.height = 'auto'; });
        return;
      }
      if (e.target?.id === 'sl-queue') {
        chrome.runtime.sendMessage({ action: 'superLovableTool', data: { tool: 'queue', projectId: projectId() } }, () => {
          void chrome.runtime.lastError;
          flash('Abra o ícone da SUPER LOVABLE para ver a fila completa.');
        });
        return;
      }
      if (!act) return;
      if (act === 'hide') { bar.remove(); return; }
      if (act === 'mini') { setMini(settings.mini === 'open' ? 'minimized' : 'open'); return; }
      if (act === 'help') {
        flash('Abra o ícone da SUPER LOVABLE na barra do Chrome: prompt, fila, histórico e ferramentas ficam lá.');
        return;
      }
      chrome.runtime.sendMessage({ action: 'superLovableTool', data: { tool: act, projectId: projectId() } }, (res) => {
        if (res && res.blocked) return flash(`${res.error} Abra a extensão para ativar seu acesso.`, true);
        flash('Pedido registrado. Abra a extensão para concluir esta ferramenta.');
      });
    });

    bar.querySelector('#sl-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const input = e.target;
        handleSubmit(input.value.trim(), () => { input.value = ''; input.style.height = 'auto'; });
      }
    });
    bar.querySelector('#sl-input').addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 90) + 'px';
    });

    const host = anchor.closest('form') || anchor.parentElement;
    host?.parentElement?.insertBefore(bar, host);
    paintBar();
  }

  function setBarStatus(text, kind) {
    const flag = document.getElementById('sl-flag');
    if (!flag) return;
    flag.textContent = text;
    flag.className = `sl-flag ${kind || ''}`;
    clearTimeout(setBarStatus._t);
    setBarStatus._t = setTimeout(paintBar, 5000);
  }

  function paintBar() {
    const flag = document.getElementById('sl-flag');
    const counter = document.getElementById('sl-queue');
    if (counter) counter.textContent = String(summary.total || 0);
    if (!flag) return;
    let text = 'Pronto para enviar';
    let kind = '';
    if (!projectId()) { text = 'Abra um projeto primeiro'; kind = 'warn'; }
    else if (summary.paused) { text = 'Fila pausada'; kind = 'warn'; }
    else if (summary.isFull) { text = 'Fila cheia'; kind = 'warn'; }
    else if (summary.activeStatus === 'sending') { text = 'Enviando…'; kind = 'busy'; }
    else if (summary.activeStatus === 'running' || lastState.isRunning) { text = 'Lovable trabalhando…'; kind = 'busy'; }
    else if (summary.waiting > 0) { text = `${summary.waiting} comando(s) na fila`; kind = 'queued'; }
    flag.textContent = text;
    flag.className = `sl-flag ${kind}`;
    const input = document.getElementById('sl-input');
    const send = document.getElementById('sl-send');
    const disabled = !projectId();
    if (input) input.disabled = disabled;
    if (send) send.disabled = disabled;
  }

  function refreshSummary() {
    chrome.runtime.sendMessage({ action: 'SUPER_LOVABLE_QUEUE_SNAPSHOT' }, (res) => {
      void chrome.runtime.lastError;
      if (res && res.summary) summary = res.summary;
      paintBar();
      paintMini(summary.total);
    });
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
    const sy = document.getElementById('sl-sync');
    if (sy) sy.textContent = projectId() ? 'Projeto sincronizado' : 'Sem projeto';
    paintBar();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(sync._t);
    sync._t = setTimeout(sync, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ---------- detecção nativa de navegação SPA ----------
  function handleNavigation() {
    const url = location.href;
    const pid = projectId();

    // Remove toolbar antiga se houver troca de rota
    document.getElementById(TOOLBAR_ID)?.remove();
    document.querySelectorAll('[data-super-lovable-bound]').forEach((e) => e.removeAttribute('data-super-lovable-bound'));

    // Emite evento customizado solicitado
    window.dispatchEvent(
      new CustomEvent('super-lovable:navigation-change', {
        detail: { url, projectId: pid }
      })
    );

    sync();
  }

  // Monkey-patching das funções de histórico para detectar navegação SPA
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleNavigation();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    handleNavigation();
  };

  window.addEventListener('popstate', handleNavigation);

  // Fallback periódico apenas para garantir sincronia do estado
  setInterval(sync, 3000);

  // Mantém o motor da fila acordado mesmo com o popup fechado.
  setInterval(() => {
    if (!summary.total) return;
    chrome.runtime.sendMessage({ action: 'SUPER_LOVABLE_QUEUE_TICK' }, () => void chrome.runtime.lastError);
  }, 2500);
  setInterval(refreshSummary, 3000);

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
    if (req.type && req.type.startsWith('SUPER_LOVABLE_')) {
      if (req.payload?.summary) summary = req.payload.summary;
      paintBar();
      paintMini(summary.total);
      if (req.type === 'SUPER_LOVABLE_EXECUTION_FINISHED' && !summary.waiting) flash('Fila concluída.');
      if (req.type === 'SUPER_LOVABLE_EXECUTION_FAILED') flash(`Falha no envio: ${req.payload?.error || ''}`, true);
      return false;
    }
    return false;
  });

  loadSettings();
  sync();
  refreshSummary();
  window.detectLovableExecutionState = detectLovableExecutionState;
})();
