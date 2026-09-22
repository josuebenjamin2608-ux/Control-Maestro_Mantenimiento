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
 * - "OBSERVACIONES": siempre vacío — no se deriva de PROBLEMA, TAREA ni
 *   ningún otro campo.
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
      observaciones: null,
    });
  }

  for (const key of ["fecha", "fechaAtencion", "fechaCompromiso"] as const) {
    worksheet.getColumn(key).numFmt = DATE_NUM_FMT;
  }

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
