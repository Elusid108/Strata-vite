import { COLORS } from './constants';

/**
 * Static color class mapping for Tailwind JIT compatibility
 * These must be written as full static strings so Tailwind can detect them
 */
export const COLOR_BG_CLASSES = {
  gray: 'bg-gray-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  teal: 'bg-teal-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
};

/**
 * Generate a random alphanumeric ID
 * @returns {string} A 9-character random ID
 */
export const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Get the next tab color by cycling through the COLORS array
 * @param {Array} existingTabs - Array of existing tabs
 * @returns {string} The name of the next color
 */
export const getNextTabColor = (existingTabs) => {
  if (!existingTabs || existingTabs.length === 0) return COLORS[0].name;
  const lastTabColor = existingTabs[existingTabs.length - 1].color;
  const currentIndex = COLORS.findIndex(c => c.name === lastTabColor);
  const nextIndex = (currentIndex + 1) % COLORS.length;
  return COLORS[nextIndex].name;
};

/**
 * Generate a UUID using crypto.randomUUID or fallback
 * @returns {string} A UUID string
 */
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers or insecure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Get formatted date and time strings
 * @returns {Object} Object containing date and time formatted strings
 */
export const getFormattedDate = () => {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const timeOptions = { hour: 'numeric', minute: 'numeric' };
  const now = new Date();
  return {
    date: now.toLocaleDateString('en-US', options),
    time: now.toLocaleTimeString('en-US', timeOptions)
  };
};

/**
 * Pure function: resolve notebook/tab/page from data by ids
 * @param {Object} data - The full data object containing notebooks
 * @param {string} notebookId - The notebook ID
 * @param {string} tabId - The tab ID
 * @param {string} pageId - The page ID
 * @returns {Object} Object containing { notebook, tab, page }
 */
export const getActiveContext = (data, notebookId, tabId, pageId) => {
  if (!data?.notebooks) return { notebook: null, tab: null, page: null };
  const notebook = data.notebooks.find(n => n.id === notebookId) ?? null;
  const tab = notebook?.tabs?.find(t => t.id === tabId) ?? null;
  const page = tab?.pages?.find(p => p.id === pageId) ?? null;
  return { notebook, tab, page };
};

/**
 * Pure function: get drop indicator Tailwind classes for block drag and drop
 * @param {string} position - The drop position ('top', 'bottom', 'left', 'right')
 * @returns {string} Tailwind CSS classes for the drop indicator
 */
export const getDropIndicatorClass = (position) => {
  switch (position) {
    case 'top': return 'border-t-4 border-blue-500 pt-2';
    case 'bottom': return 'border-b-4 border-blue-500 pb-2';
    case 'left': return 'border-l-4 border-blue-500 pl-2';
    case 'right': return 'border-r-4 border-blue-500 pr-2';
    default: return '';
  }
};

/**
 * Pure function: immutable update of a single page in data
 * @param {Object} data - The full data object
 * @param {Object} ids - Object containing { notebookId, tabId, pageId }
 * @param {Function} updater - Function that receives page and returns updated page
 * @returns {Object} New data object with the updated page
 */
export const updatePageInData = (data, { notebookId, tabId, pageId }, updater) => {
  return {
    ...data,
    notebooks: data.notebooks.map(nb =>
      nb.id !== notebookId ? nb : {
        ...nb,
        tabs: nb.tabs.map(tab =>
          tab.id !== tabId ? tab : {
            ...tab,
            pages: tab.pages.map(p =>
              p.id !== pageId ? p : updater(p)
            )
          }
        )
      }
    )
  };
};

/**
 * Extract YouTube video ID from a URL
 * @param {string} url - YouTube URL
 * @returns {string} YouTube video ID or empty string
 */
export function getYouTubeID(url) {
  if (!url) return '';
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(shorts\/))([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[8].length === 11) ? match[8] : '';
}

/**
 * Normalize list content: ensure valid list markup
 * For ul/ol: ensures at least one li element
 * For todo: ensures each li has data-checked attribute
 * @param {string} raw - Raw HTML content
 * @param {string} listType - Type of list ('ul', 'ol', or 'todo')
 * @returns {string} Normalized HTML string
 */
