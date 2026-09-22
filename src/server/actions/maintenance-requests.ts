"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import type { MaintenanceRequestResponsibleArea } from "@/generated/prisma/client";
import {
  buildSolicitudesExportFileName,
  buildSolicitudesExportWorkbook,
  type SolicitudesExportFilters,
} from "@/server/services/exports/solicitudes-export.service";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const VALID_AREAS: MaintenanceRequestResponsibleArea[] = ["MANTENIMIENTO", "PRODUCCION"];

/**
 * Cambia el área responsable (Mantenimiento/Producción) de una Solicitud, o
 * la deja "Sin definir" (`area: null`). Completamente independiente de la
 * asignación de técnicos (MaintenanceRequestTechnician): esto identifica qué
 * área debe gestionar la solicitud, no quién la ejecuta.
 */
export async function setMaintenanceRequestResponsibleArea(
  maintenanceRequestId: string,
  area: MaintenanceRequestResponsibleArea | null,
): Promise<ActionResult<null>> {
  if (area !== null && !VALID_AREAS.includes(area)) {
    return { ok: false, error: "Área responsable inválida." };
  }

  const request = await db.maintenanceRequest.findUnique({
    where: { id: maintenanceRequestId },
    select: { parte: true },
  });
  if (!request) {
    return { ok: false, error: "La solicitud no existe." };
  }

  await db.maintenanceRequest.update({
    where: { id: maintenanceRequestId },
    data: { responsibleArea: area },
  });

  // El área responsable alimenta "Distribución por responsable" tanto en el
  // Dashboard como en Indicadores — sin esto, Indicadores podía quedar
  // desactualizado tras un cambio hecho desde la ficha de la solicitud.
  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  revalidatePath("/solicitudes");
  revalidatePath("/indicadores");
  revalidatePath("/");
  return { ok: true, data: null };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cambia la fecha compromiso de una Solicitud, o la deja sin definir
 * (`isoDate: null`). Dato propio de gestión (no viene del Excel, no se toca
 * durante la importación — ver maintenance-request-import.service.ts).
 * `isoDate` es "YYYY-MM-DD" (valor crudo de un `<input type="date">"`); se
 * ancla a medianoche UTC de ese día calendario, mismo criterio que FECHA
 * (ver src/lib/dates.ts) para que nunca se desplace por zona horaria.
 */
export async function setMaintenanceRequestCommitmentDate(
  maintenanceRequestId: string,
  isoDate: string | null,
): Promise<ActionResult<null>> {
  let commitmentDate: Date | null = null;
  if (isoDate !== null) {
    if (!ISO_DATE_RE.test(isoDate)) {
      return { ok: false, error: "Fecha compromiso inválida." };
    }
    const [year, month, day] = isoDate.split("-").map(Number);
    commitmentDate = new Date(Date.UTC(year, month - 1, day));
  }

  const request = await db.maintenanceRequest.findUnique({
    where: { id: maintenanceRequestId },
    select: { parte: true },
  });
  if (!request) {
    return { ok: false, error: "La solicitud no existe." };
  }

  await db.maintenanceRequest.update({
    where: { id: maintenanceRequestId },
    data: { commitmentDate },
  });

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}

/**
 * Excel de "Detalle de Solicitudes" para el botón "Exportar Excel" de
 * /solicitudes — respeta EXACTAMENTE los mismos filtros (search/maquina/
 * estado/responsable) que la tabla ya aplica, nunca todas las solicitudes
 * sin filtrar. Solo lectura: no crea, modifica ni borra ningún registro.
 * Devuelve el .xlsx en base64 (Server Action, no puede devolver un
 * ReadableStream/Buffer crudo al cliente) para que el botón lo convierta en
 * un Blob y dispare la descarga.
 */
export async function exportSolicitudesToExcel(
  filters: SolicitudesExportFilters,
): Promise<ActionResult<{ base64: string; fileName: string }>> {
  const buffer = await buildSolicitudesExportWorkbook(filters);
  return {
    ok: true,
    data: {
      base64: Buffer.from(buffer).toString("base64"),
      fileName: buildSolicitudesExportFileName(),
    },
  };
}
