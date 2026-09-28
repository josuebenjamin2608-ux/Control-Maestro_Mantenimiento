import { describe, expect, it } from "vitest";

import { isAwaitingProduccion } from "./responsible-area";

/**
 * isAwaitingProduccion: única función detrás del texto fijo "A espera de
 * producción" que reemplaza al selector de fecha en CommitmentDateField
 * (detalle de Solicitud). Su contrato es deliberadamente estrecho — SOLO
 * responsibleArea + commitmentDate (ver responsible-area.ts) — por lo que
 * estructuralmente no puede leer ni modificar ESTADO ni ningún otro campo de
 * la Solicitud.
 */
describe("isAwaitingProduccion — caso especial de 'Fecha compromiso' cuando el responsable es Producción", () => {
  it("A. Producción + sin fecha (null) → true (se muestra 'A espera de producción')", () => {
    expect(isAwaitingProduccion("PRODUCCION", null)).toBe(true);
  });

  it("B. Producción + con fecha → false (se respeta la fecha existente, nunca se pisa)", () => {
    expect(isAwaitingProduccion("PRODUCCION", new Date("2026-01-15T00:00:00.000Z"))).toBe(false);
  });

  it("C. Mantenimiento + sin fecha → false (comportamiento actual sin cambios: selector vacío)", () => {
    expect(isAwaitingProduccion("MANTENIMIENTO", null)).toBe(false);
  });

  it("D. Mantenimiento + con fecha → false (comportamiento actual sin cambios: selector con la fecha)", () => {
    expect(isAwaitingProduccion("MANTENIMIENTO", new Date("2026-01-15T00:00:00.000Z"))).toBe(false);
  });

  it("responsable sin definir (null) + sin fecha → false: solo Producción activa el caso especial", () => {
    expect(isAwaitingProduccion(null, null)).toBe(false);
  });

  it("E. la función no recibe ESTADO — su firma es (responsibleArea, commitmentDate) únicamente, no puede leerlo ni modificarlo", () => {
    expect(isAwaitingProduccion.length).toBe(2);
  });
});
