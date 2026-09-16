import { db } from "@/lib/db";
import { classifyEstado, type EstadoBucket } from "@/lib/estado";
import { getPeriodRange, getPreviousPeriod, MONTH_LABELS, type Period } from "@/lib/period";
import { RESPONSIBLE_AREA_UNDEFINED_VALUE } from "@/lib/responsible-area";
import type { MaintenanceRequestResponsibleArea, Prisma } from "@/generated/prisma/client";
import {
  getEstadoWhereForBucket,
  getNonAtendidaEstadoWhere,
  type DashboardStats,
} from "@/server/services/maintenance-requests.service";

/**
 * Indicadores acotados a un período (año/mes) en lugar de todo el histórico.
 * Comparte `classifyEstado` con el Dashboard (misma fuente de verdad para
 * "qué es Pendiente/En espera/Atendida"), y comparte con él también la
 * definición de "abierta" (`getNonAtendidaEstadoWhere`, en
 * maintenance-requests.service.ts) para que Dashboard e Indicadores nunca
 * diverjan sobre qué cuenta como backlog. Cada consulta acá está acotada
 * explícitamente por FECHA al período recibido.
 */

/** Años reales con al menos una Solicitud (FECHA no nula), para el filtro. */
export async function getAvailableYears(): Promise<number[]> {
  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { not: null } },
    select: { fecha: true },
  });
  const years = new Set<number>();
  for (const row of rows) {
    // getUTCFullYear (no getFullYear): FECHA se almacena como medianoche
    // UTC del día calendario, así que el año debe leerse en UTC para no
    // depender de la zona horaria del proceso.
    if (row.fecha) years.add(row.fecha.getUTCFullYear());
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

export interface OperatorPeriodItem {
  /** CODEMPLE si la fila lo trae; si no, null (se agrupó por EMPLEADO normalizado, o es "Sin definir"). */
  codemple: string | null;
  /** EMPLEADO tal cual apareció la primera vez para este grupo — nunca inventado. "Sin definir" si no hay CODEMPLE ni EMPLEADO. */
  label: string;
  /** EMPLEADO real cuando el agrupamiento fue por nombre (codemple null y label !== "Sin definir"); usado para reconstruir el filtro exacto en getIndicatorRequests. */
  empleado: string | null;
  count: number;
  percentage: number;
}

/**
 * Sin tildes + MAYÚSCULAS + espacios colapsados: agrupa "JUAN PEREZ"/"Juan
 * Pérez"/"JUAN  PEREZ" como el mismo operario cuando no hay CODEMPLE — las
 * tildes se ignoran porque son la inconsistencia más común entre grafías del
 * mismo nombre en los datos de origen (p. ej. "María Gómez" vs "MARIA GOMEZ").
 */
function normalizeOperatorName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/**
 * Operario = quién REGISTRA la Solicitud (CODEMPLE/EMPLEADO), NUNCA el
 * técnico asignado (MaintenanceRequestTechnician es un concepto aparte, no
 * tocado acá). Se agrupa por CODEMPLE cuando existe (identificador estable);
 * sin CODEMPLE, se agrupa por EMPLEADO normalizado para no duplicar al mismo
 * operario por diferencias de mayúsculas/espacios — nunca se inventa un
 * nombre: `label` siempre es un EMPLEADO real tal cual vino del archivo, o
 * "Sin definir" si la fila no trae ninguno de los dos campos.
 */
export async function getOperatorDistributionForPeriod(
  start: Date,
  end: Date,
  limit = 10,
): Promise<{ items: OperatorPeriodItem[]; total: number }> {
  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { gte: start, lt: end } },
    select: { codemple: true, empleado: true },
  });
  const total = rows.length;

  const groups = new Map<
    string,
    { codemple: string | null; empleado: string | null; label: string; count: number }
  >();
  for (const row of rows) {
    const codemple = row.codemple?.trim() || null;
    const empleado = row.empleado?.trim() || null;

    let key: string;
    if (codemple) key = `c:${codemple}`;
    else if (empleado) key = `e:${normalizeOperatorName(empleado)}`;
    else key = "sin_definir";

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        codemple,
        empleado: codemple ? null : empleado,
        label: codemple ? (empleado ?? codemple) : (empleado ?? "Sin definir"),
        count: 1,
      });
    }
  }

  const items = Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((group) => ({
      ...group,
      percentage: total > 0 ? (group.count / total) * 100 : 0,
    }));

  return { items, total };
}

