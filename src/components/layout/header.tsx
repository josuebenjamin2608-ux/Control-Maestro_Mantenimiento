import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/layout/mobile-nav";

export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <MobileNav />
        <h1 className="text-sm font-semibold text-foreground sm:text-base">
          {title}
        </h1>
      </div>

      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Entorno de desarrollo
      </Badge>
    </header>
  );
}
