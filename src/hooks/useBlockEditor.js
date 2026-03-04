import { useCallback } from 'react';
import { TREE_VERSION } from '../lib/constants';
import { generateId, updatePageInData, getActiveContext } from '../lib/utils';
import {
  updateBlockInTree,
  removeBlockFromTree,
  insertBlockAfterInTree,
  findBlockInTree,
  treeToRows
} from '../lib/tree-operations';
import { useStrata } from '../contexts/StrataContext';
import { usePageContent } from './usePageContent';

/**
 * Hook for block-level manipulation, page cover updates, and block drag handlers.
 * Consumes useStrata() and usePageContent().
 */
export function useBlockEditor() {
  const {
    setData,
    triggerContentSync,
    setShowAddMenu,
    settings,
    draggedBlock,
    dropTarget,
    setDraggedBlock,
    setDropTarget,
    setAutoFocusId,
    setBlockMenu,
    setMapConfigBlockId,
    setMapConfigPosition,
    showNotification,
    setSelectedBlockId,
    selectedBlockId,
  } = useStrata();

  const {
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
    lastDropTargetRef,
    dropTargetRafRef,
  } = usePageContent();

  const handleUpdateBlock = useCallback(
    (blockId, updates) => {
      const tree = activePageRowsRef.current;
      if (!tree || tree.version !== TREE_VERSION) return;
      const newTree = updateBlockInTree(tree, blockId, updates);
      setActivePageRows(newTree);
      const { notebookId, tabId, pageId } = activeIdsRef.current;
      if (notebookId && tabId && pageId) {
        const d = dataRef.current;
        if (d) setData(updatePageInData(d, { notebookId, tabId, pageId }, (p) => ({ ...p, content: newTree, rows: treeToRows(newTree) })));
      }
      if (syncContentDebounceRef?.current) {
        clearTimeout(syncContentDebounceRef.current);
        syncContentDebounceRef.current = null;
      }
      scheduleSyncToData();
      triggerContentSync(activeIdsRef.current.pageId);
    },
    [scheduleSyncToData, setData, triggerContentSync, setActivePageRows, activePageRowsRef, dataRef, activeIdsRef, syncContentDebounceRef]
  );

  const handleRemoveBlock = useCallback(
    (blockId) => {
      const tree = activePageRowsRef.current;
      if (!tree || tree.version !== TREE_VERSION) return;
      const fn = updatePageContentRef.current;
      if (fn) fn(removeBlockFromTree(tree, blockId), true);
      showNotification('Block deleted', 'success');
    },
    [showNotification, activePageRowsRef, updatePageContentRef]
  );

  const handleInsertBlockAfter = useCallback(
    (targetBlockId, blockType) => {
      const tree = activePageRowsRef.current;
      const ids = activeIdsRef.current;
      if (!tree || tree.version !== TREE_VERSION || !ids.pageId || !ids.tabId || !ids.notebookId) return;
      const newBlockId = generateId();
      const newBlock = { id: newBlockId, type: blockType, content: '', url: '', ...(blockType === 'todo' ? { checked: false } : {}) };
      const newTree = insertBlockAfterInTree(tree, targetBlockId, newBlock);
      const fn = updatePageContentRef.current;
      if (fn) fn(newTree, true);
      setAutoFocusId(newBlockId);
    },
    [activePageRowsRef, activeIdsRef, updatePageContentRef, setAutoFocusId]
  );

  const handleDrop = useCallback(
    (e) => {
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

      newRows.forEach((row) => {
        row.columns.forEach((col) => {
          const idx = col.blocks.findIndex((b) => b.id === block.id);
          if (idx > -1) {
            movedBlock = col.blocks[idx];
            col.blocks.splice(idx, 1);
          }
        });
      });
      newRows.forEach((row) => {
        row.columns = row.columns.filter((c) => c.blocks.length > 0);
      });
      newRows = newRows.filter((r) => r.columns.length > 0);

      if (movedBlock) {
        if (position === 'left' || position === 'right') {
          const targetRowIndex = newRows.findIndex((r) => r.id === tgtRowId);
          if (targetRowIndex > -1) {
            const targetRow = newRows[targetRowIndex];
            const targetColIndex = targetRow.columns.findIndex((c) => c.id === tgtColId);
            const targetCol = targetRow.columns[targetColIndex];

            if (targetCol) {
              const targetBlockIndex = targetCol.blocks.findIndex((b) => b.id === tgtBlockId);

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
                newRows.forEach((row) => {
                  row.columns = row.columns.filter((c) => c.blocks.length > 0);
                });
                newRows = newRows.filter((r) => r.columns.length > 0);

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
          const targetRow = newRows.find((r) => r.id === tgtRowId);
          const targetCol = targetRow?.columns.find((c) => c.id === tgtColId);
          if (targetCol) {
            const targetBlockIndex = targetCol.blocks.findIndex((b) => b.id === tgtBlockId);
            const insertIndex = position === 'top' ? targetBlockIndex : targetBlockIndex + 1;
            targetCol.blocks.splice(insertIndex, 0, movedBlock);
          }
        }
      }
      updatePageContent(newRows, true);
      setDraggedBlock(null);
      setDropTarget(null);
    },
    [draggedBlock, dropTarget, rowsForEditor, settings.maxColumns, updatePageContent, setDraggedBlock, setDropTarget]
  );

  const updatePageCover = useCallback(
    (pageId, coverData) => {
      const { notebookId, tabId } = activeIdsRef.current;
      setData((prev) => updatePageInData(prev, { notebookId, tabId, pageId }, (p) => ({ ...p, cover: coverData })));
      triggerContentSync(pageId);
    },
    [setData, triggerContentSync, activeIdsRef]
  );

  const changeBlockType = useCallback(
    (blockId, newType) => {
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
          updates.mapData = { center: [40.7128, -74.006], zoom: 13, markers: [], locked: false };
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
        updates.checked = newType === 'todo' ? (cur === 'todo' ? block.checked === true : false) : false;
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
    },
    [pageTree, handleUpdateBlock, setBlockMenu, setAutoFocusId, setMapConfigBlockId, setMapConfigPosition]
  );

  const updateBlockColor = useCallback(
    (blockId, colorName) => {
      handleUpdateBlock(blockId, { backgroundColor: colorName });
      setBlockMenu(null);
    },
    [handleUpdateBlock, setBlockMenu]
  );

  const handleRequestFocus = useCallback((blockId) => setAutoFocusId(blockId), [setAutoFocusId]);

  const handleBlockFocus = useCallback(() => {
    setSelectedBlockId(null);
    setBlockMenu(null);
    setAutoFocusId(null);
  }, [setSelectedBlockId, setBlockMenu, setAutoFocusId]);

  const handleBlockHandleClick = useCallback(
    (e, blockId) => {
      e.stopPropagation();
      if (selectedBlockId === blockId) {
        const rect = e.currentTarget.getBoundingClientRect();
        setBlockMenu({ id: blockId, top: rect.bottom + 5, left: rect.left });
      } else {
        setSelectedBlockId(blockId);
        setBlockMenu(null);
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
    },
    [selectedBlockId, setSelectedBlockId, setBlockMenu]
  );

  const handleBlockDragStart = useCallback(
    (e, block, rowId, colId) => {
      e.dataTransfer.setData('block_drag', JSON.stringify({ block, rowId, colId }));
      setDraggedBlock({ block, rowId, colId });
    },
    [setDraggedBlock]
  );

  const handleBlockDragEnd = useCallback(() => {
    if (dropTargetRafRef.current) {
      cancelAnimationFrame(dropTargetRafRef.current);
      dropTargetRafRef.current = null;
    }
    lastDropTargetRef.current = null;
    setDraggedBlock(null);
    setDropTarget(null);
  }, [setDraggedBlock, setDropTarget]);

  const handleBlockDragOver = useCallback(
    (e, blockId, blockPath) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedBlock || draggedBlock.block.id === blockId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      const rowId = blockPath[0];
      const colId = blockPath[1];
      const targetRow = rowsForEditor.find((r) => r.id === rowId);
      const colCount = targetRow ? (targetRow.columns?.length || 0) : 0;
      const isMaxColumns = colCount >= (settings.maxColumns || 6);
      const yMid = h * 0.25 <= y && y <= h * 0.75;
      let position = 'bottom';
      if (!isMaxColumns && yMid && x < w * 0.2) position = 'left';
      else if (!isMaxColumns && yMid && x > w * 0.8) position = 'right';
      else if (y < h * 0.25) position = 'top';
      else if (y > h * 0.75) position = 'bottom';
      const next = { rowId, colId, blockId, blockPath, position };
      const last = lastDropTargetRef.current;
      if (last && last.blockId === next.blockId && last.position === next.position && last.rowId === next.rowId && last.colId === next.colId) return;
      lastDropTargetRef.current = next;
      if (dropTargetRafRef.current) cancelAnimationFrame(dropTargetRafRef.current);
      dropTargetRafRef.current = requestAnimationFrame(() => {
        dropTargetRafRef.current = null;
        setDropTarget(next);
      });
    },
    [draggedBlock, rowsForEditor, settings.maxColumns, setDropTarget]
  );

  const addBlock = useCallback(
    (type, initialData = {}) => {
      const ctx = getActiveContext(dataRef.current, activeIdsRef.current.notebookId, activeIdsRef.current.tabId, activeIdsRef.current.pageId);
      const activePage = ctx.page;
      if (!activePage || !pageTree) return;
      const newBlock = { id: generateId(), type, content: '', url: '', ...initialData };
      const newTree = JSON.parse(JSON.stringify(pageTree));
      if (!newTree.children) newTree.children = [];
      newTree.children.push({
        id: generateId(),
        type: 'row',
        children: [{ id: generateId(), type: 'column', width: 1, children: [newBlock] }],
      });
      updatePageContent(newTree, true);
      setShowAddMenu(false);
      setAutoFocusId(newBlock.id);
    },
    [pageTree, updatePageContent, setShowAddMenu, setAutoFocusId]
  );

  return {
    handleUpdateBlock,
    handleRemoveBlock,
    handleInsertBlockAfter,
    handleDrop,
    changeBlockType,
    updateBlockColor,
    updatePageCover,
    handleRequestFocus,
    handleBlockFocus,
    handleBlockHandleClick,
    handleBlockDragStart,
    handleBlockDragEnd,
    handleBlockDragOver,
    pageTree,
    rowsForEditor,
    dropTarget,
    selectedBlockId,
    addBlock,
  };
}
