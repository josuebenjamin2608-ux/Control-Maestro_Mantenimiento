import { Card, CardContent } from "@/components/ui/card";

/**
 * "Indicadores de mantenimiento" (punto 9): estructura visual reservada
 * para MTTR/MTBF. Deliberadamente sin calcular todavía — el sistema no
 * registra hoy un tiempo de inicio/fin de reparación por solicitud (ver
 * misma limitación que "Cumplimiento de compromisos") ni un intervalo real
 * entre fallas por máquina, así que no hay una fórmula correcta que definir
 * con los datos actuales. Nunca se inventa un valor.
 */
export function MaintenanceIndicatorsSection() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardContent className="flex flex-col gap-1 px-4 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">MTTR</span>
          <span className="text-2xl font-semibold text-muted-foreground">--</span>
          <span className="text-xs text-muted-foreground">
            Tiempo medio de reparación — pendiente de definir con datos disponibles.
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1 px-4 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">MTBF</span>
          <span className="text-2xl font-semibold text-muted-foreground">--</span>
          <span className="text-xs text-muted-foreground">
            Tiempo medio entre fallas — pendiente de definir con datos disponibles.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
