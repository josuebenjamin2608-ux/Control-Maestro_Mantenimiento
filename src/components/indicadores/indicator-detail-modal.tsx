"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { EstadoBadge } from "@/components/solicitudes/estado-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates";
import { formatPeriodLabel } from "@/lib/period";
import { formatResponsibleArea } from "@/lib/responsible-area";
import { fetchIndicatorRequests } from "@/server/actions/indicators";
import type {
  GetIndicatorRequestsParams,
  IndicatorRequestRow,
  IndicatorRequestsPage,
} from "@/server/services/indicators.service";

const PAGE_SIZE = 20;

/**
 * Qué pedir (`query`, combinado con year/month del período activo de
 * /indicadores, salvo que `periodOverride` indique otro) y cómo titular el
 * modal. `query` es literalmente el mismo shape que consume
 * `getIndicatorRequests` — nunca recalcula el período ni las condiciones
 * del indicador en el cliente.
 */
export interface IndicatorDescriptor {
  title: string;
  /** Texto adicional bajo el título. Si se omite, se usa el período efectivo (periodOverride o el global). */
  subtitle?: string;
  query: Omit<GetIndicatorRequestsParams, "year" | "month" | "take" | "skip">;
  /**
   * Sobreescribe el year/month del período activo de /indicadores — usado
   * por elementos que representan OTRO período distinto al seleccionado
   * (p. ej. una barra de otro mes en "Solicitudes por mes", o el valor
   * "anterior" en "Comparación con el mes anterior"). Sigue siendo la MISMA
   * getIndicatorRequests(), solo con year/month distintos.
   */
  periodOverride?: { year: number; month: number };
}

function detailHref(parte: string, backHref: string) {
  return `/solicitudes/${encodeURIComponent(parte)}?back=${encodeURIComponent(backHref)}`;
}

function ParteLink({ row, backHref }: { row: IndicatorRequestRow; backHref: string }) {
  return (
    <Link href={detailHref(row.parte, backHref)} className="font-medium text-primary hover:underline">
      {row.parte}
    </Link>
  );
}

type FetchResult = { page: IndicatorRequestsPage } | { error: string };

/** Ancho de columna (table-fixed) — suman 100% para que la tabla nunca necesite scroll horizontal. */
const COLUMN_WIDTHS = {
  parte: "w-[10%]",
  maquina: "w-[13%]",
  estado: "w-[9%]",
  problema: "w-[24%]",
  tarea: "w-[20%]",
  fecha: "w-[10%]",
  responsable: "w-[14%]",
};

/**
 * Cuerpo del modal para UN indicador ya abierto. Se remonta (vía `key` en el
 * padre) cada vez que cambia el indicador seleccionado, así la paginación
 * (`skip`) arranca en 0 de forma natural — sin un efecto que la reinicie.
 */
