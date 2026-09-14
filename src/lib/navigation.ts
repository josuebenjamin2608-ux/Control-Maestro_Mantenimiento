import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CircleHelp,
  ClipboardList,
  Factory,
  FileText,
  History,
  LayoutDashboard,
  Package,
  Settings,
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

export interface NavGroup {
  /** null = grupo principal, sin encabezado visible. */
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
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
    ],
  },
  {
    label: "Mantenimiento",
    items: [
      {
        title: "Máquinas",
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
        available: true,
      },
      {
        title: "Inventario y repuestos",
        description: "Stock y movimientos de almacén",
        href: "/inventario",
        icon: Package,
        available: false,
      },
    ],
  },
  {
    label: "Análisis",
    items: [
      {
        title: "Historial",
        description: "Registro histórico de intervenciones",
        href: "/historial",
        icon: History,
        available: false,
      },
      {
        title: "Indicadores",
        description: "Indicadores calculados a partir de Solicitudes",
        href: "/indicadores",
        icon: BarChart3,
        available: true,
      },
    ],
  },
  {
    label: null,
    items: [
      {
        title: "Configuración",
        description: "Preferencias del sistema",
        href: "/configuracion",
        icon: Settings,
        available: false,
      },
      {
        title: "Ayuda",
        description: "Guías y soporte",
        href: "/ayuda",
        icon: CircleHelp,
        available: false,
      },
    ],
  },
];

/** Vista plana de todos los items, para pantallas que no necesitan agrupar. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
