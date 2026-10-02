import { useCallback } from 'react';
import { COLORS, APP_VERSION } from '../lib/constants';
import { generateId, getNextTabColor, updatePageInData } from '../lib/utils';
import {
  exportItemFromData,
  serializeExport,
  downloadJson,
  readFileAsText,
  parseExport,
  prepareImport,
  insertImport,
  describeImportSummary,
} from '../lib/import-export';
import {
  createDefaultPage,
  createCanvasPage,
  createCodePage,
  createDatabasePage
} from '../lib/page-factories';
import { parseEmbedUrl } from '../lib/embed-utils';
import { buildDrivePage, buildPageFromParsedUrl } from '../lib/drive-page';
import { isLinkPage, findPageContext } from '../lib/sync-merge';
import { moveNotebook, moveTab, movePage } from '../lib/nav-move';
import { useViewport } from './useViewport';
import { useStrata } from '../contexts/StrataContext';
import { usePageContent } from './usePageContent';

const addPageToTab = (base, notebookId, tabId, newPage) => ({
  ...base,
  notebooks: base.notebooks.map((nb) =>
    nb.id !== notebookId
      ? nb
      : {
          ...nb,
          tabs: nb.tabs.map((tab) => (tab.id !== tabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })),
        }
  ),
});

/**
 * Hook for high-level CRUD operations on notebooks, tabs, and pages.
 * Consumes useStrata() and usePageContent() for data, sync, and navigation.
 *
 * Every mutation is expressed as a pure `apply(base) => next` function that is
 * handed to React as a functional updater (so it composes with concurrent
 * updates from the sync engine) and also applied to the current snapshot to
 * produce the tree we hand to the sync layer for immediate persistence.
 */
