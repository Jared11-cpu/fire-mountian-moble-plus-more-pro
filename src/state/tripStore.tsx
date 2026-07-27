import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CityName } from '../data/mockData';
import {
  addDaysIso,
  budgetTotal,
  buildFoodRecommendations,
  buildSocialCopy,
  calculateTimeline,
  CITY_NAMES,
  comparePlans,
  daysBetween,
  defaultTripRequest,
  generateTripPlan,
  getSafeDianpingUrl,
  isIsoDate,
  INTERESTS,
  normalizeRequest,
  normalizePlanTimeline,
  parseTravelRequest,
  updatePlanDates,
  updateDestinationCity,
  type BudgetItem,
  type ParsedTag,
  type PlannedRoutePoint,
  type PersistedAppState,
  type TripPlan,
  type TripRequest,
} from '../domain/trip';
import { enrichTripPlanWithBackend, parseTravelRequestWithAi, type AiItinerarySchedule, type AiTravelRequest } from '../services/travelApi';
import type { JournalEntry, RoutePoint } from '../types/route';

const STORAGE_KEY = 'chuyou-app-state-v2';
const LEGACY_JOURNAL_KEY = 'chuyou-journal-entries';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type ToastTone = 'info' | 'success' | 'error';
export type ToastMessage = { id: number; message: string; tone: ToastTone } | null;

export type TripState = {
  request: TripRequest;
  plan: TripPlan | null;
  journalEntries: JournalEntry[];
  parsedTags: ParsedTag[];
  parseWarnings: string[];
  saveStatus: SaveStatus;
  toast: ToastMessage;
  isGenerating: boolean;
  isReplanning: boolean;
  replanSummary: string;
};

type Action =
  | { type: 'request'; request: TripRequest }
  | { type: 'parsed'; request: TripRequest; tags: ParsedTag[]; warnings: string[] }
  | { type: 'plan'; plan: TripPlan | null }
  | { type: 'journal'; entries: JournalEntry[] }
  | { type: 'save'; status: SaveStatus }
  | { type: 'toast'; toast: ToastMessage }
  | { type: 'generating'; value: boolean }
  | { type: 'replanning'; value: boolean }
  | { type: 'summary'; value: string }
  | { type: 'hydrate'; state: TripState };

function reducer(state: TripState, action: Action): TripState {
  switch (action.type) {
    case 'request': return { ...state, request: action.request };
    case 'parsed': return { ...state, request: action.request, parsedTags: action.tags, parseWarnings: action.warnings };
    case 'plan': return { ...state, plan: action.plan };
    case 'journal': return { ...state, journalEntries: action.entries };
    case 'save': return { ...state, saveStatus: action.status };
    case 'toast': return { ...state, toast: action.toast };
    case 'generating': return { ...state, isGenerating: action.value };
    case 'replanning': return { ...state, isReplanning: action.value };
    case 'summary': return { ...state, replanSummary: action.value };
    case 'hydrate': return action.state;
    default: return state;
  }
}

function readInitialState(): TripState {
  const fallbackRequest = defaultTripRequest();
  let persisted: PersistedAppState | null = null;
  try {
    persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as PersistedAppState | null;
  } catch {
    persisted = null;
  }
  let legacyEntries: JournalEntry[] = [];
  try {
    legacyEntries = JSON.parse(localStorage.getItem(LEGACY_JOURNAL_KEY) ?? '[]') as JournalEntry[];
  } catch {
    legacyEntries = [];
  }
  const request = persisted?.version === 2 ? normalizeRequest(persisted.request) : fallbackRequest;
  const storedFoods = persisted?.version === 2 && persisted.plan
    ? persisted.plan.foodRecommendations?.filter((food) => getSafeDianpingUrl(food.dianpingUrl)) ?? []
    : [];
  const persistedPlan = persisted?.version === 2 && persisted.plan
    ? normalizePlanTimeline({ ...persisted.plan, foodRecommendations: storedFoods.length ? storedFoods : buildFoodRecommendations(request) })
    : null;
  return {
    request,
    plan: persistedPlan,
    journalEntries: persisted?.version === 2 ? persisted.journalEntries : legacyEntries,
    parsedTags: [],
    parseWarnings: [],
    saveStatus: persisted ? 'saved' : 'idle',
    toast: null,
    isGenerating: false,
    isReplanning: false,
    replanSummary: '',
  };
}

