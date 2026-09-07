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

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function getUploadedFile(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File ? file : null;
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

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "No se pudo leer el contenido del archivo." };
  }

  let parsed;
  try {
    parsed = await parseMaintenanceRequestFile(buffer);
  } catch (error) {
    return {
      ok: false,
      error: `No se pudo procesar el archivo (¿es un .xlsx válido?): ${(error as Error).message}`,
    };
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

  revalidatePath("/importaciones");
  revalidatePath("/solicitudes");
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

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "No se pudo leer el contenido del archivo." };
  }

  let parsed;
  try {
    parsed = await parseMaintenanceLogFile(buffer);
  } catch (error) {
    return {
      ok: false,
      error: `No se pudo procesar el archivo (¿es un .xlsx válido?): ${(error as Error).message}`,
    };
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

  revalidatePath("/importaciones");
  revalidatePath("/solicitudes");
  revalidatePath("/");

  return { ok: true, data: { importBatchId: result.importBatchId } };
}
