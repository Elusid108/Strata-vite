/*
 * Serial outbox executor. One Drive call at a time. ACK only after success.
 *
 * Page writes carry an If-Match etag. When Drive answers 412 the remote copy
 * is merged with ours (see mergePageVersions) and the merged page is written
 * with the fresh etag; nothing is ever blindly overwritten.
 */

import { APP_VERSION } from './constants';
import { generateOfflineViewerHtml } from './offline-viewer';
import * as GoogleAPI from './google-api';
import { log } from './logger';
import {
  SyncNotReadyError,
  ackOp,
  enqueueOp,
  buildIndexData,
  persistNotebookData,
  skipOp,
} from './sync-outbox';
import { classifyDriveError } from './sync-errors';
import {
  findFolderContext,
  findPageContext,
  isLinkPage,
  mergePageVersions,
  pageFromDriveJson,
} from './sync-merge';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const VIEWER_VERSION_KEY = 'strata_viewer_version';

function applyNotebookMeta(setDataAndRef, notebookId, meta) {
  setDataAndRef((prev) => ({
    ...prev,
    notebooks: prev.notebooks.map((nb) =>
      nb.id === notebookId ? { ...nb, ...meta } : nb
    ),
  }));
}

function applyTabMeta(setDataAndRef, notebookId, tabId, meta) {
  setDataAndRef((prev) => ({
    ...prev,
    notebooks: prev.notebooks.map((nb) =>
      nb.id !== notebookId
        ? nb
        : {
            ...nb,
            tabs: nb.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...meta } : tab)),
          }
    ),
  }));
}

/** Merge `meta` into a page, or replace it entirely with `replaceWith`. */
function applyPageMeta(setDataAndRef, notebookId, tabId, pageId, meta, { replaceWith = null, insertAfter = null } = {}) {
  setDataAndRef((prev) => ({
    ...prev,
    notebooks: prev.notebooks.map((nb) =>
      nb.id !== notebookId
        ? nb
        : {
            ...nb,
            tabs: nb.tabs.map((tab) => {
              if (tab.id !== tabId) return tab;
              let pages = tab.pages.map((page) => {
                if (page.id !== pageId) return page;
                return replaceWith ? { ...replaceWith, ...meta } : { ...page, ...meta };
              });
              if (insertAfter && !pages.some((p) => p.id === insertAfter.id)) {
                const at = pages.findIndex((p) => p.id === pageId);
                pages = [...pages.slice(0, at + 1), insertAfter, ...pages.slice(at + 1)];
              }
              return { ...tab, pages };
            }),
          }
    ),
  }));
}

/**
 * Trash, move and rename are cosmetic from the app's point of view: the local
 * tree is already the truth. When Drive refuses one of them for permission
 * reasons (typically a folder holding files Strata did not create, which the
 * drive.file scope cannot touch), retrying can never succeed, so the op is
 * dropped and reported instead of blocking the queue. Any other error rethrows.
 */
function skipIfPermissionDenied(op, error) {
  const classified = classifyDriveError(error);
  if (classified.kind !== 'permission') throw error;
  skipOp(op.id);
  log('SYNC', 'op skipped: permission denied', { type: op.type, driveId: op.driveId, message: classified.message });
  return { skipped: { op, reason: 'permission', message: classified.message } };
}

function isNotFound(error) {
  return error?.status === 404 || error?.result?.error?.code === 404;
}

async function processTrash(op) {
  try {
    await GoogleAPI.deleteDriveItem(op.driveId);
  } catch (error) {
    return skipIfPermissionDenied(op, error);
  }
  ackOp(op.id, { trashDriveId: op.driveId });
  return null;
}

async function processMove(op) {
  try {
    await GoogleAPI.moveDriveItem(op.driveId, op.newParentId, op.oldParentId);
  } catch (error) {
    if (isNotFound(error)) {
      ackOp(op.id);
      return null;
    }
    return skipIfPermissionDenied(op, error);
  }
  ackOp(op.id);
  return null;
}

async function processRename(op) {
  try {
    await GoogleAPI.renameDriveItem(op.driveId, op.name);
  } catch (error) {
    if (isNotFound(error)) {
      ackOp(op.id);
      return null;
    }
    return skipIfPermissionDenied(op, error);
  }
  ackOp(op.id);
  return null;
}

