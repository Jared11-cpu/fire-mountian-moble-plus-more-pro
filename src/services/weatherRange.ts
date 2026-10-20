export type ForecastDay = { date: string };

export type TripForecast<T extends ForecastDay> = {
  days: Array<T & { tripDay: number }>;
  // covered: 行程全部日期都有预报；partial: 只覆盖一部分；none: 完全没有（过去或超过预报范围）
  coverage: 'covered' | 'partial' | 'none';
  message: string;
};

const DAY_MS = 86_400_000;

function dayIndex(date: string, startDate: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
}

// 预报按"行程日期"取，而不是从今天起取前几天；超出预报范围的日期如实说明，不拿别的日期冒充。
export function selectTripForecast<T extends ForecastDay>(daily: T[], startDate: string, endDate: string, maxDays = 3): TripForecast<T> {
  const tripDays = Math.max(1, dayIndex(endDate, startDate) + 1);
  const wanted = Math.min(tripDays, maxDays);
  const days = daily
    .map((day) => ({ ...day, tripDay: dayIndex(day.date, startDate) + 1 }))
    .filter((day) => day.tripDay >= 1 && day.tripDay <= wanted);
  const last = daily[daily.length - 1]?.date;
  if (!days.length) {
    const beforeForecast = daily[0] !== undefined && endDate < daily[0].date;
    return {
      days,
      coverage: 'none',
      message: beforeForecast
        ? '行程日期早于今天，没有可用的天气预报。'
        : `行程日期超出 Open‑Meteo 预报范围${last ? `（最远到 ${last}）` : ''}，暂无这几天的预报，请临近出发再查看。`,
    };
  }
  if (days.length < wanted) {
    return { days, coverage: 'partial', message: `仅覆盖行程的前 ${days.length} 天，其余日期超出预报范围${last ? `（最远到 ${last}）` : ''}。` };
  }
  return { days, coverage: 'covered', message: '' };
}
