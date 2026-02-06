import { getEmbedUrlForType } from '../../lib/embed-utils';

/**
 * Embed component for Google Docs, Sheets, and Slides
 * Supports edit/preview modes
 */
export function GoogleDocEmbed({ page, viewMode = 'edit' }) {
  if (!page?.driveFileId && !page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No document to display
      </div>
    );
  }
  
  // Generate URL based on view mode
  let src;
  if (page.driveFileId) {
    src = getEmbedUrlForType(page.type, page.driveFileId, viewMode);
  } else {
    // Fallback to modifying existing embedUrl
    src = page.embedUrl;
    if (viewMode === 'preview' && src.includes('/edit')) {
      src = src.replace('/edit', '/preview');
    } else if (viewMode === 'edit' && src.includes('/preview')) {
      src = src.replace('/preview', '/edit');
    }
  }
  
  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}
