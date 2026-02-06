/**
 * Embed component for Google MyMaps
 */
export function GoogleMapEmbed({ page }) {
  if (!page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No map to display
      </div>
    );
  }
  
  // Ensure URL uses embed format
  let src = page.embedUrl;
  if (!src.includes('/embed')) {
    const fileId = page.driveFileId || 
      src.match(/mid=([a-zA-Z0-9-_]+)/)?.[1] ||
      src.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (fileId) {
      src = `https://www.google.com/maps/d/embed?mid=${fileId}`;
    }
  }
  
  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; geolocation"
      allowFullScreen
    />
  );
}
