import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

interface MonthlyProductionChartProps {
  values: number[] | null;
  yearlyProductionKwh: number | null;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const Y_AXIS_TICK_COUNT = 4;
const MOBILE_Y_AXIS_COLUMN_WIDTH_PX = 72;
const MOBILE_CHART_GAP_PX = 8;
const MOBILE_LINE_TEXT_GAP_PX = 6;

export function MonthlyProductionChart({ values, yearlyProductionKwh }: MonthlyProductionChartProps) {
  const hasMonthlyData = Array.isArray(values) && values.length === 12;
  const normalizedValues = hasMonthlyData ? values : MONTH_LABELS.map(() => 0);
  const maxValue = Math.max(...normalizedValues, 0);
  const yAxisMax = resolveAxisMax(maxValue);
  const yAxisTicks = Array.from({ length: Y_AXIS_TICK_COUNT + 1 }, (_, index) => {
    const ratio = index / Y_AXIS_TICK_COUNT;
    return yAxisMax * (1 - ratio);
  });

  const yAxisLabelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [yAxisLabelWidths, setYAxisLabelWidths] = useState<number[]>(() =>
    Array.from({ length: Y_AXIS_TICK_COUNT + 1 }, () => 0)
  );

  useLayoutEffect(() => {
    const measureLabelWidths = () => {
      const nextWidths = yAxisTicks.map((_, index) => Math.ceil(yAxisLabelRefs.current[index]?.offsetWidth ?? 0));

      setYAxisLabelWidths((currentWidths) => {
        if (
          currentWidths.length === nextWidths.length
          && currentWidths.every((value, index) => value === nextWidths[index])
        ) {
          return currentWidths;
        }

        return nextWidths;
      });
    };

    measureLabelWidths();
    window.addEventListener("resize", measureLabelWidths);

    return () => {
      window.removeEventListener("resize", measureLabelWidths);
    };
  }, [yAxisTicks]);

  return (
    <article className="pl-3 pr-3 pb-10 pt-11 sm:pr-7">
      <header className="mb-12 ml-1 sm:ml-4">
        <p className="text-[13px] font-bold text-[#474747]">Yearly production</p>
        {yearlyProductionKwh === null ? (
          <p className="mt-2 text-sm font-semibold text-red-700" role="alert">
            Error: Yearly production was not returned by the API.
          </p>
        ) : (
          <h2 className="-ml-[3px] mt-1.5 text-[40px] font-light leading-none text-[#474747]">
            {formatYearlyProduction(yearlyProductionKwh)}
          </h2>
        )}
      </header>

      {!hasMonthlyData ? (
        <div className="ml-1 rounded-[2px] border border-red-200 bg-red-50 px-4 py-3 sm:ml-4">
          <p className="text-sm font-semibold text-red-700" role="alert">
            Error: Monthly production was not returned by the API.
          </p>
        </div>
      ) : (
        <div className="ml-1 grid grid-cols-[72px_minmax(0,1fr)] gap-2 sm:ml-0 sm:grid-cols-[62px_minmax(0,1fr)]">
          <div className="relative h-48">
            {yAxisTicks.map((tickValue, index) => {
              const ratio = index / Y_AXIS_TICK_COUNT;
              return (
                <div
                  key={`y-axis-label-${tickValue}`}
                  ref={(element) => {
                    yAxisLabelRefs.current[index] = element;
                  }}
                  className="absolute left-0 -translate-y-1/2 text-left text-[10px] font-medium text-[#474747] sm:left-auto sm:right-0 sm:text-right"
                  style={{ top: `${ratio * 100}%` }}
                >
                  {formatAxisKwh(tickValue)}
                </div>
              );
            })}
          </div>

          <div className="relative -ml-[4px] h-48 pl-2 pr-2 sm:ml-0">
            {yAxisTicks.map((tickValue, index) => {
              const ratio = index / Y_AXIS_TICK_COUNT;
              const mobileLineLeftPx = resolveMobileLineLeft(yAxisLabelWidths[index] ?? 0);
              const lineStyle: CSSProperties & Record<"--mobile-line-left", string> = {
                top: `${ratio * 100}%`,
                "--mobile-line-left": `${mobileLineLeftPx}px`
              };

              return (
                <div
                  key={`y-axis-line-${tickValue}`}
                  className={`pointer-events-none absolute left-[var(--mobile-line-left)] right-0 z-0 border-t sm:left-0 ${
                    index === Y_AXIS_TICK_COUNT
                      ? "border-solid border-[#DADADA]"
                      : "border-solid border-[#EAEAEA]"
                  }`}
                  style={lineStyle}
                  aria-hidden
                />
              );
            })}

            <div className="absolute inset-x-2 bottom-0 z-10 grid h-full grid-cols-12 items-end gap-1.5 sm:inset-x-0 sm:gap-2">
              {normalizedValues.map((value, index) => {
                const barHeight = Math.max(6, (value / yAxisMax) * 100);
                const tooltipValue = formatPreciseKwh(value);
                return (
                  <div key={MONTH_LABELS[index]} className="group relative flex h-full min-w-0 items-end justify-center">
                    <span
                      className="pointer-events-none absolute left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-[#CDCDCD] bg-white px-2 py-1 text-[12px] font-normal leading-tight text-[#2A2A2A] shadow-[0_1px_4px_rgba(0,0,0,0.15)] group-hover:block"
                      style={{ bottom: `calc(${barHeight}% + 6px)` }}
                      role="tooltip"
                    >
                      {tooltipValue} kWh
                    </span>
                    <div
                      className="w-full max-w-[27px] rounded-t-[2px] bg-[#22C55E] opacity-90 transition-opacity duration-150 group-hover:opacity-100"
                      style={{ height: `${barHeight}%` }}
                      title={`${MONTH_LABELS[index]}: ${tooltipValue} kWh`}
                      aria-label={`${MONTH_LABELS[index]} ${tooltipValue} kilowatt-hours`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div />
          <div className="-ml-[4px] grid grid-cols-12 gap-1.5 px-2 pt-2 sm:ml-0 sm:gap-2 sm:px-0">
            {MONTH_LABELS.map((month) => (
              <span
                key={month}
                className="text-center text-[10px] font-medium text-[#474747]"
              >
                {month}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function formatAxisKwh(value: number): string {
  const rounded = Math.round(value);
  const formatted = new Intl.NumberFormat("de-DE").format(rounded);
  return `${formatted} kWh`;
}

function resolveAxisMax(maxValue: number): number {
  if (maxValue <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const normalized = maxValue / magnitude;

  if (normalized <= 1) {
    return 1 * magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function formatYearlyProduction(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  const formatted = new Intl.NumberFormat("de-DE").format(rounded);
  return `${formatted} kWh`;
}

function formatPreciseKwh(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return "0";
  }

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

function resolveMobileLineLeft(labelWidth: number): number {
  const safeLabelWidth = Math.max(0, labelWidth);
  const desiredLeft = -1 * (MOBILE_Y_AXIS_COLUMN_WIDTH_PX + MOBILE_CHART_GAP_PX)
    + safeLabelWidth
    + MOBILE_LINE_TEXT_GAP_PX;

  return Math.min(-2, desiredLeft);
}
