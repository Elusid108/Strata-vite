/*
 * Drive-ID merge for boot. Local tree + outbox is source of truth until ACK.
 * Drive fills gaps. Tombstones prevent resurrection. Pending page ops keep local JSON.
 *
 * Also hosts the per-page version merge used by both the pull loop and the
 * 412-conflict path in the sync engine.
 */

import { LINK_PAGE_TYPES, TREE_VERSION } from './constants';
import { collectKnownDriveIds } from './reconciler';
import { treeToRows } from './tree-operations';
import { generateId } from './utils';

export function isLinkPage(page) {
  if (!page) return false;
  const type = page.type || 'block';
  return LINK_PAGE_TYPES.includes(type) || !!page.embedUrl;
}

/** The Drive id of the JSON file Strata owns for this page (never the linked doc). */
export function pageJsonFileId(page) {
  if (!page) return null;
  return isLinkPage(page) ? page.driveLinkFileId || null : page.driveFileId || null;
}

export function findNotebook(data, notebookId) {
  return (data?.notebooks || []).find((nb) => nb.id === notebookId) || null;
}

export function findTab(data, notebookId, tabId) {
  const nb = findNotebook(data, notebookId);
  return nb?.tabs?.find((t) => t.id === tabId) || null;
}

export function findPageContext(data, pageId) {
  for (const notebook of data?.notebooks || []) {
    for (const tab of notebook.tabs || []) {
      const page = (tab.pages || []).find((p) => p.id === pageId);
      if (page) return { notebook, tab, page };
    }
  }
  return null;
}

export function findFolderContext(data, { entityType, appId, notebookId }) {
  if (entityType === 'notebook') {
    const notebook = findNotebook(data, appId);
    return notebook ? { notebook } : null;
  }
  const notebook = findNotebook(data, notebookId);
  const tab = notebook?.tabs?.find((t) => t.id === appId);
  return notebook && tab ? { notebook, tab } : null;
}

function pageKeySet(page) {
  return new Set([page.driveLinkFileId, page.driveFileId].filter(Boolean));
}

