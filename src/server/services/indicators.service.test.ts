import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeDb,
  daysAgo,
  daysFromNow,
  makeLogRow,
  makeRequestRow,
  type FakeDbState,
} from "./__fixtures__/fake-maintenance-db";

/**
 * Pruebas de LÓGICA DE NEGOCIO real de indicators.service.ts (y de
 * maintenance-requests.service.ts en lo que hace falta para probar
 * consistencia entre indicadores): se arman filas en memoria, se ejecuta el
 * código real de cálculo, y se comprueban los RESULTADOS (conteos, universos,
 * qué solicitud cae en qué categoría) — no si una función fue invocada. El
 * único mock es `@/lib/db`, reemplazado por un motor de WHERE en memoria
 * (ver __fixtures__/fake-maintenance-db.ts) que evalúa las mismas
 * condiciones que recibiría Postgres.
 */

const { state } = vi.hoisted(() => ({
  state: { requests: [], logs: [] } as FakeDbState,
}));

vi.mock("@/lib/db", () => ({ db: createFakeDb(state) }));

const {
  getBacklogAgeBuckets,
  getIndicatorRequests,
  getComplianceSummary,
  getMonthlyCountsForYear,
} = await import("./indicators.service");
const { getOpenRequestsByResponsibleArea } = await import("./maintenance-requests.service");

beforeEach(() => {
  state.requests = [];
  state.logs = [];
});

