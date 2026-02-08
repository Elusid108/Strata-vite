import { useState, useEffect, useRef, useCallback } from 'react';
import { APP_VERSION } from '../lib/constants';
import * as GoogleAPI from '../lib/google-api';
import { generateOfflineViewerHtml } from '../lib/offline-viewer';
import { cleanupOrphans } from '../lib/reconciler';

/**
 * Hook for managing Google Drive authentication and sync
 * @param {Object} data - The notebook data
 * @param {Function} setData - Function to update notebook data
 * @param {Function} showNotification - Function to show notifications
 * @returns {Object} Auth state and sync functions
 */
export function useGoogleDrive(data, setData, showNotification) {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [userName, setUserName] = useState(null);
  
  // Drive sync state
  const [driveRootFolderId, setDriveRootFolderId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  
  // Structure version for triggering sync
  const [structureVersion, setStructureVersion] = useState(0);
  
  // Content sync version for triggering content sync retries
  const [contentSyncVersion, setContentSyncVersion] = useState(0);
  
  // Sync lock refs
  const syncLockRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const lastContentSyncRef = useRef(Date.now());
  
  // Pending Drive deletes queue
  const pendingDriveDeletesRef = useRef([]);
  
  // Pending content sync flag
  const pendingContentSyncRef = useRef(false);
  
  // Orphan cleanup -- run once per session
  const orphanCleanupDoneRef = useRef(false);

  // Initialize Google APIs and check auth status
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if GoogleAPI is available
        if (!GoogleAPI.loadGapi) {
          console.warn('Google API not loaded, using localStorage fallback');
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
        console.error('Error initializing Google auth:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    initAuth();
  }, []);

  // Handle sign in
  const handleSignIn = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      const userInfo = await GoogleAPI.signIn();
      setIsAuthenticated(true);
      setUserEmail(userInfo.email);
      setUserName(userInfo.name || userInfo.given_name || userInfo.email);
      showNotification?.('Signed in successfully', 'success');
    } catch (error) {
      console.error('Sign in error:', error);
      showNotification?.('Sign in failed', 'error');
    } finally {
      setIsLoadingAuth(false);
    }
  }, [showNotification]);

  // Handle sign out
  const handleSignOut = useCallback(() => {
    GoogleAPI.signOut();
    setIsAuthenticated(false);
    setUserEmail(null);
    setUserName(null);
    setDriveRootFolderId(null);
    showNotification?.('Signed out', 'info');
    // Reload to reset to localStorage
    window.location.reload();
  }, [showNotification]);

  // Initialize Drive root folder
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth) return;

    const initDriveSync = async () => {
      try {
        setIsSyncing(true);
        const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
        setDriveRootFolderId(rootFolderId);
        setLastSyncTime(Date.now());
      } catch (error) {
        console.error('Error initializing Drive sync:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    initDriveSync();
  }, [isAuthenticated, isLoadingAuth]);

  // Run orphan cleanup once per session after Drive is ready
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !driveRootFolderId || !data) return;
    if (orphanCleanupDoneRef.current) return;
    
    // Only run if we have some data loaded (not empty initial state)
    if (!data.notebooks || data.notebooks.length === 0) return;
    
    orphanCleanupDoneRef.current = true;
    
    // Fire-and-forget background cleanup with a delay to not interfere with initial sync
    const cleanupTimeout = setTimeout(() => {
      cleanupOrphans(data, driveRootFolderId).catch(err => {
        console.error('Background orphan cleanup failed:', err);
      });
    }, 5000);
    
    return () => clearTimeout(cleanupTimeout);
  }, [isAuthenticated, isLoadingAuth, driveRootFolderId, data]);

  // Queue a Drive item for deletion during next structure sync
  const queueDriveDelete = useCallback((driveIds) => {
    // driveIds can be a single string or array of { type, driveId } objects
    if (!driveIds) return;
    const items = Array.isArray(driveIds) ? driveIds : [driveIds];
    for (const item of items) {
      const id = typeof item === 'string' ? item : item.driveId;
      if (id) {
        pendingDriveDeletesRef.current.push(id);
      }
    }
  }, []);

  // Sync folder structure to Drive
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !driveRootFolderId || !data) return;

    const syncStructure = async () => {
      if (syncLockRef.current) {
        pendingSyncRef.current = true;
        return;
      }
      syncLockRef.current = true;
      
      try {
        setIsSyncing(true);

        // Drain pending deletes queue
        if (pendingDriveDeletesRef.current.length > 0) {
          const deletesToProcess = [...pendingDriveDeletesRef.current];
          pendingDriveDeletesRef.current = [];
          for (const driveId of deletesToProcess) {
            try {
              await GoogleAPI.deleteDriveItem(driveId);
            } catch (error) {
              console.error(`Error deleting Drive item ${driveId}:`, error);
            }
          }
        }

        const driveIdUpdates = {};

        // Sync each notebook
        for (const notebook of data.notebooks) {
          if (!notebook.driveFolderId) {
            try {
              const folderId = await GoogleAPI.getOrCreateFolder(notebook.name, driveRootFolderId);
              driveIdUpdates[notebook.id] = { driveFolderId: folderId };
            } catch (error) {
              console.error(`Error creating folder for notebook ${notebook.name}:`, error);
            }
          }

          const notebookFolderId = notebook.driveFolderId || driveIdUpdates[notebook.id]?.driveFolderId;
          if (!notebookFolderId) continue;

          // Sync tabs
          for (const tab of notebook.tabs) {
            if (!tab.driveFolderId) {
              try {
                const folderId = await GoogleAPI.getOrCreateFolder(tab.name, notebookFolderId);
                if (!driveIdUpdates[notebook.id]) driveIdUpdates[notebook.id] = { tabs: {} };
                if (!driveIdUpdates[notebook.id].tabs) driveIdUpdates[notebook.id].tabs = {};
                driveIdUpdates[notebook.id].tabs[tab.id] = { driveFolderId: folderId };
              } catch (error) {
                console.error(`Error creating folder for tab ${tab.name}:`, error);
              }
            }

            const tabFolderId = tab.driveFolderId || driveIdUpdates[notebook.id]?.tabs?.[tab.id]?.driveFolderId;
            if (!tabFolderId) continue;

            // Sync pages
            for (const page of tab.pages) {
              const pageType = page.type || 'block';
              // Google/embed pages that link to external files (not stored as JSON)
              const isGooglePage = ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'map', 'site', 'script', 'drive'].includes(pageType);
              
              // Skip pages that have an embedUrl (they're external links, not JSON content)
              if (!isGooglePage && !page.driveFileId && !page.embedUrl) {
                try {
                  const fileId = await GoogleAPI.syncPageToDrive(page, tabFolderId);
                  if (!driveIdUpdates[notebook.id]) driveIdUpdates[notebook.id] = { tabs: {} };
                  if (!driveIdUpdates[notebook.id].tabs) driveIdUpdates[notebook.id].tabs = {};
                  if (!driveIdUpdates[notebook.id].tabs[tab.id]) driveIdUpdates[notebook.id].tabs[tab.id] = { pages: {} };
                  if (!driveIdUpdates[notebook.id].tabs[tab.id].pages) driveIdUpdates[notebook.id].tabs[tab.id].pages = {};
                  driveIdUpdates[notebook.id].tabs[tab.id].pages[page.id] = { driveFileId: fileId };
                } catch (error) {
                  console.error(`Error creating file for page ${page.name}:`, error);
                }
              }
            }
          }
        }

        // Apply drive ID updates
        if (Object.keys(driveIdUpdates).length > 0) {
          setData(prev => {
            const next = { ...prev, notebooks: prev.notebooks.map(notebook => {
              const nbUpdate = driveIdUpdates[notebook.id];
              if (!nbUpdate) return notebook;
              
              return {
                ...notebook,
                driveFolderId: nbUpdate.driveFolderId || notebook.driveFolderId,
                tabs: notebook.tabs.map(tab => {
                  const tabUpdate = nbUpdate.tabs?.[tab.id];
                  if (!tabUpdate) return tab;
                  
                  return {
                    ...tab,
                    driveFolderId: tabUpdate.driveFolderId || tab.driveFolderId,
                    pages: tab.pages.map(page => {
                      const pageUpdate = tabUpdate.pages?.[page.id];
                      if (!pageUpdate) return page;
                      
                      return {
                        ...page,
                        driveFileId: pageUpdate.driveFileId || page.driveFileId,
                        driveShortcutId: pageUpdate.driveShortcutId || page.driveShortcutId,
                        driveLinkFileId: pageUpdate.driveLinkFileId || page.driveLinkFileId
                      };
                    })
                  };
                })
              };
            })};
            return next;
          });
        }
        
        // Update manifest.json and index.html
        try {
          await GoogleAPI.updateManifest(data, driveRootFolderId, APP_VERSION);
          await GoogleAPI.uploadIndexHtml(generateOfflineViewerHtml(), driveRootFolderId);
        } catch (error) {
          console.error('Error updating manifest/index.html:', error);
        }
        
        setLastSyncTime(Date.now());
      } catch (error) {
        console.error('Error syncing structure:', error);
      } finally {
        setIsSyncing(false);
        syncLockRef.current = false;
        
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false;
          setTimeout(syncStructure, 1000);
        }
        
        // If a content sync was blocked by the lock, trigger a retry
        if (pendingContentSyncRef.current) {
          pendingContentSyncRef.current = false;
          setTimeout(() => setContentSyncVersion(v => v + 1), 2000);
        }
      }
    };

    // Reduced delay for faster sync (localStorage provides immediate backup now)
    const syncTimeout = setTimeout(syncStructure, 1000);
    return () => clearTimeout(syncTimeout);
  }, [structureVersion, isAuthenticated, isLoadingAuth, driveRootFolderId, data, setData]);

  // Content sync - update page content files
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !driveRootFolderId || !data) return;
    
    const syncContent = async () => {
      if (syncLockRef.current) {
        pendingContentSyncRef.current = true;
        return;
      }
      
      for (const notebook of data.notebooks) {
        for (const tab of notebook.tabs) {
          const tabFolderId = tab.driveFolderId;
          if (!tabFolderId) continue;
          
          for (const page of tab.pages) {
            const pageType = page.type || 'block';
            // Google/embed pages that link to external files (not stored as JSON)
            const isGooglePage = ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'map', 'site', 'script', 'drive'].includes(pageType);
            
            // Only sync content for non-Google pages that have a driveFileId (JSON storage)
            if (!isGooglePage && page.driveFileId && !page.embedUrl) {
              try {
                await GoogleAPI.syncPageToDrive(page, tabFolderId);
              } catch (error) {
                console.error(`Error updating page content ${page.name}:`, error);
              }
            }
          }
        }
      }
      lastContentSyncRef.current = Date.now();
    };

    const contentSyncTimeout = setTimeout(syncContent, 10000);
    return () => clearTimeout(contentSyncTimeout);
  }, [data?.notebooks, isAuthenticated, isLoadingAuth, driveRootFolderId, contentSyncVersion]);

  // Trigger structure sync
  const triggerStructureSync = useCallback(() => {
    setStructureVersion(v => v + 1);
  }, []);

  // Load data from Drive
  const loadFromDrive = useCallback(async () => {
    if (!isAuthenticated || isLoadingAuth) return null;
    
    try {
      const cacheKey = userEmail ? `strata-cache-${userEmail}` : null;
      const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

      // Check cache first
      let cached = null;
      if (cacheKey) {
        const sessionCached = sessionStorage.getItem(cacheKey);
        const localCached = localStorage.getItem(cacheKey);
        
        if (sessionCached) {
          try { cached = JSON.parse(sessionCached); } catch (e) { /* ignore */ }
        }
        if (!cached && localCached) {
          try {
            const parsed = JSON.parse(localCached);
            const age = Date.now() - (parsed.timestamp || 0);
            if (age < CACHE_MAX_AGE_MS && parsed.data) {
              cached = parsed;
            }
          } catch (e) { /* ignore */ }
        }
      }

      // Get root folder
      const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
      setDriveRootFolderId(rootFolderId);
      
      // Load from Drive
      const driveData = await GoogleAPI.loadFromDriveStructure(rootFolderId);
      
      if (driveData && driveData.notebooks && driveData.notebooks.length > 0) {
        // Cache the data
        if (cacheKey) {
          const cacheEntry = { data: driveData, timestamp: Date.now() };
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
          } catch (e) { /* quota or disabled */ }
        }
        return driveData;
      }
      
      return cached?.data || null;
    } catch (error) {
      console.error('Error loading from Drive:', error);
      if (error.message?.includes('Authentication')) {
        showNotification?.('Authentication expired. Please sign in again.', 'error');
      }
      return null;
    }
  }, [isAuthenticated, isLoadingAuth, userEmail, showNotification]);

  // Sync rename to Drive
  const syncRenameToDrive = useCallback(async (type, id) => {
    if (!isAuthenticated || !data) return;
    
    for (const nb of data.notebooks) {
      if (type === 'notebook' && nb.id === id && nb.driveFolderId) {
        try {
          await GoogleAPI.renameDriveItem(nb.driveFolderId, GoogleAPI.sanitizeFileName(nb.name));
        } catch (err) {
          console.error('Error updating notebook folder:', err);
        }
        triggerStructureSync();
        return;
      }
      for (const tab of nb.tabs) {
        if (type === 'tab' && tab.id === id && tab.driveFolderId) {
          try {
            await GoogleAPI.renameDriveItem(tab.driveFolderId, GoogleAPI.sanitizeFileName(tab.name));
          } catch (err) {
            console.error('Error updating tab folder:', err);
          }
          triggerStructureSync();
          return;
        }
        for (const pg of tab.pages) {
          if (pg.id === id) {
            if (pg.driveFileId) {
              try {
                await GoogleAPI.renameDriveItem(pg.driveFileId, GoogleAPI.sanitizeFileName(pg.name) + '.json');
              } catch (err) {
                console.error('Error updating page file:', err);
              }
            }
            if (pg.driveShortcutId) {
              try {
                await GoogleAPI.renameDriveItem(pg.driveShortcutId, pg.name);
              } catch (err) {
                console.error('Error updating page shortcut:', err);
              }
            }
            triggerStructureSync();
            return;
          }
        }
      }
    }
  }, [isAuthenticated, data, triggerStructureSync]);

  return {
    // Auth state
    isAuthenticated,
    isLoadingAuth,
    userEmail,
    userName,
    
    // Sync state
    driveRootFolderId,
    isSyncing,
    lastSyncTime,
    
    // Actions
    handleSignIn,
    handleSignOut,
    loadFromDrive,
    triggerStructureSync,
    syncRenameToDrive,
    queueDriveDelete
  };
}
