// SlashMenu - Slash command menu for quick formatting
// Extracted from Strata index.html (lines 2492-2520)

const SlashMenu = ({ x, y, onSelect, onClose }) => {
  const options = [
    { label: 'Heading 1', action: () => onSelect('formatBlock', 'H1') },
    { label: 'Heading 2', action: () => onSelect('formatBlock', 'H2') },
    { label: 'To-Do List', action: () => onSelect('insertHTML', '<input type="checkbox" style="margin-right:8px;vertical-align:middle;">&nbsp;') },
    { label: 'Bullet List', action: () => onSelect('insertUnorderedList') },
    { label: 'Numbered List', action: () => onSelect('insertOrderedList') },
    { label: 'Insert Date', action: () => onSelect('insertText', new Date().toLocaleDateString()) },
    { label: 'Map', action: () => onSelect('map', null) },
  ];

  return (
    <div 
      className="fixed bg-white shadow-lg border border-gray-200 rounded-lg py-1 z-[100] w-48 animate-fade-in"
      style={{ left: x, top: y + 20 }}
    >
      <div className="px-3 py-1 text-xs font-semibold text-gray-400 border-b mb-1">BASIC BLOCKS</div>
      {options.map((opt, i) => (
        <button
          key={i}
          className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-sm text-gray-700 flex items-center"
          onMouseDown={(e) => { e.preventDefault(); opt.action(); }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default SlashMenu;
