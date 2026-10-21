import { buildFoodRecommendations, calculateTimeline, orderPointsGeographically, type FoodRecommendation, type PlannedRoutePoint, type TripPlan, type TripRequest, type TrustNotes } from '../domain/trip';
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
  // arrivalTime 为 null 表示该点位装不进当天 07:30-21:30 安全时段（仅规则降级会出现）。
  items: Array<{ id: string; day: number; arrivalTime: string | null; reason: string; overflow?: boolean }>;
  safetyNotes: string[];
  source?: 'ai' | 'rules';
  status?: 'ok' | 'infeasible';
  infeasibleDays?: Array<{ day: number; pointIds: string[]; suggestion: string }>;
};

export type AnalysisResult = { analysis: string; assumptions: string[]; dataGaps: string[] };
export type EnrichmentResult = {
  analysis?: string;
  analysisNotes?: NonNullable<TrustNotes['analysis']>;
  costs?: NonNullable<TrustNotes['costs']>;
  foods?: FoodRecommendation[];
  routePoints?: RoutePoint[];
  schedule?: AiItinerarySchedule;
};

export type GenerationStage = 'parse' | 'places' | 'analysis';
export type EnrichOptions = { signal?: AbortSignal; onStage?: (stage: GenerationStage) => void };

export async function parseTravelRequestWithAi(text: string, signal?: AbortSignal): Promise<AiTravelRequest> {
  const response = await fetchTravelApi(apiUrl('/api/ai/parse-request'), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const payload = await readPayload(response, 'AI 需求识别失败');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('AI 需求识别返回格式不正确');
  return payload.data as AiTravelRequest;
}

export async function enrichTripPlanWithBackend(plan: TripPlan, request: TripRequest, options: EnrichOptions = {}): Promise<EnrichmentResult> {
  const { signal, onStage } = options;
  onStage?.('places');
  const routePoints = await recommendAttractions(request, signal).catch((error) => { if (isAbortError(error)) throw error; return [] as RoutePoint[]; });
  throwIfAborted(signal);
  const analysisRoute = routePoints.length ? [{ ...plan.route.startPoint, day: 1 }, ...routePoints] : plan.route.points;
  const timeline = calculateTimeline(analysisRoute, plan.settings.departureTime);
  const analysisPlan = { ...plan, route: { ...plan.route, points: timeline } };
  onStage?.('analysis');
  // 餐厅沿最终路线检索，再把人均消费与预算分配一起交给分析，AI 才能判断预算与美食需求是否满足。
  const foodsAndAnalysis = recommendRestaurantsForRoute(request, timeline, signal)
    .catch(() => [] as FoodRecommendation[])
    .then(async (foods) => ({ foods, analysis: await analyzeTrip(analysisPlan, request, foods, signal).catch((error) => { if (isAbortError(error)) throw error; return null; }) }));
  const [{ foods, analysis }, schedule] = await Promise.all([
    foodsAndAnalysis,
    requestAiSchedule(timeline, request, plan.settings.departureTime, signal).catch(() => undefined),
  ]);
  throwIfAborted(signal);
  const result: EnrichmentResult = {};
  if (analysis?.analysis) {
    result.analysis = analysis.analysis;
    result.analysisNotes = { assumptions: analysis.assumptions, dataGaps: analysis.dataGaps };
  }
  result.costs = describeCosts(buildBudgetContext(analysisPlan, request, foods), timeline);
  if (schedule) result.schedule = schedule;
  if (foods.length) result.foods = foods;
  if (routePoints.length) result.routePoints = routePoints;
  if (!result.analysis && !result.foods && !result.routePoints) throw new Error('AI 与高德个性化服务暂时不可用');
  return result;
}

async function requestAiSchedule(points: PlannedRoutePoint[], request: TripRequest, departureTime: string, signal?: AbortSignal): Promise<AiItinerarySchedule> {
  const response = await fetchTravelApi(apiUrl('/api/ai/schedule'), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
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

async function analyzeTrip(plan: TripPlan, request: TripRequest, foods: FoodRecommendation[], signal?: AbortSignal) {
  const response = await fetchTravelApi(apiUrl('/api/ai/analyze'), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '请只依据 context，用一段简洁中文分析这个旅行方案如何匹配用户需求，并明确回答两点：预算是否够用（依据 context.budget 的分配额度与餐饮估算），兴趣是否被满足（美食兴趣依据 context.foods 中的真实餐厅与人均消费）。不得补充 context 中没有的价格、营业时间、线路或地点；只有 context 确实缺少的价格（如门票）才写入 dataGaps。',
      context: {
        request: {
          city: request.destinationCity, days: request.days, budget: request.budget, interests: request.interests,
          travelerType: request.travelerType, dietaryRestrictions: request.dietaryRestrictions, specialNeeds: request.specialNeeds,
          prompt: request.freeText, requestedPlaces: request.requestedPlaces, avoidPlaces: request.avoidPlaces,
        },
        route: plan.route.points.map((point) => ({ name: point.name, arrivalTime: point.time, stayMinutes: point.stayMinutes, estimatedCost: point.estimatedCost ?? null })),
        transportSuggestion: plan.route.transportSuggestion,
        budget: buildBudgetContext(plan, request, foods),
        foods: foods.slice(0, 8).map((food) => ({ name: food.name, averageCostPerPerson: food.averageCostPerPerson ?? null, nearestRoutePoint: food.nearestPointName ?? null, distanceMeters: food.distanceMeters ?? null })),
      },
    }),
  });
  const payload = await readPayload(response, 'AI 方案分析失败');
  const strings = (value: unknown) => (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean).slice(0, 10);
  return {
    analysis: typeof payload.data?.analysis === 'string' ? payload.data.analysis.trim() : '',
    assumptions: strings(payload.data?.assumptions),
    dataGaps: strings(payload.data?.dataGaps),
  } satisfies AnalysisResult;
}

