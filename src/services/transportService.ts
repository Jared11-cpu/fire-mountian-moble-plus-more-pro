import type { PlannedRoutePoint, TripRequest } from '../domain/trip';

export type TransportMode = '步行' | '公交' | '地铁' | '铁路' | '驾车' | '网约车' | '景区专线' | '公共交通';
export type TransportSource = 'transport-api' | 'rules-v1' | 'rules-fallback';
export type TransportFreshness = 'vehicle-realtime' | 'live-query' | 'estimate';
export type TransitStrategy = 'recommended' | 'fastest' | 'economy' | 'fewest-transfers' | 'least-walking' | 'subway-first';
export type TransitLegMode = 'walk' | 'bus' | 'subway' | 'railway' | 'taxi' | 'shuttle';

export type TransportLeg = {
  id: string;
  mode: TransitLegMode;
  lineName?: string;
  lineType?: string;
  departureStop?: string;
  arrivalStop?: string;
  entrance?: string;
  exit?: string;
  viaStops: string[];
  durationMinutes: number;
  distanceKm: number;
  fare?: number;
  serviceStartTime?: string;
  serviceEndTime?: string;
  instructions?: string[];
  roadNames?: string[];
  polyline: Array<[number, number]>;
};

export type TransportSegment = {
  id: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  distanceKm: number;
  mode: TransportMode;
  costEstimate: string;
  fare?: number;
  instruction: string;
  liveStatus?: string;
  origin?: { lng: number; lat: number };
  destination?: { lng: number; lat: number };
  legs: TransportLeg[];
};

export type TransportPlanRequest = {
  city: string;
  departureDate: string;
  departureTime: string;
  strategy: TransitStrategy;
  travelerType: TripRequest['travelerType'];
  specialNeeds: TripRequest['specialNeeds'];
  points: Array<Pick<PlannedRoutePoint, 'id' | 'name' | 'lat' | 'lng' | 'day' | 'arrivalTime' | 'durationMinutes' | 'travelMinutesToNext'>>;
};

export type TransportPlanResponse = {
  source: TransportSource;
  sourceLabel: string;
  generatedAt: string;
  isRealtime: boolean;
  freshness: TransportFreshness;
  totalMinutes: number;
  totalDistanceKm: number;
  totalFare?: number;
  summary: string;
  segments: TransportSegment[];
  notices: string[];
};

export type TransportChoiceId = 'transit' | 'driving';

export type TransportChoice = {
  id: TransportChoiceId;
  label: string;
  caption: string;
  plan: TransportPlanResponse;
};

export type TransportComparison = {
  options: TransportChoice[];
  recommendedOptionId: TransportChoiceId;
  reason: string;
  cautions: string[];
  optionAnalyses: Array<{ id: TransportChoiceId; summary: string }>;
  analysisSource: 'qwen-amap' | 'rules';
  generatedAt: string;
};

export interface TransportPlanProvider {
  readonly id: string;
  plan(request: TransportPlanRequest, signal?: AbortSignal): Promise<TransportPlanResponse>;
}

export class HttpTransportPlanProvider implements TransportPlanProvider {
  readonly id = 'transport-api';
  constructor(private readonly endpoint: string, private readonly fetcher: typeof fetch = fetch) {}
  async plan(request: TransportPlanRequest, signal?: AbortSignal) {
    const response = await this.fetcher.call(globalThis, this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal });
    if (!response.ok) throw new Error(`交通 API HTTP ${response.status}`);
    const data = await response.json() as TransportPlanResponse;
    if (!Array.isArray(data.segments) || typeof data.summary !== 'string') throw new Error('交通 API 返回格式不正确');
    return {
      ...data,
      source: 'transport-api' as const,
      isRealtime: data.freshness === 'vehicle-realtime',
      freshness: data.freshness ?? 'live-query',
      sourceLabel: data.sourceLabel || '动态公共交通查询',
    };
  }
}

export class RulesTransportPlanProvider implements TransportPlanProvider {
  readonly id = 'rules-v1';
  async plan(request: TransportPlanRequest) { return buildRulesTransportPlan(request); }
}

