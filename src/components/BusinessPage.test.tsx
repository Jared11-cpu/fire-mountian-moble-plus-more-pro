import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessPage } from './BusinessPage';

afterEach(() => vi.unstubAllGlobals());

describe('BusinessPage', () => {
  it('shows the AI plan built from AMap-verified places', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      route: ['09:30 前往三峡大坝旅游区'], welcome: '欢迎入住西陵江景民宿', reminders: ['提前预约'], food: ['杜记凉虾，人均约 15 元'],
      videoScript: ['镜头 1'], redbook: '江景民宿', replies: ['可以帮您预约'], unmatchedSpots: ['西坝不夜城'], generatedAt: '2026-10-13T00:00:00Z',
    }), { status: 200 })));
    render(<BusinessPage />);
    await userEvent.click(screen.getByRole('button', { name: /生成住客服务方案/ }));
    expect(await screen.findByText('杜记凉虾，人均约 15 元')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('已由高德核实');
    expect(screen.getByRole('note')).toHaveTextContent('未找到：西坝不夜城');
  });

  it('falls back to the rule template and says so when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '尚未配置通义千问 API Key' }), { status: 503 })));
    render(<BusinessPage />);
    await userEvent.click(screen.getByRole('button', { name: /生成住客服务方案/ }));
    expect(await screen.findByText(/尚未配置通义千问 API Key，已改用规则模板/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('本地规则模板');
  });
});
