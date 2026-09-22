import { db } from "@/lib/db";
import { classifyEstado, ESTADO_BUCKET_PRIORITY, type EstadoBucket } from "@/lib/estado";
import { formatParteDisplay } from "@/lib/parte";
import { RESPONSIBLE_AREA_UNDEFINED_VALUE } from "@/lib/responsible-area";
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
  /**
   * Filtra por área responsable: "MANTENIMIENTO" / "PRODUCCION" (valor
   * exacto del enum) o RESPONSIBLE_AREA_UNDEFINED_VALUE ("Sin definir" ->
   * responsibleArea = null). Cualquier otro valor se ignora.
   */
  responsable?: string;
  take?: number;
  skip?: number;
}

export async function listMaintenanceRequests(params: ListMaintenanceRequestsParams = {}) {
  const { search, maquina, estado, responsable, take = 50, skip = 0 } = params;
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
  if (responsable === RESPONSIBLE_AREA_UNDEFINED_VALUE) {
    conditions.push({ responsibleArea: null });
  } else if (responsable === "MANTENIMIENTO" || responsable === "PRODUCCION") {
    conditions.push({ responsibleArea: responsable });
  }

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

// DashboardStats y getBucketStatValue viven en lib/estado.ts (no acá): son
// puros/sin dependencia de Prisma, y componentes CLIENTE (p. ej. las
// tarjetas interactivas de /indicadores) necesitan importarlos sin arrastrar
// el cliente de base de datos (pg) al bundle del navegador. Se re-exportan
// acá para no romper el resto del código de servidor que ya los importa
// desde este archivo.
export type { DashboardStats } from "@/lib/estado";
export { getBucketStatValue } from "@/lib/estado";

/**
 * Where-clause real para "ESTADO != Realizado": construida a partir de los
 * valores DISTINCT de ESTADO realmente presentes (vía classifyEstado), nunca
 * de una lista inventada. Única fuente de verdad de "abierta" compartida por
 * el Dashboard (listOperationalMaintenanceRequests/getOpenBucketCounts) e
 * Indicadores (getBacklogBeforePeriod/getBacklogAgeBuckets en
 * indicators.service.ts), para no mantener dos definiciones que puedan
 * divergir.
 */
export async function getNonAtendidaEstadoWhere(): Promise<Prisma.MaintenanceRequestWhereInput> {
  const distinctEstados = await getDistinctEstados();
  const nonAtendida = distinctEstados.filter((estado) => classifyEstado(estado).bucket !== "atendida");
  // "otro" (estado null) también cuenta como no resuelta.
  return nonAtendida.length > 0
    ? { OR: [{ estado: { in: nonAtendida } }, { estado: null }] }
    : { estado: null };
}

/**
 * Where-clause real para UN bucket específico de classifyEstado (pendiente,
 * espera, programada, atendida u otro), construida igual que
 * getNonAtendidaEstadoWhere: a partir de los valores DISTINCT de ESTADO
 * realmente presentes, nunca de una lista inventada. Si ningún ESTADO real
 * cae en ese bucket, `estado: { in: [] }` no matchea ninguna fila — mismo
 * resultado (0) que mostraría el KPI. Fuente única reutilizada por
 * `getIndicatorRequests` (indicators.service.ts) para que el detalle del
 * modal de cada KPI por estado coincida exactamente con su conteo.
 */
export async function getEstadoWhereForBucket(
  bucket: EstadoBucket,
): Promise<Prisma.MaintenanceRequestWhereInput> {
  const distinctEstados = await getDistinctEstados();
  const matching = distinctEstados.filter((estado) => classifyEstado(estado).bucket === bucket);
  if (bucket === "otro") {
    // "otro" también incluye solicitudes con ESTADO vacío (ver classifyEstado).
    return matching.length > 0 ? { OR: [{ estado: { in: matching } }, { estado: null }] } : { estado: null };
  }
  return { estado: { in: matching } };
}

export interface OperationalRequestsParams {
  /** Si se omite, se prioriza el orden de ESTADO_BUCKET_PRIORITY (no resueltas primero). */
  bucket?: EstadoBucket;
  /**
   * [start, end) UTC del período a filtrar por FECHA (ver getPeriodRange en
   * src/lib/period.ts). Sin esto, no filtra por fecha (todo el histórico) —
   * el Dashboard siempre lo pasa; solo queda opcional para no romper otros
   * usos futuros de este listado que no necesiten acotar por período.
   */
  period?: { start: Date; end: Date };
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
 * clasificación que `getPeriodStats` en indicators.service.ts) para agrupar
 * por bucket, así los contadores de los KPI y las filas que muestra el
 * filtro nunca divergen. El bucket "atendida" corresponde exactamente (y
 * únicamente) a ESTADO = "Realizado" (comparación normalizada, ver
 * classifyEstado) — por eso `excludeAtendida` implementa la regla
 * "ESTADO != Realizado" de forma genérica: cualquier otro valor de ESTADO,
 * conocido o no, cae en algún bucket que SÍ se incluye (los desconocidos
 * van a "otro").
 *
 * Sin `bucket`, recorre ESTADO_BUCKET_PRIORITY (pendiente > espera >
 * programada > otro > atendida) y va completando `take` con las solicitudes
 * más recientes de cada grupo — nunca usa `isHistorical` para ordenar, ya
 * que ese flag describe el contexto de importación, no la antigüedad real
 * de la solicitud (que viene de `fecha`). Sin `take`, no hay límite: trae
 * TODAS las filas de cada bucket incluido.
 */
export async function listOperationalMaintenanceRequests(params: OperationalRequestsParams = {}) {
  const { bucket, period, take, excludeAtendida = false } = params;

  const dateWhere: Prisma.MaintenanceRequestWhereInput | undefined = period
    ? { fecha: { gte: period.start, lt: period.end } }
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

export interface OpenBucketCounts {
  /** Suma de los 4 buckets de abajo — todas las solicitudes con ESTADO != Realizado. */
  totalAbiertas: number;
  pendientes: number;
  espera: number;
  programadas: number;
  otros: number;
}

/**
 * Conteo de solicitudes ABIERTAS (ESTADO != Realizado) por bucket, SIN
 * filtro de FECHA — el estado operativo real actual del Panel de control:
 * una solicitud abierta de julio sigue contando en septiembre mientras no
 * pase a Realizado. A diferencia de `getPeriodStats` (indicators.service.ts,
 * usado por /indicadores), esto es intencionalmente independiente del
 * período seleccionado. No incluye "atendidas": esa sigue siendo una
 * métrica del período (cuántas se completaron ESE mes), no un conteo de
 * "abiertas".
 */
export async function getOpenBucketCounts(): Promise<OpenBucketCounts> {
  const grouped = await db.maintenanceRequest.groupBy({
    by: ["estado"],
    _count: { _all: true },
  });

  const counts: OpenBucketCounts = { totalAbiertas: 0, pendientes: 0, espera: 0, programadas: 0, otros: 0 };
  for (const group of grouped) {
    const { bucket } = classifyEstado(group.estado);
    if (bucket === "atendida") continue;
    const count = group._count._all;
    counts.totalAbiertas += count;
    if (bucket === "pendiente") counts.pendientes += count;
    else if (bucket === "espera") counts.espera += count;
    else if (bucket === "programada") counts.programadas += count;
    else counts.otros += count;
  }
  return counts;
}

export interface ResponsibleAreaSummary {
  mantenimiento: number;
  produccion: number;
  /** responsibleArea = null. */
  sinDefinir: number;
}

/**
 * Solicitudes ABIERTAS (ESTADO != Realizado, misma clasificación de
 * classifyEstado que el resto del sistema) agrupadas por área responsable,
 * para el resumen del Dashboard. Responsable es independiente del ESTADO y
 * del técnico asignado: esto solo cuenta cuántas solicitudes no resueltas
 * le corresponden a cada área. Deliberadamente NO se acota por período: es
 * un snapshot del backlog actual por área, no un indicador del mes.
 */
export async function getOpenRequestsByResponsibleArea(): Promise<ResponsibleAreaSummary> {
  const grouped = await db.maintenanceRequest.groupBy({
    by: ["estado", "responsibleArea"],
    _count: { _all: true },
  });

  const summary: ResponsibleAreaSummary = { mantenimiento: 0, produccion: 0, sinDefinir: 0 };
  for (const group of grouped) {
    if (classifyEstado(group.estado).bucket === "atendida") continue;
    const count = group._count._all;
    if (group.responsibleArea === "MANTENIMIENTO") summary.mantenimiento += count;
    else if (group.responsibleArea === "PRODUCCION") summary.produccion += count;
    else summary.sinDefinir += count;
  }
  return summary;
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
      message: `Se asignó a ${assignment.technician.fullName} en la solicitud ${formatParteDisplay(assignment.maintenanceRequest.parte)}`,
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
