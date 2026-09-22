import ExcelJS from "exceljs";

import { formatResponsibleArea } from "@/lib/responsible-area";
import { getLatestFechafinByRequest } from "@/server/services/indicators.service";
import {
  listMaintenanceRequestsForExport,
  type ListMaintenanceRequestsParams,
} from "@/server/services/maintenance-requests.service";

/** Mismas 14 columnas, mismo orden, en todo el archivo (encabezados + pruebas). */
export const SOLICITUDES_EXPORT_HEADERS = [
  "PARTE",
  "CODIGO",
  "MAQUINA",
  "PIEZA",
  "PROBLEMA",
  "TAREA",
  "FECHA",
  "CODEMPLE",
  "EMPLEADO",
  "ESTADO",
  "AREA RESPONSABLE",
  "Fecha de Atención Evento",
  "Fecha de Compromiso",
  "OBSERVACIONES",
] as const;

const DATE_NUM_FMT = "dd/mm/yyyy";

export type SolicitudesExportFilters = Pick<
  ListMaintenanceRequestsParams,
  "search" | "maquina" | "estado" | "responsable"
>;

interface ExportRelatedLog {
  fechaini: Date | null;
  fechafin: Date | null;
  observaciones: string | null;
}

/** dd/mm/yyyy en hora LOCAL — FECHAINI/FECHAFIN de Minuta representan un instante real, nunca se formatean en UTC (ver src/lib/dates.ts). Mismo criterio que MinutaTimeline, en formato numérico. */
function formatLogDateDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

/**
 * Consolida en una sola celda las OBSERVACIONES de las Minutas relacionadas
 * con una Solicitud (`request.logs`, ya filtrada por la FK existente —
 * nunca una PENDING/UNRELATED, ver comentario en
 * listMaintenanceRequestsForExport). Nunca una fila por Minuta: 1 Solicitud
 * = 1 fila del Excel, siempre. Minutas relacionadas sin texto en
 * OBSERVACIONES se omiten (no aportan nada); si no queda ninguna con texto,
 * la celda queda vacía (`null`) — nunca se inventa contenido a partir de
 * PROBLEMA, TAREA ni ningún otro campo.
 */
function buildConsolidatedObservaciones(logs: ExportRelatedLog[]): string | null {
  const withText = logs.filter(
    (log) => log.observaciones !== null && log.observaciones.trim().length > 0,
  );
  if (withText.length === 0) return null;

  // Cronológico: los logs ya llegan ordenados por fechaini "asc" (ver
  // listMaintenanceRequestsForExport) — nunca se reordenan acá por fechafin.
  return withText
    .map((log) => {
      const date = log.fechafin ?? log.fechaini;
      const text = log.observaciones as string;
      return date ? `${formatLogDateDDMMYYYY(date)} - ${text.trim()}` : text.trim();
    })
    .join("\n");
}

/**
 * Genera el Excel de "Detalle de Solicitudes" para /solicitudes.
 *
 * - Filtros: reutiliza listMaintenanceRequestsForExport, que comparte el
 *   mismo WHERE que la tabla de /solicitudes (buildMaintenanceRequestWhere
 *   en maintenance-requests.service.ts) — nunca una segunda definición de
 *   filtro que pueda divergir.
 * - "Fecha de Atención Evento": reutiliza getLatestFechafinByRequest
 *   (indicators.service.ts), la MISMA relación PARTE <-> OBSERVACIONES.trim()
 *   ya usada por "Cerradas"/"Cumplimiento de compromisos" — el FECHAFIN más
 *   reciente entre las Minutas RELATED de esa solicitud. Sin Minuta
 *   relacionada con FECHAFIN, el campo queda vacío (nunca se inventa).
 * - "OBSERVACIONES": consolidada desde las Minutas relacionadas (ver
 *   buildConsolidatedObservaciones) — NUNCA desde PROBLEMA, TAREA ni
 *   Telegram. 1 Solicitud siempre produce 1 fila, sin importar cuántas
 *   Minutas relacionadas tenga.
 */
export async function buildSolicitudesExportWorkbook(
  filters: SolicitudesExportFilters = {},
): Promise<ExcelJS.Buffer> {
  const [requests, fechafinByRequest] = await Promise.all([
    listMaintenanceRequestsForExport(filters),
    getLatestFechafinByRequest(),
  ]);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Solicitudes");

  worksheet.columns = [
    { header: SOLICITUDES_EXPORT_HEADERS[0], key: "parte", width: 14 },
    { header: SOLICITUDES_EXPORT_HEADERS[1], key: "codigo", width: 14 },
    { header: SOLICITUDES_EXPORT_HEADERS[2], key: "maquina", width: 22 },
    { header: SOLICITUDES_EXPORT_HEADERS[3], key: "pieza", width: 18 },
    { header: SOLICITUDES_EXPORT_HEADERS[4], key: "problema", width: 36 },
    { header: SOLICITUDES_EXPORT_HEADERS[5], key: "tarea", width: 30 },
    { header: SOLICITUDES_EXPORT_HEADERS[6], key: "fecha", width: 14 },
    { header: SOLICITUDES_EXPORT_HEADERS[7], key: "codemple", width: 12 },
    { header: SOLICITUDES_EXPORT_HEADERS[8], key: "empleado", width: 22 },
    { header: SOLICITUDES_EXPORT_HEADERS[9], key: "estado", width: 16 },
    { header: SOLICITUDES_EXPORT_HEADERS[10], key: "areaResponsable", width: 18 },
    { header: SOLICITUDES_EXPORT_HEADERS[11], key: "fechaAtencion", width: 22 },
    { header: SOLICITUDES_EXPORT_HEADERS[12], key: "fechaCompromiso", width: 18 },
    { header: SOLICITUDES_EXPORT_HEADERS[13], key: "observaciones", width: 24 },
  ];
  worksheet.getRow(1).font = { bold: true };

  for (const request of requests) {
    worksheet.addRow({
      parte: request.parte,
      codigo: request.codigo,
      maquina: request.maquina,
      pieza: request.pieza,
      problema: request.problema,
      tarea: request.tarea,
      fecha: request.fecha,
      codemple: request.codemple,
      empleado: request.empleado,
      estado: request.estado,
      areaResponsable: formatResponsibleArea(request.responsibleArea),
      // FECHAFIN más reciente entre Minutas RELATED de esta solicitud; null si no hay ninguna.
      fechaAtencion: fechafinByRequest.get(request.id) ?? null,
      fechaCompromiso: request.commitmentDate,
      observaciones: buildConsolidatedObservaciones(request.logs),
    });
  }

  for (const key of ["fecha", "fechaAtencion", "fechaCompromiso"] as const) {
    worksheet.getColumn(key).numFmt = DATE_NUM_FMT;
  }
  // Varias observaciones consolidadas con salto de línea (ver
  // buildConsolidatedObservaciones): wrapText para que se vean como líneas
  // separadas al abrir el archivo, no como un solo renglón cortado.
  worksheet.getColumn("observaciones").alignment = { wrapText: true, vertical: "top" };

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length },
  };

  return workbook.xlsx.writeBuffer();
}

/** `Detalle_Solicitudes_YYYY-MM-DD.xlsx`, anclado a la fecha UTC del momento de exportar. */
export function buildSolicitudesExportFileName(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return `Detalle_Solicitudes_${iso}.xlsx`;
}
