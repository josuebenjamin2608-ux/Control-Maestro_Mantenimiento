import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { InteractiveBacklogCard } from "@/components/indicadores/backlog-card-interactive";
import { ComparisonCard } from "@/components/indicadores/comparison-card";
import { ComplianceSection } from "@/components/indicadores/compliance-section";
import { CurrentStateRow } from "@/components/indicadores/current-state-row";
import { EstadoDistribution } from "@/components/indicadores/estado-distribution";
import { IndicatorModalProvider } from "@/components/indicadores/indicator-modal-context";
import { KpiRow } from "@/components/indicadores/kpi-row";
import { MachineHighlights } from "@/components/indicadores/machine-highlights";
import { MaintenanceIndicatorsSection } from "@/components/indicadores/maintenance-indicators-section";
import { OperatorHighlights } from "@/components/indicadores/operator-highlights";
import { PeriodFilterBar } from "@/components/indicadores/period-filter-bar";
import { ResponsibleAreaBreakdown } from "@/components/indicadores/responsible-area-breakdown";
import { UpcomingCommitmentsSection } from "@/components/indicadores/upcoming-commitments-section";
import { YearMonthlyChart } from "@/components/indicadores/year-monthly-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { openBucketCountsToDashboardStats } from "@/lib/estado";
import { formatPeriodLabel, getPeriodRange, type Period } from "@/lib/period";
import {
  getAvailableYears,
  getBacklogAgeBuckets,
  getClosedTasksForPeriod,
  getComplianceSummary,
  getMachineDistributionForPeriod,
  getMonthlyCountsForYear,
  getOperatorDistributionForPeriod,
  getPeriodSnapshot,
  getPeriodStats,
  getPreviousPeriodOf,
  getUpcomingCommitments,
  getYearPeriodRange,
  type PeriodSnapshot,
} from "@/server/services/indicators.service";
import {
  getOpenBucketCounts,
  getOpenRequestsByResponsibleArea,
} from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

const UPCOMING_COMMITMENTS_LIMIT = 20;

function buildIndicadoresHref(year: number, month: number) {
  return `/indicadores?year=${year}&month=${month}`;
}

/** Modo "Año actual": mismo path, pero SIN `month` — así se distingue de un mes inválido (que cae de vuelta al mes actual). */
function buildIndicadoresYearHref(year: number) {
  return `/indicadores?year=${year}`;
}

