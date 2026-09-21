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
 * - resumen seguro adicional (databaseUrlSummary/directUrlSummary): mismo
 *   hostname + nombre de base de datos (pathname sin el "/" inicial) —
 *   igual de acotado, nunca username/password/query string/URL completa
 * - VERCEL_ENV y VERCEL_URL
 * - el resultado de una prueba real de Prisma contra la base (ok,
 *   databaseConnected, errorCode, errorMessageSafe) — nunca el mensaje
 *   crudo del driver: se sanitiza cualquier cadena `postgres(ql)://...`
 *   antes de incluirlo en la respuesta, por si el motor la llegara a
 *   interpolar dentro del mensaje de error.
 * - auditoría de schema (nombres de tabla/columna/migración — nunca datos
 *   de negocio): migraciones registradas en `_prisma_migrations`, columnas
 *   reales de `maintenance_requests`, `maintenance_request_technicians` y
 *   `technicians` (agregado para diagnosticar P2022 sobre
 *   technicians.telegramChatId/telegramLinkedAt), el `current_schema()` de
 *   la conexión activa (para distinguir "columna no existe" de "columna
 *   existe pero en otro schema"), y si existe el tipo enum
 *   `MaintenanceRequestResponsibleArea`. TODAS las consultas de esta
 *   sección son SELECT puros contra el catálogo de Postgres
 *   (information_schema/pg_type/current_schema()) o una lectura de
 *   `_prisma_migrations` — ninguna DDL, ninguna escritura, ninguna lectura
 *   de filas de negocio.
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

/** Nombres de columna esperados por el schema.prisma ACTUAL del repo (fuente: prisma/schema.prisma, modelo MaintenanceRequest). */
const EXPECTED_MAINTENANCE_REQUEST_COLUMNS = [
  "id",
  "parte",
  "codigo",
  "maquina",
  "pieza",
  "problema",
  "tarea",
  "fecha",
  "codemple",
  "empleado",
  "estado",
  "responsibleArea",
  "commitmentDate",
  "isHistorical",
  "createdAt",
  "updatedAt",
];

/** Ídem, modelo MaintenanceRequestTechnician. */
const EXPECTED_MAINTENANCE_REQUEST_TECHNICIAN_COLUMNS = [
  "id",
  "maintenanceRequestId",
  "technicianId",
  "assignedAt",
  "removedAt",
];

/** Ídem, modelo Technician — agregado para diagnosticar P2022 sobre telegramChatId/telegramLinkedAt. */
const EXPECTED_TECHNICIAN_COLUMNS = [
  "id",
  "employeeCode",
  "fullName",
  "specialty",
  "phone",
  "isActive",
  "userId",
  "telegramChatId",
  "telegramLinkedAt",
  "createdAt",
  "updatedAt",
];

/** Carpetas de prisma/migrations/ en el repo, en orden — informativo, no requiere acceso a la base. */
const REPO_MIGRATIONS = [
  "20260908031225_initial",
  "20260914145814_add_maintenance_request_technicians",
  "20260914171154_add_technician_assignment_removed_at",
  "20260915205722_add_maintenance_request_responsible_area",
  "20260916160451_add_maintenance_request_commitment_date",
];

interface AppliedMigrationRow {
  migration_name: string;
  finished_at: Date | null;
  applied_steps_count: number;
  rolled_back_at: Date | null;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface SchemaAudit {
  migrationsTableExists: boolean;
  appliedMigrations: { name: string; finishedAt: string | null; rolledBackAt: string | null }[] | null;
  repoMigrations: string[];
  pendingMigrations: string[] | null;
  maintenanceRequestColumns: { column: string; type: string; nullable: boolean }[] | null;
  missingMaintenanceRequestColumns: string[] | null;
  maintenanceRequestTechnicianColumns: { column: string; type: string; nullable: boolean }[] | null;
  missingMaintenanceRequestTechnicianColumns: string[] | null;
  technicianColumns: { column: string; type: string; nullable: boolean }[] | null;
  missingTechnicianColumns: string[] | null;
  currentSchema: string | null;
  responsibleAreaEnumExists: boolean | null;
  errorMessageSafe: string | null;
}

/**
 * Auditoría de solo lectura del catálogo de Postgres — nunca toca filas de
 * `maintenance_requests` ni ninguna otra tabla de negocio. Cada sub-consulta
 * va en su propio try/catch para que un fallo puntual (p. ej. permisos) no
 * tumbe el resto del diagnóstico.
 */
async function auditSchema(): Promise<SchemaAudit> {
  const errors: string[] = [];

  let migrationsTableExists = false;
  let appliedMigrations: SchemaAudit["appliedMigrations"] = null;
  try {
    const exists = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
      ) AS exists
    `;
    migrationsTableExists = exists[0]?.exists ?? false;

    if (migrationsTableExists) {
      const rows = await db.$queryRaw<AppliedMigrationRow[]>`
        SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
        FROM "_prisma_migrations"
        ORDER BY started_at ASC
      `;
      appliedMigrations = rows.map((row) => ({
        name: row.migration_name,
        finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
        rolledBackAt: row.rolled_back_at ? row.rolled_back_at.toISOString() : null,
      }));
    }
  } catch (error) {
    const { message } = describeError(error);
    errors.push(`_prisma_migrations: ${sanitizeErrorMessage(message)}`);
  }

  const pendingMigrations = appliedMigrations
    ? REPO_MIGRATIONS.filter((name) => !appliedMigrations!.some((m) => m.name === name))
    : null;

  async function getColumns(tableName: string): Promise<{ column: string; type: string; nullable: boolean }[]> {
    const rows = await db.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position
    `;
    return rows.map((row) => ({
      column: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    }));
  }

  let maintenanceRequestColumns: SchemaAudit["maintenanceRequestColumns"] = null;
  let missingMaintenanceRequestColumns: string[] | null = null;
  try {
    const columns = await getColumns("maintenance_requests");
    maintenanceRequestColumns = columns;
    const actual = new Set(columns.map((c) => c.column));
    missingMaintenanceRequestColumns = EXPECTED_MAINTENANCE_REQUEST_COLUMNS.filter((c) => !actual.has(c));
  } catch (error) {
    const { message } = describeError(error);
    errors.push(`maintenance_requests columns: ${sanitizeErrorMessage(message)}`);
  }

  let maintenanceRequestTechnicianColumns: SchemaAudit["maintenanceRequestTechnicianColumns"] = null;
  let missingMaintenanceRequestTechnicianColumns: string[] | null = null;
  try {
    const columns = await getColumns("maintenance_request_technicians");
    maintenanceRequestTechnicianColumns = columns;
    const actual = new Set(columns.map((c) => c.column));
    missingMaintenanceRequestTechnicianColumns = EXPECTED_MAINTENANCE_REQUEST_TECHNICIAN_COLUMNS.filter(
      (c) => !actual.has(c),
    );
  } catch (error) {
    const { message } = describeError(error);
    errors.push(`maintenance_request_technicians columns: ${sanitizeErrorMessage(message)}`);
  }

  let technicianColumns: SchemaAudit["technicianColumns"] = null;
  let missingTechnicianColumns: string[] | null = null;
  try {
    const columns = await getColumns("technicians");
    technicianColumns = columns;
    const actual = new Set(columns.map((c) => c.column));
    missingTechnicianColumns = EXPECTED_TECHNICIAN_COLUMNS.filter((c) => !actual.has(c));
  } catch (error) {
    const { message } = describeError(error);
    errors.push(`technicians columns: ${sanitizeErrorMessage(message)}`);
  }

  // Distingue P2022 "columna no existe" (hipótesis A) de "columna existe pero
  // en otro schema" (hipótesis B, ver getColumns arriba — fija
  // table_schema = 'public'): si current_schema() no es 'public', las
  // consultas de columnas de esta función pueden estar mirando un schema
  // distinto al que realmente usa el search_path de la conexión activa.
  let currentSchema: string | null = null;
  try {
    const rows = await db.$queryRaw<{ current_schema: string }[]>`SELECT current_schema()`;
    currentSchema = rows[0]?.current_schema ?? null;
  } catch (error) {
    const { message } = describeError(error);
    errors.push(`current_schema: ${sanitizeErrorMessage(message)}`);
  }

  let responsibleAreaEnumExists: boolean | null = null;
  try {
    const rows = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'MaintenanceRequestResponsibleArea'
      ) AS exists
    `;
    responsibleAreaEnumExists = rows[0]?.exists ?? false;
  } catch (error) {
    const { message } = describeError(error);
    errors.push(`enum MaintenanceRequestResponsibleArea: ${sanitizeErrorMessage(message)}`);
  }

  return {
    migrationsTableExists,
    appliedMigrations,
    repoMigrations: REPO_MIGRATIONS,
    pendingMigrations,
    maintenanceRequestColumns,
    missingMaintenanceRequestColumns,
    maintenanceRequestTechnicianColumns,
    missingMaintenanceRequestTechnicianColumns,
    technicianColumns,
    missingTechnicianColumns,
    currentSchema,
    responsibleAreaEnumExists,
    errorMessageSafe: errors.length > 0 ? errors.join(" | ").slice(0, 1000) : null,
  };
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

/**
 * Resumen SEGURO y mínimo de una URL de conexión, en el formato exacto
 * pedido para comparar DATABASE_URL vs DIRECT_URL: solo hostname y nombre
 * de base (pathname sin el "/" inicial). Nunca username, nunca password,
 * nunca query string, nunca la URL completa.
 */
type ConnectionVarSummary =
  | { hostname: string; database: string | null }
  | "not configured"
  | "invalid URL";

function summarizeConnectionVar(value: string | undefined): ConnectionVarSummary {
  if (!value) return "not configured";
  try {
    const parsed = new URL(value);
    const database = parsed.pathname.replace(/^\//, "");
    return { hostname: parsed.hostname, database: database || null };
  } catch {
    return "invalid URL";
  }
}

export async function GET() {
  const [prismaDiagnostic, schemaAudit] = await Promise.all([diagnosePrisma(), auditSchema()]);
  return NextResponse.json({
    ...prismaDiagnostic,
    schemaAudit,
    databaseUrl: diagnoseConnectionVar(process.env.DATABASE_URL),
    directUrl: diagnoseConnectionVar(process.env.DIRECT_URL),
    databaseUrlSummary: summarizeConnectionVar(process.env.DATABASE_URL),
    directUrlSummary: summarizeConnectionVar(process.env.DIRECT_URL),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
  });
}