describe("getBacklogAgeBuckets — antigüedad del backlog en categorías excluyentes", () => {
  it("una solicitud de 0-5 días pertenece únicamente a la categoría 0-5", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", fecha: daysAgo(2) })];

    const buckets = await getBacklogAgeBuckets();

    expect(buckets).toEqual({
      total: 1,
      days0to5: 1,
      days6to15: 0,
      days16to30: 0,
      daysOver30: 0,
      sinFecha: 0,
    });
  });

  it("una solicitud de 6-15 días pertenece únicamente a la categoría 6-15", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "En espera", fecha: daysAgo(10) })];

    const buckets = await getBacklogAgeBuckets();

    expect(buckets).toEqual({
      total: 1,
      days0to5: 0,
      days6to15: 1,
      days16to30: 0,
      daysOver30: 0,
      sinFecha: 0,
    });
  });

  it("una solicitud de 16-30 días pertenece únicamente a la categoría 16-30", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Programado", fecha: daysAgo(20) })];

    const buckets = await getBacklogAgeBuckets();

    expect(buckets).toEqual({
      total: 1,
      days0to5: 0,
      days6to15: 0,
      days16to30: 1,
      daysOver30: 0,
      sinFecha: 0,
    });
  });

  it("una solicitud de +30 días pertenece únicamente a la categoría +30", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", fecha: daysAgo(45) })];

    const buckets = await getBacklogAgeBuckets();

    expect(buckets).toEqual({
      total: 1,
      days0to5: 0,
      days6to15: 0,
      days16to30: 0,
      daysOver30: 1,
      sinFecha: 0,
    });
  });

  it("una solicitud con FECHA null pertenece únicamente a 'Sin fecha' — nunca a +30", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", fecha: null })];

    const buckets = await getBacklogAgeBuckets();

    expect(buckets).toEqual({
      total: 1,
      days0to5: 0,
      days6to15: 0,
      days16to30: 0,
      daysOver30: 0,
      sinFecha: 1,
    });
  });

  it("ninguna solicitud aparece en dos categorías a la vez", async () => {
    state.requests = [
      makeRequestRow({ id: "r-0a5", estado: "Solicitado", fecha: daysAgo(2) }),
      makeRequestRow({ id: "r-6a15", estado: "Solicitado", fecha: daysAgo(10) }),
      makeRequestRow({ id: "r-16a30", estado: "Solicitado", fecha: daysAgo(20) }),
      makeRequestRow({ id: "r-30mas", estado: "Solicitado", fecha: daysAgo(45) }),
      makeRequestRow({ id: "r-sinfecha", estado: "Solicitado", fecha: null }),
    ];

    const buckets = await getBacklogAgeBuckets();

    expect(buckets.total).toBe(5);
    expect(buckets.days0to5).toBe(1);
    expect(buckets.days6to15).toBe(1);
    expect(buckets.days16to30).toBe(1);
    expect(buckets.daysOver30).toBe(1);
    expect(buckets.sinFecha).toBe(1);
  });

  it("la suma de las 5 categorías siempre es igual a Total abierto, con datos mezclados y Realizado excluido", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", fecha: daysAgo(1) }),
      makeRequestRow({ id: "r2", estado: "En espera", fecha: daysAgo(3) }),
      makeRequestRow({ id: "r3", estado: "Solicitado", fecha: daysAgo(9) }),
      makeRequestRow({ id: "r4", estado: "Programado", fecha: daysAgo(14) }),
      makeRequestRow({ id: "r5", estado: "En ejecucion", fecha: daysAgo(25) }),
      makeRequestRow({ id: "r6", estado: "Solicitado", fecha: daysAgo(60) }),
      makeRequestRow({ id: "r7", estado: "Solicitado", fecha: daysAgo(90) }),
      makeRequestRow({ id: "r8", estado: "Solicitado", fecha: null }),
      makeRequestRow({ id: "r9", estado: "En espera", fecha: null }),
      // Realizado: NO debe contarse en ningún bucket ni en el total.
      makeRequestRow({ id: "r10", estado: "Realizado", fecha: daysAgo(200) }),
      makeRequestRow({ id: "r11", estado: "Realizado", fecha: null }),
    ];

    const buckets = await getBacklogAgeBuckets();
    const sum = buckets.days0to5 + buckets.days6to15 + buckets.days16to30 + buckets.daysOver30 + buckets.sinFecha;

    expect(buckets.total).toBe(9); // 11 filas - 2 Realizado
    expect(sum).toBe(buckets.total);
  });

  it("el detalle desplegable de cada categoría (backlogDays*/backlogSinFecha) usa exactamente el mismo universo que los contadores", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", fecha: daysAgo(2) }),
      makeRequestRow({ id: "r2", estado: "En espera", fecha: daysAgo(10) }),
      makeRequestRow({ id: "r3", estado: "Programado", fecha: daysAgo(20) }),
      makeRequestRow({ id: "r4", estado: "Solicitado", fecha: daysAgo(45) }),
      makeRequestRow({ id: "r5", estado: "Solicitado", fecha: null }),
      makeRequestRow({ id: "r6", estado: "Solicitado", fecha: null }),
      makeRequestRow({ id: "r7", estado: "Realizado", fecha: null }), // no participa
    ];
    const year = new Date().getFullYear();

    const buckets = await getBacklogAgeBuckets();
    const [days0to5, days6to15, days16to30, daysOver30, sinFecha] = await Promise.all([
      getIndicatorRequests({ indicator: "backlogDays0to5", year, take: 50, skip: 0 }),
      getIndicatorRequests({ indicator: "backlogDays6to15", year, take: 50, skip: 0 }),
      getIndicatorRequests({ indicator: "backlogDays16to30", year, take: 50, skip: 0 }),
      getIndicatorRequests({ indicator: "backlogDaysOver30", year, take: 50, skip: 0 }),
      getIndicatorRequests({ indicator: "backlogSinFecha", year, take: 50, skip: 0 }),
    ]);

    expect(days0to5.total).toBe(buckets.days0to5);
    expect(days6to15.total).toBe(buckets.days6to15);
    expect(days16to30.total).toBe(buckets.days16to30);
    expect(daysOver30.total).toBe(buckets.daysOver30);
    expect(sinFecha.total).toBe(buckets.sinFecha);
    expect(sinFecha.items.map((item) => item.id).sort()).toEqual(["r5", "r6"]);
  });
});

