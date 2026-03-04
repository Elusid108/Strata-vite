import { useEffect } from 'react';
import { useStrata } from '../contexts/StrataContext';

/**
 * Hook for focus effects: focus inputs when editing, focus page nav when switching.
 */
export function useFocusEffects() {
  const {
    editingNotebookId,
    editingTabId,
    shouldFocusTitle,
    setShouldFocusTitle,
    shouldFocusPageRef,
    titleInputRef,
    notebookInputRefs,
    tabInputRefs,
    activePageId,
  } = useStrata();

  useEffect(() => {
    if (shouldFocusPageRef?.current && activePageId) {
      const el = document.getElementById(`nav-page-${activePageId}`);
      if (el) el.focus();
      shouldFocusPageRef.current = false;
    }
  }, [activePageId, shouldFocusPageRef]);

  useEffect(() => {
    if (shouldFocusTitle) {
      setTimeout(() => {
        if (titleInputRef?.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        }
        setShouldFocusTitle(false);
      }, 100);
    }
  }, [activePageId, shouldFocusTitle, titleInputRef, setShouldFocusTitle]);

  useEffect(() => {
    if (editingNotebookId) {
      setTimeout(() => {
        const input = notebookInputRefs?.current?.[editingNotebookId];
        if (input) {
          input.focus();
          input.select();
        }
      }, 100);
    }
  }, [editingNotebookId, notebookInputRefs]);

  useEffect(() => {
    if (editingTabId) {
      setTimeout(() => {
        const input = tabInputRefs?.current?.[editingTabId];
        if (input) {
          input.focus();
          input.select();
        }
      }, 100);
    }
  }, [editingTabId, tabInputRefs]);
}
