// project-files.js — tenta listar e baixar os arquivos do projeto usando a
// sessão já autenticada. Nunca inventa arquivos nem gera ZIP vazio "de sucesso".
(function () {
  const CANDIDATE_LIST_ENDPOINTS = (id) => [
    `https://api.lovable.dev/projects/${id}/files`,
    `https://api.lovable.dev/projects/${id}/source-files`,
    `https://api.lovable.dev/projects/${id}/repository/files`,
  ];

  function normalize(payload) {
    const arr = Array.isArray(payload)
      ? payload
      : payload?.files || payload?.items || payload?.data || null;
    if (!Array.isArray(arr)) return null;
    return arr
      .map((f) => (typeof f === 'string' ? { path: f } : {
        path: f.path || f.name || f.file_path || f.filename,
        content: typeof f.content === 'string' ? f.content : undefined,
        url: f.url || f.download_url,
      }))
      .filter((f) => f.path);
  }

  const ProjectFiles = {
    async list(onProgress = () => {}) {
      const LCA = window.LCA;
      if (!LCA.projectId) throw new Error(window.I18n.t('err_project'));
      if (!LCA.authToken) throw new Error(window.I18n.t('err_session'));
      let lastStatus = null;
      for (const url of CANDIDATE_LIST_ENDPOINTS(LCA.projectId)) {
        try {
          onProgress(`Consultando ${url.split('/').slice(-1)[0]}…`);
          const res = await fetch(url, { method: 'GET', headers: LCA.apiHeaders(), credentials: 'include' });
          lastStatus = res.status;
          if (!res.ok) continue;
          const data = await res.json().catch(() => null);
          const files = normalize(data);
          if (files && files.length) return files;
        } catch (e) {
          console.warn('list files', url, e);
        }
      }
      throw new Error(`${window.I18n.t('files_unavailable')}${lastStatus ? ` (HTTP ${lastStatus})` : ''}`);
    },

    async downloadAll(onProgress = () => {}) {
      const files = await ProjectFiles.list((m) => onProgress({ phase: 'list', message: m }));
      onProgress({ phase: 'found', total: files.length });
      const enc = new TextEncoder();
      const entries = [];
      const failures = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          let bytes;
          if (typeof f.content === 'string') bytes = enc.encode(f.content);
          else if (f.url) {
            const res = await fetch(f.url, { credentials: 'include' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            bytes = new Uint8Array(await res.arrayBuffer());
          } else throw new Error('sem conteúdo nem URL');
          entries.push({ path: f.path, data: bytes });
        } catch (e) {
          failures.push({ path: f.path, error: e.message });
        }
        onProgress({ phase: 'download', done: i + 1, total: files.length, failures: failures.length });
      }
      if (!entries.length) throw new Error(window.I18n.t('files_unavailable'));
      const blob = window.LocalZip.createZip(entries);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lovable-${window.LCA.projectId}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return { total: files.length, downloaded: entries.length, failures };
    },
  };

  window.ProjectFiles = ProjectFiles;
})();
