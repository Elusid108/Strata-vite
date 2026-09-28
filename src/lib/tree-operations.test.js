import { describe, it, expect } from 'vitest';
import {
  rowsToTree,
  treeToRows,
  normalizePageContent,
  updateBlockInTree,
  removeBlockFromTree,
  insertBlockAfterInTree,
  findBlockInTree,
  countBlocksInTree,
} from './tree-operations';

const rows = [
  { id: 'r1', columns: [{ id: 'c1', blocks: [{ id: 'b1', type: 'text', content: 'a' }, { id: 'b2', type: 'h1', content: 'b' }] }] },
  { id: 'r2', columns: [{ id: 'c2', blocks: [{ id: 'b3', type: 'text', content: 'c' }] }, { id: 'c3', blocks: [{ id: 'b4', type: 'todo', content: 'd', checked: true }] }] },
];

describe('rows <-> tree', () => {
  it('round-trips legacy rows through the v2 tree', () => {
    const tree = rowsToTree(rows);
    expect(tree.version).toBe(2);
    const back = treeToRows(tree);
    expect(back.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(back[1].columns.map((c) => c.blocks.map((b) => b.id))).toEqual([['b3'], ['b4']]);
    expect(back[1].columns[1].blocks[0].checked).toBe(true);
  });

  it('normalizePageContent accepts rows, tree, or nothing', () => {
    expect(normalizePageContent({ rows }).children).toHaveLength(2);
    const tree = rowsToTree(rows);
    expect(normalizePageContent({ content: tree })).toBe(tree);
    expect(normalizePageContent({}).children).toEqual([]);
  });
});

describe('block operations', () => {
  const tree = rowsToTree(rows);

  it('counts content blocks only', () => {
    expect(countBlocksInTree(tree)).toBe(4);
  });

  it('finds a block with its row/column path', () => {
    const found = findBlockInTree(tree, 'b4');
    expect(found.block.id).toBe('b4');
    expect(found.path).toEqual(['r2', 'c3']);
  });

  it('updates a block immutably', () => {
    const next = updateBlockInTree(tree, 'b1', { content: 'changed' });
    expect(findBlockInTree(next, 'b1').block.content).toBe('changed');
    expect(findBlockInTree(tree, 'b1').block.content).toBe('a');
  });

  it('removes a block and prunes empty columns/rows', () => {
    const next = removeBlockFromTree(tree, 'b3');
    expect(countBlocksInTree(next)).toBe(3);
    const r2 = next.children.find((n) => n.id === 'r2');
    expect(r2.children.map((c) => c.id)).toEqual(['c3']);
    const only = removeBlockFromTree(rowsToTree([rows[0]]), 'b1');
    const again = removeBlockFromTree(only, 'b2');
    expect(again.children).toHaveLength(0);
  });

  it('inserts after a target block once', () => {
    const next = insertBlockAfterInTree(tree, 'b1', { id: 'new', type: 'text', content: '' });
    const ids = treeToRows(next)[0].columns[0].blocks.map((b) => b.id);
    expect(ids).toEqual(['b1', 'new', 'b2']);
    expect(countBlocksInTree(next)).toBe(5);
  });
});
