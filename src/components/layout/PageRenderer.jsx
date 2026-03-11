import { useEffect } from 'react';
import { getPickerPosition, getActiveContext } from '../../lib/utils';

const formatTimestamp = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  };
};
import { countBlocksInTree } from '../../lib/tree-operations';
import { Book, Plus, Trash2 } from '../../components/icons';
import { BlockComponent } from '../blocks';
import { CanvasPageComponent, TablePage, MermaidPageComponent } from '../pages';
import { EmbedPage } from '../embeds';
import * as GoogleAPI from '../../lib/google-api';
import { useStrata } from '../../contexts/StrataContext';
import { useBlockEditor } from '../../hooks/useBlockEditor';
import { useAppActions } from '../../hooks/useAppActions';

export function PageRenderer() {
  const {
    data,
    activeNotebookId,
    activeTabId,
    activePageId,
    setData,
    triggerContentSync,
    saveToHistory,
    showNotification,
    setShowCoverInput,
    setEditEmbedName,
    setEditEmbedUrl,
    setShowEditEmbed,
    setPageIconPicker,
    pageIconPicker,
    isAuthenticated,
    viewedEmbedPages,
    setViewedEmbedPages,
    titleInputRef,
    autoFocusId,
    setMapConfigBlockId,
    setMapConfigPosition,
  } = useStrata();

  const {
    pageTree,
    rowsForEditor,
    handleDrop,
    handleBlockDragEnd,
    handleUpdateBlock,
    handleRemoveBlock,
    handleInsertBlockAfter,
    addBlock,
    updatePageCover,
    handleRequestFocus,
    handleBlockHandleClick,
    handleBlockFocus,
    handleBlockDragStart,
    handleBlockDragOver,
    dropTarget,
    selectedBlockId,
  } = useBlockEditor();

  const {
    toggleStar,
    updateLocalName,
    syncRenameToDrive,
    handleCanvasUpdate,
    handleTableUpdate,
    handleMermaidUpdate,
  } = useAppActions();

  const { page: activePage } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);

  // Safely track LRU usage: move the active page to the back of the Set without causing an infinite loop
  useEffect(() => {
    if (activePage?.embedUrl) {
      setViewedEmbedPages(prev => {
        const arr = Array.from(prev);
        if (arr[arr.length - 1] === activePage.id) return prev; // Already most recent
        const next = new Set(prev);
        next.delete(activePage.id);
        next.add(activePage.id);
        return next;
      });
    }
  }, [activePage?.id, activePage?.embedUrl, setViewedEmbedPages]);

  // CRITICAL FIX: Iframes reload and lose state if their parent DOM node changes sibling order.
  // Because our LRU moves IDs to the end of the Set, we MUST sort them
  // alphabetically here so their DOM sequence never changes during navigation!
  const embedPagesToRender = Array.from(viewedEmbedPages);
  if (activePage?.embedUrl && !embedPagesToRender.includes(activePage.id)) {
    embedPagesToRender.push(activePage.id);
  }
  embedPagesToRender.sort();

  const createdAtInfo = activePage?.createdAt ? formatTimestamp(activePage.createdAt) : null;

  const totalBlocks = pageTree ? countBlocksInTree(pageTree) : 0;

  return (
    <>
      {embedPagesToRender.map((pageId) => {
        let p = null,
          nbId,
          tId;
        data.notebooks.forEach((nb) =>
          nb.tabs.forEach((t) =>
            t.pages.forEach((pg) => {
              if (pg.id === pageId) {
                p = pg;
                nbId = nb.id;
                tId = t.id;
              }
            })
          )
        );
        if (!p || !p.embedUrl) return null;
        return (
          <div
            key={pageId}
            className="absolute inset-0"
            style={{
              opacity: activePageId === pageId ? 1 : 0,
              pointerEvents: activePageId === pageId ? 'auto' : 'none',
              zIndex: activePageId === pageId ? 10 : -100,
            }}
          >
            <EmbedPage
              page={p}
              onUpdate={(updates) => {
                setData((prev) => ({
                  ...prev,
                  notebooks: prev.notebooks.map((nb) =>
                    nb.id !== nbId
                      ? nb
                      : {
                          ...nb,
                          tabs: nb.tabs.map((tab) =>
                            tab.id !== tId ? tab : { ...tab, pages: tab.pages.map((pg) => (pg.id === pageId ? { ...pg, ...updates } : pg)) }
                          ),
                        }
                  ),
                }));
                triggerContentSync(pageId);
              }}
              onToggleStar={() => toggleStar(p.id, nbId, tId)}
              onEditUrl={() => {
                setEditEmbedName(p.name);
                setEditEmbedUrl(p.originalUrl || p.embedUrl);
                setShowEditEmbed(true);
              }}
              isStarred={p.starred}
            />
          </div>
        );
      })}

      {activePage && !activePage.embedUrl && (
        <div
          className={`absolute inset-0 z-20 bg-white dark:bg-gray-800 ${
            ['canvas', 'database', 'mermaid', 'code'].includes(activePage.type) ? 'overflow-hidden' : 'overflow-auto'
          }`}
        >
          {activePage.type === 'canvas' ? (
            <CanvasPageComponent
              page={activePage}
              onUpdate={handleCanvasUpdate}
              saveToHistory={saveToHistory}
              showNotification={showNotification}
            />
          ) : activePage.type === 'database' ? (
            <TablePage page={activePage} onUpdate={handleTableUpdate} />
          ) : activePage.type === 'mermaid' || activePage.type === 'code' ? (
            <MermaidPageComponent
              page={activePage}
              onUpdate={handleMermaidUpdate}
              saveToHistory={saveToHistory}
              showNotification={showNotification}
            />
          ) : ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'site', 'script', 'drive', 'lucidchart', 'miro', 'drawio'].includes(activePage.type) ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400 p-8">
              <div className="text-6xl">{activePage.icon || '📄'}</div>
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">{activePage.name}</h2>
              <p className="text-center max-w-md">
                This{' '}
                {activePage.type === 'doc'
                  ? 'Google Doc'
                  : activePage.type === 'sheet'
                  ? 'Google Sheet'
                  : activePage.type === 'slide'
                  ? 'Google Slides'
                  : activePage.type === 'form'
                  ? 'Google Form'
                  : activePage.type === 'drawing'
                  ? 'Google Drawing'
                  : activePage.type === 'vid'
                  ? 'Google Video'
                  : activePage.type === 'pdf'
                  ? 'PDF'
                  : activePage.type === 'miro'
                  ? 'Miro Board'
                  : activePage.type === 'drawio'
                  ? 'Draw.io Diagram'
                  : 'embedded file'}{' '}
                needs to be re-linked. The original file reference was lost during sync.
              </p>
              <p className="text-sm text-gray-400">Delete this page and add a new one using the Drive URL option.</p>
            </div>
          ) : (
            <>
              <div className="min-h-full bg-gray-100 dark:bg-gray-900 p-4">
                <div className="max-w-4xl mx-auto min-h-[500px] bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden pb-10">
                  <div className="relative group/cover">
                    {activePage.cover && (
                      <div
                        className="h-48 w-full rounded-t-lg transition-all"
                        style={
                          activePage.cover.startsWith('linear-gradient') || activePage.cover.startsWith('#') || activePage.cover.startsWith('rgb')
                            ? { background: activePage.cover }
                            : { backgroundImage: `url(${activePage.cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        }
                      />
                    )}
                    {!activePage.cover && <div className="h-12 w-full"></div>}
                    <div
                      className={`absolute ${activePage.cover ? 'top-4 right-4' : 'bottom-0 right-4'} opacity-0 group-hover/cover:opacity-100 transition-opacity flex gap-2 z-10`}
                    >
                      <button
                        onClick={() => setShowCoverInput(true)}
                        className="cover-input-trigger bg-white/90 dark:bg-gray-800/90 backdrop-blur px-3 py-1.5 rounded text-xs font-medium hover:bg-white dark:hover:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                      >
                        {activePage.cover ? 'Change Cover' : 'Add Cover'}
                      </button>
                      {activePage.cover && (
                        <button
                          onClick={() => updatePageCover(activePage.id, null)}
                          className="bg-white/90 dark:bg-gray-800/90 backdrop-blur p-1.5 rounded text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 shadow-sm border border-gray-200 dark:border-gray-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="px-8 py-8">
                    <div className="flex items-center gap-4 mb-6">
                      <span
                        className="text-4xl cursor-pointer hover:opacity-80 page-icon-trigger"
                        onClick={(e) => {
                          const pos = getPickerPosition(e.clientY, e.clientX);
                          setPageIconPicker(pageIconPicker?.pageId === activePage.id ? null : { pageId: activePage.id, top: pos.top, left: pos.left });
                        }}
                      >
                        {activePage.icon || '📄'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <input
                          ref={titleInputRef}
                          className="w-full text-3xl font-bold bg-transparent outline-none"
                          value={activePage.name}
                          onChange={(e) => updateLocalName('page', activePage.id, e.target.value)}
                          onBlur={() => syncRenameToDrive('page', activePage.id)}
                          placeholder="Untitled"
                        />
                        {createdAtInfo && (
                          <div className="text-sm text-gray-400 dark:text-gray-500 mt-1 flex gap-4">
                            <span>{createdAtInfo.date}</span>
                            <span>{createdAtInfo.time}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2" onDrop={handleDrop} onDragEnd={handleBlockDragEnd}>
                      {rowsForEditor.length === 0 ? (
                        <div className="min-h-[120px] border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                          Start typing or drop blocks here
                        </div>
                      ) : (
                        rowsForEditor.map((row) => (
                          <div key={row.id} className="flex gap-4 group/row relative items-stretch">
                            {row.columns.map((col) => (
                              <div key={col.id} className="flex-1 min-w-[50px] space-y-2 flex flex-col">
                                {col.blocks.map((block) => (
                                  <BlockComponent
                                    key={block.id}
                                    block={block}
                                    rowId={row.id}
                                    colId={col.id}
                                    onUpdate={handleUpdateBlock}
                                    onDelete={handleRemoveBlock}
                                    onInsertAfter={handleInsertBlockAfter}
                                    autoFocusId={autoFocusId}
                                    onMapConfig={(blockId, position) => {
                                      setMapConfigBlockId(blockId);
                                      setMapConfigPosition(position);
                                    }}
                                    onRequestFocus={handleRequestFocus}
                                    isSelected={selectedBlockId === block.id}
                                    onHandleClick={handleBlockHandleClick}
                                    onFocus={handleBlockFocus}
                                    onDragStart={handleBlockDragStart}
                                    onDragOver={handleBlockDragOver}
                                    onDrop={handleDrop}
                                    dropTarget={dropTarget}
                                    isLastBlock={totalBlocks === 1}
                                    isAuthenticated={isAuthenticated}
                                    GoogleAPI={GoogleAPI}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      onClick={() => addBlock('text')}
                      className="mt-4 flex items-center gap-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <Plus size={16} />
                      <span className="text-sm">Add a block</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!activePage && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-gray-400">
          <Book size={48} className="opacity-50" />
          <p className="text-sm font-medium">Select a page</p>
          <p className="text-xs text-gray-500">Choose a page from the list</p>
        </div>
      )}
    </>
  );
}
