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

interface TelegramInlineKeyboardButton {
  text: string;
  /** Botón de acción (dispara un callback_query que procesa el webhook) — nunca una URL. */
  callback_data?: string;
  /** Botón de enlace externo (abre el navegador) — nunca dispara callback_query. */
  url?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

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

type TokenValidationResult = { ok: true; token: string } | { ok: false; reason: string };

/**
 * Igual que validateTelegramConfig, pero solo exige el token del bot —
 * usada por los envíos a un chat_id individual (vinculación de técnico,
 * respuestas del webhook), donde el chat_id nunca sale de una variable de
 * entorno sino de `Technician.telegramChatId` (ya validado al vincularse)
 * o del propio update entrante de Telegram.
 */
function validateBotTokenOnly(): TokenValidationResult {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN no está configurada" };
  }
  if (!BOT_TOKEN_PATTERN.test(token)) {
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN tiene un formato inválido" };
  }
  return { ok: true, token };
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
 * Menú interactivo debajo del mensaje de asignación (grupo y chat privado):
 * "Ver solicitud"/"Ver observaciones" son botones de ACCIÓN (callback_data
 * "req:<parte>"/"obs:<parte>", procesados por el webhook — ver
 * handleTelegramCallbackQuery en route.ts), nunca botones de "iniciar
 * atención"/"finalizar atención"/etc.: esa información sigue siendo
 * exclusiva de las Minutas, Telegram nunca la escribe. "Ver solicitud en
 * SIMI" se conserva como botón de enlace además de la línea de texto ya
 * existente en el mensaje — mismo destino, ninguna funcionalidad quitada.
 * `parte` va crudo (con ceros a la izquierda) en el callback_data, igual
 * criterio que buildSolicitudLink: es el valor real de columna, nunca el
 * formateado para mostrar.
 */
function buildTechnicianAssignedKeyboard(parte: string): TelegramInlineKeyboardMarkup {
  const rows: TelegramInlineKeyboardButton[][] = [
    [
      { text: "📋 Ver solicitud", callback_data: `req:${parte}` },
      { text: "📝 Ver observaciones", callback_data: `obs:${parte}` },
    ],
  ];

  const link = buildSolicitudLink(parte);
  if (link) {
    rows.push([{ text: "🔗 Ver solicitud en SIMI", url: link }]);
  }

  return { inline_keyboard: rows };
}

const MINUTA_DATE_FORMATTER = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

interface RelatedMinutaLog {
  fechaini: Date | null;
  fechafin: Date | null;
  observaciones: string | null;
}

interface SolicitudSummaryRequest {
  parte: string;
  maquina: string | null;
  problema: string | null;
  tarea: string | null;
  estado: string | null;
  fecha: Date | null;
  responsibleArea: MaintenanceRequest["responsibleArea"];
  commitmentDate: Date | null;
  assignedTechnicians: { removedAt: Date | null; technician: { fullName: string } }[];
}

/**
 * Texto del botón "📋 Ver solicitud": consulta EN VIVO (no reusa el texto
 * del mensaje de asignación, que puede quedar desactualizado) la
 * información principal de la Solicitud — misma fuente que la ficha
 * /solicitudes/[parte] (ver getMaintenanceRequestByParte). Solo lectura.
 */
export function buildSolicitudQueryText(request: SolicitudSummaryRequest): string {
  const parteDisplay = formatParteDisplay(request.parte);
  const activeTechnicianNames = request.assignedTechnicians
    .filter((assignment) => assignment.removedAt === null)
    .map((assignment) => assignment.technician.fullName);

  const lines = [
    `📋 <b>SOLICITUD ${escapeHtml(parteDisplay)}</b>`,
    "",
    `<b>Máquina:</b> ${displayOrDash(request.maquina)}`,
    `<b>Problema:</b> ${displayOrDash(request.problema)}`,
    `<b>Tarea:</b> ${displayOrDash(request.tarea)}`,
    `<b>Estado:</b> ${displayOrDash(request.estado)}`,
    `<b>Fecha:</b> ${escapeHtml(formatCalendarDate(request.fecha))}`,
    `<b>Área responsable:</b> ${escapeHtml(formatResponsibleArea(request.responsibleArea))}`,
    `<b>Técnico(s) asignado(s):</b> ${
      activeTechnicianNames.length > 0 ? escapeHtml(activeTechnicianNames.join(", ")) : "Sin asignar"
    }`,
  ];

  if (request.commitmentDate) {
    lines.push(`<b>Fecha compromiso:</b> ${escapeHtml(formatCalendarDate(request.commitmentDate))}`);
  }

  return lines.join("\n");
}

/**
 * Texto del botón "📝 Ver observaciones": CONSULTA de solo lectura de las
 * Minutas ya relacionadas con esta Solicitud (relación existente PARTE <->
 * OBSERVACIONES.trim(), materializada como MaintenanceLog.maintenanceRequestId
 * — ver comentario en maintenance-log-import.service.ts; nunca se recalcula
 * acá). `logs` DEBE venir ya filtrada a esa relación (p. ej.
 * MaintenanceRequest.logs, que por esa misma FK nunca incluye una Minuta
 * PENDING/UNRELATED) — esta función nunca decide qué está relacionado.
 * Minutas relacionadas sin texto en OBSERVACIONES se omiten (no aportan
 * nada que mostrar); si no queda ninguna con texto, se muestra el aviso
 * exacto pedido. Nunca crea ni modifica ninguna Minuta ni Solicitud.
 */
export function buildObservacionesQueryText(parte: string, logs: RelatedMinutaLog[]): string {
  const parteDisplay = formatParteDisplay(parte);
  const title = `📝 <b>OBSERVACIONES — SOLICITUD ${escapeHtml(parteDisplay)}</b>`;

  const withText = logs.filter(
    (log) => log.observaciones !== null && log.observaciones.trim().length > 0,
  );

  if (withText.length === 0) {
    return [title, "", "ℹ️ No hay observaciones registradas para esta solicitud."].join("\n");
  }

  // Cronológico — mismo orden que ya usa la ficha de la solicitud (ver
  // MinutaTimeline, orderBy fechaini "asc"); nunca se reordena por fechafin.
  const entries = withText.map((log) => {
    const date = log.fechafin ?? log.fechaini;
    const dateLabel = date ? MINUTA_DATE_FORMATTER.format(date) : "Sin fecha";
    return `${escapeHtml(dateLabel)} - ${escapeHtml((log.observaciones as string).trim())}`;
  });

  return [title, "", ...entries].join("\n");
}

/** Respuesta del webhook cuando el callback_query trae un PARTE que ya no existe (defensivo; hoy no hay borrado de Solicitudes). */
export function buildSolicitudNotFoundText(parte: string): string {
  return `❌ No se encontró la solicitud PARTE ${escapeHtml(formatParteDisplay(parte))}.`;
}

/** Respuesta del webhook cuando el código de vinculación se procesó con éxito. */
function buildTelegramLinkSuccessText(technicianName: string): string {
  return [
    "✅ Telegram vinculado correctamente con SIMI.",
    "",
    `Técnico: ${escapeHtml(technicianName)}`,
    "",
    "A partir de ahora SIMI podrá enviarte notificaciones individuales de tus tareas de mantenimiento.",
  ].join("\n");
}

/** Respuesta del webhook cuando el texto recibido no coincide con ningún código pendiente y vigente. */
function buildTelegramLinkInvalidCodeText(): string {
  return "❌ Código de vinculación inválido o expirado.";
}

/** Respuesta del webhook cuando el chat_id ya está vinculado a otro técnico. */
function buildTelegramLinkChatAlreadyLinkedText(): string {
  return "❌ Este Telegram ya está vinculado a otro técnico.";
}

function parteLogSuffix(parte: string | null): string {
  return parte ? ` para PARTE ${parte}` : "";
}

/**
 * POST genérico a un método de la API de Telegram (bot<token>/<method>) —
 * infraestructura de envío compartida por todos los eventos de Telegram,
 * tanto al grupo de Mantenimiento como al chat privado de un técnico
 * vinculado, al remitente de un update entrante (webhook), o a la propia
 * API para cerrar un callback_query (answerCallbackQuery). Nunca lanza: un
 * fallo (timeout, red caída, respuesta no-2xx o body.ok=false de la API de
 * Telegram) no debe afectar al llamador, que ya persistió su cambio en
 * PostgreSQL (o no tiene ningún cambio que revertir) antes de invocar esta
 * función.
 *
 * Registra el resultado en los tres casos (éxito, fallo HTTP/API, fallo de
 * red) — un envío exitoso nunca debe quedar indistinguible de una llamada
 * que nunca ocurrió. Siempre con categorías fijas y saneadas: nunca el
 * token, nunca la URL de la API de Telegram (que lo lleva embebido), nunca
 * el mensaje crudo de fetch, nunca el body completo de la respuesta de
 * Telegram (solo error_code/description ya truncados cuando aplica).
 *
 * `token` ya debe venir validado por el llamador (validateTelegramConfig o
 * validateBotTokenOnly) — esta función nunca lee variables de entorno.
 * `logLabel` es solo para los mensajes de log — nunca decide el contenido
 * de `body`. `parte` es `null` únicamente cuando la llamada no está
 * asociada a una Solicitud — en ese caso se omite el sufijo "para PARTE X"
 * del log.
 */
async function callTelegramApi(
  token: string,
  method: string,
  body: Record<string, unknown>,
  logLabel: string,
  parte: string | null,
): Promise<void> {
  const apiUrl = `https://api.telegram.org/bot${token}/${method}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    // La API de Telegram normalmente hace coincidir su propio campo JSON
    // "ok" con el status HTTP, pero no está garantizado — se valida cada
    // uno por separado en vez de asumir que uno implica el otro. Nunca se
    // loggea el body completo, solo error_code/description ya saneados.
    const parsed = await parseTelegramResponseBody(response);

    if (!response.ok) {
      console.error(
        `[telegram] La API de Telegram respondió HTTP ${response.status}${parteLogSuffix(parte)}` +
          (parsed?.error_code !== undefined ? ` (error_code ${parsed.error_code})` : "") +
          `: ${sanitizeTelegramDescription(parsed?.description)}`,
      );
    } else if (!parsed?.ok) {
      console.error(
        `[telegram] La API de Telegram respondió HTTP ${response.status} pero body.ok=false${parteLogSuffix(parte)}` +
          (parsed?.error_code !== undefined ? ` (error_code ${parsed.error_code})` : "") +
          `: ${sanitizeTelegramDescription(parsed?.description)}`,
      );
    } else {
      console.log(`[telegram] ${logLabel} enviado correctamente${parteLogSuffix(parte)}.`);
    }
  } catch (error) {
    console.error(
      `[telegram] No se pudo enviar la notificación de ${logLabel}${parteLogSuffix(parte)}: ${classifyFetchError(error)}.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * `sendMessage` — misma infraestructura (callTelegramApi) que usa todo el
 * resto de este archivo. `replyMarkup` es opcional: cuando se omite, el
 * body queda IDÉNTICO al de siempre (sin campo `reply_markup`) — así los
 * eventos que no llevan menú (maintenance_request.created, la respuesta del
 * webhook de vinculación) quedan exactamente igual que antes.
 */
async function dispatchTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  eventName: string,
  parte: string | null,
  replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<void> {
  await callTelegramApi(
    token,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    },
    eventName,
    parte,
  );
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
  const config = validateTelegramConfig();
  if (!config.ok) {
    console.warn(
      `[telegram] ${config.reason}; se omite la notificación de maintenance_request.created para PARTE ${request.parte}.`,
    );
    return;
  }
  await dispatchTelegramMessage(
    config.token,
    config.chatId,
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
  const config = validateTelegramConfig();
  if (!config.ok) {
    console.warn(
      `[telegram] ${config.reason}; se omite la notificación de technician_assigned para PARTE ${request.parte}.`,
    );
    return;
  }
  await dispatchTelegramMessage(
    config.token,
    config.chatId,
    buildTechnicianAssignedText(request, technicianName),
    "technician_assigned",
    request.parte,
    buildTechnicianAssignedKeyboard(request.parte),
  );
}

/**
 * Notifica `technician_assigned_direct` al chat privado del técnico
 * (Telegram individual vinculado) — NUNCA al grupo de Mantenimiento, y
 * completamente independiente de sendTechnicianAssignedNotification de
 * arriba (que sigue notificando al grupo sin cambios). Mismo contenido
 * exacto que el mensaje de grupo (buildTechnicianAssignedText) — mismo
 * técnico, misma solicitud, solo cambia el destino. QUIÉN y CUÁNDO
 * dispararla es responsabilidad exclusiva del llamador; `telegramChatId`
 * debe venir ya resuelto desde `Technician.telegramChatId` — esta función
 * nunca consulta la base de datos ni decide si el técnico está vinculado.
 */
export async function sendTechnicianAssignedDirectNotification(
  request: MaintenanceRequest,
  technicianName: string,
  telegramChatId: string,
): Promise<void> {
  const config = validateBotTokenOnly();
  if (!config.ok) {
    console.warn(
      `[telegram] ${config.reason}; se omite la notificación directa de technician_assigned_direct para PARTE ${request.parte}.`,
    );
    return;
  }
  await dispatchTelegramMessage(
    config.token,
    telegramChatId,
    buildTechnicianAssignedText(request, technicianName),
    "technician_assigned_direct",
    request.parte,
    buildTechnicianAssignedKeyboard(request.parte),
  );
}

/**
 * Envía una respuesta de texto simple al chat privado que escribió al bot
 * — usada exclusivamente por el webhook de vinculación
 * (/api/telegram/webhook) para confirmar o rechazar un código recibido.
 * Nunca lanza, mismo contrato que el resto de las funciones de envío de
 * este archivo. `buildTelegramLinkSuccessText`/`buildTelegramLinkInvalidCodeText`/
 * `buildTelegramLinkChatAlreadyLinkedText` quedan exportadas para que el
 * route handler arme el texto exacto sin duplicar el escapado HTML acá.
 */
export async function sendTelegramWebhookReply(chatId: string, text: string): Promise<void> {
  const config = validateBotTokenOnly();
  if (!config.ok) {
    console.warn(`[telegram] ${config.reason}; no se pudo enviar la respuesta del webhook de vinculación.`);
    return;
  }
  await dispatchTelegramMessage(config.token, chatId, text, "telegram_link_webhook_reply", null);
}

/**
 * `answerCallbackQuery` — Telegram exige responder a TODO callback_query
 * (botón inline presionado) para que el cliente deje de mostrar el ícono de
 * carga sobre el botón, sin importar si se pudo enviar o no una respuesta
 * de contenido (ver handleTelegramCallbackQuery en route.ts, que llama a
 * esta función siempre, en paralelo con sendTelegramWebhookReply). Nunca
 * lanza, mismo contrato que el resto de las funciones de envío de este
 * archivo. No lleva `text`/`show_alert`: la respuesta de contenido va como
 * un mensaje nuevo al chat (sendTelegramWebhookReply), no como el popup
 * corto de answerCallbackQuery, para no truncar observaciones largas.
 */
export async function answerTelegramCallbackQuery(callbackQueryId: string): Promise<void> {
  const config = validateBotTokenOnly();
  if (!config.ok) {
    console.warn(`[telegram] ${config.reason}; no se pudo responder al callback_query.`);
    return;
  }
  await callTelegramApi(
    config.token,
    "answerCallbackQuery",
    { callback_query_id: callbackQueryId },
    "callback_query_ack",
    null,
  );
}

export {
  buildTelegramLinkSuccessText,
  buildTelegramLinkInvalidCodeText,
  buildTelegramLinkChatAlreadyLinkedText,
};
