import type { MaintenanceRequest } from "@/generated/prisma/client";
import { formatCalendarDate } from "@/lib/dates";
import { formatParteDisplay } from "@/lib/parte";
import { formatResponsibleArea } from "@/lib/responsible-area";

/**
 * Integración directa SIMI → Telegram al grupo de Mantenimiento. Dos
 * eventos hoy, ambos comparten la misma infraestructura de envío
 * (dispatchTelegramMessage abajo) y nunca dependen el uno del otro:
 * - `maintenance_request.created`: ver applyMaintenanceRequestImport en
 *   maintenance-request-import.service.ts, que solo lo dispara para filas
 *   clasificadas NEW y ya persistidas en PostgreSQL.
 * - `technician_assigned`: ver assignTechnicianToRequest en
 *   src/server/actions/technicians.ts, que solo lo dispara cuando
 *   realmente se creó una fila nueva en MaintenanceRequestTechnician (no
 *   cuando el técnico ya estaba asignado).
 * Canal adicional e independiente de la integración Vento
 * (vento.service.ts) — un fallo en uno nunca afecta al otro. QUIÉN y
 * CUÁNDO disparar cada evento es responsabilidad exclusiva del llamador —
 * este archivo nunca decide eso, y nunca se importa desde un componente
 * de UI.
 *
 * El token del bot va embebido en la URL de la API de Telegram
 * (https://api.telegram.org/bot<TOKEN>/sendMessage) — por eso, a
 * diferencia de un webhook genérico, acá NINGÚN mensaje de log puede
 * incluir esa URL bajo ninguna circunstancia, ni siquiera parcialmente:
 * cualquier fragmento de ella expone el token.
 */

const TELEGRAM_API_TIMEOUT_MS = 10_000;
/** Telegram exige que el token del bot tenga esta forma: <bot_id>:<hash>. */
const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function displayOrDash(value: string | null): string {
  return value ? escapeHtml(value) : "—";
}

type ConfigValidationResult = { ok: true; token: string; chatId: string } | { ok: false; reason: string };

/**
 * Valida las dos variables de entorno requeridas ANTES de construir la URL
 * de la API o llamar a fetch — igual que validateWebhookUrl en
 * vento.service.ts. Nunca devuelve ni loggea el valor del token; el reason
 * es siempre un texto fijo.
 */
function validateTelegramConfig(): ConfigValidationResult {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_MAINTENANCE_CHAT_ID;

  if (!token) {
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN no está configurada" };
  }
  if (!chatId) {
    return { ok: false, reason: "TELEGRAM_MAINTENANCE_CHAT_ID no está configurada" };
  }
  if (!BOT_TOKEN_PATTERN.test(token)) {
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN tiene un formato inválido" };
  }
  // chat_id de un grupo de Telegram es siempre un entero (negativo para
  // grupos/supergrupos, ver -5522282943 en este caso) — nunca se acepta
  // texto arbitrario ni se intenta "corregir" el valor.
  if (!/^-?\d+$/.test(chatId) || !Number.isInteger(Number(chatId)) || Number(chatId) === 0) {
    return { ok: false, reason: "TELEGRAM_MAINTENANCE_CHAT_ID no es un chat_id numérico válido" };
  }

  return { ok: true, token, chatId };
}

/**
 * Clasifica un error de fetch en una categoría fija y segura para loggear —
 * NUNCA el mensaje crudo del error, que en Node puede incluir la URL de
 * entrada completa (y por lo tanto, para la API de Telegram, el token).
 */
function classifyFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "error de conexión";
}

interface TelegramApiResponseBody {
  ok?: boolean;
  error_code?: number;
  description?: string;
}

/**
 * Trunca la descripción que devuelve la propia API de Telegram. La genera
 * Telegram, no nuestro código, así que nunca puede contener el token ni la
 * URL de la API (nunca se los enviamos de vuelta) — se acota igual por
 * defensa en profundidad, nunca se loggea el body completo.
 */
function sanitizeTelegramDescription(description: unknown): string {
  if (typeof description !== "string" || description.length === 0) return "sin descripción";
  return description.slice(0, 200);
}

/** `response.json()` solo puede leerse una vez; si el cuerpo no es JSON válido, se trata como "sin información adicional" en vez de propagar la excepción. */
async function parseTelegramResponseBody(response: Response): Promise<TelegramApiResponseBody | null> {
  try {
    return (await response.json()) as TelegramApiResponseBody;
  } catch {
    return null;
  }
}

/**
 * Enlace a la ficha de la solicitud en SIMI, o `null` si VERCEL_URL no está
 * disponible (p. ej. desarrollo local puro) — en ese caso el llamador omite
 * la línea del enlace en vez de construir una URL rota. La provee Vercel
 * automáticamente en todo deployment (Preview y Production), sin requerir
 * ninguna variable adicional.
 */
function buildSolicitudLink(parte: string): string | null {
  const host = process.env.VERCEL_URL;
  if (!host) return null;
  return `https://${host}/solicitudes/${encodeURIComponent(parte)}`;
}

/** YYYY-MM-DD -> igual formato/zona (UTC) que el resto de la interfaz, ver src/lib/dates.ts. */
function buildMaintenanceRequestCreatedText(request: MaintenanceRequest): string {
  const parteDisplay = formatParteDisplay(request.parte);
  const lines = [
    "🔧 <b>NUEVA SOLICITUD DE MANTENIMIENTO</b>",
    "",
    `<b>PARTE:</b> ${escapeHtml(parteDisplay)}`,
    `<b>Máquina:</b> ${displayOrDash(request.maquina)}`,
    `<b>Problema:</b> ${displayOrDash(request.problema)}`,
    `<b>Tarea:</b> ${displayOrDash(request.tarea)}`,
    `<b>Estado:</b> ${displayOrDash(request.estado)}`,
    `<b>Fecha de solicitud:</b> ${escapeHtml(formatCalendarDate(request.fecha))}`,
    `<b>Área responsable:</b> ${escapeHtml(formatResponsibleArea(request.responsibleArea))}`,
  ];

  const link = buildSolicitudLink(request.parte);
  if (link) {
    lines.push("", `🔗 <a href="${escapeHtml(link)}">Ver solicitud en SIMI</a>`);
  }

  return lines.join("\n");
}

