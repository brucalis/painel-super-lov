/**
 * license-ui.js — camada de ativação exibida ANTES da interface principal.
 * Não toca no envio de mensagens, upload, fila, anexos nem na autenticação
 * da Lovable: apenas mostra/esconde a interface e o cartão de licença.
 */
(function () {
  const LC = window.LicenseClient;
  const $ = (id) => document.getElementById(id);
  let busy = false;

  function gateStatus(text, kind = 'info') {
    const el = $('gateStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = `gate-status${text ? ` show ${kind}` : ''}`;
  }

  function showGate(message, kind = 'info') {
    document.body.classList.add('locked');
    document.body.classList.remove('licensed');
    $('licenseGate').hidden = false;
    if (message) gateStatus(message, kind);
  }

  function showApp() {
    document.body.classList.remove('locked');
    document.body.classList.add('licensed');
    $('licenseGate').hidden = true;
  }

  /** Aplica o nível de acesso: só a chave de administrador vê as configurações internas. */
  function applyRole(state) {
    const admin = window.LicenseClient.isAdmin(state);
    document.body.classList.toggle('role-admin', admin);
    document.body.classList.toggle('role-user', !admin);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ---------------- cartão em Ajustes ----------------
  function renderCard(state) {
    applyRole(state);
    const card = $('licenseCard');
    if (!card) return;
    const active = LC.hasActiveLicense(state);
    const days = LC.daysLeft(state);
    const admin = LC.isAdmin(state);
    const roleEl = $('licRole');
    if (roleEl) roleEl.textContent = admin ? 'Administrador' : 'Usuário';

    $('licPlan').textContent = state.plan_name || state.plan || (active ? 'Plano ativo' : '—');
    $('licStatus').textContent = active
      ? 'Ativo'
      : state.status === 'none' ? 'Sem licença' : (LC.blockReason(state) || 'Bloqueado');
    $('licStatus').className = `lic-value ${active ? 'ok' : 'bad'}`;
    $('licExpiry').textContent = state.is_lifetime
      ? 'Acesso vitalício'
      : state.expires_at ? fmtDate(state.expires_at) : '—';
    const count = state.device_count ?? (state.license_token ? 1 : 0);
    const limit = state.device_limit ?? 1;
    $('licDevices').textContent = `${count} de ${limit}`;
    $('licLast').textContent = fmtDate(state.last_successful_validation);

    const warn = $('licWarning');
    if (active && days !== null && days <= 7) {
      warn.hidden = false;
      warn.textContent = days <= 1
        ? 'Seu acesso expira em breve.'
        : `Seu acesso expira em ${days} dias.`;
    } else if (active && LC.isWithinOfflineGrace(state) && navigator.onLine === false) {
      warn.hidden = false;
      warn.textContent = 'Trabalhando offline com validação recente.';
    } else {
      warn.hidden = true;
    }
  }

  function cardStatus(text, kind = 'info') {
    const el = $('licMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = `lic-msg${text ? ` show ${kind}` : ''}`;
  }

  // ---------------- fluxo ----------------
  async function refresh({ revalidate = true, silentUi = false } = {}) {
    let state = await LC.getStoredLicense();

    if (!state.license_token) {
      renderCard(state);
      showGate(LC.REASONS.none, 'info');
      return state;
    }

    if (revalidate) {
      if (!silentUi) cardStatus('Validando seu acesso…');
      const res = await LC.validateLicense();
      state = res.state || (await LC.getStoredLicense());
      if (!res.ok) {
        renderCard(state);
        showGate(res.message || LC.blockReason(state) || LC.REASONS.invalid, 'error');
        cardStatus(res.message || '', 'error');
        return state;
      }
      cardStatus(res.offline ? 'Sem conexão — usando a validação recente.' : 'Acesso confirmado.', res.offline ? 'warn' : 'success');
    }

    renderCard(state);
    if (LC.hasActiveLicense(state)) showApp();
    else showGate(LC.blockReason(state) || LC.REASONS.invalid, 'error');
    return state;
  }

  async function activate() {
    if (busy) return;
    const input = $('licenseKeyInput');
    const value = input.value;
    if (!LC.isKeyComplete(value)) {
      gateStatus('Informe a chave completa no formato LVA-XXXX-XXXX-XXXX-XXXX.', 'error');
      input.focus();
      return;
    }
    busy = true;
    $('activateBtn').disabled = true;
    gateStatus('Validando sua chave…', 'info');

    const res = await LC.activateLicense(value);
    input.value = ''; // a chave digitada sai da memória da interface

    busy = false;
    $('activateBtn').disabled = false;

    if (!res.ok) {
      gateStatus(res.message || LC.REASONS.invalid, res.status === 'offline' ? 'warn' : 'error');
      return;
    }
    gateStatus('Acesso liberado. Bom trabalho!', 'success');
    renderCard(res.state);
    setTimeout(showApp, 400);
    try { chrome.runtime.sendMessage({ action: 'licenseChanged' }); } catch (e) { /* opcional */ }
  }

  // ---------------- ligações de interface ----------------
  function wire() {
    const input = $('licenseKeyInput');
    input.addEventListener('input', () => {
      const pos = input.selectionStart === input.value.length;
      input.value = LC.formatKey(input.value);
      if (pos) input.setSelectionRange(input.value.length, input.value.length);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });
    $('activateBtn').addEventListener('click', activate);

    $('whereKey').addEventListener('click', () => {
      $('whereKeyBox').hidden = !$('whereKeyBox').hidden;
    });
    const support = () => chrome.tabs.create({ url: 'https://superlovable.app/suporte' });
    $('gateHelp').addEventListener('click', support);
    $('licSupport')?.addEventListener('click', support);

    $('licValidate')?.addEventListener('click', async () => {
      cardStatus('Validando agora…');
      await refresh({ revalidate: true, silentUi: true });
    });
    $('licChange')?.addEventListener('click', async () => {
      await LC.clearLicense();
      renderCard(LC.emptyState());
      showGate('Informe a nova chave de acesso.', 'info');
      $('licenseKeyInput').focus();
    });
    $('licDeactivate')?.addEventListener('click', async () => {
      cardStatus('Desativando este dispositivo…');
      const state = await LC.deactivateDevice();
      renderCard(state);
      showGate('Dispositivo desativado. Seus dados locais foram preservados.', 'info');
      try { chrome.runtime.sendMessage({ action: 'licenseChanged' }); } catch (e) { /* opcional */ }
    });

    const server = $('licServer');
    if (server) {
      LC.getServerUrl().then((u) => { server.value = u; });
      server.addEventListener('change', async () => {
        await LC.setServerUrl(server.value);
        cardStatus('Servidor de licenças atualizado.', 'success');
      });
    }
  }

  async function boot() {
    showGate(); // a interface principal nunca aparece antes da ativação válida
    wire();
    await LC.getDeviceId(); // garante o identificador na primeira execução
    await refresh({ revalidate: true });
    // Sinais do service worker (validação periódica, revogação, expiração).
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.action === 'licenseState') refresh({ revalidate: false });
      });
    } catch (e) { /* opcional */ }
    window.addEventListener('online', () => refresh({ revalidate: true, silentUi: true }));
  }

  window.LicenseUI = { boot, refresh, showGate, showApp, renderCard };
  document.addEventListener('DOMContentLoaded', boot);
})();
