/**
 * Embed component for Google Drawings
 */
export function GoogleDrawingEmbed({ page }) {
  if (!page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No drawing to display
      </div>
    );
  }
  
  // Ensure URL uses edit format for drawings
  let src = page.embedUrl;
  if (!src.includes('/edit') && !src.includes('/preview')) {
    const fileId = page.driveFileId || src.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (fileId) {
      src = `https://docs.google.com/drawings/d/${fileId}/edit`;
    }
  }
  
  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
