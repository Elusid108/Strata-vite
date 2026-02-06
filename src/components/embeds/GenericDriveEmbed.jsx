/**
 * Fallback embed component for generic Drive files
 */
export function GenericDriveEmbed({ page }) {
  if (!page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No file to display
      </div>
    );
  }
  
  // Ensure URL uses preview endpoint
  let src = page.embedUrl;
  if (page.driveFileId && !src.includes('/preview')) {
    src = `https://drive.google.com/file/d/${page.driveFileId}/preview`;
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
