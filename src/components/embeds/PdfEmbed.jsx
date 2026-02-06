/**
 * Embed component for PDF files
 * Handles both Drive-hosted PDFs and external PDF URLs
 */
export function PdfEmbed({ page }) {
  if (!page?.embedUrl) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        No PDF to display
      </div>
    );
  }
  
  let src = page.embedUrl;
  
  // If it's a Drive file, use preview endpoint
  if (page.driveFileId && !src.includes('viewerng')) {
    src = `https://drive.google.com/file/d/${page.driveFileId}/preview`;
  }
  // If it's an external URL stored in originalUrl, use viewer
  else if (page.originalUrl && !src.includes('viewerng')) {
    src = `https://drive.google.com/viewerng/viewer?embedded=true&url=${encodeURIComponent(page.originalUrl)}`;
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
