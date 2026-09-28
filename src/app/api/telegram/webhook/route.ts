import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getMaintenanceRequestByParte } from "@/server/services/maintenance-requests.service";
import { registerObservacionFromTelegram } from "@/server/services/telegram-observacion.service";
import {
  consumeTechnicianTelegramLinkCode,
  getActiveTechnicianByTelegramChatId,
  type AuthorizedTelegramTechnician,
} from "@/server/services/technician-telegram-link.service";
import {
  answerTelegramCallbackQuery,
  answerTelegramCallbackQueryWithAlert,
  buildAgregarObservacionPromptText,
  buildHistorialAtencionQueryText,
  buildObservacionCancelledText,
  buildObservacionEmptyTextWarning,
  buildObservacionRegisteredText,
  buildSolicitudNotFoundText,
  buildSolicitudQueryText,
  buildTelegramActionNotAuthorizedText,
  buildTelegramLinkChatAlreadyLinkedText,
  buildTelegramLinkInvalidCodeText,
  buildTelegramLinkSuccessText,
  isObservacionCancelCommand,
  parseAgregarObservacionPromptParte,
  sendTelegramWebhookReply,
} from "@/server/services/telegram.service";

/**
 * Endpoint que Telegram invoca (vía setWebhook) por cada update dirigido a
 * @SIMI_Mantenimiento_bot.
 *
 * SEGURIDAD — validación del secret_token (SEC-01):
 * TODO request debe traer el header `X-Telegram-Bot-Api-Secret-Token`
 * exactamente igual a `TELEGRAM_WEBHOOK_SECRET`, comparado con
 * `timingSafeEqual` (nunca `===`, que filtra tiempo de comparación).
 * `TELEGRAM_WEBHOOK_SECRET` es OBLIGATORIA: si no está configurada, TODO
 * request se rechaza (falla cerrado, nunca abierto) — a diferencia del
 * comportamiento anterior, que omitía el chequeo sin la variable. Este
 * chequeo corre ANTES de leer/interpretar el body, así que ningún dato del
 * request (`from.id`, `chat.id`, `callback_data`, texto) se usa para nada
 * hasta que se confirma que el request realmente vino de Telegram.
 *
 * Este secreto se configura UNA VEZ vía la API de Telegram (`setWebhook`
 * con `secret_token`) — nunca lo genera ni lo envía este código. La razón
 * por la que el chequeo se había quitado anteriormente (ver historial git,
 * commit 4f994c8): el `secret_token` registrado en `setWebhook` no
 * coincidía con `TELEGRAM_WEBHOOK_SECRET` en Vercel, así que Telegram
 * reportaba "Wrong response from the webhook: 401 Unauthorized" en
 * `getWebhookInfo` y NINGÚN update llegaba nunca. El mecanismo en sí nunca
 * fue el problema — fue un desajuste entre dos configuraciones separadas.
 * Antes de depender de este chequeo en producción, hay que (1) confirmar
 * que `TELEGRAM_WEBHOOK_SECRET` está configurada en Vercel, (2) volver a
 * llamar `setWebhook` con `secret_token` = ese mismo valor exacto, y (3)
 * confirmar con `getWebhookInfo` que las entregas ya no fallan con 401.
 *
 * SEGURIDAD — autorización (SEC-02/SEC-03): una vez validado el secreto,
 * `callback_query.from.id`/`message.from.id` sí son confiables (los puso
 * Telegram, no el llamador) — recién ahí tiene sentido usarlos para
 * autorizar. Las tres acciones del menú de asignación ("Ver solicitud",
 * "Agregar observación", "Historial de atención") exigen por igual que
 * quien las presiona sea un técnico activo con Telegram vinculado (ver
 * getActiveTechnicianByTelegramChatId) — nunca se consulta ni se revela
 * información de una Solicitud (ni siquiera si el PARTE existe) antes de
 * confirmar esa autorización. Un usuario no autorizado recibe siempre el
 * mismo popup genérico (buildTelegramActionNotAuthorizedText), sin importar
 * qué botón haya presionado ni si el PARTE existe.
 *
 * Único camino de escritura hacia una Minuta: el mensaje de TEXTO que
 * responde (reply_to_message) al prompt de "Agregar observación" — ver
 * handleAgregarObservacionReply, que revalida el mismo chequeo de técnico
 * (independientemente del que ya pasó al presionar el botón, porque
 * cualquier persona del grupo podría citar el mismo mensaje ajeno).
 *
 * Único camino de escritura hacia vinculación de técnico: un mensaje de
 * texto privado con un código pendiente — consumeTechnicianTelegramLinkCode
 * (technician-telegram-link.service.ts), que únicamente sabe rechazar por
 * código inválido/expirado/usado, rechazar por chat_id ya vinculado a otro
 * técnico, o vincular.
 *
 * Siempre responde 200 a Telegram para cualquier resultado de negocio
 * (código inválido, chat ya vinculado, update ignorado, callback_data no
 * reconocido, usuario no autorizado, PARTE inexistente, cancelación, texto
 * vacío) — solo la falla de autenticación del secreto responde 401.
 * Responder 2xx en los demás casos evita que Telegram reintente
 * indefinidamente el mismo update.
 */

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * Comparación de tiempo constante — nunca `===`, que puede filtrar cuántos
 * caracteres iniciales coinciden con el tiempo que tarda en responder.
 * `timingSafeEqual` exige buffers de igual longitud; una longitud distinta
 * ya implica "no coincide" sin necesidad de comparar contenido.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Falla CERRADO: sin `TELEGRAM_WEBHOOK_SECRET` configurada, ningún request
 * se considera válido — nunca se omite el chequeo como antes. El valor del
 * secreto nunca se loggea, ni acá ni en ningún otro punto de este archivo.
 */
