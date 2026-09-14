import { CircleUserRound, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { RefreshButton } from "@/components/layout/refresh-button";
import { formatRelativeTime } from "@/lib/estado";
import {
  getHeaderStatus,
  getNotifications,
} from "@/server/services/maintenance-requests.service";

function EnvironmentBadge() {
  // VERCEL_ENV solo existe en despliegues de Vercel; en local/otros entornos
  // queda undefined, lo cual mostramos honestamente como "desarrollo".
  const env = process.env.VERCEL_ENV;
  const label =
    env === "production"
      ? "Producción"
      : env === "preview"
        ? "Vista previa"
        : "Entorno de desarrollo";

  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <ShieldCheck className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  );
}

export async function Header({ title }: { title: string }) {
  const [{ lastUpdateAt }, notifications] = await Promise.all([
    getHeaderStatus(),
    getNotifications(),
  ]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        <div className="flex min-w-0 flex-col leading-tight">
          <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">
            {title}
          </h1>
          <span className="truncate text-xs text-muted-foreground">
            Última actualización:{" "}
            {lastUpdateAt ? formatRelativeTime(lastUpdateAt) : "sin datos importados"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <RefreshButton />
        <NotificationsBell notifications={notifications} />
        <EnvironmentBadge />
        <span
          className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground lg:flex"
          title="Este sistema todavía no cuenta con autenticación de usuarios"
        >
          <CircleUserRound className="size-4" />
          Sin sesión
        </span>
      </div>
    </header>
  );
}
