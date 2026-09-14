"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { createTechnician, updateTechnician } from "@/server/actions/technicians";
import type { Technician } from "@/generated/prisma/client";

/**
 * Formulario único para crear y editar técnicos (nombre, cargo/especialidad,
 * activo). `employeeCode` nunca se pide acá — se genera internamente en la
 * Server Action. Sin auditoría de ediciones: guardar simplemente actualiza
 * la fila del técnico.
 */
export function TechnicianFormSheet({
  open,
  onOpenChange,
  technician,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technician: Technician | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>{technician ? "Editar técnico" : "Nuevo técnico"}</SheetTitle>
        {/* key fuerza un montaje nuevo por técnico/creación, así el estado
            inicial del formulario se deriva sin useEffect + setState. */}
        {open ? (
          <TechnicianForm
            key={technician?.id ?? "create"}
            technician={technician}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function TechnicianForm({
  technician,
  onOpenChange,
}: {
  technician: Technician | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = Boolean(technician);
  const [fullName, setFullName] = useState(technician?.fullName ?? "");
  const [specialty, setSpecialty] = useState(technician?.specialty ?? "");
  const [isActive, setIsActive] = useState(technician?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result =
        isEdit && technician
          ? await updateTechnician(technician.id, { fullName, specialty, isActive })
          : await createTechnician({ fullName, specialty, isActive });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(isEdit ? "Técnico actualizado." : "Técnico creado.");
      setTimeout(() => onOpenChange(false), 600);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h3 className="text-sm font-semibold text-sidebar-foreground">
        {isEdit ? "Editar técnico" : "Nuevo técnico"}
      </h3>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-sidebar-foreground/80">Nombre</span>
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
          disabled={isPending}
          placeholder="Nombre completo"
          className="h-9 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-sidebar-foreground/80">Cargo / Especialidad</span>
        <input
          type="text"
          value={specialty}
          onChange={(event) => setSpecialty(event.target.value)}
          required
          disabled={isPending}
          placeholder="Ej. Electromecánico"
          className="h-9 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-sidebar-foreground">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          disabled={isPending}
          className="size-4 rounded border-sidebar-border"
        />
        Activo
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-success">{success}</p> : null}

      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear técnico"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
