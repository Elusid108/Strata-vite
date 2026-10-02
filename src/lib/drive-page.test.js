import { describe, it, expect, vi } from 'vitest';
import {
  PICKER_START_VIEWS,
  PICKER_TYPE_FILTERS,
  buildDrivePage,
  buildEmbedUrlForDriveFile,
  buildPageFromParsedUrl,
  defaultPageNameFor,
  mergePickedDocs,
  mimeTypesForFilter,
  pickerViewSpecs,
  readPickerPrefs,
  resolvePastedDriveUrl,
  writePickerPrefs,
} from './drive-page';
import { parseEmbedUrl } from './embed-utils';

const DOC = 'application/vnd.google-apps.document';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const FOLDER = 'application/vnd.google-apps.folder';

describe('buildDrivePage', () => {
  it('maps mime types to page types with the right embed url', () => {
    const page = buildDrivePage({ id: 'abc', name: 'Budget', mimeType: SHEET, webViewLink: 'https://docs.google.com/spreadsheets/d/abc/edit?usp=x' });
    expect(page).toMatchObject({
      name: 'Budget',
      type: 'sheet',
      icon: '📊',
      driveFileId: 'abc',
      mimeType: SHEET,
      embedUrl: 'https://docs.google.com/spreadsheets/d/abc/edit',
      webViewLink: 'https://docs.google.com/spreadsheets/d/abc/edit?usp=x',
    });
    expect(page.id).toBeTypeOf('string');
    expect(page.createdAt).toBeTypeOf('number');
  });

  it('falls back to a generic name and the drive type', () => {
    const page = buildDrivePage({ id: 'x', mimeType: 'image/png', url: 'https://drive.google.com/file/d/x/view' });
    expect(page.name).toBe('Google File');
    expect(page.type).toBe('drive');
    expect(page.embedUrl).toBe('https://drive.google.com/file/d/x/preview');
    expect(page.webViewLink).toBe('https://drive.google.com/file/d/x/view');
  });

  it('uses the web url for sites and the preview url otherwise', () => {
    expect(buildEmbedUrlForDriveFile('site', 'id', 'https://sites.google.com/view/x?authuser=0')).toBe('https://sites.google.com/view/x');
    expect(buildEmbedUrlForDriveFile('site', 'id', '')).toBe('https://drive.google.com/file/d/id/preview');
    expect(buildEmbedUrlForDriveFile('doc', 'id')).toBe('https://docs.google.com/document/d/id/edit');
    expect(buildEmbedUrlForDriveFile('pdf', 'id')).toBe('https://drive.google.com/file/d/id/preview');
  });
});

describe('buildPageFromParsedUrl', () => {
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0';

  it('uses the generic name when none is given and keeps the pasted url', () => {
    const parsed = parseEmbedUrl(sheetUrl);
    const page = buildPageFromParsedUrl(sheetUrl, parsed);
    expect(page.name).toBe('Google Sheet');
    expect(page.type).toBe('sheet');
    expect(page.driveFileId).toBe('abc');
    expect(page.webViewLink).toBe(sheetUrl);
    expect(page.mimeType).toBeUndefined();
  });

  it('prefers the resolved name and records the mime type', () => {
    const parsed = parseEmbedUrl(sheetUrl);
    const page = buildPageFromParsedUrl(sheetUrl, parsed, { name: '  Q3 Budget ', mimeType: SHEET });
    expect(page.name).toBe('Q3 Budget');
    expect(page.mimeType).toBe(SHEET);
  });

  it('upgrades a generic drive link to the real type when the mime type is known', () => {
    const url = 'https://drive.google.com/file/d/pdf1/view?usp=sharing';
    const parsed = parseEmbedUrl(url);
    expect(parsed.type).toBe('drive');
    const page = buildPageFromParsedUrl(url, parsed, { name: 'Handbook.pdf', mimeType: 'application/pdf' });
    expect(page.type).toBe('pdf');
    expect(page.icon).toBe('📑');
    expect(page.embedUrl).toBe('https://drive.google.com/file/d/pdf1/preview');
    const doc = buildPageFromParsedUrl(url, parsed, { mimeType: DOC });
    expect(doc.type).toBe('doc');
    expect(doc.embedUrl).toBe('https://docs.google.com/document/d/pdf1/edit');
  });

  it('leaves unknown binaries as drive pages', () => {
    const url = 'https://drive.google.com/file/d/img/view';
    const page = buildPageFromParsedUrl(url, parseEmbedUrl(url), { mimeType: 'image/png' });
    expect(page.type).toBe('drive');
  });

  it('names non-Google services by their type', () => {
    const url = 'https://miro.com/app/board/abc123=/';
    const parsed = parseEmbedUrl(url);
    expect(defaultPageNameFor(parsed)).toBe('Miro');
    expect(buildPageFromParsedUrl(url, parsed).name).toBe('Miro');
  });
});

