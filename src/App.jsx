import { useState, useCallback, useEffect, useRef } from 'react';
import { TREE_VERSION, INITIAL_DATA } from './lib/constants';
import { generateId, getActiveContext, updatePageInData } from './lib/utils';
import { rowsToTree, treeToRows, normalizePageContent, countBlocksInTree } from './lib/tree-operations';
import { log } from './lib/logger';

// Layout components
import { Sidebar, NavigationRail, ModalsContainer, PageRenderer } from './components/layout';

// Hooks
import { useStrata } from './contexts/StrataContext';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useAppActions } from './hooks/useAppActions';
import { useBlockEditor } from './hooks/useBlockEditor';
import { useUIRegistry } from './hooks/useUIRegistry';

function App() {
  // ==================== CONTEXT ====================
  const {
    data,
    setData,
    settings,
    setSettings,
    loadFromLocalStorage,
    isAuthenticated,
    isLoadingAuth,
    userEmail,
    userName,
    driveRootFolderId,
    isSyncing,
    hasUnsyncedChanges,
    handleSignIn,
    handleSignOut,
    loadFromDrive,
    triggerStructureSync,
    triggerContentSync,
    syncRenameToDrive,
    queueDriveDelete,
    hasInitialLoadCompleted,
    saveToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    activeNotebookId,
    setActiveNotebookId,
    activeTabId,
    setActiveTabId,
    activePageId,
    setActivePageId,
    showSettings,
    setShowSettings,
    showAddMenu,
    setShowAddMenu,
    activeTabMenu,
    setActiveTabMenu,
    notification,
    setNotification,
    showNotification,
    itemToDelete,
    setItemToDelete,
    showDriveUrlModal,
    setShowDriveUrlModal,
    showPageTypeMenu,
    setShowPageTypeMenu,
    showAccountPopup,
    setShowAccountPopup,
    showSignOutConfirm,
    setShowSignOutConfirm,
    showIconPicker,
    setShowIconPicker,
    showCoverInput,
    setShowCoverInput,
    notebookIconPicker,
    setNotebookIconPicker,
    tabIconPicker,
    setTabIconPicker,
    pageIconPicker,
    setPageIconPicker,
    showEditEmbed,
    setShowEditEmbed,
    showLucidModal,
    setShowLucidModal,
    favoritesExpanded,
    setFavoritesExpanded,
    syncConflict,
    setSyncConflict
  } = useStrata();

  // ==================== STATE (local to App) ====================
  
  // Editing states
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingNotebookId, setEditingNotebookId] = useState(null);
  
  // Block states
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [activePageRows, setActivePageRows] = useState(null);
  const [autoFocusId, setAutoFocusId] = useState(null);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [blockMenu, setBlockMenu] = useState(null);
  
  // Map config states
  const [mapConfigBlockId, setMapConfigBlockId] = useState(null);
  const [mapConfigPosition, setMapConfigPosition] = useState(null);
  
  // Icon picker search (local - picker state is in context)
  const [iconSearchTerm, setIconSearchTerm] = useState('');
  
  // Drag hover states
  const [dragHoverTarget, setDragHoverTarget] = useState(null);
  const dragHoverTimerRef = useRef(null);
  
  // Focus and title states
  const titleInputRef = useRef(null);
  const [shouldFocusTitle, setShouldFocusTitle] = useState(false);
  const shouldFocusPageRef = useRef(false);
  
  // Creation flow tracking
  const [creationFlow, setCreationFlow] = useState(null);
  
  // Input refs
  const notebookInputRefs = useRef({});
  const tabInputRefs = useRef({});
  
  // Page type menu and Drive states (modal values - modals in context)
  const [driveUrlModalValue, setDriveUrlModalValue] = useState('');
  const [lucidUrlValue, setLucidUrlValue] = useState('');
  
  // Embed page states
  const [viewedEmbedPages, setViewedEmbedPages] = useState(new Set());
  const [pageZoomLevels, setPageZoomLevels] = useState({});
  const [editEmbedName, setEditEmbedName] = useState('');
  const [editEmbedUrl, setEditEmbedUrl] = useState('');
  
  // Refs for syncing
  const syncContentDebounceRef = useRef(null);
  const activePageRowsRef = useRef(null);
  const dataRef = useRef(null);
  const activeIdsRef = useRef({ notebookId: null, tabId: null, pageId: null });
  const updatePageContentRef = useRef(null);
  const tabBarRef = useRef(null);
  const lastDropTargetRef = useRef(null);
  const dropTargetRafRef = useRef(null);

  // ==================== DERIVED STATE ====================
  
  const { 
    notebook: activeNotebook, 
    tab: activeTab, 
    page: activePage 
  } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
  
  const pageTree = activePageRows && activePageRows.version === TREE_VERSION 
    ? activePageRows 
    : (activePage ? normalizePageContent(activePage) : null);
  const rowsForEditor = pageTree ? treeToRows(pageTree) : [];

  // ==================== LOAD DATA ====================
  
  useEffect(() => {
    const loadData = async () => {
      if (isLoadingAuth) return;

      // Helper to set active IDs from data (restores last viewed from localStorage)
      const setActiveFromData = (loadedData) => {
        if (!loadedData?.notebooks?.length) return false;
        let tgtNb, tgtTab, tgtPg;
        try {
          const last = JSON.parse(localStorage.getItem('strata_last_view'));
          if (last) { tgtNb = last.activeNotebookId; tgtTab = last.activeTabId; tgtPg = last.activePageId; }
        } catch (e) {}

        const nb = loadedData.notebooks.find(n => n.id === tgtNb) || loadedData.notebooks[0];
        setActiveNotebookId(nb.id);
        const tab = nb.tabs.find(t => t.id === tgtTab) || nb.tabs.find(t => t.id === nb.activeTabId) || nb.tabs[0];
        setActiveTabId(tab?.id || null);
        const page = tab?.pages.find(p => p.id === tgtPg) || tab?.pages.find(p => p.id === tab.activePageId) || tab?.pages[0];
        setActivePageId(page?.id || null);
        return true;
      };

      if (isAuthenticated) {
        // Drive is the single source of truth -- always load from Drive
        try {
          const driveData = await loadFromDrive();
          if (driveData && driveData.notebooks) {
            const localData = loadFromLocalStorage();
            const localStr = JSON.stringify(localData?.notebooks || []);
            const driveStr = JSON.stringify(driveData.notebooks || []);
            const initialStr = JSON.stringify(INITIAL_DATA.notebooks);
            const lastSyncedHash = localStorage.getItem('strata_last_synced_hash');

            if (localStr !== driveStr && localStr !== initialStr && localStr !== lastSyncedHash) {
              setSyncConflict({ localData, driveData });
            } else {
              setData(driveData);
              if (driveData.notebooks.length > 0) setActiveFromData(driveData);
              localStorage.setItem('strata_last_synced_hash', driveStr);
            }
          } else {
            setData(INITIAL_DATA);
            setActiveFromData(INITIAL_DATA);
          }
        } catch (error) {
          console.error('Error loading from Drive:', error);
          showNotification('Failed to load from Drive. Using local data as fallback.', 'error');
          log('SYNC', 'loadData: Drive failed, fallback to localStorage');
          const localData = loadFromLocalStorage();
          if (localData?.notebooks?.length > 0) {
            setData(localData);
            setActiveFromData(localData);
          } else {
            log('SYNC', 'loadData: localStorage empty, using INITIAL_DATA');
            setData(INITIAL_DATA);
            setActiveFromData(INITIAL_DATA);
          }
        }
      } else {
        // Not signed in -- localStorage fallback
        const localData = loadFromLocalStorage();
        if (localData?.notebooks?.length > 0) {
          log('SYNC', 'loadData: not signed in, using localStorage', { notebookCount: localData.notebooks.length });
          setData(localData);
          setActiveFromData(localData);
        } else {
          log('SYNC', 'loadData: not signed in, localStorage empty, using INITIAL_DATA');
          setData(INITIAL_DATA);
          setActiveFromData(INITIAL_DATA);
        }
      }
    };

    loadData();
  }, [isAuthenticated, isLoadingAuth]);

  useEffect(() => {
    if (activeNotebookId && activeTabId && activePageId) {
      localStorage.setItem('strata_last_view', JSON.stringify({ activeNotebookId, activeTabId, activePageId }));
    }
  }, [activeNotebookId, activeTabId, activePageId]);

  // ==================== PAGE CONTENT SYNC ====================
  
  useEffect(() => {
    const ctx = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
    const tree = ctx.page ? normalizePageContent(ctx.page) : null;
    setActivePageRows(tree);
  }, [data, activePageId, activeTabId, activeNotebookId]);

  useEffect(() => {
    dataRef.current = data;
    activePageRowsRef.current = activePageRows;
    activeIdsRef.current = { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId };
  });

  const flushActivePageToData = useCallback((tree) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    const t = tree ?? activePageRows;
    if (!t) return;
    const next = updatePageInData(data, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({
      ...p,
      content: t,
      rows: treeToRows(t)
    }));
    setData(next);
    return next;
  }, [activePageId, activeTabId, activeNotebookId, activePageRows, data, setData]);

  const scheduleSyncToData = useCallback(() => {
    if (syncContentDebounceRef.current) clearTimeout(syncContentDebounceRef.current);
    syncContentDebounceRef.current = setTimeout(() => {
      syncContentDebounceRef.current = null;
      const d = dataRef.current;
      const r = activePageRowsRef.current;
      const { notebookId, tabId, pageId } = activeIdsRef.current;
      if (!d || !pageId || !tabId || !notebookId || !r) return;
      setData(updatePageInData(d, { notebookId, tabId, pageId }, p => ({ ...p, content: r, rows: treeToRows(r) })));
      triggerContentSync(pageId);
    }, 300);
  }, [setData, triggerContentSync]);

  const flushAndClearSync = useCallback(() => {
    if (syncContentDebounceRef.current) {
      clearTimeout(syncContentDebounceRef.current);
      syncContentDebounceRef.current = null;
    }
    if (activePageId && activeTabId && activeNotebookId && activePageRows != null) {
      flushActivePageToData(activePageRows);
    }
  }, [activePageId, activeTabId, activeNotebookId, activePageRows, flushActivePageToData]);

  const updatePageContent = useCallback((tree, shouldSaveHistory = false) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    const t = tree && tree.version === TREE_VERSION ? tree : rowsToTree(Array.isArray(tree) ? tree : []);
    setActivePageRows(t);
    if (shouldSaveHistory) {
      const next = updatePageInData(data, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({ ...p, content: t, rows: treeToRows(t) }));
      setData(next);
      saveToHistory(next);
      triggerContentSync(activePageId);
    } else {
      scheduleSyncToData();
      triggerContentSync(activePageId);
    }
  }, [activePageId, activeTabId, activeNotebookId, data, setData, saveToHistory, scheduleSyncToData, triggerContentSync]);

  useEffect(() => { updatePageContentRef.current = updatePageContent; });

  // ==================== FOCUS EFFECTS ====================
  
  useEffect(() => {
    if (shouldFocusPageRef.current && activePageId) {
      const el = document.getElementById(`nav-page-${activePageId}`);
      if (el) el.focus();
      shouldFocusPageRef.current = false;
    }
  }, [activePageId]);

  useEffect(() => {
    if (activePageId && activePage?.embedUrl) {
      setViewedEmbedPages(prev => new Set([...prev, activePageId]));
    }
  }, [activePageId, activePage?.embedUrl]);

  useEffect(() => {
    if (shouldFocusTitle) {
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        }
        setShouldFocusTitle(false);
      }, 100);
    }
  }, [activePageId, shouldFocusTitle]);

  useEffect(() => {
    if (editingNotebookId) {
      setTimeout(() => {
        const input = notebookInputRefs.current[editingNotebookId];
        if (input) { input.focus(); input.select(); }
      }, 100);
    }
  }, [editingNotebookId]);

  useEffect(() => {
    if (editingTabId) {
      setTimeout(() => {
        const input = tabInputRefs.current[editingTabId];
        if (input) { input.focus(); input.select(); }
      }, 100);
    }
  }, [editingTabId]);

  // ==================== BLOCK HANDLERS (UI - handlers from useBlockEditor) ====================
  
  const handleRequestFocus = useCallback((blockId) => setAutoFocusId(blockId), []);
  
  const handleBlockFocus = useCallback(() => {
    setSelectedBlockId(null);
    setBlockMenu(null);
    setAutoFocusId(null);
  }, []);
  
  const handleBlockHandleClick = useCallback((e, blockId) => {
    e.stopPropagation();
    if (selectedBlockId === blockId) {
      const rect = e.currentTarget.getBoundingClientRect();
      setBlockMenu({ id: blockId, top: rect.bottom + 5, left: rect.left });
    } else {
      setSelectedBlockId(blockId);
      setBlockMenu(null);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  }, [selectedBlockId]);

  const handleBlockDragStart = useCallback((e, block, rowId, colId) => {
    e.dataTransfer.setData('block_drag', JSON.stringify({ block, rowId, colId }));
    setDraggedBlock({ block, rowId, colId });
  }, []);

  const handleBlockDragEnd = useCallback(() => {
    if (dropTargetRafRef.current) {
      cancelAnimationFrame(dropTargetRafRef.current);
      dropTargetRafRef.current = null;
    }
    lastDropTargetRef.current = null;
    setDraggedBlock(null);
    setDropTarget(null);
  }, []);

  const handleBlockDragOver = useCallback((e, blockId, blockPath) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedBlock || draggedBlock.block.id === blockId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const rowId = blockPath[0];
    const colId = blockPath[1];
    const targetRow = rowsForEditor.find(r => r.id === rowId);
    const colCount = targetRow ? (targetRow.columns?.length || 0) : 0;
    const isMaxColumns = colCount >= (settings.maxColumns || 6);
    const yMid = h * 0.25 <= y && y <= h * 0.75;
    let position = 'bottom';
    if (!isMaxColumns && yMid && x < w * 0.2) position = 'left';
    else if (!isMaxColumns && yMid && x > w * 0.8) position = 'right';
    else if (y < h * 0.25) position = 'top';
    else if (y > h * 0.75) position = 'bottom';
    const next = { rowId, colId, blockId, blockPath, position };
    const last = lastDropTargetRef.current;
    if (last && last.blockId === next.blockId && last.position === next.position && last.rowId === next.rowId && last.colId === next.colId) return;
    lastDropTargetRef.current = next;
    if (dropTargetRafRef.current) cancelAnimationFrame(dropTargetRafRef.current);
    dropTargetRafRef.current = requestAnimationFrame(() => {
      dropTargetRafRef.current = null;
      setDropTarget(next);
    });
  }, [draggedBlock, rowsForEditor, settings.maxColumns]);

  // ==================== NAVIGATION ====================
  
  const selectNotebook = useCallback((notebookId) => {
    const nb = data.notebooks.find(n => n.id === notebookId);
    if (!nb) return;
    flushAndClearSync();
    setActiveNotebookId(notebookId);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(null);
    const lastTabId = localStorage.getItem(`strata_history_nb_${notebookId}`);
    const targetTabId = lastTabId && nb.tabs.some(t => t.id === lastTabId) ? lastTabId : (nb.activeTabId || (nb.tabs && nb.tabs[0] ? nb.tabs[0].id : null));
    setActiveTabId(targetTabId);
    if (targetTabId) {
      const tab = nb.tabs.find(t => t.id === targetTabId);
      const lastPageId = localStorage.getItem(`strata_history_tab_${targetTabId}`);
      setActivePageId(lastPageId && tab.pages.some(p => p.id === lastPageId) ? lastPageId : (tab.activePageId || (tab.pages && tab.pages[0] ? tab.pages[0].id : null)));
    } else {
      setActivePageId(null);
    }
  }, [data.notebooks, flushAndClearSync]);

  const selectTab = useCallback((tabId) => {
    flushAndClearSync();
    setActiveTabId(tabId);
    localStorage.setItem('strata_history_nb_' + activeNotebookId, tabId);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(null);
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id === activeNotebookId ? { ...nb, activeTabId: tabId } : nb
      )
    }));
    const nb = data.notebooks.find(n => n.id === activeNotebookId);
    const tab = nb?.tabs.find(t => t.id === tabId);
    if (tab) {
      const lastPageId = localStorage.getItem(`strata_history_tab_${tabId}`);
      setActivePageId(lastPageId && tab.pages.some(p => p.id === lastPageId) ? lastPageId : (tab.activePageId || (tab.pages && tab.pages[0] ? tab.pages[0].id : null)));
    }
  }, [flushAndClearSync, setData, activeNotebookId, data.notebooks]);

  const selectPage = useCallback((pageId) => {
    flushAndClearSync();
    setActivePageId(pageId);
    localStorage.setItem('strata_history_tab_' + activeTabId, pageId);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(null);
    
    const page = data.notebooks.flatMap(nb => nb.tabs.flatMap(t => t.pages)).find(p => p.id === pageId);
    if (page?.embedUrl) {
      setViewedEmbedPages(prev => new Set([...prev, pageId]));
    }
    
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(t => 
            t.id === activeTabId ? { ...t, activePageId: pageId } : t
          )
        }
      )
    }));
  }, [flushAndClearSync, setData, activeNotebookId, activeTabId, data.notebooks]);

  // ==================== CRUD OPERATIONS (useAppActions) ====================
  const {
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
  } = useAppActions({
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
  });

  // ==================== BLOCK EDITOR (useBlockEditor) ====================
  const {
    handleUpdateBlock,
    handleRemoveBlock: handleRemoveBlockFromEditor,
    handleInsertBlockAfter,
    handleDrop,
    changeBlockType,
    updateBlockColor,
    updatePageCover
  } = useBlockEditor({
    activePageRowsRef,
    dataRef,
    activeIdsRef,
    updatePageContentRef,
    syncContentDebounceRef,
    scheduleSyncToData,
    setActivePageRows,
    updatePageContent,
    pageTree,
    rowsForEditor,
    settings,
    draggedBlock,
    dropTarget,
    setDraggedBlock,
    setDropTarget,
    setAutoFocusId,
    setBlockMenu,
    setMapConfigBlockId,
    setMapConfigPosition,
    showNotification
  });

  // Alias for keyboard nav
  const handleRemoveBlock = handleRemoveBlockFromEditor;

  // ==================== KEYBOARD NAVIGATION ====================
  useKeyboardNavigation({
    data,
    activeNotebookId,
    activeTabId,
    activePageId,
    selectNotebook,
    selectTab,
    selectPage,
    undo,
    redo,
    selectedBlockId,
    handleRemoveBlock,
    setSelectedBlockId,
    setBlockMenu,
    modalStates: {
      notebookIconPicker,
      tabIconPicker,
      activeTabMenu,
      showSettings,
      showDriveUrlModal
    },
    shouldFocusPageRef
  });

  // ==================== UI REGISTRY (useUIRegistry) ====================
  useUIRegistry({
    setActiveTabMenu,
    setShowAddMenu,
    setSelectedBlockId,
    setBlockMenu,
    editingTabId,
    editingNotebookId,
    editingPageId,
    setEditingTabId,
    setEditingNotebookId,
    setEditingPageId,
    setShowIconPicker,
    setShowCoverInput,
    setNotebookIconPicker,
    setTabIconPicker,
    setPageIconPicker,
    setIconSearchTerm,
    setShowSettings,
    setShowPageTypeMenu
  });

  // ==================== ICON OPERATIONS ====================
  
  const updateNotebookIcon = useCallback((notebookId, icon) => {
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id === notebookId ? { ...nb, icon } : nb
      )
    }));
    setNotebookIconPicker(null);
    setIconSearchTerm('');
    triggerStructureSync();
  }, [setData, triggerStructureSync]);

  const updateTabIcon = useCallback((tabId, icon) => {
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab => tab.id === tabId ? { ...tab, icon } : tab)
        }
      )
    }));
    setTabIconPicker(null);
    setIconSearchTerm('');
    triggerStructureSync();
  }, [setData, activeNotebookId, triggerStructureSync]);

  const updatePageIcon = useCallback((pageId, icon) => {
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab => 
            tab.id !== activeTabId ? tab : {
              ...tab,
              pages: tab.pages.map(p => p.id === pageId ? { ...p, icon } : p)
            }
          )
        }
      )
    }));
    setPageIconPicker(null);
    setIconSearchTerm('');
    triggerStructureSync();
  }, [setData, activeNotebookId, activeTabId, triggerStructureSync]);

  const updateTabColor = useCallback((tabId, color) => {
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id !== activeNotebookId ? nb : {
          ...nb,
          tabs: nb.tabs.map(tab => tab.id !== tabId ? tab : { ...tab, color })
        }
      )
    }));
    setActiveTabMenu(null);
    triggerStructureSync();
  }, [setData, activeNotebookId, triggerStructureSync]);

  // ==================== NAV DRAG AND DROP ====================
  
  const handleNavDragStart = useCallback((e, type, id, index) => {
    e.dataTransfer.setData('nav_drag', JSON.stringify({ 
      type, 
      id, 
      index,
      sourceNotebookId: activeNotebookId,
      sourceTabId: activeTabId
    }));
  }, [activeNotebookId, activeTabId]);

  const getStarredPages = useCallback(() => {
    const starred = [];
    data.notebooks.forEach(nb => {
      nb.tabs.forEach(tab => {
        tab.pages.forEach(page => {
          if (page.starred) {
            starred.push({
              ...page,
              notebookId: nb.id,
              tabId: tab.id,
              notebookName: nb.name,
              tabName: tab.name
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

  // ==================== ADD BLOCK ====================
  
  const addBlock = useCallback((type, initialData = {}) => {
    if (!activePage || !pageTree) return;
    const newBlock = { id: generateId(), type, content: '', url: '', ...initialData };
    const newTree = JSON.parse(JSON.stringify(pageTree));
    if (!newTree.children) newTree.children = [];
    newTree.children.push({ id: generateId(), type: 'row', children: [{ id: generateId(), type: 'column', width: 1, children: [newBlock] }] });
    updatePageContent(newTree, true);
    setShowAddMenu(false);
    setAutoFocusId(newBlock.id);
  }, [activePage, pageTree, updatePageContent]);

  // ==================== PAGE UPDATE HANDLERS ====================
  
  const handleCanvasUpdate = useCallback((updates) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({ ...p, ...updates })));
    triggerContentSync(activePageId);
  }, [activePageId, activeTabId, activeNotebookId, setData, triggerContentSync]);

  const handleTableUpdate = useCallback((updatedPage) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({ ...p, ...updatedPage })));
    triggerContentSync(activePageId);
  }, [activePageId, activeTabId, activeNotebookId, setData, triggerContentSync]);

  const handleMermaidUpdate = useCallback((updates) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({ ...p, ...updates })));
    triggerContentSync(activePageId);
  }, [activePageId, activeTabId, activeNotebookId, setData, triggerContentSync]);

  // ==================== RENDER ====================
  
  const totalBlocks = pageTree ? countBlocksInTree(pageTree) : 0;

  return (
    <div className="h-screen flex bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <Sidebar
        addNotebook={addNotebook}
        selectNotebook={selectNotebook}
        handleNavDragStart={handleNavDragStart}
        handleNavDrop={handleNavDrop}
        handleFavoriteDrop={handleFavoriteDrop}
        getStarredPages={getStarredPages}
        flushAndClearSync={flushAndClearSync}
        updateLocalName={updateLocalName}
        syncRenameToDrive={syncRenameToDrive}
        notebookInputRefs={notebookInputRefs}
        setViewedEmbedPages={setViewedEmbedPages}
      />

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col">
        <NavigationRail
          activeNotebook={activeNotebook}
          activeTab={activeTab}
          selectTab={selectTab}
          selectPage={selectPage}
          handleNavDragStart={handleNavDragStart}
          handleNavDrop={handleNavDrop}
          addTab={addTab}
          addPage={addPage}
          addCanvasPage={addCanvasPage}
          addDatabasePage={addDatabasePage}
          addCodePage={addCodePage}
          editingTabId={editingTabId}
          editingPageId={editingPageId}
          updateLocalName={updateLocalName}
          syncRenameToDrive={syncRenameToDrive}
          toggleStar={toggleStar}
          executeDelete={executeDelete}
          tabInputRefs={tabInputRefs}
          tabBarRef={tabBarRef}
        >
          <PageRenderer
            viewedEmbedPages={viewedEmbedPages}
            activePage={activePage}
            handleCanvasUpdate={handleCanvasUpdate}
            handleTableUpdate={handleTableUpdate}
            handleMermaidUpdate={handleMermaidUpdate}
            toggleStar={toggleStar}
            updateLocalName={updateLocalName}
            syncRenameToDrive={syncRenameToDrive}
            updatePageCover={updatePageCover}
            pageTree={pageTree}
            rowsForEditor={rowsForEditor}
            handleDrop={handleDrop}
            handleBlockDragEnd={handleBlockDragEnd}
            handleUpdateBlock={handleUpdateBlock}
            handleRemoveBlock={handleRemoveBlock}
            handleInsertBlockAfter={handleInsertBlockAfter}
            addBlock={addBlock}
            setMapConfigBlockId={setMapConfigBlockId}
            setMapConfigPosition={setMapConfigPosition}
            titleInputRef={titleInputRef}
            autoFocusId={autoFocusId}
            handleRequestFocus={handleRequestFocus}
            handleBlockHandleClick={handleBlockHandleClick}
            handleBlockFocus={handleBlockFocus}
            handleBlockDragStart={handleBlockDragStart}
            handleBlockDragOver={handleBlockDragOver}
            dropTarget={dropTarget}
            totalBlocks={totalBlocks}
            selectedBlockId={selectedBlockId}
          />
        </NavigationRail>
      </div>

      {/* MODALS & POPUPS */}
      <ModalsContainer
        rowsForEditor={rowsForEditor}
        updateTabColor={updateTabColor}
        changeBlockType={changeBlockType}
        updateBlockColor={updateBlockColor}
        handleUpdateBlock={handleUpdateBlock}
        updatePageCover={updatePageCover}
        updateNotebookIcon={updateNotebookIcon}
        updateTabIcon={updateTabIcon}
        updatePageIcon={updatePageIcon}
        confirmDelete={confirmDelete}
        addEmbedPageFromUrl={addEmbedPageFromUrl}
        addGooglePage={addGooglePage}
        addLucidPage={addLucidPage}
        showNotification={showNotification}
        driveUrlModalValue={driveUrlModalValue}
        setDriveUrlModalValue={setDriveUrlModalValue}
        lucidUrlValue={lucidUrlValue}
        setLucidUrlValue={setLucidUrlValue}
        editEmbedName={editEmbedName}
        setEditEmbedName={setEditEmbedName}
        editEmbedUrl={editEmbedUrl}
        setEditEmbedUrl={setEditEmbedUrl}
        iconSearchTerm={iconSearchTerm}
        setIconSearchTerm={setIconSearchTerm}
        mapConfigBlockId={mapConfigBlockId}
        mapConfigPosition={mapConfigPosition}
        setMapConfigBlockId={setMapConfigBlockId}
        setMapConfigPosition={setMapConfigPosition}
        blockMenu={blockMenu}
        setBlockMenu={setBlockMenu}
        activePageId={activePageId}
        triggerContentSync={triggerContentSync}
      />
    </div>
  );
}

export default App;
