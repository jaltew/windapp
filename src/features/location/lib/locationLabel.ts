import type { LocationSuggestion, SelectedLocation } from "../../../types/location";

export function formatLocationLabel(location: LocationSuggestion | SelectedLocation): string {
  if (!location.region && location.country && location.name.toLowerCase() === location.country.toLowerCase()) {
    return location.name;
  }

  if (!location.region && !location.country) {
    return location.name;
  }

  return `${location.name}, ${[location.region, location.country].filter(Boolean).join(", ")}`;
}
