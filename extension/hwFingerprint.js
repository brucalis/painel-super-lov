async function generateHardwareFingerprint() {
  const components = [];

  // 1. Screen properties (stable across browsers)
  try {
    components.push(
      "screen:" + screen.width + "x" + screen.height,
      "depth:" + screen.colorDepth,
      "pixelRatio:" + window.devicePixelRatio
    );
  } catch(e) {}

  // 2. Platform & CPU info (excludes User-Agent version)
  try {
    components.push("platform:" + navigator.platform);
    components.push("cores:" + (navigator.hardwareConcurrency || "unknown"));
    components.push("memory:" + (navigator.deviceMemory || "unknown"));
    components.push("maxTouchPoints:" + (navigator.maxTouchPoints || 0));
    // Language list is OS-level, stable across browsers
    components.push("langs:" + (navigator.languages || [navigator.language]).join(","));
  } catch(e) {}

  // 3. Timezone (OS-level setting)
  try {
    components.push("tz:" + Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch(e) {}

  // 4. WebGL renderer (GPU info - very stable)
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        components.push("gpu:" + gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
        components.push("gpuVendor:" + gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
      }
      components.push("glVersion:" + gl.getParameter(gl.VERSION));
      // Max texture size is hardware-dependent
      components.push("maxTexture:" + gl.getParameter(gl.MAX_TEXTURE_SIZE));
      components.push("maxViewport:" + gl.getParameter(gl.MAX_VIEWPORT_DIMS).join(","));
    }
  } catch(e) {}

  // 5. Canvas fingerprint (rendering differences per GPU/OS)
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("QLFingerprint", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("QLFingerprint", 4, 17);
      components.push("canvas:" + canvas.toDataURL().substring(0, 100));
    }
  } catch(e) {}

  // 6. Audio context fingerprint (hardware audio stack)
  try {
    const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
    const oscillator = audioCtx.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
    compressor.knee.setValueAtTime(40, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
    oscillator.connect(compressor);
    compressor.connect(audioCtx.destination);
    oscillator.start(0);

    const audioBuffer = await new Promise((resolve, reject) => {
      audioCtx.startRendering().then(resolve).catch(reject);
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    const audioData = audioBuffer.getChannelData(0);
    let audioHash = 0;
    for (let i = 4500; i < 5000; i++) {
      audioHash += Math.abs(audioData[i]);
    }
    components.push("audio:" + audioHash.toFixed(6));
  } catch(e) {}

  // 7. Available fonts detection (OS-level)
  try {
    const testFonts = [
      "monospace", "sans-serif", "serif",
      "Courier New", "Georgia", "Helvetica", "Times New Roman",
      "Trebuchet MS", "Verdana", "Impact", "Comic Sans MS",
      "Segoe UI", "Tahoma", "Calibri", "Consolas",
      "Lucida Console", "Palatino Linotype"
    ];
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const baseWidths = {};
      const baseFonts = ["monospace", "sans-serif", "serif"];
      const testStr = "mmmmmmmmmmlli";

      baseFonts.forEach(bf => {
        ctx.font = "72px " + bf;
        baseWidths[bf] = ctx.measureText(testStr).width;
      });

      const detected = [];
      testFonts.forEach(font => {
        let found = false;
        baseFonts.forEach(bf => {
          ctx.font = "72px '" + font + "'," + bf;
          if (ctx.measureText(testStr).width !== baseWidths[bf]) found = true;
        });
        if (found) detected.push(font);
      });
      components.push("fonts:" + detected.join("|"));
    }
  } catch(e) {}

  // Generate SHA-256 hash of all components
  const raw = components.join("||");
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

// Cache the fingerprint to avoid recalculation
let _cachedFingerprint = null;
let _cachedInstallationId = null;

function qlCookieGet(details) {
  return new Promise((resolve) => {
    try { chrome.cookies.get(details, (cookie) => resolve(cookie || null)); }
    catch (_) { resolve(null); }
  });
}

function qlCookieSet(details) {
  return new Promise((resolve) => {
    try { chrome.cookies.set(details, (cookie) => resolve(cookie || null)); }
    catch (_) { resolve(null); }
  });
}

// Persiste fora do armazenamento da extensão. O cookie pertence ao perfil do
// navegador e sobrevive à remoção/reinstalação, mas não é compartilhado com
// outro perfil do Chrome nem com outro computador.
async function getBrowserInstallationId() {
  if (_cachedInstallationId) return _cachedInstallationId;
  const cookieName = "superlovable_browser_id";
  const existing = await qlCookieGet({ url: "https://lovable.dev/", name: cookieName });
  if (existing && existing.value) {
    _cachedInstallationId = existing.value;
    return _cachedInstallationId;
  }
  const value = crypto.randomUUID();
  const saved = await qlCookieSet({
    url: "https://lovable.dev/",
    name: cookieName,
    value,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    expirationDate: Math.floor(Date.now() / 1000) + (400 * 24 * 60 * 60),
  });
  _cachedInstallationId = (saved && saved.value) || value;
  return _cachedInstallationId;
}

function qlStorageGet(area, keys) {
  return new Promise((resolve) => {
    try { area.get(keys, (value) => resolve(value || {})); }
    catch (_) { resolve({}); }
  });
}

function qlStorageSet(area, value) {
  return new Promise((resolve) => {
    try { area.set(value, () => resolve()); }
    catch (_) { resolve(); }
  });
}

function qlPageBindingGet() {
  try {
    const raw = window.localStorage.getItem("superlovable_browser_binding_v2");
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function qlPageBindingSet(binding) {
  try { window.localStorage.setItem("superlovable_browser_binding_v2", JSON.stringify(binding)); }
  catch (_) {}
}

async function qlHash(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getHardwareFingerprint() {
  if (_cachedFingerprint) return _cachedFingerprint;

  // A identidade primária é o perfil persistente do navegador. Ela resolve o
  // caso de atualização/reinstalação sem misturar perfis diferentes.
  const installationId = await getBrowserInstallationId();
  if (installationId) {
    _cachedFingerprint = await qlHash("superlovable-browser|" + installationId);
    await qlStorageSet(chrome.storage.local, { ql_bound_device_id: _cachedFingerprint });
    return _cachedFingerprint;
  }

  const local = await qlStorageGet(chrome.storage.local, [
    "ql_hw_fingerprint", "ql_bound_device_id", "ql_session_id"
  ]);
  let hardwareId = local.ql_hw_fingerprint;
  if (!hardwareId) {
    try { hardwareId = await generateHardwareFingerprint(); }
    catch (_) { hardwareId = crypto.randomUUID(); }
    await qlStorageSet(chrome.storage.local, { ql_hw_fingerprint: hardwareId });
  }

  const syncArea = chrome.storage.sync || chrome.storage.local;
  const synced = await qlStorageGet(syncArea, ["ql_browser_binding"]);
  // O vínculo no domínio da Lovable sobrevive à remoção/reinstalação da
  // extensão, inclusive quando o ID da extensão descompactada muda.
  const pageBinding = qlPageBindingGet();
  const binding = pageBinding || synced.ql_browser_binding || null;

  // Compatibilidade: instalações que já estavam licenciadas mantêm o ID antigo
  // e o registram no Chrome Sync antes de qualquer mudança de algoritmo.
  if (local.ql_session_id && !local.ql_bound_device_id && !binding) {
    const legacy = String(hardwareId);
    const legacyBinding = { hardware_id: hardwareId, device_id: legacy, version: 1 };
    await qlStorageSet(chrome.storage.local, { ql_bound_device_id: legacy });
    await qlStorageSet(syncArea, { ql_browser_binding: legacyBinding });
    qlPageBindingSet(legacyBinding);
    _cachedFingerprint = legacy;
    return legacy;
  }

  // Reinstalação/atualização no mesmo perfil e computador recupera o
  // mesmo ID. Em outro computador, o hardware não confere; em outro perfil do
  // Chrome, o espaço de chrome.storage.sync é diferente.
  if (binding && binding.hardware_id === hardwareId && binding.device_id) {
    _cachedFingerprint = String(binding.device_id);
    await qlStorageSet(chrome.storage.local, { ql_bound_device_id: _cachedFingerprint });
    await qlStorageSet(syncArea, { ql_browser_binding: binding });
    qlPageBindingSet(binding);
    return _cachedFingerprint;
  }

  const profileId = crypto.randomUUID();
  const deviceId = await qlHash("superlovable|" + hardwareId + "|" + profileId);
  const newBinding = { hardware_id: hardwareId, profile_id: profileId, device_id: deviceId, version: 2 };
  await qlStorageSet(chrome.storage.local, { ql_bound_device_id: deviceId });
  await qlStorageSet(syncArea, { ql_browser_binding: newBinding });
  qlPageBindingSet(newBinding);
  _cachedFingerprint = deviceId;
  return deviceId;
}