function pagesMatch(localPage, drivePage) {
  const localKeys = pageKeySet(localPage);
  const driveKeys = pageKeySet(drivePage);
  for (const key of driveKeys) {
    if (localKeys.has(key)) return true;
  }
  if (localPage.id && drivePage.id && localPage.id === drivePage.id) return true;
  return false;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge Drive listing into local tree.
 * @param {Object|null} localData
 * @param {Object|null} driveData
 * @param {{ tombstoneIds: Set<string>, pendingPageIds: Set<string> }} opts
 */
export function mergeDriveWithLocal(localData, driveData, opts = {}) {
  const tombstoneIds = opts.tombstoneIds || new Set();
  const pendingPageIds = opts.pendingPageIds || new Set();
  // Only treat "page missing from Drive" as a remote delete when the Drive
  // listing is known to be complete.
  const trustDeletes = opts.trustDeletes ?? driveData?.complete !== false;
  const local = localData && Array.isArray(localData.notebooks) ? clone(localData) : { notebooks: [] };
  const drive = driveData && Array.isArray(driveData.notebooks) ? clone(driveData) : { notebooks: [] };
  const mergeOpts = { tombstoneIds, pendingPageIds, trustDeletes };

  const localIsEmpty = !local.notebooks.length;
  if (localIsEmpty) {
    return filterTombstonedTree(drive, tombstoneIds);
  }

  const resultNotebooks = [];
  const usedDriveNb = new Set();

  for (const localNb of local.notebooks) {
    if (localNb.driveFolderId && tombstoneIds.has(localNb.driveFolderId)) {
      continue;
    }
    const driveNb = localNb.driveFolderId
      ? drive.notebooks.find((n) => n.driveFolderId === localNb.driveFolderId)
      : null;
    if (driveNb) usedDriveNb.add(driveNb.driveFolderId);
    resultNotebooks.push(mergeNotebook(localNb, driveNb, mergeOpts));
  }

  for (const driveNb of drive.notebooks) {
    if (!driveNb.driveFolderId || usedDriveNb.has(driveNb.driveFolderId)) continue;
    if (tombstoneIds.has(driveNb.driveFolderId)) continue;
    resultNotebooks.push(filterTombstonedNotebook(driveNb, tombstoneIds));
  }

  return {
    ...local,
    notebooks: resultNotebooks,
    favoritesOrder: local.favoritesOrder || drive.favoritesOrder,
  };
}

function mergeNotebook(localNb, driveNb, mergeOpts) {
  const { tombstoneIds } = mergeOpts;
  if (!driveNb) return localNb;

  const resultTabs = [];
  const usedDriveTabs = new Set();

  for (const localTab of localNb.tabs || []) {
    if (localTab.driveFolderId && tombstoneIds.has(localTab.driveFolderId)) continue;
    const driveTab = localTab.driveFolderId
      ? (driveNb.tabs || []).find((t) => t.driveFolderId === localTab.driveFolderId)
      : null;
    if (driveTab?.driveFolderId) usedDriveTabs.add(driveTab.driveFolderId);
    resultTabs.push(mergeTab(localTab, driveTab, mergeOpts));
  }

  for (const driveTab of driveNb.tabs || []) {
    if (!driveTab.driveFolderId || usedDriveTabs.has(driveTab.driveFolderId)) continue;
    if (tombstoneIds.has(driveTab.driveFolderId)) continue;
    resultTabs.push(filterTombstonedTab(driveTab, tombstoneIds));
  }

  return {
    ...localNb,
    name: localNb.name || driveNb.name,
    icon: localNb.icon || driveNb.icon,
    driveFolderId: localNb.driveFolderId || driveNb.driveFolderId,
    driveEtag: localNb.driveEtag || driveNb.driveEtag,
    tabs: resultTabs,
    activeTabId: localNb.activeTabId || resultTabs[0]?.id || null,
  };
}

function mergeTab(localTab, driveTab, mergeOpts) {
  const { tombstoneIds, pendingPageIds, trustDeletes } = mergeOpts;
  if (!driveTab) return localTab;

  const resultPages = [];
  const usedDrivePages = new Set();

  for (const localPage of localTab.pages || []) {
    const localKeys = [...pageKeySet(localPage)];
    if (localKeys.some((id) => tombstoneIds.has(id))) continue;

    const drivePage = (driveTab.pages || []).find((p) => pagesMatch(localPage, p));
    if (drivePage) {
      for (const key of pageKeySet(drivePage)) usedDrivePages.add(key);
    } else if (trustDeletes && pageJsonFileId(localPage) && !pendingPageIds.has(localPage.id)) {
      // Local page claims a Drive file that no longer exists there and nothing
      // is pending for it: it was deleted from another device. Drop it.
      continue;
    }
    resultPages.push(mergePage(localPage, drivePage, pendingPageIds));
  }

  for (const drivePage of driveTab.pages || []) {
    const keys = [...pageKeySet(drivePage)];
    if (keys.some((id) => usedDrivePages.has(id))) continue;
    if (keys.some((id) => tombstoneIds.has(id))) continue;
    resultPages.push(drivePage);
  }

  return {
    ...localTab,
    name: localTab.name || driveTab.name,
    icon: localTab.icon || driveTab.icon,
    color: localTab.color || driveTab.color,
    driveFolderId: localTab.driveFolderId || driveTab.driveFolderId,
    driveEtag: localTab.driveEtag || driveTab.driveEtag,
    pages: resultPages,
    activePageId: localTab.activePageId || resultPages[0]?.id || null,
  };
}

function mergePage(localPage, drivePage, pendingPageIds) {
  if (!drivePage) return localPage;
  const pending = pendingPageIds.has(localPage.id);
  const localNewer = (localPage.modifiedAt || 0) > (drivePage.modifiedAt || 0);

  if (pending || localNewer) {
    return {
      ...localPage,
      driveFileId: localPage.driveFileId || drivePage.driveFileId,
      driveLinkFileId: localPage.driveLinkFileId || drivePage.driveLinkFileId,
      driveEtag: localPage.driveEtag || drivePage.driveEtag,
      driveModifiedTime: drivePage.driveModifiedTime || localPage.driveModifiedTime,
    };
  }

  return {
    ...drivePage,
    id: localPage.id || drivePage.id,
    driveEtag: drivePage.driveEtag || localPage.driveEtag,
  };
}

function filterTombstonedTree(data, tombstoneIds) {
  return {
    ...data,
    notebooks: (data.notebooks || [])
      .filter((nb) => !nb.driveFolderId || !tombstoneIds.has(nb.driveFolderId))
      .map((nb) => filterTombstonedNotebook(nb, tombstoneIds)),
  };
}

function filterTombstonedNotebook(nb, tombstoneIds) {
  return {
    ...nb,
    tabs: (nb.tabs || [])
      .filter((tab) => !tab.driveFolderId || !tombstoneIds.has(tab.driveFolderId))
      .map((tab) => filterTombstonedTab(tab, tombstoneIds)),
  };
}

function filterTombstonedTab(tab, tombstoneIds) {
  return {
    ...tab,
    pages: (tab.pages || []).filter((page) => {
      const keys = [...pageKeySet(page)];
      return !keys.some((id) => tombstoneIds.has(id));
    }),
  };
}

export function collectDriveOnlyIds(localData, driveData) {
  const localIds = collectKnownDriveIds(localData);
  const driveIds = collectKnownDriveIds(driveData);
  const extra = [];
  for (const id of driveIds) {
    if (!localIds.has(id)) extra.push(id);
  }
  return extra;
}

// ---------------------------------------------------------------------------
// Per-page version merge
// ---------------------------------------------------------------------------

/**
 * Build a page object from the JSON Strata stores in Drive (the output of
 * buildPageJsonContent / buildLinkJsonContent), keeping the Drive bookkeeping
 * fields of `existing` when given.
 */
export function pageFromDriveJson(json, existing = null, meta = {}) {
  const base = existing || {};
  const type = json?.type || base.type || 'block';
  const page = {
    ...base,
    id: base.id || json?.id || generateId(),
    type,
    name: json?.name ?? base.name ?? 'Untitled',
    icon: json?.icon ?? base.icon,
    cover: json?.cover ?? null,
    starred: !!json?.starred,
    createdAt: json?.createdAt || base.createdAt || Date.now(),
    modifiedAt: json?.modifiedAt || 0,
    driveModifiedAt: json?.modifiedAt || 0,
  };
  if (meta.jsonFileId) {
    if (isLinkPage({ type, embedUrl: json?.embedUrl })) page.driveLinkFileId = meta.jsonFileId;
    else page.driveFileId = meta.jsonFileId;
  }
  if (meta.etag !== undefined) page.driveEtag = meta.etag;
  if (meta.modifiedTime !== undefined) page.driveModifiedTime = meta.modifiedTime;

  if (json?.embedUrl || json?.originalUrl || json?.webViewLink || LINK_PAGE_TYPES.includes(type)) {
    page.embedUrl = json?.embedUrl ?? base.embedUrl;
    page.originalUrl = json?.originalUrl ?? base.originalUrl;
    page.webViewLink = json?.webViewLink ?? base.webViewLink;
    if (json?.driveFileId) page.driveFileId = json.driveFileId;
    if (json?.mimeType) page.mimeType = json.mimeType;
    if (json?.viewMode) page.viewMode = json.viewMode;
    // Recover the type from the URL when the stored type was lost.
    if (page.embedUrl && !LINK_PAGE_TYPES.includes(page.type)) {
      if (page.embedUrl.includes('lucid.app')) page.type = 'lucidchart';
      else if (page.embedUrl.includes('miro.com')) page.type = 'miro';
      else if (page.embedUrl.includes('draw.io') || page.embedUrl.includes('diagrams.net')) page.type = 'drawio';
    }
    return page;
  }

  const raw = json?.content || json?.rows || [];
  if (raw && raw.version === TREE_VERSION && Array.isArray(raw.children)) {
    page.content = raw;
    page.rows = treeToRows(raw);
  } else {
    page.content = raw;
    page.rows = Array.isArray(raw) ? raw : [];
  }
  page.googleFileId = json?.googleFileId ?? null;
  page.url = json?.url ?? null;
  if (type === 'mermaid' || type === 'code') {
    const codeVal = json?.code ?? json?.codeContent ?? json?.mermaidCode ?? '';
    page.code = codeVal;
    page.mermaidCode = json?.mermaidCode ?? (json?.codeType === 'mermaid' ? codeVal : '');
    page.codeType = json?.codeType || 'mermaid';
    page.mermaidViewport = json?.mermaidViewport;
    page.codeContent = json?.codeContent ?? codeVal;
  }
  if (type === 'canvas') page.canvasData = json?.canvasData;
  if (type === 'database') page.databaseData = json?.databaseData;
  return page;
}

function blockMap(tree) {
  const map = new Map();
  const visit = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'row') (n.children || []).forEach((c) => visit(c.children || []));
      else if (n.type === 'column') visit(n.children || []);
      else if (n && n.id) map.set(n.id, n);
    }
  };
  visit(tree?.children || []);
  return map;
}

