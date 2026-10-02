/*
 * Pure helpers for turning a Google Drive file (picked in the Picker or pasted
 * as a URL) into a Strata link page, plus the Picker view configuration.
 * No gapi / google.* access here so everything is unit-testable.
 */

import { detectPageTypeFromMimeType, getEmbedUrlForType, parseEmbedUrl } from './embed-utils';
import { generateId } from './utils';

const GOOGLE_MIME = {
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slide: 'application/vnd.google-apps.presentation',
  form: 'application/vnd.google-apps.form',
  drawing: 'application/vnd.google-apps.drawing',
  folder: 'application/vnd.google-apps.folder',
  pdf: 'application/pdf',
};

/**
 * Ordered, plain descriptions of the Picker views. google-api.js turns them
 * into DocsView instances. Keeping this pure lets ordering and filters be tested.
 */
export function pickerViewSpecs({ startIn = 'recent', mimeTypes = [], query = '' } = {}) {
  const mimes = Array.isArray(mimeTypes) ? mimeTypes.filter(Boolean) : String(mimeTypes || '').split(',').filter(Boolean);
  // A MIME filter must still let folders through, or you cannot navigate into them.
  const withFolders = mimes.length ? [...new Set([...mimes, GOOGLE_MIME.folder])] : [];
  const base = {
    includeFolders: true,
    mode: 'list',
    mimeTypes: withFolders,
    query: (query || '').trim(),
  };
  const specs = [
    { key: 'recent', viewId: 'RECENTLY_PICKED', ...base, includeFolders: false },
    { key: 'mine', ownedByMe: true, ...base },
    { key: 'drive', ...base },
    { key: 'shared', ownedByMe: false, ...base },
    { key: 'drives', enableDrives: true, ...base },
    { key: 'starred', starred: true, ...base },
  ];
  const idx = specs.findIndex((s) => s.key === startIn);
  if (idx > 0) {
    const [first] = specs.splice(idx, 1);
    specs.unshift(first);
  }
  return specs;
}

/** Embed URL for a Drive file of a known page type. Sites embed their own web URL. */
export function buildEmbedUrlForDriveFile(type, fileId, webViewLink) {
  if (type === 'site') {
    return (webViewLink || '').split('?')[0] || `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return getEmbedUrlForType(type, fileId);
}

/**
 * Page object for a Drive file described by `{ id, name, mimeType, webViewLink | url }`
 * (the shape the Picker callback and files.get produce).
 */
export function buildDrivePage(file, overrides = {}) {
  const { type, icon, typeName } = detectPageTypeFromMimeType(file.mimeType || '');
  const webViewLink = file.webViewLink || file.url;
  const now = Date.now();
  return {
    id: generateId(),
    name: file.name || `Google ${typeName}`,
    type,
    embedUrl: buildEmbedUrlForDriveFile(type, file.id, webViewLink),
    driveFileId: file.id,
    webViewLink,
    mimeType: file.mimeType,
    icon,
    createdAt: now,
    modifiedAt: now,
    ...overrides,
  };
}

/** The generic name a pasted URL gets when Drive will not tell us the real one. */
export function defaultPageNameFor(parsed) {
  if (!parsed) return 'Page';
  if (parsed.isGoogleService) return parsed.type === 'site' ? 'Google Site' : `Google ${parsed.typeName}`;
  return parsed.typeName;
}

/**
 * Page object for a pasted URL. When Drive metadata is known, a generic
 * drive.google.com/file/d/... link is upgraded to the real type (PDF, Doc…).
 */
export function buildPageFromParsedUrl(rawUrl, parsed, { name, mimeType } = {}) {
  if (!parsed) return null;
  let { type, icon, embedUrl, fileId } = parsed;
  if (mimeType && type === 'drive' && fileId) {
    const detected = detectPageTypeFromMimeType(mimeType);
    if (detected.type !== 'drive') {
      type = detected.type;
      icon = detected.icon;
      embedUrl = buildEmbedUrlForDriveFile(type, fileId, rawUrl);
    }
  }
  const now = Date.now();
  const pageName = (name || '').trim() || defaultPageNameFor(parsed);
  return {
    id: generateId(),
    name: pageName,
    type,
    embedUrl,
    ...(fileId && { driveFileId: fileId }),
    webViewLink: rawUrl,
    ...(parsed.originalUrl && { originalUrl: parsed.originalUrl }),
    ...(type === 'pdf' && !fileId && !parsed.originalUrl && { originalUrl: rawUrl }),
    ...(mimeType && { mimeType }),
    icon,
    createdAt: now,
    modifiedAt: now,
  };
}

/**
 * Parse a pasted URL and, for Google files, ask Drive for the file's metadata.
 * `fetchMeta(fileId)` resolves to `{ name, mimeType, ... }`, or null when the
 * drive.file scope does not cover the file (Strata neither created nor picked it).
 * Never throws.
 *
 * @returns {Promise<{ parsed: Object|null, meta: Object|null, suggestedName: string, metaStatus: 'none'|'found'|'not-granted'|'error' }>}
 */
export async function resolvePastedDriveUrl(rawUrl, fetchMeta) {
  const parsed = parseEmbedUrl(rawUrl);
  if (!parsed) return { parsed: null, meta: null, suggestedName: '', metaStatus: 'none' };
  const fallback = defaultPageNameFor(parsed);
  if (!parsed.fileId || !parsed.isGoogleService || typeof fetchMeta !== 'function') {
    return { parsed, meta: null, suggestedName: fallback, metaStatus: 'none' };
  }
  try {
    const meta = await fetchMeta(parsed.fileId);
    if (!meta) return { parsed, meta: null, suggestedName: fallback, metaStatus: 'not-granted' };
    return { parsed, meta, suggestedName: meta.name || fallback, metaStatus: 'found' };
  } catch {
    return { parsed, meta: null, suggestedName: fallback, metaStatus: 'error' };
  }
}

/**
 * Combine the Picker's own document records with the results of per-file
 * files.get lookups (Promise.allSettled shape). Metadata wins; the Picker
 * record is the fallback for files Drive will not describe to the app.
 */
export function mergePickedDocs(docs, settled = []) {
  return (docs || []).map((doc, i) => {
    const result = settled[i];
    const meta = result?.status === 'fulfilled' && result.value ? result.value : null;
    const webViewLink = meta?.webViewLink || doc.url || null;
    return {
      id: meta?.id || doc.id,
      name: meta?.name || doc.name || '',
      mimeType: meta?.mimeType || doc.mimeType || '',
      webViewLink,
      url: webViewLink,
      iconLink: meta?.iconLink || doc.iconUrl || null,
    };
  });
}
