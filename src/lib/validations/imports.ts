import { z } from "zod";

/**
 * Shapes for the "importación incremental" flow (Fase 2). A row parsed from
 * an uploaded Excel file is sent to the client for preview, then echoed back
 * verbatim by the client to the confirm step — these schemas are the single
 * source of truth for that round trip, and are re-validated server-side on
 * confirm (never trust a client-sent payload, even one we generated).
 *
 * Dates travel as ISO strings (not `Date`) so the row survives JSON
 * serialization between the preview and confirm requests.
 */

const nullableTrimmedString = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === "" ? null : value));

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Fecha inválida",
});

export const maintenanceRequestRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  parte: z.string().trim().min(1),
  codigo: nullableTrimmedString,
  maquina: nullableTrimmedString,
  pieza: nullableTrimmedString,
  problema: nullableTrimmedString,
  tarea: nullableTrimmedString,
  fecha: isoDateString.nullable(),
  codemple: nullableTrimmedString,
  empleado: nullableTrimmedString,
  estado: nullableTrimmedString,
});
export type MaintenanceRequestRow = z.infer<typeof maintenanceRequestRowSchema>;

export const maintenanceLogRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  registro: z.string().trim().min(1),
  fechaini: isoDateString.nullable(),
  orden: nullableTrimmedString,
  maquina: nullableTrimmedString,
  oper: nullableTrimmedString,
  nombreord: nullableTrimmedString,
  ccosto: nullableTrimmedString,
  operacion: nullableTrimmedString,
  cantidad: nullableTrimmedString,
  codemp: nullableTrimmedString,
  empleado: nullableTrimmedString,
  fechafin: isoDateString.nullable(),
  horaini: nullableTrimmedString,
  horafin: nullableTrimmedString,
  minutos: z.number().int().nullable(),
  observaciones: nullableTrimmedString,
});
export type MaintenanceLogRow = z.infer<typeof maintenanceLogRowSchema>;

/** One line of the uploaded file: either parsed successfully or in error. */
export const parsedRowErrorSchema = z.object({
  rowNumber: z.number().int().positive(),
  ok: z.literal(false),
  error: z.string(),
});

export const parsedMaintenanceRequestRowResultSchema = z.discriminatedUnion("ok", [
  parsedRowErrorSchema,
  z.object({ rowNumber: z.number().int().positive(), ok: z.literal(true), data: maintenanceRequestRowSchema }),
]);
export type ParsedMaintenanceRequestRowResult = z.infer<
  typeof parsedMaintenanceRequestRowResultSchema
>;

export const parsedMaintenanceLogRowResultSchema = z.discriminatedUnion("ok", [
  parsedRowErrorSchema,
  z.object({ rowNumber: z.number().int().positive(), ok: z.literal(true), data: maintenanceLogRowSchema }),
]);
export type ParsedMaintenanceLogRowResult = z.infer<typeof parsedMaintenanceLogRowResultSchema>;

/** Payload the client sends back on confirm: the exact rows previewed. */
export const confirmMaintenanceRequestImportSchema = z.object({
  fileName: z.string().trim().min(1),
  isHistorical: z.boolean(),
  rows: z.array(parsedMaintenanceRequestRowResultSchema),
});
export type ConfirmMaintenanceRequestImportInput = z.infer<
  typeof confirmMaintenanceRequestImportSchema
>;

export const confirmMaintenanceLogImportSchema = z.object({
  fileName: z.string().trim().min(1),
  isHistorical: z.boolean(),
  rows: z.array(parsedMaintenanceLogRowResultSchema),
});
export type ConfirmMaintenanceLogImportInput = z.infer<typeof confirmMaintenanceLogImportSchema>;
