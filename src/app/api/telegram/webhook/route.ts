import { NextResponse } from "next/server";

import { getMaintenanceRequestByParte } from "@/server/services/maintenance-requests.service";
import { consumeTechnicianTelegramLinkCode } from "@/server/services/technician-telegram-link.service";
import {
  answerTelegramCallbackQuery,
  buildObservacionesQueryText,
  buildSolicitudNotFoundText,
  buildSolicitudQueryText,
  buildTelegramLinkChatAlreadyLinkedText,
  buildTelegramLinkInvalidCodeText,
  buildTelegramLinkSuccessText,
  sendTelegramWebhookReply,
} from "@/server/services/telegram.service";

/**
 * Endpoint que Telegram invoca (vía setWebhook) por cada update dirigido a
 * @SIMI_Mantenimiento_bot. Dos propósitos, ambos de solo lectura salvo el
 * primero:
 * 1. Procesar códigos de vinculación de técnicos enviados por mensaje
 *    privado — la única escritura que este endpoint puede disparar, y vive
 *    enteramente en consumeTechnicianTelegramLinkCode
 *    (technician-telegram-link.service.ts), que solo sabe hacer tres cosas:
 *    rechazar por código inválido/expirado/usado, rechazar por chat_id ya
 *    vinculado a otro técnico, o vincular.
 * 2. Procesar callback_query de los botones "Ver solicitud"/"Ver
 *    observaciones" del menú de asignación (ver
 *    buildTechnicianAssignedKeyboard en telegram.service.ts) — SOLO
 *    CONSULTA: getMaintenanceRequestByParte es un findUnique, nunca escribe
 *    nada. Nunca modifica una Solicitud ni una Minuta a partir de un
 *    callback_query.
 * Este route handler nunca toca la base de datos directamente (ni para
 * escribir ni, en el camino de callback_query, más que a través de
 * getMaintenanceRequestByParte, ya existente y reutilizado tal cual).
 *
 * Sin verificación del header `X-Telegram-Bot-Api-Secret-Token`: se probó
 * en producción y Telegram no llegaba a entregar ningún update porque el
 * secret_token registrado en setWebhook no coincidía con
 * TELEGRAM_WEBHOOK_SECRET (Telegram reportaba "Wrong response from the
 * webhook: 401 Unauthorized" en getWebhookInfo, bloqueando el flujo
 * completo). La protección real de este endpoint no depende de ese header:
 * la rama de mensajes nunca puede modificar nada más allá de procesar un
 * código de vinculación válido, y la rama de callback_query nunca escribe
 * nada — así que un llamador sin el secreto solo puede, en el peor caso,
 * intentar adivinar un código pendiente de 6 caracteres de un solo uso con
 * expiración de 10 minutos, o consultar (nunca modificar) una Solicitud por
 * PARTE.
 *
 * Siempre responde 200 a Telegram — cualquier resultado (código inválido,
 * chat ya vinculado, update ignorado por no ser un mensaje privado,
 * callback_data no reconocido) es un caso de negocio normal, nunca un error
 * HTTP; responder distinto de 2xx solo lograría que Telegram reintente el
 * mismo update indefinidamente.
 */

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  chat: TelegramChat;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  /** Ausente cuando el mensaje original es demasiado viejo para que Telegram lo siga referenciando — en ese caso solo se confirma el callback_query, sin poder responder en el chat. */
  message?: { chat: TelegramChat };
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/** "req:<parte>" -> Ver solicitud, "obs:<parte>" -> Ver observaciones. Cualquier otro valor se ignora (defensivo: nunca debería llegar desde nuestro propio teclado). */
function parseCallbackData(data: string): { action: "solicitud" | "observaciones"; parte: string } | null {
  const separatorIndex = data.indexOf(":");
  if (separatorIndex === -1) return null;
  const action = data.slice(0, separatorIndex);
  const parte = data.slice(separatorIndex + 1);
  if (!parte) return null;
  if (action === "req") return { action: "solicitud", parte };
  if (action === "obs") return { action: "observaciones", parte };
  return null;
}

/**
 * "Ver solicitud"/"Ver observaciones": SOLO CONSULTA. getMaintenanceRequestByParte
 * ya trae `logs` filtrada a la relación existente (FK maintenanceRequestId,
 * nunca una PENDING/UNRELATED — ver comentario en
 * maintenance-log-import.service.ts) y `assignedTechnicians`, sin necesidad
 * de ninguna consulta ni relación nueva. answerTelegramCallbackQuery se
 * dispara siempre (incluso sin `message`, p. ej. un mensaje demasiado
 * viejo), para que el botón nunca quede con el ícono de carga.
 */
async function handleTelegramCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<NextResponse> {
  const ackPromise = answerTelegramCallbackQuery(callbackQuery.id);

  const parsed = callbackQuery.data ? parseCallbackData(callbackQuery.data) : null;
  const chatId = callbackQuery.message ? String(callbackQuery.message.chat.id) : null;

  if (!parsed || !chatId) {
    await Promise.allSettled([ackPromise]);
    return NextResponse.json({ ok: true });
  }

  const request = await getMaintenanceRequestByParte(parsed.parte);
  const replyText = !request
    ? buildSolicitudNotFoundText(parsed.parte)
    : parsed.action === "solicitud"
      ? buildSolicitudQueryText(request)
      : buildObservacionesQueryText(parsed.parte, request.logs);

  // sendTelegramWebhookReply/answerTelegramCallbackQuery nunca lanzan por
  // contrato, pero se envuelven en Promise.allSettled de todas formas
  // (mismo patrón defensivo que assignTechnicianToRequest) para que, aunque
  // ese contrato se violara alguna vez, jamás impida responder 200.
  await Promise.allSettled([ackPromise, sendTelegramWebhookReply(chatId, replyText)]);
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
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
  const text = message?.text;
  if (!message || message.chat.type !== "private" || !text) {
    // Solo interesan mensajes de texto en chat privado con el bot — todo lo
    // demás (mensajes de grupo, stickers, comandos sin texto, etc.) se
    // ignora sin error.
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const result = await consumeTechnicianTelegramLinkCode(text, chatId);

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
