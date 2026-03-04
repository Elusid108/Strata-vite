import { APP_VERSION } from '../../lib/constants';
import { getPickerPosition } from '../../lib/utils';
import { Book, Plus, Settings, Star, X, GoogleG, ChevronRight, Minimize2, Maximize2 } from '../../components/icons';
import { useStrata } from '../../contexts/StrataContext';
import { useAppActions } from '../../hooks/useAppActions';

export function Sidebar() {
  const {
    settings,
    setSettings,
    setShowSettings,
    isLoadingAuth,
    isAuthenticated,
    userName,
    userEmail,
    hasUnsyncedChanges,
    showNotification,
    setShowSignOutConfirm,
    handleSignIn,
    isSyncing,
    favoritesExpanded,
    setFavoritesExpanded,
    setActiveNotebookId,
    setActiveTabId,
    setActivePageId,
    setEditingPageId,
    setEditingTabId,
    setEditingNotebookId,
    setData,
    setNotebookIconPicker,
    notebookIconPicker,
    setItemToDelete,
    activeNotebookId,
    data,
    editingNotebookId,
    notebookInputRefs,
    setViewedEmbedPages,
  } = useStrata();

  const {
    addNotebook,
    selectNotebook,
    handleNavDragStart,
    handleNavDrop,
    handleFavoriteDrop,
    getStarredPages,
    flushAndClearSync,
    updateLocalName,
    syncRenameToDrive,
  } = useAppActions();

  const starredPages = getStarredPages();

  const handleFavoriteClick = (page) => {
    flushAndClearSync();
    localStorage.setItem(`strata_history_nb_${page.notebookId}`, page.tabId);
    localStorage.setItem(`strata_history_tab_${page.tabId}`, page.id);
    setActiveNotebookId(page.notebookId);
    setActiveTabId(page.tabId);
    setActivePageId(page.id);
    setEditingPageId(null);
    setEditingTabId(null);
    setEditingNotebookId(null);
    if (page.embedUrl && setViewedEmbedPages) {
      setViewedEmbedPages((prev) => new Set([...prev, page.id]));
    }
    setData((prev) => ({
      ...prev,
      notebooks: prev.notebooks.map((nb) =>
        nb.id === page.notebookId
          ? {
              ...nb,
              activeTabId: page.tabId,
              tabs: nb.tabs.map((t) => (t.id === page.tabId ? { ...t, activePageId: page.id } : t)),
            }
          : nb
      ),
    }));
  };

  return (
    <div className={`${settings.condensedView ? 'w-16' : 'w-56'} bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-200`}>
      <div className={`p-3 border-b border-gray-200 dark:border-gray-700 flex items-center ${settings.condensedView ? 'justify-center' : 'justify-between'}`}>
        {!settings.condensedView && (
          <div className="flex items-center gap-2">
            <Book size={18} className="text-blue-500" />
            <span className="font-semibold text-sm">Strata</span>
            <span className="text-xs text-gray-400">v{APP_VERSION}</span>
          </div>
        )}
        <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded settings-trigger">
          <Settings size={16} />
        </button>
      </div>

      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        {isLoadingAuth ? (
          <div className="text-xs text-gray-500 text-center py-2">Loading...</div>
        ) : isAuthenticated ? (
          <div
            className={`flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer`}
            onClick={() => {
              if (hasUnsyncedChanges) {
                showNotification('Please wait for sync to finish before signing out.', 'error');
                return;
              }
              setShowSignOutConfirm(true);
            }}
            title={settings.condensedView ? `${userName} (${userEmail})` : undefined}
          >
            <GoogleG size={16} />
            {!settings.condensedView && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{userName}</div>
                <div className="text-xs text-gray-500 truncate">{userEmail}</div>
              </div>
            )}
            {isSyncing && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className={`w-full flex items-center justify-center gap-2 p-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm`}
            title={settings.condensedView ? 'Sign in with Google' : undefined}
          >
            <GoogleG size={16} />
            {!settings.condensedView && <span>Sign in with Google</span>}
          </button>
        )}
      </div>

      {starredPages.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setFavoritesExpanded(!favoritesExpanded)}
            className={`w-full flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hover:bg-gray-200 dark:hover:bg-gray-700`}
            title={settings.condensedView ? `Favorites (${starredPages.length})` : undefined}
          >
            {!settings.condensedView && <ChevronRight size={12} className={`transition-transform ${favoritesExpanded ? 'rotate-90' : ''}`} />}
            <Star size={12} className="text-yellow-400" />
            {!settings.condensedView && (
              <>
                <span>Favorites</span>
                <span className="text-gray-400">({starredPages.length})</span>
              </>
            )}
          </button>
          {favoritesExpanded && (
            <div className="pb-2">
              {starredPages.map((page) => (
                <div
                  key={page.id}
                  draggable={true}
                  onDragStart={(e) => handleNavDragStart(e, 'favorite', page.id, 0)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleFavoriteDrop(e, page.id)}
                  onClick={() => handleFavoriteClick(page)}
                  className={`flex items-center ${settings.condensedView ? 'justify-center' : 'pl-6 pr-4 gap-2'} py-1 text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700`}
                  title={settings.condensedView ? page.name : undefined}
                >
                  <span className={settings.condensedView ? 'text-xl' : ''}>{page.icon || '📄'}</span>
                  {!settings.condensedView && <span className="truncate">{page.name}</span>}
                  {!settings.condensedView && <Star size={14} className="text-yellow-400 opacity-50 ml-auto flex-shrink-0 fill-current" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div className={`flex items-center ${settings.condensedView ? 'justify-center' : 'justify-between'} mb-2`}>
            {!settings.condensedView && <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Notebooks</span>}
            <button onClick={addNotebook} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Add notebook">
              <Plus size={14} />
            </button>
          </div>
          {data.notebooks.map((notebook, index) => (
            <div
              key={notebook.id}
              draggable={!editingNotebookId}
              onDragStart={(e) => handleNavDragStart(e, 'notebook', notebook.id, index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleNavDrop(e, 'notebook', index)}
              onClick={() => selectNotebook(notebook.id)}
              className={`group flex items-center ${settings.condensedView ? 'justify-center' : 'gap-2'} p-2 rounded cursor-pointer mb-1 ${
                activeNotebookId === notebook.id ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={settings.condensedView ? notebook.name : undefined}
            >
              <span
                className={`${settings.condensedView ? 'text-xl' : ''} cursor-pointer hover:opacity-80 notebook-icon-trigger`}
                onClick={(e) => {
                  if (settings.condensedView) return;
                  e.stopPropagation();
                  if (activeNotebookId !== notebook.id) return;
                  const pos = getPickerPosition(e.clientY, e.clientX);
                  setNotebookIconPicker(notebookIconPicker?.id === notebook.id ? null : { id: notebook.id, top: pos.top, left: pos.left });
                }}
              >
                {notebook.icon || '📓'}
              </span>
              {!settings.condensedView &&
                (activeNotebookId === notebook.id && editingNotebookId === notebook.id ? (
                  <input
                    ref={(el) => (notebookInputRefs.current[notebook.id] = el)}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm notebook-input"
                    value={notebook.name}
                    onChange={(e) => updateLocalName('notebook', notebook.id, e.target.value)}
                    onBlur={() => {
                      syncRenameToDrive('notebook', notebook.id);
                      setEditingNotebookId(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') e.target.blur();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 truncate text-sm"
                    onClick={(e) => {
                      if (activeNotebookId === notebook.id) {
                        e.stopPropagation();
                        setEditingNotebookId(notebook.id);
                      }
                    }}
                  >
                    {notebook.name}
                  </span>
                ))}
              {!settings.condensedView && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemToDelete({ type: 'notebook', id: notebook.id });
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <button
          onClick={() => setSettings((s) => ({ ...s, condensedView: !s.condensedView }))}
          className="hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded transition-colors"
          title={settings.condensedView ? 'Expand view' : 'Compact view'}
        >
          {settings.condensedView ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
        </button>
        {!settings.condensedView && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {isSyncing && <span className="text-blue-400 animate-pulse">Syncing...</span>}
          </div>
        )}
      </div>
    </div>
  );
}
