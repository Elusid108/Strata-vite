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
import { DEBUG_SYNC, APP_VERSION, LINK_PAGE_TYPES } from './constants';
import { pageFromDriveJson } from './sync-merge';
import { applyIndexOrder } from './sync-pull';
import { getDriveErrorMessage } from './sync-errors';

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

// Local storage keys for persistence (survives tab closure)
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
                
                // Save token to localStorage for persistence (expires in ~1 hour)
                const expiryTime = Date.now() + (response.expires_in * 1000);
                localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
                localStorage.setItem(STORAGE_KEY_EXPIRY, expiryTime.toString());

                // Resolve the pending sign-in promise
                if (signInResolver) {
                    try {
                        const userInfo = await getUserInfo();
                        // Save user info to localStorage
                        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userInfo));
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
    // Clear local storage
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
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

        // First check localStorage for saved token
        const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        const savedExpiry = localStorage.getItem(STORAGE_KEY_EXPIRY);
        const savedUser = localStorage.getItem(STORAGE_KEY_USER);
        
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
                    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userInfo));
                    return userInfo;
                } catch (e) {
                    // Token invalid, clear storage
                    signOut();
                    return null;
                }
            } else {
                if (tokenClient) {
                    return new Promise((resolve) => {
                        signInResolver = resolve;
                        signInRejecter = () => resolve(null);
                        tokenClient.requestAccessToken({ prompt: '' });
                    });
                }
                return null;
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

// Silent token refresh that actually waits for the new token (or a definite
// failure). Only one refresh runs at a time; concurrent callers share it.
let refreshPromise = null;
const REFRESH_TIMEOUT_MS = 20000;

const refreshAccessToken = async () => {
    if (refreshPromise) return refreshPromise;
    if (!tokenClient) {
        try {
            await initGoogleAuth();
        } catch {
            return false;
        }
    }
    refreshPromise = new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signInResolver = null;
            signInRejecter = null;
            refreshPromise = null;
            resolve(ok);
        };
        const timer = setTimeout(() => finish(false), REFRESH_TIMEOUT_MS);
        signInResolver = () => finish(true);
        signInRejecter = () => finish(false);
        try {
            tokenClient.requestAccessToken({ prompt: '' });
        } catch (error) {
            console.error('Token refresh failed:', error);
            finish(false);
        }
    });
    return refreshPromise;
};

const getTokenExpiry = () => {
    const raw = localStorage.getItem(STORAGE_KEY_EXPIRY);
    const value = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(value) ? value : 0;
};

// Handle token expiration
const handleTokenExpiration = async () => {
    try {
        return await refreshAccessToken();
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
        .replace(/[<>:"/\\|*]/g, '-')  // Replace invalid chars with dash
        .replace(/\s+/g, ' ')            // Normalize whitespace
        .replace(/^\.+/, '')             // Remove leading dots
        .replace(/\.+$/, '')             // Remove trailing dots
        .trim()
        .substring(0, 200);              // Limit length
};

class DriveRequestError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'DriveRequestError';
        this.status = status;
    }
}

const etagFromResponse = (response) => {
    if (!response) return null;
    const headers = response.headers;
    if (!headers) return null;
    if (typeof headers.get === 'function') {
        return headers.get('ETag') || headers.get('etag') || null;
    }
    return headers.ETag || headers.etag || headers['ETag'] || headers['etag'] || null;
};

// Error text extraction lives in sync-errors.js (pure, unit-tested); re-exported below for existing callers.

const toStrataProperties = (properties = {}) => {
    const props = {};
    if (properties.appId !== undefined) props.strata_appId = String(properties.appId);
    if (properties.pageType !== undefined) props.strata_pageType = String(properties.pageType);
    if (properties.icon !== undefined) props.strata_icon = String(properties.icon);
    if (properties.tabColor !== undefined) props.strata_tabColor = String(properties.tabColor);
    if (properties.strata_appId) props.strata_appId = String(properties.strata_appId);
    return props;
};

const driveMultipartUpload = async ({ fileId, metadata, content, etag }) => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    if (content !== null && content !== undefined) {
        const blob = content instanceof Blob ? content : new Blob([typeof content === 'string' ? content : JSON.stringify(content)], { type: metadata.mimeType || 'application/json' });
        form.append('file', blob);
    }
    const isUpdate = !!fileId;
    const url = isUpdate
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    if (isUpdate && etag) headers['If-Match'] = etag;
    const response = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers,
        body: form
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new DriveRequestError(getDriveErrorMessage({ message: text || response.statusText }), response.status);
    }
    const result = await response.json();
    return { ...result, etag: etagFromResponse(response) || result.etag };
};

const escapeQueryValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Server-side property match: works for tabs with any number of files.
const findFileByAppId = async (parentId, appId, mimeType = null) => {
    if (!parentId || !appId) return null;
    await ensureAuthenticated();
    let q = `'${parentId}' in parents and trashed=false and properties has { key='strata_appId' and value='${escapeQueryValue(appId)}' }`;
    if (mimeType) q += ` and mimeType='${mimeType}'`;
    const response = await gapi.client.drive.files.list({
        q,
        fields: 'files(id, name, properties, mimeType)',
        pageSize: 10
    });
    const files = response.result.files || [];
    return files.find((file) => (file.properties || {}).strata_appId === String(appId)) || null;
};

const createFolderWithAppId = async (name, parentId, appId, properties = {}) => {
    await ensureAuthenticated();
    const fileMetadata = {
        name: sanitizeFileName(name),
        mimeType: 'application/vnd.google-apps.folder',
        properties: toStrataProperties({ ...properties, appId })
    };
    if (parentId) fileMetadata.parents = [parentId];
    const response = await gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name, properties'
    });
    return { id: response.result.id, etag: etagFromResponse(response) };
};

const updateFolderExact = async (folderId, name, properties = {}) => {
    await ensureAuthenticated();
    const metadata = { name: sanitizeFileName(name) };
    const props = toStrataProperties(properties);
    if (Object.keys(props).length > 0) metadata.properties = props;
    const response = await gapi.client.drive.files.update({
        fileId: folderId,
        resource: metadata,
        fields: 'id, name'
    });
    return { id: response.result.id, etag: etagFromResponse(response) };
};

