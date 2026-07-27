import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseRoutes } from '../data/routeData';
import type { TransportPlanResponse } from '../services/transportService';
import { RouteMap } from './RouteMap';

const amapMocks = vi.hoisted(() => {
  const mapInstance = {
    add: vi.fn(), remove: vi.fn(), clearMap: vi.fn(), destroy: vi.fn(), resize: vi.fn(),
    setFitView: vi.fn(), setFeatures: vi.fn(), setMapStyle: vi.fn(), setZoomAndCenter: vi.fn(),
    zoomIn: vi.fn(), zoomOut: vi.fn(), getZoom: vi.fn(() => 12), getCenter: vi.fn(() => ({ lng: 114.4, lat: 30.6 })), on: vi.fn(),
  };
  const Map = vi.fn(function Map(_container: unknown, _options: Record<string, unknown>) { return mapInstance; });
  const planBackendDrivingRoute = vi.fn();
  const planAmapDrivingRoute = vi.fn();
  return { mapInstance, Map, planAmapDrivingRoute, planBackendDrivingRoute };
});

vi.mock('../services/amapDriving', () => ({
  classifyDrivingFailure: vi.fn(() => 'service-error'),
  convertGpsPoint: vi.fn(async (_AMap, point) => point),
  loadAmapJsApi: vi.fn(async () => {
    const AMap = {
      Map: amapMocks.Map,
      TileLayer: vi.fn(function TileLayer() { return {}; }),
      Marker: vi.fn(function Marker() { return { on: vi.fn(), setContent: vi.fn(), setLabel: vi.fn() }; }),
      Polyline: vi.fn(function Polyline() { return { setOptions: vi.fn() }; }),
      Pixel: vi.fn(function Pixel() { return {}; }),
    };
    window.AMap = AMap;
    return AMap;
  }),
  planAmapDrivingRoute: amapMocks.planAmapDrivingRoute,
  planBackendDrivingRoute: amapMocks.planBackendDrivingRoute,
  resetAmapJsApiLoader: vi.fn(),
}));

