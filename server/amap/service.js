import { assertText, fetchJson, httpError } from '../http.js';

const AMAP_ROOT = 'https://restapi.amap.com';
export const CITY_CODES = { 武汉: '027', 宜昌: '0717', 恩施: '0718', 荆州: '0716', 襄阳: '0710', 黄石: '0714' };
export const TRANSIT_STRATEGIES = { recommended: 0, economy: 1, 'fewest-transfers': 2, 'least-walking': 3, 'subway-first': 7, fastest: 8 };
const resolvedCityCodes = new Map(Object.entries(CITY_CODES));

export function amapConfigured(env) { return Boolean(env.AMAP_WEB_SERVICE_KEY); }

export async function reverseGeocode(env, query) {
  const key = requireKey(env);
  const raw = coordinateObject(query.get('location'));
  const coordinateSystem = query.get('coordsys') === 'gps' ? 'wgs84' : 'gcj02';
  const location = await routeCoordinate(key, { ...raw, coordinateSystem }, 'location');
  const params = new URLSearchParams({ key, location, extensions: 'base', radius: '1000', roadlevel: '0' });
  const data = await amapJson(`/v3/geocode/regeo?${params}`, '高德逆地理编码');
  const regeocode = data.regeocode || {};
  const component = regeocode.addressComponent || {};
  const scalar = (value) => Array.isArray(value) ? String(value[0] || '') : String(value || '');
  const city = scalar(component.city) || scalar(component.province);
  const street = scalar(component.streetNumber?.street);
  const number = scalar(component.streetNumber?.number);
  return {
    source: 'amap', freshness: 'live-query', generatedAt: new Date().toISOString(), location,
    formattedAddress: scalar(regeocode.formatted_address), province: scalar(component.province), city,
    district: scalar(component.district), township: scalar(component.township), street, number,
    adcode: scalar(component.adcode),
  };
}

export async function forwardGeocode(env, query) {
  const key = requireKey(env);
  const address = assertText(query.get('address') || query.get('q'), '出发地', { max: 200 });
  const params = new URLSearchParams({ key, address });
  const region = String(query.get('region') || '').trim();
  if (region) params.set('city', region);
  const data = await amapJson(`/v3/geocode/geo?${params}`, '高德正向地理编码');
  const match = data.geocodes?.[0];
  const [lng, lat] = String(match?.location || '').split(',').map(Number);
  if (!match || !Number.isFinite(lng) || !Number.isFinite(lat)) throw httpError(404, '未找到该出发地，请补充城市、区县或道路名称');
  return {
    source: 'amap', freshness: 'live-query', generatedAt: new Date().toISOString(),
    query: address, formattedAddress: match.formatted_address || address,
    province: match.province || '', city: match.city || '', district: match.district || '', adcode: match.adcode || '',
    location: { lng, lat }, coordinateSystem: 'gcj02',
  };
}

export async function searchPois(env, query, category = 'poi') {
  const key = requireKey(env);
  const keywords = assertText(query.get('keywords') || query.get('q') || defaultKeyword(category), '搜索关键词', { max: 120 });
  const region = String(query.get('city') || query.get('region') || '').trim();
  const pageSize = clamp(query.get('pageSize'), 1, 25, 15);
  const page = clamp(query.get('page'), 1, 100, 1);
  const params = new URLSearchParams({ key, keywords, page_size: String(pageSize), page_num: String(page), show_fields: 'business,photos,navi' });
  if (region) params.set('region', region);
  const types = query.get('allTypes') === '1' ? '' : (query.get('types') || categoryTypes(category));
  if (types) params.set('types', types);
  const location = validCoordinate(query.get('location'));
  if (location) params.set('location', location);
  const data = await amapJson(`/v5/place/text?${params}`, '高德地点搜索');
  return {
    source: 'amap', category, generatedAt: new Date().toISOString(), total: Number(data.count || data.total || data.pois?.length || 0),
    items: (data.pois || []).map(normalizePoi),
    dataNotice: '地点事实来自本次高德查询；评分、消费、营业时间可能缺失或变化，请以下单页/商家公告为准。',
  };
}