export async function resolveTransportPlan(request: TransportPlanRequest, options: { endpoint?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {}) {
  const endpoint = (options.endpoint ?? (import.meta.env.VITE_TRANSPORT_API_URL as string | undefined)?.trim()) || defaultTransportEndpoint();
  if (!endpoint) return new RulesTransportPlanProvider().plan(request);
  try { return await new HttpTransportPlanProvider(endpoint, options.fetcher).plan(request, options.signal); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    const fallback = await new RulesTransportPlanProvider().plan(request);
    return { ...fallback, source: 'rules-fallback' as const, sourceLabel: '动态查询失败 · 规则降级', notices: [`动态交通服务暂不可用：${error instanceof Error ? error.message : '未知错误'}。`, ...fallback.notices] };
  }
}

type TransportComparisonOptions = {
  transitEndpoint?: string;
  routeEndpoint?: string;
  adviceEndpoint?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

type AmapDrivingPath = {
  durationMinutes: number;
  distanceKm: number;
  tolls?: number;
  taxiCost?: number;
  polyline?: Array<[number, number]>;
  steps?: Array<{ instruction?: string; road?: string; distanceMeters?: number; durationMinutes?: number }>;
};

type AmapDrivingResponse = {
  generatedAt?: string;
  paths?: AmapDrivingPath[];
};

export async function resolveTransportComparison(request: TransportPlanRequest, options: TransportComparisonOptions = {}): Promise<TransportComparison> {
  const fetcher = options.fetcher ?? fetch;
  const transitEndpoint = options.transitEndpoint ?? ((import.meta.env.VITE_TRANSPORT_API_URL as string | undefined)?.trim() || defaultTransportEndpoint());
  const routeEndpoint = options.routeEndpoint ?? defaultSameOriginEndpoint('/api/route/plan');
  const adviceEndpoint = options.adviceEndpoint ?? defaultSameOriginEndpoint('/api/ai/transport-advice');
  const [transit, driving] = await Promise.all([
    resolveTransportPlan(request, { endpoint: transitEndpoint, fetcher, signal: options.signal }),
    resolveDrivingTransportPlan(request, { endpoint: routeEndpoint, fetcher, signal: options.signal }),
  ]);
  const choices: TransportChoice[] = [
    { id: 'transit', label: '公交 / 地铁', caption: '站口、换乘与步行', plan: transit },
    { id: 'driving', label: '驾车', caption: '道路、用时与过路费', plan: driving },
  ];
  const fallback = fallbackTransportAdvice(choices, request);
  if (!adviceEndpoint) return { ...fallback, options: choices, generatedAt: new Date().toISOString() };
  try {
    const response = await fetcher(adviceEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: options.signal,
      body: JSON.stringify({
        options: choices.map(({ id, label, plan }) => ({
          id, label, totalMinutes: plan.totalMinutes, totalDistanceKm: plan.totalDistanceKm, totalFare: plan.totalFare, freshness: plan.freshness,
          routeModes: [...new Set(plan.segments.map((segment) => segment.mode))],
          walkingMinutes: plan.segments.flatMap((segment) => segment.legs).filter((leg) => leg.mode === 'walk').reduce((sum, leg) => sum + leg.durationMinutes, 0),
          transferCount: Math.max(0, plan.segments.flatMap((segment) => segment.legs).filter((leg) => leg.mode !== 'walk').length - plan.segments.length),
          segments: plan.segments.map((segment) => ({ mode: segment.mode, durationMinutes: segment.durationMinutes, distanceKm: segment.distanceKm, costEstimate: segment.costEstimate, lines: segment.legs.map((leg) => leg.lineName).filter(Boolean) })),
        })),
        userPreference: strategyLabel(request.strategy), specialNeeds: request.specialNeeds,
      }),
    });
    if (!response.ok) throw new Error(`AI 交通分析 HTTP ${response.status}`);
    const result = await response.json() as { recommendedOptionId?: string; reason?: string; cautions?: string[]; optionAnalyses?: Array<{ id?: string; summary?: string }> };
    if (!choices.some((choice) => choice.id === result.recommendedOptionId) || !result.reason) throw new Error('AI 交通分析格式不正确');
    return {
      options: choices,
      recommendedOptionId: result.recommendedOptionId as TransportChoiceId,
      reason: result.reason,
      cautions: Array.isArray(result.cautions) ? result.cautions.slice(0, 2) : [],
      optionAnalyses: Array.isArray(result.optionAnalyses) ? result.optionAnalyses.filter((item): item is { id: TransportChoiceId; summary: string } => choices.some((choice) => choice.id === item.id) && Boolean(item.summary)).slice(0, choices.length) : fallback.optionAnalyses,
      analysisSource: 'qwen-amap',
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ...fallback, options: choices, generatedAt: new Date().toISOString() };
  }
}

export async function resolveDrivingTransportPlan(request: TransportPlanRequest, options: { endpoint?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<TransportPlanResponse> {
  const endpoint = options.endpoint ?? defaultSameOriginEndpoint('/api/route/plan');
  const fetcher = options.fetcher ?? fetch;
  if (!endpoint) return buildRulesDrivingPlan(request);
  try {
    const pathResults = await Promise.all(sameDayPointPairs(request.points).map(async ({ point, next }) => {
      const response = await fetcher(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: options.signal,
        body: JSON.stringify({ mode: 'driving', strategy: 0, origin: { name: point.name, lng: point.lng, lat: point.lat }, destination: { name: next.name, lng: next.lng, lat: next.lat } }),
      });
      if (!response.ok) throw new Error(`高德驾车 API HTTP ${response.status}`);
      const data = await response.json() as AmapDrivingResponse;
      const path = data.paths?.[0];
      if (!path || !Number.isFinite(path.durationMinutes) || !Number.isFinite(path.distanceKm)) throw new Error('高德驾车 API 返回格式不正确');
      return { point, next, path };
    }));
    const segments = pathResults.map(({ point, next, path }): TransportSegment => {
      const departureTime = shiftClock(point.arrivalTime, point.durationMinutes);
      const costParts = [path.taxiCost === undefined ? '' : `打车约 ¥${path.taxiCost}`, path.tolls === undefined ? '' : path.tolls > 0 ? `过路费 ¥${path.tolls}` : '无过路费'].filter(Boolean);
      const instructions = path.steps?.map((step) => step.instruction).filter((value): value is string => Boolean(value)) ?? [];
      const roadNames = [...new Set(path.steps?.map((step) => step.road).filter((value): value is string => Boolean(value)) ?? [])];
      return {
        id: `${point.id}-${next.id}-driving`, from: point.name, to: next.name, departureTime,
        arrivalTime: shiftClock(departureTime, path.durationMinutes), durationMinutes: path.durationMinutes,
        distanceKm: path.distanceKm, mode: '驾车', costEstimate: costParts.join(' · ') || '费用待查询',
        origin: { lng: point.lng, lat: point.lat }, destination: { lng: next.lng, lat: next.lat },
        ...(path.taxiCost === undefined ? {} : { fare: path.taxiCost }),
        instruction: instructions.slice(0, 3).join('；') || '按高德本次道路规划行驶，出发前再次刷新路况。',
        liveStatus: '高德动态道路规划',
        legs: [{ id: `${point.id}-${next.id}-drive`, mode: 'taxi', lineName: '驾车路线', viaStops: [], durationMinutes: path.durationMinutes, distanceKm: path.distanceKm, ...(path.taxiCost === undefined ? {} : { fare: path.taxiCost }), instructions, roadNames, polyline: path.polyline?.length ? path.polyline : [] }],
      };
    });
    const totalFare = segments.reduce((sum, segment) => sum + (segment.fare ?? 0), 0);
    const totalMinutes = segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
    const totalDistanceKm = round1(segments.reduce((sum, segment) => sum + segment.distanceKm, 0));
    return {
      source: 'transport-api', sourceLabel: '高德动态驾车规划', generatedAt: new Date().toISOString(), isRealtime: false, freshness: 'live-query',
      totalMinutes, totalDistanceKm, ...(segments.some((segment) => segment.fare !== undefined) ? { totalFare: round1(totalFare) } : {}),
      summary: `高德已规划 ${segments.length} 段驾车路线，预计 ${totalMinutes} 分钟、约 ${totalDistanceKm} 公里。`, segments,
      notices: ['用时与道路来自本次高德查询，不代表持续实时导航；出发前请再次刷新拥堵与临时管制。'],
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const fallback = buildRulesDrivingPlan(request);
    return { ...fallback, source: 'rules-fallback', sourceLabel: '驾车查询失败 · 规则估算', notices: [`高德驾车服务暂不可用：${error instanceof Error ? error.message : '未知错误'}。`, ...fallback.notices] };
  }
}

function defaultTransportEndpoint() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('github.io')) return '';
  return `${window.location.origin}/api/transit/plan`;
}

function defaultSameOriginEndpoint(path: string) {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('github.io')) return '';
  return `${window.location.origin}${path}`;
}

