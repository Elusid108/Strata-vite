// UniversalContainer - Container component for canvas elements (text, images, maps)
// Extracted from Strata index.html (lines 2532-2671)

import { useRef, useLayoutEffect } from 'react';
import { GripHorizontal, X } from '../icons';

const UniversalContainer = ({ 
  container, 
  scale, 
  isSelected, 
  onSelect, 
  onUpdate, 
  onDragStart, 
  onResizeStart, 
  onDelete, 
  onSlash,
  MapBlock // MapBlock component passed as prop to avoid circular dependency
}) => {
  const contentRef = useRef(null);

  useLayoutEffect(() => {
    if (container.type === 'text' && contentRef.current && contentRef.current.innerHTML !== container.content) {
      contentRef.current.innerHTML = container.content;
    }
  }, [container.content, container.type]);

  const handleInput = (e) => {
    if (contentRef.current) {
      const val = contentRef.current.innerHTML;
      if (val.trim() === '/') {
        const rect = contentRef.current.getBoundingClientRect();
        onSlash(rect.left, rect.bottom);
      }
      onUpdate({ content: val });
    }
  };

  const handleContentClick = (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      const checkbox = e.target;
      if (checkbox.checked) {
        checkbox.setAttribute('checked', 'true');
        const parent = checkbox.parentElement;
        const isSharedParent = parent.querySelectorAll('input[type="checkbox"]').length > 1;
        if (parent && parent !== contentRef.current && !isSharedParent) {
          parent.style.textDecoration = 'line-through';
          parent.style.color = '#9ca3af'; 
        }
      } else {
        checkbox.removeAttribute('checked');
        if (checkbox.parentElement && checkbox.parentElement !== contentRef.current) {
          checkbox.parentElement.style.textDecoration = 'none';
          checkbox.parentElement.style.color = 'inherit';
        }
      }
      if (contentRef.current) {
        onUpdate({ content: contentRef.current.innerHTML });
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    }
    if (e.key === 'Enter') {
      const selection = window.getSelection();
      const anchorNode = selection.anchorNode;
      const parentBlock = anchorNode.nodeType === 3 ? anchorNode.parentNode : anchorNode;
      const currentLine = parentBlock.closest('div') || parentBlock;
      if (currentLine.innerHTML && currentLine.innerHTML.includes('type="checkbox"')) {
        e.preventDefault();
        document.execCommand('insertParagraph');
        document.execCommand('insertHTML', false, '<input type="checkbox" style="margin-right:8px;vertical-align:middle;">&nbsp;');
      }
    }
  };

  return (
    <div 
      id={`container-${container.id}`}
      className={`absolute group flex flex-col ${isSelected ? 'z-30' : 'z-20'}`}
      style={{ 
        left: container.x + 25000, 
        top: container.y + 25000, 
        width: container.width ? `${container.width}px` : 'fit-content',
        maxWidth: container.type === 'text' ? '600px' : 'none',
        minWidth: '100px'
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Drag Handle */}
      <div 
        className={`h-4 w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 border-b-0 rounded-t cursor-move flex items-center justify-center transition-opacity z-50
          ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDragStart(e);
        }}
        style={{ pointerEvents: 'auto', position: 'relative', zIndex: 50 }}
      >
        <GripHorizontal size={12} className="text-gray-400" />
      </div>

      {/* Content Area */}
      <div className={`
        relative bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50
        ${isSelected ? 'border border-gray-300 dark:border-gray-600 ring-1 ring-purple-500/20' : 'border border-transparent hover:border-gray-200 dark:hover:border-gray-600'}
      `}>
        {isSelected && (
          <>
            {/* Delete Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(); }} 
              className="absolute -right-2 -top-2 bg-white dark:bg-gray-700 rounded-full p-1 shadow border dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 z-50"
            >
              <X size={10} />
            </button>
            
            {/* Resize Handle */}
            <div 
              className="absolute top-0 right-[-6px] h-full w-4 cursor-ew-resize flex items-center justify-center z-40 opacity-0 hover:opacity-100"
              onMouseDown={onResizeStart}
            >
              <div className="w-1 h-8 bg-blue-300 rounded-full"/>
            </div>
          </>
        )}

        {/* Content based on type */}
        {container.type === 'text' ? (
          <div
            id={`editor-${container.id}`}
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            className="outline-none px-3 py-2 min-h-[1em] text-gray-900 dark:text-gray-100"
            onInput={handleInput}
            onClick={handleContentClick}
            onKeyDown={handleKeyDown}
            onBlur={handleInput}
            style={{ cursor: 'text' }}
          />
        ) : container.type === 'map' && MapBlock ? (
          <div className="p-0" style={{ height: container.height || 300 }}>
            <MapBlock 
              data={container.mapData || { center: [40.7128, -74.0060], zoom: 13, markers: [], locked: false }}
              onUpdate={(mapData) => onUpdate({ mapData, height: container.height || 300 })}
              readOnly={false}
              height={container.height || 300}
              disableScrollWheel={true}
              locked={container.mapData?.locked || false}
            />
          </div>
        ) : (
          <div className="p-1">
            <img src={container.content} alt="Pasted" className="w-full h-auto pointer-events-none" />
          </div>
        )}
      </div>
    </div>
  );
};

export default UniversalContainer;
