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
// Handles remote-first boot logic and structure reconciliation

import * as GoogleAPI from './google-api';

/**
 * Load app structure from Drive
 * Downloads strata_structure.json and updates React state directly
 * @param {Function} setNodes - React state setter for nodes map
 * @param {Function} setTrash - React state setter for trash array
 * @returns {Promise<Object>} - The loaded structure object
 */
const loadApp = async (setNodes, setTrash) => {
    try {
        // Download strata_structure.json from Drive
        const structure = await GoogleAPI.loadStructure();
        
        // Extract nodes and trash from structure
        const nodes = structure.nodes || {};
        const trash = structure.trash || [];
        
        // Update React state directly
        setNodes(nodes);
        setTrash(trash);
        
        console.log(`Loaded ${Object.keys(nodes).length} nodes and ${trash.length} trash items`);
        
        return structure;
    } catch (error) {
        console.error('Error loading app structure:', error);
        // Propagate error - no fallback to scanning folders
        throw error;
    }
};

/**
 * Build parent chain map: uid -> expected parent folder ID
 * @param {Object} nodes - Nodes map (uid -> node)
 * @param {string} rootFolderId - Root folder ID
 * @returns {Map} - Map of uid -> expected parent folder ID
 */
const buildParentChainMap = (nodes, rootFolderId) => {
    const parentMap = new Map();
    
    for (const [uid, node] of Object.entries(nodes)) {
        if (node.parentUid === null) {
            // Root-level notebooks have root folder as parent
            parentMap.set(uid, rootFolderId);
        } else {
            // Find parent node and use its driveId as the expected parent folder
            const parentNode = nodes[node.parentUid];
            if (parentNode && parentNode.driveId) {
                parentMap.set(uid, parentNode.driveId);
            } else {
                // Parent not found, fallback to root
                console.warn(`Parent node ${node.parentUid} not found for ${uid}, using root folder`);
                parentMap.set(uid, rootFolderId);
            }
        }
    }
    
    return parentMap;
};

/**
 * Get or create _STRATA_TRASH folder
 * @param {string} rootFolderId - Root folder ID
 * @returns {Promise<string>} - Trash folder ID
 */
const getTrashFolderId = async (rootFolderId) => {
    try {
        // Search for existing trash folder
        const rootItems = await GoogleAPI.listFolderContents(rootFolderId);
        const trashFolder = rootItems.find(item => item.name === '_STRATA_TRASH');
        
        if (trashFolder) {
            return trashFolder.id;
        }
        
        // Create trash folder if it doesn't exist
        const newTrashFolder = await GoogleAPI.createDriveFolder('_STRATA_TRASH', rootFolderId);
        return newTrashFolder.id;
    } catch (error) {
        console.error('Error getting trash folder:', error);
        throw error;
    }
};

/**
 * Verify reality: reconcile Drive state with structure
 * Runs in background to enforce structure and handle orphans
 * @param {Object} nodes - Current nodes map
 * @param {Function} setNodes - React state setter for nodes
 * @param {Function} getRootFolderId - Function that returns root folder ID
 */
const verifyReality = async (nodes, setNodes, getRootFolderId) => {
    try {
        console.log('=== Starting Reality Verification ===');
        
        const rootFolderId = await getRootFolderId();
        
        // Step 1: Get all files with strataUID
        console.log('Step 1: Getting all files with strataUID...');
        const allFiles = await GoogleAPI.getAllFilesWithUid();
        console.log(`Found ${allFiles.length} files with strataUID`);
        
        // Build map of uid -> file for quick lookup
        const fileMap = new Map();
        for (const file of allFiles) {
            const uid = file.appProperties?.strataUID;
            if (uid) {
                fileMap.set(uid, file);
            }
        }
        
        // Step 2: Build parent chain map
        console.log('Step 2: Building parent chain map...');
        const parentMap = buildParentChainMap(nodes, rootFolderId);
        
        // Step 3: Enforce structure
        console.log('Step 3: Enforcing structure...');
        let movedCount = 0;
        let missingCount = 0;
        const updatedNodes = { ...nodes };
        
        for (const [uid, node] of Object.entries(nodes)) {
            const file = fileMap.get(uid);
            const expectedParentId = parentMap.get(uid);
            
            if (!file) {
                // File missing in Drive - mark as missing
                console.log(`File missing for node ${uid} (${node.name})`);
                updatedNodes[uid] = {
                    ...node,
                    appProperties: {
                        ...node.appProperties,
                        missing: true
                    }
                };
                missingCount++;
            } else {
                // File exists - check if it's in the right location
                const currentParentId = file.parents && file.parents.length > 0 ? file.parents[0] : null;
                
                if (currentParentId !== expectedParentId) {
                    // File is in wrong location - move it
                    console.log(`Moving ${node.name} (${uid}) from ${currentParentId} to ${expectedParentId}`);
                    try {
                        await GoogleAPI.moveDriveItem(file.id, expectedParentId, currentParentId);
                        movedCount++;
                    } catch (error) {
                        console.error(`Error moving file ${file.id}:`, error);
                    }
                }
                
                // Clear missing flag if it was set
                if (node.appProperties?.missing) {
                    updatedNodes[uid] = {
                        ...node,
                        appProperties: {
                            ...node.appProperties,
                            missing: false
                        }
                    };
                }
            }
        }
        
        // Update state if there were changes
        if (missingCount > 0 || movedCount > 0) {
            setNodes(updatedNodes);
        }
        
        // Step 4: Handle orphans
        console.log('Step 4: Handling orphan files...');
        const structureUids = new Set(Object.keys(nodes));
        let orphanCount = 0;
        
        const trashFolderId = await getTrashFolderId(rootFolderId);
        
        for (const file of allFiles) {
            const uid = file.appProperties?.strataUID;
            if (uid && !structureUids.has(uid)) {
                // Orphan file - not in structure
                console.log(`Orphan file found: ${file.name} (${uid})`);
                const currentParentId = file.parents && file.parents.length > 0 ? file.parents[0] : null;
                
                if (currentParentId) {
                    try {
                        await GoogleAPI.moveDriveItem(file.id, trashFolderId, currentParentId);
                        orphanCount++;
                        console.log(`Moved orphan ${file.name} to trash`);
                    } catch (error) {
                        console.error(`Error moving orphan file ${file.id}:`, error);
                    }
                }
            }
        }
        
        console.log(`=== Reality Verification Complete ===`);
        console.log(`Moved: ${movedCount}, Missing: ${missingCount}, Orphans: ${orphanCount}`);
        
    } catch (error) {
        console.error('Error in verifyReality:', error);
        // Don't throw - this is a background process
        if (error.status === 401 || error.message.includes('Authentication')) {
            try {
                await GoogleAPI.handleTokenExpiration();
            } catch (authError) {
                console.error('Token refresh failed:', authError);
            }
        }
    }
};

// Named exports
export { loadApp, verifyReality };

// Default export
export default { loadApp, verifyReality };
