import { AppShell } from "@/components/layout/app-shell";
import { RouteTabs } from "@/components/layout/route-tabs";
import { Pagination } from "@/components/solicitudes/pagination";
import { SolicitudesFilters } from "@/components/solicitudes/solicitudes-filters";
import { SolicitudesTable } from "@/components/solicitudes/solicitudes-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  getDistinctEstados,
  getDistinctMachines,
  listMaintenanceRequests,
} from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

const TAKE = 20;

const TABS = [
  { label: "Solicitudes", href: "/solicitudes", available: true },
  { label: "Minutas", href: "/minutas", available: true },
  { label: "Órdenes de trabajo", href: "/ordenes", available: false },
  { label: "Mantenimiento preventivo", href: "/preventivo", available: false },
];

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    maquina?: string;
    estado?: string;
    responsable?: string;
    skip?: string;
  }>;
}) {
  const { q, maquina, estado, responsable, skip: skipParam } = await searchParams;
  const skip = skipParam ? Math.max(0, Number(skipParam) || 0) : 0;

  const [{ items, total }, machines, estados] = await Promise.all([
    listMaintenanceRequests({ search: q, maquina, estado, responsable, take: TAKE, skip }),
    getDistinctMachines(),
    getDistinctEstados(),
  ]);

  const currentParams = new URLSearchParams();
  if (q) currentParams.set("q", q);
  if (maquina) currentParams.set("maquina", maquina);
  if (estado) currentParams.set("estado", estado);
  if (responsable) currentParams.set("responsable", responsable);
  if (skip) currentParams.set("skip", String(skip));
  const currentQs = currentParams.toString();
  const currentSolicitudesHref = currentQs ? `/solicitudes?${currentQs}` : "/solicitudes";

  return (
    <AppShell title="Solicitudes">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">Registro de Solicitudes</h2>
          <p className="text-sm text-muted-foreground">
            {total} solicitud{total === 1 ? "" : "es"} registrada{total === 1 ? "" : "s"}.
          </p>
        </div>

        <RouteTabs tabs={TABS} />

        <SolicitudesFilters
          q={q}
          maquina={maquina}
          estado={estado}
          responsable={responsable}
          machines={machines}
          estados={estados}
        />

        <Card>
          <CardContent className="px-0">
            <SolicitudesTable items={items} backHref={currentSolicitudesHref} />
            <Pagination
              basePath="/solicitudes"
              searchParams={{ q, maquina, estado, responsable }}
              total={total}
              take={TAKE}
              skip={skip}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
