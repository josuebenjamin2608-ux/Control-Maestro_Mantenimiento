import { db } from "@/lib/db";

/**
 * Creación de Minutas disparada por el flujo de Telegram "Agregar
 * observación" (ver route.ts y telegram.service.ts). Vive en un archivo
 * propio — NUNCA en maintenance-log-import.service.ts, que es exclusivo
 * del motor de importación desde Excel y queda fuera de alcance — pero
 * reutiliza EXACTAMENTE la misma tabla y el mismo invariante de relación
 * que ese archivo ya establece: `maintenanceRequestId` se completa si y
 * solo si la PARTE coincide EXACTAMENTE con `MaintenanceRequest.parte`
 * (relationStatus "RELATED"), nunca por una relación difusa o aproximada.
 * No existe una tabla ni un campo nuevo: "quién la registró" reutiliza
 * `codemp`/`empleado`, "fecha y hora" reutiliza `fechaini`/`fechafin`,
 * igual que cualquier otra Minuta.
 *
 * Regla explícita y deliberada: esta función NUNCA toca
 * `MaintenanceRequest.estado`. Registrar una observación y cerrar una
 * Solicitud son acciones distintas — el cierre sigue siendo
 * responsabilidad exclusiva de cualquier flujo ya existente que lo haga
 * hoy, que esta función ni siquiera conoce.
 *
 * `fechafin` se deja EN NULO a propósito (solo se completa `fechaini`):
 * `getLatestFechafinByRequest` (indicators.service.ts) usa el FECHAFIN más
 * reciente entre las Minutas RELATED de una Solicitud para "Tareas cerradas
 * en el período", "Cumplimiento de compromisos" y la columna "Fecha de
 * Atención Evento" del Excel — ninguna de esas tres lecturas filtra por
 * ESTADO, así que un `fechafin` real acá haría que una simple observación
 * sobre una Solicitud todavía ABIERTA se contara como un cierre para esas
 * métricas (o, sobre una ya Realizado, pisara la fecha de cierre real y
 * alterara su cumplimiento) — exactamente lo que la regla de arriba
 * prohíbe. Con `fechafin: null`, esta Minuta queda automáticamente excluida
 * de esas tres lecturas (filtran `fechafin: { not: null }`) sin tocar
 * ninguna línea de indicators.service.ts ni de solicitudes-export.service.ts.
 * Para "Historial de atención" y la columna OBSERVACIONES del Excel esto no
 * pierde nada: ambos ya muestran `fechafin ?? fechaini`, así que la fecha
 * visible sigue siendo `fechaini` (el momento real del registro).
 */

/** Ventana para la guarda de duplicados — ver registerObservacionFromTelegram. */
const DUPLICATE_GUARD_WINDOW_MS = 2 * 60_000;

export interface RegisterObservacionInput {
  /** Valor crudo de PARTE (con ceros a la izquierda), nunca el formateado para mostrar. */
  parte: string;
  texto: string;
  technician: { employeeCode: string; fullName: string };
}

export type RegisterObservacionResult =
  | { outcome: "registered"; maquina: string | null }
  | { outcome: "solicitud_not_found" };

/**
 * Registra una observación como una Minuta nueva relacionada con la
 * Solicitud PARTE. Nunca crea una Minuta para un PARTE inexistente: valida
 * primero contra MaintenanceRequest (findUnique por `parte`, igual
 * búsqueda exacta que usa el resto del sistema) y devuelve
 * `solicitud_not_found` sin escribir nada si no existe.
 *
 * Guarda de duplicados: si ya existe una Minuta para la MISMA Solicitud con
 * el MISMO texto exacto en OBSERVACIONES, creada dentro de los últimos
 * DUPLICATE_GUARD_WINDOW_MS, no crea una segunda fila — devuelve el mismo
 * resultado que si se hubiera creado, para que un reintento de Telegram
 * (el mismo update entregado dos veces) o un doble-tap del usuario nunca
 * produzcan una Minuta repetida. Usa solo columnas que ya existen
 * (`maintenanceRequestId` + `observaciones` + `createdAt`), sin ninguna
 * tabla ni campo nuevo.
 *
 * `registro` (identificador externo único de Minuta, columna REGISTRO del
 * Excel) no tiene equivalente real proveniente de Telegram: se genera un
 * valor sintético con prefijo `TG-` para que quede trazable como originado
 * en este flujo, sin inventar una convención ajena a la que ya usa el
 * archivo de Minutas. Incluye un sufijo aleatorio además del timestamp para
 * que dos observaciones creadas dentro del mismo milisegundo (poco
 * probable, pero posible bajo carga) nunca choquen contra el `@unique` de
 * esta columna.
 */
function generateRegistro(maintenanceRequestId: string, now: Date): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `TG-${maintenanceRequestId}-${now.getTime()}-${randomSuffix}`;
}

export async function registerObservacionFromTelegram(
  input: RegisterObservacionInput,
): Promise<RegisterObservacionResult> {
  const request = await db.maintenanceRequest.findUnique({
    where: { parte: input.parte },
    select: { id: true, maquina: true },
  });
  if (!request) {
    return { outcome: "solicitud_not_found" };
  }

  const recentDuplicate = await db.maintenanceLog.findFirst({
    where: {
      maintenanceRequestId: request.id,
      observaciones: input.texto,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_GUARD_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recentDuplicate) {
    return { outcome: "registered", maquina: request.maquina };
  }

  const now = new Date();
  await db.maintenanceLog.create({
    data: {
      registro: generateRegistro(request.id, now),
      fechaini: now,
      fechafin: null,
      maquina: request.maquina,
      codemp: input.technician.employeeCode,
      empleado: input.technician.fullName,
      observaciones: input.texto,
      parteRaw: input.parte,
      relationStatus: "RELATED",
      maintenanceRequestId: request.id,
      isHistorical: false,
    },
  });

  return { outcome: "registered", maquina: request.maquina };
}
