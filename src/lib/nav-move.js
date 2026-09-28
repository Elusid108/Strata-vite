/*
 * Pure reorder/move helpers for notebooks, tabs and pages. Used by the touch
 * "Move" sheet (and usable by keyboard shortcuts). Each returns a new tree
 * plus, where a Drive folder move is implied, the move to enqueue.
 */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function clampIndex(i, length) {
  return Math.max(0, Math.min(i, length));
}

export function moveNotebook(data, notebookId, toIndex) {
  const next = clone(data);
  const from = next.notebooks.findIndex((n) => n.id === notebookId);
  if (from < 0) return { data, changed: false };
  const target = clampIndex(toIndex, next.notebooks.length - 1);
  if (target === from) return { data, changed: false };
  const [nb] = next.notebooks.splice(from, 1);
  next.notebooks.splice(target, 0, nb);
  return { data: next, changed: true };
}

export function moveTab(data, tabId, { toNotebookId, toIndex } = {}) {
  const next = clone(data);
  const sourceNb = next.notebooks.find((n) => (n.tabs || []).some((t) => t.id === tabId));
  if (!sourceNb) return { data, changed: false, driveMove: null };
  const targetNb = toNotebookId ? next.notebooks.find((n) => n.id === toNotebookId) : sourceNb;
  if (!targetNb) return { data, changed: false, driveMove: null };
  const from = sourceNb.tabs.findIndex((t) => t.id === tabId);
  const [tab] = sourceNb.tabs.splice(from, 1);
  const maxIndex = targetNb === sourceNb ? targetNb.tabs.length : targetNb.tabs.length;
  const target = toIndex === undefined ? targetNb.tabs.length : clampIndex(toIndex, maxIndex);
  if (targetNb === sourceNb && target === from) return { data, changed: false, driveMove: null };
  targetNb.tabs.splice(target, 0, tab);
  if (targetNb !== sourceNb) {
    if (sourceNb.activeTabId === tab.id) sourceNb.activeTabId = sourceNb.tabs[0]?.id || null;
    targetNb.activeTabId = tab.id;
  }
  const driveMove =
    targetNb !== sourceNb && tab.driveFolderId && targetNb.driveFolderId && sourceNb.driveFolderId
      ? { itemId: tab.driveFolderId, newParentId: targetNb.driveFolderId, oldParentId: sourceNb.driveFolderId }
      : null;
  return { data: next, changed: true, driveMove, targetNotebookId: targetNb.id };
}

export function movePage(data, pageId, { toTabId, toIndex } = {}) {
  const next = clone(data);
  let sourceTab = null;
  let targetTab = null;
  for (const nb of next.notebooks) {
    for (const tab of nb.tabs || []) {
      if ((tab.pages || []).some((p) => p.id === pageId)) sourceTab = tab;
      if (toTabId && tab.id === toTabId) targetTab = tab;
    }
  }
  if (!sourceTab) return { data, changed: false, driveMove: null };
  if (!toTabId) targetTab = sourceTab;
  if (!targetTab) return { data, changed: false, driveMove: null };
  const from = sourceTab.pages.findIndex((p) => p.id === pageId);
  const [page] = sourceTab.pages.splice(from, 1);
  const target = toIndex === undefined ? targetTab.pages.length : clampIndex(toIndex, targetTab.pages.length);
  if (targetTab === sourceTab && target === from) return { data, changed: false, driveMove: null };
  targetTab.pages.splice(target, 0, page);
  if (targetTab !== sourceTab) {
    if (sourceTab.activePageId === page.id) sourceTab.activePageId = sourceTab.pages[0]?.id || null;
    targetTab.activePageId = page.id;
  }
  const moveId = page.driveLinkFileId || page.driveFileId;
  const driveMove =
    targetTab !== sourceTab && moveId && targetTab.driveFolderId && sourceTab.driveFolderId
      ? { itemId: moveId, newParentId: targetTab.driveFolderId, oldParentId: sourceTab.driveFolderId }
      : null;
  const targetNotebook = next.notebooks.find((nb) => nb.tabs.includes(targetTab));
  return { data: next, changed: true, driveMove, targetNotebookId: targetNotebook?.id, targetTabId: targetTab.id };
}