export function toTransportPlanRequest(request: TripRequest, points: PlannedRoutePoint[], departureTime: string, strategy: TransitStrategy = 'recommended'): TransportPlanRequest {
  return {
    city: request.destinationCity,
    departureDate: request.startDate,
    departureTime,
    strategy,
    travelerType: request.travelerType,
    specialNeeds: request.specialNeeds,
    points: points.map(({ id, name, lat, lng, day, arrivalTime, durationMinutes, travelMinutesToNext }) => ({ id, name, lat, lng, day, arrivalTime, durationMinutes, travelMinutesToNext })),
  };
}

export function buildRulesTransportPlan(request: TransportPlanRequest): TransportPlanResponse {
  const segments = sameDayPointPairs(request.points).map(({ point, next }): TransportSegment => {
    const distanceKm = haversine(point.lat, point.lng, next.lat, next.lng);
    const durationMinutes = Math.max(1, point.travelMinutesToNext);
    const mode = chooseMode(distanceKm, durationMinutes, request.specialNeeds);
    const legMode: TransitLegMode = mode === '步行' ? 'walk' : mode === '景区专线' ? 'shuttle' : mode === '网约车' ? 'taxi' : 'bus';
    return {
      id: `${point.id}-${next.id}`,
      from: point.name,
      to: next.name,
      departureTime: shiftClock(point.arrivalTime, point.durationMinutes),
      arrivalTime: next.arrivalTime,
      durationMinutes,
      distanceKm: Math.round(distanceKm * 10) / 10,
      mode,
      origin: { lng: point.lng, lat: point.lat }, destination: { lng: next.lng, lat: next.lat },
      costEstimate: mode === '步行' ? '¥0' : '待查询',
      instruction: instructionFor(mode, durationMinutes, request.travelerType),
      legs: [{ id: `${point.id}-${next.id}-estimate`, mode: legMode, viaStops: [], durationMinutes, distanceKm: Math.round(distanceKm * 10) / 10, polyline: [] }],
    };
  });
  const totalMinutes = segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const totalDistanceKm = Math.round(segments.reduce((sum, segment) => sum + segment.distanceKm, 0) * 10) / 10;
  const longSegments = segments.filter((segment) => segment.durationMinutes >= 60).length;
  const notices = ['当前未取得可用的高德公交结果，线路、时间与费用只能标记为待查询，不能替代导航。', '请确认 Sites 已配置 AMAP_WEB_SERVICE_KEY，且高德 Web 服务 Key 已启用路径规划服务。'];
  if (request.specialNeeds.includes('行动不便')) notices.unshift('已优先减少步行；上下车点仍需核验无障碍设施。');
  return { source: 'rules-v1', sourceLabel: '规则引擎交通方案', generatedAt: new Date().toISOString(), isRealtime: false, freshness: 'estimate', totalMinutes, totalDistanceKm, summary: `共 ${segments.length} 段交通，预计 ${totalMinutes} 分钟、约 ${totalDistanceKm} 公里${longSegments ? `；其中 ${longSegments} 段为跨区长距离交通` : ''}。`, segments, notices };
}

