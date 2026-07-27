import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import type { moreNavItems, navItems } from '../data/mockData';
import { cityNumber } from '../data/cityShowcaseData';
import { useTrip } from '../state/tripStore';
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
  const { request } = useTrip();
  const [overShowcase, setOverShowcase] = useState(page === 'home');
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const dark = overShowcase;
  const moreActive = moreNav.some((item) => item.id === page);

  useEffect(() => {
    setMoreOpen(false);
    setMobileOpen(false);
    let observedShowcase: HTMLElement | null = null;
    const observer = new IntersectionObserver(([entry]) => setOverShowcase(entry.isIntersecting && entry.boundingClientRect.bottom > 120), { threshold: [0, 0.08] });
    const attach = () => {
      const showcase = document.querySelector<HTMLElement>('[data-city-showcase]');
      if (showcase === observedShowcase) return;
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
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMoreOpen(false); setMobileOpen(false); } };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', escape); };
  }, []);

  const navigate = (next: HeaderPageId) => { setMoreOpen(false); setMobileOpen(false); onNavigate(next); };

  return (
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

        <div className="immersive-mobile-city" aria-label={`当前城市编号 ${cityNumber(request.destinationCity)}`}><span>{cityNumber(request.destinationCity)}</span><i>/ 06</i></div>
        <button type="button" className="immersive-start" onClick={onStartPlanning}>开始规划</button>
        <button type="button" className="immersive-mobile-toggle" aria-label={mobileOpen ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)}>{mobileOpen ? <X /> : <Menu />}</button>

        {mobileOpen && <div className="immersive-mobile-menu">{[...nav, ...moreNav].map((item) => <button type="button" key={item.id} onClick={() => navigate(item.id)} aria-current={page === item.id ? 'page' : undefined}>{item.label}</button>)}<button type="button" className="is-start" onClick={() => { setMobileOpen(false); onStartPlanning(); }}>开始规划</button></div>}
      </nav>
    </header>
  );
}
