/*
 * Drive error classification for the sync worker.
 *
 * Pure module: no gapi, no React. Errors come in two shapes:
 *   - gapi.client:  { status, result: { error: { code, message, errors: [{ reason, message }] } }, body }
 *   - fetch-based:  DriveRequestError { status, message } where message may be the raw JSON body
 */

const PERMISSION_REASONS = new Set([
  'appNotAuthorizedToFile',
  'insufficientFilePermissions',
  'insufficientPermissions',
  'forbidden',
]);

const RATE_LIMIT_REASONS = new Set([
  'userRateLimitExceeded',
  'rateLimitExceeded',
  'dailyLimitExceeded',
  'sharingRateLimitExceeded',
]);

const QUOTA_REASONS = new Set(['storageQuotaExceeded']);

export const MAX_AUTO_RETRIES = 8;

function parseJsonBody(raw) {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getDriveErrorStatus(error) {
  if (!error) return null;
  const direct = error.status || error.result?.error?.code;
  if (direct) return Number(direct) || null;
  const parsed = parseJsonBody(error.body) || parseJsonBody(error.message);
  return Number(parsed?.error?.code) || null;
}

export function extractDriveReason(error) {
  if (!error) return null;
  const fromResult = error.result?.error?.errors?.[0]?.reason || error.result?.error?.details?.[0]?.reason;
  if (fromResult) return fromResult;
  const parsed = parseJsonBody(error.body) || parseJsonBody(error.message);
  return parsed?.error?.errors?.[0]?.reason || parsed?.error?.details?.[0]?.reason || null;
}

export const getDriveErrorMessage = (error) => {
  if (!error) return 'Drive request failed';
  const fromResult = error.result?.error?.message;
  if (fromResult) return fromResult;
  const raw = error.body || error.message;
  if (typeof raw === 'string') {
    const parsed = parseJsonBody(raw);
    if (parsed?.error?.message) return parsed.error.message;
    if (error.message) return error.message;
  }
  return 'Drive request failed';
};

/**
 * @returns {{ kind: 'auth'|'network'|'rate-limit'|'quota'|'permission'|'other', status: number|null, reason: string|null, message: string }}
 */
export function classifyDriveError(error) {
  const status = getDriveErrorStatus(error);
  const reason = extractDriveReason(error);
  const message = getDriveErrorMessage(error);
  const text = `${error?.message || ''} ${message}`;

  let kind = 'other';
  if (status === 401 || /authentication|not authenticated/i.test(text)) {
    kind = 'auth';
  } else if (error instanceof TypeError || (/failed to fetch|network/i.test(text) && !status)) {
    kind = 'network';
  } else if (status === 429 || (status === 403 && RATE_LIMIT_REASONS.has(reason))) {
    kind = 'rate-limit';
  } else if (status === 403 && QUOTA_REASONS.has(reason)) {
    kind = 'quota';
  } else if (status === 403 || PERMISSION_REASONS.has(reason) || /not granted the app .* access/i.test(text)) {
    // Any 403 that is not a rate limit or quota problem is a permission problem:
    // blocking on it is safer than spinning.
    kind = 'permission';
  }

  return { kind, status, reason, message };
}

/** Plain-language hint shown under a sync error, keyed by the classified kind. */
export function describeSyncError(classified) {
  switch (classified?.kind) {
    case 'permission':
      return "Drive won't let Strata change this item, usually because the folder contains files Strata didn't create. Re-authorizing won't help: Strata can only touch files it created. Skipping leaves the item in Drive.";
    case 'quota':
      return 'Your Google Drive storage is full. Free up space, then press Retry now.';
    case 'rate-limit':
      return 'Google is rate-limiting requests. Strata will keep retrying.';
    case 'other':
      return classified?.attempts >= MAX_AUTO_RETRIES
        ? 'This change has failed repeatedly. You can retry it or skip it.'
        : null;
    default:
      return null;
  }
}

/** What the user gives up by skipping this op. */
export function describeSkipConsequence(op, name) {
  const label = name ? `"${name}"` : 'this item';
  switch (op?.type) {
    case 'trash':
      return 'The item stays in your Drive (you can move it to the bin yourself) and stays hidden in Strata.';
    case 'ensurePageFile':
    case 'patchPage':
      return `The latest changes to ${label} will exist only on this device until you edit the page again. Drive may keep an older copy.`;
    case 'ensureFolder':
      return `Pages in ${label} cannot upload until Strata can create this folder.`;
    case 'saveIndex':
      return 'Ordering may look different on other devices until the next change.';
    case 'move':
    case 'rename':
      return 'Drive keeps the old name or location; Strata keeps yours.';
    default:
      return 'This change will not be sent to Drive.';
  }
}

/** Skipping an upload op can lose data; those need a second click. */
export function skipNeedsConfirm(op) {
  return op?.type === 'ensurePageFile' || op?.type === 'patchPage' || op?.type === 'ensureFolder';
}
