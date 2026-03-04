export function DrawIoEmbed({ page }) {
  if (!page?.embedUrl) return <div className="h-full flex items-center justify-center text-gray-500">Invalid Draw.io URL</div>;
  return (
    <iframe
      src={page.embedUrl}
      className="w-full h-full border-none bg-white"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
