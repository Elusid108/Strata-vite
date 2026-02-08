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

// Google API Helper Module for Strata
// Handles authentication, Drive API operations, and Picker integration

import { CLIENT_ID, API_KEY, SCOPES } from './config';

/**
 * @typedef {Object} StrataNode
 * @property {string} uid - Unique identifier for the node
 * @property {'notebook'|'tab'|'page'} type - Type of node (notebook, tab, or page)
 * @property {string} name - Display name of the node
 * @property {string|null} parentUid - UID of the parent node (null for root-level notebooks)
 * @property {string|null} driveId - Google Drive file/folder ID (nullable)
 * @property {Object} appProperties - Additional custom properties object
 */

/**
 * @typedef {Object} StrataStructure
 * @property {Object.<string, StrataNode>} nodes - Map of UID (string) to Node Data
 * @property {string[]} trash - Array of UIDs for deleted nodes
 * 
 * @description
 * Single Source of Truth for Strata file structure.
 * Contains a flat map of all nodes (notebooks, tabs, pages) keyed by UID,
 * and a trash array for soft-deleted nodes.
 */

let gapiLoaded = false;
let gisLoaded = false;
let tokenClient = null;
let accessToken = null;
let userEmail = null;

// Session storage keys for persistence
const STORAGE_KEY_TOKEN = 'strata_access_token';
const STORAGE_KEY_USER = 'strata_user_info';
const STORAGE_KEY_EXPIRY = 'strata_token_expiry';

// Mutex for getOrCreateRootFolder to prevent race conditions
let rootFolderCreationLock = null;
let cachedRootFolderId = null;

// Initialize Google API client
const loadGapi = () => {
    return new Promise((resolve, reject) => {
        if (gapiLoaded) {
            resolve();
            return;
        }

        const MAX_WAIT = 10000; // 10 seconds
        const INTERVAL = 100;  // check every 100ms
        let elapsed = 0;

        const waitForGapi = () => {
            if (typeof gapi !== 'undefined') {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: API_KEY,
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                        });
                        gapiLoaded = true;
                        resolve();
                    } catch (error) {
                        console.error('Error loading gapi:', error);
                        reject(error);
                    }
                });
            } else if (elapsed >= MAX_WAIT) {
                reject(new Error('Google API script failed to load within timeout'));
            } else {
                if (elapsed === 0) console.warn('Waiting for Google API script to load...');
                elapsed += INTERVAL;
                setTimeout(waitForGapi, INTERVAL);
            }
        };
        waitForGapi();
    });
};

// Store pending sign-in promise resolver
let signInResolver = null;
let signInRejecter = null;

// Initialize Google Identity Services
const initGoogleAuth = () => {
    return new Promise((resolve, reject) => {
        if (gisLoaded && tokenClient) {
            resolve();
            return;
        }

        const MAX_WAIT = 10000; // 10 seconds
        const INTERVAL = 100;  // check every 100ms
        let elapsed = 0;

        const waitForGis = () => {
            if (typeof google !== 'undefined' && google.accounts) {
                initTokenClient(resolve, reject);
            } else if (elapsed >= MAX_WAIT) {
                reject(new Error('Google Identity Services script failed to load within timeout'));
            } else {
                if (elapsed === 0) console.warn('Waiting for Google Identity Services script to load...');
                elapsed += INTERVAL;
                setTimeout(waitForGis, INTERVAL);
            }
        };
        waitForGis();
    });
};

// Helper to create the token client (extracted for readability)
const initTokenClient = (resolve, reject) => {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES.join(' '),
            error_callback: (error) => {
                console.error('Google OAuth error_callback:', error);
                if (signInRejecter) {
                    signInRejecter(new Error(error?.message || 'OAuth error'));
                    signInResolver = null;
                    signInRejecter = null;
                }
            },
            callback: async (response) => {
                if (response.error) {
                    console.error('OAuth error:', response.error);
                    if (signInRejecter) {
                        signInRejecter(new Error(response.error));
                        signInResolver = null;
                        signInRejecter = null;
                    }
                    return;
                }
                accessToken = response.access_token;
                try {
                    gapi.client.setToken({ access_token: accessToken });
                } catch (setTokenErr) {
                }
                
                // Save token to sessionStorage for persistence (expires in ~1 hour)
                const expiryTime = Date.now() + (response.expires_in * 1000);
                sessionStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
                sessionStorage.setItem(STORAGE_KEY_EXPIRY, expiryTime.toString());
                
                // Resolve the pending sign-in promise
                if (signInResolver) {
                    try {
                        const userInfo = await getUserInfo();
                        // Save user info to sessionStorage
                        sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userInfo));
                        signInResolver(userInfo);
                    } catch (error) {
                        if (signInRejecter) signInRejecter(error);
                    }
                    signInResolver = null;
                    signInRejecter = null;
                } else {
                }
            },
        });

        gisLoaded = true;
        resolve();
    } catch (initErr) {
        reject(initErr);
    }
};

// Sign in user
const signIn = () => {
    return new Promise(async (resolve, reject) => {
        try {
            if (!tokenClient) {
                await initGoogleAuth();
            }
            
            // Store resolvers for the callback to use
            signInResolver = resolve;
            signInRejecter = reject;
            
            // Request the access token - this opens the popup
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (error) {
            reject(error);
        }
    });
};

// Sign out user
const signOut = () => {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken);
        accessToken = null;
        userEmail = null;
        gapi.client.setToken(null);
    }
    // Clear session storage
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_USER);
    sessionStorage.removeItem(STORAGE_KEY_EXPIRY);
};

// Get current access token
const getAccessToken = () => {
    return accessToken;
};

