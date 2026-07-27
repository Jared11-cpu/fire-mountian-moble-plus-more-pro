import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, ArrowLeft, Bus, CalendarDays, CarFront, Check, ChevronDown, ChevronUp, CircleDollarSign, Clock3, CloudRain, CloudSun, Droplets, ExternalLink, Footprints, ImagePlus, Loader2, MapPin, Navigation, PencilLine, Plus, ReceiptText, RefreshCw, Route as RouteIcon, Sparkles, Sun, Sunrise, Sunset, TrainFront, Trash2, Umbrella, Utensils, Wind } from 'lucide-react';
import type { TravelPlan } from '../utils/aiGenerator';
import type { JournalEntry, RoutePoint, SmartRoute } from '../types/route';
import { budgetTotal, getSafeDianpingUrl, getVerifiedDianpingShopUrl, parseLocalDate, recalculateDailyTimeline, type BudgetItem, type FoodRecommendation, type PlannedRoutePoint, type TripRequest } from '../domain/trip';
import { useTrip } from '../state/tripStore';
import { resolveTransportComparison, toTransportPlanRequest, type TransportChoice, type TransportChoiceId, type TransportComparison, type TransportLeg, type TransportSegment, type TransitStrategy, type TransportMode } from '../services/transportService';
import { recommendRestaurantsForRoute } from '../services/travelApi';
import { compressPhoto, deletePhoto, savePhoto } from '../services/journalStorage';
import { fetchPointCover, getCuratedPointCover, type PointCover } from '../services/pointImageService';
import { getFocusedTransportPath, RouteMap } from './RouteMap';

type Tab = 'overview' | 'stops' | 'days' | 'weather' | 'transport' | 'food' | 'budget';
type MobileSheetStop = 'peek' | 'half' | 'full';
const tabs: Array<{ id: Tab; label: string; icon: typeof MapPin }> = [
  { id: 'overview', label: '概览', icon: Sparkles }, { id: 'stops', label: '路线', icon: MapPin },
  { id: 'days', label: '行程记录', icon: CalendarDays }, { id: 'weather', label: '天气', icon: CloudSun },
  { id: 'transport', label: '交通', icon: Bus }, { id: 'food', label: '美食', icon: Utensils },
  { id: 'budget', label: '预算', icon: CircleDollarSign },
];
const mobileSheetHeights: Record<MobileSheetStop, number> = { peek: 64, half: 42, full: 20 };

export function getMobileSheetSnap(mapHeightPercent: number): MobileSheetStop {
  return (Object.entries(mobileSheetHeights) as Array<[MobileSheetStop, number]>)
    .reduce((closest, candidate) => Math.abs(candidate[1] - mapHeightPercent) < Math.abs(closest[1] - mapHeightPercent) ? candidate : closest)[0];
}

