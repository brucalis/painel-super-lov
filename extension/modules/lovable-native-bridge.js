/* lovable-native-bridge.js — executa operações legítimas já disponíveis à conta
 * e ao projeto, sem redigir pedidos comuns para o chat.
 * Nunca simula sucesso e nunca inventa endpoint.
 */
(function (root) {
  function result(success, status, extra = {}) {
    return { success, type: 'native', status, ...extra };
  }

  const UNSUPPORTED = () => result(false, 'unsupported', {
    code: 'NATIVE_ACTION_UNAVAILABLE',
    message: 'Esta operação não está disponível na conta ou no projeto atual.',
  });

  const SESSION_MSG = 'Não foi possível validar sua sessão da Lovable. Recarregue o projeto e tente novamente.';

  async function licenseOk() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'licenseStatus' });
      return !!(res && res.active);
    } catch (e) {
      return false;
    }
  }

  const HANDLERS = {
    async projectFiles(action, ctx) {
      const r = await root.ProjectFiles.downloadAll(
        action.payload && action.payload.onProgress,
        action.payload && action.payload.signal
      );
      return result(true, 'completed', { data: r, message: `${r.fileName} · ${r.downloaded} de ${r.total} arquivos.` });
    },

    async projectContext() {
      const ctx = await root.LovableSessionContext.refresh();
      root.LovableCapabilityDetector.invalidate();
      const caps = await root.LovableCapabilityDetector.detect({ force: true });
      return result(true, 'completed', { data: { context: ctx, capabilities: caps }, message: root.LovableSessionContext.describe() });
    },

    async projectCreation(action) {
      const r = await root.ProjectCreationManager.create(action.payload || {});
      if (r.created) return result(true, 'completed', { data: r, message: 'Projeto criado.' });
      if (r.code === 'CREATION_UNAVAILABLE') {
        const fb = await root.ProjectCreationManager.fallback((action.payload || {}).initialPrompt);
        return result(false, 'unsupported', { code: r.code, message: `${r.message} ${fb}` });
      }
      return result(false, 'failed', { code: r.code, message: r.message, canRetry: !!r.canRetry });
    },

    async cloud(action, ctx) {
      const status = await root.LovableCloudManager.getStatus(ctx.projectId);
      if (action.name === 'CHECK_CLOUD') {
        return result(true, 'completed', { data: status, message: root.LovableCloudManager.describe(status) });
      }
      if (status.status === 'ready') {
        return result(true, 'completed', { data: status, message: 'O Lovable Cloud já está ativo neste projeto.' });
      }
      const r = await root.LovableCloudManager.enable(ctx.projectId, action.payload || {});
      if (r.status === 'unavailable') {
        return result(false, 'unsupported', { code: 'NATIVE_ACTION_UNAVAILABLE', message: r.message, data: r });
      }
      if (r.status === 'failed') return result(false, 'failed', { code: 'CLOUD_ENABLE_FAILED', message: r.message, canRetry: true });
      return result(true, r.status === 'ready' ? 'completed' : 'waiting', { data: r, message: r.message });
    },

    async deployment(action, ctx) {
      const created = await root.DeploymentManager.createDeployment(ctx.projectId);
      if (created.status === 'unavailable') return UNSUPPORTED();
      if (created.status === 'failed') return result(false, 'failed', { code: 'DEPLOY_FAILED', message: created.message, canRetry: true });
      const onProgress = action.payload && action.payload.onProgress;
      const final = await root.DeploymentManager.waitForDeployment(ctx.projectId, created.deploymentId, onProgress);
      if (final.status === 'completed') {
        return result(true, 'completed', { data: final, message: final.url ? `Publicado em ${final.url}` : 'Publicação concluída.' });
      }
      return result(false, 'failed', { code: 'DEPLOY_FAILED', message: final.message || 'A publicação não foi concluída.', canRetry: true });
    },

    async secrets(action, ctx) {
      const payload = action.payload || {};
      if (payload.op === 'list') {
        const r = await root.ProjectSecretsManager.list(ctx.projectId);
        if (!r.available) return UNSUPPORTED();
        return result(true, 'completed', { data: r, message: r.names.length ? r.names.map((n) => `${n} — configurada`).join('\n') : 'Nenhuma variável configurada.' });
      }
      const r = await root.ProjectSecretsManager.save(ctx.projectId, payload);
      if (!r.saved) {
        const unsupported = r.message === root.ProjectSecretsManager.UNAVAILABLE;
        return result(false, unsupported ? 'unsupported' : 'failed', {
          code: unsupported ? 'NATIVE_ACTION_UNAVAILABLE' : 'SECRET_SAVE_FAILED',
          message: r.message,
        });
      }
      return result(true, 'completed', { message: r.message });
    },

    async watermark(action, ctx) {
      const r = await root.WatermarkRemover.run();
      if (r.state === 'done') return result(true, 'completed', { data: r, message: r.message });
      if (r.state === 'unavailable') {
        return result(false, 'unsupported', { code: 'NATIVE_ACTION_UNAVAILABLE', message: 'A remoção automática da marca não está disponível para este projeto.' });
      }
      return result(false, r.state === 'license_invalid' ? 'blocked' : 'failed', { code: r.state, message: r.message, canRetry: true });
    },
  };

  const LovableNativeBridge = {
    async supports(actionName) {
      const def = root.ActionRegistry.get(actionName);
      if (!def || def.type !== 'native') return false;
      if (def.flag && !(await root.FeatureFlags.isEnabled(def.flag))) return false;
      return root.LovableCapabilityDetector.supports(actionName);
    },

    async refreshContext() {
      return root.LovableSessionContext.refresh();
    },

    async execute(action) {
      const def = root.ActionRegistry.get(action.name);
      if (!def || def.type !== 'native') return UNSUPPORTED();

      // 1. licença da SUPER LOVABLE
      if (!(await licenseOk())) {
        return result(false, 'blocked', { code: 'LICENSE_REQUIRED', message: 'Ative sua licença da SUPER LOVABLE para usar esta ferramenta.' });
      }

      // 2. contexto real da Lovable
      const ctx = await root.LovableSessionContext.refresh();
      if (!ctx.available) return result(false, 'blocked', { code: 'NO_LOVABLE_TAB', message: 'Abra o projeto em lovable.dev e tente novamente.' });
      if (!ctx.authenticated) return result(false, 'blocked', { code: 'SESSION_EXPIRED', message: SESSION_MSG });

      // 3. projeto (criação de projeto é a única que dispensa projeto aberto)
      if (!ctx.projectId && action.name !== 'CREATE_PROJECT' && action.name !== 'GET_PROJECT_CONTEXT') {
        return result(false, 'blocked', { code: 'NO_PROJECT', message: 'Abra um projeto na Lovable para usar esta ferramenta.' });
      }

      // 4. suporte real
      if (!(await LovableNativeBridge.supports(action.name))) return UNSUPPORTED();

      // 5. execução com uma única repetição em caso de 401/403
      const handler = HANDLERS[def.handler];
      if (!handler) return UNSUPPORTED();

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await handler(action, ctx);
          const authProblem = res.code === 'SESSION_EXPIRED' || res.code === 'auth_error';
          if (authProblem && attempt === 0) {
            await root.LovableSessionContext.invalidate('auth');
            await root.LovableSessionContext.refresh();
            continue;
          }
          return res;
        } catch (e) {
          const msg = e && e.message ? e.message : 'Falha inesperada.';
          if (/(401|403)/.test(msg) && attempt === 0) {
            await root.LovableSessionContext.invalidate('auth');
            await root.LovableSessionContext.refresh();
            continue;
          }
          return result(false, 'failed', { code: 'NATIVE_ACTION_FAILED', message: msg, canRetry: true });
        }
      }
      return result(false, 'failed', { code: 'SESSION_EXPIRED', message: SESSION_MSG });
    },
  };

  root.LovableNativeBridge = LovableNativeBridge;
})(typeof self !== 'undefined' ? self : globalThis);