export async function searchPoisAround(env, query, category = 'poi') {
  const key = requireKey(env);
  const location = requireCoordinateString(query.get('location'), 'location');
  const keywords = String(query.get('keywords') || '').trim();
  if (keywords.length > 80) throw httpError(400, '周边搜索关键词不能超过80个字符');
  const radius = clamp(query.get('radius'), 0, 50_000, 1500);
  const pageSize = clamp(query.get('pageSize'), 1, 25, 10);
  const page = clamp(query.get('page'), 1, 100, 1);
  const params = new URLSearchParams({ key, location, radius: String(radius), page_size: String(pageSize), page_num: String(page), show_fields: 'business,photos,navi', sortrule: 'distance' });
  if (keywords) params.set('keywords', keywords);
  const types = query.get('types') || categoryTypes(category);
  if (types) params.set('types', types);
  const data = await amapJson(`/v5/place/around?${params}`, '高德周边地点搜索');
  return {
    source: 'amap', category, generatedAt: new Date().toISOString(), total: Number(data.count || data.total || data.pois?.length || 0),
    items: (data.pois || []).map(normalizePoi),
    dataNotice: `地点事实来自本次高德${radius}米周边查询；评分、消费、营业时间可能缺失或变化，请以下单页/商家公告为准。`,
  };
}

export async function planRoute(env, input) {
  const key = requireKey(env);
  const mode = ['driving', 'walking', 'bicycling', 'transit'].includes(input.mode) ? input.mode : 'driving';
  if (mode === 'transit') {
    const request = {
      city: input.city, cityCode: await resolveTransitCityCode(key, input.city), departureDate: input.departureDate || todayInChina(), departureTime: input.departureTime || currentTimeInChina(), strategy: input.strategy || 'recommended',
    };
    return { mode, generatedAt: new Date().toISOString(), ...(await transitSegment(key, request, { ...input.origin, id: 'origin', name: input.origin.name || '起点', arrivalTime: request.departureTime, durationMinutes: 0 }, { ...input.destination, id: 'destination', name: input.destination.name || '终点' }, 0)) };
  }
  const origin = await routeCoordinate(key, input.origin, 'origin');
  const destination = await routeCoordinate(key, input.destination, 'destination');
  const params = new URLSearchParams({ key, origin, destination, show_fields: 'cost,polyline,navi' });
  if (mode === 'driving') params.set('strategy', String(input.strategy ?? 0));
  const data = await amapJson(`/v5/direction/${mode}?${params}`, `高德${mode}路线规划`);
  const taxiCost = money(data.route?.taxi_cost);
  const paths = (data.route?.paths || data.paths || []).map((path) => ({ ...normalizePath(path), ...(taxiCost === undefined ? {} : { taxiCost }) }));
  if (!paths.length) throw httpError(502, '高德没有返回可用路线');
  return { source: 'amap', freshness: 'live-query', mode, generatedAt: new Date().toISOString(), origin, destination, paths };
}

export async function trafficStatus(env, query) {
  const key = requireKey(env);
  let path;
  const params = new URLSearchParams({ key, extensions: 'all' });
  if (query.get('rectangle')) {
    const rectangle = String(query.get('rectangle')).trim();
    if (!/^[-\d.]+,[-\d.]+;[-\d.]+,[-\d.]+$/.test(rectangle)) throw httpError(400, 'rectangle 格式应为 左下经度,纬度;右上经度,纬度');
    params.set('rectangle', rectangle); path = '/v3/traffic/status/rectangle';
  } else if (query.get('center')) {
    params.set('location', requireCoordinateString(query.get('center'), 'center'));
    params.set('radius', String(clamp(query.get('radius'), 1, 5000, 1000))); path = '/v3/traffic/status/circle';
  } else if (query.get('road')) {
    params.set('name', assertText(query.get('road'), '道路名称', { max: 100 }));
    params.set('adcode', assertText(query.get('adcode'), 'adcode', { max: 12 })); path = '/v3/traffic/status/road';
  } else throw httpError(400, '请提供 rectangle、center 或 road+adcode 查询范围');
  const data = await amapJson(`${path}?${params}`, '高德路况查询');
  const evaluation = data.trafficinfo?.evaluation || {};
  return {
    source: 'amap', freshness: 'live-query', generatedAt: new Date().toISOString(),
    description: data.trafficinfo?.description || '', level: evaluation.status || evaluation.description || '未知',
    metrics: { expedited: numberOrNull(evaluation.expedited), congested: numberOrNull(evaluation.congested), blocked: numberOrNull(evaluation.blocked), unknown: numberOrNull(evaluation.unknown) },
    roads: (data.trafficinfo?.roads || []).slice(0, 100).map((road) => ({ name: road.name, status: road.status, direction: road.direction, speedKmh: numberOrNull(road.speed), polyline: parsePolyline(road.polyline) })),
  };
}

