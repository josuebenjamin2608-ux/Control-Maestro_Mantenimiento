import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

import {
  createFakeDb,
  daysAgo,
  makeLogRow,
  makeRequestRow,
  type FakeDbState,
} from "../__fixtures__/fake-maintenance-db";

/**
 * Pruebas de la exportación real: se genera el .xlsx con el código real (el
 * único mock es `@/lib/db`) y se lee de vuelta con ExcelJS para comprobar
 * columnas/orden/valores reales — no que una función haya sido invocada.
 */

const { state } = vi.hoisted(() => ({
  state: { requests: [], logs: [] } as FakeDbState,
}));

vi.mock("@/lib/db", () => ({ db: createFakeDb(state) }));

const { buildSolicitudesExportWorkbook, SOLICITUDES_EXPORT_HEADERS, buildSolicitudesExportFileName } =
  await import("./solicitudes-export.service");

beforeEach(() => {
  state.requests = [];
  state.logs = [];
});

async function readWorkbook(buffer: ExcelJS.Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("El archivo generado no tiene ninguna hoja de cálculo.");

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    headers.push(String(cell.value ?? ""));
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rowObj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = row.getCell(idx + 1).value;
    });
    rows.push(rowObj);
  }

  return { worksheet, headers, rows };
}

describe("buildSolicitudesExportWorkbook", () => {
  it("TEST 1: genera correctamente un archivo .xlsx válido (se puede releer con ExcelJS)", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];

    const buffer = await buildSolicitudesExportWorkbook();
    const { worksheet } = await readWorkbook(buffer);

    expect(worksheet.name).toBe("Solicitudes");
    expect(worksheet.rowCount).toBeGreaterThanOrEqual(2); // encabezado + 1 fila
  });

  it("TEST 2 y 3: las 14 columnas existen, EXACTAMENTE en el orden pedido", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];

    const buffer = await buildSolicitudesExportWorkbook();
    const { headers } = await readWorkbook(buffer);

    expect(headers).toHaveLength(14);
    expect(headers).toEqual([...SOLICITUDES_EXPORT_HEADERS]);
    expect(headers).toEqual([
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
      "AREA RESPONSABLE",
      "Fecha de Atención Evento",
      "Fecha de Compromiso",
      "OBSERVACIONES",
    ]);
  });

  it("TEST 4: OBSERVACIONES NUNCA sale de PROBLEMA/TAREA, con o sin Minuta relacionada", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "00000001", problema: "Fuga de aceite", tarea: "Cambio de sello" }),
    ];
    // Sin Minuta relacionada: la celda debe quedar vacía, nunca rellenada con PROBLEMA/TAREA.
    let buffer = await buildSolicitudesExportWorkbook();
    let { rows } = await readWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]["OBSERVACIONES"]).toBeFalsy();

    // Con Minuta relacionada: la celda usa el texto de la Minuta, nunca PROBLEMA/TAREA.
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", observaciones: "Se cambió el sello" }),
    ];
    buffer = await buildSolicitudesExportWorkbook();
    ({ rows } = await readWorkbook(buffer));
    expect(rows[0]["OBSERVACIONES"]).toBe("Se cambió el sello");
    expect(rows[0]["OBSERVACIONES"]).not.toContain("Fuga de aceite");
    expect(rows[0]["OBSERVACIONES"]).not.toContain("Cambio de sello");
  });

  it("TEST 15: OBSERVACIONES sale de las Minutas relacionadas, con la fecha de la Minuta como prefijo", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    const fechafin = new Date(2026, 8, 22); // 22/09/2026 en hora local, igual criterio que MinutaTimeline
    state.logs = [
      makeLogRow({
        id: "l1",
        maintenanceRequestId: "r1",
        relationStatus: "RELATED",
        fechafin,
        observaciones: "Se revisa equipo y se identifica desgaste.",
      }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows[0]["OBSERVACIONES"]).toBe("22/09/2026 - Se revisa equipo y se identifica desgaste.");
  });

  it("TEST 16 y 17: varias Minutas relacionadas NO duplican la fila y sus observaciones se consolidan en una sola celda, en orden cronológico", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00002150" })];
    state.logs = [
      makeLogRow({
        id: "l1",
        maintenanceRequestId: "r1",
        relationStatus: "RELATED",
        fechaini: new Date(2026, 8, 22),
        fechafin: new Date(2026, 8, 22),
        observaciones: "Se revisa equipo y se identifica desgaste.",
      }),
      makeLogRow({
        id: "l2",
        maintenanceRequestId: "r1",
        relationStatus: "RELATED",
        fechaini: new Date(2026, 8, 23),
        fechafin: new Date(2026, 8, 23),
        observaciones: "Se solicita repuesto.",
      }),
      makeLogRow({
        id: "l3",
        maintenanceRequestId: "r1",
        relationStatus: "RELATED",
        fechaini: new Date(2026, 8, 24),
        fechafin: new Date(2026, 8, 24),
        observaciones: "Se instala repuesto y se realiza prueba.",
      }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows).toHaveLength(1); // 1 Solicitud = 1 fila, nunca 1 fila por Minuta
    expect(rows[0]["PARTE"]).toBe("00002150");
    expect(rows[0]["OBSERVACIONES"]).toBe(
      [
        "22/09/2026 - Se revisa equipo y se identifica desgaste.",
        "23/09/2026 - Se solicita repuesto.",
        "24/09/2026 - Se instala repuesto y se realiza prueba.",
      ].join("\n"),
    );
  });

  it("TEST 18: una Minuta PENDING o UNRELATED nunca aporta a OBSERVACIONES", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    state.logs = [
      // PENDING/UNRELATED reales nunca tienen maintenanceRequestId seteado
      // (ver maintenance-log-import.service.ts) — así que ni siquiera
      // entran en request.logs, la misma garantía estructural que usa el
      // resto de la app (getMaintenanceRequestByParte).
      makeLogRow({ id: "l1", maintenanceRequestId: null, relationStatus: "PENDING", observaciones: "No debe aparecer (PENDING)" }),
      makeLogRow({ id: "l2", maintenanceRequestId: null, relationStatus: "UNRELATED", observaciones: "No debe aparecer (UNRELATED)" }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows[0]["OBSERVACIONES"]).toBeFalsy();
  });

  it("observaciones vacías/solo espacios en una Minuta relacionada no generan una línea vacía", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", observaciones: "   " }),
      makeLogRow({
        id: "l2",
        maintenanceRequestId: "r1",
        relationStatus: "RELATED",
        fechafin: new Date(2026, 8, 22),
        observaciones: "Observación real",
      }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows[0]["OBSERVACIONES"]).toBe("22/09/2026 - Observación real");
  });

  it("TEST 5: una solicitud sin Minuta relacionada deja 'Fecha de Atención Evento' vacía", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    state.logs = [];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows[0]["Fecha de Atención Evento"]).toBeFalsy();
  });

  it("TEST 6: una solicitud con Minuta RELATED obtiene correctamente el FECHAFIN", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    const fechafin = daysAgo(3);
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", fechafin }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    const cellValue = rows[0]["Fecha de Atención Evento"];
    expect(cellValue).toBeInstanceOf(Date);
    expect((cellValue as Date).toISOString().slice(0, 10)).toBe(fechafin.toISOString().slice(0, 10));
  });

  it("una Minuta PENDING/UNRELATED (no RELATED) NUNCA se usa como fecha de atención", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "PENDING", fechafin: daysAgo(1) }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows[0]["Fecha de Atención Evento"]).toBeFalsy();
  });

  it("TEST 7: la exportación respeta los filtros existentes (mismo WHERE que la tabla de /solicitudes)", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "00000001", estado: "Solicitado", responsibleArea: "MANTENIMIENTO" }),
      makeRequestRow({ id: "r2", parte: "00000002", estado: "Realizado", responsibleArea: "PRODUCCION" }),
      makeRequestRow({ id: "r3", parte: "00000003", estado: "Solicitado", responsibleArea: "PRODUCCION" }),
    ];

    const buffer = await buildSolicitudesExportWorkbook({ estado: "Solicitado", responsable: "MANTENIMIENTO" });
    const { rows } = await readWorkbook(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]["PARTE"]).toBe("00000001");
  });

  it("TEST 8: una solicitud con varias Minutas relacionadas NO se duplica y usa el FECHAFIN más reciente", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];
    state.logs = [
      makeLogRow({ id: "l1", maintenanceRequestId: "r1", relationStatus: "RELATED", fechafin: daysAgo(10) }),
      makeLogRow({ id: "l2", maintenanceRequestId: "r1", relationStatus: "RELATED", fechafin: daysAgo(2) }),
      makeLogRow({ id: "l3", maintenanceRequestId: "r1", relationStatus: "RELATED", fechafin: daysAgo(20) }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows).toHaveLength(1); // ninguna fila duplicada por r1
    const cellValue = rows[0]["Fecha de Atención Evento"] as Date;
    expect(cellValue.toISOString().slice(0, 10)).toBe(daysAgo(2).toISOString().slice(0, 10));
  });

  it("TEST 9: no exporta filas de más ni de menos que las solicitudes reales que cumplen el filtro", async () => {
    state.requests = [
      makeRequestRow({ id: "r1", parte: "00000001" }),
      makeRequestRow({ id: "r2", parte: "00000002" }),
      makeRequestRow({ id: "r3", parte: "00000003" }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row["PARTE"]).sort()).toEqual(["00000001", "00000002", "00000003"]);
  });

  it("cada columna mapea al campo correcto de MaintenanceRequest (sin mezclar valores)", async () => {
    state.requests = [
      makeRequestRow({
        id: "r1",
        parte: "00000099",
        codigo: "C-1",
        maquina: "EXTRUSORA-01",
        pieza: "Rodillo",
        problema: "Fuga",
        tarea: "Cambio de sello",
        fecha: new Date(Date.UTC(2026, 8, 10)),
        codemple: "E001",
        empleado: "Juan Perez",
        estado: "Solicitado",
        responsibleArea: "MANTENIMIENTO",
        commitmentDate: new Date(Date.UTC(2026, 8, 20)),
      }),
    ];

    const buffer = await buildSolicitudesExportWorkbook();
    const { rows } = await readWorkbook(buffer);
    const row = rows[0];

    expect(row["PARTE"]).toBe("00000099");
    expect(row["CODIGO"]).toBe("C-1");
    expect(row["MAQUINA"]).toBe("EXTRUSORA-01");
    expect(row["PIEZA"]).toBe("Rodillo");
    expect(row["PROBLEMA"]).toBe("Fuga");
    expect(row["TAREA"]).toBe("Cambio de sello");
    expect(row["CODEMPLE"]).toBe("E001");
    expect(row["EMPLEADO"]).toBe("Juan Perez");
    expect(row["ESTADO"]).toBe("Solicitado");
    expect(row["AREA RESPONSABLE"]).toBe("Mantenimiento");
    expect((row["FECHA"] as Date).toISOString().slice(0, 10)).toBe("2026-09-10");
    expect((row["Fecha de Compromiso"] as Date).toISOString().slice(0, 10)).toBe("2026-09-20");
  });

  it("no exporta ningún id interno de Prisma ni columna fuera de las 14 pedidas", async () => {
    state.requests = [makeRequestRow({ id: "r1", parte: "00000001" })];

    const buffer = await buildSolicitudesExportWorkbook();
    const { headers, rows } = await readWorkbook(buffer);

    expect(headers).not.toContain("id");
    expect(headers).not.toContain("ID");
    expect(Object.keys(rows[0])).toHaveLength(14);
  });
});

describe("buildSolicitudesExportFileName", () => {
  it("usa el formato Detalle_Solicitudes_YYYY-MM-DD.xlsx", () => {
    const fileName = buildSolicitudesExportFileName(new Date(Date.UTC(2026, 8, 22)));
    expect(fileName).toBe("Detalle_Solicitudes_2026-09-22.xlsx");
  });
});
