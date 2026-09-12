import { NextResponse } from "next/server";

/**
 * ⚠️ TEMPORAL — diagnóstico del error P1001 (Prisma no puede alcanzar la
 * base de datos) en runtime de Preview. Borrar esta ruta una vez resuelto.
 *
 * Expone ÚNICAMENTE metadata no sensible:
 * - si DATABASE_URL/DIRECT_URL están definidas
 * - el hostname de cada una (nunca usuario, contraseña, puerto, query
 *   string ni la URL completa)
 * - VERCEL_ENV y VERCEL_URL
 *
 * No toca la base de datos ni usa Prisma Client: es puramente lectura de
 * variables de entorno, para no introducir una segunda causa de fallo.
 */

export const dynamic = "force-dynamic";

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
  return NextResponse.json({
    databaseUrl: diagnoseConnectionVar(process.env.DATABASE_URL),
    directUrl: diagnoseConnectionVar(process.env.DIRECT_URL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
  });
}
