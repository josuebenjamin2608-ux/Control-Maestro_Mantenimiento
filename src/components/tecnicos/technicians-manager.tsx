"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TechnicianFormSheet } from "@/components/tecnicos/technician-form-sheet";
import { TechnicianTelegramLinkDialog } from "@/components/tecnicos/technician-telegram-link-dialog";
import { setTechnicianActive } from "@/server/actions/technicians";
import { unlinkTechnicianTelegram } from "@/server/actions/technician-telegram";
import type { Technician } from "@/generated/prisma/client";

type FormState = { mode: "create" } | { mode: "edit"; technician: Technician } | null;

/**
 * Catálogo de técnicos: listado + alta/edición (vía TechnicianFormSheet) +
 * activar/desactivar. Nunca borra técnicos — desactivar solo cambia
 * isActive, conservando datos e historial de asignaciones.
 */
export function TechniciansManager({ technicians }: { technicians: Technician[] }) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState>(null);
  const [telegramTechnician, setTelegramTechnician] = useState<Technician | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleActive(technician: Technician) {
    const verb = technician.isActive ? "Desactivar" : "Activar";
    if (!window.confirm(`${verb} a ${technician.fullName}?`)) {
      return;
    }
    setError(null);
    setPendingId(technician.id);
    startTransition(async () => {
      const result = await setTechnicianActive(technician.id, !technician.isActive);
      if (!result.ok) {
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  function unlinkTelegram(technician: Technician) {
    if (!window.confirm(`¿Desvincular Telegram de ${technician.fullName}?`)) {
      return;
    }
    setError(null);
    setPendingId(technician.id);
    startTransition(async () => {
      const result = await unlinkTechnicianTelegram(technician.id);
      if (!result.ok) {
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  function handleTelegramLinked() {
    setTelegramTechnician(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {technicians.length} técnico{technicians.length === 1 ? "" : "s"} registrado
          {technicians.length === 1 ? "" : "s"}.
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setFormState({ mode: "create" })}>
          <Plus className="size-3.5" />
          Nuevo técnico
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {technicians.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">
          Todavía no hay técnicos registrados.
        </p>
      ) : (
        <>
          {/* Móvil: tarjetas, sin forzar la tabla completa con scroll horizontal. */}
          <div className="flex flex-col divide-y divide-border sm:hidden">
            {technicians.map((technician) => (
              <div key={technician.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{technician.fullName}</span>
                  <Badge variant={technician.isActive ? "success" : "outline"}>
                    {technician.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">{technician.specialty ?? "—"}</span>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant={technician.telegramChatId ? "success" : "outline"}>
                    {technician.telegramChatId ? "Telegram vinculado" : "Telegram no vinculado"}
                  </Badge>
                  {technician.telegramChatId ? (
                    <button
                      type="button"
                      onClick={() => unlinkTelegram(technician)}
                      disabled={isPending && pendingId === technician.id}
                      className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Desvincular
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTelegramTechnician(technician)}
                      className="text-sm text-primary hover:underline"
                    >
                      Vincular Telegram
                    </button>
                  )}
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setFormState({ mode: "edit", technician })}
                    className="text-sm text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(technician)}
                    disabled={isPending && pendingId === technician.id}
                    className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {technician.isActive ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Escritorio/tablet: tabla completa. */}
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cargo / Especialidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicians.map((technician) => (
                  <TableRow key={technician.id}>
                    <TableCell className="font-medium text-foreground">
                      {technician.fullName}
                    </TableCell>
                    <TableCell>{technician.specialty ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={technician.isActive ? "success" : "outline"}>
                        {technician.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={technician.telegramChatId ? "success" : "outline"}>
                          {technician.telegramChatId ? "Vinculado" : "No vinculado"}
                        </Badge>
                        {technician.telegramChatId ? (
                          <button
                            type="button"
                            onClick={() => unlinkTelegram(technician)}
                            disabled={isPending && pendingId === technician.id}
                            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Desvincular
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setTelegramTechnician(technician)}
                            className="text-sm text-primary hover:underline"
                          >
                            Vincular Telegram
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setFormState({ mode: "edit", technician })}
                          className="text-sm text-primary hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(technician)}
                          disabled={isPending && pendingId === technician.id}
                          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {technician.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <TechnicianFormSheet
        open={formState !== null}
        onOpenChange={(open) => {
          if (!open) setFormState(null);
        }}
        technician={formState?.mode === "edit" ? formState.technician : null}
      />

      <TechnicianTelegramLinkDialog
        technician={telegramTechnician}
        open={telegramTechnician !== null}
        onOpenChange={(open) => {
          if (!open) setTelegramTechnician(null);
        }}
        onLinked={handleTelegramLinked}
      />
    </div>
  );
}
