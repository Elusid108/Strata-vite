// TablePage Component - Database/Table page for structured data
// Extracted from Strata index.html Section F

import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { generateUUID } from '../../lib/utils';
import { DEFAULT_SCHEMA, DEFAULT_ROWS } from '../../lib/constants';
import CellEditor from './CellEditor';

// Helper function for column type icons
function getColumnIcon(type) {
  switch (type) {
    case 'number': return <span className="opacity-50 text-xs">#</span>;
    case 'boolean': return <span className="opacity-50 text-xs">☑</span>;
    case 'select': return <span className="opacity-50 text-xs">▼</span>;
    default: return <span className="opacity-50 text-xs">Aa</span>;
  }
}

const TablePage = memo(({ page, onUpdate }) => {
  // --- Initialization & Default Data ---
  const [data, setData] = useState(() => {
    const content = page?.content || {};
    return {
      schema: content.schema || DEFAULT_SCHEMA,
      rows: content.rows || DEFAULT_ROWS
    };
  });

  // State for the custom "Add Column" modal
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('text');
  const [newColOptions, setNewColOptions] = useState('');

  // Track the current page ID to detect navigation changes
  const lastPageIdRef = useRef(page?.id);

  // Sync state when the page prop changes
  useEffect(() => {
    if (page?.id && page.id !== lastPageIdRef.current) {
      lastPageIdRef.current = page.id;
      const content = page.content || {};
      setData({
        schema: content.schema || DEFAULT_SCHEMA,
        rows: content.rows || DEFAULT_ROWS
      });
    }
  }, [page]);

  // Debounced save to parent
  const saveData = useCallback((newData) => {
    setData(newData);
    if (onUpdate && page) {
      onUpdate({ ...page, content: newData });
    }
  }, [page, onUpdate]);

  // --- Handlers ---

  const handleCellChange = (rowId, colId, value) => {
    const newRows = data.rows.map(row => 
      row.id === rowId ? { ...row, [colId]: value } : row
    );
    saveData({ ...data, rows: newRows });
  };

  const addRow = () => {
    const newRow = { id: generateUUID() };
    const columns = data.schema?.columns || [];
    columns.forEach(col => {
      newRow[col.id] = col.type === 'boolean' ? false : '';
    });
    saveData({ ...data, rows: [...data.rows, newRow] });
  };

  const deleteRow = (rowId) => {
    saveData({ ...data, rows: data.rows.filter(r => r.id !== rowId) });
  };

  const submitAddColumn = (e) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    let options = undefined;
    if (newColType === 'select') {
      options = newColOptions ? newColOptions.split(',').map(s => s.trim()).filter(s => s) : ['Option 1'];
      if (options.length === 0) options = ['Option 1'];
    }

    const newCol = { 
      id: generateUUID(), 
      name: newColName, 
      type: newColType, 
      width: 150, 
      options 
    };

    const currentSchema = data.schema || { columns: [] };
    const currentColumns = currentSchema.columns || [];

    saveData({
      ...data,
      schema: { 
        ...currentSchema, 
        columns: [...currentColumns, newCol] 
      }
    });

    // Reset and close modal
    setNewColName('');
    setNewColType('text');
    setNewColOptions('');
    setIsAddingColumn(false);
  };

  // --- Render ---

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden relative">
      
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-2">Table Database</h2>
        <div className="flex-1"></div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto p-4 group">
        <div className="relative">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {/* Row Handle Column */}
                <th className="w-12 border-b-2 border-gray-300 dark:border-gray-700"></th>
                
                {/* Data Columns */}
                {(data.schema?.columns || []).map(col => (
                  <th key={col.id} className="text-left font-medium text-gray-500 p-2 border-b-2 border-gray-300 dark:border-gray-700 min-w-[100px]" style={{ width: col.width }}>
                    <div className="flex items-center gap-1">
                      {getColumnIcon(col.type)}
                      <span>{col.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {/* Number / Handle with Delete Button */}
                  <td className="text-center text-gray-400 text-xs border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-center gap-1">
                      <span>{index + 1}</span>
                      <button 
                        onClick={() => deleteRow(row.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition-opacity"
                        title="Delete row"
                      >
                        &times;
                      </button>
                    </div>
                  </td>

                  {/* Cells */}
                  {(data.schema?.columns || []).map(col => (
                    <td key={col.id} className="border-b border-gray-200 dark:border-gray-800 p-0 relative">
                      <CellEditor 
                        type={col.type} 
                        value={row[col.id]} 
                        options={col.options}
                        onChange={(val) => handleCellChange(row.id, col.id, val)} 
                      />
                    </td>
                  ))}
                </tr>
              ))}
              
              {/* "Add Row" Bottom Row */}
              <tr>
                <td colSpan={(data.schema?.columns?.length || 0) + 1} className="p-2 border-b border-transparent">
                  <button onClick={addRow} className="flex items-center gap-2 text-gray-400 hover:text-blue-500 text-sm py-2">
                    <span>+ New Row</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          
          {/* Vertical Add Column Bar */}
          <button
            onClick={() => setIsAddingColumn(true)}
            className="absolute right-0 top-0 bottom-0 w-2 bg-gray-300 dark:bg-gray-600 hover:bg-blue-500 dark:hover:bg-blue-600 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer z-10"
            title="Add column"
            style={{ width: '8px' }}
          >
            <span className="sr-only">Add column</span>
          </button>
        </div>
      </div>

      {/* Custom Add Column Modal */}
      {isAddingColumn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={submitAddColumn} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-80 space-y-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium">Add New Column</h3>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Name</label>
              <input 
                autoFocus
                type="text" 
                value={newColName} 
                onChange={e => setNewColName(e.target.value)}
                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                placeholder="e.g. Price, Category"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase">Type</label>
              <select 
                value={newColType} 
                onChange={e => setNewColType(e.target.value)}
                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Checkbox</option>
                <option value="select">Select (Dropdown)</option>
              </select>
            </div>

            {newColType === 'select' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Options</label>
                <input 
                  type="text" 
                  value={newColOptions} 
                  onChange={e => setNewColOptions(e.target.value)}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Option 1, Option 2..."
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setIsAddingColumn(false)}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded"
              >
                Create Column
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});

TablePage.displayName = 'TablePage';

export default TablePage;
