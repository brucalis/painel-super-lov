const STORAGE_KEY = 'slv2_project_memories';
const MAX_DECISIONS = 60;
const MAX_FILES = 40;

function readStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[STORAGE_KEY] || {});
    });
  });
}

function writeStorage(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    });
  });
}

function keyFor(repository, branch) {
  if (!repository || !branch) throw new Error('Repositório e branch são obrigatórios para a memória do projeto.');
  return `${repository}::${branch}`;
}

function cleanText(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function cleanList(value, maxItems = 30) {
  const items = Array.isArray(value) ? value : String(value || '').split(/\n|,/g);
  return [...new Set(items.map((item) => cleanText(item, 300)).filter(Boolean))].slice(0, maxItems);
}

function emptyMemory(repository, branch) {
  return {
    repository,
    branch,
    brand: {
      name: '',
      visualIdentity: '',
      colors: [],
      typography: '',
      imagery: ''
    },
    audience: '',
    communicationTone: '',
    productGoal: '',
    technologies: [],
    permanentRules: [],
    restrictions: [],
    connectedIntegrations: [],
    importantFiles: [],
    decisions: [],
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalize(memory, repository, branch) {
  const base = emptyMemory(repository, branch);
  const source = memory || {};
  return {
    ...base,
    ...source,
    repository,
    branch,
    brand: {
      ...base.brand,
      ...(source.brand || {}),
      name: cleanText(source.brand?.name, 200),
      visualIdentity: cleanText(source.brand?.visualIdentity),
      colors: cleanList(source.brand?.colors, 20),
      typography: cleanText(source.brand?.typography, 1000),
      imagery: cleanText(source.brand?.imagery, 1500)
    },
    audience: cleanText(source.audience),
    communicationTone: cleanText(source.communicationTone, 2000),
    productGoal: cleanText(source.productGoal),
    technologies: cleanList(source.technologies, 40),
    permanentRules: cleanList(source.permanentRules, 60),
    restrictions: cleanList(source.restrictions, 60),
    connectedIntegrations: cleanList(source.connectedIntegrations, 40),
    importantFiles: cleanList(source.importantFiles, MAX_FILES),
    decisions: Array.isArray(source.decisions) ? source.decisions.slice(0, MAX_DECISIONS) : [],
    notes: cleanText(source.notes, 6000),
    updatedAt: source.updatedAt || new Date().toISOString()
  };
}

export async function getProjectMemory(repository, branch) {
  const all = await readStorage();
  return normalize(all[keyFor(repository, branch)], repository, branch);
}

export async function saveProjectMemory(repository, branch, patch = {}) {
  const all = await readStorage();
  const key = keyFor(repository, branch);
  const current = normalize(all[key], repository, branch);
  const merged = normalize({
    ...current,
    ...patch,
    brand: { ...current.brand, ...(patch.brand || {}) },
    updatedAt: new Date().toISOString()
  }, repository, branch);
  all[key] = merged;
  await writeStorage(all);
  return merged;
}

export async function addProjectDecision(repository, branch, decision) {
  const current = await getProjectMemory(repository, branch);
  const item = {
    id: crypto.randomUUID(),
    title: cleanText(decision?.title, 200),
    description: cleanText(decision?.description, 1500),
    sourceTaskId: decision?.sourceTaskId || null,
    createdAt: new Date().toISOString()
  };
  if (!item.title && !item.description) throw new Error('Informe uma decisão válida.');
  return saveProjectMemory(repository, branch, { decisions: [item, ...current.decisions].slice(0, MAX_DECISIONS) });
}

export async function removeProjectDecision(repository, branch, decisionId) {
  const current = await getProjectMemory(repository, branch);
  return saveProjectMemory(repository, branch, { decisions: current.decisions.filter((item) => item.id !== decisionId) });
}

export async function clearProjectMemory(repository, branch) {
  const all = await readStorage();
  delete all[keyFor(repository, branch)];
  await writeStorage(all);
}

export function compileProjectMemory(memory) {
  if (!memory) return null;
  const lines = [];
  const add = (label, value) => {
    if (Array.isArray(value) && value.length) lines.push(`${label}: ${value.join('; ')}`);
    else if (String(value || '').trim()) lines.push(`${label}: ${String(value).trim()}`);
  };
  add('Marca', memory.brand?.name);
  add('Identidade visual', memory.brand?.visualIdentity);
  add('Cores', memory.brand?.colors);
  add('Tipografia', memory.brand?.typography);
  add('Direção de imagens', memory.brand?.imagery);
  add('Público', memory.audience);
  add('Tom de comunicação', memory.communicationTone);
  add('Objetivo do produto', memory.productGoal);
  add('Tecnologias', memory.technologies);
  add('Regras permanentes', memory.permanentRules);
  add('Restrições', memory.restrictions);
  add('Integrações', memory.connectedIntegrations);
  add('Arquivos importantes', memory.importantFiles);
  add('Observações', memory.notes);
  if (memory.decisions?.length) {
    lines.push(`Decisões anteriores: ${memory.decisions.slice(0, 15).map((item) => `${item.title || 'Decisão'} — ${item.description || ''}`).join(' | ')}`);
  }
  return {
    repository: memory.repository,
    branch: memory.branch,
    text: lines.join('\n'),
    rules: memory.permanentRules || [],
    restrictions: memory.restrictions || [],
    technologies: memory.technologies || [],
    integrations: memory.connectedIntegrations || []
  };
}
