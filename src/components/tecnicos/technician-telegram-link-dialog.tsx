"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateTechnicianTelegramLinkCode,
  getTechnicianTelegramLinkStatus,
} from "@/server/actions/technician-telegram";
import type { Technician } from "@/generated/prisma/client";

const POLL_INTERVAL_MS = 4000;

function isLinkCodeExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

/**
 * Modal "Vincular Telegram" de /tecnicos. Al abrirse genera automáticamente
 * un código nuevo (invalida cualquier pendiente anterior del mismo
 * técnico) y hace polling del estado de vinculación mientras está abierto,
 * para detectar cuándo el webhook de Telegram (/api/telegram/webhook)
 * confirma la vinculación sin que el usuario tenga que refrescar nada.
 */
export function TechnicianTelegramLinkDialog({
  technician,
  open,
  onOpenChange,
  onLinked,
}: {
  technician: Technician | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular Telegram</DialogTitle>
          <DialogDescription>
            {technician ? `Técnico: ${technician.fullName}` : null}
          </DialogDescription>
        </DialogHeader>
        {open && technician ? (
          <TechnicianTelegramLinkBody
            key={technician.id}
            technician={technician}
            onLinked={onLinked}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TechnicianTelegramLinkBody({
  technician,
  onLinked,
}: {
  technician: Technician;
  onLinked: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const [isGenerating, startGenerating] = useTransition();
  const alreadyLinkedRef = useRef(false);

  function generate() {
    startGenerating(async () => {
      setError(null);
      const result = await generateTechnicianTelegramLinkCode(technician.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode(result.data.code);
      setExpiresAt(new Date(result.data.expiresAt));
    });
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se dispara una sola vez al montar (ver `key` en el diálogo padre).
  }, []);

  useEffect(() => {
    if (!code || alreadyLinkedRef.current) return;

    const interval = setInterval(async () => {
      const status = await getTechnicianTelegramLinkStatus(technician.id);
      if (status.ok && status.data.linked) {
        alreadyLinkedRef.current = true;
        clearInterval(interval);
        setJustLinked(true);
        setTimeout(onLinked, 1200);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [code, technician.id, onLinked]);

  if (justLinked) {
    return (
      <div className="flex flex-col gap-2 px-5 py-6 text-center">
        <p className="text-sm font-medium text-success">✅ Telegram vinculado correctamente.</p>
        <p className="text-sm text-muted-foreground">
          {technician.fullName} ya puede recibir notificaciones individuales.
        </p>
      </div>
    );
  }

  const isExpired = expiresAt !== null && isLinkCodeExpired(expiresAt);

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {code ? (
        <>
          <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-secondary/40 py-4">
            <span className="text-xs text-muted-foreground">Código</span>
            <span className="font-mono text-2xl font-semibold tracking-wider text-foreground">{code}</span>
          </div>

          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Instrucciones:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abra Telegram.</li>
              <li>
                Busque <span className="font-medium text-foreground">@SIMI_Mantenimiento_bot</span>.
              </li>
              <li>Envíe este código al bot.</li>
              <li>SIMI vinculará automáticamente esta cuenta.</li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Estado:</span>
            {isExpired ? (
              <Badge variant="warning">Código expirado</Badge>
            ) : (
              <Badge variant="outline">Esperando vinculación...</Badge>
            )}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={generate} disabled={isGenerating}>
            {isGenerating ? "Generando..." : "Regenerar código"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isGenerating ? "Generando código..." : "No se pudo generar el código."}
        </p>
      )}
    </div>
  );
}
