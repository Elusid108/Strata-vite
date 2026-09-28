import { DRIVE_LOGO_URL } from '../../lib/constants';
import { getTabColorClasses, getPickerPosition, getActiveContext } from '../../lib/utils';
import { Plus, Star, X, MoreVertical } from '../../components/icons';
import { useStrata } from '../../contexts/StrataContext';
import { useAppActions } from '../../hooks/useAppActions';
import { useViewport } from '../../hooks/useViewport';

/**
 * Horizontal strip of the active notebook's tabs. Scrolls sideways on narrow
 * screens instead of wrapping.
 */
export function TabStrip() {
  const {
    data,
    settings,
    activeTabId,
    activeNotebookId,
    activePageId,
    setEditingTabId,
    setActiveTabMenu,
    setTabIconPicker,
    tabIconPicker,
    editingTabId,
    tabInputRefs,
    tabBarRef,
    setItemActionSheet,
  } = useStrata();
  const { selectTab, handleNavDragStart, handleNavDrop, addTab, updateLocalName, syncRenameToDrive } = useAppActions();
  const { isMobile } = useViewport();
  const { notebook: activeNotebook } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
  if (!activeNotebook) return null;
  const condensed = settings.condensedView && !isMobile;

  return (
    <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-1">
      <div className="flex items-center gap-1 tab-strip" ref={tabBarRef}>
        {activeNotebook.tabs.map((tab, index) => (
          <div
            key={tab.id}
            draggable={!editingTabId}
            onDragStart={(e) => handleNavDragStart(e, 'tab', tab.id, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleNavDrop(e, 'tab', index, tab.id)}
            onClick={() => selectTab(tab.id)}
            className={`group flex items-center gap-2 ${condensed ? 'px-2' : 'px-3'} py-1.5 rounded-t text-sm cursor-pointer transition-colors ${getTabColorClasses(tab.color || 'gray', activeTabId === tab.id)}`}
            title={condensed ? tab.name : undefined}
          >
            <span
              className="cursor-pointer hover:opacity-80 tab-icon-trigger"
              onClick={(e) => {
                if (condensed) return;
                if (activeTabId !== tab.id) return;
                e.stopPropagation();
                const pos = getPickerPosition(e.clientY, e.clientX);
                setTabIconPicker(tabIconPicker?.id === tab.id ? null : { id: tab.id, top: pos.top, left: pos.left });
              }}
            >
              {tab.icon || '📋'}
            </span>
            {!condensed &&
              (activeTabId === tab.id && editingTabId === tab.id ? (
                <input
                  ref={(el) => (tabInputRefs.current[tab.id] = el)}
                  className="w-24 bg-transparent outline-none tab-input"
                  value={tab.name}
                  onChange={(e) => updateLocalName('tab', tab.id, e.target.value)}
                  onBlur={() => {
                    syncRenameToDrive('tab', tab.id);
                    setEditingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.target.blur();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="truncate max-w-28"
                  onClick={(e) => {
                    if (activeTabId === tab.id && !isMobile) {
                      e.stopPropagation();
                      setEditingTabId(tab.id);
                    }
                  }}
                >
                  {tab.name}
                </span>
              ))}
            {!condensed && activeTabId === tab.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMobile) {
                    setItemActionSheet({ type: 'tab', id: tab.id });
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveTabMenu({ id: tab.id, top: rect.bottom + 5, left: rect.left });
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/30 rounded tab-settings-trigger"
                aria-label="Tab options"
              >
                <MoreVertical size={12} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addTab} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" aria-label="Add section">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * List of pages in the active tab plus the "new page" menu.
 * `fill` renders it as a full-width pane (phone layout).
 */
export function PagesPanel({ fill = false }) {
  const {
    data,
    settings,
    activeTabId,
    activePageId,
    activeNotebookId,
    showPageTypeMenu,
    setShowPageTypeMenu,
    setShowDriveUrlModal,
    setEditingPageId,
    setPageIconPicker,
    pageIconPicker,
    editingPageId,
    setItemActionSheet,
  } = useStrata();
  const {
    selectPage,
    handleNavDragStart,
    handleNavDrop,
    addPage,
    addCanvasPage,
    addDatabasePage,
    addCodePage,
    updateLocalName,
    syncRenameToDrive,
    toggleStar,
    executeDelete,
  } = useAppActions();
  const { isMobile, isTablet } = useViewport();
  const { tab: activeTab } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
  if (!activeTab) return null;
  const condensed = settings.condensedView && !fill;
  const width = fill ? 'w-full' : condensed ? 'w-14' : isTablet ? 'w-44' : 'w-56';

  return (
    <div className={`${width} ${fill ? '' : 'border-l'} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col min-h-0`}>
      <div className={`p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex ${condensed ? 'justify-center' : 'justify-between'} items-center`}>
        {!condensed && <span className="font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Pages</span>}
        <div className="relative">
          <button
            onClick={() => setShowPageTypeMenu(!showPageTypeMenu)}
            className="hover:bg-gray-200 dark:hover:bg-gray-600 p-1 rounded transition-colors text-gray-500 page-type-trigger"
            aria-label="Add page"
          >
            <Plus size={16} />
          </button>
          {showPageTypeMenu && (
            <div className="page-type-menu strata-sheet absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 py-1 w-48">
              {[
                ['📝', 'Block Page', addPage],
                ['🎨', 'Canvas', addCanvasPage],
                ['🗄', 'Database', addDatabasePage],
                ['</>', 'Code Page', addCodePage],
              ].map(([icon, label, action]) => (
                <button
                  key={label}
                  onClick={() => {
                    action();
                    setShowPageTypeMenu(false);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                >
                  <span className="text-lg">{icon}</span> {label}
                </button>
              ))}
              <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
              <button
                onClick={() => {
                  setShowDriveUrlModal(true);
                  setShowPageTypeMenu(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
              >
                <img src={DRIVE_LOGO_URL} alt="" className="w-5 h-5 object-contain" /> Drive &amp; URL
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab.pages.length === 0 && !condensed && (
          <div className="p-4 text-xs text-gray-400 text-center">No pages yet. Tap + to add one.</div>
        )}
        {activeTab.pages.map((page, index) => (
          <div
            key={page.id}
            id={`nav-page-${page.id}`}
            tabIndex={0}
            draggable={!editingPageId && !isMobile}
            onDragStart={(e) => handleNavDragStart(e, 'page', page.id, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleNavDrop(e, 'page', index, page.id)}
            onClick={() => {
              if (activePageId !== page.id || isMobile) selectPage(page.id);
            }}
            className={`page-item group flex items-center ${condensed ? 'justify-center' : 'gap-2'} p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer text-sm outline-none transition-all ${
              activePageId === page.id ? 'bg-gray-100 dark:bg-gray-700 border-l-4 border-l-blue-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'
            }`}
            title={condensed ? page.name : undefined}
          >
            <span
              className={`${condensed ? 'text-xl' : 'mr-1 flex-shrink-0'} cursor-pointer hover:opacity-80 page-icon-trigger`}
              onClick={(e) => {
                if (condensed) return;
                if (activePageId !== page.id) return;
                e.stopPropagation();
                const pos = getPickerPosition(e.clientY, e.clientX);
                setPageIconPicker(pageIconPicker?.pageId === page.id ? null : { pageId: page.id, top: pos.top, left: pos.left });
              }}
            >
              {page.icon || '📄'}
            </span>
            {!condensed &&
              (activePageId === page.id && editingPageId === page.id ? (
                <input
                  className="flex-1 min-w-0 bg-transparent outline-none page-input"
                  value={page.name}
                  onChange={(e) => updateLocalName('page', page.id, e.target.value)}
                  onBlur={() => {
                    syncRenameToDrive('page', page.id);
                    setEditingPageId(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') e.target.blur();
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="flex-1 min-w-0 truncate"
                  onClick={(e) => {
                    if (activePageId === page.id && !isMobile) {
                      e.stopPropagation();
                      setEditingPageId(page.id);
                    }
                  }}
                >
                  {page.name}
                </div>
              ))}
            {!condensed && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(page.id, activeNotebookId, activeTabId);
                  }}
                  className={`${page.starred ? 'text-yellow-400' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-yellow-400'} transition-all p-1`}
                  aria-label={page.starred ? 'Unstar page' : 'Star page'}
                >
                  <Star size={14} className={page.starred ? 'fill-current' : ''} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemActionSheet({ type: 'page', id: page.id });
                  }}
                  className="touch-only item-action-trigger p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Page options"
                >
                  <MoreVertical size={14} />
                </button>
                {!isMobile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      executeDelete('page', page.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 touch-hidden"
                    aria-label="Delete page"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Desktop / tablet composition: tab strip on top, editor in the middle,
 * pages panel on the right.
 */
export function NavigationRail({ children }) {
  const { data, activeTabId, activeNotebookId, activePageId } = useStrata();
  const { notebook: activeNotebook, tab: activeTab } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);

  return (
    <>
      {activeNotebook && <TabStrip />}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-900 min-w-0">{children}</div>
        {activeTab && <PagesPanel />}
      </div>
    </>
  );
}
