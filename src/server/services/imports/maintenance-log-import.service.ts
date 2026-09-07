import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { MaintenanceLogRow, ParsedMaintenanceLogRowResult } from "@/lib/validations/imports";

import {
  MAINTENANCE_LOG_HEADERS,
  cellToInt,
  cellToIsoDate,
  cellToString,
  extractDataRows,
  loadFirstWorksheet,
  validateHeaders,
  type RawRow,
} from "./excel-parser";

export type MaintenanceLogRowOutcome = "NEW" | "ALREADY_EXISTS" | "ERROR";
export type MaintenanceLogRelationOutcome = "RELATED" | "PENDING" | "UNRELATED";

export interface MaintenanceLogPreviewRow {
  rowNumber: number;
  registro: string | null;
  outcome: MaintenanceLogRowOutcome;
  /** Only meaningful when outcome === "NEW". Always "UNRELATED" when the import is historical. */
  relationOutcome?: MaintenanceLogRelationOutcome;
  errorMessage?: string;
  data?: MaintenanceLogRow;
  /** Id of the matching MaintenanceLog: pre-existing (ALREADY_EXISTS) or just created (NEW, filled in during apply). */
  logId?: string;
}

export interface MaintenanceLogPreviewSummary {
  totalRows: number;
  newCount: number;
  alreadyExistsCount: number;
  relatedCount: number;
  pendingCount: number;
  errorCount: number;
  rows: MaintenanceLogPreviewRow[];
}

export interface ParseFileResult {
  /** Non-null means the file was rejected outright: these headers are missing. */
  headerErrors: string[] | null;
  rows: ParsedMaintenanceLogRowResult[];
}

function parseRow(raw: RawRow): ParsedMaintenanceLogRowResult {
  const registro = cellToString(raw.values.REGISTRO);
  if (!registro) {
    return {
      rowNumber: raw.rowNumber,
      ok: false,
      error: "REGISTRO vacío: la fila no se puede procesar sin un identificador de minuta.",
    };
  }

  return {
    rowNumber: raw.rowNumber,
    ok: true,
    data: {
      rowNumber: raw.rowNumber,
      registro,
      fechaini: cellToIsoDate(raw.values.FECHAINI),
      orden: cellToString(raw.values.ORDEN),
      maquina: cellToString(raw.values.MAQUINA),
      oper: cellToString(raw.values.OPER),
      nombreord: cellToString(raw.values.NOMBREORD),
      ccosto: cellToString(raw.values.CCOSTO),
      operacion: cellToString(raw.values.OPERACION),
      cantidad: cellToString(raw.values.CANTIDAD),
      codemp: cellToString(raw.values.CODEMP),
      empleado: cellToString(raw.values.EMPLEADO),
      fechafin: cellToIsoDate(raw.values.FECHAFIN),
      horaini: cellToString(raw.values.HORAINI),
      horafin: cellToString(raw.values.HORAFIN),
      minutos: cellToInt(raw.values.MINUTOS),
      observaciones: cellToString(raw.values.OBSERVACIONES),
    },
  };
}

export async function parseMaintenanceLogFile(fileBuffer: Buffer): Promise<ParseFileResult> {
  const worksheet = await loadFirstWorksheet(fileBuffer);
  const headerCheck = validateHeaders(worksheet, MAINTENANCE_LOG_HEADERS);
  if (!headerCheck.valid) {
    return { headerErrors: headerCheck.missingHeaders, rows: [] };
  }

  const rawRows = extractDataRows(worksheet, MAINTENANCE_LOG_HEADERS);
  return { headerErrors: null, rows: rawRows.map(parseRow) };
}

/**
 * Classifies each row against the CURRENT database state: dedup by
 * REGISTRO, and — only for non-historical imports — relation lookup by
 * OBSERVACIONES -> MaintenanceRequest.parte (exact match, no fuzzy
 * matching). Historical imports (`isHistorical: true`) never attempt this
 * lookup at all: the historical file predates the PARTE-in-OBSERVACIONES
 * convention, so its OBSERVACIONES is free-form maintenance text (or
 * blank) and must never be interpreted as a PARTE reference — every valid
 * row is classified NEW/ALREADY_EXISTS with relationOutcome "UNRELATED",
 * never as an error for lacking a PARTE.
 *
 * Takes an explicit client so preview (uses `db`) and apply (uses the
 * active `tx`) see a consistent snapshot.
 */
