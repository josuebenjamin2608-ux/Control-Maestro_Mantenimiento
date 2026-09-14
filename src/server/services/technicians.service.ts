import { db } from "@/lib/db";

/**
 * Todos los técnicos (activos e inactivos), para la página /tecnicos.
 * Distinto de `listTechnicians()` en maintenance-requests.service.ts, que
 * solo trae activos para el selector de asignación — ese uso no cambia.
 */
export function listAllTechnicians() {
  return db.technician.findMany({
    orderBy: { fullName: "asc" },
  });
}

export function getTechnicianById(id: string) {
  return db.technician.findUnique({ where: { id } });
}
