import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { RecentActivityPanel } from "@/components/layout/recent-activity-panel";
import { RouteTabs } from "@/components/layout/route-tabs";
import { BacklogCard } from "@/components/indicadores/backlog-card";
import { PeriodFilterBar } from "@/components/indicadores/period-filter-bar";
import { EstadoBreakdownCard } from "@/components/dashboard/estado-breakdown-card";
import { ResponsibleAreaCard } from "@/components/dashboard/responsible-area-card";
import { SolicitudesTable } from "@/components/solicitudes/solicitudes-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ESTADO_BUCKET_LABELS, type EstadoBucket } from "@/lib/estado";
import { formatPeriodLabel, getPeriodRange, type Period } from "@/lib/period";
import { cn } from "@/lib/utils";
import {
  getBucketStatValue,
  getOpenRequestsByResponsibleArea,
  listBacklogMaintenanceRequests,
  listOperationalMaintenanceRequests,
} from "@/server/services/maintenance-requests.service";
import {
  getAvailableYears,
  getBacklogBreakdown,
  getPeriodStats,
} from "@/server/services/indicators.service";

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

/** Cuántas solicitudes de backlog histórico se listan en la tabla (el conteo total sí es exacto, ver BacklogCard). */
const BACKLOG_LIST_TAKE = 10;

const VALID_BUCKETS: EstadoBucket[] = ["pendiente", "espera", "programada", "atendida", "otro"];

/** Además de los 5 buckets reales, "todas" es un valor explícito de URL para el KPI Total. */
type BucketParam = EstadoBucket | "todas" | undefined;

function parseBucketParam(value: string | undefined): BucketParam {
  if (!value) return undefined;
  if (value === "todas") return "todas";
  return (VALID_BUCKETS as string[]).includes(value) ? (value as EstadoBucket) : undefined;
}

