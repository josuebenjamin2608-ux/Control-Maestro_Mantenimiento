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

/**
 * ESTADO es texto libre proveniente del Excel importado — el sistema no
 * define un enum propio para este campo (ver prisma/schema.prisma). Esta
 * función solo clasifica ese texto REAL en un color/categoría visual
 * mediante palabras clave conocidas del vocabulario de mantenimiento; nunca
 * inventa ni reemplaza el valor original (`label` siempre es el texto tal
 * cual vino del archivo). Un texto que no coincide con ningún patrón cae en
 * "otro", mostrado tal cual con estilo neutro.
 */
export function classifyEstado(estado: string | null | undefined): EstadoClassification {
  const raw = estado?.trim();
  if (!raw) {
    return { bucket: "otro", label: "Sin estado", variant: "outline" };
  }

  const normalized = stripDiacritics(raw.toLowerCase());

  if (/atendid|realizad|complet|cerrad|finaliz/.test(normalized)) {
    return { bucket: "atendida", label: raw, variant: "success" };
  }
  if (/espera/.test(normalized)) {
    return { bucket: "espera", label: raw, variant: "warning" };
  }
  if (/programa|ejecucion|en proceso|en progreso/.test(normalized)) {
    return { bucket: "programada", label: raw, variant: "default" };
  }
  if (/pendient/.test(normalized)) {
    return { bucket: "pendiente", label: raw, variant: "destructive" };
  }
  return { bucket: "otro", label: raw, variant: "outline" };
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
