import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, Pause, Play } from 'lucide-react';
import type { Interest } from '../domain/trip';
import { cityShowcaseIndex, cityShowcaseItems, randomWuhanShowcaseMediaId, resolveCityShowcaseItem, wuhanShowcaseMedia } from '../data/cityShowcaseData';
import type { CityName } from '../data/mockData';
import { getConfiguredWuhanMediaId } from '../services/showcaseMediaService';

const AUTOPLAY_MS = 5_000;
const TRANSITION_MS = 840;

type Props = {
  city: CityName;
  interests: Interest[];
  onCityChange: (city: CityName) => void;
  onInterestAdd: (interest: Interest) => void;
  onStartPlanning: () => void;
  externallyPaused?: boolean;
};

export function CityShowcase({ city, interests, onCityChange, onInterestAdd, onStartPlanning, externallyPaused = false }: Props) {
  const activeIndex = cityShowcaseIndex(city);
  const activeBase = cityShowcaseItems[activeIndex];
  const [wuhanMediaId, setWuhanMediaId] = useState(randomWuhanShowcaseMediaId);
  const active = useMemo(() => resolveCityShowcaseItem(activeBase, wuhanMediaId), [activeBase, wuhanMediaId]);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [userPaused, setUserPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [windowFocused, setWindowFocused] = useState(() => typeof document === 'undefined' || document.hasFocus());
  const [reducedMotion, setReducedMotion] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);
  const activeIndexRef = useRef(activeIndex);
  const clearPreviousTimer = useRef<number>();
  const autoplayRemaining = useRef(AUTOPLAY_MS);
  const autoplayStartedAt = useRef(0);
  const hasVisitedWuhan = useRef(false);

  const chooseIndex = useCallback((nextIndex: number, nextDirection?: 1 | -1) => {
    const normalized = (nextIndex + cityShowcaseItems.length) % cityShowcaseItems.length;
    if (normalized === activeIndexRef.current) return;
    const currentIndex = activeIndexRef.current;
    const inferredDirection = nextDirection ?? (normalized > currentIndex ? 1 : -1);
    setDirection(inferredDirection);
    setPreviousIndex(currentIndex);
    activeIndexRef.current = normalized;
    setTransitionKey((value) => value + 1);
    onCityChange(cityShowcaseItems[normalized].city);
  }, [onCityChange]);

  const goNext = useCallback(() => chooseIndex(activeIndexRef.current + 1, 1), [chooseIndex]);
  const goPrevious = useCallback(() => chooseIndex(activeIndexRef.current - 1, -1), [chooseIndex]);
  const effectivelyPaused = userPaused || interactionPaused || externallyPaused || !pageVisible || !windowFocused || reducedMotion;

  useEffect(() => {
    if (activeBase.city !== '武汉') return;
    let current = true;
    if (hasVisitedWuhan.current) setWuhanMediaId(randomWuhanShowcaseMediaId());
    hasVisitedWuhan.current = true;
    void getConfiguredWuhanMediaId(wuhanShowcaseMedia.map((media) => media.id)).then((configuredId) => {
      if (current && configuredId) setWuhanMediaId(configuredId);
    });
    return () => { current = false; };
  }, [activeBase.city]);

  useEffect(() => {
    if (activeIndexRef.current !== activeIndex) {
      if (previousIndex === null) setPreviousIndex(activeIndexRef.current);
      activeIndexRef.current = activeIndex;
      setTransitionKey((value) => value + 1);
    }
    window.clearTimeout(clearPreviousTimer.current);
    clearPreviousTimer.current = window.setTimeout(() => setPreviousIndex(null), reducedMotion ? 0 : TRANSITION_MS + 80);
    return () => window.clearTimeout(clearPreviousTimer.current);
  }, [activeIndex, previousIndex, reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const focus = () => setWindowFocused(true);
    const blur = () => setWindowFocused(false);
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('focus', focus); window.removeEventListener('blur', blur); };
  }, []);

  useEffect(() => {
    autoplayRemaining.current = AUTOPLAY_MS;
  }, [activeIndex]);

  useEffect(() => {
    if (effectivelyPaused) return;
    autoplayStartedAt.current = Date.now();
    const timer = window.setTimeout(goNext, autoplayRemaining.current);
    return () => {
      window.clearTimeout(timer);
      autoplayRemaining.current = Math.max(80, autoplayRemaining.current - (Date.now() - autoplayStartedAt.current));
    };
  }, [activeIndex, effectivelyPaused, goNext]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); goPrevious(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious]);

  useEffect(() => {
    const next = resolveCityShowcaseItem(cityShowcaseItems[(activeIndex + 1) % cityShowcaseItems.length], wuhanMediaId);
    const preload = new Image();
    preload.fetchPriority = 'high';
    preload.src = window.matchMedia('(max-width: 767px)').matches ? next.mobileImageUrl : next.imageUrl;
  }, [activeIndex, wuhanMediaId]);

  const previous = previousIndex === null ? null : resolveCityShowcaseItem(cityShowcaseItems[previousIndex], wuhanMediaId);
  const numberStyle = useMemo(() => ({ '--city-direction': direction } as CSSProperties), [direction]);

  return (
    <section className={`city-showcase ${effectivelyPaused ? 'is-media-paused' : ''}`} aria-roledescription="carousel" aria-label="湖北六城视觉轮播" data-city-showcase>
      <div className="city-showcase-media" aria-hidden="true">
        {previous && <CityImage key={`previous-${previous.city}`} item={previous} priority="low" exiting />}
        <CityImage key={`active-${active.city}-${active.mediaId ?? 'default'}-${transitionKey}`} item={active} priority="high" />
        <div className="city-showcase-shade" />
        <div className="city-showcase-frame" />
      </div>

      <div className="city-showcase-layout">
        <div className="city-showcase-copy">
          <p key={`eyebrow-${transitionKey}`} className="city-showcase-eyebrow">{active.eyebrow}</p>
          <div className="city-showcase-title-clip">
            <h1 key={`title-${transitionKey}`} className="city-showcase-title">{active.city}</h1>
          </div>
          <div key={`details-${transitionKey}`} className="city-showcase-details">
            <p className="city-showcase-description">{active.description}</p>
            <div className="city-showcase-tags" aria-label={`${active.city}旅行兴趣`} onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)}>
              {active.tags.map((tag) => {
                const selected = interests.includes(tag.interest);
                return <button key={tag.label} type="button" aria-pressed={selected} onClick={() => onInterestAdd(tag.interest)}>{selected && <Check aria-hidden="true" />}{tag.label}</button>;
              })}
            </div>
            <button type="button" className="city-showcase-cta" onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)} onClick={onStartPlanning}>以{active.city}开始规划<ArrowRight aria-hidden="true" /></button>
          </div>
        </div>

        <div key={`number-${transitionKey}`} className="city-showcase-identity" style={numberStyle} aria-live="polite">
          <span>{String(activeIndex + 1).padStart(2, '0')}<i>—{String(cityShowcaseItems.length).padStart(2, '0')}</i></span>
          <strong>{active.theme}</strong>
        </div>

        <div className="city-showcase-controls" onMouseEnter={() => setInteractionPaused(true)} onMouseLeave={() => setInteractionPaused(false)}>
          <div className="city-showcase-index" aria-label="选择城市">
            {cityShowcaseItems.map((item, index) => <button key={item.city} type="button" aria-label={`查看${item.city}`} aria-current={index === activeIndex ? 'true' : undefined} onClick={() => chooseIndex(index)}>{String(index + 1).padStart(2, '0')}</button>)}
          </div>
          <div className="city-showcase-actions">
            <button type="button" onClick={goPrevious} aria-label="上一座城市"><ArrowLeft aria-hidden="true" />PREV</button>
            <button type="button" onClick={() => setUserPaused((value) => !value)} aria-label={userPaused ? '继续自动播放' : '暂停自动播放'} aria-pressed={userPaused}>{userPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{userPaused ? 'PLAY' : 'PAUSE'}</button>
            <button type="button" onClick={goNext} aria-label="下一座城市">NEXT<ArrowRight aria-hidden="true" /></button>
          </div>
          <div className="city-showcase-progress" aria-hidden="true"><span key={`progress-${active.city}-${transitionKey}`} className={effectivelyPaused ? 'is-paused' : ''} /></div>
        </div>

        {active.imageCredit.sourceUrl
          ? <a className="city-showcase-credit" href={active.imageCredit.sourceUrl} target="_blank" rel="noreferrer">IMAGE · {active.imageCredit.author}</a>
          : <span className="city-showcase-credit">IMAGE · {active.imageCredit.author}</span>}
      </div>
    </section>
  );
}

function CityImage({ item, priority, exiting = false }: { item: (typeof cityShowcaseItems)[number]; priority: 'high' | 'low'; exiting?: boolean }) {
  const motionStyle = {
    '--city-object-position': item.objectPosition,
    '--city-mobile-object-position': item.mobileObjectPosition ?? item.objectPosition,
    '--city-motion-from-x': item.motion.fromX,
    '--city-motion-from-y': item.motion.fromY,
    '--city-motion-to-x': item.motion.toX,
    '--city-motion-to-y': item.motion.toY,
  } as CSSProperties;
  return <div className={`city-showcase-picture ${exiting ? 'is-exiting' : 'is-entering'} ${item.city === '武汉' ? 'is-wuhan' : ''}`}>
    <picture>
      <source media="(max-width: 767px)" srcSet={item.mobileImageUrl} />
      <img className="city-showcase-main-image" src={item.imageUrl} alt="" {...{ fetchpriority: priority }} loading="eager" decoding="async" style={motionStyle} />
    </picture>
  </div>;
}
