"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "./technicians";
import {
  generateTechnicianTelegramLinkCode as generateLinkCode,
  getTechnicianTelegramLinkStatus as getLinkStatus,
  unlinkTechnicianTelegram as unlinkLink,
  type TechnicianTelegramStatus,
} from "@/server/services/technician-telegram-link.service";

export type { TechnicianTelegramStatus };

/**
 * Genera (o regenera, si ya había uno pendiente) el código de vinculación
 * de Telegram de un técnico, para mostrarlo en el modal de /tecnicos. El
 * código nunca se loggea acá ni en el servicio — solo se devuelve al
 * llamador de este Server Action.
 */
export async function generateTechnicianTelegramLinkCode(
  technicianId: string,
): Promise<ActionResult<{ code: string; expiresAt: Date }>> {
  try {
    const result = await generateLinkCode(technicianId);
    revalidatePath("/tecnicos");
    return { ok: true, data: result };
  } catch {
    return { ok: false, error: "No se pudo generar el código de vinculación." };
  }
}

/** Desvincula el Telegram de un técnico (botón "Desvincular" en /tecnicos). */
export async function unlinkTechnicianTelegram(technicianId: string): Promise<ActionResult<null>> {
  try {
    await unlinkLink(technicianId);
    revalidatePath("/tecnicos");
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: "No se pudo desvincular Telegram." };
  }
}

/**
 * Estado actual de vinculación de un técnico. Usado tanto para pintar
 * /tecnicos como para el polling del modal ("Esperando vinculación...")
 * mientras el técnico todavía no envió el código al bot.
 */
export async function getTechnicianTelegramLinkStatus(
  technicianId: string,
): Promise<ActionResult<TechnicianTelegramStatus>> {
  try {
    const status = await getLinkStatus(technicianId);
    return { ok: true, data: status };
  } catch {
    return { ok: false, error: "No se pudo consultar el estado de Telegram." };
  }
}
