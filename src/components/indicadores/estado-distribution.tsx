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

/** Barra apilada de proporción + leyenda con porcentajes reales (mismo DashboardStats que los KPI). */
export function EstadoDistribution({ stats }: { stats: DashboardStats }) {
  if (stats.total === 0) {
    return <p className="text-sm text-muted-foreground">Sin solicitudes registradas.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {ORDER.map((bucket) => {
          const value = getBucketStatValue(stats, bucket);
          if (value === 0) return null;
          return (
            <div
              key={bucket}
              className={`h-full ${COLOR_CLASS[bucket]}`}
              style={{ width: `${(value / stats.total) * 100}%` }}
              title={`${ESTADO_BUCKET_LABELS[bucket]}: ${value}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ORDER.map((bucket) => {
          const value = getBucketStatValue(stats, bucket);
          if (value === 0) return null;
          const percentage = Math.round((value / stats.total) * 100);
          return (
            <div key={bucket} className="flex items-center gap-2 text-sm">
              <span className={`size-2 shrink-0 rounded-full ${COLOR_CLASS[bucket]}`} />
              <span className="text-muted-foreground">{ESTADO_BUCKET_LABELS[bucket]}</span>
              <span className="ml-auto font-medium text-foreground">
                {value} · {percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