/**
 * Union-merge two block trees when both sides changed since the common
 * version. Local structure is kept (the user is editing here); blocks that
 * exist only remotely are appended in a new row so nothing typed elsewhere is
 * lost. On a block present in both, local wins.
 */
export function mergeBlockTrees(localTree, remoteTree) {
  const local = localTree && localTree.version === TREE_VERSION ? localTree : { version: TREE_VERSION, children: [] };
  const remote = remoteTree && remoteTree.version === TREE_VERSION ? remoteTree : { version: TREE_VERSION, children: [] };
  const localBlocks = blockMap(local);
  const remoteOnly = [];
  for (const [id, block] of blockMap(remote)) {
    if (!localBlocks.has(id)) remoteOnly.push(block);
  }
  if (!remoteOnly.length) return { tree: local, added: 0 };
  const row = {
    id: generateId(),
    type: 'row',
    children: [{ id: generateId(), type: 'column', width: 1, children: remoteOnly }],
  };
  return { tree: { ...local, children: [...(local.children || []), row] }, added: remoteOnly.length };
}

function adoptRemote(localPage, remotePage) {
  return {
    ...remotePage,
    id: localPage.id,
    driveFileId: isLinkPage(remotePage) ? remotePage.driveFileId || localPage.driveFileId : localPage.driveFileId || remotePage.driveFileId,
    driveLinkFileId: localPage.driveLinkFileId || remotePage.driveLinkFileId,
    driveEtag: remotePage.driveEtag || localPage.driveEtag,
    driveModifiedTime: remotePage.driveModifiedTime || localPage.driveModifiedTime,
    driveModifiedAt: remotePage.modifiedAt || 0,
  };
}

