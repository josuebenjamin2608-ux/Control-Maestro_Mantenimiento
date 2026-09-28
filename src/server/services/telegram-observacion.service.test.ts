import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, makeRequestRow, type FakeDbState } from "./__fixtures__/fake-maintenance-db";

/**
 * Ejercita registerObservacionFromTelegram contra el mismo fake en memoria
 * de @/lib/db que el resto de los tests de servicios (nunca toca Postgres
 * real). Cubre las reglas explícitas del flujo "Agregar observación":
 * relación EXACTA por PARTE (nunca difusa), reutilización de la estructura
 * de MaintenanceLog (sin tabla ni campo nuevo), el ESTADO de la Solicitud
 * nunca se toca, y la guarda de duplicados por reintentos/doble-tap.
 */

const { state } = vi.hoisted(() => ({
  state: { requests: [], logs: [] } as FakeDbState,
}));

vi.mock("@/lib/db", () => ({ db: createFakeDb(state) }));

const { registerObservacionFromTelegram } = await import("./telegram-observacion.service");

const TECHNICIAN = { employeeCode: "EMP-001", fullName: "Benjamin Arzuza" };

describe("registerObservacionFromTelegram", () => {
  beforeEach(() => {
    state.requests = [];
    state.logs = [];
  });

  it("[5, 6] crea una Minuta RELATED a la Solicitud correcta cuando el PARTE existe exactamente", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158", maquina: "TORNO CNC 2", estado: "En espera" })];

    const result = await registerObservacionFromTelegram({
      parte: "00002158",
      texto: "Se cambió el rodamiento y quedó en pruebas.",
      technician: TECHNICIAN,
    });

    expect(result).toEqual({ outcome: "registered", maquina: "TORNO CNC 2" });
    expect(state.logs).toHaveLength(1);
    const created = state.logs[0];
    expect(created.maintenanceRequestId).toBe("r1");
    expect(created.relationStatus).toBe("RELATED");
    expect(created.observaciones).toBe("Se cambió el rodamiento y quedó en pruebas.");
    expect(created.parteRaw).toBe("00002158");
    expect(created.isHistorical).toBe(false);
  });

  it("[7] registra fecha y hora usando la estructura existente de Minuta (fechaini), sin inventar una fecha manual", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];
    const before = Date.now();

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación de prueba", technician: TECHNICIAN });

    const after = Date.now();
    const created = state.logs[0];
    expect(created.fechaini).toBeInstanceOf(Date);
    const fechainiTime = (created.fechaini as Date).getTime();
    expect(fechainiTime).toBeGreaterThanOrEqual(before);
    expect(fechainiTime).toBeLessThanOrEqual(after);
  });

  it("nunca completa fechafin (queda null): evita que una observación sobre una Solicitud ABIERTA se cuente como 'cerrada' en Indicadores (getLatestFechafinByRequest filtra fechafin no nulo) ni pise la 'Fecha de Atención Evento' del Excel", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158", estado: "En espera" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación de prueba", technician: TECHNICIAN });

    const created = state.logs[0];
    expect(created.fechafin).toBeNull();
  });

  it("[8] preserva quién registró la observación reutilizando codemp/empleado (campos ya existentes de Minuta)", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación de prueba", technician: TECHNICIAN });

    const created = state.logs[0];
    expect(created.codemp).toBe("EMP-001");
    expect(created.empleado).toBe("Benjamin Arzuza");
  });

  it("[9] nunca modifica el ESTADO de la Solicitud — registrar una observación y cerrarla son acciones distintas", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158", estado: "En espera" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación de prueba", technician: TECHNICIAN });
    await registerObservacionFromTelegram({ parte: "00002158", texto: "Otra observación distinta", technician: TECHNICIAN });

    expect(state.requests[0].estado).toBe("En espera");
  });

  it("[15] PARTE inexistente: nunca crea una Minuta", async () => {
    state.requests = [];

    const result = await registerObservacionFromTelegram({
      parte: "00009999",
      texto: "Texto cualquiera",
      technician: TECHNICIAN,
    });

    expect(result).toEqual({ outcome: "solicitud_not_found" });
    expect(state.logs).toHaveLength(0);
  });

  it("[8, nueva] nunca usa una relación difusa/aproximada: un PARTE parecido pero distinto no relaciona nada", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];

    const result = await registerObservacionFromTelegram({
      parte: "2158", // sin ceros a la izquierda: NO es el mismo valor exacto de columna
      texto: "Texto cualquiera",
      technician: TECHNICIAN,
    });

    expect(result).toEqual({ outcome: "solicitud_not_found" });
    expect(state.logs).toHaveLength(0);
  });

  it("guarda de duplicados: un reintento con el MISMO texto exacto para la MISMA Solicitud dentro de la ventana no crea una segunda Minuta", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158", maquina: "TORNO CNC 2" })];

    const first = await registerObservacionFromTelegram({
      parte: "00002158",
      texto: "Observación repetida",
      technician: TECHNICIAN,
    });
    const second = await registerObservacionFromTelegram({
      parte: "00002158",
      texto: "Observación repetida",
      technician: TECHNICIAN,
    });

    expect(first).toEqual({ outcome: "registered", maquina: "TORNO CNC 2" });
    expect(second).toEqual({ outcome: "registered", maquina: "TORNO CNC 2" });
    expect(state.logs).toHaveLength(1);
  });

  it("un texto distinto para la misma Solicitud SÍ crea una Minuta nueva (no es un falso duplicado)", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Primera observación", technician: TECHNICIAN });
    await registerObservacionFromTelegram({
      parte: "00002158",
      texto: "Segunda observación distinta",
      technician: TECHNICIAN,
    });

    expect(state.logs).toHaveLength(2);
  });

  it("[13] múltiples observaciones quedan disponibles para el historial en orden cronológico (fechaini)", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Primera observación", technician: TECHNICIAN });
    await registerObservacionFromTelegram({ parte: "00002158", texto: "Segunda observación", technician: TECHNICIAN });

    const related = state.logs.filter((log) => log.maintenanceRequestId === "r1");
    expect(related).toHaveLength(2);
    const sorted = [...related].sort(
      (a, b) => (a.fechaini as Date).getTime() - (b.fechaini as Date).getTime(),
    );
    expect(sorted.map((log) => log.observaciones)).toEqual(["Primera observación", "Segunda observación"]);
  });

  it("cada Minuta creada tiene un `registro` único (columna REGISTRO, requerida y única en el schema)", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación A", technician: TECHNICIAN });
    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación B", technician: TECHNICIAN });

    const registros = state.logs.map((log) => log.registro);
    expect(new Set(registros).size).toBe(registros.length);
  });

  it("H. nunca crea una Solicitud nueva: registra la Minuta contra la existente, el número de Solicitudes no cambia", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002158" })];

    await registerObservacionFromTelegram({ parte: "00002158", texto: "Observación de prueba", technician: TECHNICIAN });
    await registerObservacionFromTelegram({ parte: "00002158", texto: "Segunda observación", technician: TECHNICIAN });

    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].id).toBe("r1");
  });

  it("L. el flujo no depende de una fecha de compromiso: registra igual con commitmentDate definida o ausente", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "00002158", commitmentDate: new Date("2026-01-15T00:00:00.000Z") }),
    ];

    const result = await registerObservacionFromTelegram({
      parte: "00002158",
      texto: "Observación de prueba",
      technician: TECHNICIAN,
    });

    expect(result.outcome).toBe("registered");
    expect(state.logs).toHaveLength(1);
  });
});