export async function transitPlan(env, input) {
  const key = requireKey(env);
  validateTransitRequest(input);
  const request = { ...input, cityCode: await resolveTransitCityCode(key, input.city) };
  const segments = [];
  for (let index = 0; index < input.points.length - 1; index += 1) {
    const from = input.points[index];
    const to = input.points[index + 1];
    if ((from.day || 1) !== (to.day || 1)) continue;
    segments.push(await transitSegment(key, request, from, to, index));
  }
  const totalMinutes = segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const totalDistanceKm = round1(segments.reduce((sum, segment) => sum + segment.distanceKm, 0));
  const fares = segments.map((segment) => segment.fare).filter((value) => value !== undefined);
  return {
    source: 'transport-api', sourceLabel: '高德动态公交规划', generatedAt: new Date().toISOString(), isRealtime: false, freshness: 'live-query',
    totalMinutes, totalDistanceKm, ...(fares.length ? { totalFare: round1(fares.reduce((sum, value) => sum + value, 0)) } : {}),
    summary: `按当前出发日期与时间查询到 ${segments.length} 段公共交通，预计 ${totalMinutes} 分钟。`, segments,
    notices: ['线路与预计时间来自本次高德动态查询；不代表车辆 GPS 实时位置或精确到站倒计时。', '出发前请再次核验临时停运、票价、站口开放状态和运营方公告。'],
  };
}

export async function realtimeTransitQuery(env, query) {
  const departureTime = String(query.get('time') || currentTimeInChina()).replace('-', ':');
  const input = {
    city: assertText(query.get('city'), '城市', { max: 50 }), departureDate: String(query.get('date') || todayInChina()), departureTime,
    strategy: query.get('strategy') || 'recommended', points: [
      { id: 'origin', name: query.get('originName') || '起点', ...coordinateObject(query.get('origin')), arrivalTime: departureTime, durationMinutes: 0 },
      { id: 'destination', name: query.get('destinationName') || '终点', ...coordinateObject(query.get('destination')), arrivalTime: departureTime, durationMinutes: 0 },
    ],
  };
  const plan = await transitPlan(env, input);
  return { ...plan, capability: 'dynamic-route-estimate', vehicleRealtimeAvailable: false, vehicleRealtimeMessage: '当前数据源不含车辆 GPS 或列车位置；接入当地运营方授权接口后才能提供车辆级实时数据。' };
}

async function transitSegment(key, request, from, to, index) {
  const cityCode = request.cityCode || CITY_CODES[request.city] || request.city;
  const params = new URLSearchParams({ key, origin: requiredCoordinate(from, 'from'), destination: requiredCoordinate(to, 'to'), city1: cityCode, city2: cityCode, strategy: String(TRANSIT_STRATEGIES[request.strategy] ?? 0), AlternativeRoute: '1', show_fields: 'cost,polyline,navi', date: request.departureDate, time: request.departureTime.replace(':', '-') });
  const data = await amapJson(`/v5/direction/transit/integrated?${params}`, '高德公交服务');
  const transit = data.route?.transits?.[0];
  if (!transit) return drivingFallback(key, from, to, index);
  const legs = parseTransitLegs(transit, `${from.id}-${to.id}`);
  if (!legs.length) return drivingFallback(key, from, to, index);
  const durationMinutes = secondsToMinutes(transit.cost?.duration ?? transit.duration ?? legs.reduce((sum, leg) => sum + leg.durationMinutes, 0) * 60);
  const distanceKm = round1(Number(transit.distance ?? legs.reduce((sum, leg) => sum + leg.distanceKm, 0) * 1000) / 1000);
  const fare = money(transit.cost?.transit_fee ?? transit.cost?.fee ?? findTransitFare(transit));
  const mode = modeForLegs(legs);
  const departureTime = shiftClock(from.arrivalTime || request.departureTime, from.durationMinutes || 0);
  return { id: `${from.id}-${to.id}`, from: from.name, to: to.name, departureTime, arrivalTime: shiftClock(departureTime, durationMinutes), durationMinutes, distanceKm, mode, costEstimate: fare === undefined ? '票价以运营方为准' : `¥${fare}`, ...(fare === undefined ? {} : { fare }), origin: { lng: Number(from.lng), lat: Number(from.lat) }, destination: { lng: Number(to.lng), lat: Number(to.lat) }, instruction: legs.filter((leg) => leg.lineName).map((leg) => leg.lineName).join(' → ') || '按动态查询结果出行，出发前再次刷新。', liveStatus: '动态路线查询', legs };
}

