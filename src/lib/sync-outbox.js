/*
 * Persisted serial sync outbox + tombstones.
 * Ops are removed only after a checked Drive ACK. Trash IDs stay in tombstones
 * until Drive confirms trashed=true so reloads cannot resurrect them.
 */

import { INITIAL_DATA } from './constants';

const STORAGE_KEY = 'strata_sync_state';
const DATA_KEY = 'note-app-data-v1';

let liveTree = null;

export function setLiveTree(data) {
  liveTree = data;
}

export function getLiveTree() {
  return liveTree;
}

export class SyncNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SyncNotReadyError';
    this.code = 'NOT_READY';
  }
}

const OP_PRIORITY = {
  trash: 0,
  move: 1,
  ensureFolder: 2,
  rename: 3,
  ensurePageFile: 4,
  patchPage: 5,
  saveIndex: 6,
};

function emptyState() {
  return { ops: [], tombstones: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
      tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota or disabled */
  }
}

function mutate(fn) {
  const state = loadState();
  fn(state);
  saveState(state);
  return state;
}

function newOpId() {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortOps(ops) {
  return [...ops].sort((a, b) => {
    const pa = OP_PRIORITY[a.type] ?? 50;
    const pb = OP_PRIORITY[b.type] ?? 50;
    if (pa !== pb) return pa - pb;
    if (a.type === 'ensureFolder' && b.type === 'ensureFolder') {
      const aTab = a.entityType === 'tab' ? 1 : 0;
      const bTab = b.entityType === 'tab' ? 1 : 0;
      if (aTab !== bTab) return aTab - bTab;
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

export function isPlaceholderData(data) {
  if (!data?.notebooks?.length) return true;
  return data.notebooks[0]?.id === 'nb1';
}

export function persistNotebookData(data) {
  if (!data) return;
  setLiveTree(data);
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    /* quota or disabled */
  }
}

export function getSyncState() {
  const state = loadState();
  return { ops: sortOps(state.ops), tombstones: state.tombstones };
}

export function peekOp() {
  const { ops } = getSyncState();
  return ops[0] || null;
}

export function hasPendingOps() {
  return loadState().ops.length > 0;
}

export function pendingPageIds() {
  const ids = new Set();
  for (const op of loadState().ops) {
    if (op.type === 'patchPage' || op.type === 'ensurePageFile') {
      if (op.pageId) ids.add(op.pageId);
    }
  }
  return ids;
}

export function tombstoneIdSet() {
  return new Set(loadState().tombstones.map((t) => t.driveId).filter(Boolean));
}

export function hasTombstone(driveId) {
  if (!driveId) return false;
  return loadState().tombstones.some((t) => t.driveId === driveId);
}

/**
 * Append an op. If coalesceKey matches an existing op, replace it (new id)
 * so an in-flight ACK of the old id cannot drop a newer mutation.
 */
export function enqueueOp(payload, coalesceKey) {
  const op = {
    ...payload,
    id: newOpId(),
    createdAt: Date.now(),
    coalesceKey: coalesceKey || payload.coalesceKey || `${payload.type}:${payload.id || Math.random()}`,
  };
  mutate((state) => {
    const idx = state.ops.findIndex((o) => o.coalesceKey === op.coalesceKey);
    if (idx >= 0) {
      state.ops.splice(idx, 1);
    }
    state.ops.push(op);
    if (op.type === 'trash' && op.driveId) {
      if (!state.tombstones.some((t) => t.driveId === op.driveId)) {
        state.tombstones.push({ driveId: op.driveId, deletedAt: Date.now() });
      }
    }
  });
  return op;
}

export function enqueueTrash(driveIds) {
  const ids = (Array.isArray(driveIds) ? driveIds : [driveIds])
    .map((item) => (typeof item === 'string' ? item : item?.driveId))
    .filter(Boolean);
  for (const driveId of ids) {
    enqueueOp({ type: 'trash', driveId }, `trash:${driveId}`);
  }
  return ids;
}

export function ackOp(opId, { trashDriveId } = {}) {
  mutate((state) => {
    state.ops = state.ops.filter((o) => o.id !== opId);
    if (trashDriveId) {
      state.tombstones = state.tombstones.filter((t) => t.driveId !== trashDriveId);
    }
  });
}

export function clearSyncState() {
  saveState(emptyState());
}

export function buildIndexData(data) {
  const notebooks = data?.notebooks || [];
  const indexData = {
    notebooks: notebooks.map((nb) => nb.driveFolderId).filter(Boolean),
    tabs: {},
    pages: {},
  };
  for (const nb of notebooks) {
    if (!nb.driveFolderId) continue;
    indexData.tabs[nb.driveFolderId] = (nb.tabs || []).map((t) => t.driveFolderId).filter(Boolean);
    for (const tab of nb.tabs || []) {
      if (!tab.driveFolderId) continue;
      const pageIds = (tab.pages || [])
        .map((page) => page.driveLinkFileId || page.driveFileId)
        .filter(Boolean);
      if (pageIds.length > 0) {
        indexData.pages[tab.driveFolderId] = pageIds;
      }
    }
  }
  return indexData;
}

export { INITIAL_DATA, DATA_KEY };
