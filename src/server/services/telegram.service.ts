import type { MaintenanceRequest } from "@/generated/prisma/client";
import { formatCalendarDate } from "@/lib/dates";
import { formatParteDisplay } from "@/lib/parte";
import { formatResponsibleArea } from "@/lib/responsible-area";

/**
 * Integración directa SIMI → Telegram, notificación de
 * `maintenance_request.created` al grupo de Mantenimiento. Canal adicional
 * e independiente de la integración Vento (vento.service.ts) — ninguno de
 * los dos depende del otro, y un fallo en uno nunca afecta al otro. QUIÉN y
 * CUÁNDO dispararla es responsabilidad exclusiva del llamador (ver
 * applyMaintenanceRequestImport en maintenance-request-import.service.ts,
 * que solo lo hace para filas clasificadas NEW y ya persistidas en
 * PostgreSQL) — este archivo nunca decide eso, y nunca se importa desde un
 * componente de UI.
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

/** YYYY-MM-DD -> igual formato/zona (UTC) que el resto de la interfaz, ver src/lib/dates.ts. */
function buildNotificationText(request: MaintenanceRequest): string {
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

  // VERCEL_URL la provee Vercel automáticamente en todo deployment (Preview
  // y Production) — no requiere configurar ninguna variable adicional. Sin
  // ella (p. ej. en desarrollo local puro) se omite la línea del enlace en
  // vez de construir una URL rota.
  const host = process.env.VERCEL_URL;
  if (host) {
    const link = `https://${host}/solicitudes/${encodeURIComponent(request.parte)}`;
    lines.push("", `🔗 <a href="${escapeHtml(link)}">Ver solicitud en SIMI</a>`);
  }

  return lines.join("\n");
}

/**
 * Envía la notificación de `maintenance_request.created` al grupo de
 * Telegram. Nunca lanza: un fallo (variables sin configurar, chat_id
 * inválido, timeout, red caída, respuesta no-2xx de la API de Telegram) no
 * debe afectar la importación, que ya quedó guardada en PostgreSQL antes de
 * llamar a esta función — solo se registra para diagnóstico, con categorías
 * fijas y saneadas: nunca el token, nunca la URL de la API de Telegram (que
 * lo lleva embebido), nunca el mensaje crudo de fetch.
 */
export async function sendMaintenanceRequestCreatedNotification(
  request: MaintenanceRequest,
): Promise<void> {
  const config = validateTelegramConfig();
  if (!config.ok) {
    console.warn(
      `[telegram] ${config.reason}; se omite la notificación de maintenance_request.created para PARTE ${request.parte}.`,
    );
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
        text: buildNotificationText(request),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `[telegram] La API de Telegram respondió ${response.status} para PARTE ${request.parte}.`,
      );
    }
  } catch (error) {
    console.error(
      `[telegram] No se pudo enviar la notificación de maintenance_request.created para PARTE ${request.parte}: ${classifyFetchError(error)}.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
