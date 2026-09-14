"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { HistoricalBadge } from "@/components/imports/outcome-badge";
import { EstadoBadge } from "@/components/solicitudes/estado-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daysSince } from "@/lib/estado";
import type { listMaintenanceRequests } from "@/server/services/maintenance-requests.service";

type SolicitudRow = Awaited<ReturnType<typeof listMaintenanceRequests>>["items"][number];

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

/**
 * `compact` omite Antigüedad y Minutas (usado en la vista previa embebida
 * del dashboard) para no duplicar la tabla completa de /solicitudes.
 */
export function SolicitudesTable({
  items,
  compact = false,
}: {
  items: SolicitudRow[];
  compact?: boolean;
}) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted-foreground">
        No hay solicitudes que coincidan con los filtros.
      </p>
    );
  }

  function goToDetail(parte: string) {
    router.push(`/solicitudes/${encodeURIComponent(parte)}`);
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PARTE</TableHead>
            <TableHead>Máquina</TableHead>
            <TableHead>Novedad</TableHead>
            <TableHead>Fecha</TableHead>
            {compact ? null : <TableHead>Antigüedad</TableHead>}
            <TableHead>Estado</TableHead>
            {compact ? null : <TableHead>Minutas</TableHead>}
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((request) => {
            const antiguedad = daysSince(request.fecha);
            return (
              <TableRow
                key={request.id}
                onClick={() => goToDetail(request.parte)}
                className="cursor-pointer hover:bg-secondary/40"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{request.parte}</span>
                    <HistoricalBadge isHistorical={request.isHistorical} />
                  </div>
                </TableCell>
                <TableCell>{request.maquina ?? "—"}</TableCell>
                <TableCell className="max-w-64 truncate" title={request.problema ?? undefined}>
                  {request.problema ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {request.fecha ? dateFormatter.format(request.fecha) : "—"}
                </TableCell>
                {compact ? null : (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {antiguedad === null ? "—" : `${antiguedad} d`}
                  </TableCell>
                )}
                <TableCell>
                  <EstadoBadge estado={request.estado} />
                </TableCell>
                {compact ? null : <TableCell>{request._count.logs}</TableCell>}
                <TableCell
                  className="text-right"
                  onClick={(event: MouseEvent) => event.stopPropagation()}
                >
                  <Link
                    href={`/solicitudes/${encodeURIComponent(request.parte)}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Ver detalle
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
