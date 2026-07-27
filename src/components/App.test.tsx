import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { defaultTripRequest, generateTripPlan } from '../domain/trip';
import { TripProvider } from '../state/tripStore';

function renderRoute(path: string) { return render(<MemoryRouter initialEntries={[path]}><TripProvider><App /></TripProvider></MemoryRouter>); }

describe('routes and accessibility', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('首页先展示六城主视觉，点击城市按钮后动态打开 AI 规划面板', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    expect(screen.getByRole('heading', { name: '宜昌' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '懂你，也懂湖北' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '以宜昌开始规划' }));
    expect(await screen.findByRole('dialog', { name: /先说想法/ })).toBeInTheDocument();
    expect(screen.getByLabelText('这次旅行，你最在意什么？')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '宜昌' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /进入 AI 深度规划/ }));
    expect(await screen.findByRole('heading', { name: '懂你，也懂湖北' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '宜昌' })).not.toBeInTheDocument();
  });

  it('直接打开 planner、journal、about 都恢复正确页面', () => {
    const planner = renderRoute('/planner');
    expect(screen.getByRole('heading', { name: '懂你，也懂湖北' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '完善旅行条件' })).toBeInTheDocument();
    expect(screen.queryByText('调整更多条件')).not.toBeInTheDocument();
    expect(screen.getByLabelText('开始日期')).toBeInTheDocument();
    planner.unmount();
    const journal = renderRoute('/journal');
    expect(screen.getByRole('heading', { name: '我的旅行路线手账' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '旅行手账地图' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '记录行程景点' })).toBeInTheDocument();
    journal.unmount();
    renderRoute('/about');
    expect(screen.getByRole('heading', { name: '系统架构图' })).toBeInTheDocument();
  });

  it('导航按钮有 aria-pressed，表单控件有明确标签', () => {
    const { container } = renderRoute('/planner');
    expect(screen.getByRole('button', { name: 'AI 行程' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('预算（元）')).toBeInTheDocument();
    expect(screen.getByLabelText('结束日期')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认手动出发地' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用当前定位' })).toBeInTheDocument();
    expect(container.querySelector('button a, a button')).not.toBeInTheDocument();
  });

  it('返回修改后输入内容不会被强制切回地图结果页', async () => {
    const user = userEvent.setup();
    const request = defaultTripRequest('宜昌');
    const plan = generateTripPlan(request);
    localStorage.setItem('chuyou-app-state-v2', JSON.stringify({ version: 2, request, plan, journalEntries: [] }));
    renderRoute('/planner');

    expect(screen.getByLabelText('总览到达时间')).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: '返回修改' }));
    const prompt = screen.getByLabelText('你想怎样游湖北？');
    await user.type(prompt, ' 希望上午出发');

    expect(screen.getByRole('heading', { name: '懂你，也懂湖北' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回修改' })).not.toBeInTheDocument();
    expect((prompt as HTMLTextAreaElement).value).toContain('希望上午出发');
  });

  it('手动出发地解析真实坐标，当前定位保留为独立入口', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ formattedAddress: '北京市朝阳区建国路88号', location: { lng: 116.457, lat: 39.908 } }), { status: 200 })));
    renderRoute('/planner');

    const origin = screen.getByLabelText('出发地');
    await user.clear(origin);
    await user.type(origin, '北京建国路88号');
    expect(screen.getByText(/解析真实坐标后才能生成/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认手动出发地' }));

    expect(await screen.findByText(/手动起点已解析：北京市朝阳区建国路88号/)).toBeInTheDocument();
    expect(origin).toHaveValue('北京市朝阳区建国路88号');
    expect(screen.getByRole('button', { name: '使用当前定位' })).toBeEnabled();
  });
});
