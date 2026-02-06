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

// Migration Script to UID System
// Migrates existing Drive folder structure to new UID-based flat structure

import * as GoogleAPI from './google-api';

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID() if available, otherwise falls back to manual generation
 */
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for older browsers or insecure contexts
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * Determine node type based on depth, mimeType, and parent type
 * @param {Object} item - Drive file/folder item
 * @param {number} depth - Depth from root folder (1 = direct child of root)
 * @param {string|null} parentType - Type of parent node ('notebook', 'tab', or null)
 * @returns {string|null} - Node type: 'notebook', 'tab', 'page', or null if not a Strata item
 */
const determineNodeType = (item, depth, parentType) => {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    const isJsonFile = item.mimeType === 'application/json' || item.name.endsWith('.json');
    
    // Depth 1 (direct child of root): notebooks (folders only)
    if (depth === 1 && isFolder) {
        return 'notebook';
    }
    
    // Depth 2 (child of notebook): tabs (folders only)
    if (depth === 2 && isFolder && parentType === 'notebook') {
        return 'tab';
    }
    
    // Depth 3 (child of tab): pages (JSON files only)
    if (depth === 3 && isJsonFile && parentType === 'tab') {
        return 'page';
    }
    
    // Not a recognized Strata item
    return null;
};

/**
 * Recursively scan folder structure and build nodes map
 * @param {string} folderId - Current folder ID to scan
 * @param {number} depth - Current depth from root (0 = root folder itself, 1 = root's children)
 * @param {string|null} parentUid - UID of parent node (null for root)
 * @param {string|null} parentType - Type of parent node
 * @param {Object} nodes - Accumulated nodes map (uid -> node data)
 * @param {Map} fileIdToUid - Map of fileId -> uid for parent lookup
 * @returns {Promise<void>}
 */
const scanRecursively = async (folderId, depth, parentUid, parentType, nodes, fileIdToUid) => {
    try {
        const items = await GoogleAPI.listFolderContents(folderId);
        
        // Items in this folder are at depth+1 relative to the folder
        const itemDepth = depth + 1;
        
        for (const item of items) {
            try {
                // Skip system files that we'll handle separately in cleanup
                const systemFiles = ['manifest.json', 'strata_index.json', 'index.html', 'strata_structure.json'];
                if (systemFiles.includes(item.name)) {
                    continue;
                }
                
                const nodeType = determineNodeType(item, itemDepth, parentType);
                
                // Only process recognized Strata items
                if (!nodeType) {
                    // Skip unrecognized items (they're not part of the Strata structure)
                    continue;
                }
                
                // Generate UUID for this item
                const uid = generateUUID();
                
                // Tag the Drive file with the UID
                await GoogleAPI.setFileUid(item.id, uid);
                
                // Get existing properties to preserve metadata
                let existingProperties = {};
                try {
                    const props = await GoogleAPI.getFileProperties(item.id);
                    if (props) {
                        existingProperties = {
                            icon: props.icon || null,
                            tabColor: props.tabColor || null,
                            pageType: props.pageType || null
                        };
                    }
                } catch (error) {
                    console.warn(`Could not get properties for ${item.name}:`, error);
                }
                
                // Create node object
                const node = {
                    uid: uid,
                    type: nodeType,
                    name: item.name,
                    parentUid: parentUid,
                    driveId: item.id,
                    appProperties: existingProperties
                };
                
                // Add to nodes map
                nodes[uid] = node;
                
                // Store mapping for parent lookup
                fileIdToUid.set(item.id, uid);
                
                console.log(`Tagged ${nodeType}: ${item.name} (${uid})`);
                
                // If it's a folder, recurse into it
                if (item.mimeType === 'application/vnd.google-apps.folder') {
                    await scanRecursively(item.id, itemDepth, uid, nodeType, nodes, fileIdToUid);
                }
                
            } catch (error) {
                console.error(`Error processing item ${item.name} (${item.id}):`, error);
                // Continue processing other items
            }
        }
    } catch (error) {
        console.error(`Error scanning folder ${folderId}:`, error);
        throw error;
    }
};

