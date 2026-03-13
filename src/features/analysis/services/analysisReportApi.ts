import type {
  AnalysisReportResponse,
  AnalysisResultEvent,
  SaveAnalysisEmailResponse
} from "../../../types/analysis";
import { parseAnalysisResultPayload } from "./oneShotAnalysisStream";
import { fetchPublicWizardJson } from "./publicWizardApi";

interface AnalysisEndpointOptions {
  signal?: AbortSignal;
}

export async function fetchAnalysisReport(
  shareToken: string,
  options: AnalysisEndpointOptions = {}
): Promise<AnalysisReportResponse> {
  const normalizedToken = normalizeShareToken(shareToken);
  const payload = await fetchPublicWizardJson<unknown>(`/${encodeURIComponent(normalizedToken)}/report`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    signal: options.signal
  });

  return parseAnalysisReportResponse(payload, normalizedToken);
}

export async function fetchAnalysisResultFromReport(
  shareToken: string,
  options: AnalysisEndpointOptions = {}
): Promise<AnalysisResultEvent> {
  const report = await fetchAnalysisReport(shareToken, options);
  return parseAnalysisResultPayload(report);
}

export async function saveAnalysisEmail(
  shareToken: string,
  email: string,
  options: AnalysisEndpointOptions = {}
): Promise<SaveAnalysisEmailResponse> {
  const normalizedToken = normalizeShareToken(shareToken);
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const payload = await fetchPublicWizardJson<unknown>(`/${encodeURIComponent(normalizedToken)}/save-email`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: normalizedEmail }),
    signal: options.signal
  });

  if (!isRecord(payload)) {
    return { success: true };
  }

  const success = payload.success;
  return {
    success: typeof success === "boolean" ? success : true
  };
}

function parseAnalysisReportResponse(value: unknown, fallbackShareToken: string): AnalysisReportResponse {
  const payload = isRecord(value) ? value : {};

  return {
    shareToken: readString(payload, "shareToken") ?? fallbackShareToken,
    address: readString(payload, "address"),
    centerLat: readNumber(payload, "centerLat") ?? readNumber(payload, "center_lat"),
    centerLon: readNumber(payload, "centerLon") ?? readNumber(payload, "center_lon"),
    hubHeight: readNumber(payload, "hubHeight") ?? readNumber(payload, "hub_height"),
    numSectors: readNumber(payload, "numSectors") ?? readNumber(payload, "num_sectors"),
    status: readString(payload, "status"),
    meanWindSpeed: readNumber(payload, "meanWindSpeed") ?? readNumber(payload, "mean_speed"),
    aepKwh: readNumber(payload, "aepKwh") ?? readNumber(payload, "aep_kwh"),
    localWindPotentialScore:
      readNumber(payload, "localWindPotentialScore")
      ?? readNumber(payload, "local_wind_potential_score"),
    siteWindUtilizationScore:
      readNumber(payload, "siteWindUtilizationScore")
      ?? readNumber(payload, "site_wind_utilization_score"),
    monthlyProduction: parseMonthlyProduction(payload.monthlyProduction),
    buildingCount: readNumber(payload, "buildingCount") ?? readNumber(payload, "building_count"),
    treeCount: readNumber(payload, "treeCount") ?? readNumber(payload, "tree_count"),
    createdAt: readString(payload, "createdAt") ?? readString(payload, "created_at"),
    windRose: payload.windRose ?? payload.wind_rose ?? null,
    speedDistribution: payload.speedDistribution ?? payload.speed_distribution ?? null
  };
}

function parseMonthlyProduction(value: unknown): AnalysisReportResponse["monthlyProduction"] {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return {
        month: readNumber(entry, "month"),
        label: readString(entry, "label"),
        siteKwh: readNumber(entry, "siteKwh") ?? readNumber(entry, "site_kwh")
      };
    })
    .filter((entry): entry is NonNullable<AnalysisReportResponse["monthlyProduction"]>[number] => entry !== null);

  return parsed.length > 0 ? parsed : null;
}

function normalizeShareToken(shareToken: string): string {
  const normalized = shareToken.trim();

  if (!normalized) {
    throw new Error("Share token is required.");
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
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