describe("getOpenRequestsByResponsibleArea — distribución por responsable (universo backlog)", () => {
  it("MANTENIMIENTO cuenta solamente solicitudes abiertas de Mantenimiento", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r2", estado: "Realizado", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r3", estado: "En espera", responsibleArea: "PRODUCCION" }),
    ];

    const summary = await getOpenRequestsByResponsibleArea();

    expect(summary.mantenimiento).toBe(1);
  });

  it("PRODUCCION cuenta solamente solicitudes abiertas de Producción", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", responsibleArea: "PRODUCCION" }),
      makeRequestRow({ id: "r2", estado: "Realizado", responsibleArea: "PRODUCCION" }),
      makeRequestRow({ id: "r3", estado: "En espera", responsibleArea: "MANTENIMIENTO" }),
    ];

    const summary = await getOpenRequestsByResponsibleArea();

    expect(summary.produccion).toBe(1);
  });

  it("responsibleArea null cuenta como Sin definir", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", responsibleArea: null }),
      makeRequestRow({ id: "r2", estado: "En espera", responsibleArea: null }),
    ];

    const summary = await getOpenRequestsByResponsibleArea();

    expect(summary.sinDefinir).toBe(2);
    expect(summary.mantenimiento).toBe(0);
    expect(summary.produccion).toBe(0);
  });

  it("las solicitudes Realizado no participan en ningún responsable", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Realizado", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r2", estado: "Realizado", responsibleArea: "PRODUCCION" }),
      makeRequestRow({ id: "r3", estado: "Realizado", responsibleArea: null }),
    ];

    const summary = await getOpenRequestsByResponsibleArea();

    expect(summary).toEqual({ mantenimiento: 0, produccion: 0, sinDefinir: 0 });
  });

  it("la suma por responsable es igual a Total abierto (mismo universo que el Backlog)", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", responsibleArea: "MANTENIMIENTO", fecha: daysAgo(1) }),
      makeRequestRow({ id: "r2", estado: "En espera", responsibleArea: "PRODUCCION", fecha: daysAgo(10) }),
      makeRequestRow({ id: "r3", estado: "Programado", responsibleArea: null, fecha: null }),
      makeRequestRow({ id: "r4", estado: "Solicitado", responsibleArea: "MANTENIMIENTO", fecha: daysAgo(40) }),
      makeRequestRow({ id: "r5", estado: "Realizado", responsibleArea: "MANTENIMIENTO", fecha: daysAgo(1) }),
    ];

    const [summary, buckets] = await Promise.all([getOpenRequestsByResponsibleArea(), getBacklogAgeBuckets()]);

    expect(summary.mantenimiento + summary.produccion + summary.sinDefinir).toBe(buckets.total);
    expect(buckets.total).toBe(4);
  });

  it("el detalle desplegable por responsable (responsableAbierto) usa exactamente el mismo universo que el contador", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r2", estado: "En espera", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r3", estado: "Realizado", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r4", estado: "Solicitado", responsibleArea: "PRODUCCION" }),
      makeRequestRow({ id: "r5", estado: "Solicitado", responsibleArea: null }),
    ];
    const year = new Date().getFullYear();

    const summary = await getOpenRequestsByResponsibleArea();
    const [mantenimiento, produccion, sinDefinir] = await Promise.all([
      getIndicatorRequests({ indicator: "responsableAbierto", responsable: "MANTENIMIENTO", year, take: 50, skip: 0 }),
      getIndicatorRequests({ indicator: "responsableAbierto", responsable: "PRODUCCION", year, take: 50, skip: 0 }),
      getIndicatorRequests({ indicator: "responsableAbierto", responsable: "sin_definir", year, take: 50, skip: 0 }),
    ]);

    expect(mantenimiento.total).toBe(summary.mantenimiento);
    expect(produccion.total).toBe(summary.produccion);
    expect(sinDefinir.total).toBe(summary.sinDefinir);
  });
});

