export function MiroEmbed({ page }) {
  if (!page?.embedUrl) return <div className="h-full flex items-center justify-center text-gray-500">Invalid Miro URL</div>;
  return (
    <iframe
      src={page.embedUrl}
      className="w-full h-full border-none bg-white"
      allowFullScreen
      allow="fullscreen; clipboard-read; clipboard-write"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
