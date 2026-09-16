import type { MaintenanceRequest } from "@/generated/prisma/client";

/**
 * Integración real SIMI → Vento AI, evento `maintenance_request.created`.
 * Este servicio decide CÓMO se envía el webhook (URL desde variable de
 * entorno server-only, forma del payload, timeout, manejo de errores).
 * QUIÉN y CUÁNDO dispararlo es responsabilidad exclusiva del llamador
 * (ver applyMaintenanceRequestImport en
 * maintenance-request-import.service.ts, que solo lo hace para filas
 * clasificadas NEW y ya persistidas en PostgreSQL) — este archivo nunca
 * decide eso, y nunca se importa desde un componente de UI.
 */

export interface VentoMaintenanceRequestCreatedPayload {
  event: "maintenance_request.created";
  /** Valor crudo tal como se almacena (con ceros a la izquierda) — NUNCA formatParteDisplay() acá. */
  parte: string;
  maquina: string | null;
  problema: string | null;
  tarea: string | null;
  /** YYYY-MM-DD en UTC, sin desplazamiento de zona horaria — mismo criterio que src/lib/dates.ts. */
  fechaSolicitud: string | null;
  estado: string | null;
  responsibleArea: "MANTENIMIENTO" | "PRODUCCION" | null;
  /** YYYY-MM-DD en UTC, o null si no tiene fecha compromiso definida. */
  commitmentDate: string | null;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

/** YYYY-MM-DD en UTC — misma convención de fecha calendario que el resto del sistema (ver src/lib/dates.ts). */
function toCalendarDateString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function buildMaintenanceRequestCreatedPayload(
  request: MaintenanceRequest,
): VentoMaintenanceRequestCreatedPayload {
  return {
    event: "maintenance_request.created",
    parte: request.parte,
    maquina: request.maquina,
    problema: request.problema,
    tarea: request.tarea,
    fechaSolicitud: toCalendarDateString(request.fecha),
    estado: request.estado,
    responsibleArea: request.responsibleArea,
    commitmentDate: toCalendarDateString(request.commitmentDate),
  };
}

/**
 * Envía `maintenance_request.created` a Vento. Nunca lanza: un fallo del
 * webhook (URL sin configurar, timeout, red caída, respuesta no-2xx) no
 * debe afectar la importación, que ya quedó guardada en PostgreSQL antes
 * de llamar a esta función — solo se registra para diagnóstico, sin
 * exponer nunca la URL (puede llevar token/firma embebida) ni ningún otro
 * secreto en los logs.
 */
export async function sendMaintenanceRequestCreatedEvent(request: MaintenanceRequest): Promise<void> {
  const url = process.env.VENTO_MAINTENANCE_REQUEST_CREATED_URL;
  if (!url) {
    console.warn(
      `[vento] VENTO_MAINTENANCE_REQUEST_CREATED_URL no está configurada; se omite maintenance_request.created para PARTE ${request.parte}.`,
    );
    return;
  }

  const payload = buildMaintenanceRequestCreatedPayload(request);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `[vento] maintenance_request.created respondió ${response.status} para PARTE ${request.parte}.`,
      );
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "error desconocido";
    console.error(
      `[vento] No se pudo enviar maintenance_request.created para PARTE ${request.parte}: ${reason}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
