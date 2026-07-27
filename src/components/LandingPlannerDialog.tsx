import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { examples } from '../data/mockData';
import { cityShowcaseIndex } from '../data/cityShowcaseData';
import { TRAVELERS, type TravelerType } from '../domain/trip';
import { useTrip } from '../state/tripStore';

type Props = {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
};

export function LandingPlannerDialog({ open, onClose, onContinue }: Props) {
  const { request, updateRequest } = useTrip();
  const [leaving, setLeaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setLeaving(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 420);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  const continuePlanning = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onContinue, 320);
  };

  return (
    <div className={`landing-planner-dialog ${leaving ? 'is-leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="landing-planner-title">
      <button type="button" className="landing-planner-backdrop" aria-label="关闭规划面板" onClick={onClose} />
      <section className="landing-planner-sheet">
        <header className="landing-planner-topline">
          <span><i>{String(cityShowcaseIndex(request.destinationCity) + 1).padStart(2, '0')}</i> 城市旅行提案</span>
          <button type="button" aria-label="关闭规划面板" onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <div className="landing-planner-grid">
          <div className="landing-planner-intro">
            <p>AI TRAVEL EDITOR · HUBEI</p>
            <h2 id="landing-planner-title">
              <span>先说想法，</span>
              <span>再启程去{request.destinationCity}</span>
            </h2>
            <span>告诉我们同行的人、停留时间和真正想看的风景。下一步，AI 会结合真实地点与安全时间为你编排路线。</span>
            <div className="landing-planner-city-mark" aria-hidden="true">{request.destinationCity}</div>
          </div>

          <div className="landing-planner-form">
            <label htmlFor="landing-travel-prompt">这次旅行，你最在意什么？</label>
            <textarea
              ref={textareaRef}
              id="landing-travel-prompt"
              rows={5}
              value={request.freeText}
              onChange={(event) => updateRequest({ freeText: event.target.value })}
              placeholder={`例如：想去${request.destinationCity}慢慢走三天，喜欢人文、摄影和当地早餐，希望每天不要太赶。`}
            />

            <div className="landing-planner-suggestions" aria-label="快速写入旅行想法">
              {examples.slice(0, 3).map((example) => (
                <button type="button" key={example.label} onClick={() => updateRequest({ freeText: example.prompt.replace(/宜昌|武汉|恩施/g, request.destinationCity) })}>{example.label}</button>
              ))}
            </div>

            <div className="landing-planner-fields">
              <label>天数<input aria-label="首页规划天数" type="number" min={1} max={15} value={request.days} onChange={(event) => updateRequest({ days: Number(event.target.value) })} /></label>
              <label>预算<input aria-label="首页规划预算" type="number" min={0} value={request.budget} onChange={(event) => updateRequest({ budget: Number(event.target.value) })} /></label>
              <label>同行人<select aria-label="首页规划同行人" value={request.travelerType} onChange={(event) => updateRequest({ travelerType: event.target.value as TravelerType })}>{TRAVELERS.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>

            {request.interests.length > 0 && <div className="landing-planner-interests"><span>已选兴趣</span>{request.interests.map((item) => <i key={item}><Check aria-hidden="true" />{item}</i>)}</div>}

            <button type="button" className="landing-planner-continue" onClick={continuePlanning}>
              <span><Sparkles aria-hidden="true" />进入 AI 深度规划</span><ArrowRight aria-hidden="true" />
            </button>
            <p className="landing-planner-note">进入后可继续调整出发地、日期、饮食与特殊需求</p>
          </div>
        </div>
      </section>
    </div>
  );
}
