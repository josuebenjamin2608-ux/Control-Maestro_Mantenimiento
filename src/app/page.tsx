import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { RecentActivityPanel } from "@/components/layout/recent-activity-panel";
import { RouteTabs } from "@/components/layout/route-tabs";
import { EstadoBreakdownCard } from "@/components/dashboard/estado-breakdown-card";
import { MinutasSummaryCard } from "@/components/dashboard/minutas-summary-card";
import { RangeSelect, type RangeOption } from "@/components/dashboard/range-select";
import { SolicitudesTable } from "@/components/solicitudes/solicitudes-table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getDashboardStats,
  listMaintenanceRequests,
} from "@/server/services/maintenance-requests.service";

// Esta página consulta la base de datos; no se puede pre-renderizar
// estáticamente en build (no hay DB disponible en ese paso), debe
// resolverse en cada request.
export const dynamic = "force-dynamic";

const TABS = [
  { label: "Solicitudes", href: "/solicitudes", available: true },
  { label: "Minutas", href: "/minutas", available: true },
  { label: "Órdenes de trabajo", href: "/ordenes", available: false },
  { label: "Mantenimiento preventivo", href: "/preventivo", available: false },
];

const RANGE_OPTIONS: (RangeOption & { sinceDays?: number })[] = [
  { label: "Todos los tiempos", value: "all" },
  { label: "Últimos 7 días", value: "7", sinceDays: 7 },
  { label: "Últimos 30 días", value: "30", sinceDays: 30 },
  { label: "Últimos 90 días", value: "90", sinceDays: 90 },
];

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "destructive" | "warning" | "primary" | "success";
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-5">
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
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const selectedRange = RANGE_OPTIONS.find((option) => option.value === range) ?? RANGE_OPTIONS[0];

  const [stats, { items: recentRequests }] = await Promise.all([
    getDashboardStats(selectedRange.sinceDays),
    listMaintenanceRequests({ take: 5 }),
  ]);

  const atendidasRatio = stats.total > 0 ? Math.round((stats.atendidas / stats.total) * 100) : 0;

  return (
    <AppShell title="Panel de control">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-foreground">
              Control Maestro Mantenimiento
            </h2>
            <p className="text-sm text-muted-foreground">
              Vista general de Solicitudes y Minutas importadas.
            </p>
          </div>

          <RangeSelect options={RANGE_OPTIONS} value={selectedRange.value} />
        </div>

        <RouteTabs tabs={TABS} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-1">
            <Card className="h-full">
              <CardContent className="flex h-full flex-col justify-center gap-2 py-5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total de solicitudes
                </span>
                <span className="text-3xl font-semibold text-foreground">{stats.total}</span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-success" style={{ width: `${atendidasRatio}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{atendidasRatio}% atendidas</span>
              </CardContent>
            </Card>
          </div>
          <KpiCard label="Pendientes" value={stats.pendientes} tone="destructive" />
          <KpiCard label="En espera" value={stats.espera} tone="warning" />
          <KpiCard label="Programadas / en ejecución" value={stats.programadas} tone="primary" />
          <KpiCard label="Atendidas" value={stats.atendidas} tone="success" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="flex flex-col gap-3 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Últimas solicitudes</h3>
              <Link
                href="/solicitudes"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Ver todas
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <Card>
              <CardContent className="px-0">
                <SolicitudesTable items={recentRequests} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <EstadoBreakdownCard stats={stats} />
            <MinutasSummaryCard />
            <RecentActivityPanel />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
