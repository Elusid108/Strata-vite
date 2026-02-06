// CanvasPageComponent - Freeform canvas with containers and drawing
// Extracted from Strata index.html Section F

import { useState, useEffect, useRef, useCallback } from 'react';
import { generateId, getFormattedDate } from '../../lib/utils';
import { EMOJIS } from '../../lib/constants';
import {
  Bold, Italic, Underline, Strikethrough, CheckSquare, List, ListOrdered,
  Undo, Redo, Eraser, MousePointer2, Hand, PenTool, ZoomIn, ZoomOut
} from '../icons';
import { SlashMenu, ToolbarBtn, UniversalContainer } from '../ui';
import MapConfigPopup from './MapConfigPopup';
import MapBlock from './MapBlock';

const CanvasPageComponent = ({ page, onUpdate, saveToHistory, showNotification }) => {
  const canvasData = page.canvasData || { containers: [], paths: [], pageTitle: page.name || 'Untitled Page', transform: { x: 32, y: 32, scale: 1 } };
  
  // State
  const [containers, setContainers] = useState(canvasData.containers || []);
  const [paths, setPaths] = useState(canvasData.paths || []);
  const [pageTitle, setPageTitle] = useState(canvasData.pageTitle || page.name || 'Untitled Page');
  const [history, setHistory] = useState({ past: [], future: [] });
  const [appClipboard, setAppClipboard] = useState(null);
  const initialTransform = canvasData.transform || { x: 32, y: 32, scale: 1 };
  const [transform, setTransform] = useState(initialTransform);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState('cursor');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [slashMenu, setSlashMenu] = useState(null);
  const [mapConfigContainerId, setMapConfigContainerId] = useState(null);
  const [mapConfigPosition, setMapConfigPosition] = useState(null);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushWidth, setBrushWidth] = useState(2);
  const [dragInfo, setDragInfo] = useState(null);
  const [resizeInfo, setResizeInfo] = useState(null);
  const [drawInfo, setDrawInfo] = useState(null);
  const canvasRef = useRef(null);
  const [currentDate] = useState(getFormattedDate());
  const [showIconPicker, setShowIconPicker] = useState(false);
  const iconPickerRef = useRef(null);

  // Initialize from page data when page changes
  useEffect(() => {
    const data = page.canvasData || {};
    setContainers(data.containers || []);
    setPaths(data.paths || []);
    const title = data.pageTitle || page.name || 'Untitled Page';
    setPageTitle(title);
    const fallbackTransform = { x: 32, y: 32, scale: 1 };
    const newTransform = data.transform || fallbackTransform;
    setTransform(newTransform);
    
    // Initialize with default container if no data exists
    if (!data.containers || data.containers.length === 0) {
      setContainers([
        { id: generateId(), type: 'text', x: 100, y: 180, content: '<div>Click anywhere to start typing...</div>', width: null }
      ]);
    }
  }, [page.id]);

  // Sync pageTitle with page.name when page.name changes externally
  useEffect(() => {
    if (page.name && page.name !== pageTitle) {
      setPageTitle(page.name);
    }
  }, [page.name]);

  // Close icon picker when clicking outside
  useEffect(() => {
    if (!showIconPicker) return;
    const handleClickOutside = (e) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target)) {
        setShowIconPicker(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showIconPicker]);

  // Save to page data (including transform)
  useEffect(() => {
    onUpdate({ 
      canvasData: { 
        containers, 
        paths, 
        pageTitle,
        transform 
      },
      name: pageTitle
    });
  }, [containers, paths, pageTitle, transform]);

  // History management
  const pushToHistory = () => {
    setHistory(prev => ({
      past: [...prev.past, { containers, paths }],
      future: []
    }));
  };

  const undo = () => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);
    
    setHistory({
      past: newPast,
      future: [{ containers, paths }, ...history.future]
    });
    
    setContainers(previous.containers);
    setPaths(previous.paths);
  };

  const redo = () => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    
    setHistory({
      past: [...history.past, { containers, paths }],
      future: newFuture
    });
    
    setContainers(next.containers);
    setPaths(next.paths);
  };

  // Clipboard operations
  const handleCopy = () => {
    if (!selectedId) return;
    if (selectedType === 'container' && window.getSelection().toString().length > 0) {
      return; 
    }
    if (selectedType === 'container') {
      const item = containers.find(c => c.id === selectedId);
      if (item) setAppClipboard({ type: 'container', data: item });
    } else if (selectedType === 'path') {
      const item = paths.find(p => p.id === selectedId);
      if (item) setAppClipboard({ type: 'path', data: item });
    }
  };

  const handleCut = () => {
    if (!selectedId) return;
    if (selectedType === 'container' && window.getSelection().toString().length > 0) return;
    handleCopy();
    pushToHistory();
    if (selectedType === 'container') {
      setContainers(prev => prev.filter(c => c.id !== selectedId));
    } else {
      setPaths(prev => prev.filter(p => p.id !== selectedId));
    }
    setSelectedId(null);
    setSelectedType(null);
  };

  const handleAppPaste = () => {
    if (!appClipboard) return;
    pushToHistory();
    const newId = generateId();
    if (appClipboard.type === 'container') {
      const newContainer = {
        ...appClipboard.data,
        id: newId,
        x: appClipboard.data.x + 20,
        y: appClipboard.data.y + 20
      };
      setContainers(prev => [...prev, newContainer]);
      setSelectedId(newId);
      setSelectedType('container');
    } else if (appClipboard.type === 'path') {
      const newPath = {
        ...appClipboard.data,
        id: newId,
        x: appClipboard.data.x + 20,
        y: appClipboard.data.y + 20
      };
      setPaths(prev => [...prev, newPath]);
      setSelectedId(newId);
      setSelectedType('path');
    }
  };

  // Global event listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.altKey && e.key === '0') {
        e.preventDefault();
        const resetTransform = { x: 32, y: 32, scale: 1 };
        setTransform(resetTransform);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        handleCut();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (appClipboard && document.activeElement.tagName !== 'DIV' && document.activeElement.contentEditable !== 'true') {
           e.preventDefault();
           handleAppPaste();
        }
      }
      if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'DIV') {
        setIsSpacePressed(true);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
         if (selectedType === 'path' && selectedId) {
            pushToHistory();
            setPaths(prev => prev.filter(p => p.id !== selectedId));
            setSelectedId(null);
            setSelectedType(null);
         } else if (selectedType === 'container' && selectedId && document.activeElement.tagName !== 'DIV') {
            pushToHistory();
            setContainers(prev => prev.filter(c => c.id !== selectedId));
            setSelectedId(null);
            setSelectedType(null);
         }
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    
    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          pushToHistory();
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
             const viewportCenterX = (window.innerWidth / 2 - transform.x) / transform.scale;
             const viewportCenterY = (window.innerHeight / 2 - transform.y) / transform.scale;
             
             const newContainer = {
               id: generateId(),
               type: 'image',
               x: viewportCenterX - 100,
               y: viewportCenterY - 100,
               content: event.target.result,
               width: 300
             };
             setContainers(prev => [...prev, newContainer]);
          };
          reader.readAsDataURL(blob);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('paste', handlePaste);
    };
  }, [transform, selectedId, selectedType, history, appClipboard, containers, paths]);

  // Viewport logic - use useCallback to memoize and use ref for latest transform
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const handleWheel = useCallback((e) => {
    const currentTransform = transformRef.current;
    if (e.preventDefault) e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.1, currentTransform.scale + delta), 5);
    
    const rect = canvasRef.current ? canvasRef.current.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const mouseX = (e.clientX !== undefined ? e.clientX : rect.left + rect.width/2) - rect.left;
    const mouseY = (e.clientY !== undefined ? e.clientY : rect.top + rect.height/2) - rect.top;

    // Account for canvas-background offset (-25000px)
    const canvasOffset = 25000;
    
    // Calculate the canvas point under the mouse (in canvas coordinate space)
    const canvasPointX = (mouseX + canvasOffset - currentTransform.x) / currentTransform.scale;
    const canvasPointY = (mouseY + canvasOffset - currentTransform.y) / currentTransform.scale;

    // After zoom, keep same canvas point under mouse
    const newX = mouseX + canvasOffset - canvasPointX * newScale;
    const newY = mouseY + canvasOffset - canvasPointY * newScale;

    setTransform({ x: newX, y: newY, scale: newScale });
  }, []);

  // Attach wheel event listener with non-passive option to allow preventDefault
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    canvasElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvasElement.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const getCanvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasOffset = 25000;
    return {
      x: (e.clientX - rect.left + canvasOffset - transform.x) / transform.scale - canvasOffset,
      y: (e.clientY - rect.top + canvasOffset - transform.y) / transform.scale - canvasOffset
    };
  };

  // Viewport culling: calculate visible area in canvas coordinates
  const getViewportBounds = () => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    // Don't cull if canvas hasn't been sized yet
    if (rect.width === 0 || rect.height === 0) return null;
    
    const currentTransform = transformRef.current;
    const canvasOffset = 25000;
    const padding = 200; // Render slightly outside viewport for smooth scrolling
    
    const bounds = {
      minX: (0 + canvasOffset - currentTransform.x - padding) / currentTransform.scale - canvasOffset,
      minY: (0 + canvasOffset - currentTransform.y - padding) / currentTransform.scale - canvasOffset,
      maxX: (rect.width + canvasOffset - currentTransform.x + padding) / currentTransform.scale - canvasOffset,
      maxY: (rect.height + canvasOffset - currentTransform.y + padding) / currentTransform.scale - canvasOffset
    };
    
    return bounds;
  };

  const isElementVisible = (x, y, width, height) => {
    const viewport = getViewportBounds();
    if (!viewport) return true; // Render all if viewport unknown
    return !(
      x + (width || 0) < viewport.minX ||
      x > viewport.maxX ||
      y + (height || 0) < viewport.minY ||
      y > viewport.maxY
    );
  };

  const handlePointerDown = (e) => {
    if(e.target.setPointerCapture) {
        e.target.setPointerCapture(e.pointerId);
    }

    const coords = getCanvasCoords(e);
    
    if (isSpacePressed || tool === 'hand' || e.button === 1) {
      e.preventDefault();
      setDragInfo({
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        initialTransform: { ...transform }
      });
      return;
    }

    if (tool === 'pen') {
      pushToHistory();
      const newPath = {
        id: generateId(),
        points: [{ x: coords.x, y: coords.y }],
        color: brushColor,
        strokeWidth: brushWidth / transform.scale,
        isArrow: e.shiftKey,
        bounds: { minX: coords.x, minY: coords.y, maxX: coords.x, maxY: coords.y },
        x: 0, y: 0 
      };
      setDrawInfo({ isDrawing: true, currentPath: newPath });
      setSelectedId(null);
      setSelectedType(null);
      return;
    }

    if (tool === 'eraser') return;

    if (e.target.id === 'canvas-background' && e.button === 0) {
      pushToHistory();
      setSelectedId(null);
      setSelectedType(null);

      const newId = generateId();
      const newContainer = {
        id: newId,
        type: 'text',
        x: coords.x - 10,
        y: coords.y - 10,
        content: '',
        width: null
      };
      setContainers([...containers, newContainer]);
      setSelectedId(newId);
      setSelectedType('container');
      setTimeout(() => {
        const el = document.getElementById(`editor-${newId}`);
        if (el) el.focus();
      }, 50);
    }
  };

  const handlePointerMove = (e) => {
    const coords = getCanvasCoords(e);
    setCursorPos(coords);

    if (dragInfo && dragInfo.type === 'pan') {
      const dx = e.clientX - dragInfo.startX;
      const dy = e.clientY - dragInfo.startY;
      setTransform({
        ...transform,
        x: dragInfo.initialTransform.x + dx,
        y: dragInfo.initialTransform.y + dy
      });
      return;
    }

    if (dragInfo && dragInfo.type === 'container') {
       const dx = (e.clientX - dragInfo.startX) / transform.scale;
       const dy = (e.clientY - dragInfo.startY) / transform.scale;
       setContainers(prev => prev.map(c => 
         c.id === dragInfo.id 
           ? { ...c, x: dragInfo.initialX + dx, y: dragInfo.initialY + dy }
           : c
       ));
       return;
    }

    if (dragInfo && dragInfo.type === 'path') {
       const dx = (e.clientX - dragInfo.startX) / transform.scale;
       const dy = (e.clientY - dragInfo.startY) / transform.scale;
       setPaths(prev => prev.map(p => 
         p.id === dragInfo.id 
           ? { ...p, x: dragInfo.initialX + dx, y: dragInfo.initialY + dy }
           : p
       ));
       return;
    }

    if (resizeInfo) {
      const dx = (e.clientX - resizeInfo.startX) / transform.scale;
      const newWidth = Math.max(100, resizeInfo.initialWidth + dx);
      setContainers(prev => prev.map(c => 
        c.id === resizeInfo.id ? { ...c, width: newWidth } : c
      ));
      return;
    }

    if (drawInfo && drawInfo.isDrawing) {
      const newPoint = { x: coords.x, y: coords.y };
      const current = drawInfo.currentPath;
      const newBounds = {
          minX: Math.min(current.bounds.minX, newPoint.x),
          minY: Math.min(current.bounds.minY, newPoint.y),
          maxX: Math.max(current.bounds.maxX, newPoint.x),
          maxY: Math.max(current.bounds.maxY, newPoint.y)
      };
      const updatedPath = { 
        ...current, 
        points: [...current.points, newPoint],
        bounds: newBounds
      };
      
      setDrawInfo({ ...drawInfo, currentPath: updatedPath });
    }
  };

  const handlePointerUp = (e) => {
    if (e.target.releasePointerCapture) {
        e.target.releasePointerCapture(e.pointerId);
    }

    if (drawInfo && drawInfo.isDrawing) {
      const p = drawInfo.currentPath;
      const finalX = p.bounds.minX;
      const finalY = p.bounds.minY;
      const normalizedPoints = p.points.map(pt => ({ x: pt.x - finalX, y: pt.y - finalY }));
      const finalPath = {
          ...p,
          points: normalizedPoints,
          x: finalX,
          y: finalY,
          width: p.bounds.maxX - p.bounds.minX, 
          height: p.bounds.maxY - p.bounds.minY,
      };
      
      setPaths([...paths, finalPath]);
    }
    setDragInfo(null);
    setResizeInfo(null);
    setDrawInfo(null);
  };

  const execCmd = (command, value = null) => {
    document.execCommand(command, false, value);
    if (selectedId && selectedType === 'container') {
       const el = document.getElementById(`editor-${selectedId}`);
       if(el) el.focus();
    }
  };

  const handleList = (command) => {
    pushToHistory();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const container = document.getElementById(`editor-${selectedId}`);
    if (container) {
      const inputs = container.querySelectorAll('input[type="checkbox"]');
      inputs.forEach(input => {
          if (selection.containsNode(input, true) || selection.anchorNode.parentNode === input.parentNode) {
              if (input.parentElement) {
                  input.parentElement.style.textDecoration = 'none';
                  input.parentElement.style.color = 'inherit';
              }
              input.remove();
          }
      });
    }
    execCmd(command);
    if (container) {
       const cleanInputs = container.querySelectorAll('input[type="checkbox"]');
       cleanInputs.forEach(input => { if (input.closest('li')) input.remove(); });
    }
  };

  const handleMakeTodo = () => {
    pushToHistory();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    let anchor = selection.anchorNode;
    let li = null;
    let curr = anchor;
    while(curr && curr.parentNode) {
        if (curr.id && curr.id.startsWith('editor-')) break;
        if (curr.tagName === 'LI') { li = curr; break; }
        curr = curr.parentNode;
    }

    if (li) {
        const parentList = li.parentNode;
        const cmd = parentList.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList';
        document.execCommand(cmd); 
    }

    if (selection.isCollapsed) {
       document.execCommand('insertHTML', false, '<input type="checkbox" style="margin-right:8px;vertical-align:middle;">&nbsp;');
    } else {
       const text = selection.toString();
       if (text) {
         const startMarkerId = `start-marker-${generateId()}`;
         const endMarkerId = `end-marker-${generateId()}`;
         const lines = text.split('\n');
         const html = `<span id="${startMarkerId}"></span>` + 
                      lines.map(line => `<div><input type="checkbox" style="margin-right:8px;vertical-align:middle;">&nbsp;${line}</div>`).join('') + 
                      `<span id="${endMarkerId}"></span>`;

         document.execCommand('insertHTML', false, html);
         
         const startEl = document.getElementById(startMarkerId);
         const endEl = document.getElementById(endMarkerId);
         if (startEl && endEl) {
             const range = document.createRange();
             range.setStartAfter(startEl);
             range.setEndBefore(endEl);
             selection.removeAllRanges();
             selection.addRange(range);
             startEl.parentNode.removeChild(startEl);
             endEl.parentNode.removeChild(endEl);
         }
       } else {
         document.execCommand('insertHTML', false, '<input type="checkbox" style="margin-right:8px;vertical-align:middle;">&nbsp;');
       }
    }
    if (selectedId) {
      const el = document.getElementById(`editor-${selectedId}`);
      if(el) el.focus();
    }
  };

  const handleSlashCommand = (command, value) => {
    if (command === 'formatBlock') {
      execCmd(command, value);
    } else if (command === 'insertHTML') {
      execCmd(command, value);
    } else if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
      handleList(command);
    } else if (command === 'insertText') {
      execCmd('insertText', value);
    } else if (command === 'map') {
      // Create a new map container
      pushToHistory();
      const newContainer = {
        id: generateId(),
        type: 'map',
        x: slashMenu ? (slashMenu.x - 25000) : 0,
        y: slashMenu ? (slashMenu.y - 25000 + 20) : 0,
        width: 400,
        height: 300,
        mapData: {
          center: [40.7128, -74.0060],
          zoom: 13,
          markers: [],
          locked: false
        }
      };
      setContainers([...containers, newContainer]);
      setSelectedId(newContainer.id);
      setSelectedType('container');
      // Show config popup
      setTimeout(() => {
        const containerElement = document.getElementById(`container-${newContainer.id}`);
        if (containerElement) {
          const rect = containerElement.getBoundingClientRect();
          setMapConfigPosition({ top: rect.top, left: rect.left });
        } else {
          setMapConfigPosition({ top: slashMenu?.y || window.innerHeight / 2, left: slashMenu?.x || window.innerWidth / 2 });
        }
        setMapConfigContainerId(newContainer.id);
      }, 100);
    }
    setSlashMenu(null);
  };

  const getSvgPath = (points, isArrow) => {
    if (points.length < 2) return '';
    if (isArrow) {
       const start = points[0];
       const end = points[points.length - 1];
       return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
       d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  const getArrowHead = (points) => {
    if (points.length < 2) return null;
    const end = points[points.length - 1];
    const start = points[0];
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = 10;
    const x1 = end.x - headLen * Math.cos(angle - Math.PI / 6);
    const y1 = end.y - headLen * Math.sin(angle - Math.PI / 6);
    const x2 = end.x - headLen * Math.cos(angle + Math.PI / 6);
    const y2 = end.y - headLen * Math.sin(angle + Math.PI / 6);
    return `M ${end.x} ${end.y} L ${x1} ${y1} M ${end.x} ${end.y} L ${x2} ${y2}`;
  };

  const renderDefaultToolbar = () => (
    <div className="flex gap-1 items-center">
       <div className="flex gap-1 border-r border-gray-300 pr-2 mr-1">
         <ToolbarBtn icon={<Bold size={18}/>} onClick={() => execCmd('bold')} />
         <ToolbarBtn icon={<Italic size={18}/>} onClick={() => execCmd('italic')} />
         <ToolbarBtn icon={<Underline size={18}/>} onClick={() => execCmd('underline')} />
         <ToolbarBtn icon={<Strikethrough size={18}/>} onClick={() => execCmd('strikeThrough')} />
       </div>
       <div className="flex gap-1 border-r border-gray-300 pr-2 mr-1">
         <ToolbarBtn icon={<CheckSquare size={18}/>} onClick={handleMakeTodo} />
         <ToolbarBtn icon={<List size={18}/>} onClick={() => handleList('insertUnorderedList')} />
         <ToolbarBtn icon={<ListOrdered size={18}/>} onClick={() => handleList('insertOrderedList')} />
       </div>
       <div className="flex gap-1">
         <ToolbarBtn icon={<Undo size={18}/>} onClick={undo} title="Undo (Ctrl+Z)" />
         <ToolbarBtn icon={<Redo size={18}/>} onClick={redo} title="Redo (Ctrl+Y)" />
       </div>
    </div>
  );

  const renderDrawToolbar = () => (
    <div className="flex gap-3 items-center">
       <div className="flex gap-1 border-r border-gray-300 pr-3">
          {['#000000', '#FF0000', '#0000FF', '#008000'].map(c => (
             <button
                key={c}
                onClick={() => tool !== 'eraser' && setBrushColor(c)}
                disabled={tool === 'eraser'}
                className={`w-6 h-6 rounded-full border border-gray-200 transition-transform 
                   ${brushColor === c ? 'scale-110 ring-2 ring-purple-400' : ''}
                   ${tool === 'eraser' ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ backgroundColor: c }}
             />
          ))}
       </div>
       <div className="flex items-center gap-2 border-r border-gray-300 pr-3">
          <div className="w-1 h-1 bg-black rounded-full"/>
          <input 
            type="range" 
            min="1" 
            max="10" 
            value={brushWidth} 
            onChange={(e) => setBrushWidth(parseInt(e.target.value))}
            className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="w-3 h-3 bg-black rounded-full"/>
       </div>
       <div className="flex gap-1 border-r border-gray-300 pr-3">
          <ToolbarBtn 
             icon={<Eraser size={18} className={tool === 'eraser' ? 'text-red-600' : ''}/>} 
             onClick={() => setTool(tool === 'eraser' ? 'pen' : 'eraser')} 
             active={tool === 'eraser'}
             title="Eraser Mode"
          />
       </div>
       <div className="flex gap-1">
         <ToolbarBtn icon={<Undo size={18}/>} onClick={undo} title="Undo (Ctrl+Z)" />
         <ToolbarBtn icon={<Redo size={18}/>} onClick={redo} title="Redo (Ctrl+Y)" />
       </div>
    </div>
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden font-sans bg-[#f8f8f8] dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      <style>{`
        ul { list-style-type: disc; padding-left: 20px; }
        ul ul { list-style-type: circle; padding-left: 20px; }
        ul ul ul { list-style-type: square; padding-left: 20px; }
        ol { list-style-type: decimal; padding-left: 20px; }
        ol ol { list-style-type: lower-alpha; padding-left: 20px; }
        ol ol ol { list-style-type: lower-roman; padding-left: 20px; }
        input[type=range]::-webkit-slider-thumb {
           -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%;
           background: #7e22ce; cursor: pointer; margin-top: -4px;
        }
      `}</style>

      {/* Toolbar */}
      <div className="py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 shadow-sm shrink-0 z-50 justify-between select-none">
        <div className="flex items-center gap-2">
           <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 gap-1 mr-4">
              <ToolbarBtn active={tool === 'cursor'} onClick={() => setTool('cursor')} icon={<MousePointer2 size={18}/>} title="Select (V)" />
              <ToolbarBtn active={tool === 'hand' || isSpacePressed} onClick={() => setTool('hand')} icon={<Hand size={18}/>} title="Pan (Space / Middle Mouse)" />
              <ToolbarBtn active={tool === 'pen' || tool === 'eraser'} onClick={() => setTool('pen')} icon={<PenTool size={18} className={tool === 'pen' || tool === 'eraser' ? 'text-purple-600' : ''}/>} title="Draw (P)" />
           </div>
           <div className="h-6 w-[1px] bg-gray-300 mx-2"/>
           {(tool === 'pen' || tool === 'eraser') ? renderDrawToolbar() : renderDefaultToolbar()}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
           <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded border">
              <span className="text-xs font-mono">{Math.round(transform.scale * 100)}%</span>
              <div className="flex gap-1">
                 <button className="hover:bg-gray-200 p-0.5 rounded" onClick={() => handleWheel({altKey: true, deltaY: 100, clientX: window.innerWidth/2, clientY: window.innerHeight/2, preventDefault: () => {}})}>
                   <ZoomOut size={14}/>
                 </button>
                 <button className="hover:bg-gray-200 p-0.5 rounded" onClick={() => handleWheel({altKey: true, deltaY: -100, clientX: window.innerWidth/2, clientY: window.innerHeight/2, preventDefault: () => {}})}>
                   <ZoomIn size={14}/>
                 </button>
              </div>
           </div>
        </div>
      </div>

      {/* Canvas */}
      <div 
        ref={canvasRef}
        className={`flex-1 overflow-hidden relative 
          ${(tool === 'hand' || isSpacePressed) ? 'cursor-grab active:cursor-grabbing' : 
            (tool === 'pen') ? 'cursor-crosshair' : 
            (tool === 'eraser') ? 'cursor-cell' : 'cursor-default'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
         <div 
           id="canvas-background"
           className="absolute origin-top-left w-full h-full canvas-grid"
           style={{
             left: '-25000px',
             top: '-25000px',
             transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
             backgroundSize: '20px 20px',
             backgroundPosition: `${(25000 % 20)}px ${(25000 % 20)}px`,
             width: '50000px',
             height: '50000px',
             pointerEvents: 'auto'
           }}
         >
           <div className="absolute w-[600px] select-none pointer-events-none" style={{ top: '25000px', left: '25000px' }}>
             <div className="flex items-start gap-3 pointer-events-auto">
               <div className="relative" ref={iconPickerRef}>
                 <div 
                   className="text-5xl drop-shadow-sm select-none cursor-pointer hover:bg-gray-100/50 rounded p-2 transition-colors"
                   onClick={() => setShowIconPicker(!showIconPicker)}
                 >
                   {page.icon || '🎨'}
                 </div>
                 {showIconPicker && (
                   <div className="absolute top-full left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-xl rounded-lg p-2 w-64 h-64 overflow-y-auto animate-fade-in" style={{ marginTop: '4px' }}>
                     <div className="grid grid-cols-5 gap-1">
                       {EMOJIS.map(emoji => (
                         <div key={emoji} className="text-2xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded text-center" onClick={() => { onUpdate({ icon: emoji }); setShowIconPicker(false); }}>{emoji}</div>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
               <div className="flex-1">
                 <input 
                   value={pageTitle}
                   onChange={(e) => { 
                     const newTitle = e.target.value;
                     setPageTitle(newTitle);
                     onUpdate({ name: newTitle });
                   }}
                   onBlur={() => {
                     if (pageTitle !== page.name) {
                       onUpdate({ name: pageTitle });
                     }
                   }}
                   className="text-5xl font-light text-gray-800 dark:text-gray-200 bg-transparent border-none outline-none w-full placeholder-gray-300 dark:placeholder-gray-500"
                   placeholder="Page Title"
                 />
                 <div className="text-sm text-gray-400 dark:text-gray-500 mt-2 flex gap-4">
                   <span>{currentDate.date}</span>
                   <span>{currentDate.time}</span>
                 </div>
               </div>
             </div>
           </div>

           {/* Paths */}
           {paths.filter(p => isElementVisible(p.x, p.y, p.width, p.height)).map(p => (
              <div
                key={p.id}
                className={`absolute pointer-events-auto hover:ring-1 hover:ring-purple-200 ${selectedId === p.id && selectedType === 'path' ? 'ring-1 ring-purple-500 bg-purple-50/10' : ''}`}
                style={{ left: p.x + 25000, top: p.y + 25000, width: p.width, height: p.height, cursor: tool === 'cursor' ? 'move' : (tool === 'eraser' ? 'cell' : 'inherit') }}
                onPointerDown={(e) => {
                   if (e.button === 1) return;
                   if (tool === 'cursor') {
                      e.stopPropagation();
                      setSelectedId(p.id);
                      setSelectedType('path');
                      pushToHistory();
                      setDragInfo({ type: 'path', startX: e.clientX, startY: e.clientY, initialX: p.x, initialY: p.y, id: p.id });
                   } else if (tool === 'eraser') {
                      e.stopPropagation();
                      pushToHistory();
                      setPaths(prev => prev.filter(item => item.id !== p.id));
                   }
                }}
                onPointerEnter={(e) => {
                   if (tool === 'eraser' && e.buttons === 1) {
                      pushToHistory();
                      setPaths(prev => prev.filter(item => item.id !== p.id));
                   }
                }}
              >
                 <svg width="100%" height="100%" viewBox={`0 0 ${p.width} ${p.height}`} className="overflow-visible block">
                    <path d={getSvgPath(p.points, p.isArrow)} stroke={p.color} strokeWidth={p.strokeWidth * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    {p.isArrow && <path d={getArrowHead(p.points)} stroke={p.color} strokeWidth={p.strokeWidth * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                 </svg>
              </div>
           ))}

           {/* Active Draw - render live drawing path */}
           {drawInfo && drawInfo.isDrawing && drawInfo.currentPath.points.length > 0 && (
             <svg className="absolute pointer-events-none overflow-visible z-50" style={{ left: '0', top: '0', width: '50000px', height: '50000px' }}>
               <g>
                  <path d={getSvgPath(drawInfo.currentPath.points.map(p => ({ x: p.x + 25000, y: p.y + 25000 })), drawInfo.currentPath.isArrow)} stroke={drawInfo.currentPath.color} strokeWidth={drawInfo.currentPath.strokeWidth * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  {drawInfo.currentPath.isArrow && <path d={getArrowHead(drawInfo.currentPath.points.map(p => ({ x: p.x + 25000, y: p.y + 25000 })))} stroke={drawInfo.currentPath.color} strokeWidth={drawInfo.currentPath.strokeWidth * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
               </g>
             </svg>
           )}

           {/* Containers */}
           {containers.filter(container => {
             const containerHeight = container.type === 'image' ? 200 : (container.type === 'map' ? (container.height || 300) : 100);
             return isElementVisible(container.x, container.y, container.width || 200, containerHeight);
           }).map(container => (
             <UniversalContainer
               key={container.id}
               container={container}
               scale={transform.scale}
               isSelected={selectedId === container.id}
               onSelect={() => { setSelectedId(container.id); setSelectedType('container'); }}
               onUpdate={(fields) => setContainers(prev => prev.map(c => c.id === container.id ? { ...c, ...fields } : c))}
               onDragStart={(e) => {
                 if (e.button === 1) return;
                 e.stopPropagation();
                 pushToHistory();
                 setSelectedId(container.id);
                 setSelectedType('container');
                 setDragInfo({ type: 'container', startX: e.clientX, startY: e.clientY, initialX: container.x, initialY: container.y, id: container.id });
               }}
               onResizeStart={(e) => {
                 e.stopPropagation();
                 e.preventDefault();
                 pushToHistory();
                 setSelectedId(container.id);
                 setSelectedType('container');
                 const el = document.getElementById(`container-${container.id}`);
                 setResizeInfo({ isResizing: true, startX: e.clientX, initialWidth: container.width || (el ? el.offsetWidth : 200), id: container.id });
               }}
               onDelete={() => { pushToHistory(); setContainers(prev => prev.filter(c => c.id !== container.id)); }}
               onSlash={(x, y) => setSlashMenu({ x, y, containerId: container.id })}
               MapBlock={MapBlock}
             />
           ))}
         </div>
      </div>
      {slashMenu && <SlashMenu x={slashMenu.x} y={slashMenu.y} onSelect={handleSlashCommand} onClose={() => setSlashMenu(null)} />}
      {mapConfigContainerId && mapConfigPosition && (() => {
          const configContainer = containers.find(c => c.id === mapConfigContainerId);
          return configContainer && (
              <MapConfigPopup
                  blockId={mapConfigContainerId}
                  currentData={configContainer.mapData}
                  onSave={(mapData) => {
                      setContainers(prev => prev.map(c => 
                          c.id === mapConfigContainerId 
                              ? { ...c, mapData } 
                              : c
                      ));
                  }}
                  onClose={() => {
                      setMapConfigContainerId(null);
                      setMapConfigPosition(null);
                  }}
                  position={mapConfigPosition}
              />
          );
      })()}
    </div>
  );
};

export default CanvasPageComponent;
