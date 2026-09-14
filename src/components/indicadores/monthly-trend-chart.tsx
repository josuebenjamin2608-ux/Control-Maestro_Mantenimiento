import type { MonthlyRequestCount } from "@/server/services/maintenance-requests.service";

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Barras verticales delgadas, un solo tono (magnitud a lo largo del
 * tiempo), etiquetas directas solo en el mes con más solicitudes y en el
 * más reciente (nunca un número en cada barra). `<title>` por barra da un
 * tooltip nativo accesible al pasar el mouse.
 */
export function MonthlyTrendChart({ data }: { data: MonthlyRequestCount[] }) {
  if (data.every((point) => point.count === 0)) {
    return <p className="text-sm text-muted-foreground">Sin solicitudes en este período.</p>;
  }

  const max = Math.max(...data.map((point) => point.count), 1);
  const width = 640;
  const height = 160;
  const chartHeight = height - 24;
  const barGap = 6;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;
  const maxIndex = data.reduce((best, point, index) => (point.count > data[best].count ? index : best), 0);
  const lastIndex = data.length - 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-40 w-full"
      role="img"
      aria-label="Evolución mensual de solicitudes"
    >
      {data.map((point, index) => {
        const barHeight = (point.count / max) * (chartHeight - 20);
        const x = index * (barWidth + barGap);
        const y = chartHeight - barHeight;
        const showLabel = point.count > 0 && (index === maxIndex || index === lastIndex);
        const [, monthNum] = point.month.split("-");
        const label = MONTH_LABELS[Number(monthNum) - 1] ?? point.month;

        return (
          <g key={point.month}>
            <title>{`${label}: ${point.count} solicitud${point.count === 1 ? "" : "es"}`}</title>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx={2}
              className="fill-primary"
            />
            {showLabel ? (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-foreground text-[9px] font-medium"
              >
                {point.count}
              </text>
            ) : null}
            <text
              x={x + barWidth / 2}
              y={chartHeight + 14}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px]"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
