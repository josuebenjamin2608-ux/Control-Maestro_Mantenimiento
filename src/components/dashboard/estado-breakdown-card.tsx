import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ESTADO_BUCKET_LABELS } from "@/lib/estado";

export interface EstadoBreakdownValues {
  /** Todos independientes de FECHA (ver getOpenBucketCounts), salvo `atendidas`. */
  pendientes: number;
  espera: number;
  programadas: number;
  /** Única fila que sí depende del período: cuántas se completaron ESE mes. */
  atendidas: number;
  otros: number;
}

const ROWS: { key: keyof EstadoBreakdownValues; label: string; dotClass: string }[] = [
  { key: "pendientes", label: ESTADO_BUCKET_LABELS.pendiente, dotClass: "bg-destructive" },
  { key: "espera", label: ESTADO_BUCKET_LABELS.espera, dotClass: "bg-warning" },
  { key: "programadas", label: ESTADO_BUCKET_LABELS.programada, dotClass: "bg-primary" },
  { key: "atendidas", label: ESTADO_BUCKET_LABELS.atendida, dotClass: "bg-success" },
  { key: "otros", label: ESTADO_BUCKET_LABELS.otro, dotClass: "bg-muted-foreground" },
];

/** Reutiliza los conteos ya calculados para los KPIs del Dashboard — sin nueva consulta. */
export function EstadoBreakdownCard({ stats }: { stats: EstadoBreakdownValues }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Solicitudes por estado</CardTitle>
        <CardDescription className="text-xs">
          Abiertas: todas las fechas · Atendidas: del mes seleccionado.
        </CardDescription>
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
