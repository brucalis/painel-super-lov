// watermark-manager.js — detecta um badge/marca d'água pertencente ao PRÓPRIO projeto
// do usuário e prepara um pedido de remoção enviado pelo fluxo normal do chat.
// Não burla planos, não intercepta a plataforma e não altera respostas do servidor.
(function () {
  const PATTERNS = [
    /lovable[-_ ]?badge/i,
    /edit[- ]with[- ]lovable/i,
    /data-lovable-badge/i,
    /class="[^"]*watermark[^"]*"/i,
    /id="[^"]*watermark[^"]*"/i,
    /<[^>]+aria-label="[^"]*marca d.?água[^"]*"/i,
  ];

  const WatermarkManager = {
    notice: () => window.I18n.t('wm_notice'),

    /** Analisa a aba ativa (preview do próprio projeto) em busca do elemento. */
    async detect() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error(window.I18n.t('err_project'));
      let found = null;
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const sels = ['[data-lovable-badge]', '[class*="watermark" i]', '[id*="watermark" i]', 'a[href*="lovable.dev"][target="_blank"]'];
            for (const s of sels) {
              const el = document.querySelector(s);
              if (el) return { selector: s, html: el.outerHTML.slice(0, 300), text: (el.textContent || '').trim().slice(0, 120) };
            }
            return null;
          },
        });
        found = res?.result || null;
      } catch (e) {
        // scripting pode estar indisponível; cai para heurística textual
        console.warn('watermark detect', e);
      }
      if (!found) return null;
      const looksOwn = PATTERNS.some((p) => p.test(found.html)) || /lovable/i.test(found.html);
      return looksOwn ? found : null;
    },

    buildPrompt(found) {
      return [
        'Remova do meu próprio projeto o elemento de marca d’água/badge identificado abaixo.',
        'Apague apenas esse componente e as referências diretas a ele, sem alterar outras funcionalidades.',
        '',
        `Seletor identificado: ${found.selector}`,
        `Trecho: ${found.html}`,
      ].join('\n');
    },
  };

  window.WatermarkManager = WatermarkManager;
})();
