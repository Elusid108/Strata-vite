import { useState } from 'react';
import { useStrata } from '../../contexts/StrataContext';
import { useAppActions } from '../../hooks/useAppActions';
import { Star, Trash2, Edit3, ChevronRight, X, Download, Pin, PinOff } from '../icons';

/**
 * Touch-friendly action sheet for a notebook, tab or page: rename, star,
 * move up/down, move to another container, delete. Replaces hover-only
 * controls and drag-and-drop on phones and tablets.
 */
export function ItemActionSheet() {
  const {
    data,
    itemActionSheet,
    setItemActionSheet,
    setEditingNotebookId,
    setEditingTabId,
    setEditingPageId,
    setItemToDelete,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    setMobilePane,
    setActiveTabMenu,
  } = useStrata();
  const { moveItem, toggleStar, executeDelete, exportItem, togglePin, isPinned } = useAppActions();
  const [step, setStep] = useState('actions'); // 'actions' | 'move'

  if (!itemActionSheet) return null;
  const { type, id } = itemActionSheet;

  let item = null;
  let parentList = [];
  let notebook = null;
  let tab = null;
  if (type === 'notebook') {
    item = data.notebooks.find((n) => n.id === id);
    parentList = data.notebooks;
  } else if (type === 'tab') {
    for (const nb of data.notebooks) {
      const found = (nb.tabs || []).find((t) => t.id === id);
      if (found) {
        item = found;
        notebook = nb;
        parentList = nb.tabs;
      }
    }
  } else if (type === 'page') {
    for (const nb of data.notebooks) {
      for (const t of nb.tabs || []) {
        const found = (t.pages || []).find((p) => p.id === id);
        if (found) {
          item = found;
          notebook = nb;
          tab = t;
          parentList = t.pages;
        }
      }
    }
  }
  if (!item) {
    setItemActionSheet(null);
    return null;
  }
  const index = parentList.findIndex((x) => x.id === id);
  const close = () => {
    setItemActionSheet(null);
    setStep('actions');
  };

  const label = type === 'tab' ? 'section' : type;
  const rename = () => {
    if (type === 'notebook') {
      setActiveNotebookId(id);
      setEditingNotebookId(id);
    } else if (type === 'tab') {
      setActiveNotebookId(notebook.id);
      setActiveTabId(id);
      setEditingTabId(id);
    } else {
      setActiveNotebookId(notebook.id);
      setActiveTabId(tab.id);
      setActivePageId(id);
      setEditingPageId(id);
      setMobilePane('pages');
    }
    close();
  };

  const moveBy = (delta) => {
    moveItem(type, id, { toIndex: index + delta });
    close();
  };

  const remove = () => {
    if (type === 'page') executeDelete('page', id);
    else setItemToDelete({ type, id });
    close();
  };

  const moveTargets =
    type === 'page'
      ? data.notebooks.flatMap((nb) => (nb.tabs || []).filter((t) => t.id !== tab.id).map((t) => ({ id: t.id, label: `${nb.icon || '📓'} ${nb.name} › ${t.icon || '📋'} ${t.name}` })))
      : type === 'tab'
        ? data.notebooks.filter((nb) => nb.id !== notebook.id).map((nb) => ({ id: nb.id, label: `${nb.icon || '📓'} ${nb.name}` }))
        : [];

  const Row = ({ onClick, icon, children, danger = false, disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm rounded-lg ${
        danger ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'
      } ${disabled ? 'opacity-40' : 'hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600'}`}
    >
      <span className="w-5 flex justify-center">{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-[9998] bg-black/30" onClick={close} />
      <div
        className="item-action-sheet strata-sheet fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 max-w-[92vw] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 safe-bottom"
        role="dialog"
        aria-label={`${label} options`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
          <span className="text-lg">{item.icon || (type === 'notebook' ? '📓' : type === 'tab' ? '📋' : '📄')}</span>
          <span className="flex-1 font-semibold text-sm truncate dark:text-white">{item.name || 'Untitled'}</span>
          <button onClick={close} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {step === 'actions' ? (
          <div className="flex flex-col">
            <Row onClick={rename} icon={<Edit3 size={16} />}>Rename</Row>
            {type === 'page' && (
              <Row onClick={() => { toggleStar(id, notebook.id, tab.id); close(); }} icon={<Star size={16} className={item.starred ? 'fill-current text-yellow-400' : ''} />}>
                {item.starred ? 'Remove from favorites' : 'Add to favorites'}
              </Row>
            )}
            {type === 'page' && (
              <Row onClick={() => { togglePin(id); close(); }} icon={isPinned(id) ? <PinOff size={16} /> : <Pin size={16} className="text-blue-500" />}>
                {isPinned(id) ? 'Unpin page' : 'Pin page'}
              </Row>
            )}
            {type === 'tab' && (
              <Row
                onClick={() => {
                  setActiveTabMenu({ id, top: Math.round(window.innerHeight * 0.3), left: 16 });
                  close();
                }}
                icon={<span className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-pink-500" />}
              >
                Color
              </Row>
            )}
            <Row onClick={() => moveBy(-1)} icon={<span>↑</span>} disabled={index <= 0}>Move up</Row>
            <Row onClick={() => moveBy(1)} icon={<span>↓</span>} disabled={index >= parentList.length - 1}>Move down</Row>
            {moveTargets.length > 0 && (
              <Row onClick={() => setStep('move')} icon={<ChevronRight size={16} />}>
                Move to {type === 'page' ? 'another section' : 'another notebook'}…
              </Row>
            )}
            <Row onClick={() => { exportItem(type, id); close(); }} icon={<Download size={16} />}>Export {label}…</Row>
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <Row onClick={remove} icon={<Trash2 size={16} />} danger>Delete {label}</Row>
          </div>
        ) : (
          <div className="flex flex-col max-h-[45vh] overflow-y-auto">
            <button onClick={() => setStep('actions')} className="px-4 py-2 text-left text-xs text-gray-500 hover:underline">← Back</button>
            {moveTargets.map((target) => (
              <Row
                key={target.id}
                onClick={() => {
                  moveItem(type, id, type === 'page' ? { toTabId: target.id } : { toNotebookId: target.id });
                  close();
                }}
                icon={<ChevronRight size={14} />}
              >
                {target.label}
              </Row>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
