import { describe, expect, it } from 'vitest';
import { selectTripForecast } from './weatherRange';

const daily = Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(20 + index)}`, code: index }));

describe('selectTripForecast', () => {
  it('uses the trip dates instead of the first days from today', () => {
    const result = selectTripForecast(daily, '2026-10-22', '2026-10-23');
    expect(result.coverage).toBe('covered');
    expect(result.days.map((day) => [day.date, day.tripDay])).toEqual([['2026-10-22', 1], ['2026-10-23', 2]]);
  });

  it('says so when the trip is beyond the forecast window', () => {
    const result = selectTripForecast(daily, '2026-11-05', '2026-11-06');
    expect(result.coverage).toBe('none');
    expect(result.days).toEqual([]);
    expect(result.message).toContain('超出');
    expect(result.message).toContain('2026-10-26');
  });

  it('reports partial coverage when only the first days are forecastable', () => {
    const result = selectTripForecast(daily, '2026-10-25', '2026-10-28');
    expect(result.coverage).toBe('partial');
    expect(result.days.map((day) => day.date)).toEqual(['2026-10-25', '2026-10-26']);
  });

  it('does not show today as a trip day for a past trip', () => {
    const result = selectTripForecast(daily, '2026-10-10', '2026-10-11');
    expect(result.coverage).toBe('none');
    expect(result.message).toContain('早于今天');
  });
});
