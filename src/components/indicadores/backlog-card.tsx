import { AlertTriangle } from "lucide-react";

import type { BacklogAgeBuckets } from "@/server/services/indicators.service";

export type BacklogStatKind =
  | "total"
  | "days0to5"
  | "days6to15"
  | "days16to30"
  | "daysOver30"
  | "sinFecha";

/**
 * `onSelect` es opcional a propósito: este componente antes también lo
 * reutilizaba el Dashboard (/) sin interactividad, pero ese uso ya no existe
 * (el Dashboard usa EstadoBreakdownCard/ResponsibleAreaCard) — se conserva
 * la opcionalidad por si /indicadores necesita renderizarlo sin abrir el
 * modal en algún contexto futuro. Sin `onSelect`, cada bloque se renderiza
 * como un `<div>` estático; /indicadores siempre lo pasa (vía
 * InteractiveBacklogCard), y ahí cada bloque se vuelve un `<button>`.
 *
 * `backlog.total` es el MISMO número que "Total abierto" (mismo universo:
 * ESTADO != Realizado, sin filtro de FECHA) — nunca relativo al período
 * seleccionado.
 */
export function BacklogCard({
  backlog,
  onSelect,
}: {
  backlog: BacklogAgeBuckets;
  onSelect?: (kind: BacklogStatKind) => void;
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
        <span className="text-xs text-muted-foreground">
          Solicitudes abiertas (ESTADO != Realizado), sin importar la fecha — igual a &quot;Total
          abierto&quot;
        </span>
      </div>
    </>
  );

  const stats: { kind: BacklogStatKind; value: number; label: string }[] = [
    { kind: "days0to5", value: backlog.days0to5, label: "0-5 días" },
    { kind: "days6to15", value: backlog.days6to15, label: "6-15 días" },
    { kind: "days16to30", value: backlog.days16to30, label: "16-30 días" },
    { kind: "daysOver30", value: backlog.daysOver30, label: "+30 días" },
    { kind: "sinFecha", value: backlog.sinFecha, label: "Sin fecha" },
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

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
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
        Cada solicitud abierta cae en exactamente una de las 5 categorías (los 4 rangos se calculan
        contra la fecha actual del sistema, no contra el período seleccionado; &quot;Sin fecha&quot;
        agrupa las que no tienen FECHA registrada, sin asumir una antigüedad) — por eso siempre
        suman el total de arriba.
      </p>
    </div>
  );
}
