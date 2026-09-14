"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/estado";
import type { NotificationItem } from "@/server/services/maintenance-requests.service";

/**
 * Panel de notificaciones reales (import batches + asignaciones de
 * técnico), no decorativo. `notifications` llega ya calculada desde el
 * servidor (Header es async) — este componente solo maneja el
 * abrir/cerrar del panel.
 */
export function NotificationsBell({ notifications }: { notifications: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const hasNotifications = notifications.length > 0;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative text-muted-foreground"
        aria-label={hasNotifications ? `Notificaciones (${notifications.length})` : "Notificaciones: sin novedades"}
        title={hasNotifications ? `${notifications.length} notificación(es)` : "Sin notificaciones nuevas"}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-4" />
        {hasNotifications ? (
          <span className="absolute right-1 top-1 flex size-2 rounded-full bg-destructive" />
        ) : null}
      </Button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar notificaciones"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-md border border-border bg-card shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Sin notificaciones nuevas.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {notifications.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-0.5 px-4 py-3 text-sm hover:bg-secondary/50"
                      >
                        <span
                          className={
                            item.type === "import_error" ? "text-destructive" : "text-foreground"
                          }
                        >
                          {item.message}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.detail ? `${item.detail} · ` : ""}
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
