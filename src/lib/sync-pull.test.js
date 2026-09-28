import { describe, it, expect } from 'vitest';
import { applyDriveChanges, planPageFetches, applyIndexOrder } from './sync-pull';

const ROOT = 'root1';
const FOLDER = 'application/vnd.google-apps.folder';
const tree = () => ({
  notebooks: [
    {
      id: 'n1',
      name: 'Work',
      driveFolderId: 'dn1',
      activeTabId: 't1',
      tabs: [
        {
          id: 't1',
          name: 'Tab',
          driveFolderId: 'dt1',
          activePageId: 'p1',
          pages: [
            { id: 'p1', name: 'One', type: 'block', driveFileId: 'f1', modifiedAt: 100, driveModifiedAt: 100, driveModifiedTime: 'T1', content: { version: 2, children: [] }, rows: [] },
            { id: 'p2', name: 'Map', type: 'map', embedUrl: 'https://maps', driveFileId: 'mymap', driveLinkFileId: 'l2', modifiedAt: 50, driveModifiedAt: 50 },
          ],
        },
      ],
    },
  ],
});

const pageJson = (id, name, modifiedAt, blocks = []) => ({
  id,
  type: 'block',
  name,
  modifiedAt,
  content: { version: 2, children: blocks.length ? [{ id: 'r', type: 'row', children: [{ id: 'c', type: 'column', width: 1, children: blocks }] }] : [] },
});

describe('planPageFetches', () => {
  it('fetches changed known pages and new pages in known tabs, skips own writes and folders', () => {
    const changes = [
      { fileId: 'f1', file: { id: 'f1', name: 'One.json', mimeType: 'application/json', parents: ['dt1'], modifiedTime: 'T2' } },
      { fileId: 'l2', file: { id: 'l2', name: 'Map.json', mimeType: 'application/json', parents: ['dt1'], modifiedTime: 'T1' } },
      { fileId: 'new', file: { id: 'new', name: 'New.json', mimeType: 'application/json', parents: ['dt1'], modifiedTime: 'T3' } },
      { fileId: 'dt1', file: { id: 'dt1', name: 'Tab', mimeType: FOLDER, parents: ['dn1'] } },
      { fileId: 'foreign', file: { id: 'foreign', name: 'x.json', mimeType: 'application/json', parents: ['elsewhere'] } },
    ];
    const t = tree();
    expect(planPageFetches(t, changes, ROOT)).toEqual(['f1', 'l2', 'new']);
    t.notebooks[0].tabs[0].pages[0].driveModifiedTime = 'T2';
    expect(planPageFetches(t, changes, ROOT)).toEqual(['l2', 'new']);
  });
});

