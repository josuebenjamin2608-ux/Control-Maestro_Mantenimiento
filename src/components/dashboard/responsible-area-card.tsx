import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RESPONSIBLE_AREA_UNDEFINED_LABEL, RESPONSIBLE_AREA_LABELS } from "@/lib/responsible-area";
import type { ResponsibleAreaSummary } from "@/server/services/maintenance-requests.service";

const ROWS: { key: keyof ResponsibleAreaSummary; label: string; dotClass: string }[] = [
  { key: "mantenimiento", label: RESPONSIBLE_AREA_LABELS.MANTENIMIENTO, dotClass: "bg-primary" },
  { key: "produccion", label: RESPONSIBLE_AREA_LABELS.PRODUCCION, dotClass: "bg-warning" },
  { key: "sinDefinir", label: RESPONSIBLE_AREA_UNDEFINED_LABEL, dotClass: "bg-muted-foreground" },
];

/** Solicitudes abiertas (ESTADO != Realizado) agrupadas por área responsable. */
export function ResponsibleAreaCard({ summary }: { summary: ResponsibleAreaSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Solicitudes abiertas por responsable</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={`size-2 rounded-full ${row.dotClass}`} />
              {row.label}
            </span>
            <span className="font-medium text-foreground">{summary[row.key]}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