const getFileEtag = async (fileId) => {
    await ensureAuthenticated();
    const response = await gapi.client.drive.files.get({
        fileId,
        fields: 'id, trashed, name, modifiedTime'
    });
    return { ...response.result, etag: etagFromResponse(response) };
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

// ----- Root-folder system files (index / manifest / offline viewer) -----
// Their Drive IDs are cached so a structural change costs one PATCH instead
// of a list query plus an upload for each file.
const ROOT_FILES_KEY = 'strata_root_files';

const readRootFileIds = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(ROOT_FILES_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const rememberRootFileId = (rootFolderId, name, id) => {
    const all = readRootFileIds();
    all[rootFolderId] = { ...(all[rootFolderId] || {}), [name]: id };
    try {
        localStorage.setItem(ROOT_FILES_KEY, JSON.stringify(all));
    } catch {
        /* quota */
    }
};

const forgetRootFileId = (rootFolderId, name) => {
    const all = readRootFileIds();
    if (all[rootFolderId]) {
        delete all[rootFolderId][name];
        try {
            localStorage.setItem(ROOT_FILES_KEY, JSON.stringify(all));
        } catch {
            /* quota */
        }
    }
};

const lookupRootFileId = async (rootFolderId, name) => {
    const response = await gapi.client.drive.files.list({
        q: `name='${name}' and '${rootFolderId}' in parents and trashed=false`,
        fields: 'files(id)',
        pageSize: 1
    });
    const found = response.result.files?.[0]?.id || null;
    if (found) rememberRootFileId(rootFolderId, name, found);
    return found;
};

/**
 * Create-or-update a system file in the root folder by name.
 * Uses the cached file id first; falls back to a lookup on 404.
 */
const upsertRootFile = async (rootFolderId, name, content, mimeType) => {
    await ensureAuthenticated();
    const blob = new Blob([content], { type: mimeType });
    const cachedId = readRootFileIds()[rootFolderId]?.[name] || null;
    const fileId = cachedId || (await lookupRootFileId(rootFolderId, name));

    if (fileId) {
        try {
            const result = await driveMultipartUpload({ fileId, metadata: { name }, content: blob });
            return result.id || fileId;
        } catch (error) {
            if (error.status !== 404) throw error;
            forgetRootFileId(rootFolderId, name);
        }
    }
    const created = await driveMultipartUpload({
        metadata: { name, parents: [rootFolderId], mimeType },
        content: blob
    });
    rememberRootFileId(rootFolderId, name, created.id);
    return created.id;
};

// Save index file (strata_index.json) to root folder
const saveIndexFile = async (rootFolderId, indexData) => {
    try {
        return await upsertRootFile(rootFolderId, 'strata_index.json', JSON.stringify(indexData, null, 2), 'application/json');
    } catch (error) {
        console.error('Error saving index file:', error);
        if (error.status === 401 || error.message?.includes('Authentication')) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
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

const buildPageJsonContent = (page) => {
    const contentToSave = (page.content && page.content.version === TREE_VER) ? page.content : (page.rows || page.content);
    const pageContent = {
        id: page.id,
        type: page.type || 'block',
        name: page.name,
        icon: page.icon,
        cover: page.cover,
        content: contentToSave,
        googleFileId: page.googleFileId,
        url: page.url,
        embedUrl: page.embedUrl,
        webViewLink: page.webViewLink,
        originalUrl: page.originalUrl,
        driveFileId: page.driveFileId,
        createdAt: page.createdAt,
        modifiedAt: page.modifiedAt || Date.now(),
        starred: page.starred || false
    };
    if (page.type === 'mermaid' || page.type === 'code') {
        const codeVal = page.code ?? page.mermaidCode ?? page.codeContent ?? '';
        pageContent.code = codeVal;
        pageContent.mermaidCode = page.mermaidCode ?? (page.codeType === 'mermaid' ? codeVal : '');
        pageContent.codeType = page.codeType || 'mermaid';
        if (page.mermaidViewport) pageContent.mermaidViewport = page.mermaidViewport;
    }
    if (page.type === 'canvas') pageContent.canvasData = page.canvasData;
    if (page.type === 'database') pageContent.databaseData = page.databaseData;
    return pageContent;
};

const buildLinkJsonContent = (page) => ({
    id: page.id,
    type: page.type || 'google-link',
    name: page.name,
    icon: page.icon,
    embedUrl: page.embedUrl,
    webViewLink: page.webViewLink,
    originalUrl: page.originalUrl,
    driveFileId: page.driveFileId,
    starred: page.starred || false,
    createdAt: page.createdAt,
    modifiedAt: page.modifiedAt || Date.now()
});

const writeJsonFile = async ({ fileId, parentId, name, content, properties, etag }) => {
    await ensureAuthenticated();
    const metadata = {
        name: sanitizeFileName(name),
        properties: toStrataProperties(properties)
    };
    if (!fileId) {
        metadata.mimeType = 'application/json';
        if (parentId) metadata.parents = [parentId];
    }
    try {
        const result = await driveMultipartUpload({
            fileId,
            metadata,
            content,
            etag
        });
        return { id: result.id || fileId, etag: result.etag };
    } catch (error) {
        if (error.status === 412 && fileId) {
            // Someone else wrote this file since we last read it. Do NOT blindly
            // overwrite: hand the remote version back so the sync engine can merge.
            const latest = await getFileEtag(fileId);
            let remote = null;
            try {
                remote = await getFileContent(fileId);
            } catch {
                remote = null;
            }
            const conflict = new DriveRequestError('Remote file changed', 412);
            conflict.remote = remote;
            conflict.etag = latest.etag;
            throw conflict;
        }
        throw error;
    }
};

/**
 * @param {Object} page
 * @param {string} tabFolderId
 * @param {{ etag?: string|null }} [opts] - override the etag (used after a conflict merge)
 */
const writePageJson = async (page, tabFolderId, opts = {}) => {
    const fileName = sanitizeFileName(page.name) + '.json';
    const properties = { pageType: page.type || 'block', appId: page.id, icon: page.icon };
    return writeJsonFile({
        fileId: page.driveFileId,
        parentId: tabFolderId,
        name: fileName,
        content: buildPageJsonContent(page),
        properties,
        etag: opts.etag !== undefined ? opts.etag : page.driveEtag
    });
};

const writeLinkJson = async (page, tabFolderId, opts = {}) => {
    const fileName = sanitizeFileName(page.name) + '.json';
    const properties = { pageType: page.type || 'drive', appId: page.id, icon: page.icon || '📄' };
    return writeJsonFile({
        fileId: page.driveLinkFileId,
        parentId: tabFolderId,
        name: fileName,
        content: buildLinkJsonContent(page),
        properties,
        etag: opts.etag !== undefined ? opts.etag : page.driveEtag
    });
};

// Legacy sync functions (kept for backward compatibility during transition)

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
// List every page of a files.list query.
const listAllFiles = async (params) => {
    const files = [];
    let pageToken;
    do {
        const response = await gapi.client.drive.files.list({ ...params, pageSize: 1000, pageToken });
        files.push(...(response.result.files || []));
        pageToken = response.result.nextPageToken;
    } while (pageToken);
    return files;
};

/**
 * Fast boot listing: two Drive queries (all Strata folders, all Strata page
 * files) instead of one per notebook and tab. Page bodies are fetched only
 * when Drive's modifiedTime differs from what the local cache already holds.
 *
 * Returns null when the workspace predates strata_appId properties, so the
 * caller can fall back to the folder walk.
 */
const loadFromDriveFast = async (rootFolderId, { knownPages = new Map() } = {}) => {
    await ensureAuthenticated();
    const indexData = await getIndexFile(rootFolderId);

    const folderFields = 'nextPageToken, files(id, name, parents, properties)';
    const [taggedFolders, rootFolders] = await Promise.all([
        listAllFiles({ q: "mimeType='application/vnd.google-apps.folder' and trashed=false and properties has { key='strata_appId' }", fields: folderFields }),
        listAllFiles({ q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: folderFields }),
    ]);
    const folderById = new Map();
    for (const f of [...taggedFolders, ...rootFolders]) folderById.set(f.id, f);

    const notebookFolders = [...folderById.values()].filter((f) => (f.parents || []).includes(rootFolderId) && f.name !== '_STRATA_TRASH');
    if (notebookFolders.length === 0) {
        return { notebooks: [], complete: true };
    }
    const notebookIds = new Set(notebookFolders.map((f) => f.id));
    let tabFolders = [...folderById.values()].filter((f) => (f.parents || []).some((p) => notebookIds.has(p)));

    // Legacy notebooks whose tab folders carry no strata_appId: list them directly.
    const notebooksWithTabs = new Set(tabFolders.flatMap((f) => f.parents || []));
    const bare = notebookFolders.filter((f) => !notebooksWithTabs.has(f.id));
    if (bare.length > 0 && taggedFolders.length === 0) return null; // fully legacy workspace
    for (const nb of bare) {
        const extra = await listAllFiles({ q: `'${nb.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: folderFields });
        tabFolders = tabFolders.concat(extra);
    }
    const tabIds = new Set(tabFolders.map((f) => f.id));

    const pageFields = 'nextPageToken, files(id, name, parents, properties, modifiedTime)';
    let pageFiles = (await listAllFiles({ q: "mimeType='application/json' and trashed=false and properties has { key='strata_appId' }", fields: pageFields }))
        .filter((f) => (f.parents || []).some((p) => tabIds.has(p)));
    const tabsWithPages = new Set(pageFiles.flatMap((f) => f.parents || []));
    for (const tab of tabFolders) {
        if (tabsWithPages.has(tab.id)) continue;
        const extra = await listAllFiles({ q: `'${tab.id}' in parents and mimeType='application/json' and trashed=false`, fields: pageFields });
        pageFiles = pageFiles.concat(extra.filter((f) => !['strata_index.json', 'manifest.json', 'index.html'].includes(f.name)));
    }

    // Fetch bodies only for files we do not already hold at this modifiedTime.
    const toFetch = pageFiles.filter((f) => {
        const known = knownPages.get(f.id);
        return !(known && known.driveModifiedTime && known.driveModifiedTime === f.modifiedTime);
    });
    const contents = new Map();
    const BATCH_SIZE = 10;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (f) => {
            try {
                const res = await gapi.client.drive.files.get({ fileId: f.id, alt: 'media' });
                return [f.id, JSON.parse(res.body)];
            } catch (error) {
                console.error(`Error loading page ${f.name}:`, error);
                return [f.id, null];
            }
        }));
        for (const [id, json] of results) if (json) contents.set(id, json);
    }
    if (DEBUG_SYNC) console.log('[Strata Sync] loadFromDriveFast', { notebooks: notebookFolders.length, tabs: tabFolders.length, pages: pageFiles.length, fetched: toFetch.length });

    const notebooks = notebookFolders.map((folder) => {
        const props = folder.properties || {};
        return {
            id: props.strata_appId || `nb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: folder.name,
            icon: props.strata_icon || '📓',
            driveFolderId: folder.id,
            driveEtag: null,
            tabs: [],
            activeTabId: null,
        };
    });
    const nbByFolder = new Map(notebooks.map((nb) => [nb.driveFolderId, nb]));
    const tabByFolder = new Map();
    for (const folder of tabFolders) {
        const parent = (folder.parents || []).map((p) => nbByFolder.get(p)).find(Boolean);
        if (!parent) continue;
        const props = folder.properties || {};
        const tab = {
            id: props.strata_appId || `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: folder.name,
            icon: props.strata_icon || '📋',
            color: props.strata_tabColor || 'blue',
            driveFolderId: folder.id,
            driveEtag: null,
            pages: [],
            activePageId: null,
        };
        parent.tabs.push(tab);
        tabByFolder.set(folder.id, tab);
    }
    for (const file of pageFiles) {
        const tab = (file.parents || []).map((p) => tabByFolder.get(p)).find(Boolean);
        if (!tab) continue;
        const known = knownPages.get(file.id);
        const json = contents.get(file.id);
        const props = file.properties || {};
        let page;
        if (json) {
            page = pageFromDriveJson(
                json,
                { id: props.strata_appId || json.id, icon: props.strata_icon, type: props.strata_pageType },
                { jsonFileId: file.id, modifiedTime: file.modifiedTime }
            );
            if (props.strata_icon && !json.icon) page.icon = props.strata_icon;
        } else if (known) {
            page = JSON.parse(JSON.stringify(known));
        } else {
            continue; // body could not be read; the pull loop will retry later
        }
        tab.pages.push(page);
    }
    for (const nb of notebooks) {
        nb.tabs.sort((a, b) => a.name.localeCompare(b.name));
        nb.activeTabId = nb.tabs[0]?.id || null;
        for (const tab of nb.tabs) {
            tab.pages.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            tab.activePageId = tab.pages[0]?.id || null;
        }
    }
    notebooks.sort((a, b) => a.name.localeCompare(b.name));
    const ordered = applyIndexOrder({ notebooks }, indexData);
    return { notebooks: ordered.notebooks, complete: true };
};

const loadFromDriveStructure = async (rootFolderId, opts = {}) => {
    try {
        const fast = await loadFromDriveFast(rootFolderId, opts);
        if (fast) return fast;
    } catch (error) {
        console.error('Fast Drive load failed, falling back to folder walk:', error);
        if (error.status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
    }
    return loadFromDriveStructureLegacy(rootFolderId);
};

const loadFromDriveStructureLegacy = async (rootFolderId) => {
    try {
        await ensureAuthenticated();
        if (DEBUG_SYNC) console.log('[Strata Sync] loadFromDriveStructure: start', { rootFolderId });
        
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
            if (folder.name === '_STRATA_TRASH') continue;
            const props = folder.properties || {};
            const notebook = {
                id: props.strata_appId || `nb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: folder.name,
                icon: props.strata_icon || '📓',
                driveFolderId: folder.id,
                driveEtag: folder.etag,
                tabs: [],
                activeTabId: null
            };
            
            notebooks.push(notebook);
            notebookMap.set(folder.id, notebook);
        }
        if (DEBUG_SYNC) console.log('[Strata Sync] loadFromDriveStructure: notebook folders', { count: notebooks.length, names: notebooks.map(n => n.name), hasIndex: !!indexData });
        
        // Apply sort order from index (index uses Drive IDs for matching across reloads)
        if (notebookOrder.length > 0) {
            const orderedNotebooks = [];
            const unorderedNotebooks = [];
            
            for (const driveFolderId of notebookOrder) {
                const nb = notebooks.find(n => n.driveFolderId === driveFolderId);
                if (nb) orderedNotebooks.push(nb);
            }
            
            for (const nb of notebooks) {
                if (!notebookOrder.includes(nb.driveFolderId)) {
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
                    id: props.strata_appId || `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: folder.name,
                    icon: props.strata_icon || '📋',
                    color: props.strata_tabColor || 'blue',
                    driveFolderId: folder.id,
                    driveEtag: folder.etag,
                    pages: [],
                    activePageId: null
                };
                
                tabs.push(tab);
                tabMap.set(folder.id, tab);
            }
            
            // Apply sort order from index (keyed by notebook driveFolderId)
            const tabOrderForNotebook = tabOrder[notebook.driveFolderId] || [];
            if (tabOrderForNotebook.length > 0) {
                const orderedTabs = [];
                const unorderedTabs = [];
                
                for (const tabDriveFolderId of tabOrderForNotebook) {
                    const tab = tabs.find(t => t.driveFolderId === tabDriveFolderId);
                    if (tab) orderedTabs.push(tab);
                }
                
                for (const tab of tabs) {
                    if (!tabOrderForNotebook.includes(tab.driveFolderId)) {
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
                    fields: 'files(id, name, properties, modifiedTime)',
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
                        id: props.strata_appId || `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: file.name.replace('.json', ''),
                        type: pageType,
                        icon: icon,
                        driveFileId: file.id,
                        driveEtag: file.etag,
                        driveModifiedTime: file.modifiedTime || null,
                        rows: [],
                        content: [],
                        cover: null,
                        googleFileId: null,
                        url: null,
                        createdAt: Date.now(),
                        // 0 means "unknown"; a real local edit will always be newer.
                        modifiedAt: 0,
                        driveModifiedAt: 0
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
                    if (!pageContent) {
                        if (DEBUG_SYNC) console.log('[Strata Sync] loadFromDriveStructure: batch fetch null content', { pageName: page.name });
                        continue;
                    }
                    if (pageContent.id) page.id = pageContent.id;
                    
                    // Derive page type from content when file properties lack it (fix for existing link files)
                    const googleTypes = LINK_PAGE_TYPES;
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
                    page.modifiedAt = pageContent.modifiedAt || 0;
                    page.driveModifiedAt = page.modifiedAt;
                    page.starred = pageContent.starred || false;
                    
                    if (pageType === 'mermaid' || pageType === 'code') {
                        const codeVal = pageContent.code ?? pageContent.codeContent ?? pageContent.mermaidCode ?? '';
                        page.code = codeVal;
                        page.mermaidCode = pageContent.mermaidCode ?? (pageContent.codeType === 'mermaid' ? codeVal : '');
                        page.codeType = pageContent.codeType || 'mermaid';
                        page.mermaidViewport = pageContent.mermaidViewport;
                        page.codeContent = pageContent.codeContent ?? codeVal;
                    }
                    if (pageType === 'canvas') {
                        page.canvasData = pageContent.canvasData;
                    }
                    if (pageType === 'database') {
                        page.databaseData = pageContent.databaseData;
                    }
                    
                    // Always apply embed URLs if they exist in the JSON content, regardless of the explicit type string.
                    if (pageContent.embedUrl || pageContent.originalUrl || pageContent.webViewLink || googleTypes.includes(pageType)) {
                        page.embedUrl = pageContent.embedUrl || page.embedUrl;
                        page.originalUrl = pageContent.originalUrl || page.originalUrl;
                        page.webViewLink = pageContent.webViewLink || page.webViewLink;
                        page.driveLinkFileId = page.driveFileId; // page JSON file ID
                        page.driveFileId = pageContent.driveFileId || page.driveFileId; // linked Google file ID
                        
                        // Force the type from URL if metadata was lost
                        if (page.embedUrl) {
                            if (page.embedUrl.includes('lucid.app')) page.type = 'lucidchart';
                            else if (page.embedUrl.includes('miro.com')) page.type = 'miro';
                            else if (page.embedUrl.includes('draw.io') || page.embedUrl.includes('diagrams.net')) page.type = 'drawio';
                        }
                    }
                }
            }
            
            // Apply sort order from index for each tab (keyed by tab driveFolderId, page Drive file IDs)
            for (const tab of tabs) {
                const pageOrderForTab = pageOrder[tab.driveFolderId] || [];
                const pages = tab.pages;
                if (pageOrderForTab.length > 0 && pages.length > 0) {
                    const orderedPages = [];
                    const unorderedPages = [];
                    for (const pageDriveFileId of pageOrderForTab) {
                        const page = pages.find(p => p.driveLinkFileId === pageDriveFileId || p.driveFileId === pageDriveFileId);
                        if (page) orderedPages.push(page);
                    }
                    for (const page of pages) {
                        const pageFileId = page.driveLinkFileId || page.driveFileId;
                        if (!pageOrderForTab.includes(pageFileId) && !pageOrderForTab.includes(page.driveFileId) && !pageOrderForTab.includes(page.driveLinkFileId)) {
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
        
        const totalPages = notebooks.reduce((sum, nb) => sum + nb.tabs.reduce((s, t) => s + t.pages.length, 0), 0);
        if (DEBUG_SYNC) console.log('[Strata Sync] loadFromDriveStructure: complete', { notebookCount: notebooks.length, totalPages });
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
        const status = error.status || error.result?.error?.code;
        if (status === 404) {
            return true;
        }
        console.error('Error deleting Drive item:', error);
        if (status === 401) {
            await handleTokenExpiration();
            throw new Error('Authentication expired');
        }
        throw error;
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
                fields: 'newStartPageToken, nextPageToken, changes(fileId, removed, time, file(id, name, mimeType, parents, trashed, modifiedTime, properties))',
                includeRemoved: true,
                spaces: 'drive',
                pageSize: 500
            });

            // Keep every change (removed ones carry no `file`); the caller
            // decides relevance against its own known-ID set.
            for (const change of response.result.changes || []) {
                changes.push({
                    fileId: change.fileId,
                    removed: !!change.removed,
                    time: change.time,
                    file: change.file || null
                });
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
            version: appVersion || APP_VERSION,
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
        
        return await upsertRootFile(rootFolderId, 'manifest.json', JSON.stringify(manifest, null, 2), 'application/json');
    } catch (error) {
        console.error('Error updating manifest:', error);
        throw error;
    }
};

// Upload index.html offline viewer to root folder
const uploadIndexHtml = async (htmlContent, rootFolderId) => {
    try {
        return await upsertRootFile(rootFolderId, 'index.html', htmlContent, 'text/html');
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
    refreshAccessToken,
    getTokenExpiry,
    getUserInfo,
    getOrCreateRootFolder,
    showDrivePicker,
    getFileEtag,
    findFileByAppId,
    createFolderWithAppId,
    updateFolderExact,
    writePageJson,
    writeLinkJson,
    DriveRequestError,
    getDriveErrorMessage,
    getIndexFile,
    saveIndexFile,
    loadFromDriveStructure,
    renameDriveItem,
    moveDriveItem,
    deleteDriveItem,
    getStartPageToken,
    getDriveChanges,
    getFileContent,
    sanitizeFileName,
    updateManifest,
    uploadIndexHtml,
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
    refreshAccessToken,
    getTokenExpiry,
    getUserInfo,
    getOrCreateRootFolder,
    showDrivePicker,
    getFileEtag,
    findFileByAppId,
    createFolderWithAppId,
    updateFolderExact,
    writePageJson,
    writeLinkJson,
    DriveRequestError,
    getDriveErrorMessage,
    getIndexFile,
    saveIndexFile,
    loadFromDriveStructure,
    renameDriveItem,
    moveDriveItem,
    deleteDriveItem,
    getStartPageToken,
    getDriveChanges,
    getFileContent,
    sanitizeFileName,
    updateManifest,
    uploadIndexHtml,
};
