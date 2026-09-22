"use client";

import type { BacklogAgeBuckets } from "@/server/services/indicators.service";
import { BacklogCard, type BacklogStatKind } from "./backlog-card";
import { useIndicatorModal } from "./indicator-modal-context";
import type { IndicatorDescriptor } from "./indicator-detail-modal";

const DESCRIPTOR_BY_KIND: Record<BacklogStatKind, IndicatorDescriptor> = {
  total: {
    title: "Backlog — Total abierto",
    subtitle: "Solicitudes con ESTADO != Realizado, sin importar la fecha (igual a \"Total abierto\")",
    query: { indicator: "totalAbierto" },
  },
  days0to5: {
    title: "Backlog 0-5 días",
    subtitle: "Solicitudes abiertas con FECHA de entre 0 y 5 días respecto a hoy",
    query: { indicator: "backlogDays0to5" },
  },
  days6to15: {
    title: "Backlog 6-15 días",
    subtitle: "Solicitudes abiertas con FECHA de entre 6 y 15 días respecto a hoy",
    query: { indicator: "backlogDays6to15" },
  },
  days16to30: {
    title: "Backlog 16-30 días",
    subtitle: "Solicitudes abiertas con FECHA de entre 16 y 30 días respecto a hoy",
    query: { indicator: "backlogDays16to30" },
  },
  daysOver30: {
    title: "Backlog +30 días",
    subtitle: "Solicitudes abiertas con FECHA de más de 30 días respecto a hoy",
    query: { indicator: "backlogDaysOver30" },
  },
  sinFecha: {
    title: "Backlog — Sin fecha",
    subtitle: "Solicitudes abiertas sin FECHA registrada: antigüedad no determinable",
    query: { indicator: "backlogSinFecha" },
  },
};

/** Versión interactiva de BacklogCard, usada solo en /indicadores. */
export function InteractiveBacklogCard({ backlog }: { backlog: BacklogAgeBuckets }) {
  const { openIndicator } = useIndicatorModal();

  return (
    <BacklogCard
      backlog={backlog}
      onSelect={(kind) => openIndicator(DESCRIPTOR_BY_KIND[kind])}
    />
  );
}
