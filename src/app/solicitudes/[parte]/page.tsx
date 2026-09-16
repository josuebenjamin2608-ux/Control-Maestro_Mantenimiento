import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { HistoricalBadge } from "@/components/imports/outcome-badge";
import { EstadoBadge } from "@/components/solicitudes/estado-badge";
import { MinutaTimeline } from "@/components/solicitudes/minuta-timeline";
import { ResponsibleAreaSelect } from "@/components/solicitudes/responsible-area-select";
import { TechnicianAssignment } from "@/components/solicitudes/technician-assignment";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getMaintenanceRequestByParte,
  listTechnicians,
} from "@/server/services/maintenance-requests.service";
import { formatCalendarDate } from "@/lib/dates";
import { sanitizeInternalPath } from "@/lib/safe-url";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

/** Etiqueta contextual según el origen real (?back=...), nunca window.history. */
function backLinkLabel(back: string | null): string {
  if (!back || back.startsWith("/solicitudes")) return "Volver a Solicitudes";
  if (back === "/" || back.startsWith("/?")) return "Volver al Panel de control";
  if (back.startsWith("/indicadores")) return "Volver a Indicadores";
  return "Volver";
}

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
  searchParams,
}: {
  params: Promise<{ parte: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { parte } = await params;
  const { back } = await searchParams;
  const [request, technicians] = await Promise.all([
    getMaintenanceRequestByParte(decodeURIComponent(parte)),
    listTechnicians(),
  ]);

  if (!request) {
    notFound();
  }

  const backHref = sanitizeInternalPath(back) ?? "/solicitudes";

  return (
    <AppShell title={`Solicitud ${request.parte}`}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLinkLabel(sanitizeInternalPath(back))}
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
                <Field label="Fecha de solicitud" value={formatCalendarDate(request.fecha)} />
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
              <Building2 className="size-4 text-muted-foreground" />
              Responsable
            </CardTitle>
            <CardDescription>
              Área responsable de gestionar esta solicitud (independiente del técnico asignado).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsibleAreaSelect
              maintenanceRequestId={request.id}
              value={request.responsibleArea}
            />
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
            <TechnicianAssignment
              maintenanceRequestId={request.id}
              assignments={request.assignedTechnicians}
              allTechnicians={technicians}
            />
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
