"use client";

import { ESTADO_BUCKET_LABELS, getBucketStatValue, type DashboardStats, type EstadoBucket } from "@/lib/estado";
import { useIndicatorModal } from "./indicator-modal-context";

const ORDER: EstadoBucket[] = ["pendiente", "espera", "programada", "atendida", "otro"];

const COLOR_CLASS: Record<EstadoBucket, string> = {
  pendiente: "bg-destructive",
  espera: "bg-warning",
  programada: "bg-primary",
  atendida: "bg-success",
  otro: "bg-muted-foreground",
};

/** Barras horizontales compactas por categoría (una por bucket), con cantidad y %. Cada barra abre el detalle de esa categoría. */
export function EstadoDistribution({ stats }: { stats: DashboardStats }) {
  const { openIndicator } = useIndicatorModal();

  if (stats.total === 0) {
    return <p className="text-sm text-muted-foreground">Sin solicitudes en este período.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {ORDER.map((bucket) => {
        const value = getBucketStatValue(stats, bucket);
        if (value === 0) return null;
        const percentage = Math.round((value / stats.total) * 100);
        return (
          <button
            key={bucket}
            type="button"
            onClick={() =>
              openIndicator({
                title: ESTADO_BUCKET_LABELS[bucket],
                query: { indicator: "estado", bucket },
              })
            }
            className="flex w-full items-center gap-3 rounded-md py-0.5 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="w-28 shrink-0 truncate text-xs text-muted-foreground sm:w-36">
              {ESTADO_BUCKET_LABELS[bucket]}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${COLOR_CLASS[bucket]}`}
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