// Check if user is authenticated (also restores session from storage)
const checkAuthStatus = async () => {
    try {
        if (!gapiLoaded) {
            await loadGapi();
        }
        if (!gisLoaded) {
            await initGoogleAuth();
        }

        // First check sessionStorage for saved token
        const savedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN);
        const savedExpiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY);
        const savedUser = sessionStorage.getItem(STORAGE_KEY_USER);
        
        if (savedToken && savedExpiry) {
            const expiryTime = parseInt(savedExpiry, 10);
            // Check if token is still valid (with 5 min buffer)
            if (Date.now() < expiryTime - 300000) {
                accessToken = savedToken;
                gapi.client.setToken({ access_token: accessToken });
                
                // Return saved user info if available
                if (savedUser) {
                    const userInfo = JSON.parse(savedUser);
                    userEmail = userInfo.email;
                    return userInfo;
                }
                
                // Otherwise fetch fresh user info
                try {
                    const userInfo = await getUserInfo();
                    sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userInfo));
                    return userInfo;
                } catch (e) {
                    // Token invalid, clear storage
                    signOut();
                    return null;
                }
            } else {
                // Token expired, clear storage
                signOut();
            }
        }

        // Fallback: check gapi client token (shouldn't normally have one after reload)
        const token = gapi.client.getToken();
        if (token && token.access_token) {
            accessToken = token.access_token;
            try {
                const userInfo = await getUserInfo();
                return userInfo;
            } catch (e) {
                return null;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
};

// Get user info - using fetch directly to avoid API key being added by gapi.client
const getUserInfo = async () => {
    try {
        // Use fetch directly with Authorization header (no API key)
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get user info: ${response.status}`);
        }
        
        const result = await response.json();
        userEmail = result.email;
        return result;
    } catch (error) {
        console.error('Error getting user info:', error);
        throw error;
    }
};

// Handle token expiration
const handleTokenExpiration = async () => {
    try {
        // Try to refresh token
        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Token refresh failed:', error);
        return false;
    }
};

// Ensure authenticated before API calls
const ensureAuthenticated = async () => {
    if (!accessToken) {
        const isAuth = await checkAuthStatus();
        if (!isAuth) {
            throw new Error('Not authenticated');
        }
    }
    return true;
};

// ===== Drive API Functions =====

// Sanitize filename to be filesystem-safe
const sanitizeFileName = (name) => {
    if (!name) return 'Untitled';
    // Remove/replace characters that are invalid in filenames
    return name
        .replace(/[<>:"/\\|?*]/g, '-')  // Replace invalid chars with dash
        .replace(/\s+/g, ' ')            // Normalize whitespace
        .replace(/^\.+/, '')             // Remove leading dots
        .replace(/\.+$/, '')             // Remove trailing dots
        .trim()
        .substring(0, 200);              // Limit length
};

// Get file properties (custom metadata)
const getFileProperties = async (fileId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            fields: 'properties'
        });
        
        const props = response.result.properties || {};
        return {
            pageType: props.strata_pageType || null,
            icon: props.strata_icon || null,
            tabColor: props.strata_tabColor || null
        };
    } catch (error) {
        console.error('Error getting file properties:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Set file properties (custom metadata)
const setFileProperties = async (fileId, properties) => {
    try {
        await ensureAuthenticated();
        
        const props = {};
        if (properties.pageType !== undefined) props.strata_pageType = String(properties.pageType);
        if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
        if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
        
        await gapi.client.drive.files.update({
            fileId: fileId,
            resource: { properties: props },
            fields: 'id, properties'
        });
        
        return true;
    } catch (error) {
        console.error('Error setting file properties:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Update file properties (metadata only, without affecting content)
const updateFileProperties = async (fileId, properties) => {
    try {
        await ensureAuthenticated();
        
        // Convert properties object to Drive API format with strata_ prefix
        const props = {};
        for (const [key, value] of Object.entries(properties)) {
            if (value !== undefined && value !== null) {
                // Add strata_ prefix if not already present
                const propKey = key.startsWith('strata_') ? key : `strata_${key}`;
                props[propKey] = String(value);
            }
        }
        
        const response = await gapi.client.drive.files.update({
            fileId: fileId,
            resource: { properties: props },
            fields: 'id, name, properties'
        });
        
        return response.result;
    } catch (error) {
        console.error('Error updating file properties:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Get file with properties (metadata including custom properties)
const getFileWithProperties = async (fileId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, properties, parents, trashed'
        });
        
        return response.result;
    } catch (error) {
        console.error('Error getting file with properties:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Set appProperties.strataUID on a Drive file
const setFileUid = async (fileId, uid) => {
    try {
        await ensureAuthenticated();
        
        await gapi.client.drive.files.update({
            fileId: fileId,
            resource: { appProperties: { strataUID: uid } },
            fields: 'id, appProperties'
        });
        
        return true;
    } catch (error) {
        console.error('Error setting file UID:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Search Drive for files with matching appProperties.strataUID
const getFileByUid = async (uid) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.list({
            q: `appProperties has { key='strataUID' and value='${uid}' } and trashed=false`,
            fields: 'files(id, name, mimeType, appProperties)',
            pageSize: 1
        });
        
        if (response.result.files && response.result.files.length > 0) {
            return response.result.files[0];
        }
        
        return null;
    } catch (error) {
        console.error('Error getting file by UID:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Get all files in Drive that have appProperties.strataUID (handles pagination)
const getAllFilesWithUid = async () => {
    try {
        await ensureAuthenticated();
        
        const allFiles = [];
        let nextPageToken = null;
        
        do {
            const requestParams = {
                q: `appProperties has { key='strataUID' } and trashed=false`,
                fields: 'nextPageToken, files(id, name, mimeType, parents, appProperties)',
                pageSize: 1000
            };
            
            if (nextPageToken) {
                requestParams.pageToken = nextPageToken;
            }
            
            const response = await gapi.client.drive.files.list(requestParams);
            
            if (response.result.files) {
                allFiles.push(...response.result.files);
            }
            
            nextPageToken = response.result.nextPageToken || null;
        } while (nextPageToken);
        
        return allFiles;
    } catch (error) {
        console.error('Error getting all files with UID:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Get file metadata (ID, name, and properties only)
const getFileMetadata = async (fileId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            fields: 'id, name, properties'
        });
        
        return {
            id: response.result.id,
            name: response.result.name,
            properties: response.result.properties || {}
        };
    } catch (error) {
        console.error('Error getting file metadata:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Create file with properties
const createFileWithProperties = async (fileMetadata, properties = {}) => {
    try {
        await ensureAuthenticated();
        
        // Create a copy of fileMetadata to avoid mutating the original
        const metadata = { ...fileMetadata };
        
        // Convert properties object to Drive API format with strata_ prefix
        if (Object.keys(properties).length > 0) {
            metadata.properties = {};
            for (const [key, value] of Object.entries(properties)) {
                if (value !== undefined && value !== null) {
                    // Add strata_ prefix if not already present
                    const propKey = key.startsWith('strata_') ? key : `strata_${key}`;
                    metadata.properties[propKey] = String(value);
                }
            }
        }
        
        const response = await gapi.client.drive.files.create({
            resource: metadata,
            fields: 'id, name, mimeType, properties, parents'
        });
        
        return response.result;
    } catch (error) {
        console.error('Error creating file with properties:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Idempotent file save - checks fileId first, then name+parent, only creates as last resort
const saveFileIdempotent = async (fileId, name, parentId, content, properties = {}) => {
    try {
        await ensureAuthenticated();
        
        const sanitizedName = sanitizeFileName(name);
        
        // Step 1: If fileId exists and is valid, update it
        if (fileId) {
            try {
                const existing = await gapi.client.drive.files.get({
                    fileId: fileId,
                    fields: 'id, name, trashed'
                });
                if (!existing.result.trashed) {
                    // File exists and is not trashed, update it
                    const metadata = { name: sanitizedName };
                    if (Object.keys(properties).length > 0) {
                        const props = {};
                        if (properties.pageType !== undefined) props.strata_pageType = String(properties.pageType);
                        if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
                        if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
                        metadata.properties = props;
                    }
                    
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                    if (content !== null && content !== undefined) {
                        form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
                    }
                    
                    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        body: form
                    });
                    
                    return fileId;
                }
            } catch (e) {
                // File doesn't exist or is trashed, continue to search by name
            }
        }
        
        // Step 2: Search for file with same name in parent
        const searchQuery = parentId 
            ? `name='${sanitizedName.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
            : `name='${sanitizedName.replace(/'/g, "\\'")}' and 'root' in parents and trashed=false`;
        
        const searchResponse = await gapi.client.drive.files.list({
            q: searchQuery,
            fields: 'files(id, name)',
            pageSize: 1
        });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Found existing file, update it
            const existingFileId = searchResponse.result.files[0].id;
            const metadata = { name: sanitizedName };
            if (Object.keys(properties).length > 0) {
                const props = {};
                if (properties.pageType !== undefined) props.strata_pageType = String(properties.pageType);
                if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
                if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
                metadata.properties = props;
            }
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            if (content !== null && content !== undefined) {
                form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
            }
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            return existingFileId;
        }
        
        // Step 3: Create new file as last resort
        const metadata = {
            name: sanitizedName,
            mimeType: 'application/json'
        };
        if (parentId) {
            metadata.parents = [parentId];
        }
        if (Object.keys(properties).length > 0) {
            const props = {};
            if (properties.pageType !== undefined) props.strata_pageType = String(properties.pageType);
            if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
            if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
            metadata.properties = props;
        }
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        if (content !== null && content !== undefined) {
            form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
        }
        
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create file: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.id;
    } catch (error) {
        console.error('Error in saveFileIdempotent:', error);
        if (error.status === 401 || error.message.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Idempotent folder save - checks folderId first, then name+parent, only creates as last resort
const saveFolderIdempotent = async (folderId, name, parentId, properties = {}) => {
    try {
        await ensureAuthenticated();
        
        const sanitizedName = sanitizeFileName(name);
        
        // Step 1: If folderId exists and is valid, update it
        if (folderId) {
            try {
                const existing = await gapi.client.drive.files.get({
                    fileId: folderId,
                    fields: 'id, name, trashed'
                });
                if (!existing.result.trashed) {
                    // Folder exists and is not trashed, update it
                    const metadata = { name: sanitizedName };
                    if (Object.keys(properties).length > 0) {
                        const props = {};
                        if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
                        if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
                        metadata.properties = props;
                    }
                    
                    await gapi.client.drive.files.update({
                        fileId: folderId,
                        resource: metadata,
                        fields: 'id, name'
                    });
                    
                    return folderId;
                }
            } catch (e) {
                // Folder doesn't exist or is trashed, continue to search by name
            }
        }
        
        // Step 2: Search for folder with same name in parent
        const searchQuery = parentId 
            ? `name='${sanitizedName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
            : `name='${sanitizedName.replace(/'/g, "\\'")}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        
        const searchResponse = await gapi.client.drive.files.list({
            q: searchQuery,
            fields: 'files(id, name)',
            pageSize: 1
        });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Found existing folder, update it
            const existingFolderId = searchResponse.result.files[0].id;
            const metadata = { name: sanitizedName };
            if (Object.keys(properties).length > 0) {
                const props = {};
                if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
                if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
                metadata.properties = props;
            }
            
            await gapi.client.drive.files.update({
                fileId: existingFolderId,
                resource: metadata,
                fields: 'id, name'
            });
            
            return existingFolderId;
        }
        
        // Step 3: Create new folder as last resort
        const fileMetadata = {
            name: sanitizedName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) {
            fileMetadata.parents = [parentId];
        }
        if (Object.keys(properties).length > 0) {
            const props = {};
            if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
            if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
            fileMetadata.properties = props;
        }
        
        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, name'
        });
        
        return response.result.id;
    } catch (error) {
        console.error('Error in saveFolderIdempotent:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Create Drive folder
const createDriveFolder = async (name, parentId = null) => {
    try {
        await ensureAuthenticated();

        const fileMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder'
        };

        if (parentId) {
            fileMetadata.parents = [parentId];
        }

        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, name, webViewLink'
        });

        return response.result;
    } catch (error) {
        console.error('Error creating folder:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Get or create folder - checks for existing folder first to prevent duplicates
const getOrCreateFolder = async (name, parentId) => {
    try {
        await ensureAuthenticated();
        
        const sanitizedName = sanitizeFileName(name);
        
        // Search for existing folder with same name in parent
        const searchQuery = parentId 
            ? `name='${sanitizedName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
            : `name='${sanitizedName.replace(/'/g, "\\'")}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        
        const searchResponse = await gapi.client.drive.files.list({
            q: searchQuery,
            fields: 'files(id, name)',
            pageSize: 1
        });
        
        // If folder exists, return its ID
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            return searchResponse.result.files[0].id;
        }
        
        // Create new folder if not found
        const folder = await createDriveFolder(sanitizedName, parentId);
        return folder.id;
    } catch (error) {
        console.error('Error in getOrCreateFolder:', error);
        throw error;
    }
};

