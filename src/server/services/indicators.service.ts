import { db } from "@/lib/db";
import { classifyEstado } from "@/lib/estado";
import { getPeriodRange, getPreviousPeriod, MONTH_LABELS, type Period } from "@/lib/period";
import type { Prisma } from "@/generated/prisma/client";
import {
  getDistinctEstados,
  type DashboardStats,
} from "@/server/services/maintenance-requests.service";

/**
 * Indicadores acotados a un período (año/mes) en lugar de todo el histórico.
 * Comparte `classifyEstado` con el dashboard/KPI existentes (misma fuente de
 * verdad para "qué es Pendiente/En espera/Atendida"), pero cada consulta
 * acá está acotada explícitamente por FECHA — nunca reutiliza las funciones
 * de `maintenance-requests.service.ts` que trabajan sobre "sinceDays" u
 * "todo el histórico", para no arriesgar ese código ya usado por el
 * dashboard principal.
 */

/** Años reales con al menos una Solicitud (FECHA no nula), para el filtro. */
export async function getAvailableYears(): Promise<number[]> {
  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { not: null } },
    select: { fecha: true },
  });
  const years = new Set<number>();
  for (const row of rows) {
    if (row.fecha) years.add(row.fecha.getFullYear());
  }
  const currentYear = new Date().getFullYear();
  years.add(currentYear); // el año actual siempre debe poder seleccionarse, incluso sin datos todavía
  return Array.from(years).sort((a, b) => b - a);
}

async function computeStatsForWhere(
  where: Prisma.MaintenanceRequestWhereInput,
): Promise<DashboardStats> {
  const grouped = await db.maintenanceRequest.groupBy({
    by: ["estado"],
    where,
    _count: { _all: true },
  });

  const stats: DashboardStats = {
    total: 0,
    pendientes: 0,
    espera: 0,
    programadas: 0,
    atendidas: 0,
    otros: 0,
  };

  for (const group of grouped) {
    const count = group._count._all;
    stats.total += count;
    const { bucket } = classifyEstado(group.estado);
    if (bucket === "pendiente") stats.pendientes += count;
    else if (bucket === "espera") stats.espera += count;
    else if (bucket === "programada") stats.programadas += count;
    else if (bucket === "atendida") stats.atendidas += count;
    else stats.otros += count;
  }

  return stats;
}

/** Estadísticas reales (mismo shape que el dashboard) acotadas a [start, end). */
export function getPeriodStats(start: Date, end: Date): Promise<DashboardStats> {
  return computeStatsForWhere({ fecha: { gte: start, lt: end } });
}

async function getNonAtendidaEstadoWhere(): Promise<Prisma.MaintenanceRequestWhereInput> {
  const distinctEstados = await getDistinctEstados();
  const nonAtendida = distinctEstados.filter((estado) => classifyEstado(estado).bucket !== "atendida");
  // "otro" (estado null) también cuenta como no resuelta — igual que en el dashboard.
  return nonAtendida.length > 0
    ? { OR: [{ estado: { in: nonAtendida } }, { estado: null }] }
    : { estado: null };
}

/**
 * "Pendientes acumuladas": solicitudes con ESTADO != Realizado cuya FECHA es
 * anterior al inicio del período seleccionado — el backlog real que el
 * período no explica por sí solo.
 */
export async function getBacklogBeforePeriod(periodStart: Date): Promise<number> {
  const estadoWhere = await getNonAtendidaEstadoWhere();
  return db.maintenanceRequest.count({
    where: { fecha: { lt: periodStart }, ...estadoWhere },
  });
}

export interface BacklogBreakdown {
  /** Igual a getBacklogBeforePeriod: backlog respecto al período seleccionado. */
  total: number;
  /** Estos tres se calculan sobre TODO el backlog abierto (no solo el previo al período),
   *  usando la fecha actual del sistema como referencia de antigüedad. */
  over7Days: number;
  over15Days: number;
  over30Days: number;
}

/**
 * Desglose de antigüedad del backlog. `total` respeta el período
 * seleccionado (igual definición que "Pendientes acumuladas"); los tres
 * umbrales de días se calculan siempre contra la fecha actual del sistema
 * (no contra el período), porque representan qué tan vieja es la
 * solicitud abierta *hoy* — se documenta así también en la UI.
 */
