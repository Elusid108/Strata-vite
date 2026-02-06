import { useEffect, useCallback } from 'react';

/**
 * Hook for managing keyboard navigation shortcuts
 * @param {Object} options - Configuration options
 * @param {Object} options.data - Notebook data
 * @param {string} options.activeNotebookId - Active notebook ID
 * @param {string} options.activeTabId - Active tab ID
 * @param {string} options.activePageId - Active page ID
 * @param {Function} options.selectNotebook - Function to select a notebook
 * @param {Function} options.selectTab - Function to select a tab
 * @param {Function} options.selectPage - Function to select a page
 * @param {Function} options.undo - Undo function
 * @param {Function} options.redo - Redo function
 * @param {string} options.selectedBlockId - Currently selected block ID
 * @param {Function} options.handleRemoveBlock - Function to remove a block
 * @param {Function} options.setSelectedBlockId - Function to set selected block
 * @param {Function} options.setBlockMenu - Function to set block menu state
 * @param {Object} options.modalStates - Object with modal visibility states
 * @param {Function} options.shouldFocusPageRef - Ref for focusing page nav item
 * @returns {void}
 */
export function useKeyboardNavigation({
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
  modalStates = {},
  shouldFocusPageRef
}) {
  // Undo/Redo keyboard handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const redoKey = isMac 
        ? (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'z') 
        : (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')));
      const undoKey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;

      if (redoKey) { 
        e.preventDefault(); 
        redo?.(); 
      } else if (undoKey) { 
        e.preventDefault(); 
        undo?.(); 
      }
      
      // Delete selected block
      if (selectedBlockId && e.key === 'Delete') {
        e.preventDefault();
        handleRemoveBlock?.(selectedBlockId);
        setSelectedBlockId?.(null);
        setBlockMenu?.(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedBlockId, handleRemoveBlock, setSelectedBlockId, setBlockMenu]);

  // Navigation keyboard handler
  useEffect(() => {
    const handleNavKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;
      
      // Don't handle navigation when modals are open
      const { 
        notebookIconPicker, 
        tabIconPicker, 
        activeTabMenu, 
        showSettings, 
        showDriveUrlModal 
      } = modalStates;
      if (notebookIconPicker || tabIconPicker || activeTabMenu || showSettings || showDriveUrlModal) return;

      const notebooks = data?.notebooks || [];
      const activeNb = notebooks.find(nb => nb.id === activeNotebookId);
      const tabs = activeNb?.tabs || [];
      const activeTab = tabs.find(t => t.id === activeTabId);
      const pages = activeTab?.pages || [];

      // Ctrl+Alt+Arrow for notebook navigation
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
        e.preventDefault();
        if (notebooks.length === 0) return;
        const idx = notebooks.findIndex(nb => nb.id === activeNotebookId);
        const nextIdx = e.key === 'ArrowUp' 
          ? (idx <= 0 ? notebooks.length - 1 : idx - 1) 
          : (idx >= notebooks.length - 1 ? 0 : idx + 1);
        const targetNb = notebooks[nextIdx];
        if (targetNb) selectNotebook?.(targetNb.id);
        return;
      }

      // Ctrl+Arrow for page navigation
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (pages.length === 0) return;
        const idx = pages.findIndex(p => p.id === activePageId);
        const nextIdx = e.key === 'ArrowUp' 
          ? (idx <= 0 ? pages.length - 1 : idx - 1) 
          : (idx >= pages.length - 1 ? 0 : idx + 1);
        const targetPage = pages[nextIdx];
        if (targetPage) {
          selectPage?.(targetPage.id);
          if (shouldFocusPageRef) shouldFocusPageRef.current = true;
        }
        return;
      }

      // Ctrl+Arrow Left/Right for tab navigation
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (tabs.length === 0) return;
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const nextIdx = e.key === 'ArrowLeft' 
          ? (idx <= 0 ? tabs.length - 1 : idx - 1) 
          : (idx >= tabs.length - 1 ? 0 : idx + 1);
        const targetTab = tabs[nextIdx];
        if (targetTab) selectTab?.(targetTab.id);
        return;
      }

      // Ctrl+Alt+Number for notebook quick select
      if (mod && e.altKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const n = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        if (n >= 0 && n < notebooks.length) selectNotebook?.(notebooks[n].id);
        return;
      }

      // Ctrl+Number for tab quick select
      if (mod && !e.altKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const n = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        if (n >= 0 && n < tabs.length) selectTab?.(tabs[n].id);
      }
    };
    
    window.addEventListener('keydown', handleNavKeyDown);
    return () => window.removeEventListener('keydown', handleNavKeyDown);
  }, [
    data, 
    activeNotebookId, 
    activeTabId, 
    activePageId, 
    selectNotebook, 
    selectTab, 
    selectPage, 
    modalStates,
    shouldFocusPageRef
  ]);
}
