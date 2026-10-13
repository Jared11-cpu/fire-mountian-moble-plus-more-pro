import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { GenerationStage } from '../services/travelApi';

const STEPS: Array<{ stage: GenerationStage; label: string; hint: string }> = [
  { stage: 'parse', label: '理解你的需求', hint: '千问识别城市、天数、预算与兴趣' },
  { stage: 'places', label: '检索真实景点', hint: '高德查询候选景点，千问排序' },
  { stage: 'analysis', label: '餐厅、排程与预算分析', hint: '沿最终路线找餐厅，核对预算与兴趣' },
];

type Props = {
  title: string;
  stage: GenerationStage | null;
  startedAt: number | null;
  onCancel: () => void;
};

export function GenerationProgress({ title, stage, startedAt, onCancel }: Props) {
  const elapsed = useElapsedSeconds(startedAt);
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.stage === stage));
  return (
    <section className="planner-thinking generation-progress" aria-live="polite" aria-label="生成进度">
      <div className="generation-progress-head">
        <div>
          <h2>{title}</h2>
          <p>已用时 {elapsed} 秒{elapsed >= 45 ? '，AI 服务较忙，仍在等待返回' : ''}；完成前不会显示规则占位结果。</p>
        </div>
        <button type="button" onClick={onCancel} className="generation-progress-cancel"><X aria-hidden="true" />取消生成</button>
      </div>
      <ol className="generation-progress-steps">
        {STEPS.map((step, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
          return (
            <li key={step.stage} data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="generation-progress-icon">{state === 'done' ? <Check aria-hidden="true" /> : state === 'active' ? <Loader2 className="animate-spin" aria-hidden="true" /> : index + 1}</span>
              <span><strong>{step.label}</strong><small>{step.hint}</small></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function useElapsedSeconds(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}
