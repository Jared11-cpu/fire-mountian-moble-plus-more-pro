import { commonsImageUrl } from '../data/commonsMirror';
import type { RoutePoint } from '../types/route';

export type PointCover = Pick<RoutePoint, 'imageUrl' | 'imageCredit'> & { imageUrl: string; imageCredit: NonNullable<RoutePoint['imageCredit']> };

function commonsCover(fileName: string, author = 'Wikimedia Commons', license = '许可见来源页'): PointCover {
  const fileTitle = fileName.replace(/ /g, '_');
  return {
    imageUrl: commonsImageUrl(fileName),
    imageCredit: {
      author,
      license,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileTitle)}`,
    },
  };
}

const CURATED_COVERS: ReadonlyArray<{ matches: (name: string) => boolean; cover: PointCover }> = [
  { matches: (name) => /武汉站|武汉火车站/.test(name), cover: commonsCover('20240621 West facade of Wuhan Railway Station.jpg') },
  { matches: (name) => /武汉大学|珞珈山/.test(name), cover: commonsCover('Wuhan University Administration Building.jpg', 'Howchou', 'CC BY 4.0') },
  { matches: (name) => /武汉长江大桥|长江大桥/.test(name), cover: commonsCover('20240621 First Wuhan Yangtze Bridge 04.jpg', 'Windmemories', 'CC BY-SA 4.0') },
  { matches: (name) => /武汉古建筑|江汉关/.test(name), cover: commonsCover('20230208 Hankow Customs House.jpg') },
  { matches: (name) => /黄鹤楼/.test(name), cover: commonsCover('CN - Hubei - Wuhan - Kranichpagode.jpg') },
  { matches: (name) => /昙华林/.test(name), cover: commonsCover('Tanhualin.JPG') },
  { matches: (name) => /宜昌东站/.test(name), cover: commonsCover('Platforms of Yichang East Railway Station.JPG', 'CaiDie', 'CC BY-SA 3.0') },
  { matches: (name) => /三峡工程党建文化广场|三峡大坝|三峡游客中心/.test(name), cover: commonsCover('Three Gorges Dam.jpg', 'Dan Kamminga', 'CC BY-SA 2.0') },
  { matches: (name) => /坛子岭/.test(name), cover: commonsCover('200407-sandouping-sanxiadaba.jpg') },
  { matches: (name) => /185\s*平台/.test(name), cover: commonsCover('Drei-Schluchten-Damm (Jangtse).jpg') },
  { matches: (name) => /西坝/.test(name), cover: commonsCover('Hanyi Road-Central Street 01.jpg') },
  { matches: (name) => /宜昌.*滨江|滨江公园/.test(name), cover: commonsCover('从滨江公园看对面的雨 - panoramio.jpg', 'Danny Luo', 'CC BY-SA 3.0') },
];

export function getCuratedPointCover(name: string) {
  return CURATED_COVERS.find((item) => item.matches(name.trim()))?.cover;
}

type CommonsPage = {
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};

type AmapPhotoPoi = {
  name?: string;
  location?: { lng?: number; lat?: number };
  photos?: string[];
};

export async function fetchPointCover(city: string, pointName: string, signal?: AbortSignal, location?: { lng: number; lat: number }): Promise<PointCover | undefined> {
  const amapCover = await fetchAmapPointCover(city, pointName, signal, location).catch(() => undefined);
  if (amapCover) return amapCover;

  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '5',
    gsrsearch: `${city} ${pointName}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1280',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal });
  if (!response.ok) return undefined;
  const payload = await response.json() as { query?: { pages?: Record<string, CommonsPage> } };
  const page = Object.values(payload.query?.pages ?? {}).find((item) => item.imageinfo?.[0]?.thumburl || item.imageinfo?.[0]?.url);
  const info = page?.imageinfo?.[0];
  if (!page?.title || !info) return undefined;
  const metadata = info.extmetadata ?? {};
  const clean = (value?: string) => value?.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim();
  return {
    imageUrl: info.thumburl ?? info.url ?? '',
    imageCredit: {
      author: clean(metadata.Artist?.value) || 'Wikimedia Commons',
      license: clean(metadata.LicenseShortName?.value) || '许可见来源页',
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    },
  };
}

