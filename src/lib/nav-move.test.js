import { describe, it, expect } from 'vitest';
import { moveNotebook, moveTab, movePage } from './nav-move';

const tree = () => ({
  notebooks: [
    { id: 'n1', driveFolderId: 'dn1', activeTabId: 't1', tabs: [
      { id: 't1', driveFolderId: 'dt1', activePageId: 'p1', pages: [{ id: 'p1', driveFileId: 'f1' }, { id: 'p2', driveFileId: 'f2' }] },
      { id: 't2', driveFolderId: 'dt2', pages: [] },
    ] },
    { id: 'n2', driveFolderId: 'dn2', tabs: [{ id: 't3', driveFolderId: 'dt3', pages: [{ id: 'p3' }] }] },
  ],
});

describe('nav-move', () => {
  it('reorders notebooks and clamps the index', () => {
    const r = moveNotebook(tree(), 'n2', 0);
    expect(r.changed).toBe(true);
    expect(r.data.notebooks.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(moveNotebook(tree(), 'n1', 0).changed).toBe(false);
    expect(moveNotebook(tree(), 'n1', 99).data.notebooks.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('moves a page within a tab without a Drive move', () => {
    const r = movePage(tree(), 'p2', { toIndex: 0 });
    expect(r.driveMove).toBeNull();
    expect(r.data.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('moves a page to another tab and reports the Drive move', () => {
    const r = movePage(tree(), 'p1', { toTabId: 't3' });
    expect(r.driveMove).toEqual({ itemId: 'f1', newParentId: 'dt3', oldParentId: 'dt1' });
    expect(r.data.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p2']);
    expect(r.data.notebooks[1].tabs[0].pages.map((p) => p.id)).toEqual(['p3', 'p1']);
    expect(r.data.notebooks[1].tabs[0].activePageId).toBe('p1');
    expect(r.targetNotebookId).toBe('n2');
  });

  it('skips the Drive move for pages not yet uploaded', () => {
    const r = movePage(tree(), 'p3', { toTabId: 't1', toIndex: 0 });
    expect(r.driveMove).toBeNull();
    expect(r.data.notebooks[0].tabs[0].pages[0].id).toBe('p3');
  });

  it('moves tabs across notebooks with a Drive move', () => {
    const r = moveTab(tree(), 't2', { toNotebookId: 'n2', toIndex: 0 });
    expect(r.driveMove).toEqual({ itemId: 'dt2', newParentId: 'dn2', oldParentId: 'dn1' });
    expect(r.data.notebooks[0].tabs.map((t) => t.id)).toEqual(['t1']);
    expect(r.data.notebooks[1].tabs.map((t) => t.id)).toEqual(['t2', 't3']);
  });
});
