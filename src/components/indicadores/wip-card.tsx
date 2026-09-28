"use client";

import { KpiTile } from "./kpi-row";

/**
 * WIP ("Work In Progress"): para esta etapa, EXCLUSIVAMENTE Solicitudes con
 * ESTADO = "En espera" — trabajo que ya inició pero todavía no terminó
 * (Solicitado = no iniciado, Realizado = terminado). Deliberadamente NO usa
 * Minutas para nada (ni su existencia, ni FECHAINI/FECHAFIN, ni su cantidad):
 * solo el campo ESTADO de MaintenanceRequest.
 *
 * `count` DEBE venir de `getOpenBucketCounts().espera`
 * (maintenance-requests.service.ts) — el MISMO conteo ya usado por la
 * tarjeta "En espera" de "Estado actual de la operación" (ver
 * CurrentStateRow), nunca una consulta ni una regla de estado nueva. El
 * detalle interactivo reutiliza, sin cambios, el indicador existente
 * `estadoActual` con `bucket: "espera"` (getIndicatorRequests en
 * indicators.service.ts) — el mismo WHERE que ya calcula ese conteo — así
 * el número de la tarjeta y el total del modal nunca pueden divergir.
 *
 * Backlog abierto = Solicitado + En espera (sin cambios); WIP = En espera:
 * mismo dato que ya compone el Backlog, mostrado también como indicador
 * propio.
 */
export function WipCard({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile
        label="WIP"
        value={String(count)}
        tone="warning"
        caption="Solicitudes 'En espera' — trabajo iniciado, aún no terminado"
        descriptor={{
          title: "WIP — Solicitudes en espera",
          subtitle:
            'WIP = Solicitudes con ESTADO = "En espera" (trabajo ya iniciado, todavía no terminado). Calculado exclusivamente sobre Solicitudes — nunca sobre Minutas.',
          query: { indicator: "estadoActual", bucket: "espera" },
        }}
      />
    </div>
  );
}
