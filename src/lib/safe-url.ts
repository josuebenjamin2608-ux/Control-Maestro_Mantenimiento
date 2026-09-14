/**
 * Valida que `value` sea una ruta interna relativa segura (empieza con un
 * único "/", nunca "//" ni un esquema tipo "javascript:"/"http:") antes de
 * usarla como destino de navegación — evita que un query param `back`
 * manipulado redirija fuera del sitio.
 */
export function sanitizeInternalPath(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