/**
 * `parte` se usa crudo (con ceros a la izquierda) para construir el enlace
 * — NUNCA formatParteDisplay() ahí, mismo criterio que el resto del
 * sistema (ver src/lib/parte.ts); formatParteDisplay() solo se usa para el
 * texto visible del PARTE.
 */
function buildTechnicianAssignedText(request: MaintenanceRequest, technicianName: string): string {
  const parteDisplay = formatParteDisplay(request.parte);
  const lines = [
    "🔧 <b>ASIGNACIÓN DE MANTENIMIENTO</b>",
    "",
    `<b>PARTE:</b> ${escapeHtml(parteDisplay)}`,
    `<b>Máquina:</b> ${displayOrDash(request.maquina)}`,
    `<b>Técnico asignado:</b> ${escapeHtml(technicianName)}`,
    `<b>Estado:</b> ${displayOrDash(request.estado)}`,
  ];

  const link = buildSolicitudLink(request.parte);
  if (link) {
    lines.push("", `🔗 <a href="${escapeHtml(link)}">Ver solicitud en SIMI</a>`);
  }

  return lines.join("\n");
}

/**
 * Infraestructura de envío compartida por todos los eventos de Telegram.
 * Nunca lanza: un fallo (variables sin configurar, chat_id inválido,
 * timeout, red caída, respuesta no-2xx o body.ok=false de la API de
 * Telegram) no debe afectar al llamador, que ya persistió su cambio en
 * PostgreSQL antes de invocar esta función.
 *
 * Registra el resultado en los tres casos (éxito, fallo HTTP/API, fallo de
 * red) — un envío exitoso nunca debe quedar indistinguible de una llamada
 * que nunca ocurrió. Siempre con categorías fijas y saneadas: nunca el
 * token, nunca la URL de la API de Telegram (que lo lleva embebido), nunca
 * el mensaje crudo de fetch, nunca el body completo de la respuesta de
 * Telegram (solo error_code/description ya truncados cuando aplica).
 *
 * `eventName` es solo para los mensajes de log (p. ej. "maintenance_request.created",
 * "technician_assigned") — nunca decide el contenido del mensaje enviado a
 * Telegram, que ya llega armado en `text`.
 */
async function dispatchTelegramMessage(text: string, eventName: string, parte: string): Promise<void> {
  const config = validateTelegramConfig();
  if (!config.ok) {
    console.warn(`[telegram] ${config.reason}; se omite la notificación de ${eventName} para PARTE ${parte}.`);
    return;
  }

  const apiUrl = `https://api.telegram.org/bot${config.token}/sendMessage`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    // La API de Telegram normalmente hace coincidir su propio campo JSON
    // "ok" con el status HTTP, pero no está garantizado — se valida cada
    // uno por separado en vez de asumir que uno implica el otro. Nunca se
    // loggea el body completo, solo error_code/description ya saneados.
    const body = await parseTelegramResponseBody(response);

    if (!response.ok) {
      console.error(
        `[telegram] La API de Telegram respondió HTTP ${response.status} para PARTE ${parte}` +
          (body?.error_code !== undefined ? ` (error_code ${body.error_code})` : "") +
          `: ${sanitizeTelegramDescription(body?.description)}`,
      );
    } else if (!body?.ok) {
      console.error(
        `[telegram] La API de Telegram respondió HTTP ${response.status} pero body.ok=false para PARTE ${parte}` +
          (body?.error_code !== undefined ? ` (error_code ${body.error_code})` : "") +
          `: ${sanitizeTelegramDescription(body?.description)}`,
      );
    } else {
      console.log(`[telegram] ${eventName} enviado correctamente para PARTE ${parte}.`);
    }
  } catch (error) {
    console.error(
      `[telegram] No se pudo enviar la notificación de ${eventName} para PARTE ${parte}: ${classifyFetchError(error)}.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Notifica `maintenance_request.created` al grupo de Telegram. QUIÉN y
 * CUÁNDO dispararla es responsabilidad exclusiva del llamador (ver
 * applyMaintenanceRequestImport en maintenance-request-import.service.ts,
 * que solo lo hace para filas clasificadas NEW y ya persistidas en
 * PostgreSQL).
 */
export async function sendMaintenanceRequestCreatedNotification(
  request: MaintenanceRequest,
): Promise<void> {
  await dispatchTelegramMessage(
    buildMaintenanceRequestCreatedText(request),
    "maintenance_request.created",
    request.parte,
  );
}

/**
 * Notifica `technician_assigned` al grupo de Telegram. QUIÉN y CUÁNDO
 * dispararla es responsabilidad exclusiva del llamador (ver
 * assignTechnicianToRequest en src/server/actions/technicians.ts, que solo
 * lo hace cuando realmente se creó una fila nueva en
 * MaintenanceRequestTechnician — nunca cuando el técnico ya estaba
 * activamente asignado). Regla estricta: BD create exitoso -> Telegram,
 * nunca al revés; este archivo nunca escribe en la base de datos.
 */
export async function sendTechnicianAssignedNotification(
  request: MaintenanceRequest,
  technicianName: string,
): Promise<void> {
  await dispatchTelegramMessage(
    buildTechnicianAssignedText(request, technicianName),
    "technician_assigned",
    request.parte,
  );
}
