import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Interest } from '../domain/trip';
import type { CityName } from '../data/mockData';
import { cityShowcaseItems, wuhanShowcaseMedia } from '../data/cityShowcaseData';
import { CityShowcase } from './CityShowcase';

vi.mock('../services/showcaseMediaService', () => ({
  getConfiguredWuhanMediaId: vi.fn().mockResolvedValue(undefined),
}));

function ShowcaseHarness({ onStartPlanning = () => undefined }: { onStartPlanning?: () => void }) {
  const [city, setCity] = useState<CityName>('宜昌');
  const [interests, setInterests] = useState<Interest[]>([]);
  return <CityShowcase city={city} interests={interests} onCityChange={setCity} onInterestAdd={(interest) => setInterests((current) => current.includes(interest) ? current : [...current, interest])} onStartPlanning={onStartPlanning} />;
}

describe('CityShowcase', () => {
  it('uses the user-provided ancient architecture image for Xiangyang without changing its motion settings', () => {
    const xiangyang = cityShowcaseItems.find((item) => item.city === '襄阳');
    expect(xiangyang?.imageUrl).toContain('/cities/xiangyang-zhaoming-platform.png');
    expect(xiangyang?.mobileImageUrl).toContain('/cities/xiangyang-zhaoming-platform.png');
    expect(xiangyang?.motion).toEqual({ fromX: '-.8%', fromY: '.15%', toX: '.45%', toY: '-.3%' });
  });
  it('武汉图库只保留适合宽屏展示的三张高清横图', () => {
    expect(wuhanShowcaseMedia).toHaveLength(3);
    expect(wuhanShowcaseMedia.every((media) => media.imageUrl === media.mobileImageUrl)).toBe(true);
    expect(wuhanShowcaseMedia.map((media) => media.id)).toEqual(['river-bridge-night', 'river-skyline', 'lakes-skyline']);
  });

  it('页面保持聚焦时每五秒自动进入下一座城市', () => {
    vi.useFakeTimers();
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const view = render(<ShowcaseHarness />);

    expect(screen.getByRole('heading', { name: '宜昌' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.getByRole('heading', { name: '宜昌' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: '武汉' })).toBeInTheDocument();

    view.unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
    focus.mockRestore();
  });

  it('编号、上一项和下一项都同步城市，并把城市标签加入兴趣', async () => {
    const user = userEvent.setup();
    render(<ShowcaseHarness />);
    expect(screen.getByRole('heading', { name: '宜昌' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看武汉' }));
    expect(screen.getByRole('heading', { name: '武汉' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一座城市' }));
    expect(screen.getByRole('heading', { name: '恩施' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '上一座城市' }));
    expect(screen.getByRole('heading', { name: '武汉' })).toBeInTheDocument();
    const interest = screen.getByRole('button', { name: '江城漫步' });
    await user.click(interest);
    expect(interest).toHaveAttribute('aria-pressed', 'true');
  });

  it('支持暂停与开始规划入口', async () => {
    const onStartPlanning = vi.fn();
    const user = userEvent.setup();
    render(<ShowcaseHarness onStartPlanning={onStartPlanning} />);
    const pause = screen.getByRole('button', { name: '暂停自动播放' });
    await user.click(pause);
    const play = screen.getByRole('button', { name: '继续自动播放' });
    expect(play).toHaveAttribute('aria-pressed', 'true');
    await user.click(play);
    expect(screen.getByRole('button', { name: '暂停自动播放' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: '以宜昌开始规划' }));
    expect(onStartPlanning).toHaveBeenCalledOnce();
  });
});
