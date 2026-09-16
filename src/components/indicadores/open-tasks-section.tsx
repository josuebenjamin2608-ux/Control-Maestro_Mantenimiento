"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { EstadoBadge } from "@/components/solicitudes/estado-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADO_BUCKET_LABELS } from "@/lib/estado";
import { formatCalendarDate } from "@/lib/dates";
import { formatParteDisplay } from "@/lib/parte";
import { formatResponsibleArea, RESPONSIBLE_AREA_LABELS } from "@/lib/responsible-area";
import { fetchIndicatorRequests } from "@/server/actions/indicators";
import type { IndicatorRequestRow, IndicatorRequestsPage } from "@/server/services/indicators.service";
import type { OpenBucketCounts, ResponsibleAreaSummary } from "@/server/services/maintenance-requests.service";

const PAGE_SIZE = 20;

/** Ancho de columna (table-fixed) — suman 100%, mismo criterio que el modal genérico de indicadores. */
const COLUMN_WIDTHS = {
  parte: "w-[9%]",
  maquina: "w-[11%]",
  problema: "w-[19%]",
  tarea: "w-[15%]",
  fecha: "w-[9%]",
  estado: "w-[9%]",
  responsable: "w-[13%]",
  tecnico: "w-[15%]",
};

function detailHref(parte: string, backHref: string) {
  return `/solicitudes/${encodeURIComponent(parte)}?back=${encodeURIComponent(backHref)}`;
}

function technicianLabel(row: IndicatorRequestRow): string {
  return row.technicianNames.length > 0 ? row.technicianNames.join(", ") : "Sin asignar";
}

type FetchResult = { page: IndicatorRequestsPage } | { error: string };

/**
 * "Tareas abiertas": sección SIEMPRE visible dentro de /indicadores, ya no un
 * modal — reutiliza exactamente la misma consulta que antes vivía en el
 * diálogo (indicator "totalAbierto" → getNonAtendidaEstadoWhere, mismo
 * universo ESTADO != Realizado que "Estado actual de la operación") y los
 * mismos `counts`/`responsibleArea` que la página ya calcula (no se agrega
 * ninguna consulta nueva). La tabla se pide al montar el componente (antes
 * se pedía al abrir el diálogo) — misma paginación cliente de siempre.
 */
