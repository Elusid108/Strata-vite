/**
 * Embed component for Google Vids
 */
export function GoogleVidEmbed({ page }) {
  if (!page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No video to display
      </div>
    );
  }
  
  // Ensure URL uses correct format
  let src = page.embedUrl;
  if (!src.includes('vids.google.com')) {
    const fileId = page.driveFileId;
    if (fileId) {
      src = `https://vids.google.com/watch/${fileId}`;
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