function IndicatorModalBody({
  descriptor,
  year,
  month,
  periodLabel,
  backHref,
}: {
  descriptor: IndicatorDescriptor;
  year: number;
  month: number;
  periodLabel: string;
  backHref: string;
}) {
  const [skip, setSkip] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestSeq = useRef(0);

  const effectiveYear = descriptor.periodOverride?.year ?? year;
  const effectiveMonth = descriptor.periodOverride?.month ?? month;
  const effectivePeriodLabel = descriptor.periodOverride
    ? formatPeriodLabel(descriptor.periodOverride)
    : periodLabel;

  useEffect(() => {
    const seq = ++requestSeq.current;
    startTransition(async () => {
      try {
        const page = await fetchIndicatorRequests({
          ...descriptor.query,
          year: effectiveYear,
          month: effectiveMonth,
          take: PAGE_SIZE,
          skip,
        });
        if (requestSeq.current !== seq) return; // respuesta obsoleta (cambió la página)
        setResult({ page });
      } catch {
        if (requestSeq.current !== seq) return;
        setResult({ error: "No se pudo cargar el detalle de este indicador." });
      }
    });
  }, [descriptor, effectiveYear, effectiveMonth, skip]);

  const isLoading = isPending || result === null;
  const error = result && "error" in result ? result.error : null;
  const page = result && "page" in result ? result.page : null;

  return (
    <DialogContent className="w-[90vw] max-w-[1400px] max-h-[85vh]">
      <DialogHeader>
        <DialogTitle>{descriptor.title}</DialogTitle>
        <DialogDescription>{descriptor.subtitle ?? effectivePeriodLabel}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">Cargando solicitudes...</p>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <AlertTriangle className="size-5 text-destructive" />
            <p className="text-sm text-foreground">{error}</p>
          </div>
        ) : page && page.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-center">
            <p className="text-sm text-foreground">No hay solicitudes para este indicador.</p>
            <p className="text-xs text-muted-foreground">{effectivePeriodLabel}</p>
          </div>
        ) : page ? (
          <>
            <div
              data-testid="indicator-total-count"
              className="border-b border-border px-5 py-2.5 text-sm text-muted-foreground"
            >
              {page.total} solicitud{page.total === 1 ? "" : "es"}
              {descriptor.query.indicator === "pctAtendidas" &&
              page.periodTotal !== undefined &&
              page.percentage !== undefined
                ? ` de ${page.periodTotal} del período (${page.percentage}% atendidas)`
                : ""}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Móvil: tarjetas. */}
              <div className="flex flex-col divide-y divide-border sm:hidden">
                {page.items.map((row) => (
                  <div key={row.id} className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <ParteLink row={row} backHref={backHref} />
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
                      Responsable: {formatResponsibleArea(row.responsibleArea)}
                      {row.technicianNames.length > 0
                        ? ` · Técnico: ${row.technicianNames.join(", ")}`
                        : ""}
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
                      <TableHead className={COLUMN_WIDTHS.estado}>Estado</TableHead>
                      <TableHead className={COLUMN_WIDTHS.problema}>Problema</TableHead>
                      <TableHead className={COLUMN_WIDTHS.tarea}>Tarea</TableHead>
                      <TableHead className={COLUMN_WIDTHS.fecha}>Fecha</TableHead>
                      <TableHead className={COLUMN_WIDTHS.responsable}>Responsable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className={`${COLUMN_WIDTHS.parte} truncate`}>
                          <ParteLink row={row} backHref={backHref} />
                        </TableCell>
                        <TableCell className={`${COLUMN_WIDTHS.maquina} truncate`} title={row.maquina ?? undefined}>
                          {row.maquina ?? "—"}
                        </TableCell>
                        <TableCell className={COLUMN_WIDTHS.estado}>
                          <EstadoBadge estado={row.estado} />
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
                        <TableCell className={`${COLUMN_WIDTHS.responsable} truncate`}>
                          {formatResponsibleArea(row.responsibleArea)}
                          {row.technicianNames.length > 0 ? (
                            <span
                              className="block truncate text-xs text-muted-foreground"
                              title={row.technicianNames.join(", ")}
                            >
                              {row.technicianNames.join(", ")}
                            </span>
                          ) : null}
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
      </div>
    </DialogContent>
  );
}

export function IndicatorDetailModal({
  descriptor,
  year,
  month,
  periodLabel,
  backHref,
  onClose,
}: {
  descriptor: IndicatorDescriptor | null;
  year: number;
  month: number;
  periodLabel: string;
  /** URL exacta de /indicadores con sus filtros actuales, para que "Volver" desde el detalle regrese acá. */
  backHref: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={descriptor !== null} onOpenChange={(next) => !next && onClose()}>
      {descriptor ? (
        <IndicatorModalBody
          key={`${descriptor.title}:${JSON.stringify(descriptor.query)}:${JSON.stringify(descriptor.periodOverride ?? null)}`}
          descriptor={descriptor}
          year={year}
          month={month}
          periodLabel={periodLabel}
          backHref={backHref}
        />
      ) : null}
    </Dialog>
  );
}
