import { useEffect, useState } from 'react';
import { AlertCircle, X } from '../../components/icons';
import { describeSyncOp, formatLastSyncTime, formatSyncProgress } from '../../lib/sync-status';

function phaseTitle(phase) {
  if (phase === 'connecting') return 'Connecting';
  if (phase === 'retrying') return 'Retrying';
  if (phase === 'waiting') return 'Waiting';
  if (phase === 'syncing') return 'Syncing';
  return 'Synced';
}

export function SyncStatusPanel({ syncStatus, data, condensed, onClose }) {
  const [now, setNow] = useState(Date.now());
  const retryAt = syncStatus?.error?.retryAt;
  const phase = syncStatus?.phase || 'idle';

  useEffect(() => {
    if (phase !== 'retrying' || !retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase, retryAt]);

  const progress = formatSyncProgress(syncStatus);
  const remaining = syncStatus?.remaining || 0;
  const completed = syncStatus?.completed || 0;
  const total = remaining > 0 ? completed + remaining : completed;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : (phase === 'idle' ? 100 : 0);
  const currentLabel = describeSyncOp(syncStatus?.currentOp, data);
  const upcoming = (syncStatus?.queue || []).slice(1, 16);
  const retryIn = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  const isError = phase === 'retrying' || (phase === 'idle' && syncStatus?.error);

  return (
    <div
      className={`absolute z-40 max-h-80 overflow-hidden flex flex-col rounded-lg border bg-white dark:bg-gray-800 shadow-lg min-w-0 ${
        isError ? 'border-amber-400 dark:border-amber-600' : 'border-gray-200 dark:border-gray-700'
      } ${condensed ? 'bottom-12 left-full ml-1 w-56' : 'left-0 right-0 bottom-full mb-1 w-auto'}`}
      role="dialog"
      aria-label="Sync status"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 min-w-0">
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-semibold truncate ${isError ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200'}`}>
            {phaseTitle(phase)}
            {progress ? ` ${progress}` : ''}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0" title="Close">
          <X size={12} />
        </button>
      </div>

      <div className="px-3 pt-2">
        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full transition-all ${isError ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="px-3 py-2 text-xs border-b border-gray-100 dark:border-gray-700 min-w-0">
        {phase === 'connecting' && <div className="text-gray-600 dark:text-gray-300">Connecting to Google Drive...</div>}
        {phase === 'waiting' && (
          <div className="text-gray-600 dark:text-gray-300 truncate" title={`Waiting for parent folder. ${currentLabel}`}>
            Waiting for parent folder. {currentLabel}
          </div>
        )}
        {(phase === 'syncing' || phase === 'retrying') && syncStatus?.currentOp && (
          <div className="text-gray-800 dark:text-gray-100 font-medium truncate" title={currentLabel}>
            {currentLabel}
          </div>
        )}
        {phase === 'idle' && !syncStatus?.error && (
          <div className="text-gray-500 dark:text-gray-400">All changes are saved to Drive.</div>
        )}
      </div>

      {syncStatus?.error && (
        <div className="px-3 py-2 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-b border-amber-100 dark:border-amber-900">
          <div className="flex items-start gap-1.5 min-w-0">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Sync error{syncStatus.error.status ? ` (${syncStatus.error.status})` : ''}</div>
              <div className="break-words">{syncStatus.error.message}</div>
              {phase === 'retrying' && retryAt && (
                <div className="mt-1 text-amber-700 dark:text-amber-300">
                  {retryIn > 0 ? `Retrying in ${retryIn}s` : 'Retrying...'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 min-w-0">
          <div className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Up next ({remaining - 1} left)</div>
          <ul className="space-y-1 min-w-0">
            {upcoming.map((op) => (
              <li key={op.id} className="text-xs text-gray-600 dark:text-gray-300 truncate" title={describeSyncOp(op, data)}>
                {describeSyncOp(op, data)}
              </li>
            ))}
            {remaining - 1 > upcoming.length && (
              <li className="text-[10px] text-gray-400">+{remaining - 1 - upcoming.length} more</li>
            )}
          </ul>
        </div>
      )}

      <div className="px-3 py-2 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700 truncate">
        Last synced: {formatLastSyncTime(syncStatus?.lastSyncTime)}
      </div>
    </div>
  );
}

export function syncFooterLabel(syncStatus) {
  const phase = syncStatus?.phase || 'idle';
  const progress = formatSyncProgress(syncStatus);
  if (phase === 'connecting') return 'Connecting...';
  if (phase === 'retrying') return progress ? `Retrying... ${progress}` : 'Retrying...';
  if (phase === 'waiting') return progress ? `Waiting... ${progress}` : 'Waiting...';
  if (phase === 'syncing') return progress ? `Syncing... ${progress}` : 'Syncing...';
  return 'Synced';
}
