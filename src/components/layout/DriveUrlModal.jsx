import { useEffect, useRef, useState } from 'react';
import { DRIVE_LOGO_URL, DRIVE_SERVICE_ICONS } from '../../lib/constants';
import * as GoogleAPI from '../../lib/google-api';
import { FolderOpen, Loader, X } from '../icons';
import { useStrata } from '../../contexts/StrataContext';
import { useAppActions } from '../../hooks/useAppActions';
import { resolvePastedDriveUrl } from '../../lib/drive-page';
import { detectPageTypeFromMimeType, getTypeDisplayName } from '../../lib/embed-utils';

const LOOKUP_DEBOUNCE_MS = 400;
const LOOKUP_WAIT_MS = 1500;

function foundTypeLabel(resolved) {
  const mime = resolved?.meta?.mimeType;
  if (mime) {
    const detected = detectPageTypeFromMimeType(mime);
    if (detected.type !== 'drive') return getTypeDisplayName(detected.type);
  }
  return getTypeDisplayName(resolved?.parsed?.type);
}

/**
 * "Add Drive & URL" dialog: configure and open the Google Drive browser, or
 * paste a link. For Google links the file's real name is looked up and
 * suggested as the page name whenever Drive lets the app see the file.
 */
export function DriveUrlModal() {
  const { driveUrlModalValue, setDriveUrlModalValue, setShowDriveUrlModal, showNotification, isAuthenticated } = useStrata();
  const { addEmbedPageFromUrl, addGooglePages } = useAppActions();

  const [nameValue, setNameValue] = useState('');
  const [resolved, setResolved] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const nameTouchedRef = useRef(false);

  const url = (driveUrlModalValue || '').trim();
  const fetchMeta = isAuthenticated ? GoogleAPI.getDriveFileMetadata : null;

  // Debounced lookup of the pasted link. A request counter drops stale results.
  useEffect(() => {
    requestIdRef.current += 1;
    const id = requestIdRef.current;
    if (!url) {
      setResolved(null);
      setResolving(false);
      nameTouchedRef.current = false;
      setNameValue('');
      return undefined;
    }
    setResolving(true);
    const timer = setTimeout(() => {
      resolvePastedDriveUrl(url, fetchMeta).then((res) => {
        if (requestIdRef.current !== id) return;
        setResolved({ ...res, url });
        setResolving(false);
        if (res.metaStatus === 'found' && !nameTouchedRef.current) setNameValue(res.meta.name || '');
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // fetchMeta only changes with isAuthenticated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, isAuthenticated]);

  const close = () => {
    setShowDriveUrlModal(false);
    setDriveUrlModalValue('');
  };

  const openPicker = () => {
    if (typeof GoogleAPI === 'undefined' || !GoogleAPI.showDrivePicker) {
      showNotification('Drive Picker not available', 'error');
      return;
    }
    // Close first: the Picker renders below this dialog's z-index.
    close();
    GoogleAPI.showDrivePicker((files) => addGooglePages(files), {
      multiple: true,
      title: 'Add Drive files to Strata',
    });
  };

  const submit = async () => {
    if (!url || submitting) return;
    setSubmitting(true);
    try {
      let res = resolved?.url === url ? resolved : null;
      if (!res) {
        // The debounce has not fired yet (or the lookup is still running): give
        // Drive a moment to answer, then go ahead with whatever we have.
        res = await Promise.race([
          resolvePastedDriveUrl(url, fetchMeta).then((r) => ({ ...r, url })),
          new Promise((resolve) => setTimeout(() => resolve(null), LOOKUP_WAIT_MS)),
        ]);
      }
      const typed = nameValue.trim();
      const name = typed || res?.suggestedName || '';
      const ok = addEmbedPageFromUrl(url, { ...(res || {}), name });
      if (ok) close();
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  const status = (() => {
    if (!url) return null;
    if (resolving || resolved?.url !== url) return { tone: 'muted', icon: 'loader', text: 'Checking link…' };
    if (!resolved?.parsed) return { tone: 'warn', text: "This doesn't look like a supported link. Paste a Google Drive, PDF, Lucidchart, Miro or Draw.io URL." };
    switch (resolved.metaStatus) {
      case 'found':
        return { tone: 'ok', text: `Found: ${resolved.meta.name} · ${foundTypeLabel(resolved)}` };
      case 'not-granted':
        return {
          tone: 'warn',
          text: "Drive won't share this file's name with Strata because it wasn't created or picked through Strata. Type a name below, or use Browse above (picking a file also grants access).",
        };
      case 'error':
        return { tone: 'warn', text: "Couldn't reach Drive to look up the name. You can still type one." };
      default:
        return null;
    }
  })();

  const statusClass = {
    muted: 'text-gray-400',
    ok: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-300',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-xl flex items-center gap-3 dark:text-white">
            <img src={DRIVE_LOGO_URL} alt="" className="w-8 h-8 object-contain" /> Add Drive &amp; URL
          </h3>
          <button onClick={close} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Close">
            <X size={20} className="dark:text-white" />
          </button>
        </div>

        {/* Browse */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Browse Google Drive</label>
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={openPicker}
                className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <FolderOpen size={18} /> Open Drive browser
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Browse Recent, My files, My Drive, Shared with me, Shared drives and Starred. Pick several files to add them all at once.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Sign in with Google to browse your Drive.</p>
          )}
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600"></div>
          <span className="text-sm text-gray-400">OR</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600"></div>
        </div>

        {/* Paste a link */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Paste a link</label>
          <input
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            placeholder="https://docs... or https://lucid.app/... or Miro URL"
            value={driveUrlModalValue}
            onChange={(e) => setDriveUrlModalValue(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          {status && (
            <div className={`mt-2 text-xs flex items-start gap-1.5 ${statusClass[status.tone]}`}>
              {status.icon === 'loader' && <Loader size={12} className="mt-0.5 animate-spin flex-shrink-0" />}
              <span className="break-words">{status.text}</span>
            </div>
          )}
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-2">Page name</label>
          <input
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            placeholder={resolved?.suggestedName || 'Page name (optional)'}
            value={nameValue}
            onChange={(e) => {
              setNameValue(e.target.value);
              nameTouchedRef.current = e.target.value.trim().length > 0;
            }}
            onKeyDown={onKeyDown}
          />
          <p className="text-xs text-gray-400 mt-2">
            Fills in automatically when Drive can tell Strata the file's name. Leave it blank to use the suggestion.
          </p>
        </div>

        <details className="mb-5 group">
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 select-none">Compatible types</summary>
          <div className="grid grid-cols-5 gap-2 mt-3">
            {DRIVE_SERVICE_ICONS.map((item) => (
              <div key={item.type} className="flex flex-col items-center gap-1">
                <img src={item.url} alt={item.name} className="w-10 h-10 object-contain rounded" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{item.name}</span>
              </div>
            ))}
          </div>
        </details>

        <div className="flex justify-end gap-3">
          <button
            onClick={close}
            className="px-5 py-2 font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!url || submitting}
            className="px-5 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader size={14} className="animate-spin" />} Add Page
          </button>
        </div>
      </div>
    </div>
  );
}
