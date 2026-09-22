"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ComplianceSummary } from "@/server/services/indicators.service";
import { KpiTile, type KpiTileTone } from "./kpi-row";

/** Debe coincidir con PROXIMA_A_VENCER_WINDOW_DAYS en indicators.service.ts — la ventana es un umbral configurable, no un hecho de negocio verificado. */
const PROXIMA_A_VENCER_WINDOW_DAYS = 7;

/** Tarjeta no clickeable: % Cumplimiento es una razón calculada, no una lista filtrable de solicitudes (a diferencia del resto de los KPI). */
function StaticTile({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: KpiTileTone }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 px-4 py-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-2xl font-semibold",
            tone === "destructive" && "text-destructive",
            tone === "warning" && "text-warning",
            tone === "primary" && "text-primary",
            tone === "success" && "text-success",
            tone === "default" && "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </CardContent>
    </Card>
  );
}

/**
 * "Cumplimiento de compromisos" (punto 10): Vencidas/Próximas a vencer se
 * calculan solo con commitmentDate + estado (sin ambigüedad). Cumplidas/%
 * Cumplimiento se calculan SOLO sobre atendidas con una Minuta RELATED con
 * FECHAFIN real (decisión explícita del usuario ante la falta de un
 * timestamp de "cuándo pasó a Realizado") — ver getComplianceSummary. El
 * aviso de abajo hace visible ese alcance parcial en vez de dejarlo implícito.
 */
export function ComplianceSection({ summary }: { summary: ComplianceSummary }) {
  const determinableTotal = summary.cumplidas + summary.noCumplidas;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Cumplidas"
          value={String(summary.cumplidas)}
          tone="success"
          caption={
            determinableTotal > 0
              ? `De ${determinableTotal} atendidas con fecha de cierre real`
              : "Sin datos determinables todavía"
          }
          descriptor={{
            title: "Cumplidas",
            subtitle:
              "Atendidas con Minuta relacionada cuyo FECHAFIN fue en o antes de la fecha compromiso",
            query: { indicator: "cumplidas" },
          }}
        />
        <KpiTile
          label="Vencidas"
          value={String(summary.vencidas)}
          tone="destructive"
          caption="Fecha compromiso pasada, aún no atendida"
          descriptor={{ title: "Vencidas", query: { indicator: "vencidas" } }}
        />
        <KpiTile
          label="Próximas a vencer"
          value={String(summary.proximasAVencer)}
          tone="warning"
          caption={`Vence en los próximos ${PROXIMA_A_VENCER_WINDOW_DAYS} días, aún no atendida`}
          descriptor={{ title: "Próximas a vencer", query: { indicator: "proximasAVencer" } }}
        />
        <StaticTile
          label="% Cumplimiento"
          value={summary.percentage !== null ? `${summary.percentage}%` : "--"}
          tone="primary"
          caption="Cumplidas sobre el subconjunto con fecha de cierre real"
        />
      </div>
      {summary.sinFechaDeterminable > 0 ? (
        <p className="text-xs text-muted-foreground">
          {summary.sinFechaDeterminable} solicitud{summary.sinFechaDeterminable === 1 ? "" : "es"}{" "}
          atendida{summary.sinFechaDeterminable === 1 ? "" : "s"} con compromiso no tiene
          {summary.sinFechaDeterminable === 1 ? "" : "n"} ninguna Minuta relacionada con FECHAFIN
          registrado — queda{summary.sinFechaDeterminable === 1 ? "" : "n"} fuera de
          Cumplidas/% Cumplimiento por no existir una fecha real de cierre.
        </p>
      ) : null}
    </div>
  );
}
