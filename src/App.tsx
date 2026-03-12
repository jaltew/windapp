import { useCallback, useEffect, useRef, useState } from "react";
import { AnalysisLoadingPage, type AnalysisCompletionPayload } from "./pages/AnalysisLoadingPage";
import { LATEST_STEP3_CACHE_KEY, writeStorageJson } from "./lib/devStep3Storage";
import { LandingLocationPage } from "./pages/LandingLocationPage";
import type { SelectedLocation } from "./types/location";
import type { MapViewState } from "./types/map";

type AppStep = "location" | "loading" | "analysisReview" | "results";
const LOADING_PREPARE_FALLBACK_MS = 4500;

function App() {
  const [step, setStep] = useState<AppStep>("location");
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [mapView, setMapView] = useState<MapViewState | null>(null);
  const [completedAnalysis, setCompletedAnalysis] = useState<AnalysisCompletionPayload | null>(null);
  const [isPreparingLoading, setIsPreparingLoading] = useState(false);
  const loadingPrepareTimeoutRef = useRef<number | null>(null);

  const handleStartAnalysis = useCallback((selectedLocation: SelectedLocation) => {
    setLocation(selectedLocation);
    setCompletedAnalysis(null);
    setIsPreparingLoading(true);

    if (loadingPrepareTimeoutRef.current !== null) {
      window.clearTimeout(loadingPrepareTimeoutRef.current);
    }

    loadingPrepareTimeoutRef.current = window.setTimeout(() => {
      setStep("loading");
      setIsPreparingLoading(false);
      loadingPrepareTimeoutRef.current = null;
    }, LOADING_PREPARE_FALLBACK_MS);
  }, []);

  const handleBackToLocation = useCallback(() => {
    setStep("location");
    setIsPreparingLoading(false);

    if (loadingPrepareTimeoutRef.current !== null) {
      window.clearTimeout(loadingPrepareTimeoutRef.current);
      loadingPrepareTimeoutRef.current = null;
    }
  }, []);

  const handleLoadingMapReady = useCallback(() => {
    if (step !== "location" || !isPreparingLoading) {
      return;
    }

    if (loadingPrepareTimeoutRef.current !== null) {
      window.clearTimeout(loadingPrepareTimeoutRef.current);
      loadingPrepareTimeoutRef.current = null;
    }

    setStep("loading");
    setIsPreparingLoading(false);
  }, [isPreparingLoading, step]);

  useEffect(() => {
    return () => {
      if (loadingPrepareTimeoutRef.current !== null) {
        window.clearTimeout(loadingPrepareTimeoutRef.current);
      }
    };
  }, []);

  const shouldRenderLoadingPage = location !== null
    && (step === "loading" || step === "analysisReview" || step === "results" || isPreparingLoading);
  const renderLoadingPageOffscreen = step === "location" && isPreparingLoading;
  const loadingLayerClassName = renderLoadingPageOffscreen
    ? "pointer-events-none fixed inset-0 z-50 overflow-y-auto opacity-0"
    : "fixed inset-0 z-50 overflow-y-auto opacity-100";

  const handleAnalysisComplete = useCallback((payload: AnalysisCompletionPayload) => {
    setCompletedAnalysis(payload);
    writeStorageJson(LATEST_STEP3_CACHE_KEY, payload);

    if (payload.mapView) {
      setMapView(payload.mapView);
    }

    setStep("results");
    setIsPreparingLoading(false);

    if (loadingPrepareTimeoutRef.current !== null) {
      window.clearTimeout(loadingPrepareTimeoutRef.current);
      loadingPrepareTimeoutRef.current = null;
    }
  }, []);

  const handleGoToStepTwo = useCallback(() => {
    if (!completedAnalysis) {
      return;
    }

    setLocation(completedAnalysis.location);
    if (completedAnalysis.mapView) {
      setMapView(completedAnalysis.mapView);
    }
    setStep("analysisReview");
  }, [completedAnalysis]);

  const handleGoToStepThree = useCallback(() => {
    if (!completedAnalysis) {
      return;
    }

    setLocation(completedAnalysis.location);
    if (completedAnalysis.mapView) {
      setMapView(completedAnalysis.mapView);
    }
    setStep("results");
  }, [completedAnalysis]);

  return (
    <>
      {step === "location" ? (
        <LandingLocationPage
          initialLocation={location}
          initialMapView={mapView}
          isStartingAnalysis={isPreparingLoading}
          canResumeAnalysis={completedAnalysis !== null}
          onGoToStepTwo={handleGoToStepTwo}
          onGoToStepThree={handleGoToStepThree}
          onStartAnalysis={handleStartAnalysis}
          onMapViewChange={setMapView}
        />
      ) : null}

      {shouldRenderLoadingPage ? (
        <div
          className={loadingLayerClassName}
          aria-hidden={renderLoadingPageOffscreen}
        >
          <AnalysisLoadingPage
            location={location}
            initialMapView={mapView}
            onBackToLocation={handleBackToLocation}
            onGoToStepTwo={handleGoToStepTwo}
            onGoToStepThree={handleGoToStepThree}
            onAnalysisComplete={handleAnalysisComplete}
            autoStart={step === "loading"}
            onMapReady={handleLoadingMapReady}
            currentStep={step === "results" ? "results" : step === "analysisReview" ? "analysisReview" : "loading"}
            initialCompletedAnalysis={completedAnalysis}
          />
        </div>
      ) : null}
    </>
  );
}

export default App;