export function MapWorkspace({ route, plan, selectedPointId, activePointIndex, navigating, imageUrl, onSelectPoint, onRegenerate, onSimulateNavigation }: {
  route: SmartRoute; plan: TravelPlan; selectedPointId?: string; activePointIndex: number; navigating: boolean; imageUrl: string;
  onSelectPoint: (point: RoutePoint) => void; onRegenerate?: () => void; onSimulateNavigation?: () => void;
}) {
  const { plan: tripPlan, request, journalEntries, isReplanning, patchPlan, updatePlanSettings, updateBudgetItems, setBudgetTotal, setJournalEntries, updateRequest, notify } = useTrip();
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileSheetStop, setMobileSheetStop] = useState<MobileSheetStop>('peek');
  const [mobileMapHeight, setMobileMapHeight] = useState(mobileSheetHeights.peek);
  const mobileWorkspaceRef = useRef<HTMLDivElement>(null);
  const mobileDragRef = useRef<{ pointerId: number; startY: number; startHeight: number; currentHeight: number; moved: boolean } | null>(null);
  const ignoreNextSheetClickRef = useRef(false);
  const [transportComparison, setTransportComparison] = useState<TransportComparison | null>(null);
  const [transportChoiceId, setTransportChoiceId] = useState<TransportChoiceId>('transit');
  const [focusedTransportSegmentId, setFocusedTransportSegmentId] = useState<string | null>(null);
  const [transportLoading, setTransportLoading] = useState(true);
  const [transportStrategy, setTransportStrategy] = useState<TransitStrategy>('recommended');
  const transportPlan = transportComparison?.options.find((option) => option.id === transportChoiceId)?.plan ?? null;
  const loadTransport = useCallback((signal?: AbortSignal, silent = false) => {
    if (!silent) setTransportLoading(true);
    const routePoints = tripPlan?.route.points as PlannedRoutePoint[] ?? [];
    const customDepartureTime = tripPlan?.settings.transportDepartureTime;
    const transportPoints = customDepartureTime ? alignTransportDepartureTime(routePoints, customDepartureTime) : routePoints;
    return resolveTransportComparison(toTransportPlanRequest(request, transportPoints, customDepartureTime ?? tripPlan?.settings.departureTime ?? '08:30', transportStrategy), { signal })
      .then((result) => { setTransportComparison(result); setTransportChoiceId((current) => current === 'transit' ? 'transit' : result.recommendedOptionId); setFocusedTransportSegmentId(null); })
      .finally(() => { if (!signal?.aborted) setTransportLoading(false); });
  }, [request, tripPlan?.route.points, tripPlan?.settings.departureTime, tripPlan?.settings.transportDepartureTime, transportStrategy]);
  useEffect(() => {
    const controller = new AbortController();
    loadTransport(controller.signal).catch(() => undefined);
    const refreshTimer = window.setInterval(() => loadTransport(controller.signal, true).catch(() => undefined), 90_000);
    return () => { controller.abort(); window.clearInterval(refreshTimer); };
  }, [loadTransport]);
  const activeTabIndex = tabs.findIndex((item) => item.id === tab);
  const snapMobileSheet = useCallback((stop: MobileSheetStop) => {
    setMobileSheetStop(stop);
    setMobileMapHeight(mobileSheetHeights[stop]);
  }, []);
  const openMobileTab = (nextTab: Tab) => {
    setTab(nextTab);
    if (mobileMapHeight > mobileSheetHeights.half) snapMobileSheet('half');
  };
  const handleMapSelect = (point: RoutePoint) => { onSelectPoint(point); setTab('stops'); snapMobileSheet('half'); };
  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const workspaceHeight = mobileWorkspaceRef.current?.getBoundingClientRect().height ?? window.innerHeight;
    mobileDragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: mobileMapHeight, currentHeight: mobileMapHeight, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.workspaceHeight = String(workspaceHeight);
  };
  const handleSheetPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = mobileDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
    const workspaceHeight = Number(event.currentTarget.dataset.workspaceHeight) || window.innerHeight;
    const deltaPercent = ((event.clientY - drag.startY) / Math.max(1, workspaceHeight)) * 100;
    drag.currentHeight = Math.min(68, Math.max(18, drag.startHeight + deltaPercent));
    setMobileMapHeight(drag.currentHeight);
  };
  const handleSheetPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (mobileDragRef.current?.pointerId !== event.pointerId) return;
    const drag = mobileDragRef.current;
    ignoreNextSheetClickRef.current = drag.moved;
    mobileDragRef.current = null;
    snapMobileSheet(getMobileSheetSnap(drag.currentHeight));
  };
  const cycleMobileSheet = () => {
    if (ignoreNextSheetClickRef.current) {
      ignoreNextSheetClickRef.current = false;
      return;
    }
    snapMobileSheet(mobileSheetStop === 'peek' ? 'half' : mobileSheetStop === 'half' ? 'full' : 'peek');
  };
  const patchRoutePoint = (id: string, changes: Partial<PlannedRoutePoint>) => patchPlan((value) => {
    const source: PlannedRoutePoint[] = (value.route.points as PlannedRoutePoint[]).map((point) => point.id === id ? { ...point, ...changes } as PlannedRoutePoint : point);
    const points = changes.durationMinutes === undefined && changes.travelMinutesToNext === undefined
      ? source
      : recalculateEditableTimeline(source, value.settings.departureTime);
    return {
      ...value,
      route: { ...value.route, points },
      settings: {
        ...value.settings,
        targetDurationMinutes: points.reduce((sum, point) => sum + point.durationMinutes + point.travelMinutesToNext, 0),
      },
    };
  });
  const updateRouteDistance = (totalDistanceKm: number) => patchPlan((value) => ({
    ...value,
    route: { ...value.route, totalDistanceKm },
  }));
  if (!tripPlan) return null;

  return <section className="map-workspace overflow-hidden rounded-[2rem] border border-ink/10 bg-white shadow-soft">
    <div className="mobile-module-bar lg:hidden" role="tablist" aria-label="行程功能模块">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-label={label} onClick={() => openMobileTab(id)} className={tab === id ? 'is-active' : ''}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </div>
    <div ref={mobileWorkspaceRef} className="mobile-workspace-grid lg:grid lg:h-[calc(100vh-210px)] lg:min-h-[700px] lg:grid-cols-[72px_minmax(0,1fr)_420px]" style={{ '--mobile-map-height': `${mobileMapHeight}%` } as CSSProperties}>
      <nav className="workspace-tab-shell hidden overflow-x-auto p-2 text-white lg:flex lg:items-center lg:overflow-visible" aria-label="方案详情标签" role="tablist">
        <div className="workspace-tab-track">
          <span aria-hidden="true" className="workspace-tab-indicator" style={{ '--tab-index': activeTabIndex } as CSSProperties} />
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-label={label} onClick={() => setTab(id)} className={`workspace-tab-button ${tab === id ? 'is-active' : ''}`}><Icon className="h-5 w-5" /><span>{label}</span></button>)}
        </div>
      </nav>

      <div role="region" aria-label="路线地图" className="mobile-map-pane relative min-w-0 overflow-hidden border-ink/10 lg:block lg:min-h-[620px] lg:border-r">
        <div className="absolute left-4 top-4 z-20 flex flex-wrap gap-2">
          <CommandButton icon={isReplanning ? Loader2 : RefreshCw} label={isReplanning ? '计算中' : '重新规划'} disabled={isReplanning} onClick={onRegenerate} spin={isReplanning} />
        </div>
        <RouteMap route={route} transportPlan={transportPlan} focusedTransportSegmentId={focusedTransportSegmentId} selectedPointId={selectedPointId} activePointIndex={activePointIndex} navigating={navigating} onSelectPoint={handleMapSelect} mapOnly />
      </div>

      <aside aria-label="方案详情" className="workspace-detail-glass mobile-detail-sheet flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="mobile-sheet-heading lg:hidden">
          <button type="button" className="mobile-sheet-grabber" aria-label={`${mobileSheetStop === 'full' ? '收起' : '展开'}${tabs[activeTabIndex]?.label ?? '行程'}详情`} onClick={cycleMobileSheet} onPointerDown={handleSheetPointerDown} onPointerMove={handleSheetPointerMove} onPointerUp={handleSheetPointerEnd} onPointerCancel={handleSheetPointerEnd}>
            <span aria-hidden="true" className="mobile-sheet-grip" />
            <span><strong>{tabs[activeTabIndex]?.label}</strong><small>{mobileSheetStop === 'peek' ? '上滑查看详细信息' : mobileSheetStop === 'half' ? '继续上滑展开全部' : '下滑返回地图'}</small></span>
            {mobileSheetStop === 'full' ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
        </div>
        <div className="mobile-detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable]">
          {tab === 'overview' && <Overview plan={tripPlan} route={route} summary={plan.summary} onSettings={updatePlanSettings} onBudget={setBudgetTotal} onDistance={updateRouteDistance} onDate={(startDate) => updateRequest({ startDate })} />}
          {tab === 'stops' && <Stops points={route.points as PlannedRoutePoint[]} selectedId={selectedPointId} fallbackImageUrl={imageUrl} dailyRecords={tripPlan.dailyRecords} maxDays={request.days} onSelect={onSelectPoint} onPatchPoint={patchRoutePoint} onPatchNote={(id, note) => patchPlan((value) => ({ ...value, pointNotes: { ...value.pointNotes, [id]: note } }))} notes={tripPlan.pointNotes} />}
          {tab === 'days' && <Days plan={tripPlan} entries={journalEntries} onPatch={patchPlan} onEntries={setJournalEntries} onNotify={notify} />}
          {tab === 'weather' && <Weather request={request} lat={route.points[0]?.lat} lng={route.points[0]?.lng} />}
          {tab === 'transport' && <Transport comparison={transportComparison} selectedId={transportChoiceId} focusedSegmentId={focusedTransportSegmentId} loading={transportLoading} strategy={transportStrategy} departureTime={tripPlan.settings.transportDepartureTime ?? transportPlan?.segments[0]?.departureTime ?? tripPlan.settings.departureTime} onDepartureTime={(departureTime) => { updatePlanSettings({ transportDepartureTime: departureTime }); notify(`已将首段出发时间改为 ${departureTime}，正在重新计算到达时间。`, 'success'); }} onSelect={(id) => { setTransportChoiceId(id); setFocusedTransportSegmentId(null); }} onFocusSegment={setFocusedTransportSegmentId} onStrategy={(nextStrategy) => { setTransportChoiceId('transit'); setFocusedTransportSegmentId(null); setTransportStrategy(nextStrategy); }} onReload={() => loadTransport().catch(() => undefined)} onSimulate={onSimulateNavigation} />}
          {tab === 'food' && <Food plan={tripPlan} />}
          {tab === 'budget' && <Budget items={tripPlan.budgetItems} target={request.budget} days={request.days} onChange={updateBudgetItems} />}
        </div>
      </aside>
    </div>
  </section>;
}

