import { ESTADO_BUCKET_LABELS, type EstadoBucket } from "@/lib/estado";
import { getBucketStatValue, type DashboardStats } from "@/server/services/maintenance-requests.service";

const ORDER: EstadoBucket[] = ["pendiente", "espera", "programada", "atendida", "otro"];

const COLOR_CLASS: Record<EstadoBucket, string> = {
  pendiente: "bg-destructive",
  espera: "bg-warning",
  programada: "bg-primary",
  atendida: "bg-success",
  otro: "bg-muted-foreground",
};

/** Barras horizontales compactas por categoría (una por bucket), con cantidad y %. */
export function EstadoDistribution({ stats }: { stats: DashboardStats }) {
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
          <div key={bucket} className="flex items-center gap-3">
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
          </div>
        );
      })}
    </div>
  );
}