/** El Dashboard siempre navega con year/month explícitos: nunca depende de un default implícito de la URL. */
function buildDashboardHref(year: number, month: number, bucketValue?: string) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (bucketValue) params.set("bucket", bucketValue);
  return `/?${params.toString()}`;
}

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
  periodLabel,
  tone,
  href,
  active,
}: {
  label: string;
  value: number;
  periodLabel: string;
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
          <span className="text-xs text-muted-foreground">{periodLabel}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; bucket?: string }>;
}) {
  const { year: yearParam, month: monthParam, bucket } = await searchParams;

  // Default explícito: mes y año ACTUALES — nunca "todos los tiempos". Misma
  // validación que /indicadores para que ambas páginas se comporten igual
  // ante un year/month inválido en la URL.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const parsedYear = yearParam ? Number(yearParam) : currentYear;
  const parsedMonth = monthParam ? Number(monthParam) : currentMonth;
  const selectedYear =
    Number.isInteger(parsedYear) && parsedYear > 1900 && parsedYear < 2200 ? parsedYear : currentYear;
  const selectedMonth =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : currentMonth;

  const period: Period = { year: selectedYear, month: selectedMonth };
  const periodLabel = formatPeriodLabel(period);
  // Mismo [start, end) UTC que /indicadores (ver src/lib/period.ts) — la
  // corrección de fechas UTC no se toca, solo se reutiliza.
  const { start, end } = getPeriodRange(selectedYear, selectedMonth);

  const bucketParam = parseBucketParam(bucket);
  const selectedBucket: EstadoBucket | undefined =
    bucketParam && bucketParam !== "todas" ? bucketParam : undefined;

  const [years, stats, operationalRequests, backlog, backlogItems, responsibleAreaSummary] =
    await Promise.all([
      getAvailableYears(),
      // Único cambio de fondo: los KPI principales vienen de getPeriodStats
      // (acotado a FECHA en [start, end)) en vez de todo el histórico —
      // misma función ya usada y validada en /indicadores.
      getPeriodStats(start, end),
      listOperationalMaintenanceRequests({
        bucket: selectedBucket,
        period: { start, end },
        // Vista por defecto ("Solicitudes del mes que requieren atención"):
        // ESTADO != Realizado, SIN límite artificial — deben verse todas las
        // del mes. Con un bucket específico seleccionado (KPI clickeado) se
        // mantiene un tope razonable.
        take: selectedBucket ? 15 : undefined,
        // Nunca muestra Realizado. El KPI Total (bucket=todas) sí las incluye.
        excludeAtendida: !bucketParam,
      }),
      getBacklogBreakdown(start),
      listBacklogMaintenanceRequests({ before: start, take: BACKLOG_LIST_TAKE }),
      getOpenRequestsByResponsibleArea(),
    ]);

  const currentDashboardHref = buildDashboardHref(
    selectedYear,
    selectedMonth,
    bucketParam === "todas" ? "todas" : selectedBucket,
  );

  // ATENDIDAS DEL MES / SOLICITUDES DEL MES — nunca el total histórico.
  const atendidasRatio = stats.total > 0 ? Math.round((stats.atendidas / stats.total) * 100) : 0;
  const showOtrosKpi = stats.otros > 0;

  const sectionTitle =
    bucketParam === "todas"
      ? `Todas las solicitudes de ${periodLabel}`
      : selectedBucket === "otro"
        ? "Otros estados del mes"
        : selectedBucket
          ? `Solicitudes ${ESTADO_BUCKET_LABELS[selectedBucket].toLowerCase()} del mes`
          : "Solicitudes del mes que requieren atención";

  const activeCount =
    bucketParam === "todas"
      ? stats.total
      : selectedBucket
        ? getBucketStatValue(stats, selectedBucket)
        : undefined;

  const sectionSubtitle =
    activeCount !== undefined
      ? `${activeCount} solicitud${activeCount === 1 ? "" : "es"} en esta categoría, con FECHA en ${periodLabel}.`
      : `Solicitudes con FECHA en ${periodLabel}: pendientes, en espera o programadas.`;

  const backlogHiddenCount = Math.max(0, backlog.total - backlogItems.length);

  return (
    <AppShell title="Panel de control">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-foreground">
              Control Maestro Mantenimiento
            </h2>
            <p className="text-sm text-muted-foreground">
              Indicadores de {periodLabel} — los KPI principales corresponden al período
              seleccionado, no al histórico completo.
            </p>
          </div>

          <PeriodFilterBar years={years} selectedYear={selectedYear} selectedMonth={selectedMonth} />
        </div>

        <RouteTabs tabs={TABS} />

        <div
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2",
            showOtrosKpi ? "lg:grid-cols-6" : "lg:grid-cols-5",
          )}
        >
          <Link
            href={buildDashboardHref(selectedYear, selectedMonth, "todas")}
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
                  Solicitudes del mes
                </span>
                <span className="text-3xl font-semibold text-foreground">{stats.total}</span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-success" style={{ width: `${atendidasRatio}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {atendidasRatio}% atendidas · {periodLabel}
                </span>
              </CardContent>
            </Card>
          </Link>

          <KpiLink
            label="Pendientes del mes"
            value={stats.pendientes}
            periodLabel={periodLabel}
            tone={BUCKET_TONE.pendiente}
            href={buildDashboardHref(selectedYear, selectedMonth, "pendiente")}
            active={selectedBucket === "pendiente"}
          />
          <KpiLink
            label="En espera del mes"
            value={stats.espera}
            periodLabel={periodLabel}
            tone={BUCKET_TONE.espera}
            href={buildDashboardHref(selectedYear, selectedMonth, "espera")}
            active={selectedBucket === "espera"}
          />
          <KpiLink
            label="Programadas / en ejecución"
            value={stats.programadas}
            periodLabel={periodLabel}
            tone={BUCKET_TONE.programada}
            href={buildDashboardHref(selectedYear, selectedMonth, "programada")}
            active={selectedBucket === "programada"}
          />
          <KpiLink
            label="Atendidas del mes"
            value={stats.atendidas}
            periodLabel={periodLabel}
            tone={BUCKET_TONE.atendida}
            href={buildDashboardHref(selectedYear, selectedMonth, "atendida")}
            active={selectedBucket === "atendida"}
          />
          {showOtrosKpi ? (
            <KpiLink
              label="Otros (mes)"
              value={stats.otros}
              periodLabel={periodLabel}
              tone={BUCKET_TONE.otro}
              href={buildDashboardHref(selectedYear, selectedMonth, "otro")}
              active={selectedBucket === "otro"}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="flex flex-col gap-6 lg:col-span-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{sectionTitle}</h3>
                  <p className="text-xs text-muted-foreground">{sectionSubtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                  {selectedBucket ? (
                    <Link
                      href={buildDashboardHref(selectedYear, selectedMonth)}
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
                <CardContent className="max-h-[32rem] overflow-y-auto px-0">
                  <SolicitudesTable
                    items={operationalRequests}
                    compact
                    backHref={currentDashboardHref}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">Backlog histórico pendiente</h3>
                <p className="text-xs text-muted-foreground">
                  {backlog.total} solicitud{backlog.total === 1 ? "" : "es"} con FECHA anterior a{" "}
                  {periodLabel} que continúan abiertas (no Realizado)
                  {backlogHiddenCount > 0
                    ? ` — mostrando las ${backlogItems.length} más antiguas`
                    : ""}
                  .
                </p>
              </div>
              <Card>
                <CardContent className="max-h-[24rem] overflow-y-auto px-0">
                  <SolicitudesTable items={backlogItems} compact backHref={currentDashboardHref} />
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <EstadoBreakdownCard stats={stats} />

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-foreground">Backlog acumulado</CardTitle>
                <CardDescription>
                  Trabajo pendiente que viene de períodos anteriores a {periodLabel} — no es un
                  indicador del mes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BacklogCard backlog={backlog} />
              </CardContent>
            </Card>

            <ResponsibleAreaCard summary={responsibleAreaSummary} />

            <div className="flex flex-col gap-1.5">
              <RecentActivityPanel />
              <p className="px-1 text-xs text-muted-foreground">
                Historial completo de importaciones — no depende del período seleccionado.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
