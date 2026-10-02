import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const BUTTON_CLASS =
  "flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors";

function navHref(parte: string, backHref: string) {
  return `/solicitudes/${encodeURIComponent(parte)}?back=${encodeURIComponent(backHref)}`;
}

function NavButton({
  parte,
  backHref,
  children,
}: {
  parte: string | null;
  backHref: string;
  children: ReactNode;
}) {
  if (!parte) {
    return (
      <span aria-disabled="true" className={cn(BUTTON_CLASS, "cursor-not-allowed text-muted-foreground/40")}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={navHref(parte, backHref)}
      className={cn(
        BUTTON_CLASS,
        "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Navegación directa entre fichas de Solicitud (anterior/siguiente), sin
 * pasar por el Panel de control ni por /solicitudes. `previousParte`/
 * `nextParte` ya vienen resueltas (ver getAdjacentMaintenanceRequestPartes)
 * según el mismo orden/filtro del contexto de origen; null deshabilita el
 * botón correspondiente. `backHref` se propaga igual en ambos enlaces para
 * que, al llegar a la solicitud vecina, "Volver" siga apuntando al mismo
 * origen (lista o panel) con sus filtros intactos.
 */
export function SolicitudNavigation({
  previousParte,
  nextParte,
  backHref,
}: {
  previousParte: string | null;
  nextParte: string | null;
  backHref: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <NavButton parte={previousParte} backHref={backHref}>
        <ChevronLeft className="size-4" />
        Solicitud anterior
      </NavButton>
      <NavButton parte={nextParte} backHref={backHref}>
        Solicitud siguiente
        <ChevronRight className="size-4" />
      </NavButton>
    </div>
  );
}
