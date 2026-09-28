import { describe, it, expect } from 'vitest';
import { mergeDriveWithLocal, isLinkPage, findPageContext, mergePageVersions, mergeBlockTrees, pageFromDriveJson } from './sync-merge';

const page = (id, extra = {}) => ({ id, name: id, type: 'block', content: { version: 2, children: [] }, ...extra });
const tab = (id, pages, extra = {}) => ({ id, name: id, pages, ...extra });
const nb = (id, tabs, extra = {}) => ({ id, name: id, tabs, ...extra });

describe('isLinkPage', () => {
  it('treats every LINK_PAGE_TYPES entry as a link page, including map', () => {
    for (const type of ['doc', 'sheet', 'map', 'form', 'drawing', 'vid', 'site', 'script', 'lucidchart', 'miro', 'drawio', 'pdf', 'drive']) {
      expect(isLinkPage({ type })).toBe(true);
    }
  });
  it('treats block/canvas/database/code/mermaid as content pages', () => {
    for (const type of ['block', 'canvas', 'database', 'code', 'mermaid', undefined]) {
      expect(isLinkPage({ type })).toBe(false);
    }
  });
  it('treats any page with an embedUrl as a link page even if type is lost', () => {
    expect(isLinkPage({ type: 'block', embedUrl: 'https://docs.google.com/x' })).toBe(true);
  });
});

describe('mergeDriveWithLocal', () => {
  it('returns Drive tree when local is empty', () => {
    const drive = { notebooks: [nb('n1', [tab('t1', [page('p1')])], { driveFolderId: 'dn1' })] };
    const out = mergeDriveWithLocal({ notebooks: [] }, drive, {});
    expect(out.notebooks).toHaveLength(1);
    expect(out.notebooks[0].id).toBe('n1');
  });

  it('drops tombstoned Drive items when local is empty', () => {
    const drive = {
      notebooks: [
        nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1' }), page('p2', { driveFileId: 'f2' })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' }),
      ],
    };
    const out = mergeDriveWithLocal({ notebooks: [] }, drive, { tombstoneIds: new Set(['f2']) });
    expect(out.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p1']);
  });

  it('keeps a local page with a pending op over the Drive copy', () => {
    const local = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1', name: 'local edit' })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const drive = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1', name: 'drive', modifiedAt: 999 })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const out = mergeDriveWithLocal(local, drive, { pendingPageIds: new Set(['p1']) });
    expect(out.notebooks[0].tabs[0].pages[0].name).toBe('local edit');
  });

  it('prefers Drive page when Drive is newer and nothing is pending', () => {
    const local = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1', name: 'old', modifiedAt: 1 })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const drive = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1', name: 'new', modifiedAt: 2 })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const out = mergeDriveWithLocal(local, drive, {});
    expect(out.notebooks[0].tabs[0].pages[0].name).toBe('new');
  });

  it('prefers local page when local is newer', () => {
    const local = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1', name: 'newer local', modifiedAt: 5 })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const drive = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1', name: 'drive', modifiedAt: 2 })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const out = mergeDriveWithLocal(local, drive, {});
    expect(out.notebooks[0].tabs[0].pages[0].name).toBe('newer local');
  });

  it('adds Drive-only pages and notebooks', () => {
    const local = { notebooks: [nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1' })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' })] };
    const drive = {
      notebooks: [
        nb('n1', [tab('t1', [page('p1', { driveFileId: 'f1' }), page('p2', { driveFileId: 'f2' })], { driveFolderId: 'dt1' })], { driveFolderId: 'dn1' }),
        nb('n2', [], { driveFolderId: 'dn2' }),
      ],
    };
    const out = mergeDriveWithLocal(local, drive, {});
    expect(out.notebooks.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(out.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('keeps unsynced local-only notebooks (no driveFolderId)', () => {
    const local = { notebooks: [nb('guest', [tab('t', [page('p')])])] };
    const drive = { notebooks: [nb('n1', [], { driveFolderId: 'dn1' })] };
    const out = mergeDriveWithLocal(local, drive, {});
    expect(out.notebooks.map((n) => n.id)).toEqual(['guest', 'n1']);
  });
});

describe('findPageContext', () => {
  it('finds notebook, tab and page for a page id', () => {
    const data = { notebooks: [nb('n1', [tab('t1', [page('p1')])])] };
    const found = findPageContext(data, 'p1');
    expect(found.notebook.id).toBe('n1');
    expect(found.tab.id).toBe('t1');
    expect(found.page.id).toBe('p1');
  });
});