export function parseTransitLegs(transit, segmentId) {
  const legs = [];
  for (const [segmentIndex, segment] of (transit.segments ?? []).entries()) {
    const walkingSteps = segment.walking?.steps ?? [];
    if (walkingSteps.length) legs.push({ id: `${segmentId}-${segmentIndex}-walk`, mode: 'walk', viaStops: [], durationMinutes: secondsToMinutes(segment.walking?.cost?.duration ?? segment.walking?.duration ?? walkingSteps.reduce((sum, step) => sum + Number(step.cost?.duration ?? step.duration ?? 0), 0)), distanceKm: round1(Number(segment.walking?.distance ?? walkingSteps.reduce((sum, step) => sum + Number(step.step_distance ?? step.distance ?? 0), 0)) / 1000), instructions: walkingSteps.map((step) => step.instruction).filter(Boolean), roadNames: [...new Set(walkingSteps.map((step) => step.road_name || step.road).filter(Boolean))], polyline: walkingSteps.flatMap((step) => parsePolyline(step.polyline)) });
    for (const [lineIndex, line] of (segment.bus?.buslines ?? segment.bus?.steps ?? []).entries()) {
      const lineName = cleanLineName(line.name ?? line.bus_name ?? '公共交通');
      const subway = /地铁|轨道交通|轻轨/.test(`${line.type ?? ''}${lineName}`);
      legs.push({ id: `${segmentId}-${segmentIndex}-line-${lineIndex}`, mode: subway ? 'subway' : 'bus', lineName, lineType: line.type, departureStop: line.departure_stop?.name, arrivalStop: line.arrival_stop?.name, entrance: segment.entrance?.name, exit: segment.exit?.name, viaStops: (line.via_stops ?? []).map((stop) => stop.name).filter(Boolean), durationMinutes: secondsToMinutes(line.cost?.duration ?? line.duration), distanceKm: round1(Number(line.distance ?? 0) / 1000), fare: money(segment.cost?.transit_fee), serviceStartTime: formatServiceTime(line.start_time ?? line.station_start_time), serviceEndTime: formatServiceTime(line.end_time ?? line.station_end_time), polyline: parsePolyline(line.polyline) });
    }
    if (segment.railway) { const rail = segment.railway; legs.push({ id: `${segmentId}-${segmentIndex}-rail`, mode: 'railway', lineName: rail.name ?? rail.trip, departureStop: rail.departure_stop?.name, arrivalStop: rail.arrival_stop?.name, viaStops: (rail.via_stops ?? []).map((stop) => stop.name).filter(Boolean), durationMinutes: secondsToMinutes(rail.time ?? rail.duration), distanceKm: round1(Number(rail.distance ?? 0) / 1000), polyline: parsePolyline(rail.polyline) }); }
  }
  return legs.filter((leg) => leg.durationMinutes > 0 || leg.distanceKm > 0 || leg.polyline.length > 1);
}

