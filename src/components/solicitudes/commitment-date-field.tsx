"use client";

import { useState, useTransition } from "react";

import { setMaintenanceRequestCommitmentDate } from "@/server/actions/maintenance-requests";

/** "YYYY-MM-DD" en UTC — valor que espera un `<input type="date">`, mismo criterio que FECHA (ver src/lib/dates.ts). */
function toInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Selector de "Fecha compromiso" en el detalle de Solicitud. Mismo patrón de
 * mutación optimista + Server Action que ResponsibleAreaSelect: guarda el
 * cambio de inmediato, sin depender de un formulario ni de recargar la
 * página.
 */
export function CommitmentDateField({
  maintenanceRequestId,
  value,
}: {
  maintenanceRequestId: string;
  value: Date | null;
}) {
  const [current, setCurrent] = useState<Date | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(rawValue: string) {
    const previous = current;
    const isoDate = rawValue || null;
    setError(null);
    setCurrent(isoDate ? new Date(`${isoDate}T00:00:00.000Z`) : null);
    startTransition(async () => {
      const result = await setMaintenanceRequestCommitmentDate(maintenanceRequestId, isoDate);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="date"
        value={toInputValue(current)}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      {!current ? <span className="text-sm text-muted-foreground">Sin fecha compromiso</span> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