export interface MonthPoint {
  month: number;
  label: string;
  count: number;
}

/**
 * [start, end) del AÑO calendario completo del año dado (01/01 00:00 UTC a
 * 01/01 00:00 UTC del año siguiente) — se compone reutilizando
 * `getPeriodRange` dos veces (mismo patrón que ya usaba esta función más
 * abajo), nunca una segunda lógica de fechas. Es el rango que usa el modo
 * "Año actual" de /indicadores.
 */
export function getYearPeriodRange(year: number): { start: Date; end: Date } {
  const { start } = getPeriodRange(year, 1);
  const { start: end } = getPeriodRange(year + 1, 1);
  return { start, end };
}

/**
 * Solicitudes por mes del año calendario dado (Enero-Diciembre). Los meses
 * sin datos reales simplemente cuentan 0 — nunca se inventa un valor para
 * un mes futuro o sin registros.
 */
export async function getMonthlyCountsForYear(year: number): Promise<MonthPoint[]> {
  const { start, end } = getYearPeriodRange(year);

  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { gte: start, lt: end } },
    select: { fecha: true },
  });

  const counts = new Array(12).fill(0) as number[];
  for (const row of rows) {
    // getUTCMonth (no getMonth): mismo motivo que getUTCFullYear arriba.
    if (row.fecha) counts[row.fecha.getUTCMonth()] += 1;
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
async function getClosedRequestIdsForPeriod(start: Date, end: Date): Promise<string[]> {
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

  const closed: { id: string; fechafin: Date }[] = [];
  for (const [id, fechafin] of latestFechafinByRequest.entries()) {
    if (fechafin >= start && fechafin < end) closed.push({ id, fechafin });
  }
  // Cierre más reciente primero — mismo criterio que el resto de los listados de detalle.
  closed.sort((a, b) => b.fechafin.getTime() - a.fechafin.getTime());
  return closed.map((row) => row.id);
}

export async function getClosedTasksForPeriod(start: Date, end: Date): Promise<number> {
  return (await getClosedRequestIdsForPeriod(start, end)).length;
}

export interface ResponsibleAreaPeriodBreakdown {
  mantenimiento: number;
  produccion: number;
  /** responsibleArea = null. */
  sinDefinir: number;
}

/**
 * Distribución de Solicitudes del período por área responsable —
 * independiente de ESTADO (a diferencia de getPeriodStats/getClosedTasksForPeriod,
 * cuenta TODAS las solicitudes del período, no solo las abiertas).
 */
export async function getResponsibleAreaDistributionForPeriod(
  start: Date,
  end: Date,
): Promise<ResponsibleAreaPeriodBreakdown> {
  const grouped = await db.maintenanceRequest.groupBy({
    by: ["responsibleArea"],
    where: { fecha: { gte: start, lt: end } },
    _count: { _all: true },
  });

  const result: ResponsibleAreaPeriodBreakdown = { mantenimiento: 0, produccion: 0, sinDefinir: 0 };
  for (const group of grouped) {
    const count = group._count._all;
    if (group.responsibleArea === "MANTENIMIENTO") result.mantenimiento += count;
    else if (group.responsibleArea === "PRODUCCION") result.produccion += count;
    else result.sinDefinir += count;
  }
  return result;
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

// ---------------------------------------------------------------------------
// Detalle interactivo de indicadores (/indicadores): dado un indicador y un
// período, devuelve exactamente las Solicitudes que lo componen, reutilizando
// las MISMAS condiciones WHERE que ya calculan el número mostrado en cada
// KPI/tarjeta (getEstadoWhereForBucket, getNonAtendidaEstadoWhere,
// getClosedRequestIdsForPeriod, el mismo filtro de Responsable que
// /solicitudes) — así el conteo del KPI y el total del modal nunca pueden
// divergir. Es la única función que el modal de detalle usa para pedir datos.
// ---------------------------------------------------------------------------

export type IndicatorKind =
  | "solicitudes"
  | "estado"
  | "pctAtendidas"
  | "cerradas"
  | "backlog"
  | "backlogOver7"
  | "backlogOver15"
  | "backlogOver30"
  | "maquina"
  | "responsable"
  | "operario"
  /** "Estado actual de la operación": TODAS las fechas, ESTADO != Realizado. Ver getNonAtendidaEstadoWhere. */
  | "totalAbierto"
  /** Un bucket de classifyEstado, pero TODAS las fechas (no acotado al período) — la contraparte de "estado" para "Estado actual de la operación". */
  | "estadoActual";

export interface GetIndicatorRequestsParams {
  indicator: IndicatorKind;
  year: number;
  /**
   * Mes del período (1-12). Si se omite, el período es el AÑO CALENDARIO
   * COMPLETO de `year` (modo "Año actual" de /indicadores — ver
   * getYearPeriodRange). Ignorado por los indicadores independientes del
   * período ("totalAbierto", "estadoActual" y los backlogOver7/15/30, que
   * siempre son relativos a la fecha actual del sistema).
   */
  month?: number;
  /** Requerido cuando indicator === "estado" o "estadoActual" (pendiente/espera/programada/atendida/otro). */
  bucket?: EstadoBucket;
  /** Requerido cuando indicator === "maquina": valor exacto de MAQUINA. */
  maquina?: string;
  /** Requerido cuando indicator === "responsable": "MANTENIMIENTO" | "PRODUCCION" | RESPONSIBLE_AREA_UNDEFINED_VALUE. */
  responsable?: string;
  /** indicator === "operario" con CODEMPLE disponible: valor exacto de CODEMPLE (identificador estable). */
  codemple?: string;
  /** indicator === "operario" SIN CODEMPLE: EMPLEADO real de ese grupo (se compara normalizado, igual que getOperatorDistributionForPeriod). */
  empleado?: string;
  /** indicator === "operario" para el grupo "Sin definir" (sin CODEMPLE ni EMPLEADO). */
  operarioSinDefinir?: boolean;
  take?: number;
  skip?: number;
}

export interface IndicatorRequestRow {
  id: string;
  parte: string;
  maquina: string | null;
  estado: string | null;
  problema: string | null;
  tarea: string | null;
  fecha: Date | null;
  responsibleArea: MaintenanceRequestResponsibleArea | null;
  /** CODEMPLE/EMPLEADO crudos — quién REGISTRÓ la solicitud (operario), no el técnico asignado. */
  codemple: string | null;
  empleado: string | null;
  /** Nombres de técnicos con asignación activa (removedAt = null), si los hay. */
  technicianNames: string[];
}

export interface IndicatorRequestsPage {
  items: IndicatorRequestRow[];
  total: number;
  /** Solo presente para indicator === "pctAtendidas": total de solicitudes del período (todas, no solo atendidas). */
  periodTotal?: number;
  /** Solo presente para indicator === "pctAtendidas": mismo cálculo que el KPI (atendidas/periodTotal). */
  percentage?: number;
}

const INDICATOR_REQUEST_SELECT = {
  id: true,
  parte: true,
  maquina: true,
  estado: true,
  problema: true,
  tarea: true,
  fecha: true,
  responsibleArea: true,
  codemple: true,
  empleado: true,
  assignedTechnicians: {
    where: { removedAt: null },
    select: { technician: { select: { fullName: true } } },
  },
} satisfies Prisma.MaintenanceRequestSelect;

type RawIndicatorRequestRow = Prisma.MaintenanceRequestGetPayload<{
  select: typeof INDICATOR_REQUEST_SELECT;
}>;

function toIndicatorRequestRow(row: RawIndicatorRequestRow): IndicatorRequestRow {
  return {
    id: row.id,
    parte: row.parte,
    maquina: row.maquina,
    estado: row.estado,
    problema: row.problema,
    tarea: row.tarea,
    fecha: row.fecha,
    responsibleArea: row.responsibleArea,
    codemple: row.codemple,
    empleado: row.empleado,
    technicianNames: row.assignedTechnicians.map((assignment) => assignment.technician.fullName),
  };
}

async function findIndicatorPage(
  where: Prisma.MaintenanceRequestWhereInput,
  take: number,
  skip: number,
  order: "asc" | "desc" = "desc",
): Promise<{ items: IndicatorRequestRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.maintenanceRequest.findMany({
      where,
      select: INDICATOR_REQUEST_SELECT,
      orderBy: { fecha: order },
      take,
      skip,
    }),
    db.maintenanceRequest.count({ where }),
  ]);
  return { items: rows.map(toIndicatorRequestRow), total };
}