// Update Drive folder name
const updateDriveFolder = async (folderId, name) => {
    try {
        await ensureAuthenticated();

        const response = await gapi.client.drive.files.update({
            fileId: folderId,
            resource: { name: name },
            fields: 'id, name'
        });

        return response.result;
    } catch (error) {
        console.error('Error updating folder:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Delete Drive folder
const deleteDriveFolder = async (folderId) => {
    try {
        await ensureAuthenticated();

        await gapi.client.drive.files.delete({
            fileId: folderId
        });

        return true;
    } catch (error) {
        console.error('Error deleting folder:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Upload file to Drive
const uploadFileToDrive = async (file, folderId, name) => {
    try {
        await ensureAuthenticated();

        const metadata = {
            name: name,
            parents: folderId ? [folderId] : []
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: form
        });

        if (!response.ok) {
            throw new Error(`Failed to upload file: ${response.statusText}`);
        }

        const result = await response.json();

        // Get webViewLink
        const fileResponse = await gapi.client.drive.files.get({
            fileId: result.id,
            fields: 'id, name, webViewLink, mimeType'
        });

        return fileResponse.result;
    } catch (error) {
        console.error('Error uploading file:', error);
        if (error.status === 401 || error.message.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Get index file (strata_index.json) from root folder
const getIndexFile = async (rootFolderId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.list({
            q: `name='strata_index.json' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (response.result.files && response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            const fileResponse = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return JSON.parse(fileResponse.body);
        }
        
        return null;
    } catch (error) {
        console.error('Error getting index file:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        // Return null if file doesn't exist (not an error)
        if (error.status === 404) {
            return null;
        }
        throw error;
    }
};

// Save index file (strata_index.json) to root folder
const saveIndexFile = async (rootFolderId, indexData) => {
    try {
        await ensureAuthenticated();
        
        const content = JSON.stringify(indexData, null, 2);
        
        // Use idempotent save - check for existing file first
        const existing = await gapi.client.drive.files.list({
            q: `name='strata_index.json' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (existing.result.files && existing.result.files.length > 0) {
            // Update existing file
            const fileId = existing.result.files[0].id;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({ name: 'strata_index.json' })], { type: 'application/json' }));
            form.append('file', new Blob([content], { type: 'application/json' }));
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            return fileId;
        } else {
            // Create new file
            const metadata = {
                name: 'strata_index.json',
                parents: [rootFolderId],
                mimeType: 'application/json'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([content], { type: 'application/json' }));
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create index file: ${response.statusText}`);
            }
            
            const result = await response.json();
            return result.id;
        }
    } catch (error) {
        console.error('Error saving index file:', error);
        if (error.status === 401 || error.message.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Save StrataStructure to strata_structure.json in root folder
const saveStructure = async (structureData) => {
    try {
        await ensureAuthenticated();
        
        const rootFolderId = await getOrCreateRootFolder();
        const content = JSON.stringify(structureData, null, 2);
        
        // Check if file exists
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='strata_structure.json' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        const contentBlob = new Blob([content], { type: 'application/json' });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Update existing file
            const fileId = searchResponse.result.files[0].id;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({ name: 'strata_structure.json' })], { type: 'application/json' }));
            form.append('file', contentBlob);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            return fileId;
        } else {
            // Create new file
            const metadata = {
                name: 'strata_structure.json',
                parents: [rootFolderId],
                mimeType: 'application/json'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', contentBlob);
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create structure file: ${response.statusText}`);
            }
            
            const result = await response.json();
            return result.id;
        }
    } catch (error) {
        console.error('Error saving structure:', error);
        if (error.status === 401 || error.message.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Load StrataStructure from strata_structure.json in root folder
// Throws error if file not found or download fails (no fallback)
const loadStructure = async () => {
    try {
        await ensureAuthenticated();
        
        const rootFolderId = await getOrCreateRootFolder();
        
        // Search for strata_structure.json in root folder
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='strata_structure.json' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (!searchResponse.result.files || searchResponse.result.files.length === 0) {
            throw new Error('strata_structure.json not found in root folder');
        }
        
        const fileId = searchResponse.result.files[0].id;
        
        // Download file content
        const fileResponse = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        // Parse JSON and return structure
        return JSON.parse(fileResponse.body);
    } catch (error) {
        console.error('Error loading structure:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        // Re-throw all errors (including 404) - no fallback
        throw error;
    }
};

// Get or create root folder "Strata Notebooks" in visible My Drive (not appDataFolder)
const getOrCreateRootFolder = async () => {
    // Return cached ID if available
    if (cachedRootFolderId) {
        return cachedRootFolderId;
    }

    // Wait for any ongoing creation to complete
    if (rootFolderCreationLock) {
        await rootFolderCreationLock;
        if (cachedRootFolderId) {
            return cachedRootFolderId;
        }
    }

    // Acquire lock for folder creation
    rootFolderCreationLock = (async () => {
        try {
            await ensureAuthenticated();

            // Search for existing folder in My Drive root (not appDataFolder)
            const response = await gapi.client.drive.files.list({
                q: "name='Strata Notebooks' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
                fields: 'files(id, name)',
                pageSize: 1
            });

            if (response.result.files && response.result.files.length > 0) {
                const folderId = response.result.files[0].id;
                cachedRootFolderId = folderId;
                return folderId;
            }

            // Create in My Drive root if doesn't exist
            const fileMetadata = {
                name: 'Strata Notebooks',
                mimeType: 'application/vnd.google-apps.folder',
                parents: ['root']  // Explicitly put in My Drive root
            };
            
            const createResponse = await gapi.client.drive.files.create({
                resource: fileMetadata,
                fields: 'id, name, webViewLink'
            });

            const newFolderId = createResponse.result.id;
            cachedRootFolderId = newFolderId;
            return newFolderId;
        } catch (error) {
            console.error('Error getting/creating root folder:', error);
            throw error;
        } finally {
            rootFolderCreationLock = null;
        }
    })();

    return await rootFolderCreationLock;
};

// ===== File-System-as-Database Save Functions =====

// Tree version marker
const TREE_VER = 2;

// Save notebook folder (idempotent)
const saveNotebookFolder = async (notebook, rootFolderId) => {
    try {
        await ensureAuthenticated();
        
        const properties = {};
        if (notebook.icon) {
            properties.icon = notebook.icon;
        }
        
        const folderId = await saveFolderIdempotent(
            notebook.driveFolderId,
            notebook.name,
            rootFolderId,
            properties
        );
        
        return folderId;
    } catch (error) {
        console.error('Error saving notebook folder:', error);
        throw error;
    }
};

// Save tab folder (idempotent)
const saveTabFolder = async (tab, notebookFolderId) => {
    try {
        await ensureAuthenticated();
        
        const properties = {};
        if (tab.color) {
            properties.tabColor = tab.color;
        }
        if (tab.icon) {
            properties.icon = tab.icon;
        }
        
        const folderId = await saveFolderIdempotent(
            tab.driveFolderId,
            tab.name,
            notebookFolderId,
            properties
        );
        
        return folderId;
    } catch (error) {
        console.error('Error saving tab folder:', error);
        throw error;
    }
};

// Save page file (idempotent)
const savePageFile = async (page, tabFolderId) => {
    try {
        await ensureAuthenticated();
        
        const fileName = sanitizeFileName(page.name) + '.json';
        const contentToSave = (page.content && page.content.version === TREE_VER) ? page.content : (page.rows || page.content);
        const pageContent = {
            type: page.type || 'block',
            name: page.name,
            icon: page.icon,
            cover: page.cover,
            content: contentToSave,
            googleFileId: page.googleFileId,
            url: page.url,
            createdAt: page.createdAt,
            modifiedAt: Date.now()
        };
        
        // Add page-type-specific content
        if (page.type === 'mermaid') {
            pageContent.mermaidCode = page.mermaidCode ?? '';
            if (page.mermaidViewport) pageContent.mermaidViewport = page.mermaidViewport;
        }
        if (page.type === 'canvas') {
            pageContent.canvasData = page.canvasData;
        }
        if (page.type === 'database') {
            pageContent.databaseData = page.databaseData;
        }
        if (page.type === 'code') {
            pageContent.codeContent = page.codeContent;
            pageContent.codeType = page.codeType;
        }
        
        const properties = {
            pageType: page.type || 'block'
        };
        if (page.icon) {
            properties.icon = page.icon;
        }
        
        const fileId = await saveFileIdempotent(
            page.driveFileId,
            fileName,
            tabFolderId,
            pageContent,
            properties
        );
        
        return fileId;
    } catch (error) {
        console.error('Error saving page file:', error);
        throw error;
    }
};

// Robust save page to Drive with Check-Update-Create logic
const savePageToDrive = async (pageData) => {
    try {
        await ensureAuthenticated();
        
        // Sanitize filename
        const fileName = sanitizeFileName(pageData.title) + '.json';
        
        // Prepare page content (JSON stringified)
        const pageContent = JSON.stringify(pageData.content);
        
        // Prepare properties object
        const properties = {};
        if (pageData.strataType) properties.type = pageData.strataType;
        if (pageData.icon) properties.icon = pageData.icon;
        
        // Build metadata with properties
        const buildMetadata = (name, includeProps = true) => {
            const metadata = { name };
            if (includeProps && Object.keys(properties).length > 0) {
                const props = {};
                if (properties.type !== undefined) props.strata_pageType = String(properties.type);
                if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
                metadata.properties = props;
            }
            return metadata;
        };
        
        // Step 1: Check Internal ID - try to update if googleId exists
        if (pageData.googleId) {
            try {
                const metadata = buildMetadata(fileName);
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', new Blob([pageContent], { type: 'application/json' }));
                
                const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${pageData.googleId}?uploadType=multipart`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    body: form
                });
                
                if (response.ok) {
                    // Update successful, return the fileId
                    return pageData.googleId;
                } else if (response.status === 404) {
                    // File was deleted externally, clear the ID and proceed to step 2
                    console.warn(`File ${pageData.googleId} not found (404), clearing ID and searching by name`);
                    pageData.googleId = null;
                } else {
                    // Other error, throw
                    const errorText = await response.text();
                    throw new Error(`Failed to update file: ${response.status} ${errorText}`);
                }
            } catch (error) {
                // If it's a 404 from gapi client, handle it
                if (error.status === 404 || error.message.includes('404')) {
                    console.warn(`File ${pageData.googleId} not found (404), clearing ID and searching by name`);
                    pageData.googleId = null;
                } else if (error.status === 401) {
                    await handleTokenExpiration();
                    throw new Error('Authentication expired');
                } else {
                    // Re-throw other errors
                    throw error;
                }
            }
        }
        
        // Step 2: Check External Existence - search by name+parent
        if (!pageData.googleId) {
            try {
                const sanitizedName = fileName.replace(/'/g, "\\'");
                const query = `name='${sanitizedName}' and '${pageData.parentId}' in parents and trashed=false`;
                
                const searchResponse = await gapi.client.drive.files.list({
                    q: query,
                    fields: 'files(id, name)',
                    pageSize: 1
                });
                
                if (searchResponse.result.files && searchResponse.result.files.length > 0) {
                    // Found existing file, update it
                    const foundFileId = searchResponse.result.files[0].id;
                    const metadata = buildMetadata(fileName);
                    
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                    form.append('file', new Blob([pageContent], { type: 'application/json' }));
                    
                    const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${foundFileId}?uploadType=multipart`, {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        body: form
                    });
                    
                    if (!updateResponse.ok) {
                        const errorText = await updateResponse.text();
                        throw new Error(`Failed to update found file: ${updateResponse.status} ${errorText}`);
                    }
                    
                    // Save the found fileId to pageData.googleId (mutate input object)
                    pageData.googleId = foundFileId;
                    return foundFileId;
                }
            } catch (error) {
                console.error('Error searching for existing file:', error);
                if (error.status === 401) {
                    await handleTokenExpiration();
                    throw new Error('Authentication expired');
                }
                // Continue to step 3 if search fails
            }
        }
        
        // Step 3: Create new file (last resort)
        const metadata = buildMetadata(fileName);
        metadata.mimeType = 'application/json';
        metadata.parents = [pageData.parentId];
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([pageContent], { type: 'application/json' }));
        
        const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form
        });
        
        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create file: ${createResponse.status} ${errorText}`);
        }
        
        const result = await createResponse.json();
        const newFileId = result.id;
        
        // Save the new fileId to pageData.googleId (mutate input object)
        pageData.googleId = newFileId;
        return newFileId;
        
    } catch (error) {
        console.error('Error in savePageToDrive:', error);
        if (error.status === 401 || error.message.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Delete page from Drive (soft delete - move to trash)
const deletePageFromDrive = async (fileId) => {
    try {
        await ensureAuthenticated();
        
        await gapi.client.drive.files.update({
            fileId: fileId,
            resource: { trashed: true },
            fields: 'id'
        });
        
        return true;
    } catch (error) {
        console.error('Error deleting page from Drive:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        if (error.status === 404) {
            // File already deleted or not found
            console.warn(`File ${fileId} not found (may already be deleted)`);
            return true; // Consider it successful if already deleted
        }
        throw error;
    }
};

// Get old manifest from appDataFolder or root folder (temporary migration helper)
const getOldManifest = async () => {
    try {
        await ensureAuthenticated();
        
        // Try appDataFolder first
        try {
            const response = await gapi.client.drive.files.list({
                q: "name='strata_manifest.json' and 'appDataFolder' in parents",
                spaces: 'appDataFolder',
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc'
            });
            if (response.result.files && response.result.files.length > 0) {
                const fileId = response.result.files[0].id;
                const fileResponse = await gapi.client.drive.files.get({
                    fileId: fileId,
                    alt: 'media'
                });
                return JSON.parse(fileResponse.body);
            }
        } catch (e) {
            // Fall through to root folder check
            console.log('Manifest not found in appDataFolder, checking root folder...');
        }
        
        // Try root folder
        const rootFolderId = await getOrCreateRootFolder();
        const response = await gapi.client.drive.files.list({
            q: `name='strata_manifest.json' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        if (response.result.files && response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            const fileResponse = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return JSON.parse(fileResponse.body);
        }
        return null;
    } catch (error) {
        console.error('Error getting old manifest:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Clean up old manifest files from appDataFolder
const cleanupAppDataFolder = async () => {
    try {
        await ensureAuthenticated();
        
        const deleted = [];
        const errors = [];
        
        // List all files in appDataFolder
        const response = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            fields: 'files(id, name, mimeType)',
            pageSize: 1000
        });
        
        if (!response.result.files || response.result.files.length === 0) {
            return { deleted: 0, errors: [] };
        }
        
        // Delete files matching patterns: strata_manifest.json, strata_*.json, or any .json files
        const filesToDelete = response.result.files.filter(file => {
            const name = file.name.toLowerCase();
            return name === 'strata_manifest.json' || 
                   name.startsWith('strata_') && name.endsWith('.json') ||
                   name.endsWith('.json');
        });
        
        // Delete each file
        for (const file of filesToDelete) {
            try {
                await gapi.client.drive.files.delete({
                    fileId: file.id
                });
                deleted.push(file.name);
                console.log(`Deleted: ${file.name}`);
            } catch (error) {
                console.error(`Error deleting ${file.name}:`, error);
                errors.push({ file: file.name, error: error.message || String(error) });
            }
        }
        
        return {
            deleted: deleted.length,
            errors: errors,
            deletedFiles: deleted
        };
    } catch (error) {
        console.error('Error cleaning up appDataFolder:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Recursively get all files in a folder hierarchy
const getAllFilesRecursive = async (folderId, allFiles = []) => {
    try {
        const items = await listFolderContents(folderId);
        for (const item of items) {
            if (item.mimeType === 'application/vnd.google-apps.folder') {
                // Recursively process folders
                await getAllFilesRecursive(item.id, allFiles);
            } else {
                // Add file to list
                allFiles.push(item);
            }
        }
        return allFiles;
    } catch (error) {
        console.error(`Error listing files in folder ${folderId}:`, error);
        // Continue processing - return what we have so far
        return allFiles;
    }
};

// Sync sort order to strata_index.json
const syncSortOrder = async (rootFolderId, orderData) => {
    try {
        await ensureAuthenticated();
        
        // Read existing index file
        let existingIndex = await getIndexFile(rootFolderId);
        
        // If file doesn't exist, start with empty structure
        if (!existingIndex) {
            existingIndex = {
                notebooks: [],
                tabs: {},
                pages: {},
                folders: {}
            };
        }
        
        // Ensure folders key exists
        if (!existingIndex.folders) {
            existingIndex.folders = {};
        }
        
        // Merge new order data into folders
        for (const [folderId, fileIds] of Object.entries(orderData)) {
            existingIndex.folders[folderId] = fileIds;
        }
        
        // Save merged index back
        const fileId = await saveIndexFile(rootFolderId, existingIndex);
        return fileId;
    } catch (error) {
        console.error('Error syncing sort order:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Migrate data from old architecture to new File-System-as-Database architecture
const migrateStrataData = async (rootFolderId) => {
    try {
        await ensureAuthenticated();
        
        console.log('Starting migration...');
        
        // Step 1: Load the Source of Truth
        console.log('Step 1: Loading manifest...');
        const manifest = await getOldManifest();
        
        if (!manifest || !manifest.data) {
            throw new Error('No manifest found. Migration cannot proceed.');
        }
        
        console.log(`Found manifest with ${manifest.data.notebooks?.length || 0} notebooks`);
        
        // Step 2: Create Backup Folder
        console.log('Step 2: Creating archive folder...');
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const archiveFolderName = `_Strata_Archived_Duplicates_${dateStr}`;
        const archiveFolder = await createDriveFolder(archiveFolderName, rootFolderId);
        const archiveFolderId = archiveFolder.id;
        console.log(`Created archive folder: ${archiveFolderName} (${archiveFolderId})`);
        
        // Step 3: Iterate & Enrich
        console.log('Step 3: Applying metadata to files...');
        const keepList = new Set();
        let notebooksUpdated = 0;
        let tabsUpdated = 0;
        let pagesUpdated = 0;
        
        // Add root folder and archive folder to keepList (don't archive these)
        keepList.add(rootFolderId);
        keepList.add(archiveFolderId);
        
        for (const notebook of manifest.data.notebooks || []) {
            if (notebook.driveFolderId) {
                keepList.add(notebook.driveFolderId);
                try {
                    // Apply notebook properties (icon)
                    await updateFileProperties(notebook.driveFolderId, {
                        icon: notebook.icon || '📓'
                    });
                    notebooksUpdated++;
                    console.log(`Updated metadata for Notebook: ${notebook.name}`);
                } catch (error) {
                    console.error(`Error updating notebook ${notebook.name}:`, error);
                }
            }
            
            // For each tab
            for (const tab of notebook.tabs || []) {
                if (tab.driveFolderId) {
                    keepList.add(tab.driveFolderId);
                    try {
                        // Apply tab properties (color, icon)
                        await updateFileProperties(tab.driveFolderId, {
                            icon: tab.icon || '📋',
                            tabColor: tab.color || 'blue'
                        });
                        tabsUpdated++;
                        console.log(`Updated metadata for Tab: ${tab.name}`);
                    } catch (error) {
                        console.error(`Error updating tab ${tab.name}:`, error);
                    }
                }
                
                // For each page
                for (const page of tab.pages || []) {
                    if (page.driveFileId) {
                        keepList.add(page.driveFileId);
                        try {
                            // Apply page properties (type, icon)
                            await updateFileProperties(page.driveFileId, {
                                type: page.type || 'block',
                                icon: page.icon || '📄'
                            });
                            pagesUpdated++;
                            console.log(`Updated metadata for Page: ${page.name}`);
                        } catch (error) {
                            console.error(`Error updating page ${page.name}:`, error);
                        }
                    }
                }
            }
        }
        
        console.log(`Metadata update complete: ${notebooksUpdated} notebooks, ${tabsUpdated} tabs, ${pagesUpdated} pages`);
        
        // Step 4: Cleanup (Soft Delete - Move to Archive)
        console.log('Step 4: Finding and archiving orphan files...');
        const allFiles = await getAllFilesRecursive(rootFolderId);
        
        // Filter out system files and files in keepList
        const systemFiles = ['strata_index.json', 'manifest.json', 'index.html'];
        const orphanFiles = allFiles.filter(file => 
            !keepList.has(file.id) && 
            !systemFiles.includes(file.name)
        );
        
        console.log(`Found ${orphanFiles.length} orphan/duplicate files to archive`);
        
        let filesArchived = 0;
        for (const file of orphanFiles) {
            try {
                // Get current parents
                const fileInfo = await gapi.client.drive.files.get({
                    fileId: file.id,
                    fields: 'parents'
                });
                const oldParentId = fileInfo.result.parents?.[0];
                
                if (oldParentId) {
                    await moveDriveItem(file.id, archiveFolderId, oldParentId);
                    filesArchived++;
                    console.log(`Archived orphan file: ${file.name} (${file.id})`);
                }
            } catch (error) {
                console.error(`Error archiving file ${file.name}:`, error);
            }
        }
        
        console.log(`Migration complete! Archived ${filesArchived} files.`);
        
        return {
            success: true,
            notebooksUpdated,
            tabsUpdated,
            pagesUpdated,
            filesArchived,
            archiveFolderId
        };
    } catch (error) {
        console.error('Error in migration:', error);
        if (error.status === 401 || error.message.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Legacy sync functions (kept for backward compatibility during transition)
const syncNotebookToDrive = saveNotebookFolder;
const syncTabToDrive = saveTabFolder;
const syncPageToDrive = savePageFile;

// Convert tree { version, children } to legacy rows[] for Docs API (scoped to avoid global conflict)
const apiTreeToRows = (tree) => {
    if (!tree || !tree.children) return [];
    const rows = [];
    for (const node of tree.children) {
        if (node.type === 'row') {
            const cols = node.children || [];
            const colCount = cols.length || 1;
            rows.push({
                id: node.id,
                columns: cols.map(col => ({
                    id: col.id,
                    width: col.width ?? (1 / colCount),
                    blocks: (col.children || []).filter(b => b && b.type !== 'row' && b.type !== 'column')
                }))
            });
        } else if (node.type === 'column') {
            rows.push({
                id: 'row-' + (node.id || Date.now()),
                columns: [{ id: node.id, width: node.width ?? 1, blocks: (node.children || []).filter(b => b && b.type !== 'row' && b.type !== 'column') }]
            });
        } else {
            rows.push({
                id: 'row-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                columns: [{ id: 'col-' + Date.now(), blocks: [node] }]
            });
        }
    }
    return rows;
};

// Load data structure from Drive folder hierarchy
const loadFromDriveStructure = async (rootFolderId) => {
    try {
        await ensureAuthenticated();
        
        // Load index file for sort order
        const indexData = await getIndexFile(rootFolderId);
        const notebookOrder = indexData?.notebooks || [];
        const tabOrder = indexData?.tabs || {};
        const pageOrder = indexData?.pages || {};
        
        // List notebook folders in root
        const notebooksResponse = await gapi.client.drive.files.list({
            q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name, properties)',
            orderBy: 'name'
        });
        
        const notebooks = [];
        const notebookMap = new Map(); // Map folder ID to notebook object
        
        // Process notebooks
        for (const folder of notebooksResponse.result.files || []) {
            const props = folder.properties || {};
            const notebook = {
                id: `nb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: folder.name,
                icon: props.strata_icon || '📓',
                driveFolderId: folder.id,
                tabs: [],
                activeTabId: null
            };
            
            notebooks.push(notebook);
            notebookMap.set(folder.id, notebook);
        }
        
        // Apply sort order from index
        if (notebookOrder.length > 0) {
            const orderedNotebooks = [];
            const unorderedNotebooks = [];
            
            for (const nbId of notebookOrder) {
                const nb = notebooks.find(n => n.id === nbId);
                if (nb) orderedNotebooks.push(nb);
            }
            
            for (const nb of notebooks) {
                if (!notebookOrder.includes(nb.id)) {
                    unorderedNotebooks.push(nb);
                }
            }
            
            notebooks.length = 0;
            notebooks.push(...orderedNotebooks, ...unorderedNotebooks);
        }
        
        // Process tabs for each notebook
        for (const notebook of notebooks) {
            const tabsResponse = await gapi.client.drive.files.list({
                q: `'${notebook.driveFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name, properties)',
                orderBy: 'name'
            });
            
            const tabs = [];
            const tabMap = new Map();
            
            for (const folder of tabsResponse.result.files || []) {
                const props = folder.properties || {};
                const tab = {
                    id: `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: folder.name,
                    icon: props.strata_icon || '📋',
                    color: props.strata_tabColor || 'blue',
                    driveFolderId: folder.id,
                    pages: [],
                    activePageId: null
                };
                
                tabs.push(tab);
                tabMap.set(folder.id, tab);
            }
            
            // Apply sort order from index
            const tabOrderForNotebook = tabOrder[notebook.id] || [];
            if (tabOrderForNotebook.length > 0) {
                const orderedTabs = [];
                const unorderedTabs = [];
                
                for (const tabId of tabOrderForNotebook) {
                    const tab = tabs.find(t => t.id === tabId);
                    if (tab) orderedTabs.push(tab);
                }
                
                for (const tab of tabs) {
                    if (!tabOrderForNotebook.includes(tab.id)) {
                        unorderedTabs.push(tab);
                    }
                }
                
                tabs.length = 0;
                tabs.push(...orderedTabs, ...unorderedTabs);
            }
            
            notebook.tabs = tabs;
            if (tabs.length > 0) {
                notebook.activeTabId = tabs[0].id;
            }
            
            // Process pages for each tab - collect page files first, then fetch content in parallel
            const pagesToFetch = [];
            
            for (const tab of tabs) {
                const pagesResponse = await gapi.client.drive.files.list({
                    q: `'${tab.driveFolderId}' in parents and mimeType='application/json' and trashed=false`,
                    fields: 'files(id, name, properties)',
                    orderBy: 'name'
                });
                
                const pages = [];
                
                for (const file of pagesResponse.result.files || []) {
                    // Skip system files
                    if (file.name === 'strata_index.json' || file.name === 'manifest.json' || file.name === 'index.html') {
                        continue;
                    }
                    
                    const props = file.properties || {};
                    const pageType = props.strata_pageType || 'block';
                    const icon = props.strata_icon || '📄';
                    
                    const page = {
                        id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: file.name.replace('.json', ''),
                        type: pageType,
                        icon: icon,
                        driveFileId: file.id,
                        rows: [],
                        content: [],
                        cover: null,
                        googleFileId: null,
                        url: null,
                        createdAt: Date.now(),
                        modifiedAt: Date.now()
                    };
                    
                    pages.push(page);
                    pagesToFetch.push({ fileId: file.id, fileName: file.name, tab, page });
                }
                
                tab.pages = pages;
                if (pages.length > 0) {
                    tab.activePageId = pages[0].id;
                }
            }
            
            // Fetch all page contents in parallel batches (concurrency limit: 10)
            const BATCH_SIZE = 10;
            for (let i = 0; i < pagesToFetch.length; i += BATCH_SIZE) {
                const batch = pagesToFetch.slice(i, i + BATCH_SIZE);
                const results = await Promise.all(batch.map(async ({ fileId, fileName, page }) => {
                    try {
                        const contentResponse = await gapi.client.drive.files.get({
                            fileId,
                            alt: 'media'
                        });
                        return { page, pageContent: JSON.parse(contentResponse.body) };
                    } catch (error) {
                        console.error(`Error loading page ${fileName}:`, error);
                        return { page, pageContent: null };
                    }
                }));
                
                for (const { page, pageContent } of results) {
                    if (!pageContent) continue;
                    
                    // Derive page type from content when file properties lack it (fix for existing link files)
                    const googleTypes = ['doc', 'sheet', 'slide', 'pdf', 'drive'];
                    const contentType = googleTypes.includes(pageContent.type) ? pageContent.type : null;
                    const pageType = contentType || page.type;
                    if (contentType) page.type = contentType;
                    page.name = pageContent.name || page.name;
                    const raw = pageContent.content || pageContent.rows || [];
                    if (raw && raw.version === TREE_VER && Array.isArray(raw.children)) {
                        page.content = raw;
                        page.rows = apiTreeToRows(raw);
                    } else {
                        page.content = raw;
                        page.rows = Array.isArray(raw) ? raw : [];
                    }
                    page.cover = pageContent.cover;
                    page.googleFileId = pageContent.googleFileId;
                    page.url = pageContent.url;
                    page.createdAt = pageContent.createdAt || page.createdAt;
                    page.modifiedAt = pageContent.modifiedAt || page.modifiedAt;
                    
                    if (pageType === 'mermaid') {
                        page.mermaidCode = pageContent.mermaidCode || '';
                        page.mermaidViewport = pageContent.mermaidViewport;
                    }
                    if (pageType === 'canvas') {
                        page.canvasData = pageContent.canvasData;
                    }
                    if (pageType === 'database') {
                        page.databaseData = pageContent.databaseData;
                    }
                    if (pageType === 'code') {
                        page.codeContent = pageContent.codeContent || '';
                        page.codeType = pageContent.codeType || 'mermaid';
                    }
                    
                    // Apply Google page link data when type matches or content has embedUrl/driveFileId
                    if (googleTypes.includes(pageType) || pageContent.embedUrl || pageContent.driveFileId) {
                        page.embedUrl = pageContent.embedUrl || page.embedUrl;
                        page.webViewLink = pageContent.webViewLink || page.webViewLink;
                        page.driveLinkFileId = page.driveFileId; // page JSON file ID
                        page.driveFileId = pageContent.driveFileId || page.driveFileId; // linked Google file ID
                    }
                }
            }
            
            // Apply sort order from index for each tab
            for (const tab of tabs) {
                const pageOrderForTab = pageOrder[tab.id] || [];
                const pages = tab.pages;
                if (pageOrderForTab.length > 0 && pages.length > 0) {
                    const orderedPages = [];
                    const unorderedPages = [];
                    for (const pageId of pageOrderForTab) {
                        const page = pages.find(p => p.id === pageId);
                        if (page) orderedPages.push(page);
                    }
                    for (const page of pages) {
                        if (!pageOrderForTab.includes(page.id)) {
                            unorderedPages.push(page);
                        }
                    }
                    tab.pages = [...orderedPages, ...unorderedPages];
                    if (tab.pages.length > 0) {
                        tab.activePageId = tab.pages[0].id;
                    }
                }
            }
        }
        
        return {
            notebooks: notebooks
        };
    } catch (error) {
        console.error('Error loading from Drive structure:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Sync a Google page link to Drive (creates a JSON file with metadata)
const syncGooglePageLink = async (page, tabFolderId) => {
    try {
        await ensureAuthenticated();
        
        const fileName = sanitizeFileName(page.name) + '.json';
        const linkContent = {
            type: page.type || 'google-link',
            name: page.name,
            icon: page.icon,
            embedUrl: page.embedUrl,
            webViewLink: page.webViewLink,
            driveFileId: page.driveFileId, // The linked Google file ID
            createdAt: page.createdAt,
            modifiedAt: Date.now()
        };
        
        // If page already has a link file ID, update it
        if (page.driveLinkFileId) {
            try {
                const existing = await gapi.client.drive.files.get({
                    fileId: page.driveLinkFileId,
                    fields: 'id, name, trashed'
                });
                if (!existing.result.trashed) {
                    // File exists, update it
                    const updateMetadata = { name: fileName };
                    const props = {
                        strata_pageType: String(page.type || 'drive'),
                        strata_icon: String(page.icon || '📄')
                    };
                    updateMetadata.properties = props;
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(updateMetadata)], { type: 'application/json' }));
                    form.append('file', new Blob([JSON.stringify(linkContent)], { type: 'application/json' }));
                    
                    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${page.driveLinkFileId}?uploadType=multipart`, {
                        method: 'PATCH',
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        body: form
                    });
                    return page.driveLinkFileId;
                }
            } catch (e) {
                // File doesn't exist, will create new one
            }
        }
        
        // Create new link file
        const metadata = {
            name: fileName,
            parents: [tabFolderId],
            mimeType: 'application/json'
        };
        const props = {
            strata_pageType: String(page.type || 'drive'),
            strata_icon: String(page.icon || '📄')
        };
        metadata.properties = props;
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(linkContent)], { type: 'application/json' }));
        
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create link file: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.id;
    } catch (error) {
        console.error('Error syncing Google page link to Drive:', error);
        throw error;
    }
};

// Helper: Strip HTML tags and get plain text
const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '');
};

// Normalize page content to rows for Docs API
const toRowsForDocs = (content) => {
    if (!content) return [];
    if (content.version === TREE_VER && Array.isArray(content.children)) return apiTreeToRows(content);
    if (Array.isArray(content)) return content;
    if (content.rows && Array.isArray(content.rows)) return content.rows;
    return [];
};

// Helper: Convert block content to Google Docs API requests (accepts tree or rows)
const convertBlocksToDocsRequests = (rowsOrTree) => {
    const rows = Array.isArray(rowsOrTree) ? rowsOrTree : toRowsForDocs(rowsOrTree);
    const requests = [];
    let currentIndex = 1; // Google Docs starts at index 1
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) return requests;
    
    for (const row of rows) {
        if (!row.columns) continue;
        
        for (const column of row.columns) {
            if (!column.blocks) continue;
            
            for (const block of column.blocks) {
                const content = stripHtml(block.content || '');
                if (!content && block.type !== 'divider') continue;
                
                const textToInsert = content + '\n';
                const textLength = textToInsert.length;
                
                switch (block.type) {
                    case 'h1':
                    case 'h2':
                    case 'h3':
                    case 'h4':
                        // Insert text
                        requests.push({
                            insertText: {
                                location: { index: currentIndex },
                                text: textToInsert
                            }
                        });
                        // Apply heading style
                        const headingStyle = {
                            'h1': 'HEADING_1',
                            'h2': 'HEADING_2',
                            'h3': 'HEADING_3',
                            'h4': 'HEADING_4'
                        }[block.type];
                        requests.push({
                            updateParagraphStyle: {
                                range: {
                                    startIndex: currentIndex,
                                    endIndex: currentIndex + textLength
                                },
                                paragraphStyle: {
                                    namedStyleType: headingStyle
                                },
                                fields: 'namedStyleType'
                            }
                        });
                        currentIndex += textLength;
                        break;
                        
                    case 'text':
                        requests.push({
                            insertText: {
                                location: { index: currentIndex },
                                text: textToInsert
                            }
                        });
                        currentIndex += textLength;
                        break;
                        
                    case 'ul':
                        requests.push({
                            insertText: {
                                location: { index: currentIndex },
                                text: textToInsert
                            }
                        });
                        requests.push({
                            createParagraphBullets: {
                                range: {
                                    startIndex: currentIndex,
                                    endIndex: currentIndex + textLength
                                },
                                bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE'
                            }
                        });
                        currentIndex += textLength;
                        break;
                        
                    case 'ol':
                        requests.push({
                            insertText: {
                                location: { index: currentIndex },
                                text: textToInsert
                            }
                        });
                        requests.push({
                            createParagraphBullets: {
                                range: {
                                    startIndex: currentIndex,
                                    endIndex: currentIndex + textLength
                                },
                                bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN'
                            }
                        });
                        currentIndex += textLength;
                        break;
                        
                    case 'todo':
                        const checkbox = block.checked ? '☑ ' : '☐ ';
                        const todoText = checkbox + content + '\n';
                        requests.push({
                            insertText: {
                                location: { index: currentIndex },
                                text: todoText
                            }
                        });
                        currentIndex += todoText.length;
                        break;
                        
                    case 'divider':
                        // Insert a horizontal line using special characters
                        const dividerText = '─'.repeat(50) + '\n';
                        requests.push({
                            insertText: {
                                location: { index: currentIndex },
                                text: dividerText
                            }
                        });
                        currentIndex += dividerText.length;
                        break;
                        
                    case 'image':
                        if (block.url) {
                            const imageText = `[Image: ${block.url}]\n`;
                            requests.push({
                                insertText: {
                                    location: { index: currentIndex },
                                    text: imageText
                                }
                            });
                            currentIndex += imageText.length;
                        }
                        break;
                        
                    case 'video':
                        if (block.url) {
                            const videoText = `[Video: ${block.url}]\n`;
                            requests.push({
                                insertText: {
                                    location: { index: currentIndex },
                                    text: videoText
                                }
                            });
                            currentIndex += videoText.length;
                        }
                        break;
                        
                    case 'link':
                        if (block.url) {
                            const linkText = `${content || block.url}\n`;
                            requests.push({
                                insertText: {
                                    location: { index: currentIndex },
                                    text: linkText
                                }
                            });
                            // Add hyperlink
                            requests.push({
                                updateTextStyle: {
                                    range: {
                                        startIndex: currentIndex,
                                        endIndex: currentIndex + linkText.length - 1
                                    },
                                    textStyle: {
                                        link: { url: block.url }
                                    },
                                    fields: 'link'
                                }
                            });
                            currentIndex += linkText.length;
                        }
                        break;
                        
                    default:
                        // For any other block type, just insert as text
                        if (content) {
                            requests.push({
                                insertText: {
                                    location: { index: currentIndex },
                                    text: textToInsert
                                }
                            });
                            currentIndex += textLength;
                        }
                        break;
                }
            }
        }
    }
    
    return requests;
};

// Create a Google Doc for a block page
const createGoogleDocForPage = async (page, tabFolderId) => {
    try {
        await ensureAuthenticated();
        
        // Step 1: Create a new Google Doc
        const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: page.name || 'Untitled Page'
            })
        });
        
        if (!createResponse.ok) {
            throw new Error(`Failed to create Google Doc: ${createResponse.statusText}`);
        }
        
        const doc = await createResponse.json();
        const docId = doc.documentId;
        
        // Step 2: Convert blocks to Docs API requests and update the document
        const requests = convertBlocksToDocsRequests(page.content || page.rows);
        
        if (requests.length > 0) {
            const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests })
            });
            
            if (!updateResponse.ok) {
                console.error('Failed to update Google Doc content:', await updateResponse.text());
                // Continue anyway - doc was created, just content failed
            }
        }
        
        // Step 3: Move the doc to the tab folder
        // First get current parents, then move
        const fileResponse = await gapi.client.drive.files.get({
            fileId: docId,
            fields: 'parents'
        });
        
        const previousParents = fileResponse.result.parents ? fileResponse.result.parents.join(',') : '';
        
        await gapi.client.drive.files.update({
            fileId: docId,
            addParents: tabFolderId,
            removeParents: previousParents,
            fields: 'id, parents'
        });
        
        return docId;
    } catch (error) {
        console.error('Error creating Google Doc for page:', error);
        throw error;
    }
};

