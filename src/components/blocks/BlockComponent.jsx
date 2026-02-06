// BlockComponent - Block wrapper/renderer component
// Extracted from Strata index.html (lines 2244-2479)

import { memo, useState } from 'react';
import { BG_COLORS } from '../../lib/constants';
import { getDropIndicatorClass, getYouTubeID } from '../../lib/utils';
import { GripVertical, LinkIcon, ChevronRight } from '../icons';
import { ImageLightbox } from '../ui';
import ContentBlock from './ContentBlock';
import ListBlock from './ListBlock';

// Note: MapBlock will be added in Section F
// For now, we'll render a placeholder for map blocks

const BlockComponent = memo(({ 
  block, 
  rowId, 
  colId, 
  onUpdate, 
  onDelete, 
  onInsertAfter, 
  autoFocusId, 
  onRequestFocus, 
  onDragStart, 
  onDragOver, 
  onDrop, 
  dropTarget, 
  isSelected, 
  onHandleClick, 
  onFocus, 
  isLastBlock, 
  onMapConfig,
  // Google API props - will be provided in Section G
  isAuthenticated = false,
  GoogleAPI = null
}) => {
  const isTarget = dropTarget && dropTarget.blockId === block.id;
  const indicatorStyle = isTarget ? getDropIndicatorClass(dropTarget.position) : '';

  const [showLightbox, setShowLightbox] = useState(false);
  const bgClass = block.backgroundColor ? BG_COLORS[block.backgroundColor] : '';
  // Only add bg-blue-50/50 if there's no background color, so selection doesn't obscure block colors
  const borderClass = isSelected 
    ? `ring-2 ring-blue-400 ring-offset-2 ${!block.backgroundColor ? 'bg-blue-50/50' : ''}` 
    : 'hover:bg-gray-50 dark:hover:bg-gray-800';

  const handleConvert = (newType) => {
    const isMedia = ['image', 'video', 'link'].includes(newType);
    const isStructural = ['divider', 'map'].includes(newType);
    const listContent = (newType === 'ul' || newType === 'ol') ? '<li></li>' : (newType === 'todo' ? '<li data-checked="false"></li>' : null);
    // Check if content is a slash command (starts with /) - if so, clear it
    const isSlashCommand = block.content && /^\/\w+$/.test(block.content.trim());
    const content = listContent !== null ? listContent : ((isMedia || isStructural || isSlashCommand) ? '' : block.content);
    onUpdate(block.id, { 
      type: newType, 
      content,
      url: isMedia ? '' : block.url 
    });
    if (newType === 'divider') {
      // Ensure divider is visible by forcing a re-render
      setTimeout(() => {
        onInsertAfter(block.id, 'text');
      }, 0);
    } else if (newType === 'map') {
      // Initialize map data and show config popup
      onUpdate(block.id, { 
        type: 'map', 
        mapData: { 
          center: [40.7128, -74.0060], 
          zoom: 13, 
          markers: [],
          locked: false
        } 
      });
      // Show config popup - use longer timeout to ensure React has re-rendered
      if (onMapConfig) {
        setTimeout(() => {
          const blockElement = document.querySelector(`[data-block-id="${block.id}"]`);
          if (blockElement) {
            const rect = blockElement.getBoundingClientRect();
            onMapConfig(block.id, { top: rect.top, left: rect.left });
          } else {
            // Fallback position - try again after another short delay
            setTimeout(() => {
              const retryElement = document.querySelector(`[data-block-id="${block.id}"]`);
              if (retryElement) {
                const rect = retryElement.getBoundingClientRect();
                onMapConfig(block.id, { top: rect.top, left: rect.left });
              } else {
                onMapConfig(block.id, { top: window.innerHeight / 2, left: window.innerWidth / 2 });
              }
            }, 100);
          }
        }, 200);
      }
    } else if (onRequestFocus) {
      onRequestFocus(block.id);
    }
  };

  const handleMediaKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onInsertAfter(block.id, 'text');
      } else {
        e.target.blur();
      }
    }
  };

  const renderTextContent = () => {
    const props = {
      html: block.content,
      onChange: (content) => onUpdate(block.id, { content }),
      onInsertBelow: () => onInsertAfter(block.id, 'text'),
      onInsertTextBelow: () => onInsertAfter(block.id, 'text'),
      blockId: block.id,
      autoFocusId,
      onFocus,
      onConvert: handleConvert,
      onDelete: () => onDelete(block.id),
      isLastBlock,
      placeholder: "Type '/' for commands"
    };

    switch (block.type) {
      case 'h1': return <ContentBlock tagName="h1" className="text-3xl font-bold mb-4" {...props} placeholder="Heading 1" />;
      case 'h2': return <ContentBlock tagName="h2" className="text-2xl font-bold mb-3" {...props} placeholder="Heading 2" />;
      case 'h3': return <ContentBlock tagName="h3" className="text-xl font-bold mb-2" {...props} placeholder="Heading 3" />;
      case 'h4': return <ContentBlock tagName="h4" className="text-lg font-semibold mb-2 text-gray-600 dark:text-gray-400" {...props} placeholder="Heading 4" />;
      case 'ul': return <ListBlock listType="ul" {...props} onExitList={() => onInsertAfter(block.id, 'text')} onInsertBelow={() => onInsertAfter(block.id, 'text')} />;
      case 'ol': return <ListBlock listType="ol" {...props} onExitList={() => onInsertAfter(block.id, 'text')} onInsertBelow={() => onInsertAfter(block.id, 'text')} />;
      case 'todo': return <ListBlock listType="todo" {...props} onExitList={() => onInsertAfter(block.id, 'text')} onInsertBelow={() => onInsertAfter(block.id, 'text')} />;
      default: return <ContentBlock tagName="div" className="leading-relaxed min-h-[1.5em]" {...props} />;
    }
  };

  return (
    <>
      <div 
        draggable
        onDragStart={(e) => onDragStart(e, block, rowId, colId)}
        onDragOver={(e) => onDragOver(e, block.id, [rowId, colId])}
        onDrop={onDrop}
        className={`group relative flex gap-2 items-start p-1 rounded transition-all ${indicatorStyle} ${bgClass} ${borderClass}`}
      >
        <div 
          className="mt-1 cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100 active:cursor-grabbing text-gray-400 block-handle" 
          onClick={(e) => onHandleClick(e, block.id)}
        >
          <GripVertical size={16} />
        </div>
        <div className="flex-1 min-w-0">
          {['text', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'todo'].includes(block.type) && renderTextContent()}

          {block.type === 'image' && (
            <div className="space-y-2">
              {block.url ? (
                <div className="group/image relative">
                  <img 
                    src={block.url} 
                    alt="Content" 
                    className="max-w-full rounded shadow-sm max-h-[400px] object-cover hover:scale-[1.02] cursor-zoom-in transition-transform" 
                    onClick={() => setShowLightbox(true)} 
                  />
                </div>
              ) : (
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-center border-2 border-dashed border-gray-300 dark:border-gray-500">
                  <input 
                    className="w-full p-2 border rounded text-xs mb-2 dark:bg-gray-800 dark:border-gray-600 dark:text-white" 
                    placeholder="Paste image URL..." 
                    onBlur={(e) => onUpdate(block.id, { url: e.target.value })} 
                    onKeyDown={handleMediaKeyDown} 
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {block.type === 'video' && (
            <div className="space-y-2">
              {block.url ? (
                <div className="aspect-video w-full rounded overflow-hidden shadow-sm bg-black">
                  <iframe 
                    width="100%" 
                    height="100%" 
                    src={`https://www.youtube.com/embed/${getYouTubeID(block.url)}`} 
                    frameBorder="0" 
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-center border-2 border-dashed border-gray-300 dark:border-gray-500">
                  <input 
                    className="w-full p-2 border rounded text-xs mb-2 dark:bg-gray-800 dark:border-gray-600 dark:text-white" 
                    placeholder="Paste YouTube URL..." 
                    onBlur={(e) => onUpdate(block.id, { url: e.target.value })} 
                    onKeyDown={handleMediaKeyDown} 
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {block.type === 'link' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-100 dark:border-blue-800 flex items-center gap-3">
              <LinkIcon size={20} className="text-blue-500"/>
              <div className="flex-1 min-w-0">
                <input 
                  className="w-full bg-transparent font-medium text-blue-700 dark:text-blue-300 outline-none" 
                  value={block.content} 
                  onChange={(e) => onUpdate(block.id, { content: e.target.value })} 
                  onKeyDown={handleMediaKeyDown} 
                  placeholder="Link Title" 
                  autoFocus
                />
                <input 
                  className="w-full bg-transparent text-xs text-blue-400 dark:text-blue-400 outline-none" 
                  value={block.url || ''} 
                  onChange={(e) => onUpdate(block.id, { url: e.target.value })} 
                  placeholder="https://example.com" 
                />
              </div>
              {block.url && (
                <a 
                  href={block.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-blue-100 dark:hover:bg-blue-800 rounded text-blue-600 dark:text-blue-400"
                >
                  <ChevronRight size={16}/>
                </a>
              )}
            </div>
          )}

          {block.type === 'divider' && (
            <div className="py-2 my-2">
              <hr className="border-t-2 border-gray-200 dark:border-gray-600" />
            </div>
          )}

          {block.type === 'map' && (
            <div className="space-y-2" data-block-id={block.id}>
              {/* MapBlock will be added in Section F */}
              <div className="bg-gray-100 dark:bg-gray-700 p-8 rounded text-center border-2 border-dashed border-gray-300 dark:border-gray-500">
                <p className="text-gray-500 dark:text-gray-400">Map component (Section F)</p>
                <p className="text-xs text-gray-400 mt-1">
                  Center: {block.mapData?.center?.[0]?.toFixed(4)}, {block.mapData?.center?.[1]?.toFixed(4)}
                </p>
              </div>
            </div>
          )}

          {block.type === 'gdoc' && (
            <div className="space-y-2">
              {block.driveFileId ? (
                <div className="border rounded overflow-hidden shadow-sm dark:border-gray-600">
                  {block.mimeType === 'application/vnd.google-apps.document' && (
                    <iframe 
                      src={`https://docs.google.com/document/d/${block.driveFileId}/preview`}
                      className="w-full h-96 border-0"
                      title="Google Doc"
                    />
                  )}
                  {block.mimeType === 'application/vnd.google-apps.spreadsheet' && (
                    <iframe 
                      src={`https://docs.google.com/spreadsheets/d/${block.driveFileId}/preview`}
                      className="w-full h-96 border-0"
                      title="Google Sheet"
                    />
                  )}
                  {block.mimeType === 'application/vnd.google-apps.presentation' && (
                    <iframe 
                      src={`https://docs.google.com/presentation/d/${block.driveFileId}/preview`}
                      className="w-full h-96 border-0"
                      title="Google Slide"
                    />
                  )}
                  {block.webViewLink && (
                    <div className="p-2 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-600 flex items-center justify-between">
                      <a 
                        href={block.webViewLink} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Open in Google Drive
                      </a>
                      <button 
                        onClick={() => onUpdate(block.id, { driveFileId: null, webViewLink: null, mimeType: null })} 
                        className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded text-center border-2 border-dashed border-gray-300 dark:border-gray-500">
                  {GoogleAPI && isAuthenticated ? (
                    <button 
                      onClick={() => {
                        GoogleAPI.showDrivePicker((file) => {
                          onUpdate(block.id, {
                            driveFileId: file.id,
                            webViewLink: file.url,
                            mimeType: file.mimeType
                          });
                        });
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Select Google Drive File
                    </button>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Sign in with Google to embed Drive files
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showLightbox && block.url && (
        <ImageLightbox src={block.url} onClose={() => setShowLightbox(false)} />
      )}
    </>
  );
});

BlockComponent.displayName = 'BlockComponent';

export default BlockComponent;
