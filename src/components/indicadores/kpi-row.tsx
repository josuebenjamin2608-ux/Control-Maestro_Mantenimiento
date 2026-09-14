import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/server/services/maintenance-requests.service";

type Tone = "default" | "destructive" | "warning" | "primary" | "success";

function Tile({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 px-4 py-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "text-2xl font-semibold",
            tone === "destructive" && "text-destructive",
            tone === "warning" && "text-warning",
            tone === "primary" && "text-primary",
            tone === "success" && "text-success",
            tone === "default" && "text-foreground",
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

/** Fila de KPI principal del período: Solicitudes / Pendientes / Espera / Atendidas / % / Cerradas. */
export function KpiRow({ stats, closedTasks }: { stats: DashboardStats; closedTasks: number }) {
  const percentage = stats.total > 0 ? Math.round((stats.atendidas / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Solicitudes" value={String(stats.total)} tone="default" />
      <Tile label="Pendientes" value={String(stats.pendientes)} tone="destructive" />
      <Tile label="En espera" value={String(stats.espera)} tone="warning" />
      <Tile label="Atendidas" value={String(stats.atendidas)} tone="success" />
      <Tile label="% Atendidas" value={`${percentage}%`} tone="primary" />
      <Tile label="Cerradas" value={String(closedTasks)} tone="default" />
    </div>
  );
}
