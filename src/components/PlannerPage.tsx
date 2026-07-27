import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, LocateFixed, Loader2, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { examples } from '../data/mockData';
import { cityShowcaseIndex, cityShowcaseItems } from '../data/cityShowcaseData';
import { DIETARY_RESTRICTIONS, INTERESTS, SPECIAL_NEEDS, TRAVELERS, type DietaryRestriction, type Interest, type SpecialNeed, type TravelerType } from '../domain/trip';
import { getBrowserLocation, resolveManualLocation } from '../services/locationService';
import type { RoutePoint } from '../types/route';
import { useTrip } from '../state/tripStore';
import { MapWorkspace } from './MapWorkspace';

export function PlannerPage() {
  const { request, plan, parsedTags, parseWarnings, isGenerating, isReplanning, updateRequest, parseText, generateFromText, replan, resetPlan, notify } = useTrip();
  const [resultMode, setResultMode] = useState(Boolean(plan));
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>(plan?.route.points[0]?.id);
  const [locating, setLocating] = useState(false);
  const [resolvingOrigin, setResolvingOrigin] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [originInput, setOriginInput] = useState(request.origin.name);
  const [confirmedOriginName, setConfirmedOriginName] = useState(request.origin.source === 'manual' ? '' : request.origin.name);
  const resultRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLElement>(null);
  const selectedCity = cityShowcaseItems[cityShowcaseIndex(request.destinationCity)];
  const originConfirmed = request.origin.source !== 'manual' ? originInput === request.origin.name : Boolean(confirmedOriginName) && confirmedOriginName === originInput && request.origin.name === originInput;

  useEffect(() => { if (plan) setSelectedPointId((current) => plan.route.points.some((point) => point.id === current) ? current : plan.route.points[0]?.id); }, [plan]);
  useEffect(() => {
    setOriginInput(request.origin.name);
    if (request.origin.source !== 'manual') setConfirmedOriginName(request.origin.name);
  }, [request.origin.name, request.origin.source]);
  useEffect(() => {
    const start = () => {
      setResultMode(false);
      window.setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    };
    window.addEventListener('planner:start', start);
    return () => window.removeEventListener('planner:start', start);
  }, []);

  const createPlan = async () => {
    if (generating) return;
    if (!originConfirmed) { notify('请先确认手动出发地，确保已取得真实坐标。', 'error'); return; }
    setGenerating(true);
    try {
      const next = await generateFromText(request.freeText);
      setSelectedPointId(next.route.points[0]?.id);
      setResultMode(true);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch {
      setResultMode(false);
    } finally { setGenerating(false); }
  };

  const locate = async () => {
    setLocating(true);
    try {
      const result = await getBrowserLocation(request.destinationCity);
      if (result.status === 'success') {
        updateRequest({ origin: { name: result.name, city: result.city, lat: result.lat, lng: result.lng, source: 'browser' } });
        setOriginInput(result.name);
        setConfirmedOriginName(result.name);
      }
      notify(result.message, result.status === 'success' ? 'success' : 'error');
    } finally { setLocating(false); }
  };

  const confirmManualOrigin = async () => {
    if (resolvingOrigin) return;
    setResolvingOrigin(true);
    try {
      const result = await resolveManualLocation(originInput);
      updateRequest({ origin: { name: result.name, city: request.destinationCity, lat: result.lat, lng: result.lng, source: 'manual' } });
      setOriginInput(result.name);
      setConfirmedOriginName(result.name);
      notify(`已确认真实起点：${result.name}`, 'success');
    } catch (error) {
      setConfirmedOriginName('');
      notify(error instanceof Error ? error.message : '出发地解析失败，请稍后重试。', 'error');
    } finally { setResolvingOrigin(false); }
  };

  const toggle = <T extends string>(field: 'interests' | 'dietaryRestrictions' | 'specialNeeds', item: T) => {
    const values = request[field] as readonly string[];
    updateRequest({ [field]: values.includes(item) ? values.filter((value) => value !== item) : [...values, item] });
  };

  return (
    <main className={resultMode && plan ? 'planner-result-page px-2 pb-4 pt-28 md:px-4 md:pb-5' : 'planner-editorial'}>
      {(!resultMode || !plan) &&
        <section id="planner-ai-entry" ref={inputRef} className="planner-entry section-pad scroll-mt-24">
          <div className="mx-auto max-w-6xl">
            <header className="planner-entry-heading"><p>AI TRAVEL EDITOR · HUBEI</p><h2>懂你，也懂湖北</h2><span>从一句真实的旅行想法开始，我们再一起校准时间、预算与兴趣。</span></header>
            <div className="planner-prompt-shell">
              <label htmlFor="travel-free-text">你想怎样游湖北？</label>
              <textarea id="travel-free-text" rows={4} value={request.freeText} onChange={(event) => updateRequest({ freeText: event.target.value })} placeholder="例如：恩施三天两夜，预算1000元，喜欢峡谷和拍照，不吃辣" />
              <div className="planner-prompt-footer"><span>目的地已同步为 <strong>{request.destinationCity}</strong></span><button type="button" onClick={() => parseText()}>识别这句话<Sparkles aria-hidden="true" /></button></div>
            </div>

            {(parsedTags.length > 0 || parseWarnings.length > 0) && <div className="planner-parsed" aria-live="polite"><strong>已识别，请确认</strong><div>{parsedTags.map((tag) => <span key={`${tag.type}-${tag.value}`}>{tag.type}：{tag.value}</span>)}</div>{parseWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}

            <div className="planner-examples"><span>快速写入</span>{examples.slice(0, 4).map((example) => <button type="button" key={example.label} onClick={() => { updateRequest({ freeText: example.prompt }); window.setTimeout(() => parseText(example.prompt), 0); }}>{example.label}</button>)}</div>

            <section className="planner-more-conditions" aria-labelledby="planner-conditions-title">
              <header className="planner-more-heading"><SlidersHorizontal aria-hidden="true" /><span><h3 id="planner-conditions-title">完善旅行条件</h3><small>人群、天数、预算、日期与兴趣</small></span></header>
              <div className="planner-more-body">
                <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="出发地" htmlFor="trip-origin"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2"><input id="trip-origin" value={originInput} onChange={(event) => { setOriginInput(event.target.value); setConfirmedOriginName(''); }} placeholder="输入车站、酒店、道路或完整地址" className="planner-input min-w-0" /><button type="button" aria-label="确认手动出发地" disabled={resolvingOrigin || !originInput.trim()} onClick={confirmManualOrigin} className="planner-location-button">{resolvingOrigin ? <Loader2 className="animate-spin" /> : <Check />}<span>{resolvingOrigin ? '解析中' : '确认'}</span></button><button type="button" aria-label="使用当前定位" disabled={locating} onClick={locate} className="planner-location-button">{locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}<span>{locating ? '定位中' : '当前定位'}</span></button></div>{originConfirmed ? <p className="planner-location-status" role="status">{request.origin.source === 'browser' ? 'GPS 起点已锁定' : request.origin.source === 'manual' ? '手动起点已解析' : '默认起点已就绪'}：{request.origin.name}</p> : <p className="planner-location-status text-tower" role="status">请输入具体地点并点击“确认”，解析真实坐标后才能生成。</p>}</Field>
                  <Field label="出行人群" htmlFor="traveler-type"><select id="traveler-type" value={request.travelerType} onChange={(event) => updateRequest({ travelerType: event.target.value as TravelerType })} className="planner-input">{TRAVELERS.map((item) => <option key={item}>{item}</option>)}</select></Field>
                  <Field label="天数" htmlFor="trip-days"><input id="trip-days" type="number" min={1} max={15} value={request.days} onChange={(event) => updateRequest({ days: Number(event.target.value) })} className="planner-input" /></Field>
                  <Field label="预算（元）" htmlFor="trip-budget"><input id="trip-budget" type="number" min={0} value={request.budget} onChange={(event) => updateRequest({ budget: Number(event.target.value) })} className="planner-input" /></Field>
                  <Field label="开始日期" htmlFor="start-date"><input id="start-date" type="date" value={request.startDate} onChange={(event) => updateRequest({ startDate: event.target.value })} className="planner-input" /></Field>
                  <Field label="结束日期" htmlFor="end-date"><input id="end-date" type="date" min={request.startDate} value={request.endDate} onChange={(event) => updateRequest({ endDate: event.target.value })} className="planner-input" /></Field>
                </div>
                <ChoiceGroup label="旅行兴趣" values={INTERESTS} selected={request.interests} onToggle={(item) => toggle<Interest>('interests', item)} />
                <div className="grid gap-x-8 md:grid-cols-2"><ChoiceGroup label="饮食限制" values={DIETARY_RESTRICTIONS} selected={request.dietaryRestrictions} onToggle={(item) => toggle<DietaryRestriction>('dietaryRestrictions', item)} /><ChoiceGroup label="特殊需求" values={SPECIAL_NEEDS} selected={request.specialNeeds} onToggle={(item) => toggle<SpecialNeed>('specialNeeds', item)} /></div>
              </div>
            </section>

            <button type="button" disabled={generating || isGenerating} onClick={createPlan} className="planner-generate-button">{generating || isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}{generating || isGenerating ? '正在生成最终 AI 分析…' : `生成我的${request.destinationCity}行程`}</button>
            {isGenerating && !plan && <section className="planner-thinking" aria-live="polite"><Loader2 className="animate-spin" /><div><h2>正在生成最终个性化方案</h2><p>正在完成真实地点检索与千问分析；完成前不会显示规则占位结果。</p></div></section>}
          </div>
        </section>}

      {resultMode && plan && <div className="mx-auto w-full max-w-none"><section ref={resultRef} className="planner-result-shell space-y-3 scroll-mt-24">
            <div className="planner-result-toolbar flex flex-col justify-between gap-3 rounded-[1.25rem] bg-white/75 px-4 py-3 shadow-sm ring-1 ring-ink/5 backdrop-blur md:flex-row md:items-center md:px-5">
              <h2 className="font-display text-2xl font-black text-ink">{plan.route.title}</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { if (window.confirm('重置当前方案？真实手账和照片会保留。')) { resetPlan(); setResultMode(false); } }} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-ink shadow-sm"><RotateCcw className="h-4 w-4" />重置方案</button>
                <button type="button" onClick={() => setResultMode(false)} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-black text-white"><ArrowLeft className="h-4 w-4" />返回修改</button>
              </div>
            </div>
            <MapWorkspace route={plan.route} plan={plan.content} selectedPointId={selectedPointId} activePointIndex={Math.max(0, plan.route.points.findIndex((item) => item.id === selectedPointId))} navigating={false} imageUrl={selectedCity.imageUrl} onSelectPoint={(point: RoutePoint) => setSelectedPointId(point.id)} onRegenerate={replan} onSimulateNavigation={() => notify('本功能仅演示路线顺序，不冒充实时导航。')} />
            {isReplanning && <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/25 backdrop-blur-sm"><div className="flex items-center gap-3 rounded-3xl bg-white px-6 py-5 font-black text-ink shadow-soft"><Loader2 className="h-5 w-5 animate-spin text-river" />正在生成最终 AI 分析…</div></div>}
          </section></div>}
    </main>
  );
}
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return <div className="mb-5"><label htmlFor={htmlFor} className="mb-2 block text-xs font-black tracking-[.08em] text-ink/55">{label}</label>{children}</div>;
}

function ChoiceGroup<T extends string>({ label, values, selected, onToggle }: { label: string; values: readonly T[]; selected: readonly T[]; onToggle: (item: T) => void }) {
  return <fieldset className="mb-5"><legend className="mb-2 text-xs font-black tracking-[.08em] text-ink/55">{label}</legend><div className="flex flex-wrap gap-2">{values.map((item) => <button type="button" key={item} aria-pressed={selected.includes(item)} onClick={() => onToggle(item)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-black transition ${selected.includes(item) ? 'border-river bg-river text-white' : 'border-ink/10 bg-[#fffdf8] text-ink/60 hover:border-river/40 hover:text-river'}`}>{selected.includes(item) && <Check className="h-3.5 w-3.5" />}{item}</button>)}</div></fieldset>;
}
