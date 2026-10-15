import type { MonthPoint } from "@/server/admin/metrics";

/**
 * Single-series monthly bar chart (server-rendered SVG): one hue (no legend — the title names the
 * series), recessive grid, 4px rounded bar tops on a shared baseline, native per-bar tooltips and a
 * table view for screen readers and exact values.
 */
export function BarChart({
  title,
  points,
  format,
  monthLabel,
  tableLabel,
  testId,
}: {
  title: string;
  points: MonthPoint[];
  format: (value: number) => string;
  monthLabel: (month: string) => string;
  tableLabel: string;
  testId?: string;
}) {
  const width = 600;
  const height = 180;
  const left = 56;
  const bottom = 24;
  const top = 8;
  const plotWidth = width - left - 8;
  const plotHeight = height - top - bottom;
  const max = Math.max(...points.map((p) => p.value), 1);
  const band = plotWidth / points.length;
  const barWidth = Math.max(4, band * 0.62);
  const radius = 4;

  return (
    <figure className="grid gap-2" data-testid={testId}>
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}>
        {[0, 0.5, 1].map((ratio) => {
          const y = top + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={left} x2={width - 8} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
              <text x={left - 6} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {format(Math.round(max * ratio))}
              </text>
            </g>
          );
        })}
        {points.map((point, i) => {
          const h = (point.value / max) * plotHeight;
          const x = left + i * band + (band - barWidth) / 2;
          const y = top + plotHeight - h;
          const r = Math.min(radius, h, barWidth / 2);
          const d =
            h <= 0
              ? ""
              : `M${x},${top + plotHeight} V${y + r} Q${x},${y} ${x + r},${y} H${x + barWidth - r} Q${x + barWidth},${y} ${x + barWidth},${y + r} V${top + plotHeight} Z`;
          return (
            <g key={point.month}>
              {/* Hit target taller and wider than the bar, for the tooltip. */}
              <rect x={left + i * band} y={top} width={band} height={plotHeight} fill="transparent">
                <title>{`${monthLabel(point.month)}: ${format(point.value)}`}</title>
              </rect>
              {d && (
                <path d={d} className="pointer-events-none fill-[#2a78d6] dark:fill-[#3987e5]">
                  <title>{`${monthLabel(point.month)}: ${format(point.value)}`}</title>
                </path>
              )}
              <text
                x={left + i * band + band / 2}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {monthLabel(point.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">{tableLabel}</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {points.map((point) => (
              <tr key={point.month} className="border-t">
                <td className="py-1">{point.month}</td>
                <td className="py-1 text-right">{format(point.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
