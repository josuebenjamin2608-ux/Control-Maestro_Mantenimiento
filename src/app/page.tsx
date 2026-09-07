import { CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NAV_ITEMS } from "@/lib/navigation";

export default function DashboardPage() {
  const modules = NAV_ITEMS.filter((item) => item.href !== "/");

  return (
    <AppShell title="Panel de control">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-foreground">
            Control Maestro Mantenimiento
          </h2>
          <p className="text-sm text-muted-foreground">
            Base del sistema inicializada. Los módulos de gestión se
            habilitarán progresivamente en las siguientes fases del proyecto.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="size-4 text-success" />
              Estado de la fase actual
            </CardTitle>
            <CardDescription>
              Next.js, Tailwind CSS, shadcn/ui y el esquema base de Prisma
              quedaron configurados. Aún no hay datos operativos: los módulos
              se conectarán a la base de datos en las próximas fases.
            </CardDescription>
          </CardHeader>
        </Card>

        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Módulos previstos
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((item) => {
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
