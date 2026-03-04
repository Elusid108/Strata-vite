import { useCallback } from 'react';
import { TREE_VERSION } from '../lib/constants';
import { generateId, updatePageInData } from '../lib/utils';
import {
  updateBlockInTree,
  removeBlockFromTree,
  insertBlockAfterInTree,
  findBlockInTree,
  treeToRows
} from '../lib/tree-operations';
import { useStrata } from '../contexts/StrataContext';

/**
 * Hook for block-level manipulation and page cover updates.
 * Consumes useStrata() for setData and triggerContentSync.
 */
export function useBlockEditor({
  activePageRowsRef,
  dataRef,
  activeIdsRef,
  updatePageContentRef,
  syncContentDebounceRef,
  scheduleSyncToData,
  setActivePageRows,
  updatePageContent,
  pageTree,
  rowsForEditor,
  settings,
  draggedBlock,
  dropTarget,
  setDraggedBlock,
  setDropTarget,
  setAutoFocusId,
  setBlockMenu,
  setMapConfigBlockId,
  setMapConfigPosition,
  showNotification
}) {
  const { setData, triggerContentSync } = useStrata();

  const handleUpdateBlock = useCallback((blockId, updates) => {
    const tree = activePageRowsRef.current;
    if (!tree || tree.version !== TREE_VERSION) return;
    const newTree = updateBlockInTree(tree, blockId, updates);
    setActivePageRows(newTree);
    const { notebookId, tabId, pageId } = activeIdsRef.current;
    if (notebookId && tabId && pageId) {
      const d = dataRef.current;
      if (d) setData(updatePageInData(d, { notebookId, tabId, pageId }, p => ({ ...p, content: newTree, rows: treeToRows(newTree) })));
    }
    if (syncContentDebounceRef?.current) {
      clearTimeout(syncContentDebounceRef.current);
      syncContentDebounceRef.current = null;
    }
    scheduleSyncToData();
    triggerContentSync(activeIdsRef.current.pageId);
  }, [scheduleSyncToData, setData, triggerContentSync, setActivePageRows, activePageRowsRef, dataRef, activeIdsRef, updatePageContentRef, syncContentDebounceRef]);

  const handleRemoveBlock = useCallback((blockId) => {
    const tree = activePageRowsRef.current;
    if (!tree || tree.version !== TREE_VERSION) return;
    const fn = updatePageContentRef.current;
    if (fn) fn(removeBlockFromTree(tree, blockId), true);
    showNotification('Block deleted', 'success');
  }, [showNotification, activePageRowsRef, updatePageContentRef]);

  const handleInsertBlockAfter = useCallback((targetBlockId, blockType) => {
    const tree = activePageRowsRef.current;
    const ids = activeIdsRef.current;
    if (!tree || tree.version !== TREE_VERSION || !ids.pageId || !ids.tabId || !ids.notebookId) return;
    const newBlockId = generateId();
    const newBlock = { id: newBlockId, type: blockType, content: '', url: '', ...(blockType === 'todo' ? { checked: false } : {}) };
    const newTree = insertBlockAfterInTree(tree, targetBlockId, newBlock);
    const fn = updatePageContentRef.current;
    if (fn) fn(newTree, true);
    setAutoFocusId(newBlockId);
  }, [activePageRowsRef, activeIdsRef, updatePageContentRef, setAutoFocusId]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (!draggedBlock || !dropTarget) {
      setDraggedBlock(null);
      setDropTarget(null);
      return;
    }
    const { block } = draggedBlock;
    const { rowId: tgtRowId, colId: tgtColId, blockId: tgtBlockId, position } = dropTarget;

    let newRows = JSON.parse(JSON.stringify(rowsForEditor));
    let movedBlock = null;

    newRows.forEach(row => {
      row.columns.forEach(col => {
        const idx = col.blocks.findIndex(b => b.id === block.id);
        if (idx > -1) {
          movedBlock = col.blocks[idx];
          col.blocks.splice(idx, 1);
        }
      });
    });
    newRows.forEach(row => { row.columns = row.columns.filter(c => c.blocks.length > 0); });
    newRows = newRows.filter(r => r.columns.length > 0);

    if (movedBlock) {
      if (position === 'left' || position === 'right') {
        const targetRowIndex = newRows.findIndex(r => r.id === tgtRowId);
        if (targetRowIndex > -1) {
          const targetRow = newRows[targetRowIndex];
          const targetColIndex = targetRow.columns.findIndex(c => c.id === tgtColId);
          const targetCol = targetRow.columns[targetColIndex];

          if (targetCol) {
            const targetBlockIndex = targetCol.blocks.findIndex(b => b.id === tgtBlockId);

            if (targetCol.blocks.length > 1) {
              const blocksAbove = targetCol.blocks.slice(0, targetBlockIndex);
              const targetBlock = targetCol.blocks[targetBlockIndex];
              const blocksBelow = targetCol.blocks.slice(targetBlockIndex + 1);

              const rowsToInsert = [];
              if (blocksAbove.length > 0) {
                rowsToInsert.push({ id: generateId(), columns: [{ id: generateId(), blocks: blocksAbove }] });
              }
              const col1 = { id: generateId(), blocks: [position === 'left' ? movedBlock : targetBlock] };
              const col2 = { id: generateId(), blocks: [position === 'left' ? targetBlock : movedBlock] };
              rowsToInsert.push({ id: generateId(), columns: [col1, col2] });
              if (blocksBelow.length > 0) {
                rowsToInsert.push({ id: generateId(), columns: [{ id: generateId(), blocks: blocksBelow }] });
              }

              targetCol.blocks = [];
              newRows.forEach(row => { row.columns = row.columns.filter(c => c.blocks.length > 0); });
              newRows = newRows.filter(r => r.columns.length > 0);

              const insertIndex = targetRowIndex <= newRows.length ? targetRowIndex : newRows.length;
              newRows.splice(insertIndex, 0, ...rowsToInsert);
            } else {
              if (targetRow.columns.length < (settings.maxColumns || 6)) {
                const newCol = { id: generateId(), blocks: [movedBlock] };
                if (position === 'left') targetRow.columns.splice(targetColIndex, 0, newCol);
                else targetRow.columns.splice(targetColIndex + 1, 0, newCol);
              } else {
                targetCol.blocks.push(movedBlock);
              }
            }
          }
        }
      } else {
        const targetRow = newRows.find(r => r.id === tgtRowId);
        const targetCol = targetRow?.columns.find(c => c.id === tgtColId);
        if (targetCol) {
          const targetBlockIndex = targetCol.blocks.findIndex(b => b.id === tgtBlockId);
          const insertIndex = position === 'top' ? targetBlockIndex : targetBlockIndex + 1;
          targetCol.blocks.splice(insertIndex, 0, movedBlock);
        }
      }
    }
    updatePageContent(newRows, true);
    setDraggedBlock(null);
    setDropTarget(null);
  }, [draggedBlock, dropTarget, rowsForEditor, settings.maxColumns, updatePageContent, setDraggedBlock, setDropTarget]);

  const updatePageCover = useCallback((pageId, coverData) => {
    const { notebookId, tabId } = activeIdsRef.current;
    setData(prev => updatePageInData(prev, { notebookId, tabId, pageId }, p => ({ ...p, cover: coverData })));
    triggerContentSync(pageId);
  }, [setData, triggerContentSync, activeIdsRef]);

  const changeBlockType = useCallback((blockId, newType) => {
    const found = pageTree ? findBlockInTree(pageTree, blockId) : null;
    const block = found ? found.block : null;
    if (!block) {
      setBlockMenu(null);
      return;
    }
    const cur = block.type;
    const curContent = block.content || '';
    const curUrl = block.url || '';
    const textLike = ['text', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'todo', 'link'];
    const isTextLike = (t) => textLike.includes(t);
    const mediaStructural = ['image', 'video', 'divider', 'gdoc', 'map'];

    const updates = { type: newType };

    if (mediaStructural.includes(newType)) {
      updates.content = '';
      updates.url = '';
      if (newType === 'map') {
        updates.mapData = {
          center: [40.7128, -74.0060],
          zoom: 13,
          markers: [],
          locked: false
        };
        setTimeout(() => {
          const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
          if (blockElement) {
            const rect = blockElement.getBoundingClientRect();
            setMapConfigPosition({ top: rect.top, left: rect.left });
          } else {
            setMapConfigPosition({ top: window.innerHeight / 2, left: window.innerWidth / 2 });
          }
          setMapConfigBlockId(blockId);
        }, 100);
      }
    } else {
      updates.url = newType === 'link' ? curUrl : '';
      updates.checked = newType === 'todo' ? (cur === 'todo' ? (block.checked === true) : false) : false;
      if (isTextLike(cur) && isTextLike(newType)) {
        if (['ul', 'ol'].includes(cur) && !['ul', 'ol'].includes(newType)) {
          const div = document.createElement('div');
          div.innerHTML = curContent;
          updates.content = (div.innerText || '').trim();
        } else if (!['ul', 'ol'].includes(cur) && ['ul', 'ol'].includes(newType)) {
          const div = document.createElement('div');
          div.innerHTML = curContent;
          const plainText = (div.innerText || '').trim();
          updates.content = plainText ? `<li>${plainText}</li>` : '<li></li>';
        } else {
          updates.content = curContent;
        }
      } else {
        updates.content = '';
      }
    }

    handleUpdateBlock(blockId, updates);
    setBlockMenu(null);
    setAutoFocusId(blockId);
  }, [pageTree, handleUpdateBlock, setBlockMenu, setAutoFocusId, setMapConfigBlockId, setMapConfigPosition]);

  const updateBlockColor = useCallback((blockId, colorName) => {
    handleUpdateBlock(blockId, { backgroundColor: colorName });
    setBlockMenu(null);
  }, [handleUpdateBlock, setBlockMenu]);

  return {
    handleUpdateBlock,
    handleRemoveBlock,
    handleInsertBlockAfter,
    handleDrop,
    changeBlockType,
    updateBlockColor,
    updatePageCover
  };
}
