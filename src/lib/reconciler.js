/*
 * Copyright 2026 Christopher Moore
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Reconciler Module
// Handles Drive orphan cleanup by comparing Drive contents against app data

import * as GoogleAPI from './google-api';

/**
 * Extract all known Drive IDs from the app's data structure
 * @param {Object} data - The app's notebook data ({ notebooks: [...] })
 * @returns {Set<string>} - Set of all known driveFolderId and driveFileId values
 */
const collectKnownDriveIds = (data) => {
    const ids = new Set();
    if (!data?.notebooks) return ids;
    
    for (const notebook of data.notebooks) {
        if (notebook.driveFolderId) ids.add(notebook.driveFolderId);
        
        for (const tab of (notebook.tabs || [])) {
            if (tab.driveFolderId) ids.add(tab.driveFolderId);
            
            for (const page of (tab.pages || [])) {
                if (page.driveFileId) ids.add(page.driveFileId);
                if (page.driveShortcutId) ids.add(page.driveShortcutId);
                if (page.driveLinkFileId) ids.add(page.driveLinkFileId);
            }
        }
    }
    
    return ids;
};

/**
 * Get or create _STRATA_TRASH folder
 * @param {string} rootFolderId - Root folder ID
 * @returns {Promise<string>} - Trash folder ID
 */
const getTrashFolderId = async (rootFolderId) => {
    try {
        const rootItems = await GoogleAPI.listFolderContents(rootFolderId);
        const trashFolder = rootItems.find(item => item.name === '_STRATA_TRASH');
        
        if (trashFolder) {
            return trashFolder.id;
        }
        
        const newTrashFolder = await GoogleAPI.createDriveFolder('_STRATA_TRASH', rootFolderId);
        return newTrashFolder.id;
    } catch (error) {
        console.error('Error getting trash folder:', error);
        throw error;
    }
};

// Names of special files/folders in root that should not be treated as orphans
const SPECIAL_NAMES = new Set([
    '_STRATA_TRASH',
    'strata_structure.json',
    'strata_index.json',
    'manifest.json',
    'index.html'
]);

/**
 * Clean up orphan Drive items that don't match any item in the app's data
 * Runs as a background task after sign-in.
 * Compares Drive folder contents against known Drive IDs from the data.
 * 
 * @param {Object} data - The app's notebook data
 * @param {string} rootFolderId - The Strata root folder ID in Drive
 */
const cleanupOrphans = async (data, rootFolderId) => {
    try {
        console.log('=== Starting Orphan Cleanup ===');
        
        const knownIds = collectKnownDriveIds(data);
        console.log(`Known Drive IDs: ${knownIds.size}`);
        
        // List all items in the root folder
        const rootItems = await GoogleAPI.listFolderContents(rootFolderId);
        
        let orphanCount = 0;
        let trashFolderId = null;
        
        for (const item of rootItems) {
            // Skip special files and known items
            if (SPECIAL_NAMES.has(item.name)) continue;
            if (knownIds.has(item.id)) continue;
            
            // This item is in root but not in our data -- it's an orphan
            console.log(`Orphan found in root: ${item.name} (${item.id})`);
            
            // Lazily get/create trash folder only when we have orphans
            if (!trashFolderId) {
                trashFolderId = await getTrashFolderId(rootFolderId);
                // Don't trash the trash folder itself
                if (item.id === trashFolderId) continue;
            }
            if (item.id === trashFolderId) continue;
            
            try {
                await GoogleAPI.moveDriveItem(item.id, trashFolderId, rootFolderId);
                orphanCount++;
                console.log(`Moved orphan "${item.name}" to _STRATA_TRASH`);
            } catch (error) {
                console.error(`Error moving orphan ${item.id}:`, error);
            }
        }
        
        console.log(`=== Orphan Cleanup Complete: ${orphanCount} orphans moved ===`);
        
    } catch (error) {
        console.error('Error in cleanupOrphans:', error);
        // Don't throw - this is a background process
        if (error.status === 401 || error.message?.includes('Authentication')) {
            try {
                await GoogleAPI.handleTokenExpiration();
            } catch (authError) {
                console.error('Token refresh failed:', authError);
            }
        }
    }
};

// Named exports
export { cleanupOrphans, collectKnownDriveIds };

// Default export
export default { cleanupOrphans, collectKnownDriveIds };
