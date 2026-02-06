import { TREE_VERSION } from './constants';
import { generateId } from './utils';

/**
 * Convert legacy rows[] to tree { version: 2, children }
 * @param {Array} rows - Legacy rows array
 * @returns {Object} Tree structure with version and children
 */
export const rowsToTree = (rows) => {
  if (!rows || !Array.isArray(rows)) return { version: TREE_VERSION, children: [] };
  const children = rows.map(row => ({
    type: 'row',
    id: row.id || 'row-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    children: (row.columns || []).map(col => ({
      type: 'column',
      id: col.id || 'col-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      width: col.width ?? (1 / (row.columns?.length || 1)),
      children: (col.blocks || []).map(b => ({ ...b }))
    }))
  }));
  return { version: TREE_VERSION, children };
};

/**
 * Convert tree { version, children } to legacy rows[] for Docs API and backward compat
 * @param {Object} tree - Tree structure
 * @returns {Array} Legacy rows array
 */
export const treeToRows = (tree) => {
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
        id: 'row-' + (node.id || 'c' + Date.now()),
        columns: [{ id: node.id, width: node.width ?? 1, blocks: (node.children || []).filter(b => b && b.type !== 'row' && b.type !== 'column') }]
      });
    } else {
      const blockId = node.id || 'b' + Date.now();
      rows.push({
        id: 'row-' + blockId,
        columns: [{ id: 'col-' + blockId, blocks: [node] }]
      });
    }
  }
  return rows;
};

/**
 * Normalize page content: if legacy rows, convert to tree; if tree, use as-is
 * @param {Object} page - Page object
 * @returns {Object} Normalized tree structure
 */
export const normalizePageContent = (page) => {
  if (!page) return null;
  const content = page.content || page;
  if (content && content.version === TREE_VERSION && Array.isArray(content.children)) {
    return content;
  }
  const rows = page.rows || content?.rows || (Array.isArray(content) ? content : []);
  if (Array.isArray(rows) && rows.length >= 0) {
    return rowsToTree(rows);
  }
  return { version: TREE_VERSION, children: [] };
};

/**
 * Find block by id in tree
 * @param {Object} tree - Tree structure
 * @param {string} blockId - Block ID to find
 * @returns {Object|null} Object containing { block, path, parent } where path is [rowId?, colId?]
 */
export const findBlockInTree = (tree, blockId) => {
  if (!tree || !tree.children) return null;
  const walk = (nodes, path) => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === blockId && n.type !== 'row' && n.type !== 'column') return { block: n, path: [...path], parent: nodes };
      if (n.type === 'row') {
        for (let j = 0; j < (n.children || []).length; j++) {
          const col = n.children[j];
          if (col.type === 'column') {
            const idx = (col.children || []).findIndex(b => b && b.id === blockId);
            if (idx >= 0) return { block: col.children[idx], path: [...path, n.id, col.id], parent: col.children };
            for (const c of (col.children || [])) {
              if (c.type === 'row' || c.type === 'column') {
                const found = walk([c], [...path, n.id, col.id]);
                if (found) return found;
              }
            }
          }
        }
      } else if (n.type === 'column') {
        const idx = (n.children || []).findIndex(b => b && b.id === blockId);
        if (idx >= 0) return { block: n.children[idx], path: [...path, n.id], parent: n.children };
      }
    }
    return null;
  };
  for (const n of tree.children) {
    if (n.type === 'row') {
      for (const col of (n.children || [])) {
        if (col.type === 'column') {
          const idx = (col.children || []).findIndex(b => b && b.id === blockId);
          if (idx >= 0) return { block: col.children[idx], path: [n.id, col.id], parent: col.children };
        }
      }
    } else if (n.type === 'column') {
      const idx = (n.children || []).findIndex(b => b && b.id === blockId);
      if (idx >= 0) return { block: n.children[idx], path: [n.id], parent: n.children };
    } else if (n.id === blockId) {
      return { block: n, path: [], parent: tree.children };
    }
  }
  return null;
};

/**
 * Remove block from tree by id
 * @param {Object} tree - Tree structure
 * @param {string} blockId - Block ID to remove
 * @returns {Object} New tree with block removed
 */
