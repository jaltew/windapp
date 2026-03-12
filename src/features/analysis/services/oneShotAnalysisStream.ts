import type {
  AnalysisBuildingsEvent,
  AnalysisErrorEvent,
  AnalysisLandcoverBounds,
  AnalysisLandcoverPreviewEvent,
  AnalysisObstaclesEvent,
  AnalysisProgressEvent,
  AnalysisResultEvent,
  AnalysisStreamEvent,
  AnalysisTokenEvent,
  AnalysisTreesEvent,
  StartAnalysisRequest
} from "../../../types/analysis";
import type { FeatureCollection, Geometry } from "geojson";

const DEFAULT_API_BASE_URL = "/api/public-wizard";
const ONE_SHOT_STREAM_PATH = "/one-shot/stream";

interface OneShotAnalysisStreamOptions {
  signal?: AbortSignal;
  onEvent?: (event: AnalysisStreamEvent) => void;
}

export async function streamOneShotAnalysis(
  request: StartAnalysisRequest,
  options: OneShotAnalysisStreamOptions = {}
): Promise<void> {
  const { signal, onEvent } = options;
  const url = getOneShotStreamUrl();
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      signal
    });
  } catch {
    throw new Error(
      `Could not reach analysis API at ${url}. Check that the backend is running, VITE_WIND_API_BASE_URL is correct, and CORS/HTTPS settings allow this request.`
    );
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Analysis request failed with status ${response.status}.`);
  }

  if (!response.body) {
    throw new Error("Analysis stream was opened, but no response body was available.");
  }

  await readSseStream(response.body, (eventName, rawData) => {
    const event = parseAnalysisEvent(eventName, rawData);

    if (!event) {
      return;
    }

    onEvent?.(event);

    if (event.type === "error") {
      throw new Error(event.data.message);
    }
  });
}

function getOneShotStreamUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_WIND_API_BASE_URL as string | undefined;
  const baseUrl = configuredBaseUrl?.trim() || DEFAULT_API_BASE_URL;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBaseUrl}${ONE_SHOT_STREAM_PATH}`;
}

async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onBlock: (eventName: string, rawData: string) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        processSseBlock(block, onBlock);
      }
    }

    const trailing = buffer.trim();

    if (trailing) {
      processSseBlock(trailing, onBlock);
    }
  } finally {
    reader.releaseLock();
  }
}

function processSseBlock(
  block: string,
  onBlock: (eventName: string, rawData: string) => void
): void {
  const lines = block.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  onBlock(eventName, dataLines.join("\n"));
}

function parseAnalysisEvent(eventName: string, rawData: string): AnalysisStreamEvent | null {
  const parsed = parseJsonRecord(rawData);
  const normalizedEventName = eventName.trim().toLowerCase();

  switch (normalizedEventName) {
    case "token":
      return { type: "token", data: parseTokenEvent(parsed) };
    case "progress":
      return { type: "progress", data: parseProgressEvent(parsed) };
    case "building":
    case "buildings":
      return { type: "buildings", data: parseBuildingsEvent(parsed) };
    case "landcover":
    case "landcover_preview":
      return { type: "landcover_preview", data: parseLandcoverPreviewEvent(parsed) };
    case "tree":
    case "trees":
      return { type: "trees", data: parseTreesEvent(parsed) };
    case "obstacle":
    case "obstacles":
      return { type: "obstacles", data: parseObstaclesEvent(parsed) };
    case "result":
      return { type: "result", data: parseResultEvent(parsed) };
    case "error":
      return { type: "error", data: parseErrorEvent(parsed) };
    default:
      return null;
  }
}

function parseJsonRecord(rawData: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawData) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseTokenEvent(payload: Record<string, unknown>): AnalysisTokenEvent {
  return {
    shareToken: readStringField(payload, "shareToken") ?? readStringField(payload, "share_token") ?? "",
    analysisId: readNumberField(payload, "analysisId") ?? readNumberField(payload, "analysis_id")
  };
}

