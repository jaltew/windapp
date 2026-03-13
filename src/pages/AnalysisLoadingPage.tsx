import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import resultsTurbineImage from "../../share/26013001 - front copy - with outline copy - cropped.png";
import mailIcon from "../features/analysis/assets/mail-icon.svg";
import saveIcon from "../features/analysis/assets/save-icon.svg";
import { AnalysisLiveMap } from "../features/analysis/components/AnalysisLiveMap";
import { MonthlyProductionChart } from "../features/analysis/components/MonthlyProductionChart";
import { fetchAnalysisResultFromReport } from "../features/analysis/services/analysisReportApi";
import { streamOneShotAnalysis } from "../features/analysis/services/oneShotAnalysisStream";
import { formatLocationLabel } from "../features/location/lib/locationLabel";
import type {
  AnalysisLandcoverPreviewEvent,
  AnalysisResultEvent,
  StartAnalysisRequest
} from "../types/analysis";
import type { SelectedLocation } from "../types/location";
import type { MapViewState } from "../types/map";

interface AnalysisLoadingPageProps {
  location: SelectedLocation;
  initialMapView?: MapViewState | null;
  onBackToLocation: () => void;
  onGoToStepTwo?: () => void;
  onGoToStepThree?: () => void;
  onAnalysisComplete?: (payload: AnalysisCompletionPayload) => void;
  initialCompletedAnalysis?: AnalysisCompletionPayload | null;
  autoStart?: boolean;
  onMapReady?: () => void;
  currentStep?: "loading" | "analysisReview" | "results";
  resultsChartFallback?: {
    yearlyProductionKwh: number | null;
    monthlyProductionKwh: number[] | null;
  } | null;
}

export interface AnalysisCompletionPayload {
  location: SelectedLocation;
  mapView: MapViewState | null;
  buildingsGeoJson: FeatureCollection<Geometry> | null;
  treesGeoJson: FeatureCollection<Geometry> | null;
  landcoverPreview: AnalysisLandcoverPreviewEvent | null;
  result: AnalysisResultEvent | null;
}

const PROGRESS_COPY: Record<string, string> = {
  terrain: "Scanning terrain around your selected point.",
  buildings: "Detecting nearby buildings.",
  landcover: "Mapping surrounding land cover.",
  trees: "Detecting nearby tree canopy.",
  obstacles_done: "Analysis with wind and terrain modeling.",
  roughness: "Estimating wind roughness by direction.",
  terrain_speedup: "Applying hill and terrain effects.",
  wind_data: "Loading regional wind data.",
  speed_distribution: "Calculating speed distribution and annual energy.",
  financials: "Calculating financial and climate estimates.",
  complete: "Analysis complete."
};

const FALLBACK_LOADING_COPY = "Running wind analysis for your selected location.";
const STEP_TWO_TO_THREE_SEGMENT_WIDTH_PCT = 30;
const STEP_TWO_TO_THREE_PROGRESS_OFFSET_PCT = 10;
const PROGRESS_ANIMATION_MIN_MS = 320;
const PROGRESS_ANIMATION_MAX_MS = 1_000;
const QUALITY_LEVEL_LABELS = ["Excellent", "Great", "Good", "Fair", "Poor", "Very poor"] as const;
const QUALITY_SCALE_HEIGHT_PX = 327;
const QUALITY_SCALE_WIDTH_PX = 128;
const QUALITY_SCALE_BAR_WIDTH_PX = 29;
const QUALITY_SCALE_BAR_RIGHT_OFFSET_PX = 20;
const QUALITY_MARKER_SIZE_PX = 10;
const QUALITY_MARKER_OFFSET_FROM_BAR_END_PX = 6;
const QUALITY_MARKER_MIN_TOP_PX = 20;
const QUALITY_MARKER_MAX_TOP_PX = QUALITY_SCALE_HEIGHT_PX - 20;
const QUALITY_SCORE_MIN = 0;
const QUALITY_SCORE_MAX = 100;
const QUALITY_CALLOUT_HEIGHT_PX = 66;
const QUALITY_CALLOUT_VERTICAL_GAP_PX = 10;
const QUALITY_CALLOUT_DOWNWARD_EXTRA_GAP_PX = 6;
const QUALITY_SCALE_TO_CALLOUT_GAP_PX = 24;
const QUALITY_CONNECTOR_TEXT_OFFSET_PX = 10;
const QUALITY_MARKER_LEFT_PX =
  QUALITY_SCALE_WIDTH_PX - QUALITY_SCALE_BAR_RIGHT_OFFSET_PX + QUALITY_MARKER_OFFSET_FROM_BAR_END_PX;
const QUALITY_MARKER_RIGHT_PX = QUALITY_MARKER_LEFT_PX + QUALITY_MARKER_SIZE_PX;
const QUALITY_CONNECTOR_END_X_PX =
  QUALITY_SCALE_WIDTH_PX + QUALITY_SCALE_TO_CALLOUT_GAP_PX - QUALITY_CONNECTOR_TEXT_OFFSET_PX;
const QUALITY_CONNECTOR_BEND_RADIUS_PX = 2;
const QUALITY_TIER_DEFINITIONS = [
  {
    label: "Excellent",
    localWindPotential: "The local area has outstanding wind conditions for wind energy production.",
    siteWindUtilization: "Wind reaches your turbine from the main wind directions with little to no obstruction."
  },
  {
    label: "Great",
    localWindPotential: "The local area has strong wind conditions and very good production potential.",
    siteWindUtilization: "Nearby obstacles have only a small impact on wind from the main wind directions."
  },
  {
    label: "Good",
    localWindPotential: "Wind conditions in the local area are good and suitable for steady production.",
    siteWindUtilization: "Some nearby obstacles slightly reduce wind from certain directions."
  },
  {
    label: "Fair",
    localWindPotential: "Wind conditions are moderate and production potential is limited.",
    siteWindUtilization: "Nearby obstacles noticeably affect wind from some important wind directions."
  },
  {
    label: "Poor",
    localWindPotential: "Wind conditions in the local area are weak and limit production potential.",
    siteWindUtilization: "Major nearby obstacles block key wind directions and reduce production."
  },
  {
    label: "Very poor",
    localWindPotential: "Wind conditions are very weak and generally unsuitable for wind energy production.",
    siteWindUtilization: "The turbine is heavily sheltered by nearby obstacles, especially in main wind directions."
  }
] as const;
const QUALITY_CALLOUTS = [
  {
    id: "localWindPotential",
    title: "Local Wind Potential",
    infoText: "General wind conditions in the local area."
  },
  {
    id: "siteWindUtilization",
    title: "Site Wind Utilization",
    infoText: "How nearby obstacles affect the wind at your turbine."
  }
] as const;
type QualityCalloutId = (typeof QUALITY_CALLOUTS)[number]["id"];

