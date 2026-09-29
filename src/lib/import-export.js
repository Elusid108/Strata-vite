import { COLORS, TREE_VERSION } from './constants';
import { generateId, getNextTabColor } from './utils';
import { normalizePageContent, treeToRows } from './tree-operations';
import { isLinkPage, findNotebook, findTab, findPageContext } from './sync-merge';

/**
 * Portable import/export of pages, sections (tabs) and notebooks.
 *
 * File format (`.strata.json`):
 *   { format: 'strata-export', version: 1, exportedAt, appVersion,
 *     items: [{ kind: 'page'|'tab'|'notebook', data: {...} }] }
 *
 * Everything here is pure except the two browser helpers at the bottom.
 */

export const EXPORT_FORMAT = 'strata-export';
export const EXPORT_VERSION = 1;
export const EXPORT_EXTENSION = '.strata.json';
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 500;
export const MAX_IMPORT_PAGES = 5000;

const KINDS = ['page', 'tab', 'notebook'];

// Drive bookkeeping that must never travel between accounts.
const PAGE_DRIVE_FIELDS = ['driveFileId', 'driveLinkFileId', 'driveEtag', 'driveModifiedTime', 'driveModifiedAt', 'googleFileId'];
const CONTAINER_DRIVE_FIELDS = ['driveFolderId', 'driveEtag'];

const clone = (v) => JSON.parse(JSON.stringify(v));
const isBlockPage = (page) => !page.type || page.type === 'block';

// ---------------------------------------------------------------------------
// Export: sanitize
// ---------------------------------------------------------------------------

export function sanitizePageForExport(page) {
  const out = clone(page);
  const link = isLinkPage(page);
  for (const f of PAGE_DRIVE_FIELDS) {
    // For link pages driveFileId identifies the linked Doc/Sheet itself, keep it.
    if (link && f === 'driveFileId') continue;
    delete out[f];
  }
  delete out.starred;
  delete out.rows;
  if (isBlockPage(page) && !link) {
    out.content = normalizePageContent(page);
    delete out.type;
  }
  return out;
}

export function sanitizeTabForExport(tab) {
  return {
    id: tab.id,
    name: tab.name,
    icon: tab.icon,
    color: tab.color,
    pages: (tab.pages || []).map(sanitizePageForExport),
  };
}

export function sanitizeNotebookForExport(nb) {
  return {
    id: nb.id,
    name: nb.name,
    icon: nb.icon,
    tabs: (nb.tabs || []).map(sanitizeTabForExport),
  };
}

// ---------------------------------------------------------------------------
// Export: build
// ---------------------------------------------------------------------------

export function buildExport(items, { appVersion } = {}) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion || undefined,
    items,
  };
}

export function serializeExport(envelope) {
  return JSON.stringify(envelope, null, 2);
}

