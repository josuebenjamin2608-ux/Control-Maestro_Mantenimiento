import Link from "next/link";
import { Search } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { RouteTabs } from "@/components/layout/route-tabs";
import { HistoricalBadge, OutcomeBadge } from "@/components/imports/outcome-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatParteDisplay } from "@/lib/parte";
import { listMaintenanceLogs } from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

const TABS = [
  { label: "Solicitudes", href: "/solicitudes", available: true },
  { label: "Minutas", href: "/minutas", available: true },
  { label: "Órdenes de trabajo", href: "/ordenes", available: false },
  { label: "Mantenimiento preventivo", href: "/preventivo", available: false },
];

export default async function MinutasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items, total } = await listMaintenanceLogs({ search: q, take: 50 });

  return (
    <AppShell title="Minutas">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">Registro de Minutas</h2>
          <p className="text-sm text-muted-foreground">
            {total} minuta{total === 1 ? "" : "s"} registrada{total === 1 ? "" : "s"}.
          </p>
        </div>

        <RouteTabs tabs={TABS} />

        <form className="flex items-center gap-2" method="get">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar por REGISTRO, máquina, empleado o PARTE..."
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </form>

        <Card>
          <CardContent className="px-0">
            {items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No hay minutas que coincidan con la búsqueda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>REGISTRO</TableHead>
                      <TableHead>Máquina</TableHead>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Fecha inicio</TableHead>
                      <TableHead>Fecha fin</TableHead>
                      <TableHead>Minutos</TableHead>
                      <TableHead>Solicitud</TableHead>
                      <TableHead>Relación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{log.registro}</span>
                            <HistoricalBadge isHistorical={log.isHistorical} />
                          </div>
                        </TableCell>
                        <TableCell>{log.maquina ?? "—"}</TableCell>
                        <TableCell>{log.empleado ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {log.fechaini ? dateFormatter.format(log.fechaini) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {log.fechafin ? dateFormatter.format(log.fechafin) : "—"}
                        </TableCell>
                        <TableCell>{log.minutos ?? "—"}</TableCell>
                        <TableCell>
                          {log.maintenanceRequest ? (
                            <Link
                              href={`/solicitudes/${encodeURIComponent(log.maintenanceRequest.parte)}`}
                              className="text-primary hover:underline"
                            >
                              {formatParteDisplay(log.maintenanceRequest.parte)}
                            </Link>
                          ) : (
                            "—"
                          )}
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
