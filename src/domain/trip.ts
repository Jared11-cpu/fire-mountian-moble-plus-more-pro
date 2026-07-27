import LZString from 'lz-string';
import type { CityName } from '../data/mockData';
import { generateSmartRoute } from '../services/mapService';
import type { JournalEntry, RoutePoint, SmartRoute, UserLocation } from '../types/route';
import { generateTravelPlan, type TravelPlan } from '../utils/aiGenerator';

export const CITY_NAMES: CityName[] = ['武汉', '宜昌', '恩施', '荆州', '襄阳', '黄石'];
export const INTERESTS = ['美食', '拍照', '自然风光', '历史文化', 'Citywalk'] as const;
export const TRAVELERS = ['学生', '朋友', '家庭', '情侣', '老人'] as const;
export const DIETARY_RESTRICTIONS = ['不吃辣', '素食'] as const;
export const SPECIAL_NEEDS = ['带儿童', '行动不便', '雨天方案'] as const;

export type Interest = (typeof INTERESTS)[number];
export type TravelerType = (typeof TRAVELERS)[number];
export type DietaryRestriction = (typeof DIETARY_RESTRICTIONS)[number];
export type SpecialNeed = (typeof SPECIAL_NEEDS)[number];

export type TripOrigin = {
  name: string;
  city: CityName;
  lat: number;
  lng: number;
  source: 'browser' | 'manual' | 'example';
};

export type TripRequest = {
  destinationCity: CityName;
  origin: TripOrigin;
  days: number;
  budget: number;
  interests: Interest[];
  travelerType: TravelerType;
  dietaryRestrictions: DietaryRestriction[];
  specialNeeds: SpecialNeed[];
  requestedPlaces: string[];
  avoidPlaces: string[];
  freeText: string;
  startDate: string;
  endDate: string;
};

export type PlannedRoutePoint = RoutePoint & {
  arrivalTime: string;
  durationMinutes: number;
  actualDurationMinutes?: number;
  travelMinutesToNext: number;
};

export type BudgetItem = { id: string; item: string; amount: number; note: string };
export type DailyRecord = { day: number; date: string; note: string; checkedPointIds: string[] };
export type FoodRecommendation = {
  id: string;
  name: string;
  area: string;
  priceRange: string;
  businessStatus: '非实时，出发前核验';
  tags: string[];
  dianpingUrl: string;
  dianpingLinkType?: 'direct' | 'search';
  aiInsight?: string;
  nearestPointName?: string;
  distanceMeters?: number;
  analysisSource?: 'qwen-amap' | 'rules';
  analyzedAt?: string;
  source: { name: string; url: string; checkedAt: string };
};

export type TripPlan = {
  id: string;
  generationSource: 'rules-v1' | 'qwen-amap';
  createdAt: string;
  updatedAt: string;
  requestSnapshot: TripRequest;
  content: TravelPlan;
  route: SmartRoute & { points: PlannedRoutePoint[] };
  settings: { targetPointCount: number; targetDurationMinutes: number; departureTime: string; transportDepartureTime?: string };
  budgetItems: BudgetItem[];
  dailyRecords: DailyRecord[];
  pointNotes: Record<string, string>;
  foodRecommendations: FoodRecommendation[];
  lastRequestHash: string;
};

export type ParsedTag = { type: '城市' | '天数' | '预算' | '兴趣' | '人群' | '饮食限制' | '特殊需求' | '必经地点' | '避开地点' | '出发地'; value: string };
export type ParseResult = { request: TripRequest; tags: ParsedTag[]; warnings: string[] };
export type PlanDifference = { changed: boolean; message: string; pointDelta: number; budgetDelta: number; durationDelta: number };

const origins: Record<CityName, TripOrigin> = {
  武汉: { name: '武汉站', city: '武汉', lat: 30.607, lng: 114.424, source: 'example' },
  宜昌: { name: '宜昌东站', city: '宜昌', lat: 30.6913, lng: 111.3706, source: 'example' },
  恩施: { name: '恩施站', city: '恩施', lat: 30.336, lng: 109.486, source: 'example' },
  荆州: { name: '荆州站', city: '荆州', lat: 30.396, lng: 112.205, source: 'example' },
  襄阳: { name: '襄阳东站', city: '襄阳', lat: 32.105, lng: 112.229, source: 'example' },
  黄石: { name: '黄石北站', city: '黄石', lat: 30.213, lng: 115.023, source: 'example' },
};

