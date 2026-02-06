// ListBlock - List block component (ul, ol, todo)
// Extracted from Strata index.html (lines 1853-2242)

import { memo, useRef, useEffect, useLayoutEffect } from 'react';
import { normalizeListContent } from '../../lib/utils';

const ListBlock = memo(({ 
  listType, 
  html, 
  onChange, 
  onInsertBelow, 
  onExitList, 
  blockId, 
  autoFocusId, 
  onFocus, 
  onConvert, 
  onDelete, 
  isLastBlock 
}) => {
  const listRef = useRef(null);
  const todoContainerRef = useRef(null);
  const todoFirstContentRef = useRef(null);
  const todoLastSerializedRef = useRef(null);
  const isLocked = useRef(false);

  const safeHtml = normalizeListContent(html, listType);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current;
    if (!isLocked.current && el.innerHTML !== safeHtml) {
      el.innerHTML = safeHtml;
    }
  }, [safeHtml]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.innerHTML = normalizeListContent(html, listType);
  }, [blockId]);

  useLayoutEffect(() => {
    if (autoFocusId !== blockId || !listRef.current) return;
    const el = listRef.current;
    el.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, [autoFocusId, blockId]);

  useLayoutEffect(() => {
    if (listType === 'todo' && autoFocusId === blockId && todoFirstContentRef.current) {
      todoFirstContentRef.current.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(todoFirstContentRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [listType, autoFocusId, blockId]);

  const getCurrentLi = () => {
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    while (node && node !== listRef.current) {
      if (node.nodeName === 'LI') return node;
      node = node.parentNode;
    }
    return null;
  };

  const handleInput = () => {
    isLocked.current = true;
    if (listRef.current) onChange(listRef.current.innerHTML);
  };

  const handleBlur = () => { isLocked.current = false; };

  const handlePaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData?.getData('text/html');
    const plain = e.clipboardData?.getData('text/plain') || '';
    if (!listRef.current) return;
    const fragment = document.createDocumentFragment();
    if (html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      const pastedLis = div.querySelectorAll('li');
      if (pastedLis.length > 0) {
        pastedLis.forEach(li => {
          const clone = li.cloneNode(true);
          if (listType === 'todo' && !clone.hasAttribute('data-checked')) clone.setAttribute('data-checked', 'false');
          fragment.appendChild(clone);
        });
      }
    }
    if (fragment.childNodes.length === 0 && plain) {
      const lines = plain.split(/\r?\n/).filter(Boolean);
      lines.forEach(line => {
        const li = document.createElement('li');
        if (listType === 'todo') li.setAttribute('data-checked', 'false');
        li.textContent = line;
        fragment.appendChild(li);
      });
    }
    if (fragment.childNodes.length === 0) return;
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(fragment);
    range.collapse(false);
    isLocked.current = true;
    onChange(listRef.current.innerHTML);
    isLocked.current = false;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const el = listRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel.rangeCount === 0) return;

      if (onExitList) {
        const lis = el.querySelectorAll('li');
        const lastLi = lis[lis.length - 1];
        if (lastLi && lastLi.innerText.trim() === '' && lis.length >= 1) {
          const range = sel.getRangeAt(0);
          if (lastLi.contains(range.startContainer) || lastLi === range.startContainer) {
            e.preventDefault();
            lastLi.remove();
            const newContent = el.innerHTML || (listType === 'todo' ? '<li data-checked="false"></li>' : '<li></li>');
            onChange(newContent);
            onExitList();
            return;
          }
        }
      }

      if (listType === 'ul' || listType === 'ol') return;
      if (listType === 'todo') {
        setTimeout(() => {
          if (listRef.current) {
            const lis = listRef.current.querySelectorAll('li');
            lis.forEach(li => { if (!li.hasAttribute('data-checked')) li.setAttribute('data-checked', 'false'); });
            isLocked.current = true;
            onChange(listRef.current.innerHTML);
            isLocked.current = false;
          }
        }, 0);
      }
      return;
    }

    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      if (listType === 'ul' || listType === 'ol') {
        const li = getCurrentLi();
        if (!li) return;
        const list = li.parentNode;
        if (!list || list === listRef.current) return;
        const parentLi = list.parentNode;
        if (!parentLi || parentLi.nodeName !== 'LI') return;
        // Move li after the parent li
        const grandparent = parentLi.parentNode;
        if (!grandparent) return;
        grandparent.insertBefore(li, parentLi.nextSibling);
        // Clean up empty nested list
        if (list.childNodes.length === 0) list.remove();
        isLocked.current = true;
        if (listRef.current) onChange(listRef.current.innerHTML);
        // Restore cursor to end of the li's own text (not nested content)
        requestAnimationFrame(() => {
          if (li && li.isConnected) {
            const sel = window.getSelection();
            const range = document.createRange();
            // Find the first text node directly in the li (not in nested lists)
            let textNode = null;
            for (const child of li.childNodes) {
              if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                textNode = child;
                break;
              }
            }
            if (textNode) {
              range.setStart(textNode, textNode.length);
              range.setEnd(textNode, textNode.length);
            } else {
              range.setStart(li, 0);
              range.setEnd(li, 0);
            }
            sel.removeAllRanges();
            sel.addRange(range);
          }
        });
      }
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (listType === 'todo') {
        const li = getCurrentLi();
        if (li) {
          const checked = li.getAttribute('data-checked') === 'true';
          li.setAttribute('data-checked', checked ? 'false' : 'true');
          isLocked.current = true;
          if (listRef.current) onChange(listRef.current.innerHTML);
        }
        return;
      }
      if (listType === 'ul' || listType === 'ol') {
        const li = getCurrentLi();
        if (!li) return;
        const prev = li.previousElementSibling;
        if (prev) {
          let nest = prev.querySelector(listType === 'ul' ? 'ul' : 'ol');
          if (!nest) {
            nest = document.createElement(listType === 'ul' ? 'ul' : 'ol');
            prev.appendChild(nest);
          }
          nest.appendChild(li);
          isLocked.current = true;
          if (listRef.current) onChange(listRef.current.innerHTML);
          // Restore cursor to end of the li's own text (not nested content)
          requestAnimationFrame(() => {
            if (li && li.isConnected) {
              const sel = window.getSelection();
              const range = document.createRange();
              // Find the first text node directly in the li (not in nested lists)
              let textNode = null;
              for (const child of li.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                  textNode = child;
                  break;
                }
              }
              if (textNode) {
                range.setStart(textNode, textNode.length);
                range.setEnd(textNode, textNode.length);
              } else {
                range.setStart(li, 0);
                range.setEnd(li, 0);
              }
              sel.removeAllRanges();
              sel.addRange(range);
            }
          });
        }
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onInsertBelow();
      return;
    }

    if (e.key === 'Backspace') {
      const el = listRef.current;
      if (!el) return;
      const text = el.innerText.trim();
      if (text === '' && !isLastBlock && onDelete) {
        e.preventDefault();
        onDelete();
      }
    }
  };

  const listClassName = listType === 'ul'
    ? 'list-disc list-outside ml-4 outline-none min-h-[1.5em] cursor-text text-gray-800 dark:text-gray-100 [&_ul]:list-[circle] [&_ul_ul]:list-[square]'
    : listType === 'ol'
    ? 'list-decimal list-outside ml-4 outline-none min-h-[1.5em] cursor-text text-gray-800 dark:text-gray-100 [&_ol]:list-[lower-alpha] [&_ol_ol]:list-[lower-roman]'
    : '';

  // Todo list rendering
  if (listType === 'todo') {
    const parseTodoItems = (htmlStr) => {
      const div = document.createElement('div');
      div.innerHTML = normalizeListContent(htmlStr || '', 'todo');
      const lis = div.querySelectorAll('li');
      return Array.from(lis).map(li => ({
        checked: li.getAttribute('data-checked') === 'true',
        html: li.innerHTML || ''
      }));
    };
    
    const items = parseTodoItems(safeHtml);
    if (items.length === 0) items.push({ checked: false, html: '' });

    const serializeTodoItems = (container) => {
      if (!container) return '';
      const rows = container.querySelectorAll('.todo-row');
      const parts = [];
      rows.forEach(row => {
        const cb = row.querySelector('input[type="checkbox"]');
        const content = row.querySelector('.todo-row-content');
        const checked = cb ? cb.checked : false;
        const html = content ? content.innerHTML : '';
        parts.push('<li data-checked="' + checked + '">' + html + '</li>');
      });
      return parts.join('') || '<li data-checked="false"></li>';
    };

    const handleTodoInput = () => {
      if (todoContainerRef.current) {
        const serialized = serializeTodoItems(todoContainerRef.current);
        todoLastSerializedRef.current = serialized;
        isLocked.current = true;
        onChange(serialized);
      }
    };

    const handleTodoKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const container = todoContainerRef.current;
        if (!container) return;
        const row = e.target.closest('.todo-row');
        if (!row) return;
        const content = row.querySelector('.todo-row-content');
        if (content && e.target === content) {
          e.preventDefault();
          e.stopPropagation();
          const text = content.innerText.trim();
          if (onExitList && !text && row === container.querySelector('.todo-row:last-child')) {
            row.remove();
            const serialized = serializeTodoItems(container) || '<li data-checked="false"></li>';
            todoLastSerializedRef.current = serialized;
            onChange(serialized);
            onExitList();
            return;
          }
          const serialized = serializeTodoItems(container);
          const withNewRow = serialized + '<li data-checked="false"></li>';
          todoLastSerializedRef.current = withNewRow;
          onChange(withNewRow);
          requestAnimationFrame(function() {
            const rows = todoContainerRef.current ? todoContainerRef.current.querySelectorAll('.todo-row') : [];
            const lastContent = rows.length ? rows[rows.length - 1].querySelector('.todo-row-content') : null;
            if (lastContent) {
              lastContent.focus();
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(lastContent);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          });
        }
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        const row = e.target.closest('.todo-row');
        if (row) {
          e.preventDefault();
          const cb = row.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.checked = !cb.checked;
            const serialized = serializeTodoItems(todoContainerRef.current);
            todoLastSerializedRef.current = serialized;
            onChange(serialized);
          }
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onInsertBelow();
      }
      if (e.key === 'Backspace') {
        const container = todoContainerRef.current;
        if (!container) return;
        const row = e.target.closest('.todo-row');
        const content = row ? row.querySelector('.todo-row-content') : null;
        if (content && e.target === content && content.innerText.trim() === '' && row && !isLastBlock && onDelete) {
          const rows = container.querySelectorAll('.todo-row');
          if (rows.length === 1) { e.preventDefault(); onDelete(); }
        }
      }
    };

    const handleTodoCheck = (idx) => {
      const parsed = parseTodoItems(safeHtml);
      if (idx < 0 || idx >= parsed.length) return;
      const newParsed = parsed.map((item, i) => ({ ...item, checked: i === idx ? !item.checked : item.checked }));
      const serialized = newParsed.map(item => '<li data-checked="' + item.checked + '">' + (item.html || '') + '</li>').join('') || '<li data-checked="false"></li>';
      todoLastSerializedRef.current = serialized;
      onChange(serialized);
    };

    useLayoutEffect(() => {
      if (listType !== 'todo' || !todoContainerRef.current) return;
      if (todoLastSerializedRef.current !== null && safeHtml === todoLastSerializedRef.current) {
        todoLastSerializedRef.current = null;
        return;
      }
      const rows = todoContainerRef.current.querySelectorAll('.todo-row');
      const parsed = parseTodoItems(safeHtml);
      parsed.forEach((item, i) => {
        if (rows[i]) {
          const contentEl = rows[i].querySelector('.todo-row-content');
          const cb = rows[i].querySelector('input[type="checkbox"]');
          if (contentEl && contentEl.innerHTML !== item.html) contentEl.innerHTML = item.html;
          if (cb) cb.checked = !!item.checked;
        }
      });
    }, [listType, safeHtml]);

    const itemsToRender = parseTodoItems(safeHtml);
    if (itemsToRender.length === 0) itemsToRender.push({ checked: false, html: '' });

    return (
      <div ref={todoContainerRef} className="list-block-todo space-y-1 ml-0 text-gray-800 dark:text-gray-100" onKeyDown={handleTodoKeyDown}>
        {itemsToRender.map((item, idx) => (
          <div key={blockId + '-' + idx} className="todo-row flex items-center gap-2">
            <input
              type="checkbox"
              className="flex-shrink-0 w-5 h-5 rounded border-2 border-gray-400 dark:border-gray-500 cursor-pointer"
              tabIndex={-1}
              checked={item.checked}
              onChange={() => handleTodoCheck(idx)}
            />
            <div
              ref={idx === 0 ? todoFirstContentRef : undefined}
              className="todo-row-content flex-1 min-w-0 outline-none min-h-[1.5em] empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-500 text-gray-800 dark:text-gray-100"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="List item..."
              onInput={handleTodoInput}
              onBlur={handleBlur}
              onFocus={() => onFocus && onFocus()}
            />
          </div>
        ))}
      </div>
    );
  }

  // Regular ul/ol list rendering
  const ListTag = listType === 'ul' ? 'ul' : 'ol';
  return (
    <ListTag
      ref={listRef}
      className={listClassName}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onBlur={handleBlur}
      onFocus={() => onFocus && onFocus()}
    />
  );
});

ListBlock.displayName = 'ListBlock';

export default ListBlock;
