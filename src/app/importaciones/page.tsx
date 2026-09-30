import { AppShell } from "@/components/layout/app-shell";
import { ImportHistoryTable } from "@/components/imports/import-history-table";
import { MinutasImportPanel } from "@/components/imports/minutas-import-panel";
import { SolicitudesImportPanel } from "@/components/imports/solicitudes-import-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listImportBatches } from "@/server/services/maintenance-requests.service";

// Consulta la base de datos (historial de importaciones): debe resolverse en
// cada request, no se puede pre-renderizar en build.
export const dynamic = "force-dynamic";

export default async function ImportacionesPage() {
  const batches = await listImportBatches();

  return (
    <AppShell title="Importaciones">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">
            Importar Solicitudes y Minutas
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada archivo se procesa de forma independiente. El sistema muestra una
            previsualización antes de aplicar cualquier cambio en la base de datos.
          </p>
        </div>

        <Tabs defaultValue="solicitudes">
          <TabsList>
            <TabsTrigger value="solicitudes">Solicitudes</TabsTrigger>
            <TabsTrigger value="minutas">Minutas</TabsTrigger>
          </TabsList>
          <TabsContent value="solicitudes" className="pt-4">
            <SolicitudesImportPanel />
          </TabsContent>
          <TabsContent value="minutas" className="pt-4">
            <MinutasImportPanel />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>Historial de importaciones</CardTitle>
            <CardDescription>
              Registro trazable de cada archivo procesado, en orden cronológico.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportHistoryTable batches={batches} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