const foodLibrary: Record<CityName, Array<Omit<FoodRecommendation, 'id' | 'businessStatus'>>> = {
  武汉: [
    food('蔡林记（吉庆街店）', '吉庆街 / 江汉路', '¥15–35/人', ['热干面', '本地早餐'], '高德地图公开检索', 'https://uri.amap.com/search?keyword=%E6%AD%A6%E6%B1%89%20%E8%94%A1%E6%9E%97%E8%AE%B0', 'https://www.dianping.com/shop/l3LoOn1gi2ggY01E'),
    food('融厨湖北菜·藕汤（江汉路总店）', '江汉路 / 南京路', '¥60–90/人', ['家庭', '藕汤'], '武汉市文化和旅游局', 'https://wlj.wuhan.gov.cn/', 'https://m.dianping.com/shop/128523373'),
  ],
  宜昌: [
    food('郑信记凉虾（致祥路店）', '致祥路 / 解放路', '¥10–25/人', ['凉虾', '可选不辣'], '宜昌市文化和旅游局', 'http://whhlyj.yichang.gov.cn/', 'https://www.dianping.com/shop/9960962'),
    food('天韵鱼府·宜昌肥鱼（万寿桥店）', '万寿桥 / 沿江大道', '¥80–150/人', ['家庭', '宜昌肥鱼'], '高德地图公开检索', 'https://uri.amap.com/search?keyword=%E5%AE%9C%E6%98%8C%20%E8%82%A5%E9%B1%BC', 'https://www.dianping.com/shop/H7uXblc4aqbQNGQq'),
  ],
  恩施: [
    food('张关合渣（女儿城店）', '女儿城', '¥40–80/人', ['合渣', '土家风味'], '恩施州文化和旅游局', 'http://wtxgj.enshi.gov.cn/', 'https://www.dianping.com/shop/24748371'),
    food('恩施土家菜馆', '恩施市区', '¥60–90/人', ['家庭', '炕洋芋'], '高德地图公开检索', 'https://uri.amap.com/search?keyword=%E6%81%A9%E6%96%BD%20%E5%9C%9F%E5%AE%B6%E8%8F%9C', 'https://m.dianping.com/shop/92907850'),
  ],
  荆州: [
    food('福寿早堂面（江汉南路店）', '沙市区 / 江汉南路', '¥15–35/人', ['早堂面', '早餐'], '荆州市文化和旅游局', 'http://whhlyj.jingzhou.gov.cn/', 'https://www.dianping.com/shop/5982343'),
    food('荣子鱼糕', '古城 / 沙市', '¥45–90/人', ['鱼糕', '地方菜'], '高德地图公开检索', 'https://uri.amap.com/search?keyword=%E8%8D%86%E5%B7%9E%20%E9%B1%BC%E7%B3%95', 'https://www.dianping.com/shop/22895642'),
  ],
  襄阳: [
    food('邓家牛腩面', '樊城 / 人民广场', '¥15–30/人', ['牛肉面', '默认偏辣'], '襄阳市文化和旅游局', 'http://wlj.xiangyang.gov.cn/', 'https://www.dianping.com/shop/5112569'),
    food('吉鑫牛肉牛杂面馆（世纪坐标城店）', '襄阳城区', '¥15–30/人', ['豆腐面', '黄酒'], '高德地图公开检索', 'https://uri.amap.com/search?keyword=%E8%A5%84%E9%98%B3%20%E8%B1%86%E8%85%90%E9%9D%A2', 'https://www.dianping.com/shop/19139123'),
  ],
  黄石: [
    food('陶然风味园（广场路店）', '黄石港区 / 广场路', '¥35–70/人', ['本地早餐', '家常菜'], '黄石市文化和旅游局', 'http://wlj.huangshi.gov.cn/', 'https://www.dianping.com/shop/17201460'),
    food('湘湘田田·现炒黄牛肉（黄石港万达店）', '黄石港万达', '¥60–100/人', ['家庭', '现炒菜'], '高德地图公开检索', 'https://uri.amap.com/search?keyword=%E9%BB%84%E7%9F%B3%20%E6%B9%96%E9%B2%9C', 'https://www.dianping.com/shop/H2Ea0sbuRynFKhXy'),
  ],
};

