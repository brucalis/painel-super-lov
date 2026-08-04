// device-id.js — identificador exclusivo da instalação da SUPER LOVABLE.
// Não usa ID do projeto, MAC, IP, cookies da Lovable nem fingerprint.
(function () {
  const KEY = 'super_lovable_device_identity_v2';
  let cached = null;

  const DeviceId = {
    get value() { return cached; },
    async ensure() {
      if (cached) return cached;
      if (window.DeviceIdentityManager) {
        const identity = await window.DeviceIdentityManager.get();
        cached = identity.deviceId;
        return cached;
      }
      // Fallback
      const stored = await window.StorageManager.local.get(KEY, null);
      cached = stored && typeof stored === 'object' ? stored.deviceId : (typeof stored === 'string' ? stored : 'unknown');
      return cached;
    },
    mask(id = cached) {
      if (window.DeviceIdentityManager) return window.DeviceIdentityManager.mask(id);
      if (!id) return 'SLD-••••';
      return `SLD-${'•'.repeat(12)}${id.slice(-4)}`;
    },
  };

  window.DeviceId = DeviceId;
})();
