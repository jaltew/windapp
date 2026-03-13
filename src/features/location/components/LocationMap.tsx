import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import maplibregl, {
  type Map as MapLibreMap,
  type StyleSpecification
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SelectedLocation } from "../../../types/location";
import type { MapViewState } from "../../../types/map";

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

const DEFAULT_CENTER: [number, number] = [12.568337, 55.676098];
const DEFAULT_ZOOM = 4.2;
const SEARCH_FOCUS_ZOOM = 10;
const COORDINATE_FOCUS_ZOOM = 15.5;
const SELECTED_LOCATION_ZOOM = 16;
const SELECTED_MAP_CLICK_ZOOM = 17;
const MAX_LOCATION_MAP_ZOOM = 18.64;
const SELECTION_DIAMETER_METERS = 40;
const TURBINE_MARKER_DIAMETER_METERS = 15;
const EARTH_RADIUS_METERS = 6_371_008.8;

const SELECTION_SOURCE_ID = "selected-location-circle-source";
const SELECTION_FILL_LAYER_ID = "selected-location-circle-fill";
const SELECTION_OUTLINE_LAYER_ID = "selected-location-circle-outline";
const TURBINE_VIDEO_SRC = "/media/turbine-top-alpha.webm";

const EMPTY_SELECTION: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: []
};

interface LocationMapProps {
  selectedLocation: SelectedLocation | null;
  focusLocation: SelectedLocation | null;
  onSelectLocation: (location: SelectedLocation) => void;
  initialViewState?: MapViewState | null;
  onViewStateChange?: (viewState: MapViewState) => void;
}

type MapStatus = "loading" | "ready" | "error";

