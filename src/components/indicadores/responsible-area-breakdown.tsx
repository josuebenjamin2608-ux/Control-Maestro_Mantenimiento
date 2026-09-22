"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";

import { EstadoBadge } from "@/components/solicitudes/estado-badge";
import { formatCalendarDate } from "@/lib/dates";
import { formatParteDisplay } from "@/lib/parte";
import {
  RESPONSIBLE_AREA_LABELS,
  RESPONSIBLE_AREA_UNDEFINED_LABEL,
  RESPONSIBLE_AREA_UNDEFINED_VALUE,
} from "@/lib/responsible-area";
import { cn } from "@/lib/utils";
import { fetchIndicatorRequests } from "@/server/actions/indicators";
import type { IndicatorRequestRow, IndicatorRequestsPage } from "@/server/services/indicators.service";
import type { ResponsibleAreaSummary } from "@/server/services/maintenance-requests.service";

const DETAIL_LIMIT = 50;

const ROWS: {
  key: keyof ResponsibleAreaSummary;
  label: string;
  colorClass: string;
  responsable: string;
}[] = [
  {
    key: "mantenimiento",
    label: RESPONSIBLE_AREA_LABELS.MANTENIMIENTO,
    colorClass: "bg-primary",
    responsable: "MANTENIMIENTO",
  },
  {
    key: "produccion",
    label: RESPONSIBLE_AREA_LABELS.PRODUCCION,
    colorClass: "bg-warning",
    responsable: "PRODUCCION",
  },
  {
    key: "sinDefinir",
    label: RESPONSIBLE_AREA_UNDEFINED_LABEL,
    colorClass: "bg-muted-foreground",
    responsable: RESPONSIBLE_AREA_UNDEFINED_VALUE,
  },
];

function detailHref(parte: string, backHref: string) {
  return `/solicitudes/${encodeURIComponent(parte)}?back=${encodeURIComponent(backHref)}`;
}

function technicianLabel(row: IndicatorRequestRow): string {
  return row.technicianNames.length > 0 ? row.technicianNames.join(", ") : "Sin asignar";
}

type FetchResult = { page: IndicatorRequestsPage } | { error: string };

/**
 * Solicitudes abiertas de UN área responsable — se pide al expandir (nunca
 * antes), reutilizando el indicator "responsableAbierto" (mismo universo que
 * getOpenRequestsByResponsibleArea, sin filtro de FECHA). Sin paginación
 * propia: trae hasta DETAIL_LIMIT filas y, si hay más, enlaza a /solicitudes
 * filtrado por ese responsable en vez de reimplementar paginación acá.
 */
function ResponsibleAreaDetail({ responsable, backHref }: { responsable: string; backHref: string }) {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    startTransition(async () => {
      try {
        const page = await fetchIndicatorRequests({
          indicator: "responsableAbierto",
          responsable,
          year: new Date().getFullYear(),
          take: DETAIL_LIMIT,
          skip: 0,
        });
        if (requestSeq.current !== seq) return;
        setResult({ page });
      } catch {
        if (requestSeq.current !== seq) return;
        setResult({ error: "No se pudieron cargar las solicitudes de esta área." });
      }
    });
  }, [responsable]);

  const isLoading = isPending || result === null;
  const error = result && "error" in result ? result.error : null;
  const page = result && "page" in result ? result.page : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-border py-6 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <p className="text-sm">Cargando solicitudes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-border py-6 text-center">
        <AlertTriangle className="size-4 text-destructive" />
        <p className="text-sm text-foreground">{error}</p>
      </div>
    );
  }

  if (!page || page.items.length === 0) {
    return (
      <div className="rounded-md border border-border py-6 text-center text-sm text-muted-foreground">
        No hay solicitudes abiertas en esta área.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
      {page.items.map((row) => (
        <div key={row.id} className="flex flex-col gap-1.5 px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link href={detailHref(row.parte, backHref)} className="font-medium text-primary hover:underline">
              {formatParteDisplay(row.parte)}
            </Link>
            <EstadoBadge estado={row.estado} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="truncate">{row.maquina ?? "—"}</span>
            <span className="shrink-0 whitespace-nowrap">{formatCalendarDate(row.fecha)}</span>
          </div>
          {row.problema ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{row.problema}</p>
          ) : null}
          <span className="text-xs text-muted-foreground">Técnico: {technicianLabel(row)}</span>
        </div>
      ))}
      {page.total > DETAIL_LIMIT ? (
        <div className="px-4 py-2.5 text-center text-xs text-muted-foreground">
          Mostrando {DETAIL_LIMIT} de {page.total}.{" "}
          <Link href={`/solicitudes?responsable=${encodeURIComponent(responsable)}`} className="text-primary hover:underline">
            Ver todas en Solicitudes
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Distribución por responsable" (puntos 4 y 5): mismo universo que el
 * Backlog (ESTADO != Realizado, sin filtro de FECHA — getOpenRequestsByResponsibleArea),
 * nunca el período seleccionado. Cada área es un elemento clickeable que
 * expande/contrae su detalle compacto de solicitudes abiertas — nunca una
 * tabla permanentemente visible.
 */
export function ResponsibleAreaBreakdown({
  summary,
  backHref,
}: {
  summary: ResponsibleAreaSummary;
  backHref: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = summary.mantenimiento + summary.produccion + summary.sinDefinir;

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes abiertas actualmente.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {ROWS.map((row) => {
        const value = summary[row.key];
        if (value === 0) return null;
        const percentage = Math.round((value / total) * 100);
        const isOpen = expanded === row.key;

        return (
          <div key={row.key} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : row.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 rounded-md py-1 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              <span className="w-24 shrink-0 truncate text-xs text-muted-foreground sm:w-32">{row.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full rounded-full ${row.colorClass}`} style={{ width: `${percentage}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs font-medium text-foreground">
                {value} · {percentage}%
              </span>
            </button>
            {isOpen ? (
              <div className="pl-7">
                <ResponsibleAreaDetail responsable={row.responsable} backHref={backHref} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