export function AnalysisLoadingPage({
  location,
  initialMapView = null,
  onBackToLocation,
  onGoToStepTwo,
  onGoToStepThree,
  onAnalysisComplete,
  initialCompletedAnalysis = null,
  autoStart = true,
  onMapReady,
  currentStep = "loading",
  resultsChartFallback = null
}: AnalysisLoadingPageProps) {
  const isResultsCompleted = currentStep === "analysisReview" || currentStep === "results";
  const isStepTwoActive = currentStep === "loading" || currentStep === "analysisReview";
  const isStepThreeActive = currentStep === "results";

  const [progressPercent, setProgressPercent] = useState(3);
  const [displayProgressPercent, setDisplayProgressPercent] = useState(3);
  const [progressText, setProgressText] = useState(FALLBACK_LOADING_COPY);
  const [buildingsGeoJson, setBuildingsGeoJson] = useState<FeatureCollection<Geometry> | null>(null);
  const [treesGeoJson, setTreesGeoJson] = useState<FeatureCollection<Geometry> | null>(null);
  const [landcoverPreview, setLandcoverPreview] = useState<AnalysisLandcoverPreviewEvent | null>(null);
  const [result, setResult] = useState<AnalysisResultEvent | null>(null);
  const [activeQualityCalloutInfoId, setActiveQualityCalloutInfoId] = useState<QualityCalloutId | null>(null);
  const [hoveredQualityCalloutInfoId, setHoveredQualityCalloutInfoId] = useState<QualityCalloutId | null>(null);
  const [isTouchLikeCalloutInput, setIsTouchLikeCalloutInput] = useState(false);
  const stepTwoToThreeProgressWidth = `${mapProgressToStepLinkWidth(displayProgressPercent).toFixed(2)}%`;
  const latestMapViewRef = useRef<MapViewState | null>(initialMapView);
  const latestBuildingsGeoJsonRef = useRef<FeatureCollection<Geometry> | null>(null);
  const latestTreesGeoJsonRef = useRef<FeatureCollection<Geometry> | null>(null);
  const latestLandcoverPreviewRef = useRef<AnalysisLandcoverPreviewEvent | null>(null);
  const latestResultRef = useRef<AnalysisResultEvent | null>(null);
  const completionNotifiedRef = useRef(false);
  const progressAnimationFrameRef = useRef<number | null>(null);
  const displayedProgressRef = useRef(3);

  const analysisRequest = useMemo<StartAnalysisRequest>(() => ({
    lat: location.latitude,
    lon: location.longitude,
    address: toAnalysisAddress(location)
  }), [location]);
  const fallbackYearlyProductionKwh = resolveApiYearlyProduction(resultsChartFallback?.yearlyProductionKwh ?? null);
  const fallbackMonthlyProductionValues = useMemo(
    () => resolveApiMonthlyProduction(resultsChartFallback?.monthlyProductionKwh ?? null),
    [resultsChartFallback?.monthlyProductionKwh]
  );
  const yearlyProductionKwh = resolveApiYearlyProduction(result?.aepKwh) ?? fallbackYearlyProductionKwh;
  const monthlyProductionValues = useMemo(
    () => resolveApiMonthlyProduction(result?.monthlyProductionKwh ?? null) ?? fallbackMonthlyProductionValues,
    [fallbackMonthlyProductionValues, result?.monthlyProductionKwh]
  );
  const apiWindRoseActualValues = useMemo(() => {
    if (result?.directionalProductionKwh && result.directionalProductionKwh.length > 0) {
      return sanitizePositiveValues(result.directionalProductionKwh);
    }

    if (result?.windRosePercentages && result.windRosePercentages.length > 0) {
      return sanitizePositiveValues(result.windRosePercentages);
    }

    return null;
  }, [result?.directionalProductionKwh, result?.windRosePercentages]);
  const apiWindRosePotentialValues = useMemo(() => {
    if (result?.potentialDirectionalProductionKwh && result.potentialDirectionalProductionKwh.length > 0) {
      return sanitizePositiveValues(result.potentialDirectionalProductionKwh);
    }

    if (result?.potentialWindRosePercentages && result.potentialWindRosePercentages.length > 0) {
      return sanitizePositiveValues(result.potentialWindRosePercentages);
    }

    return null;
  }, [result?.potentialDirectionalProductionKwh, result?.potentialWindRosePercentages]);
  const mapWindRoseActualValues = useMemo(() => {
    if (apiWindRoseActualValues && apiWindRoseActualValues.length > 0) {
      return apiWindRoseActualValues;
    }

    if (yearlyProductionKwh !== null && yearlyProductionKwh > 0) {
      return normalizeToShares(DEFAULT_DIRECTION_STRENGTH).map((share) => share * yearlyProductionKwh);
    }

    return DEFAULT_DIRECTION_STRENGTH;
  }, [apiWindRoseActualValues, yearlyProductionKwh]);
  const mapWindRosePotentialValues = useMemo(() => {
    if (apiWindRosePotentialValues && apiWindRosePotentialValues.length > 0) {
      return apiWindRosePotentialValues;
    }

    if (typeof result?.potentialAepKwh === "number" && Number.isFinite(result.potentialAepKwh) && result.potentialAepKwh > 0) {
      const potentialAepKwh = result.potentialAepKwh;
      return normalizeToShares(DEFAULT_DIRECTION_STRENGTH).map((share) => share * potentialAepKwh);
    }

    return mapWindRoseActualValues.map((value) => value * 1.25);
  }, [apiWindRosePotentialValues, mapWindRoseActualValues, result?.potentialAepKwh]);
  const qualityMarkerPositions = useMemo(
    () => resolveQualityMarkerPositionsFromScores(result?.windResourceScore, result?.siteUtilizationScore),
    [result?.windResourceScore, result?.siteUtilizationScore]
  );
  const qualityCallouts = useMemo(
    () => {
      const positionedCallouts = resolveQualityCalloutPositions(qualityMarkerPositions);

      return positionedCallouts.map(({ index, topPx, markerTopPx, isMoved }) => {
        const callout = QUALITY_CALLOUTS[index];
        const qualityTierIndex = markerTopPxToClosestQualityTierIndex(markerTopPx);
        const tier = QUALITY_TIER_DEFINITIONS[qualityTierIndex];

        return {
          ...callout,
          description: tier[callout.id],
          topPx,
          markerTopPx,
          calloutCenterTopPx: topPx + QUALITY_CALLOUT_HEIGHT_PX / 2,
          isMoved
        };
      });
    },
    [qualityMarkerPositions]
  );

  useEffect(() => {
    if (autoStart || !initialCompletedAnalysis) {
      return;
    }

    setProgressPercent(100);
    setDisplayProgressPercent(100);
    displayedProgressRef.current = 100;
    setProgressText(PROGRESS_COPY.complete);
    setBuildingsGeoJson(initialCompletedAnalysis.buildingsGeoJson);
    setTreesGeoJson(initialCompletedAnalysis.treesGeoJson);
    setLandcoverPreview(initialCompletedAnalysis.landcoverPreview);
    setResult(initialCompletedAnalysis.result);
    latestBuildingsGeoJsonRef.current = initialCompletedAnalysis.buildingsGeoJson;
    latestTreesGeoJsonRef.current = initialCompletedAnalysis.treesGeoJson;
    latestLandcoverPreviewRef.current = initialCompletedAnalysis.landcoverPreview;
    latestResultRef.current = initialCompletedAnalysis.result;
    latestMapViewRef.current = initialCompletedAnalysis.mapView;
  }, [autoStart, initialCompletedAnalysis]);

  useEffect(() => {
    if (!autoStart) {
      return;
    }

    const abortController = new AbortController();
    let isActive = true;

    if (progressAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(progressAnimationFrameRef.current);
      progressAnimationFrameRef.current = null;
    }

    setProgressPercent(3);
    setDisplayProgressPercent(3);
    displayedProgressRef.current = 3;
    setProgressText(FALLBACK_LOADING_COPY);
    setBuildingsGeoJson(null);
    setTreesGeoJson(null);
    setLandcoverPreview(null);
    setResult(null);
    latestBuildingsGeoJsonRef.current = null;
    latestTreesGeoJsonRef.current = null;
    latestLandcoverPreviewRef.current = null;
    latestResultRef.current = null;
    completionNotifiedRef.current = false;

    const publishAnalysisSnapshot = (
      nextBuildingsGeoJson: FeatureCollection<Geometry> | null,
      nextTreesGeoJson: FeatureCollection<Geometry> | null,
      nextLandcoverPreview: AnalysisLandcoverPreviewEvent | null,
      nextResult: AnalysisResultEvent | null
    ) => {
      onAnalysisComplete?.({
        location,
        mapView: latestMapViewRef.current,
        buildingsGeoJson: nextBuildingsGeoJson ?? latestBuildingsGeoJsonRef.current,
        treesGeoJson: nextTreesGeoJson ?? latestTreesGeoJsonRef.current,
        landcoverPreview: nextLandcoverPreview ?? latestLandcoverPreviewRef.current,
        result: nextResult ?? latestResultRef.current
      });
    };

    const notifyAnalysisComplete = (
      nextBuildingsGeoJson: FeatureCollection<Geometry> | null,
      nextTreesGeoJson: FeatureCollection<Geometry> | null,
      nextLandcoverPreview: AnalysisLandcoverPreviewEvent | null,
      nextResult: AnalysisResultEvent | null
    ) => {
      if (completionNotifiedRef.current) {
        return;
      }

      completionNotifiedRef.current = true;
      publishAnalysisSnapshot(nextBuildingsGeoJson, nextTreesGeoJson, nextLandcoverPreview, nextResult);
    };

    const publishAnalysisUpdate = (
      nextBuildingsGeoJson: FeatureCollection<Geometry> | null,
      nextTreesGeoJson: FeatureCollection<Geometry> | null,
      nextLandcoverPreview: AnalysisLandcoverPreviewEvent | null,
      nextResult: AnalysisResultEvent | null
    ) => {
      publishAnalysisSnapshot(nextBuildingsGeoJson, nextTreesGeoJson, nextLandcoverPreview, nextResult);
    };

    void streamOneShotAnalysis(analysisRequest, {
      signal: abortController.signal,
      onEvent: (event) => {
        if (!isActive) {
          return;
        }

        switch (event.type) {
          case "token":
            break;
          case "progress": {
            if (typeof event.data.percent === "number") {
              const clampedPercent = Math.max(0, Math.min(100, Math.round(event.data.percent)));
              setProgressPercent(clampedPercent);
            }

            const mappedCopy = PROGRESS_COPY[event.data.step];
            const nextText = mappedCopy ?? event.data.message ?? FALLBACK_LOADING_COPY;
            setProgressText(nextText);
            break;
          }
          case "buildings":
            if (event.data.buildingsGeoJson) {
              latestBuildingsGeoJsonRef.current = event.data.buildingsGeoJson;
              setBuildingsGeoJson(event.data.buildingsGeoJson);
            }
            break;
          case "landcover_preview":
            if (event.data.imageBase64 && event.data.bounds) {
              latestLandcoverPreviewRef.current = event.data;
              setLandcoverPreview(event.data);
            }
            break;
          case "trees":
            if (event.data.treesGeoJson) {
              latestTreesGeoJsonRef.current = event.data.treesGeoJson;
              setTreesGeoJson(event.data.treesGeoJson);
            }
            break;
          case "obstacles":
            if (event.data.buildingsGeoJson) {
              latestBuildingsGeoJsonRef.current = event.data.buildingsGeoJson;
              setBuildingsGeoJson(event.data.buildingsGeoJson);
            }
            if (event.data.treesGeoJson) {
              latestTreesGeoJsonRef.current = event.data.treesGeoJson;
              setTreesGeoJson(event.data.treesGeoJson);
            }
            break;
          case "result": {
            setProgressPercent(100);
            setProgressText(PROGRESS_COPY.complete);

            const streamedResult = event.data;
            latestResultRef.current = streamedResult;
            setResult(streamedResult);
            notifyAnalysisComplete(null, null, null, streamedResult);

            const shareToken = streamedResult.shareToken?.trim();
            if (!shareToken) {
              break;
            }

            void fetchAnalysisResultFromReport(shareToken, { signal: abortController.signal })
              .then((reportResult) => {
                if (!isActive || abortController.signal.aborted) {
                  return;
                }

                const mergedResult = mergeAnalysisResults(latestResultRef.current, reportResult);
                latestResultRef.current = mergedResult;
                setResult(mergedResult);
                publishAnalysisUpdate(null, null, null, mergedResult);
              })
              .catch(() => {
                // Keep streamed result if report endpoint is unavailable.
              });

            break;
          }
          case "error":
            setProgressText(event.data.message || "Analysis failed to complete.");
            break;
        }
      }
    })
      .then(() => {
        if (!isActive) {
          return;
        }

        setProgressPercent(100);
        setProgressText(PROGRESS_COPY.complete);
      })
      .catch((error) => {
        if (!isActive || abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Analysis could not be completed.";
        setProgressText(message);
      });

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [analysisRequest, autoStart, location, onAnalysisComplete]);

  useEffect(() => {
    if (progressAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(progressAnimationFrameRef.current);
      progressAnimationFrameRef.current = null;
    }

    const from = displayedProgressRef.current;
    const to = progressPercent;

    if (Math.abs(to - from) < 0.1) {
      displayedProgressRef.current = to;
      setDisplayProgressPercent(to);
      return;
    }

    const durationMs = Math.min(
      PROGRESS_ANIMATION_MAX_MS,
      Math.max(PROGRESS_ANIMATION_MIN_MS, Math.abs(to - from) * 22)
    );
    const startedAt = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextValue = from + (to - from) * eased;

      displayedProgressRef.current = nextValue;
      setDisplayProgressPercent(nextValue);

      if (t < 1) {
        progressAnimationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        progressAnimationFrameRef.current = null;
      }
    };

    progressAnimationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (progressAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(progressAnimationFrameRef.current);
        progressAnimationFrameRef.current = null;
      }
    };
  }, [progressPercent]);

  useEffect(() => {
    return () => {
      if (progressAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(progressAnimationFrameRef.current);
        progressAnimationFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (currentStep !== "results") {
      setActiveQualityCalloutInfoId(null);
      setHoveredQualityCalloutInfoId(null);
    }
  }, [currentStep]);

  return (
    <main className="min-h-[100dvh] sm:min-h-screen">
      <div className="mx-auto max-w-6xl pb-0 pt-3 sm:px-8 sm:pb-10 lg:pb-12 lg:pt-4">
        <section className="mx-auto mb-3 max-w-[460px] px-3 sm:mb-4 sm:px-0">
          <div className="relative">
            <div className="pointer-events-none absolute left-[20%] right-[20%] top-[11px] h-[2px] bg-[#EAEAEA]" />
            <div className="pointer-events-none absolute left-[20%] right-1/2 top-[11px] h-[2px] bg-[#5A5A5A]" />
            {isResultsCompleted ? (
              <div className="pointer-events-none absolute left-1/2 right-[20%] top-[11px] h-[2px] bg-[#5A5A5A]" />
            ) : currentStep === "loading" ? (
              <div
                className="pointer-events-none absolute left-1/2 top-[11px] h-[2px] bg-[#5A5A5A]"
                style={{ width: stepTwoToThreeProgressWidth }}
              />
            ) : null}
            <div className="relative grid grid-cols-3 items-start">
              <button
                type="button"
                className="group flex flex-col items-center rounded-[2px] bg-transparent p-0 text-left transition"
                onClick={onBackToLocation}
                aria-label="Go back to step 1: Location"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#5A5A5A] bg-white text-[13px] font-bold leading-none text-[#5A5A5A] transition-all duration-150 group-hover:-translate-y-[1px] group-hover:border-[#4E4E4E] group-hover:text-[#4E4E4E] group-hover:shadow-[0_1px_4px_rgba(0,0,0,0.16)]">
                  1
                </div>
                <p className="mt-1 text-[12px] font-medium leading-none text-[#6B6B6B] transition-colors duration-150 group-hover:text-[#5F5F5F]">Location</p>
              </button>

              <button
                type="button"
                className="group flex flex-col items-center rounded-[2px] bg-transparent p-0 text-left transition disabled:pointer-events-none disabled:cursor-default disabled:opacity-100"
                onClick={onGoToStepTwo}
                disabled={currentStep !== "results"}
                aria-label="Go to step 2: Analyze location"
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[13px] font-bold leading-none transition-all duration-150 group-hover:-translate-y-[1px] group-hover:border-[#4E4E4E] group-hover:text-[#4E4E4E] group-hover:shadow-[0_1px_4px_rgba(0,0,0,0.16)] ${
                    isStepTwoActive
                      ? "border-[#4A4A4A] text-[#4A4A4A]"
                      : "border-[#5A5A5A] text-[#5A5A5A]"
                  }`}
                  style={isStepTwoActive ? { borderWidth: "2.3px" } : undefined}
                >
                  2
                </div>
                <p className={`mt-1 text-[12px] leading-none transition-colors duration-150 group-hover:text-[#5F5F5F] ${
                  isStepTwoActive
                    ? "font-bold text-[#5A5A5A]"
                    : isResultsCompleted
                      ? "font-medium text-[#6B6B6B]"
                      : "font-medium text-[#C3C3C3]"
                }`}>
                  Analyze location
                </p>
              </button>

              <button
                type="button"
                className="group flex flex-col items-center rounded-[2px] bg-transparent p-0 text-left transition disabled:pointer-events-none disabled:cursor-default disabled:opacity-100"
                onClick={onGoToStepThree}
                disabled={currentStep !== "analysisReview"}
                aria-label="Go to step 3: Results"
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[13px] font-bold leading-none transition-all duration-150 group-hover:-translate-y-[1px] group-hover:border-[#4E4E4E] group-hover:text-[#4E4E4E] group-hover:shadow-[0_1px_4px_rgba(0,0,0,0.16)] ${
                    isStepThreeActive
                      ? "border-[#4A4A4A] text-[#4A4A4A]"
                      : isResultsCompleted
                        ? "border-[#5A5A5A] text-[#5A5A5A]"
                        : "border-[#EAEAEA] text-[#EAEAEA]"
                  }`}
                  style={isStepThreeActive ? { borderWidth: "2.3px" } : undefined}
                >
                  3
                </div>
                <p className={`mt-1 text-[12px] leading-none transition-colors duration-150 group-hover:text-[#5F5F5F] ${
                  isStepThreeActive
                    ? "font-bold text-[#5A5A5A]"
                    : isResultsCompleted
                      ? "font-medium text-[#6B6B6B]"
                      : "font-medium text-[#C3C3C3]"
                }`}>
                  Results
                </p>
              </button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-none border-y border-x-0 border-[#CDCDCD] bg-white p-0 shadow-none sm:mx-auto sm:max-w-[700px] sm:rounded-[2px] sm:border sm:border-[#CDCDCD] sm:p-4 sm:shadow-[0_1px_9px_4px_rgba(181,181,181,0.1804)]">
          <AnalysisLiveMap
            selectedLocation={location}
            initialViewState={initialMapView}
            buildingsGeoJson={buildingsGeoJson}
            treesGeoJson={treesGeoJson}
            landcoverPreview={landcoverPreview}
            windRoseActualValues={currentStep === "results" ? mapWindRoseActualValues : null}
            windRosePotentialValues={currentStep === "results" ? mapWindRosePotentialValues : null}
            phase={currentStep === "results" ? "results" : currentStep === "analysisReview" ? "analysisReview" : "loading"}
            onMapReady={onMapReady}
            onViewStateChange={(viewState) => {
              latestMapViewRef.current = viewState;
            }}
          />
          {currentStep === "results" ? (
            <>
              <div className="mt-3 flex flex-wrap justify-end gap-1 px-3 sm:gap-2 sm:px-0">
                <LegendTooltipItem
                  label="Local Wind Potential"
                  infoText="Indicates the strength of the wind coming from each direction in the local area. Larger sections mean more wind energy is typically available from that direction."
                  swatchVariant="solid"
                  tooltipAlign="left"
                />
                <LegendTooltipItem
                  label="Site Utilization Score"
                  infoText="Shows how nearby obstacles affect the wind reaching the turbine from each direction. Green indicates good wind exposure, while red indicate wind reduced by buildings, trees, or terrain."
                  swatchVariant="gradient"
                />
              </div>
              <div className="mt-3 border-t border-[#CDCDCD] sm:-mx-4" aria-hidden />
            </>
          ) : null}

          {currentStep !== "results" ? (
            <div className="relative mx-3 mb-4 mt-3 h-14 overflow-hidden rounded-[2px] border border-[#CDCDCD] bg-white sm:mx-0 sm:mb-0 sm:mt-4">
              <div
                className="absolute inset-y-0 left-0 bg-[#EAEAEA] transition-[width] duration-500"
                style={{ width: `${displayProgressPercent}%` }}
                aria-hidden
              />
              <div className="relative z-10 flex h-full items-center justify-between gap-3 px-4">
                <p className="truncate text-sm font-semibold text-[#525252]">{progressText}</p>
                <p className="text-sm font-semibold text-[#525252]">{Math.round(displayProgressPercent)}%</p>
              </div>
            </div>
          ) : result ? (
            <div className="mt-3">
              <section className="relative h-[534px] overflow-hidden sm:-mx-4">
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[389px]"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(248,248,248,1) 0%, rgba(248,248,248,1) 63%, rgba(248,248,248,0) 100%)"
                  }}
                  aria-hidden
                />
                <div className="relative z-10 sm:mx-4">
                  <div className="pl-3 pr-3 pt-7 sm:pr-7">
                    <header className="ml-1 sm:ml-4">
                      <p className="text-[13px] font-bold text-[#474747]">WM 25 kW</p>
                      <h2 className="-ml-[3px] mt-1.5 text-[40px] font-light leading-none text-[#474747]">Results</h2>
                    </header>
                    <div className="relative mt-9 flex w-[min(352px,calc(100%-8px))] items-start mx-auto sm:mx-0 sm:ml-4 sm:w-[352px]" style={{ gap: `${QUALITY_SCALE_TO_CALLOUT_GAP_PX}px` }}>
                      <svg
                        className="pointer-events-none absolute left-0 top-0 z-10"
                        style={{ width: `${QUALITY_CONNECTOR_END_X_PX}px`, height: `${QUALITY_SCALE_HEIGHT_PX}px` }}
                        aria-hidden
                      >
                        {qualityCallouts.map((callout) => (
                          <path
                            key={`${callout.title}-connector`}
                            d={describeQualityConnectorPath({
                              startX: QUALITY_MARKER_RIGHT_PX,
                              startY: callout.markerTopPx,
                              endX: QUALITY_CONNECTOR_END_X_PX,
                              endY: callout.calloutCenterTopPx,
                              useRoutedPath: callout.isMoved,
                              bendRadiusPx: QUALITY_CONNECTOR_BEND_RADIUS_PX
                            })}
                            fill="none"
                            stroke="#474747"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                      </svg>
                      <div
                        className="relative shrink-0" style={{ width: `${QUALITY_SCALE_WIDTH_PX}px`, height: `${QUALITY_SCALE_HEIGHT_PX}px` }}
                      >
                        {QUALITY_LEVEL_LABELS.map((label, index) => {
                          const topPx = 20 + (index * (QUALITY_SCALE_HEIGHT_PX - 40)) / (QUALITY_LEVEL_LABELS.length - 1);
                          return (
                            <div
                              key={label}
                              className="absolute inset-x-0 -translate-y-1/2"
                              style={{ top: `${topPx}px` }}
                            >
                              <div className="flex items-center">
                                <span className="text-[12px] font-semibold leading-none text-[#474747]">{label}</span>
                                <span className="ml-2 h-0 flex-1 border-t-[1.5px] border-dashed border-[#D8D8D8]" aria-hidden />
                              </div>
                            </div>
                          );
                        })}
                        <div
                          className="absolute top-0 z-10 rounded-[2px]"
                          style={{
                            right: `${QUALITY_SCALE_BAR_RIGHT_OFFSET_PX}px`,
                            width: `${QUALITY_SCALE_BAR_WIDTH_PX}px`,
                            height: `${QUALITY_SCALE_HEIGHT_PX}px`,
                            background: "linear-gradient(to top, #F87370 0%, #F87370 15%, #2DC55B 85%, #2DC55B 100%)"
                          }}
                          aria-hidden
                        />
                        {qualityMarkerPositions.map((topPx, index) => (
                          <span
                            key={`quality-marker-${index}`}
                            className="absolute z-20 rounded-full"
                            style={{
                              top: `${topPx}px`,
                              left: `${QUALITY_MARKER_LEFT_PX}px`,
                              width: `${QUALITY_MARKER_SIZE_PX}px`,
                              height: `${QUALITY_MARKER_SIZE_PX}px`,
                              transform: "translateY(-50%)",
                              backgroundColor: qualityScaleColorAt(topPx, QUALITY_SCALE_HEIGHT_PX),
                              boxShadow: "inset 0 0 0 1.5px #474747"
                            }}
                            aria-hidden
                          />
                        ))}
                      </div>
                      <div
                        className="relative min-w-0 flex-1 sm:flex-none sm:w-[200px]" style={{ height: `${QUALITY_SCALE_HEIGHT_PX}px` }}
                      >
                        {qualityCallouts.map((callout) => (
                          <section
                            key={callout.title}
                            className="absolute left-0 flex flex-col justify-center text-[#474747]"
                            style={{
                              top: `${callout.topPx}px`,
                              width: "100%",
                              height: `${QUALITY_CALLOUT_HEIGHT_PX}px`
                            }}
                          >
                            <button
                              type="button"
                              className="relative -mx-1 w-[calc(100%+0.5rem)] rounded-[2px] px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#9A9A9A]"
                              onPointerDown={(event) => {
                                const isTouchLike = event.pointerType !== "mouse";
                                setIsTouchLikeCalloutInput(isTouchLike);
                                if (isTouchLike) {
                                  setHoveredQualityCalloutInfoId(null);
                                }
                              }}
                              onMouseEnter={() => {
                                if (!isTouchLikeCalloutInput) {
                                  setHoveredQualityCalloutInfoId(callout.id);
                                }
                              }}
                              onMouseLeave={() => {
                                if (!isTouchLikeCalloutInput) {
                                  setHoveredQualityCalloutInfoId((currentId) => (currentId === callout.id ? null : currentId));
                                }
                              }}
                              onClick={() => {
                                setActiveQualityCalloutInfoId((currentId) => (currentId === callout.id ? null : callout.id));
                              }}
                              aria-label={`${callout.title}. More info`}
                              aria-expanded={
                                activeQualityCalloutInfoId === callout.id
                                || (!isTouchLikeCalloutInput && hoveredQualityCalloutInfoId === callout.id)
                              }
                            >
                              <p className="flex flex-wrap items-center text-[12px] font-bold leading-tight">
                                <span>{callout.title}</span>
                                <LegendInfoHint
                                  text={callout.infoText}
                                  isOpen={
                                    activeQualityCalloutInfoId === callout.id
                                    || (!isTouchLikeCalloutInput && hoveredQualityCalloutInfoId === callout.id)
                                  }
                                />
                              </p>
                            </button>
                            <p className="mt-0.5 px-0.5 text-[12px] leading-[1.2em]">{callout.description}</p>
                          </section>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <img
                  src={resultsTurbineImage}
                  alt="WM 25 kW results illustration"
                  className="absolute -bottom-px right-1 hidden h-[534px] w-auto max-w-none object-contain sm:block"
                />
              </section>
              <div className="border-t border-[#CDCDCD] sm:-mx-4" aria-hidden />

              <MonthlyProductionChart values={monthlyProductionValues} yearlyProductionKwh={yearlyProductionKwh} />
              <div className="border-t border-[#CDCDCD] sm:-mx-4" aria-hidden />
              <section className="bg-[#F8F8F8] px-3 py-6 sm:-mx-4 sm:-mb-4 sm:px-7" aria-label="Section 3 actions">
                <div className="flex min-h-[248px] items-center justify-center">
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                    <button
                      type="button"
                      className="group flex w-[160px] flex-col items-center rounded-[2px] text-[#4D4D4D] transition-colors hover:text-[#2F2F2F]"
                      aria-label="Save result"
                    >
                      <span className="flex h-[132px] w-[132px] items-center justify-center rounded-[2px] border border-[#D5D5D5] bg-white transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-[#BEBEBE] group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
                        <img src={saveIcon} alt="" aria-hidden className="h-6 w-6" />
                      </span>
                      <span className="mt-3 text-[16px] font-extralight tracking-[0.01em]">Save result</span>
                    </button>
                    <button
                      type="button"
                      className="group flex w-[160px] flex-col items-center rounded-[2px] text-[#4D4D4D] transition-colors hover:text-[#2F2F2F]"
                      aria-label="Get expert review"
                    >
                      <span className="flex h-[132px] w-[132px] items-center justify-center rounded-[2px] border border-[#D5D5D5] bg-white transition-all duration-150 group-hover:-translate-y-0.5 group-hover:border-[#BEBEBE] group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
                        <img src={mailIcon} alt="" aria-hidden className="h-6 w-6" />
                      </span>
                      <span className="mt-3 text-[16px] font-extralight tracking-[0.01em]">Get expert review</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="mt-4 rounded-[2px] border border-[#CDCDCD] bg-[#FBFBFB] px-4 py-5">
              <p className="text-sm font-medium text-[#4F4F4F]">
                Results are not available yet. Run analysis again to view wind profile and production charts.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function mergeAnalysisResults(
  currentResult: AnalysisResultEvent | null,
  reportResult: AnalysisResultEvent
): AnalysisResultEvent {
  if (!currentResult) {
    return reportResult;
  }

  return {
    shareToken: reportResult.shareToken ?? currentResult.shareToken,
    meanWindSpeed: reportResult.meanWindSpeed ?? currentResult.meanWindSpeed,
    aepKwh: reportResult.aepKwh ?? currentResult.aepKwh,
    monthlyProductionKwh: reportResult.monthlyProductionKwh ?? currentResult.monthlyProductionKwh,
    directionalProductionKwh: reportResult.directionalProductionKwh ?? currentResult.directionalProductionKwh,
    potentialAepKwh: reportResult.potentialAepKwh ?? currentResult.potentialAepKwh,
    potentialMonthlyProductionKwh:
      reportResult.potentialMonthlyProductionKwh ?? currentResult.potentialMonthlyProductionKwh,
    potentialDirectionalProductionKwh:
      reportResult.potentialDirectionalProductionKwh ?? currentResult.potentialDirectionalProductionKwh,
    windRosePercentages: reportResult.windRosePercentages ?? currentResult.windRosePercentages,
    potentialWindRosePercentages:
      reportResult.potentialWindRosePercentages ?? currentResult.potentialWindRosePercentages,
    windResourceScore: reportResult.windResourceScore ?? currentResult.windResourceScore,
    siteUtilizationScore: reportResult.siteUtilizationScore ?? currentResult.siteUtilizationScore
  };
}

function toAnalysisAddress(location: SelectedLocation): string | null {
  const normalizedName = location.name.trim().toLowerCase();

  if (normalizedName === "selected location" || normalizedName === "coordinate input") {
    return null;
  }

  return formatLocationLabel(location);
}

function mapProgressToStepLinkWidth(progressPercent: number): number {
  const clampedProgress = Math.max(0, Math.min(100, progressPercent));
  const withOffset = clampedProgress + STEP_TWO_TO_THREE_PROGRESS_OFFSET_PCT;
  return Math.min(STEP_TWO_TO_THREE_SEGMENT_WIDTH_PCT, (withOffset / 100) * STEP_TWO_TO_THREE_SEGMENT_WIDTH_PCT);
}

function resolveApiYearlyProduction(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function resolveApiMonthlyProduction(monthlyProductionKwh: number[] | null): number[] | null {
  if (!monthlyProductionKwh || monthlyProductionKwh.length !== 12) {
    return null;
  }

  const sanitized = monthlyProductionKwh.map((value) => (Number.isFinite(value) && value >= 0 ? value : 0));
  return sanitized;
}

function normalizeToShares(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    const evenShare = 1 / values.length;
    return values.map(() => evenShare);
  }

  return values.map((value) => value / total);
}

function sanitizePositiveValues(values: number[]): number[] {
  return values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
}

function resolveQualityMarkerPositionsFromScores(
  windResourceScore: number | null | undefined,
  siteUtilizationScore: number | null | undefined
): number[] {
  if (isFiniteScore(windResourceScore) && isFiniteScore(siteUtilizationScore)) {
    return [
      scoreToQualityMarkerTopPx(windResourceScore),
      scoreToQualityMarkerTopPx(siteUtilizationScore)
    ];
  }

  return resolveRandomQualityMarkerPositions(
    2,
    QUALITY_MARKER_MIN_TOP_PX,
    QUALITY_MARKER_MAX_TOP_PX,
    34
  );
}

function scoreToQualityMarkerTopPx(score: number): number {
  const clampedScore = Math.max(QUALITY_SCORE_MIN, Math.min(QUALITY_SCORE_MAX, score));
  const scoreRange = QUALITY_SCORE_MAX - QUALITY_SCORE_MIN;

  if (scoreRange <= 0) {
    return QUALITY_MARKER_MAX_TOP_PX;
  }

  const normalized = (clampedScore - QUALITY_SCORE_MIN) / scoreRange;
  const fromTopRatio = 1 - normalized;
  return QUALITY_MARKER_MIN_TOP_PX + fromTopRatio * (QUALITY_MARKER_MAX_TOP_PX - QUALITY_MARKER_MIN_TOP_PX);
}

function markerTopPxToClosestQualityTierIndex(markerTopPx: number): number {
  const clampedTopPx = Math.max(QUALITY_MARKER_MIN_TOP_PX, Math.min(QUALITY_MARKER_MAX_TOP_PX, markerTopPx));
  const range = QUALITY_MARKER_MAX_TOP_PX - QUALITY_MARKER_MIN_TOP_PX;
  const maxIndex = QUALITY_TIER_DEFINITIONS.length - 1;

  if (range <= 0 || maxIndex <= 0) {
    return 0;
  }

  const normalized = (clampedTopPx - QUALITY_MARKER_MIN_TOP_PX) / range;
  const nearestIndex = Math.round(normalized * maxIndex);
  return Math.max(0, Math.min(maxIndex, nearestIndex));
}

function isFiniteScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

interface QualityCalloutPosition {
  index: number;
  markerTopPx: number;
  centeredTopPx: number;
  topPx: number;
  edgeDistancePx: number;
  isMoved: boolean;
}

function resolveQualityCalloutPositions(
  markerPositions: number[]
): Array<{ index: number; topPx: number; markerTopPx: number; isMoved: boolean }> {
  const minSeparationPx = QUALITY_CALLOUT_HEIGHT_PX + QUALITY_CALLOUT_VERTICAL_GAP_PX;
  const basePositions: QualityCalloutPosition[] = markerPositions.map((markerTopPx, index) => {
    const centeredTopPx = markerTopPx - QUALITY_CALLOUT_HEIGHT_PX / 2;
    return {
      index,
      markerTopPx,
      centeredTopPx,
      topPx: centeredTopPx,
      edgeDistancePx: Math.min(markerTopPx, QUALITY_SCALE_HEIGHT_PX - markerTopPx),
      isMoved: false
    };
  });

  if (basePositions.length < 2 || !hasCalloutOverlap(basePositions, minSeparationPx)) {
    return basePositions
      .map(({ index, topPx, markerTopPx }) => ({ index, topPx, markerTopPx, isMoved: false }))
      .sort((left, right) => left.index - right.index);
  }

  if (basePositions.length === 2) {
    const [first, second] = basePositions;
    const anchor = first.edgeDistancePx <= second.edgeDistancePx ? first : second;
    const other = anchor.index === first.index ? second : first;
    const anchorTop = anchor.centeredTopPx;
    let otherTop = other.topPx;
    const otherIsBelowAnchor = other.markerTopPx >= anchor.markerTopPx;

    if (otherIsBelowAnchor) {
      const minTop = anchorTop + minSeparationPx + QUALITY_CALLOUT_DOWNWARD_EXTRA_GAP_PX;
      if (otherTop < minTop) {
        otherTop = minTop;
      }
    } else {
      const maxAllowedTop = anchorTop - minSeparationPx;
      if (otherTop > maxAllowedTop) {
        otherTop = maxAllowedTop;
      }
    }

    return [
      { index: anchor.index, topPx: anchorTop, markerTopPx: anchor.markerTopPx, isMoved: false },
      {
        index: other.index,
        topPx: otherTop,
        markerTopPx: other.markerTopPx,
        isMoved: Math.abs(otherTop - other.centeredTopPx) > 0.01
      }
    ].sort((left, right) => left.index - right.index);
  }

  const spreadPositions = [...basePositions].sort((left, right) => left.topPx - right.topPx);
  for (let index = 1; index < spreadPositions.length; index += 1) {
    const previousTop = spreadPositions[index - 1].topPx;
    const minTop = previousTop + minSeparationPx;
    spreadPositions[index].topPx = Math.max(spreadPositions[index].topPx, minTop);
  }

  return spreadPositions
    .map(({ index, topPx, centeredTopPx, markerTopPx }) => ({
      index,
      topPx,
      markerTopPx,
      isMoved: Math.abs(topPx - centeredTopPx) > 0.01
    }))
    .sort((left, right) => left.index - right.index);
}

function hasCalloutOverlap(
  calloutPositions: Array<{ centeredTopPx: number }>,
  minSeparationPx: number
): boolean {
  const sortedPositions = [...calloutPositions].sort((left, right) => left.centeredTopPx - right.centeredTopPx);
  for (let index = 1; index < sortedPositions.length; index += 1) {
    if (sortedPositions[index].centeredTopPx - sortedPositions[index - 1].centeredTopPx < minSeparationPx) {
      return true;
    }
  }

  return false;
}

function describeQualityConnectorPath({
  startX,
  startY,
  endX,
  endY,
  useRoutedPath,
  bendRadiusPx
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  useRoutedPath: boolean;
  bendRadiusPx: number;
}): string {
  if (endX <= startX) {
    return `M ${startX} ${startY} L ${endX} ${startY}`;
  }

  if (!useRoutedPath || Math.abs(endY - startY) < 0.01) {
    return `M ${startX} ${startY} L ${endX} ${startY}`;
  }

  const halfwayX = startX + (endX - startX) / 2;
  const verticalDirection = endY >= startY ? 1 : -1;
  const horizontalToHalfPx = halfwayX - startX;
  const horizontalFromHalfPx = endX - halfwayX;
  const verticalDistancePx = Math.abs(endY - startY);
  const radiusPx = Math.max(
    0,
    Math.min(
      bendRadiusPx,
      horizontalToHalfPx,
      horizontalFromHalfPx,
      verticalDistancePx / 2
    )
  );

  if (radiusPx < 0.01) {
    return `M ${startX} ${startY} L ${endX} ${endY}`;
  }

  const firstCornerStartX = halfwayX - radiusPx;
  const firstCornerEndY = startY + verticalDirection * radiusPx;
  const secondCornerStartY = endY - verticalDirection * radiusPx;
  const secondCornerEndX = halfwayX + radiusPx;

  return [
    `M ${startX} ${startY}`,
    `L ${firstCornerStartX} ${startY}`,
    `Q ${halfwayX} ${startY} ${halfwayX} ${firstCornerEndY}`,
    `L ${halfwayX} ${secondCornerStartY}`,
    `Q ${halfwayX} ${endY} ${secondCornerEndX} ${endY}`,
    `L ${endX} ${endY}`
  ].join(" ");
}

function qualityScaleColorAt(topPx: number, scaleHeightPx: number): string {
  const clampedTop = Math.max(0, Math.min(scaleHeightPx, topPx));
  const topRatio = clampedTop / scaleHeightPx;
  const red = { r: 248, g: 115, b: 112 };
  const green = { r: 45, g: 197, b: 91 };

  if (topRatio <= 0.15) {
    return `rgb(${green.r}, ${green.g}, ${green.b})`;
  }

  if (topRatio >= 0.85) {
    return `rgb(${red.r}, ${red.g}, ${red.b})`;
  }

  const t = (topRatio - 0.15) / 0.7;
  const r = Math.round(green.r + (red.r - green.r) * t);
  const g = Math.round(green.g + (red.g - green.g) * t);
  const b = Math.round(green.b + (red.b - green.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function resolveRandomQualityMarkerPositions(
  count: number,
  minPx: number,
  maxPx: number,
  minGapPx: number
): number[] {
  const sortedPositions: number[] = [];
  const range = Math.max(0, maxPx - minPx);

  for (let index = 0; index < count; index += 1) {
    let candidate = minPx + Math.random() * range;
    let attempts = 0;

    while (
      sortedPositions.some((position) => Math.abs(position - candidate) < minGapPx) &&
      attempts < 80
    ) {
      candidate = minPx + Math.random() * range;
      attempts += 1;
    }

    sortedPositions.push(candidate);
  }

  sortedPositions.sort((a, b) => a - b);
  return sortedPositions;
}

interface LegendTooltipItemProps {
  label: string;
  infoText: string;
  swatchVariant: "solid" | "gradient";
  tooltipAlign?: "left" | "right";
}

function LegendTooltipItem({
  label,
  infoText,
  swatchVariant,
  tooltipAlign = "right"
}: LegendTooltipItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchLikeInput, setIsTouchLikeInput] = useState(false);
  const isVisible = isOpen || (!isTouchLikeInput && isHovered);
  const tooltipPositionClass = tooltipAlign === "left" ? "left-0" : "right-0";

  return (
    <button
      type="button"
      className="relative flex min-h-[30px] items-center rounded-[2px] bg-[#ECECEC] py-1.5 pl-2 pr-1.5 text-[12px] text-[#111111] sm:px-3"
      onPointerDown={(event) => setIsTouchLikeInput(event.pointerType !== "mouse")}
      onMouseEnter={() => {
        if (!isTouchLikeInput) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => {
        if (!isTouchLikeInput) {
          setIsHovered(false);
        }
      }}
      onClick={() => {
        setIsOpen((value) => !value);
        if (isTouchLikeInput) {
          setIsHovered(false);
        }
      }}
      onBlur={() => {
        setIsOpen(false);
        setIsHovered(false);
      }}
      aria-label={`${label}. More info`}
      aria-expanded={isVisible}
    >
      {swatchVariant === "solid" ? (
        <span className="h-3.5 w-3.5 shrink-0 self-center rounded-[2px] border border-white bg-white/60" aria-hidden />
      ) : (
        <span
          className="h-3.5 w-[2.68rem] shrink-0 self-center rounded-[2px] bg-[linear-gradient(to_right,#22c55e_0%,#fbbf24_50%,#f87171_100%)] sm:w-28"
          aria-hidden
        />
      )}
      <span className="ml-1.5 self-center leading-none sm:ml-2">{label}</span>
      <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[#585858]" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="8.2" r="1.1" fill="currentColor" />
          <path d="M12 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {isVisible ? (
        <span
          role="tooltip"
          className={`pointer-events-none absolute ${tooltipPositionClass} bottom-full z-20 mb-1 w-[min(14rem,calc(100vw-1rem))] rounded-[2px] border border-[#CDCDCD] bg-white px-2 py-1 text-left text-[12px] font-normal leading-tight text-[#2A2A2A] shadow-[0_1px_4px_rgba(0,0,0,0.15)] sm:w-56`}
        >
          {infoText}
        </span>
      ) : null}
    </button>
  );
}

interface LegendInfoHintProps {
  text: string;
  isOpen: boolean;
}

function LegendInfoHint({ text, isOpen }: LegendInfoHintProps) {
  return (
    <span className="relative ml-0.5 inline-flex items-center self-center">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[#585858]" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="8.2" r="1.1" fill="currentColor" />
          <path d="M12 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {isOpen ? (
        <span
          role="tooltip"
          className="absolute bottom-full right-0 z-20 mb-1 w-[min(14rem,calc(100vw-1rem))] rounded-[2px] border border-[#CDCDCD] bg-white px-2 py-1 text-[12px] font-normal leading-tight text-[#2A2A2A] shadow-[0_1px_4px_rgba(0,0,0,0.15)] sm:w-56"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
const DEFAULT_DIRECTION_STRENGTH = [8, 10, 11, 9, 7, 8, 10, 11, 9, 8, 6, 7];