async function processEnsureFolder(op, ctx) {
  const data = ctx.dataRef.current;
  const found = findFolderContext(data, op);
  if (!found) {
    ackOp(op.id);
    return;
  }

  if (op.entityType === 'notebook') {
    const { notebook } = found;
    const parentId = ctx.rootFolderId;
    if (notebook.driveFolderId) {
      const result = await GoogleAPI.updateFolderExact(notebook.driveFolderId, notebook.name, {
        appId: notebook.id,
        icon: notebook.icon,
      });
      applyNotebookMeta(ctx.setDataAndRef, notebook.id, { driveEtag: result.etag });
      ackOp(op.id);
      return;
    }
    const existing = await GoogleAPI.findFileByAppId(parentId, notebook.id, FOLDER_MIME);
    if (existing) {
      applyNotebookMeta(ctx.setDataAndRef, notebook.id, {
        driveFolderId: existing.id,
        driveEtag: existing.etag,
      });
      ackOp(op.id);
      return;
    }
    const created = await GoogleAPI.createFolderWithAppId(notebook.name, parentId, notebook.id, {
      icon: notebook.icon,
    });
    applyNotebookMeta(ctx.setDataAndRef, notebook.id, {
      driveFolderId: created.id,
      driveEtag: created.etag,
    });
    ackOp(op.id);
    return;
  }

  const { notebook, tab } = found;
  if (!notebook.driveFolderId) {
    throw new SyncNotReadyError(`Notebook folder not ready for tab ${tab.id}`);
  }
  if (tab.driveFolderId) {
    const result = await GoogleAPI.updateFolderExact(tab.driveFolderId, tab.name, {
      appId: tab.id,
      icon: tab.icon,
      tabColor: tab.color,
    });
    applyTabMeta(ctx.setDataAndRef, notebook.id, tab.id, { driveEtag: result.etag });
    ackOp(op.id);
    return;
  }
  const existing = await GoogleAPI.findFileByAppId(notebook.driveFolderId, tab.id, FOLDER_MIME);
  if (existing) {
    applyTabMeta(ctx.setDataAndRef, notebook.id, tab.id, {
      driveFolderId: existing.id,
      driveEtag: existing.etag,
    });
    ackOp(op.id);
    return;
  }
  const created = await GoogleAPI.createFolderWithAppId(tab.name, notebook.driveFolderId, tab.id, {
    icon: tab.icon,
    tabColor: tab.color,
  });
  applyTabMeta(ctx.setDataAndRef, notebook.id, tab.id, {
    driveFolderId: created.id,
    driveEtag: created.etag,
  });
  ackOp(op.id);
}

function errorStatus(error) {
  return error?.status || error?.result?.error?.code || null;
}

/**
 * Write a page's JSON (create or update).
 *
 * Before updating an existing file the engine reads its metadata: if Drive's
 * modifiedTime differs from the one we synced last, another device wrote the
 * file and the remote copy is merged first (see mergePageVersions). A 412 on
 * the write itself is handled the same way as a second line of defence, and a
 * trashed/missing file is recreated instead of written into the trash.
 * Returns the page object that was actually written.
 */
async function writePageWithConflictHandling(ctx, notebook, tab, page) {
  const link = isLinkPage(page);
  const write = (p, opts) => (link ? GoogleAPI.writeLinkJson(p, tab.driveFolderId, opts) : GoogleAPI.writePageJson(p, tab.driveFolderId, opts));
  const fileIdOf = (p) => (link ? p.driveLinkFileId : p.driveFileId);
  const withFileId = (p, id) => (link ? { ...p, driveLinkFileId: id } : { ...p, driveFileId: id });

  let target = page;
  let etag = page.driveEtag ?? null;

  const resolveConflict = (remoteJson, remoteEtag, remoteModifiedTime) => {
    const remote = remoteJson
      ? pageFromDriveJson(remoteJson, target, { jsonFileId: fileIdOf(target), etag: remoteEtag, modifiedTime: remoteModifiedTime })
      : null;
    const merged = mergePageVersions(target, remote);
    log('SYNC', 'conflict on page write', { pageId: page.id, strategy: merged.strategy });
    if (merged.conflictCopy) {
      applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {}, { insertAfter: merged.conflictCopy });
      enqueueOp(
        { type: 'ensurePageFile', pageId: merged.conflictCopy.id, tabId: tab.id, notebookId: notebook.id },
        `page:${merged.conflictCopy.id}`
      );
      ctx.notify?.(`"${page.name}" was changed on another device; the other version was saved as a conflict copy.`, 'info');
    } else if (merged.strategy === 'merged') {
      ctx.notify?.(`Merged changes to "${page.name}" from another device.`, 'info');
    }
    target = { ...merged.page, driveEtag: remoteEtag || merged.page.driveEtag || null };
    etag = remoteEtag || null;
    return merged.strategy;
  };

  const adoptWithoutWrite = () => {
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {}, { replaceWith: target });
    return { page: target, written: false };
  };

  // Preflight for existing files.
  const existingId = fileIdOf(target);
  if (existingId) {
    let meta = null;
    try {
      meta = await GoogleAPI.getFileEtag(existingId);
    } catch (error) {
      if (errorStatus(error) === 404) meta = { missing: true };
      else throw error;
    }
    if (meta.missing || meta.trashed) {
      log('SYNC', 'page file missing or trashed on Drive, recreating', { pageId: page.id });
      target = withFileId({ ...target, driveEtag: null, driveModifiedTime: null }, null);
      etag = null;
    } else {
      etag = meta.etag || etag;
      const remoteChanged = !!target.driveModifiedTime && !!meta.modifiedTime && meta.modifiedTime !== target.driveModifiedTime;
      if (remoteChanged) {
        let remoteJson = null;
        try {
          remoteJson = await GoogleAPI.getFileContent(existingId);
        } catch {
          remoteJson = null;
        }
        const strategy = resolveConflict(remoteJson, meta.etag, meta.modifiedTime);
        if (strategy === 'remote') return adoptWithoutWrite();
      }
    }
  }

  let result;
  try {
    result = await write(target, { etag });
  } catch (error) {
    if (error?.status !== 412) throw error;
    const strategy = resolveConflict(error.remote, error.etag, null);
    if (strategy === 'remote') return adoptWithoutWrite();
    result = await write(target, { etag: error.etag || null });
  }

  const meta = {
    driveEtag: result.etag || null,
    driveModifiedTime: result.modifiedTime || null,
    driveModifiedAt: target.modifiedAt || 0,
  };
  if (link) meta.driveLinkFileId = result.id;
  else meta.driveFileId = result.id;
  if (target !== page) {
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, meta, { replaceWith: target });
  } else {
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, meta);
  }
  return { page: { ...target, ...meta }, written: true };
}

