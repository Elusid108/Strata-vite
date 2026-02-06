import { useState, useEffect } from 'react';
import { EmbedToolbar } from './EmbedToolbar';
import { GoogleDocEmbed } from './GoogleDocEmbed';
import { GoogleFormEmbed } from './GoogleFormEmbed';
import { GoogleMapEmbed } from './GoogleMapEmbed';
import { GoogleDrawingEmbed } from './GoogleDrawingEmbed';
import { GoogleVidEmbed } from './GoogleVidEmbed';
import { PdfEmbed } from './PdfEmbed';
import { GenericDriveEmbed } from './GenericDriveEmbed';

/**
 * Main embed page component that routes to the correct service-specific component
 */
export function EmbedPage({
  page,
  onUpdate,
  onToggleStar,
  onEditUrl,
  isStarred = false
}) {
  // View mode state (edit/preview) - persist in page data or local
  const [viewMode, setViewMode] = useState(() => {
    // Check if page has stored viewMode or detect from URL
    if (page?.viewMode) return page.viewMode;
    if (page?.embedUrl?.includes('/preview')) return 'preview';
    return 'edit';
  });
  
  // Update view mode when page changes
  useEffect(() => {
    if (page?.viewMode) {
      setViewMode(page.viewMode);
    } else if (page?.embedUrl?.includes('/preview')) {
      setViewMode('preview');
    } else {
      setViewMode('edit');
    }
  }, [page?.id]);
  
  // Handle view mode change
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    // Optionally persist to page data
    if (onUpdate) {
      onUpdate({ viewMode: mode });
    }
  };
  
  // Render the appropriate embed component based on page type
  const renderEmbed = () => {
    const type = page?.type;
    
    switch (type) {
      case 'doc':
      case 'sheet':
      case 'slide':
        return (
          <GoogleDocEmbed
            page={page}
            viewMode={viewMode}
          />
        );
      case 'form':
        return <GoogleFormEmbed page={page} />;
      case 'map':
        return <GoogleMapEmbed page={page} />;
      case 'drawing':
        return <GoogleDrawingEmbed page={page} />;
      case 'vid':
        return <GoogleVidEmbed page={page} />;
      case 'pdf':
        return <PdfEmbed page={page} />;
      case 'site':
      case 'script':
      case 'drive':
      default:
        return <GenericDriveEmbed page={page} />;
    }
  };
  
  if (!page) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No page selected
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      <EmbedToolbar
        page={page}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onEditUrl={onEditUrl}
        onToggleStar={onToggleStar}
        isStarred={isStarred}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {renderEmbed()}
      </div>
    </div>
  );
}
