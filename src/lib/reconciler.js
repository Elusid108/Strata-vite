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

// Reconciler Module: pure helpers over the in-memory tree.
// (The old scanner-style orphan cleanup was removed: it caused data loss with a
// stale cache. Deletes go through the outbox tombstones and the pull loop.)

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
 * Reconcile a single page to ensure Code/Mermaid pages have expected shape
 * @param {Object} page - Page object
 * @returns {Object} Reconciled page with normalized code fields
 */
const reconcilePage = (page) => {
    if (!page) return page;
    if (page.type !== 'mermaid' && page.type !== 'code') return page;
    const codeVal = page.code ?? page.mermaidCode ?? page.codeContent ?? '';
    return {
        ...page,
        code: codeVal,
        mermaidCode: page.mermaidCode ?? (page.codeType === 'mermaid' ? codeVal : ''),
        codeType: page.codeType || 'mermaid',
        mermaidViewport: page.mermaidViewport || { x: 0, y: 0, scale: 1 }
    };
};

/**
 * Reconcile full data structure - ensures all Code/Mermaid pages have normalized fields
 * @param {Object} data - App data ({ notebooks: [...] })
 * @returns {Object} Reconciled data
 */
const reconcileData = (data) => {
    if (!data?.notebooks) return data;
    return {
        ...data,
        notebooks: data.notebooks.map(nb => ({
            ...nb,
            tabs: (nb.tabs || []).map(tab => ({
                ...tab,
                pages: (tab.pages || []).map(reconcilePage)
            }))
        }))
    };
};

export { collectKnownDriveIds, reconcilePage, reconcileData };

export default { collectKnownDriveIds, reconcilePage, reconcileData };
