"use client";

import type { MonthPoint } from "@/server/services/indicators.service";
import { useIndicatorModal } from "./indicator-modal-context";

const SHORT_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Barras verticales Enero-Diciembre del año seleccionado; el mes
 * actualmente filtrado se resalta. Meses sin solicitudes reales muestran 0
 * — nunca se inventa un valor para un mes sin datos (incluidos los futuros).
 * Cada barra abre el detalle de Solicitudes de ESE mes (no necesariamente
 * el mes seleccionado en /indicadores — ver `periodOverride`).
 */
export function YearMonthlyChart({
  data,
  year,
  highlightMonth,
}: {
  data: MonthPoint[];
  year: number;
  highlightMonth: number;
}) {
  const { openIndicator } = useIndicatorModal();
  const max = Math.max(...data.map((point) => point.count), 1);
  const width = 720;
  const height = 180;
  const chartHeight = height - 26;
  const barGap = 8;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  function openMonth(month: number) {
    openIndicator({
      title: `Solicitudes de ${MONTH_NAMES[month - 1]} ${year}`,
      query: { indicator: "solicitudes" },
      periodOverride: { year, month },
    });
  }

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
          <g
            key={point.month}
            onClick={() => openMonth(point.month)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMonth(point.month);
              }
            }}
            role="button"
            tabIndex={0}
            className="cursor-pointer outline-none focus-visible:opacity-80"
          >
            <title>{`${point.label}: ${point.count} solicitud${point.count === 1 ? "" : "es"} — clic para ver el detalle`}</title>
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
