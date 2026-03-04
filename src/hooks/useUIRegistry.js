import { useEffect } from 'react';

/**
 * Hook for ephemeral UI handler logic: the global click-outside listener
 * that closes icon pickers, tab settings menus, and other popups.
 */
export function useUIRegistry({
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
}) {
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
      if (!e.target.closest('.notebook-icon-trigger') && !e.target.closest('.notebook-icon-picker')) {
        setNotebookIconPicker(null);
        setIconSearchTerm('');
      }
      if (!e.target.closest('.tab-icon-trigger') && !e.target.closest('.tab-icon-picker')) {
        setTabIconPicker(null);
        setIconSearchTerm('');
      }
      if (!e.target.closest('.page-icon-trigger') && !e.target.closest('.page-icon-picker')) {
        setPageIconPicker(null);
        setIconSearchTerm('');
      }
      if (!e.target.closest('.settings-modal') && !e.target.closest('.settings-trigger')) setShowSettings(false);
      if (!e.target.closest('.page-type-menu') && !e.target.closest('.page-type-trigger')) setShowPageTypeMenu(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [
    editingTabId,
    editingNotebookId,
    editingPageId,
    setActiveTabMenu,
    setShowAddMenu,
    setSelectedBlockId,
    setBlockMenu,
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
  ]);
}