function Overview({ plan, route, summary, onSettings, onBudget, onDistance, onDate }: { plan: NonNullable<ReturnType<typeof useTrip>['plan']>; route: SmartRoute; summary: string; onSettings: ReturnType<typeof useTrip>['updatePlanSettings']; onBudget: (total: number) => void; onDistance: (distance: number) => void; onDate: (date: string) => void }) {
  const finalPoint = plan.route.points[plan.route.points.length - 1] as PlannedRoutePoint | undefined;
  return <div className="space-y-4">
    <section className="workspace-dark-glass rounded-[1.65rem] p-5 text-white"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-jade">已保存方案 · 自动同步</div><h3 className="mt-2 font-display text-2xl font-black leading-tight">{route.title}</h3><p className="mt-3 text-sm leading-6 text-white/65">{summary}</p></section>
    <div><h4 className="font-display text-2xl font-black">路线总览</h4><p className="mt-1 text-xs font-bold text-ink/45">点击卡片中的数字或日期即可直接修改</p></div>
    <div className="grid grid-cols-2 gap-3">
      <EditableMetric label="点位" value={plan.settings.targetPointCount} min={2} max={plan.route.points.length} suffix="个" onCommit={(value) => onSettings({ targetPointCount: value })} />
      <EditableMetric label="预计时长" value={Math.round(plan.settings.targetDurationMinutes / 6) / 10} min={1} max={24} step={0.5} suffix="小时" onCommit={(value) => onSettings({ targetDurationMinutes: Math.round(value * 60) })} />
      <EditableMetric label="路线距离" value={plan.route.totalDistanceKm} min={0} max={99999} step={0.1} suffix="km" onCommit={onDistance} />
      <EditableMetric label="计划预算" value={plan.requestSnapshot.budget} min={0} max={999999} prefix="¥" onCommit={onBudget} />
      <TimeMetric label="出发时间" value={plan.settings.departureTime} tone="tower" min="07:15" max="10:30" onChange={(value) => onSettings({ departureTime: value })} />
      <TimeMetric label="到达时间" value={finalPoint?.arrivalTime ?? finalPoint?.time ?? ''} tone="river" readOnly />
      <p className="col-span-2 rounded-xl border border-river/10 bg-river/[0.045] px-3 py-2 text-[10px] font-bold leading-5 text-river">AI 后端按每天的点位、停留与交通耗时分析；前端再次执行 07:30—21:30 安全边界校验，异常结果自动回退。</p>
      <label className="col-span-2 rounded-2xl bg-white p-4 shadow-sm transition focus-within:ring-4 focus-within:ring-jade/15"><span className="block text-xs font-black text-ink/50">出发日期</span><span className="mt-2 flex items-center gap-2 rounded-xl bg-ink/[0.035] px-2.5 py-2"><CalendarDays className="h-4 w-4 shrink-0 text-river" /><input aria-label="总览出发日期" type="date" value={plan.requestSnapshot.startDate} onChange={(event) => onDate(event.target.value)} className="focus-ring min-w-0 w-full bg-transparent text-sm font-black text-ink" /></span></label>
    </div>
  </div>;
}

