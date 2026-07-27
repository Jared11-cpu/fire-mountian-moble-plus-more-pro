import type { CityName } from '../data/mockData';
import { mockStartPoints } from '../data/routeData';
import type { UserLocation } from '../types/route';

export const mockLocationOptions = Object.values(mockStartPoints).map((point) => ({
  city: point.city,
  name: point.name,
  lat: point.lat,
  lng: point.lng,
}));

export function makeMockLocation(city: CityName): UserLocation {
  const point = mockStartPoints[city];
  return {
    city,
    name: point.name,
    lat: point.lat,
    lng: point.lng,
    status: 'mock',
    message: '已使用 Mock 出发地，可在后续接入高德逆地理编码。',
  };
}

export function getBrowserLocation(fallbackCity: CityName): Promise<UserLocation> {
  if (!('geolocation' in navigator)) {
    return Promise.resolve({
      ...makeMockLocation(fallbackCity),
      status: 'unsupported',
      message: '当前浏览器不支持定位，出发地未更改，请手动填写。',
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const address = await reverseBrowserLocation(lat, lng).catch(() => undefined);
        const placeName = address ? compactAddress(address) : '我的当前位置';
        resolve({
          city: fallbackCity,
          name: placeName,
          lat,
          lng,
          status: 'success',
          message: `已定位到${placeName}，生成方案后将从这里连接至${fallbackCity}首站。`,
        });
      },
      (error) => {
        resolve({
          ...makeMockLocation(fallbackCity),
          status: 'denied',
          message: error.code === error.TIMEOUT ? '定位超时，出发地未更改，请检查网络后重试。' : '没有获得定位权限，出发地未更改；请在浏览器地址栏允许定位后重试。',
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

type ReverseLocation = { formattedAddress?: string; city?: string; district?: string; township?: string; street?: string; number?: string };
export type ResolvedManualLocation = { name: string; lat: number; lng: number; coordinateSystem: 'gcj02' };

export async function reverseBrowserLocation(lat: number, lng: number, fetcher: typeof fetch = fetch): Promise<ReverseLocation | undefined> {
  const params = new URLSearchParams({ location: `${lng},${lat}`, coordsys: 'gps' });
  const response = await fetcher(`/api/location/reverse?${params}`);
  if (!response.ok) return undefined;
  const payload = await response.json() as ReverseLocation;
  return payload && typeof payload === 'object' ? payload : undefined;
}

export async function resolveManualLocation(address: string, fetcher: typeof fetch = fetch): Promise<ResolvedManualLocation> {
  const query = address.trim();
  if (!query) throw new Error('请先输入出发地。');
  const params = new URLSearchParams({ address: query });
  const response = await fetcher(`/api/location/geocode?${params}`);
  let payload: { error?: string; formattedAddress?: string; location?: { lng?: number; lat?: number } } | null = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(payload?.error || '出发地解析失败，请补充城市、区县或道路名称。');
  const lat = Number(payload?.location?.lat);
  const lng = Number(payload?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('出发地没有返回有效坐标，请换一个更具体的名称。');
  return { name: payload?.formattedAddress?.trim() || query, lat, lng, coordinateSystem: 'gcj02' };
}

function compactAddress(address: ReverseLocation) {
  const street = `${address.street || ''}${address.number || ''}`;
  const parts = [address.city, address.district, address.township, street].filter(Boolean);
  return parts.join(' · ') || address.formattedAddress || '我的当前位置';
}