function isValidWebhookSecret(request: Request): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) return false;
  const providedSecret = request.headers.get(TELEGRAM_SECRET_HEADER);
  if (!providedSecret) return false;
  return safeEqual(providedSecret, expectedSecret);
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramUser {
  id: number;
}

interface TelegramMessage {
  chat: TelegramChat;
  text?: string;
  from?: TelegramUser;
  /** Presente cuando el usuario responde a un mensaje anterior — usado para reconocer una respuesta al prompt de "Agregar observación" (ver parseAgregarObservacionPromptParte). */
  reply_to_message?: { text?: string };
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: TelegramUser;
  /** Ausente cuando el mensaje original es demasiado viejo para que Telegram lo siga referenciando — en ese caso solo se confirma el callback_query, sin poder responder en el chat. */
  message?: { chat: TelegramChat };
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

type CallbackAction = "solicitud" | "historial" | "observacion";

/**
 * "req:<parte>" -> Ver solicitud, "hist:<parte>" -> Historial de atención,
 * "addobs:<parte>" -> Agregar observación. "obs:<parte>" se conserva como
 * alias de "hist" por compatibilidad: mensajes de asignación ya enviados
 * antes de este cambio conservan su teclado original con ese
 * callback_data, y deben seguir funcionando exactamente igual (ahora
 * mostrando el historial de atención). Cualquier otro valor se ignora
 * (defensivo: nunca debería llegar desde nuestro propio teclado).
 */
function parseCallbackData(data: string): { action: CallbackAction; parte: string } | null {
  const separatorIndex = data.indexOf(":");
  if (separatorIndex === -1) return null;
  const action = data.slice(0, separatorIndex);
  const parte = data.slice(separatorIndex + 1);
  if (!parte) return null;
  if (action === "req") return { action: "solicitud", parte };
  if (action === "hist" || action === "obs") return { action: "historial", parte };
  if (action === "addobs") return { action: "observacion", parte };
  return null;
}

/**
 * "Agregar observación": SOLO autoriza (ya verificado por el llamador,
 * `technician` viene resuelto) y envía el prompt — NUNCA escribe una
 * Minuta (eso ocurre únicamente al recibir la respuesta de texto, ver
 * handleAgregarObservacionReply).
 */
async function handleAgregarObservacionCallback(
  callbackQuery: TelegramCallbackQuery,
  parte: string,
  chatId: string,
): Promise<NextResponse> {
  const ackPromise = answerTelegramCallbackQuery(callbackQuery.id);
  const request = await getMaintenanceRequestByParte(parte);

  if (!request) {
    await Promise.allSettled([ackPromise, sendTelegramWebhookReply(chatId, buildSolicitudNotFoundText(parte))]);
    return NextResponse.json({ ok: true });
  }

  await Promise.allSettled([
    ackPromise,
    sendTelegramWebhookReply(chatId, buildAgregarObservacionPromptText(parte), {
      force_reply: true,
      selective: true,
    }),
  ]);
  return NextResponse.json({ ok: true });
}

/**
 * "Ver solicitud"/"Historial de atención": SOLO CONSULTA, ya autorizada por
 * el llamador. getMaintenanceRequestByParte ya trae `logs` filtrada a la
 * relación existente (FK maintenanceRequestId, nunca una PENDING/UNRELATED
 * — ver comentario en maintenance-log-import.service.ts) y
 * `assignedTechnicians`, sin necesidad de ninguna consulta ni relación
 * nueva.
 */
async function handleSolicitudOrHistorialCallback(
  callbackQuery: TelegramCallbackQuery,
  action: "solicitud" | "historial",
  parte: string,
  chatId: string,
): Promise<NextResponse> {
  const ackPromise = answerTelegramCallbackQuery(callbackQuery.id);

  const request = await getMaintenanceRequestByParte(parte);
  const replyText = !request
    ? buildSolicitudNotFoundText(parte)
    : action === "solicitud"
      ? buildSolicitudQueryText(request)
      : buildHistorialAtencionQueryText(parte, request.maquina, request.logs);

  // sendTelegramWebhookReply/answerTelegramCallbackQuery nunca lanzan por
  // contrato, pero se envuelven en Promise.allSettled de todas formas
  // (mismo patrón defensivo que assignTechnicianToRequest) para que, aunque
  // ese contrato se violara alguna vez, jamás impida responder 200.
  await Promise.allSettled([ackPromise, sendTelegramWebhookReply(chatId, replyText)]);
  return NextResponse.json({ ok: true });
}

/**
 * Único punto de entrada de callback_query: parsea la acción y, si hay una
 * Solicitud involucrada (las 3 acciones del menú), exige SIEMPRE un técnico
 * activo con Telegram vinculado ANTES de tocar cualquier dato de esa
 * Solicitud — "Ver solicitud"/"Historial de atención" ya no son de acceso
 * libre (SEC-03). Un usuario no autorizado recibe el mismo popup genérico
 * sin importar qué botón presionó ni si el PARTE existe (objetivo 4:
 * nunca revelar existencia de PARTE ni datos de técnicos a quien no está
 * autorizado). `callback_query.from.id` recién es confiable acá porque el
 * secreto del webhook ya se validó en POST antes de llegar a esta función.
 */
async function handleTelegramCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<NextResponse> {
  const parsed = callbackQuery.data ? parseCallbackData(callbackQuery.data) : null;
  const chatId = callbackQuery.message ? String(callbackQuery.message.chat.id) : null;

  if (!parsed || !chatId) {
    await Promise.allSettled([answerTelegramCallbackQuery(callbackQuery.id)]);
    return NextResponse.json({ ok: true });
  }

  const technician = await getActiveTechnicianByTelegramChatId(String(callbackQuery.from.id));
  if (!technician) {
    await Promise.allSettled([
      answerTelegramCallbackQueryWithAlert(callbackQuery.id, buildTelegramActionNotAuthorizedText()),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (parsed.action === "observacion") {
    return handleAgregarObservacionCallback(callbackQuery, parsed.parte, chatId);
  }
  return handleSolicitudOrHistorialCallback(callbackQuery, parsed.action, parsed.parte, chatId);
}

/**
 * Único lugar donde este endpoint crea una Minuta. Requiere, además del
 * PARTE ya recuperado del prompt (ver parseAgregarObservacionPromptParte),
 * que quien ENVIÓ este mensaje (`message.from.id`, no el chat) sea también
 * un técnico activo vinculado — se revalida acá, independientemente de que
 * ya se haya validado al presionar el botón, porque cualquier persona del
 * grupo podría citar (reply) el mismo mensaje de prompt ajeno. Si no es un
 * técnico autorizado, se ignora sin crear nada y sin confundirse con el
 * flujo de vinculación por código — tampoco se envía ninguna respuesta,
 * para no revelar que el prompt correspondía a un PARTE real. Dos salidas
 * sin escritura, ambas con respuesta explícita (solo para quien SÍ está
 * autorizado): "cancelar"/"/cancelar" cancela el flujo
 * (buildObservacionCancelledText), y un texto vacío se rechaza con un
 * aviso (buildObservacionEmptyTextWarning).
 */
async function handleAgregarObservacionReply(message: TelegramMessage, parte: string): Promise<NextResponse> {
  const fromId = message.from ? String(message.from.id) : null;
  const technician: AuthorizedTelegramTechnician | null = fromId
    ? await getActiveTechnicianByTelegramChatId(fromId)
    : null;
  if (!technician) {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const texto = (message.text ?? "").trim();

  if (isObservacionCancelCommand(texto)) {
    await Promise.allSettled([sendTelegramWebhookReply(chatId, buildObservacionCancelledText())]);
    return NextResponse.json({ ok: true });
  }

  if (!texto) {
    await Promise.allSettled([sendTelegramWebhookReply(chatId, buildObservacionEmptyTextWarning())]);
    return NextResponse.json({ ok: true });
  }

  const result = await registerObservacionFromTelegram({
    parte,
    texto,
    technician: { employeeCode: technician.employeeCode, fullName: technician.fullName },
  });

  const replyText =
    result.outcome === "solicitud_not_found"
      ? buildSolicitudNotFoundText(parte)
      : buildObservacionRegisteredText(parte, texto);

  await Promise.allSettled([sendTelegramWebhookReply(chatId, replyText)]);
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  // SEC-01: valida el secret_token ANTES de leer el body — ningún dato del
  // request se interpreta hasta confirmar que el origen es realmente
  // Telegram. Falla cerrado: sin TELEGRAM_WEBHOOK_SECRET configurada, o con
  // el header ausente/incorrecto, se rechaza con 401 sin más información.
  if (!isValidWebhookSecret(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    // Body no es JSON válido: no hay nada que procesar. Se responde 200
    // igual, para que Telegram no reintente un update irrecuperable.
    return NextResponse.json({ ok: true });
  }

  if (update.callback_query) {
    return handleTelegramCallbackQuery(update.callback_query);
  }

  const message = update.message;
  if (!message || !message.text) {
    // Solo interesan mensajes de texto — todo lo demás (stickers, comandos
    // sin texto, etc.) se ignora sin error.
    return NextResponse.json({ ok: true });
  }

  // "Agregar observación" se reconoce ANTES del filtro de chat privado de
  // abajo: el prompt se envía al mismo chat donde se presionó el botón
  // (grupo o privado), así que su respuesta debe procesarse en ambos casos
  // — filtrar acá por chat privado descartaría en silencio una respuesta
  // enviada desde el grupo.
  const observacionParte = parseAgregarObservacionPromptParte(message.reply_to_message?.text);
  if (observacionParte) {
    return handleAgregarObservacionReply(message, observacionParte);
  }

  if (message.chat.type !== "private") {
    // El flujo de código de vinculación sigue siendo exclusivamente de
    // chat privado, sin cambios.
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const result = await consumeTechnicianTelegramLinkCode(message.text, chatId);

  const replyText =
    result.outcome === "linked"
      ? buildTelegramLinkSuccessText(result.technicianName)
      : result.outcome === "chat_already_linked_to_other"
        ? buildTelegramLinkChatAlreadyLinkedText()
        : buildTelegramLinkInvalidCodeText();

  // sendTelegramWebhookReply nunca lanza por contrato, pero se envuelve en
  // Promise.allSettled de todas formas (mismo patrón defensivo que
  // assignTechnicianToRequest) para que, aunque ese contrato se violara
  // alguna vez, jamás impida responder 200 a Telegram.
  await Promise.allSettled([sendTelegramWebhookReply(chatId, replyText)]);

  return NextResponse.json({ ok: true });
}
