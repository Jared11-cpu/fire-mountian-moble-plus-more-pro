import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTripRequest } from '../domain/trip';
import type { RoutePoint } from '../types/route';
import { enrichTripPlanWithBackend, parseTravelRequestWithAi } from '../services/travelApi';
import { GENERATION_DEADLINE_MS, TripProvider, useTrip } from './tripStore';

vi.mock('../services/travelApi', () => ({
  parseTravelRequestWithAi: vi.fn(),
  enrichTripPlanWithBackend: vi.fn(),
  isTimeoutError: (error: unknown) => error instanceof DOMException && error.name === 'TimeoutError',
}));

function Harness() {
  const { request, plan, isGenerating, generationStage, generateFromText, cancelGeneration } = useTrip();
  return <div>
    <output data-testid="generating">{String(isGenerating)}</output>
    <output data-testid="stage">{generationStage ?? ''}</output>
    <button onClick={cancelGeneration}>取消</button>
    <output data-testid="source">{plan?.generationSource ?? 'none'}</output>
    <output data-testid="summary">{plan?.content.summary ?? ''}</output>
    <output data-testid="departure">{plan?.settings.departureTime ?? ''}</output>
    <output data-testid="arrival">{plan?.route.points[plan.route.points.length - 1]?.time ?? ''}</output>
    <output data-testid="city">{request.destinationCity}</output>
    <output data-testid="schedule-status">{plan?.trustNotes?.schedule ? `${plan.trustNotes.schedule.source}:${plan.trustNotes.schedule.status}` : ''}</output>
    <output data-testid="data-gaps">{plan?.trustNotes?.analysis?.dataGaps.join('|') ?? ''}</output>
    <button onClick={() => { void generateFromText('武汉两天，必须去武汉长江大桥').catch(() => undefined); }}>生成最终方案</button>
    <button onClick={() => { void generateFromText('襄阳两天一夜，喜欢拍照和美食').catch(() => undefined); }}>生成襄阳方案</button>
  </div>;
}