export const normalizeListContent = (raw, listType) => {
  if (!raw || raw.trim() === '' || raw === '<br>') {
    return listType === 'todo' ? '<li data-checked="false"></li>' : '<li></li>';
  }
  if (listType === 'todo') {
    const div = document.createElement('div');
    div.innerHTML = raw;
    const lis = div.querySelectorAll('li');
    lis.forEach(li => {
      if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false');
    });
    return div.innerHTML || '<li data-checked="false"></li>';
  }
  if (!raw.includes('<li>')) return `<li>${raw}</li>`;
  return raw;
};

/**
 * Get Tailwind CSS classes for tab styling
 * @param {string} colorName - The color name
 * @param {boolean} isActive - Whether the tab is active
 * @returns {string} Tailwind CSS classes
 */
export const getTabColorClasses = (colorName, isActive) => {
  // Inactive tab colors - pastel in light mode, darker in dark mode
  const colors = {
    gray: 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200',
    red: 'bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-900 dark:hover:bg-red-800 dark:text-red-200',
    orange: 'bg-orange-100 hover:bg-orange-200 text-orange-800 dark:bg-orange-900 dark:hover:bg-orange-800 dark:text-orange-200',
    amber: 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900 dark:hover:bg-amber-800 dark:text-amber-200',
    green: 'bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-900 dark:hover:bg-green-800 dark:text-green-200',
    teal: 'bg-teal-100 hover:bg-teal-200 text-teal-800 dark:bg-teal-900 dark:hover:bg-teal-800 dark:text-teal-200',
    blue: 'bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-200',
    indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 dark:bg-indigo-900 dark:hover:bg-indigo-800 dark:text-indigo-200',
    purple: 'bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-900 dark:hover:bg-purple-800 dark:text-purple-200',
    pink: 'bg-pink-100 hover:bg-pink-200 text-pink-800 dark:bg-pink-900 dark:hover:bg-pink-800 dark:text-pink-200',
  };
  // Active tab colors - solid colors (same in both modes)
  const activeColors = {
    gray: 'bg-gray-500 text-white', 
    red: 'bg-red-500 text-white', 
    orange: 'bg-orange-500 text-white',
    amber: 'bg-amber-500 text-white', 
    green: 'bg-green-600 text-white', 
    teal: 'bg-teal-600 text-white',
    blue: 'bg-blue-600 text-white', 
    indigo: 'bg-indigo-600 text-white', 
    purple: 'bg-purple-600 text-white',
    pink: 'bg-pink-600 text-white',
  };
  return isActive ? activeColors[colorName] : colors[colorName];
};

/**
 * Get Tailwind CSS classes for page background
 * @param {string} colorName - The color name
 * @returns {string} Tailwind CSS classes
 */
export const getPageBgClass = (colorName) => {
  const map = {
    gray: 'bg-gray-100 dark:bg-gray-800',
    red: 'bg-red-100 dark:bg-red-900',
    orange: 'bg-orange-100 dark:bg-orange-900',
    amber: 'bg-amber-100 dark:bg-amber-900',
    green: 'bg-green-100 dark:bg-green-900',
    teal: 'bg-teal-100 dark:bg-teal-900',
    blue: 'bg-blue-100 dark:bg-blue-900',
    indigo: 'bg-indigo-100 dark:bg-indigo-900',
    purple: 'bg-purple-100 dark:bg-purple-900',
    pink: 'bg-pink-100 dark:bg-pink-900',
  };
  return map[colorName] || 'bg-white dark:bg-gray-900';
};

/**
 * Clamp picker position within viewport bounds
 * @param {number} top - Initial top position
 * @param {number} left - Initial left position
 * @param {number} width - Picker width (default 256)
 * @param {number} height - Picker height (default 256)
 * @returns {Object} Clamped position { top, left }
 */
export const getPickerPosition = (top, left, width = 256, height = 256) => {
  return {
    top: Math.max(0, Math.min(top, window.innerHeight - height)),
    left: Math.max(0, Math.min(left, window.innerWidth - width))
  };
};

/**
 * Find a block in rows by ID
 * @param {Array} rows - Array of row objects
 * @param {string} blockId - Block ID to find
 * @returns {Object|null} Found block or null
 */
export const findBlockInRows = (rows, blockId) => {
  if (!rows || !rows.length) return null;
  for (const row of rows) {
    for (const col of row.columns) {
      const b = col.blocks.find(block => block.id === blockId);
      if (b) return b;
    }
  }
  return null;
};
