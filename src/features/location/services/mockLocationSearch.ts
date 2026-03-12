import { mockLocationSuggestions } from "../../../mocks/locationSuggestions";
import type { LocationSuggestion } from "../../../types/location";

const SEARCH_DELAY_MS = 320;
const EUROPE_COUNTRY_CODES = [
  "al", "ad", "at", "be", "ba", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "de", "gr", "hu",
  "is", "ie", "it", "xk", "lv", "li", "lt", "lu", "mt", "md", "mc", "me", "nl", "mk", "no", "pl",
  "pt", "ro", "sm", "rs", "sk", "si", "es", "se", "ch", "tr", "ua", "gb", "va"
].join(",");
const searchCache = new Map<string, LocationSuggestion[]>();

interface NominatimSearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

export async function searchMockLocations(query: string): Promise<LocationSuggestion[]> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const normalizedQuery = normalize(trimmedQuery);
  const cached = searchCache.get(normalizedQuery);

  if (cached) {
    return cached;
  }

  await delay(SEARCH_DELAY_MS);

  try {
    const remoteMatches = await searchEuropeAddresses(trimmedQuery);

    if (remoteMatches.length > 0) {
      searchCache.set(normalizedQuery, remoteMatches);
      return remoteMatches;
    }
  } catch {
    // Fall through to local matching if remote geocoding is unavailable.
  }

  const fallbackMatches = searchLocalSuggestions(trimmedQuery);
  searchCache.set(normalizedQuery, fallbackMatches);
  return fallbackMatches;
}

async function searchEuropeAddresses(query: string): Promise<LocationSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", EUROPE_COUNTRY_CODES);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Geocoding lookup failed.");
  }

  const rawResults = (await response.json()) as NominatimSearchResult[];

  return rawResults
    .map((result) => {
      const latitude = Number.parseFloat(result.lat);
      const longitude = Number.parseFloat(result.lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      const name =
        result.address?.city ??
        result.address?.town ??
        result.address?.village ??
        result.address?.hamlet ??
        result.address?.municipality ??
        result.display_name.split(",")[0]?.trim() ??
        "Selected location";

      return {
        id: `nominatim-${result.place_id}`,
        name,
        region: result.address?.state ?? result.address?.county ?? "",
        country: result.address?.country ?? "Europe",
        latitude,
        longitude
      } satisfies LocationSuggestion;
    })
    .filter((result): result is LocationSuggestion => result !== null)
    .slice(0, 6);
}

function searchLocalSuggestions(query: string): LocationSuggestion[] {
  const normalizedTerms = normalize(query)
    .split(/\s+/)
    .filter(Boolean);

  return mockLocationSuggestions
    .filter((candidate) => {
      const locationLabel = normalize(`${candidate.name} ${candidate.region} ${candidate.country}`);
      return normalizedTerms.every((term) => locationLabel.includes(term));
    })
    .slice(0, 6);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
