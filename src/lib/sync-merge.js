/*
 * Drive-ID merge for boot. Local tree + outbox is source of truth until ACK.
 * Drive fills gaps. Tombstones prevent resurrection. Pending page ops keep local JSON.
 */

import { LINK_PAGE_TYPES } from './constants';
import { collectKnownDriveIds } from './reconciler';

export function isLinkPage(page) {
  if (!page) return false;
  const type = page.type || 'block';
  return LINK_PAGE_TYPES.includes(type) || !!page.embedUrl;
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
  const local = localData && Array.isArray(localData.notebooks) ? clone(localData) : { notebooks: [] };
  const drive = driveData && Array.isArray(driveData.notebooks) ? clone(driveData) : { notebooks: [] };

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
    resultNotebooks.push(mergeNotebook(localNb, driveNb, tombstoneIds, pendingPageIds));
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

function mergeNotebook(localNb, driveNb, tombstoneIds, pendingPageIds) {
  if (!driveNb) return localNb;

  const resultTabs = [];
  const usedDriveTabs = new Set();

  for (const localTab of localNb.tabs || []) {
    if (localTab.driveFolderId && tombstoneIds.has(localTab.driveFolderId)) continue;
    const driveTab = localTab.driveFolderId
      ? (driveNb.tabs || []).find((t) => t.driveFolderId === localTab.driveFolderId)
      : null;
    if (driveTab?.driveFolderId) usedDriveTabs.add(driveTab.driveFolderId);
    resultTabs.push(mergeTab(localTab, driveTab, tombstoneIds, pendingPageIds));
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

function mergeTab(localTab, driveTab, tombstoneIds, pendingPageIds) {
  if (!driveTab) return localTab;

  const resultPages = [];
  const usedDrivePages = new Set();

  for (const localPage of localTab.pages || []) {
    const localKeys = [...pageKeySet(localPage)];
    if (localKeys.some((id) => tombstoneIds.has(id))) continue;

    const drivePage = (driveTab.pages || []).find((p) => pagesMatch(localPage, p));
    if (drivePage) {
      for (const key of pageKeySet(drivePage)) usedDrivePages.add(key);
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
