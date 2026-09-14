"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  assignTechnicianToRequest,
  unassignTechnicianFromRequest,
} from "@/server/actions/technicians";
import type { Technician } from "@/generated/prisma/client";

/**
 * Sección "Técnico asignado" real: lista los técnicos ya asignados (chips
 * removibles) y abre un panel para agregar/quitar técnicos activos reales
 * (nunca inventados). Cada cambio se persiste de inmediato vía Server
 * Action — no hay un paso "Guardar" separado, ni estado duplicado en
 * cliente más allá del optimista mientras la acción está en curso.
 */
export function TechnicianAssignment({
  maintenanceRequestId,
  assignedTechnicians,
  allTechnicians,
}: {
  maintenanceRequestId: string;
  assignedTechnicians: Technician[];
  allTechnicians: Technician[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const assignedIds = new Set(assignedTechnicians.map((technician) => technician.id));

  function toggle(technicianId: string, isAssigned: boolean) {
    setError(null);
    setPendingId(technicianId);
    startTransition(async () => {
      const result = isAssigned
        ? await unassignTechnicianFromRequest(maintenanceRequestId, technicianId)
        : await assignTechnicianToRequest(maintenanceRequestId, technicianId);
      if (!result.ok) {
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {assignedTechnicians.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin técnico asignado.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignedTechnicians.map((technician) => (
            <Badge
              key={technician.id}
              variant="secondary"
              className="gap-1.5 py-1 pl-2.5 pr-1.5 text-sm"
            >
              {technician.fullName}
              <button
                type="button"
                aria-label={`Quitar a ${technician.fullName}`}
                onClick={() => toggle(technician.id, true)}
                disabled={isPending && pendingId === technician.id}
                className="rounded-full p-0.5 hover:bg-secondary-foreground/10 disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-fit gap-1.5">
            <Plus className="size-3.5" />
            Asignar técnico
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Asignar técnicos</SheetTitle>
          <div className="flex flex-col gap-1 overflow-y-auto p-4">
            <h3 className="mb-1 text-sm font-semibold text-sidebar-foreground">
              Asignar técnicos
            </h3>
            <p className="mb-2 text-xs text-sidebar-foreground/60">
              Selecciona uno o varios técnicos activos. Los cambios se guardan de inmediato.
            </p>
            {allTechnicians.length === 0 ? (
              <p className="text-sm text-sidebar-foreground/70">
                No hay técnicos registrados en el sistema.
              </p>
            ) : (
              allTechnicians.map((technician) => {
                const isAssigned = assignedIds.has(technician.id);
                return (
                  <label
                    key={technician.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent"
                  >
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      disabled={isPending && pendingId === technician.id}
                      onChange={() => toggle(technician.id, isAssigned)}
                      className="size-4 rounded border-sidebar-border"
                    />
                    <span className="flex flex-col">
                      <span className="text-sidebar-foreground">{technician.fullName}</span>
                      <span className="text-xs text-sidebar-foreground/60">
                        {technician.employeeCode}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
