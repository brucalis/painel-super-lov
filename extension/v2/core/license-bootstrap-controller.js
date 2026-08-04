/*
 * SUPER LOVABLE V2 — controlador de inicialização da licença
 *
 * Estado visual esperado no HTML:
 * <body data-license-view="booting">
 *   <div data-license-loading>...</div>
 *   <div data-license-main hidden>...</div>
 *   <div data-license-gate hidden>...</div>
 * </body>
 *
 * Durante o boot, não exibe nem a interface principal nem a tela de ativação.
 * Isso elimina o flash incorreto da tela de licença.
 */

import {
  LICENSE_STATES,
  shouldShowActivation,
  shouldShowMainInterface
} from './license-session.js';

const VIEW = Object.freeze({
  BOOTING: 'booting',
  MAIN: 'main',
  ACTIVATION: 'activation'
});

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = Boolean(hidden);
  element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

export class LicenseBootstrapController {
  constructor({
    sessionManager,
    root = document.body,
    loadingElement = document.querySelector('[data-license-loading]'),
    mainElement = document.querySelector('[data-license-main]'),
    gateElement = document.querySelector('[data-license-gate]'),
    statusElement = document.querySelector('[data-license-status]')
  } = {}) {
    if (!sessionManager) throw new TypeError('sessionManager é obrigatório');
    this.sessionManager = sessionManager;
    this.root = root;
    this.loadingElement = loadingElement;
    this.mainElement = mainElement;
    this.gateElement = gateElement;
    this.statusElement = statusElement;
  }

  setView(view, session = null) {
    this.root?.setAttribute('data-license-view', view);
    setHidden(this.loadingElement, view !== VIEW.BOOTING);
    setHidden(this.mainElement, view !== VIEW.MAIN);
    setHidden(this.gateElement, view !== VIEW.ACTIVATION);

    if (this.statusElement) {
      this.statusElement.textContent = session?.message || '';
      this.statusElement.dataset.state = session?.state || '';
    }

    globalThis.dispatchEvent?.(new CustomEvent('superlovable:license-state', {
      detail: session || { state: LICENSE_STATES.BOOTING }
    }));
  }

  async start() {
    this.setView(VIEW.BOOTING, { state: LICENSE_STATES.BOOTING });

    try {
      const session = await this.sessionManager.bootstrap();

      if (shouldShowMainInterface(session.state)) {
        this.setView(VIEW.MAIN, session);
      } else if (shouldShowActivation(session.state)) {
        this.setView(VIEW.ACTIVATION, session);
      } else {
        this.setView(VIEW.ACTIVATION, {
          ...session,
          state: LICENSE_STATES.ERROR,
          message: 'Não foi possível determinar o estado da licença.'
        });
      }

      return session;
    } catch (error) {
      const session = {
        state: LICENSE_STATES.ERROR,
        message: error?.message || 'Falha ao iniciar a licença.'
      };
      this.setView(VIEW.ACTIVATION, session);
      return session;
    }
  }

  async activate(key) {
    this.setView(VIEW.BOOTING, { state: LICENSE_STATES.BOOTING });
    const session = await this.sessionManager.activate(key);

    if (shouldShowMainInterface(session.state)) {
      this.setView(VIEW.MAIN, session);
    } else {
      this.setView(VIEW.ACTIVATION, session);
    }

    return session;
  }
}

export const LICENSE_BOOTSTRAP_VIEW = VIEW;
