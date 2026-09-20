import { randomInt } from "node:crypto";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Lógica compartida de vinculación de Telegram por técnico. Módulo plano
 * (sin "use server"), mismo criterio que maintenance-request-import.service.ts:
 * su lógica de escritura la invocan dos llamadores distintos que no pueden
 * compartir código de otra forma — el Server Action de /tecnicos
 * (technician-telegram.ts) y el route handler del webhook de Telegram
 * (/api/telegram/webhook) — así que vive acá en vez de duplicarse o de
 * forzar al webhook a importar un archivo "use server".
 *
 * Regla de seguridad central de todo este archivo: el webhook entrante de
 * Telegram SOLO puede llamar a `consumeTechnicianTelegramLinkCode`, que
 * únicamente sabe hacer tres cosas (código inválido/expirado/usado, chat ya
 * vinculado a otro técnico, o vincular) — nunca puede modificar ningún otro
 * dato de SIMI a partir de un update de Telegram.
 */

const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I, para que sea fácil de transcribir
const LINK_CODE_LENGTH = 6;
const LINK_CODE_TTL_MINUTES = 10;
const LINK_CODE_MAX_GENERATION_ATTEMPTS = 5;

function generateRandomCode(): string {
  let suffix = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    suffix += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return `SIMI-${suffix}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export interface TechnicianTelegramLinkCodeResult {
  code: string;
  expiresAt: Date;
}

/**
 * Genera un código temporal de vinculación para un técnico. Invalida
 * (elimina) primero cualquier código PENDIENTE anterior del mismo técnico
 * — nunca puede haber más de un código pendiente por técnico a la vez, así
 * que esta misma función sirve tanto para "generar" como para "regenerar".
 * El código es aleatorio (crypto.randomInt, no Math.random), de un solo
 * uso, expira a los 10 minutos, y nunca se guarda ni se loggea en ningún
 * lugar salvo esta tabla — no es un token de Telegram, pero igual se trata
 * como dato sensible de UI.
 */
export async function generateTechnicianTelegramLinkCode(
  technicianId: string,
): Promise<TechnicianTelegramLinkCodeResult> {
  const technician = await db.technician.findUnique({ where: { id: technicianId }, select: { id: true } });
  if (!technician) {
    throw new Error("El técnico no existe.");
  }

  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

  return db.$transaction(async (tx) => {
    await tx.technicianTelegramLinkCode.deleteMany({ where: { technicianId, usedAt: null } });

    for (let attempt = 0; attempt < LINK_CODE_MAX_GENERATION_ATTEMPTS; attempt++) {
      const code = generateRandomCode();
      try {
        await tx.technicianTelegramLinkCode.create({ data: { technicianId, code, expiresAt } });
        return { code, expiresAt };
      } catch (error) {
        // Colisión con un código de OTRO técnico (globalmente único) —
        // extremadamente improbable (32^6 combinaciones) pero se reintenta
        // con un código nuevo en vez de fallar la operación completa.
        if (isUniqueConstraintError(error) && attempt < LINK_CODE_MAX_GENERATION_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new Error("No se pudo generar un código de vinculación único.");
  });
}

export interface TechnicianTelegramStatus {
  linked: boolean;
  telegramChatId: string | null;
  telegramLinkedAt: Date | null;
  pendingCode: TechnicianTelegramLinkCodeResult | null;
}

/** Estado actual de vinculación de un técnico, para pintar /tecnicos y para el polling del modal. */
export async function getTechnicianTelegramLinkStatus(technicianId: string): Promise<TechnicianTelegramStatus> {
  const [technician, pendingCode] = await Promise.all([
    db.technician.findUnique({
      where: { id: technicianId },
      select: { telegramChatId: true, telegramLinkedAt: true },
    }),
    db.technicianTelegramLinkCode.findFirst({
      where: { technicianId, usedAt: null },
      orderBy: { createdAt: "desc" },
      select: { code: true, expiresAt: true },
    }),
  ]);

  if (!technician) {
    throw new Error("El técnico no existe.");
  }

  return {
    linked: technician.telegramChatId !== null,
    telegramChatId: technician.telegramChatId,
    telegramLinkedAt: technician.telegramLinkedAt,
    pendingCode,
  };
}

export type ConsumeTechnicianTelegramLinkCodeResult =
  | { outcome: "linked"; technicianId: string; technicianName: string }
  | { outcome: "invalid_code" }
  | { outcome: "chat_already_linked_to_other" };

/**
 * Único punto de escritura alcanzable desde el webhook de Telegram. Recibe
 * exactamente lo que el webhook puede extraer de un update entrante — el
 * texto del mensaje (candidato a código) y el chat_id del remitente — y
 * nunca hace nada más que: (1) rechazar si el texto no coincide con ningún
 * código pendiente y vigente, (2) rechazar si el chat_id ya está vinculado
 * a OTRO técnico, o (3) vincular. La comparación de código ignora
 * mayúsculas/espacios (el técnico puede transcribirlo a mano) pero el
 * código en sí solo se genera en mayúsculas.
 *
 * Todo ocurre dentro de una transacción; además el `@unique` de
 * `Technician.telegramChatId` en el schema es el resguardo final a nivel
 * de base de datos contra una carrera entre dos vinculaciones concurrentes
 * con el mismo chat_id.
 */
export async function consumeTechnicianTelegramLinkCode(
  rawCode: string,
  chatId: string,
): Promise<ConsumeTechnicianTelegramLinkCodeResult> {
  const code = rawCode.trim().toUpperCase();
  const now = new Date();

  try {
    return await db.$transaction(async (tx) => {
      const pending = await tx.technicianTelegramLinkCode.findUnique({ where: { code } });
      if (!pending || pending.usedAt !== null || pending.expiresAt.getTime() < now.getTime()) {
        return { outcome: "invalid_code" };
      }

      const chatOwner = await tx.technician.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true },
      });
      if (chatOwner && chatOwner.id !== pending.technicianId) {
        return { outcome: "chat_already_linked_to_other" };
      }

      const technician = await tx.technician.update({
        where: { id: pending.technicianId },
        data: { telegramChatId: chatId, telegramLinkedAt: now },
        select: { id: true, fullName: true },
      });

      await tx.technicianTelegramLinkCode.update({
        where: { id: pending.id },
        data: { usedAt: now },
      });

      return { outcome: "linked", technicianId: technician.id, technicianName: technician.fullName };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { outcome: "chat_already_linked_to_other" };
    }
    throw error;
  }
}

/** Desvincula el Telegram de un técnico. No borra códigos históricos (trazabilidad de intentos pasados). */
export async function unlinkTechnicianTelegram(technicianId: string): Promise<void> {
  const technician = await db.technician.findUnique({ where: { id: technicianId }, select: { id: true } });
  if (!technician) {
    throw new Error("El técnico no existe.");
  }

  await db.technician.update({
    where: { id: technicianId },
    data: { telegramChatId: null, telegramLinkedAt: null },
  });
}