/**
 * ids de Solicitudes del período cuyo operario (CODEMPLE/EMPLEADO) coincide
 * con el grupo pedido — MISMA normalización que getOperatorDistributionForPeriod,
 * para que el ranking y el modal describan exactamente el mismo universo
 * (una fila con CODEMPLE nunca se compara por nombre, y sin CODEMPLE se
 * compara por EMPLEADO normalizado, no por igualdad exacta de texto).
 */
async function getOperatorRequestIds(
  start: Date,
  end: Date,
  target: { codemple?: string; empleado?: string; operarioSinDefinir?: boolean },
): Promise<string[]> {
  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { gte: start, lt: end } },
    select: { id: true, codemple: true, empleado: true },
  });

  const ids: string[] = [];
  for (const row of rows) {
    const codemple = row.codemple?.trim() || null;
    const empleado = row.empleado?.trim() || null;

    if (target.codemple) {
      if (codemple === target.codemple) ids.push(row.id);
    } else if (target.empleado) {
      if (!codemple && empleado && normalizeOperatorName(empleado) === normalizeOperatorName(target.empleado)) {
        ids.push(row.id);
      }
    } else if (target.operarioSinDefinir) {
      if (!codemple && !empleado) ids.push(row.id);
    }
  }
  return ids;
}

