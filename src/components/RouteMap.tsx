import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Clock3,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Utensils,
} from "lucide-react";
import type { RoutePoint, SmartRoute } from "../types/route";
import { getPointTypeLabel } from "../services/mapService";
import {
  classifyDrivingFailure,
  convertGpsPoint,
  loadAmapJsApi,
  planAmapDrivingRoute,
  planBackendDrivingRoute,
  resetAmapJsApiLoader,
  type DrivingSearchFailure,
  type RoadPlanMetrics,
  type RoadPlanStatus,
} from "../services/amapDriving";
import type {
  TransportPlanResponse,
  TransportSegment,
  TransitLegMode,
} from "../services/transportService";

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

export type RouteMapJournalCard = {
  id: string;
  note: string;
  photoUrl?: string;
};
type Props = {
  route: SmartRoute;
  transportPlan?: TransportPlanResponse | null;
  focusedTransportSegmentId?: string | null;
  selectedPointId?: string;
  activePointIndex: number;
  navigating: boolean;
  onSelectPoint: (point: RoutePoint) => void;
  onRoadPlanChange?: (metrics: RoadPlanMetrics) => void;
  mapOnly?: boolean;
  journalCards?: RouteMapJournalCard[];
};
type TransportOverlayEntry = {
  outline: any;
  line: any;
  color: string;
  weight: number;
};
type FocusedRoadStatus = "idle" | "loading" | "planned" | "failed";
const icons: Record<RoutePoint["type"], typeof MapPin> = {
  start: Navigation,
  scenic: MapPin,
  food: Utensils,
  photo: Camera,
  rest: Clock3,
  hotel: MapPin,
  end: RouteIcon,
};

