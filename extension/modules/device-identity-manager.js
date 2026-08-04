/**
 * device-identity-manager.js
 * Identidade canônica e persistente do dispositivo para a SUPER LOVABLE.
 */
(function (root) {
  const DEVICE_KEYS = {
    canonical: 'super_lovable_device_identity_v2',
    legacyLicense: 'extension_device_id',
    legacyDevice: 'super_lovable_device_id',
  };

  let cached = null;

  function generateId(prefix = 'SLD-') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (prefix === 'SLD-') {
        return `SLD-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
    return hex; // 32 hex chars for legacy license ID
  }

  function getInfo() {
    const ua = (root.navigator && root.navigator.userAgent) || '';
    let browser = 'Navegador Chromium';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Brave/.test(ua)) browser = 'Brave';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';

    let os = 'Sistema desconhecido';
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Linux/.test(ua)) os = 'Linux';

    return { browser, os };
  }

  async function storageGet(key, area = 'local') {
    return new Promise((resolve) => {
      try {
        chrome.storage[area].get(key, (r) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(r && r[key] !== undefined ? r[key] : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function storageSet(obj, area = 'local') {
    return new Promise((resolve) => {
      try {
        chrome.storage[area].set(obj, () => resolve(!chrome.runtime.lastError));
      } catch (e) {
        resolve(false);
      }
    });
  }

  const DeviceIdentityManager = {
    async get() {
      if (cached) return cached;

      // 1. Tentar identidade canônica v2 no local
      let identity = await storageGet(DEVICE_KEYS.canonical, 'local');

      // 2. Tentar recuperação no sync se disponível
      if (!identity) {
        const syncIdentity = await storageGet(DEVICE_KEYS.canonical, 'sync');
        if (syncIdentity) {
          identity = {
            ...syncIdentity,
            recoveredFrom: 'sync',
            lastSeenAt: new Date().toISOString()
          };
        }
      }

      // 3. Migração de legados
      if (!identity) {
        const legacy1 = await storageGet(DEVICE_KEYS.legacyLicense, 'local');
        const legacy2 = await storageGet(DEVICE_KEYS.legacyDevice, 'local');

        if (legacy1 || legacy2) {
          const { browser, os } = getInfo();
          identity = {
            schemaVersion: 2,
            installationId: crypto.randomUUID(),
            deviceId: legacy1 || (legacy2 && legacy2.startsWith('SLD-') ? legacy2.replace(/SLD-|-/g, '').toLowerCase() : generateId('')),
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            browserName: browser,
            operatingSystem: os,
            migrated: true
          };
          // Se o legado era SLD, manter o formato original no deviceId se possível ou normalizar
          if (legacy2 && legacy2.startsWith('SLD-')) {
              identity.deviceId = legacy2;
          }
        }
      }

      // 4. Criação nova
      if (!identity) {
        const { browser, os } = getInfo();
        identity = {
          schemaVersion: 2,
          installationId: crypto.randomUUID(),
          deviceId: generateId('SLD-'),
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          browserName: browser,
          operatingSystem: os
        };
      }

      cached = identity;
      await this.save(identity);
      return identity;
    },

    async save(identity) {
      cached = identity;
      // Salvar no local
      await storageSet({ [DEVICE_KEYS.canonical]: identity }, 'local');

      // Cópia mínima no sync (sem dados sensíveis)
      const syncData = {
        schemaVersion: identity.schemaVersion,
        installationId: identity.installationId,
        deviceId: identity.deviceId,
        createdAt: identity.createdAt
      };
      await storageSet({ [DEVICE_KEYS.canonical]: syncData }, 'sync');
    },

    async ensure(details = {}) {
        const identity = await this.get();
        if (details.reason === 'update') {
            // Apenas garantir que está salvo corretamente
            await this.save(identity);
        }
        return identity;
    },

    mask(id) {
      if (!id) return 'SLD-••••';
      return `SLD-${'•'.repeat(12)}${id.slice(-4)}`;
    }
  };

  root.DeviceIdentityManager = DeviceIdentityManager;
})(typeof self !== 'undefined' ? self : globalThis);
