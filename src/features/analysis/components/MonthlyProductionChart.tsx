interface MonthlyProductionChartProps {
  values: number[];
  yearlyProductionKwh: number;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const Y_AXIS_TICK_COUNT = 4;

export function MonthlyProductionChart({ values, yearlyProductionKwh }: MonthlyProductionChartProps) {
  const normalizedValues = values.length === 12 ? values : MONTH_LABELS.map(() => 0);
  const maxValue = Math.max(...normalizedValues, 0);
  const yAxisMax = resolveAxisMax(maxValue);
  const yAxisTicks = Array.from({ length: Y_AXIS_TICK_COUNT + 1 }, (_, index) => {
    const ratio = index / Y_AXIS_TICK_COUNT;
    return yAxisMax * (1 - ratio);
  });

  return (
    <article className="pl-3 pr-7 pb-10 pt-10">
      <header className="mb-12 ml-4">
        <p className="text-[13px] font-bold text-[#474747]">Yearly production</p>
        <h2 className="mt-1.5 text-[40px] font-light leading-none text-[#474747]">
          {formatYearlyProduction(yearlyProductionKwh)}
        </h2>
      </header>

      <div className="grid grid-cols-[62px_minmax(0,1fr)] gap-2">
        <div className="relative h-48">
          {yAxisTicks.map((tickValue, index) => {
            const ratio = index / Y_AXIS_TICK_COUNT;
            return (
              <div
                key={`y-axis-label-${tickValue}`}
                className="absolute right-0 -translate-y-1/2 text-[10px] font-medium text-[#474747]"
                style={{ top: `${ratio * 100}%` }}
              >
                {formatAxisKwh(tickValue)}
              </div>
            );
          })}
        </div>

        <div className="relative h-48 pl-2 pr-2">
          {yAxisTicks.map((tickValue, index) => {
            const ratio = index / Y_AXIS_TICK_COUNT;
            return (
              <div
                key={`y-axis-line-${tickValue}`}
                className={`pointer-events-none absolute left-0 right-0 border-t ${
                  index === Y_AXIS_TICK_COUNT
                    ? "border-solid border-[#DADADA]"
                    : "border-dashed border-[#EAEAEA]"
                }`}
                style={{ top: `${ratio * 100}%` }}
                aria-hidden
              />
            );
          })}

          <div className="absolute inset-x-0 bottom-0 grid h-full grid-cols-12 items-end gap-1.5 sm:gap-2">
            {normalizedValues.map((value, index) => {
              const barHeight = Math.max(6, (value / yAxisMax) * 100);
              return (
                <div key={MONTH_LABELS[index]} className="flex h-full min-w-0 items-end justify-center">
                  <div
                    className="w-full max-w-[27px] rounded-t-[2px] bg-[#22C55E]"
                    style={{ height: `${barHeight}%` }}
                    aria-label={`${MONTH_LABELS[index]} ${Math.round(value)} kilowatt-hours`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div />
        <div className="grid grid-cols-12 gap-1.5 pt-0.5 sm:gap-2">
          {MONTH_LABELS.map((month) => (
            <span key={month} className="text-center text-[10px] font-medium text-[#474747]">
              {month}
            </span>
          ))}
        </div>
      </div>
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