function parseProgressEvent(payload: Record<string, unknown>): AnalysisProgressEvent {
  return {
    step: readStringField(payload, "step") ?? "processing",
    percent: readNumberField(payload, "percent"),
    message: readStringField(payload, "message")
  };
}

function parseBuildingsEvent(payload: Record<string, unknown>): AnalysisBuildingsEvent {
  return {
    buildingCount: readNumberField(payload, "buildingCount") ?? readNumberField(payload, "building_count"),
    buildingsGeoJson:
      parseFeatureCollection(payload.buildingsGeoJson) ?? parseFeatureCollection(payload.buildings_geojson)
  };
}

function parseLandcoverPreviewEvent(payload: Record<string, unknown>): AnalysisLandcoverPreviewEvent {
  const imageBase64 =
    readStringField(payload, "imageBase64") ??
    readStringField(payload, "image_base64") ??
    readStringField(payload, "image");

  return {
    imageBase64: normalizeLandcoverImage(imageBase64),
    bounds: parseLandcoverBounds(payload.bounds)
  };
}

function parseTreesEvent(payload: Record<string, unknown>): AnalysisTreesEvent {
  return {
    treeCount: readNumberField(payload, "treeCount") ?? readNumberField(payload, "tree_count"),
    treesGeoJson: parseFeatureCollection(payload.treesGeoJson) ?? parseFeatureCollection(payload.trees_geojson)
  };
}

function parseObstaclesEvent(payload: Record<string, unknown>): AnalysisObstaclesEvent {
  return {
    buildingCount: readNumberField(payload, "buildingCount") ?? readNumberField(payload, "building_count"),
    treeCount: readNumberField(payload, "treeCount") ?? readNumberField(payload, "tree_count"),
    buildingsGeoJson:
      parseFeatureCollection(payload.buildingsGeoJson) ?? parseFeatureCollection(payload.buildings_geojson),
    treesGeoJson: parseFeatureCollection(payload.treesGeoJson) ?? parseFeatureCollection(payload.trees_geojson)
  };
}

