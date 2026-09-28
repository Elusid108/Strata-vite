/*
 * Pull side of sync: turn a Drive `changes.list` batch into a new local tree.
 *
 * Pure functions only. The caller (useGoogleDrive) fetches page JSON for the
 * file ids returned by planPageFetches and hands the results to applyDriveChanges.
 */

import { generateId } from './utils';
import { isLinkPage, pageJsonFileId, mergePageVersions, pageFromDriveJson } from './sync-merge';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SYSTEM_FILES = new Set(['strata_index.json', 'manifest.json', 'index.html']);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Index every Drive id we know about, with the path to reach it. */
export function indexTree(data) {
  const notebooks = new Map();
  const tabs = new Map();
  const pages = new Map();
  for (const nb of data?.notebooks || []) {
    if (nb.driveFolderId) notebooks.set(nb.driveFolderId, nb);
    for (const tab of nb.tabs || []) {
      if (tab.driveFolderId) tabs.set(tab.driveFolderId, { notebook: nb, tab });
      for (const page of tab.pages || []) {
        const fileId = pageJsonFileId(page);
        if (fileId) pages.set(fileId, { notebook: nb, tab, page });
      }
    }
  }
  return { notebooks, tabs, pages };
}

function isRelevantChange(change, rootFolderId, idx) {
  if (change.removed) return idx.notebooks.has(change.fileId) || idx.tabs.has(change.fileId) || idx.pages.has(change.fileId);
  const file = change.file;
  if (!file) return false;
  if (file.trashed) return idx.notebooks.has(file.id) || idx.tabs.has(file.id) || idx.pages.has(file.id);
  const parents = file.parents || [];
  if (parents.includes(rootFolderId)) return true;
  return parents.some((p) => idx.notebooks.has(p) || idx.tabs.has(p)) || idx.pages.has(file.id) || idx.tabs.has(file.id) || idx.notebooks.has(file.id);
}

/**
 * Which page JSON files need their content fetched before applying?
 * Skips our own writes (Drive modifiedTime matches what we stored) and files
 * we are about to trash.
 */
export function planPageFetches(data, changes, rootFolderId, { tombstoneIds = new Set() } = {}) {
  const idx = indexTree(data);
  const fetches = [];
  for (const change of changes) {
    const file = change.file;
    if (change.removed || !file || file.trashed) continue;
    if (file.mimeType === FOLDER_MIME) continue;
    if (SYSTEM_FILES.has(file.name)) continue;
    if (tombstoneIds.has(file.id)) continue;
    if (!isRelevantChange(change, rootFolderId, idx)) continue;
    const parents = file.parents || [];
    const parentTab = parents.map((p) => idx.tabs.get(p)).find(Boolean);
    const known = idx.pages.get(file.id);
    if (!parentTab && !known) continue;
    if (known && known.page.driveModifiedTime && known.page.driveModifiedTime === file.modifiedTime) continue;
    fetches.push(file.id);
  }
  return Array.from(new Set(fetches));
}

function sortChanges(changes, rootFolderId) {
  // Folders under root first, then other folders, then files, oldest first.
  const rank = (c) => {
    const f = c.file;
    if (c.removed || !f || f.trashed) return 3;
    if (f.mimeType === FOLDER_MIME) return (f.parents || []).includes(rootFolderId) ? 0 : 1;
    return 2;
  };
  return [...changes].sort((a, b) => rank(a) - rank(b) || String(a.time || '').localeCompare(String(b.time || '')));
}

/**
 * Apply a batch of Drive changes to the local tree.
 *
 * @param {Object} data - local tree
 * @param {Array} changes - from GoogleAPI.getDriveChanges
 * @param {string} rootFolderId
 * @param {{ contents?: Map<string, Object>, pendingPageIds?: Set<string>, tombstoneIds?: Set<string> }} opts
 *   contents: fileId -> parsed page JSON (from planPageFetches)
 * @returns {{ data: Object, changed: boolean, indexChanged: boolean, reupload: string[], conflictCopies: string[], removedPageIds: string[] }}
 */
