/* capability-detector.js — descobre o que o projeto/conta realmente permite.
 * Nunca executa uma operação destrutiva para "testar" suporte.
 */
(function (root) {
  let cache = null;

  function empty() {
    return {
      canDownload: false,
      canCreateProject: false,
      canManageCloud: false,
      canPublish: false,
      canManageSecrets: false,
      canReadProjectFiles: false,
      canWriteProjectFiles: false,
      canUploadAssets: false,
      canRemoveWatermark: false,
      checkedAt: Date.now(),
    };
  }

  const LovableCapabilityDetector = {
    get cached() { return cache ? { ...cache } : null; },

    async detect({ force = false } = {}) {
      if (cache && !force && Date.now() - cache.checkedAt < 30000) return { ...cache };

      const flags = root.FeatureFlags;
      await flags.load();
      const ctx = await root.LovableSessionContext.refresh();

      const caps = empty();
      const connected = ctx.available && ctx.authenticated && !!ctx.projectId;

      caps.canReadProjectFiles = connected && flags.get('nativeProjectFiles');
      caps.canDownload = caps.canReadProjectFiles && flags.get('nativeDownload');
      caps.canCreateProject = ctx.authenticated && flags.get('nativeProjectCreation');
      caps.canManageCloud = connected && flags.get('nativeCloud');
      caps.canPublish = connected && flags.get('nativeDeployment');
      caps.canManageSecrets = connected && flags.get('nativeSecrets');
      caps.canUploadAssets = connected;
      caps.canWriteProjectFiles = false; // alterações de código permanecem no fluxo do chat
      caps.canRemoveWatermark = connected && flags.get('nativeWatermark');
      caps.checkedAt = Date.now();

      cache = caps;
      return { ...caps };
    },

    /** Mapa entre ação registrada e capacidade correspondente. */
    capabilityFor(actionName) {
      const map = {
        DOWNLOAD_PROJECT: 'canDownload',
        GET_PROJECT_CONTEXT: null,
        CREATE_PROJECT: 'canCreateProject',
        CHECK_CLOUD: 'canManageCloud',
        ENABLE_CLOUD: 'canManageCloud',
        PUBLISH_PROJECT: 'canPublish',
        MANAGE_SECRET: 'canManageSecrets',
        REMOVE_WATERMARK: 'canRemoveWatermark',
      };
      return map[actionName] !== undefined ? map[actionName] : null;
    },

    async supports(actionName) {
      const key = LovableCapabilityDetector.capabilityFor(actionName);
      const caps = await LovableCapabilityDetector.detect();
      if (key === null) return true;
      return !!caps[key];
    },

    invalidate() { cache = null; },
  };

  root.LovableCapabilityDetector = LovableCapabilityDetector;
})(typeof self !== 'undefined' ? self : globalThis);
