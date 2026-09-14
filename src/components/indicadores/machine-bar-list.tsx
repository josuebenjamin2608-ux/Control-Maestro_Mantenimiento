import type { MachineDistributionItem } from "@/server/services/maintenance-requests.service";

/** Barras horizontales, un solo tono (magnitud), etiquetas directas por ser pocas filas. */
export function MachineBarList({ items }: { items: MachineDistributionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de máquina disponibles.</p>;
  }

  const max = Math.max(...items.map((item) => item.count));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.maquina} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-foreground" title={item.maquina}>
              {item.maquina}
            </span>
            <span className="shrink-0 font-medium text-foreground">{item.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${max > 0 ? (item.count / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
