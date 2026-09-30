import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FASE 2 — Seguridad de importaciones XLSX. Ejercita el código REAL de
 * previewMaintenanceRequestFile/previewMaintenanceLogFile (imports.ts):
 * solo se mockean los servicios de parseo/preview (que invocarían ExcelJS
 * real) y next/cache, para poder comprobar en aislamiento que la
 * validación de tamaño/estructura corre ANTES de esas llamadas, sin volver
 * a probar la lógica de diff/clasificación de esos servicios (ya cubierta
 * por sus propios tests, sin cambios en esta fase).
 */

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const NOT_ZIP_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // "%PDF" — cualquier archivo real no-ZIP sirve de contraejemplo

/** Construye un File cuyo tamaño y primeros bytes se controlan explícitamente, sin depender de un .xlsx real. */
function makeFile(sizeBytes: number, headerBytes: number[], name = "archivo.xlsx"): File {
  const bytes = new Uint8Array(sizeBytes);
  bytes.set(headerBytes.slice(0, Math.min(headerBytes.length, sizeBytes)));
  return new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function makeFormData(file: File): FormData {
  const formData = new FormData();
  formData.set("file", file);
  return formData;
}

const {
  parseMaintenanceRequestFileMock,
  previewMaintenanceRequestImportMock,
  parseMaintenanceLogFileMock,
  previewMaintenanceLogImportMock,
} = vi.hoisted(() => ({
  parseMaintenanceRequestFileMock: vi.fn(),
  previewMaintenanceRequestImportMock: vi.fn(),
  parseMaintenanceLogFileMock: vi.fn(),
  previewMaintenanceLogImportMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/services/imports/maintenance-request-import.service", () => ({
  parseMaintenanceRequestFile: parseMaintenanceRequestFileMock,
  previewMaintenanceRequestImport: previewMaintenanceRequestImportMock,
  applyMaintenanceRequestImport: vi.fn(),
}));

vi.mock("@/server/services/imports/maintenance-log-import.service", () => ({
  parseMaintenanceLogFile: parseMaintenanceLogFileMock,
  previewMaintenanceLogImport: previewMaintenanceLogImportMock,
  applyMaintenanceLogImport: vi.fn(),
}));

const { previewMaintenanceRequestFile, previewMaintenanceLogFile } = await import("./imports");
const { MAX_IMPORT_FILE_SIZE_BYTES } = await import(
  "@/server/services/imports/import-security"
);

const VALID_PARSE_RESULT = { headerErrors: null, rows: [] };
const CANNED_SUMMARY = {
  totalRows: 0,
  newCount: 0,
  modifiedCount: 0,
  unchangedCount: 0,
  errorCount: 0,
  rows: [],
};

describe("previewMaintenanceRequestFile — protección server-side de archivos .xlsx (FASE 2)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    parseMaintenanceRequestFileMock.mockReset().mockResolvedValue(VALID_PARSE_RESULT);
    previewMaintenanceRequestImportMock.mockReset().mockResolvedValue(CANNED_SUMMARY);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("1. archivo dentro del límite → continúa normalmente (ExcelJS/parse se invoca)", async () => {
    const file = makeFile(1024, ZIP_SIGNATURE);

    const result = await previewMaintenanceRequestFile(makeFormData(file));

    expect(result.ok).toBe(true);
    expect(parseMaintenanceRequestFileMock).toHaveBeenCalledTimes(1);
  });

  it("2. archivo exactamente en el límite → continúa normalmente", async () => {
    const file = makeFile(MAX_IMPORT_FILE_SIZE_BYTES, ZIP_SIGNATURE);

    const result = await previewMaintenanceRequestFile(makeFormData(file));

    expect(result.ok).toBe(true);
    expect(parseMaintenanceRequestFileMock).toHaveBeenCalledTimes(1);
  });

  it("3. archivo por encima del límite → se rechaza con un mensaje claro", async () => {
    const file = makeFile(MAX_IMPORT_FILE_SIZE_BYTES + 1, ZIP_SIGNATURE);

    const result = await previewMaintenanceRequestFile(makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("tamaño máximo permitido");
    }
  });

  it("4. archivo rechazado por tamaño → ExcelJS (parseMaintenanceRequestFile) NUNCA se invoca", async () => {
    const file = makeFile(MAX_IMPORT_FILE_SIZE_BYTES + 1, ZIP_SIGNATURE);

    await previewMaintenanceRequestFile(makeFormData(file));

    expect(parseMaintenanceRequestFileMock).not.toHaveBeenCalled();
  });

  it("5. archivo sin estructura ZIP/xlsx válida → se rechaza antes del parseo", async () => {
    const file = makeFile(1024, NOT_ZIP_SIGNATURE);

    const result = await previewMaintenanceRequestFile(makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("estructura válida de .xlsx");
    }
    expect(parseMaintenanceRequestFileMock).not.toHaveBeenCalled();
  });

  it("6. error interno de ExcelJS → el cliente NUNCA recibe error.message crudo (solo el mensaje genérico)", async () => {
    const internalDetail = "ENOENT: ruta interna /var/task/.next/server/xlsx-internals.js no encontrada";
    parseMaintenanceRequestFileMock.mockRejectedValueOnce(new Error(internalDetail));
    const file = makeFile(1024, ZIP_SIGNATURE);

    const result = await previewMaintenanceRequestFile(makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain(internalDetail);
      expect(result.error).toBe("No se pudo procesar el archivo. Verificá que sea un .xlsx válido y volvé a intentar.");
    }
    // El detalle real sí se registra en el servidor (log), nunca se pierde silenciosamente.
    expect(errorSpy).toHaveBeenCalled();
  });

  it("7. una importación válida sigue produciendo exactamente el mismo resultado (wiring intacto)", async () => {
    const summary = { ...CANNED_SUMMARY, totalRows: 3, newCount: 2, modifiedCount: 1 };
    previewMaintenanceRequestImportMock.mockResolvedValue(summary);
    const file = makeFile(2048, ZIP_SIGNATURE, "solicitudes.xlsx");

    const result = await previewMaintenanceRequestFile(makeFormData(file));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fileName).toBe("solicitudes.xlsx");
      expect(result.data.summary).toEqual(summary);
    }
  });

  it("sin archivo: mismo mensaje de siempre, sin llegar a la validación de tamaño/estructura", async () => {
    const result = await previewMaintenanceRequestFile(new FormData());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("No se recibió ningún archivo.");
    }
    expect(parseMaintenanceRequestFileMock).not.toHaveBeenCalled();
  });
});

