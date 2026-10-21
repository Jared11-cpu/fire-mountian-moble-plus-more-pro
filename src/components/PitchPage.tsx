import { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Database, ExternalLink, Map, ShieldCheck, Sparkles } from 'lucide-react';

const coverage = [
  ['武汉', '景点、路线点、餐饮、天气'], ['宜昌', '景点、路线点、餐饮、天气'], ['恩施', '景点、跨区交通覆写、餐饮、天气'],
  ['荆州', '景点、路线点、餐饮、天气'], ['襄阳', '景点、路线点、餐饮、天气'], ['黄石', '景点、路线点、餐饮、天气'],
];

export function PitchPage() {
  return <main className="pitch-page section-pad py-10"><div className="mx-auto max-w-7xl space-y-10">
    <section className="pitch-hero river-line overflow-hidden rounded-[2.5rem] bg-ink p-7 text-white shadow-soft md:p-12"><p className="text-xs font-black uppercase tracking-[.22em] text-jade">VERIFIABLE PRODUCT BRIEF</p><h1 className="mt-4 max-w-4xl font-display text-4xl font-black md:text-6xl">楚游智导 AI：能力与数据来源可核验</h1><p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-white/65">当前产品已接入通义千问与高德 Web 服务：千问负责用户需求提取、推荐排序和分析说明，高德提供真实地点、道路及动态公交/地铁查询。本地手账仍保存在用户设备；车辆 GPS 需获得运营方授权后才能接入。</p></section>

    <Section eyebrow="SYSTEM ARCHITECTURE" title="系统架构图" defaultOpen>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center"><Arch icon={Sparkles} title="统一输入" text="自然语言、城市卡片、表单、日期和定位统一进入旅行请求" /><ArrowRight className="mx-auto hidden text-river md:block" /><Arch icon={Database} title="AI 与事实服务" text="千问提取与排序；高德返回地点、道路和动态公共交通事实" /><ArrowRight className="mx-auto hidden text-river md:block" /><Arch icon={Map} title="可恢复输出" text="可编辑方案、本地手账、照片、分享链接与高德路线协同展示" /></div>
    </Section>

    <Section eyebrow="DELIVERY STATUS" title="已实现与计划实现">
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left text-sm"><thead><tr className="text-ink/45"><th className="px-4 py-2">能力</th><th>当前状态</th><th>可核验说明</th></tr></thead><tbody>{[
        ['自然语言理解', '已实现', '通义千问提取城市、天数、预算、兴趣、人群与饮食需求；失败时规则降级'],
        ['路线生成', '已实现', '本地可解释规则 + 后端高德 Web 服务道路规划；途经点逐段返回真实道路几何'],
        ['本地保存与分享', '已实现', 'localStorage 方案、IndexedDB 照片、HashRouter 压缩分享载荷'],
        ['AI 分析与推荐', '已实现', '千问对用户方案进行分析，并在高德候选集合内排序餐厅与店铺'],
        ['动态公交与地铁', '已实现', '按日期、出发时间和偏好查询，页面每 90 秒刷新；不冒充车辆 GPS 实时位置'],
        ['车辆 GPS / 到站倒计时', '待授权', '需要当地公交或地铁运营方授权数据源后接入'],
        ['用户测试', '尚未开展', '不编造“20名用户测试结果”；完成招募与研究后再公布方法和样本'],
      ].map(([name, status, proof]) => <tr key={name} className="bg-white shadow-sm"><td className="rounded-l-2xl px-4 py-4 font-black">{name}</td><td className={`font-black ${status === '已实现' ? 'text-jade' : 'text-tower'}`}>{status}</td><td className="rounded-r-2xl pr-4 font-semibold text-ink/58">{proof}</td></tr>)}</tbody></table></div>
    </Section>

    <div className="grid gap-6 lg:grid-cols-2">
      <Section eyebrow="APIS & SOURCES" title="实际 API 与数据源">
        <Source name="高德 Web 服务" href="https://lbs.amap.com/api/webservice/summary" note="后端查询真实 POI、驾车道路、公交地铁、票价、站点与步行接驳；密钥不暴露在浏览器。" />
        <Source name="阿里云百炼 / 通义千问" href="https://bailian.console.aliyun.com/" note="提取用户旅行需求、分析方案，并仅在高德返回的真实候选地点内进行推荐排序。" />
        <Source name="Open‑Meteo Forecast API" href="https://open-meteo.com/en/docs" note="天气当前值；页面展示完整更新时间、时区和缓存/降级状态。" />
        <Source name="Wikimedia Commons" href="https://commons.wikimedia.org/" note="城市图片；每张显示作者、原始页和许可证。" />
        <Source name="12306 / 各地文旅局" href="https://www.12306.cn/" note="用于铁路与临时运营信息复核；产品不虚构库存、营业状态或车辆位置。" />
      </Section>
      <Section eyebrow="CITY COVERAGE" title="六城数据覆盖">
        <div className="grid gap-2 sm:grid-cols-2">{coverage.map(([city, scope]) => <div key={city} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2 font-black"><CheckCircle2 className="h-4 w-4 text-jade" />{city}</div><p className="mt-2 text-xs font-semibold leading-5 text-ink/50">{scope}</p></div>)}</div><p className="mt-4 text-xs font-bold text-ink/45">覆盖表示静态演示库中存在条目，不代表景区、餐厅或交通数据完整。</p>
      </Section>
    </div>

    <Section eyebrow="COMPETITIVE CONTEXT" title="竞品对比（能力边界）">
      <div className="grid gap-4 md:grid-cols-3"><Compare name="携程旅行" href="https://www.ctrip.com/" strength="交易、库存与旅行服务链" difference="本项目不做交易，专注可解释的湖北规则路线和本地手账。" /><Compare name="高德地图" href="https://www.amap.com/" strength="地图、导航与实时交通基础设施" difference="本项目使用其地图能力，不声称替代实时导航。" /><Compare name="小红书" href="https://www.xiaohongshu.com/" strength="UGC 灵感与内容社区" difference="本项目不抓取 UGC，只生成可编辑路线与用户本机记录。" /></div>
    </Section>

    <div className="grid gap-6 lg:grid-cols-2"><Section eyebrow="COST & BUSINESS" title="成本与商业模式假设"><p className="text-sm font-semibold leading-7 text-ink/60">以下不是已验证财务数据：静态托管可接近零成本；地图 API 费用取决于高德配额和商业授权；未来若接入模型，按请求量计费。假设的商业方向为文旅机构白标路线页、景区内容维护服务与合规的会员增值，不售卖个人定位或照片。</p></Section><Section eyebrow="PRIVACY & COPYRIGHT" title="隐私与版权"><div className="flex gap-3"><ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-jade" /><p className="text-sm font-semibold leading-7 text-ink/60">方案与手账默认仅保存在浏览器；照片只进入 IndexedDB；分享链接排除照片、真实足迹和定位历史。图片按原始页许可证署名，餐饮与天气来源可点击核验。清除网站数据会导致本地内容丢失。</p></div></Section></div>

    <Section eyebrow="LIVE REPRODUCTION" title="现场可复现演示步骤"><ol className="grid gap-3 md:grid-cols-2">{[
      '进入“AI 行程”，输入：恩施三天两夜，预算1000元，喜欢峡谷和拍照，不吃辣。', '点击“识别条件”，确认城市、3天、1000、自然风光、拍照和不吃辣标签。',
      '点击“AI 增强生成方案”，检查 AI 分析、高德道路、动态交通、餐厅推荐、日期与预算。', '编辑点位备注/预算/每日打卡，切换标签并刷新页面，确认内容恢复。',
      '复制分享 URL，在新标签打开并确认方案恢复且不包含真实手账。', '进入旅行手账：无记录时统计为0；保存文字或照片后才增加真实足迹。',
    ].map((step, index) => <li key={step} className="rounded-2xl bg-white p-4 text-sm font-bold leading-6 shadow-sm"><span className="mr-2 text-river">{index + 1}.</span>{step}</li>)}</ol></Section>
  </div></main>;
}

// 手机上除第一节外默认折叠，电脑上始终展开。
function Section({ eyebrow, title, defaultOpen = false, children }: { eyebrow: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`m-collapse rounded-[2rem] bg-mist/45 p-5 md:p-7 ${open ? 'is-open' : ''}`}><p className="pitch-eyebrow text-[10px] font-black uppercase tracking-[.22em] text-river">{eyebrow}</p><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="m-collapse-head mt-2 mb-5 flex w-full items-center gap-3 text-left"><h2 className="font-display text-3xl font-black">{title}</h2><ChevronDown aria-hidden="true" className="m-collapse-chevron ml-auto h-5 w-5 text-ink/40" /></button><div className="m-collapse-body">{children}</div></section>;
}
function Arch({ icon: Icon, title, text }: { icon: typeof Sparkles; title: string; text: string }) { return <div className="rounded-3xl bg-white p-5 shadow-sm"><Icon className="h-6 w-6 text-river" /><h3 className="mt-3 font-display text-xl font-black">{title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-ink/55">{text}</p></div>; }
function Source({ name, href, note }: { name: string; href: string; note: string }) { return <a href={href} target="_blank" rel="noreferrer" className="mb-3 flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"><div><div className="font-black">{name}</div><p className="mt-1 text-xs font-semibold leading-5 text-ink/50">{note}</p></div><ExternalLink className="h-4 w-4 shrink-0 text-river" /></a>; }
function Compare({ name, href, strength, difference }: { name: string; href: string; strength: string; difference: string }) { return <article className="rounded-3xl bg-white p-5 shadow-sm"><a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-display text-xl font-black text-river">{name}<ExternalLink className="h-4 w-4" /></a><p className="mt-3 text-xs font-black text-ink/45">公开优势</p><p className="mt-1 text-sm font-semibold text-ink/65">{strength}</p><p className="mt-3 text-xs font-black text-ink/45">本项目定位</p><p className="mt-1 text-sm font-semibold leading-6 text-ink/65">{difference}</p></article>; }

