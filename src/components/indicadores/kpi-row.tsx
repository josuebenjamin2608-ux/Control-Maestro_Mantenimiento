"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardStats } from "@/lib/estado";
import { cn } from "@/lib/utils";
import { useIndicatorModal } from "./indicator-modal-context";
import type { IndicatorDescriptor } from "./indicator-detail-modal";

type Tone = "default" | "destructive" | "warning" | "primary" | "success";

function Tile({
  label,
  value,
  tone,
  descriptor,
  caption,
}: {
  label: string;
  value: string;
  tone: Tone;
  descriptor: IndicatorDescriptor;
  /**
   * Aclara el alcance temporal exacto de esta cifra. Necesario porque
   * Pendientes/En espera en el Dashboard son "abiertas, todas las fechas"
   * (ESTADO != Realizado, sin filtro de FECHA — estado operativo actual),
   * mientras que acá son "dentro del período" (FECHA en el rango
   * seleccionado, vía getPeriodStats) — dos definiciones legítimamente
   * distintas que comparten el mismo nombre visual, así que nunca deben
   * coincidir numéricamente salvo coincidencia.
   */
  caption: string;
}) {
  const { openIndicator } = useIndicatorModal();

  return (
    <button
      type="button"
      onClick={() => openIndicator(descriptor)}
      className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      <Card className="cursor-pointer transition-colors hover:border-primary/50">
        <CardContent className="flex flex-col gap-1 px-4 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
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
    </button>
  );
}

/** Fila de KPI principal del período: Solicitudes / Pendientes / Espera / Atendidas / % / Cerradas. Cada tarjeta abre el detalle de solicitudes que la componen. */
export function KpiRow({ stats, closedTasks }: { stats: DashboardStats; closedTasks: number }) {
  const percentage = stats.total > 0 ? Math.round((stats.atendidas / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile
        label="Solicitudes"
        value={String(stats.total)}
        tone="default"
        caption="Con FECHA en el período"
        descriptor={{ title: "Solicitudes del período", query: { indicator: "solicitudes" } }}
      />
      <Tile
        label="Pendientes"
        value={String(stats.pendientes)}
        tone="destructive"
        caption="Con FECHA en el período (no el total abierto)"
        descriptor={{ title: "Pendientes", query: { indicator: "estado", bucket: "pendiente" } }}
      />
      <Tile
        label="En espera"
        value={String(stats.espera)}
        tone="warning"
        caption="Con FECHA en el período (no el total abierto)"
        descriptor={{ title: "En espera", query: { indicator: "estado", bucket: "espera" } }}
      />
      <Tile
        label="Atendidas"
        value={String(stats.atendidas)}
        tone="success"
        caption="Con FECHA en el período"
        descriptor={{ title: "Atendidas", query: { indicator: "estado", bucket: "atendida" } }}
      />
      <Tile
        label="% Atendidas"
        value={`${percentage}%`}
        tone="primary"
        caption="Sobre el total del período"
        descriptor={{
          title: "% Atendidas",
          subtitle: "Detalle del porcentaje de atendidas sobre el total del período",
          query: { indicator: "pctAtendidas" },
        }}
      />
      <Tile
        label="Cerradas"
        value={String(closedTasks)}
        tone="default"
        caption="FECHAFIN de Minuta en el período"
        descriptor={{
          title: "Cerradas",
          subtitle: "Solicitudes cuya Minuta relacionada registra FECHAFIN dentro del período",
          query: { indicator: "cerradas" },
        }}
      />
    </div>
  );
}
