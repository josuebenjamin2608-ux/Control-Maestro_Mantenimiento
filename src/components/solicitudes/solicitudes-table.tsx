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
 *
 * `backHref`: URL exacta de la página que renderiza esta tabla (incluyendo
 * sus filtros/params actuales). Se propaga al detalle como `?back=...` para
 * que "Volver" regrese al origen real (Dashboard o /solicitudes) con sus
 * filtros intactos, en vez de depender de window.history.
 *
 * En pantallas angostas se renderiza como tarjetas (PARTE/Máquina/Novedad/
 * Fecha/Estado + "Ver detalle") en vez de forzar la tabla completa con
 * scroll horizontal.
 */
export function SolicitudesTable({
  items,
  compact = false,
  backHref,
}: {
  items: SolicitudRow[];
  compact?: boolean;
  backHref?: string;
}) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted-foreground">
        No hay solicitudes que coincidan con los filtros.
      </p>
    );
  }

  function detailHref(parte: string) {
    const base = `/solicitudes/${encodeURIComponent(parte)}`;
    return backHref ? `${base}?back=${encodeURIComponent(backHref)}` : base;
  }

  function goToDetail(parte: string) {
    router.push(detailHref(parte));
  }

  return (
    <>
      {/* Vista móvil: tarjetas, nunca la tabla completa con scroll horizontal. */}
      <div className="flex flex-col divide-y divide-border sm:hidden">
        {items.map((request) => (
          <div
            key={request.id}
            onClick={() => goToDetail(request.parte)}
            className="flex cursor-pointer flex-col gap-1.5 px-4 py-3 active:bg-secondary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-foreground">{request.parte}</span>
                <HistoricalBadge isHistorical={request.isHistorical} />
              </div>
              <EstadoBadge estado={request.estado} />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="truncate">{request.maquina ?? "—"}</span>
              <span className="shrink-0 whitespace-nowrap">
                {request.fecha ? dateFormatter.format(request.fecha) : "—"}
              </span>
            </div>
            {request.problema ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">{request.problema}</p>
            ) : null}
            <Link
              href={detailHref(request.parte)}
              onClick={(event) => event.stopPropagation()}
              className="w-fit text-sm text-primary hover:underline"
            >
              Ver detalle
            </Link>
          </div>
        ))}
      </div>

      {/* Vista de escritorio/tablet: tabla completa. */}
      <div className="hidden overflow-x-auto sm:block">
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
                      href={detailHref(request.parte)}
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
    </>
  );
}
