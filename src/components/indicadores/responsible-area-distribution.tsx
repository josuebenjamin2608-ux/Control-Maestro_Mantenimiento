"use client";

import {
  RESPONSIBLE_AREA_LABELS,
  RESPONSIBLE_AREA_UNDEFINED_LABEL,
  RESPONSIBLE_AREA_UNDEFINED_VALUE,
} from "@/lib/responsible-area";
import type { ResponsibleAreaPeriodBreakdown } from "@/server/services/indicators.service";
import { useIndicatorModal } from "./indicator-modal-context";

const ROWS: {
  key: keyof ResponsibleAreaPeriodBreakdown;
  label: string;
  colorClass: string;
  responsable: string;
}[] = [
  {
    key: "mantenimiento",
    label: RESPONSIBLE_AREA_LABELS.MANTENIMIENTO,
    colorClass: "bg-primary",
    responsable: "MANTENIMIENTO",
  },
  {
    key: "produccion",
    label: RESPONSIBLE_AREA_LABELS.PRODUCCION,
    colorClass: "bg-warning",
    responsable: "PRODUCCION",
  },
  {
    key: "sinDefinir",
    label: RESPONSIBLE_AREA_UNDEFINED_LABEL,
    colorClass: "bg-muted-foreground",
    responsable: RESPONSIBLE_AREA_UNDEFINED_VALUE,
  },
];

/** Barras horizontales compactas por área responsable, con cantidad y % del período. Cada una abre el detalle de esas solicitudes. */
export function ResponsibleAreaDistribution({ breakdown }: { breakdown: ResponsibleAreaPeriodBreakdown }) {
  const { openIndicator } = useIndicatorModal();
  const total = breakdown.mantenimiento + breakdown.produccion + breakdown.sinDefinir;

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Sin solicitudes en este período.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {ROWS.map((row) => {
        const value = breakdown[row.key];
        if (value === 0) return null;
        const percentage = Math.round((value / total) * 100);
        return (
          <button
            key={row.key}
            type="button"
            onClick={() =>
              openIndicator({
                title: `Responsable — ${row.label}`,
                query: { indicator: "responsable", responsable: row.responsable },
              })
            }
            className="flex w-full items-center gap-3 rounded-md py-0.5 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-28 shrink-0 truncate text-xs text-muted-foreground sm:w-36">
              {row.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${row.colorClass}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-medium text-foreground">
              {value} · {percentage}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