describe('mergePageVersions', () => {
  const treeWith = (blocks) => ({ version: 2, children: [{ id: 'r', type: 'row', children: [{ id: 'c', type: 'column', width: 1, children: blocks }] }] });

  it('keeps local when remote modifiedAt equals what we last synced', () => {
    const local = { id: 'p', type: 'block', modifiedAt: 10, driveModifiedAt: 10, content: treeWith([]) };
    const remote = { id: 'p', type: 'block', modifiedAt: 10, driveEtag: 'e2', content: treeWith([]) };
    const r = mergePageVersions(local, remote);
    expect(r.strategy).toBe('local');
    expect(r.page.driveEtag).toBe('e2');
  });

  it('adopts remote when only remote changed', () => {
    const local = { id: 'p', type: 'block', name: 'a', modifiedAt: 10, driveModifiedAt: 10, driveFileId: 'f', content: treeWith([]) };
    const remote = { id: 'p', type: 'block', name: 'b', modifiedAt: 20, content: treeWith([{ id: 'x', type: 'text' }]) };
    const r = mergePageVersions(local, remote);
    expect(r.strategy).toBe('remote');
    expect(r.page.name).toBe('b');
    expect(r.page.driveFileId).toBe('f');
    expect(r.page.driveModifiedAt).toBe(20);
  });

  it('merges block trees when both changed, local wins on shared ids', () => {
    const local = { id: 'p', type: 'block', modifiedAt: 15, driveModifiedAt: 10, content: treeWith([{ id: 'a', type: 'text', content: 'local a' }]) };
    const remote = { id: 'p', type: 'block', modifiedAt: 20, content: treeWith([{ id: 'a', type: 'text', content: 'remote a' }, { id: 'b', type: 'text', content: 'b' }]) };
    const r = mergePageVersions(local, remote);
    expect(r.strategy).toBe('merged');
    const blocks = r.page.rows.flatMap((row) => row.columns.flatMap((c) => c.blocks));
    expect(blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(blocks[0].content).toBe('local a');
  });

  it('produces a conflict copy for canvas pages', () => {
    const local = { id: 'p', type: 'canvas', name: 'Board', modifiedAt: 15, driveModifiedAt: 10, driveFileId: 'f', canvasData: { a: 1 } };
    const remote = { id: 'p', type: 'canvas', name: 'Board', modifiedAt: 20, canvasData: { a: 2 } };
    const r = mergePageVersions(local, remote);
    expect(r.strategy).toBe('conflict-copy');
    expect(r.page.canvasData).toEqual({ a: 1 });
    expect(r.conflictCopy.canvasData).toEqual({ a: 2 });
    expect(r.conflictCopy.driveFileId).toBeNull();
    expect(r.conflictCopy.id).not.toBe('p');
  });

  it('mergeBlockTrees reports how many remote-only blocks were appended', () => {
    const r = mergeBlockTrees(treeWith([{ id: 'a' }]), treeWith([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
    expect(r.added).toBe(2);
  });

  it('pageFromDriveJson maps link pages and content pages', () => {
    const link = pageFromDriveJson({ id: 'l', type: 'doc', name: 'Doc', embedUrl: 'u', driveFileId: 'real', modifiedAt: 3 }, null, { jsonFileId: 'json1' });
    expect(link.driveLinkFileId).toBe('json1');
    expect(link.driveFileId).toBe('real');
    const block = pageFromDriveJson({ id: 'b', type: 'block', name: 'B', content: treeWith([{ id: 'x', type: 'text' }]), modifiedAt: 4 }, null, { jsonFileId: 'json2' });
    expect(block.driveFileId).toBe('json2');
    expect(block.rows[0].columns[0].blocks[0].id).toBe('x');
    expect(block.driveModifiedAt).toBe(4);
  });
});

describe('mergeDriveWithLocal remote deletes', () => {
  const nbWith = (pages) => ({ notebooks: [{ id: 'n1', driveFolderId: 'dn1', tabs: [{ id: 't1', driveFolderId: 'dt1', pages }] }] });
  it('drops a local page whose Drive file is gone when the listing is complete', () => {
    const local = nbWith([{ id: 'p1', driveFileId: 'f1' }, { id: 'p2', driveFileId: 'f2' }]);
    const drive = { ...nbWith([{ id: 'p1', driveFileId: 'f1' }]), complete: true };
    const out = mergeDriveWithLocal(local, drive, {});
    expect(out.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p1']);
  });
  it('keeps the page when it has pending local ops or the listing is incomplete', () => {
    const local = nbWith([{ id: 'p1', driveFileId: 'f1' }, { id: 'p2', driveFileId: 'f2' }]);
    const drive = nbWith([{ id: 'p1', driveFileId: 'f1' }]);
    expect(mergeDriveWithLocal(local, drive, { pendingPageIds: new Set(['p2']) }).notebooks[0].tabs[0].pages).toHaveLength(2);
    expect(mergeDriveWithLocal(local, { ...drive, complete: false }, {}).notebooks[0].tabs[0].pages).toHaveLength(2);
  });
  it('never drops unsynced local pages (no Drive file yet)', () => {
    const local = nbWith([{ id: 'p1', driveFileId: 'f1' }, { id: 'new' }]);
    const drive = { ...nbWith([{ id: 'p1', driveFileId: 'f1' }]), complete: true };
    expect(mergeDriveWithLocal(local, drive, {}).notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p1', 'new']);
  });
});
