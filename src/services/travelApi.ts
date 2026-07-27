import { buildFoodRecommendations, calculateTimeline, type FoodRecommendation, type PlannedRoutePoint, type TripPlan, type TripRequest } from '../domain/trip';
import type { RoutePoint } from '../types/route';

export type AiTravelRequest = {
  city: string | null;
  startDate: string | null;
  days: number | null;
  people: number | null;
  budgetPerPerson: number | null;
  interests: string[];
  dietaryNeeds: string[];
  mobility: string | null;
  transportPreference: string | null;
  hotelPreference: string | null;
  departureDeadline: string | null;
  requestedPlaces: string[];
  avoidPlaces: string[];
  travelStyle: string | null;
};

export type AiItinerarySchedule = {
  departureTime: string;
  items: Array<{ id: string; day: number; arrivalTime: string; reason: string }>;
  safetyNotes: string[];
};

export async function parseTravelRequestWithAi(text: string): Promise<AiTravelRequest> {
  const response = await fetchTravelApi(apiUrl('/api/ai/parse-request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const payload = await readPayload(response, 'AI 需求识别失败');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('AI 需求识别返回格式不正确');
  return payload.data as AiTravelRequest;
}

export async function enrichTripPlanWithBackend(plan: TripPlan, request: TripRequest): Promise<{ analysis?: string; foods?: FoodRecommendation[]; routePoints?: RoutePoint[]; schedule?: AiItinerarySchedule }> {
  const [places, foods] = await Promise.allSettled([recommendAttractions(request), recommendRestaurantsForRoute(request, plan.route.points)]);
  const routePoints = places.status === 'fulfilled' ? places.value : [];
  const analysisRoute = routePoints.length ? [{ ...plan.route.startPoint, day: 1 }, ...routePoints] : plan.route.points;
  const timeline = calculateTimeline(analysisRoute, plan.settings.departureTime);
  const [analysis, schedule] = await Promise.all([
    analyzeTrip({ ...plan, route: { ...plan.route, points: timeline } }, request).catch(() => ''),
    requestAiSchedule(timeline, request, plan.settings.departureTime).catch(() => undefined),
  ]);
  const result: { analysis?: string; foods?: FoodRecommendation[]; routePoints?: RoutePoint[]; schedule?: AiItinerarySchedule } = {};
  if (analysis) result.analysis = analysis;
  if (schedule) result.schedule = schedule;
  if (foods.status === 'fulfilled' && foods.value.length) result.foods = foods.value;
  if (routePoints.length) result.routePoints = routePoints;
  if (!result.analysis && !result.foods && !result.routePoints) throw new Error('AI 与高德个性化服务暂时不可用');
  return result;
}

async function requestAiSchedule(points: PlannedRoutePoint[], request: TripRequest, departureTime: string): Promise<AiItinerarySchedule> {
  const response = await fetchTravelApi(apiUrl('/api/ai/schedule'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: request.destinationCity, days: request.days, travelerType: request.travelerType,
      specialNeeds: request.specialNeeds, departureTime,
      points: points.map((point) => ({ id: point.id, name: point.name, day: point.day ?? 1, stayMinutes: point.durationMinutes, travelMinutesToNext: point.travelMinutesToNext, openingHours: point.openingHours ?? null })),
    }),
  });
  const payload = await readPayload(response, 'AI 安全排程失败');
  if (!payload.data || !Array.isArray(payload.data.items)) throw new Error('AI 安全排程返回格式不正确');
  return payload.data as AiItinerarySchedule;
}

