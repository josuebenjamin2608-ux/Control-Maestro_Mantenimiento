import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, daysAgo, makeLogRow, makeRequestRow, type FakeDbState } from "./__fixtures__/fake-maintenance-db";

/**
 * getOpenBucketCounts() es el universo real detrás de "Distribución por
 * estado" cuando /indicadores está SIN un mes específico seleccionado (modo
 * "Año actual" — ver openBucketCountsToDashboardStats en lib/estado.ts y su
 * uso en indicadores/page.tsx): solicitudes ABIERTAS (ESTADO != Realizado),
 * SIN importar cuándo fueron creadas. Estas pruebas verifican ese universo
 * con datos reales en memoria, no que la función haya sido invocada.
 */

const { state } = vi.hoisted(() => ({
  state: { requests: [], logs: [] } as FakeDbState,
}));

vi.mock("@/lib/db", () => ({ db: createFakeDb(state) }));

const { getOpenBucketCounts, getMaintenanceRequestByParte, getAdjacentMaintenanceRequestPartes } =
  await import("./maintenance-requests.service");

beforeEach(() => {
  state.requests = [];
  state.logs = [];
});

describe("getOpenBucketCounts — universo de 'situación actual' (sin filtro de mes)", () => {
  it("TEST 1: una solicitud abierta creada hace varios meses aparece en el conteo actual", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", fecha: daysAgo(180) })];

    const counts = await getOpenBucketCounts();

    expect(counts.totalAbiertas).toBe(1);
    expect(counts.pendientes).toBe(1);
  });

  it("TEST 2: una solicitud abierta creada este mes también aparece", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "En espera", fecha: daysAgo(2) })];

    const counts = await getOpenBucketCounts();

    expect(counts.totalAbiertas).toBe(1);
    expect(counts.espera).toBe(1);
  });

  it("TEST 3: una solicitud con ESTADO Realizado no aparece en ningún bucket ni en el total", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Realizado", fecha: daysAgo(1) }),
      makeRequestRow({ id: "r2", estado: "Realizado", fecha: daysAgo(400) }),
    ];

    const counts = await getOpenBucketCounts();

    expect(counts).toEqual({ totalAbiertas: 0, pendientes: 0, espera: 0, programadas: 0, otros: 0 });
  });

  it("TEST 4: el total abierto es exactamente la suma de sus buckets (el denominador correcto)", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", fecha: daysAgo(1) }), // este mes
      makeRequestRow({ id: "r2", estado: "Solicitado", fecha: daysAgo(90) }), // hace meses
      makeRequestRow({ id: "r3", estado: "En espera", fecha: null }),
      makeRequestRow({ id: "r4", estado: "Programado", fecha: daysAgo(400) }),
      makeRequestRow({ id: "r5", estado: "Realizado", fecha: daysAgo(1) }), // no participa
    ];

    const counts = await getOpenBucketCounts();

    expect(counts.totalAbiertas).toBe(4);
    expect(counts.pendientes + counts.espera + counts.programadas + counts.otros).toBe(counts.totalAbiertas);
  });

  it("el total abierto NUNCA depende del mes en curso: mezcla de fechas de distintos meses, todas cuentan igual", async () => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    state.requests = [
      makeRequestRow({ id: "junio", estado: "Solicitado", fecha: new Date(Date.UTC(currentYear, 5, 10)) }),
      makeRequestRow({ id: "julio", estado: "En espera", fecha: new Date(Date.UTC(currentYear, 6, 10)) }),
      makeRequestRow({ id: "agosto", estado: "Solicitado", fecha: new Date(Date.UTC(currentYear, 7, 10)) }),
      makeRequestRow({ id: "septiembre-realizado", estado: "Realizado", fecha: new Date(Date.UTC(currentYear, 8, 10)) }),
      makeRequestRow({ id: "septiembre-espera", estado: "En espera", fecha: new Date(Date.UTC(currentYear, 8, 10)) }),
      makeRequestRow({ id: "abril", estado: "Solicitado", fecha: new Date(Date.UTC(currentYear, 3, 10)) }),
    ];

    const counts = await getOpenBucketCounts();

    // Universo abierto: junio, julio, agosto, septiembre-espera, abril = 5 (igual al ejemplo del pedido).
    expect(counts.totalAbiertas).toBe(5);
    expect(counts.pendientes).toBe(3);
    expect(counts.espera).toBe(2);
  });
});

