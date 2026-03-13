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
import { buildPublicWizardUrl } from "./publicWizardApi";

const ONE_SHOT_STREAM_PATH = "/one-shot/stream";

interface OneShotAnalysisStreamOptions {
  signal?: AbortSignal;
  onEvent?: (event: AnalysisStreamEvent) => void;
}

interface ParsedWindRosePayload {
  siteAepBySector: number[] | null;
  localWindPotentialAepBySector: number[] | null;
  frequencyPercentages: number[] | null;
  meanSpeedLocal: number | null;
}

interface ParsedSpeedDistributionPayload {
  localWindPotentialAep: number | null;
  siteAepBySector: number[] | null;
  localWindPotentialAepBySector: number[] | null;
  frequencyPercentages: number[] | null;
}

interface ParsedSectorData {
  index: number | null;
  frequency: number | null;
  siteAepEstimate: number | null;
  localWindPotentialAep: number | null;
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
  return buildPublicWizardUrl(ONE_SHOT_STREAM_PATH);
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
      return { type: "result", data: parseAnalysisResultPayload(parsed) };
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

export function parseAnalysisResultPayload(payload: unknown): AnalysisResultEvent {
  const record = isRecord(payload) ? payload : {};
  const windRose =
    parseWindRosePayload(readRecordField(record, "windRose"))
    ?? parseWindRosePayload(readRecordField(record, "wind_rose"));
  const speedDistribution =
    parseSpeedDistributionPayload(readRecordField(record, "speedDistribution"))
    ?? parseSpeedDistributionPayload(readRecordField(record, "speed_distribution"));

  const monthlyProductionKwh =
    readNumberArrayField(record, "monthlyProductionKwh")
    ?? readNumberArrayField(record, "monthly_production_kwh")
    ?? readNumberArrayField(record, "monthlyProduction")
    ?? readNumberArrayField(record, "monthly_production")
    ?? readNumberArrayField(record, "monthlyKwh")
    ?? readNumberArrayField(record, "monthly_kwh")
    ?? parseMonthlyProductionEntries(record.monthlyProduction)
    ?? parseMonthlyProductionEntries(record.monthly_production);

  const directionalProductionKwh =
    readNumberArrayField(record, "directionalProductionKwh")
    ?? readNumberArrayField(record, "directional_production_kwh")
    ?? readNumberArrayField(record, "productionByDirectionKwh")
    ?? readNumberArrayField(record, "production_by_direction_kwh")
    ?? readNumberArrayField(record, "directionalAepKwh")
    ?? readNumberArrayField(record, "directional_aep_kwh")
    ?? windRose?.siteAepBySector
    ?? speedDistribution?.siteAepBySector
    ?? null;

  const potentialMonthlyProductionKwh =
    readNumberArrayField(record, "potentialMonthlyProductionKwh")
    ?? readNumberArrayField(record, "potential_monthly_production_kwh")
    ?? readNumberArrayField(record, "potentialMonthlyProduction")
    ?? readNumberArrayField(record, "potential_monthly_production")
    ?? readNumberArrayField(record, "grossMonthlyProductionKwh")
    ?? readNumberArrayField(record, "gross_monthly_production_kwh")
    ?? readNumberArrayField(record, "noObstacleMonthlyProductionKwh")
    ?? readNumberArrayField(record, "no_obstacle_monthly_production_kwh");

  const potentialDirectionalProductionKwh =
    readNumberArrayField(record, "potentialDirectionalProductionKwh")
    ?? readNumberArrayField(record, "potential_directional_production_kwh")
    ?? readNumberArrayField(record, "obstacleAdjustedPotentialDirectionalKwh")
    ?? readNumberArrayField(record, "obstacle_adjusted_potential_directional_kwh")
    ?? readNumberArrayField(record, "potentialByDirectionKwh")
    ?? readNumberArrayField(record, "potential_by_direction_kwh")
    ?? readNumberArrayField(record, "grossDirectionalProductionKwh")
    ?? readNumberArrayField(record, "gross_directional_production_kwh")
    ?? windRose?.localWindPotentialAepBySector
    ?? speedDistribution?.localWindPotentialAepBySector
    ?? null;

  const windRosePercentages =
    readNumberArrayField(record, "windRosePercentages")
    ?? readNumberArrayField(record, "wind_rose_percentages")
    ?? readNumberArrayField(record, "windRose")
    ?? readNumberArrayField(record, "wind_rose")
    ?? readNumberArrayField(record, "directionFrequency")
    ?? readNumberArrayField(record, "direction_frequency")
    ?? windRose?.frequencyPercentages
    ?? speedDistribution?.frequencyPercentages
    ?? null;

  const potentialWindRosePercentages =
    readNumberArrayField(record, "potentialWindRosePercentages")
    ?? readNumberArrayField(record, "potential_wind_rose_percentages")
    ?? readNumberArrayField(record, "obstacleAdjustedPotentialWindRosePercentages")
    ?? readNumberArrayField(record, "obstacle_adjusted_potential_wind_rose_percentages")
    ?? readNumberArrayField(record, "potentialDirectionFrequency")
    ?? readNumberArrayField(record, "potential_direction_frequency")
    ?? windRosePercentages;

  return {
    shareToken: readStringField(record, "shareToken") ?? readStringField(record, "share_token"),
    meanWindSpeed:
      readNumberField(record, "meanWindSpeed")
      ?? readNumberField(record, "mean_speed")
      ?? windRose?.meanSpeedLocal
      ?? null,
    aepKwh: readNumberField(record, "aepKwh") ?? readNumberField(record, "aep_kwh"),
    monthlyProductionKwh,
    directionalProductionKwh,
    potentialAepKwh:
      readNumberField(record, "potentialAepKwh")
      ?? readNumberField(record, "potential_aep_kwh")
      ?? readNumberField(record, "obstacleAdjustedPotentialAepKwh")
      ?? readNumberField(record, "obstacle_adjusted_potential_aep_kwh")
      ?? readNumberField(record, "grossAepKwh")
      ?? readNumberField(record, "gross_aep_kwh")
      ?? readNumberField(record, "noObstacleAepKwh")
      ?? readNumberField(record, "no_obstacle_aep_kwh")
      ?? readNumberField(record, "localWindPotentialAep")
      ?? readNumberField(record, "local_wind_potential_aep")
      ?? speedDistribution?.localWindPotentialAep
      ?? null,
    potentialMonthlyProductionKwh,
    potentialDirectionalProductionKwh,
    windRosePercentages,
    potentialWindRosePercentages,
    windResourceScore:
      readNumberField(record, "windResourceScore")
      ?? readNumberField(record, "wind_resource_score")
      ?? readNumberField(record, "localWindPotentialScore")
      ?? readNumberField(record, "local_wind_potential_score"),
    siteUtilizationScore:
      readNumberField(record, "siteUtilizationScore")
      ?? readNumberField(record, "site_utilization_score")
      ?? readNumberField(record, "siteWindUtilizationScore")
      ?? readNumberField(record, "site_wind_utilization_score")
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

function parseMonthlyProductionEntries(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value
    .map((entry, index) => {
      if (!isRecord(entry)) {
        return null;
      }

      const siteKwh = readNumberField(entry, "siteKwh") ?? readNumberField(entry, "site_kwh");
      if (siteKwh === null) {
        return null;
      }

      return {
        order: index,
        month: readNumberField(entry, "month"),
        siteKwh
      };
    })
    .filter((entry): entry is { order: number; month: number | null; siteKwh: number } => entry !== null);

  if (parsed.length === 0) {
    return null;
  }

  const shouldSortByMonth = parsed.every((entry) => typeof entry.month === "number");
  if (shouldSortByMonth) {
    parsed.sort((left, right) => {
      const leftMonth = left.month ?? 0;
      const rightMonth = right.month ?? 0;
      return leftMonth - rightMonth;
    });
  } else {
    parsed.sort((left, right) => left.order - right.order);
  }

  return parsed.map((entry) => entry.siteKwh);
}

function readRecordField(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = payload[key];
  return isRecord(value) ? value : null;
}

function parseWindRosePayload(value: Record<string, unknown> | null): ParsedWindRosePayload | null {
  if (!value) {
    return null;
  }

  const sectors = parseSectorDataArray(value.sectors);

  return {
    siteAepBySector: toNumberArrayOrNull(sectors.map((sector) => sector.siteAepEstimate)),
    localWindPotentialAepBySector: toNumberArrayOrNull(sectors.map((sector) => sector.localWindPotentialAep)),
    frequencyPercentages: toNumberArrayOrNull(sectors.map((sector) => sector.frequency)),
    meanSpeedLocal:
      readNumberField(value, "meanSpeedLocal")
      ?? readNumberField(value, "mean_speed_local")
      ?? readNumberField(value, "meanWindSpeed")
  };
}

function parseSpeedDistributionPayload(value: Record<string, unknown> | null): ParsedSpeedDistributionPayload | null {
  if (!value) {
    return null;
  }

  const energy = readRecordField(value, "energy");
  if (!energy) {
    return null;
  }

  const sectors = parseSectorDataArray(energy.sectors);

  return {
    localWindPotentialAep:
      readNumberField(energy, "localWindPotentialAep")
      ?? readNumberField(energy, "local_wind_potential_aep"),
    siteAepBySector: toNumberArrayOrNull(sectors.map((sector) => sector.siteAepEstimate)),
    localWindPotentialAepBySector: toNumberArrayOrNull(sectors.map((sector) => sector.localWindPotentialAep)),
    frequencyPercentages: toNumberArrayOrNull(sectors.map((sector) => sector.frequency))
  };
}

function parseSectorDataArray(value: unknown): ParsedSectorData[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sectors = value
    .map((entry, order) => {
      if (!isRecord(entry)) {
        return null;
      }

      const index = readNumberField(entry, "index");

      return {
        order,
        sector: {
          index,
          frequency: readNumberField(entry, "frequency"),
          siteAepEstimate:
            readNumberField(entry, "siteAepEstimate")
            ?? readNumberField(entry, "site_aep_estimate")
            ?? readNumberField(entry, "siteKwh")
            ?? readNumberField(entry, "site_kwh"),
          localWindPotentialAep:
            readNumberField(entry, "localWindPotentialAep")
            ?? readNumberField(entry, "local_wind_potential_aep")
            ?? readNumberField(entry, "potentialAep")
            ?? readNumberField(entry, "potential_aep")
        }
      };
    })
    .filter((entry): entry is { order: number; sector: ParsedSectorData } => entry !== null);

  const allHaveIndex = sectors.every((entry) => typeof entry.sector.index === "number");
  sectors.sort((left, right) => {
    if (allHaveIndex) {
      const leftIndex = left.sector.index ?? 0;
      const rightIndex = right.sector.index ?? 0;
      return leftIndex - rightIndex;
    }

    return left.order - right.order;
  });

  return sectors.map((entry) => entry.sector);
}

function toNumberArrayOrNull(values: Array<number | null>): number[] | null {
  if (values.length === 0) {
    return null;
  }

  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length > 0 ? numbers : null;
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