// Update an existing Google Doc with page content
const updateGoogleDoc = async (docId, page) => {
    try {
        await ensureAuthenticated();
        
        // First, get the current document to find the end index
        const getResponse = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!getResponse.ok) {
            throw new Error(`Failed to get Google Doc: ${getResponse.statusText}`);
        }
        
        const doc = await getResponse.json();
        const endIndex = doc.body?.content?.[doc.body.content.length - 1]?.endIndex || 1;
        
        // Delete all content (except the first newline which is required)
        const requests = [];
        if (endIndex > 2) {
            requests.push({
                deleteContentRange: {
                    range: {
                        startIndex: 1,
                        endIndex: endIndex - 1
                    }
                }
            });
        }
        
        // Add new content
        const contentRequests = convertBlocksToDocsRequests(page.content || page.rows);
        requests.push(...contentRequests);
        
        if (requests.length > 0) {
            const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests })
            });
            
            if (!updateResponse.ok) {
                console.error('Failed to update Google Doc:', await updateResponse.text());
            }
        }
        
        // Update title if changed
        await gapi.client.drive.files.update({
            fileId: docId,
            resource: { name: page.name }
        });
        
        return docId;
    } catch (error) {
        console.error('Error updating Google Doc:', error);
        throw error;
    }
};

