"use client";

import { cn } from "@/lib/utils";
import { formatPeriodLabel, type Period } from "@/lib/period";
import type { GetIndicatorRequestsParams, PeriodSnapshot } from "@/server/services/indicators.service";
import { useIndicatorModal } from "./indicator-modal-context";

type IndicatorQuery = Omit<GetIndicatorRequestsParams, "year" | "month" | "take" | "skip">;

function ComparisonValue({
  value,
  label,
  period,
  query,
}: {
  value: number;
  label: string;
  period: Period;
  query: IndicatorQuery;
}) {
  const { openIndicator } = useIndicatorModal();
  return (
    <button
      type="button"
      onClick={() =>
        openIndicator({
          title: `${label} — ${formatPeriodLabel(period)}`,
          query,
          periodOverride: period,
        })
      }
      className="rounded px-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {value}
    </button>
  );
}

function ComparisonRow({
  label,
  current,
  previous,
  currentPeriod,
  previousPeriod,
  query,
}: {
  label: string;
  current: number;
  previous: number;
  currentPeriod: Period;
  previousPeriod: Period;
  query: IndicatorQuery;
}) {
  const diff = current - previous;
  const percentage = previous > 0 ? (diff / previous) * 100 : null;
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center gap-1">
          <ComparisonValue value={previous} label={label} period={previousPeriod} query={query} />
          <span className="text-muted-foreground">→</span>
          <ComparisonValue value={current} label={label} period={currentPeriod} query={query} />
        </span>
        <span
          className={cn(
            "font-medium",
            isUp && "text-success",
            isDown && "text-destructive",
            !isUp && !isDown && "text-muted-foreground",
          )}
        >
          {isUp ? "▲" : isDown ? "▼" : "–"} {diff > 0 ? "+" : ""}
          {diff}
          {percentage !== null ? ` / ${diff > 0 ? "+" : ""}${percentage.toFixed(1)}%` : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Compara el período actual contra el anterior; sin % cuando el anterior es
 * 0 (evita inventar una variación). Cada número (anterior y actual) abre el
 * detalle de esas solicitudes vía getIndicatorRequests con `periodOverride`
 * — misma fuente única de verdad, solo con el año/mes de esa columna.
 */
export function ComparisonCard({
  current,
  previous,
}: {
  current: PeriodSnapshot;
  previous: PeriodSnapshot;
}) {
  return (
    <div className="flex flex-col">
      <p className="mb-1 text-xs text-muted-foreground">
        {previous.label} → {current.label}
      </p>
      <ComparisonRow
        label="Solicitudes"
        current={current.stats.total}
        previous={previous.stats.total}
        currentPeriod={current.period}
        previousPeriod={previous.period}
        query={{ indicator: "solicitudes" }}
      />
      <ComparisonRow
        label="Atendidas"
        current={current.stats.atendidas}
        previous={previous.stats.atendidas}
        currentPeriod={current.period}
        previousPeriod={previous.period}
        query={{ indicator: "estado", bucket: "atendida" }}
      />
      <ComparisonRow
        label="Pendientes"
        current={current.stats.pendientes}
        previous={previous.stats.pendientes}
        currentPeriod={current.period}
        previousPeriod={previous.period}
        query={{ indicator: "estado", bucket: "pendiente" }}
      />
      <ComparisonRow
        label="Tareas cerradas"
        current={current.closedTasks}
        previous={previous.closedTasks}
        currentPeriod={current.period}
        previousPeriod={previous.period}
        query={{ indicator: "cerradas" }}
      />
    </div>
  );
}
