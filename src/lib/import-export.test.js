import { describe, it, expect } from 'vitest';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  sanitizePageForExport,
  sanitizeTabForExport,
  sanitizeNotebookForExport,
  buildExport,
  serializeExport,
  parseExport,
  validateExport,
  exportItemFromData,
  suggestFilename,
  regeneratePageIds,
  regenerateNotebookIds,
  prepareImport,
  insertImport,
  readFileAsText,
} from './import-export';
import { treeToRows } from './tree-operations';
import { TREE_VERSION, COLORS } from './constants';

const blockPage = () => ({
  id: 'p1',
  name: 'Notes',
  icon: '📄',
  starred: true,
  driveFileId: 'df1',
  driveEtag: 'e1',
  driveModifiedTime: 'x',
  driveModifiedAt: 1,
  googleFileId: 'g1',
  createdAt: 1,
  modifiedAt: 2,
  content: {
    version: TREE_VERSION,
    children: [
      { id: 'b1', type: 'text', content: 'hi' },
      { id: 'r1', type: 'row', children: [{ id: 'c1', type: 'column', children: [{ id: 'b2', type: 'text', content: 'x' }] }] },
    ],
  },
  rows: [{ id: 'legacy' }],
});

const dbPage = () => ({
  id: 'p2', name: 'DB', type: 'database', driveFileId: 'df2',
  content: { schema: { columns: [{ id: 'c1', name: 'A', type: 'text' }] }, rows: [{ id: 'r1', c1: 'v' }] },
});

const codePage = () => ({
  id: 'p3', name: 'Tool', type: 'mermaid', codeType: 'javascript', code: 'x', mermaidCode: '', driveFileId: 'df3', driveEtag: 'e',
});

const linkPage = () => ({
  id: 'p4', name: 'Doc', type: 'google-doc', embedUrl: 'https://docs.google.com/x', driveFileId: 'targetDoc', driveLinkFileId: 'linkJson', driveEtag: 'e',
});

const tree = () => ({
  favoritesOrder: ['p1'],
  notebooks: [
    { id: 'n1', name: 'NB', icon: '📓', driveFolderId: 'dn1', driveEtag: 'x', activeTabId: 't1', tabs: [
      { id: 't1', name: 'Tab', icon: '📋', color: 'blue', driveFolderId: 'dt1', activePageId: 'p1', pages: [blockPage(), dbPage()] },
      { id: 't2', name: 'Tab2', color: 'red', pages: [codePage(), linkPage()] },
    ] },
  ],
});

const collectTreeIds = (t) => {
  const ids = [];
  const walk = (n) => { if (n?.id) ids.push(n.id); (n?.children || []).forEach(walk); };
  (t.children || []).forEach(walk);
  return ids;
};

describe('export sanitize', () => {
  it('strips drive fields, starred and rows from block pages', () => {
    const out = sanitizePageForExport(blockPage());
    for (const f of ['driveFileId', 'driveEtag', 'driveModifiedTime', 'driveModifiedAt', 'googleFileId', 'starred', 'rows', 'type']) {
      expect(out).not.toHaveProperty(f);
    }
    expect(out.content.version).toBe(TREE_VERSION);
    expect(out.name).toBe('Notes');
  });

  it('keeps database content and code fields', () => {
    expect(sanitizePageForExport(dbPage()).content.schema.columns[0].id).toBe('c1');
    const c = sanitizePageForExport(codePage());
    expect(c.code).toBe('x');
    expect(c.codeType).toBe('javascript');
    expect(c).not.toHaveProperty('driveFileId');
  });

  it('keeps driveFileId only for link pages', () => {
    const l = sanitizePageForExport(linkPage());
    expect(l.driveFileId).toBe('targetDoc');
    expect(l).not.toHaveProperty('driveLinkFileId');
    expect(l).not.toHaveProperty('driveEtag');
  });

  it('exports legacy rows-only pages as v2 trees', () => {
    const legacy = { id: 'x', name: 'L', rows: [{ id: 'r', type: 'text', content: 'a' }] };
    const out = sanitizePageForExport(legacy);
    expect(out.content.version).toBe(TREE_VERSION);
    expect(out).not.toHaveProperty('rows');
  });

  it('sanitizes tabs and notebooks recursively', () => {
    const nb = sanitizeNotebookForExport(tree().notebooks[0]);
    expect(nb).not.toHaveProperty('driveFolderId');
    expect(nb).not.toHaveProperty('activeTabId');
    expect(nb.tabs[0]).not.toHaveProperty('activePageId');
    expect(nb.tabs[0]).not.toHaveProperty('driveFolderId');
    expect(nb.tabs[0].pages[0]).not.toHaveProperty('driveFileId');
    expect(sanitizeTabForExport(tree().notebooks[0].tabs[0]).color).toBe('blue');
  });
});