export function OpenTasksSection({
  counts,
  responsibleArea,
  backHref,
}: {
  counts: OpenBucketCounts;
  responsibleArea: ResponsibleAreaSummary;
  backHref: string;
}) {
  const [skip, setSkip] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    startTransition(async () => {
      try {
        // indicator "totalAbierto": ESTADO != Realizado, SIN filtro de FECHA
        // (getNonAtendidaEstadoWhere) — `year` es obligatorio en el tipo pero
        // se ignora por completo para este indicator, igual que ya ignora
        // `month` en los backlogOver7/15/30.
        const page = await fetchIndicatorRequests({
          indicator: "totalAbierto",
          year: new Date().getFullYear(),
          take: PAGE_SIZE,
          skip,
        });
        if (requestSeq.current !== seq) return; // respuesta obsoleta (cambió la página)
        setResult({ page });
      } catch {
        if (requestSeq.current !== seq) return;
        setResult({ error: "No se pudieron cargar las tareas abiertas." });
      }
    });
  }, [skip]);

  const isLoading = isPending || result === null;
  const error = result && "error" in result ? result.error : null;
  const page = result && "page" in result ? result.page : null;

  const showProgramadas = counts.programadas > 0;
  const showOtros = counts.otros > 0;
  const responsableTotal = responsibleArea.mantenimiento + responsibleArea.produccion;

  return (
    <Card>
      <CardContent className="flex flex-col gap-0 px-0 py-0">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total abierto
              </span>
              <span className="text-2xl font-semibold text-foreground">{counts.totalAbiertas}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {ESTADO_BUCKET_LABELS.pendiente}
              </span>
              <span className="text-2xl font-semibold text-destructive">{counts.pendientes}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {ESTADO_BUCKET_LABELS.espera}
              </span>
              <span className="text-2xl font-semibold text-warning">{counts.espera}</span>
            </div>
            {showProgramadas ? (
              <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ESTADO_BUCKET_LABELS.programada}
                </span>
                <span className="text-2xl font-semibold text-primary">{counts.programadas}</span>
              </div>
            ) : null}
            {showOtros ? (
              <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ESTADO_BUCKET_LABELS.otro}
                </span>
                <span className="text-2xl font-semibold text-muted-foreground">{counts.otros}</span>
              </div>
            ) : null}
          </div>

          {responsableTotal > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Distribución por responsable
              </span>
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    ["mantenimiento", RESPONSIBLE_AREA_LABELS.MANTENIMIENTO, "bg-primary"],
                    ["produccion", RESPONSIBLE_AREA_LABELS.PRODUCCION, "bg-warning"],
                  ] as const
                ).map(([key, label, colorClass]) => {
                  const value = responsibleArea[key];
                  if (value === 0) return null;
                  const percentage = Math.round((value / responsableTotal) * 100);
                  return (
                    <div key={key} className="flex w-full items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground sm:w-32">
                        {label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${colorClass}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs font-medium text-foreground">
                        {value} · {percentage}%
                      </span>
                    </div>
                  );
                })}
              </div>
              {responsibleArea.sinDefinir > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin asignar: {responsibleArea.sinDefinir}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">Cargando tareas abiertas...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <AlertTriangle className="size-5 text-destructive" />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        ) : page && page.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
            <p className="text-sm text-foreground">No hay tareas abiertas actualmente.</p>
          </div>
        ) : page ? (
          <>
            <div
              data-testid="open-tasks-total-count"
              className="border-b border-border px-5 py-2.5 text-sm text-muted-foreground"
            >
              {page.total} tarea{page.total === 1 ? "" : "s"} abierta{page.total === 1 ? "" : "s"}
            </div>

            <div className="max-h-[32rem] overflow-y-auto">
              {/* Móvil: tarjetas. */}
              <div className="flex flex-col divide-y divide-border sm:hidden">
                {page.items.map((row) => (
                  <div key={row.id} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={detailHref(row.parte, backHref)}
                        className="font-medium text-primary hover:underline"
                      >
                        {formatParteDisplay(row.parte)}
                      </Link>
                      <EstadoBadge estado={row.estado} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span className="truncate">{row.maquina ?? "—"}</span>
                      <span className="shrink-0 whitespace-nowrap">{formatCalendarDate(row.fecha)}</span>
                    </div>
                    {row.problema ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{row.problema}</p>
                    ) : null}
                    {row.tarea ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">Tarea: {row.tarea}</p>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      Responsable: {formatResponsibleArea(row.responsibleArea)} · Técnico:{" "}
                      {technicianLabel(row)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Escritorio/tablet: tabla amplia, ancho fijo por columna — nunca scroll horizontal. */}
              <div className="hidden sm:block">
                <Table className="table-fixed">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className={COLUMN_WIDTHS.parte}>PARTE</TableHead>
                      <TableHead className={COLUMN_WIDTHS.maquina}>Máquina</TableHead>
                      <TableHead className={COLUMN_WIDTHS.problema}>Problema</TableHead>
                      <TableHead className={COLUMN_WIDTHS.tarea}>Tarea</TableHead>
                      <TableHead className={COLUMN_WIDTHS.fecha}>Fecha</TableHead>
                      <TableHead className={COLUMN_WIDTHS.estado}>Estado</TableHead>
                      <TableHead className={COLUMN_WIDTHS.responsable}>Responsable</TableHead>
                      <TableHead className={COLUMN_WIDTHS.tecnico}>Técnico</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className={`${COLUMN_WIDTHS.parte} truncate`}>
                          <Link
                            href={detailHref(row.parte, backHref)}
                            className="font-medium text-primary hover:underline"
                          >
                            {formatParteDisplay(row.parte)}
                          </Link>
                        </TableCell>
                        <TableCell className={`${COLUMN_WIDTHS.maquina} truncate`} title={row.maquina ?? undefined}>
                          {row.maquina ?? "—"}
                        </TableCell>
                        <TableCell
                          className={`${COLUMN_WIDTHS.problema} truncate`}
                          title={row.problema ?? undefined}
                        >
                          {row.problema ?? "—"}
                        </TableCell>
                        <TableCell className={`${COLUMN_WIDTHS.tarea} truncate`} title={row.tarea ?? undefined}>
                          {row.tarea ?? "—"}
                        </TableCell>
                        <TableCell className={`${COLUMN_WIDTHS.fecha} whitespace-nowrap`}>
                          {formatCalendarDate(row.fecha)}
                        </TableCell>
                        <TableCell className={COLUMN_WIDTHS.estado}>
                          <EstadoBadge estado={row.estado} />
                        </TableCell>
                        <TableCell className={`${COLUMN_WIDTHS.responsable} truncate`}>
                          {formatResponsibleArea(row.responsibleArea)}
                        </TableCell>
                        <TableCell
                          className={`${COLUMN_WIDTHS.tecnico} truncate`}
                          title={technicianLabel(row)}
                        >
                          {technicianLabel(row)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {page.total > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-sm text-muted-foreground">
                <span>
                  Página {Math.floor(skip / PAGE_SIZE) + 1} de {Math.ceil(page.total / PAGE_SIZE)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={skip === 0}
                    onClick={() => setSkip((current) => Math.max(0, current - PAGE_SIZE))}
                    className="flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={skip + PAGE_SIZE >= page.total}
                    onClick={() => setSkip((current) => current + PAGE_SIZE)}
                    className="flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
                  >
                    Siguiente
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
