/* lovable-sender.js — envio no service worker usando EXATAMENTE o mesmo
 * fluxo já validado no popup: mesmos cabeçalhos, mesmos IDs, mesmo payload,
 * mesmo endpoint e o mesmo intent. Nada aqui foi reinventado: é a cópia fiel
 * do envio original, disponível também com o popup fechado.
 */
(function (root) {
  const GIT_SHA = '04b3668677038d15039de65e27688c38ab80e9ab';
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
  const LOV_PLATFORM =
    '{"platform":"web","version":"96d78a825f60be3df0ab1bd832c8f511eb4b5775"}';

  function generateRandomId(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }

  function generateRandomHex(bytes) {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function generateMessageId() {
    const r = generateRandomHex(3);
    const r2 = generateRandomHex(2);
    return {
      userMessageId: `umsg_01ktevtptd${r2}s0d2${r}x8cq70a${generateRandomId(4)}`,
      aiMessageId: `aimsg_01ktevtpvh${r}7n2rj62vz7`,
    };
  }

  async function getSession() {
    const cookies = await chrome.cookies.getAll({ domain: 'lovable.dev' });
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const session = cookies.find((c) => c.name === 'lovable-session-id-v2');
    const sbToken = cookies.find((c) => c.name === 'sb-access-token');
    const authToken = (sbToken && sbToken.value) || (session && session.value) || null;
    const stored = await chrome.storage.local.get('browserSessionId');
    let browserSessionId = stored.browserSessionId;
    if (!browserSessionId) {
      browserSessionId = crypto.randomUUID();
      await chrome.storage.local.set({ browserSessionId });
    }
    return { cookieString, authToken, browserSessionId };
  }

  function apiHeaders({ authToken, cookieString, browserSessionId }) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      'User-Agent': UA,
      Origin: 'https://lovable.dev',
      Referer: 'https://lovable.dev/',
      Cookie: cookieString,
      'x-client-git-sha': GIT_SHA,
      'x-browser-session-id': browserSessionId,
      'x-lov-platform': LOV_PLATFORM,
    };
  }

  /**
   * @param {{projectId:string, text:string, files?:Array<{url:string,name:string,type:string}>}} data
   */
  async function sendPrompt({ projectId, text, files = [] }) {
    if (!projectId) throw new Error('Nenhum projeto identificado.');
    const session = await getSession();
    if (!session.authToken) throw new Error('Sessão da Lovable não encontrada. Faça login em lovable.dev.');

    const ids = generateMessageId();
    const messageBody = {
      id: ids.userMessageId,
      message: text || '',
      files,
      selected_elements: [],
      chat_only: false,
      optimisticImageUrls: files.map((f) => f.url),
      intent: 'fix_error',
      message_intent_metadata: {
        fix_error_metadata: {
          errors: [
            {
              error_type: 'build',
              error_message: '',
              build_event_id: 'main:agent#00000000000123#bld:ZDP4ZE3D',
            },
          ],
        },
      },
      contains_error: true,
      error_ids: ['main:agent#00000000000123#bld:ZDP4ZE3D'],
      ai_message_id: ids.aiMessageId,
      thread_id: 'main',
      current_page: '/',
      current_viewport_width: 1465,
      current_viewport_height: 408,
      current_viewport_dpr: 0.8999999761581421,
      view: 'preview',
      view_description: 'The user is currently viewing the preview.',
      model: null,
      network_requests: [],
      runtime_errors: [],
      integration_metadata: {
        browser: {
          preview_viewport_width: 1465,
          preview_viewport_height: 408,
          is_logged_out: true,
        },
      },
    };

    const response = await fetch(`https://api.lovable.dev/projects/${projectId}/chat`, {
      method: 'POST',
      headers: apiHeaders(session),
      credentials: 'include',
      body: JSON.stringify(messageBody),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Chat falhou: ${response.status} ${raw.slice(0, 160)}`);
    return { ok: true, raw: raw.slice(0, 2000), userMessageId: ids.userMessageId };
  }

  root.LovableSender = { sendPrompt, getSession, generateMessageId };
})(typeof self !== 'undefined' ? self : globalThis);
