import { describe, expect, it } from "vitest";

import { openBucketCountsToDashboardStats } from "./estado";

describe("openBucketCountsToDashboardStats — adapta el universo de abiertas a DashboardStats", () => {
  it("TEST 3: 'atendidas' siempre es 0 — Realizado nunca pertenece al universo de abiertas", () => {
    const stats = openBucketCountsToDashboardStats({
      totalAbiertas: 5,
      pendientes: 3,
      espera: 2,
      programadas: 0,
      otros: 0,
    });

    expect(stats.atendidas).toBe(0);
  });

  it("TEST 4: el total (denominador) es exactamente totalAbiertas, no un total de período", () => {
    const stats = openBucketCountsToDashboardStats({
      totalAbiertas: 42,
      pendientes: 10,
      espera: 10,
      programadas: 10,
      otros: 12,
    });

    expect(stats.total).toBe(42);
  });

  it("preserva pendientes/espera/programadas/otros sin transformarlos", () => {
    const stats = openBucketCountsToDashboardStats({
      totalAbiertas: 8,
      pendientes: 3,
      espera: 2,
      programadas: 1,
      otros: 2,
    });

    expect(stats).toEqual({ total: 8, pendientes: 3, espera: 2, programadas: 1, atendidas: 0, otros: 2 });
  });
});
