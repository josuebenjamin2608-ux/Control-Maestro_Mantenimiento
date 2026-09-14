import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMinutasSummary } from "@/server/services/maintenance-requests.service";

export async function MinutasSummaryCard() {
  const summary = await getMinutasSummary();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-foreground">Resumen de Minutas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total registradas</span>
          <span className="font-medium text-foreground">{summary.total}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Relacionadas</span>
          <span className="font-medium text-success">{summary.related}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pendientes de relación</span>
          <span className="font-medium text-warning">{summary.pending}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Sin PARTE / históricas</span>
          <span className="font-medium text-foreground">{summary.unrelated}</span>
        </div>
      </CardContent>
    </Card>
  );
}