export function LocationMap({
  selectedLocation,
  focusLocation,
  onSelectLocation,
  initialViewState = null,
  onViewStateChange
}: LocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const initialViewStateRef = useRef<MapViewState | null>(initialViewState);
  const turbineMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selectedLocationRef = useRef<SelectedLocation | null>(selectedLocation);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [showPlacementHint, setShowPlacementHint] = useState(true);

  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
  }, [selectedLocation]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DEFAULT_BASMAP_STYLE,
      center: initialViewStateRef.current
        ? [initialViewStateRef.current.longitude, initialViewStateRef.current.latitude]
        : DEFAULT_CENTER,
      zoom: initialViewStateRef.current?.zoom ?? DEFAULT_ZOOM,
      maxZoom: MAX_LOCATION_MAP_ZOOM,
      bearing: initialViewStateRef.current?.bearing ?? 0,
      pitch: initialViewStateRef.current?.pitch ?? 0,
      attributionControl: {}
    });

    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();
    mapRef.current = map;

    map.on("load", () => {
      if (!map.getSource(SELECTION_SOURCE_ID)) {
        map.addSource(SELECTION_SOURCE_ID, {
          type: "geojson",
          data: EMPTY_SELECTION
        });
      }

      if (!map.getLayer(SELECTION_FILL_LAYER_ID)) {
        map.addLayer({
          id: SELECTION_FILL_LAYER_ID,
          type: "fill",
          source: SELECTION_SOURCE_ID,
          paint: {
            "fill-color": "#ffffff",
            "fill-opacity": 0
          }
        });
      }

      if (!map.getLayer(SELECTION_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: SELECTION_OUTLINE_LAYER_ID,
          type: "line",
          source: SELECTION_SOURCE_ID,
          paint: {
            "line-color": "#ffffff",
            "line-width": 1.2,
            "line-opacity": 0.95,
            "line-dasharray": [2, 2]
          }
        });
      }

      if (!turbineMarkerRef.current) {
        const markerElement = createTurbineMarkerElement();
        markerElement.style.display = selectedLocation ? "block" : "none";

        const marker = new maplibregl.Marker({
          element: markerElement,
          anchor: "center"
        })
          .setLngLat([
            selectedLocation?.longitude ?? map.getCenter().lng,
            selectedLocation?.latitude ?? map.getCenter().lat
          ])
          .addTo(map);

        turbineMarkerRef.current = marker;
      }

      updateTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
      // iOS Safari can settle dynamic viewport height after first paint; force a resize pass.
      window.requestAnimationFrame(() => {
        map.resize();
        updateTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
      });

      setMapStatus("ready");
      onViewStateChange?.(readViewState(map));
    });

    map.on("error", () => {
      setMapStatus((currentStatus) => (currentStatus === "ready" ? currentStatus : "error"));
    });

    map.on("click", (event) => {
      const { lat, lng } = event.lngLat;

      onSelectLocation({
        id: `map-${lat.toFixed(6)}-${lng.toFixed(6)}`,
        name: "Selected map point",
        latitude: lat,
        longitude: lng,
        source: "map"
      });
    });

    map.on("moveend", () => {
      onViewStateChange?.(readViewState(map));
    });

    map.on("zoom", () => {
      updateTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
    });

    map.on("zoomend", () => {
      updateTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
    });

    return () => {
      turbineMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [onSelectLocation, onViewStateChange]);

  useEffect(() => {
    const map = mapRef.current;
    const container = mapContainerRef.current;

    if (!map || !container || mapStatus !== "ready") {
      return;
    }

    const handleContainerOrViewportResize = () => {
      map.resize();
      updateTurbineMarker(turbineMarkerRef.current, map, selectedLocationRef.current);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleContainerOrViewportResize();
    });
    resizeObserver.observe(container);

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", handleContainerOrViewportResize);
    window.addEventListener("orientationchange", handleContainerOrViewportResize);

    // Extra resize passes fix initial iPhone Safari paint where controls render
    // correctly but raster imagery only paints the top region.
    const startupResizeTimeouts = [0, 120, 350, 900].map((delayMs) => (
      window.setTimeout(() => {
        handleContainerOrViewportResize();
      }, delayMs)
    ));

    return () => {
      resizeObserver.disconnect();
      visualViewport?.removeEventListener("resize", handleContainerOrViewportResize);
      window.removeEventListener("orientationchange", handleContainerOrViewportResize);
      startupResizeTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [mapStatus]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !focusLocation) {
      return;
    }

    const targetFocusZoom = focusLocation.id.startsWith("coordinate-")
      ? COORDINATE_FOCUS_ZOOM
      : SEARCH_FOCUS_ZOOM;

    map.flyTo({
      center: [focusLocation.longitude, focusLocation.latitude],
      zoom: Math.max(map.getZoom(), targetFocusZoom),
      duration: 700,
      essential: true
    });
  }, [focusLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || mapStatus !== "ready") {
      return;
    }

    setSelectionCircle(map, selectedLocation);

    if (!selectedLocation) {
      return;
    }

    map.flyTo({
      center: [selectedLocation.longitude, selectedLocation.latitude],
      zoom: Math.max(
        map.getZoom(),
        selectedLocation.source === "map" ? SELECTED_MAP_CLICK_ZOOM : SELECTED_LOCATION_ZOOM
      ),
      duration: 900,
      essential: true
    });
  }, [mapStatus, selectedLocation]);

  useEffect(() => {
    const marker = turbineMarkerRef.current;
    const map = mapRef.current;

    if (!marker || !map) {
      return;
    }
    updateTurbineMarker(marker, map, selectedLocation);
  }, [selectedLocation]);

  useEffect(() => {
    if (!showPlacementHint) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLElement
        && (
          target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
          || target.isContentEditable
        )
      ) {
        return;
      }

      if (event.key === "Escape") {
        setShowPlacementHint(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPlacementHint]);

  return (
    <section>
      <div className="relative overflow-hidden rounded-t-[2px] rounded-b-none">
        <div
          ref={mapContainerRef}
          className="h-[max(190px,calc(100dvh-212px))] w-full sm:h-[max(240px,min(520px,calc(100dvh-230px)))] 2xl:h-[min(700px,calc(100dvh-220px))]"
          aria-label="Interactive location map"
        />

        {mapStatus === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/75 text-sm font-medium text-muted">
            Loading map...
          </div>
        ) : null}

        {mapStatus === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/95 p-5 text-center">
            <p className="max-w-xs text-sm text-red-700" role="alert">
              Map could not be loaded. Use the search field to continue selecting a location.
            </p>
          </div>
        ) : null}

        {showPlacementHint ? (
          <aside className="pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[400px] max-w-[calc(100%-16px)] rounded-[2px] border border-[#CDCDCD] bg-[#ECECEC] px-5 pb-[1.3rem] pt-4 shadow-[0_1px_9px_4px_rgba(181,181,181,0.1804)] -translate-x-1/2">
            <button
              type="button"
              aria-label="Close placement information"
              className="absolute right-3 top-2 inline-flex h-7 w-7 items-center justify-center text-[#525252]"
              onClick={() => setShowPlacementHint(false)}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <p className="text-[16px] font-semibold text-[#525252]">Placement</p>
            <p className="mt-2 text-[14px] font-medium leading-[1.35] text-[#525252]">
              Click the map to select the WM 25 kW site. The marked 40 m diameter must be clear of buildings and
              trees.
            </p>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function setSelectionCircle(map: MapLibreMap, selectedLocation: SelectedLocation | null): void {
  const source = map.getSource(SELECTION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  if (!selectedLocation) {
    source.setData(EMPTY_SELECTION);
    return;
  }

  const circle = createMeterCircleFeature(
    selectedLocation.latitude,
    selectedLocation.longitude,
    SELECTION_DIAMETER_METERS / 2
  );

  source.setData({
    type: "FeatureCollection",
    features: [circle]
  });
}

function createMeterCircleFeature(latitude: number, longitude: number, radiusMeters: number): Feature<Polygon> {
  const steps = 72;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;

  const coordinates: [number, number][] = [];

  for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
    const bearing = (2 * Math.PI * stepIndex) / steps;

    const sinLatitude = Math.sin(latitudeRadians);
    const cosLatitude = Math.cos(latitudeRadians);
    const sinAngularDistance = Math.sin(angularDistance);
    const cosAngularDistance = Math.cos(angularDistance);

    const nextLatitudeRadians = Math.asin(
      sinLatitude * cosAngularDistance + cosLatitude * sinAngularDistance * Math.cos(bearing)
    );

    const y = Math.sin(bearing) * sinAngularDistance * cosLatitude;
    const x = cosAngularDistance - sinLatitude * Math.sin(nextLatitudeRadians);
    const nextLongitudeRadians = longitudeRadians + Math.atan2(y, x);

    const wrappedLongitude = ((((nextLongitudeRadians * 180) / Math.PI) + 540) % 360) - 180;
    const nextLatitude = (nextLatitudeRadians * 180) / Math.PI;

    coordinates.push([wrappedLongitude, nextLatitude]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coordinates]
    }
  };
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

function createTurbineMarkerElement(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.pointerEvents = "none";

  const video = document.createElement("video");
  video.src = TURBINE_VIDEO_SRC;
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

function updateTurbineMarker(marker: maplibregl.Marker | null, map: MapLibreMap, location: SelectedLocation | null): void {
  if (!marker) {
    return;
  }

  const markerElement = marker.getElement();
  const markerVideo = markerElement.querySelector("video");

  if (!location) {
    markerElement.style.display = "none";
    return;
  }

  const pixelSize = meterSizeToPixelSize(
    map,
    location.longitude,
    location.latitude,
    TURBINE_MARKER_DIAMETER_METERS
  );
  markerElement.style.width = `${pixelSize.width}px`;
  markerElement.style.height = `${pixelSize.height}px`;
  marker.setLngLat([location.longitude, location.latitude]);
  markerElement.style.display = "block";

  if (markerVideo) {
    void markerVideo.play().catch(() => {
      // Autoplay can be blocked by browser policies in rare cases.
    });
  }
}

function meterSizeToPixelSize(
  map: MapLibreMap,
  longitude: number,
  latitude: number,
  sizeMeters: number
): { width: number; height: number } {
  const halfSize = sizeMeters / 2;

  const westPoint = destinationPoint(latitude, longitude, 270, halfSize);
  const eastPoint = destinationPoint(latitude, longitude, 90, halfSize);
  const northPoint = destinationPoint(latitude, longitude, 0, halfSize);
  const southPoint = destinationPoint(latitude, longitude, 180, halfSize);

  const westProjected = map.project([westPoint.longitude, westPoint.latitude]);
  const eastProjected = map.project([eastPoint.longitude, eastPoint.latitude]);
  const northProjected = map.project([northPoint.longitude, northPoint.latitude]);
  const southProjected = map.project([southPoint.longitude, southPoint.latitude]);

  const width = Math.max(1, Math.abs(eastProjected.x - westProjected.x));
  const height = Math.max(1, Math.abs(southProjected.y - northProjected.y));

  return { width, height };
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

  const nextLatitude = (nextLatitudeRadians * 180) / Math.PI;
  const wrappedLongitude = ((((nextLongitudeRadians * 180) / Math.PI) + 540) % 360) - 180;

  return {
    latitude: nextLatitude,
    longitude: wrappedLongitude
  };
}