export function updateDestinationCity(request: TripRequest, city: CityName): TripRequest {
  return {
    ...request,
    destinationCity: city,
    origin: request.origin.source === 'example' ? { ...origins[city] } : { ...request.origin },
  };
}

function food(name: string, area: string, priceRange: string, tags: string[], sourceName: string, url: string, dianpingUrl: string) {
  return { name, area, priceRange, tags, dianpingUrl, source: { name: sourceName, url, checkedAt: '2026-07-15' } };
}

export function defaultTripRequest(city: CityName = '宜昌'): TripRequest {
  const startDate = todayIso();
  return {
    destinationCity: city,
    origin: { ...origins[city] },
    days: 2,
    budget: 600,
    interests: ['拍照', '美食'],
    travelerType: '朋友',
    dietaryRestrictions: [],
    specialNeeds: [],
    requestedPlaces: [],
    avoidPlaces: [],
    freeText: `我想去${city}两天一夜，预算600元，喜欢拍照和美食。`,
    startDate,
    endDate: addDaysIso(startDate, 1),
  };
}

export function normalizeRequest(input: TripRequest): TripRequest {
  const days = Math.min(15, Math.max(1, Math.round(Number(input.days) || 1)));
  const startDate = isIsoDate(input.startDate) ? input.startDate : todayIso();
  return {
    ...input,
    days,
    budget: Math.max(0, Math.round(Number(input.budget) || 0)),
    interests: unique(input.interests).filter((item): item is Interest => INTERESTS.includes(item as Interest)),
    dietaryRestrictions: unique(input.dietaryRestrictions),
    specialNeeds: unique(input.specialNeeds),
    requestedPlaces: unique(input.requestedPlaces ?? []).slice(0, 10),
    avoidPlaces: unique(input.avoidPlaces ?? []).slice(0, 10),
    startDate,
    endDate: addDaysIso(startDate, days - 1),
  };
}

