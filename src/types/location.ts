export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface LocationSuggestion extends LocationPoint {
  id: string;
  name: string;
  region: string;
  country: string;
}

export type LocationSource = "search" | "map";

export interface SelectedLocation extends LocationPoint {
  id: string;
  name: string;
  source: LocationSource;
  region?: string;
  country?: string;
}

export type SearchStatus = "idle" | "loading" | "success" | "error";
