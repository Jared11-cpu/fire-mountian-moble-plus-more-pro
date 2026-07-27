import type { RoutePoint } from '../types/route';

export const AMAP_MAX_WAYPOINTS = 16;

let amapLoaderPromise: Promise<any> | undefined;
const AMAP_SCRIPT_SELECTOR = 'script[data-amap-js-api="2"]';
const AMAP_TIMEOUT_MS = 10_000;

export type RoadPlanStatus = 'loading' | 'planned' | 'no-data' | 'auth-error' | 'network-error' | 'fallback';

export type RoadPlanMetrics = {
  status: RoadPlanStatus;
  distanceKm?: number;
  durationMinutes?: number;
  source: 'amap-driving' | 'amap-transit' | 'estimate';
  message: string;
};

export type DrivingSearchFailure = {
  status: string;
  result?: unknown;
  error?: unknown;
};

export type DrivingPlanResult = {
  path: [number, number][];
  paths: Array<Array<[number, number]>>;
  distanceMeters: number;
  durationSeconds: number;
  drivingInstances: any[];
};

export async function planBackendDrivingRoute(points: RoutePoint[]): Promise<DrivingPlanResult> {
  if (points.length < 2) throw { status: 'no_data', result: 'Route needs at least two points' } satisfies DrivingSearchFailure;
  const mergedPath: [number, number][] = [];
  const roadPaths: Array<Array<[number, number]>> = [];
  let distanceMeters = 0;
  let durationSeconds = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const response = await fetch(backendApiUrl('/api/route/plan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'driving',
        origin: backendRoutePoint(points[index]),
        destination: backendRoutePoint(points[index + 1]),
        strategy: 0,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw { status: String(response.status), result: payload, error: payload?.error || `道路接口请求失败 (${response.status})` } satisfies DrivingSearchFailure;
    }
    const path = payload?.paths?.[0];
    const exactRoadPaths = normalizeBackendRoadPaths(path);
    if (!exactRoadPaths.length) {
      throw { status: 'no_data', result: payload, error: 'Route API contains no usable path' } satisfies DrivingSearchFailure;
    }
    roadPaths.push(...exactRoadPaths);
    exactRoadPaths.forEach((roadPath) => appendUniquePath(mergedPath, roadPath));
    distanceMeters += Number(path.distanceKm || 0) * 1000;
    durationSeconds += Number(path.durationMinutes || 0) * 60;
  }

  return { path: mergedPath, paths: roadPaths, distanceMeters, durationSeconds, drivingInstances: [] };
}

function normalizeBackendRoadPaths(path: any): Array<Array<[number, number]>> {
  const candidates = Array.isArray(path?.polylines) && path.polylines.length ? path.polylines : [path?.polyline];
  return coalesceConnectedRoadPaths(candidates
    .filter(Array.isArray)
    .map((line: Array<[number, number]>) => line.map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number]).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)))
    .filter((line: Array<[number, number]>) => line.length > 1));
}

export function coalesceConnectedRoadPaths(paths: Array<Array<[number, number]>>) {
  const result: Array<Array<[number, number]>> = [];
  for (const path of paths) {
    if (path.length < 2) continue;
    const previous = result[result.length - 1];
    const previousEnd = previous?.[previous.length - 1];
    const nextStart = path[0];
    if (previousEnd && previousEnd[0] === nextStart[0] && previousEnd[1] === nextStart[1]) previous.push(...path.slice(1));
    else result.push([...path]);
  }
  return result;
}

function backendRoutePoint(point: RoutePoint) {
  const hasRoadAccess = Number.isFinite(point.roadAccessLng) && Number.isFinite(point.roadAccessLat);
  return {
    lng: hasRoadAccess ? point.roadAccessLng : point.lng,
    lat: hasRoadAccess ? point.roadAccessLat : point.lat,
    coordinateSystem: hasRoadAccess ? 'gcj02' : point.coordinateSystem,
  };
}

function backendApiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  return `${base}${path}`;
}