export function parseTravelRequest(text: string, base = defaultTripRequest()): ParseResult {
  const next: TripRequest = { ...base, interests: [], travelerType: '朋友', dietaryRestrictions: [], specialNeeds: [], requestedPlaces: [], avoidPlaces: [], freeText: text, startDate: base.startDate, endDate: base.endDate };
  const tags: ParsedTag[] = [];
  const warnings: string[] = [];
  let city = CITY_NAMES.find((name) => text.includes(name));
  if (city) { Object.assign(next, updateDestinationCity(next, city)); tags.push({ type: '城市', value: city }); }
  const dayMatch = text.match(/([一二两三四五六七八九十\d]+)天(?:[一二两三四五六七八九十\d]+夜)?/) ?? text.match(/([一二两三四五六七八九十\d]+)日游/);
  if (dayMatch) { next.days = Math.min(15, Math.max(1, chineseNumber(dayMatch[1]))); tags.push({ type: '天数', value: `${next.days}天` }); }
  const budgetMatch = text.match(/(?:预算|人均)\s*(\d{2,6})(?:\s*(?:元|块))?(?:以内|以下)?/) ?? text.match(/(\d{2,6})\s*块(?:以内|以下)?/);
  if (budgetMatch) { next.budget = Number(budgetMatch[1]); tags.push({ type: '预算', value: `${next.budget}元` }); }
  const interestLexicon: Array<[Interest, string[]]> = [
    ['自然风光', ['自然风光', '峡谷', '山水', '云海', '徒步']], ['拍照', ['拍照', '摄影', '旅拍', '出片']],
    ['美食', ['美食', '小吃', '餐厅', '餐饮', '咖啡', '好吃的']], ['历史文化', ['历史文化', '历史', '博物馆', '古城', '文化']],
    ['Citywalk', ['Citywalk', 'citywalk', '城市漫步', '街区漫步']],
  ];
  const detectedInterests = interestLexicon.filter(([, words]) => words.some((word) => text.includes(word))).map(([interest]) => interest);
  next.interests = unique(detectedInterests);
  next.interests.forEach((value) => tags.push({ type: '兴趣', value }));
  const traveler = TRAVELERS.find((item) => text.includes(item));
  if (traveler) { next.travelerType = traveler; tags.push({ type: '人群', value: traveler }); }
  if (text.includes('带儿童')) { next.travelerType = '家庭'; next.specialNeeds.push('带儿童'); tags.push({ type: '人群', value: '家庭' }); tags.push({ type: '特殊需求', value: '带儿童' }); }
  if (/老人|少爬坡|行动不便/.test(text)) { next.specialNeeds = unique([...next.specialNeeds, '行动不便']); tags.push({ type: '特殊需求', value: '行动不便' }); }
  if (/雨天|下雨/.test(text)) { next.specialNeeds = unique([...next.specialNeeds, '雨天方案']); tags.push({ type: '特殊需求', value: '雨天方案' }); }
  if (/不吃辣|不要辣|忌辣/.test(text)) { next.dietaryRestrictions = unique([...next.dietaryRestrictions, '不吃辣']); tags.push({ type: '饮食限制', value: '不吃辣' }); }
  if (/素食|吃素/.test(text)) { next.dietaryRestrictions = unique([...next.dietaryRestrictions, '素食']); tags.push({ type: '饮食限制', value: '素食' }); }
  next.requestedPlaces = extractRequestedPlaces(text);
  next.requestedPlaces.forEach((value) => tags.push({ type: '必经地点', value }));
  if (!city) {
    city = inferCityFromPlaces(next.requestedPlaces);
    if (city) { Object.assign(next, updateDestinationCity(next, city)); tags.push({ type: '城市', value: city }); }
  }
  const originMatch = text.match(/从([^，,。]{2,16})出发/);
  if (originMatch) { next.origin = { ...next.origin, name: originMatch[1].trim(), source: 'manual' }; tags.push({ type: '出发地', value: next.origin.name }); }
  if (!city) warnings.push('未识别目的地城市，已保留当前城市。');
  return { request: normalizeRequest(next), tags: uniqueBy(tags, (tag) => `${tag.type}-${tag.value}`), warnings };
}

export function generateTripPlan(requestInput: TripRequest, previous?: TripPlan | null): TripPlan {
  const request = normalizeRequest(requestInput);
  const input = {
    city: request.destinationCity,
    days: request.days,
    budget: request.budget,
    interests: request.interests,
    group: request.travelerType,
    prompt: request.freeText,
  };
  const location: UserLocation = { ...request.origin, status: request.origin.source === 'browser' ? 'success' : 'mock', message: 'TripRequest 统一出发地' };
  const content = generateTravelPlan(input);
  const rawRoute = generateSmartRoute(input, location);
  const targetPointCount = Math.max(2, Math.min(rawRoute.points.length, previous?.settings.targetPointCount ?? rawRoute.points.length));
  const limited = rawRoute.points.slice(0, targetPointCount).map((point, index) => ({
    ...point,
    day: Math.min(request.days, Math.floor(index / Math.max(1, Math.ceil(targetPointCount / request.days))) + 1),
  }));
  const departureTime = previous?.settings.departureTime ?? '08:30';
  const points = calculateTimeline(limited, departureTime);
  const now = new Date().toISOString();
  const requestHash = stableHash(request);
  const route = { ...rawRoute, points, title: cleanDuplicateTitle(rawRoute.title, request.interests), recommendedStartTime: departureTime, sceneryAnalysis: { ...rawRoute.sceneryAnalysis, socialCopy: buildSocialCopy(request) } } as TripPlan['route'];
  const dailyRecords = Array.from({ length: request.days }, (_, index) => ({ ...(previous?.dailyRecords[index] ?? { note: '', checkedPointIds: [] }), day: index + 1, date: addDaysIso(request.startDate, index) }));
  return {
    id: `plan-${requestHash}`,
    generationSource: 'rules-v1',
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    requestSnapshot: request,
    content,
    route,
    settings: { targetPointCount, targetDurationMinutes: totalPlanMinutes(points), departureTime, transportDepartureTime: previous?.settings.transportDepartureTime },
    budgetItems: previous?.budgetItems ?? content.budget.map((row, index) => ({ ...row, id: `budget-${index}`, amount: 0, note: '' })),
    dailyRecords,
    pointNotes: previous?.pointNotes ?? {},
    foodRecommendations: filterFoods(request),
    lastRequestHash: requestHash,
  };
}