async function processEnsurePageFile(op, ctx) {
  const found = findPageContext(ctx.dataRef.current, op.pageId);
  if (!found) {
    ackOp(op.id);
    return;
  }
  const { notebook, tab, page } = found;
  if (!tab.driveFolderId) {
    throw new SyncNotReadyError(`Tab folder not ready for page ${page.id}`);
  }

  const link = isLinkPage(page);
  const hasFile = link ? !!page.driveLinkFileId : !!page.driveFileId;
  let target = page;
  if (!hasFile) {
    const existing = await GoogleAPI.findFileByAppId(tab.driveFolderId, page.id, 'application/json');
    if (existing) {
      target = link
        ? { ...page, driveLinkFileId: existing.id, driveEtag: existing.etag || null }
        : { ...page, driveFileId: existing.id, driveEtag: existing.etag || null };
    }
  }
  await writePageWithConflictHandling(ctx, notebook, tab, target);
  ackOp(op.id);
}

async function processPatchPage(op, ctx) {
  const found = findPageContext(ctx.dataRef.current, op.pageId);
  if (!found) {
    ackOp(op.id);
    return;
  }
  const { notebook, tab, page } = found;
  if (!tab.driveFolderId) {
    throw new SyncNotReadyError(`Tab folder not ready for patch ${page.id}`);
  }
  const link = isLinkPage(page);
  const hasFile = link ? !!page.driveLinkFileId : !!page.driveFileId;
  if (!hasFile) {
    await processEnsurePageFile(op, ctx);
    return;
  }
  await writePageWithConflictHandling(ctx, notebook, tab, page);
  ackOp(op.id);
}

async function processSaveIndex(op, ctx) {
  const data = ctx.dataRef.current;
  const indexData = buildIndexData(data);
  await GoogleAPI.saveIndexFile(ctx.rootFolderId, indexData);
  try {
    await GoogleAPI.updateManifest(data, ctx.rootFolderId, APP_VERSION);
    // The offline viewer only changes with the app version; upload it once per version.
    const viewerKey = `${VIEWER_VERSION_KEY}:${ctx.rootFolderId}`;
    if (localStorage.getItem(viewerKey) !== APP_VERSION) {
      await GoogleAPI.uploadIndexHtml(generateOfflineViewerHtml(), ctx.rootFolderId);
      localStorage.setItem(viewerKey, APP_VERSION);
    }
  } catch (error) {
    log('ERROR', 'Error updating manifest/index.html:', error);
  }
  ackOp(op.id);
}

/**
 * Process a single outbox op. Throws SyncNotReadyError when a parent ID is missing.
 * Resolves to `{ skipped: { op, reason, message } }` when the op was dropped
 * because Drive refused it for permission reasons, otherwise to null.
 */
export async function processSyncOp(op, ctx) {
  log('SYNC', 'process op', { type: op.type, id: op.id, coalesceKey: op.coalesceKey });
  switch (op.type) {
    case 'trash':
      return processTrash(op);
    case 'move':
      return processMove(op);
    case 'rename':
      return processRename(op);
    case 'ensureFolder':
      await processEnsureFolder(op, ctx);
      break;
    case 'ensurePageFile':
      await processEnsurePageFile(op, ctx);
      break;
    case 'patchPage':
      await processPatchPage(op, ctx);
      break;
    case 'saveIndex':
      await processSaveIndex(op, ctx);
      break;
    default:
      log('SYNC', 'unknown op type, dropping', op.type);
      ackOp(op.id);
  }
  return null;
}

export { persistNotebookData };
