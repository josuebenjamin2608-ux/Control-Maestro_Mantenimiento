import { AppShell } from "@/components/layout/app-shell";
import { EstadoDistribution } from "@/components/indicadores/estado-distribution";
import { MachineBarList } from "@/components/indicadores/machine-bar-list";
import { MonthlyTrendChart } from "@/components/indicadores/monthly-trend-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getDashboardStats,
  getMachineDistribution,
  getMonthlyRequestCounts,
} from "@/server/services/maintenance-requests.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-2xl font-semibold text-foreground">{value}</span>
      </CardContent>
    </Card>
  );
}

export default async function IndicadoresPage() {
  const [stats, machines, monthly] = await Promise.all([
    getDashboardStats(),
    getMachineDistribution(8),
    getMonthlyRequestCounts(12),
  ]);

  const percentage = (value: number) =>
    stats.total > 0 ? `${Math.round((value / stats.total) * 100)}%` : "—";

  return (
    <AppShell title="Indicadores">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">Indicadores de Solicitudes</h2>
          <p className="text-sm text-muted-foreground">
            Calculados con datos reales del registro de Solicitudes. El seguimiento por tiempos,
            duración y técnico se incorporará cuando este módulo integre las Minutas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total" value={String(stats.total)} />
          <StatTile label="Pendientes" value={String(stats.pendientes)} />
          <StatTile label="En espera" value={String(stats.espera)} />
          <StatTile label="Atendidas" value={String(stats.atendidas)} />
          <StatTile label="% atendidas" value={percentage(stats.atendidas)} />
          <StatTile label="% pendientes" value={percentage(stats.pendientes)} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">Distribución por estado</CardTitle>
              <CardDescription>
                Proporción real de cada categoría sobre el total de solicitudes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EstadoDistribution stats={stats} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">Máquinas con más novedades</CardTitle>
              <CardDescription>
                Top {machines.length} máquinas por cantidad de solicitudes reales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MachineBarList items={machines} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Evolución de solicitudes</CardTitle>
            <CardDescription>
              Solicitudes por mes de los últimos 12 meses, según la fecha real de cada una.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart data={monthly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-foreground">Limitaciones de esta primera etapa</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <p>
              Estos indicadores usan únicamente campos de Solicitudes (PARTE, MAQUINA, FECHA,
              ESTADO, etc.) — no se mezclan con datos de Minutas.
            </p>
            <p>
              Indicadores de tiempos de atención, duración de intervención, cumplimiento y carga por
              técnico requieren cruzar con Minutas y con el historial de asignaciones; se
              desarrollarán en una etapa posterior, cuando haya suficiente volumen de datos reales de
              asignación.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