/**
 * Decide what a page should look like given the local copy and a newer
 * remote copy.
 *
 * @returns {{ page: Object, strategy: 'local'|'remote'|'merged'|'conflict-copy', conflictCopy: Object|null }}
 *  - local:   remote did not really change since we last synced (metadata-only); keep ours.
 *  - remote:  we have no unsynced edits; adopt remote wholesale.
 *  - merged:  both changed, block page: union merge; needs re-upload.
 *  - conflict-copy: both changed, non-block page: keep ours, remote saved as a new page.
 */
export function mergePageVersions(localPage, remotePage) {
  if (!remotePage) return { page: localPage, strategy: 'local', conflictCopy: null };
  const base = localPage.driveModifiedAt || 0;
  const localMod = localPage.modifiedAt || 0;
  const remoteMod = remotePage.modifiedAt || 0;
  const localChanged = localMod > base;
  const remoteChanged = remoteMod > base && remoteMod !== localMod;

  if (!remoteChanged) {
    return {
      page: { ...localPage, driveEtag: remotePage.driveEtag || localPage.driveEtag, driveModifiedTime: remotePage.driveModifiedTime || localPage.driveModifiedTime },
      strategy: 'local',
      conflictCopy: null,
    };
  }
  if (!localChanged) {
    return { page: adoptRemote(localPage, remotePage), strategy: 'remote', conflictCopy: null };
  }

  const type = localPage.type || 'block';
  if (type === 'block' && !isLinkPage(localPage)) {
    const { tree } = mergeBlockTrees(localPage.content, remotePage.content);
    return {
      page: {
        ...localPage,
        content: tree,
        rows: treeToRows(tree),
        modifiedAt: Date.now(),
        driveEtag: remotePage.driveEtag || localPage.driveEtag,
        driveModifiedTime: remotePage.driveModifiedTime || localPage.driveModifiedTime,
      },
      strategy: 'merged',
      conflictCopy: null,
    };
  }

  const copy = {
    ...adoptRemote(localPage, remotePage),
    id: generateId(),
    name: `${remotePage.name || localPage.name || 'Untitled'} (conflict copy)`,
    driveFileId: isLinkPage(remotePage) ? remotePage.driveFileId : null,
    driveLinkFileId: null,
    driveEtag: null,
    driveModifiedTime: null,
    driveModifiedAt: 0,
    modifiedAt: Date.now(),
    starred: false,
  };
  return {
    page: {
      ...localPage,
      driveEtag: remotePage.driveEtag || localPage.driveEtag,
      driveModifiedTime: remotePage.driveModifiedTime || localPage.driveModifiedTime,
    },
    strategy: 'conflict-copy',
    conflictCopy: copy,
  };
}
