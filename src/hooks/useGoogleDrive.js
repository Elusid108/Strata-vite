import { useState, useEffect, useRef, useCallback } from 'react';
import { log } from '../lib/logger';
import * as GoogleAPI from '../lib/google-api';
import { reconcileData } from '../lib/reconciler';
import {
  enqueueOp,
  enqueueTrash,
  peekOp,
  hasPendingOps,
  persistNotebookData,
  clearSyncState,
  SyncNotReadyError,
  getLiveTree,
} from '../lib/sync-outbox';
import { processSyncOp } from '../lib/sync-engine';

/**
 * Hook for managing Google Drive authentication and serial outbox sync
 */
export function useGoogleDrive(data, setData, showNotification) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [userName, setUserName] = useState(null);

  const [driveRootFolderId, setDriveRootFolderId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(() => hasPendingOps());

  const workerLockRef = useRef(false);
  const backoffRef = useRef(1000);
  const workerTimerRef = useRef(null);
  const pendingKickRef = useRef(false);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const rootFolderRef = useRef(driveRootFolderId);
  useEffect(() => {
    rootFolderRef.current = driveRootFolderId;
  }, [driveRootFolderId]);

  const setDataAndRef = useCallback(
    (updater) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        dataRef.current = next;
        persistNotebookData(next);
        return next;
      });
    },
    [setData]
  );

  const refreshUnsynced = useCallback(() => {
    setHasUnsyncedChanges(hasPendingOps());
  }, []);

  const runWorker = useCallback(async () => {
    if (workerLockRef.current) return;
    if (!isAuthenticated || isLoadingAuth || !rootFolderRef.current || !hasInitialLoadCompleted) return;

    workerLockRef.current = true;
    setIsSyncing(true);
    let retrying = false;
    try {
      while (true) {
        const op = peekOp();
        if (!op) {
          backoffRef.current = 1000;
          localStorage.setItem('strata_last_synced_hash', JSON.stringify(dataRef.current?.notebooks || []));
          setLastSyncTime(Date.now());
          break;
        }
        try {
          await processSyncOp(op, {
            dataRef,
            setDataAndRef,
            rootFolderId: rootFolderRef.current,
          });
          backoffRef.current = 1000;
        } catch (error) {
          if (error instanceof SyncNotReadyError || error?.code === 'NOT_READY') {
            log('SYNC', 'op not ready, retrying', { type: op.type, message: error.message });
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          log('ERROR', 'sync op failed', error);
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
          retrying = true;
          workerTimerRef.current = setTimeout(() => {
            workerLockRef.current = false;
            runWorker();
          }, delay);
          return;
        }
      }
    } finally {
      if (!retrying) {
        workerLockRef.current = false;
        setIsSyncing(false);
        refreshUnsynced();
        if (pendingKickRef.current) {
          pendingKickRef.current = false;
          runWorker();
        }
      }
    }
  }, [isAuthenticated, isLoadingAuth, hasInitialLoadCompleted, setDataAndRef, refreshUnsynced]);

  const kickWorker = useCallback(() => {
    refreshUnsynced();
    if (workerLockRef.current) {
      pendingKickRef.current = true;
      return;
    }
    if (workerTimerRef.current) {
      clearTimeout(workerTimerRef.current);
      workerTimerRef.current = null;
    }
    workerTimerRef.current = setTimeout(() => {
      runWorker();
    }, 50);
  }, [runWorker, refreshUnsynced]);

  useEffect(() => {
    return () => {
      if (workerTimerRef.current) clearTimeout(workerTimerRef.current);
    };
  }, []);

  // Initialize Google APIs and check auth status
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!GoogleAPI.loadGapi) {
          log('SYNC', 'Google API not loaded, using localStorage fallback');
          setIsLoadingAuth(false);
          return;
        }

        await GoogleAPI.loadGapi();
        await GoogleAPI.initGoogleAuth();

        const userInfo = await GoogleAPI.checkAuthStatus();
        if (userInfo) {
          setIsAuthenticated(true);
          setUserEmail(userInfo.email);
          setUserName(userInfo.name || userInfo.given_name || userInfo.email);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        log('ERROR', 'Error initializing Google auth:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    initAuth();
  }, []);

  const handleSignIn = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      const userInfo = await GoogleAPI.signIn();
      setIsAuthenticated(true);
      setUserEmail(userInfo.email);
      setUserName(userInfo.name || userInfo.given_name || userInfo.email);
      showNotification?.('Signed in successfully', 'success');
    } catch (error) {
      log('ERROR', 'Sign in error:', error);
      showNotification?.('Sign in failed', 'error');
    } finally {
      setIsLoadingAuth(false);
    }
  }, [showNotification]);

  const handleSignOut = useCallback(() => {
    log('SYNC', 'handleSignOut: clearing local storage');
    localStorage.removeItem('note-app-data-v1');
    clearSyncState();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('strata-cache-')) localStorage.removeItem(key);
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('strata-cache-')) sessionStorage.removeItem(key);
    }
    GoogleAPI.signOut();
    setIsAuthenticated(false);
    setUserEmail(null);
    setUserName(null);
    setDriveRootFolderId(null);
    showNotification?.('Signed out', 'info');
    window.location.reload();
  }, [showNotification]);

  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth) return;

    const initDriveSync = async () => {
      try {
        setIsSyncing(true);
        const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
        setDriveRootFolderId(rootFolderId);
        setLastSyncTime(Date.now());
      } catch (error) {
        log('ERROR', 'Error initializing Drive sync:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    initDriveSync();
  }, [isAuthenticated, isLoadingAuth]);

  const enqueueStructureFromTree = useCallback((tree) => {
    const notebooks = tree?.notebooks || [];
    for (const notebook of notebooks) {
      enqueueOp(
        { type: 'ensureFolder', entityType: 'notebook', appId: notebook.id },
        `folder:${notebook.id}`
      );
      for (const tab of notebook.tabs || []) {
        enqueueOp(
          { type: 'ensureFolder', entityType: 'tab', appId: tab.id, notebookId: notebook.id },
          `folder:${tab.id}`
        );
        for (const page of tab.pages || []) {
          enqueueOp(
            { type: 'ensurePageFile', pageId: page.id, tabId: tab.id, notebookId: notebook.id },
            `page:${page.id}`
          );
        }
      }
    }
    enqueueOp({ type: 'saveIndex' }, 'saveIndex');
  }, []);

  const bootEnqueuedRef = useRef(false);
  useEffect(() => {
    if (hasInitialLoadCompleted && isAuthenticated && driveRootFolderId) {
      if (!bootEnqueuedRef.current) {
        bootEnqueuedRef.current = true;
        enqueueStructureFromTree(dataRef.current);
      }
      kickWorker();
    }
  }, [hasInitialLoadCompleted, isAuthenticated, driveRootFolderId, kickWorker, enqueueStructureFromTree]);

  const triggerStructureSync = useCallback((tree) => {
    const snapshot = tree || getLiveTree() || dataRef.current;
    persistNotebookData(snapshot);
    dataRef.current = snapshot;
    enqueueStructureFromTree(snapshot);
    kickWorker();
  }, [enqueueStructureFromTree, kickWorker]);

  const triggerContentSync = useCallback(
    (pageId) => {
      const snapshot = getLiveTree() || dataRef.current;
      persistNotebookData(snapshot);
      dataRef.current = snapshot;
      if (pageId) {
        enqueueOp({ type: 'patchPage', pageId }, `patch:${pageId}`);
      }
      kickWorker();
    },
    [kickWorker]
  );

  const queueDriveDelete = useCallback(
    (driveIds) => {
      const snapshot = getLiveTree() || dataRef.current;
      persistNotebookData(snapshot);
      dataRef.current = snapshot;
      enqueueTrash(driveIds);
      enqueueOp({ type: 'saveIndex' }, 'saveIndex');
      kickWorker();
    },
    [kickWorker]
  );

  const moveItemInDrive = useCallback(
    async (itemId, newParentId, oldParentId) => {
      if (!itemId || !newParentId || !oldParentId) return;
      const snapshot = getLiveTree() || dataRef.current;
      persistNotebookData(snapshot);
      dataRef.current = snapshot;
      enqueueOp(
        { type: 'move', driveId: itemId, newParentId, oldParentId },
        `move:${itemId}`
      );
      enqueueOp({ type: 'saveIndex' }, 'saveIndex');
      kickWorker();
    },
    [kickWorker]
  );

  const loadFromDrive = useCallback(async () => {
    if (!isAuthenticated || isLoadingAuth) return null;

    try {
      const cacheKey = userEmail ? `strata-cache-${userEmail}` : null;
      const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

      let cached = null;
      if (cacheKey) {
        const sessionCached = sessionStorage.getItem(cacheKey);
        const localCached = localStorage.getItem(cacheKey);

        if (sessionCached) {
          try {
            cached = JSON.parse(sessionCached);
          } catch {
            /* ignore */
          }
        }
        if (!cached && localCached) {
          try {
            const parsed = JSON.parse(localCached);
            const age = Date.now() - (parsed.timestamp || 0);
            if (age < CACHE_MAX_AGE_MS && parsed.data) {
              cached = parsed;
            }
          } catch {
            /* ignore */
          }
        }
        log('SYNC', 'loadFromDrive: cache check', { cacheKey, hasCached: !!cached, cachedNotebookCount: cached?.data?.notebooks?.length });
      }

      const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
      log('SYNC', 'loadFromDrive: root folder', { rootFolderId });

      const driveData = await GoogleAPI.loadFromDriveStructure(rootFolderId);

      if (driveData && driveData.notebooks) {
        log('SYNC', 'loadFromDrive: loaded from Drive', { notebookCount: driveData.notebooks.length });
        const reconciled = reconcileData(driveData);
        setDriveRootFolderId(rootFolderId);
        if (cacheKey) {
          const cacheEntry = { data: reconciled, timestamp: Date.now() };
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
          } catch {
            /* quota or disabled */
          }
        }
        return reconciled;
      }

      if (cached?.data) {
        log('SYNC', 'loadFromDrive: using cached data', { notebookCount: cached.data.notebooks?.length });
        const reconciled = reconcileData(cached.data);
        setDriveRootFolderId(rootFolderId);
        return reconciled;
      }

      log('SYNC', 'loadFromDrive: Drive empty or failed');
      setDriveRootFolderId(rootFolderId);
      return null;
    } catch (error) {
      log('ERROR', 'Error loading from Drive:', error);
      if (error.message?.includes('Authentication')) {
        showNotification?.('Authentication expired. Please sign in again.', 'error');
      }
      return null;
    }
  }, [isAuthenticated, isLoadingAuth, userEmail, showNotification]);

  const markInitialLoadComplete = useCallback(() => {
    setHasInitialLoadCompleted(true);
  }, []);

  const syncRenameToDrive = useCallback(
    (type, id) => {
      const currentData = dataRef.current;
      if (!currentData?.notebooks) return;

      for (const nb of currentData.notebooks) {
        if (type === 'notebook' && nb.id === id && nb.driveFolderId) {
          enqueueOp(
            { type: 'rename', driveId: nb.driveFolderId, name: GoogleAPI.sanitizeFileName(nb.name) },
            `rename:${nb.driveFolderId}`
          );
          triggerStructureSync();
          return;
        }
        for (const tab of nb.tabs) {
          if (type === 'tab' && tab.id === id && tab.driveFolderId) {
            enqueueOp(
              { type: 'rename', driveId: tab.driveFolderId, name: GoogleAPI.sanitizeFileName(tab.name) },
              `rename:${tab.driveFolderId}`
            );
            triggerStructureSync();
            return;
          }
          for (const pg of tab.pages) {
            if (pg.id === id) {
              const fileId = pg.driveLinkFileId || pg.driveFileId;
              if (fileId) {
                enqueueOp(
                  { type: 'rename', driveId: fileId, name: GoogleAPI.sanitizeFileName(pg.name) + '.json' },
                  `rename:${fileId}`
                );
              }
              triggerContentSync(id);
              triggerStructureSync();
              return;
            }
          }
        }
      }
    },
    [triggerStructureSync, triggerContentSync]
  );

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      persistNotebookData(getLiveTree() || dataRef.current);
      if (hasPendingOps()) {
        e.preventDefault();
        e.returnValue = 'You have unsynced changes. Please wait for sync to finish.';
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        persistNotebookData(getLiveTree() || dataRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return {
    isAuthenticated,
    isLoadingAuth,
    userEmail,
    userName,
    driveRootFolderId,
    isSyncing,
    lastSyncTime,
    hasUnsyncedChanges,
    hasInitialLoadCompleted,
    markInitialLoadComplete,
    handleSignIn,
    handleSignOut,
    loadFromDrive,
    triggerStructureSync,
    triggerContentSync,
    syncRenameToDrive,
    queueDriveDelete,
    moveItemInDrive,
  };
}
