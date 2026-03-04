import { useCallback, useEffect, useRef } from 'react';
import { TREE_VERSION } from '../lib/constants';
import { getActiveContext, updatePageInData } from '../lib/utils';
import { treeToRows, rowsToTree, normalizePageContent } from '../lib/tree-operations';
import { useStrata } from '../contexts/StrataContext';

/**
 * Hook for page content sync, tree/rows derivation, and flush/schedule logic.
 * Consumes useStrata() for data, active IDs, and setActivePageRows.
 * Exposes refs needed by useBlockEditor.
 */
export function usePageContent() {
  const {
    data,
    setData,
    activeNotebookId,
    activeTabId,
    activePageId,
    activePageRows,
    setActivePageRows,
    setViewedEmbedPages,
    triggerContentSync,
    saveToHistory,
  } = useStrata();

  // Internal refs for sync debouncing and useBlockEditor
  const syncContentDebounceRef = useRef(null);
  const activePageRowsRef = useRef(null);
  const dataRef = useRef(null);
  const activeIdsRef = useRef({ notebookId: null, tabId: null, pageId: null });
  const updatePageContentRef = useRef(null);
  const lastDropTargetRef = useRef(null);
  const dropTargetRafRef = useRef(null);

  useEffect(() => {
    const ctx = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
    if (activePageId && ctx.page?.embedUrl) {
      setViewedEmbedPages((prev) => new Set([...prev, activePageId]));
    }
  }, [activePageId, data, activeNotebookId, activeTabId, setViewedEmbedPages]);

  // Sync activePageRows from data when active page changes
  useEffect(() => {
    const ctx = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
    const tree = ctx.page ? normalizePageContent(ctx.page) : null;
    setActivePageRows(tree);
  }, [data, activePageId, activeTabId, activeNotebookId, setActivePageRows]);

  // Persist last view to localStorage
  useEffect(() => {
    if (activeNotebookId && activeTabId && activePageId) {
      localStorage.setItem('strata_last_view', JSON.stringify({ activeNotebookId, activeTabId, activePageId }));
    }
  }, [activeNotebookId, activeTabId, activePageId]);

  // Keep refs in sync
  useEffect(() => {
    dataRef.current = data;
    activePageRowsRef.current = activePageRows;
    activeIdsRef.current = { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId };
  });

  const flushActivePageToData = useCallback(
    (tree) => {
      if (!activePageId || !activeTabId || !activeNotebookId) return null;
      const t = tree ?? activePageRows;
      if (!t) return null;
      const next = updatePageInData(data, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, (p) => ({
        ...p,
        content: t,
        rows: treeToRows(t),
      }));
      setData(next);
      return next;
    },
    [activePageId, activeTabId, activeNotebookId, activePageRows, data, setData]
  );

  const scheduleSyncToData = useCallback(() => {
    if (syncContentDebounceRef.current) clearTimeout(syncContentDebounceRef.current);
    syncContentDebounceRef.current = setTimeout(() => {
      syncContentDebounceRef.current = null;
      const d = dataRef.current;
      const r = activePageRowsRef.current;
      const { notebookId, tabId, pageId } = activeIdsRef.current;
      if (!d || !pageId || !tabId || !notebookId || !r) return;
      setData(updatePageInData(d, { notebookId, tabId, pageId }, (p) => ({ ...p, content: r, rows: treeToRows(r) })));
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

  const updatePageContent = useCallback(
    (tree, shouldSaveHistory = false) => {
      if (!activePageId || !activeTabId || !activeNotebookId) return;
      const t = tree && tree.version === TREE_VERSION ? tree : rowsToTree(Array.isArray(tree) ? tree : []);
      setActivePageRows(t);
      if (shouldSaveHistory) {
        const next = updatePageInData(data, { notebookId: activeNotebookId, tabId: activeTabId, pageId: activePageId }, (p) => ({
          ...p,
          content: t,
          rows: treeToRows(t),
        }));
        setData(next);
        saveToHistory(next);
        triggerContentSync(activePageId);
      } else {
        scheduleSyncToData();
        triggerContentSync(activePageId);
      }
    },
    [activePageId, activeTabId, activeNotebookId, data, setData, saveToHistory, scheduleSyncToData, triggerContentSync, setActivePageRows]
  );

  useEffect(() => {
    updatePageContentRef.current = updatePageContent;
  });

  const ctx = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
  const pageTree =
    activePageRows && activePageRows.version === TREE_VERSION ? activePageRows : (ctx.page ? normalizePageContent(ctx.page) : null);
  const rowsForEditor = pageTree ? treeToRows(pageTree) : [];

  return {
    pageTree,
    rowsForEditor,
    activePageRows,
    setActivePageRows,
    updatePageContent,
    flushAndClearSync,
    scheduleSyncToData,
    flushActivePageToData,
    // Refs for useBlockEditor
    activePageRowsRef,
    dataRef,
    activeIdsRef,
    updatePageContentRef,
    syncContentDebounceRef,
    lastDropTargetRef,
    dropTargetRafRef,
  };
}