export const removeBlockFromTree = (tree, blockId) => {
  if (!tree || !tree.children) return tree;
  const prune = (nodes) => {
    const out = [];
    for (const n of nodes) {
      if (n.type === 'row') {
        const cols = (n.children || []).map(col => ({ ...col, children: prune(col.children || []) })).filter(col => (col.children || []).length > 0);
        if (cols.length) out.push({ ...n, children: cols });
      } else if (n.type === 'column') {
        const kids = prune(n.children || []).filter(b => b.id !== blockId);
        out.push({ ...n, children: kids });
      } else if (n.id !== blockId) out.push(n);
    }
    return out;
  };
  return { ...tree, children: prune(tree.children) };
};

/**
 * Update block in tree
 * @param {Object} tree - Tree structure
 * @param {string} blockId - Block ID to update
 * @param {Object} updates - Object with properties to update
 * @returns {Object} New tree with block updated
 */
export const updateBlockInTree = (tree, blockId, updates) => {
  if (!tree || !tree.children) return tree;
  const mapNodes = (nodes) => nodes.map(n => {
    if (n.type === 'row') return { ...n, children: (n.children || []).map(c => c.type === 'column' ? { ...c, children: mapNodes(c.children || []) } : c) };
    if (n.type === 'column') return { ...n, children: mapNodes(n.children || []) };
    return n.id === blockId ? { ...n, ...updates } : n;
  });
  return { ...tree, children: mapNodes(tree.children) };
};

/**
 * Apply drop to tree: remove movedBlock, insert at target per position
 * @param {Object} tree - Tree structure
 * @param {Object} movedBlock - Block being moved
 * @param {Object} target - Target location { rowId, colId, blockId }
 * @param {string} position - Drop position ('top', 'bottom', 'left', 'right')
 * @returns {Object} New tree with block moved
 */
export const applyDropToTree = (tree, movedBlock, target, position) => {
  if (!tree || !tree.children) return tree;
  let t = removeBlockFromTree(tree, movedBlock.id);
  const { rowId, colId, blockId: tgtBlockId } = target;
  const maxCols = 6;

  if (position === 'top' || position === 'bottom') {
    t = JSON.parse(JSON.stringify(t));
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.type === 'row') for (const col of (n.children || [])) walk(col.children);
        else if (n.type === 'column') {
          const kids = n.children || [];
          const idx = kids.findIndex(b => b && b.id === tgtBlockId);
          if (idx >= 0) {
            kids.splice(position === 'top' ? idx : idx + 1, 0, movedBlock);
            return true;
          }
        }
      }
      return false;
    };
    walk(t.children);
    return t;
  }

  if (position === 'left' || position === 'right') {
    t = JSON.parse(JSON.stringify(t));
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.type === 'row' && n.id === rowId) {
          const cols = n.children || [];
          const colIdx = cols.findIndex(c => c.id === colId);
          if (colIdx >= 0) {
            const col = cols[colIdx];
            const kids = col.children || [];
            const blockIdx = kids.findIndex(b => b && b.id === tgtBlockId);
            if (blockIdx >= 0 && cols.length < maxCols) {
              const newCol = { id: generateId(), type: 'column', width: 1 / (cols.length + 1), children: [movedBlock] };
              if (position === 'left') {
                cols.splice(colIdx, 0, newCol);
              } else {
                cols.splice(colIdx + 1, 0, newCol);
              }
              return true;
            }
            if (blockIdx >= 0 && cols.length >= maxCols) {
              kids.splice(blockIdx + (position === 'right' ? 1 : 0), 0, movedBlock);
              return true;
            }
          }
          for (const c of cols) if (c.type === 'column' && walk(c.children)) return true;
        } else if (n.type === 'row') for (const c of (n.children || [])) if (walk(c.children)) return true;
        else if (n.type === 'column' && n.id === colId) {
          const kids = n.children || [];
          const blockIdx = kids.findIndex(b => b && b.id === tgtBlockId);
          if (blockIdx >= 0) {
            const targetBlock = kids[blockIdx];
            const newRow = { id: generateId(), type: 'row', children: [
              { id: generateId(), type: 'column', width: 0.5, children: position === 'left' ? [movedBlock] : [targetBlock] },
              { id: generateId(), type: 'column', width: 0.5, children: position === 'left' ? [targetBlock] : [movedBlock] }
            ]};
            const idx = nodes.indexOf(n);
            if (idx >= 0) {
              nodes.splice(idx, 1, newRow);
              return true;
            }
          }
        }
      }
      return false;
    };

    const doScenarioA = () => {
      for (let i = 0; i < (t.children || []).length; i++) {
        const n = t.children[i];
        if (n.type === 'column') {
          const kids = n.children || [];
          const blockIdx = kids.findIndex(b => b && b.id === tgtBlockId);
          if (blockIdx >= 0) {
            const targetBlock = kids[blockIdx];
            const col1 = { id: generateId(), type: 'column', width: 0.5, children: position === 'left' ? [movedBlock] : [targetBlock] };
            const col2 = { id: generateId(), type: 'column', width: 0.5, children: position === 'left' ? [targetBlock] : [movedBlock] };
            const newRow = { id: generateId(), type: 'row', children: [col1, col2] };
            const above = kids.slice(0, blockIdx);
            const below = kids.slice(blockIdx + 1);
            const newChildren = [];
            if (above.length) newChildren.push({ id: generateId(), type: 'column', width: 1, children: above });
            newChildren.push(newRow);
            if (below.length) newChildren.push({ id: generateId(), type: 'column', width: 1, children: below });
            t.children.splice(i, 1, ...newChildren);
            return true;
          }
        } else if (n.type === 'row') {
          for (let j = 0; j < (n.children || []).length; j++) {
            const col = n.children[j];
            if (col.type === 'column' && col.id === colId && n.id === rowId) {
              const kids = col.children || [];
              const blockIdx = kids.findIndex(b => b && b.id === tgtBlockId);
              if (blockIdx >= 0 && n.children.length < maxCols) {
                const newCol = { id: generateId(), type: 'column', width: 1 / (n.children.length + 1), children: [movedBlock] };
                if (position === 'left') n.children.splice(j, 0, newCol);
                else n.children.splice(j + 1, 0, newCol);
                return true;
              }
            }
          }
        } else if (n.id === tgtBlockId) {
          const newRow = { id: generateId(), type: 'row', children: [
            { id: generateId(), type: 'column', width: 0.5, children: position === 'left' ? [movedBlock] : [n] },
            { id: generateId(), type: 'column', width: 0.5, children: position === 'left' ? [n] : [movedBlock] }
          ]};
          t.children[i] = newRow;
          return true;
        }
      }
      return false;
    };

    if (!walk(t.children)) doScenarioA();
  }

  return t;
};

