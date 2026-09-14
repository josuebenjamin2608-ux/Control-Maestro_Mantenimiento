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
import type {
  getMaintenanceRequestByParte,
  listTechnicians,
} from "@/server/services/maintenance-requests.service";

type AssignmentRow = NonNullable<
  Awaited<ReturnType<typeof getMaintenanceRequestByParte>>
>["assignedTechnicians"][number];
type TechnicianOption = Awaited<ReturnType<typeof listTechnicians>>[number];

const dateTimeFormatter = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" });

interface HistoryEvent {
  id: string;
  at: Date;
  technicianName: string;
  action: "Asignado" | "Retirado";
}

/**
 * Sección "Técnico asignado" real: chips de técnicos con asignación activa
 * (removidos con "×"), panel para agregar/quitar técnicos activos reales, y
 * un historial de asignación/retiro. Cada asignación es una fila propia en
 * MaintenanceRequestTechnician — "quitar" nunca borra la fila, solo marca
 * `removedAt`, así el historial de quién estuvo asignado a esta solicitud
 * (y cuándo) se conserva completo. No es una auditoría de los datos propios
 * del técnico (nombre/cargo/estado): esos se editan sin dejar rastro acá.
 */
export function TechnicianAssignment({
  maintenanceRequestId,
  assignments,
  allTechnicians,
}: {
  maintenanceRequestId: string;
  assignments: AssignmentRow[];
  allTechnicians: TechnicianOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeAssignments = assignments.filter((row) => !row.removedAt);
  const activeTechnicianIds = new Set(activeAssignments.map((row) => row.technicianId));

  const historyEvents: HistoryEvent[] = assignments
    .flatMap((row): HistoryEvent[] => {
      const events: HistoryEvent[] = [
        { id: `${row.id}-asignado`, at: row.assignedAt, technicianName: row.technician.fullName, action: "Asignado" },
      ];
      if (row.removedAt) {
        events.push({
          id: `${row.id}-retirado`,
          at: row.removedAt,
          technicianName: row.technician.fullName,
          action: "Retirado",
        });
      }
      return events;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {activeAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin técnico asignado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeAssignments.map((row) => (
              <Badge
                key={row.id}
                variant="secondary"
                className="gap-1.5 py-1 pl-2.5 pr-1.5 text-sm"
              >
                {row.technician.fullName}
                <button
                  type="button"
                  aria-label={`Quitar a ${row.technician.fullName}`}
                  onClick={() => toggle(row.technicianId, true)}
                  disabled={isPending && pendingId === row.technicianId}
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
                  const isAssigned = activeTechnicianIds.has(technician.id);
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

      {historyEvents.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Historial de asignaciones
          </h4>
          <ul className="flex flex-col gap-1">
            {historyEvents.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="text-muted-foreground">{dateTimeFormatter.format(event.at)}</span>
                {" → "}
                <span className="text-foreground">{event.technicianName}</span>
                {" → "}
                <span className={event.action === "Asignado" ? "text-success" : "text-muted-foreground"}>
                  {event.action}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