describe('applyDriveChanges', () => {
  it('removes a page trashed on another device', () => {
    const res = applyDriveChanges(tree(), [{ fileId: 'f1', removed: true }], ROOT);
    expect(res.changed).toBe(true);
    expect(res.removedPageIds).toEqual(['p1']);
    expect(res.data.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p2']);
    expect(res.data.notebooks[0].tabs[0].activePageId).toBe('p2');
  });

  it('ignores our own tombstoned deletes', () => {
    const res = applyDriveChanges(tree(), [{ fileId: 'f1', removed: true }], ROOT, { tombstoneIds: new Set(['f1']) });
    expect(res.changed).toBe(false);
  });

  it('keeps a page with pending local edits but forgets the trashed file id', () => {
    const res = applyDriveChanges(tree(), [{ fileId: 'f1', file: { id: 'f1', trashed: true } }], ROOT, { pendingPageIds: new Set(['p1']) });
    const p1 = res.data.notebooks[0].tabs[0].pages.find((p) => p.id === 'p1');
    expect(p1).toBeTruthy();
    expect(p1.driveFileId).toBeNull();
  });

  it('adopts remote content when local has no unsynced edits', () => {
    const contents = new Map([['f1', pageJson('p1', 'Renamed remotely', 200, [{ id: 'b1', type: 'text', content: 'hi' }])]]);
    const changes = [{ fileId: 'f1', file: { id: 'f1', name: 'Renamed remotely.json', mimeType: 'application/json', parents: ['dt1'], modifiedTime: 'T2' } }];
    const res = applyDriveChanges(tree(), changes, ROOT, { contents });
    const p1 = res.data.notebooks[0].tabs[0].pages[0];
    expect(res.changed).toBe(true);
    expect(p1.name).toBe('Renamed remotely');
    expect(p1.driveModifiedAt).toBe(200);
    expect(p1.driveModifiedTime).toBe('T2');
    expect(p1.rows[0].columns[0].blocks[0].id).toBe('b1');
    expect(res.reupload).toEqual([]);
  });

  it('union-merges a block page when both sides changed and flags it for re-upload', () => {
    const t = tree();
    const p1 = t.notebooks[0].tabs[0].pages[0];
    p1.modifiedAt = 150; // local edit after last sync (100)
    p1.content = { version: 2, children: [{ id: 'r0', type: 'row', children: [{ id: 'c0', type: 'column', width: 1, children: [{ id: 'local', type: 'text', content: 'mine' }] }] }] };
    const contents = new Map([['f1', pageJson('p1', 'One', 200, [{ id: 'theirs', type: 'text', content: 'theirs' }])]]);
    const changes = [{ fileId: 'f1', file: { id: 'f1', name: 'One.json', mimeType: 'application/json', parents: ['dt1'], modifiedTime: 'T2' } }];
    const res = applyDriveChanges(t, changes, ROOT, { contents, pendingPageIds: new Set(['p1']) });
    const merged = res.data.notebooks[0].tabs[0].pages[0];
    const ids = merged.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.map((b) => b.id)));
    expect(ids).toEqual(['local', 'theirs']);
    expect(res.reupload).toEqual(['p1']);
  });

  it('creates a conflict copy for a non-block page when both sides changed', () => {
    const t = tree();
    const p2 = t.notebooks[0].tabs[0].pages[1];
    p2.modifiedAt = 80;
    const contents = new Map([['l2', { id: 'p2', type: 'map', name: 'Map', embedUrl: 'https://maps/other', driveFileId: 'mymap', modifiedAt: 90 }]]);
    const changes = [{ fileId: 'l2', file: { id: 'l2', name: 'Map.json', mimeType: 'application/json', parents: ['dt1'], modifiedTime: 'T9' } }];
    const res = applyDriveChanges(t, changes, ROOT, { contents });
    const pages = res.data.notebooks[0].tabs[0].pages;
    expect(pages).toHaveLength(3);
    expect(pages[2].name).toMatch(/conflict copy/);
    expect(pages[2].driveLinkFileId).toBeNull();
    expect(res.conflictCopies).toEqual([pages[2].id]);
    expect(pages[1].embedUrl).toBe('https://maps'); // local kept
  });

  it('adds notebooks, tabs and pages created elsewhere, in dependency order', () => {
    const contents = new Map([['fx', pageJson('px', 'Fresh', 5)]]);
    const changes = [
      { fileId: 'fx', time: '3', file: { id: 'fx', name: 'Fresh.json', mimeType: 'application/json', parents: ['dt9'], modifiedTime: 'T', properties: { strata_appId: 'px' } } },
      { fileId: 'dt9', time: '2', file: { id: 'dt9', name: 'New Tab', mimeType: FOLDER, parents: ['dn9'], properties: { strata_appId: 't9', strata_tabColor: 'red' } } },
      { fileId: 'dn9', time: '1', file: { id: 'dn9', name: 'New NB', mimeType: FOLDER, parents: [ROOT], properties: { strata_appId: 'n9', strata_icon: '🧪' } } },
    ];
    const res = applyDriveChanges(tree(), changes, ROOT, { contents });
    const nb = res.data.notebooks.find((n) => n.id === 'n9');
    expect(nb.icon).toBe('🧪');
    expect(nb.tabs[0].id).toBe('t9');
    expect(nb.tabs[0].color).toBe('red');
    expect(nb.tabs[0].pages[0].id).toBe('px');
    expect(nb.tabs[0].pages[0].driveFileId).toBe('fx');
  });

  it('applies renames and moves of tabs and pages', () => {
    const t = tree();
    t.notebooks.push({ id: 'n2', name: 'Other', driveFolderId: 'dn2', tabs: [{ id: 't2', name: 'T2', driveFolderId: 'dt2', pages: [] }] });
    const changes = [
      { fileId: 'dt1', file: { id: 'dt1', name: 'Tab renamed', mimeType: FOLDER, parents: ['dn1'] } },
      { fileId: 'f1', file: { id: 'f1', name: 'One.json', mimeType: 'application/json', parents: ['dt2'], modifiedTime: 'T1' } },
    ];
    const res = applyDriveChanges(t, changes, ROOT);
    expect(res.data.notebooks[0].tabs[0].name).toBe('Tab renamed');
    expect(res.data.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p2']);
    expect(res.data.notebooks[1].tabs[0].pages.map((p) => p.id)).toEqual(['p1']);
  });

  it('flags index changes and ignores other system files', () => {
    const changes = [
      { fileId: 'i', file: { id: 'i', name: 'strata_index.json', mimeType: 'application/json', parents: [ROOT] } },
      { fileId: 'm', file: { id: 'm', name: 'manifest.json', mimeType: 'application/json', parents: [ROOT] } },
    ];
    const res = applyDriveChanges(tree(), changes, ROOT);
    expect(res.indexChanged).toBe(true);
    expect(res.changed).toBe(false);
  });
});

describe('applyIndexOrder', () => {
  it('orders by Drive ids and keeps unknown items at the end', () => {
    const t = tree();
    t.notebooks[0].tabs[0].pages.push({ id: 'p3', driveFileId: 'f3' });
    const out = applyIndexOrder(t, { notebooks: ['dn1'], tabs: { dn1: ['dt1'] }, pages: { dt1: ['f3', 'l2'] } });
    expect(out.notebooks[0].tabs[0].pages.map((p) => p.id)).toEqual(['p3', 'p2', 'p1']);
  });
});
