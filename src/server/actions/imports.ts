"use server";

import { revalidatePath } from "next/cache";

import {
  confirmMaintenanceLogImportSchema,
  confirmMaintenanceRequestImportSchema,
} from "@/lib/validations/imports";
import {
  applyMaintenanceLogImport,
  parseMaintenanceLogFile,
  previewMaintenanceLogImport,
  type MaintenanceLogPreviewSummary,
} from "@/server/services/imports/maintenance-log-import.service";
import {
  applyMaintenanceRequestImport,
  parseMaintenanceRequestFile,
  previewMaintenanceRequestImport,
  type MaintenanceRequestPreviewSummary,
} from "@/server/services/imports/maintenance-request-import.service";
import type {
  ParsedMaintenanceLogRowResult,
  ParsedMaintenanceRequestRowResult,
} from "@/lib/validations/imports";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "@/server/services/imports/import-security";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Firma real de todo archivo ZIP — y por lo tanto de todo .xlsx, que es un ZIP de XML — "PK\x03\x04". */
const ZIP_FILE_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function getUploadedFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File ? file : null;
}

/**
 * Valida tamaño y estructura ANTES de cargar el archivo completo a memoria
 * o de pasarlo a parseMaintenanceRequestFile/parseMaintenanceLogFile (que
 * invocan ExcelJS vía loadFirstWorksheet, ver excel-parser.ts):
 *
 * 1. `file.size` contra MAX_IMPORT_FILE_SIZE_BYTES — se rechaza sin leer
 *    ningún byte del archivo (nunca se llega a `file.arrayBuffer()`).
 * 2. Los primeros 4 bytes deben ser la firma ZIP real — únicamente se leen
 *    esos 4 bytes (`file.slice`), nunca el archivo completo, para
 *    descartar de forma confiable cualquier archivo que no pueda ser un
 *    .xlsx bajo ninguna circunstancia (ExcelJS recién falla al intentar
 *    descomprimirlo, después de más trabajo).
 *
 * Solo si ambas validaciones pasan se lee el archivo completo a memoria.
 */
async function readValidatedUploadedFile(
  file: File,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    const maxMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `El archivo supera el tamaño máximo permitido (${maxMb} MB).` };
  }

  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, ZIP_FILE_SIGNATURE.length).arrayBuffer());
  } catch {
    return { ok: false, error: "No se pudo leer el contenido del archivo." };
  }
  const looksLikeZip = ZIP_FILE_SIGNATURE.every((expectedByte, index) => header[index] === expectedByte);
  if (!looksLikeZip) {
    return { ok: false, error: "El archivo no tiene una estructura válida de .xlsx." };
  }

  try {
    return { ok: true, buffer: Buffer.from(await file.arrayBuffer()) };
  } catch {
    return { ok: false, error: "No se pudo leer el contenido del archivo." };
  }
}

/**
 * El detalle real de un fallo de ExcelJS (puede incluir rutas internas o
 * texto de la librería) se registra SOLO en el log del servidor — nunca se
 * devuelve crudo al cliente (ver auditoría de seguridad, hallazgo sobre
 * exposición de error.message). El mensaje que sí ve el usuario es genérico
 * y estable.
 */
function logAndBuildParseErrorMessage(context: string, error: unknown): string {
  console.error(`[importaciones] ${context}: no se pudo procesar el archivo.`, error);
  return "No se pudo procesar el archivo. Verificá que sea un .xlsx válido y volvé a intentar.";
}

export interface MaintenanceRequestPreviewPayload {
  fileName: string;
  rows: ParsedMaintenanceRequestRowResult[];
  summary: MaintenanceRequestPreviewSummary;
}