export function RouteMap({
  route,
  transportPlan,
  focusedTransportSegmentId,
  selectedPointId,
  onSelectPoint,
  onRoadPlanChange,
  mapOnly = false,
  journalCards = [],
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>();
  const markerRef = useRef<any[]>([]);
  const overlayRef = useRef<any[]>([]);
  const focusOverlayRef = useRef<any[]>([]);
  const transportOverlayGroupsRef = useRef<
    Record<string, TransportOverlayEntry[]>
  >({});
  const drivingRef = useRef<any[]>([]);
  const requestIdRef = useRef(0);
  const onSelectPointRef = useRef(onSelectPoint);
  const onRoadPlanChangeRef = useRef(onRoadPlanChange);
  const journalCardsRef = useRef(journalCards);
  const [status, setStatus] = useState<RoadPlanStatus>("loading");
  const [message, setMessage] = useState("正在载入高德交互地图…");
  const [retryVersion, setRetryVersion] = useState(0);
  const [mapAvailable, setMapAvailable] = useState(false);
  const [liveMapZoom, setLiveMapZoom] = useState<number | null>(null);
  const [liveMapCenter, setLiveMapCenter] = useState("");
  const [rasterPaths, setRasterPaths] = useState<
    Array<Array<[number, number]>>
  >([]);
  const [focusedRoadPath, setFocusedRoadPath] = useState<
    Array<[number, number]>
  >([]);
  const [focusedRoadStatus, setFocusedRoadStatus] =
    useState<FocusedRoadStatus>("idle");
  const selected =
    route.points.find((p) => p.id === selectedPointId) ?? route.points[0];
  const amapEnabled = import.meta.env.VITE_AMAP_ENABLED !== "false";
  const key = import.meta.env.VITE_AMAP_KEY;
  const securityCode = import.meta.env.VITE_AMAP_SECURITY_CODE;
  const routeSignature = useMemo(
    () =>
      route.points
        .map(
          ({ id, lng, lat, roadAccessLng, roadAccessLat, coordinateSystem }) =>
            `${id}:${lng},${lat}:${roadAccessLng},${roadAccessLat}:${coordinateSystem}`,
        )
        .join("|"),
    [route.points],
  );
  const journalCardSignature = useMemo(
    () =>
      journalCards
        .map(({ id, note, photoUrl }) => `${id}:${note}:${photoUrl ?? ""}`)
        .join("|"),
    [journalCards],
  );
  const transportSignature = useMemo(
    () =>
      transportPlan?.source === "transport-api"
        ? transportPlan.segments
            .flatMap((segment) => segment.legs)
            .map(
              (leg) =>
                `${leg.id}:${leg.mode}:${leg.polyline.map(([lng, lat]) => `${lng},${lat}`).join(";")}`,
            )
            .join("|")
        : "",
    [transportPlan],
  );
  const focusedTransportPath = useMemo(
    () => getFocusedTransportPath(transportPlan, focusedTransportSegmentId),
    [transportPlan, focusedTransportSegmentId],
  );
  const displayedFocusedPath =
    focusedTransportPath.length > 1 ? focusedTransportPath : focusedRoadPath;
  onSelectPointRef.current = onSelectPoint;
  onRoadPlanChangeRef.current = onRoadPlanChange;
  journalCardsRef.current = journalCards;

  useEffect(() => {
    const target = container.current;
    if (!target || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mapRef.current?.resize?.());
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const requestId = ++requestIdRef.current;
    const isCurrent = () => !disposed && requestId === requestIdRef.current;
    const publish = (metrics: RoadPlanMetrics) => {
      if (!isCurrent()) return;
      setStatus(metrics.status);
      setMessage(metrics.message);
      onRoadPlanChangeRef.current?.(metrics);
    };
    const cleanupMap = () => {
      for (const driving of drivingRef.current) driving?.clear?.();
      drivingRef.current = [];
      if (mapRef.current) {
        if (focusOverlayRef.current.length)
          mapRef.current.remove?.(focusOverlayRef.current);
        if (overlayRef.current.length)
          mapRef.current.remove?.(overlayRef.current);
        if (markerRef.current.length)
          mapRef.current.remove?.(markerRef.current);
        mapRef.current.clearMap?.();
        mapRef.current.destroy?.();
      }
      overlayRef.current = [];
      focusOverlayRef.current = [];
      transportOverlayGroupsRef.current = {};
      markerRef.current = [];
      mapRef.current = undefined;
    };
    async function mount() {
      if (!container.current) return;
      cleanupMap();
      setMapAvailable(false);
      setLiveMapZoom(null);
      setLiveMapCenter("");
      setRasterPaths([]);
      publish({
        status: "loading",
        source: "estimate",
        message: "正在请求高德道路规划…",
      });
      let plannedPath: Array<[number, number]> = [];
      let plannedPaths: Array<Array<[number, number]>> = [];
      let backendFailure: DrivingSearchFailure | undefined;
      try {
        const routeResult = await planBackendDrivingRoute(route.points);
        plannedPath = routeResult.path;
        plannedPaths = routeResult.paths?.length
          ? routeResult.paths
          : [routeResult.path];
        const plannedMetrics: RoadPlanMetrics = {
          status: "planned",
          source: "amap-driving",
          distanceKm: Number((routeResult.distanceMeters / 1000).toFixed(1)),
          durationMinutes: Math.max(
            1,
            Math.round(routeResult.durationSeconds / 60),
          ),
          message:
            "高德真实道路路线已逐段原样生成；不简化、不平滑，也不以直线补接道路断点。",
        };
        if (!isCurrent()) return;
        setRasterPaths(plannedPaths);
        publish(plannedMetrics);
      } catch (caught) {
        backendFailure = normalizeFailure(caught);
        console.warn("高德后端道路规划不可用，继续尝试浏览器端真实道路规划。", {
          status: backendFailure.status,
          result: backendFailure.result,
          error: backendFailure.error,
        });
      }

      if (
        !amapEnabled ||
        !key ||
        !securityCode ||
        /请填写|placeholder/i.test(securityCode)
      ) {
        if (backendFailure && isCurrent()) {
          const failureStatus = classifyDrivingFailure(backendFailure);
          publish({
            status: failureStatus,
            source: "estimate",
            distanceKm: route.totalDistanceKm,
            message: failureMessage(failureStatus),
          });
        }
        return;
      }
      try {
        const AMap = await loadAmapJsApi(key, securityCode);
        if (!isCurrent() || !container.current) return;
        const amapPoints = await Promise.all(
          route.points.map((point) => convertGpsPoint(AMap, point)),
        );
        if (plannedPath.length < 2) {
          const browserRouteResult = await planAmapDrivingRoute(
            AMap,
            amapPoints,
          );
          if (!isCurrent()) {
            browserRouteResult.drivingInstances.forEach((driving) =>
              driving?.clear?.(),
            );
            return;
          }
          plannedPath = browserRouteResult.path;
          plannedPaths = browserRouteResult.paths?.length
            ? browserRouteResult.paths
            : [browserRouteResult.path];
          drivingRef.current = browserRouteResult.drivingInstances;
          setRasterPaths(plannedPaths);
          publish({
            status: "planned",
            source: "amap-driving",
            distanceKm: Number(
              (browserRouteResult.distanceMeters / 1000).toFixed(1),
            ),
            durationMinutes: Math.max(
              1,
              Math.round(browserRouteResult.durationSeconds / 60),
            ),
            message:
              "完整道路路线已由高德浏览器端逐段原样生成，不以直线补接道路断点。",
          });
        }
        const map = new AMap.Map(container.current, {
          zoom: 12,
          center: [amapPoints[0].lng, amapPoints[0].lat],
          viewMode: "2D",
          resizeEnable: true,
          dragEnable: true,
          zoomEnable: true,
          scrollWheel: true,
          touchZoom: true,
          touchZoomCenter: 1,
          doubleClickZoom: true,
          keyboardEnable: true,
          jogEnable: true,
          animateEnable: true,
          mapStyle: "amap://styles/normal",
          features: ["bg", "road", "building", "point"],
          layers: [new AMap.TileLayer({ visible: true, zIndex: 1 })],
        });
        map.setFeatures?.(["bg", "road", "building", "point"]);
        map.setMapStyle?.("amap://styles/normal");
        mapRef.current = map;
        const syncLiveMapCenter = () => {
          const center = map.getCenter?.();
          if (center && isCurrent())
            setLiveMapCenter(
              `${Number(center.lng).toFixed(6)},${Number(center.lat).toFixed(6)}`,
            );
        };
        syncLiveMapCenter();
        map.on?.("zoomend", () => {
          if (isCurrent()) setLiveMapZoom(Number(map.getZoom?.() ?? 12));
        });
        map.on?.("moveend", syncLiveMapCenter);

        markerRef.current = amapPoints.map((point, index) =>
          createRouteMarker(
            AMap,
            map,
            point,
            index,
            (selectedPoint) => onSelectPointRef.current(selectedPoint),
            point.id === selectedPointId,
            journalCardsRef.current.find((card) => card.id === point.id),
          ),
        );
        overlayRef.current = addRoadPolylines(AMap, map, plannedPaths);
        window.requestAnimationFrame(() => map.resize?.());
        map.setFitView(
          [...overlayRef.current, ...markerRef.current],
          false,
          [90, 90, 90, 90],
        );
        setLiveMapZoom(Number(map.getZoom?.() ?? 12));
        setMapAvailable(true);
      } catch (caught) {
        console.warn(
          plannedPath.length > 1
            ? "高德交互地图不可用，保留后端真实路线瓦片图。"
            : "两条高德真实道路规划通道均不可用。",
          caught,
        );
        cleanupMap();
        if (isCurrent()) {
          setMapAvailable(false);
          if (plannedPath.length < 2) {
            const failureStatus = classifyDrivingFailure(
              normalizeFailure(caught),
            );
            publish({
              status: failureStatus,
              source: "estimate",
              distanceKm: route.totalDistanceKm,
              message: failureMessage(failureStatus),
            });
          }
        }
      }
    }
    mount();
    return () => {
      disposed = true;
      requestIdRef.current += 1;
      cleanupMap();
    };
  }, [route.id, routeSignature, amapEnabled, key, securityCode, retryVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = window.AMap;
    const liveSegments =
      transportPlan?.source === "transport-api"
        ? transportPlan.segments.filter((segment) =>
            segment.legs.some((leg) => leg.polyline.length > 1),
          )
        : [];
    if (liveSegments.length) {
      setStatus("planned");
      setMessage("已按本次动态查询结果绘制公交、地铁、步行与驾车分段路线。");
    }
    if (
      !mapAvailable ||
      !map ||
      !AMap ||
      (!liveSegments.length && !rasterPaths.some((path) => path.length > 1))
    )
      return;
    if (overlayRef.current.length) map.remove?.(overlayRef.current);
    overlayRef.current = [];
    transportOverlayGroupsRef.current = {};
    if (liveSegments.length) {
      const transportOverlays = addTransportPolylines(AMap, map, liveSegments);
      overlayRef.current = transportOverlays.overlays;
      transportOverlayGroupsRef.current = transportOverlays.groups;
    } else {
      overlayRef.current = addRoadPolylines(AMap, map, rasterPaths);
    }
    map.resize?.();
    map.setFitView(
      [...overlayRef.current, ...markerRef.current],
      false,
      [90, 90, 90, 90],
    );
  }, [mapAvailable, rasterPaths, transportSignature]);

  useEffect(() => {
    let cancelled = false;
    setFocusedRoadPath([]);
    if (!focusedTransportSegmentId) {
      setFocusedRoadStatus("idle");
      return () => {
        cancelled = true;
      };
    }
    if (focusedTransportPath.length > 1) {
      setFocusedRoadStatus("planned");
      return () => {
        cancelled = true;
      };
    }
    const segmentPoints = getFocusedTransportSegmentPoints(
      route,
      transportPlan,
      focusedTransportSegmentId,
    );
    if (segmentPoints.length < 2) {
      setFocusedRoadStatus("failed");
      return () => {
        cancelled = true;
      };
    }
    setFocusedRoadStatus("loading");
    planBackendDrivingRoute(segmentPoints)
      .then((result) => {
        if (!cancelled && result.path.length > 1) {
          setFocusedRoadPath(result.path);
          setFocusedRoadStatus("planned");
        }
      })
      .catch(() => {
        if (!cancelled) setFocusedRoadStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [focusedTransportSegmentId, focusedTransportPath, route, transportPlan]);

  useEffect(() => {
    if (
      !selected ||
      focusedTransportSegmentId ||
      !mapAvailable ||
      !mapRef.current
    )
      return;
    mapRef.current.resize?.();
    mapRef.current.setZoomAndCenter(
      15,
      [selected.lng, selected.lat],
      false,
      350,
    );
    markerRef.current.forEach((marker, index) => {
      const point = route.points[index];
      const active = point.id === selected.id;
      marker.setContent?.(markerContent(point, index, active));
      const card = journalCards.find((item) => item.id === point.id);
      marker.setLabel?.(
        card
          ? {
              content: markerLabelContent(point, index, card, active),
              direction: index % 2 ? "left" : "right",
              offset: new window.AMap.Pixel(index % 2 ? -12 : 12, -20),
            }
          : {
              content: `<span class="amap-route-name">${escapeMarkerText(point.name)}</span>`,
              direction: "bottom",
              offset: new window.AMap.Pixel(0, 8),
            },
      );
    });
  }, [
    selected?.id,
    focusedTransportSegmentId,
    mapAvailable,
    journalCardSignature,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!mapAvailable || !map || !AMap) return;
    if (focusOverlayRef.current.length) map.remove?.(focusOverlayRef.current);
    focusOverlayRef.current = [];
    const groups = transportOverlayGroupsRef.current;
    const groupIds = Object.keys(groups);
    const focusedGroup = focusedTransportSegmentId
      ? groups[focusedTransportSegmentId]
      : undefined;
    if (
      groupIds.length &&
      (!focusedTransportSegmentId || focusedGroup?.length)
    ) {
      const focused = focusedGroup;
      for (const [segmentId, entries] of Object.entries(groups)) {
        const active =
          !focusedTransportSegmentId || segmentId === focusedTransportSegmentId;
        for (const entry of entries) {
          entry.outline.setOptions?.({
            strokeOpacity: active ? 0.92 : 0.12,
            strokeWeight:
              active && focused ? entry.weight + 7 : entry.weight + 4,
            zIndex: active && focused ? 88 : 44,
          });
          entry.line.setOptions?.({
            strokeColor: focused && active ? "#f04438" : entry.color,
            strokeOpacity: active ? 0.98 : 0.16,
            strokeWeight: active && focused ? entry.weight + 3 : entry.weight,
            zIndex: active && focused ? 89 : 45,
          });
        }
      }
      const focusedOverlays =
        focused?.flatMap((entry) => [entry.outline, entry.line]) ?? [];
      map.resize?.();
      map.setFitView(
        focusedOverlays.length
          ? focusedOverlays
          : [...overlayRef.current, ...markerRef.current],
        false,
        focusedOverlays.length ? [140, 110, 140, 110] : [90, 90, 90, 90],
      );
      return;
    }
    if (groupIds.length && focusedTransportSegmentId && !focusedGroup?.length) {
      for (const entries of Object.values(groups))
        for (const entry of entries) {
          entry.outline.setOptions?.({ strokeOpacity: 0.1, zIndex: 44 });
          entry.line.setOptions?.({ strokeOpacity: 0.14, zIndex: 45 });
        }
    }
    if (displayedFocusedPath.length > 1) {
      focusOverlayRef.current = addFocusedPolyline(
        AMap,
        map,
        displayedFocusedPath,
      );
      map.resize?.();
      map.setFitView(focusOverlayRef.current, false, [140, 110, 140, 110]);
    } else {
      map.setFitView(
        [...overlayRef.current, ...markerRef.current],
        false,
        [90, 90, 90, 90],
      );
    }
  }, [
    focusedTransportSegmentId,
    displayedFocusedPath,
    mapAvailable,
    transportSignature,
  ]);

  const failed = status !== "loading" && status !== "planned";
  const usingTransitGeometry =
    transportPlan?.source === "transport-api" &&
    transportPlan.segments.some((segment) =>
      segment.legs.some((leg) => leg.polyline.length > 1),
    );
  const displayedRasterPaths = usingTransitGeometry
    ? transportPlan.segments.flatMap((segment) =>
        segment.legs
          .map((leg) => leg.polyline)
          .filter((path) => path.length > 1),
      )
    : rasterPaths.filter((path) => path.length > 1);
  const displayedRasterPath = displayedRasterPaths.flat();
  const resetInteractiveMapView = () => {
    const map = mapRef.current;
    if (!map) return;
    const coordinates =
      displayedFocusedPath.length > 1
        ? displayedFocusedPath
        : displayedRasterPath.length > 1
          ? displayedRasterPath
          : route.points.map(
              (point) => [point.lng, point.lat] as [number, number],
            );
    const bounds = getCoordinateBounds(coordinates);
    const center: [number, number] = [
      (bounds.minLng + bounds.maxLng) / 2,
      (bounds.minLat + bounds.maxLat) / 2,
    ];
    map.setZoomAndCenter?.(rasterZoomForBounds(bounds), center, false, 350);
  };

  return (
    <section
      className={`min-w-0 overflow-hidden bg-white ${mapOnly ? "h-full" : "rounded-[1.75rem] shadow-soft ring-1 ring-ink/5"}`}
    >
      {!mapOnly && (
        <div className="flex flex-col gap-4 border-b border-ink/5 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-black tracking-[.16em] text-river">
              <Navigation className="h-4 w-4" />
              LIVE ROUTE
            </div>
            <h3 className="mt-2 font-display text-2xl font-black">
              {route.title}
            </h3>
            <p className="mt-1 text-sm text-ink/50">{message}</p>
          </div>
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-full bg-mist px-3 py-2">
              {route.totalDistanceKm} km
            </span>
            <span className="rounded-full bg-mist px-3 py-2">
              {route.recommendedStartTime} 出发
            </span>
          </div>
        </div>
      )}
      <div
        className={
          mapOnly
            ? "h-full min-w-0"
            : "grid min-w-0 lg:grid-cols-[1.35fr_.65fr]"
        }
      >
        <div
          className={`relative min-w-0 overflow-hidden bg-[#d8f1ee] ${mapOnly ? "h-full min-h-[620px]" : "min-h-[430px]"}`}
        >
          <div
            ref={container}
            role="application"
            aria-label="可缩放和拖动的高德交互地图"
            data-map-zoom={liveMapZoom ?? ""}
            data-map-center={liveMapCenter}
            tabIndex={0}
            onKeyDown={(event) => {
              if (!mapRef.current) return;
              if (event.key === "+" || event.key === "=") {
                event.preventDefault();
                mapRef.current.zoomIn?.();
              } else if (event.key === "-") {
                event.preventDefault();
                mapRef.current.zoomOut?.();
              } else if (event.key === "0") {
                event.preventDefault();
                resetInteractiveMapView();
              }
            }}
            className={`absolute inset-0 transform-gpu outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-jade/50 ${!mapAvailable ? "invisible" : ""}`}
          />
          {mapAvailable && (
            <MapInteractionControls
              label={`高德交互地图，当前缩放 ${liveMapZoom ?? "—"} 级`}
              onZoomIn={() => mapRef.current?.zoomIn?.()}
              onZoomOut={() => mapRef.current?.zoomOut?.()}
              onReset={resetInteractiveMapView}
            />
          )}
          {mapAvailable && (
            <div
              className={`pointer-events-none absolute bottom-3 left-3 z-20 rounded-full bg-white/92 px-3 py-1.5 text-xs font-black shadow-sm ${focusedTransportSegmentId ? "text-tower" : "text-river"}`}
            >
              {focusedTransportSegmentId
                ? focusedRoadStatus === "loading"
                  ? "正在查询本段真实道路…"
                  : focusedRoadStatus === "failed"
                    ? "本段真实路线暂不可用"
                    : "高德真实阶段路线"
                : usingTransitGeometry
                  ? "动态公交/地铁路线"
                  : "高德真实驾车路线"}
            </div>
          )}
          {usingTransitGeometry && mapAvailable && (
            <div className="pointer-events-none absolute bottom-12 left-3 z-20 flex flex-wrap gap-1.5 rounded-2xl bg-white/92 p-2 text-[9px] font-black shadow-sm">
              <MapLegend color="#c94f3d" label="地铁" />
              <MapLegend color="#0e6b72" label="公交" />
              <MapLegend color="#6b7280" label="步行" dashed />
              <MapLegend color="#d97706" label="驾车" />
            </div>
          )}
          {!mapAvailable && status === "planned" && (
            <GaodeRasterRouteMap
              route={route}
              roadPaths={displayedRasterPaths}
              focusPath={displayedFocusedPath}
              focusStatus={focusedRoadStatus}
              focusedTransportSegmentId={focusedTransportSegmentId}
              selectedPointId={selectedPointId}
              onSelectPoint={onSelectPoint}
              journalCards={journalCards}
            />
          )}
          {status === "loading" && (
            <div
              role="status"
              className="absolute inset-0 grid place-items-center bg-[#d8f1ee]"
            >
              <div className="rounded-2xl bg-white/90 px-5 py-4 text-sm font-black text-river shadow-soft">
                <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
                正在思考并生成完整道路路线…
              </div>
            </div>
          )}
          {failed && (
            <div
              role="alert"
              className="absolute inset-0 z-30 grid place-items-center bg-[#d8f1ee] p-5"
            >
              <div className="w-full max-w-md rounded-[1.75rem] border border-red-200 bg-white/95 p-5 shadow-xl backdrop-blur">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-sm text-red-700">
                      完整道路路线暂未生成
                    </strong>
                    <p className="mt-1 text-xs font-bold leading-5 text-ink/55">
                      {message}；当前不展示只有点或点到点直线的半成品。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetAmapJsApiLoader();
                    setRetryVersion((value) => value + 1);
                  }}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-full bg-ink px-3 py-3 text-xs font-black text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新生成完整路线
                </button>
              </div>
            </div>
          )}
        </div>
        {!mapOnly && (
          <aside className="bg-[#fbfaf5] p-5">
            {selected && (
              <>
                <div className="text-xs font-black tracking-[.16em] text-tower">
                  STOP {route.points.findIndex((p) => p.id === selected.id) + 1}
                </div>
                <h4 className="mt-2 font-display text-3xl font-black">
                  {selected.name}
                </h4>
                <div className="mt-2 flex gap-2 text-xs font-bold text-ink/50">
                  <span>{getPointTypeLabel(selected.type)}</span>
                  <span>·</span>
                  <span>{selected.time}</span>
                  <span>·</span>
                  <span>{selected.stayMinutes} 分钟</span>
                </div>
                <p className="mt-5 leading-7 text-ink/68">{selected.reason}</p>
                <div className="mt-4 rounded-xl border-l-4 border-tower bg-white p-4 text-sm leading-6">
                  <b>拍照：</b>
                  {selected.photoTip}
                </div>
                <div className="mt-3 rounded-xl bg-river/5 p-4 text-sm leading-6">
                  <b>手账：</b>
                  {selected.recordTip}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function normalizeFailure(caught: unknown): DrivingSearchFailure {
  if (caught && typeof caught === "object" && "status" in caught)
    return caught as DrivingSearchFailure;
  return { status: "error", error: caught };
}

function failureMessage(status: RoadPlanStatus) {
  if (status === "auth-error")
    return "高德 Key、安全密钥或域名白名单校验失败，请检查部署配置。";
  if (status === "network-error")
    return "高德脚本或路线服务网络请求失败，请检查网络后重试。";
  if (status === "no-data")
    return "高德没有返回可用道路方案，请调整点位后重试。";
  return "道路服务暂时不可用，地图仅保留真实点位，不绘制估算直线。";
}

function createRouteMarker(
  AMap: any,
  map: any,
  point: RoutePoint,
  index: number,
  onSelectPoint: (point: RoutePoint) => void,
  active: boolean,
  journalCard?: RouteMapJournalCard,
) {
  const color = pointColor(point.type);
  const marker = new AMap.Marker({
    position: [point.lng, point.lat],
    title: point.name,
    anchor: "bottom-center",
    content: markerContent(point, index, active, color),
    label: journalCard
      ? {
          content: markerLabelContent(point, index, journalCard, active),
          direction: index % 2 ? "left" : "right",
          offset: new AMap.Pixel(index % 2 ? -12 : 12, -20),
        }
      : {
          content: `<span class="amap-route-name">${point.name}</span>`,
          direction: "bottom",
          offset: new AMap.Pixel(0, 8),
        },
  });
  marker.on("click", () => onSelectPoint(point));
  map.add(marker);
  return marker;
}

function markerLabelContent(
  point: RoutePoint,
  index: number,
  card: RouteMapJournalCard,
  active: boolean,
) {
  const photo = card.photoUrl
    ? `<img src="${escapeMarkerText(card.photoUrl)}" alt="" />`
    : `<span class="amap-journal-card-empty">旅</span>`;
  return `<span class="amap-journal-card${active ? " is-selected" : ""}">${photo}<span class="amap-journal-card-copy"><b>${index + 1}. ${escapeMarkerText(point.name)}</b><em>${escapeMarkerText(card.note || "这一站等待你的心得。")}</em><small>点击翻开手账</small></span></span>`;
}

function markerContent(
  point: RoutePoint,
  index: number,
  active: boolean,
  color = pointColor(point.type),
) {
  return `<button class="amap-smart-marker${active ? " is-selected" : ""}" style="--marker:${color}" aria-label="${index + 1} ${escapeMarkerText(point.name)}"${active ? ' aria-current="location"' : ""}><span>${index + 1}</span></button>`;
}

function escapeMarkerText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
}

function addRoadPolylines(
  AMap: any,
  map: any,
  paths: Array<Array<[number, number]>>,
) {
  const overlays = paths
    .filter((path) => path.length > 1)
    .flatMap((path, index) => {
      const outline = new AMap.Polyline({
        path,
        strokeColor: "#ffffff",
        strokeWeight: 12,
        strokeOpacity: 0.92,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 45 + index * 2,
      });
      const routeLine = new AMap.Polyline({
        path,
        strokeColor: "#0E6B72",
        strokeWeight: 7,
        strokeOpacity: 0.96,
        showDir: true,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 46 + index * 2,
      });
      return [outline, routeLine];
    });
  map.add(overlays);
  return overlays;
}

function addTransportPolylines(
  AMap: any,
  map: any,
  segments: TransportSegment[],
) {
  const colors: Record<TransitLegMode, string> = {
    walk: "#6b7280",
    bus: "#0e6b72",
    subway: "#c94f3d",
    railway: "#7c3aed",
    taxi: "#d97706",
    shuttle: "#12a885",
  };
  const overlays: any[] = [];
  const groups: Record<string, TransportOverlayEntry[]> = {};
  let overlayIndex = 0;
  for (const segment of segments) {
    groups[segment.id] = [];
    for (const leg of segment.legs.filter((item) => item.polyline.length > 1)) {
      const weight = leg.mode === "walk" ? 5 : 7;
      const outline = new AMap.Polyline({
        path: leg.polyline,
        strokeColor: "#ffffff",
        strokeWeight: weight + 4,
        strokeOpacity: 0.9,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 45 + overlayIndex * 2,
      });
      const line = new AMap.Polyline({
        path: leg.polyline,
        strokeColor: colors[leg.mode],
        strokeWeight: weight,
        strokeOpacity: 0.96,
        strokeStyle: leg.mode === "walk" ? "dashed" : "solid",
        strokeDasharray: leg.mode === "walk" ? [8, 8] : undefined,
        showDir: leg.mode !== "subway",
        lineJoin: "round",
        lineCap: "round",
        zIndex: 46 + overlayIndex * 2,
      });
      groups[segment.id].push({
        outline,
        line,
        color: colors[leg.mode],
        weight,
      });
      overlays.push(outline, line);
      overlayIndex += 1;
    }
  }
  map.add(overlays);
  return { overlays, groups };
}

function addFocusedPolyline(
  AMap: any,
  map: any,
  path: Array<[number, number]>,
) {
  const outline = new AMap.Polyline({
    path,
    strokeColor: "#ffffff",
    strokeWeight: 15,
    strokeOpacity: 0.96,
    lineJoin: "round",
    lineCap: "round",
    zIndex: 88,
  });
  const line = new AMap.Polyline({
    path,
    strokeColor: "#f04438",
    strokeWeight: 10,
    strokeOpacity: 1,
    showDir: true,
    lineJoin: "round",
    lineCap: "round",
    zIndex: 89,
  });
  map.add([outline, line]);
  return [outline, line];
}

export function getFocusedTransportPath(
  plan?: TransportPlanResponse | null,
  segmentId?: string | null,
) {
  if (
    !plan ||
    !segmentId ||
    plan.source !== "transport-api" ||
    plan.freshness === "estimate"
  )
    return [];
  return (
    plan.segments
      .find((segment) => segment.id === segmentId)
      ?.legs.filter((leg) => leg.polyline.length > 1)
      .flatMap((leg) => leg.polyline) ?? []
  );
}

export function getFocusedTransportSegmentPoints(
  route: SmartRoute,
  plan?: TransportPlanResponse | null,
  segmentId?: string | null,
) {
  if (!plan || !segmentId) return [];
  const segmentIndex = plan.segments.findIndex(
    (segment) => segment.id === segmentId,
  );
  return segmentIndex < 0
    ? []
    : route.points.slice(segmentIndex, segmentIndex + 2);
}

function MapLegend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-ink/55">
      <i
        className={`block h-0.5 w-4 ${dashed ? "border-t-2 border-dashed" : ""}`}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function pointColor(type: RoutePoint["type"]) {
  const colors: Record<RoutePoint["type"], string> = {
    start: "#12a885",
    scenic: "#1976d2",
    food: "#f97316",
    photo: "#ec4899",
    rest: "#64748b",
    hotel: "#7c3aed",
    end: "#7c3aed",
  };
  return colors[type];
}

function GaodeRasterRouteMap({
  route,
  roadPaths,
  focusPath,
  focusStatus,
  focusedTransportSegmentId,
  selectedPointId,
  onSelectPoint,
  journalCards = [],
}: {
  route: SmartRoute;
  roadPaths: Array<Array<[number, number]>>;
  focusPath: Array<[number, number]>;
  focusStatus: FocusedRoadStatus;
  focusedTransportSegmentId?: string | null;
  selectedPointId?: string;
  onSelectPoint: (point: RoutePoint) => void;
  journalCards?: RouteMapJournalCard[];
}) {
  const points = route.points;
  const fullRoadCoordinates = roadPaths.flat();
  const focusCoordinates =
    focusPath.length > 1
      ? focusPath
      : fullRoadCoordinates.length > 1
        ? fullRoadCoordinates
        : points.map((point) => [point.lng, point.lat] as [number, number]);
  const bounds = getCoordinateBounds(focusCoordinates);
  const fittedView = {
    zoom:
      focusPath.length > 1
        ? rasterZoomForBounds(bounds)
        : rasterZoomForBounds(bounds),
    lng: (bounds.minLng + bounds.maxLng) / 2,
    lat: (bounds.minLat + bounds.maxLat) / 2,
  };
  const fitSignature = `${route.id}:${focusCoordinates.map(([lng, lat]) => `${lng},${lat}`).join(";")}`;
  const [view, setView] = useState(fittedView);
  const pointerPositions = useRef(new Map<number, { x: number; y: number }>());
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const pinchOrigin = useRef<{ distance: number; zoom: number } | null>(null);
  useEffect(() => setView(fittedView), [fitSignature]);
  const zoom = view.zoom;
  const centerWorld = lngLatToWorld(view.lng, view.lat, zoom);
  const changeZoom = (delta: number) =>
    setView((current) => ({
      ...current,
      zoom: clampRasterZoom(current.zoom + delta),
    }));
  const resetView = () => setView(fittedView);
  const panByPixels = (deltaX: number, deltaY: number) =>
    setView((current) => {
      const world = lngLatToWorld(current.lng, current.lat, current.zoom);
      const next = worldToLngLat(
        world.x - deltaX,
        world.y - deltaY,
        current.zoom,
      );
      return { ...current, ...next };
    });
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerPositions.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointerPositions.current.size === 1)
      dragOrigin.current = { x: event.clientX, y: event.clientY };
    if (pointerPositions.current.size === 2) {
      const [first, second] = [...pointerPositions.current.values()];
      pinchOrigin.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: view.zoom,
      };
      dragOrigin.current = null;
    }
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerPositions.current.has(event.pointerId)) return;
    pointerPositions.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointerPositions.current.size >= 2) {
      const [first, second] = [...pointerPositions.current.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (pinchOrigin.current?.distance)
        setView((current) => ({
          ...current,
          zoom: clampRasterZoom(
            Math.round(
              pinchOrigin.current!.zoom +
                Math.log2(
                  Math.max(0.25, distance / pinchOrigin.current!.distance),
                ) *
                  2,
            ),
          ),
        }));
      return;
    }
    if (!dragOrigin.current) {
      dragOrigin.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const deltaX = event.clientX - dragOrigin.current.x;
    const deltaY = event.clientY - dragOrigin.current.y;
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    panByPixels(deltaX, deltaY);
  };
  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointerPositions.current.delete(event.pointerId);
    pinchOrigin.current = null;
    const remaining = [...pointerPositions.current.values()][0];
    dragOrigin.current = remaining ? { ...remaining } : null;
  };
  const projected = points.map((point) => {
    const world = lngLatToWorld(point.lng, point.lat, zoom);
    return {
      point,
      x: world.x - centerWorld.x + 500,
      y: world.y - centerWorld.y + 350,
    };
  });
  const projectedRoads = roadPaths.map((roadPath) =>
    roadPath.map(([lng, lat]) => {
      const world = lngLatToWorld(lng, lat, zoom);
      return {
        x: world.x - centerWorld.x + 500,
        y: world.y - centerWorld.y + 350,
      };
    }),
  );
  const projectedFocus = focusPath.map(([lng, lat]) => {
    const world = lngLatToWorld(lng, lat, zoom);
    return {
      x: world.x - centerWorld.x + 500,
      y: world.y - centerWorld.y + 350,
    };
  });
  const hasRealRoad = projectedRoads.some((roadPath) => roadPath.length > 1);
  const tileCenter = {
    x: Math.floor(centerWorld.x / 256),
    y: Math.floor(centerWorld.y / 256),
  };
  const tiles = Array.from({ length: 35 }, (_, index) => {
    const dx = (index % 7) - 3;
    const dy = Math.floor(index / 7) - 2;
    const x = tileCenter.x + dx;
    const y = tileCenter.y + dy;
    const originX = x * 256 - centerWorld.x + 500;
    const originY = y * 256 - centerWorld.y + 350;
    return { x, y, originX, originY, server: (Math.abs(x + y) % 4) + 1 };
  });

  return (
    <div
      aria-label="可缩放和拖动的高德路线地图"
      role="application"
      tabIndex={0}
      className="absolute inset-0 touch-none overflow-hidden bg-[#dce9e5] outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-jade/50 cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={(event) => {
        event.preventDefault();
        changeZoom(event.deltaY < 0 ? 1 : -1);
      }}
      onDoubleClick={() => changeZoom(1)}
      onKeyDown={(event) => {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoom(1);
        } else if (event.key === "-") {
          event.preventDefault();
          changeZoom(-1);
        } else if (event.key === "0") {
          event.preventDefault();
          resetView();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          panByPixels(80, 0);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          panByPixels(-80, 0);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          panByPixels(0, 80);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          panByPixels(0, -80);
        }
      }}
    >
      <div className="absolute left-1/2 top-1/2 h-[760px] w-[1120px] -translate-x-1/2 -translate-y-1/2">
        {tiles.map((tile) => (
          <img
            key={`${tile.x}-${tile.y}`}
            src={`https://webrd0${tile.server}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${tile.x}&y=${tile.y}&z=${zoom}`}
            alt=""
            className="absolute select-none"
            draggable={false}
            style={{
              left: tile.originX,
              top: tile.originY,
              width: 256,
              height: 256,
            }}
          />
        ))}
        <svg
          viewBox="0 0 1000 700"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {projectedRoads
            .filter((roadPath) => roadPath.length > 1)
            .map((roadPath, index) => (
              <g key={`road-${index}`}>
                <polyline
                  points={roadPath.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeOpacity=".86"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={roadPath.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="#0e6b72"
                  strokeWidth="5"
                  strokeOpacity=".9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          {projectedFocus.length > 1 && (
            <>
              <polyline
                points={projectedFocus.map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="#ffffff"
                strokeWidth="15"
                strokeOpacity=".95"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={projectedFocus.map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="#f04438"
                strokeWidth="9"
                strokeOpacity="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
        {projected.map(({ point, x, y }, index) => {
          const active = point.id === selectedPointId;
          return (
            <button
              key={point.id}
              data-route-point-id={point.id}
              aria-label={`${index + 1} ${point.name}`}
              aria-current={active ? "location" : undefined}
              onClick={() => onSelectPoint(point)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white px-2.5 py-1.5 text-xs font-black text-white shadow-lg transition hover:-translate-y-[60%] active:scale-95 ${active ? "bg-tower ring-4 ring-tower/25" : "bg-river"}`}
              style={{ left: x, top: y }}
            >
              {index + 1}
            </button>
          );
        })}
        {projected.map(({ point, x, y }, index) => {
          const card = journalCards.find((item) => item.id === point.id);
          const active = point.id === selectedPointId;
          return card ? (
            <button
              key={`${point.id}-card`}
              type="button"
              onClick={() => onSelectPoint(point)}
              className={`absolute z-10 flex w-44 overflow-hidden rounded-2xl border bg-white/95 text-left shadow-xl backdrop-blur transition hover:-translate-y-1 ${active ? "border-tower ring-4 ring-tower/15" : "border-white/80"}`}
              style={{ left: x + (index % 2 ? -190 : 28), top: y - 52 }}
            >
              {card.photoUrl ? (
                <img
                  src={card.photoUrl}
                  alt=""
                  className="h-20 w-16 shrink-0 object-cover"
                />
              ) : (
                <span className="grid h-20 w-12 shrink-0 place-items-center bg-river/10 font-black text-river">
                  旅
                </span>
              )}
              <span className="min-w-0 p-2">
                <b className="block truncate text-xs">
                  {index + 1}. {point.name}
                </b>
                <em className="journal-handwriting mt-1 line-clamp-2 block text-xs not-italic leading-4 text-ink/60">
                  {card.note || "这一站等待你的心得。"}
                </em>
              </span>
            </button>
          ) : (
            <div
              key={`${point.id}-name`}
              className="absolute -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-ink shadow-md"
              style={{ left: x, top: y + 25 }}
            >
              {point.name}
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/55 to-transparent" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/82 px-3 py-1.5 text-[10px] font-black text-white shadow-sm backdrop-blur">
        拖动地图 · 滚轮/双指缩放
      </div>
      <MapInteractionControls
        label={`高德瓦片地图，当前缩放 ${zoom} 级`}
        onZoomIn={() => changeZoom(1)}
        onZoomOut={() => changeZoom(-1)}
        onReset={resetView}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/92 px-3 py-1.5 text-xs font-black text-ink/60 shadow-sm">
        高德瓦片底图 · {zoom} 级
      </div>
      <div
        className={`absolute bottom-3 right-3 rounded-full bg-white/92 px-3 py-1.5 text-xs font-black shadow-sm ${focusedTransportSegmentId ? "text-tower" : hasRealRoad ? "text-river" : "text-ink/55"}`}
      >
        {focusedTransportSegmentId
          ? focusStatus === "loading"
            ? "正在查询本段真实道路…"
            : focusPath.length > 1
              ? "高德真实阶段路线"
              : "本段真实路线暂不可用"
          : hasRealRoad
            ? "高德后端动态道路规划"
            : "未绘制估算直线"}
      </div>
    </div>
  );
}

function FallbackRouteMap({
  route,
  selectedPointId,
  onSelectPoint,
}: {
  route: SmartRoute;
  selectedPointId?: string;
  onSelectPoint: (point: RoutePoint) => void;
}) {
  const points = route.points.slice(0, 8);
  const positions = points.map((_, index) => {
    const t = points.length <= 1 ? 0 : index / (points.length - 1);
    return {
      x: 16 + t * 72 + (index % 2 === 0 ? 0 : 4),
      y: 74 - Math.sin(t * Math.PI) * 48 + (index % 2 === 0 ? 2 : -5),
    };
  });
  const line = positions.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="absolute inset-0 bg-[linear-gradient(135deg,#dff5f2_0%,#c7ecf1_48%,#d9f0d2_100%)]">
      <div className="absolute -left-16 top-24 h-44 w-[110%] -rotate-6 rounded-full bg-river/20 blur-sm" />
      <div className="absolute bottom-0 left-0 h-52 w-full bg-jade/20" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(#1b70a61a_1px,transparent_1px),linear-gradient(90deg,#1b70a61a_1px,transparent_1px)] [background-size:54px_54px]" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <path
          d="M-5 82 C20 62 35 78 55 58 C74 38 82 45 106 26"
          fill="none"
          stroke="#ffffff"
          strokeWidth="5.8"
          strokeLinecap="round"
          opacity="0.72"
        />
        <path
          d="M-2 72 C18 58 34 62 50 49 C66 36 81 38 104 18"
          fill="none"
          stroke="#78c8e2"
          strokeWidth="13"
          strokeLinecap="round"
          opacity="0.55"
        />
        <polyline
          points={line}
          fill="none"
          stroke="#ffffff"
          strokeWidth="6.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={line}
          fill="none"
          stroke="#0e6b72"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 3"
        />
      </svg>
      {points.map((point, index) => {
        const pos = positions[index];
        const active = point.id === selectedPointId;
        return (
          <button
            key={point.id}
            aria-label={`${index + 1} ${point.name}`}
            aria-current={active ? "location" : undefined}
            onClick={() => onSelectPoint(point)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white px-2.5 py-1.5 text-xs font-black text-white shadow-lg transition hover:-translate-y-[60%] active:scale-95 ${active ? "bg-tower ring-4 ring-tower/25" : "bg-river"}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            {index + 1}
          </button>
        );
      })}
      {points.map((point, index) => {
        const pos = positions[index];
        return (
          <div
            key={`${point.id}-label`}
            className="absolute -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-ink shadow-sm"
            style={{ left: `${pos.x}%`, top: `calc(${pos.y}% + 28px)` }}
          >
            {point.name}
          </div>
        );
      })}
      <div className="absolute bottom-5 right-5 max-w-sm rounded-2xl bg-ink/92 p-4 text-white shadow-xl">
        <div className="text-xs font-black tracking-[.16em] text-jade">
          RULES-V1 ROUTE DEMO
        </div>
        <div className="mt-2 font-display text-xl font-black">
          {route.city}示例点位顺序图
        </div>
        <p className="mt-2 text-sm leading-6 text-white/70">
          点击地图编号或右侧模块，可联动查看沿路景点、交通、美食与预算。
        </p>
      </div>
    </div>
  );
}

function MapInteractionControls({
  label,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  label: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const stopPointer = (event: React.PointerEvent<HTMLDivElement>) =>
    event.stopPropagation();
  return (
    <div
      aria-label={label}
      className="absolute right-3 top-3 z-40 flex flex-col overflow-hidden rounded-[1rem] border border-white/70 bg-white/94 text-ink shadow-[0_12px_28px_rgba(18,34,42,.18)] backdrop-blur"
      onPointerDown={stopPointer}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="放大地图"
        onClick={onZoomIn}
        className="grid h-10 w-10 place-items-center border-b border-ink/8 text-river transition hover:bg-river hover:text-white active:scale-95"
      >
        <Plus className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="缩小地图"
        onClick={onZoomOut}
        className="grid h-10 w-10 place-items-center border-b border-ink/8 text-river transition hover:bg-river hover:text-white active:scale-95"
      >
        <Minus className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="显示完整路线"
        onClick={onReset}
        className="grid h-10 w-10 place-items-center text-tower transition hover:bg-tower hover:text-white active:scale-95"
      >
        <LocateFixed className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

function getCoordinateBounds(points: Array<[number, number]>) {
  return points.reduce(
    (bounds, [lng, lat]) => ({
      minLng: Math.min(bounds.minLng, lng),
      maxLng: Math.max(bounds.maxLng, lng),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLng: points[0]?.[0] ?? 111,
      maxLng: points[0]?.[0] ?? 111,
      minLat: points[0]?.[1] ?? 30,
      maxLat: points[0]?.[1] ?? 30,
    },
  );
}

function rasterZoomForBounds(bounds: ReturnType<typeof getCoordinateBounds>) {
  const span = Math.max(
    bounds.maxLng - bounds.minLng,
    (bounds.maxLat - bounds.minLat) * 1.3,
  );
  if (span <= 0.012) return 15;
  if (span <= 0.035) return 14;
  if (span <= 0.09) return 13;
  if (span <= 0.22) return 12;
  if (span <= 0.55) return 11;
  return 10;
}

function lngLatToWorld(lng: number, lat: number, zoom: number) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const size = 256 * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size,
  };
}

function worldToLngLat(x: number, y: number, zoom: number) {
  const size = 256 * 2 ** zoom;
  const lng = (x / size) * 360 - 180;
  const mercator = Math.PI * (1 - (2 * y) / size);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return { lng, lat: Math.max(-85, Math.min(85, lat)) };
}

function clampRasterZoom(zoom: number) {
  return Math.max(4, Math.min(18, Math.round(zoom)));
}
