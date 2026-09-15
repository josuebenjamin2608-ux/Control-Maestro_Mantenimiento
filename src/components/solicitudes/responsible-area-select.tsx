"use client";

import { useState, useTransition } from "react";

import { RESPONSIBLE_AREA_OPTIONS, RESPONSIBLE_AREA_UNDEFINED_LABEL } from "@/lib/responsible-area";
import { setMaintenanceRequestResponsibleArea } from "@/server/actions/maintenance-requests";
import type { MaintenanceRequestResponsibleArea } from "@/generated/prisma/client";

const UNDEFINED_OPTION_VALUE = "";

/**
 * Select de "Responsable" en el detalle de Solicitud. Guarda el cambio de
 * inmediato vía Server Action (mismo patrón de mutación que
 * TechnicianAssignment) — no depende de un formulario ni de recargar la
 * página. Completamente separado del selector de técnicos.
 */
export function ResponsibleAreaSelect({
  maintenanceRequestId,
  value,
}: {
  maintenanceRequestId: string;
  value: MaintenanceRequestResponsibleArea | null;
}) {
  const [current, setCurrent] = useState<MaintenanceRequestResponsibleArea | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(rawValue: string) {
    const nextArea = (rawValue || null) as MaintenanceRequestResponsibleArea | null;
    const previous = current;
    setError(null);
    setCurrent(nextArea);
    startTransition(async () => {
      const result = await setMaintenanceRequestResponsibleArea(maintenanceRequestId, nextArea);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={current ?? UNDEFINED_OPTION_VALUE}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending}
        className="h-9 w-fit min-w-40 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <option value={UNDEFINED_OPTION_VALUE}>{RESPONSIBLE_AREA_UNDEFINED_LABEL}</option>
        {RESPONSIBLE_AREA_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