describe("getComplianceSummary — Cumplimiento de compromisos", () => {
  it("abierta con commitmentDate pasada = Vencida", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", commitmentDate: daysAgo(2) })];

    const summary = await getComplianceSummary();

    expect(summary.vencidas).toBe(1);
    expect(summary.proximasAVencer).toBe(0);
  });

  it("abierta con commitmentDate dentro de los próximos 7 días = Próxima a vencer", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", commitmentDate: daysFromNow(3) })];

    const summary = await getComplianceSummary();

    expect(summary.proximasAVencer).toBe(1);
    expect(summary.vencidas).toBe(0);
  });

  it("abierta con commitmentDate posterior a 7 días NO es Próxima a vencer (ni Vencida)", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Solicitado", commitmentDate: daysFromNow(10) })];

    const summary = await getComplianceSummary();

    expect(summary.proximasAVencer).toBe(0);
    expect(summary.vencidas).toBe(0);
  });

  it("realizada con Minuta RELATED y FECHAFIN <= commitmentDate = Cumplida", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Realizado", commitmentDate: daysAgo(1) })];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", fechafin: daysAgo(2) }),
    ];

    const summary = await getComplianceSummary();

    expect(summary.cumplidas).toBe(1);
    expect(summary.noCumplidas).toBe(0);
    expect(summary.percentage).toBe(100);
  });

  it("realizada con FECHAFIN > commitmentDate NO es Cumplida", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Realizado", commitmentDate: daysAgo(5) })];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", fechafin: daysAgo(1) }),
    ];

    const summary = await getComplianceSummary();

    expect(summary.cumplidas).toBe(0);
    expect(summary.noCumplidas).toBe(1);
    expect(summary.percentage).toBe(0);
  });

  it("realizada sin fecha de finalización determinable queda fuera del porcentaje (no cumplida ni no-cumplida)", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Realizado", commitmentDate: daysAgo(5) })];
    state.logs = []; // sin Minuta relacionada: no hay FECHAFIN real que evaluar

    const summary = await getComplianceSummary();

    expect(summary.cumplidas).toBe(0);
    expect(summary.noCumplidas).toBe(0);
    expect(summary.sinFechaDeterminable).toBe(1);
    expect(summary.percentage).toBeNull();
  });

  it("una Minuta RELATED de OTRA solicitud no cuenta como fecha de cierre de esta", async () => {
    state.requests = [makeRequestRow({ id: "r1", estado: "Realizado", commitmentDate: daysAgo(5) })];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r2", relationStatus: "RELATED", fechafin: daysAgo(1) }),
    ];

    const summary = await getComplianceSummary();

    expect(summary.sinFechaDeterminable).toBe(1);
    expect(summary.cumplidas).toBe(0);
  });

  it("solicitudes sin commitmentDate no participan en ninguna cifra de Cumplimiento", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", commitmentDate: null }),
      makeRequestRow({ id: "r2", estado: "Realizado", commitmentDate: null }),
    ];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r2", relationStatus: "RELATED", fechafin: daysAgo(1) }),
    ];

    const summary = await getComplianceSummary();

    expect(summary).toEqual({
      vencidas: 0,
      proximasAVencer: 0,
      cumplidas: 0,
      noCumplidas: 0,
      percentage: null,
      sinFechaDeterminable: 0,
    });
  });

  it("mezcla realista: cada solicitud cae en la categoría correcta y el % se calcula solo sobre lo determinable", async () => {
    state.requests = [
      makeRequestRow({ id: "vencida-1", estado: "Solicitado", commitmentDate: daysAgo(1) }),
      makeRequestRow({ id: "proxima-1", estado: "En espera", commitmentDate: daysFromNow(5) }),
      makeRequestRow({ id: "lejana-1", estado: "Solicitado", commitmentDate: daysFromNow(20) }),
      makeRequestRow({ id: "cumplida-1", estado: "Realizado", commitmentDate: daysAgo(3) }),
      makeRequestRow({ id: "nocumplida-1", estado: "Realizado", commitmentDate: daysAgo(10) }),
      makeRequestRow({ id: "sindato-1", estado: "Realizado", commitmentDate: daysAgo(10) }),
      makeRequestRow({ id: "sincompromiso-1", estado: "Solicitado", commitmentDate: null }),
    ];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "cumplida-1", relationStatus: "RELATED", fechafin: daysAgo(4) }),
      makeLogRow({ id: "l2", maintenanceRequestId: "nocumplida-1", relationStatus: "RELATED", fechafin: daysAgo(2) }),
    ];

    const summary = await getComplianceSummary();

    expect(summary.vencidas).toBe(1);
    expect(summary.proximasAVencer).toBe(1);
    expect(summary.cumplidas).toBe(1);
    expect(summary.noCumplidas).toBe(1);
    expect(summary.sinFechaDeterminable).toBe(1);
    expect(summary.percentage).toBe(50); // 1 cumplida de 2 determinables
  });
});

describe("getMonthlyCountsForYear — truncado de meses futuros", () => {
  it("el año actual no muestra meses futuros", async () => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;

    const points = await getMonthlyCountsForYear(currentYear);

    expect(points).toHaveLength(currentMonth);
    expect(points[points.length - 1]?.month).toBe(currentMonth);
    expect(points.some((point) => point.month > currentMonth)).toBe(false);
  });

  it("un año anterior conserva los 12 meses completos", async () => {
    const pastYear = new Date().getUTCFullYear() - 1;

    const points = await getMonthlyCountsForYear(pastYear);

    expect(points).toHaveLength(12);
    expect(points.map((point) => point.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("cuenta datos reales del año actual dentro del rango no truncado", async () => {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const thisMonthIndex = now.getUTCMonth(); // 0-based
    state.requests = [
      makeRequestRow({ id: "r1", estado: "Solicitado", fecha: new Date(Date.UTC(currentYear, thisMonthIndex, 10)) }),
    ];

    const points = await getMonthlyCountsForYear(currentYear);
    const thisMonthPoint = points.find((point) => point.month === thisMonthIndex + 1);

    expect(thisMonthPoint?.count).toBe(1);
  });
});
