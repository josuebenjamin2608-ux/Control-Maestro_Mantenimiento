import type { MonthPoint } from "@/server/services/indicators.service";

const SHORT_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Barras verticales Enero-Diciembre del año seleccionado; el mes
 * actualmente filtrado se resalta. Meses sin solicitudes reales muestran 0
 * — nunca se inventa un valor para un mes sin datos (incluidos los futuros).
 */
export function YearMonthlyChart({
  data,
  highlightMonth,
}: {
  data: MonthPoint[];
  highlightMonth: number;
}) {
  const max = Math.max(...data.map((point) => point.count), 1);
  const width = 720;
  const height = 180;
  const chartHeight = height - 26;
  const barGap = 8;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-44 w-full"
      role="img"
      aria-label="Solicitudes por mes"
    >
      {data.map((point, index) => {
        const barHeight = (point.count / max) * (chartHeight - 20);
        const x = index * (barWidth + barGap);
        const y = chartHeight - barHeight;
        const isSelected = point.month === highlightMonth;

        return (
          <g key={point.month}>
            <title>{`${point.label}: ${point.count} solicitud${point.count === 1 ? "" : "es"}`}</title>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx={3}
              className={isSelected ? "fill-primary" : "fill-muted-foreground/40"}
            />
            {point.count > 0 ? (
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                className={
                  isSelected
                    ? "fill-foreground text-[10px] font-semibold"
                    : "fill-muted-foreground text-[9px]"
                }
              >
                {point.count}
              </text>
            ) : null}
            <text
              x={x + barWidth / 2}
              y={chartHeight + 14}
              textAnchor="middle"
              className={
                isSelected ? "fill-foreground text-[9px] font-medium" : "fill-muted-foreground text-[8px]"
              }
            >
              {SHORT_LABELS[point.month - 1]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