describe('AI plan publication', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(parseTravelRequestWithAi).mockResolvedValue({
      city: '武汉', startDate: null, days: 2, people: null, budgetPerPerson: 600,
      interests: ['历史文化'], dietaryNeeds: [], mobility: null, transportPreference: null,
      hotelPreference: null, departureDeadline: null, requestedPlaces: ['武汉长江大桥'],
      avoidPlaces: [], travelStyle: null,
    });
  });

  it('keeps the rule draft hidden and publishes only the completed Qwen/AMap result', async () => {
    let finish!: (value: Awaited<ReturnType<typeof enrichTripPlanWithBackend>>) => void;
    vi.mocked(enrichTripPlanWithBackend).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<TripProvider><Harness /></TripProvider>);

    await userEvent.click(screen.getByText('生成最终方案'));
    await waitFor(() => expect(screen.getByTestId('generating')).toHaveTextContent('true'));
    expect(screen.getByTestId('source')).toHaveTextContent('none');
    expect(screen.getByTestId('summary')).toBeEmptyDOMElement();

    const request = defaultTripRequest('武汉');
    const routePoint: RoutePoint = {
      id: 'amap-bridge', name: '武汉长江大桥', type: 'scenic', city: '武汉', lng: 114.288, lat: 30.55,
      coordinateSystem: 'gcj02', time: '09:00', stayMinutes: 90, reason: '用户明确要求且已由高德核验。',
      photoTip: '拍摄桥体与江景。', recordTip: '记录过江体验。', day: 1,
    };
    const draft = vi.mocked(enrichTripPlanWithBackend).mock.calls[0][0];
    await act(async () => finish({
      analysis: '最终千问分析：路线包含用户指定的武汉长江大桥。', routePoints: [routePoint], foods: [],
      schedule: { departureTime: '07:45', items: [{ id: draft.route.startPoint.id, day: 1, arrivalTime: '08:00', reason: '安全抵达起点' }, { id: routePoint.id, day: 1, arrivalTime: '15:00', reason: '预留充分交通时间' }], safetyNotes: ['避免夜间赶路'] },
    }));

    await waitFor(() => expect(screen.getByTestId('generating')).toHaveTextContent('false'));
    expect(screen.getByTestId('source')).toHaveTextContent('qwen-amap');
    expect(screen.getByTestId('summary')).toHaveTextContent('最终千问分析');
    expect(screen.getByTestId('departure')).toHaveTextContent('07:45');
    expect(screen.getByTestId('arrival')).toHaveTextContent('15:00');
    expect(request.destinationCity).toBe('武汉');
  });

  it('reports stages and lets the user cancel without publishing a plan', async () => {
    let seenSignal: AbortSignal | undefined;
    vi.mocked(enrichTripPlanWithBackend).mockImplementation((_plan, _request, options) => {
      seenSignal = options?.signal;
      options?.onStage?.('places');
      return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('生成已取消', 'AbortError'))));
    });
    render(<TripProvider><Harness /></TripProvider>);

    await userEvent.click(screen.getByText('生成最终方案'));
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('places'));
    await userEvent.click(screen.getByText('取消'));

    await waitFor(() => expect(screen.getByTestId('generating')).toHaveTextContent('false'));
    expect(seenSignal?.aborted).toBe(true);
    expect(screen.getByTestId('stage')).toBeEmptyDOMElement();
    expect(screen.getByTestId('source')).toHaveTextContent('none');
  });

  it('stops the whole generation at the overall deadline and names the stuck stage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let seenSignal: AbortSignal | undefined;
    vi.mocked(enrichTripPlanWithBackend).mockImplementation((_plan, _request, options) => {
      seenSignal = options?.signal;
      options?.onStage?.('places');
      return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(options.signal!.reason)));
    });
    render(<TripProvider><Harness /></TripProvider>);

    fireEvent.click(screen.getByText('生成最终方案'));
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('places'));
    await act(async () => { vi.advanceTimersByTime(GENERATION_DEADLINE_MS + 10); });

    await waitFor(() => expect(screen.getByTestId('generating')).toHaveTextContent('false'));
    expect(seenSignal?.aborted).toBe(true);
    expect(seenSignal?.reason).toMatchObject({ name: 'TimeoutError' });
    expect(screen.getByText(/检索真实地点/)).toBeInTheDocument();
    expect(screen.getByTestId('source')).toHaveTextContent('none');
  });

  it('never lets a superseded generation overwrite the newer plan', async () => {
    const routePoint = (id: string, name: string, city: RoutePoint['city']): RoutePoint => ({
      id, name, type: 'scenic', city, lng: 112.1, lat: 32.0, coordinateSystem: 'gcj02', time: '09:00', stayMinutes: 60,
      reason: '高德核验。', photoTip: '拍照。', recordTip: '记录。', day: 1,
    });
    const finishers: Array<(value: Awaited<ReturnType<typeof enrichTripPlanWithBackend>>) => void> = [];
    vi.mocked(enrichTripPlanWithBackend).mockImplementation(() => new Promise((resolve) => { finishers.push(resolve); }));
    render(<TripProvider><Harness /></TripProvider>);

    await userEvent.click(screen.getByText('生成最终方案'));
    await waitFor(() => expect(finishers).toHaveLength(1));
    await userEvent.click(screen.getByText('生成襄阳方案'));
    await waitFor(() => expect(finishers).toHaveLength(2));

    await act(async () => finishers[1]({ analysis: '方案B', routePoints: [routePoint('b', '古隆中', '襄阳')], foods: [] }));
    await waitFor(() => expect(screen.getByTestId('summary')).toHaveTextContent('方案B'));
    await act(async () => finishers[0]({ analysis: '方案A', routePoints: [routePoint('a', '黄鹤楼', '武汉')], foods: [] }));
    expect(screen.getByTestId('summary')).toHaveTextContent('方案B');
  });

  it('does not apply fake times when the schedule is infeasible, and keeps data gaps', async () => {
    let finish!: (value: Awaited<ReturnType<typeof enrichTripPlanWithBackend>>) => void;
    vi.mocked(enrichTripPlanWithBackend).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<TripProvider><Harness /></TripProvider>);
    await userEvent.click(screen.getByText('生成最终方案'));
    await waitFor(() => expect(vi.mocked(enrichTripPlanWithBackend)).toHaveBeenCalled());
    const draft = vi.mocked(enrichTripPlanWithBackend).mock.calls[0][0];
    const routePoint: RoutePoint = {
      id: 'amap-bridge', name: '武汉长江大桥', type: 'scenic', city: '武汉', lng: 114.288, lat: 30.55,
      coordinateSystem: 'gcj02', time: '09:00', stayMinutes: 90, reason: '高德核验。', photoTip: '拍照。', recordTip: '记录。', day: 1,
    };
    await act(async () => finish({
      analysis: '分析', routePoints: [routePoint], foods: [], analysisNotes: { assumptions: [], dataGaps: ['门票价格缺失'] },
      schedule: { departureTime: '08:30', source: 'rules', status: 'infeasible', infeasibleDays: [{ day: 1, pointIds: [routePoint.id], suggestion: '请删减' }], items: [{ id: draft.route.startPoint.id, day: 1, arrivalTime: '08:45', reason: 'x' }, { id: routePoint.id, day: 1, arrivalTime: null, overflow: true, reason: 'x' }], safetyNotes: ['请删减'] },
    }));
    await waitFor(() => expect(screen.getByTestId('schedule-status')).toHaveTextContent('rules:infeasible'));
    expect(screen.getByTestId('arrival')).not.toHaveTextContent('22:');
    expect(screen.getByTestId('data-gaps')).toHaveTextContent('门票价格缺失');
  });

  it('keeps the city explicitly written by the user when AI returns another supported city', async () => {
    vi.mocked(parseTravelRequestWithAi).mockResolvedValue({
      city: '黄石', startDate: null, days: 2, people: null, budgetPerPerson: 600,
      interests: ['拍照', '美食'], dietaryNeeds: [], mobility: null, transportPreference: null,
      hotelPreference: null, departureDeadline: null, requestedPlaces: [],
      avoidPlaces: [], travelStyle: null,
    });
    const routePoint: RoutePoint = {
      id: 'amap-gulongzhong', name: '古隆中', type: 'scenic', city: '襄阳', lng: 112.04, lat: 31.99,
      coordinateSystem: 'gcj02', time: '09:00', stayMinutes: 120, reason: '襄阳代表性景点。',
      photoTip: '拍摄山门与古建。', recordTip: '记录三国文化。', day: 1,
    };
    vi.mocked(enrichTripPlanWithBackend).mockResolvedValue({
      analysis: '襄阳两日路线包含古隆中。', routePoints: [routePoint], foods: [],
    });
    render(<TripProvider><Harness /></TripProvider>);

    await userEvent.click(screen.getByText('生成襄阳方案'));

    await waitFor(() => expect(screen.getByTestId('generating')).toHaveTextContent('false'));
    expect(screen.getByTestId('city')).toHaveTextContent('襄阳');
    expect(screen.getByTestId('summary')).toHaveTextContent('襄阳两日路线');
  });
});