export function buildRulesDrivingPlan(request: TransportPlanRequest): TransportPlanResponse {
  const segments = sameDayPointPairs(request.points).map(({ point, next }): TransportSegment => {
    const straightDistance = haversine(point.lat, point.lng, next.lat, next.lng);
    const distanceKm = round1(straightDistance * 1.28);
    const durationMinutes = Math.max(8, Math.round(distanceKm / (distanceKm > 30 ? 55 : 32) * 60));
    const departureTime = shiftClock(point.arrivalTime, point.durationMinutes);
    return {
      id: `${point.id}-${next.id}-drive-estimate`, from: point.name, to: next.name, departureTime,
      arrivalTime: shiftClock(departureTime, durationMinutes), durationMinutes, distanceKm, mode: '驾车',
      origin: { lng: point.lng, lat: point.lat }, destination: { lng: next.lng, lat: next.lat },
      costEstimate: '油费与过路费待导航', instruction: '当前为规则估算，恢复高德服务后将显示真实道路、用时与过路费。',
      legs: [{ id: `${point.id}-${next.id}-drive-estimate-leg`, mode: 'taxi', lineName: '驾车估算', viaStops: [], durationMinutes, distanceKm, polyline: [] }],
    };
  });
  const totalMinutes = segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const totalDistanceKm = round1(segments.reduce((sum, segment) => sum + segment.distanceKm, 0));
  return { source: 'rules-v1', sourceLabel: '驾车规则估算', generatedAt: new Date().toISOString(), isRealtime: false, freshness: 'estimate', totalMinutes, totalDistanceKm, summary: `驾车估算共 ${segments.length} 段，约 ${totalMinutes} 分钟、${totalDistanceKm} 公里。`, segments, notices: ['当前未取得高德驾车路线，里程与时间仅为直线距离换算，不能替代导航。'] };
}

