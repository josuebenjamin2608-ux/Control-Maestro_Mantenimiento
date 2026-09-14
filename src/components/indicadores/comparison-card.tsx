import { cn } from "@/lib/utils";
import type { PeriodSnapshot } from "@/server/services/indicators.service";

function ComparisonRow({
  label,
  current,
  previous,
}: {
  label: string;
  current: number;
  previous: number;
}) {
  const diff = current - previous;
  const percentage = previous > 0 ? (diff / previous) * 100 : null;
  const isUp = diff > 0;
  const isDown = diff < 0;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {previous} → {current}
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

/** Compara el período actual contra el anterior; sin % cuando el anterior es 0 (evita inventar una variación). */
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
      <ComparisonRow label="Solicitudes" current={current.stats.total} previous={previous.stats.total} />
      <ComparisonRow
        label="Atendidas"
        current={current.stats.atendidas}
        previous={previous.stats.atendidas}
      />
      <ComparisonRow
        label="Pendientes"
        current={current.stats.pendientes}
        previous={previous.stats.pendientes}
      />
      <ComparisonRow
        label="Tareas cerradas"
        current={current.closedTasks}
        previous={previous.closedTasks}
      />
    </div>
  );
}
