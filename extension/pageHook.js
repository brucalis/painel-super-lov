(function () {


let capturedToken = null;
let capturedProjectId = null;

function getProjectFromPage(){
  try{
    const m = window.location.pathname.match(/projects\/([0-9a-fA-F-]{36})/i);
    return m ? m[1] : null;
  }catch{ return null; }
}

function extractProjectIdFromUrl(url){
  try{
    const m = String(url).match(/projects\/([0-9a-fA-F-]{36})/i);
    return m ? m[1] : null;
  }catch{ return null; }
}

function notifyFound(token, projectId, force = false){
  const newProject = projectId || getProjectFromPage();
  const normalizedToken = typeof token === "string" ? token.replace(/^Bearer\s+/i, "").trim() : null;
  let changed = false;
  if(normalizedToken && normalizedToken !== capturedToken){ capturedToken = normalizedToken; changed = true; }
  if(newProject && newProject !== capturedProjectId){ capturedProjectId = newProject; changed = true; }
  if(!changed && !force) return;
  window.postMessage({ type:"lovableTokenFound", token:capturedToken, projectId:capturedProjectId },"*");
}

window.addEventListener("message", (event)=>{
  if(event.source !== window) return;
  if(!event.data) return;
  if(event.data.type === "lovableRequestToken"){
    notifyFound(capturedToken, getProjectFromPage() || capturedProjectId, true);
  }
  if(event.data.type === "TS_PAGE_UPLOAD_TO_GCS"){
    const { requestId, uploadUrl, contentType, arrayBuffer } = event.data;
    (async () => {
      try {
        const blob = new Blob([arrayBuffer], { type: contentType });
        const res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob
        });
        window.postMessage({ type: "TS_PAGE_UPLOAD_TO_GCS_RESULT", requestId, success: res.ok, status: res.status }, "*");
      } catch (err) {
        window.postMessage({ type: "TS_PAGE_UPLOAD_TO_GCS_RESULT", requestId, success: false, status: 0, error: String(err && err.message || err) }, "*");
      }
    })();
  }
});

(function wrapFetch(){
  try{
    const originalFetch = window.fetch;
    window.fetch = async function(...args){
      let reqUrl = "";
      try{
        reqUrl = typeof args[0] === "string" ? args[0] : ((args[0] && args[0].url) || "");
        let opts = args[1] || {};
        let auth = null;
        if(args[0] instanceof Request){
          reqUrl = args[0].url || reqUrl;
          auth = (args[0].headers && typeof args[0].headers.get === "function") ? (args[0].headers.get("Authorization") || args[0].headers.get("authorization")) : null;
        }
        if(opts.headers){
          if(opts.headers instanceof Headers) auth = opts.headers.get("Authorization");
          else if(typeof opts.headers === "object") auth = opts.headers.Authorization || opts.headers.authorization;
        }
        const pid = extractProjectIdFromUrl(reqUrl);
        if(auth && auth.startsWith("Bearer ")){
          const rawToken = auth.slice(7);
          notifyFound(rawToken, pid);
        }
      }catch(e){}
      return originalFetch.apply(this, args);
    };
  }catch(e){ console.warn("[QuantumHook] erro fetch",e); }
})();

(function wrapXHR(){
  try{
    const origOpen = XMLHttpRequest.prototype.open;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method,url){
      this._lovable_url = url;
      return origOpen.apply(this,arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name,value){
      if(name && name.toLowerCase()==="authorization" && value && value.startsWith("Bearer ")){
        const rawToken = value.slice(7);
        notifyFound(rawToken, extractProjectIdFromUrl(this._lovable_url));
      }
      return origSetHeader.apply(this,arguments);
    };
  }catch(e){ console.warn("[QuantumHook] erro xhr",e); }
})();

// Fix sync: ao abrir qualquer projeto no lovable.dev, lê o token direto do
// localStorage do Supabase (sem esperar um fetch ser interceptado).
// O Lovable usa Supabase e salva a sessão como `sb-<ref>-auth-token`.
//
// IMPORTANTE: só chama notifyFound (que posta mensagem para content.js) quando
// há TAMBÉM um projeto aberto na URL. Se não há projeto na URL (ex: homepage),
// apenas guarda o token em capturedToken para uso posterior — nunca posta mensagem
// com projectId=null, pois isso faria content.js APAGAR os tokens do storage.
function tryTokenFromLocalStorage(){
  try {
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if(!raw) continue;
      const parsed = JSON.parse(raw);
      // supabase v2: { access_token, ... }
      const access = parsed && (parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token));
      if(access && typeof access === "string" && access.length > 20){
        const projectId = getProjectFromPage();
        if(projectId){
          // Usuário está num projeto: notifica imediatamente (sync fica verde)
          notifyFound(access, projectId, true);
        } else {
          // Sem projeto na URL (ex: homepage): armazena só em memória.
          // O setInterval abaixo vai notificar quando o projeto for detectado.
          if(access !== capturedToken) capturedToken = access;
        }
        return true;
      }
    }
  }catch(e){}
  return false;
}

// Tenta imediatamente ao carregar e depois a cada 1.5s
tryTokenFromLocalStorage();

setInterval(()=>{
  const p = getProjectFromPage();
  const projectChanged = p && p !== capturedProjectId;
  // Se ainda não temos token, tenta localStorage
  if(!capturedToken) tryTokenFromLocalStorage();
  if(projectChanged){
    capturedProjectId = p;
    window.postMessage({ type:"lovableTokenFound", token:capturedToken, projectId:p },"*");
  }
},1500);

// Nota: o handler de lovableRequestToken já existe acima (linhas 31-36).
// NÃO duplicar aqui — o handler original já chama notifyFound com capturedToken
// que agora é preenchido por tryTokenFromLocalStorage().

})();
