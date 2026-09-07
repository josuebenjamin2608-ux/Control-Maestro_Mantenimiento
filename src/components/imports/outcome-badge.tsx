import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const OUTCOME_LABELS: Record<string, string> = {
  NEW: "Nueva",
  MODIFIED: "Modificada",
  UNCHANGED: "Sin cambios",
  ERROR: "Error",
  ALREADY_EXISTS: "Ya existía",
  RELATED: "Relacionada",
  PENDING: "Pendiente de relación",
  UNRELATED: "Sin PARTE",
};

const OUTCOME_VARIANTS: Record<string, BadgeVariant> = {
  NEW: "success",
  MODIFIED: "warning",
  UNCHANGED: "secondary",
  ERROR: "destructive",
  ALREADY_EXISTS: "secondary",
  RELATED: "success",
  PENDING: "warning",
  UNRELATED: "outline",
};

/**
 * `historical` overrides the UNRELATED label/variant: a historical minuta
 * without relation is an expected, permanent state ("histórica sin
 * relación"), not the same thing as a new minuta still waiting for its
 * PARTE to appear ("pendiente de relación") — they must read differently
 * even though both are technically UNRELATED under the hood.
 */
export function OutcomeBadge({
  outcome,
  historical = false,
}: {
  outcome: string;
  historical?: boolean;
}) {
  const label =
    historical && outcome === "UNRELATED" ? "Histórica sin relación" : (OUTCOME_LABELS[outcome] ?? outcome);
  return <Badge variant={OUTCOME_VARIANTS[outcome] ?? "outline"}>{label}</Badge>;
}

/** General historical/nueva distinction, independent of relation status. */
export function HistoricalBadge({ isHistorical }: { isHistorical: boolean }) {
  return isHistorical ? (
    <Badge variant="outline">Histórico</Badge>
  ) : (
    <Badge variant="secondary">Nueva importación</Badge>
  );
}
