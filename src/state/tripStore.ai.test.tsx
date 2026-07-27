import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTripRequest } from '../domain/trip';
import type { RoutePoint } from '../types/route';
import { enrichTripPlanWithBackend, parseTravelRequestWithAi } from '../services/travelApi';
import { TripProvider, useTrip } from './tripStore';

vi.mock('../services/travelApi', () => ({
  parseTravelRequestWithAi: vi.fn(),
  enrichTripPlanWithBackend: vi.fn(),
}));

function Harness() {
  const { plan, isGenerating, generateFromText } = useTrip();
  return <div>
    <output data-testid="generating">{String(isGenerating)}</output>
    <output data-testid="source">{plan?.generationSource ?? 'none'}</output>
    <output data-testid="summary">{plan?.content.summary ?? ''}</output>
    <output data-testid="departure">{plan?.settings.departureTime ?? ''}</output>
    <output data-testid="arrival">{plan?.route.points[plan.route.points.length - 1]?.time ?? ''}</output>
    <button onClick={() => { void generateFromText('武汉两天，必须去武汉长江大桥').catch(() => undefined); }}>生成最终方案</button>
  </div>;
}

describe('AI plan publication', () => {
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
});
