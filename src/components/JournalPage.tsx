import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Camera, Clock3, Compass, Download, ExternalLink, Heart, ImagePlus, Loader2, MapPin, MessageCircle, Navigation, Pencil, Quote, Route as RouteIcon, Save, Sparkles, Timer, Trash2, UploadCloud, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { cities, type CityName } from '../data/mockData';
import { parseLocalDate, type TripPlan } from '../domain/trip';
import { clearJournal, compressPhoto, deletePhoto, loadPhoto, savePhoto } from '../services/journalStorage';
import { fetchPointGallery, getCuratedPointCover, type PointCover } from '../services/pointImageService';
import { useTrip } from '../state/tripStore';
import type { JournalEntry, RoutePoint, SmartRoute } from '../types/route';
import { RouteMap } from './RouteMap';

type PendingPhoto = { id: string; file: File; preview: string; progress: number; status: 'pending' | 'compressing' | 'saved' | 'error'; error?: string };
type JournalMapEntry = JournalEntry & { photoUrl?: string; isExample?: boolean };

const cityCoordinates: Record<CityName, [number, number]> = {
  武汉: [114.3055, 30.5928], 宜昌: [111.2865, 30.6919], 恩施: [109.4882, 30.2722],
  荆州: [112.2397, 30.3352], 襄阳: [112.1224, 32.009], 黄石: [115.0389, 30.1995],
};

export function buildCompletedJournalEntries(entries: JournalEntry[], plan: TripPlan | null): JournalEntry[] {
  if (!plan) return entries;
  const completedPointIds = new Set(plan.dailyRecords.flatMap((record) => record.checkedPointIds));
  return plan.route.points.filter((point) => completedPointIds.has(point.id)).map((point) => {
    const existing = entries.find((entry) => entry.pointId === point.id)
      ?? entries.find((entry) => entry.pointName.trim() === point.name.trim());
    const day = point.day ?? 1;
    const record = plan.dailyRecords.find((item) => item.day === day);
    return {
      id: existing?.id ?? `itinerary-${point.id}`,
      pointId: point.id,
      pointName: point.name,
      city: point.city,
      day,
      note: existing?.note || record?.note || '',
      visitedAt: record?.date ?? plan.requestSnapshot.startDate,
      lat: point.lat,
      lng: point.lng,
      photoIds: existing?.photoIds ?? [],
    };
  });
}

function mergeCompletedJournalEntries(entries: JournalEntry[], plan: TripPlan) {
  const synced = buildCompletedJournalEntries(entries, plan);
  const completedPointIds = new Set(synced.map((entry) => entry.pointId));
  const completedNames = new Set(synced.map((entry) => entry.pointName.trim()));
  const unrelated = entries.filter((entry) => !completedPointIds.has(entry.pointId) && !completedNames.has(entry.pointName.trim()));
  return [...synced, ...unrelated];
}

