import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates";
import { formatParteDisplay } from "@/lib/parte";
import { formatResponsibleArea } from "@/lib/responsible-area";
import { cn } from "@/lib/utils";
import type { UpcomingCommitmentItem } from "@/server/services/indicators.service";

function detailHref(parte: string, backHref: string) {
  return `/solicitudes/${encodeURIComponent(parte)}?back=${encodeURIComponent(backHref)}`;
}

function technicianLabel(item: UpcomingCommitmentItem): string {
  return item.technicianNames.length > 0 ? item.technicianNames.join(", ") : "Sin asignar";
}

function daysRemainingLabel(days: number): string {
  if (days <= 0) return "Vence hoy";
  return `${days} día${days === 1 ? "" : "s"}`;
}

const COLUMN_WIDTHS = {
  parte: "w-[12%]",
  maquina: "w-[20%]",
  responsable: "w-[16%]",
  tecnico: "w-[20%]",
  compromiso: "w-[16%]",
  dias: "w-[16%]",
};

/**
 * "Próximas a vencer" (punto 11): lista compacta de solicitudes cuyo
 * commitmentDate cae dentro de la ventana próxima y todavía no están
 * atendidas — mismo universo y mismo orden que el KPI equivalente de
 * "Cumplimiento de compromisos" (ver getUpcomingCommitments/
 * getProximasAVencerRequestIds, reutilizados). Server component: los datos
 * ya vienen resueltos de la página, sin fetch propio ni paginación (no se
 * requiere UI compleja para esta primera iteración).
 */
export function UpcomingCommitmentsSection({
  items,
  total,
  backHref,
}: {
  items: UpcomingCommitmentItem[];
  total: number;
  backHref: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes con compromiso próximo a vencer.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border border-border">
        {/* Móvil: tarjetas. */}
        <div className="flex flex-col divide-y divide-border sm:hidden">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <Link href={detailHref(item.parte, backHref)} className="font-medium text-primary hover:underline">
                  {formatParteDisplay(item.parte)}
                </Link>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    item.daysRemaining <= 1 ? "text-destructive" : "text-warning",
                  )}
                >
                  {daysRemainingLabel(item.daysRemaining)}
                </span>
              </div>
              <span className="truncate text-sm text-muted-foreground">{item.maquina ?? "—"}</span>
              <span className="text-xs text-muted-foreground">
                Responsable: {formatResponsibleArea(item.responsibleArea)} · Técnico: {technicianLabel(item)}
              </span>
              <span className="text-xs text-muted-foreground">
                Compromiso: {formatCalendarDate(item.commitmentDate)}
              </span>
            </div>
          ))}
        </div>

        {/* Escritorio/tablet: tabla amplia, ancho fijo por columna. */}
        <div className="hidden sm:block">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className={COLUMN_WIDTHS.parte}>PARTE</TableHead>
                <TableHead className={COLUMN_WIDTHS.maquina}>Máquina</TableHead>
                <TableHead className={COLUMN_WIDTHS.responsable}>Responsable</TableHead>
                <TableHead className={COLUMN_WIDTHS.tecnico}>Técnico</TableHead>
                <TableHead className={COLUMN_WIDTHS.compromiso}>Fecha compromiso</TableHead>
                <TableHead className={COLUMN_WIDTHS.dias}>Días restantes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className={`${COLUMN_WIDTHS.parte} truncate`}>
                    <Link href={detailHref(item.parte, backHref)} className="font-medium text-primary hover:underline">
                      {formatParteDisplay(item.parte)}
                    </Link>
                  </TableCell>
                  <TableCell className={`${COLUMN_WIDTHS.maquina} truncate`} title={item.maquina ?? undefined}>
                    {item.maquina ?? "—"}
                  </TableCell>
                  <TableCell className={`${COLUMN_WIDTHS.responsable} truncate`}>
                    {formatResponsibleArea(item.responsibleArea)}
                  </TableCell>
                  <TableCell className={`${COLUMN_WIDTHS.tecnico} truncate`} title={technicianLabel(item)}>
                    {technicianLabel(item)}
                  </TableCell>
                  <TableCell className={`${COLUMN_WIDTHS.compromiso} whitespace-nowrap`}>
                    {formatCalendarDate(item.commitmentDate)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      COLUMN_WIDTHS.dias,
                      "whitespace-nowrap font-medium",
                      item.daysRemaining <= 1 ? "text-destructive" : "text-warning",
                    )}
                  >
                    {daysRemainingLabel(item.daysRemaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {total > items.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Mostrando {items.length} de {total}.
        </p>
      ) : null}
    </div>
  );
}
