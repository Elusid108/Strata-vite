import { TREE_VERSION, COLORS } from './constants';
import { generateId } from './utils';
import { treeToRows } from './tree-operations';

/**
 * Create a default block page with one empty text block
 * @param {string} name - Page name
 * @returns {Object} New block page object
 */
export const createDefaultPage = (name = 'New Page') => {
  const tree = { 
    version: TREE_VERSION, 
    children: [{ id: generateId(), type: 'text', content: '' }] 
  };
  return { 
    id: generateId(), 
    name, 
    createdAt: Date.now(), 
    content: tree,
    rows: treeToRows(tree),
    icon: '📄', 
    cover: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80',
  };
};

/**
 * Create a canvas page
 * @param {string} name - Page name
 * @returns {Object} New canvas page object
 */
export const createCanvasPage = (name = 'Untitled Canvas') => {
  return {
    id: generateId(),
    name,
    createdAt: Date.now(),
    type: 'canvas',
    icon: '🎨',
    canvasData: {
      containers: [],
      paths: [],
      pageTitle: name
    }
  };
};

/**
 * Create a code/mermaid page
 * @param {string} name - Page name
 * @returns {Object} New code page object
 */
export const createCodePage = (name = 'Code Page') => {
  return {
    id: generateId(),
    name,
    createdAt: Date.now(),
    type: 'mermaid',
    icon: '</>',
    codeType: 'mermaid',
    code: '',
    mermaidCode: ''
  };
};

/**
 * Create a database/table page
 * @param {string} name - Page name
 * @returns {Object} New database page object
 */
export const createDatabasePage = (name = 'Database') => {
  return {
    id: generateId(),
    name,
    createdAt: Date.now(),
    type: 'database',
    icon: '🗄️',
    content: {
      schema: {
        columns: [
          { id: 'c1', name: 'Item Name', type: 'text', width: 200 },
          { id: 'c2', name: 'Status', type: 'select', width: 150, options: ['Idea', 'In Progress', 'Done'] },
          { id: 'c3', name: 'Qty', type: 'number', width: 100 },
          { id: 'c4', name: 'Ordered?', type: 'boolean', width: 80 }
        ]
      },
      rows: [
        { id: 'r1', c1: 'Example Item', c2: 'Idea', c3: 1, c4: false }
      ]
    }
  };
};

/**
 * Create a new tab with a default page
 * @param {string} name - Tab name
 * @param {Array} existingTabs - Existing tabs (for color cycling)
 * @returns {Object} New tab object
 */
export const createTab = (name = 'New Tab', existingTabs = []) => {
  const newPage = createDefaultPage();
  const colorIndex = existingTabs.length % COLORS.length;
  
  return { 
    id: generateId(), 
    name, 
    icon: '📋', 
    color: COLORS[colorIndex].name, 
    pages: [newPage], 
    activePageId: newPage.id 
  };
};

/**
 * Create a new notebook with a default tab and page
 * @param {string} name - Notebook name
 * @returns {Object} New notebook object
 */
export const createNotebook = (name = 'New Notebook') => {
  const newPage = createDefaultPage();
  const newTab = { 
    id: generateId(), 
    name: 'New Tab', 
    icon: '📋', 
    color: COLORS[0].name, 
    pages: [newPage], 
    activePageId: newPage.id 
  };
  
  return { 
    id: generateId(), 
    name, 
    icon: '📓', 
    tabs: [newTab], 
    activeTabId: newTab.id 
  };
};
