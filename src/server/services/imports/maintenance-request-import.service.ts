import { db } from "@/lib/db";
import type { MaintenanceRequest, Prisma } from "@/generated/prisma/client";
import type { MaintenanceRequestRow, ParsedMaintenanceRequestRowResult } from "@/lib/validations/imports";

import {
  MAINTENANCE_REQUEST_HEADERS,
  cellToIsoDate,
  cellToString,
  extractDataRows,
  loadFirstWorksheet,
  validateHeaders,
  type RawRow,
} from "./excel-parser";

export type MaintenanceRequestRowOutcome = "NEW" | "MODIFIED" | "UNCHANGED" | "ERROR";

export interface MaintenanceRequestPreviewRow {
  rowNumber: number;
  parte: string | null;
  outcome: MaintenanceRequestRowOutcome;
  errorMessage?: string;
  data?: MaintenanceRequestRow;
}

export interface MaintenanceRequestPreviewSummary {
  totalRows: number;
  newCount: number;
  modifiedCount: number;
  unchangedCount: number;
  errorCount: number;
  rows: MaintenanceRequestPreviewRow[];
}

export interface ParseFileResult {
  /** Non-null means the file was rejected outright: these headers are missing. */
  headerErrors: string[] | null;
  rows: ParsedMaintenanceRequestRowResult[];
}

function parseRow(raw: RawRow): ParsedMaintenanceRequestRowResult {
  const parte = cellToString(raw.values.PARTE);
  if (!parte) {
    return {
      rowNumber: raw.rowNumber,
      ok: false,
      error: "PARTE vacío: la fila no se puede procesar sin un identificador de solicitud.",
    };
  }

  return {
    rowNumber: raw.rowNumber,
    ok: true,
    data: {
      rowNumber: raw.rowNumber,
      parte,
      codigo: cellToString(raw.values.CODIGO),
      maquina: cellToString(raw.values.MAQUINA),
      pieza: cellToString(raw.values.PIEZA),
      problema: cellToString(raw.values.PROBLEMA),
      tarea: cellToString(raw.values.TAREA),
      fecha: cellToIsoDate(raw.values.FECHA),
      codemple: cellToString(raw.values.CODEMPLE),
      empleado: cellToString(raw.values.EMPLEADO),
      estado: cellToString(raw.values.ESTADO),
    },
  };
}

export async function parseMaintenanceRequestFile(fileBuffer: Buffer): Promise<ParseFileResult> {
  const worksheet = await loadFirstWorksheet(fileBuffer);
  const headerCheck = validateHeaders(worksheet, MAINTENANCE_REQUEST_HEADERS);
  if (!headerCheck.valid) {
    return { headerErrors: headerCheck.missingHeaders, rows: [] };
  }

  const rawRows = extractDataRows(worksheet, MAINTENANCE_REQUEST_HEADERS);
  return { headerErrors: null, rows: rawRows.map(parseRow) };
}

