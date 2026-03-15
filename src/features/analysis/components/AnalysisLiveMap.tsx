import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import maplibregl, {
  type ImageSourceSpecification,
  type Map as MapLibreMap,
  type StyleSpecification
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { WindRoseMapOverlay } from "./WindRoseMapOverlay";
import type { AnalysisLandcoverPreviewEvent } from "../../../types/analysis";
import type { SelectedLocation } from "../../../types/location";
import type { MapViewState } from "../../../types/map";
import { setTurbineVideoSource } from "../../../lib/turbineVideo";
const DEFAULT_BASMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esriSatellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles (c) Esri"
    }
  },
  layers: [
    {
      id: "esri-satellite",
      type: "raster",
      source: "esriSatellite",
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

const FALLBACK_ZOOM = 16;
const STEP_THREE_DEFAULT_ZOOM = 16;
const STEP_THREE_MIN_ZOOM = 12.49;
const STEP_THREE_MAX_ZOOM = 17.8;
const STEP_THREE_ZOOM_STEP = 0.9;
const ZOOM_OUT_DELTA = 1.33;
const ZOOM_OUT_DURATION_MS = 60_000;
const STEP_THREE_ZOOM_IN_DURATION_MS = 1_500;
const STEP_THREE_LAYER_FADE_DURATION_MS = 1_000;
const STEP_THREE_CONTROL_ZOOM_DURATION_MS = 260;
const MAPLIBRE_DEFAULT_MIN_ZOOM = 0;
const MAPLIBRE_DEFAULT_MAX_ZOOM = 22;
const MAP_READY_VIDEO_FALLBACK_MS = 2500;
const TURBINE_MARKER_DIAMETER_METERS = 15;
const EARTH_RADIUS_METERS = 6_371_008.8;
const MARKER_SIZE_SNAP_STEP_PX = 0.5;
const MARKER_SIZE_UPDATE_EPSILON_PX = 0.2;

const BUILDINGS_SOURCE_ID = "analysis-buildings-source";
const BUILDINGS_FILL_LAYER_ID = "analysis-buildings-fill";
const BUILDINGS_OUTLINE_LAYER_ID = "analysis-buildings-outline";
const TREES_SOURCE_ID = "analysis-trees-source";
const TREES_FILL_LAYER_ID = "analysis-trees-fill";
const TREES_OUTLINE_LAYER_ID = "analysis-trees-outline";
const LANDCOVER_SOURCE_ID = "analysis-landcover-source";
const LANDCOVER_LAYER_ID = "analysis-landcover-layer";

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Geometry> = {
  type: "FeatureCollection",
  features: []
};

interface AnalysisLiveMapProps {
  selectedLocation: SelectedLocation;
  initialViewState?: MapViewState | null;
  buildingsGeoJson: FeatureCollection<Geometry> | null;
  treesGeoJson: FeatureCollection<Geometry> | null;
  landcoverPreview: AnalysisLandcoverPreviewEvent | null;
  windRoseActualValues?: number[] | null;
  windRosePotentialValues?: number[] | null;
  phase?: "loading" | "analysisReview" | "results";
  onMapReady?: () => void;
  onViewStateChange?: (viewState: MapViewState) => void;
}

type MapStatus = "loading" | "ready" | "error";

export function AnalysisLiveMap({
  selectedLocation,
  initialViewState = null,
  buildingsGeoJson,
  treesGeoJson,
  landcoverPreview,
  windRoseActualValues = null,
  windRosePotentialValues = null,
  phase = "loading",
  onMapReady,
  onViewStateChange
}: AnalysisLiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const turbineMarkerRef = useRef<maplibregl.Marker | null>(null);
  const initialViewStateRef = useRef<MapViewState | null>(initialViewState);
  const onMapReadyRef = useRef(onMapReady);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const selectedLocationRef = useRef<SelectedLocation>(selectedLocation);
  const mapReadyNotifiedRef = useRef(false);
  const mapReadyTimeoutRef = useRef<number | null>(null);
  const startedLoadingTransitionRef = useRef(false);
  const startedResultsTransitionRef = useRef(false);
  const cancelLayerFadeRef = useRef<(() => void) | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");

  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
  }, [selectedLocation]);

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const initialView = initialViewStateRef.current;
    const initialLocation = selectedLocationRef.current;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DEFAULT_BASMAP_STYLE,
      center: [initialLocation.longitude, initialLocation.latitude],
      zoom: initialView?.zoom ?? FALLBACK_ZOOM,
      bearing: initialView?.bearing ?? 0,
      pitch: initialView?.pitch ?? 0,
      attributionControl: {}
    });

    map.boxZoom.disable();
    map.dragPan.disable();
    map.keyboard.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    mapRef.current = map;

    map.on("load", () => {
      ensureGeoJsonSource(map, BUILDINGS_SOURCE_ID);
      ensureGeoJsonSource(map, TREES_SOURCE_ID);

      if (!map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
        map.addLayer({
          id: BUILDINGS_FILL_LAYER_ID,
          type: "fill",
          source: BUILDINGS_SOURCE_ID,
          paint: {
            "fill-color": "#4C7AD6",
            "fill-opacity": 0.32
          }
        });
      }

      if (!map.getLayer(BUILDINGS_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: BUILDINGS_OUTLINE_LAYER_ID,
          type: "line",
          source: BUILDINGS_SOURCE_ID,
          paint: {
            "line-color": "#4C7AD6",
            "line-width": 1.4,
            "line-opacity": 0.95
          }
        });
      }

      if (!map.getLayer(TREES_FILL_LAYER_ID)) {
        map.addLayer({
          id: TREES_FILL_LAYER_ID,
          type: "fill",
          source: TREES_SOURCE_ID,
          paint: {
            "fill-color": "#2D8C61",
            "fill-opacity": 0.3
          }
        });
      }

      if (!map.getLayer(TREES_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: TREES_OUTLINE_LAYER_ID,
          type: "line",
          source: TREES_SOURCE_ID,
          paint: {
            "line-color": "#2D8C61",
            "line-width": 1.2,
            "line-opacity": 0.95
          }
        });
      }

      if (!turbineMarkerRef.current) {
        const markerElement = createTurbineMarkerElement();
        const marker = new maplibregl.Marker({
          element: markerElement,
          anchor: "center"
        })
          .setLngLat([initialLocation.longitude, initialLocation.latitude])
          .addTo(map);

        turbineMarkerRef.current = marker;
      }

      setMarkerPosition(turbineMarkerRef.current, selectedLocationRef.current);
      resizeTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
      onViewStateChangeRef.current?.(readViewState(map));

      if (!mapReadyNotifiedRef.current) {
        let isIdleReady = false;
        let isVideoReady = false;

        const markerVideo = turbineMarkerRef.current?.getElement().querySelector("video");
        const notifyMapReady = () => {
          if (mapReadyNotifiedRef.current) {
            return;
          }

          if (!isIdleReady || !isVideoReady) {
            return;
          }

          if (mapReadyTimeoutRef.current !== null) {
            window.clearTimeout(mapReadyTimeoutRef.current);
            mapReadyTimeoutRef.current = null;
          }

          mapReadyNotifiedRef.current = true;
          onMapReadyRef.current?.();
        };

        const forceNotifyMapReady = () => {
          if (mapReadyNotifiedRef.current) {
            return;
          }

          mapReadyNotifiedRef.current = true;
          onMapReadyRef.current?.();
        };

        map.once("idle", () => {
          isIdleReady = true;
          notifyMapReady();
        });

        if (!markerVideo) {
          isVideoReady = true;
          notifyMapReady();
        } else if (markerVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          isVideoReady = true;
          notifyMapReady();
        } else {
          markerVideo.addEventListener("loadeddata", () => {
            isVideoReady = true;
            notifyMapReady();
          }, { once: true });
          markerVideo.addEventListener("error", () => {
            isVideoReady = true;
            notifyMapReady();
          }, { once: true });
        }

        if (mapReadyTimeoutRef.current !== null) {
          window.clearTimeout(mapReadyTimeoutRef.current);
        }

        mapReadyTimeoutRef.current = window.setTimeout(forceNotifyMapReady, MAP_READY_VIDEO_FALLBACK_MS);
      }

      setMapStatus("ready");
    });

    map.on("error", () => {
      setMapStatus((currentStatus) => (currentStatus === "ready" ? currentStatus : "error"));
    });

    map.on("zoom", () => {
      lockCenterToSelectedLocation(map, selectedLocationRef.current);
      resizeTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
      onViewStateChangeRef.current?.(readViewState(map));
    });

    map.on("zoomend", () => {
      lockCenterToSelectedLocation(map, selectedLocationRef.current);
      onViewStateChangeRef.current?.(readViewState(map));
      console.log("[step3-map] zoom changed");
    });

    return () => {
      if (mapReadyTimeoutRef.current !== null) {
        window.clearTimeout(mapReadyTimeoutRef.current);
        mapReadyTimeoutRef.current = null;
      }

      turbineMarkerRef.current = null;
      mapReadyNotifiedRef.current = false;
      startedLoadingTransitionRef.current = false;
      startedResultsTransitionRef.current = false;
      cancelLayerFadeRef.current?.();
      cancelLayerFadeRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready" || phase !== "loading" || startedLoadingTransitionRef.current) {
      return;
    }

    startedLoadingTransitionRef.current = true;
    startedResultsTransitionRef.current = false;
    cancelLayerFadeRef.current?.();
    cancelLayerFadeRef.current = null;

    const startingZoom = initialViewState?.zoom ?? map.getZoom();
    const zoomOutTarget = Math.max(0, startingZoom - ZOOM_OUT_DELTA);

    map.stop();
    map.easeTo({
      zoom: zoomOutTarget,
      duration: ZOOM_OUT_DURATION_MS,
      essential: true
    });
  }, [initialViewState, mapStatus, phase]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready" || phase !== "analysisReview") {
      return;
    }

    startedResultsTransitionRef.current = false;
    cancelLayerFadeRef.current?.();
    cancelLayerFadeRef.current = null;

    map.stop();
    const startingZoom = map.getZoom();
    const zoomOutTarget = Math.max(0, startingZoom - ZOOM_OUT_DELTA);

    map.easeTo({
      center: [selectedLocationRef.current.longitude, selectedLocationRef.current.latitude],
      zoom: zoomOutTarget,
      duration: STEP_THREE_ZOOM_IN_DURATION_MS,
      essential: true
    });

    setGeoJsonSourceData(map, BUILDINGS_SOURCE_ID, buildingsGeoJson ?? EMPTY_FEATURE_COLLECTION);
    setGeoJsonSourceData(map, TREES_SOURCE_ID, treesGeoJson ?? EMPTY_FEATURE_COLLECTION);
    upsertLandcoverLayer(map, landcoverPreview);

    if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
      map.setPaintProperty(BUILDINGS_FILL_LAYER_ID, "fill-opacity", 0.32);
    }
    if (map.getLayer(BUILDINGS_OUTLINE_LAYER_ID)) {
      map.setPaintProperty(BUILDINGS_OUTLINE_LAYER_ID, "line-opacity", 0.95);
    }
    if (map.getLayer(TREES_FILL_LAYER_ID)) {
      map.setPaintProperty(TREES_FILL_LAYER_ID, "fill-opacity", 0.3);
    }
    if (map.getLayer(TREES_OUTLINE_LAYER_ID)) {
      map.setPaintProperty(TREES_OUTLINE_LAYER_ID, "line-opacity", 0.95);
    }
    if (map.getLayer(LANDCOVER_LAYER_ID)) {
      map.setPaintProperty(LANDCOVER_LAYER_ID, "raster-opacity", 0.5);
    }
  }, [buildingsGeoJson, landcoverPreview, mapStatus, phase, treesGeoJson]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready" || phase !== "results" || startedResultsTransitionRef.current) {
      return;
    }

    startedResultsTransitionRef.current = true;
    cancelLayerFadeRef.current?.();
    cancelLayerFadeRef.current = null;
    map.stop();

    easeToStepThreeDefaultView(map, selectedLocationRef.current, STEP_THREE_ZOOM_IN_DURATION_MS);

    cancelLayerFadeRef.current = fadeOutAnalysisLayers(map, STEP_THREE_LAYER_FADE_DURATION_MS);
  }, [mapStatus, phase]);

  useEffect(() => {
    if (phase !== "results") {
      startedResultsTransitionRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready") {
      return;
    }

    if (phase === "results") {
      map.setMinZoom(STEP_THREE_MIN_ZOOM);
      map.setMaxZoom(STEP_THREE_MAX_ZOOM);

      const clampedZoom = Math.min(STEP_THREE_MAX_ZOOM, Math.max(STEP_THREE_MIN_ZOOM, map.getZoom()));
      if (Math.abs(clampedZoom - map.getZoom()) > 1e-6) {
        map.setZoom(clampedZoom);
      }
      return;
    }

    map.setMinZoom(MAPLIBRE_DEFAULT_MIN_ZOOM);
    map.setMaxZoom(MAPLIBRE_DEFAULT_MAX_ZOOM);
  }, [mapStatus, phase]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready") {
      return;
    }

    if (phase === "results") {
      // Step 3 should only zoom through explicit UI controls.
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      return;
    }

    map.scrollZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.disableRotation();
  }, [mapStatus, phase]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready") {
      return;
    }

    setGeoJsonSourceData(map, BUILDINGS_SOURCE_ID, buildingsGeoJson ?? EMPTY_FEATURE_COLLECTION);
  }, [buildingsGeoJson, mapStatus]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready") {
      return;
    }

    setGeoJsonSourceData(map, TREES_SOURCE_ID, treesGeoJson ?? EMPTY_FEATURE_COLLECTION);
  }, [mapStatus, treesGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = turbineMarkerRef.current;

    if (!map || !marker) {
      return;
    }

    setMarkerPosition(marker, selectedLocation);
    resizeTurbineMarker(marker, map, selectedLocation);
  }, [selectedLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready") {
      return;
    }

    upsertLandcoverLayer(map, landcoverPreview);
  }, [landcoverPreview, mapStatus]);

  const handleZoomIn = () => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready" || phase !== "results") {
      return;
    }

    map.stop();
    map.easeTo({
      center: [selectedLocationRef.current.longitude, selectedLocationRef.current.latitude],
      zoom: Math.min(STEP_THREE_MAX_ZOOM, map.getZoom() + STEP_THREE_ZOOM_STEP),
      duration: STEP_THREE_CONTROL_ZOOM_DURATION_MS,
      essential: true
    });
  };

  const handleZoomOut = () => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready" || phase !== "results") {
      return;
    }

    map.stop();
    map.easeTo({
      center: [selectedLocationRef.current.longitude, selectedLocationRef.current.latitude],
      zoom: Math.max(STEP_THREE_MIN_ZOOM, map.getZoom() - STEP_THREE_ZOOM_STEP),
      duration: STEP_THREE_CONTROL_ZOOM_DURATION_MS,
      essential: true
    });
  };

  return (
    <section>
      <div className="relative overflow-hidden rounded-[2px]">
        <div
          ref={mapContainerRef}
          className={`${phase === "results" ? "h-[max(190px,min(460px,calc(100dvh-250px)))]" : "h-[max(190px,calc(100dvh-150px))]"} w-full sm:h-[max(240px,min(520px,calc(100dvh-230px)))] 2xl:h-[min(700px,calc(100dvh-220px))]`}
          aria-label="Live analysis map"
        />
        {phase === "results" && windRoseActualValues ? (
          <WindRoseMapOverlay actualValues={windRoseActualValues} potentialValues={windRosePotentialValues} />
        ) : null}
        {phase === "results" && mapStatus === "ready" ? (
          <div className="absolute left-2.5 top-2.5 z-30 overflow-hidden rounded-[2px] border border-black/15 bg-white shadow-[0_1px_5px_rgba(0,0,0,0.22)]">
            <button
              type="button"
              aria-label="Zoom in"
              className="flex h-8 w-8 items-center justify-center text-[#303030] transition-colors hover:bg-[#F3F3F3] focus-visible:bg-[#F3F3F3] focus-visible:outline-none"
              onClick={handleZoomIn}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <div className="h-px w-8 bg-[#E6E6E6]" aria-hidden />
            <button
              type="button"
              aria-label="Zoom out"
              className="flex h-8 w-8 items-center justify-center text-[#303030] transition-colors hover:bg-[#F3F3F3] focus-visible:bg-[#F3F3F3] focus-visible:outline-none"
              onClick={handleZoomOut}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}

        {mapStatus === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/95 p-5 text-center">
            <p className="max-w-xs text-sm text-red-700" role="alert">
              Map could not be loaded. Analysis will continue without map updates.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ensureGeoJsonSource(map: MapLibreMap, sourceId: string): void {
  if (map.getSource(sourceId)) {
    return;
  }

  map.addSource(sourceId, {
    type: "geojson",
    data: EMPTY_FEATURE_COLLECTION
  });
}

function setGeoJsonSourceData(
  map: MapLibreMap,
  sourceId: string,
  featureCollection: FeatureCollection<Geometry>
): void {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  source.setData(featureCollection);
}

function upsertLandcoverLayer(
  map: MapLibreMap,
  landcoverPreview: AnalysisLandcoverPreviewEvent | null
): void {
  if (!landcoverPreview?.imageBase64 || !landcoverPreview.bounds) {
    if (map.getLayer(LANDCOVER_LAYER_ID)) {
      map.setLayoutProperty(LANDCOVER_LAYER_ID, "visibility", "none");
    }
    return;
  }

  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [landcoverPreview.bounds.west, landcoverPreview.bounds.north],
    [landcoverPreview.bounds.east, landcoverPreview.bounds.north],
    [landcoverPreview.bounds.east, landcoverPreview.bounds.south],
    [landcoverPreview.bounds.west, landcoverPreview.bounds.south]
  ];

  if (!map.getSource(LANDCOVER_SOURCE_ID)) {
    map.addSource(LANDCOVER_SOURCE_ID, {
      type: "image",
      url: landcoverPreview.imageBase64,
      coordinates
    } satisfies ImageSourceSpecification);

    map.addLayer({
      id: LANDCOVER_LAYER_ID,
      type: "raster",
      source: LANDCOVER_SOURCE_ID,
      paint: {
        "raster-opacity": 0.5
      }
    });

    return;
  }

  const source = map.getSource(LANDCOVER_SOURCE_ID) as maplibregl.ImageSource | undefined;

  if (!source) {
    return;
  }

  source.updateImage({
    url: landcoverPreview.imageBase64,
    coordinates
  });

  if (map.getLayer(LANDCOVER_LAYER_ID)) {
    map.setLayoutProperty(LANDCOVER_LAYER_ID, "visibility", "visible");
  }
}

function createTurbineMarkerElement(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.pointerEvents = "none";

  const video = document.createElement("video");
  setTurbineVideoSource(video);
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "contain";
  video.style.display = "block";

  container.appendChild(video);
  void video.play().catch(() => {
    // Autoplay can be blocked by browser policies in rare cases.
  });

  return container;
}

function setMarkerPosition(marker: maplibregl.Marker | null, location: SelectedLocation): void {
  if (!marker) {
    return;
  }

  marker.setLngLat([location.longitude, location.latitude]);
}

function resizeTurbineMarker(marker: maplibregl.Marker | null, map: MapLibreMap, location: SelectedLocation): void {
  if (!marker) {
    return;
  }

  const markerElement = marker.getElement();
  const markerVideo = markerElement.querySelector("video");
  const diameterPixels = meterDiameterToPixelSize(
    map,
    location.longitude,
    location.latitude,
    TURBINE_MARKER_DIAMETER_METERS
  );

  setSquareSize(markerElement, diameterPixels);
  markerElement.style.display = "block";

  if (markerVideo) {
    void markerVideo.play().catch(() => {
      // Autoplay can be blocked by browser policies in rare cases.
    });
  }
}

function meterDiameterToPixelSize(
  map: MapLibreMap,
  longitude: number,
  latitude: number,
  sizeMeters: number
): number {
  const halfSize = sizeMeters / 2;
  const westPoint = destinationPoint(latitude, longitude, 270, halfSize);
  const eastPoint = destinationPoint(latitude, longitude, 90, halfSize);

  const westProjected = map.project([westPoint.longitude, westPoint.latitude]);
  const eastProjected = map.project([eastPoint.longitude, eastPoint.latitude]);
  const width = Math.abs(eastProjected.x - westProjected.x);

  return Math.max(1, width);
}

function setSquareSize(element: HTMLElement, rawSize: number): void {
  const snappedSize = snapPixelSize(rawSize);
  const currentWidth = Number.parseFloat(element.style.width);
  const currentHeight = Number.parseFloat(element.style.height);
  const widthDiff = Number.isFinite(currentWidth) ? Math.abs(currentWidth - snappedSize) : Number.POSITIVE_INFINITY;
  const heightDiff = Number.isFinite(currentHeight) ? Math.abs(currentHeight - snappedSize) : Number.POSITIVE_INFINITY;

  if (widthDiff <= MARKER_SIZE_UPDATE_EPSILON_PX && heightDiff <= MARKER_SIZE_UPDATE_EPSILON_PX) {
    return;
  }

  element.style.width = `${snappedSize}px`;
  element.style.height = `${snappedSize}px`;
}

function snapPixelSize(value: number): number {
  return Math.max(1, Math.round(value / MARKER_SIZE_SNAP_STEP_PX) * MARKER_SIZE_SNAP_STEP_PX);
}

function destinationPoint(
  latitude: number,
  longitude: number,
  bearingDegrees: number,
  distanceMeters: number
): { latitude: number; longitude: number } {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;

  const nextLatitudeRadians = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance)
    + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const nextLongitudeRadians = longitudeRadians + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(nextLatitudeRadians)
  );

  return {
    latitude: (nextLatitudeRadians * 180) / Math.PI,
    longitude: ((((nextLongitudeRadians * 180) / Math.PI) + 540) % 360) - 180
  };
}

