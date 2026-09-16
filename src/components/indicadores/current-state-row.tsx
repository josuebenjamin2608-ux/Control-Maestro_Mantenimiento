"use client";

import type { OpenBucketCounts } from "@/server/services/maintenance-requests.service";
import { KpiTile } from "./kpi-row";

/**
 * "Estado actual de la operación": TODAS las solicitudes históricas con
 * ESTADO != Realizado, SIN filtro de FECHA — independiente del período
 * seleccionado en /indicadores. Reutiliza getOpenBucketCounts()
 * (maintenance-requests.service.ts, misma fuente que el Dashboard) para no
 * duplicar la definición de "abierta"; cada tarjeta abre el detalle vía los
 * indicators "totalAbierto"/"estadoActual", que aplican el mismo WHERE.
 */
export function CurrentStateRow({ counts }: { counts: OpenBucketCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile
        label="Total abierto"
        value={String(counts.totalAbiertas)}
        tone="default"
        caption="Todas las fechas"
        descriptor={{ title: "Total abierto", query: { indicator: "totalAbierto" } }}
      />
      <KpiTile
        label="Pendientes"
        value={String(counts.pendientes)}
        tone="destructive"
        caption="Todas las fechas"
        descriptor={{
          title: "Pendientes (abiertas)",
          query: { indicator: "estadoActual", bucket: "pendiente" },
        }}
      />
      <KpiTile
        label="En espera"
        value={String(counts.espera)}
        tone="warning"
        caption="Todas las fechas"
        descriptor={{
          title: "En espera (abiertas)",
          query: { indicator: "estadoActual", bucket: "espera" },
        }}
      />
      <KpiTile
        label="Programadas / en ejecución"
        value={String(counts.programadas)}
        tone="primary"
        caption="Todas las fechas"
        descriptor={{
          title: "Programadas / en ejecución (abiertas)",
          query: { indicator: "estadoActual", bucket: "programada" },
        }}
      />
    </div>
  );
}
