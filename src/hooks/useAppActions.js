import { useCallback } from 'react';
import { COLORS } from '../lib/constants';
import { generateId, getNextTabColor } from '../lib/utils';
import {
  createDefaultPage,
  createCanvasPage,
  createCodePage,
  createDatabasePage
} from '../lib/page-factories';
import { parseEmbedUrl } from '../lib/embed-utils';
import { useStrata } from '../contexts/StrataContext';

/**
 * Hook for high-level CRUD operations on notebooks, tabs, and pages.
 * Consumes useStrata() for data and sync functions.
 */
export function useAppActions({
  selectTab,
  selectPage,
  shouldFocusPageRef,
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
  dragHoverTimerRef
}) {
  const {
    data,
    setData,
    saveToHistory,
    triggerStructureSync,
    triggerContentSync,
    queueDriveDelete,
    showNotification,
    activeNotebookId,
    activeTabId,
    activePageId,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    itemToDelete,
    activeTabMenu
  } = useStrata();

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
    const activeNotebook = data.notebooks.find(nb => nb.id === activeNotebookId);
    const newPage = createDefaultPage();
    const newTab = { id: generateId(), name: 'New Tab', icon: '📋', color: getNextTabColor(activeNotebook?.tabs), pages: [newPage], activePageId: newPage.id };
    const newData = {
      ...data,
      notebooks: data.notebooks.map(nb =>
        nb.id === activeNotebookId ? { ...nb, tabs: [...nb.tabs, newTab], activeTabId: newTab.id } : nb
      )
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
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
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
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
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
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
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
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification('Code page created', 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const addEmbedPageFromUrl = useCallback((rawUrl) => {
    if (!activeTabId || !rawUrl) return false;

    const parsed = parseEmbedUrl(rawUrl);
    if (!parsed) {
      showNotification('Could not parse Google Drive or PDF URL', 'error');
      return false;
    }

    saveToHistory();
    const newPage = {
      id: generateId(),
      name: parsed.type === 'site' ? 'Google Site' : `Google ${parsed.typeName}`,
      type: parsed.type,
      embedUrl: parsed.embedUrl,
      ...(parsed.fileId && { driveFileId: parsed.fileId }),
      webViewLink: rawUrl,
      ...(parsed.type === 'pdf' && !parsed.fileId && { originalUrl: rawUrl }),
      icon: parsed.icon,
      createdAt: Date.now()
    };

    const newData = {
      ...data,
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification(`Google ${parsed.typeName} added`, 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
    return true;
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const addLucidPage = useCallback((url) => {
    if (!activeTabId || !url) return;
    saveToHistory();
    const newPage = {
      id: generateId(),
      name: 'Lucidchart',
      type: 'lucidchart',
      embedUrl: url,
      icon: '📊',
      createdAt: Date.now()
    };

    const newData = {
      ...data,
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification('Lucidchart added', 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const addGooglePage = useCallback((file) => {
    if (!activeTabId || !file) return;

    let icon, typeName, pageType;
    const mimeType = file.mimeType || '';

    if (mimeType === 'application/vnd.google-apps.document') {
      icon = '📄'; typeName = 'Doc'; pageType = 'doc';
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      icon = '📊'; typeName = 'Sheet'; pageType = 'sheet';
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      icon = '📽️'; typeName = 'Slides'; pageType = 'slide';
    } else if (mimeType === 'application/vnd.google-apps.form') {
      icon = '📋'; typeName = 'Form'; pageType = 'form';
    } else if (mimeType === 'application/vnd.google-apps.drawing') {
      icon = '🖌️'; typeName = 'Drawing'; pageType = 'drawing';
    } else if (mimeType === 'application/vnd.google-apps.map') {
      icon = '🗺️'; typeName = 'Map'; pageType = 'map';
    } else if (mimeType === 'application/vnd.google-apps.site') {
      icon = '🌐'; typeName = 'Site'; pageType = 'site';
    } else if (mimeType === 'application/vnd.google-apps.script') {
      icon = '📜'; typeName = 'Apps Script'; pageType = 'script';
    } else if (mimeType === 'application/vnd.google-apps.vid') {
      icon = '🎬'; typeName = 'Vid'; pageType = 'vid';
    } else if (mimeType === 'application/pdf') {
      icon = '📑'; typeName = 'PDF'; pageType = 'pdf';
    } else {
      icon = '📁'; typeName = 'File'; pageType = 'drive';
    }

    let embedUrl;
    if (pageType === 'doc') {
      embedUrl = `https://docs.google.com/document/d/${file.id}/edit`;
    } else if (pageType === 'sheet') {
      embedUrl = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
    } else if (pageType === 'slide') {
      embedUrl = `https://docs.google.com/presentation/d/${file.id}/edit`;
    } else if (pageType === 'form') {
      embedUrl = `https://docs.google.com/forms/d/${file.id}/viewform`;
    } else if (pageType === 'drawing') {
      embedUrl = `https://docs.google.com/drawings/d/${file.id}/edit`;
    } else if (pageType === 'map') {
      embedUrl = `https://www.google.com/maps/d/embed?mid=${file.id}`;
    } else if (pageType === 'site') {
      embedUrl = (file.webViewLink || file.url || '').split('?')[0] || `https://drive.google.com/file/d/${file.id}/preview`;
    } else if (pageType === 'script') {
      embedUrl = `https://script.google.com/macros/s/${file.id}/edit`;
    } else if (pageType === 'vid') {
      embedUrl = `https://vids.google.com/watch/${file.id}`;
    } else {
      embedUrl = `https://drive.google.com/file/d/${file.id}/preview`;
    }

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
      createdAt: Date.now()
    };

    const newData = {
      ...data,
      notebooks: data.notebooks.map(nb =>
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab =>
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: [...tab.pages, newPage],
              activePageId: newPage.id
            }
          )
        }
      )
    };
    setData(newData);
    setActivePageId(newPage.id);
    showNotification(`${file.name || 'Google ' + typeName} added`, 'success');
    triggerStructureSync();
    triggerContentSync(newPage.id);
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync, triggerContentSync, setActivePageId]);

  const executeDelete = useCallback(async (type, id) => {
    saveToHistory();
    const newData = JSON.parse(JSON.stringify(data));
    let nextId = null;

    const driveIdsToDelete = [];
    const getPageDeleteId = (page) => {
      const isEmbed = ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'site', 'script', 'drive', 'lucidchart'].includes(page.type);
      return page.driveLinkFileId || (!isEmbed ? page.driveFileId : null);
    };
    const collectDriveIds = (item, itemType) => {
      if (itemType === 'notebook') {
        if (item.driveFolderId) driveIdsToDelete.push(item.driveFolderId);
        for (const tab of (item.tabs || [])) {
          if (tab.driveFolderId) driveIdsToDelete.push(tab.driveFolderId);
          for (const page of (tab.pages || [])) {
            const delId = getPageDeleteId(page);
            if (delId) driveIdsToDelete.push(delId);
          }
        }
      } else if (itemType === 'tab') {
        if (item.driveFolderId) driveIdsToDelete.push(item.driveFolderId);
        for (const page of (item.pages || [])) {
          const delId = getPageDeleteId(page);
          if (delId) driveIdsToDelete.push(delId);
        }
      } else if (itemType === 'page') {
        const delId = getPageDeleteId(item);
        if (delId) driveIdsToDelete.push(delId);
      }
    };

    if (type === 'notebook') {
      const notebook = newData.notebooks.find(n => n.id === id);
      if (notebook) collectDriveIds(notebook, 'notebook');
      const idx = newData.notebooks.findIndex(n => n.id === id);
      if (activeNotebookId === id) {
        if (idx < newData.notebooks.length - 1) nextId = newData.notebooks[idx + 1].id;
        else if (idx > 0) nextId = newData.notebooks[idx - 1].id;
      }
      newData.notebooks = newData.notebooks.filter(n => n.id !== id);
      if (activeNotebookId === id) {
        setActiveNotebookId(nextId);
        if (nextId) {
          const nextNb = newData.notebooks.find(n => n.id === nextId);
          if (nextNb && nextNb.tabs.length > 0) {
            const tabToSelect = nextNb.activeTabId || nextNb.tabs[0]?.id;
            if (tabToSelect) {
              setActiveTabId(tabToSelect);
              const tabObj = nextNb.tabs.find(t => t.id === tabToSelect);
              const pageToSelect = tabObj?.activePageId || tabObj?.pages[0]?.id;
              setActivePageId(pageToSelect || null);
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
      for (let nb of newData.notebooks) {
        if (nb.id !== activeNotebookId) continue;
        if (type === 'tab') {
          const tab = nb.tabs.find(t => t.id === id);
          if (tab) collectDriveIds(tab, 'tab');
          const idx = nb.tabs.findIndex(t => t.id === id);
          if (activeTabId === id) {
            if (idx < nb.tabs.length - 1) nextId = nb.tabs[idx + 1].id;
            else if (idx > 0) nextId = nb.tabs[idx - 1].id;
          }
          nb.tabs = nb.tabs.filter(t => t.id !== id);
          if (activeTabId === id) {
            selectTab(nextId);
          }
        } else if (type === 'page') {
          for (let tab of nb.tabs) {
            if (tab.id !== activeTabId) continue;
            const page = tab.pages.find(p => p.id === id);
            if (page) collectDriveIds(page, 'page');
            const idx = tab.pages.findIndex(p => p.id === id);
            if (activePageId === id) {
              if (idx < tab.pages.length - 1) nextId = tab.pages[idx + 1].id;
              else if (idx > 0) nextId = tab.pages[idx - 1].id;
            }
            tab.pages = tab.pages.filter(p => p.id !== id);
            if (activePageId === id) {
              selectPage(nextId);
              if (nextId) shouldFocusPageRef.current = true;
            }
          }
        }
      }
    }

    if (driveIdsToDelete.length > 0) {
      queueDriveDelete(driveIdsToDelete);
    }

    setData(newData);
    if (itemToDelete && itemToDelete.id === id) setItemToDelete(null);
    if (activeTabMenu && activeTabMenu.id === id) setActiveTabMenu(null);
    if (selectedBlockId === id) setSelectedBlockId(null);
    showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`, 'success');
    triggerStructureSync();
  }, [saveToHistory, data, setData, activeNotebookId, activeTabId, activePageId, selectTab, selectPage, showNotification, triggerStructureSync, queueDriveDelete, itemToDelete, activeTabMenu, selectedBlockId, setActiveNotebookId, setActiveTabId, setActivePageId, setItemToDelete, setActiveTabMenu, setSelectedBlockId, shouldFocusPageRef]);

  const confirmDelete = useCallback(() => {
    if (!itemToDelete) return;
    executeDelete(itemToDelete.type, itemToDelete.id);
  }, [itemToDelete, executeDelete]);

  const updateLocalName = useCallback((type, id, newName) => {
    setData(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.notebooks.forEach(nb => {
        if (type === 'notebook' && nb.id === id) {
          nb.name = newName;
        }
        nb.tabs.forEach(tab => {
          if (type === 'tab' && tab.id === id) {
            tab.name = newName;
          }
          tab.pages.forEach(pg => {
            if (pg.id === id) {
              pg.name = newName;
            }
          });
        });
      });
      return next;
    });
  }, [setData]);

  const handleNavDrop = useCallback((e, type, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragHoverTimerRef?.current) clearTimeout(dragHoverTimerRef.current);
    setDragHoverTarget?.(null);

    const dragDataRaw = e.dataTransfer.getData('nav_drag');
    if (!dragDataRaw) return;
    const dragData = JSON.parse(dragDataRaw);

    saveToHistory();
    const newData = JSON.parse(JSON.stringify(data));

    if (type === 'notebook') {
      if (dragData.type !== 'notebook' || dragData.index === targetIndex) return;
      const item = newData.notebooks.splice(dragData.index, 1)[0];
      newData.notebooks.splice(targetIndex, 0, item);
    } else if (type === 'tab') {
      if (dragData.type !== 'tab') return;
      const sourceNb = newData.notebooks.find(n => n.id === dragData.sourceNotebookId);
      const targetNb = newData.notebooks.find(n => n.id === activeNotebookId);
      if (sourceNb && targetNb) {
        const [movedTab] = sourceNb.tabs.splice(dragData.index, 1);
        targetNb.tabs.splice(targetIndex, 0, movedTab);
      }
    } else if (type === 'page') {
      if (dragData.type !== 'page') return;
      const sourceNb = newData.notebooks.find(n => n.id === dragData.sourceNotebookId);
      const sourceTab = sourceNb?.tabs.find(t => t.id === dragData.sourceTabId);
      const targetNb = newData.notebooks.find(n => n.id === activeNotebookId);
      const targetTab = targetNb?.tabs.find(t => t.id === activeTabId);
      if (sourceTab && targetTab) {
        const [movedPage] = sourceTab.pages.splice(dragData.index, 1);
        targetTab.pages.splice(targetIndex, 0, movedPage);
      }
    }
    setData(newData);
    triggerStructureSync();
  }, [saveToHistory, data, setData, activeNotebookId, activeTabId, triggerStructureSync, setDragHoverTarget, dragHoverTimerRef]);

  const handleFavoriteDrop = useCallback((e, targetPageId) => {
    e.preventDefault();
    e.stopPropagation();
    const dragDataRaw = e.dataTransfer.getData('nav_drag');
    if (!dragDataRaw) return;
    const dragData = JSON.parse(dragDataRaw);
    if (dragData.type !== 'favorite' || dragData.id === targetPageId) return;

    setData(prev => {
      const next = { ...prev };
      if (!next.favoritesOrder) {
        const currentStars = [];
        next.notebooks.forEach(nb => nb.tabs.forEach(t => t.pages.forEach(p => {
          if (p.starred) currentStars.push(p.id);
        })));
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
  }, [setData, triggerStructureSync]);

  const toggleStar = useCallback((pageId, notebookId, tabId) => {
    setData(prev => {
      const next = {
        ...prev,
        notebooks: prev.notebooks.map(nb =>
          nb.id !== notebookId ? nb : {
            ...nb,
            tabs: nb.tabs.map(t =>
              t.id !== tabId ? t : {
                ...t,
                pages: t.pages.map(p =>
                  p.id === pageId ? { ...p, starred: !p.starred } : p
                )
              }
            )
          }
        )
      };
      if (!next.favoritesOrder) next.favoritesOrder = [];
      const isNowStarred = next.notebooks.find(n => n.id === notebookId)?.tabs.find(t => t.id === tabId)?.pages.find(p => p.id === pageId)?.starred;
      if (isNowStarred && !next.favoritesOrder.includes(pageId)) {
        next.favoritesOrder = [...next.favoritesOrder, pageId];
      } else if (!isNowStarred) {
        next.favoritesOrder = next.favoritesOrder.filter(id => id !== pageId);
      }
      return next;
    });
    triggerStructureSync();
    triggerContentSync(pageId);
  }, [setData, triggerStructureSync, triggerContentSync]);

  return {
    addNotebook,
    addTab,
    addPage,
    addCanvasPage,
    addDatabasePage,
    addCodePage,
    addEmbedPageFromUrl,
    addLucidPage,
    addGooglePage,
    executeDelete,
    confirmDelete,
    updateLocalName,
    toggleStar,
    handleNavDrop,
    handleFavoriteDrop
  };
}
