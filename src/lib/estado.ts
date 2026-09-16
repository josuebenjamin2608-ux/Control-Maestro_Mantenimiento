import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export type EstadoBucket = "pendiente" | "espera" | "programada" | "atendida" | "otro";

export interface EstadoClassification {
  bucket: EstadoBucket;
  /** Texto original de ESTADO, sin modificar (o "Sin estado" si viene vacío). */
  label: string;
  variant: BadgeVariant;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Minúsculas, sin acentos, sin espacios repetidos — robusto ante variaciones de formato. */
function normalizeEstado(value: string): string {
  return stripDiacritics(value.trim().toLowerCase()).replace(/\s+/g, " ");
}

/**
 * Clasificación centralizada ESTADO -> bucket. Son los únicos valores reales
 * conocidos del vocabulario de mantenimiento (ver especificación del
 * dashboard); cualquier otro valor real cae en "otro" — nunca se inventan
 * estados nuevos ni se usa "otro" como cajón de sastre para estos 5.
 */
const ESTADO_BUCKET_MAP: Record<string, EstadoBucket> = {
  solicitado: "pendiente",
  "en espera": "espera",
  programado: "programada",
  "en ejecucion": "programada",
  realizado: "atendida",
};

export const ESTADO_BUCKET_LABELS: Record<EstadoBucket, string> = {
  pendiente: "Pendientes",
  espera: "En espera",
  programada: "Programadas / en ejecución",
  atendida: "Atendidas",
  otro: "Otros",
};

const ESTADO_BUCKET_VARIANTS: Record<EstadoBucket, BadgeVariant> = {
  pendiente: "destructive",
  espera: "warning",
  programada: "default",
  atendida: "success",
  otro: "outline",
};

/** Orden en el que deben priorizarse los buckets cuando no hay un filtro específico: no resueltas primero. */
export const ESTADO_BUCKET_PRIORITY: EstadoBucket[] = [
  "pendiente",
  "espera",
  "programada",
  "otro",
  "atendida",
];

/**
 * ESTADO es texto libre proveniente del Excel importado — el sistema no
 * define un enum propio para este campo (ver prisma/schema.prisma). Esta
 * función clasifica ese texto REAL en un bucket/color visual mediante una
 * comparación exacta (normalizada) contra el vocabulario conocido; nunca
 * inventa ni reemplaza el valor original (`label` siempre es el texto tal
 * cual vino del archivo). Un texto que no coincide exactamente con ninguno
 * de los 5 valores conocidos cae en "otro", mostrado tal cual con estilo
 * neutro. Es la fuente única de verdad: tanto los conteos de KPI como los
 * filtros de la tabla de Solicitudes usan esta misma función.
 */
export function classifyEstado(estado: string | null | undefined): EstadoClassification {
  const raw = estado?.trim();
  if (!raw) {
    return { bucket: "otro", label: "Sin estado", variant: "outline" };
  }

  const bucket = ESTADO_BUCKET_MAP[normalizeEstado(raw)] ?? "otro";
  return { bucket, label: raw, variant: ESTADO_BUCKET_VARIANTS[bucket] };
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

const BUCKET_STATS_KEY: Record<EstadoBucket, keyof Omit<DashboardStats, "total">> = {
  pendiente: "pendientes",
  espera: "espera",
  programada: "programadas",
  atendida: "atendidas",
  otro: "otros",
};

/**
 * Único punto de acceso bucket -> valor de DashboardStats (Dashboard e
 * Indicadores comparten esto). Vive acá (no en maintenance-requests.service.ts,
 * que sí importa Prisma/pg) para que los componentes cliente que solo
 * necesitan esta función pura puedan importarla sin arrastrar el cliente de
 * base de datos al bundle del navegador.
 */
export function getBucketStatValue(stats: DashboardStats, bucket: EstadoBucket): number {
  return stats[BUCKET_STATS_KEY[bucket]];
}

/** Días transcurridos desde `date` hasta ahora (0 si es hoy). */
export function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Texto relativo tipo "hace 2 h" / "hace 3 d", para timestamps reales. */
export function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "hace instantes";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays} d`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `hace ${diffMonths} mes${diffMonths === 1 ? "" : "es"}`;

  const diffYears = Math.floor(diffMonths / 12);
  return `hace ${diffYears} año${diffYears === 1 ? "" : "s"}`;
}
