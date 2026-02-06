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
  getNextTabColor,
  COLOR_BG_CLASSES
} from './lib/utils';
import { 
  rowsToTree, 
  treeToRows, 
  normalizePageContent, 
  findBlockInTree, 
  removeBlockFromTree, 
  updateBlockInTree, 
  insertBlockAfterInTree,
  countBlocksInTree
} from './lib/tree-operations';
import { 
  createDefaultPage, 
  createCanvasPage, 
  createCodePage, 
  createDatabasePage 
} from './lib/page-factories';
import * as GoogleAPI from './lib/google-api';

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
import { parseEmbedUrl } from './lib/embed-utils';

// Hooks
import { useLocalStorage } from './hooks/useLocalStorage';
import { useGoogleDrive } from './hooks/useGoogleDrive';
import { useHistory } from './hooks/useHistory';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';

function App() {
  // ==================== STATE ====================
  
  // Active IDs
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const [activePageId, setActivePageId] = useState(null);
  
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
  
  // UI states
  const [activeTabMenu, setActiveTabMenu] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [notification, setNotification] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Icon picker states
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCoverInput, setShowCoverInput] = useState(false);
  const [notebookIconPicker, setNotebookIconPicker] = useState(null);
  const [tabIconPicker, setTabIconPicker] = useState(null);
  const [pageIconPicker, setPageIconPicker] = useState(null);
  
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
  
  // Page type menu and Drive states
  const [showPageTypeMenu, setShowPageTypeMenu] = useState(false);
  const [showDriveUrlModal, setShowDriveUrlModal] = useState(false);
  const [driveUrlModalValue, setDriveUrlModalValue] = useState('');
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  
  // Embed page states
  const [showEditEmbed, setShowEditEmbed] = useState(false);
  const [viewedEmbedPages, setViewedEmbedPages] = useState(new Set());
  const [pageZoomLevels, setPageZoomLevels] = useState({});
  const [editEmbedName, setEditEmbedName] = useState('');
  const [editEmbedUrl, setEditEmbedUrl] = useState('');
  
  // Account states
  const [showAccountPopup, setShowAccountPopup] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  
  // Refs for syncing
  const syncContentDebounceRef = useRef(null);
  const activePageRowsRef = useRef(null);
  const dataRef = useRef(null);
  const activeIdsRef = useRef({ notebookId: null, tabId: null, pageId: null });
  const updatePageContentRef = useRef(null);
  const tabBarRef = useRef(null);
  const lastDropTargetRef = useRef(null);
  const dropTargetRafRef = useRef(null);

  // ==================== NOTIFICATIONS ====================
  
  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ==================== HOOKS ====================
  
  // Local storage hook - manages settings and data persistence
  const { 
    settings, 
    setSettings, 
    data, 
    setData, 
    loadFromLocalStorage 
  } = useLocalStorage(false, false); // We'll manage auth separately
  
  // Google Drive hook - manages authentication and sync
  const {
    isAuthenticated,
    isLoadingAuth,
    userEmail,
    userName,
    driveRootFolderId,
    isSyncing,
    handleSignIn,
    handleSignOut,
    loadFromDrive,
    triggerStructureSync,
    syncRenameToDrive
  } = useGoogleDrive(data, setData, showNotification);
  
  // History hook - manages undo/redo
  const { 
    saveToHistory, 
    undo, 
    redo, 
    canUndo, 
    canRedo 
  } = useHistory(data, setData, showNotification);

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

      // Helper to set active IDs from data
      const setActiveFromData = (loadedData) => {
        if (!loadedData?.notebooks?.length) return false;
        const firstNb = loadedData.notebooks[0];
        setActiveNotebookId(firstNb.id);
        const tabId = firstNb.activeTabId || firstNb.tabs[0]?.id;
        setActiveTabId(tabId);
        if (tabId) {
          const tab = firstNb.tabs.find(t => t.id === tabId);
          if (tab) setActivePageId(tab.activePageId || tab.pages[0]?.id);
        }
        return true;
      };

      // Always try localStorage first for instant load
      const localData = loadFromLocalStorage();
      if (localData && localData.notebooks?.length > 0) {
        setData(localData);
        setActiveFromData(localData);
      }

      if (isAuthenticated) {
        // Then sync from Drive in background (will merge/update if needed)
        try {
          const driveData = await loadFromDrive();
          if (driveData && driveData.notebooks && driveData.notebooks.length > 0) {
            // Only update if we didn't have local data, or if Drive data is different
            if (!localData || !localData.notebooks?.length) {
              setData(driveData);
              setActiveFromData(driveData);
            }
            // Note: If local data exists, we keep it and let the sync mechanism handle updates
            // This prevents the "reset" behavior on refresh
          }
        } catch (error) {
          console.error('Error loading from Drive:', error);
          if (!localData || !localData.notebooks?.length) {
            showNotification('Failed to load from Drive.', 'error');
          }
        }
      }

      // Fallback to initial data if nothing loaded
      if (!localData || !localData.notebooks?.length) {
        if (!isAuthenticated) {
          setActiveNotebookId(INITIAL_DATA.notebooks[0].id);
          setActiveTabId(INITIAL_DATA.notebooks[0].tabs[0].id);
          setActivePageId(INITIAL_DATA.notebooks[0].tabs[0].pages[0].id);
        }
      }
    };

    loadData();
  }, [isAuthenticated, isLoadingAuth]);

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
    }, 300);
  }, [setData]);

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
    } else {
      scheduleSyncToData();
    }
  }, [activePageId, activeTabId, activeNotebookId, data, setData, saveToHistory, scheduleSyncToData]);

  useEffect(() => { updatePageContentRef.current = updatePageContent; });

  // ==================== CLICK OUTSIDE HANDLERS ====================
  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.tab-settings-trigger') && !e.target.closest('.tab-settings-menu')) setActiveTabMenu(null);
      if (!e.target.closest('.add-menu-container')) setShowAddMenu(false);
      if (!e.target.closest('.block-handle') && !e.target.closest('.block-menu')) {
        if (!e.target.closest('[contenteditable="true"]')) setSelectedBlockId(null);
        setBlockMenu(null);
      }
      if (editingTabId && !e.target.closest('.tab-input')) setEditingTabId(null);
      if (editingNotebookId && !e.target.closest('.notebook-input')) setEditingNotebookId(null);
      if (editingPageId && !e.target.closest('.page-input')) setEditingPageId(null);
      if (!e.target.closest('.icon-picker-trigger') && !e.target.closest('.icon-picker')) setShowIconPicker(false);
      if (!e.target.closest('.cover-input-trigger') && !e.target.closest('.cover-input')) setShowCoverInput(false);
      if (!e.target.closest('.notebook-icon-trigger') && !e.target.closest('.notebook-icon-picker')) setNotebookIconPicker(null);
      if (!e.target.closest('.tab-icon-trigger') && !e.target.closest('.tab-icon-picker')) setTabIconPicker(null);
      if (!e.target.closest('.page-icon-trigger') && !e.target.closest('.page-icon-picker')) setPageIconPicker(null);
      if (!e.target.closest('.settings-modal') && !e.target.closest('.settings-trigger')) setShowSettings(false);
      if (!e.target.closest('.page-type-menu') && !e.target.closest('.page-type-trigger')) setShowPageTypeMenu(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [editingTabId, editingNotebookId, editingPageId]);

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

  // ==================== BLOCK HANDLERS ====================
  
  const handleUpdateBlock = useCallback((blockId, updates) => {
    const tree = activePageRowsRef.current;
    if (!tree || tree.version !== TREE_VERSION) return;
    const newTree = updateBlockInTree(tree, blockId, updates);
    setActivePageRows(newTree);
    const { notebookId, tabId, pageId } = activeIdsRef.current;
    if (notebookId && tabId && pageId) {
      const d = dataRef.current;
      if (d) setData(updatePageInData(d, { notebookId, tabId, pageId }, p => ({ ...p, content: newTree, rows: treeToRows(newTree) })));
    }
    if (syncContentDebounceRef.current) { clearTimeout(syncContentDebounceRef.current); syncContentDebounceRef.current = null; }
    scheduleSyncToData();
  }, [scheduleSyncToData, setData]);

  const handleRemoveBlock = useCallback((blockId) => {
    const tree = activePageRowsRef.current;
    if (!tree || tree.version !== TREE_VERSION) return;
    const fn = updatePageContentRef.current;
    if (fn) fn(removeBlockFromTree(tree, blockId), true);
    showNotification('Block deleted', 'success');
  }, [showNotification]);

  const handleInsertBlockAfter = useCallback((targetBlockId, blockType) => {
    const tree = activePageRowsRef.current;
    const ids = activeIdsRef.current;
    if (!tree || tree.version !== TREE_VERSION || !ids.pageId || !ids.tabId || !ids.notebookId) return;
    const newBlockId = generateId();
    const newBlock = { id: newBlockId, type: blockType, content: '', url: '', ...(blockType === 'todo' ? { checked: false } : {}) };
    const newTree = insertBlockAfterInTree(tree, targetBlockId, newBlock);
    const fn = updatePageContentRef.current;
    if (fn) fn(newTree, true);
    setAutoFocusId(newBlockId);
  }, []);

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

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (!draggedBlock || !dropTarget) { setDraggedBlock(null); setDropTarget(null); return; }
    const { block } = draggedBlock;
    const { rowId: tgtRowId, colId: tgtColId, blockId: tgtBlockId, position } = dropTarget;

    let newRows = JSON.parse(JSON.stringify(rowsForEditor));
    let movedBlock = null;

    // Remove the dragged block from its original position
    newRows.forEach(row => { row.columns.forEach(col => { const idx = col.blocks.findIndex(b => b.id === block.id); if (idx > -1) { movedBlock = col.blocks[idx]; col.blocks.splice(idx, 1); } }); });
    newRows.forEach(row => { row.columns = row.columns.filter(c => c.blocks.length > 0); });
    newRows = newRows.filter(r => r.columns.length > 0);

    if (movedBlock) {
      if (position === 'left' || position === 'right') {
        const targetRowIndex = newRows.findIndex(r => r.id === tgtRowId);
        if (targetRowIndex > -1) {
          const targetRow = newRows[targetRowIndex];
          const targetColIndex = targetRow.columns.findIndex(c => c.id === tgtColId);
          const targetCol = targetRow.columns[targetColIndex];
          
          if (targetCol) {
            const targetBlockIndex = targetCol.blocks.findIndex(b => b.id === tgtBlockId);
            
            if (targetCol.blocks.length > 1) {
              const blocksAbove = targetCol.blocks.slice(0, targetBlockIndex);
              const targetBlock = targetCol.blocks[targetBlockIndex];
              const blocksBelow = targetCol.blocks.slice(targetBlockIndex + 1);
              
              const rowsToInsert = [];
              if (blocksAbove.length > 0) {
                rowsToInsert.push({ id: generateId(), columns: [{ id: generateId(), blocks: blocksAbove }] });
              }
              const col1 = { id: generateId(), blocks: [position === 'left' ? movedBlock : targetBlock] };
              const col2 = { id: generateId(), blocks: [position === 'left' ? targetBlock : movedBlock] };
              rowsToInsert.push({ id: generateId(), columns: [col1, col2] });
              if (blocksBelow.length > 0) {
                rowsToInsert.push({ id: generateId(), columns: [{ id: generateId(), blocks: blocksBelow }] });
              }
              
              targetCol.blocks = [];
              newRows.forEach(row => { row.columns = row.columns.filter(c => c.blocks.length > 0); });
              newRows = newRows.filter(r => r.columns.length > 0);
              
              const insertIndex = targetRowIndex <= newRows.length ? targetRowIndex : newRows.length;
              newRows.splice(insertIndex, 0, ...rowsToInsert);
            } else {
              if (targetRow.columns.length < settings.maxColumns) {
                const newCol = { id: generateId(), blocks: [movedBlock] };
                if (position === 'left') targetRow.columns.splice(targetColIndex, 0, newCol);
                else targetRow.columns.splice(targetColIndex + 1, 0, newCol);
              } else {
                targetCol.blocks.push(movedBlock);
              }
            }
          }
        }
      } else {
        const targetRow = newRows.find(r => r.id === tgtRowId);
        const targetCol = targetRow?.columns.find(c => c.id === tgtColId);
        if (targetCol) {
          const targetBlockIndex = targetCol.blocks.findIndex(b => b.id === tgtBlockId);
          const insertIndex = position === 'top' ? targetBlockIndex : targetBlockIndex + 1;
          targetCol.blocks.splice(insertIndex, 0, movedBlock);
        }
      }
    }
    updatePageContent(newRows, true);
    setDraggedBlock(null); 
    setDropTarget(null);
  }, [draggedBlock, dropTarget, rowsForEditor, settings.maxColumns, updatePageContent]);

  // ==================== NAVIGATION ====================
  
  const selectNotebook = useCallback((notebookId) => {
    const nb = data.notebooks.find(n => n.id === notebookId);
    if (!nb) return;
    flushAndClearSync();
    setActiveNotebookId(notebookId);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(null);
    const targetTabId = nb.activeTabId || (nb.tabs && nb.tabs[0] ? nb.tabs[0].id : null);
    setActiveTabId(targetTabId);
    if (targetTabId) {
      const tab = nb.tabs.find(t => t.id === targetTabId);
      setActivePageId(tab ? (tab.activePageId || (tab.pages && tab.pages[0] ? tab.pages[0].id : null)) : null);
    } else {
      setActivePageId(null);
    }
  }, [data.notebooks, flushAndClearSync]);

  const selectTab = useCallback((tabId) => {
    flushAndClearSync();
    setActiveTabId(tabId);
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
      setActivePageId(tab.activePageId || (tab.pages && tab.pages[0] ? tab.pages[0].id : null));
    }
  }, [flushAndClearSync, setData, activeNotebookId, data.notebooks]);

  const selectPage = useCallback((pageId) => {
    flushAndClearSync();
    setActivePageId(pageId);
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

  // ==================== CRUD OPERATIONS ====================
  
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
  }, [saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
  }, [activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
    return true;
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

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
  }, [activeTabId, activeNotebookId, saveToHistory, data, setData, showNotification, triggerStructureSync]);

  // ==================== DELETE OPERATIONS ====================
  
  const executeDelete = useCallback(async (type, id) => {
    saveToHistory();
    const newData = JSON.parse(JSON.stringify(data));
    let nextId = null;

    if (type === 'notebook') {
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
    
    setData(newData);
    if (itemToDelete && itemToDelete.id === id) setItemToDelete(null);
    if (activeTabMenu && activeTabMenu.id === id) setActiveTabMenu(null);
    if (selectedBlockId === id) setSelectedBlockId(null);
    showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`, 'success');
    triggerStructureSync();
  }, [saveToHistory, data, setData, activeNotebookId, activeTabId, activePageId, selectTab, selectPage, showNotification, triggerStructureSync, itemToDelete, activeTabMenu, selectedBlockId]);

  const confirmDelete = useCallback(() => {
    if (!itemToDelete) return;
    executeDelete(itemToDelete.type, itemToDelete.id);
  }, [itemToDelete, executeDelete]);

  // ==================== RENAME OPERATIONS ====================
  
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

  // ==================== ICON OPERATIONS ====================
  
  const updateNotebookIcon = useCallback((notebookId, icon) => {
    setData(prev => ({
      ...prev,
      notebooks: prev.notebooks.map(nb => 
        nb.id === notebookId ? { ...nb, icon } : nb
      )
    }));
    setNotebookIconPicker(null);
  }, [setData]);

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
  }, [setData, activeNotebookId]);

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
  }, [setData, activeNotebookId, activeTabId]);

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
  }, [setData, activeNotebookId]);

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

  const handleNavDrop = useCallback((e, type, targetIndex) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    if (dragHoverTimerRef.current) clearTimeout(dragHoverTimerRef.current);
    setDragHoverTarget(null);
    
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
  }, [saveToHistory, data, setData, activeNotebookId, activeTabId]);

  // ==================== STAR/FAVORITES ====================
  
  const toggleStar = useCallback((pageId, notebookId, tabId) => {
    setData(prev => ({
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
    }));
  }, [setData]);

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
    return starred;
  }, [data.notebooks]);

  // ==================== BLOCK TYPE CHANGE ====================
  
  const changeBlockType = useCallback((blockId, newType) => {
    const found = pageTree ? findBlockInTree(pageTree, blockId) : null;
    const block = found ? found.block : null;
    if (!block) { setBlockMenu(null); return; }
    const cur = block.type;
    const curContent = block.content || '';
    const curUrl = block.url || '';
    const textLike = ['text', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'todo', 'link'];
    const isTextLike = (t) => textLike.includes(t);
    const mediaStructural = ['image', 'video', 'divider', 'gdoc', 'map'];

    const updates = { type: newType };

    if (mediaStructural.includes(newType)) {
      updates.content = '';
      updates.url = '';
      if (newType === 'map') {
        updates.mapData = {
          center: [40.7128, -74.0060],
          zoom: 13,
          markers: [],
          locked: false
        };
        setTimeout(() => {
          const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
          if (blockElement) {
            const rect = blockElement.getBoundingClientRect();
            setMapConfigPosition({ top: rect.top, left: rect.left });
          } else {
            setMapConfigPosition({ top: window.innerHeight / 2, left: window.innerWidth / 2 });
          }
          setMapConfigBlockId(blockId);
        }, 100);
      }
    } else {
      updates.url = newType === 'link' ? curUrl : '';
      updates.checked = newType === 'todo' ? (cur === 'todo' ? (block.checked === true) : false) : false;
      if (isTextLike(cur) && isTextLike(newType)) {
        if (['ul', 'ol'].includes(cur) && !['ul', 'ol'].includes(newType)) {
          const div = document.createElement('div');
          div.innerHTML = curContent;
          updates.content = (div.innerText || '').trim();
        } else if (!['ul', 'ol'].includes(cur) && ['ul', 'ol'].includes(newType)) {
          const div = document.createElement('div');
          div.innerHTML = curContent;
          const plainText = (div.innerText || '').trim();
          updates.content = plainText ? `<li>${plainText}</li>` : '<li></li>';
        } else {
          updates.content = curContent;
        }
      } else {
        updates.content = '';
      }
    }

    handleUpdateBlock(blockId, updates);
    setBlockMenu(null);
    setAutoFocusId(blockId);
  }, [pageTree, handleUpdateBlock]);

  const updateBlockColor = useCallback((blockId, colorName) => {
    handleUpdateBlock(blockId, { backgroundColor: colorName });
    setBlockMenu(null);
  }, [handleUpdateBlock]);

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
  }, [activePageId, activeTabId, activeNotebookId, setData]);

  const handleTableUpdate = useCallback((updatedPage) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, () => updatedPage));
  }, [activePageId, activeTabId, activeNotebookId, setData]);

  const handleMermaidUpdate = useCallback((updates) => {
    if (!activePageId || !activeTabId || !activeNotebookId) return;
    setData(prev => updatePageInData(prev, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, p => ({ ...p, ...updates })));
  }, [activePageId, activeTabId, activeNotebookId, setData]);

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
            <div className={`flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer`} onClick={() => setShowSignOutConfirm(true)} title={settings.condensedView ? `${userName} (${userEmail})` : undefined}>
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
            {favoritesExpanded && !settings.condensedView && (
              <div className="pb-2">
                {starredPages.map(page => (
                  <div
                    key={page.id}
                    onClick={() => {
                      selectNotebook(page.notebookId);
                      setTimeout(() => {
                        selectTab(page.tabId);
                        setTimeout(() => selectPage(page.id), 50);
                      }, 50);
                    }}
                    className="flex items-center gap-2 px-4 py-1 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <span>{page.icon || '📄'}</span>
                    <span className="truncate">{page.name}</span>
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
                    e.stopPropagation();
                    if (activeNotebookId !== notebook.id) return;
                    if (settings.condensedView) return;
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
              <span>v{APP_VERSION}</span>
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
                      e.stopPropagation();
                      if (activeTabId !== tab.id) return;
                      if (settings.condensedView) return;
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
          <div className="flex-1 overflow-auto">
            {activePage ? (
              activePage.type === 'canvas' ? (
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
              ) : activePage.type === 'mermaid' ? (
                <MermaidPageComponent
                  page={activePage}
                  onUpdate={handleMermaidUpdate}
                  saveToHistory={saveToHistory}
                  showNotification={showNotification}
                />
              ) : activePage.embedUrl ? (
                <EmbedPage
                  page={activePage}
                  onUpdate={(updates) => {
                    setData(prev => ({
                      ...prev,
                      notebooks: prev.notebooks.map(nb => 
                        nb.id !== activeNotebookId ? nb : {
                          ...nb,
                          tabs: nb.tabs.map(tab => 
                            tab.id !== activeTabId ? tab : {
                              ...tab,
                              pages: tab.pages.map(p =>
                                p.id === activePage.id ? { ...p, ...updates } : p
                              )
                            }
                          )
                        }
                      )
                    }));
                  }}
                  onToggleStar={() => toggleStar(activePage.id, activeNotebookId, activeTabId)}
                  onEditUrl={() => {
                    setEditEmbedName(activePage.name);
                    setEditEmbedUrl(activePage.originalUrl || activePage.embedUrl);
                    setShowEditEmbed(true);
                  }}
                  isStarred={activePage.starred}
                />
              ) : ['doc','sheet','slide','form','drawing','vid','pdf','site','script','drive'].includes(activePage.type) ? (
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
                // Block page
                <div className="min-h-full bg-gray-100 dark:bg-gray-900 p-4">
                  <div className="max-w-4xl mx-auto min-h-[500px] bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden pb-10">
                      {/* Page Header */}
                      {activePage.cover && (
                        <div className="h-48 w-full bg-cover bg-center rounded-t-lg" style={{ backgroundImage: `url(${activePage.cover})` }} />
                      )}
                      <div className="px-8 py-8">
                        <div className="flex items-center gap-4 mb-6">
                          <span
                            className="text-4xl cursor-pointer hover:opacity-80 icon-picker-trigger"
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
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
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
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                      <button onClick={() => { addCodePage(); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <span className="text-lg">&lt;/&gt;</span> Code Page
                      </button>
                      <button onClick={() => { setShowDriveUrlModal(true); setShowPageTypeMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm">
                        <img src={DRIVE_LOGO_URL} alt="" className="w-5 h-5 object-contain" /> Drive URL
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
                          <Star size={14} filled={page.starred} />
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
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] notebook-icon-picker w-64 h-64 overflow-y-auto"
          style={{ top: notebookIconPicker.top, left: notebookIconPicker.left }}
        >
          <div className="grid grid-cols-5 gap-1">
            {EMOJIS.slice(0, 100).map((emoji, i) => (
              <div
                key={i}
                className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                onClick={() => updateNotebookIcon(notebookIconPicker.id, emoji)}
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
      )}

      {tabIconPicker && (
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] tab-icon-picker w-64 h-64 overflow-y-auto"
          style={{ top: tabIconPicker.top, left: tabIconPicker.left }}
        >
          <div className="grid grid-cols-5 gap-1">
            {EMOJIS.slice(0, 100).map((emoji, i) => (
              <div
                key={i}
                className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                onClick={() => updateTabIcon(tabIconPicker.id, emoji)}
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
      )}

      {pageIconPicker && (
        <div 
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[9999] page-icon-picker w-64 h-64 overflow-y-auto"
          style={{ top: pageIconPicker.top, left: pageIconPicker.left }}
        >
          <div className="grid grid-cols-5 gap-1">
            {EMOJIS.slice(0, 100).map((emoji, i) => (
              <div
                key={i}
                className="text-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center"
                onClick={() => updatePageIcon(pageIconPicker.pageId, emoji)}
              >
                {emoji}
              </div>
            ))}
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
