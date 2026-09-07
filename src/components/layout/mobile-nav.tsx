"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarBrand, SidebarNavList } from "@/components/layout/sidebar";

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>Menú de navegación</SheetTitle>
        <SidebarBrand />
        <Separator className="bg-sidebar-border" />
        <SidebarNavList />
      </SheetContent>
    </Sheet>
  );
}