describe("previewMaintenanceLogFile — misma protección server-side (FASE 2)", () => {
  beforeEach(() => {
    parseMaintenanceLogFileMock.mockReset().mockResolvedValue(VALID_PARSE_RESULT);
    previewMaintenanceLogImportMock.mockReset().mockResolvedValue(CANNED_SUMMARY);
  });

  it("archivo dentro del límite y con estructura ZIP válida → continúa normalmente", async () => {
    const file = makeFile(1024, ZIP_SIGNATURE);

    const result = await previewMaintenanceLogFile(makeFormData(file));

    expect(result.ok).toBe(true);
    expect(parseMaintenanceLogFileMock).toHaveBeenCalledTimes(1);
  });

  it("archivo por encima del límite → se rechaza sin invocar el parseo", async () => {
    const file = makeFile(MAX_IMPORT_FILE_SIZE_BYTES + 1, ZIP_SIGNATURE);

    const result = await previewMaintenanceLogFile(makeFormData(file));

    expect(result.ok).toBe(false);
    expect(parseMaintenanceLogFileMock).not.toHaveBeenCalled();
  });

  it("archivo sin firma ZIP válida → se rechaza sin invocar el parseo", async () => {
    const file = makeFile(1024, NOT_ZIP_SIGNATURE);

    const result = await previewMaintenanceLogFile(makeFormData(file));

    expect(result.ok).toBe(false);
    expect(parseMaintenanceLogFileMock).not.toHaveBeenCalled();
  });

  it("error interno de ExcelJS al parsear Minutas → mensaje genérico, nunca error.message crudo", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    parseMaintenanceLogFileMock.mockRejectedValueOnce(new Error("detalle interno de ExcelJS"));
    const file = makeFile(1024, ZIP_SIGNATURE);

    const result = await previewMaintenanceLogFile(makeFormData(file));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("detalle interno de ExcelJS");
    }
    errorSpy.mockRestore();
  });
});