export function applyDriveChanges(data, changes, rootFolderId, opts = {}) {
  const contents = opts.contents || new Map();
  const pendingPageIds = opts.pendingPageIds || new Set();
  const tombstoneIds = opts.tombstoneIds || new Set();
  const next = clone(data || { notebooks: [] });
  let changed = false;
  let indexChanged = false;
  const reupload = [];
  const conflictCopies = [];
  const removedPageIds = [];

  const idx = () => indexTree(next);

  const removeById = (driveId) => {
    const i = idx();
    if (i.notebooks.has(driveId)) {
      next.notebooks = next.notebooks.filter((nb) => nb.driveFolderId !== driveId);
      changed = true;
      return;
    }
    if (i.tabs.has(driveId)) {
      for (const nb of next.notebooks) nb.tabs = (nb.tabs || []).filter((t) => t.driveFolderId !== driveId);
      changed = true;
      return;
    }
    const found = i.pages.get(driveId);
    if (found) {
      if (pendingPageIds.has(found.page.id)) {
        // We have unsynced edits: keep the page but forget the trashed file so
        // the pending op recreates it instead of writing into the trash.
        if (isLinkPage(found.page)) found.page.driveLinkFileId = null;
        else found.page.driveFileId = null;
        found.page.driveEtag = null;
        found.page.driveModifiedTime = null;
        changed = true;
        return;
      }
      found.tab.pages = found.tab.pages.filter((p) => p.id !== found.page.id);
      if (found.tab.activePageId === found.page.id) found.tab.activePageId = found.tab.pages[0]?.id || null;
      if (Array.isArray(next.favoritesOrder)) next.favoritesOrder = next.favoritesOrder.filter((id) => id !== found.page.id);
      removedPageIds.push(found.page.id);
      changed = true;
    }
  };

  for (const change of sortChanges(changes, rootFolderId)) {
    const file = change.file;
    const fileId = change.fileId || file?.id;
    if (!fileId) continue;

    if (change.removed || (file && file.trashed)) {
      if (tombstoneIds.has(fileId)) continue; // our own delete
      removeById(fileId);
      continue;
    }
    if (!file) continue;
    if (file.name === 'strata_index.json' && (file.parents || []).includes(rootFolderId)) {
      indexChanged = true;
      continue;
    }
    if (SYSTEM_FILES.has(file.name)) continue;

    const i = idx();
    const parents = file.parents || [];
    const props = file.properties || {};

    if (file.mimeType === FOLDER_MIME) {
      if (file.name === '_STRATA_TRASH') continue;
      const knownNb = i.notebooks.get(fileId);
      const knownTab = i.tabs.get(fileId);
      const parentNb = parents.map((p) => i.notebooks.get(p)).find(Boolean);
      const underRoot = parents.includes(rootFolderId);

      if (knownNb) {
        if (knownNb.name !== file.name || (props.strata_icon && knownNb.icon !== props.strata_icon)) {
          knownNb.name = file.name;
          if (props.strata_icon) knownNb.icon = props.strata_icon;
          changed = true;
        }
        continue;
      }
      if (knownTab) {
        const { notebook, tab } = knownTab;
        let dirty = false;
        if (tab.name !== file.name) { tab.name = file.name; dirty = true; }
        if (props.strata_icon && tab.icon !== props.strata_icon) { tab.icon = props.strata_icon; dirty = true; }
        if (props.strata_tabColor && tab.color !== props.strata_tabColor) { tab.color = props.strata_tabColor; dirty = true; }
        if (parentNb && parentNb.id !== notebook.id) {
          notebook.tabs = notebook.tabs.filter((t) => t.id !== tab.id);
          parentNb.tabs = [...(parentNb.tabs || []), tab];
          dirty = true;
        }
        if (dirty) changed = true;
        continue;
      }
      if (underRoot) {
        next.notebooks.push({
          id: props.strata_appId || generateId(),
          name: file.name,
          icon: props.strata_icon || '📓',
          driveFolderId: fileId,
          driveEtag: null,
          tabs: [],
          activeTabId: null,
        });
        changed = true;
        continue;
      }
      if (parentNb) {
        const tab = {
          id: props.strata_appId || generateId(),
          name: file.name,
          icon: props.strata_icon || '📋',
          color: props.strata_tabColor || 'blue',
          driveFolderId: fileId,
          driveEtag: null,
          pages: [],
          activePageId: null,
        };
        parentNb.tabs = [...(parentNb.tabs || []), tab];
        if (!parentNb.activeTabId) parentNb.activeTabId = tab.id;
        changed = true;
      }
      continue;
    }

    // Page JSON file
    const known = i.pages.get(fileId);
    const parentTab = parents.map((p) => i.tabs.get(p)).find(Boolean);
    const json = contents.get(fileId) || null;

    if (known) {
      const { tab, page } = known;
      // Moved between tabs?
      if (parentTab && parentTab.tab.id !== tab.id) {
        tab.pages = tab.pages.filter((p) => p.id !== page.id);
        parentTab.tab.pages = [...(parentTab.tab.pages || []), page];
        changed = true;
      }
      if (!json) continue;
      const remote = pageFromDriveJson(json, page, { jsonFileId: fileId, modifiedTime: file.modifiedTime });
      const result = mergePageVersions(page, remote);
      Object.keys(page).forEach((k) => delete page[k]);
      Object.assign(page, result.page);
      if (result.strategy !== 'local') changed = true;
      if (result.strategy === 'merged') reupload.push(page.id);
      if (result.conflictCopy) {
        const home = parentTab?.tab || tab;
        home.pages = [...home.pages, result.conflictCopy];
        conflictCopies.push(result.conflictCopy.id);
        changed = true;
      }
      continue;
    }

    if (!parentTab || !json) continue;
    const created = pageFromDriveJson(json, { id: json.id || props.strata_appId || generateId(), icon: props.strata_icon }, {
      jsonFileId: fileId,
      modifiedTime: file.modifiedTime,
    });
    if ((parentTab.tab.pages || []).some((p) => p.id === created.id)) continue;
    parentTab.tab.pages = [...(parentTab.tab.pages || []), created];
    if (!parentTab.tab.activePageId) parentTab.tab.activePageId = created.id;
    changed = true;
  }

  return { data: next, changed, indexChanged, reupload, conflictCopies, removedPageIds };
}

/**
 * Re-apply notebook/tab/page ordering from strata_index.json (Drive ids).
 */
export function applyIndexOrder(data, indexData) {
  if (!indexData || !data?.notebooks) return data;
  const orderBy = (items, keyFn, order) => {
    if (!Array.isArray(order) || !order.length) return items;
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...items]
      .map((item, i) => ({ item, i, rank: pos.has(keyFn(item)) ? pos.get(keyFn(item)) : order.length + i }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.item);
  };
  const notebooks = orderBy(data.notebooks, (nb) => nb.driveFolderId, indexData.notebooks).map((nb) => {
    const tabs = orderBy(nb.tabs || [], (t) => t.driveFolderId, indexData.tabs?.[nb.driveFolderId]).map((tab) => ({
      ...tab,
      pages: orderBy(tab.pages || [], (p) => pageJsonFileId(p), indexData.pages?.[tab.driveFolderId]),
    }));
    return { ...nb, tabs };
  });
  return { ...data, notebooks };
}
