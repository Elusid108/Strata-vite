import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  APP_VERSION, 
  TREE_VERSION, 
  COLORS, 
  EMOJIS, 
  BLOCK_TYPES, 
  INITIAL_DATA,
  DRIVE_LOGO_URL,
  DRIVE_SERVICE_ICONS
} from './lib/constants';
import { 
  generateId, 
  getActiveContext, 
  updatePageInData, 
  getTabColorClasses, 
  getPageBgClass, 
  getPickerPosition,
  findBlockInRows,
  COLOR_BG_CLASSES
} from './lib/utils';
import { 
  rowsToTree, 
  treeToRows, 
  normalizePageContent, 
  countBlocksInTree
} from './lib/tree-operations';
import * as GoogleAPI from './lib/google-api';
import * as emoji from 'node-emoji';

// Icons
import {
  Plus, Trash2, GripVertical, X, Settings, Star, Book, 
  Edit3, FolderOpen, AlertCircle, Sun, Moon, Monitor, Columns,
  ChevronRight, MoreVertical, GoogleG, Minimize2, Maximize2
} from './components/icons';

// Components
import { BlockComponent } from './components/blocks';
import { 
  CanvasPageComponent, 
  TablePage, 
  MermaidPageComponent, 
  MapBlock,
  MapConfigPopup 
} from './components/pages';
import { EmbedPage } from './components/embeds';
import { log } from './lib/logger';

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
  
  const starredPages = getStarredPages();
  const totalBlocks = pageTree ? countBlocksInTree(pageTree) : 0;

  return (
    <div className="h-screen flex bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      {/* SIDEBAR - Notebooks */}
      <div className={`${settings.condensedView ? 'w-16' : 'w-56'} bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-200`}>
        {/* Header */}
        <div className={`p-3 border-b border-gray-200 dark:border-gray-700 flex items-center ${settings.condensedView ? 'justify-center' : 'justify-between'}`}>
          {!settings.condensedView && (
            <div className="flex items-center gap-2">
              <Book size={18} className="text-blue-500" />
              <span className="font-semibold text-sm">Strata</span>
              <span className="text-xs text-gray-400">v{APP_VERSION}</span>
            </div>
          )}
          <button 
            onClick={() => setShowSettings(true)} 
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded settings-trigger"
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Google Account */}
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          {isLoadingAuth ? (
            <div className="text-xs text-gray-500 text-center py-2">Loading...</div>
          ) : isAuthenticated ? (
            <div className={`flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer`} onClick={() => {
              if (hasUnsyncedChanges) {
                showNotification('Please wait for sync to finish before signing out.', 'error');
                return;
              }
              setShowSignOutConfirm(true);
            }} title={settings.condensedView ? `${userName} (${userEmail})` : undefined}>
              <GoogleG size={16} />
              {!settings.condensedView && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{userName}</div>
                  <div className="text-xs text-gray-500 truncate">{userEmail}</div>
                </div>
              )}
              {isSyncing && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className={`w-full flex items-center justify-center gap-2 p-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm`}
              title={settings.condensedView ? "Sign in with Google" : undefined}
            >
              <GoogleG size={16} />
              {!settings.condensedView && <span>Sign in with Google</span>}
            </button>
          )}
        </div>

        {/* Favorites */}
        {starredPages.length > 0 && (
          <div className="border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setFavoritesExpanded(!favoritesExpanded)}
              className={`w-full flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hover:bg-gray-200 dark:hover:bg-gray-700`}
              title={settings.condensedView ? `Favorites (${starredPages.length})` : undefined}
            >
              {!settings.condensedView && <ChevronRight size={12} className={`transition-transform ${favoritesExpanded ? 'rotate-90' : ''}`} />}
              <Star size={12} className="text-yellow-400" />
              {!settings.condensedView && (
                <>
                  <span>Favorites</span>
                  <span className="text-gray-400">({starredPages.length})</span>
                </>
              )}
            </button>
            {favoritesExpanded && (
              <div className="pb-2">
                {starredPages.map(page => (
                  <div
                    key={page.id}
                    draggable={true}
                    onDragStart={(e) => handleNavDragStart(e, 'favorite', page.id, 0)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFavoriteDrop(e, page.id)}
                    onClick={() => {
                      flushAndClearSync();
                      localStorage.setItem(`strata_history_nb_${page.notebookId}`, page.tabId);
                      localStorage.setItem(`strata_history_tab_${page.tabId}`, page.id);
                      setActiveNotebookId(page.notebookId);
                      setActiveTabId(page.tabId);
                      setActivePageId(page.id);
                      setEditingPageId(null);
                      setEditingTabId(null);
                      setEditingNotebookId(null);
                      if (page.embedUrl) {
                        setViewedEmbedPages(prev => new Set([...prev, page.id]));
                      }

                      setData(prev => ({
                        ...prev,
                        notebooks: prev.notebooks.map(nb =>
                          nb.id === page.notebookId ? {
                            ...nb,
                            activeTabId: page.tabId,
                            tabs: nb.tabs.map(t =>
                              t.id === page.tabId ? { ...t, activePageId: page.id } : t
                            )
                          } : nb
                        )
                      }));
                    }}
                    className={`flex items-center ${settings.condensedView ? 'justify-center' : 'pl-6 pr-4 gap-2'} py-1 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700`}
                    title={settings.condensedView ? page.name : undefined}
                  >
                    <span className={settings.condensedView ? 'text-xl' : ''}>{page.icon || '📄'}</span>
                    {!settings.condensedView && <span className="truncate">{page.name}</span>}
                    {!settings.condensedView && (
                      <Star size={14} className="text-yellow-400 opacity-50 ml-auto flex-shrink-0 fill-current" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notebooks List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <div className={`flex items-center ${settings.condensedView ? 'justify-center' : 'justify-between'} mb-2`}>
              {!settings.condensedView && <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Notebooks</span>}
              <button onClick={addNotebook} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Add notebook">
                <Plus size={14} />
              </button>
            </div>
            {data.notebooks.map((notebook, index) => (
              <div
                key={notebook.id}
                draggable={!editingNotebookId}
                onDragStart={(e) => handleNavDragStart(e, 'notebook', notebook.id, index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleNavDrop(e, 'notebook', index)}
                onClick={() => selectNotebook(notebook.id)}
                className={`group flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 rounded cursor-pointer mb-1 ${
                  activeNotebookId === notebook.id 
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title={settings.condensedView ? notebook.name : undefined}
              >
                <span
                  className={`${settings.condensedView ? 'text-xl' : ''} cursor-pointer hover:opacity-80 notebook-icon-trigger`}
                  onClick={(e) => {
                    if (settings.condensedView) return;
                    e.stopPropagation();
                    if (activeNotebookId !== notebook.id) return;
                    const pos = getPickerPosition(e.clientY, e.clientX);
                    setNotebookIconPicker(notebookIconPicker?.id === notebook.id ? null : { id: notebook.id, top: pos.top, left: pos.left });
                  }}
                >
                  {notebook.icon || '📓'}
                </span>
                {!settings.condensedView && (activeNotebookId === notebook.id && editingNotebookId === notebook.id ? (
                  <input
                    ref={el => notebookInputRefs.current[notebook.id] = el}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm notebook-input"
                    value={notebook.name}
                    onChange={(e) => updateLocalName('notebook', notebook.id, e.target.value)}
                    onBlur={() => { syncRenameToDrive('notebook', notebook.id); setEditingNotebookId(null); }}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span 
                    className="flex-1 truncate text-sm"
                    onClick={(e) => { if (activeNotebookId === notebook.id) { e.stopPropagation(); setEditingNotebookId(notebook.id); } }}
                  >
                    {notebook.name}
                  </span>
                ))}
                {!settings.condensedView && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: 'notebook', id: notebook.id }); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom toolbar with condensed mode toggle */}
        <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button 
            onClick={() => setSettings(s => ({...s, condensedView: !s.condensedView}))} 
            className="hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded transition-colors" 
            title={settings.condensedView ? "Expand view" : "Compact view"}
          >
            {settings.condensedView ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
          </button>
          {!settings.condensedView && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {isSyncing && <span className="text-blue-400 animate-pulse">Syncing...</span>}
            </div>
          )}
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col">
        {/* TAB BAR */}
        {activeNotebook && (
          <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-1">
            <div className="flex items-center gap-1" ref={tabBarRef}>
              {activeNotebook.tabs.map((tab, index) => (
                <div
                  key={tab.id}
                  draggable={!editingTabId}
                  onDragStart={(e) => handleNavDragStart(e, 'tab', tab.id, index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleNavDrop(e, 'tab', index)}
                  onClick={() => selectTab(tab.id)}
                  className={`group flex items-center gap-2 ${settings.condensedView ? 'px-2' : 'px-3'} py-1.5 rounded-t text-sm cursor-pointer transition-colors ${
                    getTabColorClasses(tab.color || 'gray', activeTabId === tab.id)
                  }`}
                  title={settings.condensedView ? tab.name : undefined}
                >
                  <span
                    className="cursor-pointer hover:opacity-80 tab-icon-trigger"
                    onClick={(e) => {
                      if (settings.condensedView) return;
                      e.stopPropagation();
                      if (activeTabId !== tab.id) return;
                      const pos = getPickerPosition(e.clientY, e.clientX);
                      setTabIconPicker(tabIconPicker?.id === tab.id ? null : { id: tab.id, top: pos.top, left: pos.left });
                    }}
                  >
                    {tab.icon || '📋'}
                  </span>
                  {!settings.condensedView && (activeTabId === tab.id && editingTabId === tab.id ? (
                    <input
                      ref={el => tabInputRefs.current[tab.id] = el}
                      className="w-20 bg-transparent outline-none tab-input"
                      value={tab.name}
                      onChange={(e) => updateLocalName('tab', tab.id, e.target.value)}
                      onBlur={() => { syncRenameToDrive('tab', tab.id); setEditingTabId(null); }}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span 
                      className="truncate max-w-24"
                      onClick={(e) => { if (activeTabId === tab.id) { e.stopPropagation(); setEditingTabId(tab.id); } }}
                    >
                      {tab.name}
                    </span>
                  ))}
                  {!settings.condensedView && activeTabId === tab.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setActiveTabMenu({ id: tab.id, top: rect.bottom + 5, left: rect.left });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/30 rounded tab-settings-trigger"
                    >
                      <MoreVertical size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addTab}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 relative bg-gray-100 dark:bg-gray-900">
            {/* Layer 1: Background embed pages (preserve iframe state when switching) */}
            {Array.from(viewedEmbedPages).map(pageId => {
              let p = null, nbId, tId;
              data.notebooks.forEach(nb => nb.tabs.forEach(t => t.pages.forEach(pg => { if (pg.id === pageId) { p = pg; nbId = nb.id; tId = t.id; } })));
              if (!p || !p.embedUrl) return null;
              return (
                <div key={pageId} className="absolute inset-0" style={{ opacity: activePageId === pageId ? 1 : 0, pointerEvents: activePageId === pageId ? 'auto' : 'none', zIndex: activePageId === pageId ? 10 : -100 }}>
                  <EmbedPage
                    page={p}
                    onUpdate={(updates) => {
                      setData(prev => ({
                        ...prev,
                        notebooks: prev.notebooks.map(nb =>
                          nb.id !== nbId ? nb : {
                            ...nb,
                            tabs: nb.tabs.map(tab =>
                              tab.id !== tId ? tab : {
                                ...tab,
                                pages: tab.pages.map(pg =>
                                  pg.id === pageId ? { ...pg, ...updates } : pg
                                )
                              }
                            )
                          }
                        )
                      }));
                      triggerContentSync(pageId);
                    }}
                    onToggleStar={() => toggleStar(p.id, nbId, tId)}
                    onEditUrl={() => {
                      setEditEmbedName(p.name);
                      setEditEmbedUrl(p.originalUrl || p.embedUrl);
                      setShowEditEmbed(true);
                    }}
                    isStarred={p.starred}
                  />
                </div>
              );
            })}

            {/* Layer 2: Non-embed content (Canvas, Database, Mermaid, Block, reconnect) */}
            {activePage && !activePage.embedUrl && (
              <div className={`absolute inset-0 z-20 bg-white dark:bg-gray-800 ${['canvas', 'database', 'mermaid', 'code'].includes(activePage.type) ? 'overflow-hidden' : 'overflow-auto'}`}>
                {activePage.type === 'canvas' ? (
                  <CanvasPageComponent
                    page={activePage}
                    onUpdate={handleCanvasUpdate}
                    saveToHistory={saveToHistory}
                    showNotification={showNotification}
                  />
                ) : activePage.type === 'database' ? (
                  <TablePage
                    page={activePage}
                    onUpdate={handleTableUpdate}
                  />
                ) : (activePage.type === 'mermaid' || activePage.type === 'code') ? (
                  <MermaidPageComponent
                    page={activePage}
                    onUpdate={handleMermaidUpdate}
                    saveToHistory={saveToHistory}
                    showNotification={showNotification}
                  />
                ) : ['doc','sheet','slide','form','drawing','vid','pdf','site','script','drive','lucidchart'].includes(activePage.type) ? (
                  // Embed-type page missing its embed URL - show reconnect message
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400 p-8">
                    <div className="text-6xl">{activePage.icon || '📄'}</div>
                    <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">{activePage.name}</h2>
                    <p className="text-center max-w-md">
                      This {activePage.type === 'doc' ? 'Google Doc' : 
                            activePage.type === 'sheet' ? 'Google Sheet' :
                            activePage.type === 'slide' ? 'Google Slides' :
                            activePage.type === 'form' ? 'Google Form' :
                            activePage.type === 'drawing' ? 'Google Drawing' :
                            activePage.type === 'vid' ? 'Google Video' :
                            activePage.type === 'pdf' ? 'PDF' :
                            'embedded file'} needs to be re-linked.
                      The original file reference was lost during sync.
                    </p>
                    <p className="text-sm text-gray-400">
                      Delete this page and add a new one using the Drive URL option.
                    </p>
                  </div>
                ) : (
                <>
                {/* Block page */}
                <div className="min-h-full bg-gray-100 dark:bg-gray-900 p-4">
                  <div className="max-w-4xl mx-auto min-h-[500px] bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden pb-10">
                      {/* Page Header */}
                      <div className="relative group/cover">
                        {activePage.cover && (
                          <div
                            className="h-48 w-full rounded-t-lg transition-all"
                            style={
                              activePage.cover.startsWith('linear-gradient') || activePage.cover.startsWith('#') || activePage.cover.startsWith('rgb')
                              ? { background: activePage.cover }
                              : { backgroundImage: `url(${activePage.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                            }
                          />
                        )}
                        {!activePage.cover && <div className="h-12 w-full"></div>}
                        <div className={`absolute ${activePage.cover ? 'top-4 right-4' : 'bottom-0 right-4'} opacity-0 group-hover/cover:opacity-100 transition-opacity flex gap-2 z-10`}>
                          <button onClick={() => setShowCoverInput(true)} className="cover-input-trigger bg-white/90 dark:bg-gray-800/90 backdrop-blur px-3 py-1.5 rounded text-xs font-medium hover:bg-white dark:hover:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                            {activePage.cover ? 'Change Cover' : 'Add Cover'}
                          </button>
                          {activePage.cover && (
                            <button onClick={() => updatePageCover(activePage.id, null)} className="bg-white/90 dark:bg-gray-800/90 backdrop-blur p-1.5 rounded text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 shadow-sm border border-gray-200 dark:border-gray-600">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="px-8 py-8">
                        <div className="flex items-center gap-4 mb-6">
                          <span
                            className="text-4xl cursor-pointer hover:opacity-80 page-icon-trigger"
                            onClick={(e) => {
                              const pos = getPickerPosition(e.clientY, e.clientX);
                              setPageIconPicker(pageIconPicker?.pageId === activePage.id ? null : { pageId: activePage.id, top: pos.top, left: pos.left });
                            }}
                          >
                            {activePage.icon || '📄'}
                          </span>
                          <input
                            ref={titleInputRef}
                            className="flex-1 text-3xl font-bold bg-transparent outline-none"
                            value={activePage.name}
                            onChange={(e) => updateLocalName('page', activePage.id, e.target.value)}
                            onBlur={() => syncRenameToDrive('page', activePage.id)}
                            placeholder="Untitled"
                          />
                        </div>

                        {/* Blocks */}
                        <div
                          className="space-y-2"
                          onDrop={handleDrop}
                          onDragEnd={handleBlockDragEnd}
                        >
                          {rowsForEditor.length === 0 ? (
                            <div className="min-h-[120px] border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                              Start typing or drop blocks here
                            </div>
                          ) : (
                            rowsForEditor.map((row) => (
                              <div key={row.id} className="flex gap-4 group/row relative items-stretch">
                                {row.columns.map((col) => (
                                  <div key={col.id} className="flex-1 min-w-[50px] space-y-2 flex flex-col">
                                    {col.blocks.map((block) => (
                                      <BlockComponent
                                        key={block.id}
                                        block={block}
                                        rowId={row.id}
                                        colId={col.id}
                                        onUpdate={handleUpdateBlock}
                                        onDelete={handleRemoveBlock}
                                        onInsertAfter={handleInsertBlockAfter}
                                        autoFocusId={autoFocusId}
                                        onMapConfig={(blockId, position) => {
                                          setMapConfigBlockId(blockId);
                                          setMapConfigPosition(position);
                                        }}
                                        onRequestFocus={handleRequestFocus}
                                        isSelected={selectedBlockId === block.id}
                                        onHandleClick={handleBlockHandleClick}
                                        onFocus={handleBlockFocus}
                                        onDragStart={handleBlockDragStart}
                                        onDragOver={handleBlockDragOver}
                                        onDrop={handleDrop}
                                        dropTarget={dropTarget}
                                        isLastBlock={totalBlocks === 1}
                                        isAuthenticated={isAuthenticated}
                                        GoogleAPI={GoogleAPI}
                                      />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add block button */}
                        <button
                          onClick={() => addBlock('text')}
                          className="mt-4 flex items-center gap-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                          <Plus size={16} />
                          <span className="text-sm">Add a block</span>
                        </button>
                      </div>
                  </div>
                </div>
                </>
              )}
              </div>
            )}

            {/* Empty state */}
            {!activePage && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-gray-400">
                <Book size={48} className="opacity-50" />
                <p className="text-sm font-medium">Select a page</p>
                <p className="text-xs text-gray-500">Choose a page from the list</p>
              </div>
            )}
          </div>

          {/* PAGES LIST */}
          {activeTab && (
            <div className={`${settings.condensedView ? 'w-14' : 'w-56'} border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col`}>
              <div className={`p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex ${settings.condensedView ? 'justify-center' : 'justify-between'} items-center`}>
                {!settings.condensedView && <span className="font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Pages</span>}
                <div className="relative">
                  <button
                    onClick={() => setShowPageTypeMenu(!showPageTypeMenu)}
                    className="hover:bg-gray-200 dark:hover:bg-gray-600 p-1 rounded transition-colors text-gray-500 page-type-trigger"
                  >
                    <Plus size={16} />
                  </button>
                  {showPageTypeMenu && (
                    <div className="page-type-menu absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 py-1 w-48">
                      <button onClick={() => { addPage(); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <span className="text-lg">📝</span> Block Page
                      </button>
                      <button onClick={() => { addCanvasPage(); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <span className="text-lg">🎨</span> Canvas
                      </button>
                      <button onClick={() => { addDatabasePage(); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <span className="text-lg">🗄</span> Database
                      </button>
                      <button onClick={() => { addCodePage(); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <span className="text-lg">&lt;/&gt;</span> Code Page
                      </button>
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                      <button onClick={() => { setShowDriveUrlModal(true); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <img src={DRIVE_LOGO_URL} alt="" className="w-5 h-5 object-contain" /> Drive URL
                      </button>
                      <button onClick={() => { setShowLucidModal(true); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <img src="https://www.google.com/s2/favicons?domain=lucid.app&sz=128" alt="" className="w-5 h-5 object-contain rounded-sm" /> Lucidchart
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab.pages.map((page, index) => (
                  <div
                    key={page.id}
                    id={`nav-page-${page.id}`}
                    tabIndex={0}
                    draggable={!editingPageId}
                    onDragStart={(e) => handleNavDragStart(e, 'page', page.id, index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleNavDrop(e, 'page', index)}
                    onClick={() => { if (activePageId !== page.id) selectPage(page.id); }}
                    className={`page-item group flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer text-sm outline-none transition-all ${
                      activePageId === page.id 
                        ? 'bg-gray-100 dark:bg-gray-700 border-l-4 border-l-blue-500' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'
                    }`}
                    title={settings.condensedView ? page.name : undefined}
                  >
                    <span
                      className={`${settings.condensedView ? 'text-xl' : 'mr-1 flex-shrink-0'} cursor-pointer hover:opacity-80 page-icon-trigger`}
                      onClick={(e) => {
                        if (settings.condensedView) return;
                        e.stopPropagation();
                        if (activePageId !== page.id) return;
                        const pos = getPickerPosition(e.clientY, e.clientX);
                        setPageIconPicker(pageIconPicker?.pageId === page.id ? null : { pageId: page.id, top: pos.top, left: pos.left });
                      }}
                    >
                      {page.icon || '📄'}
                    </span>
                    {!settings.condensedView && (
                      activePageId === page.id && editingPageId === page.id ? (
                        <input
                          className="flex-1 min-w-0 bg-transparent outline-none page-input"
                          value={page.name}
                          onChange={(e) => updateLocalName('page', page.id, e.target.value)}
                          onBlur={() => { syncRenameToDrive('page', page.id); setEditingPageId(null); }}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div 
                          className="flex-1 min-w-0 truncate" 
                          onClick={(e) => { if (activePageId === page.id) { e.stopPropagation(); setEditingPageId(page.id); } }}
                        >
                          {page.name}
                        </div>
                      )
                    )}
                    {!settings.condensedView && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleStar(page.id, activeNotebookId, activeTabId); }}
                          className={`${page.starred ? 'text-yellow-400' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-yellow-400'} transition-all`}
                        >
                          <Star size={14} className={page.starred ? "fill-current" : ""} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); executeDelete('page', page.id); }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== MODALS & POPUPS ==================== */}

      {/* Tab Settings Menu */}
      {activeTabMenu && (
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-3 z-[9999] tab-settings-menu"
          style={{ top: activeTabMenu.top, left: activeTabMenu.left }}
        >
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Section Color</div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {COLORS.map(c => (
              <div
                key={c.name}
                onClick={() => updateTabColor(activeTabMenu.id, c.name)}
                className={`w-5 h-5 rounded-full cursor-pointer ${COLOR_BG_CLASSES[c.name]} hover:scale-125 transition-transform shadow-sm`}
              />
            ))}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
          <button
            onClick={() => { setItemToDelete({ type: 'tab', id: activeTabMenu.id }); setActiveTabMenu(null); }}
            className="w-full text-left text-xs text-red-600 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex items-center gap-2"
          >
            <Trash2 size={12} /> Delete Section
          </button>
        </div>
      )}

      {/* Block Menu */}
      {blockMenu && (() => {
        const menuBlock = findBlockInRows(rowsForEditor, blockMenu.id);
        return menuBlock && (
          <div 
            className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] block-menu"
            style={{ top: blockMenu.top, left: blockMenu.left }}
          >
            <div className="mb-2">
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1.5">Change type</div>
              <select
                value={menuBlock.type}
                onChange={(e) => changeBlockType(blockMenu.id, e.target.value)}
                className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {BLOCK_TYPES.map(({ type, label }) => (
                  <option key={type} value={type}>{label}</option>
                ))}
              </select>
            </div>
            {menuBlock.type === 'map' && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
                <button
                  onClick={() => {
                    const blockElement = document.querySelector(`[data-block-id="${blockMenu.id}"]`);
                    if (blockElement) {
                      const rect = blockElement.getBoundingClientRect();
                      setMapConfigPosition({ top: rect.top, left: rect.left });
                    } else {
                      setMapConfigPosition({ top: blockMenu.top, left: blockMenu.left });
                    }
                    setMapConfigBlockId(blockMenu.id);
                    setBlockMenu(null);
                  }}
                  className="w-full text-left text-xs text-blue-600 dark:text-blue-400 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded flex items-center gap-2"
                >
                  <Edit3 size={12} /> Edit Map
                </button>
              </>
            )}
            <div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
            <div className="grid grid-cols-5 gap-2">
              <div
                onClick={() => updateBlockColor(blockMenu.id, null)}
                className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-500 flex items-center justify-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={10} />
              </div>
              {COLORS.map(c => (
                <div
                  key={c.name}
                  onClick={() => updateBlockColor(blockMenu.id, c.name)}
                  className={`w-5 h-5 rounded-full cursor-pointer ${COLOR_BG_CLASSES[c.name]} hover:scale-125 transition-transform shadow-sm`}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Map Config Popup */}
      {mapConfigBlockId && mapConfigPosition && (() => {
        const configBlock = findBlockInRows(rowsForEditor, mapConfigBlockId);
        return configBlock && (
          <MapConfigPopup
            blockId={mapConfigBlockId}
            currentData={configBlock.mapData}
            onSave={(mapData) => {
              handleUpdateBlock(mapConfigBlockId, { mapData });
            }}
            onClose={() => {
              setMapConfigBlockId(null);
              setMapConfigPosition(null);
            }}
            position={mapConfigPosition}
          />
        );
      })()}

      {/* Icon Pickers */}
      {notebookIconPicker && (
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] notebook-icon-picker w-64"
          style={{ top: notebookIconPicker.top, left: notebookIconPicker.left }}
        >
          <input
            type="text"
            placeholder="Search icons..."
            value={iconSearchTerm}
            onChange={(e) => setIconSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full mb-2 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
            autoFocus
          />
          <div className="h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {(iconSearchTerm.trim() ? (emoji.search(iconSearchTerm) || []).map(r => r.emoji) : EMOJIS).map((em, i) => (
                <div
                  key={i}
                  className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                  onClick={() => updateNotebookIcon(notebookIconPicker.id, em)}
                >
                  {em}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tabIconPicker && (
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] tab-icon-picker w-64"
          style={{ top: tabIconPicker.top, left: tabIconPicker.left }}
        >
          <input
            type="text"
            placeholder="Search icons..."
            value={iconSearchTerm}
            onChange={(e) => setIconSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full mb-2 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
            autoFocus
          />
          <div className="h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {(iconSearchTerm.trim() ? (emoji.search(iconSearchTerm) || []).map(r => r.emoji) : EMOJIS).map((em, i) => (
                <div
                  key={i}
                  className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                  onClick={() => updateTabIcon(tabIconPicker.id, em)}
                >
                  {em}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {pageIconPicker && (
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] page-icon-picker w-64"
          style={{ top: pageIconPicker.top, left: pageIconPicker.left }}
        >
          <input
            type="text"
            placeholder="Search icons..."
            value={iconSearchTerm}
            onChange={(e) => setIconSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-full mb-2 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
            autoFocus
          />
          <div className="h-64 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {(iconSearchTerm.trim() ? (emoji.search(iconSearchTerm) || []).map(r => r.emoji) : EMOJIS).map((em, i) => (
                <div
                  key={i}
                  className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                  onClick={() => updatePageIcon(pageIconPicker.pageId, em)}
                >
                  {em}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-xl mb-2 flex items-center gap-2 dark:text-white">
              <AlertCircle className="text-red-500" /> Confirm Deletion
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              Are you sure you want to delete this {itemToDelete.type}? All contents will be lost forever.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-2 dark:text-white">Sign out of Google?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Your data will remain synced. You can sign back in anytime.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleSignOut(); setShowSignOutConfirm(false); }}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Conflict Modal */}
      {syncConflict && (
        <div className="fixed inset-0 bg-black/50 z-[10002] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="font-bold text-xl mb-3 flex items-center gap-2 dark:text-white">
              <AlertCircle className="text-yellow-500" /> Offline Changes Detected
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed text-sm">
              We found local changes on this device that haven't been saved to Google Drive. Which version would you like to keep?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setData(syncConflict.localData);
                  triggerStructureSync();
                  setSyncConflict(null);
                }}
                className="w-full text-left p-4 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Keep Local Changes</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">Overwrites Google Drive with the unsynced data currently on this device.</div>
              </button>
              <button
                onClick={() => {
                  setData(syncConflict.driveData);
                  localStorage.setItem('strata_last_synced_hash', JSON.stringify(syncConflict.driveData.notebooks));
                  setSyncConflict(null);
                  
                  // Reset active view based on Drive Data
                  if (syncConflict.driveData.notebooks?.length > 0) {
                    const nb = syncConflict.driveData.notebooks[0];
                    setActiveNotebookId(nb.id);
                    const tab = nb.tabs[0];
                    if (tab) {
                      setActiveTabId(tab.id);
                      setActivePageId(tab.pages[0]?.id || null);
                    }
                  }
                }}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="font-bold text-gray-700 dark:text-gray-300 mb-1">Discard Local & Load from Drive</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Reverts to the last safely synced state from Google Drive.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 settings-modal">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-xl flex items-center gap-2 dark:text-white">
                <Settings size={20} /> Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="dark:text-white" />
              </button>
            </div>
            
            {/* Theme */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Theme</label>
              <div className="flex gap-2">
                {[
                  { value: 'light', icon: <Sun size={16} />, label: 'Light' },
                  { value: 'dark', icon: <Moon size={16} />, label: 'Dark' },
                  { value: 'system', icon: <Monitor size={16} />, label: 'System' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSettings(s => ({ ...s, theme: opt.value }))}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      settings.theme === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {opt.icon}
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Max Columns */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                <span className="flex items-center gap-2"><Columns size={16} /> Max Columns per Row</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={settings.maxColumns}
                  onChange={(e) => setSettings(s => ({ ...s, maxColumns: parseInt(e.target.value) }))}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-8 text-center font-bold text-lg dark:text-white">{settings.maxColumns}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Controls how many columns you can create when dragging blocks side-by-side</p>
            </div>

            <div className="border-t dark:border-gray-700 pt-4">
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600"
              >
                Done
              </button>
              <a
                href="https://chrismoore.me"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 mt-3 transition-colors"
              >
                chrismoore.me
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Add Drive URL Modal */}
      {showDriveUrlModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-xl flex items-center gap-3 dark:text-white">
                <img src={DRIVE_LOGO_URL} alt="" className="w-8 h-8 object-contain" /> Add Drive URL
              </h3>
              <button 
                onClick={() => { setShowDriveUrlModal(false); setDriveUrlModalValue(''); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="dark:text-white" />
              </button>
            </div>

            <div className="mb-6">
              <button 
                onClick={() => {
                  // Close modal first so picker is visible
                  setShowDriveUrlModal(false);
                  setDriveUrlModalValue('');
                  // Google Drive Picker integration
                  if (typeof GoogleAPI !== 'undefined' && GoogleAPI.showDrivePicker) {
                    GoogleAPI.showDrivePicker((file) => {
                      addGooglePage(file);
                    });
                  } else {
                    showNotification('Drive Picker not available', 'error');
                  }
                }}
                className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <FolderOpen size={18} /> Browse
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600"></div>
              <span className="text-sm text-gray-400">OR</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600"></div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Compatible types</label>
              <div className="grid grid-cols-5 gap-2">
                {DRIVE_SERVICE_ICONS.map((item) => (
                  <div key={item.type} className="flex flex-col items-center gap-1">
                    <img src={item.url} alt={item.name} className="w-10 h-10 object-contain rounded" />
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">URL</label>
              <input 
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                placeholder="https://docs.google.com/... or https://drive.google.com/... or PDF URL"
                value={driveUrlModalValue}
                onChange={(e) => setDriveUrlModalValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && driveUrlModalValue) {
                    if (addEmbedPageFromUrl(driveUrlModalValue)) {
                      setShowDriveUrlModal(false);
                      setDriveUrlModalValue('');
                    }
                  } else if (e.key === 'Escape') {
                    setShowDriveUrlModal(false);
                    setDriveUrlModalValue('');
                  }
                }}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-2">
                Paste a link to a Google Doc, Sheet, Slides, Form, Drawing, Site, PDF, or any Drive file shared with you.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowDriveUrlModal(false); setDriveUrlModalValue(''); }}
                className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (addEmbedPageFromUrl(driveUrlModalValue)) {
                    setShowDriveUrlModal(false);
                    setDriveUrlModalValue('');
                  }
                }}
                disabled={!driveUrlModalValue}
                className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Page
              </button>
            </div>
          </div>
        </div>
      )}

      {showLucidModal && (() => {
        const handleAddLucid = () => {
          if (!lucidUrlValue) return;
          let finalUrl = lucidUrlValue.trim();

          // Extract src if the user pasted the full <iframe> HTML snippet
          const srcMatch = finalUrl.match(/src=["'](.*?)["']/);
          if (srcMatch) finalUrl = srcMatch[1];

          // REGEX FIX: Convert Editor/View URLs to the embeddable format
          // This turns /lucidchart/UUID/edit into /documents/embedded/UUID
          const uuidMatch = finalUrl.match(/lucidchart\/([a-f0-9-]+)/);
          if (uuidMatch) {
            finalUrl = `https://lucid.app/documents/embedded/${uuidMatch[1]}`;
          } else {
            // Fallback for standard published links
            finalUrl = finalUrl.replace('/documents/view/', '/documents/embedded/');
          }

          addLucidPage(finalUrl);
          setShowLucidModal(false);
          setLucidUrlValue('');
        };

        return (
          <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl flex items-center gap-3 dark:text-white">
                  <span className="text-2xl">📊</span> Add Lucidchart
                </h3>
                <button
                  onClick={() => { setShowLucidModal(false); setLucidUrlValue(''); }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X size={20} className="dark:text-white" />
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Publish / Embed URL</label>
                <input
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="https://lucid.app/documents/embedded/..."
                  value={lucidUrlValue}
                  onChange={(e) => setLucidUrlValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddLucid();
                    else if (e.key === 'Escape') {
                      setShowLucidModal(false);
                      setLucidUrlValue('');
                    }
                  }}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2">
                  In Lucidchart, go to File &gt; Publish &gt; Generate Link, and paste the URL here.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowLucidModal(false); setLucidUrlValue(''); }}
                  className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLucid}
                  disabled={!lucidUrlValue}
                  className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Page
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Embed URL Modal */}
      {showEditEmbed && (() => {
        const handleSave = () => {
          if (!editEmbedUrl) return;
          let finalUrl = editEmbedUrl.trim();
          const activePage = data.notebooks.flatMap(n => n.tabs).flatMap(t => t.pages).find(p => p.id === activePageId);

          // Re-run formatting for Lucidchart URLs
          if (activePage?.type === 'lucidchart') {
            const srcMatch = finalUrl.match(/src=["'](.*?)["']/);
            if (srcMatch) finalUrl = srcMatch[1];
            const uuidMatch = finalUrl.match(/lucidchart\/([a-f0-9-]+)/);
            if (uuidMatch) {
              finalUrl = `https://lucid.app/documents/embedded/${uuidMatch[1]}`;
            } else {
              finalUrl = finalUrl.replace('/documents/view/', '/documents/embedded/');
              finalUrl = finalUrl.replace('/documents/edit/', '/documents/embedded/');
            }
          }

          setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({
            ...p,
            name: editEmbedName || p.name,
            embedUrl: finalUrl,
            originalUrl: editEmbedUrl,
            webViewLink: finalUrl
          })));
          triggerContentSync(activePageId);
          setShowEditEmbed(false);
        };

        return (
          <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl flex items-center gap-2 dark:text-white">
                  <Edit3 size={20} /> Edit Embed
                </h3>
                <button onClick={() => setShowEditEmbed(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X size={20} className="dark:text-white" />
                </button>
              </div>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Page Name</label>
                  <input
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                    value={editEmbedName}
                    onChange={(e) => setEditEmbedName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">URL</label>
                  <input
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                    value={editEmbedUrl}
                    onChange={(e) => setEditEmbedUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowEditEmbed(false)} className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button onClick={handleSave} className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 shadow-lg">Save Changes</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cover Picker Modal */}
      {showCoverInput && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 cover-input">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg dark:text-white">Page Cover</h3>
              <button onClick={() => setShowCoverInput(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X size={20} className="dark:text-white"/>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Image URL</label>
              <input
                type="text"
                placeholder="https://..."
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-white text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updatePageCover(activePageId, e.target.value);
                    setShowCoverInput(false);
                  }
                }}
              />
              <p className="text-[10px] text-gray-400 mt-1">Paste any image URL. Drive images must be publicly shared.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Gradients & Colors</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  'linear-gradient(to right, #ff9a9e, #fecfef)',
                  'linear-gradient(to right, #a18cd1, #fbc2eb)',
                  'linear-gradient(to right, #84fab0, #8fd3f4)',
                  'linear-gradient(to right, #fccb90, #d57eeb)',
                  'linear-gradient(to right, #e0c3fc, #8ec5fc)',
                  'linear-gradient(to right, #4facfe, #00f2fe)',
                  '#1e293b', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'
                ].map(bg => (
                  <div
                    key={bg}
                    onClick={() => { updatePageCover(activePageId, bg); setShowCoverInput(false); }}
                    className="h-10 rounded cursor-pointer border border-black/10 hover:scale-105 transition-transform"
                    style={{ background: bg }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isAuthenticated && !hasInitialLoadCompleted && (
        <div className="fixed inset-0 z-[9999] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Loading Workspace</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Syncing your notebooks from Google Drive...</p>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg z-[10000]">
          {notification.message}
        </div>
      )}
    </div>
  );
}

export default App;
