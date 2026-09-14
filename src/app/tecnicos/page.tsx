import { AppShell } from "@/components/layout/app-shell";
import { TechniciansManager } from "@/components/tecnicos/technicians-manager";
import { Card, CardContent } from "@/components/ui/card";
import { listAllTechnicians } from "@/server/services/technicians.service";

// Consulta la base de datos: debe resolverse en cada request, no se puede
// pre-renderizar en build.
export const dynamic = "force-dynamic";

export default async function TecnicosPage() {
  const technicians = await listAllTechnicians();

  return (
    <AppShell title="Técnicos">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">Equipo de mantenimiento</h2>
          <p className="text-sm text-muted-foreground">
            Catálogo de técnicos disponibles para asignar a Solicitudes.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <TechniciansManager technicians={technicians} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
