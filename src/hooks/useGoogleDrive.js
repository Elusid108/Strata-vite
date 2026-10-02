import { useState, useEffect, useRef, useCallback } from 'react';
import { log } from '../lib/logger';
import * as GoogleAPI from '../lib/google-api';
import { reconcileData } from '../lib/reconciler';
import {
  enqueueOp,
  enqueueTrash,
  peekOp,
  recordOpFailure,
  skipOp,
  hasPendingOps,
  persistNotebookData,
  installGuestWorkspace,
  SyncNotReadyError,
  getLiveTree,
  getSyncState,
  pendingPageIds,
  tombstoneIdSet,
} from '../lib/sync-outbox';
import { processSyncOp } from '../lib/sync-engine';
import { classifyDriveError, MAX_AUTO_RETRIES } from '../lib/sync-errors';
import { findPageContext, isLinkPage } from '../lib/sync-merge';
import { applyDriveChanges, applyIndexOrder, planPageFetches } from '../lib/sync-pull';

const CONTENT_KICK_DELAY_MS = 1500; // idle time after typing before a page upload starts
const STRUCTURE_KICK_DELAY_MS = 50;
const PULL_INTERVAL_MS = 60 * 1000;
const TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;
const CHANGES_TOKEN_KEY = 'strata_changes_token';

