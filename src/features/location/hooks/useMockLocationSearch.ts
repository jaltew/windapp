import { useEffect, useState } from "react";
import { searchMockLocations } from "../services/mockLocationSearch";
import type { LocationSuggestion, SearchStatus } from "../../../types/location";

const QUERY_DEBOUNCE_MS = 250;

interface UseMockLocationSearchResult {
  query: string;
  status: SearchStatus;
  suggestions: LocationSuggestion[];
  errorMessage: string | null;
  setQuery: (nextValue: string) => void;
}

export function useMockLocationSearch(): UseMockLocationSearchResult {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setStatus("idle");
      setSuggestions([]);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    const timer = window.setTimeout(async () => {
      try {
        const nextSuggestions = await searchMockLocations(trimmedQuery);

        if (cancelled) {
          return;
        }

        setSuggestions(nextSuggestions);
        setStatus("success");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSuggestions([]);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unexpected search issue. Please try again."
        );
      }
    }, QUERY_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return {
    query,
    status,
    suggestions,
    errorMessage,
    setQuery
  };
}
