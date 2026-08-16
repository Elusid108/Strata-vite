import { useEffect, useRef } from 'react';
import { INITIAL_DATA } from '../lib/constants';
import { log } from '../lib/logger';
import { useStrata } from '../contexts/StrataContext';
import { isPlaceholderData, pendingPageIds, persistNotebookData, tombstoneIdSet } from '../lib/sync-outbox';
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
    triggerContentSync,
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
        const tab = nb.tabs.find((t) => t.id === tgtTab) || nb.tabs.find((t) => t.id === nb.activeTabId) || nb.tabs[0];
        setActiveTabId(tab?.id || null);
        const page = tab?.pages.find((p) => p.id === tgtPg) || tab?.pages.find((p) => p.id === tab.activePageId) || tab?.pages[0];
        setActivePageId(page?.id || null);
        return true;
      };

      if (isAuthenticated) {
        try {
          const localRaw = loadFromLocalStorage();
          const localData = isPlaceholderData(localRaw) ? { notebooks: [] } : localRaw;
          const driveData = await loadFromDrive();

          const merged = mergeDriveWithLocal(localData, driveData, {
            tombstoneIds: tombstoneIdSet(),
            pendingPageIds: pendingPageIds(),
          });

          const hasTree = merged?.notebooks?.length > 0;
          if (hasTree) {
            setData(merged);
            persistNotebookData(merged);
            setActiveFromData(merged);
            enqueueRecoveryPatches(localData, driveData, triggerContentSyncRef.current);
          } else if (driveData?.notebooks?.length) {
            setData(driveData);
            persistNotebookData(driveData);
            setActiveFromData(driveData);
          } else {
            setData(INITIAL_DATA);
            setActiveFromData(INITIAL_DATA);
          }
        } catch (error) {
          console.error('Error loading from Drive:', error);
          showNotification('Failed to load from Drive. Using local data as fallback.', 'error');
          log('SYNC', 'loadData: Drive failed, fallback to localStorage');
          const localData = loadFromLocalStorage();
          if (localData?.notebooks?.length > 0 && !isPlaceholderData(localData)) {
            setData(localData);
            setActiveFromData(localData);
          } else {
            log('SYNC', 'loadData: localStorage empty, using INITIAL_DATA');
            setData(INITIAL_DATA);
            setActiveFromData(INITIAL_DATA);
          }
        } finally {
          markInitialLoadComplete();
        }
      } else {
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
