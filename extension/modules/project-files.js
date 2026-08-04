// project-files.js — "Baixar projeto": recupera os arquivos reais do projeto
// aberto na Lovable usando a sessão já autenticada da extensão e monta um ZIP
// local. Nunca envia prompts pelo chat, nunca inventa arquivos e nunca inclui
// tokens, cookies ou dados internos da extensão no pacote.
(function () {
  const CONCURRENCY = 4;

  // Endpoints autenticados já usados pela própria interface da Lovable.
  const LIST_ENDPOINTS = (id) => [
    `https://api.lovable.dev/projects/${id}/files`,
    `https://api.lovable.dev/projects/${id}/source-files`,
    `https://api.lovable.dev/projects/${id}/repository/files`,
    `https://api.lovable.dev/projects/${id}/files/tree`,
  ];

  const FILE_ENDPOINT = (id, path) =>
    `https://api.lovable.dev/projects/${id}/files/content?path=${encodeURIComponent(path)}`;

  const PROJECT_ENDPOINT = (id) => `https://api.lovable.dev/projects/${id}`;

  // ---------- utilidades ----------

  /** Remove traversal, barras iniciais e nomes absolutos. */
  function safePath(raw) {
    if (typeof raw !== 'string') return null;
    let p = raw.replace(/\\/g, '/').trim();
    if (!p) return null;
    p = p.replace(/^[a-zA-Z]:\//, '');       // caminho absoluto do Windows
    p = p.replace(/^\/+/, '');                // barras iniciais
    const parts = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') { parts.pop(); continue; }
      parts.push(seg.replace(/[\u0000-\u001f]/g, ''));
    }
    const out = parts.join('/');
    return out || null;
  }

  function safeFileName(name) {
    return String(name || '')
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  function base64ToBytes(b64) {
    const clean = String(b64).replace(/\s+/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function looksBinaryEncoding(enc) {
    return /base64/i.test(String(enc || ''));
  }

  /** Aceita array, {files}, {items}, {data}, {tree} e árvores recursivas. */
  function collect(payload, basePath, acc) {
    if (!payload) return acc;
    if (Array.isArray(payload)) {
      payload.forEach((item) => collect(item, basePath, acc));
      return acc;
    }
    if (typeof payload === 'string') {
      const p = safePath(payload);
      if (p) acc.push({ path: p });
      return acc;
    }
    if (typeof payload !== 'object') return acc;

    const container =
      payload.files || payload.items || payload.tree || payload.entries || payload.children || payload.data;

    const rawPath =
      payload.path || payload.file_path || payload.filePath || payload.fullPath || payload.name || payload.filename;

    const isDir =
      payload.isDirectory === true ||
      payload.is_directory === true ||
      payload.type === 'directory' ||
      payload.type === 'dir' ||
      payload.type === 'tree';

    const here = rawPath ? safePath(basePath ? `${basePath}/${rawPath}` : rawPath) : basePath;

    if (isDir || (!rawPath && container)) {
      if (container) collect(container, here || basePath, acc);
      return acc;
    }

    if (container && !('content' in payload) && !payload.url && !payload.download_url) {
      collect(container, here || basePath, acc);
      return acc;
    }

    if (here) {
      acc.push({
        path: here,
        content: typeof payload.content === 'string' ? payload.content : undefined,
        encoding: payload.encoding || payload.content_encoding,
        url: payload.url || payload.download_url || payload.downloadUrl,
      });
    }
    return acc;
  }

  function dedupe(files) {
    const seen = new Set();
    const out = [];
    for (const f of files) {
      if (!f.path || seen.has(f.path)) continue;
      seen.add(f.path);
      out.push(f);
    }
    return out;
  }

  async function getJson(url) {
    const res = await fetch(url, {
      method: 'GET',
      headers: window.LCA.apiHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = new Error(httpMessage(res.status));
      err.status = res.status;
      throw err;
    }
    return res.json().catch(() => null);
  }

  function httpMessage(status) {
    if (status === 401 || status === 403) {
      return 'Não foi possível autenticar sua conta da Lovable. Atualize a página e tente novamente.';
    }
    if (status === 404) return 'Projeto não encontrado ou sem arquivos disponíveis.';
    if (status === 429) return 'Muitas requisições à Lovable. Aguarde alguns segundos e tente de novo.';
    return `Falha na consulta à Lovable (HTTP ${status}).`;
  }

  /** Confirma que a aba ativa é lovable.dev e devolve o projectId dela. */
  async function resolveContext() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = (tab && tab.url) || '';
    const onLovable = /^https:\/\/([a-z0-9-]+\.)*lovable\.(dev|app)\//i.test(url);
    const tabProject = window.LCA.extractProjectId(url);
    if (!onLovable || !tabProject) {
      throw new Error('Abra um projeto da Lovable antes de baixar.');
    }
    // O projeto do painel precisa ser o mesmo da aba: nada de troca silenciosa.
    if (window.LCA.projectId && window.LCA.projectId !== tabProject) {
      throw new Error('Abra um projeto da Lovable antes de baixar.');
    }
    if (!window.LCA.authToken) {
      throw new Error('Não foi possível autenticar sua conta da Lovable. Atualize a página e tente novamente.');
    }
    return { projectId: tabProject };
  }

  async function ensureLicense() {
    const res = await chrome.runtime.sendMessage({ action: 'licenseStatus' }).catch(() => null);
    if (!res || !res.active) {
      throw new Error('Licença inativa ou expirada. Ative sua licença para baixar o projeto.');
    }
  }

  async function projectName(projectId) {
    try {
      const data = await getJson(PROJECT_ENDPOINT(projectId));
      const name = data && (data.name || data.title || (data.project && data.project.name));
      return name ? safeFileName(name) : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- fluxo principal ----------

  const ProjectFiles = {
    safePath,

    async list(onProgress = () => {}, projectId = window.LCA.projectId) {
      let lastError = null;
      for (const url of LIST_ENDPOINTS(projectId)) {
        try {
          onProgress('Baixando arquivos do projeto...');
          const data = await getJson(url);
          const files = dedupe(collect(data, '', []));
          if (files.length) return files;
        } catch (e) {
          lastError = e;
          if (e.status === 401 || e.status === 403) throw e;
        }
      }
      throw lastError || new Error('Projeto sem arquivos disponíveis para download.');
    },

    async fetchContent(file, projectId) {
      if (typeof file.content === 'string') {
        return looksBinaryEncoding(file.encoding)
          ? base64ToBytes(file.content)
          : new TextEncoder().encode(file.content);
      }
      const url = file.url || FILE_ENDPOINT(projectId, file.path);
      const res = await fetch(url, {
        method: 'GET',
        headers: file.url ? undefined : window.LCA.apiHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(httpMessage(res.status));
      const type = res.headers.get('content-type') || '';
      if (/json/i.test(type)) {
        const data = await res.json().catch(() => null);
        const content = data && (typeof data === 'string' ? data : data.content ?? data.data ?? data.text);
        if (typeof content === 'string') {
          const enc = data && (data.encoding || data.content_encoding);
          return looksBinaryEncoding(enc) ? base64ToBytes(content) : new TextEncoder().encode(content);
        }
        throw new Error('Resposta inválida para o arquivo.');
      }
      // Texto ou binário: bytes crus preservam imagens e outros formatos.
      return new Uint8Array(await res.arrayBuffer());
    },

    /**
     * onProgress recebe { phase, message, done, total, failures }.
     * phases: 'validate' | 'list' | 'found' | 'download' | 'zip' | 'done'
     */
    async downloadAll(onProgress = () => {}, signal = null) {
      onProgress({ phase: 'validate', message: 'Preparando download...' });
      const { projectId } = await resolveContext();
      await ensureLicense();

      const files = await ProjectFiles.list(
        (message) => onProgress({ phase: 'list', message }),
        projectId
      );
      onProgress({ phase: 'found', total: files.length, done: 0, failures: 0 });

      const entries = new Array(files.length);
      const failures = [];
      let done = 0;
      let cursor = 0;
      let aborted = false;

      if (signal) {
        signal.addEventListener('abort', () => { aborted = true; });
      }

      async function worker() {
        while (cursor < files.length && !aborted) {
          const index = cursor++;
          const file = files[index];
          try {
            entries[index] = { path: file.path, data: await ProjectFiles.fetchContent(file, projectId) };
          } catch (e) {
            failures.push({ path: file.path, error: String(e.message || 'falha').slice(0, 120) });
          } finally {
            files[index].content = undefined; // libera memória do payload original
            done++;
            onProgress({ phase: 'download', done, total: files.length, failures: failures.length });
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, Math.max(1, files.length)) }, worker)
      );

      if (aborted) throw new Error('Download cancelado pelo usuário.');

      const packed = entries.filter(Boolean);
      if (!packed.length) throw new Error('Projeto sem arquivos disponíveis para download.');

      if (failures.length) {
        const report = [
          `SUPER LOVABLE — relatório de download`,
          `Data: ${new Date().toLocaleString('pt-BR')}`,
          `Projeto: ${String(projectId).slice(0, 8)}…`,
          `Arquivos encontrados: ${files.length}`,
          `Incluídos no ZIP: ${packed.length}`,
          `Falharam: ${failures.length}`,
          '',
          'Arquivos que não puderam ser incluídos:',
          ...failures.map((f) => `- ${f.path} (${f.error})`),
        ].join('\n');
        packed.push({ path: 'DOWNLOAD-REPORT.txt', data: new TextEncoder().encode(report) });
      }

      onProgress({ phase: 'zip', message: 'Criando arquivo ZIP...', done, total: files.length });
      let blob;
      try {
        blob = window.LocalZip.createZip(packed);
      } catch (e) {
        throw new Error('Não foi possível criar o arquivo ZIP deste projeto.');
      }

      const name = await projectName(projectId);
      const fileName = name
        ? `super-lovable-${name}.zip`
        : `lovable-project-${String(projectId).slice(0, 8)}.zip`;

      await triggerDownload(blob, fileName);
      onProgress({ phase: 'done', done, total: files.length, failures: failures.length });
      return { total: files.length, downloaded: packed.length - (failures.length ? 1 : 0), failures, fileName };
    },
  };

  async function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    try {
      if (chrome.downloads && chrome.downloads.download) {
        await new Promise((resolve, reject) => {
          chrome.downloads.download({ url, filename: fileName, saveAs: false }, (id) => {
            const err = chrome.runtime.lastError;
            if (err || id === undefined) reject(new Error('Download bloqueado pelo navegador.'));
            else resolve(id);
          });
        });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    }
  }

  window.ProjectFiles = ProjectFiles;
})();
