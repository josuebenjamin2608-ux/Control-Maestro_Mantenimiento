import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { HistoricalBadge, OutcomeBadge } from "@/components/imports/outcome-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMaintenanceRequestByParte } from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value?.trim() ? value : "—"}</span>
    </div>
  );
}

export default async function SolicitudDetailPage({
  params,
}: {
  params: Promise<{ parte: string }>;
}) {
  const { parte } = await params;
  const request = await getMaintenanceRequestByParte(decodeURIComponent(parte));

  if (!request) {
    notFound();
  }

  return (
    <AppShell title={`Solicitud ${request.parte}`}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Link
          href="/solicitudes"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a Solicitudes
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg text-foreground">PARTE {request.parte}</CardTitle>
              <HistoricalBadge isHistorical={request.isHistorical} />
            </div>
            <CardDescription>Información de la solicitud tal como fue importada.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Código máquina" value={request.codigo} />
              <Field label="Máquina" value={request.maquina} />
              <Field label="Pieza" value={request.pieza} />
              <Field label="Estado" value={request.estado} />
              <Field
                label="Fecha"
                value={request.fecha ? dateFormatter.format(request.fecha) : null}
              />
              <Field label="Código empleado" value={request.codemple} />
              <Field label="Empleado" value={request.empleado} />
              <Field label="Problema" value={request.problema} />
              <Field label="Tarea" value={request.tarea} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Historial de minutas</CardTitle>
            <CardDescription>
              {request.logs.length} minuta{request.logs.length === 1 ? "" : "s"} relacionada
              {request.logs.length === 1 ? "" : "s"}, en orden cronológico.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {request.logs.length === 0 ? (
              <p className="px-5 text-sm text-muted-foreground">
                Todavía no hay minutas relacionadas con esta solicitud.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>REGISTRO</TableHead>
                      <TableHead>Fecha inicio</TableHead>
                      <TableHead>Técnico</TableHead>
                      <TableHead>Código técnico</TableHead>
                      <TableHead>Fecha fin</TableHead>
                      <TableHead>Hora inicio</TableHead>
                      <TableHead>Hora fin</TableHead>
                      <TableHead>Minutos</TableHead>
                      <TableHead>Operación</TableHead>
                      <TableHead>Observación</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Relación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {request.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.registro}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {log.fechaini ? dateFormatter.format(log.fechaini) : "—"}
                        </TableCell>
                        <TableCell>{log.empleado ?? "—"}</TableCell>
                        <TableCell>{log.codemp ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {log.fechafin ? dateFormatter.format(log.fechafin) : "—"}
                        </TableCell>
                        <TableCell>{log.horaini ?? "—"}</TableCell>
                        <TableCell>{log.horafin ?? "—"}</TableCell>
                        <TableCell>{log.minutos ?? "—"}</TableCell>
                        <TableCell>{log.operacion ?? "—"}</TableCell>
                        <TableCell className="max-w-48 truncate" title={log.observaciones ?? undefined}>
                          {log.observaciones ?? "—"}
                        </TableCell>
                        <TableCell>
                          <HistoricalBadge isHistorical={log.isHistorical} />
                        </TableCell>
                        <TableCell>
                          <OutcomeBadge outcome={log.relationStatus} historical={log.isHistorical} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