async function fetchAmapPointCover(city: string, pointName: string, signal?: AbortSignal, location?: { lng: number; lat: number }): Promise<PointCover | undefined> {
  return (await fetchPointGallery(city, pointName, signal, location, 1))[0];
}

export async function fetchPointGallery(city: string, pointName: string, signal?: AbortSignal, location?: { lng: number; lat: number }, limit = 4): Promise<PointCover[]> {
  const exactParams = new URLSearchParams({ city, keywords: pointName, pageSize: '10', allTypes: '1' });
  const exactRows = await fetchAmapPhotoRows(exactParams, signal);
  let selectedRows = selectAmapPhotos(exactRows, pointName);
  let nearby = false;

  if (!selectedRows.length && location && Number.isFinite(location.lng) && Number.isFinite(location.lat)) {
    const nearbyParams = new URLSearchParams({ city, keywords: '景点', pageSize: '25', location: `${location.lng},${location.lat}` });
    const nearbyRows = await fetchAmapPhotoRows(nearbyParams, signal);
    selectedRows = selectStableNearbyPhotos(nearbyRows, pointName);
    nearby = selectedRows.length > 0;
  }

  const seen = new Set<string>();
  return selectedRows.flatMap((selected) => {
    const markerName = selected.name || pointName;
    const markerLocation = selected.location && Number.isFinite(selected.location.lng) && Number.isFinite(selected.location.lat)
      ? `position=${selected.location.lng},${selected.location.lat}&` : '';
    return (selected.photos ?? []).map(securePhotoUrl).filter((imageUrl): imageUrl is string => Boolean(imageUrl)).map((imageUrl) => ({
      imageUrl,
      imageCredit: {
        author: nearby ? `高德地图 · ${markerName}附近实景` : '高德地图地点相册',
        license: '来源与使用规则见地点页',
        sourceUrl: `https://uri.amap.com/marker?${markerLocation}name=${encodeURIComponent(markerName)}`,
      },
    }));
  }).filter((cover) => { if (seen.has(cover.imageUrl)) return false; seen.add(cover.imageUrl); return true; }).slice(0, Math.max(1, limit));
}

async function fetchAmapPhotoRows(params: URLSearchParams, signal?: AbortSignal) {
  const response = await fetch(`/api/attractions/search?${params}`, { signal });
  if (!response.ok) return [];
  const payload = await response.json() as { items?: AmapPhotoPoi[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

function selectAmapPhotos(rows: AmapPhotoPoi[], pointName: string) {
  const needle = normalizePlaceName(pointName);
  return rows.filter((row) => {
    const name = normalizePlaceName(row.name || '');
    return Boolean(name) && (name === needle || name.includes(needle) || needle.includes(name));
  }).filter((row) => row.photos?.some(Boolean));
}

function selectStableNearbyPhotos(rows: AmapPhotoPoi[], pointName: string) {
  const candidates = rows.filter((row) => row.photos?.some(Boolean));
  if (!candidates.length) return [];
  const hash = [...pointName].reduce((sum, char) => (sum * 31 + (char.codePointAt(0) || 0)) >>> 0, 0);
  return [...candidates.slice(hash % candidates.length), ...candidates.slice(0, hash % candidates.length)];
}

function normalizePlaceName(value: string) {
  return value.replace(/[\s·・（）()\-—]/g, '').replace(/(?:风景名胜区|风景区|旅游区|景区)$/u, '');
}

function securePhotoUrl(value?: string) {
  if (!value) return undefined;
  return value.replace(/^http:\/\//i, 'https://');
}