export function loadAmapJsApi(key: string, securityCode?: string) {
  if (!securityCode || /请填写|placeholder/i.test(securityCode)) return Promise.reject({ status: 'auth-error', error: '缺少高德安全密钥，未发起道路规划' } satisfies DrivingSearchFailure);
  if (!key || /请填写|placeholder/i.test(key)) return Promise.reject({ status: 'auth-error', error: '缺少高德 Web 端 JS API Key，未发起道路规划' } satisfies DrivingSearchFailure);
  window._AMapSecurityConfig = { securityJsCode: securityCode };
  logAmapLoader('security-configured', key);
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapLoaderPromise) return amapLoaderPromise;
  amapLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(AMAP_SCRIPT_SELECTOR);
    let timer = 0;
    const fail = (script: HTMLScriptElement, error: Error) => { window.clearTimeout(timer); logAmapLoader('script.onerror', key); script.remove(); reject({ status: 'network-error', error } satisfies DrivingSearchFailure); };
    const finish = (script: HTMLScriptElement) => { window.clearTimeout(timer); logAmapLoader('script.onload', key); if (window.AMap) resolve(window.AMap); else fail(script, new Error('AMap script loaded without window.AMap')); };
    if (existing) {
      existing.addEventListener('load', () => finish(existing), { once: true });
      existing.addEventListener('error', () => fail(existing, new Error('AMap script network load failed')), { once: true });
      timer = window.setTimeout(() => fail(existing, new Error('AMap script load timed out after 10 seconds')), AMAP_TIMEOUT_MS);
      return;
    }
    const script = document.createElement('script');
    script.dataset.amapJsApi = '2';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Driving`;
    script.onload = () => finish(script);
    script.onerror = () => fail(script, new Error('AMap script network load failed'));
    document.head.appendChild(script);
    timer = window.setTimeout(() => fail(script, new Error('AMap script load timed out after 10 seconds')), AMAP_TIMEOUT_MS);
  }).catch((error) => {
    amapLoaderPromise = undefined;
    throw error;
  });
  return amapLoaderPromise;
}

export function resetAmapJsApiLoader() {
  amapLoaderPromise = undefined;
  if (!window.AMap) document.querySelectorAll(AMAP_SCRIPT_SELECTOR).forEach((script) => script.remove());
}

function logAmapLoader(event: string, key: string) {
  console.info('[AMap JS API]', { event, origin: window.location.origin, hasAMap: Boolean(window.AMap), hasSecurityConfig: Boolean(window._AMapSecurityConfig?.securityJsCode), keyConfigured: Boolean(key), keyLength: key.length });
}

export function splitDrivingPoints(points: Array<[number, number]>, maxWaypoints = AMAP_MAX_WAYPOINTS) {
  if (points.length < 2) return [];
  const segments: Array<Array<[number, number]>> = [];
  const maxSegmentPoints = maxWaypoints + 2;
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    const endIndex = Math.min(startIndex + maxSegmentPoints - 1, points.length - 1);
    segments.push(points.slice(startIndex, endIndex + 1));
    startIndex = endIndex;
  }
  return segments;
}

export function classifyDrivingFailure(failure: DrivingSearchFailure): Exclude<RoadPlanStatus, 'loading' | 'planned'> {
  const text = `${failure.status} ${stringifyFailure(failure.result)} ${stringifyFailure(failure.error)}`.toLowerCase();
  if (/invalid_user_key|invalid_user_domain|userkey|security|auth|permission|forbidden|domain|白名单|key/.test(text)) return 'auth-error';
  if (/network|timeout|fetch|load|script|connection|internet|网络/.test(text)) return 'network-error';
  if (failure.status === 'no_data' || /no[_ -]?data|zero_results|无结果/.test(text)) return 'no-data';
  return 'fallback';
}

export async function planAmapDrivingRoute(AMap: any, points: RoutePoint[]): Promise<DrivingPlanResult> {
  const coordinates = points.map((point) => [point.roadAccessLng ?? point.lng, point.roadAccessLat ?? point.lat] as [number, number]);
  const segments = splitDrivingPoints(coordinates);
  if (!segments.length) throw { status: 'no_data', result: 'Route needs at least two points' } satisfies DrivingSearchFailure;

  const drivingInstances: any[] = [];
  const mergedPath: [number, number][] = [];
  const roadPaths: Array<Array<[number, number]>> = [];
  let distanceMeters = 0;
  let durationSeconds = 0;

  try {
    for (const segment of segments) {
      const driving = new AMap.Driving({
        policy: AMap.DrivingPolicy?.LEAST_TIME ?? 0,
        extensions: 'all',
        ferry: 0,
        showTraffic: false,
      });
      drivingInstances.push(driving);
      const route = await searchDrivingSegment(driving, segment);
      const segmentPaths = coalesceConnectedRoadPaths(extractDrivingPaths(route));
      if (!segmentPaths.length) {
        throw { status: 'no_data', result: route, error: 'Driving route contains no usable path' } satisfies DrivingSearchFailure;
      }
      roadPaths.push(...segmentPaths);
      segmentPaths.forEach((segmentPath) => appendUniquePath(mergedPath, segmentPath));
      distanceMeters += Number(route.distance) || 0;
      durationSeconds += Number(route.time) || 0;
    }
  } catch (error) {
    drivingInstances.forEach((driving) => driving?.clear?.());
    throw error;
  }

  return { path: mergedPath, paths: roadPaths, distanceMeters, durationSeconds, drivingInstances };
}

function searchDrivingSegment(driving: any, coordinates: Array<[number, number]>) {
  return new Promise<any>((resolve, reject) => {
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    const waypoints = coordinates.slice(1, -1);
    const timer = window.setTimeout(() => reject({ status: 'timeout', error: 'AMap.Driving search timed out' } satisfies DrivingSearchFailure), 12_000);
    try {
      driving.search(start, end, { waypoints }, (status: string, result: any) => {
        if (status === 'complete' && result?.routes?.[0]) {
          window.clearTimeout(timer);
          resolve(result.routes[0]);
          return;
        }
        window.clearTimeout(timer);
        reject({ status, result, error: result?.info ?? result?.message } satisfies DrivingSearchFailure);
      });
    } catch (error) {
      window.clearTimeout(timer);
      reject({ status: 'error', error } satisfies DrivingSearchFailure);
    }
  });
}

export function loadAmapPlugin(AMap: any, plugin = 'AMap.Driving', timeoutMs = AMAP_TIMEOUT_MS) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject({ status: 'timeout', error: `${plugin} plugin load timed out` } satisfies DrivingSearchFailure), timeoutMs);
    try { AMap.plugin(plugin, () => { window.clearTimeout(timer); resolve(); }); }
    catch (error) { window.clearTimeout(timer); reject({ status: 'error', error } satisfies DrivingSearchFailure); }
  });
}

export function convertGpsPoint(AMap: any, point: RoutePoint, timeoutMs = AMAP_TIMEOUT_MS): Promise<RoutePoint> {
  if (point.coordinateSystem !== 'wgs84') return Promise.resolve(point);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject({ status: 'timeout', error: 'AMap.convertFrom timed out' } satisfies DrivingSearchFailure), timeoutMs);
    try {
      AMap.convertFrom([point.lng, point.lat], 'gps', (status: string, result: any) => {
        window.clearTimeout(timer);
        const converted = result?.locations?.[0];
        if (status !== 'complete' || !converted) { reject({ status, result, error: 'GPS coordinate conversion failed' } satisfies DrivingSearchFailure); return; }
        const lng = typeof converted.getLng === 'function' ? converted.getLng() : Number(converted.lng ?? converted[0]);
        const lat = typeof converted.getLat === 'function' ? converted.getLat() : Number(converted.lat ?? converted[1]);
        resolve({ ...point, lng, lat, roadAccessLng: lng, roadAccessLat: lat, coordinateSystem: 'gcj02' });
      });
    } catch (error) { window.clearTimeout(timer); reject({ status: 'error', error } satisfies DrivingSearchFailure); }
  });
}

export function extractDrivingPath(route: any) {
  const path: Array<[number, number]> = [];
  extractDrivingPaths(route).forEach((segment) => appendUniquePath(path, segment));
  return path;
}

export function extractDrivingPaths(route: any) {
  const paths: Array<Array<[number, number]>> = [];
  for (const step of route?.steps ?? []) {
    const path: Array<[number, number]> = [];
    for (const point of step?.path ?? []) {
      const lng = typeof point?.getLng === 'function' ? point.getLng() : Number(point?.lng ?? point?.[0]);
      const lat = typeof point?.getLat === 'function' ? point.getLat() : Number(point?.lat ?? point?.[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      appendUniquePath(path, [[lng, lat]]);
    }
    if (path.length > 1) paths.push(path);
  }
  return paths;
}

function appendUniquePath(target: Array<[number, number]>, source: Array<[number, number]>) {
  for (const point of source) {
    const previous = target[target.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) target.push(point);
  }
}

function stringifyFailure(value: unknown) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try { return JSON.stringify(value ?? ''); } catch { return String(value ?? ''); }
}
