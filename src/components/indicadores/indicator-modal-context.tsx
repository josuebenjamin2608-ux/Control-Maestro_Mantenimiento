"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { IndicatorDetailModal, type IndicatorDescriptor } from "./indicator-detail-modal";

interface IndicatorModalContextValue {
  openIndicator: (descriptor: IndicatorDescriptor) => void;
}

const IndicatorModalContext = createContext<IndicatorModalContextValue | null>(null);

/** Usado por cualquier tarjeta/indicador clickeable de /indicadores para abrir el modal de detalle. */
export function useIndicatorModal(): IndicatorModalContextValue {
  const ctx = useContext(IndicatorModalContext);
  if (!ctx) {
    throw new Error("useIndicatorModal debe usarse dentro de <IndicatorModalProvider>.");
  }
  return ctx;
}

/**
 * Envuelve el contenido interactivo de /indicadores. Mantiene UN solo modal
 * (no uno por tarjeta) controlado por qué indicador está seleccionado —
 * año/mes/período vienen del server (mismos que ya usa la página, nunca se
 * recalculan acá) y se combinan con lo que pida cada tarjeta al abrir.
 */
export function IndicatorModalProvider({
  year,
  month,
  periodLabel,
  backHref,
  children,
}: {
  year: number;
  month: number;
  periodLabel: string;
  backHref: string;
  children: ReactNode;
}) {
  const [descriptor, setDescriptor] = useState<IndicatorDescriptor | null>(null);

  const value = useMemo<IndicatorModalContextValue>(() => ({ openIndicator: setDescriptor }), []);

  return (
    <IndicatorModalContext.Provider value={value}>
      {children}
      <IndicatorDetailModal
        descriptor={descriptor}
        year={year}
        month={month}
        periodLabel={periodLabel}
        backHref={backHref}
        onClose={() => setDescriptor(null)}
      />
    </IndicatorModalContext.Provider>
  );
}
