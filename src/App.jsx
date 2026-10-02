import { Sidebar, NavigationRail, ModalsContainer, PageRenderer } from './components/layout';
import { TabStrip, PagesPanel } from './components/layout/NavigationRail';
import { ItemActionSheet } from './components/ui/ItemActionSheet';
import { useDataLoader } from './hooks/useDataLoader';
import { usePageContent } from './hooks/usePageContent';
import { useUIRegistry } from './hooks/useUIRegistry';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useFocusEffects } from './hooks/useFocusEffects';
import { useViewport } from './hooks/useViewport';
import { useStrata } from './contexts/StrataContext';
import { getActiveContext } from './lib/utils';
import { Menu, ChevronLeft, Book } from './components/icons';

/**
 * Phone layout: one pane at a time.
 *  - "pages": tab strip + page list for the active notebook
 *  - "editor": the active page, with a back button to the list
 * The notebook sidebar slides in as a drawer.
 */
function MobileShell() {
  const { data, activeNotebookId, activeTabId, activePageId, mobilePane, setMobilePane, drawerOpen, setDrawerOpen, syncStatus, isAuthenticated } =
    useStrata();
  const { notebook, tab, page } = getActiveContext(data, activeNotebookId, activeTabId, activePageId);
  const showEditor = mobilePane === 'editor' && !!page;
  const phase = syncStatus?.phase || 'idle';
  const dot = phase === 'retrying' || phase === 'blocked' || phase === 'signin-required' ? 'bg-amber-500' : phase === 'offline' ? 'bg-gray-400' : phase === 'idle' ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse';

  return (
    <div className="app-shell flex flex-col bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <header className="safe-top bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1 px-2 h-12">
          {showEditor ? (
            <button
              onClick={() => setMobilePane('pages')}
              className="flex items-center gap-1 p-2 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm"
              aria-label="Back to pages"
            >
              <ChevronLeft size={18} />
              <span>{tab?.name || 'Pages'}</span>
            </button>
          ) : (
            <button onClick={() => setDrawerOpen(true)} className="p-2 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Open notebooks">
              <Menu size={20} />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2 px-1">
            <span className="text-lg">{showEditor ? page?.icon || '📄' : notebook?.icon || '📓'}</span>
            <span className="font-semibold text-sm truncate">{showEditor ? page?.name || 'Untitled' : notebook?.name || 'Strata'}</span>
          </div>
          {isAuthenticated && <span className={`w-2 h-2 rounded-full mr-2 ${dot}`} title={phase} />}
        </div>
        {!showEditor && notebook && <TabStrip />}
      </header>

      <main className="flex-1 min-h-0 relative bg-gray-100 dark:bg-gray-900">
        {showEditor ? (
          <PageRenderer />
        ) : notebook ? (
          tab ? (
            <div className="absolute inset-0 flex flex-col">
              <PagesPanel fill />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 p-6 text-center">Add a section with the + in the strip above.</div>
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 p-6 text-center">
            <Book size={40} className="opacity-50" />
            <p className="text-sm">Open the menu to pick a notebook.</p>
          </div>
        )}
      </main>

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="drawer-panel bg-gray-50 dark:bg-gray-800">
            <Sidebar variant="drawer" onClose={() => setDrawerOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

function DesktopShell() {
  return (
    <div className="app-shell flex bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <NavigationRail>
          <PageRenderer />
        </NavigationRail>
      </div>
    </div>
  );
}

function App() {
  useDataLoader();
  usePageContent();
  useUIRegistry();
  useKeyboardNavigation();
  useFocusEffects();
  const { isMobile } = useViewport();

  return (
    <>
      {isMobile ? <MobileShell /> : <DesktopShell />}
      <ItemActionSheet />
      <ModalsContainer />
    </>
  );
}

export default App;
