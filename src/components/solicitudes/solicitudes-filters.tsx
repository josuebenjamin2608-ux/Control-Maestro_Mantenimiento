"use client";

import { useRef } from "react";
import { Search } from "lucide-react";

export function SolicitudesFilters({
  q,
  maquina,
  estado,
  machines,
  estados,
}: {
  q?: string;
  maquina?: string;
  estado?: string;
  machines: string[];
  estados: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} method="get" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por PARTE, máquina o problema..."
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <select
        name="maquina"
        defaultValue={maquina ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Todas las máquinas</option>
        {machines.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        name="estado"
        defaultValue={estado ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Todos los estados</option>
        {estados.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-secondary"
      >
        Buscar
      </button>
    </form>
  );
}
