/*
 * Serial outbox executor. One Drive call at a time. ACK only after success.
 */

import { APP_VERSION } from './constants';
import { generateOfflineViewerHtml } from './offline-viewer';
import * as GoogleAPI from './google-api';
import { log } from './logger';
import {
  SyncNotReadyError,
  ackOp,
  buildIndexData,
  persistNotebookData,
} from './sync-outbox';
import {
  findFolderContext,
  findPageContext,
  isLinkPage,
} from './sync-merge';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

function applyPageMeta(setDataAndRef, notebookId, tabId, pageId, meta) {
  setDataAndRef((prev) => ({
    ...prev,
    notebooks: prev.notebooks.map((nb) =>
      nb.id !== notebookId
        ? nb
        : {
            ...nb,
            tabs: nb.tabs.map((tab) =>
              tab.id !== tabId
                ? tab
                : {
                    ...tab,
                    pages: tab.pages.map((page) => (page.id === pageId ? { ...page, ...meta } : page)),
                  }
            ),
          }
    ),
  }));
}

async function processTrash(op) {
  await GoogleAPI.deleteDriveItem(op.driveId);
  ackOp(op.id, { trashDriveId: op.driveId });
}

async function processMove(op) {
  try {
    await GoogleAPI.moveDriveItem(op.driveId, op.newParentId, op.oldParentId);
  } catch (error) {
    if (error.status === 404 || error.result?.error?.code === 404) {
      ackOp(op.id);
      return;
    }
    throw error;
  }
  ackOp(op.id);
}

async function processRename(op) {
  try {
    await GoogleAPI.renameDriveItem(op.driveId, op.name);
  } catch (error) {
    if (error.status === 404 || error.result?.error?.code === 404) {
      ackOp(op.id);
      return;
    }
    throw error;
  }
  ackOp(op.id);
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
  if (link) {
    if (page.driveLinkFileId) {
      const result = await GoogleAPI.writeLinkJson(page, tab.driveFolderId);
      applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {
        driveLinkFileId: result.id,
        driveEtag: result.etag,
      });
      ackOp(op.id);
      return;
    }
    const existing = await GoogleAPI.findFileByAppId(tab.driveFolderId, page.id, 'application/json');
    if (existing) {
      const withId = { ...page, driveLinkFileId: existing.id, driveEtag: existing.etag };
      const result = await GoogleAPI.writeLinkJson(withId, tab.driveFolderId);
      applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {
        driveLinkFileId: result.id,
        driveEtag: result.etag,
      });
      ackOp(op.id);
      return;
    }
    const created = await GoogleAPI.writeLinkJson(page, tab.driveFolderId);
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {
      driveLinkFileId: created.id,
      driveEtag: created.etag,
    });
    ackOp(op.id);
    return;
  }

  if (page.driveFileId) {
    const result = await GoogleAPI.writePageJson(page, tab.driveFolderId);
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {
      driveFileId: result.id,
      driveEtag: result.etag,
    });
    ackOp(op.id);
    return;
  }
  const existing = await GoogleAPI.findFileByAppId(tab.driveFolderId, page.id, 'application/json');
  if (existing) {
    const withId = { ...page, driveFileId: existing.id, driveEtag: existing.etag };
    const result = await GoogleAPI.writePageJson(withId, tab.driveFolderId);
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {
      driveFileId: result.id,
      driveEtag: result.etag,
    });
    ackOp(op.id);
    return;
  }
  const created = await GoogleAPI.writePageJson(page, tab.driveFolderId);
  applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, {
    driveFileId: created.id,
    driveEtag: created.etag,
  });
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
  if (link) {
    if (!page.driveLinkFileId) {
      throw new SyncNotReadyError(`Link file not ready for page ${page.id}`);
    }
    const result = await GoogleAPI.writeLinkJson(page, tab.driveFolderId);
    applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, { driveEtag: result.etag });
    ackOp(op.id);
    return;
  }
  if (!page.driveFileId) {
    throw new SyncNotReadyError(`Page file not ready for ${page.id}`);
  }
  const result = await GoogleAPI.writePageJson(page, tab.driveFolderId);
  applyPageMeta(ctx.setDataAndRef, notebook.id, tab.id, page.id, { driveEtag: result.etag });
  ackOp(op.id);
}

async function processSaveIndex(op, ctx) {
  const data = ctx.dataRef.current;
  const indexData = buildIndexData(data);
  await GoogleAPI.saveIndexFile(ctx.rootFolderId, indexData);
  try {
    await GoogleAPI.updateManifest(data, ctx.rootFolderId, APP_VERSION);
    await GoogleAPI.uploadIndexHtml(generateOfflineViewerHtml(), ctx.rootFolderId);
  } catch (error) {
    log('ERROR', 'Error updating manifest/index.html:', error);
  }
  ackOp(op.id);
}

/**
 * Process a single outbox op. Throws SyncNotReadyError when a parent ID is missing.
 */
export async function processSyncOp(op, ctx) {
  log('SYNC', 'process op', { type: op.type, id: op.id, coalesceKey: op.coalesceKey });
  switch (op.type) {
    case 'trash':
      await processTrash(op);
      break;
    case 'move':
      await processMove(op);
      break;
    case 'rename':
      await processRename(op);
      break;
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
}

export { persistNotebookData };