function fallbackTransportAdvice(choices: TransportChoice[], request: TransportPlanRequest): Omit<TransportComparison, 'options' | 'generatedAt'> {
  const transit = choices.find((choice) => choice.id === 'transit')!;
  const driving = choices.find((choice) => choice.id === 'driving')!;
  const preferTransit = request.strategy === 'economy' || request.strategy === 'subway-first' || request.strategy === 'fewest-transfers';
  const reliableTransit = transit.plan.freshness !== 'estimate';
  const reliableDriving = driving.plan.freshness !== 'estimate';
  const recommendedOptionId: TransportChoiceId = preferTransit && reliableTransit ? 'transit' : reliableDriving && (!reliableTransit || driving.plan.totalMinutes < transit.plan.totalMinutes * 0.78) ? 'driving' : 'transit';
  const selected = recommendedOptionId === 'driving' ? driving : transit;
  const reason = `${selected.label}预计 ${selected.plan.totalMinutes} 分钟、约 ${selected.plan.totalDistanceKm} 公里，较符合当前“${strategyLabel(request.strategy)}”偏好。`;
  const optionAnalyses = choices.map((choice) => ({ id: choice.id, summary: choice.plan.freshness === 'estimate' ? `${choice.label}当前缺少可核验线路，需先恢复高德查询。` : `${choice.label}约 ${choice.plan.totalMinutes} 分钟、${choice.plan.totalDistanceKm} 公里${choice.plan.totalFare === undefined ? '，费用待查询' : `，约 ¥${choice.plan.totalFare}`}。` }));
  return { recommendedOptionId, reason, cautions: ['千问分析暂不可用，当前推荐按高德返回值与偏好规则生成。'], optionAnalyses, analysisSource: 'rules' };
}

function strategyLabel(value: TransitStrategy) { return ({ recommended: '综合推荐', fastest: '时间短', economy: '最省钱', 'fewest-transfers': '少换乘', 'least-walking': '少步行', 'subway-first': '地铁优先' } as const)[value]; }
function round1(value: number) { return Math.round(value * 10) / 10; }

function sameDayPointPairs(points: TransportPlanRequest['points']) {
  return points.slice(0, -1).flatMap((point, index) => {
    const next = points[index + 1];
    return (point.day ?? 1) === (next.day ?? 1) ? [{ point, next }] : [];
  });
}

export function transportModeForLegs(legs: TransportLeg[]): TransportMode {
  if (legs.some((leg) => leg.mode === 'subway')) return '地铁';
  if (legs.some((leg) => leg.mode === 'bus')) return '公交';
  if (legs.some((leg) => leg.mode === 'railway')) return '铁路';
  if (legs.some((leg) => leg.mode === 'shuttle')) return '景区专线';
  if (legs.some((leg) => leg.mode === 'taxi')) return '网约车';
  return '步行';
}

function chooseMode(distanceKm: number, minutes: number, specialNeeds: TripRequest['specialNeeds']): TransportMode {
  if (distanceKm <= 1.8 && !specialNeeds.includes('行动不便')) return '步行';
  return '公共交通';
}
function instructionFor(mode: TransportMode, _minutes: number, _travelerType: TripRequest['travelerType']) { if (mode === '步行') return '步行时间为距离估算；具体道路与路口须等待高德动态查询。'; return '动态查询未返回可核验线路，因此不显示虚构的线路号、站名或票价；请刷新查询或前往高德地图复核。'; }
function shiftClock(value: string, delta: number) { const [hour, minute] = value.split(':').map(Number); const total = (((hour || 0) * 60 + (minute || 0) + delta) % 1440 + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) { const radius = 6371; const radians = (value: number) => value * Math.PI / 180; const dLat = radians(lat2 - lat1); const dLng = radians(lng2 - lng1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2; return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