// 只陈述 context 中已有的事实：真实价格列为已知，人均中位数×餐数列为估算，没有价格的点位列为缺失，不替用户下"预算一定够"的结论。
export function describeCosts(budget: ReturnType<typeof buildBudgetContext>, points: PlannedRoutePoint[]): NonNullable<TrustNotes['costs']> {
  const known = budget.knownTicketCosts.map((item) => `${item.name}：约 ${item.cost} 元/人（点位已标注价格）`);
  const estimated: string[] = [];
  if (budget.food.estimatedSpend !== null) {
    estimated.push(`餐饮约 ${budget.food.estimatedSpend} 元/人：${budget.food.estimateNote.replace(/。$/, '')}${budget.food.withinAllocation === false ? '，高于餐饮分配额度。' : '。'}`);
  }
  estimated.push('各项预算分配按总预算比例拆分，是计划额度，不是实际价格。');
  const missing: string[] = [];
  const unpriced = points.filter((point, index) => index > 0 && !Number.isFinite(point.estimatedCost)).map((point) => point.name);
  if (unpriced.length) missing.push(`门票/消费未知：${unpriced.slice(0, 6).join('、')}${unpriced.length > 6 ? ` 等 ${unpriced.length} 处` : ''}`);
  if (budget.food.medianCostPerMeal === null) missing.push('周边餐厅没有返回人均价格，餐饮费用无法估算。');
  missing.push('住宿与城际交通价格未接入真实报价，请以预订平台为准。');
  return { known, estimated, missing };
}

export function buildBudgetContext(plan: TripPlan, request: TripRequest, foods: FoodRecommendation[]) {
  const allocation = plan.content.budget.map(({ item, amount, note }) => ({ item, amount, note }));
  const foodAllocation = allocation.find((row) => row.item === '餐饮')?.amount ?? null;
  const prices = foods.map((food) => food.averageCostPerPerson).filter((value): value is number => Number.isFinite(value) && Number(value) > 0).sort((left, right) => left - right);
  const mealCount = request.days * 2;
  const medianCostPerMeal = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const estimatedFoodSpend = medianCostPerMeal === null ? null : medianCostPerMeal * mealCount;
  return {
    totalBudgetPerPerson: request.budget,
    days: request.days,
    allocationNote: '分配额度按总预算比例拆分，是计划额度而不是实际价格。',
    allocation,
    food: {
      allocation: foodAllocation,
      mealCount,
      pricedRestaurantCount: prices.length,
      cheapestCostPerMeal: prices[0] ?? null,
      medianCostPerMeal,
      estimatedSpend: estimatedFoodSpend,
      withinAllocation: estimatedFoodSpend === null || foodAllocation === null ? null : estimatedFoodSpend <= foodAllocation,
      estimateNote: `按 ${mealCount} 顿正餐 × 路线周边真实餐厅人均中位数估算。`,
    },
    knownTicketCosts: plan.route.points.filter((point) => Number.isFinite(point.estimatedCost)).map((point) => ({ name: point.name, cost: point.estimatedCost })),
  };
}