async function analyzeTrip(plan: TripPlan, request: TripRequest) {
  const response = await fetchTravelApi(apiUrl('/api/ai/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '请只依据 context，用一段简洁中文分析这个旅行方案如何匹配用户需求；不得补充 context 中没有的价格、营业时间、线路或地点。',
      context: {
        request: {
          city: request.destinationCity, days: request.days, budget: request.budget, interests: request.interests,
          travelerType: request.travelerType, dietaryRestrictions: request.dietaryRestrictions, specialNeeds: request.specialNeeds,
          prompt: request.freeText, requestedPlaces: request.requestedPlaces, avoidPlaces: request.avoidPlaces,
        },
        route: plan.route.points.map((point) => ({ name: point.name, arrivalTime: point.time, stayMinutes: point.stayMinutes, estimatedCost: point.estimatedCost ?? null })),
        transportSuggestion: plan.route.transportSuggestion,
      },
    }),
  });
  const payload = await readPayload(response, 'AI 方案分析失败');
  return typeof payload.data?.analysis === 'string' ? payload.data.analysis.trim() : '';
}

async function recommendAttractions(request: TripRequest): Promise<RoutePoint[]> {
  const interestTerms: Record<string, string> = { 自然风光: '景区', 历史文化: '博物馆', 拍照: '城市地标', Citywalk: '历史街区', 美食: '特色街区' };
  const cityAnchors: Record<string, string[]> = {
    宜昌: ['三峡大坝旅游区', '清江画廊旅游度假区', '滨江公园'],
    武汉: ['黄鹤楼', '湖北省博物馆', '东湖生态旅游风景区'],
    恩施: ['恩施大峡谷', '恩施土司城', '恩施女儿城'],
    荆州: ['荆州博物馆', '荆州古城', '荆州方特东方神画'],
    襄阳: ['古隆中', '襄阳古城', '中国唐城'],
    黄石: ['黄石国家矿山公园', '磁湖风景区', '东方山风景区'],
  };
  const required = request.requestedPlaces.slice(0, 6);
  const anchorTerms = cityAnchors[request.destinationCity] ?? [];
  const queryTerms = [...new Set([
    ...required,
    ...anchorTerms,
    ...request.interests.map((item) => interestTerms[item]).filter(Boolean),
    '热门景点',
  ])].slice(0, 9);
  const searches = await Promise.allSettled(queryTerms.map(async (query) => {
    const params = new URLSearchParams({ city: request.destinationCity, keywords: query, pageSize: '10' });
    if (required.includes(query)) params.set('allTypes', '1');
    const response = await fetchTravelApi(apiUrl(`/api/attractions/search?${params}`));
    const payload = await readPayload(response, `“${query}”地点检索失败`);
    return { query, items: Array.isArray(payload.items) ? payload.items as Array<Record<string, any>> : [] };
  }));
  const rows: Array<Record<string, any>> = searches.flatMap((result) => result.status === 'fulfilled' ? result.value.items.map((item) => ({ ...item, sourceQuery: result.value.query })) : []);
  const candidates = [...new Map(rows.filter(validPoi).map((item) => [String(item.id), item])).values()]
    .filter((item) => !request.avoidPlaces.some((name) => String(item.name).includes(name)))
    .filter((item) => isRequiredCandidate(item, required) || isWithinDestinationArea(item, request.destinationCity))
    .filter((item) => isRequiredCandidate(item, required) || !isLowValuePoi(item))
    .sort((left, right) => Number(hasPoiPhoto(right)) - Number(hasPoiPhoto(left)))
    .slice(0, 50);
  if (!candidates.length) return [];

  const requiredRows = required.map((query) => bestRequiredMatch(query, candidates)).filter(Boolean) as Array<Record<string, any>>;
  const anchorRows = anchorTerms.map((query) => bestQueryMatch(query, candidates)).filter(Boolean) as Array<Record<string, any>>;
  const byId = new Map(candidates.map((item) => [String(item.id), item]));
  let ranked: Array<Record<string, any>> = [];
  try {
    const rankingResponse = await fetchTravelApi(apiUrl('/api/ai/recommend'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPreferences: { prompt: request.freeText, city: request.destinationCity, days: request.days, interests: request.interests, travelerType: request.travelerType, specialNeeds: request.specialNeeds, requiredPlaces: required, avoidPlaces: request.avoidPlaces },
        candidates,
      }),
    });
    const rankingPayload = await readPayload(rankingResponse, 'AI 景点排序失败');
    ranked = (Array.isArray(rankingPayload.data?.ranked) ? rankingPayload.data.ranked : [])
      .map((rank: Record<string, any>) => ({ ...byId.get(String(rank.id)), recommendationReason: rank.reason, fitScore: rank.fitScore }))
      .filter(validPoi);
  } catch { ranked = []; }
  const targetCount = Math.min(10, Math.max(4, request.days * 3));
  const ordered = [...new Map([...requiredRows, ...anchorRows, ...ranked, ...candidates].map((item) => [String(item.id), item])).values()];
  const selected = pickGeographicallyDiverse(ordered, targetCount, required);
  return selected.map((item, index) => toRoutePoint(item, request, index));
}