function datesEqual(a: Date | null, isoB: string | null): boolean {
  const b = isoB ? new Date(isoB) : null;
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

/** Compares the 10 source fields (including ESTADO) exactly, per the approved criterion. */
function hasChanges(existing: MaintenanceRequest, incoming: MaintenanceRequestRow): boolean {
  return (
    existing.codigo !== incoming.codigo ||
    existing.maquina !== incoming.maquina ||
    existing.pieza !== incoming.pieza ||
    existing.problema !== incoming.problema ||
    existing.tarea !== incoming.tarea ||
    !datesEqual(existing.fecha, incoming.fecha) ||
    existing.codemple !== incoming.codemple ||
    existing.empleado !== incoming.empleado ||
    existing.estado !== incoming.estado
  );
}

/**
 * Classifies each row against the CURRENT database state. Used both for the
 * preview (display only) and, independently re-run inside the same
 * transaction, at confirm time — the confirm step never trusts a
 * classification computed earlier by the client, since the database may have
 * changed between preview and confirmation. Takes an explicit client (`db`
 * for preview, the active `tx` for apply) so both reads and writes at
 * confirm time see the same transactional snapshot.
 */
async function classifyRows(
  client: Prisma.TransactionClient,
  rows: ParsedMaintenanceRequestRowResult[],
): Promise<MaintenanceRequestPreviewRow[]> {
  const partes = rows.filter((row) => row.ok).map((row) => row.data.parte);
  const existingRequests = partes.length
    ? await client.maintenanceRequest.findMany({ where: { parte: { in: partes } } })
    : [];
  const existingByParte = new Map(existingRequests.map((request) => [request.parte, request]));

  const seenInFile = new Set<string>();
  const result: MaintenanceRequestPreviewRow[] = [];

  for (const row of rows) {
    if (!row.ok) {
      result.push({ rowNumber: row.rowNumber, parte: null, outcome: "ERROR", errorMessage: row.error });
      continue;
    }

    if (seenInFile.has(row.data.parte)) {
      result.push({
        rowNumber: row.rowNumber,
        parte: row.data.parte,
        outcome: "ERROR",
        errorMessage: `PARTE duplicado dentro del mismo archivo (ya se procesó en una fila anterior).`,
        data: row.data,
      });
      continue;
    }
    seenInFile.add(row.data.parte);

    const existing = existingByParte.get(row.data.parte);
    if (!existing) {
      result.push({ rowNumber: row.rowNumber, parte: row.data.parte, outcome: "NEW", data: row.data });
    } else if (hasChanges(existing, row.data)) {
      result.push({ rowNumber: row.rowNumber, parte: row.data.parte, outcome: "MODIFIED", data: row.data });
    } else {
      result.push({ rowNumber: row.rowNumber, parte: row.data.parte, outcome: "UNCHANGED", data: row.data });
    }
  }

  return result;
}

function summarize(rows: MaintenanceRequestPreviewRow[]): MaintenanceRequestPreviewSummary {
  return {
    totalRows: rows.length,
    newCount: rows.filter((r) => r.outcome === "NEW").length,
    modifiedCount: rows.filter((r) => r.outcome === "MODIFIED").length,
    unchangedCount: rows.filter((r) => r.outcome === "UNCHANGED").length,
    errorCount: rows.filter((r) => r.outcome === "ERROR").length,
    rows,
  };
}

export async function previewMaintenanceRequestImport(
  rows: ParsedMaintenanceRequestRowResult[],
): Promise<MaintenanceRequestPreviewSummary> {
  return summarize(await classifyRows(db, rows));
}

export interface ApplyMaintenanceRequestImportInput {
  fileName: string;
  isHistorical: boolean;
  rows: ParsedMaintenanceRequestRowResult[];
  importedById?: string | null;
}

export interface ApplyMaintenanceRequestImportResult {
  importBatchId: string;
  summary: MaintenanceRequestPreviewSummary;
  retroactivelyRelatedCount: number;
}

export async function applyMaintenanceRequestImport(
  input: ApplyMaintenanceRequestImportInput,
): Promise<ApplyMaintenanceRequestImportResult> {
  return db.$transaction(
    async (tx) => {
      const classified = await classifyRows(tx, input.rows);
      let retroactivelyRelatedCount = 0;
      const requestIdByRowNumber = new Map<number, string>();

      for (const row of classified) {
        if (row.outcome === "ERROR" || !row.data) continue;

        let requestId: string;
        if (row.outcome === "NEW") {
          const created = await tx.maintenanceRequest.create({
            data: {
              parte: row.data.parte,
              codigo: row.data.codigo,
              maquina: row.data.maquina,
              pieza: row.data.pieza,
              problema: row.data.problema,
              tarea: row.data.tarea,
              fecha: row.data.fecha ? new Date(row.data.fecha) : null,
              codemple: row.data.codemple,
              empleado: row.data.empleado,
              estado: row.data.estado,
              isHistorical: input.isHistorical,
            },
          });
          requestId = created.id;

          // Sección 11: relacionar retroactivamente minutas que llegaron antes que esta solicitud.
          const pendingLogs = await tx.maintenanceLog.findMany({
            where: { relationStatus: "PENDING", parteRaw: row.data.parte },
            select: { id: true },
          });
          if (pendingLogs.length) {
            await tx.maintenanceLog.updateMany({
              where: { id: { in: pendingLogs.map((log) => log.id) } },
              data: { relationStatus: "RELATED", maintenanceRequestId: requestId },
            });
            retroactivelyRelatedCount += pendingLogs.length;
          }
        } else if (row.outcome === "MODIFIED") {
          const existing = await tx.maintenanceRequest.findUniqueOrThrow({
            where: { parte: row.data.parte },
          });
          const updated = await tx.maintenanceRequest.update({
            where: { id: existing.id },
            data: {
              codigo: row.data.codigo,
              maquina: row.data.maquina,
              pieza: row.data.pieza,
              problema: row.data.problema,
              tarea: row.data.tarea,
              fecha: row.data.fecha ? new Date(row.data.fecha) : null,
              codemple: row.data.codemple,
              empleado: row.data.empleado,
              estado: row.data.estado,
              // isHistorical no se reasigna en actualizaciones posteriores:
              // una solicitud marcada histórica en su primera carga lo sigue
              // siendo aunque una carga normal posterior la modifique.
            },
          });
          requestId = updated.id;
        } else {
          // UNCHANGED: no se escribe nada (evita mover updatedAt sin motivo real).
          const existing = await tx.maintenanceRequest.findUniqueOrThrow({
            where: { parte: row.data.parte },
          });
          requestId = existing.id;
        }

        requestIdByRowNumber.set(row.rowNumber, requestId);
      }

      const summary = summarize(classified);

      const importBatch = await tx.importBatch.create({
        data: {
          fileType: "MAINTENANCE_REQUEST",
          fileName: input.fileName,
          isHistorical: input.isHistorical,
          totalRows: summary.totalRows,
          errorCount: summary.errorCount,
          newCount: summary.newCount,
          modifiedCount: summary.modifiedCount,
          unchangedCount: summary.unchangedCount,
          retroactivelyRelatedCount,
          importedById: input.importedById ?? null,
        },
      });

      await tx.importRequestResult.createMany({
        data: classified.map((row) => ({
          importBatchId: importBatch.id,
          parte: row.parte ?? "",
          outcome: row.outcome,
          errorMessage: row.errorMessage,
          maintenanceRequestId: requestIdByRowNumber.get(row.rowNumber) ?? null,
        })),
      });

      return { importBatchId: importBatch.id, retroactivelyRelatedCount, summary };
    },
    { timeout: 30_000 },
  );
}
