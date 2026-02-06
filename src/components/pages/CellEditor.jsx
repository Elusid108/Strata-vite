// CellEditor Component - Smart table cell input switching by type
// Extracted from Strata index.html Section F

const CellEditor = ({ type, value, options, onChange }) => {
  const baseClass = "w-full h-full p-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-blue-50 dark:focus:bg-blue-900/20 transition-colors";

  if (type === 'boolean') {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <input 
          type="checkbox" 
          checked={!!value} 
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </div>
    );
  }

  if (type === 'select') {
    return (
      <select 
        value={value || ''} 
        onChange={(e) => onChange(e.target.value)}
        className={`${baseClass} appearance-none cursor-pointer`}
      >
        <option value="" disabled className="text-gray-400">Select...</option>
        {options?.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (type === 'number') {
    return (
      <input 
        type="number" 
        value={value || ''} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`${baseClass} font-mono text-right`}
        placeholder="0"
      />
    );
  }

  // Default Text
  return (
    <input 
      type="text" 
      value={value || ''} 
      onChange={(e) => onChange(e.target.value)}
      className={baseClass}
      placeholder="Empty"
    />
  );
};

export default CellEditor;
