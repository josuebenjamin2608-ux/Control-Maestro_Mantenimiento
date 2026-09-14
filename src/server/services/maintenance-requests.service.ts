import { db } from "@/lib/db";
import { classifyEstado } from "@/lib/estado";
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
