import type { MaintenanceRequestResponsibleArea } from "@/generated/prisma/client";

/**
 * Responsable = área responsable de gestionar la Solicitud (Mantenimiento o
 * Producción). Es independiente del Técnico asignado (ver
 * MaintenanceRequestTechnician) y nunca se infiere automáticamente: null
 * significa "Sin definir", tanto para solicitudes históricas como para
 * cualquier solicitud nueva creada por importación.
 */
export const RESPONSIBLE_AREA_LABELS: Record<MaintenanceRequestResponsibleArea, string> = {
  MANTENIMIENTO: "Mantenimiento",
  PRODUCCION: "Producción",
};

export const RESPONSIBLE_AREA_UNDEFINED_LABEL = "Sin definir";

export function formatResponsibleArea(
  area: MaintenanceRequestResponsibleArea | null | undefined,
): string {
  return area ? RESPONSIBLE_AREA_LABELS[area] : RESPONSIBLE_AREA_UNDEFINED_LABEL;
}

export const RESPONSIBLE_AREA_OPTIONS: { value: MaintenanceRequestResponsibleArea; label: string }[] = [
  { value: "MANTENIMIENTO", label: RESPONSIBLE_AREA_LABELS.MANTENIMIENTO },
  { value: "PRODUCCION", label: RESPONSIBLE_AREA_LABELS.PRODUCCION },
];

/** Valor explícito de URL/filtro para "Sin definir" (responsibleArea = null). */
export const RESPONSIBLE_AREA_UNDEFINED_VALUE = "sin_definir";

/**
 * Responsable = Producción SIN una fecha de compromiso definida: la atención
 * depende de Producción, así que SIMI no debe inventar una fecha (ver
 * CommitmentDateField, detalle de Solicitud). En ese único caso el campo
 * muestra un texto fijo en vez del selector de fecha; cualquier otra
 * combinación (otro responsable, o Producción con una fecha ya cargada)
 * conserva el comportamiento normal del selector.
 */
export function isAwaitingProduccion(
  responsibleArea: MaintenanceRequestResponsibleArea | null,
  commitmentDate: Date | null,
): boolean {
  return responsibleArea === "PRODUCCION" && commitmentDate === null;
}
