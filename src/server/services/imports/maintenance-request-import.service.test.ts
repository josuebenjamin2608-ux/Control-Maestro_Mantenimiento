import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMaintenanceRequestRowResult } from "@/lib/validations/imports";

/**
 * Prueba de "wiring": que applyMaintenanceRequestImport dispare los canales
 * de notificación (Vento, Telegram) exclusivamente para filas NEW recién
 * persistidas, y nunca para MODIFIED/UNCHANGED/ERROR — sin repetir la
 * lógica de clasificación NEW/MODIFIED/UNCHANGED real (esa la ejerce esta
 * misma prueba, corriendo el código real de classifyRows/applyMaintenance-
 * RequestImport; solo se mockean el cliente de Prisma —con un fake mínimo
 * en memoria, sin tocar Postgres— y los dos servicios de notificación).
 */

const { fakeRequests, sendVentoMock, sendTelegramMock } = vi.hoisted(() => {
  return {
    fakeRequests: new Map<string, Record<string, unknown>>(),
    sendVentoMock: vi.fn<(request: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
    sendTelegramMock: vi.fn<(request: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
  };
});

vi.mock("@/server/services/vento.service", () => ({
  sendMaintenanceRequestCreatedEvent: sendVentoMock,
}));
vi.mock("@/server/services/telegram.service", () => ({
  sendMaintenanceRequestCreatedNotification: sendTelegramMock,
}));

vi.mock("@/lib/db", () => {
  let idCounter = 0;

  const maintenanceRequest = {
    findMany: async ({ where }: { where?: { parte?: { in?: string[] } } }) => {
      const partes = where?.parte?.in ?? [];
      return partes.map((parte) => fakeRequests.get(parte)).filter((row): row is NonNullable<typeof row> => Boolean(row));
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      idCounter += 1;
      const created = {
        id: `id_${idCounter}`,
        responsibleArea: null,
        commitmentDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      fakeRequests.set(data.parte as string, created);
      return created;
    },
    findUniqueOrThrow: async ({ where }: { where: { parte?: string; id?: string } }) => {
      const existing = where.parte
        ? fakeRequests.get(where.parte)
        : [...fakeRequests.values()].find((row) => row.id === where.id);
      if (!existing) throw new Error("MaintenanceRequest not found (fake db)");
      return existing;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = [...fakeRequests.values()].find((row) => row.id === where.id)!;
      const updated = { ...existing, ...data };
      fakeRequests.set(existing.parte as string, updated);
      return updated;
    },
  };

  const tx = {
    maintenanceRequest,
    maintenanceLog: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    importBatch: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "batch_1", ...data }) },
    importRequestResult: { createMany: async () => ({ count: 0 }) },
  };

  return {
    db: {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    },
  };
});

const { applyMaintenanceRequestImport } = await import("./maintenance-request-import.service");

function row(
  rowNumber: number,
  parte: string,
  overrides: Partial<Record<string, string | null>> = {},
): ParsedMaintenanceRequestRowResult {
  return {
    rowNumber,
    ok: true,
    data: {
      rowNumber,
      parte,
      codigo: null,
      maquina: "Máquina 1",
      pieza: null,
      problema: "Problema de prueba",
      tarea: null,
      fecha: "2026-09-17T00:00:00.000Z",
      codemple: null,
      empleado: null,
      estado: "Solicitado",
      ...overrides,
    },
  };
}

describe("applyMaintenanceRequestImport — disparo de notificaciones", () => {
  beforeEach(() => {
    fakeRequests.clear();
    sendVentoMock.mockClear();
    sendTelegramMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispara Vento y Telegram exactamente una vez para una fila NEW, y nunca para MODIFIED/UNCHANGED/ERROR en la misma importación", async () => {
    // Pre-existente para MODIFIED (mismo PARTE, problema distinto al de la fila entrante).
    fakeRequests.set("00000002", {
      id: "existing_2",
      parte: "00000002",
      codigo: null,
      maquina: "Máquina 1",
      pieza: null,
      problema: "Problema viejo",
      tarea: null,
      fecha: new Date("2026-09-17T00:00:00.000Z"),
      codemple: null,
      empleado: null,
      estado: "Solicitado",
      responsibleArea: null,
      commitmentDate: null,
      isHistorical: false,
    });
    // Pre-existente para UNCHANGED (idéntico a la fila entrante).
    fakeRequests.set("00000003", {
      id: "existing_3",
      parte: "00000003",
      codigo: null,
      maquina: "Máquina 1",
      pieza: null,
      problema: "Problema de prueba",
      tarea: null,
      fecha: new Date("2026-09-17T00:00:00.000Z"),
      codemple: null,
      empleado: null,
      estado: "Solicitado",
      responsibleArea: null,
      commitmentDate: null,
      isHistorical: false,
    });

    const rows: ParsedMaintenanceRequestRowResult[] = [
      row(1, "00000001"), // NEW
      row(2, "00000002"), // MODIFIED (problema difiere del existente)
      row(3, "00000003"), // UNCHANGED (idéntico al existente)
      { rowNumber: 4, ok: false, error: "PARTE vacío: la fila no se puede procesar." }, // ERROR
    ];

    const result = await applyMaintenanceRequestImport({
      fileName: "wiring-test.xlsx",
      isHistorical: false,
      rows,
    });

    expect(result.summary.newCount).toBe(1);
    expect(result.summary.modifiedCount).toBe(1);
    expect(result.summary.unchangedCount).toBe(1);
    expect(result.summary.errorCount).toBe(1);

    expect(sendVentoMock).toHaveBeenCalledTimes(1);
    expect(sendTelegramMock).toHaveBeenCalledTimes(1);
    expect(sendVentoMock.mock.calls[0][0]).toMatchObject({ parte: "00000001" });
    expect(sendTelegramMock.mock.calls[0][0]).toMatchObject({ parte: "00000001" });
  });

  it("no dispara ningún canal cuando no hay filas NEW en la importación", async () => {
    fakeRequests.set("00000005", {
      id: "existing_5",
      parte: "00000005",
      codigo: null,
      maquina: "Máquina 1",
      pieza: null,
      problema: "Problema de prueba",
      tarea: null,
      fecha: new Date("2026-09-17T00:00:00.000Z"),
      codemple: null,
      empleado: null,
      estado: "Solicitado",
      responsibleArea: null,
      commitmentDate: null,
      isHistorical: false,
    });

    await applyMaintenanceRequestImport({
      fileName: "wiring-test-2.xlsx",
      isHistorical: false,
      rows: [row(1, "00000005")], // UNCHANGED
    });

    expect(sendVentoMock).not.toHaveBeenCalled();
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });
});