export function mealBudgetPerPerson(request: TripRequest) {
  const foodShare = Math.round(request.budget * 0.28);
  return Math.max(20, Math.round(foodShare / Math.max(1, request.days * 2)));
}

async function recommendAttractions(request: TripRequest, signal?: AbortSignal): Promise<RoutePoint[]> {
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
    const response = await fetchTravelApi(apiUrl(`/api/attractions/search?${params}`), { signal });
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
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPreferences: { prompt: request.freeText, city: request.destinationCity, days: request.days, interests: request.interests, travelerType: request.travelerType, specialNeeds: request.specialNeeds, requiredPlaces: required, avoidPlaces: request.avoidPlaces },
        candidates,
      }),
    });
    const rankingPayload = await readPayload(rankingResponse, 'AI 景点排序失败');
    ranked = (Array.isArray(rankingPayload.data?.ranked) ? rankingPayload.data.ranked : [])
      .map((rank: Record<string, any>) => ({ ...byId.get(String(rank.id)), recommendationReason: rank.reason, fitScore: rank.fitScore }))
      .filter(validPoi);
  } catch { throwIfAborted(signal); ranked = []; }
  const targetCount = Math.min(10, Math.max(4, request.days * 3));
  const ordered = [...new Map([...requiredRows, ...anchorRows, ...ranked, ...candidates].map((item) => [String(item.id), item])).values()];
  const selected = pickGeographicallyDiverse(ordered, targetCount, required);
  // 入选的景点按 AI 打分排序，地理上来回折返，地图上就是一团交叉的线。入选之后按地理位置从出发地重新排成不折返的顺序，
  // 再分天（toRoutePoint 按序号分天，所以每天的景点在地理上是连着的）。排程、餐厅、分析都用这个顺序。
  const geo = selected.map((item) => ({ item, lng: Number(item.location.lng), lat: Number(item.location.lat) }));
  const walkingOrder = orderPointsGeographically({ lng: request.origin.lng, lat: request.origin.lat }, geo).map((entry) => entry.item);
  return walkingOrder.map((item, index) => toRoutePoint(item, request, index));
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

export async function recommendRestaurantsForRoute(request: TripRequest, routePoints: RoutePoint[], signal?: AbortSignal): Promise<FoodRecommendation[]> {
  const verifiedFoods = buildFoodRecommendations(request);
  const response = await fetchTravelApi(apiUrl('/api/restaurants/guide'), {
    method: 'POST', signal,
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
        budgetPerPerson: mealBudgetPerPerson(request),
        budgetNote: 'budgetPerPerson 是每人每顿正餐的预算',
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
      ...(Number(item.averageCost) > 0 ? { averageCostPerPerson: Number(item.averageCost) } : {}),
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
      if (init?.signal?.aborted) throw init.signal.reason instanceof DOMException ? init.signal.reason : error;
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    throwIfAborted(init?.signal ?? undefined);
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('旅行服务请求失败');
}

// 502/504 表示上游 AI 已失败或超时（单次最长约 25 秒），立即重试只会让用户再多等一轮。
function isTransientApiStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 503;
}

// 用户取消（AbortError）和整体超时（TimeoutError）都要中止后续阶段，不能被当成普通失败吞掉后继续请求。
export function isAbortError(error: unknown) {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function isTimeoutError(error: unknown) {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof DOMException ? signal.reason : new DOMException('生成已取消', 'AbortError');
}