/**
 * Detalle de un indicador de /indicadores: la fuente única para el modal
 * interactivo. No cambia ninguna regla de cálculo — cada rama arma
 * exactamente el mismo WHERE que ya usa el indicador equivalente en esta
 * misma página (getPeriodStats, getEstadoWhereForBucket,
 * getNonAtendidaEstadoWhere, getClosedRequestIdsForPeriod, el filtro de
 * Responsable de listMaintenanceRequests, la normalización de
 * getOperatorDistributionForPeriod).
 */
export async function getIndicatorRequests(
  params: GetIndicatorRequestsParams,
): Promise<IndicatorRequestsPage> {
  const {
    indicator,
    year,
    month,
    bucket,
    maquina,
    responsable,
    codemple,
    empleado,
    operarioSinDefinir,
    take = 20,
    skip = 0,
  } = params;
  // Sin `month`: año calendario completo (modo "Año actual") — misma
  // composición de getPeriodRange que usa getYearPeriodRange, nunca una
  // segunda lógica de fechas.
  const { start, end } = month !== undefined ? getPeriodRange(year, month) : getYearPeriodRange(year);
  const periodWhere: Prisma.MaintenanceRequestWhereInput = { fecha: { gte: start, lt: end } };

  switch (indicator) {
    case "solicitudes":
      return findIndicatorPage(periodWhere, take, skip);

    case "estado": {
      if (!bucket) throw new Error("getIndicatorRequests: falta 'bucket' para indicator 'estado'.");
      const estadoWhere = await getEstadoWhereForBucket(bucket);
      return findIndicatorPage({ ...periodWhere, ...estadoWhere }, take, skip);
    }

    case "pctAtendidas": {
      const estadoWhere = await getEstadoWhereForBucket("atendida");
      const [page, periodTotal] = await Promise.all([
        findIndicatorPage({ ...periodWhere, ...estadoWhere }, take, skip),
        db.maintenanceRequest.count({ where: periodWhere }),
      ]);
      const percentage = periodTotal > 0 ? Math.round((page.total / periodTotal) * 100) : 0;
      return { ...page, periodTotal, percentage };
    }

    case "cerradas": {
      const ids = await getClosedRequestIdsForPeriod(start, end);
      const total = ids.length;
      const pageIds = ids.slice(skip, skip + take);
      if (pageIds.length === 0) return { items: [], total };
      const rows = await db.maintenanceRequest.findMany({
        where: { id: { in: pageIds } },
        select: INDICATOR_REQUEST_SELECT,
      });
      const rowById = new Map(rows.map((row) => [row.id, row]));
      // Se preserva el orden de `pageIds` (cierre más reciente primero), no el orden de la consulta.
      const items = pageIds
        .map((id) => rowById.get(id))
        .filter((row): row is RawIndicatorRequestRow => Boolean(row))
        .map(toIndicatorRequestRow);
      return { items, total };
    }

    case "backlog": {
      const estadoWhere = await getNonAtendidaEstadoWhere();
      // Más antiguas primero — mismo criterio que listBacklogMaintenanceRequests (Dashboard).
      return findIndicatorPage({ fecha: { lt: start }, ...estadoWhere }, take, skip, "asc");
    }

    case "backlogOver7":
    case "backlogOver15":
    case "backlogOver30": {
      const days = indicator === "backlogOver7" ? 7 : indicator === "backlogOver15" ? 15 : 30;
      const estadoWhere = await getNonAtendidaEstadoWhere();
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return findIndicatorPage({ fecha: { lt: cutoff }, ...estadoWhere }, take, skip, "asc");
    }

    case "maquina": {
      if (!maquina) throw new Error("getIndicatorRequests: falta 'maquina' para indicator 'maquina'.");
      return findIndicatorPage({ ...periodWhere, maquina }, take, skip);
    }

    case "responsable": {
      const responsableWhere: Prisma.MaintenanceRequestWhereInput =
        responsable === RESPONSIBLE_AREA_UNDEFINED_VALUE
          ? { responsibleArea: null }
          : responsable === "MANTENIMIENTO" || responsable === "PRODUCCION"
            ? { responsibleArea: responsable }
            : {};
      return findIndicatorPage({ ...periodWhere, ...responsableWhere }, take, skip);
    }

    case "operario": {
      const ids = await getOperatorRequestIds(start, end, { codemple, empleado, operarioSinDefinir });
      return findIndicatorPage({ id: { in: ids } }, take, skip);
    }

    case "totalAbierto": {
      // "Estado actual de la operación": ESTADO != Realizado, SIN filtro de
      // FECHA — mismo universo que getOpenBucketCounts().totalAbiertas
      // (maintenance-requests.service.ts), nunca una definición aparte.
      const estadoWhere = await getNonAtendidaEstadoWhere();
      return findIndicatorPage(estadoWhere, take, skip);
    }

    case "estadoActual": {
      if (!bucket) throw new Error("getIndicatorRequests: falta 'bucket' para indicator 'estadoActual'.");
      // Mismo bucket que "estado", pero SIN periodWhere — la contraparte de
      // getOpenBucketCounts() para un bucket específico (Pendientes/En
      // espera/Programadas de "Estado actual de la operación").
      const estadoWhere = await getEstadoWhereForBucket(bucket);
      return findIndicatorPage(estadoWhere, take, skip);
    }

    default: {
      const exhaustiveCheck: never = indicator;
      throw new Error(`getIndicatorRequests: indicador no soportado: ${exhaustiveCheck}`);
    }
  }
}
