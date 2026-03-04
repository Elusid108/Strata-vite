import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useGoogleDrive } from '../hooks/useGoogleDrive';
import { useHistory } from '../hooks/useHistory';

const StrataContext = createContext(null);

export function StrataProvider({ children }) {
  // ==================== UI STATE (notification needed for showNotification) ====================
  const [notification, setNotification] = useState(null);

  // ==================== HOOKS ====================
  const { settings, setSettings, data, setData, loadFromLocalStorage } = useLocalStorage(false, false);

  const showNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const {
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
    hasInitialLoadCompleted
  } = useGoogleDrive(data, setData, showNotification);

  const { saveToHistory, undo, redo, canUndo, canRedo } = useHistory(data, setData, showNotification);

  // ==================== ACTIVE IDS ====================
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [activeTabId, setActiveTabId] = useState(null);
  const [activePageId, setActivePageId] = useState(null);

  // ==================== UI STATE ====================
  const [showSettings, setShowSettings] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeTabMenu, setActiveTabMenu] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showDriveUrlModal, setShowDriveUrlModal] = useState(false);
  const [showPageTypeMenu, setShowPageTypeMenu] = useState(false);
  const [showAccountPopup, setShowAccountPopup] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showCoverInput, setShowCoverInput] = useState(false);
  const [notebookIconPicker, setNotebookIconPicker] = useState(null);
  const [tabIconPicker, setTabIconPicker] = useState(null);
  const [pageIconPicker, setPageIconPicker] = useState(null);
  const [showEditEmbed, setShowEditEmbed] = useState(false);
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [syncConflict, setSyncConflict] = useState(null);

  // Editing states
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingNotebookId, setEditingNotebookId] = useState(null);

  // Block/editor states
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [activePageRows, setActivePageRows] = useState(null);
  const [autoFocusId, setAutoFocusId] = useState(null);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [blockMenu, setBlockMenu] = useState(null);
  const [mapConfigBlockId, setMapConfigBlockId] = useState(null);
  const [mapConfigPosition, setMapConfigPosition] = useState(null);

  // Modal input values
  const [iconSearchTerm, setIconSearchTerm] = useState('');
  const [driveUrlModalValue, setDriveUrlModalValue] = useState('');
  const [editEmbedName, setEditEmbedName] = useState('');
  const [editEmbedUrl, setEditEmbedUrl] = useState('');

  // Other UI
  const [viewedEmbedPages, setViewedEmbedPages] = useState(new Set());
  const [dragHoverTarget, setDragHoverTarget] = useState(null);
  const [creationFlow, setCreationFlow] = useState(null);
  const [shouldFocusTitle, setShouldFocusTitle] = useState(false);

  // Refs (stable, passed in context)
  const notebookInputRefs = useRef({});
  const tabInputRefs = useRef({});
  const tabBarRef = useRef(null);
  const titleInputRef = useRef(null);
  const shouldFocusPageRef = useRef(false);
  const dragHoverTimerRef = useRef(null);

  // Enforce background page limit (LRU Trim)
  useEffect(() => {
    if (settings.limitBackgroundPages && viewedEmbedPages.size > (settings.maxBackgroundPages || 10)) {
      setViewedEmbedPages(prev => {
        const arr = Array.from(prev);
        return new Set(arr.slice(-(settings.maxBackgroundPages || 10)));
      });
    }
  }, [settings.limitBackgroundPages, settings.maxBackgroundPages, viewedEmbedPages.size]);

  const value = {
    // Data & persistence
    data,
    setData,
    settings,
    setSettings,
    loadFromLocalStorage,
    // Auth & sync
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
    // History
    saveToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    // Active IDs
    activeNotebookId,
    setActiveNotebookId,
    activeTabId,
    setActiveTabId,
    activePageId,
    setActivePageId,
    // UI state
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
    favoritesExpanded,
    setFavoritesExpanded,
    syncConflict,
    setSyncConflict,
    // Editing states
    editingPageId,
    setEditingPageId,
    editingTabId,
    setEditingTabId,
    editingNotebookId,
    setEditingNotebookId,
    // Block/editor states
    draggedBlock,
    setDraggedBlock,
    dropTarget,
    setDropTarget,
    activePageRows,
    setActivePageRows,
    autoFocusId,
    setAutoFocusId,
    selectedBlockId,
    setSelectedBlockId,
    blockMenu,
    setBlockMenu,
    mapConfigBlockId,
    setMapConfigBlockId,
    mapConfigPosition,
    setMapConfigPosition,
    // Modal input values
    iconSearchTerm,
    setIconSearchTerm,
    driveUrlModalValue,
    setDriveUrlModalValue,
    editEmbedName,
    setEditEmbedName,
    editEmbedUrl,
    setEditEmbedUrl,
    // Other UI
    viewedEmbedPages,
    setViewedEmbedPages,
    dragHoverTarget,
    setDragHoverTarget,
    creationFlow,
    setCreationFlow,
    shouldFocusTitle,
    setShouldFocusTitle,
    // Refs
    notebookInputRefs,
    tabInputRefs,
    tabBarRef,
    titleInputRef,
    shouldFocusPageRef,
    dragHoverTimerRef
  };

  return <StrataContext.Provider value={value}>{children}</StrataContext.Provider>;
}

export function useStrata() {
  const ctx = useContext(StrataContext);
  if (!ctx) throw new Error('useStrata must be used within StrataProvider');
  return ctx;
}