// Create a Google Drive shortcut to an existing file. Returns null on 404 (file not found).
const createDriveShortcut = async (name, targetFileId, parentFolderId) => {
    try {
        await ensureAuthenticated();
        
        const metadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.shortcut',
            shortcutDetails: {
                targetId: targetFileId
            },
            parents: [parentFolderId]
        };
        
        const response = await gapi.client.drive.files.create({
            resource: metadata,
            fields: 'id, name, shortcutDetails'
        });
        
        return response.result;
    } catch (error) {
        const status = error?.result?.error?.code || error?.status;
        if (status === 404) return null;
        console.error('Error creating Drive shortcut:', error);
        throw error;
    }
};

// Update a Drive shortcut (rename only - target cannot be changed)
const updateDriveShortcut = async (shortcutId, newName) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.update({
            fileId: shortcutId,
            resource: { name: newName },
            fields: 'id, name'
        });
        
        return response.result;
    } catch (error) {
        console.error('Error updating Drive shortcut:', error);
        throw error;
    }
};

// Get a Drive item's metadata. Returns null on 404 (not found or no access).
const getDriveItem = async (itemId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.get({
            fileId: itemId,
            fields: 'id, name, mimeType, trashed'
        });
        
        return response.result;
    } catch (error) {
        const status = error?.result?.error?.code || error?.status;
        if (status === 404) return null;
        console.error('Error getting Drive item:', error);
        throw error;
    }
};