export function useAppActions() {
  const {
    data,
    setData,
    settings,
    setSettings,
    saveToHistory,
    triggerContentSync,
    triggerStructureSync,
    syncSubtree,
    syncFolderMeta,
    syncPageFile,
    persistTree,
    syncIndex,
    queueDriveDelete,
    moveItemInDrive,
    showNotification,
    activeNotebookId,
    activeTabId,
    activePageId,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    setEditingPageId,
    setEditingTabId,
    setEditingNotebookId,
    setShouldFocusTitle,
    setCreationFlow,
    selectedBlockId,
    setSelectedBlockId,
    setActiveTabMenu,
    setItemToDelete,
    setDragHoverTarget,
    itemToDelete,
    activeTabMenu,
    shouldFocusPageRef,
    dragHoverTimerRef,
    setNotebookIconPicker,
    setTabIconPicker,
    setPageIconPicker,
    setIconSearchTerm,
    setMobilePane,
  } = useStrata();

  const { flushAndClearSync } = usePageContent();
  const { isMobile } = useViewport();

  const commit = useCallback(
    (apply) => {
      setData(apply);
      return apply(data);
    },
    [setData, data]
  );

  const selectNotebook = useCallback(
    (notebookId) => {
      const nb = data.notebooks.find((n) => n.id === notebookId);
      if (!nb) return;
      flushAndClearSync();
      setActiveNotebookId(notebookId);
      setEditingPageId(null);
      setEditingTabId(null);
      setEditingNotebookId(null);
      const lastTabId = localStorage.getItem(`strata_history_nb_${notebookId}`);
      const targetTabId = lastTabId && nb.tabs.some((t) => t.id === lastTabId) ? lastTabId : (nb.activeTabId || (nb.tabs?.[0]?.id ?? null));
      setActiveTabId(targetTabId);
      if (targetTabId) {
        const tab = nb.tabs.find((t) => t.id === targetTabId);
        const lastPageId = localStorage.getItem(`strata_history_tab_${targetTabId}`);
        setActivePageId(lastPageId && tab.pages.some((p) => p.id === lastPageId) ? lastPageId : (tab.activePageId || (tab.pages?.[0]?.id ?? null)));
      } else {
        setActivePageId(null);
      }
    },
    [data.notebooks, flushAndClearSync, setActiveNotebookId, setActiveTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId]
  );

  const selectTab = useCallback(
    (tabId) => {
      flushAndClearSync();
      setActiveTabId(tabId);
      localStorage.setItem('strata_history_nb_' + activeNotebookId, tabId);
      setEditingPageId(null);
      setEditingTabId(null);
      setEditingNotebookId(null);
      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) => (nb.id === activeNotebookId ? { ...nb, activeTabId: tabId } : nb)),
      }));
      const nb = data.notebooks.find((n) => n.id === activeNotebookId);
      const tab = nb?.tabs.find((t) => t.id === tabId);
      if (tab) {
        const lastPageId = localStorage.getItem(`strata_history_tab_${tabId}`);
        setActivePageId(lastPageId && tab.pages.some((p) => p.id === lastPageId) ? lastPageId : (tab.activePageId || (tab.pages?.[0]?.id ?? null)));
      }
    },
    [flushAndClearSync, setData, activeNotebookId, data.notebooks, setActiveTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId]
  );

  const selectPage = useCallback(
    (pageId) => {
      flushAndClearSync();
      setActivePageId(pageId);
      localStorage.setItem('strata_history_tab_' + activeTabId, pageId);
      setEditingPageId(null);
      setEditingTabId(null);
      setEditingNotebookId(null);
      if (isMobile) setMobilePane('editor');

      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) =>
          nb.id !== activeNotebookId
            ? nb
            : {
                ...nb,
                tabs: nb.tabs.map((t) => (t.id === activeTabId ? { ...t, activePageId: pageId } : t)),
              }
        ),
      }));
    },
    [flushAndClearSync, setData, activeNotebookId, activeTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId, isMobile, setMobilePane]
  );

  const getStarredPages = useCallback(() => {
    const starred = [];
    data.notebooks.forEach((nb) => {
      nb.tabs.forEach((tab) => {
        tab.pages.forEach((page) => {
          if (page.starred) {
            starred.push({
              ...page,
              notebookId: nb.id,
              tabId: tab.id,
              notebookName: nb.name,
              tabName: tab.name,
            });
          }
        });
      });
    });
    if (data.favoritesOrder) {
      starred.sort((a, b) => {
        const idxA = data.favoritesOrder.indexOf(a.id);
        const idxB = data.favoritesOrder.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    return starred;
  }, [data.notebooks, data.favoritesOrder]);

  const addNotebook = useCallback(async () => {
    saveToHistory();
    const newPage = createDefaultPage();
    const newTab = { id: generateId(), name: 'New Tab', icon: '📋', color: COLORS[0].name, pages: [newPage], activePageId: newPage.id };
    const newNb = { id: generateId(), name: 'New Notebook', icon: '📓', tabs: [newTab], activeTabId: newTab.id };
    const newData = commit((base) => ({ ...base, notebooks: [...base.notebooks, newNb] }));
    setActiveNotebookId(newNb.id);
    setActiveTabId(newTab.id);
    setActivePageId(newPage.id);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(newNb.id);
    setCreationFlow({ notebookId: newNb.id, tabId: newTab.id, pageId: newPage.id });
    showNotification('Notebook created', 'success');
    syncSubtree(newData, { notebookId: newNb.id, tabId: newTab.id, pageId: newPage.id });
  }, [saveToHistory, commit, showNotification, syncSubtree, setActiveNotebookId, setActiveTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId, setCreationFlow]);

  const addTab = useCallback(async () => {
    if (!activeNotebookId) return;
    saveToHistory();
    const activeNotebook = data.notebooks.find((nb) => nb.id === activeNotebookId);
    const newPage = createDefaultPage();
    const newTab = { id: generateId(), name: 'New Tab', icon: '📋', color: getNextTabColor(activeNotebook?.tabs), pages: [newPage], activePageId: newPage.id };
    const newData = commit((base) => ({
      ...base,
      notebooks: base.notebooks.map((nb) => (nb.id === activeNotebookId ? { ...nb, tabs: [...nb.tabs, newTab], activeTabId: newTab.id } : nb)),
    }));
    setActiveTabId(newTab.id);
    setActivePageId(newPage.id);
    setEditingPageId(null);
    setEditingTabId(newTab.id);
    setEditingNotebookId(null);
    showNotification('Section created', 'success');
    syncSubtree(newData, { notebookId: activeNotebookId, tabId: newTab.id, pageId: newPage.id });
  }, [activeNotebookId, saveToHistory, data.notebooks, commit, showNotification, syncSubtree, setActiveTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId]);

  /**
   * Add several pages to the active tab in ONE commit. `commit` applies the
   * updater to the closed-over `data`, so calling addPageOfType N times in a
   * single tick would persist a snapshot missing N-1 pages.
   */
  const addPagesOfType = useCallback(
    (newPages, label, { focusTitle = false } = {}) => {
      const pages = (newPages || []).filter(Boolean);
      if (!activeTabId || pages.length === 0) return;
      saveToHistory();
      const newData = commit((base) => pages.reduce((acc, page) => addPageToTab(acc, activeNotebookId, activeTabId, page), base));
      setActivePageId(pages[0].id);
      if (isMobile) setMobilePane('editor');
      if (focusTitle) {
        setEditingPageId(null);
        setEditingTabId(null);
        setEditingNotebookId(null);
        setShouldFocusTitle(true);
      }
      if (label) showNotification(label, 'success');
      syncSubtree(newData, { notebookId: activeNotebookId, tabId: activeTabId, pageIds: pages.map((p) => p.id) });
    },
    [activeTabId, activeNotebookId, saveToHistory, commit, showNotification, syncSubtree, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId, setShouldFocusTitle, isMobile, setMobilePane]
  );

  const addPageOfType = useCallback(
    (newPage, label, options = {}) => addPagesOfType([newPage], label, options),
    [addPagesOfType]
  );

  const addPage = useCallback(() => addPageOfType(createDefaultPage(), 'Page created', { focusTitle: true }), [addPageOfType]);
  const addCanvasPage = useCallback(() => addPageOfType(createCanvasPage(), 'Canvas page created'), [addPageOfType]);
  const addDatabasePage = useCallback(() => addPageOfType(createDatabasePage(), 'Database page created'), [addPageOfType]);
  const addCodePage = useCallback(() => addPageOfType(createCodePage(), 'Code page created'), [addPageOfType]);

  /**
   * Create a link page from a pasted URL. `resolved` (optional) comes from
   * resolvePastedDriveUrl in the Drive & URL modal and carries the parsed URL,
   * Drive metadata when the file is readable, and the name the user settled on.
   */
  const addEmbedPageFromUrl = useCallback(
    (rawUrl, resolved = null) => {
      if (!activeTabId || !rawUrl) return false;
      const parsed = resolved?.parsed || parseEmbedUrl(rawUrl);
      if (!parsed) {
        showNotification('Could not parse Google Drive, PDF, or Web Board URL', 'error');
        return false;
      }
      const newPage = buildPageFromParsedUrl(rawUrl, parsed, {
        name: resolved?.name,
        mimeType: resolved?.meta?.mimeType,
      });
      addPageOfType(newPage, `${newPage.name} added`);
      return true;
    },
    [activeTabId, showNotification, addPageOfType]
  );

  /** One page per file picked in the Drive browser, committed together. */
  const addGooglePages = useCallback(
    (files) => {
      const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
      if (!activeTabId || list.length === 0) return;
      const pages = list.map((file) => buildDrivePage(file));
      const label = pages.length === 1 ? `${pages[0].name} added` : `${pages.length} pages added`;
      addPagesOfType(pages, label);
    },
    [activeTabId, addPagesOfType]
  );

  const addGooglePage = useCallback((file) => addGooglePages(file ? [file] : []), [addGooglePages]);

  const executeDelete = useCallback(
    async (type, id) => {
      saveToHistory();
      const driveIdsToDelete = [];
      // Link pages point at a file the user owns elsewhere in Drive (Doc, My Map, PDF...).
      // Only the Strata link JSON may ever be trashed, never the linked file itself.
      const getPageDeleteId = (page) => (isLinkPage(page) ? page.driveLinkFileId || null : page.driveFileId || null);
      // Names ride along so the sync panel can still describe the delete after the item is gone locally.
      const collectDriveIds = (item, itemType) => {
        if (itemType === 'notebook') {
          if (item.driveFolderId) driveIdsToDelete.push({ driveId: item.driveFolderId, name: item.name });
          for (const tab of item.tabs || []) collectDriveIds(tab, 'tab');
        } else if (itemType === 'tab') {
          if (item.driveFolderId) driveIdsToDelete.push({ driveId: item.driveFolderId, name: item.name });
          for (const page of item.pages || []) collectDriveIds(page, 'page');
        } else if (itemType === 'page') {
          const delId = getPageDeleteId(item);
          if (delId) driveIdsToDelete.push({ driveId: delId, name: item.name });
        }
      };

      // Phase 1: decide what to trash and what becomes active, from the current snapshot.
      let nextId = null;
      if (type === 'notebook') {
        const idx = data.notebooks.findIndex((n) => n.id === id);
        const notebook = data.notebooks[idx];
        if (notebook) collectDriveIds(notebook, 'notebook');
        if (activeNotebookId === id) {
          if (idx < data.notebooks.length - 1) nextId = data.notebooks[idx + 1].id;
          else if (idx > 0) nextId = data.notebooks[idx - 1].id;
        }
      } else {
        const nb = data.notebooks.find((n) => n.id === activeNotebookId);
        if (nb && type === 'tab') {
          const idx = nb.tabs.findIndex((t) => t.id === id);
          const tab = nb.tabs[idx];
          if (tab) collectDriveIds(tab, 'tab');
          if (activeTabId === id) {
            if (idx < nb.tabs.length - 1) nextId = nb.tabs[idx + 1].id;
            else if (idx > 0) nextId = nb.tabs[idx - 1].id;
          }
        } else if (nb && type === 'page') {
          const tab = nb.tabs.find((t) => t.id === activeTabId);
          if (tab) {
            const idx = tab.pages.findIndex((p) => p.id === id);
            const page = tab.pages[idx];
            if (page) collectDriveIds(page, 'page');
            if (activePageId === id) {
              if (idx < tab.pages.length - 1) nextId = tab.pages[idx + 1].id;
              else if (idx > 0) nextId = tab.pages[idx - 1].id;
            }
          }
        }
      }

      // Phase 2: pure structural removal, applied functionally.
      const apply = (base) => {
        const next = JSON.parse(JSON.stringify(base));
        if (type === 'notebook') {
          next.notebooks = next.notebooks.filter((n) => n.id !== id);
        } else if (type === 'tab') {
          next.notebooks.forEach((nb) => {
            nb.tabs = nb.tabs.filter((t) => t.id !== id);
          });
        } else if (type === 'page') {
          next.notebooks.forEach((nb) => {
            nb.tabs.forEach((tab) => {
              tab.pages = tab.pages.filter((p) => p.id !== id);
            });
          });
          if (Array.isArray(next.favoritesOrder)) next.favoritesOrder = next.favoritesOrder.filter((pid) => pid !== id);
        }
        return next;
      };
      const newData = commit(apply);
      if (type === 'page' && (settings.pinnedPageIds || []).includes(id)) {
        setSettings((s) => ({ ...s, pinnedPageIds: (s.pinnedPageIds || []).filter((pid) => pid !== id) }));
      }

      // Phase 3: selection follow-up.
      if (type === 'notebook' && activeNotebookId === id) {
        setActiveNotebookId(nextId);
        const nextNb = nextId ? newData.notebooks.find((n) => n.id === nextId) : null;
        const tabToSelect = nextNb?.activeTabId || nextNb?.tabs?.[0]?.id || null;
        setActiveTabId(tabToSelect);
        const tabObj = tabToSelect ? nextNb.tabs.find((t) => t.id === tabToSelect) : null;
        setActivePageId(tabObj?.activePageId || tabObj?.pages?.[0]?.id || null);
      } else if (type === 'tab' && activeTabId === id) {
        selectTab(nextId);
      } else if (type === 'page' && activePageId === id) {
        selectPage(nextId);
        if (nextId) shouldFocusPageRef.current = true;
      }

      if (driveIdsToDelete.length > 0) queueDriveDelete(driveIdsToDelete, newData);
      else syncIndex(newData);
      if (itemToDelete?.id === id) setItemToDelete(null);
      if (activeTabMenu?.id === id) setActiveTabMenu(null);
      if (selectedBlockId === id) setSelectedBlockId(null);
      showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`, 'success');
    },
    [
      saveToHistory,
      data,
      commit,
      settings.pinnedPageIds,
      setSettings,
      activeNotebookId,
      activeTabId,
      activePageId,
      selectTab,
      selectPage,
      showNotification,
      syncIndex,
      queueDriveDelete,
      itemToDelete,
      activeTabMenu,
      selectedBlockId,
      setActiveNotebookId,
      setActiveTabId,
      setActivePageId,
      setItemToDelete,
      setActiveTabMenu,
      setSelectedBlockId,
      shouldFocusPageRef,
    ]
  );

  const confirmDelete = useCallback(() => {
    if (!itemToDelete) return;
    executeDelete(itemToDelete.type, itemToDelete.id);
  }, [itemToDelete, executeDelete]);

  const updateLocalName = useCallback(
    (type, id, newName) => {
      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) => {
          if (type === 'notebook' && nb.id === id) return { ...nb, name: newName };
          return {
            ...nb,
            tabs: nb.tabs.map((tab) => {
              if (type === 'tab' && tab.id === id) return { ...tab, name: newName };
              if (type !== 'page') return tab;
              return {
                ...tab,
                pages: tab.pages.map((pg) => (pg.id === id ? { ...pg, name: newName, modifiedAt: Date.now() } : pg)),
              };
            }),
          };
        }),
      }));
    },
    [setData]
  );

  const handleNavDragStart = useCallback((e, type, id, index) => {
    e.dataTransfer.setData('nav_drag', JSON.stringify({
      type,
      id,
      index,
      sourceNotebookId: activeNotebookId,
      sourceTabId: activeTabId
    }));
  }, [activeNotebookId, activeTabId]);

  const handleNavDrop = useCallback(
    (e, dropType, targetIndex, targetId) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragHoverTimerRef?.current) clearTimeout(dragHoverTimerRef.current);
      setDragHoverTarget(null);

      const dragDataRaw = e.dataTransfer.getData('nav_drag');
      if (!dragDataRaw) return;
      const dragData = JSON.parse(dragDataRaw);

      // Pure move: returns { next, changed, driveMoveTask } for any base tree.
      const run = (base) => {
        const next = JSON.parse(JSON.stringify(base));
        let changed = false;
        let driveMoveTask = null;

        const sourceNb = next.notebooks.find((n) => n.id === dragData.sourceNotebookId);
        const sourceTab = sourceNb?.tabs.find((t) => t.id === dragData.sourceTabId);

        if (dragData.type === 'notebook' && dropType === 'notebook') {
          const fromIdx = next.notebooks.findIndex((n) => n.id === dragData.id);
          if (fromIdx >= 0 && fromIdx !== targetIndex) {
            const [movedNb] = next.notebooks.splice(fromIdx, 1);
            next.notebooks.splice(targetIndex, 0, movedNb);
            changed = true;
          }
        } else if (dragData.type === 'tab') {
          const fromIdx = sourceNb ? sourceNb.tabs.findIndex((t) => t.id === dragData.id) : -1;
          if (dropType === 'tab') {
            const targetNb = next.notebooks.find((n) => n.id === activeNotebookId);
            if (sourceNb && targetNb && fromIdx >= 0) {
              const [movedTab] = sourceNb.tabs.splice(fromIdx, 1);
              targetNb.tabs.splice(targetIndex, 0, movedTab);
              changed = true;
              if (sourceNb.id !== targetNb.id && movedTab.driveFolderId && targetNb.driveFolderId && sourceNb.driveFolderId) {
                driveMoveTask = { itemId: movedTab.driveFolderId, newParentId: targetNb.driveFolderId, oldParentId: sourceNb.driveFolderId };
              }
            }
          } else if (dropType === 'notebook') {
            const targetNb = next.notebooks.find((n) => n.id === targetId);
            if (sourceNb && targetNb && sourceNb.id !== targetNb.id && fromIdx >= 0) {
              const [movedTab] = sourceNb.tabs.splice(fromIdx, 1);
              targetNb.tabs.push(movedTab);
              changed = true;
              if (movedTab.driveFolderId && targetNb.driveFolderId && sourceNb.driveFolderId) {
                driveMoveTask = { itemId: movedTab.driveFolderId, newParentId: targetNb.driveFolderId, oldParentId: sourceNb.driveFolderId };
              }
            }
          }
        } else if (dragData.type === 'page') {
          const fromIdx = sourceTab ? sourceTab.pages.findIndex((p) => p.id === dragData.id) : -1;
          let targetTab = null;
          let insertAt = null;
          if (dropType === 'page') {
            const targetNb = next.notebooks.find((n) => n.id === activeNotebookId);
            targetTab = targetNb?.tabs.find((t) => t.id === activeTabId) || null;
            insertAt = targetIndex;
          } else if (dropType === 'tab') {
            const targetNb = next.notebooks.find((n) => n.id === activeNotebookId);
            targetTab = targetNb?.tabs.find((t) => t.id === targetId) || null;
            if (targetTab && sourceTab && sourceTab.id === targetTab.id) targetTab = null;
          } else if (dropType === 'notebook') {
            const targetNb = next.notebooks.find((n) => n.id === targetId);
            targetTab = targetNb?.tabs.find((t) => t.id === targetNb.activeTabId) || targetNb?.tabs[0] || null;
            if (targetTab && sourceTab && sourceTab.id === targetTab.id) targetTab = null;
          }
          if (sourceTab && targetTab && fromIdx >= 0) {
            const [movedPage] = sourceTab.pages.splice(fromIdx, 1);
            if (insertAt === null) targetTab.pages.push(movedPage);
            else targetTab.pages.splice(insertAt, 0, movedPage);
            changed = true;
            if (sourceTab.id !== targetTab.id) {
              const moveId = movedPage.driveLinkFileId || movedPage.driveFileId;
              if (moveId && targetTab.driveFolderId && sourceTab.driveFolderId) {
                driveMoveTask = { itemId: moveId, newParentId: targetTab.driveFolderId, oldParentId: sourceTab.driveFolderId };
              }
            }
          }
        }
        return { next, changed, driveMoveTask };
      };

      const result = run(data);
      if (!result.changed) return;
      saveToHistory();
      setData((prev) => run(prev).next);
      if (result.driveMoveTask && moveItemInDrive) {
        moveItemInDrive(result.driveMoveTask.itemId, result.driveMoveTask.newParentId, result.driveMoveTask.oldParentId, result.next);
      } else {
        syncIndex(result.next);
      }
    },
    [saveToHistory, data, setData, activeNotebookId, activeTabId, syncIndex, moveItemInDrive, setDragHoverTarget, dragHoverTimerRef]
  );

  const handleFavoriteDrop = useCallback(
    (e, targetPageId) => {
      e.preventDefault();
      e.stopPropagation();
      const dragDataRaw = e.dataTransfer.getData('nav_drag');
      if (!dragDataRaw) return;
      const dragData = JSON.parse(dragDataRaw);
      if (dragData.type !== 'favorite' || dragData.id === targetPageId) return;
      const apply = (base) => {
        let order = base.favoritesOrder;
        if (!order) {
          order = [];
          base.notebooks.forEach((nb) => nb.tabs.forEach((t) => t.pages.forEach((p) => { if (p.starred) order.push(p.id); })));
        }
        order = [...order];
        const fromIdx = order.indexOf(dragData.id);
        const toIdx = order.indexOf(targetPageId);
        if (fromIdx === -1 || toIdx === -1) return base;
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, dragData.id);
        return { ...base, favoritesOrder: order };
      };
      const next = commit(apply);
      if (next !== data) persistTree(next);
    },
    [data, commit, persistTree]
  );

  const updateNotebookIcon = useCallback(
    (notebookId, icon) => {
      const next = commit((base) => ({
        ...base,
        notebooks: base.notebooks.map((nb) => (nb.id === notebookId ? { ...nb, icon } : nb)),
      }));
      setNotebookIconPicker(null);
      setIconSearchTerm('');
      syncFolderMeta(next, { entityType: 'notebook', appId: notebookId });
    },
    [commit, syncFolderMeta, setNotebookIconPicker, setIconSearchTerm]
  );

  const updateTabIcon = useCallback(
    (tabId, icon) => {
      const next = commit((base) => ({
        ...base,
        notebooks: base.notebooks.map((nb) =>
          nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id === tabId ? { ...tab, icon } : tab)) }
        ),
      }));
      setTabIconPicker(null);
      setIconSearchTerm('');
      syncFolderMeta(next, { entityType: 'tab', appId: tabId, notebookId: activeNotebookId });
    },
    [commit, activeNotebookId, syncFolderMeta, setTabIconPicker, setIconSearchTerm]
  );

  const updatePageIcon = useCallback(
    (pageId, icon) => {
      const ids = { notebookId: activeNotebookId, tabId: activeTabId, pageId };
      const next = commit((base) => updatePageInData(base, ids, (p) => ({ ...p, icon })));
      setPageIconPicker(null);
      setIconSearchTerm('');
      syncPageFile(next, pageId);
    },
    [commit, activeNotebookId, activeTabId, syncPageFile, setPageIconPicker, setIconSearchTerm]
  );

  const updateActivePage = useCallback(
    (updates) => {
      if (!activePageId || !activeTabId || !activeNotebookId) return;
      const ids = { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId };
      const next = commit((base) => updatePageInData(base, ids, (p) => ({ ...p, ...updates })));
      triggerContentSync(activePageId, next);
    },
    [activePageId, activeTabId, activeNotebookId, commit, triggerContentSync]
  );

  const handleCanvasUpdate = updateActivePage;
  const handleTableUpdate = updateActivePage;
  const handleMermaidUpdate = updateActivePage;

  const updateTabColor = useCallback(
    (tabId, color) => {
      const next = commit((base) => ({
        ...base,
        notebooks: base.notebooks.map((nb) =>
          nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== tabId ? tab : { ...tab, color })) }
        ),
      }));
      setActiveTabMenu(null);
      syncFolderMeta(next, { entityType: 'tab', appId: tabId, notebookId: activeNotebookId });
    },
    [commit, activeNotebookId, syncFolderMeta, setActiveTabMenu]
  );

  /**
   * Reorder or re-parent a notebook/tab/page without drag-and-drop
   * (touch action sheet, keyboard). Handles the Drive folder move.
   */
  const moveItem = useCallback(
    (type, id, { toIndex, toTabId, toNotebookId } = {}) => {
      const run = (base) => {
        if (type === 'notebook') return moveNotebook(base, id, toIndex);
        if (type === 'tab') return moveTab(base, id, { toNotebookId, toIndex });
        return movePage(base, id, { toTabId, toIndex });
      };
      const result = run(data);
      if (!result.changed) return;
      saveToHistory();
      setData((prev) => run(prev).data);
      if (type === 'page' && toTabId) {
        setActiveNotebookId(result.targetNotebookId);
        setActiveTabId(result.targetTabId);
        setActivePageId(id);
      } else if (type === 'tab' && toNotebookId) {
        setActiveNotebookId(toNotebookId);
        setActiveTabId(id);
      }
      if (result.driveMove && moveItemInDrive) {
        moveItemInDrive(result.driveMove.itemId, result.driveMove.newParentId, result.driveMove.oldParentId, result.data);
      } else {
        syncIndex(result.data);
      }
    },
    [data, saveToHistory, setData, moveItemInDrive, syncIndex, setActiveNotebookId, setActiveTabId, setActivePageId]
  );

  const toggleStar = useCallback(
    (pageId, notebookId, tabId) => {
      const apply = (base) => {
        let isNowStarred = false;
        const withPage = updatePageInData(base, { notebookId, tabId, pageId }, (p) => {
          isNowStarred = !p.starred;
          return { ...p, starred: isNowStarred };
        });
        let favoritesOrder = withPage.favoritesOrder || [];
        if (isNowStarred && !favoritesOrder.includes(pageId)) favoritesOrder = [...favoritesOrder, pageId];
        else if (!isNowStarred) favoritesOrder = favoritesOrder.filter((id) => id !== pageId);
        return { ...withPage, favoritesOrder };
      };
      const next = commit(apply);
      triggerContentSync(pageId, next);
    },
    [commit, triggerContentSync]
  );

  // ==================== PINS (device-local, stored in settings) ====================

  const getPinnedPages = useCallback(() => {
    const out = [];
    for (const id of settings.pinnedPageIds || []) {
      const ctx = findPageContext(data, id);
      if (!ctx) continue; // page gone: pruned at read time
      out.push({
        ...ctx.page,
        notebookId: ctx.notebook.id,
        tabId: ctx.tab.id,
        notebookName: ctx.notebook.name,
        tabName: ctx.tab.name,
      });
    }
    return out;
  }, [data, settings.pinnedPageIds]);

  const isPinned = useCallback((pageId) => (settings.pinnedPageIds || []).includes(pageId), [settings.pinnedPageIds]);

  const togglePin = useCallback(
    (pageId) => {
      const wasPinned = (settings.pinnedPageIds || []).includes(pageId);
      setSettings((s) => {
        const cur = s.pinnedPageIds || [];
        const next = cur.includes(pageId) ? cur.filter((x) => x !== pageId) : [...cur, pageId];
        return { ...s, pinnedPageIds: next, ...(cur.includes(pageId) ? {} : { pinnedExpanded: true }) };
      });
      showNotification(wasPinned ? 'Page unpinned' : 'Page pinned', 'success');
    },
    [settings.pinnedPageIds, setSettings, showNotification]
  );

  // ==================== IMPORT / EXPORT ====================

  const exportItem = useCallback(
    (type, id) => {
      try {
        const { envelope, filename } = exportItemFromData(data, type, id, { appVersion: APP_VERSION });
        downloadJson(filename, serializeExport(envelope));
        showNotification(`${type === 'tab' ? 'Section' : type.charAt(0).toUpperCase() + type.slice(1)} exported`, 'success');
      } catch (e) {
        showNotification(e?.message || 'Export failed', 'error');
      }
    },
    [data, showNotification]
  );

  const importFromFile = useCallback(
    async (file) => {
      if (!file) return;
      let envelope;
      try {
        envelope = parseExport(await readFileAsText(file));
      } catch (e) {
        showNotification(`Import failed: ${e?.message || 'unknown error'}`, 'error');
        return;
      }
      saveToHistory();
      const prepared = prepareImport(envelope);
      const opts = { activeNotebookId, activeTabId };
      let result = null;
      const newData = commit((base) => {
        result = insertImport(base, prepared, opts);
        return result.data;
      });
      if (result?.selection) {
        const { notebookId, tabId, pageId } = result.selection;
        flushAndClearSync();
        if (tabId) localStorage.setItem(`strata_history_nb_${notebookId}`, tabId);
        if (tabId && pageId) localStorage.setItem(`strata_history_tab_${tabId}`, pageId);
        setActiveNotebookId(notebookId);
        setActiveTabId(tabId);
        setActivePageId(pageId);
        setEditingPageId(null);
        setEditingTabId(null);
        setEditingNotebookId(null);
        if (isMobile) setMobilePane('editor');
      }
      const summary = describeImportSummary(result?.summary || {});
      const warn = result?.warnings?.length ? ` (${result.warnings.join('; ')})` : '';
      showNotification(`Imported ${summary}${warn}`, result?.warnings?.length ? 'info' : 'success');
      triggerStructureSync(newData);
    },
    [
      showNotification,
      saveToHistory,
      activeNotebookId,
      activeTabId,
      commit,
      flushAndClearSync,
      setActiveNotebookId,
      setActiveTabId,
      setActivePageId,
      setEditingPageId,
      setEditingTabId,
      setEditingNotebookId,
      isMobile,
      setMobilePane,
      triggerStructureSync,
    ]
  );

  return {
    getPinnedPages,
    isPinned,
    togglePin,
    exportItem,
    importFromFile,
    addNotebook,
    addTab,
    addPage,
    addCanvasPage,
    addDatabasePage,
    addCodePage,
    addEmbedPageFromUrl,
    addGooglePage,
    addGooglePages,
    addPagesOfType,
    executeDelete,
    confirmDelete,
    updateLocalName,
    toggleStar,
    handleNavDragStart,
    handleNavDrop,
    handleFavoriteDrop,
    moveItem,
    selectNotebook,
    selectTab,
    selectPage,
    getStarredPages,
    flushAndClearSync,
    updateTabColor,
    updateNotebookIcon,
    updateTabIcon,
    updatePageIcon,
    handleCanvasUpdate,
    handleTableUpdate,
    handleMermaidUpdate,
  };
}
