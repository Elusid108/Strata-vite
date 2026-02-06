import { Star, Edit3, ExternalLink } from '../icons';
import { shouldShowEditToggle, getTypeDisplayName } from '../../lib/embed-utils';
import { DRIVE_SERVICE_ICONS } from '../../lib/constants';

/**
 * Toolbar for embed pages with controls for view mode and edit URL
 */
export function EmbedToolbar({
  page,
  viewMode,
  onViewModeChange,
  onEditUrl,
  onToggleStar,
  isStarred
}) {
  const showEditToggle = shouldShowEditToggle(page?.type);
  
  // Get service icon URL
  const serviceIcon = DRIVE_SERVICE_ICONS.find(s => s.type === page?.type);
  const typeName = getTypeDisplayName(page?.type);

  return (
    <div className="flex-shrink-0 px-4 py-1.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
      {/* Left: Icon, Title, Type, Star */}
      <div className="flex items-center gap-2">
        {serviceIcon?.url ? (
          <img src={serviceIcon.url} alt={typeName} className="w-5 h-5" />
        ) : (
          <span className="text-xl">{page?.icon || '📄'}</span>
        )}
        <div className="flex flex-col">
          <h1 className="text-base font-semibold dark:text-white">{page?.name || 'Untitled'}</h1>
          <span className="text-xs text-gray-500 dark:text-gray-400">{typeName}</span>
        </div>
        {/* Star button */}
        <button
          onClick={onToggleStar}
          className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            isStarred ? 'text-yellow-500' : 'text-gray-400'
          }`}
          title={isStarred ? 'Unstar' : 'Star'}
        >
          <Star size={16} fill={isStarred ? 'currentColor' : 'none'} />
        </button>
      </div>
      
      {/* Right: Edit/Preview toggle, Popout, Edit URL */}
      <div className="flex items-center gap-2">
        {/* Edit/Preview Toggle */}
        {showEditToggle && (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${viewMode === 'edit' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>Edit</span>
            <button
              type="button"
              role="switch"
              aria-checked={viewMode === 'preview'}
              onClick={() => onViewModeChange(viewMode === 'edit' ? 'preview' : 'edit')}
              className="relative w-11 h-6 rounded-full bg-blue-500 dark:bg-blue-600 p-1 shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              <span
                className="block w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ease-out"
                style={{ transform: viewMode === 'edit' ? 'translateX(0)' : 'translateX(20px)' }}
              />
            </button>
            <span className={`text-sm font-medium ${viewMode === 'preview' ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>Preview</span>
          </div>
        )}
        
        {/* Open in new tab */}
        {page?.embedUrl && (
          <a
            href={page.webViewLink || page.embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            title="Open in new tab"
          >
            <ExternalLink size={14} />
          </a>
        )}
        
        {/* Edit URL button */}
        <button
          onClick={onEditUrl}
          className="px-2.5 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
        >
          <Edit3 size={12} />
          Edit URL
        </button>
      </div>
    </div>
  );
}
