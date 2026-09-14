import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { RecentActivityPanel } from "@/components/layout/recent-activity-panel";
import { RouteTabs } from "@/components/layout/route-tabs";
import { EstadoBreakdownCard } from "@/components/dashboard/estado-breakdown-card";
import { MinutasSummaryCard } from "@/components/dashboard/minutas-summary-card";
import { RangeSelect, type RangeOption } from "@/components/dashboard/range-select";
import { SolicitudesTable } from "@/components/solicitudes/solicitudes-table";
import { Card, CardContent } from "@/components/ui/card";
import { ESTADO_BUCKET_LABELS, type EstadoBucket } from "@/lib/estado";
import { cn } from "@/lib/utils";
import {
  getDashboardStats,
  listOperationalMaintenanceRequests,
  type DashboardStats,
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

const VALID_BUCKETS: EstadoBucket[] = ["pendiente", "espera", "programada", "atendida", "otro"];

/** Además de los 5 buckets reales, "todas" es un valor explícito de URL para el KPI Total. */
type BucketParam = EstadoBucket | "todas" | undefined;

function parseBucketParam(value: string | undefined): BucketParam {
  if (!value) return undefined;
  if (value === "todas") return "todas";
  return (VALID_BUCKETS as string[]).includes(value) ? (value as EstadoBucket) : undefined;
}

function buildDashboardHref(rangeValue: string, bucketValue?: string) {
  const params = new URLSearchParams();
  if (rangeValue !== "all") params.set("range", rangeValue);
  if (bucketValue) params.set("bucket", bucketValue);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

const BUCKET_STATS_KEY: Record<EstadoBucket, keyof Omit<DashboardStats, "total">> = {
  pendiente: "pendientes",
  espera: "espera",
  programada: "programadas",
  atendida: "atendidas",
  otro: "otros",
};

const BUCKET_TONE: Record<EstadoBucket, "destructive" | "warning" | "primary" | "success" | "muted"> = {
  pendiente: "destructive",
  espera: "warning",
  programada: "primary",
  atendida: "success",
  otro: "muted",
};

function KpiLink({
  label,
  value,
  tone,
  href,
  active,
}: {
  label: string;
  value: number;
  tone: "destructive" | "warning" | "primary" | "success" | "muted";
  href: string;
  active: boolean;
}) {
  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card
        className={cn(
          "h-full cursor-pointer transition-colors hover:border-primary/50",
          active && "border-primary ring-1 ring-primary/40",
        )}
      >
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
              tone === "muted" && "text-muted-foreground",
            )}
          >
            {value}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; bucket?: string }>;
}) {
  const { range, bucket } = await searchParams;
  const selectedRange = RANGE_OPTIONS.find((option) => option.value === range) ?? RANGE_OPTIONS[0];
  const bucketParam = parseBucketParam(bucket);
  const selectedBucket: EstadoBucket | undefined =
    bucketParam && bucketParam !== "todas" ? bucketParam : undefined;

  const [stats, operationalRequests] = await Promise.all([
    getDashboardStats(selectedRange.sinceDays),
    listOperationalMaintenanceRequests({
      bucket: selectedBucket,
      sinceDays: selectedRange.sinceDays,
      take: selectedBucket ? 15 : 8,
    }),
  ]);

  const atendidasRatio = stats.total > 0 ? Math.round((stats.atendidas / stats.total) * 100) : 0;
  const showOtrosKpi = stats.otros > 0;

  const sectionTitle =
    bucketParam === "todas"
      ? "Todas las solicitudes"
      : selectedBucket === "otro"
        ? "Otros estados"
        : selectedBucket
          ? `Solicitudes ${ESTADO_BUCKET_LABELS[selectedBucket].toLowerCase()}`
          : "Solicitudes que requieren atención";

  const activeCount =
    bucketParam === "todas" ? stats.total : selectedBucket ? stats[BUCKET_STATS_KEY[selectedBucket]] : undefined;

  const sectionSubtitle =
    activeCount !== undefined
      ? `${activeCount} solicitud${activeCount === 1 ? "" : "es"} en esta categoría.`
      : "Solicitudes pendientes, en espera y más recientes.";

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

        <div
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2",
            showOtrosKpi ? "lg:grid-cols-6" : "lg:grid-cols-5",
          )}
        >
          <Link
            href={buildDashboardHref(selectedRange.value, "todas")}
            className="block rounded-lg sm:col-span-2 lg:col-span-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card
              className={cn(
                "h-full cursor-pointer transition-colors hover:border-primary/50",
                bucketParam === "todas" && "border-primary ring-1 ring-primary/40",
              )}
            >
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
          </Link>

          <KpiLink
            label={ESTADO_BUCKET_LABELS.pendiente}
            value={stats.pendientes}
            tone={BUCKET_TONE.pendiente}
            href={buildDashboardHref(selectedRange.value, "pendiente")}
            active={selectedBucket === "pendiente"}
          />
          <KpiLink
            label={ESTADO_BUCKET_LABELS.espera}
            value={stats.espera}
            tone={BUCKET_TONE.espera}
            href={buildDashboardHref(selectedRange.value, "espera")}
            active={selectedBucket === "espera"}
          />
          <KpiLink
            label={ESTADO_BUCKET_LABELS.programada}
            value={stats.programadas}
            tone={BUCKET_TONE.programada}
            href={buildDashboardHref(selectedRange.value, "programada")}
            active={selectedBucket === "programada"}
          />
          <KpiLink
            label={ESTADO_BUCKET_LABELS.atendida}
            value={stats.atendidas}
            tone={BUCKET_TONE.atendida}
            href={buildDashboardHref(selectedRange.value, "atendida")}
            active={selectedBucket === "atendida"}
          />
          {showOtrosKpi ? (
            <KpiLink
              label={ESTADO_BUCKET_LABELS.otro}
              value={stats.otros}
              tone={BUCKET_TONE.otro}
              href={buildDashboardHref(selectedRange.value, "otro")}
              active={selectedBucket === "otro"}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="flex flex-col gap-3 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-foreground">{sectionTitle}</h3>
                <p className="text-xs text-muted-foreground">{sectionSubtitle}</p>
              </div>
              <div className="flex items-center gap-3">
                {selectedBucket ? (
                  <Link
                    href={buildDashboardHref(selectedRange.value)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                    Quitar filtro
                  </Link>
                ) : null}
                <Link
                  href="/solicitudes"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Ver todas
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
            <Card>
              <CardContent className="px-0">
                <SolicitudesTable items={operationalRequests} />
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
