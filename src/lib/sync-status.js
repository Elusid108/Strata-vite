import { findFolderContext, findPageContext } from './sync-merge';
import { getLiveTree } from './sync-outbox';

export function describeSyncOp(op, data) {
  const tree = data || getLiveTree();
  if (!op) return 'Waiting...';
  switch (op.type) {
    case 'ensureFolder': {
      const found = findFolderContext(tree, op);
      if (op.entityType === 'tab') {
        return `Updating section: ${found?.tab?.name || 'Untitled'}`;
      }
      return `Updating notebook: ${found?.notebook?.name || 'Untitled'}`;
    }
    case 'ensurePageFile': {
      const found = findPageContext(tree, op.pageId);
      return `Uploading page: ${found?.page?.name || 'Untitled'}`;
    }
    case 'patchPage': {
      const found = findPageContext(tree, op.pageId);
      return `Saving page: ${found?.page?.name || 'Untitled'}`;
    }
    case 'trash':
      return 'Deleting from Drive';
    case 'move':
      return 'Moving item';
    case 'rename':
      return op.name ? `Renaming to ${String(op.name).replace(/\.json$/i, '')}` : 'Renaming';
    case 'saveIndex':
      return 'Updating index';
    default:
      return op.type || 'Syncing';
  }
}

export function formatSyncProgress(status) {
  const remaining = status?.remaining || 0;
  if (remaining <= 0) return null;
  const completed = status?.completed || 0;
  return `${completed + 1} of ${completed + remaining}`;
}

export function formatLastSyncTime(timestamp) {
  if (!timestamp) return 'Not synced yet';
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'Not synced yet';
  }
}