export function calculateTimeline(points: RoutePoint[], departureTime: string): PlannedRoutePoint[] {
  return scheduleDailyTimeline(points, departureTime, (point, next) => next ? travelMinutes(point, next) : 0);
}

export function normalizePlanTimeline(plan: TripPlan): TripPlan {
  const points = recalculateDailyTimeline(plan.route.points, plan.settings.departureTime);
  return {
    ...plan,
    route: { ...plan.route, points },
    settings: {
      ...plan.settings,
      targetDurationMinutes: totalPlanMinutes(points),
    },
  };
}

export function recalculateDailyTimeline(points: PlannedRoutePoint[], departureTime: string): PlannedRoutePoint[] {
  return scheduleDailyTimeline(points, departureTime, (point, next) => next ? normalizeTravelGap(point.travelMinutesToNext) : 0);
}

function scheduleDailyTimeline(
  points: RoutePoint[],
  departureTime: string,
  resolveTravel: (point: PlannedRoutePoint, next?: RoutePoint) => number,
): PlannedRoutePoint[] {
  if (!points.length) return [];
  const preferredStart = normalizeDayStart(departureTime) + 15;
  const scheduled: PlannedRoutePoint[] = [];
  const groups = groupConsecutiveDays(points);

  for (const group of groups) {
    const prepared = group.map((point, index) => {
      const durationMinutes = Math.max(10, Math.round(Number((point as PlannedRoutePoint).durationMinutes ?? point.stayMinutes) || 30));
      const next = group[index + 1];
      const travelMinutesToNext = next ? normalizeTravelGap(resolveTravel(point as PlannedRoutePoint, next)) : 0;
      return { point, durationMinutes, travelMinutesToNext };
    });
    const spanToLastArrival = prepared.slice(0, -1).reduce((sum, item) => sum + item.durationMinutes + item.travelMinutesToNext, 0);
    const earliestStart = 7 * 60 + 30;
    const latestArrival = 21 * 60 + 30;
    const start = Math.max(earliestStart, Math.min(preferredStart, latestArrival - spanToLastArrival));
    const scale = spanToLastArrival > 0 ? Math.min(1, (latestArrival - start) / spanToLastArrival) : 1;
    let elapsed = 0;

    prepared.forEach(({ point, durationMinutes, travelMinutesToNext }) => {
      const arrivalTime = fromMinutes(start + Math.round(elapsed * scale));
      scheduled.push({ ...point, time: arrivalTime, stayMinutes: durationMinutes, arrivalTime, durationMinutes, travelMinutesToNext });
      elapsed += durationMinutes + travelMinutesToNext;
    });
  }
  return scheduled;
}

function groupConsecutiveDays(points: RoutePoint[]) {
  const groups: RoutePoint[][] = [];
  let currentDay: number | undefined;
  for (const point of points) {
    const day = Math.max(1, Math.round(Number(point.day) || 1));
    if (day !== currentDay) {
      groups.push([]);
      currentDay = day;
    }
    groups[groups.length - 1].push({ ...point, day });
  }
  return groups;
}

function normalizeDayStart(value: string) {
  const parsed = /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? toMinutes(value) : 8 * 60 + 30;
  return Math.min(10 * 60 + 30, Math.max(7 * 60 + 15, parsed));
}

function normalizeTravelGap(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(12 * 60, Math.max(0, Math.round(parsed))) : 0;
}

