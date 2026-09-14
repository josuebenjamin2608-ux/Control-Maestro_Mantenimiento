import { db } from "@/lib/db";
import { classifyEstado, ESTADO_BUCKET_PRIORITY, type EstadoBucket } from "@/lib/estado";
import type { Prisma } from "@/generated/prisma/client";

export function getMaintenanceRequestByParte(parte: string) {
  return db.maintenanceRequest.findUnique({
    where: { parte },
    include: {
      logs: { orderBy: { fechaini: "asc" } },
    },
  });
}

export interface ListMaintenanceRequestsParams {
  search?: string;
  /** Filtra por valor exacto de `maquina` (uno de los devueltos por getDistinctMachines). */
  maquina?: string;
  /** Filtra por valor exacto de `estado` (uno de los devueltos por getDistinctEstados). */
  estado?: string;
  take?: number;
  skip?: number;
}

export async function listMaintenanceRequests(params: ListMaintenanceRequestsParams = {}) {
  const { search, maquina, estado, take = 50, skip = 0 } = params;
  const trimmedSearch = search?.trim();

  const conditions: Prisma.MaintenanceRequestWhereInput[] = [];
  if (trimmedSearch) {
    conditions.push({
      OR: [
        { parte: { contains: trimmedSearch, mode: "insensitive" } },
        { maquina: { contains: trimmedSearch, mode: "insensitive" } },
        { problema: { contains: trimmedSearch, mode: "insensitive" } },
      ],
    });
  }
  if (maquina) conditions.push({ maquina });
  if (estado) conditions.push({ estado });

  const where: Prisma.MaintenanceRequestWhereInput | undefined = conditions.length
    ? { AND: conditions }
    : undefined;

  const [items, total] = await Promise.all([
    db.maintenanceRequest.findMany({
      where,
      orderBy: { fecha: "desc" },
      take,
      skip,
      include: { _count: { select: { logs: true } } },
    }),
    db.maintenanceRequest.count({ where }),
  ]);

  return { items, total };
}

/** Valores reales de MAQUINA presentes en las solicitudes, para el filtro. */
export async function getDistinctMachines(): Promise<string[]> {
  const rows = await db.maintenanceRequest.findMany({
    where: { maquina: { not: null } },
    select: { maquina: true },
    distinct: ["maquina"],
    orderBy: { maquina: "asc" },
  });
  return rows.map((row) => row.maquina).filter((value): value is string => Boolean(value));
}

/** Valores reales de ESTADO presentes en las solicitudes, para el filtro (texto crudo del Excel). */
export async function getDistinctEstados(): Promise<string[]> {
  const rows = await db.maintenanceRequest.findMany({
    where: { estado: { not: null } },
    select: { estado: true },
    distinct: ["estado"],
    orderBy: { estado: "asc" },
  });
  return rows.map((row) => row.estado).filter((value): value is string => Boolean(value));
}

export interface DashboardStats {
  total: number;
  pendientes: number;
  espera: number;
  programadas: number;
  atendidas: number;
  /** ESTADOs que no calzaron con ninguna palabra clave conocida (ver classifyEstado). */
  otros: number;
}

/**
 * Cuenta solicitudes reales agrupadas por ESTADO (una sola consulta) y las
 * clasifica en el servidor usando `classifyEstado` — mismo texto real,
 * agrupado por la heurística de palabras clave, no valores inventados.
 */
export async function getDashboardStats(sinceDays?: number): Promise<DashboardStats> {
  const where: Prisma.MaintenanceRequestWhereInput | undefined = sinceDays
    ? { fecha: { gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) } }
    : undefined;

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

export interface OperationalRequestsParams {
  /** Si se omite, se prioriza el orden de ESTADO_BUCKET_PRIORITY (no resueltas primero). */
  bucket?: EstadoBucket;
  sinceDays?: number;
  take?: number;
}

/**
 * Listado operativo para el dashboard: usa `classifyEstado` (la misma
 * clasificación que `getDashboardStats`) para agrupar por bucket, así los
 * contadores de los KPI y las filas que muestra el filtro nunca divergen.
 *
 * Sin `bucket`, recorre ESTADO_BUCKET_PRIORITY (pendiente > espera >
 * programada > otro > atendida) y va completando `take` con las solicitudes
 * más recientes de cada grupo — nunca usa `isHistorical` para ordenar, ya
 * que ese flag describe el contexto de importación, no la antigüedad real
 * de la solicitud (que viene de `fecha`).
 */
