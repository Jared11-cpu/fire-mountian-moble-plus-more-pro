import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPointCover, fetchPointGallery, getCuratedPointCover } from './pointImageService';

afterEach(() => vi.unstubAllGlobals());

describe('pointImageService', () => {
  it('uses distinct landmark covers for the annotated Wuhan route', () => {
    const station = getCuratedPointCover('武汉站');
    const university = getCuratedPointCover('武汉大学');
    const bridge = getCuratedPointCover('武汉长江大桥');

    // 图片地址可能是本站镜像的哈希文件名，所以用署名里的原始页面来确认是哪一张。
    expect(decodeURIComponent(station?.imageCredit.sourceUrl ?? '')).toContain('Wuhan_Railway_Station');
    expect(decodeURIComponent(university?.imageCredit.sourceUrl ?? '')).toContain('Wuhan_University');
    expect(decodeURIComponent(bridge?.imageCredit.sourceUrl ?? '')).toContain('Wuhan_Yangtze_Bridge');
    expect(new Set([station?.imageUrl, university?.imageUrl, bridge?.imageUrl]).size).toBe(3);
  });

  it('loads a Wikimedia Commons cover for an unmapped route point', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ query: { pages: { 1: { title: 'File:East Lake.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/east-lake.jpg', extmetadata: { Artist: { value: 'Example' }, LicenseShortName: { value: 'CC BY 4.0' } } }] } } } }), { status: 200 })));

    const cover = await fetchPointCover('武汉', '东湖');
    expect(cover).toMatchObject({ imageUrl: 'https://upload.wikimedia.org/east-lake.jpg', imageCredit: { author: 'Example', license: 'CC BY 4.0' } });
  });

  it('prefers the exact AMap place photo and upgrades insecure image URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ name: '升子坪文化广场', location: { lng: 110.5, lat: 30.7 }, photos: ['http://store.is.autonavi.com/showpic/example'] }] }), { status: 200 })));

    const cover = await fetchPointCover('宜昌', '升子坪文化广场');
    expect(cover).toMatchObject({ imageUrl: 'https://store.is.autonavi.com/showpic/example', imageCredit: { author: '高德地图地点相册' } });
    expect(cover?.imageCredit.sourceUrl).toContain('position=110.5,30.7');
  });

  it('uses a stable nearby real photo when the exact place has no album', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ name: '小众地点', location: { lng: 111.05, lat: 30.82 }, photos: [] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ name: '附近景点', location: { lng: 111.01, lat: 30.82 }, photos: ['https://aos-comment.amap.com/nearby.jpg'] }] }), { status: 200 })));

    const cover = await fetchPointCover('宜昌', '小众地点', undefined, { lng: 111.05, lat: 30.82 });
    expect(cover).toMatchObject({ imageUrl: 'https://aos-comment.amap.com/nearby.jpg' });
    expect(cover?.imageCredit.author).toContain('附近实景');
  });

  it('returns several distinct exact-place photos for a journal detail gallery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ name: '龟山风景区', location: { lng: 114.27, lat: 30.56 }, photos: ['http://a.test/one.jpg', 'https://a.test/two.jpg', 'https://a.test/two.jpg'] }] }), { status: 200 })));

    const gallery = await fetchPointGallery('武汉', '龟山风景区');

    expect(gallery.map((item) => item.imageUrl)).toEqual(['https://a.test/one.jpg', 'https://a.test/two.jpg']);
    expect(gallery.every((item) => decodeURIComponent(item.imageCredit.sourceUrl).includes('龟山风景区'))).toBe(true);
  });
});