describe('envelope', () => {
  it('round-trips through serialize/parse', () => {
    const env = buildExport([{ kind: 'page', data: sanitizePageForExport(blockPage()) }], { appVersion: '4.0.0' });
    const parsed = parseExport(serializeExport(env));
    expect(parsed.format).toBe(EXPORT_FORMAT);
    expect(parsed.version).toBe(EXPORT_VERSION);
    expect(parsed.items[0].data.name).toBe('Notes');
  });

  it('exportItemFromData finds pages, tabs and notebooks', () => {
    expect(exportItemFromData(tree(), 'page', 'p3').envelope.items[0].kind).toBe('page');
    expect(exportItemFromData(tree(), 'tab', 't2').filename).toBe('Tab2.strata.json');
    expect(exportItemFromData(tree(), 'notebook', 'n1').envelope.items[0].data.tabs).toHaveLength(2);
    expect(() => exportItemFromData(tree(), 'page', 'nope')).toThrow('Item not found');
  });

  it('suggests safe filenames', () => {
    expect(suggestFilename('My Tool / v2!')).toBe('My-Tool-v2.strata.json');
    expect(suggestFilename('')).toBe('strata-export.strata.json');
  });

  it('validates', () => {
    expect(() => parseExport('{')).toThrow('not valid JSON');
    expect(validateExport({ format: 'nope', version: 1, items: [] }).ok).toBe(false);
    expect(validateExport({ format: EXPORT_FORMAT, version: 99, items: [{ kind: 'page', data: { name: 'x' } }] }).error).toMatch(/newer/);
    expect(validateExport({ format: EXPORT_FORMAT, version: 1, items: [] }).ok).toBe(false);
    expect(validateExport({ format: EXPORT_FORMAT, version: 1, items: [{ kind: 'thing', data: { name: 'x' } }] }).ok).toBe(false);
    expect(validateExport({ format: EXPORT_FORMAT, version: 1, items: [{ kind: 'page', data: {} }] }).ok).toBe(false);
    expect(validateExport({ format: EXPORT_FORMAT, version: 1, items: [{ kind: 'tab', data: { name: 'x' } }] }).ok).toBe(false);
    expect(validateExport({ format: EXPORT_FORMAT, version: 1, items: [{ kind: 'notebook', data: { name: 'x', tabs: [{ name: 't' }] } }] }).ok).toBe(false);
    expect(validateExport({ format: EXPORT_FORMAT, version: 1, items: [{ kind: 'page', data: { name: 'x' } }] }).ok).toBe(true);
  });
});