function validPoi(item: Record<string, any> | undefined | null) {
  return Boolean(item?.id && item?.name && Number.isFinite(Number(item?.location?.lng)) && Number.isFinite(Number(item?.location?.lat)));
}

function bestRequiredMatch(query: string, candidates: Array<Record<string, any>>) {
  const needle = normalizePlaceName(query);
  const best = candidates
    .map((item) => { const name = normalizePlaceName(String(item.name)); return { item, score: name === needle ? 4 : name.includes(needle) ? 3 : needle.includes(name) ? 2 : item.sourceQuery === query ? 1 : 0 }; })
    .sort((a, b) => b.score - a.score)[0];
  return best?.score > 0 ? best.item : undefined;
}

function isRequiredCandidate(item: Record<string, any>, required: string[]) {
  const name = normalizePlaceName(String(item.name));
  return required.some((query) => name.includes(normalizePlaceName(query)) || normalizePlaceName(query).includes(name));
}

function hasPoiPhoto(item: Record<string, any>) {
  return Array.isArray(item.photos) && item.photos.some((value) => typeof value === 'string' && value.trim());
}

function isLowValuePoi(item: Record<string, any>) {
  return /(?:文化|党建|法治|廉政|清廉|禁毒|休闲|健身|远教)广场|社区(?:文化)?广场|村(?:级)?文化广场|村委会|管理办公室|停车场|游客集散点/u.test(String(item.name));
}

function bestQueryMatch(query: string, candidates: Array<Record<string, any>>) {
  const direct = bestRequiredMatch(query, candidates.filter((item) => item.sourceQuery === query));
  return direct ?? bestRequiredMatch(query, candidates);
}

function pickGeographicallyDiverse(candidates: Array<Record<string, any>>, targetCount: number, required: string[]) {
  const selected: Array<Record<string, any>> = [];
  for (const candidate of candidates) {
    const requiredCandidate = isRequiredCandidate(candidate, required);
    const separated = selected.every((chosen) => haversineKm(
      Number(chosen.location.lat), Number(chosen.location.lng),
      Number(candidate.location.lat), Number(candidate.location.lng),
    ) >= 0.75);
    if (requiredCandidate || separated) selected.push(candidate);
    if (selected.length >= targetCount) return selected;
  }
  return selected;
}

const destinationCenters: Record<string, { lng: number; lat: number; maxDistanceKm: number }> = {
  武汉: { lng: 114.3055, lat: 30.5928, maxDistanceKm: 65 },
  宜昌: { lng: 111.2865, lat: 30.6919, maxDistanceKm: 70 },
  恩施: { lng: 109.4882, lat: 30.2722, maxDistanceKm: 75 },
  荆州: { lng: 112.2397, lat: 30.3352, maxDistanceKm: 65 },
  襄阳: { lng: 112.1224, lat: 32.009, maxDistanceKm: 70 },
  黄石: { lng: 115.0389, lat: 30.1995, maxDistanceKm: 60 },
};