// Rename a Drive item (file or folder)
const renameDriveItem = async (itemId, newName) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.update({
            fileId: itemId,
            resource: { name: newName },
            fields: 'id, name'
        });
        
        return response.result;
    } catch (error) {
        console.error('Error renaming Drive item:', error);
        throw error;
    }
};

// Move a Drive item to a new parent folder
const moveDriveItem = async (itemId, newParentId, oldParentId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.update({
            fileId: itemId,
            addParents: newParentId,
            removeParents: oldParentId,
            fields: 'id, parents'
        });
        
        return response.result;
    } catch (error) {
        console.error('Error moving Drive item:', error);
        throw error;
    }
};

// Delete (trash) a Drive item
const deleteDriveItem = async (itemId) => {
    try {
        await ensureAuthenticated();
        
        // Move to trash instead of permanent delete
        await gapi.client.drive.files.update({
            fileId: itemId,
            resource: { trashed: true }
        });
        
        return true;
    } catch (error) {
        console.error('Error deleting Drive item:', error);
        // Don't throw - deletion failure shouldn't break the app
        return false;
    }
};

// Get a page token to start tracking changes
const getStartPageToken = async () => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.changes.getStartPageToken({});
        return response.result.startPageToken;
    } catch (error) {
        console.error('Error getting start page token:', error);
        throw error;
    }
};

