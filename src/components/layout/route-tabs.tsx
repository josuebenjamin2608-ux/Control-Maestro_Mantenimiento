"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface RouteTab {
  label: string;
  href: string;
  available: boolean;
}

/**
 * Barra de pestañas respaldada por rutas reales (no estado de cliente):
 * cada pestaña navega a su propia página. Estilo visual calcado de
 * TabsList/TabsTrigger (ui/tabs.tsx), que en cambio usa Radix y estado
 * interno — no aplicable aquí porque cada "tab" es una ruta distinta.
 */
export function RouteTabs({ tabs }: { tabs: RouteTab[] }) {
  const pathname = usePathname();

  return (
    <div className="inline-flex h-9 w-fit items-center gap-1 rounded-md bg-secondary p-1 text-secondary-foreground">
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.href || (tab.href !== "/" && pathname.startsWith(`${tab.href}/`));

        if (!tab.available) {
          return (
            <span
              key={tab.href}
              title="Próximamente"
              className="flex cursor-not-allowed items-center rounded-sm px-3 py-1 text-sm font-medium text-muted-foreground/40"
            >
              {tab.label}
            </span>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center rounded-sm px-3 py-1 text-sm font-medium transition-colors",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
