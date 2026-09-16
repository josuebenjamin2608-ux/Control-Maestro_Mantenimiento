"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import type { MaintenanceRequestResponsibleArea } from "@/generated/prisma/client";

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
