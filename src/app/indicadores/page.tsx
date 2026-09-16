import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { InteractiveBacklogCard } from "@/components/indicadores/backlog-card-interactive";
import { ComparisonCard } from "@/components/indicadores/comparison-card";
import { CurrentStateRow } from "@/components/indicadores/current-state-row";
import { EstadoDistribution } from "@/components/indicadores/estado-distribution";
import { IndicatorModalProvider } from "@/components/indicadores/indicator-modal-context";
import { KpiRow } from "@/components/indicadores/kpi-row";
import { MachineHighlights } from "@/components/indicadores/machine-highlights";
import { OperatorHighlights } from "@/components/indicadores/operator-highlights";
import { PeriodFilterBar } from "@/components/indicadores/period-filter-bar";
import { ResponsibleAreaDistribution } from "@/components/indicadores/responsible-area-distribution";
import { YearMonthlyChart } from "@/components/indicadores/year-monthly-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPeriodLabel, getPeriodRange, type Period } from "@/lib/period";
import {
  getAvailableYears,
  getBacklogBreakdown,
  getClosedTasksForPeriod,
  getMachineDistributionForPeriod,
  getMonthlyCountsForYear,
  getOperatorDistributionForPeriod,
  getPeriodSnapshot,
  getPeriodStats,
  getPreviousPeriodOf,
  getResponsibleAreaDistributionForPeriod,
  getYearPeriodRange,
  type PeriodSnapshot,
} from "@/server/services/indicators.service";
import { getOpenBucketCounts } from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

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
  // completo. Ver buildIndicadoresYearHref.
  const isYearMode = monthParam === undefined;

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
    responsibleAreaData,
    openCounts,
  ] = await Promise.all([
    getPeriodStats(start, end),
    getClosedTasksForPeriod(start, end),
    getBacklogBreakdown(start),
    getMachineDistributionForPeriod(start, end, 10),
    getOperatorDistributionForPeriod(start, end, 10),
    getMonthlyCountsForYear(selectedYear),
    // "Mes anterior" no tiene un equivalente claro en modo año completo — se
    // omite la consulta y la tarjeta de comparación no se muestra (ver más abajo).
    isYearMode ? Promise.resolve(null) : getPeriodSnapshot(previousPeriod),
    getResponsibleAreaDistributionForPeriod(start, end),
    // "Estado actual de la operación": ESTADO != Realizado, SIN filtro de
    // FECHA — independiente del período seleccionado (misma fuente que el
    // Dashboard, ver maintenance-requests.service.ts).
    getOpenBucketCounts(),
  ]);

  const periodLabel = isYearMode ? `Año ${selectedYear} completo` : formatPeriodLabel(period);

  const currentSnapshot: PeriodSnapshot = {
    period,
    label: periodLabel,
    stats,
    closedTasks,
  };

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

          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Indicadores del período</h3>
            <KpiRow stats={stats} closedTasks={closedTasks} />
            <p className="text-xs text-muted-foreground">
              Los KPI de arriba cuentan solo solicitudes con FECHA dentro del período seleccionado
              ({periodLabel}). Es un concepto distinto de &quot;Estado actual de la operación&quot; (abajo) y
              de las tarjetas &quot;Pendientes&quot;/&quot;En espera&quot; del Panel de control, que muestran el total
              abierto (ESTADO != Realizado) sin importar la fecha. Todas las cifras son correctas;
              miden cosas distintas.
            </p>
            <p className="text-xs text-muted-foreground">
              Cerradas: solicitudes cuyas Minutas relacionadas registran FECHAFIN dentro del período
              (última finalización cuando hay varias). Según cierres registrados en Minutas.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Estado actual de la operación</h3>
            <p className="text-xs text-muted-foreground">
              Solicitudes abiertas actualmente, sin importar el mes en que fueron creadas.
            </p>
            <CurrentStateRow counts={openCounts} />
          </div>

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
                <EstadoDistribution stats={stats} />
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-foreground">Backlog de mantenimiento</CardTitle>
                <CardDescription>Solicitudes abiertas que arrastra el sistema.</CardDescription>
              </CardHeader>
              <CardContent>
                <InteractiveBacklogCard backlog={backlog} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-foreground">Distribución por responsable</CardTitle>
                <CardDescription>Solicitudes del período por área responsable.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsibleAreaDistribution breakdown={responsibleAreaData} />
              </CardContent>
            </Card>
          </div>

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
