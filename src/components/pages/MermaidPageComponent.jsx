// MermaidPageComponent - Mermaid diagrams and code execution (JS/HTML/Python)
// Extracted from Strata index.html Section F

import { useState, useEffect, useRef, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { MERMAID_MIN_SCALE, MERMAID_MAX_SCALE, MERMAID_ZOOM_STEP, PYODIDE_URL } from '../../lib/constants';
import { Star, ZoomIn, ZoomOut, Maximize2, Download } from '../icons';

// Helper functions
const getCodeType = (p) => p.codeType || 'mermaid';

const getSandboxedTemplate = (userCode, type) => {
  const tailwind = '<script src="https://cdn.tailwindcss.com"></script>';
  const react = `
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  `;

  if (type === 'html') {
    return `${tailwind}\n${react}\n${userCode}`;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        ${tailwind}
        ${react}
      </head>
      <body class="bg-white dark:bg-gray-900 m-0 p-0">
        <div id="root"></div>
        <script type="text/babel">
          ${userCode.replace(/<\/script>/gi, '<\\/script>')}
        </script>
      </body>
    </html>
  `;
};

// Pyodide loading utilities
let pyodidePromise = null;

async function loadPyodideScript() {
  if (typeof window.loadPyodide === 'function') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PYODIDE_URL;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Pyodide'));
    document.head.appendChild(s);
  });
}

async function ensurePyodide() {
  if (window.__pyodide) return window.__pyodide;
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    await loadPyodideScript();
    const pyodide = await window.loadPyodide();
    window.__pyodide = pyodide;
    return pyodide;
  })();
  return pyodidePromise;
}

async function runPythonCode(code, pyodide) {
  const out = [];
  const append = (msg) => { out.push(msg); };
  const p = pyodide || await ensurePyodide();
  try {
    p.setStdout({ batched: append });
    p.setStderr({ batched: append });
    await p.loadPackagesFromImports(code);
    const result = p.runPython(code);
    if (result !== undefined) {
      try { out.push(String(result)); } catch (_) {}
    }
    return { output: out.join(''), error: null };
  } catch (e) {
    const errMsg = (e && e.message) ? e.message : String(e);
    return { output: out.join(''), error: errMsg };
  }
}

const MermaidPageComponent = ({ 
  page, 
  onUpdate, 
  saveToHistory, 
  showNotification, 
  updateLocalName, 
  syncRenameToDrive, 
  toggleStar, 
  activeNotebookId, 
  activeTabId 
}) => {
  const codeType = getCodeType(page);
  const [localCode, setLocalCode] = useState(page.code ?? page.mermaidCode ?? page.codeContent ?? '');
  const [renderedCode, setRenderedCode] = useState(page.code ?? page.mermaidCode ?? page.codeContent ?? '');
  const [iframeKey, setIframeKey] = useState(0);
  const [viewMode, setViewMode] = useState(page.viewMode || 'split');
  const [splitRatio, setSplitRatio] = useState(page.splitRatio || 50);
  const [svgContent, setSvgContent] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [mermaidError, setMermaidError] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [iframeError, setIframeError] = useState(null);
  const [pythonOutput, setPythonOutput] = useState('');
  const [pythonError, setPythonError] = useState(null);
  const [pythonLoading, setPythonLoading] = useState(false);
  const [pythonRunning, setPythonRunning] = useState(false);
  const svgContainerRef = useRef(null);
  const mermaidBindFunctionsRef = useRef(null);
  const mermaidInitRef = useRef(null); // Store current theme instead of boolean
  const viewportRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const persistViewportRef = useRef(null);
  const hasAppliedInitialFitRef = useRef(false);
  const renderIdRef = useRef(0); // Guard against race conditions from double-render
  const savedViewport = page.mermaidViewport || { x: 0, y: 0, scale: 1 };
  const [transform, setTransform] = useState(savedViewport);
  const [dragInfo, setDragInfo] = useState(null);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const languageMenuRef = useRef(null);
  const splitContainerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const getLanguageExtensions = () => {
    switch (codeType) {
      case 'javascript': return [javascript({ jsx: true })];
      case 'python': return [python()];
      case 'html': return [html()];
      default: return []; // raw and mermaid use plain text
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(e.target)) {
        setShowLanguageMenu(false);
      }
    };
    if (showLanguageMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLanguageMenu]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    const v = page.mermaidViewport || { x: 0, y: 0, scale: 1 };
    setTransform(v);
    transformRef.current = v;
  }, [page.id]);

  const persistViewport = useCallback(() => {
    if (persistViewportRef.current) clearTimeout(persistViewportRef.current);
    persistViewportRef.current = setTimeout(() => {
      onUpdate({ mermaidViewport: transform });
      persistViewportRef.current = null;
    }, 300);
  }, [transform, onUpdate]);

  const isMermaidWithContent = codeType === 'mermaid' && renderedCode.trim().length > 0;
  useEffect(() => {
    if (!isMermaidWithContent || mermaidError) return;
    persistViewport();
    return () => { if (persistViewportRef.current) clearTimeout(persistViewportRef.current); };
  }, [transform, isMermaidWithContent, mermaidError, persistViewport]);

  const hasDiagram = isMermaidWithContent && !mermaidError;

  // Reset local state when switching to a different page
  useEffect(() => {
    const pageCode = page.code ?? page.mermaidCode ?? page.codeContent ?? '';
    setLocalCode(pageCode);
    setRenderedCode(pageCode);
    setIframeKey((k) => k + 1);
    setViewMode(page.viewMode || 'split');
    setSplitRatio(page.splitRatio || 50);
  }, [page.id]);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    onUpdate({ viewMode: mode });
  };

  const handleDragStart = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
  };

  const resetSplit = () => {
    setSplitRatio(50);
    onUpdate({ splitRatio: 50 });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      let newRatio = ((e.clientX - rect.left) / rect.width) * 100;
      newRatio = Math.max(10, Math.min(90, newRatio));
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        document.body.style.cursor = 'default';
        setSplitRatio((prev) => {
          onUpdate({ splitRatio: prev });
          return prev;
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onUpdate]);

  const saveCodeToApp = (codeToSave) => {
    const currentCode = page.code ?? page.mermaidCode ?? page.codeContent ?? '';
    if (codeToSave !== currentCode) {
      const payload = { code: codeToSave };
      if (codeType === 'mermaid') payload.mermaidCode = codeToSave;
      onUpdate(payload);
    }
  };

  const handleRun = () => {
    setIframeError(null);
    setRenderedCode(localCode);
    setIframeKey((k) => k + 1);
    saveCodeToApp(localCode);
    if (saveToHistory) saveToHistory();
    if (showNotification) showNotification('Code saved & updated', 'success');
  };

  const handleCodeTypeChange = (newType) => {
    const payload = { codeType: newType, code: localCode };
    if (newType === 'mermaid') payload.mermaidCode = localCode;
    onUpdate(payload);
  };

  const clampScale = (s) => Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, s));

  const calculateZoomToFit = () => {
    if (!svgContainerRef.current || !viewportRef.current) return { x: 0, y: 0, scale: 1 };
    const svg = svgContainerRef.current.querySelector('svg');
    if (!svg) return { x: 0, y: 0, scale: 1 };

    // We explicitly set these in the render phase now
    let svgWidth = parseFloat(svg.getAttribute('width'));
    let svgHeight = parseFloat(svg.getAttribute('height'));

    // Fallbacks just in case
    if (!svgWidth || !svgHeight) {
      const viewBox = svg.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/\s+/);
        svgWidth = parseFloat(parts[2]);
        svgHeight = parseFloat(parts[3]);
      }
    }
    if (!svgWidth || !svgHeight) {
      const bbox = svg.getBoundingClientRect();
      svgWidth = bbox.width;
      svgHeight = bbox.height;
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const viewportWidth = viewportRect.width || 0;
    const viewportHeight = viewportRect.height || 0;

    if (svgWidth <= 0 || svgHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return { x: 0, y: 0, scale: 1 };
    }

    // Use 0.9 for a clean 10% margin around the diagram
    const scaleX = (viewportWidth * 0.9) / svgWidth;
    const scaleY = (viewportHeight * 0.9) / svgHeight;
    const scale = clampScale(Math.min(scaleX, scaleY));

    const x = (viewportWidth - (svgWidth * scale)) / 2;
    const y = (viewportHeight - (svgHeight * scale)) / 2;

    return { x, y, scale };
  };

  const handleMermaidZoom = (delta, towardCenter = true) => {
    setTransform(prev => {
      const rect = viewportRef.current ? viewportRef.current.getBoundingClientRect() : null;
      const cx = rect ? rect.width / 2 : 0;
      const cy = rect ? rect.height / 2 : 0;
      const newScale = clampScale(prev.scale + delta);
      if (!towardCenter || !rect) {
        return { ...prev, scale: newScale };
      }
      const dx = (cx - prev.x) / prev.scale;
      const dy = (cy - prev.y) / prev.scale;
      const newX = cx - dx * newScale;
      const newY = cy - dy * newScale;
      return { x: newX, y: newY, scale: newScale };
    });
  };

  const handleMermaidFit = () => {
    const fitTransform = calculateZoomToFit();
    setTransform(fitTransform);
  };

  const handleZoomIn = () => handleMermaidZoom(MERMAID_ZOOM_STEP);
  const handleZoomOut = () => handleMermaidZoom(-MERMAID_ZOOM_STEP);

  const downloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.name || 'diagram'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMermaidWheel = useCallback((e) => {
    e.preventDefault();
    const rect = viewportRef.current ? viewportRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const zoomSensitivity = 0.002;

    setTransform(prev => {
      const delta = -e.deltaY * zoomSensitivity * prev.scale;
      const newScale = clampScale(prev.scale + delta);
      const dx = (vx - prev.x) / prev.scale;
      const dy = (vy - prev.y) / prev.scale;
      const newX = vx - dx * newScale;
      const newY = vy - dy * newScale;
      return { x: newX, y: newY, scale: newScale };
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleMermaidWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleMermaidWheel);
  }, [handleMermaidWheel, hasDiagram]);

  const handleMermaidPointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    if (e.button === 1 || e.button === 0) {
      e.preventDefault();
      const el = e.currentTarget;
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      setDragInfo({ type: 'pan', startX: e.clientX, startY: e.clientY, initial: { ...transformRef.current } });
    }
  };

  const handleMermaidPointerMove = (e) => {
    if (!dragInfo || dragInfo.type !== 'pan') return;
    const dx = e.clientX - dragInfo.startX;
    const dy = e.clientY - dragInfo.startY;
    setTransform({ ...dragInfo.initial, x: dragInfo.initial.x + dx, y: dragInfo.initial.y + dy });
  };

  const handleMermaidPointerUp = (e) => {
    if (dragInfo) {
      try {
        const el = viewportRef.current;
        if (el && el.releasePointerCapture && e.pointerId !== undefined) el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      setDragInfo(null);
    }
  };

  // Mermaid rendering effect - uses mermaid.render() to get SVG string
  useEffect(() => {
    if (codeType !== 'mermaid' || !renderedCode.trim()) {
      setMermaidError(null);
      setSvgContent('');
      hasAppliedInitialFitRef.current = false;
      return;
    }
    if (typeof window.mermaid === 'undefined') {
      setMermaidError('Mermaid library not loaded');
      hasAppliedInitialFitRef.current = false;
      return;
    }
    
    renderIdRef.current += 1;
    const currentRenderId = renderIdRef.current;
    hasAppliedInitialFitRef.current = false;
    
    const isDarkMode = document.documentElement.classList.contains('dark');
    const mermaidTheme = isDarkMode ? 'dark' : 'default';
    
    if (!mermaidInitRef.current || mermaidInitRef.current !== mermaidTheme) {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: mermaidTheme });
        mermaidInitRef.current = mermaidTheme;
      } catch (e) {
        setMermaidError('Failed to initialize Mermaid');
        return;
      }
    }
    setMermaidError(null);
    
    const uniqueId = `mermaid-${page.id}-${currentRenderId}`;
    window.mermaid.render(uniqueId, renderedCode.trim())
      .then(({ svg, bindFunctions }) => {
        if (currentRenderId !== renderIdRef.current) return;
        mermaidBindFunctionsRef.current = bindFunctions;

        // Parse SVG to force absolute pixel dimensions for perfect scaling
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');

        if (svgEl) {
          svgEl.style.maxWidth = 'none'; // Stop Mermaid from fighting our zoom scale
          const viewBox = svgEl.getAttribute('viewBox');
          if (viewBox) {
            const parts = viewBox.split(/\s+/);
            const vw = parseFloat(parts[2]);
            const vh = parseFloat(parts[3]);
            if (vw && vh) {
              svgEl.setAttribute('width', vw);
              svgEl.setAttribute('height', vh);
            }
          }
          setSvgContent(svgEl.outerHTML);
        } else {
          setSvgContent(svg);
        }

        setTimeout(() => {
          if (currentRenderId !== renderIdRef.current) return;
          if (svgContainerRef.current && viewportRef.current) {
            const fitTransform = calculateZoomToFit();
            setTransform(fitTransform);
            hasAppliedInitialFitRef.current = true;
          }
        }, 50);
      })
      .catch(() => {
        if (currentRenderId !== renderIdRef.current) return;
        setMermaidError('Invalid Mermaid syntax');
        setSvgContent('');
        hasAppliedInitialFitRef.current = false;
      });
  }, [page.id, codeType, renderedCode]);

  // Call mermaid bindFunctions after SVG is in DOM
  useEffect(() => {
    if (svgContent && mermaidBindFunctionsRef.current && svgContainerRef.current) {
      try {
        mermaidBindFunctionsRef.current(svgContainerRef.current);
      } catch (_) {}
      mermaidBindFunctionsRef.current = null;
    }
  }, [svgContent]);

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      const newTheme = isDarkMode ? 'dark' : 'light';
      if (newTheme !== currentTheme) {
        setCurrentTheme(newTheme);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [currentTheme]);

  // Re-render diagram when theme changes
  useEffect(() => {
    if (codeType !== 'mermaid' || !renderedCode.trim()) return;
    
    const isDarkMode = currentTheme === 'dark';
    const mermaidTheme = isDarkMode ? 'dark' : 'default';
    
    if (mermaidInitRef.current !== mermaidTheme) {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: mermaidTheme });
        mermaidInitRef.current = mermaidTheme;
        const uniqueId = `mermaid-theme-${page.id}-${Date.now()}`;
        window.mermaid.render(uniqueId, renderedCode.trim())
          .then(({ svg, bindFunctions }) => {
            mermaidBindFunctionsRef.current = bindFunctions;
            setSvgContent(svg);
          })
          .catch(() => setMermaidError('Invalid Mermaid syntax'));
      } catch (e) {
        setMermaidError('Failed to reinitialize Mermaid');
      }
    }
  }, [codeType, renderedCode, currentTheme, page.id]);

  // Python execution effect
  useEffect(() => {
    if (codeType !== 'python' || !renderedCode.trim()) {
      setPythonOutput('');
      setPythonError(null);
      setPythonLoading(false);
      setPythonRunning(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setPythonError(null);
      setPythonLoading(true);
      setPythonRunning(false);
      setPythonOutput('');
      try {
        if (cancelled) return;
        const pyodide = await ensurePyodide();
        if (cancelled) return;
        setPythonLoading(false);
        setPythonRunning(true);
        const { output, error } = await runPythonCode(renderedCode, pyodide);
        if (cancelled) return;
        setPythonOutput(output);
        setPythonError(error);
      } catch (e) {
        if (!cancelled) setPythonError((e && e.message) ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setPythonLoading(false);
          setPythonRunning(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [page.id, codeType, renderedCode]);

  // Handle name update - fallback if updateLocalName not provided
  const handleNameChange = (e) => {
    if (updateLocalName) {
      updateLocalName('page', page.id, e.target.value);
    } else {
      onUpdate({ name: e.target.value });
    }
  };

  const handleNameBlur = () => {
    if (syncRenameToDrive) {
      syncRenameToDrive('page', page.id);
    }
    setEditingName(false);
  };

  const handleStarClick = () => {
    if (toggleStar) {
      toggleStar(page.id, activeNotebookId, activeTabId);
    } else {
      onUpdate({ starred: !page.starred });
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <span className="text-2xl text-gray-600 dark:text-gray-400">{page.icon || '</>'}</span>
        {editingName ? (
          <input
            className="font-semibold text-gray-700 dark:text-gray-200 outline-none border-b-2 border-blue-400 bg-transparent w-40"
            value={page.name}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { handleNameBlur(); } }}
            onFocus={(e) => e.target.select()}
            autoFocus
          />
        ) : (
          <span
            className="font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:text-blue-600 transition-colors w-40 truncate"
            onClick={() => setEditingName(true)}
            title={page.name}
          >
            {page.name}
          </span>
        )}
        <button
          onClick={handleStarClick}
          className={`p-1.5 rounded transition-colors ${page.starred ? 'text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20' : 'text-gray-300 dark:text-gray-500 hover:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          title={page.starred ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={16} filled={page.starred} />
        </button>
        <div className="relative" ref={languageMenuRef}>
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors border border-gray-200 dark:border-gray-600"
          >
            {codeType === 'raw' ? 'Raw Code' : codeType === 'javascript' ? 'JavaScript' : codeType === 'python' ? 'Python' : codeType === 'html' ? 'HTML' : 'Mermaid'}
            <svg className={`w-3 h-3 transition-transform ${showLanguageMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {showLanguageMenu && (
            <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden py-1">
              {['raw', 'javascript', 'python', 'html', 'mermaid'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    handleCodeTypeChange(lang);
                    setShowLanguageMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${codeType === lang ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  {lang === 'raw' ? 'Raw Code' : lang === 'javascript' ? 'JavaScript' : lang === 'python' ? 'Python' : lang === 'html' ? 'HTML' : 'Mermaid'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mr-2">
          <button onClick={() => handleViewModeChange('code')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'code' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>Code</button>
          <button onClick={() => handleViewModeChange('split')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'split' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>Split</button>
          <button onClick={() => handleViewModeChange('preview')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'preview' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>Preview</button>
        </div>
      </div>
      <div ref={splitContainerRef} className={`flex-1 flex ${viewMode === 'split' ? 'flex-row' : 'flex-col'} relative overflow-hidden`}>
        {isDragging && (
          <div className="fixed inset-0 z-[9999] cursor-col-resize" />
        )}
        {/* EDITOR PANE */}
        {(viewMode === 'code' || viewMode === 'split') && (
          <div className={`flex flex-col bg-gray-50 dark:bg-gray-900 relative min-h-0 min-w-0 ${viewMode === 'split' ? 'border-r border-gray-200 dark:border-gray-700' : 'flex-1 w-full'}`} style={viewMode === 'split' ? { width: `${splitRatio}%` } : {}}>
            <div
              className="flex-1 w-full relative overflow-hidden flex flex-col"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  handleRun();
                }
              }}
            >
              <CodeMirror
                value={localCode}
                height="100%"
                className="flex-1 overflow-auto text-sm"
                theme={currentTheme === 'dark' ? githubDark : githubLight}
                extensions={getLanguageExtensions()}
                onChange={(value) => setLocalCode(value)}
                onBlur={() => saveCodeToApp(localCode)}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: true,
                  tabSize: 2,
                }}
              />
            </div>
            <button
              onClick={handleRun}
              className="absolute bottom-4 right-4 px-4 py-2 bg-blue-500 text-white font-medium text-sm rounded-lg shadow-lg hover:bg-blue-600 transition-colors z-20 flex items-center gap-2"
            >
              ▶ Save & Run
            </button>
          </div>
        )}

        {viewMode === 'split' && (
          <div
            className="w-2 cursor-col-resize bg-gray-200 hover:bg-blue-400 dark:bg-gray-700 dark:hover:bg-blue-500 z-50 flex items-center justify-center transition-colors shrink-0 border-x border-gray-300 dark:border-gray-600"
            onMouseDown={handleDragStart}
            onDoubleClick={resetSplit}
            title="Drag to resize, double-click to reset"
          >
            <div className="flex flex-col gap-1 pointer-events-none">
              <div className="w-0.5 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
              <div className="w-0.5 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
              <div className="w-0.5 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
            </div>
          </div>
        )}

        {/* PREVIEW PANE */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            ref={viewportRef}
            className={`flex flex-col bg-white dark:bg-gray-800 relative overflow-hidden min-h-0 min-w-0 ${viewMode === 'split' ? '' : 'flex-1 w-full'}`}
            style={{
              ...(viewMode === 'split' ? { width: `${100 - splitRatio}%` } : {}),
              ...(codeType === 'mermaid' ? { touchAction: 'none', cursor: dragInfo ? 'grabbing' : 'grab' } : {}),
            }}
            {...(codeType === 'mermaid' ? {
              onPointerDown: handleMermaidPointerDown,
              onPointerMove: handleMermaidPointerMove,
              onPointerUp: handleMermaidPointerUp,
              onPointerLeave: handleMermaidPointerUp,
              onPointerCancel: handleMermaidPointerUp,
            } : {})}
          >
            {codeType === 'raw' ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 font-mono text-sm">
                Raw mode: Preview disabled
              </div>
            ) : !renderedCode.trim() ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 font-mono text-sm">
                Enter code and click Save & Run
              </div>
            ) : codeType === 'mermaid' ? (
              <>
                {mermaidError ? (
                  <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-sm text-red-600 dark:text-red-400">{mermaidError}</div>
                  </div>
                ) : (
                  <>
                    <div
                      ref={svgContainerRef}
                      className="absolute top-0 left-0 w-fit h-fit cursor-grab active:cursor-grabbing"
                      style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                        transformOrigin: '0 0',
                      }}
                      dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                    {svgContent && (
                      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
                        <button onClick={handleZoomIn} className="p-2 bg-white dark:bg-gray-700 rounded shadow hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="Zoom in"><ZoomIn size={16} /></button>
                        <button onClick={handleZoomOut} className="p-2 bg-white dark:bg-gray-700 rounded shadow hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="Zoom out"><ZoomOut size={16} /></button>
                        <button onClick={handleMermaidFit} className="p-2 bg-white dark:bg-gray-700 rounded shadow hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="Fit to view"><Maximize2 size={16} /></button>
                        <button onClick={downloadSvg} className="p-2 bg-white dark:bg-gray-700 rounded shadow hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200" title="Download SVG"><Download size={16} /></button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : codeType === 'python' ? (
              pythonError ? (
                <div className="flex-1 min-h-0 overflow-auto p-6">
                  <div className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">{pythonError}</div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
                  {pythonLoading ? (
                    <div className="flex-1 min-h-0 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      {pythonRunning ? 'Running...' : 'Loading Pyodide...'}
                    </div>
                  ) : (
                    <pre className="flex-1 min-h-0 w-full overflow-auto p-4 text-sm font-mono whitespace-pre-wrap border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
                      {pythonOutput || '\u00a0'}
                    </pre>
                  )}
                </div>
              )
            ) : iframeError ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-sm text-red-600 dark:text-red-400">{iframeError}</div>
              </div>
            ) : (
              <iframe
                key={iframeKey}
                sandbox="allow-scripts allow-same-origin"
                srcDoc={getSandboxedTemplate(renderedCode, codeType)}
                className="w-full h-full border-none bg-white"
                title="Code Output"
                onError={() => setIframeError('Failed to load or run code.')}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MermaidPageComponent;
