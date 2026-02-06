/**
 * Google Drive Embed URL Parsing and Type Detection Utilities
 */

/**
 * Parse a URL and return page metadata for embedding
 * @param {string} rawUrl - The URL to parse
 * @returns {Object|null} Parsed embed data or null if invalid
 */
export const parseEmbedUrl = (rawUrl) => {
  if (!rawUrl) return null;
  
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  let fileId = null;
  let pageType = 'drive';
  let icon = '📁';
  let typeName = 'File';
  let embedUrl = null;
  
  // PDF: direct .pdf link
  if (/\.pdf(\?|#|$)/i.test(url)) {
    embedUrl = `https://drive.google.com/viewerng/viewer?embedded=true&url=${encodeURIComponent(url)}`;
    pageType = 'pdf';
    icon = '📑';
    typeName = 'PDF';
    return {
      type: pageType,
      fileId: null,
      embedUrl,
      icon,
      typeName,
      isGoogleService: false,
      originalUrl: url
    };
  }
  
  // Google Docs
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (docMatch) {
    fileId = docMatch[1];
    pageType = 'doc';
    icon = '📄';
    typeName = 'Doc';
    embedUrl = `https://docs.google.com/document/d/${fileId}/edit`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Sheets
  const sheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetMatch) {
    fileId = sheetMatch[1];
    pageType = 'sheet';
    icon = '📊';
    typeName = 'Sheet';
    embedUrl = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Slides
  const slideMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9-_]+)/);
  if (slideMatch) {
    fileId = slideMatch[1];
    pageType = 'slide';
    icon = '📽️';
    typeName = 'Slides';
    embedUrl = `https://docs.google.com/presentation/d/${fileId}/edit`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Forms
  const formMatch = url.match(/docs\.google\.com\/forms\/d\/([a-zA-Z0-9-_]+)/);
  if (formMatch) {
    fileId = formMatch[1];
    pageType = 'form';
    icon = '📋';
    typeName = 'Form';
    embedUrl = `https://docs.google.com/forms/d/${fileId}/viewform`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Drawings
  const drawingMatch = url.match(/docs\.google\.com\/drawings\/d\/([a-zA-Z0-9-_]+)/);
  if (drawingMatch) {
    fileId = drawingMatch[1];
    pageType = 'drawing';
    icon = '🖌️';
    typeName = 'Drawing';
    embedUrl = `https://docs.google.com/drawings/d/${fileId}/edit`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google MyMaps (mid= parameter)
  const mapMidMatch = url.match(/google\.com\/maps\/d\/(?:viewer\?mid=|.*?mid=)([a-zA-Z0-9-_]+)/);
  if (mapMidMatch) {
    fileId = mapMidMatch[1];
    pageType = 'map';
    icon = '🗺️';
    typeName = 'Map';
    embedUrl = `https://www.google.com/maps/d/embed?mid=${fileId}`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google MyMaps (path-based)
  const mapEmbedMatch = url.match(/google\.com\/maps\/d\/([a-zA-Z0-9-_]+)/);
  if (mapEmbedMatch) {
    fileId = mapEmbedMatch[1];
    pageType = 'map';
    icon = '🗺️';
    typeName = 'Map';
    embedUrl = `https://www.google.com/maps/d/embed?mid=${fileId}`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Sites
  const siteMatch = url.match(/sites\.google\.com\/([^/]+)\/([^/]+)(?:\/([^/?]+))?/);
  if (siteMatch) {
    pageType = 'site';
    icon = '🌐';
    typeName = 'Site';
    embedUrl = url.split('?')[0];
    return { type: pageType, fileId: null, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Apps Script
  const scriptMatch = url.match(/script\.google\.com\/(?:macros\/d\/)?([a-zA-Z0-9-_]+)/);
  if (scriptMatch) {
    fileId = scriptMatch[1];
    pageType = 'script';
    icon = '📜';
    typeName = 'Apps Script';
    embedUrl = `https://script.google.com/macros/s/${fileId}/edit`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Vids
  const vidMatch = url.match(/vids\.google\.com\/watch\/([a-zA-Z0-9-_]+)/);
  if (vidMatch) {
    fileId = vidMatch[1];
    pageType = 'vid';
    icon = '🎬';
    typeName = 'Vid';
    embedUrl = `https://vids.google.com/watch/${fileId}`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Generic Google Drive file (/file/d/...)
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (driveMatch) {
    fileId = driveMatch[1];
    embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // Google Drive open URL (?id=...)
  const openMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9-_]+)/);
  if (openMatch) {
    fileId = openMatch[1];
    embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    return { type: pageType, fileId, embedUrl, icon, typeName, isGoogleService: true };
  }
  
  // If no matches, return null (invalid URL)
  return null;
};

/**
 * Generate correct iframe URL for a service type
 * @param {string} type - Service type (doc, sheet, slide, etc.)
 * @param {string} fileId - File ID
 * @param {string} mode - 'edit' or 'preview'
 * @returns {string} Embed URL
 */
export const getEmbedUrlForType = (type, fileId, mode = 'edit') => {
  if (!fileId) return '';
  
  const baseUrls = {
    doc: 'https://docs.google.com/document/d/',
    sheet: 'https://docs.google.com/spreadsheets/d/',
    slide: 'https://docs.google.com/presentation/d/',
    form: 'https://docs.google.com/forms/d/',
    drawing: 'https://docs.google.com/drawings/d/',
    map: 'https://www.google.com/maps/d/',
    vid: 'https://vids.google.com/watch/',
    script: 'https://script.google.com/macros/s/',
    drive: 'https://drive.google.com/file/d/'
  };
  
  const base = baseUrls[type];
  if (!base) return `https://drive.google.com/file/d/${fileId}/preview`;
  
  switch (type) {
    case 'doc':
    case 'sheet':
    case 'slide':
      return `${base}${fileId}${mode === 'preview' ? '/preview' : '/edit'}`;
    case 'form':
      return `${base}${fileId}/viewform`;
    case 'drawing':
      return `${base}${fileId}/${mode === 'preview' ? 'preview' : 'edit'}`;
    case 'map':
      return `${base}embed?mid=${fileId}`;
    case 'vid':
      return `${base}${fileId}`;
    case 'script':
      return `${base}${fileId}/edit`;
    default:
      return `${base}${fileId}/preview`;
  }
};

/**
 * Convert Drive API mimeType to page type
 * @param {string} mimeType - MIME type from Drive API
 * @returns {Object} Page type info { type, icon, typeName }
 */
export const detectPageTypeFromMimeType = (mimeType) => {
  const mimeMap = {
    'application/vnd.google-apps.document': { type: 'doc', icon: '📄', typeName: 'Doc' },
    'application/vnd.google-apps.spreadsheet': { type: 'sheet', icon: '📊', typeName: 'Sheet' },
    'application/vnd.google-apps.presentation': { type: 'slide', icon: '📽️', typeName: 'Slides' },
    'application/vnd.google-apps.form': { type: 'form', icon: '📋', typeName: 'Form' },
    'application/vnd.google-apps.drawing': { type: 'drawing', icon: '🖌️', typeName: 'Drawing' },
    'application/vnd.google-apps.map': { type: 'map', icon: '🗺️', typeName: 'Map' },
    'application/vnd.google-apps.site': { type: 'site', icon: '🌐', typeName: 'Site' },
    'application/vnd.google-apps.script': { type: 'script', icon: '📜', typeName: 'Apps Script' },
    'application/vnd.google-apps.vid': { type: 'vid', icon: '🎬', typeName: 'Vid' },
    'application/pdf': { type: 'pdf', icon: '📑', typeName: 'PDF' },
  };
  
  return mimeMap[mimeType] || { type: 'drive', icon: '📁', typeName: 'File' };
};

/**
 * Check if page type supports edit/preview toggle
 * @param {string} pageType - The page type
 * @returns {boolean} True if edit/preview toggle should be shown
 */
export const shouldShowEditToggle = (pageType) => {
  return ['doc', 'sheet', 'slide'].includes(pageType);
};

/**
 * Check if page should show zoom controls
 * Google Docs/Sheets/Slides do not support zoom via URL - use Edit mode for native zoom
 * @returns {boolean} Always false - zoom feature removed
 */
export const shouldShowZoomControls = () => false;

/**
 * Get display name for a page type
 * @param {string} type - Page type
 * @returns {string} Human-readable type name
 */
export const getTypeDisplayName = (type) => {
  const names = {
    doc: 'Google Docs',
    sheet: 'Google Sheets',
    slide: 'Google Slides',
    form: 'Google Forms',
    drawing: 'Google Drawings',
    map: 'Google MyMaps',
    site: 'Google Sites',
    script: 'Apps Script',
    vid: 'Google Vids',
    pdf: 'PDF',
    drive: 'Drive File'
  };
  return names[type] || 'Embed';
};
