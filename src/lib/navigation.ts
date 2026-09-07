import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  Package,
  UploadCloud,
  Users,
  Wrench,
} from "lucide-react";

export interface NavItem {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Routes not yet implemented are listed for context but are not navigable. */
  available: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Panel de control",
    description: "Vista general del sistema",
    href: "/",
    icon: LayoutDashboard,
    available: true,
  },
  {
    title: "Solicitudes",
    description: "Registro de solicitudes y su historial de minutas",
    href: "/solicitudes",
    icon: FileText,
    available: true,
  },
  {
    title: "Importaciones",
    description: "Cargar y conciliar archivos de Solicitudes y Minutas",
    href: "/importaciones",
    icon: UploadCloud,
    available: true,
  },
  {
    title: "Máquinas y activos",
    description: "Inventario de equipos industriales",
    href: "/maquinas",
    icon: Factory,
    available: false,
  },
  {
    title: "Órdenes de trabajo",
    description: "Mantenimiento correctivo, averías y reformas",
    href: "/ordenes",
    icon: ClipboardList,
    available: false,
  },
  {
    title: "Mantenimiento preventivo",
    description: "Planes y programación periódica",
    href: "/preventivo",
    icon: Wrench,
    available: false,
  },
  {
    title: "Técnicos",
    description: "Equipo de mantenimiento",
    href: "/tecnicos",
    icon: Users,
    available: false,
  },
  {
    title: "Inventario y repuestos",
    description: "Stock y movimientos de almacén",
    href: "/inventario",
    icon: Package,
    available: false,
  },
  {
    title: "Historial",
    description: "Registro histórico de intervenciones",
    href: "/historial",
    icon: History,
    available: false,
  },
  {
    title: "Indicadores",
    description: "KPIs de mantenimiento",
    href: "/indicadores",
    icon: BarChart3,
    available: false,
  },
];
