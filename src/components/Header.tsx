import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Compass, Home, LayoutGrid, Sparkles } from 'lucide-react';
import type { moreNavItems, navItems } from '../data/mockData';
import { Logo } from './Logo';

type PrimaryPageId = (typeof navItems)[number]['id'];
type MorePageId = (typeof moreNavItems)[number]['id'];
export type HeaderPageId = PrimaryPageId | MorePageId;

type HeaderProps = {
  page: HeaderPageId;
  nav: typeof navItems;
  moreNav: typeof moreNavItems;
  onNavigate: (page: HeaderPageId) => void;
  onStartPlanning: () => void;
};

export function Header({ page, nav, moreNav, onNavigate, onStartPlanning }: HeaderProps) {
  const [overShowcase, setOverShowcase] = useState(page === 'home');
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const dark = overShowcase;
  const moreActive = moreNav.some((item) => item.id === page);

  useEffect(() => {
    setMoreOpen(false);
    setMobileMoreOpen(false);
    // 只有首页有城市轮播；其他页面不必监听整页 DOM 变化。
    if (page !== 'home') { setOverShowcase(false); return; }
    let observedShowcase: HTMLElement | null = null;
    const observer = new IntersectionObserver(([entry]) => setOverShowcase(entry.isIntersecting && entry.boundingClientRect.bottom > 120), { threshold: [0, 0.08] });
    const attach = () => {
      const showcase = document.querySelector<HTMLElement>('[data-city-showcase]');
      // 从首页切到其他页时两者都为 null，也要把顶栏切回浅色。
      if (showcase === observedShowcase) { if (!showcase) setOverShowcase(false); return; }
      if (observedShowcase) observer.unobserve(observedShowcase);
      observedShowcase = showcase;
      if (showcase) observer.observe(showcase);
      else setOverShowcase(false);
    };
    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { mutations.disconnect(); observer.disconnect(); };
  }, [page]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMoreOpen(false); setMobileMoreOpen(false); } };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape); };
  }, []);

  const navigate = (next: HeaderPageId) => { setMoreOpen(false); setMobileMoreOpen(false); onNavigate(next); };
  const currentLabel = [...nav, ...moreNav].find((item) => item.id === page)?.label;
  const mobileTabs: Array<{ id: HeaderPageId; label: string; icon: typeof Home }> = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'planner', label: '规划', icon: Sparkles },
    { id: 'journal', label: '手账', icon: BookOpen },
  ];

  return (
    <>
    <header className={`immersive-header ${dark ? 'is-over-showcase' : 'is-scrolled'}`}>
      <nav aria-label="主导航" className="immersive-nav">
        <button type="button" onClick={() => navigate('home')} aria-label="返回首页" className="immersive-logo"><span className="hidden sm:block"><Logo tone={dark ? 'light' : 'dark'} /></span><span className="sm:hidden"><Logo compact tone={dark ? 'light' : 'dark'} /></span></button>

        <div className="immersive-primary">
          {nav.map((item) => <button type="button" key={item.id} onClick={() => navigate(item.id)} aria-pressed={page === item.id} className={page === item.id ? 'is-active' : ''}>{item.label}</button>)}
          <div ref={moreRef} className="immersive-more">
            <button type="button" aria-expanded={moreOpen} aria-haspopup="menu" className={moreActive ? 'is-active' : ''} onClick={() => setMoreOpen((value) => !value)}>更多<ChevronDown aria-hidden="true" /></button>
            {moreOpen && <div role="menu" className="immersive-more-menu">{moreNav.map((item) => <button type="button" role="menuitem" key={item.id} onClick={() => navigate(item.id)}><span>{item.label}</span><small>{item.id === 'business' ? 'B端服务工具' : item.id === 'dashboard' ? '城市洞察' : '比赛路演'}</small></button>)}</div>}
          </div>
        </div>

        {page !== 'home' && currentLabel && <span className="immersive-mobile-title" aria-hidden="true">{currentLabel}</span>}
        <button type="button" className="immersive-start" onClick={onStartPlanning}>开始规划</button>
      </nav>
    </header>
    <nav aria-label="手机底部导航" className="mobile-tabbar">
      {mobileTabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
      <button type="button" aria-current={moreActive ? 'page' : undefined} aria-expanded={mobileMoreOpen} aria-haspopup="menu" onClick={() => setMobileMoreOpen((value) => !value)}><LayoutGrid aria-hidden="true" /><span>更多</span></button>
      {mobileMoreOpen && <div role="menu" className="mobile-tabbar-more">{moreNav.map((item) => <button type="button" role="menuitem" key={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Compass aria-hidden="true" /><span>{item.label}</span></button>)}</div>}
    </nav>
    </>
  );
}
