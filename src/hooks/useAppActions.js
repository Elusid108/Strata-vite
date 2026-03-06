import { useCallback } from 'react';
import { COLORS } from '../lib/constants';
import { generateId, getNextTabColor, updatePageInData } from '../lib/utils';
import {
  createDefaultPage,
  createCanvasPage,
  createCodePage,
  createDatabasePage
} from '../lib/page-factories';
import { parseEmbedUrl } from '../lib/embed-utils';
import { useStrata } from '../contexts/StrataContext';
import { usePageContent } from './usePageContent';

/**
 * Hook for high-level CRUD operations on notebooks, tabs, and pages.
 * Consumes useStrata() and usePageContent() for data, sync, and navigation.
 */
export function useAppActions() {
  const {
    data,
    setData,
    saveToHistory,
    triggerStructureSync,
    triggerContentSync,
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
    setViewedEmbedPages,
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
  } = useStrata();

  const { flushAndClearSync } = usePageContent();

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

      const page = data.notebooks.flatMap((nb) => nb.tabs.flatMap((t) => t.pages)).find((p) => p.id === pageId);
      if (page?.embedUrl) {
        setViewedEmbedPages((prev) => {
          const next = new Set(prev);
          next.delete(pageId);
          next.add(pageId);
          return next;
        });
      }

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
    [flushAndClearSync, setData, activeNotebookId, activeTabId, data.notebooks, setActivePageId, setViewedEmbedPages, setEditingPageId, setEditingTabId, setEditingNotebookId]
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
    const newData = { ...data, notebooks: [...data.notebooks, newNb] };
    setData(newData);
    setActiveNotebookId(newNb.id);
    setActiveTabId(newTab.id);
    setActivePageId(newPage.id);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(newNb.id);
    setCreationFlow({ notebookId: newNb.id, tabId: newTab.id, pageId: newPage.id });
    showNotification('Notebook created', 'success');
    triggerStructureSync();
  }, [saveToHistory, data, setData, showNotification, triggerStructureSync, setActiveNotebookId, setActiveTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId, setCreationFlow]);

  const addTab = useCallback(async () => {
    if (!activeNotebookId) return;
    saveToHistory();
    const activeNotebook = data.notebooks.find((nb) => nb.id === activeNotebookId);
    const newPage = createDefaultPage();
    const newTab = { id: generateId(), name: 'New Tab', icon: '📋', color: getNextTabColor(activeNotebook?.tabs), pages: [newPage], activePageId: newPage.id };
    const newData = {
      ...data,
      notebooks: data.notebooks.map((nb) => (nb.id === activeNotebookId ? { ...nb, tabs: [...nb.tabs, newTab], activeTabId: newTab.id } : nb)),
    };
    setData(newData);
    setActiveTabId(newTab.id);
    setActivePageId(newPage.id);
    setEditingPageId(null);
    setEditingTabId(newTab.id);
    setEditingNotebookId(null);
    showNotification('Section created', 'success');
    triggerStructureSync();
  }, [activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, setActiveTabId, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId]);

  const addPage = useCallback(async () => {
    if (!activeTabId) return;
    saveToHistory();
    const newPage = createDefaultPage();
    const newData = {
      ...data,
      notebooks: data.notebooks.map((nb) =>
        nb.id !== activeNotebookId
          ? nb
          : {
              ...nb,
              tabs: nb.tabs.map((tab) => (tab.id !== activeTabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })),
            }
      ),
    };
    setData(newData);
    setActivePageId(newPage.id);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(null);
    setShouldFocusTitle(true);
    showNotification('Page created', 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId, setEditingPageId, setEditingTabId, setEditingNotebookId, setShouldFocusTitle]);

  const addCanvasPage = useCallback(() => {
    if (!activeTabId) return;
    saveToHistory();
    const newPage = createCanvasPage();
    const newData = {
      ...data,
      notebooks: data.notebooks.map((nb) =>
        nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== activeTabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })) }
      ),
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification('Canvas page created', 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const addDatabasePage = useCallback(() => {
    if (!activeTabId) return;
    saveToHistory();
    const newPage = createDatabasePage();
    const newData = {
      ...data,
      notebooks: data.notebooks.map((nb) =>
        nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== activeTabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })) }
      ),
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification('Database page created', 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const addCodePage = useCallback(() => {
    if (!activeTabId) return;
    saveToHistory();
    const newPage = createCodePage();
    const newData = {
      ...data,
      notebooks: data.notebooks.map((nb) =>
        nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== activeTabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })) }
      ),
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification('Code page created', 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const addEmbedPageFromUrl = useCallback(
    (rawUrl) => {
      if (!activeTabId || !rawUrl) return false;
      const parsed = parseEmbedUrl(rawUrl);
      if (!parsed) {
        showNotification('Could not parse Google Drive, PDF, or Web Board URL', 'error');
        return false;
      }
      saveToHistory();
      const pageName = parsed.isGoogleService
        ? (parsed.type === 'site' ? 'Google Site' : `Google ${parsed.typeName}`)
        : parsed.typeName;
      const newPage = {
        id: generateId(),
        name: pageName,
        type: parsed.type,
        embedUrl: parsed.embedUrl,
        ...(parsed.fileId && { driveFileId: parsed.fileId }),
        webViewLink: rawUrl,
        ...(parsed.originalUrl && { originalUrl: parsed.originalUrl }),
        ...(parsed.type === 'pdf' && !parsed.fileId && !parsed.originalUrl && { originalUrl: rawUrl }),
        icon: parsed.icon,
        createdAt: Date.now(),
      };
      const newData = {
        ...data,
        notebooks: data.notebooks.map((nb) =>
          nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== activeTabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })) }
        ),
      };
      setData(newData);
      setActivePageId(newPage.id);
      setViewedEmbedPages(prev => {
        const next = new Set(prev);
        next.add(newPage.id);
        return next;
      });
      showNotification(`${pageName} added`, 'success');
      triggerStructureSync();
      triggerContentSync(newPage.id);
      return true;
    },
    [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId, setViewedEmbedPages]
  );

  const addGooglePage = useCallback(
    (file) => {
      if (!activeTabId || !file) return;
      let icon, typeName, pageType;
      const mimeType = file.mimeType || '';
      if (mimeType === 'application/vnd.google-apps.document') {
        icon = '📄';
        typeName = 'Doc';
        pageType = 'doc';
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        icon = '📊';
        typeName = 'Sheet';
        pageType = 'sheet';
      } else if (mimeType === 'application/vnd.google-apps.presentation') {
        icon = '📽️';
        typeName = 'Slides';
        pageType = 'slide';
      } else if (mimeType === 'application/vnd.google-apps.form') {
        icon = '📋';
        typeName = 'Form';
        pageType = 'form';
      } else if (mimeType === 'application/vnd.google-apps.drawing') {
        icon = '🖌️';
        typeName = 'Drawing';
        pageType = 'drawing';
      } else if (mimeType === 'application/vnd.google-apps.map') {
        icon = '🗺️';
        typeName = 'Map';
        pageType = 'map';
      } else if (mimeType === 'application/vnd.google-apps.site') {
        icon = '🌐';
        typeName = 'Site';
        pageType = 'site';
      } else if (mimeType === 'application/vnd.google-apps.script') {
        icon = '📜';
        typeName = 'Apps Script';
        pageType = 'script';
      } else if (mimeType === 'application/vnd.google-apps.vid') {
        icon = '🎬';
        typeName = 'Vid';
        pageType = 'vid';
      } else if (mimeType === 'application/pdf') {
        icon = '📑';
        typeName = 'PDF';
        pageType = 'pdf';
      } else {
        icon = '📁';
        typeName = 'File';
        pageType = 'drive';
      }
      let embedUrl;
      if (pageType === 'doc') embedUrl = `https://docs.google.com/document/d/${file.id}/edit`;
      else if (pageType === 'sheet') embedUrl = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
      else if (pageType === 'slide') embedUrl = `https://docs.google.com/presentation/d/${file.id}/edit`;
      else if (pageType === 'form') embedUrl = `https://docs.google.com/forms/d/${file.id}/viewform`;
      else if (pageType === 'drawing') embedUrl = `https://docs.google.com/drawings/d/${file.id}/edit`;
      else if (pageType === 'map') embedUrl = `https://www.google.com/maps/d/embed?mid=${file.id}`;
      else if (pageType === 'site') embedUrl = (file.webViewLink || file.url || '').split('?')[0] || `https://drive.google.com/file/d/${file.id}/preview`;
      else if (pageType === 'script') embedUrl = `https://script.google.com/macros/s/${file.id}/edit`;
      else if (pageType === 'vid') embedUrl = `https://vids.google.com/watch/${file.id}`;
      else embedUrl = `https://drive.google.com/file/d/${file.id}/preview`;

      saveToHistory();
      const newPage = {
        id: generateId(),
        name: file.name || `Google ${typeName}`,
        type: pageType,
        embedUrl,
        driveFileId: file.id,
        webViewLink: file.webViewLink || file.url,
        mimeType: file.mimeType,
        icon,
        createdAt: Date.now(),
      };
      const newData = {
        ...data,
        notebooks: data.notebooks.map((nb) =>
          nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== activeTabId ? tab : { ...tab, pages: [...tab.pages, newPage], activePageId: newPage.id })) }
        ),
      };
      setData(newData);
      setActivePageId(newPage.id);
      setViewedEmbedPages(prev => {
        const next = new Set(prev);
        next.add(newPage.id);
        return next;
      });
      showNotification(`${file.name || 'Google ' + typeName} added`, 'success');
      triggerStructureSync();
      triggerContentSync(newPage.id);
    },
    [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId, setViewedEmbedPages]
  );

  const executeDelete = useCallback(
    async (type, id) => {
      saveToHistory();
      const newData = JSON.parse(JSON.stringify(data));
      let nextId = null;
      const driveIdsToDelete = [];
      const getPageDeleteId = (page) => {
        const isEmbed = ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'site', 'script', 'drive', 'lucidchart', 'miro', 'drawio'].includes(page.type);
        return page.driveLinkFileId || (!isEmbed ? page.driveFileId : null);
      };
      const collectDriveIds = (item, itemType) => {
        if (itemType === 'notebook') {
          if (item.driveFolderId) driveIdsToDelete.push(item.driveFolderId);
          for (const tab of item.tabs || []) {
            if (tab.driveFolderId) driveIdsToDelete.push(tab.driveFolderId);
            for (const page of tab.pages || []) {
              const delId = getPageDeleteId(page);
              if (delId) driveIdsToDelete.push(delId);
            }
          }
        } else if (itemType === 'tab') {
          if (item.driveFolderId) driveIdsToDelete.push(item.driveFolderId);
          for (const page of item.pages || []) {
            const delId = getPageDeleteId(page);
            if (delId) driveIdsToDelete.push(delId);
          }
        } else if (itemType === 'page') {
          const delId = getPageDeleteId(item);
          if (delId) driveIdsToDelete.push(delId);
        }
      };

      if (type === 'notebook') {
        const notebook = newData.notebooks.find((n) => n.id === id);
        if (notebook) collectDriveIds(notebook, 'notebook');
        const idx = newData.notebooks.findIndex((n) => n.id === id);
        if (activeNotebookId === id) {
          if (idx < newData.notebooks.length - 1) nextId = newData.notebooks[idx + 1].id;
          else if (idx > 0) nextId = newData.notebooks[idx - 1].id;
        }
        newData.notebooks = newData.notebooks.filter((n) => n.id !== id);
        if (activeNotebookId === id) {
          setActiveNotebookId(nextId);
          if (nextId) {
            const nextNb = newData.notebooks.find((n) => n.id === nextId);
            if (nextNb?.tabs?.length > 0) {
              const tabToSelect = nextNb.activeTabId || nextNb.tabs[0]?.id;
              if (tabToSelect) {
                setActiveTabId(tabToSelect);
                const tabObj = nextNb.tabs.find((t) => t.id === tabToSelect);
                setActivePageId(tabObj?.activePageId || tabObj?.pages[0]?.id || null);
              } else {
                setActiveTabId(null);
                setActivePageId(null);
              }
            } else {
              setActiveTabId(null);
              setActivePageId(null);
            }
          } else {
            setActiveTabId(null);
            setActivePageId(null);
          }
        }
      } else {
        for (const nb of newData.notebooks) {
          if (nb.id !== activeNotebookId) continue;
          if (type === 'tab') {
            const tab = nb.tabs.find((t) => t.id === id);
            if (tab) collectDriveIds(tab, 'tab');
            const idx = nb.tabs.findIndex((t) => t.id === id);
            if (activeTabId === id) {
              if (idx < nb.tabs.length - 1) nextId = nb.tabs[idx + 1].id;
              else if (idx > 0) nextId = nb.tabs[idx - 1].id;
            }
            nb.tabs = nb.tabs.filter((t) => t.id !== id);
            if (activeTabId === id) selectTab(nextId);
          } else if (type === 'page') {
            for (const tab of nb.tabs) {
              if (tab.id !== activeTabId) continue;
              const page = tab.pages.find((p) => p.id === id);
              if (page) collectDriveIds(page, 'page');
              const idx = tab.pages.findIndex((p) => p.id === id);
              if (activePageId === id) {
                if (idx < tab.pages.length - 1) nextId = tab.pages[idx + 1].id;
                else if (idx > 0) nextId = tab.pages[idx - 1].id;
              }
              tab.pages = tab.pages.filter((p) => p.id !== id);
              if (activePageId === id) {
                selectPage(nextId);
                if (nextId) shouldFocusPageRef.current = true;
              }
            }
          }
        }
      }

      if (driveIdsToDelete.length > 0) queueDriveDelete(driveIdsToDelete);
      setData(newData);
      if (itemToDelete?.id === id) setItemToDelete(null);
      if (activeTabMenu?.id === id) setActiveTabMenu(null);
      if (selectedBlockId === id) setSelectedBlockId(null);
      showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`, 'success');
      triggerStructureSync();
    },
    [
      saveToHistory,
      data,
      setData,
      activeNotebookId,
      activeTabId,
      activePageId,
      selectTab,
      selectPage,
      showNotification,
      triggerStructureSync,
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
      setData((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        next.notebooks.forEach((nb) => {
          if (type === 'notebook' && nb.id === id) nb.name = newName;
          nb.tabs.forEach((tab) => {
            if (type === 'tab' && tab.id === id) tab.name = newName;
            tab.pages.forEach((pg) => {
              if (pg.id === id) pg.name = newName;
            });
          });
        });
        return next;
      });
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

      saveToHistory();
      const newData = JSON.parse(JSON.stringify(data));
      let changed = false;
      let driveMoveTask = null; // Track cross-folder moves

      const sourceNb = newData.notebooks.find((n) => n.id === dragData.sourceNotebookId);
      const sourceTab = sourceNb?.tabs.find((t) => t.id === dragData.sourceTabId);

      if (dragData.type === 'notebook' && dropType === 'notebook') {
        if (dragData.index !== targetIndex) {
          const [movedNb] = newData.notebooks.splice(dragData.index, 1);
          newData.notebooks.splice(targetIndex, 0, movedNb);
          changed = true;
        }
      } else if (dragData.type === 'tab') {
        if (dropType === 'tab') {
          const targetNb = newData.notebooks.find((n) => n.id === activeNotebookId);
          if (sourceNb && targetNb) {
            const [movedTab] = sourceNb.tabs.splice(dragData.index, 1);
            targetNb.tabs.splice(targetIndex, 0, movedTab);
            changed = true;
            if (sourceNb.id !== targetNb.id && movedTab.driveFolderId && targetNb.driveFolderId && sourceNb.driveFolderId) {
              driveMoveTask = { itemId: movedTab.driveFolderId, newParentId: targetNb.driveFolderId, oldParentId: sourceNb.driveFolderId };
            }
          }
        } else if (dropType === 'notebook') {
          const targetNb = newData.notebooks.find((n) => n.id === targetId);
          if (sourceNb && targetNb && sourceNb.id !== targetNb.id) {
            const [movedTab] = sourceNb.tabs.splice(dragData.index, 1);
            targetNb.tabs.push(movedTab);
            changed = true;
            if (movedTab.driveFolderId && targetNb.driveFolderId && sourceNb.driveFolderId) {
              driveMoveTask = { itemId: movedTab.driveFolderId, newParentId: targetNb.driveFolderId, oldParentId: sourceNb.driveFolderId };
            }
          }
        }
      } else if (dragData.type === 'page') {
        if (dropType === 'page') {
          const targetNb = newData.notebooks.find((n) => n.id === activeNotebookId);
          const targetTab = targetNb?.tabs.find((t) => t.id === activeTabId);
          if (sourceTab && targetTab) {
            const [movedPage] = sourceTab.pages.splice(dragData.index, 1);
            targetTab.pages.splice(targetIndex, 0, movedPage);
            changed = true;
            if (sourceTab.id !== targetTab.id) {
              const moveId = movedPage.driveLinkFileId || movedPage.driveFileId;
              if (moveId && targetTab.driveFolderId && sourceTab.driveFolderId) {
                driveMoveTask = { itemId: moveId, newParentId: targetTab.driveFolderId, oldParentId: sourceTab.driveFolderId };
              }
            }
          }
        } else if (dropType === 'tab') {
          const targetNb = newData.notebooks.find((n) => n.id === activeNotebookId);
          const targetTab = targetNb?.tabs.find((t) => t.id === targetId);
          if (sourceTab && targetTab && sourceTab.id !== targetTab.id) {
            const [movedPage] = sourceTab.pages.splice(dragData.index, 1);
            targetTab.pages.push(movedPage);
            changed = true;
            const moveId = movedPage.driveLinkFileId || movedPage.driveFileId;
            if (moveId && targetTab.driveFolderId && sourceTab.driveFolderId) {
              driveMoveTask = { itemId: moveId, newParentId: targetTab.driveFolderId, oldParentId: sourceTab.driveFolderId };
            }
          }
        } else if (dropType === 'notebook') {
          const targetNb = newData.notebooks.find((n) => n.id === targetId);
          const targetTab = targetNb?.tabs.find((t) => t.id === targetNb.activeTabId) || targetNb?.tabs[0];
          if (sourceTab && targetTab && sourceTab.id !== targetTab.id) {
            const [movedPage] = sourceTab.pages.splice(dragData.index, 1);
            targetTab.pages.push(movedPage);
            changed = true;
            const moveId = movedPage.driveLinkFileId || movedPage.driveFileId;
            if (moveId && targetTab.driveFolderId && sourceTab.driveFolderId) {
              driveMoveTask = { itemId: moveId, newParentId: targetTab.driveFolderId, oldParentId: sourceTab.driveFolderId };
            }
          }
        }
      }

      if (changed) {
        setData(newData);
        triggerStructureSync();
        // Physically move the underlying file so it doesn't revert on reload
        if (driveMoveTask && moveItemInDrive) {
          moveItemInDrive(driveMoveTask.itemId, driveMoveTask.newParentId, driveMoveTask.oldParentId);
        }
      }
    },
    [saveToHistory, data, setData, activeNotebookId, activeTabId, triggerStructureSync, moveItemInDrive, setDragHoverTarget, dragHoverTimerRef]
  );

  const handleFavoriteDrop = useCallback(
    (e, targetPageId) => {
      e.preventDefault();
      e.stopPropagation();
      const dragDataRaw = e.dataTransfer.getData('nav_drag');
      if (!dragDataRaw) return;
      const dragData = JSON.parse(dragDataRaw);
      if (dragData.type !== 'favorite' || dragData.id === targetPageId) return;
      setData((prev) => {
        const next = { ...prev };
        if (!next.favoritesOrder) {
          const currentStars = [];
          next.notebooks.forEach((nb) => nb.tabs.forEach((t) => t.pages.forEach((p) => { if (p.starred) currentStars.push(p.id); })));
          next.favoritesOrder = currentStars;
        }
        const order = [...next.favoritesOrder];
        const fromIdx = order.indexOf(dragData.id);
        const toIdx = order.indexOf(targetPageId);
        if (fromIdx > -1 && toIdx > -1) {
          order.splice(fromIdx, 1);
          order.splice(toIdx, 0, dragData.id);
          next.favoritesOrder = order;
        }
        return next;
      });
      triggerStructureSync();
    },
    [setData, triggerStructureSync]
  );

  const updateNotebookIcon = useCallback(
    (notebookId, icon) => {
      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) => (nb.id === notebookId ? { ...nb, icon } : nb)),
      }));
      setNotebookIconPicker(null);
      setIconSearchTerm('');
      triggerStructureSync();
    },
    [setData, triggerStructureSync, setNotebookIconPicker, setIconSearchTerm]
  );

  const updateTabIcon = useCallback(
    (tabId, icon) => {
      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) =>
          nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id === tabId ? { ...tab, icon } : tab)) }
        ),
      }));
      setTabIconPicker(null);
      setIconSearchTerm('');
      triggerStructureSync();
    },
    [setData, activeNotebookId, triggerStructureSync, setTabIconPicker, setIconSearchTerm]
  );

  const updatePageIcon = useCallback(
    (pageId, icon) => {
      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) =>
          nb.id !== activeNotebookId
            ? nb
            : {
                ...nb,
                tabs: nb.tabs.map((tab) =>
                  tab.id !== activeTabId ? tab : { ...tab, pages: tab.pages.map((p) => (p.id === pageId ? { ...p, icon } : p)) }
                ),
              }
        ),
      }));
      setPageIconPicker(null);
      setIconSearchTerm('');
      triggerStructureSync();
    },
    [setData, activeNotebookId, activeTabId, triggerStructureSync, setPageIconPicker, setIconSearchTerm]
  );

  const handleCanvasUpdate = useCallback(
    (updates) => {
      if (!activePageId || !activeTabId || !activeNotebookId) return;
      setData((prev) => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, (p) => ({ ...p, ...updates })));
      triggerContentSync(activePageId);
    },
    [activePageId, activeTabId, activeNotebookId, setData, triggerContentSync]
  );

  const handleTableUpdate = useCallback(
    (updatedPage) => {
      if (!activePageId || !activeTabId || !activeNotebookId) return;
      setData((prev) => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, (p) => ({ ...p, ...updatedPage })));
      triggerContentSync(activePageId);
    },
    [activePageId, activeTabId, activeNotebookId, setData, triggerContentSync]
  );

  const handleMermaidUpdate = useCallback(
    (updates) => {
      if (!activePageId || !activeTabId || !activeNotebookId) return;
      setData((prev) => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, (p) => ({ ...p, ...updates })));
      triggerContentSync(activePageId);
    },
    [activePageId, activeTabId, activeNotebookId, setData, triggerContentSync]
  );

  const updateTabColor = useCallback(
    (tabId, color) => {
      setData((prev) => ({
        ...prev,
        notebooks: prev.notebooks.map((nb) =>
          nb.id !== activeNotebookId ? nb : { ...nb, tabs: nb.tabs.map((tab) => (tab.id !== tabId ? tab : { ...tab, color })) }
        ),
      }));
      setActiveTabMenu(null);
      triggerStructureSync();
    },
    [setData, activeNotebookId, triggerStructureSync, setActiveTabMenu]
  );

  const toggleStar = useCallback(
    (pageId, notebookId, tabId) => {
      setData((prev) => {
        const next = {
          ...prev,
          notebooks: prev.notebooks.map((nb) =>
            nb.id !== notebookId ? nb : { ...nb, tabs: nb.tabs.map((t) => (t.id !== tabId ? t : { ...t, pages: t.pages.map((p) => (p.id === pageId ? { ...p, starred: !p.starred } : p)) })) }
          ),
        };
        if (!next.favoritesOrder) next.favoritesOrder = [];
        const isNowStarred = next.notebooks.find((n) => n.id === notebookId)?.tabs.find((t) => t.id === tabId)?.pages.find((p) => p.id === pageId)?.starred;
        if (isNowStarred && !next.favoritesOrder.includes(pageId)) next.favoritesOrder = [...next.favoritesOrder, pageId];
        else if (!isNowStarred) next.favoritesOrder = next.favoritesOrder.filter((id) => id !== pageId);
        return next;
      });
      triggerStructureSync();
      triggerContentSync(pageId);
    },
    [setData, triggerStructureSync, triggerContentSync]
  );

  return {
    addNotebook,
    addTab,
    addPage,
    addCanvasPage,
    addDatabasePage,
    addCodePage,
    addEmbedPageFromUrl,
    addGooglePage,
    executeDelete,
    confirmDelete,
    updateLocalName,
    toggleStar,
    handleNavDragStart,
    handleNavDrop,
    handleFavoriteDrop,
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
