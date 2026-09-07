import Link from "next/link";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";

// Esta página consulta la base de datos (novedades de importación); no se
// puede pre-renderizar estáticamente en build (no hay DB disponible en ese
// paso), debe resolverse en cada request.
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/navigation";
import { getLatestNovedades } from "@/server/services/maintenance-requests.service";

function NovedadStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-secondary/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-foreground">{value}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const modulesEnPreparacion = NAV_ITEMS.filter((item) => item.href !== "/" && !item.available);
  const { latestRequestBatch, latestLogBatch } = await getLatestNovedades();

  return (
    <AppShell title="Panel de control">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">
            Control Maestro Mantenimiento
          </h2>
          <p className="text-sm text-muted-foreground">
            Motor de importación de Solicitudes y Minutas activo. El resto de los
            módulos de gestión se habilitarán progresivamente.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="size-4 text-success" />
              Estado de la fase actual
            </CardTitle>
            <CardDescription>
              Next.js, Tailwind CSS, shadcn/ui, el esquema base de Prisma y el motor
              de importación de Solicitudes/Minutas (Fase 2) quedaron configurados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href="/importaciones"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <UploadCloud className="size-4" />
              Importar un archivo
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              href="/solicitudes"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <FileText className="size-4" />
              Ver solicitudes
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Novedades</CardTitle>
            <CardDescription>Resultado de la última importación de cada tipo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Solicitudes
              </h4>
              {latestRequestBatch ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NovedadStat label="Nuevas" value={latestRequestBatch.newCount ?? 0} />
                  <NovedadStat label="Modificadas" value={latestRequestBatch.modifiedCount ?? 0} />
                  <NovedadStat label="Sin cambios" value={latestRequestBatch.unchangedCount ?? 0} />
                  <NovedadStat label="Errores" value={latestRequestBatch.errorCount} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Todavía no se ha importado ningún archivo.</p>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Minutas
              </h4>
              {latestLogBatch ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NovedadStat label="Nuevas" value={latestLogBatch.newCount ?? 0} />
                  <NovedadStat label="Sin relación" value={latestLogBatch.pendingCount ?? 0} />
                  <NovedadStat label="Ya existían" value={latestLogBatch.alreadyExistsCount ?? 0} />
                  <NovedadStat label="Errores" value={latestLogBatch.errorCount} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Todavía no se ha importado ningún archivo.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Módulos previstos
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modulesEnPreparacion.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.href}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                        <Icon className="size-4.5" />
                      </span>
                      <Badge variant="outline" className="text-muted-foreground">
                        Próximamente
                      </Badge>
                    </div>
                    <CardTitle className="pt-2 text-base font-semibold text-foreground">
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