export async function previewMaintenanceRequestFile(
  formData: FormData,
): Promise<ActionResult<MaintenanceRequestPreviewPayload>> {
  const file = getUploadedFile(formData);
  if (!file) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }

  const validated = await readValidatedUploadedFile(file);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  let parsed;
  try {
    parsed = await parseMaintenanceRequestFile(validated.buffer);
  } catch (error) {
    return { ok: false, error: logAndBuildParseErrorMessage("previewMaintenanceRequestFile", error) };
  }

  if (parsed.headerErrors) {
    return {
      ok: false,
      error: `Faltan columnas obligatorias en el archivo: ${parsed.headerErrors.join(", ")}`,
    };
  }

  const summary = await previewMaintenanceRequestImport(parsed.rows);
  return { ok: true, data: { fileName: file.name, rows: parsed.rows, summary } };
}

export async function confirmMaintenanceRequestFile(
  input: unknown,
): Promise<ActionResult<{ importBatchId: string; retroactivelyRelatedCount: number }>> {
  const parseResult = confirmMaintenanceRequestImportSchema.safeParse(input);
  if (!parseResult.success) {
    return { ok: false, error: "Los datos enviados para confirmar la importación no son válidos." };
  }

  const result = await applyMaintenanceRequestImport({
    fileName: parseResult.data.fileName,
    isHistorical: parseResult.data.isHistorical,
    rows: parseResult.data.rows,
  });

  // Importar Solicitudes cambia los KPI de ambas vistas operativas: Dashboard
  // (getOpenBucketCounts/getPeriodStats) e Indicadores (getPeriodStats y
  // demás consultas de indicators.service.ts). Sin revalidar "/indicadores"
  // acá, su Router Cache de cliente podía servir un payload desactualizado
  // tras navegar desde el Panel de control justo después de importar.
  revalidatePath("/importaciones");
  revalidatePath("/solicitudes");
  revalidatePath("/indicadores");
  revalidatePath("/");

  return {
    ok: true,
    data: { importBatchId: result.importBatchId, retroactivelyRelatedCount: result.retroactivelyRelatedCount },
  };
}

export interface MaintenanceLogPreviewPayload {
  fileName: string;
  rows: ParsedMaintenanceLogRowResult[];
  summary: MaintenanceLogPreviewSummary;
}

export async function previewMaintenanceLogFile(
  formData: FormData,
): Promise<ActionResult<MaintenanceLogPreviewPayload>> {
  const file = getUploadedFile(formData);
  if (!file) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }

  const validated = await readValidatedUploadedFile(file);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  let parsed;
  try {
    parsed = await parseMaintenanceLogFile(validated.buffer);
  } catch (error) {
    return { ok: false, error: logAndBuildParseErrorMessage("previewMaintenanceLogFile", error) };
  }

  if (parsed.headerErrors) {
    return {
      ok: false,
      error: `Faltan columnas obligatorias en el archivo: ${parsed.headerErrors.join(", ")}`,
    };
  }

  const isHistorical = formData.get("isHistorical") === "true";
  const summary = await previewMaintenanceLogImport(parsed.rows, isHistorical);
  return { ok: true, data: { fileName: file.name, rows: parsed.rows, summary } };
}

export async function confirmMaintenanceLogFile(
  input: unknown,
): Promise<ActionResult<{ importBatchId: string }>> {
  const parseResult = confirmMaintenanceLogImportSchema.safeParse(input);
  if (!parseResult.success) {
    return { ok: false, error: "Los datos enviados para confirmar la importación no son válidos." };
  }

  const result = await applyMaintenanceLogImport({
    fileName: parseResult.data.fileName,
    isHistorical: parseResult.data.isHistorical,
    rows: parseResult.data.rows,
  });

  // Importar Minutas puede relacionar Solicitudes existentes (cambia
  // "Cerradas" en Indicadores y el detalle de /solicitudes/[parte]) — mismo
  // motivo que en confirmMaintenanceRequestFile arriba.
  revalidatePath("/importaciones");
  revalidatePath("/solicitudes");
  revalidatePath("/indicadores");
  revalidatePath("/");

  return { ok: true, data: { importBatchId: result.importBatchId } };
}
