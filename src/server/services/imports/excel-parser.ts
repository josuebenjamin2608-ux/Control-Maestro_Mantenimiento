import ExcelJS from "exceljs";

export const MAINTENANCE_REQUEST_HEADERS = [
  "PARTE",
  "CODIGO",
  "MAQUINA",
  "PIEZA",
  "PROBLEMA",
  "TAREA",
  "FECHA",
  "CODEMPLE",
  "EMPLEADO",
  "ESTADO",
] as const;

export const MAINTENANCE_LOG_HEADERS = [
  "REGISTRO",
  "FECHAINI",
  "ORDEN",
  "MAQUINA",
  "OPER",
  "NOMBREORD",
  "CCOSTO",
  "OPERACION",
  "CANTIDAD",
  "CODEMP",
  "EMPLEADO",
  "FECHAFIN",
  "HORAINI",
  "HORAFIN",
  "MINUTOS",
  "OBSERVACIONES",
] as const;

export interface HeaderValidationResult {
  valid: boolean;
  missingHeaders: string[];
}

export interface RawRow {
  rowNumber: number;
  values: Record<string, ExcelJS.CellValue>;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export async function loadFirstWorksheet(fileBuffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled types declare their own `Buffer extends ArrayBuffer`,
  // which doesn't line up with @types/node's newer resizable-ArrayBuffer
  // members. Node's Buffer is a valid input at runtime; only the type needs
  // the cast.
  await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("El archivo no contiene ninguna hoja de cálculo.");
  }
  return worksheet;
}

function buildColumnIndex(worksheet: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    map.set(normalizeHeader(cell.value), colNumber);
  });
  return map;
}

export function validateHeaders(
  worksheet: ExcelJS.Worksheet,
  expectedHeaders: readonly string[],
): HeaderValidationResult {
  const columnIndex = buildColumnIndex(worksheet);
  const missingHeaders = expectedHeaders.filter(
    (expected) => !columnIndex.has(normalizeHeader(expected)),
  );
  return { valid: missingHeaders.length === 0, missingHeaders };
}

/**
 * Reads every non-blank data row (from row 2 onward) into a header-keyed map
 * of raw cell values. Fully blank rows (common as trailing rows in exported
 * files) are skipped and never reach the caller.
 */
export function extractDataRows(
  worksheet: ExcelJS.Worksheet,
  expectedHeaders: readonly string[],
): RawRow[] {
  const columnIndex = buildColumnIndex(worksheet);
  const rows: RawRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values: Record<string, ExcelJS.CellValue> = {};
    let hasAnyValue = false;

    for (const header of expectedHeaders) {
      const colIndex = columnIndex.get(normalizeHeader(header));
      const cellValue = colIndex ? row.getCell(colIndex).value : null;
      values[header] = cellValue ?? null;
      if (cellToString(cellValue) !== null) {
        hasAnyValue = true;
      }
    }

    if (hasAnyValue) {
      rows.push({ rowNumber, values });
    }
  }

  return rows;
}

/** Unwraps formula results so callers never see a `{ formula, result }` object. */
function resolveCellValue(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value && value.result !== undefined) {
      return resolveCellValue(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value) {
      return value.text;
    }
  }
  return value;
}

export function cellToString(value: ExcelJS.CellValue): string | null {
  const resolved = resolveCellValue(value);
  if (resolved === null || resolved === undefined) return null;
  if (resolved instanceof Date) return resolved.toISOString();
  const str = String(resolved).trim();
  return str === "" ? null : str;
}

export function cellToIsoDate(value: ExcelJS.CellValue): string | null {
  const resolved = resolveCellValue(value);
  if (resolved === null || resolved === undefined) return null;
  if (resolved instanceof Date) return resolved.toISOString();
  const str = String(resolved).trim();
  if (str === "") return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function cellToInt(value: ExcelJS.CellValue): number | null {
  const resolved = resolveCellValue(value);
  if (resolved === null || resolved === undefined) return null;
  const num = typeof resolved === "number" ? resolved : Number(String(resolved).trim());
  return Number.isFinite(num) ? Math.trunc(num) : null;
}
