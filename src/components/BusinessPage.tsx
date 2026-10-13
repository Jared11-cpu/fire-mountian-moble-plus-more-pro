import { useState } from 'react';
import { BedDouble, Bot, ClipboardList, Loader2, MessageSquareReply, Sparkles, Video } from 'lucide-react';
import { cities } from '../data/mockData';
import { CITY_NAMES } from '../domain/trip';
import { requestBusinessPlan } from '../services/businessApi';
import { generateBusinessPlan, type BusinessInput, type BusinessPlan } from '../utils/aiGenerator';

export function BusinessPage() {
  const [form, setForm] = useState<BusinessInput & { city: string }>({
    name: '西陵江景民宿',
    city: '宜昌',
    spots: '三峡大坝，滨江公园，西坝不夜城',
    target: '情侣',
  });
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<BusinessPlan>(() => generateBusinessPlan(form));
  const [source, setSource] = useState<'rules' | 'ai'>('rules');
  const [unmatchedSpots, setUnmatchedSpots] = useState<string[]>([]);
  const [toast, setToast] = useState('当前为规则模板示例，点击生成获取 AI 方案');

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setToast('高德核实周边地点，千问生成住客服务方案…');
    try {
      const result = await requestBusinessPlan(form);
      setPlan(result);
      setSource('ai');
      setUnmatchedSpots(result.unmatchedSpots);
      setToast(`已用千问 + 高德生成 ${form.name || '商家'} 的住客服务方案`);
    } catch (error) {
      setPlan(generateBusinessPlan(form));
      setSource('rules');
      setUnmatchedSpots([]);
      setToast(`${error instanceof Error ? error.message : 'AI 服务暂不可用'}，已改用规则模板`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="section-pad py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-river">Business Console</p>
            <h1 className="mt-2 font-display text-4xl font-black text-ink md:text-5xl">民宿/景区 AI 商家后台</h1>
            <p className="mt-4 max-w-2xl text-ink/65">路线、欢迎语、提醒、脚本和客服话术一键生成。</p>
            {source === 'ai'
              ? <p className="mt-3 inline-flex max-w-2xl rounded-xl border border-river/20 bg-river/[0.06] px-3 py-2 text-xs font-bold leading-5 text-river" role="note">周边景点与餐厅已由高德核实，文案由千问生成；价格与营业时间以商家公告为准。{unmatchedSpots.length > 0 && ` 未找到：${unmatchedSpots.join('、')}。`}</p>
              : <p className="mt-3 inline-flex max-w-2xl rounded-xl border border-tower/25 bg-tower/[0.06] px-3 py-2 text-xs font-bold leading-5 text-tower" role="note">当前内容由本地规则模板生成，仅作示例；点击“生成住客服务方案”获取基于真实周边地点的 AI 方案。</p>}
          </div>
          <div className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-soft">{toast}</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <section className="glass rounded-[1.75rem] p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-river/10 text-river">
                <BedDouble className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-black text-ink">商家信息</h2>
                <p className="text-sm text-ink/55">输入越具体，生成越贴近场景</p>
              </div>
            </div>
            <Field label="民宿或景区名称">
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="focus-ring w-full rounded-2xl border border-white/70 bg-white/85 px-4 py-3 font-semibold text-ink shadow-sm"
              />
            </Field>
            <Field label="所在城市">
              <select
                value={form.city}
                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                className="focus-ring w-full rounded-2xl border border-white/70 bg-white/85 px-4 py-3 font-semibold text-ink shadow-sm"
              >
                {CITY_NAMES.map((city) => <option key={city}>{city}</option>)}
              </select>
            </Field>
            <Field label="周边景点">
              <textarea
                value={form.spots}
                onChange={(event) => setForm((prev) => ({ ...prev, spots: event.target.value }))}
                rows={4}
                className="focus-ring w-full resize-none rounded-3xl border border-white/70 bg-white/85 px-4 py-3 leading-7 text-ink shadow-sm"
              />
            </Field>
            <Field label="目标客户">
              <div className="grid grid-cols-3 gap-2">
                {['情侣', '家庭', '学生', '亲子', '老人'].map((target) => (
                  <button
                    key={target}
                    onClick={() => setForm((prev) => ({ ...prev, target }))}
                    className={`rounded-2xl px-3 py-3 text-sm font-black transition active:scale-95 ${
                      form.target === target ? 'bg-ink text-white' : 'bg-white/70 text-ink/70 hover:bg-white'
                    }`}
                  >
                    {target}
                  </button>
                ))}
              </div>
            </Field>
            <button
              onClick={generate}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tower px-5 py-4 font-black text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-[#ba432b] active:scale-95 disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              生成住客服务方案
            </button>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="relative min-h-[230px] overflow-hidden rounded-[1.5rem] bg-ink text-white shadow-soft xl:col-span-2">
              <img src={cities[0].imageUrl} alt="宜昌江景" className="absolute inset-0 h-full w-full object-cover opacity-75" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/35 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="mb-3 inline-flex rounded-full bg-white/16 px-3 py-1 text-sm font-black backdrop-blur">商家 AI 管家</div>
                <h2 className="font-display text-3xl font-black">{form.name || '文旅商家'}</h2>
                <p className="mt-2 text-white/72">把周边资源变成可售卖、可传播的住客服务。</p>
              </div>
            </div>
            <Panel icon={ClipboardList} title="周边一日游路线" items={plan.route} />
            <div className="glass rounded-[1.5rem] p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <Bot className="h-6 w-6 text-river" />
                <h3 className="font-display text-2xl font-black text-ink">民宿欢迎语</h3>
              </div>
              <p className="line-clamp-4 rounded-2xl bg-white/70 p-4 font-semibold leading-8 text-ink/70">{plan.welcome}</p>
            </div>
            <Panel icon={MessageSquareReply} title="客人入住提醒" items={plan.reminders} />
            <Panel icon={ClipboardList} title="周边美食推荐" items={plan.food} />
            <div className="glass rounded-[1.5rem] p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center gap-3">
                <Video className="h-6 w-6 text-tower" />
                <h3 className="font-display text-2xl font-black text-ink">宣传内容生成</h3>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-white/70 p-4">
                  <div className="mb-2 text-sm font-black text-river">民宿短视频宣传脚本</div>
                  <div className="space-y-2">
                    {plan.videoScript.map((item) => (
                      <p key={item} className="line-clamp-2 rounded-xl bg-ink/5 px-3 py-2 text-sm font-semibold leading-6 text-ink/68">{item}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/70 p-4">
                  <div className="mb-2 text-sm font-black text-river">小红书种草文案</div>
                  <p className="line-clamp-4 leading-7 text-ink/70">{plan.redbook}</p>
                  <div className="mt-4 text-sm font-black text-river">客服自动回复话术</div>
                  <div className="mt-2 space-y-2">
                    {plan.replies.map((reply) => (
                      <p key={reply} className="line-clamp-2 rounded-xl bg-ink/5 px-3 py-2 text-sm font-semibold leading-6 text-ink/68">{reply}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-sm font-black text-ink/72">{label}</span>
      {children}
    </label>
  );
}

function Panel({ icon: Icon, title, items }: { icon: typeof ClipboardList; title: string; items: string[] }) {
  return (
    <div className="glass rounded-[1.5rem] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-6 w-6 text-river" />
        <h3 className="font-display text-2xl font-black text-ink">{title}</h3>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="line-clamp-2 rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold leading-6 text-ink/68">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
