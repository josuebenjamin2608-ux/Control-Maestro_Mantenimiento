import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prueba de "wiring": que assignTechnicianToRequest dispare
 * sendTechnicianAssignedNotification (grupo) y
 * sendTechnicianAssignedDirectNotification (chat privado del técnico, solo
 * si tiene telegramChatId) exclusivamente cuando REALMENTE crea una fila
 * nueva en MaintenanceRequestTechnician — nunca cuando el técnico ya
 * estaba activamente asignado, nunca si la operación falla — y que un
 * fallo de Telegram (grupo o individual) nunca afecte la asignación ya
 * guardada. Se ejerce el código real de assignTechnicianToRequest; solo se
 * mockean el cliente de Prisma (fake mínimo en memoria, sin tocar
 * Postgres), next/cache y el servicio de Telegram.
 */

const { fakeState, sendGroupMock, sendDirectMock } = vi.hoisted(() => {
  return {
    fakeState: {
      requests: new Map<string, Record<string, unknown>>(),
      technicians: new Map<string, Record<string, unknown>>(),
      assignments: [] as Array<{
        id: string;
        maintenanceRequestId: string;
        technicianId: string;
        removedAt: Date | null;
      }>,
      failCreateForTechnicianId: null as string | null,
    },
    sendGroupMock: vi
      .fn<(request: Record<string, unknown>, technicianName: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    sendDirectMock: vi
      .fn<(request: Record<string, unknown>, technicianName: string, telegramChatId: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
});

vi.mock("@/server/services/telegram.service", () => ({
  sendTechnicianAssignedNotification: sendGroupMock,
  sendTechnicianAssignedDirectNotification: sendDirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  let idCounter = 0;

  return {
    db: {
      maintenanceRequest: {
        findUnique: async ({ where }: { where: { id: string } }) => fakeState.requests.get(where.id) ?? null,
      },
      technician: {
        findUnique: async ({ where }: { where: { id: string } }) => fakeState.technicians.get(where.id) ?? null,
      },
      maintenanceRequestTechnician: {
        findFirst: async ({
          where,
        }: {
          where: { maintenanceRequestId: string; technicianId: string; removedAt: null };
        }) =>
          fakeState.assignments.find(
            (row) =>
              row.maintenanceRequestId === where.maintenanceRequestId &&
              row.technicianId === where.technicianId &&
              row.removedAt === where.removedAt,
          ) ?? null,
        create: async ({
          data,
        }: {
          data: { maintenanceRequestId: string; technicianId: string };
        }) => {
          if (fakeState.failCreateForTechnicianId === data.technicianId) {
            throw new Error("Fallo simulado al guardar la asignación (prueba)");
          }
          idCounter += 1;
          const row = {
            id: `assign_${idCounter}`,
            maintenanceRequestId: data.maintenanceRequestId,
            technicianId: data.technicianId,
            removedAt: null,
          };
          fakeState.assignments.push(row);
          return row;
        },
      },
    },
  };
});

const { assignTechnicianToRequest } = await import("./technicians");

const REQUEST_ID = "req_1";
const TECH_A_ID = "tech_a";
const TECH_B_ID = "tech_b";

function seedRequest() {
  fakeState.requests.set(REQUEST_ID, {
    id: REQUEST_ID,
    parte: "00006006",
    codigo: null,
    maquina: "PRUEBA-TELEGRAM-006",
    pieza: null,
    problema: null,
    tarea: null,
    fecha: new Date("2026-09-20T00:00:00.000Z"),
    codemple: null,
    empleado: null,
    estado: "Solicitado",
    responsibleArea: null,
    commitmentDate: null,
    isHistorical: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function seedTechnician(
  id: string,
  fullName: string,
  isActive = true,
  telegramChatId: string | null = null,
) {
  fakeState.technicians.set(id, { id, isActive, fullName, employeeCode: `EMP-${id}`, telegramChatId });
}

describe("assignTechnicianToRequest — disparo de notificación Telegram", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeState.requests.clear();
    fakeState.technicians.clear();
    fakeState.assignments = [];
    fakeState.failCreateForTechnicianId = null;
    sendGroupMock.mockClear();
    sendDirectMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedRequest();
    seedTechnician(TECH_A_ID, "Benjamin Arzuza");
    seedTechnician(TECH_B_ID, "Otro Técnico");
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("una nueva asignación llama a Telegram (grupo) exactamente una vez", async () => {
    const result = await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);

    expect(result.ok).toBe(true);
    expect(fakeState.assignments).toHaveLength(1);
    expect(sendGroupMock).toHaveBeenCalledTimes(1);
    expect(sendGroupMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: REQUEST_ID, parte: "00006006" }),
      "Benjamin Arzuza",
    );
  });

  it("repetir la misma asignación no genera otra notificación (ni de grupo ni individual)", async () => {
    seedTechnician(TECH_A_ID, "Benjamin Arzuza", true, "555111");

    await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);
    await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);

    expect(fakeState.assignments).toHaveLength(1);
    expect(sendGroupMock).toHaveBeenCalledTimes(1);
    expect(sendDirectMock).toHaveBeenCalledTimes(1);
  });

  it("cambiar de técnico A a técnico B genera una notificación de grupo nueva para cada uno", async () => {
    await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);
    await assignTechnicianToRequest(REQUEST_ID, TECH_B_ID);

    expect(fakeState.assignments).toHaveLength(2);
    expect(sendGroupMock).toHaveBeenCalledTimes(2);
    expect(sendGroupMock).toHaveBeenNthCalledWith(1, expect.anything(), "Benjamin Arzuza");
    expect(sendGroupMock).toHaveBeenNthCalledWith(2, expect.anything(), "Otro Técnico");
  });

  it("si falla el guardado de la asignación, nunca se llama a Telegram (ni grupo ni individual)", async () => {
    fakeState.failCreateForTechnicianId = TECH_A_ID;

    await expect(assignTechnicianToRequest(REQUEST_ID, TECH_A_ID)).rejects.toThrow();

    expect(fakeState.assignments).toHaveLength(0);
    expect(sendGroupMock).not.toHaveBeenCalled();
    expect(sendDirectMock).not.toHaveBeenCalled();
  });

  it("un fallo de Telegram (grupo) no revierte la asignación: la fila queda guardada de todas formas", async () => {
    sendGroupMock.mockRejectedValueOnce(new Error("Telegram caído (prueba)"));

    const result = await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);

    expect(result.ok).toBe(true);
    expect(fakeState.assignments).toHaveLength(1);
    expect(sendGroupMock).toHaveBeenCalledTimes(1);
  });

  it("no llama a Telegram si el técnico no existe o no está activo", async () => {
    const missingResult = await assignTechnicianToRequest(REQUEST_ID, "no-existe");
    expect(missingResult.ok).toBe(false);

    seedTechnician("tech_inactive", "Técnico Inactivo", false);
    const inactiveResult = await assignTechnicianToRequest(REQUEST_ID, "tech_inactive");
    expect(inactiveResult.ok).toBe(false);

    expect(fakeState.assignments).toHaveLength(0);
    expect(sendGroupMock).not.toHaveBeenCalled();
    expect(sendDirectMock).not.toHaveBeenCalled();
  });

  it("[con telegramChatId] envía también la notificación individual, con (request, nombre, telegramChatId)", async () => {
    seedTechnician(TECH_A_ID, "Benjamin Arzuza", true, "555111");

    const result = await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);

    expect(result.ok).toBe(true);
    expect(sendDirectMock).toHaveBeenCalledTimes(1);
    expect(sendDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: REQUEST_ID, parte: "00006006" }),
      "Benjamin Arzuza",
      "555111",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("[sin telegramChatId] NO envía la notificación individual, registra un warning, y no falla la asignación", async () => {
    // TECH_A_ID se sembró en beforeEach sin telegramChatId (null).
    const result = await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);

    expect(result.ok).toBe(true);
    expect(fakeState.assignments).toHaveLength(1);
    expect(sendGroupMock).toHaveBeenCalledTimes(1);
    expect(sendDirectMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("Benjamin Arzuza");
    expect(warnSpy.mock.calls[0][0]).toContain("no tiene Telegram vinculado");
  });

  it("un fallo de la notificación individual no revierte la asignación ni impide la notificación de grupo", async () => {
    seedTechnician(TECH_A_ID, "Benjamin Arzuza", true, "555111");
    sendDirectMock.mockRejectedValueOnce(new Error("Telegram caído (prueba)"));

    const result = await assignTechnicianToRequest(REQUEST_ID, TECH_A_ID);

    expect(result.ok).toBe(true);
    expect(fakeState.assignments).toHaveLength(1);
    expect(sendGroupMock).toHaveBeenCalledTimes(1);
    expect(sendDirectMock).toHaveBeenCalledTimes(1);
  });
});
