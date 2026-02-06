/**
 * Generate the offline viewer HTML
 * This creates a standalone HTML file that can be used to view notebooks offline
 * @returns {string} Complete HTML document as a string
 */
export const generateOfflineViewerHtml = () => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strata Notebooks - Offline Viewer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        .container { display: flex; height: 100vh; }
        .sidebar { width: 280px; background: #1f2937; color: white; overflow-y: auto; flex-shrink: 0; }
        .sidebar-header { padding: 16px; border-bottom: 1px solid #374151; font-weight: bold; font-size: 18px; }
        .notebook { margin: 8px; }
        .notebook-header { padding: 8px 12px; background: #374151; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .notebook-header:hover { background: #4b5563; }
        .notebook-header.active { background: #3b82f6; }
        .tab { margin-left: 16px; margin-top: 4px; }
        .tab-header { padding: 6px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; }
        .tab-header:hover { background: #374151; }
        .tab-header.active { background: #4b5563; }
        .page { margin-left: 32px; }
        .page-item { padding: 4px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #9ca3af; }
        .page-item:hover { background: #374151; color: white; }
        .page-item.active { background: #3b82f6; color: white; }
        .main { flex: 1; overflow-y: auto; background: white; }
        .page-content { max-width: 800px; margin: 0 auto; padding: 40px; }
        .page-title { font-size: 32px; font-weight: bold; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
        .block { margin-bottom: 8px; line-height: 1.6; }
        .block-h1 { font-size: 28px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; }
        .block-h2 { font-size: 24px; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
        .block-h3 { font-size: 20px; font-weight: bold; margin-top: 16px; margin-bottom: 8px; }
        .block-h4 { font-size: 16px; font-weight: bold; margin-top: 12px; margin-bottom: 6px; }
        .block-ul, .block-ol { padding-left: 24px; }
        .block-todo { display: flex; align-items: center; gap: 8px; }
        .block-todo input { width: 18px; height: 18px; }
        .block-todo-view { display: flex; flex-direction: column; gap: 6px; }
        .block-todo-view .block-todo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; cursor: pointer; }
        .block-todo-view .block-todo-row input { width: 18px; height: 18px; flex-shrink: 0; }
        .block-todo-view .block-todo-row input:checked + .block-todo-text { text-decoration: line-through; color: #9ca3af; }
        .block-divider { border-top: 1px solid #e5e7eb; margin: 16px 0; }
        .block-image img { max-width: 100%; border-radius: 8px; }
        .block-link a { color: #3b82f6; text-decoration: none; }
        .block-link a:hover { text-decoration: underline; }
        .block-video iframe { width: 100%; aspect-ratio: 16/9; border: none; border-radius: 8px; }
        .google-link { padding: 16px; background: #f3f4f6; border-radius: 8px; margin: 8px 0; }
        .google-link a { color: #3b82f6; font-weight: 500; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .error { text-align: center; padding: 40px; color: #dc2626; }
        .empty { text-align: center; padding: 60px; color: #9ca3af; }
        .mermaid-container { min-height: 200px; }
        @media (max-width: 768px) {
            .sidebar { width: 100%; position: fixed; bottom: 0; height: auto; max-height: 50vh; z-index: 100; }
            .main { margin-bottom: 200px; }
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></scr` + `ipt>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <div class="sidebar-header">📓 Strata Notebooks</div>
            <div id="nav"></div>
        </div>
        <div class="main">
            <div id="content" class="loading">Loading...</div>
        </div>
    </div>
    <script>
        let manifest = null;
        let currentNotebook = null;
        let currentTab = null;
        let currentPage = null;
        let mermaidInitialized = false;
        const PYODIDE_VIEWER_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.2/full/pyodide.js';
        async function runPythonInViewer(code, outputEl) {
            const out = [];
            const append = function(msg) { out.push(msg); };
            try {
                if (typeof window.loadPyodide !== 'function') {
                    const s = document.createElement('script');
                    s.src = PYODIDE_VIEWER_URL;
                    await new Promise(function(resolve, reject) {
                        s.onload = resolve;
                        s.onerror = function() { reject(new Error('Python requires network (Pyodide).')); };
                        document.head.appendChild(s);
                    });
                }
                if (!window.__pyodide) {
                    outputEl.textContent = 'Loading Pyodide...';
                    window.__pyodide = await loadPyodide();
                }
                outputEl.textContent = 'Running...';
                const pyodide = window.__pyodide;
                pyodide.setStdout({ batched: append });
                pyodide.setStderr({ batched: append });
                await pyodide.loadPackagesFromImports(code);
                const result = pyodide.runPython(code);
                if (result !== undefined) { try { out.push(String(result)); } catch (_) {} }
                outputEl.textContent = out.join('') || '\\u00a0';
                outputEl.style.color = '';
            } catch (e) {
                outputEl.textContent = (e && e.message) ? e.message : String(e);
                outputEl.style.color = '#dc2626';
            }
        }
        async function loadManifest() {
            try {
                const response = await fetch('manifest.json');
                if (!response.ok) throw new Error('Could not load manifest.json');
                manifest = await response.json();
                renderNav();
                if (manifest.notebooks.length > 0) {
                    selectNotebook(manifest.notebooks[0]);
                } else {
                    document.getElementById('content').innerHTML = '<div class="empty">No notebooks found</div>';
                }
            } catch (e) {
                document.getElementById('content').innerHTML = '<div class="error">Error: ' + e.message + '<br><br>Make sure manifest.json is in the same folder as index.html</div>';
            }
        }

        function renderNav() {
            const nav = document.getElementById('nav');
            nav.innerHTML = manifest.notebooks.map(nb => \`
                <div class="notebook">
                    <div class="notebook-header" onclick="selectNotebook(manifest.notebooks.find(n => n.id === '\${nb.id}'))" id="nb-\${nb.id}">
                        <span>\${nb.icon || '📓'}</span>
                        <span>\${nb.name}</span>
                    </div>
                    <div class="tabs" id="tabs-\${nb.id}" style="display: none;">
                        \${nb.tabs.map(tab => \`
                            <div class="tab">
                                <div class="tab-header" onclick="selectTab(manifest.notebooks.find(n => n.id === '\${nb.id}'), '\${tab.id}')" id="tab-\${tab.id}">
                                    <span>\${tab.icon || '📋'}</span>
                                    <span>\${tab.name}</span>
                                </div>
                                <div class="pages" id="pages-\${tab.id}" style="display: none;">
                                    \${tab.pages.map(page => \`
                                        <div class="page">
                                            <div class="page-item" onclick="selectPage('\${nb.id}', '\${tab.id}', '\${page.id}')" id="page-\${page.id}">
                                                <span>\${page.icon || '📄'}</span>
                                                <span>\${page.name}</span>
                                            </div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`).join('');
        }

        function selectNotebook(nb) {
            document.querySelectorAll('.notebook-header').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tabs').forEach(el => el.style.display = 'none');
            document.getElementById('nb-' + nb.id).classList.add('active');
            document.getElementById('tabs-' + nb.id).style.display = 'block';
            currentNotebook = nb;
            if (nb.tabs.length > 0) selectTab(nb, nb.tabs[0].id);
        }

        function selectTab(nb, tabId) {
            const tab = nb.tabs.find(t => t.id === tabId);
            document.querySelectorAll('.tab-header').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.pages').forEach(el => el.style.display = 'none');
            document.getElementById('tab-' + tabId).classList.add('active');
            document.getElementById('pages-' + tabId).style.display = 'block';
            currentTab = tab;
            if (tab.pages.length > 0) selectPage(nb.id, tabId, tab.pages[0].id);
        }

        async function selectPage(nbId, tabId, pageId) {
            document.querySelectorAll('.page-item').forEach(el => el.classList.remove('active'));
            document.getElementById('page-' + pageId).classList.add('active');
            
            const nb = manifest.notebooks.find(n => n.id === nbId);
            const tab = nb.tabs.find(t => t.id === tabId);
            const page = tab.pages.find(p => p.id === pageId);
            currentPage = page;

            if (page.type && page.type !== 'block' && page.type !== 'mermaid') {
                // Google Doc/Sheet/Slides or external link
                const link = page.webViewLink || page.embedUrl || '#';
                document.getElementById('content').innerHTML = \`
                    <div class="page-content">
                        <h1 class="page-title"><span>\${page.icon || '📄'}</span> \${page.name}</h1>
                        <div class="google-link">
                            <p>This is a linked Google file.</p>
                            <p><a href="\${link}" target="_blank">Open in Google Drive →</a></p>
                        </div>
                    </div>
                \`;
                return;
            }

            if (page.type === 'mermaid') {
                try {
                    const filePath = nb.folder + '/' + tab.folder + '/' + page.file;
                    const response = await fetch(filePath);
                    if (!response.ok) throw new Error('Could not load page');
                    const pageData = await response.json();
                    const codeType = pageData.codeType || 'mermaid';
                    const code = (pageData.code ?? pageData.mermaidCode ?? '').trim();
                    const icon = page.icon || '</>';
                    let html = '<div class="page-content"><h1 class="page-title"><span>' + icon + '</span> ' + page.name + '</h1>';
                    if (!code) {
                        html += '<div class="empty">No code in this page.</div>';
                    } else if (codeType === 'mermaid') {
                        html += '<div class="mermaid-container" style="min-height:200px"><pre class="mermaid"></pre></div>';
                    } else if (codeType === 'html') {
                        html += '<iframe title="Code output" sandbox="allow-scripts" srcdoc="' + code.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" style="width:100%;min-height:400px;border:1px solid #e5e7eb;border-radius:8px;"></iframe>';
                    } else if (codeType === 'javascript') {
                        const esc = code.replace(/<\\/script>/gi, '<\\\\/script>');
                        const wrapped = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>' + esc + '</scr' + 'ipt></body></html>';
                        html += '<iframe title="Code output" sandbox="allow-scripts" srcdoc="' + wrapped.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" style="width:100%;min-height:400px;border:1px solid #e5e7eb;border-radius:8px;"></iframe>';
                    } else if (codeType === 'python') {
                        html += '<div id="pyodide-output" class="pyodide-output" style="white-space:pre-wrap;font-family:monospace;font-size:14px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;min-height:200px;">Loading Pyodide...</div>';
                    } else {
                        html += '<div class="empty">Unsupported code type.</div>';
                    }
                    html += '</div>';
                    document.getElementById('content').innerHTML = html;
                    document.getElementById('content').classList.remove('loading');
                    if (code && codeType === 'mermaid') {
                        const pre = document.querySelector('#content .mermaid');
                        if (pre) {
                            pre.textContent = code;
                            if (typeof mermaid !== 'undefined') {
                                if (!mermaidInitialized) {
                                    mermaid.initialize({ startOnLoad: false });
                                    mermaidInitialized = true;
                                }
                                mermaid.run({ nodes: [pre] }).catch(function() {
                                    const cnt = document.querySelector('#content .mermaid-container');
                                    if (cnt) cnt.innerHTML = '<div class="error">Invalid Mermaid syntax</div>';
                                });
                            }
                        }
                    } else if (code && codeType === 'python') {
                        const el = document.getElementById('pyodide-output');
                        if (el) runPythonInViewer(code, el);
                    }
                } catch (e) {
                    document.getElementById('content').innerHTML = '<div class="error">Could not load page: ' + e.message + '</div>';
                }
                return;
            }

            // Load block page content
            try {
                const filePath = nb.folder + '/' + tab.folder + '/' + page.file;
                const response = await fetch(filePath);
                if (!response.ok) throw new Error('Could not load page');
                const pageData = await response.json();
                renderPage(page, pageData);
            } catch (e) {
                document.getElementById('content').innerHTML = '<div class="error">Could not load page: ' + e.message + '</div>';
            }
        }

        function renderPage(pageMeta, pageData) {
            const content = pageData.content || pageData.rows || [];
            let html = '<div class="page-content">';
            html += '<h1 class="page-title"><span>' + (pageMeta.icon || '📄') + '</span> ' + pageMeta.name + '</h1>';
            
            function treeToRows(tree) {
                if (!tree || !tree.children) return [];
                var rows = [];
                for (var i = 0; i < tree.children.length; i++) {
                    var n = tree.children[i];
                    if (n.type === 'row') {
                        var cols = n.children || [];
                        rows.push({ id: n.id, columns: cols.map(function(c){ return { id: c.id, width: c.width, blocks: (c.children || []).filter(function(b){ return b && b.type !== 'row' && b.type !== 'column'; }) }; }) });
                    } else if (n.type === 'column') {
                        rows.push({ id: 'r-' + n.id, columns: [{ id: n.id, blocks: (n.children || []).filter(function(b){ return b && b.type !== 'row' && b.type !== 'column'; }) }] });
                    } else {
                        rows.push({ id: 'r-' + Date.now(), columns: [{ id: 'c-' + Date.now(), blocks: [n] }] });
                    }
                }
                return rows;
            }
            
            function renderBlocks(rows) {
                var blocksHtml = '';
                if (rows && rows.version === 2 && rows.children) rows = treeToRows(rows);
                if (!Array.isArray(rows)) return blocksHtml;
                for (var ri = 0; ri < rows.length; ri++) {
                    var row = rows[ri];
                    if (!row.columns) continue;
                    for (var ci = 0; ci < row.columns.length; ci++) {
                        var col = row.columns[ci];
                        if (!col.blocks) continue;
                        for (var bi = 0; bi < col.blocks.length; bi++) {
                            blocksHtml += renderBlock(col.blocks[bi]);
                        }
                    }
                }
                return blocksHtml;
            }

            function renderBlock(block) {
                const c = block.content || '';
                switch (block.type) {
                    case 'h1': return '<div class="block block-h1">' + c + '</div>';
                    case 'h2': return '<div class="block block-h2">' + c + '</div>';
                    case 'h3': return '<div class="block block-h3">' + c + '</div>';
                    case 'h4': return '<div class="block block-h4">' + c + '</div>';
                    case 'ul': return '<div class="block block-ul"><ul>' + c + '</ul></div>';
                    case 'ol': return '<div class="block block-ol"><ol>' + c + '</ol></div>';
                    case 'todo': (function() {
                        const div = document.createElement('div');
                        div.innerHTML = c || '<li data-checked="false"></li>';
                        const lis = div.querySelectorAll('li');
                        let rows = '';
                        lis.forEach(function(li) {
                            const checked = li.getAttribute('data-checked') === 'true';
                            const itemHtml = (li.innerHTML || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            rows += '<label class="block-todo-row"><input type="checkbox" ' + (checked ? 'checked ' : '') + '/><span class="block-todo-text">' + itemHtml + '</span></label>';
                        });
                        return '<div class="block block-todo block-todo-view">' + (rows || '<label class="block-todo-row"><input type="checkbox" /><span class="block-todo-text"></span></label>') + '</div>';
                    })();
                    case 'divider': return '<div class="block-divider"></div>';
                    case 'image': return block.url ? '<div class="block block-image"><img src="' + block.url + '" alt=""></div>' : '';
                    case 'video': return block.url ? '<div class="block block-video"><iframe src="https://www.youtube.com/embed/' + getYouTubeId(block.url) + '" allowfullscreen></iframe></div>' : '';
                    case 'link': return '<div class="block block-link"><a href="' + (block.url || '#') + '" target="_blank">' + (c || block.url || 'Link') + '</a></div>';
                    default: return c ? '<div class="block">' + c + '</div>' : '';
                }
            }

            function getYouTubeId(url) {
                const match = url.match(/(?:youtu\\.be\\/|youtube\\.com\\/(?:embed\\/|v\\/|watch\\?v=|watch\\?.+&v=))([^#&?]*)/);
                return match ? match[1] : '';
            }

            if (content && (content.version === 2 && content.children || Array.isArray(content))) {
                html += renderBlocks(content);
            }
            html += '</div>';
            const contentEl = document.getElementById('content');
            contentEl.innerHTML = html;
            contentEl.addEventListener('change', function(e) {
                if (e.target.matches('.block-todo-view input[type="checkbox"]')) {
                    e.stopPropagation();
                }
            });
        }

        // Start
        loadManifest();
    </scr` + `ipt>
</body>
</html>`;
};
