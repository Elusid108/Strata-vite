import { useRef } from 'react';
import { useAppActions } from '../../hooks/useAppActions';
import { Upload } from '../icons';

/**
 * A button that opens a file picker for a `.strata.json` export and imports it.
 * Items land by kind (page → active section, section → active notebook,
 * notebook → root) regardless of which button was used.
 *
 * variant: 'icon' (small toolbar button) | 'menu' (full-width menu row)
 */
export function ImportFileButton({ variant = 'icon', label = 'Import', title, className = '', onPicked }) {
  const inputRef = useRef(null);
  const { importFromFile } = useAppActions();

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (onPicked) onPicked();
    if (file) await importFromFile(file);
  };

  const open = (e) => {
    e.stopPropagation();
    inputRef.current?.click();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      {variant === 'menu' ? (
        <button
          type="button"
          onClick={open}
          className={`w-full text-left px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm ${className}`}
        >
          <span className="w-5 flex justify-center"><Upload size={16} /></span> {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className={`p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 ${className}`}
          title={title || label}
          aria-label={title || label}
        >
          <Upload size={14} />
        </button>
      )}
    </>
  );
}
