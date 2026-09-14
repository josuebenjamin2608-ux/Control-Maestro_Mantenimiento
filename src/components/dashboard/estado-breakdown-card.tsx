import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ESTADO_BUCKET_LABELS } from "@/lib/estado";
import type { DashboardStats } from "@/server/services/maintenance-requests.service";

const ROWS: { key: keyof Omit<DashboardStats, "total">; label: string; dotClass: string }[] = [
  { key: "pendientes", label: ESTADO_BUCKET_LABELS.pendiente, dotClass: "bg-destructive" },
  { key: "espera", label: ESTADO_BUCKET_LABELS.espera, dotClass: "bg-warning" },
  { key: "programadas", label: ESTADO_BUCKET_LABELS.programada, dotClass: "bg-primary" },
  { key: "atendidas", label: ESTADO_BUCKET_LABELS.atendida, dotClass: "bg-success" },
  { key: "otros", label: ESTADO_BUCKET_LABELS.otro, dotClass: "bg-muted-foreground" },
];

/** Reutiliza el mismo DashboardStats ya calculado para los KPIs — sin nueva consulta. */
export function EstadoBreakdownCard({ stats }: { stats: DashboardStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Solicitudes por estado</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const value = stats[row.key];
          if (row.key === "otros" && value === 0) return null;
          return (
            <div key={row.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className={`size-2 rounded-full ${row.dotClass}`} />
                {row.label}
              </span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
