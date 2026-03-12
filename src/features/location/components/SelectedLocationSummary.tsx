import type { SelectedLocation } from "../../../types/location";
import { formatLocationLabel } from "../lib/locationLabel";

interface SelectedLocationSummaryProps {
  location: SelectedLocation | null;
}

export function SelectedLocationSummary({ location }: SelectedLocationSummaryProps) {
  if (!location) {
    return (
      <section
        aria-live="polite"
        className="rounded-xl border border-dashed border-border bg-panel px-4 py-4 text-sm text-muted"
      >
        No location selected yet. Choose a location from search or click the map.
      </section>
    );
  }

  return (
    <section aria-live="polite" className="rounded-xl border border-border bg-white px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Selected location</p>
      <p className="mt-1 text-lg font-semibold text-ink">{formatLocationLabel(location)}</p>
      <p className="mt-2 text-sm text-muted">
        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
      </p>
      <p className="mt-2 inline-flex rounded-full bg-accentSoft px-2 py-1 text-xs font-medium text-ink">
        Source: {location.source === "search" ? "Search result" : "Map click"}
      </p>
    </section>
  );
}