// Get changes since a page token
const getDriveChanges = async (pageToken, rootFolderId) => {
    try {
        await ensureAuthenticated();
        
        const changes = [];
        let nextPageToken = pageToken;
        
        while (nextPageToken) {
            const response = await gapi.client.drive.changes.list({
                pageToken: nextPageToken,
                fields: 'newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, parents, trashed))',
                includeRemoved: true,
                spaces: 'drive'
            });
            
            // Filter changes to only include items under our root folder
            for (const change of response.result.changes || []) {
                if (change.file && change.file.parents) {
                    // Check if this file is under our Strata folder hierarchy
                    changes.push({
                        fileId: change.fileId,
                        removed: change.removed,
                        file: change.file
                    });
                }
            }
            
            nextPageToken = response.result.nextPageToken;
            if (response.result.newStartPageToken) {
                // Return the new token along with changes
                return {
                    changes,
                    newPageToken: response.result.newStartPageToken
                };
            }
        }
        
        return { changes, newPageToken: pageToken };
    } catch (error) {
        console.error('Error getting Drive changes:', error);
        throw error;
    }
};

// List contents of a folder
const listFolderContents = async (folderId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType, modifiedTime)',
            orderBy: 'name'
        });
        
        return response.result.files || [];
    } catch (error) {
        console.error('Error listing folder contents:', error);
        throw error;
    }
};

