import { Sidebar, NavigationRail, ModalsContainer, PageRenderer } from './components/layout';
import { useDataLoader } from './hooks/useDataLoader';
import { usePageContent } from './hooks/usePageContent';
import { useUIRegistry } from './hooks/useUIRegistry';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useFocusEffects } from './hooks/useFocusEffects';

function App() {
  useDataLoader();
  usePageContent();
  useUIRegistry();
  useKeyboardNavigation();
  useFocusEffects();

  return (
    <div className="h-screen flex bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <NavigationRail>
          <PageRenderer />
        </NavigationRail>
      </div>
      <ModalsContainer />
    </div>
  );
}

export default App;
