import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { RecentActivityPanel } from "@/components/layout/recent-activity-panel";
import { RouteTabs } from "@/components/layout/route-tabs";
import { PeriodFilterBar } from "@/components/indicadores/period-filter-bar";
import { EstadoBreakdownCard } from "@/components/dashboard/estado-breakdown-card";
import { ResponsibleAreaCard } from "@/components/dashboard/responsible-area-card";
import { SolicitudesTable } from "@/components/solicitudes/solicitudes-table";
import { Card, CardContent } from "@/components/ui/card";
import { ESTADO_BUCKET_LABELS, type EstadoBucket } from "@/lib/estado";
import { formatPeriodLabel, getPeriodRange, type Period } from "@/lib/period";
import { cn } from "@/lib/utils";
import {
  getOpenBucketCounts,
  getOpenRequestsByResponsibleArea,
  listOperationalMaintenanceRequests,
  type OpenBucketCounts,
} from "@/server/services/maintenance-requests.service";
import { getAvailableYears, getPeriodStats } from "@/server/services/indicators.service";

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

/** Valor de un bucket "abierto" (todo menos atendida) dentro de OpenBucketCounts — sin filtro de FECHA. */
function getOpenBucketValue(counts: OpenBucketCounts, bucket: EstadoBucket): number {
  switch (bucket) {
    case "pendiente":
      return counts.pendientes;
    case "espera":
      return counts.espera;
    case "programada":
      return counts.programadas;
    case "otro":
      return counts.otros;
    case "atendida":
      return 0; // atendida se maneja aparte (sí depende del período, ver stats.atendidas).
  }
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
  caption,
  tone,
  href,
  active,
}: {
  label: string;
  value: number;
  caption: string;
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
          <span className="text-xs text-muted-foreground">{caption}</span>
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
  // ante un year/month inválido en la URL. El período solo se usa acá para
  // "Solicitudes del mes" y "Atendidas del mes" (métricas de actividad DEL
  // MES); las solicitudes ABIERTAS son intencionalmente independientes de
  // este período — ver getOpenBucketCounts.
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
  // corrección de fechas UTC no se toca, solo se reutiliza donde de verdad
  // corresponde acotar por período (volumen del mes y atendidas del mes).
  const { start, end } = getPeriodRange(selectedYear, selectedMonth);

  const bucketParam = parseBucketParam(bucket);
  const selectedBucket: EstadoBucket | undefined =
    bucketParam && bucketParam !== "todas" ? bucketParam : undefined;

  // "todas" (KPI Total) y "atendida" son las únicas vistas que siguen
  // acotadas por período: son métricas de actividad DEL MES ("cuántas
  // solicitudes entraron"/"cuántas se completaron"), no de estado abierto
  // actual. Cualquier otro caso (sin bucket, o pendiente/espera/programada/
  // otro) es intencionalmente independiente de FECHA.
  const usesPeriod = bucketParam === "todas" || selectedBucket === "atendida";

  const [years, stats, openCounts, operationalRequests, responsibleAreaSummary] =
    await Promise.all([
      getAvailableYears(),
      // "Solicitudes del mes" y "Atendidas del mes" SÍ dependen del período
      // — son volumen/actividad de ESE mes, no el estado operativo actual.
      getPeriodStats(start, end),
      // Pendientes/En espera/Programadas/Otros: ESTADO != Realizado, SIN
      // filtro de FECHA — el estado operativo real actual (regla de negocio
      // de esta tarea).
      getOpenBucketCounts(),
      listOperationalMaintenanceRequests({
        bucket: selectedBucket,
        period: usesPeriod ? { start, end } : undefined,
        // Vista por defecto ("Solicitudes abiertas"): ESTADO != Realizado,
        // SIN límite artificial ni filtro de fecha — deben verse todas, sin
        // importar cuán antiguas. Con un bucket específico seleccionado
        // (KPI clickeado) se mantiene un tope razonable.
        take: selectedBucket ? 15 : undefined,
        // Nunca muestra Realizado, salvo que se pida explícitamente "todas".
        excludeAtendida: !bucketParam,
      }),
      getOpenRequestsByResponsibleArea(),
    ]);

  const currentDashboardHref = buildDashboardHref(
    selectedYear,
    selectedMonth,
    bucketParam === "todas" ? "todas" : selectedBucket,
  );

  // ATENDIDAS DEL MES / SOLICITUDES DEL MES — nunca el total histórico.
  const atendidasRatio = stats.total > 0 ? Math.round((stats.atendidas / stats.total) * 100) : 0;
  const showOtrosKpi = openCounts.otros > 0;

  const sectionTitle =
    bucketParam === "todas"
      ? `Todas las solicitudes de ${periodLabel}`
      : selectedBucket === "atendida"
        ? `Solicitudes atendidas de ${periodLabel}`
        : selectedBucket === "otro"
          ? "Otros estados abiertos"
          : selectedBucket
            ? `Solicitudes ${ESTADO_BUCKET_LABELS[selectedBucket].toLowerCase()} abiertas`
            : "Solicitudes abiertas";

  const activeCount =
    bucketParam === "todas"
      ? stats.total
      : selectedBucket === "atendida"
        ? stats.atendidas
        : selectedBucket
          ? getOpenBucketValue(openCounts, selectedBucket)
          : undefined;

  const sectionSubtitle =
    activeCount !== undefined
      ? usesPeriod
        ? `${activeCount} solicitud${activeCount === 1 ? "" : "es"} en esta categoría, con FECHA en ${periodLabel}.`
        : `${activeCount} solicitud${activeCount === 1 ? "" : "es"} en esta categoría, sin importar la fecha.`
      : "Todas las solicitudes con ESTADO distinto de Realizado (pendientes, en espera, programadas u otras), sin importar cuándo se crearon.";

  return (
    <AppShell title="Panel de control">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-foreground">
              SIMI · Sistema Inteligente de Mantenimiento de INDUCARTON
            </h2>
            <p className="text-sm text-muted-foreground">
              Solicitudes abiertas: estado operativo actual, sin importar la fecha. Solicitudes del
              mes y Atendidas del mes: actividad de {periodLabel}.
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
            label="Pendientes"
            value={openCounts.pendientes}
            caption="Abiertas · todas las fechas"
            tone={BUCKET_TONE.pendiente}
            href={buildDashboardHref(selectedYear, selectedMonth, "pendiente")}
            active={selectedBucket === "pendiente"}
          />
          <KpiLink
            label="En espera"
            value={openCounts.espera}
            caption="Abiertas · todas las fechas"
            tone={BUCKET_TONE.espera}
            href={buildDashboardHref(selectedYear, selectedMonth, "espera")}
            active={selectedBucket === "espera"}
          />
          <KpiLink
            label="Programadas / en ejecución"
            value={openCounts.programadas}
            caption="Abiertas · todas las fechas"
            tone={BUCKET_TONE.programada}
            href={buildDashboardHref(selectedYear, selectedMonth, "programada")}
            active={selectedBucket === "programada"}
          />
          <KpiLink
            label="Atendidas del mes"
            value={stats.atendidas}
            caption={periodLabel}
            tone={BUCKET_TONE.atendida}
            href={buildDashboardHref(selectedYear, selectedMonth, "atendida")}
            active={selectedBucket === "atendida"}
          />
          {showOtrosKpi ? (
            <KpiLink
              label="Otros (abiertas)"
              value={openCounts.otros}
              caption="Abiertas · todas las fechas"
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
          </div>

          <div className="flex flex-col gap-6">
            <EstadoBreakdownCard
              stats={{
                pendientes: openCounts.pendientes,
                espera: openCounts.espera,
                programadas: openCounts.programadas,
                atendidas: stats.atendidas,
                otros: openCounts.otros,
              }}
            />

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