export function suggestFilename(name) {
  const safe = String(name || '')
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${safe || 'strata-export'}${EXPORT_EXTENSION}`;
}

/**
 * Find an item in the tree and build a single-item export envelope.
 * @returns {{ envelope: object, filename: string }}
 */
export function exportItemFromData(data, kind, id, { appVersion } = {}) {
  let item = null;
  let name = '';
  if (kind === 'notebook') {
    const nb = findNotebook(data, id);
    if (nb) {
      item = { kind, data: sanitizeNotebookForExport(nb) };
      name = nb.name;
    }
  } else if (kind === 'tab') {
    for (const nb of data?.notebooks || []) {
      const tab = findTab(data, nb.id, id);
      if (tab) {
        item = { kind, data: sanitizeTabForExport(tab) };
        name = tab.name;
        break;
      }
    }
  } else if (kind === 'page') {
    const ctx = findPageContext(data, id);
    if (ctx) {
      item = { kind, data: sanitizePageForExport(ctx.page) };
      name = ctx.page.name;
    }
  }
  if (!item) throw new Error('Item not found');
  return { envelope: buildExport([item], { appVersion }), filename: suggestFilename(name) };
}

// ---------------------------------------------------------------------------
// Import: validate / parse
// ---------------------------------------------------------------------------

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function countPages(item) {
  if (item.kind === 'page') return 1;
  if (item.kind === 'tab') return (item.data.pages || []).length;
  return (item.data.tabs || []).reduce((n, t) => n + (t.pages || []).length, 0);
}

export function validateExport(obj) {
  if (!isObj(obj)) return { ok: false, error: 'Not a Strata export file' };
  if (obj.format !== EXPORT_FORMAT) return { ok: false, error: 'Not a Strata export file' };
  if (typeof obj.version !== 'number') return { ok: false, error: 'Missing file version' };
  if (obj.version > EXPORT_VERSION) return { ok: false, error: 'Created by a newer Strata; please update' };
  if (!Array.isArray(obj.items) || obj.items.length === 0) return { ok: false, error: 'File contains no items' };
  if (obj.items.length > MAX_IMPORT_ITEMS) return { ok: false, error: 'Too many items in file' };
  let pages = 0;
  for (const item of obj.items) {
    if (!isObj(item) || !KINDS.includes(item.kind)) return { ok: false, error: 'Unknown item kind' };
    if (!isObj(item.data) || typeof item.data.name !== 'string') return { ok: false, error: 'Item is missing a name' };
    if (item.kind === 'tab' && !Array.isArray(item.data.pages)) return { ok: false, error: 'Section is missing pages' };
    if (item.kind === 'notebook') {
      if (!Array.isArray(item.data.tabs)) return { ok: false, error: 'Notebook is missing sections' };
      for (const t of item.data.tabs) {
        if (!isObj(t) || !Array.isArray(t.pages)) return { ok: false, error: 'Section is missing pages' };
      }
    }
    pages += countPages(item);
  }
  if (pages > MAX_IMPORT_PAGES) return { ok: false, error: 'Too many pages in file' };
  return { ok: true };
}

export function parseExport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  const v = validateExport(obj);
  if (!v.ok) throw new Error(v.error);
  return obj;
}

// ---------------------------------------------------------------------------
// Import: regenerate ids
// ---------------------------------------------------------------------------

/** Fresh id for every node in a v2 block tree (rows, columns, blocks). */
export function regenerateTreeIds(tree) {
  const walk = (node) => {
    if (!isObj(node)) return node;
    const next = { ...node };
    if ('id' in next) next.id = generateId();
    if (Array.isArray(next.children)) next.children = next.children.map(walk);
    return next;
  };
  const src = clone(tree || { version: TREE_VERSION, children: [] });
  return { ...src, children: (src.children || []).map(walk) };
}

export function regeneratePageIds(page, { now = Date.now() } = {}) {
  const out = clone(page);
  const link = isLinkPage(page);
  out.id = generateId();
  for (const f of PAGE_DRIVE_FIELDS) {
    if (link && f === 'driveFileId') continue;
    delete out[f];
  }
  out.starred = false;
  out.createdAt = now;
  out.modifiedAt = now;
  if (isBlockPage(page) && !link) {
    // Block ids must be unique app-wide (editor state is keyed by them).
    out.content = regenerateTreeIds(normalizePageContent(page));
    out.rows = treeToRows(out.content);
    delete out.type;
  }
  // Database column/row ids are page-local and referenced by cell keys: keep them.
  return out;
}

const isColorName = (c) => COLORS.some((x) => x.name === c);

export function regenerateTabIds(tab, { color, now = Date.now() } = {}) {
  const pages = (tab.pages || []).map((p) => regeneratePageIds(p, { now }));
  return {
    id: generateId(),
    name: tab.name || 'New Tab',
    icon: tab.icon || '📋',
    color: color || (isColorName(tab.color) ? tab.color : COLORS[0].name),
    pages,
    activePageId: pages[0]?.id ?? null,
  };
}

export function regenerateNotebookIds(nb, { now = Date.now() } = {}) {
  const tabs = [];
  for (const t of nb.tabs || []) {
    const color = isColorName(t.color) ? t.color : getNextTabColor(tabs);
    tabs.push(regenerateTabIds(t, { color, now }));
  }
  return {
    id: generateId(),
    name: nb.name || 'New Notebook',
    icon: nb.icon || '📓',
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Import: prepare (random) + insert (deterministic)
// ---------------------------------------------------------------------------

/**
 * Regenerate every id in the envelope once. The result is fed to insertImport,
 * which is deterministic and therefore safe as a React functional updater.
 */
export function prepareImport(envelope, { now = Date.now() } = {}) {
  const items = envelope.items.map((item) => {
    if (item.kind === 'page') return { kind: 'page', data: regeneratePageIds(item.data, { now }) };
    if (item.kind === 'tab') return { kind: 'tab', data: regenerateTabIds(item.data, { now }) };
    return { kind: 'notebook', data: regenerateNotebookIds(item.data, { now }) };
  });
  return { items };
}

const IMPORTED_NOTEBOOK_NAME = 'Imported';

/**
 * Place prepared items into the tree.
 *   page     -> active tab (fallback: active notebook's first tab, else a new "Imported" notebook)
 *   tab      -> active notebook (fallback: a new "Imported" notebook)
 *   notebook -> root
 * @returns {{ data, selection: {notebookId,tabId,pageId}|null, summary: {pages,tabs,notebooks,linkPages}, warnings: string[] }}
 */
export function insertImport(base, prepared, { activeNotebookId, activeTabId } = {}) {
  const data = clone(base || { notebooks: [] });
  if (!Array.isArray(data.notebooks)) data.notebooks = [];
  const summary = { pages: 0, tabs: 0, notebooks: 0, linkPages: 0 };
  let selection = null;
  let importedNb = null; // lazily created fallback notebook

  const countLinks = (pages) => {
    for (const p of pages) if (isLinkPage(p)) summary.linkPages += 1;
  };

  const ensureFallbackNotebook = () => {
    if (importedNb) return importedNb;
    importedNb = { id: generateId(), name: IMPORTED_NOTEBOOK_NAME, icon: '📥', tabs: [], activeTabId: null };
    data.notebooks.push(importedNb);
    summary.notebooks += 1;
    return importedNb;
  };

  const targetNotebook = () => data.notebooks.find((n) => n.id === activeNotebookId) || null;

  const targetTab = () => {
    const nb = targetNotebook();
    if (nb) {
      const t = nb.tabs?.find((x) => x.id === activeTabId) || nb.tabs?.[0];
      if (t) return { nb, tab: t };
    }
    const fb = ensureFallbackNotebook();
    if (!fb.tabs.length) {
      const tab = { id: generateId(), name: 'Imported', icon: '📋', color: COLORS[0].name, pages: [], activePageId: null };
      fb.tabs.push(tab);
      fb.activeTabId = tab.id;
      summary.tabs += 1;
    }
    return { nb: fb, tab: fb.tabs[0] };
  };

  for (const item of prepared.items) {
    if (item.kind === 'page') {
      const { nb, tab } = targetTab();
      tab.pages = [...(tab.pages || []), item.data];
      tab.activePageId = item.data.id;
      summary.pages += 1;
      countLinks([item.data]);
      if (!selection) selection = { notebookId: nb.id, tabId: tab.id, pageId: item.data.id };
    } else if (item.kind === 'tab') {
      const nb = targetNotebook() || ensureFallbackNotebook();
      const tab = { ...item.data, color: isColorName(item.data.color) ? item.data.color : getNextTabColor(nb.tabs) };
      nb.tabs = [...(nb.tabs || []), tab];
      nb.activeTabId = tab.id;
      summary.tabs += 1;
      summary.pages += tab.pages.length;
      countLinks(tab.pages);
      if (!selection) selection = { notebookId: nb.id, tabId: tab.id, pageId: tab.activePageId };
    } else {
      const nb = item.data;
      data.notebooks.push(nb);
      summary.notebooks += 1;
      summary.tabs += nb.tabs.length;
      for (const t of nb.tabs) {
        summary.pages += t.pages.length;
        countLinks(t.pages);
      }
      if (!selection) {
        const t = nb.tabs[0];
        selection = { notebookId: nb.id, tabId: t?.id ?? null, pageId: t?.activePageId ?? null };
      }
    }
  }

  const warnings = [];
  if (summary.linkPages > 0) {
    warnings.push(`${summary.linkPages} linked page${summary.linkPages === 1 ? '' : 's'} may require access to the original files`);
  }
  return { data, selection, summary, warnings };
}

export function describeImportSummary(summary) {
  const parts = [];
  if (summary.notebooks) parts.push(`${summary.notebooks} notebook${summary.notebooks === 1 ? '' : 's'}`);
  if (summary.tabs) parts.push(`${summary.tabs} section${summary.tabs === 1 ? '' : 's'}`);
  if (summary.pages) parts.push(`${summary.pages} page${summary.pages === 1 ? '' : 's'}`);
  return parts.join(', ') || 'nothing';
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

export function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    if (file.size > MAX_IMPORT_BYTES) return reject(new Error('File too large (max 25 MB)'));
    if (typeof file.text === 'function') {
      file.text().then(resolve, () => reject(new Error('Could not read file')));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}
