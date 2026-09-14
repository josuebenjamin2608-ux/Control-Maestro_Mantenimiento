import { Badge } from "@/components/ui/badge";
import { classifyEstado } from "@/lib/estado";

export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const { label, variant } = classifyEstado(estado);
  return <Badge variant={variant}>{label}</Badge>;
}
