// device-id.js — identificador exclusivo da instalação da SUPER LOVABLE.
// Não usa ID do projeto, MAC, IP, cookies da Lovable nem fingerprint.
(function () {
  const KEY = 'super_lovable_device_id';
  let cached = null;

  function generate() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `SLD-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  const DeviceId = {
    get value() { return cached; },
    async ensure() {
      if (cached) return cached;
      const stored = await window.StorageManager.local.get(KEY, null);
      cached = typeof stored === 'string' && stored.startsWith('SLD-') ? stored : generate();
      if (cached !== stored) await window.StorageManager.local.set(KEY, cached);
      return cached;
    },
    mask(id = cached) {
      if (!id) return 'SLD-••••';
      return `SLD-${'•'.repeat(12)}${id.slice(-4)}`;
    },
  };

  window.DeviceId = DeviceId;
})();