export function comparePlans(previous: TripPlan, next: TripPlan): PlanDifference {
  const pointDelta = next.route.points.length - previous.route.points.length;
  const budgetDelta = next.requestSnapshot.budget - previous.requestSnapshot.budget;
  const durationDelta = next.settings.targetDurationMinutes - previous.settings.targetDurationMinutes;
  const changed = previous.lastRequestHash !== next.lastRequestHash || pointDelta !== 0 || budgetDelta !== 0 || durationDelta !== 0;
  return {
    changed, pointDelta, budgetDelta, durationDelta,
    message: changed
      ? `调整了${Math.abs(pointDelta)}个点位，预算${budgetDelta === 0 ? '不变' : `${budgetDelta > 0 ? '增加' : '减少'}${Math.abs(budgetDelta)}元`}，总时长${durationDelta === 0 ? '不变' : `${durationDelta > 0 ? '增加' : '减少'}${Math.abs(durationDelta)}分钟`}。`
      : '当前参数与上次生成完全一致，路线保持不变。',
  };
}

type SharePlanPayload = { version: 1; request: TripRequest; plan: TripPlan };
export function encodeSharePlan(plan: TripPlan) {
  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify({ version: 1, request: plan.requestSnapshot, plan } satisfies SharePlanPayload));
  if (encoded.length > 12000) throw new Error('方案内容过长，请减少自定义备注后再分享。');
  return encoded;
}

export function decodeSharePlan(encoded: string): TripPlan {
  const json = LZString.decompressFromEncodedURIComponent(encoded);
  if (!json) throw new Error('分享链接无效或已损坏。');
  const payload = JSON.parse(json) as SharePlanPayload;
  if (payload.version !== 1 || !payload.plan?.id || !payload.request?.destinationCity) throw new Error('分享链接版本不受支持。');
  return { ...payload.plan, requestSnapshot: normalizeRequest(payload.request) };
}

export function updatePlanDates(plan: TripPlan, request: TripRequest): TripPlan {
  return { ...plan, requestSnapshot: request, dailyRecords: Array.from({ length: request.days }, (_, index) => ({ ...(plan.dailyRecords[index] ?? { day: index + 1, note: '', checkedPointIds: [] }), day: index + 1, date: addDaysIso(request.startDate, index) })), updatedAt: new Date().toISOString() };
}

export function budgetTotal(items: BudgetItem[]) { return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0); }
export function todayIso() { return toIsoDate(new Date()); }
export function parseLocalDate(value: string) { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); }
export function addDaysIso(value: string, days: number) { const date = parseLocalDate(value); date.setDate(date.getDate() + days); return toIsoDate(date); }
export function daysBetween(start: string, end: string) { return Math.floor((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86400000) + 1; }
export function isIsoDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = parseLocalDate(value); return toIsoDate(parsed) === value; }

function filterFoods(request: TripRequest): FoodRecommendation[] {
  let rows = foodLibrary[request.destinationCity].map((item, index) => ({
    ...item,
    id: `food-${request.destinationCity}-${index}`,
    businessStatus: '非实时，出发前核验' as const,
    aiInsight: `适合作为${request.destinationCity}路线中的${item.tags[0] ?? '本地风味'}备选，AI 将按实时路线距离、预算和饮食偏好继续核验。`,
    nearestPointName: '等待路线动态匹配',
    analysisSource: 'rules' as const,
  }));
  if (request.dietaryRestrictions.includes('素食')) rows = rows.filter((row) => row.tags.some((tag) => /素|小吃|早餐/.test(tag)));
  return rows.map((row) => request.dietaryRestrictions.includes('不吃辣') ? { ...row, tags: unique([...row.tags, '下单时明确要求不辣']) } : row);
}