export async function listOperationalMaintenanceRequests(params: OperationalRequestsParams = {}) {
  const { bucket, sinceDays, take = 8 } = params;

  const dateWhere: Prisma.MaintenanceRequestWhereInput | undefined = sinceDays
    ? { fecha: { gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) } }
    : undefined;

  const distinctEstados = await getDistinctEstados();
  const estadosByBucket = new Map<EstadoBucket, string[]>();
  for (const estado of distinctEstados) {
    const { bucket: estadoBucket } = classifyEstado(estado);
    const list = estadosByBucket.get(estadoBucket) ?? [];
    list.push(estado);
    estadosByBucket.set(estadoBucket, list);
  }

  async function fetchBucket(targetBucket: EstadoBucket, limit: number) {
    if (limit <= 0) return [];
    const estados = estadosByBucket.get(targetBucket) ?? [];

    let estadoWhere: Prisma.MaintenanceRequestWhereInput;
    if (targetBucket === "otro") {
      // "otro" también incluye solicitudes con ESTADO vacío (ver classifyEstado).
      estadoWhere =
        estados.length > 0 ? { OR: [{ estado: { in: estados } }, { estado: null }] } : { estado: null };
    } else {
      if (estados.length === 0) return [];
      estadoWhere = { estado: { in: estados } };
    }

    return db.maintenanceRequest.findMany({
      where: { ...(dateWhere ?? {}), ...estadoWhere },
      orderBy: { fecha: "desc" },
      take: limit,
      include: { _count: { select: { logs: true } } },
    });
  }

  if (bucket) {
    return fetchBucket(bucket, take);
  }

  const results: Awaited<ReturnType<typeof fetchBucket>> = [];
  for (const priorityBucket of ESTADO_BUCKET_PRIORITY) {
    if (results.length >= take) break;
    const rows = await fetchBucket(priorityBucket, take - results.length);
    results.push(...rows);
  }
  return results;
}

export function listImportBatches(take = 20) {
  return db.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { importedBy: { select: { name: true } } },
  });
}

/** Últimas novedades para el dashboard: la carga más reciente de cada tipo. */
export async function getLatestNovedades() {
  const [latestRequestBatch, latestLogBatch] = await Promise.all([
    db.importBatch.findFirst({
      where: { fileType: "MAINTENANCE_REQUEST" },
      orderBy: { createdAt: "desc" },
    }),
    db.importBatch.findFirst({
      where: { fileType: "MAINTENANCE_LOG" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { latestRequestBatch, latestLogBatch };
}

/** Timestamp real de la última importación (de cualquier tipo), para el header. */
export async function getHeaderStatus() {
  const latestBatch = await db.importBatch.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return { lastUpdateAt: latestBatch?.createdAt ?? null };
}

export interface MinutasSummary {
  total: number;
  related: number;
  pending: number;
  /** UNRELATED: incluye tanto minutas históricas como sin PARTE en OBSERVACIONES. */
  unrelated: number;
}

/** Conteo real de minutas agrupado por relationStatus, para el dashboard. */
export async function getMinutasSummary(): Promise<MinutasSummary> {
  const grouped = await db.maintenanceLog.groupBy({
    by: ["relationStatus"],
    _count: { _all: true },
  });

  const summary: MinutasSummary = { total: 0, related: 0, pending: 0, unrelated: 0 };
  for (const group of grouped) {
    const count = group._count._all;
    summary.total += count;
    if (group.relationStatus === "RELATED") summary.related += count;
    else if (group.relationStatus === "PENDING") summary.pending += count;
    else summary.unrelated += count;
  }
  return summary;
}

export interface ListMaintenanceLogsParams {
  search?: string;
  take?: number;
  skip?: number;
}

export async function listMaintenanceLogs(params: ListMaintenanceLogsParams = {}) {
  const { search, take = 50, skip = 0 } = params;
  const trimmedSearch = search?.trim();

  const where: Prisma.MaintenanceLogWhereInput | undefined = trimmedSearch
    ? {
        OR: [
          { registro: { contains: trimmedSearch, mode: "insensitive" } },
          { maquina: { contains: trimmedSearch, mode: "insensitive" } },
          { empleado: { contains: trimmedSearch, mode: "insensitive" } },
          { parteRaw: { contains: trimmedSearch, mode: "insensitive" } },
        ],
      }
    : undefined;

  const [items, total] = await Promise.all([
    db.maintenanceLog.findMany({
      where,
      orderBy: { fechaini: "desc" },
      take,
      skip,
      include: { maintenanceRequest: { select: { parte: true } } },
    }),
    db.maintenanceLog.count({ where }),
  ]);

  return { items, total };
}
