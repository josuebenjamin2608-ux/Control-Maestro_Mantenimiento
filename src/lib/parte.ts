/**
 * PARTE se almacena, se usa en URLs, en búsquedas/filtros y en la relación
 * Solicitud↔Minuta exactamente como viene del Excel (p. ej. "00002119", con
 * ceros a la izquierda) — ninguno de esos usos pasa por esta función. Esto
 * es PURAMENTE de presentación: recorta los ceros iniciales para mostrar
 * "2119" en vez de "00002119" en la interfaz.
 *
 * Si el valor no es puramente numérico (o viene vacío/null/undefined), se
 * devuelve tal cual — nunca se intenta reinterpretar un identificador no
 * numérico ni se inventa un valor para uno vacío.
 */
export function formatParteDisplay(parte: string): string;
export function formatParteDisplay(parte: string | null | undefined): string | null | undefined;
export function formatParteDisplay(parte: string | null | undefined): string | null | undefined {
  if (parte == null) return parte;
  if (!/^\d+$/.test(parte)) return parte;
  return parte.replace(/^0+/, "") || "0";
}
