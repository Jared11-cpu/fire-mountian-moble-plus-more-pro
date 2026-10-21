import { describe, expect, it } from 'vitest';
import { commonsImageUrl } from './commonsMirror';
import mirror from './commonsMirror.json';
import { getCuratedPointCover } from '../services/pointImageService';
import { cities } from './mockData';

describe('Commons photo mirror', () => {
  it('uses the local copy for mirrored photos and falls back to Commons otherwise', () => {
    expect(commonsImageUrl('Three Gorges Dam.jpg')).toMatch(/photos\/[0-9a-f]{12}\.jpg$/);
    expect(commonsImageUrl('Not Mirrored File.jpg')).toBe('https://commons.wikimedia.org/wiki/Special:Redirect/file/Not%20Mirrored%20File.jpg?width=1280');
  });

  it('keeps author, license and source credits when the image is served locally', () => {
    const dam = getCuratedPointCover('三峡大坝');
    expect(dam?.imageUrl).not.toContain('wikimedia.org');
    expect(dam?.imageCredit).toMatchObject({ author: 'Dan Kamminga', license: 'CC BY-SA 2.0', sourceUrl: expect.stringContaining('commons.wikimedia.org/wiki/File:Three_Gorges_Dam.jpg') });
  });

  it('serves every city cover from this site instead of an overseas host', () => {
    for (const city of cities) {
      if (city.imageUrl) expect(city.imageUrl, city.name).not.toMatch(/wikimedia\.org/);
      if (city.imageUrl) expect(city.imageCredit?.sourceUrl, city.name).toBeTruthy();
    }
  });

  it('has a non-empty mirror manifest with unique local files', () => {
    const files = Object.values(mirror as Record<string, string>);
    expect(files.length).toBeGreaterThanOrEqual(40);
    expect(new Set(files).size).toBe(files.length);
  });
});