type RequestPatch = Partial<TripRequest> & { startDate?: string; endDate?: string; days?: number };

type TripContextValue = TripState & {
  updateRequest: (patch: RequestPatch) => boolean;
  selectCity: (city: CityName) => void;
  parseText: (text?: string) => Promise<TripRequest>;
  generate: () => TripPlan;
  generateFromText: (text: string) => Promise<TripPlan>;
  replan: () => Promise<void>;
  setPlan: (plan: TripPlan | null) => void;
  patchPlan: (updater: (plan: TripPlan) => TripPlan) => void;
  updatePlanSettings: (patch: Partial<TripPlan['settings']>) => void;
  updateBudgetItems: (items: BudgetItem[]) => void;
  setBudgetTotal: (total: number) => void;
  setJournalEntries: (entries: JournalEntry[]) => void;
  resetPlan: () => void;
  notify: (message: string, tone?: ToastTone) => void;
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, readInitialState);
  const hydrated = useRef(false);
  const generationId = useRef(0);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now();
    dispatch({ type: 'toast', toast: { id, message, tone } });
    window.setTimeout(() => dispatch({ type: 'toast', toast: null }), 3200);
  }, []);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    dispatch({ type: 'save', status: 'saving' });
    const timer = window.setTimeout(() => {
      try {
        const payload: PersistedAppState = { version: 2, request: state.request, plan: state.plan, journalEntries: state.journalEntries };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        localStorage.removeItem(LEGACY_JOURNAL_KEY);
        dispatch({ type: 'save', status: 'saved' });
      } catch {
        dispatch({ type: 'save', status: 'error' });
        notify('保存失败，请检查浏览器存储空间。', 'error');
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [state.request, state.plan, state.journalEntries, notify]);

  const updateRequest = useCallback((patch: RequestPatch) => {
    let next = { ...state.request, ...patch } as TripRequest;
    if (patch.startDate !== undefined) {
      if (!isIsoDate(patch.startDate)) { notify('开始日期无效，请重新选择。', 'error'); return false; }
      next.endDate = addDaysIso(patch.startDate, next.days - 1);
    } else if (patch.endDate !== undefined) {
      if (!isIsoDate(patch.endDate) || patch.endDate < next.startDate) { notify('结束日期不能早于开始日期。', 'error'); return false; }
      next.days = Math.min(15, Math.max(1, daysBetween(next.startDate, patch.endDate)));
    } else if (patch.days !== undefined) {
      next.days = Math.min(15, Math.max(1, Math.round(Number(patch.days) || 1)));
      next.endDate = addDaysIso(next.startDate, next.days - 1);
    }
    next = normalizeRequest(next);
    dispatch({ type: 'request', request: next });
    if (state.plan) dispatch({ type: 'plan', plan: updatePlanDates(state.plan, next) });
    return true;
  }, [notify, state.plan, state.request]);

  const selectCity = useCallback((city: CityName) => {
    const next = defaultTripRequest(city);
    dispatch({ type: 'request', request: { ...next, startDate: state.request.startDate, endDate: addDaysIso(state.request.startDate, next.days - 1) } });
    notify(`已将统一目的地更新为${city}`, 'success');
  }, [notify, state.request.startDate]);

  const parseText = useCallback(async (text = state.request.freeText) => {
    const local = parseTravelRequest(text, state.request);
    try {
      const ai = await parseTravelRequestWithAi(text);
      const result = mergeAiTravelRequest(local, ai, text);
      dispatch({ type: 'parsed', request: result.request, tags: result.tags, warnings: result.warnings });
      notify(`千问已识别 ${result.tags.length} 项，请确认后生成。`, 'success');
      return result.request;
    } catch {
      dispatch({ type: 'parsed', request: local.request, tags: local.tags, warnings: [...local.warnings, 'AI 服务暂不可用，已使用本地规则识别。'] });
      notify(local.tags.length ? `已按本地规则识别 ${local.tags.length} 项。` : '未识别到新条件，请在表单中补充。', local.tags.length ? 'info' : 'error');
      return local.request;
    }
  }, [notify, state.request]);

  const generateForRequest = useCallback((request: TripRequest) => {
    const plan = generateTripPlan(request, state.plan);
    dispatch({ type: 'plan', plan });
    return plan;
  }, [state.plan]);

  const generate = useCallback(() => generateForRequest(state.request), [generateForRequest, state.request]);

  const generateFromText = useCallback(async (text: string) => {
    const currentGeneration = ++generationId.current;
    dispatch({ type: 'generating', value: true });
    dispatch({ type: 'summary', value: '正在识别个性化要求，并让千问从高德真实地点中生成最终方案…' });
    try {
      const request = await parseText(text);
      const draft = generateTripPlan(request, state.plan);
      const enrichment = await enrichTripPlanWithBackend(draft, request);
      if (!enrichment.analysis || !enrichment.routePoints?.length) {
        throw new Error('真实地点或 AI 分析未完整返回，请稍后重试。');
      }
      const finalPlan = applyEnrichment(draft, enrichment);
      if (currentGeneration !== generationId.current) return finalPlan;
      dispatch({ type: 'plan', plan: finalPlan });
      dispatch({ type: 'summary', value: '已一次性生成千问分析、高德真实个性化地点与餐厅推荐。' });
      notify('AI 个性化方案已生成', 'success');
      return finalPlan;
    } catch (error) {
      if (currentGeneration === generationId.current) {
        dispatch({ type: 'summary', value: '真实 AI 分析暂未完整返回，未展示规则生成的占位方案。' });
        notify(error instanceof Error ? error.message : 'AI 个性化方案生成失败，请稍后重试。', 'error');
      }
      throw error;
    } finally {
      if (currentGeneration === generationId.current) dispatch({ type: 'generating', value: false });
    }
  }, [notify, parseText, state.plan]);

  const replan = useCallback(async () => {
    if (state.isReplanning || !state.plan) return;
    const currentGeneration = ++generationId.current;
    dispatch({ type: 'replanning', value: true });
    dispatch({ type: 'summary', value: '正在重新查询真实地点并生成最终 AI 分析…' });
    try {
      const draft = generateTripPlan(state.request, state.plan);
      const difference = comparePlans(state.plan, draft);
      const enrichment = await enrichTripPlanWithBackend(draft, state.request);
      if (!enrichment.analysis || !enrichment.routePoints?.length) throw new Error('真实地点或 AI 分析未完整返回，请稍后重试。');
      const finalPlan = applyEnrichment(draft, enrichment);
      if (currentGeneration !== generationId.current) return;
      dispatch({ type: 'plan', plan: finalPlan });
      dispatch({ type: 'summary', value: `${difference.message} 已加载最终千问分析与高德真实地点。` });
      notify(difference.message, difference.changed ? 'success' : 'info');
    } catch (error) {
      if (currentGeneration === generationId.current) {
        dispatch({ type: 'summary', value: '重新分析未完整返回，已保留上一次真实方案。' });
        notify(error instanceof Error ? error.message : '重新分析失败，请稍后重试。', 'error');
      }
    } finally {
      if (currentGeneration === generationId.current) dispatch({ type: 'replanning', value: false });
    }
  }, [notify, state.isReplanning, state.plan, state.request]);

  const setPlan = useCallback((plan: TripPlan | null) => dispatch({ type: 'plan', plan }), []);
  const patchPlan = useCallback((updater: (plan: TripPlan) => TripPlan) => {
    if (!state.plan) return;
    dispatch({ type: 'plan', plan: { ...updater(state.plan), updatedAt: new Date().toISOString() } });
  }, [state.plan]);
  const updatePlanSettings = useCallback((patch: Partial<TripPlan['settings']>) => patchPlan((plan) => {
    const settings = { ...plan.settings, ...patch };
    let sourcePoints = plan.route.points.slice(0, settings.targetPointCount) as PlannedRoutePoint[];
    if (patch.targetDurationMinutes !== undefined && sourcePoints.length) {
      const travelTotal = sourcePoints.reduce((sum, point) => sum + point.travelMinutesToNext, 0);
      const currentStayTotal = sourcePoints.reduce((sum, point) => sum + point.durationMinutes, 0);
      const desiredStayTotal = Math.max(sourcePoints.length * 10, patch.targetDurationMinutes - travelTotal);
      const scale = currentStayTotal > 0 ? desiredStayTotal / currentStayTotal : 1;
      sourcePoints = sourcePoints.map((point) => {
        const durationMinutes = Math.max(10, Math.round(point.durationMinutes * scale));
        return { ...point, durationMinutes, stayMinutes: durationMinutes };
      });
    }
    const routePoints = calculateTimeline(sourcePoints, settings.departureTime);
    const actualDuration = routePoints.reduce((sum, point) => sum + point.durationMinutes + point.travelMinutesToNext, 0);
    return { ...plan, settings: { ...settings, targetPointCount: routePoints.length, targetDurationMinutes: actualDuration }, route: { ...plan.route, points: routePoints } };
  }), [patchPlan]);
  const updateBudgetItems = useCallback((items: BudgetItem[]) => {
    if (state.plan) dispatch({ type: 'plan', plan: { ...state.plan, budgetItems: items, updatedAt: new Date().toISOString() } });
  }, [state.plan]);
  const setBudgetTotal = useCallback((value: number) => {
    const total = Math.max(0, Math.round(Number(value) || 0));
    const request = { ...state.request, budget: total };
    dispatch({ type: 'request', request });
    if (state.plan) dispatch({ type: 'plan', plan: syncPlanTargetBudget(state.plan, request) });
  }, [state.plan, state.request]);
  const setJournalEntries = useCallback((entries: JournalEntry[]) => dispatch({ type: 'journal', entries }), []);
  const resetPlan = useCallback(() => {
    const next = defaultTripRequest();
    dispatch({ type: 'parsed', request: next, tags: [], warnings: [] });
    dispatch({ type: 'plan', plan: null });
    dispatch({ type: 'summary', value: '' });
    notify('方案已重置，真实手账和照片已保留。', 'success');
  }, [notify]);

  const value = useMemo<TripContextValue>(() => ({ ...state, updateRequest, selectCity, parseText, generate, generateFromText, replan, setPlan, patchPlan, updatePlanSettings, updateBudgetItems, setBudgetTotal, setJournalEntries, resetPlan, notify }), [generate, generateFromText, notify, parseText, patchPlan, replan, resetPlan, selectCity, setBudgetTotal, setJournalEntries, setPlan, state, updateBudgetItems, updatePlanSettings, updateRequest]);

  return <TripContext.Provider value={value}>{children}<GlobalStatus state={state} /></TripContext.Provider>;
}

function syncPlanTargetBudget(plan: TripPlan, request: TripRequest): TripPlan {
  const previousBudget = plan.requestSnapshot.budget;
  const total = request.budget;
  const replaceBudget = (text: string) => text.replace(new RegExp(`${previousBudget}\\s*元`, 'g'), `${total}元`);
  return {
    ...plan,
    updatedAt: new Date().toISOString(),
    requestSnapshot: request,
    content: {
      ...plan.content,
      title: replaceBudget(plan.content.title),
      summary: replaceBudget(plan.content.summary),
      socialCopy: buildSocialCopy(request),
      videoScript: plan.content.videoScript.map(replaceBudget),
    },
    route: {
      ...plan.route,
      title: replaceBudget(plan.route.title),
      sceneryAnalysis: { ...plan.route.sceneryAnalysis, socialCopy: buildSocialCopy(request) },
    },
  };
}

function applyPersonalizedRoute(plan: TripPlan, recommended: RoutePoint[]): TripPlan {
  const start = plan.route.startPoint;
  const uniqueRecommended = recommended.filter((point, index, rows) => point.id !== start.id && rows.findIndex((candidate) => candidate.id === point.id) === index);
  const source = [start, ...uniqueRecommended].map((point, index) => ({ ...point, day: index === 0 ? 1 : Math.min(plan.requestSnapshot.days, Math.ceil(index / Math.max(1, Math.ceil(uniqueRecommended.length / plan.requestSnapshot.days)))) }));
  const points = calculateTimeline(source, plan.settings.departureTime);
  const required = plan.requestSnapshot.requestedPlaces;
  return {
    ...plan,
    generationSource: 'qwen-amap',
    route: {
      ...plan.route,
      points,
      title: required.length ? `${plan.requestSnapshot.destinationCity}个性化路线｜必经 ${required.join('、')}` : `${plan.requestSnapshot.destinationCity} AI 个性化路线`,
      transportSuggestion: `${plan.route.transportSuggestion} 地点由高德实时检索，千问按本次首页需求排序。`,
    },
    settings: { ...plan.settings, targetPointCount: points.length, targetDurationMinutes: points.reduce((sum, point) => sum + point.durationMinutes + point.travelMinutesToNext, 0) },
  };
}

function applyEnrichment(plan: TripPlan, enrichment: Awaited<ReturnType<typeof enrichTripPlanWithBackend>>): TripPlan {
  const personalized = enrichment.routePoints?.length ? applyPersonalizedRoute(plan, enrichment.routePoints) : plan;
  const safelyScheduled = enrichment.schedule ? applyAiSchedule(personalized, enrichment.schedule) : personalized;
  return {
    ...safelyScheduled,
    updatedAt: new Date().toISOString(),
    content: enrichment.analysis ? { ...safelyScheduled.content, summary: enrichment.analysis } : safelyScheduled.content,
    foodRecommendations: enrichment.foods ?? safelyScheduled.foodRecommendations,
  };
}

function applyAiSchedule(plan: TripPlan, schedule: AiItinerarySchedule): TripPlan {
  const departureMinutes = safeScheduleMinutes(schedule.departureTime);
  if (departureMinutes === null || departureMinutes < 7 * 60 + 15 || departureMinutes > 10 * 60 + 30) return plan;
  const points = plan.route.points as PlannedRoutePoint[];
  const itemById = new Map(schedule.items.map((item) => [item.id, item]));
  if (itemById.size !== points.length || points.some((point) => !itemById.has(point.id))) return plan;
  const scheduled = points.map((point) => {
    const item = itemById.get(point.id)!;
    const minutes = safeScheduleMinutes(item.arrivalTime);
    if (item.day !== (point.day ?? 1) || minutes === null || minutes < 7 * 60 + 30 || minutes > 21 * 60 + 30) return null;
    return { ...point, time: item.arrivalTime, arrivalTime: item.arrivalTime };
  });
  if (scheduled.some((point) => point === null)) return plan;
  const verified = scheduled as PlannedRoutePoint[];
  for (let index = 0; index < verified.length - 1; index += 1) {
    const current = verified[index];
    const next = verified[index + 1];
    if ((current.day ?? 1) !== (next.day ?? 1)) continue;
    const minimumNextArrival = safeScheduleMinutes(current.arrivalTime)! + current.durationMinutes + current.travelMinutesToNext;
    if (safeScheduleMinutes(next.arrivalTime)! < minimumNextArrival) return plan;
  }
  return {
    ...plan,
    route: { ...plan.route, points: verified, recommendedStartTime: schedule.departureTime },
    settings: { ...plan.settings, departureTime: schedule.departureTime },
  };
}

function safeScheduleMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function GlobalStatus({ state }: { state: TripState }) {
  return (
    <>
      <div className="fixed bottom-4 left-4 z-[70] rounded-full border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-ink/65 shadow-soft backdrop-blur" aria-live="polite">
        {state.saveStatus === 'saving' ? '保存中…' : state.saveStatus === 'saved' ? '已保存' : state.saveStatus === 'error' ? '保存失败' : '尚未保存'}
      </div>
      <div className="app-toast-region pointer-events-none fixed inset-x-4 top-24 z-[80] flex justify-center" aria-live="polite" aria-atomic="true">
        {state.toast && <div className={`max-w-lg rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-soft ${state.toast.tone === 'error' ? 'bg-red-600' : state.toast.tone === 'success' ? 'bg-jade' : 'bg-ink'}`}>{state.toast.message}</div>}
      </div>
    </>
  );
}

export function useTrip() {
  const value = useContext(TripContext);
  if (!value) throw new Error('useTrip 必须在 TripProvider 内使用');
  return value;
}

export { STORAGE_KEY };

function mergeAiTravelRequest(local: ReturnType<typeof parseTravelRequest>, ai: AiTravelRequest, text: string) {
  const request = { ...local.request, freeText: text };
  const tags = [...local.tags];
  const warnings = [...local.warnings];
  const locallyDetectedCity = local.tags.find((tag) => tag.type === '城市' && CITY_NAMES.includes(tag.value as CityName))?.value as CityName | undefined;
  if (locallyDetectedCity) {
    if (ai.city && ai.city !== locallyDetectedCity) warnings.push(`AI 返回城市“${ai.city}”与原文识别的“${locallyDetectedCity}”不一致，已按原文保留。`);
  } else if (ai.city && CITY_NAMES.includes(ai.city as CityName)) {
    Object.assign(request, updateDestinationCity(request, ai.city as CityName));
    tags.push({ type: '城市', value: ai.city });
  } else if (ai.city) warnings.push(`当前页面暂只支持湖北演示城市，未自动切换到“${ai.city}”。`);
  if (ai.days) { request.days = Math.min(15, Math.max(1, Math.round(ai.days))); request.endDate = addDaysIso(request.startDate, request.days - 1); tags.push({ type: '天数', value: `${request.days}天` }); }
  if (ai.budgetPerPerson !== null) { request.budget = Math.max(0, Math.round(ai.budgetPerPerson)); tags.push({ type: '预算', value: `${request.budget}元` }); }
  const interests = ai.interests.filter((item): item is TripRequest['interests'][number] => INTERESTS.includes(item as TripRequest['interests'][number]));
  if (interests.length) { request.interests = [...new Set([...request.interests, ...interests])]; interests.forEach((item) => tags.push({ type: '兴趣', value: item })); }
  const dietaryRestrictions = new Set<TripRequest['dietaryRestrictions'][number]>(request.dietaryRestrictions);
  if (ai.dietaryNeeds.some((item) => /不辣|少辣/.test(item))) dietaryRestrictions.add('不吃辣');
  if (ai.dietaryNeeds.some((item) => /素食|吃素/.test(item))) dietaryRestrictions.add('素食');
  request.dietaryRestrictions = [...dietaryRestrictions];
  const specialNeeds = new Set<TripRequest['specialNeeds'][number]>(request.specialNeeds);
  if (/少走|行动不便|无障碍/.test(ai.mobility || '')) specialNeeds.add('行动不便');
  request.specialNeeds = [...specialNeeds];
  request.requestedPlaces = [...new Set([...request.requestedPlaces, ...(ai.requestedPlaces ?? [])])].slice(0, 10);
  request.avoidPlaces = [...new Set([...request.avoidPlaces, ...(ai.avoidPlaces ?? [])])].slice(0, 10);
  request.requestedPlaces.forEach((item) => tags.push({ type: '必经地点', value: item }));
  request.avoidPlaces.forEach((item) => tags.push({ type: '避开地点', value: item }));
  const uniqueTags = tags.filter((tag, index) => tags.findIndex((candidate) => candidate.type === tag.type && candidate.value === tag.value) === index);
  return { request: normalizeRequest(request), tags: uniqueTags, warnings: [...new Set(warnings)] };
}

