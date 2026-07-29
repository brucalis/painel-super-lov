// notification-manager.js — sons locais (WebAudio) e notificações do Chrome
(function () {
  let ctx = null;
  function tone(freqs, dur = 0.12, gain = 0.05) {
    if (!window.SettingsManager?.get('sounds')) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      let t = ctx.currentTime;
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
        t += dur;
      });
    } catch (e) {
      console.warn('sound', e);
    }
  }

  const SOUNDS = {
    sendStart: () => tone([620]),
    sendDone: () => tone([660, 880]),
    error: () => tone([300, 200], 0.18),
    uploadDone: () => tone([760]),
    queueDone: () => tone([660, 780, 980]),
    actionNeeded: () => tone([500, 500]),
  };

  async function ensurePermission() {
    if (!window.SettingsManager?.get('notifications')) return false;
    if (!chrome.permissions) return !!chrome.notifications;
    try {
      const has = await chrome.permissions.contains({ permissions: ['notifications'] });
      if (has) return true;
      return await chrome.permissions.request({ permissions: ['notifications'] });
    } catch (e) {
      return !!chrome.notifications;
    }
  }

  const NotificationManager = {
    play(name) { SOUNDS[name]?.(); },
    async notify(title, message) {
      try {
        const ok = await ensurePermission();
        if (!ok || !chrome.notifications) return false;
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon.png'),
          title,
          message: String(message || '').slice(0, 300),
        });
        return true;
      } catch (e) {
        console.warn('notify', e);
        return false;
      }
    },
    async mute() { await window.SettingsManager.set({ sounds: false }); },
    async unmute() { await window.SettingsManager.set({ sounds: true }); },
  };

  window.NotificationManager = NotificationManager;
})();
