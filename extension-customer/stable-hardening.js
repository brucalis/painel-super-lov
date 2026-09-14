// Super Lovable 1.0 Stable — hardening final da edição comercial.
(() => {
  if (globalThis.__superLovableStableHardeningLoaded) return;
  globalThis.__superLovableStableHardeningLoaded = true;
  if (globalThis.SUPER_LOVABLE_EDITION?.mode !== "customer") return;

  const API = "https://painel-super-lov.lovable.app/api/public/agent";
  const EXECUTION_RE = /\/api\/public\/agent\/(decompose|plan|commit)(?:[/?#]|$)/i;
  const STATUS_RE = /\/api\/public\/agent\/status(?:[/?#]|$)/i;
  const STATE_KEY = "sl_stable_execution_state_v1";
  const TRACE_KEY = "sl_stable_diagnostics_v1";
  const BATCH_KEY = "sl_agent_batch_task_v1";
  const PREFLIGHT_TTL_MS = 12_000;
  const LOCK_TTL_MS = 20 * 60_000;
  const RECOVERY_MAX_AGE_MS = 20 * 60_000;
  const MAX_TRACE = 40;

  const upstreamFetch = globalThis.fetch.bind(globalThis);
  let preflightCache = null;
  let preflightAt = 0;
  let rootLock = null;
  const inflight = new Map();

  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (value) => new Promise((resolve) => chrome.storage.local.set(value, resolve));
  const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

  function short(value) {
    return value ? String(value).slice(0, 12) : "";
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function bodyJson(init) {
    try { return JSON.parse(String(init?.body || "{}")); } catch { return {}; }
  }

  function syntheticError(message, code = "PRECHECK_FAILED", status = 422) {
    return new Response(JSON.stringify({ ok: false, error: message, code, retryable: false }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  async function pushTrace(entry) {
    try {
      const data = await storageGet([TRACE_KEY]);
      const list = Array.isArray(data[TRACE_KEY]) ? data[TRACE_KEY] : [];
      list.push({ ts: Date.now(), ...entry });
      await storageSet({ [TRACE_KEY]: list.slice(-MAX_TRACE) });
    } catch {}
  }

  async function authHeaders() {
    const data = await storageGet(["ql_session_id"]);
    if (!data.ql_session_id) return null;
    return {
      Authorization: `Bearer ${data.ql_session_id}`,
      "Content-Type": "application/json",
      "X-Super-Lovable-Edition": "customer-s1",
    };
  }

  async function fetchRealStatus(force = false) {
    if (!force && preflightCache && Date.now() - preflightAt < PREFLIGHT_TTL_MS) return preflightCache;
    const headers = await authHeaders();
    if (!headers) {
      preflightCache = { ok: false, reason: "license" };
      preflightAt = Date.now();
      return preflightCache;
    }
    try {
      const response = await upstreamFetch(`${API}/status`, { headers });
      const data = await response.clone().json().catch(() => ({}));
      const connection = data.connection || {};
      const ai = data.ai || {};
      const anyAi = Boolean(ai.mistral?.configured || ai.gemini?.configured || ai.cloudflare?.configured);
      preflightCache = {
        ok: response.ok && data?.ok !== false && anyAi && Boolean(connection.installation_id) && Boolean(connection.repository_full_name),
        responseOk: response.ok && data?.ok !== false,
        anyAi,
        github: Boolean(connection.installation_id),
        project: Boolean(connection.repository_full_name),
        data,
      };
      preflightAt = Date.now();
      return preflightCache;
    } catch {
      preflightCache = { ok: false, reason: "network" };
      preflightAt = Date.now();
      return preflightCache;
    }
  }

  function preflightMessage(check) {
    if (check?.reason === "license") return "Valide sua chave de ativação novamente.";
    if (check?.reason === "network") return "Não foi possível confirmar as conexões agora. Tente novamente em instantes.";
    if (check && !check.responseOk) return check.data?.error || "Não foi possível validar sua licença e conexões.";
    if (check && !check.anyAi) return "Conecte pelo menos uma IA: Mistral, Gemini ou Cloudflare.";
    if (check && !check.github) return "Conecte sua conta do GitHub antes de executar a alteração.";
    if (check && !check.project) return "Abra ou selecione o projeto conectado ao GitHub antes de executar a alteração.";
    return "Não foi possível iniciar a alteração com segurança.";
  }

  async function saveExecutionState(patch) {
    try {
      const current = (await storageGet([STATE_KEY]))[STATE_KEY] || {};
      await storageSet({ [STATE_KEY]: { ...current, ...patch, updatedAt: Date.now() } });
    } catch {}
  }

  async function batchIsActive() {
    try {
      const batch = (await storageGet([BATCH_KEY]))[BATCH_KEY];
      return Boolean(batch && !["completed", "failed", "cancelled"].includes(String(batch.status || "")));
    } catch {
      return false;
    }
  }

  function setStatus(message, kind = "warning") {
    const el = document.getElementById("sl-agent-status");
    if (!el) return false;
    el.textContent = message;
    el.dataset.kind = kind;
    return true;
  }

  function rootPromptHashFromBody(body) {
    return body?.prompt ? hashText(String(body.prompt).trim()) : "";
  }

  function requestSignature(kind, body) {
    const raw = kind === "commit" ? String(body?.run_id || "") : String(body?.prompt || "");
    return `${kind}:${hashText(raw)}`;
  }

  function rootLockActiveFor(hash) {
    if (!rootLock || !hash) return false;
    if (Date.now() - rootLock.at > LOCK_TTL_MS) {
      rootLock = null;
      return false;
    }
    return rootLock.hash === hash;
  }

  async function maybeClearRootLock() {
    setTimeout(async () => {
      if (!(await batchIsActive())) rootLock = null;
    }, 1800);
  }

  async function recoverSimpleExecution() {
    try {
      if (await batchIsActive()) return;
      const state = (await storageGet([STATE_KEY]))[STATE_KEY];
      if (!state?.active) return;
      if (!state.updatedAt || Date.now() - Number(state.updatedAt) > RECOVERY_MAX_AGE_MS) {
        await storageRemove([STATE_KEY]);
        return;
      }

      const show = (message, kind = "warning") => {
        if (setStatus(message, kind)) return;
        let attempts = 0;
        const timer = setInterval(() => {
          attempts += 1;
          if (setStatus(message, kind) || attempts > 12) clearInterval(timer);
        }, 300);
      };

      if (!state.runId) {
        show("Uma execução anterior foi interrompida antes do planejamento. Reenvie o comando; nenhuma alteração será reaplicada automaticamente.");
        await saveExecutionState({ active: false, recovered: true });
        return;
      }

      const headers = await authHeaders();
      if (!headers) return;
      const response = await upstreamFetch(`${API}/history?limit=50`, { headers });
      const data = await response.json().catch(() => ({}));
      const history = Array.isArray(data.history) ? data.history : [];
      const found = history.find((item) => String(item?.id || item?.runId || "") === String(state.runId));
      if (found?.commitSha) {
        show(`A execução anterior já foi concluída. Commit ${String(found.commitSha).slice(0, 7)} aplicado na main.`, "success");
        await saveExecutionState({ active: false, recovered: true, commitSha: short(found.commitSha) });
      } else {
        show("Uma execução anterior foi interrompida. Reenvie o comando para continuar com segurança; nenhum commit será repetido automaticamente.");
        await saveExecutionState({ active: false, recovered: true });
      }
    } catch {
      // Recuperação é conservadora: nunca reaplica automaticamente uma tarefa simples.
    }
  }

  function isLegacyAgentStatusCall() {
    const stack = String(new Error().stack || "");
    return /github-agent-panel\.js/i.test(stack);
  }

  async function compatibilityStatusResponse(response) {
    if (!response.ok || !isLegacyAgentStatusCall()) return response;
    try {
      const data = await response.clone().json();
      const ai = data.ai || {};
      const anyAi = Boolean(ai.mistral?.configured || ai.gemini?.configured || ai.cloudflare?.configured);
      if (!anyAi) return response;
      // Compatibilidade somente para o agente legado interno, que ainda usa
      // cloudflareReady como sentinela. As telas de configuração continuam
      // recebendo o estado real das três IAs.
      data.configured = true;
      data.ai = {
        ...ai,
        cloudflare: { ...(ai.cloudflare || {}), configured: true, compatibilitySentinel: true },
      };
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : String(input?.url || "");

    if (STATUS_RE.test(url)) {
      const response = await upstreamFetch(input, init);
      return compatibilityStatusResponse(response);
    }

    const match = url.match(EXECUTION_RE);
    if (!match) return upstreamFetch(input, init);

    const kind = match[1];
    const body = bodyJson(init);
    const signature = requestSignature(kind, body);
    const startedAt = performance.now();

    const check = await fetchRealStatus();
    if (!check.ok) {
      rootLock = null;
      const message = preflightMessage(check);
      await pushTrace({ path: kind, durationMs: Math.round(performance.now() - startedAt), ok: false, code: "PRECHECK_FAILED" });
      return syntheticError(message);
    }

    if (inflight.has(signature)) {
      await pushTrace({ path: kind, durationMs: 0, ok: false, code: "DUPLICATE_REQUEST_BLOCKED" });
      return syntheticError("Esta solicitação já está em processamento.", "DUPLICATE_REQUEST_BLOCKED", 409);
    }

    if (kind === "decompose") {
      const promptHash = rootPromptHashFromBody(body);
      if (rootLockActiveFor(promptHash) && !(await batchIsActive())) {
        return syntheticError("Este comando já está em processamento.", "DUPLICATE_EXECUTION", 409);
      }
      if (promptHash && !(await batchIsActive())) rootLock = { hash: promptHash, at: Date.now() };
      await saveExecutionState({ active: true, stage: "decompose", startedAt: Date.now(), runId: "", provider: "" });
    } else if (kind === "plan") {
      await saveExecutionState({ active: true, stage: "plan" });
    } else if (kind === "commit") {
      await saveExecutionState({ active: true, stage: "commit", runId: String(body.run_id || "") });
    }

    inflight.set(signature, Date.now());
    try {
      const response = await upstreamFetch(input, init);
      const data = await response.clone().json().catch(() => ({}));
      const ok = response.ok && data?.ok !== false;
      const provider = String(data?.provider || data?.aiProvider || "");
      const runId = String(data?.runId || body?.run_id || "");
      const commitSha = String(data?.commitSha || data?.commit_sha || "");

      await pushTrace({
        path: kind,
        durationMs: Math.round(performance.now() - startedAt),
        ok,
        httpStatus: response.status,
        code: ok ? "OK" : String(data?.code || `HTTP_${response.status}`),
        provider: provider || undefined,
        runId: short(runId) || undefined,
        commitSha: short(commitSha) || undefined,
      });

      if (kind === "plan" && ok) {
        await saveExecutionState({ active: true, stage: "planned", runId, provider });
      }
      if (kind === "commit") {
        if (ok) {
          await saveExecutionState({ active: false, stage: "completed", runId, provider, commitSha: short(commitSha) });
          await maybeClearRootLock();
        } else {
          await saveExecutionState({ active: false, stage: "failed", runId });
          setTimeout(() => { rootLock = null; }, 2500);
        }
      }
      return response;
    } catch (error) {
      await pushTrace({
        path: kind,
        durationMs: Math.round(performance.now() - startedAt),
        ok: false,
        code: String(error?.name || "FETCH_ERROR"),
      });
      await saveExecutionState({ active: false, stage: "interrupted" });
      setTimeout(() => { rootLock = null; }, 2500);
      throw error;
    } finally {
      inflight.delete(signature);
    }
  };

  // Bloqueia duplo clique no botão próprio antes do listener de captura do agente.
  globalThis.addEventListener("click", (event) => {
    const button = event.target?.closest?.("#sp-send");
    if (!button) return;
    const prompt = String(document.getElementById("sp-msg")?.value || "").trim();
    const hash = hashText(prompt);
    if (rootLockActiveFor(hash) || globalThis.superLovableExecutionIsActive?.()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setStatus("Este comando já está em processamento.", "warning");
    }
  }, true);

  // O envio vindo do chat da Lovable usa esta função global; protegemos o mesmo fluxo.
  const nativeExecute = globalThis.superLovableGithubAgentExecute;
  if (typeof nativeExecute === "function") {
    globalThis.superLovableGithubAgentExecute = (prompt) => {
      const normalized = String(prompt || "").trim();
      const hash = hashText(normalized);
      if (rootLockActiveFor(hash) || globalThis.superLovableExecutionIsActive?.()) {
        setStatus("Este comando já está em processamento.", "warning");
        return true;
      }
      return nativeExecute(normalized);
    };
  }

  // Corrige apenas mensagens legadas visíveis, sem observar a página inteira.
  const fixLegacyCopy = () => {
    const status = document.getElementById("sl-agent-status");
    if (status && /Conecte a Cloudflare para liberar o chat/i.test(status.textContent || "")) {
      status.textContent = "Conecte pelo menos uma IA: Mistral, Gemini ou Cloudflare.";
    }
    const progress = document.getElementById("sl-agent-progress");
    if (progress?.textContent?.includes("OpenRouter")) {
      progress.querySelectorAll("small").forEach((el) => {
        if (/Cloudflare em uso; Gemini e OpenRouter/i.test(el.textContent || "")) {
          el.textContent = "Mistral, Gemini e Cloudflare serão usados automaticamente conforme a tarefa…";
        }
      });
    }
  };

  let copyTimer = setInterval(() => {
    fixLegacyCopy();
    if (!globalThis.superLovableExecutionIsActive?.()) return;
  }, 900);
  window.addEventListener("unload", () => clearInterval(copyTimer), { once: true });

  globalThis.superLovableStableDiagnosticsKey = TRACE_KEY;
  void recoverSimpleExecution();
})();