function pageHasStrataFile(page) {
  if (!page) return false;
  if (isLinkPage(page)) return !!page.driveLinkFileId;
  return !!page.driveFileId;
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function errorStatus(error) {
  return classifyDriveError(error).status;
}

function isAuthError(error) {
  return classifyDriveError(error).kind === 'auth';
}

const SKIPPED_HISTORY_LIMIT = 10;

function enqueueMissingParent(op, data) {
  if (!op || !data) return;
  if (op.type === 'ensureFolder' && op.entityType === 'tab' && op.notebookId) {
    const notebook = (data.notebooks || []).find((nb) => nb.id === op.notebookId);
    if (notebook && !notebook.driveFolderId) {
      enqueueOp(
        { type: 'ensureFolder', entityType: 'notebook', appId: notebook.id },
        `folder:${notebook.id}`
      );
    }
    return;
  }
  if (op.type !== 'ensurePageFile' && op.type !== 'patchPage') return;
  const found = findPageContext(data, op.pageId);
  if (!found) return;
  const { notebook, tab, page } = found;
  if (!notebook.driveFolderId) {
    enqueueOp(
      { type: 'ensureFolder', entityType: 'notebook', appId: notebook.id },
      `folder:${notebook.id}`
    );
    return;
  }
  if (!tab.driveFolderId) {
    enqueueOp(
      { type: 'ensureFolder', entityType: 'tab', appId: tab.id, notebookId: notebook.id },
      `folder:${tab.id}`
    );
    return;
  }
  if (op.type === 'patchPage' && !pageHasStrataFile(page)) {
    enqueueOp(
      { type: 'ensurePageFile', pageId: page.id, tabId: tab.id, notebookId: notebook.id },
      `page:${page.id}`
    );
  }
}

/**
 * Hook for managing Google Drive authentication, the serial outbox (push) and
 * the changes-feed pull loop.
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
  const [syncStatus, setSyncStatus] = useState({
    phase: 'idle',
    currentOp: null,
    completed: 0,
    remaining: 0,
    queue: [],
    error: null,
    skipped: [],
    lastSyncTime: null,
    lastPullTime: null,
  });

  const workerLockRef = useRef(false);
  const pullLockRef = useRef(false);
  const backoffRef = useRef(1000);
  const kickTimerRef = useRef(null); // debounce before a normal worker run
  const retryTimerRef = useRef(null); // backoff before re-attempting a failed head op
  const blockedRef = useRef(false); // head op needs the user (Retry now / Skip)
  const skippedRef = useRef([]); // recent ops dropped without a Drive ACK, newest first
  const pendingKickRef = useRef(false);
  const pendingPullRef = useRef(false);
  const completedRef = useRef(0);
  const signInRequiredRef = useRef(false);
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const rootFolderRef = useRef(driveRootFolderId);
  useEffect(() => {
    rootFolderRef.current = driveRootFolderId;
  }, [driveRootFolderId]);

  const readyRef = useRef(false);
  readyRef.current = isAuthenticated && !isLoadingAuth && !!driveRootFolderId && hasInitialLoadCompleted;

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

  const publishSyncStatus = useCallback((partial = {}) => {
    const ops = getSyncState().ops;
    setSyncStatus((prev) => ({
      ...prev,
      ...partial,
      remaining: ops.length,
      currentOp: ops[0] || null,
      queue: ops.slice(0, 20),
      skipped: skippedRef.current,
    }));
  }, []);

  const rememberSkipped = useCallback(({ op, reason, message }) => {
    const entry = { ...op, skipReason: reason, skipMessage: message || null, skippedAt: Date.now() };
    skippedRef.current = [entry, ...skippedRef.current.filter((e) => e.id !== op.id)].slice(0, SKIPPED_HISTORY_LIMIT);
  }, []);

  // ------------------------------------------------------------------
  // Pull: Drive changes feed -> local tree
  // ------------------------------------------------------------------
  const changesTokenKey = useCallback(() => `${CHANGES_TOKEN_KEY}:${rootFolderRef.current || 'none'}`, []);

  const ensureChangesToken = useCallback(async () => {
    const key = changesTokenKey();
    if (localStorage.getItem(key)) return;
    const token = await GoogleAPI.getStartPageToken();
    localStorage.setItem(key, token);
  }, [changesTokenKey]);

  const runWorkerRef = useRef(null);

  const pullFromDrive = useCallback(async ({ reason = 'manual' } = {}) => {
    if (!readyRef.current || !isOnline() || signInRequiredRef.current) return;
    if (workerLockRef.current) {
      pendingPullRef.current = true;
      return;
    }
    if (pullLockRef.current) return;
    pullLockRef.current = true;
    const rootFolderId = rootFolderRef.current;
    try {
      const key = changesTokenKey();
      const token = localStorage.getItem(key);
      if (!token) {
        await ensureChangesToken();
        return;
      }
      const { changes, newPageToken } = await GoogleAPI.getDriveChanges(token, rootFolderId);
      log('SYNC', 'pull', { reason, changes: changes.length });
      const tombstoneIds = tombstoneIdSet();
      const pending = pendingPageIds();

      if (changes.length > 0) {
        const fileIds = planPageFetches(dataRef.current, changes, rootFolderId, { tombstoneIds });
        const contents = new Map();
        const BATCH = 8;
        for (let i = 0; i < fileIds.length; i += BATCH) {
          const batch = fileIds.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(async (id) => {
              try {
                return [id, await GoogleAPI.getFileContent(id)];
              } catch (error) {
                log('SYNC', 'pull: could not fetch page', { id, error: error?.message });
                return [id, null];
              }
            })
          );
          for (const [id, json] of results) if (json) contents.set(id, json);
        }

        const result = applyDriveChanges(dataRef.current, changes, rootFolderId, { contents, pendingPageIds: pending, tombstoneIds });
        let nextTree = result.data;
        if (result.indexChanged) {
          try {
            const indexData = await GoogleAPI.getIndexFile(rootFolderId);
            if (indexData) nextTree = applyIndexOrder(nextTree, indexData);
          } catch (error) {
            log('SYNC', 'pull: index fetch failed', error?.message);
          }
        }
        if (result.changed || result.indexChanged) {
          setDataAndRef(() => nextTree);
        }
        for (const pageId of result.reupload) {
          const found = findPageContext(nextTree, pageId);
          if (found) enqueueOp({ type: 'patchPage', pageId }, `patch:${pageId}`);
        }
        for (const copyId of result.conflictCopies) {
          const found = findPageContext(nextTree, copyId);
          if (found) {
            enqueueOp(
              { type: 'ensurePageFile', pageId: copyId, tabId: found.tab.id, notebookId: found.notebook.id },
              `page:${copyId}`
            );
          }
        }
        if (result.conflictCopies.length) {
          showNotificationRef.current?.('A page changed on another device; the other version was saved as a conflict copy.', 'info');
        } else if (result.reupload.length) {
          showNotificationRef.current?.('Merged changes from another device.', 'info');
        }
        if (result.reupload.length || result.conflictCopies.length) {
          refreshUnsynced();
        }
      }
      localStorage.setItem(key, newPageToken);
      setSyncStatus((prev) => ({ ...prev, lastPullTime: Date.now() }));
    } catch (error) {
      log('ERROR', 'pull failed', error);
      if (isAuthError(error)) {
        const ok = await GoogleAPI.refreshAccessToken();
        if (!ok) {
          signInRequiredRef.current = true;
          publishSyncStatus({ phase: 'signin-required', error: { message: 'Your Google session expired. Sign in again to keep syncing.', status: 401, retryAt: null } });
        }
      }
    } finally {
      pullLockRef.current = false;
      // Anything the pull queued (re-uploads, conflict copies) goes out now.
      if (hasPendingOps() && !workerLockRef.current) runWorkerRef.current?.();
    }
  }, [changesTokenKey, ensureChangesToken, setDataAndRef, publishSyncStatus, refreshUnsynced]);

  const pullRef = useRef(pullFromDrive);
  pullRef.current = pullFromDrive;

  // ------------------------------------------------------------------
  // Push: serial outbox worker
  // ------------------------------------------------------------------
  const runWorker = useCallback(async ({ force = false } = {}) => {
    // While a backoff timer is pending or the head op is blocked, resumption
    // belongs to the timer, Retry now, Skip, sign-in or coming back online.
    // Ordinary kicks (edits, pulls, tab hide) must not bypass the backoff.
    if (!force && (retryTimerRef.current || blockedRef.current)) return;
    if (workerLockRef.current || pullLockRef.current) {
      pendingKickRef.current = true;
      return;
    }
    if (!readyRef.current) return;
    if (signInRequiredRef.current) {
      publishSyncStatus({ phase: 'signin-required' });
      return;
    }
    if (!isOnline()) {
      publishSyncStatus({ phase: 'offline', error: null });
      return;
    }

    workerLockRef.current = true;
    setIsSyncing(true);
    publishSyncStatus({ phase: 'syncing', completed: completedRef.current, error: null });
    let paused = false;
    let runSkipped = 0;
    try {
      while (true) {
        const op = peekOp();
        if (!op) {
          backoffRef.current = 1000;
          const syncedAt = Date.now();
          setLastSyncTime(syncedAt);
          publishSyncStatus({
            phase: 'idle',
            completed: completedRef.current,
            error: null,
            lastSyncTime: syncedAt,
          });
          completedRef.current = 0;
          break;
        }
        if (!isOnline()) {
          publishSyncStatus({ phase: 'offline', completed: completedRef.current, error: null });
          break;
        }
        publishSyncStatus({ phase: 'syncing', completed: completedRef.current, error: null });
        try {
          const result = await processSyncOp(op, {
            dataRef,
            setDataAndRef,
            rootFolderId: rootFolderRef.current,
            notify: (message, type) => showNotificationRef.current?.(message, type),
          });
          if (result?.skipped) {
            rememberSkipped(result.skipped);
            runSkipped += 1;
            publishSyncStatus({ phase: 'syncing', completed: completedRef.current, error: null });
            continue;
          }
          completedRef.current += 1;
          backoffRef.current = 1000;
          publishSyncStatus({ phase: 'syncing', completed: completedRef.current, error: null });
        } catch (error) {
          if (error instanceof SyncNotReadyError || error?.code === 'NOT_READY') {
            log('SYNC', 'op not ready, retrying', { type: op.type, message: error.message });
            enqueueMissingParent(op, dataRef.current);
            publishSyncStatus({
              phase: 'waiting',
              completed: completedRef.current,
              error: { message: error.message || 'Waiting for Drive…', status: null, retryAt: null },
            });
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }

          // The head op may have been skipped or coalesced while the call was in flight.
          if (peekOp()?.id !== op.id) continue;

          const classified = classifyDriveError(error);

          if (classified.kind === 'auth') {
            log('SYNC', 'auth error, refreshing token');
            const ok = await GoogleAPI.refreshAccessToken();
            if (ok) continue; // same op, fresh token
            signInRequiredRef.current = true;
            publishSyncStatus({
              phase: 'signin-required',
              completed: completedRef.current,
              error: { message: 'Your Google session expired. Sign in again to keep syncing.', status: 401, retryAt: null },
            });
            break;
          }

          if (!isOnline() || classified.kind === 'network') {
            log('SYNC', 'network unavailable, pausing sync');
            publishSyncStatus({ phase: 'offline', completed: completedRef.current, error: null });
            break;
          }

          log('ERROR', 'sync op failed', error);
          const failed = recordOpFailure(op.id, classified);
          const attempts = failed?.attempts || 1;
          const errorInfo = {
            message: classified.message,
            status: classified.status,
            reason: classified.kind,
            driveReason: classified.reason,
            attempts,
            opId: op.id,
            retryAt: null,
          };

          // Permission and quota failures cannot be fixed by retrying, and a
          // generic error that keeps failing should stop hammering Drive: hand
          // the decision to the user (Retry now / Skip this change).
          const exhausted = classified.kind === 'other' && attempts >= MAX_AUTO_RETRIES;
          if (classified.kind === 'permission' || classified.kind === 'quota' || exhausted) {
            blockedRef.current = true;
            paused = true;
            publishSyncStatus({ phase: 'blocked', completed: completedRef.current, error: errorInfo });
            return;
          }

          const delay = classified.kind === 'rate-limit' ? Math.max(backoffRef.current, 5000) : backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
          paused = true;
          publishSyncStatus({
            phase: 'retrying',
            completed: completedRef.current,
            error: { ...errorInfo, retryAt: Date.now() + delay },
          });
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            runWorkerRef.current?.({ force: true });
          }, delay);
          return;
        }
      }
    } finally {
      // The lock is always released: during backoff or while blocked the pull
      // loop keeps running and a tab hide can no longer strand the worker.
      workerLockRef.current = false;
      setIsSyncing(false);
      refreshUnsynced();
      if (runSkipped > 0) {
        showNotificationRef.current?.(
          `Drive refused ${runSkipped} change${runSkipped === 1 ? '' : 's'}, so ${runSkipped === 1 ? 'it was' : 'they were'} skipped. Open sync status for details.`,
          'info'
        );
      }
      if (!paused) {
        if (pendingKickRef.current) {
          pendingKickRef.current = false;
          runWorkerRef.current?.();
        } else if (pendingPullRef.current) {
          pendingPullRef.current = false;
          pullRef.current?.({ reason: 'deferred' });
        }
      } else {
        // The retry timer or the user's action drains the whole queue, so a
        // kick that arrived mid-run has nothing extra to do. Pulls are safe now.
        pendingKickRef.current = false;
        if (pendingPullRef.current) {
          pendingPullRef.current = false;
          pullRef.current?.({ reason: 'deferred' });
        }
      }
    }
  }, [setDataAndRef, refreshUnsynced, publishSyncStatus, rememberSkipped]);
  runWorkerRef.current = runWorker;

  /**
   * Schedule the worker. Content edits wait for typing to settle; structural
   * changes go out almost immediately.
   */
  const kickWorker = useCallback((delay = STRUCTURE_KICK_DELAY_MS) => {
    refreshUnsynced();
    if (workerLockRef.current) {
      pendingKickRef.current = true;
      return;
    }
    if (kickTimerRef.current) {
      clearTimeout(kickTimerRef.current);
      kickTimerRef.current = null;
    }
    kickTimerRef.current = setTimeout(() => {
      kickTimerRef.current = null;
      runWorkerRef.current?.();
    }, delay);
  }, [refreshUnsynced]);

  // Only the debounce timer is cancelled here, never the retry backoff timer.
  const flushNow = useCallback(() => {
    if (kickTimerRef.current) {
      clearTimeout(kickTimerRef.current);
      kickTimerRef.current = null;
    }
    if (hasPendingOps()) runWorkerRef.current?.();
  }, []);

  useEffect(() => {
    return () => {
      if (kickTimerRef.current) clearTimeout(kickTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Forget any backoff or block so the next run attempts the head op at once.
  const resetBackoff = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    backoffRef.current = 1000;
    blockedRef.current = false;
  }, []);

  /** User pressed "Retry now" in the sync panel. */
  const retryNow = useCallback(() => {
    resetBackoff();
    publishSyncStatus({ error: null });
    runWorkerRef.current?.({ force: true });
  }, [resetBackoff, publishSyncStatus]);

  /**
   * User pressed "Skip this change": drop the head op without a Drive ACK and
   * carry on with the rest of the queue. Only possible while the worker is
   * paused (retrying or blocked), never mid-call.
   */
  const skipCurrentOp = useCallback(() => {
    if (workerLockRef.current) return false;
    const head = peekOp();
    if (!head) return false;
    const removed = skipOp(head.id);
    if (!removed) return false;
    log('SYNC', 'op skipped by user', { type: removed.type, id: removed.id, driveId: removed.driveId });
    rememberSkipped({ op: removed, reason: 'manual', message: removed.lastError?.message || null });
    resetBackoff();
    refreshUnsynced();
    publishSyncStatus({ phase: hasPendingOps() ? 'syncing' : 'idle', error: null });
    runWorkerRef.current?.({ force: true });
    return true;
  }, [resetBackoff, refreshUnsynced, publishSyncStatus, rememberSkipped]);

  const dismissSkipped = useCallback((opId) => {
    skippedRef.current = opId ? skippedRef.current.filter((e) => e.id !== opId) : [];
    publishSyncStatus({});
  }, [publishSyncStatus]);

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
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
      signInRequiredRef.current = false;
      setIsAuthenticated(true);
      setUserEmail(userInfo.email);
      setUserName(userInfo.name || userInfo.given_name || userInfo.email);
      showNotification?.('Signed in successfully', 'success');
      resetBackoff();
      publishSyncStatus({ phase: 'idle', error: null });
      kickWorker();
    } catch (error) {
      log('ERROR', 'Sign in error:', error);
      showNotification?.('Sign in failed', 'error');
    } finally {
      setIsLoadingAuth(false);
    }
  }, [showNotification, publishSyncStatus, kickWorker, resetBackoff]);

  const handleSignOut = useCallback(() => {
    log('SYNC', 'handleSignOut: installing guest sandbox');
    installGuestWorkspace({ lockPersist: true });
    GoogleAPI.signOut();
    setIsAuthenticated(false);
    setUserEmail(null);
    setUserName(null);
    setDriveRootFolderId(null);
    showNotification?.('Signed out', 'info');
    window.location.reload();
  }, [showNotification]);

  // Proactively refresh the access token while the tab is visible, so the
  // worker rarely meets a 401 at all.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || !isOnline()) return;
      const expiry = GoogleAPI.getTokenExpiry();
      if (!expiry || expiry - Date.now() > TOKEN_REFRESH_AHEAD_MS) return;
      const ok = await GoogleAPI.refreshAccessToken();
      if (ok) {
        if (signInRequiredRef.current) {
          signInRequiredRef.current = false;
          publishSyncStatus({ phase: 'idle', error: null });
          kickWorker();
        }
      } else if (Date.now() > expiry) {
        signInRequiredRef.current = true;
        publishSyncStatus({ phase: 'signin-required', error: { message: 'Your Google session expired. Sign in again to keep syncing.', status: 401, retryAt: null } });
      }
    };
    const id = setInterval(tick, 60 * 1000);
    tick();
    return () => clearInterval(id);
  }, [isAuthenticated, publishSyncStatus, kickWorker]);

  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth) return;

    const initDriveSync = async () => {
      try {
        setIsSyncing(true);
        publishSyncStatus({ phase: 'connecting', error: null });
        const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
        setDriveRootFolderId(rootFolderId);
        const syncedAt = Date.now();
        setLastSyncTime(syncedAt);
        publishSyncStatus({ phase: 'idle', lastSyncTime: syncedAt });
      } catch (error) {
        log('ERROR', 'Error initializing Drive sync:', error);
        publishSyncStatus({
          phase: isOnline() ? 'idle' : 'offline',
          error: { message: GoogleAPI.getDriveErrorMessage(error) || 'Could not connect to Drive', status: errorStatus(error), retryAt: null },
        });
      } finally {
        setIsSyncing(false);
      }
    };

    initDriveSync();
  }, [isAuthenticated, isLoadingAuth, publishSyncStatus]);

  // ------------------------------------------------------------------
  // Enqueue helpers used by the app
  // ------------------------------------------------------------------
  const persistSnapshot = useCallback((tree) => {
    const snapshot = tree || getLiveTree() || dataRef.current;
    if (!snapshot) return null;
    persistNotebookData(snapshot);
    dataRef.current = snapshot;
    return snapshot;
  }, []);

  const enqueueStructureFromTree = useCallback((tree) => {
    const notebooks = tree?.notebooks || [];
    for (const notebook of notebooks) {
      if (!notebook.driveFolderId) {
        enqueueOp(
          { type: 'ensureFolder', entityType: 'notebook', appId: notebook.id },
          `folder:${notebook.id}`
        );
      }
      for (const tab of notebook.tabs || []) {
        if (!tab.driveFolderId) {
          enqueueOp(
            { type: 'ensureFolder', entityType: 'tab', appId: tab.id, notebookId: notebook.id },
            `folder:${tab.id}`
          );
        }
        for (const page of tab.pages || []) {
          if (pageHasStrataFile(page)) continue;
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

  // Pull loop: after boot, on focus/visibility/online, and on an interval while visible.
  useEffect(() => {
    if (!(hasInitialLoadCompleted && isAuthenticated && driveRootFolderId)) return undefined;
    const pull = (reason) => pullRef.current?.({ reason });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') pull('visible');
      else {
        persistNotebookData(getLiveTree() || dataRef.current);
        flushNow();
      }
    };
    const onOnline = () => {
      resetBackoff();
      publishSyncStatus({ phase: 'idle', error: null });
      kickWorker();
      pull('online');
    };
    const onOffline = () => publishSyncStatus({ phase: 'offline', error: null });
    const onFocus = () => pull('focus');
    const onPageHide = () => {
      persistNotebookData(getLiveTree() || dataRef.current);
      flushNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') pull('interval');
    }, PULL_INTERVAL_MS);
    const initial = setTimeout(() => pull('boot'), 2000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(interval);
      clearTimeout(initial);
    };
  }, [hasInitialLoadCompleted, isAuthenticated, driveRootFolderId, kickWorker, flushNow, publishSyncStatus, resetBackoff]);

  const triggerStructureSync = useCallback((tree) => {
    const snapshot = persistSnapshot(tree);
    enqueueStructureFromTree(snapshot);
    kickWorker();
  }, [persistSnapshot, enqueueStructureFromTree, kickWorker]);

  const triggerContentSync = useCallback(
    (pageId, tree) => {
      persistSnapshot(tree);
      if (pageId) {
        enqueueOp({ type: 'patchPage', pageId }, `patch:${pageId}`);
      }
      kickWorker(CONTENT_KICK_DELAY_MS);
    },
    [persistSnapshot, kickWorker]
  );

  const queueDriveDelete = useCallback(
    (driveIds, tree) => {
      persistSnapshot(tree);
      enqueueTrash(driveIds);
      enqueueOp({ type: 'saveIndex' }, 'saveIndex');
      kickWorker();
    },
    [persistSnapshot, kickWorker]
  );

  const moveItemInDrive = useCallback(
    (itemId, newParentId, oldParentId, tree) => {
      if (!itemId || !newParentId || !oldParentId) return;
      persistSnapshot(tree);
      enqueueOp(
        { type: 'move', driveId: itemId, newParentId, oldParentId },
        `move:${itemId}`
      );
      enqueueOp({ type: 'saveIndex' }, 'saveIndex');
      kickWorker();
    },
    [persistSnapshot, kickWorker]
  );

  const syncSubtree = useCallback(
    (tree, { notebookId, tabId, pageId } = {}) => {
      const snapshot = persistSnapshot(tree);
      const notebook = (snapshot?.notebooks || []).find((nb) => nb.id === notebookId);
      if (notebook && !notebook.driveFolderId) {
        enqueueOp(
          { type: 'ensureFolder', entityType: 'notebook', appId: notebook.id },
          `folder:${notebook.id}`
        );
      }
      const tab = notebook?.tabs?.find((t) => t.id === tabId);
      if (tab && !tab.driveFolderId) {
        enqueueOp(
          { type: 'ensureFolder', entityType: 'tab', appId: tab.id, notebookId: notebook.id },
          `folder:${tab.id}`
        );
      }
      const page = tab?.pages?.find((p) => p.id === pageId);
      if (page && !pageHasStrataFile(page)) {
        enqueueOp(
          { type: 'ensurePageFile', pageId: page.id, tabId: tab.id, notebookId: notebook.id },
          `page:${page.id}`
        );
      }
      enqueueOp({ type: 'saveIndex' }, 'saveIndex');
      kickWorker();
    },
    [persistSnapshot, kickWorker]
  );

  const syncFolderMeta = useCallback(
    (tree, { entityType, appId, notebookId } = {}) => {
      persistSnapshot(tree);
      if (!appId || !entityType) return;
      enqueueOp(
        { type: 'ensureFolder', entityType, appId, notebookId },
        `folder:${appId}`
      );
      kickWorker();
    },
    [persistSnapshot, kickWorker]
  );

  const syncPageFile = useCallback(
    (tree, pageId) => {
      const snapshot = persistSnapshot(tree);
      if (!pageId) return;
      const found = findPageContext(snapshot, pageId);
      enqueueOp(
        {
          type: 'ensurePageFile',
          pageId,
          tabId: found?.tab?.id,
          notebookId: found?.notebook?.id,
        },
        `page:${pageId}`
      );
      kickWorker();
    },
    [persistSnapshot, kickWorker]
  );

  const persistTree = useCallback(
    (tree) => {
      persistSnapshot(tree);
    },
    [persistSnapshot]
  );

  const syncIndex = useCallback(
    (tree) => {
      persistSnapshot(tree);
      enqueueOp({ type: 'saveIndex' }, 'saveIndex');
      kickWorker();
    },
    [persistSnapshot, kickWorker]
  );

  const loadFromDrive = useCallback(async () => {
    if (!isAuthenticated || isLoadingAuth) return null;

    try {
      const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
      rootFolderRef.current = rootFolderId;
      log('SYNC', 'loadFromDrive: root folder', { rootFolderId });

      // Take the changes cursor BEFORE listing so nothing written between the
      // listing and the first pull can be missed.
      try {
        await ensureChangesToken();
      } catch (error) {
        log('SYNC', 'loadFromDrive: could not get changes token', error?.message);
      }

      // Pages already held locally at the same Drive modifiedTime are reused
      // instead of downloaded again.
      const knownPages = new Map();
      for (const nb of dataRef.current?.notebooks || []) {
        for (const tab of nb.tabs || []) {
          for (const page of tab.pages || []) {
            const fileId = isLinkPage(page) ? page.driveLinkFileId : page.driveFileId;
            if (fileId && page.driveModifiedTime) knownPages.set(fileId, page);
          }
        }
      }

      const driveData = await GoogleAPI.loadFromDriveStructure(rootFolderId, { knownPages });

      if (driveData && driveData.notebooks) {
        log('SYNC', 'loadFromDrive: loaded from Drive', { notebookCount: driveData.notebooks.length });
        const reconciled = { ...reconcileData(driveData), complete: driveData.complete !== false };
        setDriveRootFolderId(rootFolderId);
        return reconciled;
      }

      log('SYNC', 'loadFromDrive: Drive empty or failed');
      setDriveRootFolderId(rootFolderId);
      return null;
    } catch (error) {
      log('ERROR', 'Error loading from Drive:', error);
      if (isAuthError(error)) {
        showNotification?.('Authentication expired. Please sign in again.', 'error');
      }
      throw error;
    }
  }, [isAuthenticated, isLoadingAuth, showNotification, ensureChangesToken]);

  const markInitialLoadComplete = useCallback(() => {
    setHasInitialLoadCompleted(true);
  }, []);

  const beginAuthenticatedLoad = useCallback(() => {
    bootEnqueuedRef.current = false;
    setHasInitialLoadCompleted(false);
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
          enqueueOp({ type: 'saveIndex' }, 'saveIndex');
          kickWorker();
          return;
        }
        for (const tab of nb.tabs || []) {
          if (type === 'tab' && tab.id === id && tab.driveFolderId) {
            enqueueOp(
              { type: 'rename', driveId: tab.driveFolderId, name: GoogleAPI.sanitizeFileName(tab.name) },
              `rename:${tab.driveFolderId}`
            );
            enqueueOp({ type: 'saveIndex' }, 'saveIndex');
            kickWorker();
            return;
          }
          for (const pg of tab.pages || []) {
            if (pg.id === id) {
              // The page JSON write already carries the new file name; no separate rename op.
              triggerContentSync(id, currentData);
              return;
            }
          }
        }
      }
    },
    [kickWorker, triggerContentSync]
  );

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      persistNotebookData(getLiveTree() || dataRef.current);
      // Only warn when signed in: guest edits live in localStorage and are not "unsynced".
      if (readyRef.current && hasPendingOps()) {
        flushNow();
        e.preventDefault();
        e.returnValue = 'You have unsynced changes. Please wait for sync to finish.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flushNow]);

  return {
    isAuthenticated,
    isLoadingAuth,
    userEmail,
    userName,
    driveRootFolderId,
    isSyncing,
    lastSyncTime,
    hasUnsyncedChanges,
    syncStatus,
    hasInitialLoadCompleted,
    markInitialLoadComplete,
    beginAuthenticatedLoad,
    handleSignIn,
    handleSignOut,
    retryNow,
    skipCurrentOp,
    dismissSkipped,
    loadFromDrive,
    pullFromDrive,
    triggerStructureSync,
    triggerContentSync,
    syncSubtree,
    syncFolderMeta,
    syncPageFile,
    persistTree,
    syncIndex,
    syncRenameToDrive,
    queueDriveDelete,
    moveItemInDrive,
  };
}
