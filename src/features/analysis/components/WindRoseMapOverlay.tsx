import { type PointerEvent, useRef, useState } from "react";

interface WindRoseMapOverlayProps {
  actualValues: number[];
  potentialValues: number[] | null;
}

const VIEW_SIZE = 660;
const INNER_RADIUS = 74;
const OUTER_RADIUS = 316;
const GAP_DEGREES = 1.7;
const ROTATION_DEGREES = 14;
const SEGMENT_GAP_PX = 1.5;
type HoverSegment = "actual" | "potential";

interface HoverTarget {
  sliceIndex: number;
  segment: HoverSegment;
}

export function WindRoseMapOverlay({ actualValues, potentialValues }: WindRoseMapOverlayProps) {
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [hoverTooltipPosition, setHoverTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sliceCount = resolveSliceCount(actualValues, potentialValues);
  const actual = sampleValues(actualValues, sliceCount);
  const potentialSample = potentialValues ? sampleValues(potentialValues, sliceCount) : actual;
  const potential = potentialSample.map((value, index) => Math.max(value, actual[index]));
  const maxPotential = Math.max(...potential, 1);
  const center = VIEW_SIZE / 2;
  const ringRange = OUTER_RADIUS - INNER_RADIUS;
  const sectorStep = (Math.PI * 2) / sliceCount;
  const sectorGap = degToRad(GAP_DEGREES);
  const startOffset = degToRad(-90 + ROTATION_DEGREES);
  const updateTooltipPosition = (event: PointerEvent<SVGElement>) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const rawX = event.clientX - bounds.left;
    const rawY = event.clientY - bounds.top;
    const clampedX = Math.max(10, Math.min(rawX, bounds.width - 10));
    const clampedY = Math.max(10, Math.min(rawY, bounds.height - 10));
    setHoverTooltipPosition({ x: clampedX, y: clampedY });
  };
  const setHoveredTarget = (sliceIndex: number, segment: HoverSegment, event: PointerEvent<SVGElement>) => {
    setHoverTarget({ sliceIndex, segment });
    updateTooltipPosition(event);
  };
  const clearHoveredTarget = () => {
    setHoverTarget(null);
    setHoverTooltipPosition(null);
  };
  const tooltipText = hoverTarget?.segment === "actual"
    ? "Estimated yearly wind production in sector: 12.345 kWh"
    : "Potential yearly local wind production in sector: 21.098 kWh";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div ref={containerRef} className="relative aspect-square w-[640px] max-h-[96%] max-w-[96%]">
        <svg
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          className="pointer-events-auto h-full w-full"
          role="img"
          aria-label="Wind rose overlay"
        >
          {actual.map((actualValue, index) => {
            const potentialValue = potential[index];
            const start = startOffset + index * sectorStep + sectorGap / 2;
            const end = startOffset + (index + 1) * sectorStep - sectorGap / 2;
            const potentialRadius = INNER_RADIUS + (potentialValue / maxPotential) * ringRange;
            const efficiency = potentialValue > 0 ? Math.max(0, Math.min(1, actualValue / potentialValue)) : 0;
            const actualRadius = INNER_RADIUS + (potentialRadius - INNER_RADIUS) * efficiency;
            const actualVisualRadius = Math.max(INNER_RADIUS, actualRadius - SEGMENT_GAP_PX);
            const potentialSectorPath = describeSectorPath(center, center, INNER_RADIUS, potentialRadius, start, end);
            const actualSectorPath = describeSectorPath(center, center, INNER_RADIUS, actualVisualRadius, start, end);
            const exposedSectorPath = describeSectorPath(center, center, actualRadius, potentialRadius, start, end);
            const actualClipId = `overlay-actual-stroke-clip-${index}`;
            const exposedClipId = `overlay-exposed-stroke-clip-${index}`;
            const isActualHovered = hoverTarget?.sliceIndex === index && hoverTarget.segment === "actual";
            const isPotentialHovered = hoverTarget?.sliceIndex === index && hoverTarget.segment === "potential";

            return (
              <g key={`overlay-wind-rose-${index}`}>
                <defs>
                  <clipPath id={actualClipId} clipPathUnits="userSpaceOnUse">
                    <path d={actualSectorPath} />
                  </clipPath>
                  <clipPath id={exposedClipId} clipPathUnits="userSpaceOnUse">
                    <path d={exposedSectorPath} />
                  </clipPath>
                </defs>
                <g
                  style={{
                    filter: isPotentialHovered ? "drop-shadow(0 1px 2px rgba(0,0,0,0.32))" : "none",
                    transition: "filter 90ms linear"
                  }}
                >
                  <path
                    d={potentialSectorPath}
                    fill="#ffffff"
                    fillOpacity={isPotentialHovered ? 0.3 : 0.2}
                  />
                  <path
                    d={describeExposedOutlinePath(center, center, actualRadius, potentialRadius, start, end)}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={0.8}
                    strokeWidth={1.5}
                    clipPath={`url(#${exposedClipId})`}
                  />
                  {exposedSectorPath ? (
                    <path
                      d={exposedSectorPath}
                      fill="rgba(0,0,0,0.001)"
                      onPointerEnter={(event) => setHoveredTarget(index, "potential", event)}
                      onPointerMove={updateTooltipPosition}
                      onPointerLeave={clearHoveredTarget}
                      style={{ cursor: "pointer" }}
                    />
                  ) : null}
                </g>
                <g
                  style={{
                    filter: isActualHovered
                      ? `drop-shadow(0 0 4px ${efficiencyGlowColor(efficiency, 0.45)}) drop-shadow(0 0 8px ${efficiencyGlowColor(efficiency, 0.28)})`
                      : "none",
                    transition: "filter 90ms linear"
                  }}
                >
                  <path
                    d={actualSectorPath}
                    fill={efficiencyColor(efficiency)}
                    fillOpacity={isActualHovered ? 0.82 : 0.7}
                  />
                  {isActualHovered ? (
                    <path
                      d={actualSectorPath}
                      fill="none"
                      stroke={efficiencyHighlightColor(efficiency)}
                      strokeOpacity={1}
                      strokeWidth={2.8}
                      strokeLinejoin="round"
                      clipPath={`url(#${actualClipId})`}
                    />
                  ) : null}
                  <path
                    d={actualSectorPath}
                    fill="rgba(0,0,0,0.001)"
                    onPointerEnter={(event) => setHoveredTarget(index, "actual", event)}
                    onPointerMove={updateTooltipPosition}
                    onPointerLeave={clearHoveredTarget}
                    style={{ cursor: "pointer" }}
                  />
                </g>
                {isPotentialHovered ? (
                  <path
                    d={potentialSectorPath}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={1}
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
        {hoverTarget && hoverTooltipPosition ? (
          <div
            className="pointer-events-none absolute z-30 rounded-[2px] bg-white/95 px-2 py-1 text-[11px] leading-tight text-[#2A2A2A] shadow-[0_1px_4px_rgba(0,0,0,0.2)]"
            style={{
              left: hoverTooltipPosition.x,
              top: hoverTooltipPosition.y,
              transform: "translate(8px, -8px)"
            }}
          >
            <p>{tooltipText}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolveSliceCount(actualValues: number[], potentialValues: number[] | null): number {
  const potentialLength = potentialValues ? potentialValues.length : 0;
  const largest = Math.max(actualValues.length, potentialLength);
  return Math.max(8, Math.min(36, largest));
}

function sampleValues(values: number[], targetCount: number): number[] {
  if (values.length === 0) {
    return Array.from({ length: targetCount }, () => 0);
  }

  if (values.length === targetCount) {
    return values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  }

  return Array.from({ length: targetCount }, (_, index) => {
    const sourceIndex = Math.floor((index / targetCount) * values.length);
    const source = values[Math.max(0, Math.min(values.length - 1, sourceIndex))];
    return Number.isFinite(source) && source > 0 ? source : 0;
  });
}

function describeSectorPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  if (outerRadius <= innerRadius || endAngle <= startAngle) {
    return "";
  }

  const x1 = cx + Math.cos(startAngle) * outerRadius;
  const y1 = cy + Math.sin(startAngle) * outerRadius;
  const x2 = cx + Math.cos(endAngle) * outerRadius;
  const y2 = cy + Math.sin(endAngle) * outerRadius;
  const x3 = cx + Math.cos(endAngle) * innerRadius;
  const y3 = cy + Math.sin(endAngle) * innerRadius;
  const x4 = cx + Math.cos(startAngle) * innerRadius;
  const y4 = cy + Math.sin(startAngle) * innerRadius;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z"
  ].join(" ");
}

function describeExposedOutlinePath(
  cx: number,
  cy: number,
  actualRadius: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  if (radius <= 0 || endAngle <= startAngle || radius <= actualRadius) {
    return "";
  }

  const potentialStartX = cx + Math.cos(startAngle) * radius;
  const potentialStartY = cy + Math.sin(startAngle) * radius;
  const potentialEndX = cx + Math.cos(endAngle) * radius;
  const potentialEndY = cy + Math.sin(endAngle) * radius;
  const actualStartX = cx + Math.cos(startAngle) * actualRadius;
  const actualStartY = cy + Math.sin(startAngle) * actualRadius;
  const actualEndX = cx + Math.cos(endAngle) * actualRadius;
  const actualEndY = cy + Math.sin(endAngle) * actualRadius;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${potentialStartX} ${potentialStartY}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${potentialEndX} ${potentialEndY}`,
    `M ${actualEndX} ${actualEndY}`,
    `L ${potentialEndX} ${potentialEndY}`,
    `M ${actualStartX} ${actualStartY}`,
    `L ${potentialStartX} ${potentialStartY}`
  ].join(" ");
}

function efficiencyColor(efficiency: number): string {
  const { r, g, b } = efficiencyColorRgb(efficiency);
  return `rgb(${r}, ${g}, ${b})`;
}

function efficiencyHighlightColor(efficiency: number): string {
  const { r, g, b } = efficiencyColorRgb(efficiency);
  const mixWithWhite = 0.45;
  const highlightR = Math.round(r + (255 - r) * mixWithWhite);
  const highlightG = Math.round(g + (255 - g) * mixWithWhite);
  const highlightB = Math.round(b + (255 - b) * mixWithWhite);
  return `rgb(${highlightR}, ${highlightG}, ${highlightB})`;
}

function efficiencyGlowColor(efficiency: number, alpha: number): string {
  const { r, g, b } = efficiencyColorRgb(efficiency);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function efficiencyColorRgb(efficiency: number): { r: number; g: number; b: number } {
  if (efficiency <= 0.2) {
    return { r: 248, g: 113, b: 113 };
  }

  if (efficiency >= 0.85) {
    return { r: 34, g: 197, b: 94 };
  }

  const t = (efficiency - 0.2) / 0.65;

  if (t <= 0.5) {
    const p = t / 0.5;
    const red = Math.round(248 + (251 - 248) * p);
    const green = Math.round(113 + (191 - 113) * p);
    return { r: red, g: green, b: 0 };
  }

  const p = (t - 0.5) / 0.5;
  const red = Math.round(251 + (34 - 251) * p);
  const green = Math.round(191 + (197 - 191) * p);
  return { r: red, g: green, b: 0 };
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}