describe('id regeneration', () => {
  it('gives block pages entirely new ids and rebuilds rows', () => {
    const src = sanitizePageForExport(blockPage());
    const out = regeneratePageIds(src, { now: 42 });
    expect(out.id).not.toBe(src.id);
    const before = new Set(collectTreeIds(src.content));
    const after = collectTreeIds(out.content);
    expect(after).toHaveLength(before.size);
    expect(after.some((id) => before.has(id))).toBe(false);
    expect(out.rows).toEqual(treeToRows(out.content));
    expect(out.createdAt).toBe(42);
    expect(out.modifiedAt).toBe(42);
    expect(out.starred).toBe(false);
    expect(out).not.toHaveProperty('type');
  });

  it('keeps database column and row ids', () => {
    const out = regeneratePageIds(dbPage());
    expect(out.content.schema.columns[0].id).toBe('c1');
    expect(out.content.rows[0].c1).toBe('v');
    expect(out).not.toHaveProperty('driveFileId');
  });

  it('regenerates notebooks with distinct ids and valid colors', () => {
    const nb = sanitizeNotebookForExport(tree().notebooks[0]);
    nb.tabs[1].color = 'not-a-color';
    const a = regenerateNotebookIds(nb);
    const b = regenerateNotebookIds(nb);
    expect(a.id).not.toBe(b.id);
    expect(a.tabs[0].id).not.toBe(b.tabs[0].id);
    expect(a.tabs[0].pages[0].id).not.toBe(b.tabs[0].pages[0].id);
    expect(a.activeTabId).toBe(a.tabs[0].id);
    expect(a.tabs[0].activePageId).toBe(a.tabs[0].pages[0].id);
    expect(COLORS.some((c) => c.name === a.tabs[1].color)).toBe(true);
  });
});

describe('insertImport', () => {
  const env = (items) => ({ format: EXPORT_FORMAT, version: 1, items });

  it('places a page in the active tab and selects it', () => {
    const base = tree();
    const prepared = prepareImport(env([{ kind: 'page', data: sanitizePageForExport(codePage()) }]));
    const r = insertImport(base, prepared, { activeNotebookId: 'n1', activeTabId: 't2' });
    expect(r.data.notebooks[0].tabs[1].pages).toHaveLength(3);
    expect(r.selection).toEqual({ notebookId: 'n1', tabId: 't2', pageId: prepared.items[0].data.id });
    expect(r.summary).toEqual({ pages: 1, tabs: 0, notebooks: 0, linkPages: 0 });
    expect(base).toEqual(tree()); // not mutated
  });

  it('places a tab in the active notebook and a notebook at root', () => {
    const prepared = prepareImport(env([
      { kind: 'tab', data: sanitizeTabForExport(tree().notebooks[0].tabs[0]) },
      { kind: 'notebook', data: sanitizeNotebookForExport(tree().notebooks[0]) },
    ]));
    const r = insertImport(tree(), prepared, { activeNotebookId: 'n1', activeTabId: 't1' });
    expect(r.data.notebooks[0].tabs).toHaveLength(3);
    expect(r.data.notebooks).toHaveLength(2);
    expect(r.summary.notebooks).toBe(1);
    expect(r.summary.tabs).toBe(3);
    expect(r.summary.pages).toBe(6);
    expect(r.selection.tabId).toBe(prepared.items[0].data.id);
  });

  it('falls back to an Imported notebook when there is nowhere to put a page', () => {
    const prepared = prepareImport(env([{ kind: 'page', data: { name: 'Lonely' } }, { kind: 'tab', data: { name: 'T', pages: [] } }]));
    const r = insertImport({ notebooks: [] }, prepared, {});
    expect(r.data.notebooks).toHaveLength(1);
    expect(r.data.notebooks[0].name).toBe('Imported');
    expect(r.data.notebooks[0].tabs).toHaveLength(2);
    expect(r.data.notebooks[0].tabs[0].pages[0].name).toBe('Lonely');
    expect(r.selection.notebookId).toBe(r.data.notebooks[0].id);
  });

  it('warns about linked pages', () => {
    const prepared = prepareImport(env([{ kind: 'page', data: sanitizePageForExport(linkPage()) }]));
    const r = insertImport(tree(), prepared, { activeNotebookId: 'n1', activeTabId: 't1' });
    expect(r.summary.linkPages).toBe(1);
    expect(r.warnings[0]).toMatch(/linked page/);
    expect(r.data.notebooks[0].tabs[0].pages[2].driveFileId).toBe('targetDoc');
  });
});

describe('readFileAsText', () => {
  it('rejects oversized files', async () => {
    await expect(readFileAsText({ size: 30 * 1024 * 1024 })).rejects.toThrow('too large');
  });
  it('reads via file.text()', async () => {
    await expect(readFileAsText({ size: 3, text: async () => 'abc' })).resolves.toBe('abc');
  });
});