/**
 * Insert block after targetBlockId in tree
 * @param {Object} tree - Tree structure
 * @param {string} targetBlockId - Block ID after which to insert
 * @param {Object} newBlock - Block to insert
 * @returns {Object} New tree with block inserted
 */
export const insertBlockAfterInTree = (tree, targetBlockId, newBlock) => {
  if (!tree || !tree.children) return tree;
  let done = false;
  const mapNodes = (nodes) => {
    if (!nodes || !nodes.length) return nodes;
    const out = [];
    for (const n of nodes) {
      if (n.type === 'row') {
        out.push({ ...n, children: (n.children || []).map(c => c.type === 'column' ? { ...c, children: mapNodes(c.children || []) } : c) });
      } else if (n.type === 'column') {
        const kids = n.children || [];
        const idx = kids.findIndex(b => b && b.id === targetBlockId);
        if (idx >= 0 && !done) {
          done = true;
          out.push({ ...n, children: [...kids.slice(0, idx + 1), newBlock, ...kids.slice(idx + 1)] });
        } else {
          out.push({ ...n, children: mapNodes(kids) });
        }
      } else {
        if (n.id === targetBlockId && !done) {
          done = true;
          out.push(n, newBlock);
        } else {
          out.push(n);
        }
      }
    }
    return out;
  };
  return { ...tree, children: mapNodes(tree.children) };
};

/**
 * Count content blocks in tree
 * @param {Object} tree - Tree structure
 * @returns {number} Number of content blocks
 */
export const countBlocksInTree = (tree) => {
  if (!tree || !tree.children) return 0;
  let count = 0;
  const visit = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'row') (n.children || []).forEach(c => visit(c.children || []));
      else if (n.type === 'column') visit(n.children || []);
      else if (n && n.id) count++;
    }
  };
  visit(tree.children);
  return count;
};
