import { Trophy } from "lucide-react";

import type { MachinePeriodItem } from "@/server/services/indicators.service";

/** Máquina #1 destacada + resto del Top 10 como barras horizontales proporcionales. */
export function MachineHighlights({ items }: { items: MachinePeriodItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin solicitudes en este período.</p>;
  }

  const [top, ...rest] = items;
  const max = top.count;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3">
        <Trophy className="size-5 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{top.maquina}</span>
          <span className="text-xs text-muted-foreground">
            {top.count} solicitud{top.count === 1 ? "" : "es"} · {top.percentage.toFixed(1)}% del total
          </span>
        </div>
      </div>

      {rest.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rest.map((item, index) => (
            <div key={item.maquina} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">{index + 2}</span>
              <span
                className="w-24 shrink-0 truncate text-xs text-foreground sm:w-40"
                title={item.maquina}
              >
                {item.maquina}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${max > 0 ? (item.count / max) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-medium text-foreground">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
