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

type UrlValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Valida VENTO_MAINTENANCE_REQUEST_CREATED_URL antes de usarla: debe ser una
 * URL absoluta bien formada con protocolo https. Rechaza cualquier otra cosa
 * (prefijos accidentales tipo "POST ", texto plano, http sin TLS, etc.) ANTES
 * de llegar a fetch — así el error queda clasificado con un motivo fijo y
 * saneado en vez del TypeError nativo de fetch, cuyo mensaje repite el string
 * de entrada completo (y por lo tanto podría incluir la URL con un token
 * embebido si el valor mal configurado fuera parcialmente una URL válida).
 * Nunca devuelve el valor recibido ni un fragmento de él.
 */
function validateWebhookUrl(rawUrl: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "webhook URL inválida (no se pudo interpretar como URL)" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "webhook URL inválida (se requiere protocolo https)" };
  }
  return { ok: true };
}

/**
 * Clasifica un error de fetch en una categoría fija y segura para loggear —
 * NUNCA el mensaje crudo del error, que en Node puede incluir la URL de
 * entrada completa (y por lo tanto un token embebido en ella).
 */
function classifyFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "error de conexión";
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
 * webhook (URL sin configurar, URL inválida, timeout, red caída, respuesta
 * no-2xx) no debe afectar la importación, que ya quedó guardada en
 * PostgreSQL antes de llamar a esta función — solo se registra para
 * diagnóstico, con categorías fijas y saneadas (nunca la URL completa, que
 * puede llevar token/firma embebida, ni el mensaje crudo de fetch, que en
 * Node repite el string de entrada tal cual).
 */
export async function sendMaintenanceRequestCreatedEvent(request: MaintenanceRequest): Promise<void> {
  const url = process.env.VENTO_MAINTENANCE_REQUEST_CREATED_URL;
  if (!url) {
    console.warn(
      `[vento] VENTO_MAINTENANCE_REQUEST_CREATED_URL no está configurada; se omite maintenance_request.created para PARTE ${request.parte}.`,
    );
    return;
  }

  const validation = validateWebhookUrl(url);
  if (!validation.ok) {
    console.error(
      `[vento] ${validation.reason} para maintenance_request.created (PARTE ${request.parte}); revisa VENTO_MAINTENANCE_REQUEST_CREATED_URL.`,
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
    console.error(
      `[vento] No se pudo enviar maintenance_request.created para PARTE ${request.parte}: ${classifyFetchError(error)}.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
