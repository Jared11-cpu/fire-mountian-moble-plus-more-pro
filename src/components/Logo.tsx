export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark relative grid shrink-0 place-items-center overflow-hidden rounded-[28%] text-white ${compact ? 'h-10 w-10' : 'h-14 w-14'}`}>
      <svg viewBox="0 0 64 64" role="img" aria-label="楚游智导 AI 标识" className="h-full w-full">
        <path d="M12 42 C19 36 23 26 30 22 C35 28 38 33 43 34 C47 34 50 31 53 27" fill="none" stroke="#F8FFFC" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 46 C24 49 35 48 48 43" fill="none" stroke="#8EE6CC" strokeWidth="2.8" strokeLinecap="round"/>
        <circle cx="52" cy="24" r="4" fill="#F8FFFC" stroke="#F8FFFC" strokeWidth="1.5"/>
        <path d="M46 49 V55 M43 52 H49" stroke="#F8FFFC" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export function Logo({ tone = 'dark', compact = false }: { tone?: 'dark' | 'light'; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark compact={compact} />
      <div className="leading-none">
        <div className="flex items-end gap-1.5 whitespace-nowrap">
          <span className={`font-display font-black tracking-[.08em] ${compact ? 'text-base' : 'text-[1.32rem]'} ${tone === 'light' ? 'text-white' : 'text-ink'}`}>楚游</span>
          {!compact && <span className={`pb-[2px] text-[.95rem] font-black tracking-[.12em] ${tone === 'light' ? 'text-white/72' : 'text-river'}`}>智导</span>}
          <span className="mb-[1px] rounded-md bg-river px-1.5 py-1 text-[8px] font-black leading-none tracking-[0.12em] text-white">AI</span>
        </div>
        {!compact && <div className={`mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[8px] font-black tracking-[0.2em] ${tone === 'light' ? 'text-white/48' : 'text-ink/48'}`}><span className={`h-px w-4 ${tone === 'light' ? 'bg-white/42' : 'bg-jade'}`} />湖北 · AI 旅行智能体</div>}
      </div>
    </div>
  );
}
