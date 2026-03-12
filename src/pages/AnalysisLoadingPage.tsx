import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import resultsTurbineImage from "../../share/26013001 - front copy - with outline copy - cropped.png";
import { AnalysisLiveMap } from "../features/analysis/components/AnalysisLiveMap";
import { MonthlyProductionChart } from "../features/analysis/components/MonthlyProductionChart";
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
const REALISTIC_YEARLY_PRODUCTION_MIN_KWH = 40_000;
const REALISTIC_YEARLY_PRODUCTION_DEFAULT_KWH = 46_372;
const QUALITY_LEVEL_LABELS = ["Excelent", "Great", "Good", "Fair", "Poor", "Very Poor"];
const QUALITY_SCALE_HEIGHT_PX = 327;
const QUALITY_SCALE_WIDTH_PX = 128;
const QUALITY_SCALE_BAR_WIDTH_PX = 29;
const QUALITY_SCALE_BAR_RIGHT_OFFSET_PX = 20;
const QUALITY_MARKER_SIZE_PX = 10;
const QUALITY_MARKER_OFFSET_FROM_BAR_END_PX = 6;

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
  currentStep = "loading"
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
  const [yearlyProductionInput, setYearlyProductionInput] = useState("");
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
  const parsedYearlyProduction = parsePositiveNumber(yearlyProductionInput);
  const defaultYearlyProductionKwh = resolveRealisticYearlyProduction(result?.aepKwh);
  const yearlyProductionKwh = parsedYearlyProduction ?? defaultYearlyProductionKwh;
  const monthlyProductionValues = useMemo(() => {
    const monthlyProfile = resolveMonthlyProfile(result?.monthlyProductionKwh ?? null);
    return monthlyProfile.map((ratio) => ratio * yearlyProductionKwh);
  }, [result?.monthlyProductionKwh, yearlyProductionKwh]);
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

    if (yearlyProductionKwh > 0) {
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
    () => resolveRandomQualityMarkerPositions(2, 20, QUALITY_SCALE_HEIGHT_PX - 20, 34),
    []
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
    setYearlyProductionInput(
      Math.round(resolveRealisticYearlyProduction(initialCompletedAnalysis.result?.aepKwh)).toString()
    );

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
    setYearlyProductionInput("");
    latestBuildingsGeoJsonRef.current = null;
    latestTreesGeoJsonRef.current = null;
    latestLandcoverPreviewRef.current = null;
    latestResultRef.current = null;
    completionNotifiedRef.current = false;

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
      onAnalysisComplete?.({
        location,
        mapView: latestMapViewRef.current,
        buildingsGeoJson: nextBuildingsGeoJson ?? latestBuildingsGeoJsonRef.current,
        treesGeoJson: nextTreesGeoJson ?? latestTreesGeoJsonRef.current,
        landcoverPreview: nextLandcoverPreview ?? latestLandcoverPreviewRef.current,
        result: nextResult ?? latestResultRef.current
      });
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
          case "result":
            setProgressPercent(100);
            setProgressText(PROGRESS_COPY.complete);
            latestResultRef.current = event.data;
            setResult(event.data);
            setYearlyProductionInput(
              Math.round(resolveRealisticYearlyProduction(event.data.aepKwh)).toString()
            );
            notifyAnalysisComplete(null, null, null, event.data);
            break;
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

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-5 pb-6 pt-2 sm:px-8 sm:pb-10 lg:pb-12 lg:pt-4">
        <section className="mx-auto -mt-1 mb-3 max-w-[460px] sm:mb-4">
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

        <section className="mx-auto -mx-5 max-w-none border-y border-x-0 border-[#CDCDCD] bg-white p-2.5 shadow-[0_1px_9px_4px_rgba(181,181,181,0.1804)] sm:mx-auto sm:max-w-[700px] sm:rounded-[2px] sm:border sm:p-4">
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
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <div className="flex min-h-[30px] items-center rounded-[2px] bg-[#ECECEC] px-3 py-1.5 text-[12px] text-[#111111]">
                  <span className="h-3.5 w-3.5 shrink-0 self-center rounded-[2px] border border-white bg-white/60" />
                  <span className="ml-2 self-center leading-none">Local Wind Potential</span>
                  <LegendInfoHint text="Lirum larum about site wind potential for this location." />
                </div>
                <div className="flex min-h-[30px] items-center rounded-[2px] bg-[#ECECEC] px-3 py-1.5 text-[12px] text-[#111111]">
                  <span className="h-3.5 w-28 shrink-0 self-center rounded-[2px] bg-[linear-gradient(to_right,#22c55e_0%,#fbbf24_50%,#f87171_100%)]" />
                  <span className="ml-2 self-center leading-none">Site Utilization Score</span>
                  <LegendInfoHint text="Lirum larum about utilization from favorable to less favorable directions." />
                </div>
              </div>
              <div className="mt-3 -mx-2.5 border-t border-[#CDCDCD] sm:-mx-4" aria-hidden />
            </>
          ) : null}

          {currentStep !== "results" ? (
            <div className="relative mt-3 h-14 overflow-hidden rounded-[2px] border border-[#CDCDCD] bg-white sm:mt-4">
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
              <section className="relative -mx-2.5 h-[534px] overflow-hidden sm:-mx-4">
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[389px]"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(248,248,248,1) 0%, rgba(248,248,248,1) 63%, rgba(248,248,248,0) 100%)"
                  }}
                  aria-hidden
                />
                <div className="relative z-10 mx-2.5 sm:mx-4">
                  <div className="pl-3 pr-7 pt-7">
                    <header className="ml-4">
                      <p className="text-[13px] font-bold text-[#474747]">WM 25 kW</p>
                      <h2 className="mt-1.5 text-[40px] font-light leading-none text-[#474747]">Results</h2>
                    </header>
                    <div className="ml-4 mt-9 flex items-start gap-6">
                      <div
                        className="relative"
                        style={{ width: `${QUALITY_SCALE_WIDTH_PX}px`, height: `${QUALITY_SCALE_HEIGHT_PX}px` }}
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
                              left: `${QUALITY_SCALE_WIDTH_PX - QUALITY_SCALE_BAR_RIGHT_OFFSET_PX + QUALITY_MARKER_OFFSET_FROM_BAR_END_PX}px`,
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
                      <div className="pl-12 pt-32 text-[#474747]">
                        <p className="text-[14px] font-bold leading-tight">Missing section</p>
                        <p className="mt-1 text-[14px] leading-tight">In development</p>
                      </div>
                    </div>
                  </div>
                </div>
                <img
                  src={resultsTurbineImage}
                  alt="WM 25 kW results illustration"
                  className="absolute -bottom-px right-1 block h-[534px] w-auto max-w-none object-contain"
                />
              </section>
              <div className="-mx-2.5 border-t border-[#CDCDCD] sm:-mx-4" aria-hidden />

              <MonthlyProductionChart values={monthlyProductionValues} yearlyProductionKwh={yearlyProductionKwh} />
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

function parsePositiveNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function resolveRealisticYearlyProduction(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= REALISTIC_YEARLY_PRODUCTION_MIN_KWH) {
    return value;
  }

  return REALISTIC_YEARLY_PRODUCTION_DEFAULT_KWH;
}

function resolveMonthlyProfile(monthlyProductionKwh: number[] | null): number[] {
  if (monthlyProductionKwh && monthlyProductionKwh.length === 12) {
    const sanitized = monthlyProductionKwh.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
    const total = sanitized.reduce((sum, value) => sum + value, 0);

    if (total > 0) {
      return sanitized.map((value) => value / total);
    }
  }

  return DEFAULT_MONTHLY_PROFILE;
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

interface LegendInfoHintProps {
  text: string;
}

function LegendInfoHint({ text }: LegendInfoHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isVisible = isOpen || isHovered;

  return (
    <span
      className="relative ml-1 inline-flex items-center self-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        aria-label="More info"
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[#585858]"
        onClick={() => setIsOpen((value) => !value)}
        onBlur={() => setIsOpen(false)}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="8.2" r="1.1" fill="currentColor" />
          <path d="M12 11v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {isVisible ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 w-56 rounded-[2px] border border-[#CDCDCD] bg-white px-2 py-1 text-[12px] font-normal leading-tight text-[#2A2A2A] shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

const DEFAULT_MONTHLY_PROFILE = [
  0.098,
  0.094,
  0.09,
  0.082,
  0.075,
  0.068,
  0.063,
  0.064,
  0.076,
  0.091,
  0.1,
  0.099
];

const DEFAULT_DIRECTION_STRENGTH = [8, 10, 11, 9, 7, 8, 10, 11, 9, 8, 6, 7];
