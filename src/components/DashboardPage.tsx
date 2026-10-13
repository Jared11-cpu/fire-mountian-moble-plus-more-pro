import { BarChart3, Megaphone, PieChart, TrendingUp } from 'lucide-react';
import { cities, dashboardData } from '../data/mockData';

export function DashboardPage() {
  return (
    <main className="section-pad py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-river">Tourism Data OS</p>
          <h1 className="mt-2 font-display text-4xl font-black text-ink md:text-5xl">城市文旅数据看板</h1>
          <p className="mt-4 max-w-2xl text-ink/65">需求洞察、预算分布与传播关键词。</p>
          <p className="mt-3 inline-flex max-w-2xl rounded-xl border border-tower/25 bg-tower/[0.06] px-3 py-2 text-xs font-bold leading-5 text-tower" role="note">演示数据：以下数字均为内置模拟数据，不代表真实客流或用户统计。</p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardData.overview.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="dark-glass rounded-[1.5rem] p-5 text-white shadow-soft">
                <Icon className="mb-5 h-7 w-7 text-jade" />
                <div className="text-3xl font-black">{item.value}</div>
                <div className="mt-1 text-sm font-bold text-white/55">{item.label}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="glass rounded-[1.75rem] p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-river" />
              <h2 className="font-display text-2xl font-black text-ink">热门城市排行</h2>
            </div>
            <div className="space-y-4">
              {dashboardData.hotCities.map((city, index) => (
                <div key={city.name}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-black text-ink">{index + 1}. {city.name}</span>
                    <span className="font-black text-river">{city.value}</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/80">
                    <div className="h-3 rounded-full bg-gradient-to-r from-river to-jade" style={{ width: `${city.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass rounded-[1.75rem] p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <PieChart className="h-6 w-6 text-river" />
              <h2 className="font-display text-2xl font-black text-ink">游客预算分布</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {dashboardData.budgets.map((budget) => (
                <div key={budget.label} className="rounded-[1.25rem] bg-white/70 p-4">
                  <div className="text-3xl font-black text-ink">{budget.value}%</div>
                  <div className="mt-1 text-sm font-bold text-ink/55">{budget.label}</div>
                  <div className="mt-4 h-2 rounded-full bg-ink/10">
                    <div className="h-2 rounded-full bg-tower" style={{ width: `${budget.value * 2}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass rounded-[1.75rem] p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-river" />
              <h2 className="font-display text-2xl font-black text-ink">热门兴趣标签</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {dashboardData.tags.map((tag) => {
                const Icon = tag.icon;
                return (
                  <div key={tag.name} className="rounded-[1.25rem] bg-white/70 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <Icon className="h-5 w-5 text-river" />
                      <span className="font-black text-ink">{tag.name}</span>
                    </div>
                    <div className="h-2 rounded-full bg-ink/10">
                      <div className="h-2 rounded-full bg-gradient-to-r from-river to-jade" style={{ width: `${tag.value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass rounded-[1.75rem] p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <Megaphone className="h-6 w-6 text-river" />
              <h2 className="font-display text-2xl font-black text-ink">文旅内容传播建议</h2>
            </div>
            <div className="space-y-3">
              {dashboardData.suggestions.map((item) => (
                <div key={item} className="line-clamp-2 rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold leading-6 text-ink/68">{item}</div>
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-3 text-sm font-black text-river">高热度景点</div>
              <div className="flex flex-wrap gap-2">
                {dashboardData.scenic.map((item) => (
                  <span key={item} className="rounded-full bg-ink px-3 py-2 text-sm font-bold text-white">{item}</span>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="relative mt-6 overflow-hidden rounded-[1.75rem] bg-ink p-6 text-white shadow-soft">
          <img src={cities[2].imageUrl} alt="恩施峡谷风景" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-river/50" />
          <div className="relative">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-jade">Keyword Cloud</p>
              <h2 className="mt-2 font-display text-2xl font-black">城市推荐关键词云</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {dashboardData.cloud.map((item, index) => (
              <span
                key={item}
                className="rounded-full bg-white/12 px-4 py-2 font-black backdrop-blur"
                style={{ fontSize: `${14 + (index % 4) * 3}px` }}
              >
                {item}
              </span>
            ))}
          </div>
          </div>
        </section>
      </div>
    </main>
  );
}
