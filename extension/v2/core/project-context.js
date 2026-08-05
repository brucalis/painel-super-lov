/* SUPER LOVABLE V2 — contexto do projeto selecionado */

import { getGithubConnection, hasWritableProject, saveGithubConnection } from './github-connection.js';
import { fetchGithubBranches } from './github-api-adapter.js';

export async function getProjectContext() {
  const connection = await getGithubConnection();
  return {
    connected: connection.status === 'connected',
    writable: hasWritableProject(connection),
    accountLogin: connection.accountLogin,
    repository: connection.selectedRepository,
    branch: connection.selectedBranch,
    lastCheckedAt: connection.lastCheckedAt
  };
}

export async function selectRepository(repository) {
  if (!repository?.fullName) throw new Error('Repositório inválido.');
  if (!repository.permissions?.write) throw new Error('A Super Lovable precisa de permissão de escrita neste repositório.');
  const response = await fetchGithubBranches(repository.fullName);
  const branches = Array.isArray(response?.branches) ? response.branches : [];
  const selectedBranch = branches.includes(repository.defaultBranch)
    ? repository.defaultBranch
    : branches[0] || repository.defaultBranch || 'main';
  return saveGithubConnection({ selectedRepository: repository, selectedBranch });
}

export async function selectBranch(branch) {
  const connection = await getGithubConnection();
  if (!connection.selectedRepository) throw new Error('Selecione primeiro um repositório.');
  const normalized = String(branch || '').trim();
  if (!normalized) throw new Error('Branch inválida.');
  return saveGithubConnection({ selectedBranch: normalized });
}

export function projectLabel(context) {
  if (!context?.repository?.fullName) return 'Projeto não associado';
  return `${context.repository.fullName} · ${context.branch || 'branch não definida'}`;
}
