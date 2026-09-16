import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * ⚠️ TEMPORAL — diagnóstico del error de runtime en Preview (crash al
 * cargar "/"). Borrar esta ruta una vez resuelto.
 *
 * Expone ÚNICAMENTE metadata no sensible:
 * - si DATABASE_URL/DIRECT_URL están definidas y el hostname de cada una
 *   (nunca usuario, contraseña, puerto, query string ni la URL completa)
 * - VERCEL_ENV y VERCEL_URL
 * - el resultado de una prueba real de Prisma contra la base (ok,
 *   databaseConnected, errorCode, errorMessageSafe) — nunca el mensaje
 *   crudo del driver: se sanitiza cualquier cadena `postgres(ql)://...`
 *   antes de incluirlo en la respuesta, por si el motor la llegara a
 *   interpolar dentro del mensaje de error.
 */

export const dynamic = "force-dynamic";

const CONNECTION_STRING_PATTERN = /postgres(?:ql)?:\/\/\S+/gi;

function sanitizeErrorMessage(message: string): string {
  return message.replace(CONNECTION_STRING_PATTERN, "postgresql://[REDACTADO]").slice(0, 500);
}

interface PrismaDiagnostic {
  ok: boolean;
  databaseConnected: boolean;
  errorCode: string | null;
  errorMessageSafe: string | null;
}

function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { code: error.errorCode ?? "INIT_ERROR", message: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: "UNKNOWN", message: error.message };
  }
  return { code: "UNKNOWN", message: String(error) };
}

/**
 * Dos pasos deliberadamente separados:
 * 1) `SELECT 1` — prueba de conectividad pura, no toca ninguna tabla ni
 *    columna concreta (aísla fallas de red/credenciales/timeout de Neon).
 * 2) `maintenanceRequest.findFirst()` sin `select` — exactamente la misma
 *    forma de consulta que usan las funciones del Dashboard
 *    (listOperationalMaintenanceRequests, getMaintenanceRequestByParte,
 *    etc. en maintenance-requests.service.ts): sin `select` explícito,
 *    Prisma trae TODAS las columnas escalares del modelo. Si el cliente
 *    generado espera una columna que la tabla real todavía no tiene (p. ej.
 *    por una migración no aplicada en Neon), esto reproduce el mismo error
 *    SQL que rompe el render del Dashboard.
 */
async function diagnosePrisma(): Promise<PrismaDiagnostic> {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    const { code, message } = describeError(error);
    return { ok: false, databaseConnected: false, errorCode: code, errorMessageSafe: sanitizeErrorMessage(message) };
  }

  try {
    await db.maintenanceRequest.findFirst();
  } catch (error) {
    const { code, message } = describeError(error);
    return { ok: false, databaseConnected: true, errorCode: code, errorMessageSafe: sanitizeErrorMessage(message) };
  }

  return { ok: true, databaseConnected: true, errorCode: null, errorMessageSafe: null };
}

interface ConnectionVarDiagnostic {
  present: boolean;
  hostname: string | null;
  parseError?: string;
}

function diagnoseConnectionVar(value: string | undefined): ConnectionVarDiagnostic {
  if (!value) {
    return { present: false, hostname: null };
  }

  try {
    const parsed = new URL(value);
    return { present: true, hostname: parsed.hostname || null };
  } catch {
    return {
      present: true,
      hostname: null,
      parseError: "El valor no se pudo interpretar como una URL válida",
    };
  }
}

export async function GET() {
  const prismaDiagnostic = await diagnosePrisma();
  return NextResponse.json({
    ...prismaDiagnostic,
    databaseUrl: diagnoseConnectionVar(process.env.DATABASE_URL),
    directUrl: diagnoseConnectionVar(process.env.DIRECT_URL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
  });
}
