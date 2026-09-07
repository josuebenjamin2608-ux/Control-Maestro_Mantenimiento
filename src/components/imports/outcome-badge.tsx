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

export function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Badge variant={OUTCOME_VARIANTS[outcome] ?? "outline"}>
      {OUTCOME_LABELS[outcome] ?? outcome}
    </Badge>
  );
}
