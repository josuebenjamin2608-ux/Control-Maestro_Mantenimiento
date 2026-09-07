import { db } from "@/lib/db";

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
  take?: number;
  skip?: number;
}

export async function listMaintenanceRequests(params: ListMaintenanceRequestsParams = {}) {
  const { search, take = 50, skip = 0 } = params;
  const trimmedSearch = search?.trim();

  const where = trimmedSearch
    ? {
        OR: [
          { parte: { contains: trimmedSearch, mode: "insensitive" as const } },
          { maquina: { contains: trimmedSearch, mode: "insensitive" as const } },
          { problema: { contains: trimmedSearch, mode: "insensitive" as const } },
        ],
      }
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
