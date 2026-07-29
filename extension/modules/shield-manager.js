// shield-manager.js — modo de proteção operacional (não altera autenticação nem envio)
(function () {
  let active = false;
  let inFlight = false;
  let lastProjectId = null;
  const auditLog = [];

  const ShieldManager = {
    get active() { return active; },
    get log() { return auditLog.slice(-200); },
    async load() {
      active = !!window.SettingsManager.get('shield');
      return active;
    },
    async toggle(v) {
      active = v === undefined ? !active : !!v;
      await window.SettingsManager.set({ shield: active });
      ShieldManager.audit('shield', active ? 'ativado' : 'desativado');
      return active;
    },
    audit(scope, message) {
      auditLog.push({ ts: Date.now(), scope, message: String(message).slice(0, 300) });
      if (auditLog.length > 500) auditLog.splice(0, auditLog.length - 500);
    },
    confirmDestructive(message) {
      if (!active && !window.SettingsManager.get('confirmDeletions')) return true;
      return window.confirm(message);
    },
    /** Bloqueia envios simultâneos/duplicados. Retorna null se autorizado, ou string de erro. */
    guardSend({ projectId, online = navigator.onLine, hasSession }) {
      if (!active) return null;
      if (inFlight) return 'Já existe um envio em andamento.';
      if (!online) return 'Sem conexão de rede detectada.';
      if (!projectId) return window.I18n.t('err_project');
      if (!hasSession) return window.I18n.t('err_session');
      if (lastProjectId && lastProjectId !== projectId) {
        lastProjectId = projectId;
        if (!window.confirm('O projeto sincronizado mudou. Continuar mesmo assim?')) {
          return 'Envio cancelado pela troca de projeto.';
        }
      }
      lastProjectId = projectId;
      return null;
    },
    begin() { inFlight = true; },
    end() { inFlight = false; },
  };

  window.ShieldManager = ShieldManager;
})();