function isWithinDestinationArea(item: Record<string, any>, city: string) {
  const center = destinationCenters[city];
  if (!center) return true;
  const lat = Number(item.location?.lat);
  const lng = Number(item.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return haversineKm(center.lat, center.lng, lat, lng) <= center.maxDistanceKm;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function normalizePlaceName(value: string) {
  return value
    .replace(/[\s·（）()]/g, '')
    .replace(/^(武汉|宜昌|恩施|荆州|襄阳|黄石)(市)?/, '')
    .replace(/(风景名胜区|风景区|旅游区|景区)$/g, '');
}

function toRoutePoint(item: Record<string, any>, request: TripRequest, index: number): RoutePoint {
  const requested = request.requestedPlaces.some((name) => normalizePlaceName(String(item.name)).includes(normalizePlaceName(name)) || normalizePlaceName(name).includes(normalizePlaceName(String(item.name))));
  const imageUrl = Array.isArray(item.photos) ? String(item.photos.find((value: unknown) => typeof value === 'string' && value.trim()) || '').replace(/^http:\/\//i, 'https://') : '';
  const imageCredit = imageUrl ? {
    author: '高德地图地点相册',
    license: '来源与使用规则见地点页',
    sourceUrl: `https://uri.amap.com/marker?position=${Number(item.location.lng)},${Number(item.location.lat)}&name=${encodeURIComponent(String(item.name))}`,
  } : undefined;
  return {
    id: `amap-${String(item.id)}`, name: String(item.name), type: 'scenic', city: request.destinationCity,
    lng: Number(item.location.lng), lat: Number(item.location.lat), coordinateSystem: 'gcj02', time: '', stayMinutes: requested ? 90 : 60,
    reason: requested ? `这是你在首页明确提出的必经地点，已通过高德真实地点检索加入路线。${item.recommendationReason ? ` ${item.recommendationReason}` : ''}` : String(item.recommendationReason || `${item.district || request.destinationCity}的真实候选地点，符合本次个性化需求。`),
    photoTip: `拍下${item.name}的代表性画面。`,
    recordTip: '记下这一站最喜欢的细节。',
    day: Math.min(request.days, Math.floor(index / Math.max(1, Math.ceil(Math.min(10, Math.max(4, request.days * 3)) / request.days))) + 1),
    openingHours: item.openingHours || undefined,
    ...(imageUrl && imageCredit ? { imageUrl, imageCredit } : {}),
  };
}

export async function recommendRestaurantsForRoute(request: TripRequest, routePoints: RoutePoint[]): Promise<FoodRecommendation[]> {
  const verifiedFoods = buildFoodRecommendations(request);
  const response = await fetchTravelApi(apiUrl('/api/restaurants/guide'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: request.destinationCity,
      keywords: '餐厅',
      limit: 12,
      radiusMeters: 1500,
      routePoints: routePoints
        .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
        .map((point) => ({ id: point.id, name: point.name, lng: point.lng, lat: point.lat, day: point.day ?? 1 })),
      preferences: {
        budgetPerPerson: Math.max(1, Math.round(request.budget / Math.max(1, request.days))),
        interests: request.interests,
        dietaryNeeds: request.dietaryRestrictions,
        mobility: request.specialNeeds.includes('行动不便') ? '少步行' : null,
      },
    }),
  });
  const payload = await readPayload(response, '餐厅指导失败');
  const rows: Array<Record<string, any>> = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const analyzedAt = typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString();
  const checkedAt = analyzedAt.slice(0, 10);
  const byVerifiedName = new Map(verifiedFoods.map((food) => [normalizeRestaurantName(food.name), food]));
  const dynamic = rows.slice(0, 12).filter((item) => item && item.id && item.name).flatMap((item) => {
    const verifiedName = String(item.verifiedShopName || item.name);
    const verified = byVerifiedName.get(normalizeRestaurantName(verifiedName));
    const location = item.location && Number.isFinite(Number(item.location.lng)) && Number.isFinite(Number(item.location.lat))
      ? `${Number(item.location.lng)},${Number(item.location.lat)}` : '';
    const sourceUrl = location
      ? `https://uri.amap.com/marker?position=${encodeURIComponent(location)}&name=${encodeURIComponent(String(item.name))}`
      : `https://uri.amap.com/search?keyword=${encodeURIComponent(`${request.destinationCity} ${item.name}`)}`;
    const tags = [compactRestaurantCategory(item.category), Number.isFinite(Number(item.rating)) ? `高德评分 ${Number(item.rating).toFixed(1)}` : '', ...(verified?.tags ?? [])].filter(Boolean).map(String).slice(0, 3);
    const dianpingUrl = verified?.dianpingUrl ?? getDianpingSearchUrl(request.destinationCity, String(item.name));
    return [{
      id: String(item.id),
      name: String(item.name),
      area: [item.district, item.address].filter(Boolean).join(' · ') || request.destinationCity,
      priceRange: Number.isFinite(Number(item.averageCost)) ? `约 ¥${Number(item.averageCost)}/人` : '消费以商家最新信息为准',
      businessStatus: '非实时，出发前核验' as const,
      tags,
      dianpingUrl,
      dianpingLinkType: verified ? 'direct' as const : 'search' as const,
      aiInsight: conciseInsight(String(item.recommendationReason || ''), item.nearestRoutePoint?.name || item.nearestPointName, item.routeDistanceMeters),
      nearestPointName: String(item.nearestRoutePoint?.name || item.nearestPointName || '路线点'),
      distanceMeters: Number.isFinite(Number(item.routeDistanceMeters)) ? Math.max(0, Math.round(Number(item.routeDistanceMeters))) : undefined,
      analysisSource: 'qwen-amap' as const,
      analyzedAt,
      source: { name: '高德动态查询 + 千问排序', url: sourceUrl, checkedAt },
    }];
  });
  return dynamic;
}

const dianpingCityIds: Record<string, string> = { 武汉: '16', 宜昌: '179', 恩施: '1368', 荆州: '184', 襄阳: '180', 黄石: '177' };

export function getDianpingSearchUrl(city: string, shopName: string) {
  const cityId = dianpingCityIds[city] || '0';
  const keyword = cityId === '0' ? `${city} ${shopName}` : shopName;
  return `https://www.dianping.com/search/keyword/${cityId}/0_${encodeURIComponent(keyword)}`;
}

function compactRestaurantCategory(value: unknown) {
  return String(value || '').split(';').map((item) => item.trim()).filter(Boolean).slice(-1)[0] || '餐饮';
}

function normalizeRestaurantName(value: string) {
  return value.replace(/[\s·・（）()\-—]/g, '').replace(/店$/u, '').toLowerCase();
}

function conciseInsight(reason: string, pointName?: string, distanceMeters?: unknown) {
  const compact = reason.replace(/\s+/g, ' ').trim().replace(/[。；;]+$/u, '');
  const routeFact = pointName
    ? `靠近${pointName}${Number.isFinite(Number(distanceMeters)) ? `约${formatDistance(Number(distanceMeters))}` : ''}`
    : '已结合当前路线分析';
  const result = compact ? `${routeFact}；${compact}` : `${routeFact}，预算与口味匹配度已由 AI 动态评估`;
  return `${result.slice(0, 66)}${result.length > 66 ? '…' : '。'}`;
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)}米` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}公里`;
}

async function readPayload(response: Response, message: string): Promise<any> {
  let payload: any = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(payload?.error || `${message}（HTTP ${response.status}）`);
  return payload;
}

function apiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

async function fetchTravelApi(input: RequestInfo | URL, init?: RequestInit) {
  let lastResponse: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!isTransientApiStatus(response.status) || attempt === 1) return response;
      lastResponse = response;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('旅行服务请求失败');
}

function isTransientApiStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
