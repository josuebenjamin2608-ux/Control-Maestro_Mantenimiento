"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Asigna un técnico real (existente en la tabla Technician) a una Solicitud.
 * Idempotente: si ya estaba asignado, no hace nada (constraint única
 * maintenanceRequestId+technicianId). Nunca crea técnicos nuevos.
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

  await db.maintenanceRequestTechnician.upsert({
    where: {
      maintenanceRequestId_technicianId: { maintenanceRequestId, technicianId },
    },
    create: { maintenanceRequestId, technicianId },
    update: {},
  });

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}

/** Quita la asignación de un técnico de una Solicitud (no borra al técnico). */
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

  await db.maintenanceRequestTechnician.deleteMany({
    where: { maintenanceRequestId, technicianId },
  });

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}
