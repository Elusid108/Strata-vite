import { describe, it, expect } from 'vitest';
import {
  enqueueOp,
  enqueueTrash,
  ackOp,
  getSyncState,
  peekOp,
  hasPendingOps,
  pendingPageIds,
  tombstoneIdSet,
  clearSyncState,
  buildIndexData,
} from './sync-outbox';

describe('outbox ordering', () => {
  it('sorts by op priority regardless of enqueue order', () => {
    enqueueOp({ type: 'saveIndex' }, 'saveIndex');
    enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    enqueueOp({ type: 'ensureFolder', entityType: 'tab', appId: 't1', notebookId: 'n1' }, 'folder:t1');
    enqueueOp({ type: 'ensureFolder', entityType: 'notebook', appId: 'n1' }, 'folder:n1');
    enqueueOp({ type: 'trash', driveId: 'x' }, 'trash:x');
    const types = getSyncState().ops.map((o) => `${o.type}${o.entityType ? ':' + o.entityType : ''}`);
    expect(types).toEqual(['trash', 'ensureFolder:notebook', 'ensureFolder:tab', 'patchPage', 'saveIndex']);
  });
});

describe('coalescing and ack', () => {
  it('replaces an op with the same coalesceKey and gives it a new id', () => {
    const first = enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    const second = enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    expect(getSyncState().ops).toHaveLength(1);
    expect(second.id).not.toBe(first.id);
    expect(peekOp().id).toBe(second.id);
  });

  it('acking the stale id does not drop the newer coalesced op', () => {
    const first = enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    ackOp(first.id);
    expect(hasPendingOps()).toBe(true);
  });

  it('acking the current id clears the queue', () => {
    const op = enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    ackOp(op.id);
    expect(hasPendingOps()).toBe(false);
  });

  it('pendingPageIds includes patch and ensurePageFile ops', () => {
    enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    enqueueOp({ type: 'ensurePageFile', pageId: 'p2' }, 'page:p2');
    enqueueOp({ type: 'saveIndex' }, 'saveIndex');
    expect([...pendingPageIds()].sort()).toEqual(['p1', 'p2']);
  });
});

describe('tombstones', () => {
  it('records a tombstone on trash and clears it only on ack with trashDriveId', () => {
    enqueueTrash(['f1', { driveId: 'f2' }, null]);
    expect([...tombstoneIdSet()].sort()).toEqual(['f1', 'f2']);
    const op = getSyncState().ops.find((o) => o.driveId === 'f1');
    ackOp(op.id);
    expect(tombstoneIdSet().has('f1')).toBe(true);
    ackOp('does-not-matter', { trashDriveId: 'f1' });
    expect(tombstoneIdSet().has('f1')).toBe(false);
    expect(tombstoneIdSet().has('f2')).toBe(true);
  });

  it('clearSyncState wipes ops and tombstones', () => {
    enqueueTrash('f1');
    clearSyncState();
    expect(hasPendingOps()).toBe(false);
    expect(tombstoneIdSet().size).toBe(0);
  });
});

describe('buildIndexData', () => {
  it('uses Drive ids and skips unsynced items', () => {
    const data = {
      notebooks: [
        {
          id: 'n1',
          driveFolderId: 'dn1',
          tabs: [
            { id: 't1', driveFolderId: 'dt1', pages: [{ id: 'p1', driveFileId: 'f1' }, { id: 'p2', driveLinkFileId: 'l2', driveFileId: 'realdoc' }, { id: 'p3' }] },
            { id: 't2', pages: [{ id: 'p4', driveFileId: 'f4' }] },
          ],
        },
        { id: 'n2', tabs: [] },
      ],
    };
    const idx = buildIndexData(data);
    expect(idx.notebooks).toEqual(['dn1']);
    expect(idx.tabs).toEqual({ dn1: ['dt1'] });
    expect(idx.pages).toEqual({ dt1: ['f1', 'l2'] });
  });
});

describe('trash names, failures and skips', () => {
  it('stores the item name on a trash op and returns the ids', async () => {
    const { enqueueTrash: trash, getSyncState: state } = await import('./sync-outbox');
    const ids = trash([{ driveId: 'f1', name: 'Work' }, 'f2', { driveId: null, name: 'nope' }]);
    expect(ids).toEqual(['f1', 'f2']);
    const ops = state().ops;
    expect(ops.find((o) => o.driveId === 'f1').name).toBe('Work');
    expect(ops.find((o) => o.driveId === 'f2').name).toBeUndefined();
  });

  it('recordOpFailure increments attempts and persists the last error', async () => {
    const { recordOpFailure } = await import('./sync-outbox');
    const op = enqueueOp({ type: 'trash', driveId: 'f1' }, 'trash:f1');
    expect(op.attempts).toBeUndefined();
    const first = recordOpFailure(op.id, { status: 500, reason: 'backendError', message: 'boom' });
    expect(first.attempts).toBe(1);
    const second = recordOpFailure(op.id, { status: 500 });
    expect(second.attempts).toBe(2);
    expect(peekOp().attempts).toBe(2);
    expect(peekOp().lastError.status).toBe(500);
    expect(recordOpFailure('missing', {})).toBeNull();
  });

  it('coalescing a failed op yields a fresh op without attempts', async () => {
    const { recordOpFailure } = await import('./sync-outbox');
    const op = enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    recordOpFailure(op.id, { status: 500 });
    enqueueOp({ type: 'patchPage', pageId: 'p1' }, 'patch:p1');
    expect(peekOp().attempts).toBeUndefined();
  });

  it('skipOp removes the op but keeps the tombstone so the item stays hidden', async () => {
    const { skipOp } = await import('./sync-outbox');
    enqueueTrash([{ driveId: 'folder1', name: 'Work' }]);
    const op = peekOp();
    const removed = skipOp(op.id);
    expect(removed.driveId).toBe('folder1');
    expect(hasPendingOps()).toBe(false);
    expect(tombstoneIdSet().has('folder1')).toBe(true);
    expect(getSyncState().tombstones.find((t) => t.driveId === 'folder1').skippedAt).toBeTypeOf('number');
    expect(skipOp('missing')).toBeNull();
  });
});
