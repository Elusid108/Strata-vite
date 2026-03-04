import { useEffect } from 'react';
import { INITIAL_DATA } from '../lib/constants';
import { log } from '../lib/logger';
import { useStrata } from '../contexts/StrataContext';

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
    setSyncConflict,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
  } = useStrata();

  useEffect(() => {
    const loadData = async () => {
      if (isLoadingAuth) return;

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
        } catch (e) {}

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
  }, [
    isAuthenticated,
    isLoadingAuth,
    setData,
    loadFromLocalStorage,
    loadFromDrive,
    showNotification,
    setSyncConflict,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
  ]);
}
