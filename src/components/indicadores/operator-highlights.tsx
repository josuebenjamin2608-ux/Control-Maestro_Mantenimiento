"use client";

import { Trophy } from "lucide-react";

import type { OperatorPeriodItem } from "@/server/services/indicators.service";
import { useIndicatorModal } from "./indicator-modal-context";

/**
 * Reconstruye el filtro exacto de getIndicatorRequests para este grupo:
 * por CODEMPLE cuando existe, si no por EMPLEADO (comparado normalizado), y
 * si ninguno existe, el grupo "Sin definir" — misma prioridad que
 * getOperatorDistributionForPeriod, para que ranking y modal coincidan.
 */
function operatorDescriptor(item: OperatorPeriodItem) {
  const title = `Operario — ${item.label}`;
  if (item.codemple) {
    return { title, query: { indicator: "operario" as const, codemple: item.codemple } };
  }
  if (item.empleado) {
    return { title, query: { indicator: "operario" as const, empleado: item.empleado } };
  }
  return { title, query: { indicator: "operario" as const, operarioSinDefinir: true } };
}

/** Operario #1 destacado + resto del Top 10 como barras horizontales proporcionales. Cada uno abre sus solicitudes del período. */
export function OperatorHighlights({ items }: { items: OperatorPeriodItem[] }) {
  const { openIndicator } = useIndicatorModal();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin solicitudes en este período.</p>;
  }

  const [top, ...rest] = items;
  const max = top.count;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => openIndicator(operatorDescriptor(top))}
        className="flex w-full items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-left cursor-pointer transition-colors hover:border-warning/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trophy className="size-5 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{top.label}</span>
          <span className="text-xs text-muted-foreground">
            {top.count} solicitud{top.count === 1 ? "" : "es"} · {top.percentage.toFixed(1)}% del total
          </span>
        </div>
      </button>

      {rest.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rest.map((item, index) => (
            <button
              key={item.codemple ?? item.empleado ?? item.label}
              type="button"
              onClick={() => openIndicator(operatorDescriptor(item))}
              className="flex w-full items-center gap-3 rounded-md py-0.5 text-left cursor-pointer transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">{index + 2}</span>
              <span className="w-24 shrink-0 truncate text-xs text-foreground sm:w-40" title={item.label}>
                {item.label}
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
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
