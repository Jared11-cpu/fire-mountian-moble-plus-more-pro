import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayIso } from '../domain/trip';
import { TripProvider } from '../state/tripStore';
import { PlannerPage } from './PlannerPage';

vi.mock('../services/travelApi', () => ({
  parseTravelRequestWithAi: vi.fn().mockRejectedValue(new Error('offline')),
  enrichTripPlanWithBackend: vi.fn().mockRejectedValue(new Error('offline')),
}));

describe('PlannerPage past start date', () => {
  beforeEach(() => localStorage.clear());

  it('warns about a past start date and blocks generation until the user decides', async () => {
    const user = userEvent.setup();
    render(<TripProvider><PlannerPage /></TripProvider>);
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2020-07-01' } });

    expect(screen.getByRole('alert')).toHaveTextContent('2020-07-01 已经过去');
    await user.click(screen.getByRole('button', { name: /生成我的/ }));
    expect(await screen.findByText(/出发日期已经过去/)).toBeInTheDocument();
    const { enrichTripPlanWithBackend } = await import('../services/travelApi');
    expect(enrichTripPlanWithBackend).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '改为今天出发' }));
    expect(screen.getByLabelText('开始日期')).toHaveValue(todayIso());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