async function classifyRows(
  client: Prisma.TransactionClient,
  rows: ParsedMaintenanceLogRowResult[],
  isHistorical: boolean,
): Promise<MaintenanceLogPreviewRow[]> {
  const registros = rows.filter((row) => row.ok).map((row) => row.data.registro);
  const existingLogs = registros.length
    ? await client.maintenanceLog.findMany({
        where: { registro: { in: registros } },
        select: { id: true, registro: true },
      })
    : [];
  const existingLogByRegistro = new Map(existingLogs.map((log) => [log.registro, log.id]));

  let requestPartes: Set<string> | null = null;
  if (!isHistorical) {
    const partesToCheck = Array.from(
      new Set(
        rows
          .filter((row) => row.ok && row.data.observaciones)
          .map((row) => (row as { ok: true; data: MaintenanceLogRow }).data.observaciones!.trim())
          .filter((value) => value.length > 0),
      ),
    );
    const matchingRequests = partesToCheck.length
      ? await client.maintenanceRequest.findMany({
          where: { parte: { in: partesToCheck } },
          select: { parte: true },
        })
      : [];
    requestPartes = new Set(matchingRequests.map((request) => request.parte));
  }

  const seenInFile = new Set<string>();
  const result: MaintenanceLogPreviewRow[] = [];

  for (const row of rows) {
    if (!row.ok) {
      result.push({ rowNumber: row.rowNumber, registro: null, outcome: "ERROR", errorMessage: row.error });
      continue;
    }

    if (seenInFile.has(row.data.registro)) {
      result.push({
        rowNumber: row.rowNumber,
        registro: row.data.registro,
        outcome: "ERROR",
        errorMessage: "REGISTRO duplicado dentro del mismo archivo (ya se procesó en una fila anterior).",
        data: row.data,
      });
      continue;
    }
    seenInFile.add(row.data.registro);

    const existingLogId = existingLogByRegistro.get(row.data.registro);
    if (existingLogId) {
      result.push({
        rowNumber: row.rowNumber,
        registro: row.data.registro,
        outcome: "ALREADY_EXISTS",
        data: row.data,
        logId: existingLogId,
      });
      continue;
    }

    let relationOutcome: MaintenanceLogRelationOutcome;
    if (isHistorical) {
      // Nunca se interpreta OBSERVACIONES como PARTE en una carga histórica.
      relationOutcome = "UNRELATED";
    } else {
      const parteRaw = row.data.observaciones ? row.data.observaciones.trim() : null;
      relationOutcome = !parteRaw ? "UNRELATED" : requestPartes!.has(parteRaw) ? "RELATED" : "PENDING";
    }

    result.push({
      rowNumber: row.rowNumber,
      registro: row.data.registro,
      outcome: "NEW",
      relationOutcome,
      data: row.data,
    });
  }

  return result;
}

function summarize(rows: MaintenanceLogPreviewRow[]): MaintenanceLogPreviewSummary {
  return {
    totalRows: rows.length,
    newCount: rows.filter((r) => r.outcome === "NEW").length,
    alreadyExistsCount: rows.filter((r) => r.outcome === "ALREADY_EXISTS").length,
    relatedCount: rows.filter((r) => r.outcome === "NEW" && r.relationOutcome === "RELATED").length,
    pendingCount: rows.filter((r) => r.outcome === "NEW" && r.relationOutcome === "PENDING").length,
    errorCount: rows.filter((r) => r.outcome === "ERROR").length,
    rows,
  };
}

export async function previewMaintenanceLogImport(
  rows: ParsedMaintenanceLogRowResult[],
  isHistorical: boolean,
): Promise<MaintenanceLogPreviewSummary> {
  return summarize(await classifyRows(db, rows, isHistorical));
}

export interface ApplyMaintenanceLogImportInput {
  fileName: string;
  isHistorical: boolean;
  rows: ParsedMaintenanceLogRowResult[];
  importedById?: string | null;
}

export interface ApplyMaintenanceLogImportResult {
  importBatchId: string;
  summary: MaintenanceLogPreviewSummary;
}

export async function applyMaintenanceLogImport(
  input: ApplyMaintenanceLogImportInput,
): Promise<ApplyMaintenanceLogImportResult> {
  return db.$transaction(
    async (tx) => {
      const classified = await classifyRows(tx, input.rows, input.isHistorical);

      for (const row of classified) {
        if (row.outcome !== "NEW" || !row.data) continue;

        // parteRaw solo se calcula/usa para cargas no históricas: una carga
        // histórica nunca interpreta OBSERVACIONES como PARTE, ni siquiera
        // para guardar el intento como referencia.
        const parteRaw =
          !input.isHistorical && row.data.observaciones ? row.data.observaciones.trim() : null;

        let maintenanceRequestId: string | null = null;
        if (row.relationOutcome === "RELATED" && parteRaw) {
          const request = await tx.maintenanceRequest.findUnique({
            where: { parte: parteRaw },
            select: { id: true },
          });
          maintenanceRequestId = request?.id ?? null;
          if (!maintenanceRequestId) {
            // No debería ocurrir dentro de la misma transacción, pero por seguridad no se inventa una relación.
            row.relationOutcome = "PENDING";
          }
        }

        const created = await tx.maintenanceLog.create({
          data: {
            registro: row.data.registro,
            fechaini: row.data.fechaini ? new Date(row.data.fechaini) : null,
            orden: row.data.orden,
            maquina: row.data.maquina,
            oper: row.data.oper,
            nombreord: row.data.nombreord,
            ccosto: row.data.ccosto,
            operacion: row.data.operacion,
            cantidad: row.data.cantidad,
            codemp: row.data.codemp,
            empleado: row.data.empleado,
            fechafin: row.data.fechafin ? new Date(row.data.fechafin) : null,
            horaini: row.data.horaini,
            horafin: row.data.horafin,
            minutos: row.data.minutos,
            observaciones: row.data.observaciones,
            parteRaw,
            relationStatus: row.relationOutcome ?? "UNRELATED",
            maintenanceRequestId,
            isHistorical: input.isHistorical,
          },
        });
        row.logId = created.id;
      }

      const summary = summarize(classified);

      const importBatch = await tx.importBatch.create({
        data: {
          fileType: "MAINTENANCE_LOG",
          fileName: input.fileName,
          isHistorical: input.isHistorical,
          totalRows: summary.totalRows,
          errorCount: summary.errorCount,
          newCount: summary.newCount,
          alreadyExistsCount: summary.alreadyExistsCount,
          relatedCount: summary.relatedCount,
          pendingCount: summary.pendingCount,
          importedById: input.importedById ?? null,
        },
      });

      await tx.importLogResult.createMany({
        data: classified.map((row) => ({
          importBatchId: importBatch.id,
          registro: row.registro ?? "",
          outcome: row.outcome,
          relationOutcome: row.outcome === "NEW" ? row.relationOutcome : null,
          errorMessage: row.errorMessage,
          maintenanceLogId: row.logId ?? null,
        })),
      });

      return { importBatchId: importBatch.id, summary };
    },
    { timeout: 30_000 },
  );
}