describe("getMaintenanceRequestByParte — relación Solicitud <-> Minutas (PARTE <-> OBSERVACIONES.trim())", () => {
  it("una Minuta RELATED aparece en .logs", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002150" })];
    state.logs = [makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED" })];

    const request = await getMaintenanceRequestByParte("00002150");

    expect(request?.logs.map((log) => log.id)).toEqual(["l1"]);
  });

  it("una Minuta PENDING no se considera relacionada: nunca aparece en .logs", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002150" })];
    // PENDING real: OBSERVACIONES coincide con un PARTE, pero maintenanceRequestId
    // queda null hasta que la relación se confirme (ver maintenance-log-import.service.ts).
    state.logs = [makeLogRow({ id: "l1", maintenanceRequestId: null, relationStatus: "PENDING" })];

    const request = await getMaintenanceRequestByParte("00002150");

    expect(request?.logs).toEqual([]);
  });

  it("una Minuta UNRELATED no se considera relacionada: nunca aparece en .logs", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002150" })];
    state.logs = [makeLogRow({ id: "l1", maintenanceRequestId: null, relationStatus: "UNRELATED" })];

    const request = await getMaintenanceRequestByParte("00002150");

    expect(request?.logs).toEqual([]);
  });

  it("una Solicitud sin Minutas relacionadas devuelve .logs vacío", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002150" })];
    state.logs = [];

    const request = await getMaintenanceRequestByParte("00002150");

    expect(request?.logs).toEqual([]);
  });

  it("varias Minutas RELATED aparecen en orden cronológico (fechaini asc)", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002150" })];
    state.logs = [
      makeLogRow({ id: "l3", maintenanceRequestId: "r1", relationStatus: "RELATED", fechaini: daysAgo(1) }),
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", fechaini: daysAgo(10) }),
      makeLogRow({ id: "l2", maintenanceRequestId: "r1", relationStatus: "RELATED", fechaini: daysAgo(5) }),
    ];

    const request = await getMaintenanceRequestByParte("00002150");

    expect(request?.logs.map((log) => log.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("PARTE inexistente devuelve null, sin lanzar", async () => {
    state.requests = [];

    const request = await getMaintenanceRequestByParte("no-existe");

    expect(request).toBeNull();
  });
});

describe("getAdjacentMaintenanceRequestPartes — navegación 'Solicitud anterior/siguiente'", () => {
  it("en medio del listado: anterior es la más reciente, siguiente la más antigua", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "1910", fecha: daysAgo(1) }),
      makeRequestRow({ id: "r2", parte: "1909", fecha: daysAgo(2) }),
      makeRequestRow({ id: "r3", parte: "1908", fecha: daysAgo(3) }),
    ];

    const result = await getAdjacentMaintenanceRequestPartes({ parte: "1909", fecha: daysAgo(2) });

    expect(result).toEqual({ previousParte: "1910", nextParte: "1908" });
  });

  it("la solicitud más reciente no tiene anterior", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "1910", fecha: daysAgo(1) }),
      makeRequestRow({ id: "r2", parte: "1909", fecha: daysAgo(2) }),
    ];

    const result = await getAdjacentMaintenanceRequestPartes({ parte: "1910", fecha: daysAgo(1) });

    expect(result).toEqual({ previousParte: null, nextParte: "1909" });
  });

  it("la solicitud más antigua (sin solicitudes sin fecha) no tiene siguiente", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "1910", fecha: daysAgo(1) }),
      makeRequestRow({ id: "r2", parte: "1909", fecha: daysAgo(2) }),
    ];

    const result = await getAdjacentMaintenanceRequestPartes({ parte: "1909", fecha: daysAgo(2) });

    expect(result).toEqual({ previousParte: "1910", nextParte: null });
  });

  it("misma FECHA: se desempata por PARTE desc, igual que el listado", async () => {
    const sameDay = daysAgo(5);
    state.requests = [
      makeRequestRow({ id: "r1", parte: "1920", fecha: sameDay }),
      makeRequestRow({ id: "r2", parte: "1915", fecha: sameDay }),
      makeRequestRow({ id: "r3", parte: "1910", fecha: sameDay }),
    ];

    const result = await getAdjacentMaintenanceRequestPartes({ parte: "1915", fecha: sameDay });

    expect(result).toEqual({ previousParte: "1920", nextParte: "1910" });
  });

  it("las solicitudes sin FECHA forman un grupo propio antes que las que sí tienen fecha", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "1800", fecha: null }),
      makeRequestRow({ id: "r2", parte: "1700", fecha: null }),
      makeRequestRow({ id: "r3", parte: "1910", fecha: daysAgo(1) }),
    ];

    // La primera solicitud CON fecha (1910) tiene como "anterior" a la última
    // sin fecha (1700, la de PARTE más chico dentro de ese grupo).
    const fromDated = await getAdjacentMaintenanceRequestPartes({ parte: "1910", fecha: daysAgo(1) });
    expect(fromDated).toEqual({ previousParte: "1700", nextParte: null });

    // Dentro del grupo sin fecha, se navega por PARTE desc como cualquier otro.
    const fromUndated = await getAdjacentMaintenanceRequestPartes({ parte: "1800", fecha: null });
    expect(fromUndated).toEqual({ previousParte: null, nextParte: "1700" });

    // La última sin fecha (1700) pasa a la primera CON fecha (1910) como siguiente.
    const lastUndated = await getAdjacentMaintenanceRequestPartes({ parte: "1700", fecha: null });
    expect(lastUndated).toEqual({ previousParte: "1800", nextParte: "1910" });
  });

  it("respeta los mismos filtros que la lista (maquina): ignora solicitudes fuera del filtro", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "1910", fecha: daysAgo(1), maquina: "OTRA" }),
      makeRequestRow({ id: "r2", parte: "1909", fecha: daysAgo(2), maquina: "MAQUINA-X" }),
      makeRequestRow({ id: "r3", parte: "1908", fecha: daysAgo(3), maquina: "OTRA" }),
      makeRequestRow({ id: "r4", parte: "1907", fecha: daysAgo(4), maquina: "MAQUINA-X" }),
    ];

    const result = await getAdjacentMaintenanceRequestPartes(
      { parte: "1909", fecha: daysAgo(2) },
      { maquina: "MAQUINA-X" },
    );

    // Sin el filtro, anterior/siguiente serían 1910/1908; con el filtro,
    // ambas quedan excluidas y la única vecina real es 1907.
    expect(result).toEqual({ previousParte: null, nextParte: "1907" });
  });

  it("una sola solicitud en el conjunto: ni anterior ni siguiente", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "1909", fecha: daysAgo(1) })];

    const result = await getAdjacentMaintenanceRequestPartes({ parte: "1909", fecha: daysAgo(1) });

    expect(result).toEqual({ previousParte: null, nextParte: null });
  });
});