async function drivingFallback(key, from, to, index) {
  const params = new URLSearchParams({ key, origin: requiredCoordinate(from, 'from'), destination: requiredCoordinate(to, 'to'), strategy: '0', show_fields: 'cost,polyline,navi' });
  const data = await amapJson(`/v5/direction/driving?${params}`, '高德驾车服务');
  const path = data.route?.paths?.[0];
  if (!path) throw httpError(502, `第 ${index + 1} 段没有可用公交或道路方案`);
  const normalized = normalizePath(path); const departureTime = shiftClock(from.arrivalTime, from.durationMinutes);
  const taxiCost = money(data.route?.taxi_cost);
  const instructions = normalized.steps.map((step) => step.instruction).filter(Boolean);
  const roadNames = [...new Set(normalized.steps.map((step) => step.road).filter(Boolean))];
  return { id: `${from.id}-${to.id}`, from: from.name, to: to.name, departureTime, arrivalTime: shiftClock(departureTime, normalized.durationMinutes), durationMinutes: normalized.durationMinutes, distanceKm: normalized.distanceKm, mode: '网约车', costEstimate: taxiCost === undefined ? '费用待查询' : `打车约 ¥${taxiCost}`, ...(taxiCost === undefined ? {} : { fare: taxiCost }), origin: { lng: Number(from.lng), lat: Number(from.lat) }, destination: { lng: Number(to.lng), lat: Number(to.lat) }, instruction: instructions.slice(0, 3).join('；') || '该段未查询到合适公共交通，已降级为高德真实驾车道路方案。', liveStatus: '高德动态道路规划', legs: [{ id: `${from.id}-${to.id}-drive`, mode: 'taxi', lineName: '驾车接驳', viaStops: [], durationMinutes: normalized.durationMinutes, distanceKm: normalized.distanceKm, ...(taxiCost === undefined ? {} : { fare: taxiCost }), instructions, roadNames, polyline: normalized.polyline }] };
}

