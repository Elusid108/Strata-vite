import { describe, it, expect } from 'vitest';
import { describeSyncOp, formatSyncProgress } from './sync-status';

describe('describeSyncOp', () => {
  it('names the item being deleted when the op carries a name', () => {
    expect(describeSyncOp({ type: 'trash', driveId: 'x', name: 'Work' }, { notebooks: [] })).toBe('Deleting from Drive: Work');
    expect(describeSyncOp({ type: 'trash', driveId: 'x' }, { notebooks: [] })).toBe('Deleting from Drive');
  });

  it('describes other ops', () => {
    expect(describeSyncOp({ type: 'saveIndex' }, { notebooks: [] })).toBe('Updating index');
    expect(describeSyncOp(null)).toBe('Waiting...');
  });
});

describe('formatSyncProgress', () => {
  it('counts the current op as in progress', () => {
    expect(formatSyncProgress({ completed: 3, remaining: 2 })).toBe('4 of 5');
    expect(formatSyncProgress({ completed: 3, remaining: 0 })).toBeNull();
  });
});