// List Strata files in a folder with properties field included
const listStrataFiles = async (folderId, queryOptions = {}) => {
    try {
        await ensureAuthenticated();
        
        // Build base query
        const baseQuery = `'${folderId}' in parents and trashed=false`;
        const query = queryOptions.q ? `${baseQuery} and ${queryOptions.q}` : baseQuery;
        
        // Merge queryOptions into list request, ensuring properties field is included
        const listRequest = {
            q: query,
            fields: 'nextPageToken, files(id, name, mimeType, parents, properties)',
            ...queryOptions
        };
        
        // Override fields to ensure properties is always included
        listRequest.fields = 'nextPageToken, files(id, name, mimeType, parents, properties)';
        
        const response = await gapi.client.drive.files.list(listRequest);
        
        return response.result.files || [];
    } catch (error) {
        console.error('Error listing Strata files:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
    }
};

// Get file content
const getFileContent = async (fileId) => {
    try {
        await ensureAuthenticated();
        
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        return JSON.parse(response.body);
    } catch (error) {
        console.error('Error getting file content:', error);
        throw error;
    }
};

// Full sync - sync entire app structure to Drive
const fullSyncToDrive = async (data) => {
    try {
        await ensureAuthenticated();
        
        const rootFolderId = await getOrCreateRootFolder();
        const updatedData = JSON.parse(JSON.stringify(data)); // Deep clone
        
        for (const notebook of updatedData.notebooks) {
            // Sync notebook folder
            const notebookFolderId = await syncNotebookToDrive(notebook, rootFolderId);
            notebook.driveFolderId = notebookFolderId;
            
            for (const tab of notebook.tabs) {
                // Sync tab folder
                const tabFolderId = await syncTabToDrive(tab, notebookFolderId);
                tab.driveFolderId = tabFolderId;
                
                for (const page of tab.pages) {
                    // Sync page file
                    const pageFileId = await syncPageToDrive(page, tabFolderId);
                    page.driveFileId = pageFileId;
                }
            }
        }
        
        return { data: updatedData, rootFolderId };
    } catch (error) {
        console.error('Error in full sync to Drive:', error);
        throw error;
    }
};

// ===== Picker API Functions =====

// Show Google Drive Picker
// mimeTypeFilter: optional MIME type to filter files (e.g., 'application/vnd.google-apps.document')
const showDrivePicker = (callback, mimeTypeFilter = null) => {
    if (typeof google === 'undefined' || !google.picker) {
        console.error('Google Picker API not loaded');
        return;
    }

    if (!accessToken) {
        console.error('Not authenticated');
        return;
    }

    // Recent files view (default/first view)
    const recentView = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED);
    recentView.setIncludeFolders(false);
    
    // My Drive view
    const myDriveView = new google.picker.DocsView();
    myDriveView.setIncludeFolders(true);
    myDriveView.setSelectFolderEnabled(false);
    
    // Shared with Me view
    const sharedView = new google.picker.DocsView();
    sharedView.setOwnedByMe(false);
    sharedView.setIncludeFolders(true);
    
    // Starred view
    const starredView = new google.picker.DocsView();
    starredView.setStarred(true);
    starredView.setIncludeFolders(true);
    
    // Apply MIME type filter if provided
    if (mimeTypeFilter) {
        recentView.setMimeTypes(mimeTypeFilter);
        myDriveView.setMimeTypes(mimeTypeFilter);
        sharedView.setMimeTypes(mimeTypeFilter);
        starredView.setMimeTypes(mimeTypeFilter);
    }

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken)
        .setDeveloperKey(API_KEY)
        .setCallback((data) => {
            if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                const docs = data[google.picker.Response.DOCUMENTS];
                if (docs && docs.length > 0 && callback) {
                    // Get file details from Drive API
                    gapi.client.drive.files.get({
                        fileId: docs[0].id,
                        fields: 'id, name, mimeType, webViewLink'
                    }).then(response => {
                        callback({
                            id: response.result.id,
                            name: response.result.name,
                            mimeType: response.result.mimeType,
                            webViewLink: response.result.webViewLink,
                            url: response.result.webViewLink
                        });
                    }).catch(error => {
                        console.error('Error getting file details:', error);
                        // Fallback to basic info
                        callback({
                            id: docs[0].id,
                            name: docs[0].name,
                            mimeType: docs[0].mimeType,
                            url: docs[0].url
                        });
                    });
                }
            }
        })
        .addView(recentView)   // Recent files shown first
        .addView(myDriveView)  // My Drive
        .addView(sharedView)   // Shared with Me
        .addView(starredView)  // Starred files
        .build();

    picker.setVisible(true);
};

// ===== Portable Backup Functions =====

// Create or update manifest.json in the root folder
const updateManifest = async (data, rootFolderId, appVersion) => {
    try {
        await ensureAuthenticated();
        
        const manifest = {
            version: appVersion || '2.2.0',
            exportedAt: new Date().toISOString(),
            notebooks: data.notebooks.map(nb => ({
                id: nb.id,
                name: nb.name,
                icon: nb.icon || '📓',
                folder: sanitizeFileName(nb.name),
                driveFolderId: nb.driveFolderId,
                tabs: nb.tabs.map(tab => ({
                    id: tab.id,
                    name: tab.name,
                    icon: tab.icon || '📋',
                    color: tab.color || 'blue',
                    folder: sanitizeFileName(tab.name),
                    driveFolderId: tab.driveFolderId,
                    pages: tab.pages.map(page => ({
                        id: page.id,
                        name: page.name,
                        icon: page.icon || '📄',
                        file: sanitizeFileName(page.name) + '.json',
                        type: page.type || 'block',
                        driveFileId: page.driveFileId,
                        // For Google pages, include the link
                        ...(page.embedUrl && { embedUrl: page.embedUrl }),
                        ...(page.webViewLink && { webViewLink: page.webViewLink })
                    }))
                }))
            }))
        };
        
        // Check if manifest.json already exists
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='manifest.json' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        const manifestContent = JSON.stringify(manifest, null, 2);
        const manifestBlob = new Blob([manifestContent], { type: 'application/json' });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Update existing manifest
            const fileId = searchResponse.result.files[0].id;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({ name: 'manifest.json' })], { type: 'application/json' }));
            form.append('file', manifestBlob);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            return fileId;
        } else {
            // Create new manifest
            const metadata = {
                name: 'manifest.json',
                parents: [rootFolderId],
                mimeType: 'application/json'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', manifestBlob);
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            const result = await response.json();
            return result.id;
        }
    } catch (error) {
        console.error('Error updating manifest:', error);
        throw error;
    }
};

// Upload index.html offline viewer to root folder
const uploadIndexHtml = async (htmlContent, rootFolderId) => {
    try {
        await ensureAuthenticated();
        
        // Check if index.html already exists
        const searchResponse = await gapi.client.drive.files.list({
            q: `name='index.html' and '${rootFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
            pageSize: 1
        });
        
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        
        if (searchResponse.result.files && searchResponse.result.files.length > 0) {
            // Update existing index.html
            const fileId = searchResponse.result.files[0].id;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({ name: 'index.html' })], { type: 'application/json' }));
            form.append('file', htmlBlob);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            return fileId;
        } else {
            // Create new index.html
            const metadata = {
                name: 'index.html',
                parents: [rootFolderId],
                mimeType: 'text/html'
            };
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', htmlBlob);
            
            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: form
            });
            
            const result = await response.json();
            return result.id;
        }
    } catch (error) {
        console.error('Error uploading index.html:', error);
        throw error;
    }
};

// Named exports
export {
    loadGapi,
    initGoogleAuth,
    signIn,
    signOut,
    getAccessToken,
    checkAuthStatus,
    handleTokenExpiration,
    getUserInfo,
    createDriveFolder,
    getOrCreateFolder,
    updateDriveFolder,
    deleteDriveFolder,
    uploadFileToDrive,
    getOrCreateRootFolder,
    showDrivePicker,
    // File properties functions
    getFileProperties,
    setFileProperties,
    getFileWithProperties,
    getFileMetadata,
    updateFileProperties,
    createFileWithProperties,
    // UID-based file operations
    setFileUid,
    getFileByUid,
    getAllFilesWithUid,
    // Structure persistence functions
    saveStructure,
    loadStructure,
    // Idempotent save functions
    saveFileIdempotent,
    saveFolderIdempotent,
    // Index file functions
    getIndexFile,
    saveIndexFile,
    // File-System-as-Database save functions
    saveNotebookFolder,
    saveTabFolder,
    savePageFile,
    savePageToDrive,
    deletePageFromDrive,
    syncSortOrder,
    migrateStrataData,
    getOldManifest,
    // Load function
    loadFromDriveStructure,
    // Legacy sync functions (for backward compatibility)
    syncNotebookToDrive,
    syncTabToDrive,
    syncPageToDrive,
    syncGooglePageLink,
    getDriveItem,
    renameDriveItem,
    moveDriveItem,
    deleteDriveItem,
    getStartPageToken,
    getDriveChanges,
    listFolderContents,
    listStrataFiles,
    getFileContent,
    fullSyncToDrive,
    createDriveShortcut,
    updateDriveShortcut,
    // Portable backup functions
    sanitizeFileName,
    updateManifest,
    uploadIndexHtml,
    // Cleanup function
    cleanupAppDataFolder
};

// Default export with all functions
export default {
    loadGapi,
    initGoogleAuth,
    signIn,
    signOut,
    getAccessToken,
    checkAuthStatus,
    handleTokenExpiration,
    getUserInfo,
    createDriveFolder,
    getOrCreateFolder,
    updateDriveFolder,
    deleteDriveFolder,
    uploadFileToDrive,
    getOrCreateRootFolder,
    showDrivePicker,
    getFileProperties,
    setFileProperties,
    getFileWithProperties,
    getFileMetadata,
    updateFileProperties,
    createFileWithProperties,
    setFileUid,
    getFileByUid,
    getAllFilesWithUid,
    saveStructure,
    loadStructure,
    saveFileIdempotent,
    saveFolderIdempotent,
    getIndexFile,
    saveIndexFile,
    saveNotebookFolder,
    saveTabFolder,
    savePageFile,
    savePageToDrive,
    deletePageFromDrive,
    syncSortOrder,
    migrateStrataData,
    getOldManifest,
    loadFromDriveStructure,
    syncNotebookToDrive,
    syncTabToDrive,
    syncPageToDrive,
    syncGooglePageLink,
    getDriveItem,
    renameDriveItem,
    moveDriveItem,
    deleteDriveItem,
    getStartPageToken,
    getDriveChanges,
    listFolderContents,
    listStrataFiles,
    getFileContent,
    fullSyncToDrive,
    createDriveShortcut,
    updateDriveShortcut,
    sanitizeFileName,
    updateManifest,
    uploadIndexHtml,
    cleanupAppDataFolder
};
