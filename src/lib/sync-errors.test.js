import { describe, it, expect } from 'vitest';
import {
  classifyDriveError,
  describeSkipConsequence,
  describeSyncError,
  extractDriveReason,
  getDriveErrorMessage,
  skipNeedsConfirm,
  MAX_AUTO_RETRIES,
} from './sync-errors';

const CHILD_403_MESSAGE =
  'The user has not granted the app 623241453654 write access to the child file 1i8TlC7IDQBhMmEizqVuwfMVsZ_yxCfFMEtxhVHzcsXw, which would be affected by the operation on the parent.';

const gapiError = (code, reason, message = 'boom') => ({
  status: code,
  result: { error: { code, message, errors: reason ? [{ domain: 'global', reason, message }] : [] } },
  body: JSON.stringify({ error: { code, message, errors: reason ? [{ reason, message }] : [] } }),
});

const fetchError = (code, reason, message = 'boom') => {
  const err = new Error(JSON.stringify({ error: { code, message, errors: reason ? [{ reason, message }] : [] } }));
  err.status = code;
  return err;
};

describe('extractDriveReason / getDriveErrorMessage', () => {
  it('reads the reason and message from a gapi error', () => {
    const err = gapiError(403, 'appNotAuthorizedToFile', CHILD_403_MESSAGE);
    expect(extractDriveReason(err)).toBe('appNotAuthorizedToFile');
    expect(getDriveErrorMessage(err)).toBe(CHILD_403_MESSAGE);
  });

  it('reads the reason and message from a JSON body in a fetch error', () => {
    const err = fetchError(403, 'userRateLimitExceeded', 'Rate limit');
    expect(extractDriveReason(err)).toBe('userRateLimitExceeded');
    expect(getDriveErrorMessage(err)).toBe('Rate limit');
  });

  it('falls back to the plain message and a default', () => {
    expect(getDriveErrorMessage(new Error('plain'))).toBe('plain');
    expect(getDriveErrorMessage(null)).toBe('Drive request failed');
    expect(extractDriveReason(new Error('plain'))).toBeNull();
  });
});

describe('classifyDriveError', () => {
  it('classifies the child-file 403 as permission (gapi shape)', () => {
    const c = classifyDriveError(gapiError(403, 'appNotAuthorizedToFile', CHILD_403_MESSAGE));
    expect(c.kind).toBe('permission');
    expect(c.status).toBe(403);
    expect(c.reason).toBe('appNotAuthorizedToFile');
    expect(c.message).toBe(CHILD_403_MESSAGE);
  });

  it('classifies the child-file 403 as permission (fetch shape)', () => {
    expect(classifyDriveError(fetchError(403, 'appNotAuthorizedToFile', CHILD_403_MESSAGE)).kind).toBe('permission');
  });

  it('treats the real message as permission even without a status or reason', () => {
    expect(classifyDriveError(new Error(CHILD_403_MESSAGE)).kind).toBe('permission');
  });

  it('treats an unknown 403 as permission', () => {
    expect(classifyDriveError(gapiError(403, null, 'Forbidden')).kind).toBe('permission');
    expect(classifyDriveError(gapiError(403, 'insufficientFilePermissions')).kind).toBe('permission');
  });

  it('classifies rate limits', () => {
    expect(classifyDriveError(gapiError(403, 'userRateLimitExceeded')).kind).toBe('rate-limit');
    expect(classifyDriveError(gapiError(403, 'rateLimitExceeded')).kind).toBe('rate-limit');
    expect(classifyDriveError(fetchError(429, null, 'Too many')).kind).toBe('rate-limit');
  });

  it('classifies a full Drive as quota', () => {
    expect(classifyDriveError(gapiError(403, 'storageQuotaExceeded')).kind).toBe('quota');
  });

  it('classifies auth errors', () => {
    expect(classifyDriveError(gapiError(401, 'authError')).kind).toBe('auth');
    expect(classifyDriveError(new Error('Authentication expired')).kind).toBe('auth');
    expect(classifyDriveError(new Error('Not authenticated')).kind).toBe('auth');
  });

  it('classifies network errors', () => {
    expect(classifyDriveError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classifyDriveError(new Error('network error')).kind).toBe('network');
  });

  it('classifies everything else as other', () => {
    expect(classifyDriveError(gapiError(500, 'backendError')).kind).toBe('other');
    expect(classifyDriveError(gapiError(400, 'badRequest')).kind).toBe('other');
    expect(classifyDriveError(new Error('weird')).kind).toBe('other');
  });
});

describe('copy helpers', () => {
  it('gives a hint for permission and quota, none for a first generic failure', () => {
    expect(describeSyncError({ kind: 'permission' })).toMatch(/Skipping leaves the item in Drive/);
    expect(describeSyncError({ kind: 'quota' })).toMatch(/storage is full/);
    expect(describeSyncError({ kind: 'other', attempts: 1 })).toBeNull();
    expect(describeSyncError({ kind: 'other', attempts: MAX_AUTO_RETRIES })).toMatch(/failed repeatedly/);
  });

  it('describes skip consequences per op type', () => {
    expect(describeSkipConsequence({ type: 'trash' })).toMatch(/stays in your Drive/);
    expect(describeSkipConsequence({ type: 'patchPage' }, 'Notes')).toMatch(/"Notes"/);
    expect(describeSkipConsequence({ type: 'saveIndex' })).toMatch(/Ordering/);
  });

  it('only upload ops need a confirm click', () => {
    expect(skipNeedsConfirm({ type: 'patchPage' })).toBe(true);
    expect(skipNeedsConfirm({ type: 'ensureFolder' })).toBe(true);
    expect(skipNeedsConfirm({ type: 'trash' })).toBe(false);
    expect(skipNeedsConfirm({ type: 'saveIndex' })).toBe(false);
  });
});