async function amapJson(path, service) {
  const data = await fetchJson(`${AMAP_ROOT}${path}`, {}, { service });
  if (String(data.status) !== '1') throw httpError(502, `${service}查询失败`, { upstreamCode: data.infocode, upstreamMessage: data.info });
  return data;
}
async function resolveTransitCityCode(key, city) {
  const name = assertText(city, '城市', { max: 50 });
  if (/^\d{3,12}$/.test(name)) return name;
  const cached = resolvedCityCodes.get(name);
  if (cached) return cached;
  const params = new URLSearchParams({ key, keywords: name, subdistrict: '0', extensions: 'base' });
  const data = await amapJson(`/v3/config/district?${params}`, '高德城市代码');
  const district = (data.districts || []).find((item) => String(item.name || '').replace(/[市地区自治州盟]$/u, '') === name.replace(/[市地区自治州盟]$/u, '')) || data.districts?.[0];
  const cityCode = Array.isArray(district?.citycode) ? district.citycode[0] : district?.citycode;
  const resolved = String(cityCode || district?.adcode || '').trim();
  if (!/^\d{3,12}$/.test(resolved)) throw httpError(502, `无法解析“${name}”的公交城市代码`);
  resolvedCityCodes.set(name, resolved);
  return resolved;
}
function requireKey(env) { if (!env.AMAP_WEB_SERVICE_KEY) throw httpError(503, '尚未配置高德 Web 服务 Key'); return env.AMAP_WEB_SERVICE_KEY; }
function validateTransitRequest(input) { if (!input || !Array.isArray(input.points) || input.points.length < 2 || input.points.length > 12) throw httpError(400, 'points 必须包含 2-12 个站点'); if (!input.city || !/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate || '') || !/^\d{2}:\d{2}$/.test(input.departureTime || '')) throw httpError(400, 'city、departureDate 和 departureTime 必填且格式不正确'); input.points.forEach((point) => { requiredCoordinate(point, 'point'); assertText(point.name, '站点名称', { max: 120 }); }); }
function normalizePoi(poi) { const business = poi.business || poi.biz_ext || {}; const [lng, lat] = String(poi.location || '').split(',').map(Number); return { id: String(poi.id || ''), name: String(poi.name || ''), category: poi.type, typeCode: poi.typecode, address: Array.isArray(poi.address) ? poi.address.join('') : String(poi.address || ''), city: poi.cityname, district: poi.adname, location: Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null, distanceMeters: numberOrNull(poi.distance), rating: numberOrNull(business.rating), averageCost: numberOrNull(business.cost || business.avg_cost), openingHours: business.opentime_today || business.open_time || null, telephone: poi.tel || business.tel || null, photos: (poi.photos || []).slice(0, 5).map((photo) => photo.url).filter(Boolean) }; }
function normalizePath(path) {
  const durationMinutes = secondsToMinutes(path.cost?.duration ?? path.duration);
  const distanceKm = round1(Number(path.distance ?? 0) / 1000);
  const polylines = (path.steps || []).map((step) => parsePolyline(step.polyline)).filter((line) => line.length > 1);
  return {
    durationMinutes,
    distanceKm,
    trafficLights: numberOrNull(path.cost?.traffic_lights),
    tolls: money(path.cost?.tolls ?? path.tolls),
    coordinateSystem: 'gcj02',
    geometrySource: 'amap-directions-v5',
    polylines,
    polyline: polylines.flat(),
    steps: (path.steps || []).slice(0, 100).map((step) => ({ instruction: step.instruction, road: step.road_name || step.road, distanceMeters: numberOrNull(step.step_distance || step.distance), durationMinutes: secondsToMinutes(step.cost?.duration ?? step.duration) })),
  };
}
function categoryTypes(category) { if (category === 'restaurant') return '050000'; if (category === 'shop') return '060000'; if (category === 'hotel') return '100000'; if (category === 'attraction') return '110000'; return ''; }
function defaultKeyword(category) { return category === 'restaurant' ? '餐厅' : category === 'shop' ? '商店' : category === 'hotel' ? '酒店' : category === 'attraction' ? '景点' : '旅游'; }
function coordinateObject(value) { const [lng, lat] = requireCoordinateString(value, '坐标').split(',').map(Number); return { lng, lat }; }
async function routeCoordinate(key, point, name) { const value = requiredCoordinate(point, name); if (point?.coordinateSystem !== 'wgs84') return value; const params = new URLSearchParams({ key, locations: value, coordsys: 'gps' }); const data = await amapJson(`/v3/assistant/coordinate/convert?${params}`, '高德坐标转换'); return requireCoordinateString(data.locations, name); }
function requiredCoordinate(point, name) { if (!point || !Number.isFinite(Number(point.lng)) || !Number.isFinite(Number(point.lat))) throw httpError(400, `${name} 需要有效 lng 和 lat`); return `${Number(point.lng).toFixed(6)},${Number(point.lat).toFixed(6)}`; }
function requireCoordinateString(value, name) { const text = String(value || ''); const [lng, lat] = text.split(',').map(Number); if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw httpError(400, `${name} 坐标格式应为 经度,纬度`); return `${lng.toFixed(6)},${lat.toFixed(6)}`; }
function validCoordinate(value) { try { return value ? requireCoordinateString(value, 'location') : ''; } catch { throw httpError(400, 'location 坐标格式应为 经度,纬度'); } }
export function parsePolyline(value) { if (Array.isArray(value)) return value.flatMap(parsePolyline); if (typeof value !== 'string') return []; return value.split(';').map((pair) => pair.split(',').map(Number)).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)); }
function secondsToMinutes(value) { const seconds = Number(value ?? 0); return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0; }
function money(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? round1(number) : undefined; }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function findTransitFare(transit) { for (const segment of transit.segments ?? []) { const value = money(segment.cost?.transit_fee); if (value !== undefined) return value; } return undefined; }
function modeForLegs(legs) { if (legs.some((leg) => leg.mode === 'subway')) return '地铁'; if (legs.some((leg) => leg.mode === 'bus')) return '公交'; if (legs.some((leg) => leg.mode === 'railway')) return '铁路'; if (legs.some((leg) => leg.mode === 'shuttle')) return '景区专线'; if (legs.some((leg) => leg.mode === 'taxi')) return '网约车'; return '步行'; }
function cleanLineName(value) { return String(value).replace(/\([^)]*--[^)]*\)/g, '').trim(); }
function formatServiceTime(value) { const text = String(value ?? '').replace(':', ''); return /^\d{4}$/.test(text) ? `${text.slice(0, 2)}:${text.slice(2)}` : undefined; }
function shiftClock(value, delta) { const [hour, minute] = String(value || '08:30').split(':').map(Number); const total = (((hour || 0) * 60 + (minute || 0) + Number(delta || 0)) % 1440 + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function clamp(value, min, max, fallback) { const number = Math.trunc(Number(value)); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function round1(value) { return Math.round(Number(value || 0) * 10) / 10; }
function todayInChina() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()); }
function currentTimeInChina() { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