function Stops({ points, selectedId, fallbackImageUrl, dailyRecords, maxDays, onSelect, onPatchPoint, notes, onPatchNote }: { points: PlannedRoutePoint[]; selectedId?: string; fallbackImageUrl: string; dailyRecords: Array<{ day: number; date: string }>; maxDays: number; onSelect: (point: RoutePoint) => void; onPatchPoint: (id: string, changes: Partial<PlannedRoutePoint>) => void; notes: Record<string, string>; onPatchNote: (id: string, note: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(selectedId ?? points[0]?.id ?? null);
  const [fetchedCovers, setFetchedCovers] = useState<Record<string, PointCover>>({});
  const coverQueryKey = points.map((point) => `${point.id}:${point.name}:${point.city}:${point.imageUrl ?? ''}`).join('|');
  useEffect(() => { if (selectedId) setExpandedId(selectedId); }, [selectedId]);
  useEffect(() => {
    const controller = new AbortController();
    const unresolved = points.filter((point) => !getCuratedPointCover(point.name) && !point.imageUrl);
    if (unresolved.length) Promise.all(unresolved.map(async (point) => [point.id, await fetchPointCover(point.city, point.name, controller.signal, { lng: point.lng, lat: point.lat })] as const))
      .then((results) => setFetchedCovers((current) => ({ ...current, ...Object.fromEntries(results.filter((item): item is readonly [string, PointCover] => Boolean(item[1]))) })))
      .catch(() => undefined);
    return () => controller.abort();
  }, [coverQueryKey]);
  return <div className="space-y-4"><h4 className="font-display text-2xl font-black">地点安排</h4>{points.map((point, index) => { const expanded = expandedId === point.id; const date = dailyRecords.find((record) => record.day === (point.day ?? 1))?.date; const detailLinks = getPointDetailLinks(point, date); const resolvedCover = getCuratedPointCover(point.name) ?? fetchedCovers[point.id]; const coverUrl = resolvedCover?.imageUrl ?? point.imageUrl ?? fallbackImageUrl; return <article key={point.id} className={`overflow-hidden rounded-[1.65rem] border bg-white transition ${selectedId === point.id ? 'border-river shadow-[0_12px_35px_rgba(14,116,128,.14)]' : 'border-ink/10 shadow-sm'}`}>
      <button type="button" aria-expanded={expanded} onClick={() => { setExpandedId(expanded ? null : point.id); onSelect(point); }} className="group relative block h-36 w-full overflow-hidden text-left">
        <img src={coverUrl} alt={`${point.name}风景封面`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/20 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-ink backdrop-blur">{String(index + 1).padStart(2, '0')} · {point.type === 'start' ? '出发点' : '路线点'}</span>
        <span className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white"><span><strong className="block font-display text-xl font-black">{point.name}</strong><span className="mt-1 flex items-center gap-2 text-[11px] font-…20049 tokens truncated…-bold text-ink/58">{station}</span></div>)}</div>}</div>}
        <StationRow name={stations[stations.length - 1]} detail={`${endTime} 下车${leg.exit ? ` · ${leg.exit}出站` : ''}`} terminal theme={theme} />
      </div>
      {(leg.serviceStartTime || leg.serviceEndTime) && <p className="mt-3 border-t border-ink/8 pt-2 text-[8px] font-black text-ink/35">运营时间 {leg.serviceStartTime ?? '—'}–{leg.serviceEndTime ?? '—'}，出发前请再次核验</p>}
    </div> : <p className="border-t border-dashed border-ink/10 px-3.5 py-3 text-[10px] font-bold text-amber-700">高德暂未返回上下车站与途经站，不展示模拟站点。</p>}
  </section>;
}

function StationRow({ name, detail, terminal, theme }: { name: string; detail: string; terminal: boolean; theme: ReturnType<typeof transportLegTheme> }) {
  return <div className="relative py-2"><span className={`absolute -left-8 top-3 grid h-5 w-5 place-items-center rounded-full border-[3px] border-white shadow-sm ${terminal ? 'bg-tower' : theme.dot}`}>{terminal && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span><strong className="block text-[12px] font-black text-ink">{name}</strong><span className="mt-0.5 block text-[9px] font-bold text-ink/42">{detail}</span></div>;
}

function transportLegTheme(mode: TransportLeg['mode']) {
  if (mode === 'subway') return { badge: 'bg-tower', line: 'bg-tower', dot: 'bg-tower' };
  if (mode === 'railway') return { badge: 'bg-amber-500', line: 'bg-amber-500', dot: 'bg-amber-500' };
  if (mode === 'bus' || mode === 'shuttle') return { badge: 'bg-river', line: 'bg-river', dot: 'bg-river' };
  return { badge: 'bg-ink', line: 'bg-ink/35', dot: 'bg-ink/45' };
}

export function addTransportClock(value: string, deltaMinutes: number) { const [hour, minute] = value.split(':').map(Number); const total = (((hour || 0) * 60 + (minute || 0) + deltaMinutes) % 1440 + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function legIcon(mode: TransportLeg['mode']) { if (mode === 'walk') return <Footprints className="h-3.5 w-3.5" />; if (mode === 'subway' || mode === 'railway') return <TrainFront className="h-3.5 w-3.5" />; if (mode === 'taxi') return <CarFront className="h-3.5 w-3.5" />; return <Bus className="h-3.5 w-3.5" />; }
function transportIcon(mode: TransportMode) { if (mode === '步行') return <Footprints className="h-4 w-4" />; if (mode === '地铁' || mode === '铁路') return <TrainFront className="h-4 w-4" />; if (mode === '公交' || mode === '公共交通') return <Bus className="h-4 w-4" />; if (mode === '景区专线') return <RouteIcon className="h-4 w-4" />; return <CarFront className="h-4 w-4" />; }

export function getDianpingShopDetailUrl(value?: string) {
  return getVerifiedDianpingShopUrl(value);
}

function Food({ plan }: { plan: NonNullable<ReturnType<typeof useTrip>['plan']> }) {
  const { request, patchPlan, notify } = useTrip();
  const [refreshing, setRefreshing] = useState(false);
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false);
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const foods = await recommendRestaurantsForRoute(request, plan.route.points);
      patchPlan((value) => ({ ...value, foodRecommendations: foods }));
      notify(foods.length ? `已找到 ${foods.length} 家当前路线周边餐饮` : '当前路线周边暂未查到可用餐饮', foods.length ? 'success' : 'info');
    } catch {
      notify('路线周边餐饮查询暂不可用，请稍后重新刷新', 'info');
    } finally {
      setRefreshing(false);
    }
  }, [notify, patchPlan, plan.route.points, refreshing, request]);
  useEffect(() => {
    if (hasAutoRefreshed) return;
    setHasAutoRefreshed(true);
    void refresh();
  }, [hasAutoRefreshed, refresh]);
  return <div className="space-y-4"><div className="flex items-end justify-between gap-3"><div><h4 className="font-display text-2xl font-black">路线附近吃什么</h4><p className="mt-1 text-[11px] font-bold text-ink/45">逐站搜索 1.5 km 内真实餐饮 · 高德动态更新</p></div><button type="button" disabled={refreshing} onClick={() => void refresh()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-river/10 bg-white px-3.5 py-2.5 text-[11px] font-black text-river shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-55"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? '搜索沿线餐厅' : '重新搜附近'}</button></div>
    {refreshing && <div role="status" className="overflow-hidden rounded-[1.4rem] border border-river/10 bg-gradient-to-r from-river/[0.08] via-white to-jade/[0.09] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-river text-white"><Loader2 className="h-5 w-5 animate-spin" /></span><div><strong className="block text-sm font-black">正在扫描每一个路线点</strong><p className="mt-1 text-[10px] font-bold text-ink/45">搜索附近真实餐饮并按顺路程度整理</p></div></div></div>}
    {!refreshing && plan.foodRecommendations.length ? plan.foodRecommendations.map((food) => <FoodRecommendationCard key={food.id} food={food} />) : !refreshing && <p className="rounded-[1.4rem] border border-dashed border-ink/10 bg-white p-5 text-sm font-bold leading-6 text-ink/55">当前路线周边暂未查到可用餐饮。你可以点击“重新搜附近”再次获取，不会用固定示例店铺填充。</p>}</div>;
}

function FoodRecommendationCard({ food }: { food: FoodRecommendation }) {
  const detailUrl = getDianpingShopDetailUrl(food.dianpingUrl);
  const dianpingUrl = getSafeDianpingUrl(food.dianpingUrl);
  const dynamic = food.analysisSource === 'qwen-amap';
  return <article className="group overflow-hidden rounded-[1.65rem] border border-ink/[0.055] bg-white shadow-[0_12px_30px_rgba(18,34,42,.07)] transition hover:-translate-y-0.5 hover:border-river/15 hover:shadow-[0_18px_38px_rgba(18,34,42,.11)]"><div className="p-4">{food.nearestPointName && <div className="mb-3 flex items-center gap-2 text-[10px] font-black text-river"><span className="grid h-7 w-7 place-items-center rounded-xl bg-river/10"><MapPin className="h-3.5 w-3.5" /></span><span>靠近 {food.nearestPointName}</span>{food.distanceMeters !== undefined && <span className="rounded-full bg-river/[0.07] px-2 py-1">{formatFoodDistance(food.distanceMeters)}</span>}</div>}<div className="flex items-start justify-between gap-3"><div className="min-w-0"><h5 className="font-display text-lg font-black leading-snug">{food.name}</h5><p className="mt-1.5 text-xs font-bold leading-5 text-ink/55">{food.area}</p><strong className="mt-1 block text-xs font-black text-tower">{food.priceRange}</strong></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${dynamic ? 'bg-jade/10 text-jade' : 'bg-ink/5 text-ink/40'}`}>{dynamic ? '本次查询' : '待更新'}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{food.tags.map((tag) => <span key={tag} className="rounded-full bg-ink/[0.045] px-2.5 py-1 text-[10px] font-black text-ink/55">{tag}</span>)}</div>{food.aiInsight && <div className="mt-3 rounded-2xl border border-river/10 bg-gradient-to-br from-river/[0.07] to-jade/[0.055] p-3"><div className="flex items-center gap-2 text-[10px] font-black text-river"><Sparkles className="h-3.5 w-3.5" />为什么适合这条路线</div><p className="mt-1.5 text-[11px] font-bold leading-5 text-ink/65">{food.aiInsight}</p></div>}<p className="mt-3 text-[10px] font-bold text-tower">评分、价格与营业状态可能变化，出发前请在商户页核验</p></div><div className="border-t border-ink/6 bg-[#fffaf7] p-3">{dianpingUrl ? <a href={dianpingUrl} target="_blank" rel="noreferrer" aria-label={`${detailUrl ? '打开' : '在大众点评查找'}${food.name}${detailUrl ? '商户详情' : ''}`} className="flex min-h-11 w-full items-center justify-between rounded-2xl bg-[#fff0e9] px-3.5 py-3 text-xs font-black text-[#c94724] transition hover:bg-[#ffddd0]"><span>{detailUrl ? '大众点评 · 该店详情' : '大众点评 · 精确查找该店'}</span><ExternalLink className="h-4 w-4 transition group-hover:translate-x-0.5" /></a> : <span className="flex min-h-11 w-full items-center justify-between rounded-2xl bg-ink/5 px-3.5 py-3 text-xs font-black text-ink/35"><span>大众点评暂未收录可用入口</span><AlertTriangle className="h-4 w-4" /></span>}</div></article>;
}

function formatFoodDistance(meters: number) { return meters < 1000 ? `约 ${Math.max(10, Math.round(meters / 10) * 10)} m` : `约 ${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`; }

export function getBudgetUsageVisual(actual: number, planned: number) {
  const percent = planned > 0 ? Math.max(0, Math.round((actual / planned) * 100)) : actual > 0 ? 100 : 0;
  const clampedPercent = Math.min(100, percent);
  const colorPercent = Math.min(200, percent);
  const start = colorPercent <= 60
    ? { at: 0, hue: 152, saturation: 72, lightness: 36 }
    : colorPercent <= 80
      ? { at: 60, hue: 44, saturation: 82, lightness: 48 }
      : { at: 80, hue: 4, saturation: 76, lightness: 46 };
  const end = colorPercent <= 60
    ? { at: 60, hue: 44, saturation: 82, lightness: 48 }
    : colorPercent <= 80
      ? { at: 80, hue: 4, saturation: 76, lightness: 46 }
      : { at: 200, hue: -8, saturation: 78, lightness: 24 };
  const progress = (colorPercent - start.at) / Math.max(1, end.at - start.at);
  const hue = Math.round(start.hue + (end.hue - start.hue) * progress);
  const saturation = Math.round(start.saturation + (end.saturation - start.saturation) * progress);
  const lightness = Math.round(start.lightness + (end.lightness - start.lightness) * progress);
  const normalizedHue = (hue + 360) % 360;
  const color = `hsl(${normalizedHue} ${saturation}% ${lightness}%)`;
  return {
    percent,
    clampedPercent,
    fillPercent: clampedPercent,
    difference: planned - actual,
    color,
  };
}

function Budget({ items, target, days, onChange }: { items: BudgetItem[]; target: number; days: number; onChange: (items: BudgetItem[]) => void }) {
  const total = budgetTotal(items); const usage = getBudgetUsageVisual(total, target); const remaining = usage.difference;
  const updateItem = (id: string, changes: Partial<BudgetItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...changes } : item));
  return <div className="space-y-4"><div><h4 className="font-display text-2xl font-black">旅行预算</h4><p className="mt-1 text-xs font-bold text-ink/45">计划预算在概览修改；这里只记录实际支出。</p></div><section aria-label={`实际花费占计划预算 ${usage.percent}%`} className="relative overflow-hidden rounded-[1.9rem] bg-[#153943] p-5 text-white shadow-[0_22px_54px_rgba(18,34,42,.22)]"><div aria-hidden="true" className="absolute inset-y-0 left-0 transition-[width,background-color] duration-700 ease-out" style={{ width: `${usage.fillPercent}%`, backgroundColor: usage.color }} /><div className="relative grid grid-cols-2 gap-5"><BudgetAmount label="计划" value={target} /><BudgetAmount label="实际" value={total} align="right" /></div><div className="relative mt-7 flex items-end justify-between gap-4"><div><strong className="font-display text-[3.25rem] font-black leading-none tracking-[-0.05em]">{usage.percent}%</strong><span className="ml-2 text-xs font-black text-white/70">已花费</span></div><span className="rounded-full border border-white/15 bg-black/10 px-3 py-1.5 text-[10px] font-black backdrop-blur">{remaining >= 0 ? `剩余 ¥${remaining.toLocaleString('zh-CN')}` : `超出 ¥${Math.abs(remaining).toLocaleString('zh-CN')}`}</span></div><div className="relative mt-5 h-2 rounded-full bg-black/25"><div className="h-full rounded-full bg-white/90 transition-[width] duration-700" style={{ width: `${usage.fillPercent}%` }} />{usage.fillPercent > 0 && usage.fillPercent < 100 && <span aria-hidden="true" className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow-[0_2px_8px_rgba(0,0,0,.28)] transition-[left] duration-700" style={{ left: `${usage.fillPercent}%` }} />}</div><div className="relative mt-4 grid grid-cols-3 border-t border-white/15 pt-4"><BudgetFact label="剩余" value={`${remaining < 0 ? '-' : ''}¥${Math.abs(remaining).toLocaleString('zh-CN')}`} tone={remaining < 0 ? 'warn' : 'normal'} /><BudgetFact label="日均" value={`¥${Math.round(target / Math.max(1, days)).toLocaleString('zh-CN')}`} /><BudgetFact label="条目" value={`${items.length} 项`} /></div></section>
    <h5 className="font-display text-lg font-black">实际支出</h5>{items.map((item, index) => <BudgetRow key={item.id} item={item} index={index} onUpdate={(changes) => updateItem(item.id, changes)} onDelete={() => onChange(items.filter((value) => value.id !== item.id))} />)}<button type="button" onClick={() => onChange([...items, { id: `budget-${crypto.randomUUID()}`, item: '新支出', amount: 0, note: '' }])} className="group inline-flex w-full items-center justify-center gap-2 rounded-[1.4rem] border border-dashed border-river/35 bg-river/[0.035] px-4 py-4 font-black text-river transition hover:border-river hover:bg-river/10"><span className="grid h-7 w-7 place-items-center rounded-full bg-river text-white transition group-hover:rotate-90"><Plus className="h-4 w-4" /></span>新增支出</button></div>;
}

function BudgetAmount({ label, value, align = 'left' }: { label: string; value: number; align?: 'left' | 'right' }) { return <div className={align === 'right' ? 'text-right' : ''}><span className="block text-[10px] font-black tracking-[0.12em] text-white/60">{label}</span><strong className="mt-1 block font-display text-[2rem] font-black leading-none tracking-[-0.03em]">¥{value.toLocaleString('zh-CN')}</strong></div>; }
function BudgetFact({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warn' }) { return <div className="text-center first:text-left last:text-right"><span className="block text-[9px] font-black tracking-[0.08em] text-white/55">{label}</span><strong className={`mt-1 block font-display text-sm font-black ${tone === 'warn' ? 'text-orange-100' : 'text-white'}`}>{value}</strong></div>; }
function BudgetRow({ item, index, onUpdate, onDelete }: { item: BudgetItem; index: number; onUpdate: (changes: Partial<BudgetItem>) => void; onDelete: () => void }) {
  const [amountDraft, setAmountDraft] = useState(String(item.amount)); useEffect(() => setAmountDraft(String(item.amount)), [item.amount]);
  const commitAmount = () => { const amount = Math.max(0, Math.round(Number(amountDraft.replace(/[^\d.]/g, '')) || 0)); setAmountDraft(String(amount)); onUpdate({ amount }); };
  return <article className="rounded-[1.5rem] border border-ink/8 bg-white p-4 shadow-sm transition focus-within:border-river/30 focus-within:shadow-[0_12px_30px_rgba(14,107,114,.1)]"><div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${index % 3 === 0 ? 'bg-river/10 text-river' : index % 3 === 1 ? 'bg-tower/10 text-tower' : 'bg-jade/10 text-jade'}`}>{index % 2 === 0 ? <ReceiptText className="h-5 w-5" /> : <CircleDollarSign className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><label className="block text-[10px] font-black text-ink/40">支出项目<input aria-label={`支出项目${index + 1}`} value={item.item} onChange={(event) => onUpdate({ item: event.target.value })} className="focus-ring mt-1 w-full border-0 bg-transparent p-0 text-sm font-black text-ink" /></label><div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2"><label className="block text-[10px] font-black text-ink/40">实际金额<span className="mt-1 flex items-center rounded-xl border border-ink/10 bg-[#f7faf8] px-3 focus-within:border-river/35 focus-within:ring-4 focus-within:ring-jade/10"><span className="font-display text-lg font-black text-river">¥</span><input aria-label={`${item.item}金额`} type="text" inputMode="decimal" value={amountDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setAmountDraft(event.target.value.replace(/[^\d.]/g, ''))} onBlur={commitAmount} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="min-w-0 w-full border-0 bg-transparent px-2 py-2 font-display text-lg font-black outline-none" /></span></label><button type="button" aria-label={`删除${item.item}`} onClick={onDelete} className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-500 transition hover:bg-red-500 hover:text-white"><Trash2 className="h-4 w-4" /></button></div><label className="mt-3 block text-[10px] font-black text-ink/40">备注（可选）<input aria-label={`${item.item}备注`} value={item.note} placeholder="例如：打车、门票或餐饮" onChange={(event) => onUpdate({ note: event.target.value })} className="focus-ring mt-1 w-full rounded-xl border border-ink/8 bg-white px-3 py-2 text-xs font-medium text-ink placeholder:text-ink/25" /></label></div></div></article>;
}

function CommandButton({ icon: Icon, label, onClick, disabled, spin }: { icon: typeof RefreshCw; label: string; onClick?: () => void; disabled?: boolean; spin?: boolean }) { return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-black text-ink shadow-soft backdrop-blur disabled:opacity-60"><Icon className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} />{label}</button>; }
function TimeMetric({ label, value, tone, min, max, readOnly = false, onChange }: { label: string; value: string; tone: 'river' | 'tower'; min?: string; max?: string; readOnly?: boolean; onChange?: (value: string) => void }) {
  return <label className="rounded-2xl bg-white p-4 shadow-sm transition focus-within:ring-4 focus-within:ring-jade/15"><span className="block text-xs font-black text-ink/50">{label}{readOnly && <small className="ml-1.5 text-[9px] text-river">AI 安全排程</small>}</span><span className="mt-2 flex items-center gap-2"><Clock3 className={`h-4 w-4 shrink-0 ${tone === 'tower' ? 'text-tower' : 'text-river'}`} /><input aria-label={`总览${label}`} type="time" min={min} max={max} value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} className={`focus-ring min-w-0 w-full bg-transparent font-display text-xl font-black text-ink ${readOnly ? 'cursor-default' : ''}`} /></span></label>;
}
function EditableMetric({ label, value, min, max, step = 1, prefix = '', suffix = '', onCommit }: { label: string; value: number; min: number; max: number; step?: number; prefix?: string; suffix?: string; onCommit: (value: number) => void }) { const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]); const commit = () => { const parsed = Number(draft); const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value; setDraft(String(next)); onCommit(next); }; return <label className="rounded-2xl bg-white p-4 shadow-sm transition focus-within:ring-4 focus-within:ring-jade/15"><span className="block text-xs font-black text-ink/50">{label}</span><span className="mt-2 flex items-baseline gap-1 font-display text-xl font-black text-ink">{prefix && <span>{prefix}</span>}<input aria-label={`总览${label}`} type="number" min={min} max={max} step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="focus-ring min-w-0 w-full bg-transparent font-display text-xl font-black text-ink" />{suffix && <span className="shrink-0 text-sm">{suffix}</span>}</span></label>; }

