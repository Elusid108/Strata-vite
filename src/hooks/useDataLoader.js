import { useEffect, useRef } from 'react';
import { createInitialData } from '../lib/constants';
import { log } from '../lib/logger';
import { useStrata } from '../contexts/StrataContext';
import {
  clearGuestBaseline,
  guestWorkspaceHasEdits,
  installGuestWorkspace,
  isGuestTree,
  pendingPageIds,
  persistNotebookData,
  tombstoneIdSet,
} from '../lib/sync-outbox';
import { mergeDriveWithLocal } from '../lib/sync-merge';

/**
 * Hook for loading data from Drive or localStorage on mount.
 * Restores last viewed notebook/tab/page from localStorage when possible.
 */
export function useDataLoader() {
  const {
    setData,
    loadFromLocalStorage,
    loadFromDrive,
    isAuthenticated,
    isLoadingAuth,
    showNotification,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    markInitialLoadComplete,
    beginAuthenticatedLoad,
    triggerContentSync,
    setSyncConflict,
  } = useStrata();

  const triggerContentSyncRef = useRef(triggerContentSync);
  triggerContentSyncRef.current = triggerContentSync;
  const lastAuthKeyRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      if (isLoadingAuth) return;
      const authKey = isAuthenticated ? 'in' : 'out';
      if (lastAuthKeyRef.current === authKey) return;
      lastAuthKeyRef.current = authKey;

      const setActiveFromData = (loadedData) => {
        if (!loadedData?.notebooks?.length) return false;
        let tgtNb, tgtTab, tgtPg;
        try {
          const last = JSON.parse(localStorage.getItem('strata_last_view'));
          if (last) {
            tgtNb = last.activeNotebookId;
            tgtTab = last.activeTabId;
            tgtPg = last.activePageId;
          }
        } catch {
          /* ignore */
        }

        const nb = loadedData.notebooks.find((n) => n.id === tgtNb) || loadedData.notebooks[0];
        setActiveNotebookId(nb.id);
        const tabs = nb.tabs || [];
        const tab = tabs.find((t) => t.id === tgtTab) || tabs.find((t) => t.id === nb.activeTabId) || tabs[0];
        setActiveTabId(tab?.id || null);
        const pages = tab?.pages || [];
        const page = pages.find((p) => p.id === tgtPg) || pages.find((p) => p.id === tab?.activePageId) || pages[0];
        setActivePageId(page?.id || null);
        return true;
      };

      const applyTree = (tree) => {
        setData(tree);
        persistNotebookData(tree);
        setActiveFromData(tree);
      };

      if (isAuthenticated) {
        beginAuthenticatedLoad();
        let awaitingGuestChoice = false;
        try {
          const localRaw = loadFromLocalStorage();
          const driveData = await loadFromDrive();

          if (isGuestTree(localRaw) && guestWorkspaceHasEdits(localRaw)) {
            log('SYNC', 'loadData: guest sandbox has edits, waiting for merge/discard');
            setSyncConflict({ mode: 'guest', localData: localRaw, driveData });
            awaitingGuestChoice = true;
            return;
          }

          clearGuestBaseline();

          if (!localRaw?.notebooks?.length || isGuestTree(localRaw)) {
            const next = driveData?.notebooks?.length ? driveData : createInitialData();
            applyTree(next);
          } else {
            const merged = mergeDriveWithLocal(localRaw, driveData, {
              tombstoneIds: tombstoneIdSet(),
              pendingPageIds: pendingPageIds(),
            });
            const hasTree = merged?.notebooks?.length > 0;
            if (hasTree) {
              applyTree(merged);
              enqueueRecoveryPatches(localRaw, driveData, triggerContentSyncRef.current);
            } else if (driveData?.notebooks?.length) {
              applyTree(driveData);
            } else {
              applyTree(createInitialData());
            }
          }
        } catch (error) {
          console.error('Error loading from Drive:', error);
          showNotification('Failed to load from Drive. Using local data as fallback.', 'error');
          log('SYNC', 'loadData: Drive failed, fallback to localStorage');
          const localData = loadFromLocalStorage();
          if (localData?.notebooks?.length > 0 && !isGuestTree(localData)) {
            applyTree(localData);
          } else if (localData?.notebooks?.length > 0) {
            applyTree(localData);
          } else {
            log('SYNC', 'loadData: localStorage empty, using createInitialData');
            applyTree(createInitialData());
          }
        } finally {
          if (!awaitingGuestChoice) markInitialLoadComplete();
        }
      } else {
        const localData = loadFromLocalStorage();
        if (localData?.notebooks?.length > 0 && isGuestTree(localData)) {
          log('SYNC', 'loadData: not signed in, using guest localStorage', { notebookCount: localData.notebooks.length });
          setData(localData);
          setActiveFromData(localData);
        } else {
          log('SYNC', 'loadData: not signed in, installing guest workspace');
          const guest = installGuestWorkspace({ lockPersist: false });
          setData(guest);
          setActiveFromData(guest);
        }
        markInitialLoadComplete();
      }
    };

    loadData();
  }, [
    isAuthenticated,
    isLoadingAuth,
    setData,
    loadFromLocalStorage,
    loadFromDrive,
    showNotification,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    markInitialLoadComplete,
    beginAuthenticatedLoad,
    setSyncConflict,
  ]);
}

function enqueueRecoveryPatches(localData, driveData, triggerContentSync) {
  if (!localData?.notebooks || !driveData?.notebooks || !triggerContentSync) return;
  const drivePages = new Map();
  for (const nb of driveData.notebooks) {
    for (const tab of nb.tabs || []) {
      for (const page of tab.pages || []) {
        const keys = [page.driveLinkFileId, page.driveFileId, page.id].filter(Boolean);
        for (const key of keys) drivePages.set(key, page);
      }
    }
  }
  for (const nb of localData.notebooks) {
    for (const tab of nb.tabs || []) {
      for (const page of tab.pages || []) {
        const drivePage =
          drivePages.get(page.driveLinkFileId) ||
          drivePages.get(page.driveFileId) ||
          drivePages.get(page.id);
        if (drivePage && (page.modifiedAt || 0) > (drivePage.modifiedAt || 0)) {
          triggerContentSync(page.id);
        }
      }
    }
  }
}
