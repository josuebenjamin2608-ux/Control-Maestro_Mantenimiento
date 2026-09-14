import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { HistoricalBadge } from "@/components/imports/outcome-badge";
import { EstadoBadge } from "@/components/solicitudes/estado-badge";
import { MinutaTimeline } from "@/components/solicitudes/minuta-timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/** Para Problema/Tarea: texto completo (nunca truncado), a diferencia de la tabla. */
function TextBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {value?.trim() ? value : "—"}
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
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
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg text-foreground">PARTE {request.parte}</CardTitle>
              <HistoricalBadge isHistorical={request.isHistorical} />
              <EstadoBadge estado={request.estado} />
            </div>
            <CardDescription>Información de la solicitud tal como fue importada.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <SectionLabel>Identificación</SectionLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="PARTE" value={request.parte} />
                <Field label="Máquina" value={request.maquina} />
                <Field label="Código de máquina" value={request.codigo} />
              </div>
            </div>

            <div>
              <SectionLabel>Solicitud</SectionLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label="Fecha de solicitud"
                  value={request.fecha ? dateFormatter.format(request.fecha) : null}
                />
                <Field label="Empleado solicitante" value={request.empleado} />
                <Field label="Código de empleado" value={request.codemple} />
              </div>
            </div>

            <div>
              <SectionLabel>Detalle del problema</SectionLabel>
              <div className="grid grid-cols-1 gap-4">
                <Field label="Pieza afectada" value={request.pieza} />
                <TextBlock label="Problema" value={request.problema} />
                <TextBlock label="Tarea" value={request.tarea} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <UserRound className="size-4 text-muted-foreground" />
              Técnico asignado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* No existe todavía una relación Técnico <-> Solicitud en el
                modelo de datos (Technician solo se vincula a MaintenanceOrder).
                Se muestra honestamente el estado sin asignación, sin inventar
                un técnico ni una relación que no existe. */}
            <p className="text-sm text-muted-foreground">
              Sin técnico asignado. La asignación de técnicos a Solicitudes se implementará en una
              fase posterior.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Seguimiento de mantenimiento</CardTitle>
            <CardDescription>
              {request.logs.length} minuta{request.logs.length === 1 ? "" : "s"} relacionada
              {request.logs.length === 1 ? "" : "s"}, en orden cronológico.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <MinutaTimeline logs={request.logs} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