describe('resolvePastedDriveUrl', () => {
  it('returns found metadata and uses its name', async () => {
    const fetchMeta = vi.fn().mockResolvedValue({ id: 'abc', name: 'Roadmap', mimeType: DOC });
    const res = await resolvePastedDriveUrl('https://docs.google.com/document/d/abc/edit', fetchMeta);
    expect(fetchMeta).toHaveBeenCalledWith('abc');
    expect(res.metaStatus).toBe('found');
    expect(res.suggestedName).toBe('Roadmap');
    expect(res.parsed.type).toBe('doc');
  });

  it('reports not-granted when Drive returns nothing', async () => {
    const res = await resolvePastedDriveUrl('https://docs.google.com/document/d/abc/edit', async () => null);
    expect(res.metaStatus).toBe('not-granted');
    expect(res.suggestedName).toBe('Google Doc');
  });

  it('reports error on a rejected lookup and never throws', async () => {
    const res = await resolvePastedDriveUrl('https://docs.google.com/document/d/abc/edit', async () => {
      throw new Error('boom');
    });
    expect(res.metaStatus).toBe('error');
    expect(res.suggestedName).toBe('Google Doc');
  });

  it('does not look up non-Google urls or unparseable input', async () => {
    const fetchMeta = vi.fn();
    const miro = await resolvePastedDriveUrl('https://miro.com/app/board/abc123=/', fetchMeta);
    expect(miro.metaStatus).toBe('none');
    expect(miro.suggestedName).toBe('Miro');
    const junk = await resolvePastedDriveUrl('not a url at all', fetchMeta);
    expect(junk.parsed).toBeNull();
    expect(junk.metaStatus).toBe('none');
    expect(fetchMeta).not.toHaveBeenCalled();
  });
});

describe('pickerViewSpecs', () => {
  it('puts the requested start view first and keeps all six', () => {
    const keys = pickerViewSpecs({ startIn: 'drives' }).map((s) => s.key);
    expect(keys[0]).toBe('drives');
    expect([...keys].sort()).toEqual(PICKER_START_VIEWS.map((v) => v.key).sort());
    expect(pickerViewSpecs({ startIn: 'nope' })[0].key).toBe('recent');
  });

  it('describes each view correctly', () => {
    const byKey = Object.fromEntries(pickerViewSpecs().map((s) => [s.key, s]));
    expect(byKey.recent).toMatchObject({ viewId: 'RECENTLY_PICKED', includeFolders: false });
    expect(byKey.mine).toMatchObject({ ownedByMe: true, includeFolders: true, mode: 'list' });
    expect(byKey.shared).toMatchObject({ ownedByMe: false });
    expect(byKey.drives).toMatchObject({ enableDrives: true });
    expect(byKey.starred).toMatchObject({ starred: true });
    expect(byKey.drive.ownedByMe).toBeUndefined();
  });

  it('propagates the type filter (plus folders) and the search seed to every view', () => {
    const specs = pickerViewSpecs({ mimeTypes: [SHEET], query: '  budget ' });
    for (const s of specs) {
      expect(s.mimeTypes).toEqual([SHEET, FOLDER]);
      expect(s.query).toBe('budget');
    }
    expect(pickerViewSpecs({ mimeTypes: `${DOC},${SHEET}` })[0].mimeTypes).toEqual([DOC, SHEET, FOLDER]);
    expect(pickerViewSpecs()[0].mimeTypes).toEqual([]);
  });

  it('maps filter keys to mime lists', () => {
    expect(mimeTypesForFilter('sheets')).toEqual([SHEET]);
    expect(mimeTypesForFilter('all')).toEqual([]);
    expect(mimeTypesForFilter('bogus')).toEqual([]);
    expect(PICKER_TYPE_FILTERS.map((f) => f.key)).toContain('pdf');
  });
});

describe('picker prefs', () => {
  it('round-trips and falls back on bad or unknown values', () => {
    expect(readPickerPrefs()).toEqual({ startIn: 'recent', typeFilter: 'all' });
    writePickerPrefs({ startIn: 'drives', typeFilter: 'sheets' });
    expect(readPickerPrefs()).toEqual({ startIn: 'drives', typeFilter: 'sheets' });
    localStorage.setItem('strata_picker_prefs', '{not json');
    expect(readPickerPrefs()).toEqual({ startIn: 'recent', typeFilter: 'all' });
    localStorage.setItem('strata_picker_prefs', JSON.stringify({ startIn: 'mars', typeFilter: 'sheets' }));
    expect(readPickerPrefs()).toEqual({ startIn: 'recent', typeFilter: 'sheets' });
  });
});

describe('mergePickedDocs', () => {
  it('prefers metadata and falls back to picker data per file', () => {
    const docs = [
      { id: 'a', name: 'Picker A', mimeType: DOC, url: 'https://docs.google.com/document/d/a/edit' },
      { id: 'b', name: 'Picker B', mimeType: 'application/pdf', url: 'https://drive.google.com/file/d/b/view', iconUrl: 'icon-b' },
    ];
    const settled = [
      { status: 'fulfilled', value: { id: 'a', name: 'Real A', mimeType: DOC, webViewLink: 'https://docs.google.com/document/d/a/edit?usp=drivesdk' } },
      { status: 'rejected', reason: new Error('404') },
    ];
    const merged = mergePickedDocs(docs, settled);
    expect(merged[0]).toMatchObject({ id: 'a', name: 'Real A', webViewLink: 'https://docs.google.com/document/d/a/edit?usp=drivesdk' });
    expect(merged[0].url).toBe(merged[0].webViewLink);
    expect(merged[1]).toMatchObject({ id: 'b', name: 'Picker B', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/b/view', iconLink: 'icon-b' });
    expect(mergePickedDocs(docs, [{ status: 'fulfilled', value: null }])[0].name).toBe('Picker A');
    expect(mergePickedDocs(null)).toEqual([]);
  });
});