export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { year: yearParam, month: monthParam } = await searchParams;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const years = await getAvailableYears();

  const parsedYear = yearParam ? Number(yearParam) : currentYear;
  const selectedYear =
    Number.isInteger(parsedYear) && parsedYear > 1900 && parsedYear < 2200 ? parsedYear : currentYear;

  // "Año actual" navega a `?year=X` SIN `month` — esa ausencia (no un mes
  // inválido, que cae de vuelta al mes actual) es la que activa el modo año
  // completo. Ver buildIndicadoresYearHref. Requiere ADEMÁS que `year` esté
  // presente: una visita "en blanco" a /indicadores (sin ningún parámetro)
  // no debe entrar en modo año — el comportamiento predeterminado sigue
  // siendo "Mes actual" (año/mes actuales).
  const isYearMode = yearParam !== undefined && monthParam === undefined;

  const parsedMonth = monthParam ? Number(monthParam) : currentMonth;
  const selectedMonth =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : currentMonth;

  const period: Period = { year: selectedYear, month: selectedMonth };
  const previousPeriod = getPreviousPeriodOf(period);
  // Año completo: [01/01 00:00 UTC, 01/01 año siguiente 00:00 UTC) — misma
  // composición de getPeriodRange que usa getYearPeriodRange, nunca una
  // segunda lógica de fechas UTC.
  const { start, end } = isYearMode ? getYearPeriodRange(selectedYear) : getPeriodRange(selectedYear, selectedMonth);

  const [
    stats,
    closedTasks,
    backlog,
    machineData,
    operatorData,
    monthlyData,
    previousSnapshot,
    openCounts,
    openResponsibleAreaData,
    complianceSummary,
    upcomingCommitments,
  ] = await Promise.all([
    getPeriodStats(start, end),
    getClosedTasksForPeriod(start, end),
    // "Backlog de mantenimiento": mismo universo que "Total abierto" (ESTADO
    // != Realizado, SIN filtro de FECHA) — independiente del período
    // seleccionado, ver getBacklogAgeBuckets.
    getBacklogAgeBuckets(),
    getMachineDistributionForPeriod(start, end, 10),
    getOperatorDistributionForPeriod(start, end, 10),
    getMonthlyCountsForYear(selectedYear),
    // "Mes anterior" no tiene un equivalente claro en modo año completo — se
    // omite la consulta y la tarjeta de comparación no se muestra (ver más abajo).
    isYearMode ? Promise.resolve(null) : getPeriodSnapshot(previousPeriod),
    // "Estado actual de la operación" y "Distribución por responsable":
    // ESTADO != Realizado, SIN filtro de FECHA — independiente del período
    // seleccionado (misma fuente que el Dashboard, ver
    // maintenance-requests.service.ts).
    getOpenBucketCounts(),
    getOpenRequestsByResponsibleArea(),
    getComplianceSummary(),
    getUpcomingCommitments(UPCOMING_COMMITMENTS_LIMIT),
  ]);

  const periodLabel = isYearMode ? `Año ${selectedYear} completo` : formatPeriodLabel(period);

  const currentSnapshot: PeriodSnapshot = {
    period,
    label: periodLabel,
    stats,
    closedTasks,
  };

  // "Distribución por estado": sin un mes específico seleccionado (modo "Año
  // actual", ver isYearMode) representa la situación ACTUAL de las
  // solicitudes abiertas (ESTADO != Realizado, sin filtro de FECHA — mismo
  // universo que "Estado actual de la operación"/"Backlog"), nunca el
  // volumen del año completo. Con un mes específico seleccionado (incluido
  // el default "Mes actual"), sigue siendo la distribución del período —
  // comportamiento sin cambios.
  const estadoDistributionStats = isYearMode ? openBucketCountsToDashboardStats(openCounts) : stats;

  const isEmpty = stats.total === 0;
  const currentIndicadoresHref = isYearMode
    ? buildIndicadoresYearHref(selectedYear)
    : buildIndicadoresHref(selectedYear, selectedMonth);

  return (
    <AppShell title="Indicadores">
      <IndicatorModalProvider
        year={selectedYear}
        month={isYearMode ? undefined : selectedMonth}
        periodLabel={currentSnapshot.label}
        backHref={currentIndicadoresHref}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-foreground">Indicadores de Mantenimiento</h2>
              <p className="text-sm text-muted-foreground">{currentSnapshot.label}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PeriodFilterBar years={years} selectedYear={selectedYear} selectedMonth={selectedMonth} />
              <Link
                href={buildIndicadoresHref(currentYear, currentMonth)}
                className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-secondary"
              >
                Mes actual
              </Link>
              <Link
                href={buildIndicadoresYearHref(currentYear)}
                className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-secondary"
              >
                Año actual
              </Link>
            </div>
          </div>

          {isEmpty ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No hay solicitudes registradas para este periodo.
              </CardContent>
            </Card>
          ) : null}

          {/* 1. Indicadores del período — autoexplicativos vía título/valor/subtítulo corto de cada tarjeta. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Indicadores del período</h3>
            <KpiRow stats={stats} closedTasks={closedTasks} />
          </div>

          {/* 2. Estado actual de la operación — independiente del período seleccionado. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Estado actual de la operación</h3>
            <p className="text-xs text-muted-foreground">
              Solicitudes abiertas actualmente, sin importar el mes en que fueron creadas.
            </p>
            <CurrentStateRow counts={openCounts} />
          </div>

          {/* 3. Backlog de mantenimiento — mismo universo que "Total abierto", antigüedad en 4 rangos excluyentes. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Backlog de mantenimiento</h3>
            <Card>
              <CardContent className="pt-6">
                <InteractiveBacklogCard backlog={backlog} />
              </CardContent>
            </Card>
          </div>

          {/* 4-5. Distribución por responsable — mismo universo que el Backlog, cada área expandible/contraíble. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Distribución por responsable</h3>
            <p className="text-xs text-muted-foreground">
              Solicitudes abiertas actualmente por área responsable — mismo universo que el Backlog.
              Clic en un área para ver/ocultar su detalle.
            </p>
            <Card>
              <CardContent className="pt-6">
                <ResponsibleAreaBreakdown summary={openResponsibleAreaData} backHref={currentIndicadoresHref} />
              </CardContent>
            </Card>
          </div>

          {/* 6. Cumplimiento de compromisos. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Cumplimiento de compromisos</h3>
            <ComplianceSection summary={complianceSummary} />
          </div>

          {/* 7. Indicadores de mantenimiento — MTTR/MTBF, estructura reservada, sin calcular todavía. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Indicadores de mantenimiento</h3>
            <MaintenanceIndicatorsSection />
          </div>

          {/* 8. Análisis histórico. */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Análisis histórico</h3>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground">Solicitudes por mes — {selectedYear}</CardTitle>
                  <CardDescription>
                    {isYearMode ? "Vista del año completo." : "El mes seleccionado se resalta."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <YearMonthlyChart
                    data={monthlyData}
                    year={selectedYear}
                    highlightMonth={isYearMode ? undefined : selectedMonth}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground">Distribución por estado</CardTitle>
                  <CardDescription>Proporción real sobre las solicitudes del período.</CardDescription>
                </CardHeader>
                <CardContent>
                  <EstadoDistribution stats={estadoDistributionStats} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground">Máquinas con más solicitudes</CardTitle>
                  <CardDescription>Top 10 del período seleccionado.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MachineHighlights items={machineData.items} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground">Solicitudes por operario</CardTitle>
                  <CardDescription>Top 10 de quién registra más solicitudes en el período.</CardDescription>
                </CardHeader>
                <CardContent>
                  <OperatorHighlights items={operatorData.items} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 9. Próximas a vencer. */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Próximas a vencer</h3>
            <UpcomingCommitmentsSection
              items={upcomingCommitments.items}
              total={upcomingCommitments.total}
              backHref={currentIndicadoresHref}
            />
          </div>

          {/* 10. Comparación con el mes anterior — al final, a propósito. */}
          {!isYearMode && previousSnapshot ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-foreground">Comparación con el mes anterior</CardTitle>
              </CardHeader>
              <CardContent>
                <ComparisonCard current={currentSnapshot} previous={previousSnapshot} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </IndicatorModalProvider>
    </AppShell>
  );
}
