import type { Metadata } from "next";
import { Maven_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";

const mavenPro = Maven_Pro({
  variable: "--font-maven-pro",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIMI · Sistema Inteligente de Mantenimiento de INDUCARTON",
  description:
    "Sistema de gestión de mantenimiento industrial (CMMS): activos, órdenes de trabajo, mantenimiento preventivo y correctivo, inventario e indicadores.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${mavenPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
