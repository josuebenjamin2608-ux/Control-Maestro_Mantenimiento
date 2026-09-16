import { AlertTriangle } from "lucide-react";

import type { BacklogBreakdown } from "@/server/services/indicators.service";

export type BacklogStatKind = "total" | "over7" | "over15" | "over30";

/**
 * `onSelect` es opcional a propósito: este componente lo reutiliza también
 * el Dashboard (/) sin interactividad. Cuando se omite, cada bloque se
 * renderiza como el mismo `<div>` estático de siempre — cero cambios de
 * markup/estilo en el Dashboard. Solo /indicadores lo pasa (vía
 * InteractiveBacklogCard), y ahí cada bloque se vuelve un `<button>`.
 *
 * `totalCaption` es opcional por la misma razón: /indicadores no lo pasa
 * (conserva el texto de siempre, "... anterior al período seleccionado"),
 * mientras que el Dashboard sí lo pasa porque ahí `backlog.total` ya no es
 * relativo a un período sino el total real de solicitudes abiertas.
 */
export function BacklogCard({
  backlog,
  onSelect,
  totalCaption = "Solicitudes sin Realizado, con fecha anterior al período seleccionado",
}: {
  backlog: BacklogBreakdown;
  onSelect?: (kind: BacklogStatKind) => void;
  totalCaption?: string;
}) {
  const totalClassName =
    "flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3" +
    (onSelect
      ? " w-full text-left cursor-pointer transition-colors hover:border-destructive/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "");

  const totalContent = (
    <>
      <AlertTriangle className="size-5 shrink-0 text-destructive" />
      <div className="flex flex-col">
        <span className="text-2xl font-semibold text-foreground">{backlog.total}</span>
        <span className="text-xs text-muted-foreground">{totalCaption}</span>
      </div>
    </>
  );

  const stats: { kind: BacklogStatKind; value: number; label: string }[] = [
    { kind: "over7", value: backlog.over7Days, label: "+7 días" },
    { kind: "over15", value: backlog.over15Days, label: "+15 días" },
    { kind: "over30", value: backlog.over30Days, label: "+30 días" },
  ];

  const statClassName =
    "rounded-md border border-border px-2 py-2" +
    (onSelect
      ? " w-full cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "");
  const statContent = (value: number, label: string) => (
    <>
      <span className="block text-lg font-semibold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {onSelect ? (
        <button type="button" onClick={() => onSelect("total")} className={totalClassName}>
          {totalContent}
        </button>
      ) : (
        <div className={totalClassName}>{totalContent}</div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {stats.map((stat) =>
          onSelect ? (
            <button
              key={stat.kind}
              type="button"
              onClick={() => onSelect(stat.kind)}
              className={statClassName}
            >
              {statContent(stat.value, stat.label)}
            </button>
          ) : (
            <div key={stat.kind} className={statClassName}>
              {statContent(stat.value, stat.label)}
            </div>
          ),
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Los umbrales de +7 / +15 / +30 días se calculan contra la fecha actual del sistema, no
        contra el período seleccionado.
      </p>
    </div>
  );
}
