import type { FeatureCollection, Geometry } from "geojson";

export interface StartAnalysisRequest {
  lat: number;
  lon: number;
  address?: string | null;
}

export interface AnalysisTokenEvent {
  shareToken: string;
  analysisId: number | null;
}

export interface AnalysisProgressEvent {
  step: string;
  percent: number | null;
  message: string | null;
}

export interface AnalysisBuildingsEvent {
  buildingCount: number | null;
  buildingsGeoJson: FeatureCollection<Geometry> | null;
}

export interface AnalysisTreesEvent {
  treeCount: number | null;
  treesGeoJson: FeatureCollection<Geometry> | null;
}

export interface AnalysisObstaclesEvent {
  buildingCount: number | null;
  treeCount: number | null;
  buildingsGeoJson: FeatureCollection<Geometry> | null;
  treesGeoJson: FeatureCollection<Geometry> | null;
}

export interface AnalysisLandcoverBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AnalysisLandcoverPreviewEvent {
  imageBase64: string | null;
  bounds: AnalysisLandcoverBounds | null;
}

export interface AnalysisResultEvent {
  shareToken: string | null;
  meanWindSpeed: number | null;
  aepKwh: number | null;
  monthlyProductionKwh: number[] | null;
  directionalProductionKwh: number[] | null;
  potentialAepKwh: number | null;
  potentialMonthlyProductionKwh: number[] | null;
  potentialDirectionalProductionKwh: number[] | null;
  windRosePercentages: number[] | null;
  potentialWindRosePercentages: number[] | null;
  windResourceScore: number | null;
  siteUtilizationScore: number | null;
}

export interface AnalysisErrorEvent {
  message: string;
}

export type AnalysisStreamEvent =
  | { type: "token"; data: AnalysisTokenEvent }
  | { type: "progress"; data: AnalysisProgressEvent }
  | { type: "buildings"; data: AnalysisBuildingsEvent }
  | { type: "landcover_preview"; data: AnalysisLandcoverPreviewEvent }
  | { type: "trees"; data: AnalysisTreesEvent }
  | { type: "obstacles"; data: AnalysisObstaclesEvent }
  | { type: "result"; data: AnalysisResultEvent }
  | { type: "error"; data: AnalysisErrorEvent };
