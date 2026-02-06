// MermaidPageComponent - Mermaid diagrams and code execution (JS/HTML/Python)
// Extracted from Strata index.html Section F

import { useState, useEffect, useRef, useCallback } from 'react';
import { MERMAID_MIN_SCALE, MERMAID_MAX_SCALE, MERMAID_ZOOM_STEP, PYODIDE_URL } from '../../lib/constants';
import { Star, Edit3, X, ZoomIn, ZoomOut, Maximize2 } from '../icons';

// Helper functions
const getCode = (p) => (p.code ?? p.mermaidCode ?? '').trim();
const getCodeType = (p) => p.codeType || 'mermaid';

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
  const code = getCode(page);
  const [showCodeEdit, setShowCodeEdit] = useState(false);
  const [codeEditValue, setCodeEditValue] = useState('');
  const [codeEditType, setCodeEditType] = useState('mermaid');
  const [editingName, setEditingName] = useState(false);
  const [mermaidError, setMermaidError] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [iframeError, setIframeError] = useState(null);
  const [pythonOutput, setPythonOutput] = useState('');
  const [pythonError, setPythonError] = useState(null);
  const [pythonLoading, setPythonLoading] = useState(false);
  const [pythonRunning, setPythonRunning] = useState(false);
  const diagramContainerRef = useRef(null);
  const mermaidInitRef = useRef(null); // Store current theme instead of boolean
  const viewportRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const persistViewportRef = useRef(null);
  const hasAppliedInitialFitRef = useRef(false);
  const renderIdRef = useRef(0); // Guard against race conditions from double-render
  const savedViewport = page.mermaidViewport || { x: 0, y: 0, scale: 1 };
  const [transform, setTransform] = useState(savedViewport);
  const [dragInfo, setDragInfo] = useState(null);

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

  const isMermaidWithContent = codeType === 'mermaid' && code.length > 0;
  useEffect(() => {
    if (!isMermaidWithContent || mermaidError) return;
    persistViewport();
    return () => { if (persistViewportRef.current) clearTimeout(persistViewportRef.current); };
  }, [transform, isMermaidWithContent, mermaidError, persistViewport]);

  const hasDiagram = isMermaidWithContent && !mermaidError;

  const openCodeEdit = () => {
    setCodeEditValue(page.code ?? page.mermaidCode ?? '');
    setCodeEditType(getCodeType(page));
    setShowCodeEdit(true);
    setIframeError(null);
    setPythonError(null);
  };

  const handleSaveCode = () => {
    if (saveToHistory) saveToHistory();
    const payload = { codeType: codeEditType, code: codeEditValue };
    if (codeEditType === 'mermaid') payload.mermaidCode = codeEditValue;
    onUpdate(payload);
    setShowCodeEdit(false);
    if (showNotification) showNotification('Code updated', 'success');
  };

  const clampScale = (s) => Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, s));

  const calculateZoomToFit = () => {
    if (!diagramContainerRef.current || !viewportRef.current) {
      return { x: 0, y: 0, scale: 1 };
    }

    // Find the SVG element inside the diagram container
    const svg = diagramContainerRef.current.querySelector('svg');
    if (!svg) {
      return { x: 0, y: 0, scale: 1 };
    }

    // Get SVG dimensions
    let svgWidth, svgHeight;
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      svgWidth = parseFloat(parts[2]) || svg.clientWidth || 0;
      svgHeight = parseFloat(parts[3]) || svg.clientHeight || 0;
    } else {
      svgWidth = svg.clientWidth || svg.getBBox?.()?.width || 0;
      svgHeight = svg.clientHeight || svg.getBBox?.()?.height || 0;
    }

    // Get viewport dimensions
    const viewportRect = viewportRef.current.getBoundingClientRect();
    const viewportWidth = viewportRect.width || 0;
    const viewportHeight = viewportRect.height || 0;

    // Handle edge cases
    if (svgWidth <= 0 || svgHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return { x: 0, y: 0, scale: 1 };
    }

    // Calculate scale with 10% padding (0.9 factor)
    const scaleX = (viewportWidth * 0.9) / svgWidth;
    const scaleY = (viewportHeight * 0.9) / svgHeight;
    const scale = clampScale(Math.min(scaleX, scaleY));

    // Calculate centered position
    const scaledWidth = svgWidth * scale;
    const scaledHeight = svgHeight * scale;
    const x = (viewportWidth - scaledWidth) / 2;
    const y = (viewportHeight - scaledHeight) / 2;

    return { x, y, scale };
  };

  const handleMermaidZoom = (delta, towardCenter = true) => {
    const rect = viewportRef.current ? viewportRef.current.getBoundingClientRect() : null;
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    const t = transformRef.current;
    const newScale = clampScale(t.scale + delta);
    if (!towardCenter || !rect) {
      setTransform({ ...t, scale: newScale });
      return;
    }
    const dx = (cx - t.x) / t.scale;
    const dy = (cy - t.y) / t.scale;
    const newX = cx - dx * newScale;
    const newY = cy - dy * newScale;
    setTransform({ x: newX, y: newY, scale: newScale });
  };

  const handleMermaidFit = () => {
    const fitTransform = calculateZoomToFit();
    setTransform(fitTransform);
  };

  const handleMermaidWheel = useCallback((e) => {
    const t = transformRef.current;
    const rect = viewportRef.current ? viewportRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    e.preventDefault();
    const zoomSensitivity = 0.002;
    const delta = -e.deltaY * zoomSensitivity * t.scale;
    const newScale = clampScale(t.scale + delta);
    const dx = (vx - t.x) / t.scale;
    const dy = (vy - t.y) / t.scale;
    const newX = vx - dx * newScale;
    const newY = vy - dy * newScale;
    setTransform({ x: newX, y: newY, scale: newScale });
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

  // Mermaid rendering effect
  useEffect(() => {
    if (codeType !== 'mermaid' || !code || !diagramContainerRef.current) {
      setMermaidError(null);
      hasAppliedInitialFitRef.current = false;
      return;
    }
    if (typeof window.mermaid === 'undefined') {
      setMermaidError('Mermaid library not loaded');
      hasAppliedInitialFitRef.current = false;
      return;
    }
    
    // Increment render ID to cancel any in-progress renders
    renderIdRef.current += 1;
    const currentRenderId = renderIdRef.current;
    
    // Reset the fit flag when chart code changes
    hasAppliedInitialFitRef.current = false;
    const el = diagramContainerRef.current;
    el.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'mermaid';
    pre.textContent = code;
    el.appendChild(pre);
    // Detect dark mode and use appropriate theme
    const isDarkMode = document.documentElement.classList.contains('dark');
    const mermaidTheme = isDarkMode ? 'dark' : 'default';
    
    // Reinitialize if theme changed or not initialized yet
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
    
    window.mermaid.run({ nodes: [pre] }).then(() => {
      // Check if this render is still current (not superseded by another render)
      if (currentRenderId !== renderIdRef.current) return;
      
      // Wait for SVG to be rendered in the DOM
      const waitForSvg = () => {
        // Check if still current render
        if (currentRenderId !== renderIdRef.current) return;
        
        const svg = el.querySelector('svg');
        if (svg && !hasAppliedInitialFitRef.current) {
          // Set SVG dimensions based on viewBox to ensure proper sizing
          const viewBox = svg.getAttribute('viewBox');
          if (viewBox) {
            const parts = viewBox.split(/\s+/);
            const vbWidth = parseFloat(parts[2]);
            const vbHeight = parseFloat(parts[3]);
            if (vbWidth > 0 && vbHeight > 0) {
              svg.setAttribute('width', vbWidth);
              svg.setAttribute('height', vbHeight);
            }
          }
          
          // Use requestAnimationFrame to ensure layout is complete
          requestAnimationFrame(() => {
            // Final check if still current render
            if (currentRenderId !== renderIdRef.current) return;
            
            if (!hasAppliedInitialFitRef.current && diagramContainerRef.current && viewportRef.current) {
              const fitTransform = calculateZoomToFit();
              setTransform(fitTransform);
              hasAppliedInitialFitRef.current = true;
            }
          });
        } else if (!svg) {
          // SVG not ready yet, try again
          setTimeout(waitForSvg, 50);
        }
      };
      waitForSvg();
    }).catch(() => {
      // Only set error if this is still the current render
      if (currentRenderId !== renderIdRef.current) return;
      setMermaidError('Invalid Mermaid syntax');
      hasAppliedInitialFitRef.current = false;
    });
  }, [page.id, codeType, code]);

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
    if (codeType !== 'mermaid' || !code || !diagramContainerRef.current) return;
    
    const isDarkMode = currentTheme === 'dark';
    const mermaidTheme = isDarkMode ? 'dark' : 'default';
    
    // Only reinitialize if theme changed
    if (mermaidInitRef.current !== mermaidTheme) {
      const el = diagramContainerRef.current;
      const svg = el.querySelector('svg');
      if (svg && code) {
        try {
          window.mermaid.initialize({ startOnLoad: false, theme: mermaidTheme });
          mermaidInitRef.current = mermaidTheme;
          // Clear and re-render the diagram with new theme
          el.innerHTML = '';
          const pre = document.createElement('pre');
          pre.className = 'mermaid';
          pre.textContent = code;
          el.appendChild(pre);
          window.mermaid.run({ nodes: [pre] }).catch(() => {
            setMermaidError('Invalid Mermaid syntax');
          });
        } catch (e) {
          setMermaidError('Failed to reinitialize Mermaid');
        }
      }
    }
  }, [codeType, code, currentTheme]);

  // Python execution effect
  useEffect(() => {
    if (codeType !== 'python' || !code) {
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
        const { output, error } = await runPythonCode(code, pyodide);
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
  }, [page.id, codeType, code]);

  const codePlaceholder = codeEditType === 'mermaid' ? 'Paste or type Mermaid code... e.g. graph TD; A --> B;' : codeEditType === 'javascript' ? 'Paste or type JavaScript... e.g. document.body.innerHTML = \'<p>Hello</p>\';' : codeEditType === 'python' ? 'Paste or type Python... e.g. print(\'Hello\'); 1 + 2' : 'Paste or type HTML... e.g. <h1>Hi</h1> or full mini-app.';

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
        <button
          onClick={openCodeEdit}
          className="p-1.5 rounded transition-colors text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Edit code"
        >
          <Edit3 size={16} />
        </button>
        {hasDiagram && (
          <div className="flex items-center gap-1 ml-2 border-l border-gray-200 dark:border-gray-600 pl-2" title="Zoom and pan supported. Moving individual nodes is not supported; use the Mermaid source or spacing options to reduce overlap.">
            <button
              onClick={() => handleMermaidZoom(-MERMAID_ZOOM_STEP)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={transform.scale <= MERMAID_MIN_SCALE}
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-400 w-10 text-center font-medium tabular-nums">
              {Math.round(transform.scale * 100)}%
            </span>
            <button
              onClick={() => handleMermaidZoom(MERMAID_ZOOM_STEP)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={transform.scale >= MERMAID_MAX_SCALE}
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleMermaidFit}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-1"
              title="Reset view (Fit)"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        )}
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5">
          {codeType === 'mermaid' ? 'Mermaid' : codeType === 'javascript' ? 'JavaScript' : codeType === 'python' ? 'Python' : 'HTML'}
        </span>
      </div>
      {!code ? (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-6">
          <p className="text-sm mb-4">No code yet. Click the pencil to add code.</p>
          <button
            onClick={openCodeEdit}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add code
          </button>
        </div>
      ) : codeType === 'mermaid' ? (
        mermaidError ? (
          <div className="flex-1 min-h-0 overflow-auto p-6">
            <div className="text-sm text-red-600 dark:text-red-400">{mermaidError}</div>
          </div>
        ) : (
          <div
            ref={viewportRef}
            className="flex-1 min-h-0 overflow-hidden relative select-none"
            style={{ touchAction: 'none', cursor: dragInfo ? 'grabbing' : 'grab' }}
            onPointerDown={handleMermaidPointerDown}
            onPointerMove={handleMermaidPointerMove}
            onPointerUp={handleMermaidPointerUp}
            onPointerLeave={handleMermaidPointerUp}
            onPointerCancel={handleMermaidPointerUp}
          >
            <div
              className="absolute top-0 left-0 w-fit h-fit"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: '0 0'
              }}
            >
              <div ref={diagramContainerRef} className="mermaid-container flex justify-center items-start" />
            </div>
          </div>
        )
      ) : (codeType === 'html' || codeType === 'javascript') ? (
        iframeError ? (
          <div className="flex-1 min-h-0 overflow-auto p-6">
            <div className="text-sm text-red-600 dark:text-red-400">{iframeError}</div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
            <iframe
              title="Code output"
              sandbox="allow-scripts"
              srcDoc={codeType === 'javascript' ? '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>' + code.replace(/<\/script>/gi, '<\\/script>') + '</scr' + 'ipt></body></html>' : code}
              className="flex-1 min-h-0 w-full border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              onError={() => setIframeError('Failed to load or run code.')}
            />
          </div>
        )
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
      ) : null}
      {showCodeEdit && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xl flex items-center gap-3 dark:text-white">
                <Edit3 size={20} /> Edit code
              </h3>
              <button onClick={() => setShowCodeEdit(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="dark:text-white" />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              {['mermaid', 'javascript', 'html', 'python'].map((t) => (
                <button
                  key={t}
                  onClick={() => setCodeEditType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${codeEditType === t ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  {t === 'mermaid' ? 'Mermaid' : t === 'javascript' ? 'JavaScript' : t === 'python' ? 'Python' : 'HTML'}
                </button>
              ))}
            </div>
            <textarea
              className="w-full h-64 p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white font-mono text-sm resize-y"
              placeholder={codePlaceholder}
              value={codeEditValue}
              onChange={(e) => setCodeEditValue(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowCodeEdit(false)}
                className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCode}
                className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MermaidPageComponent;
