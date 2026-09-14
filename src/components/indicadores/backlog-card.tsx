import { AlertTriangle } from "lucide-react";

import type { BacklogBreakdown } from "@/server/services/indicators.service";

export function BacklogCard({ backlog }: { backlog: BacklogBreakdown }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3">
        <AlertTriangle className="size-5 shrink-0 text-destructive" />
        <div className="flex flex-col">
          <span className="text-2xl font-semibold text-foreground">{backlog.total}</span>
          <span className="text-xs text-muted-foreground">
            Solicitudes sin Realizado, con fecha anterior al período seleccionado
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-border px-2 py-2">
          <span className="block text-lg font-semibold text-foreground">{backlog.over7Days}</span>
          <span className="text-xs text-muted-foreground">+7 días</span>
        </div>
        <div className="rounded-md border border-border px-2 py-2">
          <span className="block text-lg font-semibold text-foreground">{backlog.over15Days}</span>
          <span className="text-xs text-muted-foreground">+15 días</span>
        </div>
        <div className="rounded-md border border-border px-2 py-2">
          <span className="block text-lg font-semibold text-foreground">{backlog.over30Days}</span>
          <span className="text-xs text-muted-foreground">+30 días</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Los umbrales de +7 / +15 / +30 días se calculan contra la fecha actual del sistema, no
        contra el período seleccionado.
      </p>
    </div>
  );
}