describe('RouteMap lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_AMAP_ENABLED', 'true');
    vi.stubEnv('VITE_AMAP_KEY', 'test-key');
    vi.stubEnv('VITE_AMAP_SECURITY_CODE', 'test-security-code');
    amapMocks.Map.mockClear();
    amapMocks.planBackendDrivingRoute.mockReset().mockResolvedValue({ path: [[114.3, 30.5], [114.31, 30.51]], distanceMeters: 1600, durationSeconds: 600 });
    amapMocks.planAmapDrivingRoute.mockReset().mockResolvedValue({ path: [[114.3, 30.5], [114.305, 30.507], [114.31, 30.51]], distanceMeters: 1700, durationSeconds: 660, drivingInstances: [] });
    Object.values(amapMocks.mapInstance).forEach((value) => typeof value === 'function' && value.mockClear());
  });

  it('updates late transport geometry without destroying and recreating the map', async () => {
    const route = { ...baseRoutes.武汉, startPoint: baseRoutes.武汉.points[0] };
    const common = { selectedPointId: route.points[0].id, activePointIndex: 0, navigating: false, mapOnly: true } as const;
    const view = render(<RouteMap route={route} {...common} onSelectPoint={() => undefined} />);
    await waitFor(() => expect(amapMocks.Map).toHaveBeenCalledTimes(1));
    expect(amapMocks.Map.mock.calls[0][1]).toMatchObject({ dragEnable: true, zoomEnable: true, scrollWheel: true, touchZoom: true, touchZoomCenter: 1, doubleClickZoom: true, keyboardEnable: true });
    expect(amapMocks.mapInstance.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
    expect(amapMocks.mapInstance.on).not.toHaveBeenCalledWith('zoomchange', expect.any(Function));

    const transportPlan = {
      source: 'transport-api', freshness: 'live-query', sourceLabel: '高德动态公交规划', generatedAt: new Date().toISOString(),
      isRealtime: false, totalMinutes: 20, totalDistanceKm: 3, summary: '动态路线', notices: [],
      segments: [{ id: 'segment-1', from: 'A', to: 'B', departureTime: '09:00', arrivalTime: '09:20', durationMinutes: 20, distanceKm: 3, mode: '公交', costEstimate: '¥2', instruction: '乘车', liveStatus: '动态查询', legs: [{ id: 'leg-1', mode: 'bus', viaStops: [], durationMinutes: 20, distanceKm: 3, polyline: [[114.3, 30.5], [114.32, 30.52]] }] }],
    } as TransportPlanResponse;
    view.rerender(<RouteMap route={{ ...route, totalDistanceKm: route.totalDistanceKm + 1 }} transportPlan={transportPlan} {...common} onSelectPoint={() => undefined} journalCards={[{ id: route.points[0].id, note: '新手账' }]} />);

    await waitFor(() => expect(amapMocks.mapInstance.add).toHaveBeenCalled());
    expect(amapMocks.Map).toHaveBeenCalledTimes(1);
    expect(amapMocks.mapInstance.destroy).not.toHaveBeenCalled();
  });

  it('keeps the raster map pannable and zoomable when the browser JS map is unavailable', async () => {
    vi.stubEnv('VITE_AMAP_ENABLED', 'false');
    const route = { ...baseRoutes.武汉, startPoint: baseRoutes.武汉.points[0] };
    const view = render(<RouteMap route={route} selectedPointId={route.points[0].id} activePointIndex={0} navigating={false} mapOnly onSelectPoint={() => undefined} />);

    const map = await view.findByRole('application', { name: '可缩放和拖动的高德路线地图' });
    const initialLabel = view.getByLabelText(/高德瓦片地图，当前缩放/).getAttribute('aria-label');
    fireEvent.click(view.getByRole('button', { name: '放大地图' }));
    await waitFor(() => expect(view.getByLabelText(/高德瓦片地图，当前缩放/).getAttribute('aria-label')).not.toBe(initialLabel));
    expect(view.getByRole('button', { name: '放大地图' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '缩小地图' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '显示完整路线' })).toBeInTheDocument();
  });

  it('uses late transport geometry on the same map when the driving request fails', async () => {
    amapMocks.planBackendDrivingRoute.mockRejectedValueOnce(new Error('driving unavailable'));
    const route = { ...baseRoutes.武汉, startPoint: baseRoutes.武汉.points[0] };
    const common = { selectedPointId: route.points[0].id, activePointIndex: 0, navigating: false, mapOnly: true } as const;
    const view = render(<RouteMap route={route} {...common} onSelectPoint={() => undefined} />);
    await waitFor(() => expect(amapMocks.Map).toHaveBeenCalledTimes(1));

    const transportPlan = {
      source: 'transport-api', freshness: 'live-query', sourceLabel: '高德动态公交规划', generatedAt: new Date().toISOString(),
      isRealtime: false, totalMinutes: 20, totalDistanceKm: 3, summary: '动态路线', notices: [],
      segments: [{ id: 'segment-1', from: 'A', to: 'B', departureTime: '09:00', arrivalTime: '09:20', durationMinutes: 20, distanceKm: 3, mode: '公交', costEstimate: '¥2', instruction: '乘车', liveStatus: '动态查询', legs: [{ id: 'leg-1', mode: 'bus', viaStops: [], durationMinutes: 20, distanceKm: 3, polyline: [[114.3, 30.5], [114.32, 30.52]] }] }],
    } as TransportPlanResponse;
    view.rerender(<RouteMap route={route} transportPlan={transportPlan} {...common} onSelectPoint={() => undefined} />);

    await waitFor(() => expect(view.queryByRole('alert')).not.toBeInTheDocument());
    expect(amapMocks.Map).toHaveBeenCalledTimes(1);
    expect(amapMocks.mapInstance.destroy).not.toHaveBeenCalled();
  });

  it('uses browser-side AMap driving when the backend route endpoint is unavailable', async () => {
    amapMocks.planBackendDrivingRoute.mockRejectedValueOnce(new Error('backend unavailable'));
    const route = { ...baseRoutes.武汉, startPoint: baseRoutes.武汉.points[0] };
    const view = render(<RouteMap route={route} selectedPointId={route.points[0].id} activePointIndex={0} navigating={false} mapOnly onSelectPoint={() => undefined} />);

    await waitFor(() => expect(amapMocks.planAmapDrivingRoute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(amapMocks.Map).toHaveBeenCalledTimes(1));
    expect(view.queryByRole('alert')).not.toBeInTheDocument();
    expect(amapMocks.mapInstance.add).toHaveBeenCalled();
  });

  it('never exposes a point-only map when both real route planners fail', async () => {
    amapMocks.planBackendDrivingRoute.mockRejectedValueOnce(new Error('backend unavailable'));
    amapMocks.planAmapDrivingRoute.mockRejectedValueOnce(new Error('browser driving unavailable'));
    const route = { ...baseRoutes.武汉, startPoint: baseRoutes.武汉.points[0] };
    const view = render(<RouteMap route={route} selectedPointId={route.points[0].id} activePointIndex={0} navigating={false} mapOnly onSelectPoint={() => undefined} />);

    expect(await view.findByRole('alert')).toHaveTextContent('当前不展示只有点或点到点直线的半成品');
    expect(amapMocks.Map).not.toHaveBeenCalled();
    expect(view.queryByRole('application', { name: '可缩放和拖动的高德路线地图' })).not.toBeInTheDocument();
  });
});
