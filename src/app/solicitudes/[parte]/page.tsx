import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

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
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Código máquina" value={request.codigo} />
              <Field label="Máquina" value={request.maquina} />
              <Field label="Pieza" value={request.pieza} />
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
            <MinutaTimeline logs={request.logs} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
