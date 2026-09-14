"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Asigna un técnico real (existente en la tabla Technician) a una Solicitud.
 * Idempotente: si ya está activamente asignado (removedAt = null), no hace
 * nada. Si existe una asignación anterior ya retirada para el mismo par
 * (solicitud, técnico), crea una fila NUEVA en vez de reutilizar la vieja —
 * así el historial conserva cada ciclo de asignación/retiro por separado.
 * Nunca crea técnicos nuevos.
 */
export async function assignTechnicianToRequest(
  maintenanceRequestId: string,
  technicianId: string,
): Promise<ActionResult<null>> {
  const [request, technician] = await Promise.all([
    db.maintenanceRequest.findUnique({ where: { id: maintenanceRequestId }, select: { parte: true } }),
    db.technician.findUnique({ where: { id: technicianId }, select: { id: true, isActive: true } }),
  ]);

  if (!request) {
    return { ok: false, error: "La solicitud no existe." };
  }
  if (!technician) {
    return { ok: false, error: "El técnico no existe." };
  }
  if (!technician.isActive) {
    return { ok: false, error: "El técnico no está activo." };
  }

  const activeAssignment = await db.maintenanceRequestTechnician.findFirst({
    where: { maintenanceRequestId, technicianId, removedAt: null },
    select: { id: true },
  });

  if (!activeAssignment) {
    await db.maintenanceRequestTechnician.create({
      data: { maintenanceRequestId, technicianId },
    });
  }

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}

/**
 * Retira a un técnico de una Solicitud. NO borra la fila — completa
 * `removedAt` en la asignación activa, así queda trazabilidad de quién
 * estuvo asignado y cuándo se retiró. No borra al técnico ni modifica sus
 * datos propios.
 */
export async function unassignTechnicianFromRequest(
  maintenanceRequestId: string,
  technicianId: string,
): Promise<ActionResult<null>> {
  const request = await db.maintenanceRequest.findUnique({
    where: { id: maintenanceRequestId },
    select: { parte: true },
  });
  if (!request) {
    return { ok: false, error: "La solicitud no existe." };
  }

  await db.maintenanceRequestTechnician.updateMany({
    where: { maintenanceRequestId, technicianId, removedAt: null },
    data: { removedAt: new Date() },
  });

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}
