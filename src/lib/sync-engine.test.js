import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./google-api', () => ({
  deleteDriveItem: vi.fn(),
  moveDriveItem: vi.fn(),
  renameDriveItem: vi.fn(),
}));

import * as GoogleAPI from './google-api';
import { processSyncOp } from './sync-engine';
import { enqueueOp, enqueueTrash, peekOp, hasPendingOps, tombstoneIdSet } from './sync-outbox';

const permission403 = {
  status: 403,
  result: {
    error: {
      code: 403,
      message: 'The user has not granted the app 623241453654 write access to the child file abc, which would be affected by the operation on the parent.',
      errors: [{ domain: 'global', reason: 'appNotAuthorizedToFile' }],
    },
  },
};
const server500 = { status: 500, result: { error: { code: 500, message: 'Backend Error', errors: [{ reason: 'backendError' }] } } };
const notFound = { status: 404, result: { error: { code: 404, message: 'File not found' } } };

const ctx = { dataRef: { current: { notebooks: [] } }, setDataAndRef: () => {}, rootFolderId: 'root', notify: () => {} };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processSyncOp: trash', () => {
  it('acks and clears the tombstone on success', async () => {
    GoogleAPI.deleteDriveItem.mockResolvedValue(true);
    enqueueTrash([{ driveId: 'f1', name: 'Work' }]);
    const result = await processSyncOp(peekOp(), ctx);
    expect(result).toBeNull();
    expect(hasPendingOps()).toBe(false);
    expect(tombstoneIdSet().has('f1')).toBe(false);
  });

  it('skips a permission-denied trash, keeps the tombstone and reports it', async () => {
    GoogleAPI.deleteDriveItem.mockRejectedValue(permission403);
    enqueueTrash([{ driveId: 'folder1', name: 'Work' }]);
    const op = peekOp();
    const result = await processSyncOp(op, ctx);
    expect(result.skipped.op.id).toBe(op.id);
    expect(result.skipped.reason).toBe('permission');
    expect(result.skipped.message).toMatch(/child file/);
    expect(hasPendingOps()).toBe(false);
    expect(tombstoneIdSet().has('folder1')).toBe(true);
  });

  it('rethrows other errors and leaves the op queued', async () => {
    GoogleAPI.deleteDriveItem.mockRejectedValue(server500);
    enqueueTrash(['f1']);
    await expect(processSyncOp(peekOp(), ctx)).rejects.toBe(server500);
    expect(hasPendingOps()).toBe(true);
    expect(tombstoneIdSet().has('f1')).toBe(true);
  });
});

describe('processSyncOp: move and rename', () => {
  it('skips a permission-denied move', async () => {
    GoogleAPI.moveDriveItem.mockRejectedValue(permission403);
    enqueueOp({ type: 'move', driveId: 'x', newParentId: 'a', oldParentId: 'b' }, 'move:x');
    const result = await processSyncOp(peekOp(), ctx);
    expect(result.skipped.reason).toBe('permission');
    expect(hasPendingOps()).toBe(false);
  });

  it('still acks a rename of a missing item', async () => {
    GoogleAPI.renameDriveItem.mockRejectedValue(notFound);
    enqueueOp({ type: 'rename', driveId: 'x', name: 'New' }, 'rename:x');
    const result = await processSyncOp(peekOp(), ctx);
    expect(result).toBeNull();
    expect(hasPendingOps()).toBe(false);
  });

  it('rethrows a server error on rename', async () => {
    GoogleAPI.renameDriveItem.mockRejectedValue(server500);
    enqueueOp({ type: 'rename', driveId: 'x', name: 'New' }, 'rename:x');
    await expect(processSyncOp(peekOp(), ctx)).rejects.toBe(server500);
    expect(hasPendingOps()).toBe(true);
  });
});
