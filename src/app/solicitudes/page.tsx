import Link from "next/link";
import { Search } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { HistoricalBadge } from "@/components/imports/outcome-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listMaintenanceRequests } from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items, total } = await listMaintenanceRequests({ search: q });

  return (
    <AppShell title="Solicitudes">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">Registro de Solicitudes</h2>
          <p className="text-sm text-muted-foreground">
            {total} solicitud{total === 1 ? "" : "es"} registrada{total === 1 ? "" : "s"}.
          </p>
        </div>

        <form className="flex items-center gap-2" method="get">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar por PARTE, máquina o problema..."
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </form>

        <Card>
          <CardContent className="px-0">
            {items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No hay solicitudes que coincidan con la búsqueda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PARTE</TableHead>
                      <TableHead>Máquina</TableHead>
                      <TableHead>Problema</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Minutas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <Link
                            href={`/solicitudes/${encodeURIComponent(request.parte)}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {request.parte}
                          </Link>
                          <span className="ml-2">
                            <HistoricalBadge isHistorical={request.isHistorical} />
                          </span>
                        </TableCell>
                        <TableCell>{request.maquina ?? "—"}</TableCell>
                        <TableCell className="max-w-64 truncate" title={request.problema ?? undefined}>
                          {request.problema ?? "—"}
                        </TableCell>
                        <TableCell>{request.estado ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {request.fecha ? dateFormatter.format(request.fecha) : "—"}
                        </TableCell>
                        <TableCell>{request._count.logs}</TableCell>
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
