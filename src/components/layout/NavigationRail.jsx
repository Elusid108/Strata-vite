import { DRIVE_LOGO_URL } from '../../lib/constants';
import { getTabColorClasses, getPickerPosition, getActiveContext } from '../../lib/utils';
import { Plus, Star, X, MoreVertical } from '../../components/icons';
import { useStrata } from '../../contexts/StrataContext';
import { useAppActions } from '../../hooks/useAppActions';

export function NavigationRail({ children }) {
  const {
    data,
    settings,
    activeTabId,
    activePageId,
    activeNotebookId,
    showPageTypeMenu,
    setShowPageTypeMenu,
    setShowDriveUrlModal,
    setShowLucidModal,
    setEditingTabId,
    setEditingPageId,
    setActiveTabMenu,
    setTabIconPicker,
    setPageIconPicker,
    tabIconPicker,
    pageIconPicker,
    editingTabId,
    editingPageId,
    tabInputRefs,
    tabBarRef,
  } = useStrata();

  const {
    selectTab,
    selectPage,
    handleNavDragStart,
    handleNavDrop,
    addTab,
    addPage,
    addCanvasPage,
    addDatabasePage,
    addCodePage,
    updateLocalName,
    syncRenameToDrive,
    toggleStar,
    executeDelete,
  } = useAppActions();

  const { notebook: activeNotebook, tab: activeTab } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);

  return (
    <>
      {activeNotebook && (
        <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-1">
          <div className="flex items-center gap-1" ref={tabBarRef}>
            {activeNotebook.tabs.map((tab, index) => (
              <div
                key={tab.id}
                draggable={!editingTabId}
                onDragStart={(e) => handleNavDragStart(e, 'tab', tab.id, index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleNavDrop(e, 'tab', index, tab.id)}
                onClick={() => selectTab(tab.id)}
                className={`group flex items-center gap-2 ${settings.condensedView ? 'px-2' : 'px-3'} py-1.5 rounded-t text-sm cursor-pointer transition-colors ${getTabColorClasses(tab.color || 'gray', activeTabId === tab.id)}`}
                title={settings.condensedView ? tab.name : undefined}
              >
                <span
                  className="cursor-pointer hover:opacity-80 tab-icon-trigger"
                  onClick={(e) => {
                    if (settings.condensedView) return;
                    e.stopPropagation();
                    if (activeTabId !== tab.id) return;
                    const pos = getPickerPosition(e.clientY, e.clientX);
                    setTabIconPicker(tabIconPicker?.id === tab.id ? null : { id: tab.id, top: pos.top, left: pos.left });
                  }}
                >
                  {tab.icon || '📋'}
                </span>
                {!settings.condensedView &&
                  (activeTabId === tab.id && editingTabId === tab.id ? (
                    <input
                      ref={(el) => (tabInputRefs.current[tab.id] = el)}
                      className="w-20 bg-transparent outline-none tab-input"
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
                      className="truncate max-w-24"
                      onClick={(e) => {
                        if (activeTabId === tab.id) {
                          e.stopPropagation();
                          setEditingTabId(tab.id);
                        }
                      }}
                    >
                      {tab.name}
                    </span>
                  ))}
                {!settings.condensedView && activeTabId === tab.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTabMenu({ id: tab.id, top: rect.bottom + 5, left: rect.left });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/30 rounded tab-settings-trigger"
                  >
                    <MoreVertical size={12} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addTab} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-900">
          {children}
        </div>

        {activeTab && (
          <div className={`${settings.condensedView ? 'w-14' : 'w-56'} border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col`}>
            <div className={`p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 flex ${settings.condensedView ? 'justify-center' : 'justify-between'} items-center`}>
              {!settings.condensedView && <span className="font-semibold text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">Pages</span>}
              <div className="relative">
                <button
                  onClick={() => setShowPageTypeMenu(!showPageTypeMenu)}
                  className="hover:bg-gray-200 dark:hover:bg-gray-600 p-1 rounded transition-colors text-gray-500 page-type-trigger"
                >
                  <Plus size={16} />
                </button>
                {showPageTypeMenu && (
                  <div className="page-type-menu absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 py-1 w-48">
                    <button
                      onClick={() => {
                        addPage();
                        setShowPageTypeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                    >
                      <span className="text-lg">📝</span> Block Page
                    </button>
                    <button
                      onClick={() => {
                        addCanvasPage();
                        setShowPageTypeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                    >
                      <span className="text-lg">🎨</span> Canvas
                    </button>
                    <button
                      onClick={() => {
                        addDatabasePage();
                        setShowPageTypeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                    >
                      <span className="text-lg">🗄</span> Database
                    </button>
                    <button
                      onClick={() => {
                        addCodePage();
                        setShowPageTypeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                    >
                      <span className="text-lg">&lt;/&gt;</span> Code Page
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                    <button
                      onClick={() => {
                        setShowDriveUrlModal(true);
                        setShowPageTypeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                    >
                      <img src={DRIVE_LOGO_URL} alt="" className="w-5 h-5 object-contain" /> Drive URL
                    </button>
                    <button
                      onClick={() => {
                        setShowLucidModal(true);
                        setShowPageTypeMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm"
                    >
                      <img src="https://www.google.com/s2/favicons?domain=lucid.app&sz=128" alt="" className="w-5 h-5 object-contain rounded-sm" /> Lucidchart
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeTab.pages.map((page, index) => (
                <div
                  key={page.id}
                  id={`nav-page-${page.id}`}
                  tabIndex={0}
                  draggable={!editingPageId}
                  onDragStart={(e) => handleNavDragStart(e, 'page', page.id, index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleNavDrop(e, 'page', index, page.id)}
                  onClick={() => {
                    if (activePageId !== page.id) selectPage(page.id);
                  }}
                  className={`page-item group flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer text-sm outline-none transition-all ${
                    activePageId === page.id ? 'bg-gray-100 dark:bg-gray-700 border-l-4 border-l-blue-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-4 border-l-transparent'
                  }`}
                  title={settings.condensedView ? page.name : undefined}
                >
                  <span
                    className={`${settings.condensedView ? 'text-xl' : 'mr-1 flex-shrink-0'} cursor-pointer hover:opacity-80 page-icon-trigger`}
                    onClick={(e) => {
                      if (settings.condensedView) return;
                      e.stopPropagation();
                      if (activePageId !== page.id) return;
                      const pos = getPickerPosition(e.clientY, e.clientX);
                      setPageIconPicker(pageIconPicker?.pageId === page.id ? null : { pageId: page.id, top: pos.top, left: pos.left });
                    }}
                  >
                    {page.icon || '📄'}
                  </span>
                  {!settings.condensedView &&
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
                          if (activePageId === page.id) {
                            e.stopPropagation();
                            setEditingPageId(page.id);
                          }
                        }}
                      >
                        {page.name}
                      </div>
                    ))}
                  {!settings.condensedView && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(page.id, activeNotebookId, activeTabId);
                        }}
                        className={`${page.starred ? 'text-yellow-400' : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-yellow-400'} transition-all`}
                      >
                        <Star size={14} className={page.starred ? 'fill-current' : ''} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          executeDelete('page', page.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
