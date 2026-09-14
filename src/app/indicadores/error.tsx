"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function IndicadoresError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">No se pudieron calcular los indicadores.</p>
        <p className="text-xs text-muted-foreground">
          Ocurrió un error al consultar los datos. Podés intentar de nuevo.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => reset()}>
        Reintentar
      </Button>
    </div>
  );
}
