import { ChevronRight } from '../../components/icons';

/**
 * Collapsible sidebar section header (Favorites, Pinned, ...). In the condensed
 * rail only the icon shows, with the label and count as a tooltip.
 */
export function CollapsibleNavSection({ icon, label, count, expanded, onToggle, condensed, children }) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <button
        onClick={onToggle}
        className={`w-full flex items-center ${condensed ? 'justify-center' : 'gap-2'} p-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hover:bg-gray-200 dark:hover:bg-gray-700`}
        title={condensed ? `${label} (${count})` : undefined}
        aria-expanded={expanded}
      >
        {!condensed && <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />}
        {icon}
        {!condensed && (
          <>
            <span>{label}</span>
            <span className="text-gray-400">({count})</span>
          </>
        )}
      </button>
      {expanded && <div className="pb-2">{children}</div>}
    </div>
  );
}