export async function getBacklogBreakdown(periodStart: Date): Promise<BacklogBreakdown> {
  const estadoWhere = await getNonAtendidaEstadoWhere();
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  const [total, over7Days, over15Days, over30Days] = await Promise.all([
    db.maintenanceRequest.count({ where: { fecha: { lt: periodStart }, ...estadoWhere } }),
    db.maintenanceRequest.count({
      where: { fecha: { lt: new Date(now.getTime() - 7 * day) }, ...estadoWhere },
    }),
    db.maintenanceRequest.count({
      where: { fecha: { lt: new Date(now.getTime() - 15 * day) }, ...estadoWhere },
    }),
    db.maintenanceRequest.count({
      where: { fecha: { lt: new Date(now.getTime() - 30 * day) }, ...estadoWhere },
    }),
  ]);

  return { total, over7Days, over15Days, over30Days };
}

export interface MachinePeriodItem {
  maquina: string;
  count: number;
  percentage: number;
}

/** Máquinas con más solicitudes reales dentro del período, con % sobre el total del período. */
export async function getMachineDistributionForPeriod(
  start: Date,
  end: Date,
  limit = 10,
): Promise<{ items: MachinePeriodItem[]; total: number }> {
  const dateWhere: Prisma.MaintenanceRequestWhereInput = { fecha: { gte: start, lt: end } };

  const [grouped, total] = await Promise.all([
    db.maintenanceRequest.groupBy({
      by: ["maquina"],
      where: { ...dateWhere, maquina: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { maquina: "desc" } },
      take: limit,
    }),
    db.maintenanceRequest.count({ where: dateWhere }),
  ]);

  const items = grouped
    .filter((group) => group.maquina)
    .map((group) => ({
      maquina: group.maquina as string,
      count: group._count._all,
      percentage: total > 0 ? (group._count._all / total) * 100 : 0,
    }));

  return { items, total };
}

export interface MonthPoint {
  month: number;
  label: string;
  count: number;
}

/**
 * Solicitudes por mes del año calendario dado (Enero-Diciembre). Los meses
 * sin datos reales simplemente cuentan 0 — nunca se inventa un valor para
 * un mes futuro o sin registros.
 */
export async function getMonthlyCountsForYear(year: number): Promise<MonthPoint[]> {
  const { start } = getPeriodRange(year, 1);
  const { start: end } = getPeriodRange(year + 1, 1);

  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { gte: start, lt: end } },
    select: { fecha: true },
  });

  const counts = new Array(12).fill(0) as number[];
  for (const row of rows) {
    if (row.fecha) counts[row.fecha.getMonth()] += 1;
  }

  return counts.map((count, index) => ({ month: index + 1, label: MONTH_LABELS[index], count }));
}

/**
 * "Tareas cerradas en el período": usa FECHAFIN de Minutas realmente
 * relacionadas (relationStatus = RELATED, vía OBSERVACIONES.trim() ===
 * PARTE — la misma relación exacta de siempre, sin fuzzy matching). Las
 * Minutas históricas nunca llegan a RELATED (nunca se intenta relacionarlas
 * automáticamente), así que quedan excluidas sin necesidad de chequear
 * `isHistorical` aparte.
 *
 * Si una Solicitud tiene varias Minutas relacionadas, se usa el FECHAFIN
 * más reciente entre todas como fecha de cierre de esa Solicitud — nunca se
 * inventa un cierre para una Solicitud sin Minutas relacionadas con
 * FECHAFIN real.
 */
export async function getClosedTasksForPeriod(start: Date, end: Date): Promise<number> {
  const relatedLogs = await db.maintenanceLog.findMany({
    where: { relationStatus: "RELATED", fechafin: { not: null }, maintenanceRequestId: { not: null } },
    select: { maintenanceRequestId: true, fechafin: true },
  });

  const latestFechafinByRequest = new Map<string, Date>();
  for (const log of relatedLogs) {
    if (!log.maintenanceRequestId || !log.fechafin) continue;
    const current = latestFechafinByRequest.get(log.maintenanceRequestId);
    if (!current || log.fechafin > current) {
      latestFechafinByRequest.set(log.maintenanceRequestId, log.fechafin);
    }
  }

  let count = 0;
  for (const fechafin of latestFechafinByRequest.values()) {
    if (fechafin >= start && fechafin < end) count += 1;
  }
  return count;
}

export interface PeriodSnapshot {
  period: Period;
  label: string;
  stats: DashboardStats;
  closedTasks: number;
}

/** Snapshot completo (stats + cerradas) de un período dado — usado para el período actual y el anterior. */
export async function getPeriodSnapshot(period: Period): Promise<PeriodSnapshot> {
  const { start, end } = getPeriodRange(period.year, period.month);
  const [stats, closedTasks] = await Promise.all([
    getPeriodStats(start, end),
    getClosedTasksForPeriod(start, end),
  ]);
  return {
    period,
    label: `${MONTH_LABELS[period.month - 1]} ${period.year}`,
    stats,
    closedTasks,
  };
}

export function getPreviousPeriodOf(period: Period): Period {
  return getPreviousPeriod(period);
}