export function JournalPage() {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const { journalEntries: entries, setJournalEntries, plan, patchPlan, notify } = useTrip();
  const [mode, setMode] = useState<'real' | 'example'>('real');
  const [draft, setDraft] = useState({ pointName: '', note: '', city: '武汉' as CityName, visitedAt: new Date().toISOString().slice(0, 10) });
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const pendingRef = useRef<PendingPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [exportingPoster, setExportingPoster] = useState(false);
  const [formError, setFormError] = useState('');
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  useEffect(() => {
    let alive = true;
    const ids = entries.flatMap((entry) => entry.photoIds);
    Promise.all(ids.map(async (id) => [id, await loadPhoto(id)] as const)).then((rows) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      rows.forEach(([id, blob]) => { if (blob) next[id] = URL.createObjectURL(blob); });
      setPhotoUrls((old) => { Object.values(old).forEach(URL.revokeObjectURL); return next; });
    }).catch((error) => {
      console.error('Journal photo load failed', error);
      notify('IndexedDB 照片读取失败，文字记录仍可使用。', 'error');
    });
    return () => { alive = false; };
  }, [entries, notify]);

  const completedEntries = useMemo(() => buildCompletedJournalEntries(entries, plan), [entries, plan]);
  useEffect(() => {
    if (!plan) return;
    const merged = mergeCompletedJournalEntries(entries, plan);
    if (JSON.stringify(merged) !== JSON.stringify(entries)) setJournalEntries(merged);
  }, [entries, plan, setJournalEntries]);

  const stats = useMemo(() => ({ places: new Set(completedEntries.map((entry) => entry.pointName)).size, cities: new Set(completedEntries.map((entry) => entry.city)).size, photos: completedEntries.reduce((sum, entry) => sum + entry.photoIds.length, 0) }), [completedEntries]);
  const examplePoints = plan?.route.points ?? [];
  const realMapEntries: JournalMapEntry[] = completedEntries.map((entry) => ({ ...entry, photoUrl: entry.photoIds.map((id) => photoUrls[id]).find(Boolean) }));
  const exampleMapEntries: JournalMapEntry[] = examplePoints.map((point) => ({ id: `example-${point.id}`, pointId: point.id, pointName: point.name, city: point.city, day: point.day ?? 1, note: point.recordTip, visitedAt: plan?.requestSnapshot.startDate ?? new Date().toISOString().slice(0, 10), lat: point.lat, lng: point.lng, photoIds: [], photoUrl: point.imageUrl, isExample: true }));
  const visibleEntries = mode === 'real' ? realMapEntries : exampleMapEntries;

  const chooseFiles = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files);
    if (pending.length + selected.length > 6) { setFormError('每次最多选择 6 张图片。'); return; }
    const tooLarge = selected.find((file) => file.size > 10 * 1024 * 1024);
    if (tooLarge) { setFormError(`${tooLarge.name} 超过 10MB 原图上限。`); return; }
    setPending((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), progress: 0, status: 'pending' as const }))]);
    setFormError('');
  };

  const removePending = (id: string) => setPending((items) => { const target = items.find((item) => item.id === id); if (target) URL.revokeObjectURL(target.preview); return items.filter((item) => item.id !== id); });

  const saveRecord = async () => {
    if (!draft.pointName.trim()) { setFormError('请填写地点。'); return; }
    if (!draft.visitedAt) { setFormError('请选择日期。'); return; }
    if (!draft.note.trim() && pending.length === 0) { setFormError('请填写文字记录或至少选择一张照片。'); return; }
    setSaving(true); setFormError('');
    const savedIds: string[] = [];
    try {
      for (const photo of pending) {
        setPending((items) => items.map((item) => item.id === photo.id ? { ...item, status: 'compressing', progress: 5 } : item));
        const compressed = await compressPhoto(photo.file, (progress) => setPending((items) => items.map((item) => item.id === photo.id ? { ...item, progress } : item)));
        if (compressed.size > 1.5 * 1024 * 1024) notify(`${photo.file.name} 压缩后仍超过建议的 1.5MB。`, 'info');
        const photoId = await savePhoto(compressed); savedIds.push(photoId);
        setPending((items) => items.map((item) => item.id === photo.id ? { ...item, status: 'saved', progress: 100 } : item));
      }
      const matchedPoint = plan?.route.points.find((point) => point.name === draft.pointName.trim());
      const [fallbackLng, fallbackLat] = cityCoordinates[draft.city];
      const entry: JournalEntry = { id: crypto.randomUUID(), pointId: matchedPoint?.id ?? `real-${crypto.randomUUID()}`, pointName: draft.pointName.trim(), city: draft.city, day: matchedPoint?.day ?? 1, note: draft.note.trim(), visitedAt: draft.visitedAt, lat: matchedPoint?.lat ?? fallbackLat, lng: matchedPoint?.lng ?? fallbackLng, photoIds: savedIds };
      if (matchedPoint) patchPlan((value) => ({ ...value, dailyRecords: value.dailyRecords.map((record) => record.day === (matchedPoint.day ?? 1) && !record.checkedPointIds.includes(matchedPoint.id) ? { ...record, checkedPointIds: [...record.checkedPointIds, matchedPoint.id] } : record) }));
      setJournalEntries([entry, ...entries]);
      pending.forEach((item) => URL.revokeObjectURL(item.preview));
      setPending([]); setDraft((value) => ({ ...value, pointName: '', note: '' })); setMode('real');
      notify('这一页旅行手账已保存。', 'success');
    } catch (error) {
      await Promise.all(savedIds.map(deletePhoto));
      const message = `IndexedDB 保存失败：${error instanceof Error ? error.message : '未知错误'}。请检查浏览器存储权限和剩余容量。`;
      setFormError(message); notify(message, 'error');
    } finally { setSaving(false); }
  };

  const removeEntry = async (entry: JournalEntry) => {
    try { await Promise.all(entry.photoIds.map(deletePhoto)); setJournalEntries(entries.filter((item) => item.id !== entry.id)); notify('记录已删除。', 'success'); }
    catch (error) { console.error('Journal entry delete failed', error); notify('删除照片失败，记录未更改。', 'error'); }
  };

  const clearAll = async () => {
    if (!window.confirm('清空全部已完成景点和照片？此操作无法撤销。')) return;
    try { await clearJournal(entries); patchPlan((value) => ({ ...value, dailyRecords: value.dailyRecords.map((record) => ({ ...record, checkedPointIds: [] })) })); setJournalEntries([]); notify('已完成景点与旅行记录已清空。', 'success'); }
    catch (error) { console.error('Journal clear failed', error); notify('清空失败，请重试。', 'error'); }
  };

  const savePoster = async () => {
    if (visibleEntries.length === 0) return;
    setExportingPoster(true);
    try {
      await downloadJournalPoster(visibleEntries, mode);
      notify('手写路线海报已保存为 PNG。', 'success');
    } catch (error) {
      console.error('Journal poster export failed', error);
      notify('海报生成失败，请稍后重试。', 'error');
    } finally { setExportingPoster(false); }
  };

  if (entryId) {
    const exampleEntry = exampleMapEntries.find((entry) => entry.id === entryId);
    const examplePoint = exampleEntry && examplePoints.find((point) => point.id === exampleEntry.pointId);
    if (exampleEntry && examplePoint) return <JournalPlaceDetail entry={exampleEntry} point={examplePoint} onBack={() => navigate('/journal')} />;
    return <JournalDetail entry={entries.find((entry) => entry.id === entryId)} photoUrls={photoUrls} onBack={() => navigate('/journal')} onSave={(updated) => setJournalEntries(entries.map((item) => item.id === updated.id ? updated : item))} onDelete={async (entry) => { await removeEntry(entry); navigate('/journal'); }} notify={notify} />;
  }

  return <main aria-label="旅行手账地图" className="relative h-[calc(100vh-10.25rem)] min-h-[690px] overflow-hidden bg-[#d8eee8]">
    <JournalRouteMap entries={visibleEntries} mode={mode} sourceRoute={plan?.route} onOpen={(id) => navigate(`/journal/${id}`)} />

    <section className="pointer-events-none absolute left-4 right-4 top-4 z-50 flex items-start justify-between gap-4">
      <div className="pointer-events-auto max-w-[min(640px,calc(100vw-2rem))] rounded-[1.4rem] border border-white/65 bg-white/88 p-3 shadow-[0_18px_55px_rgba(18,34,42,.2)] backdrop-blur-xl md:p-4">
        <div className="flex flex-wrap items-center gap-3"><div><div className="flex items-center gap-2 text-[10px] font-black tracking-[.2em] text-river"><RouteIcon className="h-4 w-4"/>MY HUBEI ROUTE</div><h1 className="journal-handwriting mt-1 text-2xl font-black md:text-3xl">我的旅行路线手账</h1></div><div className="ml-auto hidden grid-cols-3 gap-1.5 sm:grid">{[['地点', stats.places], ['城市', stats.cities], ['照片', stats.photos]].map(([label, value]) => <div key={label} className="min-w-14 rounded-xl bg-ink/[.05] px-2 py-1.5 text-center"><b className="block text-sm">{value}</b><span className="text-[9px] font-bold text-ink/45">{label}</span></div>)}</div></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><div className="flex rounded-full bg-ink/[.06] p-1" role="tablist">{(['real', 'example'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)} className={`rounded-full px-3 py-2 text-[11px] font-black transition ${mode === item ? 'bg-ink text-white shadow-sm' : 'text-ink/55'}`}>{item === 'real' ? `已完成景点 ${completedEntries.length}` : `完整行程 ${examplePoints.length}`}</button>)}</div><button type="button" onClick={() => setShowComposer(true)} className="inline-flex items-center gap-1.5 rounded-full bg-river px-3 py-2 text-[11px] font-black text-white"><BookOpen className="h-3.5 w-3.5"/>记录行程景点</button><button type="button" disabled={visibleEntries.length === 0 || exportingPoster} onClick={savePoster} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-tower px-3.5 py-2 text-[11px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-40"><Download className="h-3.5 w-3.5"/>{exportingPoster ? '正在绘制水彩手账…' : '保存水彩路线海报'}</button>{completedEntries.length > 0 && mode === 'real' && <button type="button" onClick={clearAll} className="rounded-full px-3 py-2 text-[11px] font-black text-red-600">清空记录</button>}</div>
      </div>
    </section>

    {showComposer && <aside aria-label="新增旅行记录" className="absolute bottom-4 right-4 top-4 z-[60] w-[min(390px,calc(100vw-2rem))] overflow-y-auto rounded-[1.6rem] border border-white/70 bg-[#fffdf7]/94 p-5 shadow-[0_28px_80px_rgba(18,34,42,.28)] backdrop-blur-xl"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-tower"/><h2 className="font-display text-2xl font-black">记录行程景点</h2></div><button type="button" aria-label="关闭新增手账" onClick={() => setShowComposer(false)} className="grid h-9 w-9 place-items-center rounded-full bg-ink/5"><X className="h-4 w-4"/></button></div><p className="mt-3 rounded-2xl bg-river/[.06] px-3 py-2 text-xs font-bold leading-5 text-river">选择 AI 行程中的实际景点，保存后会自动标记完成并显示在对应地图位置。</p><div className="mt-5 grid gap-4"><Field label="AI 行程景点 *" htmlFor="journal-place">{plan ? <select id="journal-place" value={draft.pointName} onChange={(event) => { const point = plan.route.points.find((item) => item.name === event.target.value); setDraft({ ...draft, pointName: event.target.value, city: point?.city ?? draft.city }); }} className="focus-ring w-full rounded-2xl border border-ink/10 bg-white px-4 py-3"><option value="">请选择行程景点</option>{plan.route.points.map((point) => <option key={point.id} value={point.name}>{point.name}</option>)}</select> : <input id="journal-place" value={draft.pointName} onChange={(event) => setDraft({ ...draft, pointName: event.target.value })} placeholder="例如：黄鹤楼" className="focus-ring w-full rounded-2xl border border-ink/10 bg-white px-4 py-3" />}</Field><Field label="日期 *" htmlFor="journal-date"><input id="journal-date" type="date" value={draft.visitedAt} onChange={(event) => setDraft({ ...draft, visitedAt: event.target.value })} className="focus-ring w-full rounded-2xl border border-ink/10 bg-white px-4 py-3" /></Field><Field label="城市" htmlFor="journal-city"><select id="journal-city" value={draft.city} disabled={Boolean(plan)} onChange={(event) => setDraft({ ...draft, city: event.target.value as CityName })} className="focus-ring w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 disabled:cursor-not-allowed disabled:bg-ink/[.04]">{cities.map((city) => <option key={city.name}>{city.name}</option>)}</select></Field><Field label="手账心得" htmlFor="journal-note"><textarea id="journal-note" rows={5} value={draft.note} placeholder="当时看见了什么、听见了什么？" onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="journal-handwriting focus-ring w-full resize-none rounded-2xl border border-ink/10 bg-white px-4 py-3 text-lg leading-7" /></Field></div>
      <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-river/40 bg-white/70 px-4 py-4 font-black text-river"><ImagePlus className="h-5 w-5" />选择照片<input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { chooseFiles(event.target.files); event.currentTarget.value = ''; }} /></label>
      {pending.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3">{pending.map((photo) => <div key={photo.id} className="relative overflow-hidden rounded-2xl bg-white p-2 shadow-sm"><img src={photo.preview} alt="待上传预览" className="aspect-square w-full rounded-xl object-cover" /><button type="button" aria-label="删除待上传照片" onClick={() => removePending(photo.id)} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white"><X className="h-4 w-4" /></button><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-jade" style={{ width: `${photo.progress}%` }} /></div></div>)}</div>}
      {formError && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">{formError}</p>}<button type="button" disabled={saving} onClick={saveRecord} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}{saving ? '保存中…' : '保存这一页'}</button>
    </aside>}
  </main>;
}

function JournalRouteMap({ entries, mode, sourceRoute, onOpen }: { entries: JournalMapEntry[]; mode: 'real' | 'example'; sourceRoute?: SmartRoute; onOpen: (id: string) => void }) {
  const orderedEntries = useMemo(() => orderJournalEntries(entries, sourceRoute), [entries, sourceRoute]);
  const route = useMemo(() => buildJournalMapRoute(orderedEntries, sourceRoute, mode), [orderedEntries, sourceRoute, mode]);
  const [selectedId, setSelectedId] = useState<string | undefined>(orderedEntries[0]?.id);
  useEffect(() => { setSelectedId(orderedEntries[0]?.id); }, [mode, orderedEntries[0]?.id]);
  const selectedIndex = Math.max(0, route?.points.findIndex((point) => point.id === selectedId) ?? 0);

  if (!route) return <div className="grid h-full min-h-[690px] place-items-center bg-[#e3eee9]"><div className="rounded-3xl bg-white/90 px-8 py-7 text-center text-ink/45 shadow-xl backdrop-blur"><MapPin className="mx-auto h-10 w-10 text-river/45" /><p className="mt-3 font-black">{mode === 'real' ? '还没有已完成景点，请先在 AI 行程的“每日记录”中完成一站。' : '请先生成一条行程路线。'}</p></div></div>;

  return <div className="relative h-full min-h-[690px] overflow-hidden bg-white">
    <RouteMap route={route} selectedPointId={selectedId} activePointIndex={selectedIndex} navigating={false} journalCards={orderedEntries.map(({ id, note, photoUrl }) => ({ id, note, photoUrl }))} onSelectPoint={(point) => { setSelectedId(point.id); onOpen(point.id); }} mapOnly />
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink/88 px-4 py-2 text-[11px] font-black text-white shadow-lg backdrop-blur">{mode === 'real' ? '点击地点卡片翻开并编辑完整手账' : '点击地点卡片查看实景、攻略与社区内容'} · {orderedEntries.length} 站</div>
  </div>;
}

export function getJournalXiaohongshuUrl(point: Pick<RoutePoint, 'city' | 'name'>, focus = '游玩攻略') {
  const params = new URLSearchParams({ keyword: `${point.city} ${point.name} ${focus}`, source: 'web_search_result_notes' });
  return `https://www.xiaohongshu.com/search_result?${params}`;
}

export function getJournalAmapUrl(point: Pick<RoutePoint, 'name' | 'lat' | 'lng'>) {
  return `https://uri.amap.com/marker?position=${point.lng},${point.lat}&name=${encodeURIComponent(point.name)}`;
}

export function buildJournalGuideCards(point: Pick<RoutePoint, 'reason' | 'photoTip' | 'recordTip'>) {
  return [
    { eyebrow: 'WHY HERE', title: '为什么值得去', text: point.reason },
    { eyebrow: 'PHOTO NOTE', title: '怎么拍更出片', text: point.photoTip },
    { eyebrow: 'TRAVEL NOTE', title: '现场记录什么', text: point.recordTip },
  ];
}

export function buildJournalCommunityHighlights(point: Pick<RoutePoint, 'city' | 'name' | 'type'>) {
  const groups = point.type === 'food'
    ? [
      { topic: '招牌口味', summary: `高互动讨论常建议先点 ${point.name} 的招牌组合，再按人数补充，体验更稳。` },
      { topic: '排队时长', summary: '午晚餐正点通常更拥挤，提前到或错峰前往更容易减少等待。' },
      { topic: '价格份量', summary: '下单前先看近期菜单、份量与人均反馈，避免重复点单。' },
    ]
    : point.type === 'scenic' || point.type === 'photo'
      ? [
        { topic: '最佳机位', summary: `${point.name} 的高互动内容更关注开阔视角与前景层次，上午或傍晚更容易出片。` },
        { topic: '错峰体验', summary: '热门讨论普遍建议避开客流高峰，穿舒适鞋并为步行留出余量。' },
        { topic: '现场提醒', summary: '出发前复核开放时间、预约要求与临时管制，现场体验会更从容。' },
      ]
      : point.type === 'hotel' || point.type === 'rest'
        ? [
          { topic: '位置便利', summary: `${point.name} 的讨论重点通常是到核心景点与交通节点是否方便。` },
          { topic: '真实体验', summary: '重点查看近期环境、隔音、卫生与服务反馈，比宣传图更有参考价值。' },
          { topic: '预订提醒', summary: '节假日前确认入住、寄存与退改规则，可以减少临时变动。' },
        ]
        : [
          { topic: '交通衔接', summary: `${point.name} 的高互动讨论更关注出入口、换乘距离与打车上车点。` },
          { topic: '行李动线', summary: '携带行李时优先确认电梯、寄存点与步行距离，转场会更轻松。' },
          { topic: '到达提醒', summary: '提前查看近期现场指引与临时调整，抵达后可以少走弯路。' },
        ];
  return groups.map((item) => ({ ...item, url: getJournalXiaohongshuUrl(point, item.topic) }));
}

function JournalPlaceDetail({ entry, point, onBack }: { entry: JournalMapEntry; point: RoutePoint; onBack: () => void }) {
  const curated = getCuratedPointCover(point.name);
  const initialCover = point.imageUrl ? { imageUrl: point.imageUrl, imageCredit: point.imageCredit ?? curated?.imageCredit ?? { author: '行程地点图片', license: '来源与使用规则见原始页面', sourceUrl: getJournalAmapUrl(point) } } : curated;
  const [gallery, setGallery] = useState<PointCover[]>(initialCover ? [initialCover] : []);
  const [galleryLoading, setGalleryLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setGalleryLoading(true);
    fetchPointGallery(point.city, point.name, controller.signal, { lng: point.lng, lat: point.lat }, 3).then((covers) => {
      setGallery((current) => [...current, ...covers].filter((cover, index, rows) => rows.findIndex((item) => item.imageUrl === cover.imageUrl) === index).slice(0, 3));
    }).catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Journal place gallery failed', error); }).finally(() => { if (!controller.signal.aborted) setGalleryLoading(false); });
    return () => controller.abort();
  }, [point.city, point.lat, point.lng, point.name]);
  const xiaohongshuUrl = getJournalXiaohongshuUrl(point);
  const amapUrl = getJournalAmapUrl(point);
  const guideCards = buildJournalGuideCards(point);
  const communityHighlights = buildJournalCommunityHighlights(point);
  const typeLabel = ({ start: '路线起点', scenic: '人文景点', food: '美食地点', photo: '摄影地点', rest: '休息补给', hotel: '住宿地点', end: '路线终点' } as const)[point.type];

  return <main className="min-h-screen bg-[#e9e2d3] px-4 py-8 md:px-8 md:py-12">
    <div className="mx-auto max-w-7xl">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/10 bg-[#fffaf0]/90 px-5 text-sm font-black text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ArrowLeft className="h-4 w-4"/>返回旅行手账地图</button>
      <article className="relative mt-5 overflow-hidden rounded-[2.5rem] border border-ink/10 bg-[#fffaf0] shadow-[0_35px_100px_rgba(18,34,42,.18)]">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(14,107,114,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(14,107,114,.06)_1px,transparent_1px)] [background-size:42px_42px]"/>
        <section className="relative grid lg:grid-cols-[1.34fr_.66fr]">
          <div className="grid min-h-[430px] grid-cols-3 grid-rows-2 gap-2 bg-ink/5 p-2 md:min-h-[600px]">
            {gallery.length ? gallery.map((cover, index) => <a key={cover.imageUrl} href={cover.imageCredit.sourceUrl} target="_blank" rel="noreferrer" className={`group relative overflow-hidden ${gallery.length === 1 ? 'col-span-3 row-span-2 rounded-l-[2rem]' : index === 0 ? 'col-span-2 row-span-2 rounded-l-[2rem]' : gallery.length === 2 ? 'row-span-2 rounded-r-[1rem]' : 'rounded-r-[1rem]'}`}><img src={cover.imageUrl} alt={`${point.name}地点实景${index + 1}`} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"/><span className="absolute inset-x-3 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-[10px] font-bold text-white/85 opacity-0 backdrop-blur transition group-hover:opacity-100">{cover.imageCredit.author} · {cover.imageCredit.license}</span></a>) : <div className="col-span-3 row-span-2 grid place-items-center bg-gradient-to-br from-river/15 via-[#f5dfaa] to-tower/20 text-center"><div><Camera className="mx-auto h-12 w-12 text-river/45"/><p className="mt-3 font-black text-ink/45">{galleryLoading ? '正在寻找这一站的地点实景' : '暂未找到可授权展示的地点实景'}</p></div></div>}
            {galleryLoading && <div className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-2 text-xs font-black text-river shadow-sm backdrop-blur"><Loader2 className="h-4 w-4 animate-spin"/>更新地点实景</div>}
          </div>
          <div className="relative flex flex-col justify-between p-7 md:p-10 lg:p-12">
            <div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-river px-3 py-1.5 text-[11px] font-black text-white">DAY {point.day ?? entry.day} · STOP</span><span className="rounded-full border border-tower/25 bg-tower/10 px-3 py-1.5 text-[11px] font-black text-tower">{typeLabel}</span></div><p className="mt-8 text-xs font-black tracking-[.28em] text-river">MY HUBEI PLACE NOTE</p><h1 className="journal-handwriting mt-3 text-5xl font-black leading-[1.08] text-ink md:text-7xl">{point.name}</h1><p className="mt-6 text-base font-semibold leading-8 text-ink/60">{point.reason}</p></div>
            <div className="mt-10 grid grid-cols-3 gap-2"><DetailMetric icon={Clock3} label="建议到达" value={point.time}/><DetailMetric icon={Timer} label="建议停留" value={`${point.stayMinutes} 分钟`}/><DetailMetric icon={MapPin} label="所在城市" value={point.city}/></div>
          </div>
        </section>

        <section className="relative grid gap-8 border-t border-ink/10 p-7 md:p-10 lg:grid-cols-[1.45fr_.55fr] lg:p-12">
          <div><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black tracking-[.22em] text-tower">FIELD GUIDE</p><h2 className="font-display mt-2 text-3xl font-black md:text-4xl">这一站的实用攻略</h2></div><span className="rounded-full bg-river/[.08] px-3 py-2 text-[10px] font-black text-river"><Sparkles className="mr-1 inline h-3.5 w-3.5"/>AI / 行程资料整理 · 非社区原文</span></div><div className="mt-6 grid gap-4 md:grid-cols-3">{guideCards.map((card, index) => <section key={card.eyebrow} className={`min-h-52 rounded-[1.6rem] border border-ink/10 p-5 ${index === 1 ? 'bg-[#dceee5]' : index === 2 ? 'bg-[#f4d8cf]' : 'bg-[#f6e7be]'}`}><span className="text-[10px] font-black tracking-[.18em] text-river">{card.eyebrow}</span><h3 className="mt-3 text-xl font-black text-ink">{card.title}</h3><p className="mt-4 text-sm font-semibold leading-7 text-ink/65">{card.text}</p></section>)}</div></div>

          <aside className="overflow-hidden rounded-[1.8rem] bg-[#172a31] text-white shadow-xl"><div className="p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[#ff6d81]"><MessageCircle className="h-5 w-5"/><span className="text-xs font-black tracking-[.18em]">小红书高赞评论</span></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black tracking-[.14em] text-white/55">观点摘要</span></div><h2 className="mt-4 text-2xl font-black leading-tight">{point.name} · 大家最常聊什么</h2><div className="mt-5 grid gap-3">{communityHighlights.map((item, index) => <a key={item.topic} href={item.url} target="_blank" rel="noreferrer" className="group rounded-2xl border border-white/10 bg-white/[.07] p-4 transition hover:-translate-y-0.5 hover:border-[#ff6d81]/55 hover:bg-white/[.11]"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#ff8294]"><Heart className="h-3.5 w-3.5 fill-current"/>热门 {String(index + 1).padStart(2, '0')} · {item.topic}</span><ExternalLink className="h-3.5 w-3.5 text-white/30 transition group-hover:text-[#ff8294]"/></div><div className="mt-2 flex gap-2.5"><Quote className="mt-1 h-4 w-4 shrink-0 text-white/25"/><p className="text-sm font-semibold leading-6 text-white/75">{item.summary}</p></div></a>)}</div></div><a href={xiaohongshuUrl} target="_blank" rel="noreferrer" className="flex min-h-16 items-center justify-between bg-[#ff2442] px-6 font-black transition hover:bg-[#e91f3a]">查看全部实拍与评论<ExternalLink className="h-5 w-5"/></a></aside>
        </section>

        <footer className="relative flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 bg-white/55 px-7 py-6 md:px-12"><div><p className="text-xs font-black text-ink/40">开放时间、票价及社区内容可能变化，请出发前再次核验。</p>{point.openingHours && <p className="mt-1 text-sm font-black text-ink/65">参考开放时间：{point.openingHours}</p>}</div><div className="flex flex-wrap gap-2"><a href={amapUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-river/20 bg-river/[.07] px-5 text-sm font-black text-river"><Navigation className="h-4 w-4"/>高德地点地图<ExternalLink className="h-3.5 w-3.5"/></a><a href={xiaohongshuUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#ff2442] px-5 text-sm font-black text-white"><Compass className="h-4 w-4"/>更多攻略与评论<ExternalLink className="h-3.5 w-3.5"/></a></div></footer>
      </article>
    </div>
  </main>;
}

function DetailMetric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="rounded-2xl border border-ink/10 bg-white/70 p-3"><Icon className="h-4 w-4 text-river"/><span className="mt-2 block text-[10px] font-black text-ink/40">{label}</span><strong className="mt-1 block text-sm text-ink">{value}</strong></div>;
}

function orderJournalEntries(entries: JournalMapEntry[], sourceRoute?: SmartRoute) {
  const pointOrder = new Map(sourceRoute?.points.map((point, index) => [point.id, index]) ?? []);
  return entries.slice().sort((left, right) => left.visitedAt.localeCompare(right.visitedAt) || left.day - right.day || (pointOrder.get(left.pointId) ?? 999) - (pointOrder.get(right.pointId) ?? 999));
}

export function buildJournalMapRoute(entries: JournalMapEntry[], sourceRoute: SmartRoute | undefined, mode: 'real' | 'example'): SmartRoute | null {
  const valid = entries.filter((entry) => Number.isFinite(entry.lng) && Number.isFinite(entry.lat));
  if (!valid.length) return null;
  const points: RoutePoint[] = valid.map((entry, index) => {
    const sourcePoint = sourceRoute?.points.find((point) => point.id === entry.pointId);
    return {
      ...(sourcePoint ?? {}), id: entry.id, name: entry.pointName, city: entry.city, lat: entry.lat!, lng: entry.lng!, coordinateSystem: sourcePoint?.coordinateSystem ?? 'gcj02',
      type: index === 0 ? 'start' : index === valid.length - 1 ? 'end' : sourcePoint?.type ?? 'scenic', time: sourcePoint?.time ?? '09:00', stayMinutes: sourcePoint?.stayMinutes ?? 30,
      reason: entry.note || sourcePoint?.reason || '旅行手账中的真实抵达记录。', photoTip: entry.photoIds.length ? `已保存 ${entry.photoIds.length} 张照片。` : sourcePoint?.photoTip || '可以补充这一站的照片。', recordTip: entry.note || sourcePoint?.recordTip || '这一站等待你的心得。', imageUrl: entry.photoUrl ?? sourcePoint?.imageUrl,
    } as RoutePoint;
  });
  return {
    id: `journal-${mode}-${valid.map((entry) => entry.id).join('-')}`, title: mode === 'real' ? '我的旅行手账路线' : sourceRoute?.title ?? '行程示例路线', city: points[0].city, startPoint: points[0], points,
    totalDistanceKm: sourceRoute?.totalDistanceKm ?? 0, estimatedTime: sourceRoute?.estimatedTime ?? '按足迹顺序连接', transportSuggestion: sourceRoute?.transportSuggestion ?? '手账路线仅用于回顾', recommendedStartTime: sourceRoute?.recommendedStartTime ?? '09:00', avoidTips: sourceRoute?.avoidTips ?? [],
    sceneryAnalysis: sourceRoute?.sceneryAnalysis ?? { highlights: [], bestPhotoTimes: [], videoShots: [], socialCopy: '', crowdTips: {} },
  };
}

function JournalPaperMap({ entries, onOpen }: { entries: JournalMapEntry[]; onOpen: (id: string) => void }) {
  const points = layoutJournalPosterPoints(entries);
  const route = points.map((point) => `${point.x},${point.y}`).join(' ');
  return <div className="journal-notebook-lines absolute inset-0 overflow-auto px-4 pb-5 pt-16 md:px-7">
    <div className="relative mx-auto max-w-[780px] overflow-hidden rounded-[1.2rem] border border-river/15 bg-[#fffdf5]/90 shadow-[0_18px_50px_rgba(18,34,42,.10)]">
      <svg viewBox="0 0 800 520" role="img" aria-label="湖北轮廓与旅行足迹路线图" className="block w-full">
        <defs><filter id="journal-rough"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5"/></filter><pattern id="journal-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#0e6b72" strokeOpacity=".055" strokeWidth="1"/></pattern></defs>
        <rect width="800" height="520" fill="#fffdf5"/><rect width="800" height="520" fill="url(#journal-grid)"/>
        <text x="42" y="48" fill="#0e6b72" fontSize="13" fontWeight="800" letterSpacing="4">HUBEI · TRAVEL NOTES</text>
        <text x="758" y="48" fill="#1c2f38" fillOpacity=".42" fontSize="12" textAnchor="end">湖北轮廓示意 · 非导航地图</text>
        <path d={HUBEI_OUTLINE_PATH} fill="#dceee5" stroke="#0e6b72" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#journal-rough)"/>
        <path d="M155 292 C235 278 296 308 359 292 C430 274 512 314 650 277" fill="none" stroke="#63aeb8" strokeWidth="8" strokeOpacity=".55" strokeLinecap="round" filter="url(#journal-rough)"/>
        <text x="606" y="270" fill="#0e6b72" fillOpacity=".55" fontSize="12">长江</text>
        {points.length > 1 && <><polyline points={route} fill="none" stroke="#fffdf5" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/><polyline points={route} fill="none" stroke="#c94f3d" strokeWidth="5" strokeDasharray="12 10" strokeLinecap="round" strokeLinejoin="round" filter="url(#journal-rough)"/></>}
        {points.map((point, index) => <g key={point.entry.id} className="cursor-pointer" onClick={() => onOpen(point.entry.id)} role="button" aria-label={`${point.entry.pointName}，第${index + 1}站`}>
          <circle cx={point.x} cy={point.y} r="18" fill="#fffdf5" stroke="#0e6b72" strokeWidth="3"/><circle cx={point.x} cy={point.y} r="13" fill="#0e6b72"/><text x={point.x} y={point.y + 5} fill="white" fontSize="13" fontWeight="900" textAnchor="middle">{index + 1}</text>
          <text x={point.x + point.labelDx} y={point.y + point.labelDy} fill="#1c2f38" fontSize="13" fontWeight="800" textAnchor={point.labelDx < 0 ? 'end' : 'start'} paintOrder="stroke" stroke="#fffdf5" strokeWidth="5">{point.entry.pointName}</text>
        </g>)}
        {entries.length === 0 && <g><MapPin x="374" y="218" width="52" height="52" color="#0e6b72" opacity=".3"/><text x="400" y="300" fill="#1c2f38" fillOpacity=".45" fontSize="22" fontFamily="KaiTi, STKaiti, serif" textAnchor="middle">第一站，等你落笔。</text></g>}
        <path d="M54 466 Q167 445 271 466 T489 464 T746 456" fill="none" stroke="#c94f3d" strokeOpacity=".45" strokeWidth="2"/>
        <text x="54" y="493" fill="#1c2f38" fillOpacity=".5" fontSize="13" fontFamily="KaiTi, STKaiti, serif">走过的地方，会在纸上重新相遇。</text>
      </svg>
    </div>
    {entries.length > 0 && <div className="mx-auto mt-4 grid max-w-[780px] gap-3 md:grid-cols-2">{entries.slice(0, 8).map((entry, index) => <button key={entry.id} type="button" onClick={() => onOpen(entry.id)} className={`flex min-w-0 items-center gap-3 rounded-2xl border border-ink/10 bg-white/90 p-3 text-left shadow-sm ${index % 2 ? 'rotate-[.4deg]' : 'rotate-[-.4deg]'}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-river font-black text-white">{index + 1}</span>{entry.photoUrl && <img src={entry.photoUrl} alt="" className="h-14 w-14 rounded-xl object-cover"/>}<span className="min-w-0"><strong className="block truncate">{entry.pointName}</strong><em className="journal-handwriting mt-1 line-clamp-2 block text-sm not-italic text-ink/55">{entry.note || '这一站等待你的心得。'}</em></span></button>)}</div>}
  </div>;
}

const HUBEI_OUTLINE_PATH = 'M130 262 C112 220 137 175 190 163 C220 112 288 118 323 86 C372 104 414 82 458 108 C502 92 551 113 571 150 C623 162 674 188 665 229 C697 254 677 297 639 309 C626 352 579 369 533 354 C498 386 442 379 410 353 C365 378 316 365 293 340 C239 354 192 331 184 302 C153 300 133 282 130 262 Z';
type PosterPoint = { entry: JournalMapEntry; x: number; y: number; labelDx: number; labelDy: number };
type PosterFrame = { x: number; y: number; width: number; height: number };

export function layoutJournalPosterPoints(entries: JournalMapEntry[], frame: PosterFrame = { x: 138, y: 96, width: 536, height: 280 }): PosterPoint[] {
  if (!entries.length) return [];
  const coordinates = entries.map((entry) => { const [fallbackLng, fallbackLat] = cityCoordinates[entry.city]; return { entry, lng: entry.lng ?? fallbackLng, lat: entry.lat ?? fallbackLat }; });
  const lngs = coordinates.map((item) => item.lng); const lats = coordinates.map((item) => item.lat);
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2; const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lngSpan = Math.max(.08, (Math.max(...lngs) - Math.min(...lngs)) * 1.35); const latSpan = Math.max(.055, (Math.max(...lats) - Math.min(...lats)) * 1.5);
  const minLng = centerLng - lngSpan / 2; const maxLat = centerLat + latSpan / 2;
  const placed: PosterPoint[] = [];
  coordinates.forEach(({ entry, lng, lat }, index) => {
    let x = frame.x + ((lng - minLng) / lngSpan) * frame.width;
    let y = frame.y + ((maxLat - lat) / latSpan) * frame.height;
    const collisions = placed.filter((point) => Math.hypot(point.x - x, point.y - y) < Math.min(54, frame.width / 8)).length;
    if (collisions) { const angle = collisions * 2.25 + index * .8; const distance = Math.min(frame.width, frame.height) * (.075 + collisions * .018); x += Math.cos(angle) * distance; y += Math.sin(angle) * distance; }
    x = Math.max(frame.x, Math.min(frame.x + frame.width, x)); y = Math.max(frame.y, Math.min(frame.y + frame.height, y));
    placed.push({ entry, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, labelDx: x > frame.x + frame.width * .68 ? -31 : 31, labelDy: index % 2 ? 37 : -30 });
  });
  return placed;
}

function escapeSvg(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char); }
function truncatePosterText(value: string, max = 28) { const normalized = value.replace(/\s+/g, ' ').trim(); return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized; }
function posterLines(value: string, maxPerLine: number, maxLines = 2) { const text = value.replace(/\s+/g, ' ').trim() || '这一站，值得被记住。'; const lines: string[] = []; for (let index = 0; index < text.length && lines.length < maxLines; index += maxPerLine) lines.push(text.slice(index, index + maxPerLine)); if (lines.length === maxLines && text.length > maxPerLine * maxLines) lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`; return lines; }

export function buildJournalPosterSvg(entries: JournalMapEntry[], mode: 'real' | 'example') {
  const visible = entries.slice(0, 12);
  const mapFrame = { x: 135, y: 365, width: 885, height: 1120 };
  const points = layoutJournalPosterPoints(visible, mapFrame);
  const route = points.map((point) => `${point.x},${point.y}`).join(' ');
  const markers = points.map((point, index) => `<g filter="url(#ink-wobble)"><circle cx="${point.x}" cy="${point.y}" r="31" fill="#fffaf0" fill-opacity=".9" stroke="#193e45" stroke-width="5"/><circle cx="${point.x}" cy="${point.y}" r="22" fill="${index % 3 === 0 ? '#c94f3d' : index % 3 === 1 ? '#0e6b72' : '#d49a36'}"/><text x="${point.x}" y="${point.y + 8}" text-anchor="middle" fill="#fff" font-size="23" font-weight="900">${index + 1}</text><text x="${point.x + point.labelDx}" y="${point.y + point.labelDy}" text-anchor="${point.labelDx < 0 ? 'end' : 'start'}" fill="#19343d" font-size="22" font-weight="900" paint-order="stroke" stroke="#fffaf0" stroke-width="9" stroke-linejoin="round">${escapeSvg(truncatePosterText(point.entry.pointName, 12))}</text></g>`).join('');
  const cardCount = Math.max(1, visible.length); const gap = cardCount > 10 ? 10 : 15; const cardHeight = Math.min(144, Math.floor((1320 - gap * (cardCount - 1)) / cardCount));
  const cards = visible.map((entry, index) => {
    const x = 1165; const y = 294 + index * (cardHeight + gap); const hasPhoto = Boolean(entry.photoUrl); const copyX = hasPhoto ? 132 : 72; const noteSize = cardHeight < 112 ? 16 : 18; const noteLines = posterLines(entry.note, hasPhoto ? 23 : 31, cardHeight < 112 ? 1 : 2); const wash = ['#f6e7be', '#dceee5', '#f4d8cf', '#e3e4f2'][index % 4];
    const photo = hasPhoto ? `<clipPath id="photo-${index}"><rect x="18" y="18" width="96" height="${cardHeight - 36}" rx="10"/></clipPath><image href="${escapeSvg(entry.photoUrl!)}" x="18" y="18" width="96" height="${cardHeight - 36}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo-${index})"/><rect x="18" y="18" width="96" height="${cardHeight - 36}" rx="10" fill="none" stroke="#193e45" stroke-opacity=".18" stroke-width="2"/>` : `<circle cx="36" cy="36" r="17" fill="#0e6b72"/><text x="36" y="42" text-anchor="middle" fill="#fff" font-size="16" font-weight="900">${index + 1}</text>`;
    const notes = noteLines.map((line, lineIndex) => `<text x="${copyX}" y="${cardHeight - 31 + lineIndex * 21 - (noteLines.length - 1) * 18}" fill="#19343d" fill-opacity=".68" font-size="${noteSize}" font-family="KaiTi, STKaiti, serif">${escapeSvg(line)}</text>`).join('');
    return `<g transform="translate(${x} ${y}) rotate(${index % 2 ? '.45' : '-.45'} 250 ${cardHeight / 2})" filter="url(#card-shadow)"><rect width="515" height="${cardHeight}" rx="22" fill="#fffdf6" stroke="#193e45" stroke-opacity=".12" stroke-width="2"/><path d="M0 0H145Q122 ${cardHeight * .45} 154 ${cardHeight}H0Z" fill="${wash}" fill-opacity=".72"/>${photo}<text x="${copyX}" y="34" fill="#0e6b72" font-size="13" font-weight="900" letter-spacing="2">STOP ${String(index + 1).padStart(2, '0')} · DAY ${entry.day || 1}</text><text x="${copyX}" y="65" fill="#19343d" font-size="25" font-weight="900">${escapeSvg(truncatePosterText(entry.pointName, hasPhoto ? 16 : 22))}</text><text x="486" y="31" text-anchor="end" fill="#c94f3d" font-size="13" font-weight="800">${escapeSvg(entry.visitedAt)}</text>${notes}</g>`;
  }).join('');
  const citiesText = Array.from(new Set(entries.map((entry) => entry.city))).join(' · ') || '等待出发';
  const dates = entries.map((entry) => entry.visitedAt).filter(Boolean).sort(); const lastDate = dates[dates.length - 1];
  const dateText = dates.length ? dates[0] === lastDate ? dates[0] : `${dates[0]} — ${lastDate}` : new Date().toISOString().slice(0, 10);
  const hiddenCount = Math.max(0, entries.length - visible.length);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1754" height="1754" viewBox="0 0 1754 1754"><defs><filter id="paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".48" numOctaves="3" seed="19"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .12 0"/></filter><filter id="ink-wobble"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2"/></filter><filter id="card-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#19343d" flood-opacity=".12"/></filter><pattern id="paper-grid" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M46 0H0V46" fill="none" stroke="#0e6b72" stroke-opacity=".035" stroke-width="1"/></pattern></defs><rect width="1754" height="1754" fill="#e8ddc8"/><rect x="38" y="38" width="1678" height="1678" rx="34" fill="#fffaf0" stroke="#19343d" stroke-opacity=".18" stroke-width="3"/><rect x="38" y="38" width="1678" height="1678" rx="34" fill="url(#paper-grid)"/><rect x="38" y="38" width="1678" height="1678" rx="34" filter="url(#paper-grain)" opacity=".17"/><path d="M90 265C290 225 530 292 730 244C905 202 1055 259 1125 240" fill="none" stroke="#d49a36" stroke-width="34" stroke-opacity=".18" stroke-linecap="round"/><text x="92" y="105" fill="#0e6b72" font-size="20" font-weight="900" letter-spacing="9">MY HUBEI TRAVEL SKETCHBOOK</text><text x="92" y="190" fill="#19343d" font-size="67" font-weight="900" font-family="KaiTi, STKaiti, serif">我的旅行路线手账</text><text x="96" y="238" fill="#19343d" fill-opacity=".55" font-size="20">${escapeSvg(mode === 'real' ? '真实完成足迹' : '完整行程灵感')} · ${entries.length} 站 · ${escapeSvg(citiesText)} · ${escapeSvg(dateText)}</text><g><rect x="78" y="285" width="1005" height="1370" rx="34" fill="#f9f3e5" stroke="#193e45" stroke-opacity=".14" stroke-width="3"/><path d="M104 590C270 475 392 542 514 492S760 370 1038 462" fill="none" stroke="#78b8bd" stroke-width="72" stroke-opacity=".16" stroke-linecap="round"/><path d="M126 1280C286 1160 407 1210 552 1150S812 1002 1020 1090" fill="none" stroke="#d49a36" stroke-width="95" stroke-opacity=".13" stroke-linecap="round"/><g transform="translate(565 270) scale(.68)" opacity=".075"><path d="${HUBEI_OUTLINE_PATH}" fill="#0e6b72"/></g><path d="M128 470Q285 423 447 469T760 454T1033 481M118 858Q312 793 483 844T810 823T1036 850M134 1390Q300 1338 468 1384T784 1361T1026 1382" fill="none" stroke="#193e45" stroke-opacity=".08" stroke-width="3" filter="url(#ink-wobble)"/><text x="125" y="338" fill="#c94f3d" font-size="16" font-weight="900" letter-spacing="5">ROUTE MAP · 路线点图</text><text x="1025" y="338" text-anchor="end" fill="#19343d" fill-opacity=".42" font-size="15">按本次路线自动缩放 · 非导航地图</text>${points.length > 1 ? `<polyline points="${route}" fill="none" stroke="#fffaf0" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${route}" fill="none" stroke="#0e6b72" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#ink-wobble)"/><polyline points="${route}" fill="none" stroke="#c94f3d" stroke-width="3" stroke-dasharray="3 24" stroke-linecap="round"/>` : ''}${markers}<g transform="translate(130 1570)"><circle cx="0" cy="0" r="12" fill="#c94f3d"/><text x="24" y="6" fill="#19343d" fill-opacity=".55" font-size="16">路线按手账顺序连接</text><path d="M238 0h70" stroke="#0e6b72" stroke-width="8" stroke-linecap="round"/><text x="326" y="6" fill="#19343d" fill-opacity=".55" font-size="16">旅行足迹</text></g></g><text x="1168" y="252" fill="#0e6b72" font-size="17" font-weight="900" letter-spacing="5">TRAVEL NOTES · 手账卡片</text>${cards}${hiddenCount ? `<text x="1680" y="1680" text-anchor="end" fill="#c94f3d" font-size="16" font-weight="900">另有 ${hiddenCount} 站，请在手账中查看</text>` : ''}<g transform="translate(93 1690)"><circle cx="8" cy="-9" r="25" fill="none" stroke="#c94f3d" stroke-width="3" stroke-opacity=".5"/><text x="8" y="-3" text-anchor="middle" fill="#c94f3d" font-size="12" font-weight="900">AI</text><text x="50" y="-3" fill="#19343d" fill-opacity=".52" font-size="17">AI 辅助路线 · 用户本机手账内容 · 照片未上传第三方</text></g><text x="1682" y="1690" text-anchor="end" fill="#0e6b72" font-size="17" font-weight="900">楚游智导 · TRAVEL JOURNAL</text></svg>`;
}

async function inlinePosterPhoto(url?: string) {
  if (!url || url.startsWith('data:')) return url;
  try { const response = await fetch(url); if (!response.ok) return undefined; const blob = await response.blob(); return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
  catch { return undefined; }
}

async function downloadJournalPoster(entries: JournalMapEntry[], mode: 'real' | 'example') {
  const posterEntries = await Promise.all(entries.map(async (entry) => ({ ...entry, photoUrl: await inlinePosterPhoto(entry.photoUrl) })));
  const svg = buildJournalPosterSvg(posterEntries, mode);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('SVG poster render failed')); image.src = svgUrl; });
    const canvas = document.createElement('canvas'); canvas.width = 1754; canvas.height = 1754;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png', .94));
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `我的湖北旅行路线手账-${new Date().toISOString().slice(0, 10)}.png`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally { URL.revokeObjectURL(svgUrl); }
}

function JournalDetail({ entry, photoUrls, onBack, onSave, onDelete, notify }: { entry?: JournalEntry; photoUrls: Record<string, string>; onBack: () => void; onSave: (entry: JournalEntry) => void; onDelete: (entry: JournalEntry) => Promise<void>; notify: ReturnType<typeof useTrip>['notify'] }) {
  if (!entry) return <main className="section-pad py-12"><div className="mx-auto max-w-3xl text-center"><h1 className="font-display text-4xl font-black">没有找到这一页手账</h1><button type="button" onClick={onBack} className="mt-6 rounded-full bg-ink px-5 py-3 font-black text-white">返回旅行手账</button></div></main>;
  return <JournalDetailEditor entry={entry} photoUrls={photoUrls} onBack={onBack} onSave={onSave} onDelete={onDelete} notify={notify} />;
}

function JournalDetailEditor({ entry, photoUrls, onBack, onSave, onDelete, notify }: { entry: JournalEntry; photoUrls: Record<string, string>; onBack: () => void; onSave: (entry: JournalEntry) => void; onDelete: (entry: JournalEntry) => Promise<void>; notify: ReturnType<typeof useTrip>['notify'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ pointName: entry.pointName, city: entry.city, visitedAt: entry.visitedAt, note: entry.note });
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<{ file: File; preview: string }[]>([]);
  const newPhotosRef = useRef<{ file: File; preview: string }[]>([]);
  const [savingChanges, setSavingChanges] = useState(false);
  const visiblePhotoIds = entry.photoIds.filter((id) => !removedPhotoIds.includes(id));
  const photos = visiblePhotoIds.map((id) => ({ id, url: photoUrls[id] })).filter((item): item is { id: string; url: string } => Boolean(item.url));

  useEffect(() => { newPhotosRef.current = newPhotos; }, [newPhotos]);
  useEffect(() => () => newPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview)), []);

  const cancelEditing = () => {
    newPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
    setNewPhotos([]); setRemovedPhotoIds([]); setDraft({ pointName: entry.pointName, city: entry.city, visitedAt: entry.visitedAt, note: entry.note }); setEditing(false);
  };
  const saveChanges = async () => {
    if (!draft.pointName.trim() || !draft.visitedAt) { notify('地点和日期不能为空。', 'error'); return; }
    setSavingChanges(true);
    const savedIds: string[] = [];
    try {
      for (const photo of newPhotos) savedIds.push(await savePhoto(await compressPhoto(photo.file)));
      await Promise.all(removedPhotoIds.map(deletePhoto));
      onSave({ ...entry, pointName: draft.pointName.trim(), city: draft.city, visitedAt: draft.visitedAt, note: draft.note.trim(), photoIds: [...visiblePhotoIds, ...savedIds] });
      newPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      setNewPhotos([]); setRemovedPhotoIds([]); setEditing(false); notify('手账详细内容已更新。', 'success');
    } catch (error) {
      await Promise.all(savedIds.map(deletePhoto));
      console.error('Journal detail update failed', error); notify('手账修改保存失败，请检查浏览器存储空间。', 'error');
    } finally { setSavingChanges(false); }
  };

  return <main className="section-pad py-10"><div className="mx-auto max-w-4xl"><div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm"><ArrowLeft className="h-4 w-4"/>返回路线手账</button><div className="flex gap-2">{editing ? <><button type="button" onClick={cancelEditing} className="rounded-full bg-white px-4 py-2 text-sm font-black shadow-sm">取消</button><button type="button" disabled={savingChanges} onClick={saveChanges} className="inline-flex items-center gap-2 rounded-full bg-river px-4 py-2 text-sm font-black text-white shadow-sm"><Save className="h-4 w-4"/>{savingChanges ? '保存中…' : '保存修改'}</button></> : <><button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-black text-white"><Pencil className="h-4 w-4"/>编辑这一页</button><button type="button" aria-label="删除这一页手账" onClick={() => window.confirm('确定删除这一页手账和照片吗？') && onDelete(entry)} className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 className="h-4 w-4"/></button></>}</div></div><article className="journal-a4-page journal-notebook-lines relative mt-6 overflow-hidden rounded-[1.5rem] border border-ink/10 px-8 pb-14 pt-8 shadow-[0_30px_90px_rgba(18,34,42,.16)] md:px-14 md:pt-12">
    <div className="absolute bottom-0 left-9 top-0 w-px bg-tower/20" />
    <section className="relative z-10 overflow-hidden rounded-[1.25rem] bg-ink/[.04]">{photos.length > 0 || newPhotos.length > 0 ? <div className="grid grid-cols-2 gap-2">{photos.map(({ id, url }, index) => <div key={id} className="relative"><img src={url} alt={`${entry.pointName}记录照片${index + 1}`} className="aspect-[4/3] w-full object-cover" />{editing && <button type="button" aria-label="移除照片" onClick={() => setRemovedPhotoIds([...removedPhotoIds, id])} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"><X className="h-4 w-4"/></button>}</div>)}{newPhotos.map((photo, index) => <div key={photo.preview} className="relative"><img src={photo.preview} alt={`新增照片${index + 1}`} className="aspect-[4/3] w-full object-cover"/><button type="button" aria-label="移除新增照片" onClick={() => { URL.revokeObjectURL(photo.preview); setNewPhotos(newPhotos.filter((item) => item !== photo)); }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"><X className="h-4 w-4"/></button></div>)}</div> : <div className="grid aspect-[16/7] place-items-center text-center text-ink/30"><div><Camera className="mx-auto h-9 w-9"/><p className="mt-2 text-sm font-black">这一页没有照片</p></div></div>}{editing && <label className="flex cursor-pointer items-center justify-center gap-2 border-t border-dashed border-river/30 bg-white/70 px-4 py-4 text-sm font-black text-river"><ImagePlus className="h-4 w-4"/>添加照片<input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { const files = Array.from(event.target.files ?? []); setNewPhotos([...newPhotos, ...files.slice(0, Math.max(0, 6 - visiblePhotoIds.length - newPhotos.length)).map((file) => ({ file, preview: URL.createObjectURL(file) }))]); event.currentTarget.value = ''; }}/></label>}</section>
    <header className="relative z-10 mt-8 border-b-2 border-ink/10 pb-6 pl-4"><div className="text-xs font-black uppercase tracking-[.22em] text-river">My Hubei Travel Note</div>{editing ? <div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="地点" htmlFor="detail-place"><input id="detail-place" value={draft.pointName} onChange={(event) => setDraft({ ...draft, pointName: event.target.value })} className="w-full rounded-xl border border-ink/10 bg-white px-4 py-3 font-black"/></Field><Field label="日期" htmlFor="detail-date"><input id="detail-date" type="date" value={draft.visitedAt} onChange={(event) => setDraft({ ...draft, visitedAt: event.target.value })} className="w-full rounded-xl border border-ink/10 bg-white px-4 py-3"/></Field><Field label="城市" htmlFor="detail-city"><select id="detail-city" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value as CityName })} className="w-full rounded-xl border border-ink/10 bg-white px-4 py-3">{cities.map((city) => <option key={city.name}>{city.name}</option>)}</select></Field></div> : <><h1 className="journal-handwriting mt-2 text-5xl font-black leading-tight">{entry.pointName}</h1><div className="mt-3 flex flex-wrap gap-3 text-sm font-bold text-ink/45"><span>{entry.city}</span><span>·</span><time>{formatJournalDate(entry.visitedAt)}</time></div></>}</header>
    <section className="relative z-10 min-h-[360px] pl-4 pt-6">{editing ? <textarea aria-label="手账心得" rows={12} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="journal-handwriting w-full resize-none rounded-2xl border border-ink/10 bg-white/75 p-5 text-2xl leading-[2rem] text-ink/76"/> : <p className="journal-handwriting whitespace-pre-wrap text-2xl leading-[2rem] text-ink/76">{entry.note || '这一站没有留下文字，但照片已经替我记住了当时的光。'}</p>}</section>
  </article></div></main>;
}

function formatJournalDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(parseLocalDate(value.slice(0, 10))); }
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-black text-ink/65">{label}</label>{children}</div>; }
