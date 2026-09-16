"use client";

import type { BacklogBreakdown } from "@/server/services/indicators.service";
import { BacklogCard, type BacklogStatKind } from "./backlog-card";
import { useIndicatorModal } from "./indicator-modal-context";
import type { IndicatorDescriptor } from "./indicator-detail-modal";

const DESCRIPTOR_BY_KIND: Record<BacklogStatKind, IndicatorDescriptor> = {
  total: {
    title: "Backlog",
    subtitle: "Solicitudes sin Realizado, con fecha anterior al período seleccionado",
    query: { indicator: "backlog" },
  },
  over7: {
    title: "Backlog +7 días",
    subtitle: "Solicitudes abiertas con FECHA de más de 7 días respecto a hoy",
    query: { indicator: "backlogOver7" },
  },
  over15: {
    title: "Backlog +15 días",
    subtitle: "Solicitudes abiertas con FECHA de más de 15 días respecto a hoy",
    query: { indicator: "backlogOver15" },
  },
  over30: {
    title: "Backlog +30 días",
    subtitle: "Solicitudes abiertas con FECHA de más de 30 días respecto a hoy",
    query: { indicator: "backlogOver30" },
  },
};

/** Versión interactiva de BacklogCard, usada solo en /indicadores. El Dashboard sigue usando BacklogCard directamente, sin este wrapper. */
export function InteractiveBacklogCard({ backlog }: { backlog: BacklogBreakdown }) {
  const { openIndicator } = useIndicatorModal();

  return (
    <BacklogCard
      backlog={backlog}
      onSelect={(kind) => openIndicator(DESCRIPTOR_BY_KIND[kind])}
    />
  );
}
