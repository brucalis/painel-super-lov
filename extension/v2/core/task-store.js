import { TASK_STATUS, transitionTask } from './task-contracts.js';

const STORAGE_KEY = 'slv2_task_store';
const MAX_TASKS = 100;

function readStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result?.[STORAGE_KEY] || { tasks: [], activeTaskId: null });
    });
  });
}

function writeStorage(state) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(state);
    });
  });
}

function normalizeState(value) {
  const tasks = Array.isArray(value?.tasks) ? value.tasks.slice(0, MAX_TASKS) : [];
  return { tasks, activeTaskId: value?.activeTaskId || null };
}

export async function getTaskState() {
  return normalizeState(await readStorage());
}

export async function listTasks() {
  const state = await getTaskState();
  return state.tasks;
}

export async function saveTask(task) {
  const state = await getTaskState();
  const index = state.tasks.findIndex((item) => item.id === task.id);
  const tasks = [...state.tasks];
  if (index >= 0) tasks[index] = task;
  else tasks.unshift(task);
  return writeStorage({ ...state, tasks: tasks.slice(0, MAX_TASKS) });
}

export async function updateTask(id, nextStatus, patch = {}) {
  const state = await getTaskState();
  const current = state.tasks.find((item) => item.id === id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const updated = transitionTask(current, nextStatus, patch);
  await saveTask(updated);
  return updated;
}

export async function removeTask(id) {
  const state = await getTaskState();
  const tasks = state.tasks.filter((item) => item.id !== id);
  const activeTaskId = state.activeTaskId === id ? null : state.activeTaskId;
  await writeStorage({ tasks, activeTaskId });
}

export async function setActiveTask(id = null) {
  const state = await getTaskState();
  await writeStorage({ ...state, activeTaskId: id });
}

export async function clearFinishedTasks() {
  const state = await getTaskState();
  const finished = new Set([
    TASK_STATUS.COMPLETED,
    TASK_STATUS.FAILED,
    TASK_STATUS.CANCELLED,
    TASK_STATUS.ROLLED_BACK
  ]);
  const tasks = state.tasks.filter((item) => !finished.has(item.status));
  await writeStorage({ tasks, activeTaskId: state.activeTaskId });
}
