import { useCallback, useEffect, useMemo, useState } from "react";
import { LocationMap } from "../features/location/components/LocationMap";
import { LocationSearch } from "../features/location/components/LocationSearch";
import { useMockLocationSearch } from "../features/location/hooks/useMockLocationSearch";
import { formatLocationLabel } from "../features/location/lib/locationLabel";
import type { SelectedLocation, LocationSuggestion } from "../types/location";
import type { MapViewState } from "../types/map";

interface LandingLocationPageProps {
  initialLocation?: SelectedLocation | null;
  initialMapView?: MapViewState | null;
  isStartingAnalysis?: boolean;
  canResumeAnalysis?: boolean;
  onGoToStepTwo?: () => void;
  onGoToStepThree?: () => void;
  onStartAnalysis: (location: SelectedLocation) => void;
  onMapViewChange?: (viewState: MapViewState) => void;
}

export function LandingLocationPage({
  initialLocation = null,
  initialMapView = null,
  isStartingAnalysis = false,
  canResumeAnalysis = false,
  onGoToStepTwo,
  onGoToStepThree,
  onStartAnalysis,
  onMapViewChange
}: LandingLocationPageProps) {
  const { query, status, suggestions, errorMessage, setQuery } = useMockLocationSearch();
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(initialLocation);
  const [focusLocation, setFocusLocation] = useState<SelectedLocation | null>(initialLocation);

  const canAnalyze = useMemo(
    () => selectedLocation !== null && !isStartingAnalysis,
    [isStartingAnalysis, selectedLocation]
  );
  const canResumeFromHere = useMemo(() => {
    if (!canResumeAnalysis || !selectedLocation || !initialLocation) {
      return false;
    }

    return areSameLocationPoint(selectedLocation, initialLocation);
  }, [canResumeAnalysis, initialLocation, selectedLocation]);

  const selectFromSearch = useCallback((suggestion: LocationSuggestion) => {
    const nextLocation: SelectedLocation = {
      id: suggestion.id,
      name: suggestion.name,
      region: suggestion.region,
      country: suggestion.country,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      source: "search"
    };

    setFocusLocation(nextLocation);
    setSelectedLocation(nextLocation);
    setQuery(formatLocationLabel(suggestion));
  }, [setQuery]);

  const selectFromMap = useCallback((location: SelectedLocation) => {
    setSelectedLocation(location);
    setFocusLocation(location);
  }, []);

  const submitRawLocationInput = useCallback((rawValue: string): boolean => {
    const parsedCoordinates = parseCoordinates(rawValue);

    if (!parsedCoordinates) {
      return false;
    }

    const nextLocation: SelectedLocation = {
      id: `coordinate-${parsedCoordinates.latitude}-${parsedCoordinates.longitude}`,
      name: "Coordinate input",
      latitude: parsedCoordinates.latitude,
      longitude: parsedCoordinates.longitude,
      source: "search"
    };

    setFocusLocation(nextLocation);
    setSelectedLocation(nextLocation);
    return true;
  }, []);

  const submitLocationForAnalysis = useCallback(() => {
    if (!selectedLocation) {
      return;
    }

    onStartAnalysis(selectedLocation);
  }, [onStartAnalysis, selectedLocation]);

  useEffect(() => {
    if (!initialLocation) {
      return;
    }

    if (initialLocation.source === "map") {
      return;
    }

    setQuery(formatLocationLabel(initialLocation));
  }, [initialLocation, setQuery]);

  return (
    <main className="min-h-[100dvh] bg-[linear-gradient(to_bottom,#f2f2f2_0,#f2f2f2_114px,#ffffff_114px,#ffffff_100%)] sm:min-h-screen sm:bg-transparent">
      <div className="mx-auto max-w-6xl pb-0 pt-3 sm:px-8 sm:pb-10 lg:pb-12 lg:pt-4">
        <section className="mx-auto mb-3 max-w-[460px] px-3 sm:mb-4 sm:px-0">
          <div className="relative">
            <div className="pointer-events-none absolute left-[20%] right-[20%] top-[11px] h-px bg-[#EAEAEA]" />
            {canResumeFromHere ? (
              <div className="pointer-events-none absolute left-[20%] right-[20%] top-[11px] h-px bg-[#5A5A5A]" />
            ) : null}
            <div className="relative grid grid-cols-3 items-start">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#4A4A4A] bg-white text-[13px] font-bold leading-none text-[#4A4A4A]">
                  1
                </div>
                <p className="mt-1 text-[12px] font-bold leading-none text-[#5A5A5A]">Location</p>
              </div>

              <button
                type="button"
                className="group flex flex-col items-center rounded-[2px] bg-transparent p-0 text-left transition disabled:pointer-events-none disabled:cursor-default disabled:opacity-100"
                onClick={onGoToStepTwo}
                disabled={!canResumeFromHere}
                aria-label="Go to step 2: Analyze location"
              >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[13px] font-bold leading-none transition-all duration-150 group-hover:-translate-y-[1px] group-hover:border-[#4E4E4E] group-hover:text-[#4E4E4E] group-hover:shadow-[0_1px_4px_rgba(0,0,0,0.16)] ${
                  canResumeFromHere ? "border-[#5A5A5A] text-[#5A5A5A]" : "border-[#EAEAEA] text-[#EAEAEA]"
                }`}>
                  2
                </div>
                <p className={`mt-1 text-[12px] font-medium leading-none transition-colors duration-150 group-hover:text-[#5F5F5F] ${
                  canResumeFromHere ? "text-[#6B6B6B]" : "text-[#C3C3C3]"
                }`}>Analyze location</p>
              </button>

              <button
                type="button"
                className="group flex flex-col items-center rounded-[2px] bg-transparent p-0 text-left transition disabled:pointer-events-none disabled:cursor-default disabled:opacity-100"
                onClick={onGoToStepThree}
                disabled={!canResumeFromHere}
                aria-label="Go to step 3: Results"
              >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white text-[13px] font-bold leading-none transition-all duration-150 group-hover:-translate-y-[1px] group-hover:border-[#4E4E4E] group-hover:text-[#4E4E4E] group-hover:shadow-[0_1px_4px_rgba(0,0,0,0.16)] ${
                  canResumeFromHere ? "border-[#5A5A5A] text-[#5A5A5A]" : "border-[#EAEAEA] text-[#EAEAEA]"
                }`}>
                  3
                </div>
                <p className={`mt-1 text-[12px] font-medium leading-none transition-colors duration-150 group-hover:text-[#5F5F5F] ${
                  canResumeFromHere ? "text-[#6B6B6B]" : "text-[#C3C3C3]"
                }`}>Results</p>
              </button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-none border-y border-x-0 border-[#CDCDCD] bg-white p-0 shadow-none sm:mx-auto sm:max-w-[700px] sm:rounded-[2px] sm:border sm:border-[#CDCDCD] sm:p-4 sm:shadow-[0_1px_9px_4px_rgba(181,181,181,0.1804)]">
          <div className="space-y-3 sm:space-y-4">
            <LocationMap
              selectedLocation={selectedLocation}
              focusLocation={focusLocation}
              onSelectLocation={selectFromMap}
              initialViewState={initialMapView}
              onViewStateChange={onMapViewChange}
            />

            <section className="grid gap-2.5 px-3 pb-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3 sm:px-0 sm:pb-0">
              <LocationSearch
                query={query}
                status={status}
                suggestions={suggestions}
                errorMessage={errorMessage}
                onQueryChange={setQuery}
                onSelectSuggestion={selectFromSearch}
                onSubmitRawQuery={submitRawLocationInput}
              />

              <div>
                <button
                  type="button"
                  disabled={!canAnalyze}
                  className="inline-flex h-14 w-full items-center justify-center rounded-[2px] bg-[#333131] px-5 text-[1em] font-medium text-white transition disabled:cursor-not-allowed disabled:bg-[#ECECEC] disabled:text-[#CDCDCD] sm:w-auto"
                  onClick={submitLocationForAnalysis}
                >
                  {isStartingAnalysis ? "Starting analysis..." : "Analyze this location"}
                </button>
              </div>
            </section>
          </div>
        </section>

      </div>
    </main>
  );
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

function parseCoordinates(rawValue: string): Coordinates | null {
  const matchedCoordinates = rawValue.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
  );

  if (!matchedCoordinates) {
    return null;
  }

  const latitude = Number.parseFloat(matchedCoordinates[1]);
  const longitude = Number.parseFloat(matchedCoordinates[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function areSameLocationPoint(a: SelectedLocation, b: SelectedLocation): boolean {
  return Math.abs(a.latitude - b.latitude) < 0.000001 && Math.abs(a.longitude - b.longitude) < 0.000001;
}


