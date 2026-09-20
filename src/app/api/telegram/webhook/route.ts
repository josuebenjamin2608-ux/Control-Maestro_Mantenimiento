import { NextResponse } from "next/server";

import { consumeTechnicianTelegramLinkCode } from "@/server/services/technician-telegram-link.service";
import {
  buildTelegramLinkChatAlreadyLinkedText,
  buildTelegramLinkInvalidCodeText,
  buildTelegramLinkSuccessText,
  sendTelegramWebhookReply,
} from "@/server/services/telegram.service";

/**
 * Endpoint que Telegram invoca (vía setWebhook) por cada update dirigido a
 * @SIMI_Mantenimiento_bot. Único propósito: procesar códigos de vinculación
 * de técnicos enviados por mensaje privado — NUNCA puede modificar nada más
 * en SIMI a partir de un update entrante. Toda la lógica de qué se puede
 * escribir vive en consumeTechnicianTelegramLinkCode
 * (technician-telegram-link.service.ts), que solo sabe hacer tres cosas:
 * rechazar por código inválido/expirado/usado, rechazar por chat_id ya
 * vinculado a otro técnico, o vincular. Este route handler nunca toca la
 * base de datos directamente.
 *
 * Autenticación: si TELEGRAM_WEBHOOK_SECRET está configurada, Telegram
 * reenvía ese mismo valor en el header `X-Telegram-Bot-Api-Secret-Token` en
 * cada request (mecanismo estándar de `secret_token` de setWebhook) — se
 * exige que coincida exactamente. Si la variable no está configurada, el
 * chequeo se omite (permite configurar el webhook sin el secreto todavía,
 * p. ej. durante la prueba inicial) pero se recomienda fuertemente
 * configurarla antes de exponer la URL públicamente.
 *
 * Siempre responde 200 a Telegram salvo que falle la autenticación —
 * cualquier otro resultado (código inválido, chat ya vinculado, update
 * ignorado por no ser un mensaje privado) es un caso de negocio normal,
 * nunca un error HTTP; responder distinto de 2xx solo lograría que
 * Telegram reintente el mismo update indefinidamente.
 */

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  chat: TelegramChat;
  text?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) return true;
  return request.headers.get(TELEGRAM_SECRET_HEADER) === expectedSecret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
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