/**
 * Main migration function
 * Scans Drive structure, generates UUIDs, tags files, builds structure, and performs cleanup
 * @returns {Promise<Object>} - Migration summary with success status, counts, and IDs
 */
const migrateToUidSystem = async () => {
    const errors = [];
    let nodesCreated = 0;
    let structureFileId = null;
    let trashFolderId = null;
    
    try {
        console.log('=== Starting Migration to UID System ===');
        
        // Step 1: Get root folder
        console.log('Step 1: Getting root folder...');
        const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
        console.log(`Root folder ID: ${rootFolderId}`);
        
        // Step 2: Scan recursively
        console.log('Step 2: Scanning folder structure...');
        const nodes = {};
        const fileIdToUid = new Map();
        
        await scanRecursively(rootFolderId, 0, null, null, nodes, fileIdToUid);
        nodesCreated = Object.keys(nodes).length;
        console.log(`Found ${nodesCreated} items to migrate`);
        
        // Step 3: Build structure and save
        console.log('Step 3: Building structure and saving...');
        const structureData = {
            nodes: nodes,
            trash: []
        };
        
        structureFileId = await GoogleAPI.saveStructure(structureData);
        console.log(`Structure saved to file ID: ${structureFileId}`);
        
        // Step 4: Cleanup
        console.log('Step 4: Performing cleanup...');
        
        // Create _STRATA_TRASH folder
        try {
            const trashFolder = await GoogleAPI.createDriveFolder('_STRATA_TRASH', rootFolderId);
            trashFolderId = trashFolder.id;
            console.log(`Created trash folder: ${trashFolderId}`);
        } catch (error) {
            console.error('Error creating trash folder:', error);
            errors.push({ step: 'create_trash_folder', error: error.message });
        }
        
        // Rename manifest.json to .bak
        try {
            const rootItems = await GoogleAPI.listFolderContents(rootFolderId);
            const manifestFile = rootItems.find(item => item.name === 'manifest.json');
            if (manifestFile) {
                await GoogleAPI.renameDriveItem(manifestFile.id, 'manifest.json.bak');
                console.log('Renamed manifest.json to manifest.json.bak');
            } else {
                console.log('manifest.json not found, skipping');
            }
        } catch (error) {
            console.error('Error renaming manifest.json:', error);
            errors.push({ step: 'rename_manifest', error: error.message });
        }
        
        // Rename strata_index.json to .bak
        try {
            const rootItems = await GoogleAPI.listFolderContents(rootFolderId);
            const indexFile = rootItems.find(item => item.name === 'strata_index.json');
            if (indexFile) {
                await GoogleAPI.renameDriveItem(indexFile.id, 'strata_index.json.bak');
                console.log('Renamed strata_index.json to strata_index.json.bak');
            } else {
                console.log('strata_index.json not found, skipping');
            }
        } catch (error) {
            console.error('Error renaming strata_index.json:', error);
            errors.push({ step: 'rename_index', error: error.message });
        }
        
        console.log('=== Migration Complete ===');
        
        return {
            success: true,
            nodesCreated: nodesCreated,
            errors: errors,
            structureFileId: structureFileId,
            trashFolderId: trashFolderId
        };
        
    } catch (error) {
        console.error('Migration failed:', error);
        
        // Handle authentication errors
        if (error.status === 401 || error.message.includes('Authentication')) {
            try {
                await GoogleAPI.handleTokenExpiration();
            } catch (authError) {
                console.error('Token refresh failed:', authError);
            }
        }
        
        errors.push({ step: 'migration', error: error.message });
        
        return {
            success: false,
            nodesCreated: nodesCreated,
            errors: errors,
            structureFileId: structureFileId,
            trashFolderId: trashFolderId
        };
    }
};

// Named exports
export { migrateToUidSystem, generateUUID };

// Default export
export default { migrateToUidSystem };