function fadeOutAnalysisLayers(map: MapLibreMap, durationMs: number): () => void {
  const tracks: Array<{
    layerId: string;
    property: string;
    from: number;
    to: number;
  }> = [];

  const appendTrack = (layerId: string, property: string) => {
    if (!map.getLayer(layerId)) {
      return;
    }

    const currentValue = map.getPaintProperty(layerId, property);

    if (typeof currentValue !== "number") {
      return;
    }

    tracks.push({
      layerId,
      property,
      from: currentValue,
      to: 0
    });
  };

  appendTrack(BUILDINGS_FILL_LAYER_ID, "fill-opacity");
  appendTrack(BUILDINGS_OUTLINE_LAYER_ID, "line-opacity");
  appendTrack(TREES_FILL_LAYER_ID, "fill-opacity");
  appendTrack(TREES_OUTLINE_LAYER_ID, "line-opacity");
  appendTrack(LANDCOVER_LAYER_ID, "raster-opacity");

  if (tracks.length === 0) {
    return () => {};
  }

  const startedAt = performance.now();
  let isCancelled = false;
  let animationFrame: number | null = null;

  const tick = () => {
    if (isCancelled) {
      return;
    }

    const elapsed = performance.now() - startedAt;
    const progress = Math.min(1, Math.max(0, elapsed / durationMs));

    for (const track of tracks) {
      const nextValue = track.from + (track.to - track.from) * progress;
      map.setPaintProperty(track.layerId, track.property, nextValue);
    }

    if (progress < 1) {
      animationFrame = window.requestAnimationFrame(tick);
      return;
    }

    setGeoJsonSourceData(map, BUILDINGS_SOURCE_ID, EMPTY_FEATURE_COLLECTION);
    setGeoJsonSourceData(map, TREES_SOURCE_ID, EMPTY_FEATURE_COLLECTION);

    if (map.getLayer(LANDCOVER_LAYER_ID)) {
      map.setLayoutProperty(LANDCOVER_LAYER_ID, "visibility", "none");
      map.setPaintProperty(LANDCOVER_LAYER_ID, "raster-opacity", 0.5);
    }

    if (map.getLayer(BUILDINGS_FILL_LAYER_ID)) {
      map.setPaintProperty(BUILDINGS_FILL_LAYER_ID, "fill-opacity", 0.32);
    }
    if (map.getLayer(BUILDINGS_OUTLINE_LAYER_ID)) {
      map.setPaintProperty(BUILDINGS_OUTLINE_LAYER_ID, "line-opacity", 0.95);
    }
    if (map.getLayer(TREES_FILL_LAYER_ID)) {
      map.setPaintProperty(TREES_FILL_LAYER_ID, "fill-opacity", 0.3);
    }
    if (map.getLayer(TREES_OUTLINE_LAYER_ID)) {
      map.setPaintProperty(TREES_OUTLINE_LAYER_ID, "line-opacity", 0.95);
    }
  };

  animationFrame = window.requestAnimationFrame(tick);

  return () => {
    isCancelled = true;

    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };
}

function lockCenterToSelectedLocation(map: MapLibreMap, selectedLocation: SelectedLocation): void {
  const center = map.getCenter();
  const latitudeDiff = Math.abs(center.lat - selectedLocation.latitude);
  const longitudeDiff = Math.abs(center.lng - selectedLocation.longitude);

  if (latitudeDiff < 1e-8 && longitudeDiff < 1e-8) {
    return;
  }

  map.setCenter([selectedLocation.longitude, selectedLocation.latitude]);
}

function readViewState(map: MapLibreMap): MapViewState {
  const center = map.getCenter();

  return {
    latitude: center.lat,
    longitude: center.lng,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch()
  };
}

function easeToStepThreeDefaultView(
  map: MapLibreMap,
  selectedLocation: SelectedLocation,
  duration: number
): void {
  map.easeTo({
    center: [selectedLocation.longitude, selectedLocation.latitude],
    zoom: STEP_THREE_DEFAULT_ZOOM,
    bearing: 0,
    pitch: 0,
    duration,
    essential: true
  });
}
