import { db } from "@/lib/db";
import { classifyEstado, ESTADO_BUCKET_PRIORITY, type EstadoBucket } from "@/lib/estado";
import type { ImportFileType, Prisma } from "@/generated/prisma/client";

export function getMaintenanceRequestByParte(parte: string) {
  return db.maintenanceRequest.findUnique({
    where: { parte },
    include: {
      logs: { orderBy: { fechaini: "asc" } },
      assignedTechnicians: {
        include: { technician: true },
        orderBy: { assignedAt: "asc" },
      },
    },
  });
}

/** Técnicos activos reales, para el selector de asignación. Nunca inventa técnicos. */
export function listTechnicians() {
  return db.technician.findMany({
    where: { isActive: true },
    orderBy: { fullName: "asc" },
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

export interface MachineDistributionItem {
  maquina: string;
  count: number;
}

/** Máquinas con más solicitudes reales (columna MAQUINA), para Indicadores. */
export async function getMachineDistribution(limit = 8): Promise<MachineDistributionItem[]> {
  const grouped = await db.maintenanceRequest.groupBy({
    by: ["maquina"],
    where: { maquina: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { maquina: "desc" } },
    take: limit,
  });
  return grouped
    .filter((group) => group.maquina)
    .map((group) => ({ maquina: group.maquina as string, count: group._count._all }));
}

export interface MonthlyRequestCount {
  /** "YYYY-MM" */
  month: string;
  count: number;
}

/**
 * Conteo real de solicitudes por mes según FECHA (la fecha de la solicitud,
 * no la fecha de importación). Se agrupa en memoria: Prisma no soporta un
 * GROUP BY truncado por mes de forma portable sin SQL crudo, y el volumen de
 * filas es manejable para este cálculo puntual de Indicadores.
 */
export async function getMonthlyRequestCounts(months = 12): Promise<MonthlyRequestCount[]> {
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  since.setMonth(since.getMonth() - (months - 1));

  const rows = await db.maintenanceRequest.findMany({
    where: { fecha: { gte: since } },
    select: { fecha: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.fecha) continue;
    const key = `${row.fecha.getFullYear()}-${String(row.fecha.getMonth() + 1).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: MonthlyRequestCount[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    result.push({ month: key, count: counts.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
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
  /** Sin definir = sin límite (trae todas las filas que cumplan el filtro). */
  take?: number;
  /**
   * Solo aplica cuando no hay `bucket`: excluye "atendida" del listado por
   * defecto ("Solicitudes que requieren atención" nunca muestra Realizado).
   * El KPI Total (`bucket` ausente pero solicitado explícitamente como
   * "todas" por el caller) sigue mostrando todo pasando `false`.
   */
  excludeAtendida?: boolean;
}

/**
 * Listado operativo para el dashboard: usa `classifyEstado` (la misma
 * clasificación que `getDashboardStats`) para agrupar por bucket, así los
 * contadores de los KPI y las filas que muestra el filtro nunca divergen.
 * El bucket "atendida" corresponde exactamente (y únicamente) a
 * ESTADO = "Realizado" (comparación normalizada, ver classifyEstado) — por
 * eso `excludeAtendida` implementa la regla "ESTADO != Realizado" de forma
 * genérica: cualquier otro valor de ESTADO, conocido o no, cae en algún
 * bucket que SÍ se incluye (los desconocidos van a "otro").
 *
 * Sin `bucket`, recorre ESTADO_BUCKET_PRIORITY (pendiente > espera >
 * programada > otro > atendida) y va completando `take` con las solicitudes
 * más recientes de cada grupo — nunca usa `isHistorical` para ordenar, ya
 * que ese flag describe el contexto de importación, no la antigüedad real
 * de la solicitud (que viene de `fecha`). Sin `take`, no hay límite: trae
 * TODAS las filas de cada bucket incluido.
 */
export async function listOperationalMaintenanceRequests(params: OperationalRequestsParams = {}) {
  const { bucket, sinceDays, take, excludeAtendida = false } = params;

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

  async function fetchBucket(targetBucket: EstadoBucket, limit: number | undefined) {
    if (limit !== undefined && limit <= 0) return [];
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
      ...(limit !== undefined ? { take: limit } : {}),
      include: { _count: { select: { logs: true } } },
    });
  }

  if (bucket) {
    return fetchBucket(bucket, take);
  }

  const priority = excludeAtendida
    ? ESTADO_BUCKET_PRIORITY.filter((b) => b !== "atendida")
    : ESTADO_BUCKET_PRIORITY;

  const results: Awaited<ReturnType<typeof fetchBucket>> = [];
  for (const priorityBucket of priority) {
    if (take !== undefined && results.length >= take) break;
    const rows = await fetchBucket(priorityBucket, take !== undefined ? take - results.length : undefined);
    results.push(...rows);
  }
  return results;
}

const BUCKET_STATS_KEY: Record<EstadoBucket, keyof Omit<DashboardStats, "total">> = {
  pendiente: "pendientes",
  espera: "espera",
  programada: "programadas",
  atendida: "atendidas",
  otro: "otros",
};

/** Único punto de acceso bucket -> valor de DashboardStats (dashboard e Indicadores comparten esto). */
export function getBucketStatValue(stats: DashboardStats, bucket: EstadoBucket): number {
  return stats[BUCKET_STATS_KEY[bucket]];
}

export function listImportBatches(take = 20) {
  return db.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { importedBy: { select: { name: true } } },
  });
}

export interface NotificationItem {
  id: string;
  type: "import" | "import_error" | "technician_assigned";
  message: string;
  detail?: string;
  createdAt: Date;
  href: string;
}

const IMPORT_FILE_NOUN: Record<ImportFileType, string> = {
  MAINTENANCE_REQUEST: "solicitudes",
  MAINTENANCE_LOG: "minutas",
};

/**
 * Notificaciones reales derivadas de ImportBatch/ImportRequestResult y de
 * MaintenanceRequestTechnician — no existe una tabla de notificaciones
 * propia, así que nunca se puede "inventar" una. El histórico inicial
 * (isHistorical = true) queda excluido explícitamente para no generar una
 * avalancha de notificaciones de "nuevas solicitudes" por datos que ya
 * existían antes de usar el sistema.
 */
export async function getNotifications(limit = 20): Promise<NotificationItem[]> {
  const [batches, assignments] = await Promise.all([
    db.importBatch.findMany({
      where: { isHistorical: false },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.maintenanceRequestTechnician.findMany({
      orderBy: { assignedAt: "desc" },
      take: limit,
      include: {
        technician: { select: { fullName: true } },
        maintenanceRequest: { select: { parte: true } },
      },
    }),
  ]);

  const items: NotificationItem[] = [];

  for (const batch of batches) {
    const noun = IMPORT_FILE_NOUN[batch.fileType];

    if (batch.errorCount > 0) {
      items.push({
        id: `batch-error-${batch.id}`,
        type: "import_error",
        message: `La importación de ${noun} tuvo ${batch.errorCount} error${batch.errorCount === 1 ? "" : "es"}`,
        detail: batch.fileName,
        createdAt: batch.createdAt,
        href: "/importaciones",
      });
    }

    if (batch.fileType === "MAINTENANCE_REQUEST") {
      const parts: string[] = [];
      if (batch.newCount) parts.push(`${batch.newCount} nueva${batch.newCount === 1 ? "" : "s"}`);
      if (batch.modifiedCount)
        parts.push(`${batch.modifiedCount} actualizada${batch.modifiedCount === 1 ? "" : "s"}`);
      if (parts.length > 0) {
        items.push({
          id: `batch-${batch.id}`,
          type: "import",
          message: `Se importaron solicitudes: ${parts.join(", ")}`,
          detail: batch.fileName,
          createdAt: batch.createdAt,
          href: "/solicitudes",
        });
      }
    } else if (batch.newCount) {
      items.push({
        id: `batch-${batch.id}`,
        type: "import",
        message: `Se importaron ${batch.newCount} minuta${batch.newCount === 1 ? "" : "s"} nueva${batch.newCount === 1 ? "" : "s"}`,
        detail: batch.fileName,
        createdAt: batch.createdAt,
        href: "/minutas",
      });
    }
  }

  for (const assignment of assignments) {
    items.push({
      id: `assignment-${assignment.id}`,
      type: "technician_assigned",
      message: `Se asignó a ${assignment.technician.fullName} en la solicitud ${assignment.maintenanceRequest.parte}`,
      createdAt: assignment.assignedAt,
      href: `/solicitudes/${encodeURIComponent(assignment.maintenanceRequest.parte)}`,
    });
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items.slice(0, limit);
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
