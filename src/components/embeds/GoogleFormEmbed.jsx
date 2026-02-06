/**
 * Embed component for Google Forms
 * Forms are always in view-only mode (viewform)
 */
export function GoogleFormEmbed({ page }) {
  if (!page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No form to display
      </div>
    );
  }
  
  // Ensure URL uses /viewform
  let src = page.embedUrl;
  if (!src.includes('/viewform')) {
    const fileId = page.driveFileId || src.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (fileId) {
      src = `https://docs.google.com/forms/d/${fileId}/viewform`;
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
