// ToolbarBtn - Reusable toolbar button component
// Extracted from Strata index.html (lines 2522-2530)

const ToolbarBtn = ({ icon, onClick, active, title }) => (
  <button 
    onMouseDown={(e) => e.preventDefault()} // Prevent focus steal from contentEditable
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`p-1 rounded-md transition-colors ${active ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
    title={title}
  >
    {icon}
  </button>
);

export default ToolbarBtn;
