"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/lib/navigation";

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Factory className="size-4.5" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">SIMI</span>
        <span className="text-xs text-sidebar-foreground/60">
          Sistema Inteligente de Mantenimiento
        </span>
      </div>
    </div>
  );
}

/**
 * Solo lista items con `available: true` — los "Próximamente" (Máquinas,
 * Órdenes de trabajo, Mantenimiento preventivo, Inventario y repuestos,
 * Historial, Configuración, Ayuda) quedan ocultos del menú por completo en
 * vez de mostrarse deshabilitados. `NAV_GROUPS` conserva esas entradas tal
 * cual (nunca se borran del código) — esto es puramente de presentación.
 * Un grupo entero se omite si ninguno de sus items está disponible (evita
 * un encabezado de sección sin nada debajo, como pasaría con el grupo sin
 * label que hoy solo tiene Configuración/Ayuda).
 */
export function SidebarNavList() {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-2">
      {NAV_GROUPS.map((group, index) => {
        const availableItems = group.items.filter((item) => item.available);
        if (availableItems.length === 0) return null;

        return (
          <div key={group.label ?? `group-${index}`} className="flex flex-col gap-1">
            {group.label ? (
              <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {group.label}
              </h2>
            ) : null}
            <ul className="flex flex-col gap-1">
              {availableItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function Sidebar({ className }: { className?: string }) {
  return (
    <nav
      className={cn(
        "flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <SidebarBrand />
      <Separator className="bg-sidebar-border" />
      <SidebarNavList />
    </nav>
  );
}
