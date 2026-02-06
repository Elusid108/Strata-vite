// ContentBlock - Text/heading content editing component
// Extracted from Strata index.html (lines 1590-1833)

import { memo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { SLASH_COMMANDS } from '../../lib/constants';

const ContentBlock = memo(({ 
  html, 
  tagName, 
  className, 
  placeholder, 
  onChange, 
  onInsertBelow, 
  onInsertTextBelow, 
  onExitList, 
  blockId, 
  autoFocusId, 
  onFocus, 
  onConvert, 
  onDelete, 
  isLastBlock 
}) => {
  const contentEditableRef = useRef(null);
  const isLocked = useRef(false);
  const [slashMenu, setSlashMenu] = useState({ 
    open: false, 
    filter: '', 
    selectedIndex: 0, 
    position: { top: 0, left: 0 } 
  });

  const processHtml = (rawHtml, tag) => {
    if ((tag === 'ul' || tag === 'ol')) {
      if (!rawHtml || rawHtml.trim() === '' || rawHtml === '<br>') return '<li>&nbsp;</li>';
      if (!rawHtml.includes('<li>')) return `<li>${rawHtml}</li>`;
    }
    return rawHtml;
  };

  const safeHtml = processHtml(html, tagName);

  const filteredCommands = slashMenu.open ? SLASH_COMMANDS.filter(cmd =>
    cmd.aliases.some(alias => alias.startsWith(slashMenu.filter.toLowerCase())) ||
    cmd.label.toLowerCase().includes(slashMenu.filter.toLowerCase())
  ) : [];

  useEffect(() => {
    if (!contentEditableRef.current) return;
    const el = contentEditableRef.current;
    if (!isLocked.current && el.innerHTML !== safeHtml) {
      el.innerHTML = safeHtml;
    }
  }, [safeHtml]);

  useEffect(() => {
    if (!contentEditableRef.current) return;
    contentEditableRef.current.innerHTML = processHtml(html, tagName);
  }, [blockId, tagName]);

  useLayoutEffect(() => {
    if (autoFocusId !== blockId || !contentEditableRef.current) return;
    const el = contentEditableRef.current;
    el.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, [autoFocusId, blockId]);

  const getCaretPosition = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rect = range.getClientRects()[0];
      if (rect) return { top: rect.bottom + 5, left: rect.left };
    }
    if (contentEditableRef.current) {
      const rect = contentEditableRef.current.getBoundingClientRect();
      return { top: rect.bottom + 5, left: rect.left };
    }
    return { top: 0, left: 0 };
  };

  const selectSlashCommand = (cmd) => {
    setSlashMenu({ open: false, filter: '', selectedIndex: 0, position: { top: 0, left: 0 } });
    // Clear the contentEditable content before converting to ensure slash command text is removed
    if (contentEditableRef.current) {
      contentEditableRef.current.innerHTML = '';
    }
    // Also clear React state so handleConvert uses empty content
    onChange('');
    onConvert(cmd.type);
  };

  const handleInput = (e) => {
    isLocked.current = true;
    const text = e.currentTarget.innerText;
    onChange(e.currentTarget.innerHTML);
    
    // Check for slash command trigger
    if (text.startsWith('/')) {
      const filter = text.substring(1);
      const position = getCaretPosition();
      setSlashMenu({ open: true, filter, selectedIndex: 0, position });
    } else {
      if (slashMenu.open) setSlashMenu({ open: false, filter: '', selectedIndex: 0, position: { top: 0, left: 0 } });
    }
  };
  
  const handleBlur = () => { 
    isLocked.current = false;
    // Delay closing to allow click on menu items
    setTimeout(() => setSlashMenu(prev => ({ ...prev, open: false })), 150);
  };
  
  const handleFocus = () => { if (onFocus) onFocus(); };

  const handleKeyDown = (e) => {
    // Handle slash menu navigation
    if (slashMenu.open && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % filteredCommands.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, selectedIndex: prev.selectedIndex === 0 ? filteredCommands.length - 1 : prev.selectedIndex - 1 }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashCommand(filteredCommands[slashMenu.selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu({ open: false, filter: '', selectedIndex: 0, position: { top: 0, left: 0 } });
        return;
      }
    }

    if (e.key === 'Enter') {
      // Slash commands (fallback for when menu is closed but text starts with /)
      if (contentEditableRef.current) {
        const text = contentEditableRef.current.innerText.trim();
        if (text.startsWith('/')) {
          const cmd = text.substring(1).toLowerCase();
          const matchedCmd = SLASH_COMMANDS.find(c => c.aliases.includes(cmd));
          if (matchedCmd) {
            e.preventDefault();
            e.stopPropagation();
            // Clear the contentEditable content before converting
            contentEditableRef.current.innerHTML = '';
            // Also clear React state so handleConvert uses empty content
            onChange('');
            onConvert(matchedCmd.type);
            // For divider, don't create a new block - the conversion handles it
            if (matchedCmd.type === 'divider') {
              return;
            }
            return;
          }
        }
      }

      // Headings: Enter always creates new block below (browsers may insert <br> in h1 by default)
      if (!e.shiftKey && (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4')) {
        e.preventDefault();
        e.stopPropagation();
        onInsertBelow();
        return;
      }

      // Standard behavior for text blocks: Enter creates new block below
      if (!e.shiftKey) {
        // For regular text blocks, Enter creates a new block below
        // But if we have onExitList and content is empty, exit the list instead
        if (onExitList && contentEditableRef.current) {
          const text = contentEditableRef.current.innerText.trim();
          if (text === '') {
            e.preventDefault();
            onExitList();
            return;
          }
        }
        e.preventDefault();
        onInsertBelow();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      // Use onInsertTextBelow if available (for todo blocks), otherwise onInsertBelow
      if (onInsertTextBelow) {
        onInsertTextBelow();
      } else {
        onInsertBelow();
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
    }

    if ((e.ctrlKey || e.metaKey)) {
      switch(e.key.toLowerCase()) {
        case 'b': e.preventDefault(); document.execCommand('bold', false, null); break;
        case 'i': e.preventDefault(); document.execCommand('italic', false, null); break;
        case 'u': e.preventDefault(); document.execCommand('underline', false, null); break;
        default: break;
      }
    }
    
    // Handle Backspace in empty blocks
    if (e.key === 'Backspace') {
      const text = contentEditableRef.current?.innerText?.trim() || '';
      if (text === '') {
        // Empty block
        if (tagName === 'div') {
          // Text block - delete if not last block
          if (!isLastBlock && onDelete) {
            e.preventDefault();
            onDelete();
          }
        } else {
          // Non-text block (h1, h2, h3, h4) - convert to text
          e.preventDefault();
          onConvert('text');
        }
      }
    }
  };

  const Tag = tagName;
  
  return (
    <>
      <Tag
        ref={contentEditableRef}
        className={`outline-none empty:before:content-[attr(placeholder)] empty:before:text-gray-300 dark:empty:before:text-gray-500 cursor-text text-gray-800 dark:text-gray-100 ${className}`}
        contentEditable
        suppressContentEditableWarning
        placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
      {slashMenu.open && filteredCommands.length > 0 && (
        <div 
          className="fixed z-[10000] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-[220px] max-h-[300px] overflow-y-auto animate-fade-in"
          style={{ top: slashMenu.position.top, left: slashMenu.position.left }}
        >
          {filteredCommands.map((cmd, index) => (
            <div
              key={cmd.cmd}
              className={`px-3 py-2 cursor-pointer flex items-center gap-3 ${index === slashMenu.selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              onMouseDown={(e) => { e.preventDefault(); selectSlashCommand(cmd); }}
              onMouseEnter={() => setSlashMenu(prev => ({ ...prev, selectedIndex: index }))}
            >
              <span className="text-gray-400 font-mono text-sm">/{cmd.cmd}</span>
              <div className="flex-1">
                <div className="font-medium text-sm dark:text-white">{cmd.label}</div>
                <div className="text-xs text-gray-400">{cmd.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
});

ContentBlock.displayName = 'ContentBlock';

export default ContentBlock;
