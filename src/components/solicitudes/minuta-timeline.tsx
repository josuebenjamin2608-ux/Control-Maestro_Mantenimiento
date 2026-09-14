import { HistoricalBadge, OutcomeBadge } from "@/components/imports/outcome-badge";
import type { getMaintenanceRequestByParte } from "@/server/services/maintenance-requests.service";

type MinutaLog = NonNullable<Awaited<ReturnType<typeof getMaintenanceRequestByParte>>>["logs"][number];

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export function MinutaTimeline({ logs }: { logs: MinutaLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted-foreground">
        Todavía no hay minutas relacionadas con esta solicitud.
      </p>
    );
  }

  return (
    <ol className="flex flex-col px-5 py-4">
      {logs.map((log, index) => (
        <li key={log.id} className="relative flex gap-4">
          <div className="flex flex-col items-center">
            <span className="mt-1.5 flex size-2.5 shrink-0 rounded-full bg-primary" />
            {index < logs.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
          </div>
          <div className="flex flex-1 flex-col gap-1.5 pb-6 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">REGISTRO {log.registro}</span>
              <HistoricalBadge isHistorical={log.isHistorical} />
              <OutcomeBadge outcome={log.relationStatus} historical={log.isHistorical} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                Inicio: {log.fechaini ? dateFormatter.format(log.fechaini) : "—"}
                {log.horaini ? ` · ${log.horaini}` : ""}
              </span>
              <span>
                Fin: {log.fechafin ? dateFormatter.format(log.fechafin) : "—"}
                {log.horafin ? ` · ${log.horafin}` : ""}
              </span>
              {log.minutos !== null ? <span>{log.minutos} min</span> : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-foreground">
              <span>
                {log.empleado ?? "—"}
                {log.codemp ? ` (${log.codemp})` : ""}
              </span>
              {log.operacion ? (
                <span className="text-muted-foreground">{log.operacion}</span>
              ) : null}
            </div>
            {log.observaciones ? (
              <p className="text-sm text-muted-foreground">{log.observaciones}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