function parseResultEvent(payload: Record<string, unknown>): AnalysisResultEvent {
  const monthlyProductionKwh =
    readNumberArrayField(payload, "monthlyProductionKwh")
    ?? readNumberArrayField(payload, "monthly_production_kwh")
    ?? readNumberArrayField(payload, "monthlyProduction")
    ?? readNumberArrayField(payload, "monthly_production")
    ?? readNumberArrayField(payload, "monthlyKwh")
    ?? readNumberArrayField(payload, "monthly_kwh");

  const directionalProductionKwh =
    readNumberArrayField(payload, "directionalProductionKwh")
    ?? readNumberArrayField(payload, "directional_production_kwh")
    ?? readNumberArrayField(payload, "productionByDirectionKwh")
    ?? readNumberArrayField(payload, "production_by_direction_kwh")
    ?? readNumberArrayField(payload, "directionalAepKwh")
    ?? readNumberArrayField(payload, "directional_aep_kwh");

  const potentialMonthlyProductionKwh =
    readNumberArrayField(payload, "potentialMonthlyProductionKwh")
    ?? readNumberArrayField(payload, "potential_monthly_production_kwh")
    ?? readNumberArrayField(payload, "potentialMonthlyProduction")
    ?? readNumberArrayField(payload, "potential_monthly_production")
    ?? readNumberArrayField(payload, "grossMonthlyProductionKwh")
    ?? readNumberArrayField(payload, "gross_monthly_production_kwh")
    ?? readNumberArrayField(payload, "noObstacleMonthlyProductionKwh")
    ?? readNumberArrayField(payload, "no_obstacle_monthly_production_kwh");

  const potentialDirectionalProductionKwh =
    readNumberArrayField(payload, "potentialDirectionalProductionKwh")
    ?? readNumberArrayField(payload, "potential_directional_production_kwh")
    ?? readNumberArrayField(payload, "obstacleAdjustedPotentialDirectionalKwh")
    ?? readNumberArrayField(payload, "obstacle_adjusted_potential_directional_kwh")
    ?? readNumberArrayField(payload, "potentialByDirectionKwh")
    ?? readNumberArrayField(payload, "potential_by_direction_kwh")
    ?? readNumberArrayField(payload, "grossDirectionalProductionKwh")
    ?? readNumberArrayField(payload, "gross_directional_production_kwh");

  return {
    shareToken: readStringField(payload, "shareToken") ?? readStringField(payload, "share_token"),
    meanWindSpeed: readNumberField(payload, "meanWindSpeed"),
    aepKwh: readNumberField(payload, "aepKwh"),
    monthlyProductionKwh,
    directionalProductionKwh,
    potentialAepKwh:
      readNumberField(payload, "potentialAepKwh")
      ?? readNumberField(payload, "potential_aep_kwh")
      ?? readNumberField(payload, "obstacleAdjustedPotentialAepKwh")
      ?? readNumberField(payload, "obstacle_adjusted_potential_aep_kwh")
      ?? readNumberField(payload, "grossAepKwh")
      ?? readNumberField(payload, "gross_aep_kwh")
      ?? readNumberField(payload, "noObstacleAepKwh")
      ?? readNumberField(payload, "no_obstacle_aep_kwh"),
    potentialMonthlyProductionKwh,
    potentialDirectionalProductionKwh,
    windRosePercentages:
      readNumberArrayField(payload, "windRosePercentages")
      ?? readNumberArrayField(payload, "wind_rose_percentages")
      ?? readNumberArrayField(payload, "windRose")
      ?? readNumberArrayField(payload, "wind_rose")
      ?? readNumberArrayField(payload, "directionFrequency")
      ?? readNumberArrayField(payload, "direction_frequency"),
    potentialWindRosePercentages:
      readNumberArrayField(payload, "potentialWindRosePercentages")
      ?? readNumberArrayField(payload, "potential_wind_rose_percentages")
      ?? readNumberArrayField(payload, "obstacleAdjustedPotentialWindRosePercentages")
      ?? readNumberArrayField(payload, "obstacle_adjusted_potential_wind_rose_percentages")
      ?? readNumberArrayField(payload, "potentialDirectionFrequency")
      ?? readNumberArrayField(payload, "potential_direction_frequency"),
    windResourceScore: readNumberField(payload, "windResourceScore"),
    siteUtilizationScore: readNumberField(payload, "siteUtilizationScore")
      ?? readNumberField(payload, "site_utilization_score")
  };
}

function parseErrorEvent(payload: Record<string, unknown>): AnalysisErrorEvent {
  return {
    message: readStringField(payload, "message") ?? "Analysis failed unexpectedly."
  };
}

function readStringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumberField(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readNumberArrayField(payload: Record<string, unknown>, key: string): number[] | null {
  const value = payload[key];

  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value
    .map((entry) => {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        return entry;
      }

      if (typeof entry === "string" && entry.trim().length > 0) {
        const numeric = Number.parseFloat(entry);
        return Number.isFinite(numeric) ? numeric : null;
      }

      return null;
    })
    .filter((entry): entry is number => entry !== null);

  return parsed.length > 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFeatureCollection(value: unknown): FeatureCollection<Geometry> | null {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    return null;
  }

  return value as unknown as FeatureCollection<Geometry>;
}

function parseLandcoverBounds(value: unknown): AnalysisLandcoverBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  const north = readNumberField(value, "north");
  const south = readNumberField(value, "south");
  const east = readNumberField(value, "east");
  const west = readNumberField(value, "west");

  const resolvedNorth = north ?? readNumberField(value, "n");
  const resolvedSouth = south ?? readNumberField(value, "s");
  const resolvedEast = east ?? readNumberField(value, "e");
  const resolvedWest = west ?? readNumberField(value, "w");

  if (resolvedNorth === null || resolvedSouth === null || resolvedEast === null || resolvedWest === null) {
    return null;
  }

  return {
    north: resolvedNorth,
    south: resolvedSouth,
    east: resolvedEast,
    west: resolvedWest
  };
}

function normalizeLandcoverImage(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:image")) {
    return value;
  }

  return `data:image/png;base64,${value}`;
}
