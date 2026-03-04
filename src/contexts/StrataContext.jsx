import { createContext, useContext, useState, useCallback } from 'react';
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
  const [showLucidModal, setShowLucidModal] = useState(false);
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [syncConflict, setSyncConflict] = useState(null);

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
    showLucidModal,
    setShowLucidModal,
    favoritesExpanded,
    setFavoritesExpanded,
    syncConflict,
    setSyncConflict
  };

  return <StrataContext.Provider value={value}>{children}</StrataContext.Provider>;
}

export function useStrata() {
  const ctx = useContext(StrataContext);
  if (!ctx) throw new Error('useStrata must be used within StrataProvider');
  return ctx;
}
