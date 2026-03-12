import { useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { DEV_STEP3_CACHE_KEY, LATEST_STEP3_CACHE_KEY, readStorageJson, writeStorageJson } from "../lib/devStep3Storage";
import { DEFAULT_DEV_STEP3_PAYLOAD } from "../mocks/devStep3Payload";
import { AnalysisLoadingPage, type AnalysisCompletionPayload } from "./AnalysisLoadingPage";
import type { AnalysisLandcoverBounds, AnalysisLandcoverPreviewEvent, AnalysisResultEvent } from "../types/analysis";
import type { SelectedLocation } from "../types/location";
import type { MapViewState } from "../types/map";

export function DevStep3Page() {
  const [payload, setPayload] = useState<AnalysisCompletionPayload>(() => resolveInitialPayload());
  return (
    <AnalysisLoadingPage
      location={payload.location}
      initialMapView={payload.mapView}
      onBackToLocation={() => {}}
      onGoToStepTwo={() => {}}
      onGoToStepThree={() => {}}
      onAnalysisComplete={(nextPayload) => {
        setPayload(nextPayload);
        writeStorageJson(DEV_STEP3_CACHE_KEY, nextPayload);
      }}
      autoStart={false}
      onMapReady={() => {}}
      currentStep="results"
      initialCompletedAnalysis={payload}
    />
  );
}

function resolveInitialPayload(): AnalysisCompletionPayload {
  const fromDevCache = coerceCompletionPayload(readStorageJson(DEV_STEP3_CACHE_KEY));
  if (fromDevCache) {
    return fromDevCache;
  }

  const fromLatestRun = coerceCompletionPayload(readStorageJson(LATEST_STEP3_CACHE_KEY));
  if (fromLatestRun) {
    return fromLatestRun;
  }

  return DEFAULT_DEV_STEP3_PAYLOAD;
}

function coerceCompletionPayload(value: unknown): AnalysisCompletionPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const location = coerceLocation(value.location);
  if (!location) {
    return null;
  }

  return {
    location,
    mapView: coerceMapView(value.mapView, location),
    buildingsGeoJson: coerceFeatureCollection(value.buildingsGeoJson),
    treesGeoJson: coerceFeatureCollection(value.treesGeoJson),
    landcoverPreview: coerceLandcoverPreview(value.landcoverPreview),
    result: coerceResult(value.result)
  };
}

function coerceLocation(value: unknown): SelectedLocation | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = coerceString(value.id);
  const name = coerceString(value.name);
  const latitude = coerceNumber(value.latitude);
  const longitude = coerceNumber(value.longitude);

  if (!id || !name || latitude === null || longitude === null) {
    return null;
  }

  const source = value.source === "map" ? "map" : "search";

  return {
    id,
    name,
    latitude,
    longitude,
    source,
    region: coerceOptionalString(value.region) ?? undefined,
    country: coerceOptionalString(value.country) ?? undefined
  };
}

function coerceMapView(value: unknown, location: SelectedLocation): MapViewState {
  if (!isRecord(value)) {
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      zoom: 16,
      bearing: 0,
      pitch: 0
    };
  }

  const latitude = coerceNumber(value.latitude) ?? location.latitude;
  const longitude = coerceNumber(value.longitude) ?? location.longitude;
  const zoom = coerceNumber(value.zoom) ?? 16;
  const bearing = coerceNumber(value.bearing) ?? 0;
  const pitch = coerceNumber(value.pitch) ?? 0;

  return { latitude, longitude, zoom, bearing, pitch };
}

function coerceFeatureCollection(value: unknown): FeatureCollection<Geometry> | null {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    return null;
  }

  return value as unknown as FeatureCollection<Geometry>;
}

function coerceLandcoverPreview(value: unknown): AnalysisLandcoverPreviewEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const imageBase64 = coerceOptionalString(value.imageBase64);
  const bounds = coerceLandcoverBounds(value.bounds);

  if (!imageBase64 && !bounds) {
    return null;
  }

  return {
    imageBase64,
    bounds
  };
}

function coerceLandcoverBounds(value: unknown): AnalysisLandcoverBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  const north = coerceNumber(value.north);
  const south = coerceNumber(value.south);
  const east = coerceNumber(value.east);
  const west = coerceNumber(value.west);

  if (north === null || south === null || east === null || west === null) {
    return null;
  }

  return { north, south, east, west };
}

function coerceResult(value: unknown): AnalysisResultEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    shareToken: coerceOptionalString(value.shareToken),
    meanWindSpeed: coerceNumberOrNull(value.meanWindSpeed),
    aepKwh: coerceNumberOrNull(value.aepKwh),
    monthlyProductionKwh: coerceNumberArrayOrNull(value.monthlyProductionKwh),
    directionalProductionKwh: coerceNumberArrayOrNull(value.directionalProductionKwh),
    potentialAepKwh: coerceNumberOrNull(value.potentialAepKwh),
    potentialMonthlyProductionKwh: coerceNumberArrayOrNull(value.potentialMonthlyProductionKwh),
    potentialDirectionalProductionKwh: coerceNumberArrayOrNull(value.potentialDirectionalProductionKwh),
    windRosePercentages: coerceNumberArrayOrNull(value.windRosePercentages),
    potentialWindRosePercentages: coerceNumberArrayOrNull(value.potentialWindRosePercentages),
    windResourceScore: coerceNumberOrNull(value.windResourceScore),
    siteUtilizationScore: coerceNumberOrNull(value.siteUtilizationScore)
  };
}

function coerceNumberArrayOrNull(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value
    .map((entry) => coerceNumber(entry))
    .filter((entry): entry is number => entry !== null);

  return numbers.length > 0 ? numbers : null;
}

function coerceNumberOrNull(value: unknown): number | null {
  return coerceNumber(value);
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function coerceOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