function travelMinutes(from: RoutePoint, to: RoutePoint) {
  const pair = `${from.name}|${to.name}`;
  if (/恩施站.*恩施大峡谷|恩施大峡谷.*恩施站/.test(pair)) return 105;
  if (/恩施大峡谷|屏山峡谷|鹿院坪/.test(pair)) return 90;
  if (/三峡.*(坛子岭|185)|坛子岭.*三峡|185.*西坝/.test(pair)) return 75;
  const distance = haversine(from.lat, from.lng, to.lat, to.lng);
  const speed = to.transportMode === 'walk' ? 4.5 : to.transportMode === 'transit' ? 22 : 38;
  return Math.max(12, Math.round((distance / speed) * 60 + 8));
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371; const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1); const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function totalPlanMinutes(points: PlannedRoutePoint[]) { return points.reduce((sum, point) => sum + point.durationMinutes + point.travelMinutesToNext, 0); }
function toMinutes(value: string) { const [hour, minute] = value.split(':').map(Number); return (hour || 0) * 60 + (minute || 0); }
function fromMinutes(value: number) { const normalized = ((value % 1440) + 1440) % 1440; return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`; }
function toIsoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function chineseNumber(value: string) { if (/^\d+$/.test(value)) return Number(value); const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }; if (value.length === 1) return map[value] ?? 1; if (value.startsWith('十')) return 10 + (map[value[1]] ?? 0); if (value.includes('十')) return (map[value[0]] ?? 0) * 10 + (map[value[2]] ?? 0); return map[value] ?? 1; }
function stableHash(value: unknown) { const text = JSON.stringify(value); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
function unique<T>(items: T[]) { return [...new Set(items)]; }
function uniqueBy<T>(items: T[], key: (item: T) => string) { const seen = new Set<string>(); return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; }); }
function cleanDuplicateTitle(title: string, interests: Interest[]) { const [first, second] = unique(interests); if (!first) return title; const suffix = second ? `${first} × ${second}` : first; return title.replace(/：.*$/, `：${suffix}`); }

export function buildSocialCopy(request: TripRequest) {
  const interests = request.interests.length ? request.interests.join('、') : '轻松游';
  return `${request.destinationCity}${request.days}天旅行计划已生成：总预算${request.budget}元，重点安排${interests}。路线会按当前条件同步更新，出发前请再次核验开放时间与交通状态。`;
}

function inferCityFromPlaces(places: string[]): CityName | undefined {
  const cityKeywords: Array<[CityName, RegExp]> = [
    ['武汉', /武汉|黄鹤楼|东湖|江汉路|昙华林|古德寺|户部巷|湖北省博物馆/],
    ['宜昌', /宜昌|三峡|清江画廊|屈原故里/], ['恩施', /恩施|云龙地缝|女儿城|屏山峡谷|梭布垭/],
    ['荆州', /荆州|宾阳楼/], ['襄阳', /襄阳|古隆中|唐城/], ['黄石', /黄石|磁湖|矿山公园/],
  ];
  return cityKeywords.find(([, pattern]) => places.some((place) => pattern.test(place)))?.[0];
}

export function extractRequestedPlaces(text: string) {
  const knownPlaces = [
    '武汉长江大桥', '湖北省博物馆', '武汉大学', '黄鹤楼', '东湖', '江汉路', '昙华林', '古德寺', '户部巷',
    '三峡人家', '三峡大坝', '长江三峡', '清江画廊', '屈原故里', '三峡',
    '恩施大峡谷', '云龙地缝', '女儿城', '屏山峡谷', '梭布垭石林',
    '荆州博物馆', '荆州古城', '古隆中', '襄阳古城', '唐城影视基地', '黄石国家矿山公园', '磁湖',
  ];
  const matches = knownPlaces.filter((name) => text.includes(name));
  for (const match of text.matchAll(/(?:想去看?|想看|要去|必去|必须经过|经过|包括|参观)([\u4e00-\u9fa5A-Za-z0-9·]{2,18}?)(?=以及|还有|并且|而且|，|。|、|$)/g)) {
    const value = match[1].trim();
    if (!/[天日元]|预算|旅游|旅行|景点|地方|玩/.test(value)) matches.push(value);
  }
  return unique(matches).filter((name, index, rows) => !rows.slice(0, index).some((existing) => existing.includes(name) || name.includes(existing))).slice(0, 10);
}

export function buildFoodRecommendations(request: TripRequest) { return filterFoods(request); }

export function getVerifiedDianpingShopUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const isDianping = url.hostname === 'www.dianping.com' || url.hostname === 'm.dianping.com';
    return isDianping && /^\/shop\/[A-Za-z0-9]+\/?$/.test(url.pathname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function getSafeDianpingUrl(value?: string) {
  const direct = getVerifiedDianpingShopUrl(value);
  if (direct) return direct;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const isDianping = url.hostname === 'www.dianping.com' || url.hostname === 'm.dianping.com';
    return isDianping && /^\/search\/keyword\/\d+\/0_[^/]+\/?$/.test(url.pathname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export type PersistedAppState = { version: 2; request: TripRequest; plan: TripPlan | null; journalEntries: JournalEntry[] };
